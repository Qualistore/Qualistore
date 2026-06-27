// ══════════════════════════════════════════════════════════════
// AUDITS — Gestion des audits FSQS (liste, création, brouillons)
// Dépend de : storage.js (DB, CU), auth.js (hasPerm), ui.js
//   (el, v, sv, populateMagSelect, populateRayonSelect), grille.js,
//   rayons.js (getKnownRayons, chargé avant ce fichier)
// ══════════════════════════════════════════════════════════════

// ─────────────────────────────────────────────
// 0. TYPEDEFS JSDoc (pour inférence VSCode / TypeScript)
//    ⚠️ Déduits de l'usage dans ce fichier. Ce fichier est la
//    source la plus fiable pour Audit/NC/Action/Draft car il les
//    CONSTRUIT (submitAudit, pauseAudit), pas seulement ne les lit pas.
//
//    ⚠️ INCOHÉRENCE DÉTECTÉE : config.js (GRILLE_BASE_COMMUNE) ne
//    présente que 2 valeurs de criticité ('Majeure'|'Critique'), mais
//    nc.js référence aussi 'Mineure' (NC_CRIT_COLORS). Le typedef
//    GrilleCriticite posé dans config.js est donc probablement
//    incomplet — à corriger si vous le souhaitez (non modifié ici
//    pour ne pas toucher un autre fichier sans votre accord).
// ─────────────────────────────────────────────

/**
 * Point de contrôle de grille (voir config.js pour la définition
 * canonique). Rappelé ici car directement consommé par getGrille().
 * @typedef {Object} GrillePoint
 * @property {string} id
 * @property {string} cat
 * @property {string} q
 * @property {string} prec
 * @property {number} p
 * @property {string} c - Criticité. Voir avertissement ci-dessus sur l'union réelle des valeurs.
 */

/**
 * Magasin. Rappelé ici car consommé via DB.magasins.find(); voir
 * magasins.js pour la définition canonique complète.
 * @typedef {Object} Magasin
 * @property {string} id
 * @property {string} nom
 * @property {string} statut
 */

/**
 * Code de réponse à un point de contrôle d'audit.
 * @typedef {'C'|'NC'|'NA'} AuditAnswerCode
 */

/**
 * Réponse enregistrée pour un point de contrôle, indexée par
 * GrillePoint.id dans Audit.answers / Draft.answers.
 * @typedef {Object} AuditAnswer
 * @property {string} q - Intitulé du point de contrôle, copié depuis GrillePoint.q au moment de la création.
 * @property {AuditAnswerCode | null} rep - Réponse sélectionnée ; null si pas encore répondu.
 * @property {string} cmt - Commentaire NC, chaîne vide par défaut.
 * @property {string[]} photos - URLs des photos jointes (Supabase Storage), tableau vide par défaut.
 * @property {string} [note] - Note additionnelle. Jamais écrite dans ce fichier — TODO TYPE : alimentée par un autre flux non observé ici (édition post-audit ?).
 */

/**
 * Audit FSQS, tel que construit par submitAudit().
 * @typedef {Object} Audit
 * @property {string} id - Préfixé 'AUD-' + uid().
 * @property {string} mid - Référence vers Magasin.id.
 * @property {string} mag - Nom du magasin au moment de l'audit (copie figée, pas une référence live).
 * @property {string} rayon - Nom du rayon audité (clé utilisée par getGrille()).
 * @property {string} date
 * @property {string} aud - Nom de l'auditeur (copié depuis CU.nom au moment de la création).
 * @property {string} cmt - Commentaire général, chaîne vide possible.
 * @property {number} score - Score pondéré 0-100 (100 si aucun point pertinent noté).
 * @property {number} nc - Nombre de points non conformes détectés.
 * @property {'Conforme'|'Non conforme'} statut
 * @property {Record<string, AuditAnswer>} answers - Réponses indexées par GrillePoint.id.
 */

/**
 * Non-conformité (NC), créée automatiquement à la soumission d'un
 * audit pour chaque point répondu 'NC'.
 * @typedef {Object} NC
 * @property {string} id - Préfixé 'NC-' + uid().
 * @property {string} mid - Référence vers Magasin.id.
 * @property {string} mag - Nom du magasin (copie figée).
 * @property {string} rayon
 * @property {string} date - Date de l'audit d'origine.
 * @property {string} desc - Intitulé du point de contrôle (copié depuis GrillePoint.q).
 * @property {string} crit - Criticité (copiée depuis GrillePoint.c).
 * @property {string} resp - Nom du responsable (copié depuis l'auditeur).
 * @property {string} dl - Date d'échéance (deadline).
 * @property {'Ouverte'|'En cours'|'Clôturée'} statut
 * @property {string} [cmt] - Commentaire de suivi/clôture.
 * @property {string} aid - Référence polymorphe vers Audit.id (ou Alerte.id si isAlert, voir actions.js).
 * @property {boolean} [isAlert] - Vrai si la NC provient d'une alerte terrain plutôt que d'un audit planifié (non observé dans ce fichier, voir actions.js).
 * @property {string | null} [closedDate] - Date de clôture, null après réouverture (voir nc.js).
 */

/**
 * Action corrective, créée automatiquement en miroir de chaque NC
 * issue d'un audit.
 * @typedef {Object} Action
 * @property {string} id - Préfixé 'AC-' + uid().
 * @property {string} ncId - Référence vers NC.id.
 * @property {string} desc - Intitulé du point de contrôle (copié depuis GrillePoint.q).
 * @property {string} mag - Nom du magasin (copie figée), ou 'Alerte terrain' (voir actions.js).
 * @property {string} resp - Nom du responsable.
 * @property {string} ech - Date d'échéance.
 * @property {string} prio - Priorité, copiée depuis GrillePoint.c (donc alignée sur la criticité de la NC d'origine).
 * @property {'Ouverte'|'En cours'|'Traitée'} statut
 * @property {string} [cmt] - Commentaire de suivi.
 */

