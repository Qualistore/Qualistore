// ══════════════════════════════════════════════════════════════
// ANALYSES — Rapports d'analyses (laboratoire, eau, surfaces...)
//
// ⚠️ V2 — traitement des analyses :
//  - PLUSIEURS pièces jointes par rapport, chacune classée
//    « Rapport d'Analyses » ou « Pièce Justificative » ;
//  - Conformité : Conforme / Non conforme (exclusifs) ;
//  - « Actions à mettre en place » (commentaire de traitement) ;
//  - Traitement : Fait (= traité → ARCHIVÉ, non modifiable) /
//    À faire (= en cours de traitement, reste modifiable).
//
// RÈGLES MÉTIER (appliquées dans la modale ET revérifiées à
// l'enregistrement) :
//  - un rapport peut être créé SANS pièce jointe ;
//  - Conforme + pièce jointe → archivage automatique (Fait forcé) ;
//  - Non conforme → « À faire » par défaut ; « Fait » exige du contenu
//    dans « Actions à mettre en place » ET au moins une pièce jointe ;
//  - « Fait » exige dans tous les cas une conformité cochée et au
//    moins une pièce jointe.
// Au passage à « Fait » : traite_par / traite_le renseignés, rapport
// archivé (lecture seule, badge « Traité »).
//
// EXPORT PDF (exportAnalysePDF) — 4 sections dans l'ordre :
//  1. Page de garde (traité par, date d'ouverture, liste centrale des
//     pièces jointes par classement) ;
//  2. Rapport(s) d'Analyse (images insérées, PDF rendus page par page
//     via pdf.js chargé à la demande) ;
//  3. Pièces Justificatives (même rendu) ;
//  4. Page de traitement (dates, actions au centre, traiteur en bas à
//     droite).
//
// Stockage : fichiers TELS QUELS (bucket 'photos', préfixe
// 'analyses/'), métadonnées dans la table Supabase `analyses`.
// Compatibilité : anciens rapports mono-fichier lisibles (_anaDocs).
//
// ⚠️ HORS-LIGNE — AUCUN base64 : file d'attente IndexedDB, contexte
// 'analyse', pointId 'reportId|docId' (ancien format 'reportId' seul
// toujours réconcilié).
// ══════════════════════════════════════════════════════════════

/**
 * Catégorie de classement d'une pièce jointe.
 * @typedef {'rapport'|'justificatif'} AnalyseDocCategorie
 */

/**
 * Pièce jointe d'un rapport d'analyses (colonne jsonb `documents`).
 * @typedef {Object} AnalyseDocument
 * @property {string} id - Identifiant généré (préfixé 'doc-').
 * @property {string} nom - Nom de fichier d'origine.
 * @property {string} mime - Type MIME.
 * @property {number} taille - Taille en octets.
 * @property {number} ajoutLe - Horodatage (Date.now()).
 * @property {string} url - URL publique Supabase Storage ('' si en attente d'envoi).
 * @property {AnalyseDocCategorie} categorie
 */

/**
 * Rapport d'analyses (une ligne de la table Supabase `analyses`).
 * @typedef {Object} AnalyseReport
 * @property {string} id - Identifiant généré (préfixé 'ana-').
 * @property {string} mid - Référence vers Magasin.id.
 * @property {string} libelle - Libellé libre.
 * @property {string} date - Date de l'analyse ('YYYY-MM-DD').
 * @property {AnalyseDocument[]} [documents] - Pièces jointes (absent sur les anciens rapports mono-fichier).
 * @property {''|'conforme'|'nonconforme'} [conforme] - Conformité ('' = non renseignée).
 * @property {string} [actions] - « Actions à mettre en place ».
 * @property {'afaire'|'fait'} [statut] - 'fait' = traité et archivé.
 * @property {string} [traite_par] - Personne ayant traité (colonne snake_case).
 * @property {string} [traite_le] - Date de traitement 'YYYY-MM-DD'.
 * @property {string} aud - Créateur du rapport.
 * @property {number} created - Horodatage de création (date d'ouverture).
 * @property {string} [nom] - LEGACY mono-fichier.
 * @property {string} [mime] - LEGACY mono-fichier.
 * @property {number} [taille] - LEGACY mono-fichier.
 * @property {string} [url] - LEGACY mono-fichier.
 */

/** @type {Record<AnalyseDocCategorie, string>} Libellés des catégories. */
const ANA_CAT_LABELS = { rapport: 'Rapport d\'Analyses', justificatif: 'Pièce Justificative' };

/** @type {number} Pages max d'un PDF joint rendues dans l'export. */
const ANA_PDF_MAX_PAGES_PER_DOC = 25;

/**
 * Pièces jointes de la modale en cours d'édition (documents existants
 * + nouveaux fichiers pas encore uploadés).
 * @type {{file?: File, doc?: AnalyseDocument, categorie: AnalyseDocCategorie}[]}
 */
let _anaWorkingDocs = [];

/** @type {AnalyseDocument[]} Documents existants retirés pendant l'édition. */
let _anaRemovedDocs = [];

/** @type {string | null} Id du rapport en cours de modification (null = création). */
let _anaEditingId = null;

// Réconciliateur hors-ligne — pointId 'reportId|docId' ou legacy 'reportId'.
registerPhotoQueueReconciler('analyse', (entry, url) => {
  /** @type {string[]} */
  const [reportId, docId] = (entry.pointId || '').split('|');
  /** @type {AnalyseReport | undefined} */
  const report = (DB.analyses || []).find(a => a.id === reportId);
  if (!report) return;

  if (docId) {
    /** @type {AnalyseDocument | undefined} */
    const doc = (report.documents || []).find(d => d.id === docId);
    if (!doc) return;
    doc.url = url;
  } else {
    report.url = url; // legacy mono-fichier
  }

  save(['analyses']);
  showToast('Pièce jointe d\'analyse envoyée.', 'success');
  if (document.querySelector('.page.active')?.id === 'page-analyses') renderAnalyses();
});

/**
 * Pièces jointes d'un rapport sous forme unifiée (nouveau format
 * documents[] ou legacy mono-fichier présenté comme un Rapport
 * d'Analyses).
 * @param {AnalyseReport} report
 * @returns {AnalyseDocument[]}
 */
function _anaDocs(report) {
  if (Array.isArray(report.documents)) return report.documents;
  if (report.url || report.nom) {
    return [{
      id: 'doc-legacy-' + report.id, nom: report.nom || 'fichier',
      mime: report.mime || 'application/octet-stream',
      taille: report.taille || 0, ajoutLe: report.created || 0,
      url: report.url || '', categorie: 'rapport',
    }];
  }
  return [];
}

