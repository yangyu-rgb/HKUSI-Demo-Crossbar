import AxeBuilder from "@axe-core/playwright";
import { expect, test } from "@playwright/test";


test.beforeEach(async ({ request, page }) => {
  await page.route("**/*.mp4", (route) => route.abort());
  await page.route("https://fonts.googleapis.com/**", (route) => route.abort());
  await page.route("https://fonts.gstatic.com/**", (route) => route.abort());
  const response = await request.post("http://127.0.0.1:8000/api/demo/reset", {
    headers: { "X-Demo-Persona-ID": "demo-user" },
  });
  expect(response.ok()).toBe(true);
});


test("口岸态势、V2 场景、双向规划、通知与模型实验室闭环", async ({ page }) => {
  test.setTimeout(60_000);
  const runtimeErrors: string[] = [];
  page.on("pageerror", (error) => runtimeErrors.push(error.message));
  page.on("console", (message) => {
    // The suite deliberately aborts the remote hero MP4, which Chromium reports as ERR_FAILED.
    if (message.type() === "error" && !message.text().includes("Failed to load resource: net::ERR_FAILED")) {
      runtimeErrors.push(message.text());
    }
  });
  await page.goto("/login");
  await expect(page.getByRole("heading", { name: "Choose your workspace / 选择工作空间" })).toBeVisible();
  await page.getByRole("button", { name: /Demo 操作员/ }).click();
  await page.getByRole("button", { name: /Enter CrossBorder AI/ }).click();
  await page.goto("/");
  await expect(page.getByRole("heading", { name: "Predict border uncertainty. Dispatch with confidence." })).toBeVisible();
  await expect(page.locator('img[src="/hero-city-poster.jpg"]')).toBeVisible();
  await expect(page.getByRole("heading", { name: "四口岸动态态势" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "香港—深圳四口岸实时流线" })).toBeVisible();
  await expect(page.locator("canvas")).toBeVisible();
  await page.getByRole("button", { name: /福田口岸/ }).press("Enter");
  await expect(page.getByRole("button", { name: /福田口岸/ })).toHaveAttribute("aria-pressed", "true");
  await page.getByRole("button", { name: "返回总览" }).click();
  await expect(page.getByRole("button", { name: "返回总览" })).toBeDisabled();
  await page.getByRole("button", { name: "自动巡航 开" }).click();
  await expect(page.getByRole("button", { name: "自动巡航 关" })).toHaveAttribute("aria-pressed", "false");
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
  await expect(page.getByRole("heading", { name: "选择通勤条件，生成你的四口岸方案" })).toBeVisible();
  await expect(page.getByText("本次推荐")).toHaveCount(0);
  await page.getByLabel("通勤方向").selectOption("shenzhen_to_hong_kong");
  await page.getByRole("button", { name: "生成 AI 建议" }).click();
  await expect(page.getByText("本次推荐")).toBeVisible();
  await page.getByRole("button", { name: "查看完整计算过程" }).first().click();
  await expect(page.getByRole("dialog", { name: /完整计算过程/ })).toBeVisible();
  await page.getByRole("button", { name: "关闭计算过程" }).click();
  await expect(page.getByRole("dialog")).toHaveCount(0);

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
  await expect(page.getByRole("heading", { name: "主管建议 AI 优化对照" })).toBeVisible();
  await expect(page.getByText("在线学习", { exact: true })).toBeVisible();

  await page.goto("/pricing");
  await expect(page.getByRole("heading", { name: /从预测能力到可购买的/ })).toBeVisible();
  await page.getByRole("button", { name: "模拟购买" }).first().click();
  await expect(page.getByText(/不会收集银行卡/)).toBeVisible();
  await page.getByRole("button", { name: "确认模拟结账" }).click();
  await expect(page.getByText(/Professional · 生效中/)).toBeVisible();

  await page.goto("/operations");
  await expect(page.getByRole("heading", { name: "Demo 运营分析中心" })).toBeVisible();
  await expect(page.getByText("预测运行", { exact: true })).toBeVisible();
  await expect(page.getByRole("heading", { name: "众包质量结构" })).toBeVisible();
  await expect(page.getByText("商业订阅", { exact: true })).toBeVisible();

  await page.goto("/mobile/login?next=%2Fmobile");
  await expect(page.getByRole("heading", { name: "个人通勤空间" })).toBeVisible();
  await page.getByRole("button", { name: /进入移动端系统/ }).click();
  await expect(page.getByRole("heading", { name: "现在走哪个口岸？" })).toBeVisible();
  await expect(page.getByText("深圳官方快照 · 交叉核验")).toBeVisible();
  await expect(page.getByRole("navigation", { name: "移动快捷导航" })).toBeVisible();
  await expect(page.getByRole("link", { name: "返回网页版" })).toHaveAttribute("href", "/");
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
  const createReminder = page.getByRole("button", { name: "创建提醒" });
  await createReminder.evaluate((element) => element.scrollIntoView({ block: "center" }));
  await createReminder.click();
  await expect(page.getByText("提醒已创建。")).toBeVisible();
  await page.getByRole("tab", { name: /^通知/ }).click();
  await page.getByRole("button", { name: "运行本地告警周期" }).click();
  await expect(page.getByText("已评估", { exact: false })).toBeVisible();
  await page.getByRole("tab", { name: "模型" }).click();
  await expect(page.getByText("主预测已启用")).toBeVisible();
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
  expect(overflow).toBeLessThanOrEqual(1);
  expect(runtimeErrors).toEqual([]);
});

