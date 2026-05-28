import type { Account } from "@/lib/contracts/accounts";
import { AccountsTable } from "./accounts-table";

type Props = {
  rows: Account[];
  loading: boolean;
  onEdit: (account: Account) => void;
  onToggleActive: (account: Account) => void;
};

export function AccountsResults({ rows, loading, onEdit, onToggleActive }: Props) {
  return (
    <section className="p-3 sm:p-4">
      <AccountsTable rows={rows} loading={loading} onEdit={onEdit} onToggleActive={onToggleActive} />
    </section>
  );
}
