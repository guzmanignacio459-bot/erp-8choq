/**
 * Única implementación de las retenciones de charges_details.
 * La usa el normalizador de la conciliación y el espejo de scripts/lib.
 */

function centavos(value) {
  if (value == null || value === "") return null;
  const n = Number(value);
  if (!Number.isFinite(n)) return null;
  return Math.round(n * 100);
}

function pesos(centavosValor) {
  return centavosValor / 100;
}

function retencionesDeCharges(mp) {
  const charges = Array.isArray(mp?.charges_details) ? mp.charges_details : [];
  const retenciones = [];
  let totalCentavos = 0;

  for (const charge of charges) {
    if (String(charge?.type ?? "").trim().toLowerCase() !== "tax") continue;
    const original = centavos(charge?.amounts?.original);
    if (original == null) continue;
    const refunded = centavos(charge?.amounts?.refunded ?? 0);
    if (refunded == null) continue;
    const neto = original - refunded;
    if (neto <= 0) continue;
    totalCentavos += neto;
    retenciones.push({
      name: String(charge?.name ?? ""),
      amount: pesos(neto),
    });
  }

  return { retenciones, totalCentavos };
}

function feesCentavos(mp) {
  const fees = Array.isArray(mp?.fee_details) ? mp.fee_details : [];
  return fees.reduce((acc, fee) => acc + (centavos(fee?.amount) ?? 0), 0);
}

export function impuestoConciliable(mp) {
  const taxesAmount = centavos(mp?.taxes_amount ?? 0) ?? 0;
  const { retenciones, totalCentavos } = retencionesDeCharges(mp);
  const gross = centavos(mp?.transaction_amount);
  const net = centavos(mp?.transaction_details?.net_received_amount);
  const hasGap = gross != null && net != null;

  let taxCentavos = taxesAmount;
  let motivo = "taxes_amount";

  if (hasGap) {
    const gap = gross - net - feesCentavos(mp);
    const mismoImporte = totalCentavos === taxesAmount;
    const suma = taxesAmount + totalCentavos;
    if (mismoImporte && gap === taxesAmount) {
      taxCentavos = taxesAmount;
      motivo = "mismo_importe";
    } else if (gap === totalCentavos) {
      taxCentavos = totalCentavos;
      motivo = "charges";
    } else if (gap === taxesAmount) {
      taxCentavos = taxesAmount;
      motivo = "taxes_amount";
    } else if (!mismoImporte && gap === suma) {
      taxCentavos = suma;
      motivo = "suma";
    } else if (totalCentavos === 0) {
      taxCentavos = taxesAmount;
      motivo = "sin_retenciones";
    } else {
      taxCentavos = taxesAmount;
      motivo = "sin_cruce";
    }
  } else if (totalCentavos === taxesAmount) {
    taxCentavos = taxesAmount;
    motivo = "mismo_importe";
  } else if (totalCentavos === 0) {
    taxCentavos = taxesAmount;
    motivo = "sin_retenciones";
  } else if (taxesAmount === 0) {
    taxCentavos = totalCentavos;
    motivo = "charges_sin_neto";
  } else {
    taxCentavos = taxesAmount;
    motivo = "sin_cruce";
  }

  return {
    taxesAmount: pesos(taxesAmount),
    retenciones,
    retencionesTotal: pesos(totalCentavos),
    taxTotal: pesos(taxCentavos),
    adicionales: pesos(taxCentavos - taxesAmount),
    motivo,
  };
}
