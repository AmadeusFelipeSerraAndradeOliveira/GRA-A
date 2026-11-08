const crypto = require("node:crypto");
const { isIP } = require("node:net");
const admin = require("firebase-admin");
const { onRequest } = require("firebase-functions/v2/https");
const { onDocumentUpdated, onDocumentWritten } = require("firebase-functions/v2/firestore");
const { defineBoolean, defineSecret } = require("firebase-functions/params");

admin.initializeApp();
const db = admin.firestore();
const MP_CLIENT_ID = defineSecret("MP_CLIENT_ID");
const MP_CLIENT_SECRET = defineSecret("MP_CLIENT_SECRET");
const MP_WEBHOOK_SECRET = defineSecret("MP_WEBHOOK_SECRET");
const PUBLIC_FORM_RATE_LIMIT_KEY = defineSecret("PUBLIC_FORM_RATE_LIMIT_KEY");
const MP_TEST_MODE = defineBoolean("MP_TEST_MODE", { default: true });
const REGION = "southamerica-east1";
const allowedOrigins = [
  "http://localhost:5500",
  "http://127.0.0.1:5500",
  "http://localhost:5501",
  "http://127.0.0.1:5501",
  "https://graca-454ff.web.app",
  "https://graca-454ff.firebaseapp.com"
];
const orders = db.collection("orders");
const products = db.collection("products");
const coupons = db.collection("coupons");
let mercadoPagoTokenCache = null;
let mercadoPagoTokenRequest = null;

async function getMercadoPagoCredentials() {
  if (mercadoPagoTokenCache && Date.now() < mercadoPagoTokenCache.expiresAt) return mercadoPagoTokenCache;
  if (!mercadoPagoTokenRequest) {
    mercadoPagoTokenRequest = (async () => {
      const requestBody = {
        client_id: MP_CLIENT_ID.value(),
        client_secret: MP_CLIENT_SECRET.value(),
        grant_type: "client_credentials"
      };
      if (MP_TEST_MODE.value()) requestBody.test_token = "true";
      const response = await fetch("https://api.mercadopago.com/oauth/token", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(requestBody),
        signal: AbortSignal.timeout(15000)
      });
      const result = await response.json().catch(() => ({}));
      if (!response.ok || typeof result.access_token !== "string" || !result.access_token) {
        console.error("Mercado Pago OAuth recusou a emissão do token.", { status: response.status, error: result.error });
        throw new Error("MP_OAUTH_FAILED");
      }
      const ttlSeconds = Math.max(60, Number(result.expires_in) || 21600);
      const safetySeconds = Math.min(60, Math.floor(ttlSeconds * 0.1));
      mercadoPagoTokenCache = {
        accessToken: result.access_token,
        publicKey: typeof result.public_key === "string" ? result.public_key : "",
        expiresAt: Date.now() + (ttlSeconds - safetySeconds) * 1000
      };
      return mercadoPagoTokenCache;
    })();
  }
  try {
    return await mercadoPagoTokenRequest;
  } finally {
    mercadoPagoTokenRequest = null;
  }
}

function sendError(res, status, message) {
  res.status(status).json({ error: message });
}

function moneyNumber(value) {
  const number = Number(value);
  if (!Number.isFinite(number)) return null;
  return Math.round(number * 100) / 100;
}

function safeClientOrderId(value) {
  return typeof value === "string" && /^[A-Z0-9-]{6,64}$/.test(value);
}

async function authenticatedUser(req) {
  const match = String(req.get("authorization") || "").match(/^Bearer (.+)$/i);
  if (!match) throw new Error("UNAUTHENTICATED");
  const decoded = await admin.auth().verifyIdToken(match[1]);
  if (decoded.email_verified !== true || !decoded.email) throw new Error("EMAIL_NOT_VERIFIED");
  return decoded;
}

function publicOrderResponse(order) {
  const payment = order?.transactions?.payments?.[0] || {};
  const method = payment.payment_method || {};
  return {
    id: order?.id || null,
    order_id: order?.id || null,
    status: order?.status || payment.status || "processing",
    status_detail: order?.status_detail || payment.status_detail || "in_process",
    payment_id: payment.id || null,
    payment_status: payment.status || order?.status || "processing",
    payment_status_detail: payment.status_detail || order?.status_detail || "in_process",
    payment_method_id: method.id || null,
    payment_type_id: method.type || null,
    transaction_amount: order?.total_amount || null,
    pix: method.id === "pix" ? {
      qr_code: method.qr_code || null,
      qr_code_base64: method.qr_code_base64 || null,
      ticket_url: method.ticket_url || null
    } : null
  };
}

