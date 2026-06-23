// ══════════════════════════════════════════════════════════════
// RAPPORT-QUALIMETRE — Génération et export du rapport Qualimètre
// Dépend de : storage.js (DB, CU), ui.js
// ══════════════════════════════════════════════════════════════

// ─────────────────────────────────────────────
// 0. TYPEDEFS JSDoc (pour inférence VSCode / TypeScript)
//    ⚠️ Déduits de l'usage dans ce fichier.
// ─────────────────────────────────────────────

/**
 * Réponse enregistrée pour un point de contrôle Qualimètre. Même
 * forme que AuditAnswer (système FSQS, voir audits.js), mais
 * typedef distinct pour ne pas créer de couplage entre les deux
 * systèmes de grille.
 * @typedef {Object} QualAuditAnswer
 * @property {string} q
 * @property {'C'|'NC'|'NA'} [rep]
 * @property {string} [cmt]
 * @property {string[]} [photos]
 */

/**
 * Audit "Qualimètre". Voir dashboard.js pour d'autres propriétés
 * observées (num, nc, zones) ; ce fichier confirme spécifiquement
 * .answers, de même forme que Audit.answers (FSQS).
 * @typedef {Object} QualAudit
 * @property {string} id
 * @property {string} mid
 * @property {string} mag
 * @property {string} date
 * @property {string} aud
 * @property {string} [cmt]
 * @property {number} score
 * @property {Record<string, QualAuditAnswer>} [answers]
 */

/**
 * Entrée intermédiaire représentant une non-conformité Qualimètre
 * avec photos, construite pour l'export PDF des annexes.
 * @typedef {Object} QualNcWithPhotos
 * @property {string} mag
 * @property {string} date
 * @property {string} aud
 * @property {string} q
 * @property {string} cmt
 * @property {string[]} photos
 */

/**
 * Résultat du chargement d'une image en base64 avec ses dimensions
 * naturelles.
 * @typedef {Object} LoadedImage
 * @property {string} data - Data URL base64 (image/jpeg).
 * @property {number} w - Largeur naturelle en pixels.
 * @property {number} h - Hauteur naturelle en pixels.
 */

// ─────────────────────────────────────────────
// 1. CONSTANTES
// ─────────────────────────────────────────────

/**
 * Couleur de score Qualimètre selon la valeur (seuils différents du
 * FSQS : 90/75/60 au lieu de 95/80/70 — voir rapports-fsqs.js).
 * @type {(score: number) => string}
 */
const RQ_SCORE_COLOR = score =>
  score >= 90 ? '#16a34a' :
  score >= 75 ? '#f59e0b' :
  score >= 60 ? '#ea580c' :
               '#e53935';

/**
 * Libellé de score Qualimètre.
 * @type {(score: number) => string}
 */
const RQ_SCORE_LABEL = score =>
  score >= 90 ? 'Excellent' :
  score >= 75 ? 'Satisfaisant' :
  score >= 60 ? 'À améliorer' :
               'Insuffisant';

// ─────────────────────────────────────────────
// 2. LISTE DE SÉLECTION DES AUDITS
// ─────────────────────────────────────────────

/**
 * Affiche la liste des audits Qualimètre sélectionnables (cases à
 * cocher) pour la génération du rapport, filtrée par magasins
 * visibles et par le sélecteur de magasin.
 * @returns {void}
 */
function renderRapportQualimetre() {
  /** @type {string[]} */
  const storeIds = visibleMids();
  populateMagSelect(el('rq-mag'));

  /** @type {string} */
  const filterMag = v('rq-mag');
  /** @type {QualAudit[]} */
  let audits = (DB.qualAudits || []).filter(a => storeIds.includes(a.mid));
  if (filterMag) audits = audits.filter(a => a.mid === filterMag);
  audits = [...audits].reverse();

  el('rq-cnt').textContent = `${audits.length} audit(s) disponible(s)`;

  const listEl = el('rq-audit-list');
  const delBtn = el('rq-del-btn');
  if (delBtn) delBtn.style.display = (CU && CU.role === 'admin') ? '' : 'none';

  if (!audits.length) {
    listEl.innerHTML = '<div class="empty-state" style="padding:16px"><p>Aucun audit Qualimètre.</p></div>';
    return;
  }

  listEl.innerHTML = audits.map(audit => _buildQualAuditCheckboxRow(audit)).join('');

  el('rq-preview').style.display    = 'none';
  el('rq-print-btn').style.display  = 'none';
  el('rq-annexes-btn').style.display = 'none';
}

