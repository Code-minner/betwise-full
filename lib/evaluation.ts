/**
 * Prediction Evaluation System
 * File: lib/evaluation.ts
 * 
 * Checks past predictions against actual results to track:
 * - Hit rate (% of correct predictions)
 * - ROI (return on investment if flat-staking)
 * - Accuracy by sport, market, category, and confidence band
 * - Calibration (does 70% confidence actually win 70%?)
 * 
 * Uses API-Sports for actual match results + Supabase for storage
 */

const SPORTS_API_KEY = process.env.SPORTS_API_KEY || '';
const FOOTBALL_HOST = 'v3.football.api-sports.io';
const BASKETBALL_HOST = 'v1.basketball.api-sports.io';

// ============== TYPES ==============

export interface PredictionRecord {
  id: string;
  created_at: string;
  home_team: string;
  away_team: string;
  market: string;
  selection: string;
  line: number | null;
  odds: number;
  probability: number;
  confidence: number;
  expected_value: number;
  data_quality: string;
  match_date: string | null;
  // Evaluation fields
  result?: 'WIN' | 'LOSS' | 'PUSH' | 'VOID' | null;
  actual_score_home?: number | null;
  actual_score_away?: number | null;
  evaluated_at?: string | null;
  profit?: number | null;
}

export interface EvaluationResult {
  predictionId: string;
  result: 'WIN' | 'LOSS' | 'PUSH' | 'VOID';
  actualScoreHome: number;
  actualScoreAway: number;
  profit: number; // +odds-1 for win, -1 for loss, 0 for push
}

export interface PerformanceStats {
  total: number;
  wins: number;
  losses: number;
  pushes: number;
  voids: number;
  hitRate: number;
  roi: number;
  totalStaked: number;
  totalReturn: number;
  profit: number;
  avgOdds: number;
  avgConfidence: number;
  // By category
  byCategory: Record<string, CategoryStats>;
  // By sport
  bySport: Record<string, CategoryStats>;
  // By market
  byMarket: Record<string, CategoryStats>;
  // Calibration: confidence band → actual hit rate
  calibration: CalibrationBand[];
  // Recent streak
  recentResults: Array<{ result: string; pick: string; odds: number }>;
  // Best/worst
  bestStreak: number;
  currentStreak: number;
  biggestWinOdds: number;
}

export interface CategoryStats {
  total: number;
  wins: number;
  losses: number;
  hitRate: number;
  roi: number;
  profit: number;
  avgOdds: number;
}

export interface CalibrationBand {
  band: string; // "50-60%", "60-70%", etc.
  predicted: number; // Average predicted probability
  actual: number; // Actual hit rate
  count: number;
  isCalibrated: boolean; // Within 10% of predicted
}

// ============== FETCH ACTUAL RESULTS ==============

async function fetchFootballResult(
  homeTeam: string,
  awayTeam: string,
  matchDate: string
): Promise<{ homeGoals: number; awayGoals: number } | null> {
  if (!SPORTS_API_KEY) return null;

  try {
    const res = await fetch(
      `https://${FOOTBALL_HOST}/fixtures?date=${matchDate}&status=FT-AET-PEN`,
      {
        headers: { 'x-apisports-key': SPORTS_API_KEY },
        next: { revalidate: 3600 },
      }
    );

    if (!res.ok) return null;
    const json = await res.json();
    const fixtures = json.response || [];

    // Find matching fixture
    const normalize = (s: string) =>
      s.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/\b(fc|sc|cf)\b/g, '').trim();

    const normHome = normalize(homeTeam);
    const normAway = normalize(awayTeam);

    for (const f of fixtures) {
      const fHome = normalize(f.teams.home.name);
      const fAway = normalize(f.teams.away.name);

      if (
        (fHome.includes(normHome) || normHome.includes(fHome)) &&
        (fAway.includes(normAway) || normAway.includes(fAway))
      ) {
        return {
          homeGoals: f.goals.home,
          awayGoals: f.goals.away,
        };
      }
    }

    return null;
  } catch {
    return null;
  }
}

