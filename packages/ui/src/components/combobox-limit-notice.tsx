/* The line under a combobox's list past its cap: how many of the matches it shows, and to type to narrow them. */

import { Combobox as ComboboxPrimitive } from "@base-ui/react/combobox";
import { use } from "react";
import type { ReactElement } from "react";

import { ListLimit, limitNotice } from "./combobox-limit.ts";

/** The notice, or nothing while every match is drawn. It sits in ComboboxContent, inside the combobox's root. */
function ComboboxLimitNotice(): ReactElement | null {
  const limit = use(ListLimit);
  const notice = limitNotice(ComboboxPrimitive.useFilteredItems<unknown>().length, limit);
  return notice === undefined ? null : (
    <output
      data-slot="combobox-limit"
      className="border-t border-edge px-2 py-1.5 text-xs text-muted-foreground"
    >
      {notice}
    </output>
  );
}

export { ComboboxLimitNotice };
