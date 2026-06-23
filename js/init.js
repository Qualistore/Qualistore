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

  _checkSessionOnLoad();

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
 * Sauvegarde automatiquement l'audit en cours si l'utilisateur
 * ferme ou recharge la page pendant une saisie.
 * @returns {void}
 */
function _bindBeforeUnloadPause() {
  window.addEventListener('beforeunload', () => {
    if (auditStep === 1)  pauseAudit();
    else if (qaStep === 2) pauseQualAudit();
  });
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
