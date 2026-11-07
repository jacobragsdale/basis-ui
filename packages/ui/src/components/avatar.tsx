/* Avatar and its parts, from shadcn's Base UI source (its base-nova style), on Base UI's Avatar, which shows the image
 * once it loads and the fallback until then or if it fails. shadcn rings the avatar with a border blended into the
 * image, `mix-blend-darken` in light mode and `dark:mix-blend-lighten` in dark; here the ring is `foreground` at 10%,
 * as Card's is, which darkens in light mode and lightens in dark with no `dark:` class and no blending. */

import { Avatar as AvatarPrimitive } from "@base-ui/react/avatar";
import { cn } from "cn";
import type { ComponentProps, ReactElement } from "react";

/** A person's picture or initials in a circle: 32 px, or 24 px at `size="sm"` and 40 px at `size="lg"`. */
function Avatar({
  className,
  size = "default",
  ...props
}: AvatarPrimitive.Root.Props & { readonly size?: "default" | "sm" | "lg" }): ReactElement {
  return (
    <AvatarPrimitive.Root
      data-slot="avatar"
      data-size={size}
      className={cn(
        "group/avatar relative flex size-8 shrink-0 rounded-full select-none after:absolute after:inset-0 after:rounded-full after:border after:border-foreground/10 data-[size=lg]:size-10 data-[size=sm]:size-6",
        className,
      )}
      {...props}
    />
  );
}

/** The picture, shown once it has loaded. Its `alt` names the person. */
function AvatarImage({ className, ...props }: AvatarPrimitive.Image.Props): ReactElement {
  return (
    <AvatarPrimitive.Image
      data-slot="avatar-image"
      className={cn("aspect-square size-full rounded-full object-cover", className)}
      {...props}
    />
  );
}

/** What shows until the picture loads, or in its place: usually the person's initials. */
function AvatarFallback({ className, ...props }: AvatarPrimitive.Fallback.Props): ReactElement {
  return (
    <AvatarPrimitive.Fallback
      data-slot="avatar-fallback"
      className={cn(
        "flex size-full items-center justify-center rounded-full bg-muted text-sm text-muted-foreground group-data-[size=sm]/avatar:text-xs",
        className,
      )}
      {...props}
    />
  );
}

/** A dot at the avatar's bottom right, such as a presence indicator; an icon inside it shows from the default size. */
function AvatarBadge({ className, ...props }: ComponentProps<"span">): ReactElement {
  return (
    <span
      data-slot="avatar-badge"
      className={cn(
        "absolute right-0 bottom-0 z-10 inline-flex items-center justify-center rounded-full bg-primary text-primary-foreground bg-blend-color ring-2 ring-background select-none",
        "group-data-[size=sm]/avatar:size-2 group-data-[size=sm]/avatar:[&>svg]:hidden",
        "group-data-[size=default]/avatar:size-2.5 group-data-[size=default]/avatar:[&>svg]:size-2",
        "group-data-[size=lg]/avatar:size-3 group-data-[size=lg]/avatar:[&>svg]:size-2",
        className,
      )}
      {...props}
    />
  );
}

/** Avatars overlapping in a row, each ringed in the background colour. */
function AvatarGroup({ className, ...props }: ComponentProps<"div">): ReactElement {
  return (
    <div
      data-slot="avatar-group"
      className={cn(
        "group/avatar-group flex -space-x-2 *:data-[slot=avatar]:ring-2 *:data-[slot=avatar]:ring-background",
        className,
      )}
      {...props}
    />
  );
}

/** The count of avatars a group leaves out, such as "+3", at the size of the group's avatars. */
function AvatarGroupCount({ className, ...props }: ComponentProps<"div">): ReactElement {
  return (
    <div
      data-slot="avatar-group-count"
      className={cn(
        "relative flex size-8 shrink-0 items-center justify-center rounded-full bg-muted text-sm text-muted-foreground ring-2 ring-background group-has-data-[size=lg]/avatar-group:size-10 group-has-data-[size=sm]/avatar-group:size-6 [&>svg]:size-4 group-has-data-[size=lg]/avatar-group:[&>svg]:size-5 group-has-data-[size=sm]/avatar-group:[&>svg]:size-3",
        className,
      )}
      {...props}
    />
  );
}

export { Avatar, AvatarBadge, AvatarFallback, AvatarGroup, AvatarGroupCount, AvatarImage };
