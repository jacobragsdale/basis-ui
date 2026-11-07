/* The page's check of what the worker sends, which crosses a thread boundary as any I/O does. */

import { z } from "zod";

import type { FromWorker } from "./messages.ts";

/** Bytes that arrived in a message, which structured cloning always backs with an ArrayBuffer of their own. */
const bytes = z.custom<Uint8Array<ArrayBuffer>>(
  (value) => value instanceof Uint8Array && value.buffer instanceof ArrayBuffer,
  "expected bytes",
);
const id = z.int();

/** Messages the worker sends; see `messages.ts`. */
const fromWorkerSchema = z.discriminatedUnion("kind", [
  z.strictObject({ bytes, kind: z.literal("reply") }),
  z.strictObject({ id, kind: z.literal("loaded"), rows: z.int().nonnegative() }),
  z.strictObject({ bytes, id, kind: z.literal("chunk") }),
  z.strictObject({ bytes: bytes.nullable(), id, kind: z.literal("exported") }),
  z.strictObject({ id, kind: z.literal("failed"), message: z.string() }),
  z.strictObject({ kind: z.literal("trapped"), message: z.string() }),
  z.strictObject({ kind: z.literal("fatal"), message: z.string() }),
]) satisfies z.ZodType<FromWorker>;

/** A message from the worker, as the page reads it. */
type Reply = z.output<typeof fromWorkerSchema>;

/** A message from the worker, or null for one the page does not know. */
function parseFromWorker(data: unknown): Reply | null {
  const parsed = fromWorkerSchema.safeParse(data);
  return parsed.success ? parsed.data : null;
}

export { parseFromWorker };
export type { Reply };
