// ══════════════ NC ══════════════
// Dépend de : storage.js (DB, CU), auth.js (hasPerm), ui.js

// ══════════════ NC ══════════════
function canEditNC(){ return CU&&(CU.role==='admin'||CU.role==='fsqs'||CU.perms?.['nc']); }

function renderNC(){
  const mids=visibleMids();
  const fMag=v('flt-nc-mag'), fRay=v('flt-nc-ray'), fCrit=v('flt-nc-crit');
  // Active only: Ouverte + En cours
  let list=[...DB.ncs].reverse().filter(n=>(mids.includes(n.mid)||n.mid==='')&&n.statut!=='Clôturée');
  if(fMag) list=list.filter(n=>n.mid===fMag);
  if(fRay) list=list.filter(n=>n.rayon===fRay);
  if(fCrit) list=list.filter(n=>n.crit===fCrit);
  const fStat=v('flt-nc-stat')||'';
  if(fStat) list=list.filter(n=>n.statut===fStat);
  const sel=el('flt-nc-mag'); if(sel){ const cv=sel.value; while(sel.options.length>1) sel.remove(1); DB.magasins.filter(m=>mids.includes(m.id)).forEach(m=>{ const o=document.createElement('option'); o.value=m.id; o.textContent=m.nom; sel.appendChild(o); }); if(cv) sel.value=cv; }
  el('nc-cnt').textContent=list.length+' NC active(s)';
  const tb=el('nc-tb');
const isAdmin=CU&&CU.role==='admin';
  const delSelBtn=el('nc-del-sel-btn'); if(delSelBtn) delSelBtn.style.display=isAdmin?'':'none';
  if(!list.length){ tb.innerHTML=`<tr><td colspan="8"><div class="empty-state" style="padding:28px"><i class="ti ti-circle-check" style="color:var(--success);font-size:36px"></i><p>Aucune non-conformité active.</p></div></td></tr>`; renderNCArchives(fMag,fRay,fCrit); return; }
  tb.innerHTML=list.map(n=>`<tr>
    <td style="vertical-align:top;padding-top:14px;width:32px"><input type="checkbox" class="nc-cb" value="${n.id}" style="width:16px;height:16px;accent-color:var(--primary);cursor:pointer" checked></td>
    <td style="vertical-align:top;padding-top:14px">${n.mag}</td>
    <td style="vertical-align:top;padding-top:14px"><div style="display:flex;align-items:center;gap:6px">${rIcon(n.rayon)} ${n.rayon}</div></td>
    <td style="max-width:220px;font-size:12px;vertical-align:top;padding-top:14px">
      <div style="color:var(--text)">${n.desc.slice(0,80)}${n.desc.length>80?'...':''}</div>
      ${n.cmt?`<div style="margin-top:5px;padding:5px 8px;background:var(--bg);border-left:3px solid var(--primary-mid);border-radius:0 4px 4px 0;font-style:italic;color:var(--text2);font-size:11px">💬 ${n.cmt}</div>`:''}
    </td>
    <td style="vertical-align:top;padding-top:14px">${critBdg(n.crit)}</td>
    <td style="font-size:12px;vertical-align:top;padding-top:14px;color:${overdue(n.dl)&&n.statut==='Ouverte'?'var(--danger)':'inherit'}">${fd(n.dl)}</td>
    <td style="vertical-align:top;padding-top:14px">${statBdg(n.statut)}</td>
    <td style="vertical-align:top;padding-top:10px"><div class="act-btns">
      ${isAdmin?`<button class="btn btn-secondary btn-sm" title="Modifier" onclick="openNCEdit('${n.id}')"><i class="ti ti-pencil"></i></button>`:''}
    </div></td>
  </tr>`).join('');
  // Always render archives too
  renderNCArchives(fMag, fRay, fCrit);
}

