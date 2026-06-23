// ══════════════════════════════════════════════════════════════
// RAPPORTS-FSQS — Génération et export du rapport FSQS
// Dépend de : storage.js (DB, CU), ui.js, nc.js (_pdfLogoHeader)
// ══════════════════════════════════════════════════════════════

// ─────────────────────────────────────────────
// 0. TYPEDEFS JSDoc (pour inférence VSCode / TypeScript)
//    ⚠️ Déduits de l'usage dans ce fichier.
// ─────────────────────────────────────────────

/**
 * Audit FSQS. Voir audits.js pour la définition canonique complète.
 * @typedef {Object} Audit
 * @property {string} id
 * @property {string} mid
 * @property {string} mag
 * @property {string} rayon
 * @property {string} date
 * @property {string} aud
 * @property {string} [cmt]
 * @property {number} score
 * @property {number} nc
 * @property {Record<string, AuditAnswer>} [answers]
 */

/**
 * Réponse enregistrée pour un point de contrôle (voir audits.js).
 * @typedef {Object} AuditAnswer
 * @property {string} q
 * @property {string} [cmt]
 * @property {string[]} [photos]
 */

/**
 * Non-conformité. Voir nc.js/audits.js pour la définition canonique
 * complète.
 * @typedef {Object} NC
 * @property {string} id
 * @property {string} aid
 * @property {string} desc
 * @property {string} crit
 * @property {'Ouverte'|'En cours'|'Clôturée'} statut
 * @property {string} [cmt]
 * @property {boolean} [isAlert]
 */

/**
 * Action corrective. Seule .cmt et .ncId sont accédées dans ce
 * fichier ; structure complète dans actions.js.
 * @typedef {Object} Action
 * @property {string} ncId
 * @property {string} [cmt]
 */

/**
 * Alerte terrain. Seules .id et .photos sont accédées dans ce
 * fichier ; structure complète dans actions.js.
 * @typedef {Object} Alerte
 * @property {string} id
 * @property {string[]} [photos]
 */

/**
 * Entrée d'annexe photo, construite à partir d'une NC illustrée
 * (audit ou alerte), destinée à l'export PDF des annexes.
 * @typedef {Object} Annexe
 * @property {string} mag
 * @property {string} rayon
 * @property {string} date - Déjà formatée pour affichage (résultat de fd()), PAS une date ISO brute.
 * @property {string} desc
 * @property {string} crit
 * @property {string} photo - URL de la photo (Supabase Storage ou base64).
 * @property {string} cmtSaisie - Commentaire de constat (depuis AuditAnswer.cmt ou NC.cmt).
 * @property {string} cmtSuivi - Commentaire de suivi (depuis Action.cmt).
 */

// ─────────────────────────────────────────────
// 1. ÉTAT
// ─────────────────────────────────────────────

/**
 * Annexes photos en attente d'export (peuplé après genRapport).
 * @type {Annexe[]}
 */
let _pendingAnnexes = [];

// ─────────────────────────────────────────────
// 2. LISTE DE SÉLECTION DES AUDITS
// ─────────────────────────────────────────────

/**
 * Affiche la liste des audits sélectionnables (cases à cocher) pour
 * la génération du rapport FSQS, filtrée par magasins visibles et
 * par les sélecteurs UI (magasin, rayon). Masque l'aperçu et les
 * boutons d'export tant qu'un nouveau rapport n'a pas été généré.
 * @returns {void}
 */
function renderRap() {
  /** @type {string[]} */
  const storeIds = visibleMids();
  populateMagSelect(el('r-mag'));

  /** @type {string} */
  const filterMag = v('r-mag');
  /** @type {string} */
  const filterRay = v('r-ray') || '';

  /** @type {Audit[]} */
  let audits = [...DB.audits].reverse().filter(a => storeIds.includes(a.mid));
  if (filterMag && filterMag !== 'all') audits = audits.filter(a => a.mid   === filterMag);
  if (filterRay)                        audits = audits.filter(a => a.rayon === filterRay);

  el('r-cnt').textContent = `${audits.length} audit(s) disponible(s)`;

  const listEl  = el('r-audit-list');
  const delBtn  = el('r-del-btn');

  if (delBtn) delBtn.style.display = (CU && CU.role === 'admin') ? '' : 'none';

  if (!audits.length) {
    listEl.innerHTML = '<div class="empty-state" style="padding:16px"><p>Aucun audit.</p></div>';
    return;
  }

  listEl.innerHTML = audits.map(audit => _buildAuditCheckboxRow(audit)).join('');

  el('rap-preview').style.display  = 'none';
  el('r-print-btn').style.display  = 'none';
}

