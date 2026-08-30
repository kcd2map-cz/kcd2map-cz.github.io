// ═══════════════════════════════════════════════
// ██ CATEGORY MANAGEMENT
// ═══════════════════════════════════════════════

function renderCategoryList(filter = '') {
  const list = document.getElementById('category-list');
  const regionMarkers = [
    ...getEditedMarkers(currentRegion),
    ...(userMarkers[currentRegion] || []),
  ];
  const filterLower = filter.toLowerCase();

  // Single O(markers) pass: per-category {total, discovered}, reused by every
  // group/category below instead of re-filtering the whole array many times.
  const counts = {};
  const discSet = discoveredMarkers[currentRegion];
  regionMarkers.forEach(m => {
    let c = counts[m.category];
    if (!c) c = counts[m.category] = { total: 0, discovered: 0 };
    c.total++;
    if (discSet && discSet.has(getMarkerKey(m))) c.discovered++;
  });

  // Initialize collapsed state from defaults on first render
  if (Object.keys(collapsedGroups).length === 0) {
    CATEGORY_GROUPS.forEach(g => { collapsedGroups[g.name] = g.collapsed; });
  }

  // Build a set of all grouped category IDs
  const groupedCatIds = new Set();
  CATEGORY_GROUPS.forEach(g => g.categories.forEach(id => groupedCatIds.add(id)));

  // Collect ungrouped categories (categories in data but not in any group)
  const ungroupedCats = categories.filter(cat =>
    !groupedCatIds.has(cat.id) &&
    (!filter || cat.name.toLowerCase().includes(filterLower))
  );

  let html = '';

  // Render each named group, then the trailing "Other" bucket of ungrouped cats
  CATEGORY_GROUPS.forEach(group => {
    const groupCats = group.categories
      .map(id => categoriesById[id])
      .filter(cat => cat && (!filter || cat.name.toLowerCase().includes(filterLower)));
    if (groupCats.length === 0) return;
    const expanded = filter ? true : !collapsedGroups[group.name];
    html += renderCategoryGroupHtml(group.name, groupCats, counts, expanded,
      () => `toggleGroupCategories('${group.name}', this)`);
  });

  if (ungroupedCats.length > 0) {
    if (collapsedGroups['Other'] === undefined) collapsedGroups['Other'] = true;
    const expanded = filter ? true : !collapsedGroups['Other'];
    html += renderCategoryGroupHtml('Other', ungroupedCats, counts, expanded,
      () => `toggleOtherCategories(this)`);
  }

  list.innerHTML = html;
}

// Render one collapsible group box (header + category rows). Shared by the named
// CATEGORY_GROUPS and the trailing "Other" bucket. toggleAllAttr(shouldEnable)
// returns the group toggle-all onclick (differs per group type).
function renderCategoryGroupHtml(groupName, cats, counts, expanded, toggleAllAttr) {
  const iconMap = window.ICON_MAP || {};
  const cnt = id => counts[id] || { total: 0, discovered: 0 };
  const activeCount = cats.filter(c => activeCategories.has(c.id)).length;
  const cls = expanded ? 'expanded' : '';

  let html = `<div class="cat-group">`;
  html += `<div class="cat-group-header ${cls}" tabindex="0" role="button" aria-expanded="${expanded}" onclick="toggleGroup('${groupName}')">`;
  html += `  <span class="group-arrow">▶</span>`;
  html += `  <span class="group-name">${groupName}</span>`;
  html += `  <button class="group-toggle-all switch${activeCount === cats.length ? ' on' : ''}" aria-label="Toggle all ${groupName}" onclick="event.stopPropagation();${toggleAllAttr(activeCount < cats.length)}"></button>`;
  html += `</div>`;
  html += `<div class="cat-group-children ${cls}">`;
  cats.forEach(cat => {
    const count = cnt(cat.id).total;
    const trackable = PROGRESS_CATEGORIES.has(cat.id);
    const dcount = trackable ? cnt(cat.id).discovered : 0;
    const active = activeCategories.has(cat.id);
    const iconHtml = iconMap[cat.id]
      ? `<img src="${iconMap[cat.id]}" style="width:20px;height:20px;object-fit:contain;" alt="">`
      : cat.icon;
    const statsHtml = trackable
      ? `<span class="cat-progress"><span class="done">${dcount}</span>/${count}</span>`
      : `<span class="cat-progress">${count}</span>`;
    html += `
      <div class="category-item ${active ? 'active' : ''}" tabindex="0" role="switch" aria-checked="${active}" aria-label="${escapeHtml(cat.name)}" onclick="toggleCategory('${cat.id}', this)">
        <span class="cat-icon">${iconHtml}</span>
        <span class="cat-name">${cat.name}</span>
        ${statsHtml}
        <span class="cat-toggle switch"></span>
      </div>`;
  });
  html += `</div></div>`;
  return html;
}

