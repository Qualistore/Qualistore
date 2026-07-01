// ══════════════════════════════════════════════════════════════
// STORAGE — Moteur de données Supabase + cache localStorage
// Responsabilité : charger, persister et synchroniser DB.
// Dépend de : config.js (STORAGE_KEY), services/supabase.js
// ══════════════════════════════════════════════════════════════

// ─────────────────────────────────────────────
// 0. TYPEDEFS JSDoc (pour inférence VSCode / TypeScript)
//    ⚠️ Ces définitions sont déduites de l'USAGE des objets dans
//    ce fichier uniquement. Les propriétés non accédées ici ne
//    sont pas garanties d'être exhaustives (voir niveaux de
//    confiance dans le résumé fourni au développeur).
// ─────────────────────────────────────────────

/**
 * Droits d'accès d'un utilisateur, sous forme de table de permissions
 * par module fonctionnel. Valeur observée : 1 (autorisé). La valeur 0
 * ou l'absence de clé pour signifier "non autorisé" n'est pas
 * confirmée dans ce fichier — TODO TYPE à vérifier ailleurs dans le projet.
 * @typedef {Object} UserPerms
 * @property {number} [aud-r]  - Lecture des audits.
 * @property {number} [aud-w]  - Écriture des audits.
 * @property {number} [nc]     - Gestion des non-conformités.
 * @property {number} [ac]     - Gestion des actions correctives.
 * @property {number} [mag]    - Gestion des magasins.
 * @property {number} [rap]    - Accès aux rapports.
 * @property {number} [grille] - Gestion des grilles d'audit.
 * @property {number} [usr]   - Gestion des utilisateurs.
 */

/**
 * Utilisateur applicatif (compte admin ou collaborateur).
 * Structure déduite de l'objet admin par défaut dans _buildDefaultDB().
 * @typedef {Object} User
 * @property {string} id
 * @property {string} nom
 * @property {string} login
 * @property {string} pwd - Mot de passe encodé en base64 (btoa). TODO TYPE : à confirmer que ce n'est pas un hash réel ailleurs dans le projet.
 * @property {string} role - Valeur observée : 'admin'. Autres rôles possibles non confirmés ici.
 * @property {string} statut - Valeur observée : 'actif'. Autres valeurs non confirmées ici.
 * @property {string[]} magasins - Tableau d'IDs de magasins assignés (Magasin.id). CONFIRMÉ par users.js (saveUser, _buildUserStoresList) ; toujours vide pour le rôle 'admin'.
 * @property {UserPerms} perms
 */

/**
 * Magasin (point de vente). Aucune propriété de cet objet n'est lue
 * ou écrite dans ce fichier (le tableau DB.magasins n'est manipulé
 * que comme un tout, jamais déstructuré). Structure à confirmer par
 * inspection runtime ou dans un autre fichier du projet (ex : ui/magasins.js).
 * @typedef {Object} Magasin
 * @property {string} id - TODO TYPE : déduit par convention (cohérence avec les autres entités), non observé directement ici.
 */

/**
 * Audit FSQS. Seules les propriétés .id et .date sont accédées dans
 * ce fichier (via _findStaleAudits et la sérialisation Supabase).
 * D'autres propriétés métier existent probablement (magasinId, score,
 * rayon, etc.) mais ne sont pas observables depuis storage.js.
 * @typedef {Object} Audit
 * @property {string} id
 * @property {string} date - Date au format comparable lexicographiquement à une chaîne ISO (ex : 'YYYY-MM-DD'), vu l'usage avec des comparaisons >= / < sur cutoffString.
 */

/**
 * Non-conformité (NC) liée à un audit.
 * @typedef {Object} NC
 * @property {string} id
 * @property {string} aid - Référence vers Audit.id (clé étrangère).
 * @property {string} statut - Valeur observée : 'Clôturée'. Autres statuts possibles non confirmés ici (ex : 'Ouverte', 'En cours').
 */

/**
 * Action corrective liée à une NC.
 * @typedef {Object} Action
 * @property {string} ncId - Référence vers NC.id (clé étrangère).
 */

/**
 * Alerte applicative. Jamais déstructurée individuellement dans ce
 * fichier (uniquement manipulée comme tableau DB.alertes) — structure
 * réelle inconnue depuis ce fichier seul.
 * @typedef {unknown} Alerte
 */

/**
 * Brouillon d'audit en cours de saisie. Jamais déstructuré
 * individuellement dans ce fichier — structure réelle inconnue
 * depuis ce fichier seul.
 * @typedef {unknown} Draft
 */

/**
 * Audit "Qualimètre" (variante d'audit distincte des Audit FSQS).
 * Seule la propriété .id et .date sont accédées dans ce fichier.
 * @typedef {Object} QualAudit
 * @property {string} id
 * @property {string} date - Comparée lexicographiquement (probable format 'YYYY-MM-DD').
 */

/**
 * Ligne brute telle que retournée par sbSelect() / stockée via
 * sbUpsert(). Les noms de colonnes varient selon la table interrogée
 * (ex : { rayon, data } pour grille_custom, { mid, data } pour
 * qualimetre_custom). Représentée ici comme un dictionnaire ouvert
 * car la forme exacte dépend de la table — TODO TYPE : à affiner si
 * services/supabase.js est disponible.
 * @typedef {Object<string, *>} SupabaseRow
 */

