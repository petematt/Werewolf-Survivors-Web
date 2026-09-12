import {
  FormType,
  WeaponType,
  PassiveType,
  WeaponInstance,
  PassiveInstance,
  Enemy,
  Projectile,
  Particle,
  DamageNumber,
  Gem,
  PersistentData,
  StageDef,
  GameStats,
  Decoy,
  Shrine,
  ShrineUpgradeInfo,
  Shop,
  ShopOption,
  ShopInfo,
  NetGround,
  FlyingNet,
} from '../types/game';

import { WEAPONS, PASSIVES, SYNERGIES, ENEMIES, STAGES } from './constants';
import { sound } from '../utils/audio';
import {
  vibrateHit,
  vibrateCrit,
  vibratePlayerDamage,
  vibrateTransformation,
  vibrateBossSpawn,
  vibrateLevelUp,
} from '../utils/haptics';
import { loadTerrainTiles, addTerrainTilesLoadedListener, LoadedTileSets } from './tileLoader';
import { getEnemySprite } from './enemySpriteLoader';

export interface GameEngineCallbacks {
  onLevelUp: (choices: Array<{ type: 'weapon' | 'passive'; id: string; level: number }>) => void;
  onGameOver: (stats: GameStats) => void;
  onStatsUpdate: (stats: GameStats, currentHp: number, maxHp: number, xp: number, xpNext: number, level: number, phase: FormType, phaseTimer: number) => void;
  onShrineVisited?: (info: ShrineUpgradeInfo) => void;
  onShopVisited?: (shopInfo: ShopInfo) => void;
}

export function isWithinDistance(
  x1: number,
  y1: number,
  x2: number,
  y2: number,
  maxDist: number
): boolean {
  const dx = x1 - x2;
  const dy = y1 - y2;
  return dx * dx + dy * dy <= maxDist * maxDist;
}

export function isOutsideDistance(
  x1: number,
  y1: number,
  x2: number,
  y2: number,
  maxDist: number
): boolean {
  const dx = x1 - x2;
  const dy = y1 - y2;
  return dx * dx + dy * dy > maxDist * maxDist;
}

export class GameEngine {
  private static readonly OFFSCREEN_THROTTLE_DIST = 1100;
  private canvas: HTMLCanvasElement;
  private ctx: CanvasRenderingContext2D;
  private persistentData: PersistentData;
  private stage: StageDef;
  private callbacks: GameEngineCallbacks;

  private isRunning: boolean = false;
  private isPaused: boolean = false;
  private animFrameId: number | null = null;
  private lastTime: number = 0;

  // Player State
  public player = {
    x: 0,
    y: 0,
    radius: 18,
    vx: 0,
    vy: 0,
    baseSpeed: 3.5,
    maxHp: 100,
    hp: 100,
    level: 1,
    xp: 0,
    xpToNextLevel: 50,
    form: 'human' as FormType,
    facingAngle: 0,
    invincibleTimer: 0,
    revivesLeft: 0,
  };

  // Upgrades & Inventory
  public activeWeapons: WeaponInstance[] = [];
  public activePassives: PassiveInstance[] = [];
  public activeSynergies: string[] = [];

  // Day/Night Cycle (25s Day, 25s Night)
  private cycleDuration = 25;
  public phaseTimer = 25;
  public currentForm: FormType = 'human';

  // Darkness Scrim & Phase Transition Controls
  private currentDarkness = 0.0; // 0.0 (Day) to 1.0 (Night)
  private targetDarkness = 0.0;
  private humanShieldTimer = 0.0; // Duration remaining on human form shield
  private transitionState = {
    active: false,
    type: null as 'to_night' | 'to_day' | null,
    timer: 0,
    duration: 3.0,
    progress: 0,
  };

  // Werewolf weapons and passives state
  private lightningVisuals: Array<{
    points: Array<{ x: number; y: number }>;
    lifeMs: number;
    maxLifeMs: number;
  }> = [];
  private recentKills: number[] = [];
  private slashingDashState?: {
    active: boolean;
    level: number;
    originX: number;
    originY: number;
    targetX: number;
    targetY: number;
    phase: 'dash_to' | 'slash1' | 'dash_back' | 'slash2';
    timerMs: number;
    hasSecondSlash: boolean;
    slashDamage: number;
  };
  private enemies: Enemy[] = [];
  private decoys: Decoy[] = [];
  private decoyIdCounter = 0;
  private meditationTimerMs = 0;
  private lastPlayerX = 0;
  private lastPlayerY = 0;
  private projectiles: Projectile[] = [];
  private particles: Particle[] = [];
  private particlePool: Particle[] = [];
  private damageNumbers: DamageNumber[] = [];
  private damageNumberPool: DamageNumber[] = [];
  private gems: Gem[] = [];
  private enemyGrid: Map<number, Enemy[]> = new Map();
  private terrainChunkCache: Map<string, HTMLCanvasElement> = new Map();
  private isLoading = true;
  private loadingProgress = 0;
  private lastMinuteChecked = 0;
  private firePatches: Array<{
    id: number;
    x: number;
    y: number;
    radius: number;
    damage: number;
    lifeMs: number;
    maxLifeMs: number;
  }> = [];
  private ghostWolves: Array<{
    id: number;
    x: number;
    y: number;
    vx: number;
    vy: number;
    angle: number;
    state: 'orbit' | 'queued' | 'charging' | 'lingering';
    chargeTimerMs: number;
    triggerDelayMs?: number;
    lingerTimerMs?: number;
    targetEnemyX?: number;
    targetEnemyY?: number;
    hasHit?: boolean;
  }> = [];

  // Hexagon background parameters (Kenney Hexagon Pack scaled to 200%)
  private readonly hexRadius = 140;
  private readonly hexExtrusion = 12;
  private readonly hexWidth = 240;
  private readonly hexHeight = 280;
  private readonly colSpacing = 240;
  private readonly rowSpacing = 210;

  private readonly hexVertices = [
    { x: 0, y: -140 },
    { x: 120, y: -70 },
    { x: 120, y: 70 },
    { x: 0, y: 140 },
    { x: -120, y: 70 },
    { x: -120, y: -70 },
  ];

  // Joystick & Input
  public joystick = {
    active: false,
    startX: 0,
    startY: 0,
    currX: 0,
    currY: 0,
    vectorX: 0,
    vectorY: 0,
  };

  private keys: Record<string, boolean> = {};

  // Spawning & Stats
  private enemyIdCounter = 0;
  private projectileIdCounter = 0;
  private gemIdCounter = 0;
  private spawnTimer = 0;
  private eliteSpawnTimer = 0;

  public stats: GameStats = {
    timeSurvivedSeconds: 0,
    kills: 0,
    goldEarned: 0,
    lunarShardsEarned: 0,
    ichorCrystalsEarned: 0,
    damageDealt: 0,
    transformationsCount: 0,
    maxLevel: 1,
    synergiesUnlocked: [],
  };

  private secondTimer = 0;
  private terrainTiles: LoadedTileSets;

  // Wolven Headbutt State
  private playerMovementDurationMs = 0;
  private headbuttGraceMs = 0;
  private headbuttHitCooldowns: Map<number, number> = new Map();

  // Enemy Special Hazards State
  private nets: NetGround[] = [];
  private flyingNets: FlyingNet[] = [];
  private playerSpikeRecoilCooldown = 0;
  private healAccumulator = 0;

  // Shrines State
  private towerImg: HTMLImageElement;
  private towerRuinImg: HTMLImageElement;
  private shrines: Shrine[] = [];
  private generatedShrineSectors: Set<string> = new Set();

  // Shops State
  private shopImg: HTMLImageElement;
  private shops: Shop[] = [];
  private generatedShopSectors: Set<string> = new Set();

  constructor(
    canvas: HTMLCanvasElement,
    persistentData: PersistentData,
    stageId: string,
    callbacks: GameEngineCallbacks
  ) {
    this.canvas = canvas;
    const ctx = canvas.getContext('2d');
    if (!ctx) throw new Error('Could not get 2D canvas context');
    this.ctx = ctx;
    this.persistentData = persistentData;
    this.stage = STAGES.find((s) => s.id === stageId) || STAGES[0];
    this.callbacks = callbacks;
    this.terrainTiles = loadTerrainTiles();
    addTerrainTilesLoadedListener(() => {
      this.terrainChunkCache.clear();
    });

    // Load Shrine Images
    this.towerImg = new Image();
    this.towerImg.src = '/assets/background-tiles/PNG/Objects/tower.png';
    this.towerRuinImg = new Image();
    this.towerRuinImg.src = '/assets/background-tiles/PNG/Objects/towerRuin.png';

    // Load Shop Image
    this.shopImg = new Image();
    this.shopImg.src = '/assets/background-tiles/PNG/Objects/shop.png';

    this.initPlayerAndUpgrades();
    this.setupInputs();
  }

  private initPools() {
    this.particlePool = [];
    for (let i = 0; i < 600; i++) {
      this.particlePool.push({
        x: 0,
        y: 0,
        vx: 0,
        vy: 0,
        radius: 0,
        color: '#ffffff',
        alpha: 0,
        decay: 0.05,
      });
    }

    this.damageNumberPool = [];
    for (let i = 0; i < 200; i++) {
      this.damageNumberPool.push({
        id: 0,
        x: 0,
        y: 0,
        text: '',
        color: '#ffffff',
        alpha: 0,
        scale: 1,
        vy: 0,
      });
    }
  }

  private spawnParticle(x: number, y: number, vx: number, vy: number, radius: number, color: string, decay = 0.04) {
    if (this.particles.length >= 120) return;
    let p: Particle;
    if (this.particlePool.length > 0) {
      p = this.particlePool.pop()!;
      p.x = x;
      p.y = y;
      p.vx = vx;
      p.vy = vy;
      p.radius = radius;
      p.color = color;
      p.alpha = 1.0;
      p.decay = decay;
    } else {
      p = { x, y, vx, vy, radius, color, alpha: 1.0, decay };
    }
    this.particles.push(p);
  }

  private initPlayerAndUpgrades() {
    const meta = this.persistentData.metaUpgrades;

    // Reset Shrines, Shops & Optimizations & Pools
    this.shrines = [];
    this.generatedShrineSectors.clear();
    this.shops = [];
    this.generatedShopSectors.clear();
    this.enemyGrid.clear();
    this.terrainChunkCache.clear();
    this.lastMinuteChecked = 0;
    this.isLoading = true;
    this.loadingProgress = 0;
    this.initPools();

    // Apply Persistent Meta Upgrades
    const bonusHp = (meta.health || 0) * 20;
    this.player.maxHp = 100 + bonusHp;
    this.player.hp = this.player.maxHp;
    this.player.revivesLeft = meta.revive || 0;

    // Default Starting Weapons (Human starts with Silver Decapitator, Werewolf starts with Wolven Headbutt)
    this.activeWeapons = [
      { id: 'silver_decapitator', level: 1, lastFired: 0 },
      { id: 'wolven_headbutt', level: 1, lastFired: 0 },
    ];
    this.playerMovementDurationMs = 0;
    this.headbuttGraceMs = 0;
    this.headbuttHitCooldowns.clear();
    this.nets = [];
    this.flyingNets = [];
    this.healAccumulator = 0;
    this.playerSpikeRecoilCooldown = 0;
    this.decoys = [];
    this.meditationTimerMs = 0;
    this.lastPlayerX = this.player.x;
    this.lastPlayerY = this.player.y;

    // Set initial position at center
    this.player.x = this.canvas.width / 2;
    this.player.y = this.canvas.height / 2;

    // Reset Day/Night & Phase Transition States
    this.lightningVisuals = [];
    this.recentKills = [];
    this.slashingDashState = undefined;
    this.currentForm = 'human';
    this.player.form = 'human';
    this.phaseTimer = this.getDayDuration();
    this.currentDarkness = 0.0;
    this.targetDarkness = 0.0;
    this.humanShieldTimer = 0.0;
    this.transitionState = {
      active: false,
      type: null,
      timer: 0,
      duration: 3.0,
      progress: 0,
    };
  }

  public getPassiveLevel(id: PassiveType): number {
    const pInst = this.activePassives.find((p) => p.id === id);
    if (!pInst) return 0;
    const def = PASSIVES[id];
    if (def && def.formExclusive && def.formExclusive !== this.player.form) {
      return 0;
    }
    return pInst.level;
  }

  private getPlayerDamageMultiplier(): number {
    let mult = 1.0;
    const bloodlustLvl = this.getPassiveLevel('bloodlust_amulet');
    if (bloodlustLvl > 0) {
      const now = Date.now();
      this.recentKills = this.recentKills.filter((t) => now - t <= 5000);
      mult += this.recentKills.length * (0.05 * bloodlustLvl);
    }
    return mult;
  }

  private getNightDuration(): number {
    const sunglassesInst = this.activePassives.find((p) => p.id === 'sunglasses');
    const sunglassLvl = sunglassesInst ? sunglassesInst.level : 0;
    const alarmInst = this.activePassives.find((p) => p.id === 'alarm_clock');
    const alarmLvl = alarmInst ? alarmInst.level : 0;

    let dur = 25 + sunglassLvl * 5;
    if (alarmLvl > 0) {
      dur = dur * Math.max(0.1, 1 - 0.20 * alarmLvl);
    }
    return Math.max(5, dur);
  }

  private getDayDuration(): number {
    const sunglassesInst = this.activePassives.find((p) => p.id === 'sunglasses');
    const sunglassLvl = sunglassesInst ? sunglassesInst.level : 0;
    const alarmInst = this.activePassives.find((p) => p.id === 'alarm_clock');
    const alarmLvl = alarmInst ? alarmInst.level : 0;

    let dur = Math.max(5, 25 - sunglassLvl * 5);
    if (alarmLvl > 0) {
      dur = dur * (1 + 0.20 * alarmLvl);
    }
    return dur;
  }

  private setupInputs() {
    // Keyboard fallbacks
    const onKeyDown = (e: KeyboardEvent) => {
      this.keys[e.key.toLowerCase()] = true;
    };
    const onKeyUp = (e: KeyboardEvent) => {
      this.keys[e.key.toLowerCase()] = false;
    };

    window.addEventListener('keydown', onKeyDown);
    window.addEventListener('keyup', onKeyUp);

    // Touch / Pointer controls for Virtual Joystick
    const onPointerDown = (e: PointerEvent) => {
      // Don't intercept UI buttons if event target is button
      if ((e.target as HTMLElement)?.tagName === 'BUTTON') return;

      this.joystick.active = true;
      this.joystick.startX = e.clientX;
      this.joystick.startY = e.clientY;
      this.joystick.currX = e.clientX;
      this.joystick.currY = e.clientY;
      this.updateJoystickVector();
    };

    const onPointerMove = (e: PointerEvent) => {
      if (!this.joystick.active) return;
      this.joystick.currX = e.clientX;
      this.joystick.currY = e.clientY;
      this.updateJoystickVector();
    };

    const onPointerUp = () => {
      this.joystick.active = false;
      this.joystick.vectorX = 0;
      this.joystick.vectorY = 0;
    };

    this.canvas.addEventListener('pointerdown', onPointerDown);
    window.addEventListener('pointermove', onPointerMove);
    window.addEventListener('pointerup', onPointerUp);
    window.addEventListener('pointercancel', onPointerUp);
  }

  private updateJoystickVector() {
    const dx = this.joystick.currX - this.joystick.startX;
    const dy = this.joystick.currY - this.joystick.startY;
    const dist = Math.hypot(dx, dy);
    const maxRadius = 60;

    if (dist === 0) {
      this.joystick.vectorX = 0;
      this.joystick.vectorY = 0;
      return;
    }

    const clampedDist = Math.min(dist, maxRadius);
    this.joystick.vectorX = (dx / dist) * (clampedDist / maxRadius);
    this.joystick.vectorY = (dy / dist) * (clampedDist / maxRadius);
  }

  public start() {
    this.isRunning = true;
    this.isPaused = false;
    this.lastTime = performance.now();
    this.gameLoop();
  }

  public pause() {
    this.isPaused = true;
  }

  public resume() {
    if (this.isPaused) {
      this.isPaused = false;
      this.lastTime = performance.now();
      if (this.playerMovementDurationMs > 0) {
        this.headbuttGraceMs = 500; // 0.5s leeway upon exiting modal/unpausing
      }
      this.gameLoop();
    }
  }

  public stop() {
    this.isRunning = false;
    if (this.animFrameId) {
      cancelAnimationFrame(this.animFrameId);
    }
  }

  private gameLoop = () => {
    if (!this.isRunning) return;

    const now = performance.now();
    const dt = Math.min((now - this.lastTime) / 1000, 0.1);
    this.lastTime = now;

    if (!this.isPaused) {
      this.update(dt);
      this.render();
    }

    this.animFrameId = requestAnimationFrame(this.gameLoop);
  };

  private applyRadialKnockback(radius: number, force: number, particleType: 'smoke' | 'shield') {
    for (const enemy of this.enemies) {
      if (isWithinDistance(enemy.x, enemy.y, this.player.x, this.player.y, radius)) {
        const dx = enemy.x - this.player.x;
        const dy = enemy.y - this.player.y;
        const dist = Math.hypot(dx, dy);
        const normX = dist > 0 ? dx / dist : 1;
        const normY = dist > 0 ? dy / dist : 0;
        const pushFactor = (1 - dist / radius) * force + 100;
        enemy.x += normX * pushFactor;
        enemy.y += normY * pushFactor;
        enemy.attackCooldownTimer = 1.5;
      }
    }

    const particleCount = particleType === 'smoke' ? 60 : 50;
    for (let i = 0; i < particleCount; i++) {
      const angle = Math.random() * Math.PI * 2;
      const speed = 2.5 + Math.random() * 7;

      if (particleType === 'smoke') {
        this.spawnParticle(
          this.player.x + (Math.random() - 0.5) * 20,
          this.player.y + (Math.random() - 0.5) * 20,
          Math.cos(angle) * speed,
          Math.sin(angle) * speed,
          6 + Math.random() * 12,
          Math.random() < 0.6 ? '#18181b' : (Math.random() < 0.5 ? '#3f3f46' : '#7f1d1d'),
          0.012 + Math.random() * 0.01
        );
      } else {
        this.spawnParticle(
          this.player.x,
          this.player.y,
          Math.cos(angle) * speed,
          Math.sin(angle) * speed,
          3.5 + Math.random() * 6,
          Math.random() < 0.5 ? '#38bdf8' : '#fef08a',
          0.018 + Math.random() * 0.01
        );
      }
    }
  }

