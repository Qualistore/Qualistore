// ══════════════ AUDIT-QUALIMETRE ══════════════
// Dépend de : storage.js (DB, CU, save, uid), config.js, ui.js, grille-qualimetre.js

// ─────────────────────────────────────────────
// TYPEDEFS JSDoc (pour inférence VSCode / TypeScript)
// ⚠️ Déduits de l'usage dans ce fichier. Ce fichier est la source
// de CONSTRUCTION canonique de QualAudit (submitQualAudit) — plus
// fiable que les fichiers qui ne le lisaient que partiellement
// (dashboard.js, rapport-qualimetre.js).
//
// ⚠️ DIVERGENCE DE VOCABULAIRE : QualAudit.statut vaut 'Ouvert'
// (masculin) ou 'Conforme', DIFFÉRENT du statut Audit FSQS
// ('Conforme'/'Non conforme', voir audits.js). Ceci résout aussi
// l'observation faite dans ui.js (statBdg gérait une forme
// masculine 'Ouvert' dont la source était jusqu'ici introuvable).
// ─────────────────────────────────────────────

/**
 * Point de contrôle Qualimètre (voir config.js/grille-qualimetre.js
 * pour la définition canonique).
 * @typedef {Object} GrillePoint
 * @property {string} id
 * @property {string} q
 * @property {string} [prec]
 * @property {number} p
 * @property {'Critique'|'Majeure'|'Mineure'} c
 */

/**
 * Zone Qualimètre enrichie de ses points résolus pour un magasin
 * donné (voir grille-qualimetre.js : getQualimetreGrille).
 * @typedef {Object} QMZoneWithPoints
 * @property {string} id
 * @property {string} emoji
 * @property {string} label
 * @property {GrillePoint[]} points
 */

/**
 * Code de réponse à un point de contrôle.
 * @typedef {'C'|'NC'|'NA'} QaAnswerCode
 */

/**
 * Réponse en cours de saisie pour un point de contrôle Qualimètre.
 * @typedef {Object} QaAnswer
 * @property {QaAnswerCode | null} rep
 * @property {string} cmt - Chaîne vide par défaut ; obligatoire en pratique si rep === 'NC' (validation UI, pas applicative).
 * @property {string[]} photos - Maximum 2 par point (limite appliquée dans handleQaPhoto).
 * @property {string} q - Intitulé copié depuis GrillePoint.q.
 */

/**
 * Statut d'un audit Qualimètre. DIFFÉRENT du statut Audit FSQS —
 * voir avertissement en tête de fichier.
 * @typedef {'Ouvert'|'Conforme'} QualAuditStatut
 */

/**
 * Audit "Qualimètre", tel que construit par submitQualAudit().
 * @typedef {Object} QualAudit
 * @property {string} id - Préfixé 'QA-' + uid().
 * @property {string} mid - Référence vers Magasin.id.
 * @property {string} mag - Nom du magasin (copie figée).
 * @property {string} date
 * @property {string} aud - Nom de l'auditeur.
 * @property {string} cmt - Commentaire général.
 * @property {number} score - Score 0-100 (100 si aucun point pertinent répondu).
 * @property {number} nc - Nombre de points non conformes.
 * @property {QualAuditStatut} statut
 * @property {Record<string, QaAnswer>} answers - Réponses indexées par GrillePoint.id.
 */

/**
 * Brouillon d'audit Qualimètre (variante de Draft — voir audits.js
 * pour la définition canonique générale). CONFIRME .type ===
 * 'qualimetre' et révèle .rayon === 'Qualimètre' (valeur fixe, pas
 * un vrai nom de rayon FSQS).
 * @typedef {Object} Draft
 * @property {string} id - Préfixé 'DRF-' + uid().
 * @property {string} mid
 * @property {string} mag
 * @property {'Qualimètre'} rayon - Toujours cette valeur fixe pour les brouillons Qualimètre.
 * @property {string} date
 * @property {string} aud
 * @property {string} cmt
 * @property {Record<string, QaAnswer>} answers
 * @property {string} createdAt
 * @property {string} uid - Référence vers User.id du créateur.
 * @property {'qualimetre'} type
 */

/**
 * Magasin. Seules .id, .nom, .statut sont accédées dans ce fichier ;
 * structure complète dans magasins.js.
 * @typedef {Object} Magasin
 * @property {string} id
 * @property {string} nom
 * @property {string} statut
 */

/** @type {number} Étape courante du wizard (0=intro, 1=sélection, 2=questions, 3=récap). */
let qaStep = 0;
/** @type {Record<string, QaAnswer>} Réponses en cours de saisie, indexées par GrillePoint.id. */
let qaAnswers = {};
/** @type {number} Index de la zone actuellement affichée dans _qaGrille. */
let qaCurrentZone = 0;
/** @type {string | null} Référence vers Draft.id en cours de reprise, ou null si nouvel audit. */
let _currentQaDraftId = null;
/** @type {QMZoneWithPoints[]} Zones résolues (avec leurs points) pour le magasin de l'audit en cours. */
let _qaGrille = [];

/**
 * Complète toutes les réponses non renseignées de _qaGrille avec
 * 'NA', avant soumission de l'audit.
 * @returns {void}
 */
