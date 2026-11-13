/* The security a FormSecurityField shows for the identifier its form's field holds. The field holds an identifier,
 * such as a CUSIP, and the picker an item, so the field keeps the item last chosen while the identifier is still its,
 * and otherwise finds the item for the identifier through the app's own search, as an edit form opened on a CUSIP
 * must: none while the field is empty, as after `form.reset()`, and none while the identifier finds nothing. The
 * lookup goes through TanStack Query, as the picker's searches do. */

import { useQuery } from "@tanstack/react-query";
import { useId, useState } from "react";

import {
  parseSecurityIdentifier,
  securityIdentifierKinds,
} from "#securities/security-identifier.ts";
import type { SecurityIdentifierKind } from "#securities/security-identifier.ts";

import type { SecuritySearch } from "./security-picker-props.ts";

interface HeldOptions<TItem> {
  /** What the field holds: an identifier, or nothing while empty. */
  readonly value: string | null | undefined;
  readonly search: SecuritySearch<TItem>;
  readonly itemValue: (item: TItem) => string;
  readonly kinds: readonly SecurityIdentifierKind[] | undefined;
}

/** The item the picker shows for the field's identifier, and the choice that sets it. */
function useHeldSecurity<TItem>({ value, search, itemValue, kinds }: HeldOptions<TItem>): {
  readonly item: TItem | null;
  readonly choose: (item: TItem | null) => void;
} {
  const [chosen, setChosen] = useState<TItem | null>(null);
  const own = useId();
  const held = value ?? "";
  const ours = chosen !== null && itemValue(chosen) === held;
  const reading = parseSecurityIdentifier(held, kinds ?? securityIdentifierKinds);
  const found = useQuery({
    enabled: held !== "" && !ours && reading.ok,
    queryFn: async ({ signal }) => {
      if (!reading.ok) {
        return null;
      }
      const items = await search(reading.value, signal);
      return items.find((item) => itemValue(item) === held) ?? null;
    },
    queryKey: ["basis", "form-security-field", own, held],
  });
  const lookedUp = held === "" ? null : (found.data ?? null);
  return { choose: setChosen, item: ours ? chosen : lookedUp };
}

export { useHeldSecurity };
