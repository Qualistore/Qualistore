// ══════════════════════════════════════════════════════════════
// USERS — Gestion des utilisateurs
// Dépend de : storage.js (CU), supabase.js (_sb, sbSelect,
//   sbDeleteWhere), auth.js (hasPerm, togglePass), ui.js,
//   config.js (PIDS, DPERMS, PERMISSION_GROUPS)
//
// ⚠️ CHANGÉ (v8) : le champ "Nom complet" est remplacé par deux
// champs distincts Prénom / Nom (injectés dynamiquement, u-nom
// reste dans le DOM mais caché, synchronisé automatiquement en
// "Prénom Nom" pour ne rien casser côté affichage/tableau). Pour un
// compte SANS email, prenom/nomFamille sont transmis séparément à
// l'Edge Function, qui construit l'identifiant ET en fait le mot de
// passe par défaut (voir invite-user-v6.js) — l'utilisateur devra
// le changer dès sa première connexion.
//
// ⚠️ CORRIGÉ (v9) : _createNewUser() affiche désormais les
// identifiants générés (compte sans email) AVANT le rafraîchissement
// de la liste, et non plus après — voir le commentaire dans cette
// fonction pour le détail du bug corrigé (fenêtre d'identifiants
// jamais affichée en cas d'erreur silencieuse pendant renderUsers()).
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
 * @property {string} login - Email réel, ou adresse technique interne (@hygiperf.local) pour les comptes sans email.
 * @property {UserRole} role
 * @property {'actif'|'inactif'|'invitation'|string} statut
 * @property {string[]} magasins
 * @property {UserPerms} perms
 * @property {boolean} [must_change_password]
 */

/**
 * Magasin.
 * @typedef {Object} Magasin
 * @property {string} id
 * @property {string} nom
 * @property {string} [enseigne]
 * @property {string} [enseigne_id]
 */

/**
 * Enseigne.
 * @typedef {Object} Enseigne
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

/** @type {User[]} */
let _cachedProfiles = [];

/** @type {string|null} */
let _resetPasswordTargetUserId = null;

/** @type {Set<string>} */
let _selectedMagasinIds = new Set();

/** @type {Enseigne[]} */
let _cachedEnseignes = [];

/** @type {boolean} */
let _userModalLockInstalled = false;

/**
 * Empêche de recréer plusieurs fois les champs Prénom/Nom (voir
 * _ensureSplitNameFields).
 * @type {boolean}
 */
let _splitNameFieldsInstalled = false;

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
 * @param {string} login
 * @returns {boolean}
 */
function _isInternalLogin(login) {
  // Accepte AUSSI l'ancien domaine : les comptes internes créés avant
  // le passage à HygiPerf gardent leur adresse technique d'origine.
  return (login || '').endsWith('@hygiperf.local') || (login || '').endsWith('@qualistore.local');
}

// ─────────────────────────────────────────────
// 3. RENDU DE LA PAGE
// ─────────────────────────────────────────────

/**
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
      ? `<span title="Compte sans email — identifiant interne">${user.login.replace(/@(hygiperf|qualistore)\.local$/, '')} <i class="ti ti-lock" style="font-size:11px;opacity:.6"></i></span>`
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
 * Remplace le champ unique "Nom complet" (u-nom) par deux champs
 * Prénom / Nom, injectés dynamiquement. u-nom reste dans le DOM
 * (cache, type=hidden) et se resynchronise automatiquement en
 * "Prénom Nom" à chaque frappe, pour que tout code existant lisant
 * v('u-nom') continue de fonctionner sans changement.
 * @returns {void}
 */
