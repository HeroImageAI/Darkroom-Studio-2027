// Model completion is explicitly mocked here. Real GPU outcome QA is separate.
import { test, expect, type Page } from "@playwright/test";
import sharp from "sharp";
import { randomUUID } from "node:crypto";
async function setup(page: Page, loseResponse = false) {
  await page.route("**/api/edit-capabilities", (r) =>
    r.fulfill({
      json: {
        tasks: [
          "Remove",
          "Replace",
          "Recolour",
          "Background",
          "Expand",
          "Instruct",
        ],
      },
    }),
  );
  await page.goto("/");
  await expect(page.locator("#project")).not.toHaveValue("");
  await page.getByRole("button", { name: "Edit", exact: true }).click();
  await page.getByLabel("Import image files", { exact: true }).setInputFiles({
    name: "AI edit fixture.png",
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
  const project = await page.locator("#project").inputValue();
  const id = await page.evaluate(
    (project) => localStorage.getItem("darkroom.lastDocument." + project),
    project,
  );
  const doc = await (await page.request.get("/api/documents/" + id)).json();
  const headers = {
    "x-darkroom-token": (await (await page.request.get("/api/session")).json())
      .token,
  };
  const result = await (
    await page.request.post("/api/assets?projectId=" + project, {
      headers,
      multipart: {
        file: {
          name: "mock model result.png",
          mimeType: "image/png",
          buffer: await sharp({
            create: {
              width: 640,
              height: 480,
              channels: 3,
              background: "blue",
            },
          })
            .png()
            .toBuffer(),
        },
      },
    })
  ).json();
  let entries: any[] = [];
  const calls: any[] = [];
  await page.route("**/api/documents/" + id + "/edits", (r) =>
    r.fulfill({ json: entries }),
  );
  await page.route("**/api/edits", async (r) => {
    const body = r.request().postDataJSON();
    calls.push(body);
    if (!entries.length)
      entries = [
        {
          jobId: randomUUID(),
          documentId: id,
          sourceAssetId: doc.originalAssetId,
          maskAssetId: doc.originalAssetId,
          disposition: "candidate",
          acceptedDocumentId: null,
          request: body,
          job: { id: "fixture-job", state: "succeeded", resultId: result.id },
        },
      ];
    if (loseResponse && calls.length === 1) return r.abort("connectionfailed");
    await r.fulfill({ status: 202, json: entries[0] });
  });
  await page.route("**/api/edits/*/review", async (r) => {
    const action = r.request().postDataJSON().action;
    if (action === "reject") {
      entries[0].disposition = "rejected";
      return r.fulfill({ json: entries[0] });
    }
    const current = await (
      await page.request.get("/api/documents/" + id)
    ).json();
    if (current.currentRevisionId !== entries[0].request.expectedRevision)
      return r.fulfill({
        status: 409,
        json: {
          error:
            "The master changed while the edit ran. Keep this result as a separate version instead.",
        },
      });
    const snapshot = {
      ...current.snapshot,
      layers: [
        ...current.snapshot.layers.map((l: any) => ({ ...l, visible: false })),
        {
          ...current.snapshot.layers[0],
          id: randomUUID(),
          assetId: result.id,
          name: "Recolour · AI result",
          type: "generated",
          locked: false,
        },
      ],
    };
    const saved = await page.request.patch("/api/documents/" + id, {
      headers,
      data: { expectedRevision: current.currentRevisionId, snapshot },
    });
    expect(saved.ok()).toBe(true);
    entries[0].disposition = "accepted";
    entries[0].acceptedDocumentId = id;
    await r.fulfill({ json: entries[0] });
  });
  await page.getByRole("button", { name: "Select", exact: true }).click();
  const box = await page
    .getByRole("img", { name: "Editable image canvas" })
    .boundingBox();
  if (!box) throw Error("Canvas absent");
  await page.mouse.move(box.x + box.width * 0.2, box.y + box.height * 0.2);
  await page.mouse.down();
  await page.mouse.move(box.x + box.width * 0.7, box.y + box.height * 0.7, {
    steps: 6,
  });
  await page.mouse.up();
  await expect(
    page.getByText("All changes saved", { exact: true }),
  ).toBeVisible();
  await page.getByLabel("AI edit action").selectOption("Recolour");
  await page
    .getByLabel("AI edit instruction")
    .fill("Make only the selected area blue. Preserve NOIR exactly.");
  return { id, calls };
}
test("AI review compares a proposed result and changes the master only on acceptance", async ({
  page,
}) => {
  const { id, calls } = await setup(page);
  const before = await (await page.request.get("/api/documents/" + id)).json();
  await page.getByRole("button", { name: "Apply change", exact: true }).click();
  await expect(
    page.getByRole("img", { name: "Proposed AI edit", exact: true }),
  ).toBeVisible();
  await expect(
    page.getByRole("img", { name: "AI review on canvas", exact: true }),
  ).toBeVisible();
  expect(calls[0]).toMatchObject({
    documentId: id,
    expectedRevision: before.currentRevisionId,
    task: "Recolour",
    area: "selection",
    instruction: "Make only the selected area blue. Preserve NOIR exactly.",
  });
  expect(
    (await (await page.request.get("/api/documents/" + id)).json())
      .currentRevisionId,
  ).toBe(before.currentRevisionId);
  await page.getByRole("button", { name: "Compare with before" }).click();
  await expect(
    page.getByRole("img", { name: "Before AI edit", exact: true }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Accept edit", exact: true }).click();
  await expect(
    page.getByRole("heading", { name: "Recolour · AI result", exact: true }),
  ).toBeVisible();
  expect(
    (await (await page.request.get("/api/documents/" + id)).json()).snapshot
      .layers,
  ).toHaveLength(2);
  await page.reload();
  await page.getByRole("button", { name: "Edit", exact: true }).click();
  await expect(
    page.getByRole("heading", { name: "Recolour · AI result", exact: true }),
  ).toBeVisible();
});
test("lost edit response retries the exact saved request and rejection preserves the master", async ({
  page,
}) => {
  const { id, calls } = await setup(page, true);
  const before = await (await page.request.get("/api/documents/" + id)).json();
  await page.getByRole("button", { name: "Apply change", exact: true }).click();
  await expect(
    page.getByRole("button", { name: "Retry same request", exact: true }),
  ).toBeVisible();
  await page
    .getByRole("button", { name: "Retry same request", exact: true })
    .click();
  await expect(
    page.getByRole("button", { name: "Reject edit", exact: true }),
  ).toBeVisible();
  expect(calls).toHaveLength(2);
  expect(calls[1]).toEqual(calls[0]);
  await page.getByRole("button", { name: "Reject edit", exact: true }).click();
  await expect(page.getByText("Ready for review · rejected")).toBeVisible();
  expect(
    (await (await page.request.get("/api/documents/" + id)).json())
      .currentRevisionId,
  ).toBe(before.currentRevisionId);
});
