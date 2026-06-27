// ══════════════════════════════════════════════════════════════
// GRILLE — Grille d'audit FSQS (personnalisation pure, sans référentiel codé en dur)
// Dépend de : storage.js (DB, CU), ui.js (el, sv, v,
//   populateRayonSelect), rayons.js (getKnownRayons, renameRayon,
//   deleteRayonEverywhere, getZonesForRayon, renameGrilleZone,
//   IMPORT_UNCLASSIFIED_ZONE_LABEL_GRILLE — chargé avant ce fichier),
//   import-grille.js (_escapeHtmlAttr — chargé avant ce fichier,
//   réutilisé ici plutôt que dupliqué)
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
 * ⚠️ CHANGÉ : CTRL_SECTIONS n'est plus utilisée. Les zones (sous-
 * partie d'un rayon — voir le typedef GrillePoint.zone, config.js)
 * sont désormais dynamiques et propres à chaque rayon — voir
 * getZonesForRayon/renameGrilleZone (rayons.js) et
 * _buildCtrlZoneSelect (ci-dessous). Conservée à titre de trace
 * historique ; à supprimer si confirmé inutile à long terme.
 * @type {string[]}
 * @deprecated Utiliser getZonesForRayon(rayon) (rayons.js).
 */
const CTRL_SECTIONS = ['Stockage', 'Vente trad.', 'Libre-service'];

// ─────────────────────────────────────────────
// 2. ÉTAT
// ─────────────────────────────────────────────

/** @type {string} Rayon actif lors de l'ouverture du modal (pour l'édition). Valeur d'amorçage arbitraire — toujours réécrite par openCtrlModal() avant utilisation réelle (fallback sur getKnownRayons()[0], pas sur cette valeur). */
let _ctrlRayonCurrent = 'Boucherie';

/** @type {string} Magasin actif lors de l'ouverture du modal (pour l'édition) — chaîne vide = grille commune (DB.grilleCustom), sinon référence vers Magasin.id (DB.grilleCustomByStore). Toujours réécrite par openCtrlModal() avant utilisation réelle. */
let _ctrlStoreCurrent = '';

/** @type {string} Enseigne active lors de l'ouverture du modal (pour la grille commune, quand _ctrlStoreCurrent est vide) — toujours réécrite par openCtrlModal() avant utilisation réelle. Vide ou '__sans_enseigne__' = pas de grille commune accessible (voir getGrille). */
let _ctrlEnseigneCurrent = '';

/** @type {string} Rayon actuellement affiché dans la vue détail de la page Grilles (voir showRayonDetail) — chaîne vide si la vue cartes est affichée (aucun rayon "actif" dans ce cas). Remplace l'ancien select #grille-ray-sel, retiré au profit de la vue en cartes — voir showGrilleCardsView. */
let _currentGrilleRayon = '';

// ─────────────────────────────────────────────
// 3. SERVICE DONNÉES
// ─────────────────────────────────────────────

/**
 * Retourne la grille de points de contrôle d'un rayon.
 *
 * ⚠️ CHANGÉ : la grille commune (DB.grilleCustom) est désormais
 * propre à chaque ENSEIGNE — plus une grille unique partagée par
 * toute la base. Résolution à trois niveaux :
 * 1. Si storeId est fourni ET que ce magasin a au moins un point
 *    personnalisé pour ce rayon (DB.grilleCustomByStore[storeId][rayon]),
 *    on retourne UNIQUEMENT ces points (pas de fusion avec la grille
 *    commune de l'enseigne).
 * 2. Sinon, si le magasin a une enseigne renseignée, on retombe sur
 *    la grille commune de CETTE enseigne (DB.grilleCustom[enseigne][rayon]).
 * 3. Un magasin SANS enseigne renseignée n'a accès à aucune grille
 *    commune — uniquement à sa grille personnalisée (cas 1) si elle
 *    existe, sinon tableau vide. Choix délibéré : pas de filet de
 *    secours implicite vers une grille "par défaut" non rattachée à
 *    une enseigne précise.
 *
 * Pour la page Grilles (édition, pas un magasin précis mais une
 * enseigne choisie directement), voir le paramètre enseigne.
 *
 * Plus aucune fusion avec GRILLE_BASE_COMMUNE (référentiel commun de
 * 48 points codés en dur dans config.js, retiré précédemment) — tout
 * point de contrôle FSQS provient exclusivement de DB.grilleCustom
 * et/ou DB.grilleCustomByStore, import ou saisie manuelle.
 * @param {string} rayon
 * @param {string} [storeId] - Référence vers Magasin.id ; omis ou vide = pas de grille personnalisée à considérer (cas 1 sauté).
 * @param {string} [enseigne] - Enseigne explicite à utiliser pour la grille commune (cas 2) ; si omis et storeId fourni, déduite de Magasin.enseigne. Permet à la page Grilles (édition par enseigne choisie directement, sans magasin précis) de fonctionner sans storeId.
 * @returns {GrillePoint[]}
 */
