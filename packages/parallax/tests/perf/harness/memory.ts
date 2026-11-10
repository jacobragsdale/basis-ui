/* Keeps the WebAssembly memory of each module the worker instantiates, and offers its size to the bench as
 * `parallaxBenchMemory()` on the worker's global scope, which Playwright evaluates. WebAssembly memory only grows, so
 * its size is the engine's high-water mark. It is a function the worker calls, not an import for its effects, which
 * the bundler would drop: the package's `sideEffects` names only its own worker. */

const memories: WebAssembly.Memory[] = [];

function keep(instance: WebAssembly.Instance): void {
  const { memory } = instance.exports;
  if (memory instanceof WebAssembly.Memory) {
    memories.push(memory);
  }
}

/** Wraps WebAssembly's two ways to instantiate a module, so that each instance's memory is kept, before the engine
 * starts. */
function watchMemory(): void {
  const streaming = WebAssembly.instantiateStreaming.bind(WebAssembly);
  const instantiate = WebAssembly.instantiate.bind(WebAssembly);

  Reflect.set(
    WebAssembly,
    "instantiateStreaming",
    async (
      ...args: Parameters<typeof WebAssembly.instantiateStreaming>
    ): Promise<WebAssembly.WebAssemblyInstantiatedSource> => {
      const made = await streaming(...args);
      keep(made.instance);
      return made;
    },
  );

  Reflect.set(
    WebAssembly,
    "instantiate",
    async (...args: Parameters<typeof WebAssembly.instantiate>): Promise<unknown> => {
      const made: unknown = await Reflect.apply(instantiate, WebAssembly, args);
      if (made instanceof WebAssembly.Instance) {
        keep(made);
      } else if (typeof made === "object" && made !== null && "instance" in made) {
        const { instance } = made;
        if (instance instanceof WebAssembly.Instance) {
          keep(instance);
        }
      }
      return made;
    },
  );

  Reflect.set(globalThis, "parallaxBenchMemory", (): number =>
    memories.reduce((sum, memory) => sum + memory.buffer.byteLength, 0),
  );
}

export { watchMemory };
