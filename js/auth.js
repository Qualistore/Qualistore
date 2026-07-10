// ══════════════════════════════════════════════════════════════
// AUTH — Authentification et gestion de session
// Dépend de : storage.js (DB, CU), supabase.js (_sb), ui.js
//   (buildSidebar, updateSBUser, navigate, showToast)
//
// ⚠️ CHANGÉ (migration Supabase Auth, étape 3/8 — voir le plan) :
// l'authentification ne compare plus login/mot de passe à la main
// contre DB.users (qui contenait pwd en base64 — jamais un hachage
// réel). Le mot de passe n'est désormais plus jamais stocké dans vos
// propres tables : Supabase Auth le gère entièrement (hachage bcrypt
// côté serveur), voir supabase.js pour le client.
//
// ⚠️ CHANGÉ (v2) : le champ de connexion est désormais une vraie
// adresse email (plus d'email technique invisible) — nécessaire pour
// que la réinitialisation de mot de passe par email fonctionne
// réellement (voir requestPasswordReset ci-dessous, et le SMTP Brevo
// configuré côté Supabase).
//
// ⚠️ CHANGÉ (ferme la faille "session falsifiable" de l'audit) :
// CU n'est plus jamais écrit tel quel dans localStorage par ce
// fichier — reconstruit à chaque chargement depuis la table
// `profiles`, via l'id du vrai jeton de session Supabase, jamais
// depuis une donnée modifiable dans le navigateur.
// ══════════════════════════════════════════════════════════════

// ─────────────────────────────────────────────
// 0. TYPEDEFS JSDoc (pour inférence VSCode / TypeScript)
// ─────────────────────────────────────────────

/**
 * Identifiant de permission applicative. Liste fermée et canonique,
 * voir PERMISSION_IDS (config.js).
 * @typedef {'aud-r'|'aud-w'|'nc'|'ac'|'mag'|'rap'|'grille'|'usr'} PermissionId
 */

/**
 * Droits d'accès d'un utilisateur, une entrée par PermissionId.
 * @typedef {Record<PermissionId, 0|1>} UserPerms
 */

/**
 * Utilisateur applicatif (ligne de la table `profiles`, liée à
 * auth.users par le même id — voir 01-profiles-et-policies.sql).
 * ⚠️ CHANGÉ : ne porte plus de champ `pwd` — le mot de passe n'existe
 * plus que côté Supabase Auth, jamais dans cette table.
 * @typedef {Object} User
 * @property {string} id - Référence vers auth.users.id (uuid Supabase).
 * @property {string} nom
 * @property {string} login - Email réel de l'utilisateur (identique à auth.users.email).
 * @property {'admin'|'fsqs'|'directeur'|'direction'|'collaborateur'} role
 * @property {'actif'|string} statut - Seule la valeur 'actif' autorise la connexion.
 * @property {string[]} magasins
 * @property {UserPerms} perms
 */

// ─────────────────────────────────────────────
// 1. CONSTANTES
// ─────────────────────────────────────────────

/** @type {number} Durée d'inactivité (ms) avant expiration de session. */
const SESSION_TIMEOUT_MS = 10 * 60 * 1000; // 10 minutes

// ─────────────────────────────────────────────
// 2. ÉTAT
// ─────────────────────────────────────────────

/** @type {ReturnType<typeof setTimeout> | null} Identifiant du timer d'inactivité courant. */
let _sessionTimer = null;

// ─────────────────────────────────────────────
// 3. ÉCOUTEUR GLOBAL — RÉCUPÉRATION DE MOT DE PASSE
// Enregistré dès le chargement de ce script (avant DOMContentLoaded),
// pour être sûr de ne jamais manquer l'événement PASSWORD_RECOVERY
// déclenché par supabase-js quand l'utilisateur revient sur l'appli
// via le lien reçu par email (voir requestPasswordReset).
// ─────────────────────────────────────────────

_sb.auth.onAuthStateChange((event) => {
  if (event === 'PASSWORD_RECOVERY') {
    _showPasswordRecoveryForm();
  }
});

/**
 * Indique si la page vient d'être ouverte via un lien de
 * réinitialisation de mot de passe (Supabase ajoute `type=recovery`
 * dans le fragment d'URL au retour depuis l'email).
 * @returns {boolean}
 */
function _isPasswordRecoveryFlow() {
  return window.location.hash.includes('type=recovery');
}

