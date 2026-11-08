import { expect, test } from "@playwright/test";

test.beforeEach(async ({ request }) => {
  const response = await request.post("/api/demo/reset");
  expect(response.ok()).toBeTruthy();
});

test("war room shows priorities and records a follow-up", async ({ page }) => {
  await page.goto("/dashboard");
  await expect(page.getByText("AI 今日建议")).toBeVisible();
  await expect(page.getByTestId("priority-card").first()).toContainText("华辰设计");
  await expect(page.getByTestId("priority-card").first()).toContainText("服务器采购");
  await expect(page.getByTestId("priority-card").first()).toContainText("P0");

  await page.getByTestId("priority-card").first().getByRole("link", { name: "查看客户" }).click();
  await expect(page).toHaveURL(/\/customers\/c_huachen/);
  await expect(page.getByText("客户推进中心")).toBeVisible();
  await expect(page.getByText("服务器采购").first()).toBeVisible();

  await page.getByRole("button", { name: "记录跟进" }).first().click();
  await page.getByLabel("跟进内容").fill("已电话联系采购，预算本周确认");
  await page.getByLabel("跟进结果").fill("客户周五给答复");
  await page.getByRole("button", { name: "保存跟进" }).click();
  await expect(page.getByText("跟进已记录")).toBeVisible({ timeout: 15_000 });
  await expect(page.getByText("已电话联系采购，预算本周确认")).toBeVisible();
});

test("manager sees team risks and ranking", async ({ page }) => {
  await page.goto("/dashboard");
  await page.getByRole("combobox", { name: "切换角色" }).selectOption("u_manager_wang");
  await expect(page).toHaveURL(/\/dashboard$/);
  await expect(page.getByText("团队作战室")).toBeVisible();
  await expect(page.getByText("销售排行")).toBeVisible();
  await expect(page.getByText("高风险商机")).toBeVisible();
  await expect(page.getByRole("cell", { name: "小王" })).toBeVisible();
});

test("AI promotes a customer with tool calls", async ({ page }) => {
  await page.goto("/dashboard");
  await page.getByTestId("priority-card").first().getByRole("button", { name: "让 AI 帮我推进" }).click();
  await expect(page.getByTestId("ai-drawer")).toBeVisible();
  await expect(page.getByText("我先分析了这个商机", { exact: false })).toBeVisible({ timeout: 30_000 });
  await expect(page.getByRole("button", { name: "拉取 360 + 库存" })).toBeVisible();

  await page.getByRole("tab", { name: "执行过程" }).click();
  await expect(page.getByText("get_opportunity_detail").first()).toBeVisible();
});

test("creates an opportunity from the opportunities page", async ({ page }) => {
  await page.goto("/opportunities");
  await page.getByRole("button", { name: "新建商机" }).first().click();
  await page.getByLabel("客户").selectOption("c_huachen");
  await page.getByLabel("商机名称").fill("测试商机");
  await page.getByLabel("金额（元）").fill("100000");
  await page.getByRole("button", { name: "创建商机" }).click();
  await expect(page).toHaveURL(/\/opportunities\/o_/, { timeout: 15_000 });
  await expect(page.getByText("测试商机").first()).toBeVisible();
});

test("manager rejection clears the sales approval card and updates the next action", async ({ page }) => {
  await page.goto("/dashboard");
  await page.getByRole("button", { name: "AI 助手" }).click();
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
  await page.getByRole("button", { name: "关闭 AI 助手" }).click();
  await page.getByTestId("nav-approvals").click();
  await page.getByText("转订单审批").first().click();
  await page.getByRole("button", { name: "驳回" }).click();
  await expect(page.getByText("审批已驳回")).toBeVisible({ timeout: 15_000 });

  await page.getByRole("combobox", { name: "切换角色" }).selectOption("u_sales_lin");
  await expect(page).toHaveURL(/\/dashboard$/);
  await page.getByRole("button", { name: "AI 助手" }).click();
  await expect(page.getByText("经理审批", { exact: true })).toHaveCount(0);
  await page.getByRole("button", { name: "关闭 AI 助手" }).click();
  await expect(page.getByText("转订单审批被驳回", { exact: false }).first()).toBeVisible({ timeout: 15_000 });
});
