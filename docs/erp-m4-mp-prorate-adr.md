# ADR — Prorrateo MP TN-first (M4.2c)

**Estado:** Aprobado  
**Fecha:** 2026-06-18  
**Contexto:** M4.2b cerró allocations comerciales TN-only (828/2716). Payments MP sync (695 filas) enlaza órdenes TN con remito ERP, no TN-only.

## Fuente de verdad

| Campo orden | Fuente |
|-------------|--------|
| `mp_neto_real_orden` | `payments.mp_neto_real_orden` = MP API `net_received_amount` |
| `mp_fee_total` | `payments.mp_fee_total_real` (`mercadopago_fee`) |
| `mp_tax_total` | `payments.mp_tax_total_real` |
| `mp_financing_cost` | `payments.mp_financing_total_real` |
| `mp_platform_fee` | `payments.mp_platform_fee_total_real` (cost, no validación separada) |

## Grain

- Peso prorrateo: `tn_order_item_allocations.gross_unit_amount`
- Persistencia: columnas MP en `tn_order_item_allocations` (misma fila comercial M4.2b)
- Prerequisito: commercial allocation (M4.2a/b) por unidad

## Motor

1. `resolveMpAllocationPools(payment)` — pools cabecera
2. `allocateTnOrderMp(payment, commercialRows)` — 5 pools independientes en centavos:
   - tax, financing, fee, platform → cost components
   - `mp_neto_real_orden` → `neto_prenda_real` (TN-first: API net es autoridad, no `neto_prenda − cost`)
3. `allocateProportionalCents` — cierre exacto por pool (floor + remainder)

## Validaciones (hard gate pilot)

| ID | Regla |
|----|-------|
| V-M1 | Σ `mp_fee_allocated_real` = `mp_fee_total` |
| V-M2 | Σ `mp_tax_allocated_real` = `mp_tax_total` |
| V-M3 | Σ `mp_financing_allocated_real` = `mp_financing_total` |
| V-M4 | Σ `neto_prenda_real` = `mp_neto_real_orden` |

Tolerancia: ±$0.01

## Cobertura esperada

| Universo | Órdenes | Notas |
|----------|---------|-------|
| TN-only M4.2b | 828 | **0** con `payments` link hoy |
| Payment + units | 695 | Elegible M4.2c (pilot + backfill futuro) |
| Pilot M4.2c | 25 | Subset payment+units; `ensureCommercial` crea commercial si falta |

## No alcance

- Stock (M4.5)
- GAS / `app/api/erp/*`
- Live import
- Backfill MP completo 695 (solo pilot en M4.2c)
