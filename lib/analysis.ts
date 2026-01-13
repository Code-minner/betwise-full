/**
 * Core Analysis Engine
 * Probability calculations and confidence scoring
 */

import {
  Sport,
  DataQuality,
  RiskLevel,
  ValueRating,
  Market,
  Prediction,
  AnalysisFactors,
  CONFIG,
} from './types';

// ============== PROBABILITY HELPERS ==============

/**
 * Poisson distribution probability
 */
export function poissonProbability(lambda: number, k: number): number {
  if (lambda <= 0 || k < 0) return 0;
  
  let factorial = 1;
  for (let i = 2; i <= k; i++) {
    factorial *= i;
  }
  
  return (Math.pow(lambda, k) * Math.exp(-lambda)) / factorial;
}

/**
 * Poisson CDF - P(X < k) - for under bets
 */
export function poissonUnder(lambda: number, line: number): number {
  let prob = 0;
  const k = Math.floor(line);
  
  for (let i = 0; i < k; i++) {
    prob += poissonProbability(lambda, i);
  }
  
  if (line !== k) {
    prob += poissonProbability(lambda, k);
  }
  
  return Math.min(0.95, Math.max(0.05, prob));
}

/**
 * Poisson CDF - P(X >= k) - for over bets
 */
export function poissonOver(lambda: number, line: number): number {
  return 1 - poissonUnder(lambda, line);
}

// ============== ODDS CONVERSION ==============

export function oddsToImpliedProbability(odds: number): number {
  if (odds <= 1) return 1;
  return 1 / odds;
}

export function probabilityToOdds(probability: number): number {
  if (probability <= 0) return Infinity;
  if (probability >= 1) return 1;
  return 1 / probability;
}

export function calculateEdge(
  calculatedProbability: number,
  impliedProbability: number
): number {
  return calculatedProbability - impliedProbability;
}

// ============== VALUE RATING ==============

export function getValueRating(edge: number, dataQuality: DataQuality): ValueRating {
  const qualityMultiplier = 
    dataQuality === 'HIGH' ? 1 :
    dataQuality === 'MEDIUM' ? 1.2 :
    dataQuality === 'LOW' ? 1.5 : 2;
  
  const adjustedEdge = edge / qualityMultiplier;
  
  if (adjustedEdge >= CONFIG.STRONG_BET_EDGE) return 'STRONG_BET';
  if (adjustedEdge >= CONFIG.GOOD_VALUE_EDGE) return 'GOOD_VALUE';
  if (adjustedEdge >= CONFIG.FAIR_EDGE) return 'FAIR';
  if (adjustedEdge >= CONFIG.POOR_VALUE_EDGE) return 'POOR_VALUE';
  return 'AVOID';
}

// ============== DATA QUALITY ==============

export function assessDataQuality(
  gamesPlayed: number,
  hasApiData: boolean,
  hasH2H: boolean
): DataQuality {
  if (!hasApiData && gamesPlayed === 0) {
    return 'NO_DATA';
  }
  
  if (gamesPlayed >= CONFIG.HIGH_QUALITY_GAMES && hasApiData) {
    return 'HIGH';
  }
  
  if (gamesPlayed >= CONFIG.MEDIUM_QUALITY_GAMES) {
    return 'MEDIUM';
  }
  
  if (gamesPlayed >= CONFIG.LOW_QUALITY_GAMES) {
    return 'LOW';
  }
  
  return 'NO_DATA';
}

// ============== RISK LEVEL ==============

export function calculateRiskLevel(
  confidence: number,
  dataQuality: DataQuality
): RiskLevel {
  const qualityPenalty = 
    dataQuality === 'HIGH' ? 0 :
    dataQuality === 'MEDIUM' ? 5 :
    dataQuality === 'LOW' ? 10 : 20;
  
  const adjustedConfidence = confidence - qualityPenalty;
  
  if (adjustedConfidence >= CONFIG.LOW_RISK_CONFIDENCE) return 'LOW';
  if (adjustedConfidence >= CONFIG.MEDIUM_RISK_CONFIDENCE) return 'MEDIUM';
  if (adjustedConfidence >= CONFIG.HIGH_RISK_CONFIDENCE) return 'HIGH';
  return 'VERY_HIGH';
}

