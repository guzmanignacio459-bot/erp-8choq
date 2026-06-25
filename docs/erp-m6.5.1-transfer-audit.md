# M6.5.1 — Auditoría payment_method TRANSFERENCIA (TN staging)

**Fecha:** 2026-06-25  
**Scope:** Órdenes TN pagadas en Neon staging (219 total)

---

## Resumen

| Señal | Resultado |
|---|---|
| `payment_method` denormalizado (columna) | **Vacío en 100%** de órdenes pagadas |
| `payment_gateway` | `mercado-pago` (88), `offline` (15), vacío (116) |
| Transferencias detectables | **43** órdenes |
| MP (excluidas scope M6.5.1) | **176** órdenes |

---

## Evidencia por campo

### 1. Columna `tn_orders.payment_method`

```sql
-- 219 pagadas → 1 valor: '' (219)
```

**Conclusión:** No usar solo la columna denormalizada hoy. El import M5 (`map-tn-order-record.ts`) no popula valores normalizados tipo `TRANSFERENCIA`.

### 2. Columna `tn_orders.payment_gateway`

| Gateway | Pagadas |
|---|---:|
| (vacío) | 116 |
| mercado-pago | 88 |
| offline | 15 |

Transferencias reales usan `gateway=offline` en raw payload; columna puede ser null o `offline`.

### 3. Raw payload — señal confiable

Campo clave: **`raw_tn_payload.gateway_name`**

```
"transferencia o depósito bancario"
```

| Patrón | Órdenes |
|---|---:|
| `gateway_name` contiene transfer/transferencia/depósito/bancario | **43** |
| MP (gateway mercado-pago o raw.gateway mercado) | **176** |
| Otros | **0** |

Ejemplo orden `1979195700` (fase-i custom_transfer):

```json
{
  "payment_details": { "method": "custom" },
  "gateway": "offline",
  "gateway_name": "transferencia o depósito bancario"
}
```

---

## Regla de detección adoptada (M6.5.1)

Implementada en `lib/financial-accounts/is-tn-transfer-order.ts`:

1. **Excluir** MP: `payment_gateway = mercado-pago` o `raw.gateway` contiene `mercado`
2. **Incluir** si:
   - `payment_method` normalizado = `TRANSFERENCIA`, o
   - `raw.gateway_name` contiene: transfer, transferencia, depósito, deposito, bancario, cbu, alias

Alineado a lógica GAS `getMetodoPagoVal()` en `orders-paid/route.ts` (paso 3 normalización).

---

## Nota operativa

TN usa `payment_details.method = custom` para transferencias offline — **custom solo NO es suficiente** (mezclaría efectivo). La discriminante es **`gateway_name`** en esta tienda.

Arquitectura preparada: normalizer extensible por gateway para MP/tarjetas en milestones futuros.
