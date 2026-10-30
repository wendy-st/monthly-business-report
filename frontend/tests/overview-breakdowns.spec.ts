import { test, expect } from "@playwright/test";
import type { FinancialView } from "../src/features/reports/contracts";
import type { OverviewRow } from "../src/features/reports/overview-contracts";
import { overviewAmount } from "../src/features/reports/overview-presentation";

test.use({ viewport: { width: 1920, height: 1080 } });

test("总览箭头、六种正负号及实际口径五项总结", async ({ page, request }) => {
  const response = await request.get(
    "/api/reports/2026-09/financial?view=overview",
  );
  const data: FinancialView = await response.json();
  const overview = data.overview!;
  await page.goto("/");
  const changes = page.locator(".metric-comparison strong");
  await expect(changes).toHaveCount(8);
  for (const item of await changes.all())
    await expect(item).toHaveText(/^[↑↓] [+-]\d/);
  const conclusion = page.getByLabel("利润与费用分析总结");
  const panel = page.locator(".profit-waterfall");
  for (const comparison of ["mom", "yoy"]) {
    await panel
      .getByLabel("利润比较期间")
      .getByText(comparison === "mom" ? "环比" : "同比", { exact: true })
      .click();
    for (const [basis, label] of [
      ["actual", "实际"],
      ["price_adjusted", "剔价"],
      ["price_refund_adjusted", "剔价剔退款"],
    ]) {
      await panel
        .getByLabel("利润分析口径")
        .getByText(label, { exact: true })
        .click();
      const expected = overview.conversion[comparison][basis];
      await expect(
        page.locator(`.elasticity-item[data-basis="${basis}"] small`),
      ).toHaveText(`收入 ${expected.revenue} · 利润 ${expected.profit}`);
      await expect(conclusion.locator("dt")).toHaveText(
        overview.conclusions[comparison].map((item) => item.label),
      );
      await expect(conclusion.locator("dd")).toHaveText(
        overview.conclusions[comparison].map((item) => item.detail),
      );
    }
  }
});

test("经营贡献、品类和两榜单按后端顺序展示", async ({ page, request }) => {
  const response = await request.get(
    "/api/reports/2026-09/financial?view=overview",
  );
  const data: FinancialView = await response.json();
  const overview = data.overview!;
  await page.goto("/");
  for (const [title, rows] of [
    ["小组经营占比", overview.groups],
    ["站点经营占比", overview.sites],
  ] as const) {
    const table = page.getByLabel(title, { exact: true });
    await expect(table.locator("tbody tr[data-row-key]")).toHaveCount(
      rows.length,
    );
    await expect(table.locator(".overview-total-row")).toBeVisible();
    await expect(table.locator("thead").first().locator("th")).toHaveCount(9);
    for (const row of rows) {
      const cells = table.locator(`tr[data-row-key="${row.key}"] td`);
      await expect(cells.nth(1)).toHaveText(
        overviewAmount(row.current.revenue),
      );
      await expect(cells.nth(3)).toHaveText(overviewAmount(row.current.profit));
    }
  }
  await expect(page.locator(".overview-category-table tbody tr")).toHaveCount(
    overview.categories.length,
  );
  await expect(
    page.locator(".overview-category-table tbody tr td:first-child"),
  ).toHaveText(overview.categories.map((row) => row.dimensions.category3));
  for (const [title, rows] of [
    ["站点-LISTING销售额TOP10", overview.sales_top10],
    ["站点-LISTING净利润亏损TOP10", overview.loss_top10],
  ] as const) {
    const table = page.getByLabel(title, { exact: true });
    const actual = await table
      .locator("tbody tr[data-row-key]")
      .evaluateAll((nodes) =>
        nodes.map((node) => node.getAttribute("data-row-key")),
      );
    expect(actual).toEqual(rows.map((row) => row.key));
  }
  await expect(page.getByText("LISTING经营明细", { exact: true })).toHaveCount(
    0,
  );
  await page
    .locator(".overview-category-table")
    .evaluate((element) =>
      window.scrollTo(0, element.getBoundingClientRect().top + scrollY - 160),
    );
  expect(
    await page.evaluate(() =>
      Boolean(document.elementFromPoint(285, 30)?.closest(".report-header")),
    ),
  ).toBeTruthy();
});

test("店铺站点筛选使用后端小计及三期比较", async ({ page, request }) => {
  const response = await request.get(
    "/api/reports/2026-09/financial?view=overview",
  );
  const data: FinancialView = await response.json();
  const overview = data.overview!;
  await page.goto("/");
  const table = page.getByLabel("店铺经营", { exact: true });
  const lastCell = await table
    .locator("tbody tr[data-row-key]")
    .first()
    .locator("td")
    .last()
    .boundingBox();
  expect(lastCell!.x + lastCell!.width).toBeLessThanOrEqual(1920);
  await expect(table.locator("thead").first()).toContainText("环比2026年8月");
  await expect(table.locator("thead").first()).toContainText("同比2025年9月");
  for (const site of ["", "CA", "US", ""]) {
    await page.getByLabel("店铺站点").selectOption(site);
    const rows = overview.shops.filter(
      (row) => !site || row.dimensions.site === site,
    );
    await expect(table.locator("tbody tr[data-row-key]")).toHaveCount(
      rows.length + 1,
    );
    const total = overview.shop_totals[site];
    const cells = table.locator(`tr[data-row-key="${total.key}"] td`);
    await expect(cells).toHaveCount(17);
    await expect(cells.nth(2)).toHaveText(
      overviewAmount(total.current.revenue),
    );
    await expect(cells.nth(3)).toHaveText(overviewAmount(total.current.profit));
    for (const [index, comparison] of [
      [9, "mom"],
      [15, "yoy"],
    ] as const) {
      const value = total.deltas[`profit_${comparison}`]!;
      await expect(cells.nth(index)).toHaveText(
        `${Number(value) > 0 ? "↑ " : "↓ "}${overviewAmount(value, true)}`,
      );
    }
  }
});

test("总览缺失数据保留破折号和空榜单", async ({ page }) => {
  await page.route("**/financial?view=overview", async (route) => {
    const response = await route.fetch();
    const data: FinancialView = await response.json();
    const overview = data.overview!;
    overview.sales_top10 = [];
    overview.loss_top10 = [];
    const row: OverviewRow = overview.groups[0];
    row.current.profit = row.profit_share = row.deltas.profit_yoy = null;
    await route.fulfill({ response, json: data });
  });
  await page.goto("/");
  await expect(
    page.getByText("本期无正销售额LISTING", { exact: true }),
  ).toBeVisible();
  await expect(
    page.getByText("本期无亏损LISTING", { exact: true }),
  ).toBeVisible();
  const cells = page
    .getByLabel("小组经营占比", { exact: true })
    .locator("tbody tr[data-row-key]")
    .first()
    .locator("td");
  await expect(cells.nth(3)).toHaveText("—");
  await expect(cells.nth(4)).toHaveText("—");
  await expect(cells.nth(8)).toHaveText("—");
});