// ─────────────────────────────────────────────
// 4. GESTION DE SESSION
// ─────────────────────────────────────────────

/**
 * Réinitialise le timer d'inactivité.
 * @returns {void}
 */
function _resetSessionTimer() {
  if (_sessionTimer) clearTimeout(_sessionTimer);
  _sessionTimer = setTimeout(() => {
    doLogout();
    showToast('Session expirée — veuillez vous reconnecter.', 'warning');
  }, SESSION_TIMEOUT_MS);
}

/**
 * Vérifie au chargement de la page si une session Supabase valide
 * existe déjà (persistée par le SDK), et recharge le profil complet
 * dans CU le cas échéant. Sans effet si la page vient d'être ouverte
 * via un lien de réinitialisation (voir _isPasswordRecoveryFlow) —
 * dans ce cas, c'est le formulaire de nouveau mot de passe qui prend
 * la main, pas une connexion normale.
 * @returns {Promise<void>}
 */
async function _checkSessionOnLoad() {
  if (_isPasswordRecoveryFlow()) return; // géré par l'écouteur PASSWORD_RECOVERY

  /** @type {{ data: { session: Object|null } }} */
  const { data: { session } } = await _sb.auth.getSession();
  if (!session) { CU = null; return; }

  /** @type {User | null} */
  const profile = await _fetchProfile(session.user.id);
  if (!profile || profile.statut !== 'actif') {
    await _sb.auth.signOut();
    CU = null;
    return;
  }

  CU = profile;
  _resetSessionTimer();
}

/**
 * Récupère le profil applicatif (table `profiles`) d'un utilisateur
 * authentifié Supabase.
 * @param {string} userId - Référence vers auth.users.id.
 * @returns {Promise<User | null>}
 */
async function _fetchProfile(userId) {
  const { data, error } = await _sb.from('profiles').select('*').eq('id', userId).single();
  if (error) {
    console.error('Erreur récupération profil :', error.message);
    return null;
  }
  return data;
}

// ─────────────────────────────────────────────
// 5. CONNEXION / DÉCONNEXION
// ─────────────────────────────────────────────

/**
 * Authentifie l'utilisateur à partir des champs de formulaire
 * 'f-login' (email réel) / 'f-pass', via Supabase Auth.
 * @returns {Promise<void>}
 */
async function doLogin() {
  /** @type {string} */
  const email    = v('f-login').trim().toLowerCase();
  /** @type {string} */
  const password = v('f-pass');
  const errorEl  = el('login-err');

  const { data: authData, error: authError } = await _sb.auth.signInWithPassword({ email, password });

  if (authError || !authData.user) {
    errorEl.textContent = 'Identifiant ou mot de passe incorrect.';
    errorEl.classList.add('show');
    return;
  }

  /** @type {User | null} */
  const profile = await _fetchProfile(authData.user.id);
  if (!profile || profile.statut !== 'actif') {
    await _sb.auth.signOut();
    errorEl.textContent = 'Identifiant ou mot de passe incorrect.';
    errorEl.classList.add('show');
    return;
  }

  errorEl.classList.remove('show');
  CU = profile;
  _resetSessionTimer();

  el('login-screen').style.display = 'none';
  el('app').classList.add('on');
  buildSidebar();
  updateSBUser();
  navigate('dashboard');
}

/**
 * Déconnecte l'utilisateur courant : arrête le timer de session,
 * termine la session Supabase, efface CU, et réaffiche l'écran de
 * connexion.
 * @returns {Promise<void>}
 */
async function doLogout() {
  if (_sessionTimer) clearTimeout(_sessionTimer);
  await _sb.auth.signOut();
  CU = null;

  el('app').classList.remove('on');
  el('login-screen').style.display = '';
  sv('f-login', '');
  sv('f-pass', '');
  showLoginForm();
}

// ─────────────────────────────────────────────
// 6. MOT DE PASSE OUBLIÉ
// ─────────────────────────────────────────────

/**
 * Affiche le formulaire "mot de passe oublié" à la place du
 * formulaire de connexion normal (voir le bloc HTML #login-forgot
 * ajouté dans index.html / Qualistore.html).
 * @returns {void}
 */
function showForgotPasswordForm() {
  el('login-form').style.display   = 'none';
  el('login-forgot').style.display = '';
  el('login-reset').style.display  = 'none';
  el('login-err').classList.remove('show');
}

