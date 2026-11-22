import { randomUUID } from "node:crypto";
import { test as base } from "@playwright/test";
import { deleteAccount } from "./operator.ts";

// Each test owns its fixture accounts, including teardown after a failed assertion.
export const test = base.extend<{ accountEmail: () => string }>({
  // Playwright requires object destructuring for the dependency list, including an empty one.
  accountEmail: async ({}, provide) => {
    const emails: string[] = [];
    try {
      await provide(() => {
        const email = `contour-e2e-${randomUUID()}@example.test`;
        emails.push(email);
        return email;
      });
    } finally {
      for (const email of emails) await deleteAccount(email);
    }
  },
});
