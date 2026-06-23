// ══════════════════════════════════════════════════════════════
// GRILLE-QUALIMETRE — Gestion de la grille Qualimètre par zone
// Dépend de : storage.js (DB, CU, save, uid), config.js (QM_ZONES, CDN_SHEETJS, CDN_PDFJS), ui.js
// ══════════════════════════════════════════════════════════════

// ─────────────────────────────────────────────
// 0. TYPEDEFS JSDoc (pour inférence VSCode / TypeScript)
//    ⚠️ Déduits de l'usage dans ce fichier.
//
//    ✅ CONFIRMATION DÉFINITIVE (déjà pressentie dans qualimetre.js) :
//    DB.qualimetreCustom est Record<storeId, Record<zoneId, GrillePoint[]>>
//    et DB.qualimetreGlobal est Record<zoneId, GrillePoint[]> — ce
//    fichier les construit explicitement avec cette forme exacte
//    (voir _upsertQualimetrePoint, _applyImportToStore).
// ─────────────────────────────────────────────

/**
 * Niveau de criticité (voir config.js/grille.js/nc.js pour la
 * définition canonique).
 * @typedef {'Critique'|'Majeure'|'Mineure'} GrilleCriticite
 */

/**
 * Point de contrôle Qualimètre. Pour les points créés via ce
 * fichier (saisie manuelle ou import), .cat vaut toujours 'Général'
 * — contrairement à la grille FSQS où cat varie selon
 * section/sous-catégorie (voir grille.js).
 * @typedef {Object} GrillePoint
 * @property {string} id - Préfixé 'gq-' + uid().
 * @property {string} q
 * @property {string} prec - Chaîne vide si absent.
 * @property {string} cat - Toujours 'Général' pour les points créés ici.
 * @property {number} p
 * @property {GrilleCriticite} c
 */

/**
 * Zone de contrôle du parcours Qualimètre (voir config.js). Peut
 * aussi être une zone "ad hoc" non définie dans QM_ZONES mais
 * présente dans DB.qualimetreGlobal (label de fallback = son id,
 * emoji vide) — voir _getAllZones.
 * @typedef {Object} QMZone
 * @property {string} id
 * @property {string} emoji
 * @property {string} label
 */

/**
 * Zone enrichie de ses points de contrôle résolus pour un magasin
 * donné (résultat de getQualimetreGrille).
 * @typedef {Object} QMZoneWithPoints
 * @property {string} id
 * @property {string} emoji
 * @property {string} label
 * @property {GrillePoint[]} points
 */

/**
 * Dictionnaire des points Qualimètre personnalisés par magasin,
 * indexé par Magasin.id puis par QMZone.id.
 * @typedef {Record<string, Record<string, GrillePoint[]>>} QualimetreCustomMap
 */

/**
 * Dictionnaire des points Qualimètre globaux, indexé par QMZone.id.
 * @typedef {Record<string, GrillePoint[]>} QualimetreGlobalMap
 */

/**
 * Portée d'édition d'un point Qualimètre : un magasin spécifique ou
 * la grille globale.
 * @typedef {'mag'|'global'} GqScope
 */

/**
 * Ligne de données importée (CSV/XLSX/PDF), avant confirmation et
 * application à DB.qualimetreCustom/qualimetreGlobal.
 * @typedef {Object} GqImportRow
 * @property {string} zoneId - Id de zone résolu (voir _gqResolveZoneId).
 * @property {string} zoneName - Valeur brute de zone telle que lue dans le fichier source, non résolue.
 * @property {string} q
 * @property {string} prec
 * @property {GrilleCriticite} c
 * @property {number} p
 */

/**
 * Magasin. Seules .id et .nom sont accédées dans ce fichier ;
 * structure complète dans magasins.js.
 * @typedef {Object} Magasin
 * @property {string} id
 * @property {string} nom
 */

// ─────────────────────────────────────────────
// 1. CONSTANTES
// ─────────────────────────────────────────────

/**
 * Poids par défaut selon la criticité.
 * @type {Record<GrilleCriticite, number>}
 */
const GQ_DEFAULT_POIDS = { Critique: 10, Majeure: 5, Mineure: 2 };

// ─────────────────────────────────────────────
// 2. ÉTAT
// ─────────────────────────────────────────────

/**
 * Données parsées en attente de confirmation d'import.
 * @type {GqImportRow[]}
 */
let _gqImportData = [];

// ─────────────────────────────────────────────
// 3. ACCÈS AUX POINTS — source de vérité unique
// Priorité : personnalisation magasin > grille globale > vide
// ─────────────────────────────────────────────

/**
 * Retourne les points de contrôle d'une zone pour un magasin donné.
 * Respecte la priorité : custom magasin > global > [].
 * @param {string | null} storeId - Référence vers Magasin.id, ou null/chaîne vide pour ignorer la personnalisation magasin.
 * @param {string} zoneId - Référence vers QMZone.id.
 * @returns {GrillePoint[]}
 */
function getQualimetrePoints(storeId, zoneId) {
  if (storeId) {
    /** @type {GrillePoint[]} */
    const storePoints = DB.qualimetreCustom?.[storeId]?.[zoneId] || [];
    if (storePoints.length) return storePoints;
  }
  /** @type {GrillePoint[]} */
  const globalPoints = DB.qualimetreGlobal?.[zoneId] || [];
  if (globalPoints.length) return globalPoints;
  return [];
}

