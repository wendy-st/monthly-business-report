import { test, expect } from "@playwright/test";
import type { FinancialView } from "../src/features/reports/contracts";
import type { ProductRefundView } from "../src/features/reports/product-contracts";

test.setTimeout(90_000);

test("退款销量门槛联动排行、明细、异常颜色与筛选范围", async ({
  page,
  request,
}) => {
  const endpoint = "/api/reports/2026-09/product-refunds";
  const analysis: ProductRefundView = await (
    await request.get(endpoint)
  ).json();
  expect(analysis.total_styles).toBe(894);
  expect(analysis.low_sales_count).toBe(699);
  expect(Number(analysis.low_sales_share)).toBeCloseTo(699 / 894, 12);
  expect(Number(analysis.low_sales_qty_share)).toBeCloseTo(0.1016, 4);
  expect(analysis.eligible_keys).toHaveLength(195);
  const data: FinancialView = await (
    await request.get("/api/reports/2026-09/financial?view=products")
  ).json();
  for (const value of [0, -1, "1.5", "abc"]) {
    expect(
      (await request.get(endpoint, { params: { min_sales: value } })).status(),
    ).toBe(422);
  }
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.goto("/");
  await page
    .getByRole("menuitem", { name: "品类经营分析", exact: true })
    .click();
  const card = page.locator(".product-refunds");
  await expect(card.getByLabel("退款样本统计")).toContainText("699 款");
  await expect(card).toContainText("78.19%");
  await expect(card).toContainText("10.16%");
  const details = page.locator(".category-details");
  const firstLow = data.breakdowns.styles
    .filter((row) => row.record_count > 0)
    .findIndex((row) => analysis.statuses[row.key] === "low_sales");
  for (let index = 0; index < Math.floor(firstLow / 25); index++) {
    await details.getByTitle("下一页", { exact: true }).click();
  }
  const lowCell = details.getByText("样本不足", { exact: true }).first();
  await expect(lowCell).not.toHaveClass(/negative/);
  await lowCell.locator("xpath=ancestor::tr").getByRole("button").click();
  await expect(
    page.getByRole("dialog").getByText("原始退款率", { exact: true }),
  ).toBeVisible();
  await page
    .getByRole("dialog")
    .getByRole("button", { name: "关闭明细", exact: true })
    .click();
  await details.getByRole("button", { name: "退款率", exact: true }).click();
  await expect(details.locator(".product-detail-toolbar")).toContainText(
    "195 个款式",
  );
  await expect(details.getByText("样本不足", { exact: true })).toHaveCount(0);
  const input = card.getByRole("spinbutton", { name: "退款分析最低销量" });
  await input.fill("200");
  await input.press("Tab");
  const higher: ProductRefundView = await (
    await request.get(endpoint, { params: { min_sales: 200 } })
  ).json();
  await expect(details.locator(".product-detail-toolbar")).toContainText(
    `${higher.eligible_keys.length} 个款式`,
  );
  await expect(
    details.getByRole("button", { name: "退款率", exact: true }),
  ).toHaveClass(/primary/);
  const top = data.breakdowns.styles.find(
    (row) => row.key === higher.ranking_keys[0],
  )!;
  await expect(
    card
      .getByRole("row")
      .filter({
        has: page.getByRole("cell", {
          name: top.dimensions.style,
          exact: true,
        }),
      })
      .first(),
  ).toContainText(top.dimensions.site);
  await page.getByRole("button", { name: "LZF", exact: true }).click();
  await expect(input).toHaveValue("200");
  const grouped: ProductRefundView = await (
    await request.get(endpoint, { params: { min_sales: 200, group: "LZF" } })
  ).json();
  await expect(card.getByLabel("退款样本统计")).toContainText(
    `当前范围 ${grouped.total_styles} 款`,
  );
  await input.fill("1000000");
  await input.press("Tab");
  await expect(
    card.getByText("当前范围没有达到销量门槛且退款率可计算的款式"),
  ).toBeVisible();
});

test("退款样本读取失败可局部重试，不清空成本及盈利明细", async ({ page }) => {
  let fail = true;
  await page.route("**/product-refunds?**", async (route) => {
    if (fail) return route.fulfill({ status: 500, body: "{}" });
    return route.continue();
  });
  await page.goto("/");
  await page
    .getByRole("menuitem", { name: "品类经营分析", exact: true })
    .click();
  const card = page.locator(".product-refunds");
  await expect(card.getByRole("alert")).toBeVisible();
  await expect(
    page.getByText("一级品类盈利矩阵", { exact: true }),
  ).toBeVisible();
  await expect(
    page.locator(".category-details .product-detail-toolbar"),
  ).toContainText("894 个款式");
  fail = false;
  await card.getByRole("button", { name: "重试退款分析", exact: true }).click();
  await expect(card.getByLabel("退款样本统计")).toContainText("699 款");
});
