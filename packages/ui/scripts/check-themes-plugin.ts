/* The repo's own lint rule `basis-ui/check-theme`, which holds every shipped theme to `checkTheme` (src/theme/check.ts)
 * in `vp check`: Vite+'s check runs formatting, lint and type checks and nothing else, and a rule costs no step of its
 * own. The root vite.config.ts applies it to src/theme/themes, where it reports each problem of a file's theme at its
 * `defineTheme` call. The themes are read once, when Oxlint loads the plugin, so an editor's lint shows a theme's
 * problems as of its last start. */

import { definePlugin, defineRule } from "vite-plus/lint/plugins";

import { themeFileProblems } from "#theme/check.ts";
import { themes } from "#theme/themes/index.ts";

const checkTheme = defineRule({
  create(context) {
    return {
      CallExpression(node): void {
        if (node.callee.type !== "Identifier" || node.callee.name !== "defineTheme") {
          return;
        }
        for (const message of themeFileProblems(context.physicalFilename, themes)) {
          context.report({ message, node });
        }
      },
    };
  },
  meta: {
    docs: { description: "A shipped theme passes checkTheme." },
    type: "problem",
  },
});

const plugin = definePlugin({
  meta: { name: "basis-ui" },
  rules: { "check-theme": checkTheme },
});

export default plugin;
