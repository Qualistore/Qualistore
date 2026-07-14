// ══════════════════════════════════════════════════════════════
// DASHBOARD — Tableau de bord FSQS & Qualimètre
// Dépend de : storage.js (DB, CU), ui.js, auth.js (hasPerm),
//   rayons.js (getKnownRayons, RAYONS_BASE_SEED),
//   import-grille.js (_escapeHtml, _escapeHtmlAttr — chargé avant),
//   rapport-qualimetre.js (exportPDF — appelé à l'usage uniquement),
//   metrologie.js (checkMetrologieEcheances — appelé à l'usage, avec
//   garde typeof car chargé après ce fichier).
//
// ⚠️ CHANGÉ (statistiques par période) : toutes les statistiques du
// tableau de bord (FSQS ET Qualimètre) peuvent être filtrées par
// période calendaire — mois, trimestre ou semestre — via les menus
// #dash-period-type / #dash-period-value. Les périodes proposées
// sont DÉDUITES DES DATES RÉELLEMENT PRÉSENTES dans les audits
// visibles (aucune liste codée en dur). Bouton « Exporter PDF »
// (#dash-export-btn) : rapport PDF de la période choisie, limité aux
// magasins accessibles (visibleMids).
//
// ⚠️ CORRIGÉ (sécurité) : valeurs dynamiques échappées via
// _escapeHtml (protection XSS).
// ⚠️ CORRIGÉ (bug) : « Actions en retard » filtré par magasins
// accessibles via la NC liée (même logique que renderActions).
// ══════════════════════════════════════════════════════════════

// ─────────────────────────────────────────────
// 0. TYPEDEFS JSDoc (pour inférence VSCode / TypeScript)
// ─────────────────────────────────────────────

/**
 * Résultat de zone au sein d'un audit Qualimètre.
 * @typedef {Object} QualAuditZoneResult
 * @property {string} nom
 * @property {number} [nc] - Nombre de non-conformités relevées dans cette zone.
 */

/**
 * Audit "Qualimètre" (variante d'audit distincte des Audit FSQS).
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
 * Audit FSQS. Structure complète dans audits.js.
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
 * Non-conformité. Structure complète dans nc.js.
 * @typedef {Object} NC
 * @property {string} id
 * @property {string} mid
 * @property {string} date - Date de l'audit d'origine ('YYYY-MM-DD').
 * @property {'Ouverte'|'En cours'|'Clôturée'} statut
 */

/**
 * Action corrective. Structure complète dans actions.js.
 * @typedef {Object} Action
 * @property {string} ncId - Référence vers NC.id.
 * @property {'Ouverte'|'En cours'|'Traitée'} statut
 * @property {string} ech
 */

/**
 * Magasin. Structure complète dans magasins.js.
 * @typedef {Object} Magasin
 * @property {string} id
 * @property {string} nom
 */

/**
 * Nom de palette de couleurs de score.
 * @typedef {'excellent'|'satisfaisant'|'ameliorer'|'insuffisant'} ScorePaletteName
 */

/**
 * Type de période du tableau de bord.
 * @typedef {'all'|'month'|'quarter'|'semester'} DashPeriodType
 */

/**
 * Bornes d'une période calendaire, dates ISO 'YYYY-MM-DD' incluses.
 * @typedef {Object} DashPeriodRange
 * @property {string} start
 * @property {string} end
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
 * ⚠️ CHANGÉ : RAYONS_FSQS n'est plus une liste fermée — préférer
 * getKnownRayons() (rayons.js) dans tout nouveau code.
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

/** @type {DashPeriodType} Type de période actuellement sélectionné. */
let _dashPeriodType = 'all';
/** @type {string} Période précise sélectionnée ('' si type 'all' ; sinon 'YYYY-MM', 'YYYY-Qn' ou 'YYYY-Sn'). */
let _dashPeriodValue = '';

// ─────────────────────────────────────────────
// 3. UTILITAIRES GRAPHIQUES
// ─────────────────────────────────────────────

