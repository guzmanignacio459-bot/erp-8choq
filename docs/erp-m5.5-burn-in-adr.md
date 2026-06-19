# M5.5 — Staging Burn-In + Operational Hardening

**Depende:** M5.4 (`b842ae2`)

## Objetivo

Evidencia objetiva de operación autónoma: dashboard, drift detection, health checks post-pipeline, burn-in report.

## Componentes

| Pieza | Path |
|---|---|
| Health service | `services/erp-v2-pipeline-health.ts` |
| API | `GET /api/v2/system/pipeline-health` |
| Dashboard | `/dashboard/system` |
| Burn-in CLI | `npm run m5:burnin:report` |

## Drift checks (post-pipeline)

1. **Projection** — snapshot + ledger === projection (V-I4)
2. **Units** — SUM(quantity) === COUNT(units) post-T0
3. **Commercial** — 1 allocation / unit post-T0
4. **Stock** — 1 sale / stockable unit post-T0
5. **MP** — Σ neto_prenda_real ≈ net_received_amount

Resultados en `pipeline_runs.report_json.healthCheck`.

## Alertas extendidas (M5.5e)

Email solo ante:
- Pipeline / Import / Projection FAIL
- Health FAIL (drift)
- Success rate &lt; 95% (≥5 runs en 24h)

No email en WARNING ni success.

## Uso

```bash
# Dashboard (requiere ERP_V2_DB_READ=true)
open /dashboard/system

# Burn-in report
npm run m5:burnin:report
```

Reporte: `_wip/m5-burn-in-report.json`
