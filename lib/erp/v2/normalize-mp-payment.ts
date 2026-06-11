/**
 * Normalización MP API → shape persistible en payments (M3.1b)
 * Compatible con contrato GAS normalizeMpForGas — sin escribir GAS.
 */

export type NormalizedMpPayment = {
  mpPaymentId: string;
  mpAdditionalReference: string | null;
  mpStatus: string | null;
  mpStatusDetail: string | null;
  mpDateCreated: Date | null;
  mpDateApproved: Date | null;
  mpMoneyReleaseDate: Date | null;
  mpAcreditadoFecha: Date | null;
  mpTransactionAmount: number | null;
  mpNetReceivedAmount: number | null;
  mpNetoRealOrden: number | null;
  mpTaxTotalReal: number | null;
  mpFinancingTotalReal: number | null;
  mpFeeTotalReal: number | null;
  mpPlatformFeeTotalReal: number | null;
  mpTotalCostReal: number | null;
  mpPayerEmail: string | null;
  mpPaymentType: string | null;
  mpPaymentMethod: string | null;
  mpInstallments: number | null;
};

function parseMpDate(value: unknown): Date | null {
  if (!value) return null;
  const d = new Date(String(value));
  return Number.isNaN(d.getTime()) ? null : d;
}

function sumFeeByType(
  feeDetails: unknown,
  type: string
): number {
  if (!Array.isArray(feeDetails)) return 0;
  return feeDetails
    .filter((f) => String((f as { type?: string })?.type ?? "") === type)
    .reduce(
      (acc, f) => acc + Number((f as { amount?: number })?.amount ?? 0),
      0
    );
}

export function normalizeMpPayment(
  mpRaw: Record<string, unknown>,
  fallbackPaymentId?: string | number
): NormalizedMpPayment {
  const paymentId = String(
    mpRaw?.id ?? mpRaw?.paymentId ?? fallbackPaymentId ?? ""
  ).trim();

  const transactionAmount = Number(mpRaw?.transaction_amount ?? 0);
  const netReceivedAmount = Number(
    (mpRaw?.transaction_details as { net_received_amount?: number } | undefined)
      ?.net_received_amount ?? 0
  );

  const taxTotal = Number(mpRaw?.taxes_amount ?? 0);
  const feeDetails = mpRaw?.fee_details;
  const feeTotal = sumFeeByType(feeDetails, "mercadopago_fee");
  const financingTotal = sumFeeByType(feeDetails, "financing_fee");
  const platformFeeTotal = sumFeeByType(feeDetails, "application_fee");

  const feesSum = Array.isArray(feeDetails)
    ? feeDetails.reduce(
        (acc, f) => acc + Number((f as { amount?: number })?.amount ?? 0),
        0
      )
    : 0;
  const totalCost = taxTotal + feesSum;

  const dateApproved = parseMpDate(mpRaw?.date_approved);
  const moneyReleaseDate = parseMpDate(mpRaw?.money_release_date);
  const acreditado = moneyReleaseDate ?? dateApproved;

  const additionalInfo = mpRaw?.additional_info as
    | { external_reference?: string }
    | undefined;

  return {
    mpPaymentId: paymentId,
    mpAdditionalReference:
      String(
        mpRaw?.external_reference ?? additionalInfo?.external_reference ?? ""
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
    mpPayerEmail:
      String(
        (mpRaw?.payer as { email?: string } | undefined)?.email ?? ""
      ).trim() || null,
    mpPaymentType: String(mpRaw?.payment_type_id ?? "").trim() || null,
    mpPaymentMethod: String(mpRaw?.payment_method_id ?? "").trim() || null,
    mpInstallments: Number(mpRaw?.installments ?? 0) || null,
  };
}

const AMOUNT_KEYS: (keyof NormalizedMpPayment)[] = [
  "mpTransactionAmount",
  "mpNetReceivedAmount",
  "mpNetoRealOrden",
  "mpTaxTotalReal",
  "mpFinancingTotalReal",
  "mpFeeTotalReal",
  "mpPlatformFeeTotalReal",
  "mpTotalCostReal",
];

export function diffNormalizedMpPayment(
  before: Partial<NormalizedMpPayment> | null,
  after: NormalizedMpPayment
): string[] {
  if (!before) {
    return Object.keys(after).filter(
      (k) => after[k as keyof NormalizedMpPayment] != null
    );
  }

  const changed: string[] = [];
  for (const key of AMOUNT_KEYS) {
    const a = before[key] as number | null | undefined;
    const b = after[key];
    if (a == null && b == null) continue;
    if (a == null || b == null) {
      changed.push(key);
      continue;
    }
    if (Math.abs(Number(a) - Number(b)) > 0.01) changed.push(key);
  }

  for (const key of [
    "mpStatus",
    "mpStatusDetail",
    "mpPaymentId",
    "mpDateApproved",
    "mpDateCreated",
  ] as const) {
    const a = before[key];
    const b = after[key];
    const aStr =
      a instanceof Date ? a.toISOString() : a != null ? String(a) : null;
    const bStr =
      b instanceof Date ? b.toISOString() : b != null ? String(b) : null;
    if (aStr !== bStr) changed.push(key);
  }

  return changed;
}
