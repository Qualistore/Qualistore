// ══════════════════════════════════════════════════════════════
// QUALIMETRE — Page référentiel Qualimètre (lecture seule)
// Dépend de : storage.js (DB, CU), ui.js, grille-qualimetre.js (_getAllZones — plus aucune zone prédéfinie)
// ⚠️ Page apparemment non reliée à la navigation actuelle (aucun
//    #page-qualimetre dans Qualistore.html) — code conservé tel quel,
//    signalé à l'utilisateur plutôt que supprimé de sa propre initiative.
// Note : l'édition se fait depuis la page "Grille Qualimètre" (grille-qualimetre.js)
// ══════════════════════════════════════════════════════════════

// ─────────────────────────────────────────────
// 0. TYPEDEFS JSDoc (pour inférence VSCode / TypeScript)
//    ⚠️ Déduits de l'usage dans ce fichier.
//
//    ⚠️ CHANGÉ : DB.qualimetreGlobal n'est plus une grille unique
//    partagée par toute la base — chaque enseigne a désormais sa
//    propre grille commune (voir QualimetreGlobalMap ci-dessous et
//    getQualimetrePoints, grille-qualimetre.js). Les points d'un
//    magasin personnalisé s'ajoutent à ceux de la grille commune de
//    son enseigne (fusion) : chaque point affiché ici porte donc un
//    champ `_scope` indiquant sa portée réelle (voir
//    _buildQualimetrePointRow).
// ─────────────────────────────────────────────

/**
 * Zone de contrôle du parcours Qualimètre (voir config.js pour la
 * définition canonique).
 * @typedef {Object} QMZone
 * @property {string} id
 * @property {string} emoji
 * @property {string} label
 */

/**
 * Point de contrôle Qualimètre. Même forme que GrillePoint (grille
 * FSQS, voir grille.js/config.js) — q, prec, c, p — mais stocké dans
 * un espace de données distinct (DB.qualimetreCustom /
 * DB.qualimetreGlobal plutôt que DB.grilleCustom).
 * @typedef {Object} GrillePoint
 * @property {string} id
 * @property {string} q - Intitulé du point de contrôle.
 * @property {string} [prec] - Précision/exemple additionnel.
 * @property {string} c - Niveau de criticité (voir GrilleCriticite dans config.js/grille.js).
 * @property {number} p - Poids/pondération.
 */

/**
 * Magasin. Seules .id et .nom sont accédées dans ce fichier ;
 * structure complète dans magasins.js.
 * @typedef {Object} Magasin
 * @property {string} id
 * @property {string} nom
 */

/**
 * Dictionnaire des points Qualimètre personnalisés par magasin,
 * indexé par Magasin.id puis par QMZone.id.
 * @typedef {Record<string, Record<string, GrillePoint[]>>} QualimetreCustomMap
 */

/**
 * Dictionnaire des points Qualimètre communs, indexé par nom
 * d'enseigne PUIS par QMZone.id — chaque enseigne a sa propre grille
 * commune, héritée par tous ses magasins et fusionnée avec leurs
 * éventuels points propres (jamais un remplacement — voir
 * getQualimetrePoints, grille-qualimetre.js).
 * @typedef {Record<string, Record<string, GrillePoint[]>>} QualimetreGlobalMap
 */

// ─────────────────────────────────────────────
// 1. NAVIGATION ET SÉLECTEURS
// ─────────────────────────────────────────────

/**
 * Callback déclenché au changement de magasin sélectionné ; relance
 * simplement le rendu complet de la page Qualimètre.
 * @returns {void}
 */
function onQualMagChange() {
  showQualimetre();
}

/**
 * Repeuple le select de magasins visibles, en préservant la
 * sélection courante si elle reste valide, sinon en sélectionnant
 * le premier magasin visible disponible.
 * @returns {void}
 */
function _renderQualimetreNav() {
  /** @type {string[]} */
  const storeIds = visibleMids();
  const select   = el('qual-mag-sel');
  if (!select) return;

  /** @type {string} */
  const currentValue = select.value;

  // Repeupler en préservant la valeur courante
  while (select.options.length > 1) select.remove(1);
  DB.magasins
    .filter(m => storeIds.includes(m.id))
    .forEach(m => {
      const option = document.createElement('option');
      option.value       = m.id;
      option.textContent = m.nom;
      select.appendChild(option);
    });

  /** @type {boolean} */
  const valueStillExists = [...select.options].some(o => o.value === currentValue);
  if (currentValue && valueStillExists) {
    select.value = currentValue;
  } else {
    /** @type {Magasin | undefined} */
    const firstStore = DB.magasins.find(m => storeIds.includes(m.id));
    if (firstStore) select.value = firstStore.id;
  }
}

// ─────────────────────────────────────────────
// 2. RENDU DE LA PAGE
// ─────────────────────────────────────────────

/**
 * Affiche la page Qualimètre pour le magasin et la zone
 * sélectionnés : titre, badge de source de grille, et liste des
 * points de contrôle (ou état vide approprié).
 * @returns {void}
 */
