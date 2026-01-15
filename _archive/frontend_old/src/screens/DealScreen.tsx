import React, { useEffect, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { GameSession } from '../types/engine';
import { PlayerCard } from '../components/PlayerCard';

interface DealScreenProps {
  session: GameSession;
  onDealComplete: () => void;
}

export const DealScreen: React.FC<DealScreenProps> = ({ session, onDealComplete }) => {
  const [revealedCards, setRevealedCards] = useState<Set<number>>(new Set());
  const salaryCap = 100; // From config

  useEffect(() => {
    // Staggered card reveal animation
    session.roster.forEach((_, index) => {
      setTimeout(() => {
        setRevealedCards((prev) => new Set([...prev, index]));
      }, index * 150);
    });

    // Complete deal after all cards are revealed
    const timeout = setTimeout(() => {
      onDealComplete();
    }, session.roster.length * 150 + 500);

    return () => clearTimeout(timeout);
  }, [session.roster, onDealComplete]);

  return (
    <div className="min-h-screen flex flex-col items-center justify-center p-8">
      <motion.h2
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        className="text-3xl font-bold mb-8 text-shadow"
      >
        Initial Deal
      </motion.h2>

      <div className="flex flex-wrap gap-6 justify-center max-w-6xl">
        <AnimatePresence>
          {session.roster.map((slot, index) => (
            <PlayerCard
              key={slot.index}
              slot={slot}
              salaryCap={salaryCap}
              isRevealed={revealedCards.has(index)}
              isAnimating={revealedCards.has(index)}
              delay={index * 0.15}
            />
          ))}
        </AnimatePresence>
      </div>

      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ delay: session.roster.length * 0.15 + 0.3 }}
        className="mt-8 text-gray-400"
      >
        Dealing cards...
      </motion.div>
    </div>
  );
};
