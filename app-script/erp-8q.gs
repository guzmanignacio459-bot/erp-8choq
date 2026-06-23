/***********************
 * 8CHOQ – Apps Script API
 * Versión: 2026-01-04-v6-all-skus
 ***********************/
const API_VERSION = '2026-01-04-v6-all-skus';
const BUILD_ID = 'ERP8Q-PROD-2026-06-08-J3-XS';



/***********************
 * CONFIG
 
 ***********************/
const SPREADSHEET_ID = '1EDHbX270hNB_BoMfY2iBWJ-CRl5EJWrDKxudUJ1eGWo'; // ej: 1EDHbX...
const SHEET_REMITOS  = 'REMITOS';
const SHEET_ITEMS    = 'REMITO_ITEMS'; // detalle ítems por fila

/************ ALERTAS DE STOCK ************/
const ALERT_THRESHOLD   = 2; // avisa cuando Stock Total < 2
const ALERT_RECIPIENTS  = ['aican8q@gmail.com']; // varios separados por coma

// Hoja maestro con talles por columna y total
const STOCK_SPREADSHEET_ID = '1EDHbX270hNB_BoMfY2iBWJ-CRl5EJWrDKxudUJ1eGWo'; // puede ser el mismo
const STOCK_SHEET_NAME     = 'STOCK MAESTRO';
const STOCK_SHEET          = 'STOCK MAESTRO'; // alias legacy
const SKU_HEADER           = 'SKU';
const ITEM_HEADER          = 'ARTICULO';
const STOCK_TOTAL_HEADER   = 'Stock Total';

// Token opcional (vacío = sin validación desde Apps Script)
const TOKEN_OPTIONAL = ''; // ej. 'boiler-8choq-2025'

// Catálogos
const CATALOGS = {
  metodosPago: [
    'MP 1','MP 2','MP 3','Transferencia Santander','Transferencia Galicia',
    'DÉBITO','QR','EFECTIVO','E-CHECK','Tiendanube'
  ],
  transportes: ['Retiro en local','OCA','Correo Argentino','Andreani','Via Cargo','Otro','Tiendanube'],
  vendedores: ['Santiago','Paula','Malena','Nacho','Tiendanube'],
  condicionesCompra: ['Minorista','Mayorista'],
  estados: ['Pendiente','Pagado','Anulado']
};

// Talles reconocidos en STOCK MAESTRO (orden de grilla)
const VALID_STOCK_SIZES = ['XS','S','M','L','XL','XXL','XXXL'];

// Map legacy talle -> columna (1-based) tras insertar XS en columna C.
// Layout propuesto: A=SKU, B=ARTICULO, C=XS, D=S, E=M, F=L, G=XL, H=XXL, I=XXXL, J=Stock Total
// adjustStockForItems prefiere header dinámico; esto es fallback.
const SIZE_COL_INDEX = {
  XS:3, S:4, M:5, L:6, XL:7, XXL:8, XXXL:9,
  "1": 4, // S (legacy)
  "2": 5  // M (legacy)
};

function sizeColFromHeaders_(headers, size) {
  const idx = headerIndex_(headers, size);
  if (idx >= 0) return idx + 1;
  return SIZE_COL_INDEX[size] || null;
}

function stockSizeColumnsFromHeaders_(headers) {
  return VALID_STOCK_SIZES.filter(function(sz) {
    return headerIndex_(headers, sz) >= 0;
  });
}

/***********************
 * TIENDANUBE – CONFIG (solo para syncTNProducts)
 ***********************/
const TN_API_BASE = 'https://api.tiendanube.com/v1';

// store_id de Tiendanube
const TN_STORE_ID       = '1075178';

// access_token (NO compartir)
const TN_ACCESS_TOKEN   = 'fc23e860a30025987180be209f5c172b6ac17235';

// User-Agent requerido por Tiendanube
const TN_USER_AGENT     = '8Q ERP Oficial (tu-email@dominio.com)';

const TN_PRODUCTS_SHEET = 'TN_PRODUCTS';

/***********************
 * HELPERS
 ***********************/
function ensureHeader_(sh, headerName) {
  const lastCol = Math.max(1, sh.getLastColumn());
  const headers = sh.getRange(1, 1, 1, lastCol).getValues()[0].map(v => String(v || '').trim());
  const idx = headers.findIndex(h => h === headerName);
  if (idx >= 0) return idx + 1; // 1-based col index

  // Agrega al final
  const newCol = headers.length + 1;
  sh.getRange(1, newCol).setValue(headerName);
  return newCol;
}

function ensureRemitosShippingCustomerCost_(remitosSh) {
  // Garantiza que exista, no reordena nada
  ensureHeader_(remitosSh, 'Shipping Customer Cost');
}

function json(obj) {
  const out = ContentService.createTextOutput(JSON.stringify(obj));
  out.setMimeType(ContentService.MimeType.JSON);
  return out;
}

function safeJson_(text, fallback) {
  try { return JSON.parse(text || ''); }
  catch { return typeof fallback === 'undefined' ? null : fallback; }
}

function openSS(id) { return SpreadsheetApp.openById(id); }

function getSheet(ssId, sheetName) {
  const sh = openSS(ssId).getSheetByName(sheetName);
  if (!sh) throw new Error(`No existe la hoja "${sheetName}" en ${ssId}`);
  return sh;
}

function _norm_(s) {
  return String(s || '')
    .toLowerCase()
    .replace(/[-_]+/g, ' ')                // slug -> espacios
    .normalize('NFD').replace(/\p{Diacritic}/gu, '')
    .replace(/[^\w\s]/g, ' ')              // saca signos raros
    .replace(/\s+/g, ' ')
    .trim();
}


function headerIndex_(headers, name) {
  return headers.findIndex(
    h => String(h).trim().toLowerCase() === String(name).trim().toLowerCase()
  );
}

function parseSkuParts(sku) {
  const parts = String(sku || '').trim().split('-').filter(Boolean);
  let owner = null;

  if (parts.length && parts[parts.length - 1].toUpperCase() === 'SCNL') {
    owner = 'SCNL';
    parts.pop();
  }

  for (var i = parts.length - 1; i >= 0; i--) {
    var candidate = parts[i].toUpperCase();
    if (VALID_STOCK_SIZES.indexOf(candidate) >= 0) {
      return { size: candidate, owner: owner };
    }
  }

  return { size: null, owner: owner };
}
function normalizeOwner_(owner) {
  const o = String(owner || '').trim().toUpperCase();
  return o === 'SCNL' ? 'SCNL' : '';
}

function ensureHeaders_(sheet, desiredHeaders) {
  const lastRow = sheet.getLastRow();
  const lastCol = sheet.getLastColumn();

  // Si está vacía, setea header completo
  if (lastRow === 0 || lastCol === 0) {
    sheet.getRange(1, 1, 1, desiredHeaders.length).setValues([desiredHeaders]);
    return;
  }

  // Lee header actual (fila 1)
  const current = sheet.getRange(1, 1, 1, lastCol).getValues()[0]
    .map(h => String(h || '').trim());

  // Calcula faltantes
  const currentSet = new Set(current.filter(Boolean));
  const missing = desiredHeaders.filter(h => !currentSet.has(h));

  // Agrega faltantes al final
  if (missing.length > 0) {
    sheet.getRange(1, lastCol + 1, 1, missing.length).setValues([missing]);
  }
}


/**
 * Anti-duplicado por Detalle general.
 * Si ya existe exactamente el mismo string (ej: "TN_ORDER_ID=123"), devuelve true.
 */
function existsDetalleGeneral_(detalleGeneral) {
  const { shR } = ensureSheets_();
  const last = shR.getLastRow();
  if (last < 2) return false;

  const header = shR.getRange(1, 1, 1, shR.getLastColumn()).getValues()[0].map(String);
  const idx = headerIndex_(header, 'Detalle general');
  if (idx < 0) return false;

  const col = idx + 1;
  const values = shR.getRange(2, col, last - 1, 1).getValues();

  const needle = String(detalleGeneral || '').trim();
  if (!needle) return false;

  for (let i = 0; i < values.length; i++) {
    const v = String(values[i][0] || '').trim();
    if (v && v.includes(needle)) return true;
  }
  return false;
}

/**
 * NORMALIZA SKU:
 * - Si viene con talle, y `talle` difiere, lo REEMPLAZA.
 * - Si viene sin talle, y `talle` existe, lo AGREGA.
 * - Respeta/agrega SCNL si corresponde por `owner`.
 */
function normalizeSku_(sku, talle, owner) {
  const raw = String(sku || '').trim();
  if (!raw) return '';

  const t = String(talle || '').trim().toUpperCase();
  const o = String(owner || '').trim().toUpperCase();

  const parts = raw.split('-').filter(Boolean);

  // owner al final
  let hasOwner = false;
  if (parts.length && parts[parts.length - 1].toUpperCase() === 'SCNL') {
    hasOwner = true;
    parts.pop();
  }

  // size al final
  let hadSize = false;
  let existingSize = '';
  if (parts.length && VALID_STOCK_SIZES.indexOf(parts[parts.length - 1].toUpperCase()) >= 0) {
    hadSize = true;
    existingSize = parts.pop().toUpperCase();
  }

  const finalSize = t || (hadSize ? existingSize : '');
  if (finalSize) parts.push(finalSize);

  const finalOwner = (o === 'SCNL') || hasOwner;
  if (finalOwner) parts.push('SCNL');

  return parts.join('-');
}

/** Asegura que el SKU tenga el sufijo de talle (+ owner SCNL si aplica) */
function ensureSizeInSku_(sku, talle, owner) {
  return normalizeSku_(sku, talle, owner);
}

/** Busca fila por SKU en STOCK MAESTRO (comparación case-insensitive) */
function findRowBySku(stockSh, sku) {
  const last = stockSh.getLastRow();
  if (last < 2) return null;
  const range = stockSh.getRange(2, 1, last - 1, 1); // A:A SKU
  const values = range.getValues();

  const target = String(sku || '').trim().toUpperCase();
  for (let i = 0; i < values.length; i++) {
    const cur = String(values[i][0] || '').trim().toUpperCase();
    if (cur && cur === target) return i + 2;
  }
  return null;
}

/** Busca artículo y owner a partir de un SKU exacto en STOCK MAESTRO */
function findArticuloOwnerBySku_(sku) {
  if (!sku) return { articulo: '', owner: '' };
  const sh = getSheet(STOCK_SPREADSHEET_ID, STOCK_SHEET_NAME);
  const last = sh.getLastRow();
  if (last < 2) return { articulo: '', owner: '' };

  const headers = sh.getRange(1,1,1,sh.getLastColumn()).getValues()[0].map(String);
  const iSKU = headerIndex_(headers, 'SKU');
  const iART = headerIndex_(headers, 'ARTICULO');
  if (iSKU < 0 || iART < 0) return { articulo: '', owner: '' };

  const values = sh.getRange(2,1,last-1, sh.getLastColumn()).getValues();
  const skuStr = String(sku).trim().toUpperCase();

  for (let r = 0; r < values.length; r++) {
    const cur = String(values[r][iSKU] || '').trim().toUpperCase();
    if (cur === skuStr) {
      return {
        articulo: String(values[r][iART] || ''),
        owner: parseSkuParts(skuStr).owner || ''
      };
    }
  }
  return { articulo: '', owner: '' };
}
function moveFechaFirst_() {
  const sh = getSheet(SPREADSHEET_ID, SHEET_ITEMS);

  const hdr = sh.getRange(1, 1, 1, sh.getLastColumn()).getValues()[0];
  const idxFecha = hdr.indexOf('Fecha') + 1;

  if (idxFecha <= 0) throw new Error('No existe columna Fecha');
  if (idxFecha === 1) return; // ya está bien

  const lastRow = sh.getLastRow();

  // insertar nueva col A
  sh.insertColumnBefore(1);

  // escribir header
  sh.getRange(1, 1).setValue('Fecha');

  // copiar valores
  if (lastRow > 1) {
    const data = sh.getRange(2, idxFecha + 1, lastRow - 1, 1).getValues();
    sh.getRange(2, 1, lastRow - 1, 1).setValues(data);
  }

  // borrar columna vieja
  sh.deleteColumn(idxFecha + 1);
}


/***********************
 * TIENDANUBE – HELPERS (syncTNProducts)
 ***********************/
function tnHeaders_() {
  if (!TN_STORE_ID || !TN_ACCESS_TOKEN) {
    throw new Error('TN_STORE_ID o TN_ACCESS_TOKEN no configurados');
  }
  return {
    'Authentication': 'bearer ' + TN_ACCESS_TOKEN,
    'User-Agent': TN_USER_AGENT || '8Q ERP',
    'Content-Type': 'application/json'
  };
}

function tnFetch_(path, params) {
  let url = TN_API_BASE + '/' + encodeURIComponent(TN_STORE_ID) + path;
  if (params && Object.keys(params).length) {
    const qs = Object.keys(params)
      .map(k => encodeURIComponent(k) + '=' + encodeURIComponent(params[k]))
      .join('&');
    url += (url.indexOf('?') >= 0 ? '&' : '?') + qs;
  }

  const res = UrlFetchApp.fetch(url, {
    method: 'get',
    headers: tnHeaders_(),
    muteHttpExceptions: true
  });

  const code = res.getResponseCode();
  const body = res.getContentText() || '';

  if (code >= 200 && code < 300) {
    return body ? JSON.parse(body) : null;
  }
  throw new Error('Error Tiendanube ' + code + ': ' + body);
}

function syncTiendanubeProducts() {
  const ss = openSS(SPREADSHEET_ID);
  let sh = ss.getSheetByName(TN_PRODUCTS_SHEET);
  if (!sh) sh = ss.insertSheet(TN_PRODUCTS_SHEET);
  else sh.clearContents();

  const headers = [
    'product_id','variant_id','nombre','sku','precio','stock','image_url','image_preview'
  ];
  sh.getRange(1, 1, 1, headers.length).setValues([headers]);

  const rows = [];
  let page = 1;
  const perPage = 50;

  while (true) {
    const data = tnFetch_('/products', { page, per_page: perPage });
    if (!Array.isArray(data) || data.length === 0) break;

    data.forEach(p => {
      const nameObj = p.name || {};
      const nombre = (nameObj.es || nameObj.pt || nameObj.en || '').toString();
      const mainImage = (p.images && p.images.length && p.images[0].src) ? p.images[0].src : '';

      const variants = Array.isArray(p.variants) ? p.variants : [];
      if (!variants.length) {
        rows.push([p.id || '', '', nombre, '', '', '', mainImage, mainImage ? `=IMAGE("${mainImage}")` : '']);
      } else {
        variants.forEach(v => {
          rows.push([
            p.id || '',
            v.id || '',
            nombre,
            v.sku || '',
            v.price || '',
            v.stock || '',
            mainImage,
            mainImage ? `=IMAGE("${mainImage}")` : ''
          ]);
        });
      }
    });

    if (data.length < perPage) break;
    page++;
    if (page > 20) break;
  }

  if (rows.length) sh.getRange(2, 1, rows.length, headers.length).setValues(rows);
  return { ok: true, count: rows.length };
}

function getStockLookup_() {
  const sh = getSheet(STOCK_SPREADSHEET_ID, STOCK_SHEET_NAME);
  const last = sh.getLastRow();
  if (last < 2) return { bySku: new Map(), headers: [] };

  const headers = sh.getRange(1,1,1,sh.getLastColumn()).getValues()[0].map(String);
  const iSKU = headerIndex_(headers, 'SKU');
  const iART = headerIndex_(headers, 'ARTICULO');

  if (iSKU < 0) throw new Error('STOCK MAESTRO: falta columna SKU');

  const values = sh.getRange(2,1,last-1,sh.getLastColumn()).getValues();

  const bySku = new Map();
  for (let r = 0; r < values.length; r++) {
    const sku = String(values[r][iSKU] || '').trim().toUpperCase();
    if (!sku) continue;
    bySku.set(sku, {
      articulo: iART >= 0 ? String(values[r][iART] || '').trim() : '',
      owner: parseSkuParts(sku).owner || '' // SCNL si termina en -SCNL
    });
  }

  return { bySku, headers };
}

function lookupBySku_(lookup, sku) {
  if (!sku) return null;
  return lookup.bySku.get(String(sku).trim().toUpperCase()) || null;
}


/***********************
 * STOCK / BÚSQUEDAS
 ***********************/
function searchStock_({ articulo, talle, ownerScnl, q, limit }) {
  const sh = getSheet(STOCK_SPREADSHEET_ID, STOCK_SHEET_NAME);
  const values = sh.getDataRange().getValues();
  if (!values.length) return { ok: true, data: [] };

  const headers = values[0].map(h => String(h).trim());
  const iSKU = headers.indexOf('SKU');
  const iART = headers.indexOf('ARTICULO');
  if (iSKU < 0 || iART < 0) return { ok:false, error:'Faltan columnas SKU/ARTICULO' };

  const nArt = _norm_(articulo || '');
  const nQ   = _norm_(q || '');
  const T = String(talle || '').toUpperCase();
  const tail = T ? `-${T}` : '';
  const wantOwner = !!ownerScnl;

  const out = [];
  const max = Math.max(1, Number(limit || 25));

  for (let r = 1; r < values.length; r++) {
    const sku = String(values[r][iSKU] || '').trim();
    const art = String(values[r][iART] || '').trim();
    if (!sku || !art) continue;

    if (nArt && !_norm_(art).includes(nArt)) continue;
    if (nQ && !(_norm_(art).includes(nQ) || _norm_(sku).includes(nQ))) continue;

    if (tail) {
      const skuUp = sku.toUpperCase();
      const endsBasic = skuUp.endsWith(tail);
      const endsOwner = skuUp.endsWith(tail + '-SCNL');
      const matchesTail = endsBasic || endsOwner;
      if (!matchesTail) continue;
      if (wantOwner && !endsOwner) continue;
      if (!wantOwner && endsOwner) continue;
    }

    out.push({ sku, articulo: art });
    if (out.length >= max) break;
  }
  return { ok: true, data: out };
}

function findSkuByArticuloTalle_(articulo, talle, owner) {
  if (!articulo || !talle) return '';
  const sh = getSheet(STOCK_SPREADSHEET_ID, STOCK_SHEET_NAME);
  const values = sh.getDataRange().getValues();
  if (!values.length) return '';
  const headers = values[0];
  const idxSKU   = headerIndex_(headers, SKU_HEADER);
  const idxItem  = headerIndex_(headers, ITEM_HEADER);
  if (idxSKU < 0 || idxItem < 0) return '';

  const suffix = '-' + String(talle).toUpperCase() + (owner ? ('-' + owner.toUpperCase()) : '');
  for (let r = 1; r < values.length; r++) {
    const row = values[r];
    if (_norm_(row[idxItem]) === _norm_(articulo)) {
      const candidate = String(row[idxSKU]).trim();
      if (candidate.toUpperCase().endsWith(suffix.toUpperCase())) return candidate;
    }
  }
  return '';
}

function recomputeRowTotal_(stockSh, row, headers) {
  const sizes = stockSizeColumnsFromHeaders_(headers);
  const sum = sizes
    .map(function(sz) {
      var col = sizeColFromHeaders_(headers, sz);
      return col ? Number(stockSh.getRange(row, col).getValue() || 0) : 0;
    })
    .reduce(function(a,b){ return a+b; }, 0);

  const idxTotal = headerIndex_(headers, STOCK_TOTAL_HEADER);
  if (idxTotal >= 0) stockSh.getRange(row, idxTotal + 1).setValue(sum);
}

