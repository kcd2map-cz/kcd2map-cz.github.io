// ═══════════════════════════════════════════════
// ██ LOCAL STORAGE
// ═══════════════════════════════════════════════

// localStorage.setItem throws QuotaExceededError once the discovered sets +
// marker edits + custom markers across both regions fill the ~5 MB budget. Wrap
// every hot-path write so a full quota degrades to a toast instead of throwing
// out of whatever triggered the save (e.g. aborting a marker add half-done).
function safeSetItem(key, value) {
  try {
    localStorage.setItem(key, value);
    return true;
  } catch (e) {
    console.warn('localStorage write failed for', key, e);
    if (typeof showToast === 'function') showToast('Storage full — change not saved');
    return false;
  }
}

function saveUserMarkersToStorage() {
  safeSetItem(CONFIG.storageKeys.userMarkers, JSON.stringify(userMarkers));
}

function loadUserMarkersFromStorage() {
  try {
    const saved = localStorage.getItem(CONFIG.storageKeys.userMarkers);
    if (saved) {
      userMarkers = JSON.parse(saved);
      // Find max ID
      Object.values(userMarkers).forEach(markers => {
        markers.forEach(m => {
          if (m.id >= nextUserMarkerId) nextUserMarkerId = m.id + 1;
        });
      });
    }
  } catch (e) {
    console.warn('Could not load user markers:', e);
  }
}

function saveActiveCategoriesFromStorage() {
  safeSetItem(CONFIG.storageKeys.activeCategories, JSON.stringify([...activeCategories]));
}

function loadActiveCategoriesFromStorage() {
  try {
    const saved = localStorage.getItem(CONFIG.storageKeys.activeCategories);
    if (saved) {
      activeCategories = new Set(JSON.parse(saved));
    } else {
      activeCategories = new Set(DEFAULT_ACTIVE_CATEGORIES);
    }
  } catch (e) {
    activeCategories = new Set(DEFAULT_ACTIVE_CATEGORIES);
  }
}

function saveDiscoveredToStorage() {
  // Convert Sets to arrays for JSON serialization
  const serializable = {};
  Object.entries(discoveredMarkers).forEach(([region, set]) => {
    serializable[region] = [...set];
  });
  safeSetItem(CONFIG.storageKeys.discoveredMarkers, JSON.stringify(serializable));
}

function loadDiscoveredFromStorage() {
  try {
    const saved = localStorage.getItem(CONFIG.storageKeys.discoveredMarkers);
    if (saved) {
      const parsed = JSON.parse(saved);
      Object.entries(parsed).forEach(([region, arr]) => {
        discoveredMarkers[region] = new Set(arr);
      });
    }
  } catch (e) {
    console.warn('Could not load discovered markers:', e);
  }
}

function getMarkerKey(markerData) {
  // Unique key: category + coordinates (stable across reloads). A repositioned
  // marker keeps its ORIGINAL key via _baseKey, so its rename/delete/discovered
  // records stay attached after the move (coords alone would drift).
  return markerData._baseKey || `${markerData.category}:${markerData.x}:${markerData.y}`;
}

function isMarkerDiscovered(markerData) {
  const set = discoveredMarkers[currentRegion];
  return set ? set.has(getMarkerKey(markerData)) : false;
}

// Categories that drive Game Completion. Only quests count. Main quests make up
// the tracked total behind the big % bar; every other quest category (side quests,
// tasks, DLC stories) is just tallied per region so it can be listed next to it.
const MAIN_QUEST_CATEGORIES = new Set(['quest_main']);
const SIDE_QUEST_CATEGORIES = new Set([
  'quest_side', 'quest_task',
  'quest_dlc0', 'quest_dlc1', 'quest_dlc2', 'quest_dlc3',
]);

