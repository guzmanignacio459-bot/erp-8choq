/** Formato display Analytics — solo presentación */

const currencyFormatter = new Intl.NumberFormat("es-AR", {
  style: "currency",
  currency: "ARS",
  maximumFractionDigits: 0,
});

const percentFormatter = new Intl.NumberFormat("es-AR", {
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});

const countFormatter = new Intl.NumberFormat("es-AR");

export function formatAnalyticsCurrency(amount: number): string {
  if (!Number.isFinite(amount)) return "—";
  return currencyFormatter.format(amount);
}

export function formatAnalyticsPercent(value: number): string {
  if (!Number.isFinite(value)) return "—";
  return `${percentFormatter.format(value)}%`;
}

export function formatAnalyticsCount(value: number): string {
  if (!Number.isFinite(value)) return "—";
  return countFormatter.format(value);
}

export function formatAnalyticsDayLabel(dateKey: string): string {
  if (!dateKey) return "—";
  try {
    return new Intl.DateTimeFormat("es-AR", {
      weekday: "short",
      day: "2-digit",
      month: "short",
      year: "numeric",
    }).format(new Date(`${dateKey}T12:00:00`));
  } catch {
    return dateKey;
  }
}