  private update(dt: number) {
    if (this.isLoading) {
      this.loadingProgress += dt * 3.0;
      if (this.loadingProgress >= 1.0) {
        this.loadingProgress = 1.0;
        this.isLoading = false;
      }
      return;
    }

    // Smooth darkness scrim animation over 5 seconds
    if (this.currentDarkness < this.targetDarkness) {
      this.currentDarkness = Math.min(this.targetDarkness, this.currentDarkness + dt / 5.0);
    } else if (this.currentDarkness > this.targetDarkness) {
      this.currentDarkness = Math.max(this.targetDarkness, this.currentDarkness - dt / 5.0);
    }

    // Human shield timer
    if (this.humanShieldTimer > 0) {
      this.humanShieldTimer -= dt;
    }

    // Handle 3-second phase transition pause
    if (this.transitionState.active) {
      this.transitionState.timer += dt;
      this.transitionState.progress = Math.min(1.0, this.transitionState.timer / this.transitionState.duration);

      // Continuously spawn ambient transformation particles
      if (this.transitionState.type === 'to_night') {
        if (Math.random() < 0.7) {
          const angle = Math.random() * Math.PI * 2;
          const speed = 1.5 + Math.random() * 4;
          this.particles.push({
            x: this.player.x + (Math.random() - 0.5) * 20,
            y: this.player.y + (Math.random() - 0.5) * 20,
            vx: Math.cos(angle) * speed,
            vy: Math.sin(angle) * speed - 1.2,
            radius: 4 + Math.random() * 8,
            color: Math.random() < 0.6 ? '#18181b' : (Math.random() < 0.5 ? '#7f1d1d' : '#ef4444'),
            alpha: 0.85,
            decay: 0.02,
          });
        }
      } else if (this.transitionState.type === 'to_day') {
        if (Math.random() < 0.7) {
          const angle = Math.random() * Math.PI * 2;
          const dist = 25 + Math.random() * 25;
          this.particles.push({
            x: this.player.x + Math.cos(angle) * dist,
            y: this.player.y + Math.sin(angle) * dist,
            vx: -Math.cos(angle) * 2.5,
            vy: -Math.sin(angle) * 2.5,
            radius: 2 + Math.random() * 5,
            color: Math.random() < 0.5 ? '#38bdf8' : '#fef08a',
            alpha: 0.9,
            decay: 0.025,
          });
        }
      }

      // Keep particles and damage numbers updated during transition
      this.updateParticles(dt);
      this.updateDamageNumbers(dt);

      // Finish transition after 3.0 seconds
      if (this.transitionState.timer >= this.transitionState.duration) {
        this.transitionState.active = false;
        if (this.transitionState.type === 'to_day') {
          // The shield lasts for 3 seconds after transitioning to human form
          this.humanShieldTimer = 3.0;
        }
        this.transitionState.type = null;
      }

      // Pause gameplay action during the 3-second transition
      return;
    }

    // 1. Timers & Day/Night Cycle
    this.secondTimer += dt;
    if (this.secondTimer >= 1.0) {
      this.secondTimer -= 1.0;
      this.stats.timeSurvivedSeconds += 1;
      this.checkBossSpawns();

      // HP Regeneration from Blood Stone passive
      const bloodStoneLevel = this.getPassiveLevel('blood_stone');
      if (bloodStoneLevel > 0) {
        const regen = bloodStoneLevel * 0.8;
        this.healPlayer(regen);
      }
    }

    this.phaseTimer -= dt;
    if (this.phaseTimer <= 0) {
      const nextForm = this.currentForm === 'human' ? 'werewolf' : 'human';
      this.currentForm = nextForm;
      this.player.form = nextForm;
      this.stats.transformationsCount += 1;

      if (nextForm === 'werewolf') {
        this.phaseTimer = this.getNightDuration();
        // Day -> Night transition (3s pause)
        this.transitionState = {
          active: true,
          type: 'to_night',
          timer: 0,
          duration: 3.0,
          progress: 0,
        };
        this.targetDarkness = 1.0;

        sound.playHowl();
        vibrateTransformation();

        // Enemies knocked back by blast of smoke from player
        this.applyRadialKnockback(480, 260, 'smoke');
        this.spawnTransformationParticles('#ef4444');
      } else {
        this.phaseTimer = this.getDayDuration();
        // Night -> Day transition (3s pause)
        this.transitionState = {
          active: true,
          type: 'to_day',
          timer: 0,
          duration: 3.0,
          progress: 0,
        };
        this.targetDarkness = 0.0;

        // Cast shield (lasts during 3s transition + 3s after transition)
        this.humanShieldTimer = 6.0;

        sound.playHumanChime();
        vibrateTransformation();

        // Enemies knocked back by shield burst
        this.applyRadialKnockback(480, 260, 'shield');
        this.spawnTransformationParticles('#38bdf8');
      }
    }

    // Update lightning visual timers
    for (let i = this.lightningVisuals.length - 1; i >= 0; i--) {
      const vis = this.lightningVisuals[i];
      vis.lifeMs -= dt * 1000;
      if (vis.lifeMs <= 0) {
        this.lightningVisuals[i] = this.lightningVisuals[this.lightningVisuals.length - 1];
        this.lightningVisuals.pop();
      }
    }

    // Update enemy electrified timers
    for (const enemy of this.enemies) {
      if (enemy.isElectrified && enemy.electrifiedTimer !== undefined) {
        enemy.electrifiedTimer -= dt;
        if (enemy.electrifiedTimer <= 0) {
          enemy.isElectrified = false;
        }
      }
    }

    // Update Slashing Dash sequence if active
    if (this.slashingDashState && this.slashingDashState.active) {
      const st = this.slashingDashState;
      st.timerMs += dt * 1000;
      this.player.invincibleTimer = 0.1; // Immune to damage during entire window

      if (st.phase === 'dash_to') {
        const dashTime = 120;
        const progress = Math.min(1.0, st.timerMs / dashTime);
        this.player.x = st.originX + (st.targetX - st.originX) * progress;
        this.player.y = st.originY + (st.targetY - st.originY) * progress;

        if (Math.random() < 0.8) {
          this.particles.push({
            x: this.player.x + (Math.random() - 0.5) * 10,
            y: this.player.y + (Math.random() - 0.5) * 10,
            vx: (Math.random() - 0.5) * 2,
            vy: (Math.random() - 0.5) * 2,
            radius: 3 + Math.random() * 4,
            color: '#f97316',
            alpha: 0.8,
            decay: 0.05,
          });
        }

        if (st.timerMs >= dashTime) {
          st.phase = 'slash1';
          st.timerMs = 0;
          this.player.x = st.targetX;
          this.player.y = st.targetY;
          sound.playSlash();
          this.perform360Slash(st.targetX, st.targetY, st.slashDamage);
        }
      } else if (st.phase === 'slash1') {
        if (st.timerMs >= 100) {
          st.phase = 'dash_back';
          st.timerMs = 0;
        }
      } else if (st.phase === 'dash_back') {
        const dashTime = 120;
        const progress = Math.min(1.0, st.timerMs / dashTime);
        this.player.x = st.targetX + (st.originX - st.targetX) * progress;
        this.player.y = st.targetY + (st.originY - st.targetY) * progress;

        if (Math.random() < 0.8) {
          this.particles.push({
            x: this.player.x + (Math.random() - 0.5) * 10,
            y: this.player.y + (Math.random() - 0.5) * 10,
            vx: (Math.random() - 0.5) * 2,
            vy: (Math.random() - 0.5) * 2,
            radius: 3 + Math.random() * 4,
            color: '#ef4444',
            alpha: 0.8,
            decay: 0.05,
          });
        }

        if (st.timerMs >= dashTime) {
          this.player.x = st.originX;
          this.player.y = st.originY;

          if (st.hasSecondSlash) {
            st.phase = 'slash2';
            st.timerMs = 0;
            sound.playSlash();
            this.perform360Slash(st.originX, st.originY, st.slashDamage);
          } else {
            st.active = false;
          }
        }
      } else if (st.phase === 'slash2') {
        if (st.timerMs >= 100) {
          st.active = false;
        }
      }
    }

    // Invincibility countdown
    if (this.player.invincibleTimer > 0) {
      this.player.invincibleTimer -= dt;
    }

    // 1b. Update Net Hazards & Flying Nets & Player Recoil Timers
    this.playerSpikeRecoilCooldown = Math.max(0, this.playerSpikeRecoilCooldown - dt);

    for (let i = this.nets.length - 1; i >= 0; i--) {
      const net = this.nets[i];
      net.lifeMs -= dt * 1000;
      if (net.lifeMs <= 0) {
        this.nets.splice(i, 1);
      }
    }

    for (let i = this.flyingNets.length - 1; i >= 0; i--) {
      const fn = this.flyingNets[i];
      fn.elapsedMs += dt * 1000;
      fn.progress = Math.min(1.0, fn.elapsedMs / fn.durationMs);
      fn.currentX = fn.startX + (fn.targetX - fn.startX) * fn.progress;
      fn.currentY = fn.startY + (fn.targetY - fn.startY) * fn.progress;
      fn.rotation += dt * 9;

      if (fn.progress >= 1.0) {
        this.nets.push({
          id: Math.random(),
          x: fn.targetX,
          y: fn.targetY,
          radius: 45,
          lifeMs: 3000,
          maxLifeMs: 3000,
        });
        this.addParticleBurst(fn.targetX, fn.targetY, '#eab308', 12);
        sound.playHit();
        this.flyingNets.splice(i, 1);
      }
    }

    // 2. Player Movement
    let inputX = this.joystick.vectorX;
    let inputY = this.joystick.vectorY;

    // Add keyboard inputs
    if (this.keys['w'] || this.keys['arrowup']) inputY -= 1;
    if (this.keys['s'] || this.keys['arrowdown']) inputY += 1;
    if (this.keys['a'] || this.keys['arrowleft']) inputX -= 1;
    if (this.keys['d'] || this.keys['arrowright']) inputX += 1;

    const len = Math.hypot(inputX, inputY);
    if (len > 0) {
      const normX = inputX / (len > 1 ? len : 1);
      const normY = inputY / (len > 1 ? len : 1);

      // Check Net Slow (75% movement speed reduction if player is standing on any active net)
      const isPlayerInNet = this.nets.some((net) =>
        isWithinDistance(this.player.x, this.player.y, net.x, net.y, net.radius + this.player.radius)
      );
      const netSlowMultiplier = isPlayerInNet ? 0.25 : 1.0;

      // Speed multipliers
      const metaSpeed = 1 + (this.persistentData.metaUpgrades.speed || 0) * 0.05;
      const passiveBoots = this.activePassives.find((p) => p.id === 'quickstep_boots');
      const bootSpeed = 1 + (passiveBoots ? passiveBoots.level * 0.10 : 0);
      const formSpeed = this.player.form === 'werewolf' ? 1.3 : 1.0; // Werewolf moves +30% faster

      const totalSpeed = this.player.baseSpeed * metaSpeed * bootSpeed * formSpeed * netSlowMultiplier * 60 * dt;

      this.player.x += normX * totalSpeed;
      this.player.y += normY * totalSpeed;
      this.player.facingAngle = Math.atan2(normY, normX);
    }

    // 2b. Shrines & Shops Spawn & Collision Checks
    this.updateShrinesSectorSpawns();
    this.checkShrineCollisions();
    this.updateShopsSectorSpawns();
    this.checkShopCollisions();

    // 3. Spawning Enemies
    this.spawnTimer += dt;
    const spawnInterval = Math.max(0.3, 1.8 - Math.min(this.stats.timeSurvivedSeconds / 200, 1.4));
    if (this.spawnTimer >= spawnInterval) {
      this.spawnTimer = 0;
      this.spawnEnemyGroup();
    }

    // Elite Enemy Spawn every 20 seconds
    this.eliteSpawnTimer += dt;
    if (this.eliteSpawnTimer >= 20) {
      this.eliteSpawnTimer -= 20;
      this.spawnEliteEnemy();
    }

    // Rebuild Spatial Enemy Grid for fast proximity and collision checks
    this.rebuildEnemyGrid();

    // 4. Fire Weapons
    this.updateWeapons(performance.now());

    // 5. Update Entities (Enemies, Projectiles, Gems, Particles)
    this.updateWolvenHeadbutt(dt);
    this.updateEnemies(dt);
    this.rebuildEnemyGrid(); // Refresh grid after enemy movement for projectiles & AOE spells
    this.updateDecoys(dt);
    this.updateMeditationMat(dt);
    this.updateProjectiles(dt);
    this.updateFirePatches(dt);
    this.updateGhostWolves(dt);
    this.updateGems(dt);
    this.updateParticles(dt);
    this.updateDamageNumbers(dt);

    // Check synergies active
    this.checkSynergies();

    // Call stats callback for UI updates
    this.callbacks.onStatsUpdate(
      this.stats,
      this.player.hp,
      this.player.maxHp,
      this.player.xp,
      this.player.xpToNextLevel,
      this.player.level,
      this.player.form,
      Math.ceil(this.phaseTimer)
    );
  }

  private spawnTransformationParticles(color: string) {
    for (let i = 0; i < 30; i++) {
      const angle = Math.random() * Math.PI * 2;
      const speed = 2 + Math.random() * 4;
      this.particles.push({
        x: this.player.x,
        y: this.player.y,
        vx: Math.cos(angle) * speed,
        vy: Math.sin(angle) * speed,
        radius: 3 + Math.random() * 4,
        color: color,
        alpha: 1.0,
        decay: 0.03,
      });
    }
  }

  private checkBossSpawns() {
    const elapsed = this.stats.timeSurvivedSeconds;
    if (this.stage.bossAtSeconds.includes(elapsed)) {
      sound.playBossSpawn();
      vibrateBossSpawn();
      this.spawnBoss();
    }
  }

  private spawnBoss() {
    const bossType = this.stats.timeSurvivedSeconds >= 600 ? 'boss_alpha_wolf' : 'boss_inquisitor';
    const def = ENEMIES[bossType];
    const zoom = this.getCameraZoom();
    const spawnDist = Math.max(this.canvas.width, this.canvas.height) / (2 * zoom) + 100;
    const angle = Math.random() * Math.PI * 2;

    this.enemies.push({
      id: ++this.enemyIdCounter,
      type: def.type,
      name: def.name,
      x: this.player.x + Math.cos(angle) * spawnDist,
      y: this.player.y + Math.sin(angle) * spawnDist,
      hp: def.hp,
      maxHp: def.hp,
      speed: def.speed,
      damage: def.damage,
      radius: def.radius,
      color: def.color,
      xpValue: def.xpValue,
      goldChance: def.goldChance,
      isBoss: true,
    });
  }

  private spawnEnemyGroup() {
    const count = 1 + Math.floor(this.stats.timeSurvivedSeconds / 40);
    const zoom = this.getCameraZoom();
    const spawnDist = Math.hypot(this.canvas.width, this.canvas.height) / (2 * zoom) + 60;
    const minutes = this.stats.timeSurvivedSeconds / 60;
    // Compounding time-based health scaling so enemies grow significantly tougher over time
    const timeScale = 1 + minutes * 0.8 + Math.pow(minutes, 1.8) * 0.4;

    for (let i = 0; i < count; i++) {
      const angle = Math.random() * Math.PI * 2;
      const x = this.player.x + Math.cos(angle) * spawnDist;
      const y = this.player.y + Math.sin(angle) * spawnDist;

      // Select enemy based on stage spawn rates
      const roll = Math.random();
      let enemyType = 'peasant';
      let cumulative = 0;
      for (const [type, rate] of Object.entries(this.stage.spawnRates)) {
        cumulative += rate;
        if (roll <= cumulative) {
          enemyType = type;
          break;
        }
      }

      const def = ENEMIES[enemyType] || ENEMIES.peasant;

      this.enemies.push({
        id: ++this.enemyIdCounter,
        type: def.type,
        name: def.name,
        x,
        y,
        hp: def.hp * timeScale,
        maxHp: def.hp * timeScale,
        speed: def.speed,
        damage: def.damage,
        radius: def.radius,
        color: def.color,
        xpValue: def.xpValue,
        goldChance: def.goldChance,
        isRanged: def.isRanged,
        shield: def.shield ? def.shield * timeScale : undefined,
        maxShield: def.shield ? def.shield * timeScale : undefined,
        isExploding: def.isExploding,
        isNetThrower: def.isNetThrower,
        netCooldownTimer: def.isNetThrower ? 1.0 + Math.random() * 2.0 : undefined,
        isSpiky: def.isSpiky,
        spikesOut: def.isSpiky ? true : undefined,
        spikeCycleTimer: def.isSpiky ? Math.random() * 5 : undefined,
      });
    }
  }

  private spawnEliteEnemy() {
    const types = Object.keys(this.stage.spawnRates);
    const enemyType = types[Math.floor(Math.random() * types.length)] || 'peasant';
    const def = ENEMIES[enemyType] || ENEMIES.peasant;

    const minutes = this.stats.timeSurvivedSeconds / 60;
    const timeScale = 1 + minutes * 0.8 + Math.pow(minutes, 1.8) * 0.4;

    const zoom = this.getCameraZoom();
    const spawnDist = Math.hypot(this.canvas.width, this.canvas.height) / (2 * zoom) + 80;
    const angle = Math.random() * Math.PI * 2;

    this.enemies.push({
      id: ++this.enemyIdCounter,
      type: def.type,
      name: `Elite ${def.name}`,
      x: this.player.x + Math.cos(angle) * spawnDist,
      y: this.player.y + Math.sin(angle) * spawnDist,
      hp: def.hp * 20 * timeScale, // 20x health compared to normal mobs
      maxHp: def.hp * 20 * timeScale,
      speed: def.speed * 1.15,
      damage: def.damage * 3, // 3x damage compared to normal mobs
      radius: def.radius * 1.4,
      color: '#f59e0b',
      xpValue: def.xpValue * 4,
      goldChance: 0.8,
      isElite: true,
      isRanged: def.isRanged,
      shield: def.shield ? def.shield * 10 * timeScale : undefined,
      maxShield: def.shield ? def.shield * 10 * timeScale : undefined,
      isExploding: def.isExploding,
      isNetThrower: def.isNetThrower,
      netCooldownTimer: def.isNetThrower ? 1.0 : undefined,
      isSpiky: def.isSpiky,
      spikesOut: def.isSpiky ? true : undefined,
      spikeCycleTimer: def.isSpiky ? 0 : undefined,
    });

    sound.playBossSpawn();
    this.spawnDamageNumber(this.player.x, this.player.y - 35, '👑 ELITE SPAWNED!', '#f59e0b', true);
  }

  private updateWeapons(now: number) {
    const metaCooldown = 1 - (this.persistentData.metaUpgrades.cooldown || 0) * 0.05;
    const hourglassReduction = 1 - (this.getPassiveLevel('chrono_hourglass') * 0.08);

    for (const wInst of this.activeWeapons) {
      const def = WEAPONS[wInst.id];
      if (!def) continue;

      // Skip form-exclusive weapons when in opposite form
      if (def.formExclusive && def.formExclusive !== this.player.form) continue;

      // Human form reduces magic weapon cooldown by 30%
      const formCooldownMult = this.player.form === 'human' && def.category === 'magical' ? 0.7 : 1.0;
      const effectiveCooldown = def.cooldownMs * metaCooldown * hourglassReduction * formCooldownMult;

      if (now - wInst.lastFired >= effectiveCooldown) {
        wInst.lastFired = now;
        this.fireWeapon(wInst);
      }
    }
  }

  private perform360Slash(cx: number, cy: number, damage: number) {
    const slashRadius = 90;
    this.projectiles.push({
      id: ++this.projectileIdCounter,
      x: cx,
      y: cy,
      vx: 0,
      vy: 0,
      radius: slashRadius,
      damage: damage,
      lifeMs: 120,
      maxLifeMs: 120,
      color: '#f97316',
      pierceCount: 999,
      weaponType: 'slashing_dash',
    });

    const slashTargets = this.getEnemiesInRadius(cx, cy, slashRadius);
    for (let i = 0; i < slashTargets.length; i++) {
      const enemy = slashTargets[i];
      const dist = Math.hypot(enemy.x - cx, enemy.y - cy);
      if (dist <= slashRadius + enemy.radius) {
        const critChance = (this.getPassiveLevel('wolf_fang') * 0.07) + 0.05;
        const isCrit = Math.random() < critChance;
        const finalDmg = damage * (isCrit ? 2.0 : 1.0);

        this.damageEnemy(enemy, finalDmg, '#f97316', isCrit);
        this.addParticleBurst(enemy.x, enemy.y, '#f97316', 6);
      }
    }
  }

