// ══════════════════════════════════════════════════════════════
// USERS — Gestion des utilisateurs
// Dépend de : storage.js (CU), supabase.js (_sb, sbDeleteWhere),
//   auth.js (hasPerm), ui.js, config.js (PIDS, DPERMS)
//
// ⚠️ CHANGÉ (migration Supabase Auth) : cet écran ne lit/écrit plus
// DB.users (ancien système, mots de passe en base64) mais la table
// `profiles` directement via Supabase — création par invitation par
// email (Edge Function invite-user, la personne invitée choisit
// elle-même son nom et son mot de passe sur activation-compte.html),
// édition (rôle/magasins/permissions/statut) via un upsert direct
// sur `profiles`. Il n'y a plus de champ mot de passe dans cette
// modale : Supabase Auth gère les mots de passe de bout en bout.
// ══════════════════════════════════════════════════════════════

// ─────────────────────────────────────────────
// 0. TYPEDEFS JSDoc (pour inférence VSCode / TypeScript)
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
 * Profil applicatif (ligne de la table `profiles`, liée à
 * auth.users par le même id — voir 01-profiles-et-policies.sql).
 * ⚠️ Ne porte plus de champ `pwd` — le mot de passe n'existe que
 * côté Supabase Auth.
 * @typedef {Object} User
 * @property {string} id - Référence vers auth.users.id (uuid Supabase).
 * @property {string} nom - Vide tant que le compte est au statut 'invitation'.
 * @property {string} login - Email réel de l'utilisateur (identique à auth.users.email).
 * @property {UserRole} role
 * @property {'actif'|'inactif'|'invitation'|string} statut - Seule la valeur 'actif' autorise la connexion.
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

/**
 * Libellés des statuts pour l'affichage dans le tableau.
 * @type {Record<string, string>}
 */
const USER_STATUT_LABELS = {
  actif:      'actif',
  inactif:    'inactif',
  invitation: 'invitation envoyée',
};

/**
 * Cache local du dernier chargement de `profiles`, utilisé pour
 * pré-remplir le formulaire d'édition et vérifier le dernier admin
 * actif sans refaire un aller-retour réseau à chaque interaction.
 * Rafraîchi à chaque appel de renderUsers().
 * @type {User[]}
 */
let _cachedProfiles = [];

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
 * l'avatar utilisateur. Retourne '?' si le nom est encore vide
 * (compte invité pas encore activé).
 * @param {string} name
 * @returns {string}
 */
