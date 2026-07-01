// ══════════════════════════════════════════════════════════════
// IMPORT-DETECT — Détection générique de concepts métier dans un
// référentiel importé (zone, point de contrôle, méthode,
// criticité, commentaire), indépendamment du format source et des
// intitulés de colonnes utilisés par chaque client.
//
// Dépend de : aucune dépendance externe. Module autonome,
// utilisable par import-grille.js et grille-qualimetre.js.
//
// ⚠️ CE QUE CE MODULE N'EST PAS : il ne fait appel à aucun service
// IA, aucun modèle de langage, aucun appel réseau. La détection est
// 100% locale, basée sur des règles explicites (motifs sur les
// en-têtes de colonnes + scoring optionnel sur le contenu des
// cellules). Toute donnée client reste dans le navigateur.
//
// ⚠️ CE MODULE NE FAIT PAS DE NORMALISATION MÉTIER. Il produit
// uniquement un mapping {concept → en-tête de colonne}. La
// normalisation (criticité → valeur connue, poids par défaut,
// résolution de zone...) reste dans import-normalize.js et dans les
// fichiers consommateurs (import-grille.js, grille-qualimetre.js),
// qui ne sont pas modifiés par l'ajout de ce module.
// ══════════════════════════════════════════════════════════════

// ─────────────────────────────────────────────
// 0. TYPEDEFS JSDoc
// ─────────────────────────────────────────────

/**
 * Ligne brute indépendante du format source (CSV, XLSX, PDF). Les
 * clés sont les en-têtes de colonnes EXACTEMENT tels que lus dans
 * le document d'origine (jamais renommées, jamais interprétées).
 * Toutes les valeurs sont des chaînes brutes, non normalisées.
 *
 * Si le document ne comporte pas d'en-tête identifiable, les clés
 * sont des positions génériques ('Colonne 1', 'Colonne 2', ...) —
 * voir buildSyntheticHeaders.
 * @typedef {Record<string, string>} RawImportRow
 */

/**
 * Concept métier détectable dans un référentiel importé. La liste
 * est volontairement fermée à ce que l'application sait exploiter
 * aujourd'hui. 'commentaire' et 'methode' sont des concepts
 * informatifs (jamais requis pour qu'une ligne soit valide).
 * 'categorie' et 'poids' sont optionnels et correspondent à des
 * champs déjà présents dans NormalizedImportRow (import-normalize.js)
 * — les détecter évite de les renvoyer à tort dans le champ `extra`.
 * @typedef {'zone'|'point'|'methode'|'criticite'|'commentaire'|'categorie'|'poids'} ImportConcept
 */

/**
 * Mapping résultant de la détection : pour chaque concept, l'en-tête
 * de colonne assigné (clé présente dans RawImportRow), ou null si
 * aucune colonne n'a atteint le seuil de confiance minimal pour ce
 * concept. Ce mapping est une donnée de premier ordre, manipulable
 * et corrigible manuellement (voir modale de validation) — jamais
 * une boîte noire.
 * @typedef {Record<ImportConcept, string | null>} ConceptMapping
 */

/**
 * Détail de scoring d'une colonne pour un concept donné, conservé
 * pour affichage/debug dans la modale de validation (transparence
 * de la détection — permet d'expliquer à l'utilisateur pourquoi
 * telle colonne a été choisie).
 * @typedef {Object} ConceptScore
 * @property {string} header - En-tête de la colonne évaluée.
 * @property {number} score - Score 0-1 (0 = aucune correspondance, 1 = correspondance forte).
 * @property {'header'|'content'} matchedBy - Signal ayant produit le meilleur score pour cette colonne.
 */

/**
 * Résultat complet de la détection, incluant le mapping retenu et
 * le détail des scores par concept (pour transparence/debug et
 * pour permettre une UI de correction informée plutôt qu'un simple
 * dropdown vide).
 * @typedef {Object} DetectionResult
 * @property {ConceptMapping} mapping
 * @property {Record<ImportConcept, ConceptScore[]>} scores - Scores de toutes les colonnes candidates par concept, triés du meilleur au moins bon. Permet à la modale de proposer une alternative si la détection automatique est corrigée manuellement.
 * @property {string[]} unmappedHeaders - En-têtes du document n'ayant été assignés à aucun concept (score sous le seuil pour tous) — à conserver dans un champ 'extra', jamais à perdre.
 */

