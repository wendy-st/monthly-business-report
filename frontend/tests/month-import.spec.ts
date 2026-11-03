import { test, expect } from "@playwright/test";
import type { ImportBatch } from "../src/features/reports/import-api";

test.setTimeout(90_000);
test.use({ viewport: { width: 1440, height: 1000 } });

test("月份切换更新请求、标题、比较期间，并保留9月入口", async ({
  page,
  request,
}) => {
  await page.route("**/api/reports", (route) =>
    route.fulfill({ json: { months: ["2026-10", "2026-09"] } }),
  );
  const octoberRequests: string[] = [];
  await page.route("**/api/reports/2026-10/**", async (route) => {
    octoberRequests.push(route.request().url());
    const response = await request.get(
      route.request().url().replace("2026-10", "2026-09"),
    );
    const data: Record<string, unknown> = await response.json();
    if ("report_month" in data) data.report_month = "2026-10";
    await route.fulfill({ json: data });
  });
  await page.goto("/");
  await expect(page.getByRole("heading", { level: 1 })).toHaveText(
    "2026年9月月度经营分析报告",
  );
  await page
    .getByRole("combobox", { name: "报告月份", exact: true })
    .selectOption("2026-10");
  await expect(page.getByRole("heading", { level: 1 })).toHaveText(
    "2026年10月月度经营分析报告",
  );
  await expect(page.locator(".report-period")).toContainText("环比：2026年9月");
  await expect(page.locator(".report-period")).toContainText(
    "同比：2025年10月",
  );
  await page
    .getByRole("menuitem", { name: "月度经营分析", exact: true })
    .click();
  await expect(page.locator(".business-waterfall")).toContainText(
    "环比 · 对比期 2026-09",
  );
  expect(octoberRequests.some((url) => url.includes("financial"))).toBeTruthy();
  await page
    .getByRole("combobox", { name: "报告月份", exact: true })
    .selectOption("2026-09");
  await expect(page.getByRole("heading", { level: 1 })).toHaveText(
    "2026年9月月度经营分析报告",
  );
  await expect(page.locator(".business-waterfall")).toContainText(
    "环比 · 对比期 2026-08",
  );
});

test("上传、处理中防重复提交、结果反馈及成功后切换月份", async ({ page }) => {
  let registered = false;
  let reads = 0;
  const uploaded: string[] = [];
  let batch: ImportBatch = {
    id: "synthetic-import",
    month: "2026-10",
    status: "uploading",
    detail: "已创建导入批次",
    files: [],
  };
  await page.route("**/api/reports", (route) =>
    route.fulfill({
      json: { months: registered ? ["2026-10", "2026-09"] : ["2026-09"] },
    }),
  );
  await page.route("**/api/imports**", async (route) => {
    const path = new URL(route.request().url()).pathname;
    if (route.request().method() === "PUT") {
      uploaded.push(decodeURIComponent(path.split("/").at(-1) ?? ""));
      batch = {
        ...batch,
        files: [...uploaded],
        detail: `已上传${uploaded.length}份文件，尚未导入`,
      };
    } else if (path.endsWith("/run")) {
      batch = { ...batch, status: "running", detail: "正在检查源表并生成报告" };
    } else if (route.request().method() === "GET") {
      reads += 1;
      if (reads > 1) {
        registered = true;
        batch = { ...batch, status: "succeeded", detail: "导入及报告生成完成" };
      }
    }
    await route.fulfill({
      json: batch,
      status: path.endsWith("/run") ? 202 : 200,
    });
  });
  await page.goto("/");
  await page
    .getByRole("button", { name: "数据来源与导入状态", exact: true })
    .click();
  const submit = page.getByRole("button", {
    name: "检查并生成报告",
    exact: true,
  });
  await expect(submit).toBeDisabled();
  await expect(page.getByLabel("导入月份", { exact: true })).toHaveValue(
    "2026-10",
  );
  await page.getByLabel("配套Excel文件", { exact: true }).setInputFiles([
    {
      name: "经营报告-2026-10.xlsx",
      mimeType: "application/octet-stream",
      buffer: Buffer.from("synthetic-test-only"),
    },
    {
      name: "库存-2026.xlsx",
      mimeType: "application/octet-stream",
      buffer: Buffer.from("synthetic-test-only"),
    },
  ]);
  await submit.focus();
  await page.keyboard.press("Enter");
  await expect(
    page.getByText("正在检查源表并生成报告", { exact: true }),
  ).toBeVisible();
  await expect(submit).toBeDisabled();
  await expect(page.getByLabel("导入月份", { exact: true })).toBeDisabled();
  await expect(
    page.getByText("导入及报告生成完成", { exact: true }),
  ).toBeVisible();
  expect(uploaded).toEqual(["经营报告-2026-10.xlsx", "库存-2026.xlsx"]);
  await expect(
    page
      .getByRole("combobox", { name: "报告月份", exact: true })
      .locator("option[value='2026-10']"),
  ).toHaveCount(1);
  await expect(
    page.getByRole("button", { name: "查看2026年10月报告", exact: true }),
  ).toBeVisible();
  await page.setViewportSize({ width: 1024, height: 800 });
  const overflow = await page.evaluate(
    () => document.documentElement.scrollWidth > window.innerWidth + 1,
  );
  expect(overflow).toBeFalsy();
});

test("导入冲突保持已选文件并显示原报告未覆盖", async ({ page }) => {
  await page.route("**/api/imports", (route) =>
    route.fulfill({
      status: 409,
      json: { detail: "2026-10已有不同来源，原报告未覆盖" },
    }),
  );
  await page.goto("/");
  await page
    .getByRole("button", { name: "数据来源与导入状态", exact: true })
    .click();
  await page.getByLabel("配套Excel文件", { exact: true }).setInputFiles({
    name: "经营报告<&>.xlsx",
    mimeType: "application/octet-stream",
    buffer: Buffer.from("synthetic-test-only"),
  });
  await page
    .getByRole("button", { name: "检查并生成报告", exact: true })
    .click();
  await expect(
    page.getByText("2026-10已有不同来源，原报告未覆盖", { exact: true }),
  ).toBeVisible();
  await expect(
    page.getByText("已选择1份：经营报告<&>.xlsx", { exact: true }),
  ).toBeVisible();
  await expect(
    page.getByRole("button", { name: "检查并生成报告", exact: true }),
  ).toBeEnabled();
  await expect(page.getByRole("heading", { level: 1 })).toHaveText(
    "2026年9月月度经营分析报告",
  );
});