async function reserveOrder({ orderRef, uid, email, clientOrderId, request }) {
  const items = request?.items;
  if (!Array.isArray(items) || items.length < 1 || items.length > 30) throw new Error("CART_INVALID");
  const normalized = items.map(item => ({
    id: String(item?.id || ""),
    size: String(item?.size || ""),
    quantity: Number(item?.quantity)
  }));
  if (normalized.some(item => !item.id || !Number.isInteger(item.quantity) || item.quantity < 1 || item.quantity > 20)) throw new Error("CART_INVALID");
  if (new Set(normalized.map(item => `${item.id}:${item.size}`)).size !== normalized.length) throw new Error("CART_INVALID");
  const productRefs = [...new Map(normalized.map(item => [item.id, products.doc(item.id)])).values()];
  const couponCode = String(request?.coupon || "").trim().toUpperCase();
  const couponRef = couponCode ? coupons.doc(couponCode) : null;
  const address = request?.address || {};
  for (const field of ["zip", "street", "number", "district", "city", "state"]) {
    if (typeof address[field] !== "string" || !address[field].trim()) throw new Error("ADDRESS_INVALID");
  }
  const now = admin.firestore.FieldValue.serverTimestamp();
  const idempotencyKey = crypto.randomUUID();

  return db.runTransaction(async transaction => {
    const existing = await transaction.get(orderRef);
    if (existing.exists) {
      const prior = existing.data();
      if (prior.uid !== uid) throw new Error("ORDER_CONFLICT");
      return { existing: prior };
    }
    const liveProducts = await Promise.all(productRefs.map(ref => transaction.get(ref)));
    const liveCoupon = couponRef ? await transaction.get(couponRef) : null;
    const liveVip = couponRef ? await transaction.get(db.collection("vipUsers").doc(uid)) : null;
    const liveById = new Map(liveProducts.map(snapshot => [snapshot.id, snapshot]));
    const saleItems = normalized.map(item => {
      const snapshot = liveById.get(item.id);
      if (!snapshot?.exists) throw new Error("PRODUCT_UNAVAILABLE");
      const product = snapshot.data();
      if (product.active === false) throw new Error("PRODUCT_UNAVAILABLE");
      const basePrice = moneyNumber(product.price);
      const discount = Math.max(0, Math.min(99, Number(product.discount || 0)));
      const unitPrice = moneyNumber(basePrice * (100 - discount) / 100);
      if (unitPrice === null || unitPrice <= 0 || !Array.isArray(product.sizes) || !product.sizes.includes(item.size)) throw new Error("PRODUCT_INVALID");
      return { id: item.id, size: item.size, quantity: item.quantity, productName: String(product.name || item.id), unitPrice, stock: Number(product.stock || 0) };
    });
    const quantitiesByProduct = new Map();
    for (const item of saleItems) quantitiesByProduct.set(item.id, (quantitiesByProduct.get(item.id) || 0) + item.quantity);
    for (const [productId, quantity] of quantitiesByProduct) {
      const snapshot = liveById.get(productId);
      const product = snapshot?.data();
      const available = Number(product?.stock || 0) - Number(product?.reservedStock || 0);
      if (!snapshot?.exists || product.active === false || available < quantity) throw new Error("STOCK_UNAVAILABLE");
    }
    const itemTotals = saleItems.map(item => ({ ...item, lineTotal: moneyNumber(item.unitPrice * item.quantity) }));
    const subtotal = moneyNumber(itemTotals.reduce((sum, item) => sum + item.lineTotal, 0));
    let couponPercent = 0;
    if (couponRef) {
      const coupon = liveCoupon?.data();
      couponPercent = Number(coupon?.value || 0);
      const maxUses = coupon?.maxUses == null ? null : Number(coupon.maxUses);
      if (!liveCoupon?.exists || coupon.status !== "published" || liveVip?.data()?.status !== "active" || couponPercent < 1 || couponPercent > 99
        || (maxUses !== null && Number(coupon.uses || 0) + Number(coupon.reservedUses || 0) >= maxUses)) throw new Error("COUPON_UNAVAILABLE");
      transaction.update(couponRef, { reservedUses: admin.firestore.FieldValue.increment(1) });
    }
    const total = moneyNumber(subtotal * (100 - couponPercent) / 100);
    if (total === null || total <= 0) throw new Error("TOTAL_INVALID");
    for (const [productId, quantity] of quantitiesByProduct) transaction.update(products.doc(productId), { reservedStock: admin.firestore.FieldValue.increment(quantity) });
    transaction.create(orderRef, {
      id: clientOrderId,
      uid,
      email,
      name: String(request?.name || "").slice(0, 120),
      items: itemTotals.map(({ stock, lineTotal, ...item }) => item),
      subtotal,
      coupon: couponCode || "",
      couponPercent,
      discount: moneyNumber(subtotal - total),
      total,
      paymentMethod: "Mercado Pago",
      paymentStatus: "processing",
      status: "Pendente de pagamento",
      address: {
        zip: address.zip.trim(), street: address.street.trim(), number: address.number.trim(),
        complement: String(address.complement || "").trim(), district: address.district.trim(),
        city: address.city.trim(), state: address.state.trim().toUpperCase()
      },
      createdAt: now,
      updatedAt: now,
      idempotencyKey,
      inventoryReserved: true,
      inventoryCommitted: false,
      inventoryReleased: false,
      couponReserved: Boolean(couponRef),
      couponCounted: false
    });
    return { created: true, total, items: itemTotals.map(({ stock, lineTotal, ...item }) => item), idempotencyKey };
  });
}

