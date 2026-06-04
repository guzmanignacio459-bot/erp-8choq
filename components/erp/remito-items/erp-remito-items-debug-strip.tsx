"use client";

import { useEffect } from "react";

type ErpRemitoItemsDebugStripProps = {
  querySignature: string | null;
  loadedSignature: string | null;
  loading: boolean;
  gasSkuPending: boolean;
  customDatesPending: boolean;
  itemsLength: number;
  displayItemsLength: number;
  apiFrom: string | null;
  apiTo: string | null;
  fetchUrl: string | null;
  dataReady: boolean;
  showRefreshing: boolean;
};

export function ErpRemitoItemsDebugStrip({
  querySignature,
  loadedSignature,
  loading,
  gasSkuPending,
  customDatesPending,
  itemsLength,
  displayItemsLength,
  apiFrom,
  apiTo,
  fetchUrl,
  dataReady,
  showRefreshing,
}: ErpRemitoItemsDebugStripProps) {
  const payload = {
    querySignature,
    loadedSignature,
    synced: querySignature === loadedSignature,
    loading,
    gasSkuPending,
    customDatesPending,
    itemsLength,
    displayItemsLength,
    apiFrom,
    apiTo,
    fetchUrl,
    dataReady,
    showRefreshing,
  };

  useEffect(() => {
    console.info("[remito-items:debug]", payload);
  }, [
    querySignature,
    loadedSignature,
    loading,
    gasSkuPending,
    customDatesPending,
    itemsLength,
    displayItemsLength,
    apiFrom,
    apiTo,
    fetchUrl,
    dataReady,
    showRefreshing,
  ]);

  return (
    <div
      className="erp-card border-cyan-500/30 bg-cyan-500/5 p-3 font-mono text-[10px] leading-relaxed text-cyan-100"
      data-testid="remito-items-debug"
    >
      <p className="mb-2 font-sans text-xs font-semibold text-cyan-200">
        Debug Remito Items (?debugItems=1)
      </p>
      <pre className="overflow-x-auto whitespace-pre-wrap break-all">
        {JSON.stringify(payload, null, 2)}
      </pre>
    </div>
  );
}
