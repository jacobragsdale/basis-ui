/* Toast's classes. shadcn's Toast for Base UI stacks its toasts into a deck that fans out on hover, through transforms
 * computed from Base UI's CSS variables in arbitrary values, with half-second transitions. Here the viewport lists
 * them in a column instead, newest first, each in full, and a toast fades in and out over the theme's short
 * transition: no class leaves the theme's scales, and a CPU-drawn Citrix desktop repaints one toast, not a moving
 * deck. A toast past the provider's `limit` is hidden until one before it closes. They live apart from toast.tsx
 * because a component file exports only components; the package never exports them. */

import { cva } from "#vendor/cva/cva.ts";

/** A toast's look, which follows its `type`. The status variants sit on their status's `-subtle` tint with the status
 * colour as text, a pair the theme holds to 5.5:1, and each shows its status's icon as well as the colour. */
const toastVariants = cva(
  "group/toast pointer-events-auto relative w-full rounded-xl border shadow-md transition outline-none select-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 data-ending-style:opacity-0 data-limited:hidden data-starting-style:translate-y-2 data-starting-style:opacity-0",
  {
    variants: {
      variant: {
        default: "bg-popover text-popover-foreground",
        success:
          "border-success/30 bg-success-subtle text-success **:data-[slot=toast-description]:text-success",
        warning:
          "border-warning/30 bg-warning-subtle text-warning **:data-[slot=toast-description]:text-warning",
        info: "border-info/30 bg-info-subtle text-info **:data-[slot=toast-description]:text-info",
        destructive:
          "border-destructive/30 bg-destructive-subtle text-destructive **:data-[slot=toast-description]:text-destructive",
      },
    },
    defaultVariants: {
      variant: "default",
    },
  },
);

export { toastVariants };
