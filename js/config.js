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
 * Union fermée déduite de l'intégralité des 48 entrées de
 * GRILLE_BASE_COMMUNE — TODO TYPE : à reconfirmer si de nouvelles
 * valeurs apparaissent dans GRILLE_BASE_COMMUNE ou DB.grilleCustom.
 * @typedef {'Majeure'|'Critique'} GrilleCriticite
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
// 4. GRILLE D'AUDIT FSQS — RÉFÉRENTIEL DE BASE
// ─────────────────────────────────────────────

/**
 * Points de contrôle communs à tous les rayons (48 points).
 * Couvre les zones : Stockage/Atelier, Vente Traditionnelle, Libre-Service.
 * Ces points sont en lecture seule — la personnalisation se fait via DB.grilleCustom.
 * @type {GrillePoint[]}
 */
const GRILLE_BASE_COMMUNE = [
  // ── Zone : STOCKAGE / ATELIER ──────────────────────────────────────────
  { id: 'xl-1',  cat: 'Stockage – Equipement',    q: 'Conformité des matériaux au contact des aliments',                                          prec: 'Absence de bois',                                                                                  p: 5,  c: 'Majeure'  },
  { id: 'xl-2',  cat: 'Stockage – Equipement',    q: 'Présence de lave-mains accessibles, conformes propres et approvisionnés',                    prec: 'Distributeurs approvisionné et propreté',                                                          p: 5,  c: 'Majeure'  },
  { id: 'xl-3',  cat: 'Stockage – Nettoyage',     q: 'Propreté locaux et équipements sans contact avec les aliments',                             prec: 'Plafonds, murs, étagères, sol, poignées de porte, grille des évaporateurs…',                       p: 5,  c: 'Majeure'  },
  { id: 'xl-4',  cat: 'Stockage – Nettoyage',     q: 'Propreté du matériel en contact direct avec les aliments et à risque sanitaire',            prec: 'Cuillères, pinces, saladières, plateaux, couteaux, etc.',                                          p: 5,  c: 'Majeure'  },
  { id: 'xl-5',  cat: 'Stockage – Personnel',     q: 'Propreté et conformité de la tenue',                                                        prec: 'Badge, calot, coiffe, tablier, veste, chaussures de sécurité, etc.',                               p: 5,  c: 'Majeure'  },
  { id: 'xl-6',  cat: 'Stockage – Méthode',       q: 'Protection des produits',                                                                   prec: 'Produit protégé – Absence de matériaux polluants si présence de produit nu (bois, cartons)',       p: 5,  c: 'Majeure'  },
  { id: 'xl-7',  cat: 'Stockage – Méthode',       q: 'Séparation des denrées alimentaires de natures différentes',                                prec: 'En stockage et zone de préparation : cru/cuit, emballé/nu, familles différentes',                  p: 5,  c: 'Majeure'  },
  { id: 'xl-8',  cat: 'Stockage – Méthode',       q: 'Absence de contaminations croisées pouvant entraîner un risque sanitaire direct',           prec: 'En stockage et zone de préparation',                                                               p: 10, c: 'Critique' },
  { id: 'xl-9',  cat: 'Stockage – Méthode',       q: 'Conditions de déconditionnement / déballage / décartonnage satisfaisantes',                 prec: '',                                                                                                 p: 5,  c: 'Majeure'  },
  { id: 'xl-10', cat: 'Stockage – Méthode',       q: 'Conditions de décongélation satisfaisantes',                                                prec: 'Dans un local à une température entre 0 et +4°C',                                                  p: 5,  c: 'Majeure'  },
  { id: 'xl-11', cat: 'Stockage – Méthode',       q: 'Respect du protocole de décontamination des végétaux',                                      prec: '10% vinaigre durant 15 min',                                                                       p: 5,  c: 'Majeure'  },
  { id: 'xl-12', cat: 'Stockage – Méthode',       q: 'Rotation des produits — Respect du FIFO',                                                   prec: 'En stockage',                                                                                      p: 5,  c: 'Majeure'  },
  { id: 'xl-13', cat: 'Stockage – Méthode',       q: 'Bonne réalisation des opérations de cuisson / remise en température',                       prec: 'Remise en T°C : en moins d\'1h à +63°C (charcuterie) et +83°C (poulets)',                         p: 5,  c: 'Majeure'  },
  { id: 'xl-14', cat: 'Stockage – Date',          q: 'Respect des DLC/DUR/DDM des ingrédients',                                                   prec: '',                                                                                                 p: 10, c: 'Critique' },
  { id: 'xl-15', cat: 'Stockage – Température',   q: 'Absence de rupture de la chaîne du froid ou du chaud pouvant constituer un risque sanitaire', prec: 'Choisir un produit et prendre la température – KO si écart de + ou – 4°C avec la T° attendue', p: 10, c: 'Critique' },

  // ── Zone : Vente TRADITIONNELLE ─────────────────────────────────────────
  { id: 'xl-16', cat: 'Vente trad. – Equipement',             q: 'Conformité des matériaux au contact des aliments',                                            prec: '',                                                                                                        p: 5,  c: 'Majeure'  },
  { id: 'xl-17', cat: 'Vente trad. – Equipement',             q: 'Présence de lave-mains accessibles, conformes propres et approvisionnés',                      prec: 'Distributeurs approvisionnés : essuie-tout, savon, brosse à ongles',                                     p: 5,  c: 'Majeure'  },
  { id: 'xl-18', cat: 'Vente trad. – Equipement',             q: 'Affichage température en état de fonctionnement',                                              prec: '',                                                                                                        p: 5,  c: 'Majeure'  },
  { id: 'xl-19', cat: 'Vente trad. – Nettoyage & désinfection', q: 'Propreté locaux et équipements sans contact avec les aliments',                             prec: 'Plafonds, murs, étagères, sol, poignées de porte, grille des évaporateurs…',                              p: 5,  c: 'Majeure'  },
  { id: 'xl-20', cat: 'Vente trad. – Nettoyage & désinfection', q: 'Propreté du matériel en contact direct avec les aliments et à risque sanitaire',            prec: 'Cuillères, pinces, saladières, plateaux, couteaux – 10 pts par matériel sale',                           p: 5,  c: 'Majeure'  },
  { id: 'xl-21', cat: 'Vente trad. – Méthode',                q: 'Protection des produits',                                                                      prec: 'Produit protégé – Absence de matériaux polluants (bois, cartons)',                                        p: 5,  c: 'Majeure'  },
  { id: 'xl-22', cat: 'Vente trad. – Méthode',                q: 'Séparation des denrées alimentaires de nature différente',                                     prec: 'En stockage et zone de préparation : cru/cuit, emballé/nu, familles différentes',                         p: 5,  c: 'Majeure'  },
  { id: 'xl-23', cat: 'Vente trad. – Méthode',                q: 'Absence de contaminations croisées pouvant entraîner un risque sanitaire direct',              prec: 'Ex : pains avec allergène en contact avec pains sans allergène ; légumes terreux, viandes et volailles crues', p: 10, c: 'Critique' },
  { id: 'xl-24', cat: 'Vente trad. – Méthode',                q: 'Traçabilité',                                                                                  prec: '1 produit fabriqué ou conditionné = 1 fiche recette + 1 fiche fabrication',                               p: 5,  c: 'Majeure'  },
  { id: 'xl-25', cat: 'Vente trad. – Méthode',                q: 'Respect des DLC/DDM/DUR/DCR',                                                                  prec: '',                                                                                                        p: 10, c: 'Critique' },
  { id: 'xl-26', cat: 'Vente trad. – Méthode',                q: 'Absence à la vente de fruits et légumes de 1ère gamme altérés non commercialisables',          prec: 'Fruits et légumes abîmés',                                                                                p: 5,  c: 'Majeure'  },
  { id: 'xl-27', cat: 'Vente trad. – Etiquetage',             q: 'Conformité de l\'étiquetage — mentions générales hors sécurité des denrées',                   prec: 'Ex : zone, sous-zone et engin de pêche, % matière grasse, sticker AOP…',                               p: 5,  c: 'Majeure'  },
  { id: 'xl-28', cat: 'Vente trad. – Etiquetage',             q: 'Conformité de l\'étiquetage des fruits et légumes — mentions générales hors sécurité',         prec: 'Ex : origine erronée, absence variété…',                                                                  p: 5,  c: 'Majeure'  },
  { id: 'xl-29', cat: 'Vente trad. – Etiquetage',             q: 'Conformité de l\'étiquetage — sécurité des denrées (décote multiplicative)',                    prec: 'Ex : présence allergènes sur pics prix, terme « décongelé » ou flocon',                                p: 10, c: 'Critique' },
  { id: 'xl-30', cat: 'Vente trad. – Température',            q: 'Température de la zone / T°C produit adaptée',                                                 prec: 'Écart de + ou – 2°C avec la température attendue',                                                       p: 10, c: 'Critique' },
  { id: 'xl-31', cat: 'Vente trad. – Température',            q: 'Respect des limites de charge',                                                                prec: 'Grilles de reprise d\'air obstruées, dépassement de la limite de charge',                               p: 5,  c: 'Majeure'  },

  // ── Zone : RAYON LIBRE SERVICE ──────────────────────────────────────────
  { id: 'xl-32', cat: 'Libre-service – Equipement',               q: 'Affichage température en état de fonctionnement',                                           prec: '',                                                                                                       p: 5,  c: 'Majeure'  },
  { id: 'xl-33', cat: 'Libre-service – Nettoyage & désinfection',  q: 'Propreté locaux et équipements sans contact avec les aliments',                             prec: 'Ex : étagères, sol, poignées de porte, vitres, grille des évaporateurs…',                             p: 5,  c: 'Majeure'  },
  { id: 'xl-34', cat: 'Libre-service – Nettoyage & désinfection',  q: 'Respect des DLC / DDM / DUR / DCR des œufs',                                               prec: '',                                                                                                       p: 10, c: 'Critique' },
  { id: 'xl-35', cat: 'Libre-service – Etiquetage',               q: 'Conformité de l\'étiquetage — mentions générales hors sécurité des denrées',                prec: 'Ex : N° agrément d\'abattage et de découpe, origine, sticker AOP, traitement du lait…',               p: 5,  c: 'Majeure'  },
  { id: 'xl-36', cat: 'Libre-service – Etiquetage',               q: 'Conformité de l\'étiquetage — sécurité des denrées',                                        prec: 'Ex : présence allergènes, terme décongelé ou flocon, température de conservation',                      p: 10, c: 'Critique' },
  { id: 'xl-37', cat: 'Libre-service – Etiquetage',               q: 'Bonne application de la tare pour la pesée de produit vendu au poids',                      prec: '',                                                                                                       p: 5,  c: 'Majeure'  },
  { id: 'xl-38', cat: 'Libre-service – Température',              q: 'Température de la zone / T°C produit adaptée',                                              prec: 'Écart de + ou – 2°C avec la température attendue',                                                      p: 10, c: 'Critique' },
  { id: 'xl-39', cat: 'Libre-service – Température',              q: 'Respect des limites de charge',                                                             prec: 'Grilles de reprise d\'air obstruées, dépassement de la limite de charge',                              p: 5,  c: 'Majeure'  },
  { id: 'xl-40', cat: 'Libre-service – Equipement',               q: 'Conformité des poubelles — Traitement hygiénique des déchets',                              prec: 'Poubelles étanches maintenues fermées',                                                                  p: 5,  c: 'Majeure'  },
  { id: 'xl-41', cat: 'Libre-service – Equipement',               q: 'Présence et fonctionnement du thermomètre',                                                 prec: '',                                                                                                       p: 5,  c: 'Majeure'  },
  { id: 'xl-42', cat: 'Libre-service – Nettoyage & désinfection',  q: 'Conformité et état du matériel de nettoyage et désinfection',                               prec: 'Ex : balai, raclette, centrale de nettoyage, etc.',                                                     p: 5,  c: 'Majeure'  },
  { id: 'xl-43', cat: 'Libre-service – Nettoyage & désinfection',  q: 'Conformité des produits d\'entretien (agréés au contact alimentaire)',                       prec: 'Produits renseignés sur le protocole de nettoyage',                                                     p: 5,  c: 'Majeure'  },
  { id: 'xl-44', cat: 'Libre-service – Nettoyage & désinfection',  q: 'Conditions de stockage des emballages et conditionnements satisfaisantes',                   prec: 'Emballages protégés de la poussière, stockés retournés',                                                p: 5,  c: 'Majeure'  },
  { id: 'xl-45', cat: 'Libre-service – Nettoyage & désinfection',  q: 'Produits non conformes isolés et balisés',                                                  prec: 'Définir une zone non conforme avec affiche « non conforme »',                                           p: 5,  c: 'Majeure'  },
  { id: 'xl-46', cat: 'Libre-service – Locaux',                   q: 'Absence de défaut d\'infrastructure ou de propreté ayant une conséquence directe sur les produits', prec: 'Ex : rouille sur table de manipulation, peinture écaillée, fuite d\'eau contaminant une surface de préparation', p: 5, c: 'Majeure' },
  { id: 'xl-47', cat: 'Libre-service – Locaux',                   q: 'Présence de défaut d\'infrastructure, de dégradation ou de propreté pouvant entraîner un risque sanitaire critique', prec: 'Ex : rupture de chaîne du froid généralisée, vétusté extrême, infestation majeure non maîtrisée', p: 10, c: 'Critique' },
  { id: 'xl-48', cat: 'Libre-service – Locaux',                   q: 'Infestation massive de nuisibles avec dégradation de produits à la vente',                  prec: 'Contrôle de la présence de produits dégradés ou de la contamination de surfaces en contact alimentaire', p: 10, c: 'Critique' },
];

// ─────────────────────────────────────────────
// 5. URLS DES LIBRAIRIES EXTERNES (lazy-load)
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
