import React from 'react';
import { motion } from 'motion/react';
import { ShrineUpgradeInfo } from '../types/game';
import { Sparkles, ArrowRight, Compass } from 'lucide-react';

interface ShrineModalProps {
  info: ShrineUpgradeInfo;
  onContinue: () => void;
}

export const ShrineModal: React.FC<ShrineModalProps> = ({ info, onContinue }) => {
  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      transition={{ duration: 0.2 }}
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/85 p-4 backdrop-blur-md"
    >
      <motion.div
        initial={{ opacity: 0, scale: 0.9, y: 15 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        exit={{ opacity: 0, scale: 0.9, y: 15 }}
        transition={{ duration: 0.25, ease: [0.16, 1, 0.3, 1] }}
        className="relative w-full max-w-md rounded-2xl border border-cyan-500/40 bg-slate-900/95 p-6 shadow-2xl shadow-cyan-950/50 text-white text-center flex flex-col items-center"
      >
        {/* Glow Header Icon */}
        <div className="mb-3 flex h-14 w-14 items-center justify-center rounded-2xl border border-cyan-500/50 bg-gradient-to-b from-cyan-500/20 to-slate-900 text-3xl shadow-lg shadow-cyan-500/20">
          <Compass className="h-8 w-8 text-cyan-400 animate-pulse" />
        </div>

        {/* Title */}
        <h2 className="text-xl font-black tracking-wide text-cyan-300 uppercase flex items-center gap-2">
          <Sparkles className="h-5 w-5 text-amber-400" />
          Ruins of Knowledge
          <Sparkles className="h-5 w-5 text-amber-400" />
        </h2>

        <p className="mt-2 text-xs text-slate-300 leading-relaxed px-2">
          You discovered forgotten ancient secrets within the ruins!
        </p>

        {/* Upgraded Item Card */}
        <div className="mt-5 w-full rounded-xl border border-cyan-500/30 bg-slate-800/80 p-4 flex flex-col items-center text-center shadow-inner">
          <div className="flex h-14 w-14 items-center justify-center rounded-xl border border-slate-700 bg-slate-900 text-3xl mb-2 shadow-md">
            {info.icon}
          </div>

          <span className="text-xs font-bold uppercase tracking-wider text-amber-400 bg-amber-500/10 border border-amber-500/30 px-2.5 py-0.5 rounded-full mb-1">
            {info.level > 1 ? `Upgraded to Level ${info.level}` : 'New Knowledge Acquired'}
          </span>

          <h3 className="text-lg font-extrabold text-white">{info.name}</h3>

          <p className="mt-1 text-xs text-slate-300 leading-snug max-w-xs">
            {info.description}
          </p>
        </div>

        {/* Continue Button */}
        <button
          onClick={onContinue}
          className="mt-6 flex w-full items-center justify-center gap-2 rounded-xl border border-cyan-400/50 bg-cyan-600 px-5 py-3 text-sm font-black text-slate-950 hover:bg-cyan-500 active:scale-95 transition-all shadow-lg shadow-cyan-600/30 cursor-pointer"
        >
          <span>CONTINUE</span>
          <ArrowRight className="h-4 w-4" />
        </button>
      </motion.div>
    </motion.div>
  );
};
