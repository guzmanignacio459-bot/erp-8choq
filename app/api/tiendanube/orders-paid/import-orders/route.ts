// app/api/tiendanube/orders-paid/import-orders/route.ts
// ✅ Full file (fix TS compile, read shipping method + costs, allocate discount/shipping per item => neto por prenda)
export const runtime = "nodejs";
export const maxDuration = 300; // 5 min
export const dynamic = "force-dynamic";
export const revalidate = 0;

const BUILD_MARK = "IMPORT_ORDERS__LIVE_CHECK__2026_01_22__Z9";

// =========================
// ===== Env (runtime) =====
// =========================
const TIENDANUBE_API_URL = (process.env.TIENDANUBE_API_URL ?? "https://api.tiendanube.com/v1").trim();
const TIENDANUBE_STORE_ID = (process.env.TIENDANUBE_STORE_ID ?? "").trim();
const TIENDANUBE_ACCESS_TOKEN = (process.env.TIENDANUBE_ACCESS_TOKEN ?? "").trim();
const TIENDANUBE_USER_AGENT = (process.env.TIENDANUBE_USER_AGENT ?? "8Q ERP Importer").trim();

const APPS_SCRIPT_URL = (process.env.APPS_SCRIPT_URL ?? "").trim();
const APPS_SCRIPT_TOKEN = (process.env.APPS_SCRIPT_TOKEN ?? "").trim();
// ===== MP Env (para aplicar MP en el mismo import) =====
const MP_ACCESS_TOKEN = (process.env.MP_ACCESS_TOKEN ?? "").trim();

const VALID_SIZES = new Set(["S", "M", "L", "XL", "XXL", "XXXL"] as const);


type ImportBody = {
  fromISO: string;
  toISO: string;

  dryRun?: boolean;
  fetchDetails?: boolean;
  perPage?: number;
  throttleMs?: number;
  maxPages?: number;

  orderId?: string | number;
  singleOrderId?: string | number;

  debugRaw?: boolean;
  includeOrderJson?: boolean;

  // ✅ MP (para vincular MP en el mismo import)
  importMp?: boolean;   // default: false
  mpForce?: boolean;    // default: false
};

type RemitoItemBase = {
  sku: string;
  articulo: string;
  talle: string;
  cantidad: 1;
  precioUnitario: number;
  owner: "" | "SCNL";
};

type RemitoItemAllocated = RemitoItemBase & {
  // ✅ columnas esperadas en REMITO_ITEMS (ajustá nombres en GAS si difieren)
  descuentoAsignado: number; // >=0
  shippingAsignado: number; // >=0
  feeAsignado: number; // >=0
  netoUnitario: number; // precio - desc + ship + fee
};
function pickMpPaymentIdFromTnOrder(order: any): string {
  // Intentos comunes en TN (varía por gateway)
  const candidates = [
    order?.payments?.[0]?.payment_id,
    order?.payments?.[0]?.id,
    order?.payment_details?.payment_id,
    order?.payment_details?.mp_payment_id,
    order?.payment_details?.id,
    order?.payment_details?.transaction_id,
  ];

  for (const c of candidates) {
    const s = String(c ?? "").trim();
    if (s && s !== "null" && s !== "undefined") return s;
  }
  return "";
}

function normalizeOptionalId(v: unknown): string {
  if (v === null || v === undefined) return "";
  const s = String(v).trim();
  if (!s || s === "null" || s === "undefined") return "";
  return s;
}

function firstNonEmpty(...vals: unknown[]) {
  for (const v of vals) {
    if (v === null || v === undefined) continue;
    const s = String(v).trim();
    if (s !== "" && s !== "null" && s !== "undefined") return s;
  }
  return "";
}

function parseMoneyToNumber(v: unknown): number {
  if (typeof v === "number" && Number.isFinite(v)) return v;
  const s = String(v ?? "").trim();
  if (!s) return 0;

  const clean = s.replace(/[^\d.,-]/g, "");

  if (clean.includes(",") && clean.includes(".")) {
    const normalized = clean.replace(/\./g, "").replace(",", ".");
    const n = Number(normalized);
    return Number.isFinite(n) ? n : 0;
  }

  if (clean.includes(",") && !clean.includes(".")) {
    const n = Number(clean.replace(",", "."));
    return Number.isFinite(n) ? n : 0;
  }

  const n = Number(clean);
  return Number.isFinite(n) ? n : 0;
}

function parseSkuOwnerSize(skuRaw: unknown): { sku: string; owner: "" | "SCNL"; size: string | null } {
  const sku = String(skuRaw ?? "").trim().toUpperCase();
  if (!sku) return { sku: "", owner: "", size: null };

  const parts = sku.split("-").filter(Boolean);

  let owner: "" | "SCNL" = "";
  if (parts.length && parts[parts.length - 1].toUpperCase() === "SCNL") {
    owner = "SCNL";
    parts.pop();
  }

  const last = parts.length ? parts[parts.length - 1].toUpperCase() : "";
  const size = VALID_SIZES.has(last as any) ? last : null;

  return { sku, owner, size };
}

function pickOrderDateISO(order: any): string {
  // 1️⃣ pago confirmado (mejor dato)
  if (order?.paid_at) return new Date(order.paid_at).toISOString();

  // 2️⃣ completed_at con date + hora
  if (order?.completed_at?.date) {
    return new Date(order.completed_at.date).toISOString();
  }

  // 3️⃣ created_at (fallback con hora)
  if (order?.created_at) return new Date(order.created_at).toISOString();

  // 4️⃣ último fallback (ahora)
  return new Date().toISOString();
}

function isPaid(order: any): boolean {
  const ps = String(order?.payment_status ?? "").toLowerCase();
  const st = String(order?.status ?? "").toLowerCase();
  if (ps === "paid" || ps === "pagado") return true;
  if (st === "paid" || st === "pagado") return true;
  if (order?.paid_at) return true;
  return false;
}

function inRange(iso: string, fromISO: string, toISO: string): boolean {
  const t = new Date(iso).getTime();
  const a = new Date(fromISO).getTime();
  const b = new Date(toISO).getTime();
  if (!Number.isFinite(t) || !Number.isFinite(a) || !Number.isFinite(b)) return false;
  return t >= a && t <= b;
}

