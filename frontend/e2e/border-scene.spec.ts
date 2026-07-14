import { expect, test, type Locator, type Page } from "@playwright/test";


const VIEWPORT_TOLERANCE = 2;

type ElementBounds = {
  bottom: number;
  height: number;
  left: number;
  right: number;
  top: number;
  width: number;
};

async function boundsOf(locator: Locator): Promise<ElementBounds> {
  return locator.evaluate((element) => {
    const bounds = element.getBoundingClientRect();
    return {
      bottom: bounds.bottom,
      height: bounds.height,
      left: bounds.left,
      right: bounds.right,
      top: bounds.top,
      width: bounds.width,
    };
  });
}

async function expectNoHorizontalPageOverflow(page: Page, label: string) {
  const layout = await page.evaluate(() => ({
    overflow: document.documentElement.scrollWidth - window.innerWidth,
    offenders: [...document.querySelectorAll("body *")]
      .filter((element) => {
        const bounds = element.getBoundingClientRect();
        return bounds.left < -2 || bounds.right > window.innerWidth + 2;
      })
      .slice(0, 8)
      .map((element) => ({
        className: typeof element.className === "string" ? element.className : "",
        tag: element.tagName,
      })),
  }));

  expect(layout.overflow, `${label}: ${JSON.stringify(layout.offenders)}`).toBeLessThanOrEqual(VIEWPORT_TOLERANCE);
}

test.beforeEach(async ({ page, request }) => {
  await page.route("**/*.mp4", (route) => route.abort());
  await page.route("https://fonts.googleapis.com/**", (route) => route.abort());
  await page.route("https://fonts.gstatic.com/**", (route) => route.abort());
  const response = await request.post("http://127.0.0.1:8000/api/demo/reset", {
    headers: { "X-Demo-Persona-ID": "demo-user" },
  });
  expect(response.ok()).toBe(true);
});

test("3D 口岸模块在桌面断点内不超过视口且视觉层不越界", async ({ page }) => {
  for (const viewport of [
    { width: 1440, height: 900 },
    { width: 1024, height: 900 },
  ]) {
    await page.setViewportSize(viewport);
    await page.goto("/");

    const panel = page.locator('section[aria-labelledby="flow-title"]');
    const scene = page.getByRole("region", { name: /香港与深圳四口岸地理流线/ });
    const visual = scene.locator("..");
    const canvas = scene.locator("canvas");

    await expect(panel).toBeVisible();
    await expect(canvas).toBeVisible();
    await expect(panel.getByRole("link", { name: /OpenStreetMap contributors/ })).toHaveAttribute(
      "href",
      "https://www.openstreetmap.org/copyright",
    );
    await panel.scrollIntoViewIfNeeded();

    const [panelBounds, visualBounds, sceneBounds, canvasBounds] = await Promise.all([
      boundsOf(panel),
      boundsOf(visual),
      boundsOf(scene),
      boundsOf(canvas),
    ]);

    expect(panelBounds.width).toBeLessThanOrEqual(viewport.width + VIEWPORT_TOLERANCE);
    expect(panelBounds.height).toBeLessThanOrEqual(viewport.height - 32 + VIEWPORT_TOLERANCE);
    expect(visualBounds.left).toBeGreaterThanOrEqual(panelBounds.left - VIEWPORT_TOLERANCE);
    expect(visualBounds.right).toBeLessThanOrEqual(panelBounds.right + VIEWPORT_TOLERANCE);
    expect(canvasBounds.left).toBeGreaterThanOrEqual(visualBounds.left - VIEWPORT_TOLERANCE);
    expect(canvasBounds.right).toBeLessThanOrEqual(visualBounds.right + VIEWPORT_TOLERANCE);
    expect(canvasBounds.top).toBeGreaterThanOrEqual(sceneBounds.top - VIEWPORT_TOLERANCE);
    expect(canvasBounds.bottom).toBeLessThanOrEqual(sceneBounds.bottom + VIEWPORT_TOLERANCE);
    await expectNoHorizontalPageOverflow(page, `${viewport.width}x${viewport.height}`);
  }
});

