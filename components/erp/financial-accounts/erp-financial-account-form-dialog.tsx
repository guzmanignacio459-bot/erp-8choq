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
  displayName: string;
  ratePercent: string;
  color: string;
};

const DEFAULT_FORM: FormState = {
  name: "",
  displayName: "",
  ratePercent: "0",
  color: "#6366f1",
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
        displayName: account.displayName ?? "",
        ratePercent: String(account.ratePercent),
        color: account.color,
      });
    } else {
      setForm(DEFAULT_FORM);
    }
  }, [open, mode, account]);

  if (!open) return null;

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const ratePercent = Number(form.ratePercent);
    const displayName = form.displayName.trim() || null;
    if (mode === "create") {
      await onSubmit({
        name: form.name,
        displayName,
        ratePercent: Number.isFinite(ratePercent) ? ratePercent : 0,
        color: form.color,
      });
    } else {
      await onSubmit({
        name: form.name,
        displayName,
        ratePercent: Number.isFinite(ratePercent) ? ratePercent : 0,
        color: form.color,
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
              placeholder="Ej. Santander"
            />
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="fa-display-name">
              Nombre display{" "}
              <span className="font-normal text-[hsl(var(--erp-fg-muted))]">(opcional)</span>
            </Label>
            <Input
              id="fa-display-name"
              value={form.displayName}
              onChange={(e) => setForm((f) => ({ ...f, displayName: e.target.value }))}
              placeholder="Ej. Sueldos, Impuestos"
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

          <p className="text-xs text-[hsl(var(--erp-fg-muted))]">
            La cuenta destino se elige con &quot;Activar&quot; en la tabla. Solo puede haber una
            activa a la vez.
          </p>

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
