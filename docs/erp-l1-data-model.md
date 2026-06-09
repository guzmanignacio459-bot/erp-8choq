# FASE L — Modelo de datos ERP v2 (TN vs ERP)

**Corrección conceptual (2026-06):** El dashboard y los KPIs de **ventas/facturación** deben alinearse al **universo Tiendanube**. El ERP calcula **después** prorrateo, netos, MP, owner y stock.

---

## Principio rector

```
Tiendanube (fuente reporting)     ERP (motor operativo)
─────────────────────────────     ─────────────────────
tn_total, tn_paid_at, panel    →   total_final_erp, neto_operativo
KPI "Ventas" / "Facturación"        KPI "Neto real" / "Rentabilidad"
```

No colapsar ambas capas en una sola tabla `orders`.

---

## Capas del modelo

### A) Fuente Tiendanube (`tn_orders`, `tn_order_items`)

| Campo | Uso |
|-------|-----|
| `tn_order_id` (PK) | Idempotencia import |
| `tn_created_at` / `tn_paid_at` | Filtros período panel |
| `tn_status` / `tn_payment_status` | paid, cancelled, etc. |
| `tn_total`, `tn_subtotal`, `tn_shipping`, `tn_discount` | KPI ventas = TN |
| `tn_analytics_counted` | ¿Panel TN la incluye en ventas? |
| `tn_reporting_flags` | `{ panelExcluded, reason, boundaryTz }` |
| `raw_tn_payload` | Snapshot API para auditoría |

**Sync L1:** job read-only TN API → upsert `tn_orders` (sin tocar GAS).

### B) Procesamiento ERP (`erp_orders`, `erp_order_items`, `payments`, `stock_movements`)

| Campo | Uso |
|-------|-----|
| `id` (PK) | `ID Remito` |
| `tn_order_id` (FK nullable) | Enlace 1:1 con TN |
| `fecha_erp` | Fecha remito (ART) |
| `total_final_erp` | Total post-import Sheets |
| `neto_operativo` | Neto cabecera post-MP/allocation |
| `processing_status` | `pending_import` \| `imported` \| `manual_no_tn` |
| `reconciliation_status` | Ver tabla abajo |
| Items: `descuento_asignado`, `shipping_asignado`, `neto_prenda`, owner 8Q/SCNL | Prorrateo por prenda |
| `payments` | MP match + netos reales |
| `stock_movements` | Deducción STOCK MAESTRO (L1+) |

**Backfill L0 actual:** solo capa B desde GAS (`l0-backfill-gas-to-json.mjs`). Capa A se agrega en L1.

---

## Trazabilidad (`reconciliation_status`)

| Estado | Significado | Acción UI futura |
|--------|-------------|------------------|
| `aligned` | TN + ERP; montos dentro de tolerancia | Normal |
| `tn_only_pending_erp` | TN paid; sin remito | Cola import |
| `erp_only_not_in_panel` | Remito existe; panel TN no cuenta | Badge + motivo en flags |
| `mismatch_amount` | Ambos existen; `tn_total` ≠ `total_final_erp` | Reconciliación |
| `unknown` | Backfill GAS sin snapshot TN | Resolver en sync L1 |

Reglas de detección (L1 reconcile job):

1. `tn_orders` LEFT JOIN `erp_orders` → `tn_only_pending_erp`
2. `erp_orders` con `tn_order_id` pero `tn_analytics_counted = false` → `erp_only_not_in_panel`
3. Remito manual (`manual_no_tn`) → no afecta KPI TN

---

## KPIs por capa

| KPI dashboard | Fuente | Query base |
|---------------|--------|------------|
| Ventas / facturación período | **TN** | `SUM(tn_total) WHERE tn_analytics_counted AND tn_paid_at IN range` |
| Órdenes importadas | ERP | `COUNT(erp_orders) WHERE processing_status = imported` |
| Pendientes import | Gap | `COUNT(tn_orders) WHERE reconciliation = tn_only_pending_erp` |
| Neto real / MP / rentabilidad | **ERP** | `SUM(neto_operativo)`, `payments.mp_neto_real_orden` |
| Stock / owner split | **ERP** | `erp_order_items`, `stock_movements` |

---

## Migración L0 → L1

| Paso | Descripción |
|------|-------------|
| L0 ✓ | Schema dual + backfill GAS → JSON (solo `erp_*`) |
| L1a | Neon staging + `prisma migrate` |
| L1b | Sync TN API → `tn_orders` (read-only) |
| L1c | Upsert JSON GAS → `erp_orders` / items |
| L1d | Job `l1-reconcile-tn-erp.mjs` → set `reconciliation_status` |
| L1e | Shadow read `/api/v2/analytics` (TN KPIs + ERP netos) |

---

## Mapeo GAS legacy → schema v2

| GAS REMITOS | Modelo v2 |
|-------------|-----------|
| `ID Remito` | `erp_orders.id` |
| `Fecha` | `erp_orders.fecha_erp` |
| `Total Final` | `erp_orders.total_final_erp` |
| `TN_ORDER_ID` | `erp_orders.tn_order_id` → `tn_orders.id` |
| `MP_*` | `payments` |

| GAS REMITO_ITEMS | Modelo v2 |
|------------------|-----------|
| `NETO_PRENDA`, allocations | `erp_order_items` |

---

## Fuera de alcance (sin cambio)

- Dashboard prod (sigue GAS)
- `app/api/erp/*` legacy
- Apps Script
- Live import activo
- Escritura DB prod
