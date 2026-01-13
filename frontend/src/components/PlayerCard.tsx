import React from 'react';
import { motion } from 'framer-motion';
import { Player, RosterSlot } from '../types/engine';
import { getPlayerTier, getTierColorClass, getTierColorHex, getTierBorderClass, getTierGlowClass } from '../utils/tierUtils';

interface PlayerCardProps {
  slot: RosterSlot;
  salaryCap: number;
  isRevealed?: boolean;
  isAnimating?: boolean;
  onClick?: () => void;
  projection?: number;
  actualFP?: number;
  delay?: number;
}

export const PlayerCard: React.FC<PlayerCardProps> = ({
  slot,
  salaryCap,
  isRevealed = false,
  isAnimating = false,
  onClick,
  projection,
  actualFP,
  delay = 0,
}) => {
  const player = slot.player;
  const held = slot.held;

  if (!player) {
    return (
      <motion.div
        initial={{ opacity: 0, scale: 0.8 }}
        animate={{ opacity: 1, scale: 1 }}
        transition={{ duration: 0.3, delay }}
        className="w-48 h-64 bg-gray-800 rounded-xl border-2 border-gray-700 flex items-center justify-center"
      >
        <span className="text-gray-500">Empty</span>
      </motion.div>
    );
  }

  const tier = getPlayerTier(player.salary, salaryCap);
  const tierColorClass = getTierColorClass(tier);
  const tierColorHex = getTierColorHex(tier);
  const borderClass = getTierBorderClass(tier);
  const glowClass = getTierGlowClass(tier);

  return (
    <motion.div
      initial={{ opacity: 0, scale: 0.8, rotateY: -90 }}
      animate={{
        opacity: isRevealed ? 1 : 0.7,
        scale: isAnimating ? 1.05 : 1,
        rotateY: isRevealed ? 0 : -90,
      }}
      transition={{
        duration: 0.5,
        delay,
        type: 'spring',
        stiffness: 200,
        damping: 20,
      }}
      whileHover={onClick ? { scale: 1.02, y: -4 } : {}}
      whileTap={onClick ? { scale: 0.98 } : {}}
      onClick={onClick}
      className={`
        w-48 h-64 rounded-xl border-4 ${borderClass}
        ${held ? glowClass : ''}
        ${onClick ? 'cursor-pointer' : 'cursor-default'}
        bg-gradient-to-br from-gray-800 to-gray-900
        flex flex-col p-4 relative overflow-hidden
        ${held ? 'ring-4 ring-yellow-400 ring-opacity-50' : ''}
      `}
    >
      {/* Held Badge */}
      {held && (
        <motion.div
          initial={{ scale: 0 }}
          animate={{ scale: 1 }}
          className="absolute top-2 right-2 bg-yellow-400 text-gray-900 px-3 py-1 rounded-full text-xs font-bold"
        >
          HOLD
        </motion.div>
      )}

      {/* Tier Indicator */}
      <div className={`absolute top-0 left-0 w-full h-2 ${tierColorClass}`} style={{ backgroundColor: tierColorHex }} />

      {/* Player Info */}
      <div className="flex-1 flex flex-col justify-center items-center text-center">
        <h3 className="text-xl font-bold text-shadow mb-2">{player.name}</h3>
        <div className="text-sm text-gray-300 mb-1">
          {player.position} • {player.team}
        </div>
        <div className="text-lg font-semibold text-yellow-400">
          ${player.salary}
        </div>
      </div>

      {/* Projection/Actual FP */}
      {isRevealed && (projection !== undefined || actualFP !== undefined) && (
        <motion.div
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          className="mt-2 pt-2 border-t border-gray-700"
        >
          {projection !== undefined && (
            <div className="text-xs text-gray-400">
              Proj: {projection.toFixed(1)} FP
            </div>
          )}
          {actualFP !== undefined && (
            <div className="text-sm font-bold text-green-400">
              {actualFP.toFixed(1)} FP
            </div>
          )}
        </motion.div>
      )}

      {/* Slot Index */}
      <div className="absolute bottom-2 left-2 text-xs text-gray-500">
        Slot {slot.index + 1}
      </div>
    </motion.div>
  );
};
