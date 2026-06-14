// ══════════════ RAPPORT-QUALIMETRE ══════════════
// Dépend de : storage.js (DB, CU), config.js, ui.js

// ══════════════ RAPPORT QUALIMÈTRE ══════════════
function renderRapportQualimetre(){
  const mids=visibleMids();
  const sel=el('rq-mag');
  if(sel){ const cv=sel.value; while(sel.options.length>1) sel.remove(1); DB.magasins.filter(m=>mids.includes(m.id)).forEach(m=>{ const o=document.createElement('option'); o.value=m.id; o.textContent=m.nom; sel.appendChild(o); }); if(cv) sel.value=cv; }
  const fMag=v('rq-mag');
  let list=(DB.qualAudits||[]).filter(a=>mids.includes(a.mid));
  if(fMag) list=list.filter(a=>a.mid===fMag);
  list=[...list].reverse();
  el('rq-cnt').textContent=list.length+' audit(s) disponible(s)';
  const listEl=el('rq-audit-list');
  if(!list.length){ listEl.innerHTML='<div class="empty-state" style="padding:16px"><p>Aucun audit Qualimètre.</p></div>'; return; }
  const scolor=s=>s>=90?'#16a34a':s>=75?'#f59e0b':s>=60?'#ea580c':'#e53935';
  listEl.innerHTML=list.map(a=>{
    const nc=Object.values(a.answers||{}).filter(v=>v.rep==='NC').length;
    return `<label style="display:flex;align-items:center;gap:10px;padding:7px 4px;border-bottom:1px solid var(--border);cursor:pointer;font-size:13px">
      <input type="checkbox" class="rq-cb" value="${a.id}" style="width:16px;height:16px;accent-color:#7c3aed;cursor:pointer" checked>
      <span style="font-weight:600;color:#7c3aed;min-width:72px">${a.id}</span>
      <span style="flex:1">${a.mag}</span>
      <span class="tsm tm">${fd(a.date)} · ${a.aud}</span>
      <span style="font-weight:700;color:${scolor(a.score)}">${a.score}%</span>
      ${nc>0?`<span class="badge b-open">${nc} NC</span>`:''}
    </label>`;
  }).join('');
  el('rq-preview').style.display='none';
  el('rq-print-btn').style.display='none';
  const delBtn=el('rq-del-btn');
  if(delBtn) delBtn.style.display=CU&&CU.role==='admin'?'':'none';
}
function toggleAllQRap(v){ document.querySelectorAll('.rq-cb').forEach(c=>c.checked=v); }