function autoFillNA() {
  _qaGrille.forEach(z => z.points.forEach(p => {
    if (!qaAnswers[p.id] || qaAnswers[p.id].rep === null || qaAnswers[p.id].rep === undefined) {
      qaAnswers[p.id] = { rep: 'NA', cmt: qaAnswers[p.id]?.cmt || '', photos: qaAnswers[p.id]?.photos || [], q: p.q };
    }
  }));
}

/**
 * Affiche l'historique des audits Qualimètre, filtré par magasins
 * visibles et par le sélecteur de magasin.
 * @returns {void}
 */
function renderQualAudits() {
  /** @type {string[]} */
  const mids = visibleMids();
  const sel = el('flt-qaud-mag');
  if (sel) {
    /** @type {string} */
    const cv = sel.value; while (sel.options.length > 1) sel.remove(1);
    DB.magasins.filter(m => mids.includes(m.id)).forEach(m => {
      const o = document.createElement('option'); o.value = m.id; o.textContent = m.nom; sel.appendChild(o);
    });
    if (cv) sel.value = cv;
  }
  /** @type {string} */
  const fMag = v('flt-qaud-mag');
  /** @type {QualAudit[]} */
  let list = (DB.qualAudits || []).filter(a => mids.includes(a.mid));
  if (fMag) list = list.filter(a => a.mid === fMag);
  list = [...list].reverse();
  el('qaud-hist-cnt').textContent = list.length + ' audit(s)';
  const tb = el('qaud-tb');
  if (!list.length) {
    tb.innerHTML = `<tr><td colspan="8"><div class="empty-state"><i class="ti ti-rosette" style="color:#ddd6fe"></i><p>Aucun audit Qualimètre réalisé.</p></div></td></tr>`;
    return;
  }
  tb.innerHTML = list.map(a => `<tr>
    <td>${a.mag}</td>
    <td>${fd(a.date)}</td>
    <td>${a.aud}</td>
    <td><span class="score-badge" style="background:#f5f3ff;color:#6d28d9">${a.score}%</span></td>
    <td style="color:${a.nc > 0 ? 'var(--danger)' : 'var(--success)'};font-weight:600">${a.nc}</td>
    <td>${statBdg(a.statut)}</td>
    <td><div class="act-btns">
      <button class="btn btn-secondary btn-sm" onclick="showQualAudit('${a.id}')"><i class="ti ti-eye"></i></button>
      ${hasPerm('qaudit_delete') ? `<button class="btn btn-danger btn-sm" onclick="deleteQualAudit('${a.id}')"><i class="ti ti-trash"></i></button>` : ''}
    </div></td>
  </tr>`).join('');
}

/**
 * Ouvre le wizard de création d'un nouvel audit Qualimètre (étape 0
 * : écran d'introduction), en réinitialisant l'état du module.
 * @returns {void}
 */
function openQualAuditModal() {
  qaStep = 0; qaAnswers = {}; qaCurrentZone = 0; _currentQaDraftId = null; _qaGrille = [];
  /** @type {string[]} */
  const mids = visibleMids();
  const msel = el('qa-mag');
  msel.innerHTML = '<option value="">Sélectionner...</option>' +
    DB.magasins.filter(m => mids.includes(m.id) && m.statut === 'actif').map(m => `<option value="${m.id}">${m.nom}</option>`).join('');
  el('qa-date').value = today();
  // ⚠️ CORRIGÉ : remplace les vérifications CU.role par les droits
  // granulaires dédiés (qaudit_edit_date, qaudit_edit_auditor) —
  // définis dans config.js depuis la refonte des permissions mais
  // jamais branchés dans CE fichier (seule la copie audit_qualimetre.js,
  // non chargée par le HTML, les utilisait).
  el('qa-date').readOnly = !hasPerm('qaudit_edit_date');
  /** @type {boolean} */
  const canEditAuditor = hasPerm('qaudit_edit_auditor');
  el('qa-aud').value = canEditAuditor ? '' : (CU ? CU.nom : '');
  el('qa-aud').readOnly = !canEditAuditor;
  sv('qa-cmt', '');
  el('qa-s0').style.display = ''; el('qa-s1').style.display = 'none';
  el('qa-s2').style.display = 'none'; el('qa-s3').style.display = 'none';
  el('qa-prev').style.display = 'none';
  el('qa-next').innerHTML = 'Démarrer <i class="ti ti-arrow-right"></i>';
  el('qa-next').onclick = qaNext;
  openModal('m-qual-audit');
}

/**
 * Avance le wizard d'audit Qualimètre à l'étape suivante.
 * Étape 0→1 : passe de l'intro à la sélection magasin/date/auditeur.
 * Étape 1→2 : valide les champs, résout la grille du magasin
 * sélectionné (getQualimetreGrille), initialise les réponses, puis
 * construit les questions.
 * Étape 2 : soumet l'audit.
 * @returns {void}
 */
function qaNext() {
  if (qaStep === 0) {
    el('qa-s0').style.display = 'none'; el('qa-s1').style.display = '';
    el('qa-prev').style.display = '';
    el('qa-next').innerHTML = 'Commencer l\'audit <i class="ti ti-arrow-right"></i>';
    qaStep = 1;
  } else if (qaStep === 1) {
    if (!v('qa-mag') || !v('qa-date') || !v('qa-aud').trim()) { alert('Magasin, date et auditeur sont requis.'); return; }
    // Résoudre la grille pour CE magasin
    _qaGrille = getQualimetreGrille(v('qa-mag'));
    // Init des réponses
    _qaGrille.forEach(z => z.points.forEach(p => {
      qaAnswers[p.id] = { rep: null, cmt: '', photos: [], q: p.q };
    }));
    buildQaQuestions();
    el('qa-s1').style.display = 'none'; el('qa-s2').style.display = '';
    const rb = el('btn-ref-affichage'); if (rb) rb.style.display = '';
    el('qa-next').innerHTML = 'Valider l\'audit <i class="ti ti-check"></i>';
    const qapause = el('qa-pause'); if (qapause) qapause.style.display = '';
    qaStep = 2;
  } else if (qaStep === 2) {
    submitQualAudit();
  }
}

