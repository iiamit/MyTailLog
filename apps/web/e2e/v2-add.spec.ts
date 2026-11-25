import { test, expect } from "./fixtures";

const actions = [
  { name: "Log a flight", path: /\/hours\?panel=reading$/, heading: "Add a reading", control: "Save reading" },
  { name: "Add oil", path: /\/oil\?panel=oil$/, heading: "Add oil", control: "Add oil" },
  { name: "Report a squawk", path: /\/maintenance\/squawks\?panel=new$/, heading: "Report a squawk", control: "Report squawk" },
  { name: "Add logbook pages", path: /\/logbooks\/add$/, heading: "Add pages", control: "choose files" },
  { name: "Add a document", path: /\/documents\?panel=new$/, heading: "Add a document", control: "File" },
  { name: "Upload documents", path: /\/inbox$/, heading: "Document inbox", control: "Upload documents" },
  { name: "Write a logbook entry", path: /\/logbooks\/entries\/new$/, heading: "Write an entry", control: "Work performed" },
] as const;

test("new design: every Add action opens its actual editor", async ({ page, scratch }) => {
  test.setTimeout(120_000);
  // Production defaults to v1. Exercise the opt-in cookie and public URLs, not internal /v2 URLs.
  const status = `${scratch.path}/status`;
  await page.goto(`/api/ui?design=v2&next=${encodeURIComponent(status)}`);
  await expect(page.locator("aside.rail").getByRole("button", { name: /Add/ })).toBeVisible();

  for (const action of actions) {
    await page.goto(status);
    await page.locator("aside.rail").getByRole("button", { name: /Add/ }).click();
    await page.getByRole("menuitem", { name: new RegExp(action.name, "i") }).click();
    await expect(page).toHaveURL(action.path, { timeout: 15_000 });
    if (action.name === "Add logbook pages") await expect(page.getByRole("region", { name: "Add pages" })).toBeVisible();
    else await expect(page.getByRole("heading", { name: action.heading, exact: true }).last()).toBeVisible();
    if (action.control === "File") await expect(page.locator('input[name="file"]')).toBeVisible();
    else if (action.control === "Work performed") await expect(page.getByLabel("Work performed")).toBeVisible();
    else if (action.control === "choose files") await expect(page.getByRole("button", { name: "choose files" })).toBeVisible();
    else await expect(page.getByRole("button", { name: action.control })).toBeVisible();
    // A pasted link and a reload must preserve the intended pane.
    await page.reload();
    if (action.name === "Add logbook pages") await expect(page.getByRole("region", { name: "Add pages" })).toBeVisible();
    else await expect(page.getByRole("heading", { name: action.heading, exact: true }).last()).toBeVisible();
  }

  await page.goto(status);
  // Exercise the menu once so the keyboard check starts after hydration.
  await page.locator("aside.rail").getByRole("button", { name: /Add/ }).click();
  await expect(page.getByRole("menu", { name: `Add to ${scratch.tail}` })).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(page.getByRole("menu", { name: `Add to ${scratch.tail}` })).toBeHidden();
  await page.keyboard.press("n");
  await expect(page.getByRole("menu", { name: `Add to ${scratch.tail}` })).toBeVisible();
  await page.keyboard.press("o");
  await expect(page).toHaveURL(/\/oil\?panel=oil$/);
  await expect(page.getByRole("heading", { name: "Add oil", exact: true }).last()).toBeVisible();
});
