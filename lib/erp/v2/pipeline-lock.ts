/**
 * M5.4a — Global advisory lock for live pipeline (no overlapping runs)
 */

import { getPrisma } from "@/lib/db/prisma";

/** Stable int key for pg_advisory_lock (ERP V2 live pipeline). */
export const M5_PIPELINE_ADVISORY_LOCK_KEY = 854321;

export async function tryAcquirePipelineLock(): Promise<boolean> {
  const prisma = getPrisma();
  const rows = await prisma.$queryRaw<Array<{ locked: boolean }>>`
    SELECT pg_try_advisory_lock(${M5_PIPELINE_ADVISORY_LOCK_KEY}) AS locked
  `;
  return rows[0]?.locked === true;
}

export async function releasePipelineLock(): Promise<void> {
  const prisma = getPrisma();
  await prisma.$queryRaw`
    SELECT pg_advisory_unlock(${M5_PIPELINE_ADVISORY_LOCK_KEY})
  `;
}

export async function withPipelineLock<T>(
  fn: () => Promise<T>
): Promise<{ acquired: boolean; result: T | null }> {
  const acquired = await tryAcquirePipelineLock();
  if (!acquired) {
    return { acquired: false, result: null };
  }
  try {
    const result = await fn();
    return { acquired: true, result };
  } finally {
    await releasePipelineLock();
  }
}