/**
 * Retourne la grille complète d'un magasin :
 * toutes les zones qui ont au moins un point.
 * @param {string | null} storeId
 * @returns {QMZoneWithPoints[]}
 */
function getQualimetreGrille(storeId) {
  /** @type {Set<string>} */
  const zoneIds = new Set([
    ...QM_ZONES.map(z => z.id),
    ...Object.keys(DB.qualimetreGlobal || {}),
  ]);

  return [...zoneIds]
    .map(zoneId => {
      /** @type {QMZone} */
      const zoneMeta = QM_ZONES.find(z => z.id === zoneId) || { id: zoneId, emoji: '', label: zoneId };
      return { ...zoneMeta, points: getQualimetrePoints(storeId, zoneId) };
    })
    .filter(zone => zone.points.length > 0);
}

// ─────────────────────────────────────────────
// 4. PAGE GRILLE QUALIMÈTRE
// ─────────────────────────────────────────────

/**
 * Affiche la page de gestion de la grille Qualimètre : peuple les
 * sélecteurs de zone/magasin puis rend le contenu.
 * @returns {void}
 */
function showGrilleQualimetre() {
  _buildGqZoneSelect();
  _buildGqMagSelect();
  _gqRender();
}

/** @returns {void} */
function onGqMagChange()  { _gqRender(); }
/** @returns {void} */
function onGqZoneChange() { _gqRender(); }

/**
 * Peuple le select de zones (QM_ZONES + zones ad hoc présentes dans
 * qualimetreGlobal).
 * @returns {void}
 */
function _buildGqZoneSelect() {
  const select = el('gq-zone-sel');
  if (!select) return;

  /** @type {QMZone[]} */
  const allZones = _getAllZones();
  select.innerHTML = allZones.map(zone =>
    `<option value="${zone.id}">${zone.emoji ? zone.emoji + ' ' : ''}${zone.label}</option>`
  ).join('');
}

/**
 * Peuple le select de magasins visibles, en préservant la sélection
 * courante si elle reste valide.
 * @returns {void}
 */
function _buildGqMagSelect() {
  const select = el('gq-mag-sel');
  if (!select) return;

  /** @type {string} */
  const currentValue = select.value;
  while (select.options.length > 1) select.remove(1);

  DB.magasins
    .filter(m => visibleMids().includes(m.id))
    .forEach(m => {
      const option = document.createElement('option');
      option.value       = m.id;
      option.textContent = m.nom;
      select.appendChild(option);
    });

  if (currentValue && [...select.options].some(o => o.value === currentValue)) {
    select.value = currentValue;
  }
}

/**
 * Fusionne QM_ZONES avec les zones présentes dans qualimetreGlobal
 * (zones "ad hoc" créées via import, sans métadonnées emoji/label).
 * @returns {QMZone[]}
 */
function _getAllZones() {
  /** @type {string[]} */
  const globalZoneIds = Object.keys(DB.qualimetreGlobal || {});
  return [
    ...QM_ZONES,
    ...globalZoneIds
      .filter(id => !QM_ZONES.find(z => z.id === id))
      .map(id => ({ id, emoji: '', label: id })),
  ];
}

/**
 * Affiche le contenu de la zone Qualimètre sélectionnée (barre de
 * source + liste des points), ou un état vide si aucun point.
 * @returns {void}
 */
function _gqRender() {
  /** @type {string} */
  const storeId  = v('gq-mag-sel');
  /** @type {string} */
  const zoneId   = v('gq-zone-sel') || QM_ZONES[0]?.id;
  /** @type {boolean} */
  const isAdmin  = CU && CU.role === 'admin';

  _gqUpdateAdminButtons(isAdmin);
  _gqUpdateScopeLabel(storeId);

  /** @type {GrillePoint[]} */
  const points         = getQualimetrePoints(storeId || null, zoneId);
  /** @type {boolean} */
  const isCustomStore  = storeId && (DB.qualimetreCustom?.[storeId]?.[zoneId] || []).length > 0;
  /** @type {boolean} */
  const isCustomGlobal = (DB.qualimetreGlobal?.[zoneId] || []).length > 0;
  /** @type {boolean} */
  const isBase         = !isCustomStore && !isCustomGlobal;

  const body = el('gq-body');
  if (!body) return;

  if (!points.length) {
    /** @type {string} */
    const helpText = isAdmin
      ? 'Utilisez « Ajouter » ou « Importer » pour commencer.'
      : 'Les points seront ajoutés par l\'administrateur.';
    body.innerHTML = `<div class="empty-state" style="padding:40px">
      <i class="ti ti-gauge" style="font-size:40px;color:#ddd8ff"></i>
      <p style="color:var(--text2)">Aucun point de contrôle pour cette zone.<br>${helpText}</p>
    </div>`;
    return;
  }

  body.innerHTML =
    _buildGqSourceBar(isCustomStore, isCustomGlobal, isBase, isAdmin, storeId, zoneId, points.length) +
    points.map(point => _buildGqPointRow(point, isAdmin, storeId, zoneId)).join('');
}

/**
 * Affiche/masque les boutons réservés aux administrateurs
 * (ajouter, importer, réinitialiser).
 * @param {boolean} isAdmin
 * @returns {void}
 */
function _gqUpdateAdminButtons(isAdmin) {
  ['gq-btn-add', 'gq-btn-import', 'gq-btn-reset'].forEach(id => {
    const btn = el(id);
    if (btn) btn.style.display = isAdmin ? '' : 'none';
  });
}

