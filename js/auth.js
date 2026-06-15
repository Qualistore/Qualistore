// ══════════════ AUTH ══════════════
// Dépend de : storage.js (DB, CU), ui.js (buildSidebar, updateSBUser, navigate)

function doLogin(){
  const l=v('f-login'), p=v('f-pass');
  const u=DB.users.find(x=>x.login===l&&x.pwd===btoa(p)&&x.statut==='actif');
  if(!u){ document.getElementById('login-err').classList.add('show'); return; }
  document.getElementById('login-err').classList.remove('show');
  CU=u;
  localStorage.setItem('fsqs_cu', JSON.stringify(u));
  document.getElementById('login-screen').style.display='none';
  document.getElementById('app').classList.add('on');
  buildSidebar(); updateSBUser(); navigate('dashboard');
}
function doLogout(){
  CU=null;
  localStorage.removeItem('fsqs_cu');
  document.getElementById('app').classList.remove('on');
  document.getElementById('login-screen').style.display='';
  sv('f-login',''); sv('f-pass','');
}
function hasPerm(p){ return CU&&(CU.role==='admin'||CU.perms[p]); }
function togglePass(id,btn){
  const i=document.getElementById(id);
  i.type=i.type==='password'?'text':'password';
  btn.innerHTML=i.type==='password'?'<i class="ti ti-eye"></i>':'<i class="ti ti-eye-off"></i>';
}
function v(id){ return document.getElementById(id).value; }
function sv(id,val){ document.getElementById(id).value=val; }
function el(id){ return document.getElementById(id); }