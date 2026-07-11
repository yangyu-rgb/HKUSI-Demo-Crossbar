import AxeBuilder from "@axe-core/playwright";
import { expect, test } from "@playwright/test";


test.beforeEach(async ({ request }) => {
  const response = await request.post("http://127.0.0.1:8000/api/demo/reset");
  expect(response.ok()).toBe(true);
});


test("V2 场景、双向规划、通知与模型实验室闭环", async ({ page }) => {
  await page.goto("/scenarios");
  await expect(page.getByRole("heading", { name: "未来场景实验室" })).toBeVisible();
  await page.getByLabel("场景天气").selectOption("heavy_rain");
  await page.getByRole("button", { name: "添加事件" }).click();
  await page.getByRole("button", { name: "保存场景" }).click();
  await expect(page.getByText("已修改", { exact: false }).first()).toBeVisible();

  await page.goto("/planner");
  await expect(page.getByRole("heading", { name: "跨境路线预测" })).toBeVisible();
  await page.getByLabel("通勤方向").selectOption("shenzhen_to_hong_kong");
  await page.getByRole("button", { name: "生成 AI 建议" }).click();
  await expect(page.getByText("本次推荐")).toBeVisible();

  await page.goto("/alerts");
  await page.getByRole("button", { name: "运行本地告警周期" }).click();
  await expect(page.getByText("本地告警周期已完成", { exact: false })).toBeVisible();

  await page.goto("/model");
  await expect(page.getByRole("heading", { name: "AI 模型实验室" })).toBeVisible();
  await expect(page.getByText("可完整演示")).toBeVisible();
  await expect(page.getByText("主预测已启用")).toBeVisible();
  await expect(page.getByText("仅限课堂场景模型", { exact: false })).toBeVisible();
  await expect(page.getByRole("heading", { name: "官方特征来源" })).toBeVisible();
  await expect(page.getByText("计入分钟标签：0 条", { exact: false })).toBeVisible();
  await expect(page.getByText("i口岸实时通关信息")).toBeVisible();
});


test("主要页面没有严重可访问性问题", async ({ page }) => {
  for (const route of ["/", "/planner", "/scenarios", "/crowdsource", "/alerts", "/business", "/model"]) {
    await page.goto(route);
    await page.locator("main").waitFor();
    const result = await new AxeBuilder({ page })
      .withTags(["wcag2a", "wcag2aa"])
      .analyze();
    expect(result.violations, `${route}: ${JSON.stringify(result.violations)}`).toEqual([]);
  }
});