/**
 * Met à jour le libellé indiquant la portée de la grille affichée
 * (magasin spécifique ou grille globale).
 * @param {string} storeId - Référence vers Magasin.id, ou chaîne vide pour la grille globale.
 * @returns {void}
 */
function _gqUpdateScopeLabel(storeId) {
  const scopeEl = el('gq-scope-label');
  if (!scopeEl) return;
  if (storeId) {
    /** @type {Magasin | undefined} */
    const store = DB.magasins.find(m => m.id === storeId);
    scopeEl.innerHTML = `Grille personnalisée pour <strong>${store ? store.nom : storeId}</strong>`;
  } else {
    scopeEl.innerHTML = `Grille <strong>globale</strong> (appliquée à tous les magasins sans personnalisation)`;
  }
}

/**
 * Construit la barre d'info indiquant la source de la grille
 * affichée, avec un bouton de réinitialisation pour les admins si
 * la zone n'est pas au référentiel de base.
 * @param {boolean} isCustomStore
 * @param {boolean} isCustomGlobal
 * @param {boolean} isBase
 * @param {boolean} isAdmin
 * @param {string} storeId
 * @param {string} zoneId
 * @param {number} pointCount
 * @returns {string}
 */
function _buildGqSourceBar(isCustomStore, isCustomGlobal, isBase, isAdmin, storeId, zoneId, pointCount) {
  /** @type {string} */
  const badge = isCustomStore
    ? `<span style="background:#ede9fe;color:#6d28d9;border-radius:12px;padding:2px 10px;font-size:11px;font-weight:600">Personnalisé magasin</span>`
    : isCustomGlobal
      ? `<span style="background:#f0fdf4;color:#15803d;border-radius:12px;padding:2px 10px;font-size:11px;font-weight:600">Grille globale</span>`
      : `<span style="background:#f1f5f9;color:#64748b;border-radius:12px;padding:2px 10px;font-size:11px;font-weight:600">Référentiel de base</span>`;

  /** @type {string} */
  const resetBtn = isAdmin && !isBase
    ? `<button class="btn btn-secondary btn-sm" style="margin-left:auto" onclick="_gqResetZone('${storeId || ''}','${zoneId}')">
         <i class="ti ti-refresh"></i> Réinitialiser cette zone
       </button>`
    : '';

  return `<div style="display:flex;align-items:center;gap:8px;padding:10px 20px;background:var(--bg);border-bottom:1px solid var(--border)">
    ${badge}
    <span class="tsm tm">${pointCount} point(s)</span>
    ${resetBtn}
  </div>`;
}

/**
 * Construit la ligne HTML d'un point de contrôle Qualimètre, avec
 * boutons modifier/supprimer pour les admins.
 * @param {GrillePoint} point
 * @param {boolean} isAdmin
 * @param {string} storeId
 * @param {string} zoneId
 * @returns {string}
 */
function _buildGqPointRow(point, isAdmin, storeId, zoneId) {
  /** @type {string} */
  const actionButtons = isAdmin
    ? `<button class="btn btn-secondary btn-sm" onclick="openGqCtrlModal('${storeId || ''}','${zoneId}','${point.id}')" aria-label="Modifier">
         <i class="ti ti-pencil"></i>
       </button>
       <button class="btn btn-danger btn-sm" onclick="delGqCtrl('${storeId || ''}','${zoneId}','${point.id}')" aria-label="Supprimer">
         <i class="ti ti-trash"></i>
       </button>`
    : '';

  return `<div style="display:flex;align-items:flex-start;gap:12px;padding:12px 20px;border-bottom:1px solid var(--border)">
    <div style="flex:1;min-width:0">
      <div style="font-size:13px;font-weight:500">${point.q}</div>
      ${point.prec ? `<div style="font-size:11px;color:var(--text2);margin-top:2px;font-style:italic">${point.prec}</div>` : ''}
    </div>
    <div style="display:flex;gap:8px;align-items:center;flex-shrink:0">
      ${critBdg(point.c)}
      <span class="tsm tm">Poids : <strong>${point.p}</strong></span>
      ${actionButtons}
    </div>
  </div>`;
}

// ─────────────────────────────────────────────
// 5. MODAL AJOUT / ÉDITION D'UN POINT
// ─────────────────────────────────────────────

/**
 * Ouvre la modale de création/édition d'un point Qualimètre.
 * @param {string} storeId - Référence vers Magasin.id ; chaîne vide pour la grille globale.
 * @param {string} zoneId - Référence vers QMZone.id.
 * @param {string} [pointId] - Référence vers GrillePoint.id à éditer ; absent/falsy pour une création.
 * @returns {void}
 */
function openGqCtrlModal(storeId, zoneId, pointId) {
  /** @type {string} */
  const resolvedStoreId = storeId || v('gq-mag-sel') || '';
  /** @type {string} */
  const resolvedZoneId  = zoneId  || v('gq-zone-sel') || QM_ZONES[0]?.id;
  /** @type {boolean} */
  const isEdit          = !!pointId;

  el('m-gq-ctrl-ttl').innerHTML = isEdit
    ? '<i class="ti ti-pencil" style="color:#7c3aed"></i> Modifier le point Qualimètre'
    : '<i class="ti ti-gauge" style="color:#7c3aed"></i> Nouveau point Qualimètre';

  el('gq-ctrl-err').classList.remove('show');
  sv('gqc-id',   pointId      || '');
  sv('gqc-mid',  resolvedStoreId);
  sv('gqc-zone', resolvedZoneId);

  // Scope radio
  /** @type {GqScope} */
  const scope = resolvedStoreId ? 'mag' : 'global';
  document.querySelectorAll('input[name="gqc-scope"]').forEach(radio => {
    radio.checked = radio.value === scope;
  });
  _gqToggleScopeUI(scope);

  _buildGqCtrlZoneSelect(resolvedZoneId);
  _buildGqCtrlMagSelect(resolvedStoreId);

  if (isEdit) {
    _populateGqCtrlForm(resolvedStoreId, resolvedZoneId, pointId);
  } else {
    _resetGqCtrlForm();
  }

  openModal('m-gq-ctrl');
}

