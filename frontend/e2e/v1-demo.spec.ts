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
  await expect(page.getByRole("heading", { name: "Choose your workspace" })).toBeVisible();
  await page.getByRole("button", { name: /Demo Operator/ }).click();
  await page.getByRole("button", { name: /Enter CrossBorder AI/ }).click();
  await page.goto("/");
  await expect(page.getByRole("heading", { name: "Predict border uncertainty. Dispatch with confidence." })).toBeVisible();
  await expect(page.locator('img[src="/hero-city-poster.jpg"]')).toBeVisible();
  await expect(page.getByRole("heading", { name: "Four-port live situation" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Hong Kong–Shenzhen live four-port flow" })).toBeVisible();
  await expect(page.locator("canvas")).toBeVisible();
  await page.getByRole("button", { name: /Futian Port/ }).press("Enter");
  await expect(page.getByRole("button", { name: /Futian Port/ })).toHaveAttribute("aria-pressed", "true");
  await page.getByRole("button", { name: "Overview" }).click();
  await expect(page.getByRole("button", { name: "Overview" })).toBeDisabled();
  await page.getByRole("button", { name: "Auto tour On" }).click();
  await expect(page.getByRole("button", { name: "Auto tour Off" })).toHaveAttribute("aria-pressed", "false");
  await expect(page.getByRole("heading", { name: "Wait forecast for the next three hours" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Four-port pressure by time" })).toBeVisible();
  await expect(page.getByText("Best now")).toBeVisible();
  await expect(page.getByText("Best in three hours")).toBeVisible();

  await page.goto("/scenarios");
  await expect(page.getByRole("heading", { name: "Future Scenario Lab" })).toBeVisible();
  await page.getByRole("button", { name: "Apply classroom Demo" }).click();
  await page.getByRole("button", { name: "Compare AI plans" }).click();
  await expect(page.getByText("Recommendation changed →")).toBeVisible();
  await expect(page.getByText("Shenzhen Bay", { exact: true }).first()).toBeVisible();
  await page.getByRole("button", { name: "Save scenario" }).click();
  await expect(page.getByText("Modified", { exact: false }).first()).toBeVisible();

  await page.goto("/planner");
  await expect(page.getByRole("heading", { name: "Cross-border route forecast" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Select trip conditions to generate a four-port plan" })).toBeVisible();
  await expect(page.getByText("Recommended route", { exact: true })).toHaveCount(0);
  await page.getByLabel("Travel direction").selectOption("shenzhen_to_hong_kong");
  await page.getByRole("button", { name: "Generate AI recommendation" }).click();
  await expect(page.getByText("Recommended route", { exact: true })).toBeVisible();
  await page.getByRole("button", { name: "View full calculation" }).first().click();
  await expect(page.getByRole("dialog", { name: /Full calculation/ })).toBeVisible();
  await page.getByRole("button", { name: "Close calculation" }).click();
  await expect(page.getByRole("dialog")).toHaveCount(0);

  await page.goto("/alerts");
  await page.getByRole("button", { name: "Run local alert cycle" }).click();
  await expect(page.getByText("The local alert cycle is complete", { exact: false })).toBeVisible();

  await page.goto("/model");
  await expect(page.getByRole("heading", { name: "AI Model Lab" })).toBeVisible();
  await expect(page.getByText("Ready for full Demo")).toBeVisible();
  await expect(page.getByText("Primary forecast enabled")).toBeVisible();
  await expect(page.getByRole("heading", { name: "Technical view: how the final wait is calculated" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Plain language: gradual correction like a weather forecast" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Final model selection" })).toBeVisible();
  await expect(page.getByText("All promotion gates passed")).toBeVisible();
  await expect(page.getByText("90.44%", { exact: true })).toBeVisible();
  await expect(page.getByText("Classroom Demo only · No real field training data collected")).toBeVisible();
  await expect(page.getByRole("heading", { name: "Recommended AI optimization review" })).toBeVisible();

  await page.goto("/pricing");
  await expect(page.getByRole("heading", { name: /From forecasting capability to a/ })).toBeVisible();
  await page.getByRole("button", { name: "Simulate purchase" }).first().click();
  await expect(page.getByText(/does not collect card/)).toBeVisible();
  await page.getByRole("button", { name: "Confirm simulated checkout" }).click();
  await expect(page.getByText(/Professional · Active/)).toBeVisible();

  await page.goto("/operations");
  await expect(page.getByRole("heading", { name: "Demo Operations Analytics" })).toBeVisible();
  await expect(page.getByText("Forecast runs", { exact: true })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Crowd-report quality" })).toBeVisible();
  await expect(page.getByText("Commercial subscriptions", { exact: true })).toBeVisible();

  await page.goto("/mobile/login?next=%2Fmobile");
  await expect(page.getByRole("heading", { name: "Personal commute workspace" })).toBeVisible();
  await page.getByRole("button", { name: /Enter mobile app/ }).click();
  await expect(page.getByRole("heading", { name: "Which port should I use now?" })).toBeVisible();
  await expect(page.getByText("Shenzhen official snapshot · Cross-check")).toBeVisible();
  await expect(page.getByRole("navigation", { name: "Mobile quick navigation" })).toBeVisible();
  await expect(page.getByRole("link", { name: "Return to web app" })).toHaveAttribute("href", "/");
  await expect(page.locator('a[href="/planner"]')).toHaveCount(0);
  await page.getByRole("link", { name: "Plan", exact: true }).click();
  await expect(page.getByRole("heading", { name: "Plan a cross-border journey" })).toBeVisible();
  await page.getByRole("button", { name: "Generate AI recommendation" }).click();
  await expect(page.getByText("Recommendation", { exact: false }).first()).toBeVisible();
  await expect(page.getByRole("link", { name: "Report actual wait after crossing" })).toHaveAttribute("href", /\/mobile\/feedback/);
  await page.getByRole("link", { name: "Report actual wait after crossing" }).click();
  await page.getByLabel("Mobile actual wait").fill("15");
  await page.getByRole("button", { name: "Submit report" }).click();
  await expect(page.getByText("points", { exact: false })).toBeVisible();
  await expect(page.getByRole("link", { name: "Return to planning and view the latest calibration" })).toBeVisible();

  await page.goto("/mobile/scenarios");
  await page.getByRole("button", { name: "Compare AI plans" }).click();
  await expect(page.getByText("without saving", { exact: false })).toBeVisible();

  await page.goto("/mobile/me");
  await expect(page.getByRole("heading", { name: "My cross-border commute" })).toBeVisible();
  const createReminder = page.getByRole("button", { name: "Create alert" });
  await createReminder.evaluate((element) => element.scrollIntoView({ block: "center" }));
  await createReminder.click();
  await expect(page.getByText("Alert created.")).toBeVisible();
  await page.getByRole("tab", { name: /^Notifications/ }).click();
  await page.getByRole("button", { name: "Run local alert cycle" }).click();
  await expect(page.getByText("Evaluated", { exact: false })).toBeVisible();
  await page.getByRole("tab", { name: "Model" }).click();
  await expect(page.getByText("Primary forecast enabled")).toBeVisible();
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
  expect(overflow).toBeLessThanOrEqual(1);
  expect(runtimeErrors).toEqual([]);
});

test("浏览器中的主要平台页面只显示英文", async ({ page }) => {
  await page.goto("/login");
  await page.getByRole("button", { name: /Demo Operator/ }).click();
  await page.getByRole("button", { name: /Enter CrossBorder AI/ }).click();

  for (const route of ["/", "/planner", "/scenarios", "/crowdsource", "/alerts", "/business", "/business/employees", "/model", "/pricing", "/operations"]) {
    await page.goto(route);
    await page.locator("main").waitFor();
    const visibleText = await page.locator("body").innerText();
    expect(visibleText.match(/[\u3400-\u9fff]+/g), `${route}: ${visibleText}`).toBeNull();
  }

  await page.goto("/mobile/login");
  await page.getByRole("button", { name: /Enter mobile app/ }).click();
  for (const route of ["/mobile", "/mobile/planner", "/mobile/scenarios", "/mobile/feedback", "/mobile/me"]) {
    await page.goto(route);
    await page.locator("main").waitFor();
    const visibleText = await page.locator("body").innerText();
    expect(visibleText.match(/[\u3400-\u9fff]+/g), `${route}: ${visibleText}`).toBeNull();
  }
});

test("七分钟投资演示的企业 AI 决策闭环可直接操作", async ({ page }) => {
  test.skip(test.info().project.name === "mobile-chromium", "七分钟现场投资演示以桌面投影为目标；移动路由另有独立闭环与可访问性回归。");
  test.setTimeout(60_000);
  await page.goto("/login?next=%2Fbusiness");
  await page.getByRole("button", { name: /Demo Operator/ }).click();
  await page.getByRole("button", { name: /Enter CrossBorder AI/ }).click();

  await expect(page.getByRole("heading", { name: "Enterprise Predictive Dispatch" })).toBeVisible();
  await expect(page.getByText("No operating data loaded")).toBeVisible();
  await page.getByRole("button", { name: "Load Demo Sample" }).click();
  await expect(page.getByText(/10 validated Demo tasks loaded/)).toBeVisible();
  await page.getByRole("button", { name: "Compare All 4 Scenarios" }).click();
  await expect(page.getByRole("button", { name: /Normal Weekday/ })).toContainText("2→2 high risk");
  await expect(page.getByRole("button", { name: /Normal Weekday/ })).toContainText("0 changes");
  await expect(page.getByRole("button", { name: /Holiday Peak/ })).toContainText("7→2 high risk");
  await expect(page.getByRole("button", { name: /Major Concert Release/ })).toContainText("2→1 high risk");
  await page.getByRole("button", { name: /Major Concert Release/ }).click();
  for (const port of ["Lo Wu", "Shenzhen Bay"]) {
    const checkbox = page.getByRole("checkbox", { name: port });
    await checkbox.check();
    await expect(checkbox).toBeChecked();
    await checkbox.uncheck();
    await expect(checkbox).not.toBeChecked();
  }
  await page.getByRole("button", { name: /Typhoon \/ Severe Weather/ }).click();
  await page.getByRole("button", { name: "Analyse Selected Scenario" }).click();
  await expect(page.getByText("7→2", { exact: true })).toBeVisible();
  await expect(page.getByText("1→0", { exact: true })).toBeVisible();
  await expect(page.getByText("24,000→7,000", { exact: true })).toBeVisible();
  await expect(page.getByText("Model / departure impact")).toBeVisible();
  await expect(page.getByText(/Departure \d+ min earlier/).first()).toBeVisible();
  await expect(page.getByText("Departure unchanged").first()).toBeVisible();
  await expect(page.getByText(/→/, { exact: false }).filter({ hasText: /07:/ }).first()).toBeVisible();
  await expect(page.getByText("✓ Input validated")).toBeVisible();
  await expect(page.getByText(/HGB/, { exact: false }).first()).toBeVisible();
  await page.getByRole("button", { name: /Adopt 6 Actions & Create Drafts/ }).click();
  await expect(page.getByText(/268 local notification drafts created/)).toBeVisible();

  const viewSelect = page.getByLabel("Demo view");
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

  await viewSelect.selectOption("enterprise_client");
  await expect(page).toHaveURL(/\/business\/employees$/);
  await expect(page.getByRole("heading", { name: "Employee Planning Control Tower" })).toBeVisible();
});

test("企业管理员直接进入HR员工规划主工作区", async ({ page }) => {
  await page.goto("/login?next=%2Fbusiness");
  await page.getByRole("button", { name: /Enterprise Administrator/ }).click();
  await page.getByRole("button", { name: /Enter CrossBorder AI/ }).click();

  await expect(page).toHaveURL(/\/business\/employees$/);
  await expect(page.getByRole("heading", { name: "Employee Planning Control Tower" })).toBeVisible();
  await expect(page.getByRole("navigation", { name: "Main navigation" }).getByRole("link", { name: "Employee Planning" })).toHaveAttribute("href", "/business/employees");
  await page.getByRole("button", { name: "Generate dispatch plan" }).click();
  const employeeWorkspace = page.locator("#main-content");
  await expect(employeeWorkspace.getByText("Employees", { exact: true })).toBeVisible();
  await expect(employeeWorkspace.getByText("Average minutes", { exact: true })).toBeVisible();
  await expect(employeeWorkspace.locator("span").filter({ hasText: /^High risk$/ })).toBeVisible();
});

test("桌面电影感外壳在主要断点无横向溢出", async ({ page }) => {
  await page.goto("/login");
  await page.getByRole("button", { name: /Demo Operator/ }).click();
  await page.getByRole("button", { name: /Enter CrossBorder AI/ }).click();
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto("/");
  const desktopNavigation = page.getByRole("navigation", { name: "Main navigation" });
  await desktopNavigation.getByRole("button", { name: "More" }).click();
  await expect(page.locator("#more-navigation")).toBeVisible();
  await expect(page.locator("#more-navigation").getByText("Crowd Reports")).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(page.locator("#more-navigation")).toHaveCount(0);
  await page.getByRole("button", { name: "Account and persona" }).click();
  await expect(page.locator("#account-menu")).toBeVisible();
  await expect(page.locator("#account-menu").getByText("Demo Operator")).toBeVisible();
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
  await page.getByRole("button", { name: /Demo Operator/ }).click();
  await page.getByRole("button", { name: /Enter CrossBorder AI/ }).click();
  for (const route of ["/planner", "/scenarios", "/crowdsource", "/alerts", "/business", "/model", "/operations"]) {
    await page.goto(route);
    await page.locator("main").waitFor();
    const result = await new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa"]).analyze();
    expect(result.violations, `${route}: ${JSON.stringify(result.violations)}`).toEqual([]);
  }

  await page.goto("/mobile/login");
  await page.getByRole("button", { name: /Enter mobile app/ }).click();
  for (const route of ["/mobile", "/mobile/planner", "/mobile/scenarios", "/mobile/feedback", "/mobile/me"]) {
    await page.goto(route);
    await page.locator("main").waitFor();
    const result = await new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa"]).analyze();
    expect(result.violations, `${route}: ${JSON.stringify(result.violations)}`).toEqual([]);
  }
});
