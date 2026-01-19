
import React from 'react';
import { HatType, HatData } from '../types';
import { PIXEL_MAPS, HAT_WIDTH, HAT_HEIGHT } from '../constants';

interface PixelHatProps {
  hat: HatData;
  isGhost?: boolean;
}

const PixelHat: React.FC<PixelHatProps> = ({ hat, isGhost = false }) => {
  const grid = PIXEL_MAPS[hat.type];
  const pixelSize = HAT_WIDTH / grid[0].length;
  const rowHeight = HAT_HEIGHT / grid.length;

  return (
    <div 
      className={`absolute ${isGhost ? 'opacity-40 animate-pulse' : ''}`}
      style={{
        left: hat.x,
        bottom: hat.y,
        width: HAT_WIDTH,
        height: HAT_HEIGHT,
      }}
    >
      <div className="relative w-full h-full">
        {grid.map((row, rowIndex) => (
          <div key={rowIndex} className="flex" style={{ height: rowHeight }}>
            {row.map((pixel, colIndex) => (
              <div
                key={colIndex}
                style={{
                  width: pixelSize,
                  height: rowHeight,
                  backgroundColor: pixel ? hat.color : 'transparent',
                  // Pac-Man style glow/stroke
                  boxShadow: pixel ? `inset 0 0 4px rgba(0,0,0,0.5)` : 'none',
                }}
              />
            ))}
          </div>
        ))}
      </div>
    </div>
  );
};

export default PixelHat;
