// ══════════════ GRILLE-QUALIMETRE ══════════════
// Dépend de : storage.js (DB, CU, save, uid), config.js (QUAL_ZONES, SHEETJS_URL, PDFJS_URL), ui.js

// ─────────────────────────────────────────────
// ACCÈS AUX POINTS — source de vérité unique
// Priorité : custom magasin > global custom > QUAL_ZONES (référentiel de base)
// ─────────────────────────────────────────────

function getQualimetrePoints(mid, zoneId) {
  // 1. Custom magasin
  if (mid && DB.qualimetreCustom && DB.qualimetreCustom[mid] && DB.qualimetreCustom[mid][zoneId]) {
    const pts = DB.qualimetreCustom[mid][zoneId];
    if (pts.length) return pts;
  }
  // 2. Grille globale custom
  if (DB.qualimetreGlobal && DB.qualimetreGlobal[zoneId]) {
    const pts = DB.qualimetreGlobal[zoneId];
    if (pts.length) return pts;
  }
  // 3. Référentiel de base QUAL_ZONES
  const zone = QUAL_ZONES.find(z => z.id === zoneId);
  return zone ? zone.points.map(p => ({ id: p.id, q: p.q, prec: p.prec || '', p: 1, c: 'Majeure' })) : [];
}

// Retourne toutes les zones avec leurs points résolus pour un magasin donné
function getQualimetreGrille(mid) {
  return QUAL_ZONES.map(z => ({
    ...z,
    points: getQualimetrePoints(mid, z.id)
  })).filter(z => z.points.length > 0);
}

// ─────────────────────────────────────────────
// PAGE GRILLE QUALIMÈTRE
// ─────────────────────────────────────────────

function showGrilleQualimetre() {
  // Remplir le sélecteur de zones
  const zsel = el('gq-zone-sel');
  if (zsel && !zsel.options.length) {
    zsel.innerHTML = QUAL_ZONES.map(z =>
      `<option value="${z.id}">${z.emoji} ${z.label}</option>`
    ).join('');
  }
  _gqBuildMagSel();
  _gqRender();
}

function _gqBuildMagSel() {
  const mids = visibleMids();
  const sel = el('gq-mag-sel'); if (!sel) return;
  const cv = sel.value;
  while (sel.options.length > 1) sel.remove(1);
  DB.magasins.filter(m => mids.includes(m.id)).forEach(m => {
    const o = document.createElement('option'); o.value = m.id; o.textContent = m.nom; sel.appendChild(o);
  });
  if (cv && [...sel.options].some(o => o.value === cv)) sel.value = cv;
}

