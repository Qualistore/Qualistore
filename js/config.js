// ══════════════════════════════════════════════════════════════
// CONFIG — QualiStore
// Source de vérité unique pour toutes les constantes applicatives.
// Aucune logique métier ici — uniquement des données statiques.
// ══════════════════════════════════════════════════════════════

// ─────────────────────────────────────────────
// 0. TYPEDEFS JSDoc (pour inférence VSCode / TypeScript)
//    ⚠️ Déduits de l'usage et du contenu des données de ce fichier.
// ─────────────────────────────────────────────

/**
 * Identifiant de permission applicative. Liste fermée et canonique
 * (ce fichier est la source de vérité — voir PERMISSION_IDS).
 * Réutilisé dans auth.js / storage.js sous le même nom.
 * @typedef {'aud-r'|'aud-w'|'nc'|'ac'|'mag'|'rap'|'grille'|'usr'} PermissionId
 */

/**
 * Droits d'accès pour un rôle donné, une entrée par PermissionId.
 * 1 = autorisé, 0 = refusé (voir commentaire d'origine sur DEFAULT_PERMISSIONS).
 * @typedef {Record<PermissionId, 0|1>} UserPerms
 */

/**
 * Table des permissions par défaut, indexée par nom de rôle.
 * Rôles observés dans ce fichier : 'admin', 'fsqs', 'directeur',
 * 'direction', 'collaborateur'. D'autres rôles pourraient exister
 * ailleurs dans le projet sans permissions par défaut associées —
 * TODO TYPE : liste de rôles non garantie exhaustive au-delà de ce fichier.
 * @typedef {Object<string, UserPerms>} RoleDefaultPermissions
 */

/**
 * Zone de contrôle du parcours Qualimètre.
 * @typedef {Object} QMZone
 * @property {string} id - Identifiant stable de zone (ex : 'z0', 'z1'...). Numérotation non continue (z3 absent dans QM_ZONES).
 * @property {string} emoji - Émoji représentant visuellement la zone.
 * @property {string} label - Libellé affiché à l'utilisateur.
 */

/**
 * Niveau de criticité d'un point de contrôle de la grille d'audit FSQS.
 * @typedef {'Mineure'|'Majeure'|'Critique'} GrilleCriticite
 */

/**
 * Point de contrôle de la grille d'audit FSQS.
 * @typedef {Object} GrillePoint
 * @property {string} id - Identifiant stable du point (ex : 'imp-...', 'cust-...').
 * @property {string} zone - Sous-partie du rayon (ex : 'Lieu de stockage'), propre à ce rayon précis — devient l'onglet affiché dans la modale d'audit (voir buildAuditQuestions, audits.js). Libre et renommable, jamais partagée entre deux rayons même en cas d'intitulé identique (voir renameGrilleZone, rayons.js). Chaîne vide acceptée (regroupée sous IMPORT_UNCLASSIFIED_ZONE_LABEL à l'affichage, voir getZonesForRayon).
 * @property {string} cat - Sous-groupe à l'intérieur de la zone (ex : 'Equipement', 'Nettoyage'). Affiché comme en-tête de groupe dans la page Grille (voir _buildCategorySection, grille.js), mais ne crée plus d'onglet — c'est zone qui en crée un.
 * @property {string} q - Intitulé de la question / du point de contrôle.
 * @property {string} prec - Précision ou exemple additionnel. Chaîne vide si absent (jamais null/undefined dans ce fichier).
 * @property {number} p - Poids / pondération du point.
 * @property {GrilleCriticite} c - Niveau de criticité du point.
 */

/**
 * Clé de format de fichier supporté pour l'import de grille.
 * @typedef {'csv'|'xlsx'|'pdf'} ImportFormatKey
 */

/**
 * Dictionnaire des textes d'aide HTML affichés dans la modale
 * d'import, indexé par ImportFormatKey. Chaque valeur est une chaîne
 * HTML brute destinée à être injectée via innerHTML côté UI.
 * @typedef {Record<ImportFormatKey, string>} ImportFormatInfoMap
 */

// ─────────────────────────────────────────────
// 1. CONSTANTES APPLICATIVES
// ─────────────────────────────────────────────

/**
 * Clé localStorage pour la persistance locale des données.
 * @type {string}
 */
const STORAGE_KEY = 'fsqs_v2';

/**
 * Chemin vers le logo (utilisé dans les exports PDF).
 * @type {string}
 */
const LOGO_PATH = 'assets/logo.png';

// ─────────────────────────────────────────────
// 2. PERMISSIONS PAR RÔLE
// ─────────────────────────────────────────────

/**
 * Identifiants de toutes les permissions disponibles.
 * Utilisés pour générer les cases à cocher dans le formulaire utilisateur.
 * @type {PermissionId[]}
 */
const PERMISSION_IDS = ['aud-r', 'aud-w', 'nc', 'ac', 'mag', 'rap', 'grille', 'usr'];

/**
 * Permissions par défaut attribuées à chaque rôle.
 * 1 = autorisé, 0 = refusé.
 * @type {RoleDefaultPermissions}
 */
const DEFAULT_PERMISSIONS = {
  admin:         { 'aud-r': 1, 'aud-w': 1, 'nc': 1, 'ac': 1, 'mag': 1, 'rap': 1, 'grille': 1, 'usr': 1 },
  fsqs:          { 'aud-r': 1, 'aud-w': 1, 'nc': 1, 'ac': 1, 'mag': 0, 'rap': 1, 'grille': 1, 'usr': 0 },
  directeur:     { 'aud-r': 1, 'aud-w': 0, 'nc': 0, 'ac': 1, 'mag': 0, 'rap': 1, 'grille': 0, 'usr': 0 },
  direction:     { 'aud-r': 1, 'aud-w': 0, 'nc': 0, 'ac': 0, 'mag': 0, 'rap': 1, 'grille': 0, 'usr': 0 },
  collaborateur: { 'aud-r': 0, 'aud-w': 1, 'nc': 0, 'ac': 0, 'mag': 0, 'rap': 0, 'grille': 0, 'usr': 0 },
};

