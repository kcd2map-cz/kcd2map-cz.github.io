// ═══════════════════════════════════════════════
// ██ MARKER CREATION
// ═══════════════════════════════════════════════

function createMarkerIcon(emoji, color, size = 28, categoryId = '', glowColor = '') {
  // Use extracted game icon if available — no circle background
  const iconMap = window.ICON_MAP || {};
  const iconPath = iconMap[categoryId];

  if (iconPath) {
    return L.divIcon({
      className: 'poi-marker',
      html: `<img src="${iconPath}" style="--glow:${glowColor || 'transparent'};width:${size}px;height:${size}px;object-fit:contain;display:block;" alt="">`,
      iconSize: [size, size],
      iconAnchor: [size / 2, size / 2],
      popupAnchor: [0, -size / 2],
    });
  }

  // Fallback: emoji icon with circle
  return L.divIcon({
    className: '',
    html: `<div class="custom-marker-icon" style="background:${color};width:${size}px;height:${size}px;font-size:${size * 0.5}px;">${emoji}</div>`,
    iconSize: [size, size],
    iconAnchor: [size / 2, size / 2],
    popupAnchor: [0, -size / 2],
  });
}

// Display name for a POI marker. Main-story quests (§ quest_main) show their
// Czech name when the map language is Čeština — the stored data stays English so
// edits, exports and the quests-en.txt/quests-cz.txt pairing never drift.
// Falls back to the stored name (e.g. user-renamed markers, unknown quests).
function localizedMarkerName(m) {
  if (m && currentLang === 'cs' && m.category === 'quest_main' && window.QUEST_NAME_CS) {
    return window.QUEST_NAME_CS[m.name] || m.name;
  }
  return m ? m.name : '';
}

function addPoiMarker(markerData) {
  const cat = categoriesById[markerData.category];
  if (!cat) {
    console.warn(`[KCD2 Map] Skipped marker "${markerData.name}" — category "${markerData.category}" not found`);
    return;
  }

  const icon = createMarkerIcon(cat.icon, cat.color, 28, cat.id, categoryGroupColor(cat.id));
  const marker = L.marker([markerData.y, markerData.x], { icon, draggable: true });
  marker.bindTooltip(escapeHtml(localizedMarkerName(markerData)), { direction: 'top', offset: [0, -16], opacity: 0.95, className: 'poi-tooltip' });

  const markerKey = getMarkerKey(markerData);
  const isItem = ITEM_CATEGORIES.has(markerData.category);
  const doneLabel = isItem ? tr('✓ Collected') : tr('✓ Discovered');
  const undoneLabel = isItem ? tr('☐ Mark as Collected') : tr('☐ Mark as Discovered');
  const btnId = `prog-${markerKey.replace(/[^a-zA-Z0-9]/g, '_')}`;

  marker.on('popupopen', () => updateHashWithMarker(markerKey));
  marker.on('popupclose', () => updateHash());

  // Popup content is built at open time so it reflects the current discovered
  // state and switches to an inline edit form when the Edit Markers tool is on.
  marker._poi = markerData;
  marker._cat = cat;
  marker.bindPopup(() => poiPopupHtml(markerData, cat, markerKey, btnId, doneLabel, undoneLabel), { maxWidth: 280 });

  // Store reference for opacity control
  markersByKey[markerKey] = marker;

  // Dragging is active only while the Edit Markers tool is on — otherwise a click
  // just opens the popup. Set the right state whenever the marker is (re)added to
  // the map (e.g. when its category is toggled visible).
  marker.on('add', () => {
    if (marker.dragging) (markerEditing ? marker.dragging.enable() : marker.dragging.disable());
    // A marker built/added while "Hide discovered" is on must also be unclickable.
    if (marker._icon && marker.options.opacity === 0) marker._icon.style.pointerEvents = 'none';
  });
  marker.on('dragstart', () => marker.closePopup());
  marker.on('dragend', () => {
    const ll = marker.getLatLng();
    const nx = Math.round(ll.lng), ny = Math.round(ll.lat);
    if (nx === markerData.x && ny === markerData.y) return;
    markerData.x = nx; markerData.y = ny;             // _baseKey keeps identity stable
    saveMarkerMove(currentRegion, markerKey, nx, ny);
    updateMarkerEditStatus();
    showToast(`Moved to X: ${nx}  Y: ${ny}`);
  });

  // Fade discovered markers — fully hidden if "Hide discovered" is active so a
  // lazily-built / freshly-added marker respects the toggle on first reveal.
  if (isMarkerDiscovered(markerData)) {
    marker.setOpacity(hideDiscovered ? 0 : 0.5);
  }

  if (markerLayers[cat.id]) {
    markerLayers[cat.id].addLayer(marker);
  }
}

