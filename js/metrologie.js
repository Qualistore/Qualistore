// ══════════════════════════════════════════════════════════════
// MÉTROLOGIE — Suivi des balances par magasin
//
// Présentation PAR BALANCE : chaque balance est assignée à un magasin
// et centralise les données qui lui sont injectées — les « passages »
// du prestataire de métrologie : rapport(s) de passage stocké(s) TELS
// QUELS (préfixe Storage 'metrologie/'), date du passage, échéance du
// prochain passage, commentaire.
//
// RAPPEL AUTOMATIQUE : 30 jours avant l'échéance du dernier passage
// d'une balance, une ALERTE MAGASIN (DB.alertes — même structure que
// les alertes terrain, voir saveAlert, alertes.js) est créée
// automatiquement pour rappeler de prendre rendez-vous avec le
// prestataire. L'alerte remet à disposition les données du dernier
// passage : date, échéance, commentaire, et les DOCUMENTS importés
// (référencés, pas copiés — la suppression de l'alerte ne supprime
// jamais ces fichiers, voir _deleteAlertDocuments, magasins.js).
// L'échéance déjà alertée est mémorisée sur la balance
// (balance.alerte_echeance) : une seule alerte par échéance, même
// multi-appareils (la balance est synchronisée via Supabase), et pas
// de recréation si l'utilisateur clôture ou supprime l'alerte.
//
// Données : table Supabase `balances` (une ligne par balance, les
// passages embarqués en jsonb — voir
// migration-analyses-extaudits-metrologie.sql), clé DB.balances,
// synchronisée par storage.js.
//
// ⚠️ HORS-LIGNE — AUCUN base64 : même mécanisme que analyses.js
// (file d'attente IndexedDB du fichier ORIGINAL + réconciliateur,
// contexte 'metrologie', pointId composite 'balanceId|passageId|docId').
//
// Dépend de : config.js, storage.js, supabase.js, auth.js, ui.js,
//   alertes.js (openDocumentViewer, downloadDocument,
//   _formatFileSize, _alertDocumentIcon),
//   import-grille.js (_escapeHtml, _escapeHtmlAttr),
//   analyses.js (_analyseStoragePathFromUrl — helper partagé).
// ══════════════════════════════════════════════════════════════

// ─────────────────────────────────────────────
// 0. TYPEDEFS JSDoc
// ─────────────────────────────────────────────

/**
 * Document joint à un passage (même forme que AlertDocument,
 * alertes.js — réutilisable tel quel dans une alerte).
 * @typedef {Object} PassageDocument
 * @property {string} id - Identifiant généré (préfixé 'doc-').
 * @property {string} nom - Nom de fichier d'origine.
 * @property {string} mime - Type MIME.
 * @property {number} taille - Taille en octets.
 * @property {number} ajoutLe - Horodatage (Date.now()).
 * @property {string} url - URL publique Supabase Storage. Chaîne vide tant que le fichier est en attente d'envoi.
 */

/**
 * Passage du prestataire de métrologie sur une balance.
 * @typedef {Object} Passage
 * @property {string} id - Identifiant généré (préfixé 'pas-').
 * @property {string} date - Date du passage ('YYYY-MM-DD').
 * @property {string} echeance - Échéance du prochain passage ('YYYY-MM-DD').
 * @property {string} [cmt] - Commentaire libre.
 * @property {PassageDocument[]} documents - Rapports de passage (stockage brut).
 * @property {string} aud - Nom de l'utilisateur ayant enregistré le passage.
 * @property {number} created - Horodatage (Date.now()).
 */

/**
 * Balance (une ligne de la table Supabase `balances`).
 * @typedef {Object} Balance
 * @property {string} id - Identifiant généré (préfixé 'bal-').
 * @property {string} mid - Référence vers Magasin.id (assignation obligatoire).
 * @property {string} nom - Nom de la balance (ex : 'Balance Boucherie 1').
 * @property {string} [sn] - Numéro de série (optionnel).
 * @property {Passage[]} passages - Historique des passages (données centralisées).
 * @property {string} [alerte_echeance] - Échéance ('YYYY-MM-DD') pour laquelle le rappel automatique a déjà été créé — évite les doublons. Nom en snake_case = nom exact de la colonne Supabase.
 * @property {number} created - Horodatage (Date.now()).
 */

// ─────────────────────────────────────────────
// 1. CONSTANTES & ÉTAT
// ─────────────────────────────────────────────

