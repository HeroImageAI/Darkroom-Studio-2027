import { test, expect, type Page } from "@playwright/test";
import sharp from "sharp";
async function open(page: Page) {
  await page.goto("/");
  await expect(page.locator("#project")).not.toHaveValue("");
  await page.getByRole("button", { name: "Edit", exact: true }).click();
  await page.getByLabel("Import image files", { exact: true }).setInputFiles({
    name: "edit-fixture.png",
    mimeType: "image/png",
    buffer: await sharp({
      create: { width: 640, height: 480, channels: 4, background: "#e31824" },
    })
      .png()
      .toBuffer(),
  });
  await page.getByRole("button", { name: "Save initial master" }).click();
  await expect(
    page.getByText("All changes saved", { exact: true }),
  ).toBeVisible();
  const id = await page.evaluate(() =>
    localStorage.getItem(
      "darkroom.lastDocument." +
        (document.querySelector("#project") as HTMLSelectElement).value,
    ),
  );
  const token = (await (await page.request.get("/api/session")).json()).token;
  return { id, headers: { "x-darkroom-token": token } };
}
async function drag(page: Page, from: [number, number], to: [number, number]) {
  const box = await page
    .getByRole("img", { name: "Editable image canvas" })
    .boundingBox();
  if (!box) throw Error("Canvas not visible");
  await page.mouse.move(
    box.x + box.width * from[0],
    box.y + box.height * from[1],
  );
  await page.mouse.down();
  await page.mouse.move(box.x + box.width * to[0], box.y + box.height * to[1], {
    steps: 8,
  });
  await page.mouse.up();
}
test("real editable master persists transforms masks selection crop and keyboard history", async ({
  page,
}) => {
  const { id } = await open(page);
  const original = await (
    await page.request.get("/api/documents/" + id)
  ).json();
  const source = await (
    await page.request.get("/api/assets/" + original.originalAssetId)
  ).body();
  await page
    .getByRole("button", { name: "Duplicate layer", exact: true })
    .click();
  await page.getByLabel("Show Original", { exact: true }).uncheck();
  await page.getByLabel("x", { exact: true }).fill("30");
  await expect(page.getByLabel("x", { exact: true })).toHaveValue("30");
  await page.getByRole("heading", { name: "Your working canvas." }).click();
  await page.keyboard.press("Control+z");
  await expect(page.getByLabel("x", { exact: true })).toHaveValue("0");
  await page.keyboard.press("Control+Shift+z");
  await expect(page.getByLabel("x", { exact: true })).toHaveValue("30");
  await page.getByText("More tools", { exact: true }).click();
  await page.getByRole("button", { name: "Mask", exact: true }).click();
  await page.getByLabel("Mask brush size").fill("100");
  const before = await page
    .getByRole("img", { name: "Editable image canvas" })
    .screenshot();
  await drag(page, [0.4, 0.5], [0.6, 0.5]);
  await page.getByRole("button", { name: "Undo", exact: true }).click();
  await expect(
    page.getByRole("button", { name: "Original copy · masked", exact: true }),
  ).toHaveCount(0);
  await page.getByRole("button", { name: "Redo", exact: true }).click();
  await expect(
    page.getByRole("button", { name: "Original copy · masked", exact: true }),
  ).toBeVisible();
  const after = await page
    .getByRole("img", { name: "Editable image canvas" })
    .screenshot();
  expect(after.equals(before)).toBe(false);
  // Inspect actual displayed pixels, not only successful mask persistence.
  const pixel = await sharp(after).raw().toBuffer({ resolveWithObject: true });
  const i =
    (Math.floor(pixel.info.height * 0.5) * pixel.info.width +
      Math.floor(pixel.info.width * 0.5)) *
    pixel.info.channels;
  expect(pixel.data[i]).toBeLessThan(100); // checkerboard replaces the red source at the hidden stroke
  await page.getByRole("button", { name: "Select", exact: true }).click();
  await drag(page, [0.2, 0.2], [0.7, 0.7]);
  await expect(
    page.getByRole("button", { name: "Clear selection" }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Crop", exact: true }).click();
  await drag(page, [0.1, 0.1], [0.8, 0.8]);
  await page.getByRole("button", { name: "Apply crop" }).click();
  await expect(
    page.getByText("All changes saved", { exact: true }),
  ).toBeVisible();
  const saved = await (await page.request.get("/api/documents/" + id)).json();
  expect(saved.snapshot.width).toBeLessThan(640);
  expect(saved.snapshot.layers).toHaveLength(2);
  expect(saved.snapshot.layers[1].maskStrokes).toHaveLength(1);
  expect(saved.snapshot.selection).toBeUndefined();
  await page.getByLabel("Edit version name").fill("Masked and cropped");
  await page.getByRole("button", { name: "Keep edit version" }).click();
  await expect(
    page.getByText("Named version saved", { exact: true }),
  ).toBeVisible();
  await page.reload();
  await page.getByRole("button", { name: "Edit", exact: true }).click();
  await expect(
    page.getByRole("button", { name: "Original copy · masked" }),
  ).toBeVisible();
  expect(
    await (
      await page.request.get("/api/assets/" + original.originalAssetId)
    ).body(),
  ).toEqual(source);
});
test("conflicting saves retain both masters without overwriting the competing edit", async ({
  page,
}) => {
  const { id, headers } = await open(page);
  const other = await (await page.request.get("/api/documents/" + id)).json();
  const response = await page.request.patch("/api/documents/" + id, {
    headers,
    data: {
      expectedRevision: other.currentRevisionId,
      snapshot: { ...other.snapshot, width: 500 },
    },
  });
  expect(response.ok()).toBe(true);
  await page
    .getByRole("button", { name: "Duplicate layer", exact: true })
    .click();
  await expect(
    page.getByText("Save conflict · your changes are retained"),
  ).toBeVisible();
  await page
    .getByRole("button", { name: "Keep changes as separate master" })
    .click();
  await expect(
    page.getByText("All changes saved", { exact: true }),
  ).toBeVisible();
  expect(
    (await (await page.request.get("/api/documents/" + id)).json()).snapshot
      .width,
  ).toBe(500);
  const copyId = await page.evaluate(() =>
    localStorage.getItem(
      "darkroom.lastDocument." +
        (document.querySelector("#project") as HTMLSelectElement).value,
    ),
  );
  expect(copyId).not.toBe(id);
  const copy = await (
    await page.request.get("/api/documents/" + copyId)
  ).json();
  expect(copy.snapshot.width).toBe(640);
  expect(copy.snapshot.layers).toHaveLength(2);
});
test("unsaved local recovery restores a failed save after reload", async ({
  page,
}) => {
  const { id } = await open(page);
  let fail = true;
  await page.route("**/api/documents/" + id, (r) =>
    r.request().method() === "PATCH" && fail
      ? r.abort("connectionfailed")
      : r.continue(),
  );
  await page
    .getByRole("button", { name: "Duplicate layer", exact: true })
    .click();
  await expect(page.getByText("Not saved · retry available")).toBeVisible();
  fail = false;
  await page.reload();
  await page.getByRole("button", { name: "Edit", exact: true }).click();
  await expect(
    page.getByText("An unsaved browser draft is available."),
  ).toBeVisible();
  await page
    .getByRole("button", { name: "Restore draft", exact: true })
    .click();
  await expect(
    page.getByText("All changes saved", { exact: true }),
  ).toBeVisible();
  expect(
    (await (await page.request.get("/api/documents/" + id)).json()).snapshot
      .layers,
  ).toHaveLength(2);
  await page.setViewportSize({ width: 390, height: 844 });
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
});

test("undoing back to the saved state removes an obsolete browser recovery draft", async ({
  page,
}) => {
  const { id } = await open(page);
  await page
    .getByRole("button", { name: "Duplicate layer", exact: true })
    .click();
  await expect(
    page.getByText("All changes saved", { exact: true }),
  ).toBeVisible();
  await page.getByLabel("x", { exact: true }).fill("12");
  await page.getByRole("heading", { name: "Your working canvas." }).click();
  await page.keyboard.press("Control+z");
  await expect(page.getByLabel("x", { exact: true })).toHaveValue("0");
  await expect(
    page.getByText("All changes saved", { exact: true }),
  ).toBeVisible();
  expect(
    await page.evaluate(
      (id) => localStorage.getItem("darkroom.master." + id),
      id,
    ),
  ).toBeNull();
});

test("composition places cutouts, paints and erases on a separate layer, then reopens", async ({
  page,
}) => {
  const { id, headers } = await open(page);
  const original = await (
    await page.request.get("/api/documents/" + id)
  ).json();
  const project = await page.locator("#project").inputValue();
  const cutout = await sharp(
    Buffer.from(
      '<svg width="80" height="80"><circle cx="40" cy="40" r="30" fill="#245ad0"/></svg>',
    ),
  )
    .png()
    .toBuffer();
  const asset = await (
    await page.request.post("/api/assets?projectId=" + project, {
      headers,
      multipart: {
        file: {
          name: "owned-cutout.png",
          mimeType: "image/png",
          buffer: cutout,
        },
      },
    })
  ).json();
  await page.reload();
  await page.getByRole("button", { name: "Edit", exact: true }).click();
  await page.getByText("Add to this canvas", { exact: true }).click();
  await page.getByLabel("Image to place").selectOption(asset.id);
  await page.getByRole("button", { name: "Place image", exact: true }).click();
  await expect(
    page.getByRole("button", { name: "owned-cutout.png", exact: true }),
  ).toBeVisible();
  await page.getByLabel("x", { exact: true }).fill("100");
  await page
    .getByRole("button", { name: "New paint layer", exact: true })
    .click();
  await page.getByLabel("Paint colour", { exact: true }).fill("#00ff00");
  await page.getByLabel("Paint brush size").fill("80");
  await drag(page, [0.3, 0.7], [0.6, 0.7]);
  await expect(
    page.getByRole("button", { name: "Guidance paint", exact: true }),
  ).toBeVisible();
  await expect(
    page.getByText("All changes saved", { exact: true }),
  ).toBeVisible();
  const painted = await (await page.request.get("/api/documents/" + id)).json();
  expect(painted.snapshot.layers).toHaveLength(3);
  const paint = painted.snapshot.layers[2];
  expect(paint.type).toBe("paint");
  const before = await sharp(
    await (await page.request.get("/api/assets/" + paint.assetId)).body(),
  )
    .ensureAlpha()
    .raw()
    .toBuffer();
  expect(before[(336 * 640 + 288) * 4 + 1]).toBe(255);
  expect(before[(336 * 640 + 288) * 4 + 3]).toBe(255);
  if (
    !(await page
      .getByRole("button", { name: "Erase", exact: true })
      .isVisible())
  )
    await page.getByText("More tools", { exact: true }).click();
  await page.getByRole("button", { name: "Erase", exact: true }).click();
  await drag(page, [0.4, 0.7], [0.5, 0.7]);
  await expect(
    page.getByText("All changes saved", { exact: true }),
  ).toBeVisible();
  const erased = await (await page.request.get("/api/documents/" + id)).json();
  expect(erased.snapshot.layers[2].assetId).not.toBe(paint.assetId);
  const after = await sharp(
    await (
      await page.request.get("/api/assets/" + erased.snapshot.layers[2].assetId)
    ).body(),
  )
    .ensureAlpha()
    .raw()
    .toBuffer();
  expect(after[(336 * 640 + 288) * 4 + 3]).toBe(0);
  await page.getByRole("button", { name: "Undo", exact: true }).click();
  await expect
    .poll(
      async () =>
        (await (await page.request.get("/api/documents/" + id)).json()).snapshot
          .layers[2].assetId,
    )
    .toBe(paint.assetId);
  await expect(
    page.getByText("All changes saved", { exact: true }),
  ).toBeVisible();
  const undone = await (await page.request.get("/api/documents/" + id)).json();
  expect(undone.snapshot.layers[2].assetId).toBe(paint.assetId);
  await page.getByRole("button", { name: "Select", exact: true }).click();
  await drag(page, [0.1, 0.1], [0.3, 0.3]);
  await page.getByText("Harmonise a composite", { exact: true }).click();
  await page.getByRole("button", { name: "Harmonise composite" }).click();
  await expect(page.getByLabel("AI edit action")).toHaveValue("Instruct");
  await expect(page.getByLabel("AI edit area")).toHaveValue("outside");
  await expect(page.getByLabel("AI edit instruction")).toContainText(
    "coherent professional photograph",
  );
  await expect(
    page.getByText("All changes saved", { exact: true }),
  ).toBeVisible();
  await page.reload();
  await page.getByRole("button", { name: "Edit", exact: true }).click();
  await expect(
    page.getByRole("button", { name: "Guidance paint", exact: true }),
  ).toBeVisible();
  const reopened = await (
    await page.request.get("/api/documents/" + id)
  ).json();
  expect(reopened.originalAssetId).toBe(original.originalAssetId);
  expect(reopened.snapshot.layers).toHaveLength(3);
});

test("selection add/subtract survives undo and reload without changing source pixels", async ({
  page,
}) => {
  const { id } = await open(page);
  await page.getByRole("button", { name: "Select", exact: true }).click();
  await drag(page, [0.1, 0.1], [0.8, 0.8]);
  await page.getByLabel("Selection mode").selectOption("subtract");
  await drag(page, [0.3, 0.3], [0.5, 0.5]);
  await expect
    .poll(
      async () =>
        (await (await page.request.get("/api/documents/" + id)).json()).snapshot
          .selectionMaskAssetId,
    )
    .toBeTruthy();
  let doc = await (await page.request.get("/api/documents/" + id)).json();
  const bytes = await (
    await page.request.get("/api/assets/" + doc.snapshot.selectionMaskAssetId)
  ).body();
  const mask = await sharp(bytes).removeAlpha().greyscale().raw().toBuffer();
  expect(mask[192 * 640 + 256]).toBe(0);
  expect(mask[96 * 640 + 128]).toBe(255);
  await expect(
    page.getByText("All changes saved", { exact: true }),
  ).toBeVisible();
  await page.reload();
  await page.getByRole("button", { name: "Edit", exact: true }).click();
  await expect(page.locator("mask#selection-preview image")).toHaveAttribute(
    "href",
    "/api/assets/" + doc.snapshot.selectionMaskAssetId,
  );
  await page
    .getByRole("button", { name: "Clear selection", exact: true })
    .click();
  await page.getByRole("button", { name: "Undo", exact: true }).click();
  await expect(page.locator("mask#selection-preview image")).toHaveAttribute(
    "href",
    "/api/assets/" + doc.snapshot.selectionMaskAssetId,
  );
});
