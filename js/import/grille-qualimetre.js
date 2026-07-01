// ══════════════════════════════════════════════════════════════
// GRILLE-QUALIMETRE — Gestion de la grille Qualimètre par enseigne et par zone
// Dépend de : storage.js (DB, CU, save, uid), config.js (QM_ZONES, CDN_SHEETJS, CDN_PDFJS), ui.js,
//             magasins.js (getKnownEnseignes — classement par enseigne, même liste que pour la grille FSQS),
//             import/import-detect.js (detectConceptMapping, buildSyntheticHeaders, detectImportSeparator, RawImportRow, DetectionResult, ImportConcept),
//             import/import-normalize.js (normalizeRows, findDuplicateRows, NormalizedImportRow, DuplicateMap),
//             import/import-grille.js (_resolveOrCreateZoneFromDocument, ResolvedZone, IMPORT_UNCLASSIFIED_ZONE_LABEL — résolution de zone partagée avec l'import de grille FSQS)
// ══════════════════════════════════════════════════════════════

// ─────────────────────────────────────────────
// 0. TYPEDEFS JSDoc (pour inférence VSCode / TypeScript)
//
//    ⚠️ CHANGÉ : DB.qualimetreGlobal n'est plus indexé directement
//    par QMZone.id (Record<zoneId, GrillePoint[]>, une seule grille
//    partagée par toute la base) mais par nom d'enseigne PUIS par
//    QMZone.id (Record<enseigne, Record<zoneId, GrillePoint[]>>) —
//    chaque enseigne a désormais sa propre grille commune Qualimètre,
//    exactement sur le même principe que DB.grilleCustom pour le
//    FSQS (voir getGrille, grille.js). Les points personnalisés d'un
//    magasin (DB.qualimetreCustom[storeId][zoneId]) s'AJOUTENT
//    désormais à ceux de la grille commune de son enseigne (fusion,
//    jamais un remplacement) — voir getQualimetrePoints.
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
 * @property {(GrillePoint & {_scope: 'common'|'store'})[]} points
 */

/**
 * Dictionnaire des points Qualimètre personnalisés par magasin,
 * indexé par Magasin.id puis par QMZone.id.
 * @typedef {Record<string, Record<string, GrillePoint[]>>} QualimetreCustomMap
 */

/**
 * Dictionnaire des points Qualimètre communs, indexé par nom
 * d'enseigne PUIS par QMZone.id — chaque enseigne a sa propre grille
 * commune, héritée par tous ses magasins (voir getQualimetrePoints).
 * Toute grille commune est nécessairement rattachée à une enseigne
 * réelle : il n'existe aucune case "sans enseigne" (voir
 * _migrateQualimetreGlobalToEnseigneScoped, storage.js, qui supprime
 * l'ancien format plat au lieu de le conserver).
 * @typedef {Record<string, Record<string, GrillePoint[]>>} QualimetreGlobalMap
 */

/**
 * Statistiques agrégées de la grille commune Qualimètre d'une
 * enseigne, affichées sur sa carte dans la vue d'ensemble (voir
 * _buildQualimetreEnseigneCard).
 * @typedef {Object} QMEnseigneStats
 * @property {number} zoneCount - Nombre de zones ayant au moins un point.
 * @property {number} pointCount - Nombre total de points, toutes zones confondues.
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
 * @property {string} prec - Méthode de contrôle / précision, initialisée depuis NormalizedImportRow.methode (colonne détectée par le concept 'methode' — ex : "Méthode", "Ce qu'il faut vérifier", "À vérifier" ; voir import-detect.js). Chaîne vide si aucune colonne de ce type n'a été détectée. ⚠️ CORRIGÉ : figée à '' auparavant, cette colonne était donc systématiquement perdue à l'import Qualimètre alors que le moteur FSQS (import-grille.js) la routait déjà correctement.
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

/** @type {string} Enseigne actuellement affichée dans la vue détail de la page Grille Qualimètre (voir showQualimetreEnseigneDetail) — chaîne vide si la vue cartes (aperçu par enseigne) est affichée. Toujours une enseigne réelle (getKnownEnseignes, magasins.js) quand non vide. Toute écriture dans la grille commune (storeId vide) cible cette enseigne. */
let _gqCurrentEnseigne = '';

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

/** @type {GrilleCriticite} Criticité appliquée aux lignes dont la criticité n'a pas pu être déterminée depuis le document (colonne absente ou valeur non reconnue) — réglable par l'utilisateur dans la modale avant import, voir _onGqDefaultCritChanged. Remplace l'ancien fallback fixe 'Majeure' appliqué dans _gqNormalizeCrit. */
let _gqDefaultCrit = 'Majeure';

// ─────────────────────────────────────────────
// 3. ACCÈS AUX POINTS — source de vérité unique
// Priorité : personnalisation magasin > grille globale > vide
// ─────────────────────────────────────────────

/**
 * Retourne les points de contrôle d'une zone pour un magasin donné,
 * PAR FUSION avec la grille commune de son enseigne — jamais un
 * remplacement (même principe que getGrille, grille.js, FSQS). Un
 * magasin avec des points propres ne perd donc jamais l'accès à la
 * grille commune de son enseigne.
 *
 * Chaque point retourné porte un champ `_scope` ('common' ou
 * 'store') NON PERSISTÉ — ajouté ici, à la lecture, uniquement pour
 * que l'UI sache où agir (modifier/supprimer) sans deviner : un
 * point commun affiché dans le contexte d'un magasin reste un point
 * commun, le modifier ou le supprimer agit sur la grille commune de
 * l'enseigne (donc sur tous ses magasins), jamais sur ce seul
 * magasin — voir _buildGqPointRow.
 *
 * Un magasin SANS enseigne renseignée n'a accès à aucune grille
 * commune (choix délibéré, aucun filet de secours implicite) —
 * uniquement à ses points personnalisés, s'il en a.
 * @param {string | null} storeId - Référence vers Magasin.id, ou null/chaîne vide pour ignorer la personnalisation magasin.
 * @param {string} zoneId - Référence vers QMZone.id.
 * @param {string} [enseigne] - Enseigne explicite (cas où storeId est absent, ex : page Grille Qualimètre avec enseigne choisie directement) ; déduite de Magasin.enseigne si storeId est fourni et enseigne omis.
 * @returns {(GrillePoint & {_scope: 'common'|'store'})[]}
 */
