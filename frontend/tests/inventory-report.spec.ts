import { expect, test } from "@playwright/test";
import type { InventoryView } from "../src/features/reports/contracts";

test.setTimeout(180_000);
test.use({ viewport: { width: 1920, height: 1080 }, actionTimeout: 15_000 });

test.beforeEach(async ({ page }) => {
  await page.goto("/");
  await page.getByRole("menuitem", { name: "库存周转", exact: true }).click();
  await page.locator(".inventory-conclusion").waitFor({ timeout: 60_000 });
});

test("总览五区、四项指标、金额切换和一级品类筛选复原", async ({
  page,
  request,
}, info) => {
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await expect(page.locator(".inventory-section-title")).toHaveText([
    "1库存总览",
    "2库存规模",
    "3库存周转",
    "4未来库存趋势",
    "5FBA库龄",
  ]);
  await expect(page.locator(".inventory-page .metric-value")).toHaveText([
    "4,003.62万本月",
    "1,638,607本月",
    "383.3天本月",
    "182.6天本月",
  ]);
  const response = await request.get("/api/reports/2026-09/inventory");
  expect(response.ok()).toBeTruthy();
  const data = (await response.json()) as InventoryView;
  expect(Number(data.kpis[2].current)).toBeCloseTo(383.309145021193, 8);
  expect(Number(data.kpis[3].current)).toBeCloseTo(182.626131737128, 8);
  expect(
    data.turnover.some(
      (row) => row.label === "2025-12" && row.values.days_qty !== null,
    ),
  ).toBe(true);
  await page.screenshot({ path: info.outputPath("inventory-overview.png") });
  await page.getByText("含头程", { exact: true }).click();
  await expect(
    page.getByText("金额周转天数（含头程）", { exact: true }),
  ).toBeVisible();
  await page.getByRole("combobox", { name: "品类周转一级品类" }).click();
  await page.getByTitle("水鞋", { exact: true }).click();
  const table = page
    .locator(".inventory-detail-table")
    .filter({ hasText: "品类库存周转天数（FBA+海外仓）" });
  const cells = table.locator("tbody tr[data-row-key] td:first-child");
  expect(await cells.count()).toBeGreaterThan(1);
  for (const cell of await cells.all()) await expect(cell).toHaveText("水鞋");
  await expect(page.locator(".inventory-holding-chart canvas")).toHaveCount(2);
  expect(errors).toEqual([]);
});

test("小组筛选重算库存和周转，风险切换保留原报告款式", async ({
  page,
  request,
}, info) => {
  await page.getByRole("tab", { name: "LZF组", exact: true }).click();
  await expect(page.locator(".inventory-season-card")).toBeVisible();
  await expect(page.locator(".inventory-age-cards")).toHaveCount(0);
  await expect(page.locator(".inventory-season-core")).toContainText(
    "当前周转为143.9天",
  );
  await expect(page.locator(".inventory-season-badges")).toContainText(
    "提示LISTING",
  );
  await expect(page.locator(".inventory-season-badges")).toContainText(
    "提示款式",
  );
  await expect(page.locator(".inventory-season-badges")).not.toContainText(
    "高风险",
  );
  await page.getByRole("tab", { name: /款\s*式/ }).click();
  await expect(
    page
      .locator(".inventory-season-details tbody")
      .getByText("SP006-AE054 星河", { exact: true }),
  ).toBeVisible();
  await page.getByRole("combobox", { name: "小组库存LISTING" }).click();
  const filtering = page.waitForResponse(
    (response) =>
      response.url().includes("/inventory?") &&
      response.url().includes("listing=SP001"),
    { timeout: 60_000 },
  );
  await page.getByTitle("SP001", { exact: true }).click();
  expect((await filtering).ok()).toBeTruthy();
  const detail = page.locator(".inventory-detail-table").first();
  await expect(detail.getByText("SP001", { exact: true })).toBeVisible();
  await expect(detail.locator("tbody tr[data-row-key]")).toHaveCount(1, {
    timeout: 60_000,
  });
  const response = await request.get(
    "/api/reports/2026-09/inventory?group=LZF&listing=SP001",
  );
  const filtered = (await response.json()) as InventoryView;
  expect(filtered.summary.values.quantity).toBe("107562");
  expect(
    Number(filtered.breakdowns.listing_turnover[0].values.days_qty),
  ).toBeCloseTo(80.86615602424946, 8);
  expect(filtered.options.listing.length).toBeGreaterThan(1);
  await page.getByRole("combobox", { name: "小组库存三级品类" }).click();
  await page.getByTitle("SEEKWAY厚底水鞋", { exact: true }).click();
  await expect(detail.locator("tbody tr[data-row-key]")).toHaveCount(1, {
    timeout: 60_000,
  });
  await page.getByRole("button", { name: "重置筛选", exact: true }).click();
  await expect(detail.locator("tbody tr[data-row-key]")).toHaveCount(6);
  await page.evaluate(() => window.scrollTo(0, 0));
  await page.screenshot({ path: info.outputPath("inventory-group.png") });
});