/**
 * Construit la ligne HTML à case à cocher d'un audit Qualimètre
 * sélectionnable.
 * @param {QualAudit} audit
 * @returns {string}
 */
function _buildQualAuditCheckboxRow(audit) {
  /** @type {number} */
  const ncCount = Object.values(audit.answers || {}).filter(a => a.rep === 'NC').length;
  return `<label style="display:flex;align-items:center;gap:10px;padding:7px 4px;border-bottom:1px solid var(--border);cursor:pointer;font-size:13px">
    <input type="checkbox" class="rq-cb" value="${audit.id}"
           style="width:16px;height:16px;accent-color:#7c3aed;cursor:pointer" checked>
    <span style="flex:1">${audit.mag}</span>
    <span class="tsm tm">${fd(audit.date)} · ${audit.aud}</span>
    <span style="font-weight:700;color:${RQ_SCORE_COLOR(audit.score)}">${audit.score}%</span>
    ${ncCount > 0 ? `<span class="badge b-open">${ncCount} NC</span>` : ''}
  </label>`;
}

/**
 * Coche ou décoche toutes les cases d'audit Qualimètre du rapport.
 * @param {boolean} selectAll
 * @returns {void}
 */
function toggleAllQRap(selectAll) {
  document.querySelectorAll('.rq-cb').forEach(cb => { cb.checked = selectAll; });
}

// ─────────────────────────────────────────────
// 3. GÉNÉRATION DU RAPPORT HTML
// ─────────────────────────────────────────────

/**
 * Génère l'aperçu HTML du rapport Qualimètre à partir des audits
 * cochés, et affiche les boutons d'export (annexes seulement si au
 * moins une NC a des photos).
 * @returns {void}
 */
function genRapportQualimetre() {
  /** @type {string[]} */
  const selectedIds = [...document.querySelectorAll('.rq-cb:checked')].map(cb => cb.value);
  if (!selectedIds.length) { alert('Sélectionnez au moins un audit.'); return; }

  /** @type {QualAudit[]} */
  const audits   = (DB.qualAudits || []).filter(a => selectedIds.includes(a.id));
  /** @type {number} */
  const avgScore = Math.round(audits.reduce((sum, a) => sum + a.score, 0) / audits.length);

  el('rq-body').innerHTML = _buildQualRapportHtml(audits, avgScore);

  /** @type {boolean} */
  const hasAnyPhotos = audits.some(a =>
    Object.values(a.answers || {}).some(ans => ans.rep === 'NC' && ans.photos?.length)
  );

  el('rq-preview').style.display     = '';
  el('rq-print-btn').style.display   = '';
  el('rq-annexes-btn').style.display = hasAnyPhotos ? '' : 'none';
  el('rq-preview').scrollIntoView({ behavior: 'smooth' });
}

// ─────────────────────────────────────────────
// 4. CONSTRUCTION HTML DU RAPPORT
// ─────────────────────────────────────────────

/**
 * Construit le HTML complet du rapport Qualimètre (en-tête + une
 * carte par audit).
 * @param {QualAudit[]} audits
 * @param {number} avgScore
 * @returns {string}
 */
function _buildQualRapportHtml(audits, avgScore) {
  return `<div style="font-family:Arial,sans-serif;color:#1a1f36">
    ${_buildQualRapportHeader(audits.length, avgScore)}
    ${audits.map(audit => _buildQualAuditCard(audit)).join('')}
  </div>`;
}

/**
 * Construit l'en-tête du rapport Qualimètre (logo, titre, date,
 * nombre d'audits, score moyen).
 * @param {number} auditCount
 * @param {number} avgScore
 * @returns {string}
 */
function _buildQualRapportHeader(auditCount, avgScore) {
  return `<div style="border-bottom:3px solid #7c3aed;padding-bottom:16px;margin-bottom:24px;display:flex;justify-content:space-between;align-items:flex-start">
    <div>
      <div style="display:flex;align-items:center;gap:10px;margin-bottom:6px">
        <div style="width:38px;height:38px;background:linear-gradient(135deg,#fbbf24,#f59e0b);border-radius:50%;display:flex;align-items:center;justify-content:center">
          <div style="font-size:8px;font-weight:900;color:#fff;text-align:center;line-height:1.1">QUALI<br>metre</div>
        </div>
        <h2 style="color:#7c3aed;margin:0;font-size:20px">Rapport Qualimètre</h2>
      </div>
      <div style="font-size:12px;color:#5a6070">Généré le ${new Date().toLocaleDateString('fr-FR')} · ${auditCount} audit(s)</div>
    </div>
    <div style="text-align:center">
      <div style="font-size:32px;font-weight:700;color:${RQ_SCORE_COLOR(avgScore)}">${avgScore}%</div>
      <div style="font-size:11px;color:#5a6070">Score moyen</div>
    </div>
  </div>`;
}