/**
 * Point de contrôle de grille (FSQS ou Qualimètre). Voir
 * config.js/grille.js pour la définition canonique complète.
 * @typedef {Object} GrillePoint
 * @property {string} id
 * @property {string} q
 * @property {string} [prec]
 * @property {number} p
 * @property {'Critique'|'Majeure'|'Mineure'} c
 */

/**
 * Dictionnaire de configuration de grille d'audit FSQS personnalisée,
 * indexé par nom d'enseigne (ex : 'Carrefour') puis par nom de rayon
 * (ex : 'Boucherie'). ⚠️ CHANGÉ : était indexé directement par rayon
 * (Record<rayon, GrillePoint[]>), partagé par toute la base — devenu
 * Record<enseigne, Record<rayon, GrillePoint[]>>, chaque enseigne
 * ayant sa propre grille commune indépendante. Un magasin sans
 * enseigne renseignée n'a accès à aucune grille commune (voir
 * getGrille, grille.js) — uniquement à sa grille personnalisée
 * propre si elle existe (DB.grilleCustomByStore).
 * @typedef {Record<string, Record<string, GrillePoint[]>>} GrilleCustomMap
 */

/**
 * Dictionnaire de configuration "qualimètre" personnalisée par
 * magasin. CONFIRMÉ par grille-qualimetre.js (_upsertQualimetrePoint,
 * getQualimetrePoints) : structure à 2 niveaux — indexé par
 * Magasin.id, puis par QMZone.id, chaque valeur finale étant un
 * tableau de GrillePoint. Distinct de qualimetreGlobal (1 niveau).
 * @typedef {Record<string, Record<string, GrillePoint[]>>} QualimetreCustomMap
 */

/**
 * Dictionnaire de configuration "qualimètre" commune, indexé par nom
 * d'enseigne PUIS par QMZone.id. ⚠️ CHANGÉ : était indexé directement
 * par QMZone.id (Record<zoneId, GrillePoint[]>), une seule grille
 * partagée par toute la base — devenu Record<enseigne, Record<zoneId,
 * GrillePoint[]>>, chaque enseigne ayant sa propre grille commune
 * indépendante (même principe que GrilleCustomMap, FSQS). Un magasin
 * sans enseigne renseignée n'a accès à aucune grille commune (voir
 * getQualimetrePoints, grille-qualimetre.js) — uniquement à sa grille
 * personnalisée propre si elle existe (DB.qualimetreCustom). Les
 * points d'un magasin personnalisé s'AJOUTENT à ceux de la grille
 * commune de son enseigne (fusion, jamais un remplacement — même
 * principe que getGrille, grille.js).
 *
 * ⚠️ Toute grille commune DOIT être rattachée à une enseigne réelle,
 * sans exception : l'ancien format plat (sans enseigne) est
 * intégralement supprimé à la migration (voir
 * _migrateQualimetreGlobalToEnseigneScoped) et l'import Qualimètre
 * refuse de s'exécuter tant qu'aucune enseigne n'est sélectionnée
 * (voir openGqImportModal, grille-qualimetre.js).
 * @typedef {Record<string, Record<string, GrillePoint[]>>} QualimetreGlobalMap
 */

/**
 * Dictionnaire de renommages manuels de zones Qualimètre, persistant,
 * indexé par QMZone.id — override du label par défaut (QM_ZONES,
 * config.js) appliqué via _resolveZoneLabel (grille-qualimetre.js).
 * QM_ZONES étant une constante figée en mémoire, ce dictionnaire est
 * l'unique mécanisme de renommage persistant d'une zone — voir
 * renameQmZone. Stocké côté Supabase comme ligne réservée
 * '__zone_labels__' de la table qualimetre_custom (voir
 * _parseQualimetreZoneLabels), sur le même principe que '__global__'
 * pour QualimetreGlobalMap.
 * @typedef {Record<string, string>} QualimetreZoneLabelsMap
 */

/**
 * Structure racine de la base de données applicative, maintenue en
 * mémoire et synchronisée avec localStorage + Supabase.
 * @typedef {Object} DB
 * @property {User[]} users
 * @property {Magasin[]} magasins
 * @property {Audit[]} audits
 * @property {NC[]} ncs
 * @property {Action[]} actions
 * @property {Alerte[]} alertes
 * @property {Draft[]} drafts
 * @property {GrilleCustomMap} grilleCustom
 * @property {QualimetreCustomMap} qualimetreCustom
 * @property {QualimetreGlobalMap} qualimetreGlobal - Données globales qualimètre (équivalent de la ligne '__global__' isolée côté Supabase).
 * @property {QualimetreZoneLabelsMap} qualimetreZoneLabels - Renommages manuels de zones (équivalent de la ligne '__zone_labels__' isolée côté Supabase).
 * @property {QualAudit[]} qualAudits
 */

// ─────────────────────────────────────────────
// 1. CONSTANTES
// ─────────────────────────────────────────────

/**
 * Intervalle de polling Supabase en millisecondes.
 * @type {number}
 */
const SYNC_POLL_INTERVAL_MS = 5_000;

/**
 * Durée de rétention des audits en jours avant nettoyage automatique.
 * @type {number}
 */
const DATA_RETENTION_DAYS = 180;

// ─────────────────────────────────────────────
// 2. ÉTAT GLOBAL
// ─────────────────────────────────────────────

/**
 * Base de données applicative en mémoire.
 * @type {DB}
 */
