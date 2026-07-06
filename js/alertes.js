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
 * @property {AlertDocument[]} [documents] - Documents joints (avis de passage, rapport, facture...), stockage brut sans traitement. Absent sur les alertes créées avant ce champ.
 * @property {string} date - Date de création (format produit par today()).
 * @property {AlertStatut} statut
 */

/**
 * Document joint à une alerte terrain — stockage brut, sans traitement
 * ni conversion. Sert uniquement à consultation/téléchargement.
 * @typedef {Object} AlertDocument
 * @property {string} id - Identifiant généré ('doc-' + uid()).
 * @property {string} nom - Nom de fichier d'origine (perdu côté stockage, qui utilise un nom généré — voir handleAlertDocuments).
 * @property {string} url - URL Supabase Storage (bucket 'photos', réutilisé — voir handleAlertDocuments), ou data URL base64 en fallback hors-ligne.
 * @property {string} mime - Type MIME d'origine (file.type), utilisé pour l'icône et le mode d'aperçu.
 * @property {number} taille - Taille en octets (file.size), affichage informatif seulement.
 * @property {number} ajoutLe - Horodatage (Date.now()) de l'ajout.
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

/**
 * Documents sélectionnés pour l'alerte en cours (création ou modification).
 * @type {AlertDocument[]}
 */
let _alertPendingDocuments = [];

/**
 * Id de l'alerte en cours de modification, ou null en création.
 * @type {string | null}
 */
let _editingAlertId = null;

// ─────────────────────────────────────────────
// 3. MODAL NOUVELLE ALERTE
// ─────────────────────────────────────────────

/**
 * Ouvre la modale d'alerte terrain, en mode création (sans argument)
 * ou modification (avec l'id d'une alerte existante). Réutilise la
 * même modale pour les deux modes, comme openMagModal (magasins.js)
 * et openUserModal (users.js) — le titre et le bouton d'action sont
 * adaptés en conséquence.
 *
 * ⚠️ AJOUTÉ : le mode modification ne recrée pas la NC/l'Action liée
 * (voir saveAlert) — seule l'Alerte elle-même est mise à jour. Permet
 * notamment d'ajouter des documents (avis de passage, rapport,
 * facture...) après la création initiale de l'alerte.
 * @param {string} [alertId] - Référence vers Alerte.id ; absent = création.
 * @returns {void}
 */
function openAlertModal(alertId) {
  /** @type {Alerte | undefined} */
  const alert = alertId ? DB.alertes.find(a => a.id === alertId) : undefined;
  _editingAlertId = alert ? alert.id : null;

  el('al-err').classList.remove('show');
  sv('al-titre', alert ? alert.titre : '');
  sv('al-cmt', alert ? (alert.cmt || '') : '');
  sv('al-signale', alert ? alert.signale : (CU ? CU.nom : ''));
  el('al-type').value    = alert ? alert.type    : '';
  el('al-gravite').value = alert ? alert.gravite : '';
  _alertPendingPhotos    = alert ? [...(alert.photos    || [])] : [];
  _alertPendingDocuments = alert ? [...(alert.documents || [])] : [];
  _renderAlertPhotoPreviews();
  _renderAlertDocumentPreviews();

  const select = el('al-mag');
  select.innerHTML =
    '<option value="">Sélectionner...</option>' +
    DB.magasins
      .filter(m => visibleMids().includes(m.id) && m.statut === 'actif')
      .map(m => `<option value="${m.id}">${m.nom}</option>`)
      .join('');
  if (alert) select.value = alert.mid;

  /** @type {HTMLElement | null} */
  const titleEl = el('m-alert-title');
  if (titleEl) titleEl.innerHTML = alert
    ? '<i class="ti ti-bell-ringing"></i> Modifier l\'alerte'
    : '<i class="ti ti-bell-ringing"></i> Nouvelle alerte terrain';

  /** @type {HTMLElement | null} */
  const saveBtn = el('al-save-btn');
  if (saveBtn) saveBtn.innerHTML = alert
    ? '<i class="ti ti-device-floppy"></i> Enregistrer'
    : '<i class="ti ti-bell-ringing"></i> Envoyer l\'alerte';

  openModal('m-alert');
}

