/* SecurityPicker choosing several securities, as chips, which also takes a list of identifiers pasted at once: every
 * security the list finds is added, and the status line under the picker says how many, and why each identifier that
 * added none did not (security-paste.ts). It holds what is chosen, unless the app controls it, so a paste can add to
 * it. */

import { useQueryClient } from "@tanstack/react-query";
import { useEffect, useId, useRef, useState } from "react";
import type { ClipboardEvent, ReactElement } from "react";

import { securityIdentifierKinds } from "#securities/security-identifier.ts";

import { EntityPicker } from "./entity-picker.tsx";
import type { MultipleEntityPickerProps } from "./entity-picker-props.ts";
import { idList } from "./field-state.ts";
import { identifiersIn, lookUpPasted, pasteSummary } from "./security-paste.ts";
import { securityLookup } from "./security-picker-props.ts";
import type { SecurityPickerOwnProps, SecuritySearch } from "./security-picker-props.ts";

type MultipleSecurityPickerProps<TItem> = Omit<
  MultipleEntityPickerProps<TItem>,
  "search" | "validate"
> &
  SecurityPickerOwnProps<TItem>;

/** The securities chosen, the app's or the picker's own, and a change to them, which the app hears. */
function useChosen<TItem>({
  value,
  defaultValue,
  onValueChange,
}: Pick<MultipleSecurityPickerProps<TItem>, "value" | "defaultValue" | "onValueChange">): readonly [
  readonly TItem[],
  (next: readonly TItem[]) => void,
] {
  const [own, setOwn] = useState<readonly TItem[]>(defaultValue ?? []);
  const chosen = value ?? own;
  const change = (next: readonly TItem[]): void => {
    setOwn(next);
    onValueChange?.(next);
  };
  return [chosen, change];
}

/** The app's search, through the query client, as the picker's own searches go, so a paste's searches retry and
 * report a sign-in problem by the shell's rules. Each goes by the identifier, under a key of this picker's own. */
function useQueriedSearch<TItem>(search: SecuritySearch<TItem>): SecuritySearch<TItem> {
  const client = useQueryClient();
  const own = useId();
  return async (identifier, signal) =>
    client.query({
      queryFn: async ({ signal: queried }) =>
        search(identifier, AbortSignal.any([queried, signal])),
      queryKey: ["basis", "security-paste", own, identifier.kind, identifier.value],
    });
}

/** `value` as of the last render, for an async step that ends after it: what is chosen as a lookup ends, which chips
 * removed or added while it ran have changed. */
function useLatest<TValue>(value: TValue): { readonly current: TValue } {
  const latest = useRef(value);
  useEffect(() => {
    latest.current = value;
  });
  return latest;
}

/** The lookup running, if any, which is aborted, changing nothing, when the picker goes. */
function usePendingLookup(): { current: AbortController | null } {
  const pending = useRef<AbortController | null>(null);
  useEffect(
    () => (): void => {
      pending.current?.abort();
    },
    [],
  );
  return pending;
}

/** Aborts the lookup still running, if any, and starts the next one's controller in its place. */
function replaceLookup(pending: { current: AbortController | null }): AbortController {
  pending.current?.abort();
  const controller = new AbortController();
  pending.current = controller;
  return controller;
}

/** A paste of several identifiers: looked up, its securities added after those chosen, each once, and its summary
 * said. A paste of one word is typed as usual. */
function usePaste<TItem>(
  props: MultipleSecurityPickerProps<TItem>,
  {
    chosen,
    change,
  }: { readonly chosen: readonly TItem[]; readonly change: (next: readonly TItem[]) => void },
): {
  readonly summary: string;
  readonly handlePaste: (event: ClipboardEvent<HTMLInputElement>) => void;
} {
  const [summary, setSummary] = useState("");
  const pending = usePendingLookup();
  const latest = useLatest(chosen);
  const search = useQueriedSearch(props.search);
  const handlePaste = (event: ClipboardEvent<HTMLInputElement>): void => {
    const words = identifiersIn(event.clipboardData.getData("text"));
    if (words.length < 2) {
      return;
    }
    event.preventDefault();
    const controller = replaceLookup(pending);
    setSummary(`Looking up ${String(words.length)} identifiers…`);
    const { itemKey, kinds = securityIdentifierKinds } = props;
    const run = async (): Promise<void> => {
      try {
        const result = await lookUpPasted({
          itemKey,
          kinds,
          search,
          signal: controller.signal,
          words,
        });
        if (controller.signal.aborted) {
          return;
        }
        const now = latest.current;
        const have = new Set(now.map((item) => itemKey(item)));
        const added = result.found.filter((item) => !have.has(itemKey(item)));
        change([...now, ...added]);
        setSummary(pasteSummary(added.length, result));
      } catch (error) {
        setSummary(controller.signal.aborted ? "" : `The lookup failed: ${String(error)}`);
      }
    };
    run().catch(reportError);
  };
  return { handlePaste, summary };
}

/** The picker of several securities, with its status line for a paste. */
function MultipleSecurityPicker<TItem>(props: MultipleSecurityPickerProps<TItem>): ReactElement {
  const [chosen, change] = useChosen(props);
  const paste = usePaste(props, { change, chosen });
  const statusId = useId();
  const {
    search,
    kinds,
    value: _value,
    defaultValue: _defaultValue,
    onValueChange: _onValueChange,
    ...rest
  } = props;
  const { defaults, lookup } = securityLookup({ kinds, search });
  return (
    <div className="flex min-w-0 flex-col gap-1">
      <EntityPicker
        {...defaults}
        hint={defaults.hint.replace(/\.$/u, ", or paste a list.")}
        {...rest}
        {...lookup}
        multiple
        value={chosen}
        onValueChange={change}
        onPaste={paste.handlePaste}
        aria-describedby={idList(statusId, props["aria-describedby"])}
      />
      <output id={statusId} className="text-xs text-muted-foreground">
        {paste.summary}
      </output>
    </div>
  );
}

export { MultipleSecurityPicker };