function getGrille(rayon, storeId, enseigne) {
  if (storeId) {
    /** @type {GrillePoint[]} */
    const storePoints = DB.grilleCustomByStore?.[storeId]?.[rayon] || [];
    if (storePoints.length) return storePoints;
  }

  /** @type {string} */
  const resolvedEnseigne = enseigne || (storeId ? (DB.magasins.find(m => m.id === storeId)?.enseigne || '') : '');
  if (!resolvedEnseigne) return [];
  return DB.grilleCustom[resolvedEnseigne]?.[rayon] || [];
}

// ─────────────────────────────────────────────
// 4. RENDU DE LA PAGE
// ─────────────────────────────────────────────

/**
 * Affiche la vue "cartes" de la page Grilles : une carte par rayon
 * connu (getKnownRayons), avec le nombre de points de contrôle dans
 * le scope actuellement sélectionné (grille commune ou magasin
 * précis — voir #grille-mag-sel). Cliquer sur une carte ouvre la vue
 * détail de ce rayon (voir showRayonDetail).
 *
 * ⚠️ CHANGÉ : remplace l'ancien select #grille-ray-sel (toujours un
 * rayon affiché par défaut) — la page Grilles s'ouvre désormais sur
 * cette vue d'ensemble, plus lisible pour visualiser/comparer le
 * contenu de tous les rayons d'un coup d'œil. Réinitialise
 * _currentGrilleRayon (aucun rayon "actif" tant qu'on est sur cette
 * vue).
 * @returns {void}
 */
/**
 * Repeuple #grille-mag-sel selon l'enseigne choisie dans
 * #grille-enseigne-sel — ne propose que les magasins de cette
 * enseigne (ou les magasins sans enseigne si "Sans enseigne" est
 * choisi). Déclenchée par le `onchange` de #grille-enseigne-sel.
 * @returns {void}
 */
function _onGrilleEnseigneChanged() {
  /** @type {string} */
  const enseigne = el('grille-enseigne-sel') ? el('grille-enseigne-sel').value : '';
  /** @type {HTMLSelectElement | null} */
  const magSelect = el('grille-mag-sel');
  if (magSelect) {
    /** @type {Magasin[]} */
    const stores = enseigne === '__sans_enseigne__'
      ? DB.magasins.filter(m => !m.enseigne)
      : DB.magasins.filter(m => m.enseigne === enseigne);
    magSelect.innerHTML = '<option value="">Grille commune de l\'enseigne</option>' +
      stores.map(m => `<option value="${m.id}">${_escapeHtmlAttr(m.nom)}</option>`).join('');
  }
  showGrilleCardsView();
}

/**
 * Affiche la vue "cartes" de la page Grilles : une carte par rayon
 * connu (getKnownRayons), avec le nombre de points de contrôle dans
 * le scope actuellement sélectionné (enseigne + magasin optionnel —
 * voir #grille-enseigne-sel/#grille-mag-sel). Cliquer sur une carte
 * ouvre la vue détail de ce rayon (voir showRayonDetail).
 *
 * ⚠️ CHANGÉ : la grille commune (DB.grilleCustom) est désormais
 * propre à chaque enseigne — il faut choisir une enseigne pour voir
 * une grille commune. Réinitialise _currentGrilleRayon (aucun rayon
 * "actif" tant qu'on est sur cette vue).
 * @returns {void}
 */
function showGrilleCardsView() {
  _currentGrilleRayon = '';

  /** @type {HTMLSelectElement | null} */
  const enseigneSelect = el('grille-enseigne-sel');
  if (enseigneSelect) {
    /** @type {string} */
    const currentValue = enseigneSelect.value;
    enseigneSelect.innerHTML = '<option value="">Sélectionner une enseigne...</option>' +
      getKnownEnseignes().map(e => `<option value="${_escapeHtmlAttr(e)}">${e}</option>`).join('') +
      '<option value="__sans_enseigne__">— Sans enseigne —</option>';
    if (currentValue && [...enseigneSelect.options].some(o => o.value === currentValue)) {
      enseigneSelect.value = currentValue;
    }
  }

  /** @type {string} */
  const enseigne = el('grille-enseigne-sel') ? el('grille-enseigne-sel').value : '';
  /** @type {string} */
  const storeId  = el('grille-mag-sel') ? el('grille-mag-sel').value : '';

  _updateGrilleScopeLabel(enseigne, storeId);

  el('grille-detail-view').style.display = 'none';
  el('grille-cards-view').style.display  = '';

  /** @type {string[]} */
  const rayons = getKnownRayons();

  if (!rayons.length) {
    el('grille-cards-grid').innerHTML   = '';
    el('grille-cards-empty').style.display = '';
    return;
  }

  el('grille-cards-empty').style.display = 'none';
  el('grille-cards-grid').innerHTML = rayons
    .map(rayon => _buildRayonCard(rayon, storeId, enseigne))
    .join('');
}