function _gqRender() {
  const mid = v('gq-mag-sel');  // vide = affichage grille globale
  const zoneId = v('gq-zone-sel') || (QUAL_ZONES[0] && QUAL_ZONES[0].id);
  const isAdmin = CU && CU.role === 'admin';

  // Boutons admin
  const btnAdd = el('gq-btn-add'); if (btnAdd) btnAdd.style.display = isAdmin ? '' : 'none';
  const btnImport = el('gq-btn-import'); if (btnImport) btnImport.style.display = isAdmin ? '' : 'none';
  const btnReset = el('gq-btn-reset'); if (btnReset) btnReset.style.display = isAdmin ? '' : 'none';

  // Label scope
  const scopeEl = el('gq-scope-label');
  if (scopeEl) {
    if (mid) {
      const mag = DB.magasins.find(m => m.id === mid);
      scopeEl.innerHTML = `Grille personnalisée pour <strong>${mag ? mag.nom : mid}</strong>`;
    } else {
      scopeEl.innerHTML = `Grille <strong>globale</strong> (appliquée à tous les magasins sans personnalisation)`;
    }
  }

const pts = getQualimetrePoints(mid || null, zoneId);
  const isCustomMag = mid && DB.qualimetreCustom && DB.qualimetreCustom[mid] && (DB.qualimetreCustom[mid][zoneId] || []).length > 0;
  const isCustomGlobal = DB.qualimetreGlobal && (DB.qualimetreGlobal[zoneId] || []).length > 0;
  const isBase = !isCustomMag && !isCustomGlobal;

  const body = el('gq-body'); if (!body) return;

  if (!pts.length) {
    body.innerHTML = `<div class="empty-state" style="padding:40px">
      <i class="ti ti-gauge" style="font-size:40px;color:#ddd8ff"></i>
      <p style="color:var(--text2)">Aucun point de contrôle pour cette zone.<br>
      ${isAdmin ? 'Utilisez « Ajouter » ou « Importer » pour commencer.' : 'Les points seront ajoutés par l\'administrateur.'}</p>
    </div>`;
    return;
  }

  // Badge source
  const sourceBadge = isCustomMag
    ? `<span style="background:#ede9fe;color:#6d28d9;border-radius:12px;padding:2px 10px;font-size:11px;font-weight:600">Personnalisé magasin</span>`
    : isCustomGlobal
      ? `<span style="background:#f0fdf4;color:#15803d;border-radius:12px;padding:2px 10px;font-size:11px;font-weight:600">Grille globale</span>`
      : `<span style="background:#f1f5f9;color:#64748b;border-radius:12px;padding:2px 10px;font-size:11px;font-weight:600">Référentiel de base</span>`;

  body.innerHTML = `
    <div style="display:flex;align-items:center;gap:8px;padding:10px 20px;background:var(--bg);border-bottom:1px solid var(--border)">
      ${sourceBadge}
      <span class="tsm tm">${pts.length} point(s)</span>
      ${isAdmin ? `<button class="btn btn-secondary btn-sm" style="margin-left:auto" onclick="_gqResetZone('${mid || ''}','${zoneId}')"><i class="ti ti-refresh"></i> Réinitialiser cette zone</button>` : ''}
    </div>
    ${pts.map(p => `
      <div style="display:flex;align-items:flex-start;gap:12px;padding:12px 20px;border-bottom:1px solid var(--border)">
        <div style="flex:1;min-width:0">
          <div style="font-size:13px;font-weight:500">${p.q}</div>
          ${p.prec ? `<div style="font-size:11px;color:var(--text2);margin-top:2px;font-style:italic">${p.prec}</div>` : ''}
        </div>
        <div style="display:flex;gap:8px;align-items:center;flex-shrink:0">
          ${critBdg(p.c)}
          <span class="tsm tm">Poids : <strong>${p.p}</strong></span>
          ${isAdmin && !isBase ? `
            <button class="btn btn-secondary btn-sm" onclick="openGqCtrlModal('${mid || ''}','${zoneId}','${p.id}')"><i class="ti ti-pencil"></i></button>
            <button class="btn btn-danger btn-sm" onclick="delGqCtrl('${mid || ''}','${zoneId}','${p.id}')"><i class="ti ti-trash"></i></button>
          ` : ''}
        </div>
      </div>`).join('')}`;
}

function onGqMagChange() { _gqRender(); }
function onGqZoneChange() { _gqRender(); }

// ─────────────────────────────────────────────
// MODAL AJOUT / ÉDITION D'UN POINT
// ─────────────────────────────────────────────

function openGqCtrlModal(mid, zoneId, qid) {
  const m = mid || v('gq-mag-sel') || '';
  const z = zoneId || v('gq-zone-sel') || (QUAL_ZONES[0] && QUAL_ZONES[0].id);
  const isEdit = !!qid;
  el('m-gq-ctrl-ttl').innerHTML = isEdit
    ? '<i class="ti ti-pencil" style="color:#7c3aed"></i> Modifier le point Qualimètre'
    : '<i class="ti ti-gauge" style="color:#7c3aed"></i> Nouveau point Qualimètre';
  el('gq-ctrl-err').classList.remove('show');
  sv('gqc-id', qid || '');
  sv('gqc-mid', m);
  sv('gqc-zone', z);

  // Scope radio
  const radios = document.querySelectorAll('input[name="gqc-scope"]');
  radios.forEach(r => { r.checked = r.value === (m ? 'mag' : 'global'); });
  _gqToggleScopeUI(m ? 'mag' : 'global');

  // Populate zone selector in modal
  const zsel = el('gqc-zone-sel');
  if (zsel) {
    zsel.innerHTML = QUAL_ZONES.map(zone => `<option value="${zone.id}"${zone.id === z ? ' selected' : ''}>${zone.emoji} ${zone.label}</option>`).join('');
  }
  // Populate magasin selector in modal
  const msel = el('gqc-mag-sel');
  if (msel) {
    msel.innerHTML = '<option value="">— Tous les magasins —</option>' +
      DB.magasins.filter(mag => visibleMids().includes(mag.id)).map(mag => `<option value="${mag.id}"${mag.id === m ? ' selected' : ''}>${mag.nom}</option>`).join('');
  }

  if (isEdit) {
    // Chercher dans custom mag, puis global
    let pts = [];
    if (m && DB.qualimetreCustom && DB.qualimetreCustom[m] && DB.qualimetreCustom[m][z]) pts = DB.qualimetreCustom[m][z];
    else if (!m && DB.qualimetreGlobal && DB.qualimetreGlobal[z]) pts = DB.qualimetreGlobal[z];
    const q = pts.find(x => x.id === qid); if (!q) return;
    sv('gqc-q', q.q); sv('gqc-prec', q.prec || ''); el('gqc-crit').value = q.c; sv('gqc-poids', q.p);
  } else {
    sv('gqc-q', ''); sv('gqc-prec', ''); el('gqc-crit').value = 'Majeure'; sv('gqc-poids', '');
  }
  openModal('m-gq-ctrl');
}

