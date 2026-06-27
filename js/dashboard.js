// ══════════════════════════════════════════════════════════════
// DASHBOARD — Tableau de bord FSQS & Qualimètre
// Dépend de : storage.js (DB, CU), ui.js, auth.js (hasPerm),
//   rayons.js (getKnownRayons, RAYONS_BASE_SEED)
// ══════════════════════════════════════════════════════════════

// ─────────────────────────────────────────────
// 0. TYPEDEFS JSDoc (pour inférence VSCode / TypeScript)
//    ⚠️ Déduits de l'usage dans ce fichier. QualAudit n'est ici que
//    LU (jamais construit) — confiance moyenne-élevée, à confirmer
//    si un fichier audit-qualimetre.js est fourni.
//
//    ⚠️ DUPLICATION HISTORIQUE RÉSOLUE : RAYONS_FSQS pointait vers
//    une copie figée strictement identique à RAYONS_LIST (rayons.js).
//    Les deux sont désormais des alias de RAYONS_BASE_SEED
//    (rayons.js) ; la vraie source de vérité dynamique est
//    getKnownRayons() — voir rayons.js.
// ─────────────────────────────────────────────

/**
 * Résultat de zone au sein d'un audit Qualimètre (PAS la même chose
 * que QMZone dans config.js, qui décrit une zone définie plutôt
 * qu'un résultat chiffré pour un audit donné).
 * @typedef {Object} QualAuditZoneResult
 * @property {string} nom
 * @property {number} [nc] - Nombre de non-conformités relevées dans cette zone.
 */

/**
 * Audit "Qualimètre" (variante d'audit distincte des Audit FSQS,
 * voir storage.js). Propriétés observées en lecture dans ce fichier
 * uniquement — structure de construction non observée ici.
 * @typedef {Object} QualAudit
 * @property {string} id
 * @property {string} mid - Référence vers Magasin.id.
 * @property {string} date
 * @property {string} [num] - Numéro d'audit lisible, distinct de .id.
 * @property {string} [aud] - Nom de l'auditeur.
 * @property {number} [score] - Score 0-100 ; peut être null/undefined (testé via != null).
 * @property {number} [nc] - Nombre de non-conformités ; testé avec fallback || 0.
 * @property {QualAuditZoneResult[]} [zones]
 */

/**
 * Audit FSQS. Seules .mid, .rayon, .score, .nc, .date, .mag, .aud,
 * .id sont accédées dans ce fichier ; structure complète dans audits.js.
 * @typedef {Object} Audit
 * @property {string} id
 * @property {string} mid
 * @property {string} mag
 * @property {string} rayon
 * @property {string} date
 * @property {string} aud
 * @property {number} score
 * @property {number} nc
 */

/**
 * Non-conformité. Seule .mid et .statut sont accédées dans ce
 * fichier ; structure complète dans nc.js.
 * @typedef {Object} NC
 * @property {string} mid
 * @property {'Ouverte'|'En cours'|'Clôturée'} statut
 */

/**
 * Action corrective. Seules .statut et .ech sont accédées dans ce
 * fichier ; structure complète dans actions.js.
 * @typedef {Object} Action
 * @property {'Ouverte'|'En cours'|'Traitée'} statut
 * @property {string} ech
 */

/**
 * Magasin. Seules .id et .nom sont accédées dans ce fichier ;
 * structure complète dans magasins.js.
 * @typedef {Object} Magasin
 * @property {string} id
 * @property {string} nom
 */

/**
 * Nom de palette de couleurs de score.
 * @typedef {'excellent'|'satisfaisant'|'ameliorer'|'insuffisant'} ScorePaletteName
 */

// ─────────────────────────────────────────────
// 1. CONSTANTES
// ─────────────────────────────────────────────

/**
 * Palettes de couleurs de score pour les graphiques en barres.
 * @type {Record<ScorePaletteName, string[]>}
 */
const CHART_SCORE_PALETTES = {
  excellent:   ['#16a34a', '#15803d', '#22c55e', '#4ade80', '#86efac'],
  satisfaisant:['#ca8a04', '#a16207', '#eab308', '#facc15', '#fde047'],
  ameliorer:   ['#ea580c', '#c2410c', '#f97316', '#fb923c', '#fdba74'],
  insuffisant: ['#dc2626', '#b91c1c', '#ef4444', '#f87171', '#fca5a5'],
};

