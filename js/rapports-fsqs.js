// ══════════════ RAPPORTS-FSQS ══════════════
// Dépend de : storage.js (DB, CU), auth.js (hasPerm), ui.js

// ══════════════ RAPPORTS FSQS ══════════════
function renderRap(){
  const mids=visibleMids();
  const magSel=el('r-mag');
  if(magSel){ const cv=magSel.value; while(magSel.options.length>1) magSel.remove(1); DB.magasins.filter(m=>mids.includes(m.id)).forEach(m=>{ const o=document.createElement('option'); o.value=m.id; o.textContent=m.nom; magSel.appendChild(o); }); if(cv) magSel.value=cv; }
  const fMag=v('r-mag'), fRay=v('r-ray')||'';
  let auds=[...DB.audits].reverse().filter(a=>mids.includes(a.mid));
  if(fMag&&fMag!=='all') auds=auds.filter(a=>a.mid===fMag);
  if(fRay) auds=auds.filter(a=>a.rayon===fRay);
  el('r-cnt').textContent=auds.length+' audit(s) disponible(s)';
  const listEl=el('r-audit-list');
  if(!auds.length){ listEl.innerHTML='<div class="empty-state" style="padding:16px"><p>Aucun audit.</p></div>'; return; }
  listEl.innerHTML=auds.map(a=>`<label style="display:flex;align-items:center;gap:10px;padding:7px 4px;border-bottom:1px solid var(--border);cursor:pointer;font-size:13px">
    <input type="checkbox" class="r-cb" value="${a.id}" style="width:16px;height:16px;accent-color:var(--primary);cursor:pointer" checked>
    <span style="flex:1">${a.mag}</span>
    <span class="badge" style="background:var(--bg)">${a.rayon}</span>
    <span class="tsm tm">${fd(a.date)}</span>
    <span class="score-badge ${scCls(a.score)}">${a.score}%</span>
    ${a.nc>0?`<span class="badge b-open">${a.nc} NC</span>`:''}
  </label>`).join('');
  el('rap-preview').style.display='none';
  el('r-print-btn').style.display='none';
  const delBtn=el('r-del-btn');
  if(delBtn) delBtn.style.display=CU&&CU.role==='admin'?'':'none';
}
function toggleAllRap(v){ document.querySelectorAll('.r-cb').forEach(c=>c.checked=v); }

