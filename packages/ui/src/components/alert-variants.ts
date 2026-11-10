/* Alert's classes, from shadcn's Base UI source (its base-nova style) with the theme's status variants added. They live
 * apart from alert.tsx because a component file exports only components; the package never exports them.
 *
 * shadcn lays an alert with an icon out as `grid-cols-[auto_1fr]`, an arbitrary value. Here the grid has no template:
 * the icon spans two rows in the first column and the title takes the second, so both columns are implicit `auto`
 * tracks, and `justify-start` keeps the icon's column at the icon's width while the text's column takes the rest. */

import { cva } from "#vendor/cva/cva.ts";

/** Alert's look. The status variants sit on their status's `-subtle` tint with the status colour as text, a pair the
 * theme holds to 5.5:1, and their description takes the status colour too, since muted text on a tint does not; show
 * the status with an icon as well as the colour. */
const alertVariants = cva(
  "group/alert relative grid w-full justify-start gap-0.5 rounded-lg border px-2.5 py-2 text-left text-sm has-data-[slot=alert-action]:relative has-data-[slot=alert-action]:pr-18 has-[>svg]:gap-x-2 *:[svg]:row-span-2 *:[svg]:translate-y-0.5 *:[svg]:text-current *:[svg:not([class*='size-'])]:size-4",
  {
    variants: {
      variant: {
        default: "bg-card text-card-foreground",
        success:
          "border-success-edge bg-success-subtle text-success *:data-[slot=alert-description]:text-success",
        warning:
          "border-warning-edge bg-warning-subtle text-warning *:data-[slot=alert-description]:text-warning",
        info: "border-info-edge bg-info-subtle text-info *:data-[slot=alert-description]:text-info",
        destructive:
          "border-destructive-edge bg-destructive-subtle text-destructive *:data-[slot=alert-description]:text-destructive",
      },
    },
    defaultVariants: {
      variant: "default",
    },
  },
);

export { alertVariants };
