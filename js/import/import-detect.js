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
      /^(point de contr[oô]le|point|intitul[eé]|question|verification|vérification)$/,
      /point.*contr[oô]le|^point$|intitul[eé]|question|verif|vérif|contr[oô]le|libell[eé]|description du point/,
    ],
    contentScorer: null, // texte libre, pas de pattern de contenu fiable
  },
  {
    concept: 'methode',
    headerPatterns: [
      /^(m[eé]thode|m[eé]thode de v[eé]rification|indication|modalit[eé])$/,
      /m[eé]thode|indication|modalit[eé]|comment v[eé]rifier|protocole/,
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
      /^(commentaire|remarque|note|observation|pr[eé]cision)$/,
      /comment|remarque|note|observ|pr[eé]cision|detail|détail/,
    ],
    contentScorer: null,
  },
  {
    concept: 'categorie',
    headerPatterns: [
      /^(cat[eé]gorie|sous-?cat[eé]gorie|famille|sous-?zone)$/,
      /cat[eé]gorie|famille|sous-?zone|sous-?rayon/,
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
 * @param {RawImportRow[]} rawRows - Lignes brutes ; la première ligne sert de référence pour les en-têtes (clés), les suivantes pour le scoring de contenu.
 * @returns {DetectionResult}
 */
function detectConceptMapping(rawRows) {
  /** @type {string[]} */
  const headers = rawRows.length ? Object.keys(rawRows[0]) : [];

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
