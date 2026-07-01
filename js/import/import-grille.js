// ══════════════════════════════════════════════════════════════
// IMPORT-GRILLE — Import de grille d'audit (CSV / XLSX / PDF)
// Dépend de : storage.js (DB, CU), config.js (CDN_SHEETJS, CDN_PDFJS, CDN_PDFJS_WORKER, IMPORT_FORMAT_INFO, QM_ZONES), ui.js,
//             import-detect.js (detectConceptMapping, buildSyntheticHeaders, RawImportRow, DetectionResult, ImportConcept),
//             import-normalize.js (normalizeRows, findDuplicateRows, NormalizedImportRow, DuplicateMap)
// ══════════════════════════════════════════════════════════════

// ─────────────────────────────────────────────
// 0. TYPEDEFS JSDoc (pour inférence VSCode / TypeScript)
//    ⚠️ Déduits de l'usage dans ce fichier.
//
//    ✅ CORRIGÉ : _importIntoQualimetre() résout désormais la zone
//    cible à partir de la valeur de zone telle qu'elle apparaît
//    dans le document importé (row.zoneRaw), au lieu d'utiliser le
//    rayon FSQS normalisé. La résolution ne dépend d'aucune liste
//    figée (QM_ZONES n'est consultée que pour ÉVITER une duplication
//    par libellé exact déjà connu, jamais pour deviner ou valider
//    une zone). Voir _resolveOrCreateZoneFromDocument.
//
//    ✅ RÉSOLU : l'ancienne IMPORT_VALID_RAYONS (liste fermée de 7
//    rayons, 3e copie de la même liste que RAYONS_LIST/RAYONS_BASE_SEED
//    dans rayons.js et l'ex-RAYONS_FSQS dans dashboard.js) a été
//    supprimée. Aucun rayon n'est plus jamais rejeté à l'import.
//
//    ✅ CORRIGÉ (confusion zone/rayon) : le libellé détecté dans le
//    document (colonne "Zone" ou ligne-titre de section) n'est PLUS
//    JAMAIS traité comme un rayon FSQS à créer — il alimente
//    désormais row.zone (sous-partie d'un rayon, voir le typedef
//    GrillePoint, config.js), jamais row.rayon (ce champ n'existe
//    plus dans ImportParsedRow). Le rayon FSQS cible est un choix
//    explicite de l'utilisateur AVANT l'import (_importDefaultRayons,
//    sélecteur au-dessus de la zone de dépose), jamais déduit du
//    document. L'ancien comportement créait à tort un nouveau RAYON
//    pour chaque libellé de section détecté.
// ─────────────────────────────────────────────

/**
 * Niveau de criticité (voir config.js/grille.js/nc.js).
 * @typedef {'Critique'|'Majeure'|'Mineure'} GrilleCriticite
 */

/**
 * Onglet de format actif dans la modale d'import.
 * @typedef {'csv'|'xlsx'|'pdf'} ImportTab
 */

/**
 * Destination de l'import : grille d'audit FSQS ou grille Qualimètre.
 * @typedef {'grille'|'qualimetre'} ImportTarget
 */

/**
 * Zone de contrôle du parcours Qualimètre (voir config.js pour la
 * définition canonique). Rappelée ici car consultée par
 * _resolveOrCreateZoneFromDocument UNIQUEMENT pour détecter une
 * correspondance de libellé exact (déduplication), jamais pour
 * valider ou deviner une zone absente du document.
 * @typedef {Object} QMZone
 * @property {string} id
 * @property {string} emoji
 * @property {string} label
 */

/**
 * Dictionnaire des points Qualimètre personnalisés par magasin,
 * indexé par Magasin.id puis par QMZone.id (voir storage.js pour la
 * définition canonique, confirmée par grille-qualimetre.js).
 * @typedef {Record<string, Record<string, GrillePoint[]>>} QualimetreCustomMap
 */


/**
 * Ligne normalisée et validée, prête pour aperçu et import. La
 * notion de validité (`valid`) dépend de la cible d'import — voir
 * _showImportPreview : pour 'grille' (FSQS), un rayon reconnu est
 * requis ; pour 'qualimetre', seul un intitulé non vide est requis
 * (la zone est résolue depuis le document, jamais rejetée pour
 * absence de correspondance avec une liste connue).
 * @typedef {Object} ImportParsedRow
 * @property {string} zoneRaw - Valeur de zone telle qu'écrite dans le document, jamais altérée (RENOMMÉ depuis rayonRaw). Utilisée par _importIntoQualimetre comme source de vérité pour la résolution de zone Qualimètre, indépendamment de `zone` (qui peut avoir été ajustée à la casse canonique pour la cible 'grille', voir _showImportPreview).
 * @property {string[]} targetRayons - Rayon(s) FSQS où cette ligne sera réellement importée (cible 'grille' uniquement) — initialisé à _importDefaultRayons (rayon(s) choisis par l'utilisateur AVANT l'import, voir le sélecteur au-dessus de la zone de dépose). Modifiable individuellement (voir _onPreviewFieldChanged) ou en masse pour les lignes sélectionnées (voir applyBulkRayonZoneAssignment). Une ligne avec targetRayons vide n'est PAS importée même si `valid` est true — voir confirmImport.
 * @property {string[]} targetStores - Magasin(s) individuels où cette ligne sera importée en plus (grille personnalisée DB.grilleCustomByStore[storeId][rayon]) — vide par défaut, rempli uniquement via assignation manuelle ligne par ligne ou en masse (voir applyBulkRayonZoneAssignment). N'est jamais initialisé depuis l'enseigne choisie avant import (voir targetEnseigne, qui gère ce cas séparément).
 * @property {string} targetEnseigne - Enseigne FSQS dont la grille COMMUNE recevra cette ligne (DB.grilleCustom[enseigne][rayon], héritée par tous les magasins de cette enseigne) — initialisé à _importDefaultEnseigne (sélecteur au-dessus de la zone de dépose). Chaîne vide = aucune grille commune ciblée pour cette ligne (elle n'est alors importée que dans les magasins listés dans targetStores, s'il y en a).
 * @property {string} zone - Sous-partie du rayon (GrillePoint.zone, voir config.js) attribuée à cette ligne pour l'import FSQS — devient l'onglet dans l'audit (voir buildAuditQuestions, audits.js). Initialisé depuis `zoneRaw` (libellé détecté dans le document — colonne "Zone" ou ligne-titre de section), avec résolution à la casse canonique d'une zone déjà existante dans un des rayons cibles si trouvée. Chaîne vide acceptée ("Non classé" à l'affichage). Sans effet sur la cible 'qualimetre'.
 * @property {boolean} selected - Coché dans l'aperçu (case à gauche de chaque ligne) — détermine quelles lignes sont affectées par une assignation groupée (voir applyBulkRayonZoneAssignment), pas par l'import lui-même.
 * @property {string} cat - Thème (sous-groupe à l'intérieur de la zone, voir GrillePoint.cat, config.js) — détecté depuis la colonne "Thème"/"Catégorie" du document, conservé et importé tel quel, mais ⚠️ CHANGÉ : plus affiché comme colonne éditable dans l'aperçu (#imp-preview-tb) depuis que ce concept a été jugé redondant avec le classement rayon → zone. Reste utilisé en interne pour grouper les points par sous-section dans la grille (_buildCategorySection, grille.js) et dans l'audit (switchAuditZone, audits.js).
 * @property {string} q - Intitulé, trim() appliqué.
 * @property {string} prec - Méthode de contrôle (RENOMMÉ depuis l'ancien concept "Catégorie" affiché par erreur dans l'aperçu — voir GrillePoint.prec, config.js). Initialisé depuis NormalizedImportRow.methode (typiquement une colonne "Précisions" du document). Affiché dans l'aperçu juste après Intitulé, et dans la modale d'audit juste sous l'intitulé (voir _buildAuditQuestion, audits.js).
 * @property {GrilleCriticite} crit - Toujours normalisé (fallback 'Majeure' si non reconnu).
 * @property {number} p - Poids, calculé depuis IMPORT_DEFAULT_POIDS si absent/invalide.
 * @property {boolean} valid - Dépend de la cible d'import active au moment du parsing (voir _showImportPreview) ; les lignes invalides sont affichées dans l'aperçu mais exclues de l'import.
 * @property {string} extra - Contenu des colonnes du document non reconnues comme un concept métier connu (commentaire, ou toute colonne non mappée), concaténé pour ne perdre aucune information. Chaîne vide si rien à signaler. Voir import-normalize.js.
 */

/**
 * Rappel des typedefs définis dans import-detect.js et
 * import-normalize.js, consommés par ce fichier. Non redéfinis ici
 * (source de vérité = leurs fichiers respectifs) :
 * - RawImportRow, ImportConcept, ConceptMapping, ConceptScore,
 *   DetectionResult, detectConceptMapping, buildSyntheticHeaders
 *   (import-detect.js)
 * - NormalizedImportRow, DuplicateMap, normalizeRows,
 *   findDuplicateRows (import-normalize.js)
 */

/**
 * Résultat de la résolution d'une zone Qualimètre à partir d'une
 * valeur brute lue dans le document importé.
 * @typedef {Object} ResolvedZone
 * @property {string} id - Identifiant de zone à utiliser comme clé dans qualimetreCustom/qualimetreGlobal.
 * @property {boolean} reused - Vrai si une zone existante (QM_ZONES, qualimetreGlobal ou qualimetreCustom[storeId]) a été réutilisée par correspondance exacte de libellé normalisé ; faux si une nouvelle zone a été créée.
 * @property {boolean} isUnclassified - Vrai si la ligne d'origine n'avait aucune valeur de zone identifiable (case vide) et a été placée dans la zone "Non classé".
 */

/**
 * Point de contrôle de grille (FSQS ou Qualimètre selon la cible).
 * @typedef {Object} GrillePoint
 * @property {string} id
 * @property {string} cat
 * @property {string} q
 * @property {number} p
 * @property {GrilleCriticite} c
 */

/**
 * Magasin. Référencé uniquement par son id dans ce fichier.
 * @typedef {Object} Magasin
 * @property {string} id
 */

// ─────────────────────────────────────────────
// 1. CONSTANTES
// ─────────────────────────────────────────────

// ⚠️ CHANGÉ : IMPORT_ACCEPT_EXTENSIONS et IMPORT_ACCEPT_HINTS ont été
// supprimées avec la sélection manuelle d'onglet de format (voir
// switchImportTab, supprimée également) — l'input file accepte
// désormais tous les formats à la fois (voir le HTML, attribut accept
// déjà fixe), le format réel étant déterminé après coup par
// l'extension du fichier déposé (voir processImportFile).

/**
 * ⚠️ CHANGÉ : il n'existe plus de liste fermée de rayons FSQS
 * valides. Le nom d'un rayon ne doit jamais être une contrainte
 * fixe — il provient toujours du document importé tel qu'écrit (un
 * rayon absent de getKnownRayons(), rayons.js, est créé à la volée à
 * la confirmation de l'import, voir _importIntoGrille), ou d'une
 * correction manuelle de l'utilisateur dans l'aperçu (voir
 * _onPreviewRayonChanged). IMPORT_VALID_RAYONS et _normalizeRayon
 * ont été supprimés ; toute ligne avec un intitulé non vide est
 * désormais valide pour la cible 'grille' (FSQS), exactement comme
 * pour la cible 'qualimetre' — voir _showImportPreview.
 */

/**
 * Criticités valides.
 * @type {GrilleCriticite[]}
 */
const IMPORT_VALID_CRITS = ['Critique', 'Majeure', 'Mineure'];

/**
 * Poids par défaut selon la criticité.
 * @type {Record<GrilleCriticite, number>}
 */
const IMPORT_DEFAULT_POIDS = { Critique: 10, Majeure: 5, Mineure: 2 };

/**
 * Libellé de la zone Qualimètre regroupant les lignes importées
 * sans valeur de zone identifiable dans le document. Le document
 * reste la source de vérité : cette zone ne devine jamais une zone
 * absente, elle conserve simplement les lignes plutôt que de les
 * perdre.
 * @type {string}
 */
const IMPORT_UNCLASSIFIED_ZONE_LABEL = 'Non classé';

/**
 * Motif reconnaissant un libellé de section "commun" (point applicable
 * à tous les rayons/zones du document, pas à un rayon spécifique de ce
 * nom). Comparaison insensible à la casse et aux accents — couvre
 * "Commun", "COMMUNE", "Commune", etc. Volontairement restrictif (le
 * mot entier, pas une sous-chaîne) pour ne jamais traiter à tort une
 * zone réelle nommée différemment comme "commune" à toutes les autres.
 * @type {RegExp}
 */
const IMPORT_COMMON_ZONE_PATTERN = /^commun(e)?$/i;

