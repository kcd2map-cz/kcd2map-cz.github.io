// ═══════════════════════════════════════════════
// ██ USER MARKERS
// ═══════════════════════════════════════════════

// Category chosen on the previous add — pre-selected next time so tagging many
// markers of one type doesn't mean re-picking it each time.
let lastUserMarkerCategory = '';

// Remove the unsaved temp pin (Save/Cancel, or Esc / click-away closing the popup).
// Null first so a re-entrant popupclose fired by removeLayer is a no-op.
function removeTempMarker() {
  if (!tempMarker) return;
  const m = tempMarker;
  tempMarker = null;
  map.removeLayer(m);
}

function onRightClick(e) {
  e.originalEvent.preventDefault();
  dismissMapHint();   // they found the feature — retire the hint
  const x = Math.round(e.latlng.lng);
  const y = Math.round(e.latlng.lat);

  removeTempMarker();   // clear any previous unsaved temp pin

  // Category options with real icons (sorted alphabetically)
  const catItems = buildCategoryDropdownItems();

  // Pre-fill the dropdown with the last-used category ('' = generic Custom).
  const preCat = categoriesById[lastUserMarkerCategory];
  const preIconSrc = (window.ICON_MAP || {})[lastUserMarkerCategory] || '';
  const preLabel = preCat ? preCat.name : tr('Custom');
  const preIconHtml = preIconSrc
    ? `<img src="${preIconSrc}" style="width:20px;height:20px;image-rendering:pixelated">`
    : `<span style="width:20px;text-align:center">${preCat ? (preCat.icon || '📦') : '📌'}</span>`;

  const formHtml = `
    <div class="marker-form">
      <h3>${tr('Add Marker')}</h3>
      <label>${tr('Name')}</label>
      <input type="text" id="new-marker-name" placeholder="${tr('Enter name...')}" autofocus
        onkeydown="if(event.key==='Enter'){event.preventDefault();saveNewMarker(${x}, ${y});}">
      <label>${tr('Category')}</label>
      <input type="hidden" id="new-marker-cat" value="${preCat ? escapeHtml(lastUserMarkerCategory) : ''}">
      <div class="icon-dropdown" id="cat-dropdown">
        <div class="icon-dropdown-btn" onclick="toggleCatDropdown()">
          ${preIconHtml} <span id="cat-dropdown-label">${escapeHtml(preLabel)}</span>
        </div>
        <div class="icon-dropdown-list" id="cat-dropdown-list">
          <input type="text" class="icon-dropdown-search" id="cat-search" placeholder="${tr('Search...')}" oninput="filterCatDropdown(this.value)">
          <div id="cat-dropdown-items">${catItems}</div>
        </div>
      </div>
      <label>${tr('Description')}</label>
      <textarea id="new-marker-desc" placeholder="${tr('Optional description...')}"></textarea>
      <div class="form-actions">
        <button class="btn btn-cancel" onclick="cancelNewMarker()">${tr('Cancel')}</button>
        <button class="btn btn-save" onclick="saveNewMarker(${x}, ${y})">${tr('Save')}</button>
      </div>
    </div>
  `;

  tempMarker = L.marker([y, x], {
    icon: createMarkerIcon('📌', '#c9a84c', 26)
  }).addTo(map);

  tempMarker.on('popupclose', removeTempMarker);
  tempMarker.bindPopup(formHtml, { maxWidth: 300, closeOnClick: false, autoClose: false }).openPopup();
}

// The category picker for the add-marker and edit-marker forms: a compact grid of
// icon tiles, sectioned by CATEGORY_GROUPS (with a colour-titled header) so you can
// jump to the right class by eye instead of scrolling one long list. Includes the
// generic "Custom" tile up top. Filtered live by filterCatDropdown().
function buildCategoryDropdownItems() {
  const iconMap = window.ICON_MAP || {};
  const byId = {};
  categories.forEach(c => { byId[c.id] = c; });

  const tile = (id, name, iconSrc, emoji) => {
    const iconHtml = iconSrc
      ? `<img src="${iconSrc}" onerror="this.style.display='none'">`
      : `<span class="it-emoji">${emoji || '📦'}</span>`;
    return `<div class="icon-tile" data-name="${escapeHtml(name.toLowerCase())}" title="${escapeHtml(name)}" onclick="selectCategory('${id}', '${name.replace(/'/g, "\\'")}', '${iconSrc}')">${iconHtml}<span class="it-label">${escapeHtml(name)}</span></div>`;
  };
  const section = (header, color, cats) =>
    `<div class="icon-group">${header ? `<div class="icon-group-header" style="color:${color}">${escapeHtml(header)}</div>` : ''}` +
    `<div class="icon-grid">${cats.join('')}</div></div>`;

  // Pinned generic option first.
  let html = section('', '', [tile('', 'Custom', '', '📌')]);

  const grouped = new Set();
  CATEGORY_GROUPS.forEach(group => {
    const cats = group.categories.map(id => byId[id]).filter(Boolean)
      .sort((a, b) => a.name.localeCompare(b.name));
    if (!cats.length) return;
    cats.forEach(c => grouped.add(c.id));
    const color = GROUP_COLORS[group.name] || DEFAULT_GROUP_COLOR;
    html += section(group.name, color, cats.map(c => tile(c.id, c.name, iconMap[c.id] || '', c.icon)));
  });

  // Anything not in a defined group → an "Other" bucket at the end.
  const others = categories.filter(c => !grouped.has(c.id))
    .sort((a, b) => a.name.localeCompare(b.name));
  if (others.length) {
    html += section('Other', DEFAULT_GROUP_COLOR, others.map(c => tile(c.id, c.name, iconMap[c.id] || '', c.icon)));
  }
  return html;
}

