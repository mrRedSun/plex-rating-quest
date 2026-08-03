import { gzipSync } from "node:zlib";
import { readFile, readdir } from "node:fs/promises";
import { extname, join, relative } from "node:path";
import { fileURLToPath } from "node:url";

const root = fileURLToPath(new URL("../dist/", import.meta.url));
const limits = { javascriptTotal: 230 * 1024, javascriptChunk: 95 * 1024, cssTotal: 35 * 1024 };

async function files(directory) {
  const entries = await readdir(directory, { withFileTypes: true });
  const nested = await Promise.all(entries.map((entry) => entry.isDirectory() ? files(join(directory, entry.name)) : [join(directory, entry.name)]));
  return nested.flat();
}

const assets = await files(root);
const measured = await Promise.all(assets.filter((file) => [".css", ".js"].includes(extname(file))).map(async (file) => {
  const content = await readFile(file);
  return { file: relative(root, file), type: extname(file), raw: content.byteLength, gzip: gzipSync(content, { level: 9 }).byteLength };
}));
const javascript = measured.filter((asset) => asset.type === ".js");
const css = measured.filter((asset) => asset.type === ".css");
const javascriptTotal = javascript.reduce((total, asset) => total + asset.gzip, 0);
const cssTotal = css.reduce((total, asset) => total + asset.gzip, 0);
const oversized = javascript.filter((asset) => asset.gzip > limits.javascriptChunk);

if (javascriptTotal > limits.javascriptTotal || cssTotal > limits.cssTotal || oversized.length > 0) {
  throw new Error(`Bundle budget exceeded: JS ${javascriptTotal}/${limits.javascriptTotal} bytes gzip; CSS ${cssTotal}/${limits.cssTotal} bytes gzip; oversized chunks: ${oversized.map((asset) => asset.file).join(", ") || "none"}`);
}

process.stdout.write(`Bundle budget passed: ${(javascriptTotal / 1024).toFixed(1)} KiB JS and ${(cssTotal / 1024).toFixed(1)} KiB CSS (gzip).\n`);
