/* `vp run shot`'s steps: their grammar, each line a step that cannot be read fails with, and, in the Chromium the
 * preset's Playwright pins, each step taken on a small page and each line a step that cannot be taken fails with. */

import { once } from "node:events";
import { createServer } from "node:http";
import type { RequestListener, Server } from "node:http";
import type { AddressInfo } from "node:net";

import { chromium } from "playwright";
import type { Page } from "playwright";
import { afterAll, describe, expect, test } from "vite-plus/test";
import { z } from "zod";

import { stepOf, takeSteps } from "#preset/shot-steps.ts";
import type { StepContext } from "#preset/shot-steps.ts";

describe(stepOf, () => {
  test("reads each action, a name or a CSS selector as its target, and the text to type", () => {
    expect(
      [
        "click:Save",
        "hover:#export",
        "type:Amount=1,000",
        "type:[name=amount]=100",
        "type:#note=",
        "press:Control+k",
        "wait:500",
        "wait:css=main table",
      ].map((source) => stepOf(source)),
    ).toStrictEqual([
      { action: "click", source: "click:Save", target: { name: "Save" } },
      { action: "hover", source: "hover:#export", target: { css: "#export" } },
      { action: "type", source: "type:Amount=1,000", target: { name: "Amount" }, text: "1,000" },
      {
        action: "type",
        source: "type:[name=amount]=100",
        target: { css: "[name=amount]" },
        text: "100",
      },
      { action: "type", source: "type:#note=", target: { css: "#note" }, text: "" },
      { action: "press", key: "Control+k", source: "press:Control+k" },
      { action: "wait", ms: 500, source: "wait:500" },
      { action: "wait", source: "wait:css=main table", target: { css: "main table" } },
    ]);
  });

  test("refuses each step that cannot be read with its own line", () => {
    const refusals: readonly (readonly [string, string])[] = [
      [
        "Save",
        `ERROR --step "Save" names no action: a step is click:TARGET, hover:TARGET, type:TARGET=TEXT, press:KEY, wait:MS or wait:TARGET, such as --step 'click:Save'.`,
      ],
      [
        "jump:Save",
        `ERROR --step "jump:Save" names no action: a step is click:TARGET, hover:TARGET, type:TARGET=TEXT, press:KEY, wait:MS or wait:TARGET, such as --step 'click:Save'.`,
      ],
      [
        "click:",
        `ERROR --step "click:" names nothing to click: give a control's name or a CSS selector, such as click:Save or click:#save.`,
      ],
      [
        "hover: ",
        `ERROR --step "hover: " names nothing to hover over: give a control's name or a CSS selector, such as hover:Export or hover:#export.`,
      ],
      [
        "type:Amount",
        `ERROR --step "type:Amount" gives no text to type: write type:TARGET=TEXT, such as type:#amount=100, with nothing after = to clear the field.`,
      ],
      [
        "type:=100",
        `ERROR --step "type:=100" names nothing to type into: write type:TARGET=TEXT, such as type:Amount=100 or type:#amount=100.`,
      ],
      [
        "press:",
        `ERROR --step "press:" names no key: give a key or a chord, such as press:Enter, press:Escape or press:Control+k.`,
      ],
      [
        "wait:css=",
        `ERROR --step "wait:css=" says nothing to wait for: give milliseconds or what to wait for, such as wait:500 or wait:Saved.`,
      ],
    ];
    for (const [source, line] of refusals) {
      expect(() => stepOf(source), source).toThrow(expect.objectContaining({ message: line }));
    }
  });
});

/** A form to act on: a field by its label, one by its placeholder, a button that shows a message, two buttons of one
 * name, a hidden button, and a disabled one. */
const formPage = `<!doctype html><title>Form</title>
<label for="amount">Amount</label><input id="amount">
<input placeholder="Note" id="note">
<button id="save" onclick="document.querySelector('#saved').hidden = false">Save</button>
<p id="saved" hidden>Saved</p>
<button>Twice</button><button>Twice</button>
<button hidden>Hidden</button>
<button disabled>Locked</button>
<script>document.addEventListener("keydown", (event) => { if (event.key === "Enter") document.title = "Entered"; });</script>`;

