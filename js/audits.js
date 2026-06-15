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
        ${x.photos&&x.photos.length?`<div style="display:flex;gap:6px;margin-top:8px;flex-wrap:wrap">${x.photos.map(p=>`<img src="${p}" style="width:64px;height:64px;border-radius:7px;object-fit:cover;border:1px solid var(--border);cursor:pointer" onclick="openPhotoViewer('${p}')">`).join('')}</div>`:''}
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
function openAuditModal(){
  const mids=visibleMids();
  const msel=el('a-mag');
  msel.innerHTML='<option value="">Sélectionner...</option>'+DB.magasins.filter(m=>mids.includes(m.id)&&m.statut==='actif').map(m=>`<option value="${m.id}">${m.nom}</option>`).join('');
  el('a-date').value=today();
  el('a-date').readOnly=!(CU&&CU.role==='admin');
  el('a-aud').value=(CU&&CU.role!=='collaborateur')?CU.nom:'';
  el('a-aud').readOnly=(CU&&CU.role!=='collaborateur');
  el('as1').style.display=''; el('as2').style.display='none'; el('as3').style.display='none';
  el('a-prev').style.display='none';
  el('a-pause').style.display='none';
  _currentDraftId=null;
  el('a-next').innerHTML='Continuer <i class="ti ti-arrow-right"></i>';
  openModal('m-audit');
}

function deleteAudit(id){
  if(!confirm('Supprimer cet audit ?')) return;
  DB.audits=DB.audits.filter(a=>a.id!==id);
  DB.ncs=DB.ncs.filter(n=>n.aid!==id);
  save(); renderAudits();
}

let auditStep=0, auditAnswers={};

function auditNext(){
  if(auditStep===0){
    const mid=v('a-mag'), ray=v('a-ray'), date=v('a-date');
    if(!mid||!ray||!date){ alert('Magasin, rayon et date sont requis.'); return; }
    buildAuditQuestions(ray);
    el('as1').style.display='none'; el('as2').style.display='';
    el('a-ray-ttl').textContent=ray;
    el('a-prev').style.display='';
    el('a-pause').style.display='';
    el('a-next').innerHTML='Valider l\'audit <i class="ti ti-check"></i>';
    auditStep=1;
  } else if(auditStep===1){
    submitAudit();
  }
}

function auditPrev(){
  if(auditStep===1){
    el('as2').style.display='none'; el('as1').style.display='';
    el('a-prev').style.display='none';
    el('a-next').innerHTML='Continuer <i class="ti ti-arrow-right"></i>';
    auditStep=0;
    el('a-pause').style.display='none';
  }
}

function buildAuditQuestions(rayon){
  const qs=getGrille(rayon);
  auditAnswers={};
  qs.forEach(q=>{ auditAnswers[q.id]={q:q.q,rep:null,cmt:'',photos:[]}; });
  el('a-prog').textContent=`0/${qs.length} réponses`;
  el('a-qs').innerHTML=qs.map(q=>`
    <div class="aq" id="aaq-${q.id}" style="margin-bottom:8px">
      <div class="qt">${critBdg(q.c)} ${q.q}</div>
      ${q.prec?`<div style="font-size:11px;color:var(--text2);margin-bottom:6px;font-style:italic">${q.prec}</div>`:''}
      <div class="rg">
        <div class="rb" onclick="setAudRep('${q.id}','C',this)"><i class="ti ti-check" style="font-size:12px"></i> Conforme</div>
        <div class="rb" onclick="setAudRep('${q.id}','NC',this)"><i class="ti ti-x" style="font-size:12px"></i> Non conforme</div>
        <div class="rb" onclick="setAudRep('${q.id}','NA',this)"><i class="ti ti-minus" style="font-size:12px"></i> N/A</div>
      </div>
      <div class="nc-det" id="and-${q.id}">
        <input type="text" class="form-control" style="font-size:12px;margin-top:6px" placeholder="Commentaire NC..." oninput="auditAnswers['${q.id}'].cmt=this.value">
        <div style="display:flex;gap:6px;margin-top:8px;flex-wrap:wrap" id="aphot-${q.id}"></div>
        <input type="file" accept="image/*" multiple style="display:none" id="aphi-${q.id}" onchange="handleAuditPhoto('${q.id}',this)">
        <button type="button" class="btn btn-secondary btn-sm" style="margin-top:6px;font-size:11px" onclick="el('aphi-${q.id}').click()"><i class="ti ti-camera"></i> Ajouter photo</button>
      </div>
    </div>`).join('');
  updateAuditScore();
}

function setAudRep(qid,r,btn){
  auditAnswers[qid].rep=r;
  const c=el('aaq-'+qid);
  c.querySelectorAll('.rb').forEach(b=>b.classList.remove('selC','selNC','selNA'));
  btn.classList.add('sel'+r);
  const d=el('and-'+qid); if(r==='NC') d?.classList.add('on'); else d?.classList.remove('on');
  updateAuditScore();
}

