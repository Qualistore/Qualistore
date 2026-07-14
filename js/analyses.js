// ══════════════════════════════════════════════════════════════
// ANALYSES — Rapports d'analyses (laboratoire, eau, surfaces...)
//
// Les fichiers sont stockés TELS QUELS (aucune compression ni
// conversion — même principe que les documents d'alerte, voir
// handleAlertDocuments, alertes.js) dans le bucket Supabase Storage
// 'photos' sous le préfixe 'analyses/'. Les métadonnées (magasin,
// libellé, date, nom d'origine...) vivent dans la table Supabase
// `analyses` (voir migration-analyses.sql), synchronisée par
// storage.js (DB.analyses) comme les autres tables.
//
// Visibilité : filtrée par magasins accessibles (visibleMids, ui.js)
// et gouvernée par les droits granulaires analysis_view /
// analysis_upload / analysis_delete (config.js).
//
// Dépend de : config.js, storage.js (DB, CU, save, uid,
//   _saveToLocalStorage), supabase.js (sbDeleteWhere, sbDeletePhoto),
//   auth.js (hasPerm), ui.js (el, v, sv, fd, today, showToast,
//   openModal, closeModal, populateMagSelect, visibleMids,
//   uploadPhotoWithRetry), alertes.js (openDocumentViewer,
//   downloadDocument, _formatFileSize, _alertDocumentIcon),
//   import-grille.js (_escapeHtml, _escapeHtmlAttr).
// ══════════════════════════════════════════════════════════════

// ─────────────────────────────────────────────
// 0. TYPEDEFS JSDoc
// ─────────────────────────────────────────────

/**
 * Rapport d'analyses uploadé (une ligne de la table Supabase `analyses`).
 * @typedef {Object} AnalyseReport
 * @property {string} id - Identifiant généré (préfixé 'ana-').
 * @property {string} mid - Référence vers Magasin.id.
 * @property {string} libelle - Libellé libre saisi à l'upload.
 * @property {string} date - Date de l'analyse ('YYYY-MM-DD').
 * @property {string} nom - Nom de fichier d'origine (le chemin de stockage utilise un nom généré).
 * @property {string} mime - Type MIME du fichier.
 * @property {number} taille - Taille du fichier en octets.
 * @property {string} url - URL publique Supabase Storage, ou data URL base64 en fallback hors-ligne.
 * @property {string} aud - Nom de l'utilisateur ayant ajouté le rapport.
 * @property {number} created - Horodatage (Date.now()) de l'ajout.
 */

// ─────────────────────────────────────────────
// 1. CONSTANTES & ÉTAT
// ─────────────────────────────────────────────

/**
 * Taille maximale (octets) acceptée pour le fallback hors-ligne en
 * data URL base64 — au-delà, l'upload est refusé tant que la
 * connexion n'est pas rétablie (une data URL de plusieurs Mo dans
 * DB.analyses saturerait le quota localStorage, cassant la sauvegarde
 * de toutes les autres données — voir _saveToLocalStorage, storage.js).
 * @type {number}
 */
const ANALYSE_OFFLINE_MAX_BYTES = 4 * 1024 * 1024;

/**
 * Fichier sélectionné dans la modale d'upload, en attente
 * d'enregistrement (l'upload réel n'a lieu qu'à saveAnalyse, pour ne
 * jamais laisser de fichier orphelin dans le bucket si l'utilisateur
 * annule).
 * @type {File | null}
 */
let _anaPendingFile = null;

// ─────────────────────────────────────────────
// 2. RENDU DE LA PAGE
// ─────────────────────────────────────────────

