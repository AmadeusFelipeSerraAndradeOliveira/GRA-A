import {
  createUserWithEmailAndPassword,
  getAuth,
  getIdTokenResult,
  onAuthStateChanged,
  signInAnonymously,
  sendEmailVerification,
  sendPasswordResetEmail,
  signInWithEmailAndPassword,
  signOut,
  updateProfile
} from "https://www.gstatic.com/firebasejs/13.1.0/firebase-auth.js";
import {
  collection, doc, getDoc, getDocs, getFirestore, limit, onSnapshot, orderBy, query,
  runTransaction, serverTimestamp, setDoc, updateDoc, where
} from "https://www.gstatic.com/firebasejs/13.1.0/firebase-firestore.js";
import app from "./firebase.js";
import { exampleProductTemplates } from "./catalog-seed.js";

/* GRAÇA GMC · vitrine, reservas e gestão operacional no Firebase. */
const auth = getAuth(app);
const db = getFirestore(app);
const $ = (s, r=document) => r.querySelector(s);
const $$ = (s, r=document) => [...r.querySelectorAll(s)];
const money = n => n.toLocaleString('pt-BR',{style:'currency',currency:'BRL'});
const uid = () => 'G'+Math.random().toString(36).slice(2,9).toUpperCase();
const seedProducts = [
 {id:'p1',name:'Blusa Movimento',category:'Blusas',price:89.9,stock:12,sizes:['P','M','G'],color:'pink',mark:'GRAÇA',description:'Uma peça cheia de atitude para compor looks autênticos.',featured:true},
 {id:'p2',name:'Saia Energia',category:'Saias',price:119.9,stock:8,sizes:['P','M','G'],color:'green',mark:'ENERGIA',description:'Movimento, cor e personalidade em uma só peça.',featured:true},
 {id:'p3',name:'Vestido Presença',category:'Vestidos',price:159.9,stock:5,sizes:['P','M','G'],color:'yellow',mark:'PRESENÇA',description:'Silhueta marcante para você ocupar todos os espaços.',featured:true},
 {id:'p4',name:'Calça Essência',category:'Calças',price:139.9,stock:9,sizes:['36','38','40','42'],color:'red',mark:'ESSÊNCIA',description:'Versátil e atemporal, feita para muitas combinações.',featured:false},
 {id:'p5',name:'Top Frequência',category:'Blusas',price:69.9,stock:15,sizes:['P','M','G'],color:'green',mark:'FREQ.',description:'Um essencial nada básico para o seu guarda-roupa.',featured:false},
 {id:'p6',name:'Camisa Livre',category:'Camisas',price:129.9,stock:6,sizes:['P','M','G'],color:'pink',mark:'LIVRE',description:'Clássica com uma dose extra de personalidade.',featured:false}
];
const get = (k, fallback) => {try{return JSON.parse(localStorage.getItem('graca_'+k)) ?? fallback}catch{return fallback}};
const set = (k,v) => localStorage.setItem('graca_'+k,JSON.stringify(v));
let products=get('products',seedProducts), cart=get('cart',[]), orders=get('orders',[]), customers=get('customers',[]), messages=get('messages',[]), discounts=get('discounts',[]);
let currentUser=null, selectedSize='M', adminTab='overview', isAdmin=false;
const toast = msg => {const el=$('#toast');el.textContent=msg;el.classList.add('show');clearTimeout(toast.t);toast.t=setTimeout(()=>el.classList.remove('show'),2600)};
function categories(){return ['Todas',...new Set(products.map(p=>p.category))]}
function openModal(html){$('#modalContent').innerHTML=html;$('#modalBackdrop').classList.add('open');document.body.style.overflow='hidden'}
function closeModal(){$('#modalBackdrop').classList.remove('open');document.body.style.overflow=''}
function openProduct(id){
 const p=products.find(x=>x.id===id);if(!p)return;selectedSize=p.sizes[0]||'Único';
 openModal(`<div class="product-detail"><div class="detail-art ${p.color}">${p.mark}</div><div><div class="section-kicker">GRAÇA / PRODUCT FILE</div><h2 id="modalTitle">${p.name}</h2><strong>${money(p.price)}</strong><p>${p.description}</p><p class="fine-print">ESTOQUE: ${p.stock} UNIDADES</p><label class="fine-print">SELECIONE O TAMANHO</label><div class="size-options">${p.sizes.map(s=>`<button data-size="${s}" class="${s===selectedSize?'selected':''}">${s}</button>`).join('')}</div><button class="pill-button dark" id="detailAdd" ${p.stock<1?'disabled':''}>ADICIONAR AO CARRINHO ↗</button><p class="fine-print">Entrega grátis em Palmas · TO.</p></div></div>`);
 $$('[data-size]').forEach(b=>b.onclick=()=>{selectedSize=b.dataset.size;$$('[data-size]').forEach(x=>x.classList.toggle('selected',x===b))});
 $('#detailAdd').onclick=()=>{addToCart(p.id,selectedSize);closeModal();openCart()};
}
function addToCart(id,size){const p=products.find(x=>x.id===id);if(!p||p.stock<1)return toast('Produto indisponível.');const item=cart.find(x=>x.id===id&&x.size===size);if(item)item.qty=Math.min(item.qty+1,p.stock);else cart.push({id,size,qty:1});saveAll();renderCart();toast('Peça adicionada ao carrinho!')}
function openCart(){$('#cartDrawer').classList.add('open');$('#drawerScrim').classList.add('open');renderCart()}
function closeCart(){$('#cartDrawer').classList.remove('open');$('#drawerScrim').classList.remove('open')}
function trackOrder(id=''){openModal(`<div class="section-kicker">ORDER TRACKING</div><h2 id="modalTitle">ACOMPANHE SEU PEDIDO.</h2><form class="modal-form" id="trackForm"><label>CÓDIGO DO PEDIDO<input name="id" required value="${id}"></label><button class="pill-button dark">CONSULTAR ↗</button></form><div id="trackResult"></div>`);$('#trackForm').onsubmit=e=>{e.preventDefault();const code=new FormData(e.target).get('id').trim().toUpperCase(),o=orders.find(x=>x.id===code);$('#trackResult').innerHTML=o?`<div class="metric"><span>${o.id} · ${new Date(o.created).toLocaleString('pt-BR')}</span><strong>${o.status}</strong><p>${money(o.total)} · ${o.delivery}</p></div>`:'<div class="empty-state">NÃO ENCONTRAMOS ESSE PEDIDO.</div>'}}
function adminLogin(){openModal(`<div class="section-kicker">GRAÇA / BACK OFFICE</div><h2 id="modalTitle">ÁREA ADMINISTRATIVA.</h2><p>Entre com uma conta autorizada. A autorização vem da coleção admins do Firebase ou da função administrativa segura da conta.</p><form class="modal-form" id="adminLogin"><label>E-MAIL<input name="email" type="email" autocomplete="username" required></label><label>SENHA<input name="password" type="password" autocomplete="current-password" required></label><button class="pill-button dark">ENTRAR NO PAINEL ↗</button></form><p class="fine-print">A conta precisa estar confirmada e autorizada em admins/{UID}.</p>`);$('#adminLogin').onsubmit=async e=>{e.preventDefault();const f=new FormData(e.target);try{const credential=await signInWithEmailAndPassword(auth,String(f.get('email')).trim(),String(f.get('password')));if(!credential.user.emailVerified){isAdmin=false;toast('Confirme o e-mail desta conta antes de acessar o painel.');return}isAdmin=await hasAdminAccess(credential.user);if(!isAdmin){toast('Acesso negado. Confira se o UID desta conta existe em admins no Firestore.');return}currentUser=profileFor(credential.user);memberNav();closeModal();renderAdmin()}catch(error){toast(authError(error))}}}
async function hasAdminAccess(user){
 if(!user?.emailVerified)return false;
 try{
  const token=await getIdTokenResult(user,true);
  if(token.claims.admin===true)return true;
  const adminDoc=await getDoc(doc(db,'admins',user.uid));
  return adminDoc.exists();
 }catch(error){console.error('Não foi possível verificar a autorização administrativa:',error);return false}
}
async function openAdmin(){
 const user=auth.currentUser;
 if(user?.emailVerified&&await hasAdminAccess(user)){
  currentUser=profileFor(user);isAdmin=true;memberNav();renderAdmin();return;
 }
 isAdmin=false;adminLogin();
}
function renderAdmin(){if(!isAdmin){adminLogin();return}closeCart();$('#app').innerHTML=`<section class="admin-shell"><div class="admin-top"><b>GRAÇA® / ADMIN STUDIO</b><div><span class="fine-print">ACESSO AUTORIZADO</span> <button class="mini-button" id="adminExit">VOLTAR AO SITE</button></div></div><div class="admin-layout"><aside class="admin-side">${[['overview','VISÃO GERAL'],['products','PRODUTOS'],['orders','PEDIDOS'],['customers','CLIENTES / VIP'],['messages','MENSAGENS'],['discounts','CUPONS'],['analytics','ANÁLISES']].map(([k,v])=>`<button data-tab="${k}" class="${adminTab===k?'active':''}">${v}</button>`).join('')}</aside><div class="admin-content" id="adminContent"></div></div></section>`;
 $('#adminExit').onclick=()=>location.reload();$$('[data-tab]').forEach(b=>b.onclick=()=>{adminTab=b.dataset.tab;renderAdmin()});renderAdminContent()}
function renderAdminContentOriginal(){}
function table(headers,rows){return `<div style="overflow:auto"><table class="admin-table"><thead><tr>${headers.map(h=>`<th>${h}</th>`).join('')}</tr></thead><tbody>${rows.map(r=>`<tr>${r.map(c=>`<td>${c}</td>`).join('')}</tr>`).join('')}</tbody></table></div>`}
let searchLogTimer;$('#searchInput').addEventListener('input',()=>{renderProducts();clearTimeout(searchLogTimer);searchLogTimer=setTimeout(()=>{const term=$('#searchInput').value.trim().toLowerCase();if(term.length<2)return;searchEvents.push({term,at:new Date().toISOString()});searchEvents=searchEvents.slice(-1000);saveAll()},600)});$('#categoryFilter').addEventListener('change',renderProducts);$('#sortFilter').addEventListener('change',renderProducts);
$('#cartBtn').onclick=openCart;$('#cartClose').onclick=closeCart;$('#drawerScrim').onclick=closeCart;$('#modalClose').onclick=closeModal;$('#modalBackdrop').addEventListener('click',e=>{if(e.target.id==='modalBackdrop')closeModal()});
$('#adminLink').onclick=openAdmin;$('#menuToggle').onclick=()=>$('#mainNav').classList.toggle('open');$$('#mainNav a').forEach(a=>a.onclick=()=>$('#mainNav').classList.remove('open'));
$('#contactForm').onsubmit=e=>{e.preventDefault();const f=new FormData(e.target);messages.unshift({name:f.get('name'),email:f.get('email'),subject:f.get('subject'),message:f.get('message'),created:new Date().toISOString()});saveAll();e.target.reset();toast('Mensagem registrada nesta demonstração!')};
// Initial rendering runs after the local feature layer below is initialized.
// Subtle pointer-based 3D depth, disabled for touch and reduced-motion users.
const reduce=matchMedia('(prefers-reduced-motion: reduce)').matches, fine=matchMedia('(pointer:fine)').matches;
if(!reduce&&fine){document.addEventListener('pointermove',e=>{const art=$('#heroArt .art-frame');if(art){const r=art.getBoundingClientRect(),x=(e.clientX-r.left)/r.width-.5,y=(e.clientY-r.top)/r.height-.5;art.style.transform=`rotateY(${x*10+4}deg) rotateX(${-y*8}deg) rotateZ(4deg)`}});document.addEventListener('pointerover',e=>{const card=e.target.closest('.product-visual');if(card)card.dataset.hover='1'});document.addEventListener('pointermove',e=>{const card=e.target.closest('.product-visual');if(!card)return;const r=card.getBoundingClientRect(),x=(e.clientX-r.left)/r.width-.5,y=(e.clientY-r.top)/r.height-.5;card.style.transform=`perspective(700px) rotateY(${x*9}deg) rotateX(${-y*7}deg) translateY(-3px)`});document.addEventListener('pointerout',e=>{const card=e.target.closest('.product-visual');if(card)card.style.transform=''})}
window.addEventListener('hashchange',()=>{if(location.hash==='#admin')openAdmin()});

