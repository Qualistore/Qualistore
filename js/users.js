// ══════════════════════════════════════════════════════════════
// USERS — Gestion des utilisateurs
// Dépend de : storage.js (CU), supabase.js (_sb, sbDeleteWhere),
//   auth.js (hasPerm, togglePass), ui.js, config.js (PIDS, DPERMS,
//   PERMISSION_GROUPS)
//
// ⚠️ CHANGÉ (v5) :
//  - Le champ Statut est désormais verrouillé (non modifiable par
//    l'admin) tant que le compte est au statut 'invitation' — il
//    ne doit passer à 'actif' QUE via l'activation par
//    l'utilisateur lui-même (activate_own_profile), jamais par une
//    modification manuelle qui laisserait un compte "actif" sans
//    mot de passe défini. Redevient modifiable (Actif/Inactif) une
//    fois le compte réellement activé.
//  - Nouveau bouton "Réinitialiser le mot de passe" (comptes déjà
//    actifs uniquement) : envoie un email de réinitialisation si le
//    compte a un email réel, sinon ouvre une modale permettant à
//    l'admin de saisir lui-même un nouveau mot de passe temporaire
//    (l'utilisateur devra le changer à sa prochaine connexion,
//    comme à la création initiale).
// ══════════════════════════════════════════════════════════════

// ─────────────────────────────────────────────
// 0. TYPEDEFS JSDoc (pour inférence VSCode / TypeScript)
// ─────────────────────────────────────────────

/**
 * Rôle applicatif d'un utilisateur.
 * @typedef {'admin'|'fsqs'|'directeur'|'direction'|'collaborateur'} UserRole
 */

/**
 * Droits d'accès d'un utilisateur, une entrée par PermissionId
 * (voir config.js, PERMISSION_GROUPS/PERMISSION_IDS).
 * @typedef {Object<string, 0|1>} UserPerms
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

/**
 * Identifiant de l'utilisateur ciblé par la modale de
 * réinitialisation manuelle de mot de passe (compte sans email).
 * @type {string|null}
 */
