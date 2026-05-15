import { bundle } from "@remotion/bundler";
import { renderMedia, selectComposition, openBrowser } from "@remotion/renderer";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const id = process.argv[2] || "long";
const out = process.argv[3] || `/mnt/documents/smartcomment-${id}.mp4`;

console.log(`Bundling…`);
const bundled = await bundle({
  entryPoint: path.resolve(__dirname, "../src/index.ts"),
  webpackOverride: (c) => c,
});

const browser = await openBrowser("chrome", {
  browserExecutable: process.env.PUPPETEER_EXECUTABLE_PATH ?? "/bin/chromium",
  chromiumOptions: { args: ["--no-sandbox", "--disable-gpu", "--disable-dev-shm-usage"] },
  chromeMode: "chrome-for-testing",
});

const composition = await selectComposition({ serveUrl: bundled, id, puppeteerInstance: browser });
console.log(`Rendering ${id} → ${out} (${composition.durationInFrames} frames)`);

await renderMedia({
  composition,
  serveUrl: bundled,
  codec: "h264",
  outputLocation: out,
  puppeteerInstance: browser,
  concurrency: 2,
  onProgress: ({ progress }) => process.stdout.write(`\r  ${(progress * 100).toFixed(1)}%   `),
});

await browser.close({ silent: false });
console.log(`\nDone: ${out}`);
