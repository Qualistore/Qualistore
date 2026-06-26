// ══════════════════════════════════════════════════════════════
// UI — Sidebar, Navigation, Helpers DOM, Modals
// Dépend de : storage.js (DB, CU), auth.js (hasPerm)
// ══════════════════════════════════════════════════════════════

// ─────────────────────────────────────────────
// 0. TYPEDEFS JSDoc (pour inférence VSCode / TypeScript)
//    ⚠️ Déduits de l'usage dans ce fichier. Ce fichier est la
//    SOURCE CANONIQUE de toutes les fonctions DOM utilitaires
//    (el, v, sv, fd, today, sc, statBdg, critBdg, rIcon, etc.) déjà
//    typées par déduction dans tous les autres fichiers du projet —
//    leurs signatures sont CONFIRMÉES ici.
//
//    ⚠️ Référence des fonctions externes non fournies, confirmant
//    l'existence d'un fichier audit-qualimetre.js non transmis :
//    openQualAuditModal, renderQualAudits, showQualAudit, qaStep
//    (déjà suspecté depuis init.js).
// ─────────────────────────────────────────────

/**
 * Identifiant de page, clé commune à PAGE_METADATA et PAGE_RENDERERS.
 * @typedef {'dashboard'|'audits'|'nc'|'actions'|'magasins'|'rayons'|'rapports'|'utilisateurs'|'grille'|'qualimetre'|'audit-qualimetre'|'rapport-qualimetre'|'grille-qualimetre'|'brouillons'|'backup'} PageId
 */

/**
 * Rôle applicatif d'un utilisateur (voir config.js/users.js pour la
 * définition canonique — confirmé ici par ROLE_LABELS).
 * @typedef {'admin'|'fsqs'|'directeur'|'direction'|'collaborateur'} UserRole
 */

/**
 * Élément de configuration de la sidebar : soit un en-tête de
 * section, soit un item de navigation cliquable. Le résultat d'une
 * expression `hasPerm(...) && {...}` est `false` quand la permission
 * est refusée — ces valeurs sont filtrées via .filter(Boolean) avant
 * construction du HTML.
 * @typedef {Object} NavSectionHeader
 * @property {string} section
 */

/**
 * @typedef {Object} NavLinkItem
 * @property {PageId} id
 * @property {string} icon - Classe d'icône Tabler (sans préfixe 'ti').
 * @property {string} label
 * @property {string} [style] - Style CSS inline additionnel (ex : couleur dédiée Qualimètre).
 * @property {string} [badge] - Id de l'élément `<span>` de badge associé (ex : compteur de NC ouvertes).
 */

/**
 * @typedef {NavSectionHeader | NavLinkItem | false} NavItem
 */

/**
 * Utilisateur applicatif. Seules .nom et .role sont accédées dans
 * ce fichier ; structure complète dans storage.js/auth.js/users.js.
 * @typedef {Object} User
 * @property {string} nom
 * @property {UserRole} role
 * @property {string[]} [magasins] - IDs de magasins assignés (CONFIRMÉ string[] — voir visibleMids).
 */

/**
 * Magasin. Seules .id et .nom sont accédées dans ce fichier ;
 * structure complète dans magasins.js.
 * @typedef {Object} Magasin
 * @property {string} id
 * @property {string} nom
 */

/**
 * Audit FSQS. Seules .mid et .score sont accédées dans ce fichier ;
 * structure complète dans audits.js.
 * @typedef {Object} Audit
 * @property {string} mid
 * @property {number} score
 */

// ─────────────────────────────────────────────
// 1. CONSTANTES
// ─────────────────────────────────────────────

/**
 * Métadonnées de chaque page : [titre, sous-titre].
 * @type {Record<PageId, [string, string]>}
 */
