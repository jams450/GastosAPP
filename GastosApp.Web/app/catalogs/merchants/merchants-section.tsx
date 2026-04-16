import type { ColumnDef } from "@tanstack/react-table";
import { useState } from "react";
import type { FormEvent } from "react";
import { DataGrid } from "@/components/data-grid/data-grid";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import type { Merchant } from "@/lib/contracts/merchants";
import { requestJson } from "../_shared/catalogs-api";
import { rowActionButtonClass } from "../_shared/action-button-style";
import { SectionCard } from "../_shared/section-card";
import { StatusBadge } from "../_shared/status-badge";

type Props = {
  merchants: Merchant[];
  expanded: boolean;
  onToggle: () => void;
  onCatalogChanged: () => Promise<void>;
  onError: (message: string | null) => void;
  onSuccess: (message: string) => void;
};

type MerchantFormState = {
  id: number | null;
  name: string;
  active: boolean;
};

function emptyMerchantForm(): MerchantFormState {
  return { id: null, name: "", active: true };
}

export function MerchantsSection({ merchants, expanded, onToggle, onCatalogChanged, onError, onSuccess }: Props) {
  const [saving, setSaving] = useState(false);
  const [merchantModalOpen, setMerchantModalOpen] = useState(false);
  const [merchantForm, setMerchantForm] = useState<MerchantFormState>(emptyMerchantForm());

  function openCreateMerchantModal() {
    setMerchantForm(emptyMerchantForm());
    setMerchantModalOpen(true);
    onError(null);
  }

  function openEditMerchantModal(merchant: Merchant) {
    setMerchantForm({ id: merchant.merchantId, name: merchant.name, active: merchant.active });
    setMerchantModalOpen(true);
    onError(null);
  }

  async function submitMerchant(event: FormEvent) {
    event.preventDefault();

    setSaving(true);
    onError(null);
    try {
      const payload = {
        name: merchantForm.name,
        active: merchantForm.active
      };

      if (merchantForm.id) {
        await requestJson(
          `/api/bff/catalogs/merchants/${merchantForm.id}`,
          { method: "PUT", body: JSON.stringify(payload) },
          "No se pudo actualizar el comercio"
        );
        onSuccess("Comercio actualizado correctamente.");
      } else {
        await requestJson("/api/bff/catalogs/merchants", { method: "POST", body: JSON.stringify(payload) }, "No se pudo crear el comercio");
        onSuccess("Comercio creado correctamente.");
      }

      setMerchantModalOpen(false);
      await onCatalogChanged();
    } catch (err) {
      onError(err instanceof Error ? err.message : "No se pudo guardar el comercio");
    } finally {
      setSaving(false);
    }
  }

  async function toggleMerchantActive(merchant: Merchant) {
    setSaving(true);
    onError(null);
    try {
      await requestJson(
        `/api/bff/catalogs/merchants/${merchant.merchantId}/active`,
        { method: "PATCH", body: JSON.stringify({ active: !merchant.active }) },
        "No se pudo actualizar el estado del comercio"
      );
      onSuccess(`Comercio ${!merchant.active ? "activado" : "desactivado"}.`);
      await onCatalogChanged();
    } catch (err) {
      onError(err instanceof Error ? err.message : "No se pudo actualizar el comercio");
    } finally {
      setSaving(false);
    }
  }

  const merchantColumns: ColumnDef<Merchant>[] = [
    { accessorKey: "name", header: "Nombre" },
    {
      accessorKey: "active",
      header: "Estado",
      cell: ({ row }) => <StatusBadge active={row.original.active} />
    },
    {
      id: "actions",
      header: "Acciones",
      enableSorting: false,
      cell: ({ row }) => {
        const merchant = row.original;
        return (
          <div className="flex items-center gap-1.5">
            <Button type="button" variant="secondary" className={rowActionButtonClass} onClick={() => openEditMerchantModal(merchant)}>
              Editar
            </Button>
            <Button
              type="button"
              variant={merchant.active ? "danger" : "secondary"}
              className={rowActionButtonClass}
              onClick={() => void toggleMerchantActive(merchant)}
              disabled={saving}
            >
              {merchant.active ? "Desactivar" : "Activar"}
            </Button>
          </div>
        );
      }
    }
  ];

  return (
    <>
      <SectionCard title="Comercios" count={merchants.length} expanded={expanded} onToggle={onToggle} onCreate={openCreateMerchantModal}>
        <DataGrid columns={merchantColumns} rows={merchants} density="compact" emptyMessage="Sin comercios" initialSorting={[{ id: "name", desc: false }]} />
      </SectionCard>

      {merchantModalOpen ? (
        <div className="fixed inset-0 z-50 grid place-items-center bg-slate-900/50 p-4">
          <Card className="w-full max-w-lg p-1">
            <form className="space-y-4" onSubmit={(event) => void submitMerchant(event)}>
              <h3 className="text-lg font-semibold text-slate-900 dark:text-slate-100">{merchantForm.id ? "Editar comercio" : "Nuevo comercio"}</h3>
              <Input label="Nombre" value={merchantForm.name} onChange={(event) => setMerchantForm((current) => ({ ...current, name: event.target.value }))} required />
              <label className="flex items-center gap-2 text-sm text-slate-700 dark:text-slate-300">
                <input
                  type="checkbox"
                  checked={merchantForm.active}
                  onChange={(event) => setMerchantForm((current) => ({ ...current, active: event.target.checked }))}
                />
                Activo
              </label>
              <div className="flex justify-end gap-2">
                <Button type="button" variant="secondary" onClick={() => setMerchantModalOpen(false)}>
                  Cancelar
                </Button>
                <Button type="submit" loading={saving} loadingText="Guardando...">
                  Guardar
                </Button>
              </div>
            </form>
          </Card>
        </div>
      ) : null}
    </>
  );
}
