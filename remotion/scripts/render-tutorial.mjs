import { bundle } from "@remotion/bundler";
import { renderMedia, renderStill, selectComposition, openBrowser } from "@remotion/renderer";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const mode = process.argv[2] || "video"; // "video" | "still"
const out = process.argv[3] || "/mnt/documents/smartcomment-tutorial.mp4";
const frame = Number(process.argv[4] ?? 260);
const range = process.argv[5]; // "start-end"

const bundled = await bundle({
  entryPoint: path.resolve(__dirname, "../src/index.ts"),
  webpackOverride: (c) => c,
});

const browser = await openBrowser("chrome", {
  browserExecutable: process.env.PUPPETEER_EXECUTABLE_PATH ?? "/bin/chromium",
  chromiumOptions: { args: ["--no-sandbox", "--disable-gpu", "--disable-dev-shm-usage"] },
  chromeMode: "chrome-for-testing",
});

const composition = await selectComposition({ serveUrl: bundled, id: "tutorial", puppeteerInstance: browser });

if (mode === "still") {
  await renderStill({ composition, serveUrl: bundled, output: out, frame, puppeteerInstance: browser });
} else {
  await renderMedia({
    composition,
    serveUrl: bundled,
    codec: "h264",
    outputLocation: out,
    puppeteerInstance: browser,
    muted: true,
    concurrency: 4,
    frameRange: range ? range.split("-").map(Number) : undefined,
    onProgress: ({ progress }) => process.stdout.write(`\r${(progress * 100).toFixed(1)}%   `),
  });
}

await browser.close({ silent: false });
console.log(`\nDone: ${out} (${composition.durationInFrames} frames)`);