/**
 * Revient à l'étape précédente du wizard d'audit Qualimètre.
 * @returns {void}
 */
function qaPrev() {
  if (qaStep === 2) {
    el('qa-s2').style.display = 'none'; el('qa-s1').style.display = '';
    const rb2 = el('btn-ref-affichage'); if (rb2) rb2.style.display = 'none';
    el('qa-next').innerHTML = 'Commencer l\'audit <i class="ti ti-arrow-right"></i>';
    const qapause = el('qa-pause'); if (qapause) qapause.style.display = 'none';
    qaStep = 1;
  } else if (qaStep === 1) {
    el('qa-s1').style.display = 'none'; el('qa-s0').style.display = '';
    el('qa-prev').style.display = 'none';
    el('qa-next').innerHTML = 'Démarrer <i class="ti ti-arrow-right"></i>';
    qaStep = 0;
  }
}

/**
 * Construit les onglets de zone et affiche la première zone de
 * l'audit Qualimètre en cours.
 * @returns {void}
 */
function buildQaQuestions() {
  qaCurrentZone = 0;
  el('qa-zone-tabs').innerHTML = _qaGrille.map((z, i) => `
    <button onclick="switchQaZone(${i})" id="qa-tab-${i}" class="qatab${i === 0 ? ' active' : ''}">
      ${z.emoji} ${z.label.split(' – ')[1] || z.label}
    </button>`).join('');
  renderQaZone(0);
  updateQaScore();
}

/**
 * Bascule l'affichage vers une autre zone (met à jour le style des
 * onglets et rend la zone cible).
 * @param {number} idx - Index dans _qaGrille.
 * @returns {void}
 */
function switchQaZone(idx) {
  qaCurrentZone = idx;
  document.querySelectorAll('[id^=qa-tab-]').forEach((b, i) => {
    b.classList.toggle('active', i === idx);
  });
  renderQaZone(idx);
}

/**
 * Affiche les questions d'une zone, groupées par catégorie
 * (point.cat — sous-groupe à l'intérieur de la zone, ex : colonne
 * "Sous-section" à l'import), avec un en-tête de section par
 * catégorie, sur le même principe que switchAuditZone (audits.js,
 * FSQS). Restaure les réponses déjà saisies (réponse, commentaire,
 * photos), puis met à jour la progression.
 * @param {number} idx - Index dans _qaGrille.
 * @returns {void}
 */
function renderQaZone(idx) {
  /** @type {QMZoneWithPoints | undefined} */
  const zone = _qaGrille[idx]; if (!zone) return;
  el('qa-zone-title').textContent = zone.emoji + ' ' + zone.label;

  /** @type {string[]} */
  const categories = [...new Set(zone.points.map(p => p.cat || 'Général'))];
  el('qa-questions').innerHTML = categories.map(category => `
    <div style="padding:8px 4px;font-size:11px;font-weight:600;color:var(--text2);text-transform:uppercase;letter-spacing:.5px">${category}</div>
    ${zone.points.filter(p => (p.cat || 'Général') === category).map(p => `
    <div class="aq" id="qaaq-${p.id}" style="margin-bottom:8px">
      <div class="qt">${p.q}</div>
      ${p.prec ? `<div style="font-size:11px;color:var(--text2);margin-bottom:6px;font-style:italic">${p.prec}</div>` : ''}
      <div class="rg">
        <div class="rb" onclick="setQaRep('${p.id}','C',this)"><i class="ti ti-check" style="font-size:12px"></i> Conforme</div>
        <div class="rb" onclick="setQaRep('${p.id}','NC',this)"><i class="ti ti-x" style="font-size:12px"></i> Non conforme</div>
        <div class="rb" onclick="setQaRep('${p.id}','NA',this)"><i class="ti ti-minus" style="font-size:12px"></i> N/A</div>
      </div>
      <div class="nc-det" id="qand-${p.id}">
        <input type="text" class="form-control" style="font-size:12px;margin-top:8px" placeholder="Commentaire (obligatoire pour NC)…" oninput="qaAnswers['${p.id}'].cmt=this.value">
        <div id="qa-photos-${p.id}" style="margin-top:8px"></div>
        <div style="display:flex;gap:8px;margin-top:6px">
          <label class="btn btn-secondary btn-sm" style="cursor:pointer;display:flex;align-items:center;gap:4px">
            <i class="ti ti-photo"></i> Galerie
            <input type="file" accept="image/*" style="display:none" onchange="handleQaPhoto('${p.id}',this)">
          </label>
          <label class="btn btn-secondary btn-sm" style="cursor:pointer;display:flex;align-items:center;gap:4px">
            <i class="ti ti-camera"></i> Photo
            <input type="file" accept="image/*" capture="environment" style="display:none" onchange="handleQaPhoto('${p.id}',this)">
          </label>
        </div>
      </div>
    </div>`).join('')}
  `).join('');
  // Restaurer les réponses existantes
  zone.points.forEach(p => {
    /** @type {QaAnswer | undefined} */
    const a = qaAnswers[p.id]; if (!a || !a.rep) return;
    const btns = document.querySelectorAll(`#qaaq-${p.id} .rb`);
    /** @type {Record<QaAnswerCode, number>} */
    const map = { 'C': 0, 'NC': 1, 'NA': 2 };
    if (btns[map[a.rep]]) _applyQaRep(p.id, a.rep, btns[map[a.rep]]);
    if (a.cmt) { const inp = document.querySelector(`#qand-${p.id} input`); if (inp) inp.value = a.cmt; }
    if (a.photos && a.photos.length) _renderQaPhotos(p.id);
  });
  updateQaProgress(idx);
}

