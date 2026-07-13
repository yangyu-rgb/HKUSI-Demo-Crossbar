import AxeBuilder from "@axe-core/playwright";
import { expect, test } from "@playwright/test";


test.beforeEach(async ({ request }) => {
  const response = await request.post("http://127.0.0.1:8000/api/demo/reset");
  expect(response.ok()).toBe(true);
});


test("口岸态势、V2 场景、双向规划、通知与模型实验室闭环", async ({ page }, testInfo) => {
  await page.goto("/");
  await expect(page.getByRole("heading", { name: "四口岸动态态势" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "深港口岸态势地图" })).toBeVisible();
  await page.getByRole("button", { name: /福田口岸，当前等待/ }).press("Enter");
  await expect(page.getByRole("heading", { name: "未来三小时等待趋势" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "四口岸时段压力矩阵" })).toBeVisible();
  await expect(page.getByText("当前最优")).toBeVisible();
  await expect(page.getByText("三小时后最优")).toBeVisible();

  await page.goto("/scenarios");
  await expect(page.getByRole("heading", { name: "未来场景实验室" })).toBeVisible();
  await page.getByRole("button", { name: "一键课堂演示" }).click();
  await page.getByRole("button", { name: "对比 AI 方案" }).click();
  await expect(page.getByText("推荐已切换", { exact: false })).toBeVisible();
  await expect(page.getByText("深圳湾", { exact: true }).first()).toBeVisible();
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
  await expect(page.getByRole("heading", { name: "技术版：最终等待怎样算" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "大白话：像天气预报一样逐步修正" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "最终模型选择" })).toBeVisible();
  await expect(page.getByText("全部晋级门槛通过")).toBeVisible();
  await expect(page.getByText("90.44%", { exact: true })).toBeVisible();
  await expect(page.getByText("仅用于课堂 Demo，不收集现场真实训练数据")).toBeVisible();

  await page.goto("/operations");
  await expect(page.getByRole("heading", { name: "Demo 运营分析中心" })).toBeVisible();
  await expect(page.getByText("预测运行", { exact: true })).toBeVisible();
  await expect(page.getByRole("heading", { name: "众包质量结构" })).toBeVisible();

  if (testInfo.project.name === "mobile-chromium") {
    await page.evaluate(() => window.localStorage.setItem("crossborder-demo-persona", "commuter-user"));
  }
  await page.goto("/mobile");
  await expect(page.getByRole("heading", { name: "现在走哪个口岸？" })).toBeVisible();
  await expect(page.getByText("深圳官方快照 · 交叉核验")).toBeVisible();
  await expect(page.getByRole("navigation", { name: "移动快捷导航" })).toBeVisible();
  await expect(page.locator('a[href="/planner"]')).toHaveCount(0);
  await page.getByRole("link", { name: "规划", exact: true }).click();
  await expect(page.getByRole("heading", { name: "规划跨境行程" })).toBeVisible();
  await page.getByRole("button", { name: "生成 AI 建议" }).click();
  await expect(page.getByText("本次推荐", { exact: false })).toBeVisible();
  await expect(page.getByRole("link", { name: "通关后反馈实际等待" })).toHaveAttribute("href", /\/mobile\/feedback/);
  await page.getByRole("link", { name: "通关后反馈实际等待" }).click();
  await page.getByLabel("移动实际等待").fill("15");
  await page.getByRole("button", { name: "提交反馈" }).click();
  await expect(page.getByText("积分", { exact: false })).toBeVisible();
  await expect(page.getByRole("link", { name: "返回规划并查看最新校准" })).toBeVisible();

  await page.goto("/mobile/scenarios");
  await page.getByRole("button", { name: "对比 AI 方案" }).click();
  await expect(page.getByText("本次推演不会保存场景", { exact: false })).toBeVisible();

  await page.goto("/mobile/me");
  await expect(page.getByRole("heading", { name: "我的跨境通勤" })).toBeVisible();
  await page.getByRole("button", { name: "创建提醒" }).click();
  await expect(page.getByText("提醒已创建。")).toBeVisible();
  await page.getByRole("tab", { name: /^通知/ }).click();
  await page.getByRole("button", { name: "运行本地告警周期" }).click();
  await expect(page.getByText("已评估", { exact: false })).toBeVisible();
  await page.getByRole("tab", { name: "模型" }).click();
  await expect(page.getByText("主预测已启用")).toBeVisible();
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
  expect(overflow).toBeLessThanOrEqual(1);
});


test("主要页面没有严重可访问性问题", async ({ page }) => {
  for (const route of ["/", "/planner", "/scenarios", "/crowdsource", "/alerts", "/business", "/model", "/operations", "/mobile", "/mobile/planner", "/mobile/scenarios", "/mobile/feedback", "/mobile/me"]) {
    await page.goto(route);
    await page.locator("main").waitFor();
    const result = await new AxeBuilder({ page })
      .withTags(["wcag2a", "wcag2aa"])
      .analyze();
    expect(result.violations, `${route}: ${JSON.stringify(result.violations)}`).toEqual([]);
  }
});
