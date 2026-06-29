"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { CheckCircle2, Plus, RefreshCw, Wallet, X } from "lucide-react";

import { ErpFinancialAccountsAssignmentKpiGrid } from "@/components/erp/financial-accounts/erp-financial-accounts-assignment-kpi-grid";
import { ErpFinancialAccountFormDialog } from "@/components/erp/financial-accounts/erp-financial-account-form-dialog";
import { ErpFinancialAccountsBalanceChart } from "@/components/erp/financial-accounts/erp-financial-accounts-balance-chart";
import { ErpFinancialAccountsKpiGrid } from "@/components/erp/financial-accounts/erp-financial-accounts-kpi-grid";
import { ErpFinancialAccountsRecentAssignmentsTable } from "@/components/erp/financial-accounts/erp-financial-accounts-recent-assignments-table";
import { ErpFinancialAccountsTable } from "@/components/erp/financial-accounts/erp-financial-accounts-table";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { createFetchGuard, isAbortError } from "@/lib/erp/fetch-guard";
import type {
  V2FinancialAccountCreateInput,
  V2FinancialAccountRow,
  V2FinancialAccountUpdateInput,
  V2FinancialAccountsKpi,
} from "@/types/erp-v2-financial-accounts";
import type {
  V2FinancialAccountAssignmentRow,
  V2FinancialAccountsDashboardResponse,
  V2TransferAssignmentKpi,
} from "@/types/erp-v2-financial-account-assignments";

