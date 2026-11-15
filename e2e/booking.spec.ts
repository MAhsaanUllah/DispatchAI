import { expect, test, type Page } from "@playwright/test";

const OWNER = { name: "E2E Owner", pin: "482915" };

// One caller turn through the dashboard's chat box; returns the server's answer.
async function say(page: Page, text: string) {
  const answer = page.waitForResponse((r) => r.url().endsWith("/api/chat") && r.request().method() === "POST");
  await page.getByPlaceholder("Ask about a job or customer…").fill(text);
  await page.getByRole("button", { name: "Send message" }).click();
  return (await (await answer).json()) as { reply: string; state: { availableSlots: { slotId: string }[] } };
}

test("first run: setup, login, onboarding, then a caller books and it shows in the table", async ({ page }) => {
  await page.goto("/app");

  // 1. First-run setup with the one-time code.
  await page.getByLabel("Setup code").fill(process.env.E2E_SETUP_TOKEN ?? "E2E-SETUP");
  await page.getByLabel("Your name").fill(OWNER.name);
  await page.getByLabel("PIN", { exact: true }).fill(OWNER.pin);
  await page.getByLabel("Repeat PIN").fill(OWNER.pin);
  await page.getByLabel("Repeat PIN").press("Enter");

  // 2. PIN login (the dashboard is locked until then). Setup hands over to the login page after a short pause.
  await expect(page.getByRole("heading", { name: "Log in" })).toBeVisible();
  await page.getByLabel("PIN", { exact: true }).fill(OWNER.pin);
  await page.getByLabel("PIN", { exact: true }).press("Enter");

  // 3. Onboarding: template, services and hours (defaults), one staff member.
  await page.getByRole("button", { name: "Next" }).click();
  await page.getByRole("button", { name: "Next" }).click();
  await page.getByRole("button", { name: "Add staff member" }).click();
  await page.getByLabel("Staff 1 name").fill("Test Tech");
  await page.getByRole("checkbox").nth(await page.getByRole("checkbox").count() - 2).check();
  await page.getByRole("checkbox").nth(await page.getByRole("checkbox").count() - 1).check();
  await page.getByRole("button", { name: "Finish setup" }).click();
  await expect(page.getByText("No bookings yet")).toBeVisible();

  // 4. A new caller books by chat: phone, new, name, address, zone, request, slot, yes.
  await say(page, "5550001111");
  await say(page, "new");
  await say(page, "My name is Sana Malik");
  await say(page, "12 Elm Street");
  await say(page, "Austin-South");
  // Default hours are Monday to Friday, so ask for a weekday at least two days ahead ("tomorrow" can be a Saturday).
  const day = new Date();
  day.setDate(day.getDate() + 2);
  while ([0, 6].includes(day.getDay())) day.setDate(day.getDate() + 1);
  const date = `${day.getFullYear()}-${String(day.getMonth() + 1).padStart(2, "0")}-${String(day.getDate()).padStart(2, "0")}`;
  const offer = await say(page, `My AC is blowing warm air, can you come on ${date}?`);
  const slot = offer.state.availableSlots[0];
  expect(slot, offer.reply).toBeDefined();
  await say(page, `Please book ${slot.slotId}`);
  const done = await say(page, "yes");
  expect(done.reply).toMatch(/confirmed/i);

  // 5. The booking is in the dashboard table.
  await expect(page.getByRole("row").filter({ hasText: /WO-/ }).first()).toBeVisible();
  await expect(page.getByText("No bookings yet")).toHaveCount(0);
});