/**
 * Peuple le select de zones de la modale d'édition de point.
 * @param {string} selectedZoneId
 * @returns {void}
 */
function _buildGqCtrlZoneSelect(selectedZoneId) {
  const select = el('gqc-zone-sel');
  if (!select) return;
  /** @type {QMZone[]} */
  const allZones = _getAllZones();
  select.innerHTML = allZones
    .map(zone => `<option value="${zone.id}"${zone.id === selectedZoneId ? ' selected' : ''}>${zone.emoji ? zone.emoji + ' ' : ''}${zone.label}</option>`)
    .join('');
}

/**
 * Peuple le select de magasins de la modale d'édition de point
 * (option "Tous les magasins" pour la portée globale).
 * @param {string} selectedStoreId
 * @returns {void}
 */
function _buildGqCtrlMagSelect(selectedStoreId) {
  const select = el('gqc-mag-sel');
  if (!select) return;
  select.innerHTML =
    '<option value="">— Tous les magasins —</option>' +
    DB.magasins
      .filter(m => visibleMids().includes(m.id))
      .map(m => `<option value="${m.id}"${m.id === selectedStoreId ? ' selected' : ''}>${m.nom}</option>`)
      .join('');
}

/**
 * Pré-remplit le formulaire avec les données d'un point existant
 * (recherché dans qualimetreCustom[storeId][zoneId], sinon
 * qualimetreGlobal[zoneId]).
 * @param {string} storeId
 * @param {string} zoneId
 * @param {string} pointId - Référence vers GrillePoint.id.
 * @returns {void}
 */
function _populateGqCtrlForm(storeId, zoneId, pointId) {
  /** @type {GrillePoint[]} */
  let points = [];
  if (storeId && DB.qualimetreCustom?.[storeId]?.[zoneId]) {
    points = DB.qualimetreCustom[storeId][zoneId];
  } else if (DB.qualimetreGlobal?.[zoneId]) {
    points = DB.qualimetreGlobal[zoneId];
  }

  /** @type {GrillePoint | undefined} */
  const point = points.find(p => p.id === pointId);
  if (!point) return;

  sv('gqc-q',    point.q);
  sv('gqc-prec', point.prec || '');
  sv('gqc-poids', point.p);
  el('gqc-crit').value = point.c;
}

/**
 * Réinitialise le formulaire de point Qualimètre pour une création.
 * @returns {void}
 */
function _resetGqCtrlForm() {
  sv('gqc-q', '');
  sv('gqc-prec', '');
  sv('gqc-poids', '');
  el('gqc-crit').value = 'Majeure';
}

/**
 * Affiche/masque le sélecteur de magasin selon la portée choisie.
 * @param {GqScope} scope
 * @returns {void}
 */
function _gqToggleScopeUI(scope) {
  const magRow = el('gqc-mag-row');
  if (magRow) magRow.style.display = scope === 'mag' ? '' : 'none';
}

// ─────────────────────────────────────────────
// 6. SAUVEGARDE D'UN POINT
// ─────────────────────────────────────────────

/**
 * Valide et sauvegarde le formulaire de point Qualimètre, dans la
 * portée choisie (magasin spécifique ou grille globale).
 * @returns {void}
 */
function saveGqCtrl() {
  /** @type {string} */
  const intitule  = v('gqc-q').trim();
  /** @type {string} */
  const precision = v('gqc-prec').trim();
  /** @type {GrilleCriticite} */
  const criticite = el('gqc-crit').value;
  const errorEl   = el('gq-ctrl-err');

  if (!intitule) {
    errorEl.textContent = 'L\'intitulé est requis.';
    errorEl.classList.add('show');
    return;
  }

  /** @type {number} */
  const poids      = parseInt(v('gqc-poids')) || GQ_DEFAULT_POIDS[criticite];
  /** @type {string} */
  const zoneId     = el('gqc-zone-sel') ? el('gqc-zone-sel').value : v('gqc-zone');
  const scopeRadio = [...document.querySelectorAll('input[name="gqc-scope"]')].find(r => r.checked);
  /** @type {GqScope} */
  const scope      = scopeRadio ? scopeRadio.value : 'global';
  /** @type {string} */
  const storeId    = scope === 'mag' ? (el('gqc-mag-sel') ? el('gqc-mag-sel').value : v('gqc-mid')) : '';
  /** @type {string} */
  const existingId = v('gqc-id');

  /** @type {GrillePoint} */
  const newPoint = {
    id:   existingId || 'gq-' + uid(),
    q:    intitule,
    prec: precision,
    cat:  'Général',
    p:    poids,
    c:    criticite,
  };

  _upsertQualimetrePoint(storeId, zoneId, existingId, newPoint);
  save(['qualimetreCustom', 'qualimetreGlobal']);
  closeModal('m-gq-ctrl');

  // Restaurer les sélecteurs sur la bonne valeur
  if (el('gq-mag-sel')  && storeId) el('gq-mag-sel').value  = storeId;
  if (el('gq-zone-sel') && zoneId)  el('gq-zone-sel').value = zoneId;

  showGrilleQualimetre();
}

