/**
 * L1 — Upsert staging DB (Prisma)
 */

import { denormTnMpHeaders } from "./m3-mp-denorm.mjs";
import { loadEnvLocal } from "./l0-env.mjs";
import { createPrisma, disconnectPrisma } from "./l1-prisma.mjs";
import { computePairStatus } from "./l1-reconcile.mjs";

loadEnvLocal();

const BLOCKED_URL_PATTERNS = [
  /topaz-iota/i,
  /vercel\.app/i,
  /prod/i,
  /production/i,
];

export function assertSafeStagingUrl(url) {
  const u = (url ?? "").trim();
  if (!u) {
    throw new Error(
      "DATABASE_URL missing — set staging URL in .env.local (see .env.example)"
    );
  }
  for (const re of BLOCKED_URL_PATTERNS) {
    if (re.test(u)) {
      throw new Error(
        `DATABASE_URL blocked for L1 write (matches ${re}). Use local/staging only.`
      );
    }
  }
  if (process.env.L1_ALLOW_WRITE !== "true") {
    throw new Error(
      'L1 write requires L1_ALLOW_WRITE=true in .env.local (safety gate)'
    );
  }
  return u;
}

export { createPrisma, disconnectPrisma };

function toDate(v) {
  if (!v) return null;
  if (v instanceof Date) return v;
  const d = new Date(v);
  return Number.isNaN(d.getTime()) ? null : d;
}

export async function upsertTnLayer(prisma, tnRecords, stats) {
  for (const rec of tnRecords) {
    await prisma.tnOrder.upsert({
      where: { id: rec.id },
      create: {
        id: rec.id,
        tnCreatedAt: rec.tnCreatedAt,
        tnPaidAt: rec.tnPaidAt,
        tnStatus: rec.tnStatus,
        tnPaymentStatus: rec.tnPaymentStatus,
        tnTotal: rec.tnTotal,
        tnSubtotal: rec.tnSubtotal,
        tnShipping: rec.tnShipping,
        tnDiscount: rec.tnDiscount,
        tnAnalyticsCounted: rec.tnAnalyticsCounted,
        tnReportingFlags: rec.tnReportingFlags,
        rawTnPayload: rec.rawTnPayload,
      },
      update: {
        tnCreatedAt: rec.tnCreatedAt,
        tnPaidAt: rec.tnPaidAt,
        tnStatus: rec.tnStatus,
        tnPaymentStatus: rec.tnPaymentStatus,
        tnTotal: rec.tnTotal,
        tnSubtotal: rec.tnSubtotal,
        tnShipping: rec.tnShipping,
        tnDiscount: rec.tnDiscount,
        tnAnalyticsCounted: rec.tnAnalyticsCounted,
        tnReportingFlags: rec.tnReportingFlags,
        rawTnPayload: rec.rawTnPayload,
        syncedAt: new Date(),
      },
    });
    stats.tnOrders.upserted++;

    await prisma.tnOrderItem.deleteMany({ where: { tnOrderId: rec.id } });
    if (rec.items?.length) {
      await prisma.tnOrderItem.createMany({
        data: rec.items.map((it) => ({
          tnOrderId: rec.id,
          tnLineId: it.tnLineId,
          sku: it.sku,
          productName: it.productName,
          variantName: it.variantName,
          quantity: it.quantity,
          unitPrice: it.unitPrice,
          lineTotal: it.lineTotal,
          rawLine: it.rawLine,
        })),
      });
      stats.tnOrderItems.created += rec.items.length;
    }
  }
}

