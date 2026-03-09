/**
 * Background Evaluation Engine
 * File: lib/background-eval.ts
 *
 * Integrates into each sport's analysis route to:
 * 1. Evaluate past predictions against actual results
 * 2. Build calibration profiles from evaluation history
 * 3. Return performance stats for display on the same page
 *
 * This runs as a non-blocking background task during analysis
 * so it doesn't slow down the prediction pipeline.
 */

import { supabase, isSupabaseConfigured } from './supabase';
import {
  evaluateRecentPredictions,
  evaluatePrediction,
  calculatePerformanceStats,
  saveEvaluationResults,
  type PredictionRecord,
  type EvaluationResult,
  type PerformanceStats,
} from './evaluation';
import {
  buildCalibrationProfile,
  type CalibrationProfile,
  type EvaluatedPrediction,
} from './calibration';

// ============== TYPES ==============

export interface BackgroundEvalResult {
  /** Performance stats for display */
  performance: PerformanceStats | null;
  /** Calibration profile for adjusting future predictions */
  calibration: CalibrationProfile | null;
  /** How many predictions were newly evaluated this run */
  newlyEvaluated: number;
  /** Whether evaluation ran successfully */
  success: boolean;
  /** Error message if failed */
  error?: string;
  /** Recent evaluated predictions for the "recent results" UI section */
  recentResults: RecentResult[];
}

export interface RecentResult {
  homeTeam: string;
  awayTeam: string;
  market: string;
  selection: string;
  result: 'WIN' | 'LOSS' | 'PUSH' | 'VOID';
  odds: number;
  profit: number;
  matchDate: string;
  actualScore: string;
}

// ============== CACHES ==============
// Cache calibration profiles per sport (refreshed each analysis run)

const calibrationCache: Record<string, { profile: CalibrationProfile; time: number }> = {};
const performanceCache: Record<string, { stats: PerformanceStats; time: number }> = {};
const CACHE_TTL = 15 * 60 * 1000; // 15 min

// ============== MAIN ENTRY POINT ==============

/**
 * Run background evaluation for a sport.
 * Call this from each sport's analysis route.
 * It's designed to be non-blocking — wrap in a try/catch
 * and don't await if you want fire-and-forget.
 */
export async function runBackgroundEvaluation(
  sport: 'FOOTBALL' | 'BASKETBALL' | 'TENNIS'
): Promise<BackgroundEvalResult> {
  if (!isSupabaseConfigured()) {
    return {
      performance: null,
      calibration: null,
      newlyEvaluated: 0,
      success: false,
      error: 'Supabase not configured',
      recentResults: [],
    };
  }

  try {
    console.log(`[BackgroundEval] Starting ${sport} evaluation...`);

    // === STEP 1: Evaluate unevaluated past predictions ===
    const newlyEvaluated = await evaluateUnevaluatedPredictions(sport);

    // === STEP 2: Fetch ALL evaluated predictions for this sport ===
    const allEvaluated = await fetchEvaluatedPredictions(sport);

    // === STEP 3: Calculate performance stats ===
    const performance = calculatePerformanceStats(allEvaluated);

    // === STEP 4: Build calibration profile ===
    const calibrationInput: EvaluatedPrediction[] = allEvaluated
      .filter(p => p.result === 'WIN' || p.result === 'LOSS')
      .map(p => ({
        probability: p.probability > 1 ? p.probability / 100 : p.probability,
        confidence: p.confidence,
        result: p.result as 'WIN' | 'LOSS',
        market: p.market,
        sport: sport,
      }));

    const calibration = buildCalibrationProfile(calibrationInput, sport);

    // === STEP 5: Build recent results for UI ===
    const recentResults: RecentResult[] = allEvaluated
      .filter(p => p.result && p.evaluated_at)
      .sort((a, b) => new Date(b.evaluated_at!).getTime() - new Date(a.evaluated_at!).getTime())
      .slice(0, 15)
      .map(p => ({
        homeTeam: p.home_team,
        awayTeam: p.away_team,
        market: p.market,
        selection: p.selection,
        result: p.result as 'WIN' | 'LOSS' | 'PUSH' | 'VOID',
        odds: p.odds || 0,
        profit: p.profit || 0,
        matchDate: p.match_date || '',
        actualScore: p.actual_score_home != null && p.actual_score_away != null
          ? `${p.actual_score_home}-${p.actual_score_away}`
          : '?-?',
      }));

    // Cache results
    calibrationCache[sport] = { profile: calibration, time: Date.now() };
    performanceCache[sport] = { stats: performance, time: Date.now() };

    console.log(`[BackgroundEval] ${sport} complete: ${newlyEvaluated} new evals, ${allEvaluated.length} total, calibration ${calibration.isReliable ? 'RELIABLE' : 'INSUFFICIENT DATA'}`);

    return {
      performance,
      calibration,
      newlyEvaluated,
      success: true,
      recentResults,
    };
  } catch (error) {
    console.error(`[BackgroundEval] ${sport} error:`, error);
    return {
      performance: null,
      calibration: null,
      newlyEvaluated: 0,
      success: false,
      error: String(error),
      recentResults: [],
    };
  }
}