/**
 * Construit la ligne HTML à case à cocher d'un audit sélectionnable.
 * @param {Audit} audit
 * @returns {string}
 */
function _buildAuditCheckboxRow(audit) {
  return `<label style="display:flex;align-items:center;gap:10px;padding:7px 4px;border-bottom:1px solid var(--border);cursor:pointer;font-size:13px">
    <input type="checkbox" class="r-cb" value="${audit.id}"
           style="width:16px;height:16px;accent-color:var(--primary);cursor:pointer" checked>
    <span style="flex:1">${audit.mag}</span>
    <span class="badge" style="background:var(--bg)">${audit.rayon}</span>
    <span class="tsm tm">${fd(audit.date)}</span>
    <span class="score-badge ${scCls(audit.score)}">${audit.score}%</span>
    ${audit.nc > 0 ? `<span class="badge b-open">${audit.nc} NC</span>` : ''}
  </label>`;
}

/**
 * Coche ou décoche toutes les cases d'audit du rapport.
 * @param {boolean} selectAll
 * @returns {void}
 */
function toggleAllRap(selectAll) {
  document.querySelectorAll('.r-cb').forEach(cb => { cb.checked = selectAll; });
}

// ─────────────────────────────────────────────
// 3. GÉNÉRATION DU RAPPORT HTML
// ─────────────────────────────────────────────

/**
 * Génère l'aperçu HTML du rapport FSQS à partir des audits cochés,
 * collecte les annexes photos correspondantes, et affiche l'aperçu
 * + les boutons d'export.
 * @returns {void}
 */
function genRapport() {
  /** @type {string[]} */
  const selectedIds = [...document.querySelectorAll('.r-cb:checked')].map(cb => cb.value);
  if (!selectedIds.length) { alert('Sélectionnez au moins un audit.'); return; }

  /** @type {Audit[]} */
  const audits  = DB.audits.filter(a => selectedIds.includes(a.id));
  /** @type {number} */
  const avgScore = Math.round(audits.reduce((sum, a) => sum + a.score, 0) / audits.length);
  /** @type {NC[]} */
  const allNcs   = audits.flatMap(a => DB.ncs.filter(nc => nc.aid === a.id));

  el('rap-body').innerHTML = _buildRapportHtml(audits, avgScore, allNcs);

  _pendingAnnexes = _collectAnnexes(audits);

  el('rap-preview').style.display = '';
  el('r-print-btn').style.display = '';
  el('rap-preview').scrollIntoView({ behavior: 'smooth' });
}

// ─────────────────────────────────────────────
// 4. CONSTRUCTION HTML DU RAPPORT
// ─────────────────────────────────────────────

/**
 * Construit le HTML complet du rapport FSQS (en-tête, résumé
 * chiffré, une carte par audit).
 * @param {Audit[]} audits
 * @param {number} avgScore
 * @param {NC[]} allNcs - NC agrégées de tous les audits sélectionnés.
 * @returns {string}
 */
function _buildRapportHtml(audits, avgScore, allNcs) {
  return `<div style="font-family:Arial,sans-serif;color:#1a1f36">
    ${_buildRapportHeader(audits.length, avgScore)}
    ${_buildRapportSummaryGrid(allNcs)}
    ${audits.map(audit => _buildAuditCard(audit)).join('')}
  </div>`;
}

/**
 * Construit l'en-tête du rapport (titre, date de génération, nombre
 * d'audits, score moyen).
 * @param {number} auditCount
 * @param {number} avgScore
 * @returns {string}
 */
function _buildRapportHeader(auditCount, avgScore) {
  return `<div style="border-bottom:3px solid #1a4fa0;padding-bottom:16px;margin-bottom:24px;display:flex;justify-content:space-between;align-items:flex-start">
    <div>
      <h2 style="color:#1a4fa0;margin:0;font-size:20px">Rapport FSQS</h2>
      <div style="font-size:12px;color:#5a6070;margin-top:4px">
        Généré le ${new Date().toLocaleDateString('fr-FR')} · ${auditCount} audit(s) sélectionné(s)
      </div>
    </div>
    <div style="text-align:center">
      <div style="font-size:32px;font-weight:700;color:${sc(avgScore)}">${avgScore}%</div>
      <div style="font-size:11px;color:#5a6070">Score moyen</div>
    </div>
  </div>`;
}

