// ══════════════ DASHBOARD ══════════════
// Dépend de : storage.js (DB, CU), auth.js (hasPerm), ui.js

let _chartFsqs = null;
let _chartQual = null;

const CHART_COLORS = [
  '#0062ff','#ffee00','#10b981','#ef4444','#8b5cf6',
  '#06b6d4','#f97316','#84cc16','#ec4899','#6366f1'
];

function buildLineChart(canvasId, datasets, chartRef){
  const canvas = el(canvasId);
  if(!canvas) return null;
  if(chartRef) chartRef.destroy();
  return new Chart(canvas, {
    type: 'line',
    data: { datasets },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      interaction: { mode:'index', intersect:false },
      plugins: {
        legend: { position:'bottom', labels:{ boxWidth:12, font:{ size:12 } } },
        tooltip: { callbacks: { label: ctx => ` ${ctx.dataset.label} : ${ctx.parsed.y}%` } }
      },
      scales: {
        x: {
          type:'linear', title:{ display:true, text:'N° audit', font:{ size:12 } },
          ticks:{ stepSize:1 }, min:1
        },
        y: {
          min:0, max:100,
          title:{ display:true, text:'Score (%)', font:{ size:12 } },
          ticks:{ callback: v => v+'%' }
        }
      }
    }
  });
}

function buildBarChart(canvasId, labels, data, colors, chartRef){
  const canvas = el(canvasId);
  if(!canvas) return null;
  if(chartRef) chartRef.destroy();
  return new Chart(canvas, {
    type: 'bar',
    data: {
      labels,
      datasets: [{
        label: 'Score moyen',
        data,
        backgroundColor: colors.map(c=>c+'99'),
        borderColor: colors,
        borderWidth: 2,
        borderRadius: 6
      }]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        legend: { display: false },
        tooltip: { callbacks: { label: ctx => ` Score moyen : ${ctx.parsed.y}%` } }
      },
      scales: {
        y: {
          min: 0, max: 100,
          ticks: { callback: v => v+'%' }
        }
      }
    }
  });
}
// ══════════════ DASHBOARD FSQS ══════════════
function renderDash(){
  const mids=visibleMids();
  const myAudits=DB.audits.filter(a=>mids.includes(a.mid));
  const myNcs=DB.ncs.filter(n=>mids.includes(n.mid));
  const myActions=DB.actions.filter(a=>a.statut!=='Traitée'&&overdue(a.ech));

  const openNc=myNcs.filter(n=>n.statut==='Ouverte').length;
  const ret=myActions.length;
  const avg=myAudits.length?Math.round(myAudits.reduce((s,a)=>s+a.score,0)/myAudits.length):null;
  el('d-audits').textContent=myAudits.length;
  el('d-nc').textContent=openNc;
  el('d-ret').textContent=ret;
  el('d-score').textContent=avg!==null?avg+'%':'–';
  const nb=el('nc-bdg'); if(nb) nb.textContent=openNc;

  renderRayonDash();
  renderChartFsqs(mids, myAudits);

  const la=el('d-last');
  if(!myAudits.length){
    la.innerHTML=`<tr><td colspan="7"><div class="empty-state" style="padding:24px"><i class="ti ti-clipboard-check" style="font-size:28px"></i><p>Aucun audit</p></div></td></tr>`;
    renderAlertsDash(); renderDashQual(); return;
  }
  la.innerHTML=[...myAudits].reverse().slice(0,5).map(a=>`<tr>
    <td>${a.mag}</td>
    <td style="display:flex;align-items:center;gap:6px;padding-top:14px">${rIcon(a.rayon)} ${a.rayon}</td>
    <td>${fd(a.date)}</td><td>${a.aud}</td>
    <td>${sbadge(a.score)}</td>
    <td style="color:${a.nc>0?'var(--danger)':'var(--success)'};font-weight:600">${a.nc}</td>
    <td><button class="btn btn-secondary btn-sm" onclick="showAud('${a.id}')"><i class="ti ti-eye"></i></button></td>
  </tr>`).join('');
  renderAlertsDash();
  renderDashQual();
}

function renderChartFsqs(mids, myAudits){
  const myMags=DB.magasins.filter(m=>mids.includes(m.id));
  const magsAvecAudits=myMags.map((m,i)=>{
    const audits=myAudits.filter(a=>a.mid===m.id);
    if(!audits.length) return null;
    const avg=Math.round(audits.reduce((s,a)=>s+a.score,0)/audits.length);
const GREENS=['#16a34a','#15803d','#22c55e','#4ade80','#86efac'];
const YELLOWS=['#ca8a04','#a16207','#eab308','#facc15','#fde047'];
const ORANGES=['#ea580c','#c2410c','#f97316','#fb923c','#fdba74'];
const REDS=['#dc2626','#b91c1c','#ef4444','#f87171','#fca5a5'];
const palette=avg>=90?GREENS:avg>=75?YELLOWS:avg>=60?ORANGES:REDS;
const color=palette[i % palette.length];
return { nom: m.nom, avg, color };
  }).filter(Boolean);

  const wrap=el('d-mag');
  if(!wrap) return;
  if(!magsAvecAudits.length){
    wrap.innerHTML='<div class="empty-state" style="padding:24px"><i class="ti ti-chart-bar" style="font-size:28px"></i><p>Aucune donnée</p></div>';
    return;
  }
  wrap.innerHTML='<div style="position:relative;height:260px"><canvas id="chart-fsqs"></canvas></div>';
  _chartFsqs = buildBarChart(
    'chart-fsqs',
    magsAvecAudits.map(m=>m.nom),
    magsAvecAudits.map(m=>m.avg),
    magsAvecAudits.map(m=>m.color),
    _chartFsqs
  );
}
function renderRayonDash(){
  const mids=visibleMids();
  const sel=el('d-ray-mag-filter');
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
    if(!visibleMids().includes(a.mid)) return false;
    if(filterMid && a.mid!==filterMid) return false;
    return true;
  });
  el('d-ray').innerHTML=RAYS.map(r=>{
    const ra=auditsBase.filter(a=>a.rayon===r);
    const s=ra.length?Math.round(ra.reduce((sum,a)=>sum+a.score,0)/ra.length):null;
    return `<div style="display:flex;align-items:center;gap:10px;margin-bottom:14px">${rIcon(r)}<div style="flex:1"><div style="display:flex;justify-content:space-between;margin-bottom:4px"><span style="font-size:13px;font-weight:500">${r}</span><span style="font-size:13px;font-weight:700;color:${s!==null?sc(s):'var(--text3)'}">${s!==null?s+'%':'–'}</span></div>${s!==null?pbar(s):''}</div></div>`;
  }).join('');
}