/**
 * ⚠️ CHANGÉ : RAYONS_FSQS n'est plus une liste fermée utilisée pour
 * valider quoi que ce soit — préférer getKnownRayons() (rayons.js)
 * dans tout nouveau code. Conservée comme tableau autonome (et non
 * comme référence vers RAYONS_BASE_SEED, rayons.js) car l'ordre de
 * chargement des scripts dans Qualistore.html place dashboard.js
 * AVANT rayons.js — une référence directe provoquerait une
 * ReferenceError au chargement (les `const` top-level s'évaluent
 * immédiatement, contrairement aux déclarations `function`, qui
 * bénéficient du hoisting). Les valeurs doivent rester identiques à
 * RAYONS_BASE_SEED par convention, pas par référence.
 * @type {string[]}
 * @deprecated Utiliser getKnownRayons().
 */
const RAYONS_FSQS = ['Boucherie', 'Boulangerie', 'Drive', 'Marée', 'Charcuterie', 'Fromage', 'Fruits & Légumes'];

// ─────────────────────────────────────────────
// 2. ÉTAT
// ─────────────────────────────────────────────

/** @type {Chart | null} Instance Chart.js du graphique FSQS par magasin (détruite/recréée à chaque rendu). */
let _chartFsqs = null;
/** @type {Chart | null} Instance Chart.js du graphique Qualimètre par magasin. */
let _chartQual = null;

// ─────────────────────────────────────────────
// 3. UTILITAIRES GRAPHIQUES
// ─────────────────────────────────────────────

/**
 * Retourne une couleur de la palette correspondant au score,
 * en faisant tourner les teintes pour différencier les magasins.
 */
/**
 * Retourne une couleur de la palette correspondant au score,
 * en faisant tourner les teintes pour différencier les magasins.
 * @param {number} score - Score 0-100.
 * @param {number} index - Index du magasin dans la liste affichée (pour varier la teinte au sein de la palette).
 * @returns {string} Couleur hexadécimale.
 */
function _scoreColor(score, index) {
  /** @type {string[]} */
  const palette =
    score >= 90 ? CHART_SCORE_PALETTES.excellent :
    score >= 75 ? CHART_SCORE_PALETTES.satisfaisant :
    score >= 60 ? CHART_SCORE_PALETTES.ameliorer :
                  CHART_SCORE_PALETTES.insuffisant;
  return palette[index % palette.length];
}

/**
 * Construit (ou reconstruit) un graphique en barres avec Chart.js,
 * affichant un score moyen par étiquette.
 * @param {string} canvasId - Id de l'élément `<canvas>` cible.
 * @param {string[]} labels
 * @param {number[]} data - Scores 0-100, alignés avec `labels`.
 * @param {string[]} colors - Couleurs hexadécimales, alignées avec `labels`.
 * @param {Chart | null} [existingChart] - Instance précédente à détruire avant recréation, si présente.
 * @returns {Chart | null} La nouvelle instance Chart.js, ou null si le canvas n'existe pas.
 */
function buildBarChart(canvasId, labels, data, colors, existingChart) {
  const canvas = el(canvasId);
  if (!canvas) return null;
  if (existingChart) existingChart.destroy();

  return new Chart(canvas, {
    type: 'bar',
    data: {
      labels,
      datasets: [{
        label:           'Score moyen',
        data,
        backgroundColor: colors.map(c => c + '99'),
        borderColor:     colors,
        borderWidth:     2,
        borderRadius:    6,
      }],
    },
    options: {
      responsive:          true,
      maintainAspectRatio: false,
      plugins: {
        legend: { display: false },
        tooltip: { callbacks: { label: ctx => ` Score moyen : ${ctx.parsed.y}%` } },
      },
      scales: {
        y: { min: 0, max: 100, ticks: { callback: v => v + '%' } },
      },
    },
  });
}

/**
 * Construit (ou reconstruit) un graphique en courbes avec Chart.js
 * (utilisé pour l'évolution du score au fil des audits).
 * @param {string} canvasId - Id de l'élément `<canvas>` cible.
 * @param {Array<Object>} datasets - Datasets au format natif Chart.js (non typés en détail ici).
 * @param {Chart | null} [existingChart] - Instance précédente à détruire avant recréation, si présente.
 * @returns {Chart | null}
 */
