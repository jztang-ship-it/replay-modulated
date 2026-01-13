import React from 'react';
import { motion } from 'framer-motion';
import { GameSession } from '../types/engine';

interface ResultScreenProps {
  session: GameSession;
  onPlayAgain: () => void;
}

export const ResultScreen: React.FC<ResultScreenProps> = ({
  session,
  onPlayAgain,
}) => {
  const isWin = session.winResult === true;
  const teamFP = session.resolvedTeamFP || 0;

  return (
    <div className="min-h-screen flex flex-col items-center justify-center p-8">
      <motion.div
        initial={{ scale: 0 }}
        animate={{ scale: 1 }}
        transition={{ type: 'spring', stiffness: 200, damping: 20 }}
        className="text-center space-y-8"
      >
        {/* Win/Loss Animation */}
        <motion.div
          animate={{
            scale: [1, 1.1, 1],
            rotate: [0, 5, -5, 0],
          }}
          transition={{
            duration: 0.5,
            repeat: Infinity,
            repeatDelay: 2,
          }}
          className="text-9xl"
        >
          {isWin ? '🎉' : '😔'}
        </motion.div>

        <motion.h1
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.2 }}
          className={`text-5xl font-bold ${
            isWin ? 'text-green-400' : 'text-red-400'
          } text-shadow`}
        >
          {isWin ? 'YOU WIN!' : 'YOU LOSE'}
        </motion.h1>

        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 0.4 }}
          className="space-y-4"
        >
          <div className="text-3xl font-semibold text-yellow-400">
            {teamFP.toFixed(1)} Fantasy Points
          </div>
          <div className="text-gray-400 text-lg">
            {isWin
              ? 'Congratulations! You hit the target!'
              : 'Better luck next time!'}
          </div>
        </motion.div>

        <motion.button
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.6 }}
          whileHover={{ scale: 1.05 }}
          whileTap={{ scale: 0.95 }}
          onClick={onPlayAgain}
          className="px-8 py-4 bg-gradient-to-r from-blue-600 to-purple-600 rounded-xl text-white font-bold text-lg shadow-lg hover:shadow-xl transition-all"
        >
          Play Again
        </motion.button>
      </motion.div>
    </div>
  );
};