/**
 * Get cached calibration profile (for use during prediction generation).
 * Returns null if no cached profile or cache expired.
 */
export function getCachedCalibration(sport: string): CalibrationProfile | null {
  const cached = calibrationCache[sport];
  if (cached && Date.now() - cached.time < CACHE_TTL) {
    return cached.profile;
  }
  return null;
}

/**
 * Get cached performance stats (for quick access without re-running eval).
 */
export function getCachedPerformance(sport: string): PerformanceStats | null {
  const cached = performanceCache[sport];
  if (cached && Date.now() - cached.time < CACHE_TTL) {
    return cached.stats;
  }
  return null;
}

// ============== INTERNAL HELPERS ==============

/**
 * Find and evaluate predictions that haven't been checked yet.
 */
async function evaluateUnevaluatedPredictions(
  sport: 'FOOTBALL' | 'BASKETBALL' | 'TENNIS'
): Promise<number> {
  // Build market filter based on sport
  let marketFilter: string;
  if (sport === 'FOOTBALL') {
    marketFilter = 'market.like.%GOAL%,market.like.%WINNER_HOME%,market.like.%WINNER_AWAY%,market.like.%DOUBLE%,market.like.%BTTS%';
  } else if (sport === 'BASKETBALL') {
    marketFilter = 'market.like.%TOTAL%,market.like.%SPREAD%,market.eq.MONEYLINE';
  } else {
    marketFilter = 'market.eq.MATCH_WINNER';
  }

  // Query unevaluated predictions with past match dates
  const today = new Date().toISOString().split('T')[0];
  const { data: unevaluated, error } = await supabase
    .from('predictions')
    .select('*')
    .is('result', null)
    .not('match_date', 'is', null)
    .lt('match_date', today)
    .or(marketFilter)
    .order('match_date', { ascending: false })
    .limit(50);

  if (error || !unevaluated || unevaluated.length === 0) {
    if (error) console.error('[BackgroundEval] Query error:', error);
    return 0;
  }

  console.log(`[BackgroundEval] Found ${unevaluated.length} unevaluated ${sport} predictions`);

  // Evaluate them
  const results = await evaluateRecentPredictions(unevaluated as PredictionRecord[], sport);

  // Save results back to Supabase
  if (results.length > 0) {
    await saveEvaluationResults(supabase, results);
    console.log(`[BackgroundEval] Saved ${results.length} new ${sport} evaluations`);
  }

  return results.length;
}

/**
 * Fetch all evaluated predictions for a sport from Supabase.
 */
async function fetchEvaluatedPredictions(
  sport: 'FOOTBALL' | 'BASKETBALL' | 'TENNIS'
): Promise<PredictionRecord[]> {
  let marketFilter: string;
  if (sport === 'FOOTBALL') {
    marketFilter = 'market.like.%GOAL%,market.like.%WINNER_HOME%,market.like.%WINNER_AWAY%,market.like.%DOUBLE%,market.like.%BTTS%';
  } else if (sport === 'BASKETBALL') {
    marketFilter = 'market.like.%TOTAL%,market.like.%SPREAD%,market.eq.MONEYLINE';
  } else {
    marketFilter = 'market.eq.MATCH_WINNER';
  }

  const { data, error } = await supabase
    .from('predictions')
    .select('*')
    .not('result', 'is', null)
    .or(marketFilter)
    .order('evaluated_at', { ascending: false })
    .limit(500);

  if (error) {
    console.error('[BackgroundEval] Fetch evaluated error:', error);
    return [];
  }

  return (data || []) as PredictionRecord[];
}

// ============== SERIALIZABLE OUTPUT ==============

/**
 * Convert BackgroundEvalResult to a JSON-safe format
 * for sending in API responses.
 */
export function serializeEvalResult(result: BackgroundEvalResult) {
  return {
    performance: result.performance ? {
      total: result.performance.total,
      wins: result.performance.wins,
      losses: result.performance.losses,
      pushes: result.performance.pushes,
      hitRate: result.performance.hitRate,
      roi: result.performance.roi,
      profit: result.performance.profit,
      avgOdds: result.performance.avgOdds,
      avgConfidence: result.performance.avgConfidence,
      bestStreak: result.performance.bestStreak,
      currentStreak: result.performance.currentStreak,
      biggestWinOdds: result.performance.biggestWinOdds,
      byCategory: result.performance.byCategory,
      byMarket: result.performance.byMarket,
      calibration: result.performance.calibration,
      recentResults: result.performance.recentResults,
    } : null,
    calibration: result.calibration ? {
      sport: result.calibration.sport,
      bands: result.calibration.bands,
      overallBias: result.calibration.overallBias,
      overallCorrection: result.calibration.overallCorrection,
      sampleSize: result.calibration.sampleSize,
      isReliable: result.calibration.isReliable,
      lastUpdated: result.calibration.lastUpdated,
    } : null,
    newlyEvaluated: result.newlyEvaluated,
    success: result.success,
    recentResults: result.recentResults,
  };
}