async function updateOrderFromMarketplaceOrder(orderRef, marketplaceOrder) {
  const orderSnapshot = await orderRef.get();
  if (!orderSnapshot.exists) throw new Error("ORDER_NOT_FOUND");
  const order = orderSnapshot.data();
  if (String(marketplaceOrder.external_reference || "") !== order.id || moneyNumber(marketplaceOrder.total_amount) !== moneyNumber(order.total) || (marketplaceOrder.country_code && !["BRA", "BR"].includes(marketplaceOrder.country_code))) throw new Error("ORDER_MISMATCH");
  const payment = marketplaceOrder.transactions?.payments?.[0] || {};
  const method = payment.payment_method || {};
  const marketplaceStatus = String(marketplaceOrder.status || payment.status || "processing");
  const marketplaceStatusDetail = String(marketplaceOrder.status_detail || payment.status_detail || "in_process");
  const quantitiesByProduct = new Map();
  for (const item of order.items || []) quantitiesByProduct.set(String(item.id), (quantitiesByProduct.get(String(item.id)) || 0) + Number(item.quantity));
  const productRefs = [...quantitiesByProduct.keys()].map(id => products.doc(id));
  const couponRef = order.coupon ? coupons.doc(order.coupon) : null;
  await db.runTransaction(async transaction => {
    const freshOrderSnapshot = await transaction.get(orderRef);
    if (!freshOrderSnapshot.exists) throw new Error("ORDER_NOT_FOUND");
    const freshOrder = freshOrderSnapshot.data();
    const freshProducts = await Promise.all(productRefs.map(ref => transaction.get(ref)));
    const couponSnapshot = couponRef ? await transaction.get(couponRef) : null;
    const paid = marketplaceStatus === "processed" || payment.status === "processed";
    const terminalFailure = ["failed", "canceled", "refunded", "charged_back"].includes(marketplaceStatus);
    if (paid && !freshOrder.inventoryCommitted) {
      for (let index = 0; index < freshProducts.length; index++) {
        const quantity = quantitiesByProduct.get(freshProducts[index].id), snapshot = freshProducts[index];
        if (!snapshot.exists) throw new Error("PRODUCT_NOT_FOUND");
        transaction.update(snapshot.ref, {
          stock: admin.firestore.FieldValue.increment(-quantity),
          reservedStock: admin.firestore.FieldValue.increment(-quantity)
        });
      }
      if (freshOrder.couponReserved && !freshOrder.couponCounted && couponSnapshot?.exists) {
        transaction.update(couponRef, {
          uses: admin.firestore.FieldValue.increment(1),
          reservedUses: admin.firestore.FieldValue.increment(-1)
        });
      }
      transaction.update(orderRef, { inventoryCommitted: true, inventoryReserved: false, couponReserved: false, couponCounted: true });
    } else if (terminalFailure && freshOrder.inventoryReserved && !freshOrder.inventoryReleased) {
      for (let index = 0; index < freshProducts.length; index++) {
        if (freshProducts[index].exists) transaction.update(freshProducts[index].ref, { reservedStock: admin.firestore.FieldValue.increment(-quantitiesByProduct.get(freshProducts[index].id)) });
      }
      if (freshOrder.couponReserved && couponSnapshot?.exists) transaction.update(couponRef, { reservedUses: admin.firestore.FieldValue.increment(-1) });
      transaction.update(orderRef, { inventoryReserved: false, inventoryReleased: true, couponReserved: false });
    }
    const paymentStatus = paid ? "approved" : marketplaceStatus === "failed" ? "rejected" : marketplaceStatus === "canceled" ? "cancelled" : marketplaceStatus === "refunded" ? "refunded" : marketplaceStatus === "charged_back" ? "charged_back" : marketplaceStatus === "processing" ? "in_process" : "pending";
    const patch = {
      paymentMethod: method.id === "pix" ? "Pix" : method.type === "credit_card" ? "Cartão de crédito" : method.type === "debit_card" ? "Cartão de débito" : "Mercado Pago",
      paymentMethodId: method.id || null,
      paymentStatus,
      marketplaceOrderStatus: marketplaceStatus,
      marketplaceOrderStatusDetail: marketplaceStatusDetail,
      status: paid ? "Pagamento confirmado" : terminalFailure ? "Cancelado" : "Pendente de pagamento",
      updatedAt: admin.firestore.FieldValue.serverTimestamp()
    };
    if (payment.id || publicOrderResponse(marketplaceOrder).pix?.qr_code) patch.paymentResponse = publicOrderResponse(marketplaceOrder);
    if (marketplaceOrder.id && marketplaceOrder.id !== "failed") patch.mercadoPagoOrderId = String(marketplaceOrder.id);
    if (payment.id) patch.mercadoPagoPaymentId = String(payment.id);
    transaction.update(orderRef, patch);
  });
}

exports.mercadopagoConfig = onRequest({
  region: REGION,
  cors: allowedOrigins,
  secrets: [MP_CLIENT_ID, MP_CLIENT_SECRET]
}, async (req, res) => {
  if (req.method !== "GET") return res.sendStatus(405);
  try { await authenticatedUser(req); }
  catch { return sendError(res, 401, "Entre com uma conta confirmada para continuar."); }
  try {
    const credentials = await getMercadoPagoCredentials();
    if (!credentials.publicKey) return sendError(res, 503, "A chave pública do Mercado Pago não foi retornada para esta aplicação.");
    return res.set("Cache-Control", "private, max-age=300").status(200).json({ publicKey: credentials.publicKey });
  } catch (error) {
    console.error("Mercado Pago public configuration unavailable:", error.message);
    return sendError(res, 503, "Pagamentos temporariamente indisponíveis.");
  }
});

