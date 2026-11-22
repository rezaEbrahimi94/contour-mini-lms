import { appConfig } from "../env.ts";

/**
 * Browsers attach Origin to every state-changing request, and a page on
 * another site cannot forge it. Session cookies alone are not proof of intent.
 */
export function trustedAppOrigin(request: Request) {
  const origin = request.headers.get("origin");
  return origin !== null && appConfig().trustedOrigins.includes(origin)
    ? origin
    : null;
}
