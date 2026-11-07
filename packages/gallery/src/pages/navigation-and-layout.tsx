/* The navigation and layout family, in the design's order: Sidebar, Navigation Menu, Tabs, Breadcrumb, Pagination,
 * Accordion, Collapsible, Resizable, Scroll Area, Separator, Aspect Ratio, Card and Item, each in its section's module
 * under navigation-and-layout/ with its tests beside it. Menus and sheets are shown closed, since an open popup hides
 * the rest of the page from screen readers; the tests open them. */

import type { ReactElement } from "react";

import { CardSection } from "./navigation-and-layout/card.tsx";
import { AccordionSection, CollapsibleSection } from "./navigation-and-layout/disclosure.tsx";
import { ItemSection } from "./navigation-and-layout/item.tsx";
import {
  AspectRatioSection,
  ScrollAreaSection,
  SeparatorSection,
} from "./navigation-and-layout/layout.tsx";
import { BreadcrumbSection, PaginationSection } from "./navigation-and-layout/links.tsx";
import { NavigationMenuSection } from "./navigation-and-layout/navigation-menu.tsx";
import { ResizableSection } from "./navigation-and-layout/resizable.tsx";
import { SidebarSection } from "./navigation-and-layout/sidebar.tsx";
import { TabsSection } from "./navigation-and-layout/tabs.tsx";

function NavigationAndLayout(): ReactElement {
  return (
    <>
      <SidebarSection />
      <NavigationMenuSection />
      <TabsSection />
      <BreadcrumbSection />
      <PaginationSection />
      <AccordionSection />
      <CollapsibleSection />
      <ResizableSection />
      <ScrollAreaSection />
      <SeparatorSection />
      <AspectRatioSection />
      <CardSection />
      <ItemSection />
    </>
  );
}

export { NavigationAndLayout };
