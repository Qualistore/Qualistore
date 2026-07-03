// ══════════════════════════════════════════════════════════════
// USERS — Gestion des utilisateurs
// Dépend de : storage.js (DB, CU), auth.js (hasPerm), ui.js, config.js (PIDS, DPERMS)
// ══════════════════════════════════════════════════════════════

// ─────────────────────────────────────────────
// 0. TYPEDEFS JSDoc (pour inférence VSCode / TypeScript)
//    ⚠️ Déduits de l'usage dans ce fichier.
//
//    ⚠️ PRÉCISION À REPORTER dans storage.js/auth.js : ce fichier
//    confirme que User.magasins est un tableau d'IDENTIFIANTS de
//    magasins (string[]), PAS un tableau d'objets Magasin — alors
//    que storage.js/auth.js le typaient en unknown[] faute
//    d'information à l'époque. Non modifié ici sans accord.
// ─────────────────────────────────────────────

/**
 * Rôle applicatif d'un utilisateur. Union fermée à 5 valeurs,
 * cohérente avec les clés de DEFAULT_PERMISSIONS dans config.js.
 * @typedef {'admin'|'fsqs'|'directeur'|'direction'|'collaborateur'} UserRole
 */

/**
 * Identifiant de permission applicative (voir config.js pour la
 * définition canonique).
 * @typedef {'aud-r'|'aud-w'|'nc'|'ac'|'mag'|'rap'|'grille'|'usr'} PermissionId
 */

/**
 * Droits d'accès d'un utilisateur, une entrée par PermissionId.
 * @typedef {Record<PermissionId, 0|1>} UserPerms
 */

/**
 * Utilisateur applicatif (compte admin ou collaborateur).
 * @typedef {Object} User
 * @property {string} id
 * @property {string} nom
 * @property {string} login
 * @property {string} pwd - Mot de passe encodé en base64 (btoa).
 * @property {UserRole} role
 * @property {'actif'|string} statut
 * @property {string[]} magasins - Tableau d'IDs de magasins assignés (Magasin.id) ; toujours vide pour le rôle 'admin'.
 * @property {UserPerms} perms
 */

/**
 * Magasin. Seules .id et .nom sont accédées dans ce fichier ;
 * structure complète dans magasins.js.
 * @typedef {Object} Magasin
 * @property {string} id
 * @property {string} nom
 */

// ─────────────────────────────────────────────
// 1. CONSTANTES
// ─────────────────────────────────────────────

/**
 * Libellés des rôles pour l'affichage dans le tableau.
 * @type {Record<UserRole, string>}
 */
const USER_ROLE_LABELS = {
  admin:         'Administrateur',
  fsqs:          'Auditeur FSQS',
  directeur:     'Directeur',
  direction:     'Associé',
  collaborateur: 'Collaborateur magasin',
};

/**
 * Classes CSS de badge par rôle.
 * @type {Record<UserRole, string>}
 */
const USER_ROLE_BADGE_CLASSES = {
  admin:         'b-admin',
  fsqs:          'b-fsqs',
  directeur:     'b-dir',
  direction:     'b-direction',
  collaborateur: 'b-prog',
};

// ─────────────────────────────────────────────
// 2. HELPERS DE RENDU
// ─────────────────────────────────────────────

/**
 * Construit le badge HTML d'affichage d'un rôle.
 * @param {UserRole | string} role
 * @returns {string}
 */
function roleBdg(role) {
  return `<span class="badge ${USER_ROLE_BADGE_CLASSES[role] || ''}">${USER_ROLE_LABELS[role] || role}</span>`;
}

/**
 * Construit les initiales d'un nom (jusqu'à 2 lettres), pour
 * l'avatar utilisateur.
 * @param {string} name
 * @returns {string}
 */
function _buildUserInitials(name) {
  return name.split(' ').map(part => part[0]).join('').slice(0, 2).toUpperCase();
}

/**
 * Construit la liste HTML des magasins assignés à un utilisateur
 * ('Tous' pour un admin, 'Aucun' si vide, sinon un tag par magasin).
 * @param {User} user
 * @returns {string}
 */
function _buildUserStoresList(user) {
  if (user.role === 'admin') return '<span class="tm tsm">Tous</span>';
  if (!user.magasins?.length) return '<span class="badge b-prog">Aucun</span>';
  return user.magasins
    .map(storeId => DB.magasins.find(m => m.id === storeId)?.nom || storeId)
    .map(name => `<span class="tag">${name}</span>`)
    .join('');
}

