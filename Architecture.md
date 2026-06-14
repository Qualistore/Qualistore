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

Application métier de gestion des audits FSQS (Food Safety & Quality Standards) pour des magasins. Refactorisée en multi-fichiers. Hébergée sur GitHub Pages (https://falves1995.github.io/QualistoreV2/Qualistore.html). Fonctionne avec localStorage (migration Supabase prévue).

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
│   └── app.css                       ← Tous les styles
└── js/
    ├── config.js                     ← Constantes globales (LOGO_B64, SK, DPERMS, PIDS, GRILLE_BASE_COMMUNE, QUAL_ZONES, FORMAT_INFO, SHEETJS_URL, PDFJS_URL)
    ├── auth.js                       ← Login/logout, hasPerm(), v(), sv(), el()
    ├── ui.js                         ← Sidebar, navigation, modals, toasts, helpers affichage
    ├── dashboard.js                  ← Tableau de bord FSQS + Qualimètre (onglets switchDashTab)
    ├── audits.js                     ← Liste, création, navigation modal audit FSQS (openAuditModal, auditNext, auditPrev, submitAudit)
    ├── nc.js                         ← Non-conformités (liste, création, édition, suivi)
    ├── actions.js                    ← Actions correctives liées aux NC
    ├── magasins.js                   ← Gestion des magasins + confirmDel (global)
    ├── rayons.js                     ← Page Rayons (performances par rayon)
    ├── grille.js                     ← Grille d'audit (affichage, personnalisation par rayon)
    ├── alertes.js                    ← Alertes (création, suivi)
    ├── users.js                      ← Gestion des utilisateurs + roleBdg (global)
    ├── rapports-fsqs.js              ← Rapports et exports PDF audits FSQS
    ├── qualimetre.js                 ← Référentiel Qualimètre (questions par zone)
    ├── audit-qualimetre.js           ← Saisie et calcul d'un audit Qualimètre
    ├── rapport-qualimetre.js         ← Rapport et export PDF Qualimètre
    ├── import-grille.js              ← Import grille via CSV / XLSX / PDF
    ├── init.js                       ← Point d'entrée : DOMContentLoaded, loadDB(), navigate()
    ├── chart.umd.min.js              ← Chart.js (local, pour les graphiques)
    ├── html2canvas.min.js            ← html2canvas (local, pour exports PDF)
    ├── jspdf.umd.min.js              ← jsPDF (local, pour exports PDF)
    └── db/
        └── localstorage/
            └── storage.js            ← Moteur DB : DB (objet mémoire), loadDB(), save(), uid(), CU
```

---

## Ordre de chargement dans Qualistore.html

```html
<!-- Librairies externes (locales) -->
js/jspdf.umd.min.js · js/html2canvas.min.js · js/chart.umd.min.js

<!-- Infrastructure (ordre obligatoire) -->
config.js → db/localstorage/storage.js → auth.js → ui.js

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
  audits: [],         // { id, mid, mag, rayon, date, aud, score, nc, items[], cmt, answers{} }
  ncs: [],            // { id, mid, mag, rayon, date, desc, crit, resp, dl, statut, cmt, aid, isAlert }
  actions: [],        // { id, ncId, desc, mag, resp, ech, prio, statut, alertId }
  alertes: [],        // { id, mid, mag, titre, type, gravite, signale, cmt, photos[], date, statut }
  grilleCustom: {},   // { [rayon]: [{id, cat, q, prec, p, c}] }
  qualimetreCustom:{},// { [mid]: { [rayon]: [...] } }
  qualAudits: [],     // { id, mid, mag, date, aud, cmt, score, nc, statut, answers{} }
  nAud:1, nNc:1, nAc:1, nAl:1, nQAud:1  // Compteurs auto-incrément
}
```

---

## Rôles utilisateurs

| Rôle | Label affiché | Permissions |
|---|---|---|
| `admin` | Administrateur | Tout |
| `fsqs` | Resp. FSQS | Audits, NC, actions, rapports, grille |
| `directeur` | Directeur | Lecture audits, actions, rapports |
| `direction` | Associé | Lecture audits, rapports |

---

## Sidebar — visibilité des onglets

- **Magasins** et **Rayons** : visibles uniquement si `hasPerm('mag')` (admin uniquement par défaut), placés sous Grille d'audit dans Paramètres
- **Audit Qualimètre** : visible par tous les rôles
- **Nouvel audit Qualimètre** : bouton dans le bandeau du haut (violet), à côté de Nouvel audit

---

## Dashboard — onglets FSQS / Qualimètre

- Deux onglets dans le tableau de bord : FSQS et Qualimètre
- `switchDashTab(tab)` dans `dashboard.js` gère la bascule
- Panneau FSQS : `id="dash-fsqs"` | Panneau Qualimètre : `id="dash-qual"`
- Graphiques linéaires (Chart.js) dans les deux onglets — score par magasin trié par ID d'audit
- `renderDashQual()` alimente les stats Qualimètre (dq-audits, dq-nc, dq-score, dq-mags, dq-mag, dq-zones, dq-last)

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
| `confirmDel(type, id, nom)` | `magasins.js` | Suppression avec modal de confirmation (types : mag, user, alert) |
| `roleBdg(r)` | `users.js` | Génère le badge HTML pour un rôle |
| `openAuditModal()` | `audits.js` | Ouvre le modal de création d'audit FSQS |
| `auditNext()` / `auditPrev()` | `audits.js` | Navigation dans le modal audit FSQS |
| `submitAudit()` | `audits.js` | Enregistre l'audit FSQS et génère les NC |
| `deleteAudit(id)` | `audits.js` | Supprime un audit et ses NC associées |
| `openQualAuditModal()` | `audit-qualimetre.js` | Ouvre le modal de création d'audit Qualimètre |

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

- **GitHub Pages** : l'appli est hébergée publiquement, toutes les librairies JS sont en local (pas de CDN) pour éviter les blocages CORS.
- **Pas de framework** : JS vanilla pur, pas de React/Vue/Angular.
- **localStorage** : les données sont persistées localement dans le navigateur (migration Supabase prévue).
- **Compte par défaut** : login `admin` / mot de passe `admin`.
- **Import lazy** : SheetJS et PDF.js sont chargés à la demande (CDN) uniquement lors de l'import de grille.
- **GRILLE_BASE_COMMUNE** : dans `config.js` uniquement — ne pas redéclarer dans d'autres fichiers.
- **QUAL_ZONES** : dans `config.js` uniquement — ne pas redéclarer dans `audit-qualimetre.js`.
- **DPERMS / PIDS** : dans `config.js` uniquement — ne pas redéclarer dans `users.js`.
- **FORMAT_INFO / SHEETJS_URL / PDFJS_URL** : dans `config.js` uniquement — ne pas redéclarer dans `import-grille.js`.
- **confirmDel** : définie dans `magasins.js`, utilisée globalement.
- **roleBdg** : définie dans `users.js`, utilisée globalement.
- **Modal Qualimètre** : étape 0 affiche le contenu de bienvenue-qualimetre.pdf. Pendant l'audit (étape 2), bouton dans le header ouvre referentiel-affichage.pdf dans un nouvel onglet.
- `confirmDel` : définie dans `magasins.js`, utilisée globalement pour supprimer magasins, users et alertes.
- `roleBdg` : définie dans `users.js`, génère les badges de rôle.
- `openAuditModal`, `auditNext`, `auditPrev`, `buildAuditQuestions`, `submitAudit` : définis dans `audits.js`.

---

## Supabase (migration prévue)

- URL : `https://jztacnkvmuhouhhapjen.supabase.co`
- Clé publique : `sb_publishable_HuVt2NSLrCfUvKcgXI7Byg_Jkq96fB9`
- Tables créées : users, magasins, audits, ncs, actions, alertes, grille_custom, qual_audits, qualimetre_custom, counters
- La migration implique de rendre toutes les opérations asynchrones (await)

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
