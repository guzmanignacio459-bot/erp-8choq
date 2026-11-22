import { createHash, timingSafeEqual } from "node:crypto";

export function secretoConfigurado(secret: string | undefined): boolean {
  return (secret ?? "").trim().length >= 20;
}

export function accesoValido(clave: string | null, secret: string | undefined): boolean {
  const esperado = (secret ?? "").trim();
  const provisto = (clave ?? "").trim();
  if (!secretoConfigurado(esperado) || !provisto) return false;
  const left = createHash("sha256").update(provisto).digest();
  const right = createHash("sha256").update(esperado).digest();
  return timingSafeEqual(left, right);
}
