// ══════════════ ALERTES ══════════════
// Dépend de : storage.js (DB, CU), auth.js (hasPerm), ui.js

// ══════════════ ALERTES ══════════════
let alertPhotosB64=[];
function openAlertModal(){
  el('al-err').classList.remove('show');
  ['al-titre','al-cmt'].forEach(i=>sv(i,''));
  sv('al-signale',CU?CU.nom:'');
  el('al-type').value=''; el('al-gravite').value='';
  alertPhotosB64=[]; renderAlertPhotoPrev();
  // Populate magasin
  const mids=visibleMids();
  const msel=el('al-mag');
  msel.innerHTML='<option value="">Sélectionner...</option>'+DB.magasins.filter(m=>mids.includes(m.id)&&m.statut==='actif').map(m=>`<option value="${m.id}">${m.nom}</option>`).join('');
  openModal('m-alert');
}
function saveAlert(){
  const mid=v('al-mag'), titre=v('al-titre').trim(), type=v('al-type'), grav=v('al-gravite'), sig=v('al-signale').trim();
  const err=el('al-err');
  if(!mid||!titre||!type||!grav||!sig){ err.textContent='Magasin, titre, type, gravité et signataire sont requis.'; err.classList.add('show'); return; }
  if(!DB.alertes) DB.alertes=[];
  const mag=DB.magasins.find(m=>m.id===mid)||{};
  const alId='AL-'+uid();
  DB.alertes.push({ id:alId, mid, mag:mag.nom||'', titre, type, gravite:grav, signale:sig, cmt:v('al-cmt'), photos:[...alertPhotosB64], date:today(), statut:'Active' });
  const critMap={'Critique':'Critique','Majeure':'Majeure','Mineure':'Mineure'};
  const ncCrit=critMap[grav]||'Majeure';
  const days={'Critique':3,'Majeure':7,'Mineure':14};
  const dl=new Date(Date.now()+days[ncCrit]*86400000).toISOString().split('T')[0];
  const ncId='NC-'+uid();
  DB.ncs.push({ id:ncId, mid, mag:mag.nom||'', rayon:type, date:today(),
    desc:'[Alerte '+type+'] '+titre+(v('al-cmt')?' — '+v('al-cmt'):''),
    crit:ncCrit, resp:sig, dl, statut:'Ouverte', aid:alId, isAlert:true });
  const acId='AC-'+uid();
  DB.actions.push({ id:acId, ncId, desc:'Traiter l\'alerte : '+titre, mag:mag.nom||'', resp:sig, ech:dl, prio:ncCrit, statut:'Ouverte', alertId:alId });
  save(); closeModal('m-alert'); alertPhotosB64=[];
  const nb=el('nc-bdg'); if(nb) nb.textContent=DB.ncs.filter(x=>x.statut==='Ouverte').length;
  renderDash();
}
async function handleAlertPhotos(input){
  const files=[...input.files];
  for(const f of files){
    const path='alertes/'+uid()+'-'+f.name.replace(/[^a-zA-Z0-9._-]/g,'_');
    const url=await sbUploadPhoto(f, path);
    if(url){ alertPhotosB64.push(url); renderAlertPhotoPrev(); }
    else {
      // Fallback base64 si offline
      const r=new FileReader();
      r.onload=e=>{ alertPhotosB64.push(e.target.result); renderAlertPhotoPrev(); };
      r.readAsDataURL(f);
    }
  }
  input.value='';
}
function renderAlertPhotoPrev(){
  const p=el('al-photos-prev');
  p.innerHTML=alertPhotosB64.map((b,i)=>`<div style="position:relative;display:inline-block">
    <img class="photo-thumb" src="${b}" alt="photo">
    <button onclick="alertPhotosB64.splice(${i},1);renderAlertPhotoPrev()" style="position:absolute;top:-4px;right:-4px;background:#e53935;color:#fff;border:none;border-radius:50%;width:18px;height:18px;font-size:11px;cursor:pointer;line-height:1;display:flex;align-items:center;justify-content:center">&times;</button>
  </div>`).join('')
  +`<div class="photo-add" onclick="el('al-photo-input').click()"><i class="ti ti-plus" style="font-size:20px"></i></div>`;
}
function renderAlertsDash(){
  if(!DB.alertes){ return; }
  const actives=DB.alertes.filter(a=>a.statut==='Active');
  el('d-alert-cnt').textContent=actives.length+' alerte(s) active(s)';
  if(!DB.alertes.length){ el('d-alerts-list').innerHTML='<div class="empty-state" style="padding:24px"><i class="ti ti-bell" style="font-size:28px"></i><p>Aucune alerte</p></div>'; return; }
  const gravColor={'Critique':'#e53935','Majeure':'#ea580c','Mineure':'#f59e0b'};
  const typeIcon={'Matériel':'ti-tool','Structure':'ti-building','Produit':'ti-package','Hygiène':'ti-droplet','Sécurité':'ti-shield'};
  el('d-alerts-list').innerHTML=[...DB.alertes].reverse().slice(0,8).map(a=>`
    <div class="alert-item">
      <div class="alert-dot" style="background:${gravColor[a.gravite]||'#888'}"></div>
      <div style="flex:1">
        <div style="display:flex;align-items:center;gap:8px;margin-bottom:3px">
          <i class="ti ${typeIcon[a.type]||'ti-bell'}" style="font-size:14px;color:var(--text2)"></i>
          <span style="font-size:13px;font-weight:600">${a.titre}</span>
          ${critBdg(a.gravite)}
          <span class="badge" style="background:#f3f4f6;color:#374151">${a.type}</span>
        </div>
        <div class="tsm tm">${a.mag?`🏪 <strong>${a.mag}</strong> · `:''}Signalé par <strong>${a.signale}</strong> · ${fd(a.date)}
          ${a.photos&&a.photos.length?`· <i class="ti ti-camera" style="font-size:12px"></i> ${a.photos.length} photo(s)`:''}
        </div>
        ${a.cmt?`<div style="font-size:12px;color:var(--text2);margin-top:3px;font-style:italic">${a.cmt.slice(0,100)}${a.cmt.length>100?'...':''}</div>`:''}
        ${a.photos&&a.photos.length?`<div style="display:flex;gap:6px;margin-top:6px;flex-wrap:wrap">${a.photos.slice(0,3).map(p=>`<img src="${p}" class="photo-thumb" style="width:52px;height:52px">`).join('')}</div>`:''}
      </div>
      <button class="btn btn-secondary btn-sm" onclick="closeAlerte('${a.id}')" title="Clôturer"><i class="ti ti-check"></i></button>
      ${CU&&CU.role==='admin'?`<button class="btn btn-danger btn-sm" onclick="confirmDel('alert','${a.id}','${a.titre.replace(/'/g,"\\'")}')"><i class="ti ti-trash"></i></button>`:''}
    </div>`).join('');
}
function closeAlerte(id){ const a=DB.alertes.find(x=>x.id===id); if(a){ a.statut='Clôturée'; save(); renderDash(); } }