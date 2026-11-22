import { appConfig } from "./lib/env.ts";

// Next.js calls this once, before the server accepts requests. Reading the
// configuration here turns a bad deployment value into a failed start with a
// clear message, rather than an error on some student's first request.
export function register() {
  appConfig();
}