/**
 * Construit la carte HTML d'un audit Qualimètre dans le rapport
 * (en-tête, commentaire, résumé de score, sections NC/conformes).
 * @param {QualAudit} audit
 * @returns {string}
 */
function _buildQualAuditCard(audit) {
  /** @type {QualAuditAnswer[]} */
  const allAnswers = Object.values(audit.answers || {});
  /** @type {QualAuditAnswer[]} */
  const ncItems    = allAnswers.filter(a => a.rep === 'NC');
  /** @type {QualAuditAnswer[]} */
  const conformItems = allAnswers.filter(a => a.rep === 'C');
  /** @type {QualAuditAnswer[]} */
  const naItems    = allAnswers.filter(a => a.rep === 'NA');
  /** @type {boolean} */
  const hasPhotos  = ncItems.some(a => a.photos?.length > 0);

  return `<div style="border:1px solid #e2e6ef;border-radius:10px;margin-bottom:24px;overflow:hidden;page-break-inside:avoid">
    <div style="background:linear-gradient(90deg,#f5f3ff,#ede9fe);padding:12px 18px;display:flex;justify-content:space-between;align-items:center">
      <div>
        <div style="font-size:14px;font-weight:700;color:#6d28d9">${audit.mag}</div>
        <div style="font-size:12px;color:#5a6070;margin-top:2px">${fd(audit.date)} · Auditeur : ${audit.aud}</div>
      </div>
    </div>
    <div style="padding:16px 18px">
      ${audit.cmt ? `<div style="font-style:italic;color:#5a6070;font-size:13px;margin-bottom:14px;padding:8px 12px;background:#f9fafb;border-radius:6px">${audit.cmt}</div>` : ''}
      ${_buildQualScoreSummary(audit.score, ncItems.length, conformItems.length, naItems.length, hasPhotos)}
      ${ncItems.length    ? _buildQualNcSection(ncItems)      : ''}
      ${conformItems.length ? _buildQualConformSection(conformItems) : ''}
    </div>
  </div>`;
}

/**
 * Construit le résumé visuel du score d'un audit Qualimètre (cercle
 * de score + compteurs NC/conforme/N-A).
 * @param {number} score
 * @param {number} ncCount
 * @param {number} conformCount
 * @param {number} naCount
 * @param {boolean} hasPhotos
 * @returns {string}
 */
function _buildQualScoreSummary(score, ncCount, conformCount, naCount, hasPhotos) {
  return `<div style="display:flex;align-items:center;gap:16px;margin-bottom:18px;padding:14px 18px;background:#f5f3ff;border-radius:10px">
    <div style="width:72px;height:72px;border-radius:50%;border:5px solid ${RQ_SCORE_COLOR(score)};display:flex;align-items:center;justify-content:center;flex-shrink:0">
      <span style="font-size:20px;font-weight:900;color:${RQ_SCORE_COLOR(score)}">${score}%</span>
    </div>
    <div>
      <div style="font-size:17px;font-weight:700;color:${RQ_SCORE_COLOR(score)}">${RQ_SCORE_LABEL(score)}</div>
      <div style="font-size:12px;color:#5a6070;margin-top:4px">
        ${ncCount} point(s) non conforme(s) · ${conformCount} conforme(s) · ${naCount} N/A
      </div>
      ${hasPhotos ? `<div style="font-size:11px;color:#7c3aed;margin-top:4px">📷 Des photos sont disponibles dans les annexes</div>` : ''}
    </div>
  </div>`;
}

/**
 * Construit la section listant les points non conformes (avec
 * commentaire et photos éventuels).
 * @param {QualAuditAnswer[]} ncItems
 * @returns {string}
 */