// ── Impression propre : ouvre une fenêtre dédiée avec uniquement le rapport ──
function genRapportQualimetre(){
  const selected=[...document.querySelectorAll('.rq-cb:checked')].map(c=>c.value);
  if(!selected.length){ alert('Sélectionnez au moins un audit.'); return; }
  const auds=(DB.qualAudits||[]).filter(a=>selected.includes(a.id));
  const avg=Math.round(auds.reduce((s,a)=>s+a.score,0)/auds.length);
  const scolor=s=>s>=90?'#16a34a':s>=75?'#f59e0b':s>=60?'#ea580c':'#e53935';

  const html=`<div style="font-family:Arial,sans-serif;color:#1a1f36">
    <div style="border-bottom:3px solid #7c3aed;padding-bottom:16px;margin-bottom:24px;display:flex;justify-content:space-between;align-items:flex-start">
      <div>
        <div style="display:flex;align-items:center;gap:10px;margin-bottom:6px">
          <div style="width:38px;height:38px;background:linear-gradient(135deg,#fbbf24,#f59e0b);border-radius:50%;display:flex;align-items:center;justify-content:center">
            <div style="font-size:8px;font-weight:900;color:#fff;text-align:center;line-height:1.1">QUALI<br>metre</div>
          </div>
          <h2 style="color:#7c3aed;margin:0;font-size:20px">Rapport Qualimètre</h2>
        </div>
        <div style="font-size:12px;color:#5a6070">Généré le ${new Date().toLocaleDateString('fr-FR')} · ${auds.length} audit(s)</div>
      </div>
      <div style="text-align:center"><div style="font-size:32px;font-weight:700;color:${scolor(avg)}">${avg}%</div><div style="font-size:11px;color:#5a6070">Score moyen</div></div>
    </div>
    ${auds.map(a=>{
      const allAnswers=Object.values(a.answers||{});
      const ncItems=allAnswers.filter(v=>v.rep==='NC');
      const cItems=allAnswers.filter(v=>v.rep==='C');
      const naItems=allAnswers.filter(v=>v.rep==='NA');
      return `<div style="border:1px solid #e2e6ef;border-radius:10px;margin-bottom:24px;overflow:hidden;page-break-inside:avoid">
        <!-- En-tête audit -->
        <div style="background:linear-gradient(90deg,#f5f3ff,#ede9fe);padding:12px 18px;display:flex;justify-content:space-between;align-items:center">
          <div>
            <div style="font-size:14px;font-weight:700;color:#6d28d9">${a.id} — ${a.mag}</div>
            <div style="font-size:12px;color:#5a6070;margin-top:2px">${fd(a.date)} · Auditeur : ${a.aud}</div>
          </div>
        </div>
        <div style="padding:16px 18px">
          ${a.cmt?`<div style="font-style:italic;color:#5a6070;font-size:13px;margin-bottom:14px;padding:8px 12px;background:#f9fafb;border-radius:6px">${a.cmt}</div>`:''}

          <!-- 1. NOTE EN PREMIER -->
          <div style="display:flex;align-items:center;gap:16px;margin-bottom:18px;padding:14px 18px;background:#f5f3ff;border-radius:10px">
            <div style="width:72px;height:72px;border-radius:50%;border:5px solid ${scolor(a.score)};display:flex;align-items:center;justify-content:center;flex-shrink:0">
              <span style="font-size:20px;font-weight:900;color:${scolor(a.score)}">${a.score}%</span>
            </div>
            <div>
              <div style="font-size:17px;font-weight:700;color:${scolor(a.score)}">${a.score>=90?'Excellent':a.score>=75?'Satisfaisant':a.score>=60?'À améliorer':'Insuffisant'}</div>
              <div style="font-size:12px;color:#5a6070;margin-top:4px">
                ${ncItems.length} point(s) non conforme(s) · ${cItems.length} conforme(s) · ${naItems.length} N/A
              </div>
            </div>
          </div>

          <!-- 2. POINTS NON CONFORMES EN 2E -->
          ${ncItems.length?`
          <div style="margin-bottom:18px">
            <div style="font-size:12px;font-weight:700;color:#b91c1c;margin-bottom:8px;text-transform:uppercase;letter-spacing:.6px;display:flex;align-items:center;gap:6px">
              <span style="display:inline-block;width:14px;height:14px;background:#e53935;border-radius:50%;color:#fff;font-size:9px;text-align:center;line-height:14px;font-weight:900">✗</span>
              Points non conformes (${ncItems.length})
            </div>
            ${ncItems.map(v=>`<div style="border-left:4px solid #e53935;padding:8px 12px;margin-bottom:6px;background:#fff5f5;border-radius:0 6px 6px 0;font-size:12px">
              <div style="font-weight:500">${v.q}</div>
              ${v.cmt?`<div style="font-style:italic;color:#9f1239;margin-top:3px">→ ${v.cmt}</div>`:''}
            </div>`).join('')}
          </div>`:''}

          <!-- 3. POINTS CONFORMES EN DERNIER -->
          ${cItems.length?`
          <div>
            <div style="font-size:12px;font-weight:700;color:#15803d;margin-bottom:8px;text-transform:uppercase;letter-spacing:.6px;display:flex;align-items:center;gap:6px">
              <span style="display:inline-block;width:14px;height:14px;background:#16a34a;border-radius:50%;color:#fff;font-size:9px;text-align:center;line-height:14px;font-weight:900">✓</span>
              Points conformes (${cItems.length})
            </div>
            ${cItems.map(v=>`<div style="border-left:4px solid #16a34a;padding:7px 12px;margin-bottom:5px;background:#f0fdf4;border-radius:0 6px 6px 0;font-size:12px;color:#166534">${v.q}</div>`).join('')}
          </div>`:''}
        </div>
      </div>`;
    }).join('')}
  </div>`;

  // Afficher l'aperçu dans la page
  el('rq-body').innerHTML=html;
  el('rq-preview').style.display='';
  el('rq-print-btn').style.display='';
  el('rq-preview').scrollIntoView({behavior:'smooth'});
}

