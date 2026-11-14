const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const vm=require('node:vm');
const {test}=require('node:test');

const root=path.resolve(__dirname,'..');
const configSource=fs.readFileSync(path.join(root,'push-config.js'),'utf8').replace('export const','const');
const source=fs.readFileSync(path.join(root,'admin-push.js'),'utf8').replace(/^import .*;\r?\n/,'').replace(/export /g,'');
function harness({origin='https://gracaoficial.com',initError=null,downloadFails=false,workerFailure=null}={}){
  const stats={initializations:0,scripts:0,requests:[],permissionRequests:0};
  let script=null;
  const sdk={
    init:async()=>{stats.initializations++;if(initError)throw initError;},
    Notifications:{isPushSupported:()=>true,permissionNative:'granted',requestPermission:async()=>{stats.permissionRequests++;return true;}},
    User:{PushSubscription:{id:'test-subscription',token:'test-push-token',optedIn:true,optIn:async()=>{}}}
  };
  const window={location:{origin},Notification:{permission:'granted'}};
  const document={
    querySelector:()=>script,
    createElement:()=>({dataset:{},remove(){script=null;}}),
    head:{append(element){script=element;stats.scripts++;setImmediate(()=>{
      if(downloadFails){downloadFails=false;element.onerror();}
      else{
        const callbacks=window.OneSignalDeferred.splice(0);
        window.OneSignalDeferred.push=callback=>{void callback(sdk);};
        callbacks.forEach(callback=>{void callback(sdk);});
      }
    });}}
  };
  const context=vm.createContext({window,document,URL,Date,setTimeout,
    fetch:async(url,options)=>{stats.requests.push({url,options});return {ok:!workerFailure,status:workerFailure?502:200,json:async()=>workerFailure||({})};}});
  vm.runInContext(configSource,context);
  const load=()=>vm.runInContext(`(()=>{${source}\nreturn {prepareAdminPush,enableAdminPush,adminPushActivationUrl,isAdminPushOrigin,notifyAdminPushForOrder,waitForSubscriptionId};})()`,context);
  return {api:load(),load,stats,sdk,window};
}
const user={email:'admin@example.test',emailVerified:true,isAnonymous:false,getIdToken:async()=>'test-token'};

test('outro domínio não carrega nem inicializa o SDK e indica o painel correto',async()=>{
  const h=harness({origin:'https://graca-454ff.web.app'});
  assert.equal(h.api.isAdminPushOrigin(),false);
  assert.equal(h.api.adminPushActivationUrl(),'https://gracaoficial.com/#admin');
  await assert.rejects(h.api.prepareAdminPush(),/Ative os avisos no painel em https:\/\/gracaoficial.com/);
  await assert.rejects(h.api.enableAdminPush(user),/Ative os avisos no painel/);
  assert.equal(h.stats.scripts,0);
  assert.equal(h.stats.initializations,0);
});
test('preparações concorrentes e ativação compartilham uma inicialização',async()=>{
  const h=harness();
  await Promise.all([h.api.prepareAdminPush(),h.api.prepareAdminPush()]);
  assert.equal(h.stats.permissionRequests,0);
  await h.api.enableAdminPush(user);
  await h.load().prepareAdminPush();
  assert.equal(h.stats.initializations,1);
  assert.equal(h.stats.scripts,1);
  assert.equal(h.stats.requests.length,1);
  assert.match(h.stats.requests[0].url,/\/admin\/subscribe$/);
  assert.equal(h.stats.requests[0].options.headers.Authorization,'Bearer test-token');
  assert.equal(JSON.parse(h.stats.requests[0].options.body).subscriptionId,'test-subscription');
});
test('falha de init preserva o erro original sem reinicializar o SDK',async()=>{
  const failure=new Error('Can only be used on: https://gracaoficial.com');
  const h=harness({initError:failure});
  const isOriginalFailure=error=>error.cause===failure&&error.requiresReload===true;
  await assert.rejects(h.api.prepareAdminPush(),isOriginalFailure);
  await assert.rejects(h.api.enableAdminPush(user),isOriginalFailure);
  await assert.rejects(h.load().prepareAdminPush(),isOriginalFailure);
  assert.equal(h.stats.initializations,1);
  assert.equal(h.stats.requests.length,0);
});
test('download interrompido pode ser repetido sem duplicar callback de init',async()=>{
  const h=harness({downloadFails:true});
  await assert.rejects(h.api.prepareAdminPush(),/Não foi possível carregar/);
  await h.api.prepareAdminPush();
  assert.equal(h.stats.scripts,2);
  assert.equal(h.stats.initializations,1);
});
test('notificações bloqueadas não inscrevem o dispositivo',async()=>{
  const h=harness();h.sdk.Notifications.permissionNative='denied';h.window.Notification.permission='denied';
  await assert.rejects(h.api.enableAdminPush(user),/bloqueados neste navegador/);
  assert.equal(h.stats.requests.length,0);
});
test('permissão no Android é solicitada no toque, sem aguardar novamente o SDK',async()=>{
  const h=harness();await h.api.prepareAdminPush();
  h.window.Notification.permission='default';h.sdk.Notifications.permissionNative='default';
  h.sdk.Notifications.requestPermission=()=>{
    h.stats.permissionRequests++;
    h.window.Notification.permission='granted';
  };
  const activation=h.api.enableAdminPush(user);
  assert.equal(h.stats.permissionRequests,1);
  await activation;
  assert.equal(h.stats.requests.length,1);
});
test('retorno void de requestPermission aceita o estado booleano público do SDK',async()=>{
  const h=harness();await h.api.prepareAdminPush();
  h.window.Notification.permission='default';h.sdk.Notifications.permissionNative='default';
  h.sdk.Notifications.requestPermission=()=>{h.sdk.Notifications.permission=true;};
  await h.api.enableAdminPush(user);assert.equal(h.stats.requests.length,1);
});
test('permissão não concedida orienta o Android e não registra um aparelho inativo',async()=>{
  const h=harness();await h.api.prepareAdminPush();
  h.window.Notification.permission='default';h.sdk.Notifications.permissionNative='default';
  h.sdk.Notifications.requestPermission=()=>{};
  await assert.rejects(h.api.enableAdminPush(user),/configurações do Android/);
  assert.equal(h.stats.requests.length,0);
});
test('ID antigo sem token aguarda a inscrição ativa antes de registrar no Worker',async()=>{
  const h=harness();await h.api.prepareAdminPush();
  const subscription=h.sdk.User.PushSubscription;
  subscription.token=null;subscription.optedIn=false;
  subscription.optIn=async()=>{setTimeout(()=>{subscription.token='android-token';subscription.optedIn=true;},10);};
  const activation=h.api.enableAdminPush(user);
  assert.equal(h.stats.requests.length,0);
  await activation;assert.equal(h.stats.requests.length,1);
});
test('ID sem token ou opt-in nunca é aceito como confirmação de inscrição',async()=>{
  for(const update of [{token:null},{optedIn:false}]){
    const h=harness();Object.assign(h.sdk.User.PushSubscription,update);
    assert.equal(await h.api.waitForSubscriptionId(h.sdk,10),null);
    assert.equal(h.stats.requests.length,0);
  }
});
test('falha do Worker preserva código e status do OneSignal para diagnóstico',async()=>{
  const h=harness({workerFailure:{error:'A reserva continua salva.',code:'ONESIGNAL_AUTH_ERROR',providerStatus:403}});
  await assert.rejects(h.api.notifyAdminPushForOrder('local-order-test',user),error=>
    error.code==='ONESIGNAL_AUTH_ERROR'&&error.status===502&&error.providerStatus===403);
});