function _buildQualNcSection(ncItems) {
  return `<div style="margin-bottom:18px">
    <div style="font-size:12px;font-weight:700;color:#b91c1c;margin-bottom:8px;text-transform:uppercase;letter-spacing:.6px;display:flex;align-items:center;gap:6px">
      <span style="display:inline-block;width:14px;height:14px;background:#e53935;border-radius:50%;color:#fff;font-size:9px;text-align:center;line-height:14px;font-weight:900">✗</span>
      Points non conformes (${ncItems.length})
    </div>
    ${ncItems.map(answer => `
      <div style="border-left:4px solid #e53935;padding:8px 12px;margin-bottom:6px;background:#fff5f5;border-radius:0 6px 6px 0;font-size:12px">
        <div style="font-weight:500">${answer.q}</div>
        ${answer.cmt ? `<div style="font-style:italic;color:#9f1239;margin-top:3px">→ ${answer.cmt}</div>` : ''}
        ${answer.photos?.length ? `<div style="display:flex;gap:6px;margin-top:6px;flex-wrap:wrap">
          ${answer.photos.map(url => `<img src="${url}" style="width:72px;height:72px;object-fit:cover;border-radius:6px;border:2px solid #fca5a5;cursor:pointer" onclick="openPhotoViewer('${url}')">`).join('')}
        </div>` : ''}
      </div>`).join('')}
  </div>`;
}

/**
 * Construit la section listant les points conformes.
 * @param {QualAuditAnswer[]} conformItems
 * @returns {string}
 */
function _buildQualConformSection(conformItems) {
  return `<div>
    <div style="font-size:12px;font-weight:700;color:#15803d;margin-bottom:8px;text-transform:uppercase;letter-spacing:.6px;display:flex;align-items:center;gap:6px">
      <span style="display:inline-block;width:14px;height:14px;background:#16a34a;border-radius:50%;color:#fff;font-size:9px;text-align:center;line-height:14px;font-weight:900">✓</span>
      Points conformes (${conformItems.length})
    </div>
    ${conformItems.map(answer =>
      `<div style="border-left:4px solid #16a34a;padding:7px 12px;margin-bottom:5px;background:#f0fdf4;border-radius:0 6px 6px 0;font-size:12px;color:#166534">${answer.q}</div>`
    ).join('')}
  </div>`;
}

// ─────────────────────────────────────────────
// 5. EXPORT PDF RAPPORT (PORTRAIT)
// ─────────────────────────────────────────────

/**
 * Capture un conteneur HTML avec html2canvas et l'exporte en PDF portrait.
 * Réutilisé pour FSQS et Qualimètre.
 * @param {string} containerId - Id de l'élément DOM source dont le innerHTML sera exporté.
 * @param {string} filename - Nom de fichier sans extension (le '.pdf' est ajouté automatiquement).
 * @returns {void}
 */
function exportPDF(containerId, filename) {
  const source = el(containerId);
  if (!source?.innerHTML.trim()) {
    alert('Aucun rapport à exporter. Générez d\'abord l\'aperçu.');
    return;
  }

  // Feedback visuel sur le bouton déclencheur
  /** @type {HTMLButtonElement | null} */
  const triggerButton = _findExportButton(filename);
  /** @type {string} */
  const originalLabel = _disableExportButton(triggerButton);

  const wrapper = document.createElement('div');
  wrapper.style.cssText = [
    'position:fixed', 'left:-9999px', 'top:0', 'width:794px',
    'min-height:10px', 'background:#fff', 'padding:28px 32px',
    'font-family:Arial,sans-serif', 'color:#1a1f36', 'font-size:12px',
    'line-height:1.5', 'z-index:-1',
  ].join(';');

  wrapper.innerHTML = source.innerHTML;
  wrapper.querySelectorAll('button, select, input, textarea, .btn').forEach(el => el.remove());
  document.body.appendChild(wrapper);

  requestAnimationFrame(() => requestAnimationFrame(() => {
    html2canvas(wrapper, {
      scale: 2, useCORS: true, backgroundColor: '#ffffff',
      scrollX: 0, scrollY: 0, width: 794, windowWidth: 858,
    }).then(canvas => {
      document.body.removeChild(wrapper);
      _renderCanvasToPDF(canvas, filename);
      _restoreExportButton(triggerButton, originalLabel);
    }).catch(error => {
      if (document.body.contains(wrapper)) document.body.removeChild(wrapper);
      _restoreExportButton(triggerButton, originalLabel);
      alert('Erreur génération PDF : ' + error.message);
    });
  }));
}

