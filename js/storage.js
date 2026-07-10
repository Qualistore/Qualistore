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
 * Durée de rétention nominale des audits en jours, avant suppression
 * automatique (voir DATA_RETENTION_GRACE_DAYS pour le délai réel).
 * @type {number}
 */
const DATA_RETENTION_DAYS = 190;

/**
 * Nombre de jours avant l'échéance de rétention à partir desquels un
 * avertissement de suppression prochaine est affiché sur la ligne du
 * rapport concerné (voir _buildAuditCheckboxRow, rapports-fsqs.js).
 * @type {number}
 */
const DATA_RETENTION_WARNING_DAYS = 15;

/**
 * Délai de grâce (jours) automatiquement ajouté après l'échéance
 * nominale (DATA_RETENTION_DAYS) avant la suppression EFFECTIVE d'un
 * audit — garantit que l'avertissement (DATA_RETENTION_WARNING_DAYS)
 * reste visible au moins 15 jours avant que la suppression n'ait
 * réellement lieu. Volontairement égal à DATA_RETENTION_WARNING_DAYS
 * (le délai de grâce EST la fenêtre d'avertissement), gardé comme
 * constante séparée pour rester lisible si les deux devaient un jour
 * diverger.
 * @type {number}
 */
const DATA_RETENTION_GRACE_DAYS = 15;

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

/** @type {string} Clé localStorage pour persister _pendingSyncToSupabase à travers les rechargements. */
const PENDING_SYNC_KEY = STORAGE_KEY + '_pending_sync';

/**
 * Indique si des modifications locales n'ont pas encore été
 * synchronisées avec Supabase (ex : perte réseau, erreur serveur...).
 * ⚠️ AJOUTÉ : persisté dans localStorage, pas seulement en mémoire —
 * un simple rechargement de page ne doit jamais faire oublier qu'une
 * sauvegarde précédente a échoué, sans quoi loadDB() écraserait les
 * données locales de l'utilisateur par une version Supabase plus
 * ancienne sans même s'en apercevoir (voir loadDB, section 5).
 * @type {boolean}
 */
let _pendingSyncToSupabase = localStorage.getItem(PENDING_SYNC_KEY) === '1';

/**
 * Positionne _pendingSyncToSupabase et persiste sa valeur, pour
 * qu'elle survive à un rechargement de page (voir PENDING_SYNC_KEY).
 * @param {boolean} value
 * @returns {void}
 */
function _setPendingSync(value) {
  _pendingSyncToSupabase = value;
  try {
    if (value) localStorage.setItem(PENDING_SYNC_KEY, '1');
    else localStorage.removeItem(PENDING_SYNC_KEY);
  } catch (_) { /* localStorage indisponible : tant pis, le suivi reste en mémoire seulement */ }
}

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

  // ⚠️ AJOUTÉ : si une synchronisation précédente a échoué (colonne
  // manquante, erreur serveur ponctuelle, etc. — pas nécessairement
  // une perte réseau) et que la page a été rechargée depuis, ne JAMAIS
  // écraser les données locales (qui contiennent la saisie de
  // l'utilisateur non encore confirmée côté serveur) par la version
  // Supabase, potentiellement plus ancienne. On retente d'abord de
  // pousser les données locales telles quelles ; l'écrasement par la
  // version serveur ci-dessous n'a lieu que si cette tentative réussit
  // (les deux versions sont alors identiques, aucune perte possible).
  if (_pendingSyncToSupabase) {
    console.warn('⚠️ Synchronisation précédente incomplète détectée — nouvelle tentative avant rechargement...');
    await _pushToSupabase();
    if (_pendingSyncToSupabase) {
      console.warn('⚠️ Toujours en échec — données locales conservées telles quelles, sans écrasement par Supabase.');
      return;
    }
  }

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
    _setPendingSync(false);
    console.log('✅ Supabase chargé');

    // Nettoyage automatique des audits de plus de DATA_RETENTION_DAYS
    // (190 jours, soit ~6 mois) — décision produit explicite : les
    // rapports approchant l'échéance sont signalés 15 jours à l'avance
    // dans l'onglet Rapports FSQS (voir DATA_RETENTION_WARNING_DAYS,
    // daysUntilAuditCleanup, _buildAuditCheckboxRow dans rapports-fsqs.js).
    _cleanStaleData();

    // Rafraîchir l'utilisateur connecté depuis la DB à jour
    if (CU) {
      /** @type {User | undefined} */
      const freshUser = DB.users.find(u => u.id === CU.id);
      CU = freshUser || null;
    }
  } catch (error) {
    console.warn('⚠️ Supabase inaccessible — mode hors ligne :', error.message);
    _setPendingSync(true);
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
    _setPendingSync(false);
    console.log('✅ Sync Supabase OK');
  } catch (error) {
    console.warn('⚠️ Sync Supabase échouée :', error.message);
    _setPendingSync(true);
  }
}