/**
 * Insère ou met à jour un point dans le store approprié (magasin ou
 * global), avec lazy-init des niveaux intermédiaires manquants.
 * @param {string} storeId - Référence vers Magasin.id ; chaîne vide pour la grille globale.
 * @param {string} zoneId - Référence vers QMZone.id.
 * @param {string} existingId - Référence vers GrillePoint.id à mettre à jour ; chaîne vide pour une création.
 * @param {GrillePoint} newPoint
 * @returns {void}
 */
function _upsertQualimetrePoint(storeId, zoneId, existingId, newPoint) {
  if (storeId) {
    if (!DB.qualimetreCustom) DB.qualimetreCustom = {};
    if (!DB.qualimetreCustom[storeId]) DB.qualimetreCustom[storeId] = {};
    if (!DB.qualimetreCustom[storeId][zoneId]) DB.qualimetreCustom[storeId][zoneId] = [];
    _upsertInArray(DB.qualimetreCustom[storeId][zoneId], existingId, newPoint);
  } else {
    if (!DB.qualimetreGlobal) DB.qualimetreGlobal = {};
    if (!DB.qualimetreGlobal[zoneId]) DB.qualimetreGlobal[zoneId] = [];
    _upsertInArray(DB.qualimetreGlobal[zoneId], existingId, newPoint);
  }
}

/**
 * Insère ou met à jour un élément dans un tableau identifié par
 * `.id`, par mutation en place.
 * @param {GrillePoint[]} array
 * @param {string} existingId - Id à rechercher pour une mise à jour ; chaîne vide pour forcer un push.
 * @param {GrillePoint} newItem
 * @returns {void}
 */
function _upsertInArray(array, existingId, newItem) {
  if (existingId) {
    /** @type {number} */
    const index = array.findIndex(x => x.id === existingId);
    if (index >= 0) array[index] = newItem;
    else array.push(newItem);
  } else {
    array.push(newItem);
  }
}

// ─────────────────────────────────────────────
// 7. SUPPRESSION ET RÉINITIALISATION
// ─────────────────────────────────────────────

/**
 * Supprime un point de contrôle Qualimètre (magasin ou global),
 * après confirmation.
 * @param {string} storeId - Référence vers Magasin.id ; chaîne vide pour la grille globale.
 * @param {string} zoneId - Référence vers QMZone.id.
 * @param {string} pointId - Référence vers GrillePoint.id.
 * @returns {void}
 */
function delGqCtrl(storeId, zoneId, pointId) {
  if (!confirm('Supprimer ce point de contrôle Qualimètre ?')) return;

  if (storeId) {
    if (!DB.qualimetreCustom?.[storeId]) return;
    DB.qualimetreCustom[storeId][zoneId] = (DB.qualimetreCustom[storeId][zoneId] || []).filter(p => p.id !== pointId);
  } else {
    if (!DB.qualimetreGlobal) return;
    DB.qualimetreGlobal[zoneId] = (DB.qualimetreGlobal[zoneId] || []).filter(p => p.id !== pointId);
  }

  save(['qualimetreCustom', 'qualimetreGlobal']);
  showGrilleQualimetre();
}

/**
 * Réinitialise (supprime tous les points de) une zone, pour la
 * personnalisation magasin ou la grille globale selon `storeId`,
 * après confirmation.
 * @param {string} storeId - Référence vers Magasin.id ; chaîne vide pour la grille globale.
 * @param {string} zoneId - Référence vers QMZone.id.
 * @returns {void}
 */
function _gqResetZone(storeId, zoneId) {
  /** @type {string} */
  const scopeLabel = storeId ? 'la personnalisation magasin' : 'la grille globale';
  if (!confirm(`Réinitialiser ${scopeLabel} pour cette zone ? Les points seront supprimés.`)) return;

  if (storeId) {
    if (DB.qualimetreCustom?.[storeId]) delete DB.qualimetreCustom[storeId][zoneId];
  } else {
    if (DB.qualimetreGlobal) delete DB.qualimetreGlobal[zoneId];
  }

  save(['qualimetreCustom', 'qualimetreGlobal']);
  showGrilleQualimetre();
}

// ─────────────────────────────────────────────
// 8. INITIALISATION
// ─────────────────────────────────────────────

/**
 * Garantit que DB.qualimetreGlobal existe (lazy-init), appelée au
 * démarrage de l'application (voir init.js).
 * @returns {void}
 */
function initQualimetreGlobal() {
  if (!DB.qualimetreGlobal) DB.qualimetreGlobal = {};
  // Les points viennent uniquement de l'import ou de la saisie manuelle
}

// ─────────────────────────────────────────────
// 9. EXPORT CSV
// ─────────────────────────────────────────────

/**
 * Exporte la grille Qualimètre complète d'un magasin (ou globale si
 * aucun magasin sélectionné) en CSV téléchargeable.
 * @returns {void}
 */
