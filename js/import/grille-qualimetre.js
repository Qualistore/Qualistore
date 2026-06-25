// ══════════════════════════════════════════════════════════════
// GRILLE-QUALIMETRE — Gestion de la grille Qualimètre par zone
// Dépend de : storage.js (DB, CU, save, uid), config.js (QM_ZONES, CDN_SHEETJS, CDN_PDFJS), ui.js,
//             import/import-detect.js (detectConceptMapping, buildSyntheticHeaders, RawImportRow, DetectionResult, ImportConcept),
//             import/import-normalize.js (normalizeRows, findDuplicateRows, NormalizedImportRow, DuplicateMap),
//             import/import-grille.js (_resolveOrCreateZoneFromDocument, ResolvedZone, IMPORT_UNCLASSIFIED_ZONE_LABEL — résolution de zone partagée avec l'import de grille FSQS)
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
 * Ligne de données importée (CSV/XLSX/PDF), après détection des
 * concepts métier et résolution de zone, avant confirmation et
 * application à DB.qualimetreCustom/qualimetreGlobal. La résolution
 * de zone utilise _resolveOrCreateZoneFromDocument (import-grille.js),
 * partagée avec l'import de grille FSQS — une zone non identifiable
 * dans le document est placée dans IMPORT_UNCLASSIFIED_ZONE_LABEL
 * plutôt que de deviner une zone par défaut.
 * @typedef {Object} GqParsedRow
 * @property {string} zoneId - Id de zone résolu (voir ResolvedZone, import-grille.js).
 * @property {string} zoneName - Valeur brute de zone telle que lue dans le fichier source, non résolue. Jamais perdue même si zoneId pointe vers "Non classé".
 * @property {string} q
 * @property {string} prec
 * @property {GrilleCriticite} c
 * @property {number} p
 * @property {string} extra - Contenu des colonnes du document non reconnues comme un concept métier connu, concaténé pour ne perdre aucune information. Voir import-normalize.js.
 * @property {boolean} isDuplicate - Vrai si cette ligne est un quasi-doublon d'une autre ligne du même fichier (voir findDuplicateRows, import-normalize.js) — signalement uniquement, n'exclut jamais la ligne automatiquement.
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
 * @type {GqParsedRow[]}
 */
let _gqImportData = [];

/** @type {RawImportRow[]} Lignes brutes du fichier actuellement chargé (clés = en-têtes d'origine), conservées pour rejouer normalizeRows si le mapping est corrigé manuellement sans re-lire le fichier. */
let _gqRawRows = [];

/** @type {DetectionResult | null} Résultat de détection courant (mapping + scores + en-têtes non mappés), affiché et corrigible dans la modale. */
let _gqDetection = null;

/**
 * Choix de remplacement par zone pour l'import en cours, indexé par
 * zoneId. true = vider la zone avant d'y insérer les nouveaux
 * points ; false = ajouter aux points existants sans rien
 * supprimer. Initialisé à true pour chaque zone détectée (même
 * comportement par défaut que l'ancienne case globale "gqi-replace"),
 * ajustable zone par zone dans l'aperçu avant confirmation.
 * @type {Record<string, boolean>}
 */
