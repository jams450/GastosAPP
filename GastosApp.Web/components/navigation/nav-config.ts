import { ArrowLeftRight, Filter, FlaskConical, FolderTree, Home, Landmark, PiggyBank, Tags, Users, Wallet } from "lucide-react";

export type NavChild = {
  readonly href: string;
  readonly label: string;
};

export type NavItem = {
  readonly href: string;
  readonly label: string;
  readonly icon: typeof Home;
  readonly children?: readonly NavChild[];
};

export type NavSection = {
  readonly id: string;
  readonly label: string;
  readonly items: readonly NavItem[];
};

/**
 * El menú se agrupa por dominio, no por tipo de pantalla: «Gastos» es el dinero y «Correo» es la
 * captura automática. Las pantallas de correo viven en `/mail/*` y no bajo `/catalogs/*` justamente
 * para que la URL diga a qué dominio pertenece, aunque la pantalla reutilice los mismos componentes.
 */
export const appNavSections: readonly NavSection[] = [
  {
    id: "gastos",
    label: "Gastos",
    items: [
      { href: "/dashboard", label: "Dashboard", icon: Home },
      { href: "/accounts", label: "Cuentas", icon: Wallet },
      { href: "/budgets", label: "Presupuestos", icon: PiggyBank },
      { href: "/investments", label: "Inversiones", icon: Landmark },
      {
        href: "/transactions",
        label: "Transacciones",
        icon: ArrowLeftRight,
        children: [
          { href: "/transactions/income", label: "Ingreso" },
          { href: "/transactions/expense", label: "Gasto" },
          { href: "/transactions/transfers", label: "Transferencia" },
          { href: "/transactions/history", label: "Historial" }
        ]
      },
      {
        href: "/catalogs",
        label: "Catálogos",
        icon: Tags,
        children: [
          { href: "/catalogs/categories", label: "Categorías" },
          { href: "/catalogs/subcategories", label: "Subcategorías" },
          { href: "/catalogs/merchants", label: "Comercios" },
          { href: "/catalogs/tags", label: "Tags" },
          { href: "/catalogs/billable-parties", label: "Responsables cobrables" },
          { href: "/catalogs/recurring-items", label: "Programadas" },
          { href: "/catalogs/currencies", label: "Monedas" }
        ]
      },
      { href: "/users", label: "Usuarios", icon: Users }
    ]
  },
  {
    id: "correo",
    label: "Correo",
    items: [
      { href: "/mail/labels", label: "Etiquetas", icon: FolderTree },
      { href: "/mail/rules", label: "Reglas", icon: Filter },
      { href: "/mail/test", label: "Módulo de prueba", icon: FlaskConical }
    ]
  }
];

/** Lista plana de todos los ítems, para cálculos que no dependen de la sección. */
export const appNavItems: readonly NavItem[] = appNavSections.flatMap((section) => section.items);

export function isRouteActive(pathname: string, href: string) {
  return pathname === href || pathname.startsWith(`${href}/`);
}
