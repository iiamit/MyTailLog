import { test, expect } from "./fixtures";

// Phase 2: the Ask flow end-to-end with the AI stubbed (E2E_STUB_AI). Runs on the
// demo aircraft (which has seeded entries, so the route reaches the model rather
// than the "no entries yet" short-circuit). Proves the stub hook + the whole
// ask round-trip (input → API route → parsed {answer,citations} → rendered).
test("ask: a question returns a (stubbed) answer", async ({ page, demoBase }) => {
  await page.goto(`${demoBase}/ask`);
  await page.getByLabel(/ask a question/i).fill("When was the last annual?");
  await page.getByRole("button", { name: "Ask", exact: true }).click();
  await expect(page.getByText("E2E stubbed answer.")).toBeVisible({ timeout: 15_000 });
});
