// ══════════════════════════════════════════════════════════════
// ALERTES — Gestion des alertes terrain
// Dépend de : storage.js (DB, CU), auth.js (hasPerm), ui.js
// ══════════════════════════════════════════════════════════════

// ─────────────────────────────────────────────
// 0. TYPEDEFS JSDoc (pour inférence VSCode / TypeScript)
//    ⚠️ Déduits de l'usage dans ce fichier.
//
//    ⚠️ PRÉCISION : pour une NC créée depuis une alerte (voir
//    _createNcFromAlert), NC.rayon reçoit en réalité la valeur de
//    AlertType ('Matériel', 'Structure'...), PAS un nom de rayon
//    FSQS réel. NC.mid est ici toujours renseigné (storeId), ce qui
//    nuance l'hypothèse précédemment posée dans nc.js (mid parfois
//    vide pour les NC d'alerte) — cette hypothèse n'est pas
//    confirmée par ce fichier ; elle pourrait correspondre à un
//    autre flux non observé.
// ─────────────────────────────────────────────

/**
 * Type d'alerte terrain. Union fermée déduite des clés de
 * ALERT_TYPE_ICONS / ALERT_DEADLINE_DAYS / ALERT_GRAVITY_COLORS.
 * @typedef {'Matériel'|'Structure'|'Produit'|'Hygiène'|'Sécurité'} AlertType
 */

/**
 * Niveau de gravité d'une alerte. Réutilise les mêmes valeurs que
 * GrilleCriticite (voir config.js/grille.js/nc.js).
 * @typedef {'Critique'|'Majeure'|'Mineure'} AlertGravite
 */

/**
 * Statut d'une alerte terrain.
 * @typedef {'Active'|'Clôturée'} AlertStatut
 */

/**
 * Alerte terrain, signalée manuellement (hors audit planifié).
 * @typedef {Object} Alerte
 * @property {string} id - Préfixé 'AL-' + uid().
 * @property {string} mid - Référence vers Magasin.id.
 * @property {string} mag - Nom du magasin (copie figée).
 * @property {string} titre
 * @property {AlertType} type
 * @property {AlertGravite} gravite
 * @property {string} signale - Nom de la personne ayant signalé l'alerte.
 * @property {string} cmt - Commentaire, chaîne vide possible.
 * @property {string[]} photos - URLs Supabase Storage, ou chaînes base64 (data:image/...) en fallback hors-ligne.
 * @property {string} date - Date de création (format produit par today()).
 * @property {AlertStatut} statut
 */

/**
 * Magasin. Seules .id et .nom sont accédées dans ce fichier ;
 * structure complète dans magasins.js.
 * @typedef {Object} Magasin
 * @property {string} id
 * @property {string} nom
 */

/**
 * Non-conformité (NC). Voir nc.js/audits.js pour la définition
 * canonique complète. Rappelée ici pour le contexte de création
 * depuis une alerte.
 * @typedef {Object} NC
 * @property {string} id
 * @property {string} mid
 * @property {string} mag
 * @property {AlertType} rayon - Pour une NC issue d'alerte, contient le type d'alerte (PAS un rayon FSQS réel).
 * @property {string} date
 * @property {string} desc
 * @property {AlertGravite} crit
 * @property {string} resp
 * @property {string} dl
 * @property {'Ouverte'|'En cours'|'Clôturée'} statut
 * @property {string} aid - Référence vers Alerte.id (puisque isAlert est vrai).
 * @property {boolean} isAlert
 */

/**
 * Action corrective. Voir actions.js/audits.js pour la définition
 * canonique complète.
 * @typedef {Object} Action
 * @property {string} id
 * @property {string} ncId
 * @property {string} desc
 * @property {string} mag
 * @property {string} resp
 * @property {string} ech
 * @property {AlertGravite} prio
 * @property {'Ouverte'|'En cours'|'Traitée'} statut
 * @property {string} alertId - Référence vers Alerte.id.
 */

// ─────────────────────────────────────────────
// 1. CONSTANTES
// ─────────────────────────────────────────────

/**
 * Délai de traitement en jours selon la criticité.
 * @type {Record<AlertGravite, number>}
 */
const ALERT_DEADLINE_DAYS = { Critique: 3, Majeure: 7, Mineure: 14 };

/**
 * Couleurs d'affichage par gravité.
 * @type {Record<AlertGravite, string>}
 */
const ALERT_GRAVITY_COLORS = { Critique: '#e53935', Majeure: '#ea580c', Mineure: '#f59e0b' };