function getQualimetrePoints(storeId, zoneId, enseigne) {
  /** @type {GrillePoint[]} */
  const storePoints = storeId ? (DB.qualimetreCustom?.[storeId]?.[zoneId] || []) : [];

  /** @type {string} */
  const resolvedEnseigne = enseigne || (storeId ? (DB.magasins.find(m => m.id === storeId)?.enseigne || '') : '');
  /** @type {GrillePoint[]} */
  const commonPoints = resolvedEnseigne ? (DB.qualimetreGlobal?.[resolvedEnseigne]?.[zoneId] || []) : [];

  return [
    ...commonPoints.map(p => ({ ...p, _scope: 'common' })),
    ...storePoints.map(p => ({ ...p, _scope: 'store' })),
  ];
}

/**
 * Retourne la grille complète d'un magasin (ou d'une enseigne
 * directement) : toutes les zones qui ont au moins un point, fusion
 * commun + magasin comprise (voir getQualimetrePoints). Applique tout
 * renommage manuel persistant (voir _resolveZoneLabel, renameQmZone)
 * sur le label affiché.
 * @param {string | null} storeId
 * @param {string} [enseigne] - Enseigne explicite (cas où storeId est absent) ; déduite de Magasin.enseigne si storeId est fourni et enseigne omis. Signature rétrocompatible : les appelants existants (audit-qualimetre.js, rapport-qualimetre.js) n'appellent qu'avec storeId et continuent de fonctionner à l'identique.
 * @returns {QMZoneWithPoints[]}
 */
function getQualimetreGrille(storeId, enseigne) {
  /** @type {string} */
  const resolvedEnseigne = enseigne || (storeId ? (DB.magasins.find(m => m.id === storeId)?.enseigne || '') : '');
  /** @type {Set<string>} */
  const zoneIds = new Set([
    ...QM_ZONES.map(z => z.id),
    ...Object.keys(DB.qualimetreGlobal?.[resolvedEnseigne] || {}),
  ]);

  return [...zoneIds]
    .map(zoneId => {
      /** @type {QMZone} */
      const zoneMeta = QM_ZONES.find(z => z.id === zoneId) || { id: zoneId, emoji: '', label: zoneId };
      return { ...zoneMeta, label: _resolveZoneLabel(zoneId, zoneMeta.label), points: getQualimetrePoints(storeId, zoneId, resolvedEnseigne) };
    })
    .filter(zone => zone.points.length > 0);
}

// ─────────────────────────────────────────────
// 4. PAGE GRILLE QUALIMÈTRE
// ─────────────────────────────────────────────

/**
 * Liste les enseignes affichables en page Grille Qualimètre : toutes
 * les enseignes connues (getKnownEnseignes, magasins.js). Toute
 * grille commune Qualimètre est nécessairement rattachée à une
 * enseigne réelle — il n'existe aucune case "sans enseigne" (voir
 * _migrateQualimetreGlobalToEnseigneScoped, storage.js, qui supprime
 * l'ancien format plat au lieu de le conserver).
 * @returns {string[]}
 */
function getKnownQualimetreEnseignes() {
  return getKnownEnseignes();
}

/**
 * Libellé affiché pour une enseigne dans la page Grille Qualimètre.
 * @param {string} enseigne
 * @returns {string}
 */
function _qmEnseigneLabel(enseigne) {
  return enseigne;
}

/**
 * Calcule les statistiques de la grille commune Qualimètre d'une
 * enseigne : nombre de zones ayant au moins un point, et nombre total
 * de points, toutes zones confondues — affichées sur sa carte dans la
 * vue d'ensemble (voir _buildQualimetreEnseigneCard).
 * @param {string} enseigne
 * @returns {QMEnseigneStats}
 */
function _getQualimetreEnseigneStats(enseigne) {
  /** @type {GrillePoint[][]} */
  const nonEmptyZones = Object.values(DB.qualimetreGlobal?.[enseigne] || {}).filter(points => points.length > 0);
  return {
    zoneCount:  nonEmptyZones.length,
    pointCount: nonEmptyZones.reduce((sum, points) => sum + points.length, 0),
  };
}

/**
 * Construit la carte HTML d'une enseigne pour la vue d'ensemble de la
 * page Grille Qualimètre. Cliquer sur la carte ouvre la vue détail de
 * cette enseigne (voir showQualimetreEnseigneDetail).
 * @param {string} enseigne
 * @returns {string}
 */
function _buildQualimetreEnseigneCard(enseigne) {
  /** @type {QMEnseigneStats} */
  const { zoneCount, pointCount } = _getQualimetreEnseigneStats(enseigne);
  return `<div class="card rayon-card" onclick="showQualimetreEnseigneDetail('${_escapeHtmlAttr(enseigne)}')" style="cursor:pointer">
    <div class="card-body" style="text-align:center;padding:24px 16px">
      <i class="ti ti-building" style="font-size:28px;color:var(--qual);margin-bottom:10px;display:block"></i>
      <div style="font-size:15px;font-weight:600;margin-bottom:8px">${_qmEnseigneLabel(enseigne)}</div>
      <div style="font-size:24px;font-weight:700;color:${pointCount ? 'var(--text)' : 'var(--text3)'}">${pointCount}</div>
      <div class="tsm tm">point(s) de contrôle</div>
      <div class="tsm tm" style="margin-top:6px">${zoneCount} zone(s)</div>
    </div>
  </div>`;
}

