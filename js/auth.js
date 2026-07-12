// ══════════════════════════════════════════════════════════════
// AUTH — Authentification et gestion de session
// ⚠️ NOM DE FICHIER : enregistrez ce fichier sous le nom "auth.js"
// dans votre projet (remplace l'ancien auth.js).
//
// Dépend de : storage.js (DB, CU), supabase.js (_sb), ui.js
//   (buildSidebar, updateSBUser, navigate, showToast)
//
// ⚠️ CHANGÉ (v4) — comptes sans email :
//   - Les salariés sans adresse email pro se voient attribuer un
//     identifiant interne (ex : 'jean.dupont.a1b2') relié en
//     coulisses à une adresse technique invisible
//     ('...@qualistore.local', voir INTERNAL_EMAIL_DOMAIN) —
//     jamais une vraie boîte mail. doLogin() ajoute automatiquement
//     ce suffixe si la personne tape juste son identifiant sans '@'.
//   - Ces comptes sont créés avec un mot de passe temporaire généré
//     par l'admin (voir la Edge Function invite-user, mode "sans
//     email") et doivent le changer à la toute première connexion
//     (profiles.must_change_password) — géré par
//     _showForcedPasswordChangeForm / confirmForcedPasswordChange.
//   - Nouveau, pour tout le monde (email ou non) : changement de
//     mot de passe volontaire à tout moment une fois connecté, via
//     openChangePasswordModal / submitChangePassword (bouton dans la
//     barre latérale, au-dessus de Déconnexion).
//
// (Historique des changements précédents conservé plus bas dans le
// fichier, sur les fonctions concernées, pour ne rien perdre du
// contexte déjà en place : Supabase Auth, email réel, réinitialisation
// de mot de passe sans faille de pré-chargement de lien, session non
// falsifiable.)
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
 * auth.users par le même id).
 * @typedef {Object} User
 * @property {string} id - Référence vers auth.users.id (uuid Supabase).
 * @property {string} nom
 * @property {string} login - Email réel OU adresse technique interne (voir INTERNAL_EMAIL_DOMAIN) de l'utilisateur.
 * @property {'admin'|'fsqs'|'directeur'|'direction'|'collaborateur'} role
 * @property {'actif'|'inactif'|'invitation'|string} statut - Seule la valeur 'actif' autorise la connexion.
 * @property {string[]} magasins
 * @property {UserPerms} perms
 * @property {boolean} [must_change_password] - Si true, un changement de mot de passe est imposé avant tout accès à l'appli.
 */

// ─────────────────────────────────────────────
// 1. CONSTANTES
// ─────────────────────────────────────────────

/** @type {number} Durée d'inactivité (ms) avant expiration de session. */
const SESSION_TIMEOUT_MS = 10 * 60 * 1000; // 10 minutes

/** @type {string} Domaine technique des comptes sans email réel — jamais une vraie boîte mail. Doit rester identique à INTERNAL_EMAIL_DOMAIN côté Edge Function invite-user. */
const INTERNAL_EMAIL_DOMAIN = 'qualistore.local';

// ─────────────────────────────────────────────
// 2. ÉTAT
// ─────────────────────────────────────────────

/** @type {ReturnType<typeof setTimeout> | null} Identifiant du timer d'inactivité courant. */
let _sessionTimer = null;

// ─────────────────────────────────────────────
// 3. DÉTECTION DU LIEN DE RÉCUPÉRATION (conservé, inoffensif — ce
// flux se déroule sur reset-password.html, pas ici.)
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
 * existe déjà, et recharge le profil complet dans CU le cas échéant.
 * Si un changement de mot de passe est imposé (must_change_password),
 * affiche ce formulaire au lieu d'entrer dans l'appli.
 * @returns {Promise<void>}
 */
async function _checkSessionOnLoad() {
  if (_isPasswordRecoveryFlow()) {
    _showPasswordRecoveryForm();
    return;
  }

  // ⚠️ CORRIGÉ : _sb.auth.getSession() peut renvoyer une session vide
  // si le SDK Supabase n'a pas encore fini de lire le jeton persisté
  // depuis le stockage local au moment de l'appel — createClient()
  // lance cette lecture en arrière-plan de façon asynchrone, et rien
  // ne garantit qu'elle soit terminée au moment où _checkSessionOnLoad()
  // s'exécute (appelée le plus tôt possible au chargement de la page,
  // voir init.js). C'est le scénario classique "toujours déconnecté
  // après un rafraîchissement alors que persistSession est activé".
  // On attend désormais l'évènement 'INITIAL_SESSION' (déclenché une
  // fois cette lecture terminée, garanti de refléter fidèlement le
  // jeton réellement stocké) plutôt que d'appeler getSession()
  // directement — pattern documenté par Supabase pour ce cas précis.
  /** @type {{ data: { session: Object|null } }} */
  const { data: { session } } = await new Promise(resolve => {
    /** @type {{ data: { subscription: Object } }} */
    const { data: { subscription } } = _sb.auth.onAuthStateChange((event, initialSession) => {
      if (event !== 'INITIAL_SESSION') return;
      subscription.unsubscribe();
      resolve({ data: { session: initialSession } });
    });
  });
  if (!session) { CU = null; return; }

  /** @type {User | null} */
  const profile = await _fetchProfile(session.user.id);
  if (!profile || profile.statut !== 'actif') {
    await _sb.auth.signOut();
    CU = null;
    return;
  }

  if (profile.must_change_password) {
    _showForcedPasswordChangeForm();
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
 * 'f-login' / 'f-pass', via Supabase Auth. Le champ 'f-login'
 * accepte soit un email réel, soit un simple identifiant interne
 * (ex : 'jean.dupont.a1b2') — dans ce second cas, le domaine
 * technique @qualistore.local est ajouté automatiquement avant
 * l'appel à Supabase (la personne n'a jamais besoin de le connaître
 * ni de le taper).
 * @returns {Promise<void>}
 */
async function doLogin() {
  /** @type {string} */
  let email = v('f-login').trim().toLowerCase();
  if (email && !email.includes('@')) {
    email = `${email}@${INTERNAL_EMAIL_DOMAIN}`;
  }
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

  if (profile.must_change_password) {
    _showForcedPasswordChangeForm();
    return;
  }

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
// 6. MOT DE PASSE OUBLIÉ (par email — inchangé)
// ─────────────────────────────────────────────

/**
 * Affiche le formulaire "mot de passe oublié" à la place du
 * formulaire de connexion normal.
 * @returns {void}
 */
function showForgotPasswordForm() {
  el('login-form').style.display     = 'none';
  el('login-forgot').style.display   = '';
  el('login-reset').style.display    = 'none';
  el('login-forcepass').style.display = 'none';
  el('login-err').classList.remove('show');
}

/**
 * Revient au formulaire de connexion normal.
 * @returns {void}
 */
function showLoginForm() {
  el('login-form').style.display      = '';
  el('login-forgot').style.display    = 'none';
  el('login-reset').style.display     = 'none';
  el('login-forcepass').style.display = 'none';
}

/**
 * Affiche le formulaire "choisir un nouveau mot de passe" déclenché
 * par un lien de réinitialisation reçu par email. Conservée mais
 * normalement inatteignable désormais (ce flux se déroule sur
 * reset-password.html).
 * @returns {void}
 */
function _showPasswordRecoveryForm() {
  el('login-screen').style.display    = '';
  el('app').classList.remove('on');
  el('login-form').style.display      = 'none';
  el('login-forgot').style.display    = 'none';
  el('login-reset').style.display     = '';
  el('login-forcepass').style.display = 'none';
}

/**
 * Envoie l'email de réinitialisation de mot de passe, en redirigeant
 * vers la page autonome reset-password.html (voir ce fichier pour
 * l'explication de la protection contre le pré-chargement de liens).
 * @returns {Promise<void>}
 */
async function requestPasswordReset() {
  /** @type {string} */
  const email = v('f-forgot-email').trim().toLowerCase();
  const msgEl = el('login-forgot-msg');

  if (!email) {
    msgEl.textContent = 'Merci de saisir votre email.';
    msgEl.className   = 'login-err show';
    return;
  }

  /** @type {string} */
  const currentDir = window.location.pathname.replace(/[^/]*$/, '');
  /** @type {string} */
  const resetPageUrl = window.location.origin + currentDir + 'reset-password.html';

  const { error } = await _sb.auth.resetPasswordForEmail(email, { redirectTo: resetPageUrl });

  void error; // message volontairement identique en succès/échec (anti-énumération)
  msgEl.textContent = "Si un compte existe avec cet email, un lien de réinitialisation vient d'être envoyé.";
  msgEl.className   = 'login-ok show';
}

/**
 * Valide le nouveau mot de passe saisi après un clic sur le lien de
 * réinitialisation reçu par email. Conservée mais normalement
 * inatteignable désormais (ce flux se déroule sur reset-password.html).
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
// 7. CHANGEMENT DE MOT DE PASSE FORCÉ (première connexion, comptes
// créés sans email avec un mot de passe temporaire — voir
// profiles.must_change_password)
// ─────────────────────────────────────────────

/**
 * Affiche le panneau "vous devez changer votre mot de passe",
 * déclenché par doLogin()/_checkSessionOnLoad() quand
 * profile.must_change_password est vrai.
 * @returns {void}
 */
function _showForcedPasswordChangeForm() {
  el('login-screen').style.display    = '';
  el('app').classList.remove('on');
  el('login-form').style.display      = 'none';
  el('login-forgot').style.display    = 'none';
  el('login-reset').style.display     = 'none';
  el('login-forcepass').style.display = '';
}

/**
 * Valide et applique le nouveau mot de passe choisi lors d'un
 * changement forcé, puis lève l'obligation (clear_must_change_password)
 * et poursuit normalement la connexion.
 * @returns {Promise<void>}
 */
async function confirmForcedPasswordChange() {
  /** @type {string} */
  const newPassword = v('f-forcepass-new');
  /** @type {string} */
  const confirmPassword = v('f-forcepass-confirm');
  const msgEl = el('login-forcepass-msg');

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

  const { error: rpcError } = await _sb.rpc('clear_must_change_password');
  if (rpcError) {
    msgEl.textContent = 'Erreur : ' + rpcError.message;
    msgEl.className   = 'login-err show';
    return;
  }

  /** @type {{ data: { session: Object|null } }} */
  const { data: { session } } = await _sb.auth.getSession();
  /** @type {User | null} */
  const profile = await _fetchProfile(session.user.id);

  sv('f-forcepass-new', '');
  sv('f-forcepass-confirm', '');

  CU = profile;
  _resetSessionTimer();

  el('login-screen').style.display = 'none';
  el('app').classList.add('on');
  buildSidebar();
  updateSBUser();
  navigate('dashboard');
  showToast('Mot de passe mis à jour.', 'success');
}

// ─────────────────────────────────────────────
// 8. CHANGEMENT DE MOT DE PASSE VOLONTAIRE (à tout moment, une fois
// connecté — bouton dans la barre latérale, au-dessus de Déconnexion)
// ─────────────────────────────────────────────

/**
 * Ouvre la modale de changement de mot de passe volontaire.
 * @returns {void}
 */
function openChangePasswordModal() {
  sv('cp-new', '');
  sv('cp-confirm', '');
  el('cp-err').classList.remove('show');
  openModal('m-change-pass');
}

/**
 * Valide et applique le nouveau mot de passe (utilisateur déjà
 * connecté, aucun jeton nécessaire — la session active suffit).
 * @returns {Promise<void>}
 */
async function submitChangePassword() {
  /** @type {string} */
  const newPassword = v('cp-new');
  /** @type {string} */
  const confirmPassword = v('cp-confirm');
  const errorEl = el('cp-err');

  if (!newPassword || newPassword.length < 10) {
    errorEl.textContent = 'Le mot de passe doit contenir au moins 10 caractères.';
    errorEl.classList.add('show');
    return;
  }
  if (newPassword !== confirmPassword) {
    errorEl.textContent = 'Les deux mots de passe ne correspondent pas.';
    errorEl.classList.add('show');
    return;
  }

  const { error } = await _sb.auth.updateUser({ password: newPassword });
  if (error) {
    errorEl.textContent = 'Erreur : ' + error.message;
    errorEl.classList.add('show');
    return;
  }

  closeModal('m-change-pass');
  showToast('Mot de passe mis à jour.', 'success');
}

// ─────────────────────────────────────────────
// 9. CONTRÔLE D'ACCÈS — inchangé
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
// 10. HELPERS CHAMP MOT DE PASSE — inchangé
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
