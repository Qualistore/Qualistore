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
 * @property {string} [zone] - Zone d'origine du point de contrôle (définition canonique et résolution avec repli dans nc.js, voir resolveNcZone) — absente sur les NC créées avant ce champ.
 * @property {string} [cat] - Sous-section d'origine du point de contrôle (définition canonique et résolution avec repli dans nc.js, voir resolveNcCategorie) — absente ou vide sur les NC créées avant ce champ.
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
 *
 * ⚠️ AJOUTÉ : affiche une case à cocher par ligne et les boutons
 * Tout/Aucun/Supprimer sélection pour les admins uniquement — voir
 * deleteSelectedActions. Auparavant, aucune suppression manuelle
 * d'action corrective n'était possible depuis cet onglet (seule la
 * suppression en cascade d'un audit ou d'une NC entière le
 * permettait, voir deleteAudit audits.js et deleteSelectedNC nc.js).
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
  /** @type {boolean} */
  const isAdmin = CU && CU.role === 'admin';
  const tbody   = el('act-tb');

  ['act-toggle-all-btn', 'act-toggle-none-btn', 'act-del-sel-btn'].forEach(id => {
    if (el(id)) el(id).style.display = isAdmin ? '' : 'none';
  });

  if (!actions.length) {
    tbody.innerHTML = `<tr><td colspan="8"><div class="empty-state">
      <i class="ti ti-tool"></i><p>Aucune action corrective.</p>
    </div></td></tr>`;
    return;
  }

  // ⚠️ CHANGÉ : regroupement à deux niveaux, Zone puis Sous-section
  // (voir resolveNcZone / resolveNcCategorie, nc.js), cohérent avec
  // le même regroupement dans renderNC (nc.js) et le rapport FSQS
  // (rapports-fsqs.js). La zone/sous-section est résolue via la NC
  // liée ; une action sans NC retrouvée (cas normalement impossible
  // en usage normal) retombe sous les libellés génériques "non
  // classé(e)".
  /** @type {Map<string, Map<string, Action[]>>} */
  const byZone = new Map();
  actions.forEach(action => {
    /** @type {NC | undefined} */
    const linkedNc = DB.ncs.find(nc => nc.id === action.ncId);
    /** @type {string} */
    const zone = linkedNc ? resolveNcZone(linkedNc) : IMPORT_UNCLASSIFIED_ZONE_LABEL_GRILLE;
    /** @type {string} */
    const cat  = linkedNc ? resolveNcCategorie(linkedNc) : IMPORT_UNCLASSIFIED_CAT_LABEL;
    if (!byZone.has(zone)) byZone.set(zone, new Map());
    /** @type {Map<string, Action[]>} */
    const byCat = byZone.get(zone);
    if (!byCat.has(cat)) byCat.set(cat, []);
    byCat.get(cat).push(action);
  });

  /** @type {string[]} */
  const sortedZones = _sortZoneLabels([...byZone.keys()]);

  tbody.innerHTML = sortedZones.map(zone => {
    /** @type {Map<string, Action[]>} */
    const byCat = byZone.get(zone);
    /** @type {string[]} */
    const sortedCats = _sortZoneLabels([...byCat.keys()], IMPORT_UNCLASSIFIED_CAT_LABEL);
    /** @type {number} */
    const zoneTotal = [...byCat.values()].reduce((sum, acts) => sum + acts.length, 0);

    return `<tr class="tbl-group-row"><td colspan="8">${zone} <span class="tsm" style="text-transform:none;font-weight:400">(${zoneTotal})</span></td></tr>
      ${sortedCats.map(cat => `
        <tr class="tbl-subgroup-row"><td colspan="8">${cat} <span class="tsm tm">(${byCat.get(cat).length})</span></td></tr>
        ${byCat.get(cat).map(action => _buildActionRow(action, canEdit, isAdmin)).join('')}
      `).join('')}`;
  }).join('');
}

// ─────────────────────────────────────────────
// 2. HELPERS DE RENDU
// ─────────────────────────────────────────────

