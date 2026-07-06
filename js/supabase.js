// ══════════════════════════════════════════════════════════════
// SUPABASE — Client HTTP bas niveau
// Responsabilité unique : encapsuler les appels fetch vers l'API Supabase.
// Aucune logique métier ici.
// ══════════════════════════════════════════════════════════════

// ─────────────────────────────────────────────
// 0. TYPEDEFS JSDoc (pour inférence VSCode / TypeScript)
//    ⚠️ Déduits de l'usage dans ce fichier uniquement.
// ─────────────────────────────────────────────

/**
 * Ligne brute échangée avec l'API REST Supabase. La forme exacte
 * varie selon la table interrogée (ex : { id, login, pwd, ... } pour
 * 'users', { id, rayon, data } pour 'grille_custom'). Représentée
 * comme un dictionnaire ouvert car ce fichier n'a aucune connaissance
 * du schéma métier — TODO TYPE : à affiner table par table si besoin
 * (voir storage.js pour les typedefs métier qui consomment ces lignes).
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

// ─────────────────────────────────────────────
// 2. UTILITAIRE INTERNE
// ─────────────────────────────────────────────

/**
 * Effectue une requête authentifiée vers l'API REST Supabase.
 * Retourne le JSON parsé, ou null en cas d'erreur réseau / HTTP.
 * @param {string} path - Chemin relatif à SUPABASE_URL (ex : '/rest/v1/users?select=*').
 * @param {RequestInit} [options] - Options fetch standard (method, body, headers...).
 *   Les headers fournis ici complètent/écrasent les headers par défaut
 *   (apikey, Authorization, Content-Type, Prefer).
 * @returns {Promise<*|null>} Le JSON parsé (objet, tableau, ou []
 *   si le corps de réponse est vide), ou null en cas d'erreur HTTP.
 */
async function _supabaseFetch(path, options = {}) {
  const response = await fetch(SUPABASE_URL + path, {
    ...options,
    headers: {
      'apikey':        SUPABASE_ANON_KEY,
      'Authorization': `Bearer ${SUPABASE_ANON_KEY}`,
      'Content-Type':  'application/json',
      'Prefer':        'return=representation',
      ...(options.headers || {}),
    },
  });

  if (!response.ok) {
    /** @type {string} */
    const errorText = await response.text();
    console.error(`Supabase error [${response.status}] ${path}:`, errorText);
    return null;
  }

  /** @type {string} */
  const text = await response.text();
  return text ? JSON.parse(text) : [];
}

// ─────────────────────────────────────────────
// 3. API PUBLIQUE
// ─────────────────────────────────────────────

/**
 * Récupère toutes les lignes d'une table.
 * @param {string} table - Nom de la table Supabase (ex : 'users', 'audits').
 * @returns {Promise<SupabaseRow[]>}
 */
async function sbSelect(table) {
  return await _supabaseFetch(`/rest/v1/${table}?select=*`) || [];
}

/**
 * Insère ou met à jour des lignes (upsert).
 * Déduplique par `id` avant l'envoi pour éviter les conflits.
 * @param {string} table - Nom de la table Supabase.
 * @param {SupabaseRow[]} rows - Lignes à insérer/mettre à jour. Chaque
 *   ligne devrait porter un champ `id` pour bénéficier de la
 *   déduplication ; les lignes sans `id` sont conservées telles quelles.
 * @returns {Promise<SupabaseRow[]|null|undefined>} Le résultat de
 *   _supabaseFetch, ou undefined si `rows` est vide/absent.
 */
async function sbUpsert(table, rows) {
  if (!rows || !rows.length) return;

  // Déduplique par id (garde le dernier en cas de doublon)
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

  return await _supabaseFetch(`/rest/v1/${table}`, {
    method:  'POST',
    headers: { 'Prefer': 'resolution=merge-duplicates,return=representation' },
    body:    JSON.stringify(normalizedRows),
  });
}

/**
 * Supprime toutes les lignes d'une table où `column = value`.
 * @param {string} table - Nom de la table Supabase.
 * @param {string} column - Nom de la colonne sur laquelle filtrer.
 * @param {string|number} value - Valeur de filtre (sera encodée pour l'URL).
 * @returns {Promise<*|null>}
 */
async function sbDeleteWhere(table, column, value) {
  return await _supabaseFetch(
    `/rest/v1/${table}?${column}=eq.${encodeURIComponent(value)}`,
    { method: 'DELETE' }
  );
}

/**
 * Upload une photo dans le bucket Supabase Storage.
 * Retourne l'URL publique de la photo, ou null en cas d'échec.
 *
 * ⚠️ CORRIGÉ : le fetch est désormais entouré d'un try/catch — une
 * connexion instable (coupure momentanée, perte de paquets) fait
 * lever une exception AVANT même de recevoir une réponse HTTP
 * (`TypeError: Failed to fetch`), distincte d'une réponse HTTP en
 * erreur (`!response.ok`, déjà gérée). Sans ce correctif, cette
 * exception remontait telle quelle jusqu'à l'appelant (handleAuditPhoto,
 * audits.js ; handleQaPhoto, audit-qualimetre.js ; handleAlertPhotos,
 * alertes.js), qui n'avait pas non plus de try/catch autour de la
 * boucle d'upload de plusieurs photos — une seule photo en échec
 * réseau interrompait alors la boucle entière, sautant même
 * l'affichage de l'alerte d'échec et le rafraîchissement de l'aperçu.
 * @param {File|Blob} file - Fichier image à uploader (doit exposer `.type`).
 * @param {string} storagePath - Chemin de destination dans le bucket 'photos'.
 * @returns {Promise<string|null>}
 */
async function sbUploadPhoto(file, storagePath) {
  try {
    /** @type {Response} */
    const response = await fetch(`${SUPABASE_URL}/storage/v1/object/photos/${storagePath}`, {
      method:  'POST',
      headers: {
        'apikey':        SUPABASE_ANON_KEY,
        'Authorization': `Bearer ${SUPABASE_ANON_KEY}`,
        'Content-Type':  file.type,
        'x-upsert':      'true',
      },
      body: file,
    });

    if (!response.ok) {
      console.error('Upload photo échoué (HTTP) pour :', storagePath);
      return null;
    }

    return `${SUPABASE_URL}/storage/v1/object/public/photos/${storagePath}`;
  } catch (err) {
    console.error('Upload photo échoué (réseau) pour :', storagePath, err);
    return null;
  }
}

/**
 * Supprime une photo du bucket Supabase Storage.
 * @param {string} storagePath - Chemin de la photo dans le bucket 'photos'.
 * @returns {Promise<boolean>} true si la suppression a réussi (HTTP ok).
 */
async function sbDeletePhoto(storagePath) {
  const response = await fetch(`${SUPABASE_URL}/storage/v1/object/photos/${storagePath}`, {
    method:  'DELETE',
    headers: {
      'apikey':        SUPABASE_ANON_KEY,
      'Authorization': `Bearer ${SUPABASE_ANON_KEY}`,
    },
  });
  return response.ok;
}