/**
 * Retourne une couleur de la palette correspondant au score.
 * @param {number} score - Score 0-100.
 * @param {number} index - Index du magasin dans la liste affichée.
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
 * Construit (ou reconstruit) un graphique en barres avec Chart.js.
 * @param {string} canvasId
 * @param {string[]} labels
 * @param {number[]} data
 * @param {string[]} colors
 * @param {Chart | null} [existingChart]
 * @returns {Chart | null}
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
 * Construit (ou reconstruit) un graphique en courbes avec Chart.js.
 * @param {string} canvasId
 * @param {Array<Object>} datasets
 * @param {Chart | null} [existingChart]
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
// 3bis. PÉRIODE DU TABLEAU DE BORD
// ─────────────────────────────────────────────

/**
 * Handler du menu « type de période » (#dash-period-type).
 * @returns {void}
 */
function onDashPeriodTypeChange() {
  _dashPeriodType = /** @type {DashPeriodType} */ (v('dash-period-type'));
  _dashPeriodValue = '';
  _populateDashPeriodValues();
  renderDash();
}

/**
 * Handler du menu « période précise » (#dash-period-value).
 * @returns {void}
 */
function onDashPeriodValueChange() {
  _dashPeriodValue = v('dash-period-value');
  renderDash();
}

/**
 * Collecte toutes les dates des audits FSQS et Qualimètre visibles —
 * sert à déduire dynamiquement les périodes proposées.
 * @returns {string[]} Dates triées croissantes (peut être vide).
 */
function _dashAvailableDates() {
  /** @type {string[]} */
  const storeIds = visibleMids();
  /** @type {string[]} */
  const dates = [];
  DB.audits.forEach(a => { if (storeIds.includes(a.mid) && a.date) dates.push(a.date); });
  (DB.qualAudits || []).forEach(a => { if (storeIds.includes(a.mid) && a.date) dates.push(a.date); });
  return dates.sort();
}

/**
 * Libellé français d'un mois 'YYYY-MM' (ex : 'janvier 2026').
 * @param {string} yearMonth
 * @returns {string}
 */
function _dashMonthLabel(yearMonth) {
  const [year, month] = yearMonth.split('-').map(Number);
  return new Date(year, month - 1, 1).toLocaleDateString('fr-FR', { month: 'long', year: 'numeric' });
}

/**
 * (Re)construit les options du menu « période précise » selon le type
 * choisi, bornées par les dates réellement présentes dans les données.
 * @returns {void}
 */
function _populateDashPeriodValues() {
  /** @type {HTMLSelectElement | null} */
  const select = el('dash-period-value');
  if (!select) return;

  if (_dashPeriodType === 'all') {
    select.style.display = 'none';
    select.innerHTML = '';
    _dashPeriodValue = '';
    return;
  }

  /** @type {string[]} */
  const dates = _dashAvailableDates();
  /** @type {string} */
  const todayString = today();
  /** @type {string} */
  const minDate = dates.length ? dates[0] : todayString;

  /** @type {number} */
  const minYear  = parseInt(minDate.slice(0, 4), 10);
  /** @type {number} */
  const maxYear  = parseInt(todayString.slice(0, 4), 10);

  /** @type {{value: string, label: string}[]} */
  const options = [];

  if (_dashPeriodType === 'month') {
    /** @type {number} */
    let year  = maxYear;
    /** @type {number} */
    let month = parseInt(todayString.slice(5, 7), 10);
    /** @type {number} */
    const minMonth = parseInt(minDate.slice(5, 7), 10);
    while (year > minYear || (year === minYear && month >= minMonth)) {
      /** @type {string} */
      const value = `${year}-${String(month).padStart(2, '0')}`;
      options.push({ value, label: _dashMonthLabel(value) });
      month--;
      if (month === 0) { month = 12; year--; }
    }
  } else {
    /** @type {number} */
    const perYear = _dashPeriodType === 'quarter' ? 4 : 2;
    /** @type {number} */
    const monthsPerPeriod = 12 / perYear;
    /** @type {string} */
    const prefix = _dashPeriodType === 'quarter' ? 'T' : 'S';
    /** @type {number} */
    const currentIdx = Math.ceil(parseInt(todayString.slice(5, 7), 10) / monthsPerPeriod);
    /** @type {number} */
    const minIdx = Math.ceil(parseInt(minDate.slice(5, 7), 10) / monthsPerPeriod);
    /** @type {number} */
    let year = maxYear;
    /** @type {number} */
    let idx = currentIdx;
    while (year > minYear || (year === minYear && idx >= minIdx)) {
      options.push({ value: `${year}-${prefix}${idx}`, label: `${prefix}${idx} ${year}` });
      idx--;
      if (idx === 0) { idx = perYear; year--; }
    }
  }

  /** @type {string} */
  const previousValue = _dashPeriodValue;
  select.innerHTML = options
    .map(o => `<option value="${o.value}">${o.label}</option>`)
    .join('');
  select.style.display = '';

  if (previousValue && options.some(o => o.value === previousValue)) {
    select.value = previousValue;
  }
  _dashPeriodValue = select.value;
}