function getShippingName(order: any) {
  const raw = String(
    firstNonEmpty(
      // ✅ Andreani / carrier primero
      order?.shipping_carrier_name,
      order?.shipping_carrier,

      // ✅ TN: a veces es string (como tu caso) y a veces objeto
      order?.shipping_option,            // <-- ESTE ES EL FIX CLAVE (string)
      order?.shipping_option?.name,
      order?.shipping_option?.title,

      // ✅ otros campos comunes
      order?.shipping_method_name,
      order?.shipping_method,
      order?.shipping_lines?.[0]?.name,
      order?.shipping_lines?.[0]?.title,
      order?.shipping?.name,
      order?.shipping,                   // en tu caso es "table"
      order?.shipping_option_code         // ej: "table_5861070"
    ) ?? ""
  ).trim();

  const low = raw.toLowerCase();

  // ✅ Retiro / pickup
  if (
    low.includes("retiro") ||
    low.includes("pickup") ||
    low.includes("pick up") ||
    low.includes("tienda") ||
    low.includes("local") ||
    low.includes("8q") ||
    low.includes("8choq")
  ) return "RETIRO EN 8Q";

  // ✅ Gran Mendoza (opcional estandarizar)
  if (low.includes("gran mendoza")) return "ENVÍO GRAN MENDOZA";

  return raw || "Sin dato";
}


function getMetodoPagoVal(order: any): string {
  // 1) intenta encontrar cuotas
  const installments =
    Number(order?.payment_details?.installments ?? order?.installments ?? order?.payments?.[0]?.installments ?? 0) || 0;

  // 2) intenta detectar “tipo” (crédito/débito/transfer)
  const raw =
    String(
      order?.payment_details?.method ||
      order?.payment_details?.payment_method ||
      order?.payment_details?.payment_type ||
      order?.payment_method ||
      order?.gateway ||
      order?.payment_gateway ||
      order?.payments?.[0]?.gateway ||
      order?.payments?.[0]?.payment_method ||
      order?.payment_details?.name ||
      order?.payment_method_name ||
      order?.payment_method_id ||
      ""
    ).toLowerCase().trim();

  // 3) normalización transferencia / custom
  if (raw.includes("transfer") || raw.includes("bank") || raw.includes("cbu") || raw.includes("alias")) {
    return "TRANSFERENCIA";
  }
  if (raw === "custom") {
    // muchas tiendas usan custom para transferencia/efectivo: si querés, acá podés afinar
    return "CUSTOM";
  }

  // 4) mercado pago / tiendanube payments / tarjeta
  const isMP = raw.includes("mercado") || raw.includes("mp");
  const isCard = raw.includes("card") || raw.includes("tarjeta") || raw.includes("credit") || raw.includes("debit");

  const isDebit = raw.includes("debit") || raw.includes("debito");
  const isCredit = raw.includes("credit") || raw.includes("credito");

  if (isMP) {
    if (isDebit) return "MP - DÉBITO";
    if (isCredit) return installments > 1 ? `MP - CRÉDITO ${installments} CUOTAS` : "MP - CRÉDITO 1 CUOTA";
    // fallback MP
    return installments > 1 ? `MP - ${installments} CUOTAS` : "MP";
  }

  if (raw.includes("tiendanube") || raw.includes("nube")) {
    if (isDebit) return "TIENDANUBE PAYMENTS - DÉBITO";
    if (isCredit) return installments > 1 ? `TIENDANUBE PAYMENTS - CRÉDITO ${installments} CUOTAS` : "TIENDANUBE PAYMENTS - CRÉDITO 1 CUOTA";
    return "TIENDANUBE PAYMENTS";
  }

  if (isCard) {
    if (isDebit) return "TARJETA - DÉBITO";
    if (isCredit) return installments > 1 ? `TARJETA - CRÉDITO ${installments} CUOTAS` : "TARJETA - CRÉDITO 1 CUOTA";
    return installments > 1 ? `TARJETA - ${installments} CUOTAS` : "TARJETA";
  }

  // 5) último fallback: algo legible
  return raw ? raw.toUpperCase() : "";
}


// ✅ Shipping cobrado al cliente (0 si gratis). Prioriza shipping_cost_customer.
function getShippingPaid(order: any): number {
  const customer = parseMoneyToNumber(order?.shipping_cost_customer);
  if (customer > 0) return customer;

  
// Si el cliente pagó 0 y el owner pagó >0 => existe envío pero lo absorbe 8Q, al cliente se le cobra 0
  const owner = parseMoneyToNumber(order?.shipping_cost_owner);
  if (owner > 0) return 0;

  // Fallbacks clásicos (por compat con otros formatos TN)
  const raw = firstNonEmpty(
    order?.shipping_cost_customer,
    order?.shipping_cost,
    order?.shipping_total,
    order?.shipping_option?.cost,
    order?.shipping_option?.price,
    order?.shipping_lines?.[0]?.price,
    order?.shipping_lines?.[0]?.cost,
    order?.shipping?.cost,
    order?.shipping?.price
  );

  return parseMoneyToNumber(raw);
}

// ✅ Costo real del envío absorbido por la marca (owner)
function getShippingOwnerCost(order: any): number {
  return parseMoneyToNumber(order?.shipping_cost_owner);
}



function getPaymentMethod(order: any) {
  return firstNonEmpty(
    order?.payment_details?.payment_method_name,
    order?.payment_details?.provider_name,
    order?.payment_details?.method,
    order?.payment_gateway_names?.[0],
    order?.gateway,
    order?.payment_method_name,
    order?.payment_method
  );
}

function sleep(ms: number) {
  return new Promise((r) => setTimeout(r, ms));
}

function expandOrderItemsToUnitRows(order: any): { items: RemitoItemBase[]; errors: string[] } {
  const errors: string[] = [];
  const out: RemitoItemBase[] = [];

  const products: any[] = Array.isArray(order?.products) ? order.products : [];
  if (!products.length) {
    errors.push(`order_id=${order?.id ?? "?"}: sin products`);
    return { items: [], errors };
  }

  for (const p of products) {
    const skuRaw = p?.sku ?? p?.variant_sku ?? p?.product_sku ?? "";
    const { sku, owner, size } = parseSkuOwnerSize(skuRaw);

    if (!sku) {
      errors.push(`order_id=${order?.id ?? "?"}: item sin sku (name=${String(p?.name ?? "")})`);
      continue;
    }

    if (!size) {
      errors.push(`order_id=${order?.id ?? "?"}: SKU sin talle válido (sku=${sku})`);
      continue;
    }

    const articulo = String(p?.name ?? p?.product_name ?? p?.title ?? "").trim() || sku;

    const qty = Number(p?.quantity ?? 0);
    if (!Number.isFinite(qty) || qty <= 0) {
      errors.push(`order_id=${order?.id ?? "?"}: quantity inválida (sku=${sku}, qty=${String(p?.quantity)})`);
      continue;
    }

    const priceRaw = p?.price ?? p?.unit_price ?? p?.variant_price ?? p?.product_price ?? 0;
    const precioUnitario = parseMoneyToNumber(priceRaw);

    for (let i = 0; i < qty; i++) {
      out.push({
        sku,
        articulo,
        talle: size,
        cantidad: 1,
        precioUnitario,
        owner,
      });
    }
  }

  return { items: out, errors };
}
function round2(n: number): number {
  return Math.round((Number(n) + Number.EPSILON) * 100) / 100;
}

