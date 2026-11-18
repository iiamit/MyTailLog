// Fits each web artboard to the width of its stage. Phone artboards are sized in CSS.
(function () {
  function fit(stage) {
    var board = stage.querySelector('.artboard');
    if (!board) return;
    var w = parseFloat(getComputedStyle(board).getPropertyValue('--w')) || 1440;
    if (stage.classList.contains('is-open')) { board.style.setProperty('--z', 1); return; }
    var cs = getComputedStyle(stage);
    var inner = stage.clientWidth - parseFloat(cs.paddingLeft) - parseFloat(cs.paddingRight);
    board.style.setProperty('--z', Math.min(1, inner / w).toFixed(4));
  }
  var q = new URLSearchParams(location.search);
  if (q.get('only')) {
    var keep = q.get('only').split(',');
    document.querySelectorAll('.g-shot, .g-phone').forEach(function (f) { if (keep.indexOf(f.id) === -1) f.remove(); });
    document.querySelectorAll('.g-top, .g-h1, .g-h2, .g-h3, .g-lede, .g-index, .g-prose, .g-note, .g-wrap > p, .g-wrap > ul, .g-tablewrap, .g-cols').forEach(function (e) { e.remove(); });
    document.querySelectorAll('.g-phones').forEach(function (r) { if (!r.children.length) r.remove(); });
  }
  if (q.get('open')) document.querySelectorAll('.g-stage').forEach(function (s) { s.classList.add('is-open'); });
  // ?bare=1 with ?only= renders one web artboard edge to edge, for thumbnails
  if (q.get('bare')) {
    var st = document.createElement('style');
    st.textContent = '.g-wrap{padding:0!important;max-width:none!important}.g-shot{margin:0!important}.g-shot>figcaption,.g-zoomhint{display:none!important}.g-stage{padding:0!important;border:0!important;border-radius:0!important}.g-stage .artboard{border-radius:0!important;box-shadow:none!important}';
    document.head.appendChild(st);
  }
  function all() { document.querySelectorAll('.g-stage').forEach(fit); }
  if ('ResizeObserver' in window) {
    var ro = new ResizeObserver(function (entries) { entries.forEach(function (e) { fit(e.target); }); });
    document.querySelectorAll('.g-stage').forEach(function (s) { ro.observe(s); });
  } else { window.addEventListener('resize', all); }
  all();
  // "View at full size" toggles: the stage scrolls instead of scaling.
  document.querySelectorAll('.g-zoomhint').forEach(function (btn) {
    btn.addEventListener('click', function () {
      var stage = btn.closest('.g-shot').querySelector('.g-stage');
      var open = stage.classList.toggle('is-open');
      btn.textContent = open ? 'Fit to width' : 'View at full size';
      fit(stage);
    });
  });
})();