let DB = _buildDefaultDB();

/**
 * Utilisateur connecté (null si non authentifié).
 * @type {User | null}
 */
let CU = null;

/**
 * Indique si des modifications locales n'ont pas encore été
 * synchronisées avec Supabase (ex : perte réseau).
 * @type {boolean}
 */
let _pendingSyncToSupabase = false;

// Restaurer l'utilisateur connecté depuis le cache localStorage au chargement
try {
  /** @type {string | null} */
  const cachedUser = localStorage.getItem('fsqs_cu');
  if (cachedUser) CU = JSON.parse(cachedUser);
} catch (_) {
  // Cache corrompu — l'utilisateur devra se reconnecter
}

// ─────────────────────────────────────────────
// 3. STRUCTURE PAR DÉFAUT DE LA BASE
// ─────────────────────────────────────────────

/**
 * Construit une structure DB par défaut, avec un unique compte
 * administrateur et toutes les collections vides.
 * @returns {DB}
 */
function _buildDefaultDB() {
  return {
    users: [{
      id: 'admin1', nom: 'Administrateur', login: 'admin',
      pwd: btoa('admin'), role: 'admin', statut: 'actif',
      magasins: [],
      perms: { 'aud-r': 1, 'aud-w': 1, 'nc': 1, 'ac': 1, 'mag': 1, 'rap': 1, 'grille': 1, 'usr': 1 },
    }],
    magasins:          [],
    enseignes:         [],
    audits:            [],
    ncs:               [],
    actions:           [],
    alertes:           [],
    drafts:            [],
    grilleCustom:      {},
    grilleCustomByStore: {},
    deletedRayons:     [],
    manualRayons:      [],
    magasinRayons:     {},
    qualimetreCustom:  {},
    qualimetreGlobal:  {},
    qualimetreZoneLabels: {},
    qualAudits:        [],
  };
}

// ─────────────────────────────────────────────
// 4. PERSISTANCE LOCALE (localStorage)
// ─────────────────────────────────────────────

/**
 * Sérialise DB et la persiste dans localStorage sous la clé STORAGE_KEY.
 * Échoue silencieusement (avec un warning console) si le quota est
 * dépassé ou si localStorage est inaccessible.
 * @returns {void}
 */
function _saveToLocalStorage() {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(DB));
  } catch (error) {
    console.warn('localStorage plein ou inaccessible :', error.message);
  }
}

/**
 * Relit la DB depuis le cache localStorage.
 * @returns {DB | null} La DB désérialisée, ou null si absente / corrompue.
 */
function _loadFromLocalStorage() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? JSON.parse(raw) : null;
  } catch (_) {
    return null;
  }
}

// ─────────────────────────────────────────────
// 5. CHARGEMENT INITIAL DEPUIS SUPABASE
// ─────────────────────────────────────────────

/**
 * Charge la base de données depuis Supabase.
 * Utilise le cache localStorage en fallback si Supabase est inaccessible.
 */
/**
 * Charge la base de données depuis Supabase.
 * Utilise le cache localStorage en fallback si Supabase est inaccessible.
 * @returns {Promise<void>}
 */
async function loadDB() {
  /** @type {DB | null} */
  const localCache = _loadFromLocalStorage();
  if (localCache) DB = localCache;
  // Migration non destructive — sûre à appeler même si déjà migrée.
  if (DB.qualimetreGlobal) DB.qualimetreGlobal = _migrateQualimetreGlobalToEnseigneScoped(DB.qualimetreGlobal);

  try {
    /** @type {[User[], Magasin[], Audit[], NC[], Action[], Alerte[], SupabaseRow[], QualAudit[], SupabaseRow[], Draft[]]} */
    const [
      users, magasins, audits, ncs, actions, alertes,
      grilleRows, qualAudits, qualRows, drafts,
    ] = await Promise.all([
      sbSelect('users'),    sbSelect('magasins'),   sbSelect('audits'),
      sbSelect('ncs'),      sbSelect('actions'),    sbSelect('alertes'),
      sbSelect('grille_custom'), sbSelect('qual_audits'),
      sbSelect('qualimetre_custom'), sbSelect('drafts'),
    ]);

    DB = {
      users:    users    || [],
      magasins: magasins || [],
      audits:   audits   || [],
      ncs:      ncs      || [],
      actions:  actions  || [],
      alertes:  alertes  || [],
      drafts:   drafts   || [],
      grilleCustom:     _parseGrilleCustom(grilleRows),
      grilleCustomByStore: _parseGrilleCustomByStore(grilleRows),
      deletedRayons:    _parseDeletedRayons(grilleRows),
      manualRayons:     _parseManualRayons(grilleRows),
      magasinRayons:    _parseMagasinRayons(grilleRows),
      enseignes:        _parseEnseignes(grilleRows),
      qualimetreCustom: _parseQualimetreCustom(qualRows),
      qualimetreGlobal: _migrateQualimetreGlobalToEnseigneScoped(_parseQualimetreGlobal(qualRows)),
      qualimetreZoneLabels: _parseQualimetreZoneLabels(qualRows),
      qualAudits: qualAudits || [],
    };

    // Garantir qu'il existe toujours au moins un admin
    if (!DB.users.length) DB.users = _buildDefaultDB().users;

    _saveToLocalStorage();
    _pendingSyncToSupabase = false;
    console.log('✅ Supabase chargé');

    _cleanStaleData();

    // Rafraîchir l'utilisateur connecté depuis la DB à jour
    if (CU) {
      /** @type {User | undefined} */
      const freshUser = DB.users.find(u => u.id === CU.id);
      CU = freshUser || null;
    }
  } catch (error) {
    console.warn('⚠️ Supabase inaccessible — mode hors ligne :', error.message);
    _pendingSyncToSupabase = true;
  }
}