/**
 * Brouillon d'audit en cours de saisie, sauvegardable et reprenable.
 * @typedef {Object} Draft
 * @property {string} id - Préfixé 'DRF-' + uid().
 * @property {string} mid
 * @property {string} mag - Nom du magasin (copie figée).
 * @property {string} rayon
 * @property {string} date
 * @property {string} aud
 * @property {string} cmt
 * @property {Record<string, AuditAnswer>} answers
 * @property {string} createdAt - Date de création/dernière sauvegarde du brouillon (format produit par today()).
 * @property {string} uid - Référence vers User.id du créateur (PAS le même 'uid' que la fonction génératrice d'identifiants).
 * @property {'qualimetre'|string} [type] - Type de brouillon ; lu dans ce fichier (_buildDraftRow) mais jamais écrit ici — probablement renseigné par qualimetre.js (non fourni).
 */

// ─────────────────────────────────────────────
// 1. CONSTANTES
// ─────────────────────────────────────────────

/** @type {number} Délai par défaut en jours pour les actions correctives créées à l'issue d'un audit. */
const AUDIT_NC_DEADLINE_DAYS = 7;

/**
 * Map de correspondance réponse → index bouton.
 * @type {Record<AuditAnswerCode, number>}
 */
const AUDIT_ANSWER_BUTTON_INDEX = { C: 0, NC: 1, NA: 2 };

// ─────────────────────────────────────────────
// 2. ÉTAT (variables de module — pas de window._xxx)
// ─────────────────────────────────────────────

/** @type {number} Étape courante du wizard de création d'audit (0 = sélection, 1 = questions, 2 = récap final). */
let auditStep    = 0;
/** @type {Record<string, AuditAnswer>} Réponses en cours de saisie, indexées par GrillePoint.id. */
let auditAnswers = {};
/** @type {Record<string, GrillePoint[]>} Points de contrôle groupés par zone (préfixe de GrillePoint.cat avant ' – '). */
let _auditZones    = {};
/** @type {string[]} Noms des zones, dans l'ordre d'apparition. */
let _auditZoneKeys = [];
/** @type {string | null} Référence vers Draft.id en cours de reprise, ou null si nouvel audit. */
let _currentDraftId = null;

// ─────────────────────────────────────────────
// 3. LISTE DES AUDITS
// ─────────────────────────────────────────────

/**
 * Affiche la liste des audits visibles pour l'utilisateur connecté,
 * filtrée par magasin et rayon selon les sélecteurs UI. Peuple les
 * deux sélecteurs depuis leurs sources dynamiques respectives (voir
 * populateMagSelect/populateRayonSelect, ui.js) — aucune liste fixe.
 * @returns {void}
 */
function renderAudits() {
  /** @type {string[]} */
  const storeIds = visibleMids();
  /** @type {string} */
  const filterMag = v('flt-aud-mag');
  /** @type {string} */
  const filterRay = v('flt-aud-ray');

  populateMagSelect(el('flt-aud-mag'));
  populateRayonSelect(el('flt-aud-ray'), true);

  /** @type {Audit[]} */
  let audits = [...DB.audits].reverse().filter(a => storeIds.includes(a.mid));
  if (filterMag) audits = audits.filter(a => a.mid   === filterMag);
  if (filterRay) audits = audits.filter(a => a.rayon === filterRay);

  el('aud-cnt').textContent = `${audits.length} audit(s)`;

  const tbody  = el('aud-tb');
  /** @type {boolean} */
  const isAdmin = CU && CU.role === 'admin';

  if (!audits.length) {
    tbody.innerHTML = `<tr><td colspan="9"><div class="empty-state">
      <i class="ti ti-clipboard-check"></i><p>Aucun audit.</p>
    </div></td></tr>`;
    return;
  }

  tbody.innerHTML = audits.map(audit => _buildAuditRow(audit, isAdmin)).join('');
}

/**
 * Construit la ligne `<tr>` HTML d'un audit dans la liste.
 * @param {Audit} audit
 * @param {boolean} isAdmin - Si vrai, affiche le bouton de suppression.
 * @returns {string}
 */
function _buildAuditRow(audit, isAdmin) {
  return `<tr>
    <td>${audit.mag}</td>
    <td style="display:flex;align-items:center;gap:6px;padding-top:14px">${rIcon(audit.rayon)} ${audit.rayon}</td>
    <td>${fd(audit.date)}</td>
    <td>${audit.aud}</td>
    <td>${sbadge(audit.score)}</td>
    <td style="color:${audit.nc > 0 ? 'var(--danger)' : 'var(--success)'};font-weight:600">${audit.nc}</td>
    <td>${statBdg(audit.statut)}</td>
    <td>
      <div class="act-btns">
        <button class="btn btn-secondary btn-sm" onclick="showAud('${audit.id}')" aria-label="Voir le détail">
          <i class="ti ti-eye"></i>
        </button>
        ${isAdmin ? `<button class="btn btn-danger btn-sm" onclick="deleteAudit('${audit.id}')" aria-label="Supprimer l'audit">
          <i class="ti ti-trash"></i>
        </button>` : ''}
      </div>
    </td>
  </tr>`;
}

// ─────────────────────────────────────────────
// 4. DÉTAIL D'UN AUDIT
// ─────────────────────────────────────────────

/**
 * Affiche la modale de détail d'un audit (en-tête, réponses
 * annotées, NC liées).
 * @param {string} auditId - Référence vers Audit.id.
 * @returns {void}
 */