/**
 * Affiche la page Analyses : filtres (magasin, période), compteur et
 * tableau des rapports, restreints aux magasins accessibles.
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

  const addBtn = el('btn-add-analyse');
  if (addBtn) addBtn.style.display = hasPerm('analysis_upload') ? '' : 'none';

  /** @type {AnalyseReport[]} */
  const reports = (DB.analyses || [])
    .filter(a => storeIds.includes(a.mid))
    .filter(a => !magFilter || a.mid === magFilter)
    .filter(a => _anaMatchesPeriod(a.date, period))
    .sort((x, y) => (y.date || '').localeCompare(x.date || ''));

  const countEl = el('ana-cnt');
  if (countEl) countEl.textContent = `${reports.length} rapport(s)`;

  if (!reports.length) {
    tbody.innerHTML = `<tr><td colspan="6"><div class="empty-state" style="padding:24px">
      <i class="ti ti-flask" style="font-size:28px"></i><p>Aucun rapport d'analyses</p>
    </div></td></tr>`;
    return;
  }

  /** @type {boolean} */
  const canDelete = !!hasPerm('analysis_delete');

  tbody.innerHTML = reports.map(report => {
    /** @type {{nom: string} | undefined} */
    const store = DB.magasins.find(m => m.id === report.mid);
    return `<tr>
      <td>${store ? _escapeHtml(store.nom) : '–'}</td>
      <td>${_escapeHtml(report.libelle || '')}</td>
      <td>${fd(report.date)}</td>
      <td style="font-size:12px">
        <i class="ti ${_alertDocumentIcon(report.mime)}" style="font-size:15px;vertical-align:-2px"></i>
        ${_escapeHtml(report.nom || 'fichier')}
        <span class="tsm tm">${_formatFileSize(report.taille)}</span>
      </td>
      <td style="font-size:12px;color:var(--text2)">${_escapeHtml(report.aud || '–')}</td>
      <td style="white-space:nowrap">
        <button class="btn btn-secondary btn-sm" onclick="openAnalyseViewModal('${_escapeHtmlAttr(report.id)}')" title="Consulter / récupérer le fichier"><i class="ti ti-eye"></i></button>
        <button class="btn btn-secondary btn-sm" onclick="downloadAnalyseDoc('${_escapeHtmlAttr(report.id)}')" title="Télécharger"><i class="ti ti-download"></i></button>
        ${canDelete ? `<button class="btn btn-danger btn-sm" onclick="deleteAnalyse('${_escapeHtmlAttr(report.id)}')" title="Supprimer"><i class="ti ti-trash"></i></button>` : ''}
      </td>
    </tr>`;
  }).join('');
}

/**
 * Indique si une date d'analyse appartient à la période de filtre de
 * la page ('all', 'month' = mois en cours, 'month3'/'month6' =
 * derniers mois glissants — mêmes conventions que nc.js/actions.js).
 * @param {string | undefined} dateString - Date 'YYYY-MM-DD'.
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

// ─────────────────────────────────────────────
// 3. MODALE D'UPLOAD
// ─────────────────────────────────────────────

/**
 * Ouvre la modale d'ajout d'un rapport d'analyses (champs remis à
 * zéro, date préremplie à aujourd'hui, magasins accessibles).
 * @returns {void}
 */
function openAnalyseUploadModal() {
  if (!hasPerm('analysis_upload')) return;

  populateMagSelect(el('ana-mag'));
  sv('ana-mag', '');
  sv('ana-libelle', '');
  sv('ana-date', today());
  _anaPendingFile = null;
  _renderAnalyseFilePreview();

  const errEl = el('ana-err');
  if (errEl) errEl.classList.remove('show');

  openModal('m-analyse');
}

/**
 * Mémorise le fichier choisi dans la modale (un seul fichier par
 * rapport — l'upload réel n'a lieu qu'à l'enregistrement).
 * @param {HTMLInputElement} input - Élément `<input type="file">`.
 * @returns {void}
 */
function handleAnalyseFile(input) {
  /** @type {File | undefined} */
  const file = input.files && input.files[0];
  if (file) {
    _anaPendingFile = file;
    _renderAnalyseFilePreview();
  }
  input.value = '';
}

/**
 * Retire le fichier en attente dans la modale d'upload.
 * @returns {void}
 */
function clearAnalyseFile() {
  _anaPendingFile = null;
  _renderAnalyseFilePreview();
}

/**
 * Affiche (ou efface) l'aperçu du fichier en attente dans la modale
 * d'upload : icône selon le type, nom, taille, bouton de retrait.
 * @returns {void}
 */
function _renderAnalyseFilePreview() {
  const container = el('ana-file-prev');
  if (!container) return;

  if (!_anaPendingFile) {
    container.innerHTML = '';
    return;
  }

  container.innerHTML = `<div class="doc-chip">
    <i class="ti ${_alertDocumentIcon(_anaPendingFile.type)}"></i>
    <span class="doc-name" title="${_escapeHtmlAttr(_anaPendingFile.name)}">${_escapeHtml(_anaPendingFile.name)}</span>
    <span class="doc-size">${_formatFileSize(_anaPendingFile.size)}</span>
    <button onclick="clearAnalyseFile()" aria-label="Retirer le fichier" title="Retirer"><i class="ti ti-x"></i></button>
  </div>`;
}

/**
 * Affiche un message d'erreur dans la modale d'upload.
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
 * Lit un fichier en data URL base64 (fallback hors-ligne uniquement).
 * @param {File} file
 * @returns {Promise<string | null>} La data URL, ou null en cas d'échec de lecture.
 */
