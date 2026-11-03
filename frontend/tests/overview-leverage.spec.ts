import { test, expect } from "@playwright/test";
import type { BasisAnalysis } from "../src/features/reports/contracts";

test.use({ viewport: { width: 1440, height: 1000 } });
test.setTimeout(120_000);

const amount = (value: string | null | undefined, signed = false) => {
  if (value == null) return "—";
  const large = Math.abs(Number(value)) >= 10000;
  return `${signed && Number(value) > 0 ? "+" : ""}${(Number(value) / (large ? 10000 : 1)).toLocaleString("zh-CN", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}${large ? "万" : ""}`;
};

test("总览六种组合展示七项费用、排序横条与四项汇总", async ({
  page,
  request,
}) => {
  const response = await request.get("/api/reports/2026-09/costs");
  expect(response.ok()).toBeTruthy();
  const analyses: BasisAnalysis[] = await response.json();
  await page.goto("/");
  const panel = page.locator(".profit-waterfall");
  const table = page.getByRole("region", { name: "费用杠杆", exact: true });
  await expect(table).toBeVisible();
  await expect(table.locator("thead th")).toHaveText([
    "费用项目",
    "对比期费用",
    "本期费用",
    "费用变化率",
    "收入变化率",
    "费用弹性",
    "费用率变化",
    "判断",
  ]);
  await expect(page.getByText("情景利润（元）", { exact: true })).toHaveCount(
    0,
  );
  await expect(
    page.getByText("费用杠杆与金额影响", { exact: true }),
  ).toHaveCount(0);
  await expect(
    page.getByText("成本率桥与退款贡献", { exact: true }),
  ).toHaveCount(0);
  await expect(page.getByText("查看瀑布金额明细", { exact: true })).toHaveCount(
    0,
  );
  for (const analysis of analyses) {
    await panel
      .getByLabel("利润比较期间")
      .getByText(analysis.comparison === "mom" ? "环比" : "同比", {
        exact: true,
      })
      .click();
    const title = {
      actual: "实际",
      price_adjusted: "剔价",
      price_refund_adjusted: "剔价剔退款",
    }[analysis.basis]!;
    await panel
      .getByLabel("利润分析口径")
      .getByText(title, { exact: true })
      .click();
    const rows = analysis.rows.filter((row) => row.overview_expense);
    await expect(table.locator("tbody tr[data-row-key]")).toHaveCount(7);
    for (const row of rows) {
      const cells = table.locator(`tr[data-row-key="${row.key}"] td`);
      await expect(cells.nth(1)).toHaveText(amount(row.base));
      await expect(cells.nth(2)).toHaveText(amount(row.current));
    }
    const sorted = [...rows].sort(
      (a, b) =>
        Math.abs(Number(b.profit_impact)) - Math.abs(Number(a.profit_impact)),
    );
    expect(
      await page
        .locator(".overview-impact-row")
        .evaluateAll((nodes) =>
          nodes.map((node) => node.getAttribute("data-expense")),
        ),
    ).toEqual(sorted.map((row) => row.key));
    for (const row of rows) {
      const impact = page.locator(
        `.overview-impact-row[data-expense="${row.key}"]`,
      );
      await expect(impact.locator("strong")).toHaveText(
        amount(row.profit_impact, true),
      );
      await expect(impact.locator("small")).toHaveText(
        `理论 ${amount(row.theoretical_amount)} · 实际 ${amount(row.current)}`,
      );
      await expect(impact.locator(".overview-impact-bar")).toHaveClass(
        Number(row.profit_impact) > 0 ? /impact-positive/ : /impact-negative/,
      );
    }
    for (const key of [
      "scale_impact",
      "seven_cost_impact",
      "other_profit_impact",
      "profit_change",
    ])
      await expect(page.locator(`[data-summary="${key}"] strong`)).toHaveText(
        amount(analysis.leverage[key], true),
      );
  }
});

