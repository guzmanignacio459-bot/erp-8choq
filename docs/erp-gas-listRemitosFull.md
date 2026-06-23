# Apps Script — `listRemitosFull` (read-only)

El ERP dashboard necesita **todas las columnas** de la hoja `REMITOS`.
`listRemitos` actual devuelve un resumen (`id`, `fecha`, `nombre`, `metodoPago`, …).

## Acción nueva (solo lectura)

Agregar en el Web App de Apps Script, en el switch de `action`:

```javascript
case 'listRemitosFull':
  return listRemitosFull_(body);
```

## Implementación sugerida (pseudocódigo)

```javascript
function listRemitosFull_(body) {
  assertToken_(body.token); // mismo criterio que listRemitos

  const ss = SpreadsheetApp.openById(SPREADSHEET_ID);
  const sh = ss.getSheetByName('REMITOS');
  if (!sh) return { ok: false, error: 'Hoja REMITOS no encontrada' };

  const values = sh.getDataRange().getValues();
  if (values.length < 2) return { ok: true, data: [] };

  const headers = values[0].map(h => String(h).trim());
  const q = String(body.q || '').trim().toLowerCase();

  const rows = [];
  for (let i = 1; i < values.length; i++) {
    const obj = {};
    headers.forEach((h, j) => { obj[h] = values[i][j]; });
    if (q && !rowMatchesQuery_(obj, q)) continue;
    rows.push(obj); // sin recalcular — valores crudos de la hoja
  }

  return { ok: true, data: rows };
}
```

## Columnas mínimas esperadas en cada fila

Headers de la fila 1 de `REMITOS` (tal como están en el sheet):

- ID Remito
- Fecha
- Nombre
- Provincia/Localidad
- Transporte
- Metodo De Pago
- Total De Prendas
- Shipping Customer Cost
- Envio Owner
- Shipping Owner Cost
- Recargo/Descuento
- Total Final
- Estado
- Detalle general
- TN_ORDER_ID
- MP_PAYMENT_ID
- MP_STATUS
- MP_TOTAL_COST_REAL
- MP_NETO_REAL_ORDEN

## Reglas

- **Read-only**: no `setValue`, no `appendRow`, no triggers de escritura.
- **Sin recálculos**: no recomputar netos, shipping, MP ni prorrateos.
- Misma autenticación por `token` que el resto de acciones.
- Respuesta: `{ ok: true, data: [ { "ID Remito": "...", ... }, ... ] }`

## Next.js

`/api/erp/remitos` intenta `listRemitosFull` primero y hace **fallback** a `listRemitos` si GAS responde con error de acción desconocida o no soportada (p. ej. `"Acción no soportada"`).

Variable opcional: `ERP_REMITOS_LIST_MODE=full|summary|auto` (default `auto`).