/**
 * Construit la carte HTML d'un rayon pour la vue cartes — affiche le
 * nombre de points de contrôle dans le scope actuel (voir getGrille)
 * et le nombre de zones distinctes. Cliquer sur la carte ouvre la
 * vue détail (showRayonDetail).
 * @param {string} rayon
 * @param {string} storeId - Référence vers Magasin.id ; chaîne vide = grille commune de l'enseigne.
 * @param {string} enseigne - Enseigne sélectionnée (ou '__sans_enseigne__') ; ignorée si storeId est fourni (déduite du magasin dans ce cas par getGrille).
 * @returns {string}
 */
function _buildRayonCard(rayon, storeId, enseigne) {
  /** @type {string} */
  const enseigneArg = enseigne === '__sans_enseigne__' ? '' : enseigne;
  /** @type {GrillePoint[]} */
  const points = getGrille(rayon, storeId, enseigneArg);
  /** @type {number} */
  const zoneCount = getZonesForRayon(rayon, storeId).length;

  return `<div class="card rayon-card" onclick="showRayonDetail('${_escapeHtmlAttr(rayon)}')" style="cursor:pointer">
    <div class="card-body" style="text-align:center;padding:24px 16px">
      <i class="ti ti-list-check" style="font-size:28px;color:var(--primary);margin-bottom:10px;display:block"></i>
      <div style="font-size:15px;font-weight:600;margin-bottom:8px">${rayon}</div>
      <div style="font-size:24px;font-weight:700;color:${points.length ? 'var(--text)' : 'var(--text3)'}">${points.length}</div>
      <div class="tsm tm">point(s) de contrôle</div>
      ${zoneCount ? `<div class="tsm tm" style="margin-top:6px">${zoneCount} zone(s)</div>` : ''}
    </div>
  </div>`;
}

/**
 * Affiche la vue détail d'un rayon (liste des zones/catégories/
 * points de contrôle, regroupée — voir _buildZoneSection), dans le
 * scope actuellement sélectionné (enseigne + magasin optionnel).
 * @param {string} [rayon] - Rayon à afficher ; si omis, retombe sur _currentGrilleRayon (rayon déjà actif — utile pour rafraîchir la vue après une action sans changer de rayon).
 * @returns {void}
 */
function showRayonDetail(rayon) {
  /** @type {string} */
  const resolvedRayon = rayon || _currentGrilleRayon;
  if (!resolvedRayon) { showGrilleCardsView(); return; }
  _currentGrilleRayon = resolvedRayon;

  /** @type {string} */
  const enseigne = el('grille-enseigne-sel') ? el('grille-enseigne-sel').value : '';
  /** @type {string} */
  const enseigneArg = enseigne === '__sans_enseigne__' ? '' : enseigne;
  /** @type {string} */
  const storeId = el('grille-mag-sel') ? el('grille-mag-sel').value : '';

  el('grille-cards-view').style.display  = 'none';
  el('grille-detail-view').style.display = '';

  /** @type {boolean} */
  const isAdmin = CU && CU.role === 'admin';
  if (el('btn-rename-rayon')) el('btn-rename-rayon').style.display = isAdmin ? '' : 'none';
  if (el('btn-delete-rayon')) el('btn-delete-rayon').style.display = isAdmin ? '' : 'none';

  el('grille-ttl').textContent = resolvedRayon;

  const addButton = el('btn-add-ctrl');
  if (addButton) addButton.style.display = isAdmin ? '' : 'none';

  /** @type {GrillePoint[]} */
  const allPoints = getGrille(resolvedRayon, storeId, enseigneArg);

  if (el('btn-clear-ctrl-points')) {
    el('btn-clear-ctrl-points').style.display = (isAdmin && allPoints.length > 0) ? '' : 'none';
  }

  if (!allPoints.length) {
    /** @type {string} */
    const helpText = isAdmin
      ? 'Utilisez « Importer » ou « Ajouter un point » pour commencer.'
      : 'Les points seront ajoutés par l\'administrateur.';
    el('grille-body').innerHTML = `<div class="tsm tm" style="padding:24px;text-align:center">Aucun point de contrôle pour ce rayon.<br>${helpText}</div>`;
    return;
  }

  /** @type {string[]} */
  const zones = getZonesForRayon(resolvedRayon, storeId);

  el('grille-body').innerHTML = zones
    .map(zone => _buildZoneSection(zone, allPoints.filter(p => ((p.zone && p.zone.trim()) || IMPORT_UNCLASSIFIED_ZONE_LABEL_GRILLE) === zone), resolvedRayon, storeId, isAdmin))
    .join('');
}

