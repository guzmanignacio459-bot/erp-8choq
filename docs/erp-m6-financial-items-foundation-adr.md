# ADR M6.0 — Financial Items Foundation

**Estado:** Aprobado (foundation only)  
**Depende:** M5 live pipeline operativo (TN → Units → Commercial → MP → Stock → Projection)  
**Alcance M6.0:** diseño + ADR — **sin schema, sin migraciones, sin cambios M5**

---

## Contexto

Arquitectura objetivo:

| Capa | Rol |
|---|---|
| **TN Orders** | Fuente comercial ecommerce |
| **Remitos** | Fuente operativa / manual / legacy |
| **Financial Items** | Unidad financiera unificada — **1 prenda vendida = 1 fila** |
| **Analytics** | Consume Financial Items (no dos dashboards financieros) |

M5 dejó operativo el pipeline live sobre Neon staging. El dashboard `/dashboard/remito-items` sigue leyendo **GAS REMITO_ITEMS** (prod legacy). M6 unifica TN + Remitos en una sola capa financiera sin romper lo existente hasta migración segura.

---

## 1. Auditoría — Remito Items actual

### 1.1 Frontend

| Pieza | Path |
|---|---|
| Page | `app/dashboard/remito-items/page.tsx` |
| Dashboard | `components/erp/remito-items/erp-remito-items-dashboard.tsx` |
| Tabla | `components/erp/remito-items/erp-remito-items-table.tsx` |
| KPIs | `components/erp/remito-items/erp-remito-items-kpi-grid.tsx` |
| Analytics embebido | `components/erp/remito-items/erp-remito-items-analytics.tsx` |
| Owner badge | `components/erp/remito-items/erp-remito-items-owner-badge.tsx` |
| Debug strip | `components/erp/remito-items/erp-remito-items-debug-strip.tsx` |
| Nav | `components/erp/sidebar/nav-config.ts` → `id: remito-items`, label **"Ítems de remito"** |
| Placeholder metadata | `lib/erp/module-placeholders.ts` |

**Ruta actual:** `/dashboard/remito-items`  
**Tipo:** Client component (`"use client"`), fetch en `useEffect`, filtros período + SKU/owner GAS + filtros cliente (artículo/talle/q).

### 1.2 API y servicios

| Pieza | Path | Fuente datos |
|---|---|---|
| API route | `app/api/erp/remito-items/route.ts` | Delega a servicio |
| Servicio | `services/erp-remito-items.ts` | **GAS** `getRemitoItemsFull` vía `APPS_SCRIPT_URL` |
| Mapper | `lib/erp/remito-items-mapper.ts` | GAS payload → `ErpRemitoItemRow` |
| Query builder | `lib/erp/remito-items-query.ts` | URL `/api/erp/remito-items?from&to&sku&owner` |
| Filtros cliente | `lib/erp/remito-items-filter.ts` | Post-fetch en browser |
| Sort | `lib/erp/remito-items-sort.ts` | Por fecha desc |
| Agregador KPIs | `lib/erp/remito-items-aggregator.ts` | Summary + product analytics |
| KPI copy | `lib/erp/remito-items-kpi-copy.ts` | Labels UI |
| Tipos | `types/erp.ts` → `ErpRemitoItemRow`, `ErpRemitoItemsSummary`, … |

**Conclusión fuente:** `/dashboard/remito-items` lee **solo GAS** hoy. **No usa Neon** ni `/api/v2/*`.

### 1.3 Scripts / auditorías relacionados

| Script | Uso |
|---|---|
| `scripts/smoke-remito-items-ui.mjs` | Playwright smoke |
| `scripts/audit-remito-items-kpis.mjs` | KPI audit prod |
| `scripts/audit-erp-dashboard.mjs` | Incluye remito-items |
| `scripts/l1-sync-db.mjs` | Backfill GAS → `erp_order_items` |
| `scripts/l0-backfill-gas-to-json.mjs` | Export GAS items |

### 1.4 Modelos Neon relacionados (staging — no consumidos por UI remito-items)

