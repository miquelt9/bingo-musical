import { expect, test } from "@playwright/test";

const LIVE_HOME = "https://miquelt9.github.io/bingo-musical/";

test("home loads with meaningful content", async ({ page }, testInfo) => {
  const viewport = page.viewportSize();
  expect(viewport).not.toBeNull();
  if (testInfo.project.name === "mobile") {
    expect(viewport!.width).toBeLessThanOrEqual(639);
  }
  if (testInfo.project.name === "desktop") {
    expect(viewport!.width).toBe(1280);
  }

  const response = await page.goto(LIVE_HOME, { waitUntil: "domcontentloaded" });
  expect(response?.ok()).toBeTruthy();

  await expect(page).toHaveTitle(/Musical Bingo/i);
  const root = page.locator("#root");
  await expect(root).toContainText("Your bingo decks");
  await expect(root).toContainText("Decks saved on this device only.");
  await expect(page.getByRole("button", { name: "Create a YouTube deck" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Create a Deezer deck" })).toBeVisible();

  const text = (await root.innerText()).replace(/\s+/g, " ").trim();
  expect(text.length).toBeGreaterThan(40);
  const box = await root.boundingBox();
  expect(box?.width ?? 0).toBeGreaterThan(200);
  expect(box?.height ?? 0).toBeGreaterThan(200);

  await page.screenshot({
    path: `e2e/screenshots/home-${testInfo.project.name}.png`,
    fullPage: true,
  });
});
