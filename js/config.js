// ══════════════════════════════════════════════════════════════
// CONFIG — HygiPerf
// Source de vérité unique pour toutes les constantes applicatives.
// Aucune logique métier ici — uniquement des données statiques.
//
// ⚠️ CHANGÉ (permissions détaillées) : remplace les 8 permissions
// globales (aud-r, aud-w, nc, ac, mag, rap, grille, usr) par un
// système granulaire d'une quarantaine de droits, organisés en
// groupes (PERMISSION_GROUPS) pour l'affichage dans la modale
// utilisateur (menus dépliables par groupe). PERMISSION_IDS/PIDS et
// DEFAULT_PERMISSIONS/DPERMS restent les alias utilisés par le
// reste du code (users.js, auth.js) — leur FORME change (beaucoup
// plus d'entrées) mais pas leur RÔLE.
//
// Les valeurs par défaut par rôle ci-dessous reproduisent le plus
// fidèlement possible le comportement actuel du code (voir l'audit
// détaillé effectué avant ce changement) : beaucoup d'actions
// étaient jusqu'ici réservées au rôle admin en dur, indépendamment
// des 8 permissions — ce n'est qu'à partir du moment où chaque
// fichier concerné sera mis à jour (travail en cours, par lots) que
// ces nouveaux droits prendront réellement effet à la place des
// vérifications de rôle codées en dur.
// ══════════════════════════════════════════════════════════════

// ─────────────────────────────────────────────
// 0. TYPEDEFS JSDoc
// ─────────────────────────────────────────────

/**
 * Identifiant de permission applicative détaillé. Liste fermée,
 * dérivée de PERMISSION_GROUPS (voir plus bas) — ne pas modifier
 * cette liste sans mettre à jour PERMISSION_GROUPS en conséquence.
 * @typedef {string} PermissionId
 */

/**
 * Droits d'accès pour un rôle donné, une entrée par PermissionId.
 * 1 = autorisé, 0 = refusé.
 * @typedef {Object<PermissionId, 0|1>} UserPerms
 */

/**
 * Un droit individuel affiché dans la modale utilisateur.
 * @typedef {Object} PermissionDef
 * @property {PermissionId} id
 * @property {string} label
 */

/**
 * Un groupe de droits, affiché comme un menu dépliable (ouvert par
 * défaut) dans la modale utilisateur.
 * @typedef {Object} PermissionGroup
 * @property {string} id - Identifiant du groupe (usage interne, ex : accordéon).
 * @property {string} label - Titre affiché du groupe.
 * @property {string} icon - Classe d'icône Tabler.
 * @property {PermissionDef[]} permissions
 */

// ─────────────────────────────────────────────
// 1. CONSTANTES APPLICATIVES
// ─────────────────────────────────────────────

/** @type {string} Clé localStorage pour la persistance locale des données. */
const STORAGE_KEY = 'fsqs_v2';

/** @type {string} Chemin vers le logo (utilisé dans les exports PDF). */
const LOGO_PATH = 'assets/logo.png';

// ─────────────────────────────────────────────
// 2. PERMISSIONS DÉTAILLÉES, PAR GROUPE
// ─────────────────────────────────────────────

