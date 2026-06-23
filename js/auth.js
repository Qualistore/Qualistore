// ══════════════════════════════════════════════════════════════
// AUTH — Authentification et gestion de session
// Dépend de : storage.js (DB, CU), ui.js (buildSidebar, updateSBUser, navigate)
// Note : les utilitaires DOM el(), v(), sv() ont été déplacés dans ui.js
// ══════════════════════════════════════════════════════════════

// ─────────────────────────────────────────────
// 0. TYPEDEFS JSDoc (pour inférence VSCode / TypeScript)
//    ⚠️ Déduits de l'usage dans ce fichier + de config.js
//    (DEFAULT_PERMISSIONS / PERMISSION_IDS), pas du fichier seul.
// ─────────────────────────────────────────────

/**
 * Identifiant de permission applicative. Liste fermée confirmée par
 * PERMISSION_IDS dans config.js.
 * @typedef {'aud-r'|'aud-w'|'nc'|'ac'|'mag'|'rap'|'grille'|'usr'} PermissionId
 */

/**
 * Droits d'accès d'un utilisateur, une entrée par PermissionId.
 * Valeurs confirmées par DEFAULT_PERMISSIONS dans config.js : 1 = autorisé, 0 = refusé.
 * @typedef {Record<PermissionId, 0|1>} UserPerms
 */

/**
 * Utilisateur applicatif (compte admin ou collaborateur).
 * Structure déduite de storage.js (_buildDefaultDB) et de l'usage
 * dans ce fichier (login, pwd, statut, perms, role).
 * @typedef {Object} User
 * @property {string} id
 * @property {string} nom
 * @property {string} login
 * @property {string} pwd - Mot de passe encodé en base64 (btoa). Pas un hash cryptographique — voir avertissement dans doLogin.
 * @property {string} role - Valeur observée : 'admin'. Autres rôles possibles non confirmés dans ce fichier (voir clés de DEFAULT_PERMISSIONS dans config.js : fsqs, directeur, direction, collaborateur).
 * @property {'actif'|string} statut - Seule la valeur 'actif' est testée explicitement dans doLogin.
 * @property {unknown[]} [magasins]
 * @property {UserPerms} perms
 */

// ─────────────────────────────────────────────
// 1. CONSTANTES
// ─────────────────────────────────────────────

/** @type {number} Durée d'inactivité (ms) avant expiration de session. */
const SESSION_TIMEOUT_MS  = 10 * 60 * 1000; // 10 minutes
/** @type {string} Clé localStorage de l'utilisateur courant (alignée avec storage.js : 'fsqs_cu'). */
const LS_KEY_CURRENT_USER = 'fsqs_cu';
/** @type {string} Clé localStorage de l'horodatage de dernière activité. */
const LS_KEY_LAST_ACTIVITY = 'fsqs_last_activity';

// ─────────────────────────────────────────────
// 2. ÉTAT
// ─────────────────────────────────────────────

/** @type {ReturnType<typeof setTimeout> | null} Identifiant du timer d'inactivité courant. */
let _sessionTimer = null;

// ─────────────────────────────────────────────
// 3. GESTION DE SESSION
// ─────────────────────────────────────────────

/**
 * Réinitialise le timer d'inactivité.
 * Appelé à chaque interaction utilisateur (click, keydown, etc.).
 * @returns {void}
 */
function _resetSessionTimer() {
  if (_sessionTimer) clearTimeout(_sessionTimer);

  _sessionTimer = setTimeout(() => {
    doLogout();
    showToast('Session expirée — veuillez vous reconnecter.', 'warning');
  }, SESSION_TIMEOUT_MS);

  localStorage.setItem(LS_KEY_LAST_ACTIVITY, Date.now());
}

/**
 * Vérifie au chargement de la page si la session précédente a expiré.
 * Invalide CU si la dernière activité date de plus de SESSION_TIMEOUT_MS.
 * @returns {void}
 */