// Re-point quest tooltips + the open popup after the language switcher changes —
// markers live in cached Leaflet layers, so names update in place without a rebuild.
function refreshQuestMarkerLanguage() {
  Object.values(markersByKey).forEach(m => {
    const p = m._poi;
    if (!p || p.category !== 'quest_main') return;
    if (m.getTooltip()) m.setTooltipContent(escapeHtml(localizedMarkerName(p)));
  });
  // The popup content is built lazily (bindPopup fn) — re-evaluate it live so an
  // open quest popup switches language without being reopened.
  if (map && map._popup && map._popup.isOpen()) {
    const src = map._popup._source;
    if (src && src._poi && src._poi.category === 'quest_main') map._popup.update();
  }
}

// Lazily construct the L.markers for one category (P1: don't build all ~1900
// markers up front). Called on region load for active categories and the first
// time a category is toggled on. Returns the number of markers built.
function ensureCategoryBuilt(catId) {
  if (builtCategories.has(catId)) return 0;
  builtCategories.add(catId);
  const list = markersByCategory[catId] || [];
  list.forEach(addPoiMarker);
  return list.length;
}

// ── POI marker editing (Edit Markers tool) ──
let markerEditing = false;
const MARKER_EDIT_KEY = CONFIG.storageKeys.markerEdits;
const MARKER_DELETE_KEY = CONFIG.storageKeys.markerDeletes;

function loadMarkerEdits(region) {
  try { return (JSON.parse(localStorage.getItem(MARKER_EDIT_KEY) || '{}'))[region] || {}; }
  catch (e) { return {}; }
}
function loadMarkerDeletes(region) {
  try { return (JSON.parse(localStorage.getItem(MARKER_DELETE_KEY) || '{}'))[region] || []; }
  catch (e) { return []; }
}
function mergeMarkerEdit(region, key, patch) {
  try {
    const all = JSON.parse(localStorage.getItem(MARKER_EDIT_KEY) || '{}');
    if (!all[region]) all[region] = {};
    all[region][key] = { ...(all[region][key] || {}), ...patch };
    localStorage.setItem(MARKER_EDIT_KEY, JSON.stringify(all));
    invalidateEditedMarkers(region);
  } catch (e) { console.error('Failed to save marker edit:', e); }
}
function saveMarkerEdit(region, key, name) { mergeMarkerEdit(region, key, { name }); }
function saveMarkerMove(region, key, x, y) { mergeMarkerEdit(region, key, { x, y }); }
function saveMarkerCategory(region, key, category) { mergeMarkerEdit(region, key, { category }); }
function addMarkerDelete(region, key) {
  try {
    const all = JSON.parse(localStorage.getItem(MARKER_DELETE_KEY) || '{}');
    if (!all[region]) all[region] = [];
    if (!all[region].includes(key)) all[region].push(key);
    localStorage.setItem(MARKER_DELETE_KEY, JSON.stringify(all));
    invalidateEditedMarkers(region);
  } catch (e) { console.error('Failed to save marker deletion:', e); }
}

