// ═══════════════════════════════════════════════
// ██ CONFIG
// ═══════════════════════════════════════════════

const CONFIG = {
  // Per-region map dimensions and settings
  regions: {
    trosky: {
      mapWidth: 6144,       // 3 cols × 2048
      mapHeight: 6144,      // 3 rows × 2048
      max_zoom: 5,          // tile pyramid max zoom (8192-canvas / 256)
      tilesUrl: 'tiles/trosky/{z}/{x}/{y}.webp',
      markers: 'data/markers_trosky.json',
    },
    kuttenberg: {
      mapWidth: 12288,      // 6 cols × 2048
      mapHeight: 10240,     // 5 rows × 2048
      max_zoom: 6,          // tile pyramid max zoom (16384-canvas / 256)
      tilesUrl: 'tiles/kuttenberg/{z}/{x}/{y}.webp',
      markers: 'data/markers_kuttenberg.json',
    },
  },

  // Single source of truth for every persisted key (localStorage + IndexedDB).
  storageKeys: {
    userMarkers: 'kcd2_user_markers',
    activeCategories: 'kcd2_active_categories',
    lastRegion: 'kcd2_last_region',
    discoveredMarkers: 'kcd2_discovered_markers',
    markerEdits: 'kcd2_marker_edits',
    markerDeletes: 'kcd2_marker_deletes',
    labelPositions: 'kcd2_label_positions',
    localMapBounds: 'kcd2_local_map_bounds',
    collapsedGroups: 'kcd2_collapsed_groups',
    activeTab: 'kcd2_active_tab',
    mapHintDismissed: 'kcd2_map_hint_dismissed',
    lang: 'kcd2_lang',
  },
  // IndexedDB store for the remembered data/ folder handle (File System Access API).
  dirHandleStore: { db: 'kcd2-fs', store: 'handles', key: 'dataDir' },
};

