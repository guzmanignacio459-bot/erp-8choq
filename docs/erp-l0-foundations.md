# Sprint L0 — Fundaciones DB ERP 8Q v2

**Estado:** Schema dual TN/ERP + scripts read-only GAS  
**Doc modelo completo:** [`erp-l1-data-model.md`](./erp-l1-data-model.md)

---

## Objetivo corregido (FASE L)

| Capa | Rol | KPIs |
|------|-----|------|
| **A) Tiendanube** (`tn_orders`) | Universo ventas/facturación = panel TN | Ventas, facturación, órdenes paid |
| **B) ERP** (`erp_orders`) | Remito, prorrateo, MP, netos, stock, owner | Neto real, rentabilidad, stock |

El dashboard v2 **no** mostrará solo remitos ERP para ventas — replicará TN primero, luego capa ERP para operación.

---

## Schema Prisma (`prisma/schema.prisma`)

### A) Fuente Tiendanube
- `TnOrder` — `tn_orders`
- `TnOrderItem` — `tn_order_items`

### B) Procesamiento ERP
- `ErpOrder` — `erp_orders` (ex-remito)
- `ErpOrderItem` — `erp_order_items`
- `Payment` — MP
- `StockMovement` — stock (stub L1)
- `Customer`, `ImportLog`

### Enums
- `ErpProcessingStatus` — pipeline import
- `TnErpReconciliationStatus` — `aligned` \| `tn_only_pending_erp` \| `erp_only_not_in_panel` \| …

---

## Scripts L0 (solo capa B hoy)

```bash
npm run l0:backfill    # GAS → JSON (erp_orders + items)
npm run l0:reconcile   # JSON vs baselines + erpParity prod API
npm run prisma:validate
```

El backfill **no** sincroniza TN API todavía (L1b). JSON incluye clave `erpOrders` (+ alias `orders`).

---

## Reconciliación histórica (referencia ERP operativo)

| Período | JSON L0 | vs prod analytics | vs baseline “saneado” |
|---------|---------|-------------------|------------------------|
| Abril | 359 / $49.491.775 | PASS | −1 ord (cancelada) |
| Mayo | 464 / $58.098.798 | PASS | −11 ord (dup pre-E.1) |
| Jun 01–08 | 94 / $12.489.601 | PASS | PASS |

En L1, baselines de **ventas** se compararán contra `tn_orders`; baselines de **neto** contra `erp_orders`.

---

## Próximos pasos L1

1. `prisma migrate` en Neon staging
2. Sync TN API → `tn_orders` + `raw_tn_payload`
3. Upsert GAS JSON → `erp_orders`
4. `l1-reconcile-tn-erp.mjs` → `reconciliation_status`
5. `/api/v2/analytics`: KPI ventas desde TN, netos desde ERP

---

## Sin impacto prod

- No `DATABASE_URL` en deploy
- No cambios `app/api/erp/*`
- No GAS / MP / live import
