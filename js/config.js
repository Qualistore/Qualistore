// ══════════════ CONFIG — QualiStore ══════════════
// Ce fichier regroupe toutes les constantes globales.

const LOGO_B64="assets/logo.png";
const SK='fsqs_v2';

// ══════════════ STORAGE ══════════════

const DPERMS={
  admin:     {'aud-r':1,'aud-w':1,'nc':1,'ac':1,'mag':1,'rap':1,'grille':1,'usr':1},
  fsqs:      {'aud-r':1,'aud-w':1,'nc':1,'ac':1,'mag':0,'rap':1,'grille':1,'usr':0},
  directeur: {'aud-r':1,'aud-w':0,'nc':0,'ac':1,'mag':0,'rap':1,'grille':0,'usr':0},
  direction:     {'aud-r':1,'aud-w':0,'nc':0,'ac':0,'mag':0,'rap':1,'grille':0,'usr':0},
  collaborateur: {'aud-r':0,'aud-w':1,'nc':0,'ac':0,'mag':0,'rap':0,'grille':0,'usr':0}
};
const PIDS=['aud-r','aud-w','nc','ac','mag','rap','grille','usr'];

const GRILLE_BASE_COMMUNE=[
  // ── Zone : STOCKAGE / ATELIER ──
  {id:'xl-1', cat:'Stockage – Equipement', q:'Conformité des matériaux au contact des aliments', prec:'Absence de bois', p:5, c:'Majeure'},
  {id:'xl-2', cat:'Stockage – Equipement', q:'Présence de lave-mains accessibles, conformes propres et approvisionnés', prec:'Distributeurs approvisionné et propreté', p:5, c:'Majeure'},
  {id:'xl-3', cat:'Stockage – Nettoyage', q:'Propreté locaux et équipements sans contact avec les aliments', prec:'Plafonds, murs, étagères, sol, poignées de porte, grille des évaporateurs…', p:5, c:'Majeure'},
  {id:'xl-4', cat:'Stockage – Nettoyage', q:'Propreté du matériel en contact direct avec les aliments et à risque sanitaire', prec:'Cuillères, pinces, saladières, plateaux, couteaux, etc.', p:5, c:'Majeure'},
  {id:'xl-5', cat:'Stockage – Personnel', q:'Propreté et conformité de la tenue', prec:'Badge, calot, coiffe, tablier, veste, chaussures de sécurité, etc.', p:5, c:'Majeure'},
  {id:'xl-6', cat:'Stockage – Méthode', q:'Protection des produits', prec:'Produit protégé – Absence de matériaux polluants si présence de produit nu (bois, cartons)', p:5, c:'Majeure'},
  {id:'xl-7', cat:'Stockage – Méthode', q:'Séparation des denrées alimentaires de natures différentes', prec:'En stockage et zone de préparation : cru/cuit, emballé/nu, familles différentes', p:5, c:'Majeure'},
  {id:'xl-8', cat:'Stockage – Méthode', q:'Absence de contaminations croisées pouvant entraîner un risque sanitaire direct', prec:'En stockage et zone de préparation', p:10, c:'Critique'},
  {id:'xl-9', cat:'Stockage – Méthode', q:'Conditions de déconditionnement / déballage / décartonnage satisfaisantes', prec:'', p:5, c:'Majeure'},
  {id:'xl-10', cat:'Stockage – Méthode', q:'Conditions de décongélation satisfaisantes', prec:'Dans un local à une température entre 0 et +4°C', p:5, c:'Majeure'},
  {id:'xl-11', cat:'Stockage – Méthode', q:'Respect du protocole de décontamination des végétaux', prec:'10% vinaigre durant 15 min', p:5, c:'Majeure'},
  {id:'xl-12', cat:'Stockage – Méthode', q:'Rotation des produits — Respect du FIFO', prec:'En stockage', p:5, c:'Majeure'},
  {id:'xl-13', cat:'Stockage – Méthode', q:'Bonne réalisation des opérations de cuisson / remise en température', prec:'Remise en T°C : en moins d\'1h à +63°C (charcuterie) et +83°C (poulets)', p:5, c:'Majeure'},
  {id:'xl-14', cat:'Stockage – Date', q:'Respect des DLC/DUR/DDM des ingrédients', prec:'', p:10, c:'Critique'},
  {id:'xl-15', cat:'Stockage – Température', q:'Absence de rupture de la chaîne du froid ou du chaud pouvant constituer un risque sanitaire', prec:'Choisir un produit et prendre la température – KO si écart de + ou – 4°C avec la T° attendue', p:10, c:'Critique'},
  // ── Zone : Vente TRADITIONNELLE ──
  {id:'xl-16', cat:'Vente trad. – Equipement', q:'Conformité des matériaux au contact des aliments', prec:'', p:5, c:'Majeure'},
  {id:'xl-17', cat:'Vente trad. – Equipement', q:'Présence de lave-mains accessibles, conformes propres et approvisionnés', prec:'Distributeurs approvisionnés : essuie-tout, savon, brosse à ongles', p:5, c:'Majeure'},
  {id:'xl-18', cat:'Vente trad. – Equipement', q:'Affichage température en état de fonctionnement', prec:'', p:5, c:'Majeure'},
  {id:'xl-19', cat:'Vente trad. – Nettoyage & désinfection', q:'Propreté locaux et équipements sans contact avec les aliments', prec:'Plafonds, murs, étagères, sol, poignées de porte, grille des évaporateurs…', p:5, c:'Majeure'},
  {id:'xl-20', cat:'Vente trad. – Nettoyage & désinfection', q:'Propreté du matériel en contact direct avec les aliments et à risque sanitaire', prec:'Cuillères, pinces, saladières, plateaux, couteaux – 10 pts par matériel sale', p:5, c:'Majeure'},
  {id:'xl-21', cat:'Vente trad. – Méthode', q:'Protection des produits', prec:'Produit protégé – Absence de matériaux polluants (bois, cartons)', p:5, c:'Majeure'},
  {id:'xl-22', cat:'Vente trad. – Méthode', q:'Séparation des denrées alimentaires de nature différente', prec:'En stockage et zone de préparation : cru/cuit, emballé/nu, familles différentes', p:5, c:'Majeure'},
  {id:'xl-23', cat:'Vente trad. – Méthode', q:'Absence de contaminations croisées pouvant entraîner un risque sanitaire direct', prec:'Ex : pains avec allergène en contact avec pains sans allergène ; légumes terreux, viandes et volailles crues', p:10, c:'Critique'},
  {id:'xl-24', cat:'Vente trad. – Méthode', q:'Traçabilité', prec:'1 produit fabriqué ou conditionné = 1 fiche recette + 1 fiche fabrication', p:5, c:'Majeure'},
  {id:'xl-25', cat:'Vente trad. – Méthode', q:'Respect des DLC/DDM/DUR/DCR', prec:'', p:10, c:'Critique'},
  {id:'xl-26', cat:'Vente trad. – Méthode', q:'Absence à la vente de fruits et légumes de 1ère gamme altérés non commercialisables', prec:'Fruits et légumes abîmés', p:5, c:'Majeure'},
  {id:'xl-27', cat:'Vente trad. – Etiquetage', q:'Conformité de l\'étiquetage — mentions générales hors sécurité des denrées', prec:'Ex : zone, sous-zone et engin de pêche, % matière grasse, sticker AOP…', p:5, c:'Majeure'},
  {id:'xl-28', cat:'Vente trad. – Etiquetage', q:'Conformité de l\'étiquetage des fruits et légumes — mentions générales hors sécurité', prec:'Ex : origine erronée, absence variété…', p:5, c:'Majeure'},
  {id:'xl-29', cat:'Vente trad. – Etiquetage', q:'Conformité de l\'étiquetage — sécurité des denrées (décote multiplicative)', prec:'Ex : présence allergènes sur pics prix, terme « décongelé » ou flocon', p:10, c:'Critique'},
  {id:'xl-30', cat:'Vente trad. – Température', q:'Température de la zone / T°C produit adaptée', prec:'Écart de + ou – 2°C avec la température attendue', p:10, c:'Critique'},
  {id:'xl-31', cat:'Vente trad. – Température', q:'Respect des limites de charge', prec:'Grilles de reprise d\'air obstruées, dépassement de la limite de charge', p:5, c:'Majeure'},
  // ── Zone : RAYON LIBRE SERVICE ──
  {id:'xl-32', cat:'Libre-service – Equipement', q:'Affichage température en état de fonctionnement', prec:'', p:5, c:'Majeure'},
  {id:'xl-33', cat:'Libre-service – Nettoyage & désinfection', q:'Propreté locaux et équipements sans contact avec les aliments', prec:'Ex : étagères, sol, poignées de porte, vitres, grille des évaporateurs…', p:5, c:'Majeure'},
  {id:'xl-34', cat:'Libre-service – Nettoyage & désinfection', q:'Respect des DLC / DDM / DUR / DCR des œufs', prec:'', p:10, c:'Critique'},
  {id:'xl-35', cat:'Libre-service – Etiquetage', q:'Conformité de l\'étiquetage — mentions générales hors sécurité des denrées', prec:'Ex : N° agrément d\'abattage et de découpe, origine, sticker AOP, traitement du lait…', p:5, c:'Majeure'},
  {id:'xl-36', cat:'Libre-service – Etiquetage', q:'Conformité de l\'étiquetage — sécurité des denrées', prec:'Ex : présence allergènes, terme décongelé ou flocon, température de conservation', p:10, c:'Critique'},
  {id:'xl-37', cat:'Libre-service – Etiquetage', q:'Bonne application de la tare pour la pesée de produit vendu au poids', prec:'', p:5, c:'Majeure'},
  {id:'xl-38', cat:'Libre-service – Température', q:'Température de la zone / T°C produit adaptée', prec:'Écart de + ou – 2°C avec la température attendue', p:10, c:'Critique'},
  {id:'xl-39', cat:'Libre-service – Température', q:'Respect des limites de charge', prec:'Grilles de reprise d\'air obstruées, dépassement de la limite de charge', p:5, c:'Majeure'},
  {id:'xl-40', cat:'Libre-service – Equipement', q:'Conformité des poubelles — Traitement hygiénique des déchets', prec:'Poubelles étanches maintenues fermées', p:5, c:'Majeure'},
  {id:'xl-41', cat:'Libre-service – Equipement', q:'Présence et fonctionnement du thermomètre', prec:'', p:5, c:'Majeure'},
  {id:'xl-42', cat:'Libre-service – Nettoyage & désinfection', q:'Conformité et état du matériel de nettoyage et désinfection', prec:'Ex : balai, raclette, centrale de nettoyage, etc.', p:5, c:'Majeure'},
  {id:'xl-43', cat:'Libre-service – Nettoyage & désinfection', q:'Conformité des produits d\'entretien (agréés au contact alimentaire)', prec:'Produits renseignés sur le protocole de nettoyage', p:5, c:'Majeure'},
  {id:'xl-44', cat:'Libre-service – Nettoyage & désinfection', q:'Conditions de stockage des emballages et conditionnements satisfaisantes', prec:'Emballages protégés de la poussière, stockés retournés', p:5, c:'Majeure'},
  {id:'xl-45', cat:'Libre-service – Nettoyage & désinfection', q:'Produits non conformes isolés et balisés', prec:'Définir une zone non conforme avec affiche « non conforme »', p:5, c:'Majeure'},
  {id:'xl-46', cat:'Libre-service – Locaux', q:'Absence de défaut d\'infrastructure ou de propreté ayant une conséquence directe sur les produits', prec:'Ex : rouille sur table de manipulation, peinture écaillée, fuite d\'eau contaminant une surface de préparation', p:5, c:'Majeure'},
  {id:'xl-47', cat:'Libre-service – Locaux', q:'Présence de défaut d\'infrastructure, de dégradation ou de propreté pouvant entraîner un risque sanitaire critique', prec:'Ex : rupture de chaîne du froid généralisée, vétusté extrême, infestation majeure non maîtrisée', p:10, c:'Critique'},
  {id:'xl-48', cat:'Libre-service – Locaux', q:'Infestation massive de nuisibles avec dégradation de produits à la vente', prec:'Contrôle de la présence de produits dégradés ou de la contamination de surfaces en contact alimentaire', p:10, c:'Critique'}
];

