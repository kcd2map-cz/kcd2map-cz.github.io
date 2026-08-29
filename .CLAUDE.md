# KCD2 Interactive Map — Project Context

## Overview
An interactive web map for Kingdom Come: Deliverance 2, deployed at https://quangdao215.github.io/kcd2_interactive_map/. Built with Leaflet.js, extracting POI data from game files, calibrating coordinates to stitched map images, and supplementing with community data.

Repository: `QuangDao215/kcd2_interactive_map` on GitHub Pages.

---

## File Structure

```
E:\kcd2_map\  (repo root)
├── index.html                       # Page shell + markup only (~330 lines)
├── style.css                        # All styles (extracted from index.html)
├── js/                              # App logic, split from the old app.js into
│   │                                #   ordered classic scripts (shared global scope,
│   │                                #   loaded in this order — see index.html):
│   ├── config.js                    #   CONFIG, state, category groups, constants
│   ├── map.js                       #   CRS, region load, cache-busting (DATA_VERSION)
│   ├── markers.js                   #   POI markers + Edit Markers tool + Save/Embed
│   ├── sidebar.js                   #   category list / progress / search / legend
│   ├── user-markers.js              #   custom (right-click) markers
│   ├── import-export.js             #   backup v3 import/export
│   ├── local-maps.js                #   detail-map overlays + calibration tool
│   ├── labels.js                    #   settlement-name labels
│   ├── storage.js                   #   localStorage + getMarkerKey/discovered
│   └── main.js                      #   UI helpers + init()
├── main_icon.png                    # Favicon (game icon)
├── README.md, LICENSE, .gitignore
├── active_icons.txt                 # Manifest of item icons to force-commit (icons/items/* is gitignored)
├── docs/
│   ├── editorial_design_reference.md # The editorial design system we adopt (rules · tokens · mapping)
│   └── kcd2_taverns_lodgings.md      # Verified Czech file-name ↔ English tavern/lodging names
│
├── data/
│   ├── markers_trosky.json          # Trosky region POI markers
│   ├── markers_trosky.js            # Script-tag fallback wrapper
│   ├── markers_kuttenberg.json      # Kuttenberg region POI markers
│   ├── markers_kuttenberg.js        # Script-tag fallback wrapper
│   ├── icon_map.js                  # Maps category IDs → icon PNG paths
│   ├── settlement_labels.js         # Settlement name positions per region (+ .json)
│   ├── settlement_labels.json       # Plain JSON copy
│   ├── local_maps.json              # Local detail map overlay config (bounds, minZoom)
│   └── local_maps.js                # Script-tag fallback for local_maps.json
│
├── maps/
│   ├── trosky/map.png               # 6144×6144 stitched world map
│   ├── kuttenberg/map.png           # 12288×10240 (Reddit source: j5vhvv3hslie1.jpeg)
│   └── local/                       # Local detail maps: 23 .webp (committed) + .png sources (git-ignored)
│       ├── kutna_hora.png           # 8192×8192 (4×4 grid)
│       ├── troskovice.png           # 4096×4096 (2×2 grid)
│       ├── nomad_camp.png           # 2048×2048 (1×1 single tile)
│       └── ...                      # 21 more local maps
│
├── icons/
│   ├── *.png                        # Map POI icons (32×32 with 2px border)
│   ├── items/*.png                  # Item/loot icons
│   └── map_label_*.png              # LEGACY banner caps — unused (labels are plain text now)
│
├── tiles/
│   ├── trosky/{z}/{x}/{y}.webp      # Tile pyramid (max zoom 5)
│   └── kuttenberg/{z}/{x}/{y}.webp  # Tile pyramid (max zoom 6)
│
├── tools/                           # Dev/build scripts (Python)
│   ├── extract_pois.py              # Extract POIs from game XML
│   ├── calibrate_markers.py         # World→pixel coordinate transform
│   ├── merge_gamerguides.py         # Fill gaps with community data
│   ├── build_markers.py             # Regenerate marker .js from .json
│   ├── generate_tiles.py            # Slice map into Leaflet tile pyramid (WebP)
│   ├── stitch_maps.py               # Stitch game map tiles (with background fill)
│   ├── process_local_maps.py        # Reconstruct split DDS, stitch local maps
│   ├── convert_dds_to_png.py        # Convert DDS files to PNG
│   ├── crop_banner.py               # Crop banner textures to visible ribbon
│   ├── resize_icons.py              # Resize icons to 32×32 with padding
│   ├── apply_trosky_correction.py   # Apply 9-point affine correction
│   ├── rename_hunting_spots.py      # Clean hunting-spot names from poi_type_name
│   ├── strip_location_suffix.py     # Drop redundant " — <place>" name suffixes
│   ├── rename_fast_travel.py        # Fast-travel point names (English-localized)
│   ├── clean_baked_categories.py    # Restore clean categories from data_backup
│   ├── split_app.py                 # One-time app.js → js/ split (round-trip checked)
│   └── hooks/pre-commit             # Auto-regenerates marker .js from .json on commit
│
├── eslint.config.mjs                # ESLint (run: npx eslint js/) — real-bug rules
└── tests/keys.test.js               # node test for marker-key logic (11 assertions)
```