// ─────────────────────────────────────────────
// 6. PARSEURS DE DONNÉES SUPABASE
// ─────────────────────────────────────────────

/**
 * Transforme les lignes brutes de la table `grille_custom` en
 * dictionnaire à deux niveaux enseigne → rayon (voir le typedef
 * GrilleCustomMap). Lit les lignes préfixées '__common__{enseigne}__{rayon}'
 * (voir _pushToSupabase) ; ignore '__deleted_rayons__', '__enseignes__'
 * et les lignes préfixées '__store__' (DB.grilleCustomByStore, voir
 * _parseGrilleCustomByStore) — aucune des trois n'est une grille
 * commune réelle.
 * @param {SupabaseRow[] | null | undefined} rows
 * @returns {GrilleCustomMap}
 */
function _parseGrilleCustom(rows) {
  /** @type {GrilleCustomMap} */
  const result = {};
  (rows || [])
    .filter(row => row.rayon.startsWith('__common__'))
    .forEach(row => {
      // Format : '__common__{enseigne}__{rayon}' — découpe sur les
      // deux premières occurrences du séparateur seulement (un nom
      // d'enseigne ou de rayon pourrait en théorie contenir '__').
      /** @type {string[]} */
      const parts = row.rayon.split('__');
      // parts[0]='', parts[1]='common', parts[2]=enseigne, reste=rayon
      /** @type {string} */
      const enseigne = parts[2];
      /** @type {string} */
      const rayon = parts.slice(3).join('__');
      if (!enseigne || !rayon) return;
      if (!result[enseigne]) result[enseigne] = {};
      result[enseigne][rayon] = row.data;
    });
  return result;
}

/**
 * Extrait la liste des enseignes (ligne réservée '__enseignes__' de
 * la table `grille_custom`, voir createEnseigne/renameEnseigne/
 * deleteEnseigne, magasins.js) — réutilise cette table existante
 * plutôt que d'introduire une nouvelle table Supabase (la création
 * de table n'est pas possible via l'API REST utilisée par ce
 * fichier), sur le même principe que les autres lignes réservées.
 * @param {SupabaseRow[] | null | undefined} rows
 * @returns {string[]}
 */
function _parseEnseignes(rows) {
  /** @type {SupabaseRow | undefined} */
  const enseignesRow = (rows || []).find(row => row.rayon === '__enseignes__');
  return enseignesRow && Array.isArray(enseignesRow.data) ? enseignesRow.data : [];
}

/**
 * Extrait les grilles spécifiques à un magasin (DB.grilleCustomByStore)
 * des lignes brutes de la table `grille_custom` — lignes préfixées
 * '__store__{storeId}__{rayon}' (voir _pushToSupabase). Réutilise
 * cette table existante plutôt que d'introduire une nouvelle table
 * Supabase, sur le même principe que les autres lignes réservées de
 * ce fichier.
 * @param {SupabaseRow[] | null | undefined} rows
 * @returns {Record<string, GrilleCustomMap>}
 */
function _parseGrilleCustomByStore(rows) {
  /** @type {Record<string, GrilleCustomMap>} */
  const result = {};
  (rows || [])
    .filter(row => row.rayon.startsWith('__store__'))
    .forEach(row => {
      // Format : '__store__{storeId}__{rayon}' — storeId et rayon
      // peuvent eux-mêmes contenir '__' en théorie (peu probable en
      // pratique pour un nom de magasin/rayon), donc on découpe sur
      // les deux premières occurrences du séparateur seulement.
      /** @type {string[]} */
      const parts = row.rayon.split('__');
      // parts[0] = '', parts[1] = 'store', parts[2] = storeId, reste = rayon
      /** @type {string} */
      const storeId = parts[2];
      /** @type {string} */
      const rayon = parts.slice(3).join('__');
      if (!storeId || !rayon) return;
      if (!result[storeId]) result[storeId] = {};
      result[storeId][rayon] = row.data;
    });
  return result;
}

/**
 * Extrait la liste des rayons explicitement supprimés (ligne
 * réservée '__deleted_rayons__' de la table `grille_custom`, voir
 * deleteRayonEverywhere/getKnownRayons, rayons.js) — réutilise cette
 * table existante plutôt que d'introduire une nouvelle table
 * Supabase, sur le même principe que '__global__'/'__zone_labels__'
 * pour qualimetre_custom.
 * @param {SupabaseRow[] | null | undefined} rows
 * @returns {string[]}
 */
function _parseDeletedRayons(rows) {
  /** @type {SupabaseRow | undefined} */
  const deletedRow = (rows || []).find(row => row.rayon === '__deleted_rayons__');
  return deletedRow && Array.isArray(deletedRow.data) ? deletedRow.data : [];
}

/**
 * Extrait la liste des rayons créés manuellement sans grille
 * associée encore (ligne réservée '__manual_rayons__' de la table
 * `grille_custom`, voir createRayon, rayons.js).
 * @param {SupabaseRow[] | null | undefined} rows
 * @returns {string[]}
 */
