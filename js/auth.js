// ══════════════════════════════════════════════════════════════
// AUTH — Authentification et gestion de session
// ⚠️ NOM DE FICHIER : enregistrez ce fichier sous le nom "auth.js"
// dans votre projet (il remplace l'ancien auth.js) — je n'ai pas pu
// réutiliser ce nom exact ici suite à une limitation technique de
// cette session, sans lien avec le contenu du fichier lui-même.
//
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
// ⚠️ CHANGÉ (v3) : la finalisation de la réinitialisation (choix du
// nouveau mot de passe) se fait désormais sur une page séparée et
// autonome, reset-password.html — PAS sur cette page. Raison : le
// lien de récupération par défaut de Supabase consomme le jeton à
// usage unique dès son premier chargement (avant même que
// l'utilisateur ne clique), ce qui le grille quand un scanner de
// sécurité de messagerie (Gmail, le suivi de clics de Brevo...)
// pré-charge le lien automatiquement. reset-password.html ne
// consomme le jeton qu'au clic explicite sur "Valider" — voir ce
// fichier pour le détail. requestPasswordReset() ci-dessous pointe
// donc désormais vers cette page dédiée plutôt que vers la page
// courante.
// Les fonctions _isPasswordRecoveryFlow / _showPasswordRecoveryForm /
// confirmPasswordReset restent définies plus bas (inoffensives,
// jamais déclenchées désormais que le lien ne pointe plus ici) —
// conservées telles quelles pour ne rien retirer sans votre accord.
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
// 3. DÉTECTION DU LIEN DE RÉCUPÉRATION (conservé, inoffensif —
// voir bandeau d'en-tête : ce flux se déroule maintenant sur
// reset-password.html, pas ici. Ces fonctions ne sont donc plus
// jamais déclenchées en pratique, mais laissées telles quelles.)
// ─────────────────────────────────────────────

/**
 * Indique si la page vient d'être ouverte via un lien de
 * réinitialisation de mot de passe (contient un token_hash et
 * type=recovery dans le fragment d'URL).
 * @returns {boolean}
 */
function _isPasswordRecoveryFlow() {
  return window.location.hash.includes('type=recovery') && window.location.hash.includes('token_hash=');
}

/**
 * Extrait le token_hash brut du fragment d'URL, si présent.
 * @returns {string|null}
 */
function _getRecoveryTokenHash() {
  /** @type {URLSearchParams} */
  const params = new URLSearchParams(window.location.hash.slice(1));
  return params.get('token_hash');
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
 * cas normalement inatteignable désormais (voir bandeau d'en-tête),
 * conservé par prudence.
 * @returns {Promise<void>}
 */
async function _checkSessionOnLoad() {
  if (_isPasswordRecoveryFlow()) {
    _showPasswordRecoveryForm();
    return;
  }

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
 * Affiche le formulaire "choisir un nouveau mot de passe". Conservé
 * mais normalement inatteignable désormais (voir bandeau d'en-tête :
 * ce flux se déroule sur reset-password.html).
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
 *
 * ⚠️ CHANGÉ (v3, voir bandeau d'en-tête) : redirige désormais vers la
 * page autonome reset-password.html (dans le même dossier que la
 * page courante, qu'il s'agisse de index.html ou Qualistore.html —
 * calculé dynamiquement, aucune URL en dur), plutôt que vers la page
 * courante elle-même.
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

  /** @type {string} Dossier de la page courante (avec / final), quelle
   * que soit la page depuis laquelle la demande est faite. */
  const currentDir = window.location.pathname.replace(/[^/]*$/, '');
  /** @type {string} */
  const resetPageUrl = window.location.origin + currentDir + 'reset-password.html';

  const { error } = await _sb.auth.resetPasswordForEmail(email, {
    redirectTo: resetPageUrl,
  });

  // Message volontairement identique en succès ou en échec côté
  // Supabase (même s'il n'existe pas de compte à cet email) — pour
  // ne jamais permettre à quelqu'un de deviner quels emails sont
  // enregistrés dans l'appli (voir faille XSS/énumération de l'audit,
  // même principe de prudence).
  void error;
  msgEl.textContent = "Si un compte existe avec cet email, un lien de réinitialisation vient d'être envoyé.";
  msgEl.className   = 'login-ok show';
}

/**
 * Valide le nouveau mot de passe saisi après un clic sur le lien de
 * réinitialisation reçu par email. Conservée mais normalement
 * inatteignable désormais (voir bandeau d'en-tête : ce flux se
 * déroule sur reset-password.html).
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

  /** @type {string|null} */
  const tokenHash = _getRecoveryTokenHash();
  if (!tokenHash) {
    msgEl.textContent = 'Lien invalide — merci de redemander une réinitialisation.';
    msgEl.className   = 'login-err show';
    return;
  }

  const { error: verifyError } = await _sb.auth.verifyOtp({ token_hash: tokenHash, type: 'recovery' });
  if (verifyError) {
    msgEl.textContent = 'Ce lien a expiré ou a déjà été utilisé — merci de redemander une réinitialisation.';
    msgEl.className   = 'login-err show';
    return;
  }

  const { error } = await _sb.auth.updateUser({ password: newPassword });
  if (error) {
    msgEl.textContent = 'Erreur : ' + error.message;
    msgEl.className   = 'login-err show';
    return;
  }

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