/**
 * Bornes de la période actuellement sélectionnée.
 * @returns {DashPeriodRange | null} null si « Toutes les périodes ».
 */
function _dashPeriodRange() {
  if (_dashPeriodType === 'all' || !_dashPeriodValue) return null;

  /** @type {string[]} */
  const [yearStr, part] = _dashPeriodValue.split('-');
  /** @type {number} */
  const year = parseInt(yearStr, 10);
  /** @type {number} */
  let startMonth;
  /** @type {number} */
  let endMonth;

  if (_dashPeriodType === 'month') {
    startMonth = endMonth = parseInt(part, 10);
  } else if (_dashPeriodType === 'quarter') {
    /** @type {number} */
    const quarter = parseInt(part.slice(1), 10);
    startMonth = (quarter - 1) * 3 + 1;
    endMonth   = quarter * 3;
  } else {
    /** @type {number} */
    const semester = parseInt(part.slice(1), 10);
    startMonth = semester === 1 ? 1 : 7;
    endMonth   = semester === 1 ? 6 : 12;
  }

  /** @param {number} n @returns {string} */
  const pad = n => String(n).padStart(2, '0');
  /** @type {number} */
  const lastDay = new Date(year, endMonth, 0).getDate();

  return {
    start: `${year}-${pad(startMonth)}-01`,
    end:   `${year}-${pad(endMonth)}-${pad(lastDay)}`,
  };
}

/**
 * Indique si une date ISO appartient à la période sélectionnée.
 * @param {string | undefined} dateString
 * @returns {boolean} Toujours true si « Toutes les périodes ».
 */
function _inDashPeriod(dateString) {
  /** @type {DashPeriodRange | null} */
  const range = _dashPeriodRange();
  if (!range) return true;
  if (!dateString) return false;
  return dateString >= range.start && dateString <= range.end;
}

/**
 * Filtre une liste d'objets datés (.date) sur la période sélectionnée.
 * @template {{date?: string}} T
 * @param {T[]} list
 * @returns {T[]}
 */
function _dashFilterPeriod(list) {
  if (_dashPeriodType === 'all' || !_dashPeriodValue) return list;
  return list.filter(item => _inDashPeriod(item.date));
}

/**
 * Libellé lisible de la période sélectionnée (pour l'export PDF).
 * @returns {string}
 */
function _dashPeriodLabel() {
  if (_dashPeriodType === 'all' || !_dashPeriodValue) return 'Toutes les périodes';
  if (_dashPeriodType === 'month') return _dashMonthLabel(_dashPeriodValue);
  /** @type {string[]} */
  const [year, part] = _dashPeriodValue.split('-');
  return `${part.startsWith('T') ? 'Trimestre' : 'Semestre'} ${part.slice(1)} — ${year}`;
}

// ─────────────────────────────────────────────
// 4. DASHBOARD FSQS
// ─────────────────────────────────────────────

