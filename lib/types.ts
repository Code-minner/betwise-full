/**
 * BetWise - Unified Types
 * Single source of truth for all type definitions
 */

// ============== ENUMS ==============

export type Sport = 'FOOTBALL' | 'BASKETBALL' | 'TENNIS';

export type DataQuality = 'HIGH' | 'MEDIUM' | 'LOW' | 'NO_DATA';

export type RiskLevel = 'LOW' | 'MEDIUM' | 'HIGH' | 'VERY_HIGH';

export type ValueRating = 'STRONG_BET' | 'GOOD_VALUE' | 'FAIR' | 'POOR_VALUE' | 'AVOID';

export type MatchStatus = 'SCHEDULED' | 'LIVE' | 'FINISHED' | 'POSTPONED' | 'CANCELLED';

export type Surface = 'HARD' | 'CLAY' | 'GRASS' | 'INDOOR_HARD' | 'UNKNOWN';

// ============== CORE ENTITIES ==============

export interface Entity {
  id: string;
  externalId: string;
  sport: Sport;
  name: string;
  shortName?: string;
  league?: string;
  country?: string;
  logoUrl?: string;
}

export interface Team extends Entity {
  sport: 'FOOTBALL' | 'BASKETBALL';
}

export interface Player extends Entity {
  sport: 'TENNIS';
  ranking?: number;
  points?: number;
}

// ============== LEAGUES ==============

export interface League {
  id: number;
  name: string;
  country: string;
  sport: Sport;
  logo?: string;
}

export const FOOTBALL_LEAGUES: League[] = [
  { id: 39, name: 'Premier League', country: 'England', sport: 'FOOTBALL' },
  { id: 40, name: 'Championship', country: 'England', sport: 'FOOTBALL' },
  { id: 140, name: 'La Liga', country: 'Spain', sport: 'FOOTBALL' },
  { id: 135, name: 'Serie A', country: 'Italy', sport: 'FOOTBALL' },
  { id: 78, name: 'Bundesliga', country: 'Germany', sport: 'FOOTBALL' },
  { id: 61, name: 'Ligue 1', country: 'France', sport: 'FOOTBALL' },
  { id: 179, name: 'Scottish Premiership', country: 'Scotland', sport: 'FOOTBALL' },
  { id: 94, name: 'Primeira Liga', country: 'Portugal', sport: 'FOOTBALL' },
  { id: 88, name: 'Eredivisie', country: 'Netherlands', sport: 'FOOTBALL' },
  { id: 2, name: 'Champions League', country: 'Europe', sport: 'FOOTBALL' },
  { id: 3, name: 'Europa League', country: 'Europe', sport: 'FOOTBALL' },
];

export const BASKETBALL_LEAGUES: League[] = [
  { id: 12, name: 'NBA', country: 'USA', sport: 'BASKETBALL' },
  { id: 120, name: 'Euroleague', country: 'Europe', sport: 'BASKETBALL' },
];

// ============== MATCHES ==============

export interface BaseMatch {
  id: string;
  externalId: string;
  sport: Sport;
  league: League;
  status: MatchStatus;
  kickoff: Date;
  venue?: string;
}

export interface FootballMatch extends BaseMatch {
  sport: 'FOOTBALL';
  homeTeam: Team;
  awayTeam: Team;
  result?: {
    homeGoals: number;
    awayGoals: number;
    htHomeGoals?: number;
    htAwayGoals?: number;
  };
}

export interface BasketballMatch extends BaseMatch {
  sport: 'BASKETBALL';
  homeTeam: Team;
  awayTeam: Team;
  result?: {
    homePoints: number;
    awayPoints: number;
    quarters?: number[];
  };
}

export interface TennisMatch extends BaseMatch {
  sport: 'TENNIS';
  player1: Player;
  player2: Player;
  surface: Surface;
  round?: string;
  bestOf: 3 | 5;
  result?: {
    winner: 1 | 2;
    sets: Array<{ p1: number; p2: number }>;
    totalGames: number;
  };
}

export type Match = FootballMatch | BasketballMatch | TennisMatch;

// ============== STATISTICS ==============

