import { expect, test } from "@playwright/test";

test.beforeEach(async ({ request }) => {
  const response = await request.post("/api/demo/reset");
  expect(response.ok()).toBeTruthy();
});

test("AI quote to manager approval creates an order", async ({ page }) => {
  await page.goto("/");
  await expect(page).toHaveURL(/\/dashboard$/);

  await page.getByRole("button", { name: "AI 助手" }).click();
  await expect(page.getByTestId("ai-drawer")).toBeVisible();

  await page.getByPlaceholder("告诉我要做什么…").fill("给华辰设计的张总报 120 台 X1");
  await page.getByRole("button", { name: "发送" }).click();

  await expect(page.getByText("报价单预览")).toBeVisible({ timeout: 30_000 });
  await page.getByRole("button", { name: "确认生成" }).click();
  await expect(page.getByText("报价已生成")).toBeVisible({ timeout: 30_000 });

  await page.getByRole("button", { name: "转订单" }).click();
  await expect(page.getByText("转订单预览")).toBeVisible({ timeout: 30_000 });
  await page.getByRole("button", { name: "确认提交" }).click();

  await expect(page.getByText("经理审批", { exact: true })).toBeVisible({ timeout: 30_000 });

  await page.getByRole("combobox", { name: "切换角色" }).selectOption("u_manager_wang");
  await expect(page).toHaveURL(/\/dashboard$/);
  await expect(page.getByTestId("ai-drawer")).toBeVisible();

  await page.getByRole("button", { name: "批准" }).click();
  await expect(page.getByText("订单已创建")).toBeVisible({ timeout: 30_000 });
});

test("manual quote can be previewed and committed", async ({ page }) => {
  await page.goto("/quotes/new");

  await page.getByLabel("客户").selectOption("c_huachen");
  await page.getByLabel("联系人").selectOption("ct_zhang_1");
  await page.getByLabel("产品").first().selectOption("X1");
  await page.getByLabel("数量").first().fill("2");

  await page.getByRole("button", { name: "预览" }).click();
  await expect(page.getByRole("button", { name: "确认生成" })).toBeVisible({ timeout: 30_000 });

  await page.getByRole("button", { name: "确认生成" }).click();
  await expect(page).toHaveURL(/\/quotes\/q_/, { timeout: 30_000 });
  await expect(page.getByTestId("quote-no")).toContainText(/Q-\d{4}-/);
});

test("role switch enforces approval and inventory permissions", async ({ page }) => {
  await page.goto("/dashboard");
  await expect(page.getByTestId("nav-approvals")).toHaveCount(0);
  await expect(page.getByTestId("permission-banner")).toContainText("销售视图");

  await page.getByTestId("nav-inventory").click();
  await expect(page.getByTestId("inventory-readonly")).toBeVisible();
  await expect(page.getByRole("button", { name: "调整" })).toHaveCount(0);

  await page.getByRole("combobox", { name: "切换角色" }).selectOption("u_manager_wang");
  await expect(page).toHaveURL(/\/dashboard$/);
  await expect(page.getByTestId("nav-approvals")).toBeVisible();
  await expect(page.getByTestId("permission-banner")).toContainText("经理视图");

  await page.getByTestId("nav-inventory").click();
  await expect(page.getByRole("button", { name: "调整" }).first()).toBeVisible();
});