/**
 * Définition d'un concept métier pour la détection de colonnes.
 * @typedef {Object} ConceptDefinition
 * @property {ImportConcept} concept
 * @property {RegExp[]} headerPatterns - Motifs testés sur le nom de colonne normalisé (minuscules, sans accents), du plus au moins spécifique. Le premier motif qui correspond donne le score le plus élevé.
 * @property {((cellValues: string[]) => number) | null} contentScorer - Optionnel : score 0-1 basé sur un échantillon de valeurs de la colonne. Utilisé en appoint du score d'en-tête (jamais seul), notamment quand l'en-tête est absent ou ambigu.
 */

// ─────────────────────────────────────────────
// 1. CONSTANTES — DÉFINITIONS DES CONCEPTS
//
// Chaque liste de motifs est volontairement extensible : ajouter un
// synonyme observé chez un client = ajouter une entrée à la liste,
// jamais une réécriture du moteur de scoring ci-dessous.
// ─────────────────────────────────────────────

/**
 * Seuil minimal de score d'en-tête pour qu'une colonne soit
 * considérée comme candidate sérieuse à un concept. En dessous,
 * la colonne reste non assignée plutôt que mal assignée.
 * @type {number}
 */
const IMPORT_DETECT_HEADER_THRESHOLD = 0.5;

/**
 * Poids relatif du score de contenu par rapport au score d'en-tête
 * lors de la combinaison des deux signaux. Le score d'en-tête reste
 * toujours prioritaire (poids 1) ; le score de contenu ne fait que
 * départager ou compenser un en-tête absent/faible.
 * @type {number}
 */
const IMPORT_DETECT_CONTENT_WEIGHT = 0.3;

/**
 * Échantillon maximal de cellules examinées par le scorer de
 * contenu (suffisant pour détecter un pattern, évite de parcourir
 * des fichiers volumineux pour un simple scoring).
 * @type {number}
 */
const IMPORT_DETECT_CONTENT_SAMPLE_SIZE = 30;

/**
 * Valeurs de criticité connues, toutes variantes confondues, pour
 * le scorer de contenu. Volontairement plus large que
 * IMPORT_VALID_CRITS (import-grille.js), qui reste la liste de
 * normalisation finale — ici on veut seulement reconnaître qu'une
 * colonne RESSEMBLE à une colonne de criticité.
 * @type {string[]}
 */
const IMPORT_DETECT_CRIT_CONTENT_VALUES = [
  'critique', 'majeure', 'majeur', 'mineure', 'mineur',
  'haute', 'moyenne', 'basse', 'faible', 'forte',
  'grave', 'modere', 'modéré', 'leger', 'léger',
];

/**
 * Définitions des concepts métier détectables, dans l'ordre de
 * priorité d'évaluation (sans effet sur le résultat — chaque
 * colonne est scorée indépendamment pour chaque concept — mais
 * conservé pour lisibilité du fichier).
 * @type {ConceptDefinition[]}
 */