  private fireWeapon(wInst: WeaponInstance) {
    const def = WEAPONS[wInst.id];
    if (!def) return;

    if (def.formExclusive && def.formExclusive !== this.player.form) return;

    // Calculate Weapon Damage
    const metaDamage = 1 + (this.persistentData.metaUpgrades.damage || 0) * 0.08;
    const formMult =
      this.player.form === 'werewolf'
        ? def.category === 'physical'
          ? 1.5
          : 1.0
        : def.category === 'magical'
        ? 1.5
        : 1.0;

    const baseDamage = def.baseDamage * (1 + (wInst.level - 1) * 0.25) * metaDamage * formMult * this.getPlayerDamageMultiplier();

    // Nearest Enemy for magic attacks
    const closestEnemy = this.getClosestEnemy();

    // Range boost for ranged weapons / spells when in Human Form
    let rangeMult = 1 + (wInst.level - 1) * 0.15; // Upgrades increase range
    if (this.player.form === 'human') {
      rangeMult *= 1.5; // Range boost when in human form
    }
    const effectiveRange = def.range * rangeMult;

    switch (wInst.id) {
      case 'wolven_headbutt': {
        // Headbutt continuous charge & contact logic is updated in updateWolvenHeadbutt
        break;
      }

      case 'tail_sweep': {
        sound.playSlash();
        const facingAngle = this.player.facingAngle;
        const sweepRadius = 100 * (1 + (wInst.level - 1) * 0.1);

        // Arc behind player: 120 deg to 240 deg relative to facing angle
        // Center behind = facingAngle + Math.PI (180 deg)
        const startAng = facingAngle + Math.PI - (Math.PI / 3);
        const endAng = facingAngle + Math.PI + (Math.PI / 3);

        const hitIds: number[] = [];
        const sweepTargets = this.getEnemiesInRadius(this.player.x, this.player.y, sweepRadius);
        for (let i = 0; i < sweepTargets.length; i++) {
          const enemy = sweepTargets[i];
          const dist = Math.hypot(enemy.x - this.player.x, enemy.y - this.player.y);
          if (dist <= sweepRadius + enemy.radius) {
            const enemyAng = Math.atan2(enemy.y - this.player.y, enemy.x - this.player.x);
            let relAng = enemyAng - (facingAngle + Math.PI);
            while (relAng > Math.PI) relAng -= Math.PI * 2;
            while (relAng < -Math.PI) relAng += Math.PI * 2;

            if (Math.abs(relAng) <= Math.PI / 3 + 0.15) {
              const critChance = (this.getPassiveLevel('wolf_fang') * 0.07) + 0.05;
              const isCrit = Math.random() < critChance;
              const finalDmg = baseDamage * (isCrit ? 2.0 : 1.0);

              this.damageEnemy(enemy, finalDmg, '#dc2626', isCrit);

              const normX = (enemy.x - this.player.x) / (dist || 1);
              const normY = (enemy.y - this.player.y) / (dist || 1);
              enemy.x += normX * 180;
              enemy.y += normY * 180;
              enemy.attackCooldownTimer = 1.2;
              hitIds.push(enemy.id);
            }
          }
        }

        this.projectiles.push({
          id: ++this.projectileIdCounter,
          x: this.player.x,
          y: this.player.y,
          vx: 0,
          vy: 0,
          radius: sweepRadius,
          damage: baseDamage,
          lifeMs: 220,
          maxLifeMs: 220,
          color: def.color,
          pierceCount: 999,
          weaponType: 'tail_sweep',
          startAngle: startAng,
          endAngle: endAng,
          hitEnemyIds: hitIds,
        });
        break;
      }

      case 'slashing_dash': {
        if (this.slashingDashState?.active) break;

        let bestTarget: Enemy | null = null;
        let bestDist = Infinity;
        const dashRange = 350 * (1 + (wInst.level - 1) * 0.1);
        const halfConeRad = (5 * Math.PI) / 180; // 10 degree forward cone (±5 degrees)

        // Search for enemies strictly in a 10° forward cone in front of player
        const dashTargets = this.getEnemiesInRadius(this.player.x, this.player.y, dashRange);
        for (let i = 0; i < dashTargets.length; i++) {
          const enemy = dashTargets[i];
          const dist = Math.hypot(enemy.x - this.player.x, enemy.y - this.player.y);
          if (dist <= dashRange + enemy.radius) {
            const enemyAng = Math.atan2(enemy.y - this.player.y, enemy.x - this.player.x);
            let diff = enemyAng - this.player.facingAngle;
            while (diff > Math.PI) diff -= Math.PI * 2;
            while (diff < -Math.PI) diff += Math.PI * 2;

            if (Math.abs(diff) <= halfConeRad) {
              if (dist < bestDist) {
                bestDist = dist;
                bestTarget = enemy;
              }
            }
          }
        }

        if (!bestTarget) {
          const metaCooldown = 1 - (this.persistentData.metaUpgrades.cooldown || 0) * 0.05;
          const hourglassReduction = 1 - (this.getPassiveLevel('chrono_hourglass') * 0.08);
          const effectiveCooldown = def.cooldownMs * metaCooldown * hourglassReduction;
          wInst.lastFired = Date.now() - effectiveCooldown + 150;
          break;
        }

        this.slashingDashState = {
          active: true,
          level: wInst.level,
          originX: this.player.x,
          originY: this.player.y,
          targetX: bestTarget.x,
          targetY: bestTarget.y,
          phase: 'dash_to',
          timerMs: 0,
          hasSecondSlash: wInst.level >= 3,
          slashDamage: baseDamage,
        };
        break;
      }

      case 'lightning_teeth': {
        const biteRange = 50;
        let primaryTarget: Enemy | null = null;
        let minAngleDiff = Infinity;

        for (const enemy of this.enemies) {
          const dist = Math.hypot(enemy.x - this.player.x, enemy.y - this.player.y);
          if (dist <= biteRange + enemy.radius) {
            const enemyAng = Math.atan2(enemy.y - this.player.y, enemy.x - this.player.x);
            let diff = enemyAng - this.player.facingAngle;
            while (diff > Math.PI) diff -= Math.PI * 2;
            while (diff < -Math.PI) diff += Math.PI * 2;

            if (Math.abs(diff) <= Math.PI / 3) {
              if (Math.abs(diff) < minAngleDiff) {
                minAngleDiff = Math.abs(diff);
                primaryTarget = enemy;
              }
            }
          }
        }

        if (primaryTarget) {
          sound.playMagic();
          const maxJumps = wInst.level;
          const chainPoints: Array<{ x: number; y: number }> = [{ x: this.player.x, y: this.player.y }];
          const hitIds = new Set<number>();

          let currentEnemy: Enemy | null = primaryTarget;
          let jumpCount = 0;

          while (currentEnemy && jumpCount <= maxJumps) {
            hitIds.add(currentEnemy.id);
            chainPoints.push({ x: currentEnemy.x, y: currentEnemy.y });

            const isE = currentEnemy.isElectrified && currentEnemy.electrifiedTimer !== undefined && currentEnemy.electrifiedTimer > 0;
            const electricMult = isE ? 5.0 : 1.0;
            const finalDmg = baseDamage * electricMult;

            const critChance = (this.getPassiveLevel('wolf_fang') * 0.07) + 0.05;
            const isCrit = Math.random() < critChance;

            this.damageEnemy(currentEnemy, finalDmg * (isCrit ? 2.0 : 1.0), '#facc15', isCrit);
            currentEnemy.isElectrified = true;
            currentEnemy.electrifiedTimer = 5.0;

            jumpCount++;
            if (jumpCount > maxJumps) break;

            let nextEnemy: Enemy | null = null;
            let nextDist = Infinity;
            for (const enemy of this.enemies) {
              if (hitIds.has(enemy.id)) continue;
              const d = Math.hypot(enemy.x - currentEnemy.x, enemy.y - currentEnemy.y);
              if (d <= 50 + enemy.radius && d < nextDist) {
                nextDist = d;
                nextEnemy = enemy;
              }
            }
            currentEnemy = nextEnemy;
          }

          this.lightningVisuals.push({
            points: chainPoints,
            lifeMs: 150,
            maxLifeMs: 150,
          });
        }
        break;
      }
      case 'werewolf_claws': {
        sound.playSlash();
        const facingAngle = this.player.facingAngle;

        // Base range increases with weapon level and werewolf form
        const outerRadius = effectiveRange * (this.player.form === 'werewolf' ? 1.3 : 1.0);
        const innerRadius = outerRadius * 0.25;

        const levelArcBonus = (wInst.level - 1) * 6;
        const rightStartRel = 0;
        const rightEndRel = (70 + levelArcBonus) * (Math.PI / 180);

        const leftStartRel = 0;
        const leftEndRel = (-70 - levelArcBonus) * (Math.PI / 180);

        // Right Hand Swim Stroke Slash
        this.projectiles.push({
          id: ++this.projectileIdCounter,
          x: this.player.x,
          y: this.player.y,
          vx: 0,
          vy: 0,
          radius: outerRadius,
          innerRadius: innerRadius,
          damage: baseDamage,
          lifeMs: 220,
          maxLifeMs: 220,
          color: def.color,
          pierceCount: 999,
          weaponType: 'werewolf_claws',
          hand: 'right',
          startAngle: facingAngle + rightStartRel,
          endAngle: facingAngle + rightEndRel,
          hitEnemyIds: [],
        });

        // Left Hand Swim Stroke Slash
        this.projectiles.push({
          id: ++this.projectileIdCounter,
          x: this.player.x,
          y: this.player.y,
          vx: 0,
          vy: 0,
          radius: outerRadius,
          innerRadius: innerRadius,
          damage: baseDamage,
          lifeMs: 220,
          maxLifeMs: 220,
          color: def.color,
          pierceCount: 999,
          weaponType: 'werewolf_claws',
          hand: 'left',
          startAngle: facingAngle + leftStartRel,
          endAngle: facingAngle + leftEndRel,
          hitEnemyIds: [],
        });
        break;
      }

      case 'silver_crossbow': {
        sound.playSlash();
        const angle = this.player.facingAngle;

        const projCount = 1 + Math.floor((wInst.level - 1) / 2);
        for (let i = 0; i < projCount; i++) {
          const spread = (i - (projCount - 1) / 2) * 0.15;
          this.projectiles.push({
            id: ++this.projectileIdCounter,
            x: this.player.x,
            y: this.player.y,
            vx: Math.cos(angle + spread) * def.speed,
            vy: Math.sin(angle + spread) * def.speed,
            radius: 8,
            damage: baseDamage,
            lifeMs: (effectiveRange / def.speed) * 16,
            maxLifeMs: (effectiveRange / def.speed) * 16,
            color: def.color,
            pierceCount: 2 + Math.floor(wInst.level / 2),
            weaponType: 'silver_crossbow',
          });
        }
        break;
      }

      case 'frost_orb': {
        sound.playMagic();
        const angle = closestEnemy
          ? Math.atan2(closestEnemy.y - this.player.y, closestEnemy.x - this.player.x)
          : this.player.facingAngle;

        // 2x Effect Radius during Night / Werewolf Form
        const isNightTime = this.currentForm === 'werewolf';
        const effectRadius = (14 + wInst.level * 2) * (isNightTime ? 2.0 : 1.0);

        this.projectiles.push({
          id: ++this.projectileIdCounter,
          x: this.player.x,
          y: this.player.y,
          vx: Math.cos(angle) * def.speed,
          vy: Math.sin(angle) * def.speed,
          radius: effectRadius,
          damage: baseDamage,
          lifeMs: Math.max(800, (effectiveRange / def.speed) * 20),
          maxLifeMs: Math.max(800, (effectiveRange / def.speed) * 20),
          color: def.color,
          pierceCount: 3 + wInst.level,
          weaponType: 'frost_orb',
          extraEffect: 'freeze',
        });
        break;
      }

      case 'earth_shatter': {
        sound.playShatter();
        // Target area is a forward 60-degree cone from 330 (-30 deg) to 30 deg
        const facing = this.player.facingAngle;
        const startAngle = facing - Math.PI / 6; // -30 deg
        const endAngle = facing + Math.PI / 6;   // +30 deg

        this.projectiles.push({
          id: ++this.projectileIdCounter,
          x: this.player.x,
          y: this.player.y,
          vx: 0,
          vy: 0,
          radius: effectiveRange,
          damage: baseDamage,
          lifeMs: 280,
          maxLifeMs: 280,
          color: def.color,
          pierceCount: 999,
          weaponType: 'earth_shatter',
          canShatter: true,
          startAngle,
          endAngle,
          hitEnemyIds: [],
        });
        break;
      }

      case 'lunar_beam': {
        sound.playMagic();
        const targetX = closestEnemy ? closestEnemy.x : this.player.x + Math.cos(this.player.facingAngle) * effectiveRange;
        const targetY = closestEnemy ? closestEnemy.y : this.player.y + Math.sin(this.player.facingAngle) * effectiveRange;

        this.projectiles.push({
          id: ++this.projectileIdCounter,
          x: targetX,
          y: targetY,
          vx: 0,
          vy: 0,
          radius: 40 + wInst.level * 8,
          damage: baseDamage,
          lifeMs: 400,
          maxLifeMs: 400,
          color: def.color,
          pierceCount: 999,
          weaponType: 'lunar_beam',
        });
        break;
      }

      case 'silver_daggers': {
        sound.playSlash();
        const daggerCount = 3 + wInst.level * 2;
        for (let i = 0; i < daggerCount; i++) {
          const angle = (i / daggerCount) * Math.PI * 2 + this.player.facingAngle;
          this.projectiles.push({
            id: ++this.projectileIdCounter,
            x: this.player.x,
            y: this.player.y,
            vx: Math.cos(angle) * def.speed,
            vy: Math.sin(angle) * def.speed,
            radius: 6,
            damage: baseDamage,
            lifeMs: (effectiveRange / def.speed) * 16,
            maxLifeMs: (effectiveRange / def.speed) * 16,
            color: def.color,
            pierceCount: 1,
            weaponType: 'silver_daggers',
          });
        }
        break;
      }

      case 'blood_ring': {
        sound.playHit();
        this.projectiles.push({
          id: ++this.projectileIdCounter,
          x: this.player.x,
          y: this.player.y,
          vx: 0,
          vy: 0,
          radius: effectiveRange,
          damage: baseDamage,
          lifeMs: 250,
          maxLifeMs: 250,
          color: def.color,
          pierceCount: 999,
          weaponType: 'blood_ring',
        });
        break;
      }

      case 'wolf_pack': {
        sound.playSlash();
        // Command spectral ghost wolves to charge at enemies with 200ms stagger between individual wolves
        let delayIdx = 0;
        for (const wolf of this.ghostWolves) {
          if (wolf.state === 'orbit') {
            wolf.state = 'queued';
            wolf.triggerDelayMs = delayIdx * 200; // 200ms delay between wolves
            delayIdx++;
          }
        }
        break;
      }

      case 'burning_steps': {
        sound.playMagic();
        // Spawns a patch of fire under the player's location when triggered
        this.firePatches.push({
          id: ++this.projectileIdCounter,
          x: this.player.x,
          y: this.player.y,
          radius: effectiveRange,
          damage: baseDamage,
          lifeMs: 3000, // 3 seconds
          maxLifeMs: 3000,
        });
        break;
      }

      case 'silver_decapitator': {
        sound.playSlash();
        const facingAngle = this.player.facingAngle;
        const slashRange = (90 + (wInst.level - 1) * 20) * (this.player.form === 'human' ? 1.2 : 1.0);

        // Arc from 320° (-40°) to 40° (+40°) through 0 (facingAngle)
        const halfArcRad = (40 * Math.PI) / 180;
        const startAng = facingAngle - halfArcRad;
        const endAng = facingAngle + halfArcRad;

        const hitIds: number[] = [];
        for (const enemy of this.enemies) {
          const dist = Math.hypot(enemy.x - this.player.x, enemy.y - this.player.y);
          if (dist <= slashRange + enemy.radius) {
            const enemyAng = Math.atan2(enemy.y - this.player.y, enemy.x - this.player.x);
            let diff = enemyAng - facingAngle;
            while (diff > Math.PI) diff -= Math.PI * 2;
            while (diff < -Math.PI) diff += Math.PI * 2;

            if (Math.abs(diff) <= halfArcRad + 0.15) {
              const critChance = (this.getPassiveLevel('wolf_fang') * 0.07) + 0.05;
              const isCrit = Math.random() < critChance;
              const finalDmg = baseDamage * (isCrit ? 2.0 : 1.0);

              this.damageEnemy(enemy, finalDmg, '#e2e8f0', isCrit);
              this.addParticleBurst(enemy.x, enemy.y, '#e2e8f0', 5);
              hitIds.push(enemy.id);
            }
          }
        }

        this.projectiles.push({
          id: ++this.projectileIdCounter,
          x: this.player.x,
          y: this.player.y,
          vx: 0,
          vy: 0,
          radius: slashRange,
          damage: baseDamage,
          lifeMs: 200,
          maxLifeMs: 200,
          color: def.color,
          pierceCount: 999,
          weaponType: 'silver_decapitator',
          startAngle: startAng,
          endAngle: endAng,
          hitEnemyIds: hitIds,
        });

        // Level 4+ adds a second slash from 320° to 40°
        if (wInst.level >= 4) {
          setTimeout(() => {
            sound.playSlash();
            const returnHitIds: number[] = [];
            for (const enemy of this.enemies) {
              const dist = Math.hypot(enemy.x - this.player.x, enemy.y - this.player.y);
              if (dist <= slashRange * 1.05 + enemy.radius) {
                const enemyAng = Math.atan2(enemy.y - this.player.y, enemy.x - this.player.x);
                let diff = enemyAng - facingAngle;
                while (diff > Math.PI) diff -= Math.PI * 2;
                while (diff < -Math.PI) diff += Math.PI * 2;

                if (Math.abs(diff) <= halfArcRad + 0.15) {
                  const critChance = (this.getPassiveLevel('wolf_fang') * 0.07) + 0.05;
                  const isCrit = Math.random() < critChance;
                  const finalDmg = baseDamage * 0.9 * (isCrit ? 2.0 : 1.0);

                  this.damageEnemy(enemy, finalDmg, '#c084fc', isCrit);
                  this.addParticleBurst(enemy.x, enemy.y, '#c084fc', 6);
                  returnHitIds.push(enemy.id);
                }
              }
            }

            this.projectiles.push({
              id: ++this.projectileIdCounter,
              x: this.player.x,
              y: this.player.y,
              vx: 0,
              vy: 0,
              radius: slashRange * 1.05,
              damage: baseDamage * 0.9,
              lifeMs: 180,
              maxLifeMs: 180,
              color: '#c084fc',
              pierceCount: 999,
              weaponType: 'silver_decapitator',
              startAngle: startAng,
              endAngle: endAng,
              extraEffect: 'return_slash',
              hitEnemyIds: returnHitIds,
            });
          }, 130);
        }
        break;
      }

      case 'decoy': {
        sound.playMagic();
        const facingAngle = this.player.facingAngle;

        let decoyHp = 200;
        if (wInst.level >= 2) decoyHp *= 2;
        if (wInst.level >= 4) decoyHp *= 2;

        const durationMs = (20 + (wInst.level - 1) * 5) * 1000;

        const ang1 = facingAngle + Math.PI / 2;
        const x1 = this.player.x + Math.cos(ang1) * 50;
        const y1 = this.player.y + Math.sin(ang1) * 50;

        this.decoys.push({
          id: ++this.decoyIdCounter,
          x: x1,
          y: y1,
          hp: decoyHp,
          maxHp: decoyHp,
          radius: 18,
          level: wInst.level,
          createdAt: Date.now(),
          durationMs,
        });
        this.addParticleBurst(x1, y1, '#34d399', 10);

        if (wInst.level >= 3) {
          const ang2 = facingAngle - Math.PI / 2;
          const x2 = this.player.x + Math.cos(ang2) * 50;
          const y2 = this.player.y + Math.sin(ang2) * 50;

          this.decoys.push({
            id: ++this.decoyIdCounter,
            x: x2,
            y: y2,
            hp: decoyHp,
            maxHp: decoyHp,
            radius: 18,
            level: wInst.level,
            createdAt: Date.now(),
            durationMs,
          });
          this.addParticleBurst(x2, y2, '#34d399', 10);
        }
        break;
      }

      case 'lightning_rod': {
        sound.playMagic();
        const range = effectiveRange;
        const primary = this.getClosestEnemy();
        if (!primary) break;

        const distToPrimary = Math.hypot(primary.x - this.player.x, primary.y - this.player.y);
        if (distToPrimary > range + primary.radius) break;

        const maxTargets = wInst.level >= 5 ? 8 : 2 + wInst.level;

        const hitEnemies: Enemy[] = [];
        const chainPoints: Array<{ x: number; y: number }> = [{ x: this.player.x, y: this.player.y }];

        let currentTarget: Enemy | null = primary;

        while (currentTarget && hitEnemies.length < maxTargets) {
          hitEnemies.push(currentTarget);
          chainPoints.push({ x: currentTarget.x, y: currentTarget.y });

          const critChance = (this.getPassiveLevel('wolf_fang') * 0.07) + 0.05;
          const isCrit = Math.random() < critChance;
          const finalDmg = baseDamage * (isCrit ? 2.0 : 1.0);

          this.damageEnemy(currentTarget, finalDmg, '#fef08a', isCrit);
          currentTarget.isElectrified = true;
          currentTarget.electrifiedTimer = 4.0;
          this.addParticleBurst(currentTarget.x, currentTarget.y, '#fef08a', 5);

          let nextTarget: Enemy | null = null;
          let nextDist = Infinity;

          for (const enemy of this.enemies) {
            if (hitEnemies.includes(enemy)) continue;
            const d = Math.hypot(enemy.x - currentTarget.x, enemy.y - currentTarget.y);
            if (d <= 250 + enemy.radius && d < nextDist) {
              nextDist = d;
              nextTarget = enemy;
            }
          }

          currentTarget = nextTarget;
        }

        if (chainPoints.length > 1) {
          this.lightningVisuals.push({
            points: chainPoints,
            lifeMs: 200,
            maxLifeMs: 200,
          });
        }
        break;
      }

      case 'searing_gloves': {
        sound.playMagic();
        const facingAngle = this.player.facingAngle;
        const flameRange = 200 * (1 + (wInst.level - 1) * 0.1);

        const c1Start = facingAngle + (300 * Math.PI) / 180;
        const c1End = facingAngle + (315 * Math.PI) / 180;

        const c2Start = facingAngle + (45 * Math.PI) / 180;
        const c2End = facingAngle + (60 * Math.PI) / 180;

        const checkConeHit = (sAng: number, eAng: number): number[] => {
          const midAng = (sAng + eAng) / 2;
          const halfWidth = Math.abs(eAng - sAng) / 2 + 0.05;
          const hitList: number[] = [];

          for (const enemy of this.enemies) {
            const dist = Math.hypot(enemy.x - this.player.x, enemy.y - this.player.y);
            if (dist <= flameRange + enemy.radius) {
              const enemyAng = Math.atan2(enemy.y - this.player.y, enemy.x - this.player.x);
              let diff = enemyAng - midAng;
              while (diff > Math.PI) diff -= Math.PI * 2;
              while (diff < -Math.PI) diff += Math.PI * 2;

              if (Math.abs(diff) <= halfWidth) {
                const critChance = (this.getPassiveLevel('wolf_fang') * 0.07) + 0.05;
                const isCrit = Math.random() < critChance;
                const finalDmg = baseDamage * (isCrit ? 2.0 : 1.0);

                this.damageEnemy(enemy, finalDmg, '#f97316', isCrit);
                enemy.isBurning = true;
                enemy.burnTimerMs = 3000;
                enemy.burnDamagePerTick = 12 * (1 + (wInst.level - 1) * 0.2);
                this.addParticleBurst(enemy.x, enemy.y, '#f97316', 5);
                hitList.push(enemy.id);
              }
            }
          }
          return hitList;
        };

        const hit1 = checkConeHit(c1Start, c1End);
        const hit2 = checkConeHit(c2Start, c2End);

        this.projectiles.push({
          id: ++this.projectileIdCounter,
          x: this.player.x,
          y: this.player.y,
          vx: 0,
          vy: 0,
          radius: flameRange,
          damage: baseDamage,
          lifeMs: 250,
          maxLifeMs: 250,
          color: '#f97316',
          pierceCount: 999,
          weaponType: 'searing_gloves',
          startAngle: c1Start,
          endAngle: c1End,
          hitEnemyIds: hit1,
        });

        this.projectiles.push({
          id: ++this.projectileIdCounter,
          x: this.player.x,
          y: this.player.y,
          vx: 0,
          vy: 0,
          radius: flameRange,
          damage: baseDamage,
          lifeMs: 250,
          maxLifeMs: 250,
          color: '#f97316',
          pierceCount: 999,
          weaponType: 'searing_gloves',
          startAngle: c2Start,
          endAngle: c2End,
          hitEnemyIds: hit2,
        });
        break;
      }
    }
  }

  private rebuildEnemyGrid() {
    for (const list of this.enemyGrid.values()) {
      list.length = 0;
    }
    const cellSize = 128;
    for (let i = 0; i < this.enemies.length; i++) {
      const enemy = this.enemies[i];
      const cx = Math.floor(enemy.x / cellSize);
      const cy = Math.floor(enemy.y / cellSize);
      const key = (cx + 10000) * 20000 + (cy + 10000);
      let list = this.enemyGrid.get(key);
      if (!list) {
        list = [];
        this.enemyGrid.set(key, list);
      }
      list.push(enemy);
    }
  }

  private getEnemiesInRadius(x: number, y: number, radius: number): Enemy[] {
    const cellSize = 128;
    const minCx = Math.floor((x - radius - 40) / cellSize);
    const maxCx = Math.floor((x + radius + 40) / cellSize);
    const minCy = Math.floor((y - radius - 40) / cellSize);
    const maxCy = Math.floor((y + radius + 40) / cellSize);

    const result: Enemy[] = [];

    for (let cx = minCx; cx <= maxCx; cx++) {
      for (let cy = minCy; cy <= maxCy; cy++) {
        const key = (cx + 10000) * 20000 + (cy + 10000);
        const list = this.enemyGrid.get(key);
        if (list) {
          for (let i = 0; i < list.length; i++) {
            const e = list[i];
            const dx = e.x - x;
            const dy = e.y - y;
            const maxR = radius + e.radius;
            if (dx * dx + dy * dy <= maxR * maxR) {
              result.push(e);
            }
          }
        }
      }
    }
    return result;
  }

  private getClosestEnemy(): Enemy | null {
    let candidates = this.getEnemiesInRadius(this.player.x, this.player.y, 400);
    if (candidates.length === 0) {
      candidates = this.getEnemiesInRadius(this.player.x, this.player.y, 1000);
    }
    if (candidates.length === 0) {
      candidates = this.enemies;
    }

    let closest: Enemy | null = null;
    let minDistSq = Infinity;

    for (let i = 0; i < candidates.length; i++) {
      const enemy = candidates[i];
      const dx = enemy.x - this.player.x;
      const dy = enemy.y - this.player.y;
      const distSq = dx * dx + dy * dy;
      if (distSq < minDistSq) {
        minDistSq = distSq;
        closest = enemy;
      }
    }

    return closest;
  }

  public isHeadbuttArcActive(): boolean {
    const headbuttInst = this.activeWeapons.find((w) => w.id === 'wolven_headbutt');
    if (!headbuttInst || this.player.form !== 'werewolf') return false;

    const chargeTimes = [2000, 1600, 1300, 1000, 700];
    const requiredChargeMs = chargeTimes[Math.min(headbuttInst.level - 1, chargeTimes.length - 1)];

    return this.playerMovementDurationMs >= requiredChargeMs;
  }

  private updateWolvenHeadbutt(dt: number) {
    const headbuttInst = this.activeWeapons.find((w) => w.id === 'wolven_headbutt');
    if (!headbuttInst || this.player.form !== 'werewolf') {
      this.playerMovementDurationMs = 0;
      this.headbuttGraceMs = 0;
      this.headbuttHitCooldowns.clear();
      return;
    }

    // Determine movement input
    let inputX = this.joystick.vectorX;
    let inputY = this.joystick.vectorY;

    if (this.keys['w'] || this.keys['arrowup']) inputY -= 1;
    if (this.keys['s'] || this.keys['arrowdown']) inputY += 1;
    if (this.keys['a'] || this.keys['arrowleft']) inputX -= 1;
    if (this.keys['d'] || this.keys['arrowright']) inputX += 1;

    const isMoving = Math.hypot(inputX, inputY) > 0 && !this.slashingDashState?.active;

    if (!isMoving) {
      if (this.headbuttGraceMs > 0) {
        this.headbuttGraceMs -= dt * 1000;
        if (this.headbuttGraceMs <= 0) {
          this.headbuttGraceMs = 0;
          this.playerMovementDurationMs = 0;
          this.headbuttHitCooldowns.clear();
          return;
        }
      } else {
        this.playerMovementDurationMs = 0;
        this.headbuttHitCooldowns.clear();
        return;
      }
    } else {
      // Player is moving: consume grace period and accumulate charge
      this.headbuttGraceMs = 0;
      this.playerMovementDurationMs += dt * 1000;
    }

    const chargeTimes = [2000, 1600, 1300, 1000, 700];
    const requiredChargeMs = chargeTimes[Math.min(headbuttInst.level - 1, chargeTimes.length - 1)];

    // If still charging up speed, emit trail particles
    if (this.playerMovementDurationMs < requiredChargeMs) {
      const chargeProgress = this.playerMovementDurationMs / requiredChargeMs;
      if (Math.random() < chargeProgress * 0.4) {
        const backAngle = this.player.facingAngle + Math.PI + (Math.random() - 0.5) * 0.8;
        this.spawnParticle(
          this.player.x + Math.cos(backAngle) * 10,
          this.player.y + Math.sin(backAngle) * 10,
          Math.cos(backAngle) * (1.5 + Math.random() * 2),
          Math.sin(backAngle) * (1.5 + Math.random() * 2),
          2 + Math.random() * 2,
          '#d97706',
          0.06
        );
      }
      return;
    }

    // ARC IS ACTIVE!
    const def = WEAPONS['wolven_headbutt'];
    const metaDamage = 1 + (this.persistentData.metaUpgrades.damage || 0) * 0.08;
    const formMult = 1.5; // Werewolf physical boost
    const levelDamageScale = 1 + (headbuttInst.level - 1) * 0.35;
    const baseDamage = def.baseDamage * levelDamageScale * metaDamage * formMult * this.getPlayerDamageMultiplier();

    const pushbackDistances = [40, 60, 80, 110, 150];
    const pushbackDist = pushbackDistances[Math.min(headbuttInst.level - 1, pushbackDistances.length - 1)];

    const arcRadius = 25;
    const halfArcAngle = Math.PI / 4; // 45 degrees
    const facingAngle = this.player.facingAngle;

    // Decay cooldowns
    for (const [enemyId, cd] of this.headbuttHitCooldowns.entries()) {
      const updated = cd - dt;
      if (updated <= 0) {
        this.headbuttHitCooldowns.delete(enemyId);
      } else {
        this.headbuttHitCooldowns.set(enemyId, updated);
      }
    }

    // Emit glowing brown/orange arc particles
    if (Math.random() < 0.6) {
      const randAngle = facingAngle + (Math.random() - 0.5) * (Math.PI / 2);
      this.spawnParticle(
        this.player.x + Math.cos(randAngle) * arcRadius,
        this.player.y + Math.sin(randAngle) * arcRadius,
        Math.cos(randAngle) * 2,
        Math.sin(randAngle) * 2,
        2.5 + Math.random() * 2,
        Math.random() < 0.5 ? '#d97706' : '#f97316',
        0.08
      );
    }

    // Check enemy collision with arc
    const candidates = this.getEnemiesInRadius(this.player.x, this.player.y, arcRadius + 40);
    let triggeredHit = false;

    for (const enemy of candidates) {
      const dx = enemy.x - this.player.x;
      const dy = enemy.y - this.player.y;
      const dist = Math.hypot(dx, dy);

      if (dist <= arcRadius + enemy.radius) {
        const enemyAngle = Math.atan2(dy, dx);
        let diffAngle = enemyAngle - facingAngle;
        while (diffAngle > Math.PI) diffAngle -= Math.PI * 2;
        while (diffAngle < -Math.PI) diffAngle += Math.PI * 2;

        if (Math.abs(diffAngle) <= halfArcAngle + 0.15) {
          if (!this.headbuttHitCooldowns.has(enemy.id)) {
            this.headbuttHitCooldowns.set(enemy.id, 0.25);
            triggeredHit = true;

            const wolfFang = this.activePassives.find((pas) => pas.id === 'wolf_fang');
            const critChance = (wolfFang ? wolfFang.level * 0.07 : 0) + 0.05;
            const isCrit = Math.random() < critChance;
            const finalDamage = baseDamage * (isCrit ? 2.0 : 1.0);

            this.damageEnemy(enemy, finalDamage, '#d97706', isCrit);
            this.addParticleBurst(enemy.x, enemy.y, '#f97316', 6);
          }
        }
      }
    }

    if (triggeredHit) {
      sound.playHit();
      // Push back all enemies in a 90° cone within 50px of player
      const coneTargets = this.getEnemiesInRadius(this.player.x, this.player.y, 50 + 20);
      for (const enemy of coneTargets) {
        const dx = enemy.x - this.player.x;
        const dy = enemy.y - this.player.y;
        const dist = Math.hypot(dx, dy);
        if (dist <= 50 + enemy.radius) {
          const enemyAngle = Math.atan2(dy, dx);
          let diffAngle = enemyAngle - facingAngle;
          while (diffAngle > Math.PI) diffAngle -= Math.PI * 2;
          while (diffAngle < -Math.PI) diffAngle += Math.PI * 2;

          if (Math.abs(diffAngle) <= halfArcAngle + 0.2) {
            const normX = dist > 0 ? dx / dist : Math.cos(facingAngle);
            const normY = dist > 0 ? dy / dist : Math.sin(facingAngle);

            enemy.x += normX * pushbackDist;
            enemy.y += normY * pushbackDist;

            this.addParticleBurst(enemy.x, enemy.y, '#d97706', 4);
          }
        }
      }
    }
  }