// Prévia local das funcionalidades GRAÇA. Não usar para dados pessoais ou cobrança real.
let comments=get('comments',[]), cartCoupon=get('cartCoupon',''), pendingMemberAction='', orderStatusTab='Todos', searchEvents=get('searchEvents',[]);
const VIP_LINK='https://chat.whatsapp.com/E32OubB01g9Kqlll1paQvn';
const htm=v=>String(v==null?'':v).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const unitPrice=p=>Math.round(Number(p.price||0)*(100-Math.max(0,Math.min(100,Number(p.discount||0)))))/100;
const couponOk=code=>discounts.find(d=>d.code===String(code||'').trim().toUpperCase()&&d.active&&(d.maxUses==null||Number(d.uses||0)<Number(d.maxUses)));
function saveAll(){set('products',products);set('cart',cart);set('orders',orders);set('customers',customers);set('messages',messages);set('discounts',discounts);set('comments',comments);set('cartCoupon',cartCoupon);set('searchEvents',searchEvents)}
function renderProducts(){
 const term=$('#searchInput').value.toLowerCase(),cat=$('#categoryFilter').value||'Todas',sort=$('#sortFilter').value;
 let list=products.filter(p=>(cat==='Todas'||p.category===cat)&&(p.name+' '+p.description+' '+p.category).toLowerCase().includes(term));
 if(sort==='price-asc')list.sort((a,b)=>unitPrice(a)-unitPrice(b));if(sort==='price-desc')list.sort((a,b)=>unitPrice(b)-unitPrice(a));if(sort==='name')list.sort((a,b)=>a.name.localeCompare(b.name));if(sort==='featured')list.sort((a,b)=>Number(b.featured)-Number(a.featured));
 const card=(p,i)=>'<article class="product-card" data-product="'+htm(p.id)+'"><div class="product-visual '+htm(p.color)+(p.imageUrl?' has-photo':'')+'" data-mark="'+htm(p.mark)+'">'+(p.imageUrl?'<img class="product-photo" src="'+htm(p.imageUrl)+'" alt="'+htm(p.name)+'">':'')+'<span class="product-index">GMC / '+String(i+1).padStart(2,'0')+'</span><button class="quick-add" data-add="'+htm(p.id)+'">+</button></div><div class="product-info"><div><h4>'+htm(p.name)+'</h4><p>'+htm(p.category.toUpperCase())+'</p></div><span class="product-price">'+(p.discount?'<del>'+money(p.price)+'</del> <b>'+money(unitPrice(p))+'</b>':'<b>'+money(p.price)+'</b>')+'</span></div></article>';
 $('#productGrid').innerHTML=list.length?list.map(card).join(''):'<div class="empty-state">NENHUMA PEÇA ENCONTRADA.</div>';
 $('#categoryFilter').innerHTML=categories().map(c=>'<option value="'+htm(c)+'" '+(c===cat?'selected':'')+'>'+htm(c==='Todas'?'Todas as categorias':c)+'</option>').join('');
 const picks=products.filter(p=>p.featured),box=$('#featuredProducts');box.innerHTML=picks.length?picks.map(card).join(''):'<div class="empty-state">A curadoria será exibida aqui.</div>';
 $$('[data-product]').forEach(el=>el.onclick=e=>{if(!e.target.closest('[data-add]'))openProduct(el.dataset.product)});$$('[data-add]').forEach(b=>b.onclick=e=>{e.stopPropagation();openProduct(b.dataset.add)});
}
function cartTotals(){const sub=cart.reduce((s,i)=>s+unitPrice(products.find(p=>String(p.id)===String(i.id))||{price:0})*i.qty,0),coupon=couponOk(cartCoupon),off=coupon?sub*coupon.value/100:0;return{sub,coupon,off,total:Math.max(0,sub-off)}}
function renderCart(){
 $('#cartCount').textContent=cart.reduce((s,i)=>s+i.qty,0);
 $('#cartItems').innerHTML=cart.length?cart.map((i,n)=>{const p=products.find(x=>String(x.id)===String(i.id));return p?'<div class="cart-line"><div class="cart-thumb">'+htm(p.mark)+'</div><div><h4>'+htm(p.name)+'</h4><small>'+htm(i.size)+' · '+money(unitPrice(p))+'</small><div class="qty-controls"><button data-q="'+n+'" data-delta="-1">−</button>'+i.qty+'<button data-q="'+n+'" data-delta="1">+</button></div></div><button data-rm="'+n+'">×</button></div>':''}).join(''):'<div class="empty-state">SEU CARRINHO ESTÁ VAZIO.</div>';
 const t=cartTotals();$('#cartSummary').innerHTML=cart.length?'<form id="couponForm" class="coupon-form"><label>CUPOM DE DESCONTO</label><div><input name="coupon" value="'+htm(cartCoupon)+'" placeholder="Ex.: GRACA10"><button class="mini-button">APLICAR</button></div>'+(cartCoupon?'<small>'+(t.coupon?'Cupom aplicado.':'Cupom inválido ou esgotado.')+'</small>':'')+'</form><div class="total"><span>SUBTOTAL</span><strong>'+money(t.sub)+'</strong></div>'+(t.coupon?'<div class="total"><span>DESCONTO</span><strong>−'+money(t.off)+'</strong></div>':'')+'<div class="total"><span>TOTAL</span><strong>'+money(t.total)+'</strong></div><button id="checkoutBtn" class="pill-button dark">IR PARA FINALIZAÇÃO ↗</button>':'';
 $$('[data-q]').forEach(b=>b.onclick=()=>{const n=+b.dataset.q;cart[n].qty+=+b.dataset.delta;if(cart[n].qty<1)cart.splice(n,1);saveAll();renderCart()});$$('[data-rm]').forEach(b=>b.onclick=()=>{cart.splice(+b.dataset.rm,1);saveAll();renderCart()});
 $('#couponForm')?.addEventListener('submit',e=>{e.preventDefault();cartCoupon=new FormData(e.target).get('coupon').trim().toUpperCase();saveAll();renderCart();toast(couponOk(cartCoupon)?'Cupom aplicado.':'Cupom não disponível.')});$('#checkoutBtn')?.addEventListener('click',checkout);
}
function authError(error){const messages={
 'auth/invalid-credential':'E-mail ou senha incorretos.',
 'auth/invalid-email':'Confira o formato do e-mail.',
 'auth/email-already-in-use':'Não foi possível criar a conta. Confira os dados, tente entrar ou recupere a senha.',
 'auth/weak-password':'A senha precisa ter pelo menos 8 caracteres.',
 'auth/user-not-found':'E-mail ou senha incorretos. Confira os dados ou crie uma conta.',
 'auth/too-many-requests':'Muitas tentativas. Aguarde um pouco e tente novamente.',
 'auth/operation-not-allowed':'O login por e-mail e senha ainda precisa ser ativado no Firebase Authentication.',
 'auth/unauthorized-domain':'Este endereço do site precisa ser autorizado no Firebase Authentication.'
};return messages[error?.code]||'Não foi possível concluir. Confira a conexão e tente novamente.'}
function profileFor(user){
 if(!user)return null;
 const saved=customers.find(c=>c.uid===user.uid)||customers.find(c=>c.email===user.email)||{};
 return {...saved,id:user.uid,uid:user.uid,name:user.displayName||saved.name||user.email.split('@')[0],email:user.email,phone:saved.phone||'',vip:Boolean(user.emailVerified&&saved.vip),emailVerified:user.emailVerified,address:saved.address||{},created:saved.created||new Date().toISOString()};
}
function saveCustomerProfile(profile){
 const index=customers.findIndex(c=>c.uid===profile.uid||c.email===profile.email);
 if(index<0)customers.push(profile);else customers[index]={...customers[index],...profile};
 saveAll();
}
function accountModal(mode='login',notice=''){
 const signup=mode==='signup';
 openModal('<div class="section-kicker">MY GRAÇA</div><h2 id="modalTitle">'+(signup?'CADASTRO OPCIONAL':'ENTRE NA SUA CONTA')+'</h2>'+(signup?'<p>Você pode reservar sem criar conta. A Comunidade VIP oferece acesso a cupons, descontos, campanhas e novidades quando a GRAÇA os publicar.</p><p>Use uma senha com pelo menos 12 caracteres. Vamos enviar um link para confirmar seu e-mail.</p><form class="modal-form" id="signupForm"><label>NOME<input name="name" autocomplete="name" required></label><label>E-MAIL<input name="email" type="email" autocomplete="email" required></label><label>WHATSAPP<input name="phone" autocomplete="tel" required></label><label>SENHA<input name="password" type="password" autocomplete="new-password" minlength="12" required></label><label class="consent-row"><input name="marketingConsent" type="checkbox"> Aceito receber novidades e ofertas por e-mail ou WhatsApp. Opcional; posso mudar de ideia depois.</label><button class="pill-button dark">CRIAR CONTA VIP ↗</button></form><button id="toLogin" class="text-button">JÁ TENHO UMA CONTA</button>':'<p>'+htm(notice||'Informe seu e-mail e sua senha cadastrados.')+'</p><form class="modal-form" id="loginForm"><label>E-MAIL<input name="email" type="email" autocomplete="username" required></label><label>SENHA<input name="password" type="password" autocomplete="current-password" required></label><button class="pill-button dark">ENTRAR ↗</button></form><button id="resetPassword" class="text-button">ESQUECI MINHA SENHA</button><p class="fine-print">A senha é validada pelo Firebase Authentication.</p><button id="toSignup" class="text-button">CRIAR CONTA VIP — OPCIONAL</button>'));
 if(signup){
  $('#signupForm').onsubmit=async e=>{e.preventDefault();const f=new FormData(e.target),email=String(f.get('email')).trim().toLowerCase(),name=String(f.get('name')).trim();try{const credential=await createUserWithEmailAndPassword(auth,email,String(f.get('password')));await updateProfile(credential.user,{displayName:name});await sendEmailVerification(credential.user);const profile={id:credential.user.uid,uid:credential.user.uid,name,email,phone:String(f.get('phone')).trim(),marketingConsent:f.get('marketingConsent')==='on',vip:false,emailVerified:false,created:new Date().toISOString(),address:{}};await saveCustomerProfile(profile);currentUser=null;memberNav();registrationWelcome()}catch(error){toast(authError(error))}};
  $('#toLogin').onclick=()=>accountModal('login');
 }else{
  $('#loginForm').onsubmit=async e=>{e.preventDefault();const f=new FormData(e.target),email=String(f.get('email')).trim().toLowerCase();try{const credential=await signInWithEmailAndPassword(auth,email,String(f.get('password')));if(!credential.user.emailVerified){await sendEmailVerification(credential.user);await signOut(auth);currentUser=null;memberNav();return registrationWelcome(true)}currentUser=profileFor(credential.user);saveCustomerProfile(currentUser);memberNav();const action=pendingMemberAction;pendingMemberAction='';closeModal();if(action==='checkout'){openCart();checkout()}else if(action==='comment')toast('Agora você pode comentar em GRAÇA É ENCONTRO.');else clientMenu()}catch(error){toast(authError(error))}};
  $('#resetPassword').onclick=async()=>{const email=$('#loginForm [name="email"]').value.trim();if(!email)return toast('Informe seu e-mail para receber o link de recuperação.');try{await sendPasswordResetEmail(auth,email);toast('Enviamos um link seguro para redefinir sua senha.')}catch(error){toast(authError(error))}};
  $('#toSignup').onclick=()=>accountModal('signup');
 }
}
function registrationWelcome(resent=false){openModal('<div class="section-kicker">CONFIRME SEU E-MAIL</div><h2 id="modalTitle">QUASE LÁ.</h2><p>'+(resent?'Sua conta ainda não foi confirmada. Reenviamos o link de verificação.':'Enviamos um link de verificação para seu e-mail. Confirme o endereço e entre novamente para acessar sua conta e a área VIP.')+'</p><p class="fine-print">A conta só libera recursos de cliente depois da confirmação.</p><button class="pill-button dark" id="backToLogin">VOLTAR AO LOGIN</button>');$('#backToLogin').onclick=()=>accountModal('login')}
function memberNav(){const b=$('#accountBtn'),menu=$('#clientMenuBtn');if(!b||!menu)return;b.textContent=currentUser&&currentUser.emailVerified?'OI, '+currentUser.name.split(' ')[0].toUpperCase():'ENTRAR';menu.hidden=!(currentUser&&currentUser.emailVerified)}
function clientMenu(){
 if(!currentUser)return accountModal('login');
 openModal('<div class="section-kicker">MY GRAÇA</div><h2 id="modalTitle">MINHA CONTA</h2><div class="client-menu-list"><button data-member="vip">COMUNIDADE VIP</button><button data-member="orders">STATUS DO PEDIDO</button><button data-member="profile">PERFIL</button><button data-member="support">MENSAGENS DE SUPORTE</button><button data-member="logout">SAIR</button></div>');
 $$('[data-member]').forEach(b=>b.onclick=async()=>{const k=b.dataset.member;if(k==='vip')vipPage();if(k==='orders')orderHistory();if(k==='profile')profileEditor();if(k==='support')supportPanel();if(k==='logout'){await signOut(auth);currentUser=null;isAdmin=false;memberNav();closeModal()}});
}
function customerArea(){clientMenu()}
function vipForm(){currentUser?vipPage():accountModal('signup')}
function vipPage(){if(!currentUser)return accountModal('login');openModal('<div class="section-kicker">COMUNIDADE VIP</div><h2 id="modalTitle">VOCÊ FAZ PARTE.</h2><p>Descontos VIP e prévias dos próximos drops.</p><a class="pill-button dark" href="'+VIP_LINK+'" target="_blank" rel="noopener">ENTRAR NO GRUPO DO WHATSAPP ↗</a>')}
function orderHistory(){const mine=orders.filter(o=>currentUser&&o.email===currentUser.email);openModal('<div class="section-kicker">PEDIDOS</div><h2 id="modalTitle">STATUS DO PEDIDO</h2>'+(mine.length?mine.map(o=>'<article class="order-card"><strong>'+htm(o.id)+' · '+htm(o.status)+'</strong><span>'+money(o.total)+'</span></article>').join(''):'<div class="empty-state">SEUS PEDIDOS APARECERÃO AQUI.</div>'))}
function profileEditor(){if(!currentUser)return accountModal('login');const a=currentUser.address||{};openModal('<h2 id="modalTitle">PERFIL</h2><form id="profileForm" class="modal-form"><label>NOME<input name="name" value="'+htm(currentUser.name)+'" required></label><label>WHATSAPP<input name="phone" value="'+htm(currentUser.phone)+'"></label><label>CEP<input name="zip" value="'+htm(a.zip)+'"></label><label>RUA / NÚMERO<input name="street" value="'+htm(a.street)+'"></label><label>COMPLEMENTO<input name="complement" value="'+htm(a.complement)+'"></label><label>BAIRRO<input name="district" value="'+htm(a.district)+'"></label><label>CIDADE<input name="city" value="'+htm(a.city)+'"></label><label>ESTADO<input name="state" value="'+htm(a.state)+'"></label><button class="pill-button dark">SALVAR PERFIL</button></form>');$('#profileForm').onsubmit=async e=>{e.preventDefault();const f=new FormData(e.target);currentUser.name=f.get('name');currentUser.phone=f.get('phone');currentUser.address={zip:f.get('zip'),street:f.get('street'),complement:f.get('complement'),district:f.get('district'),city:f.get('city'),state:f.get('state')};try{await updateProfile(auth.currentUser,{displayName:currentUser.name});saveCustomerProfile(currentUser);memberNav();clientMenu()}catch(error){toast(authError(error))}}}
function supportPanel(){if(!currentUser)return accountModal('login');const mine=messages.filter(m=>m.email===currentUser.email);openModal('<h2 id="modalTitle">MENSAGENS DE SUPORTE</h2>'+(mine.length?mine.map(m=>'<article class="support-message"><b>'+htm(m.subject)+'</b><p>'+htm(m.message)+'</p><p><strong>RESPOSTA:</strong> '+htm(m.reply||'Aguardando resposta')+'</p></article>').join(''):'<p>Ainda não há mensagens.</p>')+'<form id="supportForm" class="modal-form"><label>ASSUNTO<input name="subject" required></label><label>MENSAGEM<textarea name="message" required></textarea></label><button class="pill-button dark">ENVIAR</button></form>');$('#supportForm').onsubmit=e=>{e.preventDefault();const f=new FormData(e.target);messages.unshift({id:uid(),name:currentUser.name,email:currentUser.email,subject:f.get('subject'),message:f.get('message'),created:new Date().toISOString(),reply:''});saveAll();supportPanel()}}
function renderComments(){const box=$('#customerComments');if(box)box.innerHTML=comments.length?comments.map(c=>'<blockquote>'+htm(c.text)+'<cite>'+htm(c.name)+' · '+new Date(c.created).toLocaleDateString('pt-BR')+'</cite></blockquote>').join(''):'<p class="empty-state">SEJA A PRIMEIRA PESSOA A COMENTAR.</p>'}
$('#commentForm').onsubmit=e=>{e.preventDefault();if(!currentUser){pendingMemberAction='comment';return accountModal('login','Entre para publicar.')}const text=new FormData(e.target).get('comment').trim();if(text.length<8||text.length>500)return toast('Comentário deve ter entre 8 e 500 caracteres.');if(comments.some(c=>c.uid===currentUser.id&&c.text===text))return toast('Comentário repetido.');comments.unshift({uid:currentUser.id,name:currentUser.name,text,created:new Date().toISOString()});saveAll();renderComments();e.target.reset();toast('Comentário publicado.')}
$('#contactForm').onsubmit=e=>{e.preventDefault();const f=new FormData(e.target);messages.unshift({id:uid(),name:f.get('name'),email:f.get('email'),subject:f.get('subject'),message:f.get('message'),created:new Date().toISOString(),reply:''});saveAll();e.target.reset();toast('Mensagem registrada nesta prévia.')}
function renderAdminContent(){}
function productEditor(id=''){
 throw new Error('O editor seguro de produtos ainda está sendo inicializado.');
 const p=products.find(x=>String(x.id)===String(id))||{name:'',category:'Blusas',price:'',cost:'',discount:0,stock:0,sizes:['P','M','G'],color:'pink',mark:'GRAÇA',description:'',featured:false,imageUrl:''};let image=p.imageUrl||'';
 const gallery=[...new Set(['assets/graca-editorial-background.jfif',...products.map(x=>x.imageUrl).filter(Boolean)])];
 openModal('<h2 id="modalTitle">'+(id?'EDITAR PEÇA':'NOVA PEÇA')+'</h2><form id="productForm" class="modal-form"><label>NOME<input name="name" required value="'+htm(p.name)+'"></label><label>CATEGORIA<input name="category" required value="'+htm(p.category)+'"></label><label>PREÇO DE VENDA<input name="price" type="number" min="0" step=".01" required value="'+htm(p.price)+'"></label><label>CUSTO DE AQUISIÇÃO (PARA MARGEM)<input name="cost" type="number" min="0" step=".01" value="'+htm(p.cost??'')+'"></label><label>DESCONTO INDIVIDUAL (%)<input name="discount" type="number" min="0" max="100" value="'+htm(p.discount||0)+'"></label><label>ESTOQUE<input name="stock" type="number" min="0" value="'+htm(p.stock)+'"></label><label>TAMANHOS<input name="sizes" value="'+htm((p.sizes||[]).join(','))+'"></label><label>GALERIA DE MÍDIA<select id="productGallery"><option value="">Sem foto</option>'+gallery.map((x,i)=>'<option value="'+i+'">Mídia '+(i+1)+'</option>').join('')+'</select></label><label>OU ENVIAR FOTO DO COMPUTADOR<input id="photoFile" type="file" accept="image/*"></label><label>DESCRIÇÃO<textarea name="description">'+htm(p.description)+'</textarea></label><label><input type="checkbox" name="featured" '+(p.featured?'checked':'')+'> Vincular a “O seu próximo look favorito”</label><button class="pill-button dark">SALVAR</button></form>');
 $('#productGallery').onchange=e=>image=e.target.value===''?'':gallery[+e.target.value];
 $('#photoFile').onchange=e=>{const f=e.target.files[0];if(!f)return;if(f.size>600000)return toast('Imagem limitada a 600 KB na prévia.');const reader=new FileReader();reader.onload=()=>image=reader.result;reader.readAsDataURL(f)};
 $('#productForm').onsubmit=e=>{e.preventDefault();const f=new FormData(e.target),item={...p,id:id||uid(),name:f.get('name'),category:f.get('category'),price:+f.get('price'),cost:f.get('cost')===''?null:+f.get('cost'),discount:+f.get('discount'),stock:+f.get('stock'),sizes:f.get('sizes').split(',').map(x=>x.trim()),description:f.get('description'),featured:f.get('featured')==='on',imageUrl:image};if(id)products=products.map(x=>String(x.id)===String(id)?item:x);else products.push(item);saveAll();closeModal();renderAdminContent();renderProducts()};
}
$('#accountBtn').onclick=()=>currentUser?clientMenu():accountModal('login');$('#clientMenuBtn').onclick=clientMenu;$('#vipJoinBtn').onclick=vipForm;
renderComments();
// Fluxo de reserva e painel compartilhado no Firestore. O checkout antigo de
// pagamento é deliberadamente substituído nesta fase.
const migrationCandidates = get('products', []);
const reservationStatuses = ['Aguardando confirmação','Reserva confirmada','Em preparação','Disponível para retirada','Em rota de entrega','Entregue','Cancelado'];
const salesChannels = ['Loja física','Instagram','WhatsApp','Site','Outro'];
const paymentMethods = ['Pix','Cartão de crédito à vista','Cartão de crédito parcelado','Cartão de débito','Dinheiro','Transferência'];
const currentDay = new Date();
const firstDayOfMonth = new Date(currentDay.getFullYear(), currentDay.getMonth(), 1);
let analyticsFrom = firstDayOfMonth.toLocaleDateString('sv-SE');
let analyticsTo = currentDay.toLocaleDateString('sv-SE');
let categoriesFromFirestore = [];
let catalogLoaded = false;
let productUnsubscribe = null, categoryUnsubscribe = null, orderUnsubscribe = null, customerUnsubscribe = null, messageUnsubscribe = null;
let cloudinaryWorkerUrl = '';
let savingReservation = false;
let importingExamples = false;
products = [];
orders = [];
customers = [];
discounts = [];

