import React from 'react';
import { FormType, WeaponInstance, PassiveInstance } from '../types/game';
import { WEAPONS, PASSIVES, SYNERGIES } from '../game/constants';
import { Pause, Moon, Sun, Skull, Coins, Zap, Maximize, Minimize } from 'lucide-react';
import { useFullscreen } from '../hooks/useFullscreen';

interface HUDProps {
  hp: number;
  maxHp: number;
  xp: number;
  xpNext: number;
  level: number;
  kills: number;
  gold: number;
  lunarShards?: number;
  ichorCrystals?: number;
  timeSurvived: number;
  form: FormType;
  phaseTimer: number;
  activeWeapons: WeaponInstance[];
  activePassives: PassiveInstance[];
  activeSynergies: string[];
  onPause: () => void;
}

export const HUD: React.FC<HUDProps> = ({
  hp,
  maxHp,
  xp,
  xpNext,
  level,
  kills,
  gold,
  lunarShards = 0,
  ichorCrystals = 0,
  timeSurvived,
  form,
  phaseTimer,
  activeWeapons,
  activePassives,
  activeSynergies,
  onPause,
}) => {
  const { isFullscreen, toggleFullscreen } = useFullscreen();
  const hpPercent = Math.max(0, Math.min(100, (hp / maxHp) * 100));
  const xpPercent = Math.max(0, Math.min(100, (xp / xpNext) * 100));

  // Filter out weapons and passives that are inactive in the current form (Day vs Night)
  const activeFormWeapons = activeWeapons.filter((w) => {
    const def = WEAPONS[w.id];
    return !(def?.formExclusive && def.formExclusive !== form);
  });

  const activeFormPassives = activePassives.filter((p) => {
    const def = PASSIVES[p.id];
    return !(def?.formExclusive && def.formExclusive !== form);
  });

  const formatTime = (secs: number) => {
    const mins = Math.floor(secs / 60);
    const s = secs % 60;
    return `${mins.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;
  };

  return (
    <div className="pointer-events-none fixed inset-0 z-20 flex flex-col justify-between p-3 select-none">
      {/* Top Header Controls */}
      <div className="flex items-start justify-between gap-2">
        {/* Left: Player Status & Bars */}
        <div className="pointer-events-auto flex max-w-xs flex-col gap-1.5 rounded-xl border border-slate-800 bg-slate-900/85 p-2.5 backdrop-blur-md shadow-lg shadow-black/60">
          {/* Level & HP Header */}
          <div className="flex items-center justify-between text-xs font-semibold text-slate-200">
            <span className="flex items-center gap-1 text-amber-400">
              <Zap className="h-3.5 w-3.5 fill-amber-400" />
              LVL {level}
            </span>
            <span className="text-slate-300">
              {Math.ceil(hp)} / {maxHp} HP
            </span>
          </div>

          {/* HP Bar */}
          <div className="h-3 w-full overflow-hidden rounded-full border border-slate-700 bg-slate-950 p-0.5">
            <div
              className={`h-full rounded-full transition-all duration-200 ${
                form === 'werewolf'
                  ? 'bg-gradient-to-r from-red-600 to-rose-500 shadow-sm shadow-red-500'
                  : 'bg-gradient-to-r from-emerald-500 to-green-400'
              }`}
              style={{ width: `${hpPercent}%` }}
            />
          </div>

          {/* XP Bar */}
          <div className="h-2 w-full overflow-hidden rounded-full border border-slate-800 bg-slate-950">
            <div
              className="h-full rounded-full bg-gradient-to-r from-cyan-500 to-blue-400 transition-all duration-200"
              style={{ width: `${xpPercent}%` }}
            />
          </div>

          {/* Active Weapon/Passive Mini Badges (3 per row, level in bottom-right corner) */}
          {(activeFormWeapons.length > 0 || activeFormPassives.length > 0) && (
            <div className="mt-1 grid grid-cols-3 gap-1.5 w-fit">
              {activeFormWeapons.map((w) => {
                const def = WEAPONS[w.id];
                return (
                  <div
                    key={w.id}
                    className="relative flex h-8 w-8 items-center justify-center rounded-lg border border-slate-700/80 bg-slate-900/90 text-base shadow-sm"
                    title={`${def?.name} (Lv.${w.level})`}
                  >
                    <span>{def?.icon}</span>
                    <span className="absolute -bottom-1 -right-1 flex h-4 min-w-[14px] items-center justify-center rounded bg-amber-400 px-0.5 text-[9px] font-black leading-none text-slate-950 border border-slate-950 shadow-sm">
                      {w.level}
                    </span>
                  </div>
                );
              })}
              {activeFormPassives.map((p) => {
                const def = PASSIVES[p.id];
                return (
                  <div
                    key={p.id}
                    className="relative flex h-8 w-8 items-center justify-center rounded-lg border border-slate-700/80 bg-slate-900/90 text-base shadow-sm"
                    title={`${def?.name} (Lv.${p.level})`}
                  >
                    <span>{def?.icon}</span>
                    <span className="absolute -bottom-1 -right-1 flex h-4 min-w-[14px] items-center justify-center rounded bg-cyan-400 px-0.5 text-[9px] font-black leading-none text-slate-950 border border-slate-950 shadow-sm">
                      {p.level}
                    </span>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* Center: Day/Night Cycle Indicator */}
        <div className="pointer-events-auto flex flex-col items-center rounded-xl border border-slate-800 bg-slate-900/85 px-4 py-2 backdrop-blur-md shadow-lg shadow-black/60">
          <div className="flex items-center gap-2">
            {form === 'werewolf' ? (
              <div className="flex items-center gap-1.5 text-rose-500 font-bold text-sm tracking-wide animate-pulse">
                <Moon className="h-4 w-4 fill-rose-500" />
                <span>FULL MOON (WEREWOLF)</span>
              </div>
            ) : (
              <div className="flex items-center gap-1.5 text-amber-400 font-bold text-sm tracking-wide">
                <Sun className="h-4 w-4 fill-amber-400" />
                <span>DAYLIGHT (HUMAN)</span>
              </div>
            )}
          </div>

          <div className="mt-1 flex items-center gap-3 text-xs text-slate-300">
            <span>Shift in: <strong className="text-white text-sm">{phaseTimer}s</strong></span>
            <span className="text-slate-500">|</span>
            <span className="font-mono text-sm text-slate-200">{formatTime(timeSurvived)}</span>
          </div>

          {/* Form Buff Badge */}
          <div className="mt-1 text-[10px] font-semibold tracking-wider">
            {form === 'werewolf' ? (
              <span className="text-red-400">+50% Phys Dmg | +30% Speed | Melee Claws</span>
            ) : (
              <span className="text-cyan-300">+50% Magic Dmg | +50% XP Gain | Faster Spells</span>
            )}
          </div>
        </div>

        {/* Right: Kills, Currencies, Pause Button */}
        <div className="pointer-events-auto flex flex-col items-end gap-2">
          <div className="flex items-center gap-2 rounded-xl border border-slate-800 bg-slate-900/85 p-2 backdrop-blur-md shadow-lg shadow-black/60">
            <div className="flex items-center gap-1 text-xs font-semibold text-rose-400" title="Enemies Slain">
              <Skull className="h-3.5 w-3.5" />
              <span>{kills}</span>
            </div>
            <div className="h-3 w-px bg-slate-700" />
            <div className="flex items-center gap-1 text-xs font-semibold text-amber-400" title="Gold (In-Hunt Balance)">
              <Coins className="h-3.5 w-3.5 text-amber-400" />
              <span>{gold}</span>
            </div>
            <div className="h-3 w-px bg-slate-700" />
            <div className="flex items-center gap-1 text-xs font-semibold text-purple-300" title="Lunar Shards Collected">
              <span>🔮</span>
              <span>{lunarShards}</span>
            </div>
            <div className="h-3 w-px bg-slate-700" />
            <div className="flex items-center gap-1 text-xs font-semibold text-red-400" title="Ichor Crystals Collected">
              <span>🩸</span>
              <span>{ichorCrystals}</span>
            </div>
          </div>

          <div className="flex items-center gap-1.5">
            <button
              onClick={toggleFullscreen}
              className="flex h-10 w-10 items-center justify-center rounded-xl border border-slate-700 bg-slate-800/90 text-slate-200 transition-transform active:scale-95 hover:bg-slate-700 shadow-md"
              title={isFullscreen ? 'Exit Fullscreen' : 'Fullscreen'}
            >
              {isFullscreen ? <Minimize className="h-4 w-4 text-cyan-400" /> : <Maximize className="h-4 w-4 text-slate-300" />}
            </button>
            <button
              onClick={onPause}
              className="flex h-10 w-10 items-center justify-center rounded-xl border border-slate-700 bg-slate-800/90 text-slate-200 transition-transform active:scale-95 hover:bg-slate-700 shadow-md"
              title="Pause Game"
            >
              <Pause className="h-5 w-5" />
            </button>
          </div>
        </div>
      </div>

      {/* Active Synergies Display at Bottom Left */}
      {activeSynergies.length > 0 && (
        <div className="pointer-events-auto flex flex-wrap gap-2">
          {activeSynergies.map((synId) => {
            const def = SYNERGIES.find((s) => s.id === synId);
            if (!def) return null;
            return (
              <div
                key={synId}
                className="flex items-center gap-1.5 rounded-lg border border-cyan-500/40 bg-slate-950/80 px-2.5 py-1 text-xs font-bold text-cyan-300 backdrop-blur-md shadow-md animate-bounce"
              >
                <span>{def.icon}</span>
                <span>{def.name} ACTIVE</span>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
};
