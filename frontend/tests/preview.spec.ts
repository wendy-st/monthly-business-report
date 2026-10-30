import { test, expect } from "@playwright/test";

test("样例明确标记，产品搜索与文件选择路径可操作", async ({ page }) => {
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await page.goto("/?preview=1");
  await expect(page).toHaveTitle("月度经营报告");
  await expect(page.getByText("界面样例／合成数据")).toBeVisible();
  await expect(
    page.getByRole("heading", {
      name: "2026年9月月度经营分析报告",
      exact: true,
    }),
  ).toBeVisible();
  await page.getByRole("menuitem", { name: /3\. 产品经营分析/ }).click();
  await page.getByRole("button", { name: "LZF组", exact: true }).click();
  await page.getByRole("textbox", { name: "搜索款式" }).fill("DEMO-D");
  await expect(page.getByText("1 款", { exact: true })).toBeVisible();
  await page.getByRole("button", { name: "查看", exact: true }).click();
  await expect(page.getByRole("dialog")).toBeVisible();
  await page
    .getByRole("dialog")
    .getByText("剔价剔退款", { exact: true })
    .click();
  await expect(
    page.getByRole("radio", { name: "剔价剔退款", exact: true }),
  ).toBeChecked();
  await expect(page.getByText(/当前查看：剔价剔退款/)).toBeVisible();
  await page
    .getByRole("dialog")
    .getByRole("button", { name: "关闭", exact: true })
    .click();
  await page.getByRole("textbox", { name: "搜索款式" }).fill("不存在");
  await expect(page.getByText("筛选无结果，请重置筛选")).toBeVisible();
  await page.getByRole("button", { name: "重置筛选" }).click();
  await expect(page.getByText("24 款", { exact: true })).toBeVisible();
  await page.getByRole("button", { name: "数据导入与生成" }).click();
  await page.locator("input[type=file]").setInputFiles({
    name: "合成输入<b>.xlsx",
    mimeType:
      "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    buffer: Buffer.from("preview"),
  });
  await expect(page.getByText("合成输入<b>.xlsx")).toBeVisible();
  await expect(page.locator("td b")).toHaveCount(0);
  await expect(
    page.getByRole("button", { name: "生成本月报告" }),
  ).toBeDisabled();
  await page.getByRole("button", { name: "移除", exact: true }).click();
  await expect(page.getByText("尚未选择文件")).toBeVisible();
  expect(errors).toEqual([]);
});

for (const [width, height] of [
  [1024, 640],
  [1280, 720],
  [1440, 900],
  [1920, 1080],
]) {
  test(`桌面宽度${width}各模块无整页横向溢出`, async ({ page }) => {
    await page.setViewportSize({ width, height });
    await page.goto("/?preview=1");
    await expect(
      page.getByRole("heading", {
        name: "2026年9月月度经营分析报告",
        exact: true,
      }),
    ).toBeVisible();
    for (const name of [
      /1\. 经营总览/,
      /2\. 业务组经营分析/,
      /3\. 产品经营分析/,
      /4\. 库存周转/,
      /5\. LISTING业务分析报告/,
    ]) {
      await page.getByRole("menuitem", { name }).click();
      await expect(page.getByText("界面样例／合成数据")).toBeVisible();
      expect(
        await page.evaluate(
          () => document.documentElement.scrollWidth <= innerWidth,
        ),
      ).toBe(true);
    }
  });
}

