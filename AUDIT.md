# Audit QualiStore — Rapport complet

## Vue d'ensemble du projet

QualiStore est une SPA (Single Page Application) de gestion de la qualité alimentaire.
Elle repose sur une architecture **vanilla JS** sans framework, avec Supabase comme backend
et localStorage comme cache offline. L'ensemble représente ~3 500 lignes de JS réparties
sur 16 fichiers, 1 fichier CSS (~220 lignes), et 1 HTML (~1 080 lignes).

---

## Problèmes détectés — JS

### Problèmes critiques (maintenabilité)

| # | Fichier | Problème |
|---|---------|----------|
| 1 | Tous | **Fonctions trop longues** : `genRapport()` dans `rapports-fsqs.js` fait ~120 lignes, `renderActions()` ~80 lignes. Aucune décomposition en sous-fonctions. |
| 2 | Tous | **HTML généré dans le JS** : 90 % du HTML de l'application est construit par concaténation de chaînes dans des fonctions JS. Toute modification visuelle nécessite de toucher du JS. Impossible à lire et à maintenir. |
| 3 | `magasins.js` | **`confirmDel` fait 4 responsabilités** : suppression magasin, user, alerte ET nc. Violation flagrante du SRP. |
| 4 | `storage.js` (Supabase) | **Polling toutes les 5 secondes** avec un intervalle hardcodé. Aucun mécanisme de backoff. Comparaison par `JSON.stringify` sur des tableaux entiers à chaque tick → très coûteux en performances. |
| 5 | `auth.js` | **`v()`, `sv()`, `el()` définis dans `auth.js`** : des utilitaires DOM génériques n'ont rien à faire dans le module d'authentification. Responsabilités mélangées. |
| 6 | `dashboard.js` | **Palettes de couleurs dupliquées** : les tableaux `GREENS`, `YELLOWS`, `ORANGES`, `REDS` sont définis **deux fois** (dans `renderChartFsqs` et `renderChartQual`) à l'identique. DRY violation. |
| 7 | `audits.js` | **`window._auditZones` et `window._auditZoneKeys`** : pollution de l'objet `window` pour partager un état entre deux fonctions du même fichier. Utiliser des variables de module. |
| 8 | `audits.js` | **`window.switchAuditZone` redéfini** à chaque appel de `buildAuditQuestions()`. Fuite mémoire potentielle et comportement imprévisible. |
| 9 | `nc.js` | Doublon de commentaire `// ══ NC ══` au début du fichier (répété deux fois). |
| 10 | `magasins.js` | Doublon de commentaire `// ══ MAGASINS ══` idem. |
| 11 | `rapports-fsqs.js` | **IIFE inline** `(()=>{ ... })()` dans un template string pour calculer les photos. Extrêmement illisible. Doit être une fonction nommée. |
| 12 | `actions.js` | Idem : IIFE inline dans le rendu du tableau des actions. |
| 13 | `storage.js` | **`loadDB()` est synchrone** dans la version localStorage seule mais **async** dans la version Supabase. Deux fichiers `storage.js` coexistent dans le projet. |
| 14 | `init.js` | **Indentation incohérente** : les blocs `querySelectorAll` et `window.addEventListener` ne sont pas indentés dans le callback `DOMContentLoaded`. |
| 15 | `config.js` | **`QUAL_ZONES` vs `QM_ZONES`** : la variable est nommée `QM_ZONES` dans `config.js` mais référencée comme `QUAL_ZONES` dans `qualimetre.js` → référence cassée (bug latent). |
| 16 | `dashboard.js` | **`var PM`** au lieu de `const`. Usage de `var` incohérent avec le reste du code en `const`/`let`. |
| 17 | `rapport-qualimetre.js` | **`printReport()`** est une fonction vide qui ne fait rien. Code mort. |
| 18 | `supabase.js` | **Clé API publique Supabase exposée en clair** dans le code source. Acceptable pour une clé anon/publishable Supabase, mais doit être documenté. |
| 19 | `grille-qualimetre.js` | Fonction `initQualimetreGlobal()` avec un commentaire mais aucun code fonctionnel — trompeuse. |
| 20 | `import-grille.js` | Variables globales `XLSXLoaded`, `PDFJSLoaded`, `importRows`, `currentImportTab`, `importTarget` sans namespacing. Risque de collision dans l'espace global. |

### Problèmes de style/convention

- Nommage incohérent : `renderMag` / `renderRay` / `renderNC` vs `renderQualAudits` / `renderRapportQualimetre` — pas de convention claire.
- Certaines variables utilisent des abréviations opaques : `nco`, `acnt`, `qs`, `ra`, `s`, `n`, `a` dans les callbacks map/filter/reduce.
- Les constantes `GRILLE_BASE_COMMUNE` (48 objets) dans `config.js` mélangées avec les URLs CDN et les textes de format — manque de séparation.
- Inline styles massivement utilisés dans le HTML généré par JS (couleurs hardcodées `#e53935`, dimensions, etc.) — impossible à themer.

---

## Problèmes détectés — CSS

