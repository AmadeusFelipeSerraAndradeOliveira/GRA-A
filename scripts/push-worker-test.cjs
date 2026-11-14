const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const vm=require('node:vm');
const {generateKeyPairSync,sign,webcrypto}=require('node:crypto');
const {test}=require('node:test');

const source=fs.readFileSync(path.join(__dirname,'../cloudflare-push/src/index.js'),'utf8').replace('export default {','globalThis.worker = {');
const {privateKey,publicKey}=generateKeyPairSync('rsa',{modulusLength:2048});
const jwk={...publicKey.export({format:'jwk'}),kid:'local-test-key',alg:'RS256'};
const project='test-graca',origin='https://gracaoficial.com',orderId='local-test-order';
const subscriptionId='11111111-2222-4333-8444-555555555555';
function token(overrides={}){
  const now=Math.floor(Date.now()/1000);
  const header=Buffer.from(JSON.stringify({alg:'RS256',kid:jwk.kid})).toString('base64url');
  const body=Buffer.from(JSON.stringify({aud:project,iss:`https://securetoken.google.com/${project}`,iat:now,exp:now+3600,sub:'test-owner',...overrides})).toString('base64url');
  const content=`${header}.${body}`;
  return `${content}.${sign('RSA-SHA256',Buffer.from(content),privateKey).toString('base64url')}`;
}
function harness({subscribed=true,providerStatus=200,providerBody={id:'notification-test-id'},networkFailure=false,owner='test-owner',createdAt=new Date().toISOString(),admin=false}={}){
  const state=new Map(subscribed?[[`admin:${subscriptionId}`,'{}']]:[]),calls=[],logs=[];
  const env={FIREBASE_PROJECT_ID:project,ALLOWED_ORIGINS:origin,ONESIGNAL_APP_ID:'test-app',ONESIGNAL_REST_API_KEY:'local-secret',SITE_URL:origin,
    PUSH_STATE:{get:async key=>state.get(key)||null,put:async(key,value)=>{state.set(key,value);},delete:async key=>{state.delete(key);},list:async({prefix})=>({keys:[...state.keys()].filter(key=>key.startsWith(prefix)).map(name=>({name}))})}};
  const fetch=async(url,options)=>{
    if(url.includes('googleapis.com/service_accounts'))return Response.json({keys:[jwk]});
    if(url.includes('/documents/admins/'))return Response.json({}, {status:admin?200:403});
    if(url.includes('/documents/orders/'))return Response.json({fields:{uid:{stringValue:owner},status:{stringValue:'Aguardando confirmação'},createdAt:{timestampValue:createdAt}}});
    assert.equal(url,'https://api.onesignal.com/notifications?c=push');
    calls.push({url,options,payload:JSON.parse(options.body)});
    if(networkFailure)throw new Error('local network failure');
    // Reproduce the provider's contract, so removing the fallback breaks the test.
    if(!calls.at(-1).payload.contents.en||!calls.at(-1).payload.headings.en)return Response.json({errors:['Message Notifications must have English language content']},{status:400});
    return Response.json(providerBody,{status:providerStatus});
  };
  const context=vm.createContext({URL,Request,Response,TextDecoder,TextEncoder,Uint8Array,Date,atob,AbortSignal,crypto:webcrypto,fetch,console:{error:(...args)=>logs.push(args)}});
  vm.runInContext(source,context);
  const request=async(route='/orders/new',claims={},body={orderId},authenticated=true)=>{
    const headers={Origin:origin,'Content-Type':'application/json'};
    if(authenticated)headers.Authorization=`Bearer ${token(claims)}`;
    const result=await context.worker.fetch(new Request(`https://worker.test${route}`,{method:'POST',headers,body:JSON.stringify(body)}),env);
    return {status:result.status,body:await result.json()};
  };
  return {request,state,calls,logs,env,worker:context.worker};
}