/**
 * Met à jour le libellé indiquant le scope actuel (enseigne + magasin
 * éventuel) — affiché au-dessus des deux vues (cartes et détail) de
 * la page Grilles.
 * @param {string} enseigne - Enseigne sélectionnée (ou '__sans_enseigne__', ou chaîne vide si aucune sélection).
 * @param {string} storeId - Référence vers Magasin.id ; chaîne vide = grille commune de l'enseigne.
 * @returns {void}
 */
function _updateGrilleScopeLabel(enseigne, storeId) {
  if (!el('grille-scope-label')) return;

  if (!enseigne) {
    el('grille-scope-label').innerHTML = `<i class="ti ti-alert-triangle" style="color:var(--warning)"></i> Sélectionnez une enseigne pour voir/éditer sa grille commune.`;
    return;
  }

  /** @type {Magasin | undefined} */
  const store = storeId ? DB.magasins.find(m => m.id === storeId) : undefined;
  if (store) {
    el('grille-scope-label').innerHTML = `<i class="ti ti-building-store"></i> Grille spécifique à <strong>${store.nom}</strong> — les points non personnalisés pour ce magasin reprennent la grille commune de son enseigne.`;
    return;
  }

  /** @type {string} */
  const enseigneLabel = enseigne === '__sans_enseigne__' ? 'Sans enseigne' : enseigne;
  el('grille-scope-label').innerHTML = enseigne === '__sans_enseigne__'
    ? `<i class="ti ti-alert-triangle" style="color:var(--warning)"></i> Les magasins sans enseigne n'ont pas de grille commune — choisissez un magasin pour éditer sa grille propre.`
    : `<i class="ti ti-world"></i> Grille commune de l'enseigne <strong>${enseigneLabel}</strong>, héritée par tous ses magasins sans personnalisation propre.`;
}

/**
 * Point d'entrée de la page Grilles (voir _getPageRenderer, ui.js) —
 * affiche toujours la vue cartes à l'arrivée sur la page, jamais
 * directement la vue détail d'un rayon précédemment consulté (sortir
 * de la page puis y revenir réinitialise sur la vue d'ensemble).
 * @returns {void}
 */
function showGrille() {
  showGrilleCardsView();
}

// ─────────────────────────────────────────────
// 5. HELPERS DE RENDU
// ─────────────────────────────────────────────

/**
 * Construit la section HTML d'une zone (en-tête + sous-groupes par
 * catégorie) — une zone est une sous-partie du rayon, devenant
 * l'onglet correspondant dans la modale d'audit (voir
 * buildAuditQuestions, audits.js). L'en-tête de zone porte un bouton
 * de renommage (admin uniquement), distinct du renommage de rayon
 * (renameRayon, rayons.js) — voir renameGrilleZone.
 * @param {string} zone
 * @param {GrillePoint[]} points - Points appartenant à cette zone.
 * @param {string} rayon
 * @param {string} storeId - Référence vers Magasin.id ; chaîne vide = grille commune.
 * @param {boolean} isAdmin
 * @returns {string}
 */
function _buildZoneSection(zone, points, rayon, storeId, isAdmin) {
  /** @type {string[]} */
  const categories = [...new Set(points.map(point => point.cat || 'Général'))];
  /** @type {string} */
  const renameButton = isAdmin && zone !== IMPORT_UNCLASSIFIED_ZONE_LABEL_GRILLE
    ? `<button class="btn btn-secondary btn-sm" style="padding:2px 6px" onclick="openRenameGrilleZonePrompt('${_escapeHtmlAttr(rayon)}','${_escapeHtmlAttr(zone)}','${_escapeHtmlAttr(storeId)}')" aria-label="Renommer cette zone" title="Renommer cette zone"><i class="ti ti-pencil" style="font-size:12px"></i></button>`
    : '';

  return `<div style="margin-bottom:4px">
    <div style="display:flex;align-items:center;justify-content:space-between;gap:8px;padding:10px 20px;background:var(--qual-light);border-bottom:1px solid var(--border)">
      <span style="font-size:12px;font-weight:700;color:var(--qual-dark);text-transform:uppercase;letter-spacing:.5px">${zone}</span>
      ${renameButton}
    </div>
    ${categories.map(cat => _buildCategorySection(cat, points.filter(p => (p.cat || 'Général') === cat), rayon, storeId)).join('')}
  </div>`;
}