function _ensureSplitNameFields() {
  if (_splitNameFieldsInstalled) return;
  _splitNameFieldsInstalled = true;

  /** @type {HTMLInputElement} */
  const nomInput = el('u-nom');
  /** @type {HTMLElement} */
  const nomGroup = nomInput.parentElement;
  nomGroup.style.display = 'none';

  const wrapper = document.createElement('div');
  wrapper.className = 'form-row';
  wrapper.innerHTML = `
    <div class="form-group">
      <label class="form-label">Prénom *</label>
      <input class="form-control" id="u-prenom" placeholder="Prénom" oninput="_syncCombinedNom()">
    </div>
    <div class="form-group">
      <label class="form-label">Nom *</label>
      <input class="form-control" id="u-nomfamille" placeholder="Nom" oninput="_syncCombinedNom()">
    </div>
  `;
  nomGroup.parentNode.insertBefore(wrapper, nomGroup);
}

/**
 * Recalcule u-nom (caché) = "Prénom Nom" à partir des deux champs
 * séparés — appelé à chaque frappe dans l'un ou l'autre.
 * @returns {void}
 */
function _syncCombinedNom() {
  /** @type {string} */
  const prenom = v('u-prenom').trim();
  /** @type {string} */
  const nomFamille = v('u-nomfamille').trim();
  sv('u-nom', [prenom, nomFamille].filter(Boolean).join(' '));
}

/**
 * Empêche la modale utilisateur de se fermer implicitement (clic
 * sur le fond, touche Échap) — seuls "Annuler" et "Enregistrer"
 * doivent pouvoir la fermer.
 * @returns {void}
 */
function _installUserModalCloseLock() {
  if (_userModalLockInstalled) return;
  _userModalLockInstalled = true;

  document.addEventListener('click', (e) => {
    /** @type {HTMLElement | null} */
    const modal = el('m-user');
    if (!modal) return;
    const isOpen = window.getComputedStyle(modal).display !== 'none';
    if (isOpen && e.target === modal) {
      e.stopPropagation();
      e.preventDefault();
    }
  }, true);

  document.addEventListener('keydown', (e) => {
    if (e.key !== 'Escape') return;
    /** @type {HTMLElement | null} */
    const modal = el('m-user');
    if (!modal) return;
    const isOpen = window.getComputedStyle(modal).display !== 'none';
    if (isOpen) {
      e.stopPropagation();
      e.preventDefault();
    }
  }, true);
}

/**
 * Ouvre la modale de création ou d'édition d'un utilisateur.
 * @param {string} [userId]
 * @returns {Promise<void>}
 */
async function openUserModal(userId) {
  _installUserModalCloseLock();
  _ensureSplitNameFields();

  /** @type {boolean} */
  const isEdit = !!userId;

  el('m-user-ttl').innerHTML = isEdit
    ? '<i class="ti ti-user-edit" style="color:var(--primary)"></i> Modifier l\'utilisateur'
    : '<i class="ti ti-user-plus" style="color:var(--primary)"></i> Nouvel utilisateur';

  el('u-err').classList.remove('show');

  el('u-statut-grp').style.display  = isEdit ? '' : 'none';
  el('u-invite-hint').style.display = isEdit ? 'none' : '';
  el('u-login').disabled = isEdit;

  await _buildStoreCheckboxes();
  _buildPermissionsSection();

  if (isEdit) {
    _populateUserForm(userId);
  } else {
    _resetUserForm();
  }

  openModal('m-user');
}

/**
 * @returns {Promise<void>}
 */
async function _buildStoreCheckboxes() {
  _cachedEnseignes = (await sbSelect('enseignes')) || [];
  _ensureEnseigneFilter();
}

/**
 * @returns {void}
 */
function _ensureEnseigneFilter() {
  /** @type {HTMLSelectElement | null} */
  let filterEl = /** @type {any} */ (el('u-mag-enseigne-filter'));
  if (!filterEl) {
    filterEl = document.createElement('select');
    filterEl.id = 'u-mag-enseigne-filter';
    filterEl.className = 'form-control';
    filterEl.style.marginBottom = '8px';
    filterEl.onchange = _renderStoreCheckboxesForFilter;
    const container = el('u-mag-cbs');
    container.parentNode.insertBefore(filterEl, container);
  }
  filterEl.innerHTML = '<option value="">Toutes les enseignes</option>' +
    _cachedEnseignes.map(e => `<option value="${e.id}">${e.nom}</option>`).join('');
}