/**
 * Affiche le tableau de bord FSQS complet, restreint aux magasins
 * accessibles ET à la période sélectionnée, puis délègue au
 * dashboard Qualimètre.
 * @returns {void}
 */
function renderDash() {
  _populateDashPeriodValues();

  /** @type {string[]} */
  const visibleStoreIds = visibleMids();
  /** @type {Audit[]} */
  const myAudits = _dashFilterPeriod(DB.audits.filter(a => visibleStoreIds.includes(a.mid)));
  /** @type {NC[]} */
  const myNcs = _dashFilterPeriod(DB.ncs.filter(n => visibleStoreIds.includes(n.mid)));

  // ⚠️ CORRIGÉ : filtre par magasins accessibles (via la NC liée) + période.
  /** @type {Action[]} */
  const overdueActions = DB.actions.filter(action => {
    if (action.statut === 'Traitée' || !overdue(action.ech)) return false;
    /** @type {NC | undefined} */
    const linkedNc = DB.ncs.find(nc => nc.id === action.ncId);
    if (!linkedNc || !visibleStoreIds.includes(linkedNc.mid)) return false;
    return _inDashPeriod(linkedNc.date);
  });

  /** @type {number} */
  const openNcCount = myNcs.filter(n => n.statut === 'Ouverte').length;
  /** @type {number | null} */
  const avgScore = myAudits.length
    ? Math.round(myAudits.reduce((sum, a) => sum + a.score, 0) / myAudits.length)
    : null;

  el('d-audits').textContent = myAudits.length;
  el('d-nc').textContent     = openNcCount;
  el('d-ret').textContent    = overdueActions.length;
  el('d-score').textContent  = avgScore !== null ? avgScore + '%' : '–';

  // Badge sidebar : compteur GLOBAL (toutes périodes).
  const ncBadge = el('nc-bdg');
  if (ncBadge) {
    ncBadge.textContent = DB.ncs.filter(n =>
      visibleStoreIds.includes(n.mid) && n.statut === 'Ouverte').length;
  }

  // Rappels métrologie automatiques (échéance ≤ 30 jours) — AVANT
  // renderAlertsDash pour affichage immédiat. Garde typeof :
  // metrologie.js est chargé après ce fichier.
  if (typeof checkMetrologieEcheances === 'function') checkMetrologieEcheances();

  renderRayonDash();
  _renderFsqsChart(visibleStoreIds, myAudits);
  _renderLastAudits(myAudits);
  renderAlertsDash();
  renderDashQual();
}

/**
 * Affiche les 5 derniers audits FSQS (période), triés par date desc.
 * @param {Audit[]} audits
 * @returns {void}
 */
function _renderLastAudits(audits) {
  const tbody = el('d-last');
  if (!tbody) return;
  if (!audits.length) {
    tbody.innerHTML = `<tr><td colspan="7"><div class="empty-state" style="padding:24px">
      <i class="ti ti-clipboard-check" style="font-size:28px"></i><p>Aucun audit</p>
    </div></td></tr>`;
    return;
  }

  tbody.innerHTML = [...audits]
    .sort((a, b) => (b.date || '').localeCompare(a.date || ''))
    .slice(0, 5)
    .map(audit => `<tr>
      <td>${_escapeHtml(audit.mag)}</td>
      <td style="display:flex;align-items:center;gap:6px;padding-top:14px">${rIcon(audit.rayon)} ${_escapeHtml(audit.rayon)}</td>
      <td>${fd(audit.date)}</td>
      <td>${_escapeHtml(audit.aud)}</td>
      <td>${sbadge(audit.score)}</td>
      <td style="color:${audit.nc > 0 ? 'var(--danger)' : 'var(--success)'};font-weight:600">${audit.nc}</td>
      <td><button class="btn btn-secondary btn-sm" onclick="showAud('${_escapeHtmlAttr(audit.id)}')"><i class="ti ti-eye"></i></button></td>
    </tr>`).join('');
}