  private updateEnemies(dt: number) {
    for (let i = this.enemies.length - 1; i >= 0; i--) {
      const enemy = this.enemies[i];

      // Handle freezing
      if (enemy.isFrozen && enemy.frozenTimer) {
        enemy.frozenTimer -= dt;
        if (enemy.frozenTimer <= 0) {
          enemy.isFrozen = false;
          delete enemy.freezeAngle;
        } else {
          // Frozen enemies do not move
          continue;
        }
      }

      // Handle ignite burn damage over time
      if (enemy.isIgnited && enemy.igniteTimer) {
        enemy.igniteTimer -= dt;
        this.damageEnemy(enemy, 5 * dt, '#f97316', false);
        if (enemy.igniteTimer <= 0) {
          enemy.isIgnited = false;
        }
      }

      // Handle Burning Steps status effect (3 damage every 200ms for 5 seconds)
      if (enemy.isBurning && enemy.burnTimerMs !== undefined) {
        enemy.burnTimerMs -= dt * 1000;
        enemy.burnTickTimerMs = (enemy.burnTickTimerMs || 0) + dt * 1000;

        // Red/yellow flame particle effect emitting from burning enemy
        if (Math.random() < 0.4) {
          this.spawnParticle(
            enemy.x + (Math.random() - 0.5) * enemy.radius * 1.2,
            enemy.y + (Math.random() - 0.5) * enemy.radius * 1.2,
            (Math.random() - 0.5) * 1.5,
            -Math.random() * 2 - 1,
            2 + Math.random() * 2.5,
            Math.random() < 0.6 ? '#f97316' : '#eab308',
            0.05
          );
        }

        if (enemy.burnTickTimerMs >= 200) {
          enemy.burnTickTimerMs -= 200;
          const burnDmg = enemy.burnDamagePerTick || 3;
          this.damageEnemy(enemy, burnDmg, '#f97316', false);
        }

        if (enemy.burnTimerMs <= 0) {
          enemy.isBurning = false;
        }
      }

      // Hit flash effect countdown
      if (enemy.hitFlashTimer && enemy.hitFlashTimer > 0) {
        enemy.hitFlashTimer -= dt;
      }

      // Attack cooldown timer countdown
      if (enemy.attackCooldownTimer && enemy.attackCooldownTimer > 0) {
        enemy.attackCooldownTimer -= dt;
      }

      // Spiky Enemy 5s out / 5s in cycle
      if (enemy.isSpiky) {
        enemy.spikeCycleTimer = ((enemy.spikeCycleTimer || 0) + dt) % 10;
        enemy.spikesOut = enemy.spikeCycleTimer < 5;
      }

      // Net Thrower Enemy AI
      if (enemy.isNetThrower) {
        enemy.netCooldownTimer = (enemy.netCooldownTimer || 0) - dt;
        if (enemy.netCooldownTimer <= 0) {
          const distToP = Math.hypot(this.player.x - enemy.x, this.player.y - enemy.y);
          if (distToP <= 380) {
            let targetX = this.player.x;
            let targetY = this.player.y;

            let pVx = 0;
            let pVy = 0;
            if (this.keys['w'] || this.keys['arrowup']) pVy -= 1;
            if (this.keys['s'] || this.keys['arrowdown']) pVy += 1;
            if (this.keys['a'] || this.keys['arrowleft']) pVx -= 1;
            if (this.keys['d'] || this.keys['arrowright']) pVx += 1;
            if (this.joystick.active) {
              pVx += this.joystick.vectorX;
              pVy += this.joystick.vectorY;
            }
            const pLen = Math.hypot(pVx, pVy);
            if (pLen > 0.1) {
              const leadDist = 120;
              targetX += (pVx / pLen) * leadDist;
              targetY += (pVy / pLen) * leadDist;
            }

            const distToTarg = Math.hypot(targetX - enemy.x, targetY - enemy.y);
            const durationMs = Math.max(350, Math.min(750, (distToTarg / 350) * 1000));

            this.flyingNets.push({
              id: Math.random(),
              startX: enemy.x,
              startY: enemy.y,
              targetX,
              targetY,
              currentX: enemy.x,
              currentY: enemy.y,
              progress: 0,
              durationMs,
              elapsedMs: 0,
              rotation: Math.random() * Math.PI * 2,
            });

            this.addParticleBurst(enemy.x, enemy.y, '#ca8a04', 8);
            enemy.netCooldownTimer = 4.5 + Math.random() * 1.5;
          }
        }
      }

      // Offscreen Throttling: If significantly offscreen (>2000px), only update pathing/position once per second
      const isOffscreen = isOutsideDistance(this.player.x, this.player.y, enemy.x, enemy.y, GameEngine.OFFSCREEN_THROTTLE_DIST);
      if (isOffscreen) {
        enemy.offscreenAccDt = (enemy.offscreenAccDt || 0) + dt;
        if (enemy.offscreenAccDt < 1.0) {
          continue; // Throttle: skip heavy checks and fine step this frame
        }
      }

      const moveDt = (isOffscreen && enemy.offscreenAccDt) ? enemy.offscreenAccDt : dt;
      if (isOffscreen) {
        enemy.offscreenAccDt = 0;
      }

      const distToPlayer = Math.hypot(this.player.x - enemy.x, this.player.y - enemy.y);

      // Check Decoy taunt
      let targetDecoy: Decoy | null = null;
      let minDistToDecoy = Infinity;
      for (const d of this.decoys) {
        if (d.hp <= 0) continue;
        const distD = Math.hypot(d.x - enemy.x, d.y - enemy.y);
        if (distD < minDistToDecoy) {
          minDistToDecoy = distD;
          targetDecoy = d;
        }
      }

      // Enemies closer to a decoy than the player will be drawn to and attack the decoy instead of the player
      if (targetDecoy && minDistToDecoy < distToPlayer) {
        const dx = targetDecoy.x - enemy.x;
        const dy = targetDecoy.y - enemy.y;
        if (minDistToDecoy > 0) {
          const normX = dx / minDistToDecoy;
          const normY = dy / minDistToDecoy;
          enemy.x += normX * enemy.speed * 60 * moveDt;
          enemy.y += normY * enemy.speed * 60 * moveDt;
        }

        if (minDistToDecoy < enemy.radius + targetDecoy.radius) {
          if (!enemy.attackCooldownTimer || enemy.attackCooldownTimer <= 0) {
            targetDecoy.hp -= enemy.damage;
            enemy.attackCooldownTimer = 1.0;
            this.addParticleBurst(targetDecoy.x, targetDecoy.y, '#34d399', 4);
          }
        }
      } else {
        // Move toward player
        const dx = this.player.x - enemy.x;
        const dy = this.player.y - enemy.y;
        const dist = Math.hypot(dx, dy);

        if (dist > 0) {
          const normX = dx / dist;
          const normY = dy / dist;
          enemy.x += normX * enemy.speed * 60 * moveDt;
          enemy.y += normY * enemy.speed * 60 * moveDt;
        }

        // Collision with Player
        if (dist < enemy.radius + this.player.radius) {
          const enemyAngle = Math.atan2(enemy.y - this.player.y, enemy.x - this.player.x);
          let diffAngle = enemyAngle - this.player.facingAngle;
          while (diffAngle > Math.PI) diffAngle -= Math.PI * 2;
          while (diffAngle < -Math.PI) diffAngle += Math.PI * 2;

          const isBlockedByHeadbutt = this.isHeadbuttArcActive() && (Math.abs(diffAngle) <= Math.PI / 4 + 0.25 || dist <= 30 + enemy.radius);

          if (this.humanShieldTimer > 0 || (this.transitionState.active && this.transitionState.type === 'to_day') || isBlockedByHeadbutt) {
            // Repel enemy off shield / headbutt arc
            if (dist > 0) {
              const normX = dx / dist;
              const normY = dy / dist;
              enemy.x = this.player.x - normX * (enemy.radius + this.player.radius + 35);
              enemy.y = this.player.y - normY * (enemy.radius + this.player.radius + 35);
            }
            enemy.attackCooldownTimer = 1.0;
            this.addParticleBurst(enemy.x, enemy.y, isBlockedByHeadbutt ? '#d97706' : '#38bdf8', 5);
            if (isBlockedByHeadbutt) sound.playHit();
            else sound.playBlock();
          } else if (this.player.invincibleTimer <= 0 && (!enemy.attackCooldownTimer || enemy.attackCooldownTimer <= 0)) {
            this.takePlayerDamage(enemy.damage);
            enemy.attackCooldownTimer = 1.5; // Individual enemy attack cooldown

            // Knock enemy back away from player on impact so they do not overlap
            if (dist > 0) {
              const normX = dx / dist;
              const normY = dy / dist;
              enemy.x = this.player.x - normX * (enemy.radius + this.player.radius + 40);
              enemy.y = this.player.y - normY * (enemy.radius + this.player.radius + 40);
            }
          }
        }
      }
    }
  }

  private updateDecoys(dt: number) {
    const now = Date.now();
    for (let i = this.decoys.length - 1; i >= 0; i--) {
      const d = this.decoys[i];
      const isExpired = (now - d.createdAt) >= d.durationMs;
      if (d.hp <= 0 || isExpired) {
        if (d.level >= 5) {
          sound.playExplosion();
          const explodeDmg = 200 * this.getPlayerDamageMultiplier();
          const targets = this.getEnemiesInRadius(d.x, d.y, 200);
          for (let j = 0; j < targets.length; j++) {
            const enemy = targets[j];
            const dist = Math.hypot(enemy.x - d.x, enemy.y - d.y);
            if (dist <= 200 + enemy.radius) {
              this.damageEnemy(enemy, explodeDmg, '#f97316', true);
              this.addParticleBurst(enemy.x, enemy.y, '#f97316', 8);
            }
          }
          this.addParticleBurst(d.x, d.y, '#f97316', 25);
        }
        this.decoys[i] = this.decoys[this.decoys.length - 1];
        this.decoys.pop();
      }
    }
  }

  private updateMeditationMat(dt: number) {
    const medLvl = this.getPassiveLevel('meditation_mat');
    if (medLvl <= 0 || this.player.form !== 'human') {
      this.meditationTimerMs = 0;
      this.lastPlayerX = this.player.x;
      this.lastPlayerY = this.player.y;
      return;
    }

    const moved = Math.hypot(this.player.x - this.lastPlayerX, this.player.y - this.lastPlayerY) > 0.3;
    this.lastPlayerX = this.player.x;
    this.lastPlayerY = this.player.y;

    const enemyNearby = this.getEnemiesInRadius(this.player.x, this.player.y, 100).length > 0;

    if (moved || enemyNearby) {
      this.meditationTimerMs = 0;
    } else {
      this.meditationTimerMs += dt * 1000;
      while (this.meditationTimerMs >= 1000) {
        this.meditationTimerMs -= 1000;
        const healPercent = 0.05 * medLvl;
        const healHp = Math.round(this.player.maxHp * healPercent);
        if (this.player.hp < this.player.maxHp) {
          this.player.hp = Math.min(this.player.maxHp, this.player.hp + healHp);
          this.spawnDamageNumber(this.player.x, this.player.y - 25, `+${healHp} HP`, '#4ade80', false);
          this.addParticleBurst(this.player.x, this.player.y, '#4ade80', 8);
        }
      }
    }
  }

  private takePlayerDamage(damage: number) {
    if (this.humanShieldTimer > 0 || (this.transitionState.active && this.transitionState.type === 'to_day')) {
      sound.playBlock();
      this.addParticleBurst(this.player.x, this.player.y, '#38bdf8', 8);
      return;
    }

    const armorLevel = this.activePassives.find((p) => p.id === 'silver_armor')?.level || 0;
    const armorReduction = armorLevel * 0.08;
    const formDefense = this.player.form === 'werewolf' ? 0.85 : 1.0; // Werewolf takes -15% damage

    const finalDamage = Math.max(1, Math.round(damage * (1 - armorReduction) * formDefense));

    this.player.hp -= finalDamage;
    this.player.invincibleTimer = 0.5; // 0.5s invincibility frames

    sound.playPlayerHurt();
    vibratePlayerDamage();

    this.spawnDamageNumber(this.player.x, this.player.y - 20, `-${finalDamage}`, '#ef4444', false);

    // Screen Shake Effect
    this.addParticleBurst(this.player.x, this.player.y, '#dc2626', 12);

    if (this.player.hp <= 0) {
      if (this.player.revivesLeft > 0) {
        this.player.revivesLeft -= 1;
        this.player.hp = Math.round(this.player.maxHp * 0.5);
        this.player.invincibleTimer = 2.0;
        sound.playLevelUp();
        vibrateTransformation();
        this.spawnDamageNumber(this.player.x, this.player.y - 30, 'REVIVED!', '#38bdf8', true);
      } else {
        this.gameOver();
      }
    }
  }

  private healPlayer(amount: number) {
    if (this.player.hp >= this.player.maxHp) return;
    this.player.hp = Math.min(this.player.maxHp, this.player.hp + amount);
    this.healAccumulator += amount;
    if (this.healAccumulator >= 1.0) {
      const healToShow = Math.floor(this.healAccumulator);
      this.healAccumulator -= healToShow;
      this.spawnDamageNumber(this.player.x, this.player.y - 25, `+${healToShow}`, '#22c55e', false);
    }
  }

  private updateProjectiles(dt: number) {
    for (let i = this.projectiles.length - 1; i >= 0; i--) {
      const p = this.projectiles[i];

      p.lifeMs -= dt * 1000;
      if (p.lifeMs <= 0) {
        this.projectiles[i] = this.projectiles[this.projectiles.length - 1];
        this.projectiles.pop();
        continue;
      }

      // Move stationary vs moving projectiles
      p.x += p.vx * 60 * dt;
      p.y += p.vy * 60 * dt;

      // Keep stationary aura/claws/slashes attached to player
      if (
        p.weaponType === 'blood_ring' ||
        p.weaponType === 'werewolf_claws' ||
        p.weaponType === 'tail_sweep' ||
        p.weaponType === 'silver_decapitator' ||
        p.weaponType === 'searing_gloves'
      ) {
        p.x = this.player.x;
        p.y = this.player.y;
      }

      // Update Werewolf Claws angles dynamically to follow player facing direction
      if (p.weaponType === 'werewolf_claws' && p.hand && p.startAngle !== undefined && p.endAngle !== undefined) {
        const wInst = this.activeWeapons.find((w) => w.id === 'werewolf_claws');
        const level = wInst ? wInst.level : 1;
        const levelArcBonus = (level - 1) * 6;

        if (p.hand === 'right') {
          const relStart = 0;
          const relEnd = (70 + levelArcBonus) * (Math.PI / 180);
          p.startAngle = this.player.facingAngle + relStart;
          p.endAngle = this.player.facingAngle + relEnd;
        } else {
          const relStart = 0;
          const relEnd = (-70 - levelArcBonus) * (Math.PI / 180);
          p.startAngle = this.player.facingAngle + relStart;
          p.endAngle = this.player.facingAngle + relEnd;
        }
      }

      // Collision with Enemies
      const candidates = this.getEnemiesInRadius(p.x, p.y, p.radius);
      for (let j = 0; j < candidates.length; j++) {
        const enemy = candidates[j];
        if (p.hitEnemyIds && p.hitEnemyIds.includes(enemy.id)) {
          continue; // Skip if this projectile instance already hit this enemy
        }

        const dist = Math.hypot(enemy.x - p.x, enemy.y - p.y);
        if (dist < enemy.radius + p.radius) {
          // Additional distance & angle check for Werewolf Claws
          if (p.weaponType === 'werewolf_claws') {
            if (p.innerRadius && dist < p.innerRadius - enemy.radius) {
              continue;
            }
            if (p.startAngle !== undefined && p.endAngle !== undefined) {
              const enemyAngle = Math.atan2(enemy.y - p.y, enemy.x - p.x);
              let relAngle = enemyAngle - this.player.facingAngle;
              while (relAngle > Math.PI) relAngle -= Math.PI * 2;
              while (relAngle < -Math.PI) relAngle += Math.PI * 2;

              let relStart = p.startAngle - this.player.facingAngle;
              let relEnd = p.endAngle - this.player.facingAngle;
              while (relStart > Math.PI) relStart -= Math.PI * 2;
              while (relStart < -Math.PI) relStart += Math.PI * 2;
              while (relEnd > Math.PI) relEnd -= Math.PI * 2;
              while (relEnd < -Math.PI) relEnd += Math.PI * 2;

              const minAng = Math.min(relStart, relEnd) - 0.15;
              const maxAng = Math.max(relStart, relEnd) + 0.15;

              if (relAngle < minAng || relAngle > maxAng) {
                continue; // Outside claw slash arc range
              }
            }
          }

          // Angle check for Tail Sweep (120-degree rear arc behind player)
          if (p.weaponType === 'tail_sweep') {
            const enemyAngle = Math.atan2(enemy.y - p.y, enemy.x - p.x);
            const centerAngle = p.startAngle !== undefined && p.endAngle !== undefined
              ? (p.startAngle + p.endAngle) / 2
              : this.player.facingAngle + Math.PI;
            let diff = enemyAngle - centerAngle;
            while (diff > Math.PI) diff -= Math.PI * 2;
            while (diff < -Math.PI) diff += Math.PI * 2;
            if (Math.abs(diff) > (Math.PI / 3) + 0.15) {
              continue; // Outside tail sweep rear arc
            }
          }

          // Angle check for Silver Decapitator (80-degree frontal arc)
          if (p.weaponType === 'silver_decapitator') {
            const enemyAngle = Math.atan2(enemy.y - p.y, enemy.x - p.x);
            const centerAngle = p.startAngle !== undefined && p.endAngle !== undefined
              ? (p.startAngle + p.endAngle) / 2
              : this.player.facingAngle;
            let diff = enemyAngle - centerAngle;
            while (diff > Math.PI) diff -= Math.PI * 2;
            while (diff < -Math.PI) diff += Math.PI * 2;
            const halfArc = (40 * Math.PI) / 180;
            if (Math.abs(diff) > halfArc + 0.15) {
              continue; // Outside silver decapitator frontal arc
            }
          }

          // Angle check for Searing Gloves (forward twin flame cones)
          if (p.weaponType === 'searing_gloves') {
            if (p.startAngle !== undefined && p.endAngle !== undefined) {
              const enemyAngle = Math.atan2(enemy.y - p.y, enemy.x - p.x);
              let midAng = (p.startAngle + p.endAngle) / 2;
              let halfWidth = Math.abs(p.endAngle - p.startAngle) / 2;
              let diff = enemyAngle - midAng;
              while (diff > Math.PI) diff -= Math.PI * 2;
              while (diff < -Math.PI) diff += Math.PI * 2;
              if (Math.abs(diff) > halfWidth + 0.15) {
                continue; // Outside searing gloves flame cone
              }
            }
          }

          // Angle cone check for Earth Shatter (cone from -30 deg to +30 deg in front)
          if (p.weaponType === 'earth_shatter' && p.startAngle !== undefined && p.endAngle !== undefined) {
            const enemyAngle = Math.atan2(enemy.y - p.y, enemy.x - p.x);
            const centerAngle = (p.startAngle + p.endAngle) / 2;
            let diff = enemyAngle - centerAngle;
            while (diff > Math.PI) diff -= Math.PI * 2;
            while (diff < -Math.PI) diff += Math.PI * 2;
            if (Math.abs(diff) > (Math.PI / 6) + 0.15) {
              continue; // Outside 60-degree forward cone
            }
          }
          // Check Critical Hit
          const wolfFang = this.activePassives.find((pas) => pas.id === 'wolf_fang');
          const critChance = (wolfFang ? wolfFang.level * 0.07 : 0) + 0.05;
          const isCrit = Math.random() < critChance;
          const damageMult = isCrit ? 2.0 : 1.0;
          let finalDmg = p.damage * damageMult;

          // **SYNERGY: Frost Shatter**
          if (p.canShatter && enemy.isFrozen) {
            finalDmg *= 3.0; // 3x Shatter Explosion damage!
            this.triggerShatterExplosion(enemy);
          }

          // **Blood Ring Lifesteal & SYNERGY: Vampiric Inferno**
          if (p.weaponType === 'blood_ring') {
            const bloodStoneLevel = this.getPassiveLevel('blood_stone');
            const baseLifesteal = 0.25 + bloodStoneLevel * 0.05;
            const lifestealMult = enemy.isIgnited ? 2.0 : 1.0; // Vampiric Inferno synergy doubles lifesteal!
            this.healPlayer(finalDmg * baseLifesteal * lifestealMult);
          }

          // Freeze / Ignite effects
          if (p.extraEffect === 'freeze') {
            enemy.isFrozen = true;
            enemy.frozenTimer = 2.5; // 2.5s freeze
          }
          if (p.canIgnite) {
            enemy.isIgnited = true;
            enemy.igniteTimer = 3.0;
          }

          this.damageEnemy(enemy, finalDmg, p.color, isCrit);
          if (!p.hitEnemyIds) {
            p.hitEnemyIds = [];
          }
          p.hitEnemyIds.push(enemy.id);
          p.pierceCount -= 1;

          if (p.pierceCount <= 0) {
            // **SYNERGY: Silver Tempest**
            if (p.weaponType === 'silver_crossbow' && this.hasSynergy('silver_storm')) {
              this.spawnDaggerBurst(p.x, p.y);
            }
            this.projectiles[i] = this.projectiles[this.projectiles.length - 1];
            this.projectiles.pop();
            break;
          }
        }
      }
    }
  }

  private updateFirePatches(dt: number) {
    for (let i = this.firePatches.length - 1; i >= 0; i--) {
      const patch = this.firePatches[i];
      patch.lifeMs -= dt * 1000;
      if (patch.lifeMs <= 0) {
        this.firePatches[i] = this.firePatches[this.firePatches.length - 1];
        this.firePatches.pop();
        continue;
      }

      // Burning steps particle effect: a few rising flame particles
      if (Math.random() < 0.25) {
        const angle = Math.random() * Math.PI * 2;
        const dist = Math.random() * patch.radius * 0.7;
        this.spawnParticle(
          patch.x + Math.cos(angle) * dist,
          patch.y + Math.sin(angle) * dist,
          (Math.random() - 0.5) * 1.2,
          -Math.random() * 2 - 0.8,
          1.8 + Math.random() * 2,
          Math.random() < 0.6 ? '#f97316' : '#fef08a',
          0.04
        );
      }

      const patchTargets = this.getEnemiesInRadius(patch.x, patch.y, patch.radius);
      for (let j = 0; j < patchTargets.length; j++) {
        const enemy = patchTargets[j];
        const dist = Math.hypot(enemy.x - patch.x, enemy.y - patch.y);
        if (dist < enemy.radius + patch.radius) {
          enemy.isBurning = true;
          enemy.burnTimerMs = 5000; // 5 seconds
          enemy.burnDamagePerTick = patch.damage;
        }
      }
    }
  }

  private updateGhostWolves(dt: number) {
    const wolfInst = this.activeWeapons.find((w) => w.id === 'wolf_pack');
    if (!wolfInst) {
      this.ghostWolves = [];
      return;
    }

    const desiredCount = 2 + wolfInst.level;
    while (this.ghostWolves.length < desiredCount) {
      this.ghostWolves.push({
        id: ++this.projectileIdCounter,
        x: this.player.x + (Math.random() - 0.5) * 60,
        y: this.player.y + (Math.random() - 0.5) * 60,
        vx: 0,
        vy: 0,
        angle: Math.random() * Math.PI * 2,
        state: 'orbit',
        chargeTimerMs: 0,
      });
    }

    for (const wolf of this.ghostWolves) {
      if (wolf.state === 'orbit') {
        const targetX = this.player.x + Math.cos(Date.now() * 0.002 + wolf.id) * 45;
        const targetY = this.player.y + Math.sin(Date.now() * 0.003 + wolf.id) * 45;
        wolf.x += (targetX - wolf.x) * 0.08;
        wolf.y += (targetY - wolf.y) * 0.08;
        wolf.angle = Math.atan2(targetY - wolf.y, targetX - wolf.x);
      } else if (wolf.state === 'queued') {
        // Orbit near player until trigger delay timer finishes
        const targetX = this.player.x + Math.cos(Date.now() * 0.002 + wolf.id) * 45;
        const targetY = this.player.y + Math.sin(Date.now() * 0.003 + wolf.id) * 45;
        wolf.x += (targetX - wolf.x) * 0.08;
        wolf.y += (targetY - wolf.y) * 0.08;
        wolf.angle = Math.atan2(targetY - wolf.y, targetX - wolf.x);

        wolf.triggerDelayMs = (wolf.triggerDelayMs || 0) - dt * 1000;
        if (wolf.triggerDelayMs <= 0) {
          wolf.state = 'charging';
          wolf.chargeTimerMs = 800;
          wolf.hasHit = false;
          const closestEnemy = this.getClosestEnemy();
          if (closestEnemy) {
            wolf.targetEnemyX = closestEnemy.x;
            wolf.targetEnemyY = closestEnemy.y;
          } else {
            wolf.targetEnemyX = this.player.x + Math.cos(this.player.facingAngle) * 200;
            wolf.targetEnemyY = this.player.y + Math.sin(this.player.facingAngle) * 200;
          }
        }
      } else if (wolf.state === 'charging') {
        wolf.chargeTimerMs -= dt * 1000;
        const tx = wolf.targetEnemyX ?? this.player.x;
        const ty = wolf.targetEnemyY ?? this.player.y;
        const angle = Math.atan2(ty - wolf.y, tx - wolf.x);
        wolf.angle = angle;
        wolf.x += Math.cos(angle) * 14;
        wolf.y += Math.sin(angle) * 14;

        // Damage enemies on charge impact
        if (!wolf.hasHit) {
          for (const enemy of this.enemies) {
            if (Math.hypot(enemy.x - wolf.x, enemy.y - wolf.y) < enemy.radius + 18) {
              const def = WEAPONS['wolf_pack'];
              const baseDamage = (def ? def.baseDamage : 15) * (1 + (wolfInst.level - 1) * 0.25);
              this.damageEnemy(enemy, baseDamage, '#cbd5e1', false);
              wolf.hasHit = true;
              break;
            }
          }
        }

        const distToTarget = Math.hypot(tx - wolf.x, ty - wolf.y);
        if (wolf.hasHit || distToTarget < 18 || wolf.chargeTimerMs <= 0) {
          wolf.state = 'lingering';
          wolf.lingerTimerMs = 100; // Linger at attack position for 100ms
        }
      } else if (wolf.state === 'lingering') {
        wolf.lingerTimerMs = (wolf.lingerTimerMs || 0) - dt * 1000;
        if (wolf.lingerTimerMs <= 0) {
          wolf.state = 'orbit'; // Return to wolf idle zone near player
        }
      }
    }
  }

