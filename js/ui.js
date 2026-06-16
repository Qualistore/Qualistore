// ══════════════ UI — Sidebar, Navigation, Helpers, Modals ══════════════
// Dépend de : storage.js (DB, CU), auth.js (hasPerm)

// ══════════════ SIDEBAR ══════════════
function buildSidebar(){
  const navItems=[
    {sec:'Principal'},
    {id:'dashboard',ic:'ti-dashboard',lb:'Tableau de bord'},
    hasPerm('aud-r')&&{id:'audits',ic:'ti-clipboard-check',lb:'Audits FSQS'},
    hasPerm('aud-w')&&{id:'brouillons',ic:'ti-player-pause',lb:'Brouillons'},
    hasPerm('ac')&&{id:'actions',ic:'ti-tool',lb:'Actions correctives'},
    CU&&CU.role!=='collaborateur'&&{id:'audit-qualimetre',ic:'ti-rosette',lb:'Audit Qualimètre',style:'color:#c4b5fd'},
    {sec:'Analyse'},
    hasPerm('rap')&&{id:'rapports',ic:'ti-file-analytics',lb:'Rapport FSQS'},
    hasPerm('rap')&&{id:'rapport-qualimetre',ic:'ti-gauge',lb:'Rapport Qualimètre',style:'color:#c4b5fd'},
    hasPerm('nc')&&{id:'nc',ic:'ti-alert-triangle',lb:'Non-conformités',bdg:'nc-bdg'},
    {sec:'Paramètres'},
    hasPerm('usr')&&{id:'utilisateurs',ic:'ti-users',lb:'Utilisateurs'},
    hasPerm('grille')&&{id:'grille',ic:'ti-list-check',lb:'Grille d\'audit'},
hasPerm('grille')&&{id:'grille-qualimetre',ic:'ti-adjustments',lb:'Grille Qualimètre',style:'color:#c4b5fd'},
    hasPerm('mag')&&{id:'magasins',ic:'ti-building-store',lb:'Magasins'},
    hasPerm('mag')&&{id:'rayons',ic:'ti-category',lb:'Rayons'},
    CU&&CU.role==='admin'&&{id:'backup',ic:'ti-database-export',lb:'Sauvegarde'},
  ].filter(Boolean);

  const built=navItems.filter(Boolean);
  const cleaned=[];
  for(let i=0;i<built.length;i++){
    if(built[i].sec){
      const hasItems=built.slice(i+1).some(x=>!x.sec);
      if(!hasItems) continue;
      const nextReal=built[i+1];
      if(nextReal&&nextReal.sec) continue;
    }
    cleaned.push(built[i]);
  }

  el('sb-nav').innerHTML=cleaned.map(x=>{
    if(x.sec) return `<div class="nav-sec">${x.sec}</div>`;
    const iStyle=x.style?` style="${x.style}"`:'';
    return `<div class="nav-item" id="nav-${x.id}" onclick="navigate('${x.id}')">`
      +`<i class="ti ${x.ic}"${iStyle}></i> ${x.lb}`
      +(x.bdg?`<span class="nav-badge" id="${x.bdg}">0</span>`:'')+`</div>`;
  }).join('');

  const isCollab=CU&&CU.role==='collaborateur';
  el('hdr-actions').innerHTML = hasPerm('aud-w')
    ? `<button class="btn btn-danger" onclick="openAlertModal()"><i class="ti ti-bell-ringing"></i> Alerte terrain</button><button class="btn btn-primary" onclick="openAuditModal()"><i class="ti ti-plus"></i> Nouvel audit</button>${!isCollab?`<button class="btn btn-primary" style="background:#7c3aed;border-color:#7c3aed" onclick="openQualAuditModal()"><i class="ti ti-clipboard-plus"></i> Nouvel audit Qualimètre</button>`:''}`
    : `<button class="btn btn-danger" onclick="openAlertModal()"><i class="ti ti-bell-ringing"></i> Alerte terrain</button>${!isCollab?`<button class="btn btn-primary" style="background:#7c3aed;border-color:#7c3aed" onclick="openQualAuditModal()"><i class="ti ti-clipboard-plus"></i> Nouvel audit Qualimètre</button>`:''}`;

  const toggle=document.querySelector('.menu-toggle');
  if(toggle) toggle.onclick=()=>{ el('sidebar').classList.toggle('open'); const ov=el('sb-overlay'); if(ov) ov.style.display=el('sidebar').classList.contains('open')?'block':'none'; };
}

function updateSBUser(){
  if(!CU) return;
  const ini=CU.nom.split(' ').map(p=>p[0]).join('').slice(0,2).toUpperCase();
  el('sb-av').textContent=ini;
  el('sb-name').textContent=CU.nom;
const rl={admin:'Administrateur',fsqs:'Auditeur FSQS',directeur:'Directeur',direction:'Direction',collaborateur:'Collaborateur magasin'};
  el('sb-role').textContent=rl[CU.role]||CU.role;
}

