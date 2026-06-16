// ══════════════ RAPPORT-QUALIMETRE ══════════════
// Dépend de : storage.js (DB, CU), config.js, ui.js

function renderRapportQualimetre() {
  const mids = visibleMids();
  const sel = el('rq-mag');
  if (sel) {
    const cv = sel.value; while (sel.options.length > 1) sel.remove(1);
    DB.magasins.filter(m => mids.includes(m.id)).forEach(m => {
      const o = document.createElement('option'); o.value = m.id; o.textContent = m.nom; sel.appendChild(o);
    });
    if (cv) sel.value = cv;
  }
  const fMag = v('rq-mag');
  let list = (DB.qualAudits || []).filter(a => mids.includes(a.mid));
  if (fMag) list = list.filter(a => a.mid === fMag);
  list = [...list].reverse();
  el('rq-cnt').textContent = list.length + ' audit(s) disponible(s)';
  const listEl = el('rq-audit-list');
  if (!list.length) { listEl.innerHTML = '<div class="empty-state" style="padding:16px"><p>Aucun audit Qualimètre.</p></div>'; return; }
  const scolor = s => s >= 90 ? '#16a34a' : s >= 75 ? '#f59e0b' : s >= 60 ? '#ea580c' : '#e53935';
  listEl.innerHTML = list.map(a => {
    const nc = Object.values(a.answers || {}).filter(v => v.rep === 'NC').length;
    return `<label style="display:flex;align-items:center;gap:10px;padding:7px 4px;border-bottom:1px solid var(--border);cursor:pointer;font-size:13px">
      <input type="checkbox" class="rq-cb" value="${a.id}" style="width:16px;height:16px;accent-color:#7c3aed;cursor:pointer" checked>
      <span style="flex:1">${a.mag}</span>
      <span class="tsm tm">${fd(a.date)} · ${a.aud}</span>
      <span style="font-weight:700;color:${scolor(a.score)}">${a.score}%</span>
      ${nc > 0 ? `<span class="badge b-open">${nc} NC</span>` : ''}
    </label>`;
  }).join('');
  el('rq-preview').style.display = 'none';
  el('rq-print-btn').style.display = 'none';
  el('rq-annexes-btn').style.display = 'none';
  const delBtn = el('rq-del-btn');
  if (delBtn) delBtn.style.display = CU && CU.role === 'admin' ? '' : 'none';
}

function toggleAllQRap(v) { document.querySelectorAll('.rq-cb').forEach(c => c.checked = v); }