const safeDate = value => value?.toDate ? value.toDate() : new Date(value || Date.now());
const productCents = p => Math.round(Number(p.price || 0) * (100 - Math.max(0, Math.min(100, Number(p.discount || 0)))));
const displayTotal = order => order?.status==='Concluído'&&Number.isFinite(Number(order.saleTotalCents))?Number(order.saleTotalCents)/100:Number.isFinite(Number(order.totalCents))?Number(order.totalCents)/100:Number(order.total||0);
const isCloudinaryUrl = value => typeof value === 'string' && /^https:\/\/res\.cloudinary\.com\/[a-z0-9_-]+\/image\/upload\//i.test(value);
const isCloudinaryPublicId = value => typeof value === 'string' && /^graca\/products\/[a-z0-9_-]{20,60}$/i.test(value);
const normalizeOrder = (id,data) => ({
  ...data, id, customerName:data.customerName||data.name||'—', phone:data.phone||'',
  totalCents:Number.isFinite(Number(data.totalCents))?Number(data.totalCents):Math.round(Number(data.total||0)*100),
  createdAt:data.createdAt||data.created||new Date()
});
const activeProducts = () => products.filter(p => p.active !== false);
const friendlyFirestoreError = error => {
  if (error?.code === 'permission-denied') return 'O Firebase bloqueou a operação. Confira as regras publicadas e a autorização da conta.';
  if (error?.code === 'unavailable' || !navigator.onLine) return 'Sem conexão com o Firebase. Tente novamente quando a internet voltar.';
  if (error?.code === 'auth/operation-not-allowed') return 'Ative o provedor Anônimo em Firebase Authentication → Sign-in method.';
  return error?.message || 'Não foi possível salvar. Tente novamente.';
};

function updateCatalogSubscriptions() {
  productUnsubscribe?.();
  categoryUnsubscribe?.();
  const productQuery = isAdmin
    ? collection(db, 'products')
    : query(collection(db, 'products'), where('active', '==', true));
  productUnsubscribe = onSnapshot(productQuery, snapshot => {
    products = snapshot.docs.map(item => ({ ...item.data(), id: item.id }));
    catalogLoaded = true;
    renderProducts();
    renderCart();
    if (isAdmin && adminTab === 'products') renderAdminContent();
  }, error => {
    console.error('Falha ao carregar o catálogo do Firestore:', error);
    catalogLoaded = true;
    renderProducts();
    toast(friendlyFirestoreError(error));
  });
  const categoryQuery = isAdmin
    ? collection(db, 'categories')
    : query(collection(db, 'categories'), where('active', '==', true));
  categoryUnsubscribe = onSnapshot(categoryQuery, snapshot => {
    categoriesFromFirestore = snapshot.docs.map(item => item.data()).filter(item => item.active !== false).map(item => item.name).filter(Boolean);
    renderProducts();
  }, error => console.warn('Categorias não foram carregadas:', error));
}

function subscribeUserData(user) {
  orderUnsubscribe?.();
  customerUnsubscribe?.();
  messageUnsubscribe?.();
  orders = [];
  customers = [];
  messages = [];
  if (!user) return;
  const orderQuery = isAdmin
    ? query(collection(db, 'orders'), orderBy('createdAt','desc'), limit(250))
    : query(collection(db, 'orders'), where('uid', '==', user.uid), limit(100));
  orderUnsubscribe = onSnapshot(orderQuery, snapshot => {
    orders = snapshot.docs.map(item => normalizeOrder(item.id,item.data())).sort((a,b) => safeDate(b.createdAt) - safeDate(a.createdAt));
    if (isAdmin && $('#adminContent')) renderAdminContent();
  }, error => console.error('Falha ao sincronizar reservas:', error));
  if (isAdmin) {
    customerUnsubscribe = onSnapshot(query(collection(db, 'customers'), limit(500)), snapshot => {
      customers = snapshot.docs.map(item => ({ ...item.data(), id: item.id }));
      if ($('#adminContent') && adminTab === 'customers') renderAdminContent();
    }, error => console.error('Falha ao sincronizar clientes:', error));
    messageUnsubscribe = onSnapshot(query(collection(db, 'messages'), limit(500)), snapshot => {
      messages = snapshot.docs.map(item => ({ ...item.data(), id: item.id })).sort((a,b) => safeDate(b.createdAt)-safeDate(a.createdAt));
      if ($('#adminContent') && adminTab === 'messages') renderAdminContent();
    }, error => console.error('Falha ao sincronizar mensagens de contato:', error));
  }
}

profileFor = function(user) {
  if (!user) return null;
  const saved = customers.find(c => c.uid === user.uid) || {};
  const label = user.displayName || saved.name || (user.email ? user.email.split('@')[0] : 'Visitante');
  return { ...saved, id:user.uid, uid:user.uid, name:label, email:user.email || '', phone:saved.phone || '',
    vip:Boolean(!user.isAnonymous && user.emailVerified), emailVerified:Boolean(user.emailVerified), isAnonymous:Boolean(user.isAnonymous),
    marketingConsent:Boolean(saved.marketingConsent), address:saved.address || {}, created:saved.createdAt || new Date() };
};

saveCustomerProfile = async function(profile) {
  if (!profile?.uid || profile.isAnonymous || !profile.email) return;
  const data = {
    uid: profile.uid, name: String(profile.name || '').slice(0,120), email: profile.email,
    phone: String(profile.phone || '').slice(0,40), address: profile.address || {},
    marketingConsent: Boolean(profile.marketingConsent), updatedAt: serverTimestamp()
  };
  const ref = doc(db, 'customers', profile.uid);
  const existing = await getDoc(ref);
  if (!existing.exists()) data.createdAt = serverTimestamp();
  await setDoc(ref, data, { merge:true });
};

