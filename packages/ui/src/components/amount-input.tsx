/* AmountInput: a field for amounts and rates, such as `1.5mm`, `250k`, `(1,234.50)` or `25bp`, that reads what is typed
 * through `parseAmount`, exactly and then as a number, and shows the full number it read below the input, so the
 * person sees what the field took: `5M` par is 5,000 in bond markets.
 *
 * The field declares its suffixes: `amountSuffixes` by default, where `m` is millions; `parSuffixes`, where `M` is
 * thousands; or `rateSuffixes`, where `bp` is a ten-thousandth, so `25bp` is 0.0025. Base UI's Number Field reads no
 * suffixes, so this is Base UI's input in an InputGroup.
 *
 * Its value is the number the text reads as, such as 1500000 for `1.5mm`, or `null` while the field is empty. While
 * the text reads as no number its value is the text itself, so no form takes it for a number, and the parser's reason
 * is the field's error: AmountInput shows it once the field has been left, and `amountSchema` gives a form's check the
 * same reason. AmountInput draws the field's error line, so a form passes it the field's errors rather than drawing a
 * FieldError of its own; while the text reads as no number, the reason replaces them. The input, the echo and the
 * error line stack in a column of their own, so a horizontal Field sets the column beside its label. */

import { useId, useState } from "react";
import type { ComponentProps, FocusEvent, ReactElement } from "react";

import { amountSuffixes, parseAmount, parseAmountText } from "#format/parse.ts";
import type { Suffixes } from "#format/parse.ts";
import { decimalText, parseDecimal } from "#numbers/decimal-text.ts";
import { idList, useControlled } from "./field-state.ts";
import { FieldError } from "./field.tsx";
import { InputGroup, InputGroupInput } from "./input-group.tsx";
import { exactText } from "./num-text.ts";

type FieldErrors = NonNullable<ComponentProps<typeof FieldError>["errors"]>;

interface AmountInputProps extends Omit<
  ComponentProps<"input">,
  "value" | "defaultValue" | "onChange" | "type" | "children"
> {
  /** The number, `null` for an empty field, or the text while it reads as no number. Leave it out for
   * an uncontrolled field. */
  readonly value?: number | string | null | undefined;
  /** The value an uncontrolled field starts with, as `value` takes it. */
  readonly defaultValue?: number | string | null | undefined;
  /** Called with the new value as the person types, once each time it changes. */
  readonly onValueChange?: ((value: number | string | null) => void) | undefined;
  /** The suffixes the field accepts; `amountSuffixes` unless set. */
  readonly suffixes?: Suffixes | undefined;
  /** The form's errors for the field, such as TanStack Form's `field.state.meta.errors`, shown under the input. */
  readonly errors?: FieldErrors | undefined;
}

/** The value a text gives: `null` for none, the number it reads as, or the text itself. */
function valueOf(text: string, suffixes: Suffixes): number | string | null {
  if (text.trim() === "") {
    return null;
  }
  const reading = parseAmount(text, suffixes);
  return reading.ok ? reading.value : text;
}

/** What the field shows under its input while the text reads: the number in full, such as `= 1,500,000`. */
function echoOf(text: string, suffixes: Suffixes): string | undefined {
  if (text.trim() === "") {
    return undefined;
  }
  const reading = parseAmountText(text, suffixes);
  return reading.ok ? `= ${exactText(reading.value)}` : undefined;
}

/** Why the text reads as no number, or `undefined` when it reads or is empty. */
function reasonOf(text: string, suffixes: Suffixes): string | undefined {
  if (text.trim() === "") {
    return undefined;
  }
  const reading = parseAmount(text, suffixes);
  return reading.ok ? undefined : reading.reason;
}

/** The digits a double is shown with, as the formatter reads one. */
const significantDigits = 15;

/** A value set from outside as the field writes it: plain decimal text at 15 significant digits, as the formatter
 * reads a double, so `0.1 + 0.2` is `0.3` and `1e-7` is `0.0000001`, which the parser reads back. Text, a value that
 * reads as no number, is shown as it is. */
function valueText(value: number | string | null): string {
  if (value === null) {
    return "";
  }
  if (typeof value === "string" || !Number.isFinite(value)) {
    return String(value);
  }
  const rounded = Number(value.toPrecision(significantDigits));
  return decimalText(parseDecimal(String(rounded)));
}

