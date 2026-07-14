// ══════════════════════════════════════════════════════════════
// MAGASINS — Gestion du parc de points de vente
// Dépend de : storage.js (DB, CU), auth.js (hasPerm), ui.js
// ══════════════════════════════════════════════════════════════

// ─────────────────────────────────────────────
// 0. TYPEDEFS JSDoc (pour inférence VSCode / TypeScript)
//    ⚠️ Déduits de l'usage dans ce fichier uniquement.
// ─────────────────────────────────────────────

/**
 * Magasin (point de vente).
 * @typedef {Object} Magasin
 * @property {string} id
 * @property {string} nom
 * @property {string} [enseigne] - Enseigne commerciale, chaîne vide si non renseignée.
 * @property {string} ville
 * @property {string} [adr] - Adresse, chaîne vide si non renseignée.
 * @property {string} statut - Valeur observée : 'actif'. D'autres valeurs probables (ex : 'inactif') non confirmées dans ce fichier.
 * @property {string | null} [did] - Référence vers User.id du directeur assigné (rôle 'directeur'), ou null/absent si non assigné.
 */

/**
 * Utilisateur applicatif. Seules .id, .nom, .role, .statut sont
 * accédées dans ce fichier — structure complète documentée dans
 * users.js / auth.js / config.js.
 * ⚠️ CHANGÉ : n'existe plus dans DB (DB.users a été supprimé avec la
 * sécurisation des mots de passe) — provient désormais directement de
 * la table Supabase `profiles` via sbSelect, voir _magDirectorsCache.
 * @typedef {Object} User
 * @property {string} id
 * @property {string} nom
 * @property {string} role - Valeur testée ici : 'directeur'.
 * @property {string} statut - Valeur testée ici : 'actif'.
 */

/**
 * Cache local des profils utilisateurs (table `profiles`), utilisé
 * uniquement pour retrouver le nom du directeur assigné à un magasin
 * (_buildStoreCard) et peupler le select de sélection du directeur
 * (_populateDirectorSelect). Remplace l'ancien DB.users, supprimé de
 * la structure DB avec la sécurisation des mots de passe (voir
 * storage.js). Rafraîchi à chaque affichage de la page Magasins
 * (renderMag) et défensivement à l'ouverture de la modale magasin
 * (_populateDirectorSelect), au cas où la modale serait ouverte sans
 * que renderMag ait tourné avant.
 * @type {User[]}
 */
let _magDirectorsCache = [];

/**
 * Données de formulaire d'un magasin (sans id), telles que
 * construites par saveMag() avant insertion ou mise à jour.
 * @typedef {Object} StoreFormData
 * @property {string} nom
 * @property {string} ville
 * @property {string} enseigne
 * @property {string} adr
 * @property {string} statut
 * @property {string | null} did
 */

/**
 * Type d'entité supportée par la suppression avec confirmation.
 * @typedef {'mag'|'user'|'alert'|'nc'} DeleteEntityType
 */

/**
 * Alerte terrain. Seule .photos est accédée dans ce fichier ;
 * structure complète documentée dans actions.js.
 * @typedef {Object} Alerte
 * @property {string} id
 * @property {string[]} [photos] - URLs des photos jointes à l'alerte.
 */

// ─────────────────────────────────────────────
// 1. RENDU DE LA PAGE
// ─────────────────────────────────────────────

/**
 * Affiche la grille des magasins visibles pour l'utilisateur connecté.
 * @returns {Promise<void>}
 */
async function renderMag() {
  _magDirectorsCache = await sbSelect('profiles');

  /** @type {string[]} */
  const storeIds  = visibleMids();
  /** @type {Magasin[]} */
  const myStores  = DB.magasins.filter(m => storeIds.includes(m.id));
  // ⚠️ CORRIGÉ : 'mag' était l'ancienne clé de permission (système à 8
  // droits), remplacée par 'store_manage' dans le nouveau système à 42
  // droits granulaires — 'mag' n'existe plus dans aucun profil créé ou
  // modifié depuis la migration, ce contrôle ne servait donc plus à rien.
  /** @type {boolean} */
  const canManage = hasPerm('store_manage');

  el('btn-add-mag').style.display = canManage ? '' : 'none';
  el('mag-cnt').textContent = `${myStores.length} magasin(s)`;

  const grid  = el('mag-grid');
  const empty = el('mag-empty');

  if (!myStores.length) {
    grid.innerHTML = '';
    empty.style.display = '';
    return;
  }

  empty.style.display = 'none';
  grid.innerHTML = myStores.map(store => _buildStoreCard(store, canManage)).join('');
}

