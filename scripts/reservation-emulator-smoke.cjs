const { randomUUID } = require('node:crypto');

const projectId = 'demo-graca-gmc';
const firestore = `http://127.0.0.1:8080/v1/projects/${projectId}/databases/(default)/documents`;
const authUrl = `http://127.0.0.1:9099/identitytoolkit.googleapis.com/v1/accounts:signUp?key=fake-api-key`;
const accountsUrl = 'http://127.0.0.1:9099/identitytoolkit.googleapis.com/v1';

async function request(url, options = {}) {
  const response = await fetch(url, options);
  const body = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(`${response.status} ${JSON.stringify(body)}`);
  return body;
}

async function commit(token, writes) {
  return request(`${firestore}:commit`, {
    method: 'POST', headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ writes })
  });
}
async function createAnonymousSession() {
  const session = await request(authUrl, {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ returnSecureToken: true })
  });
  session.submissionDeviceId = randomUUID();
  return session;
}

const string = stringValue => ({ stringValue });
const integer = value => ({ integerValue: String(value) });
const boolean = booleanValue => ({ booleanValue });
const map = fields => ({ mapValue: { fields } });
const list = values => ({ arrayValue: { values } });

async function main() {
  const productId = 'emulator-pickup-test';
  await request(`${firestore}:commit`, {
    method: 'POST',
    headers: { Authorization: 'Bearer owner', 'Content-Type': 'application/json' },
    body: JSON.stringify({ writes: [{ update: {
      name: `projects/${projectId}/databases/(default)/documents/products/${productId}`,
      fields: {
        name: string('Produto Smoke Test'), category: string('Teste'), price: integer(120), stock: integer(3),
        sizes: list([string('Único')]), active: boolean(true), featured: boolean(false),
        imageUrl: string('https://res.cloudinary.com/imc3dn7g/image/upload/test.jpg'), imagePublicId: string('test'),
        updatedAt: { timestampValue: '2026-01-01T00:00:00Z' }, createdAt: { timestampValue: '2026-01-01T00:00:00Z' }
      }
    } }] })
  });

  const sizedProductId = 'emulator-size-stock-test';
  await request(`${firestore}:commit`, {
    method: 'POST',
    headers: { Authorization: 'Bearer owner', 'Content-Type': 'application/json' },
    body: JSON.stringify({ writes: [{ update: {
      name: `projects/${projectId}/databases/(default)/documents/products/${sizedProductId}`,
      fields: {
        name: string('Produto por tamanho'), category: string('Teste'), price: integer(120), stock: integer(2),
        stockBySize: map({ P: integer(2), M: integer(0) }), sizes: list([string('P'), string('M')]), active: boolean(true),
        featured: boolean(false), imageUrl: string('https://res.cloudinary.com/imc3dn7g/image/upload/test.jpg'),
        imagePublicId: string('test-size'), updatedAt: { timestampValue: '2026-01-01T00:00:00Z' },
        createdAt: { timestampValue: '2026-01-01T00:00:00Z' }
      }
    } }] })
  });

  const anonymous = await createAnonymousSession();
  const secondAnonymous = await createAnonymousSession();
  async function submitReservation(session, { orderId, phone, productId: requestedProductId=productId, productName='Produto Smoke Test', size='Único', quantity=1, unitPriceCents=12000, submissionDeviceId=session.submissionDeviceId, deliveryMethod='Retirada', address={}, omitLimiter='', items=[{productId:requestedProductId,name:productName,size,quantity,unitPriceCents}] }) {
    const subtotalCents = items.reduce((total,item)=>total+item.unitPriceCents*item.quantity,0);
    const orderFields = {
      uid: string(session.localId), submissionDeviceId: string(submissionDeviceId), confirmationCode: string(`GSMOKE${orderId}`), customerName: string('Teste Retirada'), phone: string(phone),
      items: list(items.map(item=>map({productId:string(item.productId),name:string(item.name),size:string(item.size),quantity:integer(item.quantity),unitPriceCents:integer(item.unitPriceCents)}))),
      totalCents: integer(subtotalCents), deliveryMethod: string(deliveryMethod), address: map(Object.fromEntries(Object.entries(address).map(([key,value])=>[key,string(value)]))), pickupDetails: string(''), notes: string(''),
      marketingConsent: boolean(false), status: string('Aguardando confirmação'), statusHistory: list([string('Aguardando confirmação')]),
      stockApplied: boolean(false), stockRestored: boolean(false)
    };
    const writes = [
      { update: { name: `projects/${projectId}/databases/(default)/documents/orders/${orderId}`, fields: orderFields },
        currentDocument: { exists: false },
        updateTransforms: [{ fieldPath: 'createdAt', setToServerValue: 'REQUEST_TIME' }, { fieldPath: 'updatedAt', setToServerValue: 'REQUEST_TIME' }] },
      { update: { name: `projects/${projectId}/databases/(default)/documents/reservationLimits/${phone}`, fields: { phone: string(phone), lastOrderId: string(orderId) } },
        updateTransforms: [{ fieldPath: 'lastSubmittedAt', setToServerValue: 'REQUEST_TIME' }] },
      { update: { name: `projects/${projectId}/databases/(default)/documents/reservationSessionLimits/${submissionDeviceId}`, fields: { deviceId: string(submissionDeviceId), lastOrderId: string(orderId) } },
        updateTransforms: [{ fieldPath: 'lastSubmittedAt', setToServerValue: 'REQUEST_TIME' }] }
    ];
    return commit(session.idToken, writes.filter(write=>!omitLimiter||!write.update.name.includes(`/documents/${omitLimiter}/`)));
  }
  async function submitContact(session, { messageId, email, submissionDeviceId=session.submissionDeviceId }) {
    const fields = {
      uid: string(session.localId), submissionDeviceId: string(submissionDeviceId), name: string('Contato Smoke'), email: string(email),
      subject: string('Teste'), message: string('Mensagem local válida para testar o limite de contato.'), status: string('Nova')
    };
    return commit(session.idToken, [
      { update: { name: `projects/${projectId}/databases/(default)/documents/messages/${messageId}`, fields },
        updateTransforms: [{ fieldPath: 'createdAt', setToServerValue: 'REQUEST_TIME' }, { fieldPath: 'updatedAt', setToServerValue: 'REQUEST_TIME' }] },
      { update: { name: `projects/${projectId}/databases/(default)/documents/messageLimits/${email}`, fields: { email: string(email), lastMessageId: string(messageId) } },
        updateTransforms: [{ fieldPath: 'lastSubmittedAt', setToServerValue: 'REQUEST_TIME' }] },
      { update: { name: `projects/${projectId}/databases/(default)/documents/messageSessionLimits/${submissionDeviceId}`, fields: { deviceId: string(submissionDeviceId), lastMessageId: string(messageId) } },
        updateTransforms: [{ fieldPath: 'lastSubmittedAt', setToServerValue: 'REQUEST_TIME' }] }
    ]);
  }
  // Regression: delivery, discounted price and per-variation stock from the reported 403.
  const deliveryProductId='delivery-discount-test';
  await commit('owner',[{update:{name:`projects/${projectId}/databases/(default)/documents/products/${deliveryProductId}`,fields:{
    name:string('iPhone 13 128 GB'),price:integer(1300),discount:integer(10),active:boolean(true),stock:integer(2),
    sizes:list([string('64gb'),string('128gb')]),stockBySize:map({'64gb':integer(1),'128gb':integer(1)})
  }}}]);
  const deliverySession=await createAnonymousSession();
  await submitReservation(deliverySession,{orderId:'delivery-discount-order-01',phone:'63999887001',productId:deliveryProductId,
    productName:'iPhone 13 128 GB',size:'64gb',unitPriceCents:117000,deliveryMethod:'Entrega',
    address:{zip:'77000000',street:'Rua de teste',number:'9',district:'Centro',city:'Palmas',state:'TO'}});
  process.stdout.write('PASS: entrega com desconto de 10% e estoque por variação foi aceita.\n');
  const invalidPriceSession=await createAnonymousSession();
  let invalidPriceRejected=false;
  try{await submitReservation(invalidPriceSession,{orderId:'delivery-invalid-price-01',phone:'63999887002',productId:deliveryProductId,
    productName:'iPhone 13 128 GB',size:'64gb',unitPriceCents:1});}
  catch(error){invalidPriceRejected=/403/.test(error.message);}
  if(!invalidPriceRejected)throw new Error('o emulador permitiu alterar o preço do produto na reserva.');
  process.stdout.write('PASS: preço adulterado continuou recusado.\n');
  const sixSizes=['A','B','C','D','E','F'];
  await commit('owner',[{update:{name:`projects/${projectId}/databases/(default)/documents/products/six-items-test`,fields:{
    name:string('Seis variações'),price:integer(120),active:boolean(true),stock:integer(6),
    sizes:list(sixSizes.map(string)),stockBySize:map(Object.fromEntries(sixSizes.map(size=>[size,integer(1)])))
  }}}]);
  const sixItems=sixSizes.map(size=>({productId:'six-items-test',name:'Seis variações',size,quantity:1,unitPriceCents:12000}));
  await submitReservation(await createAnonymousSession(),{orderId:'six-items-order-01',phone:'63999887003',items:sixItems});
  process.stdout.write('PASS: pedido com seis combinações válidas foi aceito.\n');
  for(const [index,options] of [
    {items:sixItems.map((item,index)=>index===5?{...item,unitPriceCents:1}:item)},
    {items:[...sixItems.slice(0,5),sixItems[0]]},
    {items:[...sixItems,sixItems[0]]},
    {items:sixItems,omitLimiter:'reservationLimits'},
    {items:sixItems,omitLimiter:'reservationSessionLimits'}
  ].entries()){
    let denied=false;
    try{await submitReservation(await createAnonymousSession(),{orderId:`invalid-cart-order-${index}`,phone:`6399988710${index}`,...options});}
    catch(error){denied=/403/.test(error.message);}
    if(!denied)throw new Error(`o caso inválido ${index} não foi recusado corretamente.`);
  }
  process.stdout.write('PASS: sexto preço adulterado, duplicatas, sete itens e ausência de cada limitador foram recusados.\n');
  await submitReservation(anonymous, { orderId: 'pickup-smoke-order-01', phone: '63999887766' });
  process.stdout.write('PASS: cliente anônimo gravou uma solicitação com retirada local e endereço vazio.\n');
  let crossSessionPhoneRejected = false;
  try { await submitReservation(secondAnonymous, { orderId: 'pickup-smoke-order-02', phone: '63999887766' }); }
  catch (error) { crossSessionPhoneRejected = /403/.test(error.message); }
  if (!crossSessionPhoneRejected) throw new Error('o emulador permitiu renovar o limite do mesmo WhatsApp com outra sessão anônima.');
  process.stdout.write('PASS: outra sessão anônima não renovou o limite do mesmo WhatsApp.\n');
  await submitReservation(secondAnonymous, { orderId: 'pickup-smoke-order-02', phone: '63999887767' });
  process.stdout.write('PASS: nova sessão e novo dispositivo conseguiram fazer a primeira solicitação.\n');
  const rotatedSession = await createAnonymousSession();
  rotatedSession.submissionDeviceId = secondAnonymous.submissionDeviceId;
  let newSessionDeviceRejected = false;
  try { await submitReservation(rotatedSession, { orderId: 'pickup-smoke-order-rotated-session', phone: '63999887769' }); }
  catch (error) { newSessionDeviceRejected = /403/.test(error.message); }
  if (!newSessionDeviceRejected) throw new Error('o emulador permitiu renovar o limite do dispositivo ao criar outra sessão anônima e trocar o WhatsApp.');
  process.stdout.write('PASS: trocar a sessão e o WhatsApp no mesmo navegador não renovou o limite do dispositivo.\n');
  let sameSessionPhoneRotationRejected = false;
  try { await submitReservation(secondAnonymous, { orderId: 'pickup-smoke-order-03', phone: '63999887768' }); }
  catch (error) { sameSessionPhoneRotationRejected = /403/.test(error.message); }
  if (!sameSessionPhoneRotationRejected) throw new Error('o emulador permitiu que uma mesma sessão anônima trocasse o WhatsApp e renovasse seu limite.');
  process.stdout.write('PASS: trocar o WhatsApp na mesma sessão anônima não renova o limite.\n');
  const contactSession = await createAnonymousSession();
  await submitContact(contactSession,{messageId:'contact-smoke-01',email:'smoke01@example.test'});
  const contactRotatedSession=await createAnonymousSession();
  contactRotatedSession.submissionDeviceId=contactSession.submissionDeviceId;
  let crossSessionContactRejected=false;
  try{await submitContact(contactRotatedSession,{messageId:'contact-smoke-rotated-session',email:'smoke03@example.test'});}
  catch(error){crossSessionContactRejected=/403/.test(error.message);}
  if(!crossSessionContactRejected)throw new Error('o emulador permitiu renovar o limite de contato ao criar outra sessão e trocar o e-mail.');
  process.stdout.write('PASS: trocar sessão e e-mail no mesmo navegador não renovou o limite de contato.\n');
  let contactEmailRotationRejected=false;
  try{await submitContact(contactSession,{messageId:'contact-smoke-02',email:'smoke02@example.test'});}
  catch(error){contactEmailRotationRejected=/403/.test(error.message);}
  if(!contactEmailRotationRejected)throw new Error('o emulador permitiu trocar o e-mail e renovar o limite de contato na mesma sessão.');
  process.stdout.write('PASS: trocar o e-mail na mesma sessão não renova o limite de contato.\n');
  const sizeSession = await createAnonymousSession();
  await submitReservation(sizeSession, { orderId: 'size-stock-order-01', phone: '63999887765', productId: sizedProductId, productName: 'Produto por tamanho', size: 'P', quantity: 2, unitPriceCents: 12000 });
  process.stdout.write('PASS: estoque disponível por tamanho aceitou a quantidade válida.\n');
  let soldOutSizeRejected = false;
  const soldOutSession = await createAnonymousSession();
  try { await submitReservation(soldOutSession, { orderId: 'size-stock-order-02', phone: '63999887764', productId: sizedProductId, productName: 'Produto por tamanho', size: 'M', quantity: 1, unitPriceCents: 12000 }); }
  catch (error) { soldOutSizeRejected = /403/.test(error.message); }
  if (!soldOutSizeRejected) throw new Error('o emulador não recusou a reserva de um tamanho sem estoque.');
  process.stdout.write('PASS: tamanho sem unidades disponíveis foi recusado pelas regras.\n');

  const email = 'vip-smoke@example.test', password = 'SmokePass123!';
  let member = await request(authUrl, {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, password, returnSecureToken: true })
  });
  const verification = await request(`${accountsUrl}/accounts:sendOobCode?key=fake-api-key`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ idToken: member.idToken, requestType: 'VERIFY_EMAIL' })
  });
  const queuedCodes = await request(`http://127.0.0.1:9099/emulator/v1/projects/${projectId}/oobCodes`);
  const verificationCode = queuedCodes.oobCodes?.find(item=>item.email===email&&item.requestType==='VERIFY_EMAIL')?.oobCode;
  if(!verificationCode||!verification.email)throw new Error('não foi possível obter o código local de verificação.');
  await request(`${accountsUrl}/accounts:update?key=fake-api-key`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ oobCode: verificationCode })
  });
  member = await request(`${accountsUrl}/accounts:signInWithPassword?key=fake-api-key`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, password, returnSecureToken: true })
  });
  member.submissionDeviceId = randomUUID();
  await commit('owner', [{ update: {
    name: `projects/${projectId}/databases/(default)/documents/admins/${member.localId}`,
    fields: { email: string(email), createdAt: { timestampValue: '2026-01-01T00:00:00Z' } }
  } }]);
  await commit('owner', [{ update: {
    name: `projects/${projectId}/databases/(default)/documents/customers/${member.localId}`,
    fields: { uid: string(member.localId), name: string('Cliente Teste'), email: string(email), phone: string('63999111222'), address: map({}), marketingConsent: boolean(false), createdAt: { timestampValue: '2026-01-01T00:00:00Z' }, updatedAt: { timestampValue: '2026-01-01T00:00:00Z' } }
  } }]);
  await commit('owner', [{ update: {
    name: `projects/${projectId}/databases/(default)/documents/vipUsers/${member.localId}`,
    fields: { uid: string(member.localId), name: string('Cliente Teste'), email: string(email), phone: string('63999111222'), status: string('active'), createdAt: { timestampValue: '2026-01-01T00:00:00Z' }, updatedAt: { timestampValue: '2026-01-01T00:00:00Z' } }
  } }]);
  await commit('owner', [{ update: {
    name: `projects/${projectId}/databases/(default)/documents/coupons/SMOKE10`,
    fields: { code: string('SMOKE10'), value: integer(10), status: string('published'), maxUses: integer(1), uses: integer(0), reservedUses: integer(0), createdAt: { timestampValue: '2026-01-01T00:00:00Z' }, updatedAt: { timestampValue: '2026-01-01T00:00:00Z' } }
  } }]);
  const couponCheck = await request(`${firestore}/coupons/SMOKE10`, { headers: { Authorization: 'Bearer owner' } });
  const tokenClaims = JSON.parse(Buffer.from(member.idToken.split('.')[1], 'base64url').toString());
  if(!couponCheck.name||tokenClaims.email_verified!==true||tokenClaims.firebase?.sign_in_provider==='anonymous')throw new Error('a preparação do membro VIP verificado no emulador falhou.');

  const commentId='comment-smoke-01';
  await commit(member.idToken,[
    {update:{name:`projects/${projectId}/databases/(default)/documents/comments/${commentId}`,fields:{uid:string(member.localId),name:string('Cliente Teste'),text:string('Comentário local válido para testar o limite.'),status:string('published')}},updateTransforms:[{fieldPath:'createdAt',setToServerValue:'REQUEST_TIME'}]},
    {update:{name:`projects/${projectId}/databases/(default)/documents/commentLimits/${member.localId}`,fields:{uid:string(member.localId),lastCommentId:string(commentId)}},updateTransforms:[{fieldPath:'lastSubmittedAt',setToServerValue:'REQUEST_TIME'}]}
  ]);
  let commentCooldownRejected=false;
  try{await commit(member.idToken,[
    {update:{name:`projects/${projectId}/databases/(default)/documents/comments/comment-smoke-02`,fields:{uid:string(member.localId),name:string('Cliente Teste'),text:string('Outro comentário antes de aguardar o intervalo.'),status:string('published')}},updateTransforms:[{fieldPath:'createdAt',setToServerValue:'REQUEST_TIME'}]},
    {update:{name:`projects/${projectId}/databases/(default)/documents/commentLimits/${member.localId}`,fields:{uid:string(member.localId),lastCommentId:string('comment-smoke-02')}},updateTransforms:[{fieldPath:'lastSubmittedAt',setToServerValue:'REQUEST_TIME'}]}
  ]);}catch(error){commentCooldownRejected=/403/.test(error.message);}
  if(!commentCooldownRejected)throw new Error('o emulador permitiu comentários consecutivos da mesma conta verificada.');
  process.stdout.write('PASS: comentário seguinte da mesma conta verificada aguardou o limite.\n');
  await submitReservation(member, { orderId: 'vip-smoke-order-01', phone: '63999111223' });
  process.stdout.write('PASS: conta verificada também gravou uma reserva sem cupom.\n');
  const couponOrderId = 'coupon-smoke-order-01';
  await submitReservation(member, { orderId: couponOrderId, phone: '63999111221', submissionDeviceId: randomUUID() });
  let reservedUses = 0;
  async function reserveCoupon(orderId) {
    const nextReservedUses = reservedUses + 1;
    const result = await commit(member.idToken, [
      { update: { name: `projects/${projectId}/databases/(default)/documents/coupons/SMOKE10`, fields: { reservedUses: integer(nextReservedUses), lastReservationId: string(orderId) } },
        updateMask: { fieldPaths: ['reservedUses', 'lastReservationId'] }, updateTransforms: [{ fieldPath: 'updatedAt', setToServerValue: 'REQUEST_TIME' }] },
      { update: { name: `projects/${projectId}/databases/(default)/documents/orders/${orderId}`, fields: {
        couponCode: string('SMOKE10'), couponPercent: integer(10), subtotalCents: integer(12000), discountCents: integer(1200),
        couponReserved: boolean(true), couponCounted: boolean(false), totalCents: integer(10800)
      } }, updateMask: { fieldPaths: ['couponCode', 'couponPercent', 'subtotalCents', 'discountCents', 'couponReserved', 'couponCounted', 'totalCents'] },
        updateTransforms: [{ fieldPath: 'updatedAt', setToServerValue: 'REQUEST_TIME' }] }
    ]);
    reservedUses = nextReservedUses;
    return result;
  }
  await reserveCoupon(couponOrderId);
  process.stdout.write('PASS: cupom e pedido foram atualizados juntos, com desconto e contador reservado.\n');
  let rejected = false;
  await submitReservation(member, { orderId: 'coupon-smoke-order-02', phone: '63999111220', submissionDeviceId: randomUUID() });
  try { await reserveCoupon('coupon-smoke-order-02'); }
  catch (error) { rejected = /403/.test(error.message); }
  if (!rejected) throw new Error('o emulador não recusou a segunda reserva além do limite do cupom.');
  process.stdout.write('PASS: limite 1 recusou a segunda tentativa e manteve a transação atômica.\n');
  const financePath = `projects/${projectId}/databases/(default)/documents/settings/finance`;
  const resetFinance = { update: { name: financePath, fields: { resetBy: string(member.localId) } }, updateTransforms: [
    { fieldPath: 'baselineAt', setToServerValue: 'REQUEST_TIME' }, { fieldPath: 'updatedAt', setToServerValue: 'REQUEST_TIME' }
  ] };
  await commit(member.idToken, [resetFinance]);
  process.stdout.write('PASS: administrador verificado criou o novo marco financeiro.\n');
  let nonAdminRejected = false;
  try { await commit(anonymous.idToken, [resetFinance]); } catch (error) { nonAdminRejected = /403/.test(error.message); }
  if (!nonAdminRejected) throw new Error('o emulador permitiu reset financeiro sem sessão administrativa.');
  process.stdout.write('PASS: visitante não pode redefinir o marco financeiro.\n');

  const protectedOrderPath = `projects/${projectId}/databases/(default)/documents/orders/pickup-smoke-order-01`;
  let orderDeleteRejected = false;
  try { await commit(member.idToken, [{ delete: protectedOrderPath }]); }
  catch (error) { orderDeleteRejected = /403/.test(error.message); }
  if (!orderDeleteRejected) throw new Error('o emulador permitiu apagar um pedido sem o marcador de redefinição.');
  process.stdout.write('PASS: pedido continua protegido fora da redefinição.\n');
  const resetMarkerPath = `projects/${projectId}/databases/(default)/documents/settings/siteReset`;
  await commit(member.idToken, [{ update: { name: resetMarkerPath, fields: { resetBy: string(member.localId) } }, updateTransforms: [{ fieldPath: 'createdAt', setToServerValue: 'REQUEST_TIME' }] }]);
  const resetOrderPaths=['pickup-smoke-order-01','pickup-smoke-order-02','size-stock-order-01','vip-smoke-order-01','coupon-smoke-order-01'].map(id=>`projects/${projectId}/databases/(default)/documents/orders/${id}`);
  await commit(member.idToken, resetOrderPaths.map(name=>({ delete: name })));
  await commit(member.idToken, [{ delete: `projects/${projectId}/databases/(default)/documents/vipUsers/${member.localId}` }]);
  const customerCheck = await request(`${firestore}/customers/${member.localId}`, { headers: { Authorization: 'Bearer owner' } });
  if (!customerCheck.name) throw new Error('a redefinição de teste removeu a ficha do cliente.');
  await commit(member.idToken, [{ delete: resetMarkerPath }]);
  process.stdout.write('PASS: marcador recente autoriza o reset, remove VIP/pedido e preserva a ficha de cliente.\n');

  const contactId='admin-contact-smoke-01',contactEmail='admin-smoke@example.test';
  await commit('owner',[
    {update:{name:`projects/${projectId}/databases/(default)/documents/messages/${contactId}`,fields:{uid:string(member.localId),name:string('Contato de teste'),email:string(contactEmail),subject:string('Teste de limpeza'),message:string('Mensagem de contato para teste.'),status:string('Nova')}},updateTransforms:[{fieldPath:'createdAt',setToServerValue:'REQUEST_TIME'},{fieldPath:'updatedAt',setToServerValue:'REQUEST_TIME'}]},
    {update:{name:`projects/${projectId}/databases/(default)/documents/messageLimits/${contactEmail}`,fields:{email:string(contactEmail),lastMessageId:string(contactId)}},updateTransforms:[{fieldPath:'lastSubmittedAt',setToServerValue:'REQUEST_TIME'}]}
  ]);
  await commit(member.idToken,[{delete:`projects/${projectId}/databases/(default)/documents/messages/${contactId}`}]);
  const messageAfterDelete=await fetch(`${firestore}/messages/${contactId}`,{headers:{Authorization:`Bearer ${member.idToken}`}});
  const limiterAfterDelete=await request(`${firestore}/messageLimits/${contactEmail}`,{headers:{Authorization:`Bearer ${member.idToken}`}});
  if(messageAfterDelete.status!==404||!limiterAfterDelete.name)throw new Error('a limpeza de contatos removeu o limitador ou deixou a mensagem de teste.');
  process.stdout.write('PASS: exclusão da mensagem de contato preservou o limitador contra abuso.\n');

  const vipPath=`projects/${projectId}/databases/(default)/documents/vipUsers/${member.localId}`;
  await commit(member.idToken,[{update:{name:vipPath,fields:{uid:string(member.localId),name:string('Cliente Teste'),email:string(email),phone:string('63999111222'),status:string('active')}},updateTransforms:[{fieldPath:'createdAt',setToServerValue:'REQUEST_TIME'},{fieldPath:'updatedAt',setToServerValue:'REQUEST_TIME'}]}]);
  let orphanProfileRejected=false;
  try{await commit(member.idToken,[{delete:`projects/${projectId}/databases/(default)/documents/customers/${member.localId}`}]);}
  catch(error){orphanProfileRejected=/403/.test(error.message);}
  if(!orphanProfileRejected)throw new Error('o emulador permitiu remover perfil sem remover o VIP associado.');
  await commit(member.idToken,[
    {delete:`projects/${projectId}/databases/(default)/documents/customers/${member.localId}`},
    {delete:vipPath}
  ]);
  const signedInAfterReset=await request(`${accountsUrl}/accounts:signInWithPassword?key=fake-api-key`,{
    method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({email,password,returnSecureToken:true})
  });
  if(signedInAfterReset.localId!==member.localId)throw new Error('a redefinição de perfil removeu também a conta de login.');
  process.stdout.write('PASS: redefinição em lote removeu perfil e VIP juntos, mantendo o login Firebase.\n');
}

main().catch(error => { process.stderr.write(`FAIL: ${error.message}\n`); process.exitCode = 1; });