test("原报告批注支持点击、键盘、单个展开及窄屏翻转", async ({ page }) => {
  await page.goto("/");
  await expect(page.locator(".overview-leverage")).toBeVisible();
  const help = page.locator(".formula-help-content:visible");
  for (const [label, formula] of [
    ["查看剔价口径说明", "标准化毛销售额"],
    ["查看剔价剔退款口径说明", "80%退款返佣规则"],
    ["查看费用变化率计算公式", "本期费用 - 对比期费用"],
    ["查看收入变化率计算公式", "本期收入 - 对比期收入"],
    ["查看费用弹性计算公式", "费用变化率 ÷ 收入变化率"],
    ["查看费用率变化计算公式", "单位为百分点（pp）"],
    ["查看金额影响拆解计算公式", "理论费用 - 本期实际费用"],
    ["查看收入规模利润影响计算公式", "对比期净利润 × 收入变化率"],
    ["查看7项费用合计计算公式", "7项费用各自的利润影响之和"],
    ["查看其他经营项目计算公式", "净利润变化 - 收入规模利润影响 - 7项费用合计"],
    ["查看净利润变化计算公式", "本期净利润 - 对比期净利润"],
  ]) {
    const button = page.getByRole("button", { name: label, exact: true });
    await button.evaluate((element) =>
      element.scrollIntoView({ block: "center" }),
    );
    await button.click();
    await expect(help).toHaveCount(1);
    await expect(help).toContainText(formula);
    await button.click();
    await expect(help).toHaveCount(0);
    await expect(button).toHaveAttribute("aria-expanded", "false");
  }
  const button = page.getByRole("button", {
    name: "查看净利润变化计算公式",
    exact: true,
  });
  await button.focus();
  await page.keyboard.press("Enter");
  await expect(help).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(help).toHaveCount(0);
  await expect(button).toBeFocused();
  await button.click();
  await page
    .getByRole("button", { name: "查看其他经营项目计算公式", exact: true })
    .click();
  await expect(help).toHaveCount(1);
  await expect(button).toHaveAttribute("aria-expanded", "false");
  await page.mouse.click(245, 145);
  await expect(help).toHaveCount(0);
  for (const width of [872, 1152, 1440, 1920]) {
    await page.setViewportSize({ width, height: 884 });
    await button.evaluate((element) =>
      element.scrollIntoView({ block: "center" }),
    );
    await button.click();
    await expect(help).toBeVisible();
    const bounds = await help.boundingBox();
    expect(bounds!.x).toBeGreaterThanOrEqual(0);
    expect(bounds!.x + bounds!.width).toBeLessThanOrEqual(width);
    expect(bounds!.y).toBeGreaterThanOrEqual(0);
    expect(bounds!.y + bounds!.height).toBeLessThanOrEqual(884);
    await page.keyboard.press("Escape");
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
    ).toBeTruthy();
  }
  const basisHelp = page.getByRole("button", {
    name: "查看剔价口径说明",
    exact: true,
  });
  await basisHelp.evaluate((element) =>
    element.scrollIntoView({ block: "center" }),
  );
  await basisHelp.click();
  await page
    .getByLabel("利润分析口径")
    .getByText("剔价", { exact: true })
    .click();
  await expect(help).toHaveCount(0);
});

test("总览缺失金额显示破折号，业务组继续使用独立布局", async ({ page }) => {
  await page.route("**/api/reports/2026-09/costs?*", async (route) => {
    const response = await route.fetch();
    const analyses: BasisAnalysis[] = await response.json();
    for (const analysis of analyses) {
      const row = analysis.rows.find((item) => item.key === "purchase")!;
      row.current =
        row.profit_impact =
        row.change_rate =
        row.delta =
        row.theoretical_amount =
          null;
      analysis.leverage.seven_cost_impact =
        analysis.leverage.other_profit_impact = null;
    }
    await route.fulfill({ response, json: analyses });
  });
  await page.goto("/");
  const row = page.locator('.overview-impact-row[data-expense="purchase"]');
  await expect(row.locator("strong")).toHaveText("—");
  await expect(row.locator("small")).toHaveText("理论 — · 实际 —");
  await expect(
    page.locator('[data-summary="seven_cost_impact"] strong'),
  ).toHaveText("—");
  await page.unroute("**/api/reports/2026-09/costs?*");
  await page
    .getByRole("menuitem", { name: "月度经营分析", exact: true })
    .click();
  await page.getByRole("menuitem", { name: "HCM", exact: true }).click();
  await expect(page.locator(".diagnostic-blocks")).toBeVisible();
  await expect(
    page.locator(".diagnostic-blocks").getByText("项目弹性", { exact: true }),
  ).toBeVisible();
  await expect(
    page.locator(".diagnostic-blocks tbody").first().locator("tr"),
  ).toHaveCount(11);
  await expect(
    page.getByText("费用杠杆与金额影响拆解", { exact: true }),
  ).toBeVisible();
  await expect(
    page.getByText("LISTING 平均售价与退货率对照", { exact: true }),
  ).toBeVisible();
  await expect(page.locator(".overview-leverage")).toHaveCount(0);
});
