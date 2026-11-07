// Builds page.html: body.html styled by @basis/ui's theme, with the bundled fonts embedded, so the page needs nothing
// but a browser. Run it from the repo root after `vp install`: `node docs/spikes/wsl-screenshots/build-page.mjs`.
import { readFileSync, writeFileSync } from "node:fs";
import { createRequire } from "node:module";

const here = new URL("./", import.meta.url);
const ui = new URL("../../../packages/ui/", here);
const require = createRequire(new URL("package.json", ui));
const { compile } = await import(require.resolve("@tailwindcss/node"));

const body = readFileSync(new URL("body.html", here), "utf8");
const candidates = [...new Set(body.match(/[\w:./&;[\]-]+/gu))];
const compiler = await compile('@import "tailwindcss";\n@import "./src/styles/theme.css";\n', {
  base: ui.pathname,
  onDependency() {},
});
// The theme imports the fonts' own stylesheets, whose relative URLs a file:// page cannot resolve; embed the Latin
// files instead and drop those rules.
const css = compiler.build(candidates).replaceAll(/@font-face\s*\{[^}]*\}/gu, "");

function embedded(family, path) {
  const data = readFileSync(require.resolve(path)).toString("base64");
  return `@font-face { font-family: "${family}"; font-style: normal; font-display: block; font-weight: 100 900; src: url(data:font/woff2;base64,${data}) format("woff2-variations"); }`;
}

const fonts = [
  embedded("Inter Variable", "@fontsource-variable/inter/files/inter-latin-wght-normal.woff2"),
  embedded(
    "JetBrains Mono Variable",
    "@fontsource-variable/jetbrains-mono/files/jetbrains-mono-latin-wght-normal.woff2",
  ),
].join("\n");

// The page's hash picks the variant: #light, #dark or #compact.
const script = `const variant = location.hash.slice(1);
document.documentElement.classList.toggle("dark", variant === "dark");
if (variant === "compact") document.documentElement.dataset.density = "compact";`;

const page = `<!doctype html>
<html>
<head>
<meta charset="utf-8">
<title>basis-ui screenshot page</title>
<script>${script}</script>
<style>${fonts}
${css}</style>
</head>
<body style="margin:0">
${body}
</body>
</html>
`;
writeFileSync(new URL("page.html", here), page);
console.log(`Wrote page.html (${String(Math.round(page.length / 1024))} kB)`);
