// ═══════════════════════════════════════════════
// ██ UI HELPERS
// ═══════════════════════════════════════════════

function toggleSidebar() {
  document.getElementById('sidebar').classList.toggle('collapsed');
}

// Collapsible "View" disclosure — reveals/hides the three map-view toggles.
function toggleMapOptions(btn) {
  const el = document.getElementById('map-options');
  const nowCollapsed = el.classList.toggle('collapsed');
  btn.setAttribute('aria-expanded', nowCollapsed ? 'false' : 'true');
}

// Collapsible Game Completion card — its header toggles the whole body.
function toggleGameProgress(btn) {
  const el = document.getElementById('game-progress');
  const nowCollapsed = el.classList.toggle('collapsed');
  btn.setAttribute('aria-expanded', nowCollapsed ? 'false' : 'true');
}

// "Highlight markers" View toggle — a blue halo around every marker (a body
// class so it persists across region switches and covers future markers).
function toggleHighlight() {
  const on = document.getElementById('toggle-highlight').checked;
  document.body.classList.toggle('highlight-markers', on);
}

function switchSide(side) {
  const panel = document.getElementById(`side-panel-${side}`);
  if (!panel) return;   // unknown side (e.g. old saved 'info' tab) — keep current
  document.querySelectorAll('.rail-btn').forEach(b => {
    const on = b.id === `rail-${side}`;
    b.classList.toggle('active', on);
    b.setAttribute('aria-selected', on ? 'true' : 'false');
  });
  document.querySelectorAll('.side-panel').forEach(p => p.classList.remove('active'));
  panel.classList.add('active');
  try { localStorage.setItem(CONFIG.storageKeys.activeTab, side); } catch (e) { /* private mode */ }
}

function showToast(message) {
  const toast = document.getElementById('toast');
  toast.textContent = message;
  toast.classList.add('show');
  setTimeout(() => toast.classList.remove('show'), 2500);
}

// ── Modal focus management: trap Tab inside a modal, restore focus on close ──
let _modalOpener = null;
function _restoreModalFocus() {
  if (_modalOpener && typeof _modalOpener.focus === 'function') _modalOpener.focus();
  _modalOpener = null;
}
function _trapModalTab(e, overlay) {
  if (e.key !== 'Tab') return;
  const f = [...overlay.querySelectorAll(
    'a[href], button:not([disabled]), input:not([disabled]), textarea:not([disabled]), select:not([disabled]), [tabindex]:not([tabindex="-1"])'
  )].filter(el => el.offsetParent !== null);
  if (!f.length) return;
  const first = f[0], last = f[f.length - 1];
  if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus(); }
  else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
}

// Themed confirm dialog — returns a Promise<boolean>. Replaces window.confirm().
let _confirmResolve = null;
function showConfirm(message, { title = 'Are you sure?', confirmText = 'Confirm', danger = false } = {}) {
  return new Promise(resolve => {
    _confirmResolve = resolve;
    document.getElementById('confirm-title').textContent = title;
    document.getElementById('confirm-message').textContent = message;
    const ok = document.getElementById('confirm-ok');
    ok.textContent = confirmText;
    ok.classList.toggle('btn-danger', danger);
    ok.classList.toggle('btn-primary', !danger);
    _modalOpener = document.activeElement;
    document.getElementById('confirm-modal').classList.add('show');
    ok.focus();
  });
}
function _confirmClose(result) {
  document.getElementById('confirm-modal').classList.remove('show');
  _restoreModalFocus();
  const r = _confirmResolve; _confirmResolve = null;
  if (r) r(result);
}
// ── Keyboard shortcuts ──
function _isTypingTarget(el) {
  return !!el && (el.tagName === 'INPUT' || el.tagName === 'TEXTAREA' ||
    el.tagName === 'SELECT' || el.isContentEditable);
}
// Close the single topmost overlay, in priority order. Returns true if it closed one.
function closeTopmostOverlay() {
  const confirmModal = document.getElementById('confirm-modal');
  if (confirmModal && confirmModal.classList.contains('show')) { _confirmClose(false); return true; }
  const importAll = document.getElementById('import-all-modal');
  if (importAll && importAll.classList.contains('show')) { closeImportAllModal(); return true; }
  const panels = [['calibration-panel', calClose], ['label-edit-panel', labelEditClose], ['marker-edit-panel', markerEditClose]];
  for (const [id, close] of panels) {
    const p = document.getElementById(id);
    if (p && p.classList.contains('active')) { close(); return true; }
  }
  const sr = document.getElementById('search-results');
  if (sr && sr.classList.contains('active')) { sr.classList.remove('active'); return true; }
  if (typeof legendOpen !== 'undefined' && legendOpen) { toggleLegend(); return true; }
  if (map && map._popup) { map.closePopup(); return true; }
  return false;
}
document.addEventListener('keydown', e => {
  // "/" jumps to search (unless you're already typing in a field)
  if (e.key === '/' && !_isTypingTarget(e.target)) {
    const s = document.getElementById('search-input');
    if (s) { e.preventDefault(); s.focus(); s.select(); }
    return;
  }
  // Esc closes the topmost overlay (confirm → modal → tool panel → search → legend → popup)
  if (e.key === 'Escape') closeTopmostOverlay();
  // Enter / Space activates a keyboard-focused category row or group header
  if ((e.key === 'Enter' || e.key === ' ') && e.target && e.target.classList &&
      (e.target.classList.contains('category-item') || e.target.classList.contains('cat-group-header'))) {
    e.preventDefault();
    e.target.click();
  }
});