renderProducts = function() {
  const term = ($('#searchInput')?.value || '').trim().toLowerCase();
  const cat = $('#categoryFilter')?.value || 'Todas';
  const sort = $('#sortFilter')?.value || 'featured';
  let list = activeProducts().filter(p => (cat === 'Todas' || p.category === cat) && (`${p.name||''} ${p.description||''} ${p.category||''}`).toLowerCase().includes(term));
  if (sort === 'price-asc') list.sort((a,b) => productCents(a)-productCents(b));
  if (sort === 'price-desc') list.sort((a,b) => productCents(b)-productCents(a));
  if (sort === 'name') list.sort((a,b) => String(a.name).localeCompare(String(b.name),'pt-BR'));
  if (sort === 'featured') list.sort((a,b) => Number(b.featured)-Number(a.featured));
  const card = (p,i) => {const photo=isCloudinaryUrl(p.imageUrl)?p.imageUrl:'';return `<article class="product-card" data-product="${htm(p.id)}"><div class="product-visual ${htm(p.color||'pink')}${photo?' has-photo':''}" data-mark="${htm(p.mark||'GRAÇA')}">${photo?`<img class="product-photo" src="${htm(photo)}" alt="${htm(p.name)}" loading="lazy">`:''}<span class="product-index">GMC / ${String(i+1).padStart(2,'0')}</span><button class="quick-add" data-add="${htm(p.id)}" aria-label="Escolher ${htm(p.name)}">+</button></div><div class="product-info"><div><h4>${htm(p.name)}</h4><p>${htm(String(p.category||'').toUpperCase())}</p></div><span class="product-price">${Number(p.discount||0)?`<del>${money(Number(p.price))}</del> `:''}<b>${money(productCents(p)/100)}</b></span></div></article>`;};
  const empty = catalogLoaded ? '<div class="empty-state">O CATÁLOGO ESTÁ SENDO PREPARADO PELA GRAÇA.</div>' : '<div class="empty-state">CARREGANDO A COLEÇÃO…</div>';
  $('#productGrid').innerHTML = list.length ? list.map(card).join('') : empty;
  const categoriesList = ['Todas', ...new Set([...categoriesFromFirestore, ...activeProducts().map(p => p.category).filter(Boolean)])];
  $('#categoryFilter').innerHTML = categoriesList.map(c => `<option value="${htm(c)}" ${c===cat?'selected':''}>${htm(c==='Todas'?'Todas as categorias':c)}</option>`).join('');
  const picks = activeProducts().filter(p => p.featured);
  $('#featuredProducts').innerHTML = picks.length ? picks.map(card).join('') : '<div class="empty-state">A curadoria será exibida aqui.</div>';
  $$('[data-product]').forEach(el => el.onclick = event => { if (!event.target.closest('[data-add]')) openProduct(el.dataset.product); });
  $$('[data-add]').forEach(button => button.onclick = event => { event.stopPropagation(); openProduct(button.dataset.add); });
};

openProduct = function(id) {
  const p = products.find(item => String(item.id) === String(id) && item.active !== false);
  if (!p) return toast('Este produto não está disponível.');
  selectedSize = p.sizes?.[0] || 'Único';
  const photo=isCloudinaryUrl(p.imageUrl)?p.imageUrl:'';
  openModal(`<div class="product-detail"><div class="detail-art ${htm(p.color||'pink')}">${photo?`<img class="detail-photo" src="${htm(photo)}" alt="${htm(p.name)}">`:htm(p.mark||'GRAÇA')}</div><div><div class="section-kicker">GRAÇA / PEÇA</div><h2 id="modalTitle">${htm(p.name)}</h2><strong>${money(productCents(p)/100)}</strong><p>${htm(p.description||'')}</p><p class="fine-print">ESTOQUE INFORMADO: ${Number(p.stock||0)} UNIDADES · DISPONIBILIDADE SERÁ CONFIRMADA PELA LOJA</p><label class="fine-print" for="sizeChoice">ESCOLHA UMA VARIAÇÃO</label><div class="size-options" id="sizeChoice">${(p.sizes?.length?p.sizes:['Único']).map(size=>`<button type="button" data-size="${htm(size)}" class="${size===selectedSize?'selected':''}">${htm(size)}</button>`).join('')}</div><button class="pill-button dark" id="detailAdd" ${Number(p.stock||0)<1?'disabled':''}>ADICIONAR AO CARRINHO ↗</button></div></div>`);
  $$('[data-size]').forEach(button => button.onclick = () => { selectedSize=button.dataset.size; $$('[data-size]').forEach(item=>item.classList.toggle('selected',item===button)); });
  $('#detailAdd').onclick = () => { addToCart(p.id,selectedSize); closeModal(); openCart(); };
};

addToCart = function(id,size) {
  const p = products.find(item => String(item.id) === String(id) && item.active !== false);
  if (!p || Number(p.stock||0) < 1) return toast('Produto indisponível.');
  const item = cart.find(entry => String(entry.id)===String(id) && entry.size===size);
  if (item) item.qty = Math.min(item.qty+1, Number(p.stock)); else cart.push({id,size,qty:1});
  set('cart',cart); renderCart(); toast('Peça adicionada ao carrinho.');
};

renderCart = function() {
  $('#cartCount').textContent = cart.reduce((sum,item)=>sum+Number(item.qty||0),0);
  $('#cartItems').innerHTML = cart.length ? cart.map((item,index) => {
    const p=products.find(product=>String(product.id)===String(item.id));
    return `<div class="cart-line"><div class="cart-thumb">${isCloudinaryUrl(p?.imageUrl)?`<img src="${htm(p.imageUrl)}" alt="">`:htm(p?.mark||'✳')}</div><div><h4>${htm(p?.name||'Produto indisponível')}</h4><small>${htm(item.size)} · ${p?money(productCents(p)/100):'Atualize a coleção'}</small><div class="qty-controls"><button data-q="${index}" data-delta="-1" aria-label="Diminuir quantidade">−</button>${Number(item.qty)}<button data-q="${index}" data-delta="1" aria-label="Aumentar quantidade">+</button></div></div><button data-rm="${index}" aria-label="Remover item">×</button></div>`;
  }).join('') : '<div class="empty-state">SEU CARRINHO ESTÁ VAZIO.</div>';
  const validCart = cart.every(item=>products.some(p=>String(p.id)===String(item.id)&&p.active!==false));
  const total = cart.reduce((sum,item)=>{const p=products.find(product=>String(product.id)===String(item.id));return sum+(p?productCents(p)*Number(item.qty||0):0);},0);
  $('#cartSummary').innerHTML = cart.length ? `<div class="total"><span>VALOR ESTIMADO</span><strong>${money(total/100)}</strong></div><p class="fine-print">A solicitação não é uma venda nem confirma a reserva. A disponibilidade será verificada pela equipe.</p><button id="checkoutBtn" class="pill-button dark" ${validCart?'':'disabled'}>SOLICITAR RESERVA ↗</button>` : '';
  $$('[data-q]').forEach(button=>button.onclick=()=>{const index=Number(button.dataset.q);const qty=Number(cart[index].qty)+Number(button.dataset.delta);if(qty<1)cart.splice(index,1);else cart[index].qty=qty;set('cart',cart);renderCart();});
  $$('[data-rm]').forEach(button=>button.onclick=()=>{cart.splice(Number(button.dataset.rm),1);set('cart',cart);renderCart();});
  $('#checkoutBtn')?.addEventListener('click',checkout);
};

function checkout() {}
checkout = function() {
  if (!cart.length || savingReservation) return;
  const basket = cart.map(item=>({ ...item }));
  const preview = basket.map(item=>{const p=products.find(product=>String(product.id)===String(item.id));return `<li>${htm(p?.name||'Produto')} · ${htm(item.size)} · ${Number(item.qty)} un. · ${p?money(productCents(p)*Number(item.qty)/100):'indisponível'}</li>`;}).join('');
  const total = basket.reduce((sum,item)=>{const p=products.find(product=>String(product.id)===String(item.id));return sum+(p?productCents(p)*Number(item.qty):0);},0);
  closeCart();
  openModal(`<div class="section-kicker">RESERVA / PEDIDO</div><h2 id="modalTitle">SOLICITAR RESERVA.</h2><p>Você pode continuar como visitante. Informe seu nome e WhatsApp para a GRAÇA confirmar disponibilidade e combinar os próximos passos.</p><div class="reservation-summary"><strong>RESUMO</strong><ul>${preview}</ul><div class="total"><span>VALOR ESTIMADO</span><strong>${money(total/100)}</strong></div></div><form id="reservationForm" class="modal-form"><label>SEU NOME<input name="customerName" autocomplete="name" maxlength="120" required></label><label>WHATSAPP<input name="phone" type="tel" autocomplete="tel" maxlength="40" placeholder="(63) 9 0000-0000" required></label><label>COMO PREFERE RECEBER?<select name="deliveryMethod" id="deliveryMethod"><option value="Retirada">Retirada</option><option value="Entrega">Entrega</option></select></label><div id="deliveryAddress" class="address-fields" hidden><strong>ENDEREÇO DE ENTREGA</strong><label>CEP<input name="zip" autocomplete="postal-code" maxlength="12"></label><div class="modal-grid"><label>RUA<input name="street" autocomplete="address-line1" maxlength="120"></label><label>NÚMERO<input name="number" maxlength="20"></label></div><label>BAIRRO<input name="district" maxlength="80"></label><div class="modal-grid"><label>CIDADE<input name="city" maxlength="80"></label><label>ESTADO<input name="state" maxlength="2"></label></div></div><label>DETALHE PARA RETIRADA (OPCIONAL)<input name="pickupDetails" maxlength="160" placeholder="Ex.: horário preferido"></label><label>OBSERVAÇÃO (OPCIONAL)<textarea name="notes" rows="3" maxlength="500"></textarea></label><label class="consent-row"><input name="marketingConsent" type="checkbox"> Quero receber novidades e ofertas. Opcional; não é necessário para processar a reserva.</label><p class="fine-print">Nome e WhatsApp serão usados para analisar esta solicitação e falar sobre a reserva. A loja ainda precisa confirmar a disponibilidade. Nenhum pagamento será solicitado nesta etapa.</p><button class="pill-button dark" id="submitReservation">ENVIAR SOLICITAÇÃO ↗</button></form>`);
  const method=$('#deliveryMethod'), address=$('#deliveryAddress');
  const toggleAddress=()=>{const delivery=method.value==='Entrega';address.hidden=!delivery;for(const name of ['zip','street','number','district','city','state'])address.querySelector(`[name="${name}"]`).required=delivery;};
  method.onchange=toggleAddress; toggleAddress();
  $('#reservationForm').onsubmit=async event=>{
    event.preventDefault();
    if (savingReservation) return;
    if (basket.length>6) return toast('Divida a solicitação em até seis combinações de produto e variação.');
    const form=new FormData(event.currentTarget), name=String(form.get('customerName')).trim(), phone=String(form.get('phone')).trim();
    if (!name || !phone) return toast('Preencha seu nome e WhatsApp.');
    let items;
    try {
      items=basket.map(item=>{
        const p=products.find(product=>String(product.id)===String(item.id));
        if(!p||p.active===false)throw new Error('Um item deixou de estar disponível. Revise o carrinho.');
        if(!p.sizes?.includes(item.size))throw new Error('Uma variação mudou. Revise o carrinho.');
        return {productId:String(p.id),name:String(p.name).slice(0,160),size:String(item.size).slice(0,40),quantity:Number(item.qty),unitPriceCents:productCents(p)};
      });
    } catch(error) { toast(error.message||'Revise os itens do carrinho.');return; }
    const deliveryMethod=String(form.get('deliveryMethod'));
    const addressData=deliveryMethod==='Entrega'?{zip:String(form.get('zip')).trim(),street:String(form.get('street')).trim(),number:String(form.get('number')).trim(),district:String(form.get('district')).trim(),city:String(form.get('city')).trim(),state:String(form.get('state')).trim().toUpperCase()}:{};
    if(deliveryMethod==='Entrega'&&Object.values(addressData).some(value=>!value))return toast('Complete o endereço de entrega.');
    savingReservation=true; const button=$('#submitReservation');button.disabled=true;button.textContent='ENVIANDO…';
    try {
      let user=auth.currentUser;
      if(!user)user=(await signInAnonymously(auth)).user;
      const cartFingerprint=JSON.stringify(items.map(item=>[item.productId,item.size,item.quantity,item.unitPriceCents]));
      const savedDraft=get('pendingReservation',null);
      let orderId=savedDraft?.fingerprint===cartFingerprint&&savedDraft?.uid===user.uid?savedDraft.orderId:'';
      if(!orderId){orderId=doc(collection(db,'orders')).id;set('pendingReservation',{fingerprint:cartFingerprint,uid:user.uid,orderId});}
      const reference=doc(db,'orders',orderId);
      const confirmationCode=`GRA-${orderId.toUpperCase()}`;
      const totalCents=items.reduce((sum,item)=>sum+item.unitPriceCents*item.quantity,0);
      const order={uid:user.uid,confirmationCode,customerName:name,phone,items,totalCents,deliveryMethod,address:addressData,
        pickupDetails:String(form.get('pickupDetails')||'').trim().slice(0,160),notes:String(form.get('notes')||'').trim().slice(0,500),
        marketingConsent:form.get('marketingConsent')==='on',status:'Aguardando confirmação',statusHistory:['Aguardando confirmação'],
        stockApplied:false,stockRestored:false,createdAt:serverTimestamp(),updatedAt:serverTimestamp()};
      const existing=await getDoc(reference);
      let savedOrder=order;
      if(existing.exists()){
        savedOrder=existing.data();
        const savedFingerprint=JSON.stringify((savedOrder.items||[]).map(item=>[item.productId,item.size,item.quantity,item.unitPriceCents]));
        if(savedOrder.uid!==user.uid||savedOrder.confirmationCode!==confirmationCode||savedFingerprint!==cartFingerprint)throw new Error('Não foi possível confirmar esta solicitação. Mantenha o carrinho e tente novamente.');
      }else await setDoc(reference,order);
      cart=[];cartCoupon='';set('cart',cart);set('cartCoupon','');renderCart();
      localStorage.removeItem('graca_pendingReservation');
      closeModal();
      openModal(`<div class="section-kicker">SOLICITAÇÃO REGISTRADA</div><h2 id="modalTitle">RECEBEMOS SEU PEDIDO.</h2><div class="confirmation-code">${htm(confirmationCode)}</div><p>O status é <strong>${htm(savedOrder.status||'Aguardando confirmação')}</strong>. A equipe da GRAÇA vai verificar o estoque e conversar com você pelo WhatsApp.</p><p>${items.map(item=>`${htm(item.name)} · ${htm(item.size)} · ${item.quantity} un.`).join('<br>')}</p><p>Valor estimado: <strong>${money(totalCents/100)}</strong><br>Modalidade: <strong>${htm(deliveryMethod)}</strong></p><p class="fine-print">Esta solicitação não é uma compra concluída nem uma reserva confirmada automaticamente. Nenhum pagamento foi cobrado.</p><button class="pill-button dark" id="reservationDone">VOLTAR À LOJA</button>`);
      $('#reservationDone').onclick=closeModal;
    } catch(error) {
      console.error('Falha ao enviar solicitação de reserva:',error);
      button.disabled=false;button.textContent='ENVIAR SOLICITAÇÃO ↗';toast(friendlyFirestoreError(error));
    } finally { savingReservation=false; }
  };
};

