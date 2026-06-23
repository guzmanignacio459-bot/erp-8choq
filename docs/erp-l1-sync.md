# Sprint L1 — Sync TN + ERP → DB staging

**Modo seguro:** dry-run por defecto; write solo con `L1_ALLOW_WRITE=true` + URL staging.

## Comandos

```bash
# Validación
npm run prisma:validate
npx prisma generate
npm run build

# Dry-run (sin DB) — fetch TN + GAS + reporte
npm run l1:sync

# Staging local
docker compose -f docker-compose.l1.yml up -d
export DATABASE_URL=postgresql://erp8q:erp8q_local@localhost:5433/erp8q_l1_staging
export L1_ALLOW_WRITE=true
npm run l1:db:push
npm run l1:sync:write
```

## Capas pobladas

| Capa | Tablas | Fuente |
|------|--------|--------|
| A | `tn_orders`, `tn_order_items` | TN API read-only |
| B | `erp_orders`, `erp_order_items`, `payments`, `customers` | GAS read-only |

## KPIs

- **Comercial (tn_orders):** `tn_total` + `created_at` ART + `payment_status=paid` (variantes `paidAtArt` / `coalesceArt` en reporte)
- **Operativo (erp_orders):** `total_final_erp`, `neto_operativo`, `erp_order_items`

### Resultado dry-run referencia (2026-06-09)

| Período | TN órdenes / $ | ERP remitos / $ | Reconciliación |
|---------|----------------|-----------------|----------------|
| Abril | 359 / $49.491.775 | 359 / $49.491.775 | **aligned 359** |
| Mayo | 468 / $58.587.576 | 464 / $58.098.798 | aligned 464, **tn_pending 4** |
| Jun 01–08 | 95 / $12.617.019 | 94 / $12.489.601 | aligned 91, tn_pending 4, erp_only 3 |

## Reconciliación

Estados en `erp_orders.reconciliation_status`:

- `aligned`
- `tn_only_pending_erp`
- `erp_only_not_in_panel`
- `mismatch_amount`

Reporte: `_wip/l1-sync-report-*.json`

## Riesgos antes de L2

Ver campo `risksBeforeL2` en el reporte JSON.
