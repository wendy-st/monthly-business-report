import { test, expect } from "@playwright/test";
import type { BusinessView } from "../src/features/reports/business-contracts";

test.setTimeout(180_000);
test.use({ viewport: { width: 1440, height: 1000 } });

async function enter(page: import("@playwright/test").Page) {
  await page.goto("/");
  await page
    .getByRole("menuitem", { name: "2. 业务组经营分析", exact: true })
    .click();
  await expect(
    page.locator(".business-page .metric-value").first(),
  ).toBeVisible();
  await expect(page.locator(".business-refund-table tbody tr")).toHaveCount(11);
}

test("整页六组真实指标、三级品类和明细完整，保留含MX同比", async ({
  page,
  request,
}) => {
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await enter(page);
  for (const [index, group] of [
    "LZF",
    "HCM",
    "Ash",
    "KAYO-北美",
    "KAYO-欧日",
    "薄底水鞋",
  ].entries()) {
    await page
      .getByRole("menuitem", { name: `2.${index + 1} ${group}`, exact: true })
      .click();
    const params = new URLSearchParams({
      group,
      ...(group === "KAYO-欧日" ? { site: "JP" } : {}),
      view: "business",
    });
    const response = await request.get(
      `/api/reports/2026-09/financial?${params}`,
    );
    expect(response.ok()).toBeTruthy();
    const data: BusinessView = await response.json();
    const revenue = (
      Number(data.summary.current.revenue) / 10000
    ).toLocaleString("zh-CN", {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    });
    await expect(
      page.locator(".business-page .metric-value").nth(1),
    ).toHaveText(`${revenue}万${data.business.scope}`);
    for (const title of [
      "三级品类销售额占比",
      "净利润分析瀑布图",
      "LISTING 平均售价与退货率对照",
      "费用明细：退款影响拆解",
      "费用杠杆与金额影响拆解",
      "LISTING 经营明细",
      "盈利 LISTING",
      "亏损 LISTING",
    ]) {
      await expect(page.getByText(title, { exact: true })).toBeVisible();
    }
    await expect(page.locator(".business-conclusions li")).toHaveCount(4);
    await expect(
      page.locator(".business-full-listings tbody tr:not(.business-subtotal)"),
    ).toHaveCount(data.business.listings.length);
    if (group === "LZF") {
      await expect(
        page
          .locator(".metric-card")
          .first()
          .locator(".metric-comparison")
          .nth(1),
      ).toContainText("26,950");
      expect(data.business.categories.length).toBeGreaterThan(1);
      await expect(page.locator(".business-matrix-site").first()).toContainText(
        "US 站点",
      );
      await expect(
        page.locator(".business-full-listings tbody tr").first(),
      ).toContainText("US");
      await expect(
        page.locator(".business-charts").getByRole("img").nth(1),
      ).toHaveAttribute("aria-label", /SEEKWAY厚底水鞋/);
    }
  }
  expect(errors).toEqual([]);
});

test("比较期间独立，费用口径切换保留退款期间，盈亏两表独立搜索", async ({
  page,
}) => {
  await enter(page);
  const waterfall = page.getByLabel("业务组利润比较期间");
  await waterfall.getByText("同比", { exact: true }).click();
  await expect(
    page.locator(".business-waterfall > .report-panel-body > .sample-note"),
  ).toContainText("2025-09");
  await expect(page.locator(".business-refund-table thead")).toContainText(
    "实际环比",
  );
  await page
    .getByLabel("费用比较期间")
    .getByText("同比", { exact: true })
    .click();
  await expect(page.locator(".business-refund-table thead")).toContainText(
    "实际同比",
  );
  await page
    .getByLabel("业务组费用分析口径")
    .getByText("剔价剔退款", { exact: true })
    .click();
  await expect(
    page.locator(
      ".business-leverage-panel > .report-panel-body > .sample-note",
    ),
  ).toContainText("剔价剔退款口径");
  await expect(
    page.locator(
      ".business-leverage-panel > .report-panel-body > .sample-note",
    ),
  ).toContainText("2025-09");
  for (const [label, text] of [
    ["查看剔价口径说明", "标准化毛销售额"],
    ["查看剔价剔退款口径说明", "80%退款返佣规则"],
    ["查看金额变化率计算公式", "成本冲回保留负号"],
    ["查看业务组金额影响计算公式", "成本冲回保留符号"],
    ["查看11项收支净影响计算公式", "赔偿收入不按费用方向相加"],
  ]) {
    const button = page.getByRole("button", { name: label, exact: true });
    await button.click();
    await expect(page.locator(".formula-help-content:visible")).toContainText(
      text,
    );
    await page.keyboard.press("Escape");
    await expect(button).toBeFocused();
    await expect(page.locator(".formula-help-content:visible")).toHaveCount(0);
  }
  const loss = page.getByRole("region", { name: "亏损 LISTING", exact: true });
  const initialLoss = await loss.locator("tbody tr").count();
  await page
    .getByRole("searchbox", { name: "搜索盈利LISTING", exact: true })
    .fill("不存在的LISTING");
  await expect(
    page.getByRole("region", { name: "盈利 LISTING", exact: true }),
  ).toContainText("当前筛选无记录");
  await expect(loss.locator("tbody tr")).toHaveCount(initialLoss);
  await expect(
    page.getByRole("searchbox", { name: "搜索亏损LISTING", exact: true }),
  ).toHaveValue("");
});

