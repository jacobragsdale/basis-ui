// Times each reader in headless Chromium, at full speed and with the CPU held to a quarter. See ../xlsx-reader.md.
import { createRequire } from "node:module";
import http from "node:http";
import fs from "node:fs";
import path from "node:path";
const require = createRequire(new URL("../../../../packages/ui/package.json", import.meta.url));
const { chromium } = require("playwright");
const dir = path.resolve("dist");
const types = { ".html": "text/html", ".js": "text/javascript", ".wasm": "application/wasm" };
const server = http
  .createServer((q, s) => {
    const f = path.join(dir, q.url.split("?")[0]);
    if (!fs.existsSync(f)) {
      s.writeHead(404);
      return s.end();
    }
    s.writeHead(200, { "content-type": types[path.extname(f)] ?? "application/octet-stream" });
    fs.createReadStream(f).pipe(s);
  })
  .listen(0);
const port = server.address().port;
const browser = await chromium.launch();
const page = await browser.newPage();
page.on("console", (m) => {
  if (m.type() === "error") console.log("console:", m.text());
});
page.on("pageerror", (e) => console.log("pageerror:", e.message));
await page.goto(`http://127.0.0.1:${port}/index.html`);
await page.waitForFunction(() => window.readers?.basis !== undefined);
await page.evaluate(() => window.initCalamine());
const cdp = await page.context().newCDPSession(page);
const plan = [
  [
    "positions-10k.xlsx",
    ["basis", "calamine", "handrolled", "sheetjs", "readExcelFile", "exceljs"],
  ],
  [
    "positions-60k.xlsx",
    ["basis", "calamine", "handrolled", "sheetjs", "readExcelFile", "exceljs"],
  ],
  ["positions-10k.xls", ["calamine", "sheetjs"]],
];
for (const rate of [1, 4]) {
  await cdp.send("Emulation.setCPUThrottlingRate", { rate });
  for (const [file, readers] of plan) {
    for (const name of readers) {
      const result = await page
        .evaluate(
          async ([file, name]) => {
            const bytes = await (await fetch(file)).arrayBuffer();
            const times = [];
            let rows;
            for (let i = 0; i < 6; i++) {
              const t = performance.now();
              rows = await window.readers[name](bytes.slice(0));
              if (i > 0) times.push(performance.now() - t);
            }
            times.sort((a, b) => a - b);
            const flat = (r) => (Array.isArray(r) ? r : (r?.rows ?? r?.[0]?.data ?? r));
            const all = flat(rows);
            return {
              median: Math.round(times[2]),
              rows: all.length,
              sample: JSON.stringify(all[1]).slice(0, 160),
            };
          },
          [file, name],
        )
        .catch((e) => ({ error: String(e).slice(0, 200) }));
      console.log(`x${rate}\t${file}\t${name}\t${JSON.stringify(result)}`);
    }
  }
}
await browser.close();
server.close();
