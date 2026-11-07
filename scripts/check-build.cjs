const fs = require('node:fs');
const path = require('node:path');
const { spawnSync } = require('node:child_process');

const root = path.resolve(__dirname, '..');
const files = ['app.js', 'firebase.js', 'dev-server.js', 'cloudinary-worker/src/index.js'];
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
if (/sdk\.mercadopago\.com|payments\.js|payment-config\.js/i.test(html + app)) {
  failed = true;
  process.stderr.write('O fluxo antigo de pagamento ainda está carregado pelo site.\n');
} else {
  process.stdout.write('OK fluxo antigo de pagamento fora da vitrine.\n');
}

if (failed) process.exit(1);
process.stdout.write('Build estático validado.\n');