function renderNCArchives(fMag, fRay, fCrit){
  const mids=visibleMids();
  let arch=[...DB.ncs].reverse().filter(n=>(mids.includes(n.mid)||n.mid==='')&&n.statut==='Clôturée');
  const afMag=v('flt-arch-mag')||''; const afRay=v('flt-arch-ray')||''; const afPer=v('flt-arch-period')||'';
  if(afMag) arch=arch.filter(n=>n.mid===afMag); else if(fMag) arch=arch.filter(n=>n.mid===fMag);
  if(afRay) arch=arch.filter(n=>n.rayon===afRay); else if(fRay) arch=arch.filter(n=>n.rayon===fRay);
  if(fCrit) arch=arch.filter(n=>n.crit===fCrit);
  if(afPer){
    const now=new Date(), d=new Date(now);
    if(afPer==='week'){ const day=d.getDay()||7; d.setDate(d.getDate()-day+1); d.setHours(0,0,0,0); arch=arch.filter(n=>n.closedDate&&new Date(n.closedDate)>=d); }
    else if(afPer==='month'){ d.setDate(1); d.setHours(0,0,0,0); arch=arch.filter(n=>n.closedDate&&new Date(n.closedDate)>=d); }
    else if(afPer==='month30'){ d.setDate(d.getDate()-30); d.setHours(0,0,0,0); arch=arch.filter(n=>n.closedDate&&new Date(n.closedDate)>=d); }
  }
  const asel=el('flt-arch-mag'); if(asel&&asel.options.length<=1) DB.magasins.filter(m=>mids.includes(m.id)).forEach(m=>{ const o=document.createElement('option'); o.value=m.id; o.textContent=m.nom; asel.appendChild(o); });
  const cnt=el('nc-archive-cnt'); if(cnt) cnt.textContent=arch.length;
  const tb=el('nc-archive-tb'); if(!tb) return;
  const isAdmin=CU&&CU.role==='admin';
  if(!arch.length){ tb.innerHTML=`<tr><td colspan="8"><div class="empty-state" style="padding:20px"><p>Aucune NC clôturée${afPer?' sur cette période':''}.</p></div></td></tr>`; return; }
  tb.innerHTML=arch.map(n=>`<tr style="opacity:.85">
    <td style="vertical-align:top;padding-top:12px;font-size:12px">${n.mag}</td>
    <td style="vertical-align:top;padding-top:12px"><div style="display:flex;align-items:center;gap:6px;font-size:12px">${rIcon(n.rayon)} ${n.rayon}</div></td>
    <td style="max-width:200px;font-size:12px;vertical-align:top;padding-top:12px;color:var(--text2)">${n.desc.slice(0,80)}${n.desc.length>80?'...':''}</td>
    <td style="max-width:180px;font-size:12px;vertical-align:top;padding-top:12px">
      ${n.cmt?`<div style="padding:5px 8px;background:var(--success-light);border-left:3px solid var(--success);border-radius:0 4px 4px 0;font-style:italic;color:#15803d">✔ ${n.cmt}</div>`:'<span class="tsm tm">–</span>'}
    </td>
    <td style="vertical-align:top;padding-top:12px">${critBdg(n.crit)}</td>
    <td style="font-size:12px;vertical-align:top;padding-top:12px;color:var(--success)">${n.closedDate?fd(n.closedDate):'–'}</td>
    <td style="vertical-align:top;padding-top:10px">${isAdmin?`<button class="btn btn-danger btn-sm" onclick="confirmDel('nc','${n.id}','${n.id}')"><i class="ti ti-trash"></i></button>`:''}</td>
  </tr>`).join('');
}

let ncArchiveOpen=false;
function toggleNCArchive(){
  ncArchiveOpen=!ncArchiveOpen;
  el('nc-archive-body').style.display=ncArchiveOpen?'':'none';
  el('nc-archive-chevron').style.transform=ncArchiveOpen?'rotate(180deg)':'';
}

// ── Logo header for PDF exports ──
function _pdfLogoHeader(subtitle){
  return `<div style="display:flex;align-items:center;justify-content:space-between;padding-bottom:14px;margin-bottom:20px;border-bottom:2px solid #e2e6ef">
    <img src="${LOGO_B64}" style="height:52px;width:auto" alt="QualiStore">
    <div style="text-align:right;font-family:Arial,sans-serif">
      <div style="font-size:10px;color:#8a94a6;text-transform:uppercase;letter-spacing:.5px">Généré le ${new Date().toLocaleDateString('fr-FR')}</div>
      ${subtitle?`<div style="font-size:11px;color:#5a6070;margin-top:2px">${subtitle}</div>`:''}
    </div>
  </div>`;
}

