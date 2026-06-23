/**
 * Serializa fetches del dashboard: aborta el anterior y descarta respuestas obsoletas.
 */
export type FetchGuardHandle = {
  reqId: number;
  signal: AbortSignal;
};

export type FetchGuard = {
  begin: () => FetchGuardHandle;
  isCurrent: (reqId: number) => boolean;
  cancel: () => void;
};

export function createFetchGuard(): FetchGuard {
  let reqId = 0;
  let controller: AbortController | null = null;

  return {
    begin() {
      controller?.abort();
      controller = new AbortController();
      const id = ++reqId;
      return { reqId: id, signal: controller.signal };
    },
    isCurrent(id: number) {
      return id === reqId;
    },
    cancel() {
      controller?.abort();
      controller = null;
    },
  };
}

export function isAbortError(e: unknown): boolean {
  return e instanceof DOMException && e.name === "AbortError";
}
