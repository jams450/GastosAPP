import type {
  DashboardProjectionBudgetBasis,
  DashboardProjectionDeviation,
  DashboardProjectionHistoricalMonth,
  DashboardProjectionMonth
} from "@/lib/contracts/dashboard";

export type ProjectionChartLayout = {
  /** Total de slots temporales: histórico + Hoy (si aplica) + proyección. */
  slotCount: number;
  /** Slot propio del punto "Hoy"; `null` cuando no hay histórico y proyección que anclar. */
  todaySlot: number | null;
  /** Slot del primer mes proyectado. */
  projectionStartSlot: number;
};

/** `true` sólo si algún mes histórico tiene movimientos registrados (no "neto cero"). */
export function hasHistoryActivity(historicalMonths: DashboardProjectionHistoricalMonth[]): boolean {
  return historicalMonths.some((month) => month.hasActivity);
}

/**
 * Un mes proyectado aporta información propia cuando trae plan, rendimiento estimado, MSI o crédito
 * normal. Un mes en cero con basis `none` no es contenido: no debe dibujar una barra fabricada.
 */
export function hasProjectionMonthContent(month: DashboardProjectionMonth): boolean {
  return (
    month.baseEconomicBasis !== "none" ||
    month.budgetBasis !== "none" ||
    month.investmentEstimate !== 0 ||
    month.msiCommitment !== 0 ||
    month.normalCreditPayment !== 0
  );
}

/** `true` si el horizonte tiene al menos un mes con contenido real más allá del histórico. */
export function hasProjectionContent(months: DashboardProjectionMonth[]): boolean {
  return months.some(hasProjectionMonthContent);
}

export type ProjectionNetBreakdownRowKey =
  | "budgetIncome"
  | "budgetExpense"
  | "historicalNet"
  | "investmentEstimate"
  | "msiCommitment"
  | "normalCreditPayment"
  | "deviationAdjustment"
  | "finalNet";

export type ProjectionNetBreakdownRow = {
  key: ProjectionNetBreakdownRowKey;
  /** Contribución con signo al neto final; los egresos, la MSI y el crédito normal vienen negativos. */
  amount: number;
};

/** Métodos de proyección ofrecidos al usuario: base (plan o histórico) y ajustado por desviación. */
export type ProjectionEconomicMethod = "base" | "adjusted";

const BASE_BASIS_LABELS: Record<DashboardProjectionBudgetBasis, string> = {
  budget: "Presupuesto pendiente del periodo",
  trend: "Tendencia histórica sin traspasos de crédito",
  none: "Sin base histórica ni plan"
};

/** Etiqueta legible de la base real del neto del mes (puede diferir del `budgetBasis` heredado). */
export function projectionBaseBasisLabel(basis: DashboardProjectionBudgetBasis): string {
  return BASE_BASIS_LABELS[basis];
}

/** Neto del mes para el método elegido; ambos comparten la misma base plan/histórico. */
export function projectionMethodNet(month: DashboardProjectionMonth, method: ProjectionEconomicMethod): number {
  return method === "adjusted" ? month.adjustedEconomicNet : month.baseEconomicNet;
}

/**
 * Contribución base del neto económico (antes de MSI, crédito normal y rendimiento). Para meses con
 * presupuesto se desglosa como ingreso menos gasto; en el resto se deriva del neto base para que el
 * desglose sume exactamente y la MSI nunca se reste dos veces.
 */
function projectionBaseContribution(month: DashboardProjectionMonth): number {
  return month.baseEconomicNet - month.investmentEstimate + month.msiCommitment + month.normalCreditPayment;
}

/**
 * Desglose firmado del neto económico del mes para el método elegido. La base respeta
 * `baseEconomicBasis`; la MSI, el crédito normal y (en el método ajustado) la desviación se
 * muestran aparte para que la suma coincida con el neto final, sin doble conteo.
 */
export function projectionNetBreakdown(
  month: DashboardProjectionMonth,
  method: ProjectionEconomicMethod = "base"
): ProjectionNetBreakdownRow[] {
  const rows: ProjectionNetBreakdownRow[] = [];

  if (month.baseEconomicBasis === "budget") {
    rows.push({ key: "budgetIncome", amount: month.budgetIncome });
    rows.push({ key: "budgetExpense", amount: -month.budgetExpense });
  } else {
    rows.push({ key: "historicalNet", amount: projectionBaseContribution(month) });
  }

  rows.push({ key: "investmentEstimate", amount: month.investmentEstimate });
  rows.push({ key: "msiCommitment", amount: -month.msiCommitment });
  rows.push({ key: "normalCreditPayment", amount: -month.normalCreditPayment });

  if (method === "adjusted" && month.deviationAdjustment !== 0) {
    rows.push({ key: "deviationAdjustment", amount: month.deviationAdjustment });
  }

  rows.push({ key: "finalNet", amount: projectionMethodNet(month, method) });

  return rows;
}

export type ProjectionDeviationBreakdownRowKey =
  | "incomeDeviation"
  | "expenseDeviation"
  | "unplannedDeviation"
  | "monthlyAdjustment";

