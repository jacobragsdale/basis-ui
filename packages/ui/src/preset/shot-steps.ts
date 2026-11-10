/* The steps `vp run shot` takes on a page before its picture, each given as `--step ACTION:ARGUMENT`:
 *
 *   click:TARGET        clicks it
 *   hover:TARGET        moves the pointer over it
 *   type:TARGET=TEXT    fills it with TEXT, replacing what it held; nothing after `=` clears it
 *   press:KEY           presses a key, or a chord such as Control+k, on whatever has focus
 *   wait:MS             waits that many milliseconds
 *   wait:TARGET         waits until it shows
 *
 * A TARGET is a CSS selector when it starts with `#`, `.` or `[`, or after `css=`, as `css=main button`. Anything else
 * is a name: the accessible name of a control, its label or its placeholder, exactly, or failing those, an element's
 * exact text. Only what shows counts, and a target must be found once: none, or more than one, fails. In `type`, the
 * first `=` outside brackets and quotes ends the TARGET, so `type:[name=amount]=100` types 100.
 *
 * Every failure is one line that starts with ERROR and ends with the fix. */

import { setTimeout as sleep } from "node:timers/promises";

import { errors as playwrightErrors } from "playwright";
import type { Locator, Page } from "playwright";

import { TaskError } from "./task-error.ts";

/** Where a step acts: an element a CSS selector picks, or the one a name picks. */
type Target = { readonly css: string } | { readonly name: string };

/** A step, and the text it was given as, which its failures quote. */
type Step = { readonly source: string } & (
  | { readonly action: "click" | "hover"; readonly target: Target }
  | { readonly action: "type"; readonly target: Target; readonly text: string }
  | { readonly action: "press"; readonly key: string }
  | { readonly action: "wait"; readonly ms: number }
  | { readonly action: "wait"; readonly target: Target }
);

const grammar =
  "a step is click:TARGET, hover:TARGET, type:TARGET=TEXT, press:KEY, wait:MS or wait:TARGET, such as --step 'click:Save'";