exports.mercadopagoOrder = onRequest({
  region: REGION,
  cors: allowedOrigins,
  secrets: [MP_CLIENT_ID, MP_CLIENT_SECRET, PUBLIC_FORM_RATE_LIMIT_KEY]
}, async (req, res) => {
  if (!(["GET", "POST"].includes(req.method))) return sendError(res, 405, "Método não permitido.");
  let user;
  try { user = await authenticatedUser(req); }
  catch (error) { return sendError(res, 401, error.message === "EMAIL_NOT_VERIFIED" ? "Confirme o e-mail para comprar." : "Entre novamente para continuar."); }
  if (req.method === "GET") {
    const clientOrderId = String(req.query.clientOrderId || "");
    if (!safeClientOrderId(clientOrderId)) return sendError(res, 400, "Pedido inválido.");
    const orderRef = orders.doc(clientOrderId);
    const snapshot = await orderRef.get();
    if (!snapshot.exists || snapshot.data().uid !== user.uid || !snapshot.data().mercadoPagoOrderId) return sendError(res, 404, "Order não encontrada.");
    try {
      const ipHash = sourceIpHash(normalizedSourceIp(req), PUBLIC_FORM_RATE_LIMIT_KEY.value(), "payment-poll");
      await db.runTransaction(async transaction => {
        const limits = await readFormRateLimits(transaction, "paymentPoll", user.uid, ipHash, 5000);
        writeFormRateLimits(transaction, "paymentPoll", user.uid, limits);
      });
      const credentials = await getMercadoPagoCredentials();
      const response = await fetch(`https://api.mercadopago.com/v1/orders/${encodeURIComponent(snapshot.data().mercadoPagoOrderId)}`, {
        headers: { Authorization: `Bearer ${credentials.accessToken}` },
        signal: AbortSignal.timeout(15000)
      });
      const marketplaceOrder = await response.json().catch(() => ({}));
      if (!response.ok) return sendError(res, 502, "Não foi possível consultar a order.");
      await updateOrderFromMarketplaceOrder(orderRef, marketplaceOrder);
      return res.status(200).json(publicOrderResponse(marketplaceOrder));
    } catch (error) {
      if (error.message === "RATE_LIMITED") return sendError(res, 429, "Aguarde alguns segundos antes de consultar novamente.");
      console.error("Mercado Pago order lookup error:", error.message);
      return sendError(res, 502, "Não foi possível consultar a order.");
    }
  }
  const order = req.body?.order, paymentForm = req.body?.payment;
  if (!safeClientOrderId(order?.clientOrderId) || !paymentForm || typeof paymentForm !== "object") return sendError(res, 400, "Pedido inválido.");
  const methodId = String(paymentForm.payment_method_id || "");
  const paymentType = String(paymentForm.payment_type_id || "credit_card");
  if (methodId !== "pix" && (!paymentForm.token || !["credit_card", "debit_card"].includes(paymentType) || !Number.isInteger(Number(paymentForm.installments)) || Number(paymentForm.installments) < 1 || Number(paymentForm.installments) > 12)) return sendError(res, 400, "Dados do cartão incompletos.");
  const orderRef = orders.doc(order.clientOrderId);
  let reserved;
  try {
    // Verified accounts can still be automated; protect inventory reservations
    // across accounts on the same source network, while allowing an idempotent
    // retry of an order that already exists.
    const priorOrder = await orderRef.get();
    if (!priorOrder.exists) {
      const ipHash = sourceIpHash(normalizedSourceIp(req), PUBLIC_FORM_RATE_LIMIT_KEY.value(), "payment");
      await db.runTransaction(async transaction => {
        const limits = await readFormRateLimits(transaction, "payment", user.uid, ipHash);
        writeFormRateLimits(transaction, "payment", user.uid, limits);
      });
    }
    reserved = await reserveOrder({ orderRef, uid: user.uid, email: user.email, clientOrderId: order.clientOrderId, request: { ...order, name: user.name || order.name || "" } });
    if (reserved.existing?.mercadoPagoOrderId) return res.status(200).json(reserved.existing.paymentResponse || { id: reserved.existing.mercadoPagoOrderId, order_id: reserved.existing.mercadoPagoOrderId, status: reserved.existing.marketplaceOrderStatus || "processing", status_detail: reserved.existing.marketplaceOrderStatusDetail || "in_process" });
  } catch (error) {
    const status = error.message === "ORDER_CONFLICT" ? 403 : error.message.includes("INVALID") || error.message.includes("UNAVAILABLE") ? 400 : 500;
    const responseStatus = error.message === "RATE_LIMITED" ? 429 : status;
    return sendError(res, responseStatus, error.message === "RATE_LIMITED" ? "Aguarde 30 segundos antes de iniciar outro pagamento." : error.message === "STOCK_UNAVAILABLE" ? "Estoque insuficiente para um ou mais itens." : error.message === "COUPON_INVALID" || error.message === "COUPON_UNAVAILABLE" ? "Cupom indisponível. Atualize a sacola." : "Não foi possível validar o pedido.");
  }
  const total = moneyNumber(reserved.total || reserved.existing?.total);
  const paymentMethod = methodId === "pix"
    ? { id: "pix", type: "bank_transfer" }
    : { id: methodId, type: paymentType, token: String(paymentForm.token), installments: Number(paymentForm.installments) };
  const payload = {
    type: "online",
    total_amount: total.toFixed(2),
    external_reference: order.clientOrderId,
    processing_mode: "automatic",
    payer: { email: user.email },
    transactions: { payments: [{ amount: total.toFixed(2), payment_method: paymentMethod }] }
  };
  const state = String(order.address?.state || "").trim().toUpperCase();
  if (/^[A-Z]{2}$/.test(state)) payload.config = { location: { state_id: `BR-${state}` } };
  const identification = paymentForm.payer?.identification;
  if (methodId !== "pix" && identification?.type && identification?.number) payload.payer.identification = { type: String(identification.type), number: String(identification.number) };
  const idempotencyKey = reserved.idempotencyKey || reserved.existing?.idempotencyKey;
  try {
    const credentials = await getMercadoPagoCredentials();
    const response = await fetch("https://api.mercadopago.com/v1/orders", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${credentials.accessToken}`,
        "Content-Type": "application/json",
        "X-Idempotency-Key": idempotencyKey
      },
      body: JSON.stringify(payload),
      signal: AbortSignal.timeout(20000)
    });
    const result = await response.json();
    if (!response.ok) {
      await releaseReservation(orderRef, "rejected");
      return sendError(res, 400, result.message || "O Mercado Pago recusou a criação do pagamento.");
    }
    const publicResult = publicOrderResponse(result);
    await orderRef.update({
      mercadoPagoOrderId: String(result.id),
      ...(publicResult.payment_id ? { mercadoPagoPaymentId: String(publicResult.payment_id) } : {}),
      paymentResponse: publicResult,
      paymentStatus: publicResult.payment_status,
      marketplaceOrderStatus: publicResult.status,
      marketplaceOrderStatusDetail: publicResult.status_detail,
      updatedAt: admin.firestore.FieldValue.serverTimestamp()
    });
    await updateOrderFromMarketplaceOrder(orderRef, result);
    return res.status(200).json(publicResult);
  } catch (error) {
    console.error("Mercado Pago payment error:", error.message);
    return sendError(res, 502, "Não foi possível comunicar com o Mercado Pago. Tente novamente usando o mesmo pedido.");
  }
});

async function releaseReservation(orderRef, paymentStatus) {
  const snapshot = await orderRef.get();
  if (!snapshot.exists) return;
  const order = snapshot.data();
  const marketplaceOrder = {
    id: "failed",
    external_reference: orderRef.id,
    total_amount: String(order.total),
    country_code: "BRA",
    status: paymentStatus === "cancelled" ? "canceled" : "failed",
    status_detail: "failed",
    transactions: { payments: [] }
  };
  try { await updateOrderFromMarketplaceOrder(orderRef, marketplaceOrder); } catch (error) { console.error("Reservation release error:", error.message); }
}

function validWebhookSignature(req, secret) {
  const signature = String(req.get("x-signature") || "");
  const requestId = String(req.get("x-request-id") || "");
  const dataId = String(req.query["data.id"] || "");
  const parts = Object.fromEntries(signature.split(",").map(part => part.trim().split("=", 2)));
  const ts = parts.ts, received = parts.v1;
  if (!ts || !received || !requestId || !dataId) return false;
  const manifest = `id:${dataId};request-id:${requestId};ts:${ts};`;
  const expected = crypto.createHmac("sha256", secret).update(manifest).digest();
  let provided;
  try { provided = Buffer.from(received, "hex"); } catch { return false; }
  return provided.length === expected.length && crypto.timingSafeEqual(provided, expected);
}

exports.mercadopagoWebhook = onRequest({
  region: REGION,
  secrets: [MP_CLIENT_ID, MP_CLIENT_SECRET, MP_WEBHOOK_SECRET]
}, async (req, res) => {
  if (req.method !== "POST") return res.sendStatus(405);
  const orderId = String(req.query["data.id"] || req.body?.data?.id || "");
  const topic = String(req.query.type || req.body?.type || "");
  if (topic && topic !== "order") return res.sendStatus(200);
  if (!orderId || !validWebhookSignature(req, MP_WEBHOOK_SECRET.value())) return res.sendStatus(401);
  try {
    const credentials = await getMercadoPagoCredentials();
    const response = await fetch(`https://api.mercadopago.com/v1/orders/${encodeURIComponent(orderId)}`, {
      headers: { Authorization: `Bearer ${credentials.accessToken}` },
      signal: AbortSignal.timeout(15000)
    });
    if (!response.ok) return res.sendStatus(502);
    const marketplaceOrder = await response.json();
    const clientOrderId = String(marketplaceOrder.external_reference || "");
    if (!safeClientOrderId(clientOrderId)) return res.sendStatus(200);
    const orderRef = orders.doc(clientOrderId);
    const orderSnapshot = await orderRef.get();
    if (!orderSnapshot.exists) return res.sendStatus(200);
    if (orderSnapshot.data().mercadoPagoOrderId && String(orderSnapshot.data().mercadoPagoOrderId) !== String(marketplaceOrder.id)) return res.sendStatus(401);
    await updateOrderFromMarketplaceOrder(orderRef, marketplaceOrder);
    return res.sendStatus(200);
  } catch (error) {
    console.error("Mercado Pago webhook error:", error.message);
    return res.sendStatus(500);
  }
});

