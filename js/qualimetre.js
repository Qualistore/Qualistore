// ══════════════ QUALIMETRE ══════════════
// Dépend de : storage.js (DB, CU), config.js, ui.js, grille-qualimetre.js
// La logique d'accès aux points (getQualimetrePoints, getQualimetreGrille) est dans grille-qualimetre.js

// ─────────────────────────────────────────────
// PAGE RÉFÉRENTIEL QUALIMÈTRE
// Affiche la grille résolue pour un magasin/zone donné (lecture seule pour non-admin)
// L'édition et l'import se font depuis la page "Grille Qualimètre"
// ─────────────────────────────────────────────

function onQualMagChange() { showQualimetre(); }

function renderQualimetreNav() {
  const mids = visibleMids();
  const sel = el('qual-mag-sel'); if (!sel) return;
  const cv = sel.value;
  while (sel.options.length > 1) sel.remove(1);
  DB.magasins.filter(m => mids.includes(m.id)).forEach(m => {
    const o = document.createElement('option'); o.value = m.id; o.textContent = m.nom; sel.appendChild(o);
  });
  if (cv && [...sel.options].some(o => o.value === cv)) sel.value = cv;
  else if (DB.magasins.filter(m => mids.includes(m.id)).length) {
    sel.value = DB.magasins.find(m => mids.includes(m.id)).id;
  }
}

function showQualimetre() {
  renderQualimetreNav();
  const mid = v('qual-mag-sel');
  const zoneId = v('qual-zone-sel') || (QUAL_ZONES[0] && QUAL_ZONES[0].id);
  const mag = DB.magasins.find(m => m.id === mid);
  const zone = QUAL_ZONES.find(z => z.id === zoneId);
  const isAdmin = CU && CU.role === 'admin';

  // Bouton "Gérer la grille" visible admin uniquement
  const editBtn = el('btn-edit-qual-grille');
  if (editBtn) editBtn.style.display = isAdmin ? '' : 'none';

  if (!mid) {
    el('qual-ttl').textContent = '–';
    el('qual-body').innerHTML = `<div class="empty-state" style="padding:40px">
      <i class="ti ti-building-store" style="font-size:40px;color:#ddd8ff"></i>
      <p style="color:var(--text2)">Sélectionnez un magasin pour afficher son Qualimètre.</p>
    </div>`;
    return;
  }

  const zoneName = zone ? (zone.emoji + ' ' + zone.label) : zoneId;
  el('qual-ttl').textContent = (mag ? mag.nom : '?') + ' – ' + zoneName;

  const qs = getQualimetrePoints(mid, zoneId);

  if (!qs.length) {
    el('qual-body').innerHTML = `<div class="empty-state" style="padding:40px">
      <i class="ti ti-gauge" style="font-size:40px;color:#ddd8ff"></i>
      <p style="color:var(--text2)">Aucun point de contrôle pour ${mag ? mag.nom : ''} – ${zoneName}.<br>
      ${isAdmin ? 'Utilisez <strong>Gérer la grille</strong> pour en ajouter.' : 'Les points seront ajoutés par l\'administrateur.'}</p>
    </div>`;
    return;
  }

  // Détecter la source de la grille pour afficher un badge
  const isCustomMag = mid && DB.qualimetreCustom && DB.qualimetreCustom[mid] && (DB.qualimetreCustom[mid][zoneId] || []).length > 0;
  const isCustomGlobal = DB.qualimetreGlobal && (DB.qualimetreGlobal[zoneId] || []).length > 0;
  const sourceBadge = isCustomMag
    ? `<span style="background:#ede9fe;color:#6d28d9;border-radius:12px;padding:2px 10px;font-size:11px;font-weight:600">Personnalisé</span>`
    : isCustomGlobal
      ? `<span style="background:#f0fdf4;color:#15803d;border-radius:12px;padding:2px 10px;font-size:11px;font-weight:600">Grille globale</span>`
      : `<span style="background:#f1f5f9;color:#64748b;border-radius:12px;padding:2px 10px;font-size:11px;font-weight:600">Référentiel de base</span>`;

  el('qual-body').innerHTML = `
    <div style="display:flex;align-items:center;gap:8px;padding:10px 20px;background:var(--bg);border-bottom:1px solid var(--border)">
      ${sourceBadge}
      <span class="tsm tm">${qs.length} point(s)</span>
    </div>
    ${qs.map(q => `
      <div style="display:flex;align-items:flex-start;gap:12px;padding:12px 20px;border-bottom:1px solid var(--border)">
        <div style="flex:1;min-width:0">
          <div style="font-size:13px;font-weight:500">${q.q}</div>
          ${q.prec ? `<div style="font-size:11px;color:var(--text2);margin-top:2px;font-style:italic">${q.prec}</div>` : ''}
        </div>
        <div style="display:flex;gap:8px;align-items:center;flex-shrink:0">
          ${critBdg(q.c)}
          <span class="tsm tm">Poids : <strong>${q.p}</strong></span>
        </div>
      </div>`).join('')}`;
}

// Alias pour compatibilité avec les appels existants dans l'app
// L'édition réelle est dans grille-qualimetre.js (showGrilleQualimetre)
function openQualCtrlModal(mid, rayon, qid) {
  // Redirige vers la gestion de grille
  openGqCtrlModal(mid, rayon, qid);
}
