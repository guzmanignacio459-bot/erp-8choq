# M5.4 — Automation + Monitoring

**Depende:** M5.3 (`275ef57`)

## Objetivo

ERP V2 staging autónomo: pipeline cada 5 minutos, historial en DB, email solo ante fallo.

## Componentes

| Pieza | Path |
|---|---|
| Schema | `pipeline_runs` en `prisma/schema.prisma` |
| Lock | `lib/erp/v2/pipeline-lock.ts` |
| Monitor | `services/erp-v2-pipeline-monitor.ts` |
| Email | `lib/erp/v2/pipeline-alert-email.ts` |
| Scheduler | `scripts/m5-pipeline-scheduler.ts` |

## Uso

```bash
# Schema
npm run m5:db:push

# Una corrida monitoreada (manual)
ERP_V2_DB_WRITE=true npm run m5:scheduler:once

# Daemon cada 5 min
ERP_V2_DB_WRITE=true npm run m5:scheduler:start
```

## Env

```env
PIPELINE_ALERT_EMAIL=ops@example.com
RESEND_API_KEY=re_...
PIPELINE_ALERT_FROM=ERP V2 <alerts@example.com>  # opcional
```

Emails **solo** en: Import FAIL, Projection FAIL, Pipeline FAIL, excepción no controlada.

## Validaciones

- **A-1** Advisory lock + in-process guard → sin corridas concurrentes
- **A-2** PASS → `pipeline_runs.status = success`
- **A-3** FAIL → `pipeline_runs.status = failed`
- **A-4** Email solo ante fallo (no en success/warnings)

## Guards

No toca GAS, prod, ni lógica de etapas M5.1–M5.3.
