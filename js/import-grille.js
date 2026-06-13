// ══════════════ IMPORT-GRILLE ══════════════
// Dépend de : storage.js (DB, CU), config.js, ui.js

// ══════════════ IMPORT GRILLE (CSV / XLSX / PDF) ══════════════
// Lazy-load SheetJS and PDF.js only when needed
const SHEETJS_URL='https://cdnjs.cloudflare.com/ajax/libs/xlsx/0.18.5/xlsx.full.min.js';
const PDFJS_URL='https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.min.js';
let XLSXLoaded=false, PDFJSLoaded=false;

function loadScript(url){ return new Promise((res,rej)=>{ const s=document.createElement('script'); s.src=url; s.onload=res; s.onerror=rej; document.head.appendChild(s); }); }

let importRows=[]; // parsed rows pending confirmation
let currentImportTab='csv';

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

const ACCEPT_HINTS={ csv:'.csv · .tsv · .txt acceptés', xlsx:'.xlsx · .xls acceptés', pdf:'.pdf accepté' };

let importTarget='grille'; // 'grille' or 'qualimetre'

function openImportModal(target){
  importTarget=target||'grille';
  importRows=[]; currentImportTab='csv';
  el('imp-preview').style.display='none';
  el('imp-confirm-btn').disabled=true; el('imp-confirm-btn').style.opacity='.5';
  el('imp-count-btn').textContent='';
  el('pdf-note').style.display='none';
  el('imp-file-input').value='';
  el('imp-warnings').textContent='';
  // Update title to reflect target
  const targetLabel=importTarget==='qualimetre'?'Qualimètre':'Grille d\'audit';
  document.querySelector('#m-import .modal-title').innerHTML=`<i class="ti ti-upload" style="color:var(--primary)"></i> Importer — ${targetLabel}`;
  switchImportTab('csv');
  openModal('m-import');
}

function switchImportTab(tab){
  currentImportTab=tab;
  ['csv','xlsx','pdf'].forEach(t=>{
    const btn=el('tab-'+t);
    if(t===tab){ btn.style.background='var(--primary)'; btn.style.color='#fff'; }
    else { btn.style.background='var(--surface)'; btn.style.color='var(--text)'; }
  });
  el('imp-format-info').innerHTML=FORMAT_INFO[tab];
  el('imp-accept-hint').textContent=ACCEPT_HINTS[tab];
  const accepts={csv:'.csv,.tsv,.txt',xlsx:'.xlsx,.xls',pdf:'.pdf'};
  el('imp-file-input').accept=accepts[tab];
  el('pdf-note').style.display=tab==='pdf'?'':'none';
  clearImportPreview();
}

function clearImportPreview(){ importRows=[]; el('imp-preview').style.display='none'; el('imp-confirm-btn').disabled=true; el('imp-confirm-btn').style.opacity='.5'; el('imp-count-btn').textContent=''; }

function handleImportDrop(e){
  e.preventDefault();
  el('imp-drop').style.borderColor='var(--border)'; el('imp-drop').style.background='var(--bg)';
  const file=e.dataTransfer.files[0]; if(!file) return;
  processImportFile(file);
}
function handleImportFile(input){ const f=input.files[0]; if(f) processImportFile(f); input.value=''; }

function processImportFile(file){
  const name=file.name.toLowerCase();
  if(name.endsWith('.xlsx')||name.endsWith('.xls')){ importXLSX(file); }
  else if(name.endsWith('.pdf')){ importPDF(file); }
  else { importCSV(file); }
}