function _gqToggleScopeUI(scope) {
  const mRow = el('gqc-mag-row');
  if (mRow) mRow.style.display = scope === 'mag' ? '' : 'none';
}

function saveGqCtrl() {
  const qText = v('gqc-q').trim();
  const prec = v('gqc-prec').trim();
  const crit = el('gqc-crit').value;
  const cat = 'Général';
  const err = el('gq-ctrl-err');
  if (!qText) { err.textContent = 'L\'intitulé est requis.'; err.classList.add('show'); return; }
  const defP = { 'Critique': 10, 'Majeure': 5, 'Mineure': 2 };
  const poids = parseInt(v('gqc-poids')) || defP[crit];
  const zoneId = el('gqc-zone-sel') ? el('gqc-zone-sel').value : v('gqc-zone');
  const scopeVal = [...document.querySelectorAll('input[name="gqc-scope"]')].find(r => r.checked);
  const scope = scopeVal ? scopeVal.value : 'global';
  const mid = scope === 'mag' ? (el('gqc-mag-sel') ? el('gqc-mag-sel').value : v('gqc-mid')) : '';
  const existId = v('gqc-id');
  const newPoint = { id: existId || 'gq-' + uid(), q: qText, prec, cat, p: poids, c: crit };

  if (mid) {
    if (!DB.qualimetreCustom) DB.qualimetreCustom = {};
    if (!DB.qualimetreCustom[mid]) DB.qualimetreCustom[mid] = {};
    if (!DB.qualimetreCustom[mid][zoneId]) DB.qualimetreCustom[mid][zoneId] = [];
    const arr = DB.qualimetreCustom[mid][zoneId];
    if (existId) { const idx = arr.findIndex(x => x.id === existId); if (idx >= 0) arr[idx] = newPoint; else arr.push(newPoint); }
    else arr.push(newPoint);
  } else {
    if (!DB.qualimetreGlobal) DB.qualimetreGlobal = {};
    if (!DB.qualimetreGlobal[zoneId]) DB.qualimetreGlobal[zoneId] = [];
    const arr = DB.qualimetreGlobal[zoneId];
    if (existId) { const idx = arr.findIndex(x => x.id === existId); if (idx >= 0) arr[idx] = newPoint; else arr.push(newPoint); }
    else arr.push(newPoint);
  }
  save(['qualimetreCustom', 'qualimetreGlobal']);
  closeModal('m-gq-ctrl');
  // Sync sélecteurs
  if (el('gq-mag-sel') && mid) el('gq-mag-sel').value = mid;
  if (el('gq-zone-sel') && zoneId) el('gq-zone-sel').value = zoneId;
  _gqRender();
}

function delGqCtrl(mid, zoneId, qid) {
  if (!confirm('Supprimer ce point de contrôle Qualimètre ?')) return;
  if (mid) {
    if (!DB.qualimetreCustom || !DB.qualimetreCustom[mid]) return;
    DB.qualimetreCustom[mid][zoneId] = (DB.qualimetreCustom[mid][zoneId] || []).filter(x => x.id !== qid);
  } else {
    if (!DB.qualimetreGlobal) return;
    DB.qualimetreGlobal[zoneId] = (DB.qualimetreGlobal[zoneId] || []).filter(x => x.id !== qid);
  }
  save(['qualimetreCustom', 'qualimetreGlobal']);
  _gqRender();
}

function _gqResetZone(mid, zoneId) {
  const label = mid ? 'la personnalisation magasin' : 'la grille globale';
  if (!confirm(`Réinitialiser ${label} pour cette zone ? Les points reviendront au référentiel de base.`)) return;
  if (mid) {
    if (DB.qualimetreCustom && DB.qualimetreCustom[mid]) {
      delete DB.qualimetreCustom[mid][zoneId];
    }
  } else {
    if (DB.qualimetreGlobal) delete DB.qualimetreGlobal[zoneId];
  }
  save(['qualimetreCustom', 'qualimetreGlobal']);
  _gqRender();
}