> **Dev workflow:** edit `data/markers_*.json` then commit — the `tools/hooks/pre-commit`
> hook regenerates the `.js` fallbacks (enable once via `git config core.hooksPath tools/hooks`).
> Lint with `npx eslint js/`; test the key logic with `node tests/keys.test.js`.
> Data files load with a `?v=` cache-buster (in `index.html`); **bump it on every deploy**.

---

## Architecture & Key Decisions

### Tile-Based Map Rendering
- Switched from L.imageOverlay to L.tileLayer for performance
- Custom CRS per region: `makeMapCRS(maxZoom, mapHeight)` — transformation (1, 0, -1, mapHeight), scale = 2^(z-maxZoom)
- Trosky: max_zoom=5 (8192 canvas), Kuttenberg: max_zoom=6 (16384 canvas)
- Extra zoom +2 beyond native max (Leaflet upscales)
- `errorTileUrl` = transparent 1px PNG data URI for missing tiles
- Performance: `fadeAnimation:false, preferCanvas:true, updateWhenZooming:false, keepBuffer:3`
- Tile seam fix: CSS `outline: 1px solid transparent; backface-visibility: hidden;`
- Map must be recreated on region switch (CRS differs per region)

### Kuttenberg Map Source
- Original game tiles are incomplete (8 of 30 missing — inaccessible areas)
- Missing tiles: 1, 6, 19, 24, 25, 26, 29, 30 in a 6×5 grid
- **Decision**: Use full Reddit community map (j5vhvv3hslie1.jpeg, 12288×10240) directly as the source, bypassing game tile stitching. Complete coverage, no black areas.
- `stitch_maps.py` supports `--background` flag to use tile_0 (overview) or Reddit map as fill for missing areas

### Coordinate Calibration

**Trosky (9-point corrected):**
```
px' = 0.998348*x + 0.004273*y + -7.6644
py' = 0.000673*x + 0.989192*y + 32.1121
```
Applied via `apply_trosky_correction.py`.

**Kuttenberg (GG fast travel bridge, 9-point least squares):**
```
px = 0.9912*x + 0.0068*y + -16.63
py = 0.0334*x + -0.9963*y + 9800.12
```

### Settlement Labels
- Trosky: 8 labels, Kuttenberg: 15 labels (from ui_map_label.xml); English names verified vs wiki
- **Plain text** (gold `#e8d5a3`, Segoe UI, multi-direction text-shadow). A 3-part
  scroll-banner design was built and then **rejected** (it obscured map detail) — reverted
  to plain text. The banner caps (`icons/map_label_*.png`) and `crop_banner.py` are now legacy/unused.
- Names **grow as you zoom in** (`updateLabelScale`: base size at/below zoom 3.5, capped ~2.6×),
  applied via an inner `.sl-name` span so Leaflet's positioning transform on the marker root
  isn't clobbered.