/**
 * @param {string} enseigneId
 * @returns {Magasin[]}
 */
function _magasinsForEnseigne(enseigneId) {
  /** @type {Enseigne | undefined} */
  const enseigne = _cachedEnseignes.find(e => e.id === enseigneId);
  return DB.magasins.filter(m =>
    m.enseigne_id === enseigneId || (!m.enseigne_id && enseigne && m.enseigne === enseigne.nom)
  );
}

/**
 * @returns {void}
 */
function _renderStoreCheckboxesForFilter() {
  /** @type {HTMLSelectElement | null} */
  const filterEl = /** @type {any} */ (el('u-mag-enseigne-filter'));
  /** @type {string} */
  const enseigneId = filterEl ? filterEl.value : '';

  /** @type {Magasin[]} */
  const filteredMagasins = enseigneId ? _magasinsForEnseigne(enseigneId) : DB.magasins;

  const container = el('u-mag-cbs');

  // ⚠️ CHANGÉ : assignation présentée par ENSEIGNE puis par magasin —
  // une case d'enseigne (dé)coche tous ses magasins d'un coup.
  // Purement visuel et data-driven (groupes dérivés de
  // Magasin.enseigne) : les liaisons existantes restent des IDs de
  // magasins (User.magasins), rien à migrer.
  /** @type {Map<string, Magasin[]>} */
  const byEnseigne = new Map();
  filteredMagasins.forEach(store => {
    /** @type {string} */
    const enseigne = (store.enseigne || '').trim() || 'Sans enseigne';
    if (!byEnseigne.has(enseigne)) byEnseigne.set(enseigne, []);
    byEnseigne.get(enseigne).push(store);
  });
  /** @type {string[]} */
  const enseignes = [...byEnseigne.keys()].sort((a, b) => {
    if (a === 'Sans enseigne') return 1;
    if (b === 'Sans enseigne') return -1;
    return a.localeCompare(b, 'fr');
  });

  container.innerHTML = enseignes.length
    ? enseignes.map(enseigne => {
        /** @type {Magasin[]} */
        const stores = byEnseigne.get(enseigne);
        /** @type {boolean} */
        const allChecked = stores.every(m => _selectedMagasinIds.has(m.id));
        return `<div style="margin-bottom:8px">
          <label class="cb-item" style="font-weight:700">
            <input type="checkbox" class="ens-cb" data-enseigne="${_escapeHtmlAttr(enseigne)}" ${allChecked ? 'checked' : ''} onchange="_onUserEnseigneToggle(this)">
            <i class="ti ti-building" style="font-size:13px;opacity:.7"></i> ${_escapeHtml(enseigne)}
          </label>
          <div style="margin-left:22px">
            ${stores.map(m => `<label class="cb-item">
              <input type="checkbox" value="${m.id}" class="mcb" data-enseigne="${_escapeHtmlAttr(enseigne)}" ${_selectedMagasinIds.has(m.id) ? 'checked' : ''}
                onchange="_onStoreCheckboxChange(this)"> ${_escapeHtml(m.nom)}
            </label>`).join('')}
          </div>
        </div>`;
      }).join('')
    : '<span class="tm tsm">Aucun magasin pour cette enseigne</span>';

  _updateStoreSelectionCount();
}

/**
 * (Dé)coche d'un coup tous les magasins d'une enseigne dans la
 * modale utilisateur, et synchronise la sélection (_selectedMagasinIds).
 * @param {HTMLInputElement} enseigneCheckbox
 * @returns {void}
 */
function _onUserEnseigneToggle(enseigneCheckbox) {
  /** @type {string} */
  const enseigne = enseigneCheckbox.dataset.enseigne || '';
  document.querySelectorAll('#u-mag-cbs .mcb').forEach(cb => {
    if ((cb.dataset.enseigne || '') !== enseigne) return;
    cb.checked = enseigneCheckbox.checked;
    if (cb.checked) _selectedMagasinIds.add(cb.value);
    else _selectedMagasinIds.delete(cb.value);
  });
  _updateStoreSelectionCount();
}

