export const TRANSACTIONS_SPLIT_PLAN = {
  phase0: {
    targetScreens: [
      { key: "income", route: "/transactions/income", label: "Ingresos" },
      { key: "expense", route: "/transactions/expense", label: "Gastos" },
      { key: "transfers", route: "/transactions/transfers", label: "Transferencias" },
      { key: "credit", route: "/transactions/credit", label: "Crédito" }
    ],
    compatibilityRoute: "/transactions?view=create&kind=expense"
  },
  phase1: {
    sourceFile: "app/transactions/transactions-client.tsx",
    blockToTarget: [
      { block: "IncomeSection + income submit", target: "/transactions/income" },
      { block: "ExpenseSection + expense allocations/msi", target: "/transactions/expense" },
      { block: "TransferSection + swap accounts", target: "/transactions/transfers" },
      { block: "Credit allocation flow + apply payment modal", target: "/transactions/credit" },
      { block: "HistorySection + edit modals", target: "shared (mantener temporal)" }
    ]
  },
  phase2: {
    routingStrategy: "alias-routes-to-monolith",
    note: "Rutas nuevas redirigen temporalmente a /transactions con query params hasta separar clients por pantalla"
  },
  phase5: {
    compatibilityRoute: "/transactions/legacy",
    note: "Mantener acceso al flujo monolítico completo mientras se migra pantalla por pantalla"
  }
} as const;