export interface FootballStats {
  played: number;
  wins: number;
  draws: number;
  losses: number;
  goalsFor: number;
  goalsAgainst: number;
  cleanSheets: number;
  failedToScore: number;
  cornersFor: number;
  cornersAgainst: number;
  avgCornersFor: number;
  avgCornersAgainst: number;
  form: string;
  homeForm?: string;
  awayForm?: string;
}

export interface BasketballStats {
  played: number;
  wins: number;
  losses: number;
  pointsFor: number;
  pointsAgainst: number;
  avgPointsFor: number;
  avgPointsAgainst: number;
  pace?: number;
  offensiveRating?: number;
  defensiveRating?: number;
  form: string;
  homeAvgPoints?: number;
  awayAvgPoints?: number;
}

export interface TennisStats {
  matchesPlayed: number;
  wins: number;
  losses: number;
  winRate: number;
  surfaceStats: Record<Surface, { played: number; won: number; winRate: number }>;
  acesPct: number;
  doubleFaultsPct: number;
  firstServePct: number;
  firstServeWonPct: number;
  serviceHoldPct: number;
  returnBreakPct: number;
  tiebreakWinRate: number;
  decidingSetWinRate: number;
  recentForm: string;
}

export type Stats = FootballStats | BasketballStats | TennisStats;

// ============== MARKETS ==============

export type FootballMarket = 
  | 'OVER_1_5' | 'OVER_2_5' | 'OVER_3_5'
  | 'UNDER_1_5' | 'UNDER_2_5' | 'UNDER_3_5'
  | 'BTTS_YES' | 'BTTS_NO'
  | 'HOME_CORNERS_OVER' | 'HOME_CORNERS_UNDER'
  | 'AWAY_CORNERS_OVER' | 'AWAY_CORNERS_UNDER'
  | 'TOTAL_CORNERS_OVER' | 'TOTAL_CORNERS_UNDER';

export type BasketballMarket =
  | 'TOTAL_OVER' | 'TOTAL_UNDER'
  | 'HOME_TOTAL_OVER' | 'HOME_TOTAL_UNDER'
  | 'AWAY_TOTAL_OVER' | 'AWAY_TOTAL_UNDER';

export type TennisMarket =
  | 'TOTAL_GAMES_OVER' | 'TOTAL_GAMES_UNDER';

export type Market = FootballMarket | BasketballMarket | TennisMarket;

// ============== ANALYSIS ==============

export interface AnalysisFactors {
  formScore: number;
  h2hScore: number;
  homeAdvantage: number;
  [key: string]: number | undefined;
}

export interface Prediction {
  id?: string;
  matchId: string;
  sport: Sport;
  market: Market;
  pick: string;
  line?: number;
  odds: number;
  calculatedProbability: number;
  impliedProbability: number;
  edge: number;
  confidence: number;
  dataQuality: DataQuality;
  riskLevel: RiskLevel;
  valueRating: ValueRating;
  factors: AnalysisFactors;
  warnings: string[];
  positives: string[];
  reasoning: string[];
  isSettled: boolean;
  isCorrect?: boolean;
  settledAt?: Date;
  createdAt: Date;
  // For UI display
  matchInfo?: {
    homeTeam: string;
    awayTeam: string;
    league: string;
    kickoff: Date;
  };
}

export interface Suggestion {
  match: Match;
  prediction: Prediction;
  category: 'BANKER' | 'VALUE' | 'RISKY' | 'CORNERS' | 'TOTALS';
}

// ============== CONFIG ==============

export const CONFIG = {
  MIN_CONFIDENCE_TO_SHOW: 35,
  MAX_CONFIDENCE: 88,
  STRONG_BET_EDGE: 0.08,
  GOOD_VALUE_EDGE: 0.03,
  FAIR_EDGE: -0.03,
  POOR_VALUE_EDGE: -0.08,
  HIGH_QUALITY_GAMES: 15,
  MEDIUM_QUALITY_GAMES: 8,
  LOW_QUALITY_GAMES: 5,
  LOW_RISK_CONFIDENCE: 72,
  MEDIUM_RISK_CONFIDENCE: 60,
  HIGH_RISK_CONFIDENCE: 48,
  CACHE_TTL_STATS: 86400,
  CACHE_TTL_FIXTURES: 1800,
  CACHE_TTL_ODDS: 300,
  API_SPORTS_DAILY_LIMIT: 100,
} as const;
