const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const vm=require('node:vm');
const {test}=require('node:test');
const app=fs.readFileSync(path.join(__dirname,'../app.js'),'utf8');
const source=app.slice(app.indexOf('function getAdminPassersby()'),app.indexOf('async function deleteCustomerRecord(uid)'));
function harness({customers=[],vipUsers=[],orders=[]}={}){
  const elements=new Map();
  const context=vm.createContext({customers,vipUsers,orders,adminVipSearch:'',
    safeDate:value=>new Date(value?.toDate?value.toDate():value||0),
    normalizeBrazilPhone:value=>String(value||'').replace(/\D/g,'').replace(/^55(?=\d{10,11}$)/,''),
    htm:value=>String(value??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c])),
    $:selector=>{if(!elements.has(selector))elements.set(selector,{focus(){}});return elements.get(selector);},$$:()=>[],
    configureVipInvite(){},manualVipEditor(){},openProtectedBulkDeleteDialog(){}});
  vm.runInContext(source,context);
  return {context,render(){context.renderAdminCustomers();return elements.get('#adminContent').innerHTML;}};
}
const customer={uid:'account-1',name:'Ana <Teste>',email:'ana@example.test',phone:'63999990001',createdAt:'2026-11-08'};
const member={...customer,status:'active'};
const order={id:'order-test',uid:'visitor-1',customerName:'Felipe',phone:'63999990002',status:'Aguardando confirmação',confirmationCode:'GRA-TESTE',createdAt:'2026-11-14'};
test('conta e VIP do mesmo UID aparecem uma única vez',()=>{
  const h=harness({customers:[customer],vipUsers:[member]});
  const rows=h.context.getAdminCustomerDirectory();
  assert.equal(rows.length,1);assert.equal(rows[0].type,'vip');
  assert.ok(rows[0].customer);assert.ok(rows[0].member);
});
test('contas distintas com o mesmo contato não são fundidas',()=>{
  const h=harness({customers:[customer,{...customer,uid:'account-2'}]});
  assert.equal(h.context.getAdminCustomerDirectory().length,2);
});
test('histórico do cliente e passantes são preservados na tabela única',()=>{
  const h=harness({customers:[customer],vipUsers:[member],orders:[order,{...order,id:'order-2'},{...order,id:'account-order',uid:customer.uid,phone:customer.phone}]});
  const rows=h.context.getAdminCustomerDirectory();
  assert.equal(rows.length,2);
  assert.equal(rows.find(row=>row.type==='vip').count,1);
  assert.equal(rows.find(row=>row.type==='visitor').count,2);
  const html=h.render();assert.equal((html.match(/<table\b/g)||[]).length,1);
  assert.ok(html.includes('Ana &lt;Teste&gt;'));assert.ok(!html.includes('Ana <Teste>'));
  assert.ok(html.includes('data-vip-status="account-1"'));assert.ok(html.includes('data-delete-customer="account-1"'));
  assert.ok(html.includes('2 solicitações de reserva'));
});
test('filtros e busca por pedido encontram a conta sem duplicá-la',()=>{
  const h=harness({customers:[customer],vipUsers:[member],orders:[{...order,uid:customer.uid,phone:customer.phone}]});
  h.context.adminVipSearch='GRA-TESTE';
  assert.ok(h.render().includes('Ana &lt;Teste&gt;'));
  vm.runInContext("adminCustomerFilter='visitor'",h.context);
  assert.ok(h.render().includes('Nenhum cliente encontrado'));
});
test('VIP removido mantém a conta e a ação de reativação',()=>{
  const h=harness({customers:[customer],vipUsers:[{...member,status:'removed'}]});
  assert.equal(h.context.getAdminCustomerDirectory()[0].type,'customer');
  assert.ok(h.render().includes('REATIVAR VIP'));
});
test('paginação limita linhas e ordenação por nome funciona',()=>{
  const customers=Array.from({length:15},(_,i)=>({...customer,uid:`u${i}`,name:`Cliente ${String(i).padStart(2,'0')}`}));
  const h=harness({customers});vm.runInContext("adminCustomerSort='name'",h.context);
  let html=h.render();assert.ok(html.includes('Mostrando 1–12 de 15'));assert.ok(!html.includes('<strong>Cliente 14</strong>'));
  vm.runInContext('adminCustomerPage=2',h.context);
  html=h.render();assert.ok(html.includes('Mostrando 13–15 de 15'));assert.ok(html.includes('<strong>Cliente 14</strong>'));
});
