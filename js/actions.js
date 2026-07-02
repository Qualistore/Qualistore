// ══════════════════════════════════════════════════════════════
// ACTIONS — Plan d'actions correctives
// Dépend de : storage.js (DB, CU), auth.js (hasPerm), ui.js
// ══════════════════════════════════════════════════════════════

// ─────────────────────────────────────────────
// 0. TYPEDEFS JSDoc (pour inférence VSCode / TypeScript)
//    ⚠️ Déduits de l'usage dans ce fichier (et croisés avec
//    magasins.js pour Magasin/NC.mid). Les propriétés non
//    accédées ici ne sont pas garanties exhaustives.
// ─────────────────────────────────────────────

/**
 * Magasin (point de vente). Seules .id et .nom sont accédées dans ce
 * fichier ; la structure complète est documentée plus en détail dans
 * magasins.js.
 * @typedef {Object} Magasin
 * @property {string} id
 * @property {string} nom
 */

/**
 * Réponse enregistrée pour un point de contrôle lors d'un audit.
 * @typedef {Object} AuditAnswer
 * @property {string} q - Intitulé du point de contrôle (correspond à GrillePoint.q dans config.js).
 * @property {string[]} [photos] - URLs des photos jointes à cette réponse.
 */

/**
 * Audit FSQS. Seules les propriétés observées dans ce fichier sont
 * documentées ; d'autres existent probablement (voir storage.js).
 * @typedef {Object} Audit
 * @property {string} id
 * @property {string} mid - Référence vers Magasin.id.
 * @property {Record<string, AuditAnswer>} [answers] - Réponses indexées par identifiant de point de contrôle (clé exacte non confirmée dans ce fichier).
 */

/**
 * Alerte terrain. Peut être liée à une NC (NC.isAlert + NC.aid) ou
 * à une Action (Action.alertId).
 * @typedef {Object} Alerte
 * @property {string} id
 * @property {string} [statut] - Valeur observée : 'Clôturée'.
 * @property {string[]} [photos] - URLs des photos jointes à l'alerte.
 */

/**
 * Non-conformité (NC), liée à un Audit ou à une Alerte terrain.
 * @typedef {Object} NC
 * @property {string} id
 * @property {string} aid - Référence polymorphe : vers Audit.id si isAlert est faux, vers Alerte.id si isAlert est vrai.
 * @property {string} [mid] - Référence vers Magasin.id (vu dans magasins.js).
 * @property {string} desc - Description / intitulé de la non-conformité.
 * @property {string} [pid] - Référence vers GrillePoint.id d'origine (voir submitAudit, audits.js ; définition canonique dans nc.js) — absente sur les NC créées avant ce champ ou issues d'une alerte. Utilisée par _buildActionPhotosHtml pour retrouver sans ambiguïté la bonne photo.
 * @property {'Ouverte'|'En cours'|'Clôturée'} statut
 * @property {boolean} [isAlert] - Vrai si la NC provient d'une alerte terrain plutôt que d'un audit planifié.
 * @property {string} [closedDate] - Date de clôture (format produit par today()).
 * @property {string} [cmt] - Commentaire de suivi/clôture, repris depuis l'action liée.
 */

/**
 * Action corrective liée à une NC (ou directement à une alerte
 * terrain si `mag === 'Alerte terrain'`).
 * @typedef {Object} Action
 * @property {string} id
 * @property {string} ncId - Référence vers NC.id.
 * @property {string} mag - Nom du magasin concerné (PAS un id — comparé à Magasin.nom), ou la valeur spéciale 'Alerte terrain'.
 * @property {string} resp - Nom du responsable de l'action.
 * @property {string} ech - Date d'échéance (format consommé par overdue() et fd()).
 * @property {string} [prio] - Niveau de priorité/criticité (consommé par critBdg() — probablement aligné sur GrilleCriticite 'Majeure'|'Critique').
 * @property {'Ouverte'|'En cours'|'Traitée'} statut
 * @property {string} [cmt] - Commentaire de suivi.
 * @property {string} [desc] - Description de l'action, utilisée en fallback quand aucune NC n'est liée (cas alerte terrain).
 * @property {string} [alertId] - Référence vers Alerte.id, présente si l'action découle d'une alerte terrain.
 */