const IMPORT_CONCEPT_DEFINITIONS = [
  {
    concept: 'zone',
    headerPatterns: [
      /^zone$/, /^rayon$/, /^secteur$/,
      /zone|rayon|secteur|emplacement|local|lieu|service|departement|département/,
    ],
    contentScorer: null, // pas de vocabulaire fermé exploitable (trop variable selon métier/client)
  },
  {
    concept: 'point',
    headerPatterns: [
      /^(point de contr[oô]le|point|intitul[eé]|question|verification|vérification|item|[eé]l[eé]ment)$/,
      /point.*contr[oô]le|^point$|intitul[eé]|question|verif|vérif|contr[oô]le|libell[eé]|description du point|^item$|[eé]l[eé]ment/,
    ],
    contentScorer: null, // texte libre, pas de pattern de contenu fiable
  },
  {
    concept: 'methode',
    headerPatterns: [
      /^(m[eé]thode|m[eé]thode de v[eé]rification|indication|modalit[eé]|pr[eé]cisions?)$/,
      /m[eé]thode|indication|modalit[eé]|comment v[eé]rifier|protocole|pr[eé]cisions?/,
    ],
    contentScorer: null,
  },
  {
    concept: 'criticite',
    headerPatterns: [
      /^(criticit[eé]|importance|gravit[eé]|niveau|s[eé]v[eé]rit[eé])$/,
      /criti|import|gravit|niveau|s[eé]v[eé]rit[eé]|priorit[eé]|risque/,
    ],
    contentScorer: cellValues => _scoreClosedVocabulary(cellValues, IMPORT_DETECT_CRIT_CONTENT_VALUES),
  },
  {
    concept: 'commentaire',
    headerPatterns: [
      /^(commentaire|remarque|note|observation)$/,
      /comment|remarque|note|observ|detail|détail/,
    ],
    contentScorer: null,
  },
  {
    concept: 'categorie',
    headerPatterns: [
      /^(cat[eé]gorie|sous-?cat[eé]gorie|famille|sous-?zone|th[eè]me)$/,
      /cat[eé]gorie|famille|sous-?zone|sous-?rayon|th[eè]me/,
    ],
    contentScorer: null,
  },
  {
    concept: 'poids',
    headerPatterns: [
      /^(poids|pond[eé]ration|points|score|weight)$/,
      /poids|pond[eé]ration|weight|^score$/,
    ],
    contentScorer: cellValues => _scoreNumericContent(cellValues),
  },
];

// ─────────────────────────────────────────────
// 2. NORMALISATION DE TEXTE (utilitaire interne)
// ─────────────────────────────────────────────

/**
 * Normalise un en-tête de colonne pour comparaison par motif :
 * minuscules, accents retirés, espaces multiples réduits. Purement
 * typographique — ne modifie jamais le sens, utilisé uniquement
 * pour le matching interne au détecteur.
 * @param {string} header
 * @returns {string}
 */
function _normalizeHeaderForMatching(header) {
  return String(header || '')
    .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .trim()
    .replace(/\s+/g, ' ');
}

/**
 * Calcule un score 0-1 de correspondance entre un en-tête normalisé
 * et une liste de motifs ordonnés du plus au moins spécifique. Le
 * premier motif qui correspond fixe le score (dégressif selon sa
 * position dans la liste) ; aucune correspondance → 0.
 * @param {string} normalizedHeader
 * @param {RegExp[]} patterns
 * @returns {number}
 */
function _scoreHeaderAgainstPatterns(normalizedHeader, patterns) {
  for (let i = 0; i < patterns.length; i++) {
    if (patterns[i].test(normalizedHeader)) {
      // Le premier motif (le plus spécifique, ex : ancre exacte ^...$)
      // donne 1.0 ; les suivants dégradent légèrement le score pour
      // refléter une correspondance plus large/moins certaine.
      return Math.max(1 - i * 0.15, 0.55);
    }
  }
  return 0;
}

/**
 * Calcule un score 0-1 basé sur la proportion de valeurs d'un
 * échantillon qui correspondent à un vocabulaire fermé connu
 * (insensible à la casse/accents). Utilisé uniquement comme signal
 * d'appoint — jamais pour valider ou rejeter une ligne.
 * @param {string[]} cellValues
 * @param {string[]} closedVocabulary - Déjà attendu en minuscules/sans accents.
 * @returns {number}
 */
function _scoreClosedVocabulary(cellValues, closedVocabulary) {
  /** @type {string[]} */
  const nonEmpty = cellValues.map(_normalizeHeaderForMatching).filter(Boolean);
  if (!nonEmpty.length) return 0;
  /** @type {number} */
  const matches = nonEmpty.filter(v => closedVocabulary.includes(v)).length;
  return matches / nonEmpty.length;
}

/**
 * Calcule un score 0-1 basé sur la proportion de valeurs d'un
 * échantillon qui sont des nombres entiers simples (typiquement un
 * poids/pondération). Signal d'appoint uniquement.
 * @param {string[]} cellValues
 * @returns {number}
 */
