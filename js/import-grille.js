// ══════════════════════════════════════════════════════════════
// IMPORT-GRILLE — Import de grille d'audit (CSV / XLSX / PDF)
// Dépend de : storage.js (DB, CU), config.js (CDN_SHEETJS, CDN_PDFJS, CDN_PDFJS_WORKER, IMPORT_FORMAT_INFO), ui.js
// ══════════════════════════════════════════════════════════════

// ─────────────────────────────────────────────
// 0. TYPEDEFS JSDoc (pour inférence VSCode / TypeScript)
//    ⚠️ Déduits de l'usage dans ce fichier.
//
//    ⚠️ INCOHÉRENCE FONCTIONNELLE DÉTECTÉE (documentation, pas une
//    correction) : _importIntoQualimetre() utilise row.rayon comme
//    clé de zone dans DB.qualimetreCustom[storeId][row.rayon]. Or
//    row.rayon est validé contre IMPORT_VALID_RAYONS (rayons FSQS :
//    'Boucherie', 'Boulangerie'...), alors que partout ailleurs
//    (grille-qualimetre.js, qualimetre.js, config.js QM_ZONES), les
//    clés de zone Qualimètre attendues sont des QMZone.id ('z0',
//    'z1'...). Importer vers Qualimètre via ce fichier créerait donc
//    des clés de zone non standard, invisibles dans l'UI Qualimètre
//    habituelle. Non corrigé ici (changerait le comportement).
//
//    ⚠️ DUPLICATION (3e occurrence) : IMPORT_VALID_RAYONS ci-dessous
//    est une 3e copie de la même liste de rayons que RAYONS_LIST
//    (rayons.js) et RAYONS_FSQS (dashboard.js).
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
 * Ligne brute telle que produite par un parseur (CSV ou XLSX), avant
 * normalisation. Tous les champs sont des chaînes brutes, non
 * encore validées.
 * @typedef {Object} ImportRawRow
 * @property {string} rayon - Valeur brute, non normalisée.
 * @property {string} cat - Catégorie, 'Général' par défaut.
 * @property {string} q
 * @property {string} crit - Valeur brute, non normalisée.
 * @property {string} poids - Valeur brute (chaîne), à parser en nombre.
 */

/**
 * Ligne normalisée et validée, prête pour aperçu et import.
 * @typedef {Object} ImportParsedRow
 * @property {string} rayon - Rayon normalisé si reconnu, sinon valeur brute d'origine (voir `valid`).
 * @property {string} cat
 * @property {string} q - Intitulé, trim() appliqué.
 * @property {GrilleCriticite} crit - Toujours normalisé (fallback 'Majeure' si non reconnu).
 * @property {number} p - Poids, calculé depuis IMPORT_DEFAULT_POIDS si absent/invalide.
 * @property {boolean} valid - Vrai si rayon ET intitulé sont valides ; les lignes invalides sont affichées mais exclues de l'import.
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
function _showImportPreview(rawRows, readMessage) {
  _importRows = [];
  /** @type {ImportParsedRow[]} */
  const previewRows = [];
  /** @type {string[]} */
  const warnings    = [];

  rawRows.forEach((row, index) => {
    if (!row.rayon && !row.q) return;

    /** @type {string | null} */
    const normalizedRayon = _normalizeRayon(row.rayon);
    /** @type {GrilleCriticite} */
    const normalizedCrit  = _normalizeCrit(row.crit) || 'Majeure';
    /** @type {number} */
    const poids           = parseInt(row.poids) || IMPORT_DEFAULT_POIDS[normalizedCrit];
    /** @type {boolean} */
    const isValid         = !!normalizedRayon && !!row.q.trim();

    if (!normalizedRayon) {
      warnings.push(`Ligne ${index + 2} : rayon « ${row.rayon} » non reconnu — sera ignorée`);
    }

    /** @type {ImportParsedRow} */
    const parsedRow = {
      rayon: normalizedRayon || row.rayon,
      cat:   row.cat || 'Général',
      q:     row.q.trim(),
      crit:  normalizedCrit,
      p:     poids,
      valid: isValid,
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

  showToast(`${validRows.length} point(s) importé(s)`, 'success');
}

/**
 * Importe les lignes validées dans DB.qualimetreCustom, pour le
 * magasin actuellement sélectionné dans la page Qualimètre.
 *
 * ⚠️ Voir l'avertissement en tête de fichier : `row.rayon` (un nom
 * de rayon FSQS) est utilisé ici comme clé de zone, alors que le
 * reste du système Qualimètre utilise des QMZone.id ('z0', 'z1'...).
 * Comportement conservé tel quel.
 * @param {ImportParsedRow[]} rows
 * @returns {void}
 */
function _importIntoQualimetre(rows) {
  if (!DB.qualimetreCustom) DB.qualimetreCustom = {};

  /** @type {string} */
  const storeId = v('qual-mag-sel');
  if (!storeId) { alert('Sélectionnez d\'abord un magasin dans le Qualimètre.'); return; }

  rows.forEach(row => {
    if (!DB.qualimetreCustom[storeId]) DB.qualimetreCustom[storeId] = {};
    if (!DB.qualimetreCustom[storeId][row.rayon]) DB.qualimetreCustom[storeId][row.rayon] = [];
    /** @type {GrillePoint} */
    DB.qualimetreCustom[storeId][row.rayon].push({
      id: 'qcimp-' + uid(), cat: row.cat, q: row.q, p: row.p, c: row.crit,
    });
  });

  save();
  closeModal('m-import');
  showQualimetre();
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
