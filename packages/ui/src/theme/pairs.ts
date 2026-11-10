// What `checkTheme` measures against what: the tokens text, outlines, focus rings and fills sit on, as the components
// place them.

/* What text sits on. The page's surfaces, and the fills a row, an item or a band takes under its text: hovered
 * (`muted`), focused or in a range (`accent`), a secondary badge or button (`secondary`), selected (`selection`), a
 * search match (`highlight`), and the sidebar's item hovered or active (`sidebar-accent`). */
const grounds = [
  "background",
  "card",
  "popover",
  "sidebar",
  "muted",
  "accent",
  "secondary",
  "selection",
  "highlight",
  "sidebar-accent",
] as const;

const statuses = ["destructive", "success", "warning", "info"] as const;

/** Text that can sit on any ground: body text, a label, a link, a status's message and a signed number. */
const texts = ["foreground", "muted-foreground", "primary", ...statuses, "gain", "loss"] as const;

/** Text on a fill of its own: a surface's, a solid's in each state, a status's tint, a banner's. */
const ownPairs: readonly (readonly [text: string, fill: string])[] = [
  ["card-foreground", "card"],
  ["popover-foreground", "popover"],
  ["secondary-foreground", "secondary"],
  ["secondary-foreground", "secondary-hover"],
  ["secondary-foreground", "secondary-active"],
  ["accent-foreground", "accent"],
  ["sidebar-foreground", "sidebar"],
  ["sidebar-accent-foreground", "sidebar-accent"],
  ["primary-foreground", "primary"],
  ["primary-foreground", "primary-hover"],
  ["primary-foreground", "primary-active"],
  ["sidebar-primary-foreground", "sidebar-primary"],
  // A key in a tooltip, which is drawn in `foreground` with `background` text.
  ["background", "muted-foreground"],
  ...statuses.flatMap((status) => [
    [`${status}-foreground`, status] as const,
    [status, `${status}-subtle`] as const,
    [status, `${status}-subtle-hover`] as const,
    ["foreground", `${status}-subtle`] as const,
  ]),
  ...["env-dev", "env-qa", "env-prod"].map((env) => [`${env}-foreground`, env] as const),
];

/** A quiet fill must show on every surface it can sit on, or a muted band or a highlighted item vanishes in a popup;
 * a chart's marks and a control's outline sit on the same surfaces. */
const fills = ["muted", "secondary", "accent"] as const;
const surfaces = ["background", "card", "popover"] as const;

/* A control's outline, and a switch that is off: its track on the page, and its thumb, in `background`, on the track. */
const outlinePairs: readonly (readonly [outline: string, surface: string])[] = [
  ...surfaces.map((surface) => ["input", surface] as const),
  ...surfaces.map((surface) => ["control-off", surface] as const),
  ["background", "control-off"],
];

/* The focus ring as drawn: an outline, whole, outside the control, so on what the control sits on and beside it in a
 * row or a range. `ring` in the page, `sidebar-ring` in the sidebar, and `destructive` round a field that is invalid. */
const ringPairs: readonly (readonly [ring: string, surface: string])[] = [
  ...[...surfaces, "muted", "accent", "selection"].map((surface) => ["ring", surface] as const),
  ["sidebar-ring", "sidebar"],
  ["sidebar-ring", "sidebar-accent"],
  ...[...surfaces, "muted"].map((surface) => ["destructive", surface] as const),
];

/* A fill hovered and pressed: each state must show against the one before it. A status's tint, pressed, returns to
 * rest. */
const states: readonly (readonly [rest: string, hover: string, active: string])[] = [
  ...["primary", "secondary"].map((name) => [name, `${name}-hover`, `${name}-active`] as const),
  ...statuses.map(
    (status) => [`${status}-subtle`, `${status}-subtle-hover`, `${status}-subtle`] as const,
  ),
];

export { fills, grounds, outlinePairs, ownPairs, ringPairs, states, surfaces, texts };