async function fetchBasketballResult(
  homeTeam: string,
  awayTeam: string,
  matchDate: string
): Promise<{ homeScore: number; awayScore: number } | null> {
  if (!SPORTS_API_KEY) return null;

  try {
    const res = await fetch(
      `https://${BASKETBALL_HOST}/games?date=${matchDate}`,
      {
        headers: { 'x-apisports-key': SPORTS_API_KEY },
        next: { revalidate: 3600 },
      }
    );

    if (!res.ok) return null;
    const json = await res.json();
    const games = json.response || [];

    const normalize = (s: string) =>
      s.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').trim();

    const normHome = normalize(homeTeam);
    const normAway = normalize(awayTeam);

    for (const g of games) {
      const gHome = normalize(g.teams.home.name);
      const gAway = normalize(g.teams.away.name);

      if (
        (gHome.includes(normHome) || normHome.includes(gHome)) &&
        (gAway.includes(normAway) || normAway.includes(gAway))
      ) {
        if (g.scores?.home?.total != null && g.scores?.away?.total != null) {
          return {
            homeScore: g.scores.home.total,
            awayScore: g.scores.away.total,
          };
        }
      }
    }

    return null;
  } catch {
    return null;
  }
}

// ============== EVALUATE A SINGLE PREDICTION ==============

export function evaluatePrediction(
  prediction: PredictionRecord,
  homeScore: number,
  awayScore: number
): EvaluationResult {
  const market = prediction.market;
  const totalGoals = homeScore + awayScore;
  let result: 'WIN' | 'LOSS' | 'PUSH' | 'VOID' = 'LOSS';

  // --- FOOTBALL MARKETS ---

  // Over 2.5 Goals
  if (market === 'GOALS_OVER_2_5' || market.includes('OVER') && market.includes('2_5')) {
    result = totalGoals > 2.5 ? 'WIN' : 'LOSS';
  }
  // Under 2.5 Goals
  else if (market === 'GOALS_UNDER_2_5' || market.includes('UNDER') && market.includes('2_5')) {
    result = totalGoals < 2.5 ? 'WIN' : 'LOSS';
  }
  // Home Win
  else if (market === 'MATCH_WINNER_HOME') {
    result = homeScore > awayScore ? 'WIN' : 'LOSS';
  }
  // Away Win
  else if (market === 'MATCH_WINNER_AWAY') {
    result = awayScore > homeScore ? 'WIN' : 'LOSS';
  }
  // Double Chance 1X (Home or Draw)
  else if (market === 'DOUBLE_CHANCE_1X') {
    result = homeScore >= awayScore ? 'WIN' : 'LOSS';
  }
  // Double Chance X2 (Draw or Away)
  else if (market === 'DOUBLE_CHANCE_X2') {
    result = awayScore >= homeScore ? 'WIN' : 'LOSS';
  }
  // BTTS
  else if (market === 'BTTS_YES') {
    result = homeScore > 0 && awayScore > 0 ? 'WIN' : 'LOSS';
  }
  else if (market === 'BTTS_NO') {
    result = homeScore === 0 || awayScore === 0 ? 'WIN' : 'LOSS';
  }

  // --- BASKETBALL MARKETS ---

  // Totals Over
  else if (market === 'TOTALS_OVER' || market.includes('OVER')) {
    const line = prediction.line || 220;
    const total = homeScore + awayScore;
    if (total > line) result = 'WIN';
    else if (total === line) result = 'PUSH';
    else result = 'LOSS';
  }
  // Totals Under
  else if (market === 'TOTALS_UNDER' || market.includes('UNDER')) {
    const line = prediction.line || 220;
    const total = homeScore + awayScore;
    if (total < line) result = 'WIN';
    else if (total === line) result = 'PUSH';
    else result = 'LOSS';
  }
  // Spread Home
  else if (market.includes('SPREAD_HOME')) {
    const line = prediction.line || 0;
    const margin = homeScore - awayScore;
    if (margin > line) result = 'WIN';
    else if (margin === line) result = 'PUSH';
    else result = 'LOSS';
  }
  // Spread Away
  else if (market.includes('SPREAD_AWAY')) {
    const line = prediction.line || 0;
    const margin = awayScore - homeScore;
    if (margin > line) result = 'WIN';
    else if (margin === line) result = 'PUSH';
    else result = 'LOSS';
  }
  // Moneyline
  else if (market === 'MONEYLINE') {
    const pickIsHome = prediction.selection.includes(prediction.home_team);
    if (pickIsHome) {
      result = homeScore > awayScore ? 'WIN' : 'LOSS';
    } else {
      result = awayScore > homeScore ? 'WIN' : 'LOSS';
    }
  }

  // --- TENNIS MARKETS ---

  // Match Winner (tennis)
  else if (market === 'MATCH_WINNER') {
    // In tennis, homeScore/awayScore = sets won
    const pickIsP1 = prediction.selection.includes(prediction.home_team);
    if (pickIsP1) {
      result = homeScore > awayScore ? 'WIN' : 'LOSS';
    } else {
      result = awayScore > homeScore ? 'WIN' : 'LOSS';
    }
  }

  // Calculate profit (flat stake of 1 unit)
  let profit = 0;
  const odds = prediction.odds || 1.9; // Default to 1.9 if no odds
  if (result === 'WIN') {
    profit = odds - 1; // e.g., odds 2.1 → profit +1.1
  } else if (result === 'LOSS') {
    profit = -1;
  }
  // PUSH = 0 profit

  return {
    predictionId: prediction.id,
    result,
    actualScoreHome: homeScore,
    actualScoreAway: awayScore,
    profit: Math.round(profit * 100) / 100,
  };
}