trackOrder = function() {
  if (!currentUser) return toast('Entre ou faça uma nova reserva neste dispositivo para consultar o status.');
  const list=orders.map(order=>`<article class="order-card"><strong>${htm(order.confirmationCode||order.id)} · ${htm(order.status)}</strong><span>${money(displayTotal(order))}</span><small>${safeDate(order.createdAt).toLocaleString('pt-BR')}</small></article>`).join('');
  openModal(`<div class="section-kicker">RESERVAS</div><h2 id="modalTitle">ACOMPANHE SEU PEDIDO.</h2>${list||'<div class="empty-state">AINDA NÃO HÁ RESERVAS NESTA CONTA OU NESTE DISPOSITIVO.</div>'}<p class="fine-print">Por privacidade, só mostramos solicitações vinculadas à sessão deste dispositivo.</p>`);
};

orderHistory = function() { trackOrder(); };
vipForm = function() { accountModal('signup'); };
clientMenu = function() {
  const user=auth.currentUser;
  if(!user||user.isAnonymous||!user.emailVerified)return accountModal('login');
  openModal('<div class="section-kicker">MY GRAÇA</div><h2 id="modalTitle">MINHA CONTA</h2><div class="client-menu-list"><button data-member="vip">COMUNIDADE VIP</button><button data-member="orders">STATUS DO PEDIDO</button><button data-member="profile">PERFIL</button><button data-member="logout">SAIR</button></div>');
  $$('[data-member]').forEach(button=>button.onclick=async()=>{const action=button.dataset.member;if(action==='vip')vipPage();if(action==='orders')orderHistory();if(action==='profile')profileEditor();if(action==='logout'){await signOut(auth);currentUser=null;isAdmin=false;memberNav();closeModal();}});
};
vipPage = async function() {
  const user=auth.currentUser;
  if(!user||user.isAnonymous||!user.emailVerified)return accountModal('login','A área VIP exige uma conta com e-mail confirmado. O cadastro é opcional para reservar.');
  openModal('<div class="section-kicker">COMUNIDADE VIP</div><h2 id="modalTitle">BENEFÍCIOS DA GRAÇA.</h2><p>Cupons, promoções e campanhas aparecem aqui quando a equipe os publica. Você não será inscrito em mensagens promocionais sem consentimento.</p><div id="vipOffers" class="vip-offers"><div class="empty-state">CARREGANDO BENEFÍCIOS…</div></div>');
  const box=$('#vipOffers');
  try {
    const [couponSnapshot,campaignSnapshot]=await Promise.all([
      getDocs(query(collection(db,'coupons'),where('status','==','published'),limit(50))),
      getDocs(query(collection(db,'campaigns'),where('status','==','published'),limit(50)))
    ]);
    const offers=[...couponSnapshot.docs.map(d=>({id:d.id,...d.data(),kind:'Cupom'})),...campaignSnapshot.docs.map(d=>({id:d.id,...d.data(),kind:'Campanha'}))];
    if(!$('#vipOffers'))return;
    box.innerHTML=offers.length?offers.map(offer=>`<article class="vip-offer"><span class="section-kicker">${htm(offer.kind)}</span><h3>${htm(offer.title||offer.code||'Benefício GRAÇA')}</h3><p>${htm(offer.description|| (offer.value?`${offer.value}% de desconto. Confira as condições com a equipe.`:''))}</p>${offer.code?`<strong class="offer-code">${htm(offer.code)}</strong>`:''}</article>`).join(''):'<div class="empty-state">AINDA NÃO HÁ BENEFÍCIOS PUBLICADOS.</div>';
  } catch(error) {console.error(error);if(box)box.innerHTML='<div class="empty-state">NÃO FOI POSSÍVEL CARREGAR A ÁREA VIP.</div>';}
};

function whatsappLink(order) {
  let number=String(order.phone||'').replace(/\D/g,'');if(number&&!number.startsWith('55'))number='55'+number;
  if(!number)return '—';
  const text=`Olá, ${order.customerName}! Aqui é a GRAÇA. Sobre sua solicitação ${order.confirmationCode||order.id}: podemos confirmar os itens e combinar os próximos passos.`;
  return `<a class="mini-button" href="https://wa.me/${number}?text=${encodeURIComponent(text)}" target="_blank" rel="noopener">ABRIR WHATSAPP ↗</a>`;
}

function renderAdminOrders() {
  const pending=orders.filter(order=>order.status==='Aguardando confirmação').length;
  const rows=orders.map(order=>`<tr><td><button class="mini-button" data-order-details="${htm(order.id)}">${htm(order.confirmationCode||order.id)}</button></td><td>${htm(order.customerName)}</td><td>${safeDate(order.createdAt).toLocaleString('pt-BR')}</td><td>${money(order.status==='Concluído'?Number(order.saleTotalCents)/100:displayTotal(order))}</td><td><span class="status ${order.status==='Aguardando confirmação'?'pending':''}">${htm(order.status)}</span></td><td>${whatsappLink(order)}</td><td>${order.status==='Entregue'?`<button class="mini-button primary" data-close-order="${htm(order.id)}">ENCERRAR VENDA</button>`:order.status==='Concluído'?'<span class="fine-print">VENDA REGISTRADA</span>':`<select data-order-status="${htm(order.id)}"><option value="">Atualizar…</option>${reservationStatuses.filter(status=>status!==order.status&&allowedNextStatus(order,status)).map(status=>`<option value="${htm(status)}">${htm(status)}</option>`).join('')}</select>`}</td></tr>`).join('');
  $('#adminContent').innerHTML=`<div class="section-kicker">RESERVAS / TEMPO REAL</div><h2>PEDIDOS</h2><div class="admin-cards"><div class="metric"><span>AGUARDANDO CONFIRMAÇÃO</span><strong>${pending}</strong></div><div class="metric"><span>SOLICITAÇÕES CARREGADAS</span><strong>${orders.length}</strong></div><div class="metric"><span>VENDAS ENCERRADAS</span><strong>${orders.filter(order=>order.status==='Concluído').length}</strong></div></div>${rows?`<div class="admin-table-wrap"><table class="admin-table"><thead><tr><th>CÓDIGO</th><th>CLIENTE</th><th>DATA</th><th>VALOR</th><th>STATUS</th><th>WHATSAPP</th><th>AÇÃO</th></tr></thead><tbody>${rows}</tbody></table></div>`:'<div class="empty-state">NENHUMA SOLICITAÇÃO RECEBIDA.</div>'}<p class="fine-print">Solicitações pendentes não reduzem estoque. A confirmação valida e atualiza o estoque em uma transação. Uma venda só pode ser encerrada depois de marcada como entregue; o encerramento pede canal e forma de pagamento.</p>`;
  $$('[data-order-details]').forEach(button=>button.onclick=()=>showOrderDetails(orders.find(order=>order.id===button.dataset.orderDetails)));
  $$('[data-close-order]').forEach(button=>button.onclick=()=>closeOrderDialog(button.dataset.closeOrder));
  $$('[data-order-status]').forEach(select=>select.onchange=async()=>{if(!select.value)return;select.disabled=true;try{await changeReservationStatus(select.dataset.orderStatus,select.value);toast('Status atualizado.');}catch(error){console.error(error);toast(friendlyFirestoreError(error));select.disabled=false;}});
}

function allowedNextStatus(order,next) {
  const states={
    'Aguardando confirmação':['Reserva confirmada','Cancelado'],
    'Reserva confirmada':['Em preparação','Cancelado'],
    'Em preparação':order.deliveryMethod==='Retirada'?['Disponível para retirada','Cancelado']:['Em rota de entrega','Cancelado'],
    'Disponível para retirada':['Entregue','Cancelado'],
    'Em rota de entrega':['Entregue','Cancelado']
  };
  return (states[order.status]||[]).includes(next);
}

function showOrderDetails(order) {
  if(!order)return;
  const lines=(order.items||[]).map(item=>{const quantity=Number(item.quantity??item.qty??0),priceCents=Number(item.unitPriceCents??Math.round(Number(item.unitPrice||0)*100));return `<li>${htm(item.name||item.productName||item.productId||item.id)} · ${htm(item.size)} · ${quantity} un. · ${money(priceCents*quantity/100)}</li>`;}).join('');
  const addr=order.deliveryMethod==='Entrega'?order.address:{};
  const saleDetails=order.status==='Concluído'?`<p class="sale-record"><strong>Venda encerrada:</strong> ${money(Number(order.saleTotalCents)/100)}<br><strong>Canal:</strong> ${htm(order.salesChannel)} · <strong>Pagamento:</strong> ${htm(order.paymentMethod)}<br>${Number(order.installmentCount)>1?`${Number(order.installmentCount)} parcelas: ${money(Number(order.installmentValueCents)/100)} × ${Number(order.installmentCount)-1} + parcela final de ${money(Number(order.finalInstallmentValueCents)/100)}`:'Pagamento em parcela única'}<br><strong>Encerrado em:</strong> ${safeDate(order.closedAt).toLocaleString('pt-BR')}</p>`:'';
  openModal(`<div class="section-kicker">${htm(order.confirmationCode||order.id)}</div><h2 id="modalTitle">DETALHES DA SOLICITAÇÃO.</h2><p><strong>${htm(order.customerName)}</strong><br>${htm(order.phone)} · ${whatsappLink(order)}</p><p>${htm(order.status||'Registro legado')} · ${safeDate(order.createdAt).toLocaleString('pt-BR')}</p><ul class="order-detail-items">${lines}</ul><p><strong>Valor estimado ou registrado:</strong> ${money(displayTotal(order))}<br><strong>Modalidade:</strong> ${htm(order.deliveryMethod||order.delivery||'Não registrada')}</p>${order.deliveryMethod==='Entrega'?`<p>${htm(addr.street)}, ${htm(addr.number)} · ${htm(addr.district)}<br>${htm(addr.city)} / ${htm(addr.state)} · ${htm(addr.zip)}</p>`:''}${order.pickupDetails?`<p><strong>Retirada:</strong> ${htm(order.pickupDetails)}</p>`:''}${order.notes?`<p><strong>Observações:</strong> ${htm(order.notes)}</p>`:''}${saleDetails}<p class="fine-print">Consentimento para novidades: ${order.marketingConsent?'sim':'não'}.</p><h3>HISTÓRICO</h3><ol>${(order.statusHistory||[order.status||'Registro anterior']).map(status=>`<li>${htm(status)}</li>`).join('')}</ol>`);
}

