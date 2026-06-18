# M4.5d — Stock Ledger Grain Normalization

**Estado:** Cerrado — GO_WITH_WARNINGS en M4.9  
**Fecha:** 2026-06-18  
**Depende:** M4.5c backfill, M4.8c snapshot T0, M4.9 sanity audit

## Problema (M4.9)

Snapshot T0 usa grain `sku_base + talle` (normalización M4.8b.2).  
Stock ledger M4.5c escribía `sku_variant + talle` → 920 keys huérfanas y qty negativa en projection.

| Métrica (pre-M4.5d) | Valor |
|---|---|
| Projection rows | 3.823 (+920 huérfanas) |
| Grain mismatch movements | 2.716 / 2.716 |
| Negative qty variants | 920 |
| M5 recommendation | **NO_GO** |

## Solución

Helper puro: `lib/erp/v2/normalize-stock-movement-grain.ts`

```
SH0249-S + talle S  →  sku=SH0249, talle=S
AC-101-MO-S           →  sku=AC-101-MO, talle=S
```

Talles válidos: XS, S, M, L, XL, XXL, XXXL.  
Comparaciones de audit/write usan `.trim()` para evitar edge cases (`HJ121 ` con espacio trailing).

## Write path

`services/erp-v2-stock-ledger.ts` — `buildSaleDrafts` + upsert create/update.

## Re-backfill post-T0

Script: `npm run m4:stock:ledger:normalize-grain` (dry-run)  
Script: `ERP_V2_DB_WRITE=true npm run m4:stock:ledger:normalize-grain -- --write`

Scope seguro:
- `source = m4_stock_ledger`
- `movement_type = sale`
- `created_at >= T0`
- TN-only (`erp_order` ausente)
- No toca snapshot T0
- Idempotente (segunda ejecución: `updated: 0`, `unchanged: 2716`)

## Ejecución

| Paso | Resultado |
|---|---|
| Dry-run | 2.716 movements necesitaban normalización; `snapshotKeyMissAfterNormalize: 0` |
| Write (1ª pasada) | 2.716 updated; 2 edge cases con espacio trailing en SKU |
| Write (2ª pasada) | 0 updated; `needsNormalization: 0` |
| `npm run build` | PASS |
| `npm run l1:verify:db` | PASS |
| `npm run m4:inventory:projection:sanity` | **GO_WITH_WARNINGS** |

## Resultado post-M4.5d

| Métrica | Valor |
|---|---|
| Projection rows | 2.903 (= snapshot grain) |
| Snapshot qty | 8.708.653 |
| Ledger delta | -2.716 |
| Projected qty | 8.705.937 |
| Checksum T0 | MATCH |
| Fórmula global | PASS |
| Grain mismatch | **0** |
| Negative qty | **0** |
| Orphan rows | **0** |
| V-I4 | PASS |
| M5 recommendation | **GO_WITH_WARNINGS** |

Warnings remanentes (no blockers):
- Cluster qty=3000 en snapshot (69% de top anomalies)
- SKU malformado `` `CZ0251`` en snapshot fuente STOCK MAESTRO

## Criterio aceptación

- [x] `needsNormalization = 0` post-write
- [x] `negativeQtyVariants = 0`
- [x] `orphanMovementRows = 0`
- [x] `projection rows = 2903`
- [x] Checksum T0 MATCH
- [x] V-I4 PASS
- [x] M4.9 `blockerCount = 0`

## Verificación

```bash
npm run m4:inventory:projection:sanity
```

M5 Live Import: desbloqueado con **GO_WITH_WARNINGS** (warnings de snapshot fuente, no de grain ledger).