function _parseManualRayons(rows) {
  /** @type {SupabaseRow | undefined} */
  const manualRow = (rows || []).find(row => row.rayon === '__manual_rayons__');
  return manualRow && Array.isArray(manualRow.data) ? manualRow.data : [];
}

/**
 * Extrait l'assignation rayon ↔ magasin (ligne réservée
 * '__magasin_rayons__' de la table `grille_custom`, voir
 * getRayonsForMagasin/setMagasinRayons/toggleMagasinRayon, rayons.js).
 *
 * ⚠️ CORRIGÉ : cette assignation a longtemps été écrite sur
 * Magasin.rayons (donc poussée vers la table `magasins`), qui n'a
 * AUCUNE colonne `rayons` (seules id/nom/ville/enseigne/adr/statut/did
 * existent côté Supabase) — l'assignation était donc silencieusement
 * perdue à chaque rechargement. Réutilise la table `grille_custom`
 * existante, sur le même principe que '__enseignes__'/
 * '__deleted_rayons__'/'__manual_rayons__' (une seule ligne, le
 * dictionnaire complet Record<storeId, string[]> en data — pas une
 * ligne par magasin, pour rester simple).
 * @param {SupabaseRow[] | null | undefined} rows
 * @returns {Record<string, string[]>}
 */
function _parseMagasinRayons(rows) {
  /** @type {SupabaseRow | undefined} */
  const row = (rows || []).find(r => r.rayon === '__magasin_rayons__');
  return row && row.data && typeof row.data === 'object' ? row.data : {};
}

/**
 * Transforme les lignes brutes de la table `qualimetre_custom` en
 * dictionnaire indexé par identifiant de magasin (mid), en excluant
 * les lignes réservées '__global__' (DB.qualimetreGlobal, voir
 * _parseQualimetreGlobal) et '__zone_labels__' (DB.qualimetreZoneLabels,
 * voir _parseQualimetreZoneLabels) — aucune des deux n'est un magasin
 * réel.
 * @param {SupabaseRow[] | null | undefined} rows
 * @returns {QualimetreCustomMap}
 */
function _parseQualimetreCustom(rows) {
  const result = {};
  (rows || [])
    .filter(row => row.mid !== '__global__' && row.mid !== '__zone_labels__')
    .forEach(row => { result[row.mid] = row.data; });
  return result;
}

/**
 * Extrait la donnée globale qualimètre (ligne '__global__') des
 * lignes brutes de la table `qualimetre_custom`.
 * @param {SupabaseRow[] | null | undefined} rows
 * @returns {Record<string, unknown>}
 */
function _parseQualimetreGlobal(rows) {
  const globalRow = (rows || []).find(row => row.mid === '__global__');
  return globalRow ? globalRow.data : {};
}

/**
 * Purge DB.qualimetreGlobal de l'ancien format plat
 * (Record<zoneId, GrillePoint[]>, une seule grille partagée par toute
 * la base, sans notion d'enseigne) au profit du nouveau format par
 * enseigne (Record<enseigne, Record<zoneId, GrillePoint[]>>) — voir
 * le typedef QualimetreGlobalMap.
 *
 * ⚠️ SUPPRESSION DÉLIBÉRÉE ET ASSUMÉE (demande explicite) : contrairement
 * à une migration classique, les points de l'ancien format ne sont PAS
 * conservés — toute grille commune Qualimètre doit désormais être
 * rattachée à une enseigne réelle, sans exception ni case "orpheline".
 * Un magasin sans enseigne n'a accès à aucune grille commune, et
 * l'import Qualimètre est bloqué tant qu'aucune enseigne n'est
 * sélectionnée (voir openGqImportModal, grille-qualimetre.js).
 *
 * Idempotente et sûre à appeler à chaque chargement : sans effet si
 * `raw` est vide, ou déjà au nouveau format (détecté par la forme de
 * sa première valeur — un tableau signale l'ancien format plat, un
 * objet le nouveau format déjà migré).
 * @param {Record<string, unknown> | null | undefined} raw - Valeur brute de qualimetreGlobal, ancien ou nouveau format.
 * @returns {QualimetreGlobalMap}
 */
function _migrateQualimetreGlobalToEnseigneScoped(raw) {
  if (!raw || !Object.keys(raw).length) return raw || {};

  /** @type {unknown} */
  const firstValue = Object.values(raw)[0];
  /** @type {boolean} */
  const isOldFlatFormat = Array.isArray(firstValue);
  if (!isOldFlatFormat) return raw;

  console.warn('⚠️ Ancien format qualimetreGlobal (sans enseigne) détecté et supprimé — toute grille commune Qualimètre doit désormais être rattachée à une enseigne.');
  return {};
}

/**
 * Extrait les renommages manuels de zones Qualimètre (ligne réservée
 * '__zone_labels__', voir renameQmZone/_resolveZoneLabel,
 * grille-qualimetre.js) des lignes brutes de la table
 * `qualimetre_custom`. Réutilise cette table existante plutôt que
 * d'introduire une nouvelle table Supabase, sur le même principe que
 * '__global__' pour qualimetreGlobal — un override de libellé par
 * zoneId n'a pas besoin de son propre stockage dédié.
 * @param {SupabaseRow[] | null | undefined} rows
 * @returns {Record<string, string>}
 */