function toggleCatDropdown() {
  const list = document.getElementById('cat-dropdown-list');
  list.classList.toggle('open');
  if (list.classList.contains('open')) {
    const search = document.getElementById('cat-search');
    if (search) { search.value = ''; filterCatDropdown(''); search.focus(); }
  }
}

// Close dropdown when clicking outside
document.addEventListener('click', function(e) {
  const dropdown = document.getElementById('cat-dropdown');
  const list = document.getElementById('cat-dropdown-list');
  if (dropdown && list && !dropdown.contains(e.target)) {
    list.classList.remove('open');
  }
});

function selectCategory(value, name, iconSrc) {
  document.getElementById('new-marker-cat').value = value;
  const btn = document.querySelector('.icon-dropdown-btn');
  const iconHtml = iconSrc
    ? `<img src="${iconSrc}" style="width:20px;height:20px;image-rendering:pixelated">`
    : `<span style="width:20px;text-align:center">${value ? '📦' : '📌'}</span>`;
  btn.innerHTML = `${iconHtml} <span id="cat-dropdown-label">${name}</span>`;
  document.getElementById('cat-dropdown-list').classList.remove('open');
}

function filterCatDropdown(query) {
  const q = query.trim().toLowerCase();
  document.querySelectorAll('#cat-dropdown-items .icon-group').forEach(group => {
    let any = false;
    group.querySelectorAll('.icon-tile').forEach(tile => {
      const match = (tile.dataset.name || '').includes(q);
      tile.style.display = match ? '' : 'none';
      if (match) any = true;
    });
    group.style.display = any ? '' : 'none';   // collapse sections with no matches
  });
}

function saveNewMarker(x, y) {
  const name = document.getElementById('new-marker-name').value.trim() || 'Unnamed Marker';
  // '' = generic Custom (gold pin); honoured live, mapped to interesting_site only
  // when embedded into the shared DB (see userMarkerToDbMarker).
  const category = document.getElementById('new-marker-cat').value;
  const description = document.getElementById('new-marker-desc').value.trim();

  const markerData = {
    id: nextUserMarkerId++,
    name,
    category,
    description,
    x,
    y,
  };

  if (!userMarkers[currentRegion]) userMarkers[currentRegion] = [];
  userMarkers[currentRegion].push(markerData);
  saveUserMarkersToStorage();

  lastUserMarkerCategory = category;   // remember for the next add

  removeTempMarker();
  addUserMarkerToMap(markerData);
  renderMyMarkersList();
  updatePromoteStatus();
  showToast(tf('Marker "{0}" added', name));
}

function cancelNewMarker() {
  removeTempMarker();
}

function deleteUserMarker(id) {
  if (!userMarkers[currentRegion]) return;
  userMarkers[currentRegion] = userMarkers[currentRegion].filter(m => m.id !== id);
  saveUserMarkersToStorage();

  // Remove from map
  userMarkerLayer.eachLayer(layer => {
    if (layer._userMarkerId === id) userMarkerLayer.removeLayer(layer);
  });

  renderMyMarkersList();
  updatePromoteStatus();
  showToast(tr('Marker removed'));
}

