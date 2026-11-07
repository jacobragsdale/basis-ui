/* The roles a frame's fields name in their metadata, and the indexes that match a data column's parts. */

import type { Field } from "apache-arrow";

import { FrameError } from "./readers.ts";

/** The roles a frame field can have, as the engine writes them. */
const roles = [
  "seq",
  "depth",
  "kind",
  "expanded",
  "label",
  "rows",
  "group",
  "value",
  "total",
  "flag",
  "text",
  "copy",
] as const;

type Role = (typeof roles)[number];

function isRole(value: string): value is Role {
  return roles.some((role) => role === value);
}

function roleOf(field: Field): Role {
  const role = field.metadata.get("parallax.role") ?? "";
  if (!isRole(role)) {
    throw new FrameError(`${field.name}: unknown role "${role}".`);
  }
  return role;
}

/** A data column's index or a group key's level, from a field's metadata. */
function indexOf(field: Field, key: "parallax.index" | "parallax.level"): number {
  const text = field.metadata.get(key) ?? "";
  if (!/^\d+$/u.test(text)) {
    throw new FrameError(`${field.name}: ${key} must be a non-negative integer.`);
  }
  return Number(text);
}

export { indexOf, roleOf };
export type { Role };