/**
 * Construit la grille de statistiques résumées du rapport (NC
 * totales, ouvertes, en cours, clôturées).
 *
 * ⚠️ NOTE (documentation, pas une correction) : la variable locale
 * `stats` et `totalAudits` ci-dessous ne sont pas utilisées dans le
 * HTML retourné — celui-ci recalcule indépendamment `allNcs.length`.
 * Ce code mort est conservé tel quel (aucune logique modifiée),
 * simplement signalé pour information du développeur.
 * @param {NC[]} allNcs
 * @returns {string}
 */
function _buildRapportSummaryGrid(allNcs) {
  const stats = [
    { bg: '#e8f0fc', color: '#1a4fa0', value: allNcs.length + 1 - allNcs.length + (allNcs.length + 1) - 1, label: 'Audits' },
  ];
  // Recalcul propre sans astuce
  const totalAudits    = DB.audits.length; // non utilisé ici, juste les NC
  /** @type {number} */
  const openCount      = allNcs.filter(n => n.statut === 'Ouverte').length;
  /** @type {number} */
  const inProgressCount = allNcs.filter(n => n.statut === 'En cours').length;
  /** @type {number} */
  const closedCount    = allNcs.filter(n => n.statut === 'Clôturée').length;

  return `<div style="display:grid;grid-template-columns:repeat(4,1fr);gap:10px;margin-bottom:24px">
    <div style="background:#e8f0fc;border-radius:8px;padding:12px;text-align:center">
      <div style="font-size:22px;font-weight:700;color:#1a4fa0">${allNcs.length + 1 - 1}</div>
      <div style="font-size:11px;color:#5a6070">NC totales</div>
    </div>
    <div style="background:#fdecea;border-radius:8px;padding:12px;text-align:center">
      <div style="font-size:22px;font-weight:700;color:#e53935">${openCount}</div>
      <div style="font-size:11px;color:#5a6070">NC ouvertes</div>
    </div>
    <div style="background:#fff8e1;border-radius:8px;padding:12px;text-align:center">
      <div style="font-size:22px;font-weight:700;color:#f59e0b">${inProgressCount}</div>
      <div style="font-size:11px;color:#5a6070">NC en cours</div>
    </div>
    <div style="background:#dcfce7;border-radius:8px;padding:12px;text-align:center">
      <div style="font-size:22px;font-weight:700;color:#16a34a">${closedCount}</div>
      <div style="font-size:11px;color:#5a6070">NC clôturées</div>
    </div>
  </div>`;
}

/**
 * Construit la carte HTML d'un audit dans le rapport (en-tête,
 * commentaire général, tableau des NC liées ou message "aucune NC").
 * @param {Audit} audit
 * @returns {string}
 */
function _buildAuditCard(audit) {
  /** @type {NC[]} */
  const linkedNcs  = DB.ncs.filter(nc => nc.aid === audit.id);
  /** @type {string} */
  const scoreColor = sc(audit.score);
  /** @type {string} */
  const scoreLabel = audit.score >= 95 ? 'Excellent'
    : audit.score >= 80 ? 'Satisfaisant'
    : audit.score >= 70 ? 'À améliorer'
    : 'Non conforme';

  return `<div style="border:1px solid #e2e6ef;border-radius:10px;margin-bottom:20px;overflow:hidden">
    <div style="background:linear-gradient(90deg,#e8f0fc,#f3f5f9);padding:12px 18px;display:flex;justify-content:space-between;align-items:center">
      <div>
        <div style="font-size:14px;font-weight:700;color:#1a4fa0">${audit.mag}</div>
        <div style="font-size:12px;color:#5a6070;margin-top:2px">${audit.rayon} · ${fd(audit.date)} · Auditeur : ${audit.aud}</div>
      </div>
      <div style="text-align:center">
        <div style="font-size:22px;font-weight:700;color:${scoreColor}">${audit.score}%</div>
        <div style="font-size:11px;color:#5a6070">${scoreLabel}</div>
      </div>
    </div>
    <div style="padding:14px 18px">
      ${audit.cmt ? `<div style="font-style:italic;color:#5a6070;font-size:13px;margin-bottom:10px;padding:8px 12px;background:#f9fafb;border-radius:6px">${audit.cmt}</div>` : ''}
      ${linkedNcs.length ? _buildNcTable(linkedNcs, audit) : '<div style="color:#16a34a;font-size:13px;font-weight:500">✓ Aucune non-conformité détectée</div>'}
    </div>
  </div>`;
}

