# M5.2a — Unit Expansion Live (post-T0)

**Estado:** Implementado  
**Fecha:** 2026-06-18  
**Depende:** M5.1 (`7060ea9`), T0 snapshot activo

## Pipeline

```
tn_orders (post-T0)
  → tn_order_items
  → tn_order_item_units
```

## Scope

- Órdenes con `synced_at >= T0` OR `tn_paid_at >= T0`
- Solo líneas con `COUNT(units) < quantity`
- Insert missing units only (`skipDuplicates`) — no delete/recreate
- `unit_key` = `{tnOrderItemId}:{unitIndex}` (paridad `@@unique`)

## Guards

- Sin `tn_order_item_allocations`
- Sin `stock_movements`
- Sin snapshot T0

## Uso

```bash
npm run m5:unit:expand:live
ERP_V2_DB_WRITE=true npm run m5:unit:expand:live -- --write
```

Reporte: `_wip/m5.2a-unit-expansion-report.json`

## Validación

- `SUM(units) = SUM(item.qty)` en órdenes post-T0
- Segunda corrida: `expectedNewUnits = 0`

## M5.2b gate

- **GO** — expansión + paridad OK, idempotente
- **GO_WITH_WARNINGS** — parse warnings en SKUs
- **NO_GO** — paridad fail o guards violados

## Ejecución (staging Neon)

| Paso | Resultado |
|---|---|
| Dry-run | 302 líneas pendientes, 313 units esperadas |
| Write | 313 units creadas, paridad **545/545 PASS** |
| Idempotencia | 0 pending, 0 nuevas units |
| `npm run build` | PASS |
| `npm run l1:verify:db` | PASS |

**M5.2b recommendation:** `GO` — listo para commercial allocations live.
