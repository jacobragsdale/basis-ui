// @vitest-environment happy-dom
/* The grammar of a shortcut's keys, and how a key press matches it: an unknown modifier is refused rather than
 * ignored, `ctrl` is `mod`, case does not matter, and shifted digits, symbols and named keys match the press. */

import { describe, expect, test } from "vite-plus/test";

import { comboText, isPlain, matchesCombo, parseKeys } from "#components/shortcut-keys.ts";

/** A key press on Windows. */
function press(key: string, init: KeyboardEventInit = {}): KeyboardEvent {
  return new KeyboardEvent("keydown", { key, ...init });
}

/** Whether `keys` matches the press, on Windows. */
function matches(keys: string, event: KeyboardEvent): boolean {
  const reading = parseKeys(keys);
  if (!reading.ok) {
    throw new Error(reading.reason);
  }
  return matchesCombo(reading.combo, event, false);
}

describe(parseKeys, () => {
  test.each(["cmd+d", "meta+d", "control+enter", "option+k", "ctl+s"])(
    "refuses %s, naming the modifier and the fix",
    (keys) => {
      const reading = parseKeys(keys);
      expect(reading.ok).toBe(false);
      expect(reading.ok ? "" : reading.reason).toMatch(
        /which is no modifier: write its modifiers from mod/u,
      );
    },
  );

  test("refuses a key it has no name for", () => {
    expect(parseKeys("mod+return")).toStrictEqual({
      ok: false,
      reason:
        '"mod+return" ends in "return", which is no key: write its modifiers from mod (Ctrl), alt and shift, then its key, as "mod+shift+k", "alt+1" or "?".',
    });
  });

  test("reads ctrl as mod, and writes every spelling of one combination the same", () => {
    const texts = ["mod+k", "Mod+K", "ctrl+k", "CTRL+k"].map((keys) => {
      const reading = parseKeys(keys);
      return reading.ok ? comboText(reading.combo) : reading.reason;
    });
    expect(new Set(texts)).toStrictEqual(new Set(["mod+k"]));
    const question = ["?", "shift+?"].map((keys) => {
      const reading = parseKeys(keys);
      return reading.ok ? comboText(reading.combo) : reading.reason;
    });
    expect(question).toStrictEqual(["?", "?"]);
  });

  test("a combination with mod or alt is not a plain key, in any case", () => {
    const plain = ["Mod+S", "alt+1", "/", "shift+n"].map((keys) => {
      const reading = parseKeys(keys);
      return reading.ok && isPlain(reading.combo);
    });
    expect(plain).toStrictEqual([false, false, true, true]);
  });
});

describe(matchesCombo, () => {
  test("ctrl+d is Ctrl+D, never a bare d", () => {
    expect(matches("ctrl+d", press("d", { ctrlKey: true }))).toBe(true);
    expect(matches("ctrl+d", press("d"))).toBe(false);
  });

  test.each([
    ["shift+1", press("!", { code: "Digit1", shiftKey: true })],
    ["+", press("+", { code: "Equal", shiftKey: true })],
    ["shift+/", press("?", { code: "Slash", shiftKey: true })],
    ["?", press("?", { code: "Slash", shiftKey: true })],
    ["esc", press("Escape")],
    ["space", press(" ", { code: "Space" })],
    ["mod++", press("+", { ctrlKey: true, shiftKey: true })],
    ["Mod+S", press("s", { ctrlKey: true })],
    ["mod+shift+r", press("R", { ctrlKey: true, shiftKey: true })],
  ])("%s matches its press", (keys, event) => {
    expect(matches(keys, event)).toBe(true);
  });

  test.each([
    ["shift+1", press("1", { code: "Digit1" })],
    ["1", press("!", { code: "Digit1", shiftKey: true })],
    ["k", press("K", { shiftKey: true })],
    ["mod+k", press("k", { altKey: true, ctrlKey: true })],
  ])("%s does not match another press", (keys, event) => {
    expect(matches(keys, event)).toBe(false);
  });
});
