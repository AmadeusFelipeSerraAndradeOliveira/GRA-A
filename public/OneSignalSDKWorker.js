// Registra o tipo de evento na primeira avaliação do service worker. O SDK
// pode instalar seu próprio ouvinte `message` depois da inicialização assíncrona.
self.addEventListener('message', () => {});
importScripts('https://cdn.onesignal.com/sdks/web/v16/OneSignalSDK.sw.js');