/**
 * Construit la section HTML d'une catégorie (en-tête + lignes de
 * points) à l'intérieur d'une zone — sous-groupe, n'engendre pas
 * d'onglet propre (contrairement à la zone, voir _buildZoneSection).
 * @param {string} category - Nom de la catégorie (GrillePoint.cat).
 * @param {GrillePoint[]} points - Points appartenant à cette catégorie.
 * @param {string} rayon
 * @param {string} storeId
 * @returns {string}
 */
function _buildCategorySection(category, points, rayon, storeId) {
  return `<div>
    <div style="padding:8px 20px;background:var(--bg);font-size:11px;font-weight:600;color:var(--text2);text-transform:uppercase;letter-spacing:.5px;border-bottom:1px solid var(--border)">
      ${category}
    </div>
    ${points.map(point => _buildPointRow(point, rayon, storeId)).join('')}
  </div>`;
}

/**
 * Construit la ligne HTML d'un point de contrôle. Tout point de
 * contrôle FSQS est désormais modifiable : getGrille() ne retourne
 * plus que des points custom/importés (DB.grilleCustom ou
 * DB.grilleCustomByStore), il n'existe plus de référentiel de base
 * non modifiable à distinguer — voir getGrille.
 * @param {GrillePoint} point
 * @param {string} rayon
 * @param {string} storeId
 * @returns {string}
 */