test("移动端路线控制保持单行横向滚动且页面没有横向溢出", async ({ page }) => {
  for (const viewport of [
    { width: 375, height: 812 },
    { width: 320, height: 720 },
  ]) {
    await page.setViewportSize(viewport);
    await page.goto("/");

    const panel = page.locator('section[aria-labelledby="flow-title"]');
    const routes = page.getByLabel("四口岸路线聚焦控制");
    const routeButtons = routes.getByRole("button");

    await expect(panel).toBeVisible();
    await expect(routeButtons).toHaveCount(4);
    await routes.scrollIntoViewIfNeeded();

    const routeLayout = await routes.evaluate((element) => {
      const buttons = [...element.querySelectorAll("button")];
      return {
        clientWidth: element.clientWidth,
        overflowX: getComputedStyle(element).overflowX,
        panelRight: element.closest("section")?.getBoundingClientRect().right ?? 0,
        rows: buttons.map((button) => Math.round(button.getBoundingClientRect().top)),
        scrollWidth: element.scrollWidth,
      };
    });

    expect(routeLayout.scrollWidth).toBeGreaterThan(routeLayout.clientWidth);
    expect(["auto", "scroll"]).toContain(routeLayout.overflowX);
    expect(Math.max(...routeLayout.rows) - Math.min(...routeLayout.rows)).toBeLessThanOrEqual(2);
    expect(routeLayout.panelRight).toBeLessThanOrEqual(viewport.width + VIEWPORT_TOLERANCE);
    await expectNoHorizontalPageOverflow(page, `${viewport.width}x${viewport.height}`);
  }
});

test("拖动场景不会滚动页面或破坏路线聚焦功能", async ({ page }) => {
  const runtimeErrors: string[] = [];
  page.on("pageerror", (error) => runtimeErrors.push(error.message));

  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto("/");

  const scene = page.getByRole("region", { name: /香港与深圳四口岸地理流线/ });
  const canvas = scene.locator("canvas");
  const autoTour = page.getByRole("button", { name: "自动巡航 开" });
  await expect(canvas).toBeVisible();
  await canvas.scrollIntoViewIfNeeded();

  if (await autoTour.isVisible()) {
    await autoTour.click();
    await expect(page.getByRole("button", { name: "自动巡航 关" })).toHaveAttribute("aria-pressed", "false");
  }

  const returnOverview = page.getByRole("button", { name: "返回总览" });
  if (await returnOverview.isEnabled()) await returnOverview.click();

  const canvasBounds = await canvas.boundingBox();
  expect(canvasBounds).not.toBeNull();
  if (!canvasBounds) return;

  const startX = canvasBounds.x + canvasBounds.width * 0.45;
  const startY = canvasBounds.y + canvasBounds.height * 0.5;
  const scrollBeforeDrag = await page.evaluate(() => window.scrollY);

  await page.mouse.move(startX, startY);
  await page.mouse.down();
  await expect(scene).toHaveCSS("cursor", "grabbing");
  await page.mouse.move(startX + 90, startY + 28, { steps: 8 });
  await page.mouse.up();

  const scrollAfterDrag = await page.evaluate(() => window.scrollY);
  expect(Math.abs(scrollAfterDrag - scrollBeforeDrag)).toBeLessThanOrEqual(VIEWPORT_TOLERANCE);

  const firstRoute = page.getByLabel("四口岸路线聚焦控制").getByRole("button").first();
  if (await firstRoute.getAttribute("aria-pressed") !== "true") await firstRoute.click();
  await expect(firstRoute).toHaveAttribute("aria-pressed", "true");
  await expect(returnOverview).toBeEnabled();
  await returnOverview.click();
  await expect(returnOverview).toBeDisabled();
  await expect(page.getByRole("heading", { name: "四口岸动态态势" })).toBeVisible();
  expect(runtimeErrors).toEqual([]);
});