/** The field's text and what it reads as. */
interface AmountText {
  readonly text: string;
  readonly echo: string | undefined;
  readonly reason: string | undefined;
  readonly type: (text: string) => void;
  readonly leave: () => void;
}

/** The text the field shows, which is what was typed while it still reads as the value; a value set from outside
 * replaces it. The parse reason waits until the field has been left once, so it does not flash while a number is
 * half typed. */
function useAmountText({
  value,
  defaultValue = null,
  onValueChange,
  suffixes,
}: Pick<AmountInputProps, "value" | "defaultValue" | "onValueChange"> & {
  readonly suffixes: Suffixes;
}): AmountText {
  const [current, change] = useControlled({
    initial: () => defaultValue,
    onChange: onValueChange,
    same: (left, right) => left === right,
    value,
  });
  const [typed, setTyped] = useState<string | null>(null);
  const [left, setLeft] = useState(false);
  const shown = valueText(current);
  const text = typed !== null && valueOf(typed, suffixes) === current ? typed : shown;
  return {
    echo: echoOf(text, suffixes),
    leave: () => {
      setLeft(true);
    },
    reason: left ? reasonOf(text, suffixes) : undefined,
    text,
    type: (next) => {
      setTyped(next);
      change(valueOf(next, suffixes));
    },
  };
}

type FieldProps = Omit<AmountInputProps, "className" | "errors">;

/** The field's state, with the props of its input: the app's, then the text and the handlers that read it. */
function useAmountField({
  id,
  value,
  defaultValue,
  onValueChange,
  suffixes = amountSuffixes,
  onBlur,
  "aria-describedby": describedBy,
  "aria-invalid": ariaInvalid,
  ...props
}: FieldProps): {
  readonly input: ComponentProps<"input">;
  readonly inputId: string;
  readonly echo: string | undefined;
  readonly reason: string | undefined;
} {
  const generatedId = useId();
  const inputId = id ?? generatedId;
  const amount = useAmountText({ defaultValue, onValueChange, suffixes, value });
  const echoId = amount.echo === undefined ? undefined : `${inputId}-echo`;
  return {
    echo: amount.echo,
    input: {
      autoComplete: "off",
      spellCheck: false,
      ...props,
      "aria-describedby": idList(echoId, `${inputId}-error`, describedBy),
      "aria-invalid": amount.reason === undefined ? ariaInvalid : true,
      id: inputId,
      onBlur: (event: FocusEvent<HTMLInputElement>) => {
        amount.leave();
        onBlur?.(event);
      },
      onChange: (event) => {
        amount.type(event.target.value);
      },
      value: amount.text,
    },
    inputId,
    reason: amount.reason,
  };
}

/** An amount or rate field. Label it with a FieldLabel's `htmlFor` and this `id`, and put it in a `Field`; it draws the
 * line under the input that echoes the number and the error line.
 *
 * @use For an amount, a par or a rate the user types, such as `1.5MM` or `25bp`. For text, use Input; for a value on a
 * scale, Slider.
 * @see Field, FieldLabel, amountSchema, parSuffixes, rateSuffixes, amountSuffixes, parseAmount
 *
 * @example
 * ```tsx
 * import { AmountInput, Field, FieldLabel, parSuffixes } from "@basis/ui";
 *
 * <Field>
 *   <FieldLabel htmlFor="par">Par</FieldLabel>
 *   <AmountInput id="par" suffixes={parSuffixes} onValueChange={() => undefined} />
 * </Field>;
 * ```
 */
function AmountInput({ className, errors, ...props }: AmountInputProps): ReactElement {
  const field = useAmountField(props);
  return (
    <div data-slot="field-content" className="flex min-w-0 flex-1 flex-col gap-2">
      <InputGroup className={className}>
        <InputGroupInput {...field.input} />
      </InputGroup>
      {field.echo === undefined ? null : (
        <output
          id={`${field.inputId}-echo`}
          htmlFor={field.inputId}
          data-slot="amount-input-echo"
          className="text-sm text-muted-foreground tabular-nums"
        >
          {field.echo}
        </output>
      )}
      <FieldError
        id={`${field.inputId}-error`}
        errors={field.reason === undefined ? errors : [field.reason]}
      />
    </div>
  );
}

export { AmountInput };
