import React from 'react';
import { motion } from 'motion/react';
import { ShopInfo, ShopOption } from '../types/game';
import { Store, Coins, Sparkles, X } from 'lucide-react';

interface ShopModalProps {
  shopInfo: ShopInfo;
  currentGold: number;
  onBuyOption: (option: ShopOption) => void;
  onLeave: () => void;
}

export const ShopModal: React.FC<ShopModalProps> = ({
  shopInfo,
  currentGold,
  onBuyOption,
  onLeave,
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
        className="w-full max-w-lg rounded-2xl border-2 border-amber-500/50 bg-slate-900/95 p-5 shadow-2xl shadow-amber-950/80 text-white flex flex-col"
      >
        {/* Header */}
        <div className="text-center">
          <div className="inline-flex items-center gap-1.5 rounded-full border border-amber-500/40 bg-amber-500/10 px-3.5 py-1 text-xs font-bold text-amber-400 uppercase tracking-widest">
            <Store className="h-4 w-4 text-amber-400" /> WANDERING MERCHANT
          </div>
          <h2 className="mt-1.5 text-xl font-black tracking-tight text-amber-100 uppercase">
            MERCHANT'S SELECTION
          </h2>
          <div className="mt-1 flex items-center justify-center gap-2 text-xs font-semibold text-slate-300">
            <span>Your Gold:</span>
            <span className="font-extrabold text-amber-300 flex items-center gap-1 bg-amber-500/15 border border-amber-500/30 px-2.5 py-0.5 rounded-full">
              <Coins className="h-3.5 w-3.5 text-amber-400" />
              {currentGold} 🪙
            </span>
          </div>
        </div>

        {/* 3 Shop Options List - Vertical layout like LevelUpModal */}
        <div className="flex flex-col gap-2.5 mt-4">
          {shopInfo.options.map((option, idx) => {
            const canAfford = currentGold >= option.price;
            const isUpgrade = option.optionType === 'upgrade';

            return (
              <motion.div
                key={`${option.id}-${idx}`}
                initial={{ opacity: 0, x: -10 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{ duration: 0.2, delay: idx * 0.05 }}
                className={`relative flex items-center justify-between rounded-xl border p-3.5 text-left transition-all ${
                  canAfford
                    ? 'border-amber-500/40 bg-slate-800/80 hover:border-amber-400 hover:bg-slate-800 hover:shadow-lg hover:shadow-amber-500/10'
                    : 'border-slate-800/80 bg-slate-900/60 opacity-60'
                }`}
              >
                <div className="flex items-center gap-3.5 w-full mr-2 min-w-0">
                  {/* Icon Box */}
                  <div
                    className={`flex h-12 w-12 shrink-0 items-center justify-center rounded-xl border text-2xl shadow-inner ${
                      canAfford
                        ? 'border-amber-500/40 bg-slate-900 text-amber-300'
                        : 'border-slate-800 bg-slate-950 text-slate-600'
                    }`}
                  >
                    {option.icon}
                  </div>

                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className={`font-bold text-sm ${canAfford ? 'text-slate-100' : 'text-slate-400'}`}>
                        {option.name}
                      </span>
                      <span
                        className={`rounded px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-wider ${
                          isUpgrade
                            ? 'bg-cyan-950 border border-cyan-700/60 text-cyan-300'
                            : 'bg-amber-950 border border-amber-700/60 text-amber-300'
                        }`}
                      >
                        {isUpgrade
                          ? `UPGRADE +${option.boostLevel}`
                          : `NEW! LV. ${option.level}`}
                      </span>
                    </div>

                    <p className="mt-1 text-xs text-slate-300 leading-snug line-clamp-2">
                      {option.description}
                    </p>
                  </div>
                </div>

                {/* Action Button & Price */}
                <div className="flex flex-col items-end shrink-0 gap-1 pl-2 border-l border-slate-800/80">
                  <span
                    className={`text-xs font-black flex items-center gap-1 ${
                      canAfford ? 'text-amber-300' : 'text-slate-500'
                    }`}
                  >
                    {option.price} 🪙
                  </span>
                  <button
                    onClick={() => {
                      if (canAfford) {
                        onBuyOption(option);
                      }
                    }}
                    disabled={!canAfford}
                    className={`px-3.5 py-1.5 rounded-lg text-xs font-black uppercase tracking-wide transition-all ${
                      canAfford
                        ? 'bg-amber-500 hover:bg-amber-400 text-slate-950 shadow-md shadow-amber-500/20 active:scale-95 cursor-pointer'
                        : 'bg-slate-800 text-slate-500 border border-slate-700/50 cursor-not-allowed opacity-70'
                    }`}
                  >
                    {canAfford ? 'BUY' : 'NEED GOLD'}
                  </button>
                </div>
              </motion.div>
            );
          })}
        </div>

        {/* Footer Leave Button */}
        <div className="mt-5 flex items-center justify-center border-t border-slate-800/80 pt-3">
          <button
            onClick={onLeave}
            className="flex items-center gap-2 rounded-xl border border-slate-700/80 bg-slate-800/60 px-5 py-2 text-xs font-bold text-slate-300 hover:bg-slate-700 hover:text-white transition-all cursor-pointer"
          >
            <X className="h-4 w-4 text-slate-400" />
            <span>Leave Shop (No Purchase)</span>
          </button>
        </div>
      </motion.div>
    </motion.div>
  );
};