let _gqZoneReplaceFlags = {};

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
  _gqRawRows    = [];
  _gqDetection  = null;
  _gqZoneReplaceFlags = {};
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
 * Construit les GqParsedRow à partir de lignes normalisées : filtre
 * les lignes sans intitulé et les lignes de "titre de zone" (sans
 * criticité ni poids), normalise criticité/poids, résout la zone
 * via _resolveOrCreateZoneFromDocument (jamais de zone par défaut
 * devinée), puis signale les quasi-doublons (findDuplicateRows,
 * import-normalize.js — jamais d'exclusion automatique). Factorise
 * la logique partagée entre _gqParseCSV (1er parsing) et
 * _onGqMappingConceptChanged (rejeu après correction manuelle du
 * mapping).
 * @param {NormalizedImportRow[]} normalized
 * @returns {GqParsedRow[]}
 */
function _buildGqParsedRows(normalized) {
  /** @type {GqParsedRow[]} */
  const rows = [];
  normalized.forEach(row => {
    if (!row.q.trim()) return;

    // Ignorer les lignes de titre de zone (criticité et poids vides)
    if (!row.crit && !row.poids) return;

    /** @type {GrilleCriticite} */
    const crit  = _gqNormalizeCrit(row.crit || 'Majeure');
    /** @type {number} */
    const poids = parseInt(row.poids) || GQ_DEFAULT_POIDS[crit];
    /** @type {ResolvedZone} */
    const zone  = _resolveOrCreateZoneFromDocument(row.rayon, '');

    rows.push({ zoneId: zone.id, zoneName: row.rayon, q: row.q.trim(), prec: '', c: crit, p: poids, extra: row.extra || '', isDuplicate: false });
  });

  /** @type {DuplicateMap} */
  const duplicates = findDuplicateRows(rows.map(r => ({ rayon: r.zoneName, q: r.q })));
  duplicates.forEach((_, index) => { rows[index].isDuplicate = true; });

  _gqInitZoneReplaceFlags(rows);

  return rows;
}

/**
 * Synchronise _gqZoneReplaceFlags avec les zones actuellement
 * présentes dans les lignes données : initialise à `true`
 * (remplacer) les zones nouvellement apparues (sans choix déjà
 * enregistré, pour ne jamais écraser un choix existant), et
 * supprime les flags des zones qui ne sont plus présentes (par
 * exemple après une correction manuelle du mapping qui change la
 * colonne de zone). Appelé après chaque (re)construction des lignes.
 * @param {GqParsedRow[]} rows
 * @returns {void}
 */
function _gqInitZoneReplaceFlags(rows) {
  /** @type {Set<string>} */
  const zoneIds = new Set(rows.map(r => r.zoneId));
  zoneIds.forEach(zoneId => {
    if (!(zoneId in _gqZoneReplaceFlags)) _gqZoneReplaceFlags[zoneId] = true;
  });
  Object.keys(_gqZoneReplaceFlags).forEach(zoneId => {
    if (!zoneIds.has(zoneId)) delete _gqZoneReplaceFlags[zoneId];
  });
}

/**
 * Parse un contenu CSV/TSV en lignes RawImportRow (clés = en-têtes
 * bruts du document), détecte les concepts métier (zone, point,
 * criticité, méthode, commentaire) via detectConceptMapping
 * (import-detect.js), normalise via normalizeRows
 * (import-normalize.js), puis résout chaque zone via
 * _resolveOrCreateZoneFromDocument (import-grille.js — partagée
 * avec l'import de grille FSQS, jamais de zone par défaut devinée).
 * Les quasi-doublons sont signalés (voir findDuplicateRows,
 * import-normalize.js) sans jamais être exclus automatiquement.
 *
 * Les lignes de "titre de zone" (sans criticité ni poids — motif
 * fréquent dans les exports où une ligne ne fait que regrouper
 * visuellement une section) sont toujours ignorées, comme dans la
 * version précédente de ce fichier.
 * @param {string} text - Contenu texte brut du fichier.
 * @returns {void}
 */
function _gqParseCSV(text) {
  /** @type {string[]} */
  const lines = text.split(/\r?\n/).filter(l => l.trim());
  if (lines.length < 2) { _gqImportErr('Le fichier est vide ou ne contient pas de données.'); return; }

  /** @type {string} */
  const separator = lines[0].includes(';') ? ';' : lines[0].includes('\t') ? '\t' : ',';
  /** @type {string[][]} */
  const cellRows = lines.map(line => line.split(separator).map(c => c.trim().replace(/^["']|["']$/g, '')));

  /** @type {{rawRows: RawImportRow[], usedHeaderRow: boolean}} */
  const { rawRows } = _buildRawRowsWithHeaderDetection(cellRows);

  /** @type {DetectionResult} */
  const detection = detectConceptMapping(rawRows);
  /** @type {NormalizedImportRow[]} */
  const normalized = normalizeRows(rawRows, detection.mapping, detection.unmappedHeaders);

  /** @type {GqParsedRow[]} */
  const rows = _buildGqParsedRows(normalized);

  if (!rows.length) { _gqImportErr('Aucune ligne valide trouvée.'); return; }
  _gqRawRows   = rawRows;
  _gqDetection = detection;
  _gqImportData = rows;
  _gqRenderImportPreview();
}

/**
 * Extrait le texte d'un fichier PDF via PDF.js (réutilise
 * _extractPdfText, import-grille.js — reconstruction des lignes et
 * colonnes par position X/Y, plus robuste que la simple recherche de
 * séparateurs '|' ou tabulation dans le texte brut), puis parse le
 * résultat avec le même pipeline générique que le CSV (_gqParseCSV).
 * @param {File} file
 * @returns {Promise<void>}
 */
async function _gqParsePDF(file) {
  try {
    /** @type {Object} Document PDF.js — API non typée en détail ici. */
    const pdf  = await pdfjsLib.getDocument({ data: await file.arrayBuffer() }).promise;
    /** @type {string} */
    const text = await _extractPdfText(pdf);
    _gqParseCSV(text);
  } catch (error) {
    _gqImportErr('Erreur lecture PDF : ' + error.message);
  }
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
 * confirmation. Inclut le bloc de mapping corrigible (voir
 * _buildGqMappingBlock) au-dessus du récapitulatif par zone.
 * @returns {void}
 */
function _gqRenderImportPreview() {
  /** @type {GqParsedRow[]} */
  const rows         = _gqImportData;
  /** @type {string} */
  const scope        = el('gqi-mag-sel')?.value || '';
  /** @type {Magasin | null} */
  const store        = scope ? DB.magasins.find(m => m.id === scope) : null;
  /** @type {string} */
  const scopeLabel   = scope
    ? `magasin <strong>${store?.nom || scope}</strong>`
    : `grille <strong>globale</strong>`;

  /** @type {Record<string, GqParsedRow[]>} */
  const byZone = {};
  rows.forEach(r => {
    if (!byZone[r.zoneId]) byZone[r.zoneId] = [];
    byZone[r.zoneId].push(r);
  });

  /** @type {string} */
  const mappingHtml = _gqDetection ? _buildGqMappingBlock(_gqDetection) : '';

  el('gq-import-preview').innerHTML = `
    ${mappingHtml}
    <div style="margin:12px 0 8px;font-size:13px;color:var(--text2)">
      <strong>${rows.length} point(s)</strong> détecté(s) → appliqués à la ${scopeLabel}
    </div>
    ${Object.entries(byZone).map(([zoneId, points]) => {
      /** @type {QMZone | undefined} */
      const zone = QM_ZONES.find(z => z.id === zoneId);
      /** @type {boolean} */
      const willReplace = _gqZoneReplaceFlags[zoneId] ?? true;
      return `<div style="margin-bottom:10px">
        <div style="display:flex;align-items:center;justify-content:space-between;gap:8px;font-size:11px;font-weight:700;color:#5b21b6;text-transform:uppercase;padding:6px 10px;background:#f5f3ff;border-radius:6px;margin-bottom:4px">
          <span>${zone ? `${zone.emoji ? zone.emoji + ' ' : ''}${zone.label}` : zoneId} (${points.length})</span>
          <label style="display:flex;align-items:center;gap:5px;font-size:10px;font-weight:500;text-transform:none;color:#5b21b6;cursor:pointer;white-space:nowrap">
            <input type="checkbox" ${willReplace ? 'checked' : ''} onchange="_onGqZoneReplaceToggle('${zoneId}', this.checked)" style="margin:0">
            Remplacer les points existants
          </label>
        </div>
        ${points.map(p => {
          /** @type {string} */
          const extraIcon = p.extra ? ` <i class="ti ti-info-circle" title="${_escapeHtmlAttr(p.extra)}" style="color:var(--text3);font-size:12px"></i>` : '';
          /** @type {string} */
          const duplicateBadge = p.isDuplicate
            ? ' <span title="Doublon possible avec une autre ligne du fichier" style="color:var(--orange);font-size:10px;border:1px solid var(--orange);border-radius:8px;padding:1px 6px">doublon ?</span>'
            : '';
          return `<div style="display:flex;gap:8px;align-items:center;padding:5px 10px;font-size:12px;border-bottom:1px solid var(--border)">
          <span style="flex:1">${_escapeHtml(p.q)}${duplicateBadge}${extraIcon}</span>
          ${critBdg(p.c)}
          <span class="tsm tm">${p.p}pts</span>
        </div>`;
        }).join('')}
      </div>`;
    }).join('')}`;
}

/**
 * Appelée depuis la checkbox "Remplacer les points existants" d'une
 * zone, dans l'aperçu d'import. Ne touche à aucune donnée tant que
 * confirmGqImport n'est pas déclenché — seule la préférence pour
 * cette zone est mise à jour, lue ensuite par _applyImportToStore.
 * @param {string} zoneId
 * @param {boolean} willReplace
 * @returns {void}
 */
function _onGqZoneReplaceToggle(zoneId, willReplace) {
  _gqZoneReplaceFlags[zoneId] = willReplace;
}

/**
 * Libellés humains des concepts métier, affichés dans le bloc de
 * mapping de la modale d'aperçu Qualimètre. Identique en contenu à
 * IMPORT_CONCEPT_LABELS (import-grille.js), dupliqué ici
 * volontairement pour garder ce fichier sans dépendance fonctionnelle
 * vers les détails d'affichage d'import-grille.js (seule la logique
 * de détection/normalisation/résolution de zone est partagée).
 * @type {Record<ImportConcept, string>}
 */
const GQ_CONCEPT_LABELS = {
  zone:        'Zone',
  point:       'Point de contrôle',
  methode:     'Méthode de vérification',
  criticite:   'Criticité',
  commentaire: 'Commentaire',
  categorie:   'Catégorie',
  poids:       'Poids',
};

/**
 * Construit le bloc HTML affichant, pour chaque concept métier, la
 * colonne détectée (ou aucune), avec un menu déroulant permettant de
 * corriger manuellement l'association — voir
 * _onGqMappingConceptChanged. Équivalent Qualimètre de
 * _buildMappingBlock (import-grille.js).
 * @param {DetectionResult} detection
 * @returns {string}
 */
function _buildGqMappingBlock(detection) {
  /** @type {string[]} */
  const allHeaders = _gqRawRows.length ? Object.keys(_gqRawRows[0]) : [];

  /** @type {string} */
  const rows = Object.keys(GQ_CONCEPT_LABELS).map(concept => {
    /** @type {string | null} */
    const assignedHeader = detection.mapping[concept];
    /** @type {string} */
    const options = ['<option value="">— aucune —</option>']
      .concat(allHeaders.map(h => `<option value="${_escapeHtmlAttr(h)}" ${h === assignedHeader ? 'selected' : ''}>${_escapeHtml(h)}</option>`))
      .join('');

    return `<div style="display:flex;align-items:center;gap:8px;padding:4px 0">
      <span style="flex:0 0 160px;font-size:12px;color:var(--text2)">${GQ_CONCEPT_LABELS[concept]}</span>
      <select class="form-control" style="flex:1;font-size:12px;padding:4px 8px" onchange="_onGqMappingConceptChanged('${concept}', this.value)">${options}</select>
    </div>`;
  }).join('');

  /** @type {string} */
  const unmappedNotice = detection.unmappedHeaders.length
    ? `<div style="margin-top:8px;font-size:11px;color:var(--text3)">Colonnes non utilisées (conservées dans le détail de chaque point) : ${detection.unmappedHeaders.map(_escapeHtml).join(', ')}</div>`
    : '';

  return `<div style="background:var(--bg);border-radius:var(--radius);padding:12px 14px;margin-bottom:4px">
    <div style="font-size:12px;font-weight:600;margin-bottom:6px;color:var(--text)">
      <i class="ti ti-adjustments-horizontal"></i> Colonnes détectées <span style="color:var(--text3);font-weight:400">— corrigez si besoin</span>
    </div>
    ${rows}
    ${unmappedNotice}
  </div>`;
}

/**
 * Appelée depuis le menu déroulant du bloc de mapping Qualimètre
 * lorsque l'utilisateur corrige manuellement l'association d'un
 * concept à une colonne. Rejoue normalizeRows et la résolution de
 * zone SANS re-lire ni re-scanner le fichier. Équivalent Qualimètre
 * de _onMappingConceptChanged (import-grille.js).
 * @param {ImportConcept} concept
 * @param {string} newHeader - En-tête sélectionné, ou chaîne vide pour 'aucune'.
 * @returns {void}
 */
function _onGqMappingConceptChanged(concept, newHeader) {
  if (!_gqDetection) return;

  _gqDetection.mapping[concept] = newHeader || null;

  /** @type {string[]} */
  const allHeaders = _gqRawRows.length ? Object.keys(_gqRawRows[0]) : [];
  /** @type {Set<string>} */
  const assignedHeaders = new Set(Object.values(_gqDetection.mapping).filter(Boolean));
  _gqDetection.unmappedHeaders = allHeaders.filter(h => !assignedHeaders.has(h));

  /** @type {NormalizedImportRow[]} */
  const normalized = normalizeRows(_gqRawRows, _gqDetection.mapping, _gqDetection.unmappedHeaders);

  _gqImportData = _buildGqParsedRows(normalized);
  _gqRenderImportPreview();
}

/**
 * Confirme et applique les données importées dans la portée choisie
 * (magasin spécifique ou grille globale). Le remplacement
 * (vider la zone avant insertion, ou ajouter aux points existants)
 * est décidé zone par zone via _gqZoneReplaceFlags, ajustable dans
 * l'aperçu avant confirmation (voir _onGqZoneReplaceToggle) — il
 * n'y a plus de case globale unique pour tout l'import.
 * @returns {void}
 */
function confirmGqImport() {
  if (!_gqImportData.length) { _gqImportErr('Aucune donnée à importer.'); return; }

  /** @type {string} */
  const storeId = el('gqi-mag-sel')?.value || '';

  if (storeId) {
    if (!DB.qualimetreCustom) DB.qualimetreCustom = {};
    if (!DB.qualimetreCustom[storeId]) DB.qualimetreCustom[storeId] = {};
    _applyImportToStore(DB.qualimetreCustom[storeId]);
  } else {
    if (!DB.qualimetreGlobal) DB.qualimetreGlobal = {};
    _applyImportToStore(DB.qualimetreGlobal);
  }

  save(['qualimetreCustom', 'qualimetreGlobal']);
  closeModal('m-gq-import');
  showToast(`Grille Qualimètre importée (${_gqImportData.length} point(s))`, 'success');
  _gqImportData = [];
  _gqZoneReplaceFlags = {};
  showGrilleQualimetre();
}

/**
 * Applique les données importées (_gqImportData) dans un store
 * (dictionnaire indexé par zoneId — soit DB.qualimetreCustom[storeId],
 * soit DB.qualimetreGlobal directement). Pour chaque zone dont le
 * flag _gqZoneReplaceFlags est vrai, la zone est vidée avant d'y
 * insérer les nouveaux points ; sinon les nouveaux points sont
 * ajoutés aux points existants sans rien supprimer. Une zone absente
 * de _gqZoneReplaceFlags (cas normalement impossible, _gqInitZoneReplaceFlags
 * synchronise toujours l'état) est traitée comme "remplacer", pour
 * rester cohérent avec le comportement par défaut historique.
 * @param {Record<string, GrillePoint[]>} store
 * @returns {void}
 */
function _applyImportToStore(store) {
  /** @type {string[]} */
  const importedZoneIds = [...new Set(_gqImportData.map(r => r.zoneId))];
  importedZoneIds.forEach(zoneId => {
    if (_gqZoneReplaceFlags[zoneId] ?? true) store[zoneId] = [];
  });

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
  _gqRawRows   = [];
  _gqDetection = null;
  _gqZoneReplaceFlags = {};
}
