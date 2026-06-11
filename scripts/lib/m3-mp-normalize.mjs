/**
 * M3 — normalize MP API (mirror lib/erp/v2/normalize-mp-payment.ts)
 */

function parseMpDate(value) {
  if (!value) return null;
  const d = new Date(String(value));
  return Number.isNaN(d.getTime()) ? null : d;
}

function sumFeeByType(feeDetails, type) {
  if (!Array.isArray(feeDetails)) return 0;
  return feeDetails
    .filter((f) => String(f?.type ?? "") === type)
    .reduce((acc, f) => acc + Number(f?.amount ?? 0), 0);
}

export function normalizeMpPayment(mpRaw, fallbackPaymentId) {
  const paymentId = String(
    mpRaw?.id ?? mpRaw?.paymentId ?? fallbackPaymentId ?? ""
  ).trim();

  const transactionAmount = Number(mpRaw?.transaction_amount ?? 0);
  const netReceivedAmount = Number(
    mpRaw?.transaction_details?.net_received_amount ?? 0
  );

  const taxTotal = Number(mpRaw?.taxes_amount ?? 0);
  const feeDetails = mpRaw?.fee_details;
  const feeTotal = sumFeeByType(feeDetails, "mercadopago_fee");
  const financingTotal = sumFeeByType(feeDetails, "financing_fee");
  const platformFeeTotal = sumFeeByType(feeDetails, "application_fee");

  const feesSum = Array.isArray(feeDetails)
    ? feeDetails.reduce((acc, f) => acc + Number(f?.amount ?? 0), 0)
    : 0;
  const totalCost = taxTotal + feesSum;

  const dateApproved = parseMpDate(mpRaw?.date_approved);
  const moneyReleaseDate = parseMpDate(mpRaw?.money_release_date);
  const acreditado = moneyReleaseDate ?? dateApproved;

  return {
    mpPaymentId: paymentId,
    mpAdditionalReference:
      String(
        mpRaw?.external_reference ??
          mpRaw?.additional_info?.external_reference ??
          ""
      ).trim() || null,
    mpStatus: String(mpRaw?.status ?? "").trim() || null,
    mpStatusDetail: String(mpRaw?.status_detail ?? "").trim() || null,
    mpDateCreated: parseMpDate(mpRaw?.date_created),
    mpDateApproved: dateApproved,
    mpMoneyReleaseDate: moneyReleaseDate,
    mpAcreditadoFecha: acreditado,
    mpTransactionAmount: Number.isFinite(transactionAmount)
      ? transactionAmount
      : null,
    mpNetReceivedAmount: Number.isFinite(netReceivedAmount)
      ? netReceivedAmount
      : null,
    mpNetoRealOrden: Number.isFinite(netReceivedAmount)
      ? netReceivedAmount
      : null,
    mpTaxTotalReal: taxTotal,
    mpFinancingTotalReal: financingTotal,
    mpFeeTotalReal: feeTotal,
    mpPlatformFeeTotalReal: platformFeeTotal,
    mpTotalCostReal: totalCost,
    mpPayerEmail: String(mpRaw?.payer?.email ?? "").trim() || null,
    mpPaymentType: String(mpRaw?.payment_type_id ?? "").trim() || null,
    mpPaymentMethod: String(mpRaw?.payment_method_id ?? "").trim() || null,
    mpInstallments: Number(mpRaw?.installments ?? 0) || null,
  };
}

export function inferTnOrderIdFromMp(mp) {
  const extRef = String(mp?.external_reference ?? "").trim();
  if (/^\d+$/.test(extRef)) {
    return { tnOrderId: extRef, matchRule: "mp.external_reference_numeric" };
  }
  return { tnOrderId: null, matchRule: "not_found" };
}