/** @type {PermissionGroup[]} */
const PERMISSION_GROUPS = [
  {
    id: 'audits', label: 'Audits FSQS', icon: 'ti-clipboard-check',
    permissions: [
      { id: 'audit_create',       label: 'Créer un audit' },
      { id: 'audit_edit_date',    label: 'Modifier la date d\'un audit' },
      { id: 'draft_view_own',     label: 'Accéder à ses propres brouillons' },
      { id: 'draft_view_others',  label: 'Accéder aux brouillons des autres' },
      { id: 'draft_resume',       label: 'Reprendre un brouillon' },
      { id: 'draft_delete',       label: 'Supprimer un brouillon' },
      { id: 'draft_save',         label: 'Enregistrer comme brouillon (mettre en pause un audit)' },
    ],
  },
  {
    id: 'qual_audits', label: 'Audit Qualité de service', icon: 'ti-rosette',
    permissions: [
      { id: 'qaudit_create',       label: 'Créer un audit Qualité de service' },
      { id: 'qaudit_edit_date',    label: 'Modifier la date d\'un audit Qualité de service' },
      { id: 'qaudit_edit_auditor', label: 'Modifier le champ auditeur' },
      { id: 'qaudit_delete',       label: 'Supprimer un audit Qualité de service' },
    ],
  },
  {
    id: 'nc', label: 'Non-conformités', icon: 'ti-alert-triangle',
    permissions: [
      { id: 'nc_view',          label: 'Voir les non-conformités' },
      { id: 'nc_edit_status',   label: 'Modifier le statut / commentaire' },
      { id: 'nc_edit_deadline', label: 'Modifier l\'échéance' },
      { id: 'nc_delete',        label: 'Supprimer une non-conformité' },
      { id: 'nc_reopen',        label: 'Rouvrir depuis les archives' },
    ],
  },
  {
    id: 'actions', label: 'Actions correctives', icon: 'ti-tool',
    permissions: [
      { id: 'action_view',        label: 'Voir les actions correctives' },
      { id: 'action_edit_status', label: 'Modifier le statut d\'une action' },
      { id: 'action_delete',      label: 'Supprimer une action' },
    ],
  },
  {
    id: 'alertes', label: 'Alertes terrain', icon: 'ti-alert-circle',
    permissions: [
      { id: 'alert_create', label: 'Créer une alerte' },
      { id: 'alert_edit',   label: 'Modifier une alerte' },
      { id: 'alert_close',  label: 'Clôturer une alerte' },
      { id: 'alert_delete', label: 'Supprimer une alerte' },
    ],
  },
  {
    id: 'analyses', label: 'Rapports d\'analyses', icon: 'ti-flask',
    permissions: [
      { id: 'analysis_view',   label: 'Voir les rapports d\'analyses' },
      { id: 'analysis_upload', label: 'Ajouter un rapport d\'analyses' },
      { id: 'analysis_delete', label: 'Supprimer un rapport d\'analyses' },
    ],
  },
  {
    id: 'audits_externes', label: 'Audits externes FSQS', icon: 'ti-certificate',
    permissions: [
      { id: 'extaudit_view',   label: 'Voir les rapports d\'audits externes' },
      { id: 'extaudit_upload', label: 'Ajouter un rapport d\'audit externe' },
      { id: 'extaudit_delete', label: 'Supprimer un rapport d\'audit externe' },
    ],
  },
  {
    id: 'metrologie', label: 'Métrologie', icon: 'ti-scale',
    permissions: [
      { id: 'metro_view',   label: 'Voir les balances et leurs passages' },
      { id: 'metro_manage', label: 'Gérer les balances (créer/modifier) et enregistrer un passage' },
      { id: 'metro_delete', label: 'Supprimer une balance ou un passage' },
    ],
  },
  {
    id: 'magasins', label: 'Magasins & enseignes', icon: 'ti-building-store',
    permissions: [
      { id: 'store_manage', label: 'Gérer les magasins (créer/modifier/supprimer/rayons)' },
      { id: 'brand_manage', label: 'Gérer les enseignes' },
    ],
  },
  {
    id: 'grille', label: 'Grille FSQS', icon: 'ti-list-check',
    permissions: [
      { id: 'grid_view',         label: 'Voir la grille' },
      { id: 'grid_create_rayon', label: 'Créer un rayon' },
      { id: 'grid_edit_rayon',   label: 'Modifier un rayon' },
      { id: 'grid_edit_point',   label: 'Modifier un point de contrôle' },
      { id: 'grid_import',      label: 'Importer une grille' },
      { id: 'grid_delete',      label: 'Supprimer une grille' },
    ],
  },
  {
    id: 'qual_grille', label: 'Grille Qualité de service', icon: 'ti-adjustments',
    permissions: [
      { id: 'qgrid_view',   label: 'Voir la grille Qualité de service' },
      { id: 'qgrid_manage', label: 'Gérer la grille (ajouter/importer/réinitialiser)' },
    ],
  },
  {
    id: 'rapports', label: 'Rapports', icon: 'ti-file-analytics',
    permissions: [
      { id: 'report_fsqs_view',        label: 'Voir le rapport FSQS' },
      { id: 'report_qualimetre_view',  label: 'Voir le rapport Qualité de service' },
      { id: 'report_delete_audits',    label: 'Supprimer des audits depuis un rapport' },
      { id: 'nc_export',               label: 'Exporter les non-conformités' },
      { id: 'report_fsqs_export',      label: 'Exporter le rapport FSQS' },
      { id: 'report_qualimetre_export',label: 'Exporter le rapport Qualité de service' },
    ],
  },
  {
    id: 'admin', label: 'Administration', icon: 'ti-shield-lock',
    permissions: [
      { id: 'users_manage',           label: 'Gérer les utilisateurs' },
      { id: 'users_edit_permissions', label: 'Modifier les droits des utilisateurs' },
      { id: 'backup_manage',          label: 'Accès à la sauvegarde' },
    ],
  },
];

/**
 * Liste à plat de tous les identifiants de permission, dans l'ordre
 * de PERMISSION_GROUPS — utilisée pour générer/lire les cases à
 * cocher du formulaire utilisateur.
 * @type {PermissionId[]}
 */
const PERMISSION_IDS = PERMISSION_GROUPS.flatMap(g => g.permissions.map(p => p.id));