// ── Shared PDF rendering helper ──
function _renderAndExportPDF(html, filename, orientation='portrait'){
  const wrapper=document.createElement('div');
  const w=orientation==='landscape'?1060:794;
  wrapper.style.cssText=`position:fixed;left:-9999px;top:0;width:${w}px;background:#fff;padding:24px;font-family:Arial,sans-serif;color:#1a1f36;font-size:12px;line-height:1.5;z-index:-1`;
  wrapper.innerHTML=html;
  wrapper.querySelectorAll('button,select,input,textarea').forEach(e=>e.remove());
  document.body.appendChild(wrapper);
  requestAnimationFrame(()=>requestAnimationFrame(()=>{
    html2canvas(wrapper,{scale:2,useCORS:true,backgroundColor:'#ffffff',scrollX:0,scrollY:0,width:w,windowWidth:w+48}).then(canvas=>{
      document.body.removeChild(wrapper);
      const {jsPDF}=window.jspdf;
      const pdf=new jsPDF({orientation,unit:'pt',format:'a4'});
      const pW=pdf.internal.pageSize.getWidth(), pH=pdf.internal.pageSize.getHeight(), m=24;
      const uW=pW-m*2, ratio=uW/(canvas.width/2), totalH=(canvas.height/2)*ratio, uH=pH-m*2;
      let y=0, p=0;
      while(y<totalH){
        if(p>0) pdf.addPage();
        const slicePt=Math.min(uH,totalH-y), slicePx=Math.round((slicePt/ratio)*2), startPx=Math.round((y/ratio)*2);
        const sl=document.createElement('canvas'); sl.width=canvas.width; sl.height=slicePx;
        sl.getContext('2d').drawImage(canvas,0,startPx,canvas.width,slicePx,0,0,canvas.width,slicePx);
        pdf.addImage(sl.toDataURL('image/jpeg',0.92),'JPEG',m,m,uW,slicePt);
        y+=uH; p++;
      }
      pdf.save(filename+'.pdf');
    }).catch(err=>{ if(document.body.contains(wrapper)) document.body.removeChild(wrapper); alert('Erreur PDF : '+err.message); });
  }));
}