function assignProportionalNetos(params: {
  items: RemitoItemBase[];
  descuentoTotalAbs: number;  // + (positivo)
  shippingPaid: number;       // + (cliente, puede ser 0)
  feeTotal: number;           // + (por ahora 0)
}): RemitoItemAllocated[] {
  const { items, descuentoTotalAbs, shippingPaid, feeTotal } = params;

  const baseSum = items.reduce((acc, it) => acc + (Number(it.precioUnitario) || 0), 0);

  if (!items.length || baseSum <= 0) {
    return items.map((it) => ({
      ...it,
      descuentoAsignado: 0,
      shippingAsignado: 0,
      feeAsignado: 0,
      netoUnitario: round2(Number(it.precioUnitario) || 0),
    }));
  }

  // prorrateo con ajuste en la última fila para cerrar exacto
  let discAcc = 0;
  let shipAcc = 0;
  let feeAcc = 0;

  return items.map((it, idx) => {
    const price = Number(it.precioUnitario) || 0;
    const share = price / baseSum;

    let disc = round2(descuentoTotalAbs * share);
    let ship = round2(shippingPaid * share);
    let fee  = round2(feeTotal * share);

    if (idx === items.length - 1) {
      disc = round2(descuentoTotalAbs - discAcc);
      ship = round2(shippingPaid - shipAcc);
      fee  = round2(feeTotal - feeAcc);
    } else {
      discAcc += disc;
      shipAcc += ship;
      feeAcc  += fee;
    }

    const neto = round2(price - disc + ship + fee);

    return {
      ...it,
      descuentoAsignado: disc,   // positivo (lo restás en neto)
      shippingAsignado: ship,    // positivo
      feeAsignado: fee,          // positivo
      netoUnitario: neto,
    };
  });
}

/**
 * ✅ Asigna proporcionalmente (sin “prenda regalada”):
 * - descuentoAsignado: parte del descuento global
 * - shippingAsignado: parte del envío cobrado al cliente
 * - feeAsignado: parte de fees (por ahora 0)
 * - netoUnitario: precio - descuento + shipping + fee
 *
 * Ajusta en el último ítem para que cierre exacto.
 */
function allocateProportional(
  items: RemitoItemBase[],
  totalDiscountAbs: number, // positivo
  shippingPaid: number, // >=0
  feeTotal: number // >=0
): RemitoItemAllocated[] {
  const base = items.map((it) => Math.max(0, Number(it.precioUnitario) || 0));
  const sumBase = base.reduce((a, b) => a + b, 0);

  if (sumBase <= 0) {
    return items.map((it) => {
      const precio = Number(it.precioUnitario) || 0;
      return {
        ...it,
        descuentoAsignado: 0,
        shippingAsignado: 0,
        feeAsignado: 0,
        netoUnitario: round2(precio),
      };
    });
  }

  let accDisc = 0;
  let accShip = 0;
  let accFee = 0;

  return items.map((it, idx) => {
    const precio = Math.max(0, Number(it.precioUnitario) || 0);
    const w = precio / sumBase;

    let disc = round2(totalDiscountAbs * w);
    let ship = round2(shippingPaid * w);
    let fee = round2(feeTotal * w);

    if (idx === items.length - 1) {
      disc = round2(totalDiscountAbs - accDisc);
      ship = round2(shippingPaid - accShip);
      fee = round2(feeTotal - accFee);
    } else {
      accDisc += disc;
      accShip += ship;
      accFee += fee;
    }

    const netoUnitario = round2(precio - disc + ship + fee);

    return {
      ...it,
      descuentoAsignado: disc,
      shippingAsignado: ship,
      feeAsignado: fee,
      netoUnitario,
    };
  });
}

