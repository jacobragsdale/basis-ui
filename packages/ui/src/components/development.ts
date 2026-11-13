/// <reference types="vite-plus/client" />
/* Whether the app runs in development: Vite's dev server or its tests, where a mistake a developer makes, such as a
 * shortcut's unknown modifier, is thrown so it is seen at once. A production build, and anything Vite does not
 * build, is not, and logs the same mistake as an `ERROR` line instead, so it never takes a page down. */

/** Whether the app runs in development, as Vite says. Written as Vite matches it, `import.meta.env.DEV`, which it
 * replaces in a dependency's code too; outside Vite, where `import.meta.env` is missing, no. */
function inDevelopment(): boolean {
  try {
    return import.meta.env.DEV;
  } catch {
    return false;
  }
}

export { inDevelopment };
