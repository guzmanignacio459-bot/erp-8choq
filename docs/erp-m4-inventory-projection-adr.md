# ADR M4.8 — Inventory Snapshot + Inventory Projection (TN-first)

**Estado:** Aprobado (diseño) · **Implementación:** pendiente  
**Fecha:** 2026-06-18  
**Alcance:** staging Neon / PGlite · **Prod / GAS / live import:** sin cambios en M4.8

---

## Decisión arquitectónica definitiva

ERP V2 **no reconstruye inventario histórico**.

| Enfoque | Veredicto |
|---------|-----------|
| `stock_TN_actual − ventas_históricas` | **Rechazado** — incorrecto |
| Inferir stock del 9-jun con stock TN de hoy | **Rechazado** |
| Replay completo de ventas 2024–2026 sobre ledger vacío | **Rechazado** |
| **Snapshot inicial validado + ledger posterior** | **Aprobado** |

**Rationale:** STOCK MAESTRO fue la fuente histórica real, con múltiples ajustes manuales no trazados en TN. Cualquier retro-inferencia desde Tiendanube o ventas TN introduce error sistemático. ERP V2 declara un **punto cero** explícito y proyecta solo hacia adelante.

### Cadena objetivo

```
STOCK MAESTRO (bootstrap único, read-only)
        ↓
inventory_snapshots  ← punto cero ERP V2
        +
stock_movements      ← ledger append-only (M4.5+)
        ↓
inventory_projection ← stock proyectado por SKU+talle
        ↓
Operación TN-first (M5 live import)
```

**Sheets / GAS:** legacy temporal. Tras bootstrap, **Neon es SSOT operativo**; Sheets no se consulta en runtime de proyección (V-I6).

---

## Contexto ERP V2 (jun 2026)

| Hito | Estado staging |
|------|----------------|
| M4.1 units | 5.640 (2.716 TN-only stockable) |
| M4.2b commercial | 828 / 2.716 |
| M4.2c MP | 695 / 2.257 |
| M4.5b stock pilot | **101** `sale` movements (25 TN-only órdenes) |
| `inventory_snapshots` | **no existe** |
| `stock_movements` post-pilot | 101 filas `source=m4_stock_ledger` |

**Nota temporal:** El snapshot debe tomarse **antes o al mismo instante** que se congela el ledger operativo. Movimientos con `created_at < snapshot_date` no entran en la proyección (o se excluyen por política de corte documentada).

---

## 1. Auditoría — estado actual inventario

### Fuentes legacy

| Fuente | Rol hoy | Rol post-M4.8 |
|--------|---------|---------------|
| **STOCK MAESTRO** (Sheets) | SSOT cantidades prod/GAS | **Bootstrap único** → snapshot |
| **GAS `adjustStockForItems`** | Escribe celdas talle | Legacy — no invocado por ERP V2 |
| **`GET /api/remitos/stock`** | Read Sheets dashboard | Legacy read — no projection engine |
| **`stock_movements` Neon** | Ledger piloto 101 sales | SSOT **delta** post-snapshot |
| **Tiendanube API stock** | Catálogo TN | **No** usado para inventario ERP V2 |

### STOCK MAESTRO — estructura (GAS)

Grilla por fila SKU:

| Columna | Uso |
|---------|-----|
| `SKU` | Clave fila (uppercase) |
| `ARTICULO` | Denorm nombre |
| `XS`…`XXXL` | Cantidad por talle |
| `Stock Total` | Suma talles (denorm) |

Talles válidos: `XS, S, M, L, XL, XXL, XXXL` (paridad `VALID_STOCK_SIZES` GAS / `parseTnSku`).

Owner: inferido de sufijo `-SCNL` en SKU; default `8Q`.

### Gap identificado

- No existe tabla de snapshot en Neon.
- No existe servicio de proyección.
- Ledger piloto (101) es subconjunto; **M4.5c** backfill (2.716) debe coordinarse con **fecha de snapshot** para no double-count.

---

## 2. Entidad `inventory_snapshots`

### Schema propuesto (M4.8a — sin migrar aún)

