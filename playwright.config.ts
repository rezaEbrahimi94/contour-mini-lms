import { defineConfig } from "@playwright/test";
import { localStack } from "./tests/support/stack.ts";

const app = new URL(localStack().appOrigin);
const channel = process.env.PLAYWRIGHT_CHANNEL;

export default defineConfig({
  testDir: "./tests",
  use: {
    baseURL: app.origin,
    // Fixed, and deliberately far from the campus: the browser is usually on
    // the previous calendar day, so any code that reads the browser's own
    // time zone produces a visibly wrong date.
    timezoneId: "America/Los_Angeles",
    locale: "en-AU",
    ...(channel ? { channel } : {}),
  },
  workers: 1,
  forbidOnly: !!process.env.CI,
  ...(process.env.CONTOUR_START_TEST_SERVER === "1"
    ? {
        webServer: {
          command: `npm start -- --hostname ${app.hostname} --port ${app.port}`,
          url: app.origin + "/login",
          reuseExistingServer: false,
        },
      }
    : {}),
});