function _parseQualimetreZoneLabels(rows) {
  const labelsRow = (rows || []).find(row => row.mid === '__zone_labels__');
  return labelsRow ? labelsRow.data : {};
}

// ─────────────────────────────────────────────
// 7. SAUVEGARDE (localStorage + Supabase)
// ─────────────────────────────────────────────

/**
 * Sauvegarde les données.
 * @param {string[]} [tables] - Tables spécifiques à pousser vers Supabase.
 *   Si omis, toutes les tables sont synchronisées.
 * @returns {void}
 */
function save(tables) {
  _saveToLocalStorage();
  _pushToSupabase(tables);
}

/**
 * Génère un identifiant unique (base36 timestamp + aléatoire).
 * @returns {string}
 */
function uid() {
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
}

// ─────────────────────────────────────────────
// 8. SYNCHRONISATION SUPABASE
// ─────────────────────────────────────────────

/**
 * Pousse les tables modifiées de DB vers Supabase via sbUpsert.
 * Si `tables` est omis, toutes les tables connues sont synchronisées.
 * En cas d'échec (réseau, etc.), positionne _pendingSyncToSupabase
 * à true pour permettre une resynchronisation ultérieure.
 * @param {string[]} [tables] - Sous-ensemble de clés de DB à synchroniser
 *   (ex : 'users', 'audits', 'grilleCustom', 'qualimetreCustom'...).
 * @returns {Promise<void>}
 */
async function _pushToSupabase(tables) {
  const pushAll = !tables;

  try {
    /** @type {Promise<*>[]} */
    const operations = [];

    if (pushAll || tables.includes('users'))      operations.push(sbUpsert('users',      DB.users));
    if (pushAll || tables.includes('magasins'))   operations.push(sbUpsert('magasins',   DB.magasins));
    if (pushAll || tables.includes('audits'))     operations.push(sbUpsert('audits',     DB.audits));
    if (pushAll || tables.includes('ncs'))        operations.push(sbUpsert('ncs',        DB.ncs));
    if (pushAll || tables.includes('actions'))    operations.push(sbUpsert('actions',    DB.actions));
    if (pushAll || tables.includes('alertes'))    operations.push(sbUpsert('alertes',    DB.alertes));
    if (pushAll || tables.includes('qualAudits')) operations.push(sbUpsert('qual_audits', DB.qualAudits));
    if (pushAll || tables.includes('drafts'))     operations.push(sbUpsert('drafts',     DB.drafts));

    if (pushAll || tables.includes('grilleCustom') || tables.includes('deletedRayons') || tables.includes('grilleCustomByStore') || tables.includes('enseignes') || tables.includes('manualRayons') || tables.includes('magasinRayons')) {
      /** @type {SupabaseRow[]} */
      const rows = [];
      // Grilles communes par enseigne (DB.grilleCustom, désormais à
      // deux niveaux enseigne → rayon, voir le typedef GrilleCustomMap)
      // — id préfixé '__common__{enseigne}__{rayon}', voir _parseGrilleCustom.
      Object.entries(DB.grilleCustom).forEach(([enseigne, rayons]) => {
        Object.entries(rayons).forEach(([rayon, data]) => {
          rows.push({ id: `__common__${enseigne}__${rayon}`, rayon: `__common__${enseigne}__${rayon}`, data });
        });
      });
      if (DB.deletedRayons && DB.deletedRayons.length) {
        rows.push({ id: '__deleted_rayons__', rayon: '__deleted_rayons__', data: DB.deletedRayons });
      }
      if (DB.manualRayons && DB.manualRayons.length) {
        rows.push({ id: '__manual_rayons__', rayon: '__manual_rayons__', data: DB.manualRayons });
      }
      // ⚠️ CORRIGÉ : la ligne '__enseignes__' doit être réécrite même
      // quand DB.enseignes devient VIDE après une suppression (ex :
      // suppression de la dernière enseigne restante) — sinon
      // sbUpsert ne reçoit jamais cette ligne dans ce cas précis, et
      // l'ancienne valeur (avec l'enseigne supprimée encore dedans)
      // reste intacte côté Supabase indéfiniment. On l'écrit donc dès
      // que cette table fait partie du scope demandé (pushAll ou
      // 'enseignes' explicitement listée), peu importe sa longueur.
      if (pushAll || tables.includes('enseignes')) {
        rows.push({ id: '__enseignes__', rayon: '__enseignes__', data: DB.enseignes || [] });
      }
      // Assignation rayon ↔ magasin (DB.magasinRayons) — voir
      // _parseMagasinRayons pour l'explication complète de pourquoi
      // ce n'est pas une colonne sur la table `magasins`. Toujours
      // réécrite (même règle que '__enseignes__' ci-dessus) : un
      // dictionnaire qui retombe à {} après une désassignation
      // complète doit pouvoir être propagé, pas seulement quand il
      // contient encore des données.
      if (pushAll || tables.includes('magasinRayons')) {
        rows.push({ id: '__magasin_rayons__', rayon: '__magasin_rayons__', data: DB.magasinRayons || {} });
      }
      // Grilles spécifiques à un magasin (DB.grilleCustomByStore) —
      // réutilise la même table grille_custom, une ligne par
      // (magasin, rayon), id préfixé '__store__{storeId}__{rayon}'
      // pour ne jamais collisionner avec les autres formats de ligne
      // de cette table — voir _parseGrilleCustomByStore.
      Object.entries(DB.grilleCustomByStore || {}).forEach(([storeId, rayons]) => {
        Object.entries(rayons).forEach(([rayon, data]) => {
          rows.push({ id: `__store__${storeId}__${rayon}`, rayon: `__store__${storeId}__${rayon}`, data });
        });
      });
      if (rows.length) operations.push(sbUpsert('grille_custom', rows));
    }

    if (pushAll || tables.includes('qualimetreCustom') || tables.includes('qualimetreGlobal') || tables.includes('qualimetreZoneLabels')) {
      /** @type {SupabaseRow[]} */
      const rows = Object.entries(DB.qualimetreCustom).map(([mid, data]) => ({ id: mid, mid, data }));
      if (DB.qualimetreGlobal && Object.keys(DB.qualimetreGlobal).length) {
        rows.push({ id: '__global__', mid: '__global__', data: DB.qualimetreGlobal });
      }
      if (DB.qualimetreZoneLabels && Object.keys(DB.qualimetreZoneLabels).length) {
        rows.push({ id: '__zone_labels__', mid: '__zone_labels__', data: DB.qualimetreZoneLabels });
      }
      if (rows.length) operations.push(sbUpsert('qualimetre_custom', rows));
    }

    await Promise.all(operations);
    _pendingSyncToSupabase = false;
    console.log('✅ Sync Supabase OK');
  } catch (error) {
    console.warn('⚠️ Sync Supabase échouée :', error.message);
    _pendingSyncToSupabase = true;
  }
}

