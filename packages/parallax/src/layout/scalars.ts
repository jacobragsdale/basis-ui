/* The values a layout is made of. */

import { z } from "zod";

/** A column's name. */
const name = z.string();
/** A count or an index, from 0. */
const count = z.int().nonnegative();
/** A JSON scalar: filter operands and group-path values. */
const scalar = z.union([z.string(), z.number(), z.boolean(), z.null()]);

/** The filter operators. */
const filterOps = [
  "eq",
  "ne",
  "lt",
  "le",
  "gt",
  "ge",
  "in",
  "not_in",
  "is_null",
  "is_not_null",
  "contains",
  "not_contains",
  "starts_with",
  "ends_with",
] as const;

/** A filter operator. */
type FilterOp = (typeof filterOps)[number];

export { count, filterOps, name, scalar };
export type { FilterOp };
