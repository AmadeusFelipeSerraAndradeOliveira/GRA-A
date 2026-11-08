const http = require('node:http');
const fs = require('node:fs/promises');
const path = require('node:path');

const root = path.resolve(__dirname);
const rootPrefix = `${root}${path.sep}`;
const port = Number(process.env.PORT || 5501);
const blockedRoots = new Set([
  '.git', '.firebase', 'node_modules', 'functions', 'cloudinary-worker', 'scripts',
  'firebase.json', 'firestore.rules', 'firestore.indexes.json', '.firebaserc',
  '.gitignore', 'package.json', 'package-lock.json', 'README.md', 'FIRESTORE_RULES_REVIEW.md'
]);
const mimeTypes = {
  '.css': 'text/css; charset=utf-8', '.html': 'text/html; charset=utf-8',
  '.ico': 'image/x-icon', '.jfif': 'image/jpeg', '.jpeg': 'image/jpeg',
  '.jpg': 'image/jpeg', '.js': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8', '.png': 'image/png',
  '.svg': 'image/svg+xml', '.webp': 'image/webp'
};

const server = http.createServer(async (request, response) => {
  if (!['GET', 'HEAD'].includes(request.method)) {
    response.writeHead(405, { Allow: 'GET, HEAD' });
    return response.end();
  }

  let pathname;
  try { pathname = decodeURIComponent(new URL(request.url || '/', 'http://localhost').pathname); }
  catch { response.writeHead(400); return response.end('Caminho inválido.'); }

  const segments = pathname.split('/').filter(Boolean);
  if (segments.some(segment => segment.startsWith('.') || blockedRoots.has(segment))) {
    response.writeHead(404); return response.end('Não encontrado.');
  }

  const relative = pathname === '/' ? 'index.html' : pathname.replace(/^\/+/, '');
  const filePath = path.resolve(root, relative);
  if (!filePath.startsWith(rootPrefix)) {
    response.writeHead(403); return response.end('Acesso negado.');
  }

  try {
    const content = await fs.readFile(filePath);
    response.writeHead(200, {
      'Content-Type': mimeTypes[path.extname(filePath).toLowerCase()] || 'application/octet-stream',
      'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff'
    });
    response.end(request.method === 'HEAD' ? undefined : content);
  } catch {
    response.writeHead(404); response.end('Não encontrado.');
  }
});

server.listen(port, '127.0.0.1', () => {
  console.log(`GRAÇA GMC em http://127.0.0.1:${port}`);
});

for (const signal of ['SIGINT', 'SIGTERM']) {
  process.on(signal, () => server.close(() => process.exit(0)));
}