/**
 * Indique si un rapport est traité (Fait coché → archivé).
 * @param {AnalyseReport} report
 * @returns {boolean}
 */
function _anaIsFait(report) { return report.statut === 'fait'; }

/**
 * Extrait le chemin de stockage d'une URL publique Supabase Storage
 * (bucket 'photos') — helper partagé (audits-externes.js, metrologie.js).
 * @param {string} url
 * @returns {string | null}
 */
function _analyseStoragePathFromUrl(url) {
  if (!url) return null;
  /** @type {string} */
  const marker = '/object/public/photos/';
  /** @type {number} */
  const index = url.indexOf(marker);
  if (index === -1) return null;
  return decodeURIComponent(url.slice(index + marker.length));
}

/**
 * Indique si une date appartient à la période de filtre — helper
 * partagé (audits-externes.js).
 * @param {string | undefined} dateString
 * @param {string} period
 * @returns {boolean}
 */
function _anaMatchesPeriod(dateString, period) {
  if (!period || period === 'all') return true;
  if (!dateString) return false;
  /** @type {string} */
  const todayString = today();
  if (period === 'month') return dateString.slice(0, 7) === todayString.slice(0, 7);
  /** @type {number} */
  const days = period === 'month3' ? 92 : 184;
  /** @type {string} */
  const cutoff = new Date(Date.now() - days * 86_400_000).toISOString().split('T')[0];
  return dateString >= cutoff;
}

/**
 * Date de création lisible d'un rapport ('–' si inconnue).
 * @param {AnalyseReport} report
 * @returns {string}
 */
function _anaCreatedDate(report) {
  return report.created ? fd(new Date(report.created).toISOString().split('T')[0]) : '–';
}

/**
 * Affiche la page Analyses : filtres (magasin, période, statut) et
 * tableau (magasin, libellé, date de création, conformité, statut,
 * nb PJ, créateur).
 * @returns {void}
 */
function renderAnalyses() {
  const tbody = el('ana-tb');
  if (!tbody) return;

  populateMagSelect(el('flt-ana-mag'));

  /** @type {string[]} */
  const storeIds = visibleMids();
  /** @type {string} */
  const magFilter = el('flt-ana-mag') ? v('flt-ana-mag') : '';
  /** @type {string} */
  const period = el('flt-ana-period') ? v('flt-ana-period') : 'all';
  /** @type {string} */
  const statutFilter = el('flt-ana-statut') ? v('flt-ana-statut') : '';

  const addBtn = el('btn-add-analyse');
  if (addBtn) addBtn.style.display = hasPerm('analysis_upload') ? '' : 'none';

  /** @type {AnalyseReport[]} */
  const reports = (DB.analyses || [])
    .filter(a => storeIds.includes(a.mid))
    .filter(a => !magFilter || a.mid === magFilter)
    .filter(a => _anaMatchesPeriod(a.date, period))
    .filter(a => !statutFilter || (statutFilter === 'fait' ? _anaIsFait(a) : !_anaIsFait(a)))
    .sort((x, y) => (y.created || 0) - (x.created || 0));

  const countEl = el('ana-cnt');
  if (countEl) countEl.textContent = `${reports.length} rapport(s)`;

  if (!reports.length) {
    tbody.innerHTML = `<tr><td colspan="8"><div class="empty-state" style="padding:24px">
      <i class="ti ti-flask" style="font-size:28px"></i><p>Aucun rapport d'analyses</p>
    </div></td></tr>`;
    return;
  }

  /** @type {boolean} */
  const canUpload = !!hasPerm('analysis_upload');
  /** @type {boolean} */
  const canDelete = !!hasPerm('analysis_delete');

  tbody.innerHTML = reports.map(report => {
    /** @type {{nom: string} | undefined} */
    const store = DB.magasins.find(m => m.id === report.mid);
    /** @type {boolean} */
    const isFait = _anaIsFait(report);
    /** @type {number} */
    const docCount = _anaDocs(report).length;

    /** @type {string} */
    const confBadge =
      report.conforme === 'conforme'    ? '<span class="badge b-done">Conforme</span>' :
      report.conforme === 'nonconforme' ? '<span class="badge b-open">Non conforme</span>' :
      '<span class="tsm tm">–</span>';

    /** @type {string} */
    const statutBadge = isFait
      ? '<span class="badge b-done" title="Traité et archivé — lecture seule">Traité</span>'
      : '<span class="badge b-prog">En cours de traitement</span>';

    return `<tr>
      <td>${store ? _escapeHtml(store.nom) : '–'}</td>
      <td>${_escapeHtml(report.libelle || '')}</td>
      <td>${_anaCreatedDate(report)}</td>
      <td>${confBadge}</td>
      <td>${statutBadge}</td>
      <td style="text-align:center;font-weight:600">${docCount ? `<i class="ti ti-paperclip" style="font-size:12px"></i> ${docCount}` : '–'}</td>
      <td style="font-size:12px;color:var(--text2)">${_escapeHtml(report.aud || '–')}</td>
      <td style="white-space:nowrap">
        <button class="btn btn-secondary btn-sm" onclick="openAnalyseViewModal('${_escapeHtmlAttr(report.id)}')" title="Consulter"><i class="ti ti-eye"></i></button>
        ${canUpload && !isFait ? `<button class="btn btn-secondary btn-sm" onclick="openAnalyseModal('${_escapeHtmlAttr(report.id)}')" title="Modifier / traiter"><i class="ti ti-pencil"></i></button>` : ''}
        <button class="btn btn-secondary btn-sm" onclick="exportAnalysePDF('${_escapeHtmlAttr(report.id)}')" title="Exporter en PDF"><i class="ti ti-file-download"></i></button>
        ${canDelete ? `<button class="btn btn-danger btn-sm" onclick="deleteAnalyse('${_escapeHtmlAttr(report.id)}')" title="Supprimer"><i class="ti ti-trash"></i></button>` : ''}
      </td>
    </tr>`;
  }).join('');
}

/**
 * Ouvre la modale — création (reportId omis) ou modification d'un
 * rapport encore « À faire ».
 * @param {string} [reportId]
 * @returns {void}
 */