- A name **auto-hides** when its town's local-map overlay is showing (geometric: the name's
  coord lies inside a visible overlay's bounds) — see `updateSettlementLabelVisibility`.
- Positions are drag-calibrated via **Tools → Position Settlement Names**, saved to localStorage
  (`kcd2_label_positions`), and baked into `data/settlement_labels.{js,json}`.

### Local Detail Maps
- 23 unique local maps extracted from game DDS files
- CryEngine split-mipmap format: header (.dds) + mip levels (.dds.1 through .dds.6)
- Reconstruction: header[:128 or 148] + largest mip only, patch mipMapCount=1
- **Column-major** stitching was wrong → **row-major** is correct
- Config stored in `data/local_maps.json` + `data/local_maps.js` (script-tag fallback)
- Visibility: zoom ≥ each town's **hand-set `minZoom`** (read straight from `data/local_maps.json`)
  AND the viewport center is within the overlay's **centered inner trigger zone**
  (`LOCAL_MAP_TRIGGER = 0.5`, inner 50%) — so panning a town's outskirts doesn't pop the overlay
  over the detail you're inspecting
- Per-town trigger zoom is set **manually** in `data/local_maps.json` (smaller towns → higher
  values; keep values on the 0.25 zoom grid, e.g. Devil's Den = 6.5, Kuttenberg city = 4.75, so
  the threshold lands on a zoom you can stop at). An auto-scaling formula was trialled and
  **dropped** in favour of manual control.
- Calibration tool: Tools → Calibrate Local Map → select map → drag to move, scale % to resize → Export Config downloads both JSON+JS
- Calibrated bounds persist in localStorage + exportable to JSON files

**Local Map Name Mapping:**
| File Name | English Name | Region |
|-----------|-------------|--------|
| apolena | Apollonia | Trosky |
| bohounovice | Bohunowitz | Trosky |
| bylany | Bylany | Kuttenberg |
| certovka | Devil's Den | Trosky |
| grunta | Grund | Kuttenberg |
| horany | Horschan | Trosky |
| klaster_interior | Sedletz Monastery | Kuttenberg |
| kutna_hora | Kuttenberg | Kuttenberg |
| malesov | Maleshov | Kuttenberg |
| miskovice | Miskowitz | Kuttenberg |
| nebakov | Nebakov | Trosky |
| nomad_camp | Nomad's Camp | Trosky |
| opatovice | Sigismund's Camp | Kuttenberg |
| pritoky | Pschitoky | Kuttenberg |
| ratbor | Raborsch | Trosky |
| semin | Semine | Trosky |
| stara_kutna | Old Kutna | Kuttenberg |
| suchdol | Suchdol | Kuttenberg |
| tachov | Tachov | Trosky |
| troskovice | Troskowitz | Trosky |
| trosky | Trosky Castle | Trosky |
| vysoka | Wysoka | Kuttenberg |
| zelejov | Zhelejov | Trosky |

---

## Frontend Features (index.html)

### Sidebar
- 11+ collapsible category groups with real game icons (from ICON_MAP)
- Per-category progress stats: `discovered/total` for PROGRESS_CATEGORIES, plain count for NPCs/facilities
- Group-level percentage: `12/45 (27%)`
- Three tabs — Markers, My Markers, Tools — each with a leading inline icon (pin / star / wrench)
- **Region switcher** — a **sliding segmented control** (recessed track + gold pill) under a quiet
  `Region` eyebrow. The pill is a `::before` positioned by which `.region-btn` is `.active` via a
  `:has()` selector, so `switchRegion()` stays layout-agnostic; `aria-pressed` syncs with it.
- **Eyebrow labels** (from the editorial-artifacts design language — full notes in
  `docs/editorial_design_reference.md`): all section/group labels — the `View` header, Tools headers
  (`.tools-section h3`), category group names (`.cat-group-header .group-name`), the `Region`
  eyebrow, and the reusable `.section-eyebrow` — are quiet **muted** (`--text-secondary`) uppercase
  Cinzel at ~10–11px with 0.1em tracking and a hairline as the grouping device. **Gold (`--accent`)
  is reserved** for the display title, the `%`/count figures, and active states.
