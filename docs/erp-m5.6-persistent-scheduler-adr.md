# M5.6 — Persistent Scheduler + Stale Alert

**Depende:** M5.5.2 RCA (scheduler local no persistente)

## Problema

`m5:scheduler:start` requiere un proceso Node always-on. Si muere, el import TN se detiene sin alerta clara.

## Solución

| Pieza | Path |
|---|---|
| GitHub Actions cron | `.github/workflows/erp-v2-live-pipeline.yml` |
| Stale check | `lib/erp/v2/pipeline-stale.ts` |
| Stale alert service | `services/erp-v2-pipeline-stale-alert.ts` |
| Stale script | `scripts/m5-pipeline-stale-check.ts` |

## GitHub Actions

Cada 5 minutos (+ `workflow_dispatch`):

1. `npm run m5:stale:check` — alerta si última corrida > 15 min
2. `ERP_V2_DB_WRITE=true npm run m5:scheduler:once` — corrida monitoreada

**No** usar `m5:scheduler:start` en CI (one-shot y termina).

## Secrets requeridos

| Secret | Uso |
|---|---|
| `DATABASE_URL` | Neon staging |
| `ERP_V2_DB_WRITE` | `true` |
| `TIENDANUBE_STORE_ID` | Import TN |
| `TIENDANUBE_ACCESS_TOKEN` | Import TN |
| `TIENDANUBE_USER_AGENT` | Import TN |
| `MP_ACCESS_TOKEN` | MP allocation stage |
| `PIPELINE_ALERT_EMAIL` | Alertas fallo + stale |
| `RESEND_API_KEY` | Email |
| `PIPELINE_ALERT_FROM` | Opcional |

## Stale alert

- Umbral: **15 minutos** sin `pipeline_runs.startedAt`
- Health check id: `pipeline_stale` → overall **FAIL**
- Email reason: `pipeline_stale`
- Dedup: 1 email / hora vía `sync_state` scope `m5_pipeline_stale_alert`

## Comandos locales

```bash
# Catch-up / manual tick
ERP_V2_DB_WRITE=true npm run m5:scheduler:once

# Stale check (simulación)
npm run m5:stale:check -- --dry-run
```

## Guards

No toca GAS, prod, `app/api/erp/*`, ni lógica de etapas del pipeline.
