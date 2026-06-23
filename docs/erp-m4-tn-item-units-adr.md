# ADR M4.0 / M4.1 — `tn_order_item_units` (grain unitario TN-first)

**Estado:** Aprobado  
**Alcance:** staging Neon / PGlite · **Prod / GAS:** sin cambios

---

## Contexto (M4.0)

- `tn_order_items` guarda líneas TN con `quantity` agregada (L1 sync).
- GAS `REMITO_ITEMS` y stock operan en grain **1 prenda = 1 fila**.
- Allocations, MP por línea y `stock_movements` requieren grain unitario.
- **828 órdenes TN sin remito** son prioridad backfill (M4.7 ERP paridad después).

## Decisiones M4.0 (aprobadas)

| Tema | Decisión |
|------|----------|
| Grain | Tabla hija `tn_order_item_units` — **no modificar** `tn_order_items` |
| Stock | Solo `stock_movements` — **sin** `stock_inventory` |
| Backfill | Prioridad TN-only (828) · ERP 917 en M4.7 |
| Rentabilidad M4 | Ingreso neto post-MP · COGS/margen fuera de alcance |

---

## Decisión M4.1

Introducir `tn_order_item_units` como **grain operativo** ecommerce:

```
tn_orders
  └── tn_order_items (línea TN, quantity agregada — inmutable en M4)
        └── tn_order_item_units (N filas si quantity=N)
```

### Campos clave

| Campo | Uso |
|-------|-----|
| `unit_index` | 0..quantity-1 por línea |
| `unit_price` | Copia de `tn_order_items.unit_price` |
| `sku` / `talle` / `owner` | Parseo SKU (paridad import-orders) |
| `is_gifty` / `is_stockable` | GIFTY no deduce stock |
| `parse_warnings` | SKU sin talle válido, etc. |
| `source` | `m4_unit_expand` |

### Unique

`@@unique([tnOrderItemId, unitIndex])` — idempotencia expansión.

---

## Estrategia expansión qty → units

1. Leer `tn_order_items` (staging).
2. Por cada línea con `quantity = N`:
   - Crear N registros `unit_index` 0..N-1.
   - `unit_price` = línea.`unit_price` (no prorratear `line_total`).
3. Parsear SKU:
   - Sufijo `-SCNL` → owner SCNL
   - Último segmento en `{XS..XXXL}` → talle
   - `GIFTY` → `is_gifty=true`, `is_stockable=false`, talle `UNICO`
4. Línea sin talle válido: **igual crea unidad** con `parse_warnings` (no bloquea batch).
5. Re-run: `deleteMany` por `tn_order_item_id` + recreate, o skip si ya existe N unidades.

**Script:** `npm run m4:expand:units` (`--tn-only` | `--write`).

---

## Cobertura esperada (Neon staging, jun 2026)

| Universo | Órdenes | Líneas | Unidades esperadas |
|----------|---------|--------|-------------------|
| Global | 1,745 | 5,528 | **5,640** |
| TN-only (prioridad) | **828** | 2,665 | **2,716** |
| Con ERP (M4.7) | 917 | ~2,863 | ~2,924 |

Delta líneas→unidades: **+112** (109 líneas multi-qty + GIFTY).

---

## Validaciones M4.1

| Check | Criterio |
|-------|----------|
| Cardinalidad | `COUNT(units) = SUM(tn_order_items.quantity)` por scope |
| Unique | Sin duplicados `(tn_order_item_id, unit_index)` |
| GIFTY | 2 líneas → unidades `is_gifty=true`, `is_stockable=false` |
| Multi-qty | 109 líneas con qty>1 → Σ unit_index+1 = quantity |
| TN-only pilot | 828 órdenes expandibles sin remito |
| Warnings | Reporte SKUs sin talle — no fail batch |

---

## Impacto en allocations (M4.2+)

| Hoy | M4.2 objetivo |
|-----|---------------|
| `tn_order_item_allocations` 1:1 con **línea** | **1:1 con unidad** (`tn_order_item_unit_id`) |
| Prorrateo GAS por precio unitario × filas | Mismo peso = `unit_price` por unidad |
| `@@unique([tnOrderItemId])` | Migrar a `@@unique([tnOrderItemUnitId])` |

M4.1 **no** escribe allocations — solo habilita grain.

---

## Impacto en stock (M4.5+)

| Hoy | M4.5 objetivo |
|-----|---------------|
| `stock_movements` vacío | `direction=out` por unidad stockable |
| Sin `stock_inventory` | Ledger append-only; SSOT cantidades sigue STOCK MAESTRO |
| FK opcional | `stock_movements.tn_order_item_unit_id` (añadido M4.1) |

Regla: 1 movimiento `quantity=1` por `tn_order_item_unit` stockable (paridad GAS).

---

## Impacto MP / rentabilidad

- MP cabecera (M3) no cambia en M4.1.
- Prorrateo MP a línea (M4.3) usará **unidades** como pesos.
- Rentabilidad orden = `Σ neto_prenda_real` por unidad (M4.6).

---

## Fuera de alcance M4.1

- GAS / `app-script/*`
- `app/api/erp/*` prod
- Live import TN → remito
- `stock_inventory`
- Allocations / stock writes
- Backfill ERP paridad (M4.7)

---

## Referencias

- [erp-m0-tn-first-adr.md](./erp-m0-tn-first-adr.md)
- [erp-m3-mp-neto-adr.md](./erp-m3-mp-neto-adr.md)
- `lib/erp/v2/expand-tn-order-item-units.ts`
- `npm run m4:db:push` · `npm run m4:expand:units`