function updateAuditScore(){
  const qs=getGrille(v('a-ray'));
  const ans=Object.values(auditAnswers);
  const valid=ans.filter(a=>a.rep&&a.rep!=='NA');
  const done=ans.filter(a=>a.rep).length;
  el('a-prog').textContent=`${done}/${qs.length} réponses`;
  const total=qs.filter(q=>auditAnswers[q.id]?.rep&&auditAnswers[q.id]?.rep!=='NA').reduce((s,q)=>s+q.p,0);
  const ok=qs.filter(q=>auditAnswers[q.id]?.rep==='C').reduce((s,q)=>s+q.p,0);
  const pct=total>0?Math.round((ok/total)*100):null;
  el('a-score-live').textContent=pct!==null?pct+'%':'–';
}

function submitAudit(){
  const mid=v('a-mag'), ray=v('a-ray'), date=v('a-date'), aud=v('a-aud'), cmt=v('a-cmt');
  const mag=DB.magasins.find(m=>m.id===mid)||{};
  const qs=getGrille(ray);
  // Auto-fill unanswered
  qs.forEach(q=>{ if(!auditAnswers[q.id]?.rep) auditAnswers[q.id]={q:q.q,rep:'NA',cmt:'',photos:[]}; });
  const valid=qs.filter(q=>auditAnswers[q.id].rep!=='NA');
  const ok=valid.filter(q=>auditAnswers[q.id].rep==='C');
  const totalW=valid.reduce((s,q)=>s+q.p,0);
  const okW=ok.reduce((s,q)=>s+q.p,0);
  const score=totalW>0?Math.round((okW/totalW)*100):100;
  const ncList=valid.filter(q=>auditAnswers[q.id].rep==='NC');
const aid='AUD-'+uid();
  if(!DB.audits) DB.audits=[];
  DB.audits.push({id:aid,mid,mag:mag.nom||'',rayon:ray,date,aud,cmt,score,nc:ncList.length,statut:ncList.length?'Non conforme':'Conforme',answers:{...auditAnswers}});
ncList.forEach(q=>{
const ncId='NC-'+uid();
    const dl=new Date(Date.now()+7*86400000).toISOString().split('T')[0];
    DB.ncs.push({id:ncId,mid,mag:mag.nom||'',rayon:ray,date,desc:q.q,crit:q.c,resp:aud,dl,statut:'Ouverte',cmt:auditAnswers[q.id].cmt,aid});
const acId='AC-'+uid();
    DB.actions.push({id:acId,ncId,desc:q.q,mag:mag.nom||'',resp:aud,ech:dl,prio:q.c,statut:'Ouverte',cmt:''});
  });
   save();
   if(_currentDraftId){ DB.drafts=DB.drafts.filter(d=>d.id!==_currentDraftId); sbDeleteWhere('drafts','id',_currentDraftId); save(['drafts']); _currentDraftId=null; }
  el('as2').style.display='none'; el('as3').style.display='';
  el('a-prev').style.display='none';
  el('a-pause').style.display='none';
  el('a-next').innerHTML='Fermer';
  el('a-next').onclick=()=>{ closeModal('m-audit'); el('a-next').onclick=auditNext; auditStep=0; renderAudits(); };
  el('a-recap').textContent=(mag.nom||'')+' · '+ray+' · '+fd(date);
  const sc2=score>=95?'var(--success)':score>=80?'#f59e0b':score>=70?'var(--orange)':'var(--danger)';
  el('a-score-fin').style.borderColor=sc2; el('a-score-fin').style.color=sc2;
  el('a-score-fin').textContent=score+'%';
  el('a-nc-msg').textContent=ncList.length?ncList.length+' NC détectée(s)':'';
  auditStep=2;
}

async function handleAuditPhoto(qid, input){
  const files=[...input.files];
  for(const f of files){
    const path='audits/'+qid+'-'+uid()+'-'+f.name.replace(/[^a-zA-Z0-9._-]/g,'_');
    const url=await sbUploadPhoto(f, path);
    if(url){
      auditAnswers[qid].photos.push(url);
    } else {
      alert('Upload échoué — vérifiez votre connexion.');
    }
    const prev=el('aphot-'+qid);
    if(prev) prev.innerHTML=auditAnswers[qid].photos.map(u=>`<img src="${u}" style="width:52px;height:52px;border-radius:7px;object-fit:cover;border:1px solid var(--border)">`).join('');
  }
  input.value='';
}