function closeOrderDialog(orderId) {
  const order=orders.find(item=>item.id===orderId);
  if(!order||order.status!=='Entregue')return toast('Só é possível encerrar uma venda depois da entrega.');
  const total=(displayTotal(order)).toFixed(2);
  openModal(`<div class="section-kicker">VENDA / ${htm(order.confirmationCode||order.id)}</div><h2 id="modalTitle">ENCERRAR ATENDIMENTO.</h2><p>Informe onde a venda foi realizada e a forma de pagamento. O valor final pode ser ajustado antes de salvar.</p><form id="saleClosureForm" class="modal-form"><label>CANAL DA VENDA<select name="salesChannel" required>${salesChannels.map(channel=>`<option value="${htm(channel)}">${htm(channel)}</option>`).join('')}</select></label><label>FORMA DE PAGAMENTO<select name="paymentMethod" required>${paymentMethods.map(method=>`<option value="${htm(method)}">${htm(method)}</option>`).join('')}</select></label><label>VALOR FINAL DA VENDA (R$)<input name="saleTotal" type="number" min="0.01" max="1000000" step="0.01" value="${htm(total)}" required></label><div id="installmentFields" hidden><label>QUANTIDADE DE PARCELAS<select name="installmentCount">${Array.from({length:11},(_,index)=>index+2).map(count=>`<option value="${count}">${count} parcelas</option>`).join('')}</select></label><p id="installmentPreview" class="installment-preview" aria-live="polite"></p></div><p class="fine-print">O encerramento registra um histórico permanente da venda; pedidos não são apagados.</p><button class="pill-button dark" id="confirmSaleClosure">REGISTRAR VENDA CONCLUÍDA ↗</button></form>`);
  const form=$('#saleClosureForm'),method=form.elements.paymentMethod,count=form.elements.installmentCount,amount=form.elements.saleTotal,fields=$('#installmentFields'),preview=$('#installmentPreview');
  const syncInstallments=()=>{const parcelado=method.value==='Cartão de crédito parcelado';fields.hidden=!parcelado;if(!parcelado)return;const cents=Math.max(0,Math.round(Number(amount.value||0)*100)),parts=Number(count.value||2),each=Math.floor(cents/parts),last=cents-each*(parts-1);preview.textContent=`${parts-1} parcela(s) de ${money(each/100)} e a última de ${money(last/100)} · total ${money(cents/100)}`;};
  method.onchange=syncInstallments;count.onchange=syncInstallments;amount.oninput=syncInstallments;syncInstallments();
  form.onsubmit=async event=>{event.preventDefault();const cents=Math.round(Number(amount.value)*100),installments=method.value==='Cartão de crédito parcelado'?Number(count.value):1;if(!Number.isInteger(cents)||cents<1||cents>100000000||installments<1||installments>12)return toast('Confira o valor final e a quantidade de parcelas.');const button=$('#confirmSaleClosure');button.disabled=true;button.textContent='REGISTRANDO…';try{await finalizeReservationSale(orderId,{salesChannel:String(form.elements.salesChannel.value),paymentMethod:String(method.value),saleTotalCents:cents,installmentCount:installments});closeModal();toast('Venda registrada e atendimento encerrado.');}catch(error){console.error(error);toast(friendlyFirestoreError(error));button.disabled=false;button.textContent='REGISTRAR VENDA CONCLUÍDA ↗';}};
}

async function finalizeReservationSale(orderId,sale) {
  const orderRef=doc(db,'orders',orderId);
  await runTransaction(db,async transaction=>{
    const snapshot=await transaction.get(orderRef);
    if(!snapshot.exists())throw new Error('Pedido não encontrado.');
    const order=snapshot.data();
    if(order.status!=='Entregue'||order.salesChannel||order.closedAt)throw new Error('O pedido precisa estar entregue e ainda não encerrado.');
    if(!salesChannels.includes(sale.salesChannel)||!paymentMethods.includes(sale.paymentMethod))throw new Error('Selecione um canal e uma forma de pagamento válidos.');
    const installmentValueCents=Math.floor(sale.saleTotalCents/sale.installmentCount);
    const finalInstallmentValueCents=sale.saleTotalCents-installmentValueCents*(sale.installmentCount-1);
    transaction.update(orderRef,{
      ...sale,installmentValueCents,finalInstallmentValueCents,
      status:'Concluído',statusHistory:[...(order.statusHistory||[]),'Concluído'],
      closedAt:serverTimestamp(),updatedAt:serverTimestamp()
    });
  });
}

async function changeReservationStatus(orderId,nextStatus) {
  const orderRef=doc(db,'orders',orderId);
  await runTransaction(db,async transaction=>{
    const snapshot=await transaction.get(orderRef);
    if(!snapshot.exists())throw new Error('Solicitação não encontrada.');
    const order={...snapshot.data(),id:snapshot.id};
    if(!allowedNextStatus(order,nextStatus))throw new Error('Esta mudança de status não é permitida.');
    const grouped=new Map();
    for(const item of order.items||[])grouped.set(item.productId,(grouped.get(item.productId)||0)+Number(item.quantity));
    const productRefs=[...grouped.keys()].map(id=>doc(db,'products',id));
    const productSnapshots=[];
    for(const ref of productRefs)productSnapshots.push(await transaction.get(ref));
    const willConfirm=nextStatus==='Reserva confirmada';
    const willCancel=nextStatus==='Cancelado'&&order.stockApplied===true&&!order.stockRestored;
    if(willConfirm) {
      for(let i=0;i<productSnapshots.length;i++){
        const productSnapshot=productSnapshots[i],quantity=grouped.get(productRefs[i].id),product=productSnapshot.data();
        if(!productSnapshot.exists()||product.active===false||Number(product.stock)<quantity)throw new Error(`Estoque insuficiente para ${product?.name||productRefs[i].id}.`);
        if((order.items||[]).filter(item=>item.productId===productRefs[i].id).some(item=>!product.sizes?.includes(item.size)))throw new Error(`Variação indisponível para ${product.name}.`);
      }
      productSnapshots.forEach((snapshot,index)=>transaction.update(productRefs[index],{stock:Number(snapshot.data().stock)-grouped.get(productRefs[index].id),updatedAt:serverTimestamp()}));
    }
    if(willCancel)productSnapshots.forEach((snapshot,index)=>{if(!snapshot.exists())throw new Error('Produto da reserva não foi encontrado; estoque não alterado.');transaction.update(productRefs[index],{stock:Number(snapshot.data().stock)+grouped.get(productRefs[index].id),updatedAt:serverTimestamp()});});
      const updated={status:nextStatus,statusHistory:[...(order.statusHistory||[order.status]),nextStatus],updatedAt:serverTimestamp()};
    if(willConfirm){updated.stockApplied=true;updated.confirmedAt=serverTimestamp();}
    if(willCancel){updated.stockApplied=false;updated.stockRestored=true;updated.cancelledAt=serverTimestamp();}
    transaction.update(orderRef,updated);
  });
}

function renderAdminProducts() {
  const transferableLegacyProducts=migrationCandidates.filter(product=>isCloudinaryUrl(product.imageUrl)&&isCloudinaryPublicId(product.imagePublicId));
  const rows=products.map(product=>`<tr><td>${isCloudinaryUrl(product.imageUrl)?`<img class="admin-product-photo" src="${htm(product.imageUrl)}" alt="${htm(product.name)}">`:''}${htm(product.name)}</td><td>${htm(product.category||'')}</td><td>${money(productCents(product)/100)}</td><td>${Number(product.stock||0)}</td><td>${product.seededExample?'EXEMPLO · REVISAR':product.active===false?'RASCUNHO':'ATIVO'}</td><td><button class="mini-button" data-product-edit="${htm(product.id)}">EDITAR</button></td></tr>`).join('');
  $('#adminContent').innerHTML=`<div class="section-kicker">CATÁLOGO / FIRESTORE</div><h2>PRODUTOS</h2><div class="admin-toolbar"><span>${products.length} produtos no Firestore</span><div><button id="cloudinarySetup" class="mini-button">CONFIGURAR UPLOAD</button> <button id="newProduct" class="mini-button primary">+ NOVO PRODUTO</button></div></div><p class="fine-print">Cada produto precisa de uma foto segura enviada ao Cloudinary. Os dados e as imagens de exemplo são rascunhos; revise o estoque e os preços antes de publicar. Produtos e pedidos não podem ser apagados pelo painel.</p><div class="admin-toolbar"><button id="importExampleProducts" class="mini-button">IMPORTAR FOTOS DA PASTA</button><input id="exampleProductFolder" type="file" accept="image/jpeg,image/png,image/webp" webkitdirectory directory multiple hidden></div>${transferableLegacyProducts.length?'<button id="importLegacyProducts" class="mini-button">IMPORTAR CATÁLOGO DESTE NAVEGADOR</button>':''}${rows?`<div class="admin-table-wrap"><table class="admin-table"><thead><tr><th>PRODUTO</th><th>CATEGORIA</th><th>PREÇO</th><th>ESTOQUE</th><th>STATUS</th><th>AÇÃO</th></tr></thead><tbody>${rows}</tbody></table></div>`:'<div class="empty-state">NENHUM PRODUTO CADASTRADO NO FIRESTORE.</div>'}<div id="cloudinaryEndpointStatus" class="fine-print"></div>`;
  $('#newProduct').onclick=()=>productEditor();
  $('#cloudinarySetup').onclick=configureCloudinaryWorker;
  $('#importExampleProducts').onclick=()=>$('#exampleProductFolder').click();
  $('#exampleProductFolder').onchange=async event=>{const files=[...(event.currentTarget.files||[])];event.currentTarget.value='';await importExampleProducts(files);};
  $$('[data-product-edit]').forEach(button=>button.onclick=()=>productEditor(button.dataset.productEdit));
  $('#importLegacyProducts')?.addEventListener('click',async()=>{
    const names=transferableLegacyProducts.map(product=>product.name).join('\n');
    if(!confirm(`Importar ${transferableLegacyProducts.length} produto(s) com foto já enviada ao Cloudinary?\n\n${names}\n\nOs produtos serão criados como rascunhos ocultos. Itens já existentes com o mesmo ID não serão substituídos.`))return;
    try{for(const source of transferableLegacyProducts){const id=String(source.id);const existing=await getDoc(doc(db,'products',id));if(existing.exists())continue;const {id:_localId,createdAt:_oldCreatedAt,...fields}=source;await setDoc(doc(db,'products',id),{...fields,active:false,stock:Number(source.stock||0),sizes:source.sizes?.length?source.sizes:['Único'],createdAt:serverTimestamp(),updatedAt:serverTimestamp()});await saveCategory(source.category);}toast('Catálogo compatível importado como rascunho, sem substituir produtos existentes.');}
    catch(error){console.error(error);toast(friendlyFirestoreError(error));}
  });
}

async function uploadProductPhoto(file) {
  if(!isAdmin||!auth.currentUser?.emailVerified)throw new Error('Entre em uma conta de administrador com e-mail confirmado.');
  if(!cloudinaryWorkerUrl){const setting=await getDoc(doc(db,'settings','cloudinary'));cloudinaryWorkerUrl=setting.exists()?setting.data().workerUrl||'':'';}
  if(!cloudinaryWorkerUrl)throw new Error('Configure primeiro o endereço do Worker de upload.');
  if(!(file instanceof File)||!['image/jpeg','image/png','image/webp'].includes(file.type)||file.size<1||file.size>5*1024*1024)throw new Error('Use uma foto JPEG, PNG ou WebP de até 5 MB.');
  const token=await auth.currentUser.getIdToken();
  const body=new FormData();body.append('file',file);
  const response=await fetch(cloudinaryWorkerUrl,{method:'POST',headers:{Authorization:`Bearer ${token}`},body});
  let result={};try{result=await response.json();}catch{}
  if(!response.ok)throw new Error(result.error||'O Worker recusou o envio.');
  if(!isCloudinaryUrl(result.secure_url)||!isCloudinaryPublicId(result.public_id))throw new Error('O Cloudinary não retornou uma URL segura e um identificador válidos.');
  return {imageUrl:result.secure_url,imagePublicId:result.public_id};
}

async function importExampleProducts(files) {
  if(!isAdmin)return toast('Somente uma conta autorizada pode importar produtos.');
  if(importingExamples)return toast('Uma importação já está em andamento.');
  const fileByName=new Map(files.map(file=>[file.name,file]));
  const missing=exampleProductTemplates.filter(item=>!fileByName.has(item.filename));
  const existing=[];
  for(const item of exampleProductTemplates){const snapshot=await getDoc(doc(db,'products',item.id));if(snapshot.exists())existing.push(item.name);}
  const toImport=exampleProductTemplates.filter(item=>fileByName.has(item.filename)&&!existing.includes(item.name));
  if(missing.length)toast(`A pasta não trouxe ${missing.length} foto(s) esperada(s); vou considerar somente as fotos de produto reconhecidas.`);
  if(!toImport.length)return toast(existing.length?'Os produtos de exemplo já existem.':'Nenhuma foto de produto reconhecida na pasta selecionada.');
  const preview=toImport.map(item=>`• ${item.name}`).join('\n');
  if(!confirm(`Importar ${toImport.length} produto(s) como rascunho?\n\n${preview}\n\nAs imagens serão enviadas ao Cloudinary. Preços estimados aleatórios e estoque de 5 a 50 unidades serão gerados. Os itens ficarão ocultos até você revisar e publicar. Artes da marca e campanha serão ignoradas.`))return;
  if(importingExamples)return toast('Uma importação já está em andamento.');
  let created=0;importingExamples=true;
  try{
    for(const item of toImport){
      const file=fileByName.get(item.filename);
      const image=await uploadProductPhoto(file);
      const steps=Math.floor((item.priceMaxCents-item.priceMinCents)/500);
      const priceCents=item.priceMinCents+Math.floor(Math.random()*(steps+1))*500;
      const stock=Math.floor(Math.random()*46)+5;
      const product={
        name:item.name,category:item.category,price:priceCents/100,cost:null,discount:0,stock,
        sizes:item.sizes,active:false,featured:false,description:item.description,
        imageUrl:image.imageUrl,imagePublicId:image.imagePublicId,color:item.color,mark:item.mark,
        seededExample:true,createdAt:serverTimestamp(),updatedAt:serverTimestamp()
      };
      const ref=doc(db,'products',item.id);
      const didCreate=await runTransaction(db,async transaction=>{const snapshot=await transaction.get(ref);if(snapshot.exists())return false;transaction.set(ref,product);return true;});
      if(!didCreate)continue;
      await saveCategory(item.category);
      created++;
    }
    toast(`${created} produto(s) de exemplo importado(s) como rascunho. Revise preço e estoque antes de publicar.`);
  }catch(error){
    console.error('Falha na importação de exemplos:',error);
    toast(`${created} rascunho(s) importado(s). Falha no próximo envio: ${error.message||'verifique o Worker Cloudinary'}`);
  }finally{importingExamples=false;}
}

