import type { z } from "zod";
import { Refusal } from "./problem.ts";

// Protocol limit for every request body this app accepts. The largest
// legitimate body is a booking with a full-length reason, which stays under
// half of this even when every character needs a six-byte JSON escape.
export const maxBodyBytes = 32 * 1024;

export async function readBody(
  request: Request,
  allowedTypes: readonly string[],
): Promise<Response> {
  const contentType = request.headers.get("content-type") ?? "";
  const [mediaType = ""] = contentType.split(";");
  if (!allowedTypes.includes(mediaType.trim().toLowerCase()))
    throw new Refusal(415, "Unsupported content type.");
  if (Number(request.headers.get("content-length")) > maxBodyBytes)
    throw tooLarge();
  // Content-Length can be absent or wrong, so count the bytes that arrive.
  const chunks = await readChunks(request);
  return new Response(new Blob(chunks), {
    headers: { "Content-Type": contentType },
  });
}

/** Validates once, here at the boundary. Callers get the schema's output type. */
export async function readJson<Schema extends z.ZodType>(
  request: Request,
  schema: Schema,
  invalidMessage: string,
): Promise<z.output<Schema>> {
  const body = await readBody(request, ["application/json"]);
  const json: unknown = await body.json().catch(() => null);
  const parsed = schema.safeParse(json);
  if (!parsed.success) throw new Refusal(400, invalidMessage);
  return parsed.data;
}

/** Reads an HTML form post, or null when the body is not a readable form. */
export async function readForm(request: Request): Promise<FormData | null> {
  const body = await readBody(request, [
    "application/x-www-form-urlencoded",
    "multipart/form-data",
  ]);
  return body.formData().catch(() => null);
}

const tooLarge = () => new Refusal(413, "Request is too large.");

async function readChunks(request: Request): Promise<ArrayBuffer[]> {
  const reader = request.body?.getReader();
  const chunks: ArrayBuffer[] = [];
  if (!reader) return chunks;
  let size = 0;
  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) return chunks;
      size += value.byteLength;
      if (size > maxBodyBytes) {
        await reader.cancel();
        throw tooLarge();
      }
      chunks.push(Uint8Array.from(value).buffer);
    }
  } finally {
    reader.releaseLock();
  }
}
