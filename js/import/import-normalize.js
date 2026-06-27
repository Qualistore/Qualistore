// ══════════════════════════════════════════════════════════════
// IMPORT-NORMALIZE — Application d'un ConceptMapping (détecté par
// import-detect.js, éventuellement corrigé manuellement par
// l'utilisateur dans la modale de validation) pour produire des
// lignes au format à 5 champs fixes (rayon/cat/q/crit/poids) déjà
// consommé par import-grille.js et grille-qualimetre.js.
//
// Dépend de : import-detect.js (ConceptMapping, RawImportRow).
//
// ⚠️ CE MODULE NE FAIT AUCUNE DÉTECTION. Il reçoit un mapping déjà
// établi et se contente de l'appliquer. Il est volontairement
// rejouable à l'identique avec un mapping différent (corrigé par
// l'utilisateur), sans jamais avoir besoin de re-scanner le
// document — c'est ce qui permet la correction manuelle du mapping
// dans la modale sans tout recalculer.
//
// ⚠️ CE MODULE NE NORMALISE PAS LA CRITICITÉ NI LE POIDS au sens
// métier final (valeurs fermées, poids par défaut) : cette étape
// reste dans import-grille.js (_normalizeCrit, IMPORT_DEFAULT_POIDS),
// qui n'est pas modifié. Ici, on ne fait que router le contenu de
// chaque colonne source vers le bon champ de sortie, en conservant
// les valeurs brutes telles quelles.
// ══════════════════════════════════════════════════════════════

// ─────────────────────────────────────────────
// 0. TYPEDEFS JSDoc
// ─────────────────────────────────────────────

/**
 * Ligne au format à 5 champs fixes (zone/cat/q/crit/poids) déjà
 * consommé par import-grille.js/grille-qualimetre.js, enrichie d'un
 * champ `extra` qui concatène le contenu des colonnes du document
 * n'ayant été assignées à aucun concept métier connu (voir
 * ConceptMapping.unmappedHeaders). Ne pas confondre avec
 * RawImportRow (import-detect.js), dont les clés sont les en-têtes
 * bruts du document — NormalizedImportRow est le résultat, après
 * routage par le mapping, vers ce format de sortie fixe.
 *
 * ⚠️ CHANGÉ : le champ `rayon` a été renommé `zone`. Le concept
 * détecté depuis le document (mapping.zone — une colonne "Zone" du
 * fichier, ou le libellé d'une ligne-titre de section, voir
 * import-detect.js) a TOUJOURS représenté une ZONE, jamais un rayon —
 * un rayon FSQS n'est jamais déduit du document, il est choisi par
 * l'utilisateur avant l'import (voir le sélecteur de rayon(s) cible,
 * import-grille.js). L'ancien nommage `rayon` ici était la source de
 * la confusion : le moteur FSQS créait à tort un nouveau RAYON pour
 * chaque libellé de section du document, alors qu'il fallait créer
 * une ZONE à l'intérieur du rayon choisi par l'utilisateur.
 * @typedef {Object} NormalizedImportRow
 * @property {string} zone
 * @property {string} cat
 * @property {string} q
 * @property {string} crit
 * @property {string} poids
 * @property {string} methode - Méthode de contrôle (RENOMMÉ depuis l'ancien "Méthode de vérification", routé depuis mapping.methode — typiquement une colonne "Précisions" du document). Affiché sous l'intitulé dans la modale d'audit (voir GrillePoint.prec, config.js).
 * @property {string} extra - Texte libre concatenant `En-tête: valeur` pour chaque colonne non mappée et non vide sur cette ligne ; chaîne vide si rien à signaler. Jamais perdu, jamais auto-injecté dans un champ métier.
 */

// ─────────────────────────────────────────────
// 1. CONSTANTES
// ─────────────────────────────────────────────

/**
 * Séparateur utilisé pour concaténer plusieurs paires
 * "en-tête: valeur" dans le champ `extra`.
 * @type {string}
 */
const IMPORT_NORMALIZE_EXTRA_SEPARATOR = ' · ';

// ─────────────────────────────────────────────
// 2. APPLICATION DU MAPPING
// ─────────────────────────────────────────────

/**
 * Applique un ConceptMapping à des lignes brutes pour produire des
 * NormalizedImportRow, au format déjà attendu par
 * _showImportPreview (import-grille.js). Aucune validation ni
 * normalisation de valeurs n'est faite ici (voir en-tête de
 * fichier) : c'est uniquement un routage colonne → champ.
 *
 * Catégorie ('cat') et poids ('poids') : routés vers leurs champs
 * dédiés si le mapping identifie une colonne 'categorie'/'poids' ;
 * sinon `cat` garde son comportement actuel ('Général' par défaut)
 * et `poids` reste vide (calculé plus tard depuis la criticité par
 * import-grille.js, comportement inchangé).
 * @param {RawImportRow[]} rawRows
 * @param {ConceptMapping} mapping
 * @param {string[]} unmappedHeaders - Voir DetectionResult.unmappedHeaders ; déterminent le contenu du champ `extra`.
 * @returns {NormalizedImportRow[]}
 */
