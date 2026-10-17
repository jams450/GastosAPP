import type { Account } from "@/lib/contracts/accounts";
import { buildAccountsCatalogSections, type AccountsCatalogSection } from "../_lib/accounts-ui";
import { AccountsMobileList } from "./accounts-mobile-list";
import { AccountsTable } from "./accounts-table";

type Props = {
  rows: Account[];
  loading: boolean;
  errorMessage?: string | null;
  onEdit: (account: Account) => void;
  onToggleActive: (account: Account) => void;
};

/**
 * Estado de carga/error: una sola tarjeta para no duplicar esqueletos mientras no hay secciones.
 */
const STATUS_SECTION: AccountsCatalogSection = {
  key: "cash",
  title: "Cuentas",
  accounts: [],
  metrics: ["currentBalance", "initialBalance"]
};

export function AccountsResults({ rows, loading, errorMessage, onEdit, onToggleActive }: Props) {
  if (loading || errorMessage) {
    return (
      <section aria-busy={loading}>
        <AccountsMobileList
          section={STATUS_SECTION}
          loading={loading}
          errorMessage={errorMessage}
          onEdit={onEdit}
          onToggleActive={onToggleActive}
        />
        <div className="hidden md:block">
          <AccountsTable
            section={STATUS_SECTION}
            loading={loading}
            errorMessage={errorMessage}
            onEdit={onEdit}
            onToggleActive={onToggleActive}
          />
        </div>
      </section>
    );
  }

  const sections = buildAccountsCatalogSections(rows);

  return (
    <section aria-busy={false} className="space-y-6">
      {sections.map((section) => (
        <section key={section.key} aria-label={`Cuentas de ${section.title.toLowerCase()}`} className="space-y-2">
          <div className="flex items-baseline justify-between gap-2">
            <h2 className="text-primary m-0 text-sm font-extrabold uppercase tracking-wide">{section.title}</h2>
            <span className="text-muted text-xs font-semibold tabular-nums">
              {section.accounts.length} {section.accounts.length === 1 ? "cuenta" : "cuentas"}
            </span>
          </div>

          <AccountsMobileList
            section={section}
            loading={false}
            errorMessage={null}
            onEdit={onEdit}
            onToggleActive={onToggleActive}
          />
          <div className="hidden md:block">
            <AccountsTable
              section={section}
              loading={false}
              errorMessage={null}
              onEdit={onEdit}
              onToggleActive={onToggleActive}
            />
          </div>
        </section>
      ))}
    </section>
  );
}
