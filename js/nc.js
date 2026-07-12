// ══════════════════════════════════════════════════════════════
// NC — Non-conformités (actives et archivées)
// Dépend de : storage.js (DB, CU), auth.js (hasPerm), ui.js
// ══════════════════════════════════════════════════════════════

// ─────────────────────────────────────────────
// 0. TYPEDEFS JSDoc (pour inférence VSCode / TypeScript)
//    ⚠️ Déduits de l'usage dans ce fichier (et croisés avec
//    audits.js / actions.js / magasins.js).
//
//    ⚠️ CONFIRMATION D'INCOHÉRENCE (déjà signalée dans audits.js) :
//    NC_CRIT_COLORS ci-dessous référence 3 valeurs de criticité
//    ('Critique', 'Majeure', 'Mineure'), alors que le typedef
//    GrilleCriticite posé dans config.js (déduit de
//    GRILLE_BASE_COMMUNE) n'en couvre que 2. Le typedef ci-dessous
//    utilise l'union complète à 3 valeurs, la plus fiable pour NC.
// ─────────────────────────────────────────────

/**
 * Niveau de criticité d'une non-conformité. Union à 3 valeurs
 * confirmée par NC_CRIT_COLORS ci-dessous.
 * @typedef {'Critique'|'Majeure'|'Mineure'} NcCriticite
 */

/**
 * Non-conformité (NC), active ou archivée.
 * @typedef {Object} NC
 * @property {string} id
 * @property {string} mid - Référence vers Magasin.id, ou chaîne vide si non rattachée à un magasin (ex : NC issue d'une alerte terrain).
 * @property {string} mag - Nom du magasin (copie figée).
 * @property {string} rayon
 * @property {string} date - Date de l'audit d'origine.
 * @property {string} desc - Intitulé du point de contrôle / de la non-conformité.
 * @property {NcCriticite} crit
 * @property {string} [resp] - Nom du responsable (vu dans audits.js).
 * @property {string} dl - Date d'échéance (deadline).
 * @property {'Ouverte'|'En cours'|'Clôturée'} statut
 * @property {string} [cmt] - Commentaire de suivi/clôture.
 * @property {string} aid - Référence polymorphe vers Audit.id (ou Alerte.id si isAlert).
 * @property {string} [pid] - Référence vers GrillePoint.id d'origine (voir submitAudit, audits.js) — absente sur les NC créées avant ce champ, ou issues d'une alerte (isAlert). Permet de retrouver sans ambiguïté la bonne réponse/photo dans Audit.answers même quand plusieurs points de contrôle partagent un intitulé identique (voir _buildNcPhotosHtml) ; à défaut, retombe sur une recherche par texte (`desc`), plus fragile en cas de doublon.
 * @property {string} [zone] - Zone d'origine du point de contrôle (voir submitAudit, audits.js ; résolution avec repli dans resolveNcZone) — absente sur les NC créées avant ce champ.
 * @property {string} [cat] - Sous-section d'origine du point de contrôle (voir submitAudit, audits.js ; résolution avec repli dans resolveNcCategorie) — absente ou vide sur les NC créées avant ce champ.
 * @property {boolean} [isAlert] - Vrai si la NC provient d'une alerte terrain plutôt que d'un audit planifié.
 * @property {string | null} [closedDate] - Date de clôture ; null après réouverture (reopenNC), absent/undefined avant toute clôture.
 */

/**
 * Point de contrôle d'une grille (définition canonique dans
 * config.js / grille.js). Seules .id, .zone et .cat sont accédées
 * dans ce fichier (voir resolveNcZone, resolveNcCategorie).
 * @typedef {Object} GrillePoint
 * @property {string} id
 * @property {string} [zone]
 * @property {string} [cat]
 */

/**
 * Action corrective liée à une NC. Seule .cmt et .ncId sont
 * accédées dans ce fichier ; structure complète dans actions.js.
 * @typedef {Object} Action
 * @property {string} ncId
 * @property {string} [cmt]
 * @property {string} [ech]
 * @property {string} [statut]
 */

/**
 * Réponse enregistrée pour un point de contrôle lors d'un audit
 * (voir audits.js pour la définition canonique).
 * @typedef {Object} AuditAnswer
 * @property {string} q
 * @property {string[]} [photos]
 */

/**
 * Audit FSQS. Seules .id et .answers sont accédées dans ce fichier ;
 * structure complète dans audits.js.
 * @typedef {Object} Audit
 * @property {string} id
 * @property {Record<string, AuditAnswer>} [answers]
 */

/**
 * Alerte terrain. Seules .id et .photos sont accédées dans ce
 * fichier ; structure complète dans actions.js.
 * @typedef {Object} Alerte
 * @property {string} id
 * @property {string[]} [photos]
 */

/**
 * Magasin. Seules .id et .nom sont accédées dans ce fichier ;
 * structure complète dans magasins.js.
 * @typedef {Object} Magasin
 * @property {string} id
 * @property {string} nom
 */

/**
 * Clé de période utilisée pour filtrer les exports PDF.
 * @typedef {'week'|'month'|'month30'} PdfExportPeriod
 */

// ─────────────────────────────────────────────
// 1. CONSTANTES
// ─────────────────────────────────────────────

/**
 * Couleurs CSS selon la criticité pour les exports PDF.
 * @type {Record<NcCriticite, string>}
 */
const NC_CRIT_COLORS = { Critique: '#e53935', Majeure: '#ea580c', Mineure: '#f59e0b' };

/**
 * Libellés de période pour les exports PDF.
 * @type {Record<PdfExportPeriod, string>}
 */
const NC_PERIOD_LABELS = {
  week:    'Cette semaine',
  month:   'Mois en cours',
  month30: '30 derniers jours',
  month3:  '3 derniers mois',
  month6:  '6 derniers mois',
};

// ─────────────────────────────────────────────
// 2. ÉTAT
// ─────────────────────────────────────────────

/** @type {boolean} Indique si le panneau d'archives NC est déplié. */
let _ncArchiveOpen = false;

// ─────────────────────────────────────────────
// 4. RENDU — NC ACTIVES
// ─────────────────────────────────────────────
// ⚠️ CORRIGÉ : canEditNC() (ancienne fonction, vérifiait
// CU.role==='admin'||'fsqs'||CU.perms?.['nc'], la clé 'nc' n'existe
// plus dans le nouveau système à 42 droits) a été supprimée — chaque
// bouton/action ci-dessous vérifie désormais directement le droit
// granulaire qui le concerne réellement (nc_view, nc_edit_status,
// nc_edit_deadline, nc_delete, nc_reopen), au lieu d'un contrôle
// générique unique partagé entre plusieurs écrans différents.

/**
 * Libellé de repli pour une sous-section (GrillePoint.cat) absente
 * ou non résolue — pendant féminin de
 * IMPORT_UNCLASSIFIED_ZONE_LABEL_GRILLE (rayons.js), pour un accord
 * grammatical correct ("sous-section non classée").
 * @type {string}
 */
const IMPORT_UNCLASSIFIED_CAT_LABEL = 'Non classée';

