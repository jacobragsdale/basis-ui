/* Item on the navigation and layout page: each variant and size, each kind of media, an item that is a link, and a
 * group of items with separators, a header and a footer. */

import {
  Badge,
  Button,
  ChevronRightIcon,
  Item,
  ItemActions,
  ItemContent,
  ItemDescription,
  ItemFooter,
  ItemGroup,
  ItemHeader,
  ItemMedia,
  ItemSeparator,
  ItemTitle,
  UserIcon,
} from "@basis/ui";
import type { ComponentProps, ReactElement } from "react";

import { Section } from "#pages/section.tsx";

import { Demo } from "./demo.tsx";

const variants = ["default", "outline", "muted"] as const;
const sizes = ["default", "sm", "xs"] as const;

/** An account with an icon, a description and an action, in one variant and size. */
function AccountItem({
  variant,
  size,
}: {
  readonly variant: (typeof variants)[number];
  readonly size: (typeof sizes)[number];
}): ReactElement {
  return (
    <Item variant={variant} size={size}>
      <ItemMedia variant="icon">
        <UserIcon />
      </ItemMedia>
      <ItemContent>
        <ItemTitle>Pension fund A</ItemTitle>
        <ItemDescription>
          {variant}, size {size}
        </ItemDescription>
      </ItemContent>
      <ItemActions>
        <Button variant="outline" size="sm">
          Open
        </Button>
      </ItemActions>
    </Item>
  );
}

/** The first saved view as a link, which takes the item's props: a header, image media, its title and description,
 * an arrow and a footer. */
function MorningRisk(props: ComponentProps<"a">): ReactElement {
  return (
    <a href="#morning-risk" {...props}>
      <ItemHeader>
        <Badge variant="info">Shared</Badge>
      </ItemHeader>
      <ItemMedia variant="image">
        <span className="flex size-full items-center justify-center bg-muted text-xs font-medium">
          MR
        </span>
      </ItemMedia>
      <ItemContent>
        <ItemTitle>Morning risk</ItemTitle>
        <ItemDescription>DV01 by book, as of the open.</ItemDescription>
      </ItemContent>
      <ItemActions>
        <ChevronRightIcon className="size-4" />
      </ItemActions>
      <ItemFooter>
        <span className="text-xs text-muted-foreground">Updated at 07:30</span>
      </ItemFooter>
    </a>
  );
}

/** Saved views as links, split by a separator. An item's content sits in the element `render` names. */
function SavedViews(): ReactElement {
  return (
    <ItemGroup className="max-w-md">
      <Item variant="outline" render={<MorningRisk />} />
      <ItemSeparator />
      <Item
        variant="outline"
        render={
          <a href="#curve">
            <ItemMedia>
              <ChevronRightIcon className="size-4" />
            </ItemMedia>
            <ItemContent>
              <ItemTitle>Curve trades</ItemTitle>
            </ItemContent>
          </a>
        }
      />
    </ItemGroup>
  );
}

function ItemSection(): ReactElement {
  return (
    <Section
      title="Item"
      description="A row of media, a title and a description, and actions, for lists of things such as accounts or saved views. render makes the row a link."
    >
      <div className="grid items-start gap-4 lg:grid-cols-3">
        {variants.flatMap((variant) =>
          sizes.map((size) => (
            <AccountItem key={`${variant}-${size}`} variant={variant} size={size} />
          )),
        )}
      </div>
      <Demo label="links in a group, with separators, a header, a footer and image media">
        <SavedViews />
      </Demo>
    </Section>
  );
}

export { AccountItem, ItemSection, SavedViews };
