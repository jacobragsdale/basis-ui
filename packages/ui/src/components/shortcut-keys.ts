/* The grammar of a shortcut's keys, and how a key press is matched against it. A combination is its modifiers, each
 * followed by `+`, then its key, written in any case: `mod+k`, `Mod+Shift+R`, `alt+1`, `?`, `shift+/`, `mod++`.
 *
 * - Modifiers: `mod`, Ctrl (Cmd on a Mac), and `ctrl`, the same key, since the firm's UI runs on Windows; `alt`;
 *   `shift`. Any other, such as `cmd`, `meta` or `option`, is refused rather than ignored, which once bound the bare
 *   key.
 * - Keys: one character, such as `k`, `1`, `/`, `?` or `+`, or a name: `enter`, `escape` (or `esc`), `space`, `tab`,
 *   `backspace`, `delete`, `insert`, `home`, `end`, `pageup`, `pagedown`, the arrows `arrowup`, `arrowdown`,
 *   `arrowleft` and `arrowright`, and `f1` to `f12`.
 * - Shift: a letter, a digit or a named key needs `shift` when it is pressed with it, and not otherwise. A symbol is
 *   the character the press makes, so `?` and `+` take whatever shift they need; with `shift` written, a digit or a
 *   symbol is the key it is on, so `shift+1` is the key `1` with Shift, which makes `!`. */

/** A combination read: its modifiers and its key, as `KeyboardEvent.key` names it in lower case. */
interface Combo {
  readonly mod: boolean;
  readonly alt: boolean;
  readonly shift: boolean;
  readonly key: string;
}

type KeysReading =
  | { readonly ok: true; readonly combo: Combo }
  | { readonly ok: false; readonly reason: string };

/** The names a key may be written by, and the `KeyboardEvent.key` each is, in lower case. */
const namedKeys: Readonly<Record<string, string>> = {
  ...Object.fromEntries(
    [
      "enter",
      "escape",
      "tab",
      "backspace",
      "delete",
      "insert",
      "home",
      "end",
      "pageup",
      "pagedown",
      "arrowup",
      "arrowdown",
      "arrowleft",
      "arrowright",
    ].map((name) => [name, name]),
  ),
  ...Object.fromEntries(
    Array.from({ length: 12 }, (_unused, index) => [
      `f${String(index + 1)}`,
      `f${String(index + 1)}`,
    ]),
  ),
  esc: "escape",
  space: " ",
};

/** The physical key each digit and unshifted symbol is on, as `KeyboardEvent.code` names it, for a combination with
 * Shift, whose press makes another character. */
const codes: Readonly<Record<string, string>> = {
  ...Object.fromEntries(
    Array.from({ length: 10 }, (_unused, digit) => [String(digit), `Digit${String(digit)}`]),
  ),
  "'": "Quote",
  ",": "Comma",
  "-": "Minus",
  ".": "Period",
  "/": "Slash",
  ";": "Semicolon",
  "=": "Equal",
  "[": "BracketLeft",
  "\\": "Backslash",
  "]": "BracketRight",
  "`": "Backquote",
};

/** Whether a key is a symbol: one character that is neither a letter nor a digit. */
function isSymbol(key: string): boolean {
  return key.length === 1 && !/[\p{L}\d ]/u.test(key);
}

/** The words of a combination, its last the key: `mod++` is `mod` and `+`. */
function wordsOf(keys: string): readonly string[] {
  const lower = keys.trim().toLowerCase();
  if (lower === "+") {
    return ["+"];
  }
  const plusKey = "++";
  if (lower.endsWith(plusKey)) {
    return [...lower.slice(0, -plusKey.length).split("+"), "+"];
  }
  return lower.split("+");
}

/** The fix a refused combination's reason ends with. */
const fix = `write its modifiers from mod (Ctrl), alt and shift, then its key, as "mod+shift+k", "alt+1" or "?"`;

/** Reads a combination by the grammar above, or says why it cannot. */
function parseKeys(keys: string): KeysReading {
  const words = wordsOf(keys);
  const written = words.at(-1) ?? "";
  const key = written.length === 1 ? written : namedKeys[written];
  if (key === undefined) {
    return { ok: false, reason: `"${keys}" ends in "${written}", which is no key: ${fix}.` };
  }
  const modifiers = words.slice(0, -1);
  const unknown = modifiers.find((word) => !["mod", "ctrl", "alt", "shift"].includes(word));
  if (unknown !== undefined) {
    return {
      ok: false,
      reason: `"${keys}" names "${unknown}", which is no modifier: ${fix}. ctrl is the same as mod.`,
    };
  }
  return {
    combo: {
      alt: modifiers.includes("alt"),
      key,
      mod: modifiers.includes("mod") || modifiers.includes("ctrl"),
      // A symbol makes its own shift: `shift+?` is `?`.
      shift: modifiers.includes("shift") && !(isSymbol(key) && codes[key] === undefined),
    },
    ok: true,
  };
}

/** Whether `event` is the combination; `mod` is Cmd where `mac`, and Ctrl otherwise. */
function matchesCombo(combo: Combo, event: KeyboardEvent, mac: boolean): boolean {
  const byKey = event.key.toLowerCase() === combo.key;
  const code = codes[combo.key];
  const byCode = code !== undefined && event.code === code;
  if (!(byKey || byCode)) {
    return false;
  }
  const shiftHolds = combo.shift
    ? event.shiftKey
    : (isSymbol(combo.key) && byKey) || !event.shiftKey;
  return (
    shiftHolds && (mac ? event.metaKey : event.ctrlKey) === combo.mod && event.altKey === combo.alt
  );
}

/** A combination written one way, so that `Mod+K`, `ctrl+k` and `mod+k`, or `shift+?` and `?`, are the same keys. */
function comboText({ mod, alt, shift, key }: Combo): string {
  return [alt ? "alt" : "", mod ? "mod" : "", shift ? "shift" : "", key === " " ? "space" : key]
    .filter((word) => word !== "")
    .join("+");
}

/** Whether a combination is a plain key, one with neither `mod` nor `alt`, which waits while the user types. */
function isPlain({ mod, alt }: Combo): boolean {
  return !mod && !alt;
}

export { comboText, isPlain, matchesCombo, parseKeys };
export type { Combo, KeysReading };
