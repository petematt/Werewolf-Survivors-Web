import React, { useEffect } from 'react';
import { motion } from 'motion/react';
import { GameStats } from '../types/game';
import confetti from 'canvas-confetti';
import { Skull, Coins, Clock, Zap, RotateCcw, Home, Award } from 'lucide-react';

interface GameOverModalProps {
  stats: GameStats;
  isNewHighScore: boolean;
  onRestart: () => void;
  onQuitToMenu: () => void;
}

export const GameOverModal: React.FC<GameOverModalProps> = ({
  stats,
  isNewHighScore,
  onRestart,
  onQuitToMenu,
}) => {
  useEffect(() => {
    if (isNewHighScore) {
      confetti({
        particleCount: 100,
        spread: 70,
        origin: { y: 0.6 },
      });
    }
  }, [isNewHighScore]);

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
      transition={{ duration: 0.2 }}
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/90 p-4 backdrop-blur-md"
    >
      <motion.div
        initial={{ opacity: 0, scale: 0.9, y: 15 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        exit={{ opacity: 0, scale: 0.9, y: 15 }}
        transition={{ duration: 0.25, ease: [0.16, 1, 0.3, 1] }}
        className="w-full max-w-md rounded-2xl border border-red-600/50 bg-slate-900/95 p-6 shadow-2xl shadow-red-950 text-white text-center"
      >
        {/* Title */}
        <div className="mb-2 inline-flex items-center gap-2 rounded-full border border-red-500/30 bg-red-500/10 px-4 py-1 text-xs font-bold text-red-500 uppercase tracking-widest">
          <Skull className="h-4 w-4" /> THE HUNT HAS ENDED
        </div>

        <h2 className="text-3xl font-black tracking-tight text-slate-100 mt-1">
          YOU'VE BEEN SLAIN
        </h2>

        {isNewHighScore && (
          <div className="mt-2 inline-flex items-center gap-1.5 rounded-lg border border-amber-500/40 bg-amber-500/20 px-3 py-1 text-xs font-black text-amber-400 animate-bounce">
            <Award className="h-4 w-4" /> NEW HIGH SURVIVAL RECORD!
          </div>
        )}

        {/* Stats Grid */}
        <div className="mt-6 grid grid-cols-2 sm:grid-cols-3 gap-2.5">
          <div className="rounded-xl border border-slate-800 bg-slate-950 p-2.5">
            <div className="flex items-center justify-center gap-1 text-[11px] font-bold text-slate-400">
              <Clock className="h-3.5 w-3.5" /> SURVIVED
            </div>
            <div className="mt-1 text-lg font-black text-amber-400">
              {formatTime(stats.timeSurvivedSeconds)}
            </div>
          </div>

          <div className="rounded-xl border border-slate-800 bg-slate-950 p-2.5">
            <div className="flex items-center justify-center gap-1 text-[11px] font-bold text-slate-400">
              <Skull className="h-3.5 w-3.5" /> SLAIN
            </div>
            <div className="mt-1 text-lg font-black text-rose-500">
              {stats.kills}
            </div>
          </div>

          <div className="rounded-xl border border-slate-800 bg-slate-950 p-2.5">
            <div className="flex items-center justify-center gap-1 text-[11px] font-bold text-slate-400">
              <Zap className="h-3.5 w-3.5" /> MAX LEVEL
            </div>
            <div className="mt-1 text-lg font-black text-cyan-400">
              LV. {stats.maxLevel}
            </div>
          </div>

          <div className="rounded-xl border border-amber-500/20 bg-amber-500/5 p-2.5">
            <div className="flex items-center justify-center gap-1 text-[11px] font-bold text-amber-400">
              <Coins className="h-3.5 w-3.5" /> GOLD
            </div>
            <div className="mt-1 text-lg font-black text-amber-300">
              +{stats.goldEarned}
            </div>
          </div>

          <div className="rounded-xl border border-purple-500/20 bg-purple-500/5 p-2.5">
            <div className="flex items-center justify-center gap-1 text-[11px] font-bold text-purple-300">
              <span>🔮</span> SHARDS
            </div>
            <div className="mt-1 text-lg font-black text-purple-300">
              +{stats.lunarShardsEarned || 0}
            </div>
          </div>

          <div className="rounded-xl border border-red-500/20 bg-red-500/5 p-2.5">
            <div className="flex items-center justify-center gap-1 text-[11px] font-bold text-red-400">
              <span>🩸</span> ICHOR
            </div>
            <div className="mt-1 text-lg font-black text-red-400">
              +{stats.ichorCrystalsEarned || 0}
            </div>
          </div>
        </div>

        {/* Action Buttons */}
        <div className="mt-6 flex gap-3">
          <button
            onClick={onRestart}
            className="flex flex-1 items-center justify-center gap-2 rounded-xl bg-gradient-to-r from-red-600 to-rose-600 py-3 text-sm font-black text-white shadow-lg shadow-red-600/30 transition-transform active:scale-95 cursor-pointer"
          >
            <RotateCcw className="h-4 w-4" /> HUNT AGAIN
          </button>

          <button
            onClick={onQuitToMenu}
            className="flex flex-1 items-center justify-center gap-2 rounded-xl border border-slate-700 bg-slate-800 py-3 text-sm font-bold text-slate-300 hover:bg-slate-700 active:scale-95 cursor-pointer"
          >
            <Home className="h-4 w-4" /> MAIN MENU
          </button>
        </div>
      </motion.div>
    </motion.div>
  );
};