/**
 * Score moyen par magasin (audits déjà filtrés) — partagé avec
 * l'export PDF.
 * @param {string[]} storeIds
 * @param {Array<{mid: string, score?: number, nc?: number}>} audits
 * @returns {{name: string, count: number, avg: number, nc: number, color: string}[]}
 */
function _computeStoreAverages(storeIds, audits) {
  return DB.magasins
    .filter(m => storeIds.includes(m.id))
    .map((store, index) => {
      /** @type {Array<{mid: string, score?: number, nc?: number}>} */
      const storeAudits = audits.filter(a => a.mid === store.id);
      if (!storeAudits.length) return null;
      /** @type {number} */
      const avg = Math.round(storeAudits.reduce((sum, a) => sum + (a.score || 0), 0) / storeAudits.length);
      /** @type {number} */
      const nc = storeAudits.reduce((sum, a) => sum + (a.nc || 0), 0);
      return { name: store.nom, count: storeAudits.length, avg, nc, color: _scoreColor(avg, index) };
    })
    .filter(Boolean);
}

/**
 * Graphique en barres FSQS par magasin.
 * @param {string[]} storeIds
 * @param {Audit[]} audits - Déjà filtrés (magasins + période).
 * @returns {void}
 */
function _renderFsqsChart(storeIds, audits) {
  /** @type {{name: string, avg: number, color: string}[]} */
  const storesWithData = _computeStoreAverages(storeIds, audits);

  const container = el('d-mag');
  if (!container) return;

  if (!storesWithData.length) {
    container.innerHTML = `<div class="empty-state" style="padding:24px">
      <i class="ti ti-chart-bar" style="font-size:28px"></i><p>Aucune donnée</p>
    </div>`;
    _chartFsqs = null;
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
 * Score moyen par rayon (audits déjà filtrés) — partagé avec
 * l'export PDF. Itère sur getKnownRayons() (data-driven).
 * @param {Audit[]} audits
 * @returns {{rayon: string, count: number, score: number | null}[]}
 */
function _computeRayonAverages(audits) {
  return getKnownRayons().map(rayon => {
    /** @type {Audit[]} */
    const rayonAudits = audits.filter(a => a.rayon === rayon);
    return {
      rayon,
      count: rayonAudits.length,
      score: rayonAudits.length
        ? Math.round(rayonAudits.reduce((sum, a) => sum + a.score, 0) / rayonAudits.length)
        : null,
    };
  });
}

/**
 * Widget « Par rayon », filtré par magasin éventuel + période.
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
  const filteredAudits = _dashFilterPeriod(DB.audits.filter(a => {
    if (!storeIds.includes(a.mid)) return false;
    if (filterMid && a.mid !== filterMid) return false;
    return true;
  }));

  const container = el('d-ray');
  if (!container) return;

  container.innerHTML = _computeRayonAverages(filteredAudits).map(({ rayon, score }) =>
    `<div style="display:flex;align-items:center;gap:10px;margin-bottom:14px">
      ${rIcon(rayon)}
      <div style="flex:1">
        <div style="display:flex;justify-content:space-between;margin-bottom:4px">
          <span style="font-size:13px;font-weight:500">${_escapeHtml(rayon)}</span>
          <span style="font-size:13px;font-weight:700;color:${score !== null ? sc(score) : 'var(--text3)'}">
            ${score !== null ? score + '%' : '–'}
          </span>
        </div>
        ${score !== null ? pbar(score) : ''}
      </div>
    </div>`).join('');
}

// ─────────────────────────────────────────────
// 5. DASHBOARD QUALIMÈTRE
// ─────────────────────────────────────────────

/**
 * Tableau de bord Qualimètre — mêmes filtres que le FSQS.
 * @returns {void}
 */
function renderDashQual() {
  /** @type {string[]} */
  const storeIds = visibleMids();
  /** @type {QualAudit[]} */
  const qualAudits = _dashFilterPeriod((DB.qualAudits || []).filter(a => storeIds.includes(a.mid)));

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
 * Graphique en barres Qualimètre par magasin.
 * @param {string[]} storeIds
 * @param {QualAudit[]} qualAudits - Déjà filtrés (magasins + période).
 * @returns {void}
 */
function _renderQualChart(storeIds, qualAudits) {
  /** @type {{name: string, avg: number, color: string}[]} */
  const storesWithData = _computeStoreAverages(storeIds, qualAudits);

  const container = el('dq-mag');
  if (!container) return;

  if (!storesWithData.length) {
    container.innerHTML = `<div class="empty-state" style="padding:24px">
      <i class="ti ti-chart-bar" style="font-size:28px"></i><p>Aucune donnée</p>
    </div>`;
    _chartQual = null;
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
 * Agrège le nombre de NC par zone Qualimètre — partagé avec
 * l'export PDF.
 * @param {QualAudit[]} qualAudits
 * @returns {[string, number][]} Paires [zone, total NC] triées desc.
 */
function _computeTopZonesNc(qualAudits) {
  /** @type {Record<string, number>} */
  const zoneNcCounts = {};
  qualAudits.forEach(audit =>
    (audit.zones || []).forEach(zone => {
      if (zone.nc) zoneNcCounts[zone.nom] = (zoneNcCounts[zone.nom] || 0) + zone.nc;
    })
  );
  return Object.entries(zoneNcCounts).sort((a, b) => b[1] - a[1]);
}

/**
 * Top 5 des zones Qualimètre en NC.
 * @param {QualAudit[]} qualAudits
 * @returns {void}
 */
function _renderTopZonesNc(qualAudits) {
  /** @type {[string, number][]} */
  const topZones = _computeTopZonesNc(qualAudits).slice(0, 5);

  el('dq-zones').innerHTML = topZones.length
    ? topZones.map(([name, count]) => `
        <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:10px">
          <span style="font-size:13px">${_escapeHtml(name)}</span>
          <span class="badge b-open">${count} NC</span>
        </div>`).join('')
    : `<div class="empty-state" style="padding:24px">
         <i class="ti ti-circle-check" style="font-size:28px;color:#16a34a"></i><p>Aucune NC</p>
       </div>`;
}

/**
 * 5 derniers audits Qualimètre (période), triés par date desc.
 * @param {QualAudit[]} qualAudits
 * @returns {void}
 */
function _renderLastQualAudits(qualAudits) {
  const tbody = el('dq-last');
  if (!tbody) return;
  if (!qualAudits.length) {
    tbody.innerHTML = `<tr><td colspan="7"><div class="empty-state" style="padding:24px">
      <i class="ti ti-rosette" style="font-size:28px"></i><p>Aucun audit Qualimètre</p>
    </div></td></tr>`;
    return;
  }

  tbody.innerHTML = [...qualAudits]
    .sort((a, b) => (b.date || '').localeCompare(a.date || ''))
    .slice(0, 5)
    .map(audit => {
      /** @type {Magasin | undefined} */
      const store = DB.magasins.find(m => m.id === audit.mid);
      return `<tr>
        <td>${audit.num ? _escapeHtml(audit.num) : '–'}</td>
        <td>${store ? _escapeHtml(store.nom) : '–'}</td>
        <td>${fd(audit.date)}</td>
        <td>${audit.aud ? _escapeHtml(audit.aud) : '–'}</td>
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
 * Bascule l'onglet actif du dashboard entre FSQS et Qualimètre.
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

// ─────────────────────────────────────────────
// 7. EXPORT PDF DES STATISTIQUES
// ─────────────────────────────────────────────

/**
 * Tableau simple pour l'export PDF (valeurs échappées par l'appelant).
 * @param {string[]} headers
 * @param {string[][]} rows
 * @returns {string}
 */
function _dashPdfTable(headers, rows) {
  /** @type {string} */
  const thStyle = 'padding:6px 10px;border:1px solid #d8dce6;background:#f2f4f8;text-align:left;font-size:11px';
  /** @type {string} */
  const tdStyle = 'padding:6px 10px;border:1px solid #d8dce6;font-size:11px';
  return `<table style="width:100%;border-collapse:collapse;margin-top:6px">
    <thead><tr>${headers.map(h => `<th style="${thStyle}">${h}</th>`).join('')}</tr></thead>
    <tbody>${rows.map(cells => `<tr>${cells.map(c => `<td style="${tdStyle}">${c}</td>`).join('')}</tr>`).join('')}</tbody>
  </table>`;
}

/**
 * Titre de section pour l'export PDF.
 * @param {string} title
 * @param {string} color
 * @returns {string}
 */
function _dashPdfSectionTitle(title, color) {
  return `<div style="font-size:14px;font-weight:700;margin:0 0 4px;padding-bottom:4px;border-bottom:2px solid ${color}">${title}</div>`;
}

/**
 * HTML complet du rapport PDF des statistiques (blocs .pdf-block pour
 * la pagination de exportPDF, rapport-qualimetre.js).
 * @returns {string}
 */
function _buildDashboardPdfHtml() {
  /** @type {string[]} */
  const storeIds = visibleMids();
  /** @type {Audit[]} */
  const audits = _dashFilterPeriod(DB.audits.filter(a => storeIds.includes(a.mid)));
  /** @type {NC[]} */
  const ncs = _dashFilterPeriod(DB.ncs.filter(n => storeIds.includes(n.mid)));
  /** @type {QualAudit[]} */
  const qualAudits = _dashFilterPeriod((DB.qualAudits || []).filter(a => storeIds.includes(a.mid)));

  /** @type {number | null} */
  const avgFsqs = audits.length
    ? Math.round(audits.reduce((sum, a) => sum + a.score, 0) / audits.length) : null;
  /** @type {number | null} */
  const avgQual = qualAudits.length
    ? Math.round(qualAudits.reduce((sum, a) => sum + (a.score || 0), 0) / qualAudits.length) : null;
  /** @type {number} */
  const openNcCount = ncs.filter(n => n.statut === 'Ouverte').length;

  /** @type {{name: string, count: number, avg: number, nc: number}[]} */
  const fsqsPerStore = _computeStoreAverages(storeIds, audits);
  /** @type {{rayon: string, count: number, score: number | null}[]} */
  const perRayon = _computeRayonAverages(audits).filter(r => r.count > 0);
  /** @type {{name: string, count: number, avg: number, nc: number}[]} */
  const qualPerStore = _computeStoreAverages(storeIds, qualAudits);
  /** @type {[string, number][]} */
  const topZones = _computeTopZonesNc(qualAudits).slice(0, 10);

  /** @type {string} */
  let fsqsChartImg = '';
  let qualChartImg = '';
  try { if (_chartFsqs) fsqsChartImg = _chartFsqs.toBase64Image(); } catch (_) { /* graphique indisponible */ }
  try { if (_chartQual) qualChartImg = _chartQual.toBase64Image(); } catch (_) { /* graphique indisponible */ }

  /** @type {string[]} */
  const blocks = [];

  blocks.push(`<div class="pdf-block" style="margin-bottom:18px">
    <div style="font-size:20px;font-weight:700;margin-bottom:2px">HygiPerf — Statistiques du tableau de bord</div>
    <div style="font-size:12px;color:#555">
      Période : <strong>${_escapeHtml(_dashPeriodLabel())}</strong><br>
      Généré le ${fd(today())}${CU ? ` par ${_escapeHtml(CU.nom)}` : ''} · ${storeIds.length} magasin(s) accessible(s)
    </div>
  </div>`);

  blocks.push(`<div class="pdf-block" style="margin-bottom:14px">
    ${_dashPdfSectionTitle('Audits FSQS — Synthèse', '#2563eb')}
    ${_dashPdfTable(
      ['Audits réalisés', 'Score moyen', 'NC relevées', 'NC ouvertes'],
      [[String(audits.length),
        avgFsqs !== null ? avgFsqs + '%' : '–',
        String(ncs.length),
        String(openNcCount)]]
    )}
  </div>`);

  if (fsqsPerStore.length) {
    blocks.push(`<div class="pdf-block" style="margin-bottom:14px">
      ${_dashPdfSectionTitle('FSQS — Par magasin', '#2563eb')}
      ${_dashPdfTable(
        ['Magasin', 'Audits', 'Score moyen', 'NC relevées'],
        fsqsPerStore.map(s => [_escapeHtml(s.name), String(s.count), s.avg + '%', String(s.nc)])
      )}
    </div>`);
  }

  if (perRayon.length) {
    blocks.push(`<div class="pdf-block" style="margin-bottom:14px">
      ${_dashPdfSectionTitle('FSQS — Par rayon', '#2563eb')}
      ${_dashPdfTable(
        ['Rayon', 'Audits', 'Score moyen'],
        perRayon.map(r => [_escapeHtml(r.rayon), String(r.count), r.score !== null ? r.score + '%' : '–'])
      )}
    </div>`);
  }

  if (fsqsChartImg) {
    blocks.push(`<div class="pdf-block" style="margin-bottom:18px">
      ${_dashPdfSectionTitle('FSQS — Score moyen par magasin (graphique)', '#2563eb')}
      <img src="${fsqsChartImg}" style="width:100%;margin-top:6px" alt="Graphique FSQS">
    </div>`);
  }

  blocks.push(`<div class="pdf-block" style="margin-bottom:14px">
    ${_dashPdfSectionTitle('Audits Qualimètre — Synthèse', '#7c3aed')}
    ${_dashPdfTable(
      ['Audits réalisés', 'Score moyen', 'Points NC', 'Magasins audités'],
      [[String(qualAudits.length),
        avgQual !== null ? avgQual + '%' : '–',
        String(qualAudits.reduce((sum, a) => sum + (a.nc || 0), 0)),
        String(new Set(qualAudits.map(a => a.mid)).size)]]
    )}
  </div>`);

  if (qualPerStore.length) {
    blocks.push(`<div class="pdf-block" style="margin-bottom:14px">
      ${_dashPdfSectionTitle('Qualimètre — Par magasin', '#7c3aed')}
      ${_dashPdfTable(
        ['Magasin', 'Audits', 'Score moyen', 'Points NC'],
        qualPerStore.map(s => [_escapeHtml(s.name), String(s.count), s.avg + '%', String(s.nc)])
      )}
    </div>`);
  }

  if (topZones.length) {
    blocks.push(`<div class="pdf-block" style="margin-bottom:14px">
      ${_dashPdfSectionTitle('Qualimètre — Zones les plus en non-conformité', '#7c3aed')}
      ${_dashPdfTable(
        ['Zone', 'NC cumulées'],
        topZones.map(([name, count]) => [_escapeHtml(name), String(count)])
      )}
    </div>`);
  }

  if (qualChartImg) {
    blocks.push(`<div class="pdf-block" style="margin-bottom:14px">
      ${_dashPdfSectionTitle('Qualimètre — Score moyen par magasin (graphique)', '#7c3aed')}
      <img src="${qualChartImg}" style="width:100%;margin-top:6px" alt="Graphique Qualimètre">
    </div>`);
  }

  return blocks.join('');
}

/**
 * Exporte les statistiques du tableau de bord en PDF (période et
 * magasins actuellement filtrés).
 * @returns {Promise<void>}
 */
async function exportDashboardPDF() {
  const container = el('dash-pdf-export');
  if (!container) return;

  /** @type {HTMLButtonElement | null} */
  const btn = el('dash-export-btn');
  /** @type {string} */
  const originalLabel = btn ? btn.innerHTML : '';
  if (btn) {
    btn.disabled = true;
    btn.innerHTML = '<i class="ti ti-loader" style="display:inline-block;animation:spin .8s linear infinite"></i> Génération…';
  }

  try {
    container.innerHTML = _buildDashboardPdfHtml();
    await exportPDF('dash-pdf-export', 'statistiques-hygiperf');
  } catch (error) {
    alert('Erreur génération PDF : ' + error.message);
  } finally {
    container.innerHTML = '';
    if (btn) {
      btn.disabled = false;
      btn.innerHTML = originalLabel;
    }
  }
}