function _buildPointRow(point, rayon, storeId) {
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
      ${isAdmin ? _buildPointActions(rayon, storeId, point.id) : ''}
    </div>
  </div>`;
}

/**
 * Construit les boutons d'action (modifier/supprimer) pour un point
 * de contrôle, réservés aux administrateurs.
 * @param {string} rayon
 * @param {string} storeId
 * @param {string} pointId - Référence vers GrillePoint.id.
 * @returns {string}
 */
function _buildPointActions(rayon, storeId, pointId) {
  return `<button class="btn btn-secondary btn-sm" onclick="openCtrlModal('${rayon}','${pointId}','${storeId}')" aria-label="Modifier">
    <i class="ti ti-pencil"></i>
  </button>
  <button class="btn btn-danger btn-sm" onclick="delCtrl('${rayon}','${pointId}','${storeId}')" aria-label="Supprimer">
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
 * personnalisé. Mémorise le rayon et le magasin courants dans
 * _ctrlRayonCurrent/_ctrlStoreCurrent (utilisés par saveCtrl() pour
 * décider où écrire). Peuple d'abord les cases à cocher de rayon
 * (voir _buildCtrlRayonCheckboxes) depuis getKnownRayons() — plus
 * aucune liste fixe.
 * @param {string} [rayon] - Rayon d'origine ; retombe sur _currentGrilleRayon (rayon affiché dans la vue détail), puis le premier rayon connu (getKnownRayons).
 * @param {string} [pointId] - Référence vers GrillePoint.id à éditer ; absent/falsy pour une création.
 * @param {string} [storeId] - Magasin d'origine du point édité (DB.grilleCustomByStore) ; absent/vide = grille commune (DB.grilleCustom). Retombe sur le select de magasin affiché si omis.
 * @returns {void}
 */
function openCtrlModal(rayon, pointId, storeId) {
  _ctrlRayonCurrent = rayon || _currentGrilleRayon || getKnownRayons()[0] || '';
  _ctrlStoreCurrent = storeId !== undefined ? storeId : (el('grille-mag-sel') ? el('grille-mag-sel').value : '');
  _ctrlEnseigneCurrent = el('grille-enseigne-sel') ? el('grille-enseigne-sel').value : '';
  /** @type {boolean} */
  const isEdit = !!pointId;

  el('m-ctrl-ttl').innerHTML = isEdit
    ? '<i class="ti ti-pencil" style="color:var(--primary)"></i> Modifier le point de contrôle'
    : '<i class="ti ti-list-check" style="color:var(--primary)"></i> Nouveau point de contrôle';

  el('ctrl-err').classList.remove('show');
  sv('ctrl-id', pointId || '');

  _buildCtrlRayonCheckboxes();
  _buildCtrlZoneSuggestions(_ctrlRayonCurrent, _ctrlStoreCurrent, _ctrlEnseigneCurrent);

  // Cocher le rayon courant par défaut
  document.querySelectorAll('.ctrl-ray-cb').forEach(cb => {
    cb.checked = cb.value === _ctrlRayonCurrent;
  });

  if (isEdit) {
    _populateCtrlForm(rayon, pointId, _ctrlStoreCurrent);
  } else {
    _resetCtrlForm();
  }

  openModal('m-ctrl');
}

/**
 * Pré-remplit le formulaire avec les données d'un point de contrôle
 * existant. Sans effet si le point n'est pas trouvé dans
 * DB.grilleCustom[rayon] ou DB.grilleCustomByStore[storeId][rayon]
 * selon le scope (depuis le retrait de GRILLE_BASE_COMMUNE, tout
 * point de contrôle vit dans l'un de ces deux endroits — voir
 * getGrille).
 * @param {string} rayon
 * @param {string} pointId - Référence vers GrillePoint.id.
 * @param {string} [storeId] - Magasin d'origine du point ; absent/vide = grille commune.
 * @returns {void}
 */
function _populateCtrlForm(rayon, pointId, storeId) {
  /** @type {GrillePoint[]} */
  const source = storeId ? (DB.grilleCustomByStore?.[storeId]?.[rayon] || []) : (DB.grilleCustom[rayon] || []);
  /** @type {GrillePoint | undefined} */
  const point = source.find(p => p.id === pointId);
  if (!point) return;

  sv('ctrl-q',    point.q);
  sv('ctrl-zone', point.zone || '');
  sv('ctrl-cat',  point.cat || '');
  sv('ctrl-prec', point.prec || '');
  sv('ctrl-poids', point.p);
  el('ctrl-crit').value = point.c;
}

/**
 * Réinitialise le formulaire de point de contrôle pour une création.
 * @returns {void}
 */
function _resetCtrlForm() {
  sv('ctrl-q', '');
  sv('ctrl-zone', '');
  sv('ctrl-cat', '');
  sv('ctrl-prec', '');
  sv('ctrl-poids', '');
  el('ctrl-crit').value = 'Majeure';
}

/**
 * Peuple la `<datalist>` de suggestions de zone (#ctrl-zone-suggestions)
 * avec les zones déjà connues du rayon donné (getZonesForRayon,
 * rayons.js). Champ texte libre, pas un select fermé : ces
 * suggestions n'empêchent jamais de taper une nouvelle zone, créée
 * implicitement à l'enregistrement (voir saveCtrl) — exactement comme
 * pour un rayon.
 * @param {string} rayon
 * @returns {void}
 */
/**
 * Peuple #ctrl-zone-suggestions (modale point de contrôle) avec une
 * option par zone connue du rayon, dans le scope (magasin ou commun)
 * donné — voir getZonesForRayon.
 * @param {string} rayon
 * @param {string} [storeId]
 * @param {string} [enseigne]
 * @returns {void}
 */
function _buildCtrlZoneSuggestions(rayon, storeId, enseigne) {
  /** @type {HTMLDataListElement | null} */
  const datalist = el('ctrl-zone-suggestions');
  if (!datalist) return;
  datalist.innerHTML = getZonesForRayon(rayon, storeId, enseigne)
    .filter(zone => zone !== IMPORT_UNCLASSIFIED_ZONE_LABEL_GRILLE)
    .map(zone => `<option value="${_escapeHtmlAttr(zone)}">`)
    .join('');
}

// ─────────────────────────────────────────────
// 7. SAUVEGARDE
// ─────────────────────────────────────────────

/**
 * Valide et sauvegarde le formulaire de point de contrôle, pour un
 * ou plusieurs rayons sélectionnés.
 *
 * ⚠️ CHANGÉ : zone et cat sont désormais deux champs distincts de
 * GrillePoint (voir config.js), plus un seul champ `cat` fusionné en
 * "Section – Sous-catégorie". Le même nom de zone est utilisé tel
 * quel pour chacun des rayons sélectionnés — sans lien entre eux
 * (voir la note d'en-tête de la section ZONES DE RAYON, rayons.js) :
 * si la zone n'existe pas encore dans l'un des rayons, elle y est
 * créée à la volée, exactement comme un rayon est créé à la volée
 * par l'import.
 *
 * Comportement subtil : si `existingId` est renseigné (édition),
 * SEUL le rayon `_ctrlRayonCurrent` (rayon d'origine du point édité)
 * reçoit une mise à jour in-place. Pour tout autre rayon
 * sélectionné dans `selectedRayons`, un NOUVEAU point personnalisé
 * est créé (nouvel id `cust-...`) — il n'y a pas de duplication par
 * référence d'un même point vers plusieurs rayons.
 * @returns {void}
 */
/**
 * Valide et sauvegarde le formulaire de point de contrôle, pour un
 * ou plusieurs rayons sélectionnés.
 *
 * ⚠️ CHANGÉ : zone et cat sont désormais deux champs distincts de
 * GrillePoint (voir config.js), plus un seul champ `cat` fusionné en
 * "Section – Sous-catégorie". Le même nom de zone est utilisé tel
 * quel pour chacun des rayons sélectionnés — sans lien entre eux
 * (voir la note d'en-tête de la section ZONES DE RAYON, rayons.js) :
 * si la zone n'existe pas encore dans l'un des rayons, elle y est
 * créée à la volée, exactement comme un rayon est créé à la volée
 * par l'import.
 *
 * ⚠️ CHANGÉ : si _ctrlStoreCurrent est non vide (modale ouverte
 * depuis la grille d'un magasin précis — voir openCtrlModal), le
 * point est écrit dans DB.grilleCustomByStore[storeId][rayon] au
 * lieu de DB.grilleCustom[rayon] (grille commune). C'est toujours
 * le MÊME magasin (_ctrlStoreCurrent) qui reçoit le point pour
 * chacun des rayons sélectionnés — il n'y a pas de sélection
 * multi-magasin dans ce formulaire (contrairement à l'import, voir
 * import-grille.js), seulement multi-rayon.
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
  const zone           = v('ctrl-zone').trim();
  /** @type {string} */
  const categorie      = v('ctrl-cat').trim();
  /** @type {string} */
  const precision      = v('ctrl-prec').trim();
  /** @type {GrilleCriticite} */
  const criticite      = el('ctrl-crit').value;
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

  /** @type {boolean} */
  const isStoreScoped = !!_ctrlStoreCurrent;
  /** @type {string} */
  const enseigne = _ctrlEnseigneCurrent === '__sans_enseigne__' ? '' : _ctrlEnseigneCurrent;

  if (!isStoreScoped && !enseigne) {
    errorEl.textContent = 'Sélectionnez une enseigne (ou un magasin précis) avant d\'ajouter un point — il n\'existe pas de grille commune sans enseigne.';
    errorEl.classList.add('show');
    return;
  }

  selectedRayons.forEach(rayon => {
    /** @type {GrillePoint[]} */
    let target;
    if (isStoreScoped) {
      if (!DB.grilleCustomByStore) DB.grilleCustomByStore = {};
      if (!DB.grilleCustomByStore[_ctrlStoreCurrent]) DB.grilleCustomByStore[_ctrlStoreCurrent] = {};
      if (!DB.grilleCustomByStore[_ctrlStoreCurrent][rayon]) DB.grilleCustomByStore[_ctrlStoreCurrent][rayon] = [];
      target = DB.grilleCustomByStore[_ctrlStoreCurrent][rayon];
    } else {
      if (!DB.grilleCustom[enseigne]) DB.grilleCustom[enseigne] = {};
      if (!DB.grilleCustom[enseigne][rayon]) DB.grilleCustom[enseigne][rayon] = [];
      target = DB.grilleCustom[enseigne][rayon];
    }

    if (existingId && rayon === _ctrlRayonCurrent) {
      // Mise à jour du point existant
      /** @type {number} */
      const index = target.findIndex(p => p.id === existingId);
      if (index >= 0) {
        /** @type {GrillePoint} */
        target[index] = {
          id: existingId, zone, cat: categorie, q: intitule, p: poids, c: criticite, prec: precision,
        };
      }
    } else {
      // Nouveau point
      /** @type {GrillePoint} */
      target.push({
        id: 'cust-' + uid(), zone, cat: categorie, q: intitule, p: poids, c: criticite, prec: precision,
      });
    }
  });

  save();
  closeModal('m-ctrl');
  showRayonDetail(_ctrlRayonCurrent);
}

