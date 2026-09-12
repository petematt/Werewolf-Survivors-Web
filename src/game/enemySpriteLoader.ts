import tile0108 from '/assets/kenney_tiny-dungeon/Tiles/tile_0108.png';
import tile0109 from '/assets/kenney_tiny-dungeon/Tiles/tile_0109.png';
import tile0110 from '/assets/kenney_tiny-dungeon/Tiles/tile_0110.png';
import tile0111 from '/assets/kenney_tiny-dungeon/Tiles/tile_0111.png';
import tile0120 from '/assets/kenney_tiny-dungeon/Tiles/tile_0120.png';
import tile0121 from '/assets/kenney_tiny-dungeon/Tiles/tile_0121.png';
import tile0122 from '/assets/kenney_tiny-dungeon/Tiles/tile_0122.png';
import tile0123 from '/assets/kenney_tiny-dungeon/Tiles/tile_0123.png';
import tile0124 from '/assets/kenney_tiny-dungeon/Tiles/tile_0124.png';

// Tile mappings using PNGs in specified ranges:
// tile_0108 to tile_0111 and tile_0120 to tile_0124
export const ENEMY_TILE_MAP: Record<string, string> = {
  peasant: tile0108,
  torch_hunter: tile0109,
  silver_knight: tile0110,
  boss_inquisitor: tile0111,
  dire_hound: tile0120,
  holy_cleric: tile0121,
  vampire_thrall: tile0122,
  boss_alpha_wolf: tile0123,
  default: tile0124,
};

const loadedImages: Record<string, HTMLImageElement> = {};

export function getEnemySprite(enemyType: string): HTMLImageElement {
  const url = ENEMY_TILE_MAP[enemyType] || ENEMY_TILE_MAP['default'] || tile0108;
  if (!loadedImages[url]) {
    const img = new Image();
    img.src = url;
    loadedImages[url] = img;
  }
  return loadedImages[url];
}