/**
 * Nombre de jours avant l'échéance à partir desquels le rappel
 * automatique est créé.
 * @type {number}
 */
const METRO_ALERT_DAYS_BEFORE = 30;

/**
 * Fichiers sélectionnés dans la modale de passage, en attente
 * d'enregistrement (upload réel à savePassage uniquement).
 * @type {File[]}
 */
let _pasPendingFiles = [];

/**
 * Balance actuellement affichée dans la modale de détail (pour la
 * rafraîchir après un ajout/suppression de passage), ou null.
 * @type {string | null}
 */
let _balanceViewId = null;

/**
 * Horodatage du dernier contrôle d'échéances (au plus une fois par
 * heure par session — voir checkMetrologieEcheances).
 * @type {number}
 */
let _metroLastCheck = 0;

// ─────────────────────────────────────────────
// 1bis. RÉCONCILIATEUR HORS-LIGNE
// pointId composite : 'balanceId|passageId|docId'.
// ─────────────────────────────────────────────

registerPhotoQueueReconciler('metrologie', (entry, url) => {
  /** @type {string[]} */
  const [balanceId, passageId, docId] = (entry.pointId || '').split('|');
  /** @type {Balance | undefined} */
  const balance = (DB.balances || []).find(b => b.id === balanceId);
  /** @type {Passage | undefined} */
  const passage = balance && (balance.passages || []).find(p => p.id === passageId);
  /** @type {PassageDocument | undefined} */
  const doc = passage && (passage.documents || []).find(d => d.id === docId);
  if (!doc) return; // supprimé entre-temps — rien à faire

  doc.url = url;
  save(['balances']);
  showToast('Rapport de passage envoyé.', 'success');

  if (document.querySelector('.page.active')?.id === 'page-metrologie') renderMetrologie();
  if (_balanceViewId === balanceId && el('m-balance-view')?.classList.contains('open')) openBalanceView(balanceId);
});

// ─────────────────────────────────────────────
// 2. HELPERS
// ─────────────────────────────────────────────

/**
 * Retourne le dernier passage d'une balance (le plus récent par date
 * de passage), ou null si aucun.
 * @param {Balance} balance
 * @returns {Passage | null}
 */
function _lastPassage(balance) {
  /** @type {Passage[]} */
  const passages = balance.passages || [];
  if (!passages.length) return null;
  return [...passages].sort((a, b) => (b.date || '').localeCompare(a.date || ''))[0];
}

/**
 * Nombre de jours entre aujourd'hui et une date ('YYYY-MM-DD') —
 * négatif si la date est passée.
 * @param {string} dateString
 * @returns {number}
 */
function _daysUntil(dateString) {
  return Math.ceil((new Date(dateString).getTime() - new Date(today()).getTime()) / 86_400_000);
}

/**
 * Statut d'échéance d'une balance, pour l'affichage (carte + détail).
 * @param {Balance} balance
 * @returns {{label: string, color: string, icon: string}}
 */
function _balanceStatus(balance) {
  /** @type {Passage | null} */
  const last = _lastPassage(balance);
  if (!last || !last.echeance) {
    return { label: 'Aucun passage enregistré', color: 'var(--text3)', icon: 'ti-help-circle' };
  }
  /** @type {number} */
  const days = _daysUntil(last.echeance);
  if (days < 0)  return { label: `Échéance dépassée depuis le ${fd(last.echeance)}`, color: 'var(--danger)', icon: 'ti-alert-triangle' };
  if (days <= METRO_ALERT_DAYS_BEFORE) return { label: `Échéance dans ${days} jour(s) — le ${fd(last.echeance)}`, color: 'var(--warning)', icon: 'ti-clock' };
  return { label: `Échéance le ${fd(last.echeance)}`, color: 'var(--success)', icon: 'ti-circle-check' };
}

// ─────────────────────────────────────────────
// 3. RENDU DE LA PAGE (une carte par balance)
// ─────────────────────────────────────────────

/**
 * Affiche la page Métrologie : une carte par balance (magasins
 * accessibles uniquement), avec statut d'échéance, dernier passage et
 * nombre de documents centralisés.
 * @returns {void}
 */
