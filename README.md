# KCD2 Interactive Map

An interactive web map for **Kingdom Come: Deliverance II**, with two languages (**Czech / English**), covering both the Trosky and Kuttenberg regions, with your own progress tracking. Built with [Leaflet.js](https://leafletjs.com/).

This is a fork of [Kingdom Come: Deliverance II Map](https://quangdao215.github.io/kcd2_interactive_map/) by [QuangDao215](https://github.com/QuangDao215/kcd2_interactive_map), extended with a full Czech localisation, settlement detail maps, a game-completion tracker and in-browser data editing tools.

---

## Features

### Map

- **Two full regions** — Trosky (6144×6144 px, zoom 0–5) and Kuttenberg (12288×10240 px, zoom 0–6), with calibrated coordinates extracted directly from the game files
- **3,584 markers / 161 categories** — 1,596 markers in 81 categories (Trosky) and 1,988 markers in 80 categories (Kuttenberg): POIs, merchants, quests, loot, herbs, nests, hunting spots and more
- **WebP tile pyramids** — 3,464 tiles plus a low-resolution `bg.webp` underlay per region, so the map appears instantly and stays smooth at full zoom
- **Settlement labels** — 8 (Trosky) and 15 (Kuttenberg) named villages, castles and camps, drawn in the active language
- **23 settlement detail maps** — in-game interior/local maps overlaid on the world map at their real positions, with adjustable opacity
- **Icon legend** — a panel grouping every category by type (Armour, Books, Food, NPCs, Quests, Weapons, Points of Interest, …)
- **Region switcher** — segmented control to flip between Trosky and Kuttenberg
- **Map utilities** — reset view, fullscreen, live zoom level and map-coordinate readout, copy-link-to-this-view

---

## Run Locally

The site is fully static — no build step, no bundler, no `npm install` required. But because browsers block `file://` requests, you'll need to serve it through a local HTTP server.

```bash
git clone https://github.com/kcd2map-cz/kcd2map-cz.github.io.git
cd kcd2map-cz.github.io
python -m http.server 8000
```

Then open [http://localhost:8000](http://localhost:8000) in your browser.

Any other static server works too (Node's `http-server`, VS Code Live Server, etc.). Use `localhost` rather than `file://` if you want the *Save to data/* tool to work.

---

## Project Structure

```
kcd2map-cz.github.io
├── index.html               # Page shell: sidebar rail, panels, modals, script tags
├── style.css                # All styles
├── js/                      # App logic (ordered classic scripts, shared global scope)
│   ├── config.js            # CONFIG (regions, storage keys), tr()/tf()/plPhrase(), state
│   ├── map.js               # Leaflet init + custom CRS for tile layers
│   ├── markers.js           # Marker icons, rendering, discovery state
│   ├── sidebar.js           # Category list and per-category totals
│   ├── user-markers.js      # Right-click custom waypoints
│   ├── import-export.js     # JSON backup / restore
│   ├── local-maps.js        # Detail-map overlays + calibration tool
│   ├── labels.js            # Settlement labels (CS/EN)
│   ├── storage.js           # localStorage quota-safe helpers
│   └── main.js              # UI helpers, language switcher, bootstrap
├── data/                    # Marker JSON + JS wrappers, icon map, labels, CZ strings
│   ├── markers_trosky.{json,js}       # 1,596 markers / 81 categories
│   ├── markers_kuttenberg.{json,js}   # 1,988 markers / 80 categories
│   ├── icon_map.js                    # category id → icons/*_icon.png
│   ├── settlement_labels.{js,json}    # label x/y/name per region
│   ├── local_maps.{js,json}           # detail-map overlay bounds
│   ├── ui_strings_cs.js               # Czech UI strings (keyed by English source)
│   ├── marker_names_cs.js             # generated — do not edit by hand
│   ├── settlement_names_cs.js         # Czech settlement label text
│   └── quest_names_cs.js              # Czech main-story quest names
├── icons/                   # Extracted in-game icons (32×32 PNG) + brand/ and items/
├── banners/                 # Settlement crest ribbons (24 PNG)
├── tiles/                   # WebP tile pyramids + bg.webp per region
│   ├── trosky/              # z0–z5
│   └── kuttenberg/          # z0–z6
├── maps/                    # Stitched region map.png sources + local/*.webp (23)
├── tools/                   # Python dev scripts (data extraction, tile generation, …)
│   └── hooks/pre-commit     # Optional git hook
├── tests/                   # Framework-free Node test (keys.test.js)
├── docs/                    # Design reference + verified name tables
├── .github/workflows/ci.yml # validate_data → eslint → node tests
├── eslint.config.mjs
├── apply_trosky_correction.py   # 9-point affine correction for Trosky markers
├── convert_dds_to_png.py        # DDS (incl. split CryEngine) → PNG
├── crop_banner.py               # Crop transparent padding off banner textures
├── process_local_maps.py        # Reassemble split-mipmap DDS detail maps
├── main_icon.png / kcd1_icon.png
└── README.md
```

---

## Documentation

- `docs/editorial_design_reference.md` — the design system the UI follows (themes, tokens, component rules, critic gates)
- `docs/kcd2_dlc_quests.md` — verified quest-name reference for all four DLCs
- `docs/kcd2_taverns_lodgings.md` — verified tavern / inn / lodging table (Czech game-file names → in-game English)
- `quests-cz.txt`, `quests-en.txt` — main-story quest lists per region
- `local_maps.txt`, `active_icons.txt` — plain-text mirrors of the detail-map bounds and the committed icon allow-list

---

## Credits

- **Game, art, map data, and all in-game assets** © [Warhorse Studios](https://warhorsestudios.cz/). This is an unofficial fan project — not affiliated with or endorsed by Warhorse.
- **Community marker data** sourced from [gamerguides.com](https://www.gamerguides.com/kingdom-come-deliverance-ii/maps/trosky-region-map) and verified against the [KCD2 Wiki](https://kingdomcomedeliverance2.wiki.fextralife.com/).
- **Map tiles, icons and detail maps** extracted from the game files for fan reference. All rights belong to Warhorse.
- **Original map** by [QuangDao215](https://github.com/QuangDao215/kcd2_interactive_map).
- **Built with** [Leaflet.js](https://leafletjs.com/).

---