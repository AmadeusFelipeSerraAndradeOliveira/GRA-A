// Public endpoints only. Never put an Access Token or Client Secret in this file.
const localDevelopment = ["localhost", "127.0.0.1"].includes(window.location.hostname);
const apiBase = localDevelopment ? "" : "https://graca-454ff.web.app";

export const mercadoPagoConfig = Object.freeze({
  publicKeyApiUrl: `${apiBase}/api/mercadopago/config`,
  publicKey: "",
  orderApiUrl: `${apiBase}/api/mercadopago/order`
});