function showAud(auditId) {
  /** @type {Audit | undefined} */
  const audit = DB.audits.find(a => a.id === auditId);
  if (!audit) return;

  /** @type {NC[]} */
  const linkedNcs = DB.ncs.filter(nc => nc.aid === auditId);
  el('aud-detail-body').innerHTML =
    _buildAuditDetailHeader(audit) +
    _buildAuditDetailAnswers(audit) +
    _buildAuditDetailNcs(linkedNcs);

  openModal('m-aud-detail');
}

/**
 * Construit l'en-tête de la modale de détail (informations
 * générales + score global + commentaire éventuel).
 * @param {Audit} audit
 * @returns {string}
 */
function _buildAuditDetailHeader(audit) {
  /** @type {string} */
  const scoreColor = sc(audit.score);
  /** @type {string} */
  const scoreLabel = audit.score >= 95 ? 'Excellent'
    : audit.score >= 80 ? 'Satisfaisant'
    : audit.score >= 70 ? 'À améliorer'
    : 'Non conforme';

  let html = `<div style="display:grid;grid-template-columns:1fr 1fr;gap:16px;margin-bottom:20px">
    <table style="font-size:13px">
      <tr><td class="tm" style="padding:4px 0;width:40%">N° Audit</td><td style="font-weight:600;color:var(--primary)">${audit.id}</td></tr>
      <tr><td class="tm" style="padding:4px 0">Magasin</td><td>${audit.mag}</td></tr>
      <tr><td class="tm" style="padding:4px 0">Rayon</td><td>${audit.rayon}</td></tr>
      <tr><td class="tm" style="padding:4px 0">Date</td><td>${fd(audit.date)}</td></tr>
      <tr><td class="tm" style="padding:4px 0">Auditeur</td><td>${audit.aud}</td></tr>
      <tr><td class="tm" style="padding:4px 0">Statut</td><td>${statBdg(audit.statut)}</td></tr>
    </table>
    <div style="text-align:center">
      <div style="font-size:11px;color:var(--text2);margin-bottom:8px">Score global</div>
      <div style="width:80px;height:80px;border-radius:50%;border:7px solid ${scoreColor};display:flex;align-items:center;justify-content:center;margin:0 auto 8px;font-size:20px;font-weight:700;color:${scoreColor}">${audit.score}%</div>
      <span class="score-badge ${scCls(audit.score)}">${scoreLabel}</span>
    </div>
  </div>`;

  if (audit.cmt) {
    html += `<div style="background:var(--bg);border-radius:var(--radius);padding:10px 14px;margin-bottom:16px;font-size:13px">
      <span class="tm">Commentaire général : </span>${audit.cmt}
    </div>`;
  }

  return html;
}

/**
 * Construit le bloc HTML listant les réponses d'audit annotées
 * (note, commentaire NC, ou photos), une par point de contrôle
 * concerné.
 * @param {Audit} audit
 * @returns {string} HTML, ou chaîne vide si aucune réponse annotée.
 */
function _buildAuditDetailAnswers(audit) {
  if (!audit.answers) return '';

  /** @type {AuditAnswer[]} */
  const answersWithNotes = Object.values(audit.answers).filter(a => a.note || a.cmt || a.photos?.length);
  if (!answersWithNotes.length) return '';

  return `<div style="font-size:13px;font-weight:600;margin-bottom:10px">Notes et photos par point de contrôle</div>
    ${answersWithNotes.map(answer => `
      <div style="background:var(--bg);border-radius:var(--radius);padding:10px 14px;margin-bottom:8px;border-left:3px solid ${answer.rep === 'NC' ? 'var(--danger)' : answer.rep === 'C' ? 'var(--success)' : 'var(--border)'}">
        <div style="font-size:12px;font-weight:600;margin-bottom:4px">${answer.q}</div>
        ${answer.note  ? `<div style="font-size:12px;color:var(--text2)">${answer.note}</div>` : ''}
        ${answer.cmt   ? `<div style="font-size:12px;color:var(--danger)">${answer.cmt}</div>` : ''}
        ${answer.photos?.length ? `<div style="display:flex;gap:6px;margin-top:8px;flex-wrap:wrap">
          ${answer.photos.map(p => `<img src="${p}" style="width:64px;height:64px;border-radius:7px;object-fit:cover;border:1px solid var(--border);cursor:pointer" onclick="openPhotoViewer('${p}')">`).join('')}
        </div>` : ''}
      </div>`).join('')}`;
}

/**
 * Construit le bloc HTML listant les NC liées à un audit.
 * @param {NC[]} ncs
 * @returns {string} HTML, ou chaîne vide si aucune NC.
 */
function _buildAuditDetailNcs(ncs) {
  if (!ncs.length) return '';
  return `<div style="font-size:13px;font-weight:600;margin-bottom:10px;margin-top:4px">Non-conformités (${ncs.length})</div>
    ${ncs.map(nc => `
      <div style="background:var(--danger-light);border-radius:var(--radius);padding:10px 14px;margin-bottom:8px">
        <div style="font-size:13px;font-weight:500">${nc.desc}</div>
        <div style="margin-top:4px;display:flex;gap:6px">${critBdg(nc.crit)} ${statBdg(nc.statut)}</div>
      </div>`).join('')}`;
}

// ─────────────────────────────────────────────
// 5. SUPPRESSION
// ─────────────────────────────────────────────

/**
 * Supprime un audit et ses NC liées, après confirmation utilisateur.
 * @param {string} auditId - Référence vers Audit.id.
 * @returns {void}
 */
function deleteAudit(auditId) {
  if (!confirm('Supprimer cet audit ?')) return;
  DB.audits = DB.audits.filter(a => a.id !== auditId);
  DB.ncs    = DB.ncs.filter(nc => nc.aid !== auditId);
  save();
  renderAudits();
}

