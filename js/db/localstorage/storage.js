// ══════════════ STORAGE — moteur bas niveau ══════════════
// Dépend de : config.js (SK)
// Expose : DB, loadDB(), save(), uid(), CU
 
function loadDB(){
  try{ const r=localStorage.getItem(SK); if(r) return JSON.parse(r); }catch(e){}
  return {
    users:[{id:'admin1',nom:'Administrateur',login:'admin',pwd:btoa('admin'),role:'admin',statut:'actif',magasins:[],
      perms:{'aud-r':1,'aud-w':1,'nc':1,'ac':1,'mag':1,'rap':1,'grille':1,'usr':1}}],
    magasins:[], audits:[], ncs:[], actions:[], alertes:[],
    grilleCustom:{}, qualimetreCustom:{}, qualAudits:[],
    nAud:1, nNc:1, nAc:1, nAl:1, nQAud:1
  };
}
function save(){ localStorage.setItem(SK,JSON.stringify(DB)); }
function uid(){ return Date.now().toString(36)+Math.random().toString(36).slice(2,6); }

let DB = loadDB();
let CU = null; // current user