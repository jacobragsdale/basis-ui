/* Navigation Menu on the navigation and layout page: two triggers whose menus open in one popup, and a top-level
 * link drawn as a trigger. The page shows it closed, since an open popup hides the rest of the page from screen
 * readers; the tests open it. */

import {
  NavigationMenu,
  NavigationMenuContent,
  NavigationMenuIndicator,
  NavigationMenuItem,
  NavigationMenuLink,
  NavigationMenuList,
  NavigationMenuTrigger,
} from "@basis/ui";
import type { ReactElement } from "react";

import { Section } from "#pages/section.tsx";

const markets = [
  { description: "Treasuries, swaps and the curve", href: "#rates", title: "Rates" },
  { description: "Investment grade and high yield", href: "#credit", title: "Credit" },
  { description: "Agency and non-agency pools", href: "#mortgages", title: "Mortgages" },
  { description: "General obligation and revenue bonds", href: "#municipals", title: "Municipals" },
] as const;

const research = [
  { href: "#morning-note", title: "Morning note" },
  { href: "#supply-calendar", title: "Supply calendar" },
  { href: "#relative-value", title: "Relative value" },
] as const;

function MarketsMenu(): ReactElement {
  return (
    <ul className="grid w-md grid-cols-2 gap-1">
      {markets.map(({ description, href, title }) => (
        <li key={href}>
          <NavigationMenuLink href={href}>
            <div className="flex flex-col gap-1">
              <span className="font-medium">{title}</span>
              <span className="text-muted-foreground">{description}</span>
            </div>
          </NavigationMenuLink>
        </li>
      ))}
    </ul>
  );
}

function DeskNavigation(): ReactElement {
  return (
    <NavigationMenu aria-label="Desk">
      <NavigationMenuList>
        <NavigationMenuItem>
          <NavigationMenuTrigger>Markets</NavigationMenuTrigger>
          <NavigationMenuContent>
            <MarketsMenu />
          </NavigationMenuContent>
        </NavigationMenuItem>
        <NavigationMenuItem>
          <NavigationMenuTrigger>Research</NavigationMenuTrigger>
          <NavigationMenuContent>
            <ul className="flex w-56 flex-col gap-1">
              {research.map(({ href, title }) => (
                <li key={href}>
                  <NavigationMenuLink href={href}>{title}</NavigationMenuLink>
                </li>
              ))}
            </ul>
          </NavigationMenuContent>
          <NavigationMenuIndicator />
        </NavigationMenuItem>
        <NavigationMenuItem>
          <NavigationMenuLink variant="trigger" href="#calendar" active>
            Calendar
          </NavigationMenuLink>
        </NavigationMenuItem>
      </NavigationMenuList>
    </NavigationMenu>
  );
}

function NavigationMenuSection(): ReactElement {
  return (
    <Section
      title="Navigation Menu"
      description="Top-level links and menus in one row. The arrow keys move along it, Enter opens a menu and Escape closes it. A top-level link takes variant=trigger."
    >
      <DeskNavigation />
    </Section>
  );
}

export { DeskNavigation, NavigationMenuSection };
