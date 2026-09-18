// ═══════════════════════════════════════════════
// ██ SETTLEMENT LABELS
// ═══════════════════════════════════════════════

let showSettlementLabels = true;
let settlementLabelMarkers = [];  // { marker, x, y, name } — for show/hide + language refresh

// Display name for a settlement label. When Čeština is active the English name
// (the key in data/settlement_labels) swaps to its Czech counterpart from
// data/settlement_names_cs.js; banners, saved drag positions, and the exported
// data files all keep using the English key.
function localizedSettlementName(name) {
  if (currentLang === 'cs' && window.SETTLEMENT_NAME_CS && Object.prototype.hasOwnProperty.call(window.SETTLEMENT_NAME_CS, name)) {
    return window.SETTLEMENT_NAME_CS[name];
  }
  return name;
}

// Town crest accompanying each settlement name → banners/<file>.png.
// Kept separate from SETTLEMENT_LABELS so the positioning tool's export doesn't drop it.
const SETTLEMENT_BANNERS = {
  // Trosky
  "Apollonia": "apolena", "Nebakov Fortress": "nebakov", "Nomads' Camp": "nomad_camp",
  "Semine": "semin", "Tachov": "tachov", "Troskowitz": "troskovice",
  "Trosky Castle": "trosky", "Zhelejov": "zelejov",
  // Kuttenberg
  "Bohunowitz": "bohounovice", "Bylany": "bylany", "Devil's Den": "certovka",
  "Grund": "grunta", "Horschan": "horany", "Kuttenberg": "kutna_hora",
  "Maleshov": "malesov", "Miskowitz": "miskovice", "Old Kutna": "stara_kutna",
  "Opatowitz": "opatovice", "Pschitoky": "pritoky", "Raborsch": "ratbor",
  "Sigismund's Camp": "zikmund_camp", "Suchdol": "suchdol", "Wysoka": "vysoka",
};
// Per-town crest height override (px); others use the CSS default (28px).
const SETTLEMENT_BANNER_SIZE = { "Kuttenberg": 36 };

function renderSettlementLabels(region) {
  if (settlementLabelLayer) {
    map.removeLayer(settlementLabelLayer);
  }
  settlementLabelLayer = L.layerGroup();
  settlementLabelMarkers = [];

  const labels = (typeof SETTLEMENT_LABELS !== 'undefined') ? SETTLEMENT_LABELS[region] : null;
  if (!labels) return;

  const positions = loadLabelPositions(region);

  labels.forEach(label => {
    // Use a saved (dragged) position if one exists, else the data coordinate.
    const pos = positions[label.name] || { x: label.x, y: label.y };
    const crest = SETTLEMENT_BANNERS[label.name];
    const crestPx = SETTLEMENT_BANNER_SIZE[label.name];
    const crestStyle = crestPx ? ` style="height:${crestPx}px"` : '';
    const crestHtml = crest ? `<img class="sl-crest"${crestStyle} src="banners/${crest}.png" alt="" onerror="this.style.display='none'">` : '';
    const icon = L.divIcon({
      className: 'settlement-label' + (labelEditing ? ' label-draggable' : ''),
      html: `<span class="sl-stack">${crestHtml}<span class="sl-name">${localizedSettlementName(label.name)}</span></span>`,
      iconSize: null,
      iconAnchor: [0, 0],
    });
    const marker = L.marker([pos.y, pos.x], {
      icon,
      interactive: labelEditing,
      draggable: labelEditing,
      zIndexOffset: labelEditing ? 10000 : -1000,
    });
    if (labelEditing) {
      marker.on('dragend', () => {
        const ll = marker.getLatLng();
        const x = Math.round(ll.lng), y = Math.round(ll.lat);
        saveLabelPosition(region, label.name, x, y);
        showToast(`${localizedSettlementName(label.name)} → X:${x} Y:${y}`);
      });
    }
    marker.addTo(settlementLabelLayer);
    settlementLabelMarkers.push({ marker, x: pos.x, y: pos.y, name: label.name });
  });

  if (showSettlementLabels || labelEditing) {
    settlementLabelLayer.addTo(map);
  }
  updateLabelScale();
  updateSettlementLabelVisibility();
}

// Re-point settlement label text after the language switcher changes. Labels live
// in cached Leaflet div-icons, so names update in place without a rebuild (drag
// state, z-index and visibility all survive).
function refreshSettlementLabelLanguage() {
  settlementLabelMarkers.forEach(({ marker, name }) => {
    const el = marker.getElement();
    if (!el) return;
    const nameEl = el.querySelector('.sl-name');
    if (nameEl) nameEl.textContent = localizedSettlementName(name);
  });
}

// QOL: hide a settlement name once the local detail map for that town is showing
// (its coordinate falls inside a visible overlay's bounds), so the floating name
// doesn't sit on top of the detailed map. Stays visible while positioning labels.
function updateSettlementLabelVisibility() {
  if (!settlementLabelMarkers.length) return;
  const coveredBounds = labelEditing ? [] : localMapOverlays
    .filter(o => o.visible)
    .map(o => L.latLngBounds(o.config.bounds[0], o.config.bounds[1]));
  settlementLabelMarkers.forEach(({ marker, x, y }) => {
    const el = marker.getElement();
    if (!el) return;
    const covered = coveredBounds.some(b => b.contains([y, x]));
    el.style.display = covered ? 'none' : '';
  });
}