/**
 * Revient au formulaire de connexion normal.
 * @returns {void}
 */
function showLoginForm() {
  el('login-form').style.display   = '';
  el('login-forgot').style.display = 'none';
  el('login-reset').style.display  = 'none';
}

/**
 * Affiche le formulaire "choisir un nouveau mot de passe", déclenché
 * automatiquement quand l'utilisateur revient sur l'appli via le lien
 * reçu par email (voir l'écouteur PASSWORD_RECOVERY, section 3).
 * @returns {void}
 */
function _showPasswordRecoveryForm() {
  el('login-screen').style.display = '';
  el('app').classList.remove('on');
  el('login-form').style.display   = 'none';
  el('login-forgot').style.display = 'none';
  el('login-reset').style.display  = '';
}

/**
 * Envoie l'email de réinitialisation de mot de passe à l'adresse
 * saisie, via la fonctionnalité native de Supabase Auth (le serveur
 * SMTP réellement utilisé — Brevo — est configuré côté dashboard
 * Supabase, rien à faire ici).
 * @returns {Promise<void>}
 */
async function requestPasswordReset() {
  /** @type {string} */
  const email     = v('f-forgot-email').trim().toLowerCase();
  const msgEl     = el('login-forgot-msg');

  if (!email) {
    msgEl.textContent = 'Merci de saisir votre email.';
    msgEl.className   = 'login-err show';
    return;
  }

  const { error } = await _sb.auth.resetPasswordForEmail(email, {
    redirectTo: window.location.origin + window.location.pathname,
  });

  // Message volontairement identique en succès ou en échec côté
  // Supabase (même s'il n'existe pas de compte à cet email) — pour
  // ne jamais permettre à quelqu'un de deviner quels emails sont
  // enregistrés dans l'appli (voir faille XSS/énumération de l'audit,
  // même principe de prudence).
  void error;
  msgEl.textContent = 'Si un compte existe avec cet email, un lien de réinitialisation vient d\'être envoyé.';
  msgEl.className   = 'login-ok show';
}

/**
 * Valide le nouveau mot de passe saisi après un clic sur le lien de
 * réinitialisation reçu par email, et termine le flux de récupération.
 * @returns {Promise<void>}
 */
async function confirmPasswordReset() {
  /** @type {string} */
  const newPassword = v('f-reset-pass');
  /** @type {string} */
  const confirmPassword = v('f-reset-pass-confirm');
  const msgEl = el('login-reset-msg');

  if (!newPassword || newPassword.length < 10) {
    msgEl.textContent = 'Le mot de passe doit contenir au moins 10 caractères.';
    msgEl.className   = 'login-err show';
    return;
  }
  if (newPassword !== confirmPassword) {
    msgEl.textContent = 'Les deux mots de passe ne correspondent pas.';
    msgEl.className   = 'login-err show';
    return;
  }

  const { error } = await _sb.auth.updateUser({ password: newPassword });
  if (error) {
    msgEl.textContent = 'Erreur : ' + error.message;
    msgEl.className   = 'login-err show';
    return;
  }

  // Nettoie le fragment d'URL (#access_token=...&type=recovery) pour
  // ne pas laisser le jeton visible/réutilisable dans la barre d'adresse.
  history.replaceState(null, '', window.location.pathname);

  await _sb.auth.signOut();
  sv('f-reset-pass', '');
  sv('f-reset-pass-confirm', '');
  showToast('Mot de passe mis à jour — vous pouvez vous reconnecter.', 'success');
  showLoginForm();
}

// ─────────────────────────────────────────────
// 7. CONTRÔLE D'ACCÈS — inchangé
// ─────────────────────────────────────────────

/**
 * Vérifie si l'utilisateur connecté possède une permission donnée.
 * @param {PermissionId} permissionId
 * @returns {boolean|0|undefined}
 */
function hasPerm(permissionId) {
  return CU && (CU.role === 'admin' || CU.perms[permissionId]);
}

// ─────────────────────────────────────────────
// 8. HELPERS CHAMP MOT DE PASSE — inchangé
// ─────────────────────────────────────────────

/**
 * Bascule la visibilité d'un champ mot de passe et met à jour l'icône.
 * @param {string} inputId
 * @param {HTMLElement} toggleButton
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