// ─────────────────────────────────────────────
// 9. NETTOYAGE AUTOMATIQUE DES DONNÉES ANCIENNES
// ─────────────────────────────────────────────

/**
 * Calcule la date de suppression EFFECTIVE d'un audit, selon une
 * règle à 3 paliers basée sur le moment où sa DERNIÈRE NC à traiter a
 * été clôturée (nc.closedDate, voir saveNCEdit, nc.js), en jours
 * depuis la date de l'audit (= date de création des NC liées) :
 *
 *  - clôturée au plus tard au jour (DATA_RETENTION_DAYS − DATA_RETENTION_GRACE_DAYS)
 *    [175] → suppression au jour DATA_RETENTION_DAYS [190].
 *  - clôturée entre ce jour et DATA_RETENTION_DAYS [176 à 190]
 *    → suppression au jour DATA_RETENTION_DAYS + DATA_RETENTION_GRACE_DAYS
 *    [205] — palier FIXE, pas jour de clôture + 15 (une clôture au
 *    jour 180 donne 205, pas 195).
 *  - clôturée après DATA_RETENTION_DAYS [190] (NC restée ouverte
 *    au-delà de l'échéance nominale) → suppression DATA_RETENTION_GRACE_DAYS
 *    [15] jours après cette clôture, glissant (jamais plafonné).
 *
 * Un audit sans aucune NC liée suit l'échéance nominale directement
 * (rien à "traiter"). Repli sur la date de l'audit si nc.closedDate
 * est absent (NC clôturée avant l'ajout de ce champ) — traité comme
 * une clôture immédiate, donc premier palier.
 * @param {Audit} audit
 * @returns {Date | null} null si au moins une NC liée n'est pas (encore) clôturée — jamais supprimé automatiquement dans ce cas.
 */
function _auditDeletionDate(audit) {
  /** @type {NC[]} */
  const linkedNcs = DB.ncs.filter(nc => nc.aid === audit.id);
  if (linkedNcs.some(nc => nc.statut !== 'Clôturée')) return null;

  /** @type {Date} */
  const auditDate = new Date(audit.date);
  /** @type {number} Début de la fenêtre d'avertissement (175). */
  const earlyThreshold = DATA_RETENTION_DAYS - DATA_RETENTION_GRACE_DAYS;

  /** @type {number} Décalage en jours depuis auditDate. */
  let deletionDayOffset;

  if (!linkedNcs.length) {
    deletionDayOffset = DATA_RETENTION_DAYS;
  } else {
    // Jour (depuis l'audit) où la DERNIÈRE NC à traiter a été clôturée.
    /** @type {number} */
    const lastClosureDayOffset = Math.max(...linkedNcs.map(nc => {
      /** @type {Date} */
      const closedDate = new Date(nc.closedDate || audit.date);
      return Math.round((closedDate.getTime() - auditDate.getTime()) / 86_400_000);
    }));

    if      (lastClosureDayOffset <= earlyThreshold)      deletionDayOffset = DATA_RETENTION_DAYS;
    else if (lastClosureDayOffset <= DATA_RETENTION_DAYS) deletionDayOffset = DATA_RETENTION_DAYS + DATA_RETENTION_GRACE_DAYS;
    else                                                  deletionDayOffset = lastClosureDayOffset + DATA_RETENTION_GRACE_DAYS;
  }

  /** @type {Date} */
  const deletionDate = new Date(auditDate);
  deletionDate.setDate(deletionDate.getDate() + deletionDayOffset);
  return deletionDate;
}

