/* TreeSelect: a node of a hierarchy chosen in a form, such as a book under its desk. A button shows the chosen node's
 * path, "Credit / Investment grade / Financials", and opens a popover holding the Tree, which opens on the chosen node
 * with the branches above it expanded; choosing a node closes it. It is drawn as a Select's trigger, with its sizes. */

import { Popover as PopoverPrimitive } from "@base-ui/react/popover";
import { cn } from "cn";
import { useId, useState } from "react";
import type { ComponentProps, ReactElement } from "react";

import type { VariantProps } from "#vendor/cva/cva.ts";
import { ChevronDownIcon } from "#vendor/lucide/chevron-down.tsx";

import { Popover, PopoverContent } from "./popover.tsx";
import { selectTriggerVariants as treeSelectVariants } from "./select-variants.ts";
import { Tree } from "./tree.tsx";
import { pathTo } from "./tree-model.ts";
import type { TreeNode } from "./tree-model.ts";

interface TreeSelectProps<TValue extends string>
  extends
    Omit<ComponentProps<"button">, "value" | "defaultValue" | "onChange" | "children" | "type">,
    VariantProps<typeof treeSelectVariants> {
  /** The tree's roots, each with its children. */
  readonly nodes: readonly TreeNode<TValue>[];
  /** The node chosen, or `null` for none, when the app controls it. */
  readonly value?: TValue | null | undefined;
  /** The node an uncontrolled select starts with; none unless set. */
  readonly defaultValue?: TValue | null | undefined;
  /** Called with the node's value each time one is chosen. */
  readonly onValueChange?: ((value: TValue) => void) | undefined;
  /** Which nodes can be chosen: any, the default, or only leaves. */
  readonly selectable?: "any" | "leaves" | undefined;
  /** The button's text while none is chosen; "Choose…" unless set. */
  readonly placeholder?: string | undefined;
  /** The name of the tree and its popover, such as "Books"; "Choose a node" unless set. */
  readonly pickerLabel?: string | undefined;
}

/** A node's path in words: each label from the root down, joined by slashes. */
function pathText<TValue extends string>(
  nodes: readonly TreeNode<TValue>[],
  value: TValue,
): string {
  return pathTo(nodes, value)
    .map((node) => node.label)
    .join(" / ");
}

/** The tree's focused row, which the popover focuses as it opens, or the popup itself if there is none. */
function focusedRowOf(treeId: string): HTMLElement | true {
  return document.querySelector<HTMLElement>(`#${CSS.escape(treeId)} [tabindex="0"]`) ?? true;
}

/** Whether the popover is open, the node chosen, the app's or the select's own, and choosing one, which closes it. */
function useTreeSelectState<TValue extends string>({
  value,
  defaultValue,
  onValueChange,
}: Pick<TreeSelectProps<TValue>, "value" | "defaultValue" | "onValueChange">): {
  readonly open: boolean;
  readonly setOpen: (open: boolean) => void;
  readonly chosen: TValue | null;
  readonly choose: (value: TValue) => void;
} {
  const [open, setOpen] = useState(false);
  const [own, setOwn] = useState<TValue | null>(defaultValue ?? null);
  return {
    choose: (next) => {
      setOwn(next);
      onValueChange?.(next);
      setOpen(false);
    },
    chosen: value === undefined ? own : value,
    open,
    setOpen,
  };
}

/** A select of a node in a hierarchy. Name it with a FieldLabel's `htmlFor` and this `id`, or with `aria-label`.
 *
 * @use For choosing a book, a strategy or an account under its parents in a form. For a tree shown on the page, use
 * Tree; for a flat list, Select or MultiSelect.
 * @see Tree, Select, Field, FieldLabel
 *
 * @example
 * ```tsx
 * import { Field, FieldLabel, TreeSelect } from "@basis/ui";
 *
 * const books = [
 *   { label: "Rates", value: "rates", children: [{ label: "Treasuries", value: "ust" }] },
 *   { label: "Credit", value: "credit", children: [{ label: "High yield", value: "hy" }] },
 * ];
 *
 * <Field>
 *   <FieldLabel htmlFor="book">Book</FieldLabel>
 *   <TreeSelect id="book" nodes={books} pickerLabel="Books" selectable="leaves" defaultValue="hy" />
 * </Field>;
 * ```
 */
function TreeSelect<TValue extends string>({
  nodes,
  value,
  defaultValue,
  onValueChange,
  selectable = "any",
  placeholder = "Choose…",
  pickerLabel = "Choose a node",
  size = "default",
  className,
  ...props
}: TreeSelectProps<TValue>): ReactElement {
  const { open, setOpen, chosen, choose } = useTreeSelectState({
    defaultValue,
    onValueChange,
    value,
  });
  const treeId = useId();
  return (
    <Popover open={open} modal="trap-focus" onOpenChange={setOpen}>
      <PopoverPrimitive.Trigger
        data-slot="tree-select"
        data-size={size}
        data-placeholder={chosen === null ? "" : undefined}
        className={cn(treeSelectVariants({ size }), className)}
        {...props}
      >
        <span className="truncate">{chosen === null ? placeholder : pathText(nodes, chosen)}</span>
        <ChevronDownIcon />
      </PopoverPrimitive.Trigger>
      <PopoverContent
        align="start"
        aria-label={pickerLabel}
        className="w-72"
        initialFocus={() => focusedRowOf(treeId)}
      >
        <Tree
          id={treeId}
          aria-label={pickerLabel}
          nodes={nodes}
          value={chosen}
          selectable={selectable}
          className="max-h-80"
          onValueChange={choose}
        />
      </PopoverContent>
    </Popover>
  );
}

export { TreeSelect };
export type { TreeSelectProps };