// Base markers for a region with local renames applied and deletions removed.
// Returns fresh copies so the pristine allMarkerData is never mutated.
// Memoized per region — invalidated whenever edits/deletes change or a region
// (re)loads. getEditedMarkers is on many hot paths (sidebar render, progress,
// search); each rebuild clones ~1900 markers and parses localStorage twice, so
// caching removes the bulk of per-toggle / per-mark-discovered work.
let _editedMarkerCache = {};
function invalidateEditedMarkers(region) {
  if (region) delete _editedMarkerCache[region];
  else _editedMarkerCache = {};
}
function getEditedMarkers(region) {
  const cached = _editedMarkerCache[region];
  if (cached) return cached;
  // Use the loaded region data, else the script-tag global (so progress can be
  // counted for a region the user hasn't opened yet).
  const g = window['MARKER_DATA_' + region.toUpperCase()];
  const base = (allMarkerData[region] && allMarkerData[region].markers)
    || (g && g.markers) || [];
  const edits = loadMarkerEdits(region);
  const deletes = new Set(loadMarkerDeletes(region));
  const out = [];
  base.forEach(m => {
    const key = getMarkerKey(m);
    if (deletes.has(key)) return;
    const e = edits[key];
    const nm = { ...m, _baseKey: key };   // keep identity stable if repositioned
    if (e) {
      if (e.name != null) nm.name = e.name;
      if (e.x != null && e.y != null) { nm.x = e.x; nm.y = e.y; }
      if (e.category != null) nm.category = e.category;
    }
    out.push(nm);
  });
  _editedMarkerCache[region] = out;
  return out;
}

// Popup content — normal view, or an inline edit form when the tool is active.
function poiPopupHtml(markerData, cat, markerKey, btnId, doneLabel, undoneLabel) {
  if (markerEditing) {
    const safeName = escapeHtml(markerData.name);
    const catOptions = [...categories].sort((a, b) => a.name.localeCompare(b.name))
      .map(c => `<option value="${c.id}"${c.id === markerData.category ? ' selected' : ''}>${escapeHtml(tr(c.name))}</option>`)
      .join('');
    return `<div class="popup-category">${tr(cat.name)}</div>
      <div class="marker-form" style="min-width:210px;">
        <label>${tr('Marker name')}</label>
        <input type="text" id="poi-edit-name" value="${safeName}">
        <label style="margin-top:6px;">${tr('Category')}</label>
        <select id="poi-edit-cat">${catOptions}</select>
        <div class="popup-coords" style="margin-top:6px;">X: ${markerData.x} &nbsp; Y: ${markerData.y}</div>
        <div style="color:var(--text-muted);font-size:11px;margin-top:4px;">${tr('✥ Drag the marker on the map to reposition it.')}</div>
        <div class="form-actions">
          <button class="btn btn-del" onclick="deletePoiMarker('${markerKey}')">🗑 ${tr('Delete')}</button>
          <button class="btn btn-save" onclick="savePoiMarkerName('${markerKey}')">${tr('Save')}</button>
        </div>
      </div>`;
  }
  const discovered = isMarkerDiscovered(markerData);
  return `<div class="popup-title">${escapeHtml(localizedMarkerName(markerData))}</div>
    <div class="popup-category">${tr(cat.name)}</div>
    ${markerData.description ? `<div class="popup-desc">${escapeHtml(markerData.description)}</div>` : ''}
    <div class="popup-coords">X: ${markerData.x} &nbsp; Y: ${markerData.y}</div>
    <button class="popup-progress-btn${discovered ? ' completed' : ''}" id="${btnId}"
      data-done-label="${doneLabel}" data-undone-label="${undoneLabel}"
      onclick="toggleMarkerDiscovered('${markerKey}', '${btnId}')">${discovered ? doneLabel : undoneLabel}</button>
    <button class="popup-link-btn" onclick="copyCurrentLink()" title="${tr('Copy link')}">🔗 ${tr('Copy link')}</button>`;
}

