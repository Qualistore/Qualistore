// ══════════════════════════════════════════════════════════════
// GRILLE — Grille d'audit FSQS (personnalisation pure, sans référentiel codé en dur)
// Dépend de : storage.js (DB, CU), ui.js (el, sv, v,
//   populateRayonSelect), rayons.js (getKnownRayons, renameRayon,
//   deleteRayonEverywhere — chargé avant ce fichier), import-grille.js
//   (_escapeHtmlAttr — chargé avant ce fichier, réutilisé ici plutôt
//   que dupliqué)
// ⚠️ CHANGÉ : ne dépend plus de config.js (GRILLE_BASE_COMMUNE) — ce
// référentiel de 48 points codés en dur a été retiré de getGrille()
// (causait des doublons visuels avec les points importés ayant le
// même intitulé). Tout point de contrôle vient désormais de
// DB.grilleCustom (import ou saisie manuelle) — voir getGrille.
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

/** @type {string} Rayon actif lors de l'ouverture du modal (pour l'édition). Valeur d'amorçage arbitraire — toujours réécrite par openCtrlModal() avant utilisation réelle (fallback sur getKnownRayons()[0], pas sur cette valeur). */
let _ctrlRayonCurrent = 'Boucherie';

// ─────────────────────────────────────────────
// 3. SERVICE DONNÉES
// ─────────────────────────────────────────────

/**
 * Retourne la grille complète pour un rayon : uniquement les points
 * personnalisés/importés (DB.grilleCustom[rayon]).
 *
 * ⚠️ CHANGÉ : ne fusionne plus avec GRILLE_BASE_COMMUNE (référentiel
 * commun de 48 points codés en dur dans config.js). Cette fusion
 * causait des doublons visuels dès qu'un fichier importé contenait
 * un point déjà présent dans ce référentiel (même intitulé, deux
 * entrées affichées : une héritée de GRILLE_BASE_COMMUNE — non
 * modifiable —, une importée sous un nouvel id 'imp-...'). Tout
 * point de contrôle FSQS provient désormais exclusivement de
 * DB.grilleCustom — import ou saisie manuelle, jamais d'une liste
 * figée. Un rayon sans aucun point importé/saisi n'a plus aucun
 * point par défaut (voir showGrille, qui affiche un état vide dans
 * ce cas) ; GRILLE_BASE_COMMUNE (config.js) n'est plus référencée
 * nulle part dans le code actif — conservée dans config.js comme
 * trace historique, à supprimer définitivement si confirmé inutile
 * à long terme.
 * @param {string} rayon
 * @returns {GrillePoint[]}
 */
function getGrille(rayon) {
  return DB.grilleCustom[rayon] || [];
}

// ─────────────────────────────────────────────
// 4. RENDU DE LA PAGE
// ─────────────────────────────────────────────

/**
 * Affiche la grille d'un rayon, regroupée par catégorie. Peuple
 * d'abord le sélecteur de rayon (voir populateRayonSelect, ui.js —
 * source dynamique, plus aucune liste fixe) avant de déterminer le
 * rayon à afficher.
 *
 * NOTE : un `<select>` HTML sans option vide adopte automatiquement
 * sa première option comme valeur dès qu'il est peuplé — c'est donc
 * select.value qui porte naturellement "le premier rayon connu" une
 * fois populateRayonSelect() passé. Le fallback explicite sur
 * getKnownRayons()[0] ne joue un rôle que si #grille-ray-sel est
 * absent du DOM (ne devrait pas arriver en usage normal, mais évite
 * un crash silencieux si la page est restructurée).
 * @param {string} [rayon] - Rayon à afficher ; si omis, utilise la valeur du select tel que peuplé, sinon le premier rayon connu, sinon affiche un état vide si aucun rayon n'existe encore.
 * @returns {void}
 */
