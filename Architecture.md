# QualiStore — Architecture du projet

> **Usage** : colle ce fichier en début de conversation avec Claude avant tout correctif ou modification. Il lui évite de devoir relire tout le code.

---

## Instructions pour Claude

- **L'utilisateur ne sait pas coder** mais peut créer et modifier des fichiers si on lui explique exactement quoi faire (quel fichier ouvrir, quoi remplacer, quoi coller).
- **Économiser les tokens** : aller droit au but, pas de blabla inutile. Pour les correctifs, donner uniquement le bloc de code modifié avec les lignes de contexte nécessaires pour le localiser, pas le fichier entier.
- Pour les fichiers à télécharger, utiliser `present_files` et expliquer où le placer.
- Si une modification touche plusieurs fichiers, les traiter un par un avec confirmation entre chaque.
- Toujours garder ce fichier à jour après chaque modification.

---

## Contexte

Application métier de gestion des audits FSQS (Food Safety & Quality Standards) pour des magasins. Refactorisée en multi-fichiers. Hébergée sur GitHub Pages (https://qualistore.github.io/Qualistore/). Fonctionne avec Supabase (backend) + localStorage (cache offline).

---

## Structure des fichiers

```
qualistore/
├── Qualistore.html                   ← Squelette HTML + chargement des scripts
├── assets/
│   ├── logo.png                      ← Logo de l'application
│   ├── bienvenue-qualimetre.pdf      ← Affiché à l'étape 0 du modal Qualimètre
│   └── referentiel-affichage.pdf     ← Bouton dans le header du modal pendant l'audit
├── css/
│   └── app.css                       ← Tous les styles (responsive mobile/tablette inclus)
└── js/
    ├── config.js                     ← Constantes globales (LOGO_B64, SK, DPERMS, PIDS, GRILLE_BASE_COMMUNE, QUAL_ZONES, FORMAT_INFO, SHEETJS_URL, PDFJS_URL)
    ├── auth.js                       ← Login/logout, hasPerm(), v(), sv(), el() — persiste CU dans localStorage
    ├── ui.js                         ← Sidebar, navigation, modals, toasts, helpers affichage
    ├── dashboard.js                  ← Tableau de bord FSQS + Qualimètre (onglets switchDashTab)
    ├── audits.js                     ← Liste, création, navigation modal audit FSQS (openAuditModal, auditNext, auditPrev, submitAudit, pauseAudit, resumeDraft)
    ├── nc.js                         ← Non-conformités (liste, création, édition, suivi)
    ├── actions.js                    ← Actions correctives liées aux NC
    ├── magasins.js                   ← Gestion des magasins + confirmDel (global)
    ├── rayons.js                     ← Page Rayons (performances par rayon)
    ├── grille.js                     ← Grille d'audit (affichage, personnalisation par rayon)
    ├── alertes.js                    ← Alertes (création, suivi) — photos uploadées dans Supabase Storage
    ├── users.js                      ← Gestion des utilisateurs + roleBdg (global)
    ├── rapports-fsqs.js              ← Rapports et exports PDF audits FSQS + suppression admin
    ├── qualimetre.js                 ← Référentiel Qualimètre (questions par zone)
    ├── audit-qualimetre.js           ← Saisie et calcul d'un audit Qualimètre (pauseQualAudit, resumeQualDraft)
    ├── rapport-qualimetre.js         ← Rapport et export PDF Qualimètre + suppression admin
    ├── import-grille.js              ← Import grille via CSV / XLSX / PDF
    ├── init.js                       ← Point d'entrée : DOMContentLoaded, loadDB(), navigate(), beforeunload
    ├── chart.umd.min.js              ← Chart.js (local, pour les graphiques)
    ├── html2canvas.min.js            ← html2canvas (local, pour exports PDF)
    ├── jspdf.umd.min.js              ← jsPDF (local, pour exports PDF)
    └── db/
        ├── localstorage/
        │   └── storage.js            ← Ancien moteur (non utilisé)
        └── supabase/
            └── storage.js            ← Moteur DB : DB (objet mémoire), loadDB(), save(tables?), uid(), CU
    └── services/
        └── supabase.js               ← Client Supabase : supaFetch, sbSelect, sbUpsert, sbDeleteWhere, sbUploadPhoto, sbDeletePhoto
```

---

## Ordre de chargement dans Qualistore.html

```html
<!-- Librairies externes (locales) -->
js/jspdf.umd.min.js · js/html2canvas.min.js · js/chart.umd.min.js

<!-- Infrastructure (ordre obligatoire) -->
config.js → js/services/supabase.js → js/db/supabase/storage.js → auth.js → ui.js

<!-- Modules métier (ordre libre) -->
dashboard · audits · nc · actions · magasins · rayons · grille · alertes
users · rapports-fsqs · qualimetre · audit-qualimetre
rapport-qualimetre · import-grille

<!-- Point d'entrée (en dernier) -->
init.js
```

---

## Variables globales clés

| Variable | Définie dans | Rôle |
|---|---|---|
| `SK` | `config.js` | Clé localStorage (`'fsqs_v2'`) |
| `DB` | `storage.js` | Objet en mémoire (toute la base de données) |
| `CU` | `storage.js` | Utilisateur connecté (Current User) |
| `LOGO_B64` | `config.js` | Chemin vers le logo (`assets/logo.png`) |
| `DPERMS` | `config.js` | Permissions par rôle |
| `PIDS` | `config.js` | Liste des IDs de permissions |
| `GRILLE_BASE_COMMUNE` | `config.js` | 48 questions d'audit communes à tous les rayons |
| `QUAL_ZONES` | `config.js` | Zones et points du Qualimètre |
| `SHEETJS_URL` / `PDFJS_URL` | `config.js` | CDN pour import CSV/XLSX/PDF |
| `FORMAT_INFO` | `config.js` | Textes d'aide pour l'import |

---

## Structure de DB (localStorage)

```js
DB = {
  users: [],          // { id, nom, login, pwd (btoa), role, statut, magasins[], perms{} }
  magasins: [],       // { id, nom, ville, enseigne, adr, statut, did }
  audits: [],         // { id, mid, mag, rayon, date, aud, score, nc, items[], cmt, answers{}, statut }
  ncs: [],            // { id, mid, mag, rayon, date, desc, crit, resp, dl, statut, cmt, aid, isAlert, closedDate }
  actions: [],        // { id, ncId, desc, mag, resp, ech, prio, statut, alertId, cmt }
  alertes: [],        // { id, mid, mag, titre, type, gravite, signale, cmt, photos[], date, statut }
  grilleCustom: {},   // { [rayon]: [{id, cat, q, prec, p, c}] }
  qualimetreCustom:{},// { [mid]: { [rayon]: [...] } }
  qualAudits: [],     // { id, mid, mag, date, aud, cmt, score, nc, statut, answers{} }
  drafts: [],         // { id, mid, mag, rayon, date, aud, cmt, answers{}, createdAt, uid, type? }
}
```

---

## Rôles utilisateurs

| Rôle | Label affiché | Permissions |
|---|---|---|
| `admin` | Administrateur | Tout |
| `fsqs` | Auditeur FSQS | Audits, NC, actions, rapports, grille |
| `directeur` | Directeur | Lecture audits, actions, rapports |
| `direction` | Associé | Lecture audits, rapports |

---

## Sidebar — visibilité des onglets

- **Magasins** et **Rayons** : visibles uniquement si `hasPerm('mag')` (admin uniquement par défaut)
- **Brouillons** : visible si `hasPerm('aud-w')` — admin voit tous les brouillons, les autres voient uniquement les leurs
- **Audit Qualimètre** : visible par tous les rôles
- **Nouvel audit Qualimètre** : bouton dans le bandeau du haut (violet), à côté de Nouvel audit
- Burger menu mobile : toggle `sidebar.open` + overlay `sb-overlay`

---

## Dashboard — onglets FSQS / Qualimètre

- Deux onglets dans le tableau de bord : FSQS et Qualimètre
- `switchDashTab(tab)` dans `dashboard.js` gère la bascule
- Panneau FSQS : `id="dash-fsqs"` | Panneau Qualimètre : `id="dash-qual"`
- Graphiques en **barres** (Chart.js) dans les deux onglets — **moyenne des scores par magasin**
- Code couleur des barres : vert ≥90%, jaune 75-89%, orange 60-74%, rouge <60%
- `renderDashQual()` alimente les stats Qualimètre (dq-audits, dq-nc, dq-score, dq-mags, dq-mag, dq-zones, dq-last)
- `buildBarChart(canvasId, labels, data, colors, chartRef)` dans `dashboard.js` — génère un graphique en barres

---

## Modal Audit Qualimètre

- **Étape 0** : page d'accueil avec instructions (contenu du PDF bienvenue-qualimetre.pdf)
- **Étape 1** : saisie magasin, date, auditeur
- **Étape 2** : questions par zone avec onglets. Bouton "Référentiel affichage" dans le header ouvre `assets/referentiel-affichage.pdf` dans un nouvel onglet
- **Étape 3** : résultat et score final
- ID de la modal : `m-qual-audit` | ID détail : `m-qual-audit-detail`

---

## Fonctions globales importantes

| Fonction | Définie dans | Rôle |
|---|---|---|
| `confirmDel(type, id, nom)` | `magasins.js` | Suppression avec modal de confirmation (types : mag, user, alert, nc) |
| `roleBdg(r)` | `users.js` | Génère le badge HTML pour un rôle |
| `openAuditModal()` | `audits.js` | Ouvre le modal de création d'audit FSQS |
| `auditNext()` / `auditPrev()` | `audits.js` | Navigation dans le modal audit FSQS |
| `submitAudit()` | `audits.js` | Enregistre l'audit FSQS et génère les NC + actions |
| `pauseAudit()` | `audits.js` | Sauvegarde brouillon FSQS et ferme le modal |
| `resumeDraft(id)` | `audits.js` | Reprend un brouillon FSQS |
| `deleteAudit(id)` | `audits.js` | Supprime un audit et ses NC/actions associées |
| `openQualAuditModal()` | `audit-qualimetre.js` | Ouvre le modal de création d'audit Qualimètre |
| `pauseQualAudit()` | `audit-qualimetre.js` | Sauvegarde brouillon Qualimètre et ferme le modal |
| `resumeQualDraft(id)` | `audit-qualimetre.js` | Reprend un brouillon Qualimètre |
| `openPhotoViewer(url)` | `audits.js` | Affiche une photo en plein écran |
| `handleAuditPhoto(qid, input)` | `audits.js` | Upload photo vers Supabase Storage pour un point de contrôle |
| `renderDrafts()` | `audits.js` | Affiche la liste des brouillons |

---

## Fonctions utilitaires globales (auth.js)

| Fonction | Rôle |
|---|---|
| `el(id)` | `document.getElementById(id)` |
| `v(id)` | Lire la valeur d'un champ |
| `sv(id, val)` | Écrire la valeur d'un champ |
| `hasPerm(p)` | Vérifier si CU a la permission `p` |

---

## Fonctions utilitaires globales (ui.js)

| Fonction | Rôle |
|---|---|
| `navigate(page)` | Changer de page (masque/affiche les sections) |
| `openModal(id)` | Ouvrir une modal |
| `closeModal(id)` | Fermer une modal |
| `showToast(msg, type)` | Afficher une notification |
| `buildSidebar()` | Reconstruire la sidebar selon les perms |
| `updateSBUser()` | Mettre à jour l'affichage utilisateur dans la sidebar |
| `roleBdg(r)` | Retourner le badge HTML pour un rôle |

---

## Notes importantes

- **GitHub Pages** : l'appli est hébergée publiquement sur https://qualistore.github.io/Qualistore/
- **Pas de framework** : JS vanilla pur, pas de React/Vue/Angular.
- **Supabase** : base de données principale. localStorage = cache offline. Sync automatique toutes les 10s (polling).
- **Offline** : l'appli fonctionne sans connexion. Les données sont poussées vers Supabase dès que la connexion revient.
- **Compte par défaut** : login `admin` / mot de passe `admin`.
- **Session persistante** : CU sauvegardé dans `localStorage` (`fsqs_cu`). Restauré au démarrage — pas de déconnexion au F5.
- **Pull-to-refresh désactivé** sur mobile (`overscroll-behavior-y: contain`).
- **beforeunload** : si un audit est en cours (step 1 ou 2), il est automatiquement mis en pause.
- **Photos** : uploadées dans Supabase Storage bucket `photos`. Dossier `alertes/` pour les alertes, `audits/` pour les points de contrôle. URLs publiques stockées dans DB.
- **IDs** : tous générés via `uid()` (timestamp+random) — plus de compteurs nAud/nNc/nAc/nQAud.
- **Brouillons** (`DB.drafts`) : table Supabase `drafts`. Champ `type='qualimetre'` pour distinguer les brouillons Qualimètre. Admin voit tous les brouillons, les autres voient uniquement les leurs.
- **Suppression audits** : admin peut supprimer des audits depuis les pages Rapports FSQS et Rapport Qualimètre. Supprime aussi les NC et actions liées.
- **Date d'audit** : pré-remplie avec la date du jour, modifiable uniquement par admin.
- **GRILLE_BASE_COMMUNE** : dans `config.js` uniquement.
- **QUAL_ZONES** : dans `config.js` uniquement.
- **DPERMS / PIDS** : dans `config.js` uniquement.
- **FORMAT_INFO / SHEETJS_URL / PDFJS_URL** : dans `config.js` uniquement.
- **confirmDel** : définie dans `magasins.js`, types : `mag`, `user`, `alert`, `nc`. Supprime aussi les photos Supabase Storage pour les alertes.
- **roleBdg** : définie dans `users.js`.
- **Permission `aud-w`** : contrôle création audits FSQS ET Qualimètre.
- **Permission `rap`** : contrôle accès rapports FSQS ET Qualimètre.

---

## Supabase

- URL : `https://jztacnkvmuhouhhapjen.supabase.co`
- Clé publique : `sb_publishable_HuVt2NSLrCfUvKcgXI7Byg_Jkq96fB9`
- Tables : users, magasins, audits, ncs, actions, alertes, grille_custom, qual_audits, qualimetre_custom, drafts
- Storage bucket : `photos` (public) — dossiers `alertes/` et `audits/`
- Toutes les tables sont sans RLS (sécurité gérée côté application)
- `save(tables?)` : sans argument = pousse tout ; avec tableau = pousse uniquement les tables listées
- Polling toutes les 10s pour synchroniser les données entre sessions

---

## Dépendances entre fichiers

| Fichier modifié | Fichiers potentiellement impactés |
|---|---|
| `config.js` | Tous (variables globales) |
| `storage.js` | Tous (DB, CU, save, uid) |
| `auth.js` | Tous (hasPerm, el, v, sv) |
| `ui.js` | Tous les modules métier |
| `dashboard.js` | `alertes.js` (appelle renderDash) |
| `audits.js` | `dashboard.js` (appelle showAud) |
| `nc.js` | `actions.js` (appelle canEditNC, renderNC) |
| `actions.js` | `nc.js` (appelle renderActions) |
| `grille.js` | `ui.js` (appelle showGrille), `import-grille.js` |
| `alertes.js` | `ui.js` (appelle openAlertModal), `dashboard.js`, `actions.js` |
| `qualimetre.js` | `ui.js` (appelle showQualimetre), `import-grille.js` |
| `audit-qualimetre.js` | `ui.js` (appelle renderQualAudits), `rapport-qualimetre.js` |
| `magasins.js` | `users.js`, `alertes.js` (confirmDel utilisée pour supprimer users et alertes) |

### Détail complet des dépendances

**auth.js** utilise : `buildSidebar`, `updateSBUser`, `navigate` ← ui.js

**ui.js** utilise : `hasPerm`, `el` ← auth.js | `showGrille` ← grille.js | `openAlertModal` ← alertes.js | `showQualimetre` ← qualimetre.js | `renderQualAudits` ← audit-qualimetre.js

**dashboard.js** utilise : `el` ← auth.js | `fd`, `sc`, `sbadge`, `overdue`, `rIcon`, `magScore`, `pbar`, `visibleMids` ← ui.js | `showAud` ← audits.js | `renderAlertsDash` ← alertes.js

**audits.js** utilise : `v`, `el` ← auth.js | `fd`, `sc`, `scCls`, `sbadge`, `statBdg`, `critBdg`, `rIcon`, `openModal`, `closeModal`, `visibleMids`, `today` ← ui.js | `getGrille` ← grille.js

**nc.js** utilise : `save` ← storage.js | `v`, `sv`, `el` ← auth.js | `fd`, `today`, `overdue`, `statBdg`, `critBdg`, `rIcon`, `openModal`, `closeModal`, `visibleMids` ← ui.js | `renderActions` ← actions.js

**actions.js** utilise : `save` ← storage.js | `v`, `el` ← auth.js | `fd`, `today`, `overdue`, `statBdg`, `critBdg`, `visibleMids` ← ui.js | `canEditNC`, `renderNC` ← nc.js | `renderAlertsDash` ← alertes.js

**magasins.js** utilise : `save`, `uid` ← storage.js | `hasPerm`, `v`, `sv`, `el` ← auth.js | `sc`, `openModal`, `closeModal`, `magScore`, `pbar`, `visibleMids` ← ui.js | expose `confirmDel` (utilisée par magasins, users, alertes)

**rayons.js** utilise : `el` ← auth.js | `fd`, `sc`, `rIcon`, `pbar`, `visibleMids` ← ui.js

**grille.js** utilise : `save`, `uid` ← storage.js | `v`, `sv`, `el` ← auth.js | `critBdg`, `openModal`, `closeModal` ← ui.js

**alertes.js** utilise : `save` ← storage.js | `v`, `sv`, `el` ← auth.js | `fd`, `today`, `critBdg`, `openModal`, `closeModal`, `visibleMids` ← ui.js | `renderDash` ← dashboard.js

**users.js** utilise : `save`, `uid` ← storage.js | `hasPerm`, `v`, `sv`, `el` ← auth.js | `buildSidebar`, `updateSBUser`, `openModal`, `closeModal` ← ui.js | expose `roleBdg`

**rapports-fsqs.js** utilise : `v`, `el` ← auth.js | `fd`, `sc`, `scCls`, `visibleMids` ← ui.js

**qualimetre.js** utilise : `save`, `uid` ← storage.js | `v`, `sv`, `el` ← auth.js | `critBdg`, `openModal`, `closeModal`, `visibleMids` ← ui.js

**audit-qualimetre.js** utilise : `save` ← storage.js | `v`, `sv`, `el` ← auth.js | `fd`, `today`, `statBdg`, `openModal`, `closeModal`, `visibleMids` ← ui.js

**rapport-qualimetre.js** utilise : `save` ← storage.js | `v`, `el` ← auth.js | `fd`, `visibleMids` ← ui.js | `showQualAudit` ← audit-qualimetre.js

**import-grille.js** utilise : `save`, `uid` ← storage.js | `v`, `el` ← auth.js | `critBdg`, `rIcon`, `openModal`, `closeModal` ← ui.js | `showGrille` ← grille.js | `showQualimetre` ← qualimetre.js