test("路线详情跟随锚点并夹紧在场景内，键盘操作会暂停巡航", async ({ page }) => {
  await page.setViewportSize({ width: 1024, height: 820 });
  await page.goto("/");

  const scene = page.getByRole("region", { name: /香港与深圳四口岸地理流线/ });
  const visual = scene.locator("..");
  const autoTourOn = page.getByRole("button", { name: "自动巡航 开" });
  await expect(scene.locator("canvas")).toBeVisible();
  await autoTourOn.click();

  const firstRoute = page.getByLabel("四口岸路线聚焦控制").getByRole("button").first();
  await firstRoute.click();
  const tooltip = visual.locator("aside[aria-live='polite']");
  await expect(tooltip).toBeVisible();

  const [visualBounds, tooltipBounds] = await Promise.all([boundsOf(visual), boundsOf(tooltip)]);
  expect(tooltipBounds.left).toBeGreaterThanOrEqual(visualBounds.left - VIEWPORT_TOLERANCE);
  expect(tooltipBounds.right).toBeLessThanOrEqual(visualBounds.right + VIEWPORT_TOLERANCE);
  expect(tooltipBounds.top).toBeGreaterThanOrEqual(visualBounds.top - VIEWPORT_TOLERANCE);
  expect(tooltipBounds.bottom).toBeLessThanOrEqual(visualBounds.bottom + VIEWPORT_TOLERANCE);

  await page.getByRole("button", { name: "自动巡航 关" }).click();
  await scene.focus();
  await page.keyboard.press("ArrowRight");
  await expect(page.getByRole("button", { name: "自动巡航 暂停" })).toHaveAttribute("aria-pressed", "true");
});

test("减少动态效果时关闭连续巡航但保留显式路线聚焦", async ({ page }) => {
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.goto("/");

  const autoTour = page.getByRole("button", { name: "自动巡航 关" });
  await expect(autoTour).toBeDisabled();
  const firstRoute = page.getByLabel("四口岸路线聚焦控制").getByRole("button").first();
  await firstRoute.click();
  await expect(firstRoute).toHaveAttribute("aria-pressed", "true");
  await expect(page.locator("aside[aria-live='polite']")).toBeVisible();
});

test("3D 场景离开视口时停止渲染并在返回后保留路线选择", async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto("/");

  const scene = page.getByRole("region", { name: /香港与深圳四口岸地理流线/ });
  const firstRoute = page.getByLabel("四口岸路线聚焦控制").getByRole("button").first();
  await scene.scrollIntoViewIfNeeded();
  await expect(scene.locator("canvas")).toBeVisible();
  await expect(scene).toHaveAttribute("data-render-state", "running");

  const autoTour = page.getByRole("button", { name: /自动巡航/ });
  if (await autoTour.getAttribute("aria-pressed") === "true") await autoTour.click();
  await expect(autoTour).toHaveAttribute("aria-pressed", "false");
  if (await firstRoute.getAttribute("aria-pressed") !== "true") await firstRoute.click();
  await expect(firstRoute).toHaveAttribute("aria-pressed", "true");
  await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
  await expect(scene).toHaveAttribute("data-render-state", "paused");

  await scene.scrollIntoViewIfNeeded();
  await expect(scene).toHaveAttribute("data-render-state", "running");
  await expect(firstRoute).toHaveAttribute("aria-pressed", "true");
});

test("WebGL context 丢失时显示文字回退并在恢复后重启场景", async ({ page }) => {
  await page.setViewportSize({ width: 1024, height: 820 });
  await page.goto("/");

  const scene = page.getByRole("region", { name: /香港与深圳四口岸地理流线/ });
  const canvas = scene.locator("canvas");
  const fallback = page.getByText("当前浏览器无法运行 3D 场景");
  await scene.scrollIntoViewIfNeeded();
  await expect(canvas).toBeVisible();
  await expect(scene).toHaveAttribute("data-render-state", "running");

  await canvas.evaluate((element) => {
    element.dispatchEvent(new Event("webglcontextlost", { cancelable: true }));
  });
  await expect(fallback).toBeVisible();
  await expect(scene).toHaveAttribute("data-render-state", "paused");

  await canvas.evaluate((element) => {
    element.dispatchEvent(new Event("webglcontextrestored"));
  });
  await expect(fallback).toBeHidden();
  await expect(scene).toHaveAttribute("data-render-state", "running");
});