function isGiftySku_(sku) {
  const s = String(sku || '').trim().toUpperCase();
  return s === 'GIFTY' || s.indexOf('GIFTY-') === 0;
}

function adjustStockForItems(items, sign) {
  const stockSh = getSheet(STOCK_SPREADSHEET_ID, STOCK_SHEET_NAME);
  const headers = stockSh.getRange(1,1,1,stockSh.getLastColumn()).getValues()[0];

  items.forEach(it => {
    const rawSku = String(it.sku || '').trim();
    const sku = rawSku.toUpperCase(); // clave para matchear STOCK MAESTRO
    const qty = Number(it.cantidad || 0);
    if (!sku || !qty) return;
    if (isGiftySku_(sku)) return;

    const { size } = parseSkuParts(sku);
    if (!size) throw new Error(`SKU sin talle válido: ${sku}`);

    const row = findRowBySku(stockSh, sku);
    if (!row) throw new Error(`SKU no encontrado en stock: ${sku}`);

    const col = sizeColFromHeaders_(headers, size);
    if (!col) throw new Error(`Columna no mapeada para talle ${size}`);

    const cell = stockSh.getRange(row, col);
    const prev = Number(cell.getValue() || 0);
    const next = prev + (sign * qty);
    if (next < 0) throw new Error(`Stock negativo para ${sku} (${size}). Prev=${prev}, qty=${qty}`);

    cell.setValue(next);
    recomputeRowTotal_(stockSh, row, headers);
  });
}

/***********************
 * ALERTAS STOCK < 2
 ***********************/
function findLowStockRows_() {
  const sh = getSheet(STOCK_SPREADSHEET_ID, STOCK_SHEET_NAME);
  const values = sh.getDataRange().getValues();
  if (!values.length) return [];

  const headers = values[0].map(h => String(h).trim());
  const idxSKU   = headerIndex_(headers, SKU_HEADER);
  const idxItem  = headerIndex_(headers, ITEM_HEADER);
  const idxTotal = headerIndex_(headers, STOCK_TOTAL_HEADER);

  if (idxSKU < 0 || idxTotal < 0)
    throw new Error('No encuentro columnas de SKU/Stock Total. Revisá encabezados en STOCK MAESTRO.');

  const low = [];
  for (let r = 1; r < values.length; r++) {
    const row = values[r];
    const total = Number(row[idxTotal] ?? 0);
    if (!isNaN(total) && total < ALERT_THRESHOLD) {
      low.push({
        sku: String(row[idxSKU] ?? ''),
        item: idxItem >= 0 ? String(row[idxItem] ?? '') : '',
        total,
        rowIndex: r + 1
      });
    }
  }
  return low;
}

function sendLowStockEmail_(rows) {
  if (!rows.length) return;
  const subject = `ALERTA: ${rows.length} SKU con stock < ${ALERT_THRESHOLD}`;
  const htmlBody =
    `<p>Se detectaron SKU con stock bajo:</p>
     <table border="1" cellpadding="6" cellspacing="0">
      <tr><th>SKU</th><th>Artículo</th><th>Stock Total</th></tr>
      ${rows.map(r => `<tr><td>${r.sku}</td><td>${r.item}</td><td>${r.total}</td></tr>`).join('')}
     </table>
     <p>Hoja: <b>${STOCK_SHEET}</b></p>`;
  MailApp.sendEmail({ to: ALERT_RECIPIENTS.join(','), subject, htmlBody });
}

function checkLowStock() {
  const low = findLowStockRows_();
  if (low.length) sendLowStockEmail_(low);
}

function checkLowStockForSkus_(skuList) {
  if (!skuList || !skuList.length) return;
  const sh = getSheet(STOCK_SPREADSHEET_ID, STOCK_SHEET_NAME);
  const values = sh.getDataRange().getValues();
  const headers = values[0].map(h => String(h).trim());
  const idxSKU   = headerIndex_(headers, SKU_HEADER);
  const idxItem  = headerIndex_(headers, ITEM_HEADER);
  const idxTotal = headerIndex_(headers, STOCK_TOTAL_HEADER);

  const skuSet = new Set(skuList.map(s => String(s).trim().toUpperCase()));
  const low = [];

  for (let r = 1; r < values.length; r++) {
    const row = values[r];
    const sku = String(row[idxSKU] ?? '').trim().toUpperCase();
    if (!skuSet.has(sku)) continue;
    const total = Number(row[idxTotal] ?? 0);
    if (!isNaN(total) && total < ALERT_THRESHOLD) {
      low.push({
        sku: String(row[idxSKU] ?? ''),
        item: idxItem >= 0 ? String(row[idxItem] ?? '') : '',
        total,
        rowIndex: r + 1,
      });
    }
  }
  if (low.length) sendLowStockEmail_(low);
}

/***********************
 * MODELOS / WRITE
 ***********************/
function nextRemitoId() { return 'R-' + new Date().getTime(); }

function countOwnerSCNL(items) {
  let count = 0;
  items.forEach(it => {
    const sku = String(it.sku || '');
    if (sku.toUpperCase().endsWith('-SCNL')) count += Number(it.cantidad || 0);
  });
  return count;
}

function ensureSheets_() {
  const ss = openSS(SPREADSHEET_ID);

  // ===== REMITOS =====
  let shR = ss.getSheetByName(SHEET_REMITOS);
  if (!shR) shR = ss.insertSheet(SHEET_REMITOS);

ensureHeaders_(shR, [
  'ID Remito',
  'Fecha',
  'Nombre',
  'DNI',
  'Provincia/Localidad',
  'Telefono',
  'Transporte',
  'Metodo De Pago',
  'Vendedor',
  'Condicion Compra',
  'Total De Prendas',
  'Subtotal',
  'Costo De Envio',
  'Recargo/Descuento',
  'Total Final',
  'Estado',
  'Detalle general',
  'SCNL_Items',

  // ===== Envío / Owner =====
  'Shipping Customer Cost',
  'Envio Owner',
  'Shipping Owner Cost',
  'Dueño SCNL Monto',

  // ===== MATCH TN <-> MP =====
  'TN_ORDER_ID',
  'MP_PAYMENT_ID',
  'MP_ADDITIONAL_REFERENCE',
  'MP_MATCH_CONFIDENCE',
  'MP_MATCH_RULE',
  'MP_MATCHED_AT',
  'MP_IMPORTED_AT',

  // ===== Estado / fechas MP =====
  'MP_STATUS',
  'MP_STATUS_DETAIL',
  'MP_DATE_CREATED',
  'MP_DATE_APPROVED',
  'MP_MONEY_RELEASE_DATE',
  'MP_ACREDITADO_FECHA',

  // ===== Montos MP (reales) =====
  'MP_TRANSACTION_AMOUNT',
  'MP_NET_RECEIVED_AMOUNT',
  'MP_NETO_REAL_ORDEN',
  'MP_TAX_TOTAL_REAL',
  'MP_FINANCING_TOTAL_REAL',
  'MP_FEE_TOTAL_REAL',
  'MP_PLATFORM_FEE_TOTAL_REAL',
  'MP_TOTAL_COST_REAL',

  // ===== Metadata MP =====
  'MP_PAYER_EMAIL',
  'MP_PAYMENT_TYPE',
  'MP_PAYMENT_METHOD',
  'MP_INSTALLMENTS'
]);

  // ===== REMITO_ITEMS =====
  let shI = ss.getSheetByName(SHEET_ITEMS);
  if (!shI) shI = ss.insertSheet(SHEET_ITEMS);

 ensureHeaders_(shI, [
  'ID Remito',
  'Fecha',
  'SKU',
  'Articulo',
  'Talle',
  'Cantidad',
  'Precio Unitario',
  'Owner',

  // ✅ para que matchee con saveRemito()
  'Metodo De Pago',

  // ===== Legacy alloc =====
  'DESCUENTO_ASIGNADO',
  'SHIPPING_ASIGNADO',
  'FEE_ASIGNADO',
  'NETO_PRENDA',

  // ===== MP per-item (REAL asignado) =====
  'MP_METHOD',
  'MP_PAYMENT_ID',
  'MP_STATUS',
  'MP_INSTALLMENTS',
  'MP_PAYMENT_TYPE',

  'MP_TAX_ASIGNADO_REAL',
  'MP_FINANCING_ASIGNADO_REAL',
  'MP_FEE_ASIGNADO_REAL',
  'MP_PLATFORM_FEE_ASIGNADO_REAL',
  'MP_TOTAL_COST_ASIGNADO_REAL',

  'NETO_PRENDA_REAL',

  // ===== Split por dueño =====
  'NETO_PRENDA_SCNL',
  'NETO PRENDA 8Q'
]);
   return { ss, shR, shI };
}
 
function firstEmptyRow_(sh, cols = 7) {
  const last = sh.getLastRow();
  if (last < 2) return 2;
  const values = sh.getRange(2, 1, last - 1, cols).getValues();
  let lastDataIdx = -1;
  for (let i = values.length - 1; i >= 0; i--) {
    if (values[i].some(v => String(v).trim() !== "")) { lastDataIdx = i; break; }
  }
  if (lastDataIdx === -1) return 2;
  return 2 + lastDataIdx + 1;
}

function writeRemitoItemsSafe_(shI, rows) {
  if (!rows || !rows.length) return;
  try {
    const start = firstEmptyRow_(shI, rows[0].length);
    shI.getRange(start, 1, rows.length, rows[0].length).setValues(rows);
  } catch (err) {
    Logger.log('[REMITO_ITEMS] setValues falló, uso appendRow. Motivo: ' + err);
    rows.forEach(r => {
      try { shI.appendRow(r); }
      catch (e2) {
        Logger.log('[REMITO_ITEMS] appendRow falló: ' + e2 + ' | fila=' + JSON.stringify(r));
      }
    });
  }
}

function toNumber_(v) {
  if (typeof v === 'number') return v;
  const s = String(v || '').trim();
  if (!s) return 0;
  const clean = s.replace(/[^\d.,-]/g, '');
  if (clean.includes(',') && clean.includes('.'))
    return Number(clean.replace(/\./g, '').replace(',', '.')) || 0;
  if (clean.includes(',') && !clean.includes('.'))
    return Number(clean.replace(',', '.')) || 0;
  return Number(clean) || 0;
}

function fromCents_(c) {
  return (Number(c || 0) / 100);
}

/**
 * REMITO_ITEMS: SHIPPING_ASIGNADO solo si 8Q absorbió (cabecera Shipping Owner Cost).
 * Si el cliente pagó envío, forzar 0 en todos los ítems.
 */
function applyRemitoItemsShippingAlloc_(expanded, shippingCustomerCost, shippingOwnerCost) {
  const scc = toNumber_(shippingCustomerCost);
  const soc = toNumber_(shippingOwnerCost);
  const pool = scc > 0 ? 0 : (soc > 0 ? soc : 0);

  if (pool <= 0) {
    expanded.forEach(function (it) { it.shippingAsignado = 0; });
    return;
  }

  const weights = expanded.map(function (it) {
    return Math.max(0, toNumber_(it.precioUnitario));
  });
  const shipCents = allocateProportionalCents_(pool, weights);
  for (var i = 0; i < expanded.length; i++) {
    expanded[i].shippingAsignado = fromCents_(shipCents[i]);
  }
}

/** NETO_PRENDA = prenda neta; envío va solo en SHIPPING_ASIGNADO. */
function recomputeNetoUnitarioFromAllocs_(it) {
  const precio = toNumber_(it.precioUnitario);
  const desc = toNumber_(it.descuentoAsignado);
  const fee = toNumber_(it.feeAsignado);
  it.netoUnitario = precio - desc - fee;
}

function expandItemLines_(raw) {
  const sizes = VALID_STOCK_SIZES.slice();
  const out = [];

  let baseSku = String(raw.sku || '').trim();
  let articulo = String(raw.articulo || '').trim();

  // owner SOLO SCNL o ""
  let ownerTag = normalizeOwner_(raw.owner);

  const precioUnitario = toNumber_(raw.precioUnitario);

  // ✅ PRESERVAR allocs que vienen desde Next.js
  const descuentoAsignado = toNumber_(raw.descuentoAsignado);
  const shippingAsignado = toNumber_(raw.shippingAsignado);
  const feeAsignado = toNumber_(raw.feeAsignado);
  const netoUnitario = toNumber_(raw.netoUnitario);

  // Normalizamos SKU a uppercase para matcheo
  if (baseSku) baseSku = baseSku.toUpperCase();

  // Si solo vino SKU, intentar completar artículo/owner
  if (baseSku && !articulo) {
    const info = findArticuloOwnerBySku_(baseSku);
    if (info.articulo) articulo = info.articulo;
    if (!ownerTag && info.owner) ownerTag = normalizeOwner_(info.owner);
  }

  // Caso 1: modelo nuevo -> cantidades por talle en la misma fila (S,M,L...)
  let hasSizeColumns = false;
  sizes.forEach(sz => { if (Number(raw[sz] || 0) > 0) hasSizeColumns = true; });

  if (hasSizeColumns) {
    sizes.forEach(sz => {
      const qty = Number(raw[sz] || 0);
      for (let i = 0; i < qty; i++) {
        const finalSku = ensureSizeInSku_(baseSku, sz, ownerTag);
        const parsed = parseSkuParts(finalSku);
        out.push({
          sku: finalSku,
          articulo,
          talle: parsed.size || sz,
          cantidad: 1,
          precioUnitario,
          owner: normalizeOwner_(ownerTag || parsed.owner || ''),
          descuentoAsignado,
          shippingAsignado,
          feeAsignado,
          netoUnitario
        });
      }
    });
    return out;
  }

  // Caso 2: compatibilidad vieja -> {talle, cantidad}
  const talle = String(raw.talle || '').trim().toUpperCase();
  const cantidad = Number(raw.cantidad || 0);

  if (cantidad > 0) {
    const parsed0 = parseSkuParts(baseSku);
    const inferred = parsed0.size || talle;

    const finalSku = ensureSizeInSku_(baseSku, inferred, ownerTag);
    const parsed = parseSkuParts(finalSku);

    for (let i = 0; i < cantidad; i++) {
      out.push({
        sku: finalSku,
        articulo,
        talle: parsed.size || inferred,
        cantidad: 1,
        precioUnitario,
        owner: normalizeOwner_(ownerTag || parsed.owner || ''),
        descuentoAsignado,
        shippingAsignado,
        feeAsignado,
        netoUnitario
      });
    }
  }

  return out;
}


