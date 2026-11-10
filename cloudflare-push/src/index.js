const FIREBASE_JWKS_URL='https://www.googleapis.com/service_accounts/v1/jwk/securetoken@system.gserviceaccount.com';
let cachedFirebaseKeys=null,cachedFirebaseKeysUntil=0;

function base64UrlBytes(value){
  const base64=value.replace(/-/g,'+').replace(/_/g,'/').padEnd(Math.ceil(value.length/4)*4,'=');
  const binary=atob(base64),bytes=new Uint8Array(binary.length);
  for(let index=0;index<binary.length;index++)bytes[index]=binary.charCodeAt(index);
  return bytes;
}

async function getFirebaseKeys(){
  if(cachedFirebaseKeys&&Date.now()<cachedFirebaseKeysUntil)return cachedFirebaseKeys;
  const response=await fetch(FIREBASE_JWKS_URL);
  if(!response.ok)throw new Error('Não foi possível validar a identidade do Firebase.');
  cachedFirebaseKeys=await response.json();cachedFirebaseKeysUntil=Date.now()+60*60*1000;
  return cachedFirebaseKeys;
}

async function verifyFirebaseToken(token,projectId){
  const parts=String(token||'').split('.');
  if(parts.length!==3)throw new Error('Sessão do Firebase inválida.');
  const decoder=new TextDecoder();
  const header=JSON.parse(decoder.decode(base64UrlBytes(parts[0])));
  const claims=JSON.parse(decoder.decode(base64UrlBytes(parts[1])));
  if(header.alg!=='RS256'||!header.kid||claims.aud!==projectId||claims.iss!==`https://securetoken.google.com/${projectId}`)throw new Error('Sessão do Firebase inválida.');
  const now=Math.floor(Date.now()/1000);
  if(typeof claims.exp!=='number'||claims.exp<=now||typeof claims.iat!=='number'||claims.iat>now+60||typeof claims.sub!=='string'||!claims.sub)throw new Error('A sessão do Firebase expirou.');
  const jwks=await getFirebaseKeys(),jwk=jwks.keys.find(key=>key.kid===header.kid&&key.alg==='RS256');
  if(!jwk)throw new Error('Chave de sessão do Firebase desconhecida.');
  const publicKey=await crypto.subtle.importKey('jwk',jwk,{name:'RSASSA-PKCS1-v1_5',hash:'SHA-256'},false,['verify']);
  const valid=await crypto.subtle.verify('RSASSA-PKCS1-v1_5',publicKey,base64UrlBytes(parts[2]),new TextEncoder().encode(`${parts[0]}.${parts[1]}`));
  if(!valid)throw new Error('A assinatura da sessão do Firebase não confere.');
  return claims;
}

function allowedOrigins(env){return String(env.ALLOWED_ORIGINS||'').split(',').map(origin=>origin.trim()).filter(Boolean);}

function responseJson(body,status,origin,env){
  const headers={'Content-Type':'application/json; charset=utf-8','Cache-Control':'no-store','X-Content-Type-Options':'nosniff','Vary':'Origin'};
  if(origin&&allowedOrigins(env).includes(origin)){
    headers['Access-Control-Allow-Origin']=origin;
    headers['Access-Control-Allow-Methods']='GET, POST, OPTIONS';
    headers['Access-Control-Allow-Headers']='Authorization, Content-Type';
    headers['Access-Control-Max-Age']='600';
  }
  return new Response(JSON.stringify(body),{status,headers});
}

function bearerToken(request){
  const value=request.headers.get('Authorization')||'';
  return value.startsWith('Bearer ')?value.slice(7).trim():'';
}

async function readOwnFirestoreDocument(projectId,documentPath,token){
  const url=`https://firestore.googleapis.com/v1/projects/${encodeURIComponent(projectId)}/databases/(default)/documents/${documentPath}`;
  return fetch(url,{headers:{Authorization:`Bearer ${token}`,'Accept':'application/json'}});
}

async function authorizeAdmin(token,env){
  const claims=await verifyFirebaseToken(token,env.FIREBASE_PROJECT_ID);
  if(claims.email_verified!==true||!claims.email)throw new Error('Confirme o e-mail da conta administrativa.');
  if(claims.admin===true)return claims;
  const response=await readOwnFirestoreDocument(env.FIREBASE_PROJECT_ID,`admins/${encodeURIComponent(claims.sub)}`,token);
  if(!response.ok)throw new Error('A conta não possui autorização administrativa no Firebase.');
  return claims;
}

async function handleAdminSubscribe(request,env,origin){
  if(!env.PUSH_STATE||!env.ONESIGNAL_APP_ID) return responseJson({error:'O serviço de aviso está incompleto.'},503,origin,env);
  const token=bearerToken(request);if(!token)return responseJson({error:'Sessão administrativa necessária.'},401,origin,env);
  let claims;
  try{claims=await authorizeAdmin(token,env);}catch(error){return responseJson({error:error.message||'Acesso administrativo negado.'},403,origin,env);}
  let body;try{body=await request.json();}catch{return responseJson({error:'Corpo da solicitação inválido.'},400,origin,env);}
  const subscriptionId=String(body.subscriptionId||'');
  if(!/^[A-Za-z0-9-]{20,64}$/.test(subscriptionId))return responseJson({error:'Inscrição de avisos inválida.'},400,origin,env);
  await env.PUSH_STATE.put(`admin:${subscriptionId}`,JSON.stringify({uid:claims.sub,updatedAt:new Date().toISOString()}),{expirationTtl:60*60*24*365});
  return responseJson({ok:true},200,origin,env);
}