const PAGE_METADATA = {
  dashboard:           ['Tableau de bord',       'Vue d\'ensemble'],
  audits:              ['Audits FSQS',            'Historique'],
  nc:                  ['Non-conformités',        'Suivi des écarts'],
  actions:             ['Actions correctives',    'Plan d\'actions'],
  magasins:            ['Magasins',               'Gestion du parc'],
  rayons:              ['Rayons',                 'Performances'],
  rapports:            ['Rapport FSQS',           'Audits & non-conformités FSQS'],
  utilisateurs:        ['Utilisateurs',           'Gestion des accès'],
  grille:              ['Grille d\'audit',        'Référentiels'],
  qualimetre:          ['Qualimètre',             'Référentiel par magasin'],
  'audit-qualimetre':  ['Audit Qualimètre',       'Parcours client – Œil du client'],
  'rapport-qualimetre':['Rapport Qualimètre',     'Historique et exports des audits Qualimètre'],
  'grille-qualimetre': ['Grille Qualimètre',      'Points de contrôle par zone'],
  brouillons:          ['Brouillons',             'Audits en cours de saisie'],
  backup:              ['Sauvegarde',             'Export & import des données'],
};

/**
 * Libellés affichés par rôle dans la sidebar.
 * @type {Record<UserRole, string>}
 */
const ROLE_LABELS = {
  admin:         'Administrateur',
  fsqs:          'Auditeur FSQS',
  directeur:     'Directeur',
  direction:     'Direction',
  collaborateur: 'Collaborateur magasin',
};

// ─────────────────────────────────────────────
// 2. UTILITAIRES DOM
// ─────────────────────────────────────────────

/**
 * Raccourci pour getElementById.
 * @param {string} id
 * @returns {HTMLElement | null}
 */
function el(id)        { return document.getElementById(id); }

/**
 * Récupère la valeur d'un input/select par son id.
 * @param {string} id
 * @returns {string}
 */
function v(id)         { return el(id).value; }

/**
 * Définit la valeur d'un input/select par son id.
 * @param {string} id
 * @param {string | number} value
 * @returns {void}
 */
function sv(id, value) { el(id).value = value; }

// ─────────────────────────────────────────────
// 3. HELPERS DE RENDU
// ─────────────────────────────────────────────

/**
 * Formate une date ISO 'YYYY-MM-DD' en 'DD/MM/YYYY'.
 * @param {string} dateString
 * @returns {string} '–' si dateString est vide/falsy.
 */
function fd(dateString) {
  if (!dateString) return '–';
  const [year, month, day] = dateString.split('-');
  return `${day}/${month}/${year}`;
}

/**
 * Retourne la date du jour au format ISO 'YYYY-MM-DD'.
 * @returns {string}
 */
function today() {
  return new Date().toISOString().split('T')[0];
}

/**
 * Retourne une couleur CSS selon le score (0–100).
 * @param {number} score
 * @returns {string} Couleur hexadécimale.
 */
function sc(score) {
  if (score >= 95) return '#16a34a';
  if (score >= 80) return '#f59e0b';
  if (score >= 70) return '#ea580c';
  return '#e53935';
}

/**
 * Retourne une classe CSS de score badge selon la valeur.
 * @param {number} score
 * @returns {'sg'|'sy'|'so'|'sr'}
 */
function scCls(score) {
  if (score >= 95) return 'sg';
  if (score >= 80) return 'sy';
  if (score >= 70) return 'so';
  return 'sr';
}

/**
 * Retourne une classe CSS de barre de progression selon le score.
 * @param {number} score
 * @returns {'fg'|'fy'|'fo'|'fr'}
 */
function pgCls(score) {
  if (score >= 95) return 'fg';
  if (score >= 80) return 'fy';
  if (score >= 70) return 'fo';
  return 'fr';
}

/**
 * Génère le HTML d'un badge de score.
 * @param {number} score
 * @returns {string}
 */
function sbadge(score) {
  return `<span class="score-badge ${scCls(score)}">${score}%</span>`;
}

/**
 * Retourne true si la date est dépassée par rapport à aujourd'hui.
 * @param {string} dateString
 * @returns {boolean | ''} Chaîne vide (falsy) si dateString est vide/falsy — comportement conservé tel quel (pas de coercition booléenne forcée par le code).
 */
function overdue(dateString) {
  return dateString && new Date(dateString) < new Date(today());
}

/**
 * Génère le HTML d'un badge de statut (Ouverte, En cours, Clôturée…).
 * Gère à la fois les formes féminines et masculines, bien que seules
 * les formes féminines ('Ouverte', 'Clôturée') aient été observées
 * comme produites ailleurs dans le projet (NC, Action — toujours au
 * féminin grammatical).
 * @param {string} status
 * @returns {string}
 */
