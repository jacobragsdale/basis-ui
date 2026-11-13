/* The form fields' empty state, on TanStack Form with a Zod schema: a field the schema lets be left out says
 * `optional` and holds `undefined`, one it lets be null says `nullable` and holds `null`, so a form submitted with them
 * empty passes the schema and sends no `""`. */

import "#styles.css";

import {
  Button,
  FormAmountField,
  FormDateField,
  FormSelectField,
  FormTextField,
  amountSchema,
} from "@basis/ui";
import type { FormFieldApi } from "@basis/ui";
import { useForm } from "@tanstack/react-form";
import type { ReactElement } from "react";
import { describe, expect, test, vi } from "vite-plus/test";
import { page, userEvent } from "vite-plus/test/browser";
import { render } from "vitest-browser-react";
import { z } from "zod";

const noteSchema = z.object({
  book: z.enum(["rates", "credit"]).nullable(),
  matures: z.iso.date().optional(),
  memo: z.string().optional(),
  par: amountSchema().optional(),
  settles: z.iso.date().nullable(),
});

type Note = z.input<typeof noteSchema>;

/** A note whose every field may be left empty, its submits handed to `onSubmit` once the schema passes. */
function NoteForm({
  start,
  onSubmit,
}: {
  readonly start: Note;
  readonly onSubmit: (note: Note) => void;
}): ReactElement {
  const form = useForm({
    defaultValues: start,
    onSubmit: ({ value }) => {
      onSubmit(value);
    },
    validators: { onSubmit: noteSchema },
  });
  return (
    <form
      noValidate
      onSubmit={(event) => {
        event.preventDefault();
        form.handleSubmit().catch(reportError);
      }}
    >
      <form.Field name="memo">
        {(field) => <FormTextField field={field} label="Memo" optional />}
      </form.Field>
      <form.Field name="matures">
        {(field) => <FormDateField field={field} label="Matures" optional />}
      </form.Field>
      <form.Field name="settles">
        {(field) => <FormDateField field={field} label="Settles" nullable />}
      </form.Field>
      <form.Field name="book">
        {(field) => (
          <FormSelectField
            field={field}
            label="Book"
            nullable
            placeholder="No book"
            options={[
              { label: "Rates", value: "rates" },
              { label: "Credit", value: "credit" },
            ]}
          />
        )}
      </form.Field>
      <form.Field name="par">
        {(field) => <FormAmountField field={field} label="Par" optional />}
      </form.Field>
      <Button type="submit">Save</Button>
    </form>
  );
}

/** Empties each of the note's fields as a user does: each box cleared, and the book set back to none. */
async function emptyEveryField(): Promise<void> {
  await userEvent.clear(page.getByRole("textbox", { name: "Memo" }));
  await userEvent.clear(page.getByRole("textbox", { name: "Matures" }));
  await userEvent.clear(page.getByRole("textbox", { name: "Settles" }));
  await userEvent.clear(page.getByRole("textbox", { name: "Par" }));
  await userEvent.selectOptions(page.getByRole("combobox", { name: "Book" }), "No book");
}

const filled: Note = {
  book: "rates",
  matures: "2030-11-15",
  memo: "Roll",
  par: 5_000_000,
  settles: "2026-11-16",
};

describe("The form fields' empty state", () => {
  test("a form left empty submits no empty text: optional fields absent, nullable ones null", async () => {
    const onSubmit = vi.fn<(note: Note) => void>();
    await render(<NoteForm onSubmit={onSubmit} start={{ book: null, settles: null }} />);
    await userEvent.click(page.getByRole("button", { name: "Save" }));
    await expect.poll(() => onSubmit.mock.calls.length).toBe(1);
    expect(onSubmit.mock.calls[0]?.[0]).toStrictEqual({
      book: null,
      settles: null,
    });
  });

  test("an edit form emptied by the user submits each field's empty value", async () => {
    const onSubmit = vi.fn<(note: Note) => void>();
    await render(<NoteForm onSubmit={onSubmit} start={filled} />);
    await emptyEveryField();
    await userEvent.click(page.getByRole("button", { name: "Save" }));
    await expect.poll(() => onSubmit.mock.calls.length).toBe(1);
    const sent = onSubmit.mock.calls[0]?.[0];
    expect(sent).toStrictEqual({
      book: null,
      matures: undefined,
      memo: undefined,
      par: undefined,
      settles: null,
    });
    expect(noteSchema.safeParse(sent).success).toBe(true);
  });

  test("a field whose value may be undefined or null must say optional or nullable", () => {
    const meta = { errors: [], isTouched: false };
    const optional: FormFieldApi<string | undefined> = {
      handleBlur: vi.fn<() => void>(),
      handleChange: vi.fn<(value: string | undefined) => void>(),
      name: "memo",
      state: { meta, value: undefined },
    };
    const nullable: FormFieldApi<string | null> = {
      ...optional,
      handleChange: vi.fn<(value: string | null) => void>(),
      state: { meta, value: null },
    };
    const fields = [
      // @ts-expect-error -- a field that may hold `undefined` says `optional`.
      <FormTextField key="optional" field={optional} label="Memo" />,
      // @ts-expect-error -- a field that may hold `null` says `nullable`.
      <FormDateField key="nullable" field={nullable} label="Settles" />,
      <FormTextField key="said" field={optional} label="Memo" optional />,
    ];
    expect(fields).toHaveLength(3);
  });
});
