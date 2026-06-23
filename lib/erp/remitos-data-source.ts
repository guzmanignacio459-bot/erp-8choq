import type { RemitosDataSource } from "@/types/erp-remitos-display";

/** Solo `source=neon` explícito activa staging; default siempre GAS. */
export function parseRemitosDataSource(
  value: string | null | undefined
): RemitosDataSource {
  return value?.trim().toLowerCase() === "neon" ? "neon" : "gas";
}
