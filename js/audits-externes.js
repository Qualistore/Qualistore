// ══════════════════════════════════════════════════════════════
// AUDITS EXTERNES FSQS — Rapports d'audits externes
//
// Même principe que l'onglet Analyses (analyses.js) : chaque rapport
// est rattaché à un magasin, avec un libellé personnalisé et la DATE
// DU DERNIER AUDIT EXTERNE. Le fichier est stocké TEL QUEL (aucune
// compression ni conversion) dans le bucket Supabase Storage 'photos'
// sous le préfixe 'audits-externes/'. Les métadonnées vivent dans la
// table Supabase `audits_externes`, synchronisée par storage.js
// (DB.auditsExternes).
//
// ⚠️ HORS-LIGNE — AUCUN base64 : même mécanisme que analyses.js
// (file d'attente IndexedDB du fichier ORIGINAL + réconciliateur,
// contexte 'extaudit').
//
// Visibilité : magasins accessibles (visibleMids) + droits
// granulaires extaudit_view / extaudit_upload / extaudit_delete.
// ══════════════════════════════════════════════════════════════

/**
 * Rapport d'audit externe (une ligne de la table Supabase `audits_externes`).
 * @typedef {Object} ExtAuditReport
 * @property {string} id - Identifiant généré (préfixé 'ext-').
 * @property {string} mid - Référence vers Magasin.id.
 * @property {string} libelle - Libellé libre saisi à l'upload.
 * @property {string} date - Date du dernier audit externe ('YYYY-MM-DD').
 * @property {string} nom - Nom de fichier d'origine.
 * @property {string} mime - Type MIME du fichier.
 * @property {number} taille - Taille du fichier en octets.
 * @property {string} url - URL publique Supabase Storage ('' si en attente d'envoi).
 * @property {string} aud - Utilisateur ayant ajouté le rapport.
 * @property {number} created - Horodatage (Date.now()) de l'ajout.
 */

/**
 * Fichier sélectionné dans la modale d'upload, en attente
 * d'enregistrement.
 * @type {File | null}
 */
let _exaPendingFile = null;

// Réconciliateur hors-ligne (voir analyses.js pour le principe).
registerPhotoQueueReconciler('extaudit', (entry, url) => {
  /** @type {ExtAuditReport | undefined} */
  const report = (DB.auditsExternes || []).find(a => a.id === entry.pointId);
  if (!report) return;

  report.url = url;
  save(['auditsExternes']);
  showToast('Rapport d\'audit externe envoyé.', 'success');

  if (document.querySelector('.page.active')?.id === 'page-audits-externes') renderAuditsExternes();
});

/**
 * Affiche la page Audits Externes FSQS : filtres, compteur, tableau.
 * @returns {void}
 */