function openAnalyseModal(reportId) {
  if (!hasPerm('analysis_upload')) return;

  /** @type {AnalyseReport | undefined} */
  const report = reportId ? (DB.analyses || []).find(a => a.id === reportId) : undefined;
  if (reportId && !report) return;
  if (report && _anaIsFait(report)) {
    showToast('Ce rapport est traité et archivé — il n\'est plus modifiable.', 'warning');
    return;
  }

  populateMagSelect(el('ana-mag'));
  sv('ana-id',      report ? report.id : '');
  sv('ana-mag',     report ? report.mid : '');
  sv('ana-libelle', report ? (report.libelle || '') : '');
  sv('ana-date',    report ? (report.date || today()) : today());
  sv('ana-actions', report ? (report.actions || '') : '');

  el('ana-conf-ok').checked   = report ? report.conforme === 'conforme' : false;
  el('ana-conf-ko').checked   = report ? report.conforme === 'nonconforme' : false;
  el('ana-st-fait').checked   = false;
  el('ana-st-afaire').checked = true;

  _anaEditingId   = report ? report.id : null;
  _anaRemovedDocs = [];
  _anaWorkingDocs = report ? _anaDocs(report).map(doc => ({ doc, categorie: doc.categorie || 'rapport' })) : [];
  _renderAnalyseDocPreviews();

  el('m-analyse-ttl').innerHTML = `<i class="ti ti-flask" style="color:var(--primary)"></i> ${report ? 'Traiter le rapport d\'analyses' : 'Nouveau rapport d\'analyses'}`;

  const errEl = el('ana-err');
  if (errEl) errEl.classList.remove('show');

  _anaApplyAutoRules();
  openModal('m-analyse');
}

/**
 * Ajoute un ou plusieurs fichiers (catégorie « Rapport d'Analyses »
 * par défaut, modifiable par pièce jointe).
 * @param {HTMLInputElement} input
 * @returns {void}
 */
function handleAnalyseFiles(input) {
  [...(input.files || [])].forEach(file => _anaWorkingDocs.push({ file, categorie: 'rapport' }));
  input.value = '';
  _renderAnalyseDocPreviews();
  _anaApplyAutoRules();
}

/**
 * Change la catégorie d'une pièce jointe en attente.
 * @param {number} index
 * @param {AnalyseDocCategorie} categorie
 * @returns {void}
 */
function setAnaDocCategorie(index, categorie) {
  if (_anaWorkingDocs[index]) _anaWorkingDocs[index].categorie = categorie;
}

/**
 * Retire une pièce jointe (un document existant retiré ne sera
 * supprimé du bucket qu'à l'enregistrement).
 * @param {number} index
 * @returns {void}
 */
function removeAnaWorkingDoc(index) {
  /** @type {{file?: File, doc?: AnalyseDocument, categorie: string} | undefined} */
  const entry = _anaWorkingDocs[index];
  if (!entry) return;
  if (entry.doc) _anaRemovedDocs.push(entry.doc);
  _anaWorkingDocs.splice(index, 1);
  _renderAnalyseDocPreviews();
  _anaApplyAutoRules();
}

/**
 * Affiche la liste des pièces jointes de la modale.
 * @returns {void}
 */
function _renderAnalyseDocPreviews() {
  const container = el('ana-docs-prev');
  if (!container) return;

  container.innerHTML = _anaWorkingDocs.map((entry, index) => {
    /** @type {string} */
    const nom = entry.file ? entry.file.name : entry.doc.nom;
    /** @type {string} */
    const mime = entry.file ? entry.file.type : entry.doc.mime;
    /** @type {number} */
    const taille = entry.file ? entry.file.size : entry.doc.taille;
    /** @type {string} */
    const pendingBadge = (entry.doc && !entry.doc.url)
      ? ` <span class="badge b-prog" title="En attente d'envoi"><i class="ti ti-cloud-upload" style="font-size:11px"></i></span>`
      : (entry.file ? ' <span class="badge b-dir" title="Sera uploadé à l\'enregistrement">Nouveau</span>' : '');

    return `<div class="doc-chip">
      <i class="ti ${_alertDocumentIcon(mime)}"></i>
      <span class="doc-name" title="${_escapeHtmlAttr(nom)}">${_escapeHtml(nom)}${pendingBadge}</span>
      <span class="doc-size">${_formatFileSize(taille)}</span>
      <select class="form-control" style="width:auto;font-size:11px;padding:2px 6px;flex-shrink:0" onchange="setAnaDocCategorie(${index},this.value)" title="Classement de la pièce jointe">
        <option value="rapport" ${entry.categorie !== 'justificatif' ? 'selected' : ''}>Rapport d'Analyses</option>
        <option value="justificatif" ${entry.categorie === 'justificatif' ? 'selected' : ''}>Pièce Justificative</option>
      </select>
      <button onclick="removeAnaWorkingDoc(${index})" aria-label="Retirer" title="Retirer"><i class="ti ti-x"></i></button>
    </div>`;
  }).join('');
}

/**
 * Conformité actuellement cochée dans la modale.
 * @returns {''|'conforme'|'nonconforme'}
 */
function _anaConformite() {
  if (el('ana-conf-ok')?.checked) return 'conforme';
  if (el('ana-conf-ko')?.checked) return 'nonconforme';
  return '';
}

/**
 * Indique si « Fait » est autorisé : conformité cochée, ≥ 1 pièce
 * jointe, et si Non conforme du contenu dans les actions.
 * @returns {boolean}
 */
function _anaCanBeFait() {
  /** @type {''|'conforme'|'nonconforme'} */
  const conf = _anaConformite();
  if (!conf) return false;
  if (!_anaWorkingDocs.length) return false;
  if (conf === 'nonconforme' && !v('ana-actions').trim()) return false;
  return true;
}

/**
 * Handler des cases Conforme / Non conforme (exclusives).
 * @param {'conforme'|'nonconforme'} which
 * @returns {void}
 */
function onAnaConformeChange(which) {
  if (which === 'conforme' && el('ana-conf-ok').checked) el('ana-conf-ko').checked = false;
  if (which === 'nonconforme' && el('ana-conf-ko').checked) {
    el('ana-conf-ok').checked = false;
    el('ana-st-fait').checked = false;
    el('ana-st-afaire').checked = true;
  }
  _anaApplyAutoRules();
}

/**
 * Handler des cases Fait / À faire (exclusives) avec règles.
 * @param {'fait'|'afaire'} which
 * @returns {void}
 */
