export type DashboardAccountOverview = {
  accountId: number;
  name: string;
  active: boolean;
  isCredit: boolean;
  cutoffDay: number | null;
  paymentDueDay: number | null;
  initialBalance: number;
  openingBalance: number;
  currentBalance: number;
  monthIncome: number;
  monthExpense: number;
  monthTransferIn: number;
  monthTransferOut: number;
  monthNet: number;
  closingBalance: number;
  creditLimit: number | null;
  periodStart: string | null;
  periodEnd: string | null;
  periodSpent: number;
  estimatedCutoffCharges: number;
  cutoffPayments: number;
  cutoffPending: number;
  msiOutstanding: number;
  normalOutstanding: number;
  /**
   * Deuda canónica de la cuenta (normal pendiente + MSI pendiente), calculada por backend.
   * Snapshot actual: no depende del mes consultado. Si el backend no la envía,
   * `normalizeAccount` la deriva de los saldos pendientes.
   */
  currentDebt: number;
  /**
   * Disponible de crédito calculado por backend = límite - deuda; puede ser negativo.
   * `null` significa "sin límite declarado", no "cero".
   * Mientras no exista, el frontend lo deriva con `resolveAccountCredit`.
   */
  creditAvailable: number | null;
};

type UnknownRecord = Record<string, unknown>;

function isRecord(value: unknown): value is UnknownRecord {
  return typeof value === "object" && value !== null;
}

