// ═══════════════════════════════════════════════
// ██ INITIALIZATION
// ═══════════════════════════════════════════════

// ═══════════════════════════════════════════════
// ██ CUSTOM CRS FOR TILE LAYERS
// ═══════════════════════════════════════════════
// Transformation (1, 0, -1, mapHeight): flips lat so positive lat goes UP
// (matching default L.CRS.Simple convention) but offsets by mapHeight so all
// pixel y values stay non-negative within the image bounds. This preserves
// the existing marker code (`L.marker([y, x])`) without flipping visuals.
// At z = max_zoom, scale = 1 (1 latlng unit = 1 source pixel).
// At z = 0, scale = 1/2^max_zoom (whole map fits in one 256px tile).
function makeMapCRS(maxZoom, mapHeight) {
  return L.extend({}, L.CRS.Simple, {
    transformation: new L.Transformation(1, 0, -1, mapHeight),
    scale: function (zoom) {
      return Math.pow(2, zoom - maxZoom);
    },
    zoom: function (scale) {
      return Math.log(scale) / Math.LN2 + maxZoom;
    },
  });
}


// Cache-busting: reuse the ?v= version stamped on our data <script> tags in
// index.html so fetch()ed JSON uses the same query string (single source of
// truth = the HTML). Returning visitors then get fresh data after each deploy.
const DATA_VERSION = (() => {
  const s = document.querySelector('script[src*="icon_map.js"]');
  const m = s && (s.getAttribute('src') || '').match(/[?&]v=([^&]+)/);
  return m ? m[1] : '';
})();
function withVersion(url) {
  return DATA_VERSION ? url + (url.includes('?') ? '&' : '?') + 'v=' + DATA_VERSION : url;
}

async function init() {
  const _introStart = performance.now();
  // Restore state
  currentRegion = localStorage.getItem(CONFIG.storageKeys.lastRegion) || 'trosky';
  loadUserMarkersFromStorage();
  loadActiveCategoriesFromStorage();
  loadDiscoveredFromStorage();
  loadCollapsedGroups();

  // On phones the sidebar is an overlay drawer — start collapsed so the map shows.
  if (window.matchMedia && window.matchMedia('(max-width: 768px)').matches) {
    document.getElementById('sidebar').classList.add('collapsed');
  }

  // Load local maps config
  try {
    if (window.location.protocol !== 'file:') {
      const resp = await fetch(withVersion('data/local_maps.json'));
      if (resp.ok) localMapsConfig = await resp.json();
    }
  } catch (e) {
    console.warn('[KCD2 Map] Fetch local_maps.json failed:', e);
  }
  // Fallback to script-tag loaded data
  if (Object.keys(localMapsConfig).length === 0 && window.LOCAL_MAPS_DATA) {
    localMapsConfig = window.LOCAL_MAPS_DATA;
  }

  // Set active region button (drives the sliding pill + aria on first paint)
  document.querySelectorAll('.region-btn').forEach(btn => {
    const on = btn.dataset.region === currentRegion;
    btn.classList.toggle('active', on);
    btn.setAttribute('aria-pressed', on ? 'true' : 'false');
  });

  // Load region (creates the map)
  await loadRegion(currentRegion);

  // Restore from URL hash if present
  restoreFromHash();

  // Restore the last-open sidebar side (markers / mymarkers / tools / info), then surface
  // the one-time right-click hint. Unknown values (e.g. from a pre-rail layout) are
  // ignored by switchSide.
  let savedTab = null;
  try { savedTab = localStorage.getItem(CONFIG.storageKeys.activeTab); } catch (e) { /* ignore */ }
  if (savedTab) switchSide(savedTab);
  maybeShowMapHint();
  scheduleIntroDismiss(_introStart);
}

function attachMapEventHandlers() {
  map.on('mousemove', onMouseMove);
  map.on('contextmenu', onRightClick);
  map.on('moveend', updateHash);
  map.on('zoomend', updateLocalMapVisibility);
  map.on('moveend', updateLocalMapVisibility);
  map.on('zoomend', updateLabelScale);
  map.on('zoom', updateZoomDisplay);
  map.on('zoomend', updateZoomDisplay);
  updateZoomDisplay();
}

