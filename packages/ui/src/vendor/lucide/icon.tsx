/**
 * @license lucide-react 1.70.0, ISC. Copyright (c) 2026 Lucide Icons and Contributors. The icons lucide took from
 * Feather are MIT, copyright (c) 2013-present Cole Bemis. Both licenses are in src/vendor/lucide/LICENSE, beside this
 * file.
 *
 * The base every icon in this folder renders through, copied from the npm package lucide-react@1.70.0
 * (dist/esm/Icon.mjs and dist/esm/shared/src/build/defaultAttributes.mjs; source at
 * https://github.com/lucide-icons/lucide) and changed by basis-ui. An icon is a 24-unit SVG drawn with a stroke in the
 * current text colour, and hidden from assistive technology unless an `aria-*` prop or `role` names it, as in lucide.
 * Its stroke is 1.75 units where lucide's is 2, which reads heavier than Inter's regular weight beside it at 12 to 16
 * pixels. Unlike lucide, it takes no `size`, `color`, `strokeWidth` or `absoluteStrokeWidth`, and no context sets
 * them: the component an icon sits in sizes it, and its colour is the text's. It adds no `lucide` classes, takes no
 * children, since each icon brings its own shapes, and no `title`, which React's SVG props lack.
 */

import type { ComponentProps, ReactElement, ReactNode } from "react";

/** An icon's props: an `<svg>` element's, less those that would change how it looks. An app places an icon with
 * `className` and names it with `aria-label` when it stands alone; its colour follows the text around it. */
type IconProps = Omit<
  ComponentProps<"svg">,
  | "children"
  | "color"
  | "fill"
  | "stroke"
  | "strokeLinecap"
  | "strokeLinejoin"
  | "strokeWidth"
  | "viewBox"
  | "xmlns"
>;

/** lucide's canvas: every icon is drawn on a 24 by 24 grid, and renders 24 px square unless something sizes it. */
const canvas = 24;
const stroke = 1.75;

/** Whether the props name the icon for assistive technology, as lucide-react's `hasA11yProp` decides. */
function isNamed(props: IconProps): boolean {
  return Object.keys(props).some((name) => name.startsWith("aria-") || name === "role");
}

/** An icon: its shapes, lucide's, inside an SVG with lucide's attributes. */
function Icon({ children, ...props }: IconProps & { readonly children: ReactNode }): ReactElement {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      width={canvas}
      height={canvas}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={stroke}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden={isNamed(props) ? undefined : true}
      {...props}
    >
      {children}
    </svg>
  );
}

export { Icon };
export type { IconProps };