```prisma
/// Cabecera de corrida bootstrap — metadata punto cero
model InventorySnapshotRun {
  id              String   @id @default(cuid())
  snapshotDate    DateTime @map("snapshot_date")  // instante T0 declarado
  label           String   // ej. "bootstrap-2026-06-18"
  source          String   @default("stock_maestro_bootstrap")
  rowCount        Int      @default(0) @map("row_count")
  importedAt      DateTime @default(now()) @map("imported_at")
  importedBy      String?  @map("imported_by")  // script / operator
  checksumSha256  String?  @map("checksum_sha256")
  notes           String?

  lines InventorySnapshotLine[]

  @@unique([snapshotDate, source])
  @@map("inventory_snapshot_runs")
}

/// Línea snapshot — grain SKU + talle (+ owner)
model InventorySnapshotLine {
  id           String   @id @default(cuid())
  runId        String   @map("run_id")
  snapshotDate DateTime @map("snapshot_date")  // denorm desde run
  sku          String
  talle        String
  owner        String   @default("8Q")  // 8Q | SCNL
  quantity     Int
  source       String   @default("stock_maestro_bootstrap")
  createdAt    DateTime @default(now()) @map("created_at")

  run InventorySnapshotRun @relation(fields: [runId], references: [id], onDelete: Cascade)

  @@unique([runId, sku, talle, owner])
  @@index([sku, talle])
  @@index([snapshotDate])
  @@map("inventory_snapshot_lines")
}
```

**Alternativa simplificada** (si se prefiere tabla única sin run):

```prisma
model InventorySnapshot {
  id           String   @id @default(cuid())
  snapshotDate DateTime @map("snapshot_date")
  sku          String
  talle        String
  owner        String   @default("8Q")
  quantity     Int
  source       String   @default("stock_maestro_bootstrap")
  createdAt    DateTime @default(now()) @map("created_at")

  @@unique([snapshotDate, sku, talle, owner])
  @@index([sku, talle])
  @@map("inventory_snapshots")
}
```

**Recomendación:** modelo **Run + Lines** para auditoría bootstrap (checksum, row_count, re-import idempotente).

### Reglas snapshot

1. Solo filas con `quantity > 0` **o** incluir ceros para trazabilidad completa (decisión M4.8b: **incluir todos** SKU+talle con celda definida).
2. Unpivot: 1 fila STOCK MAESTRO → hasta 7 líneas `(sku, talle, qty)`.
3. `snapshot_date` = timestamp acordado de corte (documentado en run `notes`).
4. **Un solo run activo** por entorno staging (`is_active` flag opcional en Run).

---

## 3. Servicio `inventory_projection`

### Principio

Por cada `(sku, talle, owner)`:

```
stock_proyectado = snapshot_quantity
                 + Σ entradas_post_T0
                 − Σ salidas_post_T0
```

Donde `T0 = snapshot_date` del run activo.

### Clasificación movimientos (`stock_movements`)

| `movement_type` | `direction` | Efecto proyección |
|-----------------|-------------|-------------------|
| `sale` | `out` | **−quantity** |
| `return` | `in` | **+quantity** |
| `manual_adjustment` | `adjust` | **±quantity** (signo en `quantity`: positivo=entrada, negativo=salida) |

**Filtro temporal:** solo movimientos con `created_at >= snapshot_date` y `source = m4_stock_ledger`.

### API interna propuesta

```typescript
// lib/erp/v2/compute-inventory-projection.ts

type ProjectionKey = { sku: string; talle: string; owner: string };

type ProjectionRow = ProjectionKey & {
  snapshotQty: number;
  inQty: number;
  outQty: number;
  adjustQty: number;
  projectedQty: number;
};

function computeInventoryProjection(opts: {
  snapshotRunId: string;
  asOf?: Date;           // default now
  skuFilter?: string;
}): ProjectionRow[];

function computeProjectionForKey(
  key: ProjectionKey,
  snapshotRunId: string,
  asOf?: Date
): number;
```

### Servicio

```typescript
// services/erp-v2-inventory-projection.ts

export async function getActiveSnapshotRun(): Promise<InventorySnapshotRun | null>;
export async function projectInventory(opts): Promise<ProjectionReport>;
export async function validateProjectionVsLedger(scope): Promise<ValidationReport>;
```

