import { randomUUID } from "node:crypto";
import { expect } from "@playwright/test";
import { consultationPageSchema } from "../features/consultations/contracts.ts";
import { test } from "./support/accounts.ts";
import { localStack } from "./support/stack.ts";

const { appOrigin: origin } = localStack();

test("student session survives reload, is isolated, and ends on logout", async ({
  accountEmail,
  page,
  browser,
}) => {
  const email = accountEmail();
  const password = randomUUID();
  await page.goto("/dashboard");
  await expect(page).toHaveURL(/\/login$/);
  await page.getByRole("link", { name: "Create a student account" }).click();
  await expect(page).toHaveURL(/\/signup$/);
  await page.getByLabel("Email").fill(email);
  await page.getByLabel("Password").fill(password);
  const [signup] = await Promise.all([
    page.waitForResponse((response) =>
      response.url().endsWith("/api/auth/signup"),
    ),
    page.getByRole("button", { name: "Create account" }).click(),
  ]);
  expect(signup.headers()["cache-control"]).toContain("private");
  expect(signup.headers()["cache-control"]).toContain("no-store");
  await expect(page.getByText(email)).toBeVisible();
  const refreshed = await page.reload();
  if (refreshed && (await refreshed.headerValue("set-cookie"))) {
    expect(await refreshed.headerValue("cache-control")).toContain("no-store");
    expect(await refreshed.headerValue("pragma")).toBe("no-cache");
    expect(await refreshed.headerValue("expires")).toBe("0");
  }
  await expect(page.getByText(email)).toBeVisible();

  const isolated = await browser.newContext();
  try {
    const visitor = await isolated.newPage();
    await visitor.goto(origin + "/dashboard");
    await expect(visitor).toHaveURL(/\/login$/);
  } finally {
    await isolated.close();
  }

  const denied = await page.request.post("/api/auth/logout", {
    headers: { Origin: "https://other.example" },
  });
  expect(denied.status()).toBe(403);
  await page.reload();
  await expect(page.getByText(email)).toBeVisible();
  await page.getByRole("button", { name: "Log out" }).click();
  await page.goto("/dashboard");
  await expect(page).toHaveURL(/\/login$/);
  await page.getByLabel("Email").fill(email);
  await page.getByLabel("Password").fill("incorrect-password");
  await page.getByRole("button", { name: "Log in" }).click();
  await expect(page.getByRole("main").getByRole("alert")).toContainText(
    "Login failed",
  );
  await page.getByLabel("Email").fill(email);
  await page.getByLabel("Password").fill(password);
  await page.getByRole("button", { name: "Log in" }).click();
  await expect(page.getByText(email)).toBeVisible();
});

test("a booking API request renews an expired token before dashboard navigation", async ({
  accountEmail,
  page,
}) => {
  test.skip(
    process.env.TEST_SHORT_JWT !== "1",
    "Requires a local Supabase instance with jwt_expiry = 90",
  );
  test.setTimeout(150_000);
  const email = accountEmail();
  await page.goto("/signup");
  await page.getByLabel("Email").fill(email);
  await page.getByLabel("Password").fill(randomUUID());
  await page.getByRole("button", { name: "Create account" }).click();
  await expect(page.getByText(email)).toBeVisible();
  // Close the page so no navigation or background browser task renews the token before expiry.
  const context = page.context();
  await page.close();
  await new Promise((resolve) => setTimeout(resolve, 95_000));
  const response = await context.request.get("/api/consultations");
  expect(response.status()).toBe(200);
  expect(consultationPageSchema.parse(await response.json()).items).toEqual([]);
  const resumed = await context.newPage();
  await resumed.goto("/dashboard");
  await expect(resumed.getByText(email)).toBeVisible();
});
