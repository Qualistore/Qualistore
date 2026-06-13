// ══════════════ QUALIMETRE ══════════════
// Dépend de : storage.js (DB, CU), config.js, ui.js

// ══════════════ QUALIMÈTRE ══════════════
// Data structure: qualimetreCustom[magasinId][rayon] = [{id,cat,q,p,c}]
function getQualimetrePoints(mid,rayon){
  if(!DB.qualimetreCustom) DB.qualimetreCustom={};
  if(!DB.qualimetreCustom[mid]) return [];
  return (DB.qualimetreCustom[mid][rayon]||[]);
}

function onQualMagChange(){
  // Rebuild the magasin selector options then show current rayon
  showQualimetre();
}

function renderQualimetreNav(){
  // Populate the magasin selector with visible magasins
  const mids=visibleMids();
  const sel=el('qual-mag-sel'); if(!sel) return;
  const cv=sel.value;
  while(sel.options.length>1) sel.remove(1);
  DB.magasins.filter(m=>mids.includes(m.id)).forEach(m=>{
    const o=document.createElement('option'); o.value=m.id; o.textContent=m.nom; sel.appendChild(o);
  });
  // Restore or set default
  if(cv && [...sel.options].some(o=>o.value===cv)) sel.value=cv;
  else if(DB.magasins.filter(m=>mids.includes(m.id)).length) sel.value=DB.magasins.find(m=>mids.includes(m.id)).id;
}

function showQualimetre(){
  renderQualimetreNav();
  const mid=v('qual-mag-sel');
  const rayon=v('qual-ray-sel')||'Boucherie';
  const mag=DB.magasins.find(m=>m.id===mid);

  // Show add button only for admin
  const addBtn=el('btn-add-qual');
  if(addBtn) addBtn.style.display=CU&&CU.role==='admin'&&mid?'':'none';

  if(!mid){
    el('qual-ttl').textContent='–';
    el('qual-body').innerHTML=`<div class="empty-state" style="padding:40px"><i class="ti ti-building-store" style="font-size:40px;color:#ddd8ff"></i><p style="color:var(--text2)">Sélectionnez un magasin pour afficher son Qualimètre.</p></div>`;
    return;
  }

  el('qual-ttl').textContent=(mag?mag.nom:'?')+' – '+rayon;
  const qs=getQualimetrePoints(mid,rayon);

  if(!qs.length){
    el('qual-body').innerHTML=`<div class="empty-state" style="padding:40px">
      <i class="ti ti-gauge" style="font-size:40px;color:#ddd8ff"></i>
      <p style="color:var(--text2)">Aucun point de contrôle pour ${mag?mag.nom:''} – ${rayon}.<br>
      ${CU&&CU.role==='admin'?'Utilisez « Ajouter un point » ou « Importer » pour commencer.':'Les points seront ajoutés par l\'administrateur.'}</p>
    </div>`;
    return;
  }
  const cats=[...new Set(qs.map(q=>q.cat))];
  el('qual-body').innerHTML=cats.map(cat=>{
    const cqs=qs.filter(q=>q.cat===cat);
    return `<div>
      <div style="padding:10px 20px;background:linear-gradient(90deg,#f3e8ff,#ede9fe);font-size:11px;font-weight:600;color:#5b21b6;text-transform:uppercase;letter-spacing:.5px;border-bottom:1px solid #ddd6fe">${cat}</div>
      ${cqs.map(q=>`<div style="display:flex;align-items:center;gap:12px;padding:12px 20px;border-bottom:1px solid var(--border)">
        <div style="flex:1;font-size:13px">${q.q}</div>
        <div style="display:flex;gap:8px;align-items:center;flex-shrink:0">
          ${critBdg(q.c)}
          <span class="tsm tm">Poids : <strong>${q.p}</strong></span>
          ${CU&&CU.role==='admin'?`<button class="btn btn-secondary btn-sm" onclick="openQualCtrlModal('${mid}','${rayon}','${q.id}')"><i class="ti ti-pencil"></i></button><button class="btn btn-danger btn-sm" onclick="delQualCtrl('${mid}','${rayon}','${q.id}')"><i class="ti ti-trash"></i></button>`:''}
        </div>
      </div>`).join('')}
    </div>`;
  }).join('');
}

function openQualCtrlModal(mid, rayon, qid){
  const m=mid||v('qual-mag-sel');
  const r=rayon||v('qual-ray-sel')||'Boucherie';
  const isEdit=!!qid;
  el('m-qual-ctrl-ttl').innerHTML=isEdit?'<i class="ti ti-pencil" style="color:#7c3aed"></i> Modifier le point Qualimètre':'<i class="ti ti-gauge" style="color:#7c3aed"></i> Nouveau point Qualimètre';
  el('qual-ctrl-err').classList.remove('show');
  sv('qc-id',qid||'');
  sv('qc-mid',m);
  el('qc-rayon').value=r;
  if(isEdit){
    const q=getQualimetrePoints(m,r).find(x=>x.id===qid); if(!q) return;
    sv('qc-q',q.q); sv('qc-cat',q.cat); el('qc-crit').value=q.c; sv('qc-poids',q.p);
  } else {
    sv('qc-q',''); sv('qc-cat',''); el('qc-crit').value='Majeure'; sv('qc-poids','');
  }
  openModal('m-qual-ctrl');
}

function saveQualCtrl(){
  const mid=v('qc-mid');
  const rayon=el('qc-rayon').value;
  const q=v('qc-q').trim(), cat=v('qc-cat').trim()||'Général', crit=el('qc-crit').value;
  const err=el('qual-ctrl-err');
  if(!q){ err.textContent='L\'intitulé est requis.'; err.classList.add('show'); return; }
  const defP={'Critique':10,'Majeure':5,'Mineure':2};
  const poids=parseInt(v('qc-poids'))||defP[crit];
  if(!DB.qualimetreCustom) DB.qualimetreCustom={};
  if(!DB.qualimetreCustom[mid]) DB.qualimetreCustom[mid]={};
  if(!DB.qualimetreCustom[mid][rayon]) DB.qualimetreCustom[mid][rayon]=[];
  const existId=v('qc-id');
  if(existId){
    const idx=DB.qualimetreCustom[mid][rayon].findIndex(x=>x.id===existId);
    if(idx>=0) DB.qualimetreCustom[mid][rayon][idx]={id:existId,cat,q,p:poids,c:crit};
  } else {
    DB.qualimetreCustom[mid][rayon].push({id:'qc-'+uid(),cat,q,p:poids,c:crit});
  }
  save(); closeModal('m-qual-ctrl');
  // Refresh view
  const magSel=el('qual-mag-sel'); if(magSel) magSel.value=mid;
  const raySel=el('qual-ray-sel'); if(raySel) raySel.value=rayon;
  showQualimetre();
}

function delQualCtrl(mid,rayon,qid){
  if(!confirm('Supprimer ce point du Qualimètre ?')) return;
  if(!DB.qualimetreCustom||!DB.qualimetreCustom[mid]) return;
  DB.qualimetreCustom[mid][rayon]=(DB.qualimetreCustom[mid][rayon]||[]).filter(x=>x.id!==qid);
  save(); showQualimetre();
}