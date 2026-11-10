// A new theme's inputs file, from the default's: what `vp run @basis/ui#theme new NAME` writes to `themes/NAME.ts`.

/** What a new theme's file says first, in place of the default's opening comment. */
function headerOf(name: string): string {
  return `// The ${name} theme, under data-theme="${name}". It starts as a copy of the default's inputs: change what makes it
// a theme of its own, such as the hues and their curves, the surfaces' steps, the fonts, the type scale, the radius,
// the control lengths, the shadows, the motion and the chart palettes, and delete or rewrite the default's comments
// that no longer hold. Add it to \`themes\` in ./index.ts, run \`vp run @basis/ui#theme\`, and let the theme's tests say
// whether it passes.`;
}

/** The default's inputs file, `source`, as the start of the theme `name`: its opening comment replaced, and its name. */
function startTheme(source: string, defaultName: string, name: string): string {
  const imports = source.indexOf("\n\nimport ");
  const property = `name: "${defaultName}",`;
  if (imports === -1 || source.split(property).length !== 2) {
    throw new Error(
      `The default theme's file should open with a comment, then its imports, and hold ${property} once.`,
    );
  }
  return `${headerOf(name)}${source.slice(imports).replace(property, `name: "${name}",`)}`;
}

export { startTheme };
