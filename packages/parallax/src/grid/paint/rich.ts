/* Rich cells on a grid's canvas, as a layout's `cells` and `rules` ask: a data bar, a heat fill under ink that reads
 * on it, a badge, a sparkline and a link, and a rule's ink, tint and weight. They are drawn, not rendered: a fixed
 * set, from the theme's tokens and scales, at the cost of a few fills a cell. */

import type { CellValue } from "#frame/cell.ts";
import type { FrameColumn } from "#frame/columns.ts";
import type { LayoutCell, LayoutRule, Tone } from "#layout/cells.ts";
import type { GridTheme } from "#theme/read.ts";

import { fillRect } from "./canvas.ts";
import type { CellAt, RowAt } from "./cells.ts";
import { domainOf, numberOf, ruleFor } from "./rules.ts";
import type { Domain } from "./rules.ts";
import type { Pass } from "./scene.ts";

/** How far a bar, a badge and a sparkline sit inside their row, above and below. */
const inset = 4;
/** A badge's room on each side of its text, and its shape's size. */
const badgePad = 6;
const shapeSize = 6;
/** Below this lightness, on a scale of 0 to 1, a fill takes the light ink. */
const darkBelow = 0.6;
const sparkWidth = 1.5;

/** What a data cell draws besides plain text: its column's kind, the rule its value meets, its value and its
 * column's domain. */
interface Look {
  readonly kind: LayoutCell | null;
  readonly rule: LayoutRule["format"] | null;
  readonly value: CellValue;
  readonly domain: Domain | null;
}

/** A tone's ink. */
function inkOf(theme: GridTheme, tone: Tone): string {
  const inks: Readonly<Record<Tone, string>> = {
    info: theme.info,
    negative: theme.negative,
    neutral: theme.muted,
    positive: theme.positive,
    warning: theme.warning,
  };
  return inks[tone];
}

/** A tone's tint. */
function tintOf(theme: GridTheme, tone: Tone): string {
  const tints: Readonly<Record<Tone, string>> = {
    info: theme.infoSubtle,
    negative: theme.negativeSubtle,
    neutral: theme.groupBackground,
    positive: theme.positiveSubtle,
    warning: theme.warningSubtle,
  };
  return tints[tone];
}

/** How a data cell of `data` at `at` draws, from the layout, or null for plain text. */
function lookOf(pass: Pass, at: RowAt, data: FrameColumn): Look | null {
  const { layout } = pass.scene;
  const kind = layout?.cells?.[data.name] ?? null;
  const rules = layout?.rules?.[data.name];
  if (kind === null && rules === undefined) {
    return null;
  }
  const value = data.value(at.local);
  const ranged = kind?.kind === "bar" || kind?.kind === "heat";
  const domain = ranged ? domainOf(at.frame, at.frame.columns.indexOf(data)) : null;
  return { domain, kind, rule: ruleFor(rules, value, data.text(at.local)), value };
}

/** What a look adds to a cell's drawn text, so that a cell whose domain or rule changed is drawn again. */
function lookKey(look: Look | null): string {
  return look === null ? "" : `\u0002${JSON.stringify([look.domain, look.rule])}`;
}