// =========================
// === Payload builder =====
// =========================
//
// Requiere que existan (en el mismo archivo):
// - parseMoneyToNumber
// - round2
// - pickOrderDateISO
// - getShippingPaid
// - getShippingOwnerCost
// - getShippingName
// - getPaymentMethod
// - expandOrderItemsToUnitRows
// - allocateProportional(rawItems, descuentoTotalAbs, shippingPaid, feeTotal)
// - type RemitoItemAllocated
//
function buildRemitoPayload(order: any): { data: any; itemErrors: string[] } {
  const fechaISO = pickOrderDateISO(order);

  const firstName = String(order?.customer?.firstname ?? order?.customer?.first_name ?? "").trim();
  const lastName  = String(order?.customer?.lastname ?? order?.customer?.last_name ?? "").trim();
  const nombre =
    [firstName, lastName].filter(Boolean).join(" ").trim() ||
    String(order?.customer?.name ?? order?.billing_address?.name ?? "").trim();

  const email    = String(order?.customer?.email ?? order?.email ?? "").trim();
  const telefono = String(order?.customer?.phone ?? order?.phone ?? order?.shipping_address?.phone ?? "").trim();

  const provincia = String(order?.shipping_address?.province ?? order?.shipping_address?.state ?? "").trim();
  const localidad = String(order?.shipping_address?.city ?? order?.shipping_address?.locality ?? "").trim();

  const dni = String(
    order?.customer?.identification ??
      order?.billing_address?.dni ??
      order?.billing_address?.identification ??
      ""
  ).trim();

  // === Totales base ===
  const subtotalBruto = parseMoneyToNumber(order?.subtotal ?? order?.subtotal_price ?? order?.total_products ?? 0);
  const totalFinal    = parseMoneyToNumber(order?.total ?? order?.total_price ?? order?.total_paid ?? 0);

  // descuento global ABS (positivo)
  const descuentoTotalAbs = Math.max(
    0,
    parseMoneyToNumber(order?.discount ?? order?.discount_total ?? order?.total_discounts ?? 0)
  );

  // shipping: cliente vs owner
  const shippingPaid      = getShippingPaid(order);        // cliente (0 si gratis)
  const shippingOwnerCost = getShippingOwnerCost(order);   // lo que paga 8Q si aplica
  const costoEnvioOwner   = shippingPaid > 0 ? 0 : (shippingOwnerCost > 0 ? shippingOwnerCost : 0);

  const feeTotal = 0;

  // REMITOS: negativo si descuento
  const recargoDescuento = round2(-descuentoTotalAbs);

  const shippingName  = getShippingName(order) || "Sin dato";

  const paymentMethod = getPaymentMethodDetailed(order) || "Sin dato";


  const detalleGeneral = `TN_ORDER_ID=${String(order?.id ?? "").trim()}`;

  const { items: rawItems, errors } = expandOrderItemsToUnitRows(order);

  // ✅ prorrateo por prenda (1 prenda = 1 fila)
  const items: RemitoItemAllocated[] = assignProportionalNetos({
    items: rawItems,
    descuentoTotalAbs,
    shippingPaid,
    feeTotal,
  });

  const envioOwner: "CLIENTE" | "8Q" | "SIN_DATO" =
    shippingPaid > 0 ? "CLIENTE" : (costoEnvioOwner > 0 ? "8Q" : "SIN_DATO");

  const data = {
    fechaISO,
    nombre,
    dni,
    localidad,
    provincia,
    email,
    telefono,

    // ✅ REMITOS
    subtotal: subtotalBruto,
    shipping: shippingPaid,     // costo envío cobrado al cliente
    totalFinal,
    recargoDescuento,           // negativo si descuento

    // ✅ envío absorbido por marca
    costoEnvioOwner,
    envioOwner,
    shippingOwnerCost,

    // ✅ totales.* (si GAS lo usa, mejor)
    totales: {
      subtotal: subtotalBruto,
      costoEnvio: shippingPaid,
      costoEnvioOwner,
      feeTotal,
      totalFinal,
      descuentoTotalAbs,
      recargoDescuento,
    },

    detalleGeneral,

    // ✅ REMITO_ITEMS
    items,

    vendedor: "Tiendanube",
    transporte: shippingName,   // método/envío
    metodoPago: paymentMethod,
    condicionCompra: "Minorista",
    estado: "Pagado",
  };

  return { data, itemErrors: errors };
}
function getPaymentMethodDetailed(order: any): string {
  const installments =
    Number(
      order?.payment_details?.installments ??
      order?.installments ??
      order?.payments?.[0]?.installments ??
      order?.payment_details?.installment_count ??
      0
    ) || 0;

  // juntamos texto de varias fuentes para detectar bien débito/billetera
  const rawParts = [
    order?.payment_details?.method,
    order?.payment_details?.payment_method,
    order?.payment_details?.payment_type,
    order?.payment_method,
    order?.gateway,
    order?.payment_gateway,
    order?.payments?.[0]?.gateway,
    order?.payments?.[0]?.payment_method,
    order?.payment_details?.name,
    order?.payment_method_name,
    order?.payment_method_id,
    order?.payment_details?.description,
  ]
    .map(v => String(v ?? "").trim())
    .filter(Boolean);

  const raw = rawParts.join(" | ").toLowerCase();

  // helpers
  const has = (s: string) => raw.includes(s);
  

  // --- Transferencia (ya lo arreglaste) ---
  // --- Transferencia / pago personalizado ---
if (
  has("transfer") ||
  has("transferencia") ||
  has("bank") ||
  has("cbu") ||
  has("alias") ||
  has("pago personalizado") ||
  has("pago_personalizado") ||
  has("personalizado") ||
  has("custom")
) {
  return "TRANSFERENCIA";
}

  // --- Mercado Pago (MP) ---
  const isMP = has("mercado") || has("mp");

  // Detectar billetera virtual / saldo
  const isWallet =
    has("billetera") ||
    has("wallet") ||
    has("dinero en cuenta") ||
    has("saldo") ||
    has("account_money") ||
    has("money");

  // Detectar débito (muchas variantes)
  const isDebit =
    has("debit") ||
    has("debito") ||
    has("débito") ||
    has("tarjeta de debito") ||
    has("tarjeta débito") ||
    has("debit_card");

  // Detectar crédito (muchas variantes)
  const isCredit =
    has("credit") ||
    has("credito") ||
    has("crédito") ||
    has("credit_card");

  if (isMP) {
    if (isWallet) return "MP - BILLETERA VIRTUAL";
    if (isDebit) return "MP - DÉBITO";
    if (isCredit) return installments > 1 ? `MP - CRÉDITO ${installments} CUOTAS` : "MP - CRÉDITO 1 CUOTA";
    return installments > 1 ? `MP - ${installments} CUOTAS` : "MP";
  }

  // --- Tarjeta genérica (no MP) ---
  if (isWallet) return "BILLETERA VIRTUAL";

  if (isDebit) return "TARJETA - DÉBITO";
  if (isCredit) return installments > 1 ? `TARJETA - CRÉDITO ${installments} CUOTAS` : "TARJETA - CRÉDITO 1 CUOTA";

  // fallback: si es tarjeta pero no detectamos tipo
  if (has("card") || has("tarjeta")) {
    return installments > 1 ? `TARJETA - ${installments} CUOTAS` : "TARJETA - 1 CUOTA";
  }

  return rawParts[0] ? rawParts[0].toUpperCase() : "";
}


// =========================
// ===== Auth helpers =======
// =========================
function getExpectedTokenWithSource(): { expected: string; source: string } {
  const candidates: Array<{ key: string; val: string }> = [
    { key: "TIENDANUBE_IMPORT_TOKEN", val: (process.env.TIENDANUBE_IMPORT_TOKEN ?? "").trim() },
    { key: "IMPORT_ORDERS_TOKEN", val: (process.env.IMPORT_ORDERS_TOKEN ?? "").trim() },
    { key: "IMPORT_TOKEN", val: (process.env.IMPORT_TOKEN ?? "").trim() },
  ];

  for (const c of candidates) {
    if (c.val) return { expected: c.val, source: c.key };
  }
  return { expected: "", source: "" };
}

// =========================
// ===== TN fetch ===========
async function tnFetch(
  path: string,
  timeoutMs = 12000
): Promise<{ ok: boolean; status: number; text: string; json: any; url: string }> {
  const url = `${TIENDANUBE_API_URL}/${encodeURIComponent(TIENDANUBE_STORE_ID)}${path}`;

  const controller = new AbortController();
  const t = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const res = await fetch(url, {
      method: "GET",
      headers: {
        Authentication: `bearer ${TIENDANUBE_ACCESS_TOKEN}`,
        "User-Agent": TIENDANUBE_USER_AGENT,
        Accept: "application/json",
      },
      cache: "no-store",
      signal: controller.signal,
    });

    const text = await res.text();
    let json: any = null;
    try {
      json = text ? JSON.parse(text) : null;
    } catch {
      json = null;
    }

    return { ok: res.ok, status: res.status, text, json, url };
  } catch (e: any) {
    const msg = e?.name === "AbortError" ? `Fetch timeout after ${timeoutMs}ms` : String(e?.message ?? e);
    return { ok: false, status: 599, text: msg, json: null, url };
  } finally {
    clearTimeout(t);
  }
}

