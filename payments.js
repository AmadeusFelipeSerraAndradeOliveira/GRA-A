import { mercadoPagoConfig } from "./payment-config.js";

let cachedPublicKey = mercadoPagoConfig.publicKey;
let publicKeyRequest = null;

export function mercadoPagoReady() {
  return Boolean(mercadoPagoConfig.orderApiUrl);
}

export async function getMercadoPagoPublicKey(auth) {
  if (cachedPublicKey) return cachedPublicKey;
  if (!mercadoPagoConfig.publicKeyApiUrl) throw new Error("A configuração pública do Mercado Pago não está disponível.");
  if (!publicKeyRequest) {
    publicKeyRequest = (async () => {
      const idToken = await auth?.currentUser?.getIdToken();
      if (!idToken) throw new Error("Entre novamente para carregar o checkout.");
      const response = await fetch(mercadoPagoConfig.publicKeyApiUrl, { headers: { Authorization: `Bearer ${idToken}` } });
      const result = await response.json().catch(() => ({}));
      if (!response.ok || typeof result.publicKey !== "string" || !result.publicKey) {
        throw new Error(result.error || "Não foi possível carregar a chave pública do Mercado Pago.");
      }
      cachedPublicKey = result.publicKey;
      return cachedPublicKey;
    })().catch(error => {
      publicKeyRequest = null;
      throw error;
    });
  }
  return publicKeyRequest;
}

async function sendOrder({ auth, order, payment }) {
  if (!mercadoPagoReady()) throw new Error("O endpoint seguro do Mercado Pago não está configurado.");
  const idToken = await auth.currentUser?.getIdToken();
  if (!idToken) throw new Error("Entre novamente para continuar com o pagamento.");
  const response = await fetch(mercadoPagoConfig.orderApiUrl, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${idToken}`
    },
    body: JSON.stringify({ order, payment })
  });
  const result = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(result.error || "Não foi possível criar a order.");
  return result;
}

export async function renderCardPaymentBrick({ containerId, amount, auth, order, onPayment, onError }) {
  if (!window.MercadoPago) throw new Error("A biblioteca de pagamentos do Mercado Pago não carregou.");
  const publicKey = await getMercadoPagoPublicKey(auth);
  const mp = new window.MercadoPago(publicKey, { locale: "pt-BR" });
  const builder = mp.bricks();
  window.cardPaymentBrickController?.unmount?.();
  window.cardPaymentBrickController = await builder.create("cardPayment", containerId, {
    initialization: { amount },
    callbacks: {
      onReady: () => {},
      onError: error => onError?.(error),
      onSubmit: async (formData, additionalData) => {
        try {
          const result = await sendOrder({
            auth,
            order,
            payment: {
              ...formData,
              payment_type_id: additionalData?.paymentTypeId || "credit_card"
            }
          });
          await onPayment?.(result);
          return result;
        } catch (error) {
          onError?.(error);
          throw error;
        }
      }
    }
  });
  return window.cardPaymentBrickController;
}

export async function createPixOrder({ auth, order }) {
  return sendOrder({ auth, order, payment: { payment_method_id: "pix" } });
}

export async function getMarketplaceOrder({ auth, clientOrderId }) {
  if (!mercadoPagoReady()) throw new Error("O endpoint seguro do Mercado Pago não está configurado.");
  const idToken = await auth.currentUser?.getIdToken();
  if (!idToken) throw new Error("Entre novamente para acompanhar seu pedido.");
  const url = new URL(mercadoPagoConfig.orderApiUrl);
  url.searchParams.set("clientOrderId", clientOrderId);
  const response = await fetch(url.toString(), { headers: { Authorization: `Bearer ${idToken}` } });
  const result = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(result.error || "Não foi possível atualizar o status do pedido.");
  return result;
}
