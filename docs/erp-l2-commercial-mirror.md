# L2.1 — Espejo comercial Tiendanube (ERP V2)

**Marca:** 8CHOQ · **Sprint:** L2.1 · **Estado:** staging only

---

## Principio rector

```
Tiendanube (tn_orders)     = verdad comercial
ERP V2 (erp_orders)        = enriquecimiento operativo (remito, MP, netos)
```

- Ventas, facturación, estados comerciales y KPIs → **solo** `tn_orders`.
- Remitos, prorrateos, MP, owner → `erp_orders` (capa B).
- **Nunca** usar `erp_orders.estado` como estado comercial visible.

---

## Endpoints v2 (read-only)

| Ruta | Grain | Fuente principal |
|------|-------|------------------|
| `GET /api/v2/orders` | TN-led | `tn_orders` LEFT JOIN `erp_orders` |
| `GET /api/v2/remitos` | ERP-led (shadow B) | `erp_orders` + TN para `commercialStatus` |

Legacy intacto: `/api/erp/*` → Apps Script.

---

## Gates de seguridad

Requisitos para responder 200:

1. `ERP_V2_DB_READ=true`
2. `DATABASE_URL` → staging (`*.neon.tech`, PGlite local, etc.)
3. URL **no** debe coincidir con: `topaz-iota`, `vercel.app`, `prod`, `production`

Sin gate → **503** con mensaje explícito.

---

## `commercialStatus` (solo TN)

| Valor | Condición |
|-------|-----------|
| `activo` | `payment_status` ∈ paid/authorized y no cancelada |
| `cancelado` | `status` cancelled o `cancelled_at` set |
| `reembolsado` | `payment_status` ∈ refunded/voided |
| `pendiente` | resto |

Implementación: `lib/erp/v2/tn-commercial-status.ts`

---

## KPIs comerciales (período)

Alineado con L1 verify:

- Filtro fecha: `tn_created_at` en rango ART (`from`/`to` YYYY-MM-DD)
- Solo órdenes con `tn_analytics_counted = true`
- `tn_total` **sin recalcular** — valor persistido en sync L1

Query param `kpi=1` (default cuando hay `from`+`to`).

---

## Shadow B — comparación GAS

```bash
npm run l2:compare:remitos
```

Compara `listRemitosFull` (GAS) vs `erp_orders` (Neon) por:

- conteo IDs remito
- IDs solo en GAS / solo en Neon
- delta `total_final` (tolerancia $0.01)

Reporte: `_wip/l2-compare-remitos.json`

---

## Fuera de alcance L2.1

- UI / `ErpRemitosDashboard`
- Deploy prod
- Escritura DB desde API
- Prorrateos / recálculo netos
- Cortar GAS

---

## Validación

```bash
npm run l1:verify:db          # baseline KPIs Neon
npm run l2:compare:remitos    # paridad remitos GAS vs Neon
curl "/api/v2/orders?from=2026-04-01&to=2026-04-30&kpi=1"
```

Conteos abril/mayo/jun deben coincidir con verify L1.
