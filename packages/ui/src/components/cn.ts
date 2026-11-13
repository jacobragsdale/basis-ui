/* `cn`, the helper @basis/ui's components build their classes with, for an app's own elements: the lint's advice for
 * a class chosen at run time names it, so an app imports it from `@basis/ui` rather than writing its own. */

import { cn as merge } from "cn";

/** The classes given, as one `className`: strings, and arrays and objects of them as clsx reads them, with `false`,
 * `null` and `undefined` dropped and a later Tailwind class winning over an earlier one it conflicts with.
 *
 * @use To choose between whole classes with a condition on an app's own element, such as a loss's colour, so that
 * every class stays written where the lint and Tailwind can read it. A component's look is its variant, not a class.
 * @see Num, Badge
 *
 * @example
 * ```tsx
 * import { cn } from "@basis/ui";
 *
 * <td className={cn("tabular-nums", pnl < 0 && "text-loss")}>{pnl}</td>;
 * ```
 */
function cn(...classes: Parameters<typeof merge>): string {
  return merge(...classes);
}

export { cn };
export type { ClassValue } from "cn";