/**
 * Recherche le bouton déclencheur d'un export par inspection de son
 * attribut onclick (chaîne) contenant le nom de fichier attendu.
 * @param {string} filename
 * @returns {HTMLButtonElement | null}
 */
function _findExportButton(filename) {
  return [...document.querySelectorAll('button')].find(btn => {
    /** @type {string} */
    const handler = btn.onclick?.toString() || btn.getAttribute('onclick') || '';
    return handler.includes(filename);
  }) || null;
}

/**
 * Affiche un état de chargement sur le bouton d'export (icône +
 * texte), le désactive, et retourne son libellé original pour
 * restauration ultérieure.
 * @param {HTMLButtonElement | null} btn
 * @returns {string} Libellé HTML original du bouton, ou chaîne vide si `btn` est null.
 */
function _disableExportButton(btn) {
  if (!btn) return '';
  /** @type {string} */
  const original = btn.innerHTML;
  btn.innerHTML  = '<i class="ti ti-loader" style="display:inline-block;animation:spin .8s linear infinite"></i> Génération…';
  btn.disabled   = true;
  return original;
}

/**
 * Restaure le libellé original et réactive un bouton d'export.
 * @param {HTMLButtonElement | null} btn
 * @param {string} originalLabel
 * @returns {void}
 */
function _restoreExportButton(btn, originalLabel) {
  if (!btn) return;
  btn.innerHTML = originalLabel;
  btn.disabled  = false;
}

/**
 * Découpe un canvas haute résolution en tranches paginées et les
 * insère dans un PDF portrait via jsPDF, puis déclenche le
 * téléchargement.
 * @param {HTMLCanvasElement} canvas
 * @param {string} filename - Nom de fichier sans extension.
 * @returns {void}
 */
function _renderCanvasToPDF(canvas, filename) {
  const { jsPDF }  = window.jspdf;
  /** @type {Object} Instance jsPDF — API non typée en détail ici. */
  const pdf        = new jsPDF({ orientation: 'portrait', unit: 'pt', format: 'a4' });
  /** @type {number} */
  const pdfW       = pdf.internal.pageSize.getWidth();
  /** @type {number} */
  const pdfH       = pdf.internal.pageSize.getHeight();
  /** @type {number} */
  const margin     = 32;
  /** @type {number} */
  const usableW    = pdfW - margin * 2;
  /** @type {number} */
  const ratio      = usableW / (canvas.width / 2);
  /** @type {number} */
  const totalH     = (canvas.height / 2) * ratio;
  /** @type {number} */
  const usableH    = pdfH - margin * 2;
  let   yOffset    = 0;
  let   pageIndex  = 0;

  while (yOffset < totalH) {
    if (pageIndex > 0) pdf.addPage();
    /** @type {number} */
    const slicePt = Math.min(usableH, totalH - yOffset);
    /** @type {number} */
    const slicePx = Math.round((slicePt / ratio) * 2);
    /** @type {number} */
    const startPx = Math.round((yOffset / ratio) * 2);

    const slice   = document.createElement('canvas');
    slice.width   = canvas.width;
    slice.height  = slicePx;
    slice.getContext('2d').drawImage(canvas, 0, startPx, canvas.width, slicePx, 0, 0, canvas.width, slicePx);
    pdf.addImage(slice.toDataURL('image/jpeg', 0.92), 'JPEG', margin, margin, usableW, slicePt);

    yOffset += usableH;
    pageIndex++;
  }

  pdf.save(`${filename}.pdf`);
}

// ─────────────────────────────────────────────
// 6. EXPORT PDF ANNEXES PHOTOS (PAYSAGE)
// ─────────────────────────────────────────────

/**
 * Exporte en PDF (paysage) les annexes photos des NC Qualimètre des
 * audits sélectionnés (2 NC par page).
 * @returns {Promise<void>}
 */