/**
 * Calcule dans combien de jours un audit sera EFFECTIVEMENT supprimé
 * (voir _auditDeletionDate pour la règle à 3 paliers). Utilisée par
 * _buildAuditCheckboxRow (rapports-fsqs.js) pour l'avertissement de
 * suppression prochaine.
 * @param {Audit} audit
 * @returns {number | null} Jours restants (négatif si déjà dépassée et pas encore nettoyée au prochain chargement), ou null si au moins une NC liée n'est pas clôturée (jamais supprimé automatiquement en l'état).
 */
function daysUntilAuditCleanup(audit) {
  /** @type {Date | null} */
  const deletionDate = _auditDeletionDate(audit);
  if (!deletionDate) return null;
  return Math.ceil((deletionDate.getTime() - Date.now()) / 86_400_000);
}

/**
 * Identifie et supprime (DB + Supabase) les audits FSQS (règle à 3
 * paliers, voir _auditDeletionDate) et les audits Qualimètre (échéance
 * simple à DATA_RETENTION_DAYS, sans notion de NC).
 * @returns {Promise<void>}
 */
async function _cleanStaleData() {
  /** @type {Audit[]} */
  const staleAudits = _findStaleAudits();

  /** @type {Date} */
  const qualCutoffDate = new Date();
  qualCutoffDate.setDate(qualCutoffDate.getDate() - DATA_RETENTION_DAYS);
  /** @type {string} Date de coupure au format 'YYYY-MM-DD'. */
  const qualCutoffString = qualCutoffDate.toISOString().split('T')[0];
  /** @type {QualAudit[]} */
  const staleQualAudits = _findStaleQualAudits(qualCutoffString);

  if (!staleAudits.length && !staleQualAudits.length) return;

  await _deleteStaleAudits(staleAudits);
  await _deleteStaleQualAudits(staleQualAudits);

  _saveToLocalStorage();
  console.log(`🗑️ Nettoyage : ${staleAudits.length} audit(s) FSQS + ${staleQualAudits.length} Qualimètre supprimé(s)`);
}

/**
 * Sélectionne les audits FSQS dont la date de suppression effective
 * (voir _auditDeletionDate, règle à 3 paliers) est déjà atteinte. Un
 * audit dont une NC est encore ouverte n'est jamais sélectionné,
 * quelle que soit son ancienneté — la non-conformité non traitée doit
 * rester consultable avec son rapport d'origine.
 * @returns {Audit[]}
 */
function _findStaleAudits() {
  /** @type {number} */
  const now = Date.now();
  return DB.audits.filter(audit => {
    /** @type {Date | null} */
    const deletionDate = _auditDeletionDate(audit);
    return deletionDate !== null && deletionDate.getTime() <= now;
  });
}

/**
 * Sélectionne les audits Qualimètre antérieurs à la date de coupure
 * (échéance simple, sans notion de NC ni de délai de grâce — ce
 * concept d'audits Qualimètre n'a pas de NC liée dans ce projet).
 * @param {string} cutoffString - Date de coupure au format 'YYYY-MM-DD'.
 * @returns {QualAudit[]}
 */
function _findStaleQualAudits(cutoffString) {
  return (DB.qualAudits || []).filter(audit => audit.date < cutoffString);
}