/**
 * Enregistre la réponse à un point de contrôle Qualimètre, met à
 * jour l'UI et recalcule score/progression.
 * @param {string} pid - Référence vers GrillePoint.id.
 * @param {QaAnswerCode} r
 * @param {HTMLElement} btn - Bouton de réponse cliqué.
 * @returns {void}
 */
function setQaRep(pid, r, btn) {
  qaAnswers[pid].rep = r;
  _applyQaRep(pid, r, btn);
  updateQaScore();
  updateQaProgress(qaCurrentZone);
}

/**
 * Applique le style visuel d'une réponse sélectionnée (bouton actif,
 * classe 'is-nc' sur la question, affichage de la zone de détail NC).
 * @param {string} pid - Référence vers GrillePoint.id.
 * @param {QaAnswerCode} r
 * @param {HTMLElement} btn - Bouton de réponse cliqué.
 * @returns {void}
 */
function _applyQaRep(pid, r, btn) {
  const c = el('qaaq-' + pid); if (!c) return;
  c.querySelectorAll('.rb').forEach(b => b.classList.remove('selC', 'selNC', 'selNA'));
  btn.classList.add('sel' + r);
  c.classList.toggle('is-nc', r === 'NC');
  const d = el('qand-' + pid);
  if (r === 'NC') d?.classList.add('on'); else d?.classList.remove('on');
}

// ── Photos NC Qualimètre (2 max, Supabase Storage audits/qualimetre/) ──

/**
 * Photos en attente d'envoi (Object URL locales) par point de
 * contrôle Qualimètre — même principe que _pendingAuditPhotoPreviews
 * (audits.js, FSQS).
 * @type {Object<string, {queueId: string, localUrl: string}[]>}
 */
let _pendingQaPhotoPreviews = {};

/**
 * Upload une photo pour un point de contrôle Qualimètre vers
 * Supabase Storage (limite stricte de 2 photos par point, en
 * comptant les photos déjà envoyées ET celles encore en attente).
 *
 * ⚠️ CORRIGÉ : auparavant, un échec d'envoi (ou une interruption en
 * cours de route — voir ci-dessous) perdait la photo PUREMENT ET
 * SIMPLEMENT (juste une alerte, rien de récupérable), contrairement à
 * handleAuditPhoto (audits.js, FSQS) qui la mettait déjà en file
 * d'attente durable. La photo est maintenant mise en file (IndexedDB,
 * voir queuePendingPhoto storage.js) AVANT même la tentative d'envoi,
 * pas seulement après un échec constaté : sur tablette, prendre une
 * photo bascule souvent vers l'appli caméra native puis revient au
 * navigateur ; si l'onglet est ensuite déchargé par l'OS (mémoire
 * limitée) PENDANT l'envoi (compression ou upload encore en cours),
 * l'exécution s'interrompt sans qu'aucune erreur ne soit levée — la
 * photo n'atteignait alors ni ans.photos ni aucune file d'attente, et
 * disparaissait silencieusement.
 * @param {string} pid - Référence vers GrillePoint.id.
 * @param {HTMLInputElement} input - Élément `<input type="file">` (un seul fichier).
 * @returns {Promise<void>}
 */
async function handleQaPhoto(pid, input) {
  /** @type {File | undefined} */
  const file = input.files[0]; if (!file) return;
  /** @type {QaAnswer | undefined} */
  const ans = qaAnswers[pid]; if (!ans) return;
  if (!ans.photos) ans.photos = [];

  /** @type {number} */
  const pendingCount = (_pendingQaPhotoPreviews[pid] || []).length;
  if (ans.photos.length + pendingCount >= 2) {
    alert('2 photos maximum par point de contrôle.');
    input.value = '';
    return;
  }

  try {
    /** @type {File | Blob} */
    const compressed = await compressImageFile(file);
    /** @type {string} */
    const ext = compressed.type === 'image/jpeg' ? 'jpg' : (file.name.split('.').pop() || 'jpg');
    /** @type {string} */
    const path = `audits/qualimetre/qa-${pid}-${uid()}.${ext}`;

    /** @type {string} */
    const queueId = await _stagePendingQaPhoto(pid, compressed, path);
    /** @type {string | null} */
    const url = await uploadPhotoWithRetry(compressed, path);

    if (url) {
      await removePendingPhoto(queueId);
      ans.photos.push(url);
    } else {
      _showPendingQaPhotoPreview(pid, queueId, compressed);
    }
  } catch (err) {
    console.error('Erreur inattendue lors de l\'upload d\'une photo Qualimètre :', err);
    alert('Une erreur inattendue est survenue pour cette photo — réessayez de l\'ajouter.');
  }

  input.value = '';
  _renderQaPhotos(pid);
}