test("LISTING汇总核算、在售筛选联动，款式下钻排除零库存SKU", async ({
  page,
  request,
}) => {
  const response = await request.get(
    "/api/reports/2026-09/inventory?group=Ash",
  );
  expect(response.ok()).toBeTruthy();
  const data = (await response.json()) as InventoryView;
  const result = data.seasonal.find(
    (row) => row.dimensions.site === "CA" && row.dimensions.listing === "SG102",
  )!;
  expect(result.risk.phase).toBe("备货期");
  expect(result.risk.season_start).toBe("2026-10");
  expect(result.risk.season_end).toBe("2027-03");
  expect(result.risk.peak_month).toBe("2026-11");
  expect(result.risk.score).toBe(0);
  expect(result.skus).toEqual([]);
  expect(Number(result.values.shipping_rate)).toBeCloseTo(
    Number(result.values.local_days) / Number(result.values.shipping_days),
    10,
  );
  const style = data.seasonal_styles.find((row) =>
    row.skus.some((sku) => sku.dimensions.sku === "SMRG102 Black 2XL"),
  )!;
  const sku = style.skus.find(
    (row) => row.dimensions.sku === "SMRG102 Black 2XL",
  )!;
  expect(Number(sku.values.shipping_rate)).toBeCloseTo(
    Number(sku.values.local_days) / Number(sku.values.shipping_days),
    10,
  );
  expect(Number(sku.values.order_rate)).toBeCloseTo(
    Number(sku.values.total_days) / Number(sku.values.order_days),
    10,
  );
  expect(Number(result.values.age270_rate)).toBeCloseTo(
    Number(result.values.age270) / Number(result.values.in_stock),
    10,
  );
  await page.getByRole("tab", { name: "Ash组", exact: true }).click();
  const row = page.locator(
    '.inventory-season-details tr[data-row-key="Ash|CA|SG102"]',
  );
  await row.waitFor({ timeout: 60_000 });
  await expect(row).toContainText("2026-10～2027-03");
  await expect(row).toContainText("峰值：2026-11");
  await expect(row.getByRole("button")).toHaveCount(0);
  await page.getByRole("tab", { name: /款\s*式/ }).click();
  await page
    .locator(`.inventory-season-details tr[data-row-key="${style.key}"]`)
    .getByRole("button")
    .first()
    .click();
  const details = page
    .getByRole("table", { name: "SKU库存满足率明细" })
    .filter({ hasText: "SMRG102 Black 2XL" });
  await expect(details).toContainText("SMRG102 Black 2XL");
  await expect(details).toContainText("24.93%");
  await expect(details).toContainText("39.11%");
  await expect(details).toContainText("三仓库存未达到保底需求");
  expect(
    data.seasonal_styles
      .flatMap((row) => row.skus)
      .every((row) => row.values.has_inventory !== "0"),
  ).toBe(true);
  await page.getByRole("tab", { name: "HCM组", exact: true }).click();
  await expect(page.locator(".inventory-season-card")).toBeVisible();
  await page.getByRole("combobox", { name: "小组库存站点" }).click();
  const filtering = page.waitForResponse(
    (response) =>
      response.url().includes("/inventory?") &&
      response.url().includes("site=CA"),
  );
  await page.getByTitle("CA", { exact: true }).click();
  const filtered = (await (await filtering).json()) as InventoryView;
  expect(filtered.seasonal.length).toBeGreaterThan(0);
  expect(filtered.seasonal.every((row) => row.dimensions.site === "CA")).toBe(
    true,
  );
  await page.getByRole("tab", { name: "LISTING", exact: true }).click();
  await expect(
    page.locator(".inventory-season-details tr[data-row-key]"),
  ).toHaveCount(filtered.seasonal.length);
  await expect(page.locator(".inventory-season-card")).not.toContainText(
    "US /",
  );
});

