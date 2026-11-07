/* A page of one view, and the link that opens it: its route's loader reads a shared link's layout from the address,
 * `?layout=…` as `encodeLayout` writes it, and opens the page's own view when there is none or it cannot be read. */

import { decodeLayout } from "@basis/parallax";
import type { LayoutInput } from "@basis/parallax";
import { z } from "zod";

import { isDemoDataset } from "#api/datasets.ts";
import type { DemoDataset } from "#api/datasets.ts";
import { needDatasets } from "#shell/datasets.ts";

/** A page of one view's address: a shared link's layout, if it has one. */
const viewSearch = z.object({ layout: z.string().optional() });

/** The view a page opens, the dataset it shows, and what the page says of where it came from. */
interface OpenedView {
  readonly layout: LayoutInput;
  readonly dataset: DemoDataset;
  readonly note: string;
}

function describe(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

/** The view a page opens: the link's, if it names a dataset the demo serves, or else the page's own. Either way its
 * dataset starts loading. */
async function openView(
  own: LayoutInput & { readonly dataset: DemoDataset },
  link: string | undefined,
): Promise<OpenedView> {
  let opened: OpenedView = { dataset: own.dataset, layout: own, note: "" };
  if (link !== undefined) {
    try {
      const layout = await decodeLayout(link);
      const dataset = layout.dataset ?? "";
      opened = isDemoDataset(dataset)
        ? { dataset, layout, note: "A view opened from a shared link." }
        : { ...opened, note: `The link's dataset, ${dataset}, is not one the demo serves.` };
    } catch (error: unknown) {
      opened = {
        ...opened,
        note: `The link's layout could not be read, so the page's own view is shown: ${describe(error)}`,
      };
    }
  }
  needDatasets(opened.dataset);
  return opened;
}

export { openView, viewSearch };
export type { OpenedView };
