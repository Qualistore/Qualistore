// ══════════════════════════════════════════════════════════════
// SUPABASE — Client officiel (supabase-js)
// Responsabilité inchangée : encapsuler les échanges avec Supabase.
// Aucune logique métier ici.
//
// ⚠️ CHANGÉ (migration Supabase Auth, étape 2/8 — voir le plan) :
// remplace les appels fetch() manuels par le client officiel
// @supabase/supabase-js (chargé via CDN, voir index.html/
// Qualistore.html — balise <script> à ajouter AVANT ce fichier).
//
// Comportement volontairement identique à l'ancienne version pour
// tous les appelants (storage.js, magasins.js, rayons.js, etc.) :
// mêmes noms de fonctions, mêmes signatures, mêmes valeurs de
// retour. Rien d'autre à changer ailleurs pour cette étape.
//
// Ce qui change réellement, invisible pour l'instant : le client
// sait désormais porter un jeton de session utilisateur (JWT) à la
// place de la clé anon fixe, dès qu'un login réel existera (voir
// auth.js, étape 3 du plan — pas encore fait). Tant que ce login
// n'existe pas, aucune session n'est active : le client utilise la
// clé anon exactement comme avant, comportement inchangé.
// ══════════════════════════════════════════════════════════════

// ─────────────────────────────────────────────
// 0. TYPEDEFS JSDoc (pour inférence VSCode / TypeScript)
//    Conservés à l'identique de l'ancienne version.
// ─────────────────────────────────────────────

/**
 * Ligne brute échangée avec Supabase. La forme exacte varie selon
 * la table interrogée (ex : { id, login, pwd, ... } pour 'users',
 * { id, rayon, data } pour 'grille_custom'). Représentée comme un
 * dictionnaire ouvert car ce fichier n'a aucune connaissance du
 * schéma métier.
 * @typedef {Object<string, *>} SupabaseRow
 */

// ─────────────────────────────────────────────
// 1. CONFIGURATION
// ─────────────────────────────────────────────

// Clé anon/publishable Supabase — non secrète, destinée au client.
// Ne jamais remplacer par une service_role key ici.
/** @type {string} */
const SUPABASE_URL = 'https://jztacnkvmuhouhhapjen.supabase.co';
/** @type {string} */
const SUPABASE_ANON_KEY = 'sb_publishable_HuVt2NSLrCfUvKcgXI7Byg_Jkq96fB9';

/**
 * Client Supabase officiel, partagé par tout le fichier. `window.supabase`
 * est fourni par le script CDN (voir index.html/Qualistore.html) — s'il
 * est absent, une erreur claire est levée immédiatement plutôt que de
 * planter plus tard sur un message obscur.
 * @type {Object}
 */
if (!window.supabase) {
  throw new Error(
    'Le script supabase-js (CDN) doit être chargé AVANT supabase.js — ' +
    'vérifiez la balise <script src="https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2/dist/umd/supabase.js"> dans le HTML.'
  );
}
const _sb = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
  auth: {
    persistSession:    true,  // garde la session au rechargement de page (remplace à terme LS_KEY_CURRENT_USER, auth.js)
    autoRefreshToken:  true,  // renouvelle le jeton automatiquement avant expiration
  },
});

// ─────────────────────────────────────────────
// 2. API PUBLIQUE — signatures inchangées
// ─────────────────────────────────────────────

/**
 * Récupère toutes les lignes d'une table.
 * @param {string} table - Nom de la table Supabase (ex : 'users', 'audits').
 * @returns {Promise<SupabaseRow[]>}
 */
async function sbSelect(table) {
  const { data, error } = await _sb.from(table).select('*');
  if (error) {
    console.error(`Supabase error [select] ${table}:`, error.message);
    return [];
  }
  return data || [];
}

/**
 * Insère ou met à jour des lignes (upsert).
 * Déduplique par `id` avant l'envoi pour éviter les conflits.
 * @param {string} table - Nom de la table Supabase.
 * @param {SupabaseRow[]} rows - Lignes à insérer/mettre à jour. Chaque
 *   ligne devrait porter un champ `id` pour bénéficier de la
 *   déduplication ; les lignes sans `id` sont conservées telles quelles.
 * @returns {Promise<SupabaseRow[]|null|undefined>} Le résultat de
 *   l'upsert, ou undefined si `rows` est vide/absent.
 */
async function sbUpsert(table, rows) {
  if (!rows || !rows.length) return;

  // Déduplique par id (garde le dernier en cas de doublon) — logique
  // inchangée par rapport à l'ancienne version.
  /** @type {Map<string, SupabaseRow>} */
  const deduplicatedById = new Map();
  rows.forEach(row => { if (row.id) deduplicatedById.set(row.id, row); });
  /** @type {SupabaseRow[]} */
  const deduplicatedRows = deduplicatedById.size > 0 ? [...deduplicatedById.values()] : rows;

  // Normalise les objets pour qu'ils aient tous les mêmes clés (null pour les manquantes)
  /** @type {string[]} */
  const allKeys = [...new Set(deduplicatedRows.flatMap(row => Object.keys(row)))];
  /** @type {SupabaseRow[]} */
  const normalizedRows = deduplicatedRows.map(row => {
    /** @type {SupabaseRow} */
    const normalized = {};
    allKeys.forEach(key => { normalized[key] = row[key] !== undefined ? row[key] : null; });
    return normalized;
  });

  const { data, error } = await _sb.from(table).upsert(normalizedRows).select();
  if (error) {
    console.error(`Supabase error [upsert] ${table}:`, error.message);
    return null;
  }
  return data;
}

/**
 * Supprime toutes les lignes d'une table où `column = value`.
 * @param {string} table - Nom de la table Supabase.
 * @param {string} column - Nom de la colonne sur laquelle filtrer.
 * @param {string|number} value - Valeur de filtre.
 * @returns {Promise<*|null>}
 */
async function sbDeleteWhere(table, column, value) {
  const { data, error } = await _sb.from(table).delete().eq(column, value).select();
  if (error) {
    console.error(`Supabase error [delete] ${table}:`, error.message);
    return null;
  }
  return data;
}

/**
 * Upload une photo dans le bucket Supabase Storage.
 * Retourne l'URL publique de la photo, ou null en cas d'échec.
 * @param {File|Blob} file - Fichier image à uploader (doit exposer `.type`).
 * @param {string} storagePath - Chemin de destination dans le bucket 'photos'.
 * @returns {Promise<string|null>}
 */
async function sbUploadPhoto(file, storagePath) {
  try {
    const { error } = await _sb.storage.from('photos').upload(storagePath, file, {
      upsert:      true,
      contentType: file.type,
    });
    if (error) {
      console.error('Upload photo échoué (HTTP) pour :', storagePath, error.message);
      return null;
    }
    const { data } = _sb.storage.from('photos').getPublicUrl(storagePath);
    return data.publicUrl;
  } catch (err) {
    // Coupure réseau momentanée — même garde-fou que l'ancienne version.
    console.error('Upload photo échoué (réseau) pour :', storagePath, err);
    return null;
  }
}

/**
 * Supprime une photo du bucket Supabase Storage.
 * @param {string} storagePath - Chemin de la photo dans le bucket 'photos'.
 * @returns {Promise<boolean>} true si la suppression a réussi.
 */
async function sbDeletePhoto(storagePath) {
  const { error } = await _sb.storage.from('photos').remove([storagePath]);
  return !error;
}