test("七分钟投资演示的企业 AI 决策闭环可直接操作", async ({ page }) => {
  test.skip(test.info().project.name === "mobile-chromium", "七分钟现场投资演示以桌面投影为目标；移动路由另有独立闭环与可访问性回归。");
  test.setTimeout(60_000);
  await page.goto("/login?next=%2Fbusiness");
  await page.getByRole("button", { name: /Demo 操作员/ }).click();
  await page.getByRole("button", { name: /Enter CrossBorder AI/ }).click();

  await expect(page.getByRole("heading", { name: "Enterprise Predictive Dispatch / 企业预测与调度" })).toBeVisible();
  await expect(page.getByText("No operating data loaded")).toBeVisible();
  await page.getByRole("button", { name: "Load Demo Sample" }).click();
  await expect(page.getByText(/10 validated Demo tasks loaded/)).toBeVisible();
  await page.getByRole("button", { name: "Compare All 4 Scenarios" }).click();
  await expect(page.getByRole("button", { name: /Holiday Peak/ })).toContainText("7→0 high risk");
  await expect(page.getByRole("button", { name: /Major Concert Release/ })).toContainText("4→0 high risk");
  await page.getByRole("button", { name: /Typhoon \/ Severe Weather/ }).click();
  await page.getByRole("button", { name: "Analyse Selected Scenario" }).click();
  await expect(page.getByText("7→0", { exact: true })).toBeVisible();
  await expect(page.getByText("1→0", { exact: true })).toBeVisible();
  await expect(page.getByText("24,000→0", { exact: true })).toBeVisible();
  await expect(page.getByText("✓ Input validated")).toBeVisible();
  await expect(page.getByText(/HGB/, { exact: false }).first()).toBeVisible();
  await page.getByRole("button", { name: /Adopt 7 Actions & Create Drafts/ }).click();
  await expect(page.getByText(/316 local notification drafts created/)).toBeVisible();

  const viewSelect = page.getByLabel("Demo view / 演示视角");
  await viewSelect.selectOption("freight_operator");
  await expect(page.getByText("No operating data loaded")).toBeVisible();
  await page.getByRole("button", { name: "Load Demo Sample" }).click();
  await page.getByRole("button", { name: "Compare All 4 Scenarios" }).click();
  await expect(page.getByRole("button", { name: /Holiday Peak/ })).toContainText("1→0 high risk");
  await page.getByRole("button", { name: /Holiday Peak/ }).click();
  await page.getByRole("button", { name: "Analyse Selected Scenario" }).click();
  await expect(page.getByText(/Fallback/).first()).toBeVisible();

  await viewSelect.selectOption("port_authority");
  await page.getByRole("button", { name: "Publish Demo Coordination Notice" }).click();
  await expect(page.getByRole("button", { name: "Demo Notice Published" })).toBeVisible();
});

test("桌面电影感外壳在主要断点无横向溢出", async ({ page }) => {
  await page.goto("/login");
  await page.getByRole("button", { name: /Demo 操作员/ }).click();
  await page.getByRole("button", { name: /Enter CrossBorder AI/ }).click();
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto("/");
  const desktopNavigation = page.getByRole("navigation", { name: "主要导航" });
  await desktopNavigation.getByRole("button", { name: "更多" }).click();
  await expect(page.locator("#more-navigation")).toBeVisible();
  await expect(page.locator("#more-navigation").getByText("众包反馈")).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(page.locator("#more-navigation")).toHaveCount(0);
  await page.getByRole("button", { name: "账户与身份" }).click();
  await expect(page.locator("#account-menu")).toBeVisible();
  await expect(page.locator("#account-menu").getByText("Demo 操作员")).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(page.locator("#account-menu")).toHaveCount(0);
  for (const width of [1440, 1024, 768, 375]) {
    await page.setViewportSize({ width, height: width <= 375 ? 812 : 900 });
    await page.goto("/");
    await expect(page.getByRole("heading", { name: "Predict border uncertainty. Dispatch with confidence." })).toBeVisible();
    const layout = await page.evaluate(() => ({
      overflow: document.documentElement.scrollWidth - window.innerWidth,
      offenders: [...document.querySelectorAll("body *")]
        .filter((element) => element.getBoundingClientRect().right > window.innerWidth + 1)
        .slice(0, 6)
        .map((element) => ({ tag: element.tagName, className: element.className, right: Math.round(element.getBoundingClientRect().right) })),
    }));
    expect(layout.overflow, `viewport ${width}px: ${JSON.stringify(layout.offenders)}`).toBeLessThanOrEqual(1);
  }
});


test("主要页面没有严重可访问性问题", async ({ page }) => {
  for (const route of ["/login", "/", "/pricing", "/mobile/login"]) {
    await page.goto(route);
    await page.locator("main").waitFor();
    const result = await new AxeBuilder({ page })
      .withTags(["wcag2a", "wcag2aa"])
      .analyze();
    expect(result.violations, `${route}: ${JSON.stringify(result.violations)}`).toEqual([]);
  }

  await page.goto("/login");
  await page.getByRole("button", { name: /Demo 操作员/ }).click();
  await page.getByRole("button", { name: /Enter CrossBorder AI/ }).click();
  for (const route of ["/planner", "/scenarios", "/crowdsource", "/alerts", "/business", "/model", "/operations"]) {
    await page.goto(route);
    await page.locator("main").waitFor();
    const result = await new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa"]).analyze();
    expect(result.violations, `${route}: ${JSON.stringify(result.violations)}`).toEqual([]);
  }

  await page.goto("/mobile/login");
  await page.getByRole("button", { name: /进入移动端系统/ }).click();
  for (const route of ["/mobile", "/mobile/planner", "/mobile/scenarios", "/mobile/feedback", "/mobile/me"]) {
    await page.goto(route);
    await page.locator("main").waitFor();
    const result = await new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa"]).analyze();
    expect(result.violations, `${route}: ${JSON.stringify(result.violations)}`).toEqual([]);
  }
});
