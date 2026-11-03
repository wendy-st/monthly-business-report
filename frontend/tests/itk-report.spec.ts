import { expect, test, type Page } from "@playwright/test";
import type {
  ComparisonView,
  OverviewView,
} from "../src/features/itk/contracts";
import { format } from "../src/features/itk/presentation";

test.use({ viewport: { width: 1440, height: 1000 }, actionTimeout: 10_000 });
test.setTimeout(120_000);
const panel = (page: Page, name = "品牌同类对比") =>
  page.getByRole("tabpanel", { name, exact: true });
async function enter(page: Page) {
  await page.goto("/");
  await page
    .getByRole("menuitem", { name: "ITK大盘数据分析", exact: true })
    .click();
  await expect(panel(page).locator(".itk-benchmark")).toHaveCount(3);
  await expect(page.locator(".itk-header .itk-primary")).toHaveAttribute(
    "href",
    /comparison.csv/,
  );
}

test("ITK入口、CSV核算结果、默认品牌与空竞品标杆", async ({
  page,
  request,
}) => {
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  page.on("console", (m) => {
    if (m.type() === "error") errors.push(m.text());
  });
  await enter(page);
  const navigation = await page.getByRole("menuitem").allTextContents();
  expect(navigation.indexOf("ITK大盘数据分析")).toBe(
    navigation.indexOf("库存周转") + 1,
  );
  const data: ComparisonView = await (
    await request.get("/api/reports/2026-09/itk/comparison")
  ).json();
  await expect(panel(page).locator(".itk-target")).toContainText(
    format(data.summaries[0].units),
  );
  await expect(panel(page).locator(".itk-legend span")).toHaveText(
    data.selected.map((s, i) => s + (i ? "" : "（目标）")),
  );
  const peak = await panel(page).locator(".itk-benchmark").first().innerText();
  await panel(page)
    .getByRole("button", { name: "仅看目标品牌", exact: true })
    .click();
  await expect(panel(page).locator(".itk-legend span")).toHaveCount(1);
  await expect(panel(page).locator(".itk-benchmark").last()).toContainText(
    "请勾选",
  );
  expect(await panel(page).locator(".itk-benchmark").first().innerText()).toBe(
    peak,
  );
  await expect(panel(page).locator(".itk-target")).toContainText(
    `第 ${data.summaries[0].units_rank} / ${data.summaries[0].units_total} 名`,
  );
  expect(errors).toEqual([]);
});

test("筛选独立、日期首尾联动、明细搜索保留及分页导出", async ({
  page,
  request,
}) => {
  await enter(page);
  await page.getByRole("tab", { name: "大盘概览", exact: true }).click();
  const overview = panel(page, "大盘概览");
  const data: OverviewView = await (
    await request.get("/api/reports/2026-09/itk/overview")
  ).json();
  await expect(overview.locator(".itk-stat-value").first()).toHaveText(
    format(data.totals.sales, "sales"),
  );
  const before = await overview.locator(".itk-stats").innerText();
  await overview
    .getByRole("textbox", { name: "搜索品牌或细分品类" })
    .fill("SEEKWAY");
  expect(await overview.locator(".itk-stats").innerText()).toBe(before);
  const detailHref = await overview
    .getByRole("link", { name: "导出当前明细" })
    .getAttribute("href");
  const headerHref = await page
    .locator(".itk-header .itk-primary")
    .getAttribute("href");
  const full = await request.get(headerHref!);
  const detail = await request.get(detailHref!);
  expect(full.ok() && detail.ok()).toBeTruthy();
  expect((await detail.text()).split("\r\n").length).toBeLessThan(
    (await full.text()).split("\r\n").length,
  );
  expect((await detail.text()).split("\r\n").length).toBeGreaterThan(16);
  await overview
    .getByRole("combobox", { name: "品类", exact: true })
    .selectOption(data.rows[0].category);
  await expect(overview.locator(".itk-updating")).toHaveCount(0);
  await expect(
    overview.getByRole("textbox", { name: "搜索品牌或细分品类" }),
  ).toHaveValue("SEEKWAY");
  await page.getByRole("tab", { name: "品牌同类对比", exact: true }).click();
  await expect(
    panel(page).getByRole("combobox", { name: "起始年月" }),
  ).toHaveValue(data.scope.start);
  await panel(page)
    .getByRole("combobox", { name: "起始年月" })
    .selectOption(data.scope.end);
  await expect(
    panel(page).getByRole("combobox", { name: "结束年月" }),
  ).toHaveValue(data.scope.end);
  await page.getByRole("tab", { name: "大盘概览", exact: true }).click();
  await expect(
    overview.getByRole("combobox", { name: "起始年月" }),
  ).toHaveValue(data.scope.start);
  await expect(
    overview.getByRole("textbox", { name: "搜索品牌或细分品类" }),
  ).toHaveValue("SEEKWAY");
});

