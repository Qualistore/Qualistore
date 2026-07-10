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
// ⚠️ CHANGÉ (v3) : le lien de réinitialisation ne consomme plus le
// jeton à usage unique dès son premier chargement. Avec le lien par
// défaut de Supabase (qui vérifie le jeton côté serveur AVANT même
// d'afficher votre page), les scanners de sécurité des messageries
// (Gmail, Brevo qui réécrit tous les liens pour son suivi de clics,
// filtres anti-spam d'entreprise...) "cliquent" automatiquement le
// lien pour l'analyser — ce qui grille le jeton avant que
// l'utilisateur ne clique lui-même, d'où l'erreur "Email link is
// invalid or has expired" observée même sur un lien tout juste reçu.
// Désormais, le lien pointe directement vers cette page avec un
// jeton brut (token_hash) qui n'est envoyé à Supabase pour
// vérification qu'au moment où l'utilisateur clique explicitement
// sur "Valider le nouveau mot de passe" (voir confirmPasswordReset).
// Un simple chargement de page (par un scanner) ne consomme plus rien.
// ⚠️ Le template d'email "Reset Password" côté Supabase Dashboard
// (Authentication → Email Templates) doit être mis à jour en
// conséquence — voir les instructions fournies séparément.
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
// 3. DÉTECTION DU LIEN DE RÉCUPÉRATION DE MOT DE PASSE
// ⚠️ CHANGÉ (v3, voir bandeau d'en-tête) : on ne dépend plus de
// l'événement automatique PASSWORD_RECOVERY de supabase-js (qui ne se
// déclenche que si le lien contient déjà un access_token — ce qui
// signifiait que le jeton avait déjà été vérifié côté serveur avant
// même d'arriver ici). Le lien contient maintenant un token_hash brut,
// pas encore vérifié — c'est _checkSessionOnLoad qui détecte sa
// présence et affiche le formulaire, et confirmPasswordReset qui
// déclenche la vérification réelle, uniquement au clic utilisateur.
// ─────────────────────────────────────────────

/**
 * Indique si la page vient d'être ouverte via un lien de
 * réinitialisation de mot de passe (contient un token_hash et
 * type=recovery dans le fragment d'URL — voir le template d'email
 * "Reset Password" côté Supabase Dashboard).
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
 * dans ce cas, c'est le formulaire de nouveau mot de passe qui prend
 * la main, pas une connexion normale ; le jeton n'est pas encore
 * vérifié à ce stade (voir confirmPasswordReset).
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
 * Affiche le formulaire "choisir un nouveau mot de passe", déclenché
 * quand la page est ouverte via un lien de réinitialisation reçu par
 * email (voir _isPasswordRecoveryFlow, appelé depuis _checkSessionOnLoad).
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
  msgEl.textContent = "Si un compte existe avec cet email, un lien de réinitialisation vient d'être envoyé.";
  msgEl.className   = 'login-ok show';
}

/**
 * Valide le nouveau mot de passe saisi après un clic sur le lien de
 * réinitialisation reçu par email, et termine le flux de récupération.
 *
 * ⚠️ CHANGÉ (v3, voir bandeau d'en-tête) : le jeton à usage unique
 * (token_hash) n'est envoyé à Supabase pour vérification (verifyOtp)
 * qu'ICI, au clic explicite de l'utilisateur — jamais automatiquement
 * au chargement de la page. C'est ce qui protège contre les scanners
 * de sécurité des messageries qui "pré-cliquent" les liens des emails.
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

  // Nettoie le fragment d'URL (#token_hash=...&type=recovery) pour
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
