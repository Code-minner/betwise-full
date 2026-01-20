// =============================================================
// FILE: lib/types.ts (UPDATED)
// =============================================================
// 
// Added: category field for LOW_RISK, VALUE, SPECULATIVE, UPSET, NO_BET
// Added: Sport type

export type Sport = 'FOOTBALL' | 'BASKETBALL' | 'TENNIS';

export interface Prediction {
  matchId: string;
  sport: string;
  market: string;
  pick: string;
  line?: number;
  
  // Core numbers
  probability: number;
  confidence: number;
  edge: number;
  impliedProbability?: number;
  
  // Bookmaker data
  bookmakerOdds?: number;
  bookmaker?: string;
  odds?: number; // Legacy support
  
  // Risk & Category
  riskLevel: string;
  category: 'LOW_RISK' | 'VALUE' | 'SPECULATIVE' | 'UPSET' | 'NO_BET' | string;
  dataQuality?: 'HIGH' | 'MEDIUM' | 'LOW' | 'FALLBACK' | string;
  modelAgreement?: number;
  
  // Reasoning
  reasoning: string[];
  warnings: string[];
  positives?: string[];
  
  // Match info
  matchInfo: {
    homeTeam: string;
    awayTeam: string;
    league: string;
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
}

// Football Leagues
export const FOOTBALL_LEAGUES = [
  { id: 39, name: 'Premier League' },
  { id: 140, name: 'La Liga' },
  { id: 135, name: 'Serie A' },
  { id: 78, name: 'Bundesliga' },
  { id: 61, name: 'Ligue 1' },
  { id: 94, name: 'Primeira Liga' },
  { id: 88, name: 'Eredivisie' },
  { id: 2, name: 'Champions League' },
  { id: 3, name: 'Europa League' },
  { id: 848, name: 'Conference League' },
];

// Basketball Leagues
export const BASKETBALL_LEAGUES = [
  { id: 12, name: 'NBA' },
  { id: 13, name: 'G League' },
  { id: 120, name: 'Euroleague' },
  { id: 117, name: 'Eurocup' },
  { id: 194, name: 'NBL' },
  { id: 20, name: 'Liga ACB' },
  { id: 21, name: 'LNB Pro A' },
  { id: 22, name: 'Lega Basket' },
  { id: 23, name: 'BBL' },
];

// Tennis Tournaments
export const TENNIS_TOURNAMENTS = [
  { id: 1, name: 'Australian Open', category: 'Grand Slam' },
  { id: 2, name: 'French Open', category: 'Grand Slam' },
  { id: 3, name: 'Wimbledon', category: 'Grand Slam' },
  { id: 4, name: 'US Open', category: 'Grand Slam' },
  { id: 5, name: 'ATP Finals', category: 'ATP' },
  { id: 6, name: 'Indian Wells', category: 'Masters 1000' },
  { id: 7, name: 'Miami Open', category: 'Masters 1000' },
  { id: 8, name: 'Monte Carlo', category: 'Masters 1000' },
  { id: 9, name: 'Madrid Open', category: 'Masters 1000' },
  { id: 10, name: 'Rome Masters', category: 'Masters 1000' },
];

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
  FALLBACK: {
    label: 'Estimated',
    color: 'red',
    description: 'Using league averages only',
  },
};