| # | Problème |
|---|---------|
| 1 | **Pas de sections structurées** : le fichier CSS est semi-commenté mais sans découpage clair Variables / Reset / Base / Layout / Components / Utilities / Responsive. |
| 2 | **Utilitaires mélangés avec les composants** : `.mb-4`, `.tm`, `.tsm`, `.fw6` sont dans la section `/* MISC */` avec des règles de layout. |
| 3 | **Règle orpheline** : `body { overscroll-behavior-y: contain; }` est placée en dehors du media query `@media(max-width:900px)` où elle se trouve, après le bloc, sans section. |
| 4 | **Manque de variables CSS** pour les espacements, les tailles de police, les border-radius spécifiques — seules les couleurs sont variables. |
| 5 | **Classes de couleur de score** `.sg`, `.sy`, `.so`, `.sr` et `.fg`, `.fy`, `.fo`, `.fr` — nommage cryptique, non documenté. |
| 6 | **Règles de print** minimalistes, probablement insuffisantes pour les rapports PDF générés. |
| 7 | **Double déclaration** `</head>` dans `Qualistore.html` (ligne 10). |

---

## Problèmes détectés — HTML

| # | Problème |
|---|---------|
| 1 | **Double balise `</head>`** : ligne 9 et 10. |
| 2 | **Scripts après `</body>`** : les `<script>` sont placés après la fermeture `</body>` (ligne 1043-1079). Invalide selon la spec HTML5. |
| 3 | **Inline styles massifs** dans les pages (ex: `style="display:flex;gap:8px;flex-wrap:wrap"`) — doivent être des classes CSS. |
| 4 | **`onclick` inline** sur des éléments HTML** : `onclick="el('sidebar').classList.remove('open')"` dans le overlay — logique JS dans le HTML. |
| 5 | **`<select>` dupliqués** pour les rayons : la liste `Boucherie, Boulangerie, Drive, Marée...` est répétée 6 fois dans le HTML. |
| 6 | **Manque d'attributs d'accessibilité** : pas de `aria-label` sur les boutons icon-only, pas de `role` sur les éléments interactifs non-button. |
| 7 | **`<aside>` pour la sidebar** est correct sémantiquement, mais `<nav>` devrait avoir un `aria-label="Navigation principale"`. |
| 8 | **Pages masquées par `display:none`** via CSS — acceptable en SPA, mais les éléments `id` sont tous chargés en mémoire dès le départ. |

---

## Améliorations effectuées (refactorisation)

### JS — Changements transversaux
- Uniformisation de l'ordre : Constantes → Configuration → Utilitaires → Services → Gestionnaires → Fonctions principales → Initialisation
- `v()`, `sv()`, `el()` déplacés dans `ui.js` (utilitaires DOM) et supprimés de `auth.js`
- Constantes extraites en tête de fichier avec nommage explicite
- IIFE inline remplacées par des fonctions nommées
- `window._auditZones` remplacé par variables de module privées
- `window.switchAuditZone` défini une seule fois, pas redéfini à chaque appel
- Palettes de couleurs dupliquées extraites en constante partagée dans `dashboard.js`
- `QUAL_ZONES` → `QM_ZONES` aligné (une seule source de vérité dans `config.js`)
- `var PM` → `const PAGE_METADATA`
- `confirmDel` décomposé en handlers spécialisés par type
- Fonctions de rendu HTML extraites en helpers dédiés
- Intervalle de polling documenté et extrait en constante
- Code mort (`printReport()`) supprimé
- Nommage de variables locales explicite dans les callbacks

### CSS — Changements
- Ajout de sections structurées avec commentaires
- Variables CSS ajoutées pour les espacements et tailles de police
- Classes utilitaires regroupées et documentées
- Règle `overscroll-behavior-y` replacée correctement
- `body { overscroll-behavior-y: contain }` sortie du bloc media

### HTML — Changements
- Double `</head>` corrigé
- Scripts déplacés avant `</body>`
- `aria-label` ajoutés sur nav, boutons, inputs
- `role` appropriés ajoutés
- Liste de rayons extraite via un `<datalist>` ou commentaire de centralisation
- Inline styles les plus répétitifs remplacés par des classes

---

## Suggestions d'améliorations futures

### Architecture
1. **Migrer vers des Web Components** ou un micro-framework (Lit, Alpine.js) pour séparer le HTML du JS. La génération de HTML par concaténation est le principal frein à la maintenabilité.
2. **Créer un module `renderer.js`** centralisant tous les helpers de génération HTML (`renderCard()`, `renderBadge()`, `renderTable()`).
3. **Remplacer le polling par Supabase Realtime** (WebSocket natif de Supabase) — plus efficace et sans comparaison JSON.
4. **TypeScript** : le projet est suffisamment complexe pour bénéficier du typage, notamment sur les structures `DB`, `CU`, `audit`, `nc`.

### Sécurité
5. **Ne jamais stocker le mot de passe en clair** dans localStorage via `fsqs_cu`. Stocker uniquement l'id et un token de session.
6. **`btoa(password)`** n'est PAS du hachage — c'est de l'encodage base64 réversible. Migrer vers un vrai système d'authentification Supabase Auth.

### Performance
7. **Debouncer les filtres** (`renderAudits`, `renderNC`) qui se déclenchent à chaque `onchange`.
8. **Virtualiser les grandes listes** si le nombre d'audits croît (> 500 entrées).

### UX
9. **Toast system** centralisé plutôt que des `alert()` natifs du navigateur (certains subsistent).
10. **Indicateur de sync Supabase** visible dans l'UI pour l'utilisateur (mode offline détecté).