test("同名LISTING按站点隔离，欧洲桶和JP默认值正确", async ({ page }) => {
  await enter(page);
  await page
    .getByRole("combobox", { name: "业务组LISTING", exact: true })
    .click();
  await page.getByRole("option", { name: "CA/KP001", exact: true }).click();
  await expect(page.locator(".business-full-listings tbody tr")).toHaveCount(1);
  await expect(
    page.locator(".business-full-listings tbody tr").first(),
  ).toContainText("CA");
  await expect(
    page.locator(".business-full-listings tbody tr").first(),
  ).toContainText("KP001");
  await page
    .getByRole("menuitem", { name: "2.5 KAYO-欧日", exact: true })
    .click();
  await expect(
    page.locator(".business-page .metric-value").first(),
  ).toContainText("KAYO-欧日 / JP");
  await page.getByRole("combobox", { name: "业务组站点", exact: true }).click();
  await page.getByRole("option", { name: "DE/IT/FR/ES", exact: true }).click();
  await expect(
    page.locator(".business-page .metric-value").first(),
  ).toContainText("DE/IT/FR/ES");
  await expect(page.locator(".business-full-listings tbody")).not.toContainText(
    "JP",
  );
});

test("金额影响采用有符号核算，保留冲回且缺失不显示为零", async ({ page }) => {
  await page.route("**/api/reports/2026-09/costs?*", async (route) => {
    const response = await route.fetch();
    const items = await response.json();
    for (const item of items) {
      item.leverage.impact_delivery = "150";
      item.leverage.current_amount_delivery = "-30";
      item.leverage.theoretical_amount_delivery = "120";
      item.leverage.impact_storage = null;
      item.rows.find(
        (row: { key: string }) => row.key === "delivery",
      ).profit_impact = "-90";
    }
    await route.fulfill({ response, json: items });
  });
  await enter(page);
  const delivery = page.locator('.business-leverage [data-expense="delivery"]');
  await expect(delivery.locator("strong")).toHaveText("+150.00");
  await expect(delivery.locator("small")).toHaveText(
    "理论 120.00 · 本期 -30.00",
  );
  await expect(
    page.locator('.business-leverage [data-expense="storage"] strong'),
  ).toHaveText("—");
});

test("业务页四种桌面尺寸及缩放无整页横向溢出，键盘可进入表格", async ({
  page,
}) => {
  await enter(page);
  for (const width of [1024, 1280, 1440, 1920]) {
    await page.setViewportSize({ width, height: 900 });
    for (const zoom of [1, 1.25, 1.5, 2]) {
      await page.evaluate((value) => {
        document.body.style.zoom = String(value);
      }, zoom);
      await expect
        .poll(
          () =>
            page.evaluate(
              () => document.documentElement.scrollWidth <= innerWidth,
            ),
          { message: `${width}宽 / ${zoom}缩放`, timeout: 5000 },
        )
        .toBeTruthy();
    }
  }
  await page.evaluate(() => {
    document.body.style.zoom = "1";
  });
  const table = page.getByRole("region", {
    name: "LISTING经营明细",
    exact: true,
  });
  await table.focus();
  await expect(table).toBeFocused();
});

test("业务页失败可重试，LISTING特殊字符按文本展示", async ({ page }) => {
  let failed = false;
  const special = '<img src=x onerror="window.businessInjected=1">&合成';
  await page.route("**/financial?group=LZF&view=business", async (route) => {
    if (!failed) {
      failed = true;
      await route.fulfill({ status: 503, body: "{}" });
      return;
    }
    const response = await route.fetch();
    const data = await response.json();
    data.business.listings[0].dimensions.listing = special;
    await route.fulfill({ response, json: data });
  });
  await page.goto("/");
  await page
    .getByRole("menuitem", { name: "2. 业务组经营分析", exact: true })
    .click();
  await expect(
    page.getByText("9月数据尚未就绪，请启动后端或完成本地导入。", {
      exact: true,
    }),
  ).toBeVisible();
  await page.getByRole("button", { name: /^重\s*试$/ }).click();
  await expect(page.locator(".business-full-listings tbody")).toContainText(
    special,
  );
  expect(
    await page.evaluate(() => Reflect.get(window, "businessInjected")),
  ).toBeUndefined();
  await expect(page.locator(".business-full-listings img")).toHaveCount(0);
});
