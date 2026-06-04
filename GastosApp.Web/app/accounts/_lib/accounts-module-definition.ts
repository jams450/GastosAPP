export const ACCOUNTS_MODULE_META = {
  section: "Administración",
  title: "Cuentas",
  phase0: {
    scope: ["app/accounts/**", "lib/contracts/accounts.ts", "lib/contracts/accounts-admin.ts"],
    excludes: ["app/api/**", "lib/bff/**", "backend/**"],
    successCriteria: [
      "Mantener UI/CSS actual",
      "Mantener flujo CRUD/filtros/toggle",
      "Reducir accounts-client.tsx a orquestador",
      "Desacoplar capa API y hooks por dominio"
    ]
  }
} as const;

export const ACCOUNTS_FILTER_DEFAULTS = {
  search: "",
  status: "all",
  type: "all"
} as const;

export type AccountsResponsibilityTarget =
  | "app/accounts/_lib/accounts-api.ts"
  | "app/accounts/_hooks/use-accounts-admin.ts"
  | "app/accounts/_hooks/use-accounts-filters.ts"
  | "app/accounts/_hooks/use-account-form.ts"
  | "app/accounts/accounts-client.tsx";

export type AccountsResponsibilityMapItem = {
  name: string;
  currentLocation: string;
  target: AccountsResponsibilityTarget;
  notes?: string;
};

export const ACCOUNTS_PHASE1_RESPONSIBILITY_MAP: readonly AccountsResponsibilityMapItem[] = [
  {
    name: "Load/reload de cuentas",
    currentLocation: "accounts-client.tsx::loadAccounts + useEffect inicial",
    target: "app/accounts/_hooks/use-accounts-admin.ts"
  },
  {
    name: "Filtros y derivación de resultados",
    currentLocation: "accounts-client.tsx::search/status/type + filtered + resetFilters",
    target: "app/accounts/_hooks/use-accounts-filters.ts"
  },
  {
    name: "Estado y acciones de formulario",
    currentLocation: "accounts-client.tsx::openForm/editing/form/errors/submitting",
    target: "app/accounts/_hooks/use-account-form.ts",
    notes: "Preservar regla de limpieza al cambiar isCredit=false"
  },
  {
    name: "Mutaciones HTTP create/update/toggle",
    currentLocation: "accounts-client.tsx::csrfFetch POST/PUT/PATCH",
    target: "app/accounts/_lib/accounts-api.ts"
  },
  {
    name: "Orquestación visual",
    currentLocation: "accounts-client.tsx::render AdminShell/Toolbar/Results/Drawer",
    target: "app/accounts/accounts-client.tsx"
  }
] as const;

export const ADMIN_MODULE_TEMPLATE = {
  structure: {
    page: "app/<module>/page.tsx",
    client: "app/<module>/<module>-client.tsx",
    hooks: [
      "app/<module>/_hooks/use-<module>-admin.ts",
      "app/<module>/_hooks/use-<module>-filters.ts",
      "app/<module>/_hooks/use-<entity>-form.ts",
      "app/<module>/_hooks/use-<module>-toasts.ts"
    ],
    api: "app/<module>/_lib/<module>-api.ts",
    components: "app/<module>/_components/*",
    contracts: [
      "lib/contracts/<module>.ts",
      "lib/contracts/<module>-admin.ts"
    ]
  },
  conventions: {
    pageGuard: ["redirect login if no session", "redirect dashboard if role != admin"],
    clientRole: "Solo orquestación de hooks + wiring UI",
    apiRole: "Solo HTTP + parseApiError + csrfFetch en mutaciones",
    contractsRole: ["normalize*", "to*Payload", "validate*"],
    uxRole: "Toasts para feedback global; submitError local en drawer"
  },
  smokeChecklist: [
    "Carga listado",
    "Filtros search/status/type",
    "Create",
    "Edit",
    "Toggle active",
    "Feedback toast success/error",
    "Responsive mobile/desktop"
  ]
} as const;