/**
 * Supprime les audits FSQS donnés ainsi que leurs NC et actions
 * liées, à la fois dans Supabase et dans la DB en mémoire. Ne reçoit
 * que des audits déjà filtrés par _findStaleAudits (donc dont les NC,
 * s'il en existe, sont nécessairement toutes clôturées), rien
 * d'ouvert n'est jamais perdu ici.
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
 *
 * ⚠️ CORRIGÉ : ce sondage écrasait DB.ncs/DB.actions/... par la
 * version Supabase dès qu'elle différait de la version locale — y
 * compris quand cette différence venait d'un push LOCAL encore en
 * attente ou en échec (voir _pendingSyncToSupabase, section 1). Dans
 * ce cas, la version serveur (plus ancienne, sans les données tout
 * juste créées localement) était considérée comme "changée" et
 * écrasait silencieusement la version locale — un audit qui vient de
 * créer une NC pouvait ainsi la voir disparaître au tick suivant (5s)
 * si le push de cette NC n'avait pas encore abouti côté serveur (par
 * exemple à cause d'une colonne manquante en base, comme déjà
 * rencontré sur 'alertes'/'documents'). Même protection qu'à
 * l'ouverture de l'app (voir loadDB) : si une synchronisation est en
 * attente, on retente le push AVANT toute comparaison, et on
 * n'écrase la DB locale que si ce push a réussi.
 * @returns {Promise<void>} Callback exécuté à chaque tick de l'intervalle.
 */
setInterval(async () => {
  if (!CU) return;

  if (_pendingSyncToSupabase) {
    await _pushToSupabase();
    if (_pendingSyncToSupabase) return; // toujours en échec — ne pas comparer/écraser ce tick-ci
  }

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
      JSON.stringify(qualAudits) !== JSON.stringify(DB.qualAudits) ||
      JSON.stringify(drafts)     !== JSON.stringify(DB.drafts);

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
 *
 * ⚠️ CORRIGÉ : ajout de 'brouillons' → renderDrafts, absente de cette
 * table alors que DB.drafts fait bien partie des données rafraîchies
 * par le polling ci-dessus — la page Brouillons ne se mettait jamais
 * à jour toute seule si elle était déjà affichée pendant qu'un autre
 * appareil modifiait un brouillon.
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
    brouillons:        renderDrafts,
  };

  pageRefreshMap[pageId]?.();
}

// ─────────────────────────────────────────────
// 11. RECONNEXION EN LIGNE
// ─────────────────────────────────────────────

/**
 * Relance une synchronisation Supabase dès que la connexion réseau
 * est rétablie, si des modifications locales étaient en attente.
 *
 * ⚠️ AJOUTÉ : déclenche aussi le vidage de la file d'attente photos
 * hors-ligne (voir section 13, flushPendingPhotoQueue) — même
 * déclencheur 'online' que la synchronisation Supabase, pas la peine
 * d'ajouter un second listener séparé pour ça.
 * @param {Event} _event - Événement DOM 'online' (non utilisé).
 * @returns {void}
 */