function requestUser(req) {
  const match = String(req.get("authorization") || "").match(/^Bearer (.+)$/i);
  if (!match) throw new Error("UNAUTHENTICATED");
  return admin.auth().verifyIdToken(match[1]);
}

function normalizedSourceIp(req) {
  let raw = String(req.ip || "").trim().replace(/^\[|\]$/g, "").split("%")[0].toLowerCase();
  if (!raw || !isIP(raw)) throw new Error("SOURCE_IP_UNAVAILABLE");
  if (isIP(raw) === 4) return `ipv4:${raw}`;
  if (raw.includes(".")) {
    const separator = raw.lastIndexOf(":");
    const embeddedIpv4 = raw.slice(separator + 1).split(".").map(Number);
    if (embeddedIpv4.length !== 4 || embeddedIpv4.some(part => !Number.isInteger(part) || part < 0 || part > 255)) throw new Error("SOURCE_IP_UNAVAILABLE");
    const first = ((embeddedIpv4[0] << 8) | embeddedIpv4[1]).toString(16);
    const second = ((embeddedIpv4[2] << 8) | embeddedIpv4[3]).toString(16);
    raw = `${raw.slice(0, separator + 1)}${first}:${second}`;
  }

  // Normalize IPv6 clients to their /64 network. Browsers and mobile devices
  // may rotate the lower 64 bits, so keying on the full address would let a
  // fresh anonymous session plus a privacy-address rotation evade the limit.
  const halves = raw.split("::");
  const left = halves[0] ? halves[0].split(":") : [];
  const right = halves.length > 1 && halves[1] ? halves[1].split(":") : [];
  const missing = 8 - left.length - right.length;
  if (missing < 0 || (halves.length === 1 && missing !== 0)) throw new Error("SOURCE_IP_UNAVAILABLE");
  const groups = [...left, ...Array(missing).fill("0"), ...right].map(group => group.padStart(4, "0"));
  if (groups.length !== 8 || groups.some(group => !/^[0-9a-f]{4}$/.test(group))) throw new Error("SOURCE_IP_UNAVAILABLE");
  if (groups.slice(0, 5).every(group => group === "0000") && groups[5] === "ffff") {
    const ipv4 = `${parseInt(groups[6].slice(0, 2), 16)}.${parseInt(groups[6].slice(2), 16)}.${parseInt(groups[7].slice(0, 2), 16)}.${parseInt(groups[7].slice(2), 16)}`;
    return `ipv4:${ipv4}`;
  }
  return `ipv6-64:${groups.slice(0, 4).join(":")}`;
}