function toFiniteNumber(value: unknown): number {
  const parsed = typeof value === "number" ? value : Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

function toOptionalFiniteNumber(value: unknown): number | null {
  if (value === null || value === undefined || value === "") {
    return null;
  }

  const parsed = typeof value === "number" ? value : Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function toOptionalInt(value: unknown): number | null {
  if (value === null || value === undefined || value === "") {
    return null;
  }

  const parsed = Number(value);
  if (!Number.isInteger(parsed)) {
    return null;
  }

  return parsed;
}

function toOptionalDateString(value: unknown): string | null {
  if (typeof value !== "string" || value.trim().length === 0) {
    return null;
  }

  return value;
}

function normalizeAccount(input: unknown): DashboardAccountOverview | null {
  if (!isRecord(input)) {
    return null;
  }

  const accountId = toFiniteNumber(input.accountId);
  if (accountId <= 0) {
    return null;
  }

  const normalOutstanding = toFiniteNumber(input.normalOutstanding);
  const msiOutstanding = toFiniteNumber(input.msiOutstanding);

  return {
    accountId,
    name: typeof input.name === "string" && input.name.trim().length > 0 ? input.name.trim() : "Sin nombre",
    active: Boolean(input.active),
    isCredit: Boolean(input.isCredit),
    cutoffDay: toOptionalInt(input.cutoffDay),
    paymentDueDay: toOptionalInt(input.paymentDueDay),
    initialBalance: toFiniteNumber(input.initialBalance),
    openingBalance: toFiniteNumber(input.openingBalance),
    currentBalance: toFiniteNumber(input.currentBalance),
    monthIncome: toFiniteNumber(input.monthIncome),
    monthExpense: toFiniteNumber(input.monthExpense),
    monthTransferIn: toFiniteNumber(input.monthTransferIn),
    monthTransferOut: toFiniteNumber(input.monthTransferOut),
    monthNet: toFiniteNumber(input.monthNet),
    closingBalance: toFiniteNumber(input.closingBalance),
    creditLimit: toOptionalFiniteNumber(input.creditLimit),
    periodStart: toOptionalDateString(input.periodStart),
    periodEnd: toOptionalDateString(input.periodEnd),
    periodSpent: toFiniteNumber(input.periodSpent),
    estimatedCutoffCharges: toFiniteNumber(input.estimatedCutoffCharges),
    cutoffPayments: toFiniteNumber(input.cutoffPayments),
    cutoffPending: toFiniteNumber(input.cutoffPending),
    msiOutstanding,
    normalOutstanding,
    // Canónico del backend; sin campo se deriva para no inventar una deuda distinta.
    currentDebt: toOptionalFiniteNumber(input.currentDebt) ?? normalOutstanding + msiOutstanding,
    creditAvailable: toOptionalFiniteNumber(input.creditAvailable)
  };
}

export type DashboardBreakdownItem = {
  id: number | null;
  name: string;
  amount: number;
  cashAmount: number;
  creditAmount: number;
};

export type DashboardGeneralSummary = {
  monthIncome: number;
  monthExpense: number;
  monthFinancialNet: number;
};

export type DashboardCharts = {
  expenseByCategory: DashboardBreakdownItem[];
  expenseBySubcategory: DashboardBreakdownItem[];
  incomeByAccount: DashboardBreakdownItem[];
  expenseByAccount: DashboardBreakdownItem[];
  // Sin uso en la UI del dashboard (se conserva por compatibilidad).
  transferInByAccount: DashboardBreakdownItem[];
  // Sin uso en la UI del dashboard (se conserva por compatibilidad).
  transferOutByAccount: DashboardBreakdownItem[];
};

export type DashboardCreditSectionSummary = {
  /** Suma de (límite - deuda) de las cuentas de crédito activas. Snapshot actual, no del mes. */
  totalAvailable: number;
  /** Límite de crédito total declarado (0 si no aplica). */
  totalLimit: number;
  /** Deuda total actual = totalNormalDebt + totalMsiDebt. */
  totalDebt: number;
  /** Deuda normal (revolving) total pendiente. Snapshot actual. */
  totalNormalDebt: number;
  /** Deuda MSI total pendiente. Snapshot actual. */
  totalMsiDebt: number;
  monthIncome: number;
  monthExpense: number;
  monthNet: number;
  monthFinancialNet: number;
  transferIn: number;
  transferOut: number;
  monthMsiExpense: number;
  monthNormalExpense: number;
  pendingMsi: number;
  pendingNormal: number;
};

export type DashboardCashSectionSummary = {
  total: number;
  monthIncome: number;
  monthExpense: number;
  monthNet: number;
  monthFinancialNet: number;
  /**
   * `true` sólo si el backend envía el desglose aditivo. Un payload legacy deja `false`:
   * la UI no puede separar gasto directo de pago a tarjeta a partir de `monthExpense`.
   */
  hasCashFlowBreakdown: boolean;
  /** Gasto directo en cuentas de efectivo del mes; excluye pagos a tarjeta. */
  monthDirectExpense: number;
  /** Pagos efectivo→crédito: salen de efectivo y reducen deuda, no son consumo nuevo. */
  monthCardPayment: number;
  /** Traspasos efectivo→efectivo: sólo mueven dinero entre cuentas propias, contados una vez. */
  monthInternalCashTransfer: number;
  /** Salida total de efectivo = gasto directo + pagos a tarjeta. */
  monthCashOutflow: number;
};

type DashboardCashFlowBreakdown = Pick<
  DashboardCashSectionSummary,
  "hasCashFlowBreakdown" | "monthDirectExpense" | "monthCardPayment" | "monthInternalCashTransfer" | "monthCashOutflow"
>;

function normalizeCashFlowBreakdown(input: UnknownRecord): DashboardCashFlowBreakdown {
  const directExpense = toOptionalFiniteNumber(input.monthDirectExpense);
  const cardPayment = toOptionalFiniteNumber(input.monthCardPayment);
  const internalTransfer = toOptionalFiniteNumber(input.monthInternalCashTransfer);
  const cashOutflow = toOptionalFiniteNumber(input.monthCashOutflow);
  const hasCashFlowBreakdown =
    directExpense !== null || cardPayment !== null || internalTransfer !== null || cashOutflow !== null;

  return {
    hasCashFlowBreakdown,
    monthDirectExpense: directExpense ?? 0,
    monthCardPayment: cardPayment ?? 0,
    monthInternalCashTransfer: internalTransfer ?? 0,
    // Sin campos legacy no se inventa desglose; con clasificación parcial se deriva la salida total.
    monthCashOutflow: cashOutflow ?? (directExpense ?? 0) + (cardPayment ?? 0)
  };
}

export type DashboardOverviewResponse = {
  month: string;
  timezone: string;
  generalSummary: DashboardGeneralSummary;
  charts: DashboardCharts;
  creditSummary: DashboardCreditSectionSummary;
  cashSummary: DashboardCashSectionSummary;
  accounts: DashboardAccountOverview[];
};

function normalizeBreakdownItem(input: unknown): DashboardBreakdownItem | null {
  if (!isRecord(input)) {
    return null;
  }

  return {
    id: toOptionalInt(input.id),
    name: typeof input.name === "string" && input.name.trim().length > 0 ? input.name.trim() : "Sin nombre",
    amount: toFiniteNumber(input.amount),
    cashAmount: toFiniteNumber(input.cashAmount),
    creditAmount: toFiniteNumber(input.creditAmount)
  };
}

function normalizeCollection<T>(input: unknown, normalize: (item: unknown) => T | null): T[] {
  return Array.isArray(input) ? input.map((item) => normalize(item)).filter((item): item is T => item !== null) : [];
}

function normalizeBreakdownCollection(input: unknown): DashboardBreakdownItem[] {
  return normalizeCollection(input, normalizeBreakdownItem);
}

export function normalizeDashboardOverview(input: unknown): DashboardOverviewResponse {
  if (!isRecord(input)) {
    return {
      month: "",
      timezone: "America/Mexico_City",
      generalSummary: {
        monthIncome: 0,
        monthExpense: 0,
        monthFinancialNet: 0
      },
      charts: {
        expenseByCategory: [],
        expenseBySubcategory: [],
        incomeByAccount: [],
        expenseByAccount: [],
        transferInByAccount: [],
        transferOutByAccount: []
      },
      creditSummary: {
        totalAvailable: 0,
        totalLimit: 0,
        totalDebt: 0,
        totalNormalDebt: 0,
        totalMsiDebt: 0,
        monthIncome: 0,
        monthExpense: 0,
        monthNet: 0,
        monthFinancialNet: 0,
        transferIn: 0,
        transferOut: 0,
        monthMsiExpense: 0,
        monthNormalExpense: 0,
        pendingMsi: 0,
        pendingNormal: 0
      },
      cashSummary: {
        total: 0,
        monthIncome: 0,
        monthExpense: 0,
        monthNet: 0,
        monthFinancialNet: 0,
        ...normalizeCashFlowBreakdown({})
      },
      accounts: []
    };
  }

  const generalSummaryInput = isRecord(input.generalSummary) ? input.generalSummary : {};
  const chartsInput = isRecord(input.charts) ? input.charts : {};
  const creditSummaryInput = isRecord(input.creditSummary) ? input.creditSummary : {};
  const cashSummaryInput = isRecord(input.cashSummary) ? input.cashSummary : {};
  const accounts = Array.isArray(input.accounts)
    ? input.accounts.map((item) => normalizeAccount(item)).filter((item): item is DashboardAccountOverview => item !== null)
    : [];

  return {
    month: typeof input.month === "string" ? input.month : "",
    timezone: typeof input.timezone === "string" ? input.timezone : "America/Mexico_City",
    generalSummary: {
      monthIncome: toFiniteNumber(generalSummaryInput.monthIncome),
      monthExpense: toFiniteNumber(generalSummaryInput.monthExpense),
      monthFinancialNet: toFiniteNumber(
        generalSummaryInput.monthFinancialNet ??
          toFiniteNumber(generalSummaryInput.monthIncome) - toFiniteNumber(generalSummaryInput.monthExpense)
      )
    },
    charts: {
      expenseByCategory: normalizeBreakdownCollection(chartsInput.expenseByCategory),
      expenseBySubcategory: normalizeBreakdownCollection(chartsInput.expenseBySubcategory),
      incomeByAccount: normalizeBreakdownCollection(chartsInput.incomeByAccount),
      expenseByAccount: normalizeBreakdownCollection(chartsInput.expenseByAccount),
      transferInByAccount: normalizeBreakdownCollection(chartsInput.transferInByAccount),
      transferOutByAccount: normalizeBreakdownCollection(chartsInput.transferOutByAccount)
    },
    creditSummary: {
      totalAvailable: toFiniteNumber(creditSummaryInput.totalAvailable),
      totalLimit: toFiniteNumber(creditSummaryInput.totalLimit),
      totalDebt: toFiniteNumber(creditSummaryInput.totalDebt),
      totalNormalDebt: toFiniteNumber(creditSummaryInput.totalNormalDebt),
      totalMsiDebt: toFiniteNumber(creditSummaryInput.totalMsiDebt),
      monthIncome: toFiniteNumber(creditSummaryInput.monthIncome),
      monthExpense: toFiniteNumber(creditSummaryInput.monthExpense),
      monthNet: toFiniteNumber(creditSummaryInput.monthNet),
      monthFinancialNet: toFiniteNumber(
        creditSummaryInput.monthFinancialNet ??
          toFiniteNumber(creditSummaryInput.monthIncome) - toFiniteNumber(creditSummaryInput.monthExpense)
      ),
      transferIn: toFiniteNumber(creditSummaryInput.transferIn),
      transferOut: toFiniteNumber(creditSummaryInput.transferOut),
      monthMsiExpense: toFiniteNumber(creditSummaryInput.monthMsiExpense),
      monthNormalExpense: toFiniteNumber(creditSummaryInput.monthNormalExpense),
      pendingMsi: toFiniteNumber(creditSummaryInput.pendingMsi),
      pendingNormal: toFiniteNumber(creditSummaryInput.pendingNormal)
    },
    cashSummary: {
      total: toFiniteNumber(cashSummaryInput.total),
      monthIncome: toFiniteNumber(cashSummaryInput.monthIncome),
      monthExpense: toFiniteNumber(cashSummaryInput.monthExpense),
      monthNet: toFiniteNumber(cashSummaryInput.monthNet),
      monthFinancialNet: toFiniteNumber(
        cashSummaryInput.monthFinancialNet ??
          toFiniteNumber(cashSummaryInput.monthIncome) - toFiniteNumber(cashSummaryInput.monthExpense)
      ),
      ...normalizeCashFlowBreakdown(cashSummaryInput)
    },
    accounts
  };
}

export type DashboardProjectionHistoricalMonth = {
  month: string;
  income: number;
  expense: number;
  net: number;
  /**
   * `false` = sin movimientos registrados en el mes (ausencia de historial), no un neto de cero.
   * Si el backend no envía el campo se deriva de income/expense para no pintar ceros fabricados.
   */
  hasActivity: boolean;
};

export type DashboardProjectionTrend = {
  sampleMonths: number;
  monthlyNetSlope: number;
  projectedMonthlyNet: number;
  hasSufficientHistory: boolean;
};

/**
 * Procedencia del ajuste por desviación histórica aplicado a `adjustedEconomicNet`.
 * Sin muestra suficiente todos los importes son cero: la UI no debe presentarlo como
 * una desviación conocida.
 */
export type DashboardProjectionDeviation = {
  /** Meses candidatos de la ventana (los últimos completos), con o sin plan comparable. */
  windowMonths: string[];
  /** Meses con plan comparable que entraron al promedio. */
  sampledMonths: string[];
  sampleSize: number;
  requiredSampleSize: number;
  /** `true` sólo si la muestra cubre los meses exigidos y el backend lo declara. */
  hasSufficientSample: boolean;
  /** Promedio mensual del neto real menos el plan, con signo. Cero si la muestra es insuficiente. */
  monthlyAdjustment: number;
  /** Ingresos: real menos planificado (con signo). Cero si la muestra es insuficiente. */
  incomeDeviation: number;
  /** Gastos: planificado menos real (con signo; positivo = se gastó menos). */
  expenseDeviation: number;
  /** Movimientos sin partida: ingreso no planeado menos gasto no planeado (con signo). */
  unplannedDeviation: number;
};

export type DashboardProjectionBudgetBasis = "budget" | "trend" | "none";

export type DashboardProjectionMonth = {
  month: string;
  projectedCashBalance: number;
  projectedNet: number;
  msiCommitment: number;
  /** Saldo con pagos MSI; `null` si upstream no aporta escenario explícito. */
  msiPaymentScenarioBalance: number | null;
  /**
   * Origen del neto base del mes: `budget` = partidas pendientes del periodo (reemplazan la
   * tendencia, incluso con montos en cero), `trend` = histórico con muestra suficiente,
   * `none` = sin base confiable. Un payload legacy sin el campo se normaliza a `none`.
   */
  budgetBasis: DashboardProjectionBudgetBasis;
  /** Ingreso planificado pendiente; 0 cuando el mes no usa presupuesto. */
  budgetIncome: number;
  /**
   * Gasto planificado pendiente; 0 cuando el mes no usa presupuesto.
   * Por convención las partidas excluyen cuotas MSI: éstas se restan aparte vía `msiCommitment`.
   */
  budgetExpense: number;
  /** Rendimiento estimado del mes; no es efectivo recibido ni entra al saldo de efectivo. */
  investmentEstimate: number;
  /** Mes del plan guardado que aportó el estimado; `null` si ninguno cubre el mes. */
  investmentSourcePlanMonth: string | null;
  /**
   * Neto económico estimado = base del mes - MSI + rendimiento estimado. La MSI se descuenta
   * exactamente una vez. En payloads legacy sin el campo se deriva de `projectedNet - msiCommitment`.
   * Campo heredado (no descuenta crédito normal): el neto vigente es `baseEconomicNet`.
   */
  estimatedEconomicNet: number;
  /**
   * Pago de crédito normal (Revolving) del mes: pendiente de las cuotas abiertas con vencimiento
   * en el mes. Se resta exactamente una vez del neto base. Legacy sin el campo => 0, nunca un
   * pago inferido.
   */
  normalCreditPayment: number;
  /**
   * Origen de la base del neto económico: `budget` (plan pendiente), `trend` (línea base histórica
   * sin traspasos de liquidación de crédito) o `none`. En payloads legacy se deriva de `budgetBasis`
   * para no inventar una base distinta a la ya mostrada.
   */
  baseEconomicBasis: DashboardProjectionBudgetBasis;
  /**
   * Neto económico base = base (plan o histórico sin traspasos) + rendimiento estimado − MSI
   * − pago de crédito normal. Legacy sin el campo => se conserva `estimatedEconomicNet`.
   */
  baseEconomicNet: number;
  /** Ajuste por desviación histórica del mes; 0 sin muestra suficiente. */
  deviationAdjustment: number;
  /**
   * Neto económico ajustado = `baseEconomicNet` + `deviationAdjustment`. Sin muestra suficiente
   * queda igual al base, y un payload legacy no se presenta como escenario ajustado soportado.
   */
  adjustedEconomicNet: number;
};

export type DashboardProjectionMsiPlan = {
  planId: string | null;
  accountId: number | null;
  accountName: string;
  /** Texto del cargo MSI cuando upstream lo aporta; ausente no se convierte en dato inventado. */
  description: string | null;
  remainingAmount: number;
  openInstallments: number | null;
  nextDueDate: string | null;
  nextDueAmount: number | null;
  endsOn: string | null;
  scheduleComplete: boolean;
};

export type DashboardProjectionResponse = {
  asOfDate: string | null;
  timezone: string;
  horizonMonths: number;
  cashRealBalance: number;
  historicalMonths: DashboardProjectionHistoricalMonth[];
  trend: DashboardProjectionTrend;
  months: DashboardProjectionMonth[];
  msiPlans: DashboardProjectionMsiPlan[];
  /** Procedencia del ajuste por desviación; sin el campo el escenario ajustado no está soportado. */
  deviation: DashboardProjectionDeviation;
};

function toStringId(value: unknown): string | null {
  if (typeof value === "string" && value.trim().length > 0) {
    return value.trim();
  }

  if (typeof value === "number" && Number.isFinite(value)) {
    return String(value);
  }

  return null;
}

function normalizeProjectionHistoricalMonth(input: unknown): DashboardProjectionHistoricalMonth | null {
  if (!isRecord(input)) {
    return null;
  }

  const month = typeof input.month === "string" ? input.month.trim() : "";
  if (month.length === 0) {
    return null;
  }

  const income = toFiniteNumber(input.income);
  const expense = toFiniteNumber(input.expense);

  return {
    month,
    income,
    expense,
    net: toFiniteNumber(input.net ?? income - expense),
    hasActivity: typeof input.hasActivity === "boolean" ? input.hasActivity : income !== 0 || expense !== 0
  };
}

function toOptionalMonthString(value: unknown): string | null {
  if (typeof value !== "string") {
    return null;
  }

  const trimmed = value.trim();
  return /^\d{4}-\d{2}$/.test(trimmed) ? trimmed : null;
}

function normalizeProjectionBudgetBasis(value: unknown): DashboardProjectionBudgetBasis {
  return value === "budget" || value === "trend" || value === "none" ? value : "none";
}

function normalizeProjectionMonth(input: unknown): DashboardProjectionMonth | null {
  if (!isRecord(input)) {
    return null;
  }

  const month = typeof input.month === "string" ? input.month.trim() : "";
  if (month.length === 0) {
    return null;
  }

  const projectedCashBalance = toFiniteNumber(input.projectedCashBalance);
  const projectedNet = toFiniteNumber(input.projectedNet);
  const msiCommitment = toFiniteNumber(input.msiCommitment);
  const investmentEstimate = toFiniteNumber(input.investmentEstimate);
  // Legacy sin el campo: neto final = projectedNet - msiCommitment + 0 (yield 0).
  // Un cero explícito del backend se respeta tal cual.
  const estimatedEconomicNet =
    toOptionalFiniteNumber(input.estimatedEconomicNet) ?? projectedNet - msiCommitment + investmentEstimate;
  const normalCreditPayment = toFiniteNumber(input.normalCreditPayment);
  // Legacy sin base económica: se conserva la base que ya describía el payload heredado.
  const baseEconomicBasis = normalizeProjectionBudgetBasis(input.baseEconomicBasis ?? input.budgetBasis);
  const baseEconomicNet = toOptionalFiniteNumber(input.baseEconomicNet) ?? estimatedEconomicNet;
  const deviationAdjustment = toFiniteNumber(input.deviationAdjustment);

  return {
    month,
    projectedCashBalance,
    projectedNet,
    msiCommitment,
    msiPaymentScenarioBalance:
      input.msiPaymentScenarioBalance === null || input.msiPaymentScenarioBalance === undefined
        ? null
        : toFiniteNumber(input.msiPaymentScenarioBalance),
    budgetBasis: normalizeProjectionBudgetBasis(input.budgetBasis),
    budgetIncome: toFiniteNumber(input.budgetIncome),
    budgetExpense: toFiniteNumber(input.budgetExpense),
    investmentEstimate,
    investmentSourcePlanMonth: toOptionalMonthString(input.investmentSourcePlanMonth),
    estimatedEconomicNet,
    normalCreditPayment,
    baseEconomicBasis,
    baseEconomicNet,
    deviationAdjustment,
    // Legacy o backend sin el campo: no se declara un escenario ajustado distinto al base.
    adjustedEconomicNet: toOptionalFiniteNumber(input.adjustedEconomicNet) ?? baseEconomicNet + deviationAdjustment
  };
}

function normalizeProjectionMsiPlan(input: unknown): DashboardProjectionMsiPlan | null {
  if (!isRecord(input)) {
    return null;
  }

  const planId = toStringId(input.planId);
  const accountId = toOptionalInt(input.accountId);

  if (planId === null && accountId === null) {
    return null;
  }

  return {
    planId,
    accountId,
    accountName:
      typeof input.accountName === "string" && input.accountName.trim().length > 0
        ? input.accountName.trim()
        : "Cuenta sin nombre",
    description: typeof input.description === "string" && input.description.trim().length > 0 ? input.description.trim() : null,
    remainingAmount: toFiniteNumber(input.remainingAmount),
    openInstallments: toOptionalInt(input.openInstallments),
    nextDueDate: toOptionalDateString(input.nextDueDate),
    nextDueAmount: toOptionalFiniteNumber(input.nextDueAmount),
    endsOn: toOptionalDateString(input.endsOn),
    // Ausente = sin evidencia de calendario incompleto; no se alarma sin dato.
    scheduleComplete: input.scheduleComplete !== false
  };
}

function normalizeProjectionTrend(input: unknown): DashboardProjectionTrend {
  const source = isRecord(input) ? input : {};

  return {
    sampleMonths: toOptionalInt(source.sampleMonths) ?? 0,
    monthlyNetSlope: toFiniteNumber(source.monthlyNetSlope),
    projectedMonthlyNet: toFiniteNumber(source.projectedMonthlyNet),
    hasSufficientHistory: source.hasSufficientHistory === true
  };
}

function normalizeDeviationMonths(input: unknown): string[] {
  return Array.isArray(input)
    ? input.map((value) => toOptionalMonthString(value)).filter((value): value is string => value !== null)
    : [];
}

function emptyProjectionDeviation(): DashboardProjectionDeviation {
  return {
    windowMonths: [],
    sampledMonths: [],
    sampleSize: 0,
    requiredSampleSize: 0,
    hasSufficientSample: false,
    monthlyAdjustment: 0,
    incomeDeviation: 0,
    expenseDeviation: 0,
    unplannedDeviation: 0
  };
}

function normalizeProjectionDeviation(input: unknown): DashboardProjectionDeviation {
  if (!isRecord(input)) {
    // Payload legacy: no hay procedencia de desviación, así que el escenario ajustado
    // no puede presentarse como soportado.
    return emptyProjectionDeviation();
  }

  const sampleSize = toOptionalInt(input.sampleSize) ?? 0;
  const requiredSampleSize = toOptionalInt(input.requiredSampleSize) ?? 0;
  // Se exige que el backend lo declare Y que la muestra cubra el requisito: un payload antiguo
  // sin `requiredSampleSize` no habilita el ajuste.
  const hasSufficientSample =
    input.hasSufficientSample === true && requiredSampleSize > 0 && sampleSize >= requiredSampleSize;

  return {
    windowMonths: normalizeDeviationMonths(input.windowMonths),
    sampledMonths: normalizeDeviationMonths(input.sampledMonths),
    sampleSize,
    requiredSampleSize,
    hasSufficientSample,
    // Sin muestra suficiente no hay desviación conocida: nunca se muestran importes como reales.
    monthlyAdjustment: hasSufficientSample ? toFiniteNumber(input.monthlyAdjustment) : 0,
    incomeDeviation: hasSufficientSample ? toFiniteNumber(input.incomeDeviation) : 0,
    expenseDeviation: hasSufficientSample ? toFiniteNumber(input.expenseDeviation) : 0,
    unplannedDeviation: hasSufficientSample ? toFiniteNumber(input.unplannedDeviation) : 0
  };
}

export function normalizeDashboardProjection(input: unknown): DashboardProjectionResponse {
  const source = isRecord(input) ? input : {};
  const months = normalizeCollection(source.months, normalizeProjectionMonth);
  const horizonMonths = toOptionalInt(source.horizonMonths);

  return {
    asOfDate: toOptionalDateString(source.asOfDate),
    timezone: typeof source.timezone === "string" && source.timezone.trim().length > 0 ? source.timezone : "America/Mexico_City",
    horizonMonths: horizonMonths !== null && horizonMonths > 0 ? horizonMonths : months.length,
    cashRealBalance: toFiniteNumber(source.cashRealBalance),
    historicalMonths: normalizeCollection(source.historicalMonths, normalizeProjectionHistoricalMonth),
    trend: normalizeProjectionTrend(source.trend),
    months,
    msiPlans: normalizeCollection(source.msiPlans, normalizeProjectionMsiPlan),
    deviation: normalizeProjectionDeviation(source.deviation)
  };
}