function renderMetrologie() {
  const grid = el('metro-grid');
  if (!grid) return;

  populateMagSelect(el('flt-metro-mag'));

  /** @type {string[]} */
  const storeIds = visibleMids();
  /** @type {string} */
  const magFilter = el('flt-metro-mag') ? v('flt-metro-mag') : '';

  const addBtn = el('btn-add-balance');
  if (addBtn) addBtn.style.display = hasPerm('metro_manage') ? '' : 'none';

  /** @type {Balance[]} */
  const balances = (DB.balances || [])
    .filter(b => storeIds.includes(b.mid))
    .filter(b => !magFilter || b.mid === magFilter)
    .sort((a, b) => {
      /** @type {string} */
      const na = (DB.magasins.find(m => m.id === a.mid) || {}).nom || '';
      /** @type {string} */
      const nb = (DB.magasins.find(m => m.id === b.mid) || {}).nom || '';
      return na.localeCompare(nb, 'fr') || (a.nom || '').localeCompare(b.nom || '', 'fr');
    });

  const countEl = el('metro-cnt');
  if (countEl) countEl.textContent = `${balances.length} balance(s)`;

  const emptyEl = el('metro-empty');
  if (emptyEl) emptyEl.style.display = balances.length ? 'none' : '';

  /** @type {boolean} */
  const canManage = !!hasPerm('metro_manage');
  /** @type {boolean} */
  const canDelete = !!hasPerm('metro_delete');

  grid.innerHTML = balances.map(balance => {
    /** @type {{nom: string} | undefined} */
    const store = DB.magasins.find(m => m.id === balance.mid);
    /** @type {Passage | null} */
    const last = _lastPassage(balance);
    /** @type {{label: string, color: string, icon: string}} */
    const status = _balanceStatus(balance);
    /** @type {number} */
    const docCount = (balance.passages || []).reduce((sum, p) => sum + (p.documents || []).length, 0);

    return `<div class="card" style="border-left:4px solid ${status.color}">
      <div class="card-body">
        <div style="display:flex;align-items:center;gap:8px;margin-bottom:6px">
          <i class="ti ti-scale" style="font-size:20px;color:var(--primary)"></i>
          <div style="flex:1">
            <div style="font-size:14px;font-weight:700">${_escapeHtml(balance.nom)}</div>
            <div class="tsm tm">${store ? _escapeHtml(store.nom) : '–'}${balance.sn ? ` · ${_escapeHtml(balance.sn)}` : ''}</div>
          </div>
        </div>
        <div style="font-size:12px;color:${status.color};font-weight:600;margin-bottom:4px">
          <i class="ti ${status.icon}"></i> ${status.label}
        </div>
        <div class="tsm tm" style="margin-bottom:10px">
          ${last ? `Dernier passage : ${fd(last.date)}` : 'Aucun passage'} ·
          ${(balance.passages || []).length} passage(s) · ${docCount} document(s)
        </div>
        <div style="display:flex;gap:6px;flex-wrap:wrap">
          <button class="btn btn-secondary btn-sm" onclick="openBalanceView('${_escapeHtmlAttr(balance.id)}')"><i class="ti ti-eye"></i> Détail</button>
          ${canManage ? `<button class="btn btn-primary btn-sm" onclick="openPassageModal('${_escapeHtmlAttr(balance.id)}')"><i class="ti ti-calendar-plus"></i> Nouveau passage</button>` : ''}
          ${canDelete ? `<button class="btn btn-danger btn-sm" onclick="deleteBalance('${_escapeHtmlAttr(balance.id)}')" title="Supprimer la balance"><i class="ti ti-trash"></i></button>` : ''}
        </div>
      </div>
    </div>`;
  }).join('');
}

// ─────────────────────────────────────────────
// 4. CRÉATION / MODIFICATION D'UNE BALANCE
// ─────────────────────────────────────────────

/**
 * Ouvre la modale de création (balanceId omis) ou de modification
 * d'une balance.
 * @param {string} [balanceId] - Référence vers Balance.id, si modification.
 * @returns {void}
 */
function openBalanceModal(balanceId) {
  if (!hasPerm('metro_manage')) return;

  populateMagSelect(el('bal-mag'));

  /** @type {Balance | undefined} */
  const balance = balanceId ? (DB.balances || []).find(b => b.id === balanceId) : undefined;

  sv('bal-id',  balance ? balance.id  : '');
  sv('bal-mag', balance ? balance.mid : '');
  sv('bal-nom', balance ? balance.nom : '');
  sv('bal-sn',  balance ? (balance.sn || '') : '');
  el('m-balance-ttl').innerHTML = `<i class="ti ti-scale" style="color:var(--primary)"></i> ${balance ? 'Modifier la balance' : 'Nouvelle balance'}`;

  const errEl = el('bal-err');
  if (errEl) errEl.classList.remove('show');

  openModal('m-balance');
}

