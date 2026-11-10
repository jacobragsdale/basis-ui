/* Badge's classes, from shadcn's Base UI source with its `dark:` classes and arbitrary values replaced by the theme's
 * tokens and scales, and with the theme's status variants added. They live apart from badge.ts so that another
 * component can draw with them, since a component file exports only components; the package never exports them. */

import { cva } from "#vendor/cva/cva.ts";

/** Badge's look. The status variants sit on their status's `-subtle` tint, with the status colour as text, a pair the
 * theme holds to 5.5:1; show the status with an icon or a word as well as the colour. */
const badgeVariants = cva(
  "group/badge inline-flex h-5 w-fit shrink-0 items-center justify-center gap-1 overflow-hidden rounded-pill border border-transparent px-2 py-0.5 text-xs font-medium whitespace-nowrap transition-colors focus-visible:border-ring focus-visible:outline-solid focus-visible:outline focus-visible:outline-offset-(--focus-offset) focus-visible:outline-ring has-data-[icon=inline-end]:pr-1.5 has-data-[icon=inline-start]:pl-1.5 aria-invalid:border-destructive aria-invalid:outline-destructive [&>svg]:pointer-events-none [&>svg]:size-3!",
  {
    variants: {
      variant: {
        default:
          "bg-primary text-primary-foreground [a]:hover:bg-primary-hover [a]:active:bg-primary-active",
        secondary:
          "bg-secondary text-secondary-foreground [a]:hover:bg-secondary-hover [a]:active:bg-secondary-active",
        outline: "border-border text-foreground [a]:hover:bg-muted [a]:hover:text-muted-foreground",
        ghost: "hover:bg-muted hover:text-muted-foreground",
        link: "text-primary underline-offset-4 hover:underline",
        success:
          "bg-success-subtle text-success [a]:hover:bg-success-subtle-hover [a]:active:bg-success-subtle",
        warning:
          "bg-warning-subtle text-warning [a]:hover:bg-warning-subtle-hover [a]:active:bg-warning-subtle",
        info: "bg-info-subtle text-info [a]:hover:bg-info-subtle-hover [a]:active:bg-info-subtle",
        destructive:
          "bg-destructive-subtle text-destructive focus-visible:outline-destructive [a]:hover:bg-destructive-subtle-hover [a]:active:bg-destructive-subtle",
      },
    },
    defaultVariants: {
      variant: "default",
    },
  },
);

export { badgeVariants };
