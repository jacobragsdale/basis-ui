/* The code `vp run new form` writes that is the same in every form: each kind of field's component from @basis/ui,
 * which binds it to TanStack Form, and how a submit's failure is caught for `submitErrors` to place. */

import type { FieldKind } from "./scaffold-fields.ts";

/** Each kind's form field from @basis/ui, and what else it needs from there. */
const widgets: Readonly<
  Record<FieldKind, { readonly component: string; readonly ui: readonly string[] }>
> = {
  boolean: { component: "FormCheckboxField", ui: [] },
  choice: { component: "FormSelectField", ui: [] },
  date: { component: "FormDateField", ui: [] },
  instant: { component: "FormTextField", ui: [] },
  number: { component: "FormAmountField", ui: ["amountSchema"] },
  text: { component: "FormTextField", ui: [] },
};

const failureLines = `/** What \`send\` threw, or \`null\` once it succeeds. */
async function failureOf(send: () => Promise<unknown>): Promise<unknown> {
  try {
    await send();
    return null;
  } catch (error) {
    return error;
  }
}`;

export { failureLines, widgets };