function onAnaStatutChange(which) {
  const faitCb   = el('ana-st-fait');
  const afaireCb = el('ana-st-afaire');

  if (which === 'fait' && faitCb.checked) {
    if (!_anaCanBeFait()) {
      faitCb.checked = false;
      afaireCb.checked = true;
      /** @type {''|'conforme'|'nonconforme'} */
      const conf = _anaConformite();
      showToast(!conf
        ? 'Cochez d\'abord Conforme ou Non conforme.'
        : !_anaWorkingDocs.length
          ? 'Au moins une pièce jointe est requise pour cocher « Fait ».'
          : 'Pour une analyse non conforme, « Actions à mettre en place » est obligatoire pour cocher « Fait ».', 'warning');
    } else {
      afaireCb.checked = false;
    }
  }
  if (which === 'afaire' && afaireCb.checked) {
    if (_anaConformite() === 'conforme' && _anaWorkingDocs.length) {
      afaireCb.checked = false;
      faitCb.checked = true;
      showToast('Conforme avec pièce jointe : le rapport sera archivé à l\'enregistrement.', 'warning');
    } else {
      faitCb.checked = false;
    }
  }
  if (!faitCb.checked && !afaireCb.checked) afaireCb.checked = true;
  _anaApplyAutoRules();
}

/**
 * Applique les règles automatiques et met à jour les aides visuelles.
 * @returns {void}
 */
function _anaApplyAutoRules() {
  /** @type {''|'conforme'|'nonconforme'} */
  const conf = _anaConformite();
  /** @type {number} */
  const docCount = _anaWorkingDocs.length;

  const reqEl = el('ana-actions-req');
  if (reqEl) reqEl.style.display = conf === 'nonconforme' ? '' : 'none';

  if (conf === 'conforme' && docCount > 0) {
    el('ana-st-fait').checked   = true;
    el('ana-st-afaire').checked = false;
  }
  if (el('ana-st-fait').checked && !_anaCanBeFait()) {
    el('ana-st-fait').checked   = false;
    el('ana-st-afaire').checked = true;
  }

  const hintEl = el('ana-statut-hint');
  if (!hintEl) return;
  if (conf === 'conforme' && docCount > 0) {
    hintEl.innerHTML = '<i class="ti ti-archive"></i> Conforme avec pièce jointe : le rapport sera <strong>archivé automatiquement</strong> à l\'enregistrement.';
  } else if (conf === 'nonconforme') {
    hintEl.innerHTML = '<i class="ti ti-info-circle"></i> Non conforme : « Fait » exige du contenu dans « Actions à mettre en place » ET au moins une pièce jointe.';
  } else if (!docCount) {
    hintEl.innerHTML = '<i class="ti ti-info-circle"></i> Le rapport peut être enregistré sans pièce jointe — il restera « À faire » (une pièce jointe est requise pour l\'archiver).';
  } else {
    hintEl.textContent = '';
  }
}

/**
 * Affiche un message d'erreur dans la modale.
 * @param {string} message
 * @returns {void}
 */
function _showAnalyseError(message) {
  const errEl = el('ana-err');
  if (!errEl) return;
  errEl.textContent = message;
  errEl.classList.add('show');
}

/**
 * Valide selon les règles métier, uploade les nouveaux fichiers TELS
 * QUELS, supprime les documents retirés, crée/met à jour le rapport
 * et synchronise. Passage à « Fait » : traite_par / traite_le +
 * archivage.
 * @returns {Promise<void>}
 */
async function saveAnalyse() {
  const errEl = el('ana-err');
  if (errEl) errEl.classList.remove('show');

  /** @type {string} */
  const mid = v('ana-mag');
  /** @type {string} */
  const libelle = v('ana-libelle').trim();
  /** @type {string} */
  const date = v('ana-date');
  /** @type {''|'conforme'|'nonconforme'} */
  const conforme = _anaConformite();
  /** @type {string} */
  const actions = v('ana-actions').trim();

  if (!mid || !libelle || !date) { _showAnalyseError('Merci de renseigner le magasin, le libellé et la date de l\'analyse.'); return; }

  /** @type {number} */
  const docCount = _anaWorkingDocs.length;
  /** @type {'afaire'|'fait'} */
  let statut = el('ana-st-fait').checked ? 'fait' : 'afaire';

  if (conforme === 'conforme' && docCount > 0) statut = 'fait'; // archivage obligatoire

  if (statut === 'fait') {
    if (!conforme)  { _showAnalyseError('Cochez Conforme ou Non conforme avant de valider « Fait ».'); return; }
    if (!docCount)  { _showAnalyseError('Au moins une pièce jointe est requise pour cocher « Fait ».'); return; }
    if (conforme === 'nonconforme' && !actions) {
      _showAnalyseError('Analyse non conforme : « Actions à mettre en place » est obligatoire pour cocher « Fait ».');
      return;
    }
  }

  /** @type {HTMLButtonElement | null} */
  const saveBtn = el('ana-save-btn');
  /** @type {string} */
  const originalLabel = saveBtn ? saveBtn.innerHTML : '';
  if (saveBtn) {
    saveBtn.disabled = true;
    saveBtn.innerHTML = '<i class="ti ti-loader" style="display:inline-block;animation:spin .8s linear infinite"></i> Envoi…';
  }

  try {
    /** @type {AnalyseReport | undefined} */
    const existing = _anaEditingId ? (DB.analyses || []).find(a => a.id === _anaEditingId) : undefined;
    /** @type {string} */
    const reportId = existing ? existing.id : 'ana-' + uid();

    /** @type {AnalyseDocument[]} */
    const documents = [];
    /** @type {number} */
    let queuedCount = 0;

    for (const entry of _anaWorkingDocs) {
      if (entry.doc) {
        documents.push({ ...entry.doc, categorie: /** @type {AnalyseDocCategorie} */ (entry.categorie) });
        continue;
      }
      /** @type {File} */
      const file = entry.file;
      /** @type {string} */
      const ext = file.name.includes('.') ? file.name.split('.').pop().toLowerCase() : 'bin';
      /** @type {string} */
      const storagePath = `analyses/${uid()}.${ext}`;
      /** @type {string | null} */
      const url = await uploadPhotoWithRetry(file, storagePath);

      /** @type {AnalyseDocument} */
      const doc = {
        id: 'doc-' + uid(), nom: file.name,
        mime: file.type || 'application/octet-stream',
        taille: file.size, ajoutLe: Date.now(), url: url || '',
        categorie: /** @type {AnalyseDocCategorie} */ (entry.categorie),
      };
      documents.push(doc);

      if (!url) {
        await queuePendingPhoto({ context: 'analyse', pointId: `${reportId}|${doc.id}`, blob: file, storagePath });
        queuedCount++;
      }
    }

    _anaRemovedDocs.forEach(doc => {
      /** @type {string | null} */
      const storagePath = _analyseStoragePathFromUrl(doc.url);
      if (storagePath) sbDeletePhoto(storagePath);
    });
    if (_anaRemovedDocs.length) {
      /** @type {string[]} */
      const removedIds = _anaRemovedDocs.map(d => d.id);
      getPendingPhotos().then(pending => pending
        .filter(p => p.context === 'analyse' && removedIds.some(id => (p.pointId || '').endsWith(`|${id}`)))
        .forEach(p => removePendingPhoto(p.id)));
    }

    /** @type {boolean} */
    const becomesFait = statut === 'fait' && !(existing && _anaIsFait(existing));

    /** @type {Partial<AnalyseReport>} */
    const fields = {
      mid, libelle, date, documents, conforme, actions, statut,
      traite_par: statut === 'fait' ? (becomesFait ? (CU ? CU.nom : '') : (existing?.traite_par || (CU ? CU.nom : ''))) : '',
      traite_le:  statut === 'fait' ? (becomesFait ? today() : (existing?.traite_le || today())) : '',
      // Neutralise les champs legacy mono-fichier une fois migré.
      nom: null, mime: null, taille: null, url: null,
    };

    if (existing) {
      Object.assign(existing, fields);
    } else {
      DB.analyses = DB.analyses || [];
      DB.analyses.push(/** @type {AnalyseReport} */ ({
        id: reportId, ...fields,
        aud: CU ? CU.nom : '', created: Date.now(),
      }));
    }

    save(['analyses']);

    _anaWorkingDocs = [];
    _anaRemovedDocs = [];
    _anaEditingId = null;
    closeModal('m-analyse');

    if (queuedCount) {
      showToast(`Rapport enregistré — ${queuedCount} fichier(s) en attente d'envoi (départ automatique au retour du réseau).`, 'warning');
    } else if (statut === 'fait') {
      showToast('Rapport traité et archivé.');
    } else {
      showToast('Rapport d\'analyses enregistré.');
    }

    renderAnalyses();
  } finally {
    if (saveBtn) {
      saveBtn.disabled = false;
      saveBtn.innerHTML = originalLabel;
    }
  }
}