function statBdg(status) {
  /** @type {Record<string, string>} */
  const classMap = {
    'Ouvert':   'b-open',
    'Ouverte':  'b-open',
    'En cours': 'b-prog',
    'Clôturé':  'b-done',
    'Clôturée': 'b-done',
    'Traitée':  'b-done',
  };
  return `<span class="badge ${classMap[status] || ''}">${status}</span>`;
}

/**
 * Génère le HTML d'un badge de criticité (Critique, Majeure, Mineure).
 * @param {'Critique'|'Majeure'|'Mineure'|string} criticite
 * @returns {string}
 */
function critBdg(criticite) {
  /** @type {Record<string, string>} */
  const classMap = { 'Critique': 'b-open', 'Majeure': 'b-dir', 'Mineure': 'b-prog' };
  return `<span class="badge ${classMap[criticite] || ''}">${criticite}</span>`;
}

/**
 * Génère le HTML d'une icône de rayon colorée. Seuls 5 rayons
 * historiques (voir RAYONS_BASE_SEED, rayons.js) ont une icône/
 * couleur dédiée ; tout autre rayon — qu'il s'agisse de
 * 'Boulangerie'/'Drive' (historiques mais sans icône dédiée) ou d'un
 * rayon créé/importé dynamiquement (voir getKnownRayons, rayons.js)
 * — retombe sur l'icône générique 'ti-category' sans classe de
 * couleur spécifique. Ce fallback générique est volontaire et ne
 * doit jamais être remplacé par un rejet ou une exception : un rayon
 * dynamique sans icône dédiée reste un rayon parfaitement valide.
 * @param {string} rayon
 * @returns {string}
 */
function rIcon(rayon) {
  /** @type {Record<string, string>} */
  const iconMap = {
    'Boucherie':      'ti-meat',
    'Marée':          'ti-fish',
    'Charcuterie':    'ti-pig',
    'Fromage':        'ti-cheese',
    'Fruits & Légumes': 'ti-leaf',
  };
  /** @type {Record<string, string>} */
  const classMap = {
    'Boucherie':      'rayon-boucherie',
    'Marée':          'rayon-maree',
    'Charcuterie':    'rayon-charcuterie',
    'Fromage':        'rayon-fromage',
    'Fruits & Légumes': 'rayon-fl',
  };
  return `<span class="rayon-icon ${classMap[rayon] || ''}"><i class="ti ${iconMap[rayon] || 'ti-category'}"></i></span>`;
}

/**
 * Génère le HTML d'une barre de progression.
 * @param {number} score
 * @returns {string}
 */
function pbar(score) {
  return `<div class="progress-bar" style="margin-top:5px">
    <div class="progress-fill ${pgCls(score)}" style="width:${score}%"></div>
  </div>`;
}

/**
 * Affiche un toast de notification temporaire (auto-suppression
 * après 3.5s).
 * @param {string} message
 * @param {'success'|'warning'|'danger'} [type]
 * @returns {void}
 */
function showToast(message, type = 'success') {
  /** @type {Record<string, string>} */
  const colorMap = { success: '#16a34a', warning: '#f59e0b', danger: '#e53935' };
  const toast = document.createElement('div');
  toast.style.cssText = [
    'position:fixed', 'bottom:24px', 'right:24px',
    `background:${colorMap[type] || '#16a34a'}`, 'color:#fff',
    'padding:12px 20px', 'border-radius:10px', 'font-size:13px',
    'font-weight:500', 'z-index:9999',
    'box-shadow:0 4px 20px rgba(0,0,0,.2)',
    'display:flex', 'align-items:center', 'gap:8px',
  ].join(';');
  toast.innerHTML = `<i class="ti ti-circle-check" style="font-size:18px"></i> ${message}`;
  document.body.appendChild(toast);
  setTimeout(() => toast.remove(), 3500);
}

// ─────────────────────────────────────────────
// 4. GESTION DES MODALS
// ─────────────────────────────────────────────

/**
 * Ouvre une modale (ajoute la classe 'open').
 * @param {string} modalId
 * @returns {void}
 */
function openModal(modalId)  { el(modalId).classList.add('open'); }

/**
 * Ferme une modale (retire la classe 'open').
 * @param {string} modalId
 * @returns {void}
 */
function closeModal(modalId) { el(modalId).classList.remove('open'); }