async function exportAnnexesQualimetre() {
  /** @type {string[]} */
  const selectedIds = [...document.querySelectorAll('.rq-cb:checked')].map(cb => cb.value);
  if (!selectedIds.length) { alert('Sélectionnez au moins un audit.'); return; }

  /** @type {QualAudit[]} */
  const audits = (DB.qualAudits || []).filter(a => selectedIds.includes(a.id));
  /** @type {QualNcWithPhotos[]} */
  const ncWithPhotos = _collectQualNcWithPhotos(audits);

  if (!ncWithPhotos.length) {
    alert('Aucune non-conformité avec photo dans la sélection.');
    return;
  }

  const annexBtn    = el('rq-annexes-btn');
  /** @type {string} */
  const originalLabel = _disableExportButton(annexBtn);

  try {
    const { jsPDF } = window.jspdf;
    /** @type {Object} Instance jsPDF — API non typée en détail ici. */
    const pdf       = new jsPDF({ orientation: 'landscape', unit: 'pt', format: 'a4' });
    /** @type {number} */
    const pageW     = pdf.internal.pageSize.getWidth();
    /** @type {number} */
    const pageH     = pdf.internal.pageSize.getHeight();
    /** @type {number} */
    const margin    = 28;
    /** @type {number} */
    const colW      = (pageW - margin * 3) / 2;

    let pageIndex = 0;

    // 2 NC par page
    for (let i = 0; i < ncWithPhotos.length; i += 2) {
      if (pageIndex > 0) pdf.addPage();

      _drawAnnexePageHeader(pdf, pageW, margin);

      /** @type {QualNcWithPhotos[]} */
      const pageItems = [ncWithPhotos[i], ncWithPhotos[i + 1]].filter(Boolean);
      for (let col = 0; col < pageItems.length; col++) {
        /** @type {QualNcWithPhotos} */
        const nc   = pageItems[col];
        /** @type {number} */
        const xPos = margin + col * (colW + margin);
        let   yPos = margin + 14;

        yPos = _drawQualNcHeader(pdf, nc, xPos, yPos, colW);
        await _drawQualNcPhotos(pdf, nc, xPos, yPos, colW, pageH, margin);
      }

      pageIndex++;
    }

    pdf.save('annexes-qualimetre.pdf');
  } catch (error) {
    alert('Erreur génération annexes : ' + error.message);
  } finally {
    _restoreExportButton(annexBtn, originalLabel);
  }
}

/**
 * Collecte toutes les NC Qualimètre (réponses 'NC' avec photos) des
 * audits fournis, sous forme d'entrées prêtes pour l'export PDF.
 * @param {QualAudit[]} audits
 * @returns {QualNcWithPhotos[]}
 */
function _collectQualNcWithPhotos(audits) {
  return audits.flatMap(audit =>
    Object.values(audit.answers || {})
      .filter(ans => ans.rep === 'NC' && ans.photos?.length)
      .map(ans => ({
        mag:    audit.mag,
        date:   audit.date,
        aud:    audit.aud,
        q:      ans.q,
        cmt:    ans.cmt || '',
        photos: ans.photos,
      }))
  );
}

/**
 * Dessine l'en-tête de page des annexes (titre + ligne de séparation).
 * @param {Object} pdf - Instance jsPDF.
 * @param {number} pageW
 * @param {number} margin
 * @returns {void}
 */
function _drawAnnexePageHeader(pdf, pageW, margin) {
  pdf.setFontSize(9);
  pdf.setTextColor(150);
  pdf.text('Annexes Qualimètre — Non-conformités avec photos', margin, margin - 6);
  pdf.setDrawColor(180);
  pdf.line(margin, margin, pageW - margin, margin);
}

/**
 * Dessine l'en-tête d'une NC (intitulé, magasin/date/auditeur,
 * commentaire éventuel) dans le PDF, et retourne la position Y
 * suivante disponible.
 * @param {Object} pdf - Instance jsPDF.
 * @param {QualNcWithPhotos} nc
 * @param {number} xPos
 * @param {number} yPos
 * @param {number} colW
 * @returns {number} Position Y après l'en-tête dessiné.
 */
function _drawQualNcHeader(pdf, nc, xPos, yPos, colW) {
  pdf.setFontSize(10);
  pdf.setTextColor(180, 0, 0);
  pdf.setFont(undefined, 'bold');
  /** @type {string[]} */
  const titleLines = pdf.splitTextToSize(nc.q, colW - 4);
  pdf.text(titleLines, xPos, yPos);
  yPos += titleLines.length * 13 + 3;

  pdf.setFontSize(8);
  pdf.setTextColor(80);
  pdf.setFont(undefined, 'normal');
  pdf.text(`${nc.mag} · ${fd(nc.date)} · ${nc.aud}`, xPos, yPos);
  yPos += 12;

  if (nc.cmt) {
    pdf.setFontSize(8);
    pdf.setTextColor(120);
    pdf.setFont(undefined, 'italic');
    /** @type {string[]} */
    const cmtLines = pdf.splitTextToSize('→ ' + nc.cmt, colW - 4);
    pdf.text(cmtLines, xPos, yPos);
    yPos += cmtLines.length * 11 + 4;
    pdf.setFont(undefined, 'normal');
  }

  return yPos;
}