function sourceIpHash(ip, secret, purpose) {
  return crypto.createHmac("sha256", secret).update(`${purpose}:${ip}`).digest("hex");
}

function escapeEmailHtml(value) {
  return String(value || "").replace(/[&<>"']/g, character => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;"
  })[character]);
}

// Compatible with the Firebase Trigger Email extension's `mail` collection.
// The extension and a verified SMTP sender must be configured before mail is
// delivered; this trigger never stores SMTP credentials in the application.
exports.queueVipWelcomeEmail = onDocumentWritten({
  document: "vipUsers/{uid}",
  region: REGION
}, async event => {
  const before = event.data?.before?.exists ? event.data.before.data() : null;
  const after = event.data?.after?.exists ? event.data.after.data() : null;
  if (!after || after.status !== "active" || before?.status === "active") return;
  const email = String(after.email || "").trim().toLowerCase();
  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email) || email.length > 254) return;
  const settings = await db.doc("settings/vip").get();
  const inviteUrl = String(settings.data()?.inviteUrl || "").trim();
  if (!/^https:\/\/chat\.whatsapp\.com\/[A-Za-z0-9]+$/.test(inviteUrl)) {
    console.warn("VIP welcome email skipped: group invitation link is not configured.");
    return;
  }
  const name = String(after.name || "").trim().slice(0, 120) || "Pessoa querida";
  const safeName = escapeEmailHtml(name);
  await db.collection("mail").add({
    to: [email],
    message: {
      subject: "Seu acesso à Comunidade VIP GRAÇA está liberado",
      text: `Olá, ${name}! Seu acesso à Comunidade VIP GRAÇA está liberado. Entre pelo link seguro: ${inviteUrl}\n\nVocê receberá cupons, campanhas e novidades exclusivas da comunidade.`,
      html: `<p>Olá, ${safeName}!</p><p>Seu acesso à Comunidade VIP GRAÇA está liberado.</p><p><a href="${inviteUrl}">Entrar no grupo fechado da GRAÇA</a></p><p>Você receberá cupons, campanhas e novidades exclusivas da comunidade.</p>`
    },
    createdAt: admin.firestore.FieldValue.serverTimestamp(),
    templateKey: "vip-welcome"
  });
});

// Release a coupon reservation when an admin cancels or completes a public
// reservation. The transaction and couponReserved flag make retries safe.
exports.settleReservationCoupon = onDocumentUpdated({
  document: "orders/{orderId}",
  region: REGION
}, async event => {
  const before = event.data?.before?.data();
  const after = event.data?.after?.data();
  if (!before || !after || before.status === after.status
    || !["Cancelado", "Concluído"].includes(after.status)) return;
  const orderRef = event.data.after.ref;
  await db.runTransaction(async transaction => {
    const freshSnapshot = await transaction.get(orderRef);
    if (!freshSnapshot.exists) return;
    const order = freshSnapshot.data();
    if (!["Cancelado", "Concluído"].includes(order.status) || order.couponReserved !== true || !order.couponCode) return;
    const couponRef = coupons.doc(String(order.couponCode).toUpperCase());
    const couponSnapshot = await transaction.get(couponRef);
    if (couponSnapshot.exists) {
      const updates = { reservedUses: admin.firestore.FieldValue.increment(-1) };
      if (order.status === "Concluído" && order.couponCounted !== true) {
        updates.uses = admin.firestore.FieldValue.increment(1);
      }
      transaction.update(couponRef, updates);
    }
    transaction.update(orderRef, {
      couponReserved: false,
      couponCounted: order.status === "Concluído"
    });
  });
});

function lastSubmissionAt(snapshot) {
  const value = snapshot?.data()?.lastSubmittedAt;
  return value && typeof value.toMillis === "function" ? value.toMillis() : 0;
}

async function readFormRateLimits(transaction, kind, uid, ipHash, windowMs = 30000) {
  const uidRef = db.collection(`${kind}Limits`).doc(uid);
  const ipRef = db.collection("submissionRateLimits").doc(`${kind}_${ipHash}`);
  const [uidLimit, ipLimit] = await Promise.all([transaction.get(uidRef), transaction.get(ipRef)]);
  const now = Date.now();
  if (lastSubmissionAt(uidLimit) + windowMs > now || lastSubmissionAt(ipLimit) + windowMs > now) {
    const error = new Error("RATE_LIMITED");
    error.statusCode = 429;
    throw error;
  }
  return { uidRef, ipRef };
}

function writeFormRateLimits(transaction, kind, uid, refs) {
  const now = Date.now();
  const submittedAt = admin.firestore.FieldValue.serverTimestamp();
  const expiresAt = admin.firestore.Timestamp.fromMillis(now + 30 * 24 * 60 * 60 * 1000);
  transaction.set(refs.uidRef, { uid, lastSubmittedAt: submittedAt });
  transaction.set(refs.ipRef, { kind, lastSubmittedAt: submittedAt, expireAt: expiresAt });
}

function validPublicOrderId(value) {
  return typeof value === "string" && /^[A-Za-z0-9_-]{16,64}$/.test(value);
}

