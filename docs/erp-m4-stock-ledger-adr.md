# ADR M4.5 — Stock Ledger TN-first (`stock_movements`)

**Estado:** Aprobado (diseño) · **Implementación:** pendiente  
**Fecha:** 2026-06-18  
**Alcance:** staging Neon / PGlite · **Prod / GAS / STOCK MAESTRO:** sin cambios en M4.5

---

## Contexto

| Hito | Estado staging |
|------|----------------|
| M4.1 `tn_order_item_units` | 5.640 units (828 TN-only + 917 con ERP) |
| M4.2b commercial TN-only | 828 órdenes / 2.716 units allocated |
| M4.2c MP backfill | 695 órdenes / 2.257 units (`mp_api_sync_staging`) |
| `stock_movements` | **0 filas** |
| `stock_deducted_at` (cabecera TN) | **0 órdenes** |

Principio heredado M0/M4: **ledger append-only en Neon**; **STOCK MAESTRO (Sheets) sigue SSOT de cantidades** hasta fase posterior explícita.

---

## 1. Auditoría — estado actual `stock_movements`

### Schema existente (M1/M4.1 stub)

```prisma
model StockMovement {
  id                String   @id @default(cuid())
  tnOrderId         String?
  tnOrderItemId     String?   // denorm
  tnOrderItemUnitId String?   // grain M4.1 — FK opcional
  erpOrderId        String?
  erpOrderItemId    String?
  sku               String
  talle             String?
  quantity          Int
  direction         String    // out | in | adjust  (string libre hoy)
  reason            String?
  source            String    @default("pending_engine")
  createdAt         DateTime
}
```

| Campo | Estado | Nota |
|-------|--------|------|
| `tn_order_item_unit_id` | FK staging ✓ | Añadido M4.1 |
| `direction` | string libre | Sin enum Prisma |
| `reason` | nullable | Sin taxonomía fija |
| Índice unique idempotencia | **ausente** | Requerido M4.5 |
| `movement_type` | **ausente** | Propuesto abajo |

### Conteos Neon (jun 2026)

| Métrica | Valor |
|---------|-------|
| `stock_movements` | **0** |
| Units totales | 5.640 |
| Units stockable | 5.636 |
| GIFTY (`is_stockable=false`) | 4 |
| TN-only stockable | 2.716 |
| Con ERP stockable | 2.920 |
| Órdenes con commercial alloc | 1.523 |
| Órdenes con MP alloc | 695 |

---

## 2. Dependencias ERP legacy

### GAS / STOCK MAESTRO (prod — **no tocar M4.5**)

| Función GAS | Comportamiento |
|-------------|----------------|
| `adjustStockForItems(items, sign)` | Escribe celdas talle en STOCK MAESTRO; `sign=-1` venta, `+1` devolución |
| `saveRemito` (estado Pagado) | Deduce stock agregado por SKU (no grain unitario en sheet) |
| `updateRemitoEstado` | Pagado→Anulado revierte stock |
| Reglas | Skip GIFTY; exige talle válido; bloquea stock negativo |

**Implicación:** Las **917 órdenes TN con remito ERP** ya tuvieron deducción GAS al pasar remito a **Pagado**. Un backfill Neon `direction=out` para esas órdenes es **registro paralelo de auditoría**, no debe re-escribir STOCK MAESTRO.

### Next.js legacy (`app/api/erp/*`, `app/api/remitos/*`)

| Ruta | Rol | Impacto M4.5 |
|------|-----|--------------|
| `GET /api/remitos/stock` | Lee STOCK MAESTRO (Sheets) | Sin cambios |
| `POST /api/tiendanube/.../import-orders` | Crea remito GAS + deduce stock | **Fuera de alcance** (live import pausado) |
| `app/api/erp/*` | Read legacy remitos | Sin cambios |

### Polimorfismo staging

`stock_movements` acepta `tn_order_id` **o** `erp_order_id`. M4.5 prioriza **TN-first**: grain = `tn_order_item_unit_id`, con `tn_order_id` denorm obligatorio para ecommerce.

---

## 3. Diseño ledger TN-first

### Principios

1. **Append-only** — sin UPDATE/DELETE de movimientos; correcciones = movimiento compensatorio (`return` / `manual_adjustment`).
2. **Ledger, no inventario** — no tabla `stock_inventory`; saldo materializado = fase M4.8+.
3. **1 prenda = 1 movimiento** — `quantity=1` por `tn_order_item_unit` stockable (paridad GAS unitario en REMITO_ITEMS).
4. **Fuente operativa** — `tn_order_item_units` (`sku`, `talle`, `owner`, `is_stockable`).
5. **Enriquecimiento opcional** — `tn_order_item_allocations` para `owner` / `neto_prenda_real` en reporting; **no bloquea** stock si falta alloc.
6. **STOCK MAESTRO intacto** — M4.5 solo persiste Neon; push a Sheets = M4.9+ con aprobación.

