"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Plus, RefreshCw, Wallet } from "lucide-react";

import { ErpFinancialAccountFormDialog } from "@/components/erp/financial-accounts/erp-financial-account-form-dialog";
import { ErpFinancialAccountsBalanceChart } from "@/components/erp/financial-accounts/erp-financial-accounts-balance-chart";
import { ErpFinancialAccountsKpiGrid } from "@/components/erp/financial-accounts/erp-financial-accounts-kpi-grid";
import { ErpFinancialAccountsTable } from "@/components/erp/financial-accounts/erp-financial-accounts-table";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { createFetchGuard, isAbortError } from "@/lib/erp/fetch-guard";
import type {
  V2FinancialAccountCreateInput,
  V2FinancialAccountRow,
  V2FinancialAccountUpdateInput,
  V2FinancialAccountsKpi,
  V2FinancialAccountsListResponse,
} from "@/types/erp-v2-financial-accounts";

export function ErpFinancialAccountsDashboard() {
  const fetchGuardRef = useRef(createFetchGuard());
  const [accounts, setAccounts] = useState<V2FinancialAccountRow[]>([]);
  const [kpi, setKpi] = useState<V2FinancialAccountsKpi | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
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
    setError(null);
    try {
      const res = await fetch("/api/v2/financial-accounts", {
        cache: "no-store",
        signal,
      });
      const json = (await res.json()) as V2FinancialAccountsListResponse;

      if (!guard.isCurrent(reqId)) return;

      if (!res.ok || !json.ok) {
        throw new Error(json.error ?? `HTTP ${res.status}`);
      }
      setAccounts(json.data ?? []);
      setKpi(json.kpi ?? null);
      setFetchedAt(json.fetchedAt ?? null);
    } catch (err: unknown) {
      if (isAbortError(err)) return;
      if (!guard.isCurrent(reqId)) return;
      setError(err instanceof Error ? err.message : String(err));
      setAccounts([]);
      setKpi(null);
    } finally {
      if (guard.isCurrent(reqId)) setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
    return () => fetchGuardRef.current.cancel();
  }, [load]);

  function openCreate() {
    setFormMode("create");
    setEditAccount(null);
    setFormOpen(true);
  }

  function openEdit(account: V2FinancialAccountRow) {
    setFormMode("edit");
    setEditAccount(account);
    setFormOpen(true);
  }

  async function handleFormSubmit(
    payload: V2FinancialAccountCreateInput | V2FinancialAccountUpdateInput
  ) {
    setSubmitting(true);
    setError(null);
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
        setError(json.error ?? "Error al guardar");
        return;
      }
      setFormOpen(false);
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setSubmitting(false);
    }
  }

  async function handleDeactivate(account: V2FinancialAccountRow) {
    if (!confirm(`¿Desactivar la cuenta "${account.name}"?`)) return;
    setBusyId(account.id);
    setError(null);
    try {
      const res = await fetch(`/api/v2/financial-accounts/${account.id}`, {
        method: "DELETE",
      });
      const json = await res.json();
      if (!json.ok) {
        setError(json.error ?? "Error al desactivar");
        return;
      }
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
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
              M6.4
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

      {error && (
        <div className="rounded-lg border border-[hsl(var(--erp-accent-rose)/0.4)] bg-[hsl(var(--erp-accent-rose)/0.08)] px-4 py-3 text-sm text-[hsl(var(--erp-accent-rose))]">
          {error}
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
                onDeactivate={handleDeactivate}
                busyId={busyId}
              />
            )}
          </div>
        </TabsContent>

        <TabsContent value="dashboard" className="space-y-4">
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