function _scoreNumericContent(cellValues) {
  /** @type {string[]} */
  const nonEmpty = cellValues.map(v => String(v || '').trim()).filter(Boolean);
  if (!nonEmpty.length) return 0;
  /** @type {number} */
  const matches = nonEmpty.filter(v => /^\d+$/.test(v)).length;
  return matches / nonEmpty.length;
}

// ─────────────────────────────────────────────
// 3. DÉTECTION PRINCIPALE
// ─────────────────────────────────────────────

/**
 * Collecte l'ensemble des en-têtes (clés) présents dans des lignes
 * brutes, dans leur ordre de première apparition.
 *
 * ⚠️ CHANGÉ : ne se limite plus aux clés de la première ligne
 * (Object.keys(rawRows[0])) — un document multi-sections (voir
 * buildRawRowsFromCellRows, import-grille.js) peut légitimement
 * produire des lignes aux en-têtes DIFFÉRENTS d'une section à l'autre
 * (ex : une section dont l'en-tête n'a pas été reconnu retombe sur
 * des en-têtes synthétiques "Colonne 1", "Colonne 2"..., tandis que
 * les autres sections gardent leurs vrais en-têtes). Ne considérer
 * que la première ligne pouvait faire retomber TOUT le mapping sur
 * des en-têtes non pertinents si cette première ligne provenait
 * justement d'une section mal reconnue — même si la majorité des
 * lignes du document avaient des en-têtes parfaitement exploitables.
 * @param {RawImportRow[]} rawRows
 * @returns {string[]}
 */
function _collectAllHeaders(rawRows) {
  /** @type {Set<string>} */
  const seen = new Set();
  /** @type {string[]} */
  const headers = [];
  rawRows.forEach(row => {
    Object.keys(row).forEach(key => {
      if (!seen.has(key)) { seen.add(key); headers.push(key); }
    });
  });
  return headers;
}

/**
 * Détecte, pour chaque concept métier connu, la colonne la plus
 * probable du document, en combinant un score sur le nom d'en-tête
 * et (si défini) un score sur le contenu des cellules. Ne modifie
 * jamais les données ; produit uniquement un mapping consultable et
 * corrigible.
 *
 * Une même colonne ne peut être assignée qu'à un seul concept : en
 * cas d'ambiguïté (une colonne est la meilleure candidate pour deux
 * concepts), elle est attribuée au concept pour lequel son score est
 * le plus élevé, et le second concept reçoit sa meilleure colonne
 * restante (si elle dépasse le seuil).
 * @param {RawImportRow[]} rawRows - Lignes brutes ; l'union des clés de TOUTES les lignes sert de référence pour les en-têtes (voir _collectAllHeaders), le contenu des premières lignes pour le scoring de contenu.
 * @returns {DetectionResult}
 */
function detectConceptMapping(rawRows) {
  /** @type {string[]} */
  const headers = _collectAllHeaders(rawRows);

  /** @type {Record<ImportConcept, ConceptScore[]>} */
  const scoresByConcept = /** @type {Record<ImportConcept, ConceptScore[]>} */ ({});

  IMPORT_CONCEPT_DEFINITIONS.forEach(def => {
    /** @type {ConceptScore[]} */
    const candidateScores = headers.map(header => _scoreHeaderForConcept(header, def, rawRows));
    candidateScores.sort((a, b) => b.score - a.score);
    scoresByConcept[def.concept] = candidateScores;
  });

  /** @type {ConceptMapping} */
  const mapping = { zone: null, point: null, methode: null, criticite: null, commentaire: null, categorie: null, poids: null };
  /** @type {Set<string>} En-têtes déjà assignés à un concept, pour éviter qu'une colonne serve deux fois. */
  const assignedHeaders = new Set();

  // Attribution gloutonne par ordre de score décroissant global :
  // on traite d'abord la paire (concept, colonne) la plus confiante
  // toutes combinaisons confondues, pour que les cas non-ambigus
  // ne soient jamais perturbés par l'ordre de la liste de concepts.
  /** @type {{concept: ImportConcept, header: string, score: number}[]} */
  const allCandidates = [];
  Object.keys(scoresByConcept).forEach(concept => {
    scoresByConcept[concept].forEach(c => {
      if (c.score >= IMPORT_DETECT_HEADER_THRESHOLD) {
        allCandidates.push({ concept: /** @type {ImportConcept} */ (concept), header: c.header, score: c.score });
      }
    });
  });
  allCandidates.sort((a, b) => b.score - a.score);

  allCandidates.forEach(candidate => {
    if (mapping[candidate.concept] !== null) return;       // concept déjà pourvu
    if (assignedHeaders.has(candidate.header)) return;     // colonne déjà prise par un concept mieux noté
    mapping[candidate.concept] = candidate.header;
    assignedHeaders.add(candidate.header);
  });

  /** @type {string[]} */
  const unmappedHeaders = headers.filter(h => !assignedHeaders.has(h));

  return { mapping, scores: scoresByConcept, unmappedHeaders };
}

