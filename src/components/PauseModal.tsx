import React from 'react';
import { motion } from 'motion/react';
import { WeaponInstance, PassiveInstance, FormType } from '../types/game';
import { WEAPONS, PASSIVES, SYNERGIES } from '../game/constants';
import { Play, Volume2, VolumeX, Vibrate, Home, RotateCcw, Maximize, Minimize, LogOut } from 'lucide-react';
import { useFullscreen } from '../hooks/useFullscreen';

interface PauseModalProps {
  form?: FormType;
  activeWeapons: WeaponInstance[];
  activePassives: PassiveInstance[];
  activeSynergies: string[];
  soundEnabled: boolean;
  hapticsEnabled: boolean;
  onToggleSound: () => void;
  onToggleHaptics: () => void;
  onResume: () => void;
  onRestart: () => void;
  onQuitToMenu: () => void;
}

export const PauseModal: React.FC<PauseModalProps> = ({
  form,
  activeWeapons,
  activePassives,
  activeSynergies,
  soundEnabled,
  hapticsEnabled,
  onToggleSound,
  onToggleHaptics,
  onResume,
  onRestart,
  onQuitToMenu,
}) => {
  const { isFullscreen, toggleFullscreen } = useFullscreen();

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      transition={{ duration: 0.2 }}
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 p-4 backdrop-blur-md"
    >
      <motion.div
        initial={{ opacity: 0, scale: 0.9, y: 15 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        exit={{ opacity: 0, scale: 0.9, y: 15 }}
        transition={{ duration: 0.25, ease: [0.16, 1, 0.3, 1] }}
        className="w-full max-w-md rounded-2xl border border-slate-700 bg-slate-900/95 p-6 shadow-2xl text-white"
      >
        <h2 className="text-center text-2xl font-black tracking-tight text-slate-100">
          GAME PAUSED
        </h2>

        {/* Weapons Inventory */}
        <div className="mt-4 rounded-xl border border-slate-800 bg-slate-950/60 p-3">
          <h3 className="text-xs font-bold uppercase text-slate-400 tracking-wider mb-2">
            ACTIVE WEAPONS & PASSIVES
          </h3>
          <div className="grid grid-cols-2 gap-2">
            {activeWeapons.map((w) => {
              const def = WEAPONS[w.id];
              const isDisabled = form && def?.formExclusive && def.formExclusive !== form;
              return (
                <div
                  key={w.id}
                  className={`flex items-center gap-2 rounded-lg border p-2 text-xs ${
                    isDisabled
                      ? 'border-slate-800/60 bg-slate-950/60 opacity-40'
                      : 'border-slate-800 bg-slate-900'
                  }`}
                >
                  <span className="text-lg">{def?.icon}</span>
                  <div>
                    <div className={`font-bold ${isDisabled ? 'text-slate-500 line-through' : 'text-slate-200'}`}>
                      {def?.name}
                    </div>
                    <div className="text-[10px] text-amber-400">
                      Level {w.level} {isDisabled ? '(Disabled)' : ''}
                    </div>
                  </div>
                </div>
              );
            })}
            {activePassives.map((p) => {
              const def = PASSIVES[p.id];
              const isDisabled = form && def?.formExclusive && def.formExclusive !== form;
              return (
                <div
                  key={p.id}
                  className={`flex items-center gap-2 rounded-lg border p-2 text-xs ${
                    isDisabled
                      ? 'border-slate-800/60 bg-slate-950/60 opacity-40'
                      : 'border-slate-800 bg-slate-900'
                  }`}
                >
                  <span className="text-lg">{def?.icon}</span>
                  <div>
                    <div className={`font-bold ${isDisabled ? 'text-slate-500 line-through' : 'text-slate-200'}`}>
                      {def?.name}
                    </div>
                    <div className="text-[10px] text-cyan-400">
                      Level {p.level} {isDisabled ? '(Disabled)' : ''}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>

          {/* Synergies */}
          {activeSynergies.length > 0 && (
            <div className="mt-3 border-t border-slate-800 pt-2">
              <h4 className="text-[10px] font-bold text-cyan-400 uppercase tracking-wider mb-1">
                UNLOCKED SYNERGIES
              </h4>
              <div className="flex flex-wrap gap-1">
                {activeSynergies.map((sId) => {
                  const syn = SYNERGIES.find((s) => s.id === sId);
                  return (
                    <span
                      key={sId}
                      className="rounded bg-cyan-950 border border-cyan-800 px-2 py-0.5 text-[10px] font-bold text-cyan-300"
                    >
                      {syn?.icon} {syn?.name}
                    </span>
                  );
                })}
              </div>
            </div>
          )}
        </div>

        {/* Audio & Haptic Controls */}
        <div className="mt-4 flex gap-2">
          <button
            onClick={onToggleSound}
            className="flex flex-1 items-center justify-center gap-2 rounded-xl border border-slate-700 bg-slate-800 py-2.5 text-xs font-bold text-slate-200 transition-colors hover:bg-slate-700"
          >
            {soundEnabled ? <Volume2 className="h-4 w-4 text-emerald-400" /> : <VolumeX className="h-4 w-4 text-slate-500" />}
            Sound: {soundEnabled ? 'ON' : 'OFF'}
          </button>

          <button
            onClick={toggleFullscreen}
            className="flex flex-1 items-center justify-center gap-2 rounded-xl border border-slate-700 bg-slate-800 py-2.5 text-xs font-bold text-slate-200 transition-colors hover:bg-slate-700"
          >
            {isFullscreen ? <Minimize className="h-4 w-4 text-cyan-400" /> : <Maximize className="h-4 w-4 text-slate-400" />}
            {isFullscreen ? 'Exit Full' : 'Fullscreen'}
          </button>

          <button
            onClick={onToggleHaptics}
            className="flex flex-1 items-center justify-center gap-2 rounded-xl border border-slate-700 bg-slate-800 py-2.5 text-xs font-bold text-slate-200 transition-colors hover:bg-slate-700"
          >
            <Vibrate className={`h-4 w-4 ${hapticsEnabled ? 'text-amber-400' : 'text-slate-500'}`} />
            Haptics: {hapticsEnabled ? 'ON' : 'OFF'}
          </button>
        </div>

        {/* Resume & Quit Action Buttons */}
        <div className="mt-6 flex flex-col gap-2">
          <button
            onClick={onResume}
            className="flex items-center justify-center gap-2 rounded-xl bg-gradient-to-r from-red-600 to-rose-600 py-3 text-sm font-black text-white shadow-lg shadow-red-600/30 transition-transform active:scale-95 cursor-pointer"
          >
            <Play className="h-5 w-5 fill-white" /> RESUME HUNT
          </button>

          <div className="flex gap-2">
            <button
              onClick={onRestart}
              className="flex flex-1 items-center justify-center gap-2 rounded-xl border border-slate-700 bg-slate-800 py-2.5 text-xs font-bold text-slate-300 hover:bg-slate-700 active:scale-95 cursor-pointer"
            >
              <RotateCcw className="h-4 w-4" /> Restart
            </button>

            <button
              onClick={onQuitToMenu}
              className="flex flex-1 items-center justify-center gap-2 rounded-xl border border-red-500/30 bg-red-950/40 py-2.5 text-xs font-bold text-red-300 hover:bg-red-900/60 active:scale-95 transition-colors cursor-pointer"
            >
              <LogOut className="h-4 w-4" /> End Battle
            </button>
          </div>
        </div>
      </motion.div>
    </motion.div>
  );
};