let _resetPasswordTargetUserId = null;

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
  const canManage    = hasPerm('users_manage');
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
  _buildPermissionsSection();

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
 * Construit dynamiquement la section "Droits sur l'application" à
 * partir de PERMISSION_GROUPS (config.js) — un menu dépliable
 * (ouvert par défaut, réductible via l'élément natif <details>) par
 * groupe, une case à cocher par droit. Évite de dupliquer la liste
 * des droits en dur dans le HTML : config.js reste la source unique
 * de vérité.
 * @returns {void}
 */
function _buildPermissionsSection() {
  const container = el('u-perms-container');
  container.innerHTML = PERMISSION_GROUPS.map(group => `
    <details class="perm-sec" open>
      <summary class="perm-title"><i class="ti ${group.icon}"></i> ${group.label}</summary>
      <div class="cb-group">
        ${group.permissions.map(perm => `
          <label class="cb-item"><input type="checkbox" id="p-${perm.id}"> ${perm.label}</label>
        `).join('')}
      </div>
    </details>
  `).join('');
}

/**
 * Crée (si besoin) et retourne le bouton "Renvoyer l'invitation",
 * inséré juste après le groupe Statut de la modale.
 * @returns {HTMLButtonElement}
 */
function _ensureResendButton() {
  /** @type {HTMLButtonElement | null} */
  let btn = /** @type {any} */ (el('u-resend-btn'));
  if (!btn) {
    btn = document.createElement('button');
    btn.type = 'button';
    btn.id = 'u-resend-btn';
    btn.className = 'btn btn-secondary btn-sm';
    btn.style.marginTop = '8px';
    btn.style.marginRight = '8px';
    btn.innerHTML = '<i class="ti ti-mail-forward"></i> Renvoyer l\'invitation';
    btn.onclick = () => resendInvitation(v('u-id'));
    const anchor = el('u-statut-grp');
    anchor.parentNode.insertBefore(btn, anchor.nextSibling);
  }
  return btn;
}

/**
 * Crée (si besoin) et retourne le bouton "Réinitialiser le mot de
 * passe", positionné juste après le bouton "Renvoyer l'invitation".
 * @returns {HTMLButtonElement}
 */
function _ensureResetPasswordButton() {
  /** @type {HTMLButtonElement | null} */
  let btn = /** @type {any} */ (el('u-resetpw-btn'));
  if (!btn) {
    btn = document.createElement('button');
    btn.type = 'button';
    btn.id = 'u-resetpw-btn';
    btn.className = 'btn btn-secondary btn-sm';
    btn.style.marginTop = '8px';
    btn.innerHTML = '<i class="ti ti-key"></i> Réinitialiser le mot de passe';
    btn.onclick = () => resetUserPassword(v('u-id'));
    const resendBtn = _ensureResendButton();
    resendBtn.parentNode.insertBefore(btn, resendBtn.nextSibling);
  }
  return btn;
}

/**
 * Crée (si besoin) la modale permettant à l'admin de saisir
 * manuellement un nouveau mot de passe pour un compte sans email.
 * Injectée dynamiquement — aucune modification de Qualistore.html
 * n'est nécessaire pour cette fonctionnalité.
 * @returns {void}
 */
function _ensureResetPasswordModal() {
  if (el('m-reset-pass')) return;

  document.body.insertAdjacentHTML('beforeend', `
    <div class="modal-ov" id="m-reset-pass">
      <div class="modal">
        <div class="modal-hdr">
          <div class="modal-title"><i class="ti ti-key" style="color:var(--primary)"></i> Nouveau mot de passe</div>
          <button class="btn-x" onclick="closeModal('m-reset-pass')">&times;</button>
        </div>
        <div class="modal-body">
          <div class="form-err" id="rp-err"></div>
          <p class="tsm tm" style="margin-bottom:12px">Ce compte n'a pas d'adresse email : définissez vous-même son nouveau mot de passe et communiquez-le à l'utilisateur. Il devra le changer à sa prochaine connexion.</p>
          <div class="form-group">
            <label class="form-label">Nouveau mot de passe</label>
            <div class="pw-wrap">
              <input class="form-control" type="password" id="rp-new" placeholder="••••••••" autocomplete="new-password">
              <button class="pw-eye" type="button" onclick="togglePass('rp-new',this)"><i class="ti ti-eye"></i></button>
            </div>
          </div>
          <div class="form-group">
            <label class="form-label">Confirmer le mot de passe</label>
            <div class="pw-wrap">
              <input class="form-control" type="password" id="rp-confirm" placeholder="••••••••" autocomplete="new-password">
              <button class="pw-eye" type="button" onclick="togglePass('rp-confirm',this)"><i class="ti ti-eye"></i></button>
            </div>
          </div>
        </div>
        <div class="modal-foot">
          <button class="btn btn-secondary" onclick="closeModal('m-reset-pass')">Annuler</button>
          <button class="btn btn-primary" onclick="confirmAdminResetPassword()"><i class="ti ti-check"></i> Enregistrer</button>
        </div>
      </div>
    </div>
  `);
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

  // Le statut ne peut être modifié manuellement que pour un compte
  // déjà activé — jamais pendant qu'il est en attente d'activation,
  // pour éviter qu'un compte se retrouve marqué "actif" sans avoir
  // jamais défini de mot de passe.
  el('u-statut').value = (user.statut === 'invitation') ? 'actif' : user.statut;
  el('u-statut').disabled = (user.statut === 'invitation');

  el('u-role').value = user.role;

  document.querySelectorAll('.mcb').forEach(cb => {
    cb.checked = (user.magasins || []).includes(cb.value);
  });

  PIDS.forEach(permId => {
    const checkbox = el('p-' + permId);
    if (checkbox) checkbox.checked = !!(user.perms || {})[permId];
  });

  const resendBtn = _ensureResendButton();
  resendBtn.style.display = (user.statut === 'invitation' && !_isInternalLogin(user.login)) ? '' : 'none';

  const resetPwBtn = _ensureResetPasswordButton();
  resetPwBtn.style.display = (user.statut === 'actif') ? '' : 'none';

  onRoleChange(false);
}

/**
 * @returns {void}
 */
function _resetUserForm() {
  sv('u-id', '');
  ['u-nom', 'u-login'].forEach(id => sv(id, ''));
  el('u-statut').value = 'actif';
  el('u-statut').disabled = false;
  el('u-role').value = '';
  PIDS.forEach(permId => {
    const checkbox = el('p-' + permId);
    if (checkbox) checkbox.checked = false;
  });
  el('u-mag-grp').style.display = 'none';

  const resendBtn = el('u-resend-btn');
  if (resendBtn) resendBtn.style.display = 'none';
  const resetPwBtn = el('u-resetpw-btn');
  if (resetPwBtn) resetPwBtn.style.display = 'none';
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
 * Calcule l'URL de retour (activation-compte.html) à partir de
 * l'emplacement courant du site.
 * @returns {string}
 */
function _computeActivationRedirect() {
  const currentDir = window.location.pathname.replace(/[^/]*$/, '');
  return window.location.origin + currentDir + 'activation-compte.html';
}

/**
 * Calcule l'URL de retour (reset-password.html) à partir de
 * l'emplacement courant du site.
 * @returns {string}
 */
function _computeResetPasswordRedirect() {
  const currentDir = window.location.pathname.replace(/[^/]*$/, '');
  return window.location.origin + currentDir + 'reset-password.html';
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

  const { data, error } = await _sb.functions.invoke('invite-user', {
    body: { email: email || undefined, nom, role, magasins, perms, redirectTo: _computeActivationRedirect() },
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
 * Renvoie une invitation à un utilisateur dont le compte est
 * toujours au statut 'invitation' (pas encore activé). Recrée le
 * compte Auth (Supabase refuse de ré-inviter un email déjà
 * enregistré) en conservant nom/rôle/magasins/droits déjà saisis.
 * @param {string} userId
 * @returns {Promise<void>}
 */
async function resendInvitation(userId) {
  if (!userId) return;
  const errorEl = el('u-err');
  errorEl.classList.remove('show');

  const { data, error } = await _sb.functions.invoke('invite-user', {
    body: { action: 'resend', userId, redirectTo: _computeActivationRedirect() },
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
  showToast('Nouvelle invitation envoyée.', 'success');
}

/**
 * Déclenche la réinitialisation du mot de passe d'un utilisateur
 * déjà actif : envoi d'un email si le compte a une adresse réelle,
 * sinon ouverture de la modale de saisie manuelle par l'admin.
 * @param {string} userId
 * @returns {Promise<void>}
 */
async function resetUserPassword(userId) {
  if (!userId) return;
  /** @type {User | undefined} */
  const user = _cachedProfiles.find(u => u.id === userId);
  if (!user) return;

  if (_isInternalLogin(user.login)) {
    _resetPasswordTargetUserId = userId;
    _ensureResetPasswordModal();
    sv('rp-new', '');
    sv('rp-confirm', '');
    el('rp-err').classList.remove('show');
    openModal('m-reset-pass');
    return;
  }

  const { error } = await _sb.auth.resetPasswordForEmail(user.login, {
    redirectTo: _computeResetPasswordRedirect(),
  });

  if (error) {
    const errorEl = el('u-err');
    errorEl.textContent = "Erreur lors de l'envoi de l'email : " + error.message;
    errorEl.classList.add('show');
    return;
  }

  showToast(`Email de réinitialisation envoyé à ${user.login}.`, 'success');
}

/**
 * Valide et envoie le nouveau mot de passe saisi par l'admin pour
 * un compte sans email (action "set-password" de l'Edge Function).
 * @returns {Promise<void>}
 */
async function confirmAdminResetPassword() {
  const errorEl = el('rp-err');
  errorEl.classList.remove('show');

  /** @type {string} */
  const newPassword = v('rp-new');
  /** @type {string} */
  const confirmPassword = v('rp-confirm');

  if (!newPassword || newPassword.length < 10) {
    errorEl.textContent = 'Le mot de passe doit contenir au moins 10 caractères.';
    errorEl.classList.add('show');
    return;
  }
  if (newPassword !== confirmPassword) {
    errorEl.textContent = 'Les mots de passe ne correspondent pas.';
    errorEl.classList.add('show');
    return;
  }

  const { data, error } = await _sb.functions.invoke('invite-user', {
    body: { action: 'set-password', userId: _resetPasswordTargetUserId, newPassword },
  });

  /** @type {string|undefined} */
  const functionError = (data && data.error) || error?.message;
  if (functionError) {
    errorEl.textContent = 'Erreur : ' + functionError;
    errorEl.classList.add('show');
    return;
  }

  closeModal('m-reset-pass');
  closeModal('m-user');
  showToast("Mot de passe modifié. L'utilisateur devra le changer à sa prochaine connexion.", 'success');
}

/**
 * Affiche les identifiants générés pour un compte sans email — une
 * seule fois, jamais reconsultables ensuite.
 * @param {string} nom
 * @param {string} identifier
 * @param {string} tempPassword
 * @returns {void}
 */
function _showGeneratedCredentials(nom, identifier, tempPassword) {
  el('cred-nom').textContent        = nom;
  el('cred-identifier').textContent = identifier;
  el('cred-password').textContent   = tempPassword;
  openModal('m-new-credentials');
}

/**
 * Met à jour un profil existant (rôle/statut/magasins/permissions/nom).
 * L'email/identifiant n'est jamais modifié ici (champ désactivé,
 * lié au compte Supabase Auth). Le statut n'est lu depuis le
 * formulaire que s'il n'est pas verrouillé (voir _populateUserForm) ;
 * sinon il reste inchangé, pour ne jamais court-circuiter
 * l'activation par l'utilisateur lui-même.
 * @param {string} userId
 * @param {string} nom
 * @param {UserRole} role
 * @param {string[]} magasins
 * @param {UserPerms} perms
 * @param {HTMLElement} errorEl
 * @returns {Promise<void>}
 */
async function _updateExistingUser(userId, nom, role, magasins, perms, errorEl) {
  /** @type {User | undefined} */
  const existing = _cachedProfiles.find(u => u.id === userId);
  if (!existing) return;

  /** @type {string} */
  const statut = el('u-statut').disabled ? existing.statut : el('u-statut').value;

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
