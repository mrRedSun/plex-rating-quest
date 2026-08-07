import { createReadStream } from "node:fs";
import { stat } from "node:fs/promises";
import type { ServerResponse } from "node:http";
import { extname, join, normalize } from "node:path";
import { json } from "./http.js";

const MIME_TYPES: Readonly<Record<string, string>> = {
  ".css": "text/css; charset=utf-8",
  ".html": "text/html; charset=utf-8",
  ".ico": "image/x-icon",
  ".js": "text/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".svg": "image/svg+xml",
  ".woff2": "font/woff2",
};

export async function serveStatic(
  response: ServerResponse,
  pathname: string,
  staticDirectory: string,
): Promise<void> {
  const normalized = normalize(pathname).replace(/^\/+/, "");
  let file = join(staticDirectory, normalized);
  if (file !== staticDirectory && !file.startsWith(`${staticDirectory}/`))
    return json(response, 404, { error: "Not found" });
  try {
    if ((await stat(file)).isDirectory()) file = join(file, "index.html");
  } catch {
    file = join(staticDirectory, "index.html");
  }
  try {
    const details = await stat(file);
    response.writeHead(200, {
      "Content-Type": MIME_TYPES[extname(file)] ?? "application/octet-stream",
      "Content-Length": details.size,
      "Cache-Control": file.includes("/assets/")
        ? "public, max-age=31536000, immutable"
        : "no-cache",
    });
    createReadStream(file).pipe(response);
  } catch {
    json(response, 404, { error: "Not found" });
  }
}
