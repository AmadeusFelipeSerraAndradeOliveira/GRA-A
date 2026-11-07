const allowedTypes = new Set(['image/jpeg', 'image/png', 'image/webp']);
const maxImageBytes = 5 * 1024 * 1024;
let cachedKeys = null;
let cachedKeysAt = 0;

function corsHeaders(origin, env) {
  const allowed = (env.ALLOWED_ORIGINS || '').split(',').map(value => value.trim()).filter(Boolean);
  if (!origin || !allowed.includes(origin)) return null;
  return {
    'Access-Control-Allow-Origin': origin,
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Authorization, Content-Type',
    'Access-Control-Max-Age': '600',
    'Vary': 'Origin'
  };
}

function json(data, status, cors = {}) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store', ...cors }
  });
}

function decodeBase64Url(input) {
  const normalized = input.replace(/-/g, '+').replace(/_/g, '/');
  const binary = atob(normalized.padEnd(Math.ceil(normalized.length / 4) * 4, '='));
  return Uint8Array.from(binary, character => character.charCodeAt(0));
}

function decodeJsonPart(input) {
  return JSON.parse(new TextDecoder().decode(decodeBase64Url(input)));
}

async function getSigningKeys() {
  if (cachedKeys && Date.now() - cachedKeysAt < 50 * 60 * 1000) return cachedKeys;
  const response = await fetch('https://www.googleapis.com/service_accounts/v1/jwk/securetoken@system.gserviceaccount.com', { cf: { cacheTtl: 3600 } });
  if (!response.ok) throw new Error('Não foi possível validar o login do Firebase.');
  const body = await response.json();
  cachedKeys = body.keys || [];
  cachedKeysAt = Date.now();
  return cachedKeys;
}