// Settlement names render at base size up to LABEL_GROW_FROM_ZOOM, then grow as
// you zoom in so they stay readable against the detailed map (capped so they
// never get huge). Applied via the --label-scale var on the inner .sl-name span.
const LABEL_GROW_FROM_ZOOM = 3.5;  // at/below this zoom, names are base size (×1)
const LABEL_GROW_RATE = 0.45;      // higher = grows faster as you zoom in
const LABEL_MAX_SCALE = 2.6;       // cap on how large names can get
function updateLabelScale() {
  if (!map) return;
  const raw = Math.pow(2, (map.getZoom() - LABEL_GROW_FROM_ZOOM) * LABEL_GROW_RATE);
  const s = Math.min(LABEL_MAX_SCALE, Math.max(1, raw));
  document.documentElement.style.setProperty('--label-scale', s.toFixed(4));
}

function toggleSettlementLabels() {
  const cb = document.getElementById('toggle-labels');
  showSettlementLabels = cb ? cb.checked : !showSettlementLabels;
  if (!settlementLabelLayer) return;
  if (showSettlementLabels || labelEditing) {
    settlementLabelLayer.addTo(map);
    updateSettlementLabelVisibility();
  } else {
    map.removeLayer(settlementLabelLayer);
  }
}

// ── Settlement-name position editing (drag-to-place) ──
const LABEL_POS_KEY = CONFIG.storageKeys.labelPositions;

function loadLabelPositions(region) {
  try {
    const saved = JSON.parse(localStorage.getItem(LABEL_POS_KEY) || '{}');
    return saved[region] || {};
  } catch (e) { return {}; }
}

function saveLabelPosition(region, name, x, y) {
  try {
    const saved = JSON.parse(localStorage.getItem(LABEL_POS_KEY) || '{}');
    if (!saved[region]) saved[region] = {};
    saved[region][name] = { x, y };
    localStorage.setItem(LABEL_POS_KEY, JSON.stringify(saved));
  } catch (e) { console.error('Failed to save label position:', e); }
}

function labelEditOpen() {
  if (!ensureSoleTool('label-edit-panel')) return;
  document.getElementById('label-edit-panel').classList.add('active');
  if (!showSettlementLabels) {
    document.getElementById('toggle-labels').checked = true;
    toggleSettlementLabels();
  }
}

function labelEditClose() {
  if (labelEditing) labelEditToggle();  // leave drag mode cleanly
  document.getElementById('label-edit-panel').classList.remove('active');
}

function labelEditToggle() {
  labelEditing = !labelEditing;
  const btn = document.getElementById('label-edit-toggle');
  if (btn) {
    btn.textContent = labelEditing ? '■ Stop Editing' : '✥ Start Editing';
    btn.classList.toggle('btn-primary', labelEditing);
    btn.classList.toggle('btn-secondary', !labelEditing);
  }
  if (labelEditing && !showSettlementLabels) {
    document.getElementById('toggle-labels').checked = true;
    showSettlementLabels = true;
  }
  renderSettlementLabels(currentRegion);
  showToast(labelEditing ? 'Drag each name onto its spot' : 'Editing off');
}

async function labelEditReset() {
  if (!(await showConfirm(`Reset all settlement-name positions for ${currentRegion} to their original coordinates? This clears your drags for this region.`, {title:'Reset positions', confirmText:'Reset', danger:true}))) return;
  try {
    const saved = JSON.parse(localStorage.getItem(LABEL_POS_KEY) || '{}');
    delete saved[currentRegion];
    localStorage.setItem(LABEL_POS_KEY, JSON.stringify(saved));
  } catch (e) {}
  renderSettlementLabels(currentRegion);
  showToast(`Positions reset for ${currentRegion}`);
}

function labelEditExport() {
  if (typeof SETTLEMENT_LABELS === 'undefined') return;
  // Merge saved drag positions into the full label set, per region.
  const out = {};
  for (const region of Object.keys(SETTLEMENT_LABELS)) {
    const positions = loadLabelPositions(region);
    out[region] = SETTLEMENT_LABELS[region].map(l => {
      const p = positions[l.name];
      return { name: l.name, x: p ? p.x : l.x, y: p ? p.y : l.y };
    });
  }
  const jsonStr = JSON.stringify(out, null, 2);

  // JS wrapper matching data/settlement_labels.js
  const jsContent =
    '// Settlement labels — positions adjusted via the in-app Position Settlement Names tool\n' +
    'const SETTLEMENT_LABELS = ' + jsonStr + ';\n' +
    "if (typeof window !== 'undefined') window.SETTLEMENT_LABELS = SETTLEMENT_LABELS;\n";

  labelDownload('settlement_labels.js', jsContent, 'text/javascript');
  setTimeout(() => labelDownload('settlement_labels.json', jsonStr, 'application/json'), 120);
  showToast('Exported settlement_labels.js + .json — put both in data/');
}

function labelDownload(filename, text, mime) {
  const blob = new Blob([text], { type: mime });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = filename;
  a.click();
}