function exportGrilleCSV() {
  /** @type {string} */
  const storeId = v('gq-mag-sel') || '';
  /** @type {QMZoneWithPoints[]} */
  const grille  = getQualimetreGrille(storeId || null);

  /** @type {(string|number)[][]} */
  const rows = [['zone', 'question', 'precision', 'criticite', 'poids']];
  grille.forEach(zone => {
    zone.points.forEach(point => {
      rows.push([zone.id, point.q, point.prec || '', point.c, point.p]);
    });
  });

  /** @type {string} */
  const csvContent = rows
    .map(row => row.map(cell => `"${String(cell).replace(/"/g, '""')}"`).join(';'))
    .join('\n');

  const blob = new Blob(['\uFEFF' + csvContent], { type: 'text/csv;charset=utf-8;' });
  const url  = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href     = url;
  link.download = 'grille-qualimetre.csv';
  link.click();
  URL.revokeObjectURL(url);

  showToast('Grille exportée en CSV', 'success');
}

// ─────────────────────────────────────────────
// 10. IMPORT CSV / XLSX / PDF
// ─────────────────────────────────────────────

/**
 * Ouvre la modale d'import de grille Qualimètre, réinitialise
 * l'état d'import et peuple le select de magasins cibles.
 * @returns {void}
 */
function openGqImportModal() {
  _gqImportData = [];
  el('gq-import-preview').innerHTML = '';
  el('gq-import-err').classList.remove('show');

  const magSelect = el('gqi-mag-sel');
  if (magSelect) {
    magSelect.innerHTML =
      '<option value="">— Tous les magasins (global) —</option>' +
      DB.magasins
        .filter(m => visibleMids().includes(m.id))
        .map(m => `<option value="${m.id}">${m.nom}</option>`)
        .join('');
  }

  const fileInput = el('gq-import-file');
  if (fileInput) fileInput.value = '';

  openModal('m-gq-import');
}

/**
 * Détecte le format du fichier sélectionné (CSV, XLSX/XLS, PDF) et
 * délègue au parseur approprié, en chargeant dynamiquement les
 * librairies SheetJS/PDF.js si nécessaire.
 * @param {HTMLInputElement} input - Élément `<input type="file">`.
 * @returns {void}
 */
function handleGqImportFile(input) {
  /** @type {File | undefined} */
  const file = input.files[0];
  if (!file) return;

  /** @type {string} */
  const ext = file.name.split('.').pop().toLowerCase();
  el('gq-import-err').classList.remove('show');
  el('gq-import-preview').innerHTML =
    '<div style="padding:16px;color:var(--text2)"><i class="ti ti-loader" style="animation:spin .8s linear infinite"></i> Lecture du fichier…</div>';

  if (ext === 'csv') {
    const reader = new FileReader();
    reader.onload = event => _gqParseCSV(event.target.result);
    reader.readAsText(file, 'UTF-8');
  } else if (ext === 'xlsx' || ext === 'xls') {
    _gqLoadSheetJS(() => {
      const reader = new FileReader();
      reader.onload = event => {
        /** @type {Object} Classeur XLSX (librairie SheetJS, non typée en détail). */
        const workbook  = XLSX.read(event.target.result, { type: 'array' });
        const worksheet = workbook.Sheets[workbook.SheetNames[0]];
        _gqParseCSV(XLSX.utils.sheet_to_csv(worksheet, { FS: ';' }));
      };
      reader.readAsArrayBuffer(file);
    });
  } else if (ext === 'pdf') {
    _gqLoadPDFJS(() => _gqParsePDF(file));
  } else {
    _gqImportErr('Format non supporté. Utilisez CSV, XLSX ou PDF.');
  }
}

/**
 * Charge dynamiquement la librairie SheetJS (xlsx) depuis le CDN si
 * elle n'est pas déjà présente, puis exécute le callback.
 * @param {() => void} callback
 * @returns {void}
 */
function _gqLoadSheetJS(callback) {
  if (window.XLSX) { callback(); return; }
  const script    = document.createElement('script');
  script.src      = CDN_SHEETJS;
  script.onload   = callback;
  script.onerror  = () => _gqImportErr('Impossible de charger SheetJS.');
  document.head.appendChild(script);
}

/**
 * Charge dynamiquement la librairie PDF.js depuis le CDN si elle
 * n'est pas déjà présente (avec son worker), puis exécute le callback.
 * @param {() => void} callback
 * @returns {void}
 */
function _gqLoadPDFJS(callback) {
  if (window.pdfjsLib) { callback(); return; }
  const script   = document.createElement('script');
  script.src     = CDN_PDFJS;
  script.onload  = () => {
    pdfjsLib.GlobalWorkerOptions.workerSrc = CDN_PDFJS_WORKER;
    callback();
  };
  script.onerror = () => _gqImportErr('Impossible de charger PDF.js.');
  document.head.appendChild(script);
}

/**
 * Parse un contenu CSV/TSV en lignes GqImportRow, en détectant
 * automatiquement le séparateur et les colonnes par en-tête. Ignore
 * les lignes de titre de zone (sans criticité ni poids).
 * @param {string} text - Contenu texte brut du fichier.
 * @returns {void}
 */
