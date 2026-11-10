import "#styles.css";

import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
  AsOfDatePicker,
  Badge,
  Button,
  Progress,
  Switch,
  Table,
  TableBody,
  TableCell,
  TableRow,
  Tabs,
  TabsList,
  TabsTrigger,
  Toggle,
  applyPreferences,
} from "@basis/ui";
import type { Preferences } from "@basis/ui";
import { afterEach, describe, expect, test } from "vite-plus/test";
import { page, userEvent } from "vite-plus/test/browser";
import { render } from "vitest-browser-react";

/* Motion for a desktop drawn on the CPU and sent as screen changes (docs/design.md, The theme): controls fade their
 * colours and nothing else, rows and days the pointer crosses change at once, a change of mode, density or motion is
 * drawn in one frame, and the `motion` preference stops what `prefers-reduced-motion` stops. */

const root = document.documentElement;
const shown: Preferences = {
  density: "comfortable",
  mode: "light",
  motion: "full",
  theme: "default",
};

afterEach(() => {
  applyPreferences(root, shown, false);
  delete root.dataset["switching"];
});

/** The element with `data-slot="slot"`. */
function slotted(slot: string): Element {
  const element = document.querySelector(`[data-slot="${slot}"]`);
  if (element === null) {
    throw new Error(`Nothing has data-slot="${slot}".`);
  }
  return element;
}

/** The properties an element transitions, and the longest of its durations in milliseconds. */
function transition(element: Element): { readonly properties: string; readonly longest: number } {
  const style = getComputedStyle(element);
  const millisecondsPerSecond = 1000;
  const durations = style.transitionDuration
    .split(",")
    .map((duration) => Number(duration.trim().replace(/s$/u, "")));
  return {
    longest: Math.max(...durations) * millisecondsPerSecond,
    properties: style.transitionProperty,
  };
}

/** The page's CSS transitions running now. */
function runningTransitions(): readonly Animation[] {
  return document.getAnimations().filter((animation) => animation instanceof CSSTransition);
}

/** Waits for the next frame. */
async function nextFrame(): Promise<void> {
  const { promise, resolve } = Promise.withResolvers<number>();
  requestAnimationFrame(resolve);
  await promise;
}

/** Waits for two frames, when a change of preferences has been drawn. */
async function twoFrames(): Promise<void> {
  await nextFrame();
  await nextFrame();
}

describe("motion", () => {
  test("Button, Badge, Toggle, TabsTrigger, Switch and Progress fade their colours, never their size", async () => {
    await render(
      <>
        <Button>Book</Button>
        <Badge>Live</Badge>
        <Toggle aria-label="Bold">B</Toggle>
        <Tabs defaultValue="a">
          <TabsList>
            <TabsTrigger value="a">A</TabsTrigger>
          </TabsList>
        </Tabs>
        <Switch aria-label="Notify" />
        <Progress value={40} />
      </>,
    );
    const slots = [
      "button",
      "badge",
      "toggle",
      "tabs-trigger",
      "switch-track",
      "progress-indicator",
    ];
    const properties = slots.map((slot) => transition(slotted(slot)).properties);
    expect(
      properties.filter((property) => /\ball\b|width|height|padding/u.test(property)),
    ).toStrictEqual([]);
  });

  test("a table row's hover and a date's show at once, since the pointer crosses many", async () => {
    await render(
      <>
        <Table>
          <TableBody>
            <TableRow>
              <TableCell>UST 10Y</TableCell>
            </TableRow>
          </TableBody>
        </Table>
        <AsOfDatePicker aria-label="As of" />
      </>,
    );
    await userEvent.click(page.getByRole("button", { name: "Choose a date" }));
    const day = document.querySelector('[data-slot="date-grid"] td button');
    expect([
      transition(slotted("table-row")).longest,
      day === null ? -1 : transition(day).longest,
    ]).toStrictEqual([0, 0]);
  });

  test("a change of mode is drawn in one frame: no control's colour transitions to it", async () => {
    await render(<Button>Book</Button>);
    await twoFrames();
    applyPreferences(root, { ...shown, mode: "dark" }, false);
    expect(root.dataset["switching"]).toBe("1");
    await twoFrames();
    expect(runningTransitions()).toStrictEqual([]);
    expect(root.dataset["switching"]).toBeUndefined();
  });

  test("the reduced motion preference stops the accordion's opening, as prefers-reduced-motion does", async () => {
    await render(
      <Accordion>
        <AccordionItem value="terms">
          <AccordionTrigger>Terms</AccordionTrigger>
          <AccordionContent>Settles T+1.</AccordionContent>
        </AccordionItem>
      </Accordion>,
    );
    await userEvent.click(page.getByRole("button", { name: "Terms" }));
    const panel = slotted("accordion-content");
    const full = transition(panel).longest;
    applyPreferences(root, { ...shown, motion: "reduced" }, false);
    // 0.01 ms, the theme's reduced-motion rule, which ends the transition at once but still fires its events.
    expect([full, transition(panel).longest < 1]).toStrictEqual([150, true]);
  });
});