/**
 * Dessine les photos d'une NC dans le PDF, empilées verticalement
 * et redimensionnées pour s'adapter à l'espace restant de la colonne.
 * @param {Object} pdf - Instance jsPDF.
 * @param {QualNcWithPhotos} nc
 * @param {number} xPos
 * @param {number} yPos
 * @param {number} colW
 * @param {number} pageH
 * @param {number} margin
 * @returns {Promise<void>}
 */
async function _drawQualNcPhotos(pdf, nc, xPos, yPos, colW, pageH, margin) {
  /** @type {number} */
  const remainingH = (pageH - margin) - yPos - 4;
  /** @type {number} */
  const photoSlotH = nc.photos.length === 1
    ? remainingH
    : Math.floor((remainingH - 8) / nc.photos.length);

  for (const photoUrl of nc.photos) {
    /** @type {LoadedImage | null} */
    const imageData = await _loadQualImage(photoUrl);
    if (!imageData) continue;

    /** @type {number} */
    const aspect     = imageData.w / imageData.h;
    let imgW         = colW;
    let imgH         = imgW / aspect;
    if (imgH > photoSlotH) { imgH = photoSlotH; imgW = imgH * aspect; }

    // Centrer dans la colonne
    /** @type {number} */
    const imgX = xPos + (colW - imgW) / 2;
    pdf.addImage(imageData.data, 'JPEG', imgX, yPos, imgW, imgH);
    yPos += imgH + 8;
  }
}

/**
 * Charge une image depuis une URL et retourne ses données base64 + dimensions.
 * @param {string} url
 * @returns {Promise<LoadedImage | null>} null si le chargement échoue.
 */
function _loadQualImage(url) {
  return new Promise(resolve => {
    const img       = new Image();
    img.crossOrigin = 'anonymous';
    img.onload = () => {
      const canvas   = document.createElement('canvas');
      canvas.width   = img.naturalWidth;
      canvas.height  = img.naturalHeight;
      canvas.getContext('2d').drawImage(img, 0, 0);
      resolve({ data: canvas.toDataURL('image/jpeg', 0.85), w: img.naturalWidth, h: img.naturalHeight });
    };
    img.onerror = () => resolve(null);
    img.src     = url;
  });
}

// ─────────────────────────────────────────────
// 7. SUPPRESSION DES AUDITS SÉLECTIONNÉS
// ─────────────────────────────────────────────

/**
 * Supprime les audits Qualimètre cochés, à la fois dans Supabase et
 * dans la DB en mémoire, après confirmation.
 * @returns {void}
 */
function deleteSelectedQualAudits() {
  /** @type {string[]} */
  const selectedIds = [...document.querySelectorAll('.rq-cb:checked')].map(cb => cb.value);
  if (!selectedIds.length) { alert('Sélectionnez au moins un audit.'); return; }
  if (!confirm(`Supprimer ${selectedIds.length} audit(s) Qualimètre ?`)) return;

  selectedIds.forEach(id => {
    sbDeleteWhere('qual_audits', 'id', id);
    DB.qualAudits = (DB.qualAudits || []).filter(a => a.id !== id);
  });

  save(['qualAudits']);
  renderRapportQualimetre();
}

// ─────────────────────────────────────────────
// 8. RACCOURCIS D'EXPORT
// ─────────────────────────────────────────────

/** @returns {void} */
function printRapportQualimetre() { exportPDF('rq-body',  'rapport-qualimetre'); }
/** @returns {void} */
function printReportFSQS()        { exportPDF('rap-body', 'rapport-fsqs'); }

/**
 * Affiche le détail d'un audit Qualimètre puis l'exporte
 * directement en PDF (délai pour laisser le DOM se rendre).
 * @param {string} auditId - Référence vers QualAudit.id.
 * @returns {void}
 */
function printSingleQA(auditId) {
  showQualAudit(auditId);
  setTimeout(() => exportPDF('qa-detail-body', `audit-qualimetre-${auditId}`), 400);
}

/**
 * Fonction vide conservée pour compatibilité — était en code mort
 * dans l'original.
 * @returns {void}
 */
function printReport() {}