/**
 * Construit le tableau HTML des NC liées à un audit, dans le rapport.
 * @param {NC[]} ncs
 * @param {Audit} audit
 * @returns {string}
 */
function _buildNcTable(ncs, audit) {
  return `<div style="font-size:12px;font-weight:700;color:#b91c1c;margin-bottom:10px;text-transform:uppercase;letter-spacing:.5px;display:flex;align-items:center;gap:6px">
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
      ${ncs.map(nc => _buildNcTableRow(nc, audit)).join('')}
    </tbody>
  </table>`;
}

/**
 * Construit la ligne `<tr>` HTML d'une NC dans le tableau du rapport.
 * @param {NC} nc
 * @param {Audit} audit - Audit d'origine, supposé toujours présent à cet appel.
 * @returns {string}
 */
function _buildNcTableRow(nc, audit) {
  /** @type {Action | undefined} */
  const action     = DB.actions.find(a => a.ncId === nc.id);
  /** @type {string} */
  const suiviCmt   = action?.cmt || '';
  /** @type {string} */
  const critColor  = NC_CRIT_COLORS[nc.crit] || '#888';
  /** @type {string} */
  const statBg     = nc.statut === 'Clôturée' ? '#dcfce7' : nc.statut === 'En cours' ? '#fff8e1' : '#fdecea';
  /** @type {string} */
  const statColor  = nc.statut === 'Clôturée' ? '#15803d' : nc.statut === 'En cours' ? '#92400e' : '#b91c1c';
  /** @type {boolean} */
  const isEnCours  = nc.statut === 'En cours';
  /** @type {string} */
  const photosHtml = _buildNcRowPhotosHtml(nc, audit);

  return `<tr style="border-left:3px solid ${critColor}">
    <td style="padding:8px 10px;border:1px solid #e2e6ef;color:#1a1f36">
      ${nc.desc}
      ${photosHtml}
    </td>
    <td style="padding:8px 10px;border:1px solid #e2e6ef">
      <span style="display:inline-block;padding:2px 8px;border-radius:10px;background:${critColor}20;color:${critColor};font-weight:600;font-size:10px">${nc.crit}</span>
    </td>
    <td style="padding:8px 10px;border:1px solid #e2e6ef">
      <span style="display:inline-block;padding:2px 8px;border-radius:10px;background:${statBg};color:${statColor};font-weight:600;font-size:10px">${nc.statut}</span>
    </td>
    <td style="padding:8px 10px;border:1px solid #e2e6ef;background:${isEnCours && suiviCmt ? '#fffbeb' : '#fafafa'}">
      ${suiviCmt
        ? `<div style="font-style:italic;color:${isEnCours ? '#92400e' : '#6b7280'};font-size:11px${isEnCours ? ';font-weight:500' : ''}">${suiviCmt}</div>`
        : `<span style="color:#c0c4cc;font-size:10px">–</span>`}
    </td>
  </tr>`;
}

/**
 * Construit les commentaire + photos d'une NC dans le tableau du rapport.
 * @param {NC} nc
 * @param {Audit} audit
 * @returns {string}
 */
function _buildNcRowPhotosHtml(nc, audit) {
  /** @type {AuditAnswer | undefined} */
  const answer     = audit?.answers && Object.values(audit.answers).find(a => a.q === nc.desc);
  /** @type {string} */
  const comment    = answer?.cmt || nc.cmt || '';
  /** @type {string[]} */
  const photos     = answer?.photos?.length ? answer.photos : [];
  /** @type {Alerte | false | undefined} */
  const alertEntry = nc.isAlert && DB.alertes.find(a => a.id === nc.aid);
  /** @type {string[]} */
  const alertPhotos = alertEntry?.photos || [];
  /** @type {string[]} */
  const allPhotos  = [...photos, ...alertPhotos];

  /** @type {string} */
  const commentHtml = comment
    ? `<div style="font-style:italic;color:#e53935;margin-top:4px;font-size:11px">→ ${comment}</div>`
    : '';

  /** @type {string} */
  const photosHtml = allPhotos.length
    ? `<div style="display:flex;gap:6px;margin-top:6px;flex-wrap:wrap">
        ${allPhotos.map(p => `<img src="${p}" style="width:72px;height:72px;object-fit:cover;border-radius:6px;border:1px solid #e2e6ef">`).join('')}
       </div>`
    : '';

  return commentHtml + photosHtml;
}