function exportNCActivePDF(){
  const mids=visibleMids();
  const fMag=v('flt-nc-mag'), fRay=v('flt-nc-ray'), fCrit=v('flt-nc-crit'), fStat=v('flt-nc-stat');
  const period=v('flt-nc-export-period')||'';

  let list=[...DB.ncs].reverse().filter(n=>(mids.includes(n.mid)||n.mid==='')&&n.statut!=='Clôturée');
  if(fMag) list=list.filter(n=>n.mid===fMag);
  if(fRay) list=list.filter(n=>n.rayon===fRay);
  if(fCrit) list=list.filter(n=>n.crit===fCrit);
  if(fStat) list=list.filter(n=>n.statut===fStat);

  // Filtre période sur la date de création (n.date)
  if(period){
    const now=new Date(), d=new Date(now);
    if(period==='week'){ const day=d.getDay()||7; d.setDate(d.getDate()-day+1); d.setHours(0,0,0,0); }
    else if(period==='month'){ d.setDate(1); d.setHours(0,0,0,0); }
    else if(period==='month30'){ d.setDate(d.getDate()-30); d.setHours(0,0,0,0); }
    list=list.filter(n=>n.date&&new Date(n.date)>=d);
  }

  if(!list.length){ alert('Aucune non-conformité active à exporter pour cette sélection.'); return; }

  const periodLabel={'week':'Cette semaine','month':'Mois en cours','month30':'30 derniers jours'}[period]||'Toutes périodes';
  const magLabel=(fMag&&DB.magasins.find(m=>m.id===fMag)?.nom)||'Tous les magasins';

  // Build HTML to render
  const html=`<div style="font-family:Arial,sans-serif;color:#1a1f36;padding:8px">
    ${_pdfLogoHeader(magLabel+(fRay?' · '+fRay:'')+(fCrit?' · '+fCrit:'')+(fStat?' · '+fStat:''))}
    <div style="border-bottom:3px solid #e53935;padding-bottom:14px;margin-bottom:20px;display:flex;justify-content:space-between;align-items:flex-start">
      <div>
        <h2 style="color:#b91c1c;margin:0;font-size:18px">Non-conformités actives</h2>
        <div style="font-size:11px;color:#5a6070;margin-top:4px">${periodLabel}</div>
      </div>
      <div style="display:flex;gap:10px">
        <div style="text-align:center;background:#fdecea;border-radius:8px;padding:10px 14px">
          <div style="font-size:20px;font-weight:700;color:#e53935">${list.filter(n=>n.crit==='Critique').length}</div>
          <div style="font-size:10px;color:#9f1239">Critiques</div>
        </div>
        <div style="text-align:center;background:#fff0e6;border-radius:8px;padding:10px 14px">
          <div style="font-size:20px;font-weight:700;color:#ea580c">${list.filter(n=>n.crit==='Majeure').length}</div>
          <div style="font-size:10px;color:#9a3412">Majeures</div>
        </div>
        <div style="text-align:center;background:#fff8e1;border-radius:8px;padding:10px 14px">
          <div style="font-size:20px;font-weight:700;color:#f59e0b">${list.filter(n=>n.crit==='Mineure').length}</div>
          <div style="font-size:10px;color:#92400e">Mineures</div>
        </div>
      </div>
    </div>
    <table style="width:100%;border-collapse:collapse;font-size:11px">
      <thead>
        <tr style="background:#fdecea">
          <th style="padding:8px 10px;border:1px solid #fca5a5;text-align:left;font-size:10px;color:#b91c1c;text-transform:uppercase;letter-spacing:.4px">N°</th>
          <th style="padding:8px 10px;border:1px solid #fca5a5;text-align:left;font-size:10px;color:#b91c1c;text-transform:uppercase;letter-spacing:.4px">Magasin</th>
          <th style="padding:8px 10px;border:1px solid #fca5a5;text-align:left;font-size:10px;color:#b91c1c;text-transform:uppercase;letter-spacing:.4px">Rayon</th>
          <th style="padding:8px 10px;border:1px solid #fca5a5;text-align:left;font-size:10px;color:#b91c1c;text-transform:uppercase;letter-spacing:.4px">Description</th>
          <th style="padding:8px 10px;border:1px solid #fca5a5;text-align:left;font-size:10px;color:#b91c1c;text-transform:uppercase;letter-spacing:.4px">Criticité</th>
          <th style="padding:8px 10px;border:1px solid #fca5a5;text-align:left;font-size:10px;color:#b91c1c;text-transform:uppercase;letter-spacing:.4px">Échéance</th>
          <th style="padding:8px 10px;border:1px solid #fca5a5;text-align:left;font-size:10px;color:#b91c1c;text-transform:uppercase;letter-spacing:.4px">Statut</th>
          <th style="padding:8px 10px;border:1px solid #fca5a5;text-align:left;font-size:10px;color:#1a4fa0;text-transform:uppercase;letter-spacing:.4px;background:#eef3fb">💬 Suivi (action corrective)</th>
        </tr>
      </thead>
      <tbody>
        ${list.map((n,i)=>{
          const ac=DB.actions.find(x=>x.ncId===n.id);
          const suiviCmt=ac?.cmt||'';
          const critColor=n.crit==='Critique'?'#e53935':n.crit==='Majeure'?'#ea580c':'#f59e0b';
          const statBg=n.statut==='En cours'?'#fff8e1':'#fdecea';
          const statColor=n.statut==='En cours'?'#92400e':'#b91c1c';
          const isEnCours=n.statut==='En cours';
          const late=n.dl&&new Date(n.dl)<new Date()&&n.statut!=='Clôturée';
          return `<tr style="background:${i%2===0?'#fff':'#fafafa'};border-left:3px solid ${critColor}">
            <td style="padding:8px 10px;border:1px solid #e2e6ef;font-size:11px">${n.mag}</td>
            <td style="padding:8px 10px;border:1px solid #e2e6ef;font-size:11px;white-space:nowrap">${n.rayon}</td>
            <td style="padding:8px 10px;border:1px solid #e2e6ef">${n.desc}
              ${(()=>{
                const audit=DB.audits.find(x=>x.id===n.aid);
                const ans=audit&&audit.answers&&Object.values(audit.answers).find(x=>x.q===n.desc);
                const auditPhotos=ans&&ans.photos&&ans.photos.length?`<div style="display:flex;gap:4px;margin-top:6px;flex-wrap:wrap">${ans.photos.map(p=>`<img src="${p}" style="width:60px;height:60px;object-fit:cover;border-radius:4px;border:1px solid #e2e6ef">`).join('')}</div>`:'';
                const alerte=n.isAlert&&DB.alertes.find(x=>x.id===n.aid);
                const alertPhotos=alerte&&alerte.photos&&alerte.photos.length?`<div style="display:flex;gap:4px;margin-top:6px;flex-wrap:wrap">${alerte.photos.map(p=>`<img src="${p}" style="width:60px;height:60px;object-fit:cover;border-radius:4px;border:1px solid #e2e6ef">`).join('')}</div>`:'';
                return auditPhotos||alertPhotos;
              })()}
            </td>
            <td style="padding:8px 10px;border:1px solid #e2e6ef;text-align:center">
              <span style="display:inline-block;padding:2px 7px;border-radius:10px;background:${critColor}18;color:${critColor};font-weight:700;font-size:10px">${n.crit}</span>
            </td>
            <td style="padding:8px 10px;border:1px solid #e2e6ef;font-size:11px;color:${late?'#e53935':'#374151'};font-weight:${late?'700':'400'};white-space:nowrap">${fd(n.dl)}${late?' ⚠':''}</td>
            <td style="padding:8px 10px;border:1px solid #e2e6ef;text-align:center">
              <span style="display:inline-block;padding:2px 7px;border-radius:10px;background:${statBg};color:${statColor};font-weight:600;font-size:10px">${n.statut}</span>
            </td>
            <td style="padding:8px 10px;border:1px solid #e2e6ef;background:${isEnCours&&suiviCmt?'#fffbeb':'#fafafa'}">
              ${suiviCmt
                ?`<span style="font-style:italic;color:${isEnCours?'#92400e':'#6b7280'};font-size:11px;${isEnCours?'font-weight:500':''}">${suiviCmt}</span>`
                :`<span style="color:#c0c4cc;font-size:10px">–</span>`}
            </td>
          </tr>`;
        }).join('')}
      </tbody>
    </table>
  </div>`;

  _renderAndExportPDF(html, 'nc-actives', 'landscape');
}