function toggleGroup(groupName) {
  collapsedGroups[groupName] = !collapsedGroups[groupName];
  saveCollapsedGroups();
  renderCategoryList(document.getElementById('search-input').value);
}
function saveCollapsedGroups() {
  try { localStorage.setItem(CONFIG.storageKeys.collapsedGroups, JSON.stringify(collapsedGroups)); } catch (e) { /* ignore */ }
}
function loadCollapsedGroups() {
  try {
    const saved = localStorage.getItem(CONFIG.storageKeys.collapsedGroups);
    if (saved) collapsedGroups = JSON.parse(saved);
  } catch (e) { /* ignore */ }
}

function toggleGroupCategories(groupName, el) {
  const group = CATEGORY_GROUPS.find(g => g.name === groupName);
  if (!group) return;
  // Decide show/hide from the CURRENT state at click time — we no longer re-render,
  // so a value baked into the markup at render time would stick after the first click.
  const show = !group.categories.every(catId => activeCategories.has(catId));
  group.categories.forEach(catId => { if (show) activeCategories.add(catId); else activeCategories.delete(catId); });
  saveActiveCategoriesFromStorage();
  applyGroupToggleInPlace(group.categories, show, el);
}

function toggleOtherCategories(el) {
  const groupedCatIds = new Set();
  CATEGORY_GROUPS.forEach(g => g.categories.forEach(id => groupedCatIds.add(id)));
  const otherIds = categories.filter(cat => !groupedCatIds.has(cat.id)).map(c => c.id);
  if (!otherIds.length) return;
  const show = !otherIds.every(catId => activeCategories.has(catId));
  otherIds.forEach(catId => { if (show) activeCategories.add(catId); else activeCategories.delete(catId); });
  saveActiveCategoriesFromStorage();
  applyGroupToggleInPlace(otherIds, show, el);
}

// Flip a whole group's switches IN PLACE (the group's toggle-all + every child row)
// so they slide, then defer the heavy marker-layer work a couple of frames so it
// can't block those slides from painting. Falls back to a re-render if el is absent.
function applyGroupToggleInPlace(catIds, show, el) {
  if (el) {
    el.classList.toggle('on', show);
    const group = el.closest('.cat-group');
    if (group) {
      group.querySelectorAll('.cat-group-children .category-item').forEach(item => {
        item.classList.toggle('active', show);
        item.setAttribute('aria-checked', show);
      });
    }
  }
  const applyLayers = () => {
    catIds.forEach(catId => {
      if (show) {
        ensureCategoryBuilt(catId);
        if (markerLayers[catId]) map.addLayer(markerLayers[catId]);
      } else if (markerLayers[catId]) {
        map.removeLayer(markerLayers[catId]);
      }
    });
    if (!el) renderCategoryList(document.getElementById('search-input').value);
  };
  if (el) requestAnimationFrame(() => requestAnimationFrame(applyLayers));
  else applyLayers();
}

// ── Legend overlay ──
let legendOpen = false;
function toggleLegend() {
  legendOpen = !legendOpen;
  document.getElementById('legend-panel').classList.toggle('active', legendOpen);
  if (legendOpen) renderLegend();
}
function renderLegend() {
  const iconMap = window.ICON_MAP || {};
  let html = '';
  CATEGORY_GROUPS.forEach(g => {
    const color = GROUP_COLORS[g.name] || DEFAULT_GROUP_COLOR;
    const cats = g.categories.map(id => categoriesById[id]).filter(Boolean);
    if (!cats.length) return;
    html += `<div class="legend-group-title" style="color:${color}">${g.name}</div>`;
    cats.forEach(c => {
      const src = iconMap[c.id];
      const ic = src
        ? `<img src="${src}" onerror="this.style.display='none'">`
        : `<span style="width:18px;text-align:center">${c.icon || '📌'}</span>`;
      html += `<div class="legend-row">${ic}<span>${c.name}</span></div>`;
    });
  });
  document.getElementById('legend-content').innerHTML = html;
}