/**
 * Point d'entrée de la page Grille Qualimètre (voir _getPageRenderer,
 * ui.js) — affiche toujours la vue d'ensemble par enseigne à
 * l'arrivée sur la page (une carte par enseigne, avec son nombre de
 * zones et de points de contrôle communs).
 * @returns {void}
 */
function showGrilleQualimetre() {
  _gqCurrentEnseigne = '';

  if (el('gq-cards-view'))  el('gq-cards-view').style.display  = '';
  if (el('gq-detail-view')) el('gq-detail-view').style.display = 'none';

  /** @type {string[]} */
  const enseignes = getKnownQualimetreEnseignes();
  const grid  = el('gq-cards-grid');
  const empty = el('gq-cards-empty');
  if (!grid) return;

  if (!enseignes.length) {
    grid.innerHTML = '';
    if (empty) empty.style.display = '';
    return;
  }

  if (empty) empty.style.display = 'none';
  grid.innerHTML = enseignes.map(e => _buildQualimetreEnseigneCard(e)).join('');
}

/**
 * Affiche la vue détail de la grille Qualimètre d'une enseigne :
 * sélecteurs de magasin (filtrés à cette enseigne) et de zone, puis
 * le contenu de la zone sélectionnée (voir _gqRender).
 * @param {string} enseigne
 * @returns {void}
 */
function showQualimetreEnseigneDetail(enseigne) {
  _gqCurrentEnseigne = enseigne;

  if (el('gq-cards-view'))  el('gq-cards-view').style.display  = 'none';
  if (el('gq-detail-view')) el('gq-detail-view').style.display = '';
  if (el('gq-detail-ttl'))  el('gq-detail-ttl').textContent    = _qmEnseigneLabel(enseigne);

  _buildGqMagSelect(enseigne);
  _buildGqZoneSelect();
  _gqRender();
}

/**
 * Rafraîchit la vue actuellement affichée : le détail de l'enseigne
 * en cours (_gqCurrentEnseigne) si une est sélectionnée, sinon la vue
 * d'ensemble par enseigne. Centralise le retour après une action
 * (sauvegarde, suppression, import, renommage de zone) sans jamais
 * perdre le contexte d'édition en cours.
 * @returns {void}
 */
function _gqRefreshCurrentView() {
  if (_gqCurrentEnseigne) showQualimetreEnseigneDetail(_gqCurrentEnseigne);
  else showGrilleQualimetre();
}

/** @returns {void} */
function onGqMagChange()  { _gqRender(); }
/** @returns {void} */
function onGqZoneChange() { _gqRender(); }

/**
 * Peuple le select de zones (QM_ZONES + zones ad hoc présentes dans
 * qualimetreGlobal, toutes enseignes confondues).
 *
 * ⚠️ CORRIGÉ : préserve désormais la sélection courante si elle reste
 * valide (comme _buildGqMagSelect) ; à défaut, sélectionne la
 * première zone qui contient réellement des points dans le contexte
 * actuel (magasin sélectionné, sinon grille commune de l'enseigne)
 * plutôt que systématiquement la toute première de la liste. Sans ce
 * correctif, l'utilisateur atterrissait toujours sur "Référentiel
 * Affichage" (premier élément de QM_ZONES) — zone qui, en pratique,
 * n'a souvent aucun point importé (voir les limites connues de
 * l'import PDF) — donnant l'impression trompeuse qu'un import n'a
 * rien produit alors que les autres zones étaient bien remplies.
 * @returns {void}
 */
function _buildGqZoneSelect() {
  const select = el('gq-zone-sel');
  if (!select) return;

  /** @type {string} */
  const currentValue = select.value;
  /** @type {QMZone[]} */
  const allZones = _getAllZones();
  select.innerHTML = allZones.map(zone =>
    `<option value="${zone.id}">${zone.emoji ? zone.emoji + ' ' : ''}${zone.label}</option>`
  ).join('');

  if (currentValue && allZones.some(z => z.id === currentValue)) {
    select.value = currentValue;
    return;
  }

  /** @type {string} */
  const storeId = v('gq-mag-sel') || '';
  /** @type {QMZone | undefined} */
  const zoneWithPoints = allZones.find(zone => getQualimetrePoints(storeId || null, zone.id, _gqCurrentEnseigne).length > 0);
  if (zoneWithPoints) select.value = zoneWithPoints.id;
}

/**
 * Peuple le select de magasins de la vue détail, restreint aux
 * magasins de l'enseigne actuellement affichée (_gqCurrentEnseigne).
 * @param {string} enseigne
 * @returns {void}
 */
function _buildGqMagSelect(enseigne) {
  const select = el('gq-mag-sel');
  if (!select) return;

  /** @type {string} */
  const currentValue = select.value;
  while (select.options.length > 1) select.remove(1);

  DB.magasins
    .filter(m => visibleMids().includes(m.id))
    .filter(m => m.enseigne === enseigne)
    .forEach(m => {
      const option = document.createElement('option');
      option.value       = m.id;
      option.textContent = m.nom;
      select.appendChild(option);
    });

  if (currentValue && [...select.options].some(o => o.value === currentValue)) {
    select.value = currentValue;
  } else {
    select.value = '';
  }
}

