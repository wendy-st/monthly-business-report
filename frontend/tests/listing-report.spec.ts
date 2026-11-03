import { test, expect } from "@playwright/test";
import os from "node:os";
import path from "node:path";
import type { ListingView } from "../src/features/reports/ListingPage";

test.setTimeout(180_000);
test.use({ viewport: { width: 1440, height: 1000 } });
test.beforeEach(({ page }) => page.setDefaultTimeout(15_000));

test("各组LISTING问题数量、站点范围及停运分析范围正确", async ({ request }) => {
  for (const group of [
    "LZF",
    "HCM",
    "Ash",
    "KAYO-北美",
    "KAYO-欧日",
    "薄底水鞋",
  ]) {
    const response = await request.get(
      `/api/reports/2026-09/listing?group=${encodeURIComponent(group)}`,
    );
    expect(response.ok()).toBeTruthy();
    const data: ListingView = await response.json();
    expect(data.excluded_sites.sort()).toEqual(["ES", "FR", "IT", "MX"]);
    for (const item of data.items) {
      expect(item.group).toBe(group);
      expect(data.excluded_sites).not.toContain(item.site);
      if (group === "LZF") expect(item.site).toBe("US");
      expect(item.issues.length).toBeGreaterThanOrEqual(1);
      expect(item.issues.length).toBeLessThanOrEqual(5);
      expect(new Set(item.issues.map((issue) => issue.key)).size).toBe(
        item.issues.length,
      );
      if (item.mode === "retired") {
        for (const issue of item.issues)
          expect(["erosion", "erosion_cost", "cleanup"]).toContain(issue.key);
      } else if (!item.business?.record_count) {
        for (const issue of item.issues)
          expect(["inventory", "aged"]).toContain(issue.key);
      } else {
        expect(item.issues.length).toBeGreaterThanOrEqual(3);
        expect(
          item.issues.some((issue) => issue.key === "inventory"),
        ).toBeTruthy();
      }
    }
  }
});

test("库存对象只分析库存，WP005等无本期事项对象退出清单", async ({ page }) => {
  await page.goto("/");
  await page
    .getByRole("menuitem", { name: "LISTING分析问题清单", exact: true })
    .click();
  await expect(page.getByRole("region", { name: "CA站点报告", exact: true })).toHaveCount(0);
  for (const listing of ["KR001", "KSK10", "KSK20"]) {
    const card = page.getByRole("article", {
      name: `LZF/US/${listing}问题清单`,
      exact: true,
    });
    await expect(
      card.getByText("无经营记录仍有库存占用", { exact: true }),
    ).toBeVisible();
    await expect(card.getByRole("listitem")).toHaveCount(1);
    await expect(
      card.getByText(/销售资料待核查|利润归因待核查|净收入|净利润/),
    ).toHaveCount(0);
    await expect(card).toContainText("本地仓库存");
    await expect(card).toContainText("需明确消化或清理安排");
  }
  await expect(
    page.getByRole("article", { name: "LZF/US/WP005问题清单", exact: true }),
  ).toHaveCount(0);
});

test("逐LISTING简明结论与API一致，切组及打印按钮可用", async ({
  page,
  request,
}) => {
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  page.on("console", (message) => {
    if (message.type() === "error") errors.push(message.text());
  });
  const data: ListingView = await (
    await request.get("/api/reports/2026-09/listing?group=LZF")
  ).json();
  const expected = data.items.find(
    (item) => item.site === "US" && item.listing === "SP001",
  );
  expect(expected).toBeDefined();
  await page.addInitScript(() => {
    window.print = () => {
      document.body.dataset.printed = "yes";
    };
  });
  await page.goto("/");
  await page
    .getByRole("menuitem", { name: "LISTING分析问题清单", exact: true })
    .click();
  const card = page.getByRole("article", {
    name: "LZF/US/SP001问题清单",
    exact: true,
  });
  await expect(card).toBeVisible();
  for (const issue of expected?.issues ?? [])
    await expect(card.getByText(issue.detail, { exact: true })).toBeVisible();
  await page.getByRole("menuitem", { name: "HCM", exact: true }).click();
  await expect(
    page.getByRole("heading", {
      name: "HCM · LISTING分析问题清单",
      exact: true,
    }),
  ).toBeVisible();
  await expect(page.locator(".listing-issue-report").first()).toContainText(
    "HCM",
  );
  await page.getByRole("menuitem", { name: "LZF", exact: true }).click();
  await expect(card).toBeVisible();
  const print = page.getByRole("button", { name: "保存为PDF", exact: true });
  await print.focus();
  await page.keyboard.press("Enter");
  await expect(page.locator("body")).toHaveAttribute("data-printed", "yes");
  await card.scrollIntoViewIfNeeded();
  await page.screenshot({
    path: path.join(os.tmpdir(), "listing-issues-desktop.png"),
  });
  for (const width of [1024, 1280, 1440, 1920]) {
    await page.setViewportSize({ width, height: 1000 });
    for (const zoom of [1, 1.25, 1.5, 2]) {
      await page.locator("body").evaluate((element, value) => {
        element.style.zoom = String(value);
      }, zoom);
      expect(
        await page.evaluate(
          () => document.documentElement.scrollWidth <= window.innerWidth + 1,
        ),
      ).toBeTruthy();
      await expect(print).toBeVisible();
    }
  }
  expect(errors).toEqual([]);
});

test("特殊字符按文字呈现，停运不展示销售和正常补货分析", async ({
  page,
  request,
}) => {
  const data: ListingView = await (
    await request.get("/api/reports/2026-09/listing?group=LZF")
  ).json();
  const first = data.items[0];
  const content = "<img src=x onerror=alert(1)> & 待核查";
  await page.route("**/listing?*", (route) =>
    route.fulfill({
      json: {
        ...data,
        items: [
          {
            ...first,
            mode: "retired",
            position: "已停运",
            issues: [
              {
                key: "erosion",
                title: "利润侵蚀",
                detail: content,
                status: "待核查",
              },
              {
                key: "erosion_cost",
                title: "侵蚀来源",
                detail: "仓储费用持续发生",
                status: "关注",
              },
              {
                key: "cleanup",
                title: "库存清理",
                detail: "剩余库存待清理",
                status: "关注",
              },
            ],
          },
        ],
      },
    }),
  );
  await page.goto("/");
  await page
    .getByRole("menuitem", { name: "LISTING分析问题清单", exact: true })
    .click();
  const card = page.locator(".listing-issue-report");
  await expect(card.getByText(content, { exact: true })).toBeVisible();
  await expect(card.locator("img")).toHaveCount(0);
  await expect(card.getByText(/净收入|销售规模|补货|剔价/)).toHaveCount(0);
  await expect(
    card.getByLabel("利润侵蚀与库存清理").getByRole("listitem"),
  ).toHaveCount(3);
});

test("请求失败可重试并显示真实空状态", async ({ page }) => {
  let calls = 0;
  await page.route("**/listing?*", (route) => {
    calls++;
    return calls === 1
      ? route.fulfill({ status: 503 })
      : route.fulfill({
          json: {
            items: [],
            excluded_sites: ["MX", "FR", "ES", "IT"],
            source_note: "",
          },
        });
  });
  await page.goto("/");
  await page
    .getByRole("menuitem", { name: "LISTING分析问题清单", exact: true })
    .click();
  await expect(page.getByRole("alert")).toContainText("数据尚未就绪");
  await page.getByRole("button", { name: "重试", exact: true }).click();
  await expect(
    page.getByText("该小组当前没有可展示LISTING", { exact: true }),
  ).toBeVisible();
});
