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

Application métier de gestion des audits FSQS (Food Safety & Quality Standards) pour des magasins. Mono-fichier HTML à l'origine, refactorisée en multi-fichiers. Fonctionne entièrement en local (localStorage), sans serveur.

---

## Structure des fichiers

```
qualistore/
├── Qualistore.html                   ← Squelette HTML + chargement des scripts
├── css/
│   └── app.css                       ← Tous les styles (193 lignes)
└── js/
    ├── config.js                     ← Constantes globales (LOGO, SK, DPERMS, GRILLE_BASE, QUAL_ZONES, FORMAT_INFO…)
    ├── auth.js                       ← Login/logout, hasPerm(), v(), sv(), el()
    ├── ui.js                         ← Sidebar, navigation, modals, toasts, helpers affichage
    ├── dashboard.js                  ← Page tableau de bord (stats, alertes résumées)
    ├── audits.js                     ← Liste et création des audits FSQS
    ├── nc.js                         ← Non-conformités (liste, création, édition, suivi)
    ├── actions.js                    ← Actions correctives liées aux NC
    ├── magasins.js                   ← Gestion des magasins
    ├── grille.js                     ← Grille d'audit (affichage, personnalisation par rayon)
    ├── alertes.js                    ← Alertes (création, suivi)
    ├── users.js                      ← Gestion des utilisateurs
    ├── rapports-fsqs.js              ← Rapports et exports PDF audits FSQS
    ├── qualimetre.js                 ← Référentiel Qualimètre (questions par zone)
    ├── audit-qualimetre.js           ← Saisie et calcul d'un audit Qualimètre
    ├── rapport-qualimetre.js         ← Rapport et export PDF Qualimètre
    ├── import-grille.js              ← Import grille via CSV / XLSX / PDF
    ├── init.js                       ← Point d'entrée : DOMContentLoaded, loadDB(), navigate()
    └── db/
        └── localStorage/
            └── storage.js            ← Moteur DB : DB (objet mémoire), loadDB(), save(), uid(), CU
```

---

## Ordre de chargement dans Qualistore.html

```html
<!-- Librairies externes -->
jspdf · html2canvas

<!-- Infrastructure (ordre obligatoire) -->
config.js → storage.js → auth.js → ui.js

<!-- Modules métier (ordre libre) -->
dashboard · audits · nc · actions · magasins · grille · alertes
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
| `LOGO_B64` | `config.js` | Logo encodé base64 |
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
  magasins: [],       // { id, nom, rayon, ... }
  audits: [],         // { id, magId, date, rayon, score, items[], ... }
  ncs: [],            // { id, auditId, magId, desc, statut, cmt, ... }
  actions: [],        // { id, ncId, desc, statut, echeance, ... }
  alertes: [],        // { id, titre, desc, statut, ... }
  grilleCustom: {},   // { [rayon]: [{id, cat, q, prec, p, c}] }
  qualimetreCustom:{},// { [rayon]: [...] }
  qualAudits: [],     // Audits Qualimètre
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

- **Pas de serveur** : tout fonctionne en ouvrant `Qualistore.html` directement dans le navigateur.
- **Pas de framework** : JS vanilla pur, pas de React/Vue/Angular.
- **localStorage** : les données sont persistées localement dans le navigateur.
- **Compte par défaut** : login `admin` / mot de passe `admin`.
- **Import lazy** : SheetJS et PDF.js sont chargés à la demande uniquement lors de l'import de grille.
- **Grille d'audit** : `GRILLE_BASE_COMMUNE` est partagée par tous les rayons ; les questions personnalisées sont dans `DB.grilleCustom[rayon]`.

---

## Dépendances entre fichiers

Pour chaque fichier, les fonctions qu'il emprunte à d'autres fichiers. Si tu modifies un fichier, vérifie les fichiers qui en dépendent.

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

### Détail complet des dépendances

**auth.js** utilise : `buildSidebar`, `updateSBUser`, `navigate` ← ui.js

**ui.js** utilise : `hasPerm`, `el` ← auth.js | `showGrille` ← grille.js | `openAlertModal` ← alertes.js | `showQualimetre` ← qualimetre.js | `renderQualAudits` ← audit-qualimetre.js

**dashboard.js** utilise : `el` ← auth.js | `fd`, `sc`, `sbadge`, `overdue`, `rIcon`, `magScore`, `pbar`, `visibleMids` ← ui.js | `showAud` ← audits.js | `renderAlertsDash` ← alertes.js

**audits.js** utilise : `v`, `el` ← auth.js | `fd`, `sc`, `scCls`, `sbadge`, `statBdg`, `critBdg`, `rIcon`, `openModal`, `visibleMids` ← ui.js

**nc.js** utilise : `save` ← storage.js | `v`, `sv`, `el` ← auth.js | `fd`, `today`, `overdue`, `statBdg`, `critBdg`, `rIcon`, `openModal`, `closeModal`, `visibleMids` ← ui.js | `renderActions` ← actions.js

**actions.js** utilise : `save` ← storage.js | `v`, `el` ← auth.js | `fd`, `today`, `overdue`, `statBdg`, `critBdg`, `visibleMids` ← ui.js | `canEditNC`, `renderNC` ← nc.js | `renderAlertsDash` ← alertes.js

**magasins.js** utilise : `save`, `uid` ← storage.js | `hasPerm`, `v`, `sv`, `el` ← auth.js | `sc`, `openModal`, `closeModal`, `magScore`, `pbar`, `visibleMids` ← ui.js

**grille.js** utilise : `save`, `uid` ← storage.js | `v`, `sv`, `el` ← auth.js | `critBdg`, `openModal`, `closeModal` ← ui.js

**alertes.js** utilise : `save` ← storage.js | `v`, `sv`, `el` ← auth.js | `fd`, `today`, `critBdg`, `openModal`, `closeModal`, `visibleMids` ← ui.js | `renderDash` ← dashboard.js

**users.js** utilise : `save`, `uid` ← storage.js | `hasPerm`, `v`, `sv`, `el` ← auth.js | `buildSidebar`, `updateSBUser`, `openModal`, `closeModal` ← ui.js

**rapports-fsqs.js** utilise : `v`, `el` ← auth.js | `fd`, `sc`, `scCls`, `visibleMids` ← ui.js

**qualimetre.js** utilise : `save`, `uid` ← storage.js | `v`, `sv`, `el` ← auth.js | `critBdg`, `openModal`, `closeModal`, `visibleMids` ← ui.js

**audit-qualimetre.js** utilise : `save` ← storage.js | `v`, `sv`, `el` ← auth.js | `fd`, `today`, `statBdg`, `openModal`, `closeModal`, `visibleMids` ← ui.js

**rapport-qualimetre.js** utilise : `save` ← storage.js | `v`, `el` ← auth.js | `fd`, `visibleMids` ← ui.js | `showQualAudit` ← audit-qualimetre.js

**import-grille.js** utilise : `save`, `uid` ← storage.js | `v`, `el` ← auth.js | `critBdg`, `rIcon`, `openModal`, `closeModal` ← ui.js | `showGrille` ← grille.js | `showQualimetre` ← qualimetre.js