async function tnFetchOrderDetail(orderId: string | number) {
  return tnFetch(`/orders/${encodeURIComponent(String(orderId))}`);
}
async function withRetry<T>(fn: () => Promise<T>, opts?: { retries?: number; baseMs?: number }) {
  const retries = opts?.retries ?? 2;
  const baseMs = opts?.baseMs ?? 500;

  let lastErr: any;
  for (let i = 0; i <= retries; i++) {
    try {
      return await fn();
    } catch (err) {
      lastErr = err;
      if (i === retries) break;
      const wait = baseMs * Math.pow(2, i);
      await new Promise((r) => setTimeout(r, wait));
    }
  }
  throw lastErr;
}
// =========================
// ===== MP helpers =========
// =========================

function inferMpPaymentIdFromOrder(order: any): number | null {
  // Campos comunes donde TN a veces guarda IDs del gateway/MP
  const candidates: any[] = [
    order?.payment_details?.transaction_id,
    order?.payment_details?.payment_id,
    order?.payment_details?.id,
    order?.payments?.[0]?.transaction_id,
    order?.payments?.[0]?.id,
    order?.payments?.[0]?.payment_id,
    order?.gateway_payment_id,
    order?.payment_id,
  ];

  for (const c of candidates) {
    const s = String(c ?? "").trim();
    if (/^\d+$/.test(s)) return Number(s);
  }

  // Fallback: buscar un número largo probable dentro de metadata
  const haystack = JSON.stringify({
    payment_details: order?.payment_details,
    payments0: Array.isArray(order?.payments) ? order.payments?.[0] : undefined,
    gateway: order?.gateway,
    payment_gateway_names: order?.payment_gateway_names,
  });

  // patrones típicos: "payment_id":123456789 / "transaction_id":123...
  const m =
    haystack.match(/"payment_id"\s*:\s*"(\d{6,})"/i) ||
    haystack.match(/"payment_id"\s*:\s*(\d{6,})/i) ||
    haystack.match(/"transaction_id"\s*:\s*"(\d{6,})"/i) ||
    haystack.match(/"transaction_id"\s*:\s*(\d{6,})/i);

  const id = m?.[1];
  if (id && /^\d+$/.test(id)) return Number(id);

  return null;
}

async function fetchMpPaymentById(paymentId: number) {
  if (!MP_ACCESS_TOKEN) {
    return { ok: false as const, status: 500, data: { error: "MP_ACCESS_TOKEN missing" } };
  }

  const url = `https://api.mercadopago.com/v1/payments/${paymentId}`;
  const res = await fetch(url, {
    method: "GET",
    headers: {
      Authorization: `Bearer ${MP_ACCESS_TOKEN}`,
      "Content-Type": "application/json",
    },
    cache: "no-store",
  });

  const data = await res.json().catch(() => null);
  return { ok: res.ok, status: res.status, data };
}

function normalizeMpForGas(mpRaw: any, fallbackPaymentId: number) {
  const paymentId = String(mpRaw?.id ?? mpRaw?.paymentId ?? fallbackPaymentId ?? "").trim();

  const transactionAmount = Number(mpRaw?.transaction_amount ?? 0);
  const netReceivedAmount = Number(mpRaw?.transaction_details?.net_received_amount ?? 0);

  const taxTotal = Number(mpRaw?.taxes_amount ?? 0);

  const feeDetails = Array.isArray(mpRaw?.fee_details) ? mpRaw.fee_details : [];
  const sumByType = (type: string) =>
    feeDetails
      .filter((f: any) => String(f?.type ?? "") === type)
      .reduce((acc: number, f: any) => acc + Number(f?.amount ?? 0), 0);

  const feeTotal = sumByType("mercadopago_fee");
  const financingTotal = sumByType("financing_fee");
  const platformFeeTotal = sumByType("application_fee");

  const feesSum = feeDetails.reduce((acc: number, f: any) => acc + Number(f?.amount ?? 0), 0);
  const totalCost = taxTotal + feesSum;

  const status = String(mpRaw?.status ?? "").trim();
  const statusDetail = String(mpRaw?.status_detail ?? "").trim();

  const payerEmail = String(mpRaw?.payer?.email ?? "").trim();
  const paymentType = String(mpRaw?.payment_type_id ?? "").trim();
  const paymentMethod = String(mpRaw?.payment_method_id ?? "").trim();
  const installments = Number(mpRaw?.installments ?? 0);

  const additionalReference =
    mpRaw?.external_reference ??
    mpRaw?.additional_info?.external_reference ??
    "";

  return {
    paymentId,
    additionalReference,

    status,
    statusDetail,

    dateCreated: mpRaw?.date_created ?? "",
    dateApproved: mpRaw?.date_approved ?? "",
    moneyReleaseDate: mpRaw?.money_release_date ?? "",

    // ✅ Nombres alineados a tu GAS (mp.transactionAmount, mp.netReceivedAmount, etc.)
    transactionAmount,
    netReceivedAmount,
    taxTotal,
    financingTotal,
    feeTotal,
    platformFeeTotal,
    totalCost,

    // ✅ compat “Real”
    taxTotalReal: taxTotal,
    financingTotalReal: financingTotal,
    feeTotalReal: feeTotal,
    platformFeeTotalReal: platformFeeTotal,
    totalCostReal: totalCost,

    payerEmail,
    paymentType,
    paymentMethod,
    installments,

    raw: mpRaw,
  };
}

