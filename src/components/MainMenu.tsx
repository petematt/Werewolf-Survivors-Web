import React, { useState } from 'react';
import { motion } from 'motion/react';
import { PersistentData } from '../types/game';
import { STAGES } from '../game/constants';
import { Play, ShoppingBag, Trophy, Moon, Sun, Shield, Flame, Smartphone, Volume2, VolumeX, Vibrate, Maximize, Minimize } from 'lucide-react';
import { useFullscreen } from '../hooks/useFullscreen';

interface MainMenuProps {
  persistentData: PersistentData;
  selectedStageId: string;
  onSelectStage: (stageId: string) => void;
  onStartGame: () => void;
  onOpenShop: () => void;
  onOpenAchievements: () => void;
  onToggleSound: () => void;
  onToggleHaptics: () => void;
}

export const MainMenu: React.FC<MainMenuProps> = ({
  persistentData,
  selectedStageId,
  onSelectStage,
  onStartGame,
  onOpenShop,
  onOpenAchievements,
  onToggleSound,
  onToggleHaptics,
}) => {
  const [showHowToPlay, setShowHowToPlay] = useState(false);
  const { isFullscreen, toggleFullscreen } = useFullscreen();

  const formatTime = (secs: number) => {
    const mins = Math.floor(secs / 60);
    const s = secs % 60;
    return `${mins}m ${s}s`;
  };

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      transition={{ duration: 0.25 }}
      className="relative flex min-h-screen w-full flex-col items-center justify-between bg-slate-950 p-4 text-white overflow-y-auto select-none"
    >
      {/* Background Graphic Accents */}
      <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_top,_var(--tw-gradient-stops))] from-red-950/40 via-slate-950 to-slate-950 pointer-events-none" />

      {/* Top Header Bar */}
      <div className="relative z-10 flex w-full max-w-xl items-center justify-between pt-2">
        <div className="flex items-center gap-2">
          <div className="flex items-center gap-1.5 rounded-lg border border-purple-500/30 bg-purple-500/10 px-3 py-1 text-xs font-bold text-purple-300" title="Lunar Shards (Meta Currency)">
            <span>🔮 {persistentData.lunarShards} Shards</span>
          </div>
          <div className="flex items-center gap-1.5 rounded-lg border border-red-500/30 bg-red-500/10 px-3 py-1 text-xs font-bold text-red-400" title="Ichor Crystals (High Tier Meta Currency)">
            <span>🩸 {persistentData.ichorCrystals} Crystals</span>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <button
            onClick={onToggleSound}
            className="flex h-9 w-9 items-center justify-center rounded-lg border border-slate-800 bg-slate-900 text-slate-300 hover:text-white"
            title="Toggle Sound"
          >
            {persistentData.settings.soundEnabled ? (
              <Volume2 className="h-4 w-4 text-emerald-400" />
            ) : (
              <VolumeX className="h-4 w-4 text-slate-500" />
            )}
          </button>

          <button
            onClick={toggleFullscreen}
            className="flex h-9 w-9 items-center justify-center rounded-lg border border-slate-800 bg-slate-900 text-slate-300 hover:text-white"
            title={isFullscreen ? 'Exit Fullscreen' : 'Fullscreen'}
          >
            {isFullscreen ? (
              <Minimize className="h-4 w-4 text-cyan-400" />
            ) : (
              <Maximize className="h-4 w-4 text-slate-300 hover:text-cyan-400" />
            )}
          </button>

          <button
            onClick={onToggleHaptics}
            className="flex h-9 w-9 items-center justify-center rounded-lg border border-slate-800 bg-slate-900 text-slate-300 hover:text-white"
            title="Toggle Haptics"
          >
            <Vibrate className={`h-4 w-4 ${persistentData.settings.hapticsEnabled ? 'text-amber-400' : 'text-slate-500'}`} />
          </button>
        </div>
      </div>

      {/* Main Title & Hero Banner */}
      <div className="relative z-10 flex flex-col items-center text-center my-6 max-w-md">
        <div className="inline-flex items-center gap-2 rounded-full border border-red-500/40 bg-red-500/10 px-4 py-1 text-xs font-bold text-red-400 uppercase tracking-widest mb-3">
          <Moon className="h-4 w-4 fill-red-400" /> ROGUELITE SURVIVAL
        </div>

        <h1 className="text-4xl sm:text-5xl font-black tracking-tight text-transparent bg-clip-text bg-gradient-to-br from-slate-100 via-slate-200 to-red-500 drop-shadow-lg">
          WEREWOLF SURVIVORS
        </h1>

        <p className="mt-2 text-xs text-slate-400 leading-relaxed px-2">
          Harness the cursed lunar moonlight! Transform between Werewolf and Human form to dominate swarms of inquisitors and dark hounds.
        </p>

        {/* High Score Badge */}
        {persistentData.highScoreTime > 0 && (
          <div className="mt-3 inline-flex items-center gap-2 rounded-lg border border-amber-500/30 bg-slate-900 px-3 py-1 text-xs font-semibold text-amber-400">
            <span>BEST SURVIVAL:</span>
            <strong className="text-white">{formatTime(persistentData.highScoreTime)}</strong>
            <span className="text-slate-500">|</span>
            <span>KILLS: {persistentData.totalKills}</span>
          </div>
        )}
      </div>

      {/* Stage Selector */}
      <div className="relative z-10 w-full max-w-md rounded-2xl border border-slate-800 bg-slate-900/80 p-4 backdrop-blur-md">
        <h3 className="text-xs font-bold uppercase text-slate-400 tracking-wider mb-3">
          SELECT HUNTING GROUND
        </h3>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
          {Object.values(STAGES).map((stg) => {
            const isSelected = selectedStageId === stg.id;
            return (
              <button
                key={stg.id}
                onClick={() => onSelectStage(stg.id)}
                className={`flex flex-col items-start rounded-xl border p-3 text-left transition-all ${
                  isSelected
                    ? 'border-red-500 bg-red-950/30 text-white shadow-lg shadow-red-950/50'
                    : 'border-slate-800 bg-slate-900/60 text-slate-400 hover:border-slate-700 hover:text-slate-200'
                }`}
              >
                <div className="flex items-center justify-between w-full">
                  <span className="font-bold text-sm text-slate-200">{stg.name}</span>
                  <span className="text-[10px] font-bold text-amber-400 bg-amber-950/60 px-1.5 py-0.5 rounded">
                    {stg.recommendedLevel}
                  </span>
                </div>
                <p className="text-[11px] text-slate-400 mt-1 line-clamp-2">{stg.description}</p>
              </button>
            );
          })}
        </div>
      </div>

      {/* Action Buttons */}
      <div className="relative z-10 w-full max-w-md flex flex-col gap-2.5 my-6">
        <button
          onClick={onStartGame}
          className="group relative flex w-full items-center justify-center gap-3 rounded-2xl bg-gradient-to-r from-red-600 via-rose-600 to-red-700 py-4 text-base font-black text-white shadow-xl shadow-red-600/30 transition-all hover:scale-[1.02] active:scale-95"
        >
          <Play className="h-6 w-6 fill-white transition-transform group-hover:scale-110" />
          <span>START HUNTING</span>
        </button>

        <div className="grid grid-cols-2 gap-2">
          <button
            onClick={onOpenShop}
            className="flex items-center justify-center gap-2 rounded-xl border border-amber-500/40 bg-amber-500/10 py-3 text-xs font-bold text-amber-400 hover:bg-amber-500/20 active:scale-95 transition-all"
          >
            <ShoppingBag className="h-4 w-4" /> Persistent Shop
          </button>

          <button
            onClick={onOpenAchievements}
            className="flex items-center justify-center gap-2 rounded-xl border border-purple-500/40 bg-purple-500/10 py-3 text-xs font-bold text-purple-300 hover:bg-purple-500/20 active:scale-95 transition-all"
          >
            <Trophy className="h-4 w-4" /> Achievements
          </button>
        </div>

        <button
          onClick={() => setShowHowToPlay(!showHowToPlay)}
          className="text-xs text-slate-400 hover:text-slate-200 text-center py-1 underline"
        >
          {showHowToPlay ? 'Hide Guide' : 'How to Play & Controls'}
        </button>
      </div>

      {/* How To Play Accordion */}
      {showHowToPlay && (
        <div className="relative z-10 w-full max-w-md rounded-2xl border border-slate-800 bg-slate-900/90 p-4 text-xs text-slate-300 mb-6 space-y-3">
          <div className="flex items-center gap-2 font-bold text-slate-100 border-b border-slate-800 pb-2">
            <Smartphone className="h-4 w-4 text-red-400" /> Controls & Mechanics
          </div>

          <div className="flex items-start gap-2">
            <Moon className="h-4 w-4 text-red-400 shrink-0 mt-0.5" />
            <div>
              <strong className="text-slate-100">Touch Virtual Joystick:</strong> Touch anywhere on the screen to spawn the movement joystick. Drag to move, release finger to stop. WASD keys work on desktop!
            </div>
          </div>

          <div className="flex items-start gap-2">
            <Sun className="h-4 w-4 text-amber-400 shrink-0 mt-0.5" />
            <div>
              <strong className="text-slate-100">Day/Night Werewolf Cycle:</strong>
              <ul className="list-disc list-inside mt-1 space-y-1 text-slate-400">
                <li><span className="text-red-400 font-semibold">Night (Werewolf):</span> Physical weapons boosted (+50% Dmg, +30% Speed). Melee Claw aura active!</li>
                <li><span className="text-cyan-300 font-semibold">Day (Human):</span> Magical weapons boosted (+50% Dmg, -30% Cooldown). +50% XP drops!</li>
              </ul>
            </div>
          </div>

          <div className="flex items-start gap-2">
            <Flame className="h-4 w-4 text-cyan-400 shrink-0 mt-0.5" />
            <div>
              <strong className="text-slate-100">Weapon Synergies:</strong> Combine matching weapons (e.g. Frost Orb + Earth Shatter) to trigger explosive combos that shatter frozen foes!
            </div>
          </div>
        </div>
      )}

      {/* Footer */}
      <div className="relative z-10 text-[10px] text-slate-600 text-center pb-2">
        Werewolf Survivors &bull; Mobile-Optimized Touch Gameplay &bull; Offline Progress Saved
      </div>
    </motion.div>
  );
};
