const products=[
 {id:1,name:"Top Manifesto",category:"tops",price:89.90,tag:"NEW DROP",desc:"Uma peça para vestir sua atitude.",art:"MORE YOU",pos:"20% 48%"},
 {id:2,name:"Blusa Frequência",category:"tops",price:119.90,tag:"FAVORITO",desc:"Cor, movimento e personalidade.",art:"GOOD<br>ENERGY",pos:"72% 25%"},
 {id:3,name:"Saia Fora da Curva",category:"bottoms",price:149.90,tag:"EDITORIAL",desc:"Atemporal do seu próprio jeito.",art:"NO<br>RULES",pos:"88% 70%"},
 {id:4,name:"Calça Outra Órbita",category:"bottoms",price:189.90,tag:"LIMITED",desc:"Uma nova perspectiva para o look.",art:"OWN<br>THE<br>DAY",pos:"43% 62%"},
 {id:5,name:"Bolsa Girl Club",category:"acessorios",price:99.90,tag:"GRAÇA CLUB",desc:"Seu novo item de todos os dias.",art:"GIRL<br>CLUB",pos:"8% 80%"},
 {id:6,name:"Lenço Manifesto",category:"acessorios",price:49.90,tag:"SMALL THING",desc:"O detalhe que muda tudo.",art:"MAKE<br>IT YOU",pos:"60% 50%"}
];
let cart=JSON.parse(sessionStorage.getItem("graca-cart")||"[]");
let activeFilter="todos";
const money=v=>v.toLocaleString("pt-BR",{style:"currency",currency:"BRL"});
const grid=document.querySelector("#product-grid");
const toastEl=document.querySelector("#toast");
function toast(msg){toastEl.textContent=msg;toastEl.classList.add("show");setTimeout(()=>toastEl.classList.remove("show"),2400)}
function renderProducts(){
 const q=document.querySelector("#product-search").value.trim().toLowerCase();
 const filtered=products.filter(p=>(activeFilter==="todos"||p.category===activeFilter)&&(`${p.name} ${p.desc}`.toLowerCase().includes(q)));
 grid.innerHTML=filtered.length?filtered.map(p=>`<article class="product-card" data-tilt><div class="product-art" style="--pos:${p.pos}"><span class="product-tag">${p.tag}</span><span class="art-label">${p.art}</span></div><div class="product-info"><div><h3>${p.name}</h3><p>${p.desc}</p></div><span class="product-price">${money(p.price)}</span></div><div class="product-actions"><button class="small-button" data-add="${p.id}">ADICIONAR +</button><button class="small-button" data-detail="${p.id}">DETALHES ↗</button></div></article>`).join(""):`<p>Nenhuma peça encontrada. Tente outra busca.</p>`;
 bindTilt();
}
function saveCart(){sessionStorage.setItem("graca-cart",JSON.stringify(cart));renderCart()}
function addToCart(id){const item=cart.find(x=>x.id===id);item?item.qty++:cart.push({id,qty:1});saveCart();toast("PEÇA ADICIONADA À SACOLA ✳")}
function renderCart(){
 const count=cart.reduce((a,b)=>a+b.qty,0);document.querySelector("#cart-count").textContent=count;
 document.querySelector("#cart-items").innerHTML=cart.length?cart.map(x=>{const p=products.find(y=>y.id===x.id);return `<div class="cart-line"><div><strong>${p.name}</strong><small>${money(p.price)} · ${p.tag}</small></div><div class="qty-controls"><button data-qty="${p.id}" data-delta="-1">−</button><span>${x.qty}</span><button data-qty="${p.id}" data-delta="1">+</button></div></div>`}).join(""):`<p>Sua sacola está esperando por uma peça com a sua cara. ✳</p>`;
 document.querySelector("#cart-total").textContent=money(cart.reduce((a,x)=>a+products.find(p=>p.id===x.id).price*x.qty,0));
}
function showModal(title,body){document.querySelector("#modal-content").innerHTML=`<p class="section-index">GRAÇA / EXPERIÊNCIA</p><h2 id="modal-title">${title}</h2>${body}`;document.querySelector("#modal-backdrop").hidden=false}
function closeModal(){document.querySelector("#modal-backdrop").hidden=true}
function formMarkup(kind){const isContact=kind==="contact";return `<p>${isContact?"Conta pra gente como podemos ajudar.":"Entre para a comunidade e fique por dentro dos próximos drops."}</p><form class="modal-form" data-form="${kind}"><label>SEU NOME<input name="name" required placeholder="Como podemos te chamar?"></label><label>SEU E-MAIL<input name="email" type="email" required placeholder="voce@email.com"></label><label>WHATSAPP<input name="phone" type="tel" placeholder="(00) 00000-0000"></label>${isContact?'<label>MENSAGEM<textarea name="message" rows="3" required placeholder="Escreva sua mensagem..."></textarea></label>':''}<button class="pill-button" type="submit">${isContact?"ENVIAR MENSAGEM":"QUERO FAZER PARTE"} <span>↗</span></button><small class="demo-note">Demonstração visual. O envio será conectado ao Firebase posteriormente.</small></form>`}
document.addEventListener("click",e=>{
 const add=e.target.closest("[data-add]");if(add)addToCart(Number(add.dataset.add));
 const detail=e.target.closest("[data-detail]");if(detail){const p=products.find(x=>x.id===Number(detail.dataset.detail));showModal(p.name,`<p>${p.desc}</p><p><strong>${money(p.price)}</strong></p><form class="modal-form" data-form="detail"><label>TAMANHO<select name="size" required><option value="">Escolha seu tamanho</option><option>PP</option><option>P</option><option>M</option><option>G</option><option>GG</option></select></label><button class="pill-button" type="submit" data-detail-add="${p.id}">ADICIONAR À SACOLA <span>↗</span></button></form>`);document.querySelector("[data-detail-add]").addEventListener("click",()=>{addToCart(p.id);closeModal()})}
 const opener=e.target.closest("[data-open]");if(opener){const type=opener.dataset.open;if(type==="cart"){document.querySelector("#cart-drawer").classList.add("open");document.querySelector("#cart-drawer").setAttribute("aria-hidden","false")}else if(type==="vip"||type==="login"||type==="contact"){showModal(type==="vip"?"ENTRE PARA O GIRL CLUB":type==="login"?"BEM-VINDA DE VOLTA":"FALE COM A GRAÇA",formMarkup(type))}}
 const qty=e.target.closest("[data-qty]");if(qty){const item=cart.find(x=>x.id===Number(qty.dataset.qty));item.qty+=Number(qty.dataset.delta);if(item.qty<=0)cart=cart.filter(x=>x.id!==item.id);saveCart()}
 if(e.target.closest(".modal-close"))closeModal();
 if(e.target.id==="modal-backdrop")closeModal();
 if(e.target.closest(".drawer-close")){document.querySelector("#cart-drawer").classList.remove("open");document.querySelector("#cart-drawer").setAttribute("aria-hidden","true")}
 if(e.target.closest(".checkout-button"))toast(cart.length?"Checkout será habilitado após configurar pagamentos e Firebase.":"Sua sacola está vazia.");
});
document.addEventListener("submit",e=>{const form=e.target.closest("[data-form]");if(!form)return;e.preventDefault();const type=form.dataset.form;toast(type==="contact"?"MENSAGEM DE DEMONSTRAÇÃO REGISTRADA":"CADASTRO DE DEMONSTRAÇÃO RECEBIDO ✳");closeModal();form.reset()});
document.querySelectorAll(".filter").forEach(b=>b.addEventListener("click",()=>{document.querySelectorAll(".filter").forEach(x=>x.classList.remove("active"));b.classList.add("active");activeFilter=b.dataset.filter;renderProducts()}));
document.querySelector("#product-search").addEventListener("input",renderProducts);
document.querySelector(".menu-toggle").addEventListener("click",e=>{const nav=document.querySelector(".main-nav"),open=nav.classList.toggle("open");e.currentTarget.setAttribute("aria-expanded",open)});
document.querySelectorAll(".main-nav a").forEach(a=>a.addEventListener("click",()=>document.querySelector(".main-nav").classList.remove("open")));
document.addEventListener("keydown",e=>{if(e.key==="Escape"){closeModal();document.querySelector("#cart-drawer").classList.remove("open")}});
function bindTilt(){
 if(matchMedia("(prefers-reduced-motion: reduce)").matches||matchMedia("(pointer: coarse)").matches)return;
 document.querySelectorAll("[data-tilt]").forEach(el=>{if(el.dataset.tiltReady)return;el.dataset.tiltReady="1";el.addEventListener("pointermove",e=>{const r=el.getBoundingClientRect(),x=(e.clientX-r.left)/r.width-.5,y=(e.clientY-r.top)/r.height-.5;el.style.transform=`perspective(900px) rotateX(${-y*8}deg) rotateY(${x*9}deg) translateY(-3px)`});el.addEventListener("pointerleave",()=>el.style.transform="")});
}
const observer=new IntersectionObserver(entries=>entries.forEach(e=>{if(e.isIntersecting){e.target.classList.add("visible");observer.unobserve(e.target)}}),{threshold:.12});
document.querySelectorAll("section:not(.hero),.product-card").forEach(el=>{el.classList.add("reveal");observer.observe(el)});
if(!matchMedia("(prefers-reduced-motion: reduce)").matches&&!matchMedia("(pointer: coarse)").matches){
 document.querySelectorAll("[data-float]").forEach((el,i)=>{el.animate([{transform:getComputedStyle(el).transform},{transform:`translate3d(0,${i%2?'-12px':'12px'},0) rotate(${i%2?'-5deg':'5deg'})`},{transform:getComputedStyle(el).transform}],{duration:3500+i*400,iterations:Infinity,direction:"alternate",easing:"ease-in-out"})});
 document.querySelector(".hero").addEventListener("pointermove",e=>{const r=e.currentTarget.getBoundingClientRect(),x=(e.clientX-r.left)/r.width-.5,y=(e.clientY-r.top)/r.height-.5;e.currentTarget.querySelector(".hero-collage").style.transform=`scale(1.06) translate(${x*-12}px,${y*-10}px)`});
}
document.querySelectorAll(".magnetic").forEach(el=>el.addEventListener("pointermove",e=>{if(matchMedia("(pointer: coarse)").matches)return;const r=el.getBoundingClientRect();el.style.transform=`translate(${(e.clientX-r.left-r.width/2)*.08}px,${(e.clientY-r.top-r.height/2)*.12}px)`}));
document.querySelectorAll(".magnetic").forEach(el=>el.addEventListener("pointerleave",()=>el.style.transform=""));
renderProducts();renderCart();
