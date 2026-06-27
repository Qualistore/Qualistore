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
 * Rayons "de base" historiques, conservés comme valeurs de
 * démarrage pour une installation neuve (aucun audit, aucune grille
 * personnalisée encore créée). Ne contraint plus rien : un rayon
 * absent de cette liste est tout aussi valide dès qu'il existe dans
 * le document importé, dans DB.grilleCustom, ou qu'il a été créé/
 * renommé manuellement par un utilisateur (voir getKnownRayons,
 * ⚠️ CHANGÉ ci-dessous).
 * @type {string[]}
 */
const RAYONS_BASE_SEED = [
  'Boucherie', 'Boulangerie', 'Drive', 'Marée',
  'Charcuterie', 'Fromage', 'Fruits & Légumes',
];

/**
 * ⚠️ CHANGÉ : RAYONS_LIST n'est plus une liste fermée codée en dur.
 * Le nom d'un rayon FSQS ne doit jamais être une contrainte fixe —
 * il doit toujours correspondre soit à ce qu'écrit le document
 * importé, soit à une modification manuelle de l'utilisateur (voir
 * demande produit). getKnownRayons() est désormais la seule source
 * de vérité ; RAYONS_LIST est conservée UNIQUEMENT pour compatibilité
 * de nom avec du code externe non encore migré — préférer
 * getKnownRayons() dans tout nouveau code.
 * @type {string[]}
 * @deprecated Utiliser getKnownRayons().
 */
const RAYONS_LIST = RAYONS_BASE_SEED;

/**
 * Calcule la liste de tous les rayons FSQS actuellement "connus" par
 * l'application, en fusionnant trois sources (dédupliquées, ordre
 * stable : seed de base, puis ajouts par ordre alphabétique) :
 * 1. RAYONS_BASE_SEED — rayons historiques, toujours proposés même
 *    sans aucune donnée (évite un sélecteur vide à l'installation).
 * 2. Object.keys(DB.grilleCustom) — tout rayon ayant au moins un
 *    point de contrôle personnalisé (création manuelle, import, ou
 *    renommage — voir renameRayon, ui.js).
 * 3. Les valeurs .rayon réellement utilisées dans DB.audits et
 *    DB.drafts — un rayon peut avoir été audité sans jamais avoir
 *    reçu de point personnalisé (il n'utilise alors que le
 *    référentiel commun GRILLE_BASE_COMMUNE).
 *
 * ⚠️ CORRIGÉ : un rayon explicitement supprimé (deleteRayonEverywhere)
 * est exclu même s'il appartient à RAYONS_BASE_SEED — voir
 * DB.deletedRayons. Sans cette exclusion, supprimer un rayon
 * "historique" (ex : 'Boucherie') n'avait aucun effet visible : le
 * seed le réinjectait systématiquement à chaque appel de cette
 * fonction, donnant l'impression que la suppression "ne prenait pas"
 * ou que le rayon "réapparaissait".
 *
 * C'est la fonction à utiliser PARTOUT où l'application a besoin de
 * lister les rayons FSQS existants (sélecteurs, dashboard, filtres)
 * — ne jamais réintroduire une liste fixe en dur ailleurs dans le
 * projet.
 * @returns {string[]}
 */