function publicFormError(res, error) {
  const status = Number(error.statusCode) || (error.message === "UNAUTHENTICATED" ? 401 : error.message.includes("INVALID") || error.message.includes("UNAVAILABLE") ? 400 : 500);
  const messages = {
    RATE_LIMITED: "Aguarde 30 segundos antes de enviar outra solicitação.",
    CART_INVALID: "Revise os itens e quantidades da solicitação.",
    PRODUCT_UNAVAILABLE: "Um produto não está mais disponível. Revise o carrinho.",
    STOCK_UNAVAILABLE: "O estoque mudou. Revise o carrinho antes de enviar.",
    ADDRESS_INVALID: "Confira o endereço de entrega.",
    COUPON_UNAVAILABLE: "Este cupom não está disponível.",
    VIP_REQUIRED: "Para usar este cupom, entre em uma conta VIP ativa e confirmada.",
    ORDER_CONFLICT: "Não foi possível validar esta solicitação. Atualize o carrinho.",
    MESSAGE_INVALID: "Confira os dados e o tamanho da mensagem.",
    SOURCE_IP_UNAVAILABLE: "Não foi possível verificar a solicitação. Tente novamente.",
    UNAUTHENTICATED: "A sessão expirou. Atualize a página e tente novamente."
  };
  if (status >= 500) console.error("Public GRAÇA form failed:", error.message || error);
  return res.status(status).json({ error: messages[error.message] || "Não foi possível concluir. Tente novamente." });
}

exports.publicReservation = onRequest({
  region: REGION,
  cors: allowedOrigins,
  secrets: [PUBLIC_FORM_RATE_LIMIT_KEY]
}, async (req, res) => {
  if (req.method !== "POST") return sendError(res, 405, "Método não permitido.");
  let user, ip, ipHash;
  try {
    user = await requestUser(req);
    ip = normalizedSourceIp(req);
    ipHash = sourceIpHash(ip, PUBLIC_FORM_RATE_LIMIT_KEY.value(), "reservation");
  } catch (error) { return publicFormError(res, error); }

  const body = req.body || {};
  const clientOrderId = body.clientOrderId;
  if (!validPublicOrderId(clientOrderId)) return sendError(res, 400, "Solicitação inválida.");
  if (!Array.isArray(body.items) || body.items.length < 1 || body.items.length > 6) return publicFormError(res, new Error("CART_INVALID"));
  const items = body.items.map(item => ({
    productId: String(item?.productId || ""),
    size: String(item?.size || ""),
    quantity: Number(item?.quantity)
  }));
  if (items.some(item => !item.productId || item.productId.length > 150 || item.productId.includes("/")
    || !item.size || item.size.length > 40 || !Number.isInteger(item.quantity) || item.quantity < 1 || item.quantity > 20)
    || new Set(items.map(item => `${item.productId}:${item.size}`)).size !== items.length) return publicFormError(res, new Error("CART_INVALID"));
  const customerName = String(body.customerName || "").trim();
  const phone = String(body.phone || "").replace(/[^\d+()\s-]/g, "").trim().slice(0, 40);
  const deliveryMethod = String(body.deliveryMethod || "");
  const addressInput = body.address && typeof body.address === "object" ? body.address : {};
  const address = deliveryMethod === "Entrega" ? {
    zip: String(addressInput.zip || "").trim().slice(0, 12),
    street: String(addressInput.street || "").trim().slice(0, 120),
    number: String(addressInput.number || "").trim().slice(0, 20),
    district: String(addressInput.district || "").trim().slice(0, 80),
    city: String(addressInput.city || "").trim().slice(0, 80),
    state: String(addressInput.state || "").trim().toUpperCase().slice(0, 2)
  } : {};
  if (customerName.length < 1 || customerName.length > 120 || phone.length < 7 || !["Retirada", "Entrega"].includes(deliveryMethod)) return publicFormError(res, new Error("ADDRESS_INVALID"));
  if (deliveryMethod === "Entrega" && (!address.zip || !address.street || !address.number || !address.district || !address.city || address.state.length !== 2)) return publicFormError(res, new Error("ADDRESS_INVALID"));

  const orderRef = orders.doc(clientOrderId);
  const productRefs = [...new Map(items.map(item => [item.productId, products.doc(item.productId)])).values()];
  const couponCode = String(body.couponCode || "").trim().toUpperCase();
  if (couponCode && !/^[A-Z0-9_-]{3,30}$/.test(couponCode)) return publicFormError(res, new Error("COUPON_UNAVAILABLE"));
  const couponRef = couponCode ? coupons.doc(couponCode) : null;

  try {
    const result = await db.runTransaction(async transaction => {
      const existingSnapshot = await transaction.get(orderRef);
      if (existingSnapshot.exists) {
        const prior = existingSnapshot.data();
        const oldItems = (prior.items || []).map(item => [item.productId, item.size, Number(item.quantity)]);
        const newItems = items.map(item => [item.productId, item.size, item.quantity]);
        if (prior.uid !== user.uid || JSON.stringify(oldItems) !== JSON.stringify(newItems)
          || prior.phone !== phone || prior.customerName !== customerName
          || prior.deliveryMethod !== deliveryMethod || prior.couponCode !== couponCode
          || JSON.stringify(prior.address || {}) !== JSON.stringify(address)) throw new Error("ORDER_CONFLICT");
        return { existing: true, orderId: clientOrderId, confirmationCode: prior.confirmationCode, status: prior.status, totalCents: prior.totalCents };
      }

      const productSnapshots = await Promise.all(productRefs.map(ref => transaction.get(ref)));
      const couponSnapshot = couponRef ? await transaction.get(couponRef) : null;
      const vipSnapshot = couponRef ? await transaction.get(db.collection("vipUsers").doc(user.uid)) : null;
      const limits = await readFormRateLimits(transaction, "reservation", user.uid, ipHash);
      const productMap = new Map(productSnapshots.map(snapshot => [snapshot.id, snapshot]));
      const itemsByProduct = new Map();
      for (const item of items) itemsByProduct.set(item.productId, (itemsByProduct.get(item.productId) || 0) + item.quantity);
      const canonicalItems = items.map(item => {
        const snapshot = productMap.get(item.productId);
        if (!snapshot?.exists || snapshot.data().active !== true) throw new Error("PRODUCT_UNAVAILABLE");
        const product = snapshot.data();
        if (!Array.isArray(product.sizes) || !product.sizes.includes(item.size)) throw new Error("PRODUCT_UNAVAILABLE");
        const price = Number(product.price), discount = Math.max(0, Math.min(99, Number(product.discount || 0)));
        const unitPriceCents = Math.round(price * (100 - discount));
        if (!Number.isFinite(unitPriceCents) || unitPriceCents < 1) throw new Error("PRODUCT_UNAVAILABLE");
        return { productId: item.productId, name: String(product.name || "").slice(0, 160), size: item.size, quantity: item.quantity, unitPriceCents };
      });
      for (const [productId, quantity] of itemsByProduct) {
        const snapshot = productMap.get(productId), product = snapshot?.data();
        if (!snapshot?.exists || Number(product.stock || 0) - Number(product.reservedStock || 0) < quantity) throw new Error("STOCK_UNAVAILABLE");
      }
      const subtotalCents = canonicalItems.reduce((sum, item) => sum + item.unitPriceCents * item.quantity, 0);
      let couponPercent = 0;
      if (couponRef) {
        const provider = String(user.firebase?.sign_in_provider || "");
        if (user.email_verified !== true || !user.email || provider === "anonymous" || vipSnapshot?.data()?.status !== "active") {
          const error = new Error("VIP_REQUIRED");
          error.statusCode = 403;
          throw error;
        }
        const coupon = couponSnapshot?.data();
        const maxUses = coupon?.maxUses == null ? null : Number(coupon.maxUses);
        if (!couponSnapshot?.exists || coupon.status !== "published" || !Number.isInteger(Number(coupon.value))
          || Number(coupon.value) < 1 || Number(coupon.value) > 99
          || (maxUses !== null && Number(coupon.uses || 0) + Number(coupon.reservedUses || 0) >= maxUses)) throw new Error("COUPON_UNAVAILABLE");
        couponPercent = Number(coupon.value);
        transaction.update(couponRef, { reservedUses: admin.firestore.FieldValue.increment(1) });
      }
      const discountCents = Math.round(subtotalCents * couponPercent / 100);
      const totalCents = subtotalCents - discountCents;
      const now = admin.firestore.FieldValue.serverTimestamp();
      const confirmationCode = `GRA-${clientOrderId.toUpperCase()}`;
      transaction.create(orderRef, {
        uid: user.uid, confirmationCode, customerName, phone, items: canonicalItems,
        totalCents, subtotalCents, discountCents, couponCode, couponPercent,
        couponReserved: Boolean(couponRef), couponCounted: false,
        deliveryMethod, address,
        pickupDetails: String(body.pickupDetails || "").trim().slice(0, 160),
        notes: String(body.notes || "").trim().slice(0, 500),
        marketingConsent: body.marketingConsent === true,
        status: "Aguardando confirmação", statusHistory: ["Aguardando confirmação"],
        stockApplied: false, stockRestored: false,
        createdAt: now, updatedAt: now
      });
      writeFormRateLimits(transaction, "reservation", user.uid, limits);
      return { existing: false, orderId: clientOrderId, confirmationCode, status: "Aguardando confirmação", totalCents, subtotalCents, discountCents, couponPercent };
    });
    return res.status(200).json(result);
  } catch (error) { return publicFormError(res, error); }
});

