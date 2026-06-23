/**
 * M5.4c — Pipeline failure email alerts (success = no email)
 */

import type { PipelineAlertPayload } from "@/types/erp-v2-pipeline-monitor";

export type PipelineAlertEmailResult = {
  sent: boolean;
  skipped: boolean;
  reason: string | null;
};

function summarizeStack(stack: string | undefined | null): string | null {
  if (!stack) return null;
  return stack
    .split("\n")
    .slice(0, 8)
    .join("\n")
    .slice(0, 1200);
}

export function buildPipelineAlertPayload(input: {
  runId: string;
  reason: PipelineAlertPayload["reason"];
  stage: string;
  error: string;
  stack?: string;
  correlationId?: string | null;
}): PipelineAlertPayload {
  return {
    runId: input.runId,
    reason: input.reason,
    stage: input.stage,
    occurredAt: new Date().toISOString(),
    error: input.error,
    stackSummary: summarizeStack(input.stack),
    correlationId: input.correlationId ?? null,
  };
}

function alertSubject(payload: PipelineAlertPayload): string {
  return `[ERP V2] Pipeline FAIL — ${payload.stage} (${payload.runId})`;
}

function alertHtml(payload: PipelineAlertPayload): string {
  const stackBlock = payload.stackSummary
    ? `<pre style="font-size:12px;white-space:pre-wrap">${payload.stackSummary}</pre>`
    : "<p><em>sin stack</em></p>";

  return `
    <h2>ERP V2 — Pipeline Alert</h2>
    <ul>
      <li><strong>Fecha:</strong> ${payload.occurredAt}</li>
      <li><strong>Run ID:</strong> ${payload.runId}</li>
      <li><strong>Etapa:</strong> ${payload.stage}</li>
      <li><strong>Motivo:</strong> ${payload.reason}</li>
      <li><strong>Correlation:</strong> ${payload.correlationId ?? "n/a"}</li>
    </ul>
    <h3>Error</h3>
    <pre style="font-size:12px;white-space:pre-wrap">${payload.error}</pre>
    <h3>Stack (resumido)</h3>
    ${stackBlock}
  `.trim();
}

export async function sendPipelineAlertEmail(
  payload: PipelineAlertPayload
): Promise<PipelineAlertEmailResult> {
  const to = (process.env.PIPELINE_ALERT_EMAIL ?? "").trim();
  if (!to) {
    return {
      sent: false,
      skipped: true,
      reason: "PIPELINE_ALERT_EMAIL not configured",
    };
  }

  const apiKey = (process.env.RESEND_API_KEY ?? "").trim();
  const from =
    (process.env.PIPELINE_ALERT_FROM ?? "").trim() ||
    "ERP V2 Alerts <onboarding@resend.dev>";

  if (!apiKey) {
    return {
      sent: false,
      skipped: true,
      reason: "RESEND_API_KEY not configured",
    };
  }

  const res = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      from,
      to: [to],
      subject: alertSubject(payload),
      html: alertHtml(payload),
    }),
  });

  if (!res.ok) {
    const body = await res.text();
    return {
      sent: false,
      skipped: false,
      reason: `Resend HTTP ${res.status}: ${body.slice(0, 300)}`,
    };
  }

  return { sent: true, skipped: false, reason: null };
}
