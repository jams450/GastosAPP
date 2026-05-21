import type { AdminUser } from "@/lib/contracts/users-admin";
import { UsersMobileList } from "./users-mobile-list";
import { UsersTable } from "./users-table";

type Props = {
  rows: AdminUser[];
  loading: boolean;
  onEdit: (user: AdminUser) => void;
  onToggleActive: (user: AdminUser) => void;
  onDelete: (user: AdminUser) => void;
};

export function UsersResults({ rows, loading, onEdit, onToggleActive, onDelete }: Props) {
  return (
    <>
      <UsersMobileList rows={rows} loading={loading} onEdit={onEdit} onToggleActive={onToggleActive} onDelete={onDelete} />
      <div className="hidden md:block">
        <UsersTable rows={rows} loading={loading} onEdit={onEdit} onToggleActive={onToggleActive} onDelete={onDelete} />
      </div>
    </>
  );
}
