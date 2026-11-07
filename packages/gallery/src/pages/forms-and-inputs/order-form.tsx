/* A small order ticket on TanStack Form, the form library the design picks: a Zod 4 schema checks each field as it
 * changes, and on submit a stand-in for the API answers with a 422 whose errors `fieldErrors` places on the fields
 * their JSON Pointers name. Each field passes `data-invalid` to Field, `aria-invalid` to its input, and its errors to
 * FieldError, which shows them in words. */

import {
  Button,
  Field,
  FieldDescription,
  FieldError,
  FieldGroup,
  FieldLabel,
  Input,
  fieldErrors,
} from "@basis/ui";
import type { ValidationProblem } from "@basis/ui";
import { useForm } from "@tanstack/react-form";
import { useState } from "react";
import type { ComponentProps, ReactElement } from "react";
import { z } from "zod";

import { Section } from "#pages/section.tsx";

const orderSchema = z.object({
  cusip: z.string().regex(/^[\dA-Z]{9}$/u, "A CUSIP is nine capital letters and digits."),
  quantity: z.string().regex(/^[1-9]\d*$/u, "Enter a whole number of bonds, above zero."),
  price: z.string().regex(/^\d+(?:\.\d+)?$/u, "Enter a price, such as 99.5."),
});

type Order = z.infer<typeof orderSchema>;

/** The bonds the stand-in API knows. */
const knownCusips = new Set(["912828XG0", "3137EAEP0"]);

/** A stand-in for the API, which answers a well-formed order for a bond it does not know with a 422 naming the field
 * by its JSON Pointer, as basis's contract will. */
async function placeOrder(order: Order): Promise<ValidationProblem | undefined> {
  await Promise.resolve();
  if (knownCusips.has(order.cusip)) {
    return undefined;
  }
  return {
    errors: [{ detail: "No bond with this CUSIP is on the desk's list.", pointer: "#/cusip" }],
    status: 422,
    title: "Unprocessable Content",
    type: "about:blank",
  };
}

interface TextFieldProps {
  readonly id: string;
  readonly label: string;
  readonly description: string;
  readonly value: string;
  /** The field's errors, as TanStack Form holds them: the schema's issues and the API's details. */
  readonly errors: NonNullable<ComponentProps<typeof FieldError>["errors"]>;
  readonly touched: boolean;
  readonly onChange: (value: string) => void;
  readonly onBlur: () => void;
}

/** One text field of the ticket, invalid once it has been touched and has an error. */
function TextField({
  id,
  label,
  description,
  value,
  errors,
  touched,
  onChange,
  onBlur,
}: TextFieldProps): ReactElement {
  const invalid = touched && errors.length > 0;
  return (
    <Field data-invalid={invalid}>
      <FieldLabel htmlFor={id}>{label}</FieldLabel>
      <Input
        id={id}
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

/** The ticket's fields, in order. */
const orderFields = [
  {
    description:
      "Try 912828XG0, which the desk knows, or any other nine characters, which the API rejects.",
    id: "order-cusip",
    label: "CUSIP",
    name: "cusip",
  },
  {
    description: "How many bonds, each of 1,000 par.",
    id: "order-quantity",
    label: "Quantity",
    name: "quantity",
  },
  { description: "Per 100 of par.", id: "order-price", label: "Price", name: "price" },
] as const;

/** The API's answer as form errors: each error on the field its pointer names, or none when the order is placed. */
async function apiErrors({
  value,
}: {
  readonly value: Order;
}): Promise<{ readonly fields: Record<string, readonly string[]> } | undefined> {
  const problem = await placeOrder(value);
  return problem === undefined ? undefined : { fields: Object.fromEntries(fieldErrors(problem)) };
}

const emptyOrder: Order = { cusip: "", price: "", quantity: "" };

function OrderForm(): ReactElement {
  const [placed, setPlaced] = useState<string>();
  const form = useForm({
    defaultValues: emptyOrder,
    onSubmit: ({ value }) => {
      setPlaced(`Placed: ${value.quantity} of ${value.cusip} at ${value.price}.`);
    },
    validators: { onChange: orderSchema, onSubmitAsync: apiErrors },
  });
  return (
    <form
      noValidate
      aria-label="Order ticket"
      className="flex max-w-md flex-col gap-4"
      onSubmit={(event) => {
        event.preventDefault();
        form.handleSubmit().catch(reportError);
      }}
    >
      <FieldGroup>
        {orderFields.map((spec) => (
          <form.Field key={spec.name} name={spec.name}>
            {(field) => (
              <TextField
                id={spec.id}
                label={spec.label}
                description={spec.description}
                value={field.state.value}
                errors={field.state.meta.errors}
                touched={field.state.meta.isTouched}
                onChange={field.handleChange}
                onBlur={field.handleBlur}
              />
            )}
          </form.Field>
        ))}
      </FieldGroup>
      <div className="flex items-center gap-4">
        <Button type="submit">Place order</Button>
        <output className="text-sm text-muted-foreground">{placed}</output>
      </div>
    </form>
  );
}

function OrderFormSection(): ReactElement {
  return (
    <Section
      title="A form on TanStack Form"
      description="Field with TanStack Form and a Zod 4 schema: each field shows the schema's errors once touched, and the API's 422 errors land on the fields they name."
    >
      <OrderForm />
    </Section>
  );
}

export { OrderFormSection };