// ─────────────────────────────────────────────
// 6. OUVERTURE DU MODAL
// ─────────────────────────────────────────────

/**
 * Ouvre le wizard de création d'un nouvel audit (étape 1 :
 * sélection magasin/rayon/date), en réinitialisant l'état du module.
 * Peuple le sélecteur de rayon depuis getKnownRayons() (rayons.js) —
 * aucune liste fixe.
 * @returns {void}
 */
function openAuditModal() {
  /** @type {string[]} */
  const storeIds = visibleMids();
  const magSelect = el('a-mag');

  magSelect.innerHTML =
    '<option value="">Sélectionner...</option>' +
    DB.magasins
      .filter(m => storeIds.includes(m.id) && m.statut === 'actif')
      .map(m => `<option value="${m.id}">${m.nom}</option>`)
      .join('');

  populateRayonSelect(el('a-ray'), true);
  el('a-ray').value = '';

  el('a-date').value    = today();
  el('a-date').readOnly = !(CU && CU.role === 'admin');
  el('a-aud').value     = CU ? CU.nom : '';

  el('as1').style.display = '';
  el('as2').style.display = 'none';
  el('as3').style.display = 'none';
  el('a-prev').style.display  = 'none';
  el('a-pause').style.display = 'none';
  el('a-next').innerHTML = 'Continuer <i class="ti ti-arrow-right"></i>';
  el('a-next').onclick   = auditNext;

  _currentDraftId = null;
  auditStep       = 0;
  openModal('m-audit');
}

// ─────────────────────────────────────────────
// 7. NAVIGATION DANS LE WIZARD
// ─────────────────────────────────────────────

/**
 * Avance le wizard de création d'audit à l'étape suivante. À l'étape
 * 0, valide les champs obligatoires puis construit les questions ;
 * à l'étape 1, soumet l'audit.
 * @returns {void}
 */
function auditNext() {
  if (auditStep === 0) {
    /** @type {string} */
    const mid  = v('a-mag');
    /** @type {string} */
    const ray  = v('a-ray');
    /** @type {string} */
    const date = v('a-date');
    if (!mid || !ray || !date) { alert('Magasin, rayon et date sont requis.'); return; }

    buildAuditQuestions(ray);
    el('as1').style.display = 'none';
    el('as2').style.display = '';
    el('a-ray-ttl').textContent = ray;
    el('a-prev').style.display  = '';
    el('a-pause').style.display = '';
    el('a-next').innerHTML = 'Valider l\'audit <i class="ti ti-check"></i>';
    auditStep = 1;
  } else if (auditStep === 1) {
    submitAudit();
  }
}

/**
 * Revient à l'étape précédente du wizard (de l'étape questions à
 * l'étape de sélection). Sans effet si l'étape courante n'est pas 1.
 * @returns {void}
 */
function auditPrev() {
  if (auditStep !== 1) return;
  el('as2').style.display = 'none';
  el('as1').style.display = '';
  el('a-prev').style.display  = 'none';
  el('a-pause').style.display = 'none';
  el('a-next').innerHTML = 'Continuer <i class="ti ti-arrow-right"></i>';
  auditStep = 0;
}

// ─────────────────────────────────────────────
// 8. CONSTRUCTION DES QUESTIONS PAR ZONE
// ─────────────────────────────────────────────

/**
 * Construit l'état des questions d'audit pour un rayon donné :
 * initialise auditAnswers, regroupe les points de grille par zone,
 * puis affiche le premier onglet de zone.
 *
 * ⚠️ CHANGÉ : le regroupement en onglets se fait désormais sur
 * GrillePoint.zone (sous-partie du rayon, libre et renommable par
 * rayon — voir getZonesForRayon/renameGrilleZone, rayons.js), plus
 * sur un découpage de la catégorie (cat.split(' – ')[0]). Un point
 * sans zone (zone vide, import sans zone détectée) est regroupé sous
 * IMPORT_UNCLASSIFIED_ZONE_LABEL_GRILLE ('Non classé', rayons.js).
 *
 * ⚠️ Depuis le retrait de GRILLE_BASE_COMMUNE (grille.js, voir
 * getGrille), un rayon peut désormais n'avoir AUCUN point de
 * contrôle (jamais importé ni saisi manuellement) — ce cas n'existait
 * pas auparavant. Si _auditZoneKeys est vide, switchAuditZone()
 * n'est pas appelée (elle crasherait sur _auditZones[undefined]) et
 * un message d'état vide est affiché à la place.
 * @param {string} rayon
 * @returns {void}
 */
function buildAuditQuestions(rayon) {
  /** @type {GrillePoint[]} */
  const allPoints = getGrille(rayon);
  auditAnswers = {};
  allPoints.forEach(point => { auditAnswers[point.id] = { q: point.q, rep: null, cmt: '', photos: [] }; });

  // Regrouper les points par zone (GrillePoint.zone — sous-partie du
  // rayon, voir rayons.js)
  _auditZones    = {};
  _auditZoneKeys = [];
  allPoints.forEach(point => {
    /** @type {string} */
    const zone = (point.zone && point.zone.trim()) || IMPORT_UNCLASSIFIED_ZONE_LABEL_GRILLE;
    if (!_auditZones[zone]) _auditZones[zone] = [];
    _auditZones[zone].push(point);
  });
  _auditZoneKeys = Object.keys(_auditZones);

  _buildAuditZoneTabs();

  if (!_auditZoneKeys.length) {
    if (el('a-zone-tabs')) el('a-zone-tabs').innerHTML = '';
    el('a-qs').innerHTML = `<div class="tsm tm" style="padding:24px;text-align:center">Ce rayon n'a aucun point de contrôle pour l'instant.<br>Importez ou ajoutez des points de contrôle dans la page Grille avant de lancer un audit.</div>`;
    updateAuditScore();
    return;
  }

  switchAuditZone(_auditZoneKeys[0]);
  updateAuditScore();
}

