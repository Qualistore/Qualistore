// ══════════════ AUDIT-QUALIMETRE ══════════════
// Dépend de : storage.js (DB, CU), config.js, ui.js

// ══════════════ AUDIT QUALIMÈTRE ══════════════
// Référentiel complet issu du PDF "Bienvenue dans ton rôle d'auditeur Qualimètre"
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

// Total points for scoring
const QA_TOTAL_POINTS=QUAL_ZONES.reduce((s,z)=>s+z.points.length,0);

let qaStep=0, qaAnswers={}, qaCurrentZone=0;

// ── Hidden helper: remplir toutes les réponses non renseignées avec N/A ──
// Appelée silencieusement avant la soumission pour éviter tout blocage
function autoFillNA(){
  QUAL_ZONES.forEach(z=>z.points.forEach(p=>{
    if(!qaAnswers[p.id]||qaAnswers[p.id].rep===null||qaAnswers[p.id].rep===undefined){
      qaAnswers[p.id]={rep:'NA',cmt:qaAnswers[p.id]?.cmt||'',q:p.q};
    }
  }));
}

function renderQualAudits(){
  const mids=visibleMids();
  const sel=el('flt-qaud-mag');
  if(sel){ const cv=sel.value; while(sel.options.length>1) sel.remove(1); DB.magasins.filter(m=>mids.includes(m.id)).forEach(m=>{ const o=document.createElement('option'); o.value=m.id; o.textContent=m.nom; sel.appendChild(o); }); if(cv) sel.value=cv; }
  const fMag=v('flt-qaud-mag');
  let list=(DB.qualAudits||[]).filter(a=>mids.includes(a.mid));
  if(fMag) list=list.filter(a=>a.mid===fMag);
  list=[...list].reverse();
  el('qaud-hist-cnt').textContent=list.length+' audit(s)';
  const tb=el('qaud-tb');
  if(!list.length){ tb.innerHTML=`<tr><td colspan="8"><div class="empty-state"><i class="ti ti-rosette" style="color:#ddd6fe"></i><p>Aucun audit Qualimètre réalisé.</p></div></td></tr>`; return; }
  tb.innerHTML=list.map(a=>`<tr>
    <td style="font-weight:600;color:#7c3aed">${a.id}</td>
    <td>${a.mag}</td>
    <td>${fd(a.date)}</td>
    <td>${a.aud}</td>
    <td><span class="score-badge" style="background:#f5f3ff;color:#6d28d9">${a.score}%</span></td>
    <td style="color:${a.nc>0?'var(--danger)':'var(--success)'};font-weight:600">${a.nc}</td>
    <td>${statBdg(a.statut)}</td>
    <td><div class="act-btns">
      <button class="btn btn-secondary btn-sm" onclick="showQualAudit('${a.id}')"><i class="ti ti-eye"></i></button>
      ${CU&&CU.role==='admin'?`<button class="btn btn-danger btn-sm" onclick="deleteQualAudit('${a.id}')"><i class="ti ti-trash"></i></button>`:''}
    </div></td>
  </tr>`).join('');
}

function openQualAuditModal(){
  qaStep=0; qaAnswers={}; qaCurrentZone=0;
  // Init all answers
  QUAL_ZONES.forEach(z=>z.points.forEach(p=>{ qaAnswers[p.id]={rep:null,cmt:'',q:p.q}; }));
  // Populate magasin
  const mids=visibleMids();
  const msel=el('qa-mag'); msel.innerHTML='<option value="">Sélectionner...</option>'+DB.magasins.filter(m=>mids.includes(m.id)&&m.statut==='actif').map(m=>`<option value="${m.id}">${m.nom}</option>`).join('');
  el('qa-date').value=today();
  el('qa-aud').value=CU?CU.nom:'';
  sv('qa-cmt','');
  // Show step 0 (welcome), hide others
  el('qa-s0').style.display=''; el('qa-s1').style.display='none'; el('qa-s2').style.display='none'; el('qa-s3').style.display='none';
  el('qa-prev').style.display='none';
  el('qa-next').innerHTML='Démarrer <i class="ti ti-arrow-right"></i>';
  el('qa-next').onclick=qaNext;
  openModal('m-qual-audit');
}

