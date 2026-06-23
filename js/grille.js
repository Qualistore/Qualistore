// ══════════════════════════════════════════════════════════════
// GRILLE — Grille d'audit FSQS (référentiel + personnalisation)
// Dépend de : storage.js (DB, CU), config.js (GRILLE_BASE_COMMUNE), ui.js
// ══════════════════════════════════════════════════════════════

// ─────────────────────────────────────────────
// 0. TYPEDEFS JSDoc (pour inférence VSCode / TypeScript)
//    ⚠️ Déduits de l'usage dans ce fichier (cohérent avec config.js).
//
//    ✅ CONFIRMATION : DEFAULT_POIDS ci-dessous valide définitivement
//    que GrilleCriticite a 3 valeurs ('Critique'|'Majeure'|'Mineure'),
//    comme corrigé dans config.js suite à l'incohérence détectée via nc.js.
// ─────────────────────────────────────────────

/**
 * Niveau de criticité d'un point de contrôle (voir config.js pour la
 * définition canonique).
 * @typedef {'Critique'|'Majeure'|'Mineure'} GrilleCriticite
 */

/**
 * Point de contrôle de grille d'audit FSQS, qu'il provienne du
 * référentiel de base (GRILLE_BASE_COMMUNE, voir config.js) ou
 * d'une personnalisation (DB.grilleCustom). Les points personnalisés
 * ont un id préfixé 'cust-', mais cette convention n'est pas utilisée
 * pour la détection de personnalisation (voir _buildPointRow, qui
 * compare plutôt l'appartenance à GRILLE_BASE_COMMUNE).
 * @typedef {Object} GrillePoint
 * @property {string} id
 * @property {string} cat - Catégorie complète, format "Section – Sous-catégorie" (ex : 'Stockage – Equipement'). La sous-catégorie est optionnelle.
 * @property {string} q - Intitulé du point de contrôle.
 * @property {string} prec - Précision/exemple additionnel, chaîne vide si absent.
 * @property {number} p - Poids/pondération.
 * @property {GrilleCriticite} c - Niveau de criticité.
 */

/**
 * Dictionnaire des points de grille personnalisés, indexé par nom
 * de rayon (ex : 'Boucherie').
 * @typedef {Record<string, GrillePoint[]>} GrilleCustomMap
 */

// ─────────────────────────────────────────────
// 1. CONSTANTES
// ─────────────────────────────────────────────

/**
 * Poids par défaut selon la criticité (utilisé si non renseigné).
 * @type {Record<GrilleCriticite, number>}
 */
const DEFAULT_POIDS = { Critique: 10, Majeure: 5, Mineure: 2 };

/**
 * Sections disponibles dans le formulaire de point de contrôle.
 * @type {string[]}
 */
const CTRL_SECTIONS = ['Stockage', 'Vente trad.', 'Libre-service'];

// ─────────────────────────────────────────────
// 2. ÉTAT
// ─────────────────────────────────────────────

/** @type {string} Rayon actif lors de l'ouverture du modal (pour l'édition). */
let _ctrlRayonCurrent = 'Boucherie';

// ─────────────────────────────────────────────
// 3. SERVICE DONNÉES
// ─────────────────────────────────────────────

/**
 * Retourne la grille complète pour un rayon :
 * référentiel de base + points personnalisés.
 */
/**
 * Retourne la grille complète pour un rayon :
 * référentiel de base + points personnalisés.
 * @param {string} rayon
 * @returns {GrillePoint[]}
 */
function getGrille(rayon) {
  /** @type {GrillePoint[]} */
  const customPoints = DB.grilleCustom[rayon] || [];
  return [...GRILLE_BASE_COMMUNE, ...customPoints];
}

// ─────────────────────────────────────────────
// 4. RENDU DE LA PAGE
// ─────────────────────────────────────────────

/**
 * Affiche la grille d'un rayon, regroupée par catégorie.
 * @param {string} rayon
 * @returns {void}
 */
function showGrille(rayon) {
  el('grille-ttl').textContent = rayon;

  const addButton = el('btn-add-ctrl');
  if (addButton) addButton.style.display = (CU && CU.role === 'admin') ? '' : 'none';

  /** @type {GrillePoint[]} */
  const allPoints  = getGrille(rayon);
  /** @type {string[]} */
  const categories = [...new Set(allPoints.map(point => point.cat))];

  el('grille-body').innerHTML = categories
    .map(cat => _buildCategorySection(cat, allPoints.filter(p => p.cat === cat), rayon))
    .join('');
}

// ─────────────────────────────────────────────
// 5. HELPERS DE RENDU
// ─────────────────────────────────────────────