function getKnownRayons() {
  /** @type {Set<string>} */
  const known = new Set(RAYONS_BASE_SEED);

  Object.keys(DB.grilleCustom || {}).forEach(rayon => known.add(rayon));
  (DB.audits || []).forEach(audit => { if (audit.rayon) known.add(audit.rayon); });
  (DB.drafts || []).forEach(draft => { if (draft.rayon) known.add(draft.rayon); });

  /** @type {Set<string>} */
  const deleted = new Set(DB.deletedRayons || []);
  deleted.forEach(rayon => known.delete(rayon));

  /** @type {string[]} */
  const extras = [...known].filter(r => !RAYONS_BASE_SEED.includes(r)).sort((a, b) => a.localeCompare(b, 'fr'));
  /** @type {string[]} */
  const seedSurvivants = RAYONS_BASE_SEED.filter(r => !deleted.has(r));
  return [...seedSurvivants, ...extras];
}

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

  el('ray-grid').innerHTML = getKnownRayons().map(rayon =>
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

// ─────────────────────────────────────────────
// 4. GESTION DES RAYONS (création / renommage / suppression)
// ─────────────────────────────────────────────
// Le nom d'un rayon FSQS n'est jamais figé : il provient soit du
// document importé (voir import-grille.js), soit d'une action
// manuelle de l'utilisateur via les fonctions ci-dessous. Aucune
// liste fermée ne doit jamais réapparaître ailleurs dans le projet —
// toujours passer par getKnownRayons() / renameRayon() / createRayon()
// / deleteRayonEverywhere().

/**
 * Crée un rayon vide (sans aucun point personnalisé) afin qu'il
 * apparaisse immédiatement dans getKnownRayons() — utile pour
 * préparer un rayon avant la première saisie/import. Si le rayon
 * existe déjà (correspondance exacte), ne fait rien (pas de doublon,
 * pas d'écrasement).
 *
 * ⚠️ CORRIGÉ : retire aussi le rayon de DB.deletedRayons s'il y
 * figurait (voir deleteRayonEverywhere) — recréer volontairement un
 * rayon précédemment supprimé doit fonctionner normalement, y
 * compris pour un rayon du seed historique (RAYONS_BASE_SEED).
 * @param {string} rayonName
 * @returns {boolean} true si le rayon a été créé, false s'il existait déjà ou si le nom est vide.
 */
function createRayon(rayonName) {
  /** @type {string} */
  const trimmed = (rayonName || '').trim();
  if (!trimmed) return false;
  if (getKnownRayons().includes(trimmed)) return false;

  if (DB.deletedRayons) DB.deletedRayons = DB.deletedRayons.filter(r => r !== trimmed);
  if (!DB.grilleCustom) DB.grilleCustom = {};
  DB.grilleCustom[trimmed] = DB.grilleCustom[trimmed] || [];
  return true;
}

/**
 * Renomme un rayon FSQS PARTOUT où son nom apparaît dans la base :
 * DB.grilleCustom (clé du dictionnaire), DB.audits[].rayon,
 * DB.drafts[].rayon. Un rayon n'étant qu'une chaîne utilisée à la
 * fois comme clé de stockage et comme libellé affiché (contrairement
 * à QMZone côté Qualimètre, qui a un id distinct de son label), le
 * renommage doit migrer toutes les références existantes pour ne
 * jamais laisser de données orphelines sous l'ancien nom.
 *
 * Sans effet si oldName === newName, si newName est vide après trim,
 * ou si newName correspond déjà à un AUTRE rayon existant (fusion non
 * supportée par cette fonction — voir mergeRayons si ce besoin se
 * confirme).
 * @param {string} oldName - Nom actuel du rayon.
 * @param {string} newName - Nouveau nom souhaité.
 * @returns {{ok: boolean, error?: string}}
 */
function renameRayon(oldName, newName) {
  /** @type {string} */
  const trimmedNew = (newName || '').trim();
  if (!trimmedNew) return { ok: false, error: 'Le nouveau nom ne peut pas être vide.' };
  if (trimmedNew === oldName) return { ok: false, error: 'Le nouveau nom est identique à l\'actuel.' };
  if (getKnownRayons().some(r => r.toLowerCase() === trimmedNew.toLowerCase() && r !== oldName)) {
    return { ok: false, error: `Le rayon « ${trimmedNew} » existe déjà.` };
  }

  if (DB.grilleCustom && Object.prototype.hasOwnProperty.call(DB.grilleCustom, oldName)) {
    DB.grilleCustom[trimmedNew] = DB.grilleCustom[oldName];
    delete DB.grilleCustom[oldName];
  }
  (DB.audits || []).forEach(audit => { if (audit.rayon === oldName) audit.rayon = trimmedNew; });
  (DB.drafts || []).forEach(draft => { if (draft.rayon === oldName) draft.rayon = trimmedNew; });
  if (DB.deletedRayons) DB.deletedRayons = DB.deletedRayons.filter(r => r !== trimmedNew);

  return { ok: true };
}

/**
 * Supprime un rayon et TOUTES ses données associées : points
 * personnalisés (DB.grilleCustom), audits réalisés (DB.audits) et
 * leurs NC/actions liées (via _deleteStaleAudits-like cascade,
 * répliquée ici car ce n'est pas un nettoyage par ancienneté), ainsi
 * que les brouillons (DB.drafts). Action destructive et irréversible
 * — l'appelant DOIT obtenir une confirmation explicite de
 * l'utilisateur avant d'appeler cette fonction (aucune confirmation
 * n'est demandée ici, cette fonction est un utilitaire de bas niveau
 * réutilisable depuis plusieurs écrans).
 *
 * ⚠️ CORRIGÉ : supprime aussi explicitement côté Supabase (sbDeleteWhere)
 * chaque ligne concernée. Sans cela, un simple save() après cette
 * fonction ne fait qu'upserter les tableaux DB restants — une ligne
 * dont l'id a disparu de DB n'est jamais retirée côté serveur par un
 * upsert (voir sbUpsert, supabase.js : "merge-duplicates", jamais un
 * remplacement complet de table). Au rechargement suivant
 * (loadDB()), Supabase renvoie encore l'ancienne ligne → le rayon,
 * ses points, ses audits/NC/actions/brouillons réapparaissaient.
 * Les appels Supabase sont best-effort (erreurs réseau silencieuses,
 * comme le reste de la synchronisation — voir _pushToSupabase) ; la
 * suppression locale, elle, est immédiate et inconditionnelle.
 * ⚠️ CORRIGÉ (2e cause) : enregistre aussi le rayon dans
 * DB.deletedRayons, persisté côté Supabase (voir _pushToSupabase) et
 * consulté par getKnownRayons() pour EXCLURE ce rayon même s'il fait
 * partie de RAYONS_BASE_SEED (les 7 rayons historiques toujours
 * proposés par défaut). Sans cette exclusion, supprimer un rayon du
 * seed (ex : 'Boucherie') n'avait aucun effet visible : getKnownRayons()
 * le réinjectait systématiquement à l'appel suivant — c'était la
 * cause la plus probable d'un rayon supprimé qui "réapparaît",
 * indépendamment de tout problème de synchronisation réseau.
 * @param {string} rayonName
 * @returns {void}
 */
function deleteRayonEverywhere(rayonName) {
  if (!DB.deletedRayons) DB.deletedRayons = [];
  if (!DB.deletedRayons.includes(rayonName)) DB.deletedRayons.push(rayonName);

  if (DB.grilleCustom) delete DB.grilleCustom[rayonName];
  sbDeleteWhere('grille_custom', 'rayon', rayonName).catch(() => {});

  /** @type {string[]} */
  const removedAuditIds = DB.audits.filter(a => a.rayon === rayonName).map(a => a.id);
  DB.audits = DB.audits.filter(a => a.rayon !== rayonName);
  removedAuditIds.forEach(auditId => {
    /** @type {string[]} */
    const linkedNcIds = DB.ncs.filter(nc => nc.aid === auditId).map(nc => nc.id);
    DB.ncs = DB.ncs.filter(nc => nc.aid !== auditId);
    DB.actions = DB.actions.filter(action => !linkedNcIds.includes(action.ncId));

    linkedNcIds.forEach(ncId => sbDeleteWhere('actions', 'ncId', ncId).catch(() => {}));
    sbDeleteWhere('ncs', 'aid', auditId).catch(() => {});
    sbDeleteWhere('audits', 'id', auditId).catch(() => {});
  });

  /** @type {string[]} */
  const removedDraftIds = (DB.drafts || []).filter(d => d.rayon === rayonName).map(d => d.id);
  DB.drafts = (DB.drafts || []).filter(d => d.rayon !== rayonName);
  removedDraftIds.forEach(draftId => sbDeleteWhere('drafts', 'id', draftId).catch(() => {}));
}

// ─────────────────────────────────────────────
// 5. ZONES DE RAYON (sous-partie d'un rayon — onglets dans l'audit)
// ─────────────────────────────────────────────
// Une Zone (GrillePoint.zone) est une sous-partie d'un RAYON pour un
// classement plus facile (ex : rayon 'Boulangerie' → zone 'Lieu de
// stockage'). Elle devient l'onglet affiché dans la modale d'audit
// (voir buildAuditQuestions, audits.js). Contrairement à un rayon ou
// une zone Qualimètre, une zone de grille n'a PAS d'id distinct de
// son libellé — c'est une simple chaîne sur GrillePoint.zone, propre
// au rayon qui la contient : deux rayons peuvent avoir chacun une
// zone nommée "Stockage" sans aucun lien entre elles (renommer l'une
// n'affecte jamais l'autre, voir renameGrilleZone).
/** @type {string} */
const IMPORT_UNCLASSIFIED_ZONE_LABEL_GRILLE = 'Non classé';

/**
 * Liste les zones existantes pour un rayon donné, déduites de
 * DB.grilleCustom[rayon] (aucune liste fixe — remplace l'ancien
 * CTRL_SECTIONS figé à 3 valeurs, voir grille.js). Une zone vide
 * ('') est regroupée sous IMPORT_UNCLASSIFIED_ZONE_LABEL_GRILLE.
 * @param {string} rayon
 * @returns {string[]} Zones triées alphabétiquement, "Non classé" toujours en dernier si présent.
 */
/**
 * Liste les zones existantes pour un rayon donné, déduites des
 * points de ce rayon (aucune liste fixe — remplace l'ancien
 * CTRL_SECTIONS figé à 3 valeurs, voir grille.js). Une zone vide
 * ('') est regroupée sous IMPORT_UNCLASSIFIED_ZONE_LABEL_GRILLE.
 *
 * ⚠️ CHANGÉ : accepte un storeId optionnel pour lister les zones
 * d'une grille spécifique à un magasin (DB.grilleCustomByStore),
 * avec la même résolution magasin → grille commune que getGrille
 * (grille.js) — si storeId est fourni et que ce magasin a une
 * grille propre non vide pour ce rayon, ses zones sont retournées ;
 * sinon on retombe sur les zones de la grille commune
 * (DB.grilleCustom[rayon]).
 * @param {string} rayon
 * @param {string} [storeId] - Référence vers Magasin.id ; omis ou vide = grille commune uniquement.
 * @returns {string[]} Zones triées alphabétiquement, "Non classé" toujours en dernier si présent.
 */
function getZonesForRayon(rayon, storeId) {
  /** @type {GrillePoint[]} */
  let points = storeId ? (DB.grilleCustomByStore?.[storeId]?.[rayon] || []) : [];
  if (!points.length) points = DB.grilleCustom[rayon] || [];

  /** @type {Set<string>} */
  const zones = new Set();
  points.forEach(point => {
    /** @type {string} */
    const trimmedZone = point.zone ? point.zone.trim() : '';
    zones.add(trimmedZone || IMPORT_UNCLASSIFIED_ZONE_LABEL_GRILLE);
  });

  /** @type {boolean} */
  const hasUnclassified = zones.delete(IMPORT_UNCLASSIFIED_ZONE_LABEL_GRILLE) || zones.delete('');
  /** @type {string[]} */
  const sorted = [...zones].sort((a, b) => a.localeCompare(b, 'fr'));
  return hasUnclassified ? [...sorted, IMPORT_UNCLASSIFIED_ZONE_LABEL_GRILLE] : sorted;
}

/**
 * Renomme une zone à l'intérieur d'UN SEUL rayon (n'affecte jamais
 * les zones de même nom dans d'autres rayons — voir la note
 * d'en-tête de cette section). Migre tous les points de
 * DB.grilleCustom[rayon] dont la zone correspond.
 * @param {string} rayon
 * @param {string} oldZone
 * @param {string} newZone
 * @returns {{ok: boolean, error?: string}}
 */
/**
 * Renomme une zone à l'intérieur d'UN SEUL rayon, pour un magasin
 * donné (ou la grille commune) — n'affecte jamais les zones de même
 * nom dans un autre rayon, ni dans un autre magasin (voir la note
 * d'en-tête de cette section). Migre tous les points concernés.
 * @param {string} rayon
 * @param {string} oldZone
 * @param {string} newZone
 * @param {string} [storeId] - Magasin concerné (DB.grilleCustomByStore) ; absent/vide = grille commune (DB.grilleCustom).
 * @returns {{ok: boolean, error?: string}}
 */
function renameGrilleZone(rayon, oldZone, newZone, storeId) {
  /** @type {string} */
  const trimmed = (newZone || '').trim();
  if (!trimmed) return { ok: false, error: 'Le nouveau nom de zone ne peut pas être vide.' };
  if (trimmed === oldZone) return { ok: false, error: 'Le nouveau nom est identique à l\'actuel.' };
  if (getZonesForRayon(rayon, storeId).some(z => z.toLowerCase() === trimmed.toLowerCase() && z !== oldZone)) {
    return { ok: false, error: `La zone « ${trimmed} » existe déjà dans ce rayon.` };
  }

  /** @type {GrillePoint[]} */
  const points = storeId ? (DB.grilleCustomByStore?.[storeId]?.[rayon] || []) : (DB.grilleCustom[rayon] || []);
  points.forEach(point => {
    if ((point.zone || '') === oldZone) point.zone = trimmed;
  });

  return { ok: true };
}

/**
 * Réaffecte tous les points d'une zone vers IMPORT_UNCLASSIFIED_ZONE_LABEL_GRILLE
 * au lieu de les supprimer (suppression "douce" d'une zone — les
 * points restent disponibles, juste désorganisés). Action séparée de
 * deleteRayonEverywhere : ici on ne touche ni au rayon, ni aux
 * audits, ni à aucun autre rayon.
 * @param {string} rayon
 * @param {string} zone
 * @returns {void}
 */
function unclassifyGrilleZone(rayon, zone) {
  (DB.grilleCustom[rayon] || []).forEach(point => {
    if ((point.zone || '') === zone) point.zone = '';
  });
}

// ─────────────────────────────────────────────
// 6. ASSIGNATION RAYON ↔ MAGASIN
// ─────────────────────────────────────────────
// Un magasin ne peut auditer que les rayons qui lui ont été
// explicitement assignés (Magasin.rayons, voir magasins.js) — AUCUN
// fallback "tous les rayons" pour un magasin sans assignation, même
// créé avant l'introduction de ce champ. C'est un choix strict
// délibéré : l'admin assigne manuellement (un par un ou "tout
// assigner" en une fois), après quoi les utilisateurs liés à ce
// magasin peuvent auditer les rayons assignés.

/**
 * Liste les rayons assignés à un magasin (Magasin.rayons), triés
 * alphabétiquement. Tableau vide si le magasin n'existe pas ou n'a
 * aucun rayon assigné — jamais de fallback vers getKnownRayons().
 * @param {string} storeId - Référence vers Magasin.id.
 * @returns {string[]}
 */
function getRayonsForMagasin(storeId) {
  /** @type {Magasin | undefined} */
  const store = DB.magasins.find(m => m.id === storeId);
  if (!store || !store.rayons) return [];
  return [...store.rayons].sort((a, b) => a.localeCompare(b, 'fr'));
}

/**
 * Remplace intégralement la liste des rayons assignés à un magasin
 * (pas un ajout incrémental — la liste fournie devient la nouvelle
 * liste complète). Ne filtre pas sur getKnownRayons() : un rayon
 * assigné qui serait ensuite supprimé (deleteRayonEverywhere) reste
 * dans Magasin.rayons jusqu'à réaffectation manuelle, exactement
 * comme Magasin.enseigne pour une enseigne supprimée (voir
 * deleteEnseigne, magasins.js) — cohérence délibérée entre les deux
 * mécanismes d'assignation "douce".
 * @param {string} storeId
 * @param {string[]} rayons
 * @returns {void}
 */
function setMagasinRayons(storeId, rayons) {
  /** @type {Magasin | undefined} */
  const store = DB.magasins.find(m => m.id === storeId);
  if (!store) return;
  store.rayons = [...new Set(rayons)];
}

/**
 * Coche/décoche un seul rayon pour un magasin, sans toucher aux
 * autres rayons déjà assignés.
 * @param {string} storeId
 * @param {string} rayon
 * @param {boolean} isAssigned
 * @returns {void}
 */
function toggleMagasinRayon(storeId, rayon, isAssigned) {
  /** @type {Magasin | undefined} */
  const store = DB.magasins.find(m => m.id === storeId);
  if (!store) return;
  if (!store.rayons) store.rayons = [];
  if (isAssigned) {
    if (!store.rayons.includes(rayon)) store.rayons.push(rayon);
  } else {
    store.rayons = store.rayons.filter(r => r !== rayon);
  }
}