  private triggerShatterExplosion(enemy: Enemy) {
    sound.playShatter();
    vibrateCrit();
    this.addParticleBurst(enemy.x, enemy.y, '#38bdf8', 25);
    this.spawnDamageNumber(enemy.x, enemy.y - 20, 'SHATTER!', '#38bdf8', true);

    // Scatter 6 ice shards
    for (let i = 0; i < 6; i++) {
      const angle = (i / 6) * Math.PI * 2;
      this.projectiles.push({
        id: ++this.projectileIdCounter,
        x: enemy.x,
        y: enemy.y,
        vx: Math.cos(angle) * 9,
        vy: Math.sin(angle) * 9,
        radius: 7,
        damage: 25,
        lifeMs: 800,
        maxLifeMs: 800,
        color: '#38bdf8',
        pierceCount: 1,
        weaponType: 'frost_orb',
      });
    }
  }

  private spawnDaggerBurst(x: number, y: number) {
    for (let i = 0; i < 4; i++) {
      const angle = (i / 4) * Math.PI * 2;
      this.projectiles.push({
        id: ++this.projectileIdCounter,
        x,
        y,
        vx: Math.cos(angle) * 8,
        vy: Math.sin(angle) * 8,
        radius: 6,
        damage: 20,
        lifeMs: 800,
        maxLifeMs: 800,
        color: '#e2e8f0',
        pierceCount: 1,
        weaponType: 'silver_daggers',
      });
    }
  }

  private damageEnemy(
    enemy: Enemy,
    damage: number,
    color: string,
    isCrit: boolean,
    options?: { isMelee?: boolean; shieldMultiplier?: number; ignoreShield?: boolean }
  ) {
    let actualDamage = damage;

    // Handle Shield absorption
    if (enemy.shield && enemy.shield > 0 && !options?.ignoreShield) {
      const mult = options?.shieldMultiplier || 1.0;
      const shieldDmg = actualDamage * mult;

      if (enemy.shield >= shieldDmg) {
        enemy.shield -= shieldDmg;
        enemy.hitFlashTimer = 0.1;
        this.stats.damageDealt += actualDamage;
        vibrateHit();
        if (isCrit) vibrateCrit();
        this.spawnDamageNumber(enemy.x, enemy.y, Math.round(shieldDmg).toString(), '#38bdf8', isCrit);
        this.addParticleBurst(enemy.x, enemy.y, '#38bdf8', isCrit ? 8 : 4);
        this.checkSpikeRecoil(enemy, options);
        return;
      } else {
        const remainingShieldDmg = shieldDmg - enemy.shield;
        enemy.shield = 0;
        actualDamage = remainingShieldDmg / mult;
        this.addParticleBurst(enemy.x, enemy.y, '#0284c7', 12);
      }
    }

    enemy.hp -= actualDamage;
    enemy.hitFlashTimer = 0.1;
    this.stats.damageDealt += actualDamage;

    vibrateHit();
    if (isCrit) vibrateCrit();

    this.spawnDamageNumber(enemy.x, enemy.y, Math.round(actualDamage).toString(), isCrit ? '#facc15' : '#ffffff', isCrit);
    this.addParticleBurst(enemy.x, enemy.y, color, isCrit ? 8 : 4);

    this.checkSpikeRecoil(enemy, options);

    if (enemy.hp <= 0) {
      this.killEnemy(enemy);
    }
  }

  private checkSpikeRecoil(enemy: Enemy, options?: { isMelee?: boolean }) {
    if (enemy.isSpiky && enemy.spikesOut) {
      const dist = Math.hypot(this.player.x - enemy.x, this.player.y - enemy.y);
      const isClose = dist <= enemy.radius + this.player.radius + 40;

      if (options?.isMelee || isClose) {
        if (this.playerSpikeRecoilCooldown <= 0 && this.player.invincibleTimer <= 0) {
          this.playerSpikeRecoilCooldown = 0.25;
          const recoilDamage = 10;
          this.takePlayerDamage(recoilDamage);
          this.spawnDamageNumber(this.player.x, this.player.y - 25, `-${recoilDamage}`, '#dc2626', true);
          this.addParticleBurst(this.player.x, this.player.y, '#dc2626', 10);
        }
      }
    }
  }

  private spawnGem(
    x: number,
    y: number,
    value: number,
    type: 'xp' | 'gold' | 'lunar_shard' | 'ichor_crystal' | 'meat',
    radius: number,
    color: string
  ) {
    const createdMinute = Math.floor(this.stats.timeSurvivedSeconds / 60);

    if (this.gems.length >= 90) {
      for (let i = 0; i < this.gems.length; i++) {
        const g = this.gems[i];
        if (g.type === type && Math.abs(g.x - x) < 180 && Math.abs(g.y - y) < 180) {
          g.value += value;
          g.createdMinute = Math.max(g.createdMinute ?? 0, createdMinute);
          return;
        }
      }
    }

    this.gems.push({
      id: ++this.gemIdCounter,
      x,
      y,
      value,
      type,
      radius,
      color,
      createdMinute,
    });
  }

  private killEnemy(enemy: Enemy) {
    const idx = this.enemies.indexOf(enemy);
    if (idx !== -1) {
      this.enemies[idx] = this.enemies[this.enemies.length - 1];
      this.enemies.pop();
      this.stats.kills += 1;
      this.recentKills.push(Date.now());
      if (this.recentKills.length > 100) {
        const now = Date.now();
        this.recentKills = this.recentKills.filter((t) => now - t <= 5000);
      }

      // Exploding Enemy AoE Blast upon dying
      if (enemy.isExploding) {
        const explodeRadius = 85;
        const explodeDamage = 30;

        this.addParticleBurst(enemy.x, enemy.y, '#ef4444', 25);
        this.addParticleBurst(enemy.x, enemy.y, '#f97316', 20);
        this.addParticleBurst(enemy.x, enemy.y, '#facc15', 15);
        sound.playHit();

        this.spawnDamageNumber(enemy.x, enemy.y - 10, 'BOOM!', '#ef4444', true);

        const distToPlayer = Math.hypot(this.player.x - enemy.x, this.player.y - enemy.y);
        if (distToPlayer <= explodeRadius + this.player.radius) {
          if (this.player.invincibleTimer <= 0) {
            this.takePlayerDamage(explodeDamage);
          }
        }

        for (const d of this.decoys) {
          if (d.hp > 0 && Math.hypot(d.x - enemy.x, d.y - enemy.y) <= explodeRadius + d.radius) {
            d.hp -= explodeDamage;
          }
        }
      }

      // Time multiplier: longer hunt = more drops
      const minutesSurvived = this.stats.timeSurvivedSeconds / 60;
      const goldTimeScaling = 1 + minutesSurvived * 0.25;
      const shardTimeScaling = 1 + minutesSurvived * 0.35;

      const metaGreed = 1 + (this.persistentData.metaUpgrades.greed || 0) * 0.2;
      const philRing = this.activePassives.find((p) => p.id === 'philosopher_ring');
      const ringMult = 1 + (philRing ? philRing.level * 0.25 : 0);
      const dropBonus = metaGreed * ringMult; // Affects Gold and Lunar Shards ONLY

      // 1. XP Drop
      const metaWisdom = 1 + (this.persistentData.metaUpgrades.wisdom || 0) * 0.15;
      const pendantXP = 1 + (this.getPassiveLevel('moon_pendant') * 0.2);
      const formXP = this.player.form === 'human' ? 1.5 : 1.0; // Human form drops +50% XP
      const xpVal = enemy.xpValue * metaWisdom * pendantXP * formXP;
      this.spawnGem(enemy.x, enemy.y, xpVal, 'xp', 7, '#38bdf8');

      // 2. Gold Coin Chance (from regular enemies & elites)
      if (Math.random() < enemy.goldChance * dropBonus) {
        const baseGold = 5 + Math.random() * 10;
        const goldVal = Math.floor(baseGold * goldTimeScaling * dropBonus);
        this.spawnGem(enemy.x + (Math.random() * 10 - 5), enemy.y + (Math.random() * 10 - 5), goldVal, 'gold', 8, '#facc15');
      }

      // 3. Elites drop Lunar Shards
      if (enemy.isElite) {
        const baseShards = 10;
        const shardVal = Math.floor(baseShards * shardTimeScaling * dropBonus);
        this.spawnGem(enemy.x, enemy.y, shardVal, 'lunar_shard', 11, '#c084fc');
      }

      // 4. Bosses drop Ichor Crystals (unaffected by Philosopher Ring or drop bonus)
      if (enemy.isBoss) {
        const baseCrystals = 8;
        this.spawnGem(enemy.x, enemy.y, baseCrystals, 'ichor_crystal', 13, '#ef4444');
      }
    }
  }

  private mergeNearbyGems() {
    const cellSize = 100;
    const mergedGems: Gem[] = [];
    const grid: Map<number, Gem> = new Map();

    for (let i = 0; i < this.gems.length; i++) {
      const g = this.gems[i];
      const cx = Math.floor(g.x / cellSize);
      const cy = Math.floor(g.y / cellSize);
      const key = (cx + 10000) * 20000 + (cy + 10000);

      const existing = grid.get(key);
      if (existing && existing.type === g.type) {
        existing.value += g.value;
        existing.createdMinute = Math.max(existing.createdMinute ?? 0, g.createdMinute ?? 0);
      } else {
        grid.set(key, g);
        mergedGems.push(g);
      }
    }

    this.gems = mergedGems;
  }

  private updateGems(dt: number) {
    // Minute-based despawning (at start of minute X, despawn gems from minute <= X - 3)
    const currentMinute = Math.floor(this.stats.timeSurvivedSeconds / 60);
    if (currentMinute > this.lastMinuteChecked) {
      this.lastMinuteChecked = currentMinute;
      const cutoffMinute = currentMinute - 3;
      if (cutoffMinute >= 0) {
        this.gems = this.gems.filter((g) => (g.createdMinute ?? 0) > cutoffMinute);
      }
    }

    // Merge pass if gems count is high
    if (this.gems.length > 80) {
      this.mergeNearbyGems();
    }

    const metaMagnet = 1 + (this.persistentData.metaUpgrades.magnet || 0) * 0.25;
    const moonPendant = this.activePassives.find((p) => p.id === 'moon_pendant');
    const pendantMagnet = 1 + (moonPendant ? moonPendant.level * 0.2 : 0);
    const formMagnet = this.player.form === 'human' ? 1.8 : 1.0; // Human form has 80% larger magnet radius

    const baseMagnetRadius = 130 * metaMagnet * pendantMagnet * formMagnet;
    const magSq = baseMagnetRadius * baseMagnetRadius;
    const playerRadius = this.player.radius;

    for (let i = this.gems.length - 1; i >= 0; i--) {
      const gem = this.gems[i];
      const dx = this.player.x - gem.x;
      const dy = this.player.y - gem.y;
      const distSq = dx * dx + dy * dy;

      if (distSq < magSq) {
        // Magnet attraction
        const dist = Math.sqrt(distSq) || 1;
        const speed = 12 * (1 - dist / baseMagnetRadius) + 4;
        gem.x += (dx / dist) * speed * 60 * dt;
        gem.y += (dy / dist) * speed * 60 * dt;
      }

      const hitDist = playerRadius + gem.radius;
      if (distSq < hitDist * hitDist) {
        sound.playGemPickup();

        if (gem.type === 'xp') {
          this.gainXP(gem.value);
        } else if (gem.type === 'gold') {
          this.stats.goldEarned += Math.round(gem.value);
        } else if (gem.type === 'lunar_shard') {
          const val = Math.round(gem.value);
          this.stats.lunarShardsEarned = (this.stats.lunarShardsEarned || 0) + val;
          this.persistentData.lunarShards += val;
        } else if (gem.type === 'ichor_crystal') {
          const val = Math.round(gem.value);
          this.stats.ichorCrystalsEarned = (this.stats.ichorCrystalsEarned || 0) + val;
          this.persistentData.ichorCrystals = (this.persistentData.ichorCrystals || 0) + val;
        }

        this.gems[i] = this.gems[this.gems.length - 1];
        this.gems.pop();
      }
    }
  }

  private gainXP(amount: number) {
    this.player.xp += amount;
    if (this.player.xp >= this.player.xpToNextLevel) {
      this.player.xp -= this.player.xpToNextLevel;
      this.player.level += 1;
      this.player.xpToNextLevel = Math.round(this.player.xpToNextLevel * 1.35);
      this.stats.maxLevel = Math.max(this.stats.maxLevel, this.player.level);

      sound.playLevelUp();
      vibrateLevelUp();

      this.triggerLevelUpMenu();
    }
  }

  private triggerLevelUpMenu() {
    this.pause();

    // Generate 3 choices
    const choices: Array<{ type: 'weapon' | 'passive'; id: string; level: number }> = [];

    // Weapon upgrade choices (filtered by form-exclusivity)
    const availableWeapons = Object.keys(WEAPONS).filter((id) => {
      const def = WEAPONS[id];
      if (def.formExclusive && def.formExclusive !== this.currentForm) return false;
      const active = this.activeWeapons.find((w) => w.id === id);
      return !active || active.level < def.maxLevel;
    });

    const availablePassives = Object.keys(PASSIVES).filter((id) => {
      const def = PASSIVES[id];
      if (def.formExclusive && def.formExclusive !== this.currentForm) return false;
      const active = this.activePassives.find((p) => p.id === id);
      return !active || active.level < def.maxLevel;
    });

    while (choices.length < 3 && (availableWeapons.length > 0 || availablePassives.length > 0)) {
      const isWeapon = Math.random() < 0.6;
      if (isWeapon && availableWeapons.length > 0) {
        const randId = availableWeapons[Math.floor(Math.random() * availableWeapons.length)] as WeaponType;
        const current = this.activeWeapons.find((w) => w.id === randId);
        choices.push({
          type: 'weapon',
          id: randId,
          level: current ? current.level + 1 : 1,
        });
        // avoid duplicate choices in same menu
        availableWeapons.splice(availableWeapons.indexOf(randId), 1);
      } else if (availablePassives.length > 0) {
        const randId = availablePassives[Math.floor(Math.random() * availablePassives.length)] as PassiveType;
        const current = this.activePassives.find((p) => p.id === randId);
        choices.push({
          type: 'passive',
          id: randId,
          level: current ? current.level + 1 : 1,
        });
        availablePassives.splice(availablePassives.indexOf(randId), 1);
      }
    }

    this.callbacks.onLevelUp(choices);
  }

  public applyUpgrade(choice: { type: 'weapon' | 'passive'; id: string; level: number }) {
    if (choice.type === 'weapon') {
      const active = this.activeWeapons.find((w) => w.id === choice.id);
      if (active) {
        active.level = choice.level;
      } else {
        this.activeWeapons.push({ id: choice.id as WeaponType, level: 1, lastFired: 0 });
      }
    } else {
      const active = this.activePassives.find((p) => p.id === choice.id);
      if (active) {
        active.level = choice.level;
      } else {
        this.activePassives.push({ id: choice.id as PassiveType, level: 1 });
      }
    }

    this.resume();
  }

  private checkSynergies() {
    for (const syn of SYNERGIES) {
      const hasW1 = this.activeWeapons.some((w) => w.id === syn.requiredWeapons[0]);
      const hasW2 = this.activeWeapons.some((w) => w.id === syn.requiredWeapons[1]);

      if (hasW1 && hasW2 && !this.activeSynergies.includes(syn.id)) {
        this.activeSynergies.push(syn.id);
        this.stats.synergiesUnlocked.push(syn.id);
        this.spawnDamageNumber(this.player.x, this.player.y - 40, `SYNERGY: ${syn.name}!`, syn.color, true);
        sound.playLevelUp();
      }
    }
  }

  private hasSynergy(id: string): boolean {
    return this.activeSynergies.includes(id);
  }

  public endRun() {
    this.gameOver();
  }

  private gameOver() {
    this.stop();
    this.callbacks.onGameOver(this.stats);
  }

  private addParticleBurst(x: number, y: number, color: string, count: number) {
    for (let i = 0; i < count; i++) {
      const angle = Math.random() * Math.PI * 2;
      const speed = 1 + Math.random() * 4;
      this.spawnParticle(x, y, Math.cos(angle) * speed, Math.sin(angle) * speed, 2 + Math.random() * 3, color, 0.04);
    }
  }

  private updateParticles(dt: number) {
    for (let i = this.particles.length - 1; i >= 0; i--) {
      const p = this.particles[i];
      p.x += p.vx * 60 * dt;
      p.y += p.vy * 60 * dt;
      p.alpha -= p.decay;
      if (p.alpha <= 0) {
        this.particlePool.push(p);
        this.particles[i] = this.particles[this.particles.length - 1];
        this.particles.pop();
      }
    }
  }

  private spawnDamageNumber(x: number, y: number, text: string, color: string, isCrit: boolean) {
    let d: DamageNumber;
    if (this.damageNumberPool.length > 0) {
      d = this.damageNumberPool.pop()!;
      d.id = Math.random();
      d.x = x;
      d.y = y;
      d.text = text;
      d.color = color;
      d.alpha = 1.0;
      d.scale = isCrit ? 1.5 : 1.0;
      d.vy = -1.5;
    } else {
      d = {
        id: Math.random(),
        x,
        y,
        text,
        color,
        alpha: 1.0,
        scale: isCrit ? 1.5 : 1.0,
        vy: -1.5,
      };
    }
    this.damageNumbers.push(d);
  }

  private updateDamageNumbers(dt: number) {
    for (let i = this.damageNumbers.length - 1; i >= 0; i--) {
      const d = this.damageNumbers[i];
      d.y += d.vy * 60 * dt;
      d.alpha -= 0.02;
      if (d.alpha <= 0) {
        this.damageNumberPool.push(d);
        this.damageNumbers[i] = this.damageNumbers[this.damageNumbers.length - 1];
        this.damageNumbers.pop();
      }
    }
  }

  private renderDecoys() {
    for (const d of this.decoys) {
      if (d.hp <= 0) continue;
      this.ctx.save();

      this.ctx.strokeStyle = '#34d399';
      this.ctx.lineWidth = 2;
      this.ctx.shadowBlur = 12;
      this.ctx.shadowColor = '#34d399';
      this.ctx.beginPath();
      this.ctx.arc(d.x, d.y, d.radius + 3, 0, Math.PI * 2);
      this.ctx.stroke();

      this.ctx.fillStyle = '#10b981';
      this.ctx.beginPath();
      this.ctx.arc(d.x, d.y, d.radius, 0, Math.PI * 2);
      this.ctx.fill();

      this.ctx.fillStyle = '#ffffff';
      this.ctx.font = 'bold 14px system-ui, sans-serif';
      this.ctx.textAlign = 'center';
      this.ctx.textBaseline = 'middle';
      this.ctx.fillText('🪆', d.x, d.y);

      const hpRatio = Math.max(0, d.hp / d.maxHp);
      const now = Date.now();
      const timeRatio = Math.max(0, 1 - (now - d.createdAt) / d.durationMs);
      const barW = 32;
      const barH = 4;
      this.ctx.fillStyle = '#1e293b';
      this.ctx.fillRect(d.x - barW / 2, d.y - d.radius - 10, barW, barH);
      this.ctx.fillStyle = '#34d399';
      this.ctx.fillRect(d.x - barW / 2, d.y - d.radius - 10, barW * hpRatio, barH);

      // Duration bar
      this.ctx.fillStyle = '#065f46';
      this.ctx.fillRect(d.x - barW / 2, d.y - d.radius - 5, barW, 2);
      this.ctx.fillStyle = '#6ee7b7';
      this.ctx.fillRect(d.x - barW / 2, d.y - d.radius - 5, barW * timeRatio, 2);

      this.ctx.restore();
    }
  }

  private getCameraZoom(): number {
    const humanZoom = 0.5;
    const wolfZoom = 1.0;
    const isHuman = this.player.form === 'human';

    if (!this.transitionState.active) {
      return isHuman ? humanZoom : wolfZoom;
    }

    let baseZoom: number;
    if (this.transitionState.type === 'to_night') {
      baseZoom = humanZoom + (wolfZoom - humanZoom) * this.transitionState.progress;
    } else if (this.transitionState.type === 'to_day') {
      baseZoom = wolfZoom + (humanZoom - wolfZoom) * this.transitionState.progress;
    } else {
      baseZoom = isHuman ? humanZoom : wolfZoom;
    }

    // Sine arc peaking in center of transition for dramatic transformation surge
    const arc = Math.sin(this.transitionState.progress * Math.PI);
    return baseZoom + baseZoom * 0.45 * arc;
  }