// ── Génération du rapport principal (portrait) ──
function genRapportQualimetre() {
  const selected = [...document.querySelectorAll('.rq-cb:checked')].map(c => c.value);
  if (!selected.length) { alert('Sélectionnez au moins un audit.'); return; }
  const auds = (DB.qualAudits || []).filter(a => selected.includes(a.id));
  const avg = Math.round(auds.reduce((s, a) => s + a.score, 0) / auds.length);
  const scolor = s => s >= 90 ? '#16a34a' : s >= 75 ? '#f59e0b' : s >= 60 ? '#ea580c' : '#e53935';

  const html = `<div style="font-family:Arial,sans-serif;color:#1a1f36">
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
    ${auds.map(a => {
      const allAnswers = Object.values(a.answers || {});
      const ncItems = allAnswers.filter(v => v.rep === 'NC');
      const cItems = allAnswers.filter(v => v.rep === 'C');
      const naItems = allAnswers.filter(v => v.rep === 'NA');
      const hasPhotos = ncItems.some(v => v.photos && v.photos.length > 0);
      return `<div style="border:1px solid #e2e6ef;border-radius:10px;margin-bottom:24px;overflow:hidden;page-break-inside:avoid">
        <div style="background:linear-gradient(90deg,#f5f3ff,#ede9fe);padding:12px 18px;display:flex;justify-content:space-between;align-items:center">
          <div>
            <div style="font-size:14px;font-weight:700;color:#6d28d9">${a.mag}</div>
            <div style="font-size:12px;color:#5a6070;margin-top:2px">${fd(a.date)} · Auditeur : ${a.aud}</div>
          </div>
        </div>
        <div style="padding:16px 18px">
          ${a.cmt ? `<div style="font-style:italic;color:#5a6070;font-size:13px;margin-bottom:14px;padding:8px 12px;background:#f9fafb;border-radius:6px">${a.cmt}</div>` : ''}

          <!-- Score -->
          <div style="display:flex;align-items:center;gap:16px;margin-bottom:18px;padding:14px 18px;background:#f5f3ff;border-radius:10px">
            <div style="width:72px;height:72px;border-radius:50%;border:5px solid ${scolor(a.score)};display:flex;align-items:center;justify-content:center;flex-shrink:0">
              <span style="font-size:20px;font-weight:900;color:${scolor(a.score)}">${a.score}%</span>
            </div>
            <div>
              <div style="font-size:17px;font-weight:700;color:${scolor(a.score)}">${a.score >= 90 ? 'Excellent' : a.score >= 75 ? 'Satisfaisant' : a.score >= 60 ? 'À améliorer' : 'Insuffisant'}</div>
              <div style="font-size:12px;color:#5a6070;margin-top:4px">
                ${ncItems.length} point(s) non conforme(s) · ${cItems.length} conforme(s) · ${naItems.length} N/A
              </div>
              ${hasPhotos ? `<div style="font-size:11px;color:#7c3aed;margin-top:4px"><i class="ti ti-camera"></i> Des photos sont disponibles dans les annexes</div>` : ''}
            </div>
          </div>

          <!-- Points non conformes avec commentaires et photos miniatures -->
          ${ncItems.length ? `
          <div style="margin-bottom:18px">
            <div style="font-size:12px;font-weight:700;color:#b91c1c;margin-bottom:8px;text-transform:uppercase;letter-spacing:.6px;display:flex;align-items:center;gap:6px">
              <span style="display:inline-block;width:14px;height:14px;background:#e53935;border-radius:50%;color:#fff;font-size:9px;text-align:center;line-height:14px;font-weight:900">✗</span>
              Points non conformes (${ncItems.length})
            </div>
            ${ncItems.map(v => `<div style="border-left:4px solid #e53935;padding:8px 12px;margin-bottom:6px;background:#fff5f5;border-radius:0 6px 6px 0;font-size:12px">
              <div style="font-weight:500">${v.q}</div>
              ${v.cmt ? `<div style="font-style:italic;color:#9f1239;margin-top:3px">→ ${v.cmt}</div>` : ''}
              ${(v.photos && v.photos.length) ? `<div style="display:flex;gap:6px;margin-top:6px;flex-wrap:wrap">
                ${v.photos.map(url => `<img src="${url}" style="width:72px;height:72px;object-fit:cover;border-radius:6px;border:2px solid #fca5a5;cursor:pointer" onclick="openPhotoViewer('${url}')">`).join('')}
              </div>` : ''}
            </div>`).join('')}
          </div>` : ''}

          <!-- Points conformes -->
          ${cItems.length ? `
          <div>
            <div style="font-size:12px;font-weight:700;color:#15803d;margin-bottom:8px;text-transform:uppercase;letter-spacing:.6px;display:flex;align-items:center;gap:6px">
              <span style="display:inline-block;width:14px;height:14px;background:#16a34a;border-radius:50%;color:#fff;font-size:9px;text-align:center;line-height:14px;font-weight:900">✓</span>
              Points conformes (${cItems.length})
            </div>
            ${cItems.map(v => `<div style="border-left:4px solid #16a34a;padding:7px 12px;margin-bottom:5px;background:#f0fdf4;border-radius:0 6px 6px 0;font-size:12px;color:#166534">${v.q}</div>`).join('')}
          </div>` : ''}
        </div>
      </div>`;
    }).join('')}
  </div>`;

  el('rq-body').innerHTML = html;
  el('rq-preview').style.display = '';
  el('rq-print-btn').style.display = '';
  // Afficher le bouton annexes seulement s'il y a des photos NC
  const hasAnyPhotos = auds.some(a => Object.values(a.answers || {}).some(v => v.rep === 'NC' && v.photos && v.photos.length));
  const annexBtn = el('rq-annexes-btn');
  if (annexBtn) annexBtn.style.display = hasAnyPhotos ? '' : 'none';
  el('rq-preview').scrollIntoView({ behavior: 'smooth' });
}

