import { PersistentData } from '../types/game';

const STORAGE_KEY = 'werewolf_survivors_save_v1';

const DEFAULT_SAVE_DATA: PersistentData = {
  gold: 0,
  lunarShards: 50,
  ichorCrystals: 5,
  metaUpgrades: {
    health: 0,
    damage: 0,
    speed: 0,
    magnet: 0,
    greed: 0,
    wisdom: 0,
    cooldown: 0,
    revive: 0,
    rerolls: 0,
  },
  highScoreTime: 0,
  totalKills: 0,
  totalGoldEarned: 0,
  runsCompleted: 0,
  unlockedAchievements: [],
  settings: {
    soundEnabled: true,
    musicEnabled: true,
    hapticsEnabled: true,
    joystickOpacity: 0.8,
  },
};

export function loadSaveData(): PersistentData {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return DEFAULT_SAVE_DATA;
    const parsed = JSON.parse(raw);
    const loaded: PersistentData = {
      ...DEFAULT_SAVE_DATA,
      ...parsed,
      gold: 0,
      lunarShards: typeof parsed.lunarShards === 'number' ? parsed.lunarShards : 50,
      ichorCrystals: typeof parsed.ichorCrystals === 'number' ? parsed.ichorCrystals : 5,
      metaUpgrades: {
        ...DEFAULT_SAVE_DATA.metaUpgrades,
        ...(parsed.metaUpgrades || {}),
      },
      settings: {
        ...DEFAULT_SAVE_DATA.settings,
        ...(parsed.settings || {}),
      },
    };
    return loaded;
  } catch (e) {
    console.error('Failed to load save data:', e);
    return DEFAULT_SAVE_DATA;
  }
}

export function saveSaveData(data: PersistentData): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
  } catch (e) {
    console.error('Failed to save data:', e);
  }
}

export function resetSaveData(): PersistentData {
  localStorage.removeItem(STORAGE_KEY);
  return DEFAULT_SAVE_DATA;
}