// ─────────────────────────────────────────────
// 8. SUPPRESSION
// ─────────────────────────────────────────────

/**
 * Supprime un point de contrôle personnalisé, après confirmation.
 * @param {string} rayon
 * @param {string} pointId - Référence vers GrillePoint.id.
 * @param {string} [storeId] - Magasin d'origine du point (DB.grilleCustomByStore) ; absent/vide = grille commune de l'enseigne actuellement sélectionnée (#grille-enseigne-sel).
 * @returns {void}
 */
function delCtrl(rayon, pointId, storeId) {
  if (!confirm('Supprimer ce point de contrôle personnalisé ?')) return;
  if (storeId) {
    if (DB.grilleCustomByStore?.[storeId]?.[rayon]) {
      DB.grilleCustomByStore[storeId][rayon] = DB.grilleCustomByStore[storeId][rayon].filter(p => p.id !== pointId);
    }
  } else {
    /** @type {string} */
    const enseigneSel = el('grille-enseigne-sel') ? el('grille-enseigne-sel').value : '';
    /** @type {string} */
    const enseigne = enseigneSel === '__sans_enseigne__' ? '' : enseigneSel;
    if (enseigne && DB.grilleCustom?.[enseigne]?.[rayon]) {
      DB.grilleCustom[enseigne][rayon] = DB.grilleCustom[enseigne][rayon].filter(p => p.id !== pointId);
    }
  }
  save();
  showRayonDetail(rayon);
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
  showRayonDetail(name.trim());
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
  const currentRayon = _currentGrilleRayon;
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
  showRayonDetail(newName.trim());
}