/**
 * Icônes par type d'alerte.
 * @type {Record<AlertType, string>}
 */
const ALERT_TYPE_ICONS = {
  Matériel:  'ti-tool',
  Structure: 'ti-building',
  Produit:   'ti-package',
  Hygiène:   'ti-droplet',
  Sécurité:  'ti-shield',
};

// ─────────────────────────────────────────────
// 2. ÉTAT
// ─────────────────────────────────────────────

/**
 * Photos sélectionnées pour la nouvelle alerte (URLs Supabase ou base64 fallback).
 * @type {string[]}
 */
let _alertPendingPhotos = [];

// ─────────────────────────────────────────────
// 3. MODAL NOUVELLE ALERTE
// ─────────────────────────────────────────────

/**
 * Ouvre la modale de création d'une nouvelle alerte terrain,
 * réinitialise le formulaire et peuple le select de magasins
 * visibles et actifs.
 * @returns {void}
 */
function openAlertModal() {
  el('al-err').classList.remove('show');
  ['al-titre', 'al-cmt'].forEach(id => sv(id, ''));
  sv('al-signale', CU ? CU.nom : '');
  el('al-type').value    = '';
  el('al-gravite').value = '';
  _alertPendingPhotos = [];
  _renderAlertPhotoPreviews();

  const select = el('al-mag');
  select.innerHTML =
    '<option value="">Sélectionner...</option>' +
    DB.magasins
      .filter(m => visibleMids().includes(m.id) && m.statut === 'actif')
      .map(m => `<option value="${m.id}">${m.nom}</option>`)
      .join('');

  openModal('m-alert');
}

/**
 * Valide et sauvegarde une nouvelle alerte terrain : crée l'Alerte,
 * puis automatiquement une NC et une Action corrective liées.
 * @returns {void}
 */
function saveAlert() {
  /** @type {string} */
  const storeId  = v('al-mag');
  /** @type {string} */
  const title    = v('al-titre').trim();
  /** @type {AlertType} */
  const type     = v('al-type');
  /** @type {AlertGravite} */
  const gravity  = v('al-gravite');
  /** @type {string} */
  const reporter = v('al-signale').trim();
  /** @type {string} */
  const comment  = v('al-cmt');
  const errorEl  = el('al-err');

  if (!storeId || !title || !type || !gravity || !reporter) {
    errorEl.textContent = 'Magasin, titre, type, gravité et signataire sont requis.';
    errorEl.classList.add('show');
    return;
  }

  /** @type {Magasin | {}} */
  const store      = DB.magasins.find(m => m.id === storeId) || {};
  /** @type {string} */
  const alertId    = 'AL-' + uid();
  /** @type {string} */
  const deadline   = _computeDeadline(gravity);
  /** @type {string} */
  const description = `[Alerte ${type}] ${title}${comment ? ' — ' + comment : ''}`;

  if (!DB.alertes) DB.alertes = [];

  /** @type {Alerte} */
  DB.alertes.push({
    id: alertId, mid: storeId, mag: store.nom || '',
    titre: title, type, gravite: gravity, signale: reporter,
    cmt: comment, photos: [..._alertPendingPhotos],
    date: today(), statut: 'Active',
  });

  _createNcFromAlert({ storeId, storeName: store.nom || '', type, gravity, reporter, deadline, description, alertId });
  _createActionFromAlert({ storeId: storeId, storeName: store.nom || '', title, reporter, deadline, gravity, alertId });

  save();
  closeModal('m-alert');
  _alertPendingPhotos = [];

  const ncBadge = el('nc-bdg');
  if (ncBadge) ncBadge.textContent = DB.ncs.filter(nc => nc.statut === 'Ouverte').length;

  renderDash();
}

/**
 * Calcule la date d'échéance de traitement selon la gravité (voir
 * ALERT_DEADLINE_DAYS), 7 jours par défaut si gravité inconnue.
 * @param {AlertGravite | string} gravity
 * @returns {string} Date au format 'YYYY-MM-DD'.
 */
function _computeDeadline(gravity) {
  /** @type {number} */
  const days = ALERT_DEADLINE_DAYS[gravity] || 7;
  return new Date(Date.now() + days * 86_400_000).toISOString().split('T')[0];
}

