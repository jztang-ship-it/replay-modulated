import React, { useEffect, useState } from 'react';
import { motion } from 'framer-motion';
import { GameSession, Resolution, Projection } from '../types/engine';
import { PlayerCard } from '../components/PlayerCard';
import { OdometerCounterState } from '../components/OdometerCounter';
import { ProjectionMeter } from '../components/ProjectionMeter';

interface ResolutionScreenProps {
  session: GameSession;
  resolutions: Resolution[];
  projections: Projection[];
  onResolutionComplete: () => void;
}

export const ResolutionScreen: React.FC<ResolutionScreenProps> = ({
  session,
  resolutions,
  projections,
  onResolutionComplete,
}) => {
  const [revealedIndexes, setRevealedIndexes] = useState<Set<number>>(new Set());
  const [totalFP, setTotalFP] = useState(0);
  const salaryCap = 100;

  useEffect(() => {
    // Staggered reveal animation (reel-like)
    session.roster.forEach((slot, index) => {
      if (slot.player) {
        setTimeout(() => {
          setRevealedIndexes((prev) => new Set([...prev, index]));
        }, index * 300);
      }
    });

    // Calculate total FP as cards are revealed
    const interval = setInterval(() => {
      const revealedCount = revealedIndexes.size;
      if (revealedCount < resolutions.length) {
        const currentTotal = resolutions
          .slice(0, revealedCount + 1)
          .reduce((sum, res) => sum + res.fantasyPoints, 0);
        setTotalFP(currentTotal);
      }
    }, 300);

    // Complete resolution after all cards are revealed
    const timeout = setTimeout(() => {
      const finalTotal = resolutions.reduce((sum, res) => sum + res.fantasyPoints, 0);
      setTotalFP(finalTotal);
      clearInterval(interval);
      setTimeout(() => {
        onResolutionComplete();
      }, 1000);
    }, session.roster.length * 300 + 1000);

    return () => {
      clearTimeout(timeout);
      clearInterval(interval);
    };
  }, [session.roster, resolutions, onResolutionComplete, revealedIndexes.size]);

  const getResolutionForPlayer = (playerId: string): Resolution | undefined => {
    return resolutions.find((r) => r.playerId === playerId);
  };

  const getProjectionForPlayer = (playerId: string): Projection | undefined => {
    return projections.find((p) => p.playerId === playerId);
  };

  return (
    <div className="min-h-screen flex flex-col items-center justify-center p-8">
      <motion.h2
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        className="text-3xl font-bold mb-4 text-shadow"
      >
        Resolution
      </motion.h2>

      {/* Total FP Counter */}
      <motion.div
        initial={{ scale: 0.8, opacity: 0 }}
        animate={{ scale: 1, opacity: 1 }}
        className="mb-8 text-center"
      >
        <div className="text-5xl font-bold text-yellow-400 mb-2">
          <OdometerCounterState value={totalFP} duration={0.5} />
          <span className="text-2xl ml-2">FP</span>
        </div>
        <div className="text-gray-400">Total Fantasy Points</div>
      </motion.div>

      <div className="flex flex-wrap gap-6 justify-center max-w-6xl mb-8">
        {session.roster.map((slot, index) => {
          if (!slot.player) return null;

          const resolution = getResolutionForPlayer(slot.player.id);
          const projection = getProjectionForPlayer(slot.player.id);
          const isRevealed = revealedIndexes.has(index);

          return (
            <div key={slot.index} className="flex flex-col items-center">
              <PlayerCard
                slot={slot}
                salaryCap={salaryCap}
                isRevealed={isRevealed}
                projection={projection?.projectedPoints}
                actualFP={isRevealed ? resolution?.fantasyPoints : undefined}
              />
              {/* Projection Meter */}
              {isRevealed && resolution && projection && (
                <motion.div
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: 0.3 }}
                  className="w-48 mt-4"
                >
                  <ProjectionMeter
                    projection={projection.projectedPoints}
                    actual={resolution.fantasyPoints}
                  />
                </motion.div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
};
