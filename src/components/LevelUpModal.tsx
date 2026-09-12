import React from 'react';
import { motion } from 'motion/react';
import { WEAPONS, PASSIVES, SYNERGIES } from '../game/constants';
import { Sparkles, RefreshCw, ChevronRight } from 'lucide-react';

interface LevelUpChoice {
  type: 'weapon' | 'passive';
  id: string;
  level: number;
}

interface LevelUpModalProps {
  choices: LevelUpChoice[];
  rerollsAvailable: number;
  onSelectChoice: (choice: LevelUpChoice) => void;
  onReroll: () => void;
}

function getWeaponUpgradeDetail(id: string, level: number): string {
  switch (id) {
    case 'wolven_headbutt':
      if (level === 2) return `-0.4s Charge Time (1.6s), +10 Damage & +20px Pushback`;
      if (level === 3) return `-0.3s Charge Time (1.3s), +15 Damage & +20px Pushback`;
      if (level === 4) return `-0.3s Charge Time (1.0s), +20 Damage & +30px Pushback`;
      if (level === 5) return `-0.3s Charge Time (0.7s), +25 Damage & +40px Pushback`;
      return `Build up speed while running to sprout a battering arc that blocks damage and pushes back foes.`;
    case 'werewolf_claws':
      if (level % 3 === 0) return `+25% Damage & +1 Extra Slash Wave`;
      return `+25% Damage & +15% Slash Range`;
    case 'silver_crossbow':
      if (level % 2 === 1) return `+25% Damage & +1 Crossbow Bolt`;
      return `+25% Damage & +1 Piercing Target`;
    case 'frost_orb':
      if (level % 2 === 0) return `+25% Damage & +1 Piercing Orb`;
      return `+25% Damage & +20% Freeze Spell Range`;
    case 'earth_shatter':
      return `+25% Damage & +20% Shockwave Radius`;
    case 'lunar_beam':
      return `+25% Damage & +20% Beam Distance & Size`;
    case 'silver_daggers':
      return `+25% Damage & +2 Extra Daggers`;
    case 'blood_ring':
      return `+25% Damage & +20% Aura Drain Radius`;
    case 'wolf_pack':
      if (level % 2 === 0) return `+25% Damage & +1 Ghost Wolf`;
      return `+25% Damage & -15% Cooldown`;
    case 'burning_steps':
      return `+25% Damage, +15% Fire Patch Radius & Faster Spawn Rate`;
    case 'silver_decapitator':
      if (level === 4) return `+1 Additional Return Slash`;
      return `+25% Damage & +20px Slash Range`;
    case 'decoy':
      if (level === 2) return `+5s Duration (25s total) & 400 HP`;
      if (level === 3) return `+5s Duration (30s total) & 2nd Decoy`;
      if (level === 4) return `+5s Duration (35s total) & 800 HP`;
      if (level === 5) return `+5s Duration (40s total) & Decoys explode on destruction/expiry`;
      return `Deploy Decoy (200 HP, 20s Duration)`;
    case 'lightning_rod':
      return `+1 Additional Chain Jump & +20% Lightning Damage`;
    case 'searing_gloves':
      return `+25% Flame Damage & +20px Fire Cone Range`;
    default:
      return `+25% Base Damage & Enhanced Effect`;
  }
}

function getPassiveUpgradeDetail(id: string, level: number): string {
  const def = PASSIVES[id];
  if (!def) return '';
  const { stat, value, unit } = def.statBoostPerLevel;
  return `+${value}${unit} ${stat} (Total: +${(value * level).toFixed(1)}${unit})`;
}