function showQualimetre() {
  _renderQualimetreNav();

  /** @type {string} */
  const storeId  = v('qual-mag-sel');
  /** @type {string} */
  const zoneId   = v('qual-zone-sel') || (_getAllZones()[0]?.id || '');
  /** @type {Magasin | undefined} */
  const store    = DB.magasins.find(m => m.id === storeId);
  /** @type {QMZone | undefined} */
  const zone     = _getAllZones().find(z => z.id === zoneId);
  // ⚠️ CORRIGÉ : 'admin en dur' -> droit granulaire qgrid_manage
  // (même droit que la page Grille Qualimètre, grille-qualimetre.js).
  // Le nom isAdmin est conservé pour ne pas toucher au reste du fichier.
  /** @type {boolean} */
  const isAdmin  = !!hasPerm('qgrid_manage');

  // Bouton "Gérer la grille" — droit qgrid_manage
  const editBtn = el('btn-edit-qual-grille');
  if (editBtn) editBtn.style.display = isAdmin ? '' : 'none';

  if (!storeId) {
    el('qual-ttl').textContent = '–';
    el('qual-body').innerHTML  = _buildEmptyState(
      'ti-building-store',
      'Sélectionnez un magasin pour afficher son Qualimètre.'
    );
    return;
  }

  /** @type {string} */
  const zoneName = zone ? zone.label : zoneId;
  el('qual-ttl').textContent = `${store ? store.nom : '?'} – ${zoneName}`;

  /** @type {GrillePoint[]} */
  const points = getQualimetrePoints(storeId, zoneId);

  if (!points.length) {
    /** @type {string} */
    const helpText = isAdmin
      ? 'Utilisez <strong>Gérer la grille</strong> pour en ajouter.'
      : 'Les points seront ajoutés par l\'administrateur.';
    el('qual-body').innerHTML = _buildEmptyState(
      'ti-gauge',
      `Aucun point de contrôle pour ${store ? store.nom : ''} – ${zoneName}.<br>${helpText}`
    );
    return;
  }

  el('qual-body').innerHTML =
    _buildPointCountBar(points.length) +
    points.map(point => _buildQualimetrePointRow(point)).join('');
}

// ─────────────────────────────────────────────
// 3. HELPERS DE RENDU
// ─────────────────────────────────────────────

/**
 * Construit un état vide générique (icône + message).
 * @param {string} iconClass - Classe d'icône Tabler (sans préfixe 'ti', ex : 'ti-gauge').
 * @param {string} message - Message HTML affiché (peut contenir des balises simples comme <strong>, <br>).
 * @returns {string}
 */
function _buildEmptyState(iconClass, message) {
  return `<div class="empty-state" style="padding:40px">
    <i class="ti ${iconClass}" style="font-size:40px;color:#ddd8ff"></i>
    <p style="color:var(--text2)">${message}</p>
  </div>`;
}

/**
 * Construit la barre indiquant le nombre de points de contrôle
 * affichés. ⚠️ CHANGÉ : la grille commune de l'enseigne et les points
 * propres au magasin sont désormais fusionnés (voir
 * getQualimetrePoints, grille-qualimetre.js) — chaque point porte
 * donc son propre badge de portée (voir _buildQualimetrePointRow) au
 * lieu d'un badge de source unique pour toute la zone.
 * @param {number} pointCount
 * @returns {string}
 */
function _buildPointCountBar(pointCount) {
  return `<div style="display:flex;align-items:center;gap:8px;padding:10px 20px;background:var(--bg);border-bottom:1px solid var(--border)">
    <span class="tsm tm">${pointCount} point(s)</span>
  </div>`;
}

/**
 * Construit la ligne HTML d'un point de contrôle Qualimètre, avec un
 * badge indiquant sa portée réelle (commun à l'enseigne du magasin,
 * ou personnalisé pour ce magasin précis).
 * @param {GrillePoint & {_scope: 'common'|'store'}} point
 * @returns {string}
 */
function _buildQualimetrePointRow(point) {
  /** @type {string} */
  const scopeBadge = point._scope === 'common'
    ? `<span style="background:#f0fdf4;color:#15803d;border-radius:12px;padding:1px 8px;font-size:10px;font-weight:600;white-space:nowrap">Commun enseigne</span>`
    : `<span style="background:#ede9fe;color:#6d28d9;border-radius:12px;padding:1px 8px;font-size:10px;font-weight:600;white-space:nowrap">Personnalisé magasin</span>`;

  return `<div style="display:flex;align-items:flex-start;gap:12px;padding:12px 20px;border-bottom:1px solid var(--border)">
    <div style="flex:1;min-width:0">
      <div style="display:flex;align-items:center;gap:8px;flex-wrap:wrap">
        <div style="font-size:13px;font-weight:500">${point.q}</div>
        ${scopeBadge}
      </div>
      ${point.prec ? `<div style="font-size:11px;color:var(--text2);margin-top:2px;font-style:italic">${point.prec}</div>` : ''}
    </div>
    <div style="display:flex;gap:8px;align-items:center;flex-shrink:0">
      ${critBdg(point.c)}
      <span class="tsm tm">Poids : <strong>${point.p}</strong></span>
    </div>
  </div>`;
}

// ─────────────────────────────────────────────
// 4. ALIAS DE COMPATIBILITÉ
// ─────────────────────────────────────────────

/**
 * Redirige vers la modale d'édition de la grille Qualimètre.
 * Conservé pour compatibilité avec d'éventuels appels existants.
 */
/**
 * Redirige vers la modale d'édition de la grille Qualimètre.
 * Conservé pour compatibilité avec d'éventuels appels existants.
 * @param {string} storeId - Référence vers Magasin.id.
 * @param {string} rayon - Malgré son nom, référence en réalité une QMZone.id (zone Qualimètre), pas un rayon FSQS — nom de paramètre conservé tel quel pour compatibilité historique.
 * @param {string} [pointId] - Référence vers GrillePoint.id à éditer.
 * @returns {void}
 */
function openQualCtrlModal(storeId, rayon, pointId) {
  openGqCtrlModal(storeId, rayon, pointId);
}