/**
 * Calcule le score combiné (en-tête + contenu) d'une colonne pour
 * un concept donné.
 *
 * Pondération : si l'en-tête donne déjà un signal (score > 0), le
 * contenu ne fait que l'affiner/le compléter (poids
 * IMPORT_DETECT_CONTENT_WEIGHT). Si l'en-tête ne donne AUCUN signal
 * (score 0 — notamment le cas des en-têtes synthétiques
 * 'Colonne N', qui ne peuvent par construction matcher aucun
 * motif), le score de contenu est utilisé directement comme score
 * du concept, sinon un fichier sans en-tête fiable ne pourrait
 * jamais bénéficier du scoring de contenu (voir
 * buildSyntheticHeaders).
 * @param {string} header
 * @param {ConceptDefinition} def
 * @param {RawImportRow[]} rawRows
 * @returns {ConceptScore}
 */
function _scoreHeaderForConcept(header, def, rawRows) {
  /** @type {string} */
  const normalizedHeader = _normalizeHeaderForMatching(header);
  /** @type {number} */
  const headerScore = _scoreHeaderAgainstPatterns(normalizedHeader, def.headerPatterns);

  if (!def.contentScorer) {
    return { header, score: headerScore, matchedBy: 'header' };
  }

  /** @type {string[]} */
  const sample = rawRows.slice(0, IMPORT_DETECT_CONTENT_SAMPLE_SIZE).map(r => String(r[header] || ''));
  /** @type {number} */
  const contentScore = def.contentScorer(sample);

  if (headerScore === 0) {
    return { header, score: contentScore, matchedBy: 'content' };
  }

  /** @type {number} */
  const combined = headerScore + contentScore * IMPORT_DETECT_CONTENT_WEIGHT;
  /** @type {number} */
  const clamped = Math.min(combined, 1);

  return {
    header,
    score: clamped,
    matchedBy: contentScore > headerScore ? 'content' : 'header',
  };
}

// ─────────────────────────────────────────────
// 4. EN-TÊTES SYNTHÉTIQUES (fichiers sans en-tête détectable)
// ─────────────────────────────────────────────

/**
 * Construit des en-têtes génériques ('Colonne 1', 'Colonne 2', ...)
 * pour un fichier où aucune ligne d'en-tête fiable n'a été
 * identifiée par l'adaptateur de lecture. Permet au détecteur de
 * fonctionner uniformément même sans nom de colonne réel (le
 * scoring d'en-tête sera alors nul pour toutes les colonnes, et
 * seul le scoring de contenu — quand il existe — pourra produire un
 * mapping ; sinon la colonne reste non assignée et finit en 'extra',
 * jamais perdue).
 * @param {number} columnCount
 * @returns {string[]}
 */
function buildSyntheticHeaders(columnCount) {
  /** @type {string[]} */
  const headers = [];
  for (let i = 0; i < columnCount; i++) headers.push(`Colonne ${i + 1}`);
  return headers;
}