function _gqParseCSV(text) {
  /** @type {string[]} */
  const lines = text.split(/\r?\n/).filter(l => l.trim());
  if (lines.length < 2) { _gqImportErr('Le fichier est vide ou ne contient pas de données.'); return; }

  /** @type {string} */
  const separator = lines[0].includes(';') ? ';' : ',';
  /** @type {string[]} */
  const headers   = lines[0].split(separator).map(h => h.trim().toLowerCase().replace(/['"]/g, ''));

  /** @type {number} */
  const idxZone = headers.findIndex(h => h.includes('zone'));
  /** @type {number} */
  const idxQ    = headers.findIndex(h => ['question','q','intitulé','intitule','libelle','libellé'].includes(h));
  /** @type {number} */
  const idxPrec = headers.findIndex(h => ['precision','précision','prec','detail','détail'].includes(h));
  /** @type {number} */
  const idxCrit = headers.findIndex(h => ['criticite','criticité','crit','niveau'].includes(h));
  /** @type {number} */
  const idxPoids = headers.findIndex(h => ['poids','points','weight'].includes(h));

  if (idxQ < 0) {
    _gqImportErr('Colonne "question" introuvable. Vérifiez les en-têtes (zone, question, precision, criticite, poids).');
    return;
  }

  /** @type {GqImportRow[]} */
  const rows = [];
  for (let i = 1; i < lines.length; i++) {
    /** @type {string[]} */
    const cols     = lines[i].split(separator).map(c => c.trim().replace(/^["']|["']$/g, ''));
    /** @type {string} */
    const question = cols[idxQ];
    if (!question) continue;

    // Ignorer les lignes de titre de zone (criticité et poids vides)
    /** @type {string} */
    const critValue  = idxCrit  >= 0 ? cols[idxCrit]  : '';
    /** @type {string} */
    const poidsValue = idxPoids >= 0 ? cols[idxPoids] : '';
    if (!critValue && !poidsValue) continue;

    /** @type {string} */
    const zoneRaw = idxZone >= 0 ? cols[idxZone] : '';
    /** @type {string} */
    const zoneId  = _gqResolveZoneId(zoneRaw);
    /** @type {GrilleCriticite} */
    const crit    = _gqNormalizeCrit(idxCrit >= 0 ? cols[idxCrit] : 'Majeure');
    /** @type {number} */
    const poids   = idxPoids >= 0 ? (parseInt(cols[idxPoids]) || GQ_DEFAULT_POIDS[crit]) : GQ_DEFAULT_POIDS[crit];
    /** @type {string} */
    const prec    = idxPrec >= 0 ? (cols[idxPrec] || '') : '';

    rows.push({ zoneId, zoneName: zoneRaw, q: question, prec, c: crit, p: poids });
  }

  if (!rows.length) { _gqImportErr('Aucune ligne valide trouvée.'); return; }
  _gqImportData = rows;
  _gqRenderImportPreview();
}

/**
 * Extrait le texte d'un fichier PDF via PDF.js et parse les lignes
 * contenant des colonnes séparées par '|' ou tabulation en
 * GqImportRow.
 * @param {File} file
 * @returns {Promise<void>}
 */
async function _gqParsePDF(file) {
  try {
    /** @type {Object} Document PDF.js — API non typée en détail ici. */
    const pdf  = await pdfjsLib.getDocument({ data: await file.arrayBuffer() }).promise;
    let text   = '';

    for (let i = 1; i <= pdf.numPages; i++) {
      const page    = await pdf.getPage(i);
      const content = await page.getTextContent();
      text += content.items.map(item => item.str).join(' ') + '\n';
    }

    /** @type {string[]} */
    const lines = text.split(/\n/).map(l => l.trim()).filter(l => l.length > 8);
    /** @type {GqImportRow[]} */
    const rows  = [];

    lines.forEach(line => {
      /** @type {string[] | null} */
      const parts = line.includes('|') ? line.split('|') : line.includes('\t') ? line.split('\t') : null;
      if (!parts) return;
      const [zoneRaw, question, prec, critRaw, poidsRaw] = parts.map(s => s.trim());
      if (!question) return;

      /** @type {string} */
      const zoneId = _gqResolveZoneId(zoneRaw || '');
      /** @type {GrilleCriticite} */
      const crit   = _gqNormalizeCrit(critRaw || 'Majeure');
      /** @type {number} */
      const poids  = parseInt(poidsRaw) || GQ_DEFAULT_POIDS[crit];
      rows.push({ zoneId, zoneName: zoneRaw || '', q: question, prec: prec || '', c: crit, p: poids });
    });

    if (!rows.length) {
      _gqImportErr('Aucun point extrait du PDF. Le PDF doit contenir des colonnes séparées par | ou tabulation : zone | question | precision | criticite | poids');
      return;
    }

    _gqImportData = rows;
    _gqRenderImportPreview();
  } catch (error) {
    _gqImportErr('Erreur lecture PDF : ' + error.message);
  }
}

/**
 * Résout un identifiant de zone à partir d'une valeur textuelle
 * brute, en essayant successivement : format direct 'zN', id exact,
 * correspondance partielle de label, ou numéro extrait ('Zone 1' →
 * 'z1'). Retombe sur la première zone connue si rien ne correspond.
 * @param {string} raw - Valeur brute de zone telle que lue dans le fichier source.
 * @returns {string} Id de zone résolu.
 */
function _gqResolveZoneId(raw) {
  if (!raw) return QM_ZONES[0]?.id || 'z0';
  /** @type {string} */
  const cleaned = raw.trim();

  // Déjà un id valide : z0, z1… z10
  if (/^z\d+$/i.test(cleaned)) return cleaned.toLowerCase();

  // Chercher par id ou label dans QM_ZONES
  /** @type {QMZone | undefined} */
  const byId    = QM_ZONES.find(z => z.id.toLowerCase()    === cleaned.toLowerCase());
  if (byId) return byId.id;

  /** @type {QMZone | undefined} */
  const byLabel = QM_ZONES.find(z =>
    z.label.toLowerCase().includes(cleaned.toLowerCase()) ||
    cleaned.toLowerCase().includes(z.label.toLowerCase().split('–')[1]?.trim().toLowerCase() || '~~~')
  );
  if (byLabel) return byLabel.id;

  // Extraire un numéro : "Zone 1", "zone1", "1"
  /** @type {string} */
  const num = cleaned.replace(/[^\d]/g, '');
  if (num) return 'z' + num;

  return QM_ZONES[0]?.id || 'z0';
}

/**
 * Normalise une valeur de criticité brute en une des 3 valeurs
 * connues, par détection de sous-chaîne (insensible à la casse).
 * Retombe sur 'Majeure' si aucune correspondance.
 * @param {string} raw
 * @returns {GrilleCriticite}
 */
function _gqNormalizeCrit(raw) {
  /** @type {string} */
  const normalized = (raw || '').toLowerCase().trim();
  if (normalized.includes('crit')) return 'Critique';
  if (normalized.includes('min'))  return 'Mineure';
  return 'Majeure';
}

/**
 * Affiche l'aperçu des données d'import, groupées par zone, avant
 * confirmation.
 * @returns {void}
 */
function _gqRenderImportPreview() {
  /** @type {GqImportRow[]} */
  const rows         = _gqImportData;
  /** @type {string} */
  const scope        = el('gqi-mag-sel')?.value || '';
  /** @type {Magasin | null} */
  const store        = scope ? DB.magasins.find(m => m.id === scope) : null;
  /** @type {string} */
  const scopeLabel   = scope
    ? `magasin <strong>${store?.nom || scope}</strong>`
    : `grille <strong>globale</strong>`;

  /** @type {Record<string, GqImportRow[]>} */
  const byZone = {};
  rows.forEach(r => {
    if (!byZone[r.zoneId]) byZone[r.zoneId] = [];
    byZone[r.zoneId].push(r);
  });

  el('gq-import-preview').innerHTML = `
    <div style="margin:12px 0 8px;font-size:13px;color:var(--text2)">
      <strong>${rows.length} point(s)</strong> détecté(s) → appliqués à la ${scopeLabel}
    </div>
    ${Object.entries(byZone).map(([zoneId, points]) => {
      /** @type {QMZone | undefined} */
      const zone = QM_ZONES.find(z => z.id === zoneId);
      return `<div style="margin-bottom:10px">
        <div style="font-size:11px;font-weight:700;color:#5b21b6;text-transform:uppercase;padding:6px 10px;background:#f5f3ff;border-radius:6px;margin-bottom:4px">
          ${zone ? `${zone.emoji ? zone.emoji + ' ' : ''}${zone.label}` : zoneId} (${points.length})
        </div>
        ${points.map(p => `<div style="display:flex;gap:8px;align-items:center;padding:5px 10px;font-size:12px;border-bottom:1px solid var(--border)">
          <span style="flex:1">${p.q}</span>
          ${critBdg(p.c)}
          <span class="tsm tm">${p.p}pts</span>
        </div>`).join('')}
      </div>`;
    }).join('')}`;
}

/**
 * Confirme et applique les données importées dans la portée choisie
 * (magasin spécifique ou grille globale).
 * @returns {void}
 */
function confirmGqImport() {
  if (!_gqImportData.length) { _gqImportErr('Aucune donnée à importer.'); return; }

  /** @type {string} */
  const storeId = el('gqi-mag-sel')?.value || '';
  /** @type {boolean} */
  const replace = el('gqi-replace')?.checked ?? true;

  if (storeId) {
    if (!DB.qualimetreCustom) DB.qualimetreCustom = {};
    if (!DB.qualimetreCustom[storeId]) DB.qualimetreCustom[storeId] = {};
    _applyImportToStore(DB.qualimetreCustom[storeId], replace);
  } else {
    if (!DB.qualimetreGlobal) DB.qualimetreGlobal = {};
    _applyImportToStore(DB.qualimetreGlobal, replace);
  }

  save(['qualimetreCustom', 'qualimetreGlobal']);
  closeModal('m-gq-import');
  showToast(`Grille Qualimètre importée (${_gqImportData.length} point(s))`, 'success');
  _gqImportData = [];
  showGrilleQualimetre();
}

/**
 * Applique les données importées (_gqImportData) dans un store
 * (dictionnaire indexé par zoneId — soit DB.qualimetreCustom[storeId],
 * soit DB.qualimetreGlobal directement). Si `replace` est vrai, vide
 * d'abord les zones concernées avant d'y insérer les nouveaux points.
 * @param {Record<string, GrillePoint[]>} store
 * @param {boolean} replace
 * @returns {void}
 */
function _applyImportToStore(store, replace) {
  if (replace) {
    /** @type {string[]} */
    const importedZoneIds = [...new Set(_gqImportData.map(r => r.zoneId))];
    importedZoneIds.forEach(zoneId => { store[zoneId] = []; });
  }

  _gqImportData.forEach(row => {
    if (!store[row.zoneId]) store[row.zoneId] = [];
    store[row.zoneId].push({
      id: 'gq-' + uid(), q: row.q, prec: row.prec, cat: 'Général', p: row.p, c: row.c,
    });
  });
}

/**
 * Affiche un message d'erreur dans la modale d'import et vide
 * l'aperçu.
 * @param {string} message
 * @returns {void}
 */
function _gqImportErr(message) {
  const errorEl = el('gq-import-err');
  if (errorEl) { errorEl.textContent = message; errorEl.classList.add('show'); }
  el('gq-import-preview').innerHTML = '';
}