- **Game Completion — collapsible stat card:** its header is a toggle button that collapses the whole
  body (bar + `x / y found` + per-region rows); the large **mono** `%` figure (`--font-mono`, gold)
  stays visible in the header when collapsed. Per-region Trosky/Kuttenberg names are 12.5px; the
  active region's name + bar go gold.
- **UI icon pass:** the chrome carries inline **`currentColor`** SVG icons that theme themselves —
  search magnifier, tab icons, tool-button glyphs (download/upload/trash/reset/crosshair/move/pencil),
  Show All / Hide All (eye / eye-off), the View chips, and empty-state glyphs (via CSS `mask`). No
  icon font, CSP-safe.
- **Ember accent (`--ember` `#e07b39`):** a second reserved hue used *only* for the collapse carets
  (View + Game Completion), so the "this collapses" affordance reads distinctly from gold.
- **Toggle polish:** the shared `.switch` (category on/off) has a recessed track (inset shadow) + a
  raised drop-shadow thumb with a 0.24s slide; the on-state keeps the **gold track fill** (dark thumb)
  for at-a-glance legibility across the dense category list.

### Categories
**PROGRESS_CATEGORIES** (tracked with discovered/total):
- All loot_* items **except `loot_herb`**, quest_main, quest_side, quest_task
- shrine, conc_cross, grave, interesting_site
- nest, cart_stash, lootable_corpse

**NOT tracked** (plain count only):
- NPCs/merchants, facilities, locations, hunting/fishing spots
- **Herbs (`loot_herb`)** — ambient world gathering found all over the map, so excluded from Game
  Completion (still a browsable category, and its popup still says "Collected")

**EXTRA_CATEGORIES** (always available even without marker data):
- barber, fist_fight_arena, player_bed, smithy

**Removed classes**: bailiff, pillory (not in game)

**smithy vs blacksmith**: separate categories with separate icons. All original "blacksmith" markers were renamed to "smithy".

### Search
- Type 2+ chars to search markers by name across all categories
- Dropdown with real icons, click → flyTo + open popup
- Also filters the category list simultaneously; shows a "No markers found" empty state
- Click outside to close results

### Progress Tracking
- Discovered markers: opacity 0.5
- "Hide discovered" toggle: opacity 0 + pointer-events none (fully invisible)
- Progress stats refresh live on mark/unmark
- User markers included in progress counts

### Custom User Markers
- Right-click to add, custom icon dropdown with real game icons + search filter
- Edit button in popup (inline form with same icon dropdown)
- Delete with confirmation
- **Drag to reposition — only while the Edit Markers tool is on** (same guard as POI
  markers). They used to be draggable always, which let a stray drag while panning
  silently move a marker; since a custom marker's key **is** `category:x:y`, that also
  silently dropped its discovered tick. `dragend` now migrates the discovered record
  to the new key (as `saveEditedMarker` already did for renames).
- flyToMarker from My Markers sidebar list (with real icons)

### Import/Export
- **Export All / Import All**: single backup file (**v3**) with custom markers + progress +
  **label positions (`kcd2_label_positions`) + active category filters + marker edits/deletes
  (`kcd2_marker_edits`/`kcd2_marker_deletes`)** + version/date. Import is backward-compatible
  with v1/v2 backups and rebuilds the view via `loadRegion`.
- Import All handles ID conflict resolution (resets nextUserMarkerId)
- The per-type Export/Import (markers-only, progress-only) buttons were **removed** — Export/Import
  All covers them. `clearMyMarkers`/`clearProgress` (Data Management) remain.

### URL Permalinks
- Format: `#zoom/lat/lng` or `#zoom/lat/lng/category:x:y` (with marker)
- Opening any popup updates URL with marker key
- Closing popup reverts to position-only
- Loading URL with marker → flies to it and opens popup