function _anaReadFileAsDataUrl(file) {
  return new Promise(resolve => {
    const reader = new FileReader();
    reader.onload  = () => resolve(typeof reader.result === 'string' ? reader.result : null);
    reader.onerror = () => resolve(null);
    reader.readAsDataURL(file);
  });
}

/**
 * Valide la saisie, uploade le fichier TEL QUEL dans le bucket
 * Storage (préfixe 'analyses/', nom généré — le nom d'origine est
 * conservé dans les métadonnées), enregistre les métadonnées dans
 * DB.analyses et synchronise (save, storage.js). En cas d'échec
 * d'upload (hors-ligne), retombe sur une data URL base64 si le
 * fichier est assez petit (ANALYSE_OFFLINE_MAX_BYTES), sinon refuse
 * proprement sans rien enregistrer.
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

  if (!mid || !libelle || !date) { _showAnalyseError('Merci de renseigner le magasin, le libellé et la date.'); return; }
  if (!_anaPendingFile)          { _showAnalyseError('Merci de choisir un fichier.'); return; }

  /** @type {HTMLButtonElement | null} */
  const saveBtn = el('ana-save-btn');
  /** @type {string} */
  const originalLabel = saveBtn ? saveBtn.innerHTML : '';
  if (saveBtn) {
    saveBtn.disabled = true;
    saveBtn.innerHTML = '<i class="ti ti-loader" style="display:inline-block;animation:spin .8s linear infinite"></i> Envoi…';
  }

  try {
    /** @type {File} */
    const file = _anaPendingFile;
    /** @type {string} */
    const ext = file.name.includes('.') ? file.name.split('.').pop().toLowerCase() : 'bin';
    /** @type {string} */
    const storagePath = `analyses/${uid()}.${ext}`;

    /** @type {string | null} */
    let url = await uploadPhotoWithRetry(file, storagePath);

    if (!url) {
      if (file.size <= ANALYSE_OFFLINE_MAX_BYTES) {
        url = await _anaReadFileAsDataUrl(file);
      }
      if (!url) {
        _showAnalyseError('Upload impossible (connexion instable ?) — réessayez une fois la connexion rétablie.');
        return;
      }
      showToast('Hors-ligne : fichier conservé localement, il sera consultable mais pensez à le ré-uploader une fois en ligne.', 'warning');
    }

    /** @type {AnalyseReport} */
    const report = {
      id:      'ana-' + uid(),
      mid,
      libelle,
      date,
      nom:     file.name,
      mime:    file.type || 'application/octet-stream',
      taille:  file.size,
      url,
      aud:     CU ? CU.nom : '',
      created: Date.now(),
    };

    DB.analyses = DB.analyses || [];
    DB.analyses.push(report);
    save(['analyses']);

    _anaPendingFile = null;
    closeModal('m-analyse');
    showToast('Rapport d\'analyses enregistré.');
    renderAnalyses();
  } finally {
    if (saveBtn) {
      saveBtn.disabled = false;
      saveBtn.innerHTML = originalLabel;
    }
  }
}

// ─────────────────────────────────────────────
// 4. MODALE DE CONSULTATION / RÉCUPÉRATION
// ─────────────────────────────────────────────

/**
 * Ouvre la modale de détail d'un rapport : métadonnées complètes +
 * boutons « Consulter » (aperçu inline si image/PDF, sinon nouvel
 * onglet — voir openDocumentViewer, alertes.js) et « Télécharger »
 * (fichier restitué tel quel avec son nom d'origine — voir
 * downloadDocument, alertes.js).
 * @param {string} reportId - Référence vers AnalyseReport.id.
 * @returns {void}
 */