/**
 * Valide et sauvegarde l'alerte terrain de la modale. En création :
 * crée l'Alerte puis automatiquement une NC et une Action correctives
 * liées. En modification (_editingAlertId défini) : met à jour
 * l'Alerte existante uniquement — la NC/Action déjà créées lors de
 * la création initiale ne sont PAS régénérées ni resynchronisées
 * (limite connue : un changement de titre/gravité ici ne se répercute
 * pas sur leur description).
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
  const store = DB.magasins.find(m => m.id === storeId) || {};

  if (_editingAlertId) {
    /** @type {Alerte | undefined} */
    const existing = DB.alertes.find(a => a.id === _editingAlertId);
    if (existing) {
      Object.assign(existing, {
        mid: storeId, mag: store.nom || '',
        titre: title, type, gravite: gravity, signale: reporter,
        cmt: comment, photos: [..._alertPendingPhotos],
        documents: [..._alertPendingDocuments],
      });

      // Répercute sur la NC/Action générées à la création (mêmes champs
      // que _createNcFromAlert/_createActionFromAlert), pour que les
      // pages NC et Actions reflètent la modification immédiatement.
      // ⚠️ L'échéance (dl/ech) n'est volontairement PAS recalculée ici,
      // même si la gravité change : décaler une échéance déjà fixée en
      // silence serait surprenant pour l'utilisateur qui la suit.
      /** @type {NC | undefined} */
      const linkedNc = DB.ncs.find(nc => nc.aid === existing.id);
      if (linkedNc) {
        Object.assign(linkedNc, {
          mid: storeId, mag: store.nom || '', rayon: type,
          desc: `[Alerte ${type}] ${title}${comment ? ' — ' + comment : ''}`,
          crit: gravity, resp: reporter,
        });
      }
      /** @type {Action | undefined} */
      const linkedAction = DB.actions.find(a => a.alertId === existing.id);
      if (linkedAction) {
        Object.assign(linkedAction, {
          desc: `Traiter l'alerte : ${title}`,
          mag: store.nom || '', resp: reporter, prio: gravity,
        });
      }
    }
  } else {
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
      documents: [..._alertPendingDocuments],
      date: today(), statut: 'Active',
    });

    _createNcFromAlert({ storeId, storeName: store.nom || '', type, gravity, reporter, deadline, description, alertId });
    _createActionFromAlert({ storeId: storeId, storeName: store.nom || '', title, reporter, deadline, gravity, alertId });

    const ncBadge = el('nc-bdg');
    if (ncBadge) ncBadge.textContent = DB.ncs.filter(nc => nc.statut === 'Ouverte').length;
  }

  save();
  closeModal('m-alert');
  _alertPendingPhotos    = [];
  _alertPendingDocuments = [];
  _editingAlertId = null;

  // Rafraîchit toute page déjà ouverte pouvant afficher cette alerte
  // (via sa NC/Action liée) ou l'alerte elle-même, pour une mise à
  // jour immédiate sans rechargement manuel.
  if (el('page-nc')?.classList.contains('active'))      renderNC();
  if (el('page-actions')?.classList.contains('active')) renderActions();
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
 *
 * ⚠️ AJOUTÉ : chaque photo est redimensionnée/compressée côté
 * navigateur (voir compressImageFile, ui.js) avant l'upload — même
 * correction que handleAuditPhoto (audits.js). Le fallback base64
 * réutilise aussi la version compressée : une chaîne base64 plus
 * légère limite le risque de dépasser les quotas de localStorage en
 * mode hors-ligne.
 * @param {HTMLInputElement} input - Élément `<input type="file" multiple>`.
 * @returns {Promise<void>}
 */