function qaNext(){
  if(qaStep===0){
    // Welcome → form
    el('qa-s0').style.display='none'; el('qa-s1').style.display='';
    el('qa-prev').style.display='';
    el('qa-next').innerHTML='Commencer l\'audit <i class="ti ti-arrow-right"></i>';
    qaStep=1;
  } else if(qaStep===1){
    if(!v('qa-mag')||!v('qa-date')||!v('qa-aud').trim()){ alert('Magasin, date et auditeur sont requis.'); return; }
    buildQaQuestions();
    el('qa-s1').style.display='none'; el('qa-s2').style.display='';
    el('qa-next').innerHTML='Valider l\'audit <i class="ti ti-check"></i>';
    qaStep=2;
  } else if(qaStep===2){
    submitQualAudit();
  }
}
function qaPrev(){
  if(qaStep===2){
    el('qa-s2').style.display='none'; el('qa-s1').style.display='';
    el('qa-next').innerHTML='Commencer l\'audit <i class="ti ti-arrow-right"></i>';
    qaStep=1;
  } else if(qaStep===1){
    el('qa-s1').style.display='none'; el('qa-s0').style.display='';
    el('qa-prev').style.display='none';
    el('qa-next').innerHTML='Démarrer <i class="ti ti-arrow-right"></i>';
    qaStep=0;
  }
}

function buildQaQuestions(){
  qaCurrentZone=0;
  // Zone tabs
  el('qa-zone-tabs').innerHTML=QUAL_ZONES.map((z,i)=>`
    <button onclick="switchQaZone(${i})" id="qa-tab-${i}" style="padding:5px 10px;border-radius:6px;border:1px solid #ddd6fe;background:${i===0?'#7c3aed':'#f5f3ff'};color:${i===0?'#fff':'#6d28d9'};font-size:12px;cursor:pointer;font-weight:500">
      ${z.emoji} ${z.label.split(' – ')[1]||z.label}
    </button>`).join('');
  renderQaZone(0);
  updateQaScore();
}

function switchQaZone(idx){
  qaCurrentZone=idx;
  document.querySelectorAll('[id^=qa-tab-]').forEach((b,i)=>{
    b.style.background=i===idx?'#7c3aed':'#f5f3ff';
    b.style.color=i===idx?'#fff':'#6d28d9';
  });
  renderQaZone(idx);
}

function renderQaZone(idx){
  const zone=QUAL_ZONES[idx];
  el('qa-zone-title').textContent=zone.emoji+' '+zone.label;
  el('qa-questions').innerHTML=zone.points.map(p=>`
    <div class="aq" id="qaaq-${p.id}" style="margin-bottom:8px">
      <div class="qt">${p.q}</div>
      ${p.prec?`<div style="font-size:11px;color:var(--text2);margin-bottom:6px;font-style:italic">${p.prec}</div>`:''}
      <div class="rg">
        <div class="rb" onclick="setQaRep('${p.id}','C',this)"><i class="ti ti-check" style="font-size:12px"></i> Conforme</div>
        <div class="rb" onclick="setQaRep('${p.id}','NC',this)"><i class="ti ti-x" style="font-size:12px"></i> Non conforme</div>
        <div class="rb" onclick="setQaRep('${p.id}','NA',this)"><i class="ti ti-minus" style="font-size:12px"></i> N/A</div>
      </div>
      <div class="nc-det" id="qand-${p.id}">
        <input type="text" class="form-control" style="font-size:12px;margin-top:8px" placeholder="Commentaire..." oninput="qaAnswers['${p.id}'].cmt=this.value">
      </div>
    </div>`).join('');
  // Restore previous answers if any
  zone.points.forEach(p=>{
    const a=qaAnswers[p.id]; if(!a||!a.rep) return;
    const btn=document.querySelector(`#qaaq-${p.id} .rb.sel${a.rep}`);
    if(btn){ btn.classList.add('sel'+a.rep); }
    if(a.rep==='NC') el('qand-'+p.id)?.classList.add('on');
  });
  updateQaProgress(idx);
}

function setQaRep(pid,r,btn){
  qaAnswers[pid].rep=r;
  const c=el('qaaq-'+pid);
  c.querySelectorAll('.rb').forEach(b=>b.classList.remove('selC','selNC','selNA'));
  btn.classList.add('sel'+r);
  c.classList.toggle('is-nc',r==='NC');
  const d=el('qand-'+pid); if(r==='NC') d?.classList.add('on'); else d?.classList.remove('on');
  updateQaScore();
  updateQaProgress(qaCurrentZone);
}

function updateQaScore(){
  const ans=Object.values(qaAnswers);
  const valid=ans.filter(a=>a.rep&&a.rep!=='NA');
  const c=valid.filter(a=>a.rep==='C').length;
  const total=valid.length;
  const pct=total>0?Math.round((c/total)*100):null;
  const sl=el('qa-score-live'); if(sl){ sl.textContent=pct!==null?pct+'%':'–'; }
}

function updateQaProgress(idx){
  const zone=QUAL_ZONES[idx];
  const done=zone.points.filter(p=>qaAnswers[p.id]&&qaAnswers[p.id].rep).length;
  el('qa-progress').textContent=`Zone ${idx+1}/${QUAL_ZONES.length} · ${done}/${zone.points.length} réponses`;
  // Update tab badge
  const tab=el('qa-tab-'+idx);
  if(tab&&done===zone.points.length){ tab.innerHTML=tab.innerHTML.replace(/\s*✓$/,'')+' ✓'; }
}

