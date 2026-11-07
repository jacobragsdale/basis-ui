// Screenshots page.html in light, dark and compact with Playwright's pinned Chromium, and prints what to send back:
// the Chromium version, the machine, and each screenshot's SHA-256. Run `npm install` and
// `npx playwright install chromium` in this folder first, then `node shoot.mjs`.
import { createHash } from "node:crypto";
import { mkdirSync, readFileSync } from "node:fs";
import { release } from "node:os";
import { pathToFileURL } from "node:url";

import { chromium } from "playwright";

const here = new URL("./", import.meta.url);
const out = new URL("out/", here);
mkdirSync(out, { recursive: true });

// No GPU, as on a Citrix desktop, and no font hinting, which varies with each machine's font settings.
const browser = await chromium.launch({ args: ["--disable-gpu", "--font-render-hinting=none"] });
const page = await browser.newPage({
  viewport: { width: 1100, height: 600 },
  deviceScaleFactor: 1,
});
const lines = [`chromium ${browser.version()}`, `kernel ${release()}`];
try {
  lines.push(`wsl ${readFileSync("/proc/version", "utf8").includes("microsoft") ? "yes" : "no"}`);
} catch {
  lines.push("wsl unknown");
}

for (const variant of ["light", "dark", "compact"]) {
  const target = pathToFileURL(new URL("page.html", here).pathname);
  target.hash = variant;
  await page.goto(target.href);
  await page.reload();
  await page.evaluate(async () => document.fonts.ready);
  const fontsLoaded = await page.evaluate(
    () =>
      document.fonts.check('16px "Inter Variable"') &&
      document.fonts.check('16px "JetBrains Mono Variable"'),
  );
  const file = new URL(`${variant}.png`, out);
  const png = await page.screenshot({ path: file.pathname, animations: "disabled" });
  const hash = createHash("sha256").update(png).digest("hex");
  lines.push(`${variant} ${hash} fonts=${String(fontsLoaded)}`);
}

await browser.close();
console.log(lines.join("\n"));
