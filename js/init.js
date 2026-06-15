// ══════════════ INIT ══════════════
// Dépend de : storage.js (DB, CU), config.js, ui.js

document.addEventListener('DOMContentLoaded', async ()=>{
  // Afficher un écran de chargement
  const loader = document.getElementById('login-screen');

  try {
    await loadDB();
  } catch(e) {
    console.warn('loadDB error:', e);
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