// ─────────────────────────────────────────────
// IMPORT CSV / XLSX / PDF
// ─────────────────────────────────────────────

// Format attendu des colonnes :
// zone | question | precision | criticite | poids
// La colonne "zone" doit correspondre à un id de QUAL_ZONES (ex: z1, z2) OU au label (ex: "Zone 1 – Accueil")

let _gqImportData = [];   // lignes parsées en attente de confirmation
let _gqImportScope = 'global';
let _gqImportMid = '';

function openGqImportModal() {
  _gqImportData = [];
  el('gq-import-preview').innerHTML = '';
  el('gq-import-err').classList.remove('show');
  const msel = el('gqi-mag-sel');
  if (msel) {
    msel.innerHTML = '<option value="">— Tous les magasins (global) —</option>' +
      DB.magasins.filter(m => visibleMids().includes(m.id)).map(m => `<option value="${m.id}">${m.nom}</option>`).join('');
  }
  const fi = el('gq-import-file'); if (fi) fi.value = '';
  openModal('m-gq-import');
}

function handleGqImportFile(input) {
  const file = input.files[0]; if (!file) return;
  const ext = file.name.split('.').pop().toLowerCase();
  el('gq-import-err').classList.remove('show');
  el('gq-import-preview').innerHTML = '<div style="padding:16px;color:var(--text2)"><i class="ti ti-loader" style="animation:spin .8s linear infinite"></i> Lecture du fichier…</div>';

  if (ext === 'csv') {
    const reader = new FileReader();
    reader.onload = e => _gqParseCSV(e.target.result);
    reader.readAsText(file, 'UTF-8');
  } else if (ext === 'xlsx' || ext === 'xls') {
    _gqLoadSheetJS(() => {
      const reader = new FileReader();
      reader.onload = e => {
        const wb = XLSX.read(e.target.result, { type: 'array' });
        const ws = wb.Sheets[wb.SheetNames[0]];
        const csv = XLSX.utils.sheet_to_csv(ws);
        _gqParseCSV(csv);
      };
      reader.readAsArrayBuffer(file);
    });
  } else if (ext === 'pdf') {
    _gqLoadPDFJS(() => _gqParsePDF(file));
  } else {
    _gqImportErr('Format non supporté. Utilisez CSV, XLSX ou PDF.');
  }
}

function _gqLoadSheetJS(cb) {
  if (window.XLSX) { cb(); return; }
  const s = document.createElement('script'); s.src = SHEETJS_URL;
  s.onload = cb; s.onerror = () => _gqImportErr('Impossible de charger SheetJS.');
  document.head.appendChild(s);
}

function _gqLoadPDFJS(cb) {
  if (window.pdfjsLib) { cb(); return; }
  const s = document.createElement('script'); s.src = PDFJS_URL;
  s.onload = () => { pdfjsLib.GlobalWorkerOptions.workerSrc = PDFJS_URL.replace('pdf.min.js', 'pdf.worker.min.js'); cb(); };
  s.onerror = () => _gqImportErr('Impossible de charger PDF.js.');
  document.head.appendChild(s);
}

