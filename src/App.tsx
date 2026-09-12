import React, { useState, useEffect, useRef, useCallback } from 'react';
import { AnimatePresence } from 'motion/react';
import { GameEngine } from './game/GameEngine';
import { FormType, WeaponInstance, PassiveInstance, PersistentData, GameStats, ShrineUpgradeInfo, ShopInfo, ShopOption } from './types/game';
import { loadSaveData, saveSaveData } from './utils/storage';
import { sound } from './utils/audio';
import { setHapticsEnabled } from './utils/haptics';
import { META_UPGRADES } from './game/constants';

// Components
import { MainMenu } from './components/MainMenu';
import { HUD } from './components/HUD';
import { VirtualJoystick } from './components/VirtualJoystick';
import { LevelUpModal } from './components/LevelUpModal';
import { MetaShopModal } from './components/MetaShopModal';
import { AchievementsModal } from './components/AchievementsModal';
import { PauseModal } from './components/PauseModal';
import { GameOverModal } from './components/GameOverModal';
import { ShrineModal } from './components/ShrineModal';
import { ShopModal } from './components/ShopModal';

type AppState = 'menu' | 'playing' | 'level_up' | 'paused' | 'game_over' | 'shop' | 'achievements' | 'shrine' | 'in_game_shop';

export default function App() {
  const [appState, setAppState] = useState<AppState>('menu');
  const [persistentData, setPersistentData] = useState<PersistentData>(() => loadSaveData());
  const [selectedStageId, setSelectedStageId] = useState<string>('forest');

  // Active Game State
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const engineRef = useRef<GameEngine | null>(null);

  const [currentHp, setCurrentHp] = useState(100);
  const [maxHp, setMaxHp] = useState(100);
  const [xp, setXp] = useState(0);
  const [xpNext, setXpNext] = useState(50);
  const [level, setLevel] = useState(1);
  const [form, setForm] = useState<FormType>('human');
  const [phaseTimer, setPhaseTimer] = useState(25);
  const [activeWeapons, setActiveWeapons] = useState<WeaponInstance[]>([]);
  const [activePassives, setActivePassives] = useState<PassiveInstance[]>([]);
  const [activeSynergies, setActiveSynergies] = useState<string[]>([]);
  const [gameStats, setGameStats] = useState<GameStats>({
    timeSurvivedSeconds: 0,
    kills: 0,
    goldEarned: 0,
    lunarShardsEarned: 0,
    ichorCrystalsEarned: 0,
    damageDealt: 0,
    transformationsCount: 0,
    maxLevel: 1,
    synergiesUnlocked: [],
  });

  // Level Up Upgrade Choices
  const [levelUpChoices, setLevelUpChoices] = useState<
    Array<{ type: 'weapon' | 'passive'; id: string; level: number }>
  >([]);
  const [rerollsAvailable, setRerollsAvailable] = useState<number>(0);
  const [isNewHighScore, setIsNewHighScore] = useState(false);
  const [shrineInfo, setShrineInfo] = useState<ShrineUpgradeInfo | null>(null);
  const [shopInfo, setShopInfo] = useState<ShopInfo | null>(null);

  // Sync sound / haptics state on load
  useEffect(() => {
    sound.setSoundEnabled(persistentData.settings.soundEnabled);
    sound.setMusicEnabled(persistentData.settings.musicEnabled);
    setHapticsEnabled(persistentData.settings.hapticsEnabled);
  }, [persistentData.settings]);

  // Handle Window Resize for Canvas
  useEffect(() => {
    const updateCanvasSize = () => {
      if (canvasRef.current) {
        canvasRef.current.width = window.innerWidth;
        canvasRef.current.height = window.innerHeight;
      }
    };

    updateCanvasSize();
    window.addEventListener('resize', updateCanvasSize);
    return () => window.removeEventListener('resize', updateCanvasSize);
  }, []);

  // Save data helper
  const updateAndSaveData = useCallback((updater: (prev: PersistentData) => PersistentData) => {
    setPersistentData((prev) => {
      const updated = updater(prev);
      saveSaveData(updated);
      return updated;
    });
  }, []);

  // Start a New Game Run
  const handleStartGame = () => {
    if (!canvasRef.current) return;

    sound.playClick();
    setAppState('playing');
    setIsNewHighScore(false);

    // Reset game stats for a fresh run starting with 0 gold, 0 kills, etc.
    const freshStats: GameStats = {
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
    setGameStats(freshStats);

    // Calculate rerolls available from meta upgrades
    const metaRerolls = persistentData.metaUpgrades.rerolls || 0;
    setRerollsAvailable(metaRerolls);

    // Initialize Canvas Game Engine
    const engine = new GameEngine(
      canvasRef.current,
      persistentData,
      selectedStageId,
      {
        onLevelUp: (choices) => {
          setLevelUpChoices(choices);
          setAppState('level_up');
        },
        onGameOver: (finalStats) => {
          // Process game over rewards & progress
          let newRecord = false;
          updateAndSaveData((prev) => {
            if (finalStats.timeSurvivedSeconds > prev.highScoreTime) {
              newRecord = true;
            }
            return {
              ...prev,
              gold: 0,
              totalGoldEarned: prev.totalGoldEarned + finalStats.goldEarned,
              totalKills: prev.totalKills + finalStats.kills,
              highScoreTime: Math.max(prev.highScoreTime, finalStats.timeSurvivedSeconds),
              runsCompleted: prev.runsCompleted + 1,
            };
          });

          setIsNewHighScore(newRecord);
          setGameStats(finalStats);
          setAppState('game_over');
        },
        onStatsUpdate: (stats, hpVal, maxHpVal, xpVal, xpNextVal, lvlVal, formVal, timerVal) => {
          setGameStats({ ...stats });
          setCurrentHp(hpVal);
          setMaxHp(maxHpVal);
          setXp(xpVal);
          setXpNext(xpNextVal);
          setLevel(lvlVal);
          setForm(formVal);
          setPhaseTimer(timerVal);

          if (engineRef.current) {
            setActiveWeapons([...engineRef.current.activeWeapons]);
            setActivePassives([...engineRef.current.activePassives]);
            setActiveSynergies([...engineRef.current.activeSynergies]);
          }
        },
        onShrineVisited: (info) => {
          setShrineInfo(info);
          setAppState('shrine');
        },
        onShopVisited: (info) => {
          setShopInfo(info);
          setAppState('in_game_shop');
        },
      }
    );

    engineRef.current = engine;
    engine.start();
  };

  // Level Up Choice Selection
  const handleSelectUpgradeChoice = (choice: { type: 'weapon' | 'passive'; id: string; level: number }) => {
    sound.playClick();
    if (engineRef.current) {
      engineRef.current.applyUpgrade(choice);
    }
    setAppState('playing');
  };

  // Merchant Shop Callbacks
  const handleBuyShopOption = (option: ShopOption) => {
    if (!engineRef.current || !shopInfo) return;

    const price = option.price;
    engineRef.current.stats.goldEarned = Math.max(0, engineRef.current.stats.goldEarned - price);
    setGameStats((prev) => ({
      ...prev,
      goldEarned: Math.max(0, prev.goldEarned - price),
    }));

    engineRef.current.applyShopPurchase(option);
    engineRef.current.markShopVisited(shopInfo.shopId);

    sound.playClick();
    setShopInfo(null);
    setAppState('playing');
    engineRef.current.resume();
  };

  const handleLeaveShop = () => {
    if (!engineRef.current || !shopInfo) return;
    engineRef.current.markShopVisited(shopInfo.shopId);
    sound.playClick();
    setShopInfo(null);
    setAppState('playing');
    engineRef.current.resume();
  };

  // Reroll Choices
  const handleRerollChoices = () => {
    if (rerollsAvailable <= 0) return;
    sound.playClick();
    setRerollsAvailable((prev) => prev - 1);

    if (engineRef.current) {
      // Trigger reroll in engine
      (engineRef.current as any).triggerLevelUpMenu();
    }
  };

  // Pause Controls
  const handlePause = () => {
    sound.playClick();
    if (engineRef.current) {
      engineRef.current.pause();
    }
    setAppState('paused');
  };

  const handleResume = () => {
    sound.playClick();
    if (engineRef.current) {
      engineRef.current.resume();
    }
    setAppState('playing');
  };

  const handleRestartRun = () => {
    if (engineRef.current) {
      engineRef.current.stop();
    }
    handleStartGame();
  };

  const handleQuitToMenu = () => {
    sound.playClick();
    if (engineRef.current) {
      engineRef.current.endRun();
    } else {
      setAppState('menu');
    }
  };

  const handleReturnToMenu = () => {
    sound.playClick();
    if (engineRef.current) {
      engineRef.current.stop();
      engineRef.current = null;
    }
    setAppState('menu');
  };

  // Toggle Settings
  const handleToggleSound = () => {
    const next = !persistentData.settings.soundEnabled;
    sound.setSoundEnabled(next);
    sound.setMusicEnabled(next);
    updateAndSaveData((prev) => ({
      ...prev,
      settings: { ...prev.settings, soundEnabled: next, musicEnabled: next },
    }));
  };

  const handleToggleHaptics = () => {
    const next = !persistentData.settings.hapticsEnabled;
    setHapticsEnabled(next);
    updateAndSaveData((prev) => ({
      ...prev,
      settings: { ...prev.settings, hapticsEnabled: next },
    }));
  };

  // Meta Shop Purchase
  const handleBuyUpgrade = (upgradeId: string) => {
    sound.playClick();
    updateAndSaveData((prev) => {
      const currentLevel = prev.metaUpgrades[upgradeId] || 0;
      const upg = META_UPGRADES.find((u) => u.id === upgradeId);
      if (!upg) return prev;

      const cost = Math.round(upg.costBase * Math.pow(upg.costMultiplier, currentLevel));

      if (upg.currency === 'ichor_crystals') {
        if ((prev.ichorCrystals || 0) >= cost) {
          return {
            ...prev,
            ichorCrystals: prev.ichorCrystals - cost,
            metaUpgrades: { ...prev.metaUpgrades, [upgradeId]: currentLevel + 1 },
          };
        }
      } else {
        if ((prev.lunarShards || 0) >= cost) {
          return {
            ...prev,
            lunarShards: prev.lunarShards - cost,
            metaUpgrades: { ...prev.metaUpgrades, [upgradeId]: currentLevel + 1 },
          };
        }
      }
      return prev;
    });
  };

  return (
    <div className="relative h-screen w-screen bg-slate-950 overflow-hidden font-sans select-none touch-none">
      {/* 1. Main Canvas Game Surface */}
      <canvas
        ref={canvasRef}
        className="absolute inset-0 h-full w-full block bg-slate-950"
      />

      {/* 2. Touch Virtual Joystick Visual Overlay */}
      {appState === 'playing' && engineRef.current?.joystick && (
        <VirtualJoystick
          active={engineRef.current.joystick.active}
          startX={engineRef.current.joystick.startX}
          startY={engineRef.current.joystick.startY}
          currX={engineRef.current.joystick.currX}
          currY={engineRef.current.joystick.currY}
          opacity={persistentData.settings.joystickOpacity}
        />
      )}

      {/* 3. In-Game HUD Header */}
      {(appState === 'playing' || appState === 'level_up' || appState === 'paused' || appState === 'shrine' || appState === 'in_game_shop') && (
        <HUD
          hp={currentHp}
          maxHp={maxHp}
          xp={xp}
          xpNext={xpNext}
          level={level}
          kills={gameStats.kills}
          gold={gameStats.goldEarned}
          lunarShards={gameStats.lunarShardsEarned}
          ichorCrystals={gameStats.ichorCrystalsEarned}
          timeSurvived={gameStats.timeSurvivedSeconds}
          form={form}
          phaseTimer={phaseTimer}
          activeWeapons={activeWeapons}
          activePassives={activePassives}
          activeSynergies={activeSynergies}
          onPause={handlePause}
        />
      )}

      {/* 4. Main Menu View */}
      <AnimatePresence>
        {appState === 'menu' && (
          <MainMenu
            key="main-menu"
            persistentData={persistentData}
            selectedStageId={selectedStageId}
            onSelectStage={setSelectedStageId}
            onStartGame={handleStartGame}
            onOpenShop={() => setAppState('shop')}
            onOpenAchievements={() => setAppState('achievements')}
            onToggleSound={handleToggleSound}
            onToggleHaptics={handleToggleHaptics}
          />
        )}

        {/* 5. Level Up Choice Modal */}
        {appState === 'level_up' && (
          <LevelUpModal
            key="level-up"
            choices={levelUpChoices}
            rerollsAvailable={rerollsAvailable}
            onSelectChoice={handleSelectUpgradeChoice}
            onReroll={handleRerollChoices}
          />
        )}

        {/* 6. Pause Modal */}
        {appState === 'paused' && (
          <PauseModal
            key="paused"
            form={form}
            activeWeapons={activeWeapons}
            activePassives={activePassives}
            activeSynergies={activeSynergies}
            soundEnabled={persistentData.settings.soundEnabled}
            hapticsEnabled={persistentData.settings.hapticsEnabled}
            onToggleSound={handleToggleSound}
            onToggleHaptics={handleToggleHaptics}
            onResume={handleResume}
            onRestart={handleRestartRun}
            onQuitToMenu={handleQuitToMenu}
          />
        )}

        {/* 7. Game Over Summary Modal */}
        {appState === 'game_over' && (
          <GameOverModal
            key="game-over"
            stats={gameStats}
            isNewHighScore={isNewHighScore}
            onRestart={handleRestartRun}
            onQuitToMenu={handleReturnToMenu}
          />
        )}

        {/* 8. Persistent Meta Shop Modal */}
        {appState === 'shop' && (
          <MetaShopModal
            key="meta-shop"
            data={persistentData}
            onBuyUpgrade={handleBuyUpgrade}
            onClose={() => setAppState('menu')}
          />
        )}

        {/* 9. Achievements Modal */}
        {appState === 'achievements' && (
          <AchievementsModal
            key="achievements"
            data={persistentData}
            onClose={() => setAppState('menu')}
          />
        )}

        {/* 10. Shrine Modal */}
        {appState === 'shrine' && shrineInfo && (
          <ShrineModal
            key="shrine"
            info={shrineInfo}
            onContinue={() => {
              sound.playClick();
              setShrineInfo(null);
              if (engineRef.current) {
                engineRef.current.resume();
              }
              setAppState('playing');
            }}
          />
        )}

        {/* 11. In-Game Merchant Shop Modal */}
        {appState === 'in_game_shop' && shopInfo && (
          <ShopModal
            key="in-game-shop"
            shopInfo={shopInfo}
            currentGold={gameStats.goldEarned}
            onBuyOption={handleBuyShopOption}
            onLeave={handleLeaveShop}
          />
        )}
      </AnimatePresence>
    </div>
  );
}