// ── Export PDF rapport portrait (identique à avant, amélioré) ──
function exportPDF(bodyId, filename) {
  const src = el(bodyId);
  if (!src || !src.innerHTML.trim()) { alert('Aucun rapport à exporter. Générez d\'abord l\'aperçu.'); return; }
  const btns = [...document.querySelectorAll('button')].filter(b =>
    (b.onclick && b.onclick.toString().includes(filename)) ||
    (b.getAttribute('onclick') && b.getAttribute('onclick').includes(filename)));
  const btn = btns[0] || null;
  const origTxt = btn ? btn.innerHTML : '';
  if (btn) { btn.innerHTML = '<i class="ti ti-loader" style="display:inline-block;animation:spin .8s linear infinite"></i> Génération…'; btn.disabled = true; }

  const wrapper = document.createElement('div');
  wrapper.style.cssText = 'position:fixed;left:-9999px;top:0;width:794px;min-height:10px;background:#fff;padding:28px 32px;font-family:Arial,sans-serif;color:#1a1f36;font-size:12px;line-height:1.5;z-index:-1';
  wrapper.innerHTML = src.innerHTML;
  wrapper.querySelectorAll('button,select,input,textarea,.btn').forEach(e => e.remove());
  document.body.appendChild(wrapper);

  requestAnimationFrame(() => {
    requestAnimationFrame(() => {
      html2canvas(wrapper, { scale: 2, useCORS: true, backgroundColor: '#ffffff', scrollX: 0, scrollY: 0, width: 794, windowWidth: 858 }).then(canvas => {
        document.body.removeChild(wrapper);
        const { jsPDF } = window.jspdf;
        const pdf = new jsPDF({ orientation: 'portrait', unit: 'pt', format: 'a4' });
        const pW = pdf.internal.pageSize.getWidth();
        const pH = pdf.internal.pageSize.getHeight();
        const margin = 32;
        const usableW = pW - margin * 2;
        const canvasW = canvas.width / 2;
        const canvasH = canvas.height / 2;
        const ratio = usableW / canvasW;
        const totalH = canvasH * ratio;
        const usableH = pH - margin * 2;
        let yOffset = 0, pageNum = 0;
        while (yOffset < totalH) {
          if (pageNum > 0) pdf.addPage();
          const slicePt = Math.min(usableH, totalH - yOffset);
          const slicePx = Math.round((slicePt / ratio) * 2);
          const startPx = Math.round((yOffset / ratio) * 2);
          const slice = document.createElement('canvas');
          slice.width = canvas.width; slice.height = slicePx;
          slice.getContext('2d').drawImage(canvas, 0, startPx, canvas.width, slicePx, 0, 0, canvas.width, slicePx);
          pdf.addImage(slice.toDataURL('image/jpeg', 0.92), 'JPEG', margin, margin, usableW, slicePt);
          yOffset += usableH; pageNum++;
        }
        pdf.save(filename + '.pdf');
        if (btn) { btn.innerHTML = origTxt; btn.disabled = false; }
      }).catch(err => {
        if (document.body.contains(wrapper)) document.body.removeChild(wrapper);
        if (btn) { btn.innerHTML = origTxt; btn.disabled = false; }
        alert('Erreur génération PDF : ' + err.message);
      });
    });
  });
}