function exportNCArchivePDF(){
  const mids=visibleMids();
  const afMag=v('flt-arch-mag')||'', afRay=v('flt-arch-ray')||'', period=v('flt-arch-period')||'';
  let arch=[...DB.ncs].reverse().filter(n=>(mids.includes(n.mid)||n.mid==='')&&n.statut==='Clôturée');
  if(afMag) arch=arch.filter(n=>n.mid===afMag);
  if(afRay) arch=arch.filter(n=>n.rayon===afRay);
  if(period){
    const now=new Date(), d=new Date(now);
    if(period==='week'){ const day=d.getDay()||7; d.setDate(d.getDate()-day+1); d.setHours(0,0,0,0); }
    else if(period==='month'){ d.setDate(1); d.setHours(0,0,0,0); }
    else if(period==='month30'){ d.setDate(d.getDate()-30); d.setHours(0,0,0,0); }
    arch=arch.filter(n=>n.closedDate&&new Date(n.closedDate)>=d);
  }
  if(!arch.length){ alert('Aucune NC clôturée à exporter pour cette sélection.'); return; }

  const periodLabel={'week':'Cette semaine','month':'Mois en cours','month30':'30 derniers jours'}[period]||'Toutes périodes';
  const magLabel=(afMag&&DB.magasins.find(m=>m.id===afMag)?.nom)||'Tous les magasins';

  const html=`<div style="font-family:Arial,sans-serif;color:#1a1f36;padding:8px">
    ${_pdfLogoHeader(magLabel+(afRay?' · '+afRay:''))}
    <div style="border-bottom:3px solid #16a34a;padding-bottom:14px;margin-bottom:20px;display:flex;justify-content:space-between;align-items:flex-start">
      <div>
        <h2 style="color:#15803d;margin:0;font-size:18px">Non-conformités clôturées</h2>
        <div style="font-size:11px;color:#5a6070;margin-top:4px">${periodLabel}</div>
      </div>
      <div style="text-align:center;background:#dcfce7;border-radius:8px;padding:10px 16px">
        <div style="font-size:24px;font-weight:700;color:#16a34a">${arch.length}</div>
        <div style="font-size:10px;color:#15803d">NC clôturées</div>
      </div>
    </div>
    <table style="width:100%;border-collapse:collapse;font-size:11px">
      <thead>
        <tr style="background:#f0fdf4">
          ${['Magasin','Rayon','Description','Criticité','Clôturée le','💬 Commentaire de suivi'].map(h=>`<th style="padding:8px 10px;border:1px solid #a7f3d0;text-align:left;font-size:10px;text-transform:uppercase;letter-spacing:.4px;color:#15803d${h.includes('💬')?';background:#eef3fb;color:#1a4fa0':''}">${h}</th>`).join('')}
        </tr>
      </thead>
      <tbody>
        ${arch.map((n,i)=>{
          const ac=DB.actions.find(x=>x.ncId===n.id);
          const suiviCmt=n.cmt||ac?.cmt||'';
          const critColor=n.crit==='Critique'?'#e53935':n.crit==='Majeure'?'#ea580c':'#f59e0b';
          return `<tr style="background:${i%2===0?'#fff':'#f0fdf4'};border-left:3px solid ${critColor}">
            <td style="padding:8px 10px;border:1px solid #d1fae5;font-size:11px">${n.mag}</td>
            <td style="padding:8px 10px;border:1px solid #d1fae5;font-size:11px;white-space:nowrap">${n.rayon}</td>
            <td style="padding:8px 10px;border:1px solid #d1fae5">${n.desc}
              ${(()=>{
                const audit=DB.audits.find(x=>x.id===n.aid);
                const ans=audit&&audit.answers&&Object.values(audit.answers).find(x=>x.q===n.desc);
                const auditPhotos=ans&&ans.photos&&ans.photos.length?`<div style="display:flex;gap:4px;margin-top:6px;flex-wrap:wrap">${ans.photos.map(p=>`<img src="${p}" style="width:60px;height:60px;object-fit:cover;border-radius:4px;border:1px solid #d1fae5">`).join('')}</div>`:'';
                const alerte=n.isAlert&&DB.alertes.find(x=>x.id===n.aid);
                const alertPhotos=alerte&&alerte.photos&&alerte.photos.length?`<div style="display:flex;gap:4px;margin-top:6px;flex-wrap:wrap">${alerte.photos.map(p=>`<img src="${p}" style="width:60px;height:60px;object-fit:cover;border-radius:4px;border:1px solid #d1fae5">`).join('')}</div>`:'';
                return auditPhotos||alertPhotos;
              })()}
            </td>
            <td style="padding:8px 10px;border:1px solid #d1fae5;text-align:center">
              <span style="display:inline-block;padding:2px 7px;border-radius:10px;background:${critColor}18;color:${critColor};font-weight:700;font-size:10px">${n.crit}</span>
            </td>
            <td style="padding:8px 10px;border:1px solid #d1fae5;font-size:11px;color:#16a34a;white-space:nowrap">${n.closedDate?fd(n.closedDate):'–'}</td>
            <td style="padding:8px 10px;border:1px solid #d1fae5;background:${suiviCmt?'#f0fdf4':'#fafafa'}">
              ${suiviCmt?`<span style="font-style:italic;color:#15803d;font-size:11px">${suiviCmt}</span>`:'<span style="color:#c0c4cc;font-size:10px">–</span>'}
            </td>
          </tr>`;
        }).join('')}
      </tbody>
    </table>
  </div>`;

  _renderAndExportPDF(html, 'nc-cloturees', 'landscape');
}