/**
 * Trie une liste de libellés de groupe par ordre alphabétique (locale
 * française), en poussant systématiquement le libellé de repli
 * (`unclassifiedLabel`) en dernier. Réutilisée par renderNC,
 * renderActions (actions.js) et le rapport FSQS (rapports-fsqs.js)
 * pour un tri identique partout où NC/actions sont regroupées par
 * zone ou par sous-section.
 * @param {string[]} labels
 * @param {string} [unclassifiedLabel] - Libellé à toujours pousser en dernier (défaut : IMPORT_UNCLASSIFIED_ZONE_LABEL_GRILLE, pour les appels existants qui trient des zones).
 * @returns {string[]}
 */
function _sortZoneLabels(labels, unclassifiedLabel = IMPORT_UNCLASSIFIED_ZONE_LABEL_GRILLE) {
  return [...labels].sort((a, b) => {
    if (a === unclassifiedLabel) return 1;
    if (b === unclassifiedLabel) return -1;
    return a.localeCompare(b, 'fr');
  });
}

/**
 * Résout la zone d'origine d'une NC, avec repli progressif pour les
 * NC créées avant l'ajout du champ `zone` (voir submitAudit,
 * audits.js) — réutilisée par actions.js et rapports-fsqs.js pour
 * regrouper NC et actions correctives par zone de façon cohérente
 * partout dans l'application.
 *
 * Ordre de résolution :
 * 1) `nc.zone` si déjà présent (toute NC créée après ce correctif) ;
 * 2) sinon, une recherche du point d'origine (`nc.pid`) dans la
 *    grille ACTUELLE du rayon — peut différer de la grille au moment
 *    de l'audit si des points ont été modifiés depuis, mais reste la
 *    meilleure estimation disponible ;
 * 3) sinon, le libellé générique IMPORT_UNCLASSIFIED_ZONE_LABEL_GRILLE
 *    (rayons.js) — jamais de zone inventée.
 * @param {NC} nc
 * @returns {string}
 */
function resolveNcZone(nc) {
  if (nc.zone) return nc.zone;

  if (nc.pid && nc.rayon) {
    /** @type {GrillePoint | undefined} */
    const point = getGrille(nc.rayon, nc.mid).find(p => p.id === nc.pid);
    if (point?.zone) return point.zone;
  }

  return IMPORT_UNCLASSIFIED_ZONE_LABEL_GRILLE;
}

/**
 * Résout la sous-section (GrillePoint.cat) d'origine d'une NC, avec
 * le même repli progressif que resolveNcZone (voir sa JSDoc pour le
 * détail) : `nc.cat` si présent et non vide, sinon recherche dans la
 * grille actuelle par `nc.pid`, sinon IMPORT_UNCLASSIFIED_CAT_LABEL
 * ('Non classée').
 * @param {NC} nc
 * @returns {string}
 */
function resolveNcCategorie(nc) {
  if (nc.cat) return nc.cat;

  if (nc.pid && nc.rayon) {
    /** @type {GrillePoint | undefined} */
    const point = getGrille(nc.rayon, nc.mid).find(p => p.id === nc.pid);
    if (point?.cat) return point.cat;
  }

  return IMPORT_UNCLASSIFIED_CAT_LABEL;
}

/**
 * Met à jour le badge NC de la sidebar (nombre de NC au statut
 * 'Ouverte') — factorisé ici pour que tout endroit qui modifie
 * DB.ncs l'appelle de la même façon, plutôt que de recalculer le même
 * filtre indépendamment (source d'oublis : submitAudit, audits.js, ne
 * l'appelait pas du tout avant ce correctif — une NC créée depuis un
 * audit ne rafraîchissait jamais ce badge).
 * @returns {void}
 */
function updateNcBadge() {
  /** @type {HTMLElement | null} */
  const ncBadge = el('nc-bdg');
  if (ncBadge) ncBadge.textContent = DB.ncs.filter(nc => nc.statut === 'Ouverte').length;
}

/**
 * Affiche la liste des NC actives (statut différent de 'Clôturée'),
 * filtrée par magasins visibles et par les filtres UI, puis
 * déclenche le rendu des archives.
 *
 * ⚠️ CHANGÉ : les NC sont désormais regroupées par zone (voir
 * resolveNcZone) avec un en-tête de groupe par zone, plutôt
 * qu'affichées en une liste plate. Les zones sont triées
 * alphabétiquement, IMPORT_UNCLASSIFIED_ZONE_LABEL_GRILLE ('Non
 * classé') toujours en dernier.
 * @returns {void}
 */
function renderNC() {
  /** @type {string[]} */
  const storeIds  = visibleMids();
  /** @type {string} */
  const filterMag  = v('flt-nc-mag');
  /** @type {string} */
  const filterRay  = v('flt-nc-ray');
  /** @type {string} */
  const filterCrit = v('flt-nc-crit');
  /** @type {string} */
  const filterStat = v('flt-nc-stat') || '';
  // ⚠️ CORRIGÉ : 'isAdmin' unique remplacé par deux droits distincts —
  // supprimer une sélection de NC (nc_delete) et éditer une NC
  // (nc_edit_status et/ou nc_edit_deadline) ne sont plus forcément la
  // même personne.
  /** @type {boolean} */
  const canDeleteSelected = hasPerm('nc_delete');
  /** @type {boolean} */
  const canEditRow = hasPerm('nc_edit_status') || hasPerm('nc_edit_deadline');

  populateMagSelect(el('flt-nc-mag'));

  /** @type {NC[]} */
  let activeNcs = [...DB.ncs].reverse().filter(nc =>
    (storeIds.includes(nc.mid) || nc.mid === '') && nc.statut !== 'Clôturée'
  );
  if (filterMag)  activeNcs = activeNcs.filter(nc => nc.mid    === filterMag);
  if (filterRay)  activeNcs = activeNcs.filter(nc => nc.rayon  === filterRay);
  if (filterCrit) activeNcs = activeNcs.filter(nc => nc.crit   === filterCrit);
  if (filterStat) activeNcs = activeNcs.filter(nc => nc.statut === filterStat);
  // ⚠️ CHANGÉ : le filtre "date précise" et le filtre de période
  // (auparavant réservé à l'export PDF, voir exportNCActivePDF) sont
  // désormais un seul menu combiné (#flt-nc-period + #flt-nc-date,
  // voir _toggleDateFilterInput, ui.js) qui filtre aussi la liste
  // affichée à l'écran, sur la date de l'audit (NC.date).
  activeNcs = _applyDateFilter(activeNcs, 'flt-nc-period', 'flt-nc-date', 'date');

  el('nc-cnt').textContent = `${activeNcs.length} NC active(s)`;

  const deleteButton = el('nc-del-sel-btn');
  if (deleteButton) deleteButton.style.display = canDeleteSelected ? '' : 'none';

  // ⚠️ AJOUTÉ : les 3 boutons d'export PDF/sélection n'étaient reliés à
  // aucun droit (toujours visibles, codés en dur dans Qualistore.html) —
  // gated maintenant par nc_export.
  /** @type {boolean} */
  const canExport = hasPerm('nc_export');
  ['nc-export-sel-btn', 'nc-export-active-btn'].forEach(id => {
    if (el(id)) el(id).style.display = canExport ? '' : 'none';
  });

  const tbody = el('nc-tb');

  if (!activeNcs.length) {
    tbody.innerHTML = `<tr><td colspan="9"><div class="empty-state" style="padding:28px">
      <i class="ti ti-circle-check" style="color:var(--success);font-size:36px"></i>
      <p>Aucune non-conformité active.</p>
    </div></td></tr>`;
    renderNCArchives(filterMag, filterRay, filterCrit);
    return;
  }

  /** @type {Map<string, Map<string, NC[]>>} */
  const byZone = new Map();
  activeNcs.forEach(nc => {
    /** @type {string} */
    const zone = resolveNcZone(nc);
    /** @type {string} */
    const cat  = resolveNcCategorie(nc);
    if (!byZone.has(zone)) byZone.set(zone, new Map());
    /** @type {Map<string, NC[]>} */
    const byCat = byZone.get(zone);
    if (!byCat.has(cat)) byCat.set(cat, []);
    byCat.get(cat).push(nc);
  });

  /** @type {string[]} */
  const sortedZones = _sortZoneLabels([...byZone.keys()]);

  tbody.innerHTML = sortedZones.map(zone => {
    /** @type {Map<string, NC[]>} */
    const byCat = byZone.get(zone);
    /** @type {string[]} */
    const sortedCats = _sortZoneLabels([...byCat.keys()], IMPORT_UNCLASSIFIED_CAT_LABEL);
    /** @type {number} */
    const zoneTotal = [...byCat.values()].reduce((sum, ncs) => sum + ncs.length, 0);

    return `<tr class="tbl-group-row"><td colspan="9">${zone} <span class="tsm" style="text-transform:none;font-weight:400">(${zoneTotal})</span></td></tr>
      ${sortedCats.map(cat => `
        <tr class="tbl-subgroup-row"><td colspan="9">${cat} <span class="tsm tm">(${byCat.get(cat).length})</span></td></tr>
        ${byCat.get(cat).map(nc => _buildNcRow(nc, canEditRow)).join('')}
      `).join('')}`;
  }).join('');
  renderNCArchives(filterMag, filterRay, filterCrit);
}

