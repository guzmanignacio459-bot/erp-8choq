# ADR M6.5.2 — Transfer Fee Allocation

**Estado:** Aprobado  
**Depende:** M6.5.1 financial_account_assignments + rate_percent_snapshot

## Decisión de persistencia

**Opción A elegida:** `financial_items.transfer_fee_allocated`

| Criterio | Opción A (columna FI) | Opción B (tabla separada) |
|---|---|---|
| Grain | 1 prenda = 1 fila ✅ | Requiere join extra |
| Dashboard / KPI | Mismo patrón mp/shipping ✅ | Duplica API |
| Auditoría | SUM por origin_id ✅ | SUM tabla hija |
| net_real M6.5.3 | Campo listo para descontar ✅ | Migración extra |

## Fórmula

```text
transfer_fee_order = tn_total × (rate_percent_snapshot / 100)
```

Prorrateo: `allocateProportionalAmounts(transfer_fee_order, grossAmount[])` — patrón M4/M5.

## Restricción M6.5.2

- **NO** modificar `net_amount` / `net_real`
- Solo calcular, persistir, auditar, visualizar
- Descuento en net_real → M6.5.3