/**
 * @param {HTMLInputElement} checkbox
 * @returns {void}
 */
function _onStoreCheckboxChange(checkbox) {
  if (checkbox.checked) _selectedMagasinIds.add(checkbox.value);
  else _selectedMagasinIds.delete(checkbox.value);
  // Recale la case de l'enseigne : cochée si tous ses magasins le sont.
  /** @type {string} */
  const enseigne = checkbox.dataset.enseigne || '';
  document.querySelectorAll('#u-mag-cbs .ens-cb').forEach(ensCb => {
    if ((ensCb.dataset.enseigne || '') !== enseigne) return;
    /** @type {HTMLInputElement[]} */
    const stores = [...document.querySelectorAll('#u-mag-cbs .mcb')].filter(cb => (cb.dataset.enseigne || '') === enseigne);
    ensCb.checked = stores.length > 0 && stores.every(cb => cb.checked);
  });
  _updateStoreSelectionCount();
}

/**
 * @returns {void}
 */
function _updateStoreSelectionCount() {
  /** @type {HTMLElement | null} */
  let countEl = el('u-mag-count');
  if (!countEl) {
    countEl = document.createElement('div');
    countEl.id = 'u-mag-count';
    countEl.className = 'tsm tm';
    countEl.style.marginTop = '6px';
    el('u-mag-cbs').parentNode.appendChild(countEl);
  }
  countEl.textContent = `${_selectedMagasinIds.size} magasin(s) sélectionné(s) au total (toutes enseignes confondues)`;
}

/**
 * @returns {void}
 */
function _buildPermissionsSection() {
  const container = el('u-perms-container');
  // ⚠️ AJOUTÉ : droit users_edit_permissions — sans ce droit, la
  // section reste VISIBLE mais en lecture seule (cases désactivées),
  // et saveUser ignore les cases (voir _readStoreAndPermsFromForm).
  /** @type {boolean} */
  const canEditPerms = !!hasPerm('users_edit_permissions');
  /** @type {string} */
  const readOnlyNote = canEditPerms ? '' : `<div class="tsm tm" style="margin-bottom:8px"><i class="ti ti-lock"></i> Lecture seule — le droit « Modifier les droits des utilisateurs » est requis pour changer ces cases.</div>`;
  container.innerHTML = readOnlyNote + PERMISSION_GROUPS.map(group => `
    <details class="perm-sec" open>
      <summary class="perm-title"><i class="ti ${group.icon}"></i> ${group.label}</summary>
      <div class="cb-group">
        ${group.permissions.map(perm => `
          <label class="cb-item"><input type="checkbox" id="p-${perm.id}"${canEditPerms ? '' : ' disabled'}> ${perm.label}</label>
        `).join('')}
      </div>
    </details>
  `).join('');
}

