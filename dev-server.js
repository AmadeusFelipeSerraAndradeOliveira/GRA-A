const http = require("node:http");
const fs = require("node:fs/promises");
const path = require("node:path");

const root = __dirname;
const rootPrefix = `${path.resolve(root)}${path.sep}`;
const port = Number(process.env.PORT || 5501);
const upstreamOrigin = "https://graca-454ff.web.app";
const apiPaths = new Set([
  "/api/mercadopago/config",
  "/api/mercadopago/order"
]);
const blockedRoots = new Set([
  ".git", ".firebase", "node_modules", "functions",
  "firebase.json", "firestore.rules", ".firebaserc",
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

function replyJson(response, status, payload) {
  response.writeHead(status, { "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store" });
  response.end(JSON.stringify(payload));
}

async function proxyMarketplaceApi(request, response, requestUrl) {
  if (!apiPaths.has(requestUrl.pathname)) return replyJson(response, 404, { error: "Rota de desenvolvimento não encontrada." });
  if (!["GET", "POST", "OPTIONS"].includes(request.method)) return replyJson(response, 405, { error: "Método não permitido." });

  const headers = new Headers();
  for (const name of ["authorization", "content-type", "accept"]) {
    const value = request.headers[name];
    if (value) headers.set(name, value);
  }
  let body;
  if (!["GET", "HEAD", "OPTIONS"].includes(request.method)) {
    const chunks = [];
    for await (const chunk of request) chunks.push(chunk);
    body = Buffer.concat(chunks);
  }

  try {
    const upstreamUrl = new URL(`${requestUrl.pathname}${requestUrl.search}`, upstreamOrigin);
    const upstream = await fetch(upstreamUrl, {
      method: request.method,
      headers,
      body,
      signal: AbortSignal.timeout(30000)
    });
    const responseHeaders = {
      "Content-Type": upstream.headers.get("content-type") || "application/json; charset=utf-8",
      "Cache-Control": "no-store"
    };
    const cacheControl = upstream.headers.get("cache-control");
    if (cacheControl) responseHeaders["Cache-Control"] = cacheControl;
    response.writeHead(upstream.status, responseHeaders);
    response.end(Buffer.from(await upstream.arrayBuffer()));
    console.log(`${request.method} ${requestUrl.pathname} -> ${upstream.status}`);
  } catch (error) {
    console.error(`Falha no proxy ${requestUrl.pathname}: ${error.message}`);
    replyJson(response, 502, { error: "Não foi possível alcançar o serviço Firebase." });
  }
}

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
  if (requestUrl.pathname.startsWith("/api/mercadopago/")) return proxyMarketplaceApi(request, response, requestUrl);
  return serveStatic(request, response, requestUrl);
});

server.listen(port, "127.0.0.1", () => {
  console.log(`GRAÇA GMC em http://localhost:${port}`);
  console.log("As rotas /api/mercadopago são encaminhadas ao Firebase sem chamada CORS do navegador.");
});

for (const signal of ["SIGINT", "SIGTERM"]) {
  process.on(signal, () => server.close(() => process.exit(0)));
}
