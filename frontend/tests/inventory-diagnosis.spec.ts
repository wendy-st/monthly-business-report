import { expect, test } from "@playwright/test";

test.use({ viewport: { width: 1920, height: 1080 } });

test("库存说明区分本地发货准备、整体正常和双指标冗余", async ({ page }) => {
  await page.goto("/");
  await page.getByRole("menuitem", { name: "库存周转", exact: true }).click();
  await page.getByRole("tab", { name: "LZF组", exact: true }).click();
  const normal = page.locator(
    '.inventory-season-details tr[data-row-key="LZF|US|SP001"]',
  );
  await expect(normal).toContainText("可覆盖47.5天");
  await expect(normal).toContainText("发货标准51天，缺口3.5天");
  await expect(normal).toContainText("保底下单标准107天，超出20.4天");
  await expect(normal).toContainText("整体库存正常，本地仓需关注发货准备");
  await expect(
    normal.getByText("整体库存正常，本地仓需关注发货准备", { exact: true }),
  ).toHaveCSS("color", "rgb(37, 99, 235)");
  const redundant = page.locator(
    '.inventory-season-details tr[data-row-key="LZF|US|KP001"]',
  );
  await expect(redundant).toContainText("满足率290.2%，为标准的2.9倍");
  await expect(redundant).toContainText("满足率201.5%，为标准的2.0倍");
  await expect(redundant).toContainText("库存冗余：两项满足率均超过150%");
  const conclusion = redundant.getByText("库存冗余：两项满足率均超过150%", {
    exact: true,
  });
  await expect(conclusion).toHaveCSS("color", "rgb(180, 35, 24)");
  await expect(conclusion).toHaveCSS("font-weight", "700");
  const partialStandard = page.locator(
    '.inventory-season-details tr[data-row-key="LZF|US|SR001"]',
  );
  await expect(partialStandard).toContainText("保底下单标准110天");
  await expect(partialStandard).toContainText("库存冗余：两项满足率均超过150%");
  await expect(page.locator(".inventory-season-core")).toContainText(
    "库存冗余",
  );
  await expect(page.locator(".inventory-season-card table")).toHaveCount(0);
});

test("剔除FBA同步异常记录后保留有效库龄占比", async ({ page }) => {
  await page.goto("/");
  await page.getByRole("menuitem", { name: "库存周转", exact: true }).click();
  await page.getByRole("tab", { name: "薄底水鞋US", exact: true }).click();
  const card = page.locator(".inventory-season-card");
  await expect(card).toContainText("薄底水鞋US");
  await expect(card).not.toContainText("FBA库龄数据异常");
  const row = page.locator(
    '.inventory-season-details tr[data-row-key="薄底水鞋|US|SK001"]',
  );
  await expect(row).toContainText("0.00%");
  await expect(row).not.toContainText("FBA库龄数据异常");
  await expect(row).toContainText("三仓库存未达到保底需求");
});