function buildLineChart(canvasId, datasets, existingChart) {
  const canvas = el(canvasId);
  if (!canvas) return null;
  if (existingChart) existingChart.destroy();

  return new Chart(canvas, {
    type: 'line',
    data: { datasets },
    options: {
      responsive:          true,
      maintainAspectRatio: false,
      interaction:         { mode: 'index', intersect: false },
      plugins: {
        legend:  { position: 'bottom', labels: { boxWidth: 12, font: { size: 12 } } },
        tooltip: { callbacks: { label: ctx => ` ${ctx.dataset.label} : ${ctx.parsed.y}%` } },
      },
      scales: {
        x: { type: 'linear', title: { display: true, text: 'N° audit' }, ticks: { stepSize: 1 }, min: 1 },
        y: { min: 0, max: 100, title: { display: true, text: 'Score (%)' }, ticks: { callback: v => v + '%' } },
      },
    },
  });
}

// ─────────────────────────────────────────────
// 4. DASHBOARD FSQS
// ─────────────────────────────────────────────

/**
 * Affiche le tableau de bord FSQS complet : compteurs principaux,
 * performances par rayon, graphique par magasin, derniers audits,
 * alertes actives, puis délègue au dashboard Qualimètre.
 * @returns {void}
 */
function renderDash() {
  /** @type {string[]} */
  const visibleStoreIds = visibleMids();
  /** @type {Audit[]} */
  const myAudits  = DB.audits.filter(a => visibleStoreIds.includes(a.mid));
  /** @type {NC[]} */
  const myNcs     = DB.ncs.filter(n => visibleStoreIds.includes(n.mid));
  /** @type {Action[]} */
  const overdueActions = DB.actions.filter(a => a.statut !== 'Traitée' && overdue(a.ech));

  /** @type {number} */
  const openNcCount = myNcs.filter(n => n.statut === 'Ouverte').length;
  /** @type {number | null} */
  const avgScore    = myAudits.length
    ? Math.round(myAudits.reduce((sum, a) => sum + a.score, 0) / myAudits.length)
    : null;

  el('d-audits').textContent = myAudits.length;
  el('d-nc').textContent     = openNcCount;
  el('d-ret').textContent    = overdueActions.length;
  el('d-score').textContent  = avgScore !== null ? avgScore + '%' : '–';

  const ncBadge = el('nc-bdg');
  if (ncBadge) ncBadge.textContent = openNcCount;

  renderRayonDash();
  _renderFsqsChart(visibleStoreIds, myAudits);
  _renderLastAudits(myAudits);
  renderAlertsDash();
  renderDashQual();
}

/**
 * Affiche les 5 derniers audits FSQS dans le tableau dédié du
 * dashboard.
 * @param {Audit[]} audits
 * @returns {void}
 */
function _renderLastAudits(audits) {
  const tbody = el('d-last');
  if (!audits.length) {
    tbody.innerHTML = `<tr><td colspan="7"><div class="empty-state" style="padding:24px">
      <i class="ti ti-clipboard-check" style="font-size:28px"></i><p>Aucun audit</p>
    </div></td></tr>`;
    return;
  }

  tbody.innerHTML = [...audits].reverse().slice(0, 5).map(audit => `<tr>
    <td>${audit.mag}</td>
    <td style="display:flex;align-items:center;gap:6px;padding-top:14px">${rIcon(audit.rayon)} ${audit.rayon}</td>
    <td>${fd(audit.date)}</td>
    <td>${audit.aud}</td>
    <td>${sbadge(audit.score)}</td>
    <td style="color:${audit.nc > 0 ? 'var(--danger)' : 'var(--success)'};font-weight:600">${audit.nc}</td>
    <td><button class="btn btn-secondary btn-sm" onclick="showAud('${audit.id}')"><i class="ti ti-eye"></i></button></td>
  </tr>`).join('');
}

/**
 * Construit (ou retire) le graphique en barres du score moyen par
 * magasin, pour le dashboard FSQS.
 * @param {string[]} storeIds - Magasins visibles.
 * @param {Audit[]} audits - Audits déjà filtrés pour ces magasins.
 * @returns {void}
 */
