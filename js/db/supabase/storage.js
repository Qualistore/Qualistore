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
    grilleCustom:{}, qualimetreCustom:{}, qualAudits:[],
    nAud:1, nNc:1, nAc:1, nAl:1, nQAud:1
  };
}

function _saveLocal(){
  try{ localStorage.setItem(SK, JSON.stringify(DB)); }catch(e){}
}

function _loadLocal(){
  try{ const r=localStorage.getItem(SK); if(r) return JSON.parse(r); }catch(e){}
  return null;
}

// ── Appelé au démarrage dans init.js ──
async function loadDB(){
  // 1. Charger localStorage immédiatement (affichage instantané)
  const local = _loadLocal();
  if(local) DB = local;

  // 2. Tenter sync Supabase
  try {
    const [users, magasins, audits, ncs, actions, alertes,
           grilleRows, qualAudits, qualRows, counters] = await Promise.all([
      sbSelect('users'), sbSelect('magasins'), sbSelect('audits'),
      sbSelect('ncs'), sbSelect('actions'), sbSelect('alertes'),
      sbSelect('grille_custom'), sbSelect('qual_audits'),
      sbSelect('qualimetre_custom'), sbSelect('counters')
    ]);

    // Reconstruire grilleCustom { [rayon]: data }
    const grilleCustom={};
    (grilleRows||[]).forEach(r=>{ grilleCustom[r.rayon]=r.data; });

    // Reconstruire qualimetreCustom { [mid]: data }
    const qualimetreCustom={};
    (qualRows||[]).forEach(r=>{ qualimetreCustom[r.mid]=r.data; });

    // Reconstruire compteurs
    const cmap={};
    (counters||[]).forEach(c=>{ cmap[c.id]=c.val; });

    DB = {
      users: users||[],
      magasins: magasins||[],
      audits: audits||[],
      ncs: ncs||[],
      actions: actions||[],
      alertes: alertes||[],
      grilleCustom,
      qualimetreCustom,
      qualAudits: qualAudits||[],
      nAud: cmap.nAud||1, nNc: cmap.nNc||1, nAc: cmap.nAc||1,
      nAl: cmap.nAl||1, nQAud: cmap.nQAud||1
    };

    // Si Supabase vide, injecter admin par défaut
    if(!DB.users.length) DB.users = _defaultDB().users;

    _saveLocal();
    console.log('✅ Supabase chargé');
  } catch(e){
    console.warn('⚠️ Supabase inaccessible, mode offline:', e.message);
    _dirty = true;
  }
}

// ── Appelé après chaque modification ──
function save(){
  _saveLocal();
  _pushToSupabase();
}

async function _pushToSupabase(){
  try {
    const grilleRows = Object.entries(DB.grilleCustom).map(([rayon,data])=>({
      id: rayon, rayon, data
    }));
    const qualRows = Object.entries(DB.qualimetreCustom).map(([mid,data])=>({
      id: mid, mid, data
    }));
    const counters = [
      {id:'nAud',val:DB.nAud},{id:'nNc',val:DB.nNc},{id:'nAc',val:DB.nAc},
      {id:'nAl',val:DB.nAl},{id:'nQAud',val:DB.nQAud}
    ];

    await Promise.all([
      sbUpsert('users', DB.users),
      sbUpsert('magasins', DB.magasins),
      sbUpsert('audits', DB.audits),
      sbUpsert('ncs', DB.ncs),
      sbUpsert('actions', DB.actions),
      sbUpsert('alertes', DB.alertes),
      grilleRows.length ? sbUpsert('grille_custom', grilleRows) : Promise.resolve(),
      sbUpsert('qual_audits', DB.qualAudits),
      qualRows.length ? sbUpsert('qualimetre_custom', qualRows) : Promise.resolve(),
      sbUpsert('counters', counters)
    ]);

    _dirty = false;
    console.log('✅ Supabase sync OK');
  } catch(e){
    console.warn('⚠️ Sync Supabase échouée (offline ?):', e.message);
    _dirty = true;
  }
}

window.addEventListener('online', ()=>{
  if(_dirty){ console.log('🔄 Reconnexion — sync Supabase...'); _pushToSupabase(); }
});