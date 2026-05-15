import { bundle } from "@remotion/bundler";
import { renderMedia, selectComposition, openBrowser } from "@remotion/renderer";
import path from "path";
import { fileURLToPath } from "url";
import { execSync } from "child_process";
import fs from "fs";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const id = process.argv[2] || "long";
const finalOut = process.argv[3] || `/mnt/documents/smartcomment-${id}.mp4`;
const silentOut = `/tmp/${id}-silent.mp4`;
const audio = path.resolve(__dirname, "..", "public", "audio", id === "long" ? "vo60.mp3" : "vo30.mp3");

console.log("Bundling…");
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
console.log(`Rendering ${id} silent → ${silentOut} (${composition.durationInFrames} frames)`);

await renderMedia({
  composition,
  serveUrl: bundled,
  codec: "h264",
  outputLocation: silentOut,
  puppeteerInstance: browser,
  concurrency: 2,
  muted: true,
  onProgress: ({ progress }) => process.stdout.write(`\r  ${(progress * 100).toFixed(1)}%   `),
});

await browser.close({ silent: false });

console.log(`\nMuxing audio → ${finalOut}`);
fs.mkdirSync(path.dirname(finalOut), { recursive: true });
execSync(
  `ffmpeg -y -i "${silentOut}" -i "${audio}" -c:v copy -c:a aac -b:a 192k -shortest "${finalOut}"`,
  { stdio: "inherit" }
);
console.log(`Done: ${finalOut}`);