function openNCEdit(id){
  const n=DB.ncs.find(x=>x.id===id); if(!n) return;
  sv('nc-edit-ncid', id);
  el('nc-edit-id').textContent=id;
  el('nc-edit-desc').textContent=n.desc;
  el('nc-edit-statut').value=n.statut;
  sv('nc-edit-cmt', n.cmt||'');
  const dlGroup=el('nc-edit-dl-group');
  if(dlGroup) dlGroup.style.display=CU&&CU.role==='admin'?'':'none';
  sv('nc-edit-dl', n.dl||'');
  openModal('m-nc-edit');
}

function saveNCEdit(){
  const id=v('nc-edit-ncid');
  const n=DB.ncs.find(x=>x.id===id); if(!n) return;
  n.statut=el('nc-edit-statut').value;
  n.cmt=v('nc-edit-cmt').trim();
  if(CU&&CU.role==='admin'){ const dl=v('nc-edit-dl'); if(dl) { n.dl=dl; const ac=DB.actions.find(a=>a.ncId===id); if(ac) ac.ech=dl; } }
  if(n.statut==='Clôturée'&&!n.closedDate) n.closedDate=today();
  const ac=DB.actions.find(a=>a.ncId===id);
  if(ac){
    if(n.statut==='Clôturée') ac.statut='Traitée';
    else if(n.statut==='En cours') ac.statut='En cours';
    else if(n.statut==='Ouverte') ac.statut='Ouverte';
  }
  save(); closeModal('m-nc-edit');
  renderNC();
  if(el('page-actions')?.classList.contains('active')) renderActions();
  const nb=el('nc-bdg'); if(nb) nb.textContent=DB.ncs.filter(x=>x.statut==='Ouverte').length;
}

