// Shared shapes for what the server sends (see server/src/services/gameService.js)

export type Color = "white" | "black";
export type Side = "w" | "b";
export type PromotionPiece = "q" | "r" | "b" | "n";

export interface PlayerInfo {
  username: string;
  rating: number;
}

export interface MoveRecord {
  from: string;
  to: string;
  san: string;
  promotion?: PromotionPiece;
}

export interface GameSnapshot {
  id: string;
  status: "active" | "finished";
  white: PlayerInfo;
  black: PlayerInfo;
  fen: string;
  turn: Side;
  moveCount: number;
  moves: MoveRecord[];
  lastMove: { from: string; to: string } | null;
  /** Remaining ms as of `serverTime` */
  clocks: { white: number; black: number };
  clockRunning: boolean;
  incrementMs: number;
  serverTime: number;
  drawOffer: Color | null;
  /** Epoch ms deadline by which a disconnected player must be back, or null */
  disconnect: { white: number | null; black: number | null };
  firstMoveDeadline: number | null;
  result: string | null;
  reason: string | null;
}

export interface RatingChange {
  before: number;
  after: number;
  delta: number;
}

export interface GameOver {
  id: string;
  result: "1-0" | "0-1" | "1/2-1/2" | "aborted";
  reason: string;
  winner: Color | null;
  ratings: { white: RatingChange; black: RatingChange } | null;
}

export type Outcome = "win" | "loss" | "draw";

export interface GameSummary {
  id: string;
  opponent: string;
  /** null for computer opponents */
  opponentRating: number | null;
  playedAs: Color;
  outcome: Outcome;
  result: string;
  reason: string;
  ratingDelta: number;
  moves: string[]; // SAN
  finalFen: string;
  endedAt: string;
}

export interface Profile {
  username: string;
  rating: number;
  profilePhoto?: string;
  lastOnline: string;
  gamesPlayed: number;
  stats: { wins: number; draws: number; losses: number };
  recentGames: GameSummary[];
}

export interface UserData {
  username: string;
  rating: number;
  profilePhoto?: string;
}

export interface PagedGames {
  games: GameSummary[];
  total: number;
  page: number;
  pages: number;
  pageSize: number;
}

export interface LeaderboardPlayer {
  rank: number;
  username: string;
  rating: number;
  gamesPlayed: number;
  wins: number;
  draws: number;
  losses: number;
  profilePhoto?: string;
}

export interface LeaderboardPage {
  players: LeaderboardPlayer[];
  total: number;
  page: number;
  pages: number;
  pageSize: number;
  me: { rank: number; rating: number } | null;
}

export interface ExplorerMove {
  san: string;
  games: number;
  white: number;
  draws: number;
  black: number;
}

export interface ExplorerResponse {
  fen: string;
  turn: Side;
  total: number;
  moves: ExplorerMove[];
}

export interface LobbyStats {
  waiting: number;
  playing: number;
}
