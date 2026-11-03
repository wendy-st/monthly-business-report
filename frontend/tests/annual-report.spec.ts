import { expect, test, type Page } from "@playwright/test";
import type { HistoryView } from "../src/features/reports/contracts";

test.setTimeout(180_000);
test.use({ viewport: { width: 1440, height: 1000 } });
const amount = (value: string | null) =>
  `${(Number(value) / 10000).toFixed(2)}万`;

async function enter(page: Page) {
  await page.goto("/");
  await page
    .getByRole("menuitem", { name: "年度经营分析", exact: true })
    .click();
  await expect(page.locator(".history-dashboard-kpis")).toBeVisible({
    timeout: 30_000,
  });
}

test("原稿完整框架、六组累计指标和源表期间一致", async ({ page, request }) => {
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await enter(page);
  await expect(page.locator(".annual-page h3")).toHaveText([
    "1. 年度趋势（近6年）",
    "2. 季度趋势（最近12个季度）",
    "3. 月度趋势（最近24个月）",
    "4. 关键指标明细（年度）",
    "5. LISTING业务拆解（2026年1-9月）",
    "6. LISTING盈利能力象限（2026年1-9月，销售额Top25）",
    "7. 成本费用项占比趋势",
    "逐LISTING历史最佳月与2026年9月对比",
  ]);
  for (const group of [
    "LZF",
    "HCM",
    "Ash",
    "KAYO-北美",
    "KAYO-欧日",
    "薄底水鞋",
  ]) {
    const response = await request.get(
      `/api/reports/2026-09/history?group=${encodeURIComponent(group)}`,
    );
    const data: HistoryView = await response.json();
    await page.getByRole("menuitem", { name: group, exact: true }).click();
    await expect(page.locator(".history-kpi-profit strong")).toHaveText(
      amount(data.summary.current.profit),
    );
    await expect(page.locator(".history-kpi-revenue strong")).toHaveText(
      amount(data.summary.current.revenue),
    );
    await expect(page.locator(".history-kpi-units strong")).toHaveText(
      Number(data.summary.current.units).toLocaleString("zh-CN"),
    );
    await expect(page.locator(".history-kpi-margin strong")).toHaveText(
      `${(Number(data.summary.current.margin) * 100).toFixed(2)}%`,
    );
  }
  await expect(page.locator(".history-peak-section")).toContainText(
    "LISTING数据源总表",
  );
  await expect(page.locator(".history-peak-section")).toContainText(
    "2020-04 至 2026-09",
  );
  expect(errors).toEqual([]);
});

test("趋势LISTING和年份联动，业务拆解独立，年份至少保留一项", async ({
  page,
  request,
}) => {
  await enter(page);
  await page.getByRole("combobox", { name: "历史站点", exact: true }).click();
  await page.getByRole("option", { name: "US", exact: true }).click();
  await expect(
    page.locator(".history-listing-table-wrap tbody tr"),
  ).toHaveCount(6);
  await page
    .getByRole("combobox", { name: "历史LISTING", exact: true })
    .click();
  await page.getByRole("option", { name: "SP001", exact: true }).click();
  await expect(
    page.getByRole("heading", { name: "SP001近6年LISTING盈收管理看板" }),
  ).toBeVisible();
  await expect(
    page.locator(".history-listing-table-wrap tbody tr"),
  ).toHaveCount(6);
  await page
    .getByRole("searchbox", { name: "历史最佳月搜索" })
    .fill("无匹配__");
  const years = page.getByRole("group", { name: "历史年份", exact: true });
  await years.getByRole("button", { name: "2025年", exact: true }).click();
  await expect(page.locator(".history-dashboard-kpis")).toBeVisible();
  await years.getByRole("button", { name: "2026年YTD", exact: true }).click();
  const response = await request.get(
    "/api/reports/2026-09/history?group=LZF&site=US&listing=SP001&years=2025",
  );
  const data: HistoryView = await response.json();
  await expect(page.locator(".history-kpi-revenue strong")).toHaveText(
    amount(data.summary.current.revenue),
  );
  await expect(page.locator(".history-kpi-main").first()).toContainText(
    "2025年",
  );
  await expect(
    page.getByRole("searchbox", { name: "历史最佳月搜索" }),
  ).toHaveValue("无匹配__");
  await years.getByRole("button", { name: "2025年", exact: true }).click();
  await expect(
    years.getByRole("button", { name: "2025年", exact: true }),
  ).toHaveAttribute("aria-pressed", "true");
  await page.getByRole("searchbox", { name: "历史最佳月搜索" }).fill("");
  await expect(page.locator(".history-peak-table tbody tr")).toHaveCount(1);
  await page
    .getByRole("region", { name: "历史最佳月对比", exact: true })
    .focus();
  await expect(
    page.getByRole("region", { name: "历史最佳月对比", exact: true }),
  ).toBeFocused();
  await expect(page.locator(".history-peak-table thead th")).toHaveCount(12);
});

test("错误可重试，源表名称与LISTING特殊字符按文本展示", async ({ page }) => {
  let fail = true;
  const special = '<img src=x onerror="alert(1)">';
  await page.route("**/api/reports/2026-09/history?**", async (route) => {
    if (fail)
      return route.fulfill({ status: 503, json: { detail: "合成失败" } });
    const response = await route.fetch();
    const data: HistoryView = await response.json();
    data.source_file = `${special}.xlsx`;
    data.best_months[0].dimensions.listing = special;
    await route.fulfill({ response, json: data });
  });
  await page.goto("/");
  await page
    .getByRole("menuitem", { name: "年度经营分析", exact: true })
    .click();
  await expect(
    page.getByText("数据尚未就绪，请启动后端或完成本地导入。"),
  ).toBeVisible();
  fail = false;
  await page.getByRole("button", { name: /^重\s*试$/ }).click();
  await expect(page.locator(".history-peak-table")).toContainText(special);
  await expect(page.locator(".history-peak-section")).toContainText(
    `${special}.xlsx`,
  );
  await expect(page.locator(".annual-page img")).toHaveCount(0);
});