// ============== BATCH EVALUATE ==============

export async function evaluateRecentPredictions(
  predictions: PredictionRecord[],
  sport: 'FOOTBALL' | 'BASKETBALL' | 'TENNIS'
): Promise<EvaluationResult[]> {
  const results: EvaluationResult[] = [];

  // Only evaluate predictions that have a match_date and haven't been evaluated
  const toEvaluate = predictions.filter(
    p => p.match_date && !p.result && !p.evaluated_at
  );

  console.log(`[Eval] Evaluating ${toEvaluate.length} ${sport} predictions`);

  // Group by date to minimize API calls
  const byDate: Record<string, PredictionRecord[]> = {};
  for (const p of toEvaluate) {
    const date = p.match_date!;
    if (!byDate[date]) byDate[date] = [];
    byDate[date].push(p);
  }

  for (const [date, preds] of Object.entries(byDate)) {
    // Only evaluate past dates (not today/future)
    const matchDate = new Date(date);
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    if (matchDate >= today) {
      console.log(`[Eval] Skipping ${date} — not yet finished`);
      continue;
    }

    for (const pred of preds) {
      let score: { homeScore?: number; awayScore?: number; homeGoals?: number; awayGoals?: number } | null = null;

      if (sport === 'FOOTBALL') {
        const result = await fetchFootballResult(pred.home_team, pred.away_team, date);
        if (result) score = { homeScore: result.homeGoals, awayScore: result.awayGoals };
      } else if (sport === 'BASKETBALL') {
        score = await fetchBasketballResult(pred.home_team, pred.away_team, date);
      }
      // Tennis evaluation would need SofaScore match results

      if (score && score.homeScore != null && score.awayScore != null) {
        const evalResult = evaluatePrediction(pred, score.homeScore!, score.awayScore!);
        results.push(evalResult);
        console.log(
          `[Eval] ${pred.home_team} vs ${pred.away_team}: ${pred.selection} → ${evalResult.result} (${score.homeScore}-${score.awayScore}) P/L: ${evalResult.profit > 0 ? '+' : ''}${evalResult.profit}`
        );
      } else {
        console.log(`[Eval] No result found for ${pred.home_team} vs ${pred.away_team} on ${date}`);
      }
    }

    // Rate limit: don't hammer the API
    await new Promise(r => setTimeout(r, 300));
  }

  console.log(`[Eval] Completed: ${results.length} evaluated, ${results.filter(r => r.result === 'WIN').length} wins`);
  return results;
}

// ============== CALCULATE PERFORMANCE STATS ==============