/**
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

  // Découpage approximatif du nom combiné existant (premier mot =
  // prénom, reste = nom) — les comptes créés avant cette version
  // n'ont qu'un seul champ "nom" en base, cette séparation n'est
  // qu'un affichage pour l'édition.
  /** @type {string} */
  const fullName = user.nom || '';
  /** @type {number} */
  const spaceIdx = fullName.indexOf(' ');
  sv('u-prenom', spaceIdx > -1 ? fullName.slice(0, spaceIdx) : '');
  sv('u-nomfamille', spaceIdx > -1 ? fullName.slice(spaceIdx + 1) : fullName);
  sv('u-nom', fullName);

  sv('u-login', _isInternalLogin(user.login) ? '(compte sans email)' : user.login);

  el('u-statut').value = (user.statut === 'invitation') ? 'actif' : user.statut;
  el('u-statut').disabled = (user.statut === 'invitation');

  el('u-role').value = user.role;

  _selectedMagasinIds = new Set(user.magasins || []);
  _renderStoreCheckboxesForFilter();

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
  sv('u-prenom', '');
  sv('u-nomfamille', '');
  sv('u-nom', '');
  sv('u-login', '');
  el('u-statut').value = 'actif';
  el('u-statut').disabled = false;
  el('u-role').value = '';
  PIDS.forEach(permId => {
    const checkbox = el('p-' + permId);
    if (checkbox) checkbox.checked = false;
  });
  el('u-mag-grp').style.display = 'none';

  _selectedMagasinIds = new Set();
  _renderStoreCheckboxesForFilter();

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
    _selectedMagasinIds = new Set(DB.magasins.map(m => m.id));
    _renderStoreCheckboxesForFilter();
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
  document.querySelectorAll('.mcb').forEach(cb => {
    cb.checked = selectAll;
    if (selectAll) _selectedMagasinIds.add(cb.value);
    else _selectedMagasinIds.delete(cb.value);
  });
  // Les cases d'enseigne suivent (voir _renderStoreCheckboxesForFilter).
  document.querySelectorAll('#u-mag-cbs .ens-cb').forEach(cb => { cb.checked = selectAll; });
  _updateStoreSelectionCount();
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
  const magasins = role === 'admin' ? [] : [..._selectedMagasinIds];
  /** @type {UserPerms} */
  const perms = {};
  // ⚠️ AJOUTÉ : sans users_edit_permissions, les cases (désactivées)
  // sont IGNORÉES — droits existants conservés, ou défauts du rôle en
  // création. Jamais uniquement une protection d'UI.
  if (!hasPerm('users_edit_permissions')) {
    /** @type {User | undefined} */
    const existing = _cachedProfiles.find(u => u.id === v('u-id'));
    /** @type {UserPerms} */
    const base = existing ? (existing.perms || {}) : (DPERMS[role] || {});
    PIDS.forEach(permId => { perms[permId] = base[permId] ? 1 : 0; });
    return { magasins, perms };
  }
  PIDS.forEach(permId => {
    const checkbox = el('p-' + permId);
    if (checkbox) perms[permId] = checkbox.checked ? 1 : 0;
  });
  return { magasins, perms };
}

/**
 * Valide et sauvegarde le formulaire utilisateur.
 * @returns {Promise<void>}
 */
async function saveUser() {
  /** @type {string} */
  const userId = v('u-id');
  /** @type {UserRole} */
  const role = el('u-role').value;
  /** @type {string} */
  const prenom = v('u-prenom').trim();
  /** @type {string} */
  const nomFamille = v('u-nomfamille').trim();
  /** @type {string} */
  const nom = [prenom, nomFamille].filter(Boolean).join(' ');
  const errorEl = el('u-err');

  if (!prenom || !nomFamille) {
    errorEl.textContent = 'Le prénom et le nom sont requis.';
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
    await _createNewUser(nom, prenom, nomFamille, role, magasins, perms, errorEl);
  } else {
    await _updateExistingUser(userId, nom, role, magasins, perms, errorEl);
  }
}

/**
 * @returns {string}
 */
function _computeActivationRedirect() {
  const currentDir = window.location.pathname.replace(/[^/]*$/, '');
  return window.location.origin + currentDir + 'activation-compte.html';
}

/**
 * @returns {string}
 */
function _computeResetPasswordRedirect() {
  const currentDir = window.location.pathname.replace(/[^/]*$/, '');
  return window.location.origin + currentDir + 'reset-password.html';
}

/**
 * Extrait le VRAI message d'erreur d'un appel functions.invoke.
 *
 * ⚠️ AJOUTÉ : en cas de statut non-2xx, supabase-js renvoie une
 * erreur générique et `data` reste null — le message précis renvoyé
 * par la fonction ({ error: '...' }) se trouve dans error.context
 * (l'objet Response), qu'il faut lire explicitement.
 * @param {{error?: string}|null} data
 * @param {{message?: string, context?: Response}|null} error
 * @returns {Promise<string|undefined>} Message d'erreur, ou undefined si succès.
 */