/**
 * Ouvre la modale de détail d'un rapport.
 * @param {string} reportId - Référence vers AnalyseReport.id.
 * @returns {void}
 */
function openAnalyseViewModal(reportId) {
  /** @type {AnalyseReport | undefined} */
  const report = (DB.analyses || []).find(a => a.id === reportId);
  if (!report) return;

  /** @type {{nom: string} | undefined} */
  const store = DB.magasins.find(m => m.id === report.mid);
  /** @type {boolean} */
  const isFait = _anaIsFait(report);
  /** @type {AnalyseDocument[]} */
  const docs = _anaDocs(report);

  /**
   * @param {string} label
   * @param {string} valueHtml
   * @returns {string}
   */
  const row = (label, valueHtml) => `<div style="display:flex;justify-content:space-between;gap:12px;padding:6px 0;border-bottom:1px solid var(--border);font-size:13px">
    <span style="color:var(--text2)">${label}</span><span style="font-weight:500;text-align:right">${valueHtml}</span>
  </div>`;

  /**
   * @param {AnalyseDocCategorie} categorie
   * @returns {string}
   */
  const docGroup = (categorie) => {
    /** @type {AnalyseDocument[]} */
    const groupDocs = docs.filter(d => (d.categorie || 'rapport') === categorie);
    if (!groupDocs.length) return '';
    return `<div class="tsm fw6" style="color:var(--text3);text-transform:uppercase;letter-spacing:.04em;margin:12px 0 6px">${ANA_CAT_LABELS[categorie]} (${groupDocs.length})</div>`
      + groupDocs.map(doc => `<div class="doc-chip">
          <i class="ti ${_alertDocumentIcon(doc.mime)}"></i>
          <span class="doc-name" ${doc.url ? `onclick="openDocumentViewer('${_escapeHtmlAttr(doc.url)}','${_escapeHtmlAttr(doc.mime)}','${_escapeHtmlAttr(doc.nom).replace(/'/g, '&#39;')}')"` : ''} title="${_escapeHtmlAttr(doc.nom)}">${_escapeHtml(doc.nom)}</span>
          <span class="doc-size">${_formatFileSize(doc.taille)}</span>
          ${doc.url
            ? `<button onclick="downloadDocument('${_escapeHtmlAttr(doc.url)}','${_escapeHtmlAttr(doc.nom).replace(/'/g, '&#39;')}')" aria-label="Télécharger" title="Télécharger"><i class="ti ti-download"></i></button>`
            : `<span class="badge b-prog" title="En attente d'envoi"><i class="ti ti-cloud-upload" style="font-size:11px"></i></span>`}
        </div>`).join('');
  };

  /** @type {string} */
  const confBadge =
    report.conforme === 'conforme'    ? '<span class="badge b-done">Conforme</span>' :
    report.conforme === 'nonconforme' ? '<span class="badge b-open">Non conforme</span>' : '–';

  el('ana-view-body').innerHTML = `
    ${row('Magasin', store ? _escapeHtml(store.nom) : '–')}
    ${row('Libellé', _escapeHtml(report.libelle || '–'))}
    ${row('Date de l\'analyse', fd(report.date))}
    ${row('Date de création (ouverture)', _anaCreatedDate(report))}
    ${row('Créé par', _escapeHtml(report.aud || '–'))}
    ${row('Conformité', confBadge)}
    ${row('Traitement', isFait
      ? `<span class="badge b-done">Traité</span> <span class="tsm tm">le ${fd(report.traite_le)} par ${_escapeHtml(report.traite_par || '–')}</span>`
      : '<span class="badge b-prog">En cours de traitement</span>')}
    ${report.actions ? `<div style="margin-top:12px">
      <div class="tsm fw6" style="color:var(--text3);text-transform:uppercase;letter-spacing:.04em;margin-bottom:6px">Actions à mettre en place</div>
      <div style="background:var(--bg);border-radius:var(--radius);padding:10px 14px;font-size:13px;white-space:pre-wrap">${_escapeHtml(report.actions)}</div>
    </div>` : ''}
    ${docGroup('rapport')}
    ${docGroup('justificatif')}
    ${docs.length ? '' : '<div class="tsm tm" style="margin-top:12px">Aucune pièce jointe.</div>'}`;

  el('ana-view-foot').innerHTML = `
    <button class="btn btn-secondary" onclick="closeModal('m-analyse-view')">Fermer</button>
    ${!isFait && hasPerm('analysis_upload') ? `<button class="btn btn-secondary" onclick="closeModal('m-analyse-view');openAnalyseModal('${_escapeHtmlAttr(report.id)}')"><i class="ti ti-pencil"></i> Modifier / traiter</button>` : ''}
    <button class="btn btn-primary" onclick="exportAnalysePDF('${_escapeHtmlAttr(report.id)}')"><i class="ti ti-file-download"></i> Exporter PDF</button>`;

  openModal('m-analyse-view');
}