// Alias conservé pour compatibilité avec les appels existants
/** @type {RoleDefaultPermissions} */
const DPERMS = DEFAULT_PERMISSIONS;
/** @type {PermissionId[]} */
const PIDS   = PERMISSION_IDS;

// ─────────────────────────────────────────────
// 3. ZONES QUALIMÈTRE
// ─────────────────────────────────────────────

/**
 * Zones de contrôle du parcours Qualimètre.
 * Chaque zone possède un identifiant stable (zN), un emoji et un libellé.
 * Exporté aussi sous l'alias QUAL_ZONES pour compatibilité.
 * @type {QMZone[]}
 */
const QM_ZONES = [
  { id: 'z0',  emoji: '🚩', label: 'Référentiel Affichage' },
  { id: 'z1',  emoji: '🟢', label: 'Zone 1 – Abords & Accueil' },
  { id: 'z2',  emoji: '🥖', label: 'Zone 2 – Boulangerie & Pâtisserie' },
  { id: 'z4',  emoji: '🥩', label: 'Zone 4 – Boucherie & Volaille' },
  { id: 'z5',  emoji: '🧀', label: 'Zone 5 – Charcuterie / Traiteur / Fromage' },
  { id: 'z6',  emoji: '🐟', label: 'Zone 6 – Marée' },
  { id: 'z7',  emoji: '🥛', label: 'Zone 7 – Frais LS (Charcuterie, Crémerie, Traiteur)' },
  { id: 'z8',  emoji: '🍝', label: 'Zone 8 – Épicerie / Liquide / Surgelés' },
  { id: 'z9',  emoji: '🧼', label: 'Zone 9 – DPH / Bazar / Textile' },
  { id: 'z10', emoji: '🛒', label: 'Zone 10 – Ligne de caisse & Sécurité' },
];

// Alias pour compatibilité avec qualimetre.js
/** @type {QMZone[]} */
const QUAL_ZONES = QM_ZONES;

// ─────────────────────────────────────────────
// 4. URLS DES LIBRAIRIES EXTERNES (lazy-load)
// ─────────────────────────────────────────────

/** @type {string} URL CDN de la librairie SheetJS (xlsx). */
const CDN_SHEETJS = 'https://cdnjs.cloudflare.com/ajax/libs/xlsx/0.18.5/xlsx.full.min.js';
/** @type {string} URL CDN de la librairie PDF.js. */
const CDN_PDFJS   = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.min.js';
/** @type {string} URL CDN du worker PDF.js. */
const CDN_PDFJS_WORKER = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js';

// Aliases pour compatibilité
/** @type {string} */
const SHEETJS_URL = CDN_SHEETJS;
/** @type {string} */
const PDFJS_URL   = CDN_PDFJS;

// ─────────────────────────────────────────────
// 6. TEXTES D'AIDE À L'IMPORT (ui uniquement)
// ─────────────────────────────────────────────

/**
 * Descriptions affichées dans la modale d'import selon le format choisi.
 * @type {ImportFormatInfoMap}
 */
const IMPORT_FORMAT_INFO = {
  default: `<strong style="color:var(--text);font-size:13px">Déposez un fichier CSV, TSV, Excel (.xlsx/.xls) ou PDF</strong><br>
    Le format est détecté automatiquement. Les colonnes sont reconnues quel que soit leur ordre ou leur intitulé exact (zone, point de contrôle, méthode, criticité, commentaire…).<br>
    Le mapping détecté est affiché et modifiable avant import.`,

  csv: `<strong style="color:var(--text);font-size:13px">Format CSV / TSV</strong><br>
    Les colonnes sont détectées automatiquement quel que soit leur ordre ou leur intitulé exact (zone, point de contrôle, méthode, criticité, commentaire…).<br>
    Séparateur auto-détecté : <code style="background:#fff;padding:1px 5px;border-radius:4px">;</code> ou <code style="background:#fff;padding:1px 5px;border-radius:4px">,</code> ou tabulation<br>
    Le mapping détecté est affiché et modifiable avant import.<br>
    <span style="color:#15803d">Exemple : <code style="background:#fff;padding:1px 5px;border-radius:4px">Boucherie;Température;Temp. chambre froide;Critique;10</code></span>`,

  xlsx: `<strong style="color:var(--text);font-size:13px">Format Excel (.xlsx / .xls)</strong><br>
    La 1ère feuille du classeur est utilisée.<br>
    Les colonnes sont détectées automatiquement par leur en-tête (zone, point de contrôle, méthode, criticité, commentaire…), quel que soit leur ordre.<br>
    <span style="color:#15803d">Le mapping détecté est affiché et modifiable avant import.</span>`,

  pdf: `<strong style="color:var(--text);font-size:13px">Format PDF</strong><br>
    Le texte du PDF est extrait et analysé ligne par ligne, puis les colonnes sont détectées automatiquement comme pour un fichier CSV.<br>
    Les PDFs contenant des tableaux avec des colonnes identifiables (zone, point de contrôle, criticité…) sont mieux reconnus.<br>
    <span style="color:var(--orange)">⚠ Les PDFs scannés (images) ne fonctionnent pas.</span>`,
};

// Alias pour compatibilité
/** @type {ImportFormatInfoMap} */
const FORMAT_INFO = IMPORT_FORMAT_INFO;
