/* Button's classes, from shadcn's Base UI source with its `dark:` classes and arbitrary values replaced by the theme's
 * tokens and scales. They live apart from button.tsx because ButtonLink draws with them too, and a component file
 * exports only components (`react/only-export-components`). @basis/ui's own components import them; the package
 * never exports them, so no app can style a plain element as a button past `shadcn/no-restyle`. */

import { cva } from "#vendor/cva/cva.ts";

/** Button's look (`variant`) and height (`size`). Each size takes the theme's control lengths for its density, in whole
 * pixels; `xs` and `sm` also carry `min-h-target` and `min-w-target`, so a button stays at least 24 px across, WCAG
 * 2.2's minimum target size, whatever a theme sets. */
const buttonVariants = cva(
  "group/button inline-flex shrink-0 items-center justify-center rounded-lg border border-transparent bg-clip-padding text-sm font-medium whitespace-nowrap transition-colors outline-none select-none focus-visible:border-ring focus-visible:outline-solid focus-visible:outline focus-visible:outline-offset-(--focus-offset) focus-visible:outline-ring active:not-aria-[haspopup]:translate-y-px disabled:pointer-events-none disabled:opacity-disabled aria-invalid:border-destructive aria-invalid:outline-destructive [&_svg]:pointer-events-none [&_svg]:shrink-0",
  {
    variants: {
      variant: {
        default:
          "bg-primary text-primary-foreground hover:bg-primary-hover active:bg-primary-active",
        outline:
          "border-border bg-background hover:bg-muted hover:text-foreground aria-expanded:bg-muted aria-expanded:text-foreground",
        secondary:
          "bg-secondary text-secondary-foreground hover:bg-secondary-hover active:bg-secondary-active aria-expanded:bg-secondary aria-expanded:text-secondary-foreground",
        ghost:
          "hover:bg-muted hover:text-foreground aria-expanded:bg-muted aria-expanded:text-foreground",
        destructive:
          "bg-destructive-subtle text-destructive hover:bg-destructive-subtle-hover active:bg-destructive-subtle focus-visible:border-destructive focus-visible:outline-destructive",
        link: "text-primary underline-offset-4 hover:underline",
      },
      size: {
        default:
          "h-(--control-md-height) gap-(--control-md-gap) px-(--control-md-inset) has-data-[icon=inline-end]:pr-(--control-md-inset-icon) has-data-[icon=inline-start]:pl-(--control-md-inset-icon) [&_svg:not([class*='size-'])]:size-(--control-md-icon)",
        xs: "h-(--control-xs-height) min-h-target min-w-target gap-(--control-xs-gap) rounded-md px-(--control-xs-inset) text-xs in-data-[slot=button-group]:rounded-lg has-data-[icon=inline-end]:pr-(--control-xs-inset-icon) has-data-[icon=inline-start]:pl-(--control-xs-inset-icon) [&_svg:not([class*='size-'])]:size-(--control-xs-icon)",
        sm: "h-(--control-sm-height) min-h-target min-w-target gap-(--control-sm-gap) rounded-md px-(--control-sm-inset) text-xs in-data-[slot=button-group]:rounded-lg has-data-[icon=inline-end]:pr-(--control-sm-inset-icon) has-data-[icon=inline-start]:pl-(--control-sm-inset-icon) [&_svg:not([class*='size-'])]:size-(--control-sm-icon)",
        lg: "h-(--control-lg-height) gap-(--control-lg-gap) px-(--control-lg-inset) has-data-[icon=inline-end]:pr-(--control-lg-inset-icon) has-data-[icon=inline-start]:pl-(--control-lg-inset-icon) [&_svg:not([class*='size-'])]:size-(--control-lg-icon)",
        icon: "size-(--control-md-height) [&_svg:not([class*='size-'])]:size-(--control-md-icon)",
        "icon-xs":
          "size-(--control-xs-height) min-h-target min-w-target rounded-md in-data-[slot=button-group]:rounded-lg [&_svg:not([class*='size-'])]:size-(--control-xs-icon)",
        "icon-sm":
          "size-(--control-sm-height) min-h-target min-w-target rounded-md in-data-[slot=button-group]:rounded-lg [&_svg:not([class*='size-'])]:size-(--control-md-icon)",
        "icon-lg":
          "size-(--control-lg-height) [&_svg:not([class*='size-'])]:size-(--control-lg-icon)",
      },
    },
    defaultVariants: {
      variant: "default",
      size: "default",
    },
  },
);

export { buttonVariants };