### View (map options)
- A **collapsible `View` section** (open by default; ember caret in the header). Its options are
  **text-in-button toggle chips** — an icon + label that lights **gold when on** (a hidden checkbox
  is the state of record, so the existing handlers *and* the label-edit tool keep working unchanged):
  **Settlement names · Detail maps · Hide discovered · Highlight markers**.
- **Highlight markers** draws a tight **blue halo** (`--halo` `#6db3ff`, `--halo-bright` on hover)
  around every marker. Driven by a `highlight-markers` class on `<body>`, so it survives the map
  being recreated on a region switch and auto-covers markers rendered later.

### Map Markers (rendering)
- Per-category icons get a subtle **group-coloured glow** (`GROUP_COLORS` → `--glow` on the img)
  that brightens on hover; **hover tooltips** show the marker name.
- **Highlight markers** (a View toggle) overlays a blue halo (`--halo`) on every marker via a
  `body.highlight-markers` class; it layers over the group glow (hover still brightens).
- **Legend** overlay (🗝 button, bottom-left) lists every icon grouped + colour-titled.
- Category on/off uses **toggle switches** at both the **group** header and **per-category** level.
- Marker **clustering** (Leaflet.markercluster) was trialed and **removed** — the user prefers
  authentic individual markers (like the in-game map). Don't re-add without asking.