/**
 * Met une photo Qualimètre en file d'attente durable (IndexedDB) —
 * appelée AVANT même la tentative d'envoi (voir handleQaPhoto),
 * silencieuse : ne touche à aucun affichage. Garantit d'abord qu'un
 * brouillon existe (voir _snapshotCurrentQaAuditAsDraft) pour que le
 * réconciliateur (enregistré en bas de ce fichier) sache où replacer
 * la vraie URL une fois l'upload réussi.
 * @param {string} pid - Référence vers GrillePoint.id.
 * @param {Blob} blob - Photo déjà compressée.
 * @param {string} storagePath - Chemin de destination dans le bucket 'photos'.
 * @returns {Promise<string>} L'identifiant de la file (PendingPhotoEntry.id).
 */
async function _stagePendingQaPhoto(pid, blob, storagePath) {
  _snapshotCurrentQaAuditAsDraft();
  return queuePendingPhoto({
    context:  'audit-qualimetre',
    pointId:  pid,
    draftId:  _currentQaDraftId,
    blob,
    storagePath,
  });
}

/**
 * Affiche l'aperçu local d'une photo Qualimètre restée en file
 * d'attente après un échec d'envoi réellement constaté — la photo
 * elle-même est déjà en sécurité depuis _stagePendingQaPhoto.
 * @param {string} pid - Référence vers GrillePoint.id.
 * @param {string} queueId - Référence vers PendingPhotoEntry.id (storage.js).
 * @param {Blob} blob - Photo déjà compressée, pour l'aperçu local.
 * @returns {void}
 */
function _showPendingQaPhotoPreview(pid, queueId, blob) {
  /** @type {string} */
  const localUrl = URL.createObjectURL(blob);
  if (!_pendingQaPhotoPreviews[pid]) _pendingQaPhotoPreviews[pid] = [];
  _pendingQaPhotoPreviews[pid].push({ queueId, localUrl });
  showToast('Connexion instable — photo mise en attente, envoi automatique dès que possible', 'warning');
}

/**
 * Annule l'envoi d'une photo Qualimètre encore en attente (avant
 * qu'elle n'ait réussi à s'envoyer) — la retire de la file d'attente
 * hors-ligne (IndexedDB) et de l'aperçu local, après confirmation
 * puisque la photo est alors définitivement perdue. Même principe que
 * removePendingAuditPhotoPreview (audits.js, FSQS).
 * @param {string} pid - Référence vers GrillePoint.id.
 * @param {string} queueId - Référence vers PendingPhotoEntry.id (storage.js).
 * @returns {Promise<void>}
 */
async function removePendingQaPhotoPreview(pid, queueId) {
  if (!confirm("Annuler l'envoi de cette photo ? Elle sera définitivement perdue.")) return;

  /** @type {{queueId: string, localUrl: string}[]} */
  const pending = _pendingQaPhotoPreviews[pid] || [];
  /** @type {number} */
  const idx = pending.findIndex(p => p.queueId === queueId);
  if (idx >= 0) {
    URL.revokeObjectURL(pending[idx].localUrl);
    pending.splice(idx, 1);
  }

  await removePendingPhoto(queueId);
  _renderQaPhotos(pid);
}

/**
 * Rafraîchit l'aperçu des miniatures de photos d'un point de
 * contrôle : photos déjà envoyées (bouton de suppression) puis
 * photos encore en file d'attente (bordure pointillée, bouton
 * d'annulation) — même principe que _buildAuditPhotoThumbsHtml
 * (audits.js, FSQS).
 * @param {string} pid - Référence vers GrillePoint.id.
 * @returns {void}
 */
function _renderQaPhotos(pid) {
  const container = el('qa-photos-' + pid); if (!container) return;
  /** @type {string[]} */
  const photos = qaAnswers[pid]?.photos || [];
  /** @type {{queueId: string, localUrl: string}[]} */
  const pending = _pendingQaPhotoPreviews[pid] || [];

  container.innerHTML =
    photos.map((url, i) => `
    <div style="display:inline-block;position:relative;margin-right:8px;margin-bottom:4px">
      <img src="${url}" style="width:80px;height:80px;object-fit:cover;border-radius:6px;border:2px solid #ddd6fe;cursor:pointer" onclick="openPhotoViewer('${url}')">
      <button onclick="removeQaPhoto('${pid}',${i})" style="position:absolute;top:-6px;right:-6px;width:20px;height:20px;border-radius:50%;background:var(--danger);color:#fff;border:none;cursor:pointer;font-size:12px;line-height:1;display:flex;align-items:center;justify-content:center"><i class="ti ti-x" style="font-size:10px"></i></button>
    </div>`).join('') +
    pending.map(p => `
    <div style="display:inline-block;position:relative;margin-right:8px;margin-bottom:4px" title="En attente d'envoi (connexion instable) — envoi automatique dès que possible">
      <img src="${p.localUrl}" style="width:80px;height:80px;object-fit:cover;border-radius:6px;border:2px dashed var(--warning-mid, #d97706);opacity:.7">
      <span style="position:absolute;bottom:-4px;left:-4px;background:var(--warning-light);color:#92400e;border-radius:50%;width:16px;height:16px;display:flex;align-items:center;justify-content:center;font-size:9px;border:2px solid #fff">
        <i class="ti ti-clock"></i>
      </span>
      <button onclick="removePendingQaPhotoPreview('${pid}','${p.queueId}')" style="position:absolute;top:-6px;right:-6px;width:20px;height:20px;border-radius:50%;background:var(--danger);color:#fff;border:none;cursor:pointer;font-size:12px;line-height:1;display:flex;align-items:center;justify-content:center"><i class="ti ti-x" style="font-size:10px"></i></button>
    </div>`).join('');
}

