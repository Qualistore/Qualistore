// ══════════════ CLIENT SUPABASE ══════════════
const SUPA_URL = 'https://jztacnkvmuhouhhapjen.supabase.co';
const SUPA_KEY = 'sb_publishable_HuVt2NSLrCfUvKcgXI7Byg_Jkq96fB9';

async function supaFetch(path, options={}){
  const res = await fetch(SUPA_URL+path, {
    ...options,
    headers: {
      'apikey': SUPA_KEY,
      'Authorization': 'Bearer '+SUPA_KEY,
      'Content-Type': 'application/json',
      'Prefer': 'return=representation',
      ...(options.headers||{})
    }
  });
  if(!res.ok){ const e=await res.text(); console.error('Supabase error:', e); return null; }
  const text=await res.text();
  return text ? JSON.parse(text) : [];
}

async function sbSelect(table){
  return await supaFetch('/rest/v1/'+table+'?select=*') || [];
}
async function sbUpsert(table, rows){
  if(!rows||!rows.length) return;
  // Normaliser : tous les objets doivent avoir les mêmes clés
  const keys=[...new Set(rows.flatMap(r=>Object.keys(r)))];
  const normalized=rows.map(r=>{
    const obj={};
    keys.forEach(k=>{ obj[k]=r[k]!==undefined?r[k]:null; });
    return obj;
  });
  return await supaFetch('/rest/v1/'+table, {
    method: 'POST',
    headers: { 'Prefer': 'resolution=merge-duplicates,return=representation' },
    body: JSON.stringify(normalized)
  });
}
async function sbDeleteAll(table){
  return await supaFetch('/rest/v1/'+table+'?id=neq.___none___', { method:'DELETE' });
}
async function sbDeleteWhere(table, col, val){
  return await supaFetch('/rest/v1/'+table+'?'+col+'=eq.'+encodeURIComponent(val), { method:'DELETE' });
}
async function sbUploadPhoto(file, path){
  const res=await fetch(SUPA_URL+'/storage/v1/object/photos/'+path, {
    method:'POST',
    headers:{
      'apikey': SUPA_KEY,
      'Authorization': 'Bearer '+SUPA_KEY,
      'Content-Type': file.type,
      'x-upsert': 'true'
    },
    body: file
  });
  if(!res.ok){ console.error('Upload photo échoué'); return null; }
  return SUPA_URL+'/storage/v1/object/public/photos/'+path;
}

async function sbDeletePhoto(path){
  return await supaFetch('/storage/v1/object/photos/'+path, { method:'DELETE' });
}