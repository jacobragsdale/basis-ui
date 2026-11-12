/* Book a trade: the bond found by its CUSIP with SecurityPicker, the face and price read by AmountInput, the trade
 * date a business day by AsOfDatePicker, checked as it changes by the schema orval generates, then a typed
 * confirmation of the CUSIP before the generated mutation sends it. The desk's 422 lands on the fields it names. */

import {
  Button,
  ErrorAlert,
  FieldGroup,
  FormAmountField,
  FormDateField,
  FormSecurityField,
  FormSelectField,
  FormTextField,
  Page,
  TypedConfirmDialog,
  UnsavedChangesGuard,
  amountSchema,
  errorsOnFields,
  submitErrors,
  toast,
  useTelemetry,
} from "@basis/ui";
import type { SecurityIdentifier } from "@basis/ui";
import { useForm, useSelector } from "@tanstack/react-form";
import { useState } from "react";
import type { ReactElement } from "react";
import type { z } from "zod";

import { TradeTicket, securities, useBookTrade } from "#api/client.ts";
import type { Security } from "#api/client.ts";

/** The fields a 422's errors may name, as the request's body names them. */
const fieldNames = [
  "cusip",
  "side",
  "face",
  "price",
  "trade_date",
  "settle_date",
  "book",
  "counterparty",
] as const;

const ticketForm = TradeTicket.extend({ face: amountSchema(), price: amountSchema() });

const emptyTicket: z.input<typeof ticketForm> = {
  book: "Credit",
  counterparty: "",
  cusip: "",
  face: null,
  price: null,
  settle_date: "",
  side: "Buy",
  trade_date: "2026-10-30",
};

async function search(
  identifier: SecurityIdentifier,
  signal: AbortSignal,
): Promise<readonly Security[]> {
  const found = await securities({ id: identifier.value }, { signal });
  return found.data;
}

/** What `send` threw, or `null` once it succeeds. */
async function failureOf(send: () => Promise<unknown>): Promise<unknown> {
  try {
    await send();
    return null;
  } catch (error) {
    return error;
  }
}

function useBooking(): ReturnType<typeof useBookTrade> {
  const telemetry = useTelemetry();
  return useBookTrade({
    mutation: {
      meta: { errorToast: false },
      onSuccess: ({ data: booked }) => {
        toast.add({ title: `Booked trade ${String(booked.trade_id)}`, type: "success" });
        telemetry.event("trade.booked", { trade: booked.trade_id });
      },
    },
  });
}

function useTicketForm(booking: ReturnType<typeof useBookTrade>) {
  return useForm({
    defaultValues: emptyTicket,
    validators: {
      onChange: ticketForm,
      onSubmitAsync: async ({ value }) => {
        const data = ticketForm.parse(value);
        const failure = await failureOf(async () => booking.mutateAsync({ data }));
        return failure === null
          ? undefined
          : submitErrors(failure, { fields: fieldNames, message: "The trade was not booked." });
      },
    },
  });
}

function useTicket(): {
  readonly form: ReturnType<typeof useTicketForm>;
  readonly booking: ReturnType<typeof useBookTrade>;
} {
  const booking = useBooking();
  return { booking, form: useTicketForm(booking) };
}

function TicketFields({ form }: { readonly form: ReturnType<typeof useTicketForm> }): ReactElement {
  return (
    <FieldGroup>
      <form.Field name="cusip">
        {(field) => (
          <FormSecurityField
            field={field}
            label="Bond"
            description="Its CUSIP, such as ATL000A02."
            itemKey={(security) => security.cusip}
            itemLabel={(security) => security.description}
            kinds={["cusip"]}
            search={search}
          />
        )}
      </form.Field>
      <form.Field name="side">
        {(field) => (
          <FormSelectField
            field={field}
            label="Side"
            options={[
              { label: "Buy", value: "Buy" },
              { label: "Sell", value: "Sell" },
            ]}
          />
        )}
      </form.Field>
      <form.Field name="face">
        {(field) => (
          <FormAmountField field={field} label="Face" description="Such as 5mm or 5,000,000." />
        )}
      </form.Field>
      <form.Field name="price">
        {(field) => (
          <FormAmountField
            field={field}
            label="Price"
            description="Per 100 of face, such as 99.1875."
          />
        )}
      </form.Field>
      <form.Field name="trade_date">
        {(field) => <FormDateField asOf field={field} label="Trade date" />}
      </form.Field>
      <form.Field name="settle_date">
        {(field) => <FormDateField field={field} label="Settlement date" />}
      </form.Field>
      <form.Field name="book">
        {(field) => (
          <FormSelectField
            field={field}
            label="Book"
            options={["Credit", "Rates", "Macro"].map((book) => ({ label: book, value: book }))}
          />
        )}
      </form.Field>
      <form.Field name="counterparty">
        {(field) => (
          <FormTextField field={field} label="Counterparty" placeholder="Northwind Securities" />
        )}
      </form.Field>
    </FieldGroup>
  );
}

function BookTradePage(): ReactElement {
  const telemetry = useTelemetry();
  const { booking, form } = useTicket();
  const report = (error: unknown): void => {
    telemetry.error(error, { source: "book-trade" });
  };
  const [confirming, setConfirming] = useState(false);
  const cusip = useSelector(form.store, (state) => state.values.cusip);
  const dirty = useSelector(form.store, (state) => state.isDirty && !state.isSubmitSuccessful);
  return (
    <Page
      title="Book a trade"
      description="A bond trade for the desk's checks: the desk answers with what to fix."
    >
      <form
        noValidate
        aria-label="Trade ticket"
        className="flex max-w-md flex-col gap-4"
        onSubmit={(event) => {
          event.preventDefault();
          setConfirming(true);
        }}
      >
        <UnsavedChangesGuard when={dirty} />
        <TicketFields form={form} />
        <ErrorAlert
          error={errorsOnFields(booking.error, fieldNames) === undefined ? booking.error : null}
        />
        <Button type="submit" disabled={booking.isPending} className="self-start">
          Book trade
        </Button>
      </form>
      <TypedConfirmDialog
        actionLabel="Book trade"
        confirmText={cusip}
        description="The trade goes to the desk's checks, then to settlement. Type the bond's CUSIP to book it."
        onConfirm={() => {
          form.handleSubmit().catch(report);
        }}
        onOpenChange={setConfirming}
        open={confirming}
        title={`Book this trade in ${cusip === "" ? "no bond yet" : cusip}?`}
      />
    </Page>
  );
}

export { BookTradePage };
