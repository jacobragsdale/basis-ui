/* The values a layout is made of. */

import { z } from "zod";

/** A column's name. */
const name = z.string();
/** A count or an index, from 0. */
const count = z.int().nonnegative();
/** A JSON scalar: filter operands and group-path values. */
const scalar = z.union([z.string(), z.number(), z.boolean(), z.null()]);

export { count, name, scalar };
