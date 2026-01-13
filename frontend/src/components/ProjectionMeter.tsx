import React from 'react';
import { motion } from 'framer-motion';

interface ProjectionMeterProps {
  projection: number;
  actual: number;
  className?: string;
}

/**
 * Visual indicator showing where actual outcome landed vs projection
 * Shows LOW → AVG → HIGH range
 */
export const ProjectionMeter: React.FC<ProjectionMeterProps> = ({
  projection,
  actual,
  className = '',
}) => {
  // Calculate relative position (0-1) for visualization
  // For MVP, we'll use a simple scale where we assume projection is "average"
  const range = Math.max(projection * 0.5, 20); // Dynamic range based on projection
  const minValue = Math.max(0, projection - range);
  const maxValue = projection + range;

  const projectionPos = 0.5; // Projection is at center (average)
  const actualPos = Math.max(
    0,
    Math.min(1, (actual - minValue) / (maxValue - minValue))
  );

  const getZone = (pos: number): 'low' | 'avg' | 'high' => {
    if (pos < 0.33) return 'low';
    if (pos < 0.67) return 'avg';
    return 'high';
  };

  const actualZone = getZone(actualPos);

  const zoneColors = {
    low: 'bg-red-500',
    avg: 'bg-yellow-500',
    high: 'bg-green-500',
  };

  return (
    <div className={`w-full ${className}`}>
      <div className="text-xs text-gray-400 mb-2 text-center">
        Projection vs Actual
      </div>
      <div className="relative h-8 bg-gray-800 rounded-full overflow-hidden">
        {/* Zone indicators */}
        <div className="absolute inset-0 flex">
          <div className="flex-1 bg-red-900 opacity-30" />
          <div className="flex-1 bg-yellow-900 opacity-30" />
          <div className="flex-1 bg-green-900 opacity-30" />
        </div>

        {/* Projection marker */}
        <motion.div
          initial={{ left: '50%' }}
          animate={{ left: '50%' }}
          className="absolute top-0 bottom-0 w-1 bg-white opacity-80 transform -translate-x-1/2 z-10"
        />

        {/* Actual value marker */}
        <motion.div
          initial={{ left: 0 }}
          animate={{ left: `${actualPos * 100}%` }}
          transition={{ duration: 1, ease: 'easeOut' }}
          className={`absolute top-1/2 w-4 h-4 ${zoneColors[actualZone]} rounded-full transform -translate-y-1/2 -translate-x-1/2 z-20 shadow-lg`}
        />

        {/* Labels */}
        <div className="absolute -bottom-5 left-0 text-xs text-gray-500">LOW</div>
        <div className="absolute -bottom-5 left-1/2 transform -translate-x-1/2 text-xs text-gray-500">
          AVG
        </div>
        <div className="absolute -bottom-5 right-0 text-xs text-gray-500">HIGH</div>
      </div>

      {/* Values */}
      <div className="flex justify-between mt-6 text-sm">
        <div>
          <div className="text-gray-400">Projection</div>
          <div className="font-semibold">{projection.toFixed(1)} FP</div>
        </div>
        <div className="text-right">
          <div className="text-gray-400">Actual</div>
          <div className={`font-semibold ${
            actualZone === 'high' ? 'text-green-400' :
            actualZone === 'low' ? 'text-red-400' :
            'text-yellow-400'
          }`}>
            {actual.toFixed(1)} FP
          </div>
        </div>
      </div>
    </div>
  );
};