/**
 * Supprime une photo d'un point de contrôle Qualimètre (Supabase
 * Storage + état local), après confirmation.
 * @param {string} pid - Référence vers GrillePoint.id.
 * @param {number} idx - Index de la photo dans le tableau .photos.
 * @returns {void}
 */
function removeQaPhoto(pid, idx) {
  if (!confirm('Supprimer cette photo ?')) return;
  /** @type {QaAnswer | undefined} */
  const ans = qaAnswers[pid]; if (!ans || !ans.photos) return;
  /** @type {string} */
  const url = ans.photos[idx];
  if (url) sbDeletePhoto(url.split('/storage/v1/object/public/photos/')[1]);
  ans.photos.splice(idx, 1);
  _renderQaPhotos(pid);
}

/**
 * Recalcule et affiche le score pondéré provisoire de l'audit
 * Qualimètre en cours (les points N/A sont exclus du calcul).
 * Contrairement au score FSQS (audits.js), ce calcul n'utilise pas
 * de pondération par poids (GrillePoint.p) — c'est une simple
 * proportion de points conformes parmi les points valides.
 * @returns {void}
 */
function updateQaScore() {
  /** @type {QaAnswer[]} */
  const ans = Object.values(qaAnswers);
  /** @type {QaAnswer[]} */
  const valid = ans.filter(a => a.rep && a.rep !== 'NA');
  /** @type {number} */
  const c = valid.filter(a => a.rep === 'C').length;
  /** @type {number} */
  const total = valid.length;
  /** @type {number | null} */
  const pct = total > 0 ? Math.round((c / total) * 100) : null;
  const sl = el('qa-score-live'); if (sl) sl.textContent = pct !== null ? pct + '%' : '–';
}

/**
 * Met à jour le texte de progression de la zone affichée et ajoute
 * une coche '✓' sur son onglet si tous ses points ont une réponse.
 * @param {number} idx - Index dans _qaGrille.
 * @returns {void}
 */
function updateQaProgress(idx) {
  /** @type {QMZoneWithPoints | undefined} */
  const zone = _qaGrille[idx]; if (!zone) return;
  /** @type {number} */
  const done = zone.points.filter(p => qaAnswers[p.id] && qaAnswers[p.id].rep).length;
  el('qa-progress').textContent = `Zone ${idx + 1}/${_qaGrille.length} · ${done}/${zone.points.length} réponses`;
  const tab = el('qa-tab-' + idx);
  if (tab && done === zone.points.length) { tab.innerHTML = tab.innerHTML.replace(/\s*✓$/, '') + ' ✓'; }
}

/**
 * Finalise et enregistre l'audit Qualimètre en cours : complète les
 * réponses manquantes en N/A, calcule le score (non pondéré par
 * poids, contrairement au score FSQS), crée le QualAudit, et
 * supprime le brouillon lié si applicable.
 * @returns {void}
 */
function submitQualAudit() {
  /** @type {string} */
  const mid = v('qa-mag'), date = v('qa-date'), aud = v('qa-aud').trim(), cmt = v('qa-cmt');
  /** @type {Magasin | {}} */
  const mag = DB.magasins.find(m => m.id === mid) || {};
  autoFillNA();
  /** @type {QaAnswer[]} */
  const ans = Object.values(qaAnswers);
  /** @type {QaAnswer[]} */
  const valid = ans.filter(a => a.rep && a.rep !== 'NA');
  /** @type {number} */
  const c = valid.filter(a => a.rep === 'C').length;
  /** @type {QaAnswer[]} */
  const ncList = valid.filter(a => a.rep === 'NC');
  /** @type {number} */
  const score = valid.length > 0 ? Math.round((c / valid.length) * 100) : 100;
  if (!DB.qualAudits) DB.qualAudits = [];
  /** @type {string} */
  const aid = 'QA-' + uid();
  /** @type {QualAudit} */
  DB.qualAudits.push({
    id: aid, mid, mag: mag.nom || '', date, aud, cmt, score,
    nc: ncList.length, statut: ncList.length ? 'Ouvert' : 'Conforme',
    answers: { ...qaAnswers }
  });
  if (_currentQaDraftId) {
    DB.drafts = DB.drafts.filter(d => d.id !== _currentQaDraftId);
    sbDeleteWhere('drafts', 'id', _currentQaDraftId);
    save(['drafts', 'qualAudits']); _currentQaDraftId = null;
  } else { save(); }
  el('qa-s2').style.display = 'none'; el('qa-s3').style.display = '';
  el('qa-prev').style.display = 'none';
  const rb3 = el('btn-ref-affichage'); if (rb3) rb3.style.display = 'none';
  const qapause2 = el('qa-pause'); if (qapause2) qapause2.style.display = 'none';
  el('qa-next').innerHTML = 'Fermer';
  el('qa-next').onclick = () => { closeModal('m-qual-audit'); renderQualAudits(); };
  el('qa-recap').textContent = (mag.nom || '') + ' · ' + fd(date) + ' · Auditeur : ' + aud;
  el('qa-score-fin').textContent = score + '%';
  el('qa-nc-msg').textContent = ncList.length ? ncList.length + ' point(s) non conforme(s) détecté(s)' : '';
  qaStep = 3;
}

