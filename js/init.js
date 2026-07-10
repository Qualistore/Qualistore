// ══════════════════════════════════════════════════════════════
// INIT — Point d'entrée de l'application
// Responsabilité : orchestrer le démarrage et lier les événements globaux.
// Dépend de : storage.js, auth.js, ui.js, audits.js, audit-qualimetre.js
// ══════════════════════════════════════════════════════════════

// ─────────────────────────────────────────────
// 0. NOTE JSDoc (pour inférence VSCode / TypeScript)
//    Ce fichier est un orchestrateur pur, sans structure de donnée
//    métier propre. Il référence cependant une variable globale
//    externe non déclarée dans les fichiers fournis jusqu'ici :
//    `qaStep` (probablement l'équivalent de `auditStep` — voir
//    audits.js — pour le wizard Qualimètre, déclarée dans un fichier
//    audit-qualimetre.js non fourni). Typée par déduction d'usage
//    ci-dessous sans certitude sur son origine exacte.
// ─────────────────────────────────────────────

/**
 * Point d'entrée : charge la DB, restaure la session, construit
 * l'UI initiale et lie les écouteurs globaux de l'application.
 * @param {Event} _event - Événement DOM 'DOMContentLoaded' (non utilisé).
 * @returns {Promise<void>}
 */
document.addEventListener('DOMContentLoaded', async () => {
  _clearAppCaches();

  try {
    await loadDB();
  } catch (error) {
    console.warn('loadDB error:', error);
  }

  await _checkSessionOnLoad();

  if (CU) {
    el('login-screen').style.display = 'none';
    el('app').classList.add('on');
  }

  buildSidebar();
  updateSBUser();
  initQualimetreGlobal();
  navigate('dashboard');

  _bindModalOverlayClose();
  _bindBeforeUnloadPause();
  _bindVisibilityChangePause();
  _bindPeriodicAuditAutosave();
  _bindActivityTracking();
});

// ─────────────────────────────────────────────
// HELPERS D'INITIALISATION
// ─────────────────────────────────────────────

/**
 * Vide les caches navigateur (JS/CSS) pour forcer la mise à jour des assets.
 * @returns {void}
 */
function _clearAppCaches() {
  if (!('caches' in window)) return;
  caches.keys().then(keys => keys.forEach(key => caches.delete(key)));
}

/**
 * Ferme les modals en cliquant sur l'overlay,
 * sauf si un audit est en cours (pause automatique à la place).
 * @returns {void}
 */
function _bindModalOverlayClose() {
  document.querySelectorAll('.modal-ov').forEach(overlay => {
    /** @param {MouseEvent} event */
    overlay.addEventListener('click', event => {
      if (event.target !== overlay) return;

      if (overlay.id === 'm-audit' && auditStep === 1) {
        pauseAudit();
      } else if (overlay.id === 'm-qual-audit' && qaStep === 2) {
        pauseQualAudit();
      } else {
        overlay.classList.remove('open');
      }
    });
  });
}

/**
 * Sauvegarde automatiquement l'audit en cours si l'utilisateur ferme
 * ou recharge la page pendant une saisie.
 *
 * ⚠️ CORRIGÉ : appelait auparavant pauseAudit() (audits.js), qui est
 * une fonction ASYNC — elle attend (await) la fin des envois de
 * photos en cours (_pendingPhotoUploads) avant de sauvegarder le
 * brouillon. Rien ne garantit qu'un `await` se termine dans un
 * handler 'beforeunload' avant que la page ne se ferme réellement :
 * si une photo était encore en cours d'envoi au moment de la
 * fermeture — précisément le cas le plus probable, un utilisateur
 * pressé refermant l'onglet juste après avoir pris une photo — le
 * brouillon (donc TOUTES les réponses déjà saisies, pas seulement la
 * photo) pouvait ne jamais être sauvegardé. On appelle donc
 * directement la fonction de snapshot, synchrone, sans rien attendre.
 * @returns {void}
 */
function _bindBeforeUnloadPause() {
  window.addEventListener('beforeunload', () => {
    if (auditStep === 1)   _snapshotCurrentAuditAsDraft();
    else if (qaStep === 2) _snapshotCurrentQaAuditAsDraft();
  });
}

/**
 * ⚠️ AJOUTÉ : sauvegarde le brouillon d'audit en cours dès que
 * l'onglet passe en arrière-plan (verrouillage du téléphone,
 * changement d'application, bascule d'onglet...), pas seulement à la
 * fermeture. 'beforeunload' n'est PAS fiable sur mobile — un onglet
 * mis en arrière-plan peut être déchargé directement par l'OS pour
 * libérer de la mémoire, sans jamais déclencher 'beforeunload'.
 * 'visibilitychange' vers 'hidden' est le signal recommandé (Page
 * Lifecycle API) pour ne rien perdre dans ce cas. N'interrompt rien
 * pour l'utilisateur (pas de fermeture de modale, pas de message) :
 * uniquement une sauvegarde silencieuse.
 * @returns {void}
 */
function _bindVisibilityChangePause() {
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState !== 'hidden') return;
    if (auditStep === 1)   _snapshotCurrentAuditAsDraft();
    else if (qaStep === 2) _snapshotCurrentQaAuditAsDraft();
  });
}

/**
 * ⚠️ AJOUTÉ : dernier filet de sécurité, sauvegarde silencieusement le
 * brouillon d'audit en cours toutes les 30 secondes — en plus des
 * sauvegardes déclenchées par un événement (pause manuelle, onglet en
 * arrière-plan, fermeture). Couvre les cas qu'aucun événement ne peut
 * capter (plantage brutal du navigateur, processus tué par l'OS avant
 * qu'un événement n'ait pu se déclencher, etc.). Sans effet si aucun
 * audit n'est en cours (auditStep/qaStep à leur valeur de repos).
 * @returns {void}
 */
function _bindPeriodicAuditAutosave() {
  setInterval(() => {
    if (auditStep === 1)   _snapshotCurrentAuditAsDraft();
    else if (qaStep === 2) _snapshotCurrentQaAuditAsDraft();
  }, 30_000);
}

/**
 * Réinitialise le timer de session à chaque interaction utilisateur.
 * Utilise { passive: true } pour ne pas bloquer le rendu.
 * @returns {void}
 */
function _bindActivityTracking() {
  /** @type {string[]} */
  const activityEvents = ['click', 'keydown', 'touchstart', 'mousemove'];
  activityEvents.forEach(eventName => {
    document.addEventListener(
      eventName,
      () => { if (CU) _resetSessionTimer(); },
      { passive: true }
    );
  });
}
