/* Sheet and Drawer on the overlays and menus page: a trade's details in a sheet from each edge, and a drawer from the
 * bottom and from the right. */

import {
  Button,
  Drawer,
  DrawerClose,
  DrawerContent,
  DrawerDescription,
  DrawerFooter,
  DrawerHeader,
  DrawerTitle,
  DrawerTrigger,
  Sheet,
  SheetClose,
  SheetContent,
  SheetDescription,
  SheetFooter,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from "@basis/ui";
import type { ReactElement } from "react";

import { Section } from "#pages/section.tsx";

const sides = ["top", "right", "bottom", "left"] as const;

const trade = [
  ["Side", "Buy"],
  ["Par", "5,000,000"],
  ["Price", "99-16+"],
  ["Settles", "T+1"],
] as const;

function TradeDetails(): ReactElement {
  return (
    <dl className="grid grid-cols-2 gap-2 px-4 text-sm">
      {trade.map(([term, detail]) => (
        <div key={term} className="contents">
          <dt className="text-muted-foreground">{term}</dt>
          <dd className="text-right tabular-nums">{detail}</dd>
        </div>
      ))}
    </dl>
  );
}

/** A sheet of a trade's details from the edge `side` names. */
function SheetExample({ side }: { readonly side: (typeof sides)[number] }): ReactElement {
  return (
    <Sheet>
      <SheetTrigger render={<Button variant="outline" />}>Trade details, {side}</SheetTrigger>
      <SheetContent side={side}>
        <SheetHeader>
          <SheetTitle>Trade details</SheetTitle>
          <SheetDescription>The ticket as the desk booked it.</SheetDescription>
        </SheetHeader>
        <TradeDetails />
        <SheetFooter>
          <SheetClose render={<Button variant="outline" />}>Done</SheetClose>
        </SheetFooter>
      </SheetContent>
    </Sheet>
  );
}

/** A drawer of a trade's details, swiped away `down` with a grip by default, or to the right. */
function DrawerExample({
  direction = "down",
}: {
  readonly direction?: "down" | "right";
}): ReactElement {
  return (
    <Drawer swipeDirection={direction} showSwipeHandle={direction === "down"}>
      <DrawerTrigger render={<Button variant="outline" />}>Drawer, {direction}</DrawerTrigger>
      <DrawerContent>
        <DrawerHeader>
          <DrawerTitle>Trade details</DrawerTitle>
          <DrawerDescription>Swipe {direction} or press Escape to close.</DrawerDescription>
        </DrawerHeader>
        <div className="py-4">
          <TradeDetails />
        </div>
        <DrawerFooter>
          <DrawerClose render={<Button variant="outline" />}>Done</DrawerClose>
        </DrawerFooter>
      </DrawerContent>
    </Drawer>
  );
}

function PanelSections(): ReactElement {
  return (
    <>
      <Section
        title="Sheet"
        description="A dialog that slides in from an edge, for details or a form beside the page."
      >
        <div className="flex flex-wrap gap-2">
          {sides.map((side) => (
            <SheetExample key={side} side={side} />
          ))}
        </div>
      </Section>
      <Section
        title="Drawer"
        description="A panel from an edge that the pointer can swipe away, in the direction it came from."
      >
        <div className="flex flex-wrap gap-2">
          <DrawerExample />
          <DrawerExample direction="right" />
        </div>
      </Section>
    </>
  );
}

export { DrawerExample, PanelSections, SheetExample };