/**
 * Permissions par défaut attribuées à chaque rôle. Conçues pour
 * reproduire le comportement actuel du code aussi fidèlement que
 * possible (voir le bandeau d'en-tête) — à ajuster librement une
 * fois que chaque module aura été branché sur ces permissions.
 * @type {Object<string, UserPerms>}
 */
const DEFAULT_PERMISSIONS = {
  admin: Object.fromEntries(PERMISSION_IDS.map(id => [id, 1])),

  fsqs: {
    audit_create: 1, audit_edit_date: 0, draft_view_own: 1, draft_view_others: 0, draft_resume: 1, draft_delete: 1, draft_save: 1,
    qaudit_create: 1, qaudit_edit_date: 0, qaudit_edit_auditor: 0, qaudit_delete: 0,
    nc_view: 1, nc_edit_status: 1, nc_edit_deadline: 0, nc_delete: 0, nc_reopen: 0,
    action_view: 1, action_edit_status: 1, action_delete: 0,
    alert_create: 1, alert_edit: 1, alert_close: 1, alert_delete: 0,
    analysis_view: 1, analysis_upload: 1, analysis_delete: 0,
    extaudit_view: 1, extaudit_upload: 1, extaudit_delete: 0, metro_view: 1, metro_manage: 1, metro_delete: 0,
    store_manage: 0, brand_manage: 0,
    grid_view: 1, grid_create_rayon: 1, grid_edit_rayon: 0, grid_edit_point: 0, grid_import: 1, grid_delete: 0,
    qgrid_view: 1, qgrid_manage: 0,
    report_fsqs_view: 1, report_qualimetre_view: 1, report_delete_audits: 0, nc_export: 1, report_fsqs_export: 1, report_qualimetre_export: 1,
    users_manage: 0, users_edit_permissions: 0, backup_manage: 0,
  },

  directeur: {
    audit_create: 0, audit_edit_date: 0, draft_view_own: 0, draft_view_others: 0, draft_resume: 0, draft_delete: 0, draft_save: 0,
    qaudit_create: 1, qaudit_edit_date: 0, qaudit_edit_auditor: 0, qaudit_delete: 0,
    nc_view: 0, nc_edit_status: 0, nc_edit_deadline: 0, nc_delete: 0, nc_reopen: 0,
    action_view: 1, action_edit_status: 0, action_delete: 0,
    alert_create: 1, alert_edit: 1, alert_close: 1, alert_delete: 0,
    analysis_view: 1, analysis_upload: 1, analysis_delete: 0,
    extaudit_view: 1, extaudit_upload: 1, extaudit_delete: 0, metro_view: 1, metro_manage: 1, metro_delete: 0,
    store_manage: 0, brand_manage: 0,
    grid_view: 0, grid_create_rayon: 0, grid_edit_rayon: 0, grid_edit_point: 0, grid_import: 0, grid_delete: 0,
    qgrid_view: 0, qgrid_manage: 0,
    report_fsqs_view: 1, report_qualimetre_view: 1, report_delete_audits: 0, nc_export: 0, report_fsqs_export: 1, report_qualimetre_export: 1,
    users_manage: 0, users_edit_permissions: 0, backup_manage: 0,
  },

  direction: {
    audit_create: 0, audit_edit_date: 0, draft_view_own: 0, draft_view_others: 0, draft_resume: 0, draft_delete: 0, draft_save: 0,
    qaudit_create: 1, qaudit_edit_date: 0, qaudit_edit_auditor: 0, qaudit_delete: 0,
    nc_view: 0, nc_edit_status: 0, nc_edit_deadline: 0, nc_delete: 0, nc_reopen: 0,
    action_view: 0, action_edit_status: 0, action_delete: 0,
    alert_create: 1, alert_edit: 1, alert_close: 1, alert_delete: 0,
    analysis_view: 1, analysis_upload: 0, analysis_delete: 0,
    extaudit_view: 1, extaudit_upload: 0, extaudit_delete: 0, metro_view: 1, metro_manage: 0, metro_delete: 0,
    store_manage: 0, brand_manage: 0,
    grid_view: 0, grid_create_rayon: 0, grid_edit_rayon: 0, grid_edit_point: 0, grid_import: 0, grid_delete: 0,
    qgrid_view: 0, qgrid_manage: 0,
    report_fsqs_view: 1, report_qualimetre_view: 1, report_delete_audits: 0, nc_export: 0, report_fsqs_export: 1, report_qualimetre_export: 1,
    users_manage: 0, users_edit_permissions: 0, backup_manage: 0,
  },

  collaborateur: {
    audit_create: 1, audit_edit_date: 0, draft_view_own: 1, draft_view_others: 0, draft_resume: 1, draft_delete: 1, draft_save: 1,
    qaudit_create: 0, qaudit_edit_date: 0, qaudit_edit_auditor: 0, qaudit_delete: 0,
    nc_view: 0, nc_edit_status: 0, nc_edit_deadline: 0, nc_delete: 0, nc_reopen: 0,
    action_view: 0, action_edit_status: 0, action_delete: 0,
    alert_create: 1, alert_edit: 1, alert_close: 1, alert_delete: 0,
    analysis_view: 0, analysis_upload: 0, analysis_delete: 0,
    extaudit_view: 0, extaudit_upload: 0, extaudit_delete: 0, metro_view: 0, metro_manage: 0, metro_delete: 0,
    store_manage: 0, brand_manage: 0,
    grid_view: 0, grid_create_rayon: 0, grid_edit_rayon: 0, grid_edit_point: 0, grid_import: 0, grid_delete: 0,
    qgrid_view: 0, qgrid_manage: 0,
    report_fsqs_view: 0, report_qualimetre_view: 0, report_delete_audits: 0, nc_export: 0, report_fsqs_export: 0, report_qualimetre_export: 0,
    users_manage: 0, users_edit_permissions: 0, backup_manage: 0,
  },
};