function cycleNC(id){ const n=DB.ncs.find(x=>x.id===id); if(!n) return; const c=['Ouverte','En cours','Clôturée']; n.statut=c[(c.indexOf(n.statut)+1)%c.length]; save(); renderNC(); }

function toggleAllNC(val){ document.querySelectorAll('.nc-cb').forEach(c=>c.checked=val); }

function exportSelectedNC(){
  const selected=[...document.querySelectorAll('.nc-cb:checked')].map(c=>c.value);
  if(!selected.length){ alert('Sélectionnez au moins une NC.'); return; }
  const mids=visibleMids();
  const fMag=v('flt-nc-mag'), fRay=v('flt-nc-ray'), fCrit=v('flt-nc-crit'), fStat=v('flt-nc-stat');
  const magLabel=(fMag&&DB.magasins.find(m=>m.id===fMag)?.nom)||'Tous les magasins';
  let list=DB.ncs.filter(n=>selected.includes(n.id));
  const html=`<div style="font-family:Arial,sans-serif;color:#1a1f36;padding:8px">
    ${_pdfLogoHeader(magLabel)}
    <div style="border-bottom:3px solid #e53935;padding-bottom:14px;margin-bottom:20px;display:flex;justify-content:space-between;align-items:flex-start">
      <div><h2 style="color:#b91c1c;margin:0;font-size:18px">Non-conformités sélectionnées</h2>
        <div style="font-size:11px;color:#5a6070;margin-top:4px">${list.length} NC · Généré le ${new Date().toLocaleDateString('fr-FR')}</div>
      </div>
    </div>
    <table style="width:100%;border-collapse:collapse;font-size:11px">
      <thead>
        <tr style="background:#fdecea">
          ${['Magasin','Rayon','Description','Criticité','Échéance','Statut','💬 Suivi'].map(h=>`<th style="padding:8px 10px;border:1px solid #fca5a5;text-align:left;font-size:10px;text-transform:uppercase;letter-spacing:.4px;color:#b91c1c${h.includes('💬')?';background:#eef3fb;color:#1a4fa0':''}">${h}</th>`).join('')}
        </tr>
      </thead>
      <tbody>
        ${list.map((n,i)=>{
          const ac=DB.actions.find(x=>x.ncId===n.id);
          const suiviCmt=ac?.cmt||n.cmt||'';
          const critColor=n.crit==='Critique'?'#e53935':n.crit==='Majeure'?'#ea580c':'#f59e0b';
          const statBg=n.statut==='Clôturée'?'#dcfce7':n.statut==='En cours'?'#fff8e1':'#fdecea';
          const statColor=n.statut==='Clôturée'?'#15803d':n.statut==='En cours'?'#92400e':'#b91c1c';
          const late=n.dl&&new Date(n.dl)<new Date()&&n.statut!=='Clôturée';
          const audit=DB.audits.find(x=>x.id===n.aid);
          const ans=audit&&audit.answers&&Object.values(audit.answers).find(x=>x.q===n.desc);
          const photos=ans&&ans.photos&&ans.photos.length?`<div style="display:flex;gap:4px;margin-top:6px;flex-wrap:wrap">${ans.photos.map(p=>`<img src="${p}" style="width:60px;height:60px;object-fit:cover;border-radius:4px;border:1px solid #fca5a5">`).join('')}</div>`:'';
          const alerte=n.isAlert&&DB.alertes.find(x=>x.id===n.aid);
          const alertPhotos=alerte&&alerte.photos&&alerte.photos.length?`<div style="display:flex;gap:4px;margin-top:6px;flex-wrap:wrap">${alerte.photos.map(p=>`<img src="${p}" style="width:60px;height:60px;object-fit:cover;border-radius:4px;border:1px solid #fca5a5">`).join('')}</div>`:'';
          return `<tr style="background:${i%2===0?'#fff':'#fafafa'};border-left:3px solid ${critColor}">
            <td style="padding:8px 10px;border:1px solid #e2e6ef;font-size:11px">${n.mag}</td>
            <td style="padding:8px 10px;border:1px solid #e2e6ef;font-size:11px;white-space:nowrap">${n.rayon}</td>
            <td style="padding:8px 10px;border:1px solid #e2e6ef">${n.desc}${photos||alertPhotos}</td>
            <td style="padding:8px 10px;border:1px solid #e2e6ef;text-align:center"><span style="display:inline-block;padding:2px 7px;border-radius:10px;background:${critColor}18;color:${critColor};font-weight:700;font-size:10px">${n.crit}</span></td>
            <td style="padding:8px 10px;border:1px solid #e2e6ef;font-size:11px;color:${late?'#e53935':'#374151'};font-weight:${late?'700':'400'};white-space:nowrap">${fd(n.dl)}${late?' ⚠':''}</td>
            <td style="padding:8px 10px;border:1px solid #e2e6ef;text-align:center"><span style="display:inline-block;padding:2px 7px;border-radius:10px;background:${statBg};color:${statColor};font-weight:600;font-size:10px">${n.statut}</span></td>
            <td style="padding:8px 10px;border:1px solid #e2e6ef;background:${suiviCmt?'#fffbeb':'#fafafa'}">${suiviCmt?`<span style="font-style:italic;color:#92400e;font-size:11px">${suiviCmt}</span>`:'<span style="color:#c0c4cc;font-size:10px">–</span>'}</td>
          </tr>`;
        }).join('')}
      </tbody>
    </table>
  </div>`;
  _renderAndExportPDF(html,'nc-selection','landscape');
}

function deleteSelectedNC(){
  const selected=[...document.querySelectorAll('.nc-cb:checked')].map(c=>c.value);
  if(!selected.length){ alert('Sélectionnez au moins une NC.'); return; }
  if(!confirm('Supprimer '+selected.length+' NC et leurs actions associées ?')) return;
  selected.forEach(id=>{
    DB.actions=DB.actions.filter(a=>a.ncId!==id);
    DB.ncs=DB.ncs.filter(n=>n.id!==id);
    sbDeleteWhere('ncs','id',id);
    sbDeleteWhere('actions','ncId',id);
  });
  save(['ncs','actions']);
  renderNC();
}