function savePoiMarkerName(key) {
  const input = document.getElementById('poi-edit-name');
  if (!input) return;
  const newName = input.value.trim();
  if (!newName) { showToast(tr('Name cannot be empty')); return; }
  const marker = markersByKey[key];
  const catSel = document.getElementById('poi-edit-cat');
  const newCat = catSel ? catSel.value : null;
  const oldCat = marker && marker._poi ? marker._poi.category : null;
  const catChanged = newCat && newCat !== oldCat;

  if (marker) {
    if (marker._poi) marker._poi.name = newName;
    if (marker.getTooltip()) marker.setTooltipContent(escapeHtml(newName));
    marker.closePopup();
  }
  saveMarkerEdit(currentRegion, key, newName);

  if (catChanged) {
    saveMarkerCategory(currentRegion, key, newCat);
    // Keep the marker visible after it moves to the new category's layer.
    if (!activeCategories.has(newCat)) { activeCategories.add(newCat); saveActiveCategoriesFromStorage(); }
    // Changing category moves layers + swaps the icon — rebuild (view preserved).
    loadRegion(currentRegion, { preserveView: true });
  } else {
    renderCategoryList(document.getElementById('search-input')?.value || '');
  }
  updateMarkerEditStatus();
  const catName = (categoriesById[newCat] || {}).name || newCat;
  showToast(catChanged ? tf('Renamed & moved to "{0}"', catName) : tf('Renamed to "{0}"', newName));
}

function deletePoiMarker(key) {
  showConfirm('Delete this marker from the map data? You can restore it later with Reset in the Edit Markers tool.', { title: 'Delete marker', confirmText: 'Delete', danger: true }).then(ok => {
    if (!ok) return;
    const marker = markersByKey[key];
    if (marker) {
      marker.closePopup();
      const catId = key.split(':')[0];
      if (markerLayers[catId] && markerLayers[catId].hasLayer(marker)) markerLayers[catId].removeLayer(marker);
      delete markersByKey[key];
    }
    addMarkerDelete(currentRegion, key);
    renderCategoryList(document.getElementById('search-input')?.value || '');
    updateMarkerEditStatus();
    updateGameProgress();
    showToast(tr('Marker deleted'));
  });
}

// ── Edit Markers tool ──
function markerEditCounts(region) {
  const edits = loadMarkerEdits(region);
  let renamed = 0, moved = 0, recat = 0;
  Object.values(edits).forEach(e => {
    if (e && e.name != null) renamed++;
    if (e && e.x != null) moved++;
    if (e && e.category != null) recat++;
  });
  return { renamed, moved, recat, deleted: loadMarkerDeletes(region).length };
}
function updateMarkerEditStatus() {
  const el = document.getElementById('marker-edit-status');
  if (!el) return;
  const { renamed, moved, recat, deleted } = markerEditCounts(currentRegion);
  const total = renamed + moved + recat + deleted;
  if (total === 0) {
    el.className = 'me-status';
    el.textContent = tf('No unsaved changes for {0}', currentRegion);
  } else {
    const parts = [];
    if (renamed) parts.push(tf('{0} renamed', renamed));
    if (moved) parts.push(tf('{0} moved', moved));
    if (recat) parts.push(tf('{0} recategorized', recat));
    if (deleted) parts.push(tf('{0} deleted', deleted));
    const fmt = total === 1 ? '{0} unsaved change ({1})' : '{0} unsaved changes ({1})';
    el.className = 'me-status active';
    el.textContent = tf(fmt, total, parts.join(' · '));
  }
}
function markerEditOpen() {
  if (!ensureSoleTool('marker-edit-panel')) return;
  document.getElementById('marker-edit-panel').classList.add('active');
  updateMarkerEditStatus();
  updatePromoteStatus();
}
function markerEditClose() {
  if (markerEditing) markerEditToggle();  // leave edit mode cleanly
  document.getElementById('marker-edit-panel').classList.remove('active');
}
function markerEditToggle() {
  markerEditing = !markerEditing;
  const btn = document.getElementById('marker-edit-toggle');
  if (btn) {
    btn.textContent = markerEditing ? '■ Stop Editing' : '✥ Start Editing';
    btn.classList.toggle('btn-primary', markerEditing);
    btn.classList.toggle('btn-secondary', !markerEditing);
  }
  if (map) map.closePopup();  // reopen in the right mode
  // Enable/disable drag-to-reposition on every marker currently on the map
  Object.values(markersByKey).forEach(m => { if (m.dragging) (markerEditing ? m.dragging.enable() : m.dragging.disable()); });
  showToast(markerEditing ? tr('Click a marker to rename/delete, or drag it to reposition') : tr('Marker editing off'));
}
function markerEditReset() {
  showConfirm(tf('Discard all marker renames and deletions for {0}? This restores them to the original data.', currentRegion), { title: tr('Reset marker edits'), confirmText: tr('Reset'), danger: true }).then(ok => {
    if (!ok) return;
    try {
      const edits = JSON.parse(localStorage.getItem(MARKER_EDIT_KEY) || '{}');
      const deletes = JSON.parse(localStorage.getItem(MARKER_DELETE_KEY) || '{}');
      delete edits[currentRegion];
      delete deletes[currentRegion];
      localStorage.setItem(MARKER_EDIT_KEY, JSON.stringify(edits));
      localStorage.setItem(MARKER_DELETE_KEY, JSON.stringify(deletes));
    } catch (e) {}
    loadRegion(currentRegion);  // rebuild from original data
    updateMarkerEditStatus();
    showToast(tf('Marker edits reset for {0}', currentRegion));
  });
}
function markerEditExport() {
  const region = currentRegion;
  const { jsonStr, jsStr } = buildMarkerFiles(region);
  markerDownload(`markers_${region}.json`, jsonStr, 'application/json');
  setTimeout(() => markerDownload(`markers_${region}.js`, jsStr, 'text/javascript'), 120);
  const { renamed, moved, recat, deleted } = markerEditCounts(region);
  showToast(tf('Downloaded markers_{0}.{js,json} ({1} renamed, {2} moved, {3} recategorized, {4} deleted) — move both into data/', region, renamed, moved, recat, deleted));
}
function markerDownload(filename, text, mime) {
  const blob = new Blob([text], { type: mime });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = filename;
  a.click();
}