/**
 * Construit la ligne `<tr>` HTML d'une NC active (avec case à
 * cocher de sélection et photos liées).
 * @param {NC} nc
 * @param {boolean} canEdit - Si vrai (nc_edit_status ou nc_edit_deadline), affiche le bouton d'édition.
 * @returns {string}
 */
function _buildNcRow(nc, canEdit) {
  /** @type {boolean} */
  const isOverdue = overdue(nc.dl) && nc.statut === 'Ouverte';
  /** @type {string} */
  const photosHtml = _buildNcPhotosHtml(nc);

  return `<tr>
    <td style="vertical-align:top;padding-top:14px;width:32px">
      <input type="checkbox" class="nc-cb" value="${nc.id}"
             style="width:16px;height:16px;accent-color:var(--primary);cursor:pointer" checked>
    </td>
    <td style="vertical-align:top;padding-top:14px">${nc.mag}</td>
    <td style="vertical-align:top;padding-top:14px">
      <div style="display:flex;align-items:center;gap:6px">${rIcon(nc.rayon)} ${nc.rayon}</div>
    </td>
    <td style="max-width:220px;font-size:12px;vertical-align:top;padding-top:14px">
      <div style="color:var(--text)">${nc.desc.slice(0, 80)}${nc.desc.length > 80 ? '…' : ''}</div>
      ${nc.cmt ? `<div style="margin-top:5px;padding:5px 8px;background:var(--bg);border-left:3px solid var(--primary-mid);border-radius:0 4px 4px 0;font-style:italic;color:var(--text2);font-size:11px">💬 ${nc.cmt}</div>` : ''}
      ${photosHtml}
    </td>
    <td style="vertical-align:top;padding-top:14px">${critBdg(nc.crit)}</td>
    <td style="font-size:12px;vertical-align:top;padding-top:14px;color:var(--text2)">${fd(nc.date)}</td>
    <td style="font-size:12px;vertical-align:top;padding-top:14px;color:${isOverdue ? 'var(--danger)' : 'inherit'}">${fd(nc.dl)}</td>
    <td style="vertical-align:top;padding-top:14px">${statBdg(nc.statut)}</td>
    <td style="vertical-align:top;padding-top:10px">
      <div class="act-btns">
        ${canEdit ? `<button class="btn btn-secondary btn-sm" title="Modifier" onclick="openNCEdit('${nc.id}')"><i class="ti ti-pencil"></i></button>` : ''}
      </div>
    </td>
  </tr>`;
}

/**
 * Construit le HTML des photos liées à une NC (depuis audit ou alerte).
 *
 * ⚠️ CORRIGÉ : recherche désormais la réponse d'origine par `nc.pid`
 * (référence stable vers GrillePoint.id, voir submitAudit audits.js)
 * quand elle est disponible, au lieu de chercher par texte
 * (`a.q === nc.desc`). La recherche par texte renvoyait TOUJOURS la
 * première réponse de l'audit dont l'intitulé correspondait — si
 * plusieurs points de contrôle du référentiel partagent le même
 * intitulé (points dupliqués dans la grille), toutes leurs NC
 * affichaient la photo du même premier point trouvé, peu importe
 * lequel avait réellement été photographié. Repli sur l'ancienne
 * recherche par texte pour les NC créées avant l'ajout de `pid`
 * (compatibilité, aucune donnée existante perdue).
 * @param {NC} nc
 * @returns {string} HTML, ou chaîne vide si aucune photo.
 */
function _buildNcPhotosHtml(nc) {
  /** @type {Audit | undefined} */
  const audit  = DB.audits.find(a => a.id === nc.aid);
  /** @type {AuditAnswer | undefined} */
  const answer = audit?.answers && (
    nc.pid ? audit.answers[nc.pid] : Object.values(audit.answers).find(a => a.q === nc.desc)
  );
  /** @type {string[]} */
  const auditPhotos = answer?.photos || [];

  /** @type {Alerte | false | undefined} */
  const alert       = nc.isAlert && DB.alertes.find(a => a.id === nc.aid);
  /** @type {string[]} */
  const alertPhotos = alert?.photos || [];

  /** @type {string[]} */
  const allPhotos = [...auditPhotos, ...alertPhotos];
  if (!allPhotos.length) return '';

  return `<div style="display:flex;gap:4px;margin-top:6px;flex-wrap:wrap">
    ${allPhotos.map(p => `<img src="${p}" style="width:44px;height:44px;object-fit:cover;border-radius:5px;border:1px solid var(--border);cursor:pointer" onclick="openPhotoViewer('${p}')">`).join('')}
  </div>`;
}

// ─────────────────────────────────────────────
// 5. RENDU — NC ARCHIVÉES
// ─────────────────────────────────────────────

/**
 * Affiche la liste des NC archivées (statut 'Clôturée'), filtrée
 * par les sélecteurs dédiés aux archives (ou repliée sur les
 * filtres de la liste active si les filtres d'archive sont vides).
 * @param {string} filterMag - Filtre magasin de la liste active (fallback).
 * @param {string} filterRay - Filtre rayon de la liste active (fallback).
 * @param {string} filterCrit - Filtre criticité, partagé avec la liste active.
 * @returns {void}
 */
