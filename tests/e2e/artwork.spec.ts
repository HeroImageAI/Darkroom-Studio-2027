import { test, expect } from "@playwright/test";
import sharp from "sharp";
test("artwork corners, review and separate master preserve the source and survive reload", async ({
  page,
}) => {
  await page.goto("/");
  await expect(page.locator("#project")).not.toHaveValue("");
  await page.getByRole("button", { name: "Edit", exact: true }).click();
  await page.getByLabel("Import image files", { exact: true }).setInputFiles({
    name: "owned-artwork.png",
    mimeType: "image/png",
    buffer: await sharp(
      Buffer.from(
        '<svg width="400" height="240" xmlns="http://www.w3.org/2000/svg"><rect width="400" height="240" fill="#f2eee3"/><path d="M30 30H370V210H30Z" stroke="#e31824" stroke-width="5" fill="none"/><path d="M80 80H320M80 120H260M80 160H320" stroke="#14161a" stroke-width="12"/></svg>',
      ),
    )
      .png()
      .toBuffer(),
  });
  await page.getByRole("button", { name: "Save initial master" }).click();
  await expect(
    page.getByText("All changes saved", { exact: true }),
  ).toBeVisible();
  const projectId = await page.locator("#project").inputValue();
  const sourceId = await page.evaluate(
    (project) => localStorage.getItem("darkroom.lastDocument." + project),
    projectId,
  );
  const original = await (
    await page.request.get(`/api/documents/${sourceId}`)
  ).json();
  await page.getByText("Finish & export", { exact: true }).click();
  await page.getByText("Straighten artwork", { exact: true }).click();
  await page
    .getByRole("button", { name: "Use image corners", exact: true })
    .click();
  await expect(
    page.getByText("Four corners marked", { exact: true }),
  ).toBeVisible();
  await expect(page.locator("[data-artwork-corner]")).toHaveCount(4);
  await page.getByText("Corner coordinates", { exact: true }).click();
  await page.getByLabel("Top-left x", { exact: true }).fill("20");
  await page.getByLabel("Top-left y", { exact: true }).fill("20");
  await page.getByLabel("Top-right x", { exact: true }).fill("379");
  await page.getByLabel("Top-right y", { exact: true }).fill("20");
  await page.getByLabel("Bottom-right x", { exact: true }).fill("379");
  await page.getByLabel("Bottom-right y", { exact: true }).fill("219");
  await page.getByLabel("Bottom-left x", { exact: true }).fill("20");
  await page.getByLabel("Bottom-left y", { exact: true }).fill("219");
  await page.getByLabel("Artwork width", { exact: true }).fill("360");
  await page.getByLabel("Artwork height", { exact: true }).fill("200");
  await page
    .getByRole("button", { name: "Preview artwork", exact: true })
    .click();
  await expect(
    page.getByRole("img", { name: "Result preview on canvas", exact: true }),
  ).toBeVisible();
  const candidates = await (
    await page.request.get(`/api/documents/${sourceId}/artwork`)
  ).json();
  expect(candidates).toHaveLength(1);
  const png = await (
    await page.request.get(`/api/assets/${candidates[0].assetId}`)
  ).body();
  expect(await sharp(png).metadata()).toMatchObject({
    width: 360,
    height: 200,
    hasAlpha: true,
  });
  expect(
    (await (await page.request.get(`/api/documents/${sourceId}`)).json())
      .currentRevisionId,
  ).toBe(original.currentRevisionId);
  await page.reload();
  await page.getByRole("button", { name: "Edit", exact: true }).click();
  await page.getByText("Finish & export", { exact: true }).click();
  await page.getByText("Straighten artwork", { exact: true }).click();
  await page
    .getByRole("button", { name: "View artwork preview", exact: true })
    .click();
  await expect(
    page.getByRole("img", { name: "Result preview on canvas", exact: true }),
  ).toBeVisible();
  await page
    .getByRole("button", { name: "Save as new master", exact: true })
    .click();
  await expect(
    page.getByRole("button", {
      name: "Straightened artwork · raster",
      exact: true,
    }),
  ).toBeVisible();
  const copyId = await page.evaluate(
    (project) => localStorage.getItem("darkroom.lastDocument." + project),
    projectId,
  );
  expect(copyId).not.toBe(sourceId);
  const copy = await (
    await page.request.get(`/api/documents/${copyId}`)
  ).json();
  expect(copy.originalAssetId).toBe(original.originalAssetId);
  expect(copy.snapshot.width).toBe(360);
  expect(copy.snapshot.height).toBe(200);
  expect(copy.snapshot.layers[0].visible).toBe(false);
  await page.reload();
  await page.getByRole("button", { name: "Edit", exact: true }).click();
  await expect(
    page.getByRole("button", {
      name: "Straightened artwork · raster",
      exact: true,
    }),
  ).toBeVisible();
  expect(
    (await (await page.request.get(`/api/documents/${sourceId}`)).json())
      .currentRevisionId,
  ).toBe(original.currentRevisionId);
});
test("a visible selection can isolate artwork with real transparent output", async ({
  page,
}) => {
  await page.goto("/");
  await expect(page.locator("#project")).not.toHaveValue("");
  await page.getByRole("button", { name: "Edit", exact: true }).click();
  await page.getByLabel("Import image files", { exact: true }).setInputFiles({
    name: "owned-isolation.png",
    mimeType: "image/png",
    buffer: await sharp({
      create: { width: 100, height: 80, channels: 4, background: "#e31824" },
    })
      .png()
      .toBuffer(),
  });
  await page.getByRole("button", { name: "Save initial master" }).click();
  await expect(
    page.getByText("All changes saved", { exact: true }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Select", exact: true }).click();
  const box = await page
    .getByRole("img", { name: "Editable image canvas", exact: true })
    .boundingBox();
  if (!box) throw Error("Canvas missing");
  await page.mouse.move(box.x + box.width * 0.2, box.y + box.height * 0.2);
  await page.mouse.down();
  await page.mouse.move(box.x + box.width * 0.8, box.y + box.height * 0.8, {
    steps: 5,
  });
  await page.mouse.up();
  await expect(
    page.getByRole("button", { name: "Clear selection", exact: true }),
  ).toBeVisible();
  await expect(
    page.getByText("All changes saved", { exact: true }),
  ).toBeVisible();
  const project = await page.locator("#project").inputValue();
  const sourceId = await page.evaluate(
    (p) => localStorage.getItem("darkroom.lastDocument." + p),
    project,
  );
  const frozen = await (
    await page.request.get(`/api/documents/${sourceId}`)
  ).json();
  await page.getByText("Finish & export", { exact: true }).click();
  await page.getByText("Straighten artwork", { exact: true }).click();
  await page
    .getByRole("button", { name: "Use image corners", exact: true })
    .click();
  await page.getByLabel("Keep selected artwork only", { exact: true }).check();
  await page
    .getByRole("button", { name: "Preview artwork", exact: true })
    .click();
  await expect(
    page.getByRole("img", { name: "Result preview on canvas", exact: true }),
  ).toBeVisible();
  const [candidate] = await (
    await page.request.get(`/api/documents/${sourceId}/artwork`)
  ).json();
  expect(candidate.selectionMaskHash).toMatch(/^[a-f0-9]{64}$/);
  const pixels = await sharp(
    await (await page.request.get(`/api/assets/${candidate.assetId}`)).body(),
  )
    .ensureAlpha()
    .raw()
    .toBuffer();
  expect(pixels[3]).toBe(0);
  expect([
    ...pixels.subarray((40 * 100 + 50) * 4, (40 * 100 + 50) * 4 + 4),
  ]).toEqual([227, 24, 36, 255]);
  expect(
    (await (await page.request.get(`/api/documents/${sourceId}`)).json())
      .currentRevisionId,
  ).toBe(frozen.currentRevisionId);
  await page
    .getByRole("button", { name: "Save as new master", exact: true })
    .click();
  await expect(
    page.getByRole("button", {
      name: "Isolated artwork · raster",
      exact: true,
    }),
  ).toBeVisible();
});
