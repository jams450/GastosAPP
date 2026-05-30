import { ArrowLeftRight, Home, Tags, Users, Wallet } from "lucide-react";

type NavChild = {
  href: string;
  label: string;
};

type NavItem = {
  href: string;
  label: string;
  icon: typeof Home;
  children?: NavChild[];
};

export const appNavItems: NavItem[] = [
  { href: "/dashboard", label: "Dashboard", icon: Home },
  { href: "/accounts", label: "Cuentas", icon: Wallet },
  {
    href: "/transactions",
    label: "Transacciones",
    icon: ArrowLeftRight,
    children: [
      { href: "/transactions/income", label: "Ingreso" },
      { href: "/transactions/expense", label: "Gasto" },
      { href: "/transactions/transfers", label: "Transferencia" },
      { href: "/transactions/credit", label: "Historial" }
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