/**
 * Crée et ajoute à DB.ncs une NC reflétant une alerte terrain
 * nouvellement créée.
 * @param {Object} params
 * @param {string} params.storeId
 * @param {string} params.storeName
 * @param {AlertType} params.type
 * @param {AlertGravite} params.gravity
 * @param {string} params.reporter
 * @param {string} params.deadline
 * @param {string} params.description
 * @param {string} params.alertId
 * @returns {void}
 */
function _createNcFromAlert({ storeId, storeName, type, gravity, reporter, deadline, description, alertId }) {
  /** @type {NC} */
  DB.ncs.push({
    id:      'NC-' + uid(),
    mid:     storeId,
    mag:     storeName,
    rayon:   type,
    date:    today(),
    desc:    description,
    crit:    gravity,
    resp:    reporter,
    dl:      deadline,
    statut:  'Ouverte',
    aid:     alertId,
    isAlert: true,
  });
}

/**
 * Crée et ajoute à DB.actions une action corrective reflétant une
 * alerte terrain nouvellement créée. Suppose que la NC correspondante
 * vient d'être poussée en fin de DB.ncs par _createNcFromAlert.
 * @param {Object} params
 * @param {string} params.storeId - Non utilisé directement (conservé pour cohérence d'appel).
 * @param {string} params.storeName
 * @param {string} params.title
 * @param {string} params.reporter
 * @param {string} params.deadline
 * @param {AlertGravite} params.gravity
 * @param {string} params.alertId
 * @returns {void}
 */
function _createActionFromAlert({ storeId, storeName, title, reporter, deadline, gravity, alertId }) {
  /** @type {Action} */
  DB.actions.push({
    id:      'AC-' + uid(),
    ncId:    DB.ncs[DB.ncs.length - 1].id,
    desc:    `Traiter l'alerte : ${title}`,
    mag:     storeName,
    resp:    reporter,
    ech:     deadline,
    prio:    gravity,
    statut:  'Ouverte',
    alertId,
  });
}

// ─────────────────────────────────────────────
// 4. GESTION DES PHOTOS
// ─────────────────────────────────────────────

/**
 * Upload une ou plusieurs photos pour la nouvelle alerte vers
 * Supabase Storage ; si l'upload échoue (hors-ligne), bascule en
 * fallback base64 stocké directement en mémoire.
 * @param {HTMLInputElement} input - Élément `<input type="file" multiple>`.
 * @returns {Promise<void>}
 */
async function handleAlertPhotos(input) {
  /** @type {File[]} */
  const files = [...input.files];

  for (const file of files) {
    /** @type {string} */
    const storagePath = `alertes/${uid()}-${file.name.replace(/[^a-zA-Z0-9._-]/g, '_')}`;
    /** @type {string | null} */
    const uploadedUrl = await sbUploadPhoto(file, storagePath);

    if (uploadedUrl) {
      _alertPendingPhotos.push(uploadedUrl);
      _renderAlertPhotoPreviews();
    } else {
      // Fallback base64 si offline
      _readFileAsBase64(file, base64 => {
        _alertPendingPhotos.push(base64);
        _renderAlertPhotoPreviews();
      });
    }
  }

  input.value = '';
}

/**
 * Lit un fichier et le convertit en chaîne base64 (data URL), via
 * un callback asynchrone.
 * @param {File} file
 * @param {(base64: string) => void} callback
 * @returns {void}
 */
function _readFileAsBase64(file, callback) {
  const reader = new FileReader();
  reader.onload = event => callback(event.target.result);
  reader.readAsDataURL(file);
}

/**
 * Rafraîchit l'aperçu des miniatures de photos en attente, avec un
 * bouton de suppression par photo et un bouton d'ajout final.
 * @returns {void}
 */
function _renderAlertPhotoPreviews() {
  const container = el('al-photos-prev');
  /** @type {string} */
  const thumbnails = _alertPendingPhotos.map((url, index) => `
    <div style="position:relative;display:inline-block">
      <img class="photo-thumb" src="${url}" alt="photo alerte">
      <button
        onclick="_alertPendingPhotos.splice(${index},1);_renderAlertPhotoPreviews()"
        style="position:absolute;top:-4px;right:-4px;background:#e53935;color:#fff;border:none;border-radius:50%;width:18px;height:18px;font-size:11px;cursor:pointer;line-height:1;display:flex;align-items:center;justify-content:center"
        aria-label="Supprimer la photo">
        &times;
      </button>
    </div>`).join('');

  container.innerHTML =
    thumbnails +
    `<div class="photo-add" onclick="el('al-photo-input').click()" role="button" aria-label="Ajouter une photo">
       <i class="ti ti-plus" style="font-size:20px"></i>
     </div>`;
}