export type ProjectionDeviationBreakdownRow = {
  key: ProjectionDeviationBreakdownRowKey;
  amount: number;
};

/**
 * Componentes firmados de la muestra de desviación. Sin muestra suficiente devuelve `[]`: no hay
 * desviación conocida que mostrar, a diferencia de un cero que se leería como “sin desviación”.
 */
export function projectionDeviationBreakdown(
  deviation: DashboardProjectionDeviation
): ProjectionDeviationBreakdownRow[] {
  if (!deviation.hasSufficientSample) {
    return [];
  }

  return [
    { key: "incomeDeviation", amount: deviation.incomeDeviation },
    { key: "expenseDeviation", amount: deviation.expenseDeviation },
    { key: "unplannedDeviation", amount: deviation.unplannedDeviation },
    { key: "monthlyAdjustment", amount: deviation.monthlyAdjustment }
  ];
}

export type ProjectionNetDatum = {
  month: string;
  /** Neto mostrado: histórico registrado o neto económico base. */
  net: number;
  /** Valor base dibujado; `null` = mes sin contenido, no un cero fabricado. */
  bar: number | null;
  /** Neto económico base del futuro; en el histórico replica el neto registrado. */
  baseNet: number;
  /** Neto ajustado; sin muestra suficiente iguala al base para no fingir un escenario distinto. */
  adjustedNet: number;
  /** `true` sólo en meses futuros cuando el horizonte aplica el ajuste por desviación. */
  deviationApplied: boolean;
  hasActivity: boolean;
  projected: boolean;
};

/**
 * Serie del gráfico de flujo neto. El histórico conserva la distinción mes-vacío/mes-cero.
 * La proyección lleva ambos métodos (`baseNet`/`adjustedNet`) para poder compararlos sin
 * alternar; `adjustedNet` nunca se separa del base sin muestra suficiente. Se dibuja cuando
 * hay historial suficiente o cuando existe contenido propio (presupuesto, estimados o MSI).
 */
export function buildProjectionNetData(
  historicalMonths: DashboardProjectionHistoricalMonth[],
  months: DashboardProjectionMonth[],
  hasSufficientHistory: boolean,
  deviationApplied = false
): ProjectionNetDatum[] {
  const historical: ProjectionNetDatum[] = historicalMonths.map((month) => ({
    month: month.month,
    net: month.net,
    bar: month.hasActivity ? month.net : null,
    baseNet: month.net,
    adjustedNet: month.net,
    deviationApplied: false,
    hasActivity: month.hasActivity,
    projected: false
  }));

  const showFuture = months.length > 0 && (hasSufficientHistory || hasProjectionContent(months));
  if (!showFuture) {
    return historical;
  }

  const projected: ProjectionNetDatum[] = months.map((month) => {
    const hasContent = hasProjectionMonthContent(month);
    return {
      month: month.month,
      net: month.baseEconomicNet,
      bar: hasContent ? month.baseEconomicNet : null,
      baseNet: month.baseEconomicNet,
      // Sin ajuste soportado el escenario ajustado es el base: no se inventa una brecha.
      adjustedNet: deviationApplied ? month.adjustedEconomicNet : month.baseEconomicNet,
      deviationApplied,
      hasActivity: hasContent,
      projected: true
    };
  });

  return [...historical, ...projected];
}

export type ProjectionInvestmentSummary = {
  hasEstimate: boolean;
  totalEstimate: number;
  /** Mes del plan guardado más reciente que aportó estimados; `null` si ninguno aplica. */
  latestSourcePlanMonth: string | null;
};

/** Resumen de rendimientos estimados del horizonte; no inventa valores sin plan guardado. */
export function projectionInvestmentSummary(months: DashboardProjectionMonth[]): ProjectionInvestmentSummary {
  let hasEstimate = false;
  let totalEstimate = 0;
  let latestSourcePlanMonth: string | null = null;

  for (const month of months) {
    totalEstimate += month.investmentEstimate;

    if (month.investmentEstimate !== 0 || month.investmentSourcePlanMonth !== null) {
      hasEstimate = true;
    }

    if (
      month.investmentSourcePlanMonth !== null &&
      (latestSourcePlanMonth === null || month.investmentSourcePlanMonth > latestSourcePlanMonth)
    ) {
      latestSourcePlanMonth = month.investmentSourcePlanMonth;
    }
  }

  return { hasEstimate, totalEstimate, latestSourcePlanMonth };
}

/**
 * "Hoy" ocupa su propio slot entre el último mes histórico y la primera proyección:
 * así no se solapa con la barra del último mes ni con el primer punto proyectado.
 * El slot sólo se reserva cuando hay histórico y proyección de los que anclar.
 */
export function buildProjectionChartLayout(
  historicalMonths: DashboardProjectionHistoricalMonth[],
  months: DashboardProjectionMonth[]
): ProjectionChartLayout {
  const includeToday = historicalMonths.length > 0 && months.length > 0;
  const todaySlot = includeToday ? historicalMonths.length : null;
  const projectionStartSlot = historicalMonths.length + (includeToday ? 1 : 0);

  return {
    slotCount: projectionStartSlot + months.length,
    todaySlot,
    projectionStartSlot
  };
}