function renderAdminMessages() {
  const rows=messages.map(message=>`<tr><td>${safeDate(message.createdAt).toLocaleString('pt-BR')}</td><td>${htm(message.name)}</td><td><a href="mailto:${htm(message.email)}">${htm(message.email)}</a></td><td>${htm(message.subject)}</td><td>${htm(message.message)}</td><td><select data-message-status="${htm(message.id)}"><option ${message.status==='Nova'?'selected':''}>Nova</option><option ${message.status==='Em atendimento'?'selected':''}>Em atendimento</option><option ${message.status==='Concluída'?'selected':''}>Concluída</option></select></td></tr>`).join('');
  $('#adminContent').innerHTML=`<div class="section-kicker">ATENDIMENTO / FIRESTORE</div><h2>MENSAGENS DE CONTATO</h2>${rows?`<div class="admin-table-wrap"><table class="admin-table"><thead><tr><th>DATA</th><th>NOME</th><th>E-MAIL</th><th>ASSUNTO</th><th>MENSAGEM</th><th>STATUS</th></tr></thead><tbody>${rows}</tbody></table></div>`:'<div class="empty-state">NENHUMA MENSAGEM RECEBIDA.</div>'}`;
  $$('[data-message-status]').forEach(select=>select.onchange=async()=>{const message=messages.find(item=>item.id===select.dataset.messageStatus);if(!message)return;select.disabled=true;try{await updateDoc(doc(db,'messages',message.id),{status:select.value,updatedAt:serverTimestamp()});}catch(error){toast(friendlyFirestoreError(error));select.disabled=false;}});
}

async function saveCategory(name) {
  const value=String(name||'').trim().slice(0,80);if(!value)return;
  const id=value.normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase().replace(/[^a-z0-9-]+/g,'-').replace(/^-|-$/g,'').slice(0,80);
  if(id)await setDoc(doc(db,'categories',id),{name:value,active:true,updatedAt:serverTimestamp()},{merge:true});
}

async function configureCloudinaryWorker() {
  const saved=await getDoc(doc(db,'settings','cloudinary'));
  const current=saved.exists()?saved.data().workerUrl||'':cloudinaryWorkerUrl;
  const value=prompt('Cole o endereço HTTPS do Worker de upload que você publicou na sua conta Cloudflare (ex.: https://graca-cloudinary-upload.seu-subdominio.workers.dev/upload). Nenhuma chave Cloudinary deve ser colada aqui.',current);
  if(value===null)return;
  const url=value.trim();
  if(url&&!/^https:\/\/[a-z0-9-]+(?:\.[a-z0-9-]+)*\.workers\.dev(?:\/upload)?$/i.test(url))return toast('Use o endereço HTTPS do Worker em workers.dev.');
  try{await setDoc(doc(db,'settings','cloudinary'),{workerUrl:url,updatedAt:serverTimestamp()},{merge:true});cloudinaryWorkerUrl=url;toast(url?'Worker de upload configurado.':'Endereço do Worker removido.');}
  catch(error){console.error(error);toast(friendlyFirestoreError(error));}
}

productEditor = async function(id='') {
  const existing=products.find(item=>String(item.id)===String(id));
  const p=existing||{name:'',category:'',price:'',cost:'',discount:0,stock:0,sizes:['Único'],color:'pink',mark:'GRAÇA',description:'',featured:false,active:true,imageUrl:'',imagePublicId:''};
  let imageUrl=isCloudinaryUrl(p.imageUrl)?p.imageUrl:'', imagePublicId=isCloudinaryPublicId(p.imagePublicId)?p.imagePublicId:'', previewUrl='';
  const setting=await getDoc(doc(db,'settings','cloudinary')).catch(()=>null);
  cloudinaryWorkerUrl=setting?.exists()?setting.data().workerUrl||'':'';
  openModal(`<div class="section-kicker">CATÁLOGO / ${id?'EDITAR':'NOVO'}</div><h2 id="modalTitle">${id?'EDITAR PRODUTO':'CADASTRAR PRODUTO'}.</h2>${p.seededExample?'<p class="seed-review-note">Este é um exemplo: confirme nome, preço, estoque e variações antes de publicar.</p>':''}<form id="productForm" class="modal-form"><label>NOME<input name="name" maxlength="160" required value="${htm(p.name)}"></label><label>CATEGORIA<input name="category" maxlength="80" required value="${htm(p.category)}"></label><div class="modal-grid"><label>PREÇO<input name="price" type="number" min="0.01" max="100000" step=".01" required value="${htm(p.price)}"></label><label>CUSTO (OPCIONAL)<input name="cost" type="number" min="0" step=".01" value="${htm(p.cost??'')}"></label></div><div class="modal-grid"><label>DESCONTO (%)<input name="discount" type="number" min="0" max="100" value="${htm(p.discount||0)}"></label><label>ESTOQUE<input name="stock" type="number" min="0" max="100000" step="1" required value="${htm(p.stock||0)}"></label></div><label>TAMANHOS / VARIAÇÕES (SEPARADOS POR VÍRGULA)<input name="sizes" required value="${htm((p.sizes||[]).join(', '))}"></label><label>DESCRIÇÃO<textarea name="description" maxlength="1200">${htm(p.description||'')}</textarea></label><label><input name="featured" type="checkbox" ${p.featured?'checked':''}> Exibir na curadoria em destaque</label><label><input name="active" type="checkbox" ${p.active!==false?'checked':''}> Publicado no catálogo</label><div class="upload-preview">${imageUrl?`<img id="productPhotoPreview" src="${htm(imageUrl)}" alt="Prévia da foto">`:'<div id="productPhotoPreview" class="empty-state">SEM FOTO</div>'}</div><label>ESCOLHER FOTO NO CELULAR OU COMPUTADOR<input id="photoFile" type="file" accept="image/jpeg,image/png,image/webp"></label><div class="admin-toolbar"><button id="uploadPhoto" class="mini-button" type="button">ENVIAR FOTO</button><button id="removePhoto" class="mini-button" type="button">REMOVER FOTO</button></div><p class="fine-print">Envio limitado a JPEG, PNG ou WebP até 5 MB. O segredo do Cloudinary fica somente no Worker.</p><button class="pill-button dark" id="saveProduct">SALVAR PRODUTO</button></form>`);
  const fileInput=$('#photoFile'), uploadButton=$('#uploadPhoto'), saveButton=$('#saveProduct');
  fileInput.onchange=()=>{const file=fileInput.files?.[0];if(!file)return;if(!['image/jpeg','image/png','image/webp'].includes(file.type)||file.size>5*1024*1024){fileInput.value='';return toast('Escolha JPEG, PNG ou WebP de até 5 MB.');}if(previewUrl)URL.revokeObjectURL(previewUrl);previewUrl=URL.createObjectURL(file);$('#productPhotoPreview').outerHTML=`<img id="productPhotoPreview" src="${previewUrl}" alt="Prévia da foto selecionada">`;};
  $('#removePhoto').onclick=()=>{imageUrl='';imagePublicId='';if(previewUrl)URL.revokeObjectURL(previewUrl);$('#productPhotoPreview').outerHTML='<div id="productPhotoPreview" class="empty-state">SEM FOTO</div>';fileInput.value='';};
  uploadButton.onclick=async()=>{
    const file=fileInput.files?.[0];if(!file)return toast('Escolha uma foto primeiro.');if(!cloudinaryWorkerUrl)return toast('Configure o endereço do Worker no painel antes de enviar fotos.');
    uploadButton.disabled=true;uploadButton.textContent='ENVIANDO…';
    try{const uploaded=await uploadProductPhoto(file);imageUrl=uploaded.imageUrl;imagePublicId=uploaded.imagePublicId;$('#productPhotoPreview').outerHTML=`<img id="productPhotoPreview" src="${htm(imageUrl)}" alt="Prévia da foto enviada">`;toast('Foto enviada. Salve o produto para gravar a URL segura.');}
    catch(error){console.error(error);toast(error.message||'Falha no upload da foto.');}
    finally{uploadButton.disabled=false;uploadButton.textContent='ENVIAR FOTO';}
  };
  $('#productForm').onsubmit=async event=>{
    event.preventDefault();const form=new FormData(event.currentTarget),name=String(form.get('name')).trim(),category=String(form.get('category')).trim(),price=Number(form.get('price')),stock=Number(form.get('stock')),sizes=String(form.get('sizes')).split(',').map(value=>value.trim()).filter(Boolean);
    if(!name||!category||!Number.isFinite(price)||price<=0||!Number.isInteger(stock)||sizes.length<1||sizes.length>20)return toast('Confira nome, categoria, preço, estoque e variações.');
    if(!isCloudinaryUrl(imageUrl)||!isCloudinaryPublicId(imagePublicId))return toast('Envie uma foto válida ao Cloudinary antes de salvar o produto.');
    saveButton.disabled=true;saveButton.textContent='SALVANDO…';
    try{
      const ref=id?doc(db,'products',id):doc(collection(db,'products'));
      const product={name,category,price,cost:form.get('cost')===''?null:Number(form.get('cost')),discount:Number(form.get('discount')||0),stock,sizes,description:String(form.get('description')||'').trim(),featured:form.get('featured')==='on',active:form.get('active')==='on',imageUrl,imagePublicId,color:p.color||'pink',mark:p.mark||'GRAÇA',updatedAt:serverTimestamp()};
      await setDoc(ref,product,{merge:true});await saveCategory(category);closeModal();toast('Produto salvo no Firestore.');
    }catch(error){console.error(error);toast(friendlyFirestoreError(error));saveButton.disabled=false;saveButton.textContent='SALVAR PRODUTO';}
  };
};

function renderAdminBenefits() {
  $('#adminContent').innerHTML='<div class="section-kicker">COMUNIDADE / PUBLICAÇÕES</div><h2>BENEFÍCIOS VIP</h2><p>Cadastre cupons e campanhas. Só itens em estado Publicado aparecem para membros com e-mail confirmado.</p><div class="admin-toolbar"><button id="newVipCoupon" class="mini-button primary">+ NOVO CUPOM</button><button id="newVipCampaign" class="mini-button">+ NOVA CAMPANHA</button></div><h3>CUPONS</h3><div id="adminCoupons" class="empty-state">CARREGANDO…</div><h3>CAMPANHAS</h3><div id="adminCampaigns" class="empty-state">CARREGANDO…</div>';
  const load=async()=>{
    try{
      const [couponsSnapshot,campaignsSnapshot]=await Promise.all([getDocs(query(collection(db,'coupons'),limit(100))),getDocs(query(collection(db,'campaigns'),limit(100)))]);
      const coupons=couponsSnapshot.docs.map(d=>({id:d.id,...d.data()})),campaigns=campaignsSnapshot.docs.map(d=>({id:d.id,...d.data()}));
      if(!$('#adminCoupons'))return;
      $('#adminCoupons').outerHTML=`<div id="adminCoupons">${coupons.length?table(['CÓDIGO','DESCONTO','STATUS','AÇÃO'],coupons.map(c=>[htm(c.code),`${Number(c.value||0)}%`,c.status==='published'?'PUBLICADO':'RASCUNHO',`<button class="mini-button" data-toggle-coupon="${htm(c.id)}">${c.status==='published'?'DESPUBLICAR':'PUBLICAR'}</button>`])):'<div class="empty-state">NENHUM CUPOM CADASTRADO.</div>'}</div>`;
      $('#adminCampaigns').outerHTML=`<div id="adminCampaigns">${campaigns.length?table(['CAMPANHA','DESCRIÇÃO','STATUS','AÇÃO'],campaigns.map(c=>[htm(c.title),htm(c.description),c.status==='published'?'PUBLICADA':'RASCUNHO',`<button class="mini-button" data-toggle-campaign="${htm(c.id)}">${c.status==='published'?'DESPUBLICAR':'PUBLICAR'}</button>`])):'<div class="empty-state">NENHUMA CAMPANHA CADASTRADA.</div>'}</div>`;
      $$('[data-toggle-coupon]').forEach(button=>button.onclick=()=>toggleOffer('coupons',button.dataset.toggleCoupon,coupons));
      $$('[data-toggle-campaign]').forEach(button=>button.onclick=()=>toggleOffer('campaigns',button.dataset.toggleCampaign,campaigns));
    }catch(error){console.error(error);$('#adminCoupons').textContent='Não foi possível carregar os cupons.';$('#adminCampaigns').textContent='Não foi possível carregar as campanhas.';}
  };
  $('#newVipCoupon').onclick=async()=>{const code=String(prompt('Código do cupom (ex.: GRACA10)')||'').trim().toUpperCase(),value=Number(prompt('Percentual informado no benefício (1 a 100)'));if(!/^[A-Z0-9_-]{3,30}$/.test(code)||!Number.isInteger(value)||value<1||value>100)return toast('Informe um código e um percentual válidos.');try{await setDoc(doc(db,'coupons',code),{code,value,status:'draft',createdAt:serverTimestamp(),updatedAt:serverTimestamp()});await load();}catch(error){toast(friendlyFirestoreError(error));}};
  $('#newVipCampaign').onclick=async()=>{const title=String(prompt('Título da campanha')||'').trim(),description=String(prompt('Descrição e condições')||'').trim();if(!title||!description)return toast('Título e descrição são necessários.');try{const ref=doc(collection(db,'campaigns'));await setDoc(ref,{title:title.slice(0,120),description:description.slice(0,500),status:'draft',createdAt:serverTimestamp(),updatedAt:serverTimestamp()});await load();}catch(error){toast(friendlyFirestoreError(error));}};
  load();
}

