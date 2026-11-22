import { randomUUID } from "node:crypto";
import { expect } from "@playwright/test";
import { z } from "zod";
import { test } from "./support/accounts.ts";
import { localStack } from "./support/stack.ts";

// The two Mailpit responses this test reads, checked before use.
const searchSchema = z.object({
  messages: z.array(z.object({ ID: z.string() })),
});
const messageSchema = z.object({ HTML: z.string() });

for (const alias of [false, true])
  test(`email confirmation keeps the signup session on the ${alias ? "alternate loopback" : "configured"} host`, async ({
    accountEmail,
    page,
    request,
  }) => {
    test.skip(
      process.env.TEST_CONFIRM_EMAIL !== "1",
      "Requires local email confirmations and Mailpit",
    );
    const email = accountEmail();
    const signup = new URL("/signup", localStack().appOrigin);
    if (alias)
      signup.hostname =
        signup.hostname === "localhost" ? "127.0.0.1" : "localhost";
    await page.goto(signup.href);
    await page.getByLabel("Email").fill(email);
    await page.getByLabel("Password").fill(randomUUID());
    await page.getByRole("button", { name: "Create account" }).click();
    await expect(page.getByRole("status")).toContainText("Check your email");
    await page.goto(new URL("/dashboard", signup).href);
    await expect(page).toHaveURL(/\/login$/);

    // Read only the synthetic student's message from the local development mailbox.
    const { apiUrl, mailboxUrl } = localStack();
    if (!mailboxUrl) throw new Error("The local stack reports no mailbox");
    const mailbox = mailboxUrl + "/api/v1";
    let messageId: string | undefined;
    await expect
      .poll(async () => {
        const result = await request.get(mailbox + "/search", {
          params: { query: "to:" + email },
        });
        messageId = searchSchema.parse(await result.json()).messages[0]?.ID;
        return messageId !== undefined;
      })
      .toBe(true);
    const message = messageSchema.parse(
      await (await request.get(`${mailbox}/message/${messageId ?? ""}`)).json(),
    );
    const link = /href="([^"]+\/auth\/v1\/verify[^"]+)"/i.exec(
      message.HTML,
    )?.[1];
    if (!link)
      throw new Error("Confirmation message missing its verification link");
    const destination = new URL(link.replaceAll("&amp;", "&"));
    if (destination.origin !== new URL(apiUrl).origin)
      throw new Error("Expected a local verification URL");
    await page.goto(destination.href);
    await expect(page).toHaveURL(new URL("/dashboard", signup).href);
    await expect(page.getByText(email)).toBeVisible();
  });