// ══════════════ DASHBOARD QUALIMÈTRE ══════════════
function renderDashQual(){
  const mids=visibleMids();
  const qAudits=(DB.qualAudits||[]).filter(a=>mids.includes(a.mid));

  el('dq-audits').textContent=qAudits.length;
  const totalNc=qAudits.reduce((s,a)=>s+(a.nc||0),0);
  el('dq-nc').textContent=totalNc;
  const avg=qAudits.length?Math.round(qAudits.reduce((s,a)=>s+(a.score||0),0)/qAudits.length):null;
  el('dq-score').textContent=avg!==null?avg+'%':'–';
  const magsAudites=new Set(qAudits.map(a=>a.mid)).size;
  el('dq-mags').textContent=magsAudites;

  renderChartQual(mids, qAudits);

  // Top zones NC
  const zoneCount={};
  qAudits.forEach(a=>(a.zones||[]).forEach(z=>{ if(z.nc) zoneCount[z.nom]=(zoneCount[z.nom]||0)+z.nc; }));
  const zones=Object.entries(zoneCount).sort((a,b)=>b[1]-a[1]).slice(0,5);
  el('dq-zones').innerHTML=zones.length
    ? zones.map(([nom,cnt])=>`<div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:10px"><span style="font-size:13px">${nom}</span><span class="badge b-open">${cnt} NC</span></div>`).join('')
    : '<div class="empty-state" style="padding:24px"><i class="ti ti-circle-check" style="font-size:28px;color:#16a34a"></i><p>Aucune NC</p></div>';

  // Derniers audits
  const tbody=el('dq-last');
  if(!qAudits.length){
    tbody.innerHTML=`<tr><td colspan="7"><div class="empty-state" style="padding:24px"><i class="ti ti-rosette" style="font-size:28px"></i><p>Aucun audit Qualimètre</p></div></td></tr>`;
    return;
  }
  tbody.innerHTML=[...qAudits].reverse().slice(0,5).map(a=>{
    const mag=DB.magasins.find(m=>m.id===a.mid);
    return `<tr>
      <td>${a.num||'–'}</td>
      <td>${mag?mag.nom:'–'}</td>
      <td>${fd(a.date)}</td>
      <td>${a.aud||'–'}</td>
      <td>${a.score!=null?sbadge(a.score):'–'}</td>
      <td style="color:${(a.nc||0)>0?'var(--danger)':'var(--success)'};font-weight:600">${a.nc||0}</td>
      <td><button class="btn btn-secondary btn-sm" onclick="navigate('audit-qualimetre')"><i class="ti ti-eye"></i></button></td>
    </tr>`;
  }).join('');
}

function renderChartQual(mids, qAudits){
  const myMags=DB.magasins.filter(m=>mids.includes(m.id));
  const datasets=myMags.map((m,i)=>{
    const audits=[...qAudits].filter(a=>a.mid===m.id).sort((a,b)=>a.id>b.id?1:-1);
    return {
      label: m.nom,
      data: audits.map((a,idx)=>({ x: idx+1, y: a.score||0 })),
      borderColor: CHART_COLORS[i % CHART_COLORS.length],
      backgroundColor: CHART_COLORS[i % CHART_COLORS.length]+'22',
      tension: 0.3, pointRadius: 4, fill: false
    };
  }).filter(d=>d.data.length>0);

  const wrap=el('dq-mag');
  if(!wrap) return;
  if(!datasets.length){
    wrap.innerHTML='<div class="empty-state" style="padding:24px"><i class="ti ti-chart-line" style="font-size:28px"></i><p>Aucune donnée</p></div>';
    return;
  }
  wrap.innerHTML='<div style="position:relative;height:260px"><canvas id="chart-qual"></canvas></div>';
  _chartQual = buildLineChart('chart-qual', datasets, _chartQual);
}

// ══════════════ ONGLETS DASHBOARD ══════════════
function switchDashTab(tab){
  const isFsqs=tab==='fsqs';
  const btnFsqs=el('dash-tab-fsqs');
  const btnQual=el('dash-tab-qual');
  if(btnFsqs){ btnFsqs.style.background=isFsqs?'var(--primary)':'transparent'; btnFsqs.style.color=isFsqs?'#fff':'var(--text2)'; }
  if(btnQual){ btnQual.style.background=!isFsqs?'#7c3aed':'transparent'; btnQual.style.color=!isFsqs?'#fff':'var(--text2)'; }
  const pFsqs=el('dash-fsqs'); const pQual=el('dash-qual');
  if(pFsqs) pFsqs.style.display=isFsqs?'':'none';
  if(pQual) pQual.style.display=!isFsqs?'':'none';
}