window.addEventListener('online', () => {
  if (_pendingSyncToSupabase) {
    console.log('🔄 Reconnexion détectée — synchronisation Supabase…');
    _pushToSupabase();
  }
  flushPendingPhotoQueue();
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

// ─────────────────────────────────────────────
// 13. FILE D'ATTENTE PHOTOS HORS-LIGNE (IndexedDB)
//
// Quand l'upload d'une photo échoue malgré les tentatives
// automatiques (voir uploadPhotoWithRetry, ui.js) — typiquement une
// connexion terrain instable — la photo n'est plus perdue : elle est
// mise en file d'attente ici, puis renvoyée automatiquement dès que
// la connexion revient (voir la section 11 ci-dessus) ou toutes les
// 30 secondes tant qu'on est en ligne.
//
// IndexedDB plutôt que localStorage : les photos (même compressées,
// voir compressImageFile, ui.js) font plusieurs centaines de Ko —
// largement de quoi saturer les 5-10 Mo habituels de localStorage
// pour tout le site, ce qui casserait aussi la sauvegarde des
// audits/brouillons. IndexedDB n'a pas cette limite pratique.
//
// Générique et réutilisable par contexte (seul 'audit-fsqs' existe
// pour l'instant, voir audits.js) : chaque contexte enregistre sa
// propre fonction de réconciliation via registerPhotoQueueReconciler,
// appelée avec l'entrée en attente et l'URL réelle une fois l'upload
// réussi — à elle de décider où replacer cette URL (réponse d'audit
// encore ouverte en mémoire, ou brouillon déjà sauvegardé sur disque).
// ─────────────────────────────────────────────

/**
 * Entrée de la file d'attente photos hors-ligne.
 * @typedef {Object} PendingPhotoEntry
 * @property {string} id - Identifiant généré (préfixé 'pq-').
 * @property {string} context - Contexte d'origine (ex : 'audit-fsqs'), détermine quel réconciliateur est appelé après envoi réussi.
 * @property {string} pointId - Référence vers GrillePoint.id, pour que le réconciliateur sache où placer l'URL obtenue.
 * @property {string} [draftId] - Référence vers Draft.id, si un brouillon existait déjà au moment de la mise en attente (voir _ensureDraftSnapshotForCurrentAudit, audits.js).
 * @property {Blob} blob - Photo déjà compressée (voir compressImageFile, ui.js), prête à être envoyée telle quelle.
 * @property {string} storagePath - Chemin de destination dans le bucket Supabase Storage 'photos', déjà calculé au moment de la mise en attente.
 * @property {number} createdAt - Horodatage (Date.now()) de la mise en attente.
 */

/** @type {string} */
const PHOTO_QUEUE_DB_NAME = 'qualistore-photo-queue';
/** @type {number} */
const PHOTO_QUEUE_DB_VERSION = 1;
/** @type {string} */
const PHOTO_QUEUE_STORE = 'pending';

/** @type {Object<string, (entry: PendingPhotoEntry, url: string) => void>} */
const _photoQueueReconcilers = {};

/**
 * Enregistre la fonction appelée après l'envoi réussi d'une photo
 * précédemment mise en file d'attente pour un contexte donné.
 * @param {string} context - Ex : 'audit-fsqs'.
 * @param {(entry: PendingPhotoEntry, url: string) => void} reconciler
 * @returns {void}
 */
function registerPhotoQueueReconciler(context, reconciler) {
  _photoQueueReconcilers[context] = reconciler;
}

/**
 * Ouvre (et crée si besoin) la base IndexedDB de la file d'attente.
 * @returns {Promise<IDBDatabase>}
 */
function _openPhotoQueueDb() {
  return new Promise((resolve, reject) => {
    /** @type {IDBOpenDBRequest} */
    const request = indexedDB.open(PHOTO_QUEUE_DB_NAME, PHOTO_QUEUE_DB_VERSION);
    request.onupgradeneeded = () => {
      if (!request.result.objectStoreNames.contains(PHOTO_QUEUE_STORE)) {
        request.result.createObjectStore(PHOTO_QUEUE_STORE, { keyPath: 'id' });
      }
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror   = () => reject(request.error);
  });
}

/**
 * Met une photo en file d'attente locale après échec définitif de
 * l'upload (voir uploadPhotoWithRetry, ui.js). En cas d'échec de
 * l'écriture IndexedDB elle-même (navigateur en mode privé strict,
 * quota plein...), n'interrompt rien d'autre : la photo sera
 * simplement perdue comme avant ce correctif, sans faire planter
 * l'appelant.
 * @param {Omit<PendingPhotoEntry, 'id'|'createdAt'>} entry
 * @returns {Promise<string>} L'id généré pour cette entrée.
 */
async function queuePendingPhoto(entry) {
  /** @type {string} */
  const id = 'pq-' + uid();
  /** @type {PendingPhotoEntry} */
  const record = { ...entry, id, createdAt: Date.now() };
  try {
    /** @type {IDBDatabase} */
    const db = await _openPhotoQueueDb();
    await new Promise((resolve, reject) => {
      /** @type {IDBTransaction} */
      const tx = db.transaction(PHOTO_QUEUE_STORE, 'readwrite');
      tx.objectStore(PHOTO_QUEUE_STORE).put(record);
      tx.oncomplete = resolve;
      tx.onerror    = () => reject(tx.error);
    });
  } catch (err) {
    console.error("Impossible de mettre la photo en file d'attente locale :", err);
  }
  return id;
}

/**
 * Liste toutes les photos actuellement en file d'attente.
 * @returns {Promise<PendingPhotoEntry[]>}
 */
async function getPendingPhotos() {
  try {
    /** @type {IDBDatabase} */
    const db = await _openPhotoQueueDb();
    return await new Promise((resolve, reject) => {
      /** @type {IDBTransaction} */
      const tx = db.transaction(PHOTO_QUEUE_STORE, 'readonly');
      /** @type {IDBRequest} */
      const request = tx.objectStore(PHOTO_QUEUE_STORE).getAll();
      request.onsuccess = () => resolve(request.result || []);
      request.onerror   = () => reject(request.error);
    });
  } catch (err) {
    console.error("Impossible de lire la file d'attente locale :", err);
    return [];
  }
}

/**
 * Retire une entrée de la file d'attente (après envoi réussi).
 * @param {string} id
 * @returns {Promise<void>}
 */
async function removePendingPhoto(id) {
  try {
    /** @type {IDBDatabase} */
    const db = await _openPhotoQueueDb();
    await new Promise((resolve, reject) => {
      /** @type {IDBTransaction} */
      const tx = db.transaction(PHOTO_QUEUE_STORE, 'readwrite');
      tx.objectStore(PHOTO_QUEUE_STORE).delete(id);
      tx.oncomplete = resolve;
      tx.onerror    = () => reject(tx.error);
    });
  } catch (err) {
    console.error("Impossible de retirer l'entrée de la file d'attente :", err);
  }
}

/**
 * Compte les photos actuellement en attente pour un contexte donné —
 * utilisée pour afficher un indicateur (ex : badge dans la modale
 * d'audit) sans avoir à charger les Blob complets.
 * @param {string} [context] - Si fourni, ne compte que ce contexte.
 * @returns {Promise<number>}
 */
async function countPendingPhotos(context) {
  /** @type {PendingPhotoEntry[]} */
  const pending = await getPendingPhotos();
  return context ? pending.filter(p => p.context === context).length : pending.length;
}

/** @type {boolean} */
let _photoQueueFlushing = false;

/**
 * Tente d'envoyer toutes les photos actuellement en file d'attente.
 * Pour chaque entrée envoyée avec succès, appelle le réconciliateur
 * enregistré pour son contexte (voir registerPhotoQueueReconciler)
 * puis retire l'entrée de la file. Les entrées qui échouent encore
 * restent en file pour la prochaine tentative (déclenchée au retour
 * en ligne, section 11, ou par la minuterie ci-dessous).
 *
 * Un seul vidage à la fois (_photoQueueFlushing) pour éviter des
 * envois en double si plusieurs déclencheurs se chevauchent (retour
 * en ligne + minuterie périodique, par exemple).
 * @returns {Promise<void>}
 */
async function flushPendingPhotoQueue() {
  if (_photoQueueFlushing || !navigator.onLine) return;
  _photoQueueFlushing = true;
  try {
    /** @type {PendingPhotoEntry[]} */
    const pending = await getPendingPhotos();
    for (const entry of pending) {
      /** @type {string | null} */
      const url = await uploadPhotoWithRetry(entry.blob, entry.storagePath, 1);
      if (!url) continue; // toujours pas de réseau fiable, on réessaiera plus tard

      await removePendingPhoto(entry.id);
      /** @type {((entry: PendingPhotoEntry, url: string) => void) | undefined} */
      const reconciler = _photoQueueReconcilers[entry.context];
      if (reconciler) {
        try { reconciler(entry, url); } catch (err) { console.error('Erreur de réconciliation photo :', err); }
      }
    }
  } finally {
    _photoQueueFlushing = false;
  }
}

// Nouvelle tentative périodique tant que l'onglet reste ouvert, en
// plus du déclenchement immédiat au retour en ligne (section 11) —
// utile si la connexion est instable plutôt que franchement coupée
// (l'événement 'online' ne se déclenche pas dans ce cas).
setInterval(flushPendingPhotoQueue, 30_000);

// Tentative dès le chargement de la page, au cas où des photos
// seraient restées en attente d'une session précédente.
flushPendingPhotoQueue();