/**
 * Construit les onglets de navigation entre zones de la grille.
 * @returns {void}
 */
function _buildAuditZoneTabs() {
  const tabsContainer = el('a-zone-tabs');
  if (!tabsContainer) return;

  tabsContainer.innerHTML = _auditZoneKeys.map((zone, index) => `
    <button id="atab-${index}" class="atab${index === 0 ? ' active' : ''}" onclick="switchAuditZone('${zone}')">
      ${zone}
    </button>`).join('');
}

/**
 * Affiche les questions d'une zone donnée, restaure les réponses
 * déjà saisies, et met à jour la navigation précédent/suivant.
 * @param {string} zone - Clé de _auditZones (préfixe de catégorie).
 * @returns {void}
 */
/**
 * Affiche les questions d'une zone donnée, groupées par Thème
 * (point.cat — sous-groupe à l'intérieur de la zone, voir le
 * typedef GrillePoint, config.js), avec un en-tête de section par
 * thème, sur le même principe que _buildCategorySection (page
 * Grille, grille.js). Hiérarchie complète : Rayon → Zone (onglets,
 * voir buildAuditQuestions) → Thème (sections ci-dessous) → Points.
 * @param {string} zone
 * @returns {void}
 */
function switchAuditZone(zone) {
  // Mettre à jour les styles des onglets
  _auditZoneKeys.forEach((z, i) => {
    const btn = el('atab-' + i);
    if (!btn) return;
    btn.classList.toggle('active', z === zone);
  });

  // Rendre les questions de la zone, groupées par Thème (point.cat)
  /** @type {string[]} */
  const themes = [...new Set(_auditZones[zone].map(point => point.cat || 'Général'))];
  el('a-qs').innerHTML = themes.map(theme => `
    <div style="padding:8px 4px;font-size:11px;font-weight:600;color:var(--text2);text-transform:uppercase;letter-spacing:.5px">${theme}</div>
    ${_auditZones[zone].filter(p => (p.cat || 'Général') === theme).map(point => _buildAuditQuestion(point)).join('')}
  `).join('');

  // Restaurer les réponses déjà saisies
  _auditZones[zone].forEach(point => {
    /** @type {AuditAnswer | undefined} */
    const savedAnswer = auditAnswers[point.id];
    if (!savedAnswer?.rep) return;
    const buttons = document.querySelectorAll(`#aaq-${point.id} .rb`);
    /** @type {number} */
    const btnIndex = AUDIT_ANSWER_BUTTON_INDEX[savedAnswer.rep];
    if (buttons[btnIndex]) setAudRep(point.id, savedAnswer.rep, buttons[btnIndex]);
  });

  _updateAuditTabBadges();

  // Mettre à jour la navigation précédent / suivant
  /** @type {number} */
  const zoneIndex = _auditZoneKeys.indexOf(zone);
  const prevBtn   = el('a-zone-prev');
  const nextBtn   = el('a-zone-next');
  const label     = el('a-zone-label');
  if (prevBtn) prevBtn.style.visibility = zoneIndex === 0 ? 'hidden' : 'visible';
  if (nextBtn) nextBtn.style.visibility = zoneIndex === _auditZoneKeys.length - 1 ? 'hidden' : 'visible';
  if (label)  label.textContent = `${zoneIndex + 1} / ${_auditZoneKeys.length}`;
}

/**
 * Construit le HTML d'une question d'audit (boutons de réponse +
 * zone de détail NC affichée conditionnellement).
 * @param {GrillePoint} point
 * @returns {string}
 */
function _buildAuditQuestion(point) {
  return `<div class="aq" id="aaq-${point.id}" style="margin-bottom:8px">
    <div class="qt">${critBdg(point.c)} ${point.q}</div>
    ${point.prec ? `<div style="font-size:11px;color:var(--text2);margin-bottom:6px;font-style:italic">${point.prec}</div>` : ''}
    <div class="rg">
      <div class="rb" onclick="setAudRep('${point.id}','C',this)"><i class="ti ti-check" style="font-size:12px"></i> Conforme</div>
      <div class="rb" onclick="setAudRep('${point.id}','NC',this)"><i class="ti ti-x" style="font-size:12px"></i> Non conforme</div>
      <div class="rb" onclick="setAudRep('${point.id}','NA',this)"><i class="ti ti-minus" style="font-size:12px"></i> N/A</div>
    </div>
    <div class="nc-det" id="and-${point.id}">
      <input type="text" class="form-control" style="font-size:12px;margin-top:6px"
             placeholder="Commentaire NC…"
             oninput="auditAnswers['${point.id}'].cmt=this.value">
      <div style="display:flex;gap:6px;margin-top:8px;flex-wrap:wrap" id="aphot-${point.id}"></div>
      <input type="file" accept="image/*" multiple style="display:none" id="aphi-${point.id}"
             onchange="handleAuditPhoto('${point.id}',this)">
      <button type="button" class="btn btn-secondary btn-sm" style="margin-top:6px;font-size:11px"
              onclick="el('aphi-${point.id}').click()">
        <i class="ti ti-camera"></i> Ajouter photo
      </button>
    </div>
  </div>`;
}

/**
 * Navigue d'une zone vers la zone adjacente (précédente/suivante),
 * en se basant sur l'onglet actuellement mis en surbrillance.
 * @param {number} direction - -1 pour la zone précédente, +1 pour la suivante.
 * @returns {void}
 */