/**
 * Demande confirmation puis supprime un rapport (fichiers, file
 * d'attente, ligne Supabase, entrée locale).
 * @param {string} reportId - Référence vers AnalyseReport.id.
 * @returns {void}
 */
function deleteAnalyse(reportId) {
  if (!hasPerm('analysis_delete')) return;

  /** @type {AnalyseReport | undefined} */
  const report = (DB.analyses || []).find(a => a.id === reportId);
  if (!report) return;

  el('conf-msg').textContent    = `Supprimer le rapport « ${report.libelle} » ?`;
  el('conf-detail').textContent = ` ${_anaDocs(report).length} pièce(s) jointe(s) seront elles aussi définitivement supprimées.`;
  el('conf-ok').onclick = () => {
    _anaDocs(report).forEach(doc => {
      /** @type {string | null} */
      const storagePath = _analyseStoragePathFromUrl(doc.url);
      if (storagePath) sbDeletePhoto(storagePath);
    });
    getPendingPhotos().then(pending => pending
      .filter(p => p.context === 'analyse' && ((p.pointId || '') === reportId || (p.pointId || '').startsWith(`${reportId}|`)))
      .forEach(p => removePendingPhoto(p.id)));

    DB.analyses = (DB.analyses || []).filter(a => a.id !== reportId);
    sbDeleteWhere('analyses', 'id', reportId);
    _saveToLocalStorage();

    closeModal('m-confirm');
    showToast('Rapport supprimé.');
    renderAnalyses();
  };
  openModal('m-confirm');
}

// ─────────────────────────────────────────────
// EXPORT PDF (4 sections, dans l'ordre)
// ─────────────────────────────────────────────

/** @type {number} Marge des pages de l'export PDF (points). */
const _ANA_PDF_MARGIN = 32;

/**
 * Rend un HTML dans une page du PDF. `fullPage` force une page A4
 * entière (page de garde, page de traitement). HTML trop haut =
 * découpé en tranches.
 * @param {Object} pdf - Instance jsPDF.
 * @param {string} html
 * @param {boolean} [first] - Premier contenu du document (pas d'addPage).
 * @param {boolean} [fullPage]
 * @returns {Promise<void>}
 */
async function _anaAddHtmlToPdf(pdf, html, first, fullPage) {
  /** @type {number} */
  const pdfW = pdf.internal.pageSize.getWidth();
  /** @type {number} */
  const pdfH = pdf.internal.pageSize.getHeight();
  /** @type {number} */
  const usableW = pdfW - _ANA_PDF_MARGIN * 2;
  /** @type {number} */
  const usableH = pdfH - _ANA_PDF_MARGIN * 2;

  const wrapper = document.createElement('div');
  /** @type {number} */
  const renderW = 794;
  wrapper.style.cssText = [
    'position:fixed', 'left:-9999px', 'top:0', `width:${renderW}px`,
    'background:#fff', 'font-family:Arial,sans-serif', 'color:#1a1f36',
    'font-size:13px', 'line-height:1.5', 'z-index:-1',
  ].join(';');
  if (fullPage) {
    wrapper.style.height = Math.round(renderW * usableH / usableW) + 'px';
    wrapper.style.overflow = 'hidden';
  }
  wrapper.innerHTML = html;
  document.body.appendChild(wrapper);
  await new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)));

  try {
    /** @type {HTMLCanvasElement} */
    const canvas = await html2canvas(wrapper, { scale: 2, useCORS: true, backgroundColor: '#ffffff' });
    /** @type {number} */
    const totalH = usableW * canvas.height / canvas.width;

    if (!first) pdf.addPage();

    if (totalH <= usableH + 1) {
      pdf.addImage(canvas.toDataURL('image/jpeg', 0.92), 'JPEG', _ANA_PDF_MARGIN, _ANA_PDF_MARGIN, usableW, totalH);
    } else {
      /** @type {number} */
      const ratio = usableW / canvas.width;
      let yOffset = 0;
      let firstSlice = true;
      while (yOffset < totalH) {
        if (!firstSlice) pdf.addPage();
        firstSlice = false;
        /** @type {number} */
        const slicePt = Math.min(usableH, totalH - yOffset);
        /** @type {number} */
        const slicePx = Math.round(slicePt / ratio);
        /** @type {number} */
        const startPx = Math.round(yOffset / ratio);
        const slice  = document.createElement('canvas');
        slice.width  = canvas.width;
        slice.height = slicePx;
        slice.getContext('2d').drawImage(canvas, 0, startPx, canvas.width, slicePx, 0, 0, canvas.width, slicePx);
        pdf.addImage(slice.toDataURL('image/jpeg', 0.92), 'JPEG', _ANA_PDF_MARGIN, _ANA_PDF_MARGIN, usableW, slicePt);
        yOffset += usableH;
      }
    }
  } finally {
    document.body.removeChild(wrapper);
  }
}

/**
 * Ajoute une image (canvas) sur une nouvelle page, ajustée à la zone
 * utile, avec bannière de section et légende éventuelles.
 * @param {Object} pdf - Instance jsPDF.
 * @param {HTMLCanvasElement} canvas
 * @param {string | null} banner
 * @param {string | null} caption
 * @returns {void}
 */