/**
 * Valide et enregistre la balance (création ou modification), puis
 * synchronise (save(['balances'])).
 * @returns {void}
 */
function saveBalance() {
  const errEl = el('bal-err');
  if (errEl) errEl.classList.remove('show');

  /** @type {string} */
  const id  = v('bal-id');
  /** @type {string} */
  const mid = v('bal-mag');
  /** @type {string} */
  const nom = v('bal-nom').trim();
  /** @type {string} */
  const sn  = v('bal-sn').trim();

  if (!mid || !nom) {
    if (errEl) {
      errEl.textContent = 'Merci de renseigner le magasin et le nom de la balance.';
      errEl.classList.add('show');
    }
    return;
  }

  DB.balances = DB.balances || [];

  if (id) {
    /** @type {Balance | undefined} */
    const existing = DB.balances.find(b => b.id === id);
    if (existing) Object.assign(existing, { mid, nom, sn });
  } else {
    DB.balances.push({ id: 'bal-' + uid(), mid, nom, sn, passages: [], alerte_echeance: '', created: Date.now() });
  }

  save(['balances']);
  closeModal('m-balance');
  showToast('Balance enregistrée.');
  renderMetrologie();
}

// ─────────────────────────────────────────────
// 5. DÉTAIL D'UNE BALANCE (données centralisées)
// ─────────────────────────────────────────────

/**
 * Ouvre la modale de détail d'une balance : informations, statut
 * d'échéance, et historique complet des passages (du plus récent au
 * plus ancien) avec leurs documents consultables/téléchargeables.
 * @param {string} balanceId - Référence vers Balance.id.
 * @returns {void}
 */
function openBalanceView(balanceId) {
  /** @type {Balance | undefined} */
  const balance = (DB.balances || []).find(b => b.id === balanceId);
  if (!balance) return;
  _balanceViewId = balanceId;

  /** @type {{nom: string} | undefined} */
  const store = DB.magasins.find(m => m.id === balance.mid);
  /** @type {{label: string, color: string, icon: string}} */
  const status = _balanceStatus(balance);
  /** @type {boolean} */
  const canManage = !!hasPerm('metro_manage');
  /** @type {boolean} */
  const canDelete = !!hasPerm('metro_delete');

  el('m-balance-view-ttl').innerHTML = `<i class="ti ti-scale" style="color:var(--primary)"></i> ${_escapeHtml(balance.nom)}`;

  /** @type {Passage[]} */
  const passages = [...(balance.passages || [])].sort((a, b) => (b.date || '').localeCompare(a.date || ''));

  /** @type {string} */
  const passagesHtml = passages.length
    ? passages.map((passage, index) => {
        /** @type {string} */
        const docsHtml = (passage.documents || []).map(doc => {
          /** @type {boolean} */
          const isPending = !doc.url;
          return `<div class="doc-chip">
            <i class="ti ${_alertDocumentIcon(doc.mime)}"></i>
            <span class="doc-name" ${isPending ? '' : `onclick="openPassageDoc('${_escapeHtmlAttr(balance.id)}','${_escapeHtmlAttr(passage.id)}','${_escapeHtmlAttr(doc.id)}')"`} title="${_escapeHtmlAttr(doc.nom)}">${_escapeHtml(doc.nom)}</span>
            <span class="doc-size">${_formatFileSize(doc.taille)}</span>
            ${isPending
              ? `<span class="badge b-prog" title="En attente d'envoi — partira automatiquement au retour de la connexion."><i class="ti ti-cloud-upload" style="font-size:11px"></i></span>`
              : `<button onclick="downloadPassageDoc('${_escapeHtmlAttr(balance.id)}','${_escapeHtmlAttr(passage.id)}','${_escapeHtmlAttr(doc.id)}')" aria-label="Télécharger" title="Télécharger"><i class="ti ti-download"></i></button>`}
          </div>`;
        }).join('');

        return `<div style="border:1px solid var(--border);border-radius:var(--radius);padding:12px 14px;margin-bottom:10px${index === 0 ? ';background:var(--bg)' : ''}">
          <div style="display:flex;justify-content:space-between;align-items:center;flex-wrap:wrap;gap:6px;margin-bottom:6px">
            <div style="font-size:13px;font-weight:600">
              <i class="ti ti-calendar-check" style="color:var(--primary)"></i> Passage du ${fd(passage.date)}
              ${index === 0 ? '<span class="badge b-done" style="margin-left:6px">Dernier</span>' : ''}
            </div>
            ${canDelete ? `<button class="btn btn-danger btn-sm" style="padding:2px 8px" onclick="deletePassage('${_escapeHtmlAttr(balance.id)}','${_escapeHtmlAttr(passage.id)}')" title="Supprimer ce passage"><i class="ti ti-trash" style="font-size:12px"></i></button>` : ''}
          </div>
          <div class="tsm tm" style="margin-bottom:6px">
            Échéance (prochain passage) : <strong style="color:var(--text)">${fd(passage.echeance)}</strong>
            ${passage.aud ? ` · Enregistré par ${_escapeHtml(passage.aud)}` : ''}
          </div>
          ${passage.cmt ? `<div style="font-size:12px;font-style:italic;color:var(--text2);margin-bottom:6px">${_escapeHtml(passage.cmt)}</div>` : ''}
          ${docsHtml || '<div class="tsm tm">Aucun document joint.</div>'}
        </div>`;
      }).join('')
    : `<div class="empty-state" style="padding:24px">
         <i class="ti ti-calendar-off" style="font-size:28px"></i><p>Aucun passage enregistré pour cette balance.</p>
       </div>`;

  el('bal-view-body').innerHTML = `
    <div style="display:flex;justify-content:space-between;align-items:center;flex-wrap:wrap;gap:8px;margin-bottom:12px">
      <div>
        <div class="tsm tm">Magasin : <strong style="color:var(--text)">${store ? _escapeHtml(store.nom) : '–'}</strong>${balance.sn ? ` · N° de série : <strong style="color:var(--text)">${_escapeHtml(balance.sn)}</strong>` : ''}</div>
        <div style="font-size:13px;color:${status.color};font-weight:600;margin-top:4px"><i class="ti ${status.icon}"></i> ${status.label}</div>
      </div>
      ${canManage ? `<button class="btn btn-secondary btn-sm" onclick="openBalanceModal('${_escapeHtmlAttr(balance.id)}')"><i class="ti ti-pencil"></i> Modifier</button>` : ''}
    </div>
    <div class="tsm fw6" style="color:var(--text3);text-transform:uppercase;letter-spacing:.04em;margin-bottom:8px">Historique des passages</div>
    ${passagesHtml}`;

  el('bal-view-foot').innerHTML = `
    <button class="btn btn-secondary" onclick="closeModal('m-balance-view')">Fermer</button>
    ${canManage ? `<button class="btn btn-primary" onclick="openPassageModal('${_escapeHtmlAttr(balance.id)}')"><i class="ti ti-calendar-plus"></i> Nouveau passage</button>` : ''}`;

  openModal('m-balance-view');
}

