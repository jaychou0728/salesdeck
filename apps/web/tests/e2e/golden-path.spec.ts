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

test("manager approves the pending order", async ({ page }) => {
  await page.goto("/");
  await page.getByPlaceholder("告诉我要做什么…").fill("给华辰设计的张总报 120 台 X1");
  await page.getByRole("button", { name: "发送" }).click();
  await page.getByRole("button", { name: "确认生成" }).click();
  await expect(page.getByText("报价已生成")).toBeVisible();
  await page.getByRole("button", { name: "转订单" }).click();
  await page.getByRole("button", { name: "确认生成" }).click();
  await expect(page.getByText("经理审批", { exact: true })).toBeVisible();
  await page.getByRole("combobox").selectOption("u_manager_wang");
  await page.getByRole("button", { name: "批准" }).click();
  await expect(page.getByText("订单已创建")).toBeVisible();
});
