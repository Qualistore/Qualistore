// ══════════════ STORAGE — moteur bas niveau ══════════════
// Dépend de : config.js (SK)
// Expose : DB, loadDB(), save(), uid(), CU

// ─────────────────────────────────────────────
// TYPEDEFS JSDoc (pour inférence VSCode / TypeScript)
// ⚠️ Déduits de l'usage dans CE fichier uniquement. Cette variante
// localStorage-only diffère de la version Supabase de storage.js
// (présence de compteurs nAud/nNc/nAc/nAl/nQAud, absence de
// drafts et qualimetreGlobal) — ne pas fusionner les deux typedefs DB.
// ─────────────────────────────────────────────

/**
 * Droits d'accès d'un utilisateur. Clés confirmées par config.js
 * (PERMISSION_IDS / DEFAULT_PERMISSIONS) dans la version complète du
 * projet — 1 = autorisé, 0 = refusé.
 * @typedef {Object} UserPerms
 * @property {number} aud-r
 * @property {number} aud-w
 * @property {number} nc
 * @property {number} ac
 * @property {number} mag
 * @property {number} rap
 * @property {number} grille
 * @property {number} usr
 */

/**
 * Utilisateur applicatif (compte admin ou collaborateur).
 * @typedef {Object} User
 * @property {string} id
 * @property {string} nom
 * @property {string} login
 * @property {string} pwd - Mot de passe encodé en base64 (btoa), pas un hash cryptographique.
 * @property {string} role - Valeur observée : 'admin'.
 * @property {string} statut - Valeur observée : 'actif'.
 * @property {unknown[]} magasins - Tableau vide par défaut ; type des éléments non observé dans ce fichier.
 * @property {UserPerms} perms
 */

/**
 * Structure racine de la base de données applicative (variante
 * localStorage-only). Les propriétés magasins/audits/ncs/actions/
 * alertes/qualAudits ne sont jamais déstructurées dans ce fichier —
 * leur contenu réel reste TODO TYPE (unknown) à ce niveau.
 * @typedef {Object} DB
 * @property {User[]} users
 * @property {unknown[]} magasins
 * @property {unknown[]} audits
 * @property {unknown[]} ncs
 * @property {unknown[]} actions
 * @property {unknown[]} alertes
 * @property {Record<string, unknown>} grilleCustom
 * @property {Record<string, unknown>} qualimetreCustom
 * @property {unknown[]} qualAudits
 * @property {number} nAud - Compteur servant probablement à générer des identifiants d'audit lisibles. TODO TYPE : usage exact non observable dans ce fichier.
 * @property {number} nNc - Compteur équivalent pour les NC. TODO TYPE.
 * @property {number} nAc - Compteur équivalent pour les actions. TODO TYPE.
 * @property {number} nAl - Compteur équivalent pour les alertes. TODO TYPE.
 * @property {number} nQAud - Compteur équivalent pour les audits Qualimètre. TODO TYPE.
 */

/**
 * Charge la base de données depuis le cache localStorage (clé SK,
 * définie dans config.js). Si absent, corrompu, ou si localStorage
 * est inaccessible, retourne une structure DB par défaut avec un
 * unique compte administrateur.
 * @returns {DB}
 */
function loadDB(){
  try{ /** @type {string|null} */const r=localStorage.getItem(SK); if(r) return JSON.parse(r); }catch(e){}
  return {
    users:[{id:'admin1',nom:'Administrateur',login:'admin',pwd:btoa('admin'),role:'admin',statut:'actif',magasins:[],
      perms:{'aud-r':1,'aud-w':1,'nc':1,'ac':1,'mag':1,'rap':1,'grille':1,'usr':1}}],
    magasins:[], audits:[], ncs:[], actions:[], alertes:[],
    grilleCustom:{}, qualimetreCustom:{}, qualAudits:[],
    nAud:1, nNc:1, nAc:1, nAl:1, nQAud:1
  };
}
/**
 * Sauvegarde la DB en mémoire dans localStorage (clé SK).
 * @returns {void}
 */
function save(){ localStorage.setItem(SK,JSON.stringify(DB)); }
/**
 * Génère un identifiant unique (base36 timestamp + aléatoire).
 * @returns {string}
 */
function uid(){ return Date.now().toString(36)+Math.random().toString(36).slice(2,6); }

/** @type {DB} Base de données applicative en mémoire. */
let DB = loadDB();
/** @type {User | null} Utilisateur connecté (null si non authentifié). */
let CU = null; // current user