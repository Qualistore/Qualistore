// ══════════════ STORAGE — moteur Supabase + localStorage cache ══════════════
// Dépend de : config.js (SK), services/supabase.js

function uid(){ return Date.now().toString(36)+Math.random().toString(36).slice(2,6); }

let DB = _defaultDB();
let CU = null;
let _dirty = false;

function _defaultDB(){
  return {
    users:[{id:'admin1',nom:'Administrateur',login:'admin',pwd:btoa('admin'),role:'admin',statut:'actif',magasins:[],
      perms:{'aud-r':1,'aud-w':1,'nc':1,'ac':1,'mag':1,'rap':1,'grille':1,'usr':1}}],
    magasins:[], audits:[], ncs:[], actions:[], alertes:[],
    grilleCustom:{}, qualimetreCustom:{}, qualAudits:[], drafts:[]
  };
}

function _saveLocal(){
  try{ localStorage.setItem(SK, JSON.stringify(DB)); }catch(e){}
}

function _loadLocal(){
  try{ const r=localStorage.getItem(SK); if(r) return JSON.parse(r); }catch(e){}
  return null;
}

async function loadDB(){
  const local=_loadLocal();
  if(local) DB=local;
  try {
    const [users,magasins,audits,ncs,actions,alertes,
           grilleRows,qualAudits,qualRows,drafts] = await Promise.all([
      sbSelect('users'), sbSelect('magasins'), sbSelect('audits'),
      sbSelect('ncs'), sbSelect('actions'), sbSelect('alertes'),
      sbSelect('grille_custom'), sbSelect('qual_audits'),
      sbSelect('qualimetre_custom'), sbSelect('drafts')
    ]);
    const grilleCustom={};
    (grilleRows||[]).forEach(r=>{ grilleCustom[r.rayon]=r.data; });
    const qualimetreCustom={};
    (qualRows||[]).forEach(r=>{ qualimetreCustom[r.mid]=r.data; });
    DB={
      users: users||[], magasins: magasins||[],
      audits: audits||[], ncs: ncs||[],
      actions: actions||[], alertes: alertes||[],
      grilleCustom, qualimetreCustom, qualAudits: qualAudits||[],
      drafts: drafts||[],
    };
    if(!DB.users.length) DB.users=_defaultDB().users;
    _saveLocal();
    console.log('✅ Supabase chargé');
    const savedCU=localStorage.getItem('fsqs_cu');
    if(savedCU) CU=JSON.parse(savedCU);
  } catch(e){
    console.warn('⚠️ Supabase inaccessible, mode offline:', e.message);
    _dirty=true;
  }
}

// ── save(tables) — ne pousse que les tables modifiées ──
function save(tables){
  _saveLocal();
  _pushToSupabase(tables);
}

async function _pushToSupabase(tables){
  // Si pas de tables spécifiées, on pousse tout
  const all=!tables;
  try {
    const ops=[];
    if(all||tables.includes('users'))    ops.push(sbUpsert('users', DB.users));
    if(all||tables.includes('magasins')) ops.push(sbUpsert('magasins', DB.magasins));
    if(all||tables.includes('audits'))   ops.push(sbUpsert('audits', DB.audits));
    if(all||tables.includes('ncs'))      ops.push(sbUpsert('ncs', DB.ncs));
    if(all||tables.includes('actions'))  ops.push(sbUpsert('actions', DB.actions));
    if(all||tables.includes('alertes'))  ops.push(sbUpsert('alertes', DB.alertes));
    if(all||tables.includes('qualAudits')) ops.push(sbUpsert('qual_audits', DB.qualAudits));
    if(all||tables.includes('drafts')) ops.push(sbUpsert('drafts', DB.drafts));
    if(all||tables.includes('grilleCustom')){
      const rows=Object.entries(DB.grilleCustom).map(([rayon,data])=>({id:rayon,rayon,data}));
      if(rows.length) ops.push(sbUpsert('grille_custom', rows));
    }
    if(all||tables.includes('qualimetreCustom')){
      const rows=Object.entries(DB.qualimetreCustom).map(([mid,data])=>({id:mid,mid,data}));
      if(rows.length) ops.push(sbUpsert('qualimetre_custom', rows));
    }
    await Promise.all(ops);
    _dirty=false;
    console.log('✅ Supabase sync OK');
  } catch(e){
    console.warn('⚠️ Sync Supabase échouée:', e.message);
    _dirty=true;
  }
}

// ── Polling toutes les 30s pour voir les données des autres sessions ──
setInterval(async ()=>{
  if(!CU) return;
  try {
    const [audits,ncs,actions,alertes,qualAudits,drafts] = await Promise.all([
      sbSelect('audits'), sbSelect('ncs'), sbSelect('actions'),
      sbSelect('alertes'), sbSelect('qual_audits'), sbSelect('drafts')
    ]);
    const changed=
      JSON.stringify(audits)!==JSON.stringify(DB.audits)||
      JSON.stringify(ncs)!==JSON.stringify(DB.ncs)||
      JSON.stringify(actions)!==JSON.stringify(DB.actions)||
      JSON.stringify(alertes)!==JSON.stringify(DB.alertes)||
      JSON.stringify(qualAudits)!==JSON.stringify(DB.qualAudits);
    if(!changed) return;
    DB.audits=audits||[];
    DB.ncs=ncs||[];
    DB.actions=actions||[];
    DB.alertes=alertes||[];
    DB.qualAudits=qualAudits||[];
    DB.drafts=drafts||[];
    _saveLocal();
    const active=document.querySelector('.page.active');
    if(active){
      const page=active.id.replace('page-','');
      if(page==='audits') renderAudits();
      else if(page==='nc') renderNC();
      else if(page==='actions') renderActions();
      else if(page==='dashboard') renderDash();
      else if(page==='audit-qualimetre') renderQualAudits();
    }
  } catch(e){}
}, 5000);

window.addEventListener('online', ()=>{
  if(_dirty){ console.log('🔄 Reconnexion — sync Supabase...'); _pushToSupabase(); }
});