// ─────────────────────────────────────────────
// 5. ZONE EN LIGNE-TITRE (sections multi-tableaux dans une feuille)
//
// Certains fichiers clients ne mettent pas la zone dans une colonne
// dédiée : ils répètent un mini-tableau complet (en-tête + lignes)
// par zone, précédé d'une ligne-titre du type "Zone : STOCKAGE" qui
// occupe seule la première colonne. Ce bloc détecte ces lignes-titre
// et découpe la feuille en sections indépendantes, chacune retraitée
// comme un tableau autonome par le reste du pipeline (voir
// buildRawRowsFromCellRows, import-grille.js).
//
// ⚠️ Ne remplace jamais la détection "zone en colonne" existante :
// les deux mécanismes coexistent. Un fichier sans aucune ligne-titre
// détectée traverse ce bloc sans aucun effet (une seule section
// couvrant tout le tableau).
// ─────────────────────────────────────────────

/**
 * Ligne brute de cellules, indexée par position de colonne (avant
 * toute détection d'en-tête), telle que produite par un lecteur
 * CSV/XLSX. Distincte de RawImportRow (qui est déjà indexée par
 * en-tête de colonne) : ce typedef représente un niveau de
 * représentation plus bas, nécessaire pour repérer les lignes-titre
 * avant même de savoir où se trouve la ligne d'en-tête.
 * @typedef {string[]} CellRow
 */

/**
 * Motifs reconnaissant un préfixe de ligne-titre de section
 * (zone donnée en ligne plutôt qu'en colonne). Volontairement
 * extensible : ajouter un synonyme observé chez un client = ajouter
 * une entrée à cette liste.
 *
 * ⚠️ CHANGÉ : accepte désormais un identifiant libre entre le mot-clé
 * et le ':' (ex : "Zone 1 :", "Secteur n°3 :", "RAYON 10 :"), et non
 * plus uniquement "Zone :" seul — un client peut tout à fait numéroter
 * ses zones. Le test s'applique après retrait d'une éventuelle
 * décoration en tête de ligne (émoji, puce, symbole — voir
 * _stripLeadingDecoration), jamais avant.
 * @type {RegExp[]}
 */
/**
 * Mots-clés reconnus en préfixe d'une ligne-titre de section (zone
 * donnée en ligne plutôt qu'en colonne). Liste volontairement large
 * et extensible : ajouter un synonyme observé chez un client = 
 * ajouter une entrée ici, jamais réécrire la logique de détection ni
 * les motifs eux-mêmes (générés automatiquement, voir
 * IMPORT_SECTION_TITLE_PATTERNS). Écrits sans accent : la
 * comparaison se fait sur une version normalisée du texte (voir
 * _normalizeHeaderForMatching), donc "departement" couvre aussi
 * "Département".
 * @type {string[]}
 */
const IMPORT_SECTION_TITLE_KEYWORDS = [
  'zone', 'secteur', 'rayon', 'section', 'departement', 'emplacement',
  'local', 'atelier', 'service', 'perimetre', 'espace', 'poste', 'lieu',
  'unite', 'famille', 'categorie', 'chapitre', 'partie', 'bloc', 'groupe',
  'aire', 'domaine', 'region', 'salle', 'etage', 'niveau', 'batiment',
  'site', 'entrepot', 'gondole', 'ligne',
];

/**
 * Motifs reconnaissant un préfixe de ligne-titre de section, générés
 * à partir de IMPORT_SECTION_TITLE_KEYWORDS. Accepte un identifiant
 * libre entre le mot-clé et le séparateur (ex : "Zone 1 :", "Secteur
 * n°3 -", "RAYON 10 –") et plusieurs séparateurs usuels (deux-points,
 * tiret simple, tiret demi-cadratin, tiret cadratin) — le test
 * s'applique sur le texte normalisé (voir _normalizeHeaderForMatching),
 * jamais sur le texte brut.
 * @type {RegExp[]}
 */
const IMPORT_SECTION_TITLE_PATTERNS = IMPORT_SECTION_TITLE_KEYWORDS.map(
  keyword => new RegExp(`^${keyword}\\b[^:\\-–—]{0,20}[:\\-–—]`, 'i')
);