function saveRemito(data) {
  if (!data || !Array.isArray(data.items)) {
    throw new Error("Datos incompletos: items requerido");
  }

   Logger.log("SR-00 ENTER saveRemito");
   Logger.log("SR-00 keys=" + Object.keys(data || {}).join(","));
   Logger.log("SR-00 det=" + String(data?.detalleGeneral || ""));


  // -------------------------
  // Anti-duplicado (idempotencia) por TN_ORDER_ID (Detalle general)
  // -------------------------
  const det = String(data.detalleGeneral || "").trim();
  if (det && det.includes("TN_ORDER_ID=")) {
    if (existsDetalleGeneral_(det)) {
      return { ok: true, duplicated: true, apiVersion: API_VERSION };
    }
  }

  const { shR, shI } = ensureSheets_();

  const id = nextRemitoId();
  const fecha = data.fechaISO ? new Date(data.fechaISO) : new Date();
  const estadoFinal = String(data.estado || "Pendiente");

  // Lookup una sola vez (performance)
  const stockLookup = getStockLookup_();

  // -------------------------
  // Helpers numéricos (0 válido)
  // -------------------------
  const num = (v, fallback = 0) => {
    const n = Number(v);
    return Number.isFinite(n) ? n : fallback;
  };

  const pickMoney = (...vals) => {
    for (let i = 0; i < vals.length; i++) {
      const v = vals[i];
      // 0 explícito debe ser válido
      if (v === 0 || v === "0" || v === "0.00") return 0;
      const n = toNumber_(v);
      // si es número finito (incluye 0) devolvelo; si es NaN, seguí
      if (Number.isFinite(n)) return n;
    }
    return 0;
  };

  // -------------------------
  // Header maps (escritura por nombre de columna)
  // -------------------------
  const getHeaderMap_ = (sheet) => {
    const lastCol = sheet.getLastColumn();
    if (lastCol <= 0) throw new Error(`Hoja ${sheet.getName()} sin columnas`);
    const headers = sheet.getRange(1, 1, 1, lastCol).getValues()[0];
    const map = {};
    for (let c = 0; c < headers.length; c++) {
      const h = String(headers[c] || "").trim();
      if (!h) continue;
      map[h] = c + 1; // 1-indexed col
    }
    return map;
  };

  const setRowByHeader_ = (sheet, headerMap, rowIndex, valuesByHeader) => {
    const width = sheet.getLastColumn();
    const row = new Array(width).fill("");

    Object.keys(valuesByHeader).forEach((h) => {
      const col = headerMap[h];
      if (!col) return; // si no existe la columna, ignorar
      row[col - 1] = valuesByHeader[h];
    });

    sheet.getRange(rowIndex, 1, 1, width).setValues([row]);
  };

  const appendRowByHeader_ = (sheet, headerMap, valuesByHeader) => {
    const rowIndex = sheet.getLastRow() + 1;
    setRowByHeader_(sheet, headerMap, rowIndex, valuesByHeader);
    return rowIndex;
  };

  const headerR = getHeaderMap_(shR);
  const headerI = getHeaderMap_(shI);

  // -------------------------
  // Totales (prioriza totales.*)
  // -------------------------
  Logger.log("SR-10 BEFORE totals");

  const subtotal = pickMoney(data?.totales?.subtotal, data?.subtotal);

// =========================
// SHIPPING NORMALIZADO
// =========================

const shippingCustomerCostIn = pickMoney(
  data?.shippingCustomerCost,
  data?.totales?.shippingCustomerCost,
  data?.shipping, // fallback legacy
  data?.costoEnvioCliente // fallback legacy
);

const shippingOwnerCostIn = pickMoney(
  data?.shippingOwnerCost,
  data?.totales?.shippingOwnerCost,
  data?.costoEnvioOwner,
  data?.totales?.costoEnvioOwner
);

const totalFinal = pickMoney(data?.totales?.totalFinal, data?.totalFinal);

// En Remitos: Recargo/Descuento (negativo si es descuento)
const recargoDescuento = num(data?.recargoDescuento, 0);

// Cabecera shipping normalizada (cliente paga → SCC; gratis 8Q → SOC)
let shippingCustomerCost = 0;
let shippingOwnerCost = 0;
let envioOwnerFinal = "";

if (shippingCustomerCostIn > 0) {
  envioOwnerFinal = "CLIENTE";
  shippingCustomerCost = shippingCustomerCostIn;
  shippingOwnerCost = 0;
} else if (shippingOwnerCostIn > 0) {
  envioOwnerFinal = "8Q";
  shippingCustomerCost = 0;
  shippingOwnerCost = shippingOwnerCostIn;
} else {
  envioOwnerFinal = "";
}

  // -------------------------
  // Canonización de items: SKU/ARTICULO/OWNER/TALLE antes del expand (NO muta data.items)
  // -------------------------
  const canonItems = data.items.map((raw) => {
    const out = { ...raw };

    let sku = String(out.sku || "").trim().toUpperCase();
    let articulo = String(out.articulo || "").trim();
    let owner = normalizeOwner_(out.owner);
    let talle = String(out.talle || "").trim().toUpperCase();

    const infoBySku = sku ? lookupBySku_(stockLookup, sku) : null;

    if (infoBySku) {
      if (infoBySku.articulo) articulo = infoBySku.articulo;
      if (!owner && infoBySku.owner) owner = normalizeOwner_(infoBySku.owner);
    }

    if ((!sku || !infoBySku) && articulo && talle) {
      const resolvedSku = findSkuByArticuloTalleOwner_(articulo, talle, owner);
      if (resolvedSku) {
        sku = String(resolvedSku).trim().toUpperCase();
        const info2 = lookupBySku_(stockLookup, sku);
        if (info2 && info2.articulo) articulo = info2.articulo;
        if (!owner && info2 && info2.owner) owner = normalizeOwner_(info2.owner);
      }
    }

    out.sku = sku;
    out.articulo = articulo;
    out.owner = owner;
    out.talle = talle;

    // Normalizamos nombres que pueden venir de Next
    out.descuentoAsignado = out.descuentoAsignado ?? out.DESCUENTO_ASIGNADO ?? 0;
    out.shippingAsignado  = out.shippingAsignado  ?? out.SHIPPING_ASIGNADO  ?? 0;
    out.feeAsignado       = out.feeAsignado       ?? out.FEE_ASIGNADO       ?? 0;
    out.netoUnitario      = out.netoUnitario      ?? out.netoPrenda         ?? out.NETO_PRENDA ?? 0;

    return out;
  });

  // -------------------------
  // Expand: 1 prenda = 1 fila
  // -------------------------
  const expanded = canonItems.flatMap(expandItemLines_);
  const bad = expanded.find((it) => Number(it.cantidad || 0) !== 1);
  if (bad) throw new Error("Regla violada: cantidad distinta de 1 en expanded");

  // -------------------------
  // Asegurar asignaciones por prenda:
  // - Preferimos lo que viene desde Next
  // - Si no viniera, fallback a computeNetosProporcionales_
  // -------------------------
  const hasDiscountOrNetoFromNext = expanded.some((it) => {
    return (
      num(it.descuentoAsignado, 0) !== 0 ||
      num(it.feeAsignado, 0) !== 0 ||
      num(it.netoUnitario, 0) !== 0
    );
  });

  const isSingleItem = expanded.length === 1;

const normalizeDiscountAsignado_ = (x) => {
  const v = num(x || 0);

  // En el ERP, DESCUENTO_ASIGNADO es "monto a restar" (no soporta negativos).
  // El bug se da en órdenes de 1 prenda, entonces lo corregimos solo ahí.
  if (!isSingleItem) return v;

  return v < 0 ? Math.abs(v) : v;
};

  if (!hasDiscountOrNetoFromNext) {
    const calc = computeNetosProporcionales_(expanded, subtotal, shippingCustomerCost, totalFinal, {
   costoEnvioOwner: shippingOwnerCost, // pool 8Q ya normalizado (0 si CLIENTE)
   feeTotal: 0
   });


    if (!calc || !calc.ok) {
      throw new Error("No se pudo calcular netos: " + String(calc?.reason || "sin detalle"));
    }

    const itemsOut = Array.isArray(calc.itemsOut) ? calc.itemsOut : [];
    if (itemsOut.length && itemsOut.length !== expanded.length) {
      throw new Error(
        `computeNetosProporcionales_ desalineado: itemsOut=${itemsOut.length} expanded=${expanded.length}`
      );
    }

    for (let i = 0; i < expanded.length; i++) {
      const it = expanded[i];
      const net = itemsOut[i] || {};
      it.descuentoAsignado = normalizeDiscountAsignado_(net.descuentoUnit || 0);
      it.shippingAsignado  = num(net.shippingUnit || 0);
      it.feeAsignado       = num(net.feeUnit || 0);
      it.netoUnitario      = num(net.netoUnit || net.precioNetoUnit || 0);
    }
  } else {
    // Descuentos/netos desde Next.js; shipping en ítems se normaliza abajo desde cabecera.
    for (const it of expanded) {
      it.descuentoAsignado = normalizeDiscountAsignado_(it.descuentoAsignado || 0);
      it.feeAsignado       = num(it.feeAsignado || 0);
      it.netoUnitario      = num(it.netoUnitario || it.netoPrenda || 0);
    }
  }

  applyRemitoItemsShippingAlloc_(expanded, shippingCustomerCost, shippingOwnerCost);
  expanded.forEach(recomputeNetoUnitarioFromAllocs_);

  // -------------------------
  // Stock: descontar SOLO si Pagado
  // -------------------------
  if (estadoFinal === "Pagado") {
    const aggregated = {};
    for (const it of expanded) {
      const sku = String(it.sku || "").trim().toUpperCase();
      if (!sku || isGiftySku_(sku)) continue;
      aggregated[sku] = (aggregated[sku] || 0) + 1;
    }

    const itemsForStock = Object.keys(aggregated).map((sku) => ({
      sku,
      cantidad: aggregated[sku],
    }));

    adjustStockForItems(itemsForStock, -1);
  }

  const scnlCount = countOwnerSCNL(expanded);

  // (Opcional) Monto SCNL: suma de netoUnitario de items SCNL
  const scnlMonto = expanded.reduce((acc, it) => {
    const sku = String(it.sku || "").toUpperCase();
    if (sku.endsWith("-SCNL")) return acc + num(it.netoUnitario, 0);
    return acc;
  }, 0);

  // (Opcional) listado SCNL
  const scnlItemsText = expanded
    .filter((it) => String(it.sku || "").toUpperCase().endsWith("-SCNL"))
    .map((it) => `${String(it.sku || "").toUpperCase()} (${String(it.talle || "").toUpperCase()})`)
    .join(" | ");

// -------------------------
// REMITOS (cabecera) — escribir por header
// -------------------------
Logger.log("SR-20 BEFORE remitosValues");

const nombreCliente =
  data.nombre ?? data.cliente ?? data.customerName ?? "";

const provinciaLocalidad =
  (data.provincia && data.localidad)
    ? `${data.provincia} - ${data.localidad}`
    : (data.localidad || data.provincia || "");

const metodoPagoVal = String(
  data?.metodoPago ??
  data?.metodo_de_pago ??
  data?.paymentMethod ??
  ""
).trim();

const remitosValues = {
  "ID Remito": id,
  "Fecha": fecha,

  // En tu sheet real es "Nombre" y "Provincia/Localidad"
  "Nombre": nombreCliente,
  "Cliente": nombreCliente, // compat

  "DNI": data.dni || "",

  "Provincia/Localidad": provinciaLocalidad,
  "Ubicacion": provinciaLocalidad, // compat

  "Telefono": data.telefono || "",

  "Transporte": data.transporte || "",

  // En tu sheet real es "Metodo De Pago"
  "Metodo De Pago": metodoPagoVal,
  "Metodo Pago": metodoPagoVal, // compat

  "Vendedor": data.vendedor || "",
  "Condicion Compra": data.condicionCompra || "",
  "Total De Prendas": expanded.length,

  "Subtotal": subtotal,
  "Shipping Customer Cost": shippingCustomerCost,
  "Envio Owner": envioOwnerFinal,
  "Shipping Owner Cost": shippingOwnerCost,

  "Recargo/Descuento": recargoDescuento,
  "Total Final": totalFinal,
  "Estado": estadoFinal,
  "Detalle general": data.detalleGeneral || "",

  "Dueño SCNL Cant": scnlCount,
  "Dueño SCNL Monto": scnlMonto || 0,
  "SCNL_Items": scnlItemsText || "",
};

Logger.log("SR-20 subtotal=" + subtotal);
Logger.log("SR-20 shippingCustomerCost=" + shippingCustomerCost);
Logger.log("SR-20 envioOwnerFinal=" + envioOwnerFinal);
Logger.log("SR-20 shippingOwnerCost=" + shippingOwnerCost);
Logger.log("SR-20 recargoDescuento=" + recargoDescuento);
Logger.log("SR-20 totalFinal=" + totalFinal);
Logger.log("SR-20 scnlCount=" + scnlCount);
Logger.log("SR-20 scnlMonto=" + scnlMonto);
Logger.log("SR-20 scnlItemsText=" + scnlItemsText);

appendRowByHeader_(shR, headerR, remitosValues);

  // -------------------------
  // REMITOS_ITEMS (unitario) — escritura masiva por header
  // -------------------------
  const rowsToWrite = expanded.map((it) => ({
    "Fecha": fecha,
    "ID Remito": id,
    "SKU": String(it.sku || "").toUpperCase(),
    "Articulo": it.articulo || "",
    "Talle": String(it.talle || "").toUpperCase(),
    "Cantidad": 1,
    "Precio Unitario": num(it.precioUnitario, 0),
    "Owner": normalizeOwner_(it.owner || ""),

    "DESCUENTO_ASIGNADO": num(it.descuentoAsignado, 0),
    "SHIPPING_ASIGNADO": num(it.shippingAsignado, 0),
    "FEE_ASIGNADO": num(it.feeAsignado, 0),

    // FIX CRÍTICO: tu código estaba escribiendo it.netoPrenda (que no existe acá)
    "NETO_PRENDA": num(it.netoUnitario, 0),
    "Metodo De Pago": metodoPagoVal,

  }));

  if (rowsToWrite.length) {
    const width = shI.getLastColumn();
    const startRow = shI.getLastRow() + 1;

    const matrix = rowsToWrite.map((obj) => {
      const row = new Array(width).fill("");
      Object.keys(obj).forEach((h) => {
        const col = headerI[h];
        if (!col) return;
        row[col - 1] = obj[h];
      });
      return row;
    });

    shI.getRange(startRow, 1, matrix.length, width).setValues(matrix);
  }

  // Alertas bajo stock
  const skusAfectados = [
    ...new Set(expanded.map((i) => String(i.sku || "").toUpperCase()).filter(Boolean)),
  ];

  try {
    checkLowStockForSkus_(skusAfectados);
  } catch (e) {
    Logger.log("[ALERT] " + e);
  }

  return { ok: true, id, apiVersion: API_VERSION };
}



function computeNetosProporcionales_(expanded, subtotal, costoEnvioCliente, totalFinal, opts) {
  try {
    const o = opts || {};
    const costoEnvioOwner = Number(o.costoEnvioOwner || 0) || 0; // envío absorbido por la marca
    const feeTotal = Number(o.feeTotal || 0) || 0;               // fee pasarela (si aplica)

    if (!Array.isArray(expanded) || expanded.length === 0) {
      return { ok: false, reason: 'expanded vacío', itemsOut: [] };
    }

    // Helpers
    const toCents = (n) => Math.round((Number(n || 0) || 0) * 100);
    const fromCents = (c) => (Number(c || 0) / 100);

    // Base bruta por ítems (más confiable que "subtotal" si ese vino neto)
    const prices = expanded.map(it => Number(it.precioUnitario || 0) || 0);
    const grossItems = prices.reduce((a, b) => a + b, 0);

    const shippingCharged = Number(costoEnvioCliente|| 0) || 0; // lo que pagó el cliente en shipping (0 si fue gratis)
    const totalPaid = Number(totalFinal || 0) || 0;

    // Descuento/cupón/promo inferido:
    // Si el totalFinal ya incluye shippingCharged, esta ecuación detecta el descuento total.
    const poolDescuento = grossItems + shippingCharged - totalPaid;

    // Porcentaje real sobre base bruta (sin shipping)
    const pctReal = grossItems > 0 ? (poolDescuento / grossItems) * 100 : 0;

    // Pools adicionales (costos nuestros)
    const poolShippingAbsorbido = costoEnvioOwner; // si envió gratis y lo pagamos nosotros, entra acá
    const poolFee = feeTotal;

    // Distribuidor proporcional con ajuste de centavos
    function allocateProportional(poolAmount, weights) {
      const poolCents = toCents(poolAmount);
      const sumW = weights.reduce((a, b) => a + b, 0);

      if (poolCents === 0 || sumW <= 0) {
        return new Array(weights.length).fill(0);
      }

      // cuota ideal en centavos (float), para decidir remanentes
      const ideals = weights.map(w => (poolCents * (w / sumW)));
      const floors = ideals.map(x => (x >= 0 ? Math.floor(x) : Math.ceil(x))); // soporta pool negativo (recargo)
      let used = floors.reduce((a, b) => a + b, 0);
      let rem = poolCents - used;

      // Ordenamos por mayor parte decimal (para repartir remanente)
      const frac = ideals.map((x, i) => ({
        i,
        frac: x - floors[i]
      }));

      // Si rem > 0 sumamos 1 centavo a los de mayor fracción.
      // Si rem < 0 restamos 1 centavo a los de menor fracción (más negativos).
      if (rem > 0) {
        frac.sort((a, b) => b.frac - a.frac);
        for (let k = 0; k < rem; k++) floors[frac[k % frac.length].i] += 1;
      } else if (rem < 0) {
        frac.sort((a, b) => a.frac - b.frac);
        for (let k = 0; k < Math.abs(rem); k++) floors[frac[k % frac.length].i] -= 1;
      }

      return floors; // en centavos
    }

    const weights = prices.map(p => (p > 0 ? p : 0));

    const descCents = allocateProportional(poolDescuento, weights);
    const shipAbsCents = allocateProportional(poolShippingAbsorbido, weights);
    const feeCents = allocateProportional(poolFee, weights);

    const itemsOut = expanded.map((it, idx) => {
      const precio = Number(it.precioUnitario || 0) || 0;

      const descuentoUnit = fromCents(descCents[idx]);
      const shippingUnit  = fromCents(shipAbsCents[idx]); // costo absorbido por la marca
      const feeUnit       = fromCents(feeCents[idx]);

      // Neto por prenda (envío absorbido solo en shippingUnit / SHIPPING_ASIGNADO):
      // neto = precio - descuento - fee
      const netoUnit = (precio - descuentoUnit - feeUnit);

      return {
        precioUnit: precio,
        descuentoUnit,
        shippingUnit,
        feeUnit,
        netoUnit
      };
    });

    return {
      ok: true,
      pctReal,
      debug: {
        grossItems,
        shippingCharged,
        totalPaid,
        poolDescuento,
        poolShippingAbsorbido,
        poolFee
      },
      itemsOut
    };
  } catch (e) {
    return { ok: false, reason: String(e), itemsOut: [] };
  }
}



function listRemitos({ q }) {
  const sh = getSheet(SPREADSHEET_ID, SHEET_REMITOS);
  const last = sh.getLastRow();
  if (last < 2) return { ok:true, data:[] };

  const rng = sh.getRange(2,1,last-1, sh.getLastColumn());
  const vals = rng.getValues();
  const headers = sh.getRange(1,1,1,sh.getLastColumn()).getValues()[0];
  const idx = (name) => headerIndex_(headers, name);

  const data = vals.map(r => ({
    id: r[idx('ID Remito')],
    fecha: r[idx('Fecha')],
    nombre: r[idx('Nombre')],
    metodoPago: r[idx('Metodo De Pago')],
    vendedor: r[idx('Vendedor')],
    totalPrendas: r[idx('Total De Prendas')],
    totalFinal: r[idx('Total Final')],
    estado: r[idx('Estado')]
  }));

  if (q && String(q).trim()) {
    const s = _norm_(q);
    return {
      ok:true,
      data: data.filter(x =>
        _norm_(x.id).includes(s) ||
        _norm_(x.nombre).includes(s) ||
        _norm_(x.metodoPago).includes(s) ||
        _norm_(x.vendedor).includes(s) ||
        _norm_(x.estado).includes(s)
      )
    };
  }
  return { ok:true, data };
}
function listRemitosFull_({ q } = {}) {
  const sh = getSheet(SPREADSHEET_ID, SHEET_REMITOS);
  const values = sh.getDataRange().getValues();

  if (!values || values.length < 2) {
    return { ok: true, data: [] };
  }

  const headers = values[0].map(h => String(h || "").trim());

  const data = values.slice(1)
    .filter(row => row.some(cell => cell !== "" && cell !== null))
    .map(row => {
      const obj = {};

      headers.forEach((header, index) => {
        if (!header) return;

        let value = row[index];

        if (value instanceof Date) {
          value = value.toISOString();
        }

        obj[header] = value;
      });

      return obj;
    });

  return {
    ok: true,
    data: data
  };
}