### Grain de proyección

- **Primario:** `sku + talle + owner`
- Alineado con ledger M4.5 (`stock_movements.sku`, `talle`, `owner`)
- No grain unitario — proyección es **agregado inventario**, no REMITO_ITEMS

### Materialización (opcional M4.8c)

Tabla `inventory_projection_cache` — **fuera de M4.8 diseño inicial**. M4.8b calcula on-read; cache en M4.8d si performance lo requiere.

---

## 4. Estrategia bootstrap STOCK MAESTRO

### Proceso (M4.8b — implementación futura)

```
┌─────────────────────────────────────────────────────────┐
│ 1. EXPORT (read-only)                                   │
│    Google Sheets API → STOCK MAESTRO!A:J               │
│    o snapshot JSON via GET /api/remitos/stock (staging) │
├─────────────────────────────────────────────────────────┤
│ 2. TRANSFORM                                            │
│    Por fila SKU:                                        │
│      owner = sku.endsWith('-SCNL') ? 'SCNL' : '8Q'     │
│      por talle in [XS..XXXL]:                           │
│        qty = cell value                                 │
│        emit line if qty != 0 OR include_zeros policy    │
├─────────────────────────────────────────────────────────┤
│ 3. VALIDATE (pre-import)                                │
│    V-I1: no dupes (sku,talle,owner)                     │
│    V-I2: talle in VALID_SIZES, sku non-empty            │
│    checksum SHA256 del payload                          │
├─────────────────────────────────────────────────────────┤
│ 4. IMPORT Neon (staging gate)                           │
│    INSERT inventory_snapshot_run + lines                │
│    Declarar T0 en notes + exported JSON artifact       │
├─────────────────────────────────────────────────────────┤
│ 5. FREEZE DECLARATION                                   │
│    Documento: "T0 = {ISO instant}"                      │
│    Ledger: solo movimientos created_at >= T0 cuentan   │
└─────────────────────────────────────────────────────────┘
```

### Script previsto

`scripts/m4-inventory-snapshot-bootstrap.mjs` (M4.8b)

- `--dry-run` — validación + stats sin write
- `--write` — persist Neon (`ERP_V2_DB_WRITE=true`)
- Artefacto: `_wip/m4-inventory-snapshot-bootstrap.json`

### Coordinación con M4.5c

| Orden recomendado | Acción |
|-------------------|--------|
| **A** (recomendado) | Bootstrap snapshot T0 → luego M4.5c backfill sales con `created_at >= T0` |
| B | M4.5c completo → snapshot T0 = now → proyección solo ventas futuras |

Opción **A** evita que las 101 sales piloto queden **antes** de T0 (excluidas de proyección) o **después** (contadas). Requiere **re-etiquetar** o re-importar pilot si T0 es posterior al pilot.

---

## 5. Validaciones V-I1..V-I6

| ID | Regla | Gate |
|----|-------|------|
| **V-I1** | Snapshot sin duplicados `(run_id, sku, talle, owner)` | Hard |
| **V-I2** | SKU no vacío; talle ∈ `{XS…XXXL}`; owner ∈ `{8Q, SCNL}` | Hard |
| **V-I3** | Proyección en T0+ε = snapshot (ledger vacío post-T0) | Hard |
| **V-I4** | Proyección = snapshot + ledger delta (recompute vs agregado SQL) | Hard |
| **V-I5** | Cero lecturas de stock Tiendanube en projection path | Hard (audit estático) |
| **V-I6** | Cero lecturas Sheets/GAS en projection runtime post-bootstrap | Hard (audit estático) |

### V-I4 — algoritmo reconciliación

```sql
-- Por (sku, talle, owner):
projected = s.quantity
  + SUM(CASE WHEN m.direction='in' THEN m.quantity ELSE 0 END)
  - SUM(CASE WHEN m.direction='out' THEN m.quantity ELSE 0 END)
  + SUM(CASE WHEN m.movement_type='manual_adjustment' THEN m.quantity ELSE 0 END)
WHERE m.created_at >= :snapshot_date
```