// ─────────────────────────────────────────────
// 2. HELPERS DE RENDU
// ─────────────────────────────────────────────

/**
 * Construit la carte HTML d'un magasin (statistiques, directeur,
 * score, actions de gestion).
 * @param {Magasin} store
 * @param {boolean} canManage - Si vrai, affiche les boutons modifier/supprimer.
 * @returns {string} HTML de la carte.
 */
function _buildStoreCard(store, canManage) {
  /** @type {number | null} */
  const score       = magScore(store.id);
  /** @type {number} */
  const auditCount  = DB.audits.filter(a => a.mid === store.id).length;
  /** @type {number} */
  const openNcCount = DB.ncs.filter(n => n.mid === store.id && n.statut === 'Ouverte').length;
  /** @type {User | undefined} */
  const director    = _magDirectorsCache.find(u => u.id === store.did);
  /** @type {number} */
  const rayonCount  = getRayonsForMagasin(store.id).length;

  return `<div class="card">
    <div class="card-hdr">
      <div style="flex:1">
        <div style="font-size:14px;font-weight:600">${store.nom}</div>
        <div class="tsm tm" style="margin-top:2px">${store.enseigne || ''}${store.ville ? ' · ' + store.ville : ''}</div>
      </div>
      <span class="badge ${store.statut === 'actif' ? 'b-done' : 'b-open'}">${store.statut}</span>
    </div>
    <div class="card-body">
      ${store.adr ? `<div class="tsm tm" style="margin-bottom:10px"><i class="ti ti-map-pin"></i> ${store.adr}</div>` : ''}
      <div style="font-size:12px;margin-bottom:12px">
        <i class="ti ti-user" style="color:var(--primary)"></i>
        ${director ? director.nom : '<span class="tm">Non assigné</span>'}
      </div>
      <div style="font-size:12px;margin-bottom:12px${rayonCount === 0 ? ';color:var(--warning-dark)' : ''}">
        <i class="ti ti-category" style="color:${rayonCount === 0 ? 'var(--warning)' : 'var(--primary)'}"></i>
        ${rayonCount === 0 ? 'Aucun rayon assigné — audit impossible' : `${rayonCount} rayon(s) assigné(s)`}
      </div>
      ${_buildStoreStats(score, auditCount, openNcCount)}
      ${score !== null ? pbar(score) : ''}
      ${canManage ? _buildStoreActions(store) : ''}
    </div>
  </div>`;
}

/**
 * Construit le bloc HTML des trois statistiques résumées d'un
 * magasin (score, nombre d'audits, NC ouvertes).
 * @param {number | null} score - Score qualité du magasin (0-100), ou null si aucun audit.
 * @param {number} auditCount
 * @param {number} openNcCount
 * @returns {string}
 */
function _buildStoreStats(score, auditCount, openNcCount) {
  return `<div style="display:flex;justify-content:space-around;margin-bottom:14px">
    <div style="text-align:center">
      <div style="font-size:20px;font-weight:700;color:${score !== null ? sc(score) : 'var(--text3)'}">
        ${score !== null ? score + '%' : '–'}
      </div>
      <div class="tsm tm">Score</div>
    </div>
    <div style="text-align:center">
      <div style="font-size:20px;font-weight:700;color:var(--primary)">${auditCount}</div>
      <div class="tsm tm">Audits</div>
    </div>
    <div style="text-align:center">
      <div style="font-size:20px;font-weight:700;color:${openNcCount > 0 ? 'var(--danger)' : 'var(--success)'}">
        ${openNcCount}
      </div>
      <div class="tsm tm">NC ouvertes</div>
    </div>
  </div>`;
}

/**
 * Construit les boutons d'action (modifier / supprimer) pour un
 * magasin, réservés aux utilisateurs autorisés à gérer les magasins.
 * @param {Magasin} store
 * @returns {string}
 */
