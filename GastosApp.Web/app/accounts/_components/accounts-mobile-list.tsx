import type { Account } from "@/lib/contracts/accounts";
import { formatCurrency } from "@/lib/format/currency";
import { AlertCircle, Inbox } from "lucide-react";
import { getAccountStatusBadgeClass, getAccountStatusLabel, getAccountTypeBadgeClass, getAccountTypeLabel } from "../_lib/accounts-ui";
import { AccountActionsMenu } from "./account-actions-menu";

type Props = {
  rows: Account[];
  loading: boolean;
  errorMessage?: string | null;
  onEdit: (account: Account) => void;
  onToggleActive: (account: Account) => void;
};

export function AccountsMobileList({ rows, loading, errorMessage, onEdit, onToggleActive }: Props) {
  if (loading) {
    return (
      <div className="space-y-2.5 md:hidden" role="status" aria-live="polite" aria-label="Cargando cuentas">
        {Array.from({ length: 3 }).map((_, index) => (
          <div key={index} className="animate-pulse p-3">
            <div className="h-3 w-28 rounded-none bg-zinc-800" />
            <div className="mt-2 h-2.5 w-44 rounded-none bg-zinc-800" />
            <div className="mt-3 h-8 rounded-none bg-zinc-800" />
          </div>
        ))}
      </div>
    );
  }

  if (errorMessage) {
    return (
      <div className="border-rose-300 bg-rose-50 p-4 text-rose-800 dark:border-rose-900/60 dark:bg-rose-950/30 dark:text-rose-300 md:hidden" role="alert" aria-live="assertive">
        <div className="flex items-start gap-2">
          <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
          <div>
            <p className="text-sm font-bold">Error al cargar cuentas</p>
            <p className="mt-1 text-xs font-medium">{errorMessage}</p>
          </div>
        </div>
      </div>
    );
  }

  if (rows.length === 0) {
    return (
      <div className="border-dashed border-zinc-700 bg-zinc-900 px-3 py-8 text-center md:hidden" role="status" aria-live="polite">
        <Inbox className="mx-auto h-6 w-6 text-zinc-400" aria-hidden="true" />
        <p className="mt-2 text-sm font-bold text-zinc-200">Sin resultados</p>
        <p className="mt-1 text-xs text-zinc-400">No hay cuentas con filtros actuales.</p>
      </div>
    );
  }

  return (
    <div className="space-y-3 md:hidden">
      {rows.map((account) => (
        <article key={account.accountId} className="p-3">
          <header className="flex items-start justify-between gap-2 pb-2">
            <div>
              <p className="text-sm font-extrabold text-zinc-100">{account.name}</p>
              <p className="text-xs text-zinc-400">Saldo: {formatCurrency(account.currentBalance)}</p>
            </div>
            <span className="sr-only">Cuenta activa para acciones rápidas</span>
          </header>

          <div className="flex flex-wrap items-center gap-2 py-2">
            <span className={getAccountTypeBadgeClass(account)}>{getAccountTypeLabel(account)}</span>
            <span className={getAccountStatusBadgeClass(account)}>{getAccountStatusLabel(account)}</span>
            <span className="tabler-badge tabler-badge-solid tabler-badge-muted">Inicial {formatCurrency(account.initialBalance)}</span>
          </div>

          <footer>
            <AccountActionsMenu account={account} mobile onEdit={onEdit} onToggleActive={onToggleActive} />
          </footer>
        </article>
      ))}
    </div>
  );
}
