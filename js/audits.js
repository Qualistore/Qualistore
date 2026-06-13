// ══════════════ AUDITS ══════════════
// Dépend de : storage.js (DB, CU), auth.js (hasPerm), ui.js

// ══════════════ AUDITS ══════════════
function renderAudits(){
  const mids=visibleMids();
  const fMag=v('flt-aud-mag'), fRay=v('flt-aud-ray');
  let list=[...DB.audits].reverse().filter(a=>mids.includes(a.mid));
  if(fMag) list=list.filter(a=>a.mid===fMag);
  if(fRay) list=list.filter(a=>a.rayon===fRay);
  el('aud-cnt').textContent=list.length+' audit(s)';
  // Always rebuild mag filter with visible magasins
  const sel=el('flt-aud-mag');
  if(sel){ const cv=sel.value; while(sel.options.length>1) sel.remove(1); DB.magasins.filter(m=>mids.includes(m.id)).forEach(m=>{ const o=document.createElement('option'); o.value=m.id; o.textContent=m.nom; sel.appendChild(o); }); if(cv) sel.value=cv; }
  const tb=el('aud-tb');
  if(!list.length){ tb.innerHTML=`<tr><td colspan="9"><div class="empty-state"><i class="ti ti-clipboard-check"></i><p>Aucun audit.</p></div></td></tr>`; return; }
  tb.innerHTML=list.map(a=>`<tr>
    <td style="font-weight:600;color:var(--primary)">${a.id}</td>
    <td>${a.mag}</td>
    <td style="display:flex;align-items:center;gap:6px;padding-top:14px">${rIcon(a.rayon)} ${a.rayon}</td>
    <td>${fd(a.date)}</td><td>${a.aud}</td>
    <td>${sbadge(a.score)}</td>
    <td style="color:${a.nc>0?'var(--danger)':'var(--success)'};font-weight:600">${a.nc}</td>
    <td>${statBdg(a.statut)}</td>
    <td><div class="act-btns">
      <button class="btn btn-secondary btn-sm" onclick="showAud('${a.id}')"><i class="ti ti-eye"></i></button>
      ${CU&&CU.role==='admin'?`<button class="btn btn-danger btn-sm" onclick="deleteAudit('${a.id}')" title="Supprimer cet audit"><i class="ti ti-trash"></i></button>`:''}
    </div></td>
  </tr>`).join('');
}
function showAud(id){
  const a=DB.audits.find(x=>x.id===id); if(!a) return;
  const ncs=DB.ncs.filter(n=>n.aid===id);
  let html=`<div style="display:grid;grid-template-columns:1fr 1fr;gap:16px;margin-bottom:20px">
    <table style="font-size:13px">
      <tr><td class="tm" style="padding:4px 0;width:40%">N° Audit</td><td style="font-weight:600;color:var(--primary)">${a.id}</td></tr>
      <tr><td class="tm" style="padding:4px 0">Magasin</td><td>${a.mag}</td></tr>
      <tr><td class="tm" style="padding:4px 0">Rayon</td><td>${a.rayon}</td></tr>
      <tr><td class="tm" style="padding:4px 0">Date</td><td>${fd(a.date)}</td></tr>
      <tr><td class="tm" style="padding:4px 0">Auditeur</td><td>${a.aud}</td></tr>
      <tr><td class="tm" style="padding:4px 0">Statut</td><td>${statBdg(a.statut)}</td></tr>
    </table>
    <div style="text-align:center">
      <div style="font-size:11px;color:var(--text2);margin-bottom:8px">Score global</div>
      <div style="width:80px;height:80px;border-radius:50%;border:7px solid ${sc(a.score)};display:flex;align-items:center;justify-content:center;margin:0 auto 8px;font-size:20px;font-weight:700;color:${sc(a.score)}">${a.score}%</div>
      <span class="score-badge ${scCls(a.score)}">${a.score>=95?'Excellent':a.score>=80?'Satisfaisant':a.score>=70?'À améliorer':'Non conforme'}</span>
    </div>
  </div>`;
  if(a.cmt) html+=`<div style="background:var(--bg);border-radius:var(--radius);padding:10px 14px;margin-bottom:16px;font-size:13px"><span class="tm">Commentaire général : </span>${a.cmt}</div>`;
  if(a.answers){
    const ans=Object.values(a.answers);
    const withNotes=ans.filter(x=>x.note||x.cmt||(x.photos&&x.photos.length));
    if(withNotes.length){
      html+=`<div style="font-size:13px;font-weight:600;margin-bottom:10px">Notes et photos par point de contrôle</div>`;
      html+=withNotes.map(x=>`<div style="background:var(--bg);border-radius:var(--radius);padding:10px 14px;margin-bottom:8px;border-left:3px solid ${x.rep==='NC'?'var(--danger)':x.rep==='C'?'var(--success)':'var(--border)'}">
        <div style="font-size:12px;font-weight:600;margin-bottom:4px">${x.q}</div>
        ${x.note?`<div style="font-size:12px;color:var(--text2)">${x.note}</div>`:''}
        ${x.cmt?`<div style="font-size:12px;color:var(--danger)">${x.cmt}</div>`:''}
        ${x.photos&&x.photos.length?`<div style="display:flex;gap:6px;margin-top:8px;flex-wrap:wrap">${x.photos.map(p=>`<img src="${p}" style="width:64px;height:64px;border-radius:7px;object-fit:cover;border:1px solid var(--border)">`).join('')}</div>`:''}
      </div>`).join('');
    }
  }
  if(ncs.length){
    html+=`<div style="font-size:13px;font-weight:600;margin-bottom:10px;margin-top:4px">Non-conformités (${ncs.length})</div>`;
    html+=ncs.map(n=>`<div style="background:var(--danger-light);border-radius:var(--radius);padding:10px 14px;margin-bottom:8px">
      <div style="font-size:13px;font-weight:500">${n.desc}</div>
      <div style="margin-top:4px;display:flex;gap:6px">${critBdg(n.crit)} ${statBdg(n.statut)}</div>
    </div>`).join('');
  }
  el('aud-detail-body').innerHTML=html;
  openModal('m-aud-detail');
}