/**
 * Ouvre l'aperçu d'un document de passage (fichier affiché tel quel).
 * @param {string} balanceId
 * @param {string} passageId
 * @param {string} docId
 * @returns {void}
 */
function openPassageDoc(balanceId, passageId, docId) {
  /** @type {PassageDocument | undefined} */
  const doc = _findPassageDoc(balanceId, passageId, docId);
  if (!doc) return;
  if (!doc.url) { showToast('Fichier encore en attente d\'envoi.', 'warning'); return; }
  openDocumentViewer(doc.url, doc.mime, doc.nom);
}

/**
 * Télécharge un document de passage tel quel, avec son nom d'origine.
 * @param {string} balanceId
 * @param {string} passageId
 * @param {string} docId
 * @returns {void}
 */
function downloadPassageDoc(balanceId, passageId, docId) {
  /** @type {PassageDocument | undefined} */
  const doc = _findPassageDoc(balanceId, passageId, docId);
  if (!doc) return;
  if (!doc.url) { showToast('Fichier encore en attente d\'envoi.', 'warning'); return; }
  downloadDocument(doc.url, doc.nom);
}

/**
 * Résout un document de passage par son triplet d'identifiants.
 * @param {string} balanceId
 * @param {string} passageId
 * @param {string} docId
 * @returns {PassageDocument | undefined}
 */
function _findPassageDoc(balanceId, passageId, docId) {
  /** @type {Balance | undefined} */
  const balance = (DB.balances || []).find(b => b.id === balanceId);
  /** @type {Passage | undefined} */
  const passage = balance && (balance.passages || []).find(p => p.id === passageId);
  return passage && (passage.documents || []).find(d => d.id === docId);
}

