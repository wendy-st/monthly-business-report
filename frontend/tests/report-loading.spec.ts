import { test, expect } from "@playwright/test";
import type { FinancialView } from "../src/features/reports/contracts";

test.use({ viewport: { width: 1440, height: 1000 } });

test("精简视图降低传输量并保留三期金额与来源行", async ({ request }) => {
  const fullResponse = await request.get("/api/reports/2026-09/financial");
  const compactResponse = await request.get(
    "/api/reports/2026-09/financial?view=overview",
  );
  expect(fullResponse.ok()).toBeTruthy();
  expect(compactResponse.ok()).toBeTruthy();
  expect((await compactResponse.body()).length).toBeLessThan(
    (await fullResponse.body()).length * 0.2,
  );
  const full: FinancialView = await fullResponse.json();
  const compact: FinancialView = await compactResponse.json();
  expect(compact.summary).toEqual(full.summary);
  expect(compact.series).toEqual(full.series);
  expect(compact.waterfall).toEqual(full.waterfall);
  expect(compact.breakdowns.styles).toBeUndefined();
  for (const [grain, rows] of Object.entries(compact.breakdowns)) {
    expect(rows).toHaveLength(full.breakdowns[grain].length);
    for (const [index, row] of rows.entries()) {
      const original = full.breakdowns[grain][index];
      expect(row.source_rows).toEqual(original.source_rows);
      expect(row.status).toEqual(original.status);
      for (const period of ["current", "previous", "year_ago"] as const)
        for (const [key, value] of Object.entries(row[period]))
          expect(value).toEqual(original[period][key]);
    }
  }
});

test("首次加载请求不重复，返回总览复用已读取结果", async ({ page }) => {
  const requests: string[] = [];
  page.on("request", (request) => {
    if (request.url().includes("/api/")) requests.push(request.url());
  });
  await page.goto("/");
  await expect(page.locator(".overview-leverage")).toBeVisible();
  const countOverview = () =>
    requests.filter((url) => url.includes("financial?view=overview")).length;
  expect(countOverview()).toBe(1);
  expect(
    requests.filter((url) => new URL(url).pathname.endsWith("/options")),
  ).toHaveLength(1);
  await page
    .getByRole("menuitem", { name: "2. 业务组经营分析", exact: true })
    .click();
  await expect(page.locator(".business-page .diagnostic-blocks")).toBeVisible();
  await page
    .getByRole("menuitem", { name: "1. 经营总览", exact: true })
    .click();
  await expect(page.locator(".overview-leverage")).toBeVisible();
  expect(countOverview()).toBe(1);
  const html = await (await page.request.get("/")).text();
  expect(html).not.toContain("/@vite/client");
  expect(html).toContain("/assets/");
});

test("切换业务组后迟到的旧请求不会覆盖新组金额", async ({ page, request }) => {
  const response = await request.get(
    "/api/reports/2026-09/financial?group=HCM&view=business",
  );
  const expected: FinancialView = await response.json();
  let release!: () => void;
  const blocked = new Promise<void>((resolve) => {
    release = resolve;
  });
  await page.route("**/financial?group=LZF&view=business", async (route) => {
    await blocked;
    await route.continue();
  });
  await page.goto("/");
  await expect(page.locator(".overview-leverage")).toBeVisible();
  await page
    .getByRole("menuitem", { name: "2. 业务组经营分析", exact: true })
    .click();
  await page.getByRole("menuitem", { name: "2.2 HCM", exact: true }).click();
  const revenue = page.locator(".business-page .metric-value").nth(1);
  const display = (
    Number(expected.summary.current.revenue) / 10000
  ).toLocaleString("zh-CN", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
  await expect(revenue).toHaveText(`${display}万HCM`);
  const returned = page.waitForResponse("**/financial?group=LZF&view=business");
  release();
  await returned;
  await expect(revenue).toHaveText(`${display}万HCM`);
});
