import { randomUUID } from "node:crypto";
import {
  expect,
  type APIRequestContext,
  type APIResponse,
  type Page,
} from "@playwright/test";
import {
  consultationPageSchema,
  consultationSchema,
} from "../features/consultations/contracts.ts";
import {
  nameMaxLength,
  pageSize,
  reasonMaxLength,
  scheduleTimeZone,
} from "../features/consultations/policy.ts";
import { entityTag } from "../features/consultations/revision.ts";
import { test } from "./support/accounts.ts";
import { findUserId, operatorClient, setAdmin } from "./support/operator.ts";
import { localStack } from "./support/stack.ts";

const { appOrigin: origin } = localStack();
const headers = { Origin: origin };
const api = "/api/consultations";
const inDays = (days: number) =>
  new Date(Date.now() + days * 86_400_000).toISOString();

function required<T>(value: T | null | undefined, what: string): T {
  if (value === null || value === undefined) throw new Error("Missing " + what);
  return value;
}
const revisionOf = (response: APIResponse) =>
  required(response.headers().etag, "ETag header");

function draft(changes: Record<string, unknown> = {}) {
  return {
    request_id: randomUUID(),
    first_name: "Sara",
    last_name: "Test",
    reason: randomUUID(),
    scheduled_at: inDays(1),
    ...changes,
  };
}
async function book(
  request: APIRequestContext,
  changes: Record<string, unknown> = {},
) {
  const response = await request.post(api, { headers, data: draft(changes) });
  expect(response.status()).toBe(201);
  const booking = consultationSchema.parse(await response.json());
  expect(revisionOf(response)).toBe(entityTag(booking.version));
  return booking;
}
async function schedule(request: APIRequestContext, page = 1) {
  const response = await request.get(api, { params: { page } });
  expect(response.status()).toBe(200);
  return consultationPageSchema.parse(await response.json());
}
const instantOf = (value: string) => Date.parse(value);

async function signUp(page: Page, email: string) {
  await page.goto("/signup");
  await page.getByLabel("Email").fill(email);
  await page.getByLabel("Password").fill(randomUUID());
  await page.getByRole("button", { name: "Create account" }).click();
  await expect(page.getByText(email)).toBeVisible();
  return email;
}
const cardFor = (page: Page, text: string) =>
  page.getByRole("article").filter({ hasText: text });