export function calculatePerformanceStats(
  predictions: PredictionRecord[]
): PerformanceStats {
  // Only include evaluated predictions
  const evaluated = predictions.filter(p => p.result && p.result !== 'VOID');

  const wins = evaluated.filter(p => p.result === 'WIN');
  const losses = evaluated.filter(p => p.result === 'LOSS');
  const pushes = evaluated.filter(p => p.result === 'PUSH');
  const voids = predictions.filter(p => p.result === 'VOID');

  const totalStaked = evaluated.length; // 1 unit per bet
  const totalReturn = evaluated.reduce((sum, p) => {
    if (p.result === 'WIN') return sum + (p.odds || 1.9);
    if (p.result === 'PUSH') return sum + 1;
    return sum;
  }, 0);
  const profit = totalReturn - totalStaked;

  const hitRate = evaluated.length > 0 ? (wins.length / evaluated.length) * 100 : 0;
  const roi = totalStaked > 0 ? (profit / totalStaked) * 100 : 0;

  // By category
  const byCategory = groupStats(evaluated, p => p.data_quality || 'UNKNOWN');

  // By sport (infer from market names)
  const bySport = groupStats(evaluated, p => {
    if (p.market.includes('GOAL') || p.market.includes('WINNER') || p.market.includes('DOUBLE_CHANCE') || p.market.includes('BTTS') || p.market.includes('CORNER')) return 'Football';
    if (p.market.includes('TOTAL') || p.market.includes('SPREAD') || p.market === 'MONEYLINE') return 'Basketball';
    if (p.market === 'MATCH_WINNER' || p.market.includes('GAMES')) return 'Tennis';
    return 'Other';
  });

  // By market
  const byMarket = groupStats(evaluated, p => p.market);

  // Calibration bands
  const calibration = calculateCalibration(evaluated);

  // Recent results (last 20)
  const recentResults = evaluated
    .sort((a, b) => new Date(b.evaluated_at || b.created_at).getTime() - new Date(a.evaluated_at || a.created_at).getTime())
    .slice(0, 20)
    .map(p => ({
      result: p.result!,
      pick: p.selection,
      odds: p.odds || 0,
    }));

  // Streaks
  const { bestStreak, currentStreak } = calculateStreaks(evaluated);

  // Biggest win
  const biggestWinOdds = wins.length > 0
    ? Math.max(...wins.map(w => w.odds || 0))
    : 0;

  return {
    total: evaluated.length,
    wins: wins.length,
    losses: losses.length,
    pushes: pushes.length,
    voids: voids.length,
    hitRate: Math.round(hitRate * 10) / 10,
    roi: Math.round(roi * 10) / 10,
    totalStaked,
    totalReturn: Math.round(totalReturn * 100) / 100,
    profit: Math.round(profit * 100) / 100,
    avgOdds: evaluated.length > 0
      ? Math.round(evaluated.reduce((s, p) => s + (p.odds || 0), 0) / evaluated.length * 100) / 100
      : 0,
    avgConfidence: evaluated.length > 0
      ? Math.round(evaluated.reduce((s, p) => s + p.confidence, 0) / evaluated.length)
      : 0,
    byCategory,
    bySport,
    byMarket,
    calibration,
    recentResults,
    bestStreak,
    currentStreak,
    biggestWinOdds,
  };
}

// ============== HELPERS ==============

function groupStats(
  predictions: PredictionRecord[],
  groupFn: (p: PredictionRecord) => string
): Record<string, CategoryStats> {
  const groups: Record<string, PredictionRecord[]> = {};

  for (const p of predictions) {
    const key = groupFn(p);
    if (!groups[key]) groups[key] = [];
    groups[key].push(p);
  }

  const result: Record<string, CategoryStats> = {};

  for (const [key, preds] of Object.entries(groups)) {
    const wins = preds.filter(p => p.result === 'WIN').length;
    const losses = preds.filter(p => p.result === 'LOSS').length;
    const totalReturn = preds.reduce((s, p) => {
      if (p.result === 'WIN') return s + (p.odds || 1.9);
      if (p.result === 'PUSH') return s + 1;
      return s;
    }, 0);
    const profit = totalReturn - preds.length;

    result[key] = {
      total: preds.length,
      wins,
      losses,
      hitRate: preds.length > 0 ? Math.round((wins / preds.length) * 1000) / 10 : 0,
      roi: preds.length > 0 ? Math.round((profit / preds.length) * 1000) / 10 : 0,
      profit: Math.round(profit * 100) / 100,
      avgOdds: preds.length > 0
        ? Math.round(preds.reduce((s, p) => s + (p.odds || 0), 0) / preds.length * 100) / 100
        : 0,
    };
  }

  return result;
}