function getRemitoById({ id }) {
  if (!id) throw new Error('id requerido');

  const shR = getSheet(SPREADSHEET_ID, SHEET_REMITOS);
  const shI = getSheet(SPREADSHEET_ID, SHEET_ITEMS);

  const lastR = shR.getLastRow();
  if (lastR < 2) return { ok: false, error: 'No hay remitos' };

  const hdrR = shR.getRange(1, 1, 1, shR.getLastColumn()).getValues()[0];
  const idxR = (n) => headerIndex_(hdrR, n);
  const getCell = (row, idx) => (idx === -1 ? '' : row[idx]);

  const rngR = shR.getRange(2, 1, lastR - 1, shR.getLastColumn()).getValues();
  const rowR = rngR.find((r) => String(getCell(r, idxR('ID Remito'))) === String(id));
  if (!rowR) return { ok: false, error: 'No existe ese remito' };

  const pickIdx = (...names) => {
    for (const n of names) {
      const i = idxR(n);
      if (i !== -1) return i;
    }
    return -1;
  };

  const remito = {
    id: String(id),
    fecha: getCell(rowR, pickIdx('Fecha')),
    nombre: getCell(rowR, pickIdx('Cliente', 'Nombre')),
    dni: getCell(rowR, pickIdx('DNI')),
    ubicacion: getCell(
      rowR,
      pickIdx('Ubicacion', 'Ubicación', 'Provincia/Localidad', 'Localidad', 'Provincia')
    ),
    telefono: getCell(rowR, pickIdx('Telefono', 'Teléfono')),
    transporte: getCell(rowR, pickIdx('Transporte')),
    metodoPago: getCell(rowR, pickIdx('Metodo Pago', 'Metodo De Pago', 'Método Pago', 'Método De Pago')),
    vendedor: getCell(rowR, pickIdx('Vendedor')),
    condicionCompra: getCell(rowR, pickIdx('Condicion Compra', 'Condición Compra')),
    totales: {
      prendas: getCell(rowR, pickIdx('Total De Prendas')),
      subtotal: getCell(rowR, pickIdx('Subtotal')),
      shippingCustomerCost: getCell(
        rowR,
        pickIdx('Shipping Customer Cost', 'Costo De Envio', 'Costo Envio')
      ),
      envioOwner: getCell(rowR, pickIdx('Envio Owner', 'Envío Owner')),
      shippingOwnerCost: getCell(rowR, pickIdx('Shipping Owner Cost')),
      totalFinal: getCell(rowR, pickIdx('Total Final')),
    },
    recargoDescuento: getCell(rowR, pickIdx('Recargo/Descuento')),
    estado: getCell(rowR, pickIdx('Estado')),
    detalleGeneral: getCell(rowR, pickIdx('Detalle general')),
    scnlItems: getCell(rowR, pickIdx('SCNL_Items')),
    scnlMonto: getCell(rowR, pickIdx('Dueño SCNL Monto')),
    // MP — read-only desde REMITOS (sin recalcular)
    mpPaymentId: getCell(rowR, pickIdx('MP_PAYMENT_ID')),
    mpStatus: getCell(rowR, pickIdx('MP_STATUS')),
    mpStatusDetail: getCell(rowR, pickIdx('MP_STATUS_DETAIL')),
    mpPaymentType: getCell(rowR, pickIdx('MP_PAYMENT_TYPE')),
    mpPaymentMethod: getCell(rowR, pickIdx('MP_PAYMENT_METHOD')),
    mpInstallments: getCell(rowR, pickIdx('MP_INSTALLMENTS')),
    mpTransactionAmount: getCell(rowR, pickIdx('MP_TRANSACTION_AMOUNT')),
    mpNetReceivedAmount: getCell(rowR, pickIdx('MP_NET_RECEIVED_AMOUNT')),
    mpTaxTotalReal: getCell(rowR, pickIdx('MP_TAX_TOTAL_REAL')),
    mpFinancingTotalReal: getCell(rowR, pickIdx('MP_FINANCING_TOTAL_REAL')),
    mpFeeTotalReal: getCell(rowR, pickIdx('MP_FEE_TOTAL_REAL')),
    mpPlatformFeeTotalReal: getCell(rowR, pickIdx('MP_PLATFORM_FEE_TOTAL_REAL')),
    mpTotalCostReal: getCell(rowR, pickIdx('MP_TOTAL_COST_REAL')),
    mpNetoRealOrden: getCell(rowR, pickIdx('MP_NETO_REAL_ORDEN')),
    mpCostPercentReal: getCell(rowR, pickIdx('MP_COST_PERCENT_REAL')),
    mpDateApproved: getCell(rowR, pickIdx('MP_DATE_APPROVED')),
    mpImportedAt: getCell(rowR, pickIdx('MP_IMPORTED_AT')),
    mpPayerEmail: getCell(rowR, pickIdx('MP_PAYER_EMAIL')),
    items: [],
  };

  const lastI = shI.getLastRow();
  if (lastI >= 2) {
    const hdrI = shI.getRange(1, 1, 1, shI.getLastColumn()).getValues()[0];
    const idxI = (n) => headerIndex_(hdrI, n);
    const getCellI = (row, idx) => (idx === -1 ? '' : row[idx]);

    const pickIdxI = (...names) => {
      for (const n of names) {
        const i = idxI(n);
        if (i !== -1) return i;
      }
      return -1;
    };

    const valsI = shI.getRange(2, 1, lastI - 1, shI.getLastColumn()).getValues();
    const idCol = pickIdxI('ID Remito', 'ID');

    remito.items = valsI
      .filter((r) => String(getCellI(r, idCol)) === String(id))
      .map((r) => ({
        idRemito: getCellI(r, idCol),
        fecha: getCellI(r, pickIdxI('Fecha')),
        sku: getCellI(r, pickIdxI('SKU')),
        articulo: getCellI(r, pickIdxI('Articulo', 'Artículo')),
        talle: getCellI(r, pickIdxI('Talle')),
        cantidad: getCellI(r, pickIdxI('Cantidad')),
        precioUnitario: getCellI(r, pickIdxI('Precio Unitario')),
        owner: getCellI(r, pickIdxI('Owner')),

        descuentoAsignado: getCellI(r, pickIdxI('DESCUENTO_ASIGNADO')),
        envioOwner: getCellI(r, pickIdxI('ENVIO_OWNER')),
        shippingAsignado: getCellI(r, pickIdxI('SHIPPING_ASIGNADO')),
        feeAsignado: getCellI(r, pickIdxI('FEE_ASIGNADO')),
        netoPrenda: getCellI(r, pickIdxI('NETO_PRENDA')),
      }));
  }

  return { ok: true, data: remito };
}

/** Parse numérico read-only para analytics (montos sheet) */
function parseAnalyticsNum_(value) {
  if (value == null || value === '') return 0;
  if (typeof value === 'number' && isFinite(value)) return value;
  const s = String(value).trim().replace(/[^\d.,\-]/g, '');
  if (!s) return 0;
  if (s.indexOf(',') !== -1) {
    const n = parseFloat(s.replace(/\./g, '').replace(',', '.'));
    return isFinite(n) ? n : 0;
  }
  const n = parseFloat(s);
  return isFinite(n) ? n : 0;
}

function parseAnalyticsInt_(value) {
  if (value == null || value === '') return 0;
  if (typeof value === 'number' && isFinite(value)) return Math.round(value);
  const n = parseInt(String(value).replace(/[^\d\-]/g, ''), 10);
  return isFinite(n) ? n : 0;
}

var ANALYTICS_CAL_TZ = 'America/Argentina/Buenos_Aires';

/** YYYY-MM-DD de filtro UI — sin Date.parse UTC. */
function parseAnalyticsCalendarDayKey_(str) {
  var s = String(str || '').trim();
  var m = s.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!m) return null;
  return m[1] + '-' + m[2] + '-' + m[3];
}

function parseAnalyticsDate_(value) {
  if (value instanceof Date && !isNaN(value.getTime())) return new Date(value.getTime());
  var s = String(value || '').trim();
  if (!s) return null;

  var isoDay = s.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (isoDay) {
    var outDay = new Date(Number(isoDay[1]), Number(isoDay[2]) - 1, Number(isoDay[3]));
    return isNaN(outDay.getTime()) ? null : outDay;
  }

  var m = s.match(/^(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{2,4})$/);
  if (m) {
    var y = Number(m[3]);
    if (y < 100) y += 2000;
    var outSlash = new Date(y, Number(m[2]) - 1, Number(m[1]));
    return isNaN(outSlash.getTime()) ? null : outSlash;
  }

  var d = new Date(s);
  if (!isNaN(d.getTime())) return d;

  return null;
}

function analyticsInstantDayKeyArt_(d) {
  if (!d || isNaN(d.getTime())) return '';
  return Utilities.formatDate(d, ANALYTICS_CAL_TZ, 'yyyy-MM-dd');
}

function analyticsDateKey_(d) {
  return analyticsInstantDayKeyArt_(d);
}

function isAnalyticsDateInRange_(d, fromStr, toStr) {
  if (!fromStr && !toStr) return true;
  if (!d) return false;

  var key = analyticsInstantDayKeyArt_(d);
  if (!key) return false;

  var fromKey = parseAnalyticsCalendarDayKey_(fromStr);
  var toKey = parseAnalyticsCalendarDayKey_(toStr);

  if (fromKey && key < fromKey) return false;
  if (toKey && key > toKey) return false;
  return true;
}

function hasMpAppliedAnalytics_(mpPaymentId, mpStatus) {
  return Boolean(String(mpPaymentId || '').trim() || String(mpStatus || '').trim());
}

/**
 * Analytics read-only — REMITOS + REMITO_ITEMS.
 * No recalcula netos, no toca stock ni import/MP.
 */
function getAnalyticsSummary({ from, to } = {}) {
  const fromStr = String(from || '').trim();
  const toStr = String(to || '').trim();
  const TOP_N = 20;

  const shR = getSheet(SPREADSHEET_ID, SHEET_REMITOS);
  const shI = getSheet(SPREADSHEET_ID, SHEET_ITEMS);

  const valsR = shR.getDataRange().getValues();
  if (!valsR || valsR.length < 2) {
    return {
      ok: true,
      data: {
        totals: {
          facturacionTotal: 0,
          netoRealMp: 0,
          costoTotalMp: 0,
          feeMp: 0,
          platformFee: 0,
          ordenesTotales: 0,
          ordenesConMp: 0,
          ordenesSinMp: 0,
          prendasVendidas: 0,
          ticketPromedio: 0,
          netoPromedioPorOrden: 0,
          costoMpPercentPromedio: 0,
        },
        salesByDay: [],
        topProducts: { available: false, items: [] },
        remitosInScope: 0,
        _log: { rowsRemitos: 0, rowsItems: 0, topProductsCount: 0 },
      },
    };
  }

  const hdrR = valsR[0].map(function (h) { return String(h || '').trim(); });
  const idxR = function (name) { return headerIndex_(hdrR, name); };
  const pickIdxR = function () {
    for (var i = 0; i < arguments.length; i++) {
      var ix = idxR(arguments[i]);
      if (ix !== -1) return ix;
    }
    return -1;
  };
  const cellR = function (row, ix) { return ix === -1 ? '' : row[ix]; };

  var iFecha = pickIdxR('Fecha');
  var iId = pickIdxR('ID Remito');
  var iTotalFinal = pickIdxR('Total Final');
  var iNetoMp = pickIdxR('MP_NETO_REAL_ORDEN');
  var iCostoMp = pickIdxR('MP_TOTAL_COST_REAL');
  var iFeeMp = pickIdxR('MP_FEE_TOTAL_REAL');
  var iPlatformFee = pickIdxR('MP_PLATFORM_FEE_TOTAL_REAL');
  var iTxnAmount = pickIdxR('MP_TRANSACTION_AMOUNT');
  var iPrendas = pickIdxR('Total De Prendas');
  var iMpPaymentId = pickIdxR('MP_PAYMENT_ID');
  var iMpStatus = pickIdxR('MP_STATUS');

  var facturacionTotal = 0;
  var netoRealMp = 0;
  var costoTotalMp = 0;
  var feeMp = 0;
  var platformFee = 0;
  var mpTransactionAmountTotal = 0;
  var prendasVendidas = 0;
  var ordenesConMp = 0;
  var ordenesTotales = 0;
  var dayMap = {};
  var scopedIds = {};

  for (var r = 1; r < valsR.length; r++) {
    var rowR = valsR[r];
    if (!rowR.some(function (c) { return c !== '' && c != null; })) continue;

    var fecha = parseAnalyticsDate_(cellR(rowR, iFecha));
    if (!isAnalyticsDateInRange_(fecha, fromStr, toStr)) continue;

    var idRemito = String(cellR(rowR, iId) || '').trim();
    if (idRemito) scopedIds[idRemito] = true;

    var totalFinal = parseAnalyticsNum_(cellR(rowR, iTotalFinal));
    facturacionTotal += totalFinal;
    netoRealMp += parseAnalyticsNum_(cellR(rowR, iNetoMp));
    costoTotalMp += parseAnalyticsNum_(cellR(rowR, iCostoMp));
    feeMp += parseAnalyticsNum_(cellR(rowR, iFeeMp));
    platformFee += parseAnalyticsNum_(cellR(rowR, iPlatformFee));
    mpTransactionAmountTotal += parseAnalyticsNum_(cellR(rowR, iTxnAmount));
    prendasVendidas += parseAnalyticsInt_(cellR(rowR, iPrendas));

    if (hasMpAppliedAnalytics_(cellR(rowR, iMpPaymentId), cellR(rowR, iMpStatus))) {
      ordenesConMp += 1;
    }
    ordenesTotales += 1;

    if (fecha) {
      var dk = analyticsDateKey_(fecha);
      if (!dayMap[dk]) dayMap[dk] = { facturacion: 0, ordenes: 0 };
      dayMap[dk].facturacion += totalFinal;
      dayMap[dk].ordenes += 1;
    }
  }

  var ordenesSinMp = Math.max(0, ordenesTotales - ordenesConMp);
  var ticketPromedio = ordenesTotales > 0 ? facturacionTotal / ordenesTotales : 0;
  var netoPromedioPorOrden = ordenesConMp > 0 ? netoRealMp / ordenesConMp : 0;
  var costoMpPercentPromedio =
    mpTransactionAmountTotal > 0 ? (costoTotalMp / mpTransactionAmountTotal) * 100 : 0;

  var salesByDay = Object.keys(dayMap)
    .map(function (date) {
      return {
        date: date,
        facturacion: dayMap[date].facturacion,
        ordenes: dayMap[date].ordenes,
      };
    })
    .sort(function (a, b) { return b.date.localeCompare(a.date); });

  var productMap = {};
  var rowsItems = 0;
  var valsI = shI.getDataRange().getValues();

  if (valsI && valsI.length >= 2) {
    var hdrI = valsI[0].map(function (h) { return String(h || '').trim(); });
    var idxI = function (name) { return headerIndex_(hdrI, name); };
    var pickIdxI = function () {
      for (var j = 0; j < arguments.length; j++) {
        var iy = idxI(arguments[j]);
        if (iy !== -1) return iy;
      }
      return -1;
    };
    var cellI = function (row, ix) { return ix === -1 ? '' : row[ix]; };

    var iIdItem = pickIdxI('ID Remito', 'ID');
    var iSku = pickIdxI('SKU');
    var iArticulo = pickIdxI('Articulo', 'Artículo');
    var iCantidad = pickIdxI('Cantidad');

    for (var ir = 1; ir < valsI.length; ir++) {
      var rowI = valsI[ir];
      if (!rowI.some(function (c) { return c !== '' && c != null; })) continue;

      var itemId = String(cellI(rowI, iIdItem) || '').trim();
      if (!itemId || !scopedIds[itemId]) continue;

      rowsItems += 1;
      var sku = String(cellI(rowI, iSku) || '').trim();
      var articulo = String(cellI(rowI, iArticulo) || '').trim();
      var key = sku + '|' + articulo;
      var qty = parseAnalyticsInt_(cellI(rowI, iCantidad));
      if (!productMap[key]) {
        productMap[key] = { sku: sku, articulo: articulo, unidades: 0 };
      }
      productMap[key].unidades += qty;
    }
  }

  var topItems = Object.keys(productMap)
    .map(function (k) { return productMap[k]; })
    .sort(function (a, b) { return b.unidades - a.unidades; })
    .slice(0, TOP_N);

  Logger.log(
    '[getAnalyticsSummary] rowsRemitos=' + ordenesTotales +
    ' rowsItems=' + rowsItems +
    ' topProductsCount=' + topItems.length
  );

  return {
    ok: true,
    data: {
      totals: {
        facturacionTotal: facturacionTotal,
        netoRealMp: netoRealMp,
        costoTotalMp: costoTotalMp,
        feeMp: feeMp,
        platformFee: platformFee,
        ordenesTotales: ordenesTotales,
        ordenesConMp: ordenesConMp,
        ordenesSinMp: ordenesSinMp,
        prendasVendidas: prendasVendidas,
        ticketPromedio: ticketPromedio,
        netoPromedioPorOrden: netoPromedioPorOrden,
        costoMpPercentPromedio: costoMpPercentPromedio,
      },
      salesByDay: salesByDay,
      topProducts: {
        available: topItems.length > 0,
        items: topItems,
      },
      remitosInScope: ordenesTotales,
      _log: {
        rowsRemitos: ordenesTotales,
        rowsItems: rowsItems,
        topProductsCount: topItems.length,
      },
    },
  };
}


function normalizeRemitoItemOwner_(ownerCell) {
  return String(ownerCell || '').trim().toUpperCase() === 'SCNL' ? 'SCNL' : '8Q';
}

function matchesRemitoItemOwnerFilter_(ownerCell, ownerFilter) {
  var f = String(ownerFilter || '').trim().toUpperCase();
  if (!f || f === 'ALL' || f === 'TODOS') return true;
  var normalized = normalizeRemitoItemOwner_(ownerCell);
  if (f === 'SCNL') return normalized === 'SCNL';
  if (f === '8Q') return normalized === '8Q';
  return true;
}

function formatRemitoItemFecha_(value) {
  if (value instanceof Date && !isNaN(value.getTime())) {
    return value.toISOString();
  }
  return String(value || '').trim();
}

function effectiveRemitoItemUnits_(cantidad) {
  var n = parseAnalyticsInt_(cantidad);
  return n > 0 ? n : 1;
}

function pickNetoDisplayNum_(netoReal, netoPrenda) {
  var real = parseAnalyticsNum_(netoReal);
  if (real !== 0) return real;
  return parseAnalyticsNum_(netoPrenda);
}

function pickMpFeeTotalNum_(totalCost, fee, platform) {
  var total = parseAnalyticsNum_(totalCost);
  if (total !== 0) return total;
  return parseAnalyticsNum_(fee) + parseAnalyticsNum_(platform);
}

/**
 * REMITO_ITEMS read-only — 1 prenda = 1 fila.
 * Solo suma columnas existentes; no recalcula netos ni prorrateos.
 */