/** The target `text` names. */
function targetOf(text: string): Target {
  if (text.startsWith("css=")) {
    return { css: text.slice("css=".length) };
  }
  return /^[#.[]/u.test(text) ? { css: text } : { name: text };
}

/** How each bracket changes the depth of brackets, inside which an `=` is a selector's. */
const bracketDepth: Readonly<Record<string, number>> = { "(": 1, ")": -1, "[": 1, "]": -1 };
const quotes = new Set(['"', "'"]);

/** Where the TARGET of `type:TARGET=TEXT` ends: at the first `=` outside brackets and quotes, or -1. */
function targetEnd(argument: string): number {
  let depth = 0;
  let quote: string | undefined = undefined;
  for (let index = 0; index < argument.length; index += 1) {
    const character = argument.charAt(index);
    if (quote !== undefined) {
      quote = character === quote ? undefined : quote;
    } else if (character === "=" && depth === 0) {
      return index;
    } else if (quotes.has(character)) {
      quote = character;
    } else {
      depth += bracketDepth[character] ?? 0;
    }
  }
  return -1;
}

/** What each action fails with when it is given nothing to act on. */
const nothingTo: Readonly<Record<string, string>> = {
  click:
    "names nothing to click: give a control's name or a CSS selector, such as click:Save or click:#save.",
  hover:
    "names nothing to hover over: give a control's name or a CSS selector, such as hover:Export or hover:#export.",
  press:
    "names no key: give a key or a chord, such as press:Enter, press:Escape or press:Control+k.",
  type: "names nothing to type into: write type:TARGET=TEXT, such as type:Amount=100 or type:#amount=100.",
  wait: "says nothing to wait for: give milliseconds or what to wait for, such as wait:500 or wait:Saved.",
};

/** The failure of the step `source`, for `reason`. */
function stepError(source: string, reason: string): TaskError {
  return new TaskError(`ERROR --step ${JSON.stringify(source)} ${reason}`);
}

/** The `type` step `source` is, from its `argument`, TARGET=TEXT. */
function typeStep(source: string, argument: string): Step {
  const end = targetEnd(argument);
  if (end === -1) {
    throw stepError(
      source,
      "gives no text to type: write type:TARGET=TEXT, such as type:#amount=100, with nothing after = to clear the field.",
    );
  }
  if (end === 0) {
    throw stepError(source, nothingTo["type"] ?? "");
  }
  const target = targetOf(argument.slice(0, end));
  return { action: "type", source, target, text: argument.slice(end + 1) };
}

/** The step of `action` that `source` is, from its `argument`, which is not empty. */
function stepFor(action: string, source: string, argument: string): Step {
  switch (action) {
    case "type": {
      return typeStep(source, argument);
    }
    case "press": {
      return { action, key: argument, source };
    }
    case "wait": {
      return /^\d+$/u.test(argument)
        ? { action, ms: Number(argument), source }
        : { action, source, target: targetOf(argument) };
    }
    default: {
      return { action: action === "hover" ? "hover" : "click", source, target: targetOf(argument) };
    }
  }
}

/** The step `source` is, as `--step` gives it, or the failure that says how to write it. */
function stepOf(source: string): Step {
  const colon = source.indexOf(":");
  const action = colon === -1 ? "" : source.slice(0, colon);
  const argument = source.slice(colon + 1);
  if (!Object.hasOwn(nothingTo, action)) {
    throw stepError(source, `names no action: ${grammar}.`);
  }
  if (argument.trim() === "" || argument === "css=") {
    throw stepError(source, nothingTo[action] ?? "");
  }
  return stepFor(action, source, argument);
}

/** How long a step waits for its target to show, and to take the action, and how often it looks. */
const stepSeconds = 5;
const millisecondsPerSecond = 1000;
const stepMs = stepSeconds * millisecondsPerSecond;
const pollMs = 100;

/** The roles of the controls a name picks, by their accessible name. */
const controlRoles = [
  "button",
  "checkbox",
  "combobox",
  "link",
  "menuitem",
  "menuitemcheckbox",
  "menuitemradio",
  "option",
  "radio",
  "searchbox",
  "slider",
  "spinbutton",
  "switch",
  "tab",
  "textbox",
  "treeitem",
] as const;

/** What `target` picks on `page` that shows: for a name, the controls that have it, else the elements whose text it
 * is. */
async function candidates(page: Page, target: Target): Promise<Locator> {
  if ("css" in target) {
    return page.locator(target.css).filter({ visible: true });
  }
  const exact = { exact: true };
  let controls = page.getByLabel(target.name, exact).or(page.getByPlaceholder(target.name, exact));
  for (const role of controlRoles) {
    controls = controls.or(page.getByRole(role, { name: target.name, ...exact }));
  }
  const shown = controls.filter({ visible: true });
  return (await shown.count()) > 0
    ? shown
    : page.getByText(target.name, exact).filter({ visible: true });
}

/** How `target` reads in a failure: `"Save"` for a name, the selector for CSS. */
function described(target: Target): string {
  return "css" in target ? `matching ${target.css}` : `named ${JSON.stringify(target.name)}`;
}

/** The page the steps act on, its route, the stem of its files, from the app's root, as `.shots/home`, which a
 * failure points at, and what waits for the page to settle after each step. */
interface StepContext {
  readonly page: Page;
  readonly route: string;
  readonly files: string;
  readonly settle: () => Promise<void>;
}

/** A step being taken: where, which, and its number, from 1. */
interface Taking {
  readonly context: StepContext;
  readonly step: Step;
  readonly number: number;
}

/** The start of a step's failure: `ERROR step 2, click:Save, `. */
function failing({ step, number }: Taking): string {
  return `ERROR step ${String(number)}, ${step.source}, `;
}

/** The one element `target` picks, once it shows, or the failure that says why none or several were found. */
async function found(taking: Taking, target: Target, waited = 0): Promise<Locator> {
  const { context, step } = taking;
  const picked = await candidates(context.page, target);
  const count = await picked.count();
  // Waiting for something to show is done once any one of several shows.
  if (count === 1 || (count > 1 && step.action === "wait")) {
    return picked.first();
  }
  if (count === 0 && waited < stepMs) {
    await sleep(pollMs);
    return found(taking, target, waited + pollMs);
  }
  throw new TaskError(
    count === 0
      ? `${failing(taking)}found nothing ${described(target)} on ${context.route} within ${String(stepSeconds)} s: pick a name from ${context.files}.aria.yml, written as the page stood, or give a CSS selector, as css=main button.`
      : `${failing(taking)}found ${String(count)} elements ${described(target)} on ${context.route}: give a name only one of them has, or a CSS selector that picks one, as css=main button.`,
  );
}

/** The failure a step's action threw, as one line with its fix. */
function actionFailure(taking: Taking, error: unknown): string {
  const { context, step } = taking;
  const at = failing(taking);
  const message = String(error instanceof Error ? error.message : error);
  if (step.action === "press" && message.includes("Unknown key")) {
    return `${at}names no key Playwright knows: give one such as Enter, Escape, Tab, ArrowDown or Control+k.`;
  }
  if (step.action === "type" && message.includes("not an <input>")) {
    return `${at}found an element that takes no text: name the field by its label or placeholder, or give its CSS selector, as type:#amount=100.`;
  }
  if (error instanceof playwrightErrors.TimeoutError) {
    return `${at}could not ${step.action} on ${context.route} within ${String(stepSeconds)} s, as the element stayed hidden, disabled or covered: add the step that makes it ready before it, then look at ${context.files}.png, written as the page stood.`;
  }
  return `${at}failed on ${context.route} (${message.split("\n")[0] ?? ""}): look at ${context.files}.png and ${context.files}.aria.yml, written as the page stood, and fix the step.`;
}

/** Takes one step. */
async function take(taking: Taking): Promise<void> {
  const { context, step } = taking;
  const options = { timeout: stepMs };
  if (step.action === "press") {
    await context.page.keyboard.press(step.key);
  } else if ("ms" in step) {
    await sleep(step.ms);
  } else {
    const element = await found(taking, step.target);
    if (step.action === "click") {
      await element.click(options);
    } else if (step.action === "hover") {
      await element.hover(options);
    } else if (step.action === "type") {
      await element.fill(step.text, options);
    }
  }
}

/** Takes the steps in turn, each once the page has settled after the one before, and fails with the first that
 * cannot be taken. */
async function takeSteps(context: StepContext, steps: readonly Step[], from = 0): Promise<void> {
  const step = steps[from];
  if (step === undefined) {
    return;
  }
  const taking = { context, number: from + 1, step };
  try {
    await take(taking);
  } catch (error) {
    throw error instanceof TaskError ? error : new TaskError(actionFailure(taking, error));
  }
  await context.settle();
  await takeSteps(context, steps, from + 1);
}

export { candidates, stepOf, takeSteps, targetOf };
export type { Step, StepContext, Target };
