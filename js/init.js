// ══════════════ INIT ══════════════
// Dépend de : storage.js (DB, CU), config.js, ui.js

// ══════════════ INIT ══════════════
document.addEventListener('DOMContentLoaded',()=>{
  document.querySelectorAll('.modal-ov').forEach(m=>m.addEventListener('click',e=>{if(e.target===m)m.classList.remove('open');}));
});
</script>
<!-- MODAL: QUALIMÈTRE POINT DE CONTRÔLE -->
<div class="modal-ov" id="m-qual-ctrl">
  <div class="modal">
    <div class="modal-hdr">
      <div class="modal-title" id="m-qual-ctrl-ttl"><i class="ti ti-gauge" style="color:#7c3aed"></i> Nouveau point Qualimètre</div>
      <button class="btn-x" onclick="closeModal('m-qual-ctrl')">&times;</button>
    </div>
    <div class="modal-body">
      <div class="form-err" id="qual-ctrl-err"></div>
      <input type="hidden" id="qc-id">
      <input type="hidden" id="qc-mid">
      <div class="form-row">
        <div class="form-group">
          <label class="form-label">Rayon *</label>
          <select class="form-control" id="qc-rayon">
            <option>Boucherie</option><option>Boulangerie</option><option>Drive</option><option>Marée</option><option>Charcuterie</option><option>Fromage</option><option>Fruits & Légumes</option>
          </select>
        </div>
        <div class="form-group">
          <label class="form-label">Catégorie</label>
          <input class="form-control" id="qc-cat" placeholder="ex : Température, Hygiène...">
        </div>
      </div>