import { test, expect } from "@playwright/test";
import sharp from "sharp";
test("Finish prepares real PNG and JPEG attachments and initiates downloads without changing the master", async ({
  page,
}) => {
  await page.goto("/");
  await expect(page.locator("#project")).not.toHaveValue("");
  await page.getByRole("button", { name: "Edit", exact: true }).click();
  const source = await sharp(
    Buffer.from(
      '<svg width="320" height="256"><rect x="60" y="40" width="200" height="176" fill="#e40024"/></svg>',
    ),
  )
    .png()
    .toBuffer();
  await page.getByLabel("Import image files", { exact: true }).setInputFiles({
    name: "Finish owned.png",
    mimeType: "image/png",
    buffer: source,
  });
  await page.getByRole("button", { name: "Save initial master" }).click();
  await expect(
    page.getByText("All changes saved", { exact: true }),
  ).toBeVisible();
  const project = await page.locator("#project").inputValue(),
    id = await page.evaluate(
      (project) => localStorage.getItem("darkroom.lastDocument." + project),
      project,
    );
  const doc = await (await page.request.get("/api/documents/" + id)).json();
  await page.getByText("Finish & export", { exact: true }).click();
  await page.getByLabel("Finish action").selectOption("Restore");
  await expect(
    page.getByText(
      "Select lettering, a logo or details to keep unchanged, then run Restore.",
    ),
  ).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Run finishing", exact: true }),
  ).toBeDisabled();
  await page.getByLabel("Finish action").selectOption("Remove background");
  await page.getByLabel("Export size").selectOption("2");
  await page
    .getByRole("button", { name: "Prepare export", exact: true })
    .click();
  const png = page.getByRole("link", { name: "640 × 512 · PNG · alpha" });
  await expect(png).toBeVisible();
  const downloading = page.waitForEvent("download");
  await png.click();
  const download = await downloading;
  expect(download.suggestedFilename()).toMatch(/\.png$/);
  // Verify served attachment bytes independently of the OS save dialog. Native saving is a separate live check.
  const attachment = await page.request.get(download.url());
  expect(attachment.headers()["content-disposition"]).toContain("attachment");
  const bytes = await attachment.body(),
    meta = await sharp(bytes).metadata();
  expect([meta.width, meta.height, meta.hasAlpha]).toEqual([640, 512, true]);
  expect(
    (
      await sharp(bytes)
        .ensureAlpha()
        .extract({ left: 0, top: 0, width: 1, height: 1 })
        .raw()
        .toBuffer()
    )[3],
  ).toBe(0);
  await page.getByLabel("Export format").selectOption("jpeg");
  await page.getByLabel("Export size").selectOption("custom");
  await page.getByLabel("Export width").fill("400");
  await page.getByLabel("Export height").fill("300");
  await page
    .getByRole("button", { name: "Prepare export", exact: true })
    .click();
  const jpeg = page.getByRole("link", { name: "400 × 300 · JPEG" });
  await expect(jpeg).toBeVisible();
  const second = page.waitForEvent("download");
  await jpeg.click();
  const jpgDownload = await second;
  expect(jpgDownload.suggestedFilename()).toMatch(/\.jpg$/);
  const jpg = await sharp(
    await (await page.request.get(jpgDownload.url())).body(),
  ).metadata();
  expect([jpg.width, jpg.height, jpg.hasAlpha]).toEqual([400, 300, false]);
  const latest = await (await page.request.get("/api/documents/" + id)).json();
  expect(latest.currentRevisionId).toBe(doc.currentRevisionId);
  expect(
    await (await page.request.get("/api/assets/" + doc.originalAssetId)).body(),
  ).toEqual(source);
  await page.reload();
  await expect(page.locator("#project")).not.toHaveValue("");
  await page.locator("#project").selectOption(project);
  await page.getByRole("button", { name: "Edit", exact: true }).click();
  await page.getByText("Finish & export", { exact: true }).click();
  await expect(
    page.getByRole("link", { name: "400 × 300 · JPEG" }),
  ).toBeVisible();
  await page.getByLabel("Finish action").selectOption("Restore");
  await page.getByRole("button", { name: "Select", exact: true }).click();
  const canvas = await page
    .getByRole("img", { name: "Editable image canvas" })
    .boundingBox();
  if (!canvas) throw Error("Canvas not visible");
  await page.mouse.move(
    canvas.x + canvas.width * 0.3,
    canvas.y + canvas.height * 0.3,
  );
  await page.mouse.down();
  await page.mouse.move(
    canvas.x + canvas.width * 0.7,
    canvas.y + canvas.height * 0.7,
    { steps: 5 },
  );
  await page.mouse.up();
  await expect(
    page.getByRole("button", { name: "Run finishing", exact: true }),
  ).toBeEnabled();
  await expect(
    page.getByText(
      "Selected details stay unchanged. Restore repairs the surrounding image at the original size.",
    ),
  ).toBeVisible();
});