function openPhotoViewer(url){
  const ov=document.createElement('div');
  ov.style.cssText='position:fixed;inset:0;background:rgba(0,0,0,.85);z-index:9999;display:flex;align-items:center;justify-content:center;cursor:zoom-out';
  ov.onclick=()=>document.body.removeChild(ov);
  ov.innerHTML=`<img src="${url}" style="max-width:92vw;max-height:92vh;border-radius:10px;box-shadow:0 8px 40px rgba(0,0,0,.6)">`;
  document.body.appendChild(ov);
}

let _currentDraftId=null;

function pauseAudit(){
  const mid=v('a-mag'), ray=v('a-ray'), date=v('a-date'), aud=v('a-aud'), cmt=v('a-cmt');
  const mag=DB.magasins.find(m=>m.id===mid)||{};
  const draftId=_currentDraftId||'DRF-'+uid();
  _currentDraftId=draftId;
  const existing=DB.drafts.findIndex(d=>d.id===draftId);
  const draft={ id:draftId, mid, mag:mag.nom||'', rayon:ray, date, aud, cmt, answers:{...auditAnswers}, createdAt:today(), uid:CU?CU.id:'' };
  if(existing>=0) DB.drafts[existing]=draft;
  else DB.drafts.push(draft);
  save(['drafts']);
  sbUpsert('drafts',[draft]);
  closeModal('m-audit');
  auditStep=0; _currentDraftId=null;
  showToast('Audit mis en pause — retrouvez-le dans Brouillons','success');
  renderAudits();
}

function resumeDraft(id){
  const d=DB.drafts.find(x=>x.id===id); if(!d) return;
  _currentDraftId=id;
  const mids=visibleMids();
  const msel=el('a-mag');
  msel.innerHTML='<option value="">Sélectionner...</option>'+DB.magasins.filter(m=>mids.includes(m.id)&&m.statut==='actif').map(m=>`<option value="${m.id}">${m.nom}</option>`).join('');
  el('a-mag').value=d.mid;
  el('a-ray').value=d.rayon;
  el('a-date').value=d.date;
  el('a-date').readOnly=!(CU&&CU.role==='admin');
  el('a-aud').value=d.aud;
  sv('a-cmt',d.cmt||'');
  el('as1').style.display='none'; el('as2').style.display=''; el('as3').style.display='none';
  el('a-prev').style.display='';
  el('a-pause').style.display='';
  el('a-next').innerHTML='Valider l\'audit <i class="ti ti-check"></i>';
  auditAnswers={...d.answers};
  buildAuditQuestions(d.rayon);
  // Restore answers
  Object.entries(d.answers).forEach(([qid,ans])=>{
    if(!ans.rep) return;
    const btn=document.querySelector(`#aaq-${qid} .rb`);
    const btns=document.querySelectorAll(`#aaq-${qid} .rb`);
    const map={'C':0,'NC':1,'NA':2};
    if(btns[map[ans.rep]]) setAudRep(qid,ans.rep,btns[map[ans.rep]]);
  });
  auditStep=1;
  openModal('m-audit');
}

function deleteDraft(id){
  if(!confirm('Supprimer ce brouillon ?')) return;
  DB.drafts=DB.drafts.filter(d=>d.id!==id);
  save(['drafts']);
  sbDeleteWhere('drafts','id',id);
  renderDrafts();
}

function renderDrafts(){
  const tb=el('drafts-tb'); if(!tb) return;
  const mids=visibleMids();
  let list=CU&&CU.role==='admin'
    ? [...DB.drafts]
    : DB.drafts.filter(d=>d.uid===CU.id);
  list=[...list].reverse();
  el('drafts-cnt').textContent=list.length+' brouillon(s)';
  if(!list.length){ tb.innerHTML=`<tr><td colspan="6"><div class="empty-state"><i class="ti ti-player-pause"></i><p>Aucun brouillon en cours.</p></div></td></tr>`; return; }
  tb.innerHTML=list.map(d=>{
    const isOwner=CU&&(CU.id===d.uid||CU.role==='admin');
    const canDelete=CU&&(CU.id===d.uid||CU.role==='admin');
    return `<tr>
    <td style="font-weight:600;color:var(--primary)">${d.id}</td>
    <td>${d.mag}</td>
    <td style="display:flex;align-items:center;gap:6px;padding-top:14px">${rIcon(d.rayon)} ${d.rayon}</td>
    <td>${fd(d.date)}</td>
    <td>${d.aud}</td>
    <td><div class="act-btns">
      ${isOwner?`<button class="btn btn-primary btn-sm" onclick="${d.type==='qualimetre'?`resumeQualDraft('${d.id}')`:`resumeDraft('${d.id}')`}"><i class="ti ti-player-play"></i> Reprendre</button>`:''}
      ${canDelete?`<button class="btn btn-danger btn-sm" onclick="deleteDraft('${d.id}')"><i class="ti ti-trash"></i></button>`:''}
    </div></td>
  </tr>`;
  }).join('');
}