/**
 * Résout le libellé affiché d'une zone : priorité à un renommage
 * manuel persistant (DB.qualimetreZoneLabels, voir renameQmZone),
 * puis au label par défaut (QM_ZONES pour une zone du référentiel,
 * sinon l'id lui-même pour une zone ad hoc créée par import — voir
 * _getAllZones). QM_ZONES étant une constante figée en mémoire (donc
 * non persistable telle quelle), c'est CE mécanisme d'override,
 * jamais une mutation de QM_ZONES, qui doit être utilisé pour
 * renommer une zone — voir renameQmZone.
 * @param {string} zoneId - Référence vers QMZone.id.
 * @param {string} fallbackLabel - Label à utiliser si aucun renommage ni entrée QM_ZONES ne correspond (généralement zoneId lui-même).
 * @returns {string}
 */
function _resolveZoneLabel(zoneId, fallbackLabel) {
  if (DB.qualimetreZoneLabels && Object.prototype.hasOwnProperty.call(DB.qualimetreZoneLabels, zoneId)) {
    return DB.qualimetreZoneLabels[zoneId];
  }
  /** @type {QMZone | undefined} */
  const baseZone = QM_ZONES.find(z => z.id === zoneId);
  return baseZone ? baseZone.label : fallbackLabel;
}

/**
 * Renomme une zone Qualimètre PARTOUT où son libellé est affiché, en
 * persistant le nouveau nom dans DB.qualimetreZoneLabels (override
 * par zoneId — voir _resolveZoneLabel). Contrairement au renommage
 * d'un rayon FSQS (voir renameRayon, rayons.js), AUCUNE clé de
 * stockage n'est jamais modifiée : QMZone.id reste inchangé, donc
 * DB.qualimetreCustom/qualimetreGlobal n'ont besoin d'aucune
 * migration — seul l'affichage change. C'est une conséquence directe
 * du fait que QMZone sépare déjà id et label (alors qu'un rayon FSQS
 * est sa propre clé de stockage).
 * @param {string} zoneId - Référence vers QMZone.id.
 * @param {string} newLabel
 * @returns {{ok: boolean, error?: string}}
 */
function renameQmZone(zoneId, newLabel) {
  /** @type {string} */
  const trimmed = (newLabel || '').trim();
  if (!trimmed) return { ok: false, error: 'Le nouveau nom ne peut pas être vide.' };

  if (!DB.qualimetreZoneLabels) DB.qualimetreZoneLabels = {};
  DB.qualimetreZoneLabels[zoneId] = trimmed;
  return { ok: true };
}

/**
 * Fusionne QM_ZONES avec les zones présentes dans qualimetreGlobal,
 * toutes enseignes confondues (zones "ad hoc" créées via import, sans
 * métadonnées emoji/label), en appliquant tout renommage manuel
 * persistant (voir _resolveZoneLabel).
 * @returns {QMZone[]}
 */
function _getAllZones() {
  /** @type {Set<string>} */
  const globalZoneIds = new Set();
  Object.values(DB.qualimetreGlobal || {}).forEach(zonesMap => {
    Object.keys(zonesMap || {}).forEach(id => globalZoneIds.add(id));
  });

  return [
    ...QM_ZONES.map(z => ({ ...z, label: _resolveZoneLabel(z.id, z.label) })),
    ...[...globalZoneIds]
      .filter(id => !QM_ZONES.find(z => z.id === id))
      .map(id => ({ id, emoji: '', label: _resolveZoneLabel(id, id) })),
  ];
}

/**
 * Affiche le contenu de la zone Qualimètre sélectionnée (barre de
 * comptage + liste des points, fusion commun + magasin comprise),
 * dans le contexte de l'enseigne actuellement affichée
 * (_gqCurrentEnseigne), ou un état vide si aucun point.
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

  /** @type {(GrillePoint & {_scope: 'common'|'store'})[]} */
  const points = getQualimetrePoints(storeId || null, zoneId, _gqCurrentEnseigne);

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
    _buildGqSourceBar(points.length, isAdmin, storeId, zoneId) +
    points.map(point => _buildGqPointRow(point, isAdmin, storeId, zoneId)).join('');
}

/**
 * Affiche/masque les boutons réservés aux administrateurs
 * (ajouter, importer, réinitialiser).
 * @param {boolean} isAdmin
 * @returns {void}
 */
function _gqUpdateAdminButtons(isAdmin) {
  ['gq-btn-add', 'gq-btn-import', 'gq-btn-reset', 'btn-rename-zone'].forEach(id => {
    const btn = el(id);
    if (btn) btn.style.display = isAdmin ? '' : 'none';
  });
}

/**
 * Met à jour le libellé indiquant la portée de la grille affichée :
 * grille commune de l'enseigne actuelle, ou grille d'un magasin
 * précis (dans ce cas toujours fusionnée avec la grille commune de
 * son enseigne — voir getQualimetrePoints).
 * @param {string} storeId - Référence vers Magasin.id, ou chaîne vide pour la grille commune de l'enseigne.
 * @returns {void}
 */
function _gqUpdateScopeLabel(storeId) {
  const scopeEl = el('gq-scope-label');
  if (!scopeEl) return;
  /** @type {string} */
  const enseigneLabel = _qmEnseigneLabel(_gqCurrentEnseigne);
  if (storeId) {
    /** @type {Magasin | undefined} */
    const store = DB.magasins.find(m => m.id === storeId);
    scopeEl.innerHTML = `Grille de <strong>${store ? store.nom : storeId}</strong> — points propres fusionnés avec la grille commune de <strong>${enseigneLabel}</strong>`;
  } else {
    scopeEl.innerHTML = `Grille <strong>commune</strong> de l'enseigne <strong>${enseigneLabel}</strong> (héritée par tous ses magasins, en plus de leurs éventuels points propres)`;
  }
}