| Tabla Prisma | Grain | Rol M5 | Usado por remito-items UI |
|---|---|---|---|
| `tn_order_items` | Línea TN (qty agregada) | Import TN | No |
| `tn_order_item_units` | **1 prenda = 1 fila** | Unit expansion M5.2a | No |
| `tn_order_item_allocations` | Prorrateo comercial + MP por unidad | M5.2b/c | No |
| `stock_movements` | Ledger stock por unidad | M5.2d | No |
| `erp_orders` | Remito legacy/manual | Backfill GAS | No |
| `erp_order_items` | Línea REMITO_ITEMS backfill | Paridad GAS grain | No |

**Gap:** Neon ya tiene grain unitario + allocations (paridad conceptual con GAS REMITO_ITEMS), pero el dashboard financiero actual no lo consume.

### 1.5 Dashboards financieros paralelos (riesgo M6)

| Dashboard | API | Fuente | Grain |
|---|---|---|---|
| `/dashboard/remito-items` | `/api/erp/remito-items` | GAS REMITO_ITEMS | 1 prenda |
| `/dashboard/orders` | `/api/v2/orders` | Neon `tn_orders` | Orden (no ítem) |
| `/dashboard/analytics` | `/api/erp/analytics` | GAS REMITOS agregado | Cabecera remito |
| `/dashboard/remitos?source=neon` | `/api/v2/orders` + map | Neon TN como pseudo-remito | Orden |

M6 debe converger rentabilidad por prenda en **Financial Items**, no mantener estos caminos como fuentes finales separadas.

### 1.6 Contrato actual `ErpRemitoItemRow` (GAS)

Campos mapeados hoy desde GAS:

- `rowId`, `idRemito`, `fechaRaw`, `fechaDisplay`
- `sku`, `articulo`, `talle`, `owner`, `cantidad`
- `precioUnitario`, `descuentoAsignado`, `shippingAsignado`, `feeAsignado`
- `netoPrenda`, `netoPrendaReal`, `netoDisplay`
- `mpFeeAsignadoReal`, `mpPlatformFeeAsignadoReal`, `mpTotalCostAsignadoReal`

**No incluye hoy:** `productCost`, `grossMargin`, `metaAdsAllocated`, `originType` explícito.

---

## 2. Naming y estrategia de transición UI

| Aspecto | Decisión M6.0 |
|---|---|
| **UI label** | **Financial Items** (es) / "Ítems financieros" en nav si se prefiere español |
| **Ruta futura** | `/dashboard/financial-items` |
| **Ruta legacy** | `/dashboard/remito-items` → **redirect 308** o alias durante transición (M6.1) |
| **API futura** | `/api/v2/financial-items` (read) — no tocar `/api/erp/remito-items` hasta deprecación |
| **Renombre interno** | **Módulo nuevo paralelo** (`financial-items/*`, `erp-v2-financial-items.ts`). No renombrar masivamente `remito-items/*` en M6.0 — evita romper GAS path y scripts de auditoría. |

**Rationale:** Strangler pattern — construir V2 al lado, migrar consumidores, deprecar GAS dashboard al final (M6.5+).

---

## 3. Contrato `FinancialItem`

### 3.1 Origen

```ts
type FinancialItemOriginType = "TN_ORDER" | "REMITO";
```

| originType | originId | originItemId | unitKey |
|---|---|---|---|
| `TN_ORDER` | `tn_order_id` | `tn_order_item_id` | `tn_order_item_unit_id` (PK) |
| `REMITO` | `erp_order_id` o `idRemito` GAS | `erp_order_item_id` o línea GAS | ver §3.3 |

### 3.2 Campos mínimos

```ts
type FinancialItem = {
  id: string;                    // PK financial_items (cuid)
  originType: FinancialItemOriginType;
  originId: string;
  originItemId: string;
  unitKey: string;               // idempotency natural key (unique)

  date: string;                  // ISO date ART — KPI período
  customerName: string | null;

  sku: string;
  productName: string;
  variantName: string | null;    // talle / variante
  quantity: number;              // siempre 1 en grain unitario objetivo

  grossAmount: number;           // precio bruto unitario
  discountAllocated: number;
  tnFeeAllocated: number;        // fee TN / gateway (feeAllocated)
  mpFeeAllocated: number;        // MP total cost asignado (real preferido)
  shippingAllocated: number;
  metaAdsAllocated: number | null; // stub M6.4+ — nullable hasta engine Meta

  netAmount: number;             // neto prenda financiero (post desc/shipping/fees)
  productCost: number | null;    // COGS — M6.4+
  grossMargin: number | null;
  marginPct: number | null;

  paymentMethod: string | null;
  status: string;                // commercial / operativo según origen
  owner: "8Q" | "SCNL" | string;

  sourceCreatedAt: string | null; // tn_created_at | fecha_erp
  createdAt: string;
  updatedAt: string;

  // Trazabilidad (no expuesto en UI inicial)
  generatorVersion: string;      // ej. m6.2-tn-v1
  sourcePayloadHash: string | null;
};
```