function _renderFsqsChart(storeIds, audits) {
  /** @type {{name: string, avg: number, color: string}[]} */
  const storesWithData = DB.magasins
    .filter(m => storeIds.includes(m.id))
    .map((store, index) => {
      /** @type {Audit[]} */
      const storeAudits = audits.filter(a => a.mid === store.id);
      if (!storeAudits.length) return null;
      /** @type {number} */
      const avg = Math.round(storeAudits.reduce((sum, a) => sum + a.score, 0) / storeAudits.length);
      return { name: store.nom, avg, color: _scoreColor(avg, index) };
    })
    .filter(Boolean);

  const container = el('d-mag');
  if (!container) return;

  if (!storesWithData.length) {
    container.innerHTML = `<div class="empty-state" style="padding:24px">
      <i class="ti ti-chart-bar" style="font-size:28px"></i><p>Aucune donnée</p>
    </div>`;
    return;
  }

  container.innerHTML = '<div style="position:relative;height:260px"><canvas id="chart-fsqs"></canvas></div>';
  _chartFsqs = buildBarChart(
    'chart-fsqs',
    storesWithData.map(s => s.name),
    storesWithData.map(s => s.avg),
    storesWithData.map(s => s.color),
    _chartFsqs
  );
}

/**
 * Affiche le score moyen par rayon FSQS dans le widget dédié du
 * dashboard, filtré par magasin si un sélecteur est présent. Itère
 * sur getKnownRayons() (rayons.js) — tout rayon créé, importé ou
 * renommé apparaît automatiquement ici, sans liste fixe à maintenir.
 * @returns {void}
 */
function renderRayonDash() {
  /** @type {string[]} */
  const storeIds  = visibleMids();
  const filterSel = el('d-ray-mag-filter');
  populateMagSelect(filterSel);
  /** @type {string} */
  const filterMid = filterSel ? filterSel.value : '';

  /** @type {Audit[]} */
  const filteredAudits = DB.audits.filter(a => {
    if (!storeIds.includes(a.mid)) return false;
    if (filterMid && a.mid !== filterMid) return false;
    return true;
  });

  el('d-ray').innerHTML = getKnownRayons().map(rayon => {
    /** @type {Audit[]} */
    const rayonAudits = filteredAudits.filter(a => a.rayon === rayon);
    /** @type {number | null} */
    const score = rayonAudits.length
      ? Math.round(rayonAudits.reduce((sum, a) => sum + a.score, 0) / rayonAudits.length)
      : null;

    return `<div style="display:flex;align-items:center;gap:10px;margin-bottom:14px">
      ${rIcon(rayon)}
      <div style="flex:1">
        <div style="display:flex;justify-content:space-between;margin-bottom:4px">
          <span style="font-size:13px;font-weight:500">${rayon}</span>
          <span style="font-size:13px;font-weight:700;color:${score !== null ? sc(score) : 'var(--text3)'}">
            ${score !== null ? score + '%' : '–'}
          </span>
        </div>
        ${score !== null ? pbar(score) : ''}
      </div>
    </div>`;
  }).join('');
}

// ─────────────────────────────────────────────
// 5. DASHBOARD QUALIMÈTRE
// ─────────────────────────────────────────────

/**
 * Affiche le tableau de bord Qualimètre complet : compteurs
 * principaux, graphique par magasin, top zones en NC, derniers
 * audits Qualimètre.
 * @returns {void}
 */
function renderDashQual() {
  /** @type {string[]} */
  const storeIds  = visibleMids();
  /** @type {QualAudit[]} */
  const qualAudits = (DB.qualAudits || []).filter(a => storeIds.includes(a.mid));

  /** @type {number} */
  const totalNc  = qualAudits.reduce((sum, a) => sum + (a.nc || 0), 0);
  /** @type {number | null} */
  const avgScore = qualAudits.length
    ? Math.round(qualAudits.reduce((sum, a) => sum + (a.score || 0), 0) / qualAudits.length)
    : null;

  el('dq-audits').textContent = qualAudits.length;
  el('dq-nc').textContent     = totalNc;
  el('dq-score').textContent  = avgScore !== null ? avgScore + '%' : '–';
  el('dq-mags').textContent   = new Set(qualAudits.map(a => a.mid)).size;

  _renderQualChart(storeIds, qualAudits);
  _renderTopZonesNc(qualAudits);
  _renderLastQualAudits(qualAudits);
}

/**
 * Construit (ou retire) le graphique en barres du score moyen
 * Qualimètre par magasin.
 * @param {string[]} storeIds
 * @param {QualAudit[]} qualAudits
 * @returns {void}
 */