// ── Export PDF annexes paysage — 2 NC par page avec photos agrandies ──
async function exportAnnexesQualimetre() {
  const selected = [...document.querySelectorAll('.rq-cb:checked')].map(c => c.value);
  if (!selected.length) { alert('Sélectionnez au moins un audit.'); return; }
  const auds = (DB.qualAudits || []).filter(a => selected.includes(a.id));

  // Collecter toutes les NC avec photos
  const ncWithPhotos = [];
  auds.forEach(a => {
    Object.values(a.answers || {}).filter(v => v.rep === 'NC' && v.photos && v.photos.length).forEach(v => {
      ncWithPhotos.push({ mag: a.mag, date: a.date, aud: a.aud, q: v.q, cmt: v.cmt || '', photos: v.photos });
    });
  });

  if (!ncWithPhotos.length) { alert('Aucune non-conformité avec photo dans la sélection.'); return; }

  const btn = el('rq-annexes-btn');
  const origTxt = btn ? btn.innerHTML : '';
  if (btn) { btn.innerHTML = '<i class="ti ti-loader" style="animation:spin .8s linear infinite"></i> Génération des annexes…'; btn.disabled = true; }

  try {
    const { jsPDF } = window.jspdf;
    const pdf = new jsPDF({ orientation: 'landscape', unit: 'pt', format: 'a4' });
    // A4 paysage : 841.89 × 595.28 pt
    const pW = pdf.internal.pageSize.getWidth();  // ~842
    const pH = pdf.internal.pageSize.getHeight(); // ~595
    const margin = 28;
    const colW = (pW - margin * 3) / 2; // 2 colonnes
    const colH = pH - margin * 2 - 40;  // hauteur utile par colonne (40 pour en-tête page)

    // Charger toutes les images en base64 (useCORS via canvas)
    async function loadImg(url) {
      return new Promise(resolve => {
        const img = new Image(); img.crossOrigin = 'anonymous';
        img.onload = () => {
          const c = document.createElement('canvas'); c.width = img.naturalWidth; c.height = img.naturalHeight;
          c.getContext('2d').drawImage(img, 0, 0);
          resolve({ data: c.toDataURL('image/jpeg', 0.85), w: img.naturalWidth, h: img.naturalHeight });
        };
        img.onerror = () => resolve(null);
        img.src = url;
      });
    }

    let pageNum = 0;
    // 2 NC par page
    for (let i = 0; i < ncWithPhotos.length; i += 2) {
      if (pageNum > 0) pdf.addPage();
      // En-tête page
      pdf.setFontSize(9); pdf.setTextColor(150);
      pdf.text('Annexes Qualimètre — Non-conformités avec photos', margin, margin - 6);
      pdf.setDrawColor(180); pdf.line(margin, margin, pW - margin, margin);

      const cols = [ncWithPhotos[i], ncWithPhotos[i + 1]].filter(Boolean);
      for (let ci = 0; ci < cols.length; ci++) {
        const nc = cols[ci];
        const x = margin + ci * (colW + margin);
        let y = margin + 14;

        // En-tête NC
        pdf.setFontSize(10); pdf.setTextColor(180, 0, 0);
        pdf.setFont(undefined, 'bold');
        const qLines = pdf.splitTextToSize(nc.q, colW - 4);
        pdf.text(qLines, x, y); y += qLines.length * 13 + 3;

        pdf.setFontSize(8); pdf.setTextColor(80); pdf.setFont(undefined, 'normal');
        pdf.text(`${nc.mag} · ${fd(nc.date)} · ${nc.aud}`, x, y); y += 12;

        if (nc.cmt) {
          pdf.setFontSize(8); pdf.setTextColor(120); pdf.setFont(undefined, 'italic');
          const cmtLines = pdf.splitTextToSize('→ ' + nc.cmt, colW - 4);
          pdf.text(cmtLines, x, y); y += cmtLines.length * 11 + 4;
        }
        pdf.setFont(undefined, 'normal');

        // Photos (agrandies, empilées verticalement)
        const remainH = (pH - margin) - y - 4;
        const photoH = nc.photos.length === 1 ? remainH : Math.floor((remainH - 8) / nc.photos.length);
        for (const url of nc.photos) {
          const imgData = await loadImg(url);
          if (!imgData) continue;
          const aspect = imgData.w / imgData.h;
          let iW = colW, iH = iW / aspect;
          if (iH > photoH) { iH = photoH; iW = iH * aspect; }
          // Centrer dans la colonne
          const ix = x + (colW - iW) / 2;
          pdf.addImage(imgData.data, 'JPEG', ix, y, iW, iH);
          y += iH + 8;
        }
      }
      pageNum++;
    }
    pdf.save('annexes-qualimetre.pdf');
  } catch (e) {
    alert('Erreur génération annexes : ' + e.message);
  } finally {
    if (btn) { btn.innerHTML = origTxt; btn.disabled = false; }
  }
}

function printRapportQualimetre() { exportPDF('rq-body', 'rapport-qualimetre'); }
function printReportFSQS() { exportPDF('rap-body', 'rapport-fsqs'); }
function printReport() { }
function printSingleQA(id) {
  const a = (DB.qualAudits || []).find(x => x.id === id); if (!a) return;
  showQualAudit(id); setTimeout(() => exportPDF('qa-detail-body', 'audit-qualimetre-' + id), 400);
}
function deleteSelectedQualAudits() {
  const selected = [...document.querySelectorAll('.rq-cb:checked')].map(c => c.value);
  if (!selected.length) { alert('Sélectionnez au moins un audit.'); return; }
  if (!confirm('Supprimer ' + selected.length + ' audit(s) Qualimètre ?')) return;
  selected.forEach(id => { sbDeleteWhere('qual_audits', 'id', id); DB.qualAudits = (DB.qualAudits || []).filter(a => a.id !== id); });
  save(['qualAudits']); renderRapportQualimetre();
}
