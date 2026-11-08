/* A bond ticket on TanStack Form: an as-of date, a par amount in bond-market style and a spread. A Zod schema checks
 * the form as it changes, with `amountSchema` giving each amount's parse reason as its error; each field passes its
 * errors to its component, which draws the field's error line. On submit the schema's output is what an API would get:
 * numbers and a date. */

import {
  AmountInput,
  AsOfDatePicker,
  Button,
  Field,
  FieldGroup,
  FieldLabel,
  amountSchema,
  defaultAsOfDate,
  parSuffixes,
  rateSuffixes,
} from "@basis/ui";
import type { Suffixes } from "@basis/ui";
import { useForm } from "@tanstack/react-form";
import { useState } from "react";
import type { ComponentProps, ReactElement } from "react";
import { z } from "zod";

import { Section } from "#pages/section.tsx";

import { exampleToday } from "./example-today.ts";

const ticketSchema = z.object({
  asOf: z
    .instanceof(Temporal.PlainDate)
    .nullable()
    .refine((date) => date !== null, "Pick an as-of date."),
  par: amountSchema(parSuffixes),
  spread: amountSchema(rateSuffixes).nullable(),
});

interface Ticket {
  readonly asOf: Temporal.PlainDate | null;
  readonly par: number | string | null;
  readonly spread: number | string | null;
}

const blankTicket: Ticket = {
  asOf: defaultAsOfDate({ today: exampleToday }),
  par: null,
  spread: null,
};

type FieldErrors = NonNullable<ComponentProps<typeof AmountInput>["errors"]>;

/** What a field's component needs from TanStack Form's field. */
interface BoundField<TValue> {
  readonly state: {
    readonly value: TValue;
    readonly meta: {
      readonly isTouched: boolean;
      readonly isValid: boolean;
      readonly errors: FieldErrors;
    };
  };
  readonly handleChange: (value: TValue) => void;
  readonly handleBlur: () => void;
}

/** Whether a field shows its errors: once touched, while it has any. */
function invalidOf({ meta }: BoundField<unknown>["state"]): boolean {
  return meta.isTouched && !meta.isValid;
}

/** The as-of date, on SIFMA's calendar. */
function AsOfField({
  field,
}: {
  readonly field: BoundField<Temporal.PlainDate | null>;
}): ReactElement {
  const invalid = invalidOf(field.state);
  return (
    <Field data-invalid={invalid}>
      <FieldLabel htmlFor="ticket-as-of">As of</FieldLabel>
      <AsOfDatePicker
        id="ticket-as-of"
        today={exampleToday}
        value={field.state.value}
        onValueChange={field.handleChange}
        onBlur={field.handleBlur}
        aria-invalid={invalid}
        errors={invalid ? field.state.meta.errors : undefined}
      />
    </Field>
  );
}

interface AmountFieldProps {
  readonly field: BoundField<number | string | null>;
  readonly id: string;
  readonly label: string;
  readonly suffixes: Suffixes;
  readonly placeholder: string;
}

/** An amount, by the suffixes it declares. */
function AmountField({ field, id, label, suffixes, placeholder }: AmountFieldProps): ReactElement {
  const invalid = invalidOf(field.state);
  return (
    <Field data-invalid={invalid}>
      <FieldLabel htmlFor={id}>{label}</FieldLabel>
      <AmountInput
        id={id}
        suffixes={suffixes}
        placeholder={placeholder}
        value={field.state.value}
        onValueChange={field.handleChange}
        onBlur={field.handleBlur}
        aria-invalid={invalid}
        errors={invalid ? field.state.meta.errors : undefined}
      />
    </Field>
  );
}

/** What the form sends, as the schema gives it. */
function sentText(value: Ticket): string {
  const ticket = ticketSchema.parse(value);
  return `Sent: ${ticket.par} par at a spread of ${ticket.spread ?? "none"}, as of ${String(ticket.asOf)}.`;
}

/** The submit button, and what the form last sent. */
function SendRow({ sent }: { readonly sent: string | undefined }): ReactElement {
  return (
    <div className="flex items-center gap-4">
      <Button type="submit">Send ticket</Button>
      <output className="text-sm text-muted-foreground">{sent}</output>
    </div>
  );
}

function TicketForm(): ReactElement {
  const [sent, setSent] = useState<string>();
  const form = useForm({
    defaultValues: blankTicket,
    onSubmit: ({ value }) => {
      setSent(sentText(value));
    },
    validators: { onChange: ticketSchema },
  });
  return (
    <form
      noValidate
      aria-label="Bond ticket"
      className="flex max-w-sm flex-col gap-4"
      onSubmit={(event) => {
        event.preventDefault();
        form.handleSubmit().catch(reportError);
      }}
    >
      <FieldGroup>
        <form.Field name="asOf">{(field) => <AsOfField field={field} />}</form.Field>
        <form.Field name="par">
          {(field) => (
            <AmountField
              field={field}
              id="ticket-par"
              label="Par"
              suffixes={parSuffixes}
              placeholder="5M"
            />
          )}
        </form.Field>
        <form.Field name="spread">
          {(field) => (
            <AmountField
              field={field}
              id="ticket-spread"
              label="Spread"
              suffixes={rateSuffixes}
              placeholder="25bp"
            />
          )}
        </form.Field>
      </FieldGroup>
      <SendRow sent={sent} />
    </form>
  );
}

function TicketFormSection(): ReactElement {
  return (
    <Section
      title="A ticket on TanStack Form"
      description="AsOfDatePicker and AmountInput with TanStack Form and a Zod schema: amountSchema gives a form each amount's parse reason, and the schema's output holds numbers."
    >
      <TicketForm />
    </Section>
  );
}

export { TicketFormSection };
