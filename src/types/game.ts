export type FormType = 'human' | 'werewolf';

export type WeaponType = 
  | 'werewolf_claws'
  | 'wolven_headbutt'
  | 'tail_sweep'
  | 'slashing_dash'
  | 'lightning_teeth'
  | 'silver_crossbow'
  | 'frost_orb'
  | 'earth_shatter'
  | 'lunar_beam'
  | 'silver_daggers'
  | 'blood_ring'
  | 'wolf_pack'
  | 'burning_steps'
  | 'silver_decapitator'
  | 'decoy'
  | 'lightning_rod'
  | 'searing_gloves';

export type PassiveType =
  | 'blood_stone'
  | 'moon_pendant'
  | 'silver_armor'
  | 'quickstep_boots'
  | 'chrono_hourglass'
  | 'wolf_fang'
  | 'philosopher_ring'
  | 'sunglasses'
  | 'bloodlust_amulet'
  | 'alarm_clock'
  | 'meditation_mat';

export interface WeaponDef {
  id: WeaponType;
  name: string;
  category: 'physical' | 'magical';
  description: string;
  icon: string;
  baseDamage: number;
  cooldownMs: number;
  range: number;
  projectiles: number;
  speed: number;
  color: string;
  maxLevel: number;
  formExclusive?: FormType;
}

export interface WeaponInstance {
  id: WeaponType;
  level: number;
  lastFired: number;
}

export interface PassiveDef {
  id: PassiveType;
  name: string;
  description: string;
  icon: string;
  maxLevel: number;
  statBoostPerLevel: {
    stat: string;
    value: number;
    unit: string;
  };
  formExclusive?: FormType;
}

export interface PassiveInstance {
  id: PassiveType;
  level: number;
}

export interface SynergyDef {
  id: string;
  name: string;
  description: string;
  requiredWeapons: [WeaponType, WeaponType];
  icon: string;
  color: string;
  effectType: 'shatter' | 'vampirism' | 'dagger_storm' | 'lunar_claw';
}

export interface EnemyDef {
  type: string;
  name: string;
  hp: number;
  speed: number;
  damage: number;
  xpValue: number;
  goldChance: number;
  color: string;
  radius: number;
  isRanged?: boolean;
  isBoss?: boolean;
  isElite?: boolean;
  shield?: number;
  isExploding?: boolean;
  isNetThrower?: boolean;
  isSpiky?: boolean;
}

export interface Enemy {
  id: number;
  type: string;
  name: string;
  x: number;
  y: number;
  hp: number;
  maxHp: number;
  speed: number;
  damage: number;
  radius: number;
  color: string;
  xpValue: number;
  goldChance: number;
  isRanged?: boolean;
  isBoss?: boolean;
  isElite?: boolean;
  isFrozen?: boolean;
  frozenTimer?: number;
  freezeAngle?: number;
  isIgnited?: boolean;
  igniteTimer?: number;
  isBurning?: boolean;
  burnTimerMs?: number;
  burnTickTimerMs?: number;
  burnDamagePerTick?: number;
  hitFlashTimer?: number;
  attackCooldownTimer?: number;
  isElectrified?: boolean;
  electrifiedTimer?: number;
  offscreenAccDt?: number;
  shield?: number;
  maxShield?: number;
  isExploding?: boolean;
  isNetThrower?: boolean;
  netCooldownTimer?: number;
  isSpiky?: boolean;
  spikesOut?: boolean;
  spikeCycleTimer?: number;
}

export interface NetGround {
  id: number;
  x: number;
  y: number;
  radius: number;
  lifeMs: number;
  maxLifeMs: number;
}

export interface FlyingNet {
  id: number;
  startX: number;
  startY: number;
  targetX: number;
  targetY: number;
  currentX: number;
  currentY: number;
  progress: number;
  durationMs: number;
  elapsedMs: number;
  rotation: number;
}

export interface Decoy {
  id: number;
  x: number;
  y: number;
  hp: number;
  maxHp: number;
  radius: number;
  level: number;
  createdAt: number;
  durationMs: number;
}

export interface Projectile {
  id: number;
  x: number;
  y: number;
  vx: number;
  vy: number;
  radius: number;
  damage: number;
  lifeMs: number;
  maxLifeMs: number;
  color: string;
  pierceCount: number;
  weaponType: WeaponType;
  isEnemy?: boolean;
  canShatter?: boolean;
  canIgnite?: boolean;
  extraEffect?: string;
  targetEnemyId?: number;
  startAngle?: number;
  endAngle?: number;
  innerRadius?: number;
  hand?: 'right' | 'left';
  hitEnemyIds?: number[];
}

export interface Particle {
  id?: number;
  x: number;
  y: number;
  vx: number;
  vy: number;
  radius: number;
  color: string;
  alpha: number;
  decay?: number;
  lifeMs?: number;
  maxLifeMs?: number;
}

export interface DamageNumber {
  id: number;
  x: number;
  y: number;
  text: string;
  color: string;
  alpha: number;
  scale: number;
  vy: number;
  isCrit?: boolean;
}

export interface Gem {
  id: number;
  x: number;
  y: number;
  value: number;
  type: 'xp' | 'gold' | 'lunar_shard' | 'ichor_crystal' | 'meat';
  radius: number;
  color: string;
  createdMinute?: number;
}

export interface MetaUpgradeDef {
  id: string;
  name: string;
  description: string;
  icon: string;
  maxLevel: number;
  costBase: number;
  costMultiplier: number;
  effectPerLevel: string;
  currency: 'lunar_shards' | 'ichor_crystals';
}

export interface PersistentData {
  gold?: number;
  lunarShards: number;
  ichorCrystals: number;
  metaUpgrades: Record<string, number>;
  highScoreTime: number;
  totalKills: number;
  totalGoldEarned: number;
  runsCompleted: number;
  unlockedAchievements: string[];
  settings: {
    soundEnabled: boolean;
    musicEnabled: boolean;
    hapticsEnabled: boolean;
    joystickOpacity: number;
  };
}

export interface StageDef {
  id: string;
  name: string;
  description: string;
  recommendedLevel: string;
  bgTileColor: string;
  borderColor: string;
  spawnRates: Record<string, number>;
  bossAtSeconds: number[];
}

export interface AchievementDef {
  id: string;
  title: string;
  description: string;
  rewardType: 'lunar_shards' | 'ichor_crystals';
  rewardAmount: number;
  icon: string;
  check: (data: PersistentData, gameStats?: GameStats) => boolean;
}

export interface GameStats {
  timeSurvivedSeconds: number;
  kills: number;
  goldEarned: number;
  lunarShardsEarned: number;
  ichorCrystalsEarned: number;
  damageDealt: number;
  transformationsCount: number;
  maxLevel: number;
  synergiesUnlocked: string[];
}

export interface Shrine {
  id: string;
  x: number;
  y: number;
  visited: boolean;
}

export interface ShrineUpgradeInfo {
  type: 'weapon' | 'passive' | 'bonus';
  id: string;
  name: string;
  icon: string;
  level: number;
  description: string;
}

export interface Shop {
  id: string;
  x: number;
  y: number;
  visited: boolean;
}

export interface ShopOption {
  optionType: 'new_item' | 'upgrade';
  itemType: 'weapon' | 'passive';
  id: string;
  name: string;
  icon: string;
  description: string;
  level: number;
  boostLevel?: number;
  currentLevel?: number;
  price: number;
}

export interface ShopInfo {
  shopId: string;
  options: ShopOption[];
}