// ============== CONFIDENCE CALCULATION ==============

export interface ConfidenceInput {
  dataQuality: DataQuality;
  gamesPlayed: number;
  calculatedProbability: number;
  sampleConsistency: number;
  edge: number;
  marketEfficiency: number;
  formScore: number;
  h2hScore: number;
}

export function calculateConfidence(input: ConfidenceInput): number {
  const dataQualityScore = 
    input.dataQuality === 'HIGH' ? 85 :
    input.dataQuality === 'MEDIUM' ? 65 :
    input.dataQuality === 'LOW' ? 45 : 20;
  
  const sampleScore = Math.min(100, (input.gamesPlayed / CONFIG.HIGH_QUALITY_GAMES) * 100);
  
  const probDeviation = Math.abs(input.calculatedProbability - 0.5);
  const probabilityScore = 50 + (probDeviation * 100);
  
  const consistencyScore = input.sampleConsistency;
  
  const edgeScore = Math.min(100, Math.max(0, 50 + (input.edge * 500)));
  
  const marketScore = 100 - input.marketEfficiency;
  
  const formScore = input.formScore;
  const h2hScore = input.h2hScore;
  
  const rawConfidence = 
    (dataQualityScore * 0.25) +
    (sampleScore * 0.15) +
    (probabilityScore * 0.20) +
    (consistencyScore * 0.10) +
    (edgeScore * 0.15) +
    (marketScore * 0.05) +
    (formScore * 0.07) +
    (h2hScore * 0.03);
  
  return Math.round(Math.min(CONFIG.MAX_CONFIDENCE, Math.max(0, rawConfidence)));
}

// ============== FORM ANALYSIS ==============

export function analyzeFormString(form: string): {
  wins: number;
  draws: number;
  losses: number;
  recentScore: number;
  trend: 'IMPROVING' | 'STABLE' | 'DECLINING';
} {
  if (!form) {
    return { wins: 0, draws: 0, losses: 0, recentScore: 50, trend: 'STABLE' };
  }
  
  const results = form.toUpperCase().split('');
  let wins = 0, draws = 0, losses = 0;
  let weightedScore = 0;
  let recentWeight = results.length;
  
  results.forEach((r, i) => {
    const weight = recentWeight - i;
    
    if (r === 'W') {
      wins++;
      weightedScore += 3 * weight;
    } else if (r === 'D') {
      draws++;
      weightedScore += 1 * weight;
    } else if (r === 'L') {
      losses++;
    }
  });
  
  const maxScore = 3 * (recentWeight * (recentWeight + 1) / 2);
  const recentScore = Math.round((weightedScore / maxScore) * 100);
  
  const firstHalf = results.slice(0, Math.floor(results.length / 2));
  const secondHalf = results.slice(Math.floor(results.length / 2));
  
  const firstHalfScore = firstHalf.filter(r => r === 'W').length;
  const secondHalfScore = secondHalf.filter(r => r === 'W').length;
  
  let trend: 'IMPROVING' | 'STABLE' | 'DECLINING' = 'STABLE';
  if (secondHalfScore > firstHalfScore + 1) trend = 'IMPROVING';
  if (secondHalfScore < firstHalfScore - 1) trend = 'DECLINING';
  
  return { wins, draws, losses, recentScore, trend };
}

// ============== WARNINGS/POSITIVES ==============

export function generateWarnings(
  confidence: number,
  dataQuality: DataQuality,
  edge: number,
  factors: AnalysisFactors
): string[] {
  const warnings: string[] = [];
  
  if (dataQuality === 'LOW') {
    warnings.push('Limited data available');
  }
  
  if (dataQuality === 'NO_DATA') {
    warnings.push('Insufficient data for reliable prediction');
  }
  
  if (edge < 0) {
    warnings.push(`Negative edge (${(edge * 100).toFixed(1)}%)`);
  }
  
  if (confidence < 50) {
    warnings.push('Below average confidence');
  }
  
  if (factors.formScore < 40) {
    warnings.push('Poor recent form');
  }
  
  return warnings;
}

