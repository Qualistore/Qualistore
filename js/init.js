// ══════════════ INIT ══════════════
document.addEventListener('DOMContentLoaded', async ()=>{
  try { await loadDB(); } catch(e){ console.warn('loadDB error:', e); }

  if(CU){
    document.getElementById('login-screen').style.display='none';
    document.getElementById('app').classList.add('on');
  }

  buildSidebar();
  updateSBUser();
  navigate('dashboard');
  document.querySelectorAll('.modal-ov').forEach(m=>m.addEventListener('click',e=>{
    if(e.target===m){
      if(m.id==='m-audit'&&auditStep===1) pauseAudit();
      else m.classList.remove('open');
    }
  }));
});