// =============================================================
// FILE: lib/types.ts (FIXED - All exports added)
// =============================================================
// 
// ADDED EXPORTS FOR analysis.ts:
// - DataQuality
// - RiskLevel
// - ValueRating
// - Market
// - AnalysisFactors
// - CONFIG

export type Sport = 'FOOTBALL' | 'BASKETBALL' | 'TENNIS';

// ============== MISSING TYPES FOR analysis.ts ==============

export type DataQuality = 'HIGH' | 'MEDIUM' | 'LOW' | 'NO_DATA' | 'FALLBACK';

export type RiskLevel = 'LOW' | 'MEDIUM' | 'HIGH' | 'VERY_HIGH';

export type ValueRating = 'STRONG_BET' | 'GOOD_VALUE' | 'FAIR' | 'POOR_VALUE' | 'AVOID';

export type Market = 
  // Football
  | 'OVER_2_5' | 'UNDER_2_5' 
  | 'OVER_3_5' | 'UNDER_3_5'
  | 'BTTS_YES' | 'BTTS_NO'
  | 'MATCH_WINNER_HOME' | 'MATCH_WINNER_AWAY' | 'MATCH_WINNER_DRAW'
  | 'DOUBLE_CHANCE_1X' | 'DOUBLE_CHANCE_X2' | 'DOUBLE_CHANCE_12'
  | 'HOME_CORNERS' | 'AWAY_CORNERS' | 'TOTAL_CORNERS'
  // Basketball
  | 'TOTALS_OVER' | 'TOTALS_UNDER'
  | 'SPREAD_HOME' | 'SPREAD_AWAY'
  | 'MONEYLINE'
  // Tennis
  | 'MATCH_WINNER' | 'UPSET'
  | 'TOTAL_GAMES_OVER' | 'TOTAL_GAMES_UNDER'
  // Generic
  | string;

export interface AnalysisFactors {
  formScore: number;
  h2hScore: number;
  homeAdvantage?: number;
  leagueStrength?: number;
  injuries?: number;
  weather?: number;
  motivation?: number;
  [key: string]: number | undefined;
}

// ============== CONFIG CONSTANTS ==============

export const CONFIG = {
  // Edge thresholds
  STRONG_BET_EDGE: 0.10,      // 10%+
  GOOD_VALUE_EDGE: 0.05,      // 5%+
  FAIR_EDGE: 0.02,            // 2%+
  POOR_VALUE_EDGE: 0,         // 0%+
  
  // Data quality thresholds
  HIGH_QUALITY_GAMES: 15,
  MEDIUM_QUALITY_GAMES: 8,
  LOW_QUALITY_GAMES: 3,
  
  // Risk thresholds
  LOW_RISK_CONFIDENCE: 70,
  MEDIUM_RISK_CONFIDENCE: 55,
  HIGH_RISK_CONFIDENCE: 40,
  
  // Confidence limits
  MAX_CONFIDENCE: 95,
  MIN_CONFIDENCE_TO_SHOW: 35,
  
  // API settings
  CACHE_TTL_MINUTES: 30,
  MAX_PREDICTIONS_PER_REQUEST: 50,
};

// ============== PREDICTION INTERFACE ==============

export interface Prediction {
  matchId: string;
  sport: Sport | string;
  market: Market | string;
  pick: string;
  line?: number;
  
  // Core numbers
  probability?: number;
  calculatedProbability?: number;
  confidence: number;
  edge: number;
  impliedProbability?: number;
  
  // Bookmaker data
  bookmakerOdds?: number;
  bookmaker?: string;
  odds?: number;
  
  // Risk & Category
  riskLevel: RiskLevel | string;
  category?: 'LOW_RISK' | 'VALUE' | 'SPECULATIVE' | 'UPSET' | 'NO_BET' | string;
  dataQuality?: DataQuality | string;
  valueRating?: ValueRating | string;
  modelAgreement?: number;
  
  // Analysis factors
  factors?: AnalysisFactors;
  
  // Reasoning
  reasoning: string[];
  warnings: string[];
  positives?: string[];
  
  // Match info
  matchInfo?: {
    homeTeam: string;
    awayTeam: string;
    league: string;
    leagueId?: number;
    kickoff: Date | string;
  };
  
  // AI Enhancement
  aiInsight?: string | null;
  aiEnhanced?: boolean;
  
  // Odds comparison
  oddsComparison?: {
    bookmakerOdds: number;
    bookmakerLine?: number;
    bookmaker: string;
    edge: number;
    value: string;
  };
  
  // Tennis specific (optional)
  player1?: { name: string; ranking?: number };
  player2?: { name: string; ranking?: number };
  tournament?: { name: string; surface: string };
  round?: string;
  
  // Settlement
  isSettled?: boolean;
  actualResult?: string;
  won?: boolean;
  createdAt?: Date | string;
}

// ============== LEAGUE CONSTANTS ==============

