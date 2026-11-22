import assert from "node:assert/strict";
import { test } from "node:test";
import { z } from "zod";
import { maxBodyBytes, readBody, readJson } from "./body.ts";
import { Refusal } from "./problem.ts";

const refusal = (status: number, message: string) => (error: unknown) =>
  error instanceof Refusal &&
  error.status === status &&
  error.message === message;

const post = (type: string, body: BodyInit) =>
  new Request("http://localhost", {
    method: "POST",
    headers: { "Content-Type": type },
    body,
  });

test("bounded body reader counts streamed bytes without a Content-Length header", async () => {
  const stream = new ReadableStream<Uint8Array>({
    start(controller) {
      controller.enqueue(new Uint8Array(maxBodyBytes));
      controller.enqueue(new Uint8Array(1));
      controller.close();
    },
  });
  // Node needs `duplex` to send a streamed body. The DOM typings predate it.
  const streamed: RequestInit & { duplex: "half" } = {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: stream,
    duplex: "half",
  };
  const request = new Request("http://localhost", streamed);
  await assert.rejects(
    readBody(request, ["application/json"]),
    refusal(413, "Request is too large."),
  );
});

test("body reader accepts a body at the limit and rejects other media types", async () => {
  const atLimit = await readBody(
    post("application/json; charset=utf-8", new Uint8Array(maxBodyBytes)),
    ["application/json"],
  );
  assert.equal((await atLimit.arrayBuffer()).byteLength, maxBodyBytes);
  await assert.rejects(
    readBody(post("text/plain", "x"), ["application/json"]),
    refusal(415, "Unsupported content type."),
  );
});

test("JSON reader returns the schema's output and refuses anything else with the caller's message", async () => {
  const schema = z.strictObject({ name: z.string().trim().min(1) });
  assert.deepEqual(
    await readJson(post("application/json", '{"name":" Ada "}'), schema, "no"),
    { name: "Ada" },
  );
  for (const body of ['{"name":""}', '{"name":"Ada","role":"admin"}', "{", ""])
    await assert.rejects(
      readJson(post("application/json", body), schema, "Enter a name."),
      refusal(400, "Enter a name."),
    );
});