function _renderQualChart(storeIds, qualAudits) {
  /** @type {{name: string, avg: number, color: string}[]} */
  const storesWithData = DB.magasins
    .filter(m => storeIds.includes(m.id))
    .map((store, index) => {
      /** @type {QualAudit[]} */
      const storeAudits = qualAudits.filter(a => a.mid === store.id);
      if (!storeAudits.length) return null;
      /** @type {number} */
      const avg = Math.round(storeAudits.reduce((sum, a) => sum + (a.score || 0), 0) / storeAudits.length);
      return { name: store.nom, avg, color: _scoreColor(avg, index) };
    })
    .filter(Boolean);

  const container = el('dq-mag');
  if (!container) return;

  if (!storesWithData.length) {
    container.innerHTML = `<div class="empty-state" style="padding:24px">
      <i class="ti ti-chart-bar" style="font-size:28px"></i><p>Aucune donnée</p>
    </div>`;
    return;
  }

  container.innerHTML = '<div style="position:relative;height:260px"><canvas id="chart-qual"></canvas></div>';
  _chartQual = buildBarChart(
    'chart-qual',
    storesWithData.map(s => s.name),
    storesWithData.map(s => s.avg),
    storesWithData.map(s => s.color),
    _chartQual
  );
}

/**
 * Affiche les 5 zones Qualimètre les plus en non-conformité,
 * agrégées sur l'ensemble des audits Qualimètre fournis.
 * @param {QualAudit[]} qualAudits
 * @returns {void}
 */
function _renderTopZonesNc(qualAudits) {
  /** @type {Record<string, number>} */
  const zoneNcCounts = {};
  qualAudits.forEach(audit =>
    (audit.zones || []).forEach(zone => {
      if (zone.nc) zoneNcCounts[zone.nom] = (zoneNcCounts[zone.nom] || 0) + zone.nc;
    })
  );

  /** @type {[string, number][]} */
  const topZones = Object.entries(zoneNcCounts).sort((a, b) => b[1] - a[1]).slice(0, 5);

  el('dq-zones').innerHTML = topZones.length
    ? topZones.map(([name, count]) => `
        <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:10px">
          <span style="font-size:13px">${name}</span>
          <span class="badge b-open">${count} NC</span>
        </div>`).join('')
    : `<div class="empty-state" style="padding:24px">
         <i class="ti ti-circle-check" style="font-size:28px;color:#16a34a"></i><p>Aucune NC</p>
       </div>`;
}

/**
 * Affiche les 5 derniers audits Qualimètre dans le tableau dédié du
 * dashboard.
 * @param {QualAudit[]} qualAudits
 * @returns {void}
 */
function _renderLastQualAudits(qualAudits) {
  const tbody = el('dq-last');
  if (!qualAudits.length) {
    tbody.innerHTML = `<tr><td colspan="7"><div class="empty-state" style="padding:24px">
      <i class="ti ti-rosette" style="font-size:28px"></i><p>Aucun audit Qualimètre</p>
    </div></td></tr>`;
    return;
  }

  tbody.innerHTML = [...qualAudits].reverse().slice(0, 5).map(audit => {
    /** @type {Magasin | undefined} */
    const store = DB.magasins.find(m => m.id === audit.mid);
    return `<tr>
      <td>${audit.num || '–'}</td>
      <td>${store ? store.nom : '–'}</td>
      <td>${fd(audit.date)}</td>
      <td>${audit.aud || '–'}</td>
      <td>${audit.score != null ? sbadge(audit.score) : '–'}</td>
      <td style="color:${(audit.nc || 0) > 0 ? 'var(--danger)' : 'var(--success)'};font-weight:600">${audit.nc || 0}</td>
      <td><button class="btn btn-secondary btn-sm" onclick="navigate('audit-qualimetre')"><i class="ti ti-eye"></i></button></td>
    </tr>`;
  }).join('');
}

// ─────────────────────────────────────────────
// 6. ONGLETS DASHBOARD (FSQS / Qualimètre)
// ─────────────────────────────────────────────

/**
 * Bascule l'onglet actif du dashboard entre FSQS et Qualimètre,
 * en stylant les boutons d'onglet et en affichant le panneau
 * correspondant.
 * @param {'fsqs'|'qualimetre'|string} tab
 * @returns {void}
 */
function switchDashTab(tab) {
  /** @type {boolean} */
  const isFsqs   = tab === 'fsqs';
  const fsqsBtn  = el('dash-tab-fsqs');
  const qualBtn  = el('dash-tab-qual');
  const fsqsPane = el('dash-fsqs');
  const qualPane = el('dash-qual');

  if (fsqsBtn) fsqsBtn.classList.toggle('active', isFsqs);
  if (qualBtn) qualBtn.classList.toggle('active', !isFsqs);
  if (fsqsPane) fsqsPane.style.display = isFsqs ? '' : 'none';
  if (qualPane) qualPane.style.display = !isFsqs ? '' : 'none';
}
