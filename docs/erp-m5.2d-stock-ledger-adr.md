# M5.2d — Stock Ledger Live (post-T0)

**Depende:** M5.2b, M5.2c, motor M4.5b/M4.5c/M4.5d grain

## Pipeline

```
units + commercial (+ MP si aplica) → stock_movements (sale/out)
```

## Scope

- Post-T0, units + commercial completas
- Si hay `mp_api_sync_staging` payment → MP enrich completo
- Sin sale movements existentes (L-S4 create-only)
- `source = m5.2d_stock_ledger_live`
- Grain normalizado (M4.5d)

## Uso

```bash
npm run m5:stock:ledger:live
ERP_V2_DB_WRITE=true npm run m5:stock:ledger:live -- --write
npm run m5:stock:ledger:live -- --idempotency-check
```

Reporte: `_wip/m5.2d-stock-ledger-live-report.json`

## Ejecución (staging Neon)

| Paso | Resultado |
|---|---|
| Pre-audit | 146 órdenes pending, 469 sales esperadas |
| Dry-run | 146 orders, V-S1..V-S6 PASS |
| Write | **469 movements** (`m5.2d_stock_ledger_live`) |
| Projection | V-I4 PASS — delta -3185, projected 8.705.468 |
| Idempotencia | 0 pending, L-S3 PASS |
| `npm run build` | PASS |
| `npm run l1:verify:db` | PASS |

**M5.3 recommendation:** `GO` — pipeline live completo hasta stock ledger.