function _buildStoreActions(store) {
  /** @type {string} */
  const escapedName = store.nom.replace(/'/g, "\\'");
  return `<div style="display:flex;gap:8px;margin-top:14px">
    <button class="btn btn-secondary btn-sm" style="flex:1" onclick="openMagModal('${store.id}')">
      <i class="ti ti-pencil"></i> Modifier
    </button>
    <button class="btn btn-secondary btn-sm" style="flex:1" onclick="openAssignRayonsModal('${store.id}')">
      <i class="ti ti-category"></i> Rayons
    </button>
    <button class="btn btn-danger btn-sm" onclick="confirmDel('mag','${store.id}','${escapedName}')">
      <i class="ti ti-trash"></i>
    </button>
  </div>`;
}

// ─────────────────────────────────────────────
// 3. MODAL CRÉATION / ÉDITION
// ─────────────────────────────────────────────

/**
 * Ouvre la modale de création ou d'édition d'un magasin. Si
 * `storeId` est fourni, pré-remplit le formulaire avec les données
 * existantes ; sinon, réinitialise le formulaire pour une création.
 * @param {string} [storeId] - Référence vers Magasin.id à éditer ; absent/falsy pour une création.
 * @returns {Promise<void>}
 */
async function openMagModal(storeId) {
  /** @type {boolean} */
  const isEdit = !!storeId;

  el('m-mag-ttl').innerHTML = isEdit
    ? '<i class="ti ti-building-store" style="color:var(--primary)"></i> Modifier le magasin'
    : '<i class="ti ti-building-store" style="color:var(--primary)"></i> Nouveau magasin';

  el('mag-err').classList.remove('show');

  await _populateDirectorSelect(isEdit && storeId);

  if (el('m-enseigne-suggestions')) {
    el('m-enseigne-suggestions').innerHTML = getKnownEnseignes()
      .map(enseigne => `<option value="${enseigne}">`)
      .join('');
  }

  if (isEdit) {
    /** @type {Magasin | undefined} */
    const store = DB.magasins.find(m => m.id === storeId);
    if (!store) return;
    sv('m-id', store.id);
    sv('m-nom', store.nom);
    el('m-enseigne').value = store.enseigne || '';
    sv('m-ville', store.ville || '');
    sv('m-adr', store.adr || '');
    el('m-statut').value = store.statut;
    el('m-dir').value    = store.did || '';
  } else {
    ['m-id', 'm-nom', 'm-ville', 'm-adr'].forEach(id => sv(id, ''));
    el('m-enseigne').value = '';
    el('m-statut').value   = 'actif';
  }

  openModal('m-mag');
}

/**
 * Remplit le select des directeurs assignables (rôle 'directeur',
 * statut 'actif'), et présélectionne le directeur actuel du magasin
 * en édition s'il y en a un.
 * @param {string | false} currentStoreId - Magasin.id en cours d'édition, ou `false` en création.
 * @returns {Promise<void>}
 */
async function _populateDirectorSelect(currentStoreId) {
  if (!_magDirectorsCache.length) _magDirectorsCache = await sbSelect('profiles');

  const select = el('m-dir');
  /** @type {string} */
  const currentStoreDirectorId = currentStoreId
    ? (DB.magasins.find(m => m.id === currentStoreId)?.did || '')
    : '';

  select.innerHTML =
    '<option value="">– Non assigné –</option>' +
    _magDirectorsCache
      .filter(u => u.role === 'directeur' && u.statut === 'actif')
      .map(u => `<option value="${u.id}">${u.nom}</option>`)
      .join('');

  if (currentStoreDirectorId) select.value = currentStoreDirectorId;
}

/**
 * Valide et sauvegarde le formulaire magasin (création ou édition
 * selon la présence de l'id dans le champ caché 'm-id').
 * @returns {void}
 */
function saveMag() {
  /** @type {string} */
  const name = v('m-nom').trim();
  /** @type {string} */
  const city = v('m-ville').trim();
  const errorEl = el('mag-err');

  if (!name || !city) {
    errorEl.textContent = 'Nom et ville sont requis.';
    errorEl.classList.add('show');
    return;
  }

  /** @type {string} */
  const storeId = v('m-id');
  /** @type {string} */
  const enseigne = v('m-enseigne').trim();
  if (enseigne) createEnseigne(enseigne); // sans effet si déjà connue (voir createEnseigne)

  /** @type {StoreFormData} */
  const storeData = {
    nom:     name,
    ville:   city,
    enseigne,
    adr:     v('m-adr').trim(),
    statut:  el('m-statut').value,
    did:     el('m-dir').value || null,
  };

  if (storeId) {
    Object.assign(DB.magasins.find(m => m.id === storeId), storeData);
  } else {
    DB.magasins.push({ id: uid(), ...storeData });
  }

  save();
  closeModal('m-mag');
  renderMag();
}

// ─────────────────────────────────────────────
// 4. SUPPRESSION AVEC CONFIRMATION
// ─────────────────────────────────────────────

/**
 * Affiche une modale de confirmation de suppression.
 * Chaque type délègue sa suppression à un handler dédié.
 *
 * @param {DeleteEntityType} type - Type d'entité à supprimer
 * @param {string} entityId
 * @param {string} displayName - Nom affiché dans le message de confirmation
 * @returns {void}
 */
function confirmDel(type, entityId, displayName) {
  el('conf-msg').textContent    = `Supprimer "${displayName}" ?`;
  el('conf-detail').textContent = '';

  el('conf-ok').onclick = () => {
    closeModal('m-confirm');
    _deleteHandlers[type]?.(entityId);
  };

  openModal('m-confirm');
}

/**
 * Handlers de suppression par type d'entité. Chaque handler retire
 * l'entité de DB, persiste localement + pousse la suppression vers
 * Supabase, puis rafraîchit la page concernée.
 * @type {Record<DeleteEntityType, (id: string) => void>}
 */
const _deleteHandlers = {
  mag: (id) => {
    DB.magasins = DB.magasins.filter(m => m.id !== id);
    save(['magasins']);
    sbDeleteWhere('magasins', 'id', id);
    renderMag();
  },

  user: (id) => {
    sbDeleteWhere('profiles', 'id', id);
    renderUsers();
  },

  alert: (id) => {
    _deleteAlertPhotos(id);
    _deleteAlertDocuments(id);
    DB.alertes = DB.alertes.filter(a => a.id !== id);
    save(['alertes']);
    sbDeleteWhere('alertes', 'id', id);
    renderDash();
  },

  nc: (id) => {
    DB.actions = DB.actions.filter(a => a.ncId !== id);
    DB.ncs     = DB.ncs.filter(n => n.id !== id);
    save(['ncs', 'actions']);
    sbDeleteWhere('ncs', 'id', id);
    sbDeleteWhere('actions', 'ncId', id);
    renderNC();
  },
};

/**
 * Supprime les photos associées à une alerte depuis Supabase Storage
 * (seules les URLs hébergées dans le bucket 'photos' sont traitées).
 * @param {string} alertId - Référence vers Alerte.id.
 * @returns {void}
 */
function _deleteAlertPhotos(alertId) {
  /** @type {Alerte | undefined} */
  const alert = DB.alertes.find(a => a.id === alertId);
  if (!alert?.photos) return;

  alert.photos.forEach(url => {
    if (!url.includes('/storage/v1/object/public/photos/')) return;
    /** @type {string} */
    const storagePath = url.split('/storage/v1/object/public/photos/')[1];
    sbDeletePhoto(storagePath);
  });
}

/**
 * Supprime les documents (AlertDocument, voir alertes.js) associés à
 * une alerte depuis Supabase Storage — même principe que
 * _deleteAlertPhotos, sur le même bucket 'photos' (voir
 * handleAlertDocuments, alertes.js pour le choix de réutiliser ce bucket).
 * @param {string} alertId - Référence vers Alerte.id.
 * @returns {void}
 */
function _deleteAlertDocuments(alertId) {
  /** @type {Alerte | undefined} */
  const alert = DB.alertes.find(a => a.id === alertId);
  if (!alert?.documents) return;

  alert.documents.forEach(doc => {
    if (!doc.url.includes('/storage/v1/object/public/photos/')) return;
    /** @type {string} */
    const storagePath = doc.url.split('/storage/v1/object/public/photos/')[1];
    // ⚠️ CORRIGÉ : ne supprime que les fichiers APPARTENANT à l'alerte
    // (préfixe 'alertes-documents/', voir handleAlertDocuments,
    // alertes.js). Les alertes automatiques — rappels métrologie, voir
    // checkMetrologieEcheances (metrologie.js) — RÉFÉRENCENT des
    // documents d'autres modules (préfixe 'metrologie/') sans en être
    // propriétaires : supprimer l'alerte ne doit jamais détruire ces
    // fichiers d'origine.
    if (!storagePath.startsWith('alertes-documents/')) return;
    sbDeletePhoto(storagePath);
  });
}

// ─────────────────────────────────────────────
// ENSEIGNES (regroupement de magasins, racine de l'arborescence
// Enseigne → Magasin → Rayon → Points)
// ─────────────────────────────────────────────
// Magasin.enseigne reste une simple chaîne de nom (compatible avec
// les données existantes) — DB.enseignes est juste la liste des noms
// d'enseigne connus, gérée en CRUD, sur le même principe que
// getKnownRayons() (rayons.js) : pas d'id distinct du nom, un
// renommage migre directement la chaîne sur tous les magasins
// concernés.

/**
 * Calcule la liste de toutes les enseignes actuellement connues, en
 * fusionnant DB.enseignes (créées explicitement, potentiellement
 * sans aucun magasin encore assigné) et les valeurs Magasin.enseigne
 * réellement utilisées (un magasin peut avoir une enseigne qui
 * n'a jamais été créée explicitement — données antérieures à ce
 * chantier, ou import direct).
 * @returns {string[]} Triées alphabétiquement.
 */
function getKnownEnseignes() {
  /** @type {Set<string>} */
  const known = new Set(DB.enseignes || []);
  DB.magasins.forEach(m => { if (m.enseigne) known.add(m.enseigne); });
  return [...known].sort((a, b) => a.localeCompare(b, 'fr'));
}

/**
 * Crée une enseigne vide (sans magasin assigné) afin qu'elle
 * apparaisse immédiatement dans getKnownEnseignes() — utile pour la
 * préparer avant d'y assigner des magasins. Sans effet si elle
 * existe déjà (correspondance insensible à la casse) ou si le nom
 * est vide.
 * @param {string} nom
 * @returns {boolean} true si créée, false si déjà existante ou nom vide.
 */
function createEnseigne(nom) {
  /** @type {string} */
  const trimmed = (nom || '').trim();
  if (!trimmed) return false;
  if (getKnownEnseignes().some(e => e.toLowerCase() === trimmed.toLowerCase())) return false;

  if (!DB.enseignes) DB.enseignes = [];
  DB.enseignes.push(trimmed);
  return true;
}

/**
 * Renomme une enseigne PARTOUT où son nom apparaît : DB.enseignes et
 * Magasin.enseigne pour chaque magasin concerné.
 * @param {string} oldName
 * @param {string} newName
 * @returns {{ok: boolean, error?: string}}
 */
function renameEnseigne(oldName, newName) {
  /** @type {string} */
  const trimmed = (newName || '').trim();
  if (!trimmed) return { ok: false, error: 'Le nouveau nom ne peut pas être vide.' };
  if (trimmed === oldName) return { ok: false, error: 'Le nouveau nom est identique à l\'actuel.' };
  if (getKnownEnseignes().some(e => e.toLowerCase() === trimmed.toLowerCase() && e !== oldName)) {
    return { ok: false, error: `L'enseigne « ${trimmed} » existe déjà.` };
  }

  if (DB.enseignes) DB.enseignes = DB.enseignes.map(e => e === oldName ? trimmed : e);
  DB.magasins.forEach(m => { if (m.enseigne === oldName) m.enseigne = trimmed; });

  return { ok: true };
}

/**
 * Supprime une enseigne PARTOUT où elle est référencée : retire son
 * nom de DB.enseignes, réaffecte tous les magasins qui la
 * référençaient à "Sans enseigne" (Magasin.enseigne devient ''), et
 * supprime sa grille commune (DB.grilleCustom[nom], locale ET
 * Supabase).
 *
 * ⚠️ CORRIGÉ : l'ancienne version ne retirait le nom QUE de
 * DB.enseignes — si au moins un magasin référençait encore cette
 * enseigne, getKnownEnseignes() (qui inclut aussi les valeurs
 * Magasin.enseigne réellement utilisées) la réinjectait
 * systématiquement, donnant l'impression que la suppression "ne
 * marchait pas". Action destructive et irréversible pour la grille
 * commune de cette enseigne — l'appelant DOIT obtenir une
 * confirmation explicite avant d'appeler cette fonction (voir
 * confirmDeleteEnseigne).
 * @param {string} nom
 * @returns {void}
 */
function deleteEnseigne(nom) {
  if (DB.enseignes) DB.enseignes = DB.enseignes.filter(e => e !== nom);
  DB.magasins.forEach(m => { if (m.enseigne === nom) m.enseigne = ''; });

  if (DB.grilleCustom && Object.prototype.hasOwnProperty.call(DB.grilleCustom, nom)) {
    /** @type {string[]} */
    const rayons = Object.keys(DB.grilleCustom[nom]);
    delete DB.grilleCustom[nom];
    rayons.forEach(rayon => {
      sbDeleteWhere('grille_custom', 'rayon', `__common__${nom}__${rayon}`).catch(() => {});
    });
  }
}

/**
 * Affiche la liste des enseignes connues (getKnownEnseignes), avec
 * pour chacune le nombre de magasins qui la référencent et les
 * actions disponibles (renommer, supprimer).
 * @returns {void}
 */
function renderEnseignes() {
  /** @type {string[]} */
  const enseignes = getKnownEnseignes();
  // ⚠️ CORRIGÉ : 'mag' (ancienne clé, système à 8 droits) -> 'brand_manage'
  // (nouveau système à 42 droits granulaires, groupe "Magasins & enseignes").
  /** @type {boolean} */
  const canManage = hasPerm('brand_manage');

  el('ens-cnt').textContent = `${enseignes.length} enseigne(s)`;

  el('ens-tb').innerHTML = enseignes.map(enseigne => {
    /** @type {Magasin[]} */
    const stores = DB.magasins.filter(m => m.enseigne === enseigne);
    return `<tr>
      <td style="font-weight:500">${enseigne}</td>
      <td>
        <span class="tsm tm">${stores.length} magasin(s)</span>
        ${stores.length ? `<div class="tsm tm" style="margin-top:2px">${stores.map(s => s.nom).join(', ')}</div>` : ''}
      </td>
      <td>
        ${canManage ? `
          <button class="btn btn-secondary btn-sm" onclick="openRenameEnseignePrompt('${enseigne}')" aria-label="Renommer"><i class="ti ti-pencil"></i></button>
          <button class="btn btn-danger btn-sm" onclick="confirmDeleteEnseigne('${enseigne}', ${stores.length})" aria-label="Supprimer"><i class="ti ti-trash"></i></button>
        ` : ''}
      </td>
    </tr>`;
  }).join('') || `<tr><td colspan="3" class="tsm tm" style="text-align:center;padding:24px">Aucune enseigne pour l'instant.</td></tr>`;
}

/**
 * Ouvre une invite de saisie pour créer une nouvelle enseigne (vide,
 * sans magasin assigné — voir createEnseigne).
 * @returns {void}
 */
function openCreateEnseignePrompt() {
  /** @type {string | null} */
  const nom = prompt('Nom de la nouvelle enseigne :');
  if (nom === null) return;

  /** @type {boolean} */
  const created = createEnseigne(nom);
  if (!created) {
    alert(nom.trim() ? `L'enseigne « ${nom.trim()} » existe déjà.` : 'Le nom ne peut pas être vide.');
    return;
  }

  save(['enseignes']);
  renderEnseignes();
}

/**
 * Ouvre une invite de saisie pour renommer une enseigne (voir
 * renameEnseigne — migre tous les magasins concernés).
 * @param {string} currentName
 * @returns {void}
 */
function openRenameEnseignePrompt(currentName) {
  /** @type {string | null} */
  const newName = prompt('Nouveau nom de l\'enseigne :', currentName);
  if (newName === null) return;

  /** @type {{ok: boolean, error?: string}} */
  const result = renameEnseigne(currentName, newName);
  if (!result.ok) {
    if (result.error) alert(result.error);
    return;
  }

  save(['enseignes', 'magasins']);
  renderEnseignes();
}

/**
 * Supprime une enseigne après confirmation : les magasins qui la
 * référençaient repassent à "Sans enseigne" et sa grille commune est
 * supprimée (voir deleteEnseigne) — le message de confirmation le
 * précise si au moins un magasin est concerné, pour éviter toute
 * surprise.
 * @param {string} nom
 * @param {number} storeCount - Nombre de magasins référençant actuellement cette enseigne (déjà calculé par renderEnseignes, évite un recalcul).
 * @returns {void}
 */
function confirmDeleteEnseigne(nom, storeCount) {
  /** @type {string} */
  const warning = storeCount
    ? `Supprimer l'enseigne « ${nom} » ? ${storeCount} magasin(s) la référencent encore et repasseront à « Sans enseigne ». Sa grille commune sera définitivement supprimée. Cette action est irréversible.`
    : `Supprimer l'enseigne « ${nom} » et sa grille commune ? Cette action est irréversible.`;
  if (!confirm(warning)) return;

  deleteEnseigne(nom);
  save(['enseignes', 'magasins', 'grilleCustom']);
  renderEnseignes();
}

// ─────────────────────────────────────────────
// ASSIGNATION RAYONS ↔ MAGASIN
// ─────────────────────────────────────────────
// Un magasin ne peut auditer que les rayons qui lui ont été
// explicitement assignés (DB.magasinRayons, voir getRayonsForMagasin/
// setMagasinRayons/toggleMagasinRayon, rayons.js) — comportement
// strict, aucun fallback "tous les rayons" pour un magasin sans
// assignation.

/**
 * Ouvre la modale d'assignation de rayons pour un magasin, avec une
 * case à cocher par rayon connu (getKnownRayons, rayons.js),
 * pré-cochées selon l'assignation actuelle (getRayonsForMagasin).
 * @param {string} storeId
 * @returns {void}
 */
function openAssignRayonsModal(storeId) {
  /** @type {Magasin | undefined} */
  const store = DB.magasins.find(m => m.id === storeId);
  if (!store) return;

  sv('ar-store-id', storeId);
  el('m-assign-rayons-ttl').innerHTML = `<i class="ti ti-category" style="color:var(--primary)"></i> Rayons assignés — ${store.nom}`;

  /** @type {string[]} */
  const assigned = getRayonsForMagasin(storeId);
  el('ar-rayon-cbs').innerHTML = getKnownRayons().map(rayon => `
    <label class="cb-item">
      <input type="checkbox" class="ar-rayon-cb" value="${_escapeHtmlAttr(rayon)}" ${assigned.includes(rayon) ? 'checked' : ''}>
      ${rayon}
    </label>`).join('') || `<div class="tsm tm" style="padding:12px;text-align:center">Aucun rayon n'existe encore — créez-en depuis la page Grilles.</div>`;

  openModal('m-assign-rayons');
}

/**
 * Coche toutes les cases de rayon dans la modale d'assignation
 * ouverte (voir openAssignRayonsModal) — n'enregistre rien tant que
 * "Enregistrer" n'est pas cliqué (voir saveAssignRayons), pour
 * rester annulable.
 * @returns {void}
 */
function assignAllRayonsToStore() {
  document.querySelectorAll('.ar-rayon-cb').forEach(cb => { cb.checked = true; });
}

/**
 * Enregistre l'assignation de rayons telle que cochée dans la
 * modale (remplace intégralement DB.magasinRayons[storeId] — voir
 * setMagasinRayons, rayons.js).
 * @returns {void}
 */
function saveAssignRayons() {
  /** @type {string} */
  const storeId = v('ar-store-id');
  if (!storeId) return;

  /** @type {string[]} */
  const checkedRayons = [...document.querySelectorAll('.ar-rayon-cb:checked')].map(cb => cb.value);
  setMagasinRayons(storeId, checkedRayons);

  save();
  closeModal('m-assign-rayons');
  renderMag();
}