async function _edgeFunctionErrorMessage(data, error) {
  if (data && data.error) return data.error;
  if (!error) return undefined;
  if (error.context && typeof error.context.json === 'function') {
    try {
      /** @type {{error?: string}} */
      const body = await error.context.json();
      if (body && body.error) return body.error;
    } catch (_) { /* corps illisible — repli sur le message générique */ }
  }
  return error.message || 'Erreur inconnue.';
}

/**
 * Supprime COMPLÈTEMENT un utilisateur : son compte Supabase Auth via
 * l'Edge Function invite-user (action 'delete-user'), puis la ligne
 * `profiles`. ⚠️ AJOUTÉ (bug des comptes orphelins) — voir
 * confirmDel('user'), magasins.js.
 * @param {string} userId - Référence vers profiles.id / auth.users.id.
 * @returns {Promise<void>}
 */
async function deleteUserCompletely(userId) {
  const { data, error } = await _sb.functions.invoke('invite-user', {
    body: { action: 'delete-user', userId },
  });
  /** @type {string|undefined} */
  const functionError = await _edgeFunctionErrorMessage(data, error);
  if (functionError) {
    showToast('Profil supprimé, mais compte Auth restant : ' + functionError, 'warning');
  }
  sbDeleteWhere('profiles', 'id', userId);
  renderUsers();
}

/**
 * Crée un utilisateur — avec email (invitation) ou sans email
 * (identifiant prenom.nom + mot de passe = ce même identifiant,
 * changement forcé à la première connexion).
 * @param {string} nom
 * @param {string} prenom
 * @param {string} nomFamille
 * @param {UserRole} role
 * @param {string[]} magasins
 * @param {UserPerms} perms
 * @param {HTMLElement} errorEl
 * @returns {Promise<void>}
 */
async function _createNewUser(nom, prenom, nomFamille, role, magasins, perms, errorEl) {
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
    body: {
      email: email || undefined,
      nom, prenom, nomFamille,
      role, magasins, perms,
      redirectTo: _computeActivationRedirect(),
    },
  });

  /** @type {string|undefined} */
  const functionError = await _edgeFunctionErrorMessage(data, error);
  if (functionError) {
    errorEl.textContent = 'Erreur : ' + functionError;
    errorEl.classList.add('show');
    return;
  }

  closeModal('m-user');

  // ⚠️ CORRIGÉ (v9) : on affiche IMMÉDIATEMENT les identifiants
  // générés pour un compte sans email, AVANT tout autre traitement
  // (y compris le rafraîchissement de la liste). Ce mot de passe
  // temporaire n'est affiché qu'une seule fois et ne peut plus être
  // récupéré ensuite (il n'est stocké que sous forme hachée côté
  // Supabase Auth) — si son affichage dépendait d'une étape pouvant
  // échouer (comme le rechargement de la liste), la moindre erreur
  // silencieuse (réseau, latence, etc.) empêchait l'admin de jamais
  // voir ce mot de passe, sans qu'aucun message n'apparaisse à
  // l'écran.
  //
  // Détection de secours : au cas où la Edge Function renverrait un
  // jour une forme légèrement différente, on considère aussi que
  // c'est un compte sans email si un identifiant ET un mot de passe
  // temporaire sont présents dans la réponse, même sans le champ
  // "mode".
  /** @type {boolean} */
  const isNoEmailAccount = !!(data && (data.mode === 'no-email' || (data.identifier && data.tempPassword)));

  if (isNoEmailAccount) {
    _showGeneratedCredentials(nom, data.identifier, data.tempPassword);
  } else {
    showToast(`Invitation envoyée à ${email}.`, 'success');
  }

  try {
    await renderUsers();
  } catch (renderError) {
    // Ne doit jamais faire disparaître la fenêtre d'identifiants déjà
    // affichée : on journalise seulement l'erreur. La liste se
    // remettra à jour au prochain rechargement de la page.
    console.error('Erreur lors du rafraîchissement de la liste des utilisateurs :', renderError);
  }
}

/**
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
  const functionError = await _edgeFunctionErrorMessage(data, error);
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
  const functionError = await _edgeFunctionErrorMessage(data, error);
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
