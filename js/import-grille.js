// ══════════════════════════════════════════════════════════════
// IMPORT-GRILLE — Import de grille d'audit (CSV / XLSX / PDF)
// Dépend de : storage.js (DB, CU), config.js (CDN_SHEETJS, CDN_PDFJS, CDN_PDFJS_WORKER, IMPORT_FORMAT_INFO, QM_ZONES), ui.js
// ══════════════════════════════════════════════════════════════

// ─────────────────────────────────────────────
// 0. TYPEDEFS JSDoc (pour inférence VSCode / TypeScript)
//    ⚠️ Déduits de l'usage dans ce fichier.
//
//    ✅ CORRIGÉ : _importIntoQualimetre() résout désormais la zone
//    cible à partir de la valeur de zone telle qu'elle apparaît
//    dans le document importé (row.rayonRaw), au lieu d'utiliser le
//    rayon FSQS normalisé. La résolution ne dépend d'aucune liste
//    figée (QM_ZONES n'est consultée que pour ÉVITER une duplication
//    par libellé exact déjà connu, jamais pour deviner ou valider
//    une zone). Voir _resolveOrCreateZoneFromDocument.
//
//    ⚠️ DUPLICATION (3e occurrence, non corrigée à ce stade) :
//    IMPORT_VALID_RAYONS ci-dessous est une 3e copie de la même
//    liste de rayons que RAYONS_LIST (rayons.js) et RAYONS_FSQS
//    (dashboard.js). Cette liste reste utilisée UNIQUEMENT pour la
//    validation de l'import vers la grille FSQS (_importIntoGrille),
//    pas pour le Qualimètre.
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
 * Ligne brute telle que produite par un parseur (CSV ou XLSX), avant
 * normalisation. Tous les champs sont des chaînes brutes, non
 * encore validées.
 * @typedef {Object} ImportRawRow
 * @property {string} rayon - Valeur brute de la colonne zone/rayon, telle qu'écrite dans le document. Non normalisée, non validée — c'est la source de vérité pour la résolution de zone Qualimètre.
 * @property {string} cat - Catégorie, 'Général' par défaut.
 * @property {string} q
 * @property {string} crit - Valeur brute, non normalisée.
 * @property {string} poids - Valeur brute (chaîne), à parser en nombre.
 */

/**
 * Ligne normalisée et validée, prête pour aperçu et import. La
 * notion de validité (`valid`) dépend de la cible d'import — voir
 * _showImportPreview : pour 'grille' (FSQS), un rayon reconnu est
 * requis ; pour 'qualimetre', seul un intitulé non vide est requis
 * (la zone est résolue depuis le document, jamais rejetée pour
 * absence de correspondance avec une liste connue).
 * @typedef {Object} ImportParsedRow
 * @property {string} rayon - Rayon normalisé si reconnu (cible FSQS), sinon valeur brute d'origine (voir `valid`).
 * @property {string} rayonRaw - Valeur de zone telle qu'écrite dans le document, jamais altérée. Utilisée par _importIntoQualimetre comme source de vérité pour la résolution de zone.
 * @property {string} cat
 * @property {string} q - Intitulé, trim() appliqué.
 * @property {GrilleCriticite} crit - Toujours normalisé (fallback 'Majeure' si non reconnu).
 * @property {number} p - Poids, calculé depuis IMPORT_DEFAULT_POIDS si absent/invalide.
 * @property {boolean} valid - Dépend de la cible d'import active au moment du parsing (voir _showImportPreview) ; les lignes invalides sont affichées dans l'aperçu mais exclues de l'import.
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

/**
 * Extensions acceptées par onglet de format.
 * @type {Record<ImportTab, string>}
 */
const IMPORT_ACCEPT_EXTENSIONS = {
  csv:  '.csv,.tsv,.txt',
  xlsx: '.xlsx,.xls',
  pdf:  '.pdf',
};

/**
 * Texte d'aide affiché sous la drop zone.
 * @type {Record<ImportTab, string>}
 */
const IMPORT_ACCEPT_HINTS = {
  csv:  '.csv · .tsv · .txt acceptés',
  xlsx: '.xlsx · .xls acceptés',
  pdf:  '.pdf accepté',
};

/**
 * Rayons valides pour la normalisation à l'import. Voir
 * l'avertissement de duplication en tête de fichier.
 * @type {string[]}
 */
const IMPORT_VALID_RAYONS = ['Boucherie', 'Boulangerie', 'Drive', 'Marée', 'Charcuterie', 'Fromage', 'Fruits & Légumes'];

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