// ─────────────────────────────────────────────
// 9. NETTOYAGE AUTOMATIQUE DES DONNÉES ANCIENNES
// ─────────────────────────────────────────────

/**
 * Identifie et supprime (DB + Supabase) les audits FSQS et audits
 * Qualimètre dont la date dépasse DATA_RETENTION_DAYS, en respectant
 * la règle métier de _findStaleAudits (NC liées toutes clôturées
 * ou absentes).
 * @returns {Promise<void>}
 */
async function _cleanStaleData() {
  const cutoffDate = new Date();
  cutoffDate.setDate(cutoffDate.getDate() - DATA_RETENTION_DAYS);
  /** @type {string} Date de coupure au format 'YYYY-MM-DD'. */
  const cutoffString = cutoffDate.toISOString().split('T')[0];

  /** @type {Audit[]} */
  const staleAudits = _findStaleAudits(cutoffString);
  /** @type {QualAudit[]} */
  const staleQualAudits = _findStaleQualAudits(cutoffString);

  if (!staleAudits.length && !staleQualAudits.length) return;

  await _deleteStaleAudits(staleAudits);
  await _deleteStaleQualAudits(staleQualAudits);

  _saveToLocalStorage();
  console.log(`🗑️ Nettoyage : ${staleAudits.length} audit(s) FSQS + ${staleQualAudits.length} Qualimètre supprimé(s) (>${DATA_RETENTION_DAYS} jours)`);
}

/**
 * Sélectionne les audits FSQS antérieurs à la date de coupure, dont
 * toutes les NC liées (s'il en existe) sont au statut 'Clôturée'.
 * @param {string} cutoffString - Date de coupure au format 'YYYY-MM-DD'.
 * @returns {Audit[]}
 */
function _findStaleAudits(cutoffString) {
  return DB.audits.filter(audit => {
    if (audit.date >= cutoffString) return false;
    /** @type {NC[]} */
    const linkedNcs = DB.ncs.filter(nc => nc.aid === audit.id);
    return linkedNcs.length === 0 || linkedNcs.every(nc => nc.statut === 'Clôturée');
  });
}

/**
 * Sélectionne les audits Qualimètre antérieurs à la date de coupure.
 * @param {string} cutoffString - Date de coupure au format 'YYYY-MM-DD'.
 * @returns {QualAudit[]}
 */
function _findStaleQualAudits(cutoffString) {
  return (DB.qualAudits || []).filter(audit => audit.date < cutoffString);
}

/**
 * Supprime les audits FSQS donnés ainsi que leurs NC et actions
 * liées, à la fois dans Supabase et dans la DB en mémoire.
 * @param {Audit[]} audits - Audits à supprimer.
 * @returns {Promise<void>}
 */
async function _deleteStaleAudits(audits) {
  for (const audit of audits) {
    /** @type {string[]} */
    const linkedNcIds = DB.ncs.filter(nc => nc.aid === audit.id).map(nc => nc.id);
    for (const ncId of linkedNcIds) {
      sbDeleteWhere('actions', 'ncId', ncId);
      DB.actions = DB.actions.filter(action => action.ncId !== ncId);
    }
    sbDeleteWhere('ncs', 'aid', audit.id);
    sbDeleteWhere('audits', 'id', audit.id);
    DB.ncs = DB.ncs.filter(nc => nc.aid !== audit.id);
  }
  DB.audits = DB.audits.filter(audit => !audits.find(stale => stale.id === audit.id));
}

/**
 * Supprime les audits Qualimètre donnés, à la fois dans Supabase et
 * dans la DB en mémoire.
 * @param {QualAudit[]} audits - Audits Qualimètre à supprimer.
 * @returns {Promise<void>}
 */
async function _deleteStaleQualAudits(audits) {
  for (const audit of audits) sbDeleteWhere('qual_audits', 'id', audit.id);
  DB.qualAudits = (DB.qualAudits || []).filter(a => !audits.find(stale => stale.id === a.id));
}