### Developer Tools (in Tools tab)
- **Only one tool panel open at a time** (`ensureSoleTool`; others flash if you try to open a second)
- **Calibrate Local Map**: select from dropdown → drag to move, scale % to resize → Export Config (JSON+JS)
- **Position Settlement Names**: Start → drag each name → auto-saves to localStorage → Export `settlement_labels.{js,json}`
- **Edit Markers** (dev-phase, for cleaning false POI data): Start → click a marker to rename/delete;
  live "unsaved changes" counter; **Save to data/** writes `markers_<region>.{js,json}` straight into
  `data/` via the File System Access API (Chrome/Edge + localhost, one-time folder grant), with a Download
  fallback. Persists to `kcd2_marker_edits` / `kcd2_marker_deletes`; Reset restores from base data.

---

## Data Pipeline (run in order)

```
stitch_maps.py    → stitch game tiles into map images (--background for missing tiles)
convert_dds_to_png.py → DDS→PNG conversion (handles split CryEngine format)
resize_icons.py   → resize icons to 32×32 with 2px transparent border
extract_pois.py   → extract POI markers from game XML (uncalibrated)
calibrate_markers.py → apply world→pixel coordinate transform
merge_gamerguides.py → fill gaps with community data
build_markers.py  → regenerate .js wrappers from .json
generate_tiles.py → slice map into Leaflet tile pyramid (WebP)
process_local_maps.py → reconstruct split DDS local maps, stitch grids
crop_banner.py    → (LEGACY) cropped banner textures — banners removed, labels are plain text
```

---

## Deployment
- GitHub Pages at https://quangdao215.github.io/kcd2_interactive_map/
- Git auth: Personal Access Token (GCM crashes with Avalonia exception)
- `git config --global --add safe.directory E:/kcd2_map` for ownership check
- Active icons committed selectively via active_icons.txt list

---

## Known Issues / Pending Work

### High Priority
- [ ] Kuttenberg calibration correction (same approach as Trosky 9-point correction — find ground-truth points, compute correction transform)
- [ ] Verify all 23 local map calibrations are accurate in-game
- [ ] Use the Edit Markers tool to clean false-info POI markers (the reason it was built)

### Medium Priority
- [ ] More detailed marker descriptions (chest contents, NPC inventories)

### Low Priority
- [ ] Keyboard shortcuts (`/` to focus search; Esc already closes the confirm dialog)
- [ ] PWA / service worker for offline support (would need to vendor Leaflet locally)

### Won't do
- Mobile / touch responsiveness — **out of scope**; this is a desktop-only project (owner's call).

### Done (was pending)
- [x] Sidebar UI pass: region switcher → sliding segmented control · View options → text-in-button
      toggle chips (open by default) · collapsible Game Completion card · UI icon pass across the
      chrome · ember collapse carets · "Highlight markers" blue-halo toggle
- [x] Adopted the editorial-artifacts design language (`docs/editorial_design_reference.md`): eyebrows,
      mono stat figure, sliding toggles; contrast audit (all text ≥ AA, danger red brightened to
      `#c95a54`); 8/12 spacing-rhythm pass
- [x] `loot_usable` now uses the money (Groschen) icon
- [x] Fullscreen (⛶) + Reset-view (⌂) map buttons
- [x] Cache-busting on data-file fetches (`DATA_VERSION` reuses the `?v=` from the data `<script>` tags)
- [x] Legend overlay · keyboard focus rings · themed confirm dialogs · OG/meta tags
- [x] Split monolith into index.html + style.css + app.js
- [x] Banner labels removed → plain text; clustering trialed → reverted
- [x] Town crests above settlement names; overall + per-region Game Completion bar
- [x] Edit Markers dev tool (rename/delete, **drag-to-reposition**, Save-to-data, Embed My Markers)
- [x] Local maps optimized PNG→WebP (468 MB → 60 MB) — deployable on GitHub Pages
- [x] Level-transition marker type (`fast_travel_level`); zoom-level indicator; remembered data/ folder
- [x] Marker-name cleanup pass (hunting spots, location suffixes, fast-travel points)
- [x] Maintainability pass: `app.js` → `js/` modules · cache-busting · pre-commit `.js` sync · ESLint · key tests

---

## Technical Notes

### CRS Transformation
```javascript
function makeMapCRS(maxZoom, mapHeight) {
  return L.CRS.Simple;
  // With transformation: (1, 0, -1, mapHeight) and scale: 2^(z - maxZoom)
}
```
- Marker coords: `L.marker([y, x])` where y is used as lat
- Pixel conversion: `pixel_x = lng = x`, `pixel_y = mapHeight - lat = mapHeight - y`

### localStorage Keys
- `kcd2_last_region` — last viewed region
- `kcd2_user_markers` — custom markers `{trosky: [...], kuttenberg: [...]}`
- `kcd2_discovered_markers` — discovered sets `{trosky: [...], kuttenberg: [...]}`
- `kcd2_active_categories` — enabled category toggles
- `kcd2_local_map_bounds` — calibrated local map bounds (temporary override)
- `kcd2_label_positions` — drag-calibrated settlement-name positions per region
- `kcd2_marker_edits` — Edit Markers tool: POI renames `{region: {"cat:x:y": {name}}}`
- `kcd2_marker_deletes` — Edit Markers tool: deleted POI keys `{region: ["cat:x:y"]}`
- `kcd2_collapsed_groups` — which category groups are collapsed
- `kcd2_active_tab` — last active sidebar tab (Markers / My Markers / Tools)
- `kcd2_map_hint_dismissed` — the right-click "add a marker" hint was dismissed

> Not persisted (intentional): the **Highlight markers** halo and the View / Game-Completion
> collapse states — they reset to default on each load.

### File Protocol Fallback
Data files have both `.json` (fetched via HTTP) and `.js` (loaded via `<script>` tag) versions. The JS wrappers set globals: `window.MARKER_DATA_TROSKY`, `window.MARKER_DATA_KUTTENBERG`, `SETTLEMENT_LABELS` (also on `window`), `window.LOCAL_MAPS_DATA`, `window.ICON_MAP`. Markers/local-maps try fetch first, fall back to the globals for `file://`; settlement labels load only via the `<script>` tag.

### Split DDS Reconstruction (CryEngine)
```
header.dds      → DDS header (808 bytes, includes extended data)
header.dds.1    → smallest mip (2KB)
header.dds.2    → next mip (8KB)
...
header.dds.6    → largest mip (2MB = 2048×2048 BC1)
```
Reconstruction: `header[:128 or 148] + largest_mip`, patch mipMapCount at offset 28 to 1.
Grid stitching: **row-major** (left-to-right, top-to-bottom). Column-major was tested and incorrect.