test("业务分组、历史粒度、库存口径与LISTING导航对应当前对象", async ({
  page,
}) => {
  await page.goto("/?preview=1");
  await page.getByRole("menuitem", { name: /2\. 业务组经营分析/ }).click();
  await page.getByRole("menuitem", { name: "2.2 HCM组", exact: true }).click();
  await expect(
    page.getByRole("heading", { name: "HCM组经营表现" }),
  ).toBeVisible();
  await page.getByRole("tab", { name: "近6年LISTING盈收趋势" }).click();
  await expect(
    page.getByText("2. 季度趋势（最近12个季度）", { exact: true }),
  ).toBeVisible();
  const year = page.getByRole("checkbox", { name: "2021", exact: true });
  await year.uncheck();
  await expect(year).not.toBeChecked();
  await page.getByRole("menuitem", { name: /4\. 库存周转/ }).click();
  await page.getByRole("tab", { name: "Ash组", exact: true }).click();
  await expect(
    page.getByRole("heading", { name: "Ash组小组库存规模结构" }),
  ).toBeVisible();
  await page.getByText("含头程", { exact: true }).click();
  await expect(
    page.getByRole("radio", { name: "含头程", exact: true }),
  ).toBeChecked();
  await expect(page.getByText(/库存资金17.92万元/)).toBeVisible();
  await page.getByRole("menuitem", { name: /5\. LISTING业务分析报告/ }).click();
  await page
    .getByRole("menuitem", { name: "5.3 Ash组LISTING分析报告", exact: true })
    .click();
  await expect(
    page.getByRole("heading", { name: "5.3 Ash组LISTING分析报告" }),
  ).toBeVisible();
  await expect(page.getByRole("region", { name: "US站点报告" })).toBeVisible();
  await expect(page.getByRole("region", { name: "CA站点报告" })).toBeVisible();
  await expect(page.getByRole("button", { name: "保存为PDF" })).toBeDisabled();
});

test("侧栏工具可用键盘打开说明并返回焦点，页头滚动后仍可见", async ({
  page,
}) => {
  await page.goto("/?preview=1");
  const trigger = page.getByRole("button", { name: "口径说明", exact: true });
  await trigger.focus();
  await page.keyboard.press("Enter");
  await expect(page.getByRole("dialog", { name: "口径说明" })).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(page.getByRole("dialog")).not.toBeVisible();
  await expect(trigger).toBeFocused();
  await page.evaluate(() => window.scrollTo(0, 700));
  expect(
    (await page.getByRole("heading", { level: 1 }).boundingBox())?.y,
  ).toBeGreaterThanOrEqual(0);
});

test("原报告1440×1000布局基准：五模块关键区块的位置和尺寸", async ({
  page,
}) => {
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.goto("/?preview=1");
  // 基准来自用户原HTML的浏览器测量，不依赖实现中的CSS常量。
  async function rect(
    selector: string,
    expected: { x?: number; y?: number; width?: number; height?: number },
  ) {
    const bounds = await page.locator(selector).first().boundingBox();
    expect(bounds).not.toBeNull();
    for (const key of Object.keys(expected) as (keyof typeof expected)[]) {
      expect(
        Math.abs((bounds?.[key] ?? -1000) - (expected[key] ?? 0)),
        `${selector} ${key}`,
      ).toBeLessThan(1);
    }
  }
  await rect(".report-header", { x: 228, height: 113.59 });
  await rect(".conclusion-card", {
    x: 256,
    y: 127.59,
    width: 1156,
    height: 129.19,
  });
  await rect(".metric-grid", { y: 270.78, height: 139 });
  await rect(".overview-chart-grid > .report-panel", {
    y: 423.78,
    width: 770.84,
    height: 424.39,
  });
  await page
    .getByRole("menuitem", { name: "2. 业务组经营分析", exact: true })
    .click();
  await rect(".business-filters", { y: 188.59, height: 56 });
  await rect(".business-kpi-panel", { y: 258.59, height: 219.39 });
  await page
    .getByRole("menuitem", { name: "3. 产品经营分析", exact: true })
    .click();
  await rect(".product-filters", { y: 195.59, height: 71 });
  await rect(".product-page > .three-col-grid", { y: 373.59, height: 442.75 });
  expect(
    await page
      .locator(".filter-grid")
      .evaluate(
        (el) => getComputedStyle(el).gridTemplateColumns.split(" ").length,
      ),
  ).toBe(10);
  await page
    .getByRole("menuitem", { name: "4. 库存周转", exact: true })
    .click();
  await rect(".inventory-page .metric-grid", { y: 228.59, height: 139 });
  await rect(".inventory-conclusion", { y: 381.59, height: 203.67 });
  await rect(".warehouse-panel", { y: 664.27, height: 149.39 });
  await page
    .getByRole("menuitem", { name: "5. LISTING业务分析报告", exact: true })
    .click();
  await rect(".listing-group-summary", { y: 214.59, height: 148 });
  await rect(".listing-report", { y: 418.59, width: 1156 });
});
