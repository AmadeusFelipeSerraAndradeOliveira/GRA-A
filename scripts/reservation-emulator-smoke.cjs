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

  const anonymous = await request(authUrl, {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ returnSecureToken: true })
  });
  async function submitReservation(session, { orderId, phone }) {
    const subtotalCents = 12000;
    const orderFields = {
      uid: string(session.localId), confirmationCode: string(`GSMOKE${orderId}`), customerName: string('Teste Retirada'), phone: string(phone),
      items: list([map({ productId: string(productId), name: string('Produto Smoke Test'), size: string('Único'), quantity: integer(1), unitPriceCents: integer(subtotalCents) })]),
      totalCents: integer(subtotalCents), deliveryMethod: string('Retirada'), address: map({}), pickupDetails: string(''), notes: string(''),
      marketingConsent: boolean(false), status: string('Aguardando confirmação'), statusHistory: list([string('Aguardando confirmação')]),
      stockApplied: boolean(false), stockRestored: boolean(false)
    };
    const writes = [
      { update: { name: `projects/${projectId}/databases/(default)/documents/orders/${orderId}`, fields: orderFields },
        updateTransforms: [{ fieldPath: 'createdAt', setToServerValue: 'REQUEST_TIME' }, { fieldPath: 'updatedAt', setToServerValue: 'REQUEST_TIME' }] },
      { update: { name: `projects/${projectId}/databases/(default)/documents/reservationLimits/${phone}`, fields: { phone: string(phone), lastOrderId: string(orderId) } },
        updateTransforms: [{ fieldPath: 'lastSubmittedAt', setToServerValue: 'REQUEST_TIME' }] }
    ];
    return commit(session.idToken, writes);
  }
  await submitReservation(anonymous, { orderId: 'pickup-smoke-order-01', phone: '63999887766' });
  process.stdout.write('PASS: cliente anônimo gravou uma solicitação com retirada local e endereço vazio.\n');

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
  await submitReservation(member, { orderId: 'vip-smoke-order-01', phone: '63999111223' });
  process.stdout.write('PASS: conta verificada também gravou uma reserva sem cupom.\n');
  const couponOrderId = 'coupon-smoke-order-01';
  await submitReservation(member, { orderId: couponOrderId, phone: '63999111221' });
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
  await submitReservation(member, { orderId: 'coupon-smoke-order-02', phone: '63999111220' });
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
}

main().catch(error => { process.stderr.write(`FAIL: ${error.message}\n`); process.exitCode = 1; });