### 3.3 Idempotency key (`unitKey`)

**Recomendado:**

```
TN_ORDER:  tn:{tn_order_item_unit_id}
REMITO:    remito:{erp_order_item_id}
           — o si solo GAS sin Neon —
           remito:{idRemito}:{sku}:{talle}:{unitIndex}
```

Unique constraint: `@@unique([originType, unitKey])`

### 3.4 Mapeo desde fuentes existentes (referencia — no implementar en M6.0)

| FinancialItem field | TN (Neon) source | REMITO source |
|---|---|---|
| `grossAmount` | `tn_order_item_allocations.gross_unit_amount` | `erp_order_items.precio_unitario` |
| `discountAllocated` | `.discount_allocated` | `.descuento_asignado` |
| `tnFeeAllocated` | `.fee_allocated` | `.fee_asignado` |
| `mpFeeAllocated` | `.mp_total_cost_allocated_real` ?? sum MP fields | `.mp_total_cost_asignado_real` |
| `shippingAllocated` | `.shipping_allocated` | `.shipping_asignado` |
| `netAmount` | `.neto_prenda_real` ?? `.neto_prenda` | `.neto_prenda_real` ?? `.neto_prenda` |
| `date` | `tn_orders.tn_paid_at` ?? `tn_created_at` | `erp_order_items.fecha_erp` |
| `customerName` | `tn_orders.customer_name` | `erp_orders` / GAS cabecera |

---

## 4. Opciones técnicas

### Opción A — Tabla materializada `financial_items`

**Descripción:** Tabla append/upsert en Neon. Generators M6.2 (TN) y M6.3 (Remito) escriben filas idempotentes post-pipeline o on-demand backfill.

| Criterio | Evaluación |
|---|---|
| **Performance analytics** | ★★★★★ — índices por `date`, `sku`, `owner`, `originType` |
| **Idempotencia** | ★★★★★ — upsert por `(originType, unitKey)` |
| **Trazabilidad** | ★★★★☆ — `generatorVersion`, `updatedAt`, link a origen |
| **Analytics** | ★★★★★ — SQL simple, paginación, agregaciones |
| **Remitos manuales** | ★★★★★ — generator REMITO independiente del pipeline TN |
| **Complejidad** | Media — schema + 2 generators + sync jobs |
| **Riesgo regresión M5** | Bajo si generators son **downstream** del pipeline (no modifican allocations) |

### Opción B — View / API derivada (sin tabla)

**Descripción:** `GET /api/v2/financial-items` hace JOIN en runtime:

`tn_order_item_units` + `tn_order_item_allocations` + `tn_orders`  
UNION  
`erp_order_items` + `erp_orders`

| Criterio | Evaluación |
|---|---|
| **Performance analytics** | ★★☆☆☆ — JOINs pesados, paginación costosa, timeout GAS-like |
| **Idempotencia** | ★★★☆☆ — implícita en PKs origen, sin snapshot estable |
| **Trazabilidad** | ★★★☆☆ — recalcula siempre; difícil auditar "qué se mostró ayer" |
| **Analytics** | ★★☆☆☆ — agregaciones en app layer; duplica lógica aggregator |
| **Remitos manuales** | ★★★☆☆ — `erp_order_items` parcial (backfill); GAS-only remitos fuera |
| **Complejidad** | Baja inicial, alta acumulada |
| **Riesgo regresión M5** | Medio — queries complejas acopladas a schema allocations |

---

## 5. Recomendación

### **Opción A — Tabla materializada `financial_items`**

Alineada con preferencia del equipo y con el patrón M5 (materializar etapas pipeline con idempotencia).

**Principios:**

1. **Generators downstream** — M5 pipeline no se modifica; M6.2 agrega stage opcional `financial_items_sync` **después** de MP allocation (o job separado cron).
2. **No recalcular prorrateos en M6.0–M6.3** — copiar campos ya calculados por M4/M5.
3. **Dual-read period** — M6.1 UI lee V2 API; comparar con GAS en scripts de paridad antes de cutover.
4. **GAS `/dashboard/remito-items` intacto** hasta M6.5 sign-off.

