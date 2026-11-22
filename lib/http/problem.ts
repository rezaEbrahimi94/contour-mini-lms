import { z } from "zod";

/** Every API error body has this one shape. */
export const problemSchema = z.object({ error: z.string() });
type Problem = z.infer<typeof problemSchema>;

export function problem(status: number, error: string) {
  return Response.json({ error } satisfies Problem, {
    status,
    headers: { "Cache-Control": "private, no-store" },
  });
}

/**
 * Thrown for a request that cannot be served as sent: wrong origin, no
 * session, missing header, invalid body. The message is written for the
 * caller. lib/http/failure.ts turns it into a problem response.
 */
export class Refusal extends Error {
  readonly status: number;
  constructor(status: number, message: string) {
    super(message);
    this.status = status;
  }
}
