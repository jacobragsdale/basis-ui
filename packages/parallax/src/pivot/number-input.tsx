/* A whole number in the pivot's options, such as how many levels open. It keeps what the user types while it is not a
 * number yet, such as an emptied box, and hands on each whole number at or above its minimum as it is typed. */

import { Input } from "@basis/ui";
import { useState } from "react";
import type { ComponentProps, ReactNode } from "react";

interface NumberInputProps extends Omit<
  ComponentProps<typeof Input>,
  "type" | "value" | "onChange" | "min"
> {
  readonly value: number;
  readonly min: number;
  readonly onCommit: (value: number) => void;
}

/** What the box shows: the text typed, for the value it was typed at, so a new value from outside replaces it. */
interface Draft {
  readonly value: number;
  readonly text: string;
}

/** A box for a whole number. */
function NumberInput({ value, min, onCommit, ...props }: NumberInputProps): ReactNode {
  const [draft, setDraft] = useState<Draft | null>(null);
  const text = draft?.value === value ? draft.text : String(value);
  return (
    <Input
      {...props}
      type="number"
      inputMode="numeric"
      min={min}
      value={text}
      onChange={(event) => {
        const typed = event.currentTarget.value;
        const number = event.currentTarget.valueAsNumber;
        const whole = Number.isInteger(number) && number >= min;
        setDraft({ text: typed, value: whole ? number : value });
        if (whole && number !== value) {
          onCommit(number);
        }
      }}
    />
  );
}

export { NumberInput };