function submitQualAudit(){
  const mid=v('qa-mag'), date=v('qa-date'), aud=v('qa-aud').trim(), cmt=v('qa-cmt');
  const mag=DB.magasins.find(m=>m.id===mid)||{};
  // Silently fill all unanswered questions with N/A to avoid blocking
  autoFillNA();
  const ans=Object.values(qaAnswers);
  const valid=ans.filter(a=>a.rep&&a.rep!=='NA');
  const c=valid.filter(a=>a.rep==='C').length;
  const ncList=valid.filter(a=>a.rep==='NC');
  const score=valid.length>0?Math.round((c/valid.length)*100):100;
  if(!DB.qualAudits) DB.qualAudits=[];
  const aid='QA-'+String((DB.qualAudits.length+1)).padStart(3,'0');
  DB.qualAudits.push({ id:aid, mid, mag:mag.nom||'', date, aud, cmt, score, nc:ncList.length, statut:ncList.length?'Ouvert':'Conforme', answers:{...qaAnswers} });
  save();
  el('qa-s2').style.display='none'; el('qa-s3').style.display=''; el('qa-prev').style.display='none';
  el('qa-next').innerHTML='Fermer'; el('qa-next').onclick=()=>{ closeModal('m-qual-audit'); renderQualAudits(); };
  el('qa-recap').textContent=(mag.nom||'')+' · '+fd(date)+' · Auditeur : '+aud;
  el('qa-score-fin').textContent=score+'%';
  el('qa-nc-msg').textContent=ncList.length?ncList.length+' point(s) non conforme(s) détecté(s)':'';
  qaStep=3;
}

function showQualAudit(id){
  const a=(DB.qualAudits||[]).find(x=>x.id===id); if(!a) return;
  const scolor=a.score>=90?'var(--success)':a.score>=75?'#f59e0b':a.score>=60?'var(--orange)':'var(--danger)';
  let html=`<div style="display:grid;grid-template-columns:1fr 1fr;gap:16px;margin-bottom:20px">
    <table style="font-size:13px">
      <tr><td class="tm" style="padding:4px 0;width:40%">N° Audit</td><td style="font-weight:600;color:#7c3aed">${a.id}</td></tr>
      <tr><td class="tm" style="padding:4px 0">Magasin</td><td>${a.mag}</td></tr>
      <tr><td class="tm" style="padding:4px 0">Date</td><td>${fd(a.date)}</td></tr>
      <tr><td class="tm" style="padding:4px 0">Auditeur</td><td>${a.aud}</td></tr>
      <tr><td class="tm" style="padding:4px 0">Statut</td><td>${statBdg(a.statut)}</td></tr>
    </table>
    <div style="text-align:center">
      <div style="width:80px;height:80px;border-radius:50%;border:7px solid ${scolor};display:flex;align-items:center;justify-content:center;margin:0 auto 8px;font-size:20px;font-weight:700;color:${scolor}">${a.score}%</div>
      <div class="tsm tm">${a.score>=90?'Excellent':a.score>=75?'Satisfaisant':a.score>=60?'À améliorer':'Insuffisant'}</div>
    </div>
  </div>`;
  if(a.cmt) html+=`<div style="background:var(--bg);border-radius:var(--radius);padding:10px 14px;margin-bottom:16px;font-size:13px">${a.cmt}</div>`;
  // NC details by zone
  const ncItems=Object.entries(a.answers||{}).filter(([,v])=>v.rep==='NC');
  if(ncItems.length){
    html+=`<div style="font-size:13px;font-weight:600;margin-bottom:10px;color:var(--danger)">Points non conformes (${ncItems.length})</div>`;
    html+=ncItems.map(([pid,v])=>`<div style="background:var(--danger-light);border-radius:var(--radius);padding:9px 14px;margin-bottom:6px;font-size:12px">
      <div style="font-weight:500">${v.q}</div>
      ${v.cmt?`<div style="color:var(--danger);margin-top:3px">${v.cmt}</div>`:''}
    </div>`).join('');
  } else {
    html+=`<div style="color:var(--success);font-size:13px;font-weight:500"><i class="ti ti-circle-check"></i> Tous les points sont conformes.</div>`;
  }
  el('qa-detail-body').innerHTML=html;
  openModal('m-qual-audit-detail');
}

function deleteQualAudit(id){
  if(!confirm(`Supprimer l'audit Qualimètre ${id} ?`)) return;
  DB.qualAudits=(DB.qualAudits||[]).filter(x=>x.id!==id);
  save(); renderQualAudits();
}