/**
 * Indique si un libellé de zone/section désigne le rayon "commun"
 * (IMPORT_COMMON_ZONE_PATTERN), par comparaison sur le texte
 * normalisé (trim, accents retirés).
 * @param {string} zoneLabel
 * @returns {boolean}
 */
function _isCommonZoneLabel(zoneLabel) {
  /** @type {string} */
  const stripped = String(zoneLabel || '').trim().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
  return IMPORT_COMMON_ZONE_PATTERN.test(stripped);
}

// ─────────────────────────────────────────────
// 2. ÉTAT
// ─────────────────────────────────────────────

/** @type {boolean} Indique si SheetJS a déjà été chargé (lazy-load). */
let _xlsxLoaded = false;

/** @type {boolean} Indique si PDF.js a déjà été chargé (lazy-load). */
let _pdfjsLoaded = false;

/** @type {ImportParsedRow[]} Lignes parsées en attente de confirmation. */
let _importRows = [];

/** @type {RawImportRow[]} Lignes brutes du fichier actuellement chargé (clés = en-têtes d'origine), conservées pour rejouer normalizeRows si le mapping est corrigé manuellement sans re-lire le fichier. */
let _importRawRows = [];

/** @type {DetectionResult | null} Résultat de détection courant (mapping + scores + en-têtes non mappés), affiché et corrigible dans la modale. */
let _importDetection = null;

/** @type {ImportTarget} Destination de l'import. */
let _importTarget = 'grille';

/** @type {GrilleCriticite} Criticité appliquée aux lignes dont la criticité n'a pas pu être déterminée depuis le document (colonne absente ou valeur non reconnue) — réglable par l'utilisateur dans la modale avant import, voir _onDefaultCritChanged. Remplace l'ancien fallback fixe 'Majeure'. */
let _importDefaultCrit = 'Majeure';

/** @type {string[]} Rayon(s) FSQS choisis par l'utilisateur AVANT l'import (sélecteur au-dessus de la zone de dépose, voir _onImportDefaultRayonsChanged) — appliqué comme targetRayons par défaut à toutes les lignes de l'aperçu (cible 'grille' uniquement). Un rayon n'est jamais déduit du document : c'est toujours un choix explicite de l'utilisateur, modifiable ensuite ligne par ligne ou en masse (voir applyBulkRayonZoneAssignment). */
let _importDefaultRayons = [];

/** @type {string} Enseigne FSQS choisie par l'utilisateur AVANT l'import (single-select, voir _onImportDefaultEnseigneChanged), cible 'grille' uniquement. Vide = AUCUNE grille commune accessible (voir getGrille, grille.js — pas de grille commune sans enseigne) ; une ligne sans enseigne choisie est alors importée nulle part tant qu'aucun rayon cible n'a de magasin assigné individuellement. Une enseigne choisie = import vers DB.grilleCustom[enseigne][rayon], la grille commune de CETTE enseigne, héritée par tous ses magasins sans surcharge propre. */
let _importDefaultEnseigne = '';

// ─────────────────────────────────────────────
// 3. MODAL D'IMPORT
// ─────────────────────────────────────────────

/**
 * Ouvre la modale d'import, réinitialise l'état du module
 * (_importRows, criticité par défaut, rayon(s) cible(s) par défaut)
 * et bascule sur l'onglet CSV.
 *
 * ⚠️ CHANGÉ : peuple désormais #imp-default-rayon-cbs (rayon(s)
 * cible(s) choisis AVANT l'import — voir _importDefaultRayons,
 * _onImportDefaultRayonsChanged). Ce bloc est masqué pour la cible
 * 'qualimetre', qui n'a pas la notion de rayon FSQS.
 * @param {ImportTarget} [target] - Destination de l'import ; 'grille' par défaut.
 * @returns {void}
 */
function openImportModal(target) {
  _importTarget        = target || 'grille';
  _importRows          = [];
  _importDefaultCrit   = 'Majeure';
  _importDefaultRayons = [];
  _importDefaultEnseigne = '';

  el('imp-file-input').value   = '';
  el('imp-warnings').textContent = '';
  el('pdf-note').style.display = 'none';
  el('imp-format-info').innerHTML = IMPORT_FORMAT_INFO.default;
  if (el('imp-default-crit')) el('imp-default-crit').value = 'Majeure';

  if (el('imp-default-rayons-group')) {
    el('imp-default-rayons-group').style.display = _importTarget === 'qualimetre' ? 'none' : '';
  }
  if (el('imp-default-mags-group')) {
    el('imp-default-mags-group').style.display = _importTarget === 'qualimetre' ? 'none' : '';
  }
  if (el('imp-default-rayon-cbs')) {
    el('imp-default-rayon-cbs').innerHTML = getKnownRayons().map(rayon =>
      `<label class="cb-item"><input type="checkbox" class="imp-default-rayon-cb" value="${_escapeHtmlAttr(rayon)}" onchange="_onImportDefaultRayonsChanged()"> ${rayon}</label>`
    ).join('');
  }
  if (el('imp-default-enseigne-sel')) {
    el('imp-default-enseigne-sel').innerHTML = '<option value="">— Grille commune (toutes enseignes) —</option>' +
      getKnownEnseignes().map(e => `<option value="${_escapeHtmlAttr(e)}">${e}</option>`).join('');
  }

  /** @type {string} */
  const targetLabel = _importTarget === 'qualimetre' ? 'Qualimètre' : 'Grille d\'audit';
  document.querySelector('#m-import .modal-title').innerHTML =
    `<i class="ti ti-upload" style="color:var(--primary)"></i> Importer — ${targetLabel}`;

  _clearImportPreview();
  openModal('m-import');
}

/**
 * Met à jour _importDefaultRayons depuis les cases cochées dans
 * #imp-default-rayon-cbs. Sans effet sur un fichier déjà chargé dans
 * l'aperçu — ce choix s'applique uniquement aux PROCHAINS fichiers
 * traités (voir _showImportPreview, appelée à chaque nouveau
 * chargement de fichier) ; il n'écrase jamais des targetRayons déjà
 * ajustés manuellement ligne par ligne sur un aperçu en cours.
 * @returns {void}
 */
function _onImportDefaultRayonsChanged() {
  _importDefaultRayons = [...document.querySelectorAll('.imp-default-rayon-cb:checked')].map(cb => cb.value);
}

/**
 * Met à jour _importDefaultStores depuis les cases cochées dans
 * #imp-default-mag-cbs (groupées par enseigne, voir
 * buildMagasinCheckboxesByEnseigne, ui.js). Appelée à chaque
 * changement d'une case magasin (voir le onchange câblé par
 * buildMagasinCheckboxesByEnseigne sur _onMagasinCheckboxChanged,
 * qui ne gère que l'état visuel de la case enseigne — c'est cette
 * fonction qui met à jour l'état réel utilisé par l'import).
 * Aucun magasin coché = import vers la grille commune (DB.grilleCustom,
 * partagée par tous les magasins sans surcharge propre) — voir
 * getGrille, grille.js.
 * @returns {void}
 */
/**
 * Met à jour _importDefaultEnseigne avec l'enseigne choisie dans
 * #imp-default-enseigne-sel (single-select). À l'import, cette
 * enseigne reçoit la grille comme base commune
 * (DB.grilleCustom[enseigne]), héritée par tous ses magasins, sans
 * jamais inclure les points créés via le formulaire manuel (ceux-là
 * restent des cas particuliers propres à chaque magasin, voir
 * saveCtrl, grille.js — non touchés par l'import).
 * @returns {void}
 */
function _onImportDefaultEnseigneChanged() {
  _importDefaultEnseigne = v('imp-default-enseigne-sel');
}

// ⚠️ CHANGÉ : la section "ONGLETS DE FORMAT" (switchImportTab) a été
// supprimée — il n'y a plus de sélection manuelle d'onglet avant
// dépôt de fichier, le format est détecté automatiquement par
// l'extension (voir processImportFile).

/**
 * Réinitialise l'aperçu d'import (lignes, affichage, bouton de
 * confirmation désactivé) et remet la zone de dépose à son état
 * initial (voir _resetDropZone).
 * @returns {void}
 */
function _clearImportPreview() {
  _importRows      = [];
  _importRawRows   = [];
  _importDetection = null;
  el('imp-preview').style.display    = 'none';
  el('imp-mapping-block').innerHTML  = '';
  el('imp-confirm-btn').disabled     = true;
  el('imp-confirm-btn').style.opacity = '.5';
  el('imp-count-btn').textContent    = '';
  _resetDropZone();
}

/**
 * Point d'entrée public du bouton "Effacer" de l'aperçu d'import.
 * ⚠️ CORRIGÉ : ce nom était référencé par le bouton "Effacer" de
 * Qualistore.html (onclick="clearImportPreview()") sans qu'aucune
 * fonction de ce nom exact n'existe — seule la variante interne
 * _clearImportPreview() était définie. Le bouton était donc inopérant
 * depuis l'origine. On délègue simplement à la version interne,
 * également en remettant l'input file à vide pour permettre de
 * redéposer le même fichier (un <input type="file"> ne déclenche pas
 * 'change' si on y sélectionne deux fois le même fichier sans le
 * vider entre-temps).
 * @returns {void}
 */
function clearImportPreview() {
  el('imp-file-input').value = '';
  _clearImportPreview();
}

// ─────────────────────────────────────────────
// 5. GESTION DES FICHIERS (drop & input)
// ─────────────────────────────────────────────

/**
 * Gère le drop d'un fichier sur la zone de dépose.
 * @param {DragEvent} event
 * @returns {void}
 */
function handleImportDrop(event) {
  event.preventDefault();
  const dropZone = el('imp-drop');
  dropZone.style.borderColor = 'var(--border)';
  dropZone.style.background  = 'var(--bg)';
  /** @type {File | undefined} */
  const file = event.dataTransfer.files[0];
  if (file) processImportFile(file);
}

/**
 * Gère la sélection d'un fichier via l'input file classique.
 * @param {HTMLInputElement} input
 * @returns {void}
 */
function handleImportFile(input) {
  /** @type {File | undefined} */
  const file = input.files[0];
  if (file) processImportFile(file);
  input.value = '';
}

/**
 * Détecte le format du fichier et délègue au parseur approprié.
 * Réduit visuellement la zone de dépose au profit de l'aperçu (voir
 * _showDropZoneFilled) — le bandeau d'accueil n'a plus d'utilité une
 * fois un fichier chargé, et libère la place pour le tableau de
 * lignes détectées.
 *
 * ⚠️ CHANGÉ : ne dépend plus d'un onglet de format choisi à l'avance
 * (switchImportTab, supprimée) — le format est entièrement déterminé
 * par l'extension du fichier déposé, et le message d'aide
 * (#imp-format-info) se met à jour après coup pour refléter le
 * format réellement détecté.
 * @param {File} file
 * @returns {void}
 */
function processImportFile(file) {
  _showDropZoneFilled(file.name);

  /** @type {string} */
  const name = file.name.toLowerCase();
  /** @type {'csv'|'xlsx'|'pdf'} */
  let detectedFormat;

  if (name.endsWith('.xlsx') || name.endsWith('.xls')) {
    detectedFormat = 'xlsx';
    _importXLSX(file);
  } else if (name.endsWith('.pdf')) {
    detectedFormat = 'pdf';
    _importPDF(file);
  } else {
    detectedFormat = 'csv';
    _importCSV(file);
  }

  if (el('imp-format-info')) el('imp-format-info').innerHTML = IMPORT_FORMAT_INFO[detectedFormat];
  if (el('pdf-note')) el('pdf-note').style.display = detectedFormat === 'pdf' ? '' : 'none';
}

/**
 * Bascule la zone de dépose dans son état compact (fichier chargé) :
 * réduit le padding et remplace le bandeau d'accueil (icône + texte
 * d'instructions) par le nom du fichier déposé.
 * @param {string} fileName
 * @returns {void}
 */
function _showDropZoneFilled(fileName) {
  el('imp-drop').style.padding   = '10px 16px';
  el('imp-drop-empty').style.display  = 'none';
  el('imp-drop-filled').style.display = 'flex';
  el('imp-drop-filename').textContent = fileName;
}

/**
 * Revient à l'état initial (vide) de la zone de dépose — appelé à
 * l'ouverture de la modale, au changement d'onglet de format, et à
 * l'effacement de l'aperçu, pour ne jamais laisser affiché le nom
 * d'un fichier qui ne correspond plus à l'aperçu courant.
 * @returns {void}
 */
function _resetDropZone() {
  el('imp-drop').style.padding        = '32px 20px';
  el('imp-drop-empty').style.display  = '';
  el('imp-drop-filled').style.display = 'none';
  el('imp-drop-filename').textContent = '';
}

// ─────────────────────────────────────────────
// 6. PARSEURS
// ─────────────────────────────────────────────

