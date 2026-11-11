/* SecurityPicker's props and what both its forms share: the identifiers it takes, its hint and placeholder from them,
 * and the search and validation that read the typed text with `@basis/ui/securities` before anything is sent. */

import {
  parseSecurityIdentifier,
  securityIdentifierKinds,
} from "#securities/security-identifier.ts";
import type {
  SecurityIdentifier,
  SecurityIdentifierKind,
} from "#securities/security-identifier.ts";

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

/** What a security picker gives EntityPicker: its hint, fewest characters and placeholder from the kinds it takes,
 * each of which the app's props may replace, and its search and validation through `parseSecurityIdentifier`. */
function securityLookup<TItem>({
  search,
  kinds = securityIdentifierKinds,
}: SecurityPickerOwnProps<TItem>): {
  readonly defaults: {
    readonly hint: string;
    readonly minLength: number;
    readonly placeholder: string;
  };
  readonly lookup: {
    readonly search: (text: string, signal: AbortSignal) => Promise<readonly TItem[]>;
    readonly validate: (text: string) => string | undefined;
  };
} {
  return {
    defaults: {
      hint: `Type ${either.format(kinds.map((kind) => names[kind]))}.`,
      minLength: Math.min(...kinds.map((kind) => lengths[kind])),
      placeholder: kinds.map((kind) => kind.toUpperCase()).join(", "),
    },
    lookup: {
      search: async (text, signal) => {
        const reading = parseSecurityIdentifier(text, kinds);
        return reading.ok ? search(reading.value, signal) : [];
      },
      validate: (text) => {
        const reading = parseSecurityIdentifier(text, kinds);
        return reading.ok ? undefined : reading.reason;
      },
    },
  };
}

export { securityLookup };
export type { SecurityPickerOwnProps, SecurityPickerProps, SecuritySearch };