// Game completion = quest progress across BOTH regions (including custom markers).
// Marking a quest as Discovered/Collected ticks it here.
function computeGameProgress() {
  let mainTotal = 0, mainDone = 0;
  const regions = {};
  ['trosky', 'kuttenberg'].forEach(region => {
    const set = discoveredMarkers[region] || new Set();
    const markers = [...getEditedMarkers(region), ...(userMarkers[region] || [])];
    let rMainTotal = 0, rMainDone = 0, rSideTotal = 0, rSideDone = 0;
    markers.forEach(m => {
      if (MAIN_QUEST_CATEGORIES.has(m.category)) {
        rMainTotal++;
        if (set.has(getMarkerKey(m))) rMainDone++;
      } else if (SIDE_QUEST_CATEGORIES.has(m.category)) {
        rSideTotal++;
        if (set.has(getMarkerKey(m))) rSideDone++;
      }
    });
    regions[region] = {
      mainTotal: rMainTotal, mainDone: rMainDone,
      sideTotal: rSideTotal, sideDone: rSideDone,
    };
    mainTotal += rMainTotal; mainDone += rMainDone;
  });
  return { mainTotal, mainDone, pct: mainTotal ? Math.round(mainDone / mainTotal * 100) : 0, regions };
}
function updateGameProgress() {
  const fill = document.getElementById('gp-fill');
  if (!fill) return;
  const p = computeGameProgress();
  fill.style.width = p.pct + '%';
  const pctEl = document.getElementById('gp-pct');
  if (pctEl) pctEl.textContent = p.pct + '%';
  const detail = document.getElementById('gp-detail');
  if (detail) detail.textContent = `${p.mainDone.toLocaleString()} / ${p.mainTotal.toLocaleString()} main quests`;
  ['trosky', 'kuttenberg'].forEach(region => {
    const row = document.getElementById('gp-' + region + '-row');
    if (row) row.classList.toggle('active', region === currentRegion);
    const mainEl = document.getElementById('gp-' + region + '-main');
    if (mainEl) mainEl.textContent = `${p.regions[region].mainDone}/${p.regions[region].mainTotal}`;
    const sideEl = document.getElementById('gp-' + region + '-side');
    if (sideEl) sideEl.textContent = `${p.regions[region].sideDone}/${p.regions[region].sideTotal}`;
  });
}

function toggleMarkerDiscovered(key, btnId) {
  if (!discoveredMarkers[currentRegion]) {
    discoveredMarkers[currentRegion] = new Set();
  }
  const set = discoveredMarkers[currentRegion];
  const btn = document.getElementById(btnId);
  const marker = markersByKey[key];
  if (set.has(key)) {
    set.delete(key);
    if (btn) {
      btn.classList.remove('completed');
      btn.textContent = btn.dataset.undoneLabel;
    }
    if (marker) {
      marker.setOpacity(1.0);
      if (marker._icon) marker._icon.style.pointerEvents = '';
    }
  } else {
    set.add(key);
    if (btn) {
      btn.classList.add('completed');
      btn.textContent = btn.dataset.doneLabel;
      // "Press the wax seal" — restart the stamp animation.
      btn.classList.remove('stamp'); void btn.offsetWidth; btn.classList.add('stamp');
    }
    if (marker) {
      if (hideDiscovered) {
        marker.setOpacity(0);
        if (marker._icon) marker._icon.style.pointerEvents = 'none';
        marker.closePopup();
      } else {
        marker.setOpacity(0.5);
      }
    }
  }
  // The label changes length (Discovered <-> Mark as Discovered), so re-measure the
  // popup: Leaflet only sizes it at open, and the longer label would otherwise wrap
  // inside the fixed-width box. This stretches it to fit on one line.
  const popup = marker && marker.getPopup && marker.getPopup();
  if (popup && popup.isOpen && popup.isOpen() && popup._updateLayout) {
    popup._updateLayout();
    popup._updatePosition();
  }
  saveDiscoveredToStorage();
  // Refresh sidebar progress stats + overall game completion
  renderCategoryList(document.getElementById('search-input')?.value || '');
  updateGameProgress();
}