function normalizeRows(rawRows, mapping, unmappedHeaders) {
  return rawRows.map(row => _normalizeOneRow(row, mapping, unmappedHeaders));
}

/**
 * Normalise une ligne brute unique. Fonction pure, sans effet de
 * bord, pour rester testable indépendamment du reste du moteur.
 * @param {RawImportRow} row
 * @param {ConceptMapping} mapping
 * @param {string[]} unmappedHeaders
 * @returns {NormalizedImportRow}
 */
function _normalizeOneRow(row, mapping, unmappedHeaders) {
  /** @type {string} */
  const zone = mapping.zone ? String(row[mapping.zone] || '') : '';
  /** @type {string} */
  const q = mapping.point ? String(row[mapping.point] || '') : '';
  /** @type {string} */
  const crit = mapping.criticite ? String(row[mapping.criticite] || '') : '';
  /** @type {string} */
  const cat = mapping.categorie && row[mapping.categorie] ? String(row[mapping.categorie]) : 'Général';
  /** @type {string} */
  const poids = mapping.poids ? String(row[mapping.poids] || '') : '';
  /** @type {string} */
  const methode = mapping.methode ? String(row[mapping.methode] || '') : '';

  // ⚠️ CHANGÉ : 'methode' a désormais son propre champ dédié
  // (NormalizedImportRow.methode), routé vers GrillePoint.prec —
  // affiché sous l'intitulé dans la modale d'audit (voir
  // _buildAuditQuestion, audits.js) comme "Méthode de contrôle".
  // Auparavant son contenu rejoignait `extra` (texte libre non
  // structuré) au même titre qu'une colonne non mappée, ce qui ne
  // permettait pas de l'afficher à l'endroit attendu. 'commentaire'
  // n'a toujours pas de champ dédié (pas demandé) et rejoint `extra`.
  /** @type {string[]} */
  const extraParts = [];

  if (mapping.commentaire && row[mapping.commentaire]) {
    extraParts.push(`Commentaire: ${row[mapping.commentaire]}`);
  }
  unmappedHeaders.forEach(header => {
    /** @type {string} */
    const value = String(row[header] || '').trim();
    if (value) extraParts.push(`${header}: ${value}`);
  });

  return {
    zone,
    cat,
    q,
    crit,
    poids,
    methode,
    extra: extraParts.join(IMPORT_NORMALIZE_EXTRA_SEPARATOR),
  };
}

// ─────────────────────────────────────────────
// 3. DÉTECTION DE QUASI-DOUBLONS
// ─────────────────────────────────────────────

/**
 * Résultat de la détection de doublons : pour chaque ligne en
 * conflit, l'index (dans le tableau d'entrée) de la première ligne
 * équivalente rencontrée. Les lignes non listées ici n'ont aucun
 * doublon détecté. Signalement uniquement — aucune ligne n'est
 * supprimée ni exclue par cette fonction ; la décision reste
 * manuelle (voir modale de validation).
 * @typedef {Map<number, number>} DuplicateMap
 */

/**
 * Détecte les quasi-doublons parmi des lignes normalisées, par
 * correspondance exacte de (zone normalisée + intitulé normalisé).
 * Normalisation strictement typographique (casse, espaces) — jamais
 * de correspondance approximative ou sémantique, pour rester
 * prévisible et explicable à l'utilisateur.
 * @param {NormalizedImportRow[]} rows
 * @returns {DuplicateMap}
 */
function findDuplicateRows(rows) {
  /** @type {Map<string, number>} clé normalisée → index de la première occurrence */
  const seen = new Map();
  /** @type {DuplicateMap} */
  const duplicates = new Map();

  rows.forEach((row, index) => {
    /** @type {string} */
    const key = `${_normalizeForDuplicateKey(row.zone)}|${_normalizeForDuplicateKey(row.q)}`;
    if (!row.q.trim()) return; // une ligne sans intitulé n'est jamais comparée (rien de significatif à dédupliquer)

    if (seen.has(key)) {
      duplicates.set(index, seen.get(key));
    } else {
      seen.set(key, index);
    }
  });

  return duplicates;
}

/**
 * Normalisation typographique pour clé de déduplication (trim,
 * espaces multiples réduits, casse uniforme). Identique en esprit à
 * _normalizeZoneLabel (import-grille.js), dupliquée ici
 * volontairement pour garder ce module sans dépendance vers
 * import-grille.js (sens de dépendance à sens unique : les
 * consommateurs dépendent de import-normalize.js, jamais l'inverse).
 * @param {string} text
 * @returns {string}
 */
function _normalizeForDuplicateKey(text) {
  return String(text || '').trim().replace(/\s+/g, ' ').toLowerCase();
}