// ── Export PDF — fonctionne en local, sans serveur ──
function exportPDF(bodyId, filename){
  const src=el(bodyId);
  if(!src||!src.innerHTML.trim()){ alert('Aucun rapport à exporter. Générez d\'abord l\'aperçu.'); return; }

  // Feedback sur le bouton
  const btns=[...document.querySelectorAll('button')].filter(b=>b.onclick&&b.onclick.toString().includes(filename)||b.getAttribute('onclick')&&b.getAttribute('onclick').includes(filename));
  const btn=btns[0]||null;
  const origTxt=btn?btn.innerHTML:'';
  if(btn){ btn.innerHTML='<i class="ti ti-loader" style="display:inline-block;animation:spin .8s linear infinite"></i> Génération…'; btn.disabled=true; }

  // Créer un conteneur de rendu hors-écran, largeur A4 fixe
  const wrapper=document.createElement('div');
  wrapper.style.cssText='position:fixed;left:-9999px;top:0;width:794px;min-height:10px;background:#fff;padding:28px 32px;font-family:Arial,sans-serif;color:#1a1f36;font-size:12px;line-height:1.5;z-index:-1';
  wrapper.innerHTML=src.innerHTML;
  // Retirer éléments interactifs
  wrapper.querySelectorAll('button,select,input,textarea,.btn').forEach(e=>e.remove());
  document.body.appendChild(wrapper);

  // Laisser le navigateur rendre le DOM
  requestAnimationFrame(()=>{
    requestAnimationFrame(()=>{
      html2canvas(wrapper,{
        scale:2,
        useCORS:true,
        backgroundColor:'#ffffff',
        scrollX:0,scrollY:0,
        width:794,
        windowWidth:858
      }).then(canvas=>{
        document.body.removeChild(wrapper);
        const {jsPDF}=window.jspdf;
        const pdf=new jsPDF({orientation:'portrait',unit:'pt',format:'a4'});
        const pW=pdf.internal.pageSize.getWidth();   // ~595pt
        const pH=pdf.internal.pageSize.getHeight();  // ~842pt
        const margin=32;
        const usableW=pW-margin*2;
        // canvas is 2x scale — real pixel dimensions are canvas.width/2
        const canvasW=canvas.width/2;
        const canvasH=canvas.height/2;
        const ratio=usableW/canvasW;
        const totalH=canvasH*ratio;
        const usableH=pH-margin*2;
        let yOffset=0;
        let pageNum=0;
        while(yOffset<totalH){
          if(pageNum>0) pdf.addPage();
          // How many pts of content fit on this page
          const slicePt=Math.min(usableH, totalH-yOffset);
          // Convert pt back to canvas pixels (at 2x scale)
          const slicePx=Math.round((slicePt/ratio)*2);
          const startPx=Math.round((yOffset/ratio)*2);
          // Draw this slice onto a temp canvas
          const slice=document.createElement('canvas');
          slice.width=canvas.width;
          slice.height=slicePx;
          slice.getContext('2d').drawImage(canvas,0,startPx,canvas.width,slicePx,0,0,canvas.width,slicePx);
          const imgData=slice.toDataURL('image/jpeg',0.92);
          pdf.addImage(imgData,'JPEG',margin,margin,usableW,slicePt);
          yOffset+=usableH;
          pageNum++;
        }
        pdf.save(filename+'.pdf');
        if(btn){ btn.innerHTML=origTxt; btn.disabled=false; }
      }).catch(err=>{
        if(document.body.contains(wrapper)) document.body.removeChild(wrapper);
        if(btn){ btn.innerHTML=origTxt; btn.disabled=false; }
        alert('Erreur génération PDF : '+err.message);
      });
    });
  });
}

function printRapportQualimetre(){ exportPDF('rq-body','rapport-qualimetre'); }
function printReportFSQS(){ exportPDF('rap-body','rapport-fsqs'); }
function printReport(){}  // no-op — exportPDF used instead
function printSingleQA(id){
  const a=(DB.qualAudits||[]).find(x=>x.id===id); if(!a) return;
  showQualAudit(id); setTimeout(()=>exportPDF('qa-detail-body','audit-qualimetre-'+id),400);
}
function deleteSelectedQualAudits(){
  const selected=[...document.querySelectorAll('.rq-cb:checked')].map(c=>c.value);
  if(!selected.length){ alert('Sélectionnez au moins un audit.'); return; }
  if(!confirm('Supprimer '+selected.length+' audit(s) Qualimètre ?')) return;
  selected.forEach(id=>{
    sbDeleteWhere('qual_audits','id',id);
    DB.qualAudits=(DB.qualAudits||[]).filter(a=>a.id!==id);
  });
  save(['qualAudits']);
  renderRapportQualimetre();
}