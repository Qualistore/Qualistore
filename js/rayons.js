// ══════════════════════════════════════════════════════════════
// RAYONS — Performances par rayon
// Dépend de : storage.js (DB, CU), ui.js
// ══════════════════════════════════════════════════════════════

// ─────────────────────────────────────────────
// 0. TYPEDEFS JSDoc (pour inférence VSCode / TypeScript)
// ─────────────────────────────────────────────

/**
 * Audit FSQS. Seules .mid, .rayon, .score, .date sont accédées dans
 * ce fichier ; structure complète dans audits.js.
 * @typedef {Object} Audit
 * @property {string} mid
 * @property {string} rayon
 * @property {number} score
 * @property {string} date
 */

// ─────────────────────────────────────────────
// 1. CONSTANTES
// ─────────────────────────────────────────────

/**
 * Liste des rayons affichés sur la page Performances. Ne contraint
 * pas Audit.rayon globalement (un audit pourrait exister avec un
 * rayon hors de cette liste, simplement non affiché ici).
 * @type {string[]}
 */
const RAYONS_LIST = [
  'Boucherie', 'Boulangerie', 'Drive', 'Marée',
  'Charcuterie', 'Fromage', 'Fruits & Légumes',
];

// ─────────────────────────────────────────────
// 2. RENDU DE LA PAGE
// ─────────────────────────────────────────────

/**
 * Affiche la grille de cartes de performance par rayon, filtrée par
 * magasins visibles et par le sélecteur de magasin de la page.
 * @returns {void}
 */
function renderRay() {
  /** @type {string[]} */
  const storeIds = visibleMids();
  populateMagSelect(el('flt-ray-mag'));
  /** @type {string} */
  const filterMid = el('flt-ray-mag') ? el('flt-ray-mag').value : '';

  /** @type {Audit[]} */
  const filteredAudits = DB.audits.filter(audit => {
    if (!storeIds.includes(audit.mid)) return false;
    if (filterMid && audit.mid !== filterMid) return false;
    return true;
  });

  el('ray-grid').innerHTML = RAYONS_LIST.map(rayon =>
    _buildRayonCard(rayon, filteredAudits.filter(a => a.rayon === rayon))
  ).join('');
}

// ─────────────────────────────────────────────
// 3. HELPERS DE RENDU
// ─────────────────────────────────────────────

/**
 * Construit la carte de performance d'un rayon (score moyen,
 * nombre d'audits, date du dernier audit).
 * @param {string} rayon
 * @param {Audit[]} rayonAudits - Audits déjà filtrés pour ce rayon.
 * @returns {string}
 */
function _buildRayonCard(rayon, rayonAudits) {
  /** @type {number | null} */
  const avgScore  = rayonAudits.length
    ? Math.round(rayonAudits.reduce((sum, a) => sum + a.score, 0) / rayonAudits.length)
    : null;
  /** @type {Audit | null} */
  const lastAudit = rayonAudits.length
    ? [...rayonAudits].sort((a, b) => (a.date > b.date ? -1 : 1))[0]
    : null;

  return `<div class="card">
    <div class="card-hdr">
      <div style="display:flex;align-items:center;gap:10px">
        ${rIcon(rayon)}
        <div class="card-title">${rayon}</div>
      </div>
      ${avgScore !== null ? `<span class="score-badge ${scCls(avgScore)}">${avgScore}%</span>` : ''}
    </div>
    <div class="card-body">
      <div style="display:flex;justify-content:space-around;margin-bottom:14px">
        <div style="text-align:center">
          <div style="font-size:22px;font-weight:700;color:var(--primary)">${rayonAudits.length}</div>
          <div class="tsm tm">Audits</div>
        </div>
        <div style="text-align:center">
          <div style="font-size:22px;font-weight:700;color:${avgScore !== null ? sc(avgScore) : 'var(--text3)'}">
            ${avgScore !== null ? avgScore + '%' : '–'}
          </div>
          <div class="tsm tm">Score moy.</div>
        </div>
      </div>
      ${avgScore !== null ? pbar(avgScore) : ''}
      <div class="tsm tm" style="margin-top:10px">
        ${lastAudit
          ? `<i class="ti ti-calendar"></i> Dernier audit : ${fd(lastAudit.date)}`
          : 'Aucun audit'}
      </div>
    </div>
  </div>`;
}