// ─────────────────────────────────────────────
// 5. RENDU DASHBOARD ALERTES
// ─────────────────────────────────────────────

/**
 * Affiche la liste des alertes actives (max 8) dans le widget
 * dashboard.
 * @returns {void}
 */
function renderAlertsDash() {
  if (!DB.alertes) return;

  /** @type {Alerte[]} */
  const activeAlerts = DB.alertes.filter(a => a.statut === 'Active');
  el('d-alert-cnt').textContent = `${activeAlerts.length} alerte(s) active(s)`;

  if (!DB.alertes.length) {
    el('d-alerts-list').innerHTML = `<div class="empty-state" style="padding:24px">
      <i class="ti ti-bell" style="font-size:28px"></i><p>Aucune alerte</p>
    </div>`;
    return;
  }

  el('d-alerts-list').innerHTML = activeAlerts
    .slice(0, 8)
    .map(alert => _buildAlertItem(alert))
    .join('');
}

/**
 * Construit l'élément HTML d'une alerte dans le widget dashboard
 * (point de gravité, icône de type, photos, boutons clôturer/supprimer).
 * @param {Alerte} alert
 * @returns {string}
 */
function _buildAlertItem(alert) {
  /** @type {string} */
  const color   = ALERT_GRAVITY_COLORS[alert.gravite] || '#888';
  /** @type {string} */
  const icon    = ALERT_TYPE_ICONS[alert.type] || 'ti-bell';
  /** @type {string} */
  const escapedTitle = alert.titre.replace(/'/g, "\\'");
  /** @type {boolean} */
  const isAdmin = CU && CU.role === 'admin';

  /** @type {string} */
  const photosHtml = alert.photos?.length
    ? `<div style="display:flex;gap:6px;margin-top:6px;flex-wrap:wrap">
         ${alert.photos.slice(0, 3).map(p =>
           `<img src="${p}" class="photo-thumb" style="width:52px;height:52px;cursor:pointer" onclick="openPhotoViewer('${p}')">`
         ).join('')}
       </div>`
    : '';

  /** @type {string} */
  const commentHtml = alert.cmt
    ? `<div style="font-size:12px;color:var(--text2);margin-top:3px;font-style:italic">
         ${alert.cmt.slice(0, 100)}${alert.cmt.length > 100 ? '…' : ''}
       </div>`
    : '';

  return `<div class="alert-item">
    <div class="alert-dot" style="background:${color}"></div>
    <div style="flex:1">
      <div style="display:flex;align-items:center;gap:8px;margin-bottom:3px">
        <i class="ti ${icon}" style="font-size:14px;color:var(--text2)"></i>
        <span style="font-size:13px;font-weight:600">${alert.titre}</span>
        ${critBdg(alert.gravite)}
        <span class="badge" style="background:#f3f4f6;color:#374151">${alert.type}</span>
      </div>
      <div class="tsm tm">
        ${alert.mag ? `🏪 <strong>${alert.mag}</strong> · ` : ''}Signalé par <strong>${alert.signale}</strong> · ${fd(alert.date)}
        ${alert.photos?.length ? `· <i class="ti ti-camera" style="font-size:12px"></i> ${alert.photos.length} photo(s)` : ''}
      </div>
      ${commentHtml}
      ${photosHtml}
    </div>
    <button class="btn btn-secondary btn-sm" onclick="closeAlerte('${alert.id}')" title="Clôturer">
      <i class="ti ti-check"></i>
    </button>
    ${isAdmin
      ? `<button class="btn btn-danger btn-sm" onclick="confirmDel('alert','${alert.id}','${escapedTitle}')">
           <i class="ti ti-trash"></i>
         </button>`
      : ''}
  </div>`;
}

// ─────────────────────────────────────────────
// 6. CLÔTURE
// ─────────────────────────────────────────────

/**
 * Clôture une alerte terrain (statut → 'Clôturée'). Ne synchronise
 * pas automatiquement la NC/Action liées (contrairement à
 * changeActStatut() dans actions.js) — la clôture passe uniquement
 * par ce bouton dédié de l'alerte elle-même.
 * @param {string} alertId - Référence vers Alerte.id.
 * @returns {void}
 */
function closeAlerte(alertId) {
  /** @type {Alerte | undefined} */
  const alert = DB.alertes.find(a => a.id === alertId);
  if (!alert) return;
  alert.statut = 'Clôturée';
  save();
  renderDash();
}