// ─────────────────────────────────────────────
// 1. RENDU DE LA PAGE
// ─────────────────────────────────────────────

/**
 * Affiche la liste des actions correctives en cours (statut différent
 * de 'Traitée'), filtrée par magasins visibles pour l'utilisateur
 * connecté et par les filtres UI (magasin, statut).
 * @returns {void}
 */
function renderActions() {
  /** @type {string[]} */
  const storeIds         = visibleMids();
  /** @type {string[]} */
  const visibleStoreNames = DB.magasins.filter(m => storeIds.includes(m.id)).map(m => m.nom);
  /** @type {string} */
  const filterMagId       = v('flt-act-mag');
  /** @type {string} */
  const filterStatus      = v('flt-act-stat');

  populateMagSelect(el('flt-act-mag'));

  // Exclure les actions "Traitées" — elles rejoignent l'archive des NC
  /** @type {Action[]} */
  let actions = [...DB.actions].reverse().filter(action =>
    (visibleStoreNames.includes(action.mag) || action.mag === 'Alerte terrain') &&
    action.statut !== 'Traitée'
  );

  if (filterMagId) {
    /** @type {Magasin | undefined} */
    const store = DB.magasins.find(m => m.id === filterMagId);
    if (store) actions = actions.filter(a => a.mag === store.nom);
  }
  if (filterStatus) actions = actions.filter(a => a.statut === filterStatus);

  el('act-cnt').textContent = `${actions.length} action(s)`;

  /** @type {boolean} */
  const canEdit = canEditNC();
  const tbody   = el('act-tb');

  if (!actions.length) {
    tbody.innerHTML = `<tr><td colspan="9"><div class="empty-state">
      <i class="ti ti-tool"></i><p>Aucune action corrective.</p>
    </div></td></tr>`;
    return;
  }

  tbody.innerHTML = actions.map(action => _buildActionRow(action, canEdit)).join('');
}

// ─────────────────────────────────────────────
// 2. HELPERS DE RENDU
// ─────────────────────────────────────────────

/**
 * Construit la ligne `<tr>` HTML pour une action corrective donnée.
 * @param {Action} action
 * @param {boolean} canEdit - Si vrai, affiche un éditeur de statut ; sinon un simple badge.
 * @returns {string} HTML de la ligne de tableau.
 */
function _buildActionRow(action, canEdit) {
  /** @type {boolean} */
  const isOverdue  = overdue(action.ech) && action.statut !== 'Traitée';
  /** @type {NC | undefined} */
  const linkedNc   = DB.ncs.find(nc => nc.id === action.ncId);
  /** @type {string} */
  const description = linkedNc ? linkedNc.desc : action.desc;
  /** @type {string} */
  const photosHtml  = _buildActionPhotosHtml(linkedNc, description);

  return `<tr style="${isOverdue ? 'background:#fff8f8' : ''}">
    <td style="max-width:200px;font-size:12px;vertical-align:top;padding-top:14px">
      <div style="color:var(--text)">${description.slice(0, 80)}${description.length > 80 ? '…' : ''}</div>
      ${photosHtml}
    </td>
    <td style="font-size:12px;vertical-align:top;padding-top:14px">${action.mag}</td>
    <td style="font-size:12px;vertical-align:top;padding-top:14px">${action.resp}</td>
    <td style="font-size:12px;vertical-align:top;padding-top:14px;color:${isOverdue ? 'var(--danger)' : 'inherit'}">
      ${isOverdue ? '<i class="ti ti-clock"></i> ' : ''}${fd(action.ech)}
    </td>
    <td style="vertical-align:top;padding-top:14px">${critBdg(action.prio)}</td>
    <td style="vertical-align:top;padding-top:10px;min-width:160px">
      ${canEdit ? _buildStatusEditor(action) : _buildStatusDisplay(action)}
    </td>
    <td style="vertical-align:top;padding-top:10px"></td>
  </tr>`;
}

