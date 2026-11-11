/* Recording a settlement: a form on TanStack Form, checked as it changes by the schema orval generates from the API's
 * document, each field one of `@basis/ui`'s form fields, its face amount read by AmountInput (`1mm` is 1,000,000), and
 * sent with the generated mutation. A 422 lands on the fields its errors name, through `submitErrors`; any other
 * failure shows above the button. Leaving with changes not recorded asks first. A recorded settlement raises a toast
 * and opens its bond. */

import {
  Button,
  ErrorAlert,
  FieldGroup,
  FormAmountField,
  FormTextField,
  TypographyH1,
  UnsavedChangesGuard,
  amountSchema,
  errorsOnFields,
  submitErrors,
  toast,
  useTelemetry,
} from "@basis/ui";
import { useForm, useSelector } from "@tanstack/react-form";
import { useNavigate } from "@tanstack/react-router";
import type { ReactElement } from "react";
import type { z } from "zod";

import { SettlementRequest, useRecordSettlement } from "#api/client.ts";

/** The form's text fields, each named as the request's body names it, so a pointer such as `#/settle` finds it. */
const security = {
  description: "Twelve capital letters and digits, such as US91282CRF04.",
  id: "settlement-security",
  label: "ISIN",
  name: "security_id",
} as const;
const settle = {
  description: "The day the trade settles.",
  id: "settlement-settle",
  label: "Settlement date",
  name: "settle",
  type: "date",
} as const;

/** The fields a 422's errors may name, which this form shows them on. */
const fieldNames = ["security_id", "face", "settle"] as const;

/** The request as the form holds it: the face amount is what AmountInput holds, a number once its text reads as one. */
const settlementForm = SettlementRequest.extend({ face: amountSchema() });

const emptySettlement: z.input<typeof settlementForm> = { face: null, security_id: "", settle: "" };

/** What `send` threw, or `null` once it succeeds. */
async function failureOf(send: () => Promise<unknown>): Promise<unknown> {
  try {
    await send();
    return null;
  } catch (error) {
    return error;
  }
}

/** The mutation that records a settlement: once the API records it, a toast says so and the bond's page opens. Its
 * errors show on the form, on its fields or above its button, rather than in a toast. */
function useRecording(): ReturnType<typeof useRecordSettlement> {
  const navigate = useNavigate();
  const telemetry = useTelemetry();
  return useRecordSettlement({
    mutation: {
      meta: { errorToast: false },
      onSuccess: async ({ data: settlement }) => {
        toast.add({
          title: `Recorded the settlement of ${settlement.security_id}`,
          type: "success",
        });
        telemetry.event("settlement.recorded", { security: settlement.security_id });
        await navigate({ params: { security: settlement.security_id }, to: "/bonds/$security" });
      },
    },
  });
}

/** The submit button, below the last failure if the fields cannot hold it. */
function Submit({
  error,
  pending,
}: {
  readonly error: unknown;
  readonly pending: boolean;
}): ReactElement {
  return (
    <>
      <ErrorAlert error={errorsOnFields(error, fieldNames) === undefined ? error : null} />
      <Button type="submit" disabled={pending} className="self-start">
        Record settlement
      </Button>
    </>
  );
}

function SettlementForm(): ReactElement {
  const telemetry = useTelemetry();
  const report = (error: unknown): void => {
    telemetry.error(error, { source: "settlement" });
  };
  const recording = useRecording();
  const form = useForm({
    defaultValues: emptySettlement,
    validators: {
      onChange: settlementForm,
      onSubmitAsync: async ({ value }) => {
        const data = settlementForm.parse(value);
        const failure = await failureOf(async () => recording.mutateAsync({ data }));
        return failure === null
          ? undefined
          : submitErrors(failure, {
              fields: fieldNames,
              message: "The settlement was not recorded.",
            });
      },
    },
  });
  // Leaving asks first while the form holds changes, until a submit records them.
  const dirty = useSelector(
    form.store,
    (state) => state.isDirty && !state.isSubmitting && !state.isSubmitSuccessful,
  );
  return (
    <form
      noValidate
      aria-label="Settlement"
      className="flex max-w-md flex-col gap-4"
      onSubmit={(event) => {
        event.preventDefault();
        form.handleSubmit().catch(report);
      }}
    >
      <UnsavedChangesGuard when={dirty} />
      <FieldGroup>
        <form.Field name={security.name}>
          {(field) => <FormTextField {...security} field={field} />}
        </form.Field>
        <form.Field name="face">
          {(field) => (
            <FormAmountField
              field={field}
              id="settlement-face"
              label="Face amount"
              description="In the bond's currency, such as 1mm or 1,000,000."
            />
          )}
        </form.Field>
        <form.Field name={settle.name}>
          {(field) => <FormTextField {...settle} field={field} />}
        </form.Field>
      </FieldGroup>
      <Submit error={recording.error} pending={recording.isPending} />
    </form>
  );
}

function SettlementPage(): ReactElement {
  return (
    <>
      <TypographyH1>Record a settlement</TypographyH1>
      <SettlementForm />
    </>
  );
}

export { SettlementPage };
