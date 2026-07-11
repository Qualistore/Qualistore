// ══════════════════════════════════════════════════════════════
// USERS — Gestion des utilisateurs
// Dépend de : storage.js (CU), supabase.js (_sb, sbDeleteWhere),
//   auth.js (hasPerm), ui.js, config.js (PIDS, DPERMS)
//
// ⚠️ CHANGÉ (v2 — comptes sans email) : le nom est désormais
// toujours saisi par l'admin à la création (email fourni ou non).
// Si l'email est vide, un compte "sans email" est créé (identifiant
// interne + mot de passe temporaire généré, voir la Edge Function
// invite-user) — les identifiants générés sont affichés une seule
// fois à l'admin dans une modale dédiée (m-new-credentials) pour
// qu'il les communique lui-même à la personne concernée.
// ══════════════════════════════════════════════════════════════

// ─────────────────────────────────────────────
// 0. TYPEDEFS JSDoc (pour inférence VSCode / TypeScript)
// ─────────────────────────────────────────────

/**
 * Rôle applicatif d'un utilisateur.
 * @typedef {'admin'|'fsqs'|'directeur'|'direction'|'collaborateur'} UserRole
 */

/**
 * Identifiant de permission applicative (voir config.js).
 * @typedef {'aud-r'|'aud-w'|'nc'|'ac'|'mag'|'rap'|'grille'|'usr'} PermissionId
 */

/**
 * Droits d'accès d'un utilisateur, une entrée par PermissionId.
 * @typedef {Record<PermissionId, 0|1>} UserPerms
 */

/**
 * Profil applicatif (ligne de la table `profiles`).
 * @typedef {Object} User
 * @property {string} id
 * @property {string} nom
 * @property {string} login - Email réel, ou adresse technique interne (@qualistore.local) pour les comptes sans email.
 * @property {UserRole} role
 * @property {'actif'|'inactif'|'invitation'|string} statut
 * @property {string[]} magasins
 * @property {UserPerms} perms
 * @property {boolean} [must_change_password]
 */

/**
 * Magasin. Seules .id et .nom sont accédées dans ce fichier.
 * @typedef {Object} Magasin
 * @property {string} id
 * @property {string} nom
 */

// ─────────────────────────────────────────────
// 1. CONSTANTES
// ─────────────────────────────────────────────

/** @type {Record<UserRole, string>} */
const USER_ROLE_LABELS = {
  admin:         'Administrateur',
  fsqs:          'Auditeur FSQS',
  directeur:     'Directeur',
  direction:     'Associé',
  collaborateur: 'Collaborateur magasin',
};

/** @type {Record<UserRole, string>} */
const USER_ROLE_BADGE_CLASSES = {
  admin:         'b-admin',
  fsqs:          'b-fsqs',
  directeur:     'b-dir',
  direction:     'b-direction',
  collaborateur: 'b-prog',
};

/** @type {Record<string, string>} */
const USER_STATUT_LABELS = {
  actif:      'actif',
  inactif:    'inactif',
  invitation: 'invitation envoyée',
};

/**
 * Cache local du dernier chargement de `profiles`.
 * @type {User[]}
 */
let _cachedProfiles = [];

// ─────────────────────────────────────────────
// 2. HELPERS DE RENDU
// ─────────────────────────────────────────────

/**
 * @param {UserRole | string} role
 * @returns {string}
 */
function roleBdg(role) {
  return `<span class="badge ${USER_ROLE_BADGE_CLASSES[role] || ''}">${USER_ROLE_LABELS[role] || role}</span>`;
}

/**
 * @param {string} name
 * @returns {string}
 */
function _buildUserInitials(name) {
  if (!name) return '?';
  return name.split(' ').map(part => part[0]).join('').slice(0, 2).toUpperCase();
}

/**
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

/**
 * Indique si un login est une adresse technique interne (compte
 * sans email réel) plutôt qu'un email réel.
 * @param {string} login
 * @returns {boolean}
 */
function _isInternalLogin(login) {
  return (login || '').endsWith('@qualistore.local');
}

// ─────────────────────────────────────────────
// 3. RENDU DE LA PAGE
// ─────────────────────────────────────────────

/**
 * Charge les profils depuis Supabase et affiche le tableau des
 * utilisateurs.
 * @returns {Promise<void>}
 */