/**
 * Construit la barre d'info au-dessus de la liste des points d'une
 * zone (nombre total, bouton de réinitialisation pour les admins).
 * ⚠️ CHANGÉ : la fusion commun + magasin rend obsolète l'ancien badge
 * de source unique (personnalisé/global/base) — chaque point porte
 * désormais son propre badge de portée (voir _buildGqPointRow).
 * @param {number} pointCount
 * @param {boolean} isAdmin
 * @param {string} storeId - Référence vers Magasin.id ; chaîne vide = grille commune de l'enseigne.
 * @param {string} zoneId - Référence vers QMZone.id.
 * @returns {string}
 */
function _buildGqSourceBar(pointCount, isAdmin, storeId, zoneId) {
  /** @type {string} */
  const resetBtn = isAdmin
    ? `<button class="btn btn-secondary btn-sm" style="margin-left:auto" onclick="_gqResetZone('${storeId || ''}','${zoneId}')">
         <i class="ti ti-refresh"></i> Réinitialiser cette zone
       </button>`
    : '';

  return `<div style="display:flex;align-items:center;gap:8px;padding:10px 20px;background:var(--bg);border-bottom:1px solid var(--border)">
    <span class="tsm tm">${pointCount} point(s)</span>
    ${resetBtn}
  </div>`;
}

/**
 * Construit la ligne HTML d'un point de contrôle Qualimètre, avec un
 * badge indiquant sa portée réelle (commun à l'enseigne, ou propre au
 * magasin affiché) et des boutons modifier/supprimer pour les admins
 * qui agissent TOUJOURS sur la portée réelle du point — jamais sur le
 * magasin affiché si le point est commun (voir getQualimetrePoints).
 * @param {GrillePoint & {_scope: 'common'|'store'}} point
 * @param {boolean} isAdmin
 * @param {string} storeId - Magasin actuellement affiché (peut différer de la portée réelle du point si celui-ci est commun).
 * @param {string} zoneId
 * @returns {string}
 */
