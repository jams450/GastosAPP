export const CATALOGS_MODULE_TEMPLATE = {
  scope: {
    include: [
      "app/catalogs/<entity>/**",
      "app/catalogs/_shared/**",
      "lib/contracts/<entity>.ts"
    ],
    exclude: ["app/api/**", "lib/bff/**", "backend/**"]
  },
  pageGuard: {
    unauthenticatedRedirect: "/login",
    unauthorizedRedirect: "/dashboard",
    requiredRole: "admin"
  },
  clientPattern: {
    shell: "CatalogSingleScreenClient",
    requiredProps: ["username", "title", "subtitle?", "loadData", "renderSection"],
    feedback: "CatalogToastStack + useCatalogToasts"
  },
  sectionPattern: {
    sectionStateHook: "useCatalogSectionState",
    apiAccess: "requestJson en helpers create/update/toggle",
    formMode: "Drawer/Modal local con submitError local",
    listMode: "DataGrid + SectionFilterBar + CatalogActionButton"
  },
  smokeChecklist: [
    "Carga listado",
    "Filtro búsqueda",
    "Filtro estado",
    "Filtro extra por entidad",
    "Crear",
    "Editar",
    "Activar/Desactivar",
    "Toast éxito/error",
    "Responsive"
  ],
  technicalChecklist: [
    "pnpm run lint",
    "pnpm run build"
  ]
} as const;