// ─────────────────────────────────────────────
// 2. ÉTAT
// ─────────────────────────────────────────────

/** @type {boolean} Indique si SheetJS a déjà été chargé (lazy-load). */
let _xlsxLoaded = false;

/** @type {boolean} Indique si PDF.js a déjà été chargé (lazy-load). */
let _pdfjsLoaded = false;

/** @type {ImportParsedRow[]} Lignes parsées en attente de confirmation. */
let _importRows = [];

/** @type {ImportTab} Onglet actif. */
let _currentImportTab = 'csv';

/** @type {ImportTarget} Destination de l'import. */
let _importTarget = 'grille';

// ─────────────────────────────────────────────
// 3. MODAL D'IMPORT
// ─────────────────────────────────────────────

/**
 * Ouvre la modale d'import, réinitialise l'état et l'aperçu, et
 * sélectionne l'onglet CSV par défaut.
 * @param {ImportTarget} [target] - Destination de l'import ; 'grille' par défaut.
 * @returns {void}
 */
function openImportModal(target) {
  _importTarget      = target || 'grille';
  _importRows        = [];
  _currentImportTab  = 'csv';

  el('imp-file-input').value   = '';
  el('imp-warnings').textContent = '';
  el('pdf-note').style.display = 'none';

  /** @type {string} */
  const targetLabel = _importTarget === 'qualimetre' ? 'Qualimètre' : 'Grille d\'audit';
  document.querySelector('#m-import .modal-title').innerHTML =
    `<i class="ti ti-upload" style="color:var(--primary)"></i> Importer — ${targetLabel}`;

  _clearImportPreview();
  switchImportTab('csv');
  openModal('m-import');
}

// ─────────────────────────────────────────────
// 4. ONGLETS DE FORMAT
// ─────────────────────────────────────────────

/**
 * Bascule l'onglet de format actif (CSV/XLSX/PDF), met à jour les
 * indices visuels et le texte d'aide, et vide l'aperçu courant.
 * @param {ImportTab} tab
 * @returns {void}
 */
function switchImportTab(tab) {
  _currentImportTab = tab;

  ['csv', 'xlsx', 'pdf'].forEach(t => {
    const btn = el('tab-' + t);
    if (!btn) return;
    btn.style.background = t === tab ? 'var(--primary)' : 'var(--surface)';
    btn.style.color      = t === tab ? '#fff' : 'var(--text)';
  });

  el('imp-format-info').innerHTML   = IMPORT_FORMAT_INFO[tab];
  el('imp-accept-hint').textContent = IMPORT_ACCEPT_HINTS[tab];
  el('imp-file-input').accept       = IMPORT_ACCEPT_EXTENSIONS[tab];
  el('pdf-note').style.display      = tab === 'pdf' ? '' : 'none';

  _clearImportPreview();
}

/**
 * Réinitialise l'aperçu d'import (lignes, affichage, bouton de
 * confirmation désactivé).
 * @returns {void}
 */
