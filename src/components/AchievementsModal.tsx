import React from 'react';
import { motion } from 'motion/react';
import { PersistentData } from '../types/game';
import { ACHIEVEMENTS } from '../game/constants';
import { Trophy, CheckCircle, Lock, X } from 'lucide-react';

interface AchievementsModalProps {
  data: PersistentData;
  onClose: () => void;
}

export const AchievementsModal: React.FC<AchievementsModalProps> = ({ data, onClose }) => {
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
        className="w-full max-w-xl rounded-2xl border border-amber-500/30 bg-slate-900/95 p-6 shadow-2xl text-white my-auto max-h-[90vh] flex flex-col"
      >
        {/* Header */}
        <div className="flex items-center justify-between border-b border-slate-800 pb-4">
          <div>
            <h2 className="text-xl font-black text-amber-400 tracking-tight flex items-center gap-2">
              <Trophy className="h-5 w-5" /> LYCAN ACHIEVEMENTS
            </h2>
            <p className="text-xs text-slate-400 mt-1">
              Complete milestones to earn Gold and rare Lunar Shards.
            </p>
          </div>

          <button
            onClick={onClose}
            className="flex h-8 w-8 items-center justify-center rounded-lg border border-slate-700 bg-slate-800 text-slate-400 hover:text-white cursor-pointer"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        {/* List */}
        <div className="mt-4 flex flex-col gap-3 overflow-y-auto pr-1">
          {ACHIEVEMENTS.map((ach) => {
            const isUnlocked = data.unlockedAchievements.includes(ach.id) || ach.check(data);

            return (
              <div
                key={ach.id}
                className={`flex items-center justify-between rounded-xl border p-3.5 transition-colors ${
                  isUnlocked
                    ? 'border-amber-500/30 bg-amber-500/5'
                    : 'border-slate-800 bg-slate-900/50 opacity-70'
                }`}
              >
                <div className="flex items-center gap-3">
                  <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-lg border border-slate-700 bg-slate-800 text-2xl shadow-inner">
                    {ach.icon}
                  </div>

                  <div>
                    <div className="flex items-center gap-2">
                      <span className="font-bold text-slate-200 text-sm">{ach.title}</span>
                      {isUnlocked ? (
                        <span className="flex items-center gap-0.5 text-[10px] font-bold text-emerald-400 bg-emerald-950 px-1.5 py-0.5 rounded border border-emerald-800">
                          <CheckCircle className="h-3 w-3" /> COMPLETED
                        </span>
                      ) : (
                        <span className="flex items-center gap-0.5 text-[10px] font-bold text-slate-500 bg-slate-950 px-1.5 py-0.5 rounded border border-slate-800">
                          <Lock className="h-3 w-3" /> LOCKED
                        </span>
                      )}
                    </div>

                    <p className="text-xs text-slate-400 mt-0.5">{ach.description}</p>
                  </div>
                </div>

                <div className="flex flex-col items-end shrink-0">
                  <span className="text-xs font-bold text-amber-400">
                    +{ach.rewardAmount} {ach.rewardType === 'ichor_crystals' ? 'Crystals' : 'Shards'}
                  </span>
                </div>
              </div>
            );
          })}
        </div>
      </motion.div>
    </motion.div>
  );
};