### Flujo objetivo

```
tn_order_item_units (is_stockable=true)
        │
        ▼
  stock engine M4.5
        │
        ▼
stock_movements (append)
        │
        ▼
tn_orders.stock_deducted_at  (cabecera, post-batch)
```

### Tipos de movimiento

| `movement_type` | `direction` | `reason` (denorm) | Trigger TN-first |
|-----------------|-------------|-------------------|------------------|
| `sale` | `out` | `tn_order_paid` | Orden TN elegible + unidad stockable |
| `return` | `in` | `tn_order_cancelled` / `tn_order_refunded` | Compensación append-only |
| `manual_adjustment` | `adjust` | `manual_*` | Operaciones internas / corrección (M5+) |

**Nota:** `direction` se mantiene por compatibilidad M1; `movement_type` es la taxonomía canónica M4.5.

### Idempotencia

Unique parcial propuesto:

```sql
UNIQUE (tn_order_item_unit_id, movement_type)
WHERE tn_order_item_unit_id IS NOT NULL AND movement_type = 'sale'
```

Re-runs de backfill no duplican ventas. `return` permite múltiples entradas si hay varias anulaciones parciales (futuro); pilot usa 1:1.

### Elegibilidad `sale` (staging backfill)

| Criterio | Regla |
|----------|-------|
| Unidad | `is_stockable = true` |
| SKU | No GIFTY; `sku` + `talle` presentes |
| Orden | `tn_payment_status` paid **o** `commercial_status` cerrado (definir gate en M4.5b) |
| Commercial | Allocation existe (M4.2b TN-only ✓); MP **no** requerido para stock |
| Duplicado | Sin `sale` previo para mismo `tn_order_item_unit_id` |

---

## 4. Relaciones grain

```
tn_orders (1)
  ├── tn_order_item_units (N)     ← fuente stock
  │     └── stock_movements (0..1 sale por unit)
  └── tn_order_item_allocations (N) ← owner/netos; denorm opcional en movement
```

| Relación | Cardinalidad | Obligatorio |
|----------|--------------|-------------|
| unit → movement `sale` | 0..1 | `tn_order_item_unit_id` FK |
| movement → order | N:1 | `tn_order_id` denorm |
| movement → allocation | lógica | Mismo `tn_order_item_unit_id`; no FK directa |
| movement → erp_order | opcional | Solo si existe link legacy (M4.7) |

**GIFTY / non-stockable:** 4 units globales → **0 movimientos** (paridad `isGiftySku_` GAS).

---

## 5. Validaciones (gates)

| ID | Regla | Gate |
|----|-------|------|
| **V-S1** | Máx. 1 `sale` por `tn_order_item_unit_id` | Hard |
| **V-S2** | `quantity = 1` en grain unitario | Hard |
| **V-S3** | `is_stockable=false` → 0 movimientos | Hard |
| **V-S4** | `sku` + `talle` no vacíos en movement | Hard |
| **V-S5** | `sku`/`talle` = unit origen | Hard |
| **V-S6** | Post-backfill: `COUNT(sale)` = stockable units en scope | Hard |
| **V-S7** | `stock_deducted_at` set iff all stockable units tienen `sale` | Soft audit |
| **V-S8** | No movimiento si `parse_warnings` crítico (SKU sin talle) — configurable pilot | Soft → hard en backfill |

Tolerancia cantidades: exacta (enteros).

---

## 6. Backfill esperado — universo actual

### Scope recomendado M4.5c (primario)

| Universo | Órdenes | Units stockable | Movimientos `sale` esperados | Notas |
|----------|---------|-----------------|------------------------------|-------|
| **TN-only** (sin ERP) | 828 | **2.716** | **2.716** | Stock **nunca** deducido vía GAS remito |
| Commercial alloc | 828 | 2.716 | ✓ prereq cumplido | M4.2b |

### Scope secundario (M4.5d — auditoría, no STOCK MAESTRO)

| Universo | Órdenes | Units stockable | Riesgo |
|----------|---------|-----------------|--------|
| TN + ERP (917) | 917 | 2.920 | GAS ya dedujo; ledger Neon = espejo reconciliación |
| Overlap MP+ERP | 695 | 2.257 | Idem |

### Fuera de backfill M4.5