function renderNCArchives(filterMag, filterRay, filterCrit) {
  /** @type {string[]} */
  const storeIds = visibleMids();
  /** @type {string} */
  const archMag  = v('flt-arch-mag')    || '';
  /** @type {string} */
  const archRay  = v('flt-arch-ray')    || '';
  // ⚠️ CHANGÉ : le filtre de période (auparavant sur closedDate, date
  // de clôture) et le filtre "date précise" (sur NC.date, date de
  // l'audit) sont désormais un seul menu combiné (#flt-arch-period +
  // #flt-arch-date), filtrant uniformément sur NC.date — cohérent avec
  // NC actives et Actions, qui n'ont pas de notion de date de clôture.
  // ⚠️ CORRIGÉ : rouvrir (nc_reopen) et supprimer (nc_delete) une NC
  // archivée sont deux droits distincts dans le nouveau système.
  /** @type {boolean} */
  const canReopen = hasPerm('nc_reopen');
  /** @type {boolean} */
  const canDelete = hasPerm('nc_delete');

  // Peupler le select des archives si vide
  const archMagSel = el('flt-arch-mag');
  if (archMagSel && archMagSel.options.length <= 1) populateMagSelect(archMagSel);

  /** @type {NC[]} */
  let archives = [...DB.ncs].reverse().filter(nc =>
    (storeIds.includes(nc.mid) || nc.mid === '') && nc.statut === 'Clôturée'
  );

  if (archMag) archives = archives.filter(nc => nc.mid   === archMag);
  else if (filterMag)  archives = archives.filter(nc => nc.mid   === filterMag);

  if (archRay) archives = archives.filter(nc => nc.rayon === archRay);
  else if (filterRay)  archives = archives.filter(nc => nc.rayon === filterRay);

  if (filterCrit) archives = archives.filter(nc => nc.crit === filterCrit);
  archives = _applyDateFilter(archives, 'flt-arch-period', 'flt-arch-date', 'date');

  const countBadge = el('nc-archive-cnt');
  if (countBadge) countBadge.textContent = archives.length;

  const archiveExportBtn = el('nc-export-archive-btn');
  if (archiveExportBtn) archiveExportBtn.style.display = hasPerm('nc_export') ? '' : 'none';

  const tbody = el('nc-archive-tb');
  if (!tbody) return;

  if (!archives.length) {
    /** @type {boolean} */
    const hasDateFilter = (v('flt-arch-period') || 'all') !== 'all';
    tbody.innerHTML = `<tr><td colspan="8"><div class="empty-state" style="padding:20px">
      <p>Aucune NC clôturée${hasDateFilter ? ' pour ce filtre de date' : ''}.</p>
    </div></td></tr>`;
    return;
  }

  tbody.innerHTML = archives.map(nc => _buildNcArchiveRow(nc, canReopen, canDelete)).join('');
}

/**
 * Construit la ligne `<tr>` HTML d'une NC archivée, avec le
 * commentaire de suivi (NC ou, à défaut, action liée) et les
 * boutons de réouverture/suppression réservés aux admins.
 * @param {NC} nc
 * @param {boolean} canReopen - Droit nc_reopen.
 * @param {boolean} canDelete - Droit nc_delete.
 * @returns {string}
 */