/**
 * Construit la ligne `<tr>` HTML pour une action corrective donnée.
 *
 * ⚠️ CORRIGÉ : le tableau avait un en-tête "NC" en trop (Qualistore.html)
 * sans cellule correspondante ici — chaque ligne avait donc une colonne
 * de décalage par rapport à son en-tête (ex : "Magasin" affichait en
 * réalité "Responsable"). Remplacé par une vraie colonne case à cocher
 * (admin uniquement, voir deleteSelectedActions), qui comble
 * l'en-tête vide de la même largeur (32px) sans décalage.
 * @param {Action} action
 * @param {boolean} canEdit - Si vrai, affiche un éditeur de statut ; sinon un simple badge.
 * @param {boolean} isAdmin - Si vrai, affiche la case à cocher de sélection (suppression).
 * @returns {string} HTML de la ligne de tableau.
 */
function _buildActionRow(action, canEdit, isAdmin) {
  /** @type {boolean} */
  const isOverdue  = overdue(action.ech) && action.statut !== 'Traitée';
  /** @type {NC | undefined} */
  const linkedNc   = DB.ncs.find(nc => nc.id === action.ncId);
  /** @type {string} */
  const description = linkedNc ? linkedNc.desc : action.desc;
  /** @type {string} */
  const photosHtml  = _buildActionPhotosHtml(linkedNc, description);

  return `<tr style="${isOverdue ? 'background:#fff8f8' : ''}">
    <td style="vertical-align:top;padding-top:14px;width:32px">
      ${isAdmin ? `<input type="checkbox" class="act-cb" value="${action.id}" style="width:16px;height:16px;accent-color:var(--primary);cursor:pointer" checked>` : ''}
    </td>
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
    <td style="vertical-align:top;padding-top:10px">
      ${isAdmin ? `<button class="btn btn-secondary btn-sm" title="Supprimer" style="color:var(--danger)" onclick="deleteAction('${action.id}')"><i class="ti ti-trash"></i></button>` : ''}
    </td>
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

// ─────────────────────────────────────────────
// 4. SUPPRESSION MANUELLE (ADMIN)
// ─────────────────────────────────────────────

/**
 * Coche ou décoche toutes les cases de sélection des actions
 * correctives affichées.
 * @param {boolean} selectAll
 * @returns {void}
 */
function toggleAllActions(selectAll) {
  document.querySelectorAll('.act-cb').forEach(cb => { cb.checked = selectAll; });
}

/**
 * Supprime une action corrective individuelle, après confirmation.
 *
 * Ne supprime PAS la NC liée (voir deleteSelectedNC, nc.js, pour
 * supprimer NC + action ensemble depuis l'onglet Non-conformités) —
 * seule l'action de suivi disparaît ; la NC reste visible dans
 * l'onglet Non-conformités, simplement sans action corrective
 * associée. C'est un état déjà toléré ailleurs dans le code (voir
 * reopenNC, nc.js, qui vérifie l'existence de l'action liée avant
 * de la mettre à jour).
 * @param {string} actionId - Référence vers Action.id.
 * @returns {void}
 */
function deleteAction(actionId) {
  if (!confirm('Supprimer cette action corrective ? La non-conformité associée ne sera pas supprimée.')) return;
  DB.actions = DB.actions.filter(a => a.id !== actionId);
  sbDeleteWhere('actions', 'id', actionId);
  save(['actions']);
  renderActions();
}

/**
 * Supprime les actions correctives sélectionnées via les cases à
 * cocher, après confirmation. Ne supprime PAS les NC liées — voir
 * deleteAction.
 * @returns {void}
 */
function deleteSelectedActions() {
  /** @type {string[]} */
  const selectedIds = [...document.querySelectorAll('.act-cb:checked')].map(cb => cb.value);
  if (!selectedIds.length) { alert('Sélectionnez au moins une action.'); return; }
  if (!confirm(`Supprimer ${selectedIds.length} action(s) corrective(s) ? Les non-conformités associées ne seront pas supprimées.`)) return;

  selectedIds.forEach(id => sbDeleteWhere('actions', 'id', id));
  DB.actions = DB.actions.filter(a => !selectedIds.includes(a.id));

  save(['actions']);
  renderActions();
}