function getRemitoItemsFull({ from, to, sku, owner } = {}) {
  var fromStr = String(from || '').trim();
  var toStr = String(to || '').trim();
  var skuFilter = String(sku || '').trim().toUpperCase();
  var ownerFilter = String(owner || '').trim();

  var shI = getSheet(SPREADSHEET_ID, SHEET_ITEMS);
  var valsI = shI.getDataRange().getValues();

  var emptySummary = {
    totalBrutoPrendas: 0,
    totalPrendas: 0,
    netoTotalPrendas: 0,
    descuentoTotal: 0,
    shippingTotal: 0,
    feeTotal: 0,
    mpFeeAsignadoRealTotal: 0,
    unidadesScnl: 0,
    unidades8q: 0,
    rowsInScope: 0,
  };

  if (!valsI || valsI.length < 2) {
    return {
      ok: true,
      data: { items: [], summary: emptySummary, _log: { rowsItems: 0, rowsFiltered: 0 } },
    };
  }

  var hdrI = valsI[0].map(function (h) { return String(h || '').trim(); });
  var idxI = function (name) { return headerIndex_(hdrI, name); };
  var pickIdxI = function () {
    for (var i = 0; i < arguments.length; i++) {
      var ix = idxI(arguments[i]);
      if (ix !== -1) return ix;
    }
    return -1;
  };
  var cellI = function (row, ix) { return ix === -1 ? '' : row[ix]; };

  var iId = pickIdxI('ID Remito', 'ID');
  var iFecha = pickIdxI('Fecha');
  var iSku = pickIdxI('SKU');
  var iArticulo = pickIdxI('Articulo', 'Artículo');
  var iTalle = pickIdxI('Talle');
  var iOwner = pickIdxI('Owner');
  var iCantidad = pickIdxI('Cantidad');
  var iPrecio = pickIdxI('Precio Unitario');
  var iDesc = pickIdxI('DESCUENTO_ASIGNADO');
  var iShip = pickIdxI('SHIPPING_ASIGNADO');
  var iFee = pickIdxI('FEE_ASIGNADO');
  var iNeto = pickIdxI('NETO_PRENDA');
  var iNetoReal = pickIdxI('NETO_PRENDA_REAL');
  var iMpFee = pickIdxI('MP_FEE_ASIGNADO_REAL');
  var iMpPlatform = pickIdxI('MP_PLATFORM_FEE_ASIGNADO_REAL');
  var iMpTotal = pickIdxI('MP_TOTAL_COST_ASIGNADO_REAL');
  var iNetoScnl = pickIdxI('NETO_PRENDA_SCNL');
  var iNeto8q = pickIdxI('NETO PRENDA 8Q');

  var items = [];
  var summary = {
    totalBrutoPrendas: 0,
    totalPrendas: 0,
    netoTotalPrendas: 0,
    descuentoTotal: 0,
    shippingTotal: 0,
    feeTotal: 0,
    mpFeeAsignadoRealTotal: 0,
    unidadesScnl: 0,
    unidades8q: 0,
    rowsInScope: 0,
  };

  var rowsItems = 0;
  var rowsFiltered = 0;

  for (var r = 1; r < valsI.length; r++) {
    var rowI = valsI[r];
    if (!rowI.some(function (c) { return c !== '' && c != null; })) continue;

    rowsItems += 1;

    var fechaRaw = formatRemitoItemFecha_(cellI(rowI, iFecha));
    var fecha = parseAnalyticsDate_(fechaRaw);
    if (!isAnalyticsDateInRange_(fecha, fromStr, toStr)) continue;

    var skuVal = String(cellI(rowI, iSku) || '').trim();
    if (skuFilter && skuVal.toUpperCase().indexOf(skuFilter) === -1) continue;

    var ownerCell = cellI(rowI, iOwner);
    if (!matchesRemitoItemOwnerFilter_(ownerCell, ownerFilter)) continue;

    rowsFiltered += 1;

    var units = effectiveRemitoItemUnits_(cellI(rowI, iCantidad));
    var ownerNorm = normalizeRemitoItemOwner_(ownerCell);
    var netoReal = parseAnalyticsNum_(cellI(rowI, iNetoReal));
    var netoPrenda = parseAnalyticsNum_(cellI(rowI, iNeto));
    var netoDisplay = pickNetoDisplayNum_(netoReal, netoPrenda);
    var desc = parseAnalyticsNum_(cellI(rowI, iDesc));
    var ship = parseAnalyticsNum_(cellI(rowI, iShip));
    var fee = parseAnalyticsNum_(cellI(rowI, iFee));
    var mpFeeTotal = pickMpFeeTotalNum_(
      cellI(rowI, iMpTotal),
      cellI(rowI, iMpFee),
      cellI(rowI, iMpPlatform)
    );
    var precioUnitario = parseAnalyticsNum_(cellI(rowI, iPrecio));

    items.push({
      idRemito: String(cellI(rowI, iId) || '').trim(),
      fecha: fechaRaw,
      sku: skuVal,
      articulo: String(cellI(rowI, iArticulo) || '').trim(),
      talle: String(cellI(rowI, iTalle) || '').trim(),
      owner: ownerNorm,
      cantidad: units,
      precioUnitario: precioUnitario,
      descuentoAsignado: desc,
      shippingAsignado: ship,
      feeAsignado: fee,
      netoPrenda: netoPrenda,
      netoPrendaReal: netoReal !== 0 ? netoReal : null,
      netoDisplay: netoDisplay,
      mpFeeAsignadoReal: parseAnalyticsNum_(cellI(rowI, iMpFee)) || null,
      mpPlatformFeeAsignadoReal: parseAnalyticsNum_(cellI(rowI, iMpPlatform)) || null,
      mpTotalCostAsignadoReal: parseAnalyticsNum_(cellI(rowI, iMpTotal)) || null,
      netoPrendaScnl: parseAnalyticsNum_(cellI(rowI, iNetoScnl)),
      netoPrenda8q: parseAnalyticsNum_(cellI(rowI, iNeto8q)),
    });

    summary.totalBrutoPrendas += precioUnitario * units;
    summary.totalPrendas += units;
    summary.netoTotalPrendas += netoDisplay * units;
    summary.descuentoTotal += desc * units;
    summary.shippingTotal += ship * units;
    summary.feeTotal += fee * units;
    summary.mpFeeAsignadoRealTotal += mpFeeTotal * units;
    if (ownerNorm === 'SCNL') summary.unidadesScnl += units;
    else summary.unidades8q += units;
  }

  summary.rowsInScope = rowsFiltered;

  Logger.log(
    '[getRemitoItemsFull] rowsItems=' + rowsItems +
    ' rowsFiltered=' + rowsFiltered +
    ' totalPrendas=' + summary.totalPrendas
  );

  return {
    ok: true,
    data: {
      items: items,
      summary: summary,
      _log: {
        rowsItems: rowsItems,
        rowsFiltered: rowsFiltered,
      },
    },
  };
}


function setEstadoRemito({ id, estado }) {
  if (!id) throw new Error('id requerido');
  if (!CATALOGS.estados.includes(estado)) throw new Error('Estado inválido');

  const shR = getSheet(SPREADSHEET_ID, SHEET_REMITOS);
  const last = shR.getLastRow();
  if (last < 2) throw new Error('No hay remitos');

  const hdrR = shR.getRange(1,1,1,shR.getLastColumn()).getValues()[0];
  const idxR = (n) => headerIndex_(hdrR, n);

  const vals = shR.getRange(2,1,last-1,shR.getLastColumn()).getValues();
  for (let i=0;i<vals.length;i++) {
    if (String(vals[i][idxR('ID Remito')]) === String(id)) {
      const estadoActual = String(vals[i][idxR('Estado')] || '');
      if (estadoActual === estado) return { ok:true, id, estado };

      const rem = getRemitoById({ id });
      if (!rem.ok) throw new Error('No se pudieron leer los items del remito');
      const items = (rem.data.items || []).map(it => ({
        sku: String(it.sku || '').toUpperCase(),
        cantidad: it.cantidad
      }));

      if ((estadoActual === 'Pendiente' || estadoActual === 'Anulado') && estado === 'Pagado') {
        adjustStockForItems(items, -1);
      } else if (estadoActual === 'Pagado' && estado === 'Anulado') {
        adjustStockForItems(items, +1);
      }

      shR.getRange(i+2, idxR('Estado')+1).setValue(estado);

      const skusAfectados = items.map(x => x.sku).filter(Boolean);
      checkLowStockForSkus_(skusAfectados);

      return { ok:true, id, estado };
    }
  }
  throw new Error('Remito no encontrado');
}

/***********************
 * UX EN LA PLANILLA (Opcional)
 ***********************/
function onEdit(e) {
  try {
    if (!e || !e.range) return;
    const sh = e.range.getSheet();
    const name = sh.getName();

    if (name === SHEET_ITEMS) {
      const row = e.range.getRow();
      const header = sh.getRange(1,1,1,sh.getLastColumn()).getValues()[0];
      const idxSKU  = headerIndex_(header, 'SKU') + 1;
      const idxArt  = headerIndex_(header, 'Articulo') + 1;
      const idxTal  = headerIndex_(header, 'Talle') + 1;

      if (row >= 2) {
        const col = e.range.getColumn();

        if (col === idxTal) {
          const skuBase = String(sh.getRange(row, idxSKU).getValue() || '').trim();
          const talle   = String(sh.getRange(row, idxTal).getValue() || '').trim().toUpperCase();
          if (skuBase && talle) {
            const current = String(sh.getRange(row, idxSKU).getValue() || '').trim();
            const nextSku = ensureSizeInSku_(current || skuBase, talle, '');
            if (nextSku && nextSku !== current) sh.getRange(row, idxSKU).setValue(nextSku);
          }
        }

        if (col === idxArt || col === idxTal) {
          const articulo = String(sh.getRange(row, idxArt).getValue() || '').trim();
          const talle    = String(sh.getRange(row, idxTal).getValue() || '').trim().toUpperCase();
          const currentSku = String(sh.getRange(row, idxSKU).getValue() || '').trim();
          if (articulo && talle && !currentSku) {
            const sku = findSkuByArticuloTalle_(articulo, talle, null);
            if (sku) sh.getRange(row, idxSKU).setValue(sku);
          }
        }
      }
      return;
    }

    if (name === SHEET_REMITOS) {
      const row = e.range.getRow();
      if (row < 2) return;
      const header = sh.getRange(1,1,1,sh.getLastColumn()).getValues()[0];
      const idxId   = headerIndex_(header, 'ID Remito') + 1;
      const idxEst  = headerIndex_(header, 'Estado') + 1;
      if (e.range.getColumn() === idxEst) {
        const id = sh.getRange(row, idxId).getValue();
        const estado = sh.getRange(row, idxEst).getValue();
        if (id && estado) setEstadoRemito({ id, estado });
      }
    }
  } catch (err) {
    Logger.log(err);
  }
}

function handleRequest(e) {
  try {
    const rawParam = (e && e.parameter) || {};
    const rawBody  = (e && e.postData && e.postData.contents) || '';
    const body     = safeJson_(rawBody, {});

    // Token opcional (si TOKEN_OPTIONAL tiene valor, lo exige)
    const isTokenRequired = !!TOKEN_OPTIONAL;
    if (isTokenRequired) {
      const token = rawParam.token || body.token || '';
      if (String(token) !== String(TOKEN_OPTIONAL)) {
        return json({ ok: false, error: 'Unauthorized' });
      }
    }
    function handleRequest(e) {
  const payload = parseJsonBody_(e); // o como lo tengas hoy
  const action = String(payload?.action || "").trim();

  // ... tus cases existentes
  if (action === "listRemitosFull") {
  return json_(200, listRemitosFull_(payload));
}

  if (action === "getAnalyticsSummary") {
    const from = payload?.from || "";
    const to = payload?.to || "";
    return json_(200, getAnalyticsSummary({ from: from, to: to }));
  }

  if (action === "get_remito_by_tn_order_id") {
    const tnOrderId = String(payload?.tnOrderId || "").trim();
    if (!tnOrderId) return json_(400, { ok: false, error: "tnOrderId requerido" });

    const shR = getSheet(SPREADSHEET_ID, SHEET_REMITOS);

    const values = shR.getDataRange().getValues();
    if (!values || values.length < 2) return json_(200, { ok: true, found: false });

    const headers = values[0].map(h => String(h || "").trim());
    const idxTN = headers.indexOf("TN_ORDER_ID");
    const idxMpPayment = headers.indexOf("MP_PAYMENT_ID");
    if (idxTN === -1) return json_(500, { ok: false, error: "Header TN_ORDER_ID no existe" });

    // buscamos exact match; si hay duplicados, preferir fila sin MP_PAYMENT_ID
    let row = null;
    let rowWithMp = null;
    for (let r = 1; r < values.length; r++) {
      const v = String(values[r][idxTN] || "").trim();
      if (v !== tnOrderId) continue;
      const mpPaymentId = idxMpPayment >= 0 ? String(values[r][idxMpPayment] || "").trim() : "";
      if (!mpPaymentId) {
        row = values[r];
        break;
      }
      if (!rowWithMp) rowWithMp = values[r];
    }
    if (!row) row = rowWithMp;

    if (!row) return json_(200, { ok: true, found: false });

    // devolvemos un subset útil (NO inventamos columnas)
    const pick = (name) => {
      const i = headers.indexOf(name);
      return i >= 0 ? row[i] : null;
    };

    return json_(200, {
      ok: true,
      found: true,
      remito: {
        TN_ORDER_ID: pick("TN_ORDER_ID"),
        MP_PAYMENT_ID: pick("MP_PAYMENT_ID"),
        MP_STATUS: pick("MP_STATUS"),
        MP_NET_RECEIVED_AMOUNT: pick("MP_NET_RECEIVED_AMOUNT"),
        MP_TOTAL_COST_REAL: pick("MP_TOTAL_COST_REAL"),
        MP_NETO_REAL_ORDEN: pick("MP_NETO_REAL_ORDEN"),
        MP_DATE_APPROVED: pick("MP_DATE_APPROVED"),
      }
    });
  }

  // ... default existente
  return json_(400, { ok: false, error: "Acción inválida" });
}

// helpers (si ya existen, NO dupliques; reutilizalos)
function json_(status, obj) {
  return ContentService
    .createTextOutput(JSON.stringify(obj))
    .setMimeType(ContentService.MimeType.JSON);
}

    // ==========================
    // MP IMPORT PAYMENT (Next.js → GAS)
    // IMPORTANTE: debe ir ANTES de calcular "method"
    // porque si no viene method/action, cae en 'ping'
    // ==========================
    const mpPayload =
      (body && body.mode === "mp_import_payment") ? body :
      (body && body.data && body.data.mode === "mp_import_payment") ? body.data :
      null;

    if (mpPayload) {
      // Normalización mínima para compatibilidad
      mpPayload.tnOrderId = String(mpPayload.tnOrderId || "").trim();
      return jsonNoRedirect(applyMpPaymentManual_(mpPayload));
    }

    // Acción:
    // - Soportar legacy: ?action=...  / {"action":...}
    // - Soportar Next/proxy: ?method=... / {"method":...}
    // - Soportar casos raros: {"data":{"method":...}}
    const method =
      String(
        rawParam.method ||
        rawParam.action ||
        body.method ||
        body.action ||
        (body.data && body.data.method) ||
        (body.data && body.data.action) ||
        'ping'
      ).trim();

    // DEBUG
    if (method === 'debug') {
      return json({
        ok: true,
        method,
        rawParam,
        body,
        hasPost: !!(e && e.postData && e.postData.contents),
        ts: new Date().toISOString(),
        apiVersion: API_VERSION,
        build: BUILD_ID,
        tokenRequired: isTokenRequired
      });
    }

    // PING
    if (method === 'ping') {
      return json({
        ok: true,
        ping: 'webhook vivo',
        ts: new Date().toISOString(),
        apiVersion: API_VERSION,
        build: BUILD_ID
      });
    }

    // CATALOGS
    if (method === 'getCatalogs') {
      return json({ ok: true, data: CATALOGS });
    }

    // SYNC TN PRODUCTS (Trae/actualiza TN_PRODUCTS)
    if (method === 'syncTNProducts') {
      const result = syncTiendanubeProducts();
      return json(result);
    }

    // SYNC STOCK (TN_PRODUCTS -> STOCK MAESTRO)
    if (method === 'syncStockFromTNProducts') {
      const mode  = String(body.mode || rawParam.mode || 'merge').toLowerCase();
      const limit = Number(body.limit || rawParam.limit || 300);

      const reset =
        body.reset === true ||
        String(body.reset || rawParam.reset || '').toLowerCase() === 'true' ||
        String(body.reset || rawParam.reset || '') === '1';

      // Preferimos chunked si existe; si no, usamos el wrapper anterior si lo tenés.
      const fn =
        (typeof syncStockFromTNProductsChunked_ === 'function')
          ? syncStockFromTNProductsChunked_
          : ((typeof syncStockFromTNProducts === 'function') ? syncStockFromTNProducts : null);

      if (!fn) throw new Error('No existe syncStockFromTNProductsChunked_ ni syncStockFromTNProducts');

      const result = fn({ mode, limit, reset });
      return json(result);
    }

    // LIST REMITOS
    if (method === 'listRemitos') {
      const q = rawParam.q || body.q || '';
      return json(listRemitos({ q }));
    }

    // GET REMITO
    if (method === 'getRemito') {
      const id = body.id || rawParam.id;
      if (!id) return json({ ok: false, error: 'id requerido' });
      return json(getRemitoById({ id }));
    }

    // SAVE REMITO
    if (method === 'saveRemito') {
      if (!body || !body.data) return json({ ok: false, error: 'data requerido' });
      return json(saveRemito(body.data));
    }

    // SET ESTADO
    if (method === 'setEstado') {
      const id = body.id || rawParam.id;
      const estado = body.estado || rawParam.estado;
      if (!id || !estado) return json({ ok: false, error: 'id y estado requeridos' });
      return json(setEstadoRemito({ id, estado }));
    }

    // SEARCH STOCK
    if (method === 'searchStock') {
      const params = {
        articulo: body.articulo || rawParam.articulo || '',
        talle: body.talle || rawParam.talle || '',
        ownerScnl: !!(body.ownerScnl || rawParam.ownerScnl),
        q: body.q || rawParam.q || '',
        limit: Number(body.limit || rawParam.limit || 25),
      };
      return json(searchStock_(params));
    }

    // NETOS POR PRENDA (1 remito)
    if (method === 'recomputeRemitoNetos') {
      const id = body.id || rawParam.id;
      if (!id) return json({ ok: false, error: 'id requerido' });
      return json(recomputeRemitoNetos_(id));
    }

    // NETOS POR PRENDA (batch por fechas)
    if (method === 'recomputeNetosRange') {
      const fromISO = body.fromISO || rawParam.fromISO || '';
      const toISO   = body.toISO || rawParam.toISO || '';
      const limit   = Number(body.limit || rawParam.limit || 300);
      return json(recomputeNetosRange_({ fromISO, toISO, limit }));
    }

    // Ensure headers / sheets
    if (method === 'ensureSheets') {
      ensureSheets_();
      return json({ ok: true, ensured: true });
    }

    if (method === "moveFechaFirst") {
      moveFechaFirst_();
      return json({ ok: true });
    }

    // ==========================
    // MP MANUAL GET (simple)
    // ==========================
    if (method === "applyMpPaymentManualGet") {
      const tnOrderId = String(rawParam.tnOrderId || "").trim();
      const paymentId = String(rawParam.paymentId || "").trim();

      if (!tnOrderId || !paymentId) {
        return jsonNoRedirect({ ok:false, error:"tnOrderId y paymentId requeridos" });
      }

      return jsonNoRedirect(applyMpPaymentManual_({
        tnOrderId,
        mp: { paymentId }
      }));
    }

    // ==========================
    // MP MANUAL POST SIMPLE
    // ==========================
    if (method === "applyMpPaymentManualPost") {

      const tnOrderId = String(
        rawParam.tnOrderId ??
        (body && body.data && body.data.tnOrderId) ??
        body.tnOrderId ??
        ""
      ).trim();

      const paymentId = String(
        rawParam.paymentId ??
        (body && body.data && body.data.paymentId) ??
        body.paymentId ??
        (body && body.data && body.data.mp && body.data.mp.paymentId) ??
        (body && body.mp && body.mp.paymentId) ??
        ""
      ).trim();

      if (!tnOrderId || !paymentId) {
        return jsonNoRedirect({ ok:false, error:"tnOrderId y paymentId requeridos" });
      }

      const mpFromBody = (body && body.data && body.data.mp) ? body.data.mp : (body.mp || {});

      const mp = {
        ...mpFromBody,
        paymentId,
        additionalReference:
          mpFromBody.additionalReference ??
          rawParam.additionalReference ??
          undefined
      };

      return jsonNoRedirect(applyMpPaymentManual_({ tnOrderId, mp }));
    }
    if (method === 'recalcularTransferenciasPost') {
  return recalcularTransferenciasPost(e);
}
if (method === 'listRemitosFull') {
  return jsonNoRedirect(listRemitosFull_({ q: body.q || body.search || '' }));
}

    if (method === 'getAnalyticsSummary') {
      const from = body.from || rawParam.from || '';
      const to = body.to || rawParam.to || '';
      return jsonNoRedirect(getAnalyticsSummary({ from: from, to: to }));
    }

    if (method === 'getRemitoItemsFull') {
      const from = body.from || rawParam.from || '';
      const to = body.to || rawParam.to || '';
      const sku = body.sku || rawParam.sku || '';
      const owner = body.owner || rawParam.owner || '';
      return jsonNoRedirect(getRemitoItemsFull({ from: from, to: to, sku: sku, owner: owner }));
    }

    // FALLBACK
    return json({ ok: false, error: 'Acción no soportada', method });

  } catch (err) {
    return json({ ok: false, error: String(err && err.stack ? err.stack : err) });
  }
}


function doGet(e)  { return handleRequest(e); }
function doPost(e) { return handleRequest(e); }

function jsonNoRedirect(obj) {
  return ContentService
    .createTextOutput(JSON.stringify(obj))
    .setMimeType(ContentService.MimeType.JSON);
}


function ensureHeadersIfMissing_(sh, headers) {
  const lastCol = Math.max(1, sh.getLastColumn());
  const cur = sh.getRange(1, 1, 1, lastCol).getValues()[0].map(v => String(v || "").trim());
  const set = new Set(cur.filter(Boolean));
  const missing = headers.filter(h => !set.has(h));
  if (missing.length) {
    sh.getRange(1, lastCol + 1, 1, missing.length).setValues([missing]);
  }
  return sh.getRange(1, 1, 1, sh.getLastColumn()).getValues()[0].map(v => String(v || "").trim());
}