// Build the {json, js} contents for a region's marker file (edits applied).
// extraMarkers are appended after the edited base — used when embedding the
// user's custom markers into the database.
function buildMarkerFiles(region, extraMarkers = []) {
  const base = allMarkerData[region] || { region, markers: [] };
  const strip = ({ _baseKey, ...rest }) => rest;   // drop internal-only field
  const out = { ...base, markers: [...getEditedMarkers(region).map(strip), ...extraMarkers] };
  const jsonStr = JSON.stringify(out, null, 2);
  const jsStr = `// Marker data for ${region} — edited via the in-app Edit Markers tool\nwindow.MARKER_DATA_${region.toUpperCase()} = ${jsonStr};\n`;
  return { out, jsonStr, jsStr };
}

function clearRegionMarkerEdits(region) {
  try {
    const e = JSON.parse(localStorage.getItem(MARKER_EDIT_KEY) || '{}'); delete e[region];
    localStorage.setItem(MARKER_EDIT_KEY, JSON.stringify(e));
    const d = JSON.parse(localStorage.getItem(MARKER_DELETE_KEY) || '{}'); delete d[region];
    localStorage.setItem(MARKER_DELETE_KEY, JSON.stringify(d));
    invalidateEditedMarkers(region);
  } catch (err) {}
}

// Directly write the edited marker files into the project's data/ folder using
// the File System Access API. Requires Chrome/Edge over http://localhost (a
// secure context) and a one-time folder grant. Falls back to a download.
let dataDirHandle = null;

