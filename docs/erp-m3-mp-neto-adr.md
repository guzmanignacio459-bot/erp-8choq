# ADR — `mp_neto_real_orden` TN-first (M3.1b-3)

**Estado:** Aprobado  
**Fecha:** 2026-05-27  
**Contexto:** Refresh `l1_gas_backfill` → `mp_api_sync_staging`

## Decisión

`payments.mp_neto_real_orden` y `tn_orders.neto_mp_orden` se definen oficialmente como:

```
transaction_details.net_received_amount
```

obtenido desde **Mercado Pago API** (`GET /v1/payments/{id}`).

La API MP es la **fuente de verdad financiera TN-first** en Neon staging.

## Consecuencias

| Aspecto | Comportamiento |
|---------|----------------|
| GAS / REMITOS | Sin cambios — permanece legacy operativo |
| Neon `payments` | Neto puede diferir del valor histórico GAS (`MP_NETO_REAL_ORDEN`) |
| Refresh M3.1b-3 | Deltas neto vs GAS son **esperados**, no bloquean el refresh |
| Validación | **Fees** deben permanecer estables (±$0.01); **neto** se audita, no se exige igualdad con GAS |
| `mp_financing_total_real` | Se enriquece desde MP API (GAS backfill lo dejó `NULL`) |

## Diferencia observada GAS vs MP API

En muestras de staging (abr–jun 2026):

- **Fees (`mercadopago_fee`):** coinciden GAS ↔ MP API en ~100% de casos.
- **Neto:** ~100% de filas cambian al sincronizar; delta típico menor al monto de financiación.
- **Financiación:** GAS no persistía el campo; MP API sí lo reporta en cuotas.
- **Impuestos:** ambos en 0 en el universo actual AR.

GAS calculaba/almacenaba un neto operativo distinto al `net_received_amount` oficial de MP.  
Eso no invalida el backfill L1 — fue un puente histórico — pero **no es la definición TN-first vigente**.

## No alcance

- No modificar `app-script/erp-8q.gs`
- No modificar `app/api/erp/*`
- No escribir en producción
