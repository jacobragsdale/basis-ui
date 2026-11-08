/* The Zod schema for an AmountInput's value, so a form's own check gives the parse reason as the field's error and
 * refuses to submit text that reads as no number. It lives apart from amount-input.tsx because a component file exports
 * only components. */

import { z } from "zod";

import { amountSuffixes, parseAmount } from "#format/parse.ts";
import type { ParseResult, Suffixes } from "#format/parse.ts";

/** Takes what an AmountInput holds and gives the number. It accepts the number the input read, and rejects the text
 * the input holds while what was typed reads as no number, with the parser's reason, such as `"k" is not a suffix this
 * field accepts: use m, mm, bn.` `null`, an empty field, fails with "Enter an amount."; add `.nullable()` for a field
 * that may stay empty. Its input type takes `null`, as a form's values do while the field is empty. */
function amountSchema(
  suffixes: Suffixes = amountSuffixes,
): z.ZodType<number, number | string | null> {
  return z
    .union([z.number(), z.string()])
    .nullable()
    .transform((held, context) => {
      if (typeof held === "number") {
        return held;
      }
      const reading: ParseResult =
        held === null ? { ok: false, reason: "Enter an amount." } : parseAmount(held, suffixes);
      if (!reading.ok) {
        context.addIssue({ code: "custom", message: reading.reason });
        return z.NEVER;
      }
      return reading.value;
    });
}

export { amountSchema };