function headerMapFromSheet_(sh) {
  const headers = sh.getRange(1,1,1,sh.getLastColumn()).getValues()[0].map(h => String(h||"").trim());
  const map = {};
  headers.forEach((h,i)=>{ if (h) map[h] = i+1; });
  return map;
}

function findAllRemitoRowsByTNOrderId_(shR, tnOrderId) {
  const last = shR.getLastRow();
  if (last < 2) return [];

  const hdr = shR.getRange(1,1,1,shR.getLastColumn()).getValues()[0].map(h => String(h||"").trim());
  const idxDetalle = hdr.indexOf("Detalle general");
  const idxTN = hdr.indexOf("TN_ORDER_ID");
  const idxMpPayment = hdr.indexOf("MP_PAYMENT_ID");

  const values = shR.getRange(2,1,last,shR.getLastColumn()).getValues();
  const needle = String(tnOrderId||"").trim();
  const matches = [];

  for (let i=0;i<values.length;i++) {
    const row = values[i];
    let matched = false;

    if (idxTN >= 0) {
      const v = String(row[idxTN]||"").trim();
      if (v === needle) matched = true;
    }

    if (!matched && idxDetalle >= 0) {
      const det = String(row[idxDetalle]||"");
      if (det.includes("TN_ORDER_ID=" + needle)) matched = true;
    }

    if (matched) {
      const mpPaymentId = idxMpPayment >= 0 ? String(row[idxMpPayment] || "").trim() : "";
      matches.push({ sheetRow: i + 2, hasMp: Boolean(mpPaymentId) });
    }
  }

  return matches;
}

function findRemitoRowByTNOrderId_(shR, tnOrderId) {
  const matches = findAllRemitoRowsByTNOrderId_(shR, tnOrderId);
  if (!matches.length) return null;

  // TN duplicado: preferir remito hermano sin MP_PAYMENT_ID
  const pending = matches.find((m) => !m.hasMp);
  if (pending) return pending.sheetRow;

  return matches[0].sheetRow;
}

function findRemitoRowByIdRemito_(shR, idRemito) {
  const last = shR.getLastRow();
  if (last < 2) return null;

  const needle = String(idRemito || "").trim();
  if (!needle) return null;

  const hdr = shR.getRange(1,1,1,shR.getLastColumn()).getValues()[0].map(h => String(h||"").trim());
  const idxId = hdr.indexOf("ID Remito");
  if (idxId < 0) return null;

  const values = shR.getRange(2,1,last,shR.getLastColumn()).getValues();
  for (let i = 0; i < values.length; i++) {
    const v = String(values[i][idxId] || "").trim();
    if (v === needle) return i + 2;
  }
  return null;
}

function allocateProportionalCents_(poolAmount, weights) {
  const toCents = (n)=> Math.round((Number(n||0)||0)*100);
  const pool = toCents(poolAmount);
  const ws = weights.map(w => Math.max(0, Number(w||0)||0));
  const sumW = ws.reduce((a,b)=>a+b,0);

  if (!pool || sumW <= 0) return new Array(ws.length).fill(0);

  const ideals = ws.map(w => pool * (w / sumW));
  const floors = ideals.map(x => (x >= 0 ? Math.floor(x) : Math.ceil(x)));
  let used = floors.reduce((a,b)=>a+b,0);
  let rem = pool - used;

  const frac = ideals.map((x,i)=>({ i, frac: x - floors[i] }));

  if (rem > 0) {
    frac.sort((a,b)=>b.frac-a.frac);
    for (let k=0;k<rem;k++) floors[frac[k % frac.length].i] += 1;
  } else if (rem < 0) {
    frac.sort((a,b)=>a.frac-b.frac);
    for (let k=0;k<Math.abs(rem);k++) floors[frac[k % frac.length].i] -= 1;
  }
  return floors; // centavos
}

function applyMpPaymentManual_(payload) {
  // ==========================
  // 0) Inputs + helpers
  // ==========================
  const tnOrderId = String(payload?.tnOrderId || "").trim();
  if (!tnOrderId) throw new Error("tnOrderId requerido");

  const force = Boolean(payload?.force);

  const mpIn = payload?.mp || {};
  
  const mp = {
    ...mpIn,
    paymentId: mpIn.paymentId != null ? String(mpIn.paymentId) : "",
    additionalReference:
      mpIn.additionalReference != null ? String(mpIn.additionalReference) : "",
    status: mpIn.status != null ? String(mpIn.status) : "",
    statusDetail: mpIn.statusDetail != null ? String(mpIn.statusDetail) : "",
    payerEmail: mpIn.payerEmail != null ? String(mpIn.payerEmail) : "",
    paymentType: mpIn.paymentType != null ? String(mpIn.paymentType) : "",
    paymentMethod: mpIn.paymentMethod != null ? String(mpIn.paymentMethod) : "",
    paymentMethodDisplay:
      mpIn.paymentMethodDisplay != null ? String(mpIn.paymentMethodDisplay) : "",
    installments: Number(mpIn.installments || 0) || 0,

    dateCreated: mpIn.dateCreated || "",
    dateApproved: mpIn.dateApproved || "",
    moneyReleaseDate: mpIn.moneyReleaseDate || "",

    transactionAmount: Number(mpIn.transactionAmount || 0) || 0,
    netReceivedAmount: Number(mpIn.netReceivedAmount || 0) || 0,

    taxTotalReal: Number(mpIn.taxTotalReal || 0) || 0,
    financingTotalReal: Number(mpIn.financingTotalReal || 0) || 0,
    feeTotalReal: Number(mpIn.feeTotalReal || 0) || 0,
    platformFeeTotalReal: Number(mpIn.platformFeeTotalReal || 0) || 0,
    totalCostReal: mpIn.totalCostReal
  };

  const parseDateOrEmpty = (x) => {
    if (!x) return "";
    try {
      const d = new Date(x);
      return isNaN(d.getTime()) ? "" : d;
    } catch (e) {
      return "";
    }
  };
  
// ==========================
// 1) Sheets + headers
// ==========================
const shR = getSheet(SPREADSHEET_ID, SHEET_REMITOS);
const shI = getSheet(SPREADSHEET_ID, SHEET_ITEMS);

// REMITOS headers (agrega si falta)
ensureHeadersIfMissing_(shR, [
  "TN_ORDER_ID",
  "MP_PAYMENT_ID",
  "MP_ADDITIONAL_REFERENCE",
  "MP_MATCH_CONFIDENCE",
  "MP_MATCH_RULE",
  "MP_MATCHED_AT",
  "MP_IMPORTED_AT",

  "MP_STATUS",
  "MP_STATUS_DETAIL",
  "MP_DATE_CREATED",
  "MP_DATE_APPROVED",
  "MP_MONEY_RELEASE_DATE",
  "MP_ACREDITADO_FECHA",

  "MP_TRANSACTION_AMOUNT",
  "MP_NET_RECEIVED_AMOUNT",
  "MP_NETO_REAL_ORDEN",
  "MP_TAX_TOTAL_REAL",
  "MP_FINANCING_TOTAL_REAL",
  "MP_FEE_TOTAL_REAL",
  "MP_PLATFORM_FEE_TOTAL_REAL",
  "MP_TOTAL_COST_REAL",

  // ✅ ENTERPRISE (si ya existe, no duplica; si falta, la crea)
  "MP_COST_PERCENT_REAL",

  "MP_PAYER_EMAIL",
  "MP_PAYMENT_TYPE",
  "MP_PAYMENT_METHOD",
  "MP_INSTALLMENTS",
]);
const HR = headerMapFromSheet_(shR);

// ITEMS headers (agrega si falta)
ensureHeadersIfMissing_(shI, [
  "ID Remito",
  "Precio Unitario",
  "Owner",
  "NETO_PRENDA",

  "MP_METHOD",
  "MP_PAYMENT_ID",
  "MP_STATUS",
  "MP_INSTALLMENTS",
  "MP_PAYMENT_TYPE",

  "MP_TAX_ASIGNADO_REAL",
  "MP_FINANCING_ASIGNADO_REAL",
  "MP_FEE_ASIGNADO_REAL",
  "MP_PLATFORM_FEE_ASIGNADO_REAL",
  "MP_TOTAL_COST_ASIGNADO_REAL",

  "NETO_PRENDA_REAL",
  "NETO_PRENDA_SCNL",
  "NETO PRENDA 8Q",
]);
const HI = headerMapFromSheet_(shI);

// ==========================
// 2) Find remito row
// ==========================
const idRemitoHint = String(payload?.idRemito || "").trim();
let remitoRow = idRemitoHint
  ? findRemitoRowByIdRemito_(shR, idRemitoHint)
  : findRemitoRowByTNOrderId_(shR, tnOrderId);
if (!remitoRow) {
  return {
    ok: false,
    error: idRemitoHint
      ? `No encontré remito idRemito=${idRemitoHint}`
      : `No encontré remito para TN_ORDER_ID=${tnOrderId}`,
  };
}

const now = new Date();

const setR = (h, v) => {
  if (HR[h]) shR.getRange(remitoRow, HR[h]).setValue(v);
};

// FORCE: limpiar MP_* del REMITO antes de escribir
if (force) {
  Object.keys(HR).forEach((h) => {
    if (h === "TN_ORDER_ID" || h.startsWith("MP_")) {
      shR.getRange(remitoRow, HR[h]).setValue("");
    }
  });
}

// ==========================
// 3) Write REMITOS
// ==========================
const transactionAmount = mp.transactionAmount;
const netReceivedAmount = mp.netReceivedAmount;

const taxTotal = mp.taxTotalReal;
const financingTotal = mp.financingTotalReal;
const feeTotal = mp.feeTotalReal;
const platformFeeTotal = mp.platformFeeTotalReal;

const totalCost =
  mp.totalCostReal != null
    ? (Number(mp.totalCostReal) || 0)
    : (taxTotal + financingTotal + feeTotal + platformFeeTotal);

setR("TN_ORDER_ID", tnOrderId);
setR("MP_PAYMENT_ID", mp.paymentId);
setR("MP_ADDITIONAL_REFERENCE", mp.additionalReference);

setR("MP_STATUS", mp.status);
setR("MP_STATUS_DETAIL", mp.statusDetail);

setR("MP_DATE_CREATED", parseDateOrEmpty(mp.dateCreated));
setR("MP_DATE_APPROVED", parseDateOrEmpty(mp.dateApproved));
setR("MP_MONEY_RELEASE_DATE", parseDateOrEmpty(mp.moneyReleaseDate));

// Preferimos moneyReleaseDate, sino dateApproved
if (HR["MP_ACREDITADO_FECHA"]) {
  const acredit =
    parseDateOrEmpty(mp.moneyReleaseDate) || parseDateOrEmpty(mp.dateApproved);
  setR("MP_ACREDITADO_FECHA", acredit);
}

setR("MP_TRANSACTION_AMOUNT", transactionAmount);
setR("MP_NET_RECEIVED_AMOUNT", netReceivedAmount);

setR("MP_TAX_TOTAL_REAL", taxTotal);
setR("MP_FINANCING_TOTAL_REAL", financingTotal);
setR("MP_FEE_TOTAL_REAL", feeTotal);
setR("MP_PLATFORM_FEE_TOTAL_REAL", platformFeeTotal);

// Nota: este valor se “cierra” al final con la suma por items (si aplica)
setR("MP_TOTAL_COST_REAL", totalCost);

// ✅ En tu ERP, por compat, se escribe ahora y se “cierra” al final si netReceivedAmount vino vacío/0
setR("MP_NETO_REAL_ORDEN", netReceivedAmount);

setR("MP_PAYER_EMAIL", mp.payerEmail);
setR("MP_PAYMENT_TYPE", mp.paymentType);
setR("MP_PAYMENT_METHOD", mp.paymentMethodDisplay || mp.paymentMethod);
setR("MP_INSTALLMENTS", mp.installments);

// Auditoría de match
setR("MP_MATCH_CONFIDENCE", 1);
setR("MP_MATCH_RULE", "ADDITIONAL_REFERENCE==TN_ORDER_ID");
setR("MP_MATCHED_AT", now);
setR("MP_IMPORTED_AT", now);

// ==========================
// 4) Get ID Remito
// ==========================
const idRemitoCol = HR["ID Remito"];
if (!idRemitoCol) {
  return { ok: false, error: "REMITOS: falta columna 'ID Remito' (headerMap)" };
}

const idRemito = shR.getRange(remitoRow, idRemitoCol).getValue();
if (!idRemito) {
  return { ok: false, error: "Encontré el remito pero no tiene ID Remito" };
}

// ==========================
// 5) Load items + filter by ID Remito
// ==========================
const lastI = shI.getLastRow();
if (lastI < 2) {
  return { ok: true, tnOrderId, remitoRow, idRemito, updatedItems: 0, updatedRemitos: true };
}

const dataI = shI.getRange(2, 1, lastI - 1, shI.getLastColumn()).getValues();

const idxId = HI["ID Remito"] ? HI["ID Remito"] - 1 : -1;
const idxPrecio = HI["Precio Unitario"] ? HI["Precio Unitario"] - 1 : -1;
const idxOwner = HI["Owner"] ? HI["Owner"] - 1 : -1;
const idxNeto = HI["NETO_PRENDA"] ? HI["NETO_PRENDA"] - 1 : -1;

if (idxId < 0 || idxPrecio < 0) {
  return { ok: false, error: "REMITO_ITEMS: faltan columnas ID Remito / Precio Unitario" };
}

const rowsIdx = [];
const weights = [];

const idRemitoStr = String(idRemito).trim();

for (let i = 0; i < dataI.length; i++) {
  const rowIdStr = String(dataI[i][idxId] || "").trim();
  if (rowIdStr === idRemitoStr) {
    rowsIdx.push(i); // 0-based en dataI
    const w = Number(dataI[i][idxPrecio] || 0) || 0;
    weights.push(w);
  }
}

if (!rowsIdx.length) {
  return {
    ok: true,
    tnOrderId,
    remitoRow,
    idRemito,
    updatedRemitos: true,
    updatedItems: 0,
    note: "No hay items para ese remito (ID Remito no matcheó en REMITO_ITEMS)",
  };
}

  // Si todos los pesos son 0, evitamos allocate proporcional y caemos a prorrateo parejo
  const allZeroWeights = weights.every((w) => (Number(w) || 0) === 0);
  const effWeights = allZeroWeights ? weights.map(() => 1) : weights;

  // ==========================
  // 6) Allocate pools (cents)
  // ==========================
  const taxC = allocateProportionalCents_(taxTotal, effWeights);
  const finC = allocateProportionalCents_(financingTotal, effWeights);
  const feeC = allocateProportionalCents_(feeTotal, effWeights);
  const platC = allocateProportionalCents_(platformFeeTotal, effWeights);
  const totalC = taxC.map((_, i) => taxC[i] + finC[i] + feeC[i] + platC[i]);

  const fromCents = (c) => (Number(c || 0) / 100);

  // FORCE: limpiar MP_* y netos reales en ITEMS antes de escribir
  if (force) {
    const colsToClear = [
      "MP_PAYMENT_ID",
      "MP_STATUS",
      "MP_INSTALLMENTS",
      "MP_PAYMENT_TYPE",
      "MP_METHOD",
      "MP_TAX_ASIGNADO_REAL",
      "MP_FINANCING_ASIGNADO_REAL",
      "MP_FEE_ASIGNADO_REAL",
      "MP_PLATFORM_FEE_ASIGNADO_REAL",
      "MP_TOTAL_COST_ASIGNADO_REAL",
      "NETO_PRENDA_REAL",
      "NETO_PRENDA_SCNL",
      "NETO PRENDA 8Q"
    ];
    for (let k = 0; k < rowsIdx.length; k++) {
      const sheetRow = rowsIdx[k] + 2;
      colsToClear.forEach((h) => {
        if (HI[h]) shI.getRange(sheetRow, HI[h]).setValue("");
      });
    }
  }

  // ==========================
  // 7) Write items
  // ==========================
  let written = 0;

  for (let k = 0; k < rowsIdx.length; k++) {
    const rowInData = rowsIdx[k];
    const sheetRow = rowInData + 2;

    const owner = idxOwner >= 0 ? String(dataI[rowInData][idxOwner] || "").toUpperCase().trim() : "";
    const netoPrev = idxNeto >= 0 ? (Number(dataI[rowInData][idxNeto]) || 0) : 0;

    const tax = fromCents(taxC[k]);
    const fin = fromCents(finC[k]);
    const fee = fromCents(feeC[k]);
    const plat = fromCents(platC[k]);
    const tot = fromCents(totalC[k]);

    const netoReal = Math.round((netoPrev - tot) * 100) / 100;

    const isScnl = (owner === "SCNL");
    const netoScnl = isScnl ? netoReal : 0;
    const neto8q = isScnl ? 0 : netoReal;

    const setI = (h, v) => {
      if (HI[h]) shI.getRange(sheetRow, HI[h]).setValue(v);
    };

    setI("MP_PAYMENT_ID", mp.paymentId);
    setI("MP_STATUS", mp.status);
    setI("MP_INSTALLMENTS", mp.installments);
    setI("MP_PAYMENT_TYPE", mp.paymentType);
    setI("MP_METHOD", mp.paymentMethodDisplay || mp.paymentMethod);

    setI("MP_TAX_ASIGNADO_REAL", tax);
    setI("MP_FINANCING_ASIGNADO_REAL", fin);
    setI("MP_FEE_ASIGNADO_REAL", fee);
    setI("MP_PLATFORM_FEE_ASIGNADO_REAL", plat);
    setI("MP_TOTAL_COST_ASIGNADO_REAL", tot);

    setI("NETO_PRENDA_REAL", netoReal);
    setI("NETO_PRENDA_SCNL", netoScnl);
    setI("NETO PRENDA 8Q", neto8q);

    written++;
  }
   // ==========================
// 8) Recalcular total real desde items
// ==========================

let totalNetoReal = 0;

for (let k = 0; k < rowsIdx.length; k++) {
  const rowInData = rowsIdx[k];
  const netoPrev = idxNeto >= 0 ? (Number(dataI[rowInData][idxNeto]) || 0) : 0;
  const tot = fromCents(totalC[k]);

  const netoReal = Math.round((netoPrev - tot) * 100) / 100;
  totalNetoReal += netoReal;
}

totalNetoReal = Math.round(totalNetoReal * 100) / 100;

// Guardar total real del remito
setR("MP_NETO_REAL_ORDEN", totalNetoReal);

// Opcional: sobreescribir total cost real desde items (más confiable)
setR("MP_TOTAL_COST_REAL", Math.round((taxTotal + financingTotal + feeTotal + platformFeeTotal) * 100) / 100);

  // ==========================
  // 9) Remitos hermanos (mismo TN sin MP)
  // ==========================
  let siblingsUpdated = 0;
  let siblingsItemsWritten = 0;
  const siblingRows = findAllRemitoRowsByTNOrderId_(shR, tnOrderId).filter(function (m) {
    return m.sheetRow !== remitoRow && !m.hasMp;
  });

  for (let si = 0; si < siblingRows.length; si++) {
    const sibRow = siblingRows[si].sheetRow;
    const sibSetR = function (h, v) {
      if (HR[h]) shR.getRange(sibRow, HR[h]).setValue(v);
    };

    sibSetR("TN_ORDER_ID", tnOrderId);
    sibSetR("MP_PAYMENT_ID", mp.paymentId);
    sibSetR("MP_ADDITIONAL_REFERENCE", mp.additionalReference);
    sibSetR("MP_STATUS", mp.status);
    sibSetR("MP_STATUS_DETAIL", mp.statusDetail);
    sibSetR("MP_DATE_CREATED", parseDateOrEmpty(mp.dateCreated));
    sibSetR("MP_DATE_APPROVED", parseDateOrEmpty(mp.dateApproved));
    sibSetR("MP_MONEY_RELEASE_DATE", parseDateOrEmpty(mp.moneyReleaseDate));
    if (HR["MP_ACREDITADO_FECHA"]) {
      const acredit =
        parseDateOrEmpty(mp.moneyReleaseDate) || parseDateOrEmpty(mp.dateApproved);
      sibSetR("MP_ACREDITADO_FECHA", acredit);
    }
    sibSetR("MP_TRANSACTION_AMOUNT", transactionAmount);
    sibSetR("MP_NET_RECEIVED_AMOUNT", netReceivedAmount);
    sibSetR("MP_TAX_TOTAL_REAL", taxTotal);
    sibSetR("MP_FINANCING_TOTAL_REAL", financingTotal);
    sibSetR("MP_FEE_TOTAL_REAL", feeTotal);
    sibSetR("MP_PLATFORM_FEE_TOTAL_REAL", platformFeeTotal);
    sibSetR("MP_TOTAL_COST_REAL", totalCost);
    sibSetR("MP_NETO_REAL_ORDEN", totalNetoReal);
    sibSetR("MP_PAYER_EMAIL", mp.payerEmail);
    sibSetR("MP_PAYMENT_TYPE", mp.paymentType);
    sibSetR("MP_PAYMENT_METHOD", mp.paymentMethodDisplay || mp.paymentMethod);
    sibSetR("MP_INSTALLMENTS", mp.installments);
    sibSetR("MP_MATCH_CONFIDENCE", 1);
    sibSetR("MP_MATCH_RULE", "SIBLING_TN_ORDER_ID");
    sibSetR("MP_MATCHED_AT", now);
    sibSetR("MP_IMPORTED_AT", now);

    const sibIdRemito = String(shR.getRange(sibRow, idRemitoCol).getValue() || "").trim();
    if (!sibIdRemito) continue;

    const sibRowsIdx = [];
    const sibWeights = [];
    for (let i = 0; i < dataI.length; i++) {
      const rowIdStr = String(dataI[i][idxId] || "").trim();
      if (rowIdStr === sibIdRemito) {
        sibRowsIdx.push(i);
        sibWeights.push(Number(dataI[i][idxPrecio] || 0) || 0);
      }
    }

    const sibAllZero = sibWeights.every(function (w) { return (Number(w) || 0) === 0; });
    const sibEffWeights = sibAllZero ? sibWeights.map(function () { return 1; }) : sibWeights;
    const sibTaxC = allocateProportionalCents_(taxTotal, sibEffWeights);
    const sibFinC = allocateProportionalCents_(financingTotal, sibEffWeights);
    const sibFeeC = allocateProportionalCents_(feeTotal, sibEffWeights);
    const sibPlatC = allocateProportionalCents_(platformFeeTotal, sibEffWeights);
    const sibTotalC = sibTaxC.map(function (_, i) { return sibTaxC[i] + sibFinC[i] + sibFeeC[i] + sibPlatC[i]; });

    let sibWritten = 0;
    for (let k = 0; k < sibRowsIdx.length; k++) {
      const rowInData = sibRowsIdx[k];
      const sheetRowI = rowInData + 2;
      const owner = idxOwner >= 0 ? String(dataI[rowInData][idxOwner] || "").toUpperCase().trim() : "";
      const netoPrev = idxNeto >= 0 ? (Number(dataI[rowInData][idxNeto]) || 0) : 0;
      const tax = fromCents(sibTaxC[k]);
      const fin = fromCents(sibFinC[k]);
      const fee = fromCents(sibFeeC[k]);
      const plat = fromCents(sibPlatC[k]);
      const tot = fromCents(sibTotalC[k]);
      const netoRealSib = Math.round((netoPrev - tot) * 100) / 100;
      const isScnl = (owner === "SCNL");
      const setI = function (h, v) {
        if (HI[h]) shI.getRange(sheetRowI, HI[h]).setValue(v);
      };
      setI("MP_PAYMENT_ID", mp.paymentId);
      setI("MP_STATUS", mp.status);
      setI("MP_INSTALLMENTS", mp.installments);
      setI("MP_PAYMENT_TYPE", mp.paymentType);
      setI("MP_METHOD", mp.paymentMethodDisplay || mp.paymentMethod);
      setI("MP_TAX_ASIGNADO_REAL", tax);
      setI("MP_FINANCING_ASIGNADO_REAL", fin);
      setI("MP_FEE_ASIGNADO_REAL", fee);
      setI("MP_PLATFORM_FEE_ASIGNADO_REAL", plat);
      setI("MP_TOTAL_COST_ASIGNADO_REAL", tot);
      setI("NETO_PRENDA_REAL", netoRealSib);
      setI("NETO_PRENDA_SCNL", isScnl ? netoRealSib : 0);
      setI("NETO PRENDA 8Q", isScnl ? 0 : netoRealSib);
      sibWritten++;
    }

    siblingsUpdated++;
    siblingsItemsWritten += sibWritten;
  }

  // ==========================
  // 10) Response
  // ==========================
  return {
    ok: true,
    tnOrderId,
    force,
    remitoRow,
    idRemito,
    updatedRemitos: true,
    updatedItems: written,
    siblingsUpdated: siblingsUpdated,
    siblingsItemsWritten: siblingsItemsWritten,
    meta: {
      allZeroWeights,
      itemsMatched: rowsIdx.length
    },
    totals: {
      transactionAmount,
      netReceivedAmount,
      taxTotal,
      financingTotal,
      feeTotal,
      platformFeeTotal,
      totalCost
    }
  };
}