// Alias conservés pour compatibilité avec les appels existants
/** @type {Object<string, UserPerms>} */
const DPERMS = DEFAULT_PERMISSIONS;
/** @type {PermissionId[]} */
const PIDS   = PERMISSION_IDS;

// ─────────────────────────────────────────────
// 3. ZONES QUALIMÈTRE
// ─────────────────────────────────────────────

// ⚠️ SUPPRIMÉ (décision produit explicite : plus aucune zone
// prédéfinie) : QM_ZONES contenait auparavant 10 zones fixes
// (Abords & Accueil, Boulangerie...). Les zones Qualité de service sont
// désormais entièrement déduites des données réelles (import ou
// création manuelle) — voir _getAllZones (grille-qualimetre.js),
// seule source de vérité pour la liste des zones existantes.

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

/** @type {Object<string, string>} */
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
    Un seul onglet : traité comme un CSV. Plusieurs onglets : chaque onglet est apparié automatiquement à un rayon d'après son nom, l'onglet "Tutoriel" est ignoré, et l'onglet "Commun" est ajouté à tous les rayons du classeur.<br>
    Les colonnes sont détectées automatiquement par leur en-tête (zone, point de contrôle, méthode, criticité, commentaire…), quel que soit leur ordre.<br>
    <span style="color:#15803d">Le rayon et la zone de chaque ligne restent corrigeables individuellement dans l'aperçu avant import.</span>`,

  pdf: `<strong style="color:var(--text);font-size:13px">Format PDF</strong><br>
    Le texte du PDF est extrait et analysé ligne par ligne, puis les colonnes sont détectées automatiquement comme pour un fichier CSV.<br>
    Les PDFs contenant des tableaux avec des colonnes identifiables (zone, point de contrôle, criticité…) sont mieux reconnus.<br>
    <span style="color:var(--orange)">⚠ Les PDFs scannés (images) ne fonctionnent pas.</span>`,
};

// Alias pour compatibilité
/** @type {Object<string, string>} */
const FORMAT_INFO = IMPORT_FORMAT_INFO;

// ─────────────────────────────────────────────
// 7. TYPES DE COMMERCE
// ─────────────────────────────────────────────

/**
 * Type de commerce d'une enseigne. Le type détermine :
 *  - la LISTE des rayons/zones dont héritent tous les magasins des
 *    enseignes de ce type (DB.typeRayons, géré depuis la page
 *    Enseignes — bouton « Rayons / Zones par type ») ;
 *  - le VOCABULAIRE : « Rayons » pour la distribution (mode 'rayons'),
 *    « Zones » pour la restauration et l'industrie (mode 'zones').
 * Les grilles d'audit restent inchangées : grille commune d'enseigne
 * + grille spécifique magasin (voir getGrille, grille.js).
 * @typedef {Object} CommerceType
 * @property {string} id - Identifiant stable (stocké dans DB.enseigneTypes).
 * @property {string} label - Libellé affiché.
 * @property {'rayons'|'zones'} mode - Vocabulaire employé.
 */

/** @type {CommerceType[]} */
const COMMERCE_TYPES = [
  { id: 'grande-distribution',    label: 'Grande Distribution',       mode: 'rayons' },
  { id: 'distribution-proximite', label: 'Distribution de Proximité', mode: 'rayons' },
  { id: 'restaurant',             label: 'Restaurant',                mode: 'zones' },
  { id: 'fast-food',              label: 'Fast Food',                 mode: 'zones' },
  { id: 'industrie-agro',         label: 'Industrie Agroalimentaire', mode: 'zones' },
];
