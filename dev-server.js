const http = require("node:http");
const fs = require("node:fs/promises");
const path = require("node:path");

const root = __dirname;
const rootPrefix = `${path.resolve(root)}${path.sep}`;
const port = Number(process.env.PORT || 5501);
const firebaseApiBase = process.env.FIREBASE_API_BASE || "https://graca-454ff.web.app";
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
  if (requestUrl.pathname.startsWith("/api/")) return proxyApi(request, response, requestUrl);
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

async function proxyApi(request, response, requestUrl) {
  if (!/^\/api\/(?:mercadopago\/(?:config|order|webhook)|public\/(?:reservation|message))$/.test(requestUrl.pathname)) {
    response.writeHead(404, { "Content-Type": "application/json; charset=utf-8" });
    return response.end(JSON.stringify({ error: "API não encontrada." }));
  }
  if (!["GET", "POST", "OPTIONS"].includes(request.method)) {
    response.writeHead(405, { Allow: "GET, POST, OPTIONS" });
    return response.end();
  }
  try {
    const headers = new Headers();
    for (const name of ["authorization", "content-type", "origin", "x-signature", "x-request-id"]) {
      const value = request.headers[name];
      if (typeof value === "string") headers.set(name, value);
    }
    let body;
    if (!["GET", "HEAD", "OPTIONS"].includes(request.method)) {
      const chunks = [];
      let size = 0;
      for await (const chunk of request) {
        size += chunk.length;
        if (size > 100 * 1024) {
          response.writeHead(413);
          return response.end("Solicitação muito grande.");
        }
        chunks.push(chunk);
      }
      body = Buffer.concat(chunks);
    }
    const target = new URL(`${requestUrl.pathname}${requestUrl.search}`, firebaseApiBase);
    const upstream = await fetch(target, { method: request.method, headers, body, redirect: "manual" });
    const responseHeaders = {};
    for (const name of ["content-type", "cache-control", "access-control-allow-origin", "access-control-allow-headers", "access-control-allow-methods", "access-control-max-age", "vary"]) {
      const value = upstream.headers.get(name);
      if (value) responseHeaders[name] = value;
    }
    response.writeHead(upstream.status, responseHeaders);
    return response.end(Buffer.from(await upstream.arrayBuffer()));
  } catch (error) {
    console.error("Firebase API proxy failed:", error.message);
    response.writeHead(502, { "Content-Type": "application/json; charset=utf-8" });
    return response.end(JSON.stringify({ error: "A API do Firebase está indisponível." }));
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
