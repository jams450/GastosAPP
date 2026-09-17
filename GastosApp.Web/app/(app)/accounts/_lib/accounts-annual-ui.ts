import type { AccountAnnualSummaryMonth } from "@/lib/contracts/account-annual-summary";

/**
 * Piezas puras del histórico anual: etiquetas, copy y geometría de los gráficos.
 *
 * Este módulo no importa nada en tiempo de ejecución a propósito (los tipos se borran al
 * ejecutar las pruebas con `node --experimental-strip-types`), así que la geometría se puede
 * verificar sin navegador. El dinero normal se formatea con `lib/format/currency`.
 */

/** Único valor de pestaña soportado por la ruta `/accounts/[id]?tab=mensual&year=YYYY`. */
export const ANNUAL_HISTORY_TAB = "mensual";

/**
 * Ruta del histórico anual de una cuenta. Se omite `year` a propósito: la página lo resuelve con
 * el año en curso de America/Mexico_City y lo normaliza en la URL, así el enlace no envejece.
 */
export function accountAnnualSummaryHref(accountId: number): string {
  return `/accounts/${accountId}?tab=${ANNUAL_HISTORY_TAB}`;
}

const MONTHS_SHORT_ES = ["ene", "feb", "mar", "abr", "may", "jun", "jul", "ago", "sep", "oct", "nov", "dic"] as const;
const MONTHS_LONG_ES = [
  "Enero",
  "Febrero",
  "Marzo",
  "Abril",
  "Mayo",
  "Junio",
  "Julio",
  "Agosto",
  "Septiembre",
  "Octubre",
  "Noviembre",
  "Diciembre"
] as const;

export function formatAnnualMonthShort(month: number): string {
  return MONTHS_SHORT_ES[month - 1] ?? String(month);
}

export function formatAnnualMonthName(month: number): string {
  return MONTHS_LONG_ES[month - 1] ?? String(month);
}

export function formatAnnualCompactMoney(value: number): string {
  return new Intl.NumberFormat("es-MX", {
    style: "currency",
    currency: "MXN",
    notation: "compact",
    maximumFractionDigits: 1
  }).format(value);
}

/** Año calendario en la zona con la que el backend ancla los meses (America/Mexico_City). */
export function currentYearInMexicoCity(): number {
  try {
    const parts = new Intl.DateTimeFormat("en-CA", { timeZone: "America/Mexico_City", year: "numeric" }).formatToParts(new Date());
    const year = Number(parts.find((part) => part.type === "year")?.value);
    if (Number.isInteger(year) && year > 0) return year;
  } catch {
    // Intl sin datos de zona: se cae al año local, que es la misma cifra salvo desfase de horas.
  }

  return new Date().getFullYear();
}

/**
 * Primer año ofrecible del selector: el año de inicio de la cuenta cuando existe y es coherente,
 * si no una ventana corta hacia atrás. Sin dato no se ofrece un rango ilimitado.
 */
export function earliestSummaryYear(startDate: string | null, currentYear: number, fallbackWindow = 5): number {
  const match = /^(\d{4})/.exec(startDate ?? "");
  const startYear = match ? Number(match[1]) : Number.NaN;

  if (Number.isInteger(startYear) && startYear > 0 && startYear <= currentYear) {
    return startYear;
  }

  return currentYear - fallbackWindow;
}

export function hasAnnualActivity(months: AccountAnnualSummaryMonth[]): boolean {
  return months.some((month) => month.hasActivity);
}

export type AnnualSummaryCopy = {
  openingTitle: string;
  closingTitle: string;
  /** Nota de lectura del saldo; `null` cuando no hace falta aclarar nada. */
  balanceNote: string | null;
  flowCaption: string;
  yearCaption: string;
};

/**
 * Una cuenta de crédito puede tener saldo a favor o deuda según el signo: el copy no decide por
 * el usuario ni proyecta. Cuenta de efectivo: saldo directo.
 */
export function annualSummaryCopy(isCredit: boolean): AnnualSummaryCopy {
  return {
    openingTitle: "Saldo inicial",
    closingTitle: isCredit ? "Saldo al cierre (puede ser deuda)" : "Saldo al cierre",
    balanceNote: isCredit
      ? "Saldo de la cuenta al cierre del año. El signo indica deuda o saldo a favor; no se proyecta."
      : null,
    flowCaption: "Ingresos y gastos confirmados del año. Las transferencias van aparte: mover dinero entre tus cuentas no es ingreso ni gasto.",
    yearCaption: "Un mes sin movimientos conserva el saldo del mes anterior; no se muestra como cero."
  };
}

/* ------------------------------------------------------------------------------------------- */
/* Geometría de gráficos                                                                        */
/* ------------------------------------------------------------------------------------------- */

export const ANNUAL_CHART_WIDTH = 720;
export const ANNUAL_CHART_HEIGHT = 260;

const PADDING = { top: 18, right: 20, bottom: 30, left: 72 };
const PLOT_WIDTH = ANNUAL_CHART_WIDTH - PADDING.left - PADDING.right;
const PLOT_HEIGHT = ANNUAL_CHART_HEIGHT - PADDING.top - PADDING.bottom;
const MONTH_SLOTS = 12;

export const ANNUAL_CHART_BASELINE_Y = PADDING.top + PLOT_HEIGHT;
export const ANNUAL_CHART_PLOT_LEFT = PADDING.left;
export const ANNUAL_CHART_PLOT_RIGHT = ANNUAL_CHART_WIDTH - PADDING.right;

