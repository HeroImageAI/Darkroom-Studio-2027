import { test, expect, type Page } from "@playwright/test";
import sharp from "sharp";
const ids = {
  reference: "27f8387b-f439-4243-9694-77e50c18c851",
  second: "b704a4cb-f420-4c99-bd53-85b61dbdc8a1",
  batch: "d3f70da0-38ca-48b0-9288-222239e3ef01",
  doc: "d4ee934c-a07a-4f72-b1cf-8f45b87d22aa",
  version: "39de7ad0-179d-48f7-a7aa-f23c66a09935",
};
async function mockCreate(page: Page, loseFirstResponse = false) {
  const bytes = await sharp({
    create: { width: 64, height: 64, channels: 3, background: "#e31824" },
  })
    .png()
    .toBuffer();
  let batches: any[] = [];
  const calls: any[] = [];
  const originals = [ids.reference, ids.second].map((id, i) => ({
    id,
    name: "Reference fixture " + (i + 1),
    width: 64,
    height: 64,
    mime: "image/png",
    origin: "import",
    createdAt: new Date().toISOString(),
    alpha: false,
    hash: "fixture",
  }));
  const outputs = [0, 1].map((i) => ({
    ...originals[0],
    id: i
      ? "7e387795-c388-4bd1-a5d9-07b85edf4a7e"
      : "0796940b-8e42-4bcd-9a91-5910f0b07ba8",
    name: "Variation " + (i + 1) + ".png",
    origin: "generated",
  }));
  await page.route("**/api/setup", (r) =>
    r.fulfill({
      json: {
        engine: {
          verified: true,
          connected: true,
          version: "test fixture",
          models: {},
        },
        workflow: { ready: true, reason: "Test fixture only" },
        requirements: [],
        optional: [],
      },
    }),
  );
  await page.route("**/api/projects/*/assets", (r) =>
    r.fulfill({ json: [...originals, ...(batches.length ? outputs : [])] }),
  );
  await page.route("**/api/assets/*", (r) =>
    r.fulfill({ contentType: "image/png", body: bytes }),
  );
  await page.route("**/api/projects/*/create", (r) =>
    r.fulfill({ json: batches }),
  );
  await page.route("**/api/create", async (r) => {
    const request = r.request().postDataJSON();
    calls.push(request);
    if (!batches.length) {
      const jobs = Array.from({ length: request.variations }, (_, i) => ({
        id: "job-" + i,
        projectId: request.projectId,
        intent: { ...request.intent, seed: request.intent.seed + i },
        state: "succeeded",
        variationIndex: i,
        resultId: outputs[i % 2]!.id,
      }));
      batches = [
        {
          id: ids.batch,
          request,
          createdAt: new Date().toISOString(),
          jobs,
          candidates: jobs.map((j, i) => ({
            id: "candidate-" + i,
            jobId: j.id,
            assetId: outputs[i % 2]!.id,
            variationIndex: i,
            disposition: "candidate",
            documentId: null,
            versionId: null,
          })),
        },
      ];
    }
    if (loseFirstResponse && calls.length === 1)
      return r.abort("connectionfailed");
    await r.fulfill({ status: 202, json: batches[0] });
  });
  await page.route("**/api/candidates/*/review", async (r) => {
    const id = r.request().url().split("/").at(-2);
    const action = r.request().postDataJSON().action;
    const c = batches[0].candidates.find((c: any) => c.id === id);
    Object.assign(c, {
      disposition: action === "reject" ? "rejected" : "accepted",
      documentId: ids.doc,
      versionId: ids.version,
    });
    await r.fulfill({ json: c });
  });
  return calls;
}
test("reviews variations, compares references, saves versions and sends a result to Edit", async ({
  page,
}) => {
  const calls = await mockCreate(page);
  await page.goto("/");
  await expect(page.locator("#project")).not.toHaveValue("");
  await page
    .getByLabel("YOUR CREATIVE BRIEF")
    .fill("One red bottle. Preserve the exact text NOIR.");
  await page.getByLabel("Add saved reference").selectOption(ids.reference);
  await page.getByLabel("Add saved reference").selectOption(ids.second);
  await page.getByRole("button", { name: "Move reference 2 earlier" }).click();
  await page.getByLabel("Quality", { exact: true }).selectOption("Final");
  await page.getByLabel("Variations", { exact: true }).selectOption("2");
  await page.getByRole("button", { name: "Generate ↗" }).click();
  await expect(page.getByAltText("Generated variation 1")).toBeVisible();
  expect(calls[0].intent.references).toEqual([ids.second, ids.reference]);
  expect(calls[0].intent.prompt).toBe(
    "One red bottle. Preserve the exact text NOIR.",
  );
  expect(calls[0].intent.model).toBe("Auto");
  await page.getByRole("button", { name: "Review variation 2" }).click();
  await page.getByRole("button", { name: "Compare", exact: true }).click();
  await expect(page.getByLabel("Compare with")).toBeVisible();
  await page.getByRole("button", { name: "Keep as version" }).click();
  await expect(
    page.getByRole("button", { name: "Accepted", exact: true }),
  ).toBeVisible();
  await page.reload();
  await expect(page.getByAltText("Generated variation 1")).toBeVisible();
  await page.getByRole("button", { name: "Send to Edit ↗" }).click();
  await expect(
    page.getByRole("heading", { name: "Your workspace." }),
  ).toBeVisible();
  await expect(page.getByRole("status")).toContainText(
    "Generated version saved",
  );
});
test("reuses the same idempotency key and random seed after a lost response", async ({
  page,
}) => {
  const calls = await mockCreate(page, true);
  await page.goto("/");
  await expect(page.locator("#project")).not.toHaveValue("");
  await page
    .getByLabel("YOUR CREATIVE BRIEF")
    .fill("Exactly two red cubes. No plants.");
  await page.getByRole("button", { name: "Generate ↗" }).click();
  await expect(page.getByRole("alert")).toBeVisible();
  await page.getByRole("button", { name: "Generate ↗" }).click();
  await expect(page.getByAltText("Generated variation 1")).toBeVisible();
  expect(calls).toHaveLength(2);
  expect(calls[0].idempotencyKey).toBe(calls[1].idempotencyKey);
  expect(calls[0].intent.seed).toBe(calls[1].intent.seed);
});
