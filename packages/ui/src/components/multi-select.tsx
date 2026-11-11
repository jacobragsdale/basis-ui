/* MultiSelect: several choices from a list the page holds, such as the books a report covers, on Base UI's select in
 * its multiple mode. The trigger counts what is chosen, "3 of 8 books", or names the one choice, or says "All books";
 * the list opens with "Select all", which chooses every option, and again clears them. The list stays open as options
 * are chosen. */

import { useState } from "react";
import type { ReactElement } from "react";

import type { VariantProps } from "#vendor/cva/cva.ts";

import {
  Select,
  SelectContent,
  SelectItem,
  SelectSeparator,
  SelectTrigger,
  SelectValue,
} from "./select.tsx";
import type { selectTriggerVariants } from "./select-variants.ts";

/** One option: its value and the words it shows. */
interface MultiSelectOption<TValue extends string> {
  readonly value: TValue;
  readonly label: string;
}

interface MultiSelectProps<TValue extends string> extends VariantProps<
  typeof selectTriggerVariants
> {
  /** The options, in the order the list shows them. */
  readonly options: readonly MultiSelectOption<TValue>[];
  /** The values chosen, in the options' order, when the app controls them. */
  readonly value?: readonly TValue[] | undefined;
  /** The values an uncontrolled select starts with; none unless set. */
  readonly defaultValue?: readonly TValue[] | undefined;
  /** Called with the values chosen, in the options' order, each time one is chosen or cleared. */
  readonly onValueChange?: ((value: readonly TValue[]) => void) | undefined;
  /** What the options are, in the plural, for the count, such as "books"; "items" unless set. */
  readonly noun?: string | undefined;
  /** What the trigger says while none is chosen; "None" unless set. */
  readonly placeholder?: string | undefined;
  /** The trigger's id, which a `FieldLabel`'s `htmlFor` names. */
  readonly id?: string | undefined;
  /** The trigger's name for assistive technology, where no label names it. */
  readonly "aria-label"?: string | undefined;
  /** Whether the select is disabled. */
  readonly disabled?: boolean | undefined;
  /** Whether the list starts open. */
  readonly defaultOpen?: boolean | undefined;
  /** Places the select, as with `w-64`; its look is fixed. */
  readonly className?: string | undefined;
}

/** No values: an uncontrolled select's start unless it sets one. */
const none: readonly never[] = [];

/** The value the "Select all" item holds, which no option may. */
const allValue = "\u0000all";

/** What the trigger says of the values chosen. */
function countText<TValue extends string>(
  chosen: readonly TValue[],
  {
    options,
    noun,
    placeholder,
  }: {
    readonly options: readonly MultiSelectOption<TValue>[];
    readonly noun: string;
    readonly placeholder: string;
  },
): string {
  if (chosen.length === 0) {
    return placeholder;
  }
  if (chosen.length === options.length) {
    return `All ${noun}`;
  }
  if (chosen.length === 1) {
    return options.find((option) => option.value === chosen[0])?.label ?? placeholder;
  }
  return `${String(chosen.length)} of ${String(options.length)} ${noun}`;
}

/** The values chosen after the list's change, in the options' order: every option once "Select all" is chosen, none
 * once it is cleared, and otherwise the options chosen. */
function chosenAfter<TValue extends string>(
  next: readonly string[],
  before: readonly TValue[],
  options: readonly MultiSelectOption<TValue>[],
): readonly TValue[] {
  const wasAll = before.length === options.length;
  const isAll = next.includes(allValue);
  if (isAll && !wasAll) {
    return options.map((option) => option.value);
  }
  if (!isAll && wasAll) {
    return [];
  }
  return options.filter((option) => next.includes(option.value)).map((option) => option.value);
}

/** A select of several options, with "Select all" and a count. Label it with a `FieldLabel` whose `htmlFor` is its
 * `id`, or with `aria-label`.
 *
 * @use For choosing several of a short list the page holds, such as books, desks or currencies. For one choice, use
 * Select; for a search an API answers, EntityPicker with `multiple`; for a hierarchy, TreeSelect.
 * @see Select, EntityPicker, TreeSelect, Field, FieldLabel
 *
 * @example
 * ```tsx
 * import { Field, FieldLabel, MultiSelect } from "@basis/ui";
 *
 * const books = [
 *   { label: "Rates", value: "rates" },
 *   { label: "Credit", value: "credit" },
 *   { label: "Agency", value: "agency" },
 * ] as const;
 *
 * <Field>
 *   <FieldLabel htmlFor="books">Books</FieldLabel>
 *   <MultiSelect id="books" options={books} noun="books" defaultValue={["rates", "credit"]} />
 * </Field>;
 * ```
 */
function MultiSelect<TValue extends string>({
  options,
  value,
  defaultValue = none,
  onValueChange,
  noun = "items",
  placeholder = "None",
  size = "default",
  id,
  "aria-label": ariaLabel,
  disabled = false,
  defaultOpen = false,
  className,
}: MultiSelectProps<TValue>): ReactElement {
  const [own, setOwn] = useState<readonly TValue[]>(defaultValue);
  const chosen = value ?? own;
  const all = chosen.length === options.length && options.length > 0;
  return (
    <Select<string, true>
      multiple
      disabled={disabled}
      defaultOpen={defaultOpen}
      value={all ? [allValue, ...chosen] : [...chosen]}
      onValueChange={(next) => {
        const after = chosenAfter(next, chosen, options);
        setOwn(after);
        onValueChange?.(after);
      }}
    >
      <SelectTrigger
        {...(id === undefined ? {} : { id })}
        {...(ariaLabel === undefined ? {} : { "aria-label": ariaLabel })}
        {...(className === undefined ? {} : { className })}
        size={size}
      >
        <SelectValue>{() => countText(chosen, { noun, options, placeholder })}</SelectValue>
      </SelectTrigger>
      <SelectContent>
        <SelectItem value={allValue}>Select all</SelectItem>
        <SelectSeparator />
        {options.map((option) => (
          <SelectItem key={option.value} value={option.value}>
            {option.label}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}

export { MultiSelect };
export type { MultiSelectOption, MultiSelectProps };