  private render() {
    const width = this.canvas.width;
    const height = this.canvas.height;

    if (this.isLoading) {
      this.renderLoadingScreen(width, height);
      return;
    }

    const zoomScale = this.getCameraZoom();
    const centerX = width / 2;
    const centerY = height / 2;

    const halfW = width / (2 * zoomScale) + 120;
    const halfH = height / (2 * zoomScale) + 120;
    const vMinX = this.player.x - halfW;
    const vMaxX = this.player.x + halfW;
    const vMinY = this.player.y - halfH;
    const vMaxY = this.player.y + halfH;

    this.ctx.clearRect(0, 0, width, height);

    this.ctx.save();
    // Camera zoom & translation centered on player
    this.ctx.translate(centerX, centerY);
    this.ctx.scale(zoomScale, zoomScale);
    this.ctx.translate(-this.player.x, -this.player.y);

    // 1. Tile Map Background
    this.renderBackground();

    // 1a. Net Hazards
    this.renderNets();

    // 1b. Depth-Sorted Shrines & Shops (Y-Ordered)
    this.renderShrinesAndShopsYOrdered();

    // 1b. Fire Patches (Burning Steps)
    for (const patch of this.firePatches) {
      if (patch.x < vMinX || patch.x > vMaxX || patch.y < vMinY || patch.y > vMaxY) continue;
      this.ctx.save();
      const progress = patch.lifeMs / patch.maxLifeMs;
      // Burning steps visual is 50% opaque max
      this.ctx.globalAlpha = Math.min(0.5, progress * 0.5);

      // Outer burning field
      this.ctx.beginPath();
      this.ctx.arc(patch.x, patch.y, patch.radius, 0, Math.PI * 2);
      this.ctx.fillStyle = '#f97316';
      this.ctx.shadowBlur = 8;
      this.ctx.shadowColor = '#dc2626';
      this.ctx.fill();

      // Inner flame core
      this.ctx.beginPath();
      this.ctx.arc(patch.x, patch.y, patch.radius * 0.6, 0, Math.PI * 2);
      this.ctx.fillStyle = '#fef08a';
      this.ctx.fill();

      this.ctx.restore();
    }

    // 2. Gems & Pickups
    for (const gem of this.gems) {
      if (gem.x < vMinX || gem.x > vMaxX || gem.y < vMinY || gem.y > vMaxY) continue;
      this.ctx.save();
      if (gem.type === 'xp') {
        // XP drops represented visually by sharp diamonds
        const rx = gem.radius * 1.1;
        const ry = gem.radius * 1.5;
        this.ctx.beginPath();
        this.ctx.moveTo(gem.x, gem.y - ry);
        this.ctx.lineTo(gem.x + rx, gem.y);
        this.ctx.lineTo(gem.x, gem.y + ry);
        this.ctx.lineTo(gem.x - rx, gem.y);
        this.ctx.closePath();
        this.ctx.fillStyle = gem.color;
        this.ctx.fill();

        // Inner diamond facet highlight
        this.ctx.beginPath();
        this.ctx.moveTo(gem.x, gem.y - ry * 0.5);
        this.ctx.lineTo(gem.x + rx * 0.5, gem.y);
        this.ctx.lineTo(gem.x, gem.y + ry * 0.5);
        this.ctx.lineTo(gem.x - rx * 0.5, gem.y);
        this.ctx.closePath();
        this.ctx.strokeStyle = 'rgba(255, 255, 255, 0.7)';
        this.ctx.lineWidth = 1.2;
        this.ctx.stroke();
      } else if (gem.type === 'gold') {
        // Coins represented as circles with a hole cut out like a doughnut
        this.ctx.beginPath();
        // Outer circle (clockwise)
        this.ctx.arc(gem.x, gem.y, gem.radius, 0, Math.PI * 2, false);
        // Inner hole cutout (counter-clockwise)
        this.ctx.arc(gem.x, gem.y, gem.radius * 0.45, 0, Math.PI * 2, true);
        this.ctx.fillStyle = gem.color;
        this.ctx.fill('evenodd');

        // Golden doughnut metallic borders
        this.ctx.beginPath();
        this.ctx.arc(gem.x, gem.y, gem.radius, 0, Math.PI * 2);
        this.ctx.strokeStyle = '#eab308';
        this.ctx.lineWidth = 1.5;
        this.ctx.stroke();

        this.ctx.beginPath();
        this.ctx.arc(gem.x, gem.y, gem.radius * 0.45, 0, Math.PI * 2);
        this.ctx.strokeStyle = '#ca8a04';
        this.ctx.lineWidth = 1;
        this.ctx.stroke();
      } else if (gem.type === 'lunar_shard') {
        // Elite drops (lunar_shard) - glowing star diamond
        const rx = gem.radius * 1.2;
        const ry = gem.radius * 1.6;
        this.ctx.beginPath();
        this.ctx.moveTo(gem.x, gem.y - ry);
        this.ctx.lineTo(gem.x + rx, gem.y);
        this.ctx.lineTo(gem.x, gem.y + ry);
        this.ctx.lineTo(gem.x - rx, gem.y);
        this.ctx.closePath();
        this.ctx.fillStyle = gem.color;
        this.ctx.shadowBlur = 12;
        this.ctx.shadowColor = gem.color;
        this.ctx.fill();
      } else if (gem.type === 'ichor_crystal') {
        // Boss drops (ichor_crystal) - glowing crimson blood crystal
        const rx = gem.radius * 1.3;
        const ry = gem.radius * 1.7;
        this.ctx.beginPath();
        this.ctx.moveTo(gem.x, gem.y - ry);
        this.ctx.lineTo(gem.x + rx * 0.7, gem.y - ry * 0.3);
        this.ctx.lineTo(gem.x + rx, gem.y);
        this.ctx.lineTo(gem.x + rx * 0.7, gem.y + ry * 0.3);
        this.ctx.lineTo(gem.x, gem.y + ry);
        this.ctx.lineTo(gem.x - rx * 0.7, gem.y + ry * 0.3);
        this.ctx.lineTo(gem.x - rx, gem.y);
        this.ctx.lineTo(gem.x - rx * 0.7, gem.y - ry * 0.3);
        this.ctx.closePath();
        this.ctx.fillStyle = '#ef4444';
        this.ctx.shadowBlur = 16;
        this.ctx.shadowColor = '#dc2626';
        this.ctx.fill();

        // Inner ruby facet highlight
        this.ctx.beginPath();
        this.ctx.moveTo(gem.x, gem.y - ry * 0.5);
        this.ctx.lineTo(gem.x + rx * 0.4, gem.y);
        this.ctx.lineTo(gem.x, gem.y + ry * 0.5);
        this.ctx.lineTo(gem.x - rx * 0.4, gem.y);
        this.ctx.closePath();
        this.ctx.fillStyle = '#fca5a5';
        this.ctx.fill();
      }
      this.ctx.restore();
    }

    // 2.5 Decoys
    this.renderDecoys();

    // 3. Enemies
    for (const enemy of this.enemies) {
      if (enemy.x < vMinX - enemy.radius || enemy.x > vMaxX + enemy.radius || enemy.y < vMinY - enemy.radius || enemy.y > vMaxY + enemy.radius) continue;
      this.ctx.save();
      // Soft ground shadow under enemy sprite
      this.ctx.beginPath();
      this.ctx.ellipse(enemy.x, enemy.y + enemy.radius * 0.55, enemy.radius * 0.85, enemy.radius * 0.35, 0, 0, Math.PI * 2);
      this.ctx.fillStyle = 'rgba(0, 0, 0, 0.35)';
      this.ctx.fill();

      // Enemy PNG Sprite rendering
      const spriteImg = getEnemySprite(enemy.type);
      if (spriteImg && spriteImg.complete && spriteImg.naturalWidth > 0) {
        this.ctx.save();
        this.ctx.translate(enemy.x, enemy.y);

        // Flip sprite horizontally if enemy is to the right of the player (facing/moving left towards player)
        if (this.player.x < enemy.x) {
          this.ctx.scale(-1, 1);
        }

        // Render pixel art sprite crisp
        this.ctx.imageSmoothingEnabled = false;

        const scaleFactor = 2.5; // Scale tile to visually match circle bounds
        const spriteSize = enemy.radius * scaleFactor;

        if (enemy.hitFlashTimer && enemy.hitFlashTimer > 0) {
          this.ctx.filter = 'brightness(500%)';
        } else if (enemy.isFrozen) {
          this.ctx.filter = 'brightness(120%) hue-rotate(180deg)';
        }

        if (enemy.isBoss || enemy.isElite) {
          this.ctx.shadowBlur = enemy.isBoss ? 15 : 12;
          this.ctx.shadowColor = enemy.color;
        }

        this.ctx.drawImage(spriteImg, -spriteSize / 2, -spriteSize / 2, spriteSize, spriteSize);
        this.ctx.restore();
      } else {
        // Fallback to circle if image not loaded yet
        this.ctx.beginPath();
        this.ctx.arc(enemy.x, enemy.y, enemy.radius, 0, Math.PI * 2);
        this.ctx.fillStyle = enemy.hitFlashTimer && enemy.hitFlashTimer > 0 ? '#ffffff' : enemy.color;
        this.ctx.fill();
      }

      // Trapped inside a slightly askew (random angle) ice cube square when frozen
      if (enemy.isFrozen) {
        if (enemy.freezeAngle === undefined) {
          const sign = Math.random() < 0.5 ? 1 : -1;
          enemy.freezeAngle = sign * (0.2 + Math.random() * 0.25);
        }

        this.ctx.save();
        this.ctx.translate(enemy.x, enemy.y);
        this.ctx.rotate(enemy.freezeAngle);

        const cubeSize = enemy.radius * 2.5;
        const halfSize = cubeSize / 2;

        // Translucent ice block fill
        this.ctx.fillStyle = 'rgba(186, 230, 253, 0.55)';
        this.ctx.fillRect(-halfSize, -halfSize, cubeSize, cubeSize);

        // Icy blue outer frame
        this.ctx.strokeStyle = '#38bdf8';
        this.ctx.lineWidth = 2.5;
        this.ctx.strokeRect(-halfSize, -halfSize, cubeSize, cubeSize);

        // White ice sheen glint
        this.ctx.beginPath();
        this.ctx.moveTo(-halfSize + 3, -halfSize + 3);
        this.ctx.lineTo(halfSize - 3, -halfSize + 3);
        this.ctx.moveTo(-halfSize + 3, -halfSize + 3);
        this.ctx.lineTo(-halfSize + 3, halfSize - 3);
        this.ctx.strokeStyle = 'rgba(255, 255, 255, 0.85)';
        this.ctx.lineWidth = 1.8;
        this.ctx.stroke();

        this.ctx.restore();
      }

      // Electrified Effect Aura & Tag
      if (enemy.isElectrified) {
        this.ctx.save();
        this.ctx.strokeStyle = '#facc15';
        this.ctx.lineWidth = 2.5;
        this.ctx.shadowBlur = 10;
        this.ctx.shadowColor = '#facc15';
        this.ctx.beginPath();
        this.ctx.arc(enemy.x, enemy.y, enemy.radius + 5, 0, Math.PI * 2);
        this.ctx.stroke();

        this.ctx.fillStyle = '#fef08a';
        this.ctx.font = 'bold 11px system-ui, sans-serif';
        this.ctx.textAlign = 'center';
        this.ctx.fillText('⚡', enemy.x, enemy.y - enemy.radius - 6);
        this.ctx.restore();
      }

      // Elite Enemy Indicator Ring & Badge
      if (enemy.isElite) {
        this.ctx.strokeStyle = '#f59e0b';
        this.ctx.lineWidth = 3;
        this.ctx.beginPath();
        this.ctx.arc(enemy.x, enemy.y, enemy.radius + 4, 0, Math.PI * 2);
        this.ctx.stroke();

        this.ctx.fillStyle = '#f59e0b';
        this.ctx.font = 'bold 11px system-ui, sans-serif';
        this.ctx.textAlign = 'center';
        this.ctx.fillText('👑 ELITE', enemy.x, enemy.y - enemy.radius - 8);
      }

      // Boss Health Bar
      if (enemy.isBoss) {
        this.ctx.fillStyle = '#1e293b';
        this.ctx.fillRect(enemy.x - 30, enemy.y - enemy.radius - 12, 60, 6);
        this.ctx.fillStyle = '#ef4444';
        this.ctx.fillRect(enemy.x - 30, enemy.y - enemy.radius - 12, (enemy.hp / enemy.maxHp) * 60, 6);
      }

      // Shield Enemy Barrier Arc & Shield Bar
      if (enemy.shield && enemy.shield > 0 && enemy.maxShield) {
        this.ctx.save();
        this.ctx.strokeStyle = '#38bdf8';
        this.ctx.lineWidth = 3.5;
        this.ctx.shadowBlur = 10;
        this.ctx.shadowColor = '#0284c7';
        this.ctx.beginPath();
        this.ctx.arc(enemy.x, enemy.y, enemy.radius + 5, 0, Math.PI * 2);
        this.ctx.stroke();

        this.ctx.fillStyle = '#0f172a';
        this.ctx.fillRect(enemy.x - 20, enemy.y - enemy.radius - 10, 40, 5);
        this.ctx.fillStyle = '#38bdf8';
        this.ctx.fillRect(enemy.x - 20, enemy.y - enemy.radius - 10, Math.max(0, (enemy.shield / enemy.maxShield)) * 40, 5);
        this.ctx.restore();
      }

      // Exploding Enemy Pulse & Fuse Tag
      if (enemy.isExploding) {
        this.ctx.save();
        const pulse = 1 + Math.sin(Date.now() / 120) * 0.12;
        this.ctx.strokeStyle = '#ef4444';
        this.ctx.lineWidth = 2.5;
        this.ctx.beginPath();
        this.ctx.arc(enemy.x, enemy.y, enemy.radius * pulse + 3, 0, Math.PI * 2);
        this.ctx.stroke();

        this.ctx.fillStyle = '#ef4444';
        this.ctx.font = 'bold 11px system-ui, sans-serif';
        this.ctx.textAlign = 'center';
        this.ctx.fillText('💣', enemy.x, enemy.y - enemy.radius - 8);
        this.ctx.restore();
      }

      // Net Thrower Badge
      if (enemy.isNetThrower) {
        this.ctx.save();
        this.ctx.fillStyle = '#eab308';
        this.ctx.font = 'bold 11px system-ui, sans-serif';
        this.ctx.textAlign = 'center';
        this.ctx.fillText('🕸️', enemy.x, enemy.y - enemy.radius - 8);
        this.ctx.restore();
      }

      // Spiky Enemy Radiating Spikes
      if (enemy.isSpiky) {
        this.ctx.save();
        if (enemy.spikesOut) {
          this.ctx.fillStyle = '#dc2626';
          this.ctx.strokeStyle = '#f87171';
          this.ctx.lineWidth = 1.5;
          const numSpikes = 10;
          const spikeLen = 10;
          const spin = Date.now() / 1200;
          for (let s = 0; s < numSpikes; s++) {
            const ang = (s / numSpikes) * Math.PI * 2 + spin;
            const x1 = enemy.x + Math.cos(ang) * (enemy.radius);
            const y1 = enemy.y + Math.sin(ang) * (enemy.radius);
            const tipX = enemy.x + Math.cos(ang) * (enemy.radius + spikeLen);
            const tipY = enemy.y + Math.sin(ang) * (enemy.radius + spikeLen);
            const perpX = -Math.sin(ang) * 3.5;
            const perpY = Math.cos(ang) * 3.5;

            this.ctx.beginPath();
            this.ctx.moveTo(x1 - perpX, y1 - perpY);
            this.ctx.lineTo(tipX, tipY);
            this.ctx.lineTo(x1 + perpX, y1 + perpY);
            this.ctx.closePath();
            this.ctx.fill();
            this.ctx.stroke();
          }

          this.ctx.fillStyle = '#f87171';
          this.ctx.font = 'bold 10px system-ui, sans-serif';
          this.ctx.textAlign = 'center';
          this.ctx.fillText('⚠️ SPIKES', enemy.x, enemy.y - enemy.radius - 12);
        } else {
          this.ctx.fillStyle = '#64748b';
          const numStuds = 8;
          for (let s = 0; s < numStuds; s++) {
            const ang = (s / numStuds) * Math.PI * 2;
            const sx = enemy.x + Math.cos(ang) * (enemy.radius + 2);
            const sy = enemy.y + Math.sin(ang) * (enemy.radius + 2);
            this.ctx.beginPath();
            this.ctx.arc(sx, sy, 2.5, 0, Math.PI * 2);
            this.ctx.fill();
          }

          this.ctx.fillStyle = '#94a3b8';
          this.ctx.font = '10px system-ui, sans-serif';
          this.ctx.textAlign = 'center';
          this.ctx.fillText('🛡️ SAFE', enemy.x, enemy.y - enemy.radius - 10);
        }
        this.ctx.restore();
      }

      this.ctx.restore();
    }

    // 4. Player Rendering
    this.renderPlayer();

    // 5. Projectiles
    for (const p of this.projectiles) {
      if (p.weaponType === 'silver_decapitator' && p.startAngle !== undefined && p.endAngle !== undefined) {
        this.ctx.save();
        const progress = 1 - p.lifeMs / p.maxLifeMs;
        const alpha = Math.max(0, 1 - progress);
        this.ctx.globalAlpha = alpha;

        const startAng = p.startAngle;
        const endAng = p.endAngle;

        this.ctx.beginPath();
        this.ctx.moveTo(p.x, p.y);
        this.ctx.arc(p.x, p.y, p.radius, startAng, endAng);
        this.ctx.closePath();

        this.ctx.fillStyle = p.extraEffect === 'return_slash' ? 'rgba(192, 132, 252, 0.35)' : 'rgba(226, 232, 240, 0.35)';
        this.ctx.shadowBlur = 16;
        this.ctx.shadowColor = p.extraEffect === 'return_slash' ? '#c084fc' : '#e2e8f0';
        this.ctx.fill();

        this.ctx.beginPath();
        this.ctx.arc(p.x, p.y, p.radius, startAng, endAng);
        this.ctx.strokeStyle = p.extraEffect === 'return_slash' ? '#c084fc' : '#ffffff';
        this.ctx.lineWidth = 3.5;
        this.ctx.stroke();

        this.ctx.restore();
        continue;
      }

      if (p.weaponType === 'searing_gloves' && p.startAngle !== undefined && p.endAngle !== undefined) {
        this.ctx.save();
        const progress = 1 - p.lifeMs / p.maxLifeMs;
        const alpha = Math.max(0, 1 - progress);
        this.ctx.globalAlpha = alpha;

        const startAng = p.startAngle;
        const endAng = p.endAngle;

        this.ctx.beginPath();
        this.ctx.moveTo(p.x, p.y);
        this.ctx.arc(p.x, p.y, p.radius * (0.3 + progress * 0.7), startAng, endAng);
        this.ctx.closePath();

        const grad = this.ctx.createRadialGradient(p.x, p.y, 10, p.x, p.y, p.radius);
        grad.addColorStop(0, '#fef08a');
        grad.addColorStop(0.5, '#f97316');
        grad.addColorStop(1, 'rgba(220, 38, 38, 0)');

        this.ctx.fillStyle = grad;
        this.ctx.shadowBlur = 18;
        this.ctx.shadowColor = '#f97316';
        this.ctx.fill();

        this.ctx.restore();
        continue;
      }

      if (p.weaponType === 'werewolf_claws' && p.startAngle !== undefined && p.endAngle !== undefined) {
        this.ctx.save();
        const progress = 1 - p.lifeMs / p.maxLifeMs; // 0 to 1
        const alpha = Math.sin(progress * Math.PI); // Fades smoothly in and out

        this.ctx.globalAlpha = Math.max(0, Math.min(1, alpha));

        // Draw swim stroke claw slashes (3 parallel razor claw arcs per hand)
        const numClaws = 3;
        const startAng = p.startAngle;
        const endAng = p.endAngle;

        // Swim stroke animation: arc sweeps out from startAng towards endAng over stroke duration
        const strokeRatio = Math.min(1, progress * 1.3);
        const currentEndAng = startAng + (endAng - startAng) * strokeRatio;

        const minR = p.innerRadius || 20;
        const maxR = p.radius;

        for (let c = 0; c < numClaws; c++) {
          const clawRadius = minR + ((maxR - minR) * (c + 1)) / (numClaws + 0.3);
          const isCounterClockwise = p.hand === 'left' && startAng > endAng;

          this.ctx.beginPath();
          this.ctx.arc(p.x, p.y, clawRadius, startAng, currentEndAng, isCounterClockwise);

          this.ctx.strokeStyle = c === 1 ? '#ffffff' : '#ef4444';
          this.ctx.lineWidth = c === 1 ? 4 : 2.5;
          this.ctx.shadowBlur = 12;
          this.ctx.shadowColor = '#dc2626';
          this.ctx.lineCap = 'round';
          this.ctx.stroke();

          // Razor claw tips at the leading edge of the slash
          const tipX = p.x + Math.cos(currentEndAng) * clawRadius;
          const tipY = p.y + Math.sin(currentEndAng) * clawRadius;

          this.ctx.beginPath();
          this.ctx.arc(tipX, tipY, c === 1 ? 4 : 2.5, 0, Math.PI * 2);
          this.ctx.fillStyle = '#ffffff';
          this.ctx.shadowBlur = 10;
          this.ctx.shadowColor = '#fef08a';
          this.ctx.fill();
        }

        this.ctx.restore();
        continue;
      }

      if (p.weaponType === 'tail_sweep' && p.startAngle !== undefined && p.endAngle !== undefined) {
        this.ctx.save();
        const progress = 1 - p.lifeMs / p.maxLifeMs;
        const alpha = Math.max(0, 1 - progress);
        this.ctx.globalAlpha = alpha;

        const startAng = p.startAngle;
        const endAng = p.endAngle;

        this.ctx.beginPath();
        this.ctx.moveTo(p.x, p.y);
        this.ctx.arc(p.x, p.y, p.radius, startAng, endAng);
        this.ctx.closePath();

        this.ctx.fillStyle = 'rgba(220, 38, 38, 0.4)';
        this.ctx.shadowBlur = 18;
        this.ctx.shadowColor = '#dc2626';
        this.ctx.fill();

        this.ctx.strokeStyle = '#ef4444';
        this.ctx.lineWidth = 4;
        this.ctx.stroke();

        this.ctx.beginPath();
        this.ctx.arc(p.x, p.y, p.radius * 0.85, startAng, endAng);
        this.ctx.strokeStyle = '#fef08a';
        this.ctx.lineWidth = 2.5;
        this.ctx.stroke();

        this.ctx.restore();
        continue;
      }

      if (p.weaponType === 'slashing_dash') {
        this.ctx.save();
        const progress = 1 - p.lifeMs / p.maxLifeMs;
        const alpha = Math.max(0, 1 - progress);
        this.ctx.globalAlpha = alpha;

        this.ctx.beginPath();
        this.ctx.arc(p.x, p.y, p.radius * (0.4 + progress * 0.6), 0, Math.PI * 2);
        this.ctx.strokeStyle = '#f97316';
        this.ctx.lineWidth = 5;
        this.ctx.shadowBlur = 16;
        this.ctx.shadowColor = '#ef4444';
        this.ctx.stroke();

        this.ctx.beginPath();
        this.ctx.arc(p.x, p.y, p.radius * (0.2 + progress * 0.6), 0, Math.PI * 2);
        this.ctx.strokeStyle = '#ffffff';
        this.ctx.lineWidth = 2.5;
        this.ctx.stroke();

        this.ctx.restore();
        continue;
      }

      if (p.weaponType === 'earth_shatter' && p.startAngle !== undefined && p.endAngle !== undefined) {
        this.ctx.save();
        const progress = 1 - p.lifeMs / p.maxLifeMs;
        this.ctx.globalAlpha = Math.max(0, 1 - progress);

        // Draw 60-degree forward earth cone shockwave
        this.ctx.beginPath();
        this.ctx.moveTo(p.x, p.y);
        this.ctx.arc(p.x, p.y, p.radius, p.startAngle, p.endAngle);
        this.ctx.closePath();
        this.ctx.fillStyle = 'rgba(217, 119, 6, 0.45)';
        this.ctx.shadowBlur = 15;
        this.ctx.shadowColor = '#f59e0b';
        this.ctx.fill();

        this.ctx.strokeStyle = '#f59e0b';
        this.ctx.lineWidth = 3;
        this.ctx.stroke();

        this.ctx.restore();
        continue;
      }

      this.ctx.save();
      // Circular projectiles are capped at 75% opacity
      this.ctx.globalAlpha = Math.min(0.75, p.lifeMs / p.maxLifeMs);
      this.ctx.beginPath();
      this.ctx.arc(p.x, p.y, p.radius, 0, Math.PI * 2);
      this.ctx.fillStyle = p.color;
      this.ctx.shadowBlur = 10;
      this.ctx.shadowColor = p.color;
      this.ctx.fill();
      this.ctx.shadowBlur = 0;
      this.ctx.restore();
    }

    // 5b. Ghost Wolves Rendering (W8: silver coat, sharp triangular ears)
    for (const wolf of this.ghostWolves) {
      this.ctx.save();
      this.ctx.translate(wolf.x, wolf.y);
      this.ctx.rotate(wolf.angle);

      // Silver Wolf Body
      this.ctx.beginPath();
      this.ctx.ellipse(0, 0, 13, 7, 0, 0, Math.PI * 2);
      this.ctx.fillStyle = '#e2e8f0';
      this.ctx.shadowBlur = 12;
      this.ctx.shadowColor = '#6366f1';
      this.ctx.fill();

      // Head
      this.ctx.beginPath();
      this.ctx.arc(9, 0, 6, 0, Math.PI * 2);
      this.ctx.fillStyle = '#f1f5f9';
      this.ctx.fill();

      // Sharp Triangular Ears on top of head
      this.ctx.beginPath();
      this.ctx.moveTo(6, -4);
      this.ctx.lineTo(12, -10);
      this.ctx.lineTo(3, -7);
      this.ctx.closePath();
      this.ctx.fillStyle = '#cbd5e1';
      this.ctx.fill();
      this.ctx.strokeStyle = '#6366f1';
      this.ctx.lineWidth = 1.2;
      this.ctx.stroke();

      this.ctx.beginPath();
      this.ctx.moveTo(6, 4);
      this.ctx.lineTo(12, 10);
      this.ctx.lineTo(3, 7);
      this.ctx.closePath();
      this.ctx.fillStyle = '#cbd5e1';
      this.ctx.fill();
      this.ctx.strokeStyle = '#6366f1';
      this.ctx.lineWidth = 1.2;
      this.ctx.stroke();

      // Glowing Eyes
      this.ctx.fillStyle = '#38bdf8';
      this.ctx.fillRect(10, -2, 2.5, 1.5);
      this.ctx.fillRect(10, 1, 2.5, 1.5);

      this.ctx.restore();
    }

    // 5c. Lightning Teeth Chain Beams
    for (const vis of this.lightningVisuals) {
      this.ctx.save();
      const alpha = Math.max(0, vis.lifeMs / vis.maxLifeMs);
      this.ctx.globalAlpha = alpha;
      this.ctx.strokeStyle = '#facc15';
      this.ctx.lineWidth = 3.5;
      this.ctx.shadowBlur = 14;
      this.ctx.shadowColor = '#fef08a';

      this.ctx.beginPath();
      for (let i = 0; i < vis.points.length; i++) {
        const pt = vis.points[i];
        if (i === 0) {
          this.ctx.moveTo(pt.x, pt.y);
        } else {
          const midX = (vis.points[i - 1].x + pt.x) / 2 + (Math.random() - 0.5) * 10;
          const midY = (vis.points[i - 1].y + pt.y) / 2 + (Math.random() - 0.5) * 10;
          this.ctx.lineTo(midX, midY);
          this.ctx.lineTo(pt.x, pt.y);
        }
      }
      this.ctx.stroke();
      this.ctx.restore();
    }

    // 6. Particles
    for (const p of this.particles) {
      if (p.x < vMinX || p.x > vMaxX || p.y < vMinY || p.y > vMaxY) continue;
      this.ctx.save();
      this.ctx.globalAlpha = p.alpha;
      this.ctx.beginPath();
      this.ctx.arc(p.x, p.y, p.radius, 0, Math.PI * 2);
      this.ctx.fillStyle = p.color;
      this.ctx.fill();
      this.ctx.restore();
    }

    // 7. Floating Damage Numbers
    for (const d of this.damageNumbers) {
      if (d.x < vMinX || d.x > vMaxX || d.y < vMinY || d.y > vMaxY) continue;
      this.ctx.save();
      this.ctx.globalAlpha = d.alpha;
      this.ctx.font = `bold ${16 * d.scale}px system-ui, sans-serif`;
      this.ctx.fillStyle = d.color;
      this.ctx.strokeStyle = '#000000';
      this.ctx.lineWidth = 3;
      this.ctx.strokeText(d.text, d.x - 10, d.y);
      this.ctx.fillText(d.text, d.x - 10, d.y);
      this.ctx.restore();
    }

    this.ctx.restore();

    // Day/Night Vignette & Atmospheric Overlay
    this.renderAtmosphereOverlay(width, height);
  }

