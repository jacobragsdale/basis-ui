/* AmountInput, once with each suffix set: amounts, where m is millions; par, where M is thousands, as bond markets
 * write it; and rates, where bp is a basis point. Each field echoes the number it read, and says why when it reads
 * none. */

import {
  AmountInput,
  Field,
  FieldDescription,
  FieldGroup,
  FieldLabel,
  amountSuffixes,
  parSuffixes,
  rateSuffixes,
} from "@basis/ui";
import type { Suffixes } from "@basis/ui";
import type { ReactElement } from "react";

import { Section } from "#pages/section.tsx";

interface AmountExample {
  readonly id: string;
  readonly label: string;
  readonly description: string;
  readonly suffixes: Suffixes;
  readonly placeholder: string;
  readonly defaultValue: string | null;
}

const examples: readonly AmountExample[] = [
  {
    defaultValue: "1500000",
    description: "k is thousands, m and mm millions, b and bn billions.",
    id: "amount-notional",
    label: "Notional",
    placeholder: "1.5mm",
    suffixes: amountSuffixes,
  },
  {
    defaultValue: null,
    description: "M is thousands and MM millions, as bond markets write it: 5M par is 5,000.",
    id: "amount-par",
    label: "Par",
    placeholder: "5M",
    suffixes: parSuffixes,
  },
  {
    defaultValue: null,
    description: "% is a hundredth and bp a basis point, so 25bp reads as 0.0025.",
    id: "amount-spread",
    label: "Spread",
    placeholder: "25bp",
    suffixes: rateSuffixes,
  },
];

function AmountInputSection(): ReactElement {
  return (
    <Section
      title="AmountInput"
      description="A field for amounts and rates, which reads 1.5mm, 250k or 25bp by the suffixes it declares, exactly and then as a number, and shows the full number back."
    >
      <FieldGroup className="max-w-sm">
        {examples.map((example) => (
          <Field key={example.id}>
            <FieldLabel htmlFor={example.id}>{example.label}</FieldLabel>
            <FieldDescription id={`${example.id}-description`}>
              {example.description}
            </FieldDescription>
            <AmountInput
              id={example.id}
              suffixes={example.suffixes}
              defaultValue={example.defaultValue}
              placeholder={example.placeholder}
              aria-describedby={`${example.id}-description`}
            />
          </Field>
        ))}
      </FieldGroup>
    </Section>
  );
}

export { AmountInputSection };