// ── CSV ──
function importCSV(file){
  const reader=new FileReader();
  reader.onload=e=>{ parseCSVText(e.target.result); };
  reader.readAsText(file,'UTF-8');
}
function parseCSVText(text){
  const lines=text.split(/\r?\n/).filter(l=>l.trim());
  const sep=lines[0].includes(';')?';':lines[0].includes('\t')?'\t':',';
  const rows=[];
  lines.forEach((line,idx)=>{
    const cols=line.split(sep).map(c=>c.trim().replace(/^["']|["']$/g,''));
    if(idx===0&&/rayon|categorie|intitul/i.test(cols[0])) return;
    if(cols.length<3) return;
    rows.push({ rayon:cols[0]||'', cat:cols[1]||'Général', q:cols[2]||'', crit:cols[3]||'Majeure', poids:cols[4]||'' });
  });
  showImportPreview(rows, `${lines.length} lignes lues`);
}

// ── XLSX ──
async function importXLSX(file){
  if(!XLSXLoaded){ try{ await loadScript(SHEETJS_URL); XLSXLoaded=true; } catch(e){ alert('Impossible de charger la librairie Excel. Vérifiez votre connexion internet.'); return; } }
  const reader=new FileReader();
  reader.onload=e=>{
    try{
      const wb=XLSX.read(new Uint8Array(e.target.result),{type:'array'});
      const ws=wb.Sheets[wb.SheetNames[0]];
      const raw=XLSX.utils.sheet_to_json(ws,{header:1,defval:''});
      // Detect header row
      let startIdx=0;
      const hdr=(raw[0]||[]).map(c=>String(c).toLowerCase());
      const colMap={rayon:-1,cat:-1,q:-1,crit:-1,poids:-1};
      hdr.forEach((h,i)=>{
        if(/rayon/.test(h)) colMap.rayon=i;
        else if(/cat/.test(h)) colMap.cat=i;
        else if(/intitul|question|point|contr/.test(h)) colMap.q=i;
        else if(/crit|gravit|niveau/.test(h)) colMap.crit=i;
        else if(/poids|weight|score/.test(h)) colMap.poids=i;
      });
      // If named columns found, use them; else fallback to positional
      const named=colMap.rayon>=0&&colMap.q>=0;
      if(named) startIdx=1;
      const rows=[];
      raw.slice(startIdx).forEach(row=>{
        if(!row.join('').trim()) return;
        if(named){
          rows.push({ rayon:String(row[colMap.rayon]||''), cat:String(row[colMap.cat>=0?colMap.cat:1]||'Général'), q:String(row[colMap.q]||''), crit:String(row[colMap.crit>=0?colMap.crit:3]||'Majeure'), poids:String(row[colMap.poids>=0?colMap.poids:4]||'') });
        } else {
          rows.push({ rayon:String(row[0]||''), cat:String(row[1]||'Général'), q:String(row[2]||''), crit:String(row[3]||'Majeure'), poids:String(row[4]||'') });
        }
      });
      showImportPreview(rows, `${raw.length} lignes lues depuis "${wb.SheetNames[0]}"`);
    } catch(err){ alert('Erreur lors de la lecture du fichier Excel : '+err.message); }
  };
  reader.readAsArrayBuffer(file);
}

// ── PDF ──
async function importPDF(file){
  if(!PDFJSLoaded){
    try{
      await loadScript(PDFJS_URL);
      pdfjsLib.GlobalWorkerOptions.workerSrc=`https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js`;
      PDFJSLoaded=true;
    } catch(e){ alert('Impossible de charger la librairie PDF. Vérifiez votre connexion internet.'); return; }
  }
  const reader=new FileReader();
  reader.onload=async e=>{
    try{
      const typedArray=new Uint8Array(e.target.result);
      const pdf=await pdfjsLib.getDocument({data:typedArray}).promise;
      let fullText='';
      for(let i=1;i<=pdf.numPages;i++){
        const page=await pdf.getPage(i);
        const content=await page.getTextContent();
        const lineMap={};
        content.items.forEach(item=>{
          const y=Math.round(item.transform[5]);
          if(!lineMap[y]) lineMap[y]=[];
          lineMap[y].push({x:item.transform[4],str:item.str});
        });
        Object.keys(lineMap).sort((a,b)=>b-a).forEach(y=>{
          const sorted=lineMap[y].sort((a,b)=>a.x-b.x);
          fullText+=sorted.map(i=>i.str).join('\t')+'\n';
        });
      }
      parseCSVText(fullText);
    } catch(err){ alert('Erreur lecture PDF : '+err.message); }
  };
  reader.readAsArrayBuffer(file);
}

// ── PREVIEW & VALIDATE ──
const VALID_RAYS=['Boucherie','Boulangerie','Drive','Marée','Charcuterie','Fromage','Fruits & Légumes'];
const VALID_CRITS=['Critique','Majeure','Mineure'];

function normalizeRayon(r){ return VALID_RAYS.find(x=>x.toLowerCase()===r.toLowerCase())||null; }
function normalizeCrit(c){ return VALID_CRITS.find(x=>x.toLowerCase()===c.toLowerCase())||null; }

function showImportPreview(rawRows, readMsg){
  importRows=[];
  const tbRows=[];
  const warnings=[];
  const defP={'Critique':10,'Majeure':5,'Mineure':2};

  rawRows.forEach((r,i)=>{
    if(!r.rayon&&!r.q) return;
    const rayon=normalizeRayon(r.rayon);
    const crit=normalizeCrit(r.crit)||'Majeure';
    const p=parseInt(r.poids)||defP[crit];
    const valid=!!rayon&&!!r.q.trim();
    if(!rayon) warnings.push(`Ligne ${i+2} : rayon « ${r.rayon} » non reconnu — sera ignorée`);
    importRows.push({rayon:rayon||r.rayon, cat:r.cat||'Général', q:r.q.trim(), crit, p, valid});
    tbRows.push({...importRows[importRows.length-1], raw:r, valid});
  });

  const validCount=importRows.filter(r=>r.valid).length;
  const skipCount=importRows.filter(r=>!r.valid).length;

  el('imp-preview').style.display='';
  el('imp-preview-title').textContent=`Aperçu — ${readMsg}`;
  el('imp-stats').textContent=`${validCount} à importer${skipCount?' · '+skipCount+' ignorées':''}`;

  el('imp-preview-tb').innerHTML=tbRows.map((r,i)=>`<tr style="background:${r.valid?'':'#fff8f8'}">
    <td style="padding:7px 12px;border-bottom:1px solid var(--border)">${r.valid?rIcon(r.rayon)+' '+r.rayon:'<span style="color:var(--danger)">⚠ '+r.rayon+'</span>'}</td>
    <td style="padding:7px 12px;border-bottom:1px solid var(--border)">${r.cat}</td>
    <td style="padding:7px 12px;border-bottom:1px solid var(--border);max-width:220px">${r.q||'<span style="color:var(--text3);font-style:italic">vide</span>'}</td>
    <td style="padding:7px 12px;border-bottom:1px solid var(--border)">${critBdg(r.crit)}</td>
    <td style="padding:7px 12px;border-bottom:1px solid var(--border)">${r.p}</td>
    <td style="padding:7px 12px;border-bottom:1px solid var(--border)">${r.valid?'<span style="color:var(--success)"><i class="ti ti-check"></i></span>':'<span style="color:var(--danger)"><i class="ti ti-x"></i></span>'}</td>
  </tr>`).join('');

  el('imp-warnings').innerHTML=warnings.length?'<div style="padding:8px;background:var(--warning-light);border-radius:var(--radius)">'+warnings.slice(0,8).join('<br>')+'</div>':'';

  if(validCount>0){
    el('imp-confirm-btn').disabled=false; el('imp-confirm-btn').style.opacity='1';
    el('imp-count-btn').textContent='('+validCount+')';
  } else {
    el('imp-confirm-btn').disabled=true; el('imp-confirm-btn').style.opacity='.5';
    el('imp-count-btn').textContent='';
  }
}

function confirmImport(){
  const toImport=importRows.filter(r=>r.valid);
  if(importTarget==='qualimetre'){
    if(!DB.qualimetreCustom) DB.qualimetreCustom={};
    const mid=v('qual-mag-sel');
    if(!mid){ alert('Sélectionnez d\'abord un magasin dans le Qualimètre.'); return; }
    toImport.forEach(r=>{
      if(!DB.qualimetreCustom[mid]) DB.qualimetreCustom[mid]={};
      if(!DB.qualimetreCustom[mid][r.rayon]) DB.qualimetreCustom[mid][r.rayon]=[];
      DB.qualimetreCustom[mid][r.rayon].push({id:'qcimp-'+uid(),cat:r.cat,q:r.q,p:r.p,c:r.crit});
    });
    save(); closeModal('m-import');
    showQualimetre();
  } else {
    toImport.forEach(r=>{
      if(!DB.grilleCustom[r.rayon]) DB.grilleCustom[r.rayon]=[];
      DB.grilleCustom[r.rayon].push({id:'imp-'+uid(),cat:r.cat,q:r.q,p:r.p,c:r.crit});
    });
    save(); closeModal('m-import');
    const rayon=el('grille-ray-sel').value||'Boucherie';
    showGrille(rayon);
  }
  // Toast
  const toast=document.createElement('div');
  toast.style.cssText='position:fixed;bottom:24px;right:24px;background:#16a34a;color:#fff;padding:12px 20px;border-radius:10px;font-size:13px;font-weight:500;z-index:9999;box-shadow:0 4px 20px rgba(0,0,0,.2);display:flex;align-items:center;gap:8px';
  toast.innerHTML='<i class="ti ti-circle-check" style="font-size:18px"></i> '+toImport.length+' point(s) importé(s)';
  document.body.appendChild(toast);
  setTimeout(()=>toast.remove(),3500);
}