test("FBA库龄按完整在库分母展示，键盘展开并切换SKU明细", async ({
  page,
}, info) => {
  const group = page
    .locator(".inventory-age-card")
    .filter({ hasText: "HCM组" });
  await expect(group).toContainText("在库量 164,156");
  const button = group.getByRole("button", {
    name: "HCM US RG802 180天以上SKU明细",
    exact: true,
  });
  await button.focus();
  await button.press("Enter");
  await expect(button).toHaveAttribute("aria-expanded", "true");
  await expect(group.locator(".inventory-age-expanded")).toBeVisible();
  await expect(group.locator(".inventory-age-skus thead")).toContainText(
    "FNSKU",
  );
  await expect(group.locator(".inventory-age-skus tbody tr")).not.toHaveCount(
    0,
  );
  const other = group.getByRole("button", {
    name: "HCM US RG802 270天以上SKU明细",
    exact: true,
  });
  await other.click();
  await expect(button).toHaveAttribute("aria-expanded", "false");
  await expect(other).toHaveAttribute("aria-expanded", "true");
  await group.locator(".inventory-age-expanded").scrollIntoViewIfNeeded();
  await page.screenshot({ path: info.outputPath("inventory-age.png") });
  await other.click();
  await expect(group.locator(".inventory-age-expanded")).toHaveCount(0);
});

test("四档桌面视口、缩放与筛选吸顶无页面横向溢出", async ({ page }) => {
  await page.getByRole("tab", { name: "LZF组", exact: true }).click();
  await page.locator(".inventory-season-card").waitFor({ timeout: 60_000 });
  for (const [width, height] of [
    [1024, 640],
    [1280, 720],
    [1440, 900],
    [1920, 1080],
  ]) {
    await page.setViewportSize({ width, height });
    for (const zoom of [1, 1.25, 1.5]) {
      await page.evaluate((value) => {
        document.documentElement.style.zoom = String(value);
        window.scrollTo(0, 1100);
      }, zoom);
      await expect
        .poll(() =>
          page
            .locator(".inventory-filter-bar")
            .evaluate((element) =>
              Math.abs(
                element.getBoundingClientRect().top -
                  document
                    .querySelector(".report-header")!
                    .getBoundingClientRect().bottom,
              ),
            ),
        )
        .toBeLessThan(2);
      await expect
        .poll(() =>
          page.evaluate(
            () => document.documentElement.scrollWidth <= innerWidth,
          ),
        )
        .toBe(true);
    }
  }
});

test("接口参数由后端校验，库存读取失败可以重试", async ({ page, request }) => {
  const invalid = await request.get(
    `/api/reports/2026-09/inventory?site=${"X".repeat(21)}`,
  );
  expect(invalid.status()).toBe(422);
  let fail = true;
  await page.route("**/api/reports/2026-09/inventory*", (route) =>
    fail ? route.fulfill({ status: 503, body: "" }) : route.continue(),
  );
  await page.reload();
  await page.getByRole("menuitem", { name: "库存周转", exact: true }).click();
  await expect(
    page.getByText("数据尚未就绪，请启动后端或完成本地导入。", {
      exact: true,
    }),
  ).toBeVisible();
  fail = false;
  await page.getByRole("button", { name: /重\s*试/ }).click();
  await expect(page.locator(".inventory-conclusion")).toBeVisible();
});
