const fs = require('node:fs');
const path = require('node:path');
const { spawnSync } = require('node:child_process');

const root = path.resolve(__dirname, '..');
const publicDir = path.join(root, 'public');
const sourceFiles = [
  'app.js', 'firebase.js', 'catalog-seed.js', 'dev-server.js',
  'cloudinary-worker/src/index.js', 'functions/index.js'
];
const hostingFiles = [
  'index.html', 'style.css', 'app.js', 'firebase.js', 'catalog-seed.js',
  'assets/graca-editorial-background.jfif'
];
let failed = false;
const fail = message => { failed = true; process.stderr.write(`Falha: ${message}\n`); };
const ok = message => process.stdout.write(`OK ${message}.\n`);

fs.mkdirSync(publicDir, { recursive: true });
for (const file of hostingFiles) {
  const source = path.join(root, file);
  if (!fs.existsSync(source)) { fail(`arquivo de Hosting ausente: ${file}`); continue; }
  const destination = path.join(publicDir, file);
  fs.mkdirSync(path.dirname(destination), { recursive: true });
  fs.copyFileSync(source, destination);
}

for (const file of sourceFiles) {
  const result = spawnSync(process.execPath, ['--check', path.join(root, file)], { encoding: 'utf8' });
  if (result.status !== 0) fail(`sintaxe em ${file}: ${result.stderr || result.stdout}`);
  else ok(`sintaxe de ${file}`);
}
for (const file of ['firebase.json', 'firestore.indexes.json', 'package.json', 'functions/package.json']) {
  try { JSON.parse(fs.readFileSync(path.join(root, file), 'utf8')); ok(`JSON de ${file}`); }
  catch (error) { fail(`JSON inválido em ${file}: ${error.message}`); }
}
for (const file of hostingFiles) {
  const source = path.join(root, file), hosted = path.join(publicDir, file);
  if (fs.existsSync(source) && fs.existsSync(hosted) && !fs.readFileSync(source).equals(fs.readFileSync(hosted))) {
    fail(`cópia divergente do Hosting: ${file}`);
  }
}
if (!failed) ok('arquivos públicos sincronizados');

