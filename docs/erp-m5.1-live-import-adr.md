# M5.1 — Incremental Live Import (TN → Neon)

**Estado:** Implementado  
**Fecha:** 2026-06-18  
**Depende:** M4 CLOSED, M4.9 GO_WITH_WARNINGS, commit `3ecfe92`

## Objetivo

Import incremental desde Tiendanube hacia Neon staging usando watermark `updated_at`.
Sin tocar snapshot T0 ni stock ledger (M5.2).

## Componentes

| Pieza | Path |
|---|---|
| Watermark scope | `m5_tn_orders_incremental` en `sync_state` |
| TN client | `lib/erp/v2/tn-api-client.ts` — `updated_at_min` |
| Mapper | `lib/erp/v2/map-tn-order-record.ts` |
| Service | `services/erp-v2-live-import.ts` |
| Script | `scripts/m5-live-import.ts` |

## Watermark

1. Lee `sync_state.watermark_at` si existe.
2. Bootstrap: `max(tn_updated_at)` → `rawTnPayload.updated_at` → T0 snapshot.
3. Query TN con overlap de 5 min (`updated_at_min = watermark - 5m`).
4. Post-write: avanza watermark al `max(updated_at)` importado.

## Clasificación

- `new` — orden no existía en Neon
- `update` — cambio sin cancel/refund
- `cancelacion` — `commercialStatus → cancelado`
- `refund` — `commercialStatus → reembolsado`

## Idempotencia

- `tn_orders.upsert` por `id` (TN order id)
- Items: replace solo si la orden **no** tiene `tn_order_item_units` (protege M4 grain)
- `sync_state.upsert` por `scope`

## Guards (M5.1)

- `stockLedgerTouched: false`
- `snapshotTouched: false`
- Sin expand units / allocations / stock movements

## Uso

```bash
npm run m5:db:push                    # sync_state + tn_updated_at
npm run m5:live:import                # dry-run
ERP_V2_DB_WRITE=true npm run m5:live:import -- --write
```

Reporte: `_wip/m5-live-import-report.json`

## M5.2 gate

Recomendación en reporte `m52Recommendation`:
- **GO** — import OK, sin errores, guards intactos
- **GO_WITH_WARNINGS** — órdenes con units existentes (items skip protected)
- **NO_GO** — errores TN/DB o guards violados

## Ejecución (staging Neon)

| Paso | Resultado |
|---|---|
| `m5:db:push` | 3 statements applied (`sync_state`, `tn_updated_at`) |
| Dry-run inicial | 167 fetched; 96 new / 71 update plan; watermark bootstrap `2026-06-09` |
| Write real | 96 created, 71 updated, 1 cancelación; watermark → `2026-06-18T17:40:10Z` |
| Dry-run post-write | 1 fetched (overlap); idempotente |
| `npm run build` | PASS |
| `npm run l1:verify:db` | PASS (mayo TN 467/468 — +1 orden nueva fuera scope L1 histórico) |
| `tn_orders` | 1.745 → 1.841 (+96) |

**M5.2 recommendation:** `GO_WITH_WARNINGS` — import y watermark OK; pendiente pipeline downstream (expand units + ledger) para órdenes nuevas.
