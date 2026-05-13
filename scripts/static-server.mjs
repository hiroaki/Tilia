import { createReadStream } from "node:fs";
import { access, readFile, stat } from "node:fs/promises";
import { createServer } from "node:http";
import { extname, join, normalize, resolve } from "node:path";

const rootDir = process.cwd();
const host = process.env.HOST || "127.0.0.1";
const port = Number(process.argv[2] || process.env.PORT || 8010);

const contentTypes = {
  ".css": "text/css; charset=utf-8",
  ".gif": "image/gif",
  ".gpx": "application/gpx+xml; charset=utf-8",
  ".html": "text/html; charset=utf-8",
  ".jpeg": "image/jpeg",
  ".jpg": "image/jpeg",
  ".js": "text/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".map": "application/json; charset=utf-8",
  ".md": "text/markdown; charset=utf-8",
  ".mjs": "text/javascript; charset=utf-8",
  ".png": "image/png",
  ".svg": "image/svg+xml; charset=utf-8",
  ".txt": "text/plain; charset=utf-8",
  ".webp": "image/webp",
  ".xml": "application/xml; charset=utf-8",
};

function sendText(response, statusCode, body) {
  response.writeHead(statusCode, {
    "Content-Type": "text/plain; charset=utf-8",
    "Cache-Control": "no-store",
  });
  response.end(body);
}

async function resolvePath(urlPath) {
  const decodedPath = decodeURIComponent(urlPath.split("?")[0]);
  const normalizedPath = normalize(decodedPath).replace(/^([.][.][/\\])+/, "");
  const relativePath = normalizedPath.startsWith("/") ? normalizedPath.slice(1) : normalizedPath;
  let candidatePath = resolve(rootDir, relativePath);

  if (!candidatePath.startsWith(rootDir)) {
    throw new Error("Forbidden");
  }

  const candidateStat = await stat(candidatePath).catch(() => null);
  if (candidateStat?.isDirectory()) {
    candidatePath = join(candidatePath, "index.html");
  }

  return candidatePath;
}

const server = createServer(async (request, response) => {
  if (!request.url) {
    sendText(response, 400, "Bad Request");
    return;
  }

  if (!["GET", "HEAD"].includes(request.method || "GET")) {
    response.writeHead(405, { Allow: "GET, HEAD" });
    response.end();
    return;
  }

  let filePath;
  try {
    filePath = await resolvePath(request.url);
    await access(filePath);
  } catch (error) {
    const statusCode = error.message === "Forbidden" ? 403 : 404;
    sendText(response, statusCode, statusCode === 403 ? "Forbidden" : "Not Found");
    return;
  }

  const extension = extname(filePath).toLowerCase();
  const contentType = contentTypes[extension] || "application/octet-stream";

  if ((request.method || "GET") === "HEAD") {
    response.writeHead(200, {
      "Content-Type": contentType,
      "Cache-Control": "no-store",
    });
    response.end();
    return;
  }

  if (extension === ".html") {
    const html = await readFile(filePath);
    response.writeHead(200, {
      "Content-Type": contentType,
      "Cache-Control": "no-store",
    });
    response.end(html);
    return;
  }

  response.writeHead(200, {
    "Content-Type": contentType,
    "Cache-Control": "no-store",
  });
  createReadStream(filePath).pipe(response);
});

server.listen(port, host, () => {
  process.stdout.write(`Serving ${rootDir} at http://${host}:${port}\n`);
});