function genRapport(){
  const selected=[...document.querySelectorAll('.r-cb:checked')].map(c=>c.value);
  if(!selected.length){ alert('Sélectionnez au moins un audit.'); return; }
  const auds=DB.audits.filter(a=>selected.includes(a.id));
  const avg=Math.round(auds.reduce((s,a)=>s+a.score,0)/auds.length);
  const allNcs=auds.flatMap(a=>DB.ncs.filter(n=>n.aid===a.id));

  const html=`<div style="font-family:Arial,sans-serif;color:#1a1f36">
    <div style="border-bottom:3px solid #1a4fa0;padding-bottom:16px;margin-bottom:24px;display:flex;justify-content:space-between;align-items:flex-start">
      <div><h2 style="color:#1a4fa0;margin:0;font-size:20px">Rapport FSQS</h2>
        <div style="font-size:12px;color:#5a6070;margin-top:4px">Généré le ${new Date().toLocaleDateString('fr-FR')} · ${auds.length} audit(s) sélectionné(s)</div>
      </div>
      <div style="text-align:center"><div style="font-size:32px;font-weight:700;color:${sc(avg)}">${avg}%</div><div style="font-size:11px;color:#5a6070">Score moyen</div></div>
    </div>
    <div style="display:grid;grid-template-columns:repeat(4,1fr);gap:10px;margin-bottom:24px">
      <div style="background:#e8f0fc;border-radius:8px;padding:12px;text-align:center"><div style="font-size:22px;font-weight:700;color:#1a4fa0">${auds.length}</div><div style="font-size:11px;color:#5a6070">Audits</div></div>
      <div style="background:#fdecea;border-radius:8px;padding:12px;text-align:center"><div style="font-size:22px;font-weight:700;color:#e53935">${allNcs.filter(n=>n.statut==='Ouverte').length}</div><div style="font-size:11px;color:#5a6070">NC ouvertes</div></div>
      <div style="background:#fff8e1;border-radius:8px;padding:12px;text-align:center"><div style="font-size:22px;font-weight:700;color:#f59e0b">${allNcs.filter(n=>n.statut==='En cours').length}</div><div style="font-size:11px;color:#5a6070">NC en cours</div></div>
      <div style="background:#dcfce7;border-radius:8px;padding:12px;text-align:center"><div style="font-size:22px;font-weight:700;color:#16a34a">${allNcs.filter(n=>n.statut==='Clôturée').length}</div><div style="font-size:11px;color:#5a6070">NC clôturées</div></div>
    </div>
    ${auds.map(a=>{
      const ncs=DB.ncs.filter(n=>n.aid===a.id);
      const scColor=sc(a.score);
      return `<div class="report-audit-card" style="border:1px solid #e2e6ef;border-radius:10px;margin-bottom:20px;overflow:hidden">
        <div style="background:linear-gradient(90deg,#e8f0fc,#f3f5f9);padding:12px 18px;display:flex;justify-content:space-between;align-items:center">
          <div>
            <div style="font-size:14px;font-weight:700;color:#1a4fa0">${a.mag}</div>
            <div style="font-size:12px;color:#5a6070;margin-top:2px">${a.rayon} · ${fd(a.date)} · Auditeur : ${a.aud}</div>
          </div>
          <div style="text-align:center">
            <div style="font-size:22px;font-weight:700;color:${scColor}">${a.score}%</div>
            <div style="font-size:11px;color:#5a6070">${a.score>=95?'Excellent':a.score>=80?'Satisfaisant':a.score>=70?'À améliorer':'Non conforme'}</div>
          </div>
        </div>
        <div style="padding:14px 18px">
          ${a.cmt?`<div style="font-style:italic;color:#5a6070;font-size:13px;margin-bottom:10px;padding:8px 12px;background:#f9fafb;border-radius:6px">${a.cmt}</div>`:''}
          ${ncs.length?`
          <div style="font-size:12px;font-weight:700;color:#b91c1c;margin-bottom:10px;text-transform:uppercase;letter-spacing:.5px;display:flex;align-items:center;gap:6px">
            <span style="display:inline-block;width:16px;height:16px;background:#e53935;border-radius:50%;color:#fff;font-size:10px;text-align:center;line-height:16px">!</span>
            Non-conformités (${ncs.length})
          </div>
          <table style="width:100%;border-collapse:collapse;font-size:11px;margin-bottom:4px">
            <thead>
              <tr style="background:#f8f8f8">
                <th style="padding:7px 10px;border:1px solid #e2e6ef;text-align:left;color:#5a6070;font-size:10px;text-transform:uppercase;letter-spacing:.4px">Description</th>
                <th style="padding:7px 10px;border:1px solid #e2e6ef;text-align:left;color:#5a6070;font-size:10px;text-transform:uppercase;letter-spacing:.4px;width:110px">Criticité</th>
                <th style="padding:7px 10px;border:1px solid #e2e6ef;text-align:left;color:#5a6070;font-size:10px;text-transform:uppercase;letter-spacing:.4px;width:90px">Statut</th>
                <th style="padding:7px 10px;border:1px solid #e2e6ef;text-align:left;color:#1a4fa0;font-size:10px;text-transform:uppercase;letter-spacing:.4px;background:#eef3fb">💬 Suivi</th>
              </tr>
            </thead>
            <tbody>
              ${ncs.map(n=>{
                const ac=DB.actions.find(x=>x.ncId===n.id);
                const suiviCmt=ac?.cmt||'';
                const critColor=n.crit==='Critique'?'#e53935':n.crit==='Majeure'?'#ea580c':'#f59e0b';
                const statBg=n.statut==='Clôturée'?'#dcfce7':n.statut==='En cours'?'#fff8e1':'#fdecea';
                const statColor=n.statut==='Clôturée'?'#15803d':n.statut==='En cours'?'#92400e':'#b91c1c';
                const isEnCours=n.statut==='En cours';
                return `<tr style="border-left:3px solid ${critColor}">
                  <td style="padding:8px 10px;border:1px solid #e2e6ef;color:#1a1f36">
                    ${n.desc}
                    ${(()=>{
                      const a=DB.audits.find(x=>x.id===n.aid);
                      const ans=a&&a.answers&&Object.values(a.answers).find(x=>x.q===n.desc);
                      const cmt=ans?.cmt||n.cmt||'';
                      const photos=ans&&ans.photos&&ans.photos.length?`<div style="display:flex;gap:6px;margin-top:6px;flex-wrap:wrap">${ans.photos.map(p=>`<img src="${p}" style="width:72px;height:72px;object-fit:cover;border-radius:6px;border:1px solid #e2e6ef">`).join('')}</div>`:'';
                      return (cmt?`<div style="font-style:italic;color:#e53935;margin-top:4px;font-size:11px">→ ${cmt}</div>`:'')+photos;
                    })()}
                  </td>
                  <td style="padding:8px 10px;border:1px solid #e2e6ef">
                    <span style="display:inline-block;padding:2px 8px;border-radius:10px;background:${critColor}20;color:${critColor};font-weight:600;font-size:10px">${n.crit}</span>
                  </td>
                  <td style="padding:8px 10px;border:1px solid #e2e6ef">
                    <span style="display:inline-block;padding:2px 8px;border-radius:10px;background:${statBg};color:${statColor};font-weight:600;font-size:10px">${n.statut}</span>
                  </td>
                  <td style="padding:8px 10px;border:1px solid #e2e6ef;background:${isEnCours&&suiviCmt?'#fffbeb':'#fafafa'}">
                    ${suiviCmt
                      ? `<div style="font-style:italic;color:${isEnCours?'#92400e':'#6b7280'};font-size:11px;${isEnCours?'font-weight:500':''}">${suiviCmt}</div>`
                      : `<span style="color:#c0c4cc;font-size:10px">–</span>`}
                  </td>
                </tr>`;
              }).join('')}
            </tbody>
          </table>`
          :`<div style="color:#16a34a;font-size:13px;font-weight:500">✓ Aucune non-conformité détectée</div>`}
        </div>
      </div>`;
    }).join('')}
  </div>`;
  el('rap-body').innerHTML=html;
  // Générer les annexes photos
// Générer les annexes photos dans un PDF séparé
  const annexes=auds.flatMap(a=>{
    const ncs=DB.ncs.filter(n=>n.aid===a.id);
    return ncs.flatMap(n=>{
      const audit=DB.audits.find(x=>x.id===n.aid);
      const ans=audit&&audit.answers&&Object.values(audit.answers).find(x=>x.q===n.desc);
      const photos=(ans?.photos||[]);
      const alerte=n.isAlert&&DB.alertes.find(x=>x.id===n.aid);
      const alertPhotos=(alerte?.photos||[]);
      const allPhotos=[...photos,...alertPhotos];
      const ac=DB.actions.find(x=>x.ncId===n.id);
      const cmtSaisie=ans?.cmt||n.cmt||'';
      const cmtSuivi=ac?.cmt||'';
      return allPhotos.map(p=>({ mag:a.mag, rayon:a.rayon, date:fd(a.date), desc:n.desc, crit:n.crit, photo:p, cmtSaisie, cmtSuivi }));
    });
  });

  if(annexes.length){
    setTimeout(async ()=>{
      const {jsPDF}=window.jspdf;
      const pdf=new jsPDF({orientation:'landscape',unit:'pt',format:'a4'});
      const pW=pdf.internal.pageSize.getWidth();
      const pH=pdf.internal.pageSize.getHeight();
      const m=32;

      for(let i=0;i<annexes.length;i++){
        const a=annexes[i];
        if(i>0) pdf.addPage();

        // En-tête
        pdf.setFillColor(232,240,252);
        pdf.rect(m, m, pW-m*2, 70, 'F');
        pdf.setFontSize(13); pdf.setTextColor(26,79,160); pdf.setFont(undefined,'bold');
        pdf.text(`${a.mag} · ${a.rayon} · ${a.date}`, m+10, m+22);
        pdf.setFontSize(11); pdf.setTextColor(185,28,28);
        pdf.text(a.desc, m+10, m+40, {maxWidth: pW-m*2-20});
        pdf.setFontSize(10); pdf.setTextColor(90,96,112); pdf.setFont(undefined,'normal');
        pdf.text(a.crit, m+10, m+58);

        let yOffset=m+80;

        // Commentaires
        if(a.cmtSaisie){
          pdf.setFontSize(10); pdf.setTextColor(229,57,53);
          pdf.text(`→ Constat : ${a.cmtSaisie}`, m, yOffset, {maxWidth: pW-m*2});
          yOffset+=20;
        }
        if(a.cmtSuivi){
          pdf.setFontSize(10); pdf.setTextColor(146,64,14);
          pdf.text(`💬 Suivi : ${a.cmtSuivi}`, m, yOffset, {maxWidth: pW-m*2});
          yOffset+=20;
        }

        // Photo
        try{
          const img=await _loadImageAsDataURL(a.photo);
          const maxW=pW-m*2;
          const maxH=pH-yOffset-m;
          pdf.addImage(img,'JPEG',m,yOffset,maxW,maxH,'','FAST');
        } catch(e){ pdf.setFontSize(10); pdf.setTextColor(150,150,150); pdf.text('Image non disponible', m, yOffset+20); }
      }
      pdf.save('annexes-photos.pdf');
    }, 500);
  }
  
  el('rap-preview').style.display='';
  el('r-print-btn').style.display='';
  el('rap-preview').scrollIntoView({behavior:'smooth'});
}
function deleteSelectedAudits(){
  const selected=[...document.querySelectorAll('.r-cb:checked')].map(c=>c.value);
  if(!selected.length){ alert('Sélectionnez au moins un audit.'); return; }
  if(!confirm('Supprimer '+selected.length+' audit(s) et toutes leurs NC/actions associées ?')) return;
  selected.forEach(id=>{
    const ncs=DB.ncs.filter(n=>n.aid===id).map(n=>n.id);
    ncs.forEach(ncId=>{
      sbDeleteWhere('actions','ncId',ncId);
      DB.actions=DB.actions.filter(a=>a.ncId!==ncId);
    });
    sbDeleteWhere('ncs','aid',id);
    sbDeleteWhere('audits','id',id);
    DB.ncs=DB.ncs.filter(n=>n.aid!==id);
    DB.audits=DB.audits.filter(a=>a.id!==id);
  });
  save(['audits','ncs','actions']);
  renderRap();
}
function _loadImageAsDataURL(url){
  return new Promise((resolve,reject)=>{
    const img=new Image();
    img.crossOrigin='anonymous';
    img.onload=()=>{
      const c=document.createElement('canvas');
      c.width=img.width; c.height=img.height;
      c.getContext('2d').drawImage(img,0,0);
      resolve(c.toDataURL('image/jpeg',0.92));
    };
    img.onerror=reject;
    img.src=url;
  });
}