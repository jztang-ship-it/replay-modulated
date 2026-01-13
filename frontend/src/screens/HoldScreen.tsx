import React from 'react';
import { motion } from 'framer-motion';
import { GameSession } from '../types/engine';
import { PlayerCard } from '../components/PlayerCard';

interface HoldScreenProps {
  session: GameSession;
  onToggleHold: (slotIndex: number) => void;
  onFinalDraw: () => void;
}

export const HoldScreen: React.FC<HoldScreenProps> = ({
  session,
  onToggleHold,
  onFinalDraw,
}) => {
  const salaryCap = 100;
  const heldCount = session.roster.filter((slot) => slot.held).length;

  return (
    <div className="min-h-screen flex flex-col items-center justify-center p-8">
      <motion.div
        initial={{ opacity: 0, y: -20 }}
        animate={{ opacity: 1, y: 0 }}
        className="text-center mb-8"
      >
        <h2 className="text-3xl font-bold mb-2 text-shadow">Choose Your Holds</h2>
        <p className="text-gray-400">
          Click cards to hold them. Held cards won't be replaced.
        </p>
        <div className="mt-4 text-yellow-400 font-semibold">
          Held: {heldCount} / {session.roster.length}
        </div>
      </motion.div>

      <div className="flex flex-wrap gap-6 justify-center max-w-6xl mb-8">
        {session.roster.map((slot) => (
          <PlayerCard
            key={slot.index}
            slot={slot}
            salaryCap={salaryCap}
            isRevealed={true}
            onClick={() => onToggleHold(slot.index)}
          />
        ))}
      </div>

      <motion.button
        whileHover={{ scale: 1.05 }}
        whileTap={{ scale: 0.95 }}
        onClick={onFinalDraw}
        className="px-8 py-4 bg-gradient-to-r from-green-600 to-emerald-600 rounded-xl text-white font-bold text-lg shadow-lg hover:shadow-xl transition-all"
      >
        Final Draw
      </motion.button>

      <div className="mt-4 text-sm text-gray-500">
        Remaining Cap: ${session.remainingCap}
      </div>
    </div>
  );
};