const SHEETJS_URL='https://cdnjs.cloudflare.com/ajax/libs/xlsx/0.18.5/xlsx.full.min.js';
const PDFJS_URL='https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.min.js';

const FORMAT_INFO={
  csv:`<strong style="color:var(--text);font-size:13px">Format CSV / TSV</strong><br>
    Colonnes attendues : <strong>Rayon · Catégorie · Intitulé · Criticité · Poids</strong><br>
    Séparateur auto-détecté : <code style="background:#fff;padding:1px 5px;border-radius:4px">;</code> ou <code style="background:#fff;padding:1px 5px;border-radius:4px">,</code> ou tabulation<br>
    La première ligne peut être un en-tête (ignorée si elle contient « Rayon »).<br>
    <span style="color:#15803d">Exemple : <code style="background:#fff;padding:1px 5px;border-radius:4px">Boucherie;Température;Temp. chambre froide;Critique;10</code></span>`,
  xlsx:`<strong style="color:var(--text);font-size:13px">Format Excel (.xlsx / .xls)</strong><br>
    La 1ère feuille du classeur est utilisée. La 1ère ligne doit être un en-tête ou être ignorée.<br>
    Colonnes (dans l'ordre) : <strong>Rayon · Catégorie · Intitulé · Criticité · Poids</strong><br>
    <span style="color:#15803d">Les colonnes peuvent aussi être nommées en en-tête — la détection est automatique.</span>`,
  pdf:`<strong style="color:var(--text);font-size:13px">Format PDF</strong><br>
    Le texte du PDF est extrait et analysé ligne par ligne.<br>
    Chaque ligne doit contenir les informations séparées par des espaces ou tabulations.<br>
    Les PDFs contenant des tableaux avec les colonnes <strong>Rayon, Catégorie, Intitulé, Criticité</strong> sont mieux reconnus.<br>
    <span style="color:var(--orange)">⚠ Les PDFs scannés (images) ne fonctionnent pas.</span>`
};

const QM_ZONES=[
  {id:'z0', emoji:'🚩', label:'Référentiel Affichage'},
  {id:'z1', emoji:'🟢', label:'Zone 1 – Abords & Accueil'},
  {id:'z2', emoji:'🥖', label:'Zone 2 – Boulangerie & Pâtisserie'},
  {id:'z4', emoji:'🥩', label:'Zone 4 – Boucherie & Volaille'},
  {id:'z5', emoji:'🧀', label:'Zone 5 – Charcuterie / Traiteur / Fromage'},
  {id:'z6', emoji:'🐟', label:'Zone 6 – Marée'},
  {id:'z7', emoji:'🥛', label:'Zone 7 – Frais LS (Charcuterie, Crémerie, Traiteur)'},
  {id:'z8', emoji:'🍝', label:'Zone 8 – Épicerie / Liquide / Surgelés'},
  {id:'z9', emoji:'🧼', label:'Zone 9 – DPH / Bazar / Textile'},
  {id:'z10', emoji:'🛒', label:'Zone 10 – Ligne de caisse & Sécurité'},
];