function _checkSessionOnLoad() {
  /** @type {number} Timestamp (ms) de la dernière activité, ou 0 si absent. */
  const lastActivity = parseInt(localStorage.getItem(LS_KEY_LAST_ACTIVITY) || '0');
  /** @type {boolean} */
  const sessionExpired = lastActivity && (Date.now() - lastActivity > SESSION_TIMEOUT_MS);

  if (sessionExpired) {
    localStorage.removeItem(LS_KEY_CURRENT_USER);
    localStorage.removeItem(LS_KEY_LAST_ACTIVITY);
    CU = null;
  }
}

// ─────────────────────────────────────────────
// 4. CONNEXION / DÉCONNEXION
// ─────────────────────────────────────────────

/**
 * Authentifie l'utilisateur à partir des champs de formulaire
 * 'f-login' / 'f-pass'. En cas de succès : met à jour CU, persiste
 * la session, démarre le timer d'inactivité et navigue vers le
 * dashboard. En cas d'échec : affiche le message d'erreur de login.
 * @returns {void}
 */
function doLogin() {
  /** @type {string} */
  const login    = v('f-login');
  /** @type {string} */
  const password = v('f-pass');

  // Recherche de l'utilisateur (mot de passe encodé en base64)
  // ⚠️ btoa n'est pas du hachage — à migrer vers Supabase Auth
  /** @type {User | undefined} */
  const matchedUser = DB.users.find(
    user => user.login === login && user.pwd === btoa(password) && user.statut === 'actif'
  );

  if (!matchedUser) {
    el('login-err').classList.add('show');
    return;
  }

  el('login-err').classList.remove('show');
  CU = matchedUser;
  localStorage.setItem(LS_KEY_CURRENT_USER, JSON.stringify(matchedUser));
  _resetSessionTimer();

  el('login-screen').style.display = 'none';
  el('app').classList.add('on');
  buildSidebar();
  updateSBUser();
  navigate('dashboard');
}

/**
 * Déconnecte l'utilisateur courant : arrête le timer de session,
 * efface CU et le cache localStorage associé, et réaffiche l'écran
 * de connexion.
 * @returns {void}
 */
function doLogout() {
  if (_sessionTimer) clearTimeout(_sessionTimer);

  CU = null;
  localStorage.removeItem(LS_KEY_CURRENT_USER);
  localStorage.removeItem(LS_KEY_LAST_ACTIVITY);

  el('app').classList.remove('on');
  el('login-screen').style.display = '';
  sv('f-login', '');
  sv('f-pass', '');
}

// ─────────────────────────────────────────────
// 5. CONTRÔLE D'ACCÈS
// ─────────────────────────────────────────────

/**
 * Vérifie si l'utilisateur connecté possède une permission donnée.
 * Les admins ont toutes les permissions implicitement.
 * @param {PermissionId} permissionId
 * @returns {boolean|0|undefined} `false`/`undefined` si non connecté
 *   ou non autorisé ; `true` pour un admin ; sinon la valeur brute
 *   0 ou 1 stockée dans CU.perms[permissionId] (non normalisée en booléen
 *   par le code — comportement conservé tel quel).
 */
function hasPerm(permissionId) {
  return CU && (CU.role === 'admin' || CU.perms[permissionId]);
}

// ─────────────────────────────────────────────
// 6. HELPERS CHAMP MOT DE PASSE
// ─────────────────────────────────────────────

/**
 * Bascule la visibilité d'un champ mot de passe et met à jour l'icône.
 * @param {string} inputId - Identifiant DOM du champ `<input>` à basculer.
 * @param {HTMLElement} toggleButton - Élément dont le contenu (innerHTML)
 *   affiche l'icône œil ouvert/fermé.
 * @returns {void}
 */
function togglePass(inputId, toggleButton) {
  /** @type {HTMLInputElement} */
  const input = el(inputId);
  /** @type {boolean} */
  const isHidden = input.type === 'password';
  input.type = isHidden ? 'text' : 'password';
  toggleButton.innerHTML = isHidden
    ? '<i class="ti ti-eye-off"></i>'
    : '<i class="ti ti-eye"></i>';
}
