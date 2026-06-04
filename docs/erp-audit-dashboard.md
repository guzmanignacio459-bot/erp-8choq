# Auditoría interna — Dashboard ERP (read-only)

Herramientas para validar Remitos, Remito Items y Analytics **antes de cambios importantes** (MP, shipping, deploys).

## Scripts

| Script | Propósito |
|--------|-----------|
| `scripts/audit-erp-dashboard.mjs` | Conteos ART, alineación Analytics, KPI ítems (`filas === totalPrendas`), stress de rangos |
| `scripts/audit-mp-mayo-universe.mjs` | Universo MP Mayo: aplicados vs pendientes por día (pre-piloto) |

**No modifican datos.** Solo `GET` a `/api/erp/*`.

## Uso

```bash
cd nextjs-boilerplate

# Validación estándar (Abril 360 / Mayo 475)
node scripts/audit-erp-dashboard.mjs

# Rango custom
node scripts/audit-erp-dashboard.mjs --from 2026-05-01 --to 2026-05-31 --expect 475

# Staging / otra URL
PROD_URL=https://tu-preview.vercel.app node scripts/audit-erp-dashboard.mjs

# Universo MP Mayo
node scripts/audit-mp-mayo-universe.mjs
```

Exit code `0` = PASS, `1` = FAIL.

## Cuándo ejecutar

- Después de deploy dashboard (`f2f25fa`+)
- Antes de MP masivo
- Después de reparaciones históricas (solo lectura de verificación)
