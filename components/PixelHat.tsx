
import React, { useRef, useEffect } from 'react';
import { HatData } from '../types';
import { PIXEL_MAPS, HAT_WIDTH, HAT_HEIGHT } from '../constants';

interface PixelHatProps {
  hat: HatData;
  isGhost?: boolean;
}

const PixelHat: React.FC<PixelHatProps> = ({ hat, isGhost = false }) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const grid = PIXEL_MAPS[hat.type];

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const rows = grid.length;
    const cols = grid[0].length;
    
    // We use a high internal resolution for sharpness, 
    // but CSS handles the actual display size.
    const pixelWidth = canvas.width / cols;
    const pixelHeight = canvas.height / rows;

    ctx.clearRect(0, 0, canvas.width, canvas.height);
    
    for (let r = 0; r < rows; r++) {
      for (let c = 0; c < cols; c++) {
        if (grid[r][c]) {
          // Main pixel color
          ctx.fillStyle = hat.color;
          ctx.fillRect(c * pixelWidth, r * pixelHeight, pixelWidth, pixelHeight);
          
          // Pac-Man style internal shading (similar to original boxShadow)
          ctx.fillStyle = 'rgba(0,0,0,0.25)';
          ctx.fillRect(
            c * pixelWidth + pixelWidth * 0.6, 
            r * pixelHeight + pixelHeight * 0.6, 
            pixelWidth * 0.4, 
            pixelHeight * 0.4
          );
          
          ctx.fillStyle = 'rgba(255,255,255,0.1)';
          ctx.fillRect(
            c * pixelWidth, 
            r * pixelHeight, 
            pixelWidth * 0.3, 
            pixelHeight * 0.3
          );
        }
      }
    }
  }, [hat.color, hat.type, grid]);

  return (
    <canvas
      ref={canvasRef}
      className={`absolute pixelated ${isGhost ? 'opacity-40 animate-pulse' : ''}`}
      width={cols * 4} // Low res canvas with pixelated scaling is more retro
      height={rows * 4}
      style={{
        left: hat.x,
        bottom: hat.y,
        width: HAT_WIDTH,
        height: HAT_HEIGHT,
      }}
    />
  );
};

const cols = PIXEL_MAPS['CAP'][0].length;
const rows = PIXEL_MAPS['CAP'].length;

export default React.memo(PixelHat);
