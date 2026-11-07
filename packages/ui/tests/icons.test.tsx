/* The icons copied from lucide: each renders lucide's SVG, under each name lucide gives it. The gallery's tests check
 * how they look on a page. */

import { renderToStaticMarkup } from "react-dom/server";
import type { ComponentType } from "react";
import { describe, expect, test } from "vite-plus/test";

import {
  AlertTriangleIcon,
  CheckIcon,
  CircleAlertIcon,
  CircleExclamationPointIcon,
  EllipsisIcon,
  Loader2Icon,
  LoaderCircleIcon,
  MoreHorizontalIcon,
  Trash2Icon,
  TrashIcon,
  TriangleAlertIcon,
  TriangleExclamationPointIcon,
} from "#index.ts";
import type { IconProps } from "#index.ts";

// The attributes lucide-react 1.70.0 gives every icon, in its order, then `aria-hidden` for an unnamed one.
const svgOpening =
  '<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">';

/** Whether an export is a component, as every `*Icon` export should be. */
function isComponent(value: unknown): value is ComponentType<IconProps> {
  return typeof value === "function";
}

/** Every `*Icon` export of the package's root, by name. */
async function exportedIcons(): Promise<[string, ComponentType<IconProps>][]> {
  const exports: Record<string, unknown> = await import("#index.ts");
  return Object.entries(exports).flatMap(([name, value]) =>
    name.endsWith("Icon") && isComponent(value) ? [[name, value]] : [],
  );
}

describe("the icons", () => {
  test("each is lucide's SVG around at least one of its shapes", async () => {
    const icons = await exportedIcons();
    expect(icons.length).toBeGreaterThan(50);
    for (const [name, Glyph] of icons) {
      const markup = renderToStaticMarkup(<Glyph />);
      expect(markup.startsWith(svgOpening), name).toBe(true);
      expect(markup, name).toMatch(/<(?<shape>path|circle|rect|line) [^>]+><\/\k<shape>>/u);
      expect(markup.endsWith("</svg>"), name).toBe(true);
    }
  });

  test("an icon draws lucide's shapes", () => {
    expect(renderToStaticMarkup(<CheckIcon />)).toBe(
      `${svgOpening}<path d="M20 6 9 17l-5-5"></path></svg>`,
    );
  });

  test("each older lucide name is the icon under its current name", () => {
    expect(TriangleAlertIcon).toBe(TriangleExclamationPointIcon);
    expect(AlertTriangleIcon).toBe(TriangleExclamationPointIcon);
    expect(CircleAlertIcon).toBe(CircleExclamationPointIcon);
    expect(MoreHorizontalIcon).toBe(EllipsisIcon);
    expect(Loader2Icon).toBe(LoaderCircleIcon);
    expect(Trash2Icon).toBe(TrashIcon);
  });

  test("passes its props to the SVG, after lucide's attributes", () => {
    const markup = renderToStaticMarkup(
      <CheckIcon className="size-3" data-icon="inline-start" width={16} />,
    );
    expect(markup).toContain('width="16"');
    expect(markup).toContain('class="size-3"');
    expect(markup).toContain('data-icon="inline-start"');
  });

  const names: readonly (readonly [string, IconProps])[] = [
    ["aria-label", { "aria-label": "Done" }],
    ["role", { role: "img" }],
  ];

  test.each(names)(
    "is hidden from assistive technology unless it is named, here by %s",
    (_prop, props) => {
      expect(renderToStaticMarkup(<CheckIcon {...props} />)).not.toContain("aria-hidden");
    },
  );
});