export function ErpFinancialAccountsDashboard() {
  const fetchGuardRef = useRef(createFetchGuard());
  const [accounts, setAccounts] = useState<V2FinancialAccountRow[]>([]);
  const [kpi, setKpi] = useState<V2FinancialAccountsKpi | null>(null);
  const [assignmentKpi, setAssignmentKpi] = useState<V2TransferAssignmentKpi | null>(null);
  const [recentAssignments, setRecentAssignments] = useState<V2FinancialAccountAssignmentRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);
  const [fetchedAt, setFetchedAt] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [formOpen, setFormOpen] = useState(false);
  const [formMode, setFormMode] = useState<"create" | "edit">("create");
  const [editAccount, setEditAccount] = useState<V2FinancialAccountRow | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const load = useCallback(async () => {
    const guard = fetchGuardRef.current;
    const { reqId, signal } = guard.begin();
    setLoading(true);
    setLoadError(null);
    try {
      const res = await fetch("/api/v2/financial-accounts", {
        cache: "no-store",
        signal,
      });
      const json = (await res.json()) as V2FinancialAccountsDashboardResponse;

      if (!guard.isCurrent(reqId)) return;

      if (!res.ok || !json.ok) {
        throw new Error(json.error ?? `HTTP ${res.status}`);
      }
      setAccounts(json.data ?? []);
      setKpi(json.kpi ?? null);
      setAssignmentKpi(json.assignments ?? null);
      setRecentAssignments(json.recentAssignments ?? []);
      setFetchedAt(json.fetchedAt ?? null);
    } catch (err: unknown) {
      if (isAbortError(err)) return;
      if (!guard.isCurrent(reqId)) return;
      setLoadError(err instanceof Error ? err.message : String(err));
      setAccounts([]);
      setKpi(null);
      setAssignmentKpi(null);
      setRecentAssignments([]);
    } finally {
      if (guard.isCurrent(reqId)) setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
    return () => fetchGuardRef.current.cancel();
  }, [load]);

  useEffect(() => {
    if (!successMessage) return;
    const t = setTimeout(() => setSuccessMessage(null), 5000);
    return () => clearTimeout(t);
  }, [successMessage]);

  function openCreate() {
    setActionError(null);
    setFormMode("create");
    setEditAccount(null);
    setFormOpen(true);
  }

  function openEdit(account: V2FinancialAccountRow) {
    setActionError(null);
    setFormMode("edit");
    setEditAccount(account);
    setFormOpen(true);
  }

  async function handleFormSubmit(
    payload: V2FinancialAccountCreateInput | V2FinancialAccountUpdateInput
  ) {
    setSubmitting(true);
    setActionError(null);
    try {
      const url =
        formMode === "create"
          ? "/api/v2/financial-accounts"
          : `/api/v2/financial-accounts/${editAccount?.id}`;
      const method = formMode === "create" ? "POST" : "PATCH";
      const res = await fetch(url, {
        method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const json = await res.json();
      if (!json.ok) {
        setActionError(json.error ?? "Error al guardar");
        return;
      }
      setFormOpen(false);
      setSuccessMessage(
        formMode === "create" ? "Cuenta creada correctamente." : "Cuenta actualizada."
      );
      await load();
    } catch (err) {
      setActionError(err instanceof Error ? err.message : String(err));
    } finally {
      setSubmitting(false);
    }
  }

  async function handleActivate(account: V2FinancialAccountRow) {
    if (
      !confirm(
        `¿Activar "${account.name}" como cuenta destino? Las demás cuentas pasarán a inactivas.`
      )
    ) {
      return;
    }
    setBusyId(account.id);
    setActionError(null);
    setSuccessMessage(null);
    try {
      const res = await fetch(`/api/v2/financial-accounts/${account.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ isActive: true }),
      });
      const json = await res.json();
      if (!json.ok) {
        setActionError(json.error ?? "Error al activar la cuenta");
        return;
      }
      setSuccessMessage(`"${account.name}" es ahora la cuenta destino activa.`);
      await load();
    } catch (err) {
      setActionError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusyId(null);
    }
  }

  return (
    <div className="space-y-6">
      <header className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <div className="flex items-center gap-2">
            <Wallet className="h-5 w-5 text-[hsl(var(--erp-accent-violet))]" />
            <h1 className="text-2xl font-semibold text-[hsl(var(--erp-fg))]">
              Financial Accounts
            </h1>
            <span className="rounded bg-[hsl(var(--erp-accent-violet)/0.12)] px-2 py-0.5 text-[11px] font-medium text-[hsl(var(--erp-accent-violet))]">
              M6.5.2.3
            </span>
          </div>
          <p className="mt-1 text-sm text-[hsl(var(--erp-fg-muted))]">
            Catálogo de cuentas financieras — fuente única para 8CHOQ
          </p>
          {fetchedAt && (
            <p className="mt-1 text-[10px] text-[hsl(var(--erp-fg-subtle))]">
              Actualizado {new Date(fetchedAt).toLocaleString("es-AR")}
            </p>
          )}
        </div>
        <div className="flex gap-2">
          <Button type="button" variant="ghost" size="sm" onClick={() => void load()} disabled={loading}>
            <RefreshCw className={`mr-1 h-4 w-4 ${loading ? "animate-spin" : ""}`} />
            Actualizar
          </Button>
          <Button type="button" size="sm" onClick={openCreate}>
            <Plus className="mr-1 h-4 w-4" />
            Nueva cuenta
          </Button>
        </div>
      </header>

      {loadError && (
        <div className="rounded-lg border border-[hsl(var(--erp-accent-rose)/0.4)] bg-[hsl(var(--erp-accent-rose)/0.08)] px-4 py-3 text-sm text-[hsl(var(--erp-accent-rose))]">
          {loadError}
        </div>
      )}

      {successMessage && (
        <div className="flex items-center justify-between gap-3 rounded-lg border border-[hsl(var(--erp-accent-emerald)/0.35)] bg-[hsl(var(--erp-accent-emerald)/0.08)] px-4 py-3 text-sm text-[hsl(var(--erp-accent-emerald))]">
          <span className="inline-flex items-center gap-2">
            <CheckCircle2 className="h-4 w-4 shrink-0" />
            {successMessage}
          </span>
          <button
            type="button"
            onClick={() => setSuccessMessage(null)}
            className="rounded p-1 hover:bg-[hsl(var(--erp-accent-emerald)/0.12)]"
            aria-label="Cerrar"
          >
            <X className="h-3.5 w-3.5" />
          </button>
        </div>
      )}

      {actionError && (
        <div className="flex items-center justify-between gap-3 rounded-lg border border-[hsl(var(--erp-accent-rose)/0.4)] bg-[hsl(var(--erp-accent-rose)/0.08)] px-4 py-3 text-sm text-[hsl(var(--erp-accent-rose))]">
          <span>{actionError}</span>
          <button
            type="button"
            onClick={() => setActionError(null)}
            className="rounded p-1 hover:bg-[hsl(var(--erp-accent-rose)/0.12)]"
            aria-label="Cerrar"
          >
            <X className="h-3.5 w-3.5" />
          </button>
        </div>
      )}

      <Tabs defaultValue="cuentas" className="space-y-4">
        <TabsList className="bg-[hsl(var(--erp-bg-elevated))]">
          <TabsTrigger value="cuentas">Cuentas</TabsTrigger>
          <TabsTrigger value="dashboard">Dashboard</TabsTrigger>
        </TabsList>

        <TabsContent value="cuentas">
          <div className="erp-card">
            {loading ? (
              <p className="py-8 text-center text-sm text-[hsl(var(--erp-fg-muted))]">
                Cargando cuentas…
              </p>
            ) : (
              <ErpFinancialAccountsTable
                accounts={accounts}
                onEdit={openEdit}
                onActivate={handleActivate}
                busyId={busyId}
              />
            )}
          </div>
        </TabsContent>

        <TabsContent value="dashboard" className="space-y-4">
          {assignmentKpi && (
            <ErpFinancialAccountsAssignmentKpiGrid kpi={assignmentKpi} />
          )}
          {kpi && <ErpFinancialAccountsKpiGrid kpi={kpi} />}
          <div className="erp-card">
            {loading ? (
              <p className="py-8 text-center text-sm text-[hsl(var(--erp-fg-muted))]">
                Cargando dashboard…
              </p>
            ) : (
              <ErpFinancialAccountsBalanceChart accounts={accounts} />
            )}
          </div>
          <div className="erp-card">
            <h3 className="mb-3 text-sm font-semibold text-[hsl(var(--erp-fg))]">
              Últimas asignaciones
            </h3>
            <ErpFinancialAccountsRecentAssignmentsTable rows={recentAssignments} />
          </div>
        </TabsContent>
      </Tabs>

      <ErpFinancialAccountFormDialog
        open={formOpen}
        mode={formMode}
        account={editAccount}
        onClose={() => setFormOpen(false)}
        onSubmit={handleFormSubmit}
        submitting={submitting}
      />
    </div>
  );
}
