// ══════════════ ACTIONS ══════════════
// Dépend de : storage.js (DB, CU), auth.js (hasPerm), ui.js

// ══════════════ ACTIONS ══════════════
function renderActions(){
  const mids=visibleMids();
  const visibleMagNoms=DB.magasins.filter(m=>mids.includes(m.id)).map(m=>m.nom);
  const fMag=v('flt-act-mag'), fStat=v('flt-act-stat');
  // Exclude Traitée actions — they move to NC archive
  let list=[...DB.actions].reverse().filter(a=>(visibleMagNoms.includes(a.mag)||a.mag==='Alerte terrain')&&a.statut!=='Traitée');
  if(fMag){ const mag=DB.magasins.find(m=>m.id===fMag); if(mag) list=list.filter(a=>a.mag===mag.nom); }
  if(fStat) list=list.filter(a=>a.statut===fStat);
  const sel=el('flt-act-mag'); if(sel){ const cv=sel.value; while(sel.options.length>1) sel.remove(1); DB.magasins.filter(m=>mids.includes(m.id)).forEach(m=>{ const o=document.createElement('option'); o.value=m.id; o.textContent=m.nom; sel.appendChild(o); }); if(cv) sel.value=cv; }
  el('act-cnt').textContent=list.length+' action(s)';
  const canEdit=canEditNC();
  const tb=el('act-tb');
  if(!list.length){ tb.innerHTML=`<tr><td colspan="9"><div class="empty-state"><i class="ti ti-tool"></i><p>Aucune action corrective.</p></div></td></tr>`; return; }
  tb.innerHTML=list.map(a=>{
    const ov=overdue(a.ech)&&a.statut!=='Traitée';
    // Get the linked NC description (audit comment, non-modifiable)
    const linkedNC=DB.ncs.find(x=>x.id===a.ncId);
    const auditDesc=linkedNC?linkedNC.desc:a.desc;
    return `<tr style="${ov?'background:#fff8f8':''}">
    <td style="max-width:200px;font-size:12px;vertical-align:top;padding-top:14px">
      <!-- Description audit : non modifiable -->
      <div style="color:var(--text)">${auditDesc.slice(0,80)}${auditDesc.length>80?'...':''}</div>
      ${(()=>{ const audit=DB.audits.find(x=>x.id===linkedNC?.aid); const ans=audit&&audit.answers&&Object.values(audit.answers).find(x=>x.q===auditDesc); return ans&&ans.photos&&ans.photos.length?`<div style="display:flex;gap:4px;margin-top:6px;flex-wrap:wrap">${ans.photos.map(p=>`<img src="${p}" style="width:48px;height:48px;object-fit:cover;border-radius:6px;border:1px solid var(--border);cursor:pointer" onclick="openPhotoViewer('${p}')">`).join('')}</div>`:''; })()}
    </td>
    <td style="font-size:12px;vertical-align:top;padding-top:14px">${a.mag}</td>
    <td style="font-size:12px;vertical-align:top;padding-top:14px">${a.resp}</td>
    <td style="font-size:12px;vertical-align:top;padding-top:14px;color:${ov?'var(--danger)':'inherit'}">${ov?'<i class="ti ti-clock"></i> ':''}${fd(a.ech)}</td>
    <td style="vertical-align:top;padding-top:14px">${critBdg(a.prio)}</td>
    <td style="vertical-align:top;padding-top:10px;min-width:160px">
      ${canEdit
        ? `<select class="form-control" style="padding:4px 8px;font-size:12px;width:100%" onchange="changeActStatut('${a.id}',this.value)">
            <option value="Ouverte" ${a.statut==='Ouverte'?'selected':''}>Ouverte</option>
            <option value="En cours" ${a.statut==='En cours'?'selected':''}>En cours</option>
            <option value="Traitée" ${a.statut==='Traitée'?'selected':''}>Traitée</option>
           </select>
           ${a.statut==='En cours'
             ? `<textarea class="form-control" rows="2" style="font-size:11px;margin-top:6px;padding:5px 8px;resize:none" placeholder="Commentaire de suivi..." onblur="saveActCmt('${a.id}',this.value)">${a.cmt||''}</textarea>`
             : (a.cmt?`<div style="margin-top:5px;padding:5px 8px;background:var(--bg);border-left:3px solid var(--primary-mid);border-radius:0 4px 4px 0;font-size:11px;font-style:italic;color:var(--text2)">💬 ${a.cmt}</div>`:'')
           }`
        : `${statBdg(a.statut)}${a.cmt?`<div style="margin-top:5px;padding:5px 8px;background:var(--bg);border-left:3px solid var(--primary-mid);border-radius:0 4px 4px 0;font-size:11px;font-style:italic;color:var(--text2)">💬 ${a.cmt}</div>`:''}`}
    </td>
    <td style="vertical-align:top;padding-top:10px"></td>
  </tr>`;
  }).join('');
}

function saveActCmt(actId, newCmt){
  const a=DB.actions.find(x=>x.id===actId); if(!a) return;
  a.cmt=newCmt.trim();
  save();
}
function changeActStatut(actId, newStatut){
  const a=DB.actions.find(x=>x.id===actId); if(!a) return;
  a.statut=newStatut;
  const n=DB.ncs.find(x=>x.id===a.ncId);
  if(n){
    if(newStatut==='Traitée'){
      n.statut='Clôturée';
      n.closedDate=today();
      // Copier le commentaire de suivi de l'action dans la NC pour l'archive
      if(a.cmt) n.cmt=a.cmt;
      // Archiver l'alerte liée si applicable
      if(n.isAlert && a.alertId){
        const al=DB.alertes.find(x=>x.id===a.alertId);
        if(al) al.statut='Clôturée';
      }
    } else if(newStatut==='En cours') n.statut='En cours';
    else if(newStatut==='Ouverte') n.statut='Ouverte';
  }
  save();
  const nb=el('nc-bdg'); if(nb) nb.textContent=DB.ncs.filter(x=>x.statut==='Ouverte').length;
  renderActions();
  if(el('page-nc')?.classList.contains('active')) renderNC();
  if(el('page-dashboard')?.classList.contains('active')) renderAlertsDash();
}
function closeAct(id){ changeActStatut(id,'Traitée'); }