/***********************
 * SYNC CHUNKED: TN_PRODUCTS -> STOCK MAESTRO (grilla actual)
 ***********************/
function getScriptProp_(k) { return PropertiesService.getScriptProperties().getProperty(k); }
function setScriptProp_(k, v) { return PropertiesService.getScriptProperties().setProperty(k, String(v)); }
function delScriptProp_(k) { return PropertiesService.getScriptProperties().deleteProperty(k); }

function readTNProductsRows_() {
  const ss = openSS(SPREADSHEET_ID);
  const sh = ss.getSheetByName(TN_PRODUCTS_SHEET);
  if (!sh) throw new Error(`No existe la hoja ${TN_PRODUCTS_SHEET}`);

  const last = sh.getLastRow();
  if (last < 2) return { headers: [], rows: [] };

  const values = sh.getRange(1, 1, last, sh.getLastColumn()).getValues();
  const headers = values[0].map(h => String(h || '').trim());
  const rows = values.slice(1);
  return { headers, rows };
}

function buildTNIndex_(headers) {
  const iSku = headers.indexOf('sku');
  const iNombre = headers.indexOf('nombre');
  const iStock = headers.indexOf('stock');
  if (iSku < 0) throw new Error('TN_PRODUCTS: falta columna "sku"');
  if (iNombre < 0) throw new Error('TN_PRODUCTS: falta columna "nombre"');
  if (iStock < 0) throw new Error('TN_PRODUCTS: falta columna "stock"');
  return { iSku, iNombre, iStock };
}

function parseSkuSizeForGrid_(sku) {
  if (!sku) return { size: '' };

  const parts = String(sku).toUpperCase().split('-');

  // talles válidos en tu grilla
  // buscamos desde el final hacia atrás
  for (let i = parts.length - 1; i >= 0; i--) {
    if (VALID_STOCK_SIZES.indexOf(parts[i]) >= 0) {
      return { size: parts[i] };
    }
  }

  return { size: '' };
}

function ensureStockHeadersGrid_(sh) {
  const needed = ['SKU','ARTICULO','XS','S','M','L','XL','XXL','XXXL','Stock Total'];

  if (sh.getLastRow() === 0) {
    sh.getRange(1, 1, 1, needed.length).setValues([needed]);
    return needed;
  }

  const hdr = sh.getRange(1, 1, 1, Math.max(sh.getLastColumn(), needed.length)).getValues()[0]
    .map(h => String(h || '').trim());

  const present = new Set(hdr.filter(Boolean));
  const missing = needed.filter(h => !present.has(h));

  if (missing.length) {
    const start = (hdr.length || 1) + 1;
    sh.insertColumnsAfter(hdr.length || 1, missing.length);
    sh.getRange(1, start, 1, missing.length).setValues([missing]);
  }

  return sh.getRange(1, 1, 1, sh.getLastColumn()).getValues()[0].map(h => String(h || '').trim());
}

function headerMap_(headers) {
  const m = {};
  headers.forEach((h, i) => { if (h) m[h] = i; }); // 0-based
  return m;
}

function buildStockIndex_(stockSh, H) {
  const last = stockSh.getLastRow();
  const map = new Map();
  if (last < 2) return map;

  const skuVals = stockSh.getRange(2, H['SKU'] + 1, last - 1, 1).getValues();
  for (let i = 0; i < skuVals.length; i++) {
    const sku = String(skuVals[i][0] || '').trim().toUpperCase();
    if (sku) map.set(sku, i + 2); // row number
  }
  return map;
}

/**
 * Sync por chunks
 * Params:
 * - mode: "merge" (default) | "rebuild" (borra y arranca de 0)
 * - limit: cantidad de filas a procesar por corrida (ej 300)
 * - reset: true para resetear cursor sin borrar data
 */
function syncStockFromTNProductsChunked_(params) {
  const mode = String(params?.mode || 'merge').toLowerCase();
  const limit = Math.max(50, Math.min(1500, Number(params?.limit || 300)));
  const reset = !!params?.reset;

  const ss = openSS(SPREADSHEET_ID);
  const stockSh = ss.getSheetByName(STOCK_SHEET_NAME) || ss.insertSheet(STOCK_SHEET_NAME);

  if (mode !== 'merge' && mode !== 'rebuild') throw new Error('mode inválido (merge | rebuild)');

  if (mode === 'rebuild') {
    stockSh.clearContents();
    delScriptProp_('SYNC_TN_CURSOR');
  } else if (reset) {
    delScriptProp_('SYNC_TN_CURSOR');
  }

  const stockHeaders = ensureStockHeadersGrid_(stockSh);
  const H = headerMap_(stockHeaders);

  const { headers: tnHeaders, rows: tnRows } = readTNProductsRows_();
  const idx = buildTNIndex_(tnHeaders);

  const cursor0 = Number(getScriptProp_('SYNC_TN_CURSOR') || '0'); // 0-based index sobre tnRows
  const start = Math.max(0, cursor0);
  const end = Math.min(tnRows.length, start + limit);

  // armamos índice SKU->row existente (una sola vez por corrida)
  const skuToRow = buildStockIndex_(stockSh, H);

  const toWriteExisting = []; // {row, valuesArray}
  const toAppend = [];        // valuesArray completas

  const colCount = stockSh.getLastColumn();

  let scanned = 0, skippedNoSku = 0, skippedNoSize = 0, upserted = 0, created = 0;

  for (let i = start; i < end; i++) {
    scanned++;
    const r = tnRows[i];
    const skuRaw = String(r[idx.iSku] || '').trim();
    if (!skuRaw) { skippedNoSku++; continue; }

    const sku = skuRaw.toUpperCase();
    const { size } = parseSkuSizeForGrid_(sku);
    if (!size) { skippedNoSize++; continue; }

    const articulo = String(r[idx.iNombre] || '').trim();
    const stockVal = Number(r[idx.iStock] || 0);

    // construir fila completa (0-based array colCount)
    const rowArr = new Array(colCount).fill('');
    rowArr[H['SKU']] = sku;
    rowArr[H['ARTICULO']] = articulo;

    // talles en 0 por default (para fila nueva); para existente solo vamos a setear el talle que corresponde
    const sizeCols = VALID_STOCK_SIZES.slice();

    // si es fila nueva: setear todos los talles a 0 y luego el talle correcto
    // si es existente: dejamos los otros talles vacíos para NO pisarlos (los vamos a escribir por rango solo en las columnas necesarias)
    const existingRow = skuToRow.get(sku);

    if (!existingRow) {
      sizeCols.forEach(sz => { rowArr[H[sz]] = 0; });
      rowArr[H[size]] = stockVal;

      const total = sizeCols
        .map(sz => Number(rowArr[H[sz]] || 0))
        .reduce((a,b)=>a+b, 0);
      rowArr[H['Stock Total']] = total;

      toAppend.push(rowArr);
      created++;
      upserted++;
    } else {
      // Para existente: vamos a actualizar SKU, ARTICULO, talle específico y Stock Total recalculado leyendo la fila actual
      const current = stockSh.getRange(existingRow, 1, 1, colCount).getValues()[0];

      current[H['SKU']] = sku;
      current[H['ARTICULO']] = articulo;
      current[H[size]] = stockVal;

      const total = sizeCols
        .map(sz => Number(current[H[sz]] || 0))
        .reduce((a,b)=>a+b, 0);
      current[H['Stock Total']] = total;

      toWriteExisting.push({ row: existingRow, values: current });
      upserted++;
    }
  }

  // Escritura batch:
  // 1) existentes: agrupar por bloques contiguos para setValues (reduce llamadas)
  if (toWriteExisting.length) {
    toWriteExisting.sort((a,b)=>a.row-b.row);

    let blockStart = toWriteExisting[0].row;
    let block = [toWriteExisting[0].values];

    for (let k = 1; k < toWriteExisting.length; k++) {
      const prevRow = toWriteExisting[k-1].row;
      const cur = toWriteExisting[k];
      if (cur.row === prevRow + 1) {
        block.push(cur.values);
      } else {
        stockSh.getRange(blockStart, 1, block.length, colCount).setValues(block);
        blockStart = cur.row;
        block = [cur.values];
      }
    }
    stockSh.getRange(blockStart, 1, block.length, colCount).setValues(block);
  }

  // 2) append de nuevas: un solo setValues grande
  if (toAppend.length) {
    const appendStart = stockSh.getLastRow() + 1;
    stockSh.getRange(appendStart, 1, toAppend.length, colCount).setValues(toAppend);
  }

  const done = (end >= tnRows.length);
  setScriptProp_('SYNC_TN_CURSOR', done ? String(tnRows.length) : String(end));

  return {
    ok: true,
    mode,
    limit,
    cursor: { start, end, total: tnRows.length, done },
    stats: { scanned, upserted, created, skippedNoSku, skippedNoSize }
  };
}
function findSkuByArticuloTalleOwner_(articulo, talle, ownerTag) {
  if (!articulo || !talle) return '';

  const sh = getSheet(STOCK_SPREADSHEET_ID, STOCK_SHEET_NAME);
  const values = sh.getDataRange().getValues();
  if (values.length < 2) return '';

  const headers = values[0].map(String);
  const idxSKU  = headerIndex_(headers, 'SKU');
  const idxItem = headerIndex_(headers, 'ARTICULO');
  if (idxSKU < 0 || idxItem < 0) return '';

  const wantOwner = normalizeOwner_(ownerTag);
  const T = String(talle).trim().toUpperCase();
  const artNorm = _norm_(articulo);

  for (let r = 1; r < values.length; r++) {
    const row = values[r];
    const sku = String(row[idxSKU] || '').trim().toUpperCase();
    const art = String(row[idxItem] || '').trim();

    if (!sku || !art) continue;

    if (_norm_(art) !== artNorm) continue;

    const endsTalle = sku.endsWith('-' + T) || sku.endsWith('-' + T + '-SCNL');
    if (!endsTalle) continue;

    const isScnl = sku.endsWith('-SCNL');
    if (wantOwner === 'SCNL' && !isScnl) continue;
    if (!wantOwner && isScnl) continue;

    return sku;
  }
  return '';
}

/**
 * Wrapper público (sin underscore) para que:
 * - lo puedas llamar fácil desde otros lados
 * - use SIEMPRE la implementación real con underscore: syncStockFromTNProductsChunked_
 *
 * @param {Object|string} opts - puede ser "merge"/"rebuild" o un objeto {mode, limit, reset}
 */
function syncStockFromTNProducts(opts) {
  // Soporta llamada vieja: syncStockFromTNProducts("merge")
  let params = {};
  if (typeof opts === 'string') {
    params = { mode: opts };
  } else {
    params = opts || {};
  }

  const mode  = String(params.mode || 'merge').toLowerCase();
  const limit = Number(params.limit || 300);
  const reset = !!params.reset;

  // ✅ ESTA ES LA FUNCIÓN REAL (con underscore final)
  return syncStockFromTNProductsChunked_({ mode, limit, reset });
}

/**
 * Debug desde Apps Script (botón "Ejecutar")
 * Corre 1 chunk (ej 300) y te loguea stats/cursor
 */
// ===============================
// DEBUG / RUN MANUAL
// ===============================
function RUN_syncStock_next_300() {
  const result = syncStockFromTNProducts({
    mode: "merge",
    limit: 300,
    reset: false, // clave: NO reset
  });
  Logger.log(JSON.stringify(result));
}

function RUN_syncStock_reset_300() {
  const result = syncStockFromTNProducts({
    mode: "merge",
    limit: 300,
    reset: true,
  });
  Logger.log(JSON.stringify(result));
}
function RUN_syncStock_next_700() {
  const result = syncStockFromTNProducts({
    mode: "merge",
    limit: 700,
    reset: false, // clave: NO reset
  });
  Logger.log(JSON.stringify(result));
}

function RUN_syncStock_reset_700() {
  const result = syncStockFromTNProducts({
    mode: "merge",
    limit: 700,
    reset: true, // reset del cursor
  });
  Logger.log(JSON.stringify(result));
}


function debugSyncStockFromTNProducts() {
  const ss = SpreadsheetApp.openById(SPREADSHEET_ID);

  const shTN = ss.getSheetByName(TN_PRODUCTS_SHEET);
  const shST = ss.getSheetByName(STOCK_SHEET_NAME);

  const tnLast = shTN ? shTN.getLastRow() : 0;
  const stLast = shST ? shST.getLastRow() : 0;

  Logger.log('TN_PRODUCTS_SHEET=' + TN_PRODUCTS_SHEET + ' exists=' + !!shTN + ' lastRow=' + tnLast);
  Logger.log('STOCK_SHEET_NAME=' + STOCK_SHEET_NAME + ' exists=' + !!shST + ' lastRow=' + stLast);

  if (!shTN) throw new Error('No existe la hoja ' + TN_PRODUCTS_SHEET);
  if (tnLast < 2) throw new Error('TN_PRODUCTS está vacía. Corré primero syncTiendanubeProducts().');

  // Probá con merge y chunk chico para validar
  const result = syncStockFromTNProducts({ mode: 'merge', limit: 300, reset: false });
  Logger.log('[SYNC_STOCK_RESULT] ' + JSON.stringify(result));
  return result;
}


/***********************
 * NETO POR PRENDA (REMITO_ITEMS)
 * - Descuentos globales prorrateados
 * - Fees (TN + MP / Transfer)
 * - Impuesto 0,6% SOLO Transferencias
 ***********************/