- Escritura STOCK MAESTRO
- Órdenes cancelled sin política `return` definida
- Units sin talle válido (revisar 5.640 con `parse_warnings` — gate V-S8)

### Cobertura objetivo por fase

| Fase | Target |
|------|--------|
| M4.5b pilot | 25 órdenes TN-only / ~units stockable |
| M4.5c backfill | 828 órdenes / **2.716** sales |
| M4.5d (opcional) | 917 mirror sin touch Sheets |

---

## 7. Schema requerido (M4.5a — antes de engine)

### Cambios Prisma propuestos

```prisma
enum StockMovementType {
  sale
  return
  manual_adjustment
}

enum StockMovementDirection {
  out
  in
  adjust
}

model StockMovement {
  // ... campos existentes ...
  movementType      StockMovementType      @map("movement_type")
  direction         StockMovementDirection // reemplazar String
  owner             String?                // denorm 8Q | SCNL
  idempotencyKey    String? @unique @map("idempotency_key")
  // idempotencyKey = `${tn_order_item_unit_id}:sale` 
  source            String @default("m4_stock_ledger")
  correlationId     String? @map("correlation_id") // batch backfill
  compensatesId     String? @map("compensates_id")  // return → sale id
}
```

### Índices

- `@@unique([tnOrderItemUnitId, movementType])` — solo `sale` (partial en SQL migration)
- `@@index([movementType])`
- `@@index([correlationId])`

### Sin cambios

- No crear `stock_inventory`
- No modificar `tn_order_item_units` / `tn_order_item_allocations`

---

## 8. Roadmap implementación

| Fase | Entregable | Dependencias |
|------|------------|--------------|
| **M4.5a** ✓ (este ADR) | ADR + schema migration + gates doc | M4.1 units |
| **M4.5b** | `resolve-stock-eligibility.ts`, `record-tn-stock-sale.ts`, `validate-tn-stock-movements.ts`, pilot 25 TN-only | M4.2b commercial |
| **M4.5c** | Backfill TN-only 2.716 sales; `stock_deducted_at` | M4.5b PASS |
| **M4.5d** | Mirror ledger órdenes con ERP (opcional, audit-only) | Política anti-doble-deducción Sheets |
| **M4.8** | Proyección `stock_inventory` desde ledger | Fuera M4.5 |
| **M4.9** | Sync ledger → STOCK MAESTRO (1-way, aprobación prod) | GAS parity review |

### Archivos previstos (M4.5b+)

| Área | Path |
|------|------|
| Elegibilidad | `lib/erp/v2/resolve-stock-unit-eligibility.ts` |
| Motor sale | `lib/erp/v2/record-tn-stock-movements.ts` |
| Validación | `lib/erp/v2/validate-tn-stock-movements.ts` |
| Servicio | `services/erp-v2-stock-ledger.ts` |
| API staging | `POST /api/v2/stock/ledger` |
| Pilot | `scripts/m4-stock-ledger-pilot.ts` |
| Backfill | `scripts/m4-stock-ledger-backfill.ts` |

---

## 9. Riesgos

| Riesgo | Severidad | Mitigación |
|--------|-----------|------------|
| **Doble deducción** con GAS en órdenes con ERP | Alta | M4.5c solo TN-only; M4.5d audit-only sin Sheets |
| **5.640 units con `parse_warnings`** | Media | V-S8; reporte SKUs sin talle; no bloquear batch global |
| **SKU ausente en STOCK MAESTRO** | Media | Ledger Neon no valida existencia en Sheets en M4.5 |
| **Stock negativo** (si luego sync Sheets) | Alta | Validar saldo solo en fase M4.9; ledger permite registro |
| **Cancelaciones TN sin `return`** | Media | M4.5c solo `sale`; returns en M4.5e |
| **Desalineación alloc ↔ unit** | Baja | Stock no depende de MP/commercial; solo unit grain |
| **828 TN-only sin fulfillment status** | Media | Gate por `tn_paid_at` + `tn_payment_status` en pilot |

---

## 10. No alcance M4.5

- Implementación engine / writes
- `stock_inventory`
- Escritura STOCK MAESTRO / GAS
- `app/api/erp/*`
- Live import TN → remito
- Producción
- Dashboard stock definitivo

---

## Referencias

- [erp-m0-tn-first-adr.md](./erp-m0-tn-first-adr.md)
- [erp-m4-tn-item-units-adr.md](./erp-m4-tn-item-units-adr.md)
- [erp-m4-mp-prorate-adr.md](./erp-m4-mp-prorate-adr.md)
- `app-script/erp-8q.gs` — `adjustStockForItems`
- `prisma/schema.prisma` — `StockMovement`, `TnOrder.stockDeductedAt`