  private getTileHash(q: number, r: number): number {
    let h = (q * 374761393 + r * 668265263) ^ 0x5bf03635;
    h = Math.imul(h ^ (h >>> 13), 1274126177);
    return (h ^ (h >>> 16)) >>> 0;
  }

  private drawHexagonPathOnCtx(ctx: CanvasRenderingContext2D, cx: number, cy: number) {
    ctx.beginPath();
    ctx.moveTo(cx + this.hexVertices[0].x, cy + this.hexVertices[0].y);
    for (let i = 1; i < 6; i++) {
      ctx.lineTo(cx + this.hexVertices[i].x, cy + this.hexVertices[i].y);
    }
    ctx.closePath();
  }

  private renderHexDecorOnCtx(ctx: CanvasRenderingContext2D, cx: number, cy: number, tile: { decor: string; flowerColor?: string }, hash: number) {
    ctx.save();

    if (tile.decor === 'grass' || tile.decor === 'autumn') {
      const bladeColor = tile.decor === 'grass' ? '#86efac' : '#fef08a';
      ctx.strokeStyle = bladeColor;
      ctx.lineWidth = 1.5;

      const pX = cx + ((hash % 11) - 5) * 2;
      const pY = cy + (((hash >> 3) % 11) - 5) * 2;

      ctx.beginPath();
      ctx.moveTo(pX - 4, pY + 2);
      ctx.lineTo(pX - 6, pY - 6);
      ctx.moveTo(pX, pY + 2);
      ctx.lineTo(pX, pY - 8);
      ctx.moveTo(pX + 4, pY + 2);
      ctx.lineTo(pX + 6, pY - 5);
      ctx.stroke();

      if (tile.flowerColor && hash % 3 === 0) {
        ctx.fillStyle = tile.flowerColor;
        ctx.beginPath();
        ctx.arc(pX - 2, pY - 9, 2.5, 0, Math.PI * 2);
        ctx.fill();
      }
    } else if (tile.decor === 'moss') {
      ctx.fillStyle = '#052e16';
      ctx.beginPath();
      ctx.arc(cx + ((hash % 7) - 3) * 3, cy + (((hash >> 2) % 7) - 3) * 3, 5, 0, Math.PI * 2);
      ctx.fill();
    } else if (tile.decor === 'dirt') {
      ctx.fillStyle = '#d97706';
      ctx.beginPath();
      ctx.arc(cx - 5, cy + 2, 2, 0, Math.PI * 2);
      ctx.arc(cx + 6, cy - 3, 1.5, 0, Math.PI * 2);
      ctx.fill();
    } else if (tile.decor === 'stone') {
      ctx.strokeStyle = '#1e293b';
      ctx.lineWidth = 1.2;
      ctx.beginPath();
      ctx.moveTo(cx - 8, cy - 4);
      ctx.lineTo(cx, cy);
      ctx.lineTo(cx + 10, cy - 6);
      ctx.stroke();
    } else if (tile.decor === 'rune') {
      ctx.strokeStyle = '#818cf8';
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      ctx.arc(cx, cy, 10, 0, Math.PI * 2);
      ctx.stroke();

      ctx.fillStyle = '#c084fc';
      ctx.beginPath();
      ctx.arc(cx, cy, 3, 0, Math.PI * 2);
      ctx.fill();
    }

    ctx.restore();
  }

  private renderTerrainChunk(chunkX: number, chunkY: number, chunkW: number, chunkH: number): HTMLCanvasElement {
    const offCanvas = document.createElement('canvas');
    offCanvas.width = chunkW;
    offCanvas.height = chunkH;
    const offCtx = offCanvas.getContext('2d');
    if (!offCtx) return offCanvas;

    const baseColor = this.stage.id === 'citadel' ? '#0f172a' : '#052e16';
    offCtx.fillStyle = baseColor;
    offCtx.fillRect(0, 0, chunkW, chunkH);

    const colSpacing = this.colSpacing;
    const rowSpacing = this.rowSpacing;
    const tileW = this.hexWidth;
    const tileH = this.hexHeight;

    const chunkMinX = chunkX * chunkW;
    const chunkMinY = chunkY * chunkH;
    const chunkMaxX = chunkMinX + chunkW;
    const chunkMaxY = chunkMinY + chunkH;

    const minR = Math.floor((chunkMinY - tileH) / rowSpacing) - 1;
    const maxR = Math.ceil((chunkMaxY + tileH) / rowSpacing) + 1;
    const minQ = Math.floor((chunkMinX - tileW) / colSpacing) - 1;
    const maxQ = Math.ceil((chunkMaxX + tileW) / colSpacing) + 1;

    const forestSet = [
      { topLight: '#22c55e', topDark: '#16a34a', skirt: '#14532d', border: '#052e16', decor: 'grass', flowerColor: '#fde047' },
      { topLight: '#15803d', topDark: '#166534', skirt: '#052e16', border: '#022c22', decor: 'moss' },
      { topLight: '#d97706', topDark: '#b45309', skirt: '#78350f', border: '#451a03', decor: 'autumn', flowerColor: '#f43f5e' },
      { topLight: '#78350f', topDark: '#582f0e', skirt: '#451a03', border: '#290e02', decor: 'dirt' },
      { topLight: '#475569', topDark: '#334155', skirt: '#1e293b', border: '#0f172a', decor: 'stone' },
      { topLight: '#312e81', topDark: '#1e1b4b', skirt: '#0f172a', border: '#312e81', decor: 'rune' },
    ];

    const citadelSet = [
      { topLight: '#64748b', topDark: '#475569', skirt: '#1e293b', border: '#0f172a', decor: 'stone' },
      { topLight: '#334155', topDark: '#1e293b', skirt: '#0f172a', border: '#020617', decor: 'stone' },
      { topLight: '#475569', topDark: '#334155', skirt: '#14532d', border: '#052e16', decor: 'moss' },
      { topLight: '#78350f', topDark: '#582f0e', skirt: '#451a03', border: '#290e02', decor: 'dirt' },
      { topLight: '#2e1065', topDark: '#1e1b4b', skirt: '#0f172a', border: '#3b0764', decor: 'rune' },
    ];

    const stageSet = this.stage.id === 'citadel' ? citadelSet : forestSet;

    let stageTilePool: HTMLImageElement[] = [];
    if (this.stage.id === 'citadel') {
      stageTilePool = [...this.terrainTiles.stone, ...this.terrainTiles.dirt, ...this.terrainTiles.mars];
    } else {
      stageTilePool = [...this.terrainTiles.grass, ...this.terrainTiles.dirt, ...this.terrainTiles.stone];
    }
    if (stageTilePool.length === 0) {
      stageTilePool = this.terrainTiles.all;
    }

    for (let r = minR; r <= maxR; r++) {
      const cy = r * rowSpacing;
      const xOffset = Math.abs(r) % 2 === 1 ? colSpacing / 2 : 0;

      for (let q = minQ; q <= maxQ; q++) {
        const cx = q * colSpacing + xOffset;

        const localX = cx - chunkMinX;
        const localY = cy - chunkMinY;

        const hash = this.getTileHash(q, r);
        const tileImg = stageTilePool.length > 0 ? stageTilePool[hash % stageTilePool.length] : null;

        // Skip procedural fallback tiles (skirt, topLight/topDark gradients, borders, decor)
        // to render purely valid terrain tile PNGs.
        if (tileImg && tileImg.complete && tileImg.naturalWidth > 0) {
          offCtx.drawImage(tileImg, localX - colSpacing / 2, localY, tileW, tileH);
        }
      }
    }

    return offCanvas;
  }

  private renderBackground() {
    const width = this.canvas.width;
    const height = this.canvas.height;
    const zoomScale = this.getCameraZoom();

    const chunkW = 960;
    const chunkH = 840;

    const halfW = width / (2 * zoomScale);
    const halfH = height / (2 * zoomScale);

    const minWorldX = this.player.x - halfW - chunkW;
    const maxWorldX = this.player.x + halfW + chunkW;
    const minWorldY = this.player.y - halfH - chunkH;
    const maxWorldY = this.player.y + halfH + chunkH;

    const minChunkX = Math.floor(minWorldX / chunkW);
    const maxChunkX = Math.ceil(maxWorldX / chunkW);
    const minChunkY = Math.floor(minWorldY / chunkH);
    const maxChunkY = Math.ceil(maxWorldY / chunkH);

    for (let cX = minChunkX; cX <= maxChunkX; cX++) {
      for (let cY = minChunkY; cY <= maxChunkY; cY++) {
        const key = `${this.stage.id}_${cX}_${cY}`;
        let chunkCanvas = this.terrainChunkCache.get(key);
        if (!chunkCanvas) {
          chunkCanvas = this.renderTerrainChunk(cX, cY, chunkW, chunkH);
          this.terrainChunkCache.set(key, chunkCanvas);
          if (this.terrainChunkCache.size > 64) {
            const firstKey = this.terrainChunkCache.keys().next().value;
            if (firstKey) this.terrainChunkCache.delete(firstKey);
          }
        }
        this.ctx.drawImage(chunkCanvas, cX * chunkW - 0.5, cY * chunkH - 0.5, chunkW + 1, chunkH + 1);
      }
    }
  }

  private renderLoadingScreen(width: number, height: number) {
    this.ctx.fillStyle = '#090d16';
    this.ctx.fillRect(0, 0, width, height);

    const gradient = this.ctx.createRadialGradient(width / 2, height / 2, width * 0.1, width / 2, height / 2, width * 0.6);
    gradient.addColorStop(0, 'rgba(56, 189, 248, 0.15)');
    gradient.addColorStop(1, 'rgba(15, 23, 42, 0.95)');
    this.ctx.fillStyle = gradient;
    this.ctx.fillRect(0, 0, width, height);

    const cardW = Math.min(420, width - 40);
    const cardH = 180;
    const cardX = (width - cardW) / 2;
    const cardY = (height - cardH) / 2;

    this.ctx.save();
    this.ctx.fillStyle = 'rgba(15, 23, 42, 0.9)';
    this.ctx.strokeStyle = 'rgba(234, 179, 8, 0.5)';
    this.ctx.lineWidth = 2;
    this.ctx.beginPath();
    this.ctx.roundRect(cardX, cardY, cardW, cardH, 12);
    this.ctx.fill();
    this.ctx.stroke();

    this.ctx.fillStyle = '#fef08a';
    this.ctx.font = 'bold 18px system-ui, sans-serif';
    this.ctx.textAlign = 'center';
    this.ctx.fillText('INITIALIZING REALM', width / 2, cardY + 45);

    this.ctx.fillStyle = '#94a3b8';
    this.ctx.font = '13px system-ui, sans-serif';
    this.ctx.fillText('Allocating spell pools & pre-baking terrain chunks...', width / 2, cardY + 75);

    const barW = cardW - 60;
    const barH = 14;
    const barX = (width - barW) / 2;
    const barY = cardY + 110;

    this.ctx.fillStyle = '#0f172a';
    this.ctx.strokeStyle = '#334155';
    this.ctx.lineWidth = 1.5;
    this.ctx.beginPath();
    this.ctx.roundRect(barX, barY, barW, barH, 7);
    this.ctx.fill();
    this.ctx.stroke();

    const fillW = Math.max(8, barW * this.loadingProgress);
    const fillGrad = this.ctx.createLinearGradient(barX, barY, barX + barW, barY);
    fillGrad.addColorStop(0, '#eab308');
    fillGrad.addColorStop(1, '#38bdf8');

    this.ctx.fillStyle = fillGrad;
    this.ctx.beginPath();
    this.ctx.roundRect(barX, barY, fillW, barH, 7);
    this.ctx.fill();

    const pct = Math.floor(this.loadingProgress * 100);
    this.ctx.fillStyle = '#e2e8f0';
    this.ctx.font = 'bold 11px system-ui, sans-serif';
    this.ctx.fillText(`${pct}%`, width / 2, barY + 30);

    this.ctx.restore();
  }

  private renderPlayer() {
    this.ctx.save();
    this.ctx.translate(this.player.x, this.player.y);

    if (this.player.invincibleTimer > 0 && Math.floor(Date.now() / 100) % 2 === 0) {
      this.ctx.globalAlpha = 0.5;
    }

    // Human Shield Forcefield
    if (this.humanShieldTimer > 0 || (this.transitionState.active && this.transitionState.type === 'to_day')) {
      const pulse = 1 + Math.sin(Date.now() / 120) * 0.08;
      const shieldRadius = (this.player.radius + 14) * pulse;

      // Outer glowing aura
      this.ctx.beginPath();
      this.ctx.arc(0, 0, shieldRadius, 0, Math.PI * 2);
      this.ctx.fillStyle = 'rgba(56, 189, 248, 0.22)';
      this.ctx.fill();

      // Bright cyan/golden boundary ring
      this.ctx.strokeStyle = '#38bdf8';
      this.ctx.lineWidth = 2.8;
      this.ctx.shadowBlur = 16;
      this.ctx.shadowColor = '#38bdf8';
      this.ctx.stroke();

      // Secondary inner geometric ring
      this.ctx.beginPath();
      this.ctx.arc(0, 0, shieldRadius - 4, 0, Math.PI * 2);
      this.ctx.strokeStyle = '#fef08a';
      this.ctx.lineWidth = 1.2;
      this.ctx.stroke();
      this.ctx.shadowBlur = 0;
    }

    // Wolven Headbutt Arc
    if (this.isHeadbuttArcActive()) {
      const facing = this.player.facingAngle;
      const startAngle = facing - Math.PI / 4;
      const endAngle = facing + Math.PI / 4;
      const arcRadius = 25;

      this.ctx.save();
      this.ctx.beginPath();
      this.ctx.moveTo(0, 0);
      this.ctx.arc(0, 0, arcRadius, startAngle, endAngle);
      this.ctx.closePath();
      this.ctx.fillStyle = 'rgba(217, 119, 6, 0.40)';
      this.ctx.shadowBlur = 18;
      this.ctx.shadowColor = '#f97316';
      this.ctx.fill();

      this.ctx.beginPath();
      this.ctx.arc(0, 0, arcRadius, startAngle, endAngle);
      this.ctx.strokeStyle = '#f59e0b';
      this.ctx.lineWidth = 4;
      this.ctx.stroke();

      this.ctx.beginPath();
      this.ctx.arc(0, 0, arcRadius * 0.7, startAngle, endAngle);
      this.ctx.strokeStyle = '#fef08a';
      this.ctx.lineWidth = 1.8;
      this.ctx.stroke();

      this.ctx.restore();
    }

    // W7: Blood Ring persistent outline & pulsing fill when triggered
    const bloodRingInst = this.activeWeapons.find((w) => w.id === 'blood_ring');
    if (bloodRingInst) {
      const ringRadius = 70 * (1 + (bloodRingInst.level - 1) * 0.15);
      
      // Outline always visible
      this.ctx.beginPath();
      this.ctx.arc(0, 0, ringRadius, 0, Math.PI * 2);
      this.ctx.strokeStyle = '#dc2626';
      this.ctx.lineWidth = 2.5;
      this.ctx.shadowBlur = 10;
      this.ctx.shadowColor = '#ef4444';
      this.ctx.stroke();

      // Pulsing fill when triggered
      const activeRing = this.projectiles.find((p) => p.weaponType === 'blood_ring');
      if (activeRing) {
        const progress = activeRing.lifeMs / activeRing.maxLifeMs;
        const alpha = Math.sin(progress * Math.PI) * 0.35;
        this.ctx.beginPath();
        this.ctx.arc(0, 0, ringRadius, 0, Math.PI * 2);
        this.ctx.fillStyle = `rgba(220, 38, 38, ${alpha})`;
        this.ctx.fill();
      }
    }

    // Determine transformation animation factors for wolf ears & teeth
    let earFactor = 0;
    let teethFactor = 0;

    if (this.transitionState.active) {
      if (this.transitionState.type === 'to_night') {
        earFactor = this.transitionState.progress;
        teethFactor = this.transitionState.progress;
      } else if (this.transitionState.type === 'to_day') {
        earFactor = 1.0 - this.transitionState.progress;
        teethFactor = 1.0 - this.transitionState.progress;
      }
    } else {
      if (this.player.form === 'werewolf') {
        earFactor = 1.0;
        teethFactor = 1.0;
      } else {
        earFactor = 0.0;
        teethFactor = 0.0;
      }
    }

    // Animated Wolf Ears
    if (earFactor > 0.01) {
      const earLen = 18 * earFactor;
      const earBase = 7;

      this.ctx.save();
      this.ctx.rotate(this.player.facingAngle);

      // Left Ear
      this.ctx.beginPath();
      this.ctx.moveTo(2, -this.player.radius + 2);
      this.ctx.lineTo(-earBase, -this.player.radius - earLen);
      this.ctx.lineTo(earBase + 2, -this.player.radius + 1);
      this.ctx.closePath();
      this.ctx.fillStyle = '#991b1b';
      this.ctx.fill();
      this.ctx.strokeStyle = '#ef4444';
      this.ctx.lineWidth = 1.5;
      this.ctx.stroke();

      // Inner Left Ear
      this.ctx.beginPath();
      this.ctx.moveTo(1, -this.player.radius + 1);
      this.ctx.lineTo(-earBase * 0.5, -this.player.radius - earLen * 0.7);
      this.ctx.lineTo(earBase * 0.5, -this.player.radius + 1);
      this.ctx.fillStyle = '#f87171';
      this.ctx.fill();

      // Right Ear
      this.ctx.beginPath();
      this.ctx.moveTo(2, this.player.radius - 2);
      this.ctx.lineTo(-earBase, this.player.radius + earLen);
      this.ctx.lineTo(earBase + 2, this.player.radius - 1);
      this.ctx.closePath();
      this.ctx.fillStyle = '#991b1b';
      this.ctx.fill();
      this.ctx.strokeStyle = '#ef4444';
      this.ctx.lineWidth = 1.5;
      this.ctx.stroke();

      // Inner Right Ear
      this.ctx.beginPath();
      this.ctx.moveTo(1, this.player.radius - 1);
      this.ctx.lineTo(-earBase * 0.5, this.player.radius + earLen * 0.7);
      this.ctx.lineTo(earBase * 0.5, this.player.radius - 1);
      this.ctx.fillStyle = '#f87171';
      this.ctx.fill();

      this.ctx.restore();
    }

    // Animated Wolf Fangs / Teeth
    if (teethFactor > 0.01) {
      const fangLen = 10 * teethFactor;

      this.ctx.save();
      this.ctx.rotate(this.player.facingAngle);

      // Top Fang
      this.ctx.beginPath();
      this.ctx.moveTo(this.player.radius - 2, -5);
      this.ctx.lineTo(this.player.radius + fangLen, -3);
      this.ctx.lineTo(this.player.radius - 2, -1);
      this.ctx.closePath();
      this.ctx.fillStyle = '#ffffff';
      this.ctx.shadowBlur = 6;
      this.ctx.shadowColor = '#ffffff';
      this.ctx.fill();

      // Bottom Fang
      this.ctx.beginPath();
      this.ctx.moveTo(this.player.radius - 2, 1);
      this.ctx.lineTo(this.player.radius + fangLen, 3);
      this.ctx.lineTo(this.player.radius - 2, 5);
      this.ctx.closePath();
      this.ctx.fillStyle = '#ffffff';
      this.ctx.shadowBlur = 6;
      this.ctx.shadowColor = '#ffffff';
      this.ctx.fill();

      this.ctx.restore();
    }

    // Player Body
    this.ctx.beginPath();
    this.ctx.arc(0, 0, this.player.radius, 0, Math.PI * 2);

    if (this.player.form === 'werewolf') {
      this.ctx.fillStyle = '#dc2626'; // Werewolf Crimson
      this.ctx.shadowBlur = 20;
      this.ctx.shadowColor = '#ef4444';
    } else {
      this.ctx.fillStyle = '#38bdf8'; // Human Cyan Alchemist
      this.ctx.shadowBlur = 12;
      this.ctx.shadowColor = '#0284c7';
    }

    this.ctx.fill();
    this.ctx.shadowBlur = 0;

    // Direction Pointer
    this.ctx.beginPath();
    this.ctx.moveTo(0, 0);
    this.ctx.lineTo(
      Math.cos(this.player.facingAngle) * (this.player.radius + 10),
      Math.sin(this.player.facingAngle) * (this.player.radius + 10)
    );
    this.ctx.strokeStyle = '#ffffff';
    this.ctx.lineWidth = 3;
    this.ctx.stroke();

    // Check if player is standing in a net and draw slow status badge
    const isPlayerInNet = this.nets.some((net) =>
      isWithinDistance(this.player.x, this.player.y, net.x, net.y, net.radius + this.player.radius)
    );
    if (isPlayerInNet) {
      this.ctx.save();
      this.ctx.fillStyle = '#facc15';
      this.ctx.font = 'bold 12px system-ui, sans-serif';
      this.ctx.textAlign = 'center';
      this.ctx.shadowBlur = 6;
      this.ctx.shadowColor = '#ca8a04';
      this.ctx.fillText('🕸️ SLOWED (-75%)', 0, -this.player.radius - 22);
      this.ctx.restore();
    }

    this.ctx.restore();
  }

  private renderAtmosphereOverlay(width: number, height: number) {
    const dayOpacity = Math.max(0, 1 - this.currentDarkness);
    if (dayOpacity > 0.01) {
      const gradient = this.ctx.createRadialGradient(width / 2, height / 2, width * 0.2, width / 2, height / 2, width * 0.8);
      gradient.addColorStop(0, `rgba(254, 240, 138, ${0.03 * dayOpacity})`);
      gradient.addColorStop(1, `rgba(234, 179, 8, ${0.15 * dayOpacity})`);

      this.ctx.fillStyle = gradient;
      this.ctx.fillRect(0, 0, width, height);
    }

    const nightOpacity = Math.max(0, this.currentDarkness);
    if (nightOpacity > 0.01) {
      const gradient = this.ctx.createRadialGradient(width / 2, height / 2, width * 0.25, width / 2, height / 2, width * 0.85);
      gradient.addColorStop(0, `rgba(15, 23, 42, ${0.12 * nightOpacity})`);
      gradient.addColorStop(0.6, `rgba(127, 29, 29, ${0.28 * nightOpacity})`);
      gradient.addColorStop(1, `rgba(15, 23, 42, ${0.60 * nightOpacity})`);

      this.ctx.fillStyle = gradient;
      this.ctx.fillRect(0, 0, width, height);
    }
  }