/** The server the pages come from, on a free port, and its origin. */
async function serve(
  handler: RequestListener,
): Promise<{ readonly server: Server; readonly origin: string }> {
  const created = createServer(handler);
  created.listen(0, "127.0.0.1");
  await once(created, "listening");
  const { port } = z
    .custom<AddressInfo>((value) => typeof value === "object")
    .parse(created.address());
  return { origin: `http://127.0.0.1:${String(port)}`, server: created };
}

const { server, origin } = await serve((_request, response) => {
  response.setHeader("content-type", "text/html");
  response.end(formPage);
});
const browser = await chromium.launch({ headless: true });

afterAll(async () => {
  await browser.close();
  server.close();
});

/** A fresh page of the form, and the context its steps run in. */
async function form(): Promise<{ readonly page: Page; readonly context: StepContext }> {
  const page = await browser.newPage();
  await page.goto(`${origin}/`);
  const context: StepContext = {
    files: ".shots/form",
    page,
    route: "/form",
    settle: async () => {
      await page.waitForTimeout(0);
    },
  };
  return { context, page };
}

/** The line taking `sources` on the form fails with. */
async function failure(sources: readonly string[]): Promise<string> {
  const { page, context } = await form();
  try {
    await takeSteps(
      context,
      sources.map((source) => stepOf(source)),
    );
    return "";
  } catch (error) {
    return error instanceof Error ? error.message : String(error);
  } finally {
    await page.close();
  }
}

describe(takeSteps, () => {
  test("types by label, placeholder and selector, clicks, presses and waits for what shows", async () => {
    const { page, context } = await form();
    await takeSteps(
      context,
      [
        "type:Amount=1,000",
        "type:Note=for the desk",
        "type:#amount=2,000",
        "click:Save",
        "wait:Saved",
        "press:Enter",
        "wait:10",
      ].map((source) => stepOf(source)),
    );
    expect(await page.inputValue("#amount")).toBe("2,000");
    expect(await page.inputValue("#note")).toBe("for the desk");
    expect(await page.isVisible("#saved")).toBe(true);
    expect(await page.title()).toBe("Entered");
    await page.close();
  });

  test("fails with its own line when a step cannot be taken", { timeout: 60_000 }, async () => {
    expect(await failure(["type:Amount=1", "click:Nowhere"])).toBe(
      `ERROR step 2, click:Nowhere, found nothing named "Nowhere" on /form within 5 s: pick a name from .shots/form.aria.yml, written as the page stood, or give a CSS selector, as css=main button.`,
    );
    expect(await failure(["click:Twice"])).toBe(
      `ERROR step 1, click:Twice, found 2 elements named "Twice" on /form: give a name only one of them has, or a CSS selector that picks one, as css=main button.`,
    );
    expect(await failure(["hover:Hidden"])).toBe(
      `ERROR step 1, hover:Hidden, found nothing named "Hidden" on /form within 5 s: pick a name from .shots/form.aria.yml, written as the page stood, or give a CSS selector, as css=main button.`,
    );
    expect(await failure(["press:Entr"])).toBe(
      "ERROR step 1, press:Entr, names no key Playwright knows: give one such as Enter, Escape, Tab, ArrowDown or Control+k.",
    );
    expect(await failure(["type:Save=1"])).toBe(
      "ERROR step 1, type:Save=1, found an element that takes no text: name the field by its label or placeholder, or give its CSS selector, as type:#amount=100.",
    );
    expect(await failure(["click:Locked"])).toBe(
      "ERROR step 1, click:Locked, could not click on /form within 5 s, as the element stayed hidden, disabled or covered: add the step that makes it ready before it, then look at .shots/form.png, written as the page stood.",
    );
    expect(await failure(["click:css=main >>> ["])).toMatch(
      /^ERROR step 1, click:css=main >>> \[, failed on \/form \(.+\): look at \.shots\/form\.png and \.shots\/form\.aria\.yml, written as the page stood, and fix the step\.$/u,
    );
  });
});
