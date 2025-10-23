import { useCallback, useEffect, useMemo, useState } from "react";

const CODE_KEYS = ["Código", "Codigo", "CODIGO", "SKU", "Cod."];
const NAME_KEYS = ["Artículo", "Articulo", "Nombre", "Producto"];
const PRICE_KEYS = ["Precio", "Precio Lista", "PVP", "Valor"];

function findValue(record: Record<string, string>, keys: string[]) {
  for (const key of keys) {
    if (record[key]) return record[key];
  }
  return undefined;
}

function parsePrice(value: string | undefined) {
  if (!value) return undefined;
  const normalized = value.replace(/[^0-9,.-]/g, "").replace(",", ".");
  const parsed = Number(normalized);
  return Number.isFinite(parsed) ? parsed : undefined;
}

export type ProductRecord = {
  raw: Record<string, string>;
  code?: string;
  name?: string;
  price?: number;
};

export function useProducts() {
  const [products, setProducts] = useState<ProductRecord[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fetchProducts = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);
      const response = await fetch("/api/stock", { cache: "no-store" });
      if (!response.ok) {
        throw new Error(`Stock ${response.status}`);
      }
      const json = await response.json();
      const rawProducts: Record<string, string>[] = json.products ?? [];
      const parsed = rawProducts.map((record) => ({
        raw: record,
        code: findValue(record, CODE_KEYS),
        name: findValue(record, NAME_KEYS),
        price: parsePrice(findValue(record, PRICE_KEYS)),
      }));
      setProducts(parsed);
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : "No se pudo cargar stock";
      setError(message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchProducts();
  }, [fetchProducts]);

  const suggestions = useMemo(() => {
    return products
      .map((product) => ({
        label: product.name || product.code || "",
        code: product.code,
      }))
      .filter((item) => item.label);
  }, [products]);

  return {
    products,
    suggestions,
    loading,
    error,
    refresh: fetchProducts,
  };
}