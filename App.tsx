
import React, { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import { GameState, HatData, HatType, LeaderboardEntry } from './types';
import { 
  GAME_WIDTH, 
  GAME_HEIGHT, 
  HAT_WIDTH, 
  HAT_HEIGHT, 
  GROUND_HEIGHT,
  INITIAL_SPEED, 
  SPEED_INCREMENT, 
  RETRO_COLORS, 
  ORANGE_KEY,
  BLUE_KEY,
  YELLOW_KEY,
  GRAY_LIGHT,
  GRAY_MID,
  GRAY_DARK,
  GRAY_STROKE,
  GRAY_BRIGHT,
  GRAY_DEEP,
  PIXEL_MAPS,
  COLLECTION_MAPS
} from './constants';
import PixelHat from './components/PixelHat';

interface ExtendedGameState extends GameState {
  fallingHat: (HatData & { targetY: number; velocityY: number }) | null;
  failedHat: (HatData & { velocityY: number }) | null;
  isToppling: boolean;
  toppleAngle: number;
  toppleDirection: number;
  isCinematic: boolean;
  cinematicCameraY: number | null;
  gameOverDelay: number; 
}

enum AnimationPhase {
  FILL_FORWARD = 0,
  EMPTY_CENTER = 1,
  FILL_OUTLINE = 2,
  EMPTY_BACKWARD = 3,
  SHOW_LOGO = 4
}

const App: React.FC = () => {
  const [isLanding, setIsLanding] = useState(true);
  const isLandingRef = useRef(true);
  const [nicknameInput, setNicknameInput] = useState('');

  // Audio Refs
  const bgmRef = useRef<HTMLAudioElement>(new Audio('Sound_Background.mp3'));
  const winSfxRef = useRef<HTMLAudioElement>(new Audio('Sound_Win.mp3'));
  const failSfxRef = useRef<HTMLAudioElement>(new Audio('Sound_Fail.mp3'));

  // Audio Setup and Preview URLs
  useEffect(() => {
    // 배경음 설정
    bgmRef.current.loop = true;
    bgmRef.current.volume = 0.4;
    
    // 프리뷰용 가상 음악 연결 (파일 업로드 후에는 이 src 부분을 삭제하거나 파일명만 남기면 됩니다)
    bgmRef.current.src = 'https://www.soundhelix.com/examples/mp3/SoundHelix-Song-8.mp3';
    winSfxRef.current.src = 'Sound_Win.mp3';
    failSfxRef.current.src = 'Sound_Fail.mp3';

    return () => {
      bgmRef.current.pause();
      winSfxRef.current.pause();
      failSfxRef.current.pause();
    };
  }, []);

  // Flip Animation State
  const [flipState, setFlipState] = useState<boolean[]>([false, false, false]);
  const [currentFlipIdx, setCurrentFlipIdx] = useState(0);
  const [isFlippingBack, setIsFlippingBack] = useState(false);

  // Initialize with empty array, will fetch from DB
  const [leaderboard, setLeaderboard] = useState<LeaderboardEntry[]>([]);
  
  const [fillCount, setFillCount] = useState(0);
  const [seqIdx, setSeqIdx] = useState(0);
  const animSequence = useMemo(() => [
    AnimationPhase.FILL_FORWARD,
    AnimationPhase.SHOW_LOGO,
    AnimationPhase.EMPTY_CENTER,
    AnimationPhase.SHOW_LOGO,
    AnimationPhase.FILL_OUTLINE,
    AnimationPhase.SHOW_LOGO,
    AnimationPhase.EMPTY_BACKWARD,
    AnimationPhase.SHOW_LOGO
  ], []);
  
  const animPhase = animSequence[seqIdx];
  const [isAnimPaused, setIsAnimPaused] = useState(false);
  
  const animColors = useMemo(() => ['#485924', '#0A3463', '#4A4A4A', ORANGE_KEY], []);
  const [currentAnimColor, setCurrentAnimColor] = useState(ORANGE_KEY);

  const capMap = PIXEL_MAPS[HatType.CAP];
  
  const pixelSequences = useMemo(() => {
    const allPixels: { r: number; c: number }[] = [];
    capMap.forEach((row, r) => {
      row.forEach((pixel, c) => {
        if (pixel === 1) allPixels.push({ r, c });
      });
    });

    const rows = capMap.length;
    const cols = capMap[0].length;
    const centerR = rows / 2;
    const centerC = cols / 2;

    const seq1 = [...allPixels];
    const seq2 = [...allPixels].sort((a, b) => {
      const distA = Math.sqrt(Math.pow(a.r - centerR, 2) + Math.pow(a.c - centerC, 2));
      const distB = Math.sqrt(Math.pow(b.r - centerR, 2) + Math.pow(b.c - centerC, 2));
      return distA - distB;
    });

    const seq3: { r: number; c: number }[] = [];
    let remaining = [...allPixels];
    while (remaining.length > 0) {
      const outline = remaining.filter(p => {
        const neighbors = [
          { r: p.r - 1, c: p.c }, { r: p.r + 1, c: p.c },
          { r: p.r, c: p.c - 1 }, { r: p.r, c: p.c + 1 }
        ];
        return neighbors.some(n => 
          n.r < 0 || n.r >= rows || n.c < 0 || n.c >= cols || capMap[n.r][n.c] === 0 || !remaining.some(rp => rp.r === n.r && rp.c === n.c)
        );
      });
      seq3.push(...outline);
      const outlineSet = new Set(outline.map(p => `${p.r},${p.c}`));
      remaining = remaining.filter(p => !outlineSet.has(`${p.r},${p.c}`));
    }

    const seq4 = [...allPixels].reverse();
    return [seq1, seq2, seq3, seq4];
  }, [capMap]);

  const totalPixels = pixelSequences[0].length;
  const STACK_STEP = 30;

  // DB Sync Functions
  const fetchLeaderboard = useCallback(async () => {
    try {
      const res = await fetch('/api/leaderboard');
      if (res.ok) {
        const data = await res.json();
        setLeaderboard(data);
      }
    } catch (e) {
      console.error('Failed to fetch leaderboard from Redis', e);
    }
  }, []);

  const saveToLeaderboard = useCallback(async (nickname: string, score: number) => {
    try {
      const res = await fetch('/api/leaderboard', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ nickname, score }),
      });
      if (res.ok) {
        fetchLeaderboard(); // Refresh after saving
      }
    } catch (e) {
      console.error('Failed to save score to Redis', e);
    }
  }, [fetchLeaderboard]);

  useEffect(() => {
    fetchLeaderboard();
  }, [fetchLeaderboard]);

  useEffect(() => {
    isLandingRef.current = isLanding;
    let interval: number;

    if (isLanding) {
      if (animPhase === AnimationPhase.SHOW_LOGO) {
        const timer = window.setTimeout(() => {
          setSeqIdx(prev => (prev + 1) % animSequence.length);
        }, 1200);
        return () => clearTimeout(timer);
      }

      if (!isAnimPaused) {
        interval = window.setInterval(() => {
          setFillCount(prev => {
            if (prev >= totalPixels) {
              setIsAnimPaused(true);
              setTimeout(() => {
                setSeqIdx(prevIdx => {
                  const nextIdx = (prevIdx + 1) % animSequence.length;
                  const randomColor = animColors[Math.floor(Math.random() * animColors.length)];
                  setCurrentAnimColor(randomColor);
                  return nextIdx;
                });
                setFillCount(0);
                setIsAnimPaused(false);
              }, 200);
              return totalPixels;
            }
            return prev + 2;
          });
        }, 60);
      }
    }
    return () => { if (interval) clearInterval(interval); };
  }, [isLanding, totalPixels, animColors, isAnimPaused, animPhase, animSequence.length]);

  const [gameState, setGameState] = useState<ExtendedGameState>({
    score: 0,
    highScore: 0,
    isGameOver: false,
    isStarted: false,
    stack: [{
      id: 'base',
      x: (GAME_WIDTH - HAT_WIDTH) / 2,
      y: GROUND_HEIGHT,
      color: ORANGE_KEY,
      type: HatType.CAP
    }],
    currentHatX: 0,
    direction: 1,
    speed: INITIAL_SPEED,
    fallingHat: null,
    failedHat: null,
    isToppling: false,
    toppleAngle: 0,
    toppleDirection: 0,
    nickname: '',
    isCinematic: false,
    cinematicCameraY: null,
    gameOverDelay: 0
  });

  // Sequential Flip Effect Logic
  useEffect(() => {
    if (!gameState.isGameOver) return;

    const timer = setTimeout(() => {
      if (currentFlipIdx < 3) {
        setFlipState(prev => {
          const next = [...prev];
          next[currentFlipIdx] = !isFlippingBack;
          return next;
        });
        setCurrentFlipIdx(prev => prev + 1);
      } else {
        setTimeout(() => {
          setCurrentFlipIdx(0);
          setIsFlippingBack(prev => !prev);
        }, 1000);
      }
    }, 600);

    return () => clearTimeout(timer);
  }, [gameState.isGameOver, currentFlipIdx, isFlippingBack]);

  const requestRef = useRef<number>(0);
  const containerRef = useRef<HTMLDivElement>(null);

  const resetGame = () => {
    const currentNick = nicknameInput.trim().toUpperCase();
    if (!currentNick) return;
    const userBest = leaderboard.find(e => e.nickname === currentNick)?.highScore || 0;
    setIsLanding(false);
    isLandingRef.current = false;
    setFlipState([false, false, false]);
    setCurrentFlipIdx(0);
    setIsFlippingBack(false);

    // BGM 재생
    bgmRef.current.currentTime = 0;
    bgmRef.current.play().catch(e => console.log('Audio autoplay blocked', e));
    
    setGameState(prev => ({
      ...prev,
      score: 0,
      isGameOver: false,
      isStarted: true,
      nickname: currentNick,
      highScore: userBest,
      stack: [{
        id: 'base-' + Date.now(),
        x: (GAME_WIDTH - HAT_WIDTH) / 2,
        y: GROUND_HEIGHT,
        color: RETRO_COLORS[Math.floor(Math.random() * RETRO_COLORS.length)],
        type: HatType.CAP
      }],
      currentHatX: 0,
      direction: 1,
      speed: INITIAL_SPEED,
      fallingHat: null,
      failedHat: null,
      isToppling: false,
      toppleAngle: 0,
      toppleDirection: 0,
      isCinematic: false,
      cinematicCameraY: null,
      gameOverDelay: 0
    }));
  };

  const handleDrop = useCallback(() => {
    if (isLandingRef.current || !gameState.isStarted || gameState.isGameOver || gameState.fallingHat || gameState.isToppling || gameState.isCinematic) return;
    const targetY = (gameState.stack.length * STACK_STEP) + GROUND_HEIGHT;
    const currentViewOffset = Math.max(0, targetY - (GAME_HEIGHT / 3));
    const initialY = GAME_HEIGHT - HAT_HEIGHT - 20 + currentViewOffset;
    setGameState(prev => ({
      ...prev,
      fallingHat: {
        id: `falling-${prev.score}`,
        x: prev.currentHatX,
        y: initialY,
        targetY: targetY,
        velocityY: 0, 
        color: '#FFFFFF',
        type: HatType.CAP
      }
    }));
  }, [gameState.isStarted, gameState.isGameOver, gameState.fallingHat, gameState.isToppling, gameState.isCinematic, gameState.stack.length, gameState.currentHatX, gameState.score]);

  const update = useCallback(() => {
    if (!isLandingRef.current) {
      setGameState(prev => {
        if (!prev.isStarted || prev.isGameOver) return prev;
        if (prev.isCinematic) {
          let nextState = { ...prev };
          if (prev.failedHat) {
            const GRAVITY = 0.8;
            const nextVelocity = prev.failedHat.velocityY + GRAVITY;
            const nextY = prev.failedHat.y - nextVelocity;
            if (nextY <= GROUND_HEIGHT) {
              nextState.failedHat = { ...prev.failedHat, y: GROUND_HEIGHT, velocityY: 0 };
              nextState.cinematicCameraY = 0;
              if (prev.gameOverDelay < 12) { 
                nextState.gameOverDelay = prev.gameOverDelay + 1;
              } else {
                nextState.isGameOver = true;
                saveToLeaderboard(prev.nickname, prev.score);
              }
            } else {
              nextState.failedHat = { ...prev.failedHat, y: nextY, velocityY: nextVelocity };
              nextState.cinematicCameraY = Math.max(0, nextY - (GAME_HEIGHT / 2));
            }
          } else if (prev.isToppling) {
            if (Math.abs(prev.toppleAngle) < 110) {
              const baseToppleSpeed = 3.0; 
              const toppleAcceleration = Math.abs(prev.toppleAngle) * 0.15;
              nextState.toppleAngle = prev.toppleAngle + (prev.toppleDirection * (baseToppleSpeed + toppleAcceleration));
            }
            if (prev.cinematicCameraY !== null) {
              const camSpeed = 6;
              const nextCamY = Math.max(0, prev.cinematicCameraY - camSpeed);
              nextState.cinematicCameraY = nextCamY;
              if (nextCamY === 0 && Math.abs(nextState.toppleAngle) >= 105) {
                if (prev.gameOverDelay < 12) {
                  nextState.gameOverDelay = prev.gameOverDelay + 1;
                } else {
                  nextState.isGameOver = true;
                  saveToLeaderboard(prev.nickname, prev.score);
                }
              }
            }
          }
          return nextState;
        }

        let nextState = { ...prev };
        if (!prev.fallingHat) {
          let nextX = prev.currentHatX + (prev.direction * prev.speed);
          let nextDir = prev.direction;
          if (nextX >= GAME_WIDTH - HAT_WIDTH) { nextX = GAME_WIDTH - HAT_WIDTH; nextDir = -1; }
          else if (nextX <= 0) { nextX = 0; nextDir = 1; }
          nextState.currentHatX = nextX;
          nextState.direction = nextDir;
        }

        if (prev.fallingHat) {
          const ACCELERATION = 0.6;
          const MAX_SPEED = 22;
          const nextVelocity = Math.min(MAX_SPEED, prev.fallingHat.velocityY + ACCELERATION);
          const newY = prev.fallingHat.y - nextVelocity;
          if (newY <= prev.fallingHat.targetY) {
            const topHat = prev.stack[prev.stack.length - 1];
            const diff = prev.fallingHat.x - topHat.x;
            const absDiff = Math.abs(diff);
            const SAFE_THRESHOLD = 30; 
            const EDGE_THRESHOLD = 75;
            if (absDiff < SAFE_THRESHOLD) {
              // 착지 성공 사운드
              winSfxRef.current.currentTime = 0;
              winSfxRef.current.play().catch(() => {});
              
              const newScore = prev.score + 1;
              return {
                ...prev,
                score: newScore,
                stack: [...prev.stack, { ...prev.fallingHat, y: prev.fallingHat.targetY, color: RETRO_COLORS[Math.floor(Math.random() * RETRO_COLORS.length)] }],
                speed: prev.speed + SPEED_INCREMENT,
                fallingHat: null,
                currentHatX: Math.random() * (GAME_WIDTH - HAT_WIDTH)
              };
            } else if (absDiff < EDGE_THRESHOLD) {
              // 실패 사운드 및 BGM 정지
              bgmRef.current.pause();
              failSfxRef.current.currentTime = 0;
              failSfxRef.current.play().catch(() => {});
              
              const currentStackTopY = (prev.stack.length * STACK_STEP) + GROUND_HEIGHT;
              return {
                ...prev,
                stack: [...prev.stack, { ...prev.fallingHat, y: prev.fallingHat.targetY, color: '#FF0000' }],
                fallingHat: null,
                isToppling: true,
                isCinematic: true,
                toppleDirection: diff > 0 ? 1 : -1,
                cinematicCameraY: Math.max(0, currentStackTopY - (GAME_HEIGHT / 3)),
                highScore: Math.max(prev.score, prev.highScore)
              };
            } else {
              // 실패 사운드 및 BGM 정지
              bgmRef.current.pause();
              failSfxRef.current.currentTime = 0;
              failSfxRef.current.play().catch(() => {});
              
              const currentStackTopY = (prev.stack.length * STACK_STEP) + GROUND_HEIGHT;
              return {
                ...prev,
                isCinematic: true,
                failedHat: { ...prev.fallingHat, velocityY: nextVelocity },
                fallingHat: null,
                cinematicCameraY: Math.max(0, currentStackTopY - (GAME_HEIGHT / 3)),
                highScore: Math.max(prev.score, prev.highScore)
              };
            }
          } else {
            nextState.fallingHat = { ...prev.fallingHat, y: newY, velocityY: nextVelocity };
          }
        }
        return nextState;
      });
    }
    requestRef.current = requestAnimationFrame(update);
  }, [saveToLeaderboard]);

  useEffect(() => {
    requestRef.current = requestAnimationFrame(update);
    return () => { if (requestRef.current) cancelAnimationFrame(requestRef.current); };
  }, [update]);

  const stackHeight = (gameState.stack.length * STACK_STEP) + GROUND_HEIGHT;
  const standardViewOffset = Math.max(0, stackHeight - (GAME_HEIGHT / 3));
  const viewOffset = gameState.cinematicCameraY !== null ? gameState.cinematicCameraY : standardViewOffset;

  const renderProgressiveHat = () => {
    if (animPhase >= 4) return null;
    const pixelSize = HAT_WIDTH / capMap[0].length;
    const rowHeight = HAT_HEIGHT / capMap.length;
    const sequence = pixelSequences[animPhase];
    const visibilityMap = new Map<string, boolean>();
    sequence.forEach((p, idx) => {
      let isVisible = false;
      switch (animPhase) {
        case AnimationPhase.FILL_FORWARD:
        case AnimationPhase.FILL_OUTLINE: isVisible = idx < fillCount; break;
        case AnimationPhase.EMPTY_CENTER:
        case AnimationPhase.EMPTY_BACKWARD: isVisible = idx >= fillCount; break;
      }
      visibilityMap.set(`${p.r},${p.c}`, isVisible);
    });

    return (
      <div className="relative" style={{ width: HAT_WIDTH, height: HAT_HEIGHT }}>
        {capMap.map((row, rowIndex) => (
          <div key={rowIndex} className="flex" style={{ height: rowHeight }}>
            {row.map((pixel, colIndex) => {
              const isVisible = pixel === 1 && visibilityMap.get(`${rowIndex},${colIndex}`);
              return (
                <div key={colIndex} className={isVisible ? "led-pixel" : ""} style={{ width: pixelSize, height: rowHeight, backgroundColor: isVisible ? currentAnimColor : 'transparent', boxShadow: isVisible ? `0 0 5px ${currentAnimColor}, 0 0 10px ${currentAnimColor}66, inset 0 0 2px rgba(255,255,255,0.4)` : 'none', zIndex: isVisible ? 1 : 0, position: 'relative' }}>
                  {isVisible && <div className="absolute inset-[30%] bg-white/30 rounded-sm blur-[0.2px]" style={{ pointerEvents: 'none' }} />}
                </div>
              );
            })}
          </div>
        ))}
      </div>
    );
  };

  const renderPixelCollectionIcon = (idx: number, size: number = 64, isGlow: boolean = false) => {
    const grid = COLLECTION_MAPS[idx];
    if (!grid) return null;
    const cellSize = size / grid[0].length;
    return (
      <div className="flex flex-col items-center justify-center pixelated" style={{ width: size }}>
        {grid.map((row, rIdx) => (
          <div key={rIdx} className="flex" style={{ height: cellSize }}>
            {row.map((cell, cIdx) => {
              let color = 'transparent';
              if (cell === 1) color = ORANGE_KEY;
              if (cell === 2) color = BLUE_KEY;
              if (cell === 3) color = GRAY_STROKE;
              if (cell === 4) color = GRAY_LIGHT;
              if (cell === 5) color = GRAY_MID;
              if (cell === 6) color = GRAY_DARK;
              if (cell === 7) color = GRAY_BRIGHT;
              if (cell === 8) color = GRAY_DEEP;
              if (cell === 9) color = YELLOW_KEY;

              let bShadow = 'none';
              if (isGlow && cell > 0) {
                bShadow = `0 0 5px ${color}, 0 0 10px ${color}66, inset 0 0 2px rgba(255,255,255,0.4)`;
              } else if (cell > 0 && cell < 3) {
                bShadow = 'inset 0 0 1px rgba(255,255,255,0.1)';
              }

              return <div key={cIdx} style={{ width: cellSize, height: cellSize, backgroundColor: color, boxShadow: bShadow, position: 'relative' }}>
                {isGlow && cell > 0 && <div className="absolute inset-[30%] bg-white/30 rounded-sm blur-[0.2px]" style={{ pointerEvents: 'none' }} />}
              </div>;
            })}
          </div>
        ))}
      </div>
    );
  };

  const isNicknameEmpty = !nicknameInput.trim();

  return (
    <div className="flex flex-col items-center justify-center min-h-screen bg-black text-white scanlines font-['Press_Start_2P'] overflow-hidden">
      {isLanding ? (
        <div className="flex flex-col items-center justify-center w-full h-screen bg-[#1a1a1a] p-4 relative overflow-y-auto">
          <div className="w-[340px] min-h-[580px] bg-[#d1d1d1] rounded-[30px] shadow-[inset_0_4px_10px_rgba(255,255,255,0.8),0_20px_40px_rgba(0,0,0,0.6)] border-b-[12px] border-r-[8px] border-[#999] flex flex-col items-center p-6 relative">
            <div className="w-24 h-2 bg-[#bbb] rounded-full mb-6 shadow-inner flex justify-around p-0.5">
               <div className="w-1 h-1 bg-[#888] rounded-full"></div>
               <div className="w-1 h-1 bg-[#888] rounded-full"></div>
               <div className="w-1 h-1 bg-[#888] rounded-full"></div>
            </div>
            <div className="w-full flex-[3] bg-[#333] rounded-lg p-2 shadow-[inset_0_4px_8px_rgba(0,0,0,0.8)] border-4 border-[#555] flex flex-col items-center justify-between mb-4">
              <div className="w-full flex justify-between items-center px-2 py-1">
                <div className="w-2 h-2 rounded-full bg-[#f00] shadow-[0_0_5px_#f00] animate-pulse"></div>
                <div className="text-[6px] text-[#888] uppercase tracking-tighter font-sans font-bold">mg console pro</div>
              </div>
              <div className="flex-grow w-full bg-black relative flex flex-col items-center justify-center overflow-hidden border-2 border-[#111]">
                <div className="absolute top-4 text-[8px] text-gray-500 uppercase tracking-widest text-center w-full">mother ground</div>
                <div className="absolute top-10 text-[10px] text-[#FE6000] uppercase tracking-widest animate-pulse text-center w-full">new nylon cap arrived</div>
                <div 
                  className={`transform flex items-center justify-center ${animPhase === AnimationPhase.SHOW_LOGO ? 'logo-entrance' : ''}`}
                  style={{ 
                    transform: animPhase === AnimationPhase.SHOW_LOGO ? 'scale(0.88)' : 'scale(2.2)',
                  }}
                >
                  {animPhase === AnimationPhase.SHOW_LOGO ? renderPixelCollectionIcon(4, 80, true) : renderProgressiveHat()}
                </div>
                <div className="absolute bottom-4 w-full text-center"><div className="text-[6px] text-gray-700 uppercase tracking-[4px]">insert coin to start</div></div>
              </div>
            </div>
            <div className="w-full flex flex-col items-center justify-center py-2">
              <div className="w-full flex items-center gap-4 px-2">
                <div className="flex-grow flex flex-col items-start">
                  <label className="text-[7px] text-gray-600 mb-1.5 uppercase font-bold tracking-tighter ml-1 font-sans">player nickname</label>
                  <input 
                    type="text" 
                    maxLength={15} 
                    value={nicknameInput} 
                    onChange={(e) => setNicknameInput(e.target.value)} 
                    placeholder="NAME" 
                    className="w-full bg-[#777] border-2 border-[#555] rounded-lg p-3 text-white text-[10px] font-['Press_Start_2P'] focus:outline-none focus:border-[#FE6000] focus:bg-[#888] placeholder:text-gray-400/80 transition-all shadow-inner" 
                  />
                </div>
                <div className="flex flex-col items-center">
                  <button onClick={resetGame} disabled={isNicknameEmpty} className={`w-[70px] h-[70px] rounded-full text-white text-[10px] transition-all flex items-center justify-center text-center p-2 leading-tight font-sans font-black mt-3 ${isNicknameEmpty ? 'bg-gray-400 border-b-4 border-gray-600 opacity-50 cursor-not-allowed' : 'bg-[#FE6000] border-b-4 border-[#993a00] active:border-b-0 active:translate-y-1 cursor-pointer'}`}>START</button>
                </div>
              </div>
            </div>
            <div className="absolute -bottom-10 text-[10px] text-[#FE6000]/50 tracking-widest uppercase">steps stamp</div>
          </div>
        </div>
      ) : (
        <>
          {!gameState.isGameOver && (
            <div className="z-50 flex justify-between w-full max-w-[400px] px-4 py-6">
              <div className="flex flex-col"><span className="text-[10px] text-gray-500 mb-1">SCORE</span><span className="text-xl text-[#FE6000]">{gameState.score.toString().padStart(3, '0')}</span></div>
              <div className="flex flex-col items-end"><span className="text-[10px] text-gray-500 mb-1">BEST ({gameState.nickname})</span><span className="text-xl text-yellow-400">{gameState.highScore.toString().padStart(3, '0')}</span></div>
            </div>
          )}
          
          <div className={`relative ${gameState.isGameOver ? 'border-x-4' : 'border-4'} border-[#FE6000] shadow-[0_0_30px_rgba(254,96,0,0.2)] bg-black overflow-hidden`} style={{ width: GAME_WIDTH, height: GAME_HEIGHT }}>
            <div className="absolute inset-0 flex items-center justify-center opacity-30 pointer-events-none z-0 gap-4" style={{ transform: 'translateY(-30px)' }}>
              {renderPixelCollectionIcon(4, 50)}
              <div className="flex flex-col justify-between items-center h-[45px] text-[#E5E7EB] text-[17.5px] leading-none font-black tracking-widest uppercase">
                <div>MOTHER</div>
                <div>GROUND</div>
              </div>
            </div>

            <div ref={containerRef} onClick={handleDrop} className={`relative w-full h-full cursor-pointer z-10 ${!gameState.isGameOver ? 'retro-screen' : ''}`}>
              <div className="absolute inset-0 transition-transform duration-500 ease-out" style={{ transform: `translateY(${viewOffset}px) rotate(${gameState.toppleAngle}deg)`, transformOrigin: 'bottom center' }}>
                <div className="absolute inset-0 opacity-10" style={{ backgroundImage: `radial-gradient(${ORANGE_KEY} 1px, transparent 0)`, backgroundSize: '20px 20px', height: Math.max(GAME_HEIGHT, stackHeight + 4000) }} />
                <div className="absolute bottom-0 w-full h-full">
                  <div className="absolute bottom-0 left-0 w-full border-t-4 border-[#FE6000]/30 bg-black" style={{ height: GROUND_HEIGHT, backgroundImage: 'linear-gradient(45deg, #111 25%, transparent 25%, transparent 50%, #111 50%, #111 75%, transparent 75%, transparent)', backgroundSize: '8px 8px' }} />
                  {gameState.stack.map((hat) => <PixelHat key={hat.id} hat={hat} />)}
                  {gameState.failedHat && <PixelHat hat={gameState.failedHat} />}
                </div>
                {gameState.fallingHat && <PixelHat hat={gameState.fallingHat} />}
              </div>
              {!gameState.isGameOver && !gameState.fallingHat && !gameState.isToppling && !gameState.isCinematic && <PixelHat hat={{ id: 'active', x: gameState.currentHatX, y: GAME_HEIGHT - HAT_HEIGHT - 20, color: '#FFFFFF', type: HatType.CAP }} />}
              
              {gameState.isGameOver && (
                <div className="absolute inset-0 z-40 bg-black/95 overflow-y-auto custom-scrollbar" onClick={(e) => e.stopPropagation()}>
                  <div className="flex flex-col items-center justify-start py-8 px-4">
                    <h2 className="text-xl text-[#FE6000] mb-2 animate-pulse uppercase">GAME OVER</h2>
                    <h2 className="text-[11.2px] text-yellow-400 mb-6 uppercase">SCORE: {gameState.score}</h2>
                    
                    <div className="w-full max-w-[340px] mb-8 border-2 border-gray-800 p-2">
                      <table className="w-full text-[8px] leading-relaxed">
                        <thead><tr className="text-gray-500 border-b border-gray-800"><th className="text-left pb-2">RANK</th><th className="text-left pb-2">NAME</th><th className="text-right pb-2">BEST</th></tr></thead>
                        <tbody>{(() => {
                          const idx = leaderboard.findIndex(entry => entry.nickname === gameState.nickname);
                          const rank = idx + 1;
                          let data = rank > 0 && rank <= 7 ? leaderboard.slice(0, 7).map((e, i) => ({ e, r: i + 1, d: false })) : (rank > 7 ? [...leaderboard.slice(0, 5).map((e, i) => ({ e, r: i + 1, d: false })), { e: null, r: 0, d: true }, { e: leaderboard[idx], r: rank, d: false }] : leaderboard.slice(0, 7).map((e, i) => ({ e, r: i + 1, d: false })));
                          return data.map(({ e, r, d }, i) => d ? <tr key={`ell-${i}`} className="text-gray-600"><td className="py-2 text-center" colSpan={3}>⋮</td></tr> : e && <tr key={`${e.nickname}-${r}`} className={`${e.nickname === gameState.nickname ? 'text-yellow-400 bg-yellow-400/10' : 'text-white'}`}><td className="py-2">#{r}</td><td className="py-2 truncate">{e.nickname}</td><td className="py-2 text-right">{e.highScore}</td></tr>);
                        })()}</tbody>
                      </table>
                    </div>

                    <div className="flex w-full max-w-[340px] gap-3 mb-6">
                      <button onClick={() => { bgmRef.current.pause(); setIsLanding(true); }} className="flex-1 py-4 bg-gray-700 border-b-4 border-gray-900 active:border-b-0 active:translate-y-1 text-white text-[10px] transition-all">MENU</button>
                      <button onClick={() => resetGame()} className="flex-1 py-4 bg-[#FE6000] border-b-4 border-[#993a00] active:border-b-0 active:translate-y-1 text-white text-[10px] transition-all">RETRY</button>
                    </div>

                    <div className="flex justify-center items-center w-full max-w-[340px] mb-10 mt-4 px-2">
                      <div className="grid grid-cols-3 w-full">
                        {[0, 1, 2].map((iconIdx, i) => {
                          let size = 64;
                          if (iconIdx === 0) size = 76;
                          if (iconIdx === 1) size = 70;
                          if (iconIdx === 2) size = 58;
                          const backSize = 63;

                          return (
                            <div key={i} className="flex justify-center items-center">
                              <div className={`flip-card ${flipState[i] ? 'flipped' : ''}`} style={{ width: size, height: size }}>
                                <div className="flip-card-inner">
                                  <div className="flip-card-front flex items-center justify-center">
                                    {renderPixelCollectionIcon(iconIdx, size)}
                                  </div>
                                  <div className="flip-card-back flex items-center justify-center">
                                    {renderPixelCollectionIcon(4, backSize)}
                                  </div>
                                </div>
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    </div>

                    <button 
                      onClick={() => window.open('https://mother-ground.com/', '_blank')} 
                      className="px-6 py-4 bg-white/15 rounded-xl active:translate-y-1 text-white text-[8px] transition-all uppercase text-center max-w-[280px] button-pulse-interaction"
                    >
                      CAPS COLLECTION 구경하러 가기
                    </button>
                  </div>
                </div>
              )}
            </div>
          </div>
          <div className="mt-8 text-[10px] text-[#FE6000]/50 tracking-widest uppercase">© MOTHER GROUND</div>
        </>
      )}
      <style>{`
        .pixelated { image-rendering: pixelated; }
        .led-pixel { animation: led-pulse 2.5s infinite ease-in-out; }
        @keyframes led-pulse {
          0%, 100% { opacity: 1; filter: brightness(1.05) saturate(1.1); }
          50% { opacity: 0.9; filter: brightness(0.95) saturate(1); }
        }
        .custom-scrollbar::-webkit-scrollbar { width: 4px; }
        .custom-scrollbar::-webkit-scrollbar-track { background: transparent; }
        .custom-scrollbar::-webkit-scrollbar-thumb { background: #333; border-radius: 2px; }

        @keyframes button-pulse-click {
          0%, 90%, 100% { transform: translateY(0); }
          95% { transform: translateY(3px); }
        }
        .button-pulse-interaction {
          animation: button-pulse-click 3s infinite ease-in-out;
        }

        .flip-card { perspective: 1000px; cursor: default; }
        .flip-card-inner {
          position: relative;
          width: 100%;
          height: 100%;
          transition: transform 0.6s cubic-bezier(0.4, 0, 0.2, 1);
          transform-style: preserve-3d;
        }
        .flip-card.flipped .flip-card-inner { transform: rotateY(180deg); }
        .flip-card-front, .flip-card-back {
          position: absolute;
          width: 100%;
          height: 100%;
          backface-visibility: hidden;
          display: flex;
          align-items: center;
          justify-content: center;
        }
        .flip-card-back { transform: rotateY(180deg); }

        @keyframes logo-entrance {
          0% { opacity: 0; }
          45% { opacity: 0.8; }
          55% { opacity: 0.8; }
          100% { opacity: 0; }
        }
        .logo-entrance {
          animation: logo-entrance 1.2s ease-in-out forwards;
        }
      `}</style>
    </div>
  );
};

export default App;
