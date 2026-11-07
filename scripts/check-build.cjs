const fs = require('node:fs');
const path = require('node:path');
const { spawnSync } = require('node:child_process');

const root = path.resolve(__dirname, '..');
const files = ['app.js', 'firebase.js', 'catalog-seed.js', 'dev-server.js', 'cloudinary-worker/src/index.js'];
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

const html = fs.readFileSync(path.join(root, 'index.html'), 'utf8');
const app = fs.readFileSync(path.join(root, 'app.js'), 'utf8');
const rules = fs.readFileSync(path.join(root, 'firestore.rules'), 'utf8');
const seed = fs.readFileSync(path.join(root, 'catalog-seed.js'), 'utf8');
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