/**
 * Affiche la modale de détail d'un audit Qualimètre (en-tête, score,
 * commentaire, points non conformes avec photos).
 * @param {string} id - Référence vers QualAudit.id.
 * @returns {void}
 */
function showQualAudit(id) {
  /** @type {QualAudit | undefined} */
  const a = (DB.qualAudits || []).find(x => x.id === id); if (!a) return;
  /** @type {string} */
  const scolor = a.score >= 90 ? 'var(--success)' : a.score >= 75 ? '#f59e0b' : a.score >= 60 ? 'var(--orange)' : 'var(--danger)';
  let html = `<div style="display:grid;grid-template-columns:1fr 1fr;gap:16px;margin-bottom:20px">
    <table style="font-size:13px">
      <tr><td class="tm" style="padding:4px 0">Magasin</td><td>${a.mag}</td></tr>
      <tr><td class="tm" style="padding:4px 0">Date</td><td>${fd(a.date)}</td></tr>
      <tr><td class="tm" style="padding:4px 0">Auditeur</td><td>${a.aud}</td></tr>
      <tr><td class="tm" style="padding:4px 0">Statut</td><td>${statBdg(a.statut)}</td></tr>
    </table>
    <div style="text-align:center">
      <div style="width:80px;height:80px;border-radius:50%;border:7px solid ${scolor};display:flex;align-items:center;justify-content:center;margin:0 auto 8px;font-size:20px;font-weight:700;color:${scolor}">${a.score}%</div>
      <div class="tsm tm">${a.score >= 90 ? 'Excellent' : a.score >= 75 ? 'Satisfaisant' : a.score >= 60 ? 'À améliorer' : 'Insuffisant'}</div>
    </div>
  </div>`;
  if (a.cmt) html += `<div style="background:var(--bg);border-radius:var(--radius);padding:10px 14px;margin-bottom:16px;font-size:13px">${a.cmt}</div>`;
  /** @type {[string, QaAnswer][]} */
  const ncItems = Object.entries(a.answers || {}).filter(([, v]) => v.rep === 'NC');
  if (ncItems.length) {
    html += `<div style="font-size:13px;font-weight:600;margin-bottom:10px;color:var(--danger)">Points non conformes (${ncItems.length})</div>`;
    html += ncItems.map(([pid, v]) => `
      <div style="background:var(--danger-light);border-radius:var(--radius);padding:9px 14px;margin-bottom:6px;font-size:12px">
        <div style="font-weight:500">${v.q}</div>
        ${v.cmt ? `<div style="color:var(--danger);margin-top:3px">${v.cmt}</div>` : ''}
        ${(v.photos && v.photos.length) ? `<div style="margin-top:6px;display:flex;gap:6px;flex-wrap:wrap">
          ${v.photos.map(url => `<img src="${url}" style="width:72px;height:72px;object-fit:cover;border-radius:6px;border:2px solid #fca5a5;cursor:pointer" onclick="openPhotoViewer('${url}')">`).join('')}
        </div>` : ''}
      </div>`).join('');
  } else {
    html += `<div style="color:var(--success);font-size:13px;font-weight:500"><i class="ti ti-circle-check"></i> Tous les points sont conformes.</div>`;
  }
  el('qa-detail-body').innerHTML = html;
  openModal('m-qual-audit-detail');
}

/**
 * Supprime un audit Qualimètre, après confirmation.
 * @param {string} id - Référence vers QualAudit.id.
 * @returns {void}
 */
function deleteQualAudit(id) {
  // ⚠️ AJOUTÉ : droit granulaire qaudit_delete (remplace le contrôle
  // CU.role === 'admin' qui ne protégeait que l'affichage du bouton).
  if (!hasPerm('qaudit_delete')) return;
  if (!confirm(`Supprimer l'audit Qualimètre ${id} ?`)) return;
  DB.qualAudits = (DB.qualAudits || []).filter(x => x.id !== id);
  save(); renderQualAudits();
}

/**
 * Met l'audit Qualimètre en cours en pause : sauvegarde l'état
 * courant comme Draft (type 'qualimetre'), persiste localement +
 * pousse vers Supabase, puis ferme la modale.
 * @returns {void}
 */
/**
 * Construit et persiste (local + Supabase) un instantané du brouillon
 * d'audit Qualimètre en cours, sans toucher à l'affichage — factorisé
 * hors de pauseQualAudit() pour être appelable aussi par les filets de
 * sécurité (beforeunload, changement de visibilité, autosave
 * périodique — voir init.js) sans fermer la modale ni interrompre
 * l'utilisateur.
 * @returns {Draft} Le brouillon sauvegardé.
 */
function _snapshotCurrentQaAuditAsDraft() {
  /** @type {string} */
  const mid = v('qa-mag'), date = v('qa-date'), aud = v('qa-aud').trim(), cmt = v('qa-cmt');
  /** @type {Magasin | {}} */
  const mag = DB.magasins.find(m => m.id === mid) || {};
  /** @type {string} */
  const draftId = _currentQaDraftId || 'DRF-' + uid();
  _currentQaDraftId = draftId;
  /** @type {number} */
  const existing = DB.drafts.findIndex(d => d.id === draftId);
  /** @type {Draft} */
  const draft = {
    id: draftId, mid, mag: mag.nom || '', rayon: 'Qualimètre', date, aud, cmt,
    answers: { ...qaAnswers }, createdAt: today(), uid: CU ? CU.id : '', type: 'qualimetre'
  };
  if (existing >= 0) DB.drafts[existing] = draft; else DB.drafts.push(draft);
  save(['drafts']); sbUpsert('drafts', [draft]);
  return draft;
}

