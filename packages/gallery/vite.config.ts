// The gallery is built the way an app is: the preset's checks and tasks, its plugins, and its browser tests.
import { basisPlugins, basisPreset, basisTest } from "@basis/ui/preset";
import { defineConfig } from "vite-plus";

export default defineConfig({
  ...basisPreset(),
  plugins: basisPlugins(),
  // Its measurements are the comfortable density's, which each test starts in; apps open compact.
  test: { ...(await basisTest()), setupFiles: ["src/comfortable.setup.ts"] },
});
