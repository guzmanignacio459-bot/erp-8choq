# M5.2c — MP Allocations Live (post-T0)

**Depende:** M5.2b (`3a47744`), motor M4.2c / M3.1b

## Pipeline

```
commercial allocations → enrich MP fields (neto_prenda_real, fee, tax, financing)
```

## Scope

- Post-T0 con `payments.source = mp_api_sync_staging`
- Commercial allocations completas
- `neto_prenda_real IS NULL` (sin enrich previo)

## Motor

`allocateTnOrderMp()` + `validateTnMpAllocations()` — sin recalcular reglas.

## Guards

Sin units, commercial create, stock_movements, snapshot, GAS, prod.

## Uso

```bash
npm run m5:alloc:mp:live
ERP_V2_DB_WRITE=true npm run m5:alloc:mp:live -- --write
npm run m5:alloc:mp:live -- --idempotency-check
```

Reporte: `_wip/m5.2c-mp-allocation-live-report.json`

## Ejecución (staging Neon)

| Paso | Resultado |
|---|---|
| Pre-audit | 28 post-T0 con MP payment; **0 pending** (M4.2c ya enrich) |
| Dry-run / Write | 0 órdenes (idempotente — ya cubiertas) |
| Idempotencia | L-M3 PASS |
| `npm run build` | PASS |
| `npm run l1:verify:db` | PASS |

**Nota:** Las 28 órdenes post-T0 con `mp_api_sync_staging` ya tenían `neto_prenda_real` del backfill M4.2c. El pipeline live queda listo para nuevas órdenes tras payment sync.

**M5.2d recommendation:** `GO` — listo para Stock Ledger Live.
