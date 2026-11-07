/* One labelled setting of the pivot's menus and options: its label, then its control, a select or a whole number, on
 * one line. The labels take two fifths of the line and the controls the rest, so a menu's controls line up. */

import { Label, NativeSelect, NativeSelectOption } from "@basis/ui";
import { useId } from "react";
import type { ComponentProps, ReactNode } from "react";

import type { Choice } from "./labels.ts";
import { NumberInput } from "./number-input.tsx";

/** A label and the control it names by `id`. */
function Setting({
  id,
  label,
  children,
}: {
  readonly id: string;
  readonly label: string;
  readonly children: ReactNode;
}): ReactNode {
  return (
    <div className="grid grid-cols-5 items-center gap-2 [&>label]:text-muted-foreground">
      <Label htmlFor={id} className="col-span-2">
        {label}
      </Label>
      {children}
    </div>
  );
}

/** A setting of a whole number. */
function NumberSetting({
  label,
  ...props
}: ComponentProps<typeof NumberInput> & { readonly label: string }): ReactNode {
  const id = useId();
  return (
    <Setting id={id} label={label}>
      <NumberInput id={id} className="col-span-3 w-20" {...props} />
    </Setting>
  );
}

interface SelectSettingProps {
  readonly label: string;
  readonly choices: readonly Choice[];
  readonly value: string;
  readonly disabled?: boolean;
  /** Takes the value picked. */
  readonly onPick: (value: string) => void;
}

/** A setting picked from `choices`. */
function SelectSetting({
  label,
  choices,
  value,
  disabled = false,
  onPick,
}: SelectSettingProps): ReactNode {
  const id = useId();
  return (
    <Setting id={id} label={label}>
      <NativeSelect
        id={id}
        size="sm"
        className="col-span-3 w-full"
        value={value}
        disabled={disabled}
        onChange={(event) => {
          onPick(event.currentTarget.value);
        }}
      >
        {choices.map((choice) => (
          <NativeSelectOption key={choice.value} value={choice.value}>
            {choice.text}
          </NativeSelectOption>
        ))}
      </NativeSelect>
    </Setting>
  );
}

export { NumberSetting, SelectSetting };
