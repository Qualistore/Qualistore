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
 * storage.js / auth.js / config.js.
 * @typedef {Object} User
 * @property {string} id
 * @property {string} nom
 * @property {string} role - Valeur testée ici : 'directeur'.
 * @property {string} statut - Valeur testée ici : 'actif'.
 */

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
 * @returns {void}
 */
function renderMag() {
  /** @type {string[]} */
  const storeIds  = visibleMids();
  /** @type {Magasin[]} */
  const myStores  = DB.magasins.filter(m => storeIds.includes(m.id));
  /** @type {boolean} */
  const canManage = hasPerm('mag');

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
  const director    = DB.users.find(u => u.id === store.did);

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
 * @returns {void}
 */
function openMagModal(storeId) {
  /** @type {boolean} */
  const isEdit = !!storeId;

  el('m-mag-ttl').innerHTML = isEdit
    ? '<i class="ti ti-building-store" style="color:var(--primary)"></i> Modifier le magasin'
    : '<i class="ti ti-building-store" style="color:var(--primary)"></i> Nouveau magasin';

  el('mag-err').classList.remove('show');

  _populateDirectorSelect(isEdit && storeId);

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
 * @returns {void}
 */
function _populateDirectorSelect(currentStoreId) {
  const select = el('m-dir');
  /** @type {string} */
  const currentStoreDirectorId = currentStoreId
    ? (DB.magasins.find(m => m.id === currentStoreId)?.did || '')
    : '';

  select.innerHTML =
    '<option value="">– Non assigné –</option>' +
    DB.users
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
  /** @type {StoreFormData} */
  const storeData = {
    nom:     name,
    ville:   city,
    enseigne: v('m-enseigne'),
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
    DB.users = DB.users.filter(u => u.id !== id);
    save(['users']);
    sbDeleteWhere('users', 'id', id);
    renderUsers();
  },

  alert: (id) => {
    _deleteAlertPhotos(id);
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
