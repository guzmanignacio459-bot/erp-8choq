# ADR M0 — TN-first ecommerce (ERP V2)

**Estado:** Aprobado · **Alcance:** staging Neon / PGlite · **Prod:** sin cambios

---

## Contexto

L0–L2.2 modelaron `erp_orders` (remitos GAS) como compañero obligatorio de cada venta TN.
La reconciliación trataba `tn_only_pending_erp` como gap operativo.

Auditoría junio 2026: 90 ventas TN panel vs 94 remitos ERP — el delta no es bug; refleja que
**ecommerce no requiere remito por venta**.

L2.3 live sync (TN → remito ERP obligatorio) queda **pausado**.

---

## Decisión

1. **`tn_orders` es la entidad principal para ecommerce Tiendanube.**
2. **No se crea `erp_order`/remito obligatorio por cada venta TN.**
3. **`erp_orders` queda reservado para:**
   - ventas manuales
   - mayorista
   - showroom
   - operaciones internas
   - legacy GAS histórico (backfill L1)
4. **Tiendanube = verdad comercial** (`tn_total`, estados, KPIs ventas).
5. **ERP = subledger operativo** opcional; no KPI de negocio por Δ TN vs ERP.

---

## Consecuencias

| Área | Antes | Después |
|------|-------|---------|
| KPI ventas | TN (staging) / GAS REMITOS (prod) | TN siempre en V2 |
| `tn_only_pending_erp` | Error / cola import | **Estado normal** ecommerce |
| `GET /api/v2/orders` | TN + enrichment ERP | TN; ERP opcional |
| `GET /api/v2/remitos` | Todos los remitos | Canal manual/interno |
| Payments / stock | Solo `erp_order_id` | Polimórfico: TN o ERP |
| Prorrateo | `erp_order_items` | Futuro: `tn_order_item_allocations` |
| GAS prod | Import TN → REMITOS | **Sin cambios** hasta fase M6 |
| `/api/erp/*` | Legacy read | **Sin cambios** |

---

## Fuera de alcance M0/M1

- Live sync productivo
- Creación automática de remitos por webhook
- Stock / prorrateo con lógica real
- Migración prod / deploy
- Dashboard definitivo (solo naming/docs mínimos)

---

## Fases siguientes

| Fase | Contenido |
|------|-----------|
| **M0** ✓ | Este ADR |
| **M1** ✓ | Schema TN-first staging (`prisma/schema.prisma`, `m1:db:push`) |
| M2 | UI staging reorientada (`/dashboard/orders` TN-led) |
| M3 | MP ecommerce en `tn_orders` / `payments.tn_order_id` |
| M4 | Allocations + stock TN (lógica) |
| M5 | CRUD remitos manuales ERP V2 |
| M6 | Corte GAS ecommerce (prod, con aprobación) |

---

## Referencias

- [`erp-l1-data-model.md`](./erp-l1-data-model.md)
- [`erp-l2-commercial-mirror.md`](./erp-l2-commercial-mirror.md)
- [`erp-m1-staging-migration.sql`](./erp-m1-staging-migration.sql) — SQL incremental staging
- `_wip/junio-01-08-gap-explained.json`