// ── Map view controls (U2/U3) ──
function resetView() {
  if (map && currentRegionBounds) map.fitBounds(currentRegionBounds);
}
function toggleFullscreen() {
  const doc = document;
  if (!doc.fullscreenElement && !doc.webkitFullscreenElement) {
    const el = doc.documentElement;
    (el.requestFullscreen || el.webkitRequestFullscreen || (() => {})).call(el);
  } else {
    (doc.exitFullscreen || doc.webkitExitFullscreen || (() => {})).call(doc);
  }
}
document.addEventListener('fullscreenchange', () => { if (map) map.invalidateSize(); });
function copyCurrentLink() {
  // The hash is kept in sync with the view (and the open marker), so href IS the permalink.
  const link = location.href;
  if (navigator.clipboard) {
    navigator.clipboard.writeText(link)
      .then(() => showToast('Link copied to clipboard'))
      .catch(() => showToast('Copy failed — check browser permissions'));
  } else {
    showToast('Clipboard unavailable in this browser');
  }
}

// ── One-time "right-click to add" hint (U7) ──
function dismissMapHint() {
  const h = document.getElementById('map-hint');
  if (h) h.classList.remove('show');
  try { localStorage.setItem(CONFIG.storageKeys.mapHintDismissed, '1'); } catch (e) { /* private mode */ }
}
function maybeShowMapHint() {
  let dismissed = false;
  try { dismissed = localStorage.getItem(CONFIG.storageKeys.mapHintDismissed) === '1'; } catch (e) { /* ignore */ }
  if (dismissed) return;
  const h = document.getElementById('map-hint');
  if (h) h.classList.add('show');
}


// ── Cinematic intro overlay ──
function dismissIntro() {
  const o = document.getElementById('intro-overlay');
  if (o) o.classList.add('done');
}
// Fade the intro once the map is ready. First visit lingers long enough to read
// the crest; return visits get just a brief themed veil over the load.
function scheduleIntroDismiss(startedAt) {
  let seen = false;
  try { seen = localStorage.getItem('kcd2_splash_seen') === '1'; } catch (e) { /* private mode */ }
  try { localStorage.setItem('kcd2_splash_seen', '1'); } catch (e) { /* private mode */ }
  const minShow = seen ? 550 : 1600;
  const elapsed = (typeof startedAt === 'number') ? (performance.now() - startedAt) : minShow;
  setTimeout(dismissIntro, Math.max(0, minShow - elapsed));
}


// ═══════════════════════════════════════════════
// ██ INIT
// ═══════════════════════════════════════════════

window.addEventListener('DOMContentLoaded', init);
// Safety net: never let the intro overlay get stuck if init throws mid-load.
window.addEventListener('DOMContentLoaded', () => setTimeout(dismissIntro, 4000));