// Football Leagues
export const FOOTBALL_LEAGUES = [
  { id: 39, name: 'Premier League' },
  { id: 40, name: 'Championship' },
  { id: 140, name: 'La Liga' },
  { id: 141, name: 'Segunda División' },
  { id: 135, name: 'Serie A' },
  { id: 136, name: 'Serie B' },
  { id: 78, name: 'Bundesliga' },
  { id: 79, name: 'Bundesliga 2' },
  { id: 61, name: 'Ligue 1' },
  { id: 62, name: 'Ligue 2' },
  { id: 94, name: 'Primeira Liga' },
  { id: 88, name: 'Eredivisie' },
  { id: 144, name: 'Belgian Pro League' },
  { id: 203, name: 'Turkish Süper Lig' },
  { id: 179, name: 'Scottish Premiership' },
  { id: 2, name: 'Champions League' },
  { id: 3, name: 'Europa League' },
  { id: 848, name: 'Conference League' },
  { id: 45, name: 'FA Cup' },
  { id: 48, name: 'League Cup' },
];

// Basketball Leagues
export const BASKETBALL_LEAGUES = [
  { id: 12, name: 'NBA' },
  { id: 13, name: 'G League' },
  { id: 120, name: 'Euroleague' },
  { id: 117, name: 'Eurocup' },
  { id: 118, name: 'Basketball Champions League' },
  { id: 194, name: 'NBL' },
  { id: 20, name: 'Liga ACB' },
  { id: 21, name: 'LNB Pro A' },
  { id: 22, name: 'Lega Basket' },
  { id: 23, name: 'BBL' },
  { id: 30, name: 'Turkish BSL' },
  { id: 31, name: 'Greek Basket League' },
  { id: 202, name: 'CBA' },
];

// Tennis Tournaments
export const TENNIS_TOURNAMENTS = [
  { id: 1, name: 'Australian Open', category: 'Grand Slam' },
  { id: 2, name: 'French Open', category: 'Grand Slam' },
  { id: 3, name: 'Wimbledon', category: 'Grand Slam' },
  { id: 4, name: 'US Open', category: 'Grand Slam' },
  { id: 5, name: 'ATP Finals', category: 'ATP Finals' },
  { id: 6, name: 'Indian Wells', category: 'Masters 1000' },
  { id: 7, name: 'Miami Open', category: 'Masters 1000' },
  { id: 8, name: 'Monte Carlo', category: 'Masters 1000' },
  { id: 9, name: 'Madrid Open', category: 'Masters 1000' },
  { id: 10, name: 'Rome Masters', category: 'Masters 1000' },
  { id: 11, name: 'Cincinnati Masters', category: 'Masters 1000' },
  { id: 12, name: 'Shanghai Masters', category: 'Masters 1000' },
  { id: 13, name: 'Paris Masters', category: 'Masters 1000' },
  { id: 14, name: 'Canada Masters', category: 'Masters 1000' },
];

// ============== UI CONFIG ==============

// Category labels for UI
export const CATEGORY_CONFIG = {
  LOW_RISK: {
    label: 'Low Risk',
    icon: '🛡️',
    color: 'green',
    description: 'High confidence + positive edge vs bookmaker',
  },
  VALUE: {
    label: 'Value Bet',
    icon: '💎',
    color: 'blue',
    description: 'Good edge against bookmaker odds',
  },
  SPECULATIVE: {
    label: 'Speculative',
    icon: '⚡',
    color: 'yellow',
    description: 'Lower confidence or marginal edge',
  },
  UPSET: {
    label: 'Upset Alert',
    icon: '🔥',
    color: 'orange',
    description: 'High risk underdog with form advantage',
  },
  NO_BET: {
    label: 'No Bet',
    icon: '🚫',
    color: 'red',
    description: 'Negative edge - avoid',
  },
};

// Data quality labels
export const DATA_QUALITY_CONFIG = {
  HIGH: {
    label: 'High Quality',
    color: 'green',
    description: 'Real team/player statistics',
  },
  MEDIUM: {
    label: 'Medium Quality',
    color: 'yellow',
    description: 'Mixed data sources',
  },
  LOW: {
    label: 'Low Quality',
    color: 'orange',
    description: 'Limited data available',
  },
  NO_DATA: {
    label: 'No Data',
    color: 'red',
    description: 'Insufficient data',
  },
  FALLBACK: {
    label: 'Estimated',
    color: 'red',
    description: 'Using league averages only',
  },
};

// Risk level labels
export const RISK_LEVEL_CONFIG = {
  LOW: {
    label: 'Low Risk',
    color: 'green',
    description: 'High confidence prediction',
  },
  MEDIUM: {
    label: 'Medium Risk',
    color: 'yellow',
    description: 'Moderate confidence',
  },
  HIGH: {
    label: 'High Risk',
    color: 'orange',
    description: 'Lower confidence',
  },
  VERY_HIGH: {
    label: 'Very High Risk',
    color: 'red',
    description: 'Speculative pick',
  },
};

// Value rating labels
export const VALUE_RATING_CONFIG = {
  STRONG_BET: {
    label: 'Strong Bet',
    color: 'green',
    description: '10%+ edge',
  },
  GOOD_VALUE: {
    label: 'Good Value',
    color: 'blue',
    description: '5%+ edge',
  },
  FAIR: {
    label: 'Fair Value',
    color: 'yellow',
    description: '2%+ edge',
  },
  POOR_VALUE: {
    label: 'Poor Value',
    color: 'orange',
    description: 'Minimal edge',
  },
  AVOID: {
    label: 'Avoid',
    color: 'red',
    description: 'Negative edge',
  },
};