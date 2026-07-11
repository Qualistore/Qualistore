function navigate(pageId) {
  document.querySelectorAll('.page').forEach(p => p.classList.remove('active'));
  document.querySelectorAll('.nav-item').forEach(n => n.classList.remove('active'));

  const targetPage = el(`page-${pageId}`);
  if (!targetPage) return;

  targetPage.classList.add('active');
  el(`nav-${pageId}`)?.classList.add('active');
}


/**
 * Raccourci pour getElementById.
 * @param {string} id
 * @returns {HTMLElement | null}
 */
function el(id)        { return document.getElementById(id); }

/**
 * Récupère la valeur d'un input/select par son id.
 * @param {string} id
 * @returns {string}
 */
function v(id)         { return el(id).value; }