export type AnnualChartTick = { value: number; y: number; label: string };

/** Centro horizontal del mes. Se usan 12 ranuras fijas para que barras y línea compartan eje. */
export function annualMonthX(month: number): number {
  return PADDING.left + (PLOT_WIDTH / MONTH_SLOTS) * (month - 0.5);
}

function yForValue(value: number, min: number, max: number): number {
  const span = max - min;
  if (span <= 0) return PADDING.top + PLOT_HEIGHT / 2;
  return PADDING.top + (1 - (value - min) / span) * PLOT_HEIGHT;
}

function ticksFor(min: number, max: number, count: number): AnnualChartTick[] {
  return Array.from({ length: count }, (_, index) => {
    const value = max - ((max - min) / (count - 1)) * index;
    return { value, y: yForValue(value, min, max), label: formatAnnualCompactMoney(value) };
  });
}

export type AnnualFlowBar = {
  month: number;
  label: string;
  income: number;
  expense: number;
  incomeHeight: number;
  expenseHeight: number;
  incomeY: number;
  expenseY: number;
  incomeX: number;
  expenseX: number;
  width: number;
};

export type AnnualFlowChartModel = {
  bars: AnnualFlowBar[];
  baselineY: number;
  ticks: AnnualChartTick[];
  /** Cero cuando el año no registra ingresos ni gastos: no hay barras que dibujar. */
  peak: number;
  hasData: boolean;
};

/** Barras ingreso-vs-gasto por mes, sin transferencias (no son flujo real). */
export function buildAnnualFlowChart(months: AccountAnnualSummaryMonth[]): AnnualFlowChartModel {
  const peak = months.reduce((max, month) => Math.max(max, month.income, month.expense), 0);
  const slotWidth = PLOT_WIDTH / MONTH_SLOTS;
  const barWidth = Math.min(slotWidth * 0.32, 18);
  const domainMax = peak > 0 ? peak * 1.1 : 1;

  const bars: AnnualFlowBar[] = months.map((month) => {
    const center = annualMonthX(month.month);
    const incomeHeight = month.income > 0 ? (month.income / domainMax) * PLOT_HEIGHT : 0;
    const expenseHeight = month.expense > 0 ? (month.expense / domainMax) * PLOT_HEIGHT : 0;

    return {
      month: month.month,
      label: formatAnnualMonthShort(month.month),
      income: month.income,
      expense: month.expense,
      incomeHeight,
      expenseHeight,
      incomeY: ANNUAL_CHART_BASELINE_Y - incomeHeight,
      expenseY: ANNUAL_CHART_BASELINE_Y - expenseHeight,
      incomeX: center - barWidth - 1,
      expenseX: center + 1,
      width: barWidth
    };
  });

  return {
    bars,
    baselineY: ANNUAL_CHART_BASELINE_Y,
    ticks: [
      { value: domainMax / 1.1, y: ANNUAL_CHART_BASELINE_Y - PLOT_HEIGHT, label: formatAnnualCompactMoney(domainMax / 1.1) },
      { value: domainMax / 2.2, y: ANNUAL_CHART_BASELINE_Y - PLOT_HEIGHT / 2, label: formatAnnualCompactMoney(domainMax / 2.2) },
      { value: 0, y: ANNUAL_CHART_BASELINE_Y, label: formatAnnualCompactMoney(0) }
    ],
    peak,
    hasData: peak > 0
  };
}

export type AnnualBalancePoint = {
  month: number;
  label: string;
  value: number;
  x: number;
  y: number;
};

export type AnnualBalanceChartModel = {
  points: AnnualBalancePoint[];
  /** `<polyline points>` del saldo de cierre. */
  polyline: string;
  /** Área bajo la línea hasta la referencia cero (o la base si el rango no cruza cero). */
  areaPath: string;
  ticks: AnnualChartTick[];
  /** Y del cero cuando el rango lo cruza; `null` si todo el año es del mismo signo. */
  zeroY: number | null;
  min: number;
  max: number;
  finalValue: number;
};

/**
 * Línea del saldo de cierre mes a mes. Se usan los 12 meses que envía el backend: los meses sin
 * movimientos conservan su saldo y por eso la línea no se corta ni cae a cero.
 */
export function buildAnnualBalanceChart(months: AccountAnnualSummaryMonth[]): AnnualBalanceChartModel | null {
  if (months.length === 0) {
    return null;
  }

  const values = months.map((month) => month.closingBalance);
  let min = Math.min(...values);
  let max = Math.max(...values);

  if (min === max) {
    min -= 1;
    max += 1;
  }

  const padding = (max - min) * 0.12;
  min -= padding;
  max += padding;

  const points: AnnualBalancePoint[] = months.map((month) => ({
    month: month.month,
    label: formatAnnualMonthShort(month.month),
    value: month.closingBalance,
    x: annualMonthX(month.month),
    y: yForValue(month.closingBalance, min, max)
  }));

  const zeroY = min <= 0 && max >= 0 ? yForValue(0, min, max) : null;
  const areaBaseY = zeroY ?? ANNUAL_CHART_BASELINE_Y;
  const first = points[0];
  const last = points[points.length - 1];

  return {
    points,
    polyline: points.map((point) => `${point.x},${point.y}`).join(" "),
    areaPath: `M ${first.x} ${areaBaseY} ${points.map((point) => `L ${point.x} ${point.y}`).join(" ")} L ${last.x} ${areaBaseY} Z`,
    ticks: ticksFor(min, max, 4),
    zeroY,
    min,
    max,
    finalValue: last.value
  };
}
