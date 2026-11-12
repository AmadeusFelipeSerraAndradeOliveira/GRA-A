import app from './firebase.js';
import { applyActionCode, confirmPasswordReset, getAuth, verifyPasswordResetCode } from 'https://www.gstatic.com/firebasejs/13.1.0/firebase-auth.js';

const auth=getAuth(app);
const params=new URLSearchParams(location.search);
const mode=params.get('mode')||'';
const actionCode=params.get('oobCode')||'';
const message=document.querySelector('#actionMessage');
const title=document.querySelector('#actionTitle');
const resetForm=document.querySelector('#resetForm');
const actionLink=document.querySelector('#actionLink');
const paramsWithoutAction=new URL(location.href);
for(const key of ['mode','oobCode','apiKey','continueUrl','lang'])paramsWithoutAction.searchParams.delete(key);
history.replaceState(null,'',paramsWithoutAction.pathname+paramsWithoutAction.search+paramsWithoutAction.hash);

auth.languageCode='pt-BR';
const home=new URL('/',location.origin);
function showLink(label,verified=false){
  actionLink.textContent=label;
  if(verified)home.searchParams.set('emailVerified','1');
  actionLink.href=home.pathname+home.search;
  actionLink.hidden=false;
}
function showError(){
  title.textContent='Este link não está disponível.';
  message.textContent='O link pode ter expirado ou já ter sido usado. Volte ao site e solicite um novo e-mail de confirmação ou recuperação.';
  resetForm.hidden=true;
  showLink('VOLTAR À GRAÇA');
}

async function runAction(){
  if(!actionCode||!mode){showError();return;}
  try{
    if(mode==='verifyEmail'||mode==='recoverEmail'||mode==='verifyAndChangeEmail'){
      await applyActionCode(auth,actionCode);
      title.textContent=mode==='verifyEmail'?'Seu e-mail foi confirmado!':'Sua solicitação foi concluída.';
      message.textContent=mode==='verifyEmail'?'Agora entre na sua conta para acessar a Comunidade VIP e os benefícios da GRAÇA.':'A alteração foi confirmada com segurança. Você já pode voltar ao site.';
      showLink(mode==='verifyEmail'?'ENTRAR NA MINHA CONTA':'VOLTAR À GRAÇA',mode==='verifyEmail');
      return;
    }
    if(mode==='resetPassword'){
      await verifyPasswordResetCode(auth,actionCode);
      title.textContent='Crie uma nova senha.';
      message.textContent='Escolha uma senha nova com pelo menos 12 caracteres. Este link é de uso único.';
      resetForm.hidden=false;
      return;
    }
    showError();
  }catch{
    showError();
  }
}

resetForm.addEventListener('submit',async event=>{
  event.preventDefault();
  const password=String(new FormData(resetForm).get('newPassword')||'');
  const confirmation=String(new FormData(resetForm).get('confirmPassword')||'');
  if(password.length<12||password.length>128){message.textContent='Use uma senha entre 12 e 128 caracteres.';return;}
  if(password!==confirmation){message.textContent='As senhas não correspondem. Confira os dois campos.';return;}
  const button=resetForm.querySelector('button[type="submit"]');
  button.disabled=true;button.textContent='SALVANDO…';
  try{
    await confirmPasswordReset(auth,actionCode,password);
    resetForm.hidden=true;
    title.textContent='Senha atualizada.';
    message.textContent='Sua senha foi alterada com segurança. Agora você pode entrar na sua conta da GRAÇA.';
    showLink('VOLTAR PARA ENTRAR');
  }catch{
    showError();
  }finally{
    button.disabled=false;button.textContent='SALVAR NOVA SENHA';
  }
});

void runAction();