// ─────────────────────────────────────────────
// 5. COLLECTE DES ANNEXES PHOTOS
// ─────────────────────────────────────────────

/**
 * Collecte toutes les entrées d'annexe photo (une par photo) pour
 * les NC liées aux audits fournis, qu'elles proviennent de la
 * réponse d'audit ou d'une alerte terrain liée.
 * @param {Audit[]} audits
 * @returns {Annexe[]}
 */
function _collectAnnexes(audits) {
  return audits.flatMap(audit => {
    /** @type {NC[]} */
    const linkedNcs = DB.ncs.filter(nc => nc.aid === audit.id);
    return linkedNcs.flatMap(nc => {
      /** @type {AuditAnswer | undefined} */
      const answer      = audit.answers && Object.values(audit.answers).find(a => a.q === nc.desc);
      /** @type {string[]} */
      const auditPhotos = answer?.photos || [];

      /** @type {Alerte | false | undefined} */
      const alertEntry  = nc.isAlert && DB.alertes.find(a => a.id === nc.aid);
      /** @type {string[]} */
      const alertPhotos = alertEntry?.photos || [];

      /** @type {string[]} */
      const allPhotos  = [...auditPhotos, ...alertPhotos];
      /** @type {Action | undefined} */
      const action     = DB.actions.find(a => a.ncId === nc.id);
      /** @type {string} */
      const cmtSaisie  = answer?.cmt || nc.cmt || '';
      /** @type {string} */
      const cmtSuivi   = action?.cmt || '';

      return allPhotos.map(photoUrl => ({
        mag:       audit.mag,
        rayon:     audit.rayon,
        date:      fd(audit.date),
        desc:      nc.desc,
        crit:      nc.crit,
        photo:     photoUrl,
        cmtSaisie,
        cmtSuivi,
      }));
    });
  });
}

// ─────────────────────────────────────────────
// 6. EXPORT PDF ANNEXES PHOTOS
// ─────────────────────────────────────────────

/**
 * Exporte les annexes photos en attente en PDF paysage (2 photos
 * par page côte à côte), via jsPDF. Charge chaque image en base64
 * avant insertion (jsPDF ne supporte pas les URLs directes).
 * @returns {void}
 */
function exportAnnexesPDF() {
  if (!_pendingAnnexes.length) return;

  // Délai pour laisser le navigateur rendre avant de lancer jsPDF
  setTimeout(async () => {
    const { jsPDF } = window.jspdf;
    /** @type {Object} Instance jsPDF — API non typée en détail ici. */
    const pdf       = new jsPDF({ orientation: 'landscape', unit: 'pt', format: 'a4' });
    /** @type {number} */
    const pageW     = pdf.internal.pageSize.getWidth();
    /** @type {number} */
    const pageH     = pdf.internal.pageSize.getHeight();
    /** @type {number} */
    const margin    = 32;
    /** @type {number} */
    const colW      = (pageW - margin * 3) / 2;

    for (let i = 0; i < _pendingAnnexes.length; i += 2) {
      if (i > 0) pdf.addPage();

      /** @type {Annexe[]} */
      const pageItems = [_pendingAnnexes[i], _pendingAnnexes[i + 1]].filter(Boolean);

      for (let col = 0; col < pageItems.length; col++) {
        /** @type {Annexe} */
        const annexe = pageItems[col];
        /** @type {number} */
        const xPos   = margin + col * (colW + margin);

        _drawAnnexeHeader(pdf, annexe, xPos, margin, colW);

        let yPos = margin + 68;
        yPos = _drawAnnexeComments(pdf, annexe, xPos, yPos, colW);

        try {
          /** @type {string} */
          const imgData = await _loadImageAsDataURL(annexe.photo);
          pdf.addImage(imgData, 'JPEG', xPos, yPos, colW, pageH - yPos - margin, '', 'FAST');
        } catch (_) {
          pdf.setFontSize(9);
          pdf.setTextColor(150, 150, 150);
          pdf.text('Image non disponible', xPos + 8, yPos + 20);
        }
      }
    }

    pdf.save('annexes-photos.pdf');
  }, 500);
}

/**
 * Dessine l'en-tête d'une annexe (encart coloré + magasin/rayon/date
 * + description + criticité) dans le PDF.
 * @param {Object} pdf - Instance jsPDF.
 * @param {Annexe} annexe
 * @param {number} xPos
 * @param {number} yPos
 * @param {number} colW
 * @returns {void}
 */
