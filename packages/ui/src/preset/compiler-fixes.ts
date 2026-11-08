/* The React Compiler fails the build on a component that breaks the rules of React, with a message that says what
 * broke and links React's docs, but not always what to write instead: "Calling setState during render may trigger an
 * infinite loop". In an app agents write nobody reads the code, so every failure names its fix (docs/design.md, The
 * idea). This wraps the compiler's Babel plugin so its errors open with an `ERROR` line that does, by the rule broken,
 * and keep the compiler's own text and code frame below it. */

/** The fix for each kind of compiler error, by a phrase its message starts with. */
const fixes: readonly (readonly [phrase: string, fix: string])[] = [
  [
    "Hooks must always be called in a consistent order",
    "call every hook at the top level of the component, before any condition, loop or early return",
  ],
  [
    "Hooks must be the same function on every render",
    "call a hook by its own name; never pass one around as a value or pick one at render time",
  ],
  [
    "Hooks may not be referenced as normal values",
    "call a hook by its own name; never pass one around as a value or pick one at render time",
  ],
  [
    "Cannot access refs during render",
    "read and write ref.current only in event handlers and effects, and keep what the page shows in state",
  ],
  [
    "Calling setState during render",
    "set state in an event handler or an effect, or compute the value during render rather than storing it",
  ],
  [
    "Calling setState synchronously within an effect",
    "compute the value during render rather than setting it in an effect, or set it from an event handler",
  ],
  [
    "This value cannot be modified",
    "copy the value and change the copy, or keep it in state: never change props, state or what a hook returns",
  ],
  [
    "Cannot reassign variables declared outside of the component",
    "keep the value in state or a ref, and change it in an event handler or an effect",
  ],
  [
    "Cannot call impure function during render",
    "call it in an event handler or an effect, or pass its result in as a prop",
  ],
];

const rulesOfReact = "https://react.dev/reference/rules";

/** The `ERROR` line for a compiler message: its fix, or the Rules of React for a message not listed. */
function compilerFix(message: string): string {
  const fix = fixes.find(([phrase]) => message.includes(phrase))?.[1];
  return fix === undefined
    ? `ERROR the React Compiler cannot compile this component: rewrite it to follow the rule the error below names (${rulesOfReact}).`
    : `ERROR the React Compiler cannot compile this component: ${fix}.`;
}

/** An error whose message opens with its fix; the error keeps its code frame and location. */
function withFix(error: unknown): unknown {
  if (error instanceof Error && !error.message.startsWith("ERROR ")) {
    error.message = `${compilerFix(error.message)}\n\n${error.message}`;
  }
  return error;
}

/** A transform hook's function, as Rolldown and Vite both call it. */
type TransformFunction = (this: unknown, ...args: unknown[]) => unknown;

function isTransformFunction(value: unknown): value is TransformFunction {
  return typeof value === "function";
}

/** The hook's function, alone or as an object's `handler`. */
function handlerOf(transform: unknown): TransformFunction | undefined {
  if (isTransformFunction(transform)) {
    return transform;
  }
  const handler: unknown =
    typeof transform === "object" && transform !== null && "handler" in transform
      ? transform.handler
      : undefined;
  return isTransformFunction(handler) ? handler : undefined;
}

/** A plugin's transform hook, its errors opening with their fix. */
function wrapped(original: TransformFunction): TransformFunction {
  return async function handler(this: unknown, ...args: unknown[]): Promise<unknown> {
    try {
      return await Reflect.apply(original, this, args);
    } catch (error) {
      throw withFix(error);
    }
  };
}

/** The compiler's Babel plugin, its errors opening with their fix. */
function withCompilerFixes<TPlugin extends { readonly transform?: unknown }>(
  plugin: TPlugin,
): TPlugin {
  const { transform } = plugin;
  const original = handlerOf(transform);
  if (original === undefined) {
    return plugin;
  }
  const hook =
    typeof transform === "object" && transform !== null
      ? { ...transform, handler: wrapped(original) }
      : wrapped(original);
  return { ...plugin, transform: hook };
}

export { compilerFix, withCompilerFixes };