function updateZoomDisplay() {
  const el = document.getElementById('zoom-display');
  if (el && map) el.textContent = `Zoom ${+map.getZoom().toFixed(2)}`;
}

function onMouseMove(e) {
  const x = Math.round(e.latlng.lng);
  const y = Math.round(e.latlng.lat);
  document.getElementById('coords-display').textContent = `X: ${x}  Y: ${y}`;
}

function restoreFromHash() {
  const hash = window.location.hash;
  if (!hash) return;

  // Format: #zoom/y/x or #zoom/y/x/category:mx:my (with marker permalink)
  const match = hash.match(/#(-?\d+\.?\d*)\/(-?\d+\.?\d*)\/(-?\d+\.?\d*)(?:\/(.+))?/);
  if (match) {
    const zoom = parseFloat(match[1]);
    const y = parseFloat(match[2]);
    const x = parseFloat(match[3]);
    const markerKey = match[4] || null;

    map.setView([y, x], zoom);

    if (markerKey) {
      // Open the marker's popup after a short delay for rendering
      setTimeout(() => {
        // Activate AND build the marker's category before the lookup: categories
        // build lazily, so a permalink into one the default view never opened
        // wouldn't be in markersByKey yet (previously the popup silently no-op'd).
        const catId = markerKey.split(':')[0];
        if (markerLayers[catId]) {
          if (!activeCategories.has(catId)) {
            activeCategories.add(catId);
            markerLayers[catId].addTo(map);
            renderCategoryList('');
          }
          ensureCategoryBuilt(catId);
        }
        const marker = markersByKey[markerKey];
        if (marker) marker.openPopup();
      }, 500);
    }
  }
}

function updateHash() {
  if (window.location.protocol === 'file:') return;
  const center = map.getCenter();
  const zoom = map.getZoom();
  const hash = `#${zoom.toFixed(2)}/${center.lat.toFixed(1)}/${center.lng.toFixed(1)}`;
  history.replaceState(null, null, hash);
}

function updateHashWithMarker(markerKey) {
  if (window.location.protocol === 'file:') return;
  const center = map.getCenter();
  const zoom = map.getZoom();
  const hash = `#${zoom.toFixed(2)}/${center.lat.toFixed(1)}/${center.lng.toFixed(1)}/${markerKey}`;
  history.replaceState(null, null, hash);
}


// ═══════════════════════════════════════════════
// ██ REGION MANAGEMENT
// ═══════════════════════════════════════════════

async function loadRegion(region, opts = {}) {
  const regionCfg = CONFIG.regions[region];
  const mapW = regionCfg.mapWidth;
  const mapH = regionCfg.mapHeight;
  const maxZoom = regionCfg.max_zoom;

  // When rebuilding the same region (e.g. after saving marker edits), keep the
  // current view instead of snapping back to the full-map fitBounds.
  let savedView = null;
  if (map && opts.preserveView) savedView = { center: map.getCenter(), zoom: map.getZoom() };

  // Destroy existing map (CRS changes per region, so map must be recreated)
  if (map) {
    map.off();
    map.remove();
    map = null;
  }

  // Reset all layer state
  imageOverlay = null;
  markerLayers = {};
  markersByKey = {};
  settlementLabelLayer = null;

  // Create new map with region-specific CRS
  // maxZoom extends beyond the tile pyramid's max — Leaflet upscales the
  // highest-resolution tiles for closer inspection. +2 gives 4× extra zoom.
  const extraZoom = 2;
  map = L.map('map', {
    crs: makeMapCRS(maxZoom, mapH),
    minZoom: 0,
    maxZoom: maxZoom + extraZoom,
    zoomSnap: 0.25,
    zoomDelta: 0.5,
    zoomControl: true,
    attributionControl: false,
    preferCanvas: true,
    fadeAnimation: false,
  });

  // Bounds in image pixel coordinates
  const bounds = [[0, 0], [mapH, mapW]];
  currentRegionBounds = bounds;   // remembered for the Reset-view control
  const pad = 200;
  // Pad south/east/west but NOT north — north padding would produce
  // negative pixel y with our transformation.
  map.setMaxBounds([[-pad, -pad], [mapH, mapW + pad]]);

  // Tile layer — sharp detail where tiles exist.
  // 1×1 transparent PNG as fallback for missing/skipped tiles.
  const EMPTY_TILE = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII=';

  imageOverlay = L.tileLayer(regionCfg.tilesUrl, {
    tileSize: 256,
    minZoom: 0,
    maxZoom: maxZoom + extraZoom,
    maxNativeZoom: maxZoom,
    minNativeZoom: 0,
    noWrap: true,
    bounds: bounds,
    updateWhenZooming: false,    // don't reload tiles mid-zoom animation
    updateInterval: 150,         // throttle tile updates during pan
    keepBuffer: 3,               // keep extra tiles around viewport
    errorTileUrl: EMPTY_TILE,    // transparent fallback for missing tiles
    attribution: '© Warhorse Studios',
  }).addTo(map);

  // Center on region (or restore the prior view when preserving it)
  map.fitBounds(bounds);
  // Floor the zoom at the full-map fit — no zooming out past the whole region, so
  // we never render the empty padded area beyond the map. The fit zoom depends on
  // the viewport, so recompute it whenever the map container resizes (sidebar
  // drawer, fullscreen, window resize).
  map.setMinZoom(map.getBoundsZoom(bounds));
  map.on('resize', () => { if (currentRegionBounds) map.setMinZoom(map.getBoundsZoom(currentRegionBounds)); });
  if (savedView) map.setView(savedView.center, savedView.zoom, { animate: false });
  updateLabelScale();

  // User marker layer
  userMarkerLayer = L.layerGroup().addTo(map);

  // Re-attach event handlers
  attachMapEventHandlers();

  // Load marker data
  if (!allMarkerData[region]) {
    let loaded = false;

    // Only try fetch on http/https (file:// protocol blocks fetch via CORS)
    if (window.location.protocol !== 'file:') {
      try {
        const resp = await fetch(withVersion(regionCfg.markers));
        if (!resp.ok) throw new Error(`HTTP ${resp.status}: ${resp.statusText}`);
        allMarkerData[region] = await resp.json();
        console.log(`[KCD2 Map] Loaded ${region} via fetch: ${allMarkerData[region].markers?.length || 0} markers`);
        loaded = true;
      } catch (e) {
        console.warn(`[KCD2 Map] Fetch failed for ${region}, trying fallback...`);
      }
    }

    // Fallback: use data loaded via <script> tags
    if (!loaded) {
      const fallbackKey = `MARKER_DATA_${region.toUpperCase()}`;
      if (window[fallbackKey]) {
        allMarkerData[region] = window[fallbackKey];
        console.log(`[KCD2 Map] Loaded ${region} via embedded script: ${allMarkerData[region].markers?.length || 0} markers`);
      } else {
        console.error(`[KCD2 Map] No marker data found for ${region}`);
        allMarkerData[region] = { categories: [], markers: [] };
        if (typeof showToast === 'function') showToast(`Could not load markers for ${region} — check your connection`);
      }
    }
  }

  // Merge categories (use trosky as the master list). Clone the array so the
  // runtime augmentation below (EXTRA_CATEGORIES + group fallbacks) does NOT
  // mutate the pristine base in allMarkerData — otherwise Save-to-data would
  // bake those placeholder categories into the JSON, bloating it on every save.
  const regionData = allMarkerData[region];
  if (regionData.categories && regionData.categories.length > 0) {
    categories = regionData.categories.slice();
  }

  // Ensure extra categories exist (not in marker JSON but needed for manual markers)
  const EXTRA_CATEGORIES = [
    { id: "barber", name: "Barber", icon: "💈", color: "#c9a84c" },
    { id: "fast_travel_level", name: "Level Transition", icon: "🚪", color: "#5a9ec9" },
    { id: "fist_fight_arena", name: "Fist Fight Arena", icon: "👊", color: "#c9a84c" },
    { id: "player_bed", name: "Player Bed", icon: "🛏️", color: "#c9a84c" },
    { id: "smithy", name: "Smithy", icon: "⚒️", color: "#c9a84c" },
    // DLC quest classes — icons resolve from ICON_MAP → icons/DLCn_icon.png.
    // DLC0=The Lion's Crest, DLC1=Brushes with Death, DLC2=Legacy of the Forge,
    // DLC3=Mysteria Ecclesiae (owner-confirmed icon→DLC mapping).
    { id: "quest_dlc0", name: "The Lion's Crest", icon: "📜", color: "#9d6bd0" },
    { id: "quest_dlc1", name: "Brushes with Death", icon: "📜", color: "#9d6bd0" },
    { id: "quest_dlc2", name: "Legacy of the Forge", icon: "📜", color: "#9d6bd0" },
    { id: "quest_dlc3", name: "Mysteria Ecclesiae", icon: "📜", color: "#9d6bd0" },
  ];
  EXTRA_CATEGORIES.forEach(extra => {
    if (!categories.find(c => c.id === extra.id)) {
      categories.push(extra);
    }
  });

  // Ensure every category referenced in CATEGORY_GROUPS is available for manual markers
  CATEGORY_GROUPS.forEach(group => {
    group.categories.forEach(catId => {
      if (!categories.find(c => c.id === catId)) {
        // Auto-generate a friendly name from the id
        const name = catId.replace(/^loot_/, '').replace(/_/g, ' ')
          .replace(/\b\w/g, l => l.toUpperCase());
        categories.push({ id: catId, name, icon: "📦", color: "#c9a84c" });
      }
    });
  });

  // Fast O(1) category lookup, rebuilt per region (categories is reassigned above).
  categoriesById = {};
  categories.forEach(cat => { categoriesById[cat.id] = cat; });

  // Initialize category layers
  categories.forEach(cat => {
    markerLayers[cat.id] = L.layerGroup();
    if (activeCategories.has(cat.id)) {
      markerLayers[cat.id].addTo(map);
    }
  });

  // Group this region's markers (renames/deletes applied) by category, then build
  // ONLY the active categories now. Inactive categories are constructed lazily the
  // first time they're toggled on (ensureCategoryBuilt) — so a default visit doesn't
  // allocate every marker + its drag handler up front.
  invalidateEditedMarkers(region);
  const allMarkers = getEditedMarkers(region);
  markersByCategory = {};
  builtCategories = new Set();
  allMarkers.forEach(m => {
    (markersByCategory[m.category] || (markersByCategory[m.category] = [])).push(m);
  });
  let markerCount = 0;
  activeCategories.forEach(catId => { markerCount += ensureCategoryBuilt(catId); });
  console.log(`[KCD2 Map] Region: ${region}, Categories: ${categories.length}, Markers built: ${markerCount}/${allMarkers.length} (active only), Active layers: ${activeCategories.size}`);

  // Render user markers
  renderUserMarkersOnMap(region);

  // Render settlement labels
  renderSettlementLabels(region);

  // Load local detail maps
  loadLocalMaps(region);

  // Render sidebar
  renderCategoryList();
  renderMyMarkersList();

  // Apply hide-discovered state if active
  if (hideDiscovered) applyHideDiscovered();

  // Keep the Edit Markers counter + overall game-completion bar in sync
  if (typeof updateMarkerEditStatus === 'function') updateMarkerEditStatus();
  if (typeof updateGameProgress === 'function') updateGameProgress();
}

function switchRegion(region) {
  if (region === currentRegion) return;
  currentRegion = region;
  localStorage.setItem(CONFIG.storageKeys.lastRegion, region);

  document.querySelectorAll('.region-btn').forEach(btn => {
    const on = btn.dataset.region === region;
    btn.classList.toggle('active', on);
    btn.setAttribute('aria-pressed', on ? 'true' : 'false');
  });

  loadRegion(region);
}