// ─────────────────────────────────────────────
// 10. POLLING — SYNCHRONISATION MULTI-SESSION
// ─────────────────────────────────────────────

/**
 * Vérifie toutes les N secondes si des données ont changé dans Supabase
 * (modifications par d'autres sessions / utilisateurs).
 * @returns {Promise<void>} Callback exécuté à chaque tick de l'intervalle.
 */
setInterval(async () => {
  if (!CU) return;

  try {
    /** @type {[Audit[], NC[], Action[], Alerte[], QualAudit[], Draft[]]} */
    const [audits, ncs, actions, alertes, qualAudits, drafts] = await Promise.all([
      sbSelect('audits'), sbSelect('ncs'), sbSelect('actions'),
      sbSelect('alertes'), sbSelect('qual_audits'), sbSelect('drafts'),
    ]);

    /** @type {boolean} */
    const hasChanges =
      JSON.stringify(audits)     !== JSON.stringify(DB.audits)     ||
      JSON.stringify(ncs)        !== JSON.stringify(DB.ncs)        ||
      JSON.stringify(actions)    !== JSON.stringify(DB.actions)    ||
      JSON.stringify(alertes)    !== JSON.stringify(DB.alertes)    ||
      JSON.stringify(qualAudits) !== JSON.stringify(DB.qualAudits);

    if (!hasChanges) return;

    DB.audits     = audits     || [];
    DB.ncs        = ncs        || [];
    DB.actions    = actions    || [];
    DB.alertes    = alertes    || [];
    DB.qualAudits = qualAudits || [];
    DB.drafts     = drafts     || [];
    _saveToLocalStorage();

    _refreshActivePage();
  } catch (_) {
    // Silencieux — la reconnexion gère la resync
  }
}, SYNC_POLL_INTERVAL_MS);

/**
 * Redessine la page active après une mise à jour des données distantes.
 * Recherche l'élément `.page.active` dans le DOM et appelle la
 * fonction de rendu correspondante (renderAudits, renderNC, etc.),
 * si elle existe pour la page courante.
 * @returns {void}
 */
function _refreshActivePage() {
  const activePage = document.querySelector('.page.active');
  if (!activePage) return;

  const pageId = activePage.id.replace('page-', '');
  /**
   * Table de correspondance entre identifiant de page et fonction de
   * rendu associée. Ces fonctions sont définies ailleurs dans le
   * projet (non visibles depuis storage.js).
   * @type {Record<string, (() => void) | undefined>}
   */
  const pageRefreshMap = {
    audits:            renderAudits,
    nc:                renderNC,
    actions:           renderActions,
    dashboard:         renderDash,
    'audit-qualimetre': renderQualAudits,
  };

  pageRefreshMap[pageId]?.();
}

// ─────────────────────────────────────────────
// 11. RECONNEXION EN LIGNE
// ─────────────────────────────────────────────

/**
 * Relance une synchronisation Supabase dès que la connexion réseau
 * est rétablie, si des modifications locales étaient en attente.
 * @param {Event} _event - Événement DOM 'online' (non utilisé).
 * @returns {void}
 */
window.addEventListener('online', () => {
  if (_pendingSyncToSupabase) {
    console.log('🔄 Reconnexion détectée — synchronisation Supabase…');
    _pushToSupabase();
  }
});

// ─────────────────────────────────────────────
// 12. SAUVEGARDE / RESTAURATION MANUELLE
// ─────────────────────────────────────────────

/**
 * Exporte toute la DB en fichier JSON téléchargeable.
 * Déclenche un téléchargement navigateur nommé
 * `qualistore-backup-{date}.json`.
 * @returns {void}
 */
function exportBackup() {
  /** @type {string} */
  const jsonData = JSON.stringify(DB, null, 2);
  /** @type {Blob} */
  const blob = new Blob([jsonData], { type: 'application/json' });
  /** @type {string} */
  const url  = URL.createObjectURL(blob);
  /** @type {HTMLAnchorElement} */
  const link = document.createElement('a');
  link.href     = url;
  link.download = `qualistore-backup-${today()}.json`;
  link.click();
  URL.revokeObjectURL(url);
}

/**
 * Importe une sauvegarde JSON et écrase toutes les données actuelles.
 * Demande confirmation à l'utilisateur, lit le fichier sélectionné,
 * remplace DB, persiste localement, pousse vers Supabase puis
 * recharge la page.
 * @param {HTMLInputElement} input - Élément `<input type="file">` dont
 *   `.files[0]` contient la sauvegarde JSON à importer.
 * @returns {void}
 */
function importBackup(input) {
  /** @type {File | undefined} */
  const file = input.files[0];
  if (!file) return;
  if (!confirm('Importer cette sauvegarde ? Toutes les données actuelles seront écrasées.')) return;

  const reader = new FileReader();
  /**
   * @param {ProgressEvent<FileReader>} event
   * @returns {Promise<void>}
   */
  reader.onload = async (event) => {
    try {
      // readAsText garantit que event.target.result est une string (pas un ArrayBuffer).
      /** @type {DB} */
      DB = JSON.parse(event.target.result);
      _saveToLocalStorage();
      await _pushToSupabase();
      alert('Restauration réussie !');
      location.reload();
    } catch (error) {
      alert(`Erreur lors de l'import : ${error.message}`);
    }
  };
  reader.readAsText(file);
  input.value = '';
}
