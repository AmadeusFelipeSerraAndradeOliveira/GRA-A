import { ADMIN_PUSH_CONFIG } from './push-config.js';

let oneSignalPromise = null;

function workerBaseUrl() {
  const value=String(ADMIN_PUSH_CONFIG.workerUrl||'').trim().replace(/\/$/,'');
  if(!value)return '';
  try{const url=new URL(value);return url.protocol==='https:'?url.toString().replace(/\/$/,''):'';}catch{return '';}
}

export function isAdminPushConfigured() {
  return Boolean(String(ADMIN_PUSH_CONFIG.oneSignalAppId || '').trim() && workerBaseUrl());
}

async function getOneSignal() {
  const appId=String(ADMIN_PUSH_CONFIG.oneSignalAppId||'').trim();
  if(!appId)throw new Error('O aviso remoto ainda não foi conectado. Configure o App ID do OneSignal e publique o serviço de avisos.');
  if(oneSignalPromise)return oneSignalPromise;
  oneSignalPromise=new Promise((resolve,reject)=>{
    window.OneSignalDeferred=window.OneSignalDeferred||[];
    window.OneSignalDeferred.push(async OneSignal=>{
      try{
        const initializedAppId=window.__gracaOneSignalAppId;
        if(initializedAppId&&initializedAppId!==appId)throw new Error('Este navegador já carregou outro aplicativo OneSignal. Atualize a página.');
        if(!initializedAppId){
          await OneSignal.init({appId,autoResubscribe:true});
          window.__gracaOneSignalAppId=appId;
        }
        resolve(OneSignal);
      }catch(error){reject(error);}
    });
    if(!document.querySelector('[data-graca-onesignal-sdk]')){
      const script=document.createElement('script');
      script.src='https://cdn.onesignal.com/sdks/web/v16/OneSignalSDK.page.js';
      script.defer=true;script.dataset.gracaOnesignalSdk='true';
      script.onerror=()=>reject(new Error('Não foi possível carregar o serviço de avisos. Confira sua conexão e tente novamente.'));
      document.head.append(script);
    }
  }).catch(error=>{oneSignalPromise=null;throw error;});
  return oneSignalPromise;
}

async function waitForSubscriptionId(OneSignal,timeoutMs=20000) {
  const started=Date.now();
  while(Date.now()-started<timeoutMs){
    const subscriptionId=OneSignal.User?.PushSubscription?.id;
    if(subscriptionId)return subscriptionId;
    await new Promise(resolve=>setTimeout(resolve,500));
  }
  return null;
}

async function workerRequest(path,user,body) {
  const base=workerBaseUrl();
  if(!base)throw new Error('Configure o endereço HTTPS do serviço de avisos em push-config.js.');
  const token=await user.getIdToken(true);
  const response=await fetch(`${base}${path}`,{
    method:'POST',headers:{'Authorization':`Bearer ${token}`,'Content-Type':'application/json'},
    body:JSON.stringify(body)
  });
  const result=await response.json().catch(()=>({}));
  if(!response.ok)throw new Error(result.error||'O serviço de avisos recusou a solicitação.');
  return result;
}

export async function enableAdminPush(user) {
  if(!user?.email||user.isAnonymous)throw new Error('Use uma conta administrativa com e-mail confirmado.');
  if(user.emailVerified!==true)throw new Error('Confirme o e-mail da conta administrativa antes de ativar avisos.');
  if(!workerBaseUrl())throw new Error('O serviço externo ainda não foi publicado. Configure a URL HTTPS no arquivo push-config.js.');
  const OneSignal=await getOneSignal();
  if(!OneSignal.Notifications.isPushSupported())throw new Error('Este navegador ou dispositivo não oferece avisos web.');
  await OneSignal.User.PushSubscription.optIn();
  const subscriptionId=await waitForSubscriptionId(OneSignal);
  if(!subscriptionId)throw new Error('O navegador não confirmou a inscrição. Permita os avisos e tente novamente.');
  await workerRequest('/admin/subscribe',user,{subscriptionId});
  return true;
}

export async function notifyAdminPushForOrder(orderId,user) {
  if(!user||!workerBaseUrl()||!ADMIN_PUSH_CONFIG.oneSignalAppId)return false;
  const value=String(orderId||'');
  if(!/^[A-Za-z0-9_-]{8,64}$/.test(value))return false;
  await workerRequest('/orders/new',user,{orderId:value});
  return true;
}