// ─────────────────────────────────────────────
// 5. CALCULS MÉTIER (helpers partagés)
// ─────────────────────────────────────────────

/**
 * Calcule le score moyen (0–100) de tous les audits d'un magasin.
 * @param {string} storeId - Référence vers Magasin.id.
 * @returns {number | null} null si le magasin n'a aucun audit.
 */
function magScore(storeId) {
  /** @type {Audit[]} */
  const storeAudits = DB.audits.filter(audit => audit.mid === storeId);
  if (!storeAudits.length) return null;
  return Math.round(storeAudits.reduce((sum, audit) => sum + audit.score, 0) / storeAudits.length);
}

/**
 * Retourne la liste des IDs de magasins visibles par l'utilisateur
 * connecté. Les rôles 'admin' et 'fsqs' voient tous les magasins ;
 * les autres rôles ne voient que CU.magasins.
 * @returns {string[]}
 */
function visibleMids() {
  if (!CU) return [];
  if (CU.role === 'admin' || CU.role === 'fsqs') return DB.magasins.map(m => m.id);
  return CU.magasins || [];
}

/**
 * Peuple un élément `<select>` avec les magasins visibles, en
 * préservant la valeur courante si elle reste valide.
 * @param {HTMLSelectElement | null} selectElement
 * @returns {void}
 */
function populateMagSelect(selectElement) {
  if (!selectElement) return;
  /** @type {string} */
  const currentValue = selectElement.value;
  while (selectElement.options.length > 1) selectElement.remove(1);

  DB.magasins
    .filter(m => visibleMids().includes(m.id))
    .forEach(m => {
      const option = document.createElement('option');
      option.value = m.id;
      option.textContent = m.nom;
      selectElement.appendChild(option);
    });

  if (currentValue) selectElement.value = currentValue;
}

/**
 * Peuple un élément `<select>` avec tous les rayons FSQS connus
 * (voir getKnownRayons, rayons.js), en préservant la valeur courante
 * si elle reste valide. Remplace toute liste d'`<option>` de rayons
 * codée en dur dans le HTML — le nom d'un rayon n'est jamais fixe,
 * voir rayons.js.
 * @param {HTMLSelectElement | null} selectElement
 * @param {boolean} [includeEmptyOption] - Si true, conserve/ajoute une première option vide ("Tous les rayons" ou "Sélectionner…", déjà présente dans le HTML) sans la supprimer ; si false, le select ne contient que des rayons.
 * @returns {void}
 */
function populateRayonSelect(selectElement, includeEmptyOption) {
  if (!selectElement) return;
  /** @type {string} */
  const currentValue = selectElement.value;
  /** @type {number} */
  const keepFrom = includeEmptyOption ? 1 : 0;
  while (selectElement.options.length > keepFrom) selectElement.remove(keepFrom);

  getKnownRayons().forEach(rayon => {
    const option = document.createElement('option');
    option.value       = rayon;
    option.textContent = rayon;
    selectElement.appendChild(option);
  });

  if (currentValue && [...selectElement.options].some(o => o.value === currentValue)) {
    selectElement.value = currentValue;
  }
}

// ─────────────────────────────────────────────
// 6. SIDEBAR
// ─────────────────────────────────────────────

/**
 * Construit le contenu de la sidebar (navigation filtrée par
 * permissions, sections vides supprimées) et les boutons d'action
 * du header.
 * @returns {void}
 */
