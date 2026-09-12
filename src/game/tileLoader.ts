// Asset loader for Kenney Hexagon terrain PNG tiles
const terrainModules = import.meta.glob('/assets/background-tiles/PNG/Tiles/Terrain/**/*.png', {
  eager: true,
  import: 'default',
}) as Record<string, string>;

export interface LoadedTileSets {
  dirt: HTMLImageElement[];
  grass: HTMLImageElement[];
  stone: HTMLImageElement[];
  sand: HTMLImageElement[];
  mars: HTMLImageElement[];
  all: HTMLImageElement[];
}

const tileSets: LoadedTileSets = {
  dirt: [],
  grass: [],
  stone: [],
  sand: [],
  mars: [],
  all: [],
};

let isInitialized = false;
const loadListeners: Array<() => void> = [];

export function addTerrainTilesLoadedListener(listener: () => void) {
  loadListeners.push(listener);
}

// List of tiles that are outline-only rings or side overlays (transparent centers)
// In Kenney Hexagon Pack: *_01.png, *_02.png, *_18.png, *_19.png are ring/border overlays.
const EXCLUDED_TILES = [
  'dirt_01.png', 'dirt_02.png', 'dirt_18.png', 'dirt_19.png',
  'grass_01.png', 'grass_02.png', 'grass_18.png', 'grass_19.png',
  'mars_01.png', 'mars_02.png', 'mars_18.png', 'mars_19.png',
  'sand_01.png', 'sand_02.png', 'sand_18.png', 'sand_19.png',
  'stone_01.png', 'stone_02.png', 'stone_18.png', 'stone_19.png',
];

export function loadTerrainTiles(): LoadedTileSets {
  if (isInitialized) {
    return tileSets;
  }
  isInitialized = true;

  for (const [path, url] of Object.entries(terrainModules)) {
    const filename = path.split('/').pop() || '';

    // Filter out outline-only / transparent-center overlay tiles
    if (
      EXCLUDED_TILES.some(excluded => filename === excluded || path.endsWith(excluded)) ||
      filename.endsWith('_01.png') ||
      filename.endsWith('_02.png') ||
      filename.endsWith('_18.png') ||
      filename.endsWith('_19.png')
    ) {
      continue;
    }

    const img = new Image();
    img.onload = () => {
      for (const listener of loadListeners) {
        listener();
      }
    };
    img.src = url;

    if (path.includes('/Dirt/')) {
      tileSets.dirt.push(img);
    } else if (path.includes('/Grass/')) {
      tileSets.grass.push(img);
    } else if (path.includes('/Stone/')) {
      tileSets.stone.push(img);
    } else if (path.includes('/Sand/')) {
      tileSets.sand.push(img);
    } else if (path.includes('/Mars/')) {
      tileSets.mars.push(img);
    }
    tileSets.all.push(img);
  }

  return tileSets;
}


