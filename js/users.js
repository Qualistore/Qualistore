// ══════════════ USERS ══════════════
// Dépend de : storage.js (DB, CU), auth.js (hasPerm), ui.js

// ══════════════ UTILISATEURS ══════════════

function toggleAllMags(sel){ document.querySelectorAll('.mcb').forEach(c=>c.checked=sel); }

function renderUsers(){
  const tb=el('usr-tb'); el('usr-cnt').textContent=DB.users.length+' utilisateur(s)';
  const can=hasPerm('usr'); el('btn-add-usr').style.display=can?'':'none';
  const soloAdmin=DB.users.filter(u=>u.role==='admin'&&u.statut==='actif').length<=1;
  tb.innerHTML=DB.users.map(u=>{
    const mags=u.role==='admin'?'<span class="tm tsm">Tous</span>':u.magasins&&u.magasins.length?u.magasins.map(id=>(DB.magasins.find(m=>m.id===id)||{}).nom||id).map(n=>`<span class="tag">${n}</span>`).join(''):'<span class="badge b-prog">Aucun</span>';
    const lockedAdmin=u.role==='admin'&&soloAdmin;
    return `<tr>
      <td><div style="display:flex;align-items:center;gap:8px">
        <div class="avatar" style="background:var(--primary-light);color:var(--primary)">${u.nom.split(' ').map(p=>p[0]).join('').slice(0,2).toUpperCase()}</div>
        <div><div style="font-weight:500">${u.nom}</div><div class="tsm tm">${u.login}</div></div>
      </div></td>
      <td class="tsm tm">${u.login}</td>
      <td>${roleBdg(u.role)}</td>
      <td style="max-width:200px">${mags}</td>
      <td><span class="badge ${u.statut==='actif'?'b-done':'b-open'}">${u.statut}</span></td>
      <td><div class="act-btns">
        ${can?`<button class="btn btn-secondary btn-sm" onclick="openUserModal('${u.id}')"><i class="ti ti-pencil"></i></button>${!lockedAdmin?`<button class="btn btn-danger btn-sm" onclick="confirmDel('user','${u.id}','${u.nom.replace(/'/g,"\\'")}')"><i class="ti ti-trash"></i></button>`:''}`:'' }
      </div></td>
    </tr>`;
  }).join('');
}

function openUserModal(id){
  const isEdit=!!id;
  el('m-user-ttl').innerHTML=isEdit?'<i class="ti ti-user-edit" style="color:var(--primary)"></i> Modifier l\'utilisateur':'<i class="ti ti-user-plus" style="color:var(--primary)"></i> Nouvel utilisateur';
  el('u-err').classList.remove('show');
  el('u-mdp-hint').style.display=isEdit?'':'none';
  const cb=el('u-mag-cbs');
  cb.innerHTML=DB.magasins.length?DB.magasins.map(m=>`<label class="cb-item"><input type="checkbox" value="${m.id}" class="mcb"> ${m.nom}</label>`).join(''):'<span class="tm tsm">Aucun magasin créé</span>';
  if(isEdit){
    const u=DB.users.find(x=>x.id===id); if(!u) return;
    sv('u-id',u.id); sv('u-nom',u.nom); sv('u-login',u.login); sv('u-mdp',''); el('u-statut').value=u.statut; el('u-role').value=u.role;
    document.querySelectorAll('.mcb').forEach(c=>{ c.checked=(u.magasins||[]).includes(c.value); });
    PIDS.forEach(p=>{ const e=el('p-'+p); if(e) e.checked=!!(u.perms||{})[p]; });
    onRoleChange(false);
  } else {
    sv('u-id',''); ['u-nom','u-login','u-mdp'].forEach(i=>sv(i,'')); el('u-statut').value='actif'; el('u-role').value='';
    PIDS.forEach(p=>{ const e=el('p-'+p); if(e) e.checked=false; });
    el('u-mag-grp').style.display='none';
  }
  openModal('m-user');
}
function onRoleChange(apply){
  const r=el('u-role').value;
  // Show magasin selector for all non-admin roles
  el('u-mag-grp').style.display=(r&&r!=='admin')?'':'none';
  // Associé = direction: pre-check all magasins
  if(apply!==false&&r==='direction'){ document.querySelectorAll('.mcb').forEach(c=>c.checked=true); }
  if(apply!==false&&DPERMS[r]){ PIDS.forEach(p=>{ const e=el('p-'+p); if(e) e.checked=!!DPERMS[r][p]; }); }
}
function saveUser(){
  const id=v('u-id'), nom=v('u-nom').trim(), login=v('u-login').trim(), mdp=v('u-mdp'), role=el('u-role').value, statut=el('u-statut').value;
  const err=el('u-err');
  if(!nom||!login||!role){ err.textContent='Nom, identifiant et rôle sont requis.'; err.classList.add('show'); return; }
  if(!id&&!mdp){ err.textContent='Un mot de passe est requis pour un nouvel utilisateur.'; err.classList.add('show'); return; }
  if(DB.users.find(u=>u.login===login&&u.id!==id)){ err.textContent='Cet identifiant est déjà utilisé.'; err.classList.add('show'); return; }
  const mags=role==='admin'?[]:([...document.querySelectorAll('.mcb:checked')].map(c=>c.value));
  const perms={}; PIDS.forEach(p=>{ const e=el('p-'+p); if(e) perms[p]=e.checked?1:0; });
  if(id){
    const u=DB.users.find(x=>x.id===id); if(!u) return;
    u.nom=nom; u.login=login; u.role=role; u.statut=statut; u.magasins=mags; u.perms=perms;
    if(mdp) u.pwd=btoa(mdp);
    if(CU&&CU.id===id){ CU=u; updateSBUser(); buildSidebar(); }
  } else {
    DB.users.push({id:uid(),nom,login,pwd:btoa(mdp),role,statut,magasins:mags,perms});
  }
  save(); closeModal('m-user'); renderUsers();
}