// The chosen data/ folder is remembered across page reloads in IndexedDB so it
// only has to be picked once (a FileSystemDirectoryHandle is structured-
// cloneable; localStorage can't hold it). On a later visit the browser asks for
// a single "allow" click instead of making you re-navigate the folder tree.
const DIR_IDB = CONFIG.dirHandleStore;
function idbOpen() {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DIR_IDB.db, 1);
    req.onupgradeneeded = () => req.result.createObjectStore(DIR_IDB.store);
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}
async function idbGetHandle() {
  try {
    const db = await idbOpen();
    return await new Promise((resolve, reject) => {
      const r = db.transaction(DIR_IDB.store).objectStore(DIR_IDB.store).get(DIR_IDB.key);
      r.onsuccess = () => resolve(r.result || null);
      r.onerror = () => reject(r.error);
    });
  } catch (e) { return null; }
}
async function idbSetHandle(handle) {
  try {
    const db = await idbOpen();
    await new Promise((resolve, reject) => {
      const tx = db.transaction(DIR_IDB.store, 'readwrite');
      tx.objectStore(DIR_IDB.store).put(handle, DIR_IDB.key);
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
  } catch (e) {}
}
async function dirHasPermission(handle) {
  const opts = { mode: 'readwrite' };
  if ((await handle.queryPermission(opts)) === 'granted') return true;
  return (await handle.requestPermission(opts)) === 'granted';
}
// Resolve the data/ folder handle, reusing the in-session or persisted one when
// possible. Returns the handle, null if permission was refused, or throws
// AbortError if the user cancels the picker.
async function ensureDataDir() {
  if (dataDirHandle) {
    try { if (await dirHasPermission(dataDirHandle)) return dataDirHandle; } catch (e) {}
  }
  const saved = await idbGetHandle();
  if (saved) {
    try {
      if (await dirHasPermission(saved)) { dataDirHandle = saved; return saved; }
      return null; // valid handle but permission refused — don't nag with a picker
    } catch (e) { /* stale handle — fall through and re-pick */ }
  }
  showToast('Select your project’s data/ folder (one time)…');
  const picked = await window.showDirectoryPicker({ id: 'kcd2-data', mode: 'readwrite' });
  dataDirHandle = picked;
  await idbSetHandle(picked);
  return picked;
}
async function writeFileToDir(dirHandle, name, contents) {
  const fh = await dirHandle.getFileHandle(name, { create: true });
  const w = await fh.createWritable();
  await w.write(contents);
  await w.close();
}
async function markerEditSaveToData() {
  const region = currentRegion;
  const { renamed, moved, recat, deleted } = markerEditCounts(region);
  if (renamed + moved + recat + deleted === 0) { showToast(tf('No unsaved changes for {0}', region)); return; }
  if (!window.showDirectoryPicker) {
    showToast(tr('Direct save needs Chrome/Edge over http://localhost — downloading instead'));
    markerEditExport();
    return;
  }
  try {
    const dir = await ensureDataDir();
    if (!dir) { showToast(tr('Write permission denied')); return; }
    const { out, jsonStr, jsStr } = buildMarkerFiles(region);
    await writeFileToDir(dir, `markers_${region}.json`, jsonStr);
    await writeFileToDir(dir, `markers_${region}.js`, jsStr);
    // Files are now the source of truth: fold edits into the in-memory base and
    // clear the pending-changes store so the model stays consistent.
    allMarkerData[region] = out;
    clearRegionMarkerEdits(region);
    await loadRegion(region, { preserveView: true });  // rebuild so moved keys re-base cleanly
    updateMarkerEditStatus();
    showToast(tf('Saved markers_{0}.{js,json} to data/ ✓ ({1} renamed, {2} moved, {3} recategorized, {4} deleted)', region, renamed, moved, recat, deleted));
  } catch (e) {
    if (e && e.name === 'AbortError') return; // user cancelled the picker
    console.error('Save to data/ failed:', e);
    showToast(tr('Save failed — see console (F12)'));
  }
}

// ── Embed custom (My Markers) into the shared database ──
// Turns the markers you placed by right-clicking into permanent database entries
// in markers_<region>.{json,js}. This is the verify-by-playing workflow: add a
// missing POI as a custom marker in-game, then embed it here.
function userMarkerToDbMarker(m) {
  return {
    name: m.name || 'Unnamed Marker',
    category: m.category || 'interesting_site',
    description: m.description || '',
    x: m.x,
    y: m.y,
    is_discoverable: true,
    source: 'manual',   // provenance: hand-placed while verifying in-game
  };
}

function updatePromoteStatus() {
  const el = document.getElementById('promote-status');
  if (!el) return;
  const n = (userMarkers[currentRegion] || []).length;
  el.className = 'me-status' + (n ? ' active' : '');
  el.textContent = n
    ? tf('{0} in {1} ready to embed', `${n} custom marker${n > 1 ? 's' : ''}`, currentRegion)
    : tf('No custom markers in {0}', currentRegion);
}

async function promoteUserMarkers() {
  const region = currentRegion;
  const customs = userMarkers[region] || [];
  if (customs.length === 0) { showToast(tf('No custom markers in {0} to embed', region)); return; }

  // Skip any whose category:x:y already exists in the database (no duplicates).
  const existingKeys = new Set(getEditedMarkers(region).map(getMarkerKey));
  const toAdd = [], skipped = [];
  customs.forEach(m => {
    const key = getMarkerKey(m);
    if (existingKeys.has(key)) { skipped.push(m); }
    else { existingKeys.add(key); toAdd.push(m); }
  });
  if (toAdd.length === 0) {
    showToast(tf('All {0} already exist in the database', customs.length));
    return;
  }

  const ok = await showConfirm(
    tf('Embed {0} from {1} into the database{2}? They’ll be removed from My Markers and written into markers_{3}.{json,js} as permanent entries.',
      `${toAdd.length} custom marker${toAdd.length > 1 ? 's' : ''}`,
      region,
      skipped.length ? ` (${skipped.length} duplicate${skipped.length > 1 ? 's' : ''} kept in My Markers)` : '',
      region),
    { title: tr('Embed My Markers'), confirmText: tr('Embed & Save') }
  );
  if (!ok) return;

  const { out, jsonStr, jsStr } = buildMarkerFiles(region, toAdd.map(userMarkerToDbMarker));

  // No File System Access API → download; user moves the files in manually.
  if (!window.showDirectoryPicker) {
    markerDownload(`markers_${region}.json`, jsonStr, 'application/json');
    setTimeout(() => markerDownload(`markers_${region}.js`, jsStr, 'text/javascript'), 120);
    showToast(tf('Downloaded markers_{0}.{js,json} with {1} embedded — move into data/ & reload, then delete them from My Markers', region, toAdd.length));
    return;
  }
  try {
    const dir = await ensureDataDir();
    if (!dir) { showToast('Write permission denied'); return; }
    await writeFileToDir(dir, `markers_${region}.json`, jsonStr);
    await writeFileToDir(dir, `markers_${region}.js`, jsStr);
    // Database is now the source of truth: bake in, drop the promoted customs,
    // and clear any pending renames/deletes (they're now part of the base).
    allMarkerData[region] = out;
    userMarkers[region] = skipped;
    saveUserMarkersToStorage();
    clearRegionMarkerEdits(region);
    await loadRegion(region, { preserveView: true });  // rebuild so they render as DB markers
    renderMyMarkersList();
    updateMarkerEditStatus();
    updatePromoteStatus();
    showToast(tf('Embedded {0} into markers_{1} ✓', `${toAdd.length} marker${toAdd.length > 1 ? 's' : ''}`, region));
  } catch (e) {
    if (e && e.name === 'AbortError') return;
    console.error('Embed to data/ failed:', e);
    showToast(tr('Embed failed — see console (F12)'));
  }
}

// The progress-button id for a user marker — recomputed from current coords so it
// stays correct after a drag (the marker key is category:x:y).
function userBtnId(markerData) {
  return `prog-user-${getMarkerKey(markerData).replace(/[^a-zA-Z0-9]/g, '_')}`;
}

// Single source of truth for the user-marker popup — used on first bind and after
// a drag, so the two can never drift apart.
function buildUserMarkerPopup(markerData) {
  const cat = categoriesById[markerData.category];
  const isItem = ITEM_CATEGORIES.has(markerData.category);
  const doneLabel = isItem ? tr('✓ Collected') : tr('✓ Discovered');
  const undoneLabel = isItem ? tr('☐ Mark as Collected') : tr('☐ Mark as Discovered');
  const key = getMarkerKey(markerData);
  const btnId = userBtnId(markerData);
  const discovered = isMarkerDiscovered(markerData);
  return `
    <div class="popup-title">${escapeHtml(markerData.name) || tr('Custom Marker')}</div>
    <div class="popup-category">${cat ? tr(cat.name) : tr('Custom')} — ${tr('User Marker')}</div>
    ${markerData.description ? `<div class="popup-desc">${escapeHtml(markerData.description)}</div>` : ''}
    <div class="popup-coords">X: ${markerData.x} &nbsp; Y: ${markerData.y}</div>
    <button class="popup-progress-btn${discovered ? ' completed' : ''}" id="${btnId}"
      data-done-label="${doneLabel}" data-undone-label="${undoneLabel}"
      onclick="event.stopPropagation();toggleMarkerDiscovered('${key}', '${btnId}')">${discovered ? doneLabel : undoneLabel}</button>
    <div class="popup-actions">
      <button class="popup-action-btn" onclick="event.stopPropagation();editUserMarker(${markerData.id})">✎ ${tr('Edit')}</button>
      <button class="popup-action-btn danger" onclick="event.stopPropagation();showConfirm('Delete this marker?',{title:'Delete marker',confirmText:'Delete',danger:true}).then(ok=>ok&&deleteUserMarker(${markerData.id}))">✕ ${tr('Delete')}</button>
    </div>
  `;
}

function addUserMarkerToMap(markerData) {
  const cat = categoriesById[markerData.category];
  const icon = createMarkerIcon(
    cat ? cat.icon : '📌',
    cat ? cat.color : '#c9a84c',
    26,
    cat ? cat.id : ''
  );

  const marker = L.marker([markerData.y, markerData.x], { icon, draggable: true });
  let markerKey = getMarkerKey(markerData);

  // Re-sync the discover button on open (btnId is recomputed from current coords).
  marker.on('popupopen', () => {
    const btn = document.getElementById(userBtnId(markerData));
    if (btn) {
      const discovered = isMarkerDiscovered(markerData);
      btn.classList.toggle('completed', discovered);
      btn.textContent = discovered ? btn.dataset.doneLabel : btn.dataset.undoneLabel;
    }
  });

  // Default closeOnClick so an outside/map click dismisses the popup. The popup's own
  // buttons call event.stopPropagation() (see buildUserMarkerPopup) so clicking them
  // doesn't reach the map — which would otherwise shut the popup before the edit form
  // can show.
  marker.bindPopup(buildUserMarkerPopup(markerData), { maxWidth: 280 });

  // Store reference for opacity control
  markersByKey[markerKey] = marker;

  // Fade discovered markers — fully hidden if "Hide discovered" is active so a
  // lazily-built / freshly-added marker respects the toggle on first reveal.
  if (isMarkerDiscovered(markerData)) {
    marker.setOpacity(hideDiscovered ? 0 : 0.5);
  }

  // Match POI markers: drag-to-reposition only while the Edit Markers tool is on,
  // so a stray drag while panning can't silently move (and re-key) a marker. The
  // tool's toggle covers markers already on the map; this covers newly added ones.
  marker.on('add', () => {
    if (marker.dragging) (markerEditing ? marker.dragging.enable() : marker.dragging.disable());
  });

  // Update position on drag
  marker.on('dragend', function(e) {
    const pos = e.target.getLatLng();

    // A custom marker's identity IS its coords (no _baseKey pin), so moving it
    // renames it. Capture the discovered tick before the re-key so it can follow.
    const oldKey = markerKey;
    const set = discoveredMarkers[currentRegion];
    const wasDiscovered = !!(set && set.has(oldKey));

    markerData.x = Math.round(pos.lng);
    markerData.y = Math.round(pos.lat);
    saveUserMarkersToStorage();
    renderMyMarkersList();

    marker.setPopupContent(buildUserMarkerPopup(markerData));

    // Re-key markersByKey to the new coords.
    delete markersByKey[markerKey];
    markerKey = getMarkerKey(markerData);
    markersByKey[markerKey] = marker;

    // Carry the discovered record across (as saveEditedMarker does for renames) —
    // otherwise the move silently un-discovers it and orphans the old key.
    if (wasDiscovered && oldKey !== markerKey) {
      set.delete(oldKey);
      set.add(markerKey);
      saveDiscoveredToStorage();
    }
  });

  marker._userMarkerId = markerData.id;
  userMarkerLayer.addLayer(marker);
}


