const fs = require('node:fs');
const path = require('node:path');
const { spawnSync } = require('node:child_process');

const root = path.resolve(__dirname, '..');
const files = ['app.js', 'firebase.js', 'catalog-seed.js', 'dev-server.js', 'cloudinary-worker/src/index.js', 'functions/index.js'];
const hostingFiles = ['index.html', 'style.css', 'app.js', 'firebase.js', 'catalog-seed.js', 'assets/graca-editorial-background.jfif'];
const publicDir = path.join(root, 'public');
fs.mkdirSync(publicDir, { recursive: true });
for (const file of hostingFiles) {
  const source = path.join(root, file);
  if (!fs.existsSync(source)) {
    process.stderr.write(`Arquivo de origem ausente para Firebase Hosting: ${file}\n`);
    process.exit(1);
  }
  const destination = path.join(publicDir, file);
  fs.mkdirSync(path.dirname(destination), { recursive: true });
  fs.copyFileSync(source, destination);
}
process.stdout.write('Arquivos do Firebase Hosting sincronizados em public/.\n');
let failed = false;

for (const file of files) {
  const fullPath = path.join(root, file);
  const result = spawnSync(process.execPath, ['--check', fullPath], { encoding: 'utf8' });
  if (result.status !== 0) {
    failed = true;
    process.stderr.write(`Falha de sintaxe em ${file}:\n${result.stderr || result.stdout}`);
  } else {
    process.stdout.write(`OK sintaxe: ${file}\n`);
  }
}

for (const file of ['index.html', 'style.css', 'firestore.rules']) {
  if (!fs.existsSync(path.join(root, file))) {
    failed = true;
    process.stderr.write(`Arquivo necessário ausente: ${file}\n`);
  }
}
for (const file of hostingFiles) {
  const source = fs.readFileSync(path.join(root, file));
  const hosted = fs.readFileSync(path.join(publicDir, file));
  if (!source.equals(hosted)) {
    failed = true;
    process.stderr.write(`Arquivo desatualizado em public/: ${file}\n`);
  }
}

const html = fs.readFileSync(path.join(root, 'index.html'), 'utf8');
const app = fs.readFileSync(path.join(root, 'app.js'), 'utf8');
const rules = fs.readFileSync(path.join(root, 'firestore.rules'), 'utf8');
const seed = fs.readFileSync(path.join(root, 'catalog-seed.js'), 'utf8');
const workerConfig = fs.readFileSync(path.join(root, 'cloudinary-worker/wrangler.toml'), 'utf8');
const paymentFunctions = fs.readFileSync(path.join(root, 'functions/index.js'), 'utf8');
const productValidator = rules.slice(rules.indexOf('function validProduct(data)'), rules.indexOf('function validProductCost(data)'));
const benefitUi = app.slice(app.indexOf('function offerEditor'), app.indexOf('async function toggleOffer'));
if (/sdk\.mercadopago\.com|payments\.js|payment-config\.js/i.test(html + app)) {
  failed = true;
  process.stderr.write('O fluxo antigo de pagamento ainda está carregado pelo site.\n');
} else {
  process.stdout.write('OK fluxo antigo de pagamento fora da vitrine.\n');
}

const requiredFlows = [
  ['Upload Cloudinary obrigatório', /isCloudinaryUrl\(imageUrl\).*isCloudinaryPublicId\(imagePublicId\)/s.test(app) && /secure_url/.test(app)],
  ['Importação de exemplos como rascunho', /function importExampleProducts/.test(app) && /active:false/.test(app) && /Math\.floor\(Math\.random\(\)\*46\)\+5/.test(app)],
  ['Fechamento com dados financeiros', /async function finalizeReservationSale/.test(app) && /installmentValueCents/.test(app) && /salesChannel/.test(app)],
  ['Aba financeira separada', /function renderFinanceAnalytics/.test(app) && /function renderAdminOverview/.test(app)],
  ['Editor visual de cupom e campanha', benefitUi.includes('offerPreviewTitle') && benefitUi.includes('offerEditorForm') && !/\bprompt\s*\(/.test(benefitUi)],
  ['Imagens Cloudinary otimizadas na entrega', /cloudinaryDeliveryUrl/.test(app) && /f_auto,q_auto,c_limit,w_/.test(app)],
  ['Custos de aquisição em coleção privada', /match \/productCosts\//.test(rules) && /allow get, list: if isAdmin\(\)/.test(rules) && !/\bcost\b/.test(productValidator) && /productCosts/.test(app) && /cost:deleteField\(\)/.test(app)],
  ['Preço recalculado dentro da reserva transacional', /runTransaction\(async transaction => \{[\s\S]*?const saleItems = normalized\.map/.test(paymentFunctions) && /const basePrice = moneyNumber\(product\.price\)/.test(paymentFunctions)],
  ['Limite por sessão para reservas e mensagens', /match \/reservationLimits\//.test(rules) && /match \/messageLimits\//.test(rules) && /reservationCooldownWritten\(\)/.test(rules) && /messageCooldownWritten\(\)/.test(rules) && /batch\.set\(limitRef/.test(app) && /batch\.commit\(\)/.test(app)],
  ['Reserva consulta segura de ID ausente', /allow get: if isAdmin\(\) \|\| \(signedIn\(\) && \(resource == null \|\| resource\.data\.uid == request\.auth\.uid\)\)/.test(rules) && /allow list: if isAdmin\(\) \|\| \(signedIn\(\) && resource\.data\.uid == request\.auth\.uid\)/.test(rules)],
  ['Regras exigem foto do Cloudinary', /imageUrl\.matches\('https:\/\/res\\\\\.cloudinary\\\\\.com/.test(rules) && /data\.imagePublicId\.matches/.test(rules)],
  ['Regras validam encerramento e parcelas', /function validSalesMetadata/.test(rules) && /data\.status == 'Concluído'/.test(rules)],
  ['Sem exclusão direta de registros', /match \/orders\//.test(rules) && /match \/customers\//.test(rules) && /allow delete: if false;/g.test(rules)]
];
for (const [label, passed] of requiredFlows) {
  if (passed) process.stdout.write(`OK ${label}.\n`);
  else {
    failed = true;
    process.stderr.write(`Falha na verificação: ${label}.\n`);
  }
}
if (!workerConfig.includes('http://127.0.0.1:5501')) {
  failed = true;
  process.stderr.write('O Worker Cloudinary não permite a origem local 127.0.0.1:5501.\n');
} else {
  process.stdout.write('OK origem local 127.0.0.1:5501 permitida para o Worker Cloudinary.\n');
}
if (!/filename: 'WhatsApp Image 2026-11-06 at 22\.57\.19\.jpeg'/.test(seed) || !/y\.jpeg/.test(seed)) {
  failed = true;
  process.stderr.write('As fotos de produtos da pasta enviada não estão mapeadas no importador.\n');
} else {
  process.stdout.write('OK fotos de exemplo mapeadas; peças editoriais fora do manifesto.\n');
}
if (/CLOUDINARY_API_SECRET/.test(html + app + fs.readFileSync(path.join(root, 'firebase.js'), 'utf8'))) {
  failed = true;
  process.stderr.write('Um segredo Cloudinary apareceu em código entregue ao navegador.\n');
} else {
  process.stdout.write('OK segredo Cloudinary ausente do código do navegador.\n');
}

if (failed) process.exit(1);
process.stdout.write('Build estático validado.\n');