function pauseQualAudit() {
  _snapshotCurrentQaAuditAsDraft();
  const qapause = el('qa-pause'); if (qapause) qapause.style.display = 'none';
  closeModal('m-qual-audit');
  qaStep = 0; _currentQaDraftId = null;
  showToast('Audit Qualimètre mis en pause — retrouvez-le dans Brouillons', 'success');
  renderQualAudits();
}

/**
 * Reprend un brouillon d'audit Qualimètre : restaure le formulaire,
 * résout la grille du magasin concerné, restaure les réponses déjà
 * saisies, et rouvre le wizard à l'étape questions.
 * @param {string} id - Référence vers Draft.id.
 * @returns {void}
 */
function resumeQualDraft(id) {
  /** @type {Draft | undefined} */
  const d = DB.drafts.find(x => x.id === id); if (!d) return;
  _currentQaDraftId = id;
  /** @type {string[]} */
  const mids = visibleMids();
  const msel = el('qa-mag');
  msel.innerHTML = '<option value="">Sélectionner...</option>' +
    DB.magasins.filter(m => mids.includes(m.id) && m.statut === 'actif').map(m => `<option value="${m.id}">${m.nom}</option>`).join('');
  el('qa-mag').value = d.mid;
  el('qa-date').value = d.date;
  el('qa-date').readOnly = !hasPerm('qaudit_edit_date'); // droit granulaire (voir openQualAuditModal)
  el('qa-aud').value = d.aud;
  sv('qa-cmt', d.cmt || '');
  qaAnswers = { ...d.answers };
  // Résoudre la grille pour ce magasin
  _qaGrille = getQualimetreGrille(d.mid);
  el('qa-s0').style.display = 'none'; el('qa-s1').style.display = 'none';
  el('qa-s2').style.display = ''; el('qa-s3').style.display = 'none';
  el('qa-prev').style.display = '';
  const qapause = el('qa-pause'); if (qapause) qapause.style.display = '';
  el('qa-next').innerHTML = 'Valider l\'audit <i class="ti ti-check"></i>';
  el('qa-next').onclick = qaNext;
  buildQaQuestions();
  // Restaurer les réponses
  Object.entries(d.answers).forEach(([pid, ans]) => {
    if (!ans.rep) return;
    const btns = document.querySelectorAll(`#qaaq-${pid} .rb`);
    /** @type {Record<QaAnswerCode, number>} */
    const map = { 'C': 0, 'NC': 1, 'NA': 2 };
    if (btns[map[ans.rep]]) setQaRep(pid, ans.rep, btns[map[ans.rep]]);
  });
  qaStep = 2;
  openModal('m-qual-audit');
}

/**
 * Réconciliateur appelé par flushPendingPhotoQueue (storage.js) après
 * l'envoi réussi d'une photo Qualimètre auparavant mise en attente
 * (voir _stagePendingQaPhoto). Deux cas possibles, mêmes principes
 * que le réconciliateur FSQS ('audit-fsqs', audits.js) :
 * 1) L'audit Qualimètre est toujours ouvert dans cette session
 *    (qaAnswers contient encore ce point) : la vraie URL est ajoutée
 *    directement à la réponse en mémoire, aperçu local retiré/libéré.
 * 2) L'audit n'est plus ouvert (page rechargée, audit mis en pause
 *    puis fermé...) : la vraie URL est injectée directement dans le
 *    brouillon persisté (DB.drafts), identifié par entry.draftId.
 * @param {PendingPhotoEntry} entry
 * @param {string} url - URL publique réelle (Supabase Storage) obtenue après envoi réussi.
 * @returns {void}
 */
registerPhotoQueueReconciler('audit-qualimetre', (entry, url) => {
  /** @type {{queueId: string, localUrl: string}[]} */
  const pending = _pendingQaPhotoPreviews[entry.pointId] || [];
  /** @type {number} */
  const idx = pending.findIndex(p => p.queueId === entry.id);
  if (idx >= 0) {
    URL.revokeObjectURL(pending[idx].localUrl);
    pending.splice(idx, 1);
  }

  if (qaAnswers[entry.pointId]) {
    // Audit toujours ouvert dans cette session.
    if (!qaAnswers[entry.pointId].photos) qaAnswers[entry.pointId].photos = [];
    qaAnswers[entry.pointId].photos.push(url);
    _renderQaPhotos(entry.pointId);
  } else if (entry.draftId) {
    // Audit non ouvert : on injecte directement dans le brouillon persisté.
    /** @type {Draft | undefined} */
    const draft = DB.drafts.find(d => d.id === entry.draftId);
    if (draft && draft.answers && draft.answers[entry.pointId]) {
      if (!draft.answers[entry.pointId].photos) draft.answers[entry.pointId].photos = [];
      draft.answers[entry.pointId].photos.push(url);
      save(['drafts']);
      sbUpsert('drafts', [draft]);
    }
  }

  showToast('Photo Qualimètre en attente envoyée avec succès ✓', 'success');
});
