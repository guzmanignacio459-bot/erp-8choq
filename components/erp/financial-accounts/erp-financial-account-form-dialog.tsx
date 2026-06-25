"use client";

import { useEffect, useState } from "react";
import { X } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import type {
  V2FinancialAccountCreateInput,
  V2FinancialAccountRow,
  V2FinancialAccountUpdateInput,
} from "@/types/erp-v2-financial-accounts";

type FormState = {
  name: string;
  ratePercent: string;
  color: string;
  isDefault: boolean;
};

const DEFAULT_FORM: FormState = {
  name: "",
  ratePercent: "0",
  color: "#6366f1",
  isDefault: false,
};

type Props = {
  open: boolean;
  mode: "create" | "edit";
  account: V2FinancialAccountRow | null;
  onClose: () => void;
  onSubmit: (
    payload: V2FinancialAccountCreateInput | V2FinancialAccountUpdateInput
  ) => Promise<void>;
  submitting: boolean;
};

export function ErpFinancialAccountFormDialog({
  open,
  mode,
  account,
  onClose,
  onSubmit,
  submitting,
}: Props) {
  const [form, setForm] = useState<FormState>(DEFAULT_FORM);

  useEffect(() => {
    if (!open) return;
    if (mode === "edit" && account) {
      setForm({
        name: account.name,
        ratePercent: String(account.ratePercent),
        color: account.color,
        isDefault: account.isDefault,
      });
    } else {
      setForm(DEFAULT_FORM);
    }
  }, [open, mode, account]);

  if (!open) return null;

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const ratePercent = Number(form.ratePercent);
    if (mode === "create") {
      await onSubmit({
        name: form.name,
        ratePercent: Number.isFinite(ratePercent) ? ratePercent : 0,
        color: form.color,
        isDefault: form.isDefault,
      });
    } else {
      await onSubmit({
        name: form.name,
        ratePercent: Number.isFinite(ratePercent) ? ratePercent : 0,
        color: form.color,
        isDefault: form.isDefault,
      });
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
      <div
        className="erp-card w-full max-w-md"
        role="dialog"
        aria-modal="true"
        aria-labelledby="fa-form-title"
      >
        <div className="mb-4 flex items-center justify-between">
          <h2 id="fa-form-title" className="text-lg font-semibold text-[hsl(var(--erp-fg))]">
            {mode === "create" ? "Nueva cuenta" : "Editar cuenta"}
          </h2>
          <button
            type="button"
            onClick={onClose}
            className="rounded p-1 text-[hsl(var(--erp-fg-muted))] hover:bg-[hsl(var(--erp-bg-hover))]"
            aria-label="Cerrar"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-1.5">
            <Label htmlFor="fa-name">Nombre</Label>
            <Input
              id="fa-name"
              value={form.name}
              onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
              required
              placeholder="Ej. Mercado Pago ARS"
            />
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="fa-rate">Tasa %</Label>
            <Input
              id="fa-rate"
              type="number"
              min={0}
              max={100}
              step={0.01}
              value={form.ratePercent}
              onChange={(e) => setForm((f) => ({ ...f, ratePercent: e.target.value }))}
            />
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="fa-color">Color</Label>
            <div className="flex gap-2">
              <Input
                id="fa-color"
                type="color"
                value={form.color}
                onChange={(e) => setForm((f) => ({ ...f, color: e.target.value }))}
                className="h-10 w-14 cursor-pointer p-1"
              />
              <Input
                value={form.color}
                onChange={(e) => setForm((f) => ({ ...f, color: e.target.value }))}
                placeholder="#6366f1"
              />
            </div>
          </div>

          <label className="flex items-center gap-2 text-sm text-[hsl(var(--erp-fg))]">
            <input
              type="checkbox"
              checked={form.isDefault}
              onChange={(e) => setForm((f) => ({ ...f, isDefault: e.target.checked }))}
              className="rounded border-[hsl(var(--erp-border))]"
            />
            Cuenta por defecto
          </label>

          <div className="flex justify-end gap-2 pt-2">
            <Button type="button" variant="ghost" onClick={onClose} disabled={submitting}>
              Cancelar
            </Button>
            <Button type="submit" disabled={submitting || !form.name.trim()}>
              {submitting ? "Guardando…" : mode === "create" ? "Crear" : "Guardar"}
            </Button>
          </div>
        </form>
      </div>
    </div>
  );
}