/**
 * Construit le bloc HTML des miniatures photo associées à une action,
 * en cherchant d'abord dans les réponses d'audit, puis dans l'alerte
 * terrain liée si applicable.
 *
 * ⚠️ CORRIGÉ : matche désormais la réponse d'audit via `linkedNc.pid`
 * (référence stable vers GrillePoint.id, voir submitAudit audits.js)
 * quand elle est disponible, au lieu de chercher par texte
 * (`x.q === description`) — même bug et même correction que
 * _buildNcPhotosHtml (nc.js) : le texte seul ne suffit pas à
 * distinguer deux points de contrôle au même intitulé (points
 * dupliqués dans le référentiel). Repli sur le texte pour les NC
 * créées avant l'ajout de `pid`.
 * @param {NC | undefined} linkedNc
 * @param {string} description
 * @returns {string} HTML (vide si aucune photo trouvée).
 */
function _buildActionPhotosHtml(linkedNc, description) {
  /** @type {Audit | undefined} */
  const audit = DB.audits.find(a => a.id === linkedNc?.aid);
  /** @type {AuditAnswer | undefined} */
  const answer = audit?.answers && (
    linkedNc?.pid ? audit.answers[linkedNc.pid] : Object.values(audit.answers).find(x => x.q === description)
  );
  /** @type {string} */
  const auditPhotos = answer?.photos?.length
    ? answer.photos.map(p => _photoThumb(p)).join('')
    : '';

  /** @type {Alerte | false | undefined} */
  const alert = linkedNc?.isAlert && DB.alertes.find(x => x.id === linkedNc.aid);
  /** @type {string} */
  const alertPhotos = alert?.photos?.length
    ? alert.photos.map(p => _photoThumb(p)).join('')
    : '';

  /** @type {string} */
  const allPhotos = auditPhotos || alertPhotos;
  return allPhotos
    ? `<div style="display:flex;gap:4px;margin-top:6px;flex-wrap:wrap">${allPhotos}</div>`
    : '';
}

/**
 * Construit le HTML d'une miniature photo cliquable.
 * @param {string} url - URL publique de la photo (Supabase Storage).
 * @returns {string}
 */
function _photoThumb(url) {
  return `<img src="${url}" style="width:48px;height:48px;object-fit:cover;border-radius:6px;border:1px solid var(--border);cursor:pointer" onclick="openPhotoViewer('${url}')">`;
}

/**
 * Construit l'éditeur de statut (select + zone de commentaire) pour
 * une action, destiné aux utilisateurs autorisés à modifier les NC.
 * @param {Action} action
 * @returns {string} HTML du select de statut, suivi du textarea/affichage de commentaire.
 */
function _buildStatusEditor(action) {
  const selectHtml = `<select class="form-control" style="padding:4px 8px;font-size:12px;width:100%"
    onchange="changeActStatut('${action.id}', this.value)">
    <option value="Ouverte"  ${action.statut === 'Ouverte'  ? 'selected' : ''}>Ouverte</option>
    <option value="En cours" ${action.statut === 'En cours' ? 'selected' : ''}>En cours</option>
    <option value="Traitée"  ${action.statut === 'Traitée'  ? 'selected' : ''}>Traitée</option>
  </select>`;

  const commentHtml = action.statut === 'En cours'
    ? `<textarea class="form-control" rows="2"
         style="font-size:11px;margin-top:6px;padding:5px 8px;resize:none"
         placeholder="Commentaire de suivi…"
         onblur="saveActCmt('${action.id}', this.value)">${action.cmt || ''}</textarea>`
    : action.cmt
      ? `<div style="margin-top:5px;padding:5px 8px;background:var(--bg);border-left:3px solid var(--primary-mid);border-radius:0 4px 4px 0;font-size:11px;font-style:italic;color:var(--text2)">
           💬 ${action.cmt}
         </div>`
      : '';

  return selectHtml + commentHtml;
}