// ══════════════ NAVIGATION ══════════════
var PM={
  dashboard:['Tableau de bord','Vue d\'ensemble'], audits:['Audits FSQS','Historique'],
  nc:['Non-conformités','Suivi des écarts'], actions:['Actions correctives','Plan d\'actions'],
  magasins:['Magasins','Gestion du parc'], rayons:['Rayons','Performances'],
  rapports:['Rapport FSQS','Audits & non-conformités FSQS'], utilisateurs:['Utilisateurs','Gestion des accès'],
  grille:['Grille d\'audit','Référentiels'], qualimetre:['Qualimètre','Référentiel par magasin'],
  'audit-qualimetre':['Audit Qualimètre','Parcours client – Œil du client'],
  'rapport-qualimetre':['Rapport Qualimètre','Historique et exports des audits Qualimètre'],
'grille-qualimetre':['Grille Qualimètre','Points de contrôle par zone'],
  brouillons:['Brouillons','Audits en cours de saisie'],
  backup:['Sauvegarde','Export & import des données'],
};
function navigate(pg){
  document.querySelectorAll('.page').forEach(p=>p.classList.remove('active'));
  document.querySelectorAll('.nav-item').forEach(n=>n.classList.remove('active'));
  const p=el('page-'+pg); if(!p) return;
  p.classList.add('active');
  const ni=el('nav-'+pg); if(ni) ni.classList.add('active');
  const m=PM[pg]||[pg,''];
  el('pg-title').textContent=m[0]; el('pg-sub').textContent=m[1];
  if(window.innerWidth<=900){ el('sidebar').classList.remove('open'); const ov=el('sb-overlay'); if(ov) ov.style.display='none'; }
  ({dashboard:renderDash,audits:renderAudits,nc:renderNC,actions:renderActions,
    magasins:renderMag,rayons:renderRay,rapports:renderRap,'rapport-qualimetre':renderRapportQualimetre,
    utilisateurs:renderUsers,
    grille:()=>{ const sel=el('grille-ray-sel'); showGrille(sel?sel.value:'Boucherie'); },
    qualimetre:()=>{ showQualimetre(); },
    'audit-qualimetre':()=>{ renderQualAudits(); },
'grille-qualimetre':()=>{ showGrilleQualimetre(); },
    brouillons:()=>{ renderDrafts(); },
    backup:()=>{},
  })[pg]?.();
}

// ══════════════ HELPERS ══════════════
function fd(d){ if(!d) return '–'; const p=d.split('-'); return `${p[2]}/${p[1]}/${p[0]}`; }
function today(){ return new Date().toISOString().split('T')[0]; }
function sc(s){ return s>=95?'#16a34a':s>=80?'#f59e0b':s>=70?'#ea580c':'#e53935'; }
function scCls(s){ return s>=95?'sg':s>=80?'sy':s>=70?'so':'sr'; }
function pgCls(s){ return s>=95?'fg':s>=80?'fy':s>=70?'fo':'fr'; }
function sbadge(s){ return `<span class="score-badge ${scCls(s)}">${s}%</span>`; }
function overdue(d){ return d&&new Date(d)<new Date(today()); }
function statBdg(s){ const m={'Ouvert':'b-open','Ouverte':'b-open','En cours':'b-prog','Clôturé':'b-done','Clôturée':'b-done','Traitée':'b-done'}; return `<span class="badge ${m[s]||''}">${s}</span>`; }
function critBdg(c){ const m={'Critique':'b-open','Majeure':'b-dir','Mineure':'b-prog'}; return `<span class="badge ${m[c]||''}">${c}</span>`; }
function rIcon(r){ const ic={'Boucherie':'ti-meat','Marée':'ti-fish','Charcuterie':'ti-pig','Fromage':'ti-cheese','Fruits & Légumes':'ti-leaf'}; const cl={'Boucherie':'rayon-boucherie','Marée':'rayon-maree','Charcuterie':'rayon-charcuterie','Fromage':'rayon-fromage','Fruits & Légumes':'rayon-fl'}; return `<span class="rayon-icon ${cl[r]||''}"><i class="ti ${ic[r]||'ti-category'}"></i></span>`; }
function openModal(id){ el(id).classList.add('open'); }
function closeModal(id){ el(id).classList.remove('open'); }
function magScore(mid){ const a=DB.audits.filter(x=>x.mid===mid); return a.length?Math.round(a.reduce((s,x)=>s+x.score,0)/a.length):null; }
function rayScore(r){ const a=DB.audits.filter(x=>x.rayon===r); return a.length?Math.round(a.reduce((s,x)=>s+x.score,0)/a.length):null; }
function pbar(s){ return `<div class="progress-bar" style="margin-top:5px"><div class="progress-fill ${pgCls(s)}" style="width:${s}%"></div></div>`; }

function visibleMids(){
  if(!CU) return [];
  if(CU.role==='admin'||CU.role==='fsqs') return DB.magasins.map(m=>m.id);
  return (CU.magasins||[]);
}
function scopeToUser(list){ const mids=visibleMids(); return list.filter(x=>mids.includes(x.mid)); }