  private updateShrinesSectorSpawns() {
    const sectorSize = 1000;
    const pSx = Math.floor(this.player.x / sectorSize);
    const pSy = Math.floor(this.player.y / sectorSize);

    for (let sx = pSx - 4; sx <= pSx + 4; sx++) {
      for (let sy = pSy - 4; sy <= pSy + 4; sy++) {
        const key = `${sx},${sy}`;
        if (this.generatedShrineSectors.has(key)) continue;
        this.generatedShrineSectors.add(key);

        const h = Math.abs(this.getTileHash(sx * 73 + 19, sy * 151 + 37));

        // 75% chance per sector to contain a shrine
        if (h % 100 < 75) {
          const offsetX = 150 + (h % 700);
          const offsetY = 150 + ((h >> 3) % 700);
          const x = sx * sectorSize + offsetX;
          const y = sy * sectorSize + offsetY;

          const distFromStart = Math.hypot(x - this.canvas.width / 2, y - this.canvas.height / 2);
          if (distFromStart > 350) {
            this.shrines.push({
              id: key,
              x,
              y,
              visited: false,
            });
          }
        }
      }
    }
  }

  private checkShrineCollisions() {
    if (this.isPaused || !this.isRunning) return;

    for (const shrine of this.shrines) {
      if (shrine.visited) continue;

      if (isWithinDistance(this.player.x, this.player.y, shrine.x, shrine.y, 55)) {
        shrine.visited = true;

        this.addParticleBurst(shrine.x, shrine.y, '#38bdf8', 35);
        this.addParticleBurst(shrine.x, shrine.y - 40, '#f59e0b', 25);
        sound.playLevelUp();
        vibrateLevelUp();

        this.pause();

        const upgradeInfo = this.processShrineUpgrade();
        this.callbacks.onShrineVisited?.(upgradeInfo);
        break;
      }
    }
  }

  private processShrineUpgrade(): ShrineUpgradeInfo {
    const upgradeableActiveWeapons = this.activeWeapons.filter(
      (w) => w.level < WEAPONS[w.id].maxLevel
    );
    const upgradeableActivePassives = this.activePassives.filter(
      (p) => p.level < PASSIVES[p.id].maxLevel
    );

    const activeCandidates: Array<{ type: 'weapon' | 'passive'; id: string; currentLevel: number }> = [];

    for (const w of upgradeableActiveWeapons) {
      activeCandidates.push({ type: 'weapon', id: w.id, currentLevel: w.level });
    }
    for (const p of upgradeableActivePassives) {
      activeCandidates.push({ type: 'passive', id: p.id, currentLevel: p.level });
    }

    if (activeCandidates.length > 0) {
      const choice = activeCandidates[Math.floor(Math.random() * activeCandidates.length)];
      const newLevel = choice.currentLevel + 1;
      if (choice.type === 'weapon') {
        const w = this.activeWeapons.find((item) => item.id === choice.id);
        if (w) w.level = newLevel;
        const def = WEAPONS[choice.id as WeaponType];
        return {
          type: 'weapon',
          id: choice.id,
          name: def.name,
          icon: def.icon,
          level: newLevel,
          description: def.description,
        };
      } else {
        const p = this.activePassives.find((item) => item.id === choice.id);
        if (p) p.level = newLevel;
        const def = PASSIVES[choice.id as PassiveType];
        return {
          type: 'passive',
          id: choice.id,
          name: def.name,
          icon: def.icon,
          level: newLevel,
          description: def.description,
        };
      }
    }

    const availableWeapons = Object.keys(WEAPONS).filter((id) => {
      const def = WEAPONS[id];
      if (def.formExclusive && def.formExclusive !== this.currentForm) return false;
      const active = this.activeWeapons.find((w) => w.id === id);
      return !active || active.level < def.maxLevel;
    });

    const availablePassives = Object.keys(PASSIVES).filter((id) => {
      const def = PASSIVES[id];
      if (def.formExclusive && def.formExclusive !== this.currentForm) return false;
      const active = this.activePassives.find((p) => p.id === id);
      return !active || active.level < def.maxLevel;
    });

    if (availableWeapons.length > 0 || availablePassives.length > 0) {
      const isWeapon = availableWeapons.length > 0 && (availablePassives.length === 0 || Math.random() < 0.5);
      if (isWeapon) {
        const randId = availableWeapons[Math.floor(Math.random() * availableWeapons.length)] as WeaponType;
        this.activeWeapons.push({ id: randId, level: 1, lastFired: 0 });
        const def = WEAPONS[randId];
        return {
          type: 'weapon',
          id: randId,
          name: def.name,
          icon: def.icon,
          level: 1,
          description: def.description,
        };
      } else {
        const randId = availablePassives[Math.floor(Math.random() * availablePassives.length)] as PassiveType;
        this.activePassives.push({ id: randId, level: 1 });
        const def = PASSIVES[randId];
        return {
          type: 'passive',
          id: randId,
          name: def.name,
          icon: def.icon,
          level: 1,
          description: def.description,
        };
      }
    }

    this.player.maxHp += 50;
    this.player.hp = Math.min(this.player.maxHp, this.player.hp + 50);
    return {
      type: 'bonus',
      id: 'max_hp',
      name: 'Vitality Boost',
      icon: '💖',
      level: 1,
      description: 'Increased Max Health by +50 HP!',
    };
  }

  private renderSingleShrine(shrine: Shrine) {
    const scale = 2;
    const img = shrine.visited ? this.towerRuinImg : this.towerImg;

    if (!shrine.visited) {
      this.ctx.save();
      const pulse = 1 + Math.sin(Date.now() / 300) * 0.15;
      const grad = this.ctx.createRadialGradient(
        shrine.x,
        shrine.y,
        5,
        shrine.x,
        shrine.y,
        50 * pulse
      );
      grad.addColorStop(0, 'rgba(56, 189, 248, 0.45)');
      grad.addColorStop(0.7, 'rgba(245, 158, 11, 0.25)');
      grad.addColorStop(1, 'rgba(0, 0, 0, 0)');

      this.ctx.fillStyle = grad;
      this.ctx.beginPath();
      this.ctx.arc(shrine.x, shrine.y, 50 * pulse, 0, Math.PI * 2);
      this.ctx.fill();

      this.ctx.fillStyle = '#fef08a';
      this.ctx.font = 'bold 12px sans-serif';
      this.ctx.textAlign = 'center';
      const floatY = shrine.y - 180 - Math.sin(Date.now() / 350) * 5;
      this.ctx.shadowBlur = 8;
      this.ctx.shadowColor = '#f59e0b';
      this.ctx.fillText('✨ SHRINE ✨', shrine.x, floatY);
      this.ctx.restore();
    }

    if (img && img.complete && img.naturalWidth > 0) {
      const w = img.naturalWidth * scale;
      const h = img.naturalHeight * scale;
      const drawX = shrine.x - w / 2;
      const drawY = shrine.y - h;
      this.ctx.drawImage(img, drawX, drawY, w, h);
    }
  }

  private renderSingleShop(shop: Shop) {
    const isDay = this.player.form === 'human';

    if (!shop.visited) {
      if (isDay) {
        this.ctx.save();
        const pulse = 1 + Math.sin(Date.now() / 300) * 0.15;
        const grad = this.ctx.createRadialGradient(
          shop.x,
          shop.y,
          5,
          shop.x,
          shop.y,
          55 * pulse
        );
        grad.addColorStop(0, 'rgba(245, 158, 11, 0.5)');
        grad.addColorStop(0.7, 'rgba(234, 179, 8, 0.2)');
        grad.addColorStop(1, 'rgba(0, 0, 0, 0)');

        this.ctx.fillStyle = grad;
        this.ctx.beginPath();
        this.ctx.arc(shop.x, shop.y, 55 * pulse, 0, Math.PI * 2);
        this.ctx.fill();

        this.ctx.fillStyle = '#fef08a';
        this.ctx.font = 'bold 13px sans-serif';
        this.ctx.textAlign = 'center';
        const floatY = shop.y - 120 - Math.sin(Date.now() / 350) * 5;
        this.ctx.shadowBlur = 8;
        this.ctx.shadowColor = '#f59e0b';
        this.ctx.fillText('🛒 MERCHANT SHOP', shop.x, floatY);
        this.ctx.restore();
      } else {
        this.ctx.save();
        this.ctx.fillStyle = '#cbd5e1';
        this.ctx.font = 'bold 12px sans-serif';
        this.ctx.textAlign = 'center';
        const floatY = shop.y - 120;
        this.ctx.shadowBlur = 4;
        this.ctx.shadowColor = '#000000';
        this.ctx.fillText('🔒 SHOP (HUMAN ONLY)', shop.x, floatY);
        this.ctx.restore();
      }
    } else {
      this.ctx.save();
      this.ctx.fillStyle = '#94a3b8';
      this.ctx.font = 'bold 11px sans-serif';
      this.ctx.textAlign = 'center';
      const floatY = shop.y - 120;
      this.ctx.fillText('🏚️ CLOSED', shop.x, floatY);
      this.ctx.restore();
    }

    if (this.shopImg && this.shopImg.complete && this.shopImg.naturalWidth > 0) {
      this.ctx.save();
      if (shop.visited) {
        this.ctx.filter = 'grayscale(80%) brightness(50%)';
      } else if (!isDay) {
        this.ctx.filter = 'brightness(70%)';
      }
      const w = 120;
      const h = 120;
      const drawX = shop.x - w / 2;
      const drawY = shop.y - h / 2 - 20;
      this.ctx.drawImage(this.shopImg, drawX, drawY, w, h);
      this.ctx.restore();
    } else {
      this.ctx.save();
      this.ctx.fillStyle = shop.visited ? '#475569' : '#d97706';
      this.ctx.fillRect(shop.x - 30, shop.y - 50, 60, 50);
      this.ctx.restore();
    }
  }

  private renderShrinesAndShopsYOrdered() {
    const width = this.canvas.width;
    const height = this.canvas.height;
    const zoomScale = this.getCameraZoom();
    const halfW = width / (2 * zoomScale) + 200;
    const halfH = height / (2 * zoomScale) + 300;

    type RenderItem =
      | { type: 'shrine'; y: number; item: Shrine }
      | { type: 'shop'; y: number; item: Shop };

    const items: RenderItem[] = [];

    for (const shrine of this.shrines) {
      if (
        shrine.x >= this.player.x - halfW &&
        shrine.x <= this.player.x + halfW &&
        shrine.y >= this.player.y - halfH &&
        shrine.y <= this.player.y + halfH
      ) {
        items.push({ type: 'shrine', y: shrine.y, item: shrine });
      }
    }

    for (const shop of this.shops) {
      if (
        shop.x >= this.player.x - halfW &&
        shop.x <= this.player.x + halfW &&
        shop.y >= this.player.y - halfH &&
        shop.y <= this.player.y + halfH
      ) {
        items.push({ type: 'shop', y: shop.y, item: shop });
      }
    }

    items.sort((a, b) => a.y - b.y);

    for (const entry of items) {
      if (entry.type === 'shrine') {
        this.renderSingleShrine(entry.item);
      } else {
        this.renderSingleShop(entry.item);
      }
    }
  }

  private renderNets() {
    const width = this.canvas.width;
    const height = this.canvas.height;
    const zoomScale = this.getCameraZoom();
    const halfW = width / (2 * zoomScale) + 100;
    const halfH = height / (2 * zoomScale) + 100;

    for (const net of this.nets) {
      if (
        net.x < this.player.x - halfW ||
        net.x > this.player.x + halfW ||
        net.y < this.player.y - halfH ||
        net.y > this.player.y + halfH
      ) {
        continue;
      }

      this.ctx.save();
      const progress = net.lifeMs / net.maxLifeMs;
      const alpha = Math.min(1.0, progress * 2.0);
      this.ctx.globalAlpha = alpha;

      const timeAlive = net.maxLifeMs - net.lifeMs;
      const scaleProgress = Math.min(1.0, timeAlive / 300);
      const scaleEase = Math.sin((scaleProgress * Math.PI) / 2);
      const r = net.radius * scaleEase;

      this.ctx.beginPath();
      this.ctx.arc(net.x, net.y, r, 0, Math.PI * 2);
      this.ctx.fillStyle = 'rgba(202, 138, 4, 0.20)';
      this.ctx.fill();
      this.ctx.strokeStyle = '#ca8a04';
      this.ctx.lineWidth = 2.5;
      this.ctx.stroke();

      this.ctx.strokeStyle = '#facc15';
      this.ctx.lineWidth = 1.5;
      const steps = 4;
      const stepSize = (r * 2) / (steps + 1);

      for (let i = 1; i <= steps; i++) {
        const offset = -r + i * stepSize;
        const h = Math.sqrt(Math.max(0, r * r - offset * offset));

        this.ctx.beginPath();
        this.ctx.moveTo(net.x + offset, net.y - h);
        this.ctx.lineTo(net.x + offset, net.y + h);
        this.ctx.stroke();

        this.ctx.beginPath();
        this.ctx.moveTo(net.x - h, net.y + offset);
        this.ctx.lineTo(net.x + h, net.y + offset);
        this.ctx.stroke();
      }

      this.ctx.restore();
    }

    // Render Flying Nets in Mid-Air
    for (const fn of this.flyingNets) {
      if (
        fn.currentX < this.player.x - halfW ||
        fn.currentX > this.player.x + halfW ||
        fn.currentY < this.player.y - halfH ||
        fn.currentY > this.player.y + halfH
      ) {
        continue;
      }

      const arcHeight = Math.sin(fn.progress * Math.PI) * 55;
      const drawY = fn.currentY - arcHeight;

      this.ctx.save();

      // 1. Ground Shadow
      this.ctx.beginPath();
      this.ctx.ellipse(fn.currentX, fn.currentY, 16, 7, 0, 0, Math.PI * 2);
      this.ctx.fillStyle = 'rgba(0, 0, 0, 0.35)';
      this.ctx.fill();

      // 2. Flying Spinning Net
      this.ctx.translate(fn.currentX, drawY);
      this.ctx.rotate(fn.rotation);

      const r = 22;
      // Outer ring
      this.ctx.beginPath();
      this.ctx.arc(0, 0, r, 0, Math.PI * 2);
      this.ctx.fillStyle = 'rgba(202, 138, 4, 0.40)';
      this.ctx.fill();
      this.ctx.strokeStyle = '#ca8a04';
      this.ctx.lineWidth = 2.5;
      this.ctx.stroke();

      // Grid webs
      this.ctx.strokeStyle = '#facc15';
      this.ctx.lineWidth = 1.5;
      const steps = 4;
      const stepSize = (r * 2) / (steps + 1);

      for (let i = 1; i <= steps; i++) {
        const offset = -r + i * stepSize;
        const h = Math.sqrt(Math.max(0, r * r - offset * offset));

        this.ctx.beginPath();
        this.ctx.moveTo(offset, -h);
        this.ctx.lineTo(offset, h);
        this.ctx.stroke();

        this.ctx.beginPath();
        this.ctx.moveTo(-h, offset);
        this.ctx.lineTo(h, offset);
        this.ctx.stroke();
      }

      this.ctx.restore();
    }
  }

  private updateShopsSectorSpawns() {
    const sectorSize = 1000;
    const pSx = Math.floor(this.player.x / sectorSize);
    const pSy = Math.floor(this.player.y / sectorSize);

    for (let sx = pSx - 4; sx <= pSx + 4; sx++) {
      for (let sy = pSy - 4; sy <= pSy + 4; sy++) {
        const key = `${sx},${sy}`;
        if (this.generatedShopSectors.has(key)) continue;
        this.generatedShopSectors.add(key);

        const h = Math.abs(this.getTileHash(sx * 89 + 43, sy * 197 + 61));

        // ~38% chance per sector to contain a shop (about half the frequency of shrines at 75%)
        if (h % 100 < 38) {
          const offsetX = 200 + (h % 600);
          const offsetY = 200 + ((h >> 4) % 600);
          const x = sx * sectorSize + offsetX;
          const y = sy * sectorSize + offsetY;

          const distFromStart = Math.hypot(x - this.canvas.width / 2, y - this.canvas.height / 2);
          if (distFromStart > 350) {
            this.shops.push({
              id: key,
              x,
              y,
              visited: false,
            });
          }
        }
      }
    }
  }

  private checkShopCollisions() {
    if (this.isPaused || !this.isRunning) return;

    for (const shop of this.shops) {
      if (shop.visited) continue;

      if (isWithinDistance(this.player.x, this.player.y, shop.x, shop.y, 55)) {
        // Shops are ONLY open during the day (to human-form players)
        if (this.player.form !== 'human') {
          continue;
        }

        this.addParticleBurst(shop.x, shop.y, '#f59e0b', 35);
        this.addParticleBurst(shop.x, shop.y - 40, '#facc15', 25);
        sound.playLevelUp();
        vibrateLevelUp();

        this.pause();

        const shopInfo = this.generateShopOptions(shop.id);
        this.callbacks.onShopVisited?.(shopInfo);
        break;
      }
    }
  }

  public generateShopOptions(shopId: string): ShopInfo {
    const options: ShopOption[] = [];
    const ownedCount = this.activeWeapons.length + this.activePassives.length;

    // Available new weapons (not owned, not form-exclusive to werewolf)
    const availableNewWeapons = Object.keys(WEAPONS).filter((id) => {
      const def = WEAPONS[id as WeaponType];
      if (def.formExclusive && def.formExclusive === 'werewolf') return false;
      return !this.activeWeapons.some((w) => w.id === id);
    }) as WeaponType[];

    // Available new passives (not owned, not form-exclusive to werewolf)
    const availableNewPassives = Object.keys(PASSIVES).filter((id) => {
      const def = PASSIVES[id as PassiveType];
      if (def.formExclusive && def.formExclusive === 'werewolf') return false;
      return !this.activePassives.some((p) => p.id === id);
    }) as PassiveType[];

    // Upgradeable active weapons
    const upgradeableWeapons = this.activeWeapons.filter(
      (w) => w.level < WEAPONS[w.id].maxLevel
    );

    // Upgradeable active passives
    const upgradeablePassives = this.activePassives.filter(
      (p) => p.level < PASSIVES[p.id].maxLevel
    );

    const pickedKeys = new Set<string>();

    while (options.length < 3) {
      const canNew = availableNewWeapons.length > 0 || availableNewPassives.length > 0;
      const canUpgrade = upgradeableWeapons.length > 0 || upgradeablePassives.length > 0;

      if (!canNew && !canUpgrade) break;

      let isUpgrade = false;
      if (canNew && canUpgrade) {
        isUpgrade = Math.random() < 0.5;
      } else if (canUpgrade) {
        isUpgrade = true;
      } else {
        isUpgrade = false;
      }

      if (isUpgrade) {
        const canWpUpg = upgradeableWeapons.some((w) => !pickedKeys.has(`upgrade_${w.id}`));
        const canPasUpg = upgradeablePassives.some((p) => !pickedKeys.has(`upgrade_${p.id}`));

        if (!canWpUpg && !canPasUpg) {
          if (canNew) { isUpgrade = false; }
          else break;
        } else {
          const doWp = canWpUpg && (!canPasUpg || Math.random() < 0.5);

          if (doWp) {
            const unpicked = upgradeableWeapons.filter((w) => !pickedKeys.has(`upgrade_${w.id}`));
            const choice = unpicked[Math.floor(Math.random() * unpicked.length)];
            pickedKeys.add(`upgrade_${choice.id}`);
            const def = WEAPONS[choice.id];

            // Boost distribution: 70% +1 level, 22% +2 levels, 8% +3 levels
            const r = Math.random();
            let boost = r < 0.70 ? 1 : r < 0.92 ? 2 : 3;
            boost = Math.min(boost, def.maxLevel - choice.level);
            const targetLevel = choice.level + boost;

            const boostMult = boost === 1 ? 1.0 : boost === 2 ? 1.8 : 2.5;
            const price = Math.round((30 + choice.level * 25) * boostMult);

            options.push({
              optionType: 'upgrade',
              itemType: 'weapon',
              id: choice.id,
              name: def.name,
              icon: def.icon,
              description: `Upgrade ${def.name} by +${boost} Lvl${boost > 1 ? 's' : ''} (to Lvl ${targetLevel}). ${def.description}`,
              level: targetLevel,
              currentLevel: choice.level,
              boostLevel: boost,
              price,
            });
          } else {
            const unpicked = upgradeablePassives.filter((p) => !pickedKeys.has(`upgrade_${p.id}`));
            const choice = unpicked[Math.floor(Math.random() * unpicked.length)];
            pickedKeys.add(`upgrade_${choice.id}`);
            const def = PASSIVES[choice.id];

            const r = Math.random();
            let boost = r < 0.70 ? 1 : r < 0.92 ? 2 : 3;
            boost = Math.min(boost, def.maxLevel - choice.level);
            const targetLevel = choice.level + boost;

            const boostMult = boost === 1 ? 1.0 : boost === 2 ? 1.8 : 2.5;
            const price = Math.round((25 + choice.level * 20) * boostMult);

            options.push({
              optionType: 'upgrade',
              itemType: 'passive',
              id: choice.id,
              name: def.name,
              icon: def.icon,
              description: `Upgrade ${def.name} by +${boost} Lvl${boost > 1 ? 's' : ''} (to Lvl ${targetLevel}). ${def.description}`,
              level: targetLevel,
              currentLevel: choice.level,
              boostLevel: boost,
              price,
            });
          }
          continue;
        }
      }

      // New Item Path
      const canWpNew = availableNewWeapons.some((id) => !pickedKeys.has(`new_${id}`));
      const canPasNew = availableNewPassives.some((id) => !pickedKeys.has(`new_${id}`));

      if (!canWpNew && !canPasNew) {
        break;
      }

      const doWpNew = canWpNew && (!canPasNew || Math.random() < 0.5);

      if (doWpNew) {
        const unpicked = availableNewWeapons.filter((id) => !pickedKeys.has(`new_${id}`));
        const id = unpicked[Math.floor(Math.random() * unpicked.length)];
        pickedKeys.add(`new_${id}`);
        const def = WEAPONS[id];

        // Level distribution: 70% level 1, 22% level 2, 8% level 3
        const r = Math.random();
        let startLevel = r < 0.70 ? 1 : r < 0.92 ? 2 : 3;
        startLevel = Math.min(startLevel, def.maxLevel);

        const lvlMult = startLevel === 1 ? 1.0 : startLevel === 2 ? 1.6 : 2.3;
        const price = Math.round((45 + ownedCount * 35) * lvlMult);

        options.push({
          optionType: 'new_item',
          itemType: 'weapon',
          id,
          name: def.name,
          icon: def.icon,
          description: def.description,
          level: startLevel,
          price,
        });
      } else {
        const unpicked = availableNewPassives.filter((id) => !pickedKeys.has(`new_${id}`));
        const id = unpicked[Math.floor(Math.random() * unpicked.length)];
        pickedKeys.add(`new_${id}`);
        const def = PASSIVES[id];

        const r = Math.random();
        let startLevel = r < 0.70 ? 1 : r < 0.92 ? 2 : 3;
        startLevel = Math.min(startLevel, def.maxLevel);

        const lvlMult = startLevel === 1 ? 1.0 : startLevel === 2 ? 1.6 : 2.3;
        const price = Math.round((35 + ownedCount * 30) * lvlMult);

        options.push({
          optionType: 'new_item',
          itemType: 'passive',
          id,
          name: def.name,
          icon: def.icon,
          description: def.description,
          level: startLevel,
          price,
        });
      }
    }

    return { shopId, options };
  }

  public applyShopPurchase(option: ShopOption) {
    if (option.itemType === 'weapon') {
      const existing = this.activeWeapons.find((w) => w.id === option.id);
      if (existing) {
        existing.level = option.level;
      } else {
        this.activeWeapons.push({
          id: option.id as WeaponType,
          level: option.level,
          lastFired: 0,
        });
      }
    } else {
      const existing = this.activePassives.find((p) => p.id === option.id);
      if (existing) {
        existing.level = option.level;
      } else {
        this.activePassives.push({
          id: option.id as PassiveType,
          level: option.level,
        });
      }
    }
  }

  public markShopVisited(shopId: string) {
    const shop = this.shops.find((s) => s.id === shopId);
    if (shop) {
      shop.visited = true;
    }
  }
}
