import { test, expect } from "@playwright/test";
import path from "node:path";

test.setTimeout(180_000);
test.use({ viewport: { width: 1440, height: 1000 } });
test.beforeEach(({ page }) => page.setDefaultTimeout(20_000));
const number = (value: string, scale = 1) =>
  (Number(value) / scale).toLocaleString("zh-CN", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });

test("默认真实报告与API一致，七个入口、年度分组和来源可用", async ({
  page,
  request,
}, info) => {
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  const api = await request.get("/api/reports/2026-09/financial");
  expect(api.ok()).toBeTruthy();
  const financial = await api.json();
  await page.goto("/");
  await expect(page.getByText(/9月真实数据/)).toBeVisible();
  await expect(page.getByText("界面样例／合成数据")).toHaveCount(0);
  await expect(page.locator(".report-nav-main")).toHaveText([
    "经营总览",
    "月度经营分析",
    "年度经营分析",
    "品类经营分析",
    "库存周转",
    "ITK大盘数据分析",
    "LISTING分析问题清单",
  ]);
  await expect(page.locator(".report-nav-icon svg")).toHaveCount(7);
  await expect(page.locator(".metric-value").nth(1)).toHaveText(
    `${number(financial.summary.current.revenue, 10000)}万总计`,
    { timeout: 30_000 },
  );
  await expect(
    page.getByText("1. 收入与利润转化", { exact: true }),
  ).toBeVisible({ timeout: 30_000 });
  const screenshot = async (name: string) => {
    await page.evaluate(() => scrollTo(0, 0));
    await page.screenshot({
      path: process.env.REPORT_SCREENSHOT_DIR
        ? path.join(process.env.REPORT_SCREENSHOT_DIR, `${name}.png`)
        : info.outputPath(`${name}.png`),
    });
  };
  await screenshot("live-overview");
  await page
    .getByRole("menuitem", { name: "月度经营分析", exact: true })
    .click();
  await page.getByRole("menuitem", { name: "HCM", exact: true }).click();
  await expect(page.locator(".metric-value").first()).toBeVisible({
    timeout: 30_000,
  });
  await screenshot("live-business");
  await expect(
    page.getByText("近6年LISTING盈收趋势", { exact: true }),
  ).toHaveCount(0);
  await page
    .getByRole("menuitem", { name: "年度经营分析", exact: true })
    .click();
  await expect(
    page.getByRole("heading", { name: /逐LISTING历史最佳月与/ }),
  ).toBeVisible({ timeout: 30_000 });
  await expect(page.getByRole("group", { name: "历史年份" })).toBeVisible();
  await expect(
    page.getByRole("heading", {
      name: "HCM组近6年LISTING盈收管理看板",
      exact: true,
    }),
  ).toBeVisible();
  const historyResponse = page.waitForResponse(
    (response) =>
      response.url().includes("/history?group=LZF") && response.ok(),
  );
  await page.getByRole("menuitem", { name: "LZF", exact: true }).click();
  const history = await (await historyResponse).json();
  await expect(page.locator(".annual-page figcaption").first()).toContainText(
    `${(Number(history.annual[0].current.revenue) / 10000).toFixed(2)}万`,
  );
  await expect(page.locator(".business-page")).toHaveCount(0);
  await expect(
    page.getByRole("menuitem", { name: "年度经营分析", exact: true }),
  ).toHaveAttribute("aria-current", "page");
  await screenshot("live-annual");
  await page
    .getByRole("menuitem", { name: "品类经营分析", exact: true })
    .click();
  await expect(
    page.getByText("三、款式盈利 & 成本诊断明细", { exact: true }),
  ).toBeVisible({ timeout: 30_000 });
  await screenshot("live-products");
  await page
    .locator(".product-page")
    .getByRole("button", { name: /\// })
    .first()
    .click();
  await expect(page.getByRole("dialog")).toBeVisible();
  await expect(page.getByText("经营底表来源行", { exact: true })).toBeVisible();
  await page.getByRole("button", { name: "关闭明细", exact: true }).click();
  await page
    .getByRole("searchbox", { name: "搜索LISTING或款式", exact: true })
    .fill("无此真实款式__验核");
  await page
    .getByRole("searchbox", { name: "搜索LISTING或款式", exact: true })
    .press("Enter");
  await expect(page.getByText(/当前筛选没有本期记录/)).toBeVisible({
    timeout: 30_000,
  });
  await page.getByRole("button", { name: "重置筛选", exact: true }).click();
  await expect(
    page.getByRole("searchbox", { name: "搜索LISTING或款式", exact: true }),
  ).toHaveValue("");
  await page.getByRole("menuitem", { name: "库存周转", exact: true }).click();
  await expect(
    page.getByText("FBA库龄占比（按小组）", { exact: true }),
  ).toBeVisible({ timeout: 90_000 });
  await screenshot("live-inventory");
  await page.getByText("含头程", { exact: true }).click();
  await expect(
    page.getByRole("radio", { name: "含头程", exact: true }),
  ).toBeChecked();
  await page
    .getByRole("menuitem", { name: "LISTING分析问题清单", exact: true })
    .click();
  await page.getByRole("menuitem", { name: "HCM", exact: true }).click();
  await expect(page.locator(".listing-report").first()).toBeVisible({
    timeout: 30_000,
  });
  await screenshot("live-listing");
  await expect(page.locator(".listing-issues").first()).toBeVisible();
  for (const site of ["MX", "FR", "ES", "IT"])
    await expect(
      page.getByRole("region", { name: `${site}站点报告`, exact: true }),
    ).toHaveCount(0);
  await page
    .getByRole("button", { name: "数据来源与导入状态", exact: true })
    .click();
  await expect(
    page.getByText("2026年9月源表已只读导入，当前页面读取本地快照。", {
      exact: true,
    }),
  ).toBeVisible();
  expect(errors).toEqual([]);
});

for (const width of [1024, 1280, 1440, 1920]) {
  test(`真实数据${width}宽度六模块无整页横向溢出`, async ({ page }) => {
    await page.setViewportSize({ width, height: 900 });
    await page.goto("/");
    for (const [menu, ready] of [
      ["经营总览", ".conclusion-card"],
      ["月度经营分析", ".metric-value"],
      ["年度经营分析", ".annual-page .history-chart-grid canvas"],
      ["品类经营分析", ".product-page .product-groups"],
      ["库存周转", ".inventory-conclusion"],
      ["LISTING分析问题清单", ".listing-report"],
    ]) {
      await page.getByRole("menuitem", { name: menu, exact: true }).click();
      await expect(page.locator(ready).first()).toBeVisible({
        timeout: 90_000,
      });
      expect(
        await page.evaluate(
          () => document.documentElement.scrollWidth <= innerWidth,
        ),
        menu,
      ).toBeTruthy();
    }
  });
}

test("服务错误可重试，来源文件名特殊字符按文字呈现", async ({ page }) => {
  let fail = true;
  await page.route("**/api/reports/2026-09/sources", async (route) => {
    if (fail)
      return route.fulfill({ status: 503, json: { detail: "尚未就绪" } });
    const response = await route.fetch();
    const data = await response.json();
    data.files[0].file = '<img src=x onerror="alert(1)">.xlsx';
    await route.fulfill({ response, json: data });
  });
  await page.goto("/");
  await page
    .getByRole("button", { name: "数据来源与导入状态", exact: true })
    .click();
  await expect(
    page.getByText("数据尚未就绪，请启动后端或完成本地导入。", {
      exact: true,
    }),
  ).toBeVisible();
  fail = false;
  await page.getByRole("button", { name: /^重\s*试$/, exact: true }).click();
  await expect(
    page.getByText('<img src=x onerror="alert(1)">.xlsx', { exact: true }),
  ).toBeVisible();
  await expect(page.locator("td img")).toHaveCount(0);
});

test("利润图表还原：占比、三口径弹性及期间联动", async ({ page, request }) => {
  const response = await request.get("/api/reports/2026-09/costs");
  expect(response.ok()).toBeTruthy();
  const costs = await response.json();
  await page.goto("/");
  const panel = page.locator(".profit-waterfall");
  const conversion = panel.getByRole("region", { name: "收入与利润转化" });
  await expect(conversion).toBeVisible({ timeout: 30_000 });
  for (const [comparison, label] of [
    ["mom", "环比"],
    ["yoy", "同比"],
  ]) {
    await panel.getByText(label, { exact: true }).click();
    const actual = costs.find(
      (item: { basis: string; comparison: string }) =>
        item.basis === "actual" && item.comparison === comparison,
    );
    await expect(conversion.locator(".platform-receivable strong")).toHaveText(
      `${number(actual.leverage.platform_receivable, 10000)}万`,
    );
    for (const [basis, title] of [
      ["actual", "实际"],
      ["price_adjusted", "剔价"],
      ["price_refund_adjusted", "剔价剔退款"],
    ]) {
      await panel
        .locator(".conversion-toolbar")
        .getByText(title, { exact: true })
        .click();
      await expect(
        conversion.locator(".elasticity-item.active"),
      ).toHaveAttribute("data-basis", basis);
      await expect(
        page
          .getByLabel("利润分析口径")
          .getByRole("radio", { name: title, exact: true }),
      ).toBeChecked();
      await expect(
        page
          .getByLabel("利润比较期间")
          .getByRole("radio", { name: label, exact: true }),
      ).toBeChecked();
      const analysis = costs.find(
        (item: { basis: string; comparison: string }) =>
          item.basis === basis && item.comparison === comparison,
      );
      const item = conversion.locator(`[data-basis="${basis}"]`);
      await expect(item.locator("strong")).toHaveText(
        analysis.leverage.profit_elasticity === null
          ? "—"
          : `${number(analysis.leverage.profit_elasticity)}x`,
      );
      if (analysis.leverage.profit_elasticity === null)
        await expect(item.locator("small")).toContainText(/不完整|至少1%/);
    }
  }
  await panel.locator(".conversion-toolbar input:checked").focus();
  await page.keyboard.press("ArrowLeft");
  await expect(conversion.locator(".elasticity-item.active")).toHaveAttribute(
    "data-basis",
    "price_adjusted",
  );
  for (const width of [872, 1440, 1920]) {
    await page.setViewportSize({ width, height: 1000 });
    const items = await conversion
      .locator(".income-profit-grid > div")
      .evaluateAll((elements) =>
        elements.map((element) => {
          const rect = element.getBoundingClientRect();
          return {
            x: rect.x,
            y: rect.y,
            width: rect.width,
            height: rect.height,
          };
        }),
      );
    expect(items).toHaveLength(4);
    if (width >= 1440)
      expect(new Set(items.map((item) => item.y)).size).toBe(1);
    else expect(items[1].y).toBeGreaterThan(items[0].y);
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
    ).toBeTruthy();
  }
  await page.locator(".overview-chart-grid").scrollIntoViewIfNeeded();
  await page
    .locator(".overview-chart-grid")
    .getByText("查看图表数据", { exact: true })
    .nth(1)
    .focus();
  await page.keyboard.press("Enter");
  await expect(
    page.locator(".overview-chart-grid figcaption").nth(1),
  ).toContainText(/占比\d+\.\d{2}%/);
});