async function toggleOffer(collectionName,id,items) {
  const offer=items.find(item=>item.id===id);if(!offer)return;
  try{await updateDoc(doc(db,collectionName,id),{status:offer.status==='published'?'draft':'published',updatedAt:serverTimestamp()});renderAdminContent();}
  catch(error){console.error(error);toast(friendlyFirestoreError(error));}
}

function renderAdminOverview(el) {
  const pending=orders.filter(order=>order.status==='Aguardando confirmação').length;
  const inProgress=orders.filter(order=>['Reserva confirmada','Em preparação','Disponível para retirada','Em rota de entrega','Entregue'].includes(order.status)).length;
  const recent=orders.slice(0,8);
  el.innerHTML=`<div class="section-kicker">GRAÇA / PAINEL</div><h2>VISÃO GERAL</h2><p>Atalhos e indicadores da operação diária.</p><div class="admin-cards"><div class="metric"><span>PRODUTOS PUBLICADOS</span><strong>${activeProducts().length}</strong></div><div class="metric"><span>AGUARDANDO CONFIRMAÇÃO</span><strong>${pending}</strong></div><div class="metric"><span>EM ATENDIMENTO</span><strong>${inProgress}</strong></div><div class="metric"><span>CONTAS VIP</span><strong>${customers.length}</strong></div></div><div class="admin-toolbar"><div class="admin-shortcuts"><button class="mini-button primary" data-admin-shortcut="orders">ABRIR PEDIDOS</button><button class="mini-button" data-admin-shortcut="products">GERENCIAR PRODUTOS</button><button class="mini-button" data-admin-shortcut="analytics">ABRIR FINANCEIRO</button></div></div><h3>ÚLTIMAS SOLICITAÇÕES</h3>${recent.length?table(['CÓDIGO','CLIENTE','DATA','VALOR ESTIMADO','STATUS'],recent.map(order=>[htm(order.confirmationCode||order.id),htm(order.customerName),safeDate(order.createdAt).toLocaleDateString('pt-BR'),money(displayTotal(order)),htm(order.status)])):'<div class="empty-state">AS NOVAS SOLICITAÇÕES APARECERÃO AQUI EM TEMPO REAL.</div>'}<p class="fine-print">O faturamento e os dados de pagamento são exibidos somente na aba Análise Financeira e consideram vendas encerradas.</p>`;
  $$('[data-admin-shortcut]').forEach(button=>button.onclick=()=>{adminTab=button.dataset.adminShortcut;renderAdmin();});
}

function renderFinanceBars(title,entries,totalCents) {
  const rows=entries.length?entries.map(([label,data])=>{
    const value=Number(data.revenueCents)||0,width=totalCents>0?Math.max(2,Math.min(100,value/totalCents*100)):0;
    return `<div class="finance-bar-row"><div><span>${htm(label)}</span><strong>${money(value/100)} <small>· ${Number(data.count||0)} venda(s)</small></strong></div><i class="finance-bar-track"><b style="width:${width.toFixed(2)}%"></b></i></div>`;
  }).join(''):'<div class="empty-state">SEM VENDAS NO PERÍODO.</div>';
  return `<section class="finance-panel"><h3>${htm(title)}</h3>${rows}</section>`;
}

function getFinanceSales() {
  if(analyticsFrom&&analyticsTo&&analyticsFrom>analyticsTo)return [];
  const from=analyticsFrom?new Date(`${analyticsFrom}T00:00:00`):null;
  const to=analyticsTo?new Date(`${analyticsTo}T23:59:59.999`):null;
  return orders.filter(order=>{
    if(order.status!=='Concluído'||!order.closedAt)return false;
    const closed=safeDate(order.closedAt);
    return (!from||closed>=from)&&(!to||closed<=to);
  });
}

function exportFinanceCsv(sales) {
  const quote=value=>{let text=String(value??'');if(/^[=+\-@\t\r]/.test(text))text=`'${text}`;return `"${text.replace(/"/g,'""')}"`;};
  const rows=[['Código','Data de encerramento','Cliente','Valor final (R$)','Canal de venda','Forma de pagamento','Parcelas','Valor por parcela (R$)','Parcela final (R$)']];
  for(const order of sales)rows.push([order.confirmationCode||order.id,safeDate(order.closedAt).toLocaleString('pt-BR'),order.customerName,(Number(order.saleTotalCents)/100).toFixed(2),order.salesChannel,order.paymentMethod,order.installmentCount,(Number(order.installmentValueCents)/100).toFixed(2),(Number(order.finalInstallmentValueCents)/100).toFixed(2)]);
  const blob=new Blob(['\uFEFF'+rows.map(row=>row.map(quote).join(';')).join('\r\n')],{type:'text/csv;charset=utf-8'});
  const url=URL.createObjectURL(blob),link=document.createElement('a');link.href=url;link.download=`relatorio-financeiro-${analyticsFrom||'inicio'}-${analyticsTo||'hoje'}.csv`;document.body.append(link);link.click();link.remove();URL.revokeObjectURL(url);
}

function renderFinanceAnalytics(el) {
  const sales=getFinanceSales(),totalCents=sales.reduce((sum,order)=>sum+Number(order.saleTotalCents||0),0),count=sales.length,average=count?totalCents/count:0;
  const payments=new Map(),channels=new Map(),itemsByProduct=new Map();
  const addGroup=(map,key,revenueCents)=>{const current=map.get(key)||{revenueCents:0,count:0};current.revenueCents+=revenueCents;current.count++;map.set(key,current);};
  for(const order of sales){
    const value=Number(order.saleTotalCents||0);addGroup(payments,order.paymentMethod||'Não informado',value);addGroup(channels,order.salesChannel||'Não informado',value);
    const items=order.items||[],base=items.reduce((sum,item)=>sum+Number(item.unitPriceCents||0)*Number(item.quantity||0),0);
    let remaining=value;
    items.forEach((item,index)=>{
      const quantity=Number(item.quantity||0),lineBase=Number(item.unitPriceCents||0)*quantity;
      const allocated=index===items.length-1?remaining:(base>0?Math.round(value*lineBase/base):Math.floor(value/Math.max(1,items.length)));
      remaining-=allocated;
      const key=String(item.productId||item.name||'Produto');
      const current=itemsByProduct.get(key)||{name:item.name||key,quantity:0,revenueCents:0,marginCents:0,costKnown:true};
      current.quantity+=quantity;current.revenueCents+=allocated;
      const product=products.find(candidate=>String(candidate.id)===key);
      if(product?.cost!==null&&product?.cost!==undefined&&Number.isFinite(Number(product.cost)))current.marginCents+=allocated-Math.round(Number(product.cost)*100)*quantity;
      else current.costKnown=false;
      itemsByProduct.set(key,current);
    });
  }
  const paymentEntries=[...payments.entries()].sort((a,b)=>b[1].revenueCents-a[1].revenueCents),channelEntries=[...channels.entries()].sort((a,b)=>b[1].revenueCents-a[1].revenueCents);
  const topProducts=[...itemsByProduct.values()].sort((a,b)=>b.quantity-a.quantity).slice(0,10);
  const productRows=topProducts.map(product=>{const margin=product.costKnown?`${money(product.marginCents/100)}${product.revenueCents?` · ${((product.marginCents/product.revenueCents)*100).toFixed(1)}%`:''}`:'Cadastre o custo atual';return [htm(product.name),String(product.quantity),money(product.revenueCents/100),htm(margin)];});
  el.innerHTML=`<div class="section-kicker">GESTÃO / FINANCEIRO</div><h2>ANÁLISE FINANCEIRA</h2><p>Relatórios de vendas encerradas, valores finais e formas de pagamento.</p><div class="finance-filters"><label>DE <input id="financeFrom" type="date" value="${htm(analyticsFrom)}"></label><label>ATÉ <input id="financeTo" type="date" value="${htm(analyticsTo)}"></label><button id="exportFinanceCsv" class="mini-button primary">BAIXAR RELATÓRIO CSV</button></div><div class="admin-cards finance-summary"><div class="metric"><span>FATURAMENTO NO PERÍODO</span><strong>${money(totalCents/100)}</strong></div><div class="metric"><span>VENDAS ENCERRADAS</span><strong>${count}</strong></div><div class="metric"><span>TICKET MÉDIO</span><strong>${money(average/100)}</strong></div></div><div class="finance-charts">${renderFinanceBars('VENDAS POR FORMA DE PAGAMENTO',paymentEntries,totalCents)}${renderFinanceBars('VENDAS POR CANAL',channelEntries,totalCents)}</div><section class="finance-panel"><h3>PRODUTOS MAIS VENDIDOS E DESEMPENHO</h3>${productRows.length?table(['PRODUTO','UNIDADES','RECEITA ALOCADA','MARGEM ESTIMADA'],productRows):'<div class="empty-state">AS VENDAS ENCERRADAS MOSTRARÃO OS PRODUTOS AQUI.</div>'}<p class="fine-print">A margem usa o custo atual cadastrado no produto, não um custo histórico gravado no pedido. Atualize os custos para melhorar a estimativa.</p></section><section class="finance-panel"><h3>RELATÓRIO DETALHADO DE VENDAS</h3>${sales.length?table(['CÓDIGO','DATA','CLIENTE','VALOR','CANAL','PAGAMENTO'],sales.map(order=>[htm(order.confirmationCode||order.id),safeDate(order.closedAt).toLocaleDateString('pt-BR'),htm(order.customerName),money(Number(order.saleTotalCents)/100),htm(order.salesChannel),htm(order.paymentMethod)])):'<div class="empty-state">NENHUMA VENDA ENCERRADA NESTE PERÍODO.</div>'}</section><p class="fine-print">A tela soma até as 250 solicitações mais recentes carregadas no painel. Use o filtro de datas; o CSV contém as vendas encerradas carregadas nesse mesmo limite.</p>`;
  $('#financeFrom').onchange=event=>{analyticsFrom=event.target.value;renderFinanceAnalytics(el);};
  $('#financeTo').onchange=event=>{analyticsTo=event.target.value;renderFinanceAnalytics(el);};
  $('#exportFinanceCsv').onclick=()=>exportFinanceCsv(sales);
}

renderAdminContent = function() {
  const el=$('#adminContent');if(!el)return;
  if(adminTab==='products')return renderAdminProducts();
  if(adminTab==='orders')return renderAdminOrders();
  if(adminTab==='discounts')return renderAdminBenefits();
  if(adminTab==='customers'){
    el.innerHTML=`<div class="section-kicker">CLIENTES / CONSENTIMENTO</div><h2>CONTAS CADASTRADAS</h2>${customers.length?table(['NOME','E-MAIL','WHATSAPP','OFERTAS','CADASTRO'],customers.map(customer=>[htm(customer.name),htm(customer.email),htm(customer.phone),customer.marketingConsent?'ACEITOU':'NÃO ACEITOU',safeDate(customer.createdAt).toLocaleDateString('pt-BR')])):'<div class="empty-state">NENHUMA CONTA CADASTRADA. RESERVAS DE VISITANTES FICAM NA ABA PEDIDOS.</div>'}`;return;
  }
  if(adminTab==='messages'){
    return renderAdminMessages();
  }
  if(adminTab==='analytics')return renderFinanceAnalytics(el);
  return renderAdminOverview(el);
};

onAuthStateChanged(auth,async user=>{
  if(user?.emailVerified&&!user.isAnonymous){
    try{const saved=await getDoc(doc(db,'customers',user.uid));if(saved.exists())customers=[{...saved.data(),id:user.uid,uid:user.uid}];}catch(error){console.warn('Perfil opcional não carregado:',error);}
    currentUser=profileFor(user);isAdmin=await hasAdminAccess(user);
  }
  else if(user?.isAnonymous){currentUser=profileFor(user);isAdmin=false;}
  else {currentUser=null;isAdmin=false;}
  memberNav();updateCatalogSubscriptions();subscribeUserData(user);
});

$('#accountBtn').onclick=()=>currentUser&&!currentUser.isAnonymous?clientMenu():accountModal('login');
$('#clientMenuBtn').onclick=()=>clientMenu();
$('#vipJoinBtn').onclick=()=>vipForm();
$('#orderStatusBtn').onclick=()=>trackOrder();
$('#contactForm').onsubmit=async event=>{
  event.preventDefault();const form=new FormData(event.currentTarget),name=String(form.get('name')).trim(),email=String(form.get('email')).trim().toLowerCase(),subject=String(form.get('subject')).trim(),message=String(form.get('message')).trim();
  if(name.length<1||name.length>120||!email||message.length<8||message.length>1500)return toast('Confira seu nome, e-mail e mensagem.');
  const button=event.currentTarget.querySelector('button[type="submit"]');button.disabled=true;button.textContent='ENVIANDO…';
  try{let user=auth.currentUser;if(!user)user=(await signInAnonymously(auth)).user;const reference=doc(collection(db,'messages'));await setDoc(reference,{uid:user.uid,name,email,subject:subject.slice(0,100),message,status:'Nova',createdAt:serverTimestamp(),updatedAt:serverTimestamp()});event.currentTarget.reset();toast('Mensagem recebida pela GRAÇA.');}
  catch(error){console.error(error);toast(friendlyFirestoreError(error));}
  finally{button.disabled=false;button.textContent='ENVIAR MENSAGEM ↗';}
};
$('#searchInput').addEventListener('input',renderProducts);
$('#categoryFilter').addEventListener('change',renderProducts);
$('#sortFilter').addEventListener('change',renderProducts);
updateCatalogSubscriptions();
renderProducts();renderCart();memberNav();

