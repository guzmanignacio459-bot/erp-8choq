# MP MAYO — Fase 2.2 (Piloto)

**Estado:** plan preparado — **NO ejecutar MP masivo** hasta cerrar piloto.  
**Fecha auditoría:** 2026-06-04 · prod `https://nextjs-boilerplate-topaz-iota-40.vercel.app`

---

## 1. Contexto y guardrails

| Ítem | Valor |
|------|--------|
| Remitos Mayo (ART) | **475** |
| MP Mayo aplicado hoy | **2** (tests) |
| MP Abril referencia | **270** / 360 remitos |
| Dashboard KPI fix | `f2f25fa` deployado |
| Shipping | Cerrado (Fases A/B/C) — **no tocar** |

**No modificar en piloto:**

- `/api/mercadopago/import-payment` (lógica core)
- Apps Script financiero
- `import-orders`
- Datos fuera del scope piloto

**Canal de apply (igual Abril):**

```text
POST /api/erp/mp/apply  { tnOrderId, force? }
  → delega a POST /api/mercadopago/import-payment
  → escribe columnas MP en REMITOS (GAS existente)
```

---

## 2. Auditoría universo MP Mayo (read-only) — hecho

Script: `node scripts/audit-mp-mayo-universe.mjs`

### Totales Mayo ART

| Métrica | Cantidad |
|---------|----------|
| Remitos Mayo | 475 |
| MP ya aplicado | 2 |
| MP pendiente (método MP/cuotas, sin columnas MP) | **376** |
| Otros métodos de pago (CUSTOM, etc.) | 97 |
| Pendientes sin `tnOrderId` | **0** |

### Criterio “elegible MP” (auditoría)

- `metodoDePago` contiene mercado / mp / cuotas
- Sin `mpPaymentId`, `mpStatus`, `mpNetoRealOrden`, `mpTotalCostReal`
- Con `tnOrderId` presente

### MP tests existentes (excluir del piloto)

| ID Remito | TN Order | Día ART |
|-----------|----------|---------|
| R-1779980897367 | 1981390559 | 2026-05-28 |
| R-1779981008908 | 1980794624 | 2026-05-28 |

---

## 3. Día piloto propuesto

Metodología Abril: **volumen chico, 100% TN, cero MP previo, fácil de recontar en dashboard.**

### Recomendación principal: **2026-05-24 (ART)**

| Métrica | Valor |
|---------|--------|
| Remitos del día | 8 |
| MP pendientes elegibles | **8** |
| MP ya aplicados | 0 |
| Con `tnOrderId` | 8 |

**Alternativas** (si preferís aún más chico):

| Día | Remitos | MP pendientes |
|-----|---------|---------------|
| 2026-05-21 | 5 | 3 |
| 2026-05-18 | 6 | 5 |
| 2026-05-22 | 9 | 5 |

**Evitar para piloto:**

- Días >25 MP pendientes (ej. 2026-05-10: 26)
- 2026-05-28 (ya tiene 2 tests MP)

---

## 4. Plan de ejecución (orden estricto)

### Paso 0 — Pre-check (read-only)

```bash
node scripts/audit-erp-dashboard.mjs
node scripts/audit-mp-mayo-universe.mjs
```

Baseline esperado:

- Mayo `475` remitos / Analytics scope `475`
- MP aplicados `2`

### Paso 1 — Export lista piloto (read-only)

Desde `/api/erp/remitos` filtrar día **2026-05-24**:

- Guardar lista: `idRemito`, `tnOrderId`, `metodoDePago`, `totalFinal`
- Confirmar **8** filas elegibles MP

### Paso 2 — Ejecutar piloto controlado (8 órdenes)

Por cada `tnOrderId` (secuencial, no paralelo masivo):

```http
POST /api/erp/mp/apply
Content-Type: application/json

{ "tnOrderId": "<TN>", "force": false }
```

- Timeout: hasta 120s por orden (wrapper existente)
- Log por orden: ok / skipped / error
- Si `skipped`: documentar razón antes de `force: true`
- **No usar `force: true`** salvo caso documentado

Criterio de éxito piloto:

- 8/8 con columnas MP pobladas en sheet
- 0 errores no explicados
- Sin duplicar los 2 tests de 2026-05-28

### Paso 3 — Validar cantidad post-piloto

| Check | Esperado |
|-------|----------|
| MP Mayo aplicados | 2 + 8 = **10** |
| MP pendientes Mayo | 376 − 8 = **368** |
| Remitos Mayo | **475** (sin cambio de count) |
| Dashboard día 2026-05-24 | 8 remitos, KPI “tickets MP” = 8 |

```bash
node scripts/audit-mp-mayo-universe.mjs
node scripts/audit-erp-dashboard.mjs --day 2026-05-24
```

UI manual:

- `/dashboard/remitos` → día específico `2026-05-24`
- `/dashboard/analytics` → custom `2026-05-24` → `remitosInScope = 8`
- `/dashboard/remito-items` → mismo día

### Paso 4 — Revisar Analytics (solo lectura)

- Totales del día no deben “arrastrar” otro mes (fix anti-stale activo)
- Comparar `remitosInScope` con filtro Remitos mismo día

### Paso 5 — Gate para lote completo

**Solo si piloto OK:**

1. Aprobar explícitamente “MP Mayo masivo”
2. Planificar lotes por día o por bloques de 20–30 TN (evitar timeout Vercel 300s)
3. Re-auditar con `audit-mp-mayo-universe.mjs` entre lotes
4. Objetivo final: ~**378** MP aplicados en Mayo (376 pendientes + 2 tests)

---

## 5. Rollback / contención

- Piloto es **8 filas** — si falla, no avanzar al lote
- Errores conocidos Abril (SKU/talle): revisar `scripts/april-audit-diff.ts` y lista `KNOWN_ERRORS`
- No re-ejecutar masivo con `force: true` sin auditoría

---

## 6. Comparativa metodología Abril → Mayo

| Fase | Abril (referencia) | Mayo (piloto) |
|------|-------------------|---------------|
| Auditoría universo | `april-audit-diff.ts` + conteos 360 | `audit-mp-mayo-universe.mjs` + 475 |
| Día piloto | (día chico validado en su momento) | **2026-05-24** (8 órdenes) |
| Validar cantidad | 360 remitos / 270 MP | 475 / 10 tras piloto |
| Analytics | Revisar scope = filtro | Mismo + `audit-erp-dashboard.mjs` |
| Lote completo | Post-piloto OK | **368** pendientes — pendiente gate |

---

## 7. Siguiente acción

Cuando apruebes el día piloto:

1. Ejecutar **solo** Paso 2 con las 8 TN de 2026-05-24
2. Reportar log ok/error
3. Re-correr auditorías Paso 3

**NO iniciar lote completo** hasta confirmación explícita post-piloto.

```text
MP MAYO — FASE 2.2 (Piloto) → ejecución pendiente de tu OK
MP MAYO — FASE 2.3 (Lote)     → bloqueado hasta piloto OK
```