function editUserMarker(id) {
  const markers = userMarkers[currentRegion] || [];
  const markerData = markers.find(m => m.id === id);
  if (!markerData) return;

  // Find the Leaflet marker layer
  let leafletMarker = null;
  userMarkerLayer.eachLayer(layer => {
    if (layer._userMarkerId === id) leafletMarker = layer;
  });
  if (!leafletMarker) return;

  // Build edit form with icon dropdown
  const iconMap = window.ICON_MAP || {};
  const currentCat = categoriesById[markerData.category];
  const currentIconSrc = iconMap[markerData.category] || '';
  const currentCatName = currentCat ? currentCat.name : tr('Custom');
  const currentIconHtml = currentIconSrc
    ? `<img src="${currentIconSrc}" style="width:20px;height:20px;image-rendering:pixelated">`
    : `<span style="width:20px;text-align:center">${currentCat?.icon || '📌'}</span>`;

  const catItems = buildCategoryDropdownItems();

  const editHtml = `
    <div class="marker-form">
      <h3>${tr('Edit Marker')}</h3>
      <label>${tr('Name')}</label>
      <input type="text" id="edit-marker-name" value="${escapeHtml(markerData.name)}"
        onkeydown="if(event.key==='Enter'){event.preventDefault();saveEditedMarker(${id});}">
      <label>${tr('Category')}</label>
      <input type="hidden" id="new-marker-cat" value="${markerData.category}">
      <div class="icon-dropdown" id="cat-dropdown">
        <div class="icon-dropdown-btn" onclick="toggleCatDropdown()">
          ${currentIconHtml} <span id="cat-dropdown-label">${currentCatName}</span>
        </div>
        <div class="icon-dropdown-list" id="cat-dropdown-list">
          <input type="text" class="icon-dropdown-search" id="cat-search" placeholder="${tr('Search...')}" oninput="filterCatDropdown(this.value)">
          <div id="cat-dropdown-items">${catItems}</div>
        </div>
      </div>
      <label>${tr('Description')}</label>
      <textarea id="edit-marker-desc">${escapeHtml(markerData.description)}</textarea>
      <div class="form-actions">
        <button class="btn btn-cancel" onclick="cancelEditMarker(${id})">${tr('Cancel')}</button>
        <button class="btn btn-save" onclick="saveEditedMarker(${id})">${tr('Save')}</button>
      </div>
    </div>
  `;

  leafletMarker.setPopupContent(editHtml);
  leafletMarker.openPopup();
}

function saveEditedMarker(id) {
  const markers = userMarkers[currentRegion] || [];
  const markerData = markers.find(m => m.id === id);
  if (!markerData) return;

  const oldKey = getMarkerKey(markerData);

  // Read new values
  const newName = document.getElementById('edit-marker-name').value.trim() || 'Unnamed Marker';
  const newCategory = document.getElementById('new-marker-cat').value;   // '' = generic Custom
  const newDesc = document.getElementById('edit-marker-desc').value.trim();

  // Update discovered key if category changed
  const set = discoveredMarkers[currentRegion];
  const wasDiscovered = set && set.has(oldKey);

  // Update marker data
  markerData.name = newName;
  markerData.category = newCategory;
  markerData.description = newDesc;

  const newKey = getMarkerKey(markerData);

  // Migrate discovered state
  if (wasDiscovered && oldKey !== newKey) {
    set.delete(oldKey);
    set.add(newKey);
    saveDiscoveredToStorage();
  }

  saveUserMarkersToStorage();

  // Remove old marker from map and re-add with new icon
  userMarkerLayer.eachLayer(layer => {
    if (layer._userMarkerId === id) {
      delete markersByKey[oldKey];
      userMarkerLayer.removeLayer(layer);
    }
  });

  addUserMarkerToMap(markerData);
  renderMyMarkersList();
  showToast(tr('Marker updated'));
}

function cancelEditMarker(id) {
  // Re-add original popup by removing and re-adding the marker
  const markers = userMarkers[currentRegion] || [];
  const markerData = markers.find(m => m.id === id);
  if (!markerData) return;

  userMarkerLayer.eachLayer(layer => {
    if (layer._userMarkerId === id) {
      const key = getMarkerKey(markerData);
      delete markersByKey[key];
      userMarkerLayer.removeLayer(layer);
    }
  });

  addUserMarkerToMap(markerData);
}

function flyToMarker(x, y, markerKey) {
  // Use a zoom level near the tile pyramid max for clear detail
  const targetZoom = Math.max(map.getMaxZoom() - 1, map.getZoom());
  map.flyTo([y, x], targetZoom, { duration: 0.6 });

  // After the fly animation completes, open the target marker's popup.
  // Prefer an exact key lookup; otherwise fall back to a boundary-safe
  // coordinate match — ":x:y" so e.g. flyTo 5,6 can't match "shrine:15:6".
  setTimeout(() => {
    if (markerKey && markersByKey[markerKey]) {
      markersByKey[markerKey].openPopup();
      return;
    }
    const suffix = `:${x}:${y}`;
    for (const [key, marker] of Object.entries(markersByKey)) {
      if (key.endsWith(suffix)) {
        marker.openPopup();
        return;
      }
    }
  }, 650);
}