// Escape user-controlled text before inserting into innerHTML / Leaflet tooltips.
// Custom marker names/descriptions are user-entered and can be embedded into the
// shared DB, so they must never be treated as markup.
function escapeHtml(s) {
  return String(s == null ? '' : s).replace(/[&<>"']/g, (c) =>
    ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}


// ═══════════════════════════════════════════════
// ██ STATE
// ═══════════════════════════════════════════════

let map = null;
let currentRegion = 'trosky';
let imageOverlay = null;
let categories = [];
let activeCategories = new Set();
let markerLayers = {};       // category_id -> L.layerGroup
let markersByKey = {};       // markerKey -> L.marker (for opacity control)
let categoriesById = {};     // category_id -> category obj (O(1) lookup; built per region in loadRegion)
let markersByCategory = {};  // category_id -> [markerData] for the current region (lazy-build source)
let builtCategories = new Set(); // categories whose L.markers have been constructed (lazy build)
let currentRegionBounds = null;  // L.latLngBounds of the active region (for Reset view)
let userMarkerLayer = null;
let settlementLabelLayer = null;  // text labels for settlement names
let labelEditing = false;         // when true, settlement names are drag-to-position
let localMapOverlays = [];       // local detail map overlays
let showLocalMaps = true;
let localMapsConfig = {};        // loaded from data/local_maps.json
let allMarkerData = {};      // region -> { categories, markers }
let userMarkers = {};        // region -> [{ id, name, description, category, x, y }]
let tempMarker = null;
let nextUserMarkerId = 1;
let collapsedGroups = {};    // group_name -> bool (collapsed state)
let discoveredMarkers = {};  // region -> Set of marker keys

// Categories that use "Collected" label (items); everything else uses "Discovered"
const ITEM_CATEGORIES = new Set([
  "loot_sword", "loot_polearm", "loot_heavy_weapon", "loot_bow", "loot_ammo",
  "loot_shield", "loot_dagger", "loot_armour_body", "loot_armour_head",
  "loot_armour_legs", "loot_armour_arms", "loot_armour_jewellery",
  "loot_armour_belt", "loot_armour_pouch", "loot_potion", "loot_poison",
  "loot_skill_book", "loot_recipe", "loot_lore_book", "loot_map", "loot_letter",
  "loot_food", "loot_herb", "loot_blacksmithing", "loot_alchemy_mat",
  "loot_usable", "loot_misc", "loot_utility", "loot_dice", "loot_badge",
  "loot_tack", "loot_saddle", "loot_horseshoe", "loot_bridle",
]);

// Categories that count toward progress stats (collectible/discoverable only).
// NPCs, facilities, and persistent map fixtures are excluded.
const PROGRESS_CATEGORIES = new Set([
  // All loot items EXCEPT herbs — herbs are ambient world gathering, found
  // all over the map, so they don't count toward Game Completion.
  ...[...ITEM_CATEGORIES].filter(c => c !== "loot_herb"),
  // Quests
  "quest_main", "quest_side", "quest_task",
  // Discoverable landmarks
  "shrine", "conc_cross", "grave", "interesting_site",
  // One-time lootable
  "nest", "cart_stash", "lootable_corpse",
]);

// ── Category Groups (sidebar organization) ──
const CATEGORY_GROUPS = [
  { name: "Armour", collapsed: true, categories: [
    "loot_armour_arms", "loot_armour_belt", "loot_armour_body",
    "loot_armour_head", "loot_armour_jewellery", "loot_armour_legs",
    "loot_armour_pouch"
  ]},
  { name: "Books", collapsed: true, categories: [
    "loot_letter", "loot_lore_book", "loot_map", "loot_recipe", "loot_skill_book"
  ]},
  { name: "Food", collapsed: true, categories: ["loot_food"] },
  { name: "Materials", collapsed: true, categories: [
    "loot_alchemy_mat", "loot_blacksmithing", "loot_herb"
  ]},
  { name: "NPCs", collapsed: true, categories: [
    "apothecary", "armourer", "baker", "barber", "baths", "blacksmith",
    "butchery", "cobbler", "fisherman", "grocer", "gunsmith", "herbalist",
    "horse_trader", "hotel", "huntsman", "miller", "saddler", "scribe", "shield_painter",
    "skill_trainer", "smithy", "tailor", "tanner", "tavern", "trader", "weaponsmith"
  ]},
  { name: "Poisons", collapsed: true, categories: ["loot_poison"] },
  { name: "Potions", collapsed: true, categories: ["loot_potion"] },
  { name: "Quests", collapsed: true, categories: [
    "quest_main", "quest_side", "quest_task",
    "quest_dlc0", "quest_dlc1", "quest_dlc2", "quest_dlc3"
  ]},
  { name: "Tack", collapsed: true, categories: [
    "loot_bridle", "loot_horseshoe", "loot_saddle", "loot_tack"
  ]},
  { name: "Weapons", collapsed: true, categories: [
    "loot_ammo", "loot_bow", "loot_dagger", "loot_heavy_weapon",
    "loot_polearm", "loot_shield", "loot_sword"
  ]},
  { name: "Points of Interest", collapsed: true, categories: [
    "alchemy_bench", "archery_range", "bandit_camp", "beehive",
    "camp", "cart_stash", "combat_arena", "conc_cross", "dice_table",
    "dog", "drying_rack", "fast_travel", "fast_travel_level", "fist_fight_arena", "grave", "home",
    "hunting_spot", "hunting_boar", "hunting_deer", "hunting_wolf",
    "indulgence_box", "interesting_site", "lodgings", "loot_badge",
    "loot_dice", "loot_misc", "loot_usable", "loot_utility",
    "lootable_corpse", "nest", "player_bed", "selling_chest",
    "sharpening_wheel", "shrine", "smokehouse", "underground", "washing",
    "woodland_garden"
  ]},
];

// Categories enabled on a visitor's very first load (before they have a saved
// filter set). Picks a useful, non-flooding starter view of where-to-go +
// quests. NOTE: must be REAL category ids (the old 'city' default was a no-op).
const DEFAULT_ACTIVE_CATEGORIES = [
  "fast_travel", "interesting_site", "quest_main", "quest_side",
];

// Per-group accent colours — used to tint marker glows and the legend group
// titles, so categories are distinguishable at a glance.
const GROUP_COLORS = {
  "Armour": "#9aa7b5",            // steel
  "Books": "#c9954c",            // parchment
  "Food": "#8fae5a",            // green
  "Materials": "#b5764c",        // copper
  "NPCs": "#c9a84c",            // gold
  "Poisons": "#6fae7a",          // venom green
  "Potions": "#a06ab5",          // violet
  "Quests": "#e0c24c",          // bright gold
  "Tack": "#a98c6a",            // leather
  "Weapons": "#c25a5a",          // blood red
  "Points of Interest": "#5a9ec9", // blue
};
const DEFAULT_GROUP_COLOR = "#c9a84c";
const _catGroupColorCache = {};
function categoryGroupColor(catId) {
  if (catId in _catGroupColorCache) return _catGroupColorCache[catId];
  const group = CATEGORY_GROUPS.find(g => g.categories.includes(catId));
  const color = group ? (GROUP_COLORS[group.name] || DEFAULT_GROUP_COLOR) : DEFAULT_GROUP_COLOR;
  _catGroupColorCache[catId] = color;
  return color;
}