function _buildUserInitials(name) {
  if (!name) return '?';
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
 * Charge les profils depuis Supabase et affiche le tableau des
 * utilisateurs. Empêche la suppression du dernier administrateur
 * actif (bouton supprimer masqué pour lui).
 * @returns {Promise<void>}
 */
async function renderUsers() {
  _cachedProfiles = await sbSelect('profiles');

  /** @type {boolean|0|undefined} */
  const canManage    = hasPerm('usr');
  /** @type {boolean} */
  const onlyOneAdmin = _cachedProfiles.filter(u => u.role === 'admin' && u.statut === 'actif').length <= 1;

  el('usr-cnt').textContent        = `${_cachedProfiles.length} utilisateur(s)`;
  el('btn-add-usr').style.display  = canManage ? '' : 'none';

  el('usr-tb').innerHTML = _cachedProfiles.map(user => {
    /** @type {string} */
    const initials  = _buildUserInitials(user.nom);
    /** @type {string} */
    const storeList = _buildUserStoresList(user);
    /** @type {boolean} */
    const isLastAdmin = user.role === 'admin' && onlyOneAdmin;
    /** @type {string} */
    const displayName = user.nom || '(invitation en attente)';

    return `<tr>
      <td>
        <div style="display:flex;align-items:center;gap:8px">
          <div class="avatar" style="background:var(--primary-light);color:var(--primary)">${initials}</div>
          <div>
            <div style="font-weight:500">${displayName}</div>
            <div class="tsm tm">${user.login}</div>
          </div>
        </div>
      </td>
      <td class="tsm tm">${user.login}</td>
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
 * Ouvre la modale de création (invitation par email) ou d'édition
 * d'un utilisateur. En création : seuls email/rôle/magasins/droits
 * sont demandés (nom et mot de passe sont choisis par la personne
 * invitée elle-même). En édition : nom/statut redeviennent
 * modifiables, email non modifiable (lié au compte Supabase Auth).
 * @param {string} [userId] - Référence vers User.id à éditer ; absent/falsy pour une invitation.
 * @returns {void}
 */
function openUserModal(userId) {
  /** @type {boolean} */
  const isEdit = !!userId;

  el('m-user-ttl').innerHTML = isEdit
    ? '<i class="ti ti-user-edit" style="color:var(--primary)"></i> Modifier l\'utilisateur'
    : '<i class="ti ti-user-plus" style="color:var(--primary)"></i> Inviter un utilisateur';

  el('u-err').classList.remove('show');

  el('u-nom-grp').style.display    = isEdit ? '' : 'none';
  el('u-statut-grp').style.display = isEdit ? '' : 'none';
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
 * Pré-remplit le formulaire avec les données d'un profil existant
 * (depuis le cache _cachedProfiles, chargé par le dernier renderUsers()).
 * @param {string} userId - Référence vers User.id.
 * @returns {void}
 */
function _populateUserForm(userId) {
  /** @type {User | undefined} */
  const user = _cachedProfiles.find(u => u.id === userId);
  if (!user) return;

  sv('u-id', user.id);
  sv('u-nom', user.nom);
  sv('u-login', user.login);
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
 * Réinitialise le formulaire pour une invitation.
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
 * Lit les magasins cochés et les droits cochés du formulaire.
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
 * Valide et sauvegarde le formulaire utilisateur : envoie une
 * invitation par email (création, champ 'u-id' vide) ou met à jour
 * le profil existant (édition). Rafraîchit la session courante (CU)
 * si l'admin modifie son propre profil.
 * @returns {Promise<void>}
 */
async function saveUser() {
  /** @type {string} */
  const userId  = v('u-id');
  /** @type {UserRole} */
  const role    = el('u-role').value;
  const errorEl = el('u-err');

  if (!role) {
    errorEl.textContent = 'Le rôle est requis.';
    errorEl.classList.add('show');
    return;
  }

  const { magasins, perms } = _readStoreAndPermsFromForm();

  if (!userId) {
    await _inviteNewUser(role, magasins, perms, errorEl);
  } else {
    await _updateExistingUser(userId, role, magasins, perms, errorEl);
  }
}

/**
 * Envoie une invitation par email via la Edge Function invite-user.
 * @param {UserRole} role
 * @param {string[]} magasins
 * @param {UserPerms} perms
 * @param {HTMLElement} errorEl
 * @returns {Promise<void>}
 */
async function _inviteNewUser(role, magasins, perms, errorEl) {
  /** @type {string} */
  const email = v('u-login').trim().toLowerCase();

  if (!email || !email.includes('@')) {
    errorEl.textContent = 'Une adresse email valide est requise.';
    errorEl.classList.add('show');
    return;
  }
  if (_cachedProfiles.find(u => u.login === email)) {
    errorEl.textContent = 'Cet email est déjà utilisé.';
    errorEl.classList.add('show');
    return;
  }

  /** @type {string} Dossier de la page courante (avec / final). */
  const currentDir = window.location.pathname.replace(/[^/]*$/, '');
  /** @type {string} */
  const redirectTo = window.location.origin + currentDir + 'activation-compte.html';

  const { data, error } = await _sb.functions.invoke('invite-user', {
    body: { email, role, magasins, perms, redirectTo },
  });

  /** @type {string|undefined} */
  const functionError = (data && data.error) || error?.message;
  if (functionError) {
    errorEl.textContent = 'Erreur : ' + functionError;
    errorEl.classList.add('show');
    return;
  }

  closeModal('m-user');
  showToast(`Invitation envoyée à ${email}.`, 'success');
  await renderUsers();
}

/**
 * Met à jour un profil existant (rôle/statut/magasins/permissions/nom)
 * directement dans Supabase. L'email n'est jamais modifié ici (champ
 * désactivé dans le formulaire, lié au compte Supabase Auth).
 * @param {string} userId
 * @param {UserRole} role
 * @param {string[]} magasins
 * @param {UserPerms} perms
 * @param {HTMLElement} errorEl
 * @returns {Promise<void>}
 */
async function _updateExistingUser(userId, role, magasins, perms, errorEl) {
  /** @type {string} */
  const nom    = v('u-nom').trim();
  /** @type {string} */
  const statut = el('u-statut').value;

  if (!nom) {
    errorEl.textContent = 'Le nom est requis.';
    errorEl.classList.add('show');
    return;
  }

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

  // Rafraîchir la session si l'admin modifie son propre profil
  if (CU && CU.id === userId) {
    CU = updated;
    updateSBUser();
    buildSidebar();
  }

  closeModal('m-user');
  await renderUsers();
}