async function callAppsScriptApplyMp(tnOrderId: string | number, mpForGas: any, force: boolean) {
  if (!APPS_SCRIPT_URL) throw new Error("APPS_SCRIPT_URL faltante");

  const body = {
    action: "applyMpPaymentManual",
    token: APPS_SCRIPT_TOKEN || undefined,
    tnOrderId: String(tnOrderId),
    mp: mpForGas,
    force: !!force,
  };

  const res = await fetch(APPS_SCRIPT_URL, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
    cache: "no-store",
  });

  const text = await res.text();
  let json: any = null;
  try {
    json = text ? JSON.parse(text) : null;
  } catch {
    json = null;
  }

  if (!res.ok || !json?.ok) {
    throw new Error(`AppsScript applyMp error: http=${res.status} body=${text}`);
  }

  return json;
}
async function callAppsScriptApplyMpPayment(params: {
  tnOrderId: string | number;
  mp: any;
  force?: boolean;
}): Promise<any> {
  if (!APPS_SCRIPT_URL) throw new Error("APPS_SCRIPT_URL faltante");

  // ✅ Tu GAS enruta por `method`
  const body = {
    method: "applyMpPaymentManualPost",
    tnOrderId: String(params.tnOrderId),
    mp: params.mp ?? {},
    force: params.force === true,
  };

  const res = await fetch(APPS_SCRIPT_URL, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
    cache: "no-store",
  });

  const text = await res.text();
  let json: any = null;
  try {
    json = text ? JSON.parse(text) : null;
  } catch {
    json = { ok: false, error: "Invalid JSON from Apps Script", raw: text };
  }

  if (!res.ok || !json?.ok) {
    throw new Error(`AppsScript MP error: http=${res.status} body=${text}`);
  }

  return json;
}

// =========================
// ===== GAS call ===========

async function callAppsScriptSaveRemito(data: any): Promise<any> {
  if (!APPS_SCRIPT_URL) throw new Error("APPS_SCRIPT_URL faltante");

  const body = {
    action: "saveRemito",
    token: APPS_SCRIPT_TOKEN || undefined,
    data,
  };

  const doFetch = async () => {
    const ctrl = new AbortController();
    const t = setTimeout(() => ctrl.abort(), 45_000); // 45s timeout duro

    try {
      const res = await fetch(APPS_SCRIPT_URL, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
        cache: "no-store",
        signal: ctrl.signal,
      });

      const text = await res.text();

      let json: any = null;
      try {
        json = text ? JSON.parse(text) : null;
      } catch {
        json = null;
      }

      if (!res.ok) {
        const err: any = new Error(`AppsScript_http_${res.status}`);
        err.httpStatus = res.status;
        err.raw = text;
        err.parsed = json;
        throw err;
      }

      if (!json) {
        const err: any = new Error("AppsScript_invalid_json");
        err.httpStatus = res.status;
        err.raw = text;
        throw err;
      }

      if (!json.ok) {
        const err: any = new Error("AppsScript_ok_false");
        err.httpStatus = res.status;
        err.parsed = json;
        err.raw = text;
        throw err;
      }

      return json;
    } finally {
      clearTimeout(t);
    }
  };

  const retryable = (e: any) => {
    const s = Number(e?.httpStatus);
    return e?.name === "AbortError" || s === 429 || s === 500 || s === 502 || s === 503 || s === 504;
  };

  let lastErr: any;
  for (let i = 0; i < 3; i++) {
    try {
      return await doFetch();
    } catch (e: any) {
      lastErr = e;
      if (!retryable(e) || i === 2) break;
      await new Promise((r) => setTimeout(r, 600 * Math.pow(2, i))); // 600ms, 1200ms
    }
  }

  const msg = String(lastErr?.message ?? lastErr);
  throw new Error(
    `AppsScript_saveRemito_failed: ${msg} http=${lastErr?.httpStatus ?? "?"} ` +
      `parsed=${lastErr?.parsed ? JSON.stringify(lastErr.parsed) : "null"}`
  );
}

function withDebugHeaders(res: Response, expectedLen: number) {
  res.headers.set("x-build-mark", BUILD_MARK);
  res.headers.set("x-import-expected-len", String(expectedLen));
  return res;
}

/**
 * Llama al endpoint interno de MP usando URL RELATIVA al request actual (sin hardcode de dominio).
 * Mantiene headers/tokens como tu contrato productivo.
 */
async function callMercadoPagoImportEndpoint(
  req: Request,
  tnOrderId: string | number,
  force: boolean
): Promise<any> {
  // ✅ En Vercel, esto es la forma más confiable de armar el origin real
  const proto =
    (req.headers.get("x-forwarded-proto") ?? "https").split(",")[0].trim();

  const host =
    (req.headers.get("x-forwarded-host") ??
      req.headers.get("host") ??
      "").split(",")[0].trim();

  if (!host) throw new Error("MP import: host header missing");

  const url = `${proto}://${host}/api/mercadopago/import-payment`;

  const res = await fetch(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-mp-import-token": process.env.MP_IMPORT_TOKEN ?? "",
      "x-import-token": process.env.IMPORT_TOKEN ?? "",
    },
    body: JSON.stringify({
      tnOrderId: String(tnOrderId),
      force: force === true,
    }),
    cache: "no-store",
  });

  const text = await res.text();

  let json: any = null;
  try {
    json = text ? JSON.parse(text) : null;
  } catch {
    // si 405 vuelve a pasar, esto te deja evidencia real
    throw new Error(`MP import non-JSON: status=${res.status} body=${text}`);
  }

  if (!res.ok || !json?.ok) {
    throw new Error(`MP import failed: status=${res.status} body=${text}`);
  }

  return json;
}

// =========================
// ========= POST ===========

