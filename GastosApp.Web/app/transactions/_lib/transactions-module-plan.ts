import type { TransactionKind, ViewMode } from "../_lib/transactions-types";

export const TRANSACTIONS_MODULE_PLAN = {
  phase0: {
    scope: {
      include: [
        "app/transactions/**"
      ],
      exclude: [
        "app/api/**",
        "lib/bff/**",
        "backend/**"
      ]
    },
    goals: [
      "Separar transacciones en 4 pantallas individuales",
      "Mantener /transactions/legacy temporal",
      "Mover lógica por pantalla de forma incremental"
    ]
  },
  fixedScreens: {
    income: { kind: "income", viewMode: "create" },
    expense: { kind: "expense", viewMode: "create" },
    transfers: { kind: "transfer", viewMode: "create" },
    history: { kind: "expense", viewMode: "history" }
  }
} as const;

export type FixedTransactionsScreenConfig = {
  fixedKind: TransactionKind;
  fixedViewMode: ViewMode;
};
