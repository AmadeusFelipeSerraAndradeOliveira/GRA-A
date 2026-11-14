const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const vm=require('node:vm');
const {test}=require('node:test');

const root=path.resolve(__dirname,'..');
const configSource=fs.readFileSync(path.join(root,'push-config.js'),'utf8').replace('export const','const');
const source=fs.readFileSync(path.join(root,'admin-push.js'),'utf8').replace(/^import .*;\r?\n/,'').replace(/export /g,'');
function harness({origin='https://graca-454ff.web.app',initError=null,downloadFails=false}={}){
  const stats={initializations:0,scripts:0,requests:[],permissionRequests:0};
  let script=null;
  const sdk={
    init:async()=>{stats.initializations++;if(initError)throw initError;},
    Notifications:{isPushSupported:()=>true,permissionNative:'granted',requestPermission:async()=>{stats.permissionRequests++;return true;}},
    User:{PushSubscription:{id:'test-subscription',optedIn:true,optIn:async()=>{}}}
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
    fetch:async(url,options)=>{stats.requests.push({url,options});return {ok:true,json:async()=>({})};}});
  vm.runInContext(configSource,context);
  const load=()=>vm.runInContext(`(()=>{${source}\nreturn {prepareAdminPush,enableAdminPush,adminPushActivationUrl,isAdminPushOrigin};})()`,context);
  return {api:load(),load,stats,sdk,window};
}
const user={email:'admin@example.test',emailVerified:true,isAnonymous:false,getIdToken:async()=>'test-token'};

test('outro domínio não carrega nem inicializa o SDK e indica o painel correto',async()=>{
  const h=harness({origin:'https://gracaoficial.com'});
  assert.equal(h.api.isAdminPushOrigin(),false);
  assert.equal(h.api.adminPushActivationUrl(),'https://graca-454ff.web.app/#admin');
  await assert.rejects(h.api.prepareAdminPush(),/Ative os avisos no painel em https:\/\/graca-454ff.web.app/);
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
  const failure=new Error('Can only be used on: https://graca-454ff.web.app');
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
  const h=harness();h.sdk.Notifications.permissionNative='denied';
  await assert.rejects(h.api.enableAdminPush(user),/bloqueados neste navegador/);
  assert.equal(h.stats.requests.length,0);
});

test('botão em outro domínio abre o painel autorizado sem preparar o SDK',()=>{
  const app=fs.readFileSync(path.join(root,'app.js'),'utf8');
  const view=app.slice(app.indexOf('function renderAdminOverview(el) {'),app.indexOf('function renderFinanceBars('));
  let destination=null,prepared=0,notice=null;
  const button={closest:()=>({after:element=>{notice=element;}})};
  const context=vm.createContext({URL,orders:[],customers:[],activeProducts:()=>[],isVisibleAfterFinanceReset:()=>true,
    isAdminPushConfigured:()=>true,isAdminPushOrigin:()=>false,
    adminPushActivationUrl:()=>'https://graca-454ff.web.app/#admin',
    $:()=>button,$$:()=>[],prepareAdminPush:()=>{prepared++;return Promise.resolve();},
    document:{createElement:()=>({})},window:{location:{assign:url=>{destination=url;}}}});
  vm.runInContext(view,context);
  context.renderAdminOverview({});
  assert.equal(button.textContent,'ABRIR PAINEL PARA ATIVAR AVISOS');
  assert.match(notice.textContent,/graca-454ff.web.app/);
  button.onclick();
  assert.equal(destination,'https://graca-454ff.web.app/#admin');
  assert.equal(prepared,0);
});