function _clearImportPreview() {
  _importRows = [];
  el('imp-preview').style.display    = 'none';
  el('imp-confirm-btn').disabled     = true;
  el('imp-confirm-btn').style.opacity = '.5';
  el('imp-count-btn').textContent    = '';
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
 * @param {File} file
 * @returns {void}
 */
function processImportFile(file) {
  /** @type {string} */
  const name = file.name.toLowerCase();
  if (name.endsWith('.xlsx') || name.endsWith('.xls')) {
    _importXLSX(file);
  } else if (name.endsWith('.pdf')) {
    _importPDF(file);
  } else {
    _importCSV(file);
  }
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
 * Parse un texte CSV/TSV en lignes brutes, en détectant
 * automatiquement le séparateur et en ignorant une éventuelle
 * ligne d'en-tête.
 * @param {string} text
 * @returns {void}
 */
function _parseCSVText(text) {
  /** @type {string[]} */
  const lines     = text.split(/\r?\n/).filter(l => l.trim());
  /** @type {string} */
  const separator = lines[0].includes(';') ? ';' : lines[0].includes('\t') ? '\t' : ',';
  /** @type {ImportRawRow[]} */
  const rows      = [];

  lines.forEach((line, index) => {
    /** @type {string[]} */
    const cols = line.split(separator).map(c => c.trim().replace(/^["']|["']$/g, ''));
    if (index === 0 && /rayon|categorie|intitul/i.test(cols[0])) return; // ignorer l'en-tête
    if (cols.length < 3) return;
    rows.push({
      rayon: cols[0] || '',
      cat:   cols[1] || 'Général',
      q:     cols[2] || '',
      crit:  cols[3] || 'Majeure',
      poids: cols[4] || '',
    });
  });

  _showImportPreview(rows, `${lines.length} lignes lues`);
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
      const rawRows   = XLSX.utils.sheet_to_json(worksheet, { header: 1, defval: '' });
      /** @type {ImportRawRow[]} */
      const rows      = _parseXLSXRows(rawRows, workbook.SheetNames[0]);
      _showImportPreview(rows, `${rawRows.length} lignes lues depuis "${workbook.SheetNames[0]}"`);
    } catch (error) {
      alert('Erreur lors de la lecture du fichier Excel : ' + error.message);
    }
  };
  reader.readAsArrayBuffer(file);
}

/**
 * Parse les lignes brutes d'une feuille XLSX en ImportRawRow, en
 * détectant automatiquement les colonnes par nom d'en-tête si
 * possible, sinon par position fixe (rayon, cat, q, crit, poids).
 * @param {Array<Array<*>>} rawRows - Lignes brutes (tableaux de cellules).
 * @param {string} sheetName - Nom de la feuille (non utilisé dans le calcul, conservé pour cohérence d'appel).
 * @returns {ImportRawRow[]}
 */
function _parseXLSXRows(rawRows, sheetName) {
  /** @type {string[]} */
  const headerRow = (rawRows[0] || []).map(c => String(c).toLowerCase());

  // Détection automatique des colonnes par nom
  /** @type {{rayon: number, cat: number, q: number, crit: number, poids: number}} */
  const colMap = { rayon: -1, cat: -1, q: -1, crit: -1, poids: -1 };
  headerRow.forEach((header, i) => {
    if (/rayon/.test(header))                        colMap.rayon = i;
    else if (/cat/.test(header))                     colMap.cat   = i;
    else if (/intitul|question|point|contr/.test(header)) colMap.q = i;
    else if (/crit|gravit|niveau/.test(header))      colMap.crit  = i;
    else if (/poids|weight|score/.test(header))      colMap.poids = i;
  });

  /** @type {boolean} */
  const hasNamedColumns = colMap.rayon >= 0 && colMap.q >= 0;
  /** @type {Array<Array<*>>} */
  const dataRows        = hasNamedColumns ? rawRows.slice(1) : rawRows;

  return dataRows
    .filter(row => row.join('').trim())
    .map(row => {
      if (hasNamedColumns) {
        return {
          rayon: String(row[colMap.rayon] || ''),
          cat:   String(row[colMap.cat   >= 0 ? colMap.cat   : 1] || 'Général'),
          q:     String(row[colMap.q]    || ''),
          crit:  String(row[colMap.crit  >= 0 ? colMap.crit  : 3] || 'Majeure'),
          poids: String(row[colMap.poids >= 0 ? colMap.poids : 4] || ''),
        };
      }
      return {
        rayon: String(row[0] || ''),
        cat:   String(row[1] || 'Général'),
        q:     String(row[2] || ''),
        crit:  String(row[3] || 'Majeure'),
        poids: String(row[4] || ''),
      };
    });
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

    // Trier les lignes de haut en bas, les mots de gauche à droite
    Object.keys(lineMap)
      .sort((a, b) => b - a)
      .forEach(y => {
        /** @type {{x: number, str: string}[]} */
        const sortedItems = lineMap[y].sort((a, b) => a.x - b.x);
        fullText += sortedItems.map(i => i.str).join('\t') + '\n';
      });
  }

  return fullText;
}

// ─────────────────────────────────────────────
// 7. NORMALISATION DES DONNÉES
// ─────────────────────────────────────────────

/**
 * Normalise un rayon brut en l'une des valeurs connues
 * (IMPORT_VALID_RAYONS), par correspondance insensible à la casse.
 * @param {string} rayon
 * @returns {string | null} Le rayon normalisé, ou null si non reconnu.
 */
function _normalizeRayon(rayon) {
  return IMPORT_VALID_RAYONS.find(r => r.toLowerCase() === rayon.toLowerCase()) || null;
}

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
 * Normalise et valide les lignes brutes parsées, construit
 * l'aperçu HTML, et active/désactive le bouton de confirmation
 * selon le nombre de lignes valides.
 * @param {ImportRawRow[]} rawRows
 * @param {string} readMessage - Message affiché dans le titre de l'aperçu (ex : nombre de lignes lues).
 * @returns {void}
 */
/**
 * Normalise et valide les lignes brutes parsées, construit
 * l'aperçu HTML, et active/désactive le bouton de confirmation
 * selon le nombre de lignes valides.
 *
 * La règle de validité dépend de `_importTarget` :
 * - cible 'grille' (FSQS) : le rayon doit être reconnu dans
 *   IMPORT_VALID_RAYONS (liste fermée, légitime pour ce référentiel).
 * - cible 'qualimetre' : aucune liste fermée n'est appliquée ; seul
 *   un intitulé non vide est requis. La zone (même absente ou
 *   inconnue) est résolue plus tard, depuis le document, par
 *   _importIntoQualimetre — jamais rejetée ici pour ce motif.
 * @param {ImportRawRow[]} rawRows
 * @param {string} readMessage - Message affiché dans le titre de l'aperçu (ex : nombre de lignes lues).
 * @returns {void}
 */
function _showImportPreview(rawRows, readMessage) {
  _importRows = [];
  /** @type {ImportParsedRow[]} */
  const previewRows = [];
  /** @type {string[]} */
  const warnings    = [];
  /** @type {boolean} */
  const isQualimetreTarget = _importTarget === 'qualimetre';

  rawRows.forEach((row, index) => {
    if (!row.rayon && !row.q) return;

    /** @type {string | null} */
    const normalizedRayon = _normalizeRayon(row.rayon);
    /** @type {GrilleCriticite} */
    const normalizedCrit  = _normalizeCrit(row.crit) || 'Majeure';
    /** @type {number} */
    const poids           = parseInt(row.poids) || IMPORT_DEFAULT_POIDS[normalizedCrit];

    /** @type {boolean} */
    const isValid = isQualimetreTarget
      ? !!row.q.trim()
      : !!normalizedRayon && !!row.q.trim();

    if (!isQualimetreTarget && !normalizedRayon) {
      warnings.push(`Ligne ${index + 2} : rayon « ${row.rayon} » non reconnu — sera ignorée`);
    }

    /** @type {ImportParsedRow} */
    const parsedRow = {
      rayon:    normalizedRayon || row.rayon,
      rayonRaw: row.rayon,
      cat:      row.cat || 'Général',
      q:        row.q.trim(),
      crit:     normalizedCrit,
      p:        poids,
      valid:    isValid,
    };

    _importRows.push(parsedRow);
    previewRows.push(parsedRow);
  });

  /** @type {number} */
  const validCount = _importRows.filter(r => r.valid).length;
  /** @type {number} */
  const skipCount  = _importRows.filter(r => !r.valid).length;

  el('imp-preview').style.display    = '';
  el('imp-preview-title').textContent = `Aperçu — ${readMessage}`;
  el('imp-stats').textContent         = `${validCount} à importer${skipCount ? ' · ' + skipCount + ' ignorées' : ''}`;

  el('imp-preview-tb').innerHTML = previewRows.map(row => _buildPreviewRow(row)).join('');

  el('imp-warnings').innerHTML = warnings.length
    ? `<div style="padding:8px;background:var(--warning-light);border-radius:var(--radius)">${warnings.slice(0, 8).join('<br>')}</div>`
    : '';

  el('imp-confirm-btn').disabled      = validCount === 0;
  el('imp-confirm-btn').style.opacity = validCount > 0 ? '1' : '.5';
  el('imp-count-btn').textContent     = validCount > 0 ? `(${validCount})` : '';
}

/**
 * Construit la ligne `<tr>` HTML d'aperçu d'une ligne importée.
 * @param {ImportParsedRow} row
 * @returns {string}
 */
function _buildPreviewRow(row) {
  /** @type {string} */
  const rayonCell = row.valid
    ? `${rIcon(row.rayon)} ${row.rayon}`
    : `<span style="color:var(--danger)">⚠ ${row.rayon}</span>`;

  /** @type {string} */
  const validCell = row.valid
    ? '<span style="color:var(--success)"><i class="ti ti-check"></i></span>'
    : '<span style="color:var(--danger)"><i class="ti ti-x"></i></span>';

  return `<tr style="background:${row.valid ? '' : '#fff8f8'}">
    <td style="padding:7px 12px;border-bottom:1px solid var(--border)">${rayonCell}</td>
    <td style="padding:7px 12px;border-bottom:1px solid var(--border)">${row.cat}</td>
    <td style="padding:7px 12px;border-bottom:1px solid var(--border);max-width:220px">
      ${row.q || '<span style="color:var(--text3);font-style:italic">vide</span>'}
    </td>
    <td style="padding:7px 12px;border-bottom:1px solid var(--border)">${critBdg(row.crit)}</td>
    <td style="padding:7px 12px;border-bottom:1px solid var(--border)">${row.p}</td>
    <td style="padding:7px 12px;border-bottom:1px solid var(--border)">${validCell}</td>
  </tr>`;
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
function confirmImport() {
  /** @type {ImportParsedRow[]} */
  const validRows = _importRows.filter(r => r.valid);

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
 * qualimetreGlobal, ou qualimetreCustom[storeId]).
 * @param {string} zoneId
 * @param {string} storeId
 * @returns {boolean}
 */
function _isZoneIdTaken(zoneId, storeId) {
  if (QM_ZONES.some(z => z.id === zoneId)) return true;
  if (DB.qualimetreGlobal && Object.prototype.hasOwnProperty.call(DB.qualimetreGlobal, zoneId)) return true;
  if (storeId && DB.qualimetreCustom?.[storeId] && Object.prototype.hasOwnProperty.call(DB.qualimetreCustom[storeId], zoneId)) return true;
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
 *    qualimetreCustom[storeId]) porte exactement ce libellé
 *    (normalisé), elle est réutilisée — ceci évite uniquement les
 *    doublons, ce n'est pas un mapping métier.
 * 3. Sinon, un nouvel id est généré depuis le libellé du document
 *    (slug déterministe). En cas de collision d'id déjà utilisé,
 *    un suffixe numérique déterministe est ajouté.
 * @param {string} rawZoneLabel - Valeur brute de la colonne zone, telle qu'écrite dans le document (ImportParsedRow.rayonRaw).
 * @param {string} storeId - Référence vers Magasin.id ; chaîne vide pour la grille globale.
 * @returns {ResolvedZone}
 */
function _resolveOrCreateZoneFromDocument(rawZoneLabel, storeId) {
  /** @type {string} */
  const trimmed = (rawZoneLabel || '').trim().replace(/\s+/g, ' ');

  if (!trimmed) {
    /** @type {string} */
    const normalizedUnclassified = _normalizeZoneLabel(IMPORT_UNCLASSIFIED_ZONE_LABEL);
    /** @type {string | null} */
    const existingUnclassified = _findExistingZoneIdByLabel(normalizedUnclassified, storeId);
    if (existingUnclassified) return { id: existingUnclassified, reused: true, isUnclassified: true };

    /** @type {string} */
    const unclassifiedId = _slugifyZoneLabel(IMPORT_UNCLASSIFIED_ZONE_LABEL);
    return { id: unclassifiedId, reused: false, isUnclassified: true };
  }

  /** @type {string} */
  const normalizedLabel = _normalizeZoneLabel(trimmed);
  /** @type {string | null} */
  const existingId = _findExistingZoneIdByLabel(normalizedLabel, storeId);
  if (existingId) return { id: existingId, reused: true, isUnclassified: false };

  /** @type {string} */
  const baseSlug = _slugifyZoneLabel(trimmed);
  /** @type {string} */
  let candidateId = baseSlug;
  /** @type {number} */
  let suffix = 2;
  while (_isZoneIdTaken(candidateId, storeId)) {
    candidateId = `${baseSlug}-${suffix}`;
    suffix++;
  }

  return { id: candidateId, reused: false, isUnclassified: false };
}

/**
 * Importe les lignes validées dans DB.qualimetreCustom, pour le
 * magasin actuellement sélectionné dans la page Qualimètre. La zone
 * cible de chaque ligne est résolue depuis la valeur brute de zone
 * du document (voir _resolveOrCreateZoneFromDocument) — jamais
 * depuis une liste de rayons FSQS ni un mapping métier figé.
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

  rows.forEach(row => {
    /** @type {ResolvedZone} */
    const zone = _resolveOrCreateZoneFromDocument(row.rayonRaw, storeId);

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
 * nom de rayon FSQS (usage standard, cohérent avec grille.js).
 * @param {ImportParsedRow[]} rows
 * @returns {void}
 */
function _importIntoGrille(rows) {
  rows.forEach(row => {
    if (!DB.grilleCustom[row.rayon]) DB.grilleCustom[row.rayon] = [];
    /** @type {GrillePoint} */
    DB.grilleCustom[row.rayon].push({
      id: 'imp-' + uid(), cat: row.cat, q: row.q, p: row.p, c: row.crit,
    });
  });

  save();
  closeModal('m-import');
  showGrille(el('grille-ray-sel').value || 'Boucherie');
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