function _buildNcArchiveRow(nc, canReopen, canDelete) {
  /** @type {Action | undefined} */
  const action    = DB.actions.find(a => a.ncId === nc.id);
  /** @type {string} */
  const suiviCmt  = nc.cmt || action?.cmt || '';
  /** @type {string} */
  const escapedId = nc.id.replace(/'/g, "\\'");

  return `<tr style="opacity:.85">
    <td style="vertical-align:top;padding-top:12px;font-size:12px">${nc.mag}</td>
    <td style="vertical-align:top;padding-top:12px">
      <div style="display:flex;align-items:center;gap:6px;font-size:12px">${rIcon(nc.rayon)} ${nc.rayon}</div>
    </td>
    <td style="max-width:200px;font-size:12px;vertical-align:top;padding-top:12px;color:var(--text2)">
      ${nc.desc.slice(0, 80)}${nc.desc.length > 80 ? '…' : ''}
    </td>
    <td style="max-width:180px;font-size:12px;vertical-align:top;padding-top:12px">
      ${suiviCmt
        ? `<div style="padding:5px 8px;background:var(--success-light);border-left:3px solid var(--success);border-radius:0 4px 4px 0;font-style:italic;color:#15803d">✔ ${suiviCmt}</div>`
        : '<span class="tsm tm">–</span>'}
    </td>
    <td style="vertical-align:top;padding-top:12px">${critBdg(nc.crit)}</td>
    <td style="font-size:12px;vertical-align:top;padding-top:12px;color:var(--text2)">${fd(nc.date)}</td>
    <td style="font-size:12px;vertical-align:top;padding-top:12px;color:var(--success)">${nc.closedDate ? fd(nc.closedDate) : '–'}</td>
    <td style="vertical-align:top;padding-top:10px">
      <div class="act-btns">
        ${canReopen ? `<button class="btn btn-secondary btn-sm" title="Rouvrir" onclick="reopenNC('${escapedId}')"><i class="ti ti-refresh"></i></button>` : ''}
        ${canDelete ? `<button class="btn btn-danger btn-sm" onclick="confirmDel('nc','${escapedId}','${escapedId}')"><i class="ti ti-trash"></i></button>` : ''}
      </div>
    </td>
  </tr>`;
}

// ─────────────────────────────────────────────
// 6. ACCORDÉON ARCHIVES
// ─────────────────────────────────────────────

/**
 * Replie/déplie le panneau d'archives NC.
 * @returns {void}
 */
function toggleNCArchive() {
  _ncArchiveOpen = !_ncArchiveOpen;
  el('nc-archive-body').style.display    = _ncArchiveOpen ? '' : 'none';
  el('nc-archive-chevron').style.transform = _ncArchiveOpen ? 'rotate(180deg)' : '';
}

// ─────────────────────────────────────────────
// 7. MODAL ÉDITION NC
// ─────────────────────────────────────────────

/**
 * Ouvre la modale d'édition d'une NC (statut, commentaire, et
 * échéance si admin).
 * @param {string} ncId - Référence vers NC.id.
 * @returns {void}
 */
function openNCEdit(ncId) {
  /** @type {NC | undefined} */
  const nc = DB.ncs.find(n => n.id === ncId);
  if (!nc) return;

  sv('nc-edit-ncid', ncId);
  el('nc-edit-id').textContent   = ncId;
  el('nc-edit-desc').textContent = nc.desc;
  el('nc-edit-statut').value     = nc.statut;
  sv('nc-edit-cmt', nc.cmt || '');

  const deadlineGroup = el('nc-edit-dl-group');
  if (deadlineGroup) deadlineGroup.style.display = hasPerm('nc_edit_deadline') ? '' : 'none';
  sv('nc-edit-dl', nc.dl || '');

  openModal('m-nc-edit');
}

/**
 * Sauvegarde les modifications du formulaire d'édition NC : statut,
 * commentaire, et (admin uniquement) échéance répercutée sur
 * l'action corrective liée. Synchronise aussi le statut de cette
 * action avec le nouveau statut de la NC.
 * @returns {void}
 */
function saveNCEdit() {
  /** @type {string} */
  const ncId = v('nc-edit-ncid');
  /** @type {NC | undefined} */
  const nc   = DB.ncs.find(n => n.id === ncId);
  if (!nc) return;

  nc.statut = el('nc-edit-statut').value;
  nc.cmt    = v('nc-edit-cmt').trim();

  // Seul un utilisateur avec le droit nc_edit_deadline peut modifier
  // l'échéance et la répercuter sur l'action liée.
  if (hasPerm('nc_edit_deadline')) {
    /** @type {string} */
    const newDeadline = v('nc-edit-dl');
    if (newDeadline) {
      nc.dl = newDeadline;
      /** @type {Action | undefined} */
      const linkedAction = DB.actions.find(a => a.ncId === ncId);
      if (linkedAction) linkedAction.ech = newDeadline;
    }
  }

  if (nc.statut === 'Clôturée' && !nc.closedDate) nc.closedDate = today();

  // Synchroniser le statut de l'action corrective liée
  /** @type {Action | undefined} */
  const linkedAction = DB.actions.find(a => a.ncId === ncId);
  if (linkedAction) {
    if      (nc.statut === 'Clôturée') linkedAction.statut = 'Traitée';
    else if (nc.statut === 'En cours') linkedAction.statut = 'En cours';
    else if (nc.statut === 'Ouverte')  linkedAction.statut = 'Ouverte';
  }

  save();
  closeModal('m-nc-edit');
  renderNC();

  if (el('page-actions')?.classList.contains('active')) renderActions();

  updateNcBadge();
}

// ─────────────────────────────────────────────
// 8. ACTIONS SUR LES NC
// ─────────────────────────────────────────────

/**
 * Coche ou décoche toutes les cases de sélection NC.
 * @param {boolean} selectAll
 * @returns {void}
 */
function toggleAllNC(selectAll) {
  document.querySelectorAll('.nc-cb').forEach(cb => { cb.checked = selectAll; });
}

/**
 * Rouvre une NC clôturée (statut → 'Ouverte', closedDate → null) et
 * synchronise l'action corrective liée, après confirmation.
 * @param {string} ncId - Référence vers NC.id.
 * @returns {void}
 */
function reopenNC(ncId) {
  if (!confirm('Rouvrir cette NC ?')) return;
  /** @type {NC | undefined} */
  const nc = DB.ncs.find(n => n.id === ncId);
  if (!nc) return;

  nc.statut     = 'Ouverte';
  nc.closedDate = null;

  /** @type {Action | undefined} */
  const linkedAction = DB.actions.find(a => a.ncId === ncId);
  if (linkedAction) linkedAction.statut = 'Ouverte';

  save(['ncs', 'actions']);
  sbUpsert('ncs',     [nc]);
  if (linkedAction) sbUpsert('actions', [linkedAction]);

  updateNcBadge();

  renderNC();
}

/**
 * Supprime les NC sélectionnées via les cases à cocher (et leurs
 * actions correctives liées), après confirmation.
 * @returns {void}
 */
function deleteSelectedNC() {
  /** @type {string[]} */
  const selectedIds = [...document.querySelectorAll('.nc-cb:checked')].map(cb => cb.value);
  if (!selectedIds.length) { alert('Sélectionnez au moins une NC.'); return; }
  if (!confirm(`Supprimer ${selectedIds.length} NC et leurs actions associées ?`)) return;

  selectedIds.forEach(id => {
    DB.actions = DB.actions.filter(a => a.ncId !== id);
    DB.ncs     = DB.ncs.filter(n => n.id !== id);
    sbDeleteWhere('ncs',     'id',   id);
    sbDeleteWhere('actions', 'ncId', id);
  });

  save(['ncs', 'actions']);
  renderNC();
}

// ─────────────────────────────────────────────
// 9. UTILITAIRES PDF PARTAGÉS
// ─────────────────────────────────────────────

/**
 * Construit le libellé lisible du filtre période/date précise
 * actuellement sélectionné dans un menu combiné (#flt-nc-period,
 * #flt-arch-period), pour affichage dans le sous-titre des exports PDF
 * (voir exportNCActivePDF, exportNCArchivePDF).
 * @param {string} periodSelectId - Id du <select> de période.
 * @param {string} dateInputId - Id de l'<input type="date"> associé.
 * @returns {string}
 */
function _buildPeriodLabel(periodSelectId, dateInputId) {
  /** @type {string} */
  const period = v(periodSelectId) || 'all';
  if (period === 'all') return 'Toutes les Non-Conformités';
  if (period === 'date') {
    /** @type {string} */
    const exactDate = v(dateInputId) || '';
    return exactDate ? `Date : ${fd(exactDate)}` : 'Toutes les Non-Conformités';
  }
  return NC_PERIOD_LABELS[period] || 'Toutes les Non-Conformités';
}

/**
 * Filtre une liste d'entités selon une période glissante sur un
 * champ date donné.
 * @param {Array<Object>} list - Liste d'entités possédant le champ `dateField`.
 * @param {PdfExportPeriod | string} period - Période de filtrage ; toute autre valeur ne filtre rien d'utile via ce switch (cutoff reste la date du jour).
 * @param {string} dateField - Nom du champ date à utiliser (ex : 'date', 'closedDate').
 * @returns {Array<Object>} Sous-ensemble de `list` dont `dateField` est postérieur ou égal à la date de coupure.
 */
function _filterByPeriod(list, period, dateField) {
  /** @type {Date} */
  const cutoff = _periodCutoffDate(period);
  return list.filter(item => item[dateField] && new Date(item[dateField]) >= cutoff);
}

/**
 * Calcule la date de coupure correspondant à une clé de période (voir
 * _filterByPeriod) — extrait pour être réutilisable quand la
 * comparaison ne porte pas directement sur un tableau d'entités (voir
 * renderActions, actions.js, qui doit d'abord résoudre la date via la
 * NC liée à chaque action avant de comparer).
 * @param {PdfExportPeriod | string} period
 * @returns {Date}
 */
function _periodCutoffDate(period) {
  const cutoff = new Date();
  if      (period === 'week')    { const day = cutoff.getDay() || 7; cutoff.setDate(cutoff.getDate() - day + 1); cutoff.setHours(0, 0, 0, 0); }
  else if (period === 'month')   { cutoff.setDate(1); cutoff.setHours(0, 0, 0, 0); }
  else if (period === 'month30') { cutoff.setDate(cutoff.getDate() - 30); cutoff.setHours(0, 0, 0, 0); }
  else if (period === 'month3')  { cutoff.setMonth(cutoff.getMonth() - 3); cutoff.setHours(0, 0, 0, 0); }
  else if (period === 'month6')  { cutoff.setMonth(cutoff.getMonth() - 6); cutoff.setHours(0, 0, 0, 0); }
  return cutoff;
}

/**
 * Applique le filtre combiné période/date précise (menu #flt-nc-period
 * ou #flt-arch-period, associé à un input date affiché uniquement pour
 * l'option "D'une date précise" — voir _toggleDateFilterInput, ui.js)
 * à une liste d'entités portant un champ date. Valeurs possibles du
 * menu : 'all' (aucun filtre, valeur par défaut), 'date' (date exacte,
 * lit dateInputId), ou une clé de période consommée par
 * _filterByPeriod ('month'|'month30'|'month3'|'month6').
 * @param {Array<Object>} list - Liste d'entités possédant le champ `dateField`.
 * @param {string} periodSelectId - Id du <select> de période.
 * @param {string} dateInputId - Id de l'<input type="date"> associé.
 * @param {string} dateField - Nom du champ date à utiliser (ex : 'date').
 * @returns {Array<Object>}
 */
function _applyDateFilter(list, periodSelectId, dateInputId, dateField) {
  /** @type {string} */
  const period = v(periodSelectId) || 'all';
  if (period === 'all') return list;
  if (period === 'date') {
    /** @type {string} */
    const exactDate = v(dateInputId) || '';
    return exactDate ? list.filter(item => item[dateField] === exactDate) : list;
  }
  return _filterByPeriod(list, period, dateField);
}

/**
 * Construit l'en-tête logo commun à tous les exports PDF (logo +
 * date de génération + sous-titre optionnel).
 * @param {string} [subtitle]
 * @returns {string} HTML.
 */
function _pdfLogoHeader(subtitle) {
  return `<div style="display:flex;align-items:center;justify-content:space-between;padding-bottom:14px;margin-bottom:20px;border-bottom:2px solid #e2e6ef">
    <img src="${LOGO_PATH}" style="height:52px;width:auto" alt="QualiStore">
    <div style="text-align:right;font-family:Arial,sans-serif">
      <div style="font-size:10px;color:#8a94a6;text-transform:uppercase;letter-spacing:.5px">Généré le ${new Date().toLocaleDateString('fr-FR')}</div>
      ${subtitle ? `<div style="font-size:11px;color:#5a6070;margin-top:2px">${subtitle}</div>` : ''}
    </div>
  </div>`;
}

/**
 * Rend du HTML dans un conteneur hors-écran, le capture avec html2canvas
 * et l'exporte en PDF via jsPDF.
 * @param {string} html - Contenu HTML à exporter (les contrôles interactifs button/select/input/textarea sont retirés avant capture).
 * @param {string} filename - Nom de fichier sans extension (le '.pdf' est ajouté automatiquement).
 * @param {'portrait'|'landscape'} [orientation] - Orientation de la page PDF.
 * @returns {void}
 */
function _renderAndExportPDF(html, filename, orientation = 'portrait') {
  /** @type {number} */
  const pageWidth = orientation === 'landscape' ? 1060 : 794;
  const wrapper   = document.createElement('div');

  wrapper.style.cssText = [
    `position:fixed`, `left:-9999px`, `top:0`,
    `width:${pageWidth}px`, `background:#fff`,
    `padding:24px`, `font-family:Arial,sans-serif`,
    `color:#1a1f36`, `font-size:12px`, `line-height:1.5`, `z-index:-1`,
  ].join(';');

  wrapper.innerHTML = html;
  wrapper.querySelectorAll('button, select, input, textarea').forEach(el => el.remove());
  document.body.appendChild(wrapper);

  requestAnimationFrame(() => requestAnimationFrame(() => {
    html2canvas(wrapper, {
      scale: 2, useCORS: true, backgroundColor: '#ffffff',
      scrollX: 0, scrollY: 0, width: pageWidth, windowWidth: pageWidth + 48,
    }).then(canvas => {
      document.body.removeChild(wrapper);

      const { jsPDF }  = window.jspdf;
      const pdf        = new jsPDF({ orientation, unit: 'pt', format: 'a4' });
      const pdfW       = pdf.internal.pageSize.getWidth();
      const pdfH       = pdf.internal.pageSize.getHeight();
      const margin     = 24;
      const usableW    = pdfW - margin * 2;
      const usableH    = pdfH - margin * 2;
      const ratio      = usableW / (canvas.width / 2);
      const totalH     = (canvas.height / 2) * ratio;
      let   yOffset    = 0;
      let   pageIndex  = 0;

      while (yOffset < totalH) {
        if (pageIndex > 0) pdf.addPage();
        const slicePt = Math.min(usableH, totalH - yOffset);
        const slicePx = Math.round((slicePt / ratio) * 2);
        const startPx = Math.round((yOffset / ratio) * 2);

        const slice = document.createElement('canvas');
        slice.width  = canvas.width;
        slice.height = slicePx;
        slice.getContext('2d').drawImage(canvas, 0, startPx, canvas.width, slicePx, 0, 0, canvas.width, slicePx);
        pdf.addImage(slice.toDataURL('image/jpeg', 0.92), 'JPEG', margin, margin, usableW, slicePt);

        yOffset += usableH;
        pageIndex++;
      }

      pdf.save(`${filename}.pdf`);
    }).catch(err => {
      if (document.body.contains(wrapper)) document.body.removeChild(wrapper);
      alert('Erreur PDF : ' + err.message);
    });
  }));
}

// ─────────────────────────────────────────────
// 10. EXPORTS PDF
// ─────────────────────────────────────────────

/**
 * Exporte en PDF (paysage) la liste des NC actives, filtrée selon
 * les sélecteurs UI courants de la page NC.
 * @returns {void}
 */
function exportNCActivePDF() {
  /** @type {string[]} */
  const storeIds  = visibleMids();
  /** @type {string} */
  const filterMag  = v('flt-nc-mag');
  /** @type {string} */
  const filterRay  = v('flt-nc-ray');
  /** @type {string} */
  const filterCrit = v('flt-nc-crit');
  /** @type {string} */
  const filterStat = v('flt-nc-stat');

  /** @type {NC[]} */
  let list = [...DB.ncs].reverse().filter(nc =>
    (storeIds.includes(nc.mid) || nc.mid === '') && nc.statut !== 'Clôturée'
  );
  if (filterMag)  list = list.filter(nc => nc.mid    === filterMag);
  if (filterRay)  list = list.filter(nc => nc.rayon  === filterRay);
  if (filterCrit) list = list.filter(nc => nc.crit   === filterCrit);
  if (filterStat) list = list.filter(nc => nc.statut === filterStat);
  // ⚠️ CHANGÉ : l'export PDF respecte désormais le même menu combiné
  // période/date précise que le tableau affiché à l'écran (voir
  // renderNC ci-dessus) — plus de sélecteur de période séparé pour
  // l'export (#flt-nc-export-period, supprimé du HTML).
  list = _applyDateFilter(list, 'flt-nc-period', 'flt-nc-date', 'date');

  if (!list.length) { alert('Aucune non-conformité active à exporter pour cette sélection.'); return; }

  /** @type {string} */
  const periodLabel = _buildPeriodLabel('flt-nc-period', 'flt-nc-date');
  /** @type {string} */
  const magLabel    = (filterMag && DB.magasins.find(m => m.id === filterMag)?.nom) || 'Tous les magasins';
  /** @type {string} */
  const subtitle    = [magLabel, filterRay, filterCrit, filterStat].filter(Boolean).join(' · ');

  const html = _buildActiveNcPdfHtml(list, subtitle, periodLabel);
  _renderAndExportPDF(html, 'nc-actives', 'landscape');
}

/**
 * Construit le HTML complet de l'export PDF des NC actives
 * (en-tête, compteurs par criticité, tableau détaillé).
 * @param {NC[]} list
 * @param {string} subtitle
 * @param {string} periodLabel
 * @returns {string}
 */
function _buildActiveNcPdfHtml(list, subtitle, periodLabel) {
  /** @type {{critique: number, majeure: number, mineure: number}} */
  const critCounts = {
    critique: list.filter(n => n.crit === 'Critique').length,
    majeure:  list.filter(n => n.crit === 'Majeure').length,
    mineure:  list.filter(n => n.crit === 'Mineure').length,
  };

  return `<div style="font-family:Arial,sans-serif;color:#1a1f36;padding:8px">
    ${_pdfLogoHeader(subtitle)}
    <div style="border-bottom:3px solid #e53935;padding-bottom:14px;margin-bottom:20px;display:flex;justify-content:space-between;align-items:flex-start">
      <div>
        <h2 style="color:#b91c1c;margin:0;font-size:18px">Non-conformités actives</h2>
        <div style="font-size:11px;color:#5a6070;margin-top:4px">${periodLabel}</div>
      </div>
      <div style="display:flex;gap:10px">
        <div style="text-align:center;background:#fdecea;border-radius:8px;padding:10px 14px">
          <div style="font-size:20px;font-weight:700;color:#e53935">${critCounts.critique}</div>
          <div style="font-size:10px;color:#9f1239">Critiques</div>
        </div>
        <div style="text-align:center;background:#fff0e6;border-radius:8px;padding:10px 14px">
          <div style="font-size:20px;font-weight:700;color:#ea580c">${critCounts.majeure}</div>
          <div style="font-size:10px;color:#9a3412">Majeures</div>
        </div>
        <div style="text-align:center;background:#fff8e1;border-radius:8px;padding:10px 14px">
          <div style="font-size:20px;font-weight:700;color:#f59e0b">${critCounts.mineure}</div>
          <div style="font-size:10px;color:#92400e">Mineures</div>
        </div>
      </div>
    </div>
    <table style="width:100%;border-collapse:collapse;font-size:11px">
      <thead>
        <tr style="background:#fdecea">
          ${['Magasin','Rayon','Description','Criticité','Échéance','Statut','💬 Suivi'].map(h =>
            `<th style="padding:8px 10px;border:1px solid #fca5a5;text-align:left;font-size:10px;color:${h.includes('💬') ? '#1a4fa0' : '#b91c1c'};text-transform:uppercase;letter-spacing:.4px${h.includes('💬') ? ';background:#eef3fb' : ''}">${h}</th>`
          ).join('')}
        </tr>
      </thead>
      <tbody>
        ${list.map((nc, i) => _buildActiveNcPdfRow(nc, i)).join('')}
      </tbody>
    </table>
  </div>`;
}

/**
 * Construit la ligne `<tr>` HTML d'une NC dans l'export PDF des
 * NC actives.
 * @param {NC} nc
 * @param {number} index - Index dans la liste, utilisé pour l'alternance de couleur de fond.
 * @returns {string}
 */
function _buildActiveNcPdfRow(nc, index) {
  /** @type {Action | undefined} */
  const action    = DB.actions.find(a => a.ncId === nc.id);
  /** @type {string} */
  const suiviCmt  = action?.cmt || '';
  /** @type {string} */
  const critColor = NC_CRIT_COLORS[nc.crit] || '#888';
  /** @type {boolean} */
  const isEnCours = nc.statut === 'En cours';
  /** @type {boolean} */
  const isLate    = nc.dl && new Date(nc.dl) < new Date() && nc.statut !== 'Clôturée';
  /** @type {string} */
  const statBg    = isEnCours ? '#fff8e1' : '#fdecea';
  /** @type {string} */
  const statColor = isEnCours ? '#92400e' : '#b91c1c';
  /** @type {string} */
  const photosHtml = _buildPdfPhotosHtml(nc);

  return `<tr style="background:${index % 2 === 0 ? '#fff' : '#fafafa'};border-left:3px solid ${critColor}">
    <td style="padding:8px 10px;border:1px solid #e2e6ef;font-size:11px">${nc.mag}</td>
    <td style="padding:8px 10px;border:1px solid #e2e6ef;font-size:11px;white-space:nowrap">${nc.rayon}</td>
    <td style="padding:8px 10px;border:1px solid #e2e6ef">${nc.desc}${photosHtml}</td>
    <td style="padding:8px 10px;border:1px solid #e2e6ef;text-align:center">
      <span style="display:inline-block;padding:2px 7px;border-radius:10px;background:${critColor}18;color:${critColor};font-weight:700;font-size:10px">${nc.crit}</span>
    </td>
    <td style="padding:8px 10px;border:1px solid #e2e6ef;font-size:11px;color:${isLate ? '#e53935' : '#374151'};font-weight:${isLate ? '700' : '400'};white-space:nowrap">${fd(nc.dl)}${isLate ? ' ⚠' : ''}</td>
    <td style="padding:8px 10px;border:1px solid #e2e6ef;text-align:center">
      <span style="display:inline-block;padding:2px 7px;border-radius:10px;background:${statBg};color:${statColor};font-weight:600;font-size:10px">${nc.statut}</span>
    </td>
    <td style="padding:8px 10px;border:1px solid #e2e6ef;background:${isEnCours && suiviCmt ? '#fffbeb' : '#fafafa'}">
      ${suiviCmt
        ? `<span style="font-style:italic;color:${isEnCours ? '#92400e' : '#6b7280'};font-size:11px${isEnCours ? ';font-weight:500' : ''}">${suiviCmt}</span>`
        : '<span style="color:#c0c4cc;font-size:10px">–</span>'}
    </td>
  </tr>`;
}

/**
 * Exporte en PDF (paysage) la liste des NC archivées (clôturées),
 * filtrée selon les sélecteurs UI d'archives.
 * @returns {void}
 */
function exportNCArchivePDF() {
  /** @type {string[]} */
  const storeIds = visibleMids();
  /** @type {string} */
  const archMag  = v('flt-arch-mag')    || '';
  /** @type {string} */
  const archRay  = v('flt-arch-ray')    || '';

  /** @type {NC[]} */
  let archives = [...DB.ncs].reverse().filter(nc =>
    (storeIds.includes(nc.mid) || nc.mid === '') && nc.statut === 'Clôturée'
  );
  if (archMag) archives = archives.filter(nc => nc.mid   === archMag);
  if (archRay) archives = archives.filter(nc => nc.rayon === archRay);
  // ⚠️ CHANGÉ : même menu combiné période/date précise que le tableau
  // affiché à l'écran (voir renderNCArchives), filtrant uniformément
  // sur la date de l'audit (NC.date) — remplace l'ancien filtre par
  // date de clôture réservé à l'export.
  archives = _applyDateFilter(archives, 'flt-arch-period', 'flt-arch-date', 'date');

  if (!archives.length) { alert('Aucune NC clôturée à exporter pour cette sélection.'); return; }

  /** @type {string} */
  const periodLabel = _buildPeriodLabel('flt-arch-period', 'flt-arch-date');
  /** @type {string} */
  const magLabel    = (archMag && DB.magasins.find(m => m.id === archMag)?.nom) || 'Tous les magasins';

  const html = _buildArchiveNcPdfHtml(archives, magLabel, archRay, periodLabel);
  _renderAndExportPDF(html, 'nc-cloturees', 'landscape');
}

/**
 * Construit le HTML complet de l'export PDF des NC archivées
 * (en-tête, compteur global, tableau détaillé).
 * @param {NC[]} archives
 * @param {string} magLabel
 * @param {string} archRay
 * @param {string} periodLabel
 * @returns {string}
 */
function _buildArchiveNcPdfHtml(archives, magLabel, archRay, periodLabel) {
  return `<div style="font-family:Arial,sans-serif;color:#1a1f36;padding:8px">
    ${_pdfLogoHeader(magLabel + (archRay ? ' · ' + archRay : ''))}
    <div style="border-bottom:3px solid #16a34a;padding-bottom:14px;margin-bottom:20px;display:flex;justify-content:space-between;align-items:flex-start">
      <div>
        <h2 style="color:#15803d;margin:0;font-size:18px">Non-conformités clôturées</h2>
        <div style="font-size:11px;color:#5a6070;margin-top:4px">${periodLabel}</div>
      </div>
      <div style="text-align:center;background:#dcfce7;border-radius:8px;padding:10px 16px">
        <div style="font-size:24px;font-weight:700;color:#16a34a">${archives.length}</div>
        <div style="font-size:10px;color:#15803d">NC clôturées</div>
      </div>
    </div>
    <table style="width:100%;border-collapse:collapse;font-size:11px">
      <thead>
        <tr style="background:#f0fdf4">
          ${['Magasin','Rayon','Description','Criticité','Clôturée le','💬 Commentaire de suivi'].map(h =>
            `<th style="padding:8px 10px;border:1px solid #a7f3d0;text-align:left;font-size:10px;text-transform:uppercase;letter-spacing:.4px;color:${h.includes('💬') ? '#1a4fa0' : '#15803d'}${h.includes('💬') ? ';background:#eef3fb' : ''}">${h}</th>`
          ).join('')}
        </tr>
      </thead>
      <tbody>
        ${archives.map((nc, i) => _buildArchiveNcPdfRow(nc, i)).join('')}
      </tbody>
    </table>
  </div>`;
}

/**
 * Construit la ligne `<tr>` HTML d'une NC dans l'export PDF des
 * NC archivées.
 * @param {NC} nc
 * @param {number} index
 * @returns {string}
 */
function _buildArchiveNcPdfRow(nc, index) {
  /** @type {Action | undefined} */
  const action    = DB.actions.find(a => a.ncId === nc.id);
  /** @type {string} */
  const suiviCmt  = nc.cmt || action?.cmt || '';
  /** @type {string} */
  const critColor = NC_CRIT_COLORS[nc.crit] || '#888';
  /** @type {string} */
  const photosHtml = _buildPdfPhotosHtml(nc, '#d1fae5');

  return `<tr style="background:${index % 2 === 0 ? '#fff' : '#f0fdf4'};border-left:3px solid ${critColor}">
    <td style="padding:8px 10px;border:1px solid #d1fae5;font-size:11px">${nc.mag}</td>
    <td style="padding:8px 10px;border:1px solid #d1fae5;font-size:11px;white-space:nowrap">${nc.rayon}</td>
    <td style="padding:8px 10px;border:1px solid #d1fae5">${nc.desc}${photosHtml}</td>
    <td style="padding:8px 10px;border:1px solid #d1fae5;text-align:center">
      <span style="display:inline-block;padding:2px 7px;border-radius:10px;background:${critColor}18;color:${critColor};font-weight:700;font-size:10px">${nc.crit}</span>
    </td>
    <td style="padding:8px 10px;border:1px solid #d1fae5;font-size:11px;color:#16a34a;white-space:nowrap">${nc.closedDate ? fd(nc.closedDate) : '–'}</td>
    <td style="padding:8px 10px;border:1px solid #d1fae5;background:${suiviCmt ? '#f0fdf4' : '#fafafa'}">
      ${suiviCmt ? `<span style="font-style:italic;color:#15803d;font-size:11px">${suiviCmt}</span>` : '<span style="color:#c0c4cc;font-size:10px">–</span>'}
    </td>
  </tr>`;
}

/**
 * Exporte en PDF (paysage) les NC actuellement cochées dans la
 * liste active, indépendamment des filtres appliqués.
 * @returns {void}
 */
function exportSelectedNC() {
  /** @type {string[]} */
  const selectedIds = [...document.querySelectorAll('.nc-cb:checked')].map(cb => cb.value);
  if (!selectedIds.length) { alert('Sélectionnez au moins une NC.'); return; }

  /** @type {string} */
  const filterMag = v('flt-nc-mag');
  /** @type {string} */
  const magLabel  = (filterMag && DB.magasins.find(m => m.id === filterMag)?.nom) || 'Tous les magasins';
  /** @type {NC[]} */
  const list      = DB.ncs.filter(nc => selectedIds.includes(nc.id));

  const html = `<div style="font-family:Arial,sans-serif;color:#1a1f36;padding:8px">
    ${_pdfLogoHeader(magLabel)}
    <div style="border-bottom:3px solid #e53935;padding-bottom:14px;margin-bottom:20px;display:flex;justify-content:space-between;align-items:flex-start">
      <div>
        <h2 style="color:#b91c1c;margin:0;font-size:18px">Non-conformités sélectionnées</h2>
        <div style="font-size:11px;color:#5a6070;margin-top:4px">${list.length} NC · Généré le ${new Date().toLocaleDateString('fr-FR')}</div>
      </div>
    </div>
    <table style="width:100%;border-collapse:collapse;font-size:11px">
      <thead>
        <tr style="background:#fdecea">
          ${['Magasin','Rayon','Description','Criticité','Échéance','Statut','💬 Suivi'].map(h =>
            `<th style="padding:8px 10px;border:1px solid #fca5a5;text-align:left;font-size:10px;color:${h.includes('💬') ? '#1a4fa0' : '#b91c1c'};text-transform:uppercase;letter-spacing:.4px${h.includes('💬') ? ';background:#eef3fb' : ''}">${h}</th>`
          ).join('')}
        </tr>
      </thead>
      <tbody>
        ${list.map((nc, i) => _buildActiveNcPdfRow(nc, i)).join('')}
      </tbody>
    </table>
  </div>`;

  _renderAndExportPDF(html, 'nc-selection', 'landscape');
}

/**
 * Construit le HTML des miniatures photos (depuis audit ou alerte)
 * pour un export PDF.
 *
 * ⚠️ CORRIGÉ : même correction que _buildNcPhotosHtml (matching par
 * `nc.pid` en priorité, repli sur le texte pour compatibilité) — voir
 * sa JSDoc pour le détail du bug corrigé (photos dupliquées/mal
 * assignées quand plusieurs points de contrôle partagent un intitulé
 * identique).
 * @param {NC} nc
 * @param {string} [borderColor] - Couleur de bordure des miniatures.
 * @returns {string} HTML, ou chaîne vide si aucune photo.
 */
function _buildPdfPhotosHtml(nc, borderColor = '#e2e6ef') {
  /** @type {Audit | undefined} */
  const audit      = DB.audits.find(a => a.id === nc.aid);
  /** @type {AuditAnswer | undefined} */
  const answer     = audit?.answers && (
    nc.pid ? audit.answers[nc.pid] : Object.values(audit.answers).find(a => a.q === nc.desc)
  );
  /** @type {string[]} */
  const auditPhotos = answer?.photos || [];

  /** @type {Alerte | false | undefined} */
  const alert       = nc.isAlert && DB.alertes.find(a => a.id === nc.aid);
  /** @type {string[]} */
  const alertPhotos = alert?.photos || [];

  /** @type {string[]} */
  const allPhotos = [...auditPhotos, ...alertPhotos];
  if (!allPhotos.length) return '';

  return `<div style="display:flex;gap:4px;margin-top:6px;flex-wrap:wrap">
    ${allPhotos.map(p => `<img src="${p}" style="width:60px;height:60px;object-fit:cover;border-radius:4px;border:1px solid ${borderColor}">`).join('')}
  </div>`;
}