// ─────────────────────────────────────────────
// 3. RENDU DE LA PAGE
// ─────────────────────────────────────────────

/**
 * Affiche le tableau des utilisateurs. Empêche la suppression du
 * dernier administrateur actif (bouton supprimer masqué pour lui).
 * @returns {void}
 */
function renderUsers() {
  /** @type {boolean|0|undefined} */
  const canManage    = hasPerm('usr');
  /** @type {boolean} */
  const onlyOneAdmin = DB.users.filter(u => u.role === 'admin' && u.statut === 'actif').length <= 1;

  el('usr-cnt').textContent        = `${DB.users.length} utilisateur(s)`;
  el('btn-add-usr').style.display  = canManage ? '' : 'none';

  el('usr-tb').innerHTML = DB.users.map(user => {
    /** @type {string} */
    const initials  = _buildUserInitials(user.nom);
    /** @type {string} */
    const storeList = _buildUserStoresList(user);
    /** @type {boolean} */
    const isLastAdmin = user.role === 'admin' && onlyOneAdmin;

    return `<tr>
      <td>
        <div style="display:flex;align-items:center;gap:8px">
          <div class="avatar" style="background:var(--primary-light);color:var(--primary)">${initials}</div>
          <div>
            <div style="font-weight:500">${user.nom}</div>
            <div class="tsm tm">${user.login}</div>
          </div>
        </div>
      </td>
      <td class="tsm tm">${user.login}</td>
      <td>${roleBdg(user.role)}</td>
      <td style="max-width:200px">${storeList}</td>
      <td><span class="badge ${user.statut === 'actif' ? 'b-done' : 'b-open'}">${user.statut}</span></td>
      <td>
        <div class="act-btns">
          ${canManage ? `
            <button class="btn btn-secondary btn-sm" onclick="openUserModal('${user.id}')">
              <i class="ti ti-pencil"></i>
            </button>
            ${!isLastAdmin ? `
              <button class="btn btn-danger btn-sm" onclick="confirmDel('user','${user.id}','${user.nom.replace(/'/g, "\\'")}')">
                <i class="ti ti-trash"></i>
              </button>` : ''}
          ` : ''}
        </div>
      </td>
    </tr>`;
  }).join('');
}

// ─────────────────────────────────────────────
// 4. MODAL CRÉATION / ÉDITION
// ─────────────────────────────────────────────

/**
 * Ouvre la modale de création/édition d'un utilisateur.
 * @param {string} [userId] - Référence vers User.id à éditer ; absent/falsy pour une création.
 * @returns {void}
 */
function openUserModal(userId) {
  /** @type {boolean} */
  const isEdit = !!userId;

  el('m-user-ttl').innerHTML = isEdit
    ? '<i class="ti ti-user-edit" style="color:var(--primary)"></i> Modifier l\'utilisateur'
    : '<i class="ti ti-user-plus" style="color:var(--primary)"></i> Nouvel utilisateur';

  el('u-err').classList.remove('show');
  el('u-mdp-hint').style.display = isEdit ? '' : 'none';

  _buildStoreCheckboxes();

  if (isEdit) {
    _populateUserForm(userId);
  } else {
    _resetUserForm();
  }

  openModal('m-user');
}

/**
 * Construit les cases à cocher de sélection de magasins assignables.
 * @returns {void}
 */
function _buildStoreCheckboxes() {
  const container = el('u-mag-cbs');
  container.innerHTML = DB.magasins.length
    ? DB.magasins.map(m => `
        <label class="cb-item">
          <input type="checkbox" value="${m.id}" class="mcb"> ${m.nom}
        </label>`).join('')
    : '<span class="tm tsm">Aucun magasin créé</span>';
}

/**
 * Pré-remplit le formulaire avec les données d'un utilisateur
 * existant (sauf mot de passe, jamais pré-rempli).
 * @param {string} userId - Référence vers User.id.
 * @returns {void}
 */
function _populateUserForm(userId) {
  /** @type {User | undefined} */
  const user = DB.users.find(u => u.id === userId);
  if (!user) return;

  sv('u-id', user.id);
  sv('u-nom', user.nom);
  sv('u-login', user.login);
  sv('u-mdp', '');
  el('u-statut').value = user.statut;
  el('u-role').value   = user.role;

  document.querySelectorAll('.mcb').forEach(cb => {
    cb.checked = (user.magasins || []).includes(cb.value);
  });

  PIDS.forEach(permId => {
    const checkbox = el('p-' + permId);
    if (checkbox) checkbox.checked = !!(user.perms || {})[permId];
  });

  onRoleChange(false);
}

