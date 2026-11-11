// Written by `vp run @basis/ui#theme` from the themes in ./themes/index.ts: their names, in their order, the default
// first. The preferences, the user menu and `vp run shot` read these, so that no app ships the themes' inputs.

/** Every shipped theme's name, the default first. */
const themeNames = ["default", "desk", "high-contrast"] as const;

export { themeNames };