function showGrille(rayon) {
  /** @type {HTMLSelectElement | null} */
  const select = el('grille-ray-sel');
  populateRayonSelect(select, false);

  /** @type {string} */
  const resolvedRayon = rayon || (select ? select.value : '') || getKnownRayons()[0] || '';

  if (select && resolvedRayon) select.value = resolvedRayon;

  /** @type {boolean} */
  const isAdmin = CU && CU.role === 'admin';
  if (el('btn-rename-rayon')) el('btn-rename-rayon').style.display = resolvedRayon && isAdmin ? '' : 'none';
  if (el('btn-delete-rayon')) el('btn-delete-rayon').style.display = resolvedRayon && isAdmin ? '' : 'none';

  if (!resolvedRayon) {
    el('grille-ttl').textContent = '—';
    el('grille-body').innerHTML  = `<div class="tsm tm" style="padding:24px;text-align:center">Aucun rayon pour l'instant. Importez une grille ou créez un rayon pour commencer.</div>`;
    const addButton = el('btn-add-ctrl');
    if (addButton) addButton.style.display = 'none';
    return;
  }

  el('grille-ttl').textContent = resolvedRayon;

  const addButton = el('btn-add-ctrl');
  if (addButton) addButton.style.display = isAdmin ? '' : 'none';

  /** @type {GrillePoint[]} */
  const allPoints  = getGrille(resolvedRayon);

  if (!allPoints.length) {
    /** @type {string} */
    const helpText = isAdmin
      ? 'Utilisez « Importer » ou « Ajouter un point » pour commencer.'
      : 'Les points seront ajoutés par l\'administrateur.';
    el('grille-body').innerHTML = `<div class="tsm tm" style="padding:24px;text-align:center">Aucun point de contrôle pour ce rayon.<br>${helpText}</div>`;
    return;
  }

  /** @type {string[]} */
  const categories = [...new Set(allPoints.map(point => point.cat))];

  el('grille-body').innerHTML = categories
    .map(cat => _buildCategorySection(cat, allPoints.filter(p => p.cat === cat), resolvedRayon))
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
 * Construit la ligne HTML d'un point de contrôle. Tout point de
 * contrôle FSQS est désormais modifiable : getGrille() ne retourne
 * plus que des points custom/importés (DB.grilleCustom), il n'existe
 * plus de référentiel de base non modifiable à distinguer — voir
 * getGrille. Le badge "Personnalisé" et le fond violet, devenus
 * systématiques pour tout point, sont retirés (ils n'apportaient
 * plus d'information utile).
 * @param {GrillePoint} point
 * @param {string} rayon
 * @returns {string}
 */
function _buildPointRow(point, rayon) {
  /** @type {boolean} */
  const isAdmin = CU && CU.role === 'admin';

  return `<div style="display:flex;align-items:flex-start;gap:12px;padding:12px 20px;border-bottom:1px solid var(--border)">
    <div style="flex:1">
      <div style="font-size:13px">
        ${point.q}
      </div>
      ${point.prec ? `<div style="font-size:11px;color:var(--text2);margin-top:3px;font-style:italic">${point.prec}</div>` : ''}
    </div>
    <div style="display:flex;gap:8px;align-items:center;flex-shrink:0">
      ${critBdg(point.c)}
      <span class="tsm tm" style="white-space:nowrap">Poids : <strong>${point.p}</strong></span>
      ${isAdmin ? _buildPointActions(rayon, point.id) : ''}
    </div>
  </div>`;
}

/**
 * Construit les boutons d'action (modifier/supprimer) pour un point
 * de contrôle, réservés aux administrateurs.
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
 * Peuple #ctrl-rayon-cbs (modale point de contrôle) avec une case à
 * cocher par rayon connu (getKnownRayons, rayons.js). Remplace
 * l'ancienne liste de 10 `<input type="checkbox">` codée en dur dans
 * le HTML, qui était de toute façon désynchronisée des autres listes
 * de rayons du projet (7 valeurs ailleurs).
 * @returns {void}
 */
function _buildCtrlRayonCheckboxes() {
  el('ctrl-rayon-cbs').innerHTML = getKnownRayons().map(rayon =>
    `<label class="cb-item"><input type="checkbox" class="ctrl-ray-cb" value="${_escapeHtmlAttr(rayon)}"> ${rayon}</label>`
  ).join('');
}

/**
 * Ouvre la modale de création/édition d'un point de contrôle
 * personnalisé. Mémorise le rayon courant dans _ctrlRayonCurrent
 * (utilisé par saveCtrl() pour décider mise à jour vs duplication).
 * Peuple d'abord les cases à cocher de rayon (voir
 * _buildCtrlRayonCheckboxes) depuis getKnownRayons() — plus aucune
 * liste fixe.
 * @param {string} [rayon] - Rayon d'origine ; retombe sur le select de rayon affiché, puis le premier rayon connu (getKnownRayons).
 * @param {string} [pointId] - Référence vers GrillePoint.id à éditer ; absent/falsy pour une création.
 * @returns {void}
 */
function openCtrlModal(rayon, pointId) {
  _ctrlRayonCurrent = rayon || (el('grille-ray-sel') ? el('grille-ray-sel').value : '') || getKnownRayons()[0] || '';
  /** @type {boolean} */
  const isEdit = !!pointId;

  el('m-ctrl-ttl').innerHTML = isEdit
    ? '<i class="ti ti-pencil" style="color:var(--primary)"></i> Modifier le point de contrôle'
    : '<i class="ti ti-list-check" style="color:var(--primary)"></i> Nouveau point de contrôle';

  el('ctrl-err').classList.remove('show');
  sv('ctrl-id', pointId || '');

  _buildCtrlRayonCheckboxes();

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

// ─────────────────────────────────────────────
// 9. GESTION DU RAYON (créer / renommer / supprimer)
// ─────────────────────────────────────────────
// Le nom d'un rayon n'est jamais figé (voir rayons.js,
// getKnownRayons/renameRayon/createRayon/deleteRayonEverywhere) — ces
// fonctions sont les points d'entrée UI correspondants, déclenchés
// depuis la page Grille (Qualistore.html).

/**
 * Ouvre une invite de saisie pour créer un nouveau rayon vide (voir
 * createRayon, rayons.js), puis bascule l'affichage sur ce rayon.
 * @returns {void}
 */
function openCreateRayonPrompt() {
  /** @type {string | null} */
  const name = prompt('Nom du nouveau rayon :');
  if (name === null) return;

  /** @type {boolean} */
  const created = createRayon(name);
  if (!created) {
    alert(name.trim() ? `Le rayon « ${name.trim()} » existe déjà.` : 'Le nom du rayon ne peut pas être vide.');
    return;
  }

  save();
  showGrille(name.trim());
}

/**
 * Ouvre une invite de saisie pour renommer le rayon actuellement
 * affiché (voir renameRayon, rayons.js), pré-remplie avec le nom
 * actuel. Migre toutes les références existantes (grilleCustom,
 * audits, drafts) — voir la documentation de renameRayon.
 * @returns {void}
 */
function openRenameRayonPrompt() {
  /** @type {string} */
  const currentRayon = el('grille-ray-sel') ? el('grille-ray-sel').value : '';
  if (!currentRayon) return;

  /** @type {string | null} */
  const newName = prompt('Nouveau nom du rayon :', currentRayon);
  if (newName === null) return;

  /** @type {{ok: boolean, error?: string}} */
  const result = renameRayon(currentRayon, newName);
  if (!result.ok) {
    if (result.error) alert(result.error);
    return;
  }

  save();
  showGrille(newName.trim());
}

/**
 * Supprime le rayon actuellement affiché ainsi que TOUTES ses
 * données (points personnalisés, audits, NC/actions liées,
 * brouillons — voir deleteRayonEverywhere, rayons.js), après une
 * double confirmation explicite étant donné le caractère destructif
 * et irréversible de l'action.
 * @returns {void}
 */
function confirmDeleteRayon() {
  /** @type {string} */
  const currentRayon = el('grille-ray-sel') ? el('grille-ray-sel').value : '';
  if (!currentRayon) return;

  /** @type {number} */
  const auditCount = DB.audits.filter(a => a.rayon === currentRayon).length;
  /** @type {string} */
  const warning = auditCount
    ? `Supprimer le rayon « ${currentRayon} » ? ${auditCount} audit(s) et toutes les données associées (NC, actions correctives) seront définitivement supprimés.`
    : `Supprimer le rayon « ${currentRayon} » et ses points personnalisés ?`;

  if (!confirm(warning)) return;
  if (auditCount && !confirm('Cette action est IRRÉVERSIBLE. Confirmer la suppression définitive ?')) return;

  deleteRayonEverywhere(currentRayon);
  save();
  showGrille();
}
