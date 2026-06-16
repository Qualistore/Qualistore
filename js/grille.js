// ══════════════ GRILLE ══════════════
function getGrille(rayon){
  const custom=(DB.grilleCustom[rayon]||[]);
  return [...GRILLE_BASE_COMMUNE,...custom];
}

function showGrille(r){
  el('grille-ttl').textContent=r;
  if(el('btn-add-ctrl')) el('btn-add-ctrl').style.display=CU&&CU.role==='admin'?'':'none';
  const qs=getGrille(r); const cats=[...new Set(qs.map(q=>q.cat))];
  el('grille-body').innerHTML=cats.map(cat=>{
    const cqs=qs.filter(q=>q.cat===cat);
    return `<div><div style="padding:10px 20px;background:var(--bg);font-size:11px;font-weight:600;color:var(--text2);text-transform:uppercase;letter-spacing:.5px;border-bottom:1px solid var(--border)">${cat}</div>
    ${cqs.map(q=>{
      const isCustom=!GRILLE_BASE_COMMUNE.find(x=>x.id===q.id);
      return `<div style="display:flex;align-items:flex-start;gap:12px;padding:12px 20px;border-bottom:1px solid var(--border)${isCustom?';background:#f8f0ff':''}">
        <div style="flex:1">
          <div style="font-size:13px">${q.q}${isCustom?` <span class="badge" style="background:#ede9fe;color:#5b21b6;margin-left:4px">Personnalisé</span>`:''}</div>
          ${q.prec?`<div style="font-size:11px;color:var(--text2);margin-top:3px;font-style:italic">${q.prec}</div>`:''}
        </div>
        <div style="display:flex;gap:8px;align-items:center;flex-shrink:0">
          ${critBdg(q.c)}<span class="tsm tm" style="white-space:nowrap">Poids : <strong>${q.p}</strong></span>
          ${isCustom&&CU&&CU.role==='admin'?`<button class="btn btn-secondary btn-sm" onclick="openCtrlModal('${r}','${q.id}')"><i class="ti ti-pencil"></i></button><button class="btn btn-danger btn-sm" onclick="delCtrl('${r}','${q.id}')"><i class="ti ti-trash"></i></button>`:''}
        </div>
      </div>`;
    }).join('')}
    </div>`;
  }).join('');
}

let ctrlRayonCurrent='Boucherie';
function openCtrlModal(rayon,qid){
  ctrlRayonCurrent=rayon||el('grille-ray-sel').value||'Boucherie';
  const isEdit=!!qid;
  el('m-ctrl-ttl').innerHTML=isEdit?'<i class="ti ti-pencil" style="color:var(--primary)"></i> Modifier le point de contrôle':'<i class="ti ti-list-check" style="color:var(--primary)"></i> Nouveau point de contrôle';
  el('ctrl-err').classList.remove('show');
  sv('ctrl-id',qid||'');
  // Cocher le rayon courant par défaut
  document.querySelectorAll('.ctrl-ray-cb').forEach(cb=>{ cb.checked=cb.value===ctrlRayonCurrent; });
  if(isEdit){
    const q=(DB.grilleCustom[rayon]||[]).find(x=>x.id===qid); if(!q) return;
    sv('ctrl-q',q.q); sv('ctrl-cat',q.cat||''); sv('ctrl-prec',q.prec||'');
    el('ctrl-crit').value=q.c; sv('ctrl-poids',q.p);
    // Déduire la section depuis la cat
    const sec=q.cat?q.cat.split(' – ')[0]:'Stockage';
    el('ctrl-section').value=['Stockage','Vente trad.','Libre-service'].includes(sec)?sec:'Stockage';
  } else {
    sv('ctrl-q',''); sv('ctrl-cat',''); sv('ctrl-prec','');
    el('ctrl-crit').value='Majeure'; sv('ctrl-poids','');
    el('ctrl-section').value='Stockage';
  }
  openModal('m-ctrl');
}

function saveCtrl(){
  const rayons=[...document.querySelectorAll('.ctrl-ray-cb:checked')].map(cb=>cb.value);
  const q=v('ctrl-q').trim(), cat=v('ctrl-cat').trim(), prec=v('ctrl-prec').trim();
  const section=el('ctrl-section').value;
  const fullCat=section+(cat?' – '+cat:'');
  const crit=el('ctrl-crit').value;
  const err=el('ctrl-err');
  if(!q){ err.textContent='L\'intitulé est requis.'; err.classList.add('show'); return; }
  if(!rayons.length){ err.textContent='Sélectionnez au moins un rayon.'; err.classList.add('show'); return; }
  const defPoids={'Critique':10,'Majeure':5,'Mineure':2};
  const poids=parseInt(v('ctrl-poids'))||defPoids[crit];
  const existId=v('ctrl-id');
  rayons.forEach(rayon=>{
    if(!DB.grilleCustom[rayon]) DB.grilleCustom[rayon]=[];
    if(existId&&rayon===ctrlRayonCurrent){
      const idx=DB.grilleCustom[rayon].findIndex(x=>x.id===existId);
      if(idx>=0) DB.grilleCustom[rayon][idx]={id:existId,cat:fullCat,q,p:poids,c:crit,prec};
    } else {
      DB.grilleCustom[rayon].push({id:'cust-'+uid(),cat:fullCat,q,p:poids,c:crit,prec});
    }
  });
  save(); closeModal('m-ctrl');
  const currentRay=el('grille-ray-sel').value||ctrlRayonCurrent;
  showGrille(currentRay);
}

function delCtrl(rayon,qid){
  if(!confirm('Supprimer ce point de contrôle personnalisé ?')) return;
  DB.grilleCustom[rayon]=(DB.grilleCustom[rayon]||[]).filter(x=>x.id!==qid);
  save(); showGrille(rayon);
}