/**
 * Construit la section HTML d'une catégorie (en-tête + lignes de points).
 * @param {string} category - Nom complet de la catégorie (GrillePoint.cat).
 * @param {GrillePoint[]} points - Points appartenant à cette catégorie.
 * @param {string} rayon
 * @returns {string}
 */
function _buildCategorySection(category, points, rayon) {
  return `<div>
    <div style="padding:10px 20px;background:var(--bg);font-size:11px;font-weight:600;color:var(--text2);text-transform:uppercase;letter-spacing:.5px;border-bottom:1px solid var(--border)">
      ${category}
    </div>
    ${points.map(point => _buildPointRow(point, rayon)).join('')}
  </div>`;
}

/**
 * Construit la ligne HTML d'un point de contrôle. Un point est
 * considéré "personnalisé" s'il n'appartient pas au référentiel de
 * base GRILLE_BASE_COMMUNE (détection structurelle par id, pas par
 * préfixe de chaîne).
 * @param {GrillePoint} point
 * @param {string} rayon
 * @returns {string}
 */
function _buildPointRow(point, rayon) {
  /** @type {boolean} */
  const isCustom = !GRILLE_BASE_COMMUNE.find(base => base.id === point.id);
  /** @type {boolean} */
  const isAdmin  = CU && CU.role === 'admin';

  return `<div style="display:flex;align-items:flex-start;gap:12px;padding:12px 20px;border-bottom:1px solid var(--border)${isCustom ? ';background:#f8f0ff' : ''}">
    <div style="flex:1">
      <div style="font-size:13px">
        ${point.q}
        ${isCustom ? `<span class="badge" style="background:#ede9fe;color:#5b21b6;margin-left:4px">Personnalisé</span>` : ''}
      </div>
      ${point.prec ? `<div style="font-size:11px;color:var(--text2);margin-top:3px;font-style:italic">${point.prec}</div>` : ''}
    </div>
    <div style="display:flex;gap:8px;align-items:center;flex-shrink:0">
      ${critBdg(point.c)}
      <span class="tsm tm" style="white-space:nowrap">Poids : <strong>${point.p}</strong></span>
      ${isCustom && isAdmin ? _buildPointActions(rayon, point.id) : ''}
    </div>
  </div>`;
}

/**
 * Construit les boutons d'action (modifier/supprimer) pour un point
 * personnalisé, réservés aux administrateurs.
 * @param {string} rayon
 * @param {string} pointId - Référence vers GrillePoint.id.
 * @returns {string}
 */
function _buildPointActions(rayon, pointId) {
  return `<button class="btn btn-secondary btn-sm" onclick="openCtrlModal('${rayon}','${pointId}')" aria-label="Modifier">
    <i class="ti ti-pencil"></i>
  </button>
  <button class="btn btn-danger btn-sm" onclick="delCtrl('${rayon}','${pointId}')" aria-label="Supprimer">
    <i class="ti ti-trash"></i>
  </button>`;
}

// ─────────────────────────────────────────────
// 6. MODAL CRÉATION / ÉDITION
// ─────────────────────────────────────────────

/**
 * Ouvre la modale de création/édition d'un point de contrôle
 * personnalisé. Mémorise le rayon courant dans _ctrlRayonCurrent
 * (utilisé par saveCtrl() pour décider mise à jour vs duplication).
 * @param {string} [rayon] - Rayon d'origine ; retombe sur le select de rayon affiché, puis 'Boucherie'.
 * @param {string} [pointId] - Référence vers GrillePoint.id à éditer ; absent/falsy pour une création.
 * @returns {void}
 */
function openCtrlModal(rayon, pointId) {
  _ctrlRayonCurrent = rayon || el('grille-ray-sel').value || 'Boucherie';
  /** @type {boolean} */
  const isEdit = !!pointId;

  el('m-ctrl-ttl').innerHTML = isEdit
    ? '<i class="ti ti-pencil" style="color:var(--primary)"></i> Modifier le point de contrôle'
    : '<i class="ti ti-list-check" style="color:var(--primary)"></i> Nouveau point de contrôle';

  el('ctrl-err').classList.remove('show');
  sv('ctrl-id', pointId || '');

  // Cocher le rayon courant par défaut
  document.querySelectorAll('.ctrl-ray-cb').forEach(cb => {
    cb.checked = cb.value === _ctrlRayonCurrent;
  });

  if (isEdit) {
    _populateCtrlForm(rayon, pointId);
  } else {
    _resetCtrlForm();
  }

  openModal('m-ctrl');
}

/**
 * Pré-remplit le formulaire avec les données d'un point de contrôle
 * personnalisé existant. Sans effet si le point n'est pas trouvé
 * dans DB.grilleCustom[rayon] (les points du référentiel de base ne
 * sont pas éditables).
 * @param {string} rayon
 * @param {string} pointId - Référence vers GrillePoint.id.
 * @returns {void}
 */