function renderAuditsExternes() {
  const tbody = el('exa-tb');
  if (!tbody) return;

  populateMagSelect(el('flt-exa-mag'));

  /** @type {string[]} */
  const storeIds = visibleMids();
  /** @type {string} */
  const magFilter = el('flt-exa-mag') ? v('flt-exa-mag') : '';
  /** @type {string} */
  const period = el('flt-exa-period') ? v('flt-exa-period') : 'all';

  const addBtn = el('btn-add-extaudit');
  if (addBtn) addBtn.style.display = hasPerm('extaudit_upload') ? '' : 'none';

  /** @type {ExtAuditReport[]} */
  const reports = (DB.auditsExternes || [])
    .filter(a => storeIds.includes(a.mid))
    .filter(a => !magFilter || a.mid === magFilter)
    .filter(a => _anaMatchesPeriod(a.date, period))
    .sort((x, y) => (y.date || '').localeCompare(x.date || ''));

  const countEl = el('exa-cnt');
  if (countEl) countEl.textContent = `${reports.length} rapport(s)`;

  if (!reports.length) {
    tbody.innerHTML = `<tr><td colspan="6"><div class="empty-state" style="padding:24px">
      <i class="ti ti-certificate" style="font-size:28px"></i><p>Aucun rapport d'audit externe</p>
    </div></td></tr>`;
    return;
  }

  /** @type {boolean} */
  const canDelete = !!hasPerm('extaudit_delete');

  tbody.innerHTML = reports.map(report => {
    /** @type {{nom: string} | undefined} */
    const store = DB.magasins.find(m => m.id === report.mid);
    /** @type {boolean} */
    const isPending = !report.url;

    /** @type {string} */
    const actionButtons = isPending
      ? `<span class="badge b-prog" title="Le fichier original est en file d'attente locale et partira automatiquement au retour de la connexion.">
           <i class="ti ti-cloud-upload" style="font-size:12px"></i> En attente d'envoi
         </span>`
      : `<button class="btn btn-secondary btn-sm" onclick="openExtAuditViewModal('${_escapeHtmlAttr(report.id)}')" title="Consulter / récupérer le fichier"><i class="ti ti-eye"></i></button>
         <button class="btn btn-secondary btn-sm" onclick="downloadExtAuditDoc('${_escapeHtmlAttr(report.id)}')" title="Télécharger"><i class="ti ti-download"></i></button>`;

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
        ${actionButtons}
        ${canDelete ? `<button class="btn btn-danger btn-sm" onclick="deleteExtAudit('${_escapeHtmlAttr(report.id)}')" title="Supprimer"><i class="ti ti-trash"></i></button>` : ''}
      </td>
    </tr>`;
  }).join('');
}

/**
 * Ouvre la modale d'ajout d'un rapport d'audit externe.
 * @returns {void}
 */
function openExtAuditUploadModal() {
  if (!hasPerm('extaudit_upload')) return;

  populateMagSelect(el('exa-mag'));
  sv('exa-mag', '');
  sv('exa-libelle', '');
  sv('exa-date', today());
  _exaPendingFile = null;
  _renderExtAuditFilePreview();

  const errEl = el('exa-err');
  if (errEl) errEl.classList.remove('show');

  openModal('m-extaudit');
}

/**
 * Mémorise le fichier choisi dans la modale.
 * @param {HTMLInputElement} input
 * @returns {void}
 */
function handleExtAuditFile(input) {
  /** @type {File | undefined} */
  const file = input.files && input.files[0];
  if (file) {
    _exaPendingFile = file;
    _renderExtAuditFilePreview();
  }
  input.value = '';
}

/**
 * Retire le fichier en attente dans la modale d'upload.
 * @returns {void}
 */
function clearExtAuditFile() {
  _exaPendingFile = null;
  _renderExtAuditFilePreview();
}

/**
 * Affiche (ou efface) l'aperçu du fichier en attente dans la modale.
 * @returns {void}
 */
function _renderExtAuditFilePreview() {
  const container = el('exa-file-prev');
  if (!container) return;

  if (!_exaPendingFile) {
    container.innerHTML = '';
    return;
  }

  container.innerHTML = `<div class="doc-chip">
    <i class="ti ${_alertDocumentIcon(_exaPendingFile.type)}"></i>
    <span class="doc-name" title="${_escapeHtmlAttr(_exaPendingFile.name)}">${_escapeHtml(_exaPendingFile.name)}</span>
    <span class="doc-size">${_formatFileSize(_exaPendingFile.size)}</span>
    <button onclick="clearExtAuditFile()" aria-label="Retirer le fichier" title="Retirer"><i class="ti ti-x"></i></button>
  </div>`;
}

/**
 * Affiche un message d'erreur dans la modale d'upload.
 * @param {string} message
 * @returns {void}
 */
function _showExtAuditError(message) {
  const errEl = el('exa-err');
  if (!errEl) return;
  errEl.textContent = message;
  errEl.classList.add('show');
}

/**
 * Valide, uploade le fichier TEL QUEL (préfixe 'audits-externes/'),
 * enregistre et synchronise. Hors-ligne : fichier ORIGINAL en file
 * d'attente IndexedDB (contexte 'extaudit'), jamais de base64.
 * @returns {Promise<void>}
 */
async function saveExtAudit() {
  const errEl = el('exa-err');
  if (errEl) errEl.classList.remove('show');

  /** @type {string} */
  const mid = v('exa-mag');
  /** @type {string} */
  const libelle = v('exa-libelle').trim();
  /** @type {string} */
  const date = v('exa-date');

  if (!mid || !libelle || !date) { _showExtAuditError('Merci de renseigner le magasin, le libellé et la date du dernier audit externe.'); return; }
  if (!_exaPendingFile)          { _showExtAuditError('Merci de choisir un fichier.'); return; }

  /** @type {HTMLButtonElement | null} */
  const saveBtn = el('exa-save-btn');
  /** @type {string} */
  const originalLabel = saveBtn ? saveBtn.innerHTML : '';
  if (saveBtn) {
    saveBtn.disabled = true;
    saveBtn.innerHTML = '<i class="ti ti-loader" style="display:inline-block;animation:spin .8s linear infinite"></i> Envoi…';
  }

  try {
    /** @type {File} */
    const file = _exaPendingFile;
    /** @type {string} */
    const ext = file.name.includes('.') ? file.name.split('.').pop().toLowerCase() : 'bin';
    /** @type {string} */
    const storagePath = `audits-externes/${uid()}.${ext}`;

    /** @type {string | null} */
    const url = await uploadPhotoWithRetry(file, storagePath);

    /** @type {ExtAuditReport} */
    const report = {
      id:      'ext-' + uid(),
      mid,
      libelle,
      date,
      nom:     file.name,
      mime:    file.type || 'application/octet-stream',
      taille:  file.size,
      url:     url || '',
      aud:     CU ? CU.nom : '',
      created: Date.now(),
    };

    DB.auditsExternes = DB.auditsExternes || [];
    DB.auditsExternes.push(report);
    save(['auditsExternes']);

    if (!url) {
      await queuePendingPhoto({ context: 'extaudit', pointId: report.id, blob: file, storagePath });
      showToast('Connexion indisponible : le fichier original est en attente et partira automatiquement au retour du réseau.', 'warning');
    } else {
      showToast('Rapport d\'audit externe enregistré.');
    }

    _exaPendingFile = null;
    closeModal('m-extaudit');
    renderAuditsExternes();
  } finally {
    if (saveBtn) {
      saveBtn.disabled = false;
      saveBtn.innerHTML = originalLabel;
    }
  }
}

/**
 * Ouvre la modale de détail d'un rapport d'audit externe.
 * @param {string} reportId - Référence vers ExtAuditReport.id.
 * @returns {void}
 */
function openExtAuditViewModal(reportId) {
  /** @type {ExtAuditReport | undefined} */
  const report = (DB.auditsExternes || []).find(a => a.id === reportId);
  if (!report) return;

  /** @type {{nom: string} | undefined} */
  const store = DB.magasins.find(m => m.id === report.mid);
  /** @type {boolean} */
  const isPending = !report.url;

  /**
   * @param {string} label
   * @param {string} valueHtml
   * @returns {string}
   */
  const row = (label, valueHtml) => `<div style="display:flex;justify-content:space-between;gap:12px;padding:6px 0;border-bottom:1px solid var(--border);font-size:13px">
    <span style="color:var(--text2)">${label}</span><span style="font-weight:500;text-align:right">${valueHtml}</span>
  </div>`;

  el('exa-view-body').innerHTML = `
    <div class="doc-chip" style="margin-bottom:14px">
      <i class="ti ${_alertDocumentIcon(report.mime)}"></i>
      <span class="doc-name" ${isPending ? '' : `onclick="openExtAuditDoc('${_escapeHtmlAttr(report.id)}')"`} title="${_escapeHtmlAttr(report.nom)}">${_escapeHtml(report.nom)}</span>
      <span class="doc-size">${_formatFileSize(report.taille)}</span>
    </div>
    ${isPending ? `<div style="background:var(--warning-light);border-radius:var(--radius);padding:10px 14px;margin-bottom:12px;font-size:12px;color:var(--warning-dark)">
      <i class="ti ti-cloud-upload"></i> Le fichier original est en file d'attente locale — il sera envoyé automatiquement au retour de la connexion, puis consultable ici.
    </div>` : ''}
    ${row('Magasin', store ? _escapeHtml(store.nom) : '–')}
    ${row('Libellé', _escapeHtml(report.libelle || '–'))}
    ${row('Date du dernier audit externe', fd(report.date))}
    ${row('Ajouté par', _escapeHtml(report.aud || '–'))}
    ${row('Ajouté le', report.created ? fd(new Date(report.created).toISOString().split('T')[0]) : '–')}
    <div style="font-size:11px;color:var(--text3);margin-top:10px">Le fichier est restitué tel qu'il a été fourni, sans aucune modification.</div>`;

  el('exa-view-foot').innerHTML = isPending
    ? `<button class="btn btn-secondary" onclick="closeModal('m-extaudit-view')">Fermer</button>`
    : `<button class="btn btn-secondary" onclick="closeModal('m-extaudit-view')">Fermer</button>
       <button class="btn btn-secondary" onclick="openExtAuditDoc('${_escapeHtmlAttr(report.id)}')"><i class="ti ti-eye"></i> Consulter</button>
       <button class="btn btn-primary" onclick="downloadExtAuditDoc('${_escapeHtmlAttr(report.id)}')"><i class="ti ti-download"></i> Télécharger</button>`;

  openModal('m-extaudit-view');
}

/**
 * Ouvre l'aperçu du fichier d'un rapport d'audit externe.
 * @param {string} reportId
 * @returns {void}
 */
function openExtAuditDoc(reportId) {
  /** @type {ExtAuditReport | undefined} */
  const report = (DB.auditsExternes || []).find(a => a.id === reportId);
  if (!report) return;
  if (!report.url) { showToast('Fichier encore en attente d\'envoi — réessayez une fois la connexion rétablie.', 'warning'); return; }
  openDocumentViewer(report.url, report.mime, report.nom);
}

/**
 * Télécharge le fichier d'un rapport d'audit externe tel quel.
 * @param {string} reportId
 * @returns {void}
 */
function downloadExtAuditDoc(reportId) {
  /** @type {ExtAuditReport | undefined} */
  const report = (DB.auditsExternes || []).find(a => a.id === reportId);
  if (!report) return;
  if (!report.url) { showToast('Fichier encore en attente d\'envoi — réessayez une fois la connexion rétablie.', 'warning'); return; }
  downloadDocument(report.url, report.nom);
}

/**
 * Demande confirmation puis supprime un rapport d'audit externe.
 * @param {string} reportId - Référence vers ExtAuditReport.id.
 * @returns {void}
 */
function deleteExtAudit(reportId) {
  if (!hasPerm('extaudit_delete')) return;

  /** @type {ExtAuditReport | undefined} */
  const report = (DB.auditsExternes || []).find(a => a.id === reportId);
  if (!report) return;

  el('conf-msg').textContent    = `Supprimer le rapport « ${report.libelle} » ?`;
  el('conf-detail').textContent = ' Le fichier associé sera lui aussi définitivement supprimé.';
  el('conf-ok').onclick = () => {
    /** @type {string | null} */
    const storagePath = _analyseStoragePathFromUrl(report.url); // helper partagé, analyses.js
    if (storagePath) sbDeletePhoto(storagePath);

    getPendingPhotos().then(pending => pending
      .filter(p => p.context === 'extaudit' && p.pointId === reportId)
      .forEach(p => removePendingPhoto(p.id)));

    DB.auditsExternes = (DB.auditsExternes || []).filter(a => a.id !== reportId);
    sbDeleteWhere('audits_externes', 'id', reportId);
    _saveToLocalStorage();

    closeModal('m-confirm');
    showToast('Rapport supprimé.');
    renderAuditsExternes();
  };
  openModal('m-confirm');
}