async function handleAlertPhotos(input) {
  /** @type {File[]} */
  const files = [...input.files];

  for (const file of files) {
    /** @type {File | Blob} */
    const compressed = await compressImageFile(file);
    /** @type {string} */
    const ext = compressed.type === 'image/jpeg' ? 'jpg' : (file.name.split('.').pop() || 'jpg');
    /** @type {string} */
    const storagePath = `alertes/${uid()}.${ext}`;
    /** @type {string | null} */
    const uploadedUrl = await uploadPhotoWithRetry(compressed, storagePath);

    if (uploadedUrl) {
      _alertPendingPhotos.push(uploadedUrl);
      _renderAlertPhotoPreviews();
    } else {
      // Fallback base64 si offline
      _readFileAsBase64(compressed, base64 => {
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
 * @param {File|Blob} file - Fichier d'origine, ou Blob compressé (voir compressImageFile, ui.js) — FileReader.readAsDataURL accepte les deux.
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
// 4bis. GESTION DES DOCUMENTS (stockage brut)
// ─────────────────────────────────────────────

/**
 * Icônes par type MIME approximatif, pour l'aperçu des documents.
 * @type {Record<string, string>}
 */
const ALERT_DOC_ICONS = {
  pdf: 'ti-file-type-pdf', word: 'ti-file-type-doc', sheet: 'ti-file-type-xls', excel: 'ti-file-type-xls',
};

/**
 * Détermine l'icône Tabler à afficher pour un document, selon son
 * type MIME. Repli générique si le type ne correspond à rien de connu.
 * @param {string} mime
 * @returns {string}
 */
function _alertDocumentIcon(mime) {
  if (!mime) return 'ti-file';
  if (mime.startsWith('image/')) return 'ti-photo';
  for (const key in ALERT_DOC_ICONS) if (mime.includes(key)) return ALERT_DOC_ICONS[key];
  return 'ti-file';
}

/**
 * Ajoute un ou plusieurs documents à l'alerte en cours (création ou
 * modification). STOCKAGE BRUT UNIQUEMENT : contrairement aux photos
 * (handleAlertPhotos), le fichier n'est ni compressé ni converti — il
 * est envoyé tel quel, pour consultation/téléchargement fidèle à
 * l'original (avis de passage, rapport, facture...).
 *
 * Réutilise sbUploadPhoto / le bucket Storage 'photos' : la création
 * d'un bucket dédié 'documents' n'est pas possible via l'API REST à
 * clé anonyme utilisée par ce projet. Un bucket Supabase accepte
 * n'importe quel type de fichier quel que soit son nom — seul le
 * préfixe de chemin ('alertes-documents/' plutôt que 'alertes/')
 * distingue les documents des photos pour un nettoyage sélectif (voir
 * _deleteAlertDocuments, magasins.js).
 * @param {HTMLInputElement} input - Élément `<input type="file" multiple>`.
 * @returns {Promise<void>}
 */
async function handleAlertDocuments(input) {
  /** @type {File[]} */
  const files = [...input.files];

  for (const file of files) {
    /** @type {string} */
    const ext = file.name.includes('.') ? file.name.split('.').pop() : 'bin';
    /** @type {string} */
    const storagePath = `alertes-documents/${uid()}.${ext}`;
    /** @type {string | null} */
    const uploadedUrl = await uploadPhotoWithRetry(file, storagePath);

    /** @type {Omit<AlertDocument, 'url'>} */
    const base = { id: 'doc-' + uid(), nom: file.name, mime: file.type || 'application/octet-stream', taille: file.size, ajoutLe: Date.now() };

    if (uploadedUrl) {
      _alertPendingDocuments.push({ ...base, url: uploadedUrl });
      _renderAlertDocumentPreviews();
    } else {
      _readFileAsBase64(file, base64 => {
        _alertPendingDocuments.push({ ...base, url: base64 });
        _renderAlertDocumentPreviews();
      });
    }
  }

  input.value = '';
}

/**
 * Rafraîchit la liste des documents en attente dans la modale, avec
 * icône selon le type, nom de fichier, taille, et un bouton de
 * suppression par document.
 * @returns {void}
 */
function _renderAlertDocumentPreviews() {
  const container = el('al-docs-prev');
  if (!container) return;

  container.innerHTML = _alertPendingDocuments.map((doc, index) => {
    /** @type {string} */
    const escapedName = doc.nom.replace(/'/g, "\\'");
    return `<div class="doc-chip">
      <i class="ti ${_alertDocumentIcon(doc.mime)}"></i>
      <span class="doc-name" onclick="openDocumentViewer('${doc.url}','${doc.mime}','${escapedName}')" title="${doc.nom}">${doc.nom}</span>
      <span class="doc-size">${_formatFileSize(doc.taille)}</span>
      <button onclick="_alertPendingDocuments.splice(${index},1);_renderAlertDocumentPreviews()" aria-label="Retirer le document" title="Retirer">
        <i class="ti ti-x"></i>
      </button>
    </div>`;
  }).join('');
}

/**
 * Formate une taille en octets en chaîne lisible (Ko/Mo).
 * @param {number} bytes
 * @returns {string}
 */
function _formatFileSize(bytes) {
  if (!bytes) return '';
  if (bytes < 1024 * 1024) return Math.round(bytes / 1024) + ' Ko';
  return (bytes / (1024 * 1024)).toFixed(1) + ' Mo';
}

/**
 * Affiche un document en aperçu plein écran lorsque le navigateur
 * sait le rendre nativement (image ou PDF), SANS AUCUN traitement du
 * fichier — le navigateur affiche le fichier stocké tel quel. Pour
 * tout autre type (Word, Excel...), aucun rendu inline fiable
 * n'existe côté navigateur : le fichier est simplement ouvert dans un
 * nouvel onglet.
 * @param {string} url - URL Supabase Storage, ou data URL base64 en fallback hors-ligne.
 * @param {string} mime - AlertDocument.mime.
 * @param {string} [name] - Nom de fichier d'origine, pour le titre de l'aperçu.
 * @returns {void}
 */
function openDocumentViewer(url, mime, name) {
  if (mime && mime.startsWith('image/')) { openPhotoViewer(url); return; }

  if (mime === 'application/pdf') {
    const overlay = document.createElement('div');
    overlay.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,.85);z-index:9999;display:flex;flex-direction:column;align-items:center;justify-content:center';
    overlay.setAttribute('role', 'dialog');
    overlay.setAttribute('aria-label', 'Visionneuse document');
    overlay.innerHTML = `
      <div style="width:92vw;height:88vh;background:#fff;border-radius:10px;overflow:hidden;box-shadow:0 8px 40px rgba(0,0,0,.6)">
        <iframe src="${url}" style="width:100%;height:100%;border:none" title="${name ? name.replace(/"/g, '&quot;') : 'Document PDF'}"></iframe>
      </div>
      <button style="margin-top:14px;background:#fff;border:none;border-radius:8px;padding:8px 16px;cursor:pointer;font-size:13px;font-weight:600">Fermer</button>
    `;
    overlay.querySelector('button').onclick = () => document.body.removeChild(overlay);
    overlay.onclick = e => { if (e.target === overlay) document.body.removeChild(overlay); };
    document.body.appendChild(overlay);
    return;
  }

  // Type non prévisualisable inline (Word, Excel...) : ouverture native navigateur/OS.
  window.open(url, '_blank', 'noopener');
  showToast('Ce type de fichier ne peut pas être prévisualisé ici — ouvert dans un nouvel onglet.', 'warning');
}

/**
 * Télécharge un document tel quel (aucune conversion), en restaurant
 * son nom de fichier d'origine — le chemin de stockage utilise un nom
 * généré (uid), pas le nom d'origine. Tente d'abord un fetch+Blob
 * (fonctionne pour les URLs Supabase Storage et les data URLs) ; si
 * ça échoue (réseau, CORS...), retombe sur une simple navigation vers
 * l'URL.
 * @param {string} url
 * @param {string} name - Nom de fichier à restaurer.
 * @returns {Promise<void>}
 */
async function downloadDocument(url, name) {
  try {
    /** @type {Response} */
    const response = await fetch(url);
    if (!response.ok) throw new Error('HTTP ' + response.status);
    /** @type {Blob} */
    const blob = await response.blob();
    /** @type {string} */
    const objectUrl = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = objectUrl;
    link.download = name || 'document';
    document.body.appendChild(link);
    link.click();
    link.remove();
    URL.revokeObjectURL(objectUrl);
  } catch (err) {
    console.warn('Téléchargement direct impossible, ouverture de l’URL :', err);
    window.open(url, '_blank', 'noopener');
  }
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

  /** @type {HTMLElement | null} */
  const urgentCard = el('d-urgent-alerts');
  if (!urgentCard) return;

  /** @type {Alerte[]} */
  const activeAlerts = DB.alertes.filter(a => a.statut === 'Active');

  if (!activeAlerts.length) {
    urgentCard.style.display = 'none';
    urgentCard.classList.remove('d-urgent-alerts-critical');
    return;
  }

  urgentCard.style.display = '';
  el('d-alert-cnt').textContent = `${activeAlerts.length} alerte(s) active(s)`;

  /** @type {boolean} */
  const hasCritical = activeAlerts.some(a => a.gravite === 'Critique');
  urgentCard.classList.toggle('d-urgent-alerts-critical', hasCritical);

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

  /** @type {string} */
  const documentsHtml = alert.documents?.length
    ? `<div style="display:flex;flex-wrap:wrap;gap:6px;margin-top:6px">
         ${alert.documents.map(doc => {
           /** @type {string} */
           const escapedName = doc.nom.replace(/'/g, "\\'");
           return `<span class="badge" style="background:#eef2ff;color:#3730a3;cursor:pointer;display:inline-flex;align-items:center;gap:4px" title="${doc.nom}"
             onclick="openDocumentViewer('${doc.url}','${doc.mime}','${escapedName}')">
             <i class="ti ${_alertDocumentIcon(doc.mime)}" style="font-size:12px"></i> ${doc.nom.length > 20 ? doc.nom.slice(0, 17) + '…' : doc.nom}
           </span>
           <button class="btn btn-secondary btn-sm" style="padding:2px 6px" title="Télécharger" onclick="downloadDocument('${doc.url}','${escapedName}')">
             <i class="ti ti-download" style="font-size:12px"></i>
           </button>`;
         }).join('')}
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
        ${alert.documents?.length ? `· <i class="ti ti-paperclip" style="font-size:12px"></i> ${alert.documents.length} document(s)` : ''}
      </div>
      ${commentHtml}
      ${photosHtml}
      ${documentsHtml}
    </div>
    <button class="btn btn-secondary btn-sm" onclick="openAlertModal('${alert.id}')" title="Modifier">
      <i class="ti ti-pencil"></i>
    </button>
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
