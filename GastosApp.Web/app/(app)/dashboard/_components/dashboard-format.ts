export function formatAmount(value: number): string {
  return new Intl.NumberFormat("es-MX", {
    style: "currency",
    currency: "MXN",
    minimumFractionDigits: 2,
    maximumFractionDigits: 2
  }).format(value);
}

export function formatCompactAmount(value: number): string {
  return new Intl.NumberFormat("es-MX", {
    style: "currency",
    currency: "MXN",
    notation: "compact",
    maximumFractionDigits: 1
  }).format(value);
}

const MONTH_LABELS_ES = ["ene", "feb", "mar", "abr", "may", "jun", "jul", "ago", "sep", "oct", "nov", "dic"];

// Etiqueta de un periodo "YYYY-MM" sin pasar por Date: evita corrimientos de zona horaria.
export function formatMonthLabel(value: string): string {
  const match = /^(\d{4})-(\d{2})/.exec(value);
  if (!match) {
    return value.trim().length > 0 ? value : "—";
  }

  const index = Number(match[2]) - 1;
  return index >= 0 && index < MONTH_LABELS_ES.length ? `${MONTH_LABELS_ES[index]} ${match[1]}` : value;
}

export function formatDate(value: string, timezone: string): string {
  if (/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    const [year, month, day] = value.split("-");
    return `${day}/${month}/${year}`;
  }

  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "—";

  const parts = new Intl.DateTimeFormat("en-GB", {
    timeZone: timezone || "UTC",
    day: "2-digit",
    month: "2-digit",
    year: "numeric"
  }).formatToParts(date);
  const day = parts.find((part) => part.type === "day")?.value;
  const month = parts.find((part) => part.type === "month")?.value;
  const year = parts.find((part) => part.type === "year")?.value;

  return day && month && year ? `${day}/${month}/${year}` : "—";
}