// ── CSV / TSV / TXT ──

/**
 * Lit un fichier CSV/TSV/TXT en tant que texte UTF-8 et le parse.
 * @param {File} file
 * @returns {void}
 */
function _importCSV(file) {
  const reader = new FileReader();
  reader.onload = event => _parseCSVText(event.target.result);
  reader.readAsText(file, 'UTF-8');
}

/**
 * Parse un texte CSV/TSV en lignes RawImportRow (clés = en-têtes
 * bruts du document), en détectant automatiquement le séparateur.
 * Délègue à buildRawRowsFromCellRows (import-grille.js) la décision
 * entre tableau unique et sections multi-tableaux (zone en
 * ligne-titre) — voir sa documentation pour le détail. Si la ligne
 * d'en-tête (ou de chaque section) ne peut pas servir d'en-tête
 * fiable, des en-têtes synthétiques sont générés à la place (voir
 * buildSyntheticHeaders, import-detect.js).
 * @param {string} text
 * @returns {void}
 */
function _parseCSVText(text) {
  /** @type {string[]} */
  const lines = text.split(/\r?\n/).filter(l => l.trim());
  if (!lines.length) { _showImportPreview([], null, [], '0 ligne lue'); return; }

  /** @type {string} */
  const separator = detectImportSeparator(lines);

  /** @type {string[][]} */
  const cellRows = lines.map(line => line.split(separator).map(c => c.trim().replace(/^["']|["']$/g, '')));

  /** @type {{rawRows: RawImportRow[], usedHeaderRow: boolean, sectionCount: number}} */
  const { rawRows, usedHeaderRow, sectionCount } = buildRawRowsFromCellRows(cellRows);

  /** @type {DetectionResult} */
  const detection = _forceZoneMappingToDetectedColumn(detectConceptMapping(rawRows), rawRows);
  /** @type {NormalizedImportRow[]} */
  const normalized = normalizeRows(rawRows, detection.mapping, detection.unmappedHeaders);

  /** @type {string} */
  const readMessage = `${lines.length} ligne(s) lue(s)${usedHeaderRow ? '' : ' (sans en-tête détecté)'}${sectionCount > 1 ? ` — ${sectionCount} zones détectées` : ''}`;
  _showImportPreview(normalized, detection, rawRows, readMessage);
}

/**
 * Détermine si la première ligne de cellules peut servir d'en-tête
 * fiable, et produit les RawImportRow correspondants. Une ligne
 * d'en-tête est jugée fiable si, une fois utilisée comme noms de
 * colonnes, la détection de concepts y trouve 'point' ET au moins
 * un concept secondaire parmi zone/criticite/categorie/methode/
 * commentaire/poids — exiger 'point' + au moins un autre concept
 * (plutôt que 'point' + 'zone' obligatoirement) plutôt qu'un seul
 * concept isolé évite qu'une ligne de DONNÉES dont une valeur
 * ressemble accidentellement à un nom de colonne (ex : une valeur de
 * criticité 'Critique' matchant le motif d'en-tête /criti.../ ) soit
 * acceptée à tort comme ligne d'en-tête sur la seule foi de ce
 * concept isolé.
 *
 * Le critère a été assoupli par rapport à 'point ET zone'
 * obligatoires : certains documents découpent la feuille en
 * sections par zone (une ligne-titre "Zone : XXX" au-dessus de
 * chaque mini-tableau, voir buildRawRowsFromCellRows) — leurs
 * tableaux n'ont alors aucune colonne zone propre, uniquement
 * 'point' + des colonnes secondaires (catégorie, méthode...). Sans
 * cet assouplissement, ces en-têtes de section seraient à tort
 * traités comme des lignes de données.
 *
 * Si le test échoue, la ligne est traitée comme une ligne de données
 * et des en-têtes synthétiques sont générés à la place.
 * @param {string[][]} cellRows
 * @returns {{rawRows: RawImportRow[], usedHeaderRow: boolean, headerRow: string[]}}
 */
function _buildRawRowsWithHeaderDetection(cellRows) {
  /** @type {string[]} */
  const candidateHeaders = cellRows[0];
  /** @type {RawImportRow[]} */
  const rowsAssumingHeader = cellRows.slice(1).map(cells => _zipHeadersAndCells(candidateHeaders, cells));

  /** @type {ConceptMapping | null} */
  const tentativeMapping = rowsAssumingHeader.length ? detectConceptMapping(rowsAssumingHeader).mapping : null;
  /** @type {boolean} */
  const hasSecondaryConcept = !!tentativeMapping && ['zone', 'criticite', 'categorie', 'methode', 'commentaire', 'poids'].some(c => tentativeMapping[c]);
  if (tentativeMapping && tentativeMapping.point && hasSecondaryConcept) {
    return { rawRows: rowsAssumingHeader, usedHeaderRow: true, headerRow: candidateHeaders };
  }

  /** @type {string[]} */
  const syntheticHeaders = buildSyntheticHeaders(candidateHeaders.length);
  /** @type {RawImportRow[]} */
  const rowsWithSyntheticHeaders = cellRows.map(cells => _zipHeadersAndCells(syntheticHeaders, cells));
  return { rawRows: rowsWithSyntheticHeaders, usedHeaderRow: false, headerRow: syntheticHeaders };
}

/**
 * Associe une ligne d'en-têtes à une ligne de cellules pour produire
 * un RawImportRow. Les cellules excédentaires (plus de cellules que
 * d'en-têtes) sont ignorées ; les en-têtes sans cellule correspondante
 * reçoivent une chaîne vide.
 * @param {string[]} headers
 * @param {string[]} cells
 * @returns {RawImportRow}
 */
function _zipHeadersAndCells(headers, cells) {
  /** @type {RawImportRow} */
  const row = {};
  headers.forEach((header, i) => { row[header] = cells[i] !== undefined ? cells[i] : ''; });
  return row;
}

/**
 * Nom de la colonne synthétique injectée sur chaque ligne d'une
 * section détectée (zone en ligne-titre), portant le libellé de
 * zone de cette section. Délibérément absent de
 * IMPORT_CONCEPT_DEFINITIONS (import-detect.js) : ce n'est pas une
 * colonne du document d'origine, donc elle ne doit jamais entrer en
 * compétition avec une vraie colonne 'zone' lors du scoring — elle
 * est injectée APRÈS la détection par section, directement comme
 * candidate prioritaire du mapping final (voir
 * buildRawRowsFromCellRows).
 * @type {string}
 */
const IMPORT_DETECTED_ZONE_COLUMN = 'Zone (détectée)';

/**
 * Point d'entrée unique pour transformer des lignes brutes de
 * cellules (telles que lues depuis un CSV/XLSX, avant toute
 * détection d'en-tête) en RawImportRow exploitables par
 * detectConceptMapping puis normalizeRows.
 *
 * Gère deux cas, qui DOIVENT coexister sans que l'un ne nuise à
 * l'autre (fichiers clients mixtes — certains avec zone en colonne,
 * d'autres en ligne-titre) :
 * - Si au moins une ligne-titre de section est détectée
 *   (detectSectionTitleRowIndexes, import-detect.js) : la feuille
 *   est découpée en sections indépendantes (splitRowsIntoSections),
 *   chacune traitée comme un mini-tableau autonome par
 *   _buildRawRowsWithHeaderDetection ; le libellé de zone de chaque
 *   section est injecté comme valeur d'une colonne synthétique
 *   (IMPORT_DETECTED_ZONE_COLUMN) sur toutes ses lignes, puis cette
 *   colonne synthétique est imposée comme mapping 'zone' — elle
 *   prime sur toute colonne 'zone' que detectConceptMapping
 *   trouverait par ailleurs dans la section (il ne devrait
 *   normalement pas y en avoir, mais en cas d'ambiguïté la zone
 *   réellement écrite en ligne-titre est la source la plus fiable).
 * - Sinon (aucune ligne-titre détectée) : comportement inchangé, un
 *   seul tableau couvrant toute la feuille.
 *
 * Le fill-down (fillDownColumn, import-detect.js) est appliqué par
 * section, sur la colonne détectée comme 'categorie' UNIQUEMENT
 * (cas observé : catégorie en cellules visuellement fusionnées dans
 * le document source, vides après aplatissement) — jamais sur
 * 'zone', 'point', ou toute autre colonne, pour ne jamais propager
 * une valeur au-delà de ce qui est explicitement constaté.
 *
 * Une section dont le libellé désigne le rayon "commun" (voir
 * _isCommonZoneLabel : "Commun", "Commune"...) n'est jamais importée
 * comme zone autonome : ses lignes sont dupliquées dans chacune des
 * autres zones détectées dans le même fichier (un point commun à
 * tous les rayons doit apparaître dans chacun, pas isolé sous un
 * rayon fictif "Commun"). Sans aucune autre zone détectée dans le
 * fichier, les lignes "commun" sont conservées telles quelles (rien
 * à dupliquer).
 * @param {string[][]} cellRows
 * @returns {{rawRows: RawImportRow[], usedHeaderRow: boolean, sectionCount: number}}
 */
function buildRawRowsFromCellRows(cellRows) {
  /** @type {number[]} */
  const titleRowIndexes = detectSectionTitleRowIndexes(cellRows);

  if (titleRowIndexes.length === 0) {
    /** @type {{rawRows: RawImportRow[], usedHeaderRow: boolean, headerRow: string[]}} */
    const single = _buildRawRowsWithHeaderDetection(cellRows);
    return { rawRows: single.rawRows, usedHeaderRow: single.usedHeaderRow, sectionCount: 1 };
  }

  /** @type {ImportSection[]} */
  const sections = splitRowsIntoSections(cellRows, titleRowIndexes);

  /** @type {RawImportRow[]} */
  const allRawRows = [];
  /** @type {boolean} */
  let anySectionUsedHeaderRow = false;

  sections.forEach(section => {
    if (!section.rows.length) return;

    /** @type {{rawRows: RawImportRow[], usedHeaderRow: boolean, headerRow: string[]}} */
    const built = _buildRawRowsWithHeaderDetection(section.rows);
    if (built.usedHeaderRow) anySectionUsedHeaderRow = true;
    if (!built.rawRows.length) return;

    // Fill-down sur la colonne détectée comme 'categorie' pour cette
    // section, si elle existe — opère sur les RawImportRow déjà
    // zippés (et non sur les CellRow bruts) car la colonne
    // catégorie n'est identifiable qu'après détection d'en-tête,
    // laquelle peut différer d'une section à l'autre.
    /** @type {ConceptMapping} */
    const sectionMapping = detectConceptMapping(built.rawRows).mapping;
    /** @type {RawImportRow[]} */
    let sectionRows = built.rawRows;
    if (sectionMapping.categorie) {
      sectionRows = _fillDownRawRowsColumn(sectionRows, sectionMapping.categorie);
    }

    // Injection du libellé de zone de la section comme colonne
    // synthétique, sur toutes les lignes de cette section. Cette
    // colonne est ajoutée en PREMIÈRE position des clés de chaque
    // ligne (ordre de définition d'un objet JS) afin qu'elle soit
    // listée en tête des en-têtes disponibles dans le bloc de
    // mapping de la modale (UX : la zone détectée doit être visible
    // immédiatement, pas reléguée en fin de liste).
    sectionRows = sectionRows.map(row => Object.assign({ [IMPORT_DETECTED_ZONE_COLUMN]: section.zoneLabel }, row));

    allRawRows.push(...sectionRows);
  });

  // Les sections "commun" (voir _isCommonZoneLabel) représentent des
  // points applicables à TOUS les rayons/zones du document, pas à un
  // rayon nommé "Commun" — elles sont donc dupliquées dans chacune
  // des autres zones détectées dans ce même fichier, puis retirées en
  // tant que zone autonome (sinon elles apparaîtraient en double : une
  // fois sous "Commun", une fois dupliquées).
  /** @type {string[]} */
  const otherZoneLabels = [...new Set(
    sections.filter(s => !_isCommonZoneLabel(s.zoneLabel)).map(s => s.zoneLabel)
  )];

  /** @type {RawImportRow[]} */
  const commonRows = allRawRows.filter(row => _isCommonZoneLabel(row[IMPORT_DETECTED_ZONE_COLUMN]));
  /** @type {RawImportRow[]} */
  const nonCommonRows = allRawRows.filter(row => !_isCommonZoneLabel(row[IMPORT_DETECTED_ZONE_COLUMN]));

  /** @type {RawImportRow[]} */
  const duplicatedCommonRows = [];
  if (commonRows.length && otherZoneLabels.length) {
    otherZoneLabels.forEach(zoneLabel => {
      commonRows.forEach(row => {
        duplicatedCommonRows.push(Object.assign({}, row, { [IMPORT_DETECTED_ZONE_COLUMN]: zoneLabel }));
      });
    });
  } else if (commonRows.length) {
    // Aucune autre zone détectée dans le fichier : rien à dupliquer,
    // les lignes "commun" sont conservées telles quelles plutôt que
    // perdues.
    duplicatedCommonRows.push(...commonRows);
  }

  return {
    rawRows: nonCommonRows.concat(duplicatedCommonRows),
    usedHeaderRow: anySectionUsedHeaderRow,
    sectionCount: sections.length,
  };
}

/**
 * Applique fillDownColumn (import-detect.js, qui opère sur des
 * CellRow indexées par position) à des RawImportRow déjà zippés
 * (indexés par en-tête). Pont entre les deux représentations :
 * convertit en CellRow selon l'ordre des en-têtes de la première
 * ligne, applique le fill-down, reconvertit en RawImportRow.
 * @param {RawImportRow[]} rawRows
 * @param {string} columnHeader - En-tête de la colonne à propager.
 * @returns {RawImportRow[]}
 */
function _fillDownRawRowsColumn(rawRows, columnHeader) {
  if (!rawRows.length) return rawRows;
  /** @type {string[]} */
  const headers = Object.keys(rawRows[0]);
  /** @type {number} */
  const columnIndex = headers.indexOf(columnHeader);
  if (columnIndex === -1) return rawRows;

  /** @type {string[][]} */
  const asCellRows = rawRows.map(row => headers.map(h => row[h]));
  /** @type {string[][]} */
  const filled = fillDownColumn(asCellRows, columnIndex);
  return filled.map(cells => _zipHeadersAndCells(headers, cells));
}

/**
 * Post-traite un DetectionResult pour garantir que, si la colonne
 * synthétique IMPORT_DETECTED_ZONE_COLUMN est présente parmi les
 * en-têtes (fichier avec au moins une section détectée par zone en
 * ligne-titre), elle est TOUJOURS retenue comme mapping 'zone' —
 * sans dépendre du score qu'elle obtiendrait sinon face à une
 * éventuelle autre colonne candidate. La zone réellement écrite en
 * ligne-titre dans le document est la source la plus fiable
 * disponible pour ces sections ; elle ne doit jamais être supplantée
 * par une heuristique de scoring sur une autre colonne.
 *
 * Si une autre colonne avait été assignée à 'zone' avant cet appel,
 * elle est libérée vers `unmappedHeaders` (son contenu n'est pas
 * perdu : il rejoint le champ `extra` via normalizeRows, comme toute
 * colonne non mappée).
 *
 * Sans effet si IMPORT_DETECTED_ZONE_COLUMN est absente des
 * en-têtes (fichier sans aucune section détectée) — la détection
 * standard s'applique alors normalement, comportement inchangé.
 * @param {DetectionResult} detection
 * @param {RawImportRow[]} rawRows
 * @returns {DetectionResult}
 */
function _forceZoneMappingToDetectedColumn(detection, rawRows) {
  /** @type {string[]} */
  const headers = rawRows.length ? Object.keys(rawRows[0]) : [];
  if (!headers.includes(IMPORT_DETECTED_ZONE_COLUMN)) return detection;
  if (detection.mapping.zone === IMPORT_DETECTED_ZONE_COLUMN) return detection;

  /** @type {string | null} */
  const previousZoneHeader = detection.mapping.zone;
  detection.mapping.zone = IMPORT_DETECTED_ZONE_COLUMN;

  /** @type {Set<string>} */
  const assignedHeaders = new Set(Object.values(detection.mapping).filter(Boolean));
  detection.unmappedHeaders = headers.filter(h => !assignedHeaders.has(h));

  // previousZoneHeader rejoint naturellement unmappedHeaders ci-dessus
  // s'il n'est repris par aucun autre concept — rien d'autre à faire.
  void previousZoneHeader;

  return detection;
}

// ── XLSX ──

/**
 * Charge SheetJS si nécessaire, puis lit et parse un fichier
 * XLSX/XLS.
 * @param {File} file
 * @returns {Promise<void>}
 */
async function _importXLSX(file) {
  if (!_xlsxLoaded) {
    try {
      await _loadScript(CDN_SHEETJS);
      _xlsxLoaded = true;
    } catch (_) {
      alert('Impossible de charger la librairie Excel. Vérifiez votre connexion internet.');
      return;
    }
  }

  const reader = new FileReader();
  reader.onload = event => {
    try {
      /** @type {Object} Classeur XLSX (librairie SheetJS, non typée en détail). */
      const workbook  = XLSX.read(new Uint8Array(event.target.result), { type: 'array' });
      const worksheet = workbook.Sheets[workbook.SheetNames[0]];
      /** @type {string[][]} */
      const cellRows  = XLSX.utils.sheet_to_json(worksheet, { header: 1, defval: '' })
        .filter(row => row.join('').trim())
        .map(row => row.map(c => String(c)));

      /** @type {{rawRows: RawImportRow[], usedHeaderRow: boolean, sectionCount: number}} */
      const { rawRows, usedHeaderRow, sectionCount } = buildRawRowsFromCellRows(cellRows);
      /** @type {DetectionResult} */
      const detection = _forceZoneMappingToDetectedColumn(detectConceptMapping(rawRows), rawRows);
      /** @type {NormalizedImportRow[]} */
      const normalized = normalizeRows(rawRows, detection.mapping, detection.unmappedHeaders);

      /** @type {string} */
      const readMessage = `${cellRows.length} ligne(s) lue(s) depuis "${workbook.SheetNames[0]}"${usedHeaderRow ? '' : ' (sans en-tête détecté)'}${sectionCount > 1 ? ` — ${sectionCount} zones détectées` : ''}`;
      _showImportPreview(normalized, detection, rawRows, readMessage);
    } catch (error) {
      alert('Erreur lors de la lecture du fichier Excel : ' + error.message);
    }
  };
  reader.readAsArrayBuffer(file);
}

// ── PDF ──

/**
 * Charge PDF.js si nécessaire, puis lit et extrait le texte d'un
 * fichier PDF avant de le parser comme du CSV (colonnes séparées
 * par tabulation, reconstituées par position).
 * @param {File} file
 * @returns {Promise<void>}
 */
async function _importPDF(file) {
  if (!_pdfjsLoaded) {
    try {
      await _loadScript(CDN_PDFJS);
      pdfjsLib.GlobalWorkerOptions.workerSrc = CDN_PDFJS_WORKER;
      _pdfjsLoaded = true;
    } catch (_) {
      alert('Impossible de charger la librairie PDF. Vérifiez votre connexion internet.');
      return;
    }
  }

  const reader = new FileReader();
  reader.onload = async event => {
    try {
      /** @type {Object} Document PDF.js — API non typée en détail ici. */
      const pdf      = await pdfjsLib.getDocument({ data: new Uint8Array(event.target.result) }).promise;
      /** @type {string} */
      const fullText = await _extractPdfText(pdf);
      _parseCSVText(fullText);
    } catch (error) {
      alert('Erreur lecture PDF : ' + error.message);
    }
  };
  reader.readAsArrayBuffer(file);
}

/**
 * Extrait le texte d'un PDF page par page, en reconstituant les
 * lignes par position Y (regroupement des éléments dont les
 * coordonnées Y arrondies coïncident) et les mots de gauche à
 * droite par position X, séparés par tabulation.
 * @param {Object} pdf - Document PDF.js.
 * @returns {Promise<string>} Texte reconstitué, une ligne par `\n`, colonnes séparées par `\t`.
 */
async function _extractPdfText(pdf) {
  let fullText = '';

  for (let pageNum = 1; pageNum <= pdf.numPages; pageNum++) {
    const page    = await pdf.getPage(pageNum);
    const content = await page.getTextContent();

    // Regrouper les éléments par ligne (position Y arrondie)
    /** @type {Record<number, {x: number, str: string}[]>} */
    const lineMap = {};
    content.items.forEach(item => {
      /** @type {number} */
      const y = Math.round(item.transform[5]);
      if (!lineMap[y]) lineMap[y] = [];
      lineMap[y].push({ x: item.transform[4], str: item.str });
    });

    // Trier les lignes de haut en bas, chacune de gauche à droite
    /** @type {{x: number, str: string}[][]} */
    const rawLines = Object.keys(lineMap)
      .sort((a, b) => b - a)
      .map(y => lineMap[y].sort((a, b) => a.x - b.x));

    // Fusionner les lignes physiques qui ne sont en réalité que la
    // suite, par retour à la ligne, d'une cellule trop longue de la
    // ligne logique précédente — voir _mergeWrappedPdfLines.
    /** @type {{x: number, str: string}[][]} */
    const mergedLines = _mergeWrappedPdfLines(rawLines);

    mergedLines.forEach(cells => {
      fullText += cells.map(c => c.str).join('\t') + '\n';
    });
  }

  return fullText;
}

/**
 * Fusionne les lignes physiques d'un texte PDF qui appartiennent en
 * réalité à la même ligne logique de tableau, mais ont été séparées
 * par un simple retour à la ligne À L'INTÉRIEUR d'une cellule (texte
 * trop long pour tenir sur une seule ligne physique) — cas très
 * fréquent dès qu'une colonne contient une description un peu longue.
 *
 * ⚠️ SANS CETTE FUSION, chaque cellule qui déborde produit une ligne
 * fantôme à une seule cellule, qui casse l'alignement colonne/en-tête
 * pour toutes les lignes suivantes ET peut être prise à tort pour une
 * ligne-titre de section (voir detectSectionTitleRowIndexes,
 * import-detect.js) — c'est la cause la plus fréquente d'un import
 * PDF qui "ne détecte aucune donnée" alors que le fichier est
 * pourtant un tableau parfaitement lisible visuellement.
 *
 * Heuristique auto-calibrée sur CHAQUE ligne précédente (jamais un
 * seuil fixe en points, qui serait fragile d'un document à l'autre
 * selon la largeur réelle des colonnes) : une ligne de continuation
 * n'a normalement aucun élément proche de la colonne de GAUCHE de la
 * ligne précédente — tout ce qu'elle contient se trouve plus près
 * d'une colonne plus à droite. Concrètement, si le premier élément
 * d'une ligne est plus proche en X de la 2ème cellule de la ligne
 * précédente que de sa 1ère, c'est une continuation ; sinon (y
 * compris si la ligne précédente n'a qu'une seule cellule, ex : une
 * ligne-titre de section) c'est une nouvelle ligne. Son contenu est
 * alors rattaché (avec un espace) à la cellule de la ligne précédente
 * dont le X est le plus proche — jamais à une position arbitraire.
 *
 * Ne fusionne jamais au-delà d'une page (chaque page redémarre avec
 * un tableau vide de lignes déjà accumulées) : un saut de page reste
 * toujours traité comme un nouveau départ, cas plus rare et plus
 * ambigu qu'il vaut mieux ne pas deviner.
 * @param {{x: number, str: string}[][]} rawLines - Lignes physiques triées de haut en bas, chacune déjà triée de gauche à droite.
 * @returns {{x: number, str: string}[][]} Lignes logiques fusionnées (mêmes objets cellules que rawLines, mutés en place pour les fusions).
 */
function _mergeWrappedPdfLines(rawLines) {
  /** @type {{x: number, str: string}[][]} */
  const mergedLines = [];

  rawLines.forEach(line => {
    /** @type {{x: number, str: string}[]} */
    const meaningfulItems = line.filter(item => item.str && item.str.trim());
    if (!meaningfulItems.length) return;

    /** @type {{x: number, str: string}[] | undefined} */
    const previousLine = mergedLines[mergedLines.length - 1];
    // Seules les cellules porteuses de texte réel (lettres/chiffres)
    // comptent comme colonnes pour la décision de continuation — une
    // icône/émoji isolée dans sa propre cellule (fréquent en tête de
    // ligne-titre de section) ne doit jamais être prise pour une
    // "colonne 1", sous peine de fausser la comparaison avec la ligne
    // suivante. Elle reste néanmoins conservée telle quelle dans le
    // résultat (meaningfulItems, non filtré) : elle n'est ignorée que
    // pour cette décision.
    /** @type {{x: number, str: string}[]} */
    const previousTextualCells = previousLine
      ? previousLine.filter(item => /[\p{L}\d]/u.test(item.str))
      : [];

    /** @type {boolean} */
    const looksLikeContinuation =
      previousTextualCells.length > 1 &&
      Math.abs(meaningfulItems[0].x - previousTextualCells[0].x) > Math.abs(meaningfulItems[0].x - previousTextualCells[1].x);

    if (!looksLikeContinuation) {
      mergedLines.push(meaningfulItems);
      return;
    }

    meaningfulItems.forEach(item => {
      /** @type {{x: number, str: string}} */
      let closestCell = previousTextualCells[0];
      /** @type {number} */
      let smallestDistance = Math.abs(previousTextualCells[0].x - item.x);
      previousTextualCells.forEach(cell => {
        /** @type {number} */
        const distance = Math.abs(cell.x - item.x);
        if (distance < smallestDistance) { smallestDistance = distance; closestCell = cell; }
      });
      closestCell.str = closestCell.str ? `${closestCell.str} ${item.str}` : item.str;
    });
  });

  return mergedLines;
}

// ─────────────────────────────────────────────
// 7. NORMALISATION DES DONNÉES
// ─────────────────────────────────────────────

/**
 * Normalise une criticité brute en l'une des valeurs connues
 * (IMPORT_VALID_CRITS), par correspondance insensible à la casse.
 * @param {string} crit
 * @returns {GrilleCriticite | null} La criticité normalisée, ou null si non reconnue.
 */
function _normalizeCrit(crit) {
  return IMPORT_VALID_CRITS.find(c => c.toLowerCase() === crit.toLowerCase()) || null;
}

// ─────────────────────────────────────────────
// 8. APERÇU ET VALIDATION
// ─────────────────────────────────────────────

/**
 * Normalise et valide les lignes déjà routées par le détecteur de
 * concepts (import-detect.js/import-normalize.js), construit
 * l'aperçu HTML (mapping + tableau de lignes), et active/désactive
 * le bouton de confirmation selon le nombre de lignes valides.
 *
 * ⚠️ CHANGÉ : pour la cible 'grille' (FSQS), le rayon n'est plus
 * jamais rejeté pour cause de non-reconnaissance — il n'existe plus
 * de liste fermée (voir l'avertissement en tête de fichier). Si le
 * rayon brut du document correspond, à la casse près, à un rayon déjà
 * connu (getKnownRayons(), rayons.js), c'est la casse canonique
 * existante qui est conservée (évite de créer "boucherie" en doublon
 * de "Boucherie") ; sinon, le rayon est conservé exactement tel
 * qu'écrit dans le document et sera créé à la volée à la
 * confirmation de l'import (voir _importIntoGrille). La seule
 * condition de validité, pour les deux cibles désormais, est un
 * intitulé non vide.
 *
 * La criticité non déterminée depuis le document (colonne absente
 * ou valeur non reconnue) retombe sur _importDefaultCrit plutôt que
 * sur une valeur fixe — réglable par l'utilisateur dans la modale
 * (voir _onDefaultCritChanged) avant confirmation de l'import.
 * @param {NormalizedImportRow[]} normalizedRows - Lignes déjà routées par normalizeRows (import-normalize.js) selon le mapping détecté.
 * @param {DetectionResult | null} detection - Résultat de detectConceptMapping (import-detect.js) ; null si rawRows est vide (aucun fichier exploitable).
 * @param {RawImportRow[]} rawRows - Lignes brutes d'origine, conservées pour permettre un nouveau passage de normalizeRows si l'utilisateur corrige le mapping.
 * @param {string} readMessage - Message affiché dans le titre de l'aperçu (ex : nombre de lignes lues).
 * @returns {void}
 */
/**
 * Normalise et valide les lignes déjà routées par le détecteur de
 * concepts (import-detect.js/import-normalize.js), construit
 * l'aperçu HTML (mapping + tableau de lignes), et active/désactive
 * le bouton de confirmation selon le nombre de lignes valides.
 *
 * ⚠️ CHANGÉ : le libellé détecté depuis le document (colonne "Zone"
 * du fichier, ou libellé de ligne-titre de section, voir
 * import-detect.js) alimente désormais row.zone — JAMAIS row.rayon.
 * Un rayon FSQS n'est plus jamais déduit du document : targetRayons
 * de chaque ligne est initialisé avec _importDefaultRayons (rayon(s)
 * choisis par l'utilisateur dans le sélecteur au-dessus de l'aperçu
 * AVANT l'import, voir _onImportDefaultRayonsChanged), identique pour
 * toutes les lignes du fichier. L'ancien comportement créait à tort
 * un nouveau RAYON pour chaque libellé de section détecté — désormais
 * ce libellé devient une ZONE à l'intérieur du/des rayon(s) choisis,
 * cohérent avec le sens réel de "zone = sous-partie d'un rayon".
 * Une zone détectée correspondant, à la casse près, à une zone déjà
 * connue dans au moins un des rayons par défaut (getZonesForRayon,
 * rayons.js) conserve la casse canonique existante.
 *
 * La seule condition de validité, pour les deux cibles, est un
 * intitulé non vide — voir le typedef ImportParsedRow pour la
 * distinction entre `valid` (intitulé) et l'exclusion supplémentaire
 * par `targetRayons` vide (cible 'grille' uniquement, voir
 * confirmImport).
 *
 * La criticité non déterminée depuis le document (colonne absente
 * ou valeur non reconnue) retombe sur _importDefaultCrit plutôt que
 * sur une valeur fixe — réglable par l'utilisateur dans la modale
 * (voir _onDefaultCritChanged) avant confirmation de l'import.
 * @param {NormalizedImportRow[]} normalizedRows - Lignes déjà routées par normalizeRows (import-normalize.js) selon le mapping détecté.
 * @param {DetectionResult | null} detection - Résultat de detectConceptMapping (import-detect.js) ; null si rawRows est vide (aucun fichier exploitable).
 * @param {RawImportRow[]} rawRows - Lignes brutes d'origine, conservées pour permettre un nouveau passage de normalizeRows si l'utilisateur corrige le mapping.
 * @param {string} readMessage - Message affiché dans le titre de l'aperçu (ex : nombre de lignes lues).
 * @returns {void}
 */
function _showImportPreview(normalizedRows, detection, rawRows, readMessage) {
  _importRows  = [];
  _importRawRows = rawRows;
  _importDetection = detection;

  /** @type {ImportParsedRow[]} */
  const previewRows = [];
  /** @type {boolean} */
  const isQualimetreTarget = _importTarget === 'qualimetre';

  // Casse canonique : fusionne les zones déjà connues de tous les
  // rayons par défaut sélectionnés (pas seulement le premier), pour
  // que la correspondance fonctionne quel que soit le rayon visé.
  /** @type {string[]} */
  const knownZones = isQualimetreTarget ? [] : [...new Set(
    _importDefaultRayons.flatMap(rayon => getZonesForRayon(rayon))
  )];

  normalizedRows.forEach((row, index) => {
    if (!row.zone && !row.q) return;

    /** @type {string} */
    const rawZone = (row.zone || '').trim();
    /** @type {string | undefined} */
    const matchingKnownZone = knownZones.find(z => z.toLowerCase() === rawZone.toLowerCase());
    /** @type {string} */
    const resolvedZone = matchingKnownZone || rawZone;

    /** @type {GrilleCriticite} */
    const normalizedCrit  = _normalizeCrit(row.crit) || _importDefaultCrit;
    /** @type {number} */
    const poids           = parseInt(row.poids) || IMPORT_DEFAULT_POIDS[normalizedCrit];

    /** @type {boolean} */
    const isValid = !!row.q.trim();

    /** @type {ImportParsedRow} */
    const parsedRow = {
      zoneRaw:      row.zone,
      targetRayons: isQualimetreTarget ? [] : [..._importDefaultRayons],
      targetStores: [],
      targetEnseigne: isQualimetreTarget ? '' : _importDefaultEnseigne,
      zone:         isQualimetreTarget ? '' : resolvedZone,
      selected:     false,
      cat:          row.cat || 'Général',
      q:            row.q.trim(),
      prec:         row.methode || '',
      crit:         normalizedCrit,
      p:            poids,
      valid:        isValid,
      extra:        row.extra || '',
    };

    _importRows.push(parsedRow);
    previewRows.push(parsedRow);
  });

  el('imp-preview').style.display    = '';
  el('imp-preview-title').textContent = `Aperçu — ${readMessage}`;

  /** @type {DuplicateMap} */
  const duplicates = findDuplicateRows(normalizedRows);

  el('imp-mapping-block').innerHTML = detection ? _buildMappingBlock(detection) : '';
  el('imp-preview-tb').innerHTML    = previewRows.map((row, i) => _buildPreviewRow(row, i, duplicates.has(i))).join('');

  // ⚠️ CHANGÉ : plus aucun rayon "non reconnu" à signaler (voir
  // ci-dessus) — la seule cause d'ignorance possible est désormais un
  // intitulé vide, déjà visible directement dans le tableau (icône ✕
  // rouge), donc le bandeau d'avertissements séparé n'a plus lieu
  // d'être pour ce motif.
  el('imp-warnings').innerHTML = '';

  // Nouvelle ouverture d'aperçu : aucune ligne sélectionnée par
  // défaut (voir _onPreviewRowSelectChanged, applyBulkRayonZoneAssignment).
  if (el('imp-bulk-rayon-cbs')) {
    el('imp-bulk-rayon-cbs').innerHTML = getKnownRayons().map(rayon =>
      `<label class="cb-item" style="font-size:11px"><input type="checkbox" class="imp-bulk-rayon-cb" value="${_escapeHtmlAttr(rayon)}"> ${rayon}</label>`
    ).join('');
  }
  sv('imp-bulk-zone', '');
  if (el('imp-bulk-clear-rayons')) el('imp-bulk-clear-rayons').checked = false;
  _updateBulkAssignBar();

  _refreshImportPreviewCounters();
}

/**
 * Libellés humains des concepts métier, affichés dans le bloc de
 * mapping de la modale d'aperçu.
 * @type {Record<ImportConcept, string>}
 */
const IMPORT_CONCEPT_LABELS = {
  zone:        'Zone / Rayon',
  point:       'Point de contrôle',
  methode:     'Méthode de vérification',
  criticite:   'Criticité',
  commentaire: 'Commentaire',
  categorie:   'Catégorie',
  poids:       'Poids',
};

/**
 * Construit le bloc HTML affichant, pour chaque concept métier, la
 * colonne détectée (ou aucune), avec un menu déroulant permettant
 * de corriger manuellement l'association — voir
 * _onMappingConceptChanged pour le rejeu de la normalisation. Les
 * en-têtes non assignés à un concept sont listés en rappel
 * informatif (ils restent dans le champ `extra` de chaque ligne).
 * @param {DetectionResult} detection
 * @returns {string}
 */
function _buildMappingBlock(detection) {
  /** @type {string[]} */
  const allHeaders = _importRawRows.length ? Object.keys(_importRawRows[0]) : [];

  /** @type {string} */
  const rows = Object.keys(IMPORT_CONCEPT_LABELS).map(concept => {
    /** @type {string | null} */
    const assignedHeader = detection.mapping[concept];
    /** @type {string} */
    const options = ['<option value="">— aucune —</option>']
      .concat(allHeaders.map(h => `<option value="${_escapeHtmlAttr(h)}" ${h === assignedHeader ? 'selected' : ''}>${_escapeHtml(h)}</option>`))
      .join('');

    return `<div style="display:flex;align-items:center;gap:8px;padding:4px 0">
      <span style="flex:0 0 160px;font-size:12px;color:var(--text2)">${IMPORT_CONCEPT_LABELS[concept]}</span>
      <select class="form-control" style="flex:1;font-size:12px;padding:4px 8px" onchange="_onMappingConceptChanged('${concept}', this.value)">${options}</select>
    </div>`;
  }).join('');

  /** @type {string} */
  const unmappedNotice = detection.unmappedHeaders.length
    ? `<div style="margin-top:8px;font-size:11px;color:var(--text3)">Colonnes non utilisées (conservées dans le détail de chaque ligne) : ${detection.unmappedHeaders.map(_escapeHtml).join(', ')}</div>`
    : '';

  return `<div style="background:var(--bg);border-radius:var(--radius);padding:12px 14px;margin-bottom:12px">
    <div style="font-size:12px;font-weight:600;margin-bottom:6px;color:var(--text)">
      <i class="ti ti-adjustments-horizontal"></i> Colonnes détectées <span style="color:var(--text3);font-weight:400">— corrigez si besoin</span>
    </div>
    ${rows}
    ${unmappedNotice}
  </div>`;
}

/**
 * Appelée depuis le menu déroulant du bloc de mapping lorsque
 * l'utilisateur corrige manuellement l'association d'un concept à
 * une colonne. Met à jour `_importDetection.mapping`, recalcule les
 * en-têtes non mappés, puis rejoue normalizeRows SANS re-lire ni
 * re-scanner le fichier (voir import-normalize.js : la
 * normalisation est volontairement rejouable à partir d'un mapping
 * quelconque).
 * @param {ImportConcept} concept
 * @param {string} newHeader - En-tête sélectionné, ou chaîne vide pour 'aucune'.
 * @returns {void}
 */
function _onMappingConceptChanged(concept, newHeader) {
  if (!_importDetection) return;

  _importDetection.mapping[concept] = newHeader || null;

  /** @type {string[]} */
  const allHeaders = _importRawRows.length ? Object.keys(_importRawRows[0]) : [];
  /** @type {Set<string>} */
  const assignedHeaders = new Set(Object.values(_importDetection.mapping).filter(Boolean));
  _importDetection.unmappedHeaders = allHeaders.filter(h => !assignedHeaders.has(h));

  /** @type {NormalizedImportRow[]} */
  const normalized = normalizeRows(_importRawRows, _importDetection.mapping, _importDetection.unmappedHeaders);
  _showImportPreview(normalized, _importDetection, _importRawRows, el('imp-preview-title').textContent.replace('Aperçu — ', ''));
}

/**
 * Appelée depuis le sélecteur de criticité par défaut de la modale
 * d'import lorsque l'utilisateur change la valeur de repli appliquée
 * aux lignes sans criticité déterminable depuis le document. Met à
 * jour l'état puis, si un fichier est déjà chargé, rejoue
 * normalizeRows + _showImportPreview SANS re-scanner le fichier
 * (même logique que _onMappingConceptChanged) : seule la criticité
 * de repli change, jamais le mapping ni les données brutes.
 * @param {GrilleCriticite} newDefaultCrit
 * @returns {void}
 */
function _onDefaultCritChanged(newDefaultCrit) {
  _importDefaultCrit = newDefaultCrit;
  if (!_importDetection || !_importRawRows.length) return;

  /** @type {NormalizedImportRow[]} */
  const normalized = normalizeRows(_importRawRows, _importDetection.mapping, _importDetection.unmappedHeaders);
  _showImportPreview(normalized, _importDetection, _importRawRows, el('imp-preview-title').textContent.replace('Aperçu — ', ''));
}

/**
 * Échappe une chaîne pour insertion sûre dans du texte HTML.
 * @param {string} text
 * @returns {string}
 */
function _escapeHtml(text) {
  return String(text).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

/**
 * Échappe une chaîne pour insertion sûre dans un attribut HTML
 * (en plus de _escapeHtml, échappe les guillemets doubles).
 * @param {string} text
 * @returns {string}
 */
function _escapeHtmlAttr(text) {
  return _escapeHtml(text).replace(/"/g, '&quot;');
}

/**
 * Construit la ligne `<tr>` HTML d'aperçu d'une ligne importée.
 *
 * ⚠️ CHANGÉ : chaque cellule métier (rayon, catégorie, intitulé,
 * criticité, poids) est désormais un champ éditable directement dans
 * l'aperçu, AVANT confirmation de l'import — l'utilisateur peut
 * corriger n'importe quelle valeur détectée à tort (ex : rayon mal
 * détecté, intitulé tronqué) sans avoir à corriger son fichier
 * source et le réimporter. Toute modification passe par
 * _onPreviewFieldChanged, qui met à jour _importRows[index] puis ne
 * re-rend QUE cette ligne (pas tout l'aperçu) pour ne jamais faire
 * perdre le focus du champ en cours d'édition. Une ligne peut aussi
 * être retirée individuellement de l'aperçu (_removePreviewRow) sans
 * toucher au fichier source.
 * @param {ImportParsedRow} row
 * @param {number} index - Index de cette ligne dans _importRows (clé de mise à jour, voir _onPreviewFieldChanged).
 * @param {boolean} isDuplicate - Vrai si cette ligne est un quasi-doublon d'une ligne précédente (voir findDuplicateRows, import-normalize.js) — signalement uniquement, n'affecte jamais `valid`.
 * @returns {string}
 */
/**
 * Construit la ligne `<tr>` HTML d'aperçu d'une ligne importée.
 *
 * ⚠️ CHANGÉ : ajout d'une case à cocher de sélection (colonne de
 * gauche) et de deux champs supplémentaires pour la cible 'grille' —
 * Rayon(s) cible(s) (row.targetRayons, plusieurs valeurs séparées par
 * virgule dans un même champ texte) et Zone (row.zone, sous-partie du
 * rayon — voir le typedef GrillePoint, config.js). La sélection ne
 * détermine PAS quelles lignes sont importées (c'est `valid` et
 * `targetRayons.length` qui décident, voir confirmImport) — elle sert
 * uniquement à choisir les lignes affectées par une assignation
 * groupée (voir applyBulkRayonZoneAssignment, déclenchée depuis la
 * barre d'action au-dessus du tableau).
 * @param {ImportParsedRow} row
 * @param {number} index - Index de cette ligne dans _importRows (clé de mise à jour, voir _onPreviewFieldChanged).
 * @param {boolean} isDuplicate - Vrai si cette ligne est un quasi-doublon d'une ligne précédente (voir findDuplicateRows, import-normalize.js) — signalement uniquement, n'affecte jamais `valid`.
 * @returns {string}
 */
function _buildPreviewRow(row, index, isDuplicate) {
  /** @type {string} */
  const rowBg = row.valid ? (isDuplicate ? '#fffaf0' : '') : '#fff8f8';
  /** @type {string} */
  const fieldStyle = 'width:100%;border:1px solid transparent;background:transparent;font-size:12px;padding:3px 5px;border-radius:4px;font-family:inherit;color:inherit';
  /** @type {string} */
  const focusHint = 'onfocus="this.style.borderColor=\'var(--primary-mid)\';this.style.background=\'#fff\'" onblur="this.style.borderColor=\'transparent\';this.style.background=\'transparent\'"';

  /** @type {string} */
  const duplicateBadge = isDuplicate
    ? ' <span title="Doublon possible avec une autre ligne du fichier" style="color:var(--orange);font-size:10px;border:1px solid var(--orange);border-radius:8px;padding:1px 6px;white-space:nowrap">doublon ?</span>'
    : '';
  /** @type {string} */
  const extraTitle = row.extra ? ` title="${_escapeHtmlAttr(row.extra)}"` : '';
  /** @type {string} */
  const extraIcon = row.extra ? ` <i class="ti ti-info-circle"${extraTitle} style="color:var(--text3);font-size:12px"></i>` : '';

  /** @type {boolean} */
  const isQualimetreTarget = _importTarget === 'qualimetre';

  // NOTE : en pratique, cette modale (#m-import) n'est aujourd'hui
  // ouverte qu'avec la cible 'grille' (FSQS) — openImportModal() est
  // toujours appelée sans argument dans Qualistore.html. L'import
  // Qualimètre utilise sa propre modale et son propre aperçu,
  // entièrement séparés (#m-gq-import, _gqRenderImportPreview, voir
  // grille-qualimetre.js). Les colonnes Rayon(s)/Zone ci-dessous sont
  // donc vides pour cette cible — conservées pour ne pas casser ce
  // fichier si openImportModal('qualimetre') est un jour réactivé.
  /** @type {string} */
  const rayonsField = isQualimetreTarget ? '' : `<input type="text" value="${_escapeHtmlAttr(row.targetRayons.join(', '))}"
    style="${fieldStyle}${row.targetRayons.length ? '' : ';color:var(--danger)'}" ${focusHint}
    oninput="_onPreviewFieldChanged(${index},'targetRayons',this.value)" placeholder="Rayon(s), séparés par virgule...">`;
  /** @type {string} */
  const zoneField = isQualimetreTarget ? '' : `<input type="text" value="${_escapeHtmlAttr(row.zone)}" list="ctrl-zone-suggestions"
    style="${fieldStyle}" ${focusHint}
    oninput="_onPreviewFieldChanged(${index},'zone',this.value)" placeholder="Zone (optionnel)...">`;

  /** @type {string} */
  const critOptions = IMPORT_VALID_CRITS.map(c =>
    `<option value="${c}" ${c === row.crit ? 'selected' : ''}>${c}</option>`
  ).join('');

  return `<tr style="background:${rowBg}">
    <td style="padding:2px 6px;border-bottom:1px solid var(--border);text-align:center">
      <input type="checkbox" class="imp-row-select" ${row.selected ? 'checked' : ''} onchange="_onPreviewRowSelectChanged(${index},this.checked)" aria-label="Sélectionner cette ligne">
    </td>
    <td style="padding:2px 6px;border-bottom:1px solid var(--border);min-width:140px">${rayonsField}</td>
    <td style="padding:2px 6px;border-bottom:1px solid var(--border);min-width:120px">${zoneField}</td>
    <td style="padding:2px 6px;border-bottom:1px solid var(--border);max-width:220px">
      <input type="text" value="${_escapeHtmlAttr(row.q)}" style="${fieldStyle}${row.q.trim() ? '' : ';color:var(--danger)'}" ${focusHint}
        oninput="_onPreviewFieldChanged(${index},'q',this.value)" placeholder="Intitulé requis...">${duplicateBadge}${extraIcon}
    </td>
    <td style="padding:2px 6px;border-bottom:1px solid var(--border);max-width:180px">
      <input type="text" value="${_escapeHtmlAttr(row.prec)}" style="${fieldStyle}" ${focusHint}
        oninput="_onPreviewFieldChanged(${index},'prec',this.value)" placeholder="Méthode de contrôle...">
    </td>
    <td style="padding:2px 6px;border-bottom:1px solid var(--border)">
      <select style="${fieldStyle}" ${focusHint} onchange="_onPreviewFieldChanged(${index},'crit',this.value)">${critOptions}</select>
    </td>
    <td style="padding:2px 6px;border-bottom:1px solid var(--border)">
      <input type="number" min="0" value="${row.p}" style="${fieldStyle};width:56px" ${focusHint}
        oninput="_onPreviewFieldChanged(${index},'p',this.value)">
    </td>
    <td style="padding:2px 6px;border-bottom:1px solid var(--border);text-align:center">
      <button class="btn btn-secondary btn-sm" style="padding:2px 6px" onclick="_removePreviewRow(${index})" aria-label="Retirer cette ligne de l'import" title="Retirer cette ligne">
        <i class="ti ti-x" style="color:var(--danger)"></i>
      </button>
    </td>
  </tr>`;
}

/**
 * Met à jour un champ d'une ligne d'aperçu suite à une édition
 * manuelle (voir _buildPreviewRow), recalcule sa validité, puis
 * ne re-rend QUE cette ligne (jamais tout le tableau, pour ne pas
 * faire perdre le focus du champ en cours de saisie). Met aussi à
 * jour les compteurs globaux (imp-stats, imp-confirm-btn) puisqu'une
 * édition peut faire basculer une ligne entre valide et invalide.
 * @param {number} index - Index dans _importRows.
 * @param {'targetRayons'|'zone'|'q'|'prec'|'crit'|'p'} field
 * @param {string} value - Valeur brute du champ HTML (toujours une chaîne, même pour un `<input type="number">`). Pour 'targetRayons', plusieurs rayons séparés par virgule.
 * @returns {void}
 */
function _onPreviewFieldChanged(index, field, value) {
  /** @type {ImportParsedRow | undefined} */
  const row = _importRows[index];
  if (!row) return;

  if (field === 'p') {
    row.p = parseInt(value) || 0;
  } else if (field === 'targetRayons') {
    row.targetRayons = value.split(',').map(r => r.trim()).filter(Boolean);
  } else {
    row[field] = value;
  }

  row.valid = _importTarget === 'qualimetre'
    ? !!row.q.trim()
    : !!row.q.trim();

  _refreshImportPreviewCounters();
  // Ne re-rend que la ligne courante : un re-render complet du
  // tableau perdrait le focus/curseur du champ en cours d'édition.
  /** @type {HTMLTableRowElement | undefined} */
  const rowEl = el('imp-preview-tb').children[index];
  if (rowEl) {
    /** @type {DuplicateMap} */
    const duplicates = _getDuplicatesForCurrentImport();
    rowEl.outerHTML = _buildPreviewRow(row, index, duplicates.has(index));
  }
}

/**
 * Coche/décoche la sélection d'une ligne d'aperçu (voir
 * applyBulkRayonZoneAssignment — la sélection n'affecte jamais
 * l'import lui-même, seulement quelles lignes une assignation groupée
 * cible). Met aussi à jour le compteur "X sélectionnée(s)" affiché
 * dans la barre d'action groupée.
 * @param {number} index - Index dans _importRows.
 * @param {boolean} isSelected
 * @returns {void}
 */
function _onPreviewRowSelectChanged(index, isSelected) {
  /** @type {ImportParsedRow | undefined} */
  const row = _importRows[index];
  if (!row) return;
  row.selected = isSelected;
  _updateBulkAssignBar();
}

/**
 * Sélectionne ou désélectionne toutes les lignes d'un coup (case
 * "tout sélectionner" en en-tête de tableau), puis ré-affiche
 * uniquement les cases à cocher (pas tout le tableau — évite de
 * perdre le focus d'un champ en cours d'édition ailleurs sur la
 * page).
 * @param {boolean} isSelected
 * @returns {void}
 */
function toggleSelectAllPreviewRows(isSelected) {
  _importRows.forEach(row => { row.selected = isSelected; });
  document.querySelectorAll('.imp-row-select').forEach(cb => { cb.checked = isSelected; });
  _updateBulkAssignBar();
}

/**
 * Affiche/masque la barre d'action groupée (#imp-bulk-bar) et met à
 * jour son compteur, selon le nombre de lignes actuellement
 * sélectionnées dans l'aperçu.
 * @returns {void}
 */
function _updateBulkAssignBar() {
  /** @type {number} */
  const selectedCount = _importRows.filter(r => r.selected).length;
  /** @type {HTMLElement | null} */
  const bar = el('imp-bulk-bar');
  if (!bar) return;
  bar.style.display = selectedCount > 0 ? '' : 'none';
  if (el('imp-bulk-count')) el('imp-bulk-count').textContent = `${selectedCount} ligne(s) sélectionnée(s)`;
}

/**
 * Applique une assignation groupée de rayon(s) et/ou de zone à
 * toutes les lignes actuellement sélectionnées (voir
 * _onPreviewRowSelectChanged) — déclenchée par le bouton "Assigner"
 * de la barre d'action groupée (#imp-bulk-bar).
 *
 * Comportement : pour le rayon, REMPLACE toujours targetRayons des
 * lignes sélectionnées par la sélection courante de la barre (pas
 * d'ajout incrémental — répéter l'action avec une sélection
 * différente écrase la précédente, pour rester prévisible). Si aucun
 * rayon n'est coché dans la barre, targetRayons n'est pas modifié
 * (seule la zone est appliquée, si renseignée) ; choisir explicitement
 * "Effacer les rayons" pour vider targetRayons sans en assigner de
 * nouveaux.
 * Pour la zone, un champ texte vide signifie "ne pas modifier la
 * zone" (pour vider explicitement la zone vers "Non classé",
 * utiliser l'édition individuelle du champ, pas l'action groupée).
 * @returns {void}
 */
function applyBulkRayonZoneAssignment() {
  /** @type {string[]} */
  const checkedRayons = [...document.querySelectorAll('.imp-bulk-rayon-cb:checked')].map(cb => cb.value);
  /** @type {string} */
  const bulkZone = el('imp-bulk-zone') ? v('imp-bulk-zone').trim() : '';
  /** @type {boolean} */
  const clearRayons = el('imp-bulk-clear-rayons') ? el('imp-bulk-clear-rayons').checked : false;

  if (!checkedRayons.length && !bulkZone && !clearRayons) {
    showToast('Sélectionnez au moins un rayon, une zone, ou "Effacer les rayons".', 'warning');
    return;
  }

  /** @type {number} */
  let affectedCount = 0;
  _importRows.forEach(row => {
    if (!row.selected) return;
    affectedCount++;
    if (clearRayons) row.targetRayons = [];
    else if (checkedRayons.length) row.targetRayons = [...checkedRayons];
    if (bulkZone) row.zone = bulkZone;
  });

  _rerenderImportPreviewRows();
  showToast(`${affectedCount} ligne(s) mise(s) à jour.`, 'success');
}

/**
 * Retire une ligne de l'aperçu d'import (elle ne sera jamais
 * importée, sans toucher au fichier source ni nécessiter de le
 * réimporter). Action immédiate, sans confirmation : la ligne n'a
 * pas encore été persistée, le risque est négligeable et une
 * confirmation systématique nuirait au flux d'édition rapide de
 * plusieurs lignes.
 * @param {number} index - Index dans _importRows.
 * @returns {void}
 */
function _removePreviewRow(index) {
  _importRows.splice(index, 1);
  _rerenderImportPreviewRows();
}

/**
 * Calcule les quasi-doublons (findDuplicateRows, import-normalize.js)
 * pour l'état d'import courant, en protégeant contre le cas où
 * _importDetection est null (aucun fichier exploitable détecté —
 * voir _showImportPreview) : dans ce cas il n'y a, par construction,
 * aucune ligne dans _importRows, donc aucun doublon possible.
 * Factorisé ici car requis à la fois par _onPreviewFieldChanged
 * (re-rendu d'une seule ligne) et _rerenderImportPreviewRows
 * (re-rendu complet après suppression de ligne).
 * @returns {DuplicateMap}
 */
function _getDuplicatesForCurrentImport() {
  if (!_importRawRows.length || !_importDetection) return new Map();
  return findDuplicateRows(normalizeRows(_importRawRows, _importDetection.mapping, _importDetection.unmappedHeaders));
}

/**
 * Reconstruit entièrement le corps du tableau d'aperçu depuis l'état
 * courant de _importRows (après suppression d'une ligne, les index
 * de toutes les lignes suivantes changent — un patch ligne par ligne
 * comme dans _onPreviewFieldChanged ne suffirait pas).
 * @returns {void}
 */
function _rerenderImportPreviewRows() {
  /** @type {DuplicateMap} */
  const duplicates = _getDuplicatesForCurrentImport();
  el('imp-preview-tb').innerHTML = _importRows.map((row, i) => _buildPreviewRow(row, i, duplicates.has(i))).join('');
  _refreshImportPreviewCounters();
}

/**
 * Recalcule et affiche les compteurs globaux de l'aperçu (lignes
 * valides/invalides, état du bouton de confirmation) depuis l'état
 * courant de _importRows — appelé après toute édition ou suppression
 * de ligne, sans reconstruire le tableau HTML.
 * @returns {void}
 */
/**
 * Recalcule et affiche les compteurs globaux de l'aperçu (lignes
 * valides/invalides, état du bouton de confirmation) depuis l'état
 * courant de _importRows — appelé après toute édition ou suppression
 * de ligne, sans reconstruire le tableau HTML.
 *
 * ⚠️ CHANGÉ : pour la cible 'grille', une ligne à l'intitulé non vide
 * mais sans aucun rayon cible (row.targetRayons vide — voir
 * applyBulkRayonZoneAssignment, "Effacer les rayons") est exclue de
 * l'import au même titre qu'un intitulé vide, mais comptée et
 * affichée séparément pour que la cause reste claire.
 * @returns {void}
 */
function _refreshImportPreviewCounters() {
  /** @type {boolean} */
  const isGrilleTarget = _importTarget !== 'qualimetre';

  /** @type {number} */
  const noTitleCount = _importRows.filter(r => !r.valid).length;
  /** @type {number} */
  const noRayonCount = isGrilleTarget ? _importRows.filter(r => r.valid && r.targetRayons.length === 0).length : 0;
  /** @type {number} */
  const noDestCount = isGrilleTarget
    ? _importRows.filter(r => r.valid && r.targetRayons.length > 0 && !r.targetEnseigne && r.targetStores.length === 0).length
    : 0;
  /** @type {number} */
  const importableCount = _importRows.filter(r =>
    r.valid && (!isGrilleTarget || (r.targetRayons.length > 0 && (r.targetEnseigne || r.targetStores.length > 0)))
  ).length;

  /** @type {string} */
  let statsText = `${importableCount} à importer`;
  if (noTitleCount) statsText += ` · ${noTitleCount} sans intitulé (ignorée${noTitleCount > 1 ? 's' : ''})`;
  if (noRayonCount) statsText += ` · ${noRayonCount} sans rayon cible (ignorée${noRayonCount > 1 ? 's' : ''})`;
  if (noDestCount) statsText += ` · ${noDestCount} sans enseigne ni magasin (ignorée${noDestCount > 1 ? 's' : ''})`;

  el('imp-stats').textContent = statsText;
  el('imp-confirm-btn').disabled      = importableCount === 0;
  el('imp-confirm-btn').style.opacity = importableCount > 0 ? '1' : '.5';
  el('imp-count-btn').textContent     = importableCount > 0 ? `(${importableCount})` : '';
}

// ─────────────────────────────────────────────
// 9. CONFIRMATION ET IMPORT
// ─────────────────────────────────────────────

/**
 * Confirme l'import : délègue vers la grille Qualimètre ou la
 * grille FSQS selon `_importTarget`, en ne conservant que les
 * lignes valides.
 * @returns {void}
 */
/**
 * Confirme l'import : filtre les lignes valides (et, pour la cible
 * 'grille', celles ayant au moins un rayon cible — voir le typedef
 * ImportParsedRow, targetRayons), puis délègue au moteur d'import
 * correspondant.
 * @returns {void}
 */
function confirmImport() {
  /** @type {boolean} */
  const isGrilleTarget = _importTarget !== 'qualimetre';
  /** @type {ImportParsedRow[]} */
  const validRows = _importRows.filter(r =>
    r.valid && (!isGrilleTarget || (r.targetRayons.length > 0 && (r.targetEnseigne || r.targetStores.length > 0)))
  );

  if (_importTarget === 'qualimetre') {
    _importIntoQualimetre(validRows);
  } else {
    _importIntoGrille(validRows);
  }
}

/**
 * Normalise un libellé de zone pour comparaison de déduplication.
 * Normalisation strictement typographique (trim, espaces multiples
 * réduits à un seul, casse uniforme) — jamais de correspondance
 * approximative ou sémantique.
 * @param {string} label
 * @returns {string}
 */
function _normalizeZoneLabel(label) {
  return label.trim().replace(/\s+/g, ' ').toLowerCase();
}

/**
 * Construit un identifiant déterministe à partir d'un libellé de
 * zone (slug : minuscules, accents conservés tels quels retirés,
 * caractères non alphanumériques remplacés par '-'). Utilisé
 * uniquement pour générer un nouvel id de zone à partir des données
 * du document — jamais pour deviner ou faire correspondre une zone
 * à un référentiel existant.
 * @param {string} label
 * @returns {string} Slug non vide (retombe sur 'zone' si le libellé ne contient aucun caractère alphanumérique).
 */
function _slugifyZoneLabel(label) {
  /** @type {string} */
  const slug = label
    .normalize('NFD').replace(/[\u0300-\u036f]/g, '') // retire les accents
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
  return slug || 'zone';
}

/**
 * Recherche une zone existante (QM_ZONES, qualimetreGlobal,
 * qualimetreCustom[storeId]) dont le libellé normalisé correspond
 * EXACTEMENT au libellé recherché. Cette recherche sert uniquement
 * à éviter de dupliquer une zone déjà connue sous un autre id —
 * elle n'applique aucun mapping métier et ne devine jamais une
 * correspondance approximative.
 * @param {string} normalizedLabel - Libellé déjà normalisé via _normalizeZoneLabel.
 * @param {string} storeId - Référence vers Magasin.id (peut être vide si portée globale).
 * @returns {string | null} L'id de la zone existante, ou null si aucune correspondance exacte.
 */
function _findExistingZoneIdByLabel(normalizedLabel, storeId) {
  /** @type {QMZone | undefined} */
  const fromStaticZones = QM_ZONES.find(z => _normalizeZoneLabel(z.label) === normalizedLabel);
  if (fromStaticZones) return fromStaticZones.id;

  if (DB.qualimetreGlobal) {
    /** @type {string | undefined} */
    const fromGlobalIds = Object.keys(DB.qualimetreGlobal).find(zoneId => _normalizeZoneLabel(zoneId) === normalizedLabel);
    if (fromGlobalIds) return fromGlobalIds;
  }

  if (storeId && DB.qualimetreCustom?.[storeId]) {
    /** @type {string | undefined} */
    const fromCustomIds = Object.keys(DB.qualimetreCustom[storeId]).find(zoneId => _normalizeZoneLabel(zoneId) === normalizedLabel);
    if (fromCustomIds) return fromCustomIds;
  }

  return null;
}

/**
 * Vérifie si un id de zone est déjà utilisé (QM_ZONES,
 * qualimetreGlobal, qualimetreCustom[storeId], ou les zones déjà
 * résolues plus tôt dans l'import en cours — voir sessionZoneIds).
 * @param {string} zoneId
 * @param {string} storeId
 * @param {Map<string, string> | null} [sessionZoneIds] - Zones déjà créées/résolues plus tôt dans l'import en cours (clé = libellé normalisé, valeur = id), voir _resolveOrCreateZoneFromDocument.
 * @returns {boolean}
 */
function _isZoneIdTaken(zoneId, storeId, sessionZoneIds) {
  if (QM_ZONES.some(z => z.id === zoneId)) return true;
  if (DB.qualimetreGlobal && Object.prototype.hasOwnProperty.call(DB.qualimetreGlobal, zoneId)) return true;
  if (storeId && DB.qualimetreCustom?.[storeId] && Object.prototype.hasOwnProperty.call(DB.qualimetreCustom[storeId], zoneId)) return true;
  if (sessionZoneIds && [...sessionZoneIds.values()].includes(zoneId)) return true;
  return false;
}

/**
 * Résout la zone Qualimètre cible pour une valeur de zone brute
 * lue dans le document importé, sans dépendre d'aucune liste fixe
 * ni d'aucun mapping codé en dur :
 * 1. Si la valeur brute est vide, la ligne est rattachée à la zone
 *    "Non classé" (jamais devinée, jamais rattachée à une autre
 *    zone du fichier).
 * 2. Si une zone existante (QM_ZONES, qualimetreGlobal,
 *    qualimetreCustom[storeId], OU une zone déjà résolue plus tôt
 *    dans CET import — voir sessionZoneIds) porte exactement ce
 *    libellé (normalisé), elle est réutilisée — ceci évite
 *    uniquement les doublons, ce n'est pas un mapping métier.
 * 3. Sinon, un nouvel id est généré depuis le libellé du document
 *    (slug déterministe). En cas de collision d'id déjà utilisé,
 *    un suffixe numérique déterministe est ajouté.
 *
 * ⚠️ sessionZoneIds (clé = libellé normalisé via _normalizeZoneLabel,
 * valeur = id résolu) DOIT être fourni et réutilisé (même objet Map)
 * par l'appelant à travers tout un même import, et mis à jour après
 * chaque appel avec le résultat retourné — sinon deux lignes
 * consécutives portant le MÊME libellé de zone, encore absent de la
 * base au moment du premier appel, seraient chacune traitées comme
 * "nouvelle zone" et recevraient des ids différents
 * (zone-1, zone-2, zone-3...) au lieu d'être regroupées sous un seul
 * id — la persistance en base ne se produit qu'à la fin de la
 * boucle d'import (save()), donc consulter uniquement QM_ZONES/
 * qualimetreGlobal/qualimetreCustom ne suffit pas à détecter les
 * zones que l'import est en train de créer lui-même.
 * @param {string} rawZoneLabel - Valeur brute de la colonne zone, telle qu'écrite dans le document (ImportParsedRow.rayonRaw).
 * @param {string} storeId - Référence vers Magasin.id ; chaîne vide pour la grille globale.
 * @param {Map<string, string> | null} [sessionZoneIds] - Zones déjà résolues plus tôt dans le même import (voir avertissement ci-dessus). Optionnel pour compatibilité ; en son absence, le comportement retombe sur l'ancienne logique (déduplication uniquement contre l'état déjà persisté).
 * @returns {ResolvedZone}
 */
function _resolveOrCreateZoneFromDocument(rawZoneLabel, storeId, sessionZoneIds) {
  /** @type {string} */
  const trimmed = (rawZoneLabel || '').trim().replace(/\s+/g, ' ');

  if (!trimmed) {
    /** @type {string} */
    const normalizedUnclassified = _normalizeZoneLabel(IMPORT_UNCLASSIFIED_ZONE_LABEL);

    if (sessionZoneIds && sessionZoneIds.has(normalizedUnclassified)) {
      return { id: sessionZoneIds.get(normalizedUnclassified), reused: true, isUnclassified: true };
    }

    /** @type {string | null} */
    const existingUnclassified = _findExistingZoneIdByLabel(normalizedUnclassified, storeId);
    if (existingUnclassified) {
      if (sessionZoneIds) sessionZoneIds.set(normalizedUnclassified, existingUnclassified);
      return { id: existingUnclassified, reused: true, isUnclassified: true };
    }

    /** @type {string} */
    const unclassifiedId = _slugifyZoneLabel(IMPORT_UNCLASSIFIED_ZONE_LABEL);
    if (sessionZoneIds) sessionZoneIds.set(normalizedUnclassified, unclassifiedId);
    return { id: unclassifiedId, reused: false, isUnclassified: true };
  }

  /** @type {string} */
  const normalizedLabel = _normalizeZoneLabel(trimmed);

  if (sessionZoneIds && sessionZoneIds.has(normalizedLabel)) {
    return { id: sessionZoneIds.get(normalizedLabel), reused: true, isUnclassified: false };
  }

  /** @type {string | null} */
  const existingId = _findExistingZoneIdByLabel(normalizedLabel, storeId);
  if (existingId) {
    if (sessionZoneIds) sessionZoneIds.set(normalizedLabel, existingId);
    return { id: existingId, reused: true, isUnclassified: false };
  }

  /** @type {string} */
  const baseSlug = _slugifyZoneLabel(trimmed);
  /** @type {string} */
  let candidateId = baseSlug;
  /** @type {number} */
  let suffix = 2;
  while (_isZoneIdTaken(candidateId, storeId, sessionZoneIds)) {
    candidateId = `${baseSlug}-${suffix}`;
    suffix++;
  }

  if (sessionZoneIds) sessionZoneIds.set(normalizedLabel, candidateId);
  return { id: candidateId, reused: false, isUnclassified: false };
}

/**
 * Importe les lignes validées dans DB.qualimetreCustom, pour le
 * magasin actuellement sélectionné dans la page Qualimètre. La zone
 * cible de chaque ligne est résolue depuis la valeur brute de zone
 * du document (voir _resolveOrCreateZoneFromDocument) — jamais
 * depuis une liste de rayons FSQS ni un mapping métier figé.
 *
 * ⚠️ CORRIGÉ : une même Map `sessionZoneIds` est créée ici et
 * réutilisée pour TOUTES les lignes de cet import (voir
 * l'avertissement dans la documentation de
 * _resolveOrCreateZoneFromDocument) — sans elle, chaque ligne d'une
 * zone nouvellement créée par ce même import recevait un id
 * différent (la zone n'étant pas encore persistée en base au moment
 * de résoudre la ligne suivante), fragmentant à tort une seule zone
 * du document en autant de zones que de lignes.
 * @param {ImportParsedRow[]} rows
 * @returns {void}
 */
function _importIntoQualimetre(rows) {
  if (!DB.qualimetreCustom) DB.qualimetreCustom = {};

  /** @type {string} */
  const storeId = v('qual-mag-sel');
  if (!storeId) { alert('Sélectionnez d\'abord un magasin dans le Qualimètre.'); return; }

  if (!DB.qualimetreCustom[storeId]) DB.qualimetreCustom[storeId] = {};

  /** @type {number} */
  let unclassifiedCount = 0;
  /** @type {Set<string>} Zones qui existaient déjà avant cet import (réutilisées par correspondance de libellé). */
  const zonesReused = new Set();
  /** @type {Set<string>} Zones nouvellement créées par cet import (peuvent regrouper plusieurs lignes du document). */
  const zonesCreated = new Set();
  /** @type {Map<string, string>} Voir avertissement ci-dessus : clé = libellé normalisé, valeur = id résolu, alimentée et consultée au fil de cette boucle. */
  const sessionZoneIds = new Map();

  rows.forEach(row => {
    /** @type {ResolvedZone} */
    const zone = _resolveOrCreateZoneFromDocument(row.zoneRaw, storeId, sessionZoneIds);

    if (zone.isUnclassified) unclassifiedCount++;

    /** @type {boolean} */
    const alreadyKnownFromThisImport = zonesCreated.has(zone.id) || zonesReused.has(zone.id);
    if (!alreadyKnownFromThisImport) {
      if (zone.reused) zonesReused.add(zone.id); else zonesCreated.add(zone.id);
    }

    if (!DB.qualimetreCustom[storeId][zone.id]) DB.qualimetreCustom[storeId][zone.id] = [];
    /** @type {GrillePoint} */
    DB.qualimetreCustom[storeId][zone.id].push({
      id: 'qcimp-' + uid(), cat: row.cat, q: row.q, p: row.p, c: row.crit,
    });
  });

  save();
  closeModal('m-import');
  showQualimetre();

  /** @type {string} */
  const summary = `${rows.length} point(s) importé(s) — ${zonesCreated.size} zone(s) créée(s), ${zonesReused.size} réutilisée(s)`;
  showToast(summary, 'success');

  if (unclassifiedCount > 0) {
    showToast(`${unclassifiedCount} ligne(s) sans zone identifiable placée(s) dans « ${IMPORT_UNCLASSIFIED_ZONE_LABEL} »`, 'warning');
  }
}

/**
 * Importe les lignes validées dans DB.grilleCustom, indexées par
 * nom de rayon FSQS (usage standard, cohérent avec grille.js). Le
 * rayon de chaque ligne (déjà résolu par _showImportPreview — casse
 * canonique d'un rayon existant si trouvé, sinon valeur du document
 * telle quelle) est créé à la volée dans DB.grilleCustom s'il
 * n'existe pas encore : aucun rayon n'est jamais rejeté, voir
 * l'avertissement en tête de fichier.
 * @param {ImportParsedRow[]} rows
 * @returns {void}
 */
/**
 * Importe les lignes validées dans DB.grilleCustom. ⚠️ CHANGÉ : une
 * ligne peut désormais cibler plusieurs rayons à la fois
 * (row.targetRayons, voir le typedef ImportParsedRow et
 * applyBulkRayonZoneAssignment) — un point distinct (nouvel id) est
 * créé dans CHAQUE rayon ciblé, jamais de référence partagée entre
 * rayons (même principe que saveCtrl pour la création manuelle multi-
 * rayon, voir grille.js). Le rayon de chaque point créé est ainsi
 * créé à la volée dans DB.grilleCustom s'il n'existe pas encore.
 * Inclut désormais row.zone (sous-partie du rayon, voir le typedef
 * GrillePoint, config.js).
 * @param {ImportParsedRow[]} rows
 * @returns {void}
 */
/**
 * Importe les lignes validées dans DB.grilleCustom et/ou
 * DB.grilleCustomByStore.
 *
 * ⚠️ CHANGÉ : si row.targetStores est non vide, un point distinct
 * (nouvel id) est créé dans DB.grilleCustomByStore[storeId][rayon]
 * pour CHACUN des magasins ciblés — jamais de référence partagée
 * entre magasins, même principe que targetRayons pour les rayons.
 * Si row.targetStores est vide, le point est créé dans
 * DB.grilleCustom[rayon] (grille commune, partagée par tous les
 * magasins sans surcharge propre — voir getGrille, grille.js).
 * @param {ImportParsedRow[]} rows
 * @returns {void}
 */
/**
 * Importe les lignes validées dans DB.grilleCustom (grille commune
 * par enseigne) et/ou DB.grilleCustomByStore (magasins individuels).
 *
 * ⚠️ CHANGÉ : DB.grilleCustom est désormais indexé par enseigne — une
 * ligne avec targetEnseigne non vide crée un point dans
 * DB.grilleCustom[enseigne][rayon] (la grille commune de cette
 * enseigne, héritée par tous ses magasins sans surcharge propre).
 * Une ligne peut EN PLUS (ou à la place) cibler des magasins
 * individuels via targetStores (DB.grilleCustomByStore), pour les cas
 * particuliers propres à un seul magasin. Si ni targetEnseigne ni
 * targetStores ne sont renseignés pour un rayon donné, rien n'est
 * importé pour ce rayon sur cette ligne (pas de grille commune sans
 * enseigne, par choix délibéré — voir getGrille, grille.js).
 * @param {ImportParsedRow[]} rows
 * @returns {void}
 */
function _importIntoGrille(rows) {
  rows.forEach(row => {
    row.targetRayons.forEach(rayon => {
      /** @type {Omit<GrillePoint, 'id'>} */
      const pointTemplate = { zone: row.zone || '', cat: row.cat, q: row.q, prec: row.prec || '', p: row.p, c: row.crit };

      if (row.targetEnseigne) {
        if (!DB.grilleCustom[row.targetEnseigne]) DB.grilleCustom[row.targetEnseigne] = {};
        if (!DB.grilleCustom[row.targetEnseigne][rayon]) DB.grilleCustom[row.targetEnseigne][rayon] = [];
        DB.grilleCustom[row.targetEnseigne][rayon].push({ id: 'imp-' + uid(), ...pointTemplate });
      }

      row.targetStores.forEach(storeId => {
        if (!DB.grilleCustomByStore) DB.grilleCustomByStore = {};
        if (!DB.grilleCustomByStore[storeId]) DB.grilleCustomByStore[storeId] = {};
        if (!DB.grilleCustomByStore[storeId][rayon]) DB.grilleCustomByStore[storeId][rayon] = [];
        DB.grilleCustomByStore[storeId][rayon].push({ id: 'imp-' + uid(), ...pointTemplate });
      });
    });
  });

  save();
  closeModal('m-import');
  showGrilleCardsView();
}

// ─────────────────────────────────────────────
// 10. UTILITAIRE — Chargement de script dynamique
// ─────────────────────────────────────────────

/**
 * Charge un script externe de manière asynchrone.
 * Évite les doublons : ne recharge pas si déjà présent dans le DOM.
 * @param {string} url
 * @returns {Promise<void>}
 */
function _loadScript(url) {
  return new Promise((resolve, reject) => {
    const script    = document.createElement('script');
    script.src      = url;
    script.onload   = resolve;
    script.onerror  = reject;
    document.head.appendChild(script);
  });
}