// ─────────────────────────────────────────────
// 6. NOUVEAU PASSAGE (import de rapport + dates)
// ─────────────────────────────────────────────

/**
 * Ouvre la modale de saisie d'un nouveau passage pour une balance
 * (date du passage préremplie à aujourd'hui).
 * @param {string} balanceId - Référence vers Balance.id.
 * @returns {void}
 */
function openPassageModal(balanceId) {
  if (!hasPerm('metro_manage')) return;
  /** @type {Balance | undefined} */
  const balance = (DB.balances || []).find(b => b.id === balanceId);
  if (!balance) return;

  sv('pas-bal-id', balanceId);
  sv('pas-date', today());
  sv('pas-echeance', '');
  sv('pas-cmt', '');
  _pasPendingFiles = [];
  _renderPassageDocPreviews();

  const errEl = el('pas-err');
  if (errEl) errEl.classList.remove('show');

  openModal('m-passage');
}

/**
 * Ajoute un ou plusieurs fichiers à la liste en attente de la modale
 * de passage (upload réel à savePassage uniquement).
 * @param {HTMLInputElement} input - Élément `<input type="file" multiple>`.
 * @returns {void}
 */
function handlePassageDocs(input) {
  [...(input.files || [])].forEach(file => _pasPendingFiles.push(file));
  input.value = '';
  _renderPassageDocPreviews();
}

/**
 * Retire un fichier en attente de la modale de passage.
 * @param {number} index
 * @returns {void}
 */
function removePassagePendingDoc(index) {
  _pasPendingFiles.splice(index, 1);
  _renderPassageDocPreviews();
}

/**
 * Affiche la liste des fichiers en attente dans la modale de passage.
 * @returns {void}
 */
function _renderPassageDocPreviews() {
  const container = el('pas-docs-prev');
  if (!container) return;

  container.innerHTML = _pasPendingFiles.map((file, index) => `<div class="doc-chip">
    <i class="ti ${_alertDocumentIcon(file.type)}"></i>
    <span class="doc-name" title="${_escapeHtmlAttr(file.name)}">${_escapeHtml(file.name)}</span>
    <span class="doc-size">${_formatFileSize(file.size)}</span>
    <button onclick="removePassagePendingDoc(${index})" aria-label="Retirer le fichier" title="Retirer"><i class="ti ti-x"></i></button>
  </div>`).join('');
}

/**
 * Valide et enregistre un nouveau passage : uploade chaque rapport
 * TEL QUEL (préfixe 'metrologie/'), attache le passage (date +
 * échéance + commentaire + documents) à la balance, synchronise, puis
 * déclenche immédiatement le contrôle d'échéances (si la nouvelle
 * échéance est déjà à moins de 30 jours, le rappel part tout de suite).
 * Hors-ligne : fichiers ORIGINAUX en file d'attente IndexedDB
 * (contexte 'metrologie'), jamais de base64.
 * @returns {Promise<void>}
 */