const app = fs.readFileSync(path.join(root, 'app.js'), 'utf8');
const rules = fs.readFileSync(path.join(root, 'firestore.rules'), 'utf8');
const worker = fs.readFileSync(path.join(root, 'cloudinary-worker/src/index.js'), 'utf8');
const functions = fs.readFileSync(path.join(root, 'functions/index.js'), 'utf8');
const seed = fs.readFileSync(path.join(root, 'catalog-seed.js'), 'utf8');
const html = fs.readFileSync(path.join(root, 'index.html'), 'utf8');
const workerConfig = fs.readFileSync(path.join(root, 'cloudinary-worker/wrangler.toml'), 'utf8');
const checks = [
  ['UID e origem IP impõem limite do servidor', /readFormRateLimits[\s\S]*lastSubmissionAt\(ipLimit\)/.test(functions) && /PUBLIC_FORM_RATE_LIMIT_KEY/.test(functions) && /normalizedSourceIp/.test(functions)],
  ['pagamentos PIX/cartão limitam novas reservas também por rede de origem', /exports\.mercadopagoOrder[\s\S]*PUBLIC_FORM_RATE_LIMIT_KEY[\s\S]*sourceIpHash\(normalizedSourceIp\(req\), PUBLIC_FORM_RATE_LIMIT_KEY\.value\(\), "payment"\)/.test(functions)],
  ['consulta do status de pagamento limita chamadas por conta e rede', /sourceIpHash\(normalizedSourceIp\(req\), PUBLIC_FORM_RATE_LIMIT_KEY\.value\(\), "payment-poll"\)/.test(functions) && /"paymentPoll", user\.uid, ipHash, 5000/.test(functions)],
  ['cupom exige sessão verificada e benefício VIP ativo no servidor', /VIP_REQUIRED/.test(functions) && /user\.email_verified !== true/.test(functions) && /vipSnapshot\?\.data\(\)\?\.status !== "active"/.test(functions)],
  ['rota de pagamento legado exige cupom publicado e VIP ativo', /liveVip\?\.data\(\)\?\.status !== "active"/.test(functions) && /coupon\.status !== "published"/.test(functions)],
  ['limite de usos de cupom é reservado e liquidado ao fechar o pedido', /reservedUses: admin\.firestore\.FieldValue\.increment\(1\)/.test(functions) && /exports\.settleReservationCoupon/.test(functions) && /couponCounted/.test(functions)],
  ['rotação de endereço IPv6 é agrupada por rede /64', /ipv6-64:/.test(functions) && /slice\(0, 4\)/.test(functions)],
  ['criação pública de pedidos e mensagens passa pela API protegida', /match \/orders\/[\s\S]*?allow create: if false;/.test(rules) && /match \/messages\/[\s\S]*?allow create: if false;/.test(rules) && /publicReservation/.test(functions) && /publicMessage/.test(functions)],
  ['envios públicos validam token Firebase e gravam por transação', /requestUser\(req\)/.test(functions) && /db\.runTransaction\(async transaction =>/.test(functions)],
  ['galeria admite no máximo cinco fotos re-hospedadas no Cloudinary', /multiple/.test(app) && /gallery\.length\+files\.length>5/.test(app) && /sourceUrl/.test(app) && /allowed_formats=/.test(worker)],
  ['URLs externas passam pelo Worker e a URL segura retorna do Cloudinary', /validateRemoteImageUrl/.test(worker) && /result\.secure_url/.test(worker) && /isCloudinaryUrl\(result\.secure_url\)/.test(app)],
  ['fotos e senha Cloudinary não são aceitas diretamente no banco', /data\.imageUrl\.matches\('https:\/\/res\\\\\.cloudinary\\\\\.com/.test(rules) && !/CLOUDINARY_API_SECRET/.test(html + app + fs.readFileSync(path.join(root, 'firebase.js'), 'utf8'))],
  ['cadastros VIP só podem ser concedidos por administradores', /match \/vipUsers\/[\s\S]*?allow create: if isAdmin\(\) && validVipMember/.test(rules) && !/ensureVipMembership/.test(app)],
  ['e-mail VIP é enfileirado após ativação e exige link configurado', /queueVipWelcomeEmail/.test(functions) && /collection\("mail"\)/.test(functions) && /inviteUrl/.test(functions)],
  ['formulário de contato valida o elemento antes do reset', /const formElement=event\.currentTarget/.test(app) && /formElement\.reset\(\)/.test(app)],
  ['cupom pode ser aplicado no carrinho e benefícios atualizam em tempo real', /id="couponForm"/.test(app) && /applyCartCoupon/.test(app) && /data-delete-offer/.test(app) && /onSnapshot\(query\(collection\(db,'coupons'\)/.test(app)],
  ['painel de VIP, busca, bloqueio e WhatsApp estão ligados a dados em tempo real', /renderAdminCustomers/.test(app) && /adminVipSearch/.test(app) && /data-vip-status/.test(app) && /wa\.me\//.test(app) && /collection\(db, 'vipUsers'\)/.test(app)],
  ['produtos podem ser buscados, desativados ou removidos sem apagar pedidos', /adminProductSearch/.test(app) && /toggleProductActive/.test(app) && /deleteProduct/.test(app) && /allow delete: if false;/.test(rules)],
  ['marca usa as imagens e o slogan fornecidos', /brand-story-grid/.test(html) && /Gente, Moda, Comunidade/.test(html) && /v1794143992/.test(html)],
  ['oito produtos de exemplo referenciam fotos enviadas', (seed.match(/id: 'seed-/g) || []).length === 8 && /v1794144056/.test(seed) && /v1794144028/.test(seed)],
  ['rótulo e conteúdo de produto ficam como rascunho ao importar', /active:false/.test(app) && /priceMinCents/.test(seed) && /Math\.floor\(Math\.random\(\)\*46\)\+5/.test(app)],
  ['relatórios financeiros e visão geral usam áreas separadas', /function renderFinanceAnalytics/.test(app) && /function renderAdminOverview/.test(app)],
  ['ordens e cadastros de clientes não podem ser excluídos', /match \/orders\/[\s\S]*?allow delete: if false;/.test(rules) && /match \/customers\/[\s\S]*?allow delete: if false;/.test(rules)],
  ['origem local está autorizada para o Worker de imagem', /127\.0\.0\.1:5501/.test(workerConfig)]
];
for (const [label, passed] of checks) passed ? ok(label) : fail(label);

const rulesAudit = fs.readFileSync(path.join(root, 'FIRESTORE_RULES_REVIEW.md'), 'utf8');
if (/allow create: if false/.test(rules) && /publicReservation|publicMessage/.test(rulesAudit + functions)) ok('regras mantêm criação pública fora do cliente');
else fail('regras não estão ligadas à API de formulários');

if (failed) process.exit(1);
process.stdout.write('Verificação local concluída. Isso não substitui Firebase Emulator nem um envio de teste em produção.\n');