function buildSidebar() {
  /** @type {boolean} */
  const isCollaborateur = CU && CU.role === 'collaborateur';

  /** @type {NavItem[]} */
  const navItems = [
    { section: 'Principal' },
    { id: 'dashboard',          icon: 'ti-dashboard',       label: 'Tableau de bord' },
    hasPerm('aud-r') && { id: 'audits',              icon: 'ti-clipboard-check', label: 'Audits FSQS' },
    hasPerm('aud-w') && { id: 'brouillons',          icon: 'ti-player-pause',    label: 'Brouillons' },
    hasPerm('ac')    && { id: 'actions',             icon: 'ti-tool',            label: 'Actions correctives' },
    !isCollaborateur && { id: 'audit-qualimetre',    icon: 'ti-rosette',         label: 'Audit Qualimètre', style: 'color:#c4b5fd' },
    { section: 'Analyse' },
    hasPerm('rap')   && { id: 'rapports',            icon: 'ti-file-analytics',  label: 'Rapport FSQS' },
    hasPerm('rap')   && { id: 'rapport-qualimetre',  icon: 'ti-gauge',           label: 'Rapport Qualimètre', style: 'color:#c4b5fd' },
    hasPerm('nc')    && { id: 'nc',                  icon: 'ti-alert-triangle',  label: 'Non-conformités', badge: 'nc-bdg' },
    { section: 'Paramètres' },
    hasPerm('usr')    && { id: 'utilisateurs',       icon: 'ti-users',           label: 'Utilisateurs' },
    hasPerm('grille') && { id: 'grille',             icon: 'ti-list-check',      label: 'Grille d\'audit' },
    hasPerm('grille') && { id: 'grille-qualimetre',  icon: 'ti-adjustments',     label: 'Grille Qualimètre', style: 'color:#c4b5fd' },
    hasPerm('mag')    && { id: 'magasins',           icon: 'ti-building-store',  label: 'Magasins' },
    hasPerm('mag')    && { id: 'rayons',             icon: 'ti-category',        label: 'Rayons' },
    CU && CU.role === 'admin' && { id: 'backup',     icon: 'ti-database-export', label: 'Sauvegarde' },
  ].filter(Boolean);

  /** @type {NavItem[]} */
  const cleanedItems = _removeEmptySections(navItems);

  el('sb-nav').innerHTML = cleanedItems.map(item => {
    if (item.section) return `<div class="nav-sec">${item.section}</div>`;
    /** @type {string} */
    const iconStyle = item.style ? ` style="${item.style}"` : '';
    return `<div class="nav-item" id="nav-${item.id}" onclick="navigate('${item.id}')">
      <i class="ti ${item.icon}"${iconStyle}></i> ${item.label}
      ${item.badge ? `<span class="nav-badge" id="${item.badge}">0</span>` : ''}
    </div>`;
  }).join('');

  _buildHeaderActions(isCollaborateur);
  _bindMobileMenuToggle();
}

/**
 * Supprime les sections de navigation sans items (un en-tête de
 * section suivi immédiatement d'un autre en-tête, ou en fin de
 * liste, est retiré).
 * @param {NavItem[]} items
 * @returns {NavItem[]}
 */
function _removeEmptySections(items) {
  /** @type {NavItem[]} */
  const cleaned = [];
  for (let i = 0; i < items.length; i++) {
    if (!items[i].section) { cleaned.push(items[i]); continue; }
    /** @type {boolean} */
    const hasFollowingItems = items.slice(i + 1).some(x => !x.section);
    /** @type {boolean} */
    const nextIsSectionHeader = items[i + 1] && items[i + 1].section;
    if (hasFollowingItems && !nextIsSectionHeader) cleaned.push(items[i]);
  }
  return cleaned;
}

/**
 * Construit les boutons d'action du header selon le rôle (alerte
 * terrain toujours visible ; nouvel audit FSQS si permission
 * d'écriture ; nouvel audit Qualimètre sauf pour un collaborateur).
 * @param {boolean} isCollaborateur
 * @returns {void}
 */
function _buildHeaderActions(isCollaborateur) {
  /** @type {boolean|0|undefined} */
  const canAudit    = hasPerm('aud-w');
  /** @type {string} */
  const qualButton  = !isCollaborateur
    ? `<button class="btn btn-primary" style="background:#7c3aed;border-color:#7c3aed" onclick="openQualAuditModal()">
        <i class="ti ti-clipboard-plus"></i> Nouvel audit Qualimètre
       </button>`
    : '';
  /** @type {string} */
  const auditButton = canAudit
    ? `<button class="btn btn-primary" onclick="openAuditModal()">
        <i class="ti ti-plus"></i> Nouvel audit
       </button>`
    : '';

  el('hdr-actions').innerHTML =
    `<button class="btn btn-danger" onclick="openAlertModal()">
       <i class="ti ti-bell-ringing"></i> Alerte terrain
     </button>
     ${auditButton}
     ${qualButton}`;
}

/**
 * Lie le bouton de bascule du menu mobile (ouverture/fermeture de
 * la sidebar + overlay), si le bouton existe dans le DOM.
 * @returns {void}
 */
