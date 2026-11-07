/* `@basis/parallax/worker`: the Web Worker the engine runs in. An app starts it and gives it to `ParallaxProvider`;
 * in a Vite app, `import ParallaxWorker from "@basis/parallax/worker?worker"` and `() => new ParallaxWorker()`. */

import { serve } from "#engine/serve.ts";

serve();