function calculateCalibration(predictions: PredictionRecord[]): CalibrationBand[] {
  const bands: Record<string, { predicted: number[]; actual: number[] }> = {
    '40-50%': { predicted: [], actual: [] },
    '50-60%': { predicted: [], actual: [] },
    '60-70%': { predicted: [], actual: [] },
    '70-80%': { predicted: [], actual: [] },
    '80-90%': { predicted: [], actual: [] },
  };

  for (const p of predictions) {
    const prob = p.probability > 1 ? p.probability : p.probability * 100;
    const won = p.result === 'WIN' ? 1 : 0;

    if (prob >= 40 && prob < 50) { bands['40-50%'].predicted.push(prob); bands['40-50%'].actual.push(won); }
    else if (prob >= 50 && prob < 60) { bands['50-60%'].predicted.push(prob); bands['50-60%'].actual.push(won); }
    else if (prob >= 60 && prob < 70) { bands['60-70%'].predicted.push(prob); bands['60-70%'].actual.push(won); }
    else if (prob >= 70 && prob < 80) { bands['70-80%'].predicted.push(prob); bands['70-80%'].actual.push(won); }
    else if (prob >= 80) { bands['80-90%'].predicted.push(prob); bands['80-90%'].actual.push(won); }
  }

  return Object.entries(bands).map(([band, data]) => {
    const avgPredicted = data.predicted.length > 0
      ? data.predicted.reduce((s, v) => s + v, 0) / data.predicted.length
      : 0;
    const actualRate = data.actual.length > 0
      ? (data.actual.reduce((s, v) => s + v, 0) / data.actual.length) * 100
      : 0;

    return {
      band,
      predicted: Math.round(avgPredicted * 10) / 10,
      actual: Math.round(actualRate * 10) / 10,
      count: data.predicted.length,
      isCalibrated: data.predicted.length >= 5 && Math.abs(avgPredicted - actualRate) < 10,
    };
  });
}

function calculateStreaks(predictions: PredictionRecord[]): { bestStreak: number; currentStreak: number } {
  const sorted = predictions
    .filter(p => p.result === 'WIN' || p.result === 'LOSS')
    .sort((a, b) => new Date(a.evaluated_at || a.created_at).getTime() - new Date(b.evaluated_at || b.created_at).getTime());

  let bestStreak = 0;
  let currentStreak = 0;
  let streakType: 'WIN' | 'LOSS' | null = null;

  for (const p of sorted) {
    if (p.result === streakType) {
      currentStreak++;
    } else {
      if (streakType === 'WIN' && currentStreak > bestStreak) {
        bestStreak = currentStreak;
      }
      currentStreak = 1;
      streakType = p.result as 'WIN' | 'LOSS';
    }
  }

  if (streakType === 'WIN' && currentStreak > bestStreak) {
    bestStreak = currentStreak;
  }

  // Current streak from the end
  let current = 0;
  for (let i = sorted.length - 1; i >= 0; i--) {
    if (i === sorted.length - 1) {
      streakType = sorted[i].result as 'WIN' | 'LOSS';
      current = 1;
    } else if (sorted[i].result === streakType) {
      current++;
    } else {
      break;
    }
  }

  return {
    bestStreak,
    currentStreak: streakType === 'WIN' ? current : -current,
  };
}

// ============== SUPABASE INTEGRATION ==============

export async function getUnevaluatedPredictions(
  supabase: any,
  sport?: string
): Promise<PredictionRecord[]> {
  let query = supabase
    .from('predictions')
    .select('*')
    .is('result', null)
    .not('match_date', 'is', null)
    .lt('match_date', new Date().toISOString().split('T')[0]); // Past dates only

  if (sport) {
    if (sport === 'FOOTBALL') {
      query = query.or('market.like.%GOAL%,market.like.%WINNER%,market.like.%DOUBLE%,market.like.%BTTS%,market.like.%CORNER%');
    } else if (sport === 'BASKETBALL') {
      query = query.or('market.like.%TOTAL%,market.like.%SPREAD%,market.eq.MONEYLINE');
    }
  }

  const { data, error } = await query.order('match_date', { ascending: false }).limit(100);

  if (error) {
    console.error('[Eval] Supabase query error:', error);
    return [];
  }

  return data || [];
}

export async function saveEvaluationResults(
  supabase: any,
  results: EvaluationResult[]
): Promise<void> {
  for (const r of results) {
    const { error } = await supabase
      .from('predictions')
      .update({
        result: r.result,
        actual_score_home: r.actualScoreHome,
        actual_score_away: r.actualScoreAway,
        profit: r.profit,
        evaluated_at: new Date().toISOString(),
      })
      .eq('id', r.predictionId);

    if (error) {
      console.error(`[Eval] Failed to save result for ${r.predictionId}:`, error);
    }
  }

  console.log(`[Eval] Saved ${results.length} evaluation results to Supabase`);
}

export async function getAllEvaluatedPredictions(
  supabase: any
): Promise<PredictionRecord[]> {
  const { data, error } = await supabase
    .from('predictions')
    .select('*')
    .not('result', 'is', null)
    .order('evaluated_at', { ascending: false })
    .limit(500);

  if (error) {
    console.error('[Eval] Supabase query error:', error);
    return [];
  }

  return data || [];
}