test("目标切换、手选竞品、完整月度导出及键盘页签", async ({
  page,
  request,
}) => {
  await enter(page);
  await panel(page)
    .getByRole("button", { name: "RIVMOUNT", exact: true })
    .click();
  await expect(panel(page).locator(".itk-target")).toContainText(
    "RIVMOUNT（目标）",
  );
  await panel(page)
    .getByRole("button", { name: "仅看目标品牌", exact: true })
    .click();
  await expect(panel(page).locator(".itk-legend span")).toHaveCount(1);
  const box = panel(page).getByRole("checkbox").first();
  await box.scrollIntoViewIfNeeded();
  const scroll = await page.evaluate(() => window.scrollY);
  await box.check();
  await expect(panel(page).locator(".itk-legend span")).toHaveCount(2);
  expect(
    Math.abs((await page.evaluate(() => window.scrollY)) - scroll),
  ).toBeLessThan(5);
  const href = await page
    .locator(".itk-header .itk-primary")
    .getAttribute("href");
  const response = await request.get(href!);
  expect(response.ok()).toBeTruthy();
  const body = await response.body();
  expect(body.subarray(0, 3).equals(Buffer.from([239, 187, 191]))).toBeTruthy();
  const lines = body.toString("utf8").trimEnd().split("\r\n");
  expect(lines[0].split(",")).toHaveLength(22);
  expect(lines.length).toBe(25);
  await page.getByRole("tab", { name: "品牌同类对比", exact: true }).focus();
  await page.keyboard.press("ArrowRight");
  await expect(
    page.getByRole("tab", { name: "大盘概览", exact: true }),
  ).toBeFocused();
});

test("接口错误、非法参数、空状态及特殊字符按文本呈现", async ({
  page,
  request,
}) => {
  expect(
    (
      await request.get("/api/reports/2026-09/itk/overview?start=2026-99")
    ).status(),
  ).toBe(422);
  expect(
    (
      await request.get(
        "/api/reports/2026-09/itk/overview.csv?details=true&sort=bad",
      )
    ).status(),
  ).toBe(422);
  expect(
    (
      await request.get("/api/reports/2026-09/itk/comparison?peers=bad")
    ).status(),
  ).toBe(422);
  let fail = true;
  await page.route("**/itk/options", async (route) => {
    if (fail) {
      fail = false;
      await route.fulfill({ status: 503, json: { detail: "暂不可用" } });
    } else await route.continue();
  });
  await page.route("**/itk/overview?*", async (route) => {
    const response = await route.fetch();
    const body = (await response.json()) as OverviewView;
    body.rows[0].brand = '<img src=x onerror="window.itkInjected=true">';
    await route.fulfill({ response, json: body });
  });
  await page.goto("/");
  await page
    .getByRole("menuitem", { name: "ITK大盘数据分析", exact: true })
    .click();
  await expect(page.locator(".itk-dashboard").getByRole("alert")).toBeVisible();
  await page
    .locator(".itk-dashboard")
    .getByRole("button", { name: /重\s*试/ })
    .click();
  await expect(panel(page).locator(".itk-benchmark")).toHaveCount(3);
  await page.getByRole("tab", { name: "大盘概览", exact: true }).click();
  const overview = panel(page, "大盘概览");
  await overview
    .getByRole("textbox", { name: "搜索品牌或细分品类" })
    .fill("<img");
  await expect(overview.locator("tbody")).toContainText(
    '<img src=x onerror="window.itkInjected=true">',
  );
  expect(await page.evaluate(() => "itkInjected" in window)).toBeFalsy();
  await overview
    .getByRole("textbox", { name: "搜索品牌或细分品类" })
    .fill("NO_SUCH_ITK_BRAND");
  await expect(overview.locator("tbody")).toContainText("暂无符合条件的数据");
});

test("桌面宽度、缩放和吸顶筛选无整页溢出", async ({ page }) => {
  await enter(page);
  for (const width of [1024, 1280, 1440, 1920]) {
    await page.setViewportSize({ width, height: 1000 });
    for (const zoom of [1, 1.25, 1.5, 2]) {
      await page.evaluate((z) => {
        document.documentElement.style.zoom = String(z);
      }, zoom);
      expect(
        await page.evaluate(
          () =>
            document.documentElement.scrollWidth <=
            document.documentElement.clientWidth + 1,
        ),
      ).toBeTruthy();
    }
  }
  await page.evaluate(() => {
    document.documentElement.style.zoom = "1";
  });
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.evaluate(() => window.scrollTo(0, 650));
  const sticky = await panel(page).locator(".itk-sticky").boundingBox();
  const header = await page.locator(".report-header").boundingBox();
  expect(sticky!.y).toBeGreaterThanOrEqual(header!.y + header!.height - 1);
  await page.getByRole("tab", { name: "大盘概览", exact: true }).click();
  for (const width of [1024, 1280, 1440, 1920]) {
    await page.setViewportSize({ width, height: 1000 });
    expect(
      await page.evaluate(
        () =>
          document.documentElement.scrollWidth <=
          document.documentElement.clientWidth + 1,
      ),
    ).toBeTruthy();
  }
});
