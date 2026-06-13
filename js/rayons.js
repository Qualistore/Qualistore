// ══════════════ RAYONS ══════════════
// Dépend de : storage.js (DB, CU), auth.js (hasPerm), ui.js

function renderRay(){
  const mids=visibleMids();
  const sel=el('flt-ray-mag');
  if(sel){
    const curVal=sel.value;
    while(sel.options.length>1) sel.remove(1);
    DB.magasins.filter(m=>mids.includes(m.id)).forEach(m=>{
      const o=document.createElement('option'); o.value=m.id; o.textContent=m.nom; sel.appendChild(o);
    });
    if(curVal) sel.value=curVal;
  }
  const filterMid=sel?sel.value:'';
  const RAYS=['Boucherie','Boulangerie','Drive','Marée','Charcuterie','Fromage','Fruits & Légumes'];
  const auditsBase=DB.audits.filter(a=>{
    if(!mids.includes(a.mid)) return false;
    if(filterMid && a.mid!==filterMid) return false;
    return true;
  });
  const grid=el('ray-grid');
  grid.innerHTML=RAYS.map(r=>{
    const ra=auditsBase.filter(a=>a.rayon===r);
    const s=ra.length?Math.round(ra.reduce((sum,a)=>sum+a.score,0)/ra.length):null;
    const last=ra.length?[...ra].sort((a,b)=>a.date>b.date?-1:1)[0]:null;
    return `<div class="card">
      <div class="card-hdr">
        <div style="display:flex;align-items:center;gap:10px">
          ${rIcon(r)}
          <div class="card-title">${r}</div>
        </div>
        ${s!==null?`<span class="score-badge ${scCls(s)}">${s}%</span>`:''}
      </div>
      <div class="card-body">
        <div style="display:flex;justify-content:space-around;margin-bottom:14px">
          <div style="text-align:center">
            <div style="font-size:22px;font-weight:700;color:var(--primary)">${ra.length}</div>
            <div class="tsm tm">Audits</div>
          </div>
          <div style="text-align:center">
            <div style="font-size:22px;font-weight:700;color:${s!==null?sc(s):'var(--text3)'}">${s!==null?s+'%':'–'}</div>
            <div class="tsm tm">Score moy.</div>
          </div>
        </div>
        ${s!==null?pbar(s):''}
        ${last?`<div class="tsm tm" style="margin-top:10px"><i class="ti ti-calendar"></i> Dernier audit : ${fd(last.date)}</div>`:'<div class="tsm tm" style="margin-top:10px">Aucun audit</div>'}
      </div>
    </div>`;
  }).join('');
}