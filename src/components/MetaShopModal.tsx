import React from 'react';
import { motion } from 'motion/react';
import { MetaUpgradeDef, PersistentData } from '../types/game';
import { META_UPGRADES } from '../game/constants';
import { Coins, Sparkles, X, Plus } from 'lucide-react';

interface MetaShopModalProps {
  data: PersistentData;
  onBuyUpgrade: (upgradeId: string) => void;
  onClose: () => void;
}

function getCurrentBoostText(upg: MetaUpgradeDef, level: number): string {
  switch (upg.id) {
    case 'health':
      return `+${level * 20} Max HP`;
    case 'damage':
      return `+${level * 8}% Damage`;
    case 'speed':
      return `+${level * 5}% Speed`;
    case 'magnet':
      return `+${level * 25}% Pickup Range`;
    case 'greed':
      return `+${level * 20}% Gold Earned`;
    case 'wisdom':
      return `+${level * 15}% XP Gain`;
    case 'cooldown':
      return `-${level * 5}% Cooldown`;
    case 'revive':
      return `+${level} Extra ${level === 1 ? 'Life' : 'Lives'}`;
    case 'rerolls':
      return `+${level} ${level === 1 ? 'Reroll' : 'Rerolls'}/Run`;
    default:
      return `${upg.effectPerLevel} x${level}`;
  }
}

export const MetaShopModal: React.FC<MetaShopModalProps> = ({
  data,
  onBuyUpgrade,
  onClose,
}) => {
  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      transition={{ duration: 0.2 }}
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/85 p-4 backdrop-blur-md overflow-y-auto"
    >
      <motion.div
        initial={{ opacity: 0, scale: 0.9, y: 15 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        exit={{ opacity: 0, scale: 0.9, y: 15 }}
        transition={{ duration: 0.25, ease: [0.16, 1, 0.3, 1] }}
        className="w-full max-w-2xl rounded-2xl border border-amber-500/30 bg-slate-900/95 p-6 shadow-2xl text-white my-auto max-h-[90vh] flex flex-col"
      >
        {/* Header */}
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-800 pb-4">
          <h2 className="text-lg sm:text-xl font-black text-amber-400 tracking-tight flex items-center gap-2">
            <Sparkles className="h-5 w-5 shrink-0 text-amber-400" /> LYCAN SANCTUARY SHOP
          </h2>

          {/* Currencies Display & Close Button */}
          <div className="flex items-center gap-2 sm:gap-3 ml-auto">
            <div className="flex items-center gap-1.5 rounded-lg border border-purple-500/30 bg-purple-500/10 px-2.5 py-1 text-xs font-bold text-purple-300 whitespace-nowrap">
              <Sparkles className="h-4 w-4 shrink-0 text-purple-400" />
              <span>{data.lunarShards} Shards</span>
            </div>

            <div className="flex items-center gap-1.5 rounded-lg border border-red-500/30 bg-red-500/10 px-2.5 py-1 text-xs font-bold text-red-400 whitespace-nowrap">
              <span className="shrink-0 text-sm">🩸</span>
              <span>{data.ichorCrystals} Crystals</span>
            </div>

            <button
              onClick={onClose}
              className="flex h-8 w-8 items-center justify-center rounded-lg border border-slate-700 bg-slate-800 text-slate-400 hover:text-white shrink-0 cursor-pointer"
              title="Close Shop"
            >
              <X className="h-4 w-4" />
            </button>
          </div>
        </div>

        {/* Upgrades Grid */}
        <div className="mt-4 grid grid-cols-1 md:grid-cols-2 gap-3 overflow-y-auto pr-1">
          {META_UPGRADES.map((upg) => {
            const currentLevel = data.metaUpgrades[upg.id] || 0;
            const isMaxed = currentLevel >= upg.maxLevel;
            const cost = Math.round(upg.costBase * Math.pow(upg.costMultiplier, currentLevel));
            const availableCurrency =
              upg.currency === 'ichor_crystals' ? data.ichorCrystals : data.lunarShards;
            const hasCurrency = availableCurrency >= cost;

            return (
              <div
                key={upg.id}
                className="flex flex-col gap-2 rounded-xl border border-slate-800 bg-slate-800/50 p-3.5 transition-colors hover:border-slate-700"
              >
                {/* 1st flex row: icon, name, upgrade progress */}
                <div className="flex items-center justify-between gap-2">
                  <div className="flex items-center gap-2.5">
                    <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg border border-slate-700 bg-slate-900 text-lg shadow-inner">
                      {upg.icon}
                    </div>
                    <span className="font-bold text-slate-200 text-sm">{upg.name}</span>
                  </div>
                  <span className="text-xs font-bold text-slate-400 bg-slate-900 border border-slate-700/60 px-2 py-0.5 rounded-md shrink-0">
                    {currentLevel} / {upg.maxLevel}
                  </span>
                </div>

                {/* 2nd flex row: description (1st col) & upgrade button (2nd col) */}
                <div className="flex items-center justify-between gap-3 pt-1 border-t border-slate-800/60">
                  {/* 1st flex column: description & current boost */}
                  <div className="flex flex-col min-w-0 flex-1">
                    <p className="text-[11px] text-slate-400 leading-snug">{upg.description}</p>
                    <p className="text-[11px] text-cyan-400 font-semibold mt-1">
                      Current boost: {getCurrentBoostText(upg, currentLevel)}
                    </p>
                  </div>

                  {/* 2nd flex column: upgrade button */}
                  <div className="flex flex-col items-end shrink-0">
                    <button
                      onClick={() => onBuyUpgrade(upg.id)}
                      disabled={isMaxed || !hasCurrency}
                      className={`flex flex-col items-center justify-center rounded-lg px-3 py-1.5 text-xs font-bold transition-all shrink-0 cursor-pointer ${
                        isMaxed
                          ? 'bg-slate-800 text-slate-500 border border-slate-700 cursor-default'
                          : hasCurrency
                          ? upg.currency === 'ichor_crystals'
                            ? 'bg-rose-600 text-white hover:bg-rose-500 active:scale-95 shadow-md shadow-rose-600/30'
                            : 'bg-amber-500 text-slate-950 hover:bg-amber-400 active:scale-95 shadow-md shadow-amber-500/20'
                          : 'bg-slate-800 text-slate-500 border border-slate-700 cursor-not-allowed'
                      }`}
                    >
                      {isMaxed ? (
                        <span>MAXED</span>
                      ) : (
                        <>
                          <div className="flex items-center gap-1">
                            <Plus className="h-3 w-3" /> UPGRADE
                          </div>
                          <span className="text-[10px] opacity-90 mt-0.5">
                            {cost} {upg.currency === 'ichor_crystals' ? 'Crystals' : 'Shards'}
                          </span>
                        </>
                      )}
                    </button>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      </motion.div>
    </motion.div>
  );
};

