import { ArrowLeftRight, Home, PiggyBank, Tags, Users, Wallet } from "lucide-react";

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

export const appNavItems: readonly NavItem[] = [
  { href: "/dashboard", label: "Dashboard", icon: Home },
  { href: "/accounts", label: "Cuentas", icon: Wallet },
  { href: "/budgets", label: "Presupuestos", icon: PiggyBank },
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
      { href: "/catalogs/billable-parties", label: "Responsables cobrables" }
    ]
  },
  { href: "/users", label: "Usuarios", icon: Users }
];

export function isRouteActive(pathname: string, href: string) {
  return pathname === href || pathname.startsWith(`${href}/`);
}