test('botão em outro domínio abre o painel autorizado sem preparar o SDK',()=>{
  const app=fs.readFileSync(path.join(root,'app.js'),'utf8');
  const view=app.slice(app.indexOf('function renderAdminOverview(el) {'),app.indexOf('function renderFinanceBars('));
  let destination=null,prepared=0,notice=null;
  const button={closest:()=>({after:element=>{notice=element;}})};
  const context=vm.createContext({URL,orders:[],customers:[],activeProducts:()=>[],isVisibleAfterFinanceReset:()=>true,
    isAdminPushConfigured:()=>true,isAdminPushOrigin:()=>false,
    adminPushActivationUrl:()=>'https://gracaoficial.com/#admin',
    $:()=>button,$$:()=>[],prepareAdminPush:()=>{prepared++;return Promise.resolve();},
    document:{createElement:()=>({})},window:{location:{assign:url=>{destination=url;}}}});
  vm.runInContext(view,context);
  context.renderAdminOverview({});
  assert.equal(button.textContent,'ABRIR PAINEL PARA ATIVAR AVISOS');
  assert.match(notice.textContent,/gracaoficial.com/);
  button.onclick();
  assert.equal(destination,'https://gracaoficial.com/#admin');
  assert.equal(prepared,0);
});
test('erro de ativação permanece visível no painel do celular',async()=>{
  const app=fs.readFileSync(path.join(root,'app.js'),'utf8');
  const view=app.slice(app.indexOf('function renderAdminOverview(el) {'),app.indexOf('function renderFinanceBars('));
  let status=null;
  const button={isConnected:true,closest:()=>({after:element=>{status=element;}})};
  const context=vm.createContext({orders:[],customers:[],activeProducts:()=>[],isVisibleAfterFinanceReset:()=>true,
    isAdminPushConfigured:()=>true,isAdminPushOrigin:()=>true,$:()=>button,$$:()=>[],
    prepareAdminPush:async()=>true,enableAdminPush:async()=>{throw new Error('Permita notificações nas configurações do Android.');},
    document:{createElement:()=>({setAttribute(){}})},auth:{currentUser:user},isAdmin:true,toast:()=>{},console:{warn(){}}});
  vm.runInContext(view,context);context.renderAdminOverview({});
  await Promise.resolve();await Promise.resolve();
  await button.onclick();
  assert.match(status.textContent,/configurações do Android/);
  assert.equal(button.disabled,false);
});
