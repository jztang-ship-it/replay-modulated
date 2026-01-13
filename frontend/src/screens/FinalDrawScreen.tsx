import React, { useEffect, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { GameSession } from '../types/engine';
import { PlayerCard } from '../components/PlayerCard';

interface FinalDrawScreenProps {
  session: GameSession;
  onDrawComplete: () => void;
}

export const FinalDrawScreen: React.FC<FinalDrawScreenProps> = ({
  session,
  onDrawComplete,
}) => {
  const [replacedCards, setReplacedCards] = useState<Set<number>>(new Set());
  const salaryCap = 100;

  useEffect(() => {
    // Find cards that need to be replaced (not held)
    const toReplace = session.roster
      .map((slot, index) => (!slot.held ? index : -1))
      .filter((idx) => idx !== -1);

    // Staggered replacement animation
    toReplace.forEach((index, idx) => {
      setTimeout(() => {
        setReplacedCards((prev) => new Set([...prev, index]));
      }, idx * 200);
    });

    // Complete draw after animations
    const timeout = setTimeout(() => {
      onDrawComplete();
    }, toReplace.length * 200 + 500);

    return () => clearTimeout(timeout);
  }, [session.roster, onDrawComplete]);

  return (
    <div className="min-h-screen flex flex-col items-center justify-center p-8">
      <motion.h2
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        className="text-3xl font-bold mb-8 text-shadow"
      >
        Final Draw
      </motion.h2>

      <div className="flex flex-wrap gap-6 justify-center max-w-6xl">
        {session.roster.map((slot, index) => {
          const isReplacing = !slot.held && !replacedCards.has(index);
          const isReplaced = replacedCards.has(index);

          return (
            <div key={slot.index} className="relative">
              <AnimatePresence mode="wait">
                {isReplacing ? (
                  <motion.div
                    key="spinning"
                    initial={{ opacity: 1, rotateY: 0 }}
                    animate={{ rotateY: 360 }}
                    exit={{ opacity: 0 }}
                    transition={{ duration: 0.5, repeat: Infinity, repeatDelay: 0.1 }}
                    className="w-48 h-64 bg-gradient-to-br from-purple-600 to-blue-600 rounded-xl border-4 border-purple-400 flex items-center justify-center"
                  >
                    <motion.div
                      animate={{ rotate: 360 }}
                      transition={{ duration: 1, repeat: Infinity, ease: 'linear' }}
                      className="text-4xl"
                    >
                      🎰
                    </motion.div>
                  </motion.div>
                ) : (
                  <PlayerCard
                    key="card"
                    slot={slot}
                    salaryCap={salaryCap}
                    isRevealed={true}
                    isAnimating={isReplaced}
                    delay={isReplaced ? replacedCards.size * 0.2 : 0}
                  />
                )}
              </AnimatePresence>
            </div>
          );
        })}
      </div>

      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        className="mt-8 text-gray-400"
      >
        Drawing replacements...
      </motion.div>
    </div>
  );
};