// What the campus calendar and clock show for an instant, computed without
// the app's own conversion code so that the two can disagree.
function campus(instant: string) {
  const parts = new Intl.DateTimeFormat("en-AU", {
    timeZone: scheduleTimeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).formatToParts(new Date(instant));
  const part = (type: Intl.DateTimeFormatPartTypes) =>
    required(parts.find((p) => p.type === type)?.value, type);
  return {
    date: `${part("year")}-${part("month")}-${part("day")}`,
    time: `${part("hour")}:${part("minute")}`,
  };
}
async function onlyBooking(request: APIRequestContext) {
  const { items } = await schedule(request);
  expect(items).toHaveLength(1);
  return required(items[0], "booking");
}

test("the full time menu can be clicked when it extends beyond either card", async ({
  accountEmail,
  page,
}) => {
  await page.setViewportSize({ width: 1280, height: 1000 });
  await signUp(page, accountEmail());
  await book(page.request, { reason: "Time menu check" });
  await page.reload();
  const booking = page.getByRole("region", { name: "Book a consultation" });
  const existing = cardFor(page, "Time menu check");
  for (const section of [booking, existing]) {
    if (section === existing)
      await existing.getByText("Reschedule", { exact: true }).click();
    const field = section.getByRole("combobox");
    await field.fill("2:30 pm");
    const list = section.getByRole("listbox");
    await expect(list).toBeVisible();
    const option = await list.evaluate((menu) => {
      const bounds = menu.getBoundingClientRect();
      const lastVisible = document.elementFromPoint(
        bounds.left + bounds.width / 2,
        bounds.bottom - 10,
      );
      return lastVisible?.closest('[role="option"]')?.textContent ?? "";
    });
    expect(option).not.toBe("");
    await list.getByRole("option", { name: option, exact: true }).click();
    await expect(field).toHaveValue(option);
    await expect(list).toHaveCount(0);
  }
});

test("student can book, refresh, complete, reopen, reschedule and cancel in the browser", async ({
  accountEmail,
  page,
}) => {
  await page.setViewportSize({ width: 320, height: 800 });
  await signUp(page, accountEmail());
  await expect(
    page.getByRole("heading", { name: "No upcoming consultations" }),
  ).toBeVisible();
  await page.getByRole("link", { name: "Book a consultation" }).focus();
  await page.keyboard.press("Enter");
  await expect(
    page.getByRole("heading", { name: "Book a consultation" }),
  ).toBeFocused();
  expect(
    await page.evaluate(() => document.documentElement.scrollWidth),
  ).toBeLessThanOrEqual(320);
  const fullName = "𠮷".repeat(nameMaxLength);
  await page.getByLabel("First name").fill(fullName);
  await page.getByLabel("Last name").fill("Test");
  await page.getByLabel("Reason for consultation").fill("Exam revision");
  const form = page.getByRole("region", { name: "Book a consultation" });
  const trigger = form.getByRole("button", { name: /choose date/i });
  await trigger.click();
  const dialog = page.getByRole("dialog");
  await expect(dialog).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(trigger).toBeFocused();
  await trigger.click();
  await dialog.getByRole("button", { name: "Tomorrow", exact: true }).click();
  const startTime = form.getByRole("combobox", { name: "Start time" });
  await startTime.fill("9am");
  await startTime.press("Enter");
  await expect(startTime).toHaveValue("9:00 am");
  await page.getByRole("button", { name: "Book consultation" }).click();
  const card = cardFor(page, "Exam revision");
  await expect(card).toBeVisible();
  await expect(card.getByRole("heading")).toContainText(fullName);
  await expect(card.locator("time")).toContainText("9:00 am");
  await page.reload();
  await card
    .getByRole("button", { name: "Mark complete", exact: true })
    .click();
  await expect(card.getByText("Complete", { exact: true })).toBeVisible();
  await card.getByRole("button", { name: "Mark incomplete" }).click();
  await expect(card.getByText("Incomplete", { exact: true })).toBeVisible();
  await card.getByText("Reschedule", { exact: true }).click();
  const newTime = card.getByRole("combobox", { name: "Start time" });
  await expect(newTime).toHaveValue("9:00 am");
  const originalInstant = required(
    await card.locator("time").getAttribute("datetime"),
    "the saved time",
  );
  const dateButton = card.getByRole("button", { name: /^Date / });
  await dateButton.click();
  await dialog.getByRole("button", { name: "In a week" }).click();
  await dateButton.click();
  await dialog
    .getByRole("gridcell", { selected: true })
    .getByRole("button")
    .focus();
  await page.keyboard.press("ArrowRight");
  await page.keyboard.press("Enter");
  await newTime.fill("14:60");
  await newTime.press("Tab");
  await card.getByRole("button", { name: "Save new time" }).click();
  await expect(card.getByRole("alert")).toContainText("Enter a time");
  await expect(card.locator("time")).toHaveAttribute(
    "datetime",
    originalInstant,
  );
  await newTime.fill("14:37");
  await newTime.press("Tab");
  await expect(newTime).toHaveValue("2:37 pm");
  // The stored instant must be exactly the campus date and minute chosen.
  const chosenDate = await card.locator('input[name="date"]').inputValue();
  expect(chosenDate).toMatch(/^\d{4}-\d\d-\d\d$/);
  await card.getByRole("button", { name: "Save new time" }).click();
  await expect(card.getByRole("status")).toContainText(
    "Consultation rescheduled",
  );
  await expect(card.locator("time")).toContainText("2:37 pm");
  await page.reload();
  await expect(card.locator("time")).toContainText("2:37 pm");
  expect(campus((await onlyBooking(page.request)).scheduled_at)).toEqual({
    date: chosenDate,
    time: "14:37",
  });
  await card.getByRole("button", { name: "Cancel consultation" }).click();
  await card.getByRole("button", { name: "Keep booking" }).click();
  await expect(card).toBeVisible();
  await card.getByRole("button", { name: "Cancel consultation" }).click();
  await card.getByRole("button", { name: "Confirm cancellation" }).click();
  await expect(card).toHaveCount(0);
  await page.reload();
  await expect(
    page.getByRole("heading", { name: "No upcoming consultations" }),
  ).toBeVisible();
});

for (const timezoneId of [
  "Australia/Perth",
  "Europe/London",
  "Pacific/Kiritimati",
]) {
  test(`a browser in ${timezoneId} enters and reads campus time`, async ({
    accountEmail,
    browser,
  }) => {
    const context = await browser.newContext({ baseURL: origin, timezoneId });
    try {
      const page = await context.newPage();
      await signUp(page, accountEmail());
      await page.getByLabel("First name").fill("Zone");
      await page.getByLabel("Last name").fill("Traveller");
      await page.getByLabel("Reason for consultation").fill("Time zones");
      const form = page.getByRole("region", { name: "Book a consultation" });
      await expect(
        form.getByText("Times are in Melbourne time."),
      ).toBeVisible();
      const pickDate = form.getByRole("button", { name: /^Date / });
      await pickDate.click();
      await page
        .getByRole("dialog")
        .getByRole("button", { name: "In a week" })
        .click();
      const chosenDate = await form.locator('input[name="date"]').inputValue();
      const clock = form.getByRole("combobox", { name: "Start time" });
      await clock.fill("12:15 am");
      await clock.press("Tab");
      await page.getByRole("button", { name: "Book consultation" }).click();
      const card = cardFor(page, "Time zones");
      await expect(card.locator("time")).toContainText("12:15 am");
      // Fifteen minutes past midnight falls on a different calendar day in
      // most other zones, so a browser-local conversion cannot pass this.
      expect(campus((await onlyBooking(context.request)).scheduled_at)).toEqual(
        { date: chosenDate, time: "00:15" },
      );
      // Reopening the booking offers the same campus date and time back.
      await card.getByText("Reschedule", { exact: true }).click();
      await expect(card.getByRole("combobox")).toHaveValue("12:15 am");
      await expect(card.locator('input[name="date"]')).toHaveValue(chosenDate);
    } finally {
      await context.close();
    }
  });
}

test("a time that has passed is refused by the database even when the browser's clock says otherwise", async ({
  accountEmail,
  page,
}) => {
  // The browser believes it is two days ago. Its own check therefore accepts
  // "tomorrow at 11:59 pm", which really ended before today began.
  await page.clock.install({ time: Date.now() - 2 * 86_400_000 });
  await signUp(page, accountEmail());
  await page.getByLabel("First name").fill("Late");
  await page.getByLabel("Last name").fill("Student");
  await page.getByLabel("Reason for consultation").fill("Clock skew");
  await page.getByRole("button", { name: /choose date/i }).click();
  await page
    .getByRole("dialog")
    .getByRole("button", { name: "Tomorrow", exact: true })
    .click();
  const clock = page.getByRole("combobox", { name: "Start time" });
  await clock.fill("11:59 pm");
  await clock.press("Tab");
  const [response] = await Promise.all([
    page.waitForResponse(
      (r) => r.url().endsWith(api) && r.request().method() === "POST",
    ),
    page.getByRole("button", { name: "Book consultation" }).click(),
  ]);
  expect(response.status()).toBe(400);
  await expect(page.getByRole("main").getByRole("alert")).toContainText(
    "choose a future time",
  );
  // The student's input is still there to correct, and nothing was booked.
  await expect(page.getByLabel("Reason for consultation")).toHaveValue(
    "Clock skew",
  );
  expect((await schedule(page.request)).items).toEqual([]);
});

test("booking API enforces session, ownership, admin read access and retry semantics", async ({
  accountEmail,
  page,
  browser,
}) => {
  const other = await browser.newContext({ baseURL: origin });
  const admin = await browser.newContext({ baseURL: origin });
  try {
    expect((await page.request.get(api)).status()).toBe(401);
    await signUp(page, accountEmail());
    const otherPage = await other.newPage();
    await signUp(otherPage, accountEmail());
    const adminPage = await admin.newPage();
    const adminEmail = await signUp(adminPage, accountEmail());
    await setAdmin(adminEmail, true);

    const booking = draft();
    const post = (data: object) => page.request.post(api, { headers, data });
    expect(
      (await post({ ...booking, student_id: randomUUID() })).status(),
    ).toBe(400);
    expect(
      (
        await post({ ...booking, scheduled_at: "2020-01-01T00:00:00Z" })
      ).status(),
    ).toBe(400);
    const [first, second] = await Promise.all([post(booking), post(booking)]);
    expect([first.status(), second.status()].sort()).toEqual([200, 201]);
    const { id, version } = consultationSchema.parse(await first.json());
    expect(consultationSchema.parse(await second.json()).id).toBe(id);
    const item = `${api}/${id}`;
    const newTime = inDays(2);
    const conditional = { ...headers, "If-Match": entityTag(version) };
    const patch = (data: object) =>
      page.request.patch(item, { headers: conditional, data });
    expect((await patch({ scheduled_at: newTime })).status()).toBe(204);
    expect((await post(booking)).status()).toBe(200);
    expect((await post({ ...booking, reason: "Different" })).status()).toBe(
      409,
    );

    expect((await schedule(other.request)).items).toEqual([]);
    expect(
      (
        await other.request.patch(item, {
          headers: conditional,
          data: { completed: true },
        })
      ).status(),
    ).toBe(404);
    expect(
      (await other.request.delete(item, { headers: conditional })).status(),
    ).toBe(404);
    await otherPage.goto("/admin");
    await expect(
      otherPage.getByRole("heading", { name: "Admin view" }),
    ).toHaveCount(0);

    const adminView = await adminPage.goto("/admin");
    const responseHeaders = adminView?.headers() ?? {};
    expect(responseHeaders["cache-control"]).toContain("no-store");
    expect(Object.keys(responseHeaders)).not.toContain("authorization");
    expect(Object.keys(responseHeaders)).not.toContain(
      "x-middleware-request-authorization",
    );
    const adminBooking = adminPage.getByText(booking.reason, { exact: true });
    const nextPage = adminPage.getByRole("link", { name: "Next page" });
    while (!(await adminBooking.count()) && (await nextPage.count())) {
      const target = required(await nextPage.getAttribute("href"), "next page");
      await nextPage.click();
      await expect(adminPage).toHaveURL(origin + target);
    }
    await expect(adminBooking).toBeVisible();
    await expect(
      adminPage.getByRole("button", { name: "Mark complete" }),
    ).toHaveCount(0);
    expect(
      (
        await admin.request.patch(item, {
          headers: conditional,
          data: { completed: true },
        })
      ).status(),
    ).toBe(404);
    await setAdmin(adminEmail, false);
    await adminPage.reload();
    await expect(
      adminPage.getByRole("heading", { name: "Admin view" }),
    ).toHaveCount(0);
    await adminPage.goto("/dashboard");
    await expect(adminPage.getByText(adminEmail)).toBeVisible();
    await expect(
      adminPage.getByRole("link", { name: "Admin view" }),
    ).toHaveCount(0);
    const list = await schedule(page.request);
    expect(list.items).toHaveLength(1);
    const saved = required(list.items[0], "booking");
    expect(saved.completed).toBe(false);
    expect(instantOf(saved.scheduled_at)).toBe(instantOf(newTime));
    expect(
      (
        await page.request.delete(item, {
          headers: { ...headers, "If-Match": entityTag(saved.version) },
        })
      ).status(),
    ).toBe(204);
    expect((await post(booking)).status()).toBe(409);
    expect((await schedule(page.request)).items).toHaveLength(0);
    await page.getByRole("button", { name: "Log out" }).click();
    expect((await page.request.get(api)).status()).toBe(401);
  } finally {
    await Promise.all([other.close(), admin.close()]);
  }
});

test("an identical retry after cancellation and expiry returns a spent-key conflict", async ({
  page,
  accountEmail,
}) => {
  await signUp(page, accountEmail());
  const scheduled = Date.now() + 4000;
  const data = draft({ scheduled_at: new Date(scheduled).toISOString() });
  const post = () => page.request.post(api, { headers, data });
  const created = await post();
  expect(created.status()).toBe(201);
  const saved = consultationSchema.parse(await created.json());
  const cancelled = await page.request.delete(api + "/" + saved.id, {
    headers: { ...headers, "If-Match": entityTag(saved.version) },
  });
  expect(cancelled.status()).toBe(204);
  await expect
    .poll(() => Date.now(), { timeout: 10000 })
    .toBeGreaterThan(scheduled);
  const replay = await post();
  expect(replay.status()).toBe(409);
  expect(await replay.json()).toEqual({
    error: "This booking reference has already been used.",
  });
  expect((await schedule(page.request)).items).toHaveLength(0);
});

test("paged student list includes every booking exactly once when times are tied", async ({
  accountEmail,
  page,
}) => {
  await signUp(page, accountEmail());
  const scheduled_at = inDays(1);
  const ids: string[] = [];
  for (let index = 0; index <= pageSize; index++)
    ids.push((await book(page.request, { scheduled_at })).id);
  const first = await schedule(page.request);
  const second = await schedule(page.request, 2);
  expect(first.hasNext).toBe(true);
  expect(first.items).toHaveLength(pageSize);
  expect(second.hasNext).toBe(false);
  expect(second.items).toHaveLength(1);
  // Random identifiers break the tie, so the order is the sorted identifiers.
  expect([...first.items, ...second.items].map((item) => item.id)).toEqual(
    ids.toSorted(),
  );
  expect((await schedule(page.request, 3)).items).toEqual([]);
  await page.reload();
  await page.getByRole("link", { name: "Next page" }).click();
  await expect(page.getByRole("article")).toHaveCount(1);
});

test("names in any script and the published length limits survive the round trip", async ({
  accountEmail,
  page,
}) => {
  await signUp(page, accountEmail());
  const names = {
    first_name: "  سارا  ",
    last_name: "O’Connor-Nguyễn 🎓",
    reason: "x".repeat(reasonMaxLength),
  };
  const saved = await book(page.request, names);
  expect(saved.first_name).toBe("سارا");
  expect(saved.last_name).toBe(names.last_name);
  expect(saved.reason).toHaveLength(reasonMaxLength);
  // The API's limits and the database's constraints must agree at the edge:
  // accepted at the limit, declined by the API one character beyond it.
  await book(page.request, { first_name: "é".repeat(nameMaxLength) });
  for (const tooLong of [
    { first_name: "é".repeat(nameMaxLength + 1) },
    { reason: "x".repeat(reasonMaxLength + 1) },
  ])
    expect(
      (
        await page.request.post(api, { headers, data: draft(tooLong) })
      ).status(),
    ).toBe(400);
  await page.reload();
  await expect(
    page.getByRole("heading", { name: "سارا O’Connor-Nguyễn 🎓" }),
  ).toBeVisible();
});

test("invalid API requests leave the student schedule unchanged", async ({
  accountEmail,
  page,
}) => {
  await signUp(page, accountEmail());
  const payload = draft();
  const post = (options: {
    headers: Record<string, string>;
    data: string | object;
  }) => page.request.post(api, options);
  const json = { ...headers, "Content-Type": "application/json" };
  expect(
    (
      await post({
        headers: { Origin: "https://other.example" },
        data: payload,
      })
    ).status(),
  ).toBe(403);
  expect(
    (
      await post({
        headers: { ...headers, "Content-Type": "text/plain" },
        data: "text",
      })
    ).status(),
  ).toBe(415);
  expect((await post({ headers: json, data: "{" })).status()).toBe(400);
  expect((await post({ headers: json, data: "[]" })).status()).toBe(400);
  const oversized = await post({
    headers,
    data: { ...payload, reason: "x".repeat(33_000) },
  });
  expect(oversized.status()).toBe(413);
  // Every refusal has the same JSON shape, including those raised before validation.
  expect(await oversized.json()).toEqual({ error: "Request is too large." });
  expect(
    (
      await page.request.patch(api + "/missing", {
        headers,
        data: { completed: true },
      })
    ).status(),
  ).toBe(404);
  expect(
    (
      await page.request.patch(api + "/" + randomUUID(), {
        headers: { ...headers, "If-Match": entityTag(randomUUID()) },
        data: { completed: true },
      })
    ).status(),
  ).toBe(404);
  expect((await schedule(page.request)).items).toEqual([]);
});

test("a double click books once, and a retry after a lost response books once", async ({
  accountEmail,
  page,
}) => {
  await signUp(page, accountEmail());
  await page.setViewportSize({ width: 390, height: 844 });
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
  let posts = 0;
  page.on("request", (request) => {
    if (request.method() === "POST" && request.url().endsWith(api)) posts++;
  });
  const fill = async (reason: string) => {
    await page.getByLabel("First name").fill("Student");
    await page.getByLabel("Last name").fill("Test");
    await page.getByLabel("Reason for consultation").fill(reason);
    await page.getByRole("button", { name: /choose date/i }).click();
    await page
      .getByRole("dialog")
      .getByRole("button", { name: "In a week" })
      .click();
    const clock = page.getByRole("combobox", { name: "Start time" });
    await clock.click();
    await page.getByRole("option", { name: "12:30 pm", exact: true }).click();
    await expect(clock).toHaveValue("12:30 pm");
  };

  await fill("Double click");
  await page.getByRole("button", { name: "Book consultation" }).dblclick();
  await expect(page.getByRole("status")).toContainText("Consultation booked");
  await expect(cardFor(page, "Double click")).toHaveCount(1);
  expect(posts).toBe(1);

  const reason = "Preparation for algebra";
  await fill(reason);
  await page.route(
    "**" + api,
    async (route) => {
      const result = await route.fetch();
      expect(result.status()).toBe(201);
      await route.abort("connectionreset");
    },
    { times: 1 },
  );
  await page.getByRole("button", { name: "Book consultation" }).click();
  await expect(page.getByRole("main").getByRole("alert")).toContainText(
    "Connection interrupted",
  );
  await expect(page.getByLabel("Reason for consultation")).toHaveValue(reason);
  await page.getByLabel("First name").fill(" Student ");
  await page.getByLabel("Reason for consultation").fill(reason + " ");
  const replay = page.waitForResponse(
    (r) => r.request().method() === "POST" && r.url().endsWith(api),
  );
  await page.getByRole("button", { name: "Book consultation" }).click();
  expect((await replay).status()).toBe(200);
  await expect(cardFor(page, reason)).toHaveCount(1);
  await page.reload();
  await expect(page.getByRole("article")).toHaveCount(2);
  expect((await schedule(page.request)).items).toHaveLength(2);
});

test("a reschedule whose response is lost is saved once, and the retry explains what happened", async ({
  accountEmail,
  page,
}) => {
  await signUp(page, accountEmail());
  const booking = await book(page.request, { reason: "Lost reply" });
  await page.reload();
  const card = cardFor(page, "Lost reply");
  await card.getByText("Reschedule", { exact: true }).click();
  const clock = card.getByRole("combobox");
  await clock.fill("3:21 pm");
  await clock.press("Tab");
  await page.route(
    `**${api}/${booking.id}`,
    async (route) => {
      const result = await route.fetch();
      expect(result.status()).toBe(204);
      await route.abort("connectionreset");
    },
    { times: 1 },
  );
  await card.getByRole("button", { name: "Save new time" }).click();
  await expect(card.getByRole("alert")).toContainText("Connection interrupted");
  await expect(clock).toHaveValue("3:21 pm");
  // The first attempt committed. The retry still carries the earlier
  // revision, so it is declined, and reloading shows the time that was saved.
  await card.getByRole("button", { name: "Save new time" }).click();
  await expect(card.getByRole("alert")).toContainText(
    "changed since you opened it",
  );
  await card.getByRole("button", { name: "Reload latest bookings" }).click();
  await expect(card.locator("time")).toContainText("3:21 pm");
  const { items } = await schedule(page.request);
  expect(items).toHaveLength(1);
  expect(required(items[0], "booking").version).not.toBe(booking.version);
});

test("two open tabs race to reschedule one booking; only the winning time persists", async ({
  page,
  context,
  accountEmail,
}) => {
  await signUp(page, accountEmail());
  const booking = await book(page.request, { scheduled_at: inDays(7) });
  const tabs = [
    { tab: page, time: "9:17 am" },
    { tab: await context.newPage(), time: "2:43 pm" },
  ];
  // The barrier: neither request reaches the server until both have left
  // their tabs carrying the same revision.
  const bothSent = Promise.withResolvers<undefined>();
  let arrived = 0;
  await Promise.all(
    tabs.map(async ({ tab, time }) => {
      await tab.goto("/dashboard");
      await tab.getByText("Reschedule", { exact: true }).click();
      const clock = tab.getByRole("article").getByRole("combobox");
      await clock.fill(time);
      await clock.press("Tab");
      await tab.route(
        `**${api}/${booking.id}`,
        async (route) => {
          if (++arrived === tabs.length) bothSent.resolve(undefined);
          await bothSent.promise;
          await route.continue();
        },
        { times: 1 },
      );
    }),
  );
  const responses = await Promise.all(
    tabs.map(async ({ tab }) => {
      const result = tab.waitForResponse(
        (r) => r.request().method() === "PATCH",
      );
      await tab.getByRole("button", { name: "Save new time" }).click();
      return { tab, response: await result };
    }),
  );
  expect(responses.map((r) => r.response.status()).sort()).toEqual([204, 412]);
  for (const { response } of responses)
    expect(await response.request().headerValue("if-match")).toBe(
      entityTag(booking.version),
    );
  const winner = required(
    responses.find((r) => r.response.status() === 204),
    "winning tab",
  );
  const loser = required(
    responses.find((r) => r.response.status() === 412),
    "stale tab",
  );
  await expect(loser.tab.getByRole("article").getByRole("alert")).toContainText(
    "changed since you opened it",
  );
  // What is stored is the winner's request and the revision its response named.
  const sent = consultationSchema
    .pick({ scheduled_at: true })
    .parse(winner.response.request().postDataJSON());
  const latest = required((await schedule(page.request)).items[0], "booking");
  expect(instantOf(latest.scheduled_at)).toBe(instantOf(sent.scheduled_at));
  expect(await winner.response.headerValue("etag")).toBe(
    entityTag(latest.version),
  );
  expect(latest.version).not.toBe(booking.version);
  await loser.tab
    .getByRole("button", { name: "Reload latest bookings" })
    .click();
  await expect(loser.tab.getByRole("article").locator("time")).toHaveAttribute(
    "datetime",
    latest.scheduled_at,
  );
  await loser.tab
    .getByRole("button", { name: "Mark complete", exact: true })
    .click();
  await expect(
    loser.tab.getByRole("article").getByText("Complete", { exact: true }),
  ).toBeVisible();
});

test("revision contracts handle stale retries, cancellation, missing preconditions and independent bookings", async ({
  page,
  accountEmail,
}) => {
  await signUp(page, accountEmail());
  const create = async () => {
    const row = await book(page.request, { scheduled_at: inDays(4) });
    return { url: api + "/" + row.id, tag: entityTag(row.version) };
  };
  const [a, b] = await Promise.all([create(), create()]);
  const patch = (url: string, tag: string | undefined, data: object) =>
    page.request.patch(url, {
      headers: tag ? { ...headers, "If-Match": tag } : headers,
      data,
    });
  const del = (url: string, tag: string) =>
    page.request.delete(url, { headers: { ...headers, "If-Match": tag } });
  const preconditions: [string | undefined, number][] = [
    [undefined, 428],
    ["*", 400],
    ["W/" + a.tag, 400],
    [a.tag + "," + b.tag, 400],
    ["unquoted", 400],
    [a.tag.toUpperCase(), 400],
  ];
  for (const [tag, status] of preconditions)
    expect((await patch(a.url, tag, { completed: true })).status()).toBe(
      status,
    );
  expect((await page.request.delete(a.url, { headers })).status()).toBe(428);
  const noop = await patch(a.url, a.tag, { completed: false });
  expect(noop.status()).toBe(204);
  expect(revisionOf(noop)).toBe(a.tag);
  const [editA, editB] = await Promise.all([
    patch(a.url, a.tag, { completed: true }),
    patch(b.url, b.tag, { completed: true }),
  ]);
  expect([editA.status(), editB.status()]).toEqual([204, 204]);
  // Returning to the original visible state must never make an old tag valid again.
  const reopened = await patch(b.url, revisionOf(editB), { completed: false });
  expect(reopened.status()).toBe(204);
  expect(revisionOf(reopened)).not.toBe(b.tag);
  expect((await patch(b.url, b.tag, { completed: true })).status()).toBe(412);
  const tag = revisionOf(editA);
  expect(tag).not.toBe(a.tag);
  // Every revision is a fresh random identifier in the published format.
  const issued = [a.tag, b.tag, tag, revisionOf(editB), revisionOf(reopened)];
  expect(new Set(issued).size).toBe(issued.length);
  for (const value of issued)
    expect(value).toMatch(
      /^"[\da-f]{8}-[\da-f]{4}-4[\da-f]{3}-[89ab][\da-f]{3}-[\da-f]{12}"$/,
    );
  expect((await patch(a.url, a.tag, { completed: true })).status()).toBe(412);
  expect((await del(a.url, a.tag)).status()).toBe(412);
  // A reschedule and a cancellation released together: one of them commits.
  const [move, cancel] = await Promise.all([
    patch(a.url, tag, { scheduled_at: inDays(8) }),
    del(a.url, tag),
  ]);
  if (move.status() === 204) {
    expect(cancel.status()).toBe(412);
    expect((await del(a.url, revisionOf(move))).status()).toBe(204);
  } else {
    expect(cancel.status()).toBe(204);
    expect(cancel.headers().etag).toBeUndefined();
    expect(move.status()).toBe(404);
  }
  expect((await del(a.url, tag)).status()).toBe(404);
  const remaining = (await schedule(page.request)).items;
  expect(remaining.map((row) => api + "/" + row.id)).toEqual([b.url]);
});

test("completing and rescheduling one booking together commits exactly one of them", async ({
  page,
  accountEmail,
}) => {
  await signUp(page, accountEmail());
  // Repeat with fresh bookings so both orders of arrival get exercised.
  for (let round = 0; round < 5; round++) {
    const original = await book(page.request, { scheduled_at: inDays(3) });
    const url = `${api}/${original.id}`;
    const conditional = { ...headers, "If-Match": entityTag(original.version) };
    const later = inDays(5);
    const [complete, move] = await Promise.all([
      page.request.patch(url, {
        headers: conditional,
        data: { completed: true },
      }),
      page.request.patch(url, {
        headers: conditional,
        data: { scheduled_at: later },
      }),
    ]);
    expect([complete.status(), move.status()].sort()).toEqual([204, 412]);
    const { items } = await schedule(page.request);
    const saved = required(
      items.find((row) => row.id === original.id),
      "booking",
    );
    // The stored row is the winner's change alone, never a blend of the two.
    if (complete.status() === 204) {
      expect(saved.completed).toBe(true);
      expect(instantOf(saved.scheduled_at)).toBe(
        instantOf(original.scheduled_at),
      );
      expect(entityTag(saved.version)).toBe(revisionOf(complete));
    } else {
      expect(saved.completed).toBe(false);
      expect(instantOf(saved.scheduled_at)).toBe(instantOf(later));
      expect(entityTag(saved.version)).toBe(revisionOf(move));
    }
  }
});

test("a student's own actions on one card do not conflict with each other", async ({
  page,
  accountEmail,
}) => {
  await signUp(page, accountEmail());
  await book(page.request, { reason: "Own edits", scheduled_at: inDays(6) });
  await page.reload();
  const card = cardFor(page, "Own edits");
  // Start rescheduling, complete the booking from the same card, then save.
  await card.getByText("Reschedule", { exact: true }).click();
  const clock = card.getByRole("combobox");
  await clock.fill("4:05 pm");
  await clock.press("Tab");
  await card
    .getByRole("button", { name: "Mark complete", exact: true })
    .click();
  await expect(card.getByText("Complete", { exact: true })).toBeVisible();
  await expect(clock).toHaveValue("4:05 pm");
  await card.getByRole("button", { name: "Save new time" }).click();
  await expect(card.getByRole("status")).toContainText(
    "Consultation rescheduled",
  );
  await expect(card.locator("time")).toContainText("4:05 pm");
  await expect(card.getByText("Complete", { exact: true })).toBeVisible();
  // Ask to cancel, reopen the booking instead, then confirm the cancellation.
  await card.getByRole("button", { name: "Cancel consultation" }).click();
  await card.getByRole("button", { name: "Mark incomplete" }).click();
  await expect(card.getByText("Incomplete", { exact: true })).toBeVisible();
  await card.getByRole("button", { name: "Confirm cancellation" }).click();
  await expect(card).toHaveCount(0);
  expect((await schedule(page.request)).items).toEqual([]);
});

for (const action of ["reschedule", "cancel"] as const) {
  test(`an open ${action} keeps its original revision across a dashboard refresh`, async ({
    page,
    accountEmail,
  }) => {
    await signUp(page, accountEmail());
    const editing = await book(page.request, {
      first_name: "Editing",
      last_name: "Student",
      scheduled_at: inDays(7),
    });
    await book(page.request, {
      first_name: "Other",
      last_name: "Student",
      scheduled_at: inDays(7),
    });
    await page.reload();
    const card = page
      .getByRole("article")
      .filter({ has: page.getByRole("heading", { name: "Editing Student" }) });
    const otherCard = page
      .getByRole("article")
      .filter({ has: page.getByRole("heading", { name: "Other Student" }) });
    await page.getByLabel("First name").fill("Unfinished draft");
    if (action === "reschedule") {
      await card.getByText("Reschedule", { exact: true }).click();
      const clock = card.getByRole("combobox");
      await clock.fill("1:22 pm");
      await clock.press("Tab");
    } else
      await card.getByRole("button", { name: "Cancel consultation" }).click();
    const later = inDays(9);
    const changed = await page.request.patch(api + "/" + editing.id, {
      headers: { ...headers, "If-Match": entityTag(editing.version) },
      data: { scheduled_at: later },
    });
    expect(changed.status()).toBe(204);
    // A save elsewhere refreshes server-rendered rows while this editor remains open.
    await otherCard
      .getByRole("button", { name: "Mark complete", exact: true })
      .click();
    await expect
      .poll(async () =>
        instantOf((await card.locator("time").getAttribute("datetime")) ?? ""),
      )
      .toBe(instantOf(later));
    // A second, unrelated edit is in progress on the other card.
    await otherCard.getByText("Reschedule", { exact: true }).click();
    const otherClock = otherCard.getByRole("combobox");
    await otherClock.fill("4:44 pm");
    await otherClock.press("Tab");
    const response = page.waitForResponse(
      (r) =>
        r.url().endsWith("/" + editing.id) &&
        ["PATCH", "DELETE"].includes(r.request().method()),
    );
    await card
      .getByRole("button", {
        name:
          action === "reschedule" ? "Save new time" : "Confirm cancellation",
      })
      .click();
    expect((await response).status()).toBe(412);
    await card.getByRole("button", { name: "Reload latest bookings" }).click();
    await expect(
      card.getByRole("button", { name: "Cancel consultation" }),
    ).toBeVisible();
    // Resolving the conflict leaves every other unsaved input alone.
    await expect(page.getByLabel("First name")).toHaveValue("Unfinished draft");
    await expect(otherClock).toHaveValue("4:44 pm");
    const { items } = await schedule(page.request);
    const saved = required(
      items.find((row) => row.id === editing.id),
      "booking",
    );
    expect(instantOf(saved.scheduled_at)).toBe(instantOf(later));
    expect(entityTag(saved.version)).toBe(revisionOf(changed));
  });
}

test("upcoming stays on page one after a full page of history; past bookings can be rescheduled", async ({
  page,
  accountEmail,
}) => {
  const email = await signUp(page, accountEmail());
  await expect(
    page.getByRole("link", { name: "Upcoming", exact: true }),
  ).toHaveAttribute("aria-current", "page");
  await page.getByRole("link", { name: "History", exact: true }).click();
  await expect(
    page.getByRole("heading", { name: "No past consultations" }),
  ).toBeVisible();
  const student_id = required(await findUserId(email), "fixture student");
  // Insert through the ordinary scheduling constraint and let the rows age into history.
  const firstInstant = Date.now() + 4000;
  const archived = Array.from({ length: pageSize + 1 }, (_, index) => ({
    student_id,
    first_name: "History",
    last_name: "Student",
    reason: `Past topic ${index}`,
    scheduled_at: new Date(firstInstant + index).toISOString(),
  }));
  const { error } = await operatorClient()
    .from("consultations")
    .insert(archived);
  if (error)
    throw new Error("Could not prepare historical consultations", {
      cause: error,
    });
  await book(page.request, {
    reason: "Later appointment",
    scheduled_at: inDays(4),
  });
  await book(page.request, {
    reason: "Next appointment",
    scheduled_at: inDays(2),
  });
  await expect
    .poll(() => Date.now(), { timeout: 10_000 })
    .toBeGreaterThan(firstInstant + pageSize);
  await page.goto("/dashboard");
  const cards = page.getByRole("article");
  await expect(cards).toHaveCount(2);
  await expect(cards.first()).toContainText("Next appointment");
  await expect(cards.last()).toContainText("Later appointment");
  await page.getByRole("link", { name: "History", exact: true }).click();
  await expect(cards).toHaveCount(pageSize);
  await expect(cards.first()).toContainText(`Past topic ${pageSize}`);
  await page.getByRole("link", { name: "Next page" }).click();
  await expect(page).toHaveURL(/view=history&page=2/);
  await expect(cards).toHaveCount(1);
  await expect(cards.first()).toContainText("Past topic 0");
  await cards.first().getByText("Reschedule", { exact: true }).click();
  await cards
    .first()
    .getByRole("button", { name: /^Date / })
    .click();
  await page
    .getByRole("dialog")
    .getByRole("button", { name: "Tomorrow", exact: true })
    .click();
  await cards.first().getByRole("button", { name: "Save new time" }).click();
  await expect(cards).toHaveCount(0);
  await page.getByRole("link", { name: "Upcoming", exact: true }).click();
  await expect(cards).toHaveCount(3);
  await expect(cards.first()).toContainText("Past topic 0");
  await expect(page).toHaveURL(/\/dashboard$/);
});

test("concurrent creates share the last quota slot and replays still succeed", async ({
  page,
  accountEmail,
}) => {
  await signUp(page, accountEmail());
  const post = (data: ReturnType<typeof draft>) =>
    page.request.post(api, { headers, data });
  const original = draft();
  expect((await post(original)).status()).toBe(201);
  for (let i = 1; i < 59; i++) expect((await post(draft())).status()).toBe(201);
  const attempts = await Promise.all([post(draft()), post(draft())]);
  expect(attempts.map((response) => response.status()).sort()).toEqual([
    201, 429,
  ]);
  expect((await post(original)).status()).toBe(200);
});
