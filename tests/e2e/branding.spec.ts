import { test, expect } from "@playwright/test";
import sharp from "sharp";
test("exact branding survives SVG delivery and editable project round-trip", async ({
  page,
}) => {
  await page.goto("/");
  await expect(page.locator("#project")).not.toHaveValue("");
  await page.getByRole("button", { name: "Edit", exact: true }).click();
  await page.getByLabel("Import image files", { exact: true }).setInputFiles({
    name: "owned-branding.png",
    mimeType: "image/png",
    buffer: await sharp({
      create: { width: 400, height: 240, channels: 4, background: "#ffffff" },
    })
      .png()
      .toBuffer(),
  });
  await page.getByRole("button", { name: "Save initial master" }).click();
  await expect(
    page.getByText("All changes saved", { exact: true }),
  ).toBeVisible();
  await page.getByText("Add branding", { exact: true }).click();
  await page.getByRole("button", { name: "Add text", exact: true }).click();
  await page.getByLabel("Text content", { exact: true }).fill("NOIR STUDIO");
  await page
    .getByLabel("Text font", { exact: true })
    .selectOption("Darkroom Sans Bold");
  await page.getByLabel("Text size", { exact: true }).fill("36");
  await page.getByLabel("Text colour", { exact: true }).fill("#111111");
  await page.getByLabel("x", { exact: true }).fill("20");
  await page.getByLabel("y", { exact: true }).fill("20");
  await expect(
    page.locator('g[aria-label="Editable text: NOIR STUDIO"] path'),
  ).toHaveAttribute("d", /^M/);
  await page
    .getByRole("button", { name: "Add rectangle", exact: true })
    .click();
  await page.getByLabel("Shape width").fill("100");
  await page.getByLabel("Shape height").fill("50");
  await page.getByLabel("x", { exact: true }).fill("30");
  await page.getByLabel("y", { exact: true }).fill("120");
  const svg =
    '<svg width="50" height="50" viewBox="0 0 50 50"><path d="M5 5L45 5L25 45Z" fill="#245ad0"/></svg>';
  await page.getByLabel("Import SVG logo file", { exact: true }).setInputFiles({
    name: "owned-mark.svg",
    mimeType: "image/svg+xml",
    buffer: Buffer.from(svg),
  });
  await expect(
    page.getByRole("heading", { name: "owned-mark.svg", exact: true }),
  ).toBeVisible();
  await page.getByLabel("Image width", { exact: true }).fill("100");
  await expect(page.getByLabel("Image height", { exact: true })).toHaveValue(
    "100",
  );
  await page.getByLabel("x", { exact: true }).fill("300");
  await page.getByLabel("y", { exact: true }).fill("120");
  await page.getByText("Finish & export", { exact: true }).click();
  await page.getByText("Artwork & project handoff", { exact: true }).click();
  await page
    .getByRole("button", { name: "Prepare SVG artwork", exact: true })
    .click();
  const link = page.getByRole("link", {
    name: "SVG artwork · 1 embedded raster image",
    exact: true,
  });
  await expect(link).toBeVisible();
  const href = await link.getAttribute("href");
  const response = await page.request.get(href!);
  expect(response.status()).toBe(200);
  expect(response.headers()["content-disposition"]).toContain("attachment");
  const delivered = await response.text();
  expect(delivered).not.toContain("<text");
  expect(delivered).toContain("M5 5L45 5L25 45Z");
  expect(delivered).toContain("data:image/png;base64,");
  const image = await sharp(Buffer.from(delivered))
    .ensureAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true });
  const pixel = (x: number, y: number) => [
    ...image.data.subarray((y * 400 + x) * 4, (y * 400 + x) * 4 + 4),
  ];
  expect(pixel(50, 140)).toEqual([227, 24, 36, 255]);
  expect(pixel(325, 135)).toEqual([36, 90, 208, 255]);
  await page
    .getByRole("button", { name: "Prepare Darkroom project", exact: true })
    .click();
  const projectLink = page.getByRole("link", {
    name: "Editable Darkroom project",
    exact: true,
  });
  await expect(projectLink).toBeVisible();
  const bundle = await (
    await page.request.get((await projectLink.getAttribute("href"))!)
  ).body();
  const previousProject = await page.locator("#project").inputValue();
  await page
    .getByLabel("Open Darkroom project file", { exact: true })
    .setInputFiles({
      name: "owned.darkroom.json",
      mimeType: "application/json",
      buffer: bundle,
    });
  await expect(page.locator("#project")).not.toHaveValue(previousProject);
  await expect(
    page.getByRole("button", { name: "Text", exact: true }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Text", exact: true }).click();
  await expect(page.getByLabel("Text content")).toHaveValue("NOIR STUDIO");
  await expect(page.getByLabel("Text font")).toHaveValue("Darkroom Sans Bold");
  await page.getByLabel("Text content").fill("NOIR EDITABLE");
  await page.getByRole("button", { name: "Save now", exact: true }).click();
  await expect(
    page.getByText("All changes saved", { exact: true }),
  ).toBeVisible();
  await page.reload();
  await page.getByRole("button", { name: "Edit", exact: true }).click();
  await page.getByRole("button", { name: "Text", exact: true }).click();
  await expect(page.getByLabel("Text content")).toHaveValue("NOIR EDITABLE");
});