async function savePassage() {
  const errEl = el('pas-err');
  if (errEl) errEl.classList.remove('show');

  /** @type {string} */
  const balanceId = v('pas-bal-id');
  /** @type {string} */
  const date = v('pas-date');
  /** @type {string} */
  const echeance = v('pas-echeance');
  /** @type {string} */
  const cmt = v('pas-cmt').trim();

  /** @type {Balance | undefined} */
  const balance = (DB.balances || []).find(b => b.id === balanceId);
  if (!balance) return;

  if (!date || !echeance) {
    if (errEl) {
      errEl.textContent = 'Merci de renseigner la date du passage ET l\'échéance du prochain passage.';
      errEl.classList.add('show');
    }
    return;
  }
  if (echeance <= date) {
    if (errEl) {
      errEl.textContent = 'L\'échéance doit être postérieure à la date du passage.';
      errEl.classList.add('show');
    }
    return;
  }

  /** @type {HTMLButtonElement | null} */
  const saveBtn = el('pas-save-btn');
  /** @type {string} */
  const originalLabel = saveBtn ? saveBtn.innerHTML : '';
  if (saveBtn) {
    saveBtn.disabled = true;
    saveBtn.innerHTML = '<i class="ti ti-loader" style="display:inline-block;animation:spin .8s linear infinite"></i> Envoi…';
  }

  try {
    /** @type {string} */
    const passageId = 'pas-' + uid();
    /** @type {PassageDocument[]} */
    const documents = [];
    /** @type {number} */
    let queuedCount = 0;

    for (const file of _pasPendingFiles) {
      /** @type {string} */
      const ext = file.name.includes('.') ? file.name.split('.').pop().toLowerCase() : 'bin';
      /** @type {string} */
      const storagePath = `metrologie/${uid()}.${ext}`;
      /** @type {string | null} */
      const url = await uploadPhotoWithRetry(file, storagePath);

      /** @type {PassageDocument} */
      const doc = {
        id: 'doc-' + uid(), nom: file.name,
        mime: file.type || 'application/octet-stream',
        taille: file.size, ajoutLe: Date.now(), url: url || '',
      };
      documents.push(doc);

      if (!url) {
        // Fichier ORIGINAL en file d'attente locale — jamais de base64.
        await queuePendingPhoto({
          context: 'metrologie',
          pointId: `${balanceId}|${passageId}|${doc.id}`,
          blob: file, storagePath,
        });
        queuedCount++;
      }
    }

    /** @type {Passage} */
    const passage = { id: passageId, date, echeance, cmt, documents, aud: CU ? CU.nom : '', created: Date.now() };
    balance.passages = balance.passages || [];
    balance.passages.push(passage);

    save(['balances']);

    _pasPendingFiles = [];
    closeModal('m-passage');
    showToast(queuedCount
      ? `Passage enregistré — ${queuedCount} fichier(s) en attente d'envoi (départ automatique au retour du réseau).`
      : 'Passage enregistré.', queuedCount ? 'warning' : 'success');

    // Si la nouvelle échéance est déjà à ≤ 30 jours, créer le rappel
    // sans attendre le prochain passage sur le tableau de bord.
    checkMetrologieEcheances(true);

    renderMetrologie();
    if (_balanceViewId === balanceId && el('m-balance-view')?.classList.contains('open')) openBalanceView(balanceId);
  } finally {
    if (saveBtn) {
      saveBtn.disabled = false;
      saveBtn.innerHTML = originalLabel;
    }
  }
}

// ─────────────────────────────────────────────
// 7. SUPPRESSIONS
// ─────────────────────────────────────────────

/**
 * Supprime du bucket Storage tous les documents d'un passage (ceux
 * déjà envoyés), et purge la file d'attente locale pour ceux encore
 * en attente.
 * @param {string} balanceId
 * @param {Passage} passage
 * @returns {void}
 */
function _deletePassageFiles(balanceId, passage) {
  (passage.documents || []).forEach(doc => {
    /** @type {string | null} */
    const storagePath = _analyseStoragePathFromUrl(doc.url); // helper partagé, analyses.js
    if (storagePath) sbDeletePhoto(storagePath);
  });
  getPendingPhotos().then(pending => pending
    .filter(p => p.context === 'metrologie' && (p.pointId || '').startsWith(`${balanceId}|${passage.id}|`))
    .forEach(p => removePendingPhoto(p.id)));
}

/**
 * Demande confirmation puis supprime un passage d'une balance (avec
 * ses fichiers). L'échéance déjà alertée (alerte_echeance) n'est PAS
 * réinitialisée : l'alerte éventuellement déjà créée reste valable.
 * @param {string} balanceId
 * @param {string} passageId
 * @returns {void}
 */
function deletePassage(balanceId, passageId) {
  if (!hasPerm('metro_delete')) return;

  /** @type {Balance | undefined} */
  const balance = (DB.balances || []).find(b => b.id === balanceId);
  /** @type {Passage | undefined} */
  const passage = balance && (balance.passages || []).find(p => p.id === passageId);
  if (!balance || !passage) return;

  el('conf-msg').textContent    = `Supprimer le passage du ${fd(passage.date)} ?`;
  el('conf-detail').textContent = ' Ses documents seront eux aussi définitivement supprimés.';
  el('conf-ok').onclick = () => {
    _deletePassageFiles(balanceId, passage);
    balance.passages = (balance.passages || []).filter(p => p.id !== passageId);
    save(['balances']);

    closeModal('m-confirm');
    showToast('Passage supprimé.');
    renderMetrologie();
    if (_balanceViewId === balanceId && el('m-balance-view')?.classList.contains('open')) openBalanceView(balanceId);
  };
  openModal('m-confirm');
}

/**
 * Demande confirmation puis supprime une balance entière : tous les
 * fichiers de tous ses passages, la ligne Supabase, et l'entrée locale.
 * @param {string} balanceId - Référence vers Balance.id.
 * @returns {void}
 */
