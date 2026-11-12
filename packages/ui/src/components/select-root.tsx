/* The select's root: Base UI's, which reports a list too long for a select. A select draws every item it holds and
 * cannot be typed into to narrow them, so past 100 items it reports one error to telemetry, which names Combobox, whose
 * list is capped and narrows as the user types. The select still works. */

import { Select as SelectPrimitive } from "@base-ui/react/select";
import { useEffect } from "react";
import type { ReactElement } from "react";

import { useTelemetry } from "#shell/telemetry.ts";

import { listLimit } from "./combobox-limit.ts";

const counts = new Intl.NumberFormat("en-US");

/** The error a select with `count` items past the cap reports. */
function longSelectMessage(count: number): string {
  return `ERROR a Select holds ${counts.format(count)} items, past the ${counts.format(listLimit)} a select lists well: use Combobox, which draws ${counts.format(listLimit)} and narrows as the user types.`;
}

/** A select: its trigger and its content, which holds the items. Give it `items` to show an item's label as the
 * value, and `value` with `onValueChange`, or `defaultValue`. Past 100 `items`, it reports an error naming Combobox.
 *
 * @use For one choice from a list the page holds, short enough to scan. For a long list, use Combobox; for a search an
 * API answers, EntityPicker; for the browser's own control, NativeSelect.
 * @see Field, FieldLabel, Combobox, NativeSelect, EntityPicker
 *
 * @example
 * ```tsx
 * import { Label, Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@basis/ui";
 *
 * const tenors = [
 *   { label: "2Y", value: "2y" },
 *   { label: "5Y", value: "5y" },
 *   { label: "10Y", value: "10y" },
 * ];
 *
 * <>
 *   <Label htmlFor="tenor">Tenor</Label>
 *   <Select items={tenors} defaultValue="5y">
 *     <SelectTrigger id="tenor">
 *       <SelectValue />
 *     </SelectTrigger>
 *     <SelectContent>
 *       {tenors.map((tenor) => (
 *         <SelectItem key={tenor.value} value={tenor.value}>
 *           {tenor.label}
 *         </SelectItem>
 *       ))}
 *     </SelectContent>
 *   </Select>
 * </>;
 * ```
 */
function Select<Value, Multiple extends boolean | undefined = false>(
  props: SelectPrimitive.Root.Props<Value, Multiple>,
): ReactElement {
  const telemetry = useTelemetry();
  const count = Array.isArray(props.items)
    ? props.items.length
    : Object.keys(props.items ?? {}).length;
  useEffect(() => {
    if (count > listLimit) {
      telemetry.error(new RangeError(longSelectMessage(count)), { items: count, source: "select" });
    }
  }, [count, telemetry]);
  return <SelectPrimitive.Root<Value, Multiple> {...props} />;
}

export { Select };