/**
 * Ouvre une invite de saisie pour renommer une zone à l'intérieur
 * d'UN rayon précis (voir renameGrilleZone, rayons.js — n'affecte
 * jamais une zone de même nom dans un autre rayon).
 * @param {string} rayon
 * @param {string} zone
 * @returns {void}
 */
/**
 * Ouvre une invite de saisie pour renommer une zone à l'intérieur
 * d'UN rayon précis, pour un magasin donné (ou la grille commune) —
 * voir renameGrilleZone, rayons.js.
 * @param {string} rayon
 * @param {string} zone
 * @param {string} [storeId] - Magasin concerné ; absent/vide = grille commune.
 * @returns {void}
 */
function openRenameGrilleZonePrompt(rayon, zone, storeId) {
  /** @type {string | null} */
  const newName = prompt('Nouveau nom de la zone :', zone);
  if (newName === null) return;

  /** @type {string} */
  const enseigneSel = el('grille-enseigne-sel') ? el('grille-enseigne-sel').value : '';
  /** @type {string} */
  const enseigne = enseigneSel === '__sans_enseigne__' ? '' : enseigneSel;

  /** @type {{ok: boolean, error?: string}} */
  const result = renameGrilleZone(rayon, zone, newName, storeId, enseigne);
  if (!result.ok) {
    if (result.error) alert(result.error);
    return;
  }

  save();
  showRayonDetail(rayon);
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
  const currentRayon = _currentGrilleRayon;
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
  showGrilleCardsView();
}

/**
 * Supprime UNIQUEMENT les points de contrôle du rayon actuellement
 * affiché (DB.grilleCustom[rayon] vidé) — contrairement à
 * confirmDeleteRayon, le rayon lui-même reste (toujours visible dans
 * le sélecteur, conservé dans getKnownRayons() via DB.audits/drafts
 * s'il y a déjà eu un audit dessus) et les audits déjà réalisés sur
 * ce rayon ne sont pas touchés. Utile pour repartir d'une grille
 * vide sur ce rayon (ex : reprendre un import raté) sans perdre
 * l'historique d'audit ni devoir recréer le rayon.
 * @returns {void}
 */
/**
 * Supprime UNIQUEMENT les points de contrôle du rayon actuellement
 * affiché, dans le scope actuellement sélectionné (grille commune ou
 * magasin précis — voir #grille-mag-sel) — contrairement à
 * confirmDeleteRayon, le rayon lui-même reste (toujours visible dans
 * le sélecteur, conservé dans getKnownRayons() via DB.audits/drafts
 * s'il y a déjà eu un audit dessus) et les audits déjà réalisés sur
 * ce rayon ne sont pas touchés. Utile pour repartir d'une grille
 * vide sur ce rayon (ex : reprendre un import raté) sans perdre
 * l'historique d'audit ni devoir recréer le rayon.
 * @returns {void}
 */
function confirmClearGrillePoints() {
  /** @type {string} */
  const currentRayon = _currentGrilleRayon;
  if (!currentRayon) return;

  /** @type {string} */
  const storeId = el('grille-mag-sel') ? el('grille-mag-sel').value : '';
  /** @type {string} */
  const enseigneSel = el('grille-enseigne-sel') ? el('grille-enseigne-sel').value : '';
  /** @type {string} */
  const enseigne = enseigneSel === '__sans_enseigne__' ? '' : enseigneSel;
  /** @type {GrillePoint[]} */
  const currentPoints = storeId
    ? (DB.grilleCustomByStore?.[storeId]?.[currentRayon] || [])
    : (DB.grilleCustom?.[enseigne]?.[currentRayon] || []);
  /** @type {number} */
  const pointCount = currentPoints.length;
  if (!pointCount) return;

  /** @type {Magasin | undefined} */
  const store = storeId ? DB.magasins.find(m => m.id === storeId) : undefined;
  /** @type {string} */
  const scopeLabel = store ? ` (magasin « ${store.nom} » uniquement)` : ` (grille commune de l'enseigne « ${enseigne} »)`;

  if (!confirm(`Supprimer les ${pointCount} point(s) de contrôle du rayon « ${currentRayon} »${scopeLabel} ? Le rayon et ses audits déjà réalisés sont conservés. Cette action est irréversible.`)) return;

  if (storeId) {
    DB.grilleCustomByStore[storeId][currentRayon] = [];
  } else if (enseigne && DB.grilleCustom[enseigne]) {
    DB.grilleCustom[enseigne][currentRayon] = [];
  }
  save();
  showRayonDetail(currentRayon);
}
