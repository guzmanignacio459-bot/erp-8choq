# M5.3 — Live Pipeline Orchestrator

**Depende:** M5.1..M5.2d (`1cc0350`)

## Objetivo

Un comando ejecuta el pipeline TN-first completo:

```
Import → Units → Commercial → MP → Stock → Projection Verify
```

## Componentes

| Pieza | Path |
|---|---|
| Types | `types/erp-v2-live-pipeline.ts` |
| Orchestrator | `services/erp-v2-live-pipeline.ts` |
| CLI | `scripts/m5-live-pipeline.ts` |

## Uso

```bash
npm run m5:pipeline:live                              # dry-run
ERP_V2_DB_WRITE=true npm run m5:pipeline:live -- --write
npm run m5:pipeline:live -- --report-only             # projection only
npm run m5:pipeline:live -- --idempotency-check       # P-3 gate
```

Reporte: `_wip/m5-live-pipeline-report.json`

## Validaciones

- **P-1** Etapas en orden fijo
- **P-2** Stop on failure — etapas siguientes `skipped`
- **P-3** Idempotencia global (0 work si sin órdenes nuevas)
- **P-4** Projection V-I4 PASS

## Guards

No modifica lógica de etapas. Sin cron/webhook (M5.4+).