/**
 * Retire toute décoration non signifiante en tête de texte (émoji,
 * puce, symbole, ponctuation isolée) — un extracteur PDF place
 * fréquemment une icône dans son propre run de texte, juste avant le
 * libellé réel d'un titre de section. Ne retire jamais une lettre ou
 * un chiffre : seulement ce qui les précède.
 * @param {string} text
 * @returns {string}
 */
function _stripLeadingDecoration(text) {
  return String(text || '').replace(/^[^\p{L}\d]+/u, '').trim();
}

/**
 * Détecte les index de lignes-titre de section dans des lignes
 * brutes de cellules. Une ligne est candidate si elle ne porte
 * qu'UNE seule cellule "signifiante" (contenant au moins une lettre
 * ou un chiffre) — les autres cellules, si non vides, ne contiennent
 * que de la décoration (émoji, puce, symbole isolé dans son propre
 * run de texte par l'extracteur PDF/XLSX). Deux niveaux de signal :
 * - signal FORT : la cellule signifiante, décoration retirée en tête
 *   (voir _stripLeadingDecoration), porte un préfixe reconnu
 *   (IMPORT_SECTION_TITLE_PATTERNS).
 * - signal FAIBLE : une seule cellule signifiante, mais sans préfixe
 *   reconnu (ex : "COMMUN" seul). Ce signal n'est retenu que si au
 *   moins un signal FORT existe déjà ailleurs dans le fichier — sans
 *   cela, une ligne de donnée isolée (case vide à droite par accident
 *   de saisie) serait prise à tort pour un titre de section. La
 *   présence d'au moins une zone préfixée confirme que le fichier
 *   suit bien ce schéma de mise en page.
 * @param {CellRow[]} cellRows
 * @returns {number[]} Index (dans cellRows) des lignes-titre détectées, triés par ordre croissant.
 */
function detectSectionTitleRowIndexes(cellRows) {
  /** @type {number[]} */
  const strongIndexes = [];
  /** @type {number[]} */
  const weakIndexes = [];

  cellRows.forEach((row, index) => {
    /** @type {string[]} */
    const meaningfulCells = row
      .map(cell => String(cell || '').trim())
      .filter(cell => /[\p{L}\d]/u.test(cell));
    if (meaningfulCells.length !== 1) return;

    /** @type {string} */
    const label = _stripLeadingDecoration(meaningfulCells[0]);
    if (!label) return;

    /** @type {boolean} */
    const hasRecognizedPrefix = IMPORT_SECTION_TITLE_PATTERNS.some(p => p.test(_normalizeHeaderForMatching(label)));
    if (hasRecognizedPrefix) {
      strongIndexes.push(index);
    } else {
      weakIndexes.push(index);
    }
  });

  if (strongIndexes.length === 0) {
    // Aucun signal fort dans tout le fichier : on ne retient aucun
    // signal faible, pour ne jamais prendre une ligne de donnée
    // isolée pour un titre de section (voir doc ci-dessus).
    return [];
  }

  return strongIndexes.concat(weakIndexes).sort((a, b) => a - b);
}

/**
 * Extrait le libellé de zone à partir d'une ligne-titre de section
 * complète (et non plus de sa seule première colonne — voir
 * detectSectionTitleRowIndexes, qui identifie désormais la cellule
 * signifiante quelle que soit sa position). Retire toute décoration
 * en tête (émoji, puce) puis le préfixe reconnu s'il y en a un
 * ("Zone 1 : ABORDS & ACCUEIL" -> "ABORDS & ACCUEIL", "Secteur –
 * Frais LS" -> "Frais LS") ; renvoie le texte tel quel si aucun
 * préfixe ne correspond (cas du signal faible, ex : "COMMUN" ->
 * "COMMUN").
 *
 * ⚠️ La reconnaissance du préfixe se fait sur une version normalisée
 * du texte (accents/casse — voir _normalizeHeaderForMatching, cohérent
 * avec detectSectionTitleRowIndexes), mais la coupure elle-même se
 * fait sur le texte D'ORIGINE, au niveau du premier séparateur
 * rencontré (':', '-', '–', '—') : le libellé retourné conserve donc
 * accents et casse exacts du document, jamais une version normalisée.
 * @param {CellRow} titleRow
 * @returns {string}
 */
