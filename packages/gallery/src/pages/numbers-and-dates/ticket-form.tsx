/* A bond ticket on TanStack Form: an as-of date, a par amount in bond-market style and a spread, each on one of
 * `@basis/ui`'s form fields. A Zod schema checks the form as it changes, with `amountSchema` giving each amount's parse
 * reason as its error, which the field draws once touched. On submit the schema's output is what an API would get:
 * numbers and a date. */

import {
  Button,
  FieldGroup,
  FormAmountField,
  FormDateField,
  amountSchema,
  defaultAsOfDate,
  parSuffixes,
  rateSuffixes,
} from "@basis/ui";
import type { FormFieldApi } from "@basis/ui";
import { useForm } from "@tanstack/react-form";
import { useState } from "react";
import type { ReactElement } from "react";
import { z } from "zod";

import { Section } from "#pages/section.tsx";

import { exampleToday } from "./example-today.ts";

/** The ticket as an API's generated schema holds it: the date as ISO 8601 text, the amounts as AmountInput gives
 * them. */
const ticketSchema = z.object({
  asOf: z.iso.date("Pick an as-of date."),
  par: amountSchema(parSuffixes),
  spread: amountSchema(rateSuffixes).nullable(),
});

interface Ticket {
  readonly asOf: string;
  readonly par: number | string | null;
  readonly spread: number | string | null;
}

const blankTicket: Ticket = {
  asOf: defaultAsOfDate({ today: exampleToday }).toString(),
  par: null,
  spread: null,
};

function sentText(value: Ticket): string {
  const ticket = ticketSchema.parse(value);
  return `Sent: ${ticket.par} par at a spread of ${ticket.spread ?? "none"}, as of ${ticket.asOf}.`;
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

/** The as-of date, on SIFMA's calendar. */
function asOfField(field: FormFieldApi<string>): ReactElement {
  return <FormDateField field={field} id="ticket-as-of" label="As of" asOf today={exampleToday} />;
}

/** Par, in bond-market style, where `5M` is 5,000. */
function parField(field: FormFieldApi<number | string | null>): ReactElement {
  return (
    <FormAmountField
      field={field}
      id="ticket-par"
      label="Par"
      suffixes={parSuffixes}
      placeholder="5M"
    />
  );
}

/** The spread, where `25bp` is 0.0025. */
function spreadField(field: FormFieldApi<number | string | null>): ReactElement {
  return (
    <FormAmountField
      field={field}
      id="ticket-spread"
      label="Spread"
      suffixes={rateSuffixes}
      placeholder="25bp"
    />
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
        <form.Field name="asOf">{asOfField}</form.Field>
        <form.Field name="par">{parField}</form.Field>
        <form.Field name="spread">{spreadField}</form.Field>
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