function _anaAddCanvasPage(pdf, canvas, banner, caption) {
  /** @type {number} */
  const pdfW = pdf.internal.pageSize.getWidth();
  /** @type {number} */
  const pdfH = pdf.internal.pageSize.getHeight();
  /** @type {number} */
  const usableW = pdfW - _ANA_PDF_MARGIN * 2;

  pdf.addPage();
  /** @type {number} */
  let topY = _ANA_PDF_MARGIN;

  if (banner) {
    pdf.setFont('helvetica', 'bold');
    pdf.setFontSize(15);
    pdf.setTextColor(37, 99, 235);
    pdf.text(banner, _ANA_PDF_MARGIN, topY + 8);
    pdf.setDrawColor(37, 99, 235);
    pdf.setLineWidth(1.2);
    pdf.line(_ANA_PDF_MARGIN, topY + 14, pdfW - _ANA_PDF_MARGIN, topY + 14);
    topY += 28;
  }
  if (caption) {
    pdf.setFont('helvetica', 'normal');
    pdf.setFontSize(9);
    pdf.setTextColor(110, 110, 110);
    pdf.text(caption.length > 90 ? caption.slice(0, 87) + '…' : caption, _ANA_PDF_MARGIN, topY + 6);
    topY += 16;
  }
  pdf.setTextColor(0, 0, 0);

  /** @type {number} */
  const availH = pdfH - _ANA_PDF_MARGIN - topY;
  /** @type {number} */
  const scale = Math.min(usableW / canvas.width, availH / canvas.height);
  /** @type {number} */
  const drawW = canvas.width * scale;
  /** @type {number} */
  const drawH = canvas.height * scale;
  pdf.addImage(canvas.toDataURL('image/jpeg', 0.9), 'JPEG', _ANA_PDF_MARGIN + (usableW - drawW) / 2, topY, drawW, drawH);
}

/**
 * Page « placeholder » pour une pièce jointe non affichable.
 * @param {Object} pdf - Instance jsPDF.
 * @param {AnalyseDocument} doc
 * @param {string | null} banner
 * @param {string} message
 * @returns {Promise<void>}
 */
async function _anaAddPlaceholderPage(pdf, doc, banner, message) {
  await _anaAddHtmlToPdf(pdf, `
    ${banner ? `<div style="font-size:19px;font-weight:700;color:#2563eb;border-bottom:2px solid #2563eb;padding-bottom:6px;margin-bottom:18px">${_escapeHtml(banner)}</div>` : ''}
    <div style="border:1px dashed #b6bcc8;border-radius:10px;padding:28px 24px;text-align:center;color:#555">
      <div style="font-size:15px;font-weight:600;margin-bottom:6px">${_escapeHtml(doc.nom)}</div>
      <div style="font-size:12px">${_escapeHtml(message)}</div>
      <div style="font-size:11px;color:#999;margin-top:6px">${_escapeHtml(doc.mime || '')} · ${_formatFileSize(doc.taille)}</div>
    </div>`);
}

/**
 * Ajoute une pièce jointe au PDF : image → page dédiée ; PDF → chaque
 * page rendue via pdf.js ; autre/en attente → placeholder. Ne lève
 * jamais (toute erreur retombe sur le placeholder).
 * @param {Object} pdf - Instance jsPDF.
 * @param {AnalyseDocument} doc
 * @param {string | null} banner - Titre de section (première pièce uniquement).
 * @returns {Promise<void>}
 */
async function _anaAddDocToPdf(pdf, doc, banner) {
  if (!doc.url) {
    await _anaAddPlaceholderPage(pdf, doc, banner, 'Fichier en attente d\'envoi — non inclus dans cet export. Réexportez une fois la connexion rétablie.');
    return;
  }

  try {
    if ((doc.mime || '').startsWith('image/')) {
      /** @type {HTMLImageElement} */
      const img = await new Promise((resolve, reject) => {
        const image = new Image();
        image.crossOrigin = 'anonymous';
        image.onload  = () => resolve(image);
        image.onerror = () => reject(new Error('image illisible'));
        image.src = doc.url;
      });
      const canvas = document.createElement('canvas');
      canvas.width  = img.naturalWidth;
      canvas.height = img.naturalHeight;
      canvas.getContext('2d').drawImage(img, 0, 0);
      _anaAddCanvasPage(pdf, canvas, banner, doc.nom);
      return;
    }

    if (doc.mime === 'application/pdf') {
      await _loadScript(CDN_PDFJS); // sans effet si déjà chargé
      pdfjsLib.GlobalWorkerOptions.workerSrc = CDN_PDFJS_WORKER;

      const response = await fetch(doc.url);
      if (!response.ok) throw new Error('HTTP ' + response.status);
      const attachedPdf = await pdfjsLib.getDocument({ data: new Uint8Array(await response.arrayBuffer()) }).promise;
      /** @type {number} */
      const pageCount = Math.min(attachedPdf.numPages, ANA_PDF_MAX_PAGES_PER_DOC);

      for (let pageIndex = 1; pageIndex <= pageCount; pageIndex++) {
        const page = await attachedPdf.getPage(pageIndex);
        const viewport = page.getViewport({ scale: 2 });
        const canvas = document.createElement('canvas');
        canvas.width  = viewport.width;
        canvas.height = viewport.height;
        await page.render({ canvasContext: canvas.getContext('2d'), viewport }).promise;
        _anaAddCanvasPage(pdf, canvas,
          pageIndex === 1 ? banner : null,
          pageIndex === 1 ? `${doc.nom} (${attachedPdf.numPages} page(s))` : `${doc.nom} — page ${pageIndex}`);
      }
      if (attachedPdf.numPages > pageCount) {
        await _anaAddPlaceholderPage(pdf, doc, null, `Document tronqué dans cet export (${pageCount} pages sur ${attachedPdf.numPages}) — consultez le fichier complet depuis l'application.`);
      }
      return;
    }

    await _anaAddPlaceholderPage(pdf, doc, banner, 'Ce type de document ne peut pas être affiché dans l\'export PDF — consultable et téléchargeable depuis l\'application.');
  } catch (err) {
    console.warn('Pièce jointe non incluse dans l\'export PDF :', doc.nom, err);
    await _anaAddPlaceholderPage(pdf, doc, banner, 'Document illisible pendant l\'export (connexion ?) — consultable depuis l\'application.');
  }
}

/**
 * HTML de la page de garde.
 * @param {AnalyseReport} report
 * @returns {string}
 */
