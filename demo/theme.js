// Picks the look before first paint, so the page never flashes the other one.
// War Room (Career Arsenal) is the default. Mission Control, the graphite original, is still here:
// choose it under Settings > Look, or open "?theme=graphite". "/warroom" always opens the War Room.
(function () {
  var t = '';
  try { t = localStorage.getItem('mc-theme') || ''; } catch (e) { /* private mode: default look */ }
  var q = (location.search.match(/[?&]theme=(warroom|graphite)\b/) || [])[1];
  if (location.pathname === '/warroom') t = 'warroom';
  else if (q) t = q;
  if (t === 'graphite') return;
  document.documentElement.dataset.theme = 'warroom';
  document.title = 'Career Arsenal · War Room';
  var icon = document.createElement('link');
  icon.rel = 'icon'; icon.type = 'image/svg+xml'; icon.href = 'career-arsenal-mark.svg';
  document.head.appendChild(icon);
})();
