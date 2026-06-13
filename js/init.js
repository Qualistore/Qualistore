// ══════════════ INIT ══════════════
// Dépend de : storage.js (DB, CU), config.js, ui.js

document.addEventListener('DOMContentLoaded',()=>{
  loadDB();
  buildSidebar();
  updateSBUser();
  navigate('dashboard');
  document.querySelectorAll('.modal-ov').forEach(m=>m.addEventListener('click',e=>{if(e.target===m)m.classList.remove('open');}));
});