function _anaBuildCoverHtml(report) {
  /** @type {{nom: string} | undefined} */
  const store = DB.magasins.find(m => m.id === report.mid);
  /** @type {AnalyseDocument[]} */
  const docs = _anaDocs(report);

  /**
   * @param {AnalyseDocCategorie} categorie
   * @returns {string}
   */
  const docList = (categorie) => {
    /** @type {AnalyseDocument[]} */
    const groupDocs = docs.filter(d => (d.categorie || 'rapport') === categorie);
    return `<div style="margin-bottom:22px">
      <div style="font-size:14px;font-weight:700;color:#2563eb;border-bottom:1px solid #d8dce6;padding-bottom:4px;margin-bottom:8px">${ANA_CAT_LABELS[categorie]} (${groupDocs.length})</div>
      ${groupDocs.length
        ? groupDocs.map(d => `<div style="font-size:12px;padding:3px 0">• ${_escapeHtml(d.nom)} <span style="color:#999">(${_formatFileSize(d.taille)})</span></div>`).join('')
        : '<div style="font-size:12px;color:#999;font-style:italic">Aucune pièce jointe dans cette catégorie.</div>'}
    </div>`;
  };

  /** @type {string} */
  const confHtml =
    report.conforme === 'conforme'    ? '<span style="color:#16a34a;font-weight:700">CONFORME</span>' :
    report.conforme === 'nonconforme' ? '<span style="color:#dc2626;font-weight:700">NON CONFORME</span>' :
    '<span style="color:#999">Conformité non renseignée</span>';

  return `<div style="height:100%;display:flex;flex-direction:column;padding:36px 44px;box-sizing:border-box">
    <div style="text-align:center;margin-bottom:28px">
      <div style="font-size:13px;color:#999;letter-spacing:.12em;text-transform:uppercase;margin-bottom:10px">HygiPerf</div>
      <div style="font-size:26px;font-weight:700;margin-bottom:6px">Rapport d'Analyses</div>
      <div style="font-size:16px;color:#444">${_escapeHtml(report.libelle || '')}</div>
      <div style="font-size:13px;color:#666;margin-top:4px">${store ? _escapeHtml(store.nom) : ''}</div>
      <div style="margin-top:14px;font-size:15px">${confHtml}</div>
    </div>
    <div style="display:flex;justify-content:center;gap:40px;font-size:13px;color:#333;margin-bottom:30px">
      <div><span style="color:#999">Traité par :</span> <strong>${_escapeHtml(report.traite_par || 'Non traité')}</strong></div>
      <div><span style="color:#999">Date d'ouverture :</span> <strong>${_anaCreatedDate(report)}</strong></div>
    </div>
    <div style="flex:1;display:flex;flex-direction:column;justify-content:center;max-width:560px;margin:0 auto;width:100%">
      <div style="font-size:15px;font-weight:700;text-align:center;margin-bottom:18px;color:#1a1f36">Pièces jointes</div>
      ${docList('rapport')}
      ${docList('justificatif')}
    </div>
    <div style="text-align:center;font-size:10px;color:#bbb">Document généré par HygiPerf le ${fd(today())}</div>
  </div>`;
}

/**
 * HTML de la page de traitement.
 * @param {AnalyseReport} report
 * @returns {string}
 */
function _anaBuildTreatmentHtml(report) {
  return `<div style="height:100%;display:flex;flex-direction:column;padding:36px 44px;box-sizing:border-box">
    <div style="font-size:19px;font-weight:700;color:#2563eb;border-bottom:2px solid #2563eb;padding-bottom:6px;margin-bottom:20px">Page de traitement</div>
    <table style="width:100%;border-collapse:collapse;font-size:12px;margin-bottom:10px">
      <tr>
        <td style="padding:8px 12px;border:1px solid #d8dce6;background:#f2f4f8;font-weight:600">Date de l'analyse</td>
        <td style="padding:8px 12px;border:1px solid #d8dce6">${fd(report.date)}</td>
        <td style="padding:8px 12px;border:1px solid #d8dce6;background:#f2f4f8;font-weight:600">Date de création</td>
        <td style="padding:8px 12px;border:1px solid #d8dce6">${_anaCreatedDate(report)}</td>
        <td style="padding:8px 12px;border:1px solid #d8dce6;background:#f2f4f8;font-weight:600">Date de traitement</td>
        <td style="padding:8px 12px;border:1px solid #d8dce6">${report.traite_le ? fd(report.traite_le) : 'Non traité'}</td>
      </tr>
    </table>
    <div style="flex:1;display:flex;flex-direction:column;justify-content:center">
      <div style="font-size:15px;font-weight:700;text-align:center;margin-bottom:14px">Actions à mettre en place</div>
      <div style="border:1px solid #d8dce6;border-radius:10px;background:#fafbfc;padding:22px 26px;font-size:13px;line-height:1.7;white-space:pre-wrap;min-height:120px">${report.actions ? _escapeHtml(report.actions) : '<span style="color:#999;font-style:italic">Aucune action renseignée.</span>'}</div>
    </div>
    <div style="text-align:right;font-size:13px;color:#333;padding-top:24px">
      <div style="color:#999;font-size:11px;margin-bottom:2px">Rapport traité par</div>
      <div style="font-weight:700;font-size:15px">${_escapeHtml(report.traite_par || '—')}</div>
      ${report.traite_le ? `<div style="font-size:11px;color:#666">le ${fd(report.traite_le)}</div>` : ''}
    </div>
  </div>`;
}

/**
 * Exporte un rapport d'analyses en PDF (4 sections dans l'ordre).
 * @param {string} reportId - Référence vers AnalyseReport.id.
 * @returns {Promise<void>}
 */
async function exportAnalysePDF(reportId) {
  /** @type {AnalyseReport | undefined} */
  const report = (DB.analyses || []).find(a => a.id === reportId);
  if (!report) return;

  showToast('Génération du PDF en cours…', 'warning');

  try {
    const { jsPDF } = window.jspdf;
    /** @type {Object} Instance jsPDF. */
    const pdf = new jsPDF({ orientation: 'portrait', unit: 'pt', format: 'a4' });

    // 1. Page de garde
    await _anaAddHtmlToPdf(pdf, _anaBuildCoverHtml(report), true, true);

    // 2. Rapport(s) d'Analyse, puis 3. Pièces Justificatives
    /** @type {AnalyseDocument[]} */
    const docs = _anaDocs(report);
    for (const categorie of /** @type {AnalyseDocCategorie[]} */ (['rapport', 'justificatif'])) {
      /** @type {AnalyseDocument[]} */
      const groupDocs = docs.filter(d => (d.categorie || 'rapport') === categorie);
      for (let i = 0; i < groupDocs.length; i++) {
        await _anaAddDocToPdf(pdf, groupDocs[i], i === 0 ? ANA_CAT_LABELS[categorie] : null);
      }
    }

    // 4. Page de traitement
    await _anaAddHtmlToPdf(pdf, _anaBuildTreatmentHtml(report), false, true);

    /** @type {string} */
    const slug = (report.libelle || 'rapport').toLowerCase()
      .normalize('NFD').replace(/[̀-ͯ]/g, '')
      .replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 40) || 'rapport';
    pdf.save(`analyse-${slug}.pdf`);
    showToast('PDF généré.');
  } catch (err) {
    alert('Erreur génération PDF : ' + err.message);
  }
}
