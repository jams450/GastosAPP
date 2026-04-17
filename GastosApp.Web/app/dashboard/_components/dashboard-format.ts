export function formatAmount(value: number): string {
  return new Intl.NumberFormat("es-MX", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2
  }).format(value);
}
