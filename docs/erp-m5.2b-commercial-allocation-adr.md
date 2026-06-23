# M5.2b — Commercial Allocations Live (post-T0)

**Estado:** Implementado  
**Depende:** M5.2a (`89aee6e`), motor M4.2a/M4.2b

## Pipeline

```
tn_orders → tn_order_items → tn_order_item_units → tn_order_item_allocations
```

## Scope

- Post-T0: `synced_at >= T0` OR `tn_paid_at >= T0`
- Units completas: `SUM(qty) = COUNT(units)`
- Sin allocations existentes (L-C4 create-only)
- Excluye `cancelado` / `reembolsado`

## Motor

Reutiliza `allocateTnOrderCommercial` + `validateTnCommercialAllocations`  
`source = m5.2b_commercial_allocation`

## Guards

Sin units, MP, stock_movements, snapshot, GAS, prod.

## Uso

```bash
npm run m5:alloc:commercial:live
ERP_V2_DB_WRITE=true npm run m5:alloc:commercial:live -- --write
npm run m5:alloc:commercial:live -- --idempotency-check
```

Reporte: `_wip/m5.2b-commercial-allocation-live-report.json`

## Ejecución (staging Neon)

| Paso | Resultado |
|---|---|
| Pre-audit | 167 post-T0, 119 pending, 369 allocations expected |
| Dry-run | 119 orders, 369 units, V-C1..V-C6 PASS |
| Write | 369 allocations creadas (`m5.2b_commercial_allocation`) |
| Idempotencia | 0 pending, 0 nuevas allocations |
| `npm run build` | PASS |
| `npm run l1:verify:db` | PASS |

**M5.2c recommendation:** `GO` — listo para MP allocations o stock ledger live.