function extractZoneLabelFromSectionTitle(titleRow) {
  /** @type {string[]} */
  const meaningfulCells = (titleRow || [])
    .map(cell => String(cell || '').trim())
    .filter(cell => /[\p{L}\d]/u.test(cell));
  /** @type {string} */
  const trimmed = _stripLeadingDecoration(meaningfulCells[0] || '');
  /** @type {string} */
  const normalized = _normalizeHeaderForMatching(trimmed);

  /** @type {boolean} */
  const hasRecognizedPrefix = IMPORT_SECTION_TITLE_PATTERNS.some(p => p.test(normalized));
  if (hasRecognizedPrefix) {
    /** @type {RegExpMatchArray | null} */
    const separatorMatch = trimmed.match(/[:\-–—]/);
    if (separatorMatch) return trimmed.slice(separatorMatch.index + 1).trim();
  }
  return trimmed;
}

/**
 * Une section issue du découpage d'une feuille multi-tableaux : le
 * libellé de zone porté par sa ligne-titre, et les lignes de
 * contenu qui la suivent jusqu'à la prochaine ligne-titre (ou la fin
 * du fichier). Les lignes de contenu incluent la ligne d'en-tête
 * propre à cette section (ex : "Thème | Item | ...") — c'est au
 * reste du pipeline (détection d'en-tête existante) de la repérer,
 * exactement comme pour un tableau simple.
 * @typedef {Object} ImportSection
 * @property {string} zoneLabel
 * @property {CellRow[]} rows
 */

/**
 * Découpe des lignes brutes de cellules en sections indépendantes,
 * à partir des index de lignes-titre déjà détectés
 * (detectSectionTitleRowIndexes). Les lignes précédant la première
 * ligne-titre (en-têtes de document, lignes vides...) sont ignorées
 * pour cette découpe : elles ne forment jamais de section et seront
 * naturellement écartées par la détection d'en-tête existante si
 * elles ne contiennent rien d'exploitable.
 * @param {CellRow[]} cellRows
 * @param {number[]} titleRowIndexes - Doit être trié par ordre croissant (voir detectSectionTitleRowIndexes).
 * @returns {ImportSection[]}
 */
function splitRowsIntoSections(cellRows, titleRowIndexes) {
  /** @type {ImportSection[]} */
  const sections = [];

  titleRowIndexes.forEach((titleIndex, i) => {
    /** @type {number} */
    const nextTitleIndex = i + 1 < titleRowIndexes.length ? titleRowIndexes[i + 1] : cellRows.length;
    /** @type {string} */
    const zoneLabel = extractZoneLabelFromSectionTitle(cellRows[titleIndex]);
    /** @type {CellRow[]} */
    const rows = cellRows.slice(titleIndex + 1, nextTitleIndex);
    sections.push({ zoneLabel, rows });
  });

  return sections;
}

/**
 * Applique un "fill-down" sur une colonne : toute cellule vide
 * reçoit la dernière valeur non vide rencontrée au-dessus d'elle
 * dans la même colonne. Reproduit l'effet visuel d'une fusion de
 * cellules Excel (la valeur "semble" couvrir plusieurs lignes alors
 * qu'elle n'est réellement présente que sur la première), qui
 * disparaît après aplatissement en lignes/colonnes simples.
 *
 * Ne modifie jamais les lignes en place : renvoie un nouveau
 * tableau. Une cellule vide en tout début de colonne (aucune valeur
 * au-dessus à propager) reste vide — jamais de valeur inventée.
 * @param {CellRow[]} cellRows
 * @param {number} columnIndex
 * @returns {CellRow[]}
 */
function fillDownColumn(cellRows, columnIndex) {
  /** @type {string} */
  let lastValue = '';
  return cellRows.map(row => {
    /** @type {string} */
    const current = String(row[columnIndex] || '').trim();
    if (current) {
      lastValue = current;
      return row;
    }
    if (!lastValue) return row; // rien à propager encore, on laisse vide
    /** @type {CellRow} */
    const filled = row.slice();
    filled[columnIndex] = lastValue;
    return filled;
  });
}