export function generatePositives(
  confidence: number,
  dataQuality: DataQuality,
  edge: number,
  factors: AnalysisFactors
): string[] {
  const positives: string[] = [];
  
  if (dataQuality === 'HIGH') {
    positives.push('Strong data quality');
  }
  
  if (edge >= 0.05) {
    positives.push(`Good edge (+${(edge * 100).toFixed(1)}%)`);
  }
  
  if (confidence >= 70) {
    positives.push('High confidence');
  }
  
  if (factors.formScore >= 70) {
    positives.push('Excellent form');
  }
  
  return positives;
}

// ============== MARKET EFFICIENCY ==============

export function getMarketEfficiency(sport: Sport, market: string): number {
  const highEfficiency = ['TOTAL_OVER', 'TOTAL_UNDER'];
  const mediumEfficiency = ['OVER_2_5', 'UNDER_2_5', 'BTTS_YES', 'BTTS_NO'];
  const lowEfficiency = ['CORNERS', 'HOME_CORNERS', 'AWAY_CORNERS'];
  
  if (highEfficiency.some(m => market.includes(m))) return 75;
  if (mediumEfficiency.some(m => market.includes(m))) return 60;
  if (lowEfficiency.some(m => market.includes(m))) return 45;
  
  return 55;
}

// ============== PREDICTION BUILDER ==============

export interface PredictionInput {
  matchId: string;
  sport: Sport;
  market: Market;
  pick: string;
  line?: number;
  odds: number;
  calculatedProbability: number;
  gamesPlayed: number;
  hasApiData: boolean;
  hasH2H: boolean;
  sampleConsistency: number;
  factors: AnalysisFactors;
  matchInfo?: {
    homeTeam: string;
    awayTeam: string;
    league: string;
    kickoff: Date;
  };
}

export function buildPrediction(input: PredictionInput): Prediction | null {
  const {
    matchId, sport, market, pick, line, odds,
    calculatedProbability, gamesPlayed, hasApiData, hasH2H,
    sampleConsistency, factors, matchInfo,
  } = input;
  
  const impliedProbability = oddsToImpliedProbability(odds);
  const edge = calculateEdge(calculatedProbability, impliedProbability);
  const dataQuality = assessDataQuality(gamesPlayed, hasApiData, hasH2H);
  
  if (dataQuality === 'NO_DATA') {
    return null;
  }
  
  const marketEfficiency = getMarketEfficiency(sport, market);
  
  const confidence = calculateConfidence({
    dataQuality,
    gamesPlayed,
    calculatedProbability,
    sampleConsistency,
    edge,
    marketEfficiency,
    formScore: factors.formScore,
    h2hScore: factors.h2hScore,
  });
  
  if (confidence < CONFIG.MIN_CONFIDENCE_TO_SHOW) {
    return null;
  }
  
  const riskLevel = calculateRiskLevel(confidence, dataQuality);
  const valueRating = getValueRating(edge, dataQuality);
  
  const warnings = generateWarnings(confidence, dataQuality, edge, factors);
  const positives = generatePositives(confidence, dataQuality, edge, factors);
  
  const reasoning: string[] = [];
  if (edge > 0) {
    reasoning.push(`Edge of +${(edge * 100).toFixed(1)}% over implied odds`);
  }
  reasoning.push(`Based on ${gamesPlayed} games of data`);
  
  return {
    matchId,
    sport,
    market,
    pick,
    line,
    odds,
    calculatedProbability,
    impliedProbability,
    edge,
    confidence,
    dataQuality,
    riskLevel,
    valueRating,
    factors,
    warnings,
    positives,
    reasoning,
    isSettled: false,
    createdAt: new Date(),
    matchInfo,
  };
}