/**
 * Réinitialise le formulaire utilisateur pour une création.
 * @returns {void}
 */
function _resetUserForm() {
  sv('u-id', '');
  ['u-nom', 'u-login', 'u-mdp'].forEach(id => sv(id, ''));
  el('u-statut').value = 'actif';
  el('u-role').value   = '';
  PIDS.forEach(permId => {
    const checkbox = el('p-' + permId);
    if (checkbox) checkbox.checked = false;
  });
  el('u-mag-grp').style.display = 'none';
}

/**
 * Met à jour l'affichage du groupe magasins et les permissions par défaut
 * quand le rôle change dans le formulaire.
 *
 * @param {boolean} applyDefaults - Si true, applique les permissions par défaut du rôle
 * @returns {void}
 */
function onRoleChange(applyDefaults = true) {
  /** @type {UserRole | string} */
  const role = el('u-role').value;

  el('u-mag-grp').style.display = (role && role !== 'admin') ? '' : 'none';

  if (!applyDefaults) return;

  // Sélectionner tous les magasins pour le rôle "direction"
  if (role === 'direction') {
    document.querySelectorAll('.mcb').forEach(cb => { cb.checked = true; });
  }

  // Appliquer les permissions par défaut du rôle
  if (DPERMS[role]) {
    PIDS.forEach(permId => {
      const checkbox = el('p-' + permId);
      if (checkbox) checkbox.checked = !!DPERMS[role][permId];
    });
  }
}

/**
 * Coche ou décoche toutes les cases de sélection de magasins.
 * @param {boolean} selectAll
 * @returns {void}
 */
function toggleAllMags(selectAll) {
  document.querySelectorAll('.mcb').forEach(cb => { cb.checked = selectAll; });
}

// ─────────────────────────────────────────────
// 5. SAUVEGARDE
// ─────────────────────────────────────────────

/**
 * Valide et sauvegarde le formulaire utilisateur (création ou
 * édition selon la présence de l'id dans le champ caché 'u-id').
 * Refuse les identifiants de connexion dupliqués. Rafraîchit la
 * session courante (CU) si l'utilisateur modifie son propre profil.
 * @returns {void}
 */
function saveUser() {
  /** @type {string} */
  const userId   = v('u-id');
  /** @type {string} */
  const name     = v('u-nom').trim();
  /** @type {string} */
  const login    = v('u-login').trim();
  /** @type {string} */
  const password = v('u-mdp');
  /** @type {UserRole} */
  const role     = el('u-role').value;
  /** @type {string} */
  const status   = el('u-statut').value;
  const errorEl  = el('u-err');

  if (!name || !login || !role) {
    errorEl.textContent = 'Nom, identifiant et rôle sont requis.';
    errorEl.classList.add('show');
    return;
  }
  if (!userId && !password) {
    errorEl.textContent = 'Un mot de passe est requis pour un nouvel utilisateur.';
    errorEl.classList.add('show');
    return;
  }
  if (DB.users.find(u => u.login === login && u.id !== userId)) {
    errorEl.textContent = 'Cet identifiant est déjà utilisé.';
    errorEl.classList.add('show');
    return;
  }

  /** @type {string[]} */
  const assignedStores = role === 'admin'
    ? []
    : [...document.querySelectorAll('.mcb:checked')].map(cb => cb.value);

  /** @type {UserPerms} */
  const permissions = {};
  PIDS.forEach(permId => {
    const checkbox = el('p-' + permId);
    if (checkbox) permissions[permId] = checkbox.checked ? 1 : 0;
  });

  if (userId) {
    /** @type {User | undefined} */
    const user = DB.users.find(u => u.id === userId);
    if (!user) return;
    user.nom      = name;
    user.login    = login;
    user.role     = role;
    user.statut   = status;
    user.magasins = assignedStores;
    user.perms    = permissions;
    if (password) user.pwd = btoa(password);

    // Rafraîchir la session si l'utilisateur modifie son propre profil
    if (CU && CU.id === userId) {
      CU = user;
      updateSBUser();
      buildSidebar();
    }
  } else {
    /** @type {User} */
    DB.users.push({ id: uid(), nom: name, login, pwd: btoa(password), role, statut: status, magasins: assignedStores, perms: permissions });
  }

  save();
  closeModal('m-user');
  renderUsers();
}
