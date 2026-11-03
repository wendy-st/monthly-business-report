import { test, expect } from "@playwright/test";
import type { FinancialView } from "../src/features/reports/contracts";

test.setTimeout(90_000);

test("品类页按原报告排列，固定一级品类并恢复诊断明细", async ({ page }) => {
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await page.setViewportSize({ width: 1920, height: 1080 });
  await page.goto("/");
  await page
    .getByRole("menuitem", { name: "品类经营分析", exact: true })
    .click();
  const scope = page.locator(".product-page");
  await expect(
    scope.getByText("三、款式盈利 & 成本诊断明细", { exact: true }),
  ).toBeVisible({ timeout: 60_000 });
  await expect(scope.locator(":scope > .section-heading")).toHaveText([
    "一、最终盈亏结果毛利判断产品成本，净利判断费用后的最终结果。",
    "二、产品成本与毛利诊断成本率与利润均由后端按当前范围核算。",
    "三、款式盈利 & 成本诊断明细",
  ]);
  const grids = scope.locator(":scope > .three-col-grid");
  for (const grid of await grids.all()) {
    const boxes = await grid.locator(":scope > *").evaluateAll((elements) =>
      elements.map((element) => {
        const box = element.getBoundingClientRect();
        return { top: box.top, left: box.left, right: box.right };
      }),
    );
    expect(boxes).toHaveLength(3);
    expect(boxes[0].top).toBe(boxes[1].top);
    expect(boxes[1].top).toBe(boxes[2].top);
    expect(boxes[0].right).toBeLessThan(boxes[1].left);
    expect(boxes[1].right).toBeLessThan(boxes[2].left);
  }
  await expect(
    scope.getByText("一级品类盈利矩阵", { exact: true }),
  ).toBeVisible();
  await expect(
    scope.getByRole("radio", { name: "小组", exact: true }),
  ).toHaveCount(0);
  for (const title of [
    "FBA费用&海外仓费用率",
    "产品营业利润率",
    "营销推广费用率",
  ]) {
    await expect(
      scope.getByRole("columnheader", { name: title, exact: true }),
    ).toHaveCount(3);
  }
  const headers = [
    "范围",
    "销售成本率",
    "头程费率",
    "其他成本率",
    "毛利率",
    "FBA费用&海外仓费用率",
    "产品营业利润率",
    "营销推广费用率",
    "净利率",
  ];
  for (const level of ["一级", "二级", "三级"]) {
    await expect(
      scope
        .getByRole("region", {
          name: `${level}品类产品毛利成本矩阵数据`,
          exact: true,
        })
        .getByRole("columnheader"),
    ).toHaveText(headers);
  }
  await expect(scope.getByLabel("成本分析结论")).toContainText(
    "成本分析结论 · 环比",
  );
  await scope
    .getByLabel("成本比较期间")
    .getByText("同比", { exact: true })
    .click();
  await expect(scope.getByLabel("成本分析结论")).toContainText(
    "成本分析结论 · 同比",
  );
  const details = scope.locator(".category-details");
  for (const title of [
    "款式信息",
    "销售规模",
    "盈利结果",
    "成本退款",
    "原币均价",
  ]) {
    await expect(
      details.getByRole("columnheader", { name: title, exact: true }),
    ).toBeVisible();
  }
  await expect(details.locator(".product-diagnosis").first()).toContainText(
    /基准|待核验/,
  );
  await expect(
    scope.getByText("费用杠杆与金额影响", { exact: true }),
  ).toHaveCount(0);
  await expect(scope.getByText(/LISTING 历史验证/)).toHaveCount(0);
  await scope.getByRole("button", { name: /\// }).first().click();
  const dialog = page.getByRole("dialog");
  await expect(
    dialog.getByText("经营底表来源行", { exact: true }),
  ).toBeVisible();
  await expect(dialog.locator(".report-chart")).toHaveCount(0);
  await dialog.getByRole("button", { name: "关闭明细", exact: true }).click();
  expect(errors).toEqual([]);
});

test("二三级品类按毛利率排序，首屏十行且下拉保留完整记录", async ({
  page,
  request,
}) => {
  await page.setViewportSize({ width: 1920, height: 1080 });
  await page.goto("/");
  await page
    .getByRole("menuitem", { name: "品类经营分析", exact: true })
    .click();
  for (const group of ["", "Ash"]) {
    if (group)
      await page.getByRole("button", { name: group, exact: true }).click();
    const data: FinancialView = await (
      await request.get(
        `/api/reports/2026-09/financial?view=products&group=${group}`,
      )
    ).json();
    for (const [level, grain] of [
      ["二级", "category2"],
      ["三级", "category3"],
    ]) {
      const rows = data.breakdowns[grain]
        .filter((row) => row.record_count > 0)
        .sort((a, b) => {
          if (a.current.gross_margin == null)
            return b.current.gross_margin == null ? 0 : 1;
          if (b.current.gross_margin == null) return -1;
          return (
            Number(b.current.gross_margin) - Number(a.current.gross_margin)
          );
        });
      const region = page.getByRole("region", {
        name: `${level}品类产品毛利成本矩阵数据`,
        exact: true,
      });
      await expect(region.locator("tbody tr td:first-child")).toHaveText(
        rows.map((row) => row.label),
      );
      if (rows.length > 10) {
        const layout = await region.evaluate((el) => ({
          height: el.clientHeight,
          tenRows: Array.from(el.querySelectorAll("tr"))
            .slice(0, 11)
            .reduce((sum, row) => sum + row.getBoundingClientRect().height, 0),
          scroll: el.scrollHeight,
        }));
        expect(Math.abs(layout.height - layout.tenRows)).toBeLessThan(2);
        expect(layout.scroll).toBeGreaterThan(layout.height);
        await region.focus();
        await page.keyboard.press("End");
        await expect
          .poll(() => region.evaluate((el) => el.scrollTop))
          .toBeGreaterThan(0);
        await expect(region.locator("tbody tr").last()).toBeInViewport();
      }
    }
  }
});

test("款式七项筛选、销售额及退款率排序、25条分页与筛选复位", async ({
  page,
  request,
}) => {
  const response = await request.get(
    "/api/reports/2026-09/financial?view=products",
  );
  const data: FinancialView = await response.json();
  const rows = data.breakdowns.styles.filter((row) => row.record_count > 0);
  await page.goto("/");
  await page
    .getByRole("menuitem", { name: "品类经营分析", exact: true })
    .click();
  const details = page.locator(".category-details");
  const bodyRows = details
    .getByRole("row")
    .filter({ has: page.getByRole("button", { name: /^查看 / }) });
  await expect(bodyRows).toHaveCount(25);
  await details.getByTitle("2", { exact: true }).click();
  await expect(bodyRows.first().getByRole("button")).toHaveAttribute(
    "aria-label",
    `查看 ${rows[25].label}`,
  );
  for (const label of [
    "盈利款",
    "亏损款",
    "产品成本",
    "费用端",
    "待核验",
    "退款率",
    "全部",
  ]) {
    await details.getByRole("button", { name: label, exact: true }).click();
    const expected = rows
      .filter((row) => {
        if (label === "盈利款")
          return row.current.profit !== null && Number(row.current.profit) >= 0;
        if (label === "亏损款")
          return row.current.profit !== null && Number(row.current.profit) < 0;
        if (label === "退款率")
          return (
            row.current.refund_rate !== null &&
            row.current.sales_qty !== null &&
            Number(row.current.sales_qty) >= 100
          );
        if (label === "全部") return true;
        return (
          row.diagnosis ===
          { 产品成本: "产品成本问题", 费用端: "费用端问题", 待核验: "待核验" }[
            label
          ]
        );
      })
      .sort(
        (a, b) =>
          Number(
            b.current[label === "退款率" ? "refund_rate" : "revenue"] ?? 0,
          ) -
          Number(
            a.current[label === "退款率" ? "refund_rate" : "revenue"] ?? 0,
          ),
      );
    await expect(details.locator(".product-detail-toolbar")).toContainText(
      `${expected.length} 个款式`,
    );
    await expect(bodyRows).toHaveCount(Math.min(25, expected.length));
    if (expected.length)
      await expect(bodyRows.first().getByRole("button")).toHaveAttribute(
        "aria-label",
        `查看 ${expected[0].label}`,
      );
  }
  await details.getByTitle("2", { exact: true }).click();
  await page.getByRole("button", { name: "LZF", exact: true }).click();
  const filtered = (await (
    await request.get("/api/reports/2026-09/financial?view=products&group=LZF")
  ).json()) as FinancialView;
  await expect(bodyRows.first().getByRole("button")).toHaveAttribute(
    "aria-label",
    `查看 ${filtered.breakdowns.styles.find((row) => row.record_count > 0)!.label}`,
  );
  await bodyRows.first().getByRole("button").focus();
  await page.keyboard.press("Enter");
  await expect(page.getByRole("dialog")).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(page.getByRole("dialog")).not.toBeVisible();
});

for (const [width, height] of [
  [1024, 640],
  [1280, 720],
  [1440, 900],
  [1920, 1080],
]) {
  test(`品类页${width}宽筛选与矩阵不重叠，整页不溢出`, async ({ page }) => {
    await page.setViewportSize({ width, height });
    await page.goto("/");
    await page
      .getByRole("menuitem", { name: "品类经营分析", exact: true })
      .click();
    await expect(
      page.getByText("一级品类盈利矩阵", { exact: true }),
    ).toBeVisible();
    const geometry = await page.locator(".product-page").evaluate((element) => {
      const filters = element.querySelector(".product-filters")!;
      const groups = element.querySelector(".product-groups")!;
      return {
        overflow: document.documentElement.scrollWidth > innerWidth,
        filterBottom: filters.getBoundingClientRect().bottom,
        groupsTop: groups.getBoundingClientRect().top,
      };
    });
    expect(geometry.overflow).toBe(false);
    expect(geometry.filterBottom).toBeLessThanOrEqual(geometry.groupsTop);
    await page.getByRole("button", { name: "LZF", exact: true }).click();
    await expect(
      page.locator(".filter-field").filter({
        has: page.getByRole("combobox", { name: "小组", exact: true }),
      }),
    ).toContainText("LZF");
    await page.getByRole("button", { name: "重置筛选", exact: true }).click();
    await expect(
      page.locator(".filter-field").filter({
        has: page.getByRole("combobox", { name: "小组", exact: true }),
      }),
    ).toContainText("全部");
  });
}
