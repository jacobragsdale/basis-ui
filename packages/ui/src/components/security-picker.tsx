/* SecurityPicker: an EntityPicker for securities named by their identifier. It reads the typed text as a CUSIP, an
 * ISIN or a SEDOL with `@basis/ui/securities`, by its length, and checks it, check digit and all, before it searches;
 * a text that is none of them is never sent, and the status line says why, such as `"91282CRF1" is not a CUSIP: its
 * check digit should be 0; look for a mistyped character.` The search receives the identifier with its kind, so it
 * can ask the API for the right one:
 *
 *   <SecurityPicker
 *     id="security"
 *     search={async (identifier, signal) => (await findSecurities({ [identifier.kind]: identifier.value }, { signal })).data}
 *     itemKey={(security) => security.cusip}
 *     itemLabel={(security) => security.description}
 *   /> */

import type { ReactElement } from "react";

import {
  parseSecurityIdentifier,
  securityIdentifierKinds,
} from "#securities/security-identifier.ts";
import type {
  SecurityIdentifier,
  SecurityIdentifierKind,
} from "#securities/security-identifier.ts";

import { EntityPicker } from "./entity-picker.tsx";
import type { MultipleEntityPickerProps, SingleEntityPickerProps } from "./entity-picker-props.ts";

/** Searches for the securities an identifier names; aborting `signal` cancels it. */
type SecuritySearch<TItem> = (
  identifier: SecurityIdentifier,
  signal: AbortSignal,
) => Promise<readonly TItem[]>;

/** What SecurityPicker takes in place of EntityPicker's `search` and `validate`. */
interface SecurityPickerOwnProps<TItem> {
  /** Finds the securities the checked identifier names. */
  readonly search: SecuritySearch<TItem>;
  /** The identifiers it takes; a CUSIP, an ISIN or a SEDOL unless set. */
  readonly kinds?: readonly SecurityIdentifierKind[] | undefined;
}

type SecurityPickerProps<TItem> =
  | (Omit<SingleEntityPickerProps<TItem>, "search" | "validate"> & SecurityPickerOwnProps<TItem>)
  | (Omit<MultipleEntityPickerProps<TItem>, "search" | "validate"> & SecurityPickerOwnProps<TItem>);

const lengths: Readonly<Record<SecurityIdentifierKind, number>> = { cusip: 9, isin: 12, sedol: 7 };
const names: Readonly<Record<SecurityIdentifierKind, string>> = {
  cusip: "a CUSIP",
  isin: "an ISIN",
  sedol: "a SEDOL",
};
const either = new Intl.ListFormat("en-US", { type: "disjunction" });

/** A picker that searches for securities by CUSIP, ISIN or SEDOL. It waits for as many characters as the shortest
 * identifier it takes has, saying which it takes, then checks each text before searching. */
function SecurityPicker<TItem>({
  search,
  kinds = securityIdentifierKinds,
  ...props
}: SecurityPickerProps<TItem>): ReactElement {
  const shortest = Math.min(...kinds.map((kind) => lengths[kind]));
  const picker = {
    hint: `Type ${either.format(kinds.map((kind) => names[kind]))}.`,
    minLength: shortest,
    placeholder: kinds.map((kind) => kind.toUpperCase()).join(", "),
    ...props,
    search: async (text: string, signal: AbortSignal): Promise<readonly TItem[]> => {
      const reading = parseSecurityIdentifier(text, kinds);
      return reading.ok ? search(reading.value, signal) : [];
    },
    validate: (text: string): string | undefined => {
      const reading = parseSecurityIdentifier(text, kinds);
      return reading.ok ? undefined : reading.reason;
    },
  };
  return <EntityPicker {...picker} />;
}

export { SecurityPicker };
export type { SecurityPickerProps, SecuritySearch };
