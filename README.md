# KCD2 Interactive Map

An interactive web map for **Kingdom Come: Deliverance II** in czech, covering both the Trosky and Kuttenberg regions. Built with [Leaflet.js](https://leafletjs.com/).

** It`s not still done.

---

## Features

- **Two full regions** — Trosky and Kuttenberg, with calibrated coordinates extracted directly from the game files
- **Hundreds of marker categories** — POIs, merchants, quests, loot, herbs, nests, hunting spots, and more
- **Settlement labels** — All named villages, castles, and camps
- **Progress tracking** — Mark locations as discovered or items as collected; state persists in your browser
- **Custom markers** — Right-click anywhere to add your own waypoints
- **Highlight markers** — Toggle a blue halo on every marker to make them pop against the map
- **Import / export** — Backup your progress and custom markers as JSON
- **Search and filter** — Find markers by name; toggle entire category groups on or off
- **Shareable URLs** — The URL hash updates as you pan and zoom, so you can link directly to a specific spot
- **Tile-based rendering** — Maps load fast and stay smooth even at full zoom

---

## Run Locally

The site is fully static — no build step or server required. But because browsers block `file://` requests, you'll need to serve it through a local HTTP server.

```bash
git clone https://github.com/QuangDao215/kcd2_interactive_map.git
cd kcd2_interactive_map
python -m http.server 8000
```

Then open [http://localhost:8000](http://localhost:8000) in your browser.

Any other static server works too (Node's `http-server`, VS Code Live Server, etc.).

---

## Project Structure

```
kcd2_interactive_map/
├── index.html               # Page shell + markup
├── style.css                # All styles
├── js/                      # App logic (ordered classic scripts, shared global scope)
├── data/                    # Marker JSON, category icons, settlement labels
├── icons/                   # Extracted in-game icons (32×32 PNG)
├── tiles/                   # Tile pyramids for both regions (WebP)
│   ├── trosky/
│   └── kuttenberg/
├── tools/                   # Development scripts (data extraction, tile generation)
├── docs/                    # Design reference + verified name tables
└── README.md
```

---

## Credits

- **Game, art, map data, and all in-game assets** © [Warhorse Studios](https://warhorsestudios.cz/). This is an unofficial fan project — not affiliated with or endorsed by Warhorse.
- **Community marker data** sourced from [gamerguides.com](https://www.gamerguides.com/kingdom-come-deliverance-ii/maps/trosky-region-map) and verified against the [KCD2 Wiki](https://kingdomcomedeliverance2.wiki.fextralife.com/).
- **Map tiles and icons** extracted from the game files for fan reference. All rights belong to Warhorse.
- **Built with** [Leaflet.js](https://leafletjs.com/).

---