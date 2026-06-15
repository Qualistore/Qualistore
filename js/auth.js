// ══════════════ AUTH ══════════════
// Dépend de : storage.js (DB, CU), ui.js (buildSidebar, updateSBUser, navigate)

const SESSION_TIMEOUT = 10 * 60 * 1000; // 10 minutes
let _sessionTimer = null;

function _resetSessionTimer(){
  if(_sessionTimer) clearTimeout(_sessionTimer);
  _sessionTimer = setTimeout(()=>{
    doLogout();
    showToast('Session expirée — veuillez vous reconnecter.','warning');
  }, SESSION_TIMEOUT);
  localStorage.setItem('fsqs_last_activity', Date.now());
}

function _checkSessionOnLoad(){
  const last = parseInt(localStorage.getItem('fsqs_last_activity')||'0');
  if(last && Date.now() - last > SESSION_TIMEOUT){
    localStorage.removeItem('fsqs_cu');
    localStorage.removeItem('fsqs_last_activity');
    CU = null;
  }
}

function doLogin(){
  const l=v('f-login'), p=v('f-pass');
  const u=DB.users.find(x=>x.login===l&&x.pwd===btoa(p)&&x.statut==='actif');
  if(!u){ document.getElementById('login-err').classList.add('show'); return; }
  document.getElementById('login-err').classList.remove('show');
  CU=u;
  localStorage.setItem('fsqs_cu', JSON.stringify(u));
  _resetSessionTimer();
  document.getElementById('login-screen').style.display='none';
  document.getElementById('app').classList.add('on');
  buildSidebar(); updateSBUser(); navigate('dashboard');
}

function doLogout(){
  if(_sessionTimer) clearTimeout(_sessionTimer);
  CU=null;
  localStorage.removeItem('fsqs_cu');
  localStorage.removeItem('fsqs_last_activity');
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