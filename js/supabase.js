// ══════════════════════════════════════════════════════════════
// SUPABASE — Client HTTP bas niveau
// Responsabilité unique : encapsuler les appels vers l'API Supabase.
// Aucune logique métier ici.
//
// ⚠️ CHANGÉ (migration Supabase Auth, étape 2/8 — voir le plan) :
// remplace les appels fetch() manuels par le SDK officiel
// @supabase/supabase-js (chargé en CDN dans index.html /
// Qualistore.html, avant ce script — voir window.supabase).
// Nécessaire pour que chaque requête vers vos tables porte
// automatiquement le jeton de session du vrai utilisateur connecté
// (via Supabase Auth), condition indispensable pour que les policies
// RLS basées sur auth.uid() (voir 01-profiles-et-policies.sql)
// puissent enfin distinguer un utilisateur légitime d'un autre.
//
// Les signatures publiques (sbSelect, sbUpsert, sbDeleteWhere,
// sbUploadPhoto, sbDeletePhoto) sont strictement inchangées : aucun
// autre fichier du projet n'a besoin d'être modifié pour ce point.
// Nouveau : _sb, le client exporté, utilisé par auth.js pour la
// connexion / déconnexion / réinitialisation de mot de passe.
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
// 2. CLIENT SUPABASE-JS
// ─────────────────────────────────────────────

if (typeof window.supabase === 'undefined' || !window.supabase.createClient) {
  throw new Error(
    "supabase.js : le SDK @supabase/supabase-js n'est pas chargé. " +
    "Vérifiez que le <script src=\".../supabase-js@2/dist/umd/supabase.js\"> " +
    "est bien présent AVANT <script src=\"js/supabase.js\"> dans le HTML."
  );
}

/**
 * Client Supabase partagé par toute l'application (persistance de
 * session activée : le jeton survit à un rechargement de page, et se
 * rafraîchit automatiquement avant expiration).
 * @type {import('@supabase/supabase-js').SupabaseClient}
 */
const _sb = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
  auth: {
    persistSession: true,
    autoRefreshToken: true,
  },
});

// ─────────────────────────────────────────────
// 3. API PUBLIQUE — signatures inchangées
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
 * @returns {Promise<SupabaseRow[]|null|undefined>} Les lignes insérées/
 *   mises à jour, ou undefined si `rows` est vide/absent, ou null en
 *   cas d'erreur.
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

  const { data, error } = await _sb
    .from(table)
    .upsert(normalizedRows, { onConflict: 'id' })
    .select();

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
 *
 * Le try/catch couvre à la fois les erreurs HTTP (réponse reçue mais
 * en échec) et les erreurs réseau (connexion instable, coupure
 * momentanée) — distinction déjà nécessaire avant ce correctif pour
 * ne pas interrompre une boucle d'upload de plusieurs photos
 * (handleAuditPhoto, audits.js ; handleQaPhoto, audit-qualimetre.js ;
 * handleAlertPhotos, alertes.js).
 * @param {File|Blob} file - Fichier image à uploader (doit exposer `.type`).
 * @param {string} storagePath - Chemin de destination dans le bucket 'photos'.
 * @returns {Promise<string|null>}
 */
async function sbUploadPhoto(file, storagePath) {
  try {
    const { error } = await _sb.storage
      .from('photos')
      .upload(storagePath, file, { contentType: file.type, upsert: true });

    if (error) {
      console.error('Upload photo échoué pour :', storagePath, error.message);
      return null;
    }

    const { data } = _sb.storage.from('photos').getPublicUrl(storagePath);
    return data.publicUrl;
  } catch (err) {
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
