/* The popover a header's menu opens in, below the header it belongs to: a list column's menu, or a pivot measure's,
 * which the pivot gives the grid. Escape, a press outside it or a choice that ends its work closes it, and the grid's
 * focus comes back. */

import { Popover, PopoverContent, PopoverTrigger } from "@basis/ui";
import type { ReactNode, RefObject } from "react";

import type { ViewHandle } from "#engine/view.ts";
import type { Layout } from "#layout/layout.ts";

import type { GridController } from "./controller.ts";
import type { SourceField } from "./fields.ts";
import { HeaderMenu } from "./header-menu.tsx";
import { measureName } from "./labels.ts";
import type { OpenMenu } from "./types.ts";
import type { ValueSource } from "./value-picker.tsx";

/** What a pivot's measure menu is given. */
interface MeasureMenuProps {
  readonly layout: Layout;
  /** The measure the header shows, by its index in the layout's measures. */
  readonly measure: number;
  readonly fields: readonly SourceField[];
  readonly onChange: (layout: Layout) => void;
  /** Closes the menu, once a choice ends its work. */
  readonly onDone: () => void;
}

interface GridMenuProps {
  readonly controller: GridController;
  readonly menu: OpenMenu | null;
  readonly layout: Layout | null;
  readonly fields: readonly SourceField[];
  readonly handle: ViewHandle | null;
  /** The element the controller places over the header whose menu opens. */
  readonly anchorRef: RefObject<HTMLSpanElement | null>;
  /** The grid's scroll, which takes the focus back when the menu closes. */
  readonly scrollRef: RefObject<HTMLDivElement | null>;
  readonly onChange: (layout: Layout) => void;
  readonly measureMenu: ((props: MeasureMenuProps) => ReactNode) | undefined;
  /** Why the grid shows no rows, or the engine refused the latest change, which a filter's box shows beside it. */
  readonly error: string | null;
}

/** What the open menu shows. */
function MenuBody({
  controller,
  menu,
  layout,
  fields,
  handle,
  onChange,
  measureMenu,
  error,
}: Omit<GridMenuProps, "anchorRef" | "scrollRef"> & {
  readonly menu: OpenMenu;
  readonly layout: Layout;
}): ReactNode {
  const done = (): void => {
    controller.closeMenu();
  };
  if (menu.measure !== null) {
    return measureMenu?.({ fields, layout, measure: menu.measure, onChange, onDone: done }) ?? null;
  }
  const source: ValueSource = async (column, search, limit) => {
    if (handle === null) {
      throw new Error("the view is not open yet");
    }
    return handle.distinctValues(column, search, limit);
  };
  return (
    <HeaderMenu
      layout={layout}
      column={menu.name}
      fields={fields}
      source={source}
      error={error}
      onChange={onChange}
      onFit={() => {
        controller.fitColumn(menu.column);
      }}
      onDone={done}
    />
  );
}

/** The header menu's popover. */
function GridMenu(props: GridMenuProps): ReactNode {
  const { controller, menu, layout, anchorRef, scrollRef } = props;
  const title = menu === null || layout === null ? "" : (layout.titles[menu.name] ?? menu.name);
  const measure = menu?.measure === null ? undefined : layout?.measures[menu?.measure ?? -1];
  return (
    <Popover
      open={menu !== null && layout !== null}
      onOpenChange={(open) => {
        if (!open) {
          controller.closeMenu();
        }
      }}
    >
      <PopoverTrigger
        nativeButton={false}
        tabIndex={-1}
        aria-hidden
        render={
          <span
            ref={anchorRef}
            data-slot="grid-menu-anchor"
            className="pointer-events-none absolute"
          />
        }
      />
      <PopoverContent
        align="end"
        aria-label={
          menu?.measure === null
            ? `Column ${title}`
            : `Value ${measure === undefined ? "" : measureName(measure)}`.trim()
        }
        finalFocus={scrollRef}
        className="w-72"
      >
        {menu === null || layout === null ? null : (
          <MenuBody {...props} menu={menu} layout={layout} />
        )}
      </PopoverContent>
    </Popover>
  );
}

export { GridMenu };
export type { MeasureMenuProps };