exports.publicMessage = onRequest({
  region: REGION,
  cors: allowedOrigins,
  secrets: [PUBLIC_FORM_RATE_LIMIT_KEY]
}, async (req, res) => {
  if (req.method !== "POST") return sendError(res, 405, "Método não permitido.");
  let user, ipHash;
  try {
    user = await requestUser(req);
    const ip = normalizedSourceIp(req);
    ipHash = sourceIpHash(ip, PUBLIC_FORM_RATE_LIMIT_KEY.value(), "message");
  } catch (error) { return publicFormError(res, error); }
  const body = req.body || {};
  // Honeypot: respond as if accepted while intentionally skipping all storage.
  if (String(body.companyWebsite || "").trim()) return res.status(200).json({ ok: true });
  const name = String(body.name || "").trim();
  const email = String(body.email || "").trim().toLowerCase();
  const phone = String(body.phone || "").replace(/[^\d+()\s-]/g, "").trim().slice(0, 40);
  const subject = String(body.subject || "").trim();
  const message = String(body.message || "").trim();
  if (name.length < 1 || name.length > 120 || !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email) || email.length > 254
    || subject.length < 1 || subject.length > 100 || message.length < 8 || message.length > 1500) return publicFormError(res, new Error("MESSAGE_INVALID"));
  try {
    const messageRef = db.collection("messages").doc();
    const result = await db.runTransaction(async transaction => {
      const limits = await readFormRateLimits(transaction, "message", user.uid, ipHash);
      const now = admin.firestore.FieldValue.serverTimestamp();
      transaction.create(messageRef, { uid: user.uid, name, email, ...(phone ? { phone } : {}), subject, message, status: "Nova", createdAt: now, updatedAt: now });
      writeFormRateLimits(transaction, "message", user.uid, limits);
      return { ok: true };
    });
    return res.status(200).json(result);
  } catch (error) { return publicFormError(res, error); }
});