function _drawAnnexeHeader(pdf, annexe, xPos, yPos, colW) {
  pdf.setFillColor(232, 240, 252);
  pdf.rect(xPos, yPos, colW, 60, 'F');

  pdf.setFontSize(10);
  pdf.setTextColor(26, 79, 160);
  pdf.setFont(undefined, 'bold');
  pdf.text(`${annexe.mag} - ${annexe.rayon} - ${annexe.date}`, xPos + 8, yPos + 16, { maxWidth: colW - 16 });

  pdf.setFontSize(9);
  pdf.setTextColor(185, 28, 28);
  pdf.text(annexe.desc, xPos + 8, yPos + 30, { maxWidth: colW - 16 });

  pdf.setFontSize(8);
  pdf.setTextColor(90, 96, 112);
  pdf.setFont(undefined, 'normal');
  pdf.text(annexe.crit, xPos + 8, yPos + 44);
}

/**
 * Dessine les commentaires de constat/suivi d'une annexe dans le
 * PDF, et retourne la position Y suivante disponible.
 * @param {Object} pdf - Instance jsPDF.
 * @param {Annexe} annexe
 * @param {number} xPos
 * @param {number} yPos
 * @param {number} colW
 * @returns {number} Position Y après les commentaires dessinés.
 */
function _drawAnnexeComments(pdf, annexe, xPos, yPos, colW) {
  if (annexe.cmtSaisie) {
    pdf.setFontSize(8);
    pdf.setTextColor(229, 57, 53);
    pdf.text(`Constat : ${annexe.cmtSaisie}`, xPos + 8, yPos, { maxWidth: colW - 16 });
    yPos += 14;
  }
  if (annexe.cmtSuivi) {
    pdf.setFontSize(8);
    pdf.setTextColor(146, 64, 14);
    pdf.text(`Suivi : ${annexe.cmtSuivi}`, xPos + 8, yPos, { maxWidth: colW - 16 });
    yPos += 14;
  }
  return yPos;
}

// ─────────────────────────────────────────────
// 7. SUPPRESSION DES AUDITS SÉLECTIONNÉS
// ─────────────────────────────────────────────

/**
 * Supprime les audits cochés ainsi que leurs NC et actions liées,
 * à la fois dans Supabase et dans la DB en mémoire, après confirmation.
 * @returns {void}
 */
function deleteSelectedAudits() {
  /** @type {string[]} */
  const selectedIds = [...document.querySelectorAll('.r-cb:checked')].map(cb => cb.value);
  if (!selectedIds.length) { alert('Sélectionnez au moins un audit.'); return; }
  if (!confirm(`Supprimer ${selectedIds.length} audit(s) et toutes leurs NC/actions associées ?`)) return;

  selectedIds.forEach(auditId => {
    /** @type {string[]} */
    const linkedNcIds = DB.ncs.filter(nc => nc.aid === auditId).map(nc => nc.id);

    linkedNcIds.forEach(ncId => {
      sbDeleteWhere('actions', 'ncId', ncId);
      DB.actions = DB.actions.filter(a => a.ncId !== ncId);
    });

    sbDeleteWhere('ncs',    'aid', auditId);
    sbDeleteWhere('audits', 'id',  auditId);
    DB.ncs    = DB.ncs.filter(nc => nc.aid !== auditId);
    DB.audits = DB.audits.filter(a => a.id  !== auditId);
  });

  save(['audits', 'ncs', 'actions']);
  renderRap();
}

// ─────────────────────────────────────────────
// 8. UTILITAIRE — Chargement image en base64
// ─────────────────────────────────────────────

/**
 * Charge une image depuis une URL et retourne son contenu en base64 (JPEG).
 * Utilisé pour l'intégration dans jsPDF (qui ne supporte pas les URLs directes).
 * @param {string} url
 * @returns {Promise<string>} Data URL base64 (image/jpeg).
 */
function _loadImageAsDataURL(url) {
  return new Promise((resolve, reject) => {
    const img        = new Image();
    img.crossOrigin  = 'anonymous';
    img.onload = () => {
      const canvas = document.createElement('canvas');
      canvas.width  = img.width;
      canvas.height = img.height;
      canvas.getContext('2d').drawImage(img, 0, 0);
      resolve(canvas.toDataURL('image/jpeg', 0.92));
    };
    img.onerror = reject;
    img.src     = url;
  });
}
