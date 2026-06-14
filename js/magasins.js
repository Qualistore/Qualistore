// ══════════════ MAGASINS ══════════════
// Dépend de : storage.js (DB, CU), auth.js (hasPerm), ui.js

// ══════════════ MAGASINS ══════════════
function renderMag(){
  const mids=visibleMids();
  const myMags=DB.magasins.filter(m=>mids.includes(m.id));
  const g=el('mag-grid'), emp=el('mag-empty');
  const can=hasPerm('mag');
  el('btn-add-mag').style.display=can?'':'none';
  el('mag-cnt').textContent=myMags.length+' magasin(s)';
  if(!myMags.length){ g.innerHTML=''; emp.style.display=''; return; }
  emp.style.display='none';
  g.innerHTML=myMags.map(m=>{
    const s=magScore(m.id); const acnt=DB.audits.filter(a=>a.mid===m.id).length;
    const nco=DB.ncs.filter(n=>n.mid===m.id&&n.statut==='Ouverte').length;
    const dir=DB.users.find(u=>u.id===m.did);
    return `<div class="card">
      <div class="card-hdr">
        <div style="flex:1"><div style="font-size:14px;font-weight:600">${m.nom}</div><div class="tsm tm" style="margin-top:2px">${m.enseigne||''}${m.ville?' · '+m.ville:''}</div></div>
        <span class="badge ${m.statut==='actif'?'b-done':'b-open'}">${m.statut}</span>
      </div>
      <div class="card-body">
        ${m.adr?`<div class="tsm tm" style="margin-bottom:10px"><i class="ti ti-map-pin"></i> ${m.adr}</div>`:''}
        <div style="font-size:12px;margin-bottom:12px"><i class="ti ti-user" style="color:var(--primary)"></i> ${dir?dir.nom:'<span class="tm">Non assigné</span>'}</div>
        <div style="display:flex;justify-content:space-around;margin-bottom:14px">
          <div style="text-align:center"><div style="font-size:20px;font-weight:700;color:${s!==null?sc(s):'var(--text3)'}">${s!==null?s+'%':'–'}</div><div class="tsm tm">Score</div></div>
          <div style="text-align:center"><div style="font-size:20px;font-weight:700;color:var(--primary)">${acnt}</div><div class="tsm tm">Audits</div></div>
          <div style="text-align:center"><div style="font-size:20px;font-weight:700;color:${nco>0?'var(--danger)':'var(--success)'}">${nco}</div><div class="tsm tm">NC ouvertes</div></div>
        </div>
        ${s!==null?pbar(s):''}
        ${can?`<div style="display:flex;gap:8px;margin-top:14px">
          <button class="btn btn-secondary btn-sm" style="flex:1" onclick="openMagModal('${m.id}')"><i class="ti ti-pencil"></i> Modifier</button>
          <button class="btn btn-danger btn-sm" onclick="confirmDel('mag','${m.id}','${m.nom.replace(/'/g,"\\'")}')" ><i class="ti ti-trash"></i></button>
        </div>`:''}
      </div>
    </div>`;
  }).join('');
}

function openMagModal(id){
  const isEdit=!!id;
  el('m-mag-ttl').innerHTML=isEdit?'<i class="ti ti-building-store" style="color:var(--primary)"></i> Modifier le magasin':'<i class="ti ti-building-store" style="color:var(--primary)"></i> Nouveau magasin';
  el('mag-err').classList.remove('show');
  const ds=el('m-dir'); ds.innerHTML='<option value="">– Non assigné –</option>'+DB.users.filter(u=>u.role==='directeur'&&u.statut==='actif').map(u=>`<option value="${u.id}">${u.nom}</option>`).join('');
  if(isEdit){
    const m=DB.magasins.find(x=>x.id===id); if(!m) return;
    sv('m-id',m.id); sv('m-nom',m.nom); el('m-enseigne').value=m.enseigne||''; sv('m-ville',m.ville||''); sv('m-adr',m.adr||''); el('m-statut').value=m.statut; ds.value=m.did||'';
  } else {
    ['m-id','m-nom','m-ville','m-adr'].forEach(i=>sv(i,'')); el('m-enseigne').value=''; el('m-statut').value='actif';
  }
  openModal('m-mag');
}
function saveMag(){
  const nom=v('m-nom').trim(), ville=v('m-ville').trim();
  const err=el('mag-err');
  if(!nom||!ville){ err.textContent='Nom et ville sont requis.'; err.classList.add('show'); return; }
  const id=v('m-id');
  const data={ nom, ville, enseigne:v('m-enseigne'), adr:v('m-adr').trim(), statut:el('m-statut').value, did:el('m-dir').value||null };
  if(id){ Object.assign(DB.magasins.find(x=>x.id===id),data); }
  else { DB.magasins.push({id:uid(),...data}); }
  save(); closeModal('m-mag'); renderMag();
}
function confirmDel(type, id, nom){
  el('conf-msg').textContent='Supprimer "'+nom+'" ?';
  el('conf-detail').textContent='';
  el('conf-ok').onclick=()=>{
    closeModal('m-confirm');
    if(type==='mag'){
      DB.magasins=DB.magasins.filter(m=>m.id!==id);
      save(); renderMag();
    } else if(type==='user'){
      DB.users=DB.users.filter(u=>u.id!==id);
      save(); renderUsers();
} else if(type==='alert'){
      DB.alertes=DB.alertes.filter(a=>a.id!==id);
      save(); renderDash();
    } else if(type==='nc'){
      DB.actions=DB.actions.filter(a=>a.ncId!==id);
      DB.ncs=DB.ncs.filter(n=>n.id!==id);
      save(); renderNC();
        }
  };
  openModal('m-confirm');
}