**Idempotency:**

```sql
UNIQUE (origin_type, unit_key)
-- upsert ON CONFLICT UPDATE campos financieros + updated_at
```

---

## 6. Roadmap M6

| Milestone | Contenido | Toca M5 / GAS |
|---|---|---|
| **M6.0** ✓ | ADR foundation (este doc) | No |
| **M6.1** | Rename UI: nav "Financial Items", ruta `/dashboard/financial-items`, redirect `/dashboard/remito-items`; UI shell read GAS **o** stub vacío con badge "coming soon" | No breaking |
| **M6.2** | Schema `financial_items` + generator TN desde `tn_order_item_units` + allocations + `tn_orders` | Downstream only |
| **M6.3** | Generator REMITO desde `erp_order_items` + remitos manuales; backfill GAS → Neon donde falte | No GAS write |
| **M6.4** | Allocation refinements: `metaAdsAllocated`, COGS (`productCost`), margin — **nuevos campos**, no alterar M5 formulas | Extension |
| **M6.5** | Analytics (`/dashboard/analytics`) consume Financial Items; deprecate GAS remito-items dashboard | Read cutover |
| **M6.6** | Stock sync paid manual remitos → alinear operativo/financiero | Stock stage |

**Pipeline M5 (no tocar en M6.0–M6.2):**

```
TN Import → Units → Commercial → MP → Stock → Projection
                                              ↓ (M6.2+ opcional)
                                    Financial Items Generator
```

---

## 7. Riesgos

| Riesgo | Severidad | Mitigación |
|---|---|---|
| Dos fuentes financieras durante transición | Alta | Dual-read scripts; fecha cutover; un solo dashboard destino |
| Divergencia NETO_PRENDA GAS vs Neon allocations | Media | Paridad audit M6.2 (como `l2:compare:remitos`) |
| `cantidad > 1` en GAS rows vs grain unitario | Media | Normalizar a qty=1 en generator; `unitIndex` en unitKey |
| Timeout si Option B | Alta | Descartada — Option A |
| Romper `/api/erp/remito-items` | Alta | No modificar ruta legacy hasta M6.5 |
| Modificar M5 scheduler / live import | Alta | **Prohibido** — generators async separados |
| TN orders sin allocation aún | Media | Generator skip o partial row con flags |

---

## 8. Archivos clave (referencia implementación futura)

| M6.1+ | Path sugerido |
|---|---|
| ADR | `docs/erp-m6-financial-items-foundation-adr.md` |
| Schema | `prisma/schema.prisma` → model `FinancialItem` |
| Types | `types/erp-v2-financial-items.ts` |
| Service read | `services/erp-v2-financial-items.ts` |
| Generator TN | `services/erp-v2-financial-items-tn-generator.ts` |
| Generator Remito | `services/erp-v2-financial-items-remito-generator.ts` |
| API | `app/api/v2/financial-items/route.ts` |
| Page | `app/dashboard/financial-items/page.tsx` |
| Dashboard | `components/erp/financial-items/erp-financial-items-dashboard.tsx` |
| Redirect | `app/dashboard/remito-items/page.tsx` → redirect |

---

## 9. Guards M6.0

- [x] No schema changes
- [x] No migraciones
- [x] No modificar cálculos M5
- [x] No tocar scheduler / live import / GHA workflow
- [x] No romper `/dashboard/remito-items`
- [x] No push (operacional)

---

## 10. Referencias

- [`erp-m0-tn-first-adr.md`](./erp-m0-tn-first-adr.md) — TN vs Remito
- [`erp-m4-tn-item-units-adr.md`](./erp-m4-tn-item-units-adr.md) — grain unitario
- [`erp-m4-mp-prorate-adr.md`](./erp-m4-mp-prorate-adr.md) — allocations MP
- [`erp-m5.3-live-pipeline-adr.md`](./erp-m5.3-live-pipeline-adr.md) — orchestrator
- `types/erp.ts` — `ErpRemitoItemRow` (contrato GAS actual)
- `prisma/schema.prisma` — `TnOrderItemUnit`, `TnOrderItemAllocation`, `ErpOrderItem`