/** An sRGB channel's top, and the weights of red, green and blue in a colour's luminance. */
const channelTop = 255;
const redWeight = 0.2126;
const greenWeight = 0.7152;
const blueWeight = 0.0722;
const weights = [redWeight, greenWeight, blueWeight];
const percent = 100;
const oklchForm = /^oklch\(\s*(?<light>[\d.]+)(?<unit>%?)/u;
const rgbForm = /^rgba?\(\s*(?<red>[\d.]+)[\s,]+(?<green>[\d.]+)[\s,]+(?<blue>[\d.]+)/u;

/** The lightness of a colour as the canvas reads it, from 0 to 1, or null for a form it cannot read. */
function lightness(color: string): number | null {
  const oklch = oklchForm.exec(color)?.groups;
  if (oklch !== undefined) {
    return Number(oklch["light"]) / (oklch["unit"] === "%" ? percent : 1);
  }
  const rgb = rgbForm.exec(color)?.groups;
  if (rgb === undefined) {
    return null;
  }
  const channels = [rgb["red"], rgb["green"], rgb["blue"]].map(
    (channel) => Number(channel) / channelTop,
  );
  return channels.reduce((sum, channel, index) => sum + channel * (weights[index] ?? 0), 0);
}

/** The step of `ramp` for a fraction from 0 to 1. */
function step(ramp: readonly string[], fraction: number): string {
  const index = Math.round(Math.min(1, Math.max(0, fraction)) * (ramp.length - 1));
  return ramp[index] ?? "transparent";
}

/** A heat cell's fill: from the sequential ramp, or for a diverging scale the ramp above zero and the negative ramp
 * below it. */
function heatFill(theme: GridTheme, look: Look, value: number): string | null {
  const [low, high] = look.domain ?? [value, value];
  const { ramp, negativeRamp, middle } = theme.colors;
  if (look.kind?.kind === "heat" && look.kind.scale === "diverging") {
    // Both arms start at the scale's neutral middle, so a small gain and a small loss are both faint.
    return value < 0
      ? step([middle, ...negativeRamp], low < 0 ? value / low : 0)
      : step([middle, ...ramp], high > 0 ? value / high : 0);
  }
  return step(ramp, high > low ? (value - low) / (high - low) : 1);
}

/** Where a bar runs across a cell of `room` pixels: from the base, zero or the least value, to the value. */
function barSpan(
  look: Look,
  value: number,
): { readonly from: number; readonly to: number; readonly signed: boolean } | null {
  const [low, high] = look.domain ?? [Math.min(0, value), Math.max(0, value)];
  const fromMin = look.kind?.kind === "bar" && look.kind.from === "min";
  const [start, end] = fromMin ? [low, high] : [Math.min(0, low), Math.max(0, high)];
  if (end <= start) {
    return null;
  }
  const at = (of: number): number => (of - start) / (end - start);
  return { from: at(fromMin ? low : 0), signed: low < 0 && high > 0, to: at(value) };
}

/** Draws a data bar behind the text over the column's domain: in the gain and loss tints when the column holds both
 * signs, else in the note's. */
function bar(
  pass: Pass,
  { at, cell }: { at: RowAt; cell: CellAt },
  { look, value }: { look: Look; value: number },
): void {
  const { theme, metrics } = pass;
  const span = barSpan(look, value);
  const room = cell.width - 2 * metrics.padding;
  if (span === null || room <= 0) {
    return;
  }
  const [left, right] = [Math.min(span.from, span.to), Math.max(span.from, span.to)].map(
    (share) => cell.x + metrics.padding + share * room,
  );
  const signedTint = value < 0 ? theme.negativeSubtle : theme.positiveSubtle;
  const tint = span.signed ? signedTint : theme.infoSubtle;
  fillRect(pass, tint, [
    left ?? 0,
    at.y + inset,
    (right ?? 0) - (left ?? 0),
    metrics.rowPx - 2 * inset,
  ]);
}

/** Fills a heat cell; returns the ink that reads on its fill. */
function heat(
  pass: Pass,
  rect: readonly [number, number, number, number],
  { look, value }: { look: Look; value: number },
): string | null {
  const { theme } = pass;
  const fill = heatFill(theme, look, value);
  if (fill === null) {
    return null;
  }
  fillRect(pass, fill, rect);
  return (lightness(fill) ?? 1) < darkBelow ? theme.lightInk : theme.darkInk;
}

/** A rule's ink, or null for the column's. */
function ruleInk(theme: GridTheme, rule: LayoutRule["format"] | null): string | null {
  return rule?.tone === undefined || rule.tone === null ? null : inkOf(theme, rule.tone);
}

/** Draws what goes behind a cell's text: a rule's tint, a bar or a heat fill. Returns the ink its text takes, or null
 * for the column's. */
function richBehind(pass: Pass, place: { at: RowAt; cell: CellAt }, look: Look): string | null {
  const { at, cell } = place;
  const rect = [cell.x, at.y, cell.width - 1, pass.metrics.rowPx - 1] as const;
  if (look.rule?.fill === true) {
    fillRect(pass, tintOf(pass.theme, look.rule.tone ?? "neutral"), rect);
  }
  const value = numberOf(look.value);
  if (value !== null && look.kind?.kind === "bar") {
    bar(pass, place, { look, value });
  }
  const inked =
    value !== null && look.kind?.kind === "heat" ? heat(pass, rect, { look, value }) : null;
  return inked ?? ruleInk(pass.theme, look.rule);
}

export {
  badgePad,
  inkOf,
  inset,
  lightness,
  lookKey,
  lookOf,
  richBehind,
  shapeSize,
  sparkWidth,
  tintOf,
};
export type { Look };