export async function upsertErpLayer(
  prisma,
  { customers, erpOrders, erpOrderItems, payments },
  stats
) {
  const customerIdByKey = new Map();

  for (const c of customers) {
    const row = await prisma.customer.upsert({
      where: { externalKey: c.externalKey },
      create: {
        externalKey: c.externalKey,
        nombre: c.nombre,
        dni: c.dni,
        provinciaLocalidad: c.provinciaLocalidad,
        telefono: c.telefono,
      },
      update: {
        nombre: c.nombre,
        dni: c.dni,
        provinciaLocalidad: c.provinciaLocalidad,
        telefono: c.telefono,
      },
    });
    customerIdByKey.set(c.externalKey, row.id);
    stats.customers.upserted++;
  }

  for (const o of erpOrders) {
    const fechaErp = toDate(o.fechaErp ?? o.fecha);
    if (!fechaErp) continue;

    await prisma.erpOrder.upsert({
      where: { id: o.id },
      create: {
        id: o.id,
        tnOrderId: o.tnOrderId,
        customerId: customerIdByKey.get(o.customerKey) ?? null,
        fechaErp,
        processingStatus: o.processingStatus ?? "imported",
        reconciliationStatus: "unknown",
        nombre: o.nombre,
        dni: o.dni,
        provinciaLocalidad: o.provinciaLocalidad,
        telefono: o.telefono,
        transporte: o.transporte,
        metodoPago: o.metodoPago,
        vendedor: o.vendedor,
        condicionCompra: o.condicionCompra,
        estado: o.estado,
        totalPrendas: o.totalPrendas ?? 0,
        subtotalErp: o.subtotalErp ?? 0,
        shippingCustomerCost: o.shippingCustomerCost ?? 0,
        envioOwner: o.envioOwner,
        shippingOwnerCost: o.shippingOwnerCost ?? 0,
        recargoDescuento: o.recargoDescuento ?? 0,
        totalFinalErp: o.totalFinalErp ?? 0,
        netoOperativo: o.netoOperativo,
        detalleGeneral: o.detalleGeneral,
        scnlItems: o.scnlItems,
        duenoScnlMonto: o.duenoScnlMonto,
        source: o.source ?? "l1_gas_backfill",
        sheetRowHash: o.sheetRowHash,
      },
      update: {
        tnOrderId: o.tnOrderId,
        customerId: customerIdByKey.get(o.customerKey) ?? null,
        fechaErp,
        processingStatus: o.processingStatus ?? "imported",
        nombre: o.nombre,
        totalFinalErp: o.totalFinalErp ?? 0,
        netoOperativo: o.netoOperativo,
        subtotalErp: o.subtotalErp ?? 0,
        shippingCustomerCost: o.shippingCustomerCost ?? 0,
        recargoDescuento: o.recargoDescuento ?? 0,
        source: o.source ?? "l1_gas_backfill",
        sheetRowHash: o.sheetRowHash,
      },
    });
    stats.erpOrders.upserted++;
  }

  for (const item of erpOrderItems) {
    const fechaErp = toDate(item.fechaErp);
    const existing = await prisma.erpOrderItem.findFirst({
      where: {
        erpOrderId: item.erpOrderId,
        sku: item.sku,
        talle: item.talle ?? "",
      },
    });
    const data = {
      erpOrderId: item.erpOrderId,
      fechaErp,
      sku: item.sku,
      articulo: item.articulo,
      talle: item.talle,
      cantidad: item.cantidad,
      precioUnitario: item.precioUnitario,
      owner: item.owner,
      metodoPago: item.metodoPago,
      descuentoAsignado: item.descuentoAsignado,
      shippingAsignado: item.shippingAsignado,
      feeAsignado: item.feeAsignado,
      netoPrenda: item.netoPrenda,
      netoPrendaReal: item.netoPrendaReal,
      mpFeeAsignadoReal: item.mpFeeAsignadoReal,
      source: item.source ?? "l1_gas_backfill",
    };
    if (existing) {
      await prisma.erpOrderItem.update({ where: { id: existing.id }, data });
      stats.erpOrderItems.updated++;
    } else {
      await prisma.erpOrderItem.create({ data });
      stats.erpOrderItems.created++;
    }
  }

  const tnOrderIdByErpId = new Map(
    erpOrders
      .filter((o) => o.tnOrderId)
      .map((o) => [o.id, o.tnOrderId])
  );

  const touchedTnOrderIds = [];

  for (const p of payments) {
    if (!p.erpOrderId) continue;
    const tnOrderId =
      p.tnOrderId ?? tnOrderIdByErpId.get(p.erpOrderId) ?? null;
    const payload = { ...p, erpOrderId: p.erpOrderId, tnOrderId };

    if (p.mpPaymentId) {
      await prisma.payment.upsert({
        where: { mpPaymentId: p.mpPaymentId },
        create: payload,
        update: payload,
      });
    } else {
      const existing = await prisma.payment.findFirst({
        where: { erpOrderId: p.erpOrderId },
      });
      if (existing) {
        await prisma.payment.update({ where: { id: existing.id }, data: payload });
      } else {
        await prisma.payment.create({ data: payload });
      }
    }
    if (tnOrderId) touchedTnOrderIds.push(tnOrderId);
    stats.payments.upserted++;
  }

  if (touchedTnOrderIds.length) {
    const denorm = await denormTnMpHeaders(prisma, touchedTnOrderIds);
    stats.paymentsTnDenorm = denorm.updated;
  }
}

export async function applyReconciliationToDb(prisma, tnRecords, erpOrders) {
  const tnById = new Map(tnRecords.map((t) => [t.id, t]));
  const updated = { aligned: 0, tn_only: 0, erp_only: 0, mismatch: 0, unknown: 0 };

  for (const erp of erpOrders) {
    const tn = erp.tnOrderId ? tnById.get(erp.tnOrderId) : null;
    const { status, note } = computePairStatus(tn, erp);
    await prisma.erpOrder.update({
      where: { id: erp.id },
      data: {
        reconciliationStatus: status,
        reconciliationNote: note,
      },
    });
    if (status === "aligned") updated.aligned++;
    else if (status === "tn_only_pending_erp") updated.tn_only++;
    else if (status === "erp_only_not_in_panel") updated.erp_only++;
    else if (status === "mismatch_amount") updated.mismatch++;
    else updated.unknown++;
  }

  return updated;
}
