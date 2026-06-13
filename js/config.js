// ══════════════ CONFIG — QualiStore ══════════════
// Ce fichier regroupe toutes les constantes globales.

const LOGO_B64="assets/logo.png";

// ══════════════ STORAGE ══════════════

const DPERMS={
  admin:     {'aud-r':1,'aud-w':1,'nc':1,'ac':1,'mag':1,'rap':1,'grille':1,'usr':1},
  fsqs:      {'aud-r':1,'aud-w':1,'nc':1,'ac':1,'mag':0,'rap':1,'grille':1,'usr':0},
  directeur: {'aud-r':1,'aud-w':0,'nc':0,'ac':1,'mag':0,'rap':1,'grille':0,'usr':0},
  direction: {'aud-r':1,'aud-w':0,'nc':0,'ac':0,'mag':0,'rap':1,'grille':0,'usr':0}
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

const QUAL_ZONES=[
  { id:'z0', emoji:'🚩', label:'Référentiel Affichage', points:[
    {id:'z0-1', q:'Allées : 1 affiche (ou stop rayon) sur chaque produit', prec:'Pénétrante / Centrale – format A4'},
    {id:'z0-2', q:'Palettes au sol : 1 affiche par palette', prec:'Format A3'},
    {id:'z0-3', q:'Bacs Autonomes F&L/Frais : 1 affiche sur pied américain par bac', prec:'Format A4'},
    {id:'z0-4', q:'Têtes de Gondoles : joues prix présentes des deux côtés', prec:''},
    {id:'z0-5', q:'Bacs Frais LS Promo : chaque produit en bac a son adhésif prix', prec:''},
    {id:'z0-6', q:'Rayons Métiers (Boucherie/Poissonnerie) : 3 affiches minimum', prec:'Format A3'},
    {id:'z0-7', q:'Traiteur / Charcuterie / Fromage : 3 affiches minimum', prec:'Format A3'},
  ]},
  { id:'z1', emoji:'🟢', label:'Zone 1 – Abords & Accueil', points:[
    {id:'z1-1', q:'Extérieur propre : parking, espaces verts, entrées, poubelles vidées', prec:''},
    {id:'z1-2', q:'Chariots/Paniers : 5 chariots au hasard propres, paniers dispo à l\'entrée', prec:''},
    {id:'z1-3', q:'Accueil : badge nominatif + Bonjour / Sourire / Merci / Au revoir', prec:''},
    {id:'z1-4', q:'Documents : tracts promo disponibles, cahier de suggestions présent', prec:''},
    {id:'z1-5', q:'Location véhicules : propres, garés en marche arrière', prec:''},
  ]},
  { id:'z2', emoji:'🥖', label:'Zone 2 – Boulangerie & Pâtisserie', points:[
    {id:'z2-1', q:'Personnel : badge + tenue propre + coiffe (calot/casquette)', prec:''},
    {id:'z2-2', q:'Affichage : panneau "3+1 offerte", 1 affiche A3 Pâtisserie + 1 A3 Viennois', prec:''},
    {id:'z2-3', q:'Affichage : 1 produit = 1 étiquette prix', prec:''},
    {id:'z2-4', q:'Pains : au moins 20 sortes + 2 références BIO', prec:''},
    {id:'z2-5', q:'Indispensables U : Baguette U, Pain U, Tarte U, Flan U – zéro rupture', prec:''},
    {id:'z2-6', q:'Viennoiserie : Croissant, Pain Choc, Chausson, Pain Raisin U présents', prec:''},
    {id:'z2-7', q:'Hygiène : rayon propre, pas de miettes au sol, pas de boîtes vides', prec:''},
  ]},
  { id:'z4', emoji:'🥩', label:'Zone 4 – Boucherie & Volaille', points:[
    {id:'z4-1', q:'Personnel : badge + tenue propre + coiffe', prec:''},
    {id:'z4-2', q:'Promo : offre de la semaine ou "X+X" présente avec affiche + produit en rayon', prec:''},
    {id:'z4-3', q:'Prix Mini : au moins 3 produits "Prix Mini" dont 2 volailles', prec:''},
    {id:'z4-4', q:'Rupture : Escalope dinde U × 2 présente', prec:'Zéro rupture obligatoire'},
    {id:'z4-5', q:'Origine : affiche ou écran mettant en avant l\'origine de la viande', prec:''},
    {id:'z4-6', q:'Hygiène : rayon propre', prec:''},
    {id:'z4-7', q:'Affichage : 1 produit = 1 étiquette prix', prec:''},
  ]},
  { id:'z5', emoji:'🧀', label:'Zone 5 – Charcuterie / Traiteur / Fromage', points:[
    {id:'z5-1', q:'Charcuterie Trad : 2 affiches promo + 2 pics prix promo dans le plat', prec:''},
    {id:'z5-2', q:'Traiteur Trad : 2 affiches promo + 2 pics prix promo dans le plat', prec:''},
    {id:'z5-3', q:'Fromage Trad : 2 affiches promo + 2 pics prix promo', prec:''},
    {id:'z5-4', q:'Frais Emballé : gamme "Prix Ronds" présente (3 réf. minimum)', prec:''},
    {id:'z5-5', q:'Hygiène : rayon propre', prec:''},
    {id:'z5-6', q:'Affichage : 1 produit = 1 étiquette prix', prec:''},
  ]},
  { id:'z6', emoji:'🐟', label:'Zone 6 – Marée', points:[
    {id:'z6-1', q:'Marée Trad : 3 affiches promo + 3 pics prix + 1 offre < 10€/kg', prec:''},
    {id:'z6-2', q:'Incontournables : zéro rupture – Cabillaud, Saumon, Crevettes, Bulots', prec:''},
    {id:'z6-3', q:'Origine : logo "Criée", "Filière U" ou "Pisciculture FR"', prec:''},
    {id:'z6-4', q:'Marée LS : balisage "Prix Mini" (Crevettes, Saumon, Panés) + 1 affiche promo', prec:''},
    {id:'z6-5', q:'Hygiène : rayon propre', prec:''},
    {id:'z6-6', q:'Affichage : 1 produit = 1 étiquette prix', prec:''},
  ]},
  { id:'z7', emoji:'🥛', label:'Zone 7 – Frais LS (Charcuterie, Crémerie, Traiteur)', points:[
    {id:'z7-1', q:'Prix Mini : balisage "Ici Prix Mini" – Jambon U, Pâte feuilletée PXM', prec:''},
    {id:'z7-2', q:'Fidélité : 20 produits "Sélection Fidélité" balisés au total', prec:''},
    {id:'z7-3', q:'Rupture : Lardons U présents + Mozzarella U présente', prec:''},
    {id:'z7-4', q:'Sans Nitrite : 3 références Jambon Cuit U "Sans Nitrite"', prec:''},
    {id:'z7-5', q:'Lait : pas d\'emballages/intercalaires vides (tolérance 2)', prec:''},
    {id:'z7-6', q:'Bio : au moins 3 références BVPI Bio', prec:''},
    {id:'z7-7', q:'Hygiène : rayon propre', prec:''},
    {id:'z7-8', q:'Affichage : 1 produit = 1 étiquette prix', prec:''},
  ]},
  { id:'z8', emoji:'🍝', label:'Zone 8 – Épicerie / Liquide / Surgelés', points:[
    {id:'z8-1', q:'Prix Mini : balisage "Ici Prix Mini" – Sucre, Farine, Litière, Vinaigre', prec:''},
    {id:'z8-2', q:'U Régions : présence des confitures "U de nos Régions"', prec:''},
    {id:'z8-3', q:'Ruptures : Ketchup Heinz 250g et Prince LU présents', prec:''},
    {id:'z8-4', q:'Tract : produits du tract balisés (Sucré, Salé, Liquide)', prec:''},
    {id:'z8-5', q:'Fidélité : 20 balisages Fidélité en Salé + 20 en Sucré', prec:''},
    {id:'z8-6', q:'Surgelés : rayon propre sans givre, Magnum / Extrême / Snickers présents', prec:''},
    {id:'z8-7', q:'Hygiène : rayon propre', prec:''},
    {id:'z8-8', q:'Affichage : 1 produit = 1 étiquette prix', prec:''},
  ]},
  { id:'z9', emoji:'🧼', label:'Zone 9 – DPH / Bazar / Textile', points:[
    {id:'z9-1', q:'DPH : zéro rupture – Couches, Papier Toilette U, Essuie-tout U', prec:''},
    {id:'z9-2', q:'Hygiène : étagères propres, pas de rouille en lessive/droguerie', prec:''},
    {id:'z9-3', q:'Bazar : signalétique SAV, zéro rupture Piles / Ramettes / Lave-glace', prec:''},
    {id:'z9-4', q:'Textile : zéro article au sol, allées dégagées (1 m min)', prec:''},
    {id:'z9-5', q:'Puériculture : présence goupillon "U tout petit"', prec:''},
    {id:'z9-6', q:'Affichage : 1 produit = 1 étiquette prix', prec:''},
  ]},
  { id:'z10', emoji:'🛒', label:'Zone 10 – Ligne de caisse & Sécurité', points:[
    {id:'z10-1', q:'Politesse : Bonjour / Sourire / Merci / Au revoir, pas de bavardage collègue', prec:''},
    {id:'z10-2', q:'Fidélité : question "Avez-vous la carte U ?" + sticker Carte U sur TPE', prec:''},
    {id:'z10-3', q:'Propreté : tapis de caisse propres, barres de caisse avec message promo', prec:''},
    {id:'z10-4', q:'Sécurité : issues de secours dégagées', prec:''},
    {id:'z10-5', q:'Station : pistolets/sols propres, conseil Gaz Butane/Propane', prec:''},
  ]},
];