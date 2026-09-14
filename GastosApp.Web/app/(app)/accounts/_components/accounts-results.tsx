import type { Account } from "@/lib/contracts/accounts";
import { AccountsMobileList } from "./accounts-mobile-list";
import { AccountsTable } from "./accounts-table";

type Props = {
  rows: Account[];
  loading: boolean;
  errorMessage?: string | null;
  onEdit: (account: Account) => void;
  onToggleActive: (account: Account) => void;
};

export function AccountsResults({ rows, loading, errorMessage, onEdit, onToggleActive }: Props) {
  return (
    <section className="p-3 sm:p-4" aria-busy={loading}>
      <AccountsMobileList rows={rows} loading={loading} errorMessage={errorMessage} onEdit={onEdit} onToggleActive={onToggleActive} />
      <div className="hidden md:block">
        <AccountsTable rows={rows} loading={loading} errorMessage={errorMessage} onEdit={onEdit} onToggleActive={onToggleActive} />
      </div>
    </section>
  );
}