function openAnalyseViewModal(reportId) {
  /** @type {AnalyseReport | undefined} */
  const report = (DB.analyses || []).find(a => a.id === reportId);
  if (!report) return;

  /** @type {{nom: string} | undefined} */
  const store = DB.magasins.find(m => m.id === report.mid);

  /**
   * Ligne de métadonnée (libellé + valeur HTML déjà échappée).
   * @param {string} label
   * @param {string} valueHtml
   * @returns {string}
   */
  const row = (label, valueHtml) => `<div style="display:flex;justify-content:space-between;gap:12px;padding:6px 0;border-bottom:1px solid var(--border);font-size:13px">
    <span style="color:var(--text2)">${label}</span><span style="font-weight:500;text-align:right">${valueHtml}</span>
  </div>`;

  el('ana-view-body').innerHTML = `
    <div class="doc-chip" style="margin-bottom:14px">
      <i class="ti ${_alertDocumentIcon(report.mime)}"></i>
      <span class="doc-name" onclick="openAnalyseDoc('${_escapeHtmlAttr(report.id)}')" title="${_escapeHtmlAttr(report.nom)}">${_escapeHtml(report.nom)}</span>
      <span class="doc-size">${_formatFileSize(report.taille)}</span>
    </div>
    ${row('Magasin', store ? _escapeHtml(store.nom) : '–')}
    ${row('Libellé', _escapeHtml(report.libelle || '–'))}
    ${row('Date de l\'analyse', fd(report.date))}
    ${row('Ajouté par', _escapeHtml(report.aud || '–'))}
    ${row('Ajouté le', report.created ? fd(new Date(report.created).toISOString().split('T')[0]) : '–')}
    <div style="font-size:11px;color:var(--text3);margin-top:10px">Le fichier est restitué tel qu'il a été fourni, sans aucune modification.</div>`;

  el('ana-view-foot').innerHTML = `
    <button class="btn btn-secondary" onclick="closeModal('m-analyse-view')">Fermer</button>
    <button class="btn btn-secondary" onclick="openAnalyseDoc('${_escapeHtmlAttr(report.id)}')"><i class="ti ti-eye"></i> Consulter</button>
    <button class="btn btn-primary" onclick="downloadAnalyseDoc('${_escapeHtmlAttr(report.id)}')"><i class="ti ti-download"></i> Télécharger</button>`;

  openModal('m-analyse-view');
}

/**
 * Ouvre l'aperçu du fichier d'un rapport (délègue à
 * openDocumentViewer, alertes.js — le fichier est affiché tel quel).
 * @param {string} reportId
 * @returns {void}
 */
function openAnalyseDoc(reportId) {
  /** @type {AnalyseReport | undefined} */
  const report = (DB.analyses || []).find(a => a.id === reportId);
  if (report) openDocumentViewer(report.url, report.mime, report.nom);
}

/**
 * Télécharge le fichier d'un rapport tel quel, avec son nom d'origine
 * (délègue à downloadDocument, alertes.js).
 * @param {string} reportId
 * @returns {void}
 */
function downloadAnalyseDoc(reportId) {
  /** @type {AnalyseReport | undefined} */
  const report = (DB.analyses || []).find(a => a.id === reportId);
  if (report) downloadDocument(report.url, report.nom);
}

// ─────────────────────────────────────────────
// 5. SUPPRESSION
// ─────────────────────────────────────────────

/**
 * Extrait le chemin de stockage d'une URL publique Supabase Storage
 * (bucket 'photos'), pour pouvoir supprimer le fichier lui-même en
 * même temps que ses métadonnées.
 * @param {string} url - AnalyseReport.url.
 * @returns {string | null} null si l'URL n'est pas une URL Storage (ex : data URL hors-ligne).
 */
function _analyseStoragePathFromUrl(url) {
  if (!url || url.startsWith('data:')) return null;
  /** @type {string} */
  const marker = '/object/public/photos/';
  /** @type {number} */
  const index = url.indexOf(marker);
  if (index === -1) return null;
  return decodeURIComponent(url.slice(index + marker.length));
}

/**
 * Demande confirmation (modale m-confirm, Qualistore.html) puis
 * supprime un rapport d'analyses : fichier du bucket Storage (si URL
 * Storage), ligne Supabase, et entrée locale.
 * @param {string} reportId - Référence vers AnalyseReport.id.
 * @returns {void}
 */
function deleteAnalyse(reportId) {
  if (!hasPerm('analysis_delete')) return;

  /** @type {AnalyseReport | undefined} */
  const report = (DB.analyses || []).find(a => a.id === reportId);
  if (!report) return;

  el('conf-msg').textContent    = `Supprimer le rapport « ${report.libelle} » ?`;
  el('conf-detail').textContent = ' Le fichier associé sera lui aussi définitivement supprimé.';
  el('conf-ok').onclick = () => {
    /** @type {string | null} */
    const storagePath = _analyseStoragePathFromUrl(report.url);
    if (storagePath) sbDeletePhoto(storagePath);

    DB.analyses = (DB.analyses || []).filter(a => a.id !== reportId);
    sbDeleteWhere('analyses', 'id', reportId);
    _saveToLocalStorage();

    closeModal('m-confirm');
    showToast('Rapport supprimé.');
    renderAnalyses();
  };
  openModal('m-confirm');
}