function deleteBalance(balanceId) {
  if (!hasPerm('metro_delete')) return;

  /** @type {Balance | undefined} */
  const balance = (DB.balances || []).find(b => b.id === balanceId);
  if (!balance) return;

  el('conf-msg').textContent    = `Supprimer la balance « ${balance.nom} » ?`;
  el('conf-detail').textContent = ` ${(balance.passages || []).length} passage(s) et tous leurs documents seront définitivement supprimés.`;
  el('conf-ok').onclick = () => {
    (balance.passages || []).forEach(passage => _deletePassageFiles(balanceId, passage));

    DB.balances = (DB.balances || []).filter(b => b.id !== balanceId);
    sbDeleteWhere('balances', 'id', balanceId);
    _saveToLocalStorage();

    closeModal('m-confirm');
    closeModal('m-balance-view');
    showToast('Balance supprimée.');
    renderMetrologie();
  };
  openModal('m-confirm');
}

// ─────────────────────────────────────────────
// 8. RAPPEL AUTOMATIQUE (30 jours avant l'échéance)
// ─────────────────────────────────────────────

/**
 * Contrôle les échéances de toutes les balances et crée une ALERTE
 * MAGASIN (DB.alertes) pour chaque balance dont l'échéance du dernier
 * passage est à METRO_ALERT_DAYS_BEFORE jours ou moins (dépassée
 * comprise) et qui n'a pas encore été alertée pour CETTE échéance
 * (balance.alerte_echeance).
 *
 * L'alerte reprend les données du dernier passage (date, échéance,
 * commentaire) et joint ses documents PAR RÉFÉRENCE (mêmes URLs,
 * aucune copie de fichier) — consultables et téléchargeables
 * directement depuis l'alerte, comme n'importe quel document
 * d'alerte. Supprimer l'alerte ne supprime PAS ces fichiers (voir la
 * garantie de propriété dans _deleteAlertDocuments, magasins.js).
 *
 * Volontairement SANS création de NC/action liée (contrairement à
 * saveAlert, alertes.js) : c'est un rappel de planification, pas une
 * non-conformité.
 *
 * Appelée par renderDash (dashboard.js) — au plus une fois par heure
 * par session, sauf appel forcé (savePassage).
 * @param {boolean} [force] - Ignore la limitation horaire (utilisé après l'enregistrement d'un passage).
 * @returns {void}
 */
function checkMetrologieEcheances(force) {
  if (!CU) return;

  /** @type {number} */
  const now = Date.now();
  if (!force && now - _metroLastCheck < 3_600_000) return;
  _metroLastCheck = now;

  /** @type {number} */
  let createdCount = 0;

  (DB.balances || []).forEach(balance => {
    /** @type {Passage | null} */
    const last = _lastPassage(balance);
    if (!last || !last.echeance) return;
    if (_daysUntil(last.echeance) > METRO_ALERT_DAYS_BEFORE) return;
    if (balance.alerte_echeance === last.echeance) return; // déjà alertée pour cette échéance

    /** @type {{nom: string} | undefined} */
    const store = DB.magasins.find(m => m.id === balance.mid);
    /** @type {PassageDocument[]} Documents déjà envoyés uniquement (une URL vide ne serait pas consultable depuis l'alerte). */
    const documents = (last.documents || []).filter(d => d.url).map(d => ({ ...d }));

    DB.alertes = DB.alertes || [];
    DB.alertes.push({
      id: 'AL-' + uid(),
      mid: balance.mid,
      mag: store ? store.nom : '',
      titre: `Métrologie — échéance balance « ${balance.nom} » le ${fd(last.echeance)}`,
      type: 'Matériel',
      gravite: 'Majeure',
      signale: 'QualiStore — rappel automatique',
      cmt: `Prendre rendez-vous avec le prestataire de métrologie.`
        + ` Dernier passage : ${fd(last.date)}. Échéance : ${fd(last.echeance)}.`
        + (last.cmt ? ` Commentaire du dernier passage : ${last.cmt}.` : '')
        + (documents.length ? ` Les ${documents.length} document(s) du dernier passage sont joints à cette alerte.` : ''),
      photos: [],
      documents,
      date: today(),
      statut: 'Active',
    });

    balance.alerte_echeance = last.echeance;
    createdCount++;
  });

  if (createdCount) {
    save(['alertes', 'balances']);
    showToast(`${createdCount} rappel(s) métrologie créé(s) — voir les alertes du tableau de bord.`, 'warning');
    if (typeof renderAlertsDash === 'function') renderAlertsDash();
  }
}