test("无记录保留破折号和空状态，筛选可继续操作", async ({ page }) => {
  await page.route("**/api/reports/2026-09/history?**", async (route) => {
    const response = await route.fetch();
    const data: HistoryView = await response.json();
    data.annual =
      data.monthly =
      data.quarterly =
      data.listings =
      data.best_months =
      data.cost_trends =
        [];
    data.summary.current = data.summary.year_ago = {};
    data.summary.changes = {};
    data.insights = { sales: null, profit: null, weak: null };
    await route.fulfill({ response, json: data });
  });
  await enter(page);
  await expect(page.locator(".history-dashboard-kpi strong")).toHaveText([
    "—",
    "—",
    "—",
    "—",
  ]);
  await expect(
    page.getByText("当前筛选无匹配趋势数据", { exact: true }),
  ).toHaveCount(3);
  await expect(
    page.getByRole("combobox", { name: "历史站点", exact: true }),
  ).toBeEnabled();
  await expect(
    page.getByRole("heading", { name: "7. 成本费用项占比趋势", exact: true }),
  ).toBeVisible();
});

test("年度四种桌面宽度及缩放无整页横向溢出", async ({ page }) => {
  await enter(page);
  for (const width of [1024, 1280, 1440, 1920]) {
    await page.setViewportSize({ width, height: 1000 });
    for (const zoom of [1, 1.25, 1.5]) {
      await page.evaluate((value) => {
        document.body.style.zoom = String(value);
      }, zoom);
      await expect
        .poll(
          () =>
            page.evaluate(
              () => document.documentElement.scrollWidth <= innerWidth,
            ),
          { message: `${width}/${zoom}` },
        )
        .toBeTruthy();
    }
  }
});

test("财年与半年筛选联动、跨年月份及未来期间状态正确", async ({
  page,
  request,
}) => {
  await enter(page);
  const choose = async (name: string, option: string) => {
    await page.getByRole("combobox", { name, exact: true }).click();
    await page.getByRole("option", { name: option, exact: true }).click();
    await expect(page.locator(".history-dashboard-kpis")).toBeVisible();
  };
  await choose("年度口径", "财务年度（4—3月）");
  const response = await request.get(
    "/api/reports/2026-09/history?group=LZF&year_basis=fiscal",
  );
  const full: HistoryView = await response.json();
  expect(full.month_order).toEqual([4, 5, 6, 7, 8, 9, 10, 11, 12, 1, 2, 3]);
  await expect(page.locator(".history-kpi-profit strong")).toHaveText(
    amount(full.summary.current.profit),
  );
  await expect(
    page.locator(".history-annual-table tbody tr").first(),
  ).toContainText("2026/27财年YTD");
  await choose("年度统计区间", "上半年（4—9月）");
  await expect(page.locator(".history-kpi-profit strong")).toHaveText(
    amount(full.summary.current.profit),
  );
  await expect(page.locator(".history-kpi-main").first()).toContainText(
    "2026-04至2026-09",
  );
  await choose("年度统计区间", "下半年（10—3月）");
  await expect(page.locator(".history-kpi-profit strong")).toHaveText("—");
  await expect(page.locator(".history-kpi-main").first()).toContainText(
    "暂无数据",
  );
  await expect(page.locator(".history-peak-table tbody tr")).toHaveCount(7);
  const years = page.getByRole("group", { name: "历史年份", exact: true });
  await years.getByRole("button", { name: /^2025\/26财年/ }).click();
  await expect(page.locator(".history-dashboard-kpis")).toBeVisible();
  await years.getByRole("button", { name: /^2026\/27财年/ }).click();
  const priorResponse = await request.get(
    "/api/reports/2026-09/history?group=LZF&year_basis=fiscal&period_scope=h2&years=2025",
  );
  const prior: HistoryView = await priorResponse.json();
  expect(prior.monthly.map((row) => row.key)).toEqual([
    "2025-10",
    "2025-11",
    "2025-12",
    "2026-01",
    "2026-02",
    "2026-03",
  ]);
  expect(prior.quarterly.map((row) => row.key)).toEqual(["2025-Q3", "2025-Q4"]);
  await expect(page.locator(".history-kpi-profit strong")).toHaveText(
    amount(prior.summary.current.profit),
  );
  await expect(
    page.locator(".history-dashboard figcaption").last(),
  ).toContainText("2026-03");
  await page.locator(".history-annual-table").scrollIntoViewIfNeeded();
  await page.evaluate(() => scrollBy(0, -220));
  const sticky = await page.evaluate(() => ({
    top: document
      .querySelector(".history-filter-toolbar")!
      .getBoundingClientRect().top,
    header: document.querySelector(".report-header")!.getBoundingClientRect()
      .bottom,
    scroll: scrollY,
  }));
  expect(sticky.scroll).toBeGreaterThan(500);
  expect(Math.abs(sticky.top - sticky.header)).toBeLessThan(2);
  await choose("年度口径", "自然年度（1—12月）");
  expect(await page.evaluate(() => scrollY)).toBeGreaterThan(500);
  const invalid = await request.get(
    "/api/reports/2026-09/history?year_basis=invalid",
  );
  expect(invalid.status()).toBe(422);
});
