const fs = require('node:fs');
const path = require('node:path');
const { spawnSync } = require('node:child_process');

const root = path.resolve(__dirname, '..');
const publicDir = path.join(root, 'public');
const sourceFiles = ['app.js', 'firebase.js', 'catalog-seed.js', 'cloudinary-config.js', 'dev-server.js', 'scripts/reservation-emulator-smoke.cjs'];
const hostingFiles = ['index.html', 'style.css', 'app.js', 'firebase.js', 'catalog-seed.js', 'cloudinary-config.js', 'assets/graca-editorial-background.jfif', 'assets/graca-logo-transparent.png'];
const failed = [];
const fail = message => failed.push(message);
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

const jsonFiles = ['firebase.json', 'firestore.indexes.json', 'package.json'];
const json = {};
for (const file of jsonFiles) {
  try { json[file] = JSON.parse(fs.readFileSync(path.join(root, file), 'utf8')); ok(`JSON de ${file}`); }
  catch (error) { fail(`JSON inválido em ${file}: ${error.message}`); }
}
for (const file of hostingFiles) {
  const source = path.join(root, file), hosted = path.join(publicDir, file);
  if (fs.existsSync(source) && fs.existsSync(hosted) && !fs.readFileSync(source).equals(fs.readFileSync(hosted))) {
    fail(`cópia divergente do Hosting: ${file}`);
  }
}

