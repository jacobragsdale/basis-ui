/* The themes the user menu offers, from the generator's list of names. */

/** A theme's name as the menu shows it: `high-contrast` as "High contrast". */
function themeLabel(name: string): string {
  const words = name.replaceAll("-", " ");
  return `${words.charAt(0).toUpperCase()}${words.slice(1)}`;
}

/** The themes the menu offers, in the generator's order: none while one theme ships, since a choice of one is no
 * choice, and a group that offers it would only lengthen every app's menu. */
function themeChoices<Name extends string>(
  names: readonly Name[],
): readonly (readonly [Name, string])[] {
  return names.length < 2 ? [] : names.map((name) => [name, themeLabel(name)] as const);
}

export { themeChoices };
