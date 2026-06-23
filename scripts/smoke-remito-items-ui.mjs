#!/usr/bin/env node
/**
 * Smoke UI Remito Items (prod) — intercepta fetches reales al cambiar fechas.
 * Requiere: npx playwright@1.49.0 + chromium instalado.
 */
import { chromium } from "playwright";

const BASE =
  process.env.PROD_URL ??
  "https://nextjs-boilerplate-topaz-iota-40.vercel.app";

const SCENARIOS = [
  { name: "abril", from: "2026-04-01", to: "2026-04-30", expectRows: 1189 },
  { name: "mayo", from: "2026-05-01", to: "2026-05-31", expectRows: 1486 },
  { name: "dia-unico", from: "2026-06-04", to: "2026-06-04", expectRows: 0 },
];

async function setCustomRange(page, from, to) {
  await page.selectOption('select:below(:text("Período (GAS)"))', "custom");
  await page.locator('input[type="date"]').nth(0).fill(from);
  await page.locator('input[type="date"]').nth(1).fill(to);
  await page.waitForTimeout(700);
}

async function waitStable(page, expectRows, timeoutMs = 90000) {
  await page.waitForFunction(
    (expected) => {
      const el = document.querySelector('[data-testid="remito-items-debug"] pre');
      if (!el) return false;
      try {
        const p = JSON.parse(el.textContent);
        return (
          p.dataReady === true &&
          p.showRefreshing === false &&
          p.displayItemsLength === expected &&
          p.querySignature === p.loadedSignature
        );
      } catch {
        return false;
      }
    },
    expectRows,
    { timeout: timeoutMs }
  );
  const text = await page
    .locator('[data-testid="remito-items-debug"] pre')
    .textContent();
  return JSON.parse(text);
}

async function main() {
  const requests = [];
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage();

  page.on("request", (req) => {
    const u = req.url();
    if (u.includes("/api/erp/remito-items")) {
      requests.push({ url: u, method: req.method() });
    }
  });

  const url = `${BASE}/dashboard/remito-items?debugItems=1`;
  console.log("Open", url);
  await page.goto(url, { waitUntil: "networkidle", timeout: 120000 });

  const results = [];

  for (const s of SCENARIOS) {
    requests.length = 0;
    await setCustomRange(page, s.from, s.to);
    const debug = await waitStable(page, s.expectRows);
    const lastReq = requests.at(-1);
    const ok =
      debug.displayItemsLength === s.expectRows &&
      debug.apiFrom === s.from &&
      debug.apiTo === s.to &&
      lastReq?.url?.includes(`from=${s.from}`) &&
      lastReq?.url?.includes(`to=${s.to}`);

    results.push({
      scenario: s.name,
      ok,
      displayItemsLength: debug.displayItemsLength,
      expectRows: s.expectRows,
      apiFrom: debug.apiFrom,
      apiTo: debug.apiTo,
      lastFetch: lastReq?.url ?? null,
      querySynced: debug.synced,
    });
    console.log(JSON.stringify(results.at(-1), null, 2));
  }

  // Cambio rápido abril → mayo
  requests.length = 0;
  await setCustomRange(page, "2026-04-01", "2026-04-30");
  await waitStable(page, 1189);
  requests.length = 0;
  await setCustomRange(page, "2026-05-01", "2026-05-31");
  const mayoDebug = await waitStable(page, 1486);
  const badWide = requests.some((r) => r.url.includes("from=2026-04-01") && r.url.includes("to=2026-05-31"));
  results.push({
    scenario: "quick-abril-mayo",
    ok: mayoDebug.displayItemsLength === 1486 && !badWide,
    badWideFetch: badWide,
    fetches: requests.map((r) => r.url),
    displayItemsLength: mayoDebug.displayItemsLength,
  });
  console.log(JSON.stringify(results.at(-1), null, 2));

  await browser.close();

  const fail = results.filter((r) => !r.ok);
  if (fail.length) {
    console.error("FAIL", fail);
    process.exit(1);
  }
  console.log("UI SMOKE: PASS", results.length, "checks");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