async function verifyFirebaseToken(token, projectId) {
  const parts = token.split('.');
  if (parts.length !== 3) throw new Error('Token de login inválido.');
  const header = decodeJsonPart(parts[0]);
  const claims = decodeJsonPart(parts[1]);
  if (header.alg !== 'RS256' || !header.kid) throw new Error('Token de login inválido.');
  const now = Math.floor(Date.now() / 1000);
  if (claims.aud !== projectId || claims.iss !== `https://securetoken.google.com/${projectId}`
      || !claims.sub || claims.sub.length > 128 || !claims.exp || claims.exp <= now
      || !claims.iat || claims.iat > now + 60 || now - claims.iat > 3600
      || claims.email_verified !== true || claims.firebase?.sign_in_provider === 'anonymous') {
    throw new Error('A sessão precisa ser uma conta de administrador verificada.');
  }
  const jwk = (await getSigningKeys()).find(key => key.kid === header.kid);
  if (!jwk) throw new Error('A chave de assinatura do Firebase foi atualizada. Tente novamente.');
  const publicKey = await crypto.subtle.importKey('jwk', jwk, { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' }, false, ['verify']);
  const signingInput = new TextEncoder().encode(`${parts[0]}.${parts[1]}`);
  const valid = await crypto.subtle.verify('RSASSA-PKCS1-v1_5', publicKey, decodeBase64Url(parts[2]), signingInput);
  if (!valid) throw new Error('Token de login inválido.');
  return claims;
}

async function isAdmin(claims, token, env) {
  if (claims.admin === true) return true;
  const url = `https://firestore.googleapis.com/v1/projects/${encodeURIComponent(env.FIREBASE_PROJECT_ID)}/databases/(default)/documents/admins/${encodeURIComponent(claims.sub)}`;
  const response = await fetch(url, { headers: { Authorization: `Bearer ${token}` } });
  return response.ok;
}

async function sha1Hex(value) {
  const digest = await crypto.subtle.digest('SHA-1', new TextEncoder().encode(value));
  return [...new Uint8Array(digest)].map(byte => byte.toString(16).padStart(2, '0')).join('');
}

async function validateImageBytes(file) {
  const bytes = new Uint8Array(await file.arrayBuffer());
  const jpeg = bytes.length > 3 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff;
  const png = bytes.length > 8 && bytes[0] === 0x89 && bytes[1] === 0x50 && bytes[2] === 0x4e && bytes[3] === 0x47
    && bytes[4] === 0x0d && bytes[5] === 0x0a && bytes[6] === 0x1a && bytes[7] === 0x0a;
  const webp = bytes.length > 12 && String.fromCharCode(...bytes.slice(0, 4)) === 'RIFF'
    && String.fromCharCode(...bytes.slice(8, 12)) === 'WEBP';
  if (!(jpeg || png || webp)) throw new Error('O conteúdo do arquivo não corresponde a JPEG, PNG ou WebP.');
  return new Blob([bytes], { type: file.type });
}

export default {
  async fetch(request, env) {
    const origin = request.headers.get('Origin');
    const cors = corsHeaders(origin, env);
    if (!cors) return json({ error: 'Origem não autorizada.' }, 403);
    if (request.method === 'OPTIONS') return new Response(null, { status: 204, headers: cors });
    if (request.method !== 'POST') return json({ error: 'Método não permitido.' }, 405, cors);

    try {
      const authorization = request.headers.get('Authorization') || '';
      const token = authorization.startsWith('Bearer ') ? authorization.slice(7) : '';
      if (!token) return json({ error: 'Entre em uma conta administradora confirmada.' }, 401, cors);
      const claims = await verifyFirebaseToken(token, env.FIREBASE_PROJECT_ID);
      if (!await isAdmin(claims, token, env)) return json({ error: 'Somente administradores autorizados podem enviar imagens.' }, 403, cors);

      const form = await request.formData();
      const file = form.get('file');
      if (!(file instanceof File)) return json({ error: 'Selecione uma imagem.' }, 400, cors);
      if (!allowedTypes.has(file.type) || file.size < 1 || file.size > maxImageBytes) {
        return json({ error: 'Use JPEG, PNG ou WebP com até 5 MB.' }, 400, cors);
      }
      if (!env.CLOUDINARY_CLOUD_NAME || !env.CLOUDINARY_API_KEY || !env.CLOUDINARY_API_SECRET) {
        return json({ error: 'O administrador ainda precisa configurar os segredos do Cloudinary no Worker.' }, 503, cors);
      }

      const safeFile = await validateImageBytes(file);
      const timestamp = Math.floor(Date.now() / 1000).toString();
      const folder = 'graca/products';
      const publicId = crypto.randomUUID();
      const signature = await sha1Hex(`folder=${folder}&public_id=${publicId}&timestamp=${timestamp}${env.CLOUDINARY_API_SECRET}`);
      const upload = new FormData();
      upload.append('file', safeFile, 'product-image');
      upload.append('api_key', env.CLOUDINARY_API_KEY);
      upload.append('timestamp', timestamp);
      upload.append('folder', folder);
      upload.append('public_id', publicId);
      upload.append('signature', signature);
      const response = await fetch(`https://api.cloudinary.com/v1_1/${encodeURIComponent(env.CLOUDINARY_CLOUD_NAME)}/image/upload`, {
        method: 'POST', body: upload
      });
      const result = await response.json();
      if (!response.ok || !result.secure_url) {
        console.error('Cloudinary upload falhou:', response.status, result.error?.message || 'sem detalhe');
        return json({ error: 'O Cloudinary não aceitou o envio. Confira a conta e tente novamente.' }, 502, cors);
      }
      return json({ secure_url: result.secure_url, public_id: result.public_id }, 200, cors);
    } catch (error) {
      const status = /token|login|sessão/i.test(error?.message || '') ? 401 : 400;
      console.error('Falha no upload protegido:', error?.message || error);
      return json({ error: error?.message || 'Não foi possível enviar a imagem.' }, status, cors);
    }
  }
};

