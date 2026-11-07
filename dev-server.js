const http = require("node:http");
const fs = require("node:fs/promises");
const path = require("node:path");

const root = __dirname;
const rootPrefix = `${path.resolve(root)}${path.sep}`;
const port = Number(process.env.PORT || 5501);
const blockedRoots = new Set([
  ".git", ".firebase", "node_modules", "functions",
  "firebase.json", "firestore.rules", ".firebaserc", "cloudinary-worker", "scripts",
  ".gitignore", "package.json", "package-lock.json",
  "README.md", "FIRESTORE_RULES_REVIEW.md"
]);
const mimeTypes = {
  ".css": "text/css; charset=utf-8",
  ".html": "text/html; charset=utf-8",
  ".ico": "image/x-icon",
  ".jfif": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".jpg": "image/jpeg",
  ".js": "text/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".png": "image/png",
  ".svg": "image/svg+xml",
  ".webp": "image/webp"
};

async function serveStatic(request, response, requestUrl) {
  if (!["GET", "HEAD"].includes(request.method)) {
    response.writeHead(405, { Allow: "GET, HEAD" });
    return response.end();
  }

  let decodedPath;
  try { decodedPath = decodeURIComponent(requestUrl.pathname); }
  catch { response.writeHead(400); return response.end("Caminho inválido."); }
  const segments = decodedPath.split("/").filter(Boolean);
  if (segments.some(segment => segment.startsWith(".")) || segments.some(segment => blockedRoots.has(segment))) {
    response.writeHead(404);
    return response.end("Não encontrado.");
  }

  const relativePath = decodedPath === "/" ? "index.html" : decodedPath.replace(/^\/+/, "");
  const filePath = path.resolve(root, relativePath);
  if (!filePath.startsWith(rootPrefix)) {
    response.writeHead(403);
    return response.end("Acesso negado.");
  }
  try {
    const contents = await fs.readFile(filePath);
    response.writeHead(200, {
      "Content-Type": mimeTypes[path.extname(filePath).toLowerCase()] || "application/octet-stream",
      "Cache-Control": "no-store"
    });
    response.end(request.method === "HEAD" ? undefined : contents);
  } catch {
    response.writeHead(404);
    response.end("Não encontrado.");
  }
}

const server = http.createServer(async (request, response) => {
  const requestUrl = new URL(request.url || "/", `http://${request.headers.host || `localhost:${port}`}`);
  return serveStatic(request, response, requestUrl);
});

server.listen(port, "127.0.0.1", () => {
  console.log(`GRAÇA GMC em http://localhost:${port}`);
});

for (const signal of ["SIGINT", "SIGTERM"]) {
  process.on(signal, () => server.close(() => process.exit(0)));
}