function navAuditZone(direction) {
  /** @type {number} */
  const currentIndex = _auditZoneKeys.findIndex((_, i) => {
    const btn = el('atab-' + i);
    return btn && btn.classList.contains('active');
  });
  /** @type {number} */
  const newIndex = Math.max(0, Math.min(_auditZoneKeys.length - 1, (currentIndex === -1 ? 0 : currentIndex) + direction));
  switchAuditZone(_auditZoneKeys[newIndex]);
}

// ─────────────────────────────────────────────
// 9. RÉPONSES AUX QUESTIONS
// ─────────────────────────────────────────────

/**
 * Enregistre la réponse à un point de contrôle, met à jour l'UI du
 * bouton sélectionné et révèle/masque la zone de détail NC.
 * @param {string} pointId - Référence vers GrillePoint.id.
 * @param {AuditAnswerCode} response
 * @param {HTMLElement} clickedButton - Bouton de réponse cliqué.
 * @returns {void}
 */
function setAudRep(pointId, response, clickedButton) {
  auditAnswers[pointId].rep = response;

  const questionContainer = el('aaq-' + pointId);
  questionContainer.querySelectorAll('.rb').forEach(btn => btn.classList.remove('selC', 'selNC', 'selNA'));
  clickedButton.classList.add('sel' + response);

  const ncDetail = el('and-' + pointId);
  if (ncDetail) {
    if (response === 'NC') ncDetail.classList.add('on');
    else ncDetail.classList.remove('on');
  }

  updateAuditScore();
}

/**
 * Recalcule et affiche le score pondéré provisoire de l'audit en
 * cours, en fonction des réponses déjà saisies (les points N/A sont
 * exclus du calcul).
 * @returns {void}
 */
function updateAuditScore() {
  /** @type {GrillePoint[]} */
  const allPoints  = getGrille(v('a-ray'));
  /** @type {AuditAnswer[]} */
  const allAnswers = Object.values(auditAnswers);
  /** @type {number} */
  const answered   = allAnswers.filter(a => a.rep).length;

  el('a-prog').textContent = `${answered}/${allPoints.length} réponses`;

  /** @type {GrillePoint[]} */
  const validPoints = allPoints.filter(p => auditAnswers[p.id]?.rep && auditAnswers[p.id]?.rep !== 'NA');
  /** @type {number} */
  const totalWeight = validPoints.reduce((sum, p) => sum + p.p, 0);
  /** @type {number} */
  const okWeight    = validPoints.filter(p => auditAnswers[p.id]?.rep === 'C').reduce((sum, p) => sum + p.p, 0);
  /** @type {number | null} */
  const percentage  = totalWeight > 0 ? Math.round((okWeight / totalWeight) * 100) : null;

  el('a-score-live').textContent = percentage !== null ? percentage + '%' : '–';
  _updateAuditTabBadges();
}

/**
 * Ajoute/retire la coche '✓' sur chaque onglet de zone selon que
 * tous ses points ont reçu une réponse.
 * @returns {void}
 */
function _updateAuditTabBadges() {
  _auditZoneKeys.forEach((zone, index) => {
    const btn = el('atab-' + index);
    if (!btn) return;
    /** @type {boolean} */
    const allAnswered = _auditZones[zone].every(p => auditAnswers[p.id]?.rep);
    btn.innerHTML = btn.innerHTML.replace(/\s*✓$/, '') + (allAnswered ? ' ✓' : '');
  });
}

// ─────────────────────────────────────────────
// 10. SOUMISSION DE L'AUDIT
// ─────────────────────────────────────────────

/**
 * Finalise et enregistre l'audit en cours : complète les réponses
 * manquantes en N/A, calcule le score pondéré, crée l'Audit, puis
 * crée automatiquement une NC + une Action corrective pour chaque
 * point répondu 'NC'. Supprime le brouillon lié si applicable.
 * @returns {void}
 */
function submitAudit() {
  /** @type {string} */
  const mid    = v('a-mag');
  /** @type {string} */
  const rayon  = v('a-ray');
  /** @type {string} */
  const date   = v('a-date');
  /** @type {string} */
  const aud    = v('a-aud');
  /** @type {string} */
  const cmt    = v('a-cmt');
  /** @type {Magasin | {}} */
  const store  = DB.magasins.find(m => m.id === mid) || {};
  /** @type {GrillePoint[]} */
  const points = getGrille(rayon);

  // Compléter les réponses manquantes par N/A
  points.forEach(point => {
    if (!auditAnswers[point.id]?.rep) {
      auditAnswers[point.id] = { q: point.q, rep: 'NA', cmt: '', photos: [] };
    }
  });

  /** @type {GrillePoint[]} */
  const validPoints  = points.filter(p => auditAnswers[p.id].rep !== 'NA');
  /** @type {GrillePoint[]} */
  const okPoints     = validPoints.filter(p => auditAnswers[p.id].rep === 'C');
  /** @type {GrillePoint[]} */
  const ncPoints     = validPoints.filter(p => auditAnswers[p.id].rep === 'NC');
  /** @type {number} */
  const totalWeight  = validPoints.reduce((sum, p) => sum + p.p, 0);
  /** @type {number} */
  const okWeight     = okPoints.reduce((sum, p) => sum + p.p, 0);
  /** @type {number} */
  const score        = totalWeight > 0 ? Math.round((okWeight / totalWeight) * 100) : 100;
  /** @type {string} */
  const auditId      = 'AUD-' + uid();

  if (!DB.audits) DB.audits = [];
  /** @type {Audit} */
  DB.audits.push({
    id: auditId, mid, mag: store.nom || '', rayon, date, aud, cmt,
    score, nc: ncPoints.length,
    statut: ncPoints.length ? 'Non conforme' : 'Conforme',
    answers: { ...auditAnswers },
  });

  // Créer les NC et actions correctives pour chaque point non conforme
  ncPoints.forEach(point => {
    /** @type {string} */
    const ncId     = 'NC-' + uid();
    /** @type {string} */
    const actionId = 'AC-' + uid();
    /** @type {string} */
    const deadline = new Date(Date.now() + AUDIT_NC_DEADLINE_DAYS * 86_400_000).toISOString().split('T')[0];

    /** @type {NC} */
    DB.ncs.push({
      id: ncId, mid, mag: store.nom || '', rayon, date,
      desc: point.q, crit: point.c, resp: aud, dl: deadline,
      statut: 'Ouverte', cmt: auditAnswers[point.id].cmt, aid: auditId,
    });
    /** @type {Action} */
    DB.actions.push({
      id: actionId, ncId, desc: point.q, mag: store.nom || '',
      resp: aud, ech: deadline, prio: point.c, statut: 'Ouverte', cmt: '',
    });
  });

  save();

  // Supprimer le brouillon lié si applicable
  if (_currentDraftId) {
    DB.drafts = DB.drafts.filter(d => d.id !== _currentDraftId);
    sbDeleteWhere('drafts', 'id', _currentDraftId);
    save(['drafts']);
    _currentDraftId = null;
  }

  _showAuditCompletionScreen(store.nom, rayon, date, score, ncPoints.length);
  auditStep = 2;
}

