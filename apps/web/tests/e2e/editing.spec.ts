import { expect, test } from "@playwright/test";

test.beforeEach(async ({ request }) => {
  const response = await request.post("/api/demo/reset");
  expect(response.ok()).toBeTruthy();
});

async function openHuachenFromNav(page: import("@playwright/test").Page) {
  await page.getByTestId("nav-customers").click();
  await page.getByText("华辰设计", { exact: true }).first().click();
  await expect(page).toHaveURL(/\/customers\/c_huachen/);
}

test("sales requests a credit increase and manager edits the limit directly", async ({ page }) => {
  await page.goto("/customers/c_huachen");
  await page.getByRole("button", { name: "申请提额" }).click();
  await page.getByLabel("申请额度（元）").fill("2000000");
  await page.getByLabel("提额原因").fill("季度资信复核后申请提额");
  await page.getByRole("button", { name: "提交申请" }).click();
  await expect(page.getByText("提额申请已提交经理审批")).toBeVisible({ timeout: 15_000 });

  await page.getByRole("combobox", { name: "切换角色" }).selectOption("u_manager_wang");
  await openHuachenFromNav(page);
  await page.getByRole("button", { name: "调整额度" }).click();
  await page.getByLabel("新额度（元）").fill("1500000");
  await page.getByLabel("调整原因").fill("经理直接调整季度额度");
  await page.getByRole("button", { name: "保存额度" }).click();
  await expect(page.getByText("信用额度已更新为", { exact: false })).toBeVisible({ timeout: 15_000 });
  await expect(page.getByText("¥1,500,000.00").first()).toBeVisible();
});

test("manager edits customer level and owner", async ({ page }) => {
  await page.goto("/customers/c_huachen");
  await page.getByRole("combobox", { name: "切换角色" }).selectOption("u_manager_wang");
  await openHuachenFromNav(page);
  await page.getByRole("button", { name: "编辑客户" }).click();
  await page.getByLabel("客户等级").selectOption("B");
  await expect(page.getByLabel("负责人")).toContainText("小王");
  await page.getByLabel("负责人").selectOption("u_sales_wang");
  await page.getByRole("button", { name: "保存" }).click();
  await expect(page.getByText("客户资料已更新")).toBeVisible({ timeout: 15_000 });
  await expect(page.getByText("B 级")).toBeVisible();
  await expect(page.getByText("负责人 小王", { exact: false })).toBeVisible();
});

test("adds and edits a contact", async ({ page }) => {
  await page.goto("/customers/c_huachen");
  await page.getByRole("button", { name: "添加" }).click();
  await page.getByLabel("姓名").fill("王助理");
  await page.getByLabel("职位").fill("采购助理");
  await page.getByLabel("电话").fill("13800000000");
  await page.getByLabel("邮箱").fill("wang@huachen.example");
  await page.getByLabel("设为主要联系人").check();
  await page.getByRole("button", { name: "保存" }).click();
  await expect(page.getByText("联系人已添加")).toBeVisible({ timeout: 15_000 });
  await expect(page.getByText("王助理")).toBeVisible();

  await page.getByRole("button", { name: "编辑联系人 王助理" }).click();
  await page.getByLabel("职位").fill("采购经理");
  await page.getByRole("button", { name: "保存" }).click();
  await expect(page.getByText("联系人已更新")).toBeVisible({ timeout: 15_000 });
  await expect(page.getByText("采购经理")).toBeVisible();
});

test("edits opportunity details", async ({ page }) => {
  await page.goto("/opportunities/o_huachen_server");
  await page.getByRole("button", { name: "编辑商机" }).click();
  await page.getByLabel("商机名称").fill("服务器二期采购");
  await page.getByLabel("成交概率（%）").fill("80");
  await page.getByRole("button", { name: "保存" }).click();
  await expect(page.getByText("商机已更新")).toBeVisible({ timeout: 15_000 });
  await expect(page.getByText("服务器二期采购").first()).toBeVisible();
  await expect(page.getByText("成交概率 80%", { exact: false }).first()).toBeVisible();
});

test("creates a customer from the list", async ({ page }) => {
  await page.goto("/customers");
  await page.getByRole("button", { name: "新建客户" }).click();
  await page.getByLabel("客户名称").fill("东湖智造");
  await page.getByLabel("行业").fill("智能制造");
  await page.getByLabel("区域").fill("武汉");
  await page.getByLabel("账期").fill("月结 30 天");
  await page.getByRole("button", { name: "创建客户" }).click();
  await expect(page).toHaveURL(/\/customers\/c_/, { timeout: 15_000 });
  await expect(page.getByRole("heading", { name: /东湖智造/ })).toBeVisible();
});

test("fulfils a reserved order", async ({ page }) => {
  await page.goto("/orders/o_seed_1");
  await page.getByRole("button", { name: "标记已履约" }).click();
  await page.getByRole("button", { name: "确认履约" }).click();
  await expect(page.getByText("订单已标记履约")).toBeVisible({ timeout: 15_000 });
  await expect(page.getByText("已履约").first()).toBeVisible();
});

test("processes an after-sales ticket", async ({ page }) => {
  await page.goto("/tickets/t_seed_open");
  await page.getByRole("button", { name: "开始处理" }).click();
  await expect(page.getByText("工单状态已更新")).toBeVisible({ timeout: 15_000 });

  await page.getByRole("button", { name: "标记已解决" }).click();
  await page.getByRole("textbox", { name: "处理结果" }).fill("已安排换机，客户确认收货");
  await page.getByRole("button", { name: "确认解决" }).click();
  await expect(page.getByText("工单已解决", { exact: true })).toBeVisible({ timeout: 15_000 });
  await expect(page.getByText("已安排换机，客户确认收货", { exact: false })).toBeVisible();

  await page.getByRole("button", { name: "关闭工单" }).click();
  await expect(page.getByText("工单已关闭")).toBeVisible({ timeout: 15_000 });
});
