import { test, expect } from "@playwright/test";
import sharp from "sharp";
test("calm shell, persisted brief, navigation and setup", async ({ page }) => {
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await page.goto("/");
  await expect(
    page.getByRole("heading", { name: "What do you want to create?" }),
  ).toBeVisible();
  await page
    .getByLabel("YOUR CREATIVE BRIEF")
    .fill("Exactly two red cubes. No text.");
  await page.getByRole("button", { name: "Save brief · unsaved" }).click();
  await page.reload();
  await expect(page.getByLabel("YOUR CREATIVE BRIEF")).toHaveValue(
    "Exactly two red cubes. No text.",
  );
  await page.getByRole("button", { name: "Edit", exact: true }).click();
  await expect(
    page.getByRole("heading", { name: "Start with an image" }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Library", exact: true }).click();
  await expect(
    page.getByRole("heading", { name: "Your work, close by." }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Local setup" }).click();
  await expect(
    page.getByRole("complementary", { name: "Local setup" }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Close local setup" }).click();
  expect(errors).toEqual([]);
});
test("imports a real image, saves a master and survives reload", async ({
  page,
}) => {
  await page.goto("/");
  await expect(page.locator("#project")).not.toHaveValue("");
  await page.locator("input[type=file]").setInputFiles({
    name: "fixture.png",
    mimeType: "image/png",
    buffer: await sharp({
      create: {
        width: 64,
        height: 48,
        channels: 4,
        background: { r: 227, g: 24, b: 36, alpha: 0.5 },
      },
    })
      .png()
      .toBuffer(),
  });
  await expect(page.getByRole("status")).toContainText("saved locally");
  await page
    .getByRole("button", { name: /fixture.png/ })
    .first()
    .click();
  await page.getByRole("button", { name: "Save initial master" }).click();
  await expect(page.getByRole("status")).toContainText("master saved");
  await page.reload();
  await page.getByRole("button", { name: "Library", exact: true }).click();
  await expect(
    page.getByRole("button", { name: /fixture.png/ }).first(),
  ).toBeVisible();
});
test("keyboard focus and narrow layout", async ({ page }) => {
  await page.goto("/");
  await page.keyboard.press("Tab");
  await expect(
    page.getByRole("link", { name: "Skip to workspace" }),
  ).toBeFocused();
  await page.setViewportSize({ width: 390, height: 844 });
  await expect(
    page.getByRole("heading", { name: "What do you want to create?" }),
  ).toBeVisible();
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= window.innerWidth,
    ),
  ).toBe(true);
});