function _bindMobileMenuToggle() {
  const toggle = document.querySelector('.menu-toggle');
  if (!toggle) return;
  toggle.onclick = () => {
    el('sidebar').classList.toggle('open');
    const overlay = el('sb-overlay');
    if (overlay) overlay.style.display = el('sidebar').classList.contains('open') ? 'block' : 'none';
  };
}

/**
 * Met à jour les informations utilisateur dans la sidebar (avatar
 * initiales, nom, libellé de rôle).
 * @returns {void}
 */
function updateSBUser() {
  if (!CU) return;
  /** @type {string} */
  const initials = CU.nom.split(' ').map(part => part[0]).join('').slice(0, 2).toUpperCase();
  el('sb-av').textContent   = initials;
  el('sb-name').textContent = CU.nom;
  el('sb-role').textContent = ROLE_LABELS[CU.role] || CU.role;
}

// ─────────────────────────────────────────────
// 7. NAVIGATION
// ─────────────────────────────────────────────

/**
 * Résout la fonction de rendu associée à une page, au moment de
 * l'appel (et non au chargement de ui.js).
 *
 * ⚠️ CORRIGÉ : auparavant, ce mapping était un objet littéral
 * `const PAGE_RENDERERS = { dashboard: renderDash, ... }` construit
 * au chargement de ui.js. Comme ui.js est chargé AVANT les fichiers
 * métier (dashboard.js, audits.js, etc. — voir l'ordre des <script>
 * dans Qualistore.html/index.html), les fonctions comme renderDash
 * n'existaient pas encore au moment où cet objet était évalué, ce
 * qui provoquait un `ReferenceError: renderDash is not defined`
 * interrompant tout le script ui.js, et par cascade rendant
 * navigate() inutilisable pour toute la session (TDZ sur les
 * constantes déclarées après ce point, dont PAGE_METADATA n'était
 * pas affecté car déclaré avant, mais PAGE_RENDERERS si).
 *
 * En transformant ce mapping en fonction appelée à l'usage, les
 * noms (renderDash, renderAudits, etc.) ne sont lus que lorsque
 * navigate() est réellement invoquée — à ce moment-là, tous les
 * scripts ont fini de se charger, donc plus de problème d'ordre.
 *
 * Les fonctions référencées (renderDash, renderAudits, etc.) restent
 * définies dans leurs fichiers respectifs ; aucune n'a été déplacée
 * ni renommée par cette correction.
 * @param {PageId | string} pageId
 * @returns {(() => void) | undefined}
 */
function _getPageRenderer(pageId) {
  /** @type {Record<PageId, () => void>} */
  const renderers = {
    dashboard:           renderDash,
    audits:              renderAudits,
    nc:                  renderNC,
    actions:             renderActions,
    magasins:            renderMag,
    rayons:              renderRay,
    rapports:            renderRap,
    'rapport-qualimetre': renderRapportQualimetre,
    utilisateurs:        renderUsers,
    grille:              () => showGrille(),
    qualimetre:          showQualimetre,
    'audit-qualimetre':  renderQualAudits,
    'grille-qualimetre': showGrilleQualimetre,
    brouillons:          renderDrafts,
    backup:              () => {},
  };
  return renderers[pageId];
}

/**
 * Navigue vers une page : bascule les classes 'active' (pages et
 * items de nav), met à jour le titre/sous-titre, ferme la sidebar
 * sur mobile, puis déclenche le rendu de la page cible.
 * @param {PageId | string} pageId
 * @returns {void}
 */
function navigate(pageId) {
  document.querySelectorAll('.page').forEach(p => p.classList.remove('active'));
  document.querySelectorAll('.nav-item').forEach(n => n.classList.remove('active'));

  const targetPage = el(`page-${pageId}`);
  if (!targetPage) return;

  targetPage.classList.add('active');
  el(`nav-${pageId}`)?.classList.add('active');

  /** @type {[string, string]} */
  const [title, subtitle] = PAGE_METADATA[pageId] || [pageId, ''];
  el('pg-title').textContent = title;
  el('pg-sub').textContent   = subtitle;

  // Fermer la sidebar sur mobile
  if (window.innerWidth <= 900) {
    el('sidebar').classList.remove('open');
    const overlay = el('sb-overlay');
    if (overlay) overlay.style.display = 'none';
  }

  _getPageRenderer(pageId)?.();
}