/**
 * Construit l'affichage en lecture seule du statut d'une action
 * (badge + commentaire), pour les utilisateurs non autorisés à éditer.
 * @param {Action} action
 * @returns {string}
 */
function _buildStatusDisplay(action) {
  const commentHtml = action.cmt
    ? `<div style="margin-top:5px;padding:5px 8px;background:var(--bg);border-left:3px solid var(--primary-mid);border-radius:0 4px 4px 0;font-size:11px;font-style:italic;color:var(--text2)">
         💬 ${action.cmt}
       </div>`
    : '';
  return statBdg(action.statut) + commentHtml;
}

// ─────────────────────────────────────────────
// 3. ACTIONS MÉTIER
// ─────────────────────────────────────────────

/**
 * Sauvegarde le commentaire de suivi d'une action.
 * @param {string} actionId - Référence vers Action.id.
 * @param {string} newComment
 * @returns {void}
 */
function saveActCmt(actionId, newComment) {
  /** @type {Action | undefined} */
  const action = DB.actions.find(a => a.id === actionId);
  if (!action) return;
  action.cmt = newComment.trim();
  save();
}

/**
 * Change le statut d'une action et synchronise le statut de la NC liée.
 * Si "Traitée" → la NC passe à "Clôturée" et l'alerte éventuelle est archivée.
 * @param {string} actionId - Référence vers Action.id.
 * @param {'Ouverte'|'En cours'|'Traitée'} newStatus
 * @returns {void}
 */
function changeActStatut(actionId, newStatus) {
  /** @type {Action | undefined} */
  const action = DB.actions.find(a => a.id === actionId);
  if (!action) return;

  action.statut = newStatus;

  /** @type {NC | undefined} */
  const linkedNc = DB.ncs.find(nc => nc.id === action.ncId);
  if (linkedNc) {
    _syncNcStatus(linkedNc, action, newStatus);
  }

  save();

  // Mettre à jour le badge NC dans la sidebar
  const ncBadge = el('nc-bdg');
  if (ncBadge) ncBadge.textContent = DB.ncs.filter(nc => nc.statut === 'Ouverte').length;

  renderActions();

  // Rafraîchir les pages connexes si actives
  if (el('page-nc')?.classList.contains('active'))        renderNC();
  if (el('page-dashboard')?.classList.contains('active')) renderAlertsDash();
}

/**
 * Synchronise le statut d'une NC avec le nouveau statut de son action
 * corrective liée. À la clôture ('Traitée'), archive aussi l'alerte
 * terrain associée si la NC en provient.
 * @param {NC} nc - NC liée, mutée en place.
 * @param {Action} action - Action dont le statut vient de changer.
 * @param {'Ouverte'|'En cours'|'Traitée'} newStatus
 * @returns {void}
 */
function _syncNcStatus(nc, action, newStatus) {
  if (newStatus === 'Traitée') {
    nc.statut     = 'Clôturée';
    nc.closedDate = today();
    if (action.cmt) nc.cmt = action.cmt;

    // Archiver l'alerte terrain liée si applicable
    if (nc.isAlert && action.alertId) {
      /** @type {Alerte | undefined} */
      const linkedAlert = DB.alertes.find(a => a.id === action.alertId);
      if (linkedAlert) linkedAlert.statut = 'Clôturée';
    }
  } else if (newStatus === 'En cours') {
    nc.statut = 'En cours';
  } else if (newStatus === 'Ouverte') {
    nc.statut = 'Ouverte';
  }
}

/**
 * Raccourci : clôturer directement une action (équivalent à passer
 * son statut à 'Traitée').
 * @param {string} actionId - Référence vers Action.id.
 * @returns {void}
 */
function closeAct(actionId) {
  changeActStatut(actionId, 'Traitée');
}