test('pedido autenticado envia payload válido em português com fallback en',async()=>{
  const h=harness(),result=await h.request();
  assert.equal(result.status,200);assert.equal(result.body.notificationCreated,true);
  const {payload,options}=h.calls[0];
  assert.ok(payload.contents.en);assert.equal(payload.contents.en,payload.contents.pt);
  assert.equal(payload.headings.en,payload.headings.pt);
  assert.equal(payload.url,'https://gracaoficial.com/#admin');
  assert.deepEqual(payload.include_subscription_ids,[subscriptionId]);
  assert.equal(options.headers.Authorization,'Key local-secret');
  assert.equal(h.state.get(`order:${orderId}`),'sent');
  await h.request();assert.equal(h.calls.length,1);
});
test('ausência de inscrição não tenta enviar ao provedor',async()=>{
  const h=harness({subscribed:false}),r=await h.request();
  assert.equal(r.status,202);assert.equal(h.calls.length,0);
  assert.equal(h.state.has(`order:${orderId}`),false);
});
for(const [status,code] of [[400,'ONESIGNAL_INVALID_REQUEST'],[401,'ONESIGNAL_AUTH_ERROR'],[403,'ONESIGNAL_AUTH_ERROR'],[429,'ONESIGNAL_RATE_LIMIT'],[503,'ONESIGNAL_UNAVAILABLE']]){
  test(`rejeição ${status} é identificada sem expor credencial e permite nova tentativa`,async()=>{
    const h=harness({providerStatus:status,providerBody:{errors:['private provider detail']}}),r=await h.request();
    assert.equal(r.status,502);assert.equal(r.body.code,code);assert.equal(r.body.providerStatus,status);
    assert.equal(h.state.has(`order:${orderId}`),false);
    const visible=JSON.stringify({body:r.body,logs:h.logs});
    assert.ok(!visible.includes('local-secret'));assert.ok(!visible.includes(subscriptionId));
    assert.ok(!visible.includes('private provider detail'));
    await h.request();assert.equal(h.calls.length,2);
  });
}
test('erro de conexão libera a marca de envio e retorna erro controlado',async()=>{
  const h=harness({networkFailure:true}),r=await h.request();
  assert.equal(r.status,502);assert.equal(r.body.code,'ONESIGNAL_UNAVAILABLE');
  assert.equal(h.state.has(`order:${orderId}`),false);
});
for(const id of ['',null,undefined])test(`HTTP 200 com id ${String(id)} não marca aviso como enviado`,async()=>{
  const h=harness({providerBody:{id,errors:['All included players are not subscribed']}}),r=await h.request();
  assert.equal(r.status,202);assert.equal(r.body.notificationCreated,false);
  assert.equal(h.state.has(`order:${orderId}`),false);
});
test('envio em andamento não é apresentado como aviso já enviado',async()=>{
  const h=harness();h.state.set(`order:${orderId}`,'sending');
  const r=await h.request();assert.equal(r.status,202);assert.equal(r.body.pending,true);
  assert.equal(r.body.duplicate,undefined);assert.equal(h.calls.length,0);
});
test('resposta inesperada do provedor não é tratada como envio concluído',async()=>{
  const h=harness({providerBody:{}}),r=await h.request();
  assert.equal(r.status,502);assert.equal(r.body.code,'ONESIGNAL_INVALID_RESPONSE');
  assert.equal(h.state.has(`order:${orderId}`),false);
});
test('pedido de outro usuário e pedido antigo não disparam aviso',async()=>{
  for(const options of [{owner:'other-owner'},{createdAt:new Date(Date.now()-11*60*1000).toISOString()}]){
    const h=harness(options),r=await h.request();assert.ok([403,409].includes(r.status));assert.equal(h.calls.length,0);
  }
});
test('sessão ausente ou expirada não dispara aviso',async()=>{
  const h=harness();
  assert.equal((await h.request('/orders/new',{}, {orderId},false)).status,401);
  assert.equal((await h.request('/orders/new',{exp:0})).status,401);
  assert.equal(h.calls.length,0);
});
test('inscrição administrativa exige e-mail confirmado e autorização',async()=>{
  const h=harness({admin:true,subscribed:false});
  assert.equal((await h.request('/admin/subscribe',{}, {subscriptionId})).status,403);
  assert.equal((await h.request('/admin/subscribe',{email:'admin@example.test',email_verified:true},{subscriptionId})).status,200);
  assert.ok(h.state.has(`admin:${subscriptionId}`));
  const denied=harness({admin:false});
  assert.equal((await denied.request('/admin/subscribe',{email:'customer@example.test',email_verified:true},{subscriptionId})).status,403);
});
test('origem externa não pode chamar o Worker',async()=>{
  const h=harness();
  const result=await h.worker.fetch(new Request('https://worker.test/orders/new',{method:'POST',headers:{Origin:'https://other.test'}}),h.env);
  assert.equal(result.status,403);assert.equal(h.calls.length,0);
});