Comparar con `computeInventoryProjection()` — delta = 0.

---

## 6. Riesgos

| Riesgo | Severidad | Mitigación |
|--------|-----------|------------|
| **Snapshot desalineado con STOCK MAESTRO** (ajuste manual entre export e import) | Alta | Export+import atómico; checksum; ventana corta |
| **T0 vs pilot 101 sales** (movimientos fuera de ventana) | Alta | Coordinar orden bootstrap/backfill; política `created_at` |
| **Doble universo** (GAS ya dedujo + ledger Neon sale) | Media | Proyección Neon independiente; no sync Sheets; TN-only primero |
| **SKU en ventas sin línea snapshot** | Media | Projection report `orphan_keys`; gate soft M4.8b |
| **SCNL owner mismatch** | Media | Normalizar owner desde SKU en bootstrap y ledger |
| **Stock negativo proyectado** | Baja | Reportar; no bloquear M4.8; política M5 |
| **Re-bootstrap** invalida proyección histórica | Media | Versionar runs; solo un `is_active`; ADR lock T0 |

---

## 7. Roadmap implementación

| Fase | Entregable | Writes | Dependencias |
|------|------------|--------|--------------|
| **M4.8a** ✓ | Este ADR + schema design | No | M4.5 ADR |
| **M4.8b** | Schema migration `inventory_snapshot_*` + bootstrap script dry-run | Read Sheets | M4.8a |
| **M4.8c** | Bootstrap write staging + declaración T0 + artefacto checksum | Sí (snapshot) | M4.8b PASS |
| **M4.8d** | `compute-inventory-projection.ts` + `erp-v2-inventory-projection.ts` | No | M4.8c + ledger |
| **M4.8e** | Pilot proyección 25 SKU + V-I3..V-I6 report | No | M4.8d |
| **M4.5c** | Backfill ledger 2.716 sales (post-T0) | Sí (ledger) | T0 declarado |
| **M4.8f** | Proyección global staging + dashboard stub | Read | M4.5c + M4.8c |
| **M5** | Live import TN → ledger → projection | Sí | M4.8f PASS |

### Archivos previstos (M4.8b+)

| Path | Rol |
|------|-----|
| `lib/erp/v2/unpivot-stock-maestro.ts` | Grid → lines |
| `lib/erp/v2/compute-inventory-projection.ts` | Motor proyección |
| `lib/erp/v2/validate-inventory-projection.ts` | V-I1..V-I6 |
| `services/erp-v2-inventory-snapshot.ts` | Bootstrap persist |
| `services/erp-v2-inventory-projection.ts` | Query API |
| `scripts/m4-inventory-snapshot-bootstrap.mjs` | Export + import |
| `scripts/m4-inventory-projection-pilot.ts` | Pilot V-I |

---

## 8. No alcance M4.8 (diseño)

- Migraciones / writes Neon
- `stock_inventory` materializado
- Sync bidireccional Sheets
- Reconstrucción histórica pre-T0
- Tiendanube stock API
- GAS / `app/api/erp/*` / producción / live import
- Dashboard UI definitivo

---

## 9. Relación con hitos previos

| Hito | Relación M4.8 |
|------|---------------|
| M4.5 ledger | Delta post-T0 en proyección |
| M4.5b pilot 101 | Validar ventana T0 al bootstrap |
| M4.2 allocations | Sin dependencia directa |
| M4.1 units | Ledger grain unitario; projection grain SKU+talle |
| ADR M4.5 SSOT Sheets | **Supersedido** post-bootstrap por Neon projection |

---

## Referencias

- [erp-m4-stock-ledger-adr.md](./erp-m4-stock-ledger-adr.md)
- [erp-m4-tn-item-units-adr.md](./erp-m4-tn-item-units-adr.md)
- [erp-m0-tn-first-adr.md](./erp-m0-tn-first-adr.md)
- `app-script/erp-8q.gs` — `ensureStockHeadersGrid_`, `adjustStockForItems`
- `app/api/remitos/stock/route.ts`
- `_wip/m4-stock-ledger-pilot.json`