function _gqParseCSV(text) {
  const lines = text.split(/\r?\n/).filter(l => l.trim());
  if (lines.length < 2) { _gqImportErr('Le fichier est vide ou ne contient pas de données.'); return; }
console.log('Lignes détectées:', lines.length, 'Première ligne:', lines[0]);

  // Détection séparateur
  const sep = lines[0].includes(';') ? ';' : ',';
  const headers = lines[0].split(sep).map(h => h.trim().toLowerCase().replace(/['"]/g, ''));
console.log('Headers:', headers, 'idxQ:', headers.findIndex(h => ['question', 'q', 'intitulé', 'intitule', 'libelle', 'libellé'].includes(h)));

  const idxZone = headers.findIndex(h => h.includes('zone'));
  const idxQ = headers.findIndex(h => ['question', 'q', 'intitulé', 'intitule', 'libelle', 'libellé'].includes(h));
  const idxPrec = headers.findIndex(h => ['precision', 'précision', 'prec', 'detail', 'détail'].includes(h));
  const idxCrit = headers.findIndex(h => ['criticite', 'criticité', 'crit', 'niveau'].includes(h));
  const idxPoids = headers.findIndex(h => ['poids', 'points', 'weight'].includes(h));

  if (idxQ < 0) { _gqImportErr('Colonne "question" introuvable. Vérifiez les en-têtes (zone, question, precision, criticite, poids).'); return; }

  const rows = [];
  for (let i = 1; i < lines.length; i++) {
    const cols = lines[i].split(sep).map(c => c.trim().replace(/^["']|["']$/g, ''));
    const q = cols[idxQ]; if (!q) continue;
    if (i <= 3) console.log('Ligne', i, ':', cols, 'zone:', cols[idxZone], 'q:', q);
    const zoneRaw = idxZone >= 0 ? cols[idxZone] : '';
    const zoneId = _gqResolveZoneId(zoneRaw);
    const critRaw = idxCrit >= 0 ? cols[idxCrit] : 'Majeure';
    const crit = _gqNormalizeCrit(critRaw);
    const defP = { 'Critique': 10, 'Majeure': 5, 'Mineure': 2 };
    const poids = idxPoids >= 0 ? (parseInt(cols[idxPoids]) || defP[crit]) : defP[crit];
    const prec = idxPrec >= 0 ? (cols[idxPrec] || '') : '';
    rows.push({ zoneId, zoneName: zoneRaw, q, prec, c: crit, p: poids });
  }

  if (!rows.length) { _gqImportErr('Aucune ligne valide trouvée.'); return; }
  _gqImportData = rows;
  _gqRenderImportPreview();
}

async function _gqParsePDF(file) {
  try {
    const buf = await file.arrayBuffer();
    const pdf = await pdfjsLib.getDocument({ data: buf }).promise;
    let text = '';
    for (let i = 1; i <= pdf.numPages; i++) {
      const page = await pdf.getPage(i);
      const content = await page.getTextContent();
      text += content.items.map(it => it.str).join(' ') + '\n';
    }
    // Essayer d'extraire des lignes séparées par | ou tabulation
    const lines = text.split(/\n/).map(l => l.trim()).filter(l => l.length > 8);
    const rows = [];
    lines.forEach(l => {
      const parts = l.includes('|') ? l.split('|') : l.includes('\t') ? l.split('\t') : null;
      if (!parts) return;
      const [zoneRaw, q, prec, critRaw, poidsRaw] = parts.map(s => s.trim());
      if (!q) return;
      const zoneId = _gqResolveZoneId(zoneRaw || '');
      const crit = _gqNormalizeCrit(critRaw || 'Majeure');
      const defP = { 'Critique': 10, 'Majeure': 5, 'Mineure': 2 };
      const poids = parseInt(poidsRaw) || defP[crit];
      rows.push({ zoneId, zoneName: zoneRaw || '', q, prec: prec || '', c: crit, p: poids });
    });
    if (!rows.length) { _gqImportErr('Aucun point extrait du PDF. Le PDF doit contenir des colonnes séparées par | ou tabulation : zone | question | precision | criticite | poids'); return; }
    _gqImportData = rows;
    _gqRenderImportPreview();
  } catch (e) {
    _gqImportErr('Erreur lecture PDF : ' + e.message);
  }
}

function _gqResolveZoneId(raw) {
  if (!raw) return QUAL_ZONES[0] ? QUAL_ZONES[0].id : 'z1';
  const r = raw.trim().toLowerCase();
  // Correspondance directe d'id (z1, z2…)
  const direct = QUAL_ZONES.find(z => z.id.toLowerCase() === r);
  if (direct) return direct.id;
  // Correspondance par numéro (1, 2, zone 1…)
  const num = r.match(/\d+/); if (num) {
    const byNum = QUAL_ZONES.find(z => z.id === 'z' + num[0]);
    if (byNum) return byNum.id;
  }
  // Correspondance par label partiel
  const byLabel = QUAL_ZONES.find(z => z.label.toLowerCase().includes(r) || r.includes(z.label.toLowerCase().split('–')[1]?.trim() || ''));
  return byLabel ? byLabel.id : (QUAL_ZONES[0] ? QUAL_ZONES[0].id : 'z1');
}

function _gqNormalizeCrit(raw) {
  const r = (raw || '').toLowerCase().trim();
  if (r.includes('crit')) return 'Critique';
  if (r.includes('min')) return 'Mineure';
  return 'Majeure';
}

function _gqRenderImportPreview() {
  const rows = _gqImportData;
  const scope = el('gqi-mag-sel') ? el('gqi-mag-sel').value : '';
  const scopeLabel = scope
    ? `magasin <strong>${DB.magasins.find(m => m.id === scope)?.nom || scope}</strong>`
    : `grille <strong>globale</strong>`;

  // Grouper par zone
  const byZone = {};
  rows.forEach(r => { if (!byZone[r.zoneId]) byZone[r.zoneId] = []; byZone[r.zoneId].push(r); });

  el('gq-import-preview').innerHTML = `
    <div style="margin:12px 0 8px;font-size:13px;color:var(--text2)">
      <strong>${rows.length} point(s)</strong> détecté(s) → appliqués à la ${scopeLabel}
    </div>
    ${Object.entries(byZone).map(([zid, pts]) => {
      const zone = QUAL_ZONES.find(z => z.id === zid);
      return `<div style="margin-bottom:10px">
        <div style="font-size:11px;font-weight:700;color:#5b21b6;text-transform:uppercase;padding:6px 10px;background:#f5f3ff;border-radius:6px;margin-bottom:4px">
          ${zone ? zone.emoji + ' ' + zone.label : zid} (${pts.length})
        </div>
        ${pts.map(p => `<div style="display:flex;gap:8px;align-items:center;padding:5px 10px;font-size:12px;border-bottom:1px solid var(--border)">
          <span style="flex:1">${p.q}</span>
          ${critBdg(p.c)}
          <span class="tsm tm">${p.p}pts</span>
        </div>`).join('')}
      </div>`;
    }).join('')}`;
}

function confirmGqImport() {
  console.log('Import data:', _gqImportData.length, 'mid:', el('gqi-mag-sel') ? el('gqi-mag-sel').value : 'no sel');
  if (!_gqImportData.length) { _gqImportErr('Aucune donnée à importer.'); return; }
  const mid = el('gqi-mag-sel') ? el('gqi-mag-sel').value : '';
  const replace = el('gqi-replace') ? el('gqi-replace').checked : true;

  if (mid) {
    if (!DB.qualimetreCustom) DB.qualimetreCustom = {};
    if (!DB.qualimetreCustom[mid]) DB.qualimetreCustom[mid] = {};
    if (replace) {
      // Vider uniquement les zones concernées
      const zones = [...new Set(_gqImportData.map(r => r.zoneId))];
      zones.forEach(z => { DB.qualimetreCustom[mid][z] = []; });
    }
    _gqImportData.forEach(r => {
      if (!DB.qualimetreCustom[mid][r.zoneId]) DB.qualimetreCustom[mid][r.zoneId] = [];
      DB.qualimetreCustom[mid][r.zoneId].push({ id: 'gq-' + uid(), q: r.q, prec: r.prec, cat: 'Général', p: r.p, c: r.c });
    });
  } else {
    if (!DB.qualimetreGlobal) DB.qualimetreGlobal = {};
    if (replace) {
      const zones = [...new Set(_gqImportData.map(r => r.zoneId))];
      zones.forEach(z => { DB.qualimetreGlobal[z] = []; });
    }
    _gqImportData.forEach(r => {
      if (!DB.qualimetreGlobal[r.zoneId]) DB.qualimetreGlobal[r.zoneId] = [];
      DB.qualimetreGlobal[r.zoneId].push({ id: 'gq-' + uid(), q: r.q, prec: r.prec, cat: 'Général', p: r.p, c: r.c });
    });
  }
  save(['qualimetreCustom', 'qualimetreGlobal']);
  closeModal('m-gq-import');
  alert('Grille Qualimètre importée (' + _gqImportData.length + ' point(s))');
  _gqImportData = [];
  _gqRender();
}

function _gqImportErr(msg) {
  const err = el('gq-import-err');
  if (err) { err.textContent = msg; err.classList.add('show'); }
  el('gq-import-preview').innerHTML = '';
}
function initQualimetreGlobal() {
  if (!DB.qualimetreGlobal) DB.qualimetreGlobal = {};
  // Injecter QUAL_ZONES dans qualimetreGlobal si vide
  let injected = false;
  QUAL_ZONES.forEach(z => {
    if (!DB.qualimetreGlobal[z.id] || DB.qualimetreGlobal[z.id].length === 0) {
      DB.qualimetreGlobal[z.id] = z.points.map(p => ({
        id: p.id, q: p.q, prec: p.prec || '', cat: 'Général', p: 1, c: 'Majeure'
      }));
      injected = true;
    }
  });
  if (injected) save(['qualimetreGlobal']);
}