const app = fs.readFileSync(path.join(root, 'app.js'), 'utf8');
const rules = fs.readFileSync(path.join(root, 'firestore.rules'), 'utf8');
const html = fs.readFileSync(path.join(root, 'index.html'), 'utf8');
const cloudinary = fs.readFileSync(path.join(root, 'cloudinary-config.js'), 'utf8');
const seed = fs.readFileSync(path.join(root, 'catalog-seed.js'), 'utf8');
const checks = [
  ['Firebase gratuito não depende de Functions nem de rotas pagas', !json['firebase.json']?.functions && !json['firebase.json']?.hosting?.rewrites && !/\/api\/(?:public|mercadopago)/.test(app)],
  ['reservas gravam pedido e trava de telefone na mesma transação', /transaction\.set\(orderRef,order\)/.test(app) && /reservationLimits',phoneDigits/.test(app) && /reservationCooldownWritten\(orderId, request\.resource\.data\.phone\)/.test(rules) && /getIdToken\(user,true\)/.test(app)],
  ['o limite de reserva cruza sessões anônimas pelo telefone e aguarda 30 segundos', /match \/reservationLimits/.test(rules) && /duration\.value\(30, 's'\)/.test(rules) && /phone\.matches\('\^\[0-9\]\{10,13\}\$'\)/.test(rules)],
  ['mensagens usam gravação direta e intervalo pelo e-mail', /createContactMessage\(/.test(app) && /messageLimits',normalizedEmail/.test(app) && /messageCooldownWritten\(messageId, data\.email\)/.test(rules)],
	  ['redefinição manual exporta os dados e preserva clientes e administradores', /match \/orders\/[\s\S]*?allow delete: if isAdmin\(\);/.test(rules) && /preservedCollections:\['customers','admins'\]/.test(app) && /downloadSiteResetBackup/.test(app) && /confirmation!=='REDEFINIR SITE'/.test(app) && /reauthenticateWithCredential\(user,EmailAuthProvider\.credential/.test(app) && /match \/messages\/[\s\S]*?allow delete: if isAdmin\(\);/.test(rules)],
	  ['estoque pode ser ajustado por tamanho apenas por administradores', /function validStockBySize\([\s\S]*?data\.stockBySize\.keys\(\)\.hasAll\(data\.sizes\)/.test(rules) && /affectedKeys\(\)\.hasOnly\(\['stock', 'stockBySize', 'updatedAt'\]\)/.test(rules) && /allow update: if validStockAdjustment\(\)/.test(rules)],
  ['promoções do carrinho exigem cupom publicado e membro VIP ativo', /id="couponForm"/.test(app) && /applyCartCoupon/.test(app) && /function validOwnerCouponReservation[\s\S]*?isActiveVip\(\)/.test(rules) && /coupon\.status == 'published'/.test(rules)],
  ['VIP e configurações continuam limitados a membros e administradores', /match \/vipUsers\/[\s\S]*?allow list: if isAdmin\(\)/.test(rules) && /settingId == 'vip' && \(isAdmin\(\) \|\| isActiveVip\(\)\)/.test(rules)],
  ['e-mail confirmado libera VIP automaticamente somente para uma conta de cliente vinculada', /function isActiveVip\([\s\S]*?hasCustomerProfile\(request\.auth\.uid\)[\s\S]*?email_verified == true[\s\S]*?!exists\([\s\S]*?status == 'active'/.test(rules) && /allow create: if hasCustomerProfile\(uid\)[\s\S]*?isVerifiedVipMember\(uid\)[\s\S]*?status == 'active'/.test(rules) && /async function getVipMembership[\s\S]*?customers',user\.uid[\s\S]*?await setDoc\(reference,member\)/.test(app)],
  ['painel VIP usa uma ação alternável de remover/reativar', /data-next-status="\$\{member\.status==='active'\?'removed':'active'\}"/.test(app) && /member\.status==='active'\?'REMOVER VIP':'REATIVAR VIP'/.test(app) && !/BLOQUEAR/.test(app)],
  ['cupom remove espaços internos e informa quando ainda está como rascunho', /replace\(\/\\s\+\/g,''\)/.test(app) && /Este cupom está como rascunho/.test(app) && /Publique no painel antes de usar no carrinho/.test(app)],
  ['cupom novo é publicado por padrão para clientes VIP', /\$\{coupon\?'<option value="published">/.test(app)],
  ['cupons aceitam limite de usos e contabilizam reservas e vendas em transação atômica', /name="maxUses"/.test(app) && /function couponUsageLabel/.test(app) && /reservedUses:Number\(coupon\.reservedUses\|\|0\)\+1/.test(app) && /function validCouponReservationUpdate/.test(rules) && /couponCounted:true/.test(app) && /transaction\.update\(couponRef,[\s\S]*?transaction\.update\(orderRef/.test(app) && /getAfter\(orderPath\)[\s\S]*?orderAfter\.couponCode/.test(rules) && /getAfter\(couponPath\)[\s\S]*?lastReservationId == orderId/.test(rules)],
  ['soma do pedido é recalculada pelas regras com até seis itens', /function validReservationTotal\(data\)[\s\S]*?let subtotal[\s\S]*?items\[5\]\.quantity \* items\[5\]\.unitPriceCents/.test(rules)],
  ['retirada local é aceita sem campos de endereço obrigatórios', /data\.deliveryMethod == 'Retirada'[\s\S]*?data\.address\.keys\(\)\.size\(\) == 0/.test(rules) && /value="Retirada"/.test(app)],
  ['financeiro pode iniciar novo ciclo após senha e mantém os documentos originais', /reauthenticateWithCredential\(activeUser,EmailAuthProvider\.credential/.test(app) && /settings','finance/.test(app) && /function validFinanceBaseline/.test(rules) && /if\(financeBaselineAt&&closed<financeBaselineAt\)return false/.test(app)],
  ['pesquisa de clientes inclui contas, VIPs e passantes com pedidos', /function getAdminPassersby/.test(app) && /PASSANTES COM SOLICITAÇÕES/.test(app) && /adminVipSearch/.test(app)],
  ['link do WhatsApp e aviso de boas-vindas aparecem na conta e após retornar da confirmação', /vip-dashboard-card/.test(app) && /ABRIR GRUPO NO WHATSAPP/.test(app) && /Seu acesso à Comunidade VIP foi liberado!/.test(app) && /refreshVerificationOnReturn/.test(app)],
  ['formulário de contato confere o elemento antes de limpar', /const formElement=event\.currentTarget/.test(app) && /if\(!formElement\?\.reset\)/.test(app)],
  ['Cloudinary usa preset unsigned, valida a conta e aceita IDs públicos gerados automaticamente', /uploadPreset: 'graca_products_unsigned_v1'/.test(cloudinary) && /api\.cloudinary\.com\/v1_1/.test(app) && /body\.append\('upload_preset'/.test(app) && /result\.secure_url/.test(app) && app.includes('url.pathname.startsWith(`/${CLOUDINARY_CONFIG.cloudName}/image/upload/`)') && /CLOUDINARY_API_SECRET/.test(app) === false && /validCloudinaryPublicId/.test(rules)],
  ['editor de produtos único mantém a galeria Cloudinary sem instruções antigas de Worker', (app.match(/productEditor = async function/g) || []).length === 1 && !/O segredo do Cloudinary fica somente no Worker/.test(app)],
  ['galeria aceita até cinco fotos e URLs HTTPS re-hospedadas no Cloudinary', /multiple/.test(app) && /gallery\.length\+files\.length>5/.test(app) && /body\.append\('file',url\.href\)/.test(app)],
  ['renderer e Firestore voltam com segurança após alternar ou restaurar a página', /if\(!productGrid&&!categoryFilter&&!featuredProducts\)return;/.test(app) && /if\(productGrid\)productGrid\.innerHTML/.test(app) && /window\.addEventListener\('pageshow',event=>\{if\(event\.persisted\)window\.location\.reload\(\);\}/.test(app)],
  ['painel permite excluir mensagens e fichas de cliente com autorização de admin', /data-delete-message/.test(app) && /data-delete-customer/.test(app) && /function deleteAdminMessage/.test(app) && /function deleteCustomerRecord/.test(app)],
  ['pedido entregue tem ação clara de finalizar e registrar pagamento/canal', /data-close-order/.test(app) && /FINALIZAR PEDIDO/.test(app) && /finalizeReservationSale\(/.test(app)],
  ['alerta de reserva aparece em tempo real no painel aberto', /snapshot\.docChanges\(\)/.test(app) && /notifyAdminOfNewReservation/.test(app) && /Notification\.requestPermission/.test(app)],
  ['botão WhatsApp prepara a mensagem para o número administrativo informado', /wa\.me\/5563993051964/.test(app) && /adminReservationAlertLink/.test(app)],
  ['conta administrativa requer e-mail confirmado e autorização própria', /request\.auth\.token\.email_verified == true/.test(rules) && /exists\(\/databases\/\$\(database\)\/documents\/admins/.test(rules)],
  ['custos do catálogo permanecem em coleção privada', /match \/productCosts\/[\s\S]*?allow get, list: if isAdmin\(\)/.test(rules)],
	  ['produtos de exemplo usam imagens e permanecem como rascunho até revisão', (seed.match(/id: 'seed-/g) || []).length === 8 && /active:false/.test(app)],
	  ['categorias da vitrine vêm somente de produtos ativos e peças sem estoque aparecem esgotadas', /categoriesList = \['Todas',[\s\S]*activeProducts\(\)\.map\(p => String\(p\.category/.test(app) && /sold-out-badge/.test(app) && /stockForSize\(product,item\.size\)/.test(app)],
  ['loja mantém título, slogan e formulário da marca', /Gente, Moda e Comunidade/.test(html) && /id="contactForm"/.test(html)],
  ['imagem real e nítida compõe o quadro do topo e o fundo fotográfico', /class="art-photo" src="https:\/\/res\.cloudinary\.com\//.test(html) && /\.hero\.page-section\{[\s\S]*?w_1920/.test(fs.readFileSync(path.join(root,'style.css'),'utf8'))],
  ['detalhe do produto mantém foto limitada à coluna e informações/variações selecionáveis', /detail-art \$\{htm\(p\.color\|\|'pink'\)\}\$\{photo\?' has-photo':''\}/.test(app) && /\.detail-art\.has-photo\{position:relative/.test(fs.readFileSync(path.join(root,'style.css'),'utf8')) && /#detailAdd\{width:100%/.test(fs.readFileSync(path.join(root,'style.css'),'utf8'))],
  ['comentários publicados são compartilhados pelo Firestore e atualizam ao vivo', /collection\(db,'comments'\)[\s\S]*?where\('status','==','published'\)[\s\S]*?onSnapshot/.test(app) && /setDoc\(doc\(collection\(db,'comments'\)\)/.test(app)],
  ['painel possui aba para revisar e excluir comentários', /\['comments','COMENTÁRIOS'\]/.test(app) && /adminTab==='comments'\)return renderAdminComments/.test(app) && /data-delete-comment/.test(app)],
  ['regras aceitam comentários somente de conta confirmada e limitam exclusão ao admin', /match \/comments\/[\s\S]*?email_verified == true[\s\S]*?allow delete: if isAdmin\(\);/.test(rules) && /allow update: if false;/.test(rules)],
  ['teste local pode usar emuladores sem alterar o destino publicado', /\['localhost', '127\.0\.0\.1'\]\.includes\(location\.hostname\)/.test(fs.readFileSync(path.join(root,'firebase.js'),'utf8')) && /get\('emulator'\) === '1'/.test(fs.readFileSync(path.join(root,'firebase.js'),'utf8'))],
  ['regras usam negação padrão', /match \/\{document=\*\*\}[\s\S]*allow read, write: if false;/.test(rules)]
];

for (const [label, passed] of checks) passed ? ok(label) : fail(label);
if (failed.length) {
  for (const message of failed) process.stderr.write(`Falha: ${message}\n`);
  process.exit(1);
}
ok('arquivos públicos sincronizados');
process.stdout.write('Verificação estática local concluída. O processo não cria dados de teste no banco de produção.\n');