function toggleCategory(catId, el) {
  const active = !activeCategories.has(catId);
  if (active) activeCategories.add(catId); else activeCategories.delete(catId);
  saveActiveCategoriesFromStorage();

  // Flip the switch IN PLACE first (a full renderCategoryList would recreate the
  // element already in its final position, leaving the CSS transition nothing to
  // animate from). The group's "toggle all" switch is re-synced from sibling rows.
  if (el) {
    el.classList.toggle('active', active);
    el.setAttribute('aria-checked', active);
    const group = el.closest('.cat-group');
    if (group) {
      const items = group.querySelectorAll('.cat-group-children .category-item');
      const allActive = items.length > 0 && [...items].every(it => it.classList.contains('active'));
      const toggleAll = group.querySelector('.group-toggle-all');
      if (toggleAll) toggleAll.classList.toggle('on', allActive);
    }
  }

  // Building/adding a large category's markers is heavy + synchronous; defer it a
  // couple of frames so it can't block the toggle's slide from starting to paint.
  const applyLayer = () => {
    if (active) {
      ensureCategoryBuilt(catId);
      if (markerLayers[catId]) map.addLayer(markerLayers[catId]);
    } else if (markerLayers[catId]) {
      map.removeLayer(markerLayers[catId]);
    }
    if (!el) renderCategoryList(document.getElementById('search-input').value);
  };
  if (el) requestAnimationFrame(() => requestAnimationFrame(applyLayer));
  else applyLayer();
}

function toggleAllCategories(show) {
  let totalMarkers = 0;
  categories.forEach(cat => {
    if (show) {
      activeCategories.add(cat.id);
      ensureCategoryBuilt(cat.id);
      if (markerLayers[cat.id]) {
        map.addLayer(markerLayers[cat.id]);
        totalMarkers += markerLayers[cat.id].getLayers().length;
      }
    } else {
      activeCategories.delete(cat.id);
      if (markerLayers[cat.id]) map.removeLayer(markerLayers[cat.id]);
    }
  });
  console.log(`[KCD2 Map] Toggle all ${show ? 'ON' : 'OFF'}: ${categories.length} categories, ${totalMarkers} markers on map`);
  saveActiveCategoriesFromStorage();
  renderCategoryList(document.getElementById('search-input').value);
}

function filterCategories(query) {
  renderCategoryList(query);
}

let hideDiscovered = false;