export const LevelUpModal: React.FC<LevelUpModalProps> = ({
  choices,
  rerollsAvailable,
  onSelectChoice,
  onReroll,
}) => {
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
        className="w-full max-w-lg rounded-2xl border border-red-500/40 bg-slate-900/95 p-6 shadow-2xl shadow-red-950/80 text-white"
      >
        {/* Header */}
        <div className="mb-6 text-center">
          <div className="inline-flex items-center gap-2 rounded-full border border-amber-500/30 bg-amber-500/10 px-4 py-1 text-xs font-bold text-amber-400 uppercase tracking-widest">
            <Sparkles className="h-4 w-4" /> LEVEL UP!
          </div>
          <h2 className="mt-2 text-2xl font-black tracking-tight text-slate-100">
            CHOOSE YOUR POWER UP
          </h2>
          <p className="text-xs text-slate-400">
            Select an upgrade to strengthen your arsenal or unlock synergies.
          </p>
        </div>

        {/* Upgrade Cards List */}
        <div className="flex flex-col gap-3">
          {choices.map((choice, idx) => {
            const isWeapon = choice.type === 'weapon';
            const def = isWeapon ? WEAPONS[choice.id] : PASSIVES[choice.id];
            if (!def) return null;

            // Check if this choice enables a synergy
            const synergy = isWeapon
              ? SYNERGIES.find((s) => s.requiredWeapons.includes(choice.id as any))
              : null;

            return (
              <motion.button
                key={`${choice.type}-${choice.id}`}
                initial={{ opacity: 0, x: -10 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{ duration: 0.2, delay: idx * 0.05 }}
                onClick={() => onSelectChoice(choice)}
                className="group relative flex items-center justify-between rounded-xl border border-slate-700 bg-slate-800/80 p-4 text-left transition-all hover:border-red-500 hover:bg-slate-800 hover:shadow-lg hover:shadow-red-500/10 active:scale-[0.98]"
              >
                <div className="flex items-center gap-4 w-full mr-2">
                  {/* Icon Box */}
                  <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl border border-slate-600 bg-slate-900 text-2xl shadow-inner group-hover:border-red-400">
                    {def.icon}
                  </div>

                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="font-bold text-slate-100 text-base group-hover:text-amber-400 transition-colors">
                        {def.name}
                      </span>
                      <span className="rounded bg-slate-700 px-2 py-0.5 text-xs font-bold text-cyan-300">
                        {choice.level === 1 ? 'NEW!' : `LV. ${choice.level}`}
                      </span>
                    </div>

                    {/* Level 1: Base Description; Level 2+: Upgrade Description ONLY */}
                    {choice.level >= 2 ? (
                      <div className="mt-1.5 flex items-center gap-1.5 rounded-lg border border-amber-500/30 bg-amber-500/10 px-2.5 py-1.5 text-xs font-semibold text-amber-300">
                        <Sparkles className="h-3.5 w-3.5 shrink-0 text-amber-400" />
                        <span>
                          <strong className="text-amber-200">Lv. {choice.level} Effect:</strong>{' '}
                          {isWeapon
                            ? getWeaponUpgradeDetail(choice.id, choice.level)
                            : getPassiveUpgradeDetail(choice.id, choice.level)}
                        </span>
                      </div>
                    ) : (
                      <p className="mt-1 text-xs text-slate-300 leading-relaxed">
                        {def.description}
                      </p>
                    )}

                    {/* Synergy Badge if applicable */}
                    {synergy && (
                      <div className="mt-2 inline-flex items-center gap-1 rounded bg-cyan-950 border border-cyan-800 px-2 py-0.5 text-[10px] font-bold text-cyan-300">
                        <span>{synergy.icon}</span>
                        <span>Synergy Potential: {synergy.name}</span>
                      </div>
                    )}
                  </div>
                </div>

                <ChevronRight className="h-5 w-5 text-slate-500 transition-transform group-hover:translate-x-1 group-hover:text-amber-400 shrink-0" />
              </motion.button>
            );
          })}
        </div>

        {/* Footer Reroll Control */}
        <div className="mt-6 flex items-center justify-between border-t border-slate-800 pt-4">
          <span className="text-xs text-slate-400">
            Rerolls available: <strong className="text-amber-400">{rerollsAvailable}</strong>
          </span>

          <button
            onClick={onReroll}
            disabled={rerollsAvailable <= 0}
            className={`flex items-center gap-2 rounded-xl px-4 py-2 text-xs font-bold transition-all ${
              rerollsAvailable > 0
                ? 'border border-amber-500/40 bg-amber-500/10 text-amber-400 hover:bg-amber-500/20 active:scale-95'
                : 'border border-slate-800 bg-slate-800/50 text-slate-600 cursor-not-allowed'
            }`}
          >
            <RefreshCw className="h-4 w-4" />
            Reroll Choices
          </button>
        </div>
      </motion.div>
    </motion.div>
  );
};
