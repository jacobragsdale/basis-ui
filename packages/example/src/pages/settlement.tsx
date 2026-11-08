/* Recording a settlement: a form on TanStack Form, checked as it changes by the schema orval generates from the API's
 * document, its face amount read by AmountInput (`1mm` is 1,000,000), and sent with the generated mutation. A 422 lands on the fields its errors name, through `fieldErrors`;
 * any other failure shows above the button. A recorded settlement raises a toast and opens its bond. */

import {
  AmountInput,
  Button,
  ErrorAlert,
  Field,
  FieldDescription,
  FieldError,
  FieldGroup,
  FieldLabel,
  Input,
  TypographyH1,
  amountSchema,
  fieldErrors,
  isApiError,
  toast,
  useTelemetry,
} from "@basis/ui";
import { useForm } from "@tanstack/react-form";
import { useNavigate } from "@tanstack/react-router";
import type { ComponentProps, ReactElement } from "react";
import type { z } from "zod";

import { SettlementRequest, useRecordSettlement } from "#api/client.ts";

/** The status of a request the API refused, whose problem names each field at fault. */
const unprocessableContent = 422;

/** The form's text fields, each named as the request's body names it, so a pointer such as `#/settle` finds it. */
const security = {
  description: "Twelve capital letters and digits, such as US91282CRF04.",
  id: "settlement-security",
  label: "ISIN",
  name: "security_id",
  type: "text",
} as const;
const settle = {
  description: "The day the trade settles.",
  id: "settlement-settle",
  label: "Settlement date",
  name: "settle",
  type: "date",
} as const;

const fieldNames = new Set<string>(["security_id", "face", "settle"]);

/** The request as the form holds it: the face amount is what AmountInput holds, a number once its text reads as one. */
const settlementForm = SettlementRequest.extend({ face: amountSchema() });

/** A 422's errors by the field of this form each names, or `undefined` when the fields cannot hold the failure: any
 * failure but a 422, a 422 that names no field, and one that names something this form has no field for. */
function errorsOnFields(error: unknown): Record<string, readonly string[]> | undefined {
  if (!isApiError(error) || error.status !== unprocessableContent) {
    return undefined;
  }
  const named = [...fieldErrors(error.problem)];
  return named.length > 0 && named.every(([name]) => fieldNames.has(name))
    ? Object.fromEntries(named)
    : undefined;
}

/** A field's errors, as TanStack Form holds them: the schema's issues and the API's details. */
type FieldErrors = NonNullable<ComponentProps<typeof FieldError>["errors"]>;

/** What a field component reads of TanStack Form's field: its value, errors and touch, and its handlers. */
interface FieldBinding<TValue> {
  readonly state: {
    readonly value: TValue;
    readonly meta: { readonly errors: FieldErrors; readonly isTouched: boolean };
  };
  readonly handleChange: (value: TValue) => void;
  readonly handleBlur: () => void;
}

interface TextFieldProps {
  readonly id: string;
  readonly label: string;
  readonly description: string;
  readonly type: "date" | "text";
  readonly field: FieldBinding<string>;
}

/** One field of the form, invalid once it has been touched and has an error. */
function TextField({ id, label, description, type, field }: TextFieldProps): ReactElement {
  const { value, meta } = field.state;
  const invalid = meta.isTouched && meta.errors.length > 0;
  const { errors } = meta;
  const onBlur = field.handleBlur;
  const onChange = field.handleChange;
  return (
    <Field data-invalid={invalid}>
      <FieldLabel htmlFor={id}>{label}</FieldLabel>
      <Input
        id={id}
        type={type}
        value={value}
        onBlur={onBlur}
        onChange={(event) => {
          onChange(event.target.value);
        }}
        aria-invalid={invalid}
        aria-describedby={`${id}-description ${id}-error`}
      />
      <FieldDescription id={`${id}-description`}>{description}</FieldDescription>
      <FieldError id={`${id}-error`} errors={invalid ? errors : undefined} />
    </Field>
  );
}

/** The face amount, which AmountInput reads, so `1mm` is 1,000,000; it draws its own error line. */
function FaceField({
  field,
}: {
  readonly field: FieldBinding<number | string | null>;
}): ReactElement {
  const { value, meta } = field.state;
  const invalid = meta.isTouched && meta.errors.length > 0;
  return (
    <Field data-invalid={invalid}>
      <FieldLabel htmlFor="settlement-face">Face amount</FieldLabel>
      <AmountInput
        id="settlement-face"
        value={value}
        onValueChange={field.handleChange}
        onBlur={field.handleBlur}
        aria-invalid={invalid}
        aria-describedby="settlement-face-description"
        errors={invalid ? meta.errors : undefined}
      />
      <FieldDescription id="settlement-face-description">
        In the bond&apos;s currency, such as 1mm or 1,000,000.
      </FieldDescription>
    </Field>
  );
}

const emptySettlement: z.input<typeof settlementForm> = { face: null, security_id: "", settle: "" };

/** What a submit leaves on the form: a 422's errors on the fields they name, or, for a failure the fields cannot
 * hold, a form error, which fails the submit while the ErrorAlert says what it was. */
type SubmitErrors = string | { readonly fields: Record<string, readonly string[]> };

/** What `send` threw, or `null` once it succeeds. */
async function failureOf(send: () => Promise<unknown>): Promise<unknown> {
  try {
    await send();
    return null;
  } catch (error) {
    return error;
  }
}

function submitErrors(failure: unknown): SubmitErrors {
  const fields = errorsOnFields(failure);
  return fields === undefined ? "The settlement was not recorded." : { fields };
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
      <ErrorAlert error={errorsOnFields(error) === undefined ? error : null} />
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
        return failure === null ? undefined : submitErrors(failure);
      },
    },
  });
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
      <FieldGroup>
        <form.Field name={security.name}>
          {(field) => <TextField {...security} field={field} />}
        </form.Field>
        <form.Field name="face">{(field) => <FaceField field={field} />}</form.Field>
        <form.Field name={settle.name}>
          {(field) => <TextField {...settle} field={field} />}
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