async function renderUsers() {
  _cachedProfiles = await sbSelect('profiles');

  /** @type {boolean|0|undefined} */
  const canManage    = hasPerm('usr');
  /** @type {boolean} */
  const onlyOneAdmin = _cachedProfiles.filter(u => u.role === 'admin' && u.statut === 'actif').length <= 1;

  el('usr-cnt').textContent       = `${_cachedProfiles.length} utilisateur(s)`;
  el('btn-add-usr').style.display = canManage ? '' : 'none';

  el('usr-tb').innerHTML = _cachedProfiles.map(user => {
    /** @type {string} */
    const initials  = _buildUserInitials(user.nom);
    /** @type {string} */
    const storeList = _buildUserStoresList(user);
    /** @type {boolean} */
    const isLastAdmin = user.role === 'admin' && onlyOneAdmin;
    /** @type {string} */
    const loginDisplay = _isInternalLogin(user.login)
      ? `<span title="Compte sans email — identifiant interne">${user.login.replace('@qualistore.local', '')} <i class="ti ti-lock" style="font-size:11px;opacity:.6"></i></span>`
      : user.login;

    return `<tr>
      <td>
        <div style="display:flex;align-items:center;gap:8px">
          <div class="avatar" style="background:var(--primary-light);color:var(--primary)">${initials}</div>
          <div>
            <div style="font-weight:500">${user.nom}</div>
            <div class="tsm tm">${loginDisplay}</div>
          </div>
        </div>
      </td>
      <td class="tsm tm">${loginDisplay}</td>
      <td>${roleBdg(user.role)}</td>
      <td style="max-width:200px">${storeList}</td>
      <td><span class="badge ${user.statut === 'actif' ? 'b-done' : 'b-open'}">${USER_STATUT_LABELS[user.statut] || user.statut}</span></td>
      <td>
        <div class="act-btns">
          ${canManage ? `
            <button class="btn btn-secondary btn-sm" onclick="openUserModal('${user.id}')">
              <i class="ti ti-pencil"></i>
            </button>
            ${!isLastAdmin ? `
              <button class="btn btn-danger btn-sm" onclick="confirmDel('user','${user.id}','${(user.nom || user.login).replace(/'/g, "\\'")}')">
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
 * Ouvre la modale de création ou d'édition d'un utilisateur.
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

  el('u-statut-grp').style.display  = isEdit ? '' : 'none';
  el('u-invite-hint').style.display = isEdit ? 'none' : '';
  el('u-login').disabled = isEdit;

  _buildStoreCheckboxes();

  if (isEdit) {
    _populateUserForm(userId);
  } else {
    _resetUserForm();
  }

  openModal('m-user');
}

/**
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
 * @param {string} userId
 * @returns {void}
 */
function _populateUserForm(userId) {
  /** @type {User | undefined} */
  const user = _cachedProfiles.find(u => u.id === userId);
  if (!user) return;

  sv('u-id', user.id);
  sv('u-nom', user.nom);
  sv('u-login', _isInternalLogin(user.login) ? '(compte sans email)' : user.login);
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
 * @returns {void}
 */
function _resetUserForm() {
  sv('u-id', '');
  ['u-nom', 'u-login'].forEach(id => sv(id, ''));
  el('u-statut').value = 'actif';
  el('u-role').value   = '';
  PIDS.forEach(permId => {
    const checkbox = el('p-' + permId);
    if (checkbox) checkbox.checked = false;
  });
  el('u-mag-grp').style.display = 'none';
}

/**
 * @param {boolean} applyDefaults
 * @returns {void}
 */
function onRoleChange(applyDefaults = true) {
  /** @type {UserRole | string} */
  const role = el('u-role').value;

  el('u-mag-grp').style.display = (role && role !== 'admin') ? '' : 'none';

  if (!applyDefaults) return;

  if (role === 'direction') {
    document.querySelectorAll('.mcb').forEach(cb => { cb.checked = true; });
  }

  if (DPERMS[role]) {
    PIDS.forEach(permId => {
      const checkbox = el('p-' + permId);
      if (checkbox) checkbox.checked = !!DPERMS[role][permId];
    });
  }
}

/**
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
 * @returns {{ magasins: string[], perms: UserPerms }}
 */
function _readStoreAndPermsFromForm() {
  /** @type {UserRole | string} */
  const role = el('u-role').value;

  /** @type {string[]} */
  const magasins = role === 'admin'
    ? []
    : [...document.querySelectorAll('.mcb:checked')].map(cb => cb.value);

  /** @type {UserPerms} */
  const perms = {};
  PIDS.forEach(permId => {
    const checkbox = el('p-' + permId);
    if (checkbox) perms[permId] = checkbox.checked ? 1 : 0;
  });

  return { magasins, perms };
}

/**
 * Valide et sauvegarde le formulaire utilisateur : crée un compte
 * (avec ou sans email — champ 'u-id' vide) ou met à jour le profil
 * existant (édition).
 * @returns {Promise<void>}
 */
async function saveUser() {
  /** @type {string} */
  const userId  = v('u-id');
  /** @type {UserRole} */
  const role    = el('u-role').value;
  /** @type {string} */
  const nom     = v('u-nom').trim();
  const errorEl = el('u-err');

  if (!nom) {
    errorEl.textContent = 'Le nom est requis.';
    errorEl.classList.add('show');
    return;
  }
  if (!role) {
    errorEl.textContent = 'Le rôle est requis.';
    errorEl.classList.add('show');
    return;
  }

  const { magasins, perms } = _readStoreAndPermsFromForm();

  if (!userId) {
    await _createNewUser(nom, role, magasins, perms, errorEl);
  } else {
    await _updateExistingUser(userId, nom, role, magasins, perms, errorEl);
  }
}

/**
 * Crée un utilisateur — avec email (invitation envoyée par email)
 * ou sans email (identifiant interne + mot de passe temporaire
 * affiché à l'admin), selon que le champ email est rempli ou non.
 * @param {string} nom
 * @param {UserRole} role
 * @param {string[]} magasins
 * @param {UserPerms} perms
 * @param {HTMLElement} errorEl
 * @returns {Promise<void>}
 */
async function _createNewUser(nom, role, magasins, perms, errorEl) {
  /** @type {string} */
  const email = v('u-login').trim().toLowerCase();

  if (email) {
    if (!email.includes('@')) {
      errorEl.textContent = 'Email invalide (laissez le champ vide pour créer un compte sans email).';
      errorEl.classList.add('show');
      return;
    }
    if (_cachedProfiles.find(u => u.login === email)) {
      errorEl.textContent = "Cet email est déjà utilisé par un autre compte. Si plusieurs personnes doivent partager le même accès, ne créez pas de nouveau compte : communiquez-leur les identifiants existants.";
      errorEl.classList.add('show');
      return;
    }
  }

  /** @type {string} */
  const currentDir = window.location.pathname.replace(/[^/]*$/, '');
  /** @type {string} */
  const redirectTo = window.location.origin + currentDir + 'activation-compte.html';

  const { data, error } = await _sb.functions.invoke('invite-user', {
    body: { email: email || undefined, nom, role, magasins, perms, redirectTo },
  });

  /** @type {string|undefined} */
  const functionError = (data && data.error) || error?.message;
  if (functionError) {
    errorEl.textContent = 'Erreur : ' + functionError;
    errorEl.classList.add('show');
    return;
  }

  closeModal('m-user');
  await renderUsers();

  if (data && data.mode === 'no-email') {
    _showGeneratedCredentials(nom, data.identifier, data.tempPassword);
  } else {
    showToast(`Invitation envoyée à ${email}.`, 'success');
  }
}

/**
 * Affiche les identifiants générés pour un compte sans email — une
 * seule fois, jamais reconsultables ensuite (le mot de passe n'est
 * jamais stocké en clair, ni ici ni côté serveur au-delà de la
 * création du compte).
 * @param {string} nom
 * @param {string} identifier
 * @param {string} tempPassword
 * @returns {void}
 */
function _showGeneratedCredentials(nom, identifier, tempPassword) {
  el('cred-nom').textContent      = nom;
  el('cred-identifier').textContent = identifier;
  el('cred-password').textContent   = tempPassword;
  openModal('m-new-credentials');
}

/**
 * Met à jour un profil existant (rôle/statut/magasins/permissions/nom).
 * L'email/identifiant n'est jamais modifié ici (champ désactivé,
 * lié au compte Supabase Auth).
 * @param {string} userId
 * @param {string} nom
 * @param {UserRole} role
 * @param {string[]} magasins
 * @param {UserPerms} perms
 * @param {HTMLElement} errorEl
 * @returns {Promise<void>}
 */
async function _updateExistingUser(userId, nom, role, magasins, perms, errorEl) {
  /** @type {string} */
  const statut = el('u-statut').value;

  /** @type {User | undefined} */
  const existing = _cachedProfiles.find(u => u.id === userId);
  if (!existing) return;

  /** @type {User} */
  const updated = { ...existing, nom, role, statut, magasins, perms };

  const result = await sbUpsert('profiles', [updated]);
  if (!result) {
    errorEl.textContent = 'Erreur lors de la mise à jour du profil.';
    errorEl.classList.add('show');
    return;
  }

  if (CU && CU.id === userId) {
    CU = updated;
    updateSBUser();
    buildSidebar();
  }

  closeModal('m-user');
  await renderUsers();
}