/**
 * Affiche l'écran récapitulatif final du wizard (score, nombre de
 * NC détectées) et configure le bouton de fermeture pour rafraîchir
 * la liste des audits.
 * @param {string | undefined} storeName - Nom du magasin (peut être absent si store est un objet vide).
 * @param {string} rayon
 * @param {string} date
 * @param {number} score
 * @param {number} ncCount
 * @returns {void}
 */
function _showAuditCompletionScreen(storeName, rayon, date, score, ncCount) {
  el('as2').style.display = 'none';
  el('as3').style.display = '';
  el('a-prev').style.display  = 'none';
  el('a-pause').style.display = 'none';

  el('a-recap').textContent = `${storeName || ''} · ${rayon} · ${fd(date)}`;

  /** @type {string} */
  const scoreColor = sc(score);
  el('a-score-fin').style.borderColor = scoreColor;
  el('a-score-fin').style.color       = scoreColor;
  el('a-score-fin').textContent       = score + '%';
  el('a-nc-msg').textContent          = ncCount ? `${ncCount} NC détectée(s)` : '';

  el('a-next').innerHTML = 'Fermer';
  el('a-next').onclick   = () => {
    closeModal('m-audit');
    el('a-next').onclick = auditNext;
    auditStep = 0;
    renderAudits();
  };
}

// ─────────────────────────────────────────────
// 11. GESTION DES PHOTOS
// ─────────────────────────────────────────────

/**
 * Upload une ou plusieurs photos pour un point de contrôle vers
 * Supabase Storage, ajoute les URLs résultantes à la réponse
 * correspondante, puis rafraîchit l'aperçu des miniatures.
 * @param {string} pointId - Référence vers GrillePoint.id.
 * @param {HTMLInputElement} input - Élément `<input type="file" multiple>`.
 * @returns {Promise<void>}
 */
async function handleAuditPhoto(pointId, input) {
  /** @type {File[]} */
  const files = [...input.files];

  for (const file of files) {
    /** @type {string} */
    const storagePath = `audits/${pointId}-${uid()}-${file.name.replace(/[^a-zA-Z0-9._-]/g, '_')}`;
    /** @type {string | null} */
    const uploadedUrl = await sbUploadPhoto(file, storagePath);

    if (uploadedUrl) {
      auditAnswers[pointId].photos.push(uploadedUrl);
    } else {
      alert('Upload échoué — vérifiez votre connexion.');
    }
  }

  const previewContainer = el('aphot-' + pointId);
  if (previewContainer) {
    previewContainer.innerHTML = auditAnswers[pointId].photos
      .map(url => `<img src="${url}" style="width:52px;height:52px;border-radius:7px;object-fit:cover;border:1px solid var(--border)">`)
      .join('');
  }

  input.value = '';
}

// ─────────────────────────────────────────────
// 12. VISIONNEUSE PHOTO
// ─────────────────────────────────────────────

/**
 * Affiche une photo en plein écran dans une superposition modale
 * simple (fermeture au clic).
 * @param {string} url - URL publique de la photo.
 * @returns {void}
 */
function openPhotoViewer(url) {
  const overlay = document.createElement('div');
  overlay.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,.85);z-index:9999;display:flex;align-items:center;justify-content:center;cursor:zoom-out';
  overlay.setAttribute('role', 'dialog');
  overlay.setAttribute('aria-label', 'Visionneuse photo');
  overlay.onclick = () => document.body.removeChild(overlay);
  overlay.innerHTML = `<img src="${url}" style="max-width:92vw;max-height:92vh;border-radius:10px;box-shadow:0 8px 40px rgba(0,0,0,.6)" alt="Photo">`;
  document.body.appendChild(overlay);
}

// ─────────────────────────────────────────────
// 13. BROUILLONS
// ─────────────────────────────────────────────

/**
 * Met l'audit en cours en pause : sauvegarde l'état courant
 * (réponses incluses) comme Draft, persiste localement + pousse
 * vers Supabase, puis ferme la modale.
 * @returns {void}
 */
