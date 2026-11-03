import { test, expect } from "@playwright/test";

test.setTimeout(90_000);

for (const width of [1024, 1440, 1920]) {
  test(`${width}宽各模块顶部筛选滚动后紧贴报告页头`, async ({ page }) => {
    await page.setViewportSize({ width, height: 900 });
    const errors: string[] = [];
    page.on("pageerror", (error) => errors.push(error.message));
    await page.goto("/");
    for (const [menu, selector, ready] of [
      ["月度经营分析", ".business-filters", ".business-kpi-panel"],
      ["年度经营分析", ".history-filter-toolbar", ".history-dashboard canvas"],
      ["品类经营分析", ".product-page > .sticky-filter-bar", ".product-matrix"],
      ["库存周转", ".inventory-filter-bar", ".inventory-conclusion"],
    ]) {
      await page.getByRole("menuitem", { name: menu, exact: true }).click();
      await expect(page.locator(ready).first()).toBeVisible({
        timeout: 60_000,
      });
      if (menu === "库存周转") {
        await page.getByRole("tab", { name: "LZF组", exact: true }).click();
        await expect(
          page.getByRole("combobox", { name: "小组库存站点" }),
        ).toBeVisible();
        await expect(
          page.locator(".inventory-page .inventory-section-title").first(),
        ).toHaveText("小组库存状况分析", { timeout: 60_000 });
        await expect(
          page.locator(".inventory-page .inventory-section-title").nth(1),
        ).toHaveText("小组库存规模结构");
        await expect(
          page.locator(".inventory-page .inventory-section-title").last(),
        ).toHaveText("LISTING／款式库存明细");
        await expect(page.locator(".inventory-season-card table")).toHaveCount(
          0,
        );
      }
      for (const zoom of [1, 1.25, 1.5]) {
        await page.evaluate((value) => {
          document.documentElement.style.zoom = String(value);
          window.scrollTo(0, 1000);
        }, zoom);
        await expect
          .poll(async () =>
            page.locator(selector).evaluate((element) => {
              // 切换筛选后的异步渲染可能恢复滚动位置，稳定后再次滚动核验。
              window.scrollTo(0, 1000);
              const header = document.querySelector(".report-header")!;
              return Math.abs(
                element.getBoundingClientRect().top -
                  header.getBoundingClientRect().bottom,
              );
            }),
          )
          .toBeLessThan(2);
        expect(
          await page.evaluate(
            () => document.documentElement.scrollWidth <= innerWidth,
          ),
        ).toBe(true);
      }
      await page.evaluate(() => {
        document.documentElement.style.zoom = "1";
        window.scrollTo(0, 0);
      });
    }
    expect(errors).toEqual([]);
  });
}

test("库存概况及明细周转变化沿用红升绿降箭头", async ({ page }) => {
  await page.goto("/");
  await page.getByRole("menuitem", { name: "库存周转", exact: true }).click();
  await page.getByRole("tab", { name: "HCM组", exact: true }).click();
  const comparisons = page.locator(".inventory-season-metrics strong").nth(3);
  await expect(comparisons.getByText("↑ 92.2天", { exact: true })).toHaveCSS(
    "color",
    "rgb(180, 35, 24)",
  );
  await expect(comparisons.getByText("↓ 41.2天", { exact: true })).toHaveCSS(
    "color",
    "rgb(21, 128, 61)",
  );
  const row = page.locator(
    '.inventory-season-details tr[data-row-key="HCM|US|RG806"]',
  );
  await expect(row.getByText("↓ 168.2天", { exact: true })).toHaveCSS(
    "color",
    "rgb(21, 128, 61)",
  );
  await expect(row.getByText("↓ 11,301.2天", { exact: true })).toHaveCSS(
    "color",
    "rgb(21, 128, 61)",
  );
});