// Normalize for search: fold curly/straight apostrophes together and strip
// diacritics, so "atamans"/"ataman's" both match "Ataman's" and unaccented
// typing matches accented Czech names. The data mixes ' (U+0027) and ’ (U+2019).
function searchNorm(s) {
  return (s || '')
    .toLowerCase()
    .normalize('NFD').replace(/[̀-ͯ]/g, '')  // strip combining diacritics
    .replace(/['’ʼ`]/g, '');                 // drop apostrophes (so "atamans" finds "Ataman's")
}

// Reflect popup visibility on the search combobox for assistive tech.
function _setSearchExpanded(shown) {
  document.getElementById('search-input')?.setAttribute('aria-expanded', shown ? 'true' : 'false');
}

function onSearchInput(query) {
  const q = searchNorm(query.trim());

  // Show the clear (✕) button whenever the field has any text
  const clearBtn = document.getElementById('search-clear');
  if (clearBtn) clearBtn.hidden = query.length === 0;

  // Always filter categories
  renderCategoryList(query);

  // Show marker name search results
  const resultsEl = document.getElementById('search-results');
  if (!q || q.length < 2) {
    resultsEl.classList.remove('active');
    resultsEl.innerHTML = '';
    _setSearchExpanded(false);
    return;
  }

  const iconMap = window.ICON_MAP || {};
  const regionMarkers = getEditedMarkers(currentRegion);
  const userMkrs = userMarkers[currentRegion] || [];

  // Search both POI markers and user markers
  const matches = [];
  regionMarkers.forEach(m => {
    if (searchNorm(m.name).includes(q)) {
      matches.push({ ...m, source: 'poi' });
    }
  });
  userMkrs.forEach(m => {
    if (searchNorm(m.name).includes(q)) {
      matches.push({ ...m, source: 'user' });
    }
  });

  if (matches.length === 0) {
    resultsEl.innerHTML = '<div class="search-no-results">No markers found</div>';
    resultsEl.classList.add('active');
    _setSearchExpanded(true);
    return;
  }

  // Limit to 20 results
  const limited = matches.slice(0, 20);
  resultsEl.innerHTML = limited.map(m => {
    const cat = categoriesById[m.category];
    const iconSrc = iconMap[m.category];
    const iconHtml = iconSrc
      ? `<img src="${iconSrc}" onerror="this.style.display='none'">`
      : `<span style="width:18px;text-align:center;font-size:12px">${cat?.icon || '📌'}</span>`;
    const catName = cat ? cat.name : 'Custom';
    const tag = m.source === 'user' ? ' (mine)' : '';
    return `<div class="search-result-item" role="option" onclick="searchResultClick(${m.x}, ${m.y}, '${getMarkerKey(m)}')">
      ${iconHtml}
      <div>
        <div class="sr-name">${escapeHtml(m.name)}</div>
        <div class="sr-cat">${catName}${tag} — (${m.x}, ${m.y})</div>
      </div>
    </div>`;
  }).join('') + (matches.length > 20 ? `<div style="padding:6px 10px;font-size:11px;color:var(--text-muted);text-align:center">+${matches.length - 20} more results</div>` : '');
  resultsEl.classList.add('active');
  _setSearchExpanded(true);
}

// Clear the search field and its results (the ✕ button in the search box).
function clearSearch() {
  const input = document.getElementById('search-input');
  if (input) { input.value = ''; input.focus(); }
  const clearBtn = document.getElementById('search-clear');
  if (clearBtn) clearBtn.hidden = true;
  const resultsEl = document.getElementById('search-results');
  if (resultsEl) { resultsEl.classList.remove('active'); resultsEl.innerHTML = ''; }
  _setSearchExpanded(false);
  renderCategoryList('');
}

function searchResultClick(x, y, markerKey) {
  // Close search results
  document.getElementById('search-results').classList.remove('active');
  document.getElementById('search-input').value = '';
  const clearBtn = document.getElementById('search-clear');
  if (clearBtn) clearBtn.hidden = true;
  _setSearchExpanded(false);
  renderCategoryList('');

  // Ensure the category is visible
  const parts = markerKey.split(':');
  const catId = parts[0];
  if (!activeCategories.has(catId) && markerLayers[catId]) {
    activeCategories.add(catId);
    ensureCategoryBuilt(catId);
    markerLayers[catId].addTo(map);
    saveActiveCategoriesFromStorage();
    renderCategoryList('');
  }

  // Fly to marker and open popup
  flyToMarker(x, y, markerKey);

  // Update URL with marker permalink
  updateHashWithMarker(markerKey);
}

// Close search results when clicking elsewhere
document.addEventListener('click', function(e) {
  const searchBox = document.querySelector('.search-box');
  const resultsEl = document.getElementById('search-results');
  if (searchBox && resultsEl && !searchBox.contains(e.target) && !resultsEl.contains(e.target)) {
    resultsEl.classList.remove('active');
  }
});


// ── Hide Discovered Toggle ──

function toggleHideDiscovered() {
  hideDiscovered = document.getElementById('toggle-hide-discovered').checked;
  applyHideDiscovered();
}

function applyHideDiscovered() {
  // Only discovered markers ever deviate from full opacity, so iterate just that
  // set (intersected with the markers actually on the map) instead of scanning
  // every marker. Non-discovered markers are always opacity 1 and untouched.
  const set = discoveredMarkers[currentRegion];
  if (!set) return;
  set.forEach(key => {
    const marker = markersByKey[key];
    if (!marker) return;
    if (hideDiscovered) {
      marker.setOpacity(0);
      if (marker._icon) marker._icon.style.pointerEvents = 'none';
    } else {
      marker.setOpacity(0.5);
      if (marker._icon) marker._icon.style.pointerEvents = '';
    }
  });
}


