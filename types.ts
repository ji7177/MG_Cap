
export interface HatData {
  id: string;
  x: number;
  y: number;
  color: string;
  type: HatType;
}

export enum HatType {
  TOP_HAT = 'TOP_HAT',
  CAP = 'CAP',
  BOWLER = 'BOWLER',
  WITCH = 'WITCH'
}

export interface LeaderboardEntry {
  nickname: string;
  highScore: number;
}

export interface GameState {
  score: number;
  highScore: number;
  isGameOver: boolean;
  isStarted: boolean;
  stack: HatData[];
  currentHatX: number;
  direction: number; // 1 for right, -1 for left
  speed: number;
  nickname: string;
}