function pauseAudit() {
  /** @type {string} */
  const mid    = v('a-mag');
  /** @type {string} */
  const rayon  = v('a-ray');
  /** @type {string} */
  const date   = v('a-date');
  /** @type {string} */
  const aud    = v('a-aud');
  /** @type {string} */
  const cmt    = v('a-cmt');
  /** @type {Magasin | {}} */
  const store  = DB.magasins.find(m => m.id === mid) || {};
  /** @type {string} */
  const draftId = _currentDraftId || 'DRF-' + uid();

  _currentDraftId = draftId;

  /** @type {Draft} */
  const draft = {
    id: draftId, mid, mag: store.nom || '', rayon, date, aud, cmt,
    answers: { ...auditAnswers }, createdAt: today(),
    uid: CU ? CU.id : '',
  };

  /** @type {number} */
  const existingIndex = DB.drafts.findIndex(d => d.id === draftId);
  if (existingIndex >= 0) DB.drafts[existingIndex] = draft;
  else DB.drafts.push(draft);

  save(['drafts']);
  sbUpsert('drafts', [draft]);
  closeModal('m-audit');

  auditStep       = 0;
  _currentDraftId = null;

  showToast('Audit mis en pause — retrouvez-le dans Brouillons', 'success');
  renderAudits();
}

/**
 * Reprend un brouillon d'audit FSQS : restaure le formulaire, les
 * réponses déjà saisies, et rouvre le wizard à l'étape questions.
 * @param {string} draftId - Référence vers Draft.id.
 * @returns {void}
 */
function resumeDraft(draftId) {
  /** @type {Draft | undefined} */
  const draft = DB.drafts.find(d => d.id === draftId);
  if (!draft) return;

  _currentDraftId = draftId;

  /** @type {string[]} */
  const storeIds = visibleMids();
  const magSelect = el('a-mag');
  magSelect.innerHTML =
    '<option value="">Sélectionner...</option>' +
    DB.magasins
      .filter(m => storeIds.includes(m.id) && m.statut === 'actif')
      .map(m => `<option value="${m.id}">${m.nom}</option>`)
      .join('');

  el('a-mag').value     = draft.mid;
  populateRayonSelect(el('a-ray'), true);
  el('a-ray').value     = draft.rayon;
  el('a-date').value    = draft.date;
  el('a-date').readOnly = !(CU && CU.role === 'admin');
  el('a-aud').value     = draft.aud;
  sv('a-cmt', draft.cmt || '');

  el('as1').style.display = 'none';
  el('as2').style.display = '';
  el('as3').style.display = 'none';
  el('a-prev').style.display  = '';
  el('a-pause').style.display = '';
  el('a-next').innerHTML = 'Valider l\'audit <i class="ti ti-check"></i>';

  auditAnswers = { ...draft.answers };
  buildAuditQuestions(draft.rayon);

  // Restaurer les réponses déjà saisies
  Object.entries(draft.answers).forEach(([pointId, answer]) => {
    if (!answer.rep) return;
    const buttons  = document.querySelectorAll(`#aaq-${pointId} .rb`);
    /** @type {number} */
    const btnIndex = AUDIT_ANSWER_BUTTON_INDEX[answer.rep];
    if (buttons[btnIndex]) setAudRep(pointId, answer.rep, buttons[btnIndex]);
  });

  auditStep = 1;
  openModal('m-audit');
}

/**
 * Supprime un brouillon d'audit, après confirmation utilisateur.
 * @param {string} draftId - Référence vers Draft.id.
 * @returns {void}
 */
function deleteDraft(draftId) {
  if (!confirm('Supprimer ce brouillon ?')) return;
  DB.drafts = DB.drafts.filter(d => d.id !== draftId);
  save(['drafts']);
  sbDeleteWhere('drafts', 'id', draftId);
  renderDrafts();
}

/**
 * Affiche la liste des brouillons : tous pour un admin, uniquement
 * les siens pour les autres rôles.
 * @returns {void}
 */
function renderDrafts() {
  const tbody = el('drafts-tb');
  if (!tbody) return;

  /** @type {Draft[]} */
  const drafts = CU && CU.role === 'admin'
    ? [...DB.drafts].reverse()
    : [...DB.drafts].reverse().filter(d => d.uid === CU.id);

  el('drafts-cnt').textContent = `${drafts.length} brouillon(s)`;

  if (!drafts.length) {
    tbody.innerHTML = `<tr><td colspan="5"><div class="empty-state">
      <i class="ti ti-player-pause"></i><p>Aucun brouillon en cours.</p>
    </div></td></tr>`;
    return;
  }

  tbody.innerHTML = drafts.map(draft => _buildDraftRow(draft)).join('');
}

/**
 * Construit la ligne `<tr>` HTML d'un brouillon, avec les boutons
 * reprendre/supprimer réservés à son propriétaire (ou à un admin).
 * Délègue à resumeQualDraft() (non fourni dans ce fichier) si le
 * brouillon est de type 'qualimetre', sinon à resumeDraft().
 * @param {Draft} draft
 * @returns {string}
 */
function _buildDraftRow(draft) {
  /** @type {boolean} */
  const isOwner  = CU && (CU.id === draft.uid || CU.role === 'admin');
  /** @type {boolean} */
  const canDelete = isOwner;
  /** @type {string} */
  const resumeFn  = draft.type === 'qualimetre'
    ? `resumeQualDraft('${draft.id}')`
    : `resumeDraft('${draft.id}')`;

  return `<tr>
    <td>${draft.mag}</td>
    <td style="display:flex;align-items:center;gap:6px;padding-top:14px">${rIcon(draft.rayon)} ${draft.rayon}</td>
    <td>${fd(draft.date)}</td>
    <td>${draft.aud}</td>
    <td>
      <div class="act-btns">
        ${isOwner  ? `<button class="btn btn-primary btn-sm" onclick="${resumeFn}"><i class="ti ti-player-play"></i> Reprendre</button>` : ''}
        ${canDelete ? `<button class="btn btn-danger btn-sm" onclick="deleteDraft('${draft.id}')"><i class="ti ti-trash"></i></button>` : ''}
      </div>
    </td>
  </tr>`;
}