function _buildGqPointRow(point, isAdmin, storeId, zoneId) {
  /** @type {string} */
  const scopeBadge = point._scope === 'common'
    ? `<span style="background:#f0fdf4;color:#15803d;border-radius:12px;padding:1px 8px;font-size:10px;font-weight:600;white-space:nowrap">Commun enseigne</span>`
    : `<span style="background:#ede9fe;color:#6d28d9;border-radius:12px;padding:1px 8px;font-size:10px;font-weight:600;white-space:nowrap">Personnalisé magasin</span>`;

  // Un point commun se modifie/supprime toujours au niveau de
  // l'enseigne, jamais du magasin affiché — voir getQualimetrePoints.
  /** @type {string} */
  const actionStoreId = point._scope === 'common' ? '' : storeId;

  /** @type {string} */
  const actionButtons = isAdmin
    ? `<button class="btn btn-secondary btn-sm" onclick="openGqCtrlModal('${actionStoreId || ''}','${zoneId}','${point.id}')" aria-label="Modifier">
         <i class="ti ti-pencil"></i>
       </button>
       <button class="btn btn-danger btn-sm" onclick="delGqCtrl('${actionStoreId || ''}','${zoneId}','${point.id}')" aria-label="Supprimer">
         <i class="ti ti-trash"></i>
       </button>`
    : '';

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
 * Peuple le select de magasins de la modale d'édition de point,
 * restreint aux magasins de l'enseigne actuellement affichée
 * (_gqCurrentEnseigne) — un point "portée magasin" créé depuis cette
 * page ne peut viser qu'un magasin de cette enseigne, jamais un autre
 * (option "Tous les magasins de l'enseigne" pour la portée commune).
 * @param {string} selectedStoreId
 * @returns {void}
 */
function _buildGqCtrlMagSelect(selectedStoreId) {
  const select = el('gqc-mag-sel');
  if (!select) return;
  select.innerHTML =
    '<option value="">— Tous les magasins de l\'enseigne —</option>' +
    DB.magasins
      .filter(m => visibleMids().includes(m.id))
      .filter(m => m.enseigne === _gqCurrentEnseigne)
      .map(m => `<option value="${m.id}"${m.id === selectedStoreId ? ' selected' : ''}>${m.nom}</option>`)
      .join('');
}

/**
 * Pré-remplit le formulaire avec les données d'un point existant
 * (recherché dans qualimetreCustom[storeId][zoneId], sinon dans la
 * grille commune de l'enseigne courante,
 * qualimetreGlobal[_gqCurrentEnseigne][zoneId]).
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
  } else if (_gqCurrentEnseigne && DB.qualimetreGlobal?.[_gqCurrentEnseigne]?.[zoneId]) {
    points = DB.qualimetreGlobal[_gqCurrentEnseigne][zoneId];
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

  _gqRefreshCurrentView();
}

/**
 * Insère ou met à jour un point dans le store approprié : la grille
 * personnalisée du magasin (storeId fourni), ou la grille commune de
 * l'enseigne actuellement affichée (_gqCurrentEnseigne, storeId
 * vide) — avec lazy-init des niveaux intermédiaires manquants.
 * @param {string} storeId - Référence vers Magasin.id ; chaîne vide pour la grille commune de l'enseigne courante.
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
    if (!_gqCurrentEnseigne) return; // garde-fou : jamais de grille commune sans enseigne sélectionnée
    if (!DB.qualimetreGlobal) DB.qualimetreGlobal = {};
    if (!DB.qualimetreGlobal[_gqCurrentEnseigne]) DB.qualimetreGlobal[_gqCurrentEnseigne] = {};
    if (!DB.qualimetreGlobal[_gqCurrentEnseigne][zoneId]) DB.qualimetreGlobal[_gqCurrentEnseigne][zoneId] = [];
    _upsertInArray(DB.qualimetreGlobal[_gqCurrentEnseigne][zoneId], existingId, newPoint);
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
 * Supprime un point de contrôle Qualimètre (magasin, ou grille
 * commune de l'enseigne actuellement affichée si storeId est vide),
 * après confirmation.
 * @param {string} storeId - Référence vers Magasin.id ; chaîne vide pour la grille commune de l'enseigne courante.
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
    if (!_gqCurrentEnseigne || !DB.qualimetreGlobal?.[_gqCurrentEnseigne]) return;
    DB.qualimetreGlobal[_gqCurrentEnseigne][zoneId] = (DB.qualimetreGlobal[_gqCurrentEnseigne][zoneId] || []).filter(p => p.id !== pointId);
  }

  save(['qualimetreCustom', 'qualimetreGlobal']);
  _gqRefreshCurrentView();
}

/**
 * Réinitialise (supprime tous les points de) une zone, pour la
 * personnalisation magasin ou la grille commune de l'enseigne
 * actuellement affichée selon `storeId`, après confirmation.
 * @param {string} storeId - Référence vers Magasin.id ; chaîne vide pour la grille commune de l'enseigne courante.
 * @param {string} zoneId - Référence vers QMZone.id.
 * @returns {void}
 */
function _gqResetZone(storeId, zoneId) {
  /** @type {string} */
  const scopeLabel = storeId ? 'la personnalisation magasin' : `la grille commune de l'enseigne « ${_qmEnseigneLabel(_gqCurrentEnseigne)} »`;
  if (!confirm(`Réinitialiser ${scopeLabel} pour cette zone ? Les points seront supprimés.`)) return;

  if (storeId) {
    if (DB.qualimetreCustom?.[storeId]) delete DB.qualimetreCustom[storeId][zoneId];
  } else if (_gqCurrentEnseigne && DB.qualimetreGlobal?.[_gqCurrentEnseigne]) {
    delete DB.qualimetreGlobal[_gqCurrentEnseigne][zoneId];
  }

  save(['qualimetreCustom', 'qualimetreGlobal']);
  _gqRefreshCurrentView();
}

/**
 * Ouvre une invite de saisie pour renommer la zone actuellement
 * sélectionnée (voir renameQmZone), pré-remplie avec son libellé
 * actuel. Persiste le renommage dans DB.qualimetreZoneLabels — voir
 * la documentation de renameQmZone sur la différence avec le
 * renommage d'un rayon FSQS (aucune clé de stockage à migrer ici).
 * @returns {void}
 */
function openRenameZonePrompt() {
  /** @type {string} */
  const zoneId = v('gq-zone-sel');
  if (!zoneId) return;

  /** @type {QMZone | undefined} */
  const currentZone = _getAllZones().find(z => z.id === zoneId);
  /** @type {string | null} */
  const newLabel = prompt('Nouveau nom de la zone :', currentZone ? currentZone.label : zoneId);
  if (newLabel === null) return;

  /** @type {{ok: boolean, error?: string}} */
  const result = renameQmZone(zoneId, newLabel);
  if (!result.ok) {
    if (result.error) alert(result.error);
    return;
  }

  save(['qualimetreZoneLabels']);
  _gqRefreshCurrentView();
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
  const grille  = getQualimetreGrille(storeId || null, _gqCurrentEnseigne);

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
 * Ouvre la modale d'import de grille Qualimètre, réinitialise l'état
 * d'import et peuple le select de magasins cibles — restreint aux
 * magasins de l'enseigne actuellement affichée (_gqCurrentEnseigne),
 * puisque l'import se fait toujours depuis le contexte d'une enseigne
 * précise (voir showQualimetreEnseigneDetail).
 * @returns {void}
 */
function openGqImportModal() {
  if (!_gqCurrentEnseigne) { showToast('Sélectionnez une enseigne avant d\'importer.', 'warning'); return; }

  _gqImportData = [];
  _gqRawRows    = [];
  _gqDetection  = null;
  _gqZoneReplaceFlags = {};
  _gqDefaultCrit = 'Majeure';
  el('gq-import-preview').innerHTML = '';
  el('gq-import-err').classList.remove('show');
  if (el('gqi-default-crit')) el('gqi-default-crit').value = 'Majeure';
  if (el('gqi-ens-lbl')) el('gqi-ens-lbl').textContent = _qmEnseigneLabel(_gqCurrentEnseigne);

  const magSelect = el('gqi-mag-sel');
  if (magSelect) {
    magSelect.innerHTML =
      `<option value="">— Grille commune de l'enseigne —</option>` +
      DB.magasins
        .filter(m => visibleMids().includes(m.id))
        .filter(m => m.enseigne === _gqCurrentEnseigne)
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
        // ⚠️ CORRIGÉ : sheet_to_json({header:1}) donne les cellules
        // brutes directement, sans jamais repasser par du texte CSV
        // intermédiaire (contrairement à l'ancien sheet_to_csv +
        // _gqParseCSV) — une cellule contenant un saut de ligne
        // interne (légal en XLSX) ne casse donc plus le découpage en
        // lignes logiques. Même approche que _importXLSX
        // (import-grille.js, FSQS), pour cohérence entre les deux
        // moteurs.
        /** @type {string[][]} */
        const cellRows = XLSX.utils.sheet_to_json(worksheet, { header: 1, defval: '' })
          .filter(row => row.join('').trim())
          .map(row => row.map(c => String(c)));
        _gqParseCellRows(cellRows);
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
 *
 * ⚠️ CORRIGÉ : le filtre "ligne de titre de zone" (criticité ET
 * poids vides) ne s'applique désormais QUE si le document possède
 * réellement une colonne mappée à 'criticite' OU 'poids` (paramètre
 * `mapping`). Sans cette condition, un document qui n'a tout
 * simplement AUCUNE de ces deux colonnes (cas réel observé : relevé
 * d'audit C/NC sans référentiel de criticité) verrait TOUTES ses
 * lignes filtrées à tort, puisque crit/poids y sont alors
 * systématiquement vides pour des raisons n'ayant rien à voir avec
 * une ligne-titre. Quand aucune des deux colonnes n'existe, la
 * criticité retombe sur _gqDefaultCrit pour chaque ligne (voir
 * _gqNormalizeCrit) — jamais sur un filtrage de la ligne elle-même.
 * @param {NormalizedImportRow[]} normalized
 * @param {ConceptMapping | null} [mapping] - Mapping détecté pour ce document ; utilisé uniquement pour savoir si le filtre "ligne de titre" est pertinent ici (voir avertissement ci-dessus). Si absent (compatibilité), le filtre s'applique comme avant.
 * @returns {GqParsedRow[]}
 */
function _buildGqParsedRows(normalized, mapping) {
  /** @type {boolean} */
  const hasCritOrPoidsColumn = !mapping || !!mapping.criticite || !!mapping.poids;

  /** @type {GqParsedRow[]} */
  const rows = [];
  normalized.forEach(row => {
    if (!row.q.trim()) return;

    // Ignorer les lignes de titre de zone (criticité et poids vides)
    // — seulement pertinent si le document a une de ces colonnes ;
    // voir avertissement ci-dessus.
    if (hasCritOrPoidsColumn && !row.crit && !row.poids) return;

    /** @type {GrilleCriticite} */
    const crit  = _gqNormalizeCrit(row.crit) || _gqDefaultCrit;
    /** @type {number} */
    const poids = parseInt(row.poids) || GQ_DEFAULT_POIDS[crit];
    /** @type {ResolvedZone} */
    const zone  = _resolveOrCreateZoneFromDocument(row.rayon, '');

    rows.push({ zoneId: zone.id, zoneName: row.rayon, q: row.q.trim(), prec: row.methode || '', c: crit, p: poids, extra: row.extra || '', isDuplicate: false });
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
 * Parse un contenu CSV/TSV en lignes RawImportRow puis délègue à
 * _gqParseCellRows. Simple adaptateur texte -> cellRows (découpage
 * par séparateur détecté automatiquement) ; toute la logique de
 * détection/normalisation/résolution vit dans _gqParseCellRows (voir
 * sa documentation), partagée avec le chemin XLSX (handleGqImportFile)
 * qui fournit ses cellRows directement depuis SheetJS sans jamais
 * repasser par du texte CSV intermédiaire.
 *
 * ⚠️ Limite connue (préexistante, non corrigée ici) : ce découpage
 * texte simple (split sur retour à la ligne) ne respecte pas les
 * guillemets RFC 4180 — une cellule CSV contenant elle-même un saut
 * de ligne (légal si entourée de guillemets) casserait le découpage
 * en lignes logiques. Le chemin XLSX n'a pas cette limite (cellRows
 * obtenus directement depuis les cellules du classeur, jamais via
 * une sérialisation texte) — voir handleGqImportFile.
 * @param {string} text - Contenu texte brut du fichier (CSV/TSV/TXT).
 * @returns {void}
 */
function _gqParseCSV(text) {
  /** @type {string[]} */
  const lines = text.split(/\r?\n/).filter(l => l.trim());
  if (lines.length < 2) { _gqImportErr('Le fichier est vide ou ne contient pas de données.'); return; }

  /** @type {string} */
  const separator = detectImportSeparator(lines);
  /** @type {string[][]} */
  const cellRows = lines.map(line => line.split(separator).map(c => c.trim().replace(/^["']|["']$/g, '')));

  _gqParseCellRows(cellRows);
}

/**
 * Cœur du parsing Qualimètre, partagé entre le chemin CSV/TSV/TXT
 * (_gqParseCSV, après découpage texte -> cellRows) et le chemin XLSX
 * (handleGqImportFile, cellRows obtenus directement depuis SheetJS
 * via sheet_to_json — jamais via sheet_to_csv + re-découpage texte,
 * pour ne jamais casser sur une cellule contenant un saut de ligne).
 *
 * Détecte les concepts métier (zone, point, criticité, méthode,
 * commentaire) via detectConceptMapping (import-detect.js), normalise
 * via normalizeRows (import-normalize.js), puis résout chaque zone
 * via _resolveOrCreateZoneFromDocument (import-grille.js — partagée
 * avec l'import de grille FSQS, jamais de zone par défaut devinée).
 * Les quasi-doublons sont signalés (voir findDuplicateRows,
 * import-normalize.js) sans jamais être exclus automatiquement.
 *
 * Branché sur buildRawRowsFromCellRows (import-grille.js) : gère
 * aussi les documents où la zone est donnée en ligne-titre plutôt
 * qu'en colonne (sections multi-tableaux, voir sa documentation) —
 * exactement comme pour l'import de grille FSQS. Les deux mécanismes
 * (zone en colonne, zone en ligne-titre) coexistent ; un document
 * sans aucune ligne-titre détectée traverse ce branchement sans
 * aucun effet. La colonne synthétique de zone détectée par section
 * est imposée comme mapping 'zone' via
 * _forceZoneMappingToDetectedColumn (import-grille.js), même logique
 * que pour l'import FSQS.
 *
 * Les lignes de "titre de zone" embarquées dans un tableau à zone en
 * colonne (motif fréquent dans les exports où une ligne ne fait que
 * regrouper visuellement une section, sans rapport avec les sections
 * détectées ci-dessus) sont ignorées UNIQUEMENT si le document
 * possède une colonne criticité ou poids (voir _buildGqParsedRows)
 * — sinon ce filtre supprimerait à tort toutes les lignes d'un
 * document qui n'a simplement aucune de ces deux colonnes.
 * @param {string[][]} cellRows - Lignes brutes de cellules, déjà découpées par colonne (peu importe la source : texte CSV découpé, ou cellules XLSX natives).
 * @returns {void}
 */
function _gqParseCellRows(cellRows) {
  /** @type {{rawRows: RawImportRow[], usedHeaderRow: boolean, sectionCount: number}} */
  const { rawRows } = buildRawRowsFromCellRows(cellRows);

  /** @type {DetectionResult} */
  const detection = _forceZoneMappingToDetectedColumn(detectConceptMapping(rawRows), rawRows);
  /** @type {NormalizedImportRow[]} */
  const normalized = normalizeRows(rawRows, detection.mapping, detection.unmappedHeaders);

  /** @type {GqParsedRow[]} */
  const rows = _buildGqParsedRows(normalized, detection.mapping);

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
 *
 * ⚠️ CHANGÉ : retourne désormais `null` si la valeur brute est vide
 * ou non reconnue, au lieu de retomber silencieusement sur
 * 'Majeure' — le fallback est maintenant la responsabilité de
 * l'appelant via _gqDefaultCrit (réglable par l'utilisateur, voir
 * _onGqDefaultCritChanged), pas de cette fonction de normalisation
 * pure.
 * @param {string} raw
 * @returns {GrilleCriticite | null}
 */
function _gqNormalizeCrit(raw) {
  /** @type {string} */
  const normalized = (raw || '').toLowerCase().trim();
  if (!normalized) return null;
  if (normalized.includes('crit')) return 'Critique';
  if (normalized.includes('min'))  return 'Mineure';
  if (normalized.includes('maj'))  return 'Majeure';
  return null;
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
      /** @type {string} */
      const zoneLabel = _resolveZoneLabel(zoneId, zoneId);
      /** @type {boolean} */
      const willReplace = _gqZoneReplaceFlags[zoneId] ?? true;
      return `<div style="margin-bottom:10px">
        <div style="display:flex;align-items:center;justify-content:space-between;gap:8px;font-size:11px;font-weight:700;color:#5b21b6;text-transform:uppercase;padding:6px 10px;background:#f5f3ff;border-radius:6px;margin-bottom:4px">
          <span>${zone?.emoji ? zone.emoji + ' ' : ''}${zoneLabel} (${points.length})</span>
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

  _gqImportData = _buildGqParsedRows(normalized, _gqDetection.mapping);
  _gqRenderImportPreview();
}

/**
 * Appelée depuis le sélecteur de criticité par défaut de la modale
 * d'import Qualimètre lorsque l'utilisateur change la valeur de
 * repli appliquée aux lignes sans criticité déterminable depuis le
 * document. Met à jour l'état puis, si un fichier est déjà chargé,
 * rejoue _buildGqParsedRows SANS re-scanner le fichier (même logique
 * que _onGqMappingConceptChanged) : seule la criticité de repli
 * change, jamais le mapping ni les données brutes. Équivalent
 * Qualimètre de _onDefaultCritChanged (import-grille.js).
 * @param {GrilleCriticite} newDefaultCrit
 * @returns {void}
 */
function _onGqDefaultCritChanged(newDefaultCrit) {
  _gqDefaultCrit = newDefaultCrit;
  if (!_gqDetection || !_gqRawRows.length) return;

  /** @type {NormalizedImportRow[]} */
  const normalized = normalizeRows(_gqRawRows, _gqDetection.mapping, _gqDetection.unmappedHeaders);
  _gqImportData = _buildGqParsedRows(normalized, _gqDetection.mapping);
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
  // Capturé avant réinitialisation de _gqImportData, pour naviguer
  // vers une zone qui contient réellement les points qui viennent
  // d'être importés (voir plus bas) — sans ça, la vue peut très bien
  // rester sur une zone restée sélectionnée depuis avant l'import,
  // vide, donnant l'impression trompeuse que rien n'a été importé.
  /** @type {string | undefined} */
  const firstImportedZoneId = _gqImportData[0]?.zoneId;

  if (storeId) {
    if (!DB.qualimetreCustom) DB.qualimetreCustom = {};
    if (!DB.qualimetreCustom[storeId]) DB.qualimetreCustom[storeId] = {};
    _applyImportToStore(DB.qualimetreCustom[storeId]);
  } else {
    if (!_gqCurrentEnseigne) { _gqImportErr('Aucune enseigne sélectionnée.'); return; }
    if (!DB.qualimetreGlobal) DB.qualimetreGlobal = {};
    if (!DB.qualimetreGlobal[_gqCurrentEnseigne]) DB.qualimetreGlobal[_gqCurrentEnseigne] = {};
    _applyImportToStore(DB.qualimetreGlobal[_gqCurrentEnseigne]);
  }

  save(['qualimetreCustom', 'qualimetreGlobal']);
  closeModal('m-gq-import');
  showToast(`Grille Qualimètre importée (${_gqImportData.length} point(s))`, 'success');
  _gqImportData = [];
  _gqZoneReplaceFlags = {};
  _gqRefreshCurrentView();

  // Navigation explicite vers une zone importée, PLUTÔT que de
  // laisser _buildGqZoneSelect (appelé par _gqRefreshCurrentView)
  // préserver une sélection antérieure potentiellement vide.
  if (firstImportedZoneId && el('gq-zone-sel')) {
    el('gq-zone-sel').value = firstImportedZoneId;
    _gqRender();
  }
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