function renderUserMarkersOnMap(region) {
  userMarkerLayer.clearLayers();
  const markers = userMarkers[region] || [];
  markers.forEach(m => addUserMarkerToMap(m));
}

// My Markers list view state (display-only — never reorders the stored array).
let myMarkersFilter = '';
let myMarkersSort = 'recent';   // 'recent' | 'name'
const MM_CONTROLS_THRESHOLD = 6;   // show search/sort once the list is this long

function setMyMarkersSort(value) {
  myMarkersSort = value;
  renderMyMarkersList();
}

// Filter rows in place (no re-render) so the search box keeps focus while typing.
function filterMyMarkers(query) {
  myMarkersFilter = query;
  const q = query.trim().toLowerCase();
  let shown = 0;
  document.querySelectorAll('#my-markers-list .my-marker-item').forEach(row => {
    const match = (row.dataset.name || '').includes(q);
    row.style.display = match ? '' : 'none';
    if (match) shown++;
  });
  const empty = document.getElementById('mm-no-match');
  if (empty) empty.style.display = shown ? 'none' : '';
}

function renderMyMarkersList() {
  const list = document.getElementById('my-markers-list');
  const all = userMarkers[currentRegion] || [];

  if (all.length === 0) {
    list.innerHTML = `<div class="no-markers">${tr('Right-click on the map to add a custom marker.')}</div>`;
    return;
  }

  // Sort a shallow copy for display only.
  const markers = [...all];
  if (myMarkersSort === 'name') {
    markers.sort((a, b) => (a.name || '').localeCompare(b.name || ''));
  } else {
    markers.reverse();   // most-recently-added first
  }

  const iconMap = window.ICON_MAP || {};
  const rowsHtml = markers.map(m => {
    const cat = categoriesById[m.category];
    const iconSrc = iconMap[m.category];
    const iconHtml = iconSrc
      ? `<img src="${iconSrc}" style="width:20px;height:20px;image-rendering:pixelated">`
      : `<span>${cat ? cat.icon : '📌'}</span>`;
    return `
      <div class="my-marker-item" data-name="${escapeHtml((m.name || '').toLowerCase())}" onclick="flyToMarker(${m.x}, ${m.y}, '${getMarkerKey(m)}')">
        <span class="mm-icon">${iconHtml}</span>
        <div class="mm-info">
          <div class="mm-name">${escapeHtml(m.name)}</div>
          <div class="mm-coords">X: ${m.x} Y: ${m.y}</div>
        </div>
        <button class="mm-edit" onclick="event.stopPropagation();editUserMarker(${m.id})" title="${tr('Edit')}">✎</button>
        <button class="mm-delete" onclick="event.stopPropagation();showConfirm(tr('Delete this marker?'),{title:tr('Delete marker'),confirmText:tr('Delete'),danger:true}).then(ok=>ok&&deleteUserMarker(${m.id}))" title="${tr('Delete')}">✕</button>
      </div>
    `;
  }).join('');

  const controlsHtml = all.length > MM_CONTROLS_THRESHOLD ? `
    <div class="mm-controls">
      <input type="text" class="mm-search" id="mm-search" placeholder="${tr('Filter markers...')}" value="${escapeHtml(myMarkersFilter)}" oninput="filterMyMarkers(this.value)">
      <select class="mm-sort" onchange="setMyMarkersSort(this.value)">
        <option value="recent"${myMarkersSort === 'recent' ? ' selected' : ''}>${tr('Recent')}</option>
        <option value="name"${myMarkersSort === 'name' ? ' selected' : ''}>A–Z</option>
      </select>
    </div>` : '';

  // Hint that the other region has markers (they're not shown here).
  const other = currentRegion === 'trosky' ? 'kuttenberg' : 'trosky';
  const otherCount = (userMarkers[other] || []).length;
  const otherName = other.charAt(0).toUpperCase() + other.slice(1);
  const otherHtml = otherCount
    ? `<div class="mm-other-region">↔ ${tf('{0} in {1} — switch region to view', `${otherCount} marker${otherCount > 1 ? 's' : ''}`, otherName)}</div>`
    : '';

  list.innerHTML = controlsHtml + rowsHtml +
    `<div class="no-markers" id="mm-no-match" style="display:none">${tr('No markers match your filter.')}</div>` +
    otherHtml;

  if (myMarkersFilter.trim()) filterMyMarkers(myMarkersFilter);
}