function _populateCtrlForm(rayon, pointId) {
  /** @type {GrillePoint | undefined} */
  const point = (DB.grilleCustom[rayon] || []).find(p => p.id === pointId);
  if (!point) return;

  sv('ctrl-q',    point.q);
  sv('ctrl-cat',  point.cat || '');
  sv('ctrl-prec', point.prec || '');
  sv('ctrl-poids', point.p);
  el('ctrl-crit').value = point.c;

  // Déduire la section depuis la catégorie (format "Section – Sous-catégorie")
  /** @type {string} */
  const section = point.cat ? point.cat.split(' – ')[0] : 'Stockage';
  el('ctrl-section').value = CTRL_SECTIONS.includes(section) ? section : 'Stockage';
}

/**
 * Réinitialise le formulaire de point de contrôle pour une création.
 * @returns {void}
 */
function _resetCtrlForm() {
  sv('ctrl-q', '');
  sv('ctrl-cat', '');
  sv('ctrl-prec', '');
  sv('ctrl-poids', '');
  el('ctrl-crit').value    = 'Majeure';
  el('ctrl-section').value = 'Stockage';
}

// ─────────────────────────────────────────────
// 7. SAUVEGARDE
// ─────────────────────────────────────────────

/**
 * Valide et sauvegarde le formulaire de point de contrôle
 * personnalisé, pour un ou plusieurs rayons sélectionnés.
 *
 * Comportement subtil : si `existingId` est renseigné (édition),
 * SEUL le rayon `_ctrlRayonCurrent` (rayon d'origine du point édité)
 * reçoit une mise à jour in-place. Pour tout autre rayon
 * sélectionné dans `selectedRayons`, un NOUVEAU point personnalisé
 * est créé (nouvel id `cust-...`) — il n'y a pas de duplication par
 * référence d'un même point vers plusieurs rayons.
 * @returns {void}
 */
function saveCtrl() {
  /** @type {string[]} */
  const selectedRayons = [...document.querySelectorAll('.ctrl-ray-cb:checked')].map(cb => cb.value);
  /** @type {string} */
  const intitule       = v('ctrl-q').trim();
  /** @type {string} */
  const sousCategorie  = v('ctrl-cat').trim();
  /** @type {string} */
  const precision      = v('ctrl-prec').trim();
  /** @type {string} */
  const section        = el('ctrl-section').value;
  /** @type {GrilleCriticite} */
  const criticite      = el('ctrl-crit').value;
  /** @type {string} */
  const fullCategory   = section + (sousCategorie ? ' – ' + sousCategorie : '');
  /** @type {number} */
  const poids          = parseInt(v('ctrl-poids')) || DEFAULT_POIDS[criticite];
  /** @type {string} */
  const existingId     = v('ctrl-id');
  const errorEl        = el('ctrl-err');

  if (!intitule) {
    errorEl.textContent = 'L\'intitulé est requis.';
    errorEl.classList.add('show');
    return;
  }
  if (!selectedRayons.length) {
    errorEl.textContent = 'Sélectionnez au moins un rayon.';
    errorEl.classList.add('show');
    return;
  }

  selectedRayons.forEach(rayon => {
    if (!DB.grilleCustom[rayon]) DB.grilleCustom[rayon] = [];

    if (existingId && rayon === _ctrlRayonCurrent) {
      // Mise à jour du point existant
      /** @type {number} */
      const index = DB.grilleCustom[rayon].findIndex(p => p.id === existingId);
      if (index >= 0) {
        /** @type {GrillePoint} */
        DB.grilleCustom[rayon][index] = {
          id: existingId, cat: fullCategory, q: intitule, p: poids, c: criticite, prec: precision,
        };
      }
    } else {
      // Nouveau point
      /** @type {GrillePoint} */
      DB.grilleCustom[rayon].push({
        id: 'cust-' + uid(), cat: fullCategory, q: intitule, p: poids, c: criticite, prec: precision,
      });
    }
  });

  save();
  closeModal('m-ctrl');
  showGrille(el('grille-ray-sel').value || _ctrlRayonCurrent);
}

// ─────────────────────────────────────────────
// 8. SUPPRESSION
// ─────────────────────────────────────────────

/**
 * Supprime un point de contrôle personnalisé d'un rayon, après
 * confirmation. Sans effet sur les points du référentiel de base
 * (non supprimables par cette fonction).
 * @param {string} rayon
 * @param {string} pointId - Référence vers GrillePoint.id.
 * @returns {void}
 */
function delCtrl(rayon, pointId) {
  if (!confirm('Supprimer ce point de contrôle personnalisé ?')) return;
  DB.grilleCustom[rayon] = (DB.grilleCustom[rayon] || []).filter(p => p.id !== pointId);
  save();
  showGrille(rayon);
}
