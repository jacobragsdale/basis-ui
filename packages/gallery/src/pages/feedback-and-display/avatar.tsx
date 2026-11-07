/* Avatar on the feedback and display page: a picture and initials at each size, a presence badge, and a group with a
 * count of the rest. The picture is a drawn silhouette, inline, so the gallery loads nothing from the network. */

import {
  Avatar,
  AvatarBadge,
  AvatarFallback,
  AvatarGroup,
  AvatarGroupCount,
  AvatarImage,
} from "@basis/ui";
import type { ReactElement } from "react";

import { Section } from "#pages/section.tsx";

const silhouette = `data:image/svg+xml,${encodeURIComponent(
  "<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 40 40'><rect width='40' height='40' fill='#3987e5'/><circle cx='20' cy='16' r='7' fill='#ffffff'/><rect x='8' y='26' width='24' height='16' rx='8' fill='#ffffff'/></svg>",
)}`;

const sizes = ["sm", "default", "lg"] as const;

function AvatarSection(): ReactElement {
  return (
    <Section
      title="Avatar"
      description="A person's picture, or their initials until it loads or if it fails: 24, 32 or 40 px."
    >
      <div className="flex flex-wrap items-center gap-6">
        {sizes.map((size) => (
          <div key={size} className="flex items-center gap-2">
            <Avatar size={size}>
              <AvatarImage src={silhouette} alt={`Dana Reyes, ${size}`} />
              <AvatarFallback>DR</AvatarFallback>
            </Avatar>
            <Avatar size={size}>
              <AvatarFallback>JK</AvatarFallback>
            </Avatar>
            <Avatar size={size}>
              <AvatarFallback>ML</AvatarFallback>
              <AvatarBadge />
            </Avatar>
          </div>
        ))}
      </div>
      <AvatarGroup>
        <Avatar>
          <AvatarImage src={silhouette} alt="Dana Reyes" />
          <AvatarFallback>DR</AvatarFallback>
        </Avatar>
        <Avatar>
          <AvatarFallback>JK</AvatarFallback>
        </Avatar>
        <Avatar>
          <AvatarFallback>ML</AvatarFallback>
        </Avatar>
        <AvatarGroupCount>+3</AvatarGroupCount>
      </AvatarGroup>
    </Section>
  );
}

export { AvatarSection };