// ======= PARAMS (ajustables) =======
const FEE_TN = 0.01;            // 1% Tiendanube
const FEE_TRANSFER = 0.006;     // 0,6% transferencia (banco)
const TAX_ICD_TRANSFER = 0.006; // 0,6% impuesto créditos/débitos SOLO transferencia

const MP_RATES = {
  'MP 1': 0.0149,
  'MP 2': 0.0579,
  'MP 3': 0.0779
};

// Columnas nuevas en REMITO_ITEMS
const REMITO_ITEMS_NET_COLS = [
  'DESCUENTO_ASIGNADO',
  'SHIPPING_ASIGNADO',
  'FEE_ASIGNADO',
  'NETO_PRENDA'
];

function ensureRemitoItemsNetColumns_() {
  const shI = getSheet(SPREADSHEET_ID, SHEET_ITEMS);
  const lastCol = shI.getLastColumn();
  const hdr = shI.getRange(1, 1, 1, lastCol).getValues()[0].map(h => String(h || '').trim());

  const present = new Set(hdr.filter(Boolean));
  const missing = REMITO_ITEMS_NET_COLS.filter(c => !present.has(c));

  if (missing.length) {
    shI.insertColumnsAfter(lastCol, missing.length);
    shI.getRange(1, lastCol + 1, 1, missing.length).setValues([missing]);
  }

  // devolver headers actualizados
  return shI.getRange(1, 1, 1, shI.getLastColumn()).getValues()[0].map(h => String(h || '').trim());
}

function getFeeRateForMetodoPago_(metodoPago) {
  const mp = String(metodoPago || '').trim();

  // Transferencias (solo acá aplica impuesto 0,6%)
  if (mp.toLowerCase().includes('transferencia')) {
    return FEE_TN + FEE_TRANSFER + TAX_ICD_TRANSFER;
  }

  // Mercado Pago cuotas
  if (MP_RATES[mp] != null) {
    return FEE_TN + MP_RATES[mp]; // SIN impuesto acá
  }

  // Otros medios: por defecto solo TN
  return FEE_TN;
}

/**
 * Recalcula netos y los escribe en REMITO_ITEMS para un remito puntual
 * @param {string} remitoId
 */
function recomputeRemitoNetos_(remitoId) {
  if (!remitoId) throw new Error('id requerido');

  const shR = getSheet(SPREADSHEET_ID, SHEET_REMITOS);
  const shI = getSheet(SPREADSHEET_ID, SHEET_ITEMS);

  // Asegura columnas neto
  const hdrI = ensureRemitoItemsNetColumns_();
  const iI = (name) => headerIndex_(hdrI, name);

  const iRID = iI('ID Remito');
  const iPrecio = iI('Precio Unitario');

  const iDesc = iI('DESCUENTO_ASIGNADO');
  const iShip = iI('SHIPPING_ASIGNADO');
  const iFee  = iI('FEE_ASIGNADO');
  const iNeto = iI('NETO_PRENDA');

  if (iRID < 0 || iPrecio < 0) throw new Error('REMITO_ITEMS: faltan columnas base');

  // ===== Leer REMITOS (cabecera) =====
  const lastR = shR.getLastRow();
  if (lastR < 2) throw new Error('No hay remitos');

  const hdrR = shR.getRange(1, 1, 1, shR.getLastColumn()).getValues()[0].map(String);
  const iR = (name) => headerIndex_(hdrR, name);

  const idxId = iR('ID Remito');
  const idxSub = iR('Subtotal');
  const idxShip = iR('Costo De Envio');
  const idxTotal = iR('Total Final');
  const idxMetodo = iR('Metodo De Pago');

  if (idxId < 0 || idxSub < 0 || idxShip < 0 || idxTotal < 0 || idxMetodo < 0) {
    throw new Error('REMITOS: faltan columnas requeridas (ID Remito/Subtotal/Costo De Envio/Total Final/Metodo De Pago)');
  }

  const rowsR = shR.getRange(2, 1, lastR - 1, shR.getLastColumn()).getValues();
  const rowR = rowsR.find(r => String(r[idxId] || '') === String(remitoId));
  if (!rowR) throw new Error('No existe ese remito: ' + remitoId);

  const subtotal = toNumber_(rowR[idxSub]);
  const shippingCobrado = toNumber_(rowR[idxShip]); // 0 si envío gratis
  const totalFinal = toNumber_(rowR[idxTotal]);
  const metodoPago = String(rowR[idxMetodo] || '').trim();

  // Fee total del pago (prorrateado luego por prenda)
  const feeRate = getFeeRateForMetodoPago_(metodoPago);
  const feeTotal = totalFinal * feeRate;

  // ===== Leer REMITO_ITEMS (items del remito) =====
  const lastI = shI.getLastRow();
  if (lastI < 2) return { ok:true, id: remitoId, updated: 0, note: 'No hay items' };

  const dataI = shI.getRange(2, 1, lastI - 1, shI.getLastColumn()).getValues();

  // índices de filas reales en hoja (para poder escribir)
  const itemIdxs = [];
  const precios = [];

  for (let r = 0; r < dataI.length; r++) {
    if (String(dataI[r][iRID] || '') === String(remitoId)) {
      itemIdxs.push(r); // índice en dataI (0-based)
      precios.push(toNumber_(dataI[r][iPrecio]));
    }
  }

  const n = itemIdxs.length;
  if (!n) return { ok:true, id: remitoId, updated: 0, note: 'No hay items para ese remito' };

  const sumPrecios = precios.reduce((a,b)=>a+b, 0);

  // Descuento global (según tu lógica PRO):
  // descuento = SUM(precios unitarios) - Subtotal (subtotal ya viene con promo aplicada)
  // Si por algún caso raro diera negativo, lo clamp a 0.
  let descuentoTotal = sumPrecios - subtotal;
  if (!isFinite(descuentoTotal)) descuentoTotal = 0;
  if (descuentoTotal < 0) descuentoTotal = 0;

  // Shipping cobrado al cliente: lo distribuimos por prenda (si es 0, todos 0)
  const shippingTotal = Math.max(0, shippingCobrado);

  // Helper para prorrateo proporcional + ajuste final para que cierre exacto
  function allocate_(total, weights) {
    const wsum = weights.reduce((a,b)=>a+b, 0);
    if (total === 0 || wsum === 0) return new Array(weights.length).fill(0);

    const raw = weights.map(w => (total * (w / wsum)));
    // Ajuste para que la suma cierre (sin redondeos agresivos):
    // redondeamos a 2 decimales en cada línea y ajustamos la última línea con el delta.
    const rounded = raw.map(x => Math.round(x * 100) / 100);
    const s = rounded.reduce((a,b)=>a+b, 0);
    const delta = Math.round((total - s) * 100) / 100;
    rounded[rounded.length - 1] = Math.round((rounded[rounded.length - 1] + delta) * 100) / 100;
    return rounded;
  }

  const descAlloc = allocate_(descuentoTotal, precios);
  const shipAlloc = allocate_(shippingTotal, precios);
  const feeAlloc  = allocate_(feeTotal, precios);

  // Escribimos en hoja: 4 columnas nuevas
  // NETO_PRENDA = precio - desc - fee + ship
  // (ship es lo que pagó el cliente, no tu costo interno)
  const updates = [];

  for (let k = 0; k < n; k++) {
    const precio = precios[k];
    const d = descAlloc[k];
    const s = shipAlloc[k];
    const f = feeAlloc[k];
    const neto = Math.round((precio - d - f + s) * 100) / 100;

    updates.push([d, s, f, neto]);
  }

  // Rango destino (filas no contiguas): escribimos celda por celda en batch simple
  // (si luego querés performance extrema, lo optimizamos a bloques contiguos)
  for (let k = 0; k < n; k++) {
    const rowInData = itemIdxs[k];       // 0-based en dataI
    const sheetRow = rowInData + 2;      // porque dataI arranca en fila 2
    shI.getRange(sheetRow, iDesc + 1, 1, 4).setValues([updates[k]]);
  }

  return {
    ok: true,
    id: remitoId,
    metodoPago,
    feeRate,
    totals: {
      sumPrecios,
      subtotal,
      shippingCobrado: shippingTotal,
      descuentoTotal,
      feeTotal: Math.round(feeTotal * 100) / 100,
      totalFinal
    },
    updated: n
  };
}

/**
 * Batch por fecha (usa REMITOS.fecha dentro del rango)
 * GET: ?action=recomputeNetosRange&fromISO=2026-01-01T00:00:00.000Z&toISO=2026-01-31T23:59:59.999Z
 */
function recomputeNetosRange_({ fromISO, toISO, limit }) {
  const shR = getSheet(SPREADSHEET_ID, SHEET_REMITOS);
  const lastR = shR.getLastRow();
  if (lastR < 2) return { ok:true, processed: 0 };

  const hdrR = shR.getRange(1,1,1,shR.getLastColumn()).getValues()[0].map(String);
  const iR = (name) => headerIndex_(hdrR, name);

  const idxId = iR('ID Remito');
  const idxFecha = iR('Fecha');
  if (idxId < 0 || idxFecha < 0) throw new Error('REMITOS: faltan columnas ID Remito / Fecha');

  const from = fromISO ? new Date(fromISO) : new Date('2000-01-01T00:00:00.000Z');
  const to   = toISO ? new Date(toISO) : new Date('2100-01-01T00:00:00.000Z');
  const max = Math.max(1, Number(limit || 300));

  const rowsR = shR.getRange(2,1,lastR-1,shR.getLastColumn()).getValues();

  const ids = [];
  for (let i = 0; i < rowsR.length; i++) {
    const id = String(rowsR[i][idxId] || '');
    const fecha = rowsR[i][idxFecha] instanceof Date ? rowsR[i][idxFecha] : new Date(rowsR[i][idxFecha]);
    if (!id) continue;
    if (fecha >= from && fecha <= to) ids.push(id);
    if (ids.length >= max) break;
  }

  const results = [];
  for (const id of ids) {
    try { results.push(recomputeRemitoNetos_(id)); }
    catch (e) { results.push({ ok:false, id, error: String(e) }); }
  }

  return { ok:true, processed: results.length, results };
}
function recalcularNetosTransferenciaRemitoItems() {
  const SHEET_ITEMS = 'REMITO_ITEMS';
  const SHEET_CONFIG = 'CONFIG_TRANSFER_DIA';

  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const shItems = ss.getSheetByName(SHEET_ITEMS);
  const shConfig = ss.getSheetByName(SHEET_CONFIG);

  if (!shItems) throw new Error(`No existe la hoja ${SHEET_ITEMS}`);
  if (!shConfig) throw new Error(`No existe la hoja ${SHEET_CONFIG}`);

  const data = shItems.getDataRange().getValues();
  const configData = shConfig.getDataRange().getValues();

  if (data.length < 2) return;
  if (configData.length < 2) {
    throw new Error('La hoja CONFIG_TRANSFER_DIA no tiene configuración cargada.');
  }

  const headers = data[0].map(h => String(h).trim());
  const configHeaders = configData[0].map(h => String(h).trim());

  const idxFecha = headers.indexOf('Fecha');
  const idxRemito = headers.indexOf('ID Remito');
  const idxOwner = headers.indexOf('Owner');
  const idxNeto = headers.indexOf('NETO_PRENDA');
  const idxMetodoPago = headers.indexOf('Metodo De Pago');
  const idxScnl = headers.indexOf('NETO_PRENDA_SCNL');
  const idx8Q = headers.indexOf('NETO PRENDA 8Q');

  const idxConfigFecha = configHeaders.indexOf('FECHA');
  const idxConfigTasa = configHeaders.indexOf('TASA_TRANSFERENCIA');

  const missingItems = [];
  if (idxFecha === -1) missingItems.push('Fecha');
  if (idxRemito === -1) missingItems.push('ID Remito');
  if (idxOwner === -1) missingItems.push('Owner');
  if (idxNeto === -1) missingItems.push('NETO_PRENDA');
  if (idxMetodoPago === -1) missingItems.push('Metodo De Pago');
  if (idxScnl === -1) missingItems.push('NETO_PRENDA_SCNL');
  if (idx8Q === -1) missingItems.push('NETO PRENDA 8Q');

  if (missingItems.length) {
    throw new Error('Faltan columnas en REMITO ITEMS: ' + missingItems.join(', '));
  }

  const missingConfig = [];
  if (idxConfigFecha === -1) missingConfig.push('FECHA');
  if (idxConfigTasa === -1) missingConfig.push('TASA_TRANSFERENCIA');

  if (missingConfig.length) {
    throw new Error('Faltan columnas en CONFIG_TRANSFER_DIA: ' + missingConfig.join(', '));
  }

  const feeByDate = {};
  for (let i = 1; i < configData.length; i++) {
    const rawFecha = configData[i][idxConfigFecha];
    const rawTasa = configData[i][idxConfigTasa];

    const fechaKey = normalizeDateKey(rawFecha);
    const tasa = Number(rawTasa);

    if (!fechaKey) continue;
    if (isNaN(tasa)) {
      throw new Error(`La tasa no es válida en CONFIG_TRANSFER_DIA para la fecha ${fechaKey}`);
    }

    feeByDate[fechaKey] = tasa;
  }

  for (let i = 1; i < data.length; i++) {
    const metodoPago = normalizeText(data[i][idxMetodoPago]);
    if (isTransferencia(metodoPago)) {
      data[i][idxScnl] = '';
      data[i][idx8Q] = '';
    }
  }

  const remitos = {};

  for (let i = 1; i < data.length; i++) {
    const row = data[i];

    const fechaKey = normalizeDateKey(row[idxFecha]);
    const idRemito = String(row[idxRemito] || '').trim();
    const owner = normalizeText(row[idxOwner]);
    const metodoPago = normalizeText(row[idxMetodoPago]);
    const neto = toNumber(row[idxNeto]);

    if (!fechaKey || !idRemito || neto <= 0) continue;
    if (!isTransferencia(metodoPago)) continue;

    const tasa = feeByDate[fechaKey];
    if (typeof tasa !== 'number') {
      throw new Error(`No hay tasa configurada en CONFIG_TRANSFER_DIA para la fecha ${fechaKey}`);
    }

    if (!remitos[idRemito]) {
      remitos[idRemito] = {
        fechaKey,
        tasa,
        total: 0,
        rows: []
      };
    }

    remitos[idRemito].rows.push({
      rowIndex: i,
      owner,
      neto
    });

    remitos[idRemito].total += neto;
  }

  Object.keys(remitos).forEach(idRemito => {
    const remito = remitos[idRemito];
    const totalNeto = round2(remito.total);
    const totalFee = round2(totalNeto * remito.tasa);

    let feeAcumulado = 0;

    remito.rows.forEach((item, idx) => {
      let feeItem = 0;

      if (idx < remito.rows.length - 1) {
        feeItem = round2(totalFee * (item.neto / totalNeto));
        feeAcumulado += feeItem;
      } else {
        feeItem = round2(totalFee - feeAcumulado);
      }

      const netoFinal = round2(item.neto - feeItem);

      if (item.owner === 'SCNL') {
        data[item.rowIndex][idxScnl] = netoFinal;
        data[item.rowIndex][idx8Q] = '';
      } else {
        data[item.rowIndex][idxScnl] = '';
        data[item.rowIndex][idx8Q] = netoFinal;
      }
    });
  });

  shItems.getRange(1, 1, data.length, data[0].length).setValues(data);

  if (data.length > 1) {
    shItems.getRange(2, idxScnl + 1, data.length - 1, 1).setNumberFormat('$#,##0.00');
    shItems.getRange(2, idx8Q + 1, data.length - 1, 1).setNumberFormat('$#,##0.00');
  }

  Logger.log(`Transferencias recalculadas correctamente. Remitos procesados: ${Object.keys(remitos).length}`);
}

function normalizeText(value) {
  return String(value || '')
    .trim()
    .toUpperCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '');
}

function isTransferencia(text) {
  return /TRANSFER/.test(text);
}

function toNumber(value) {
  if (typeof value === 'number') return value;

  return parseFloat(
    String(value || '')
      .replace(/\$/g, '')
      .replace(/,/g, '')
      .trim()
  ) || 0;
}

function round2(n) {
  return Math.round((n + Number.EPSILON) * 100) / 100;
}

function normalizeDateKey(value) {
  if (!value) return '';

  if (Object.prototype.toString.call(value) === '[object Date]' && !isNaN(value)) {
    return Utilities.formatDate(value, Session.getScriptTimeZone(), 'dd/MM/yyyy');
  }

  const str = String(value).trim();

  if (/^\d{1,2}\/\d{1,2}\/\d{4}$/.test(str)) {
    const [d, m, y] = str.split('/');
    return `${pad2(d)}/${pad2(m)}/${y}`;
  }

  const match = str.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})/);
  if (match) {
    return `${pad2(match[1])}/${pad2(match[2])}/${match[3]}`;
  }

  return '';
}

function pad2(value) {
  return String(value).padStart(2, '0');
}
function diagnosticoFechasTransferencias() {
  const sh = SpreadsheetApp.getActiveSpreadsheet().getSheetByName('REMITO ITEMS');
  const data = sh.getDataRange().getValues();
  const headers = data[0].map(h => String(h).trim());

  const idxFecha = headers.indexOf('Fecha');
  const idxMetodoPago = headers.indexOf('Metodo De Pago');
  const idxRemito = headers.indexOf('ID Remito');

  for (let i = 1; i < Math.min(data.length, 20); i++) {
    const metodo = String(data[i][idxMetodoPago] || '');
    if (/TRANSFER/i.test(metodo)) {
      Logger.log(
        'Fila %s | Fecha RAW: %s | Fecha KEY: %s | Metodo: %s | ID Remito: %s',
        i + 1,
        data[i][idxFecha],
        normalizeDateKey(data[i][idxFecha]),
        metodo,
        data[i][idxRemito]
      );
    }
  }
}
function recalcularTransferenciasPost(e) {
  try {
    const body = e && e.postData && e.postData.contents
      ? JSON.parse(e.postData.contents)
      : {};

    const token = body.token || "";
    const expectedToken = PropertiesService.getScriptProperties().getProperty("APPS_SCRIPT_TOKEN");

    if (expectedToken && token !== expectedToken) {
      return jsonOutput({
        ok: false,
        error: "unauthorized"
      });
    }

    recalcularNetosTransferenciaRemitoItems();

    return jsonOutput({
      ok: true,
      message: "Transferencias recalculadas correctamente"
    });
  } catch (err) {
    return jsonOutput({
      ok: false,
      error: String(err && err.message ? err.message : err)
    });
  }
}
function jsonOutput(obj) {
  return ContentService
    .createTextOutput(JSON.stringify(obj))
    .setMimeType(ContentService.MimeType.JSON);
}
function listRemitosFull_(body) {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const sheet = ss.getSheetByName("REMITOS");

  if (!sheet) {
    return {
      ok: false,
      error: "No existe la hoja REMITOS"
    };
  }

  const values = sheet.getDataRange().getValues();

  if (!values || values.length < 2) {
    return {
      ok: true,
      data: []
    };
  }

  const headers = values[0].map(h => String(h || "").trim());

  const data = values.slice(1)
    .filter(row => row.some(cell => cell !== "" && cell !== null))
    .map(row => {
      const obj = {};

      headers.forEach((header, index) => {
        if (!header) return;

        let value = row[index];

        if (value instanceof Date) {
          value = value.toISOString();
        }

        obj[header] = value;
      });

      return obj;
    });

  return {
    ok: true,
    data: data
  };
}