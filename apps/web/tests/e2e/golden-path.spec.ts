import { expect, test } from "@playwright/test";

test("quote to confirmation", async ({ page }) => {
  await page.goto("/");
  await expect(page.getByText("SalesPilot")).toBeVisible();
  await page.getByPlaceholder("告诉我要做什么…").fill("给华辰设计的张总报 120 台 X1");
  await page.getByRole("button", { name: "发送" }).click();
  await expect(page.getByText("报价单预览")).toBeVisible({ timeout: 30_000 });
  await page.getByRole("button", { name: "确认生成" }).click();
  await expect(page.getByText("报价已生成")).toBeVisible({ timeout: 30_000 });
});