export async function POST(req: Request) {
  const { expected: EXPECTED, source: expectedSource } = getExpectedTokenWithSource();

  const incoming =
    (req.headers.get("x-import-token") ?? "").trim() ||
    (req.headers.get("x-import-orders-token") ?? "").trim() ||
    (() => {
      const auth = (req.headers.get("authorization") ?? "").trim();
      const m = auth.match(/^Bearer\s+(.+)$/i);
      return (m?.[1] ?? "").trim();
    })();

  if (!EXPECTED || incoming !== EXPECTED) {
    console.log("[AUTH] build=", BUILD_MARK);
    console.log("[AUTH] expected_source=", expectedSource || "(none)");
    console.log("[AUTH] incoming_len=", incoming.length, "incoming_last4=", incoming.slice(-4));
    console.log("[AUTH] expected_len=", EXPECTED.length, "expected_last4=", EXPECTED.slice(-4));

    const res = Response.json(
      {
        ok: false,
        step: "unauthorized",
        build: BUILD_MARK,
        debug: {
          expected_len: EXPECTED.length,
          expected_last4: EXPECTED.slice(-4),
          incoming_last4: incoming.slice(-4),
          expected_source: expectedSource || null,
        },
      },
      { status: 401 }
    );
    return withDebugHeaders(res, EXPECTED.length);
  }

  const missing: string[] = [];
  if (!TIENDANUBE_STORE_ID) missing.push("TIENDANUBE_STORE_ID");
  if (!TIENDANUBE_ACCESS_TOKEN) missing.push("TIENDANUBE_ACCESS_TOKEN");
  if (!APPS_SCRIPT_URL) missing.push("APPS_SCRIPT_URL");

  if (missing.length) {
    const res = Response.json(
      { ok: false, step: "missing_env", error: "Missing env vars", missing, build: BUILD_MARK },
      { status: 500 }
    );
    return withDebugHeaders(res, EXPECTED.length);
  }

  let body: ImportBody = {} as ImportBody;
  try {
    const contentType = req.headers.get("content-type") || "";
    if (contentType.includes("application/json")) {
      body = (await req.json()) as ImportBody;
    }
  } catch {
    const res = Response.json({ ok: false, step: "bad_json", error: "Body JSON inválido", build: BUILD_MARK }, { status: 400 });
    return withDebugHeaders(res, EXPECTED.length);
  }

  const url = new URL(req.url);
  const qp = url.searchParams;

  const qpSingleOrderId = normalizeOptionalId(qp.get("singleOrderId") || qp.get("orderId") || "");
  const bodySingleOrderId = normalizeOptionalId(body?.singleOrderId ?? body?.orderId ?? "");
  const singleOrderId = qpSingleOrderId || bodySingleOrderId;

  const idKeyWasProvided =
    qp.has("singleOrderId") || qp.has("orderId") || body.singleOrderId !== undefined || body.orderId !== undefined;

  if (idKeyWasProvided && !singleOrderId) {
    const res = Response.json(
      {
        ok: false,
        step: "bad_orderId",
        message: "orderId/singleOrderId llegó vacío o inválido",
        build: BUILD_MARK,
        received: {
          qpSingleOrderId: qp.get("singleOrderId"),
          qpOrderId: qp.get("orderId"),
          bodySingleOrderId: body.singleOrderId,
          bodyOrderId: body.orderId,
        },
      },
      { status: 400 }
    );
    return withDebugHeaders(res, EXPECTED.length);
  }

  const qpDryRun = qp.get("dryRun");
  const qpDebugRaw = qp.get("debugRaw");
  const qpIncludeOrderJson = qp.get("includeOrderJson");

  const dryRun = qpDryRun ? qpDryRun === "true" : !!body.dryRun;
  const debugRaw = qpDebugRaw ? qpDebugRaw === "true" : !!body.debugRaw;
  const includeOrderJson = qpIncludeOrderJson ? qpIncludeOrderJson === "true" : !!body.includeOrderJson;

  const fromISO = String(body.fromISO ?? "").trim();
  const toISO = String(body.toISO ?? "").trim();
  if (!fromISO || !toISO) {
    const res = Response.json(
      { ok: false, step: "missing_range", error: "fromISO y toISO son requeridos", build: BUILD_MARK },
      { status: 400 }
    );
    return withDebugHeaders(res, EXPECTED.length);
  }

  const fetchDetails = !!body.fetchDetails;
  const perPage = Math.max(1, Math.min(200, Number(body.perPage ?? 50)));
  const throttleMs = Math.max(0, Number(body.throttleMs ?? 350));
  const maxPages = Math.max(1, Number(body.maxPages ?? 50));

  const qpImportMp = qp.get("importMp");
  const qpMpForce = qp.get("mpForce");

  const bodyImportMp = (body as any).importMp;
  const bodyMpForce = (body as any).mpForce;

  const importMp =
    qpImportMp != null ? qpImportMp === "true" : bodyImportMp === true || bodyImportMp === "true";

  const mpForce =
    qpMpForce != null ? qpMpForce === "true" : bodyMpForce === true || bodyMpForce === "true";

  console.log("[IMPORT_ORDERS] build=", BUILD_MARK, "singleOrderId=", singleOrderId || "(none)");

  const errors: Array<{ orderId?: string; step: string; message: string }> = [];
  let consideredPaid = 0;
  let consideredInRange = 0;
  let wouldImport = 0;
  let imported = 0;
  let duplicated = 0;
  const processedOrderIds: string[] = [];

  // ===== Single Order Mode =====
  if (singleOrderId) {
    try {
      const det = await tnFetchOrderDetail(singleOrderId);

      if (!det.ok) {
        const res = Response.json(
          {
            ok: false,
            step: "tn_order_detail",
            orderId: String(singleOrderId),
            status: det.status,
            tnUrl: det.url,
            body: det.text,
            build: BUILD_MARK,
          },
          { status: 200 }
        );
        return withDebugHeaders(res, EXPECTED.length);
      }

      const order = det.json;

      if (debugRaw) {
        const extract = {
          id: order?.id,
          status: order?.status,
          payment_status: order?.payment_status,
          paid_at: order?.paid_at,
          payment_date: order?.payment_date,
          payment_gateway_names: order?.payment_gateway_names,
          payment_details: order?.payment_details,
          payments_0: Array.isArray(order?.payments) ? order.payments?.[0] : undefined,

          shipping_carrier_name: order?.shipping_carrier_name,
          shipping_cost_customer: order?.shipping_cost_customer,
          shipping_cost_owner: order?.shipping_cost_owner,

          shipping_option: order?.shipping_option,
          shipping_lines: order?.shipping_lines,
          shipping_cost: order?.shipping_cost,
          shipping_total: order?.shipping_total,

          subtotal: order?.subtotal ?? order?.subtotal_price ?? order?.total_products,
          discount: order?.discount ?? order?.discount_total ?? order?.total_discounts,
          total: order?.total ?? order?.total_price ?? order?.total_paid,
        };
        console.log("[DEBUG TN ORDER] keys:", Object.keys(order || {}));
        console.log("[DEBUG TN ORDER] extract:", JSON.stringify(extract, null, 2));
      }

      const extracted = {
        paymentMethod: getPaymentMethod(order) || "Sin dato",
        shippingName: getShippingName(order) || "Sin dato",
        shippingPaid: getShippingPaid(order),
        shippingOwnerCost: getShippingOwnerCost(order),
      };

      const orderDateISO = pickOrderDateISO(order);

      if (!isPaid(order)) {
        const res = Response.json(
          {
            ok: true,
            build: BUILD_MARK,
            mode: "single_order",
            skipped: true,
            reason: "order_not_paid",
            orderId: String(order?.id ?? singleOrderId),
            orderDateISO,
            extracted,
            ...(includeOrderJson ? { order } : {}),
          },
          { status: 200 }
        );
        return withDebugHeaders(res, EXPECTED.length);
      }
      consideredPaid++;

      if (!inRange(orderDateISO, fromISO, toISO)) {
        const res = Response.json(
          {
            ok: true,
            build: BUILD_MARK,
            mode: "single_order",
            skipped: true,
            reason: "order_out_of_range",
            orderId: String(order?.id ?? singleOrderId),
            orderDateISO,
            fromISO,
            toISO,
            extracted,
            ...(includeOrderJson ? { order } : {}),
          },
          { status: 200 }
        );
        return withDebugHeaders(res, EXPECTED.length);
      }
      consideredInRange++;

      const { data, itemErrors } = buildRemitoPayload(order);

      if (itemErrors?.length) {
        const res = Response.json(
          {
            ok: false,
            step: "build_items",
            orderId: String(order?.id ?? singleOrderId),
            message: itemErrors.join(" | "),
            build: BUILD_MARK,
            extracted,
            ...(includeOrderJson ? { order } : {}),
          },
          { status: 200 }
        );
        return withDebugHeaders(res, EXPECTED.length);
      }

      if (!data || !Array.isArray(data.items) || data.items.length === 0) {
        const res = Response.json(
          {
            ok: false,
            step: "build_payload",
            orderId: String(order?.id ?? singleOrderId),
            message: "Payload inválido o sin items",
            build: BUILD_MARK,
            extracted,
            ...(includeOrderJson ? { order } : {}),
          },
          { status: 200 }
        );
        return withDebugHeaders(res, EXPECTED.length);
      }

      wouldImport++;

      let gasRes: any = null;

      if (!dryRun) {
        // 1) Guardar remito (TU lógica actual, intacta)
        gasRes = await callAppsScriptSaveRemito(data);

        if (gasRes?.duplicated) duplicated++;
        else imported++;

        // 2) Mercado Pago (endpoint interno, único)
        if (importMp) {
          try {
            const tnOrderId = String(order?.id ?? "").trim();
            if (!tnOrderId) throw new Error("tnOrderId vacío en order.id");

            await callMercadoPagoImportEndpoint(req, tnOrderId, mpForce);
          } catch (e: any) {
            const msg = String(e?.message ?? e);
            console.error("[MP IMPORT ERROR]", "TN_ORDER_ID=", String(order?.id ?? ""), "error=", msg);

            errors.push({
              orderId: String(order?.id ?? ""),
              step: "mp_import",
              message: msg,
            });
          }
        }
      }

      processedOrderIds.push(String(order?.id ?? singleOrderId));

      const res = Response.json(
        {
          ok: true,
          build: BUILD_MARK,
          mode: "single_order",
          input: { singleOrderId: String(singleOrderId), fromISO, toISO, dryRun, debugRaw, includeOrderJson },
          extracted,
          mp: {
            enabled: importMp,
            force: mpForce,
          },
          metrics: {
            consideredPaid,
            consideredInRange,
            wouldImport,
            imported: dryRun ? 0 : imported,
            duplicated: dryRun ? 0 : duplicated,
            errors: errors.length,
          },
          processedOrderIds,
          result: dryRun ? undefined : gasRes,
          preview: dryRun ? data : undefined,
          ...(includeOrderJson ? { order } : {}),
          errors,
        },
        { status: 200 }
      );
      return withDebugHeaders(res, EXPECTED.length);
    } catch (e: any) {
      const res = Response.json(
        { ok: false, step: "single_order", orderId: String(singleOrderId), message: String(e?.message ?? e), build: BUILD_MARK },
        { status: 200 }
      );
      return withDebugHeaders(res, EXPECTED.length);
    }
  }

  // ===== Batch Mode =====
  let page = 1;

  while (page <= maxPages) {
    const list = await tnFetch(`/orders?page=${page}&per_page=${perPage}`);

    if (!list.ok && list.status === 404 && (list.text || "").includes("Last page is 0")) break;

    if (!list.ok) {
      errors.push({ step: "tn_list_orders", message: `status=${list.status} body=${list.text}` });
      break;
    }

    const orders: any[] = Array.isArray(list.json) ? list.json : [];
    if (!orders.length) break;

    for (const o0 of orders) {
      try {
        if (!isPaid(o0)) continue;
        consideredPaid++;

        const orderDateISO = pickOrderDateISO(o0);
        if (!inRange(orderDateISO, fromISO, toISO)) continue;
        consideredInRange++;

        let order = o0;

        if (fetchDetails) {
          const det = await tnFetchOrderDetail(o0?.id);
          if (!det.ok) {
            errors.push({ orderId: String(o0?.id ?? ""), step: "tn_order_detail", message: `status=${det.status} body=${det.text}` });
            continue;
          }
          order = det.json;
        }

        const { data, itemErrors } = buildRemitoPayload(order);

        if (itemErrors?.length) {
          errors.push({ orderId: String(order?.id ?? ""), step: "build_items", message: itemErrors.join(" | ") });
          continue;
        }

        if (!data || !Array.isArray(data.items) || data.items.length === 0) {
          errors.push({ orderId: String(order?.id ?? ""), step: "build_payload", message: "Payload inválido o sin items" });
          continue;
        }

        wouldImport++;

        let gasRes: any = null;

        if (!dryRun) {
          gasRes = await callAppsScriptSaveRemito(data);
          if (gasRes?.duplicated) duplicated++;
          else imported++;

          // ✅ MP import unificado (endpoint interno)
          if (importMp) {
            try {
              const tnOrderId = String(order?.id ?? "").trim();
              if (!tnOrderId) throw new Error("tnOrderId vacío en order.id");

              await callMercadoPagoImportEndpoint(req, tnOrderId, mpForce);
            } catch (e: any) {
              errors.push({
                orderId: String(order?.id ?? ""),
                step: "mp_import",
                message: String(e?.message ?? e),
              });
            }
          }
        }

        processedOrderIds.push(String(order?.id ?? ""));

        if (throttleMs) await sleep(throttleMs);
      } catch (e: any) {
        errors.push({
          orderId: String(o0?.id ?? ""),
          step: "process_order",
          message: String(e?.message ?? e),
        });
        continue;
      }
    }

    if (orders.length < perPage) break;

    page++;
    if (throttleMs) await sleep(throttleMs);
  }

  const res = Response.json(
    {
      ok: true,
      build: BUILD_MARK,
      mode: "batch",
      input: { fromISO, toISO, dryRun, fetchDetails, perPage, throttleMs, maxPages, importMp, mpForce },
      metrics: {
        consideredPaid,
        consideredInRange,
        wouldImport,
        imported: dryRun ? 0 : imported,
        duplicated: dryRun ? 0 : duplicated,
        errors: errors.length,
      },
      processedOrderIds: processedOrderIds.slice(0, 200),
      errors,
    },
    { status: 200 }
  );

  return withDebugHeaders(res, EXPECTED.length);
}