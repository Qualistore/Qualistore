/** @type {number} Durée d'inactivité (ms) avant expiration de session. */
const SESSION_TIMEOUT_MS  = 10 * 60 * 1000; // 10 minutes
/** @type {string} Clé localStorage de l'utilisateur courant (alignée avec storage.js : 'fsqs_cu'). */
const LS_KEY_CURRENT_USER = 'fsqs_cu';
/** @type {string} Clé localStorage de l'horodatage de dernière activité. */
const LS_KEY_LAST_ACTIVITY = 'fsqs_last_activity';

/** @type {ReturnType<typeof setTimeout> | null} Identifiant du timer d'inactivité courant. */
let _sessionTimer = null;

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
  navigate('dashboard');
}

function _resetSessionTimer() {
  if (_sessionTimer) clearTimeout(_sessionTimer);

  _sessionTimer = setTimeout(() => {
    doLogout();
    showToast('Session expirée — veuillez vous reconnecter.', 'warning');
  }, SESSION_TIMEOUT_MS);

  localStorage.setItem(LS_KEY_LAST_ACTIVITY, Date.now());
}