function firestoreField(document,key,type){return document?.fields?.[key]?.[type]??null;}

async function handleNewOrder(request,env,origin){
  if(!env.PUSH_STATE||!env.ONESIGNAL_APP_ID||!env.ONESIGNAL_REST_API_KEY)return responseJson({error:'O serviço de aviso não está configurado.'},503,origin,env);
  const token=bearerToken(request);if(!token)return responseJson({error:'Sessão do cliente necessária.'},401,origin,env);
  let claims;try{claims=await verifyFirebaseToken(token,env.FIREBASE_PROJECT_ID);}catch(error){return responseJson({error:error.message||'Sessão inválida.'},401,origin,env);}
  let body;try{body=await request.json();}catch{return responseJson({error:'Corpo da solicitação inválido.'},400,origin,env);}
  const orderId=String(body.orderId||'');
  if(!/^[A-Za-z0-9_-]{8,64}$/.test(orderId))return responseJson({error:'Identificador do pedido inválido.'},400,origin,env);
  const orderResponse=await readOwnFirestoreDocument(env.FIREBASE_PROJECT_ID,`orders/${encodeURIComponent(orderId)}`,token);
  if(!orderResponse.ok)return responseJson({error:'A reserva não foi confirmada pelo Firebase.'},403,origin,env);
  const order=await orderResponse.json();
  if(firestoreField(order,'uid','stringValue')!==claims.sub||firestoreField(order,'status','stringValue')!=='Aguardando confirmação')return responseJson({error:'A reserva não está apta para aviso.'},403,origin,env);
  const createdAt=Date.parse(firestoreField(order,'createdAt','timestampValue')||'');
  if(!Number.isFinite(createdAt)||Date.now()-createdAt>10*60*1000||createdAt>Date.now()+60*1000)return responseJson({error:'A reserva está fora da janela de envio de avisos.'},409,origin,env);
  const dedupeKey=`order:${orderId}`;
  if(await env.PUSH_STATE.get(dedupeKey))return responseJson({ok:true,duplicate:true},200,origin,env);
  const subscriptions=await env.PUSH_STATE.list({prefix:'admin:',limit:1000});
  const subscriptionIds=subscriptions.keys.map(item=>item.name.slice('admin:'.length)).filter(Boolean);
  if(!subscriptionIds.length)return responseJson({ok:true,subscribedDevices:0},202,origin,env);
  await env.PUSH_STATE.put(dedupeKey,'sending',{expirationTtl:120});
  const pushResponse=await fetch('https://api.onesignal.com/notifications',{
    method:'POST',headers:{'Content-Type':'application/json','Authorization':`Key ${env.ONESIGNAL_REST_API_KEY}`},
    body:JSON.stringify({
      app_id:env.ONESIGNAL_APP_ID,
      target_channel:'push',
      include_subscription_ids:subscriptionIds,
      headings:{pt:'GRAÇA · Nova reserva'},
      contents:{pt:'Uma nova solicitação chegou. Abra o painel para conferir os detalhes.'},
      url:env.SITE_URL||'https://graca-454ff.web.app'
    })
  });
  if(!pushResponse.ok){
    await env.PUSH_STATE.delete(dedupeKey);
    console.error('OneSignal recusou a notificação:',pushResponse.status,await pushResponse.text());
    return responseJson({error:'O serviço de avisos não aceitou a notificação.'},502,origin,env);
  }
  await env.PUSH_STATE.put(dedupeKey,'sent',{expirationTtl:60*60*24});
  return responseJson({ok:true,subscribedDevices:subscriptionIds.length},200,origin,env);
}

export default {
  async fetch(request,env){
    const origin=request.headers.get('Origin')||'';
    const allowed=allowedOrigins(env);
    if(origin&&!allowed.includes(origin))return new Response('Origem não autorizada.',{status:403,headers:{'Cache-Control':'no-store'}});
    const url=new URL(request.url);
    if(request.method==='OPTIONS'){
      if(!origin||!allowed.includes(origin))return new Response(null,{status:403});
      return new Response(null,{status:204,headers:{
        'Access-Control-Allow-Origin':origin,'Access-Control-Allow-Methods':'GET, POST, OPTIONS',
        'Access-Control-Allow-Headers':'Authorization, Content-Type','Access-Control-Max-Age':'600','Vary':'Origin'
      }});
    }
    if(url.pathname==='/health'&&request.method==='GET')return responseJson({ok:true,configured:Boolean(env.ONESIGNAL_APP_ID&&env.ONESIGNAL_REST_API_KEY&&env.PUSH_STATE)},200,origin,env);
    if(url.pathname==='/admin/subscribe'&&request.method==='POST')return handleAdminSubscribe(request,env,origin);
    if(url.pathname==='/orders/new'&&request.method==='POST')return handleNewOrder(request,env,origin);
    return responseJson({error:'Rota não encontrada.'},404,origin,env);
  }
};
