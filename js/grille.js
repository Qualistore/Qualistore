// ══════════════ GRILLE ══════════════
// Dépend de : storage.js (DB, CU), auth.js (hasPerm), ui.js

// ══════════════ GRILLE ══════════════
// ══ GRILLE DE BASE — importée depuis Grille_inspection_interne_Pour_3_Magasins.xlsx ══
// 48 points communs à tous les rayons, organisés en 3 zones du fichier Excel
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

// La grille est COMMUNE à tous les rayons. Les points personnalisés restent par rayon.
function getGrille(rayon){
  const custom=(DB.grilleCustom[rayon]||[]);
  return [...GRILLE_BASE_COMMUNE,...custom];
}

function showGrille(r){
  el('grille-ttl').textContent=r;
  if(el('btn-add-ctrl')) el('btn-add-ctrl').style.display=CU&&CU.role==='admin'?'':'none';
  const qs=getGrille(r); const cats=[...new Set(qs.map(q=>q.cat))];
  el('grille-body').innerHTML=cats.map(cat=>{
    const cqs=qs.filter(q=>q.cat===cat);
    return `<div><div style="padding:10px 20px;background:var(--bg);font-size:11px;font-weight:600;color:var(--text2);text-transform:uppercase;letter-spacing:.5px;border-bottom:1px solid var(--border)">${cat}</div>
    ${cqs.map(q=>{
      const isCustom=!GRILLE_BASE_COMMUNE.find(x=>x.id===q.id);
      return `<div style="display:flex;align-items:flex-start;gap:12px;padding:12px 20px;border-bottom:1px solid var(--border)${isCustom?';background:#f8f0ff':''}">
        <div style="flex:1">
          <div style="font-size:13px">${q.q}${isCustom?` <span class="badge" style="background:#ede9fe;color:#5b21b6;margin-left:4px">Personnalisé</span>`:''}</div>
          ${q.prec?`<div style="font-size:11px;color:var(--text2);margin-top:3px;font-style:italic">${q.prec}</div>`:''}
        </div>
        <div style="display:flex;gap:8px;align-items:center;flex-shrink:0">
          ${critBdg(q.c)}<span class="tsm tm" style="white-space:nowrap">Poids : <strong>${q.p}</strong></span>
          ${isCustom&&CU&&CU.role==='admin'?`<button class="btn btn-secondary btn-sm" onclick="openCtrlModal('${r}','${q.id}')"><i class="ti ti-pencil"></i></button><button class="btn btn-danger btn-sm" onclick="delCtrl('${r}','${q.id}')"><i class="ti ti-trash"></i></button>`:''}
        </div>
      </div>`;
    }).join('')}
    </div>`;
  }).join('');
}

let ctrlRayonCurrent='Boucherie';
function openCtrlModal(rayon,qid){
  ctrlRayonCurrent=rayon||el('grille-ray-sel').value||'Boucherie';
  const isEdit=!!qid;
  el('m-ctrl-ttl').innerHTML=isEdit?'<i class="ti ti-pencil" style="color:var(--primary)"></i> Modifier le point de contrôle':'<i class="ti ti-list-check" style="color:var(--primary)"></i> Nouveau point de contrôle';
  el('ctrl-err').classList.remove('show');
  sv('ctrl-id',qid||'');
  el('ctrl-rayon').value=ctrlRayonCurrent;
  if(isEdit){
    const q=(DB.grilleCustom[rayon]||[]).find(x=>x.id===qid); if(!q) return;
    sv('ctrl-q',q.q); sv('ctrl-cat',q.cat); el('ctrl-crit').value=q.c; sv('ctrl-poids',q.p);
  } else {
    sv('ctrl-q',''); sv('ctrl-cat',''); el('ctrl-crit').value='Majeure'; sv('ctrl-poids','');
  }
  openModal('m-ctrl');
}
function saveCtrl(){
  const rayon=el('ctrl-rayon').value;
  const q=v('ctrl-q').trim(), cat=v('ctrl-cat').trim()||'Général', crit=el('ctrl-crit').value;
  const err=el('ctrl-err');
  if(!q){ err.textContent='L\'intitulé est requis.'; err.classList.add('show'); return; }
  const defPoids={'Critique':10,'Majeure':5,'Mineure':2};
  const poids=parseInt(v('ctrl-poids'))||defPoids[crit];
  if(!DB.grilleCustom[rayon]) DB.grilleCustom[rayon]=[];
  const existId=v('ctrl-id');
  if(existId){
    const idx=DB.grilleCustom[rayon].findIndex(x=>x.id===existId);
    if(idx>=0) DB.grilleCustom[rayon][idx]={id:existId,cat,q,p:poids,c:crit};
  } else {
    DB.grilleCustom[rayon].push({id:'cust-'+uid(),cat,q,p:poids,c:crit});
  }
  save(); closeModal('m-ctrl'); el('grille-ray-sel').value=rayon; showGrille(rayon);
}
function delCtrl(rayon,qid){
  if(!confirm('Supprimer ce point de contrôle personnalisé ?')) return;
  DB.grilleCustom[rayon]=(DB.grilleCustom[rayon]||[]).filter(x=>x.id!==qid);
  save(); showGrille(rayon);
}