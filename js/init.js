// ══════════════ INIT ══════════════
document.addEventListener('DOMContentLoaded', async ()=>{
  // Vider le cache de l'appli (JS/CSS) à chaque ouverture
  if('caches' in window){
    caches.keys().then(keys=>keys.forEach(k=>caches.delete(k)));
  }
  try { await loadDB(); } catch(e){ console.warn('loadDB error:', e); }
  _checkSessionOnLoad();
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
      else if(m.id==='m-qual-audit'&&qaStep===2) pauseQualAudit();
      else m.classList.remove('open');
    }
  }));
window.addEventListener('beforeunload', ()=>{
    if(auditStep===1) pauseAudit();
    else if(qaStep===2) pauseQualAudit();
  });
  ['click','keydown','touchstart','mousemove'].forEach(e=>
    document.addEventListener(e, ()=>{ if(CU) _resetSessionTimer(); }, {passive:true})
  );
});
