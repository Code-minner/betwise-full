// =============================================================
// FILE: app/api/tennis/analyze/route.ts (v6 — WITH EVALUATION)
// =============================================================
//
// CHANGES FROM v5:
// ✅ Background evaluation runs during analysis
// ✅ Calibration profile adjusts prediction confidence/probability
// ✅ Performance stats returned alongside predictions
// ✅ Saves to predictions table for evaluation tracking
//

import { NextResponse } from 'next/server';
import {
  getTodaysFixtures,
  getTomorrowsFixtures,
  getDayAfterTomorrowFixtures,
  analyzeTennisMatch,
  getActiveTennisSportKeys,
  clearPlayerStatsCache,
  TennisSuggestion,
  BookmakerOdds,
} from '@/lib/tennis';

// Background evaluation + calibration
import {
  runBackgroundEvaluation,
  serializeEvalResult,
  type BackgroundEvalResult,
} from '@/lib/background-eval';
import {
  applyCalibratedProbability,
  applyCalibratedConfidence,
  type CalibrationProfile,
} from '@/lib/calibration';

// Optional dependencies
let saveAnalysisBatch: ((a: AnalysisRecord[]) => Promise<void>) | null = null;
let trackApiUsage: ((api: string, endpoint: string) => Promise<void>) | null = null;
let getBatchOddsAsArray: ((sportKey: string) => Promise<OddsRecord[]>) | null = null;

let supabase: any = null;
let isSupabaseConfigured: (() => boolean) | null = null;

interface AnalysisRecord {
  home_team: string;
  away_team: string;
  market: string;
  selection: string;
  line: number | null;
  odds: number;
  probability: number;
  confidence: number;
  expected_value: number;
  verdict: string | null;
  data_quality: string;
  match_date: string | null;
}

interface OddsRecord {
  match: string;
  homeTeam: string;
  awayTeam: string;
  player1?: string;
  player2?: string;
  homeWin: { odds: number; bookmaker: string } | null;
  awayWin: { odds: number; bookmaker: string } | null;
  over?: { line: number; odds: number; bookmaker: string } | null;
  under?: { line: number; odds: number; bookmaker: string } | null;
}

try {
  const sb = require('@/lib/supabase');
  saveAnalysisBatch = sb.saveAnalysisBatch;
  trackApiUsage = sb.trackApiUsage;
  supabase = sb.supabase;
  isSupabaseConfigured = sb.isSupabaseConfigured;
} catch {}

try {
  const odds = require('@/lib/odds-api');
  getBatchOddsAsArray = odds.getBatchOddsAsArray;
} catch {}

const GROQ_API_KEY = process.env.GROQ_API_KEY || '';
const GROQ_MODEL = 'llama-3.3-70b-versatile';

// ============== PREDICTION TYPE ==============
interface EnhancedPrediction {
  matchId: string;
  sport: string;
  market: string;
  pick: string;
  line?: number;
  probability: number;
  confidence: number;
  edge: number;
  impliedProbability?: number;
  bookmakerOdds?: number;
  bookmaker?: string;
  riskLevel: string;
  category: string;
  dataQuality: string;
  modelAgreement: number;
  reasoning: string[];
  warnings: string[];
  positives: string[];
  matchInfo: {
    player1: string;
    player2: string;
    tournament: string;
    surface: string;
    round: string;
    startTime: Date;
  };
  aiInsight?: string | null;
  aiEnhanced: boolean;
  calibrationApplied?: boolean;
  rawProbability?: number;
  rawConfidence?: number;
  calibrationNote?: string;
  oddsComparison?: {
    bookmakerOdds: number;
    bookmaker: string;
    edge: number;
    value: string;
  };
}

let cachedPredictions: EnhancedPrediction[] | null = null;
let cachedEvalResult: BackgroundEvalResult | null = null;
let cacheTime = 0;
const CACHE_DURATION = 20 * 60 * 1000;
let isRunning = false;

// ============== CONVERT WITH CALIBRATION ==============
function convertToApiFormat(p: TennisSuggestion, calibration: CalibrationProfile | null): EnhancedPrediction {
  const rawProb = p.probability;
  const rawConf = p.confidence;
  const calibResult = applyCalibratedProbability(rawProb, calibration);
  const calibConf = applyCalibratedConfidence(rawConf, rawProb, calibration);

  return {
    matchId: String(p.fixture.id),
    sport: 'TENNIS',
    market: p.market,
    pick: p.pick,
    probability: calibResult.adjusted,
    confidence: calibConf,
    edge: p.edge,
    impliedProbability: p.impliedProbability,
    bookmakerOdds: p.bookmakerOdds,
    bookmaker: p.bookmaker,
    riskLevel: p.risk,
    category: p.category,
    dataQuality: p.dataQuality,
    modelAgreement: p.modelAgreement,
    reasoning: p.reasoning,
    warnings: p.warnings,
    positives: p.reasoning.filter(r => !r.toLowerCase().includes('warning')),
    matchInfo: {
      player1: p.fixture.player1.name,
      player2: p.fixture.player2.name,
      tournament: p.fixture.tournament.name,
      surface: p.fixture.tournament.surface,
      round: p.fixture.round,
      startTime: p.fixture.startTime,
    },
    aiInsight: null,
    aiEnhanced: false,
    calibrationApplied: calibResult.correctionApplied,
    rawProbability: calibResult.correctionApplied ? rawProb : undefined,
    rawConfidence: calibResult.correctionApplied ? rawConf : undefined,
    calibrationNote: calibResult.correctionApplied ? calibResult.correctionNote : undefined,
  };
}

// ============== PLAYER NAME MATCHING ==============
function normalizePlayerName(name: string): string {
  return name.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/\./g, '').replace(/\s+/g, ' ').trim();
}

function getLastName(name: string): string {
  const parts = name.trim().split(' ');
  return normalizePlayerName(parts[parts.length - 1]);
}

function playersMatch(p1: string, p2: string): boolean {
  const n1 = normalizePlayerName(p1), n2 = normalizePlayerName(p2);
  if (n1 === n2 || n1.includes(n2) || n2.includes(n1)) return true;
  const ln1 = getLastName(p1), ln2 = getLastName(p2);
  return ln1 === ln2 && ln1.length > 3;
}

// ============== AI ENHANCEMENT ==============
async function enhanceWithAI(predictions: EnhancedPrediction[]): Promise<EnhancedPrediction[]> {
  if (!GROQ_API_KEY || GROQ_API_KEY.length < 20 || predictions.length === 0)
    return predictions.map(p => ({ ...p, aiEnhanced: false }));

  try {
    const summary = predictions.slice(0, 10).map((p, i) =>
      `${i + 1}. ${p.matchInfo.player1} vs ${p.matchInfo.player2} (${p.matchInfo.surface}) - ${p.pick}`
    ).join('\n');

    const res = await fetch('https://api.groq.com/openai/v1/chat/completions', {
      method: 'POST',
      headers: { Authorization: `Bearer ${GROQ_API_KEY}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: GROQ_MODEL,
        messages: [
          { role: 'system', content: 'You are a tennis analyst. 1-sentence insight per match about surface/form (<80 chars). No number changes. Return JSON: [{"insight":"..."},...]' },
          { role: 'user', content: `Analyze:\n${summary}\n\nJSON only.` },
        ],
        temperature: 0.3, max_tokens: 600,
      }),
    });

    if (res.ok) {
      const data = await res.json();
      const match = (data.choices?.[0]?.message?.content || '').match(/\[[\s\S]*\]/);
      if (match) {
        const results = JSON.parse(match[0]);
        return predictions.map((p, i) => ({ ...p, aiInsight: results[i]?.insight || null, aiEnhanced: true }));
      }
    }
  } catch (e) { console.error('[Tennis AI] Failed:', e); }
  return predictions.map(p => ({ ...p, aiEnhanced: false }));
}

// ============== ODDS ==============
async function addOdds(predictions: EnhancedPrediction[]): Promise<EnhancedPrediction[]> {
  if (!getBatchOddsAsArray) return predictions;

  const activeKeys = await getActiveTennisSportKeys();
  if (activeKeys.length === 0) return predictions;

  const allOdds: OddsRecord[] = [];
  for (const key of activeKeys) {
    try {
      const arr = await getBatchOddsAsArray(key);
      if (arr?.length) allOdds.push(...arr);
    } catch {}
  }
  if (allOdds.length === 0) return predictions;

  let matched = 0;
  for (const pred of predictions) {
    for (const odds of allOdds) {
      const op1 = odds.player1 || odds.homeTeam || '';
      const op2 = odds.player2 || odds.awayTeam || '';

      if ((playersMatch(pred.matchInfo.player1, op1) || playersMatch(pred.matchInfo.player1, op2)) &&
          (playersMatch(pred.matchInfo.player2, op1) || playersMatch(pred.matchInfo.player2, op2))) {

        let bk: { odds: number; bookmaker: string } | null = null;

        if (pred.market === 'MATCH_WINNER' || pred.market === 'UPSET') {
          if (pred.pick.includes(pred.matchInfo.player1)) {
            bk = playersMatch(pred.matchInfo.player1, op1) ? odds.homeWin : odds.awayWin;
          } else if (pred.pick.includes(pred.matchInfo.player2)) {
            bk = playersMatch(pred.matchInfo.player2, op1) ? odds.homeWin : odds.awayWin;
          }
        } else if (pred.market.includes('GAMES_OVER') && odds.over) {
          bk = { odds: odds.over.odds, bookmaker: odds.over.bookmaker };
        } else if (pred.market.includes('GAMES_UNDER') && odds.under) {
          bk = { odds: odds.under.odds, bookmaker: odds.under.bookmaker };
        }

        if (bk) {
          const imp = 1 / bk.odds;
          const edge = Math.round((pred.probability - imp) * 1000) / 10;
          pred.bookmakerOdds = bk.odds;
          pred.bookmaker = bk.bookmaker;
          pred.impliedProbability = imp;
          pred.edge = edge;
          pred.oddsComparison = { bookmakerOdds: bk.odds, bookmaker: bk.bookmaker, edge, value: edge >= 8 ? 'STRONG' : edge >= 4 ? 'GOOD' : edge >= 0 ? 'FAIR' : 'POOR' };
          if (pred.category !== 'UPSET') {
            if (pred.confidence >= 60 && edge >= 5) pred.category = 'LOW_RISK';
            else if (edge >= 3) pred.category = 'VALUE';
            else if (edge >= 0) pred.category = 'SPECULATIVE';
            else pred.category = 'NO_BET';
          }
          matched++;
        }
        break;
      }
    }
  }
  console.log(`[Tennis Odds] Matched ${matched}/${predictions.length}`);
  return predictions;
}

// ============== FILTERS ==============
function filterNoBets(preds: EnhancedPrediction[]): EnhancedPrediction[] {
  return preds.filter(p => {
    if (p.bookmakerOdds && p.edge < -2) return false;
    if (p.bookmakerOdds && p.edge < 1 && p.category !== 'UPSET') p.category = 'SPECULATIVE';
    return p.confidence >= 35 || p.category === 'UPSET';
  });
}

function dedup(preds: EnhancedPrediction[]): EnhancedPrediction[] {
  const seen = new Set<string>();
  return preds.filter(p => {
    const k = [p.matchInfo.player1, p.matchInfo.player2].sort().join('-') + `-${p.market}`;
    if (seen.has(k)) return false;
    seen.add(k); return true;
  });
}

// ============== SAVE ==============
async function saveToPredictionsTable(predictions: EnhancedPrediction[]): Promise<void> {
  const records = predictions.map(p => ({
    home_team: p.matchInfo.player1, away_team: p.matchInfo.player2,
    market: p.market, selection: p.pick, line: p.line || null,
    odds: p.bookmakerOdds || 0,
    probability: Math.round((p.probability > 1 ? p.probability : p.probability * 100)),
    confidence: p.confidence, expected_value: p.edge,
    verdict: p.aiInsight || null, data_quality: p.dataQuality,
    match_date: p.matchInfo.startTime ? new Date(p.matchInfo.startTime).toISOString().split('T')[0] : null,
  }));

  if (supabase && isSupabaseConfigured?.()) {
    const { error } = await supabase.from('predictions').insert(records);
    if (error) { console.error('[DB] Insert error:', error); if (saveAnalysisBatch) await saveAnalysisBatch(records); }
    else console.log(`[DB] Saved ${records.length} tennis predictions`);
  } else if (saveAnalysisBatch) {
    await saveAnalysisBatch(records);
  }
}

// ============== MAIN HANDLER ==============
export async function GET() {
  if (isRunning) {
    if (cachedPredictions && Date.now() - cacheTime < CACHE_DURATION)
      return NextResponse.json({ success: true, predictions: cachedPredictions, cached: true, evaluation: cachedEvalResult ? serializeEvalResult(cachedEvalResult) : null });
    return NextResponse.json({ success: true, predictions: [], message: 'Analysis in progress' });
  }

  try {
    if (cachedPredictions && Date.now() - cacheTime < CACHE_DURATION) {
      return NextResponse.json({
        success: true, predictions: cachedPredictions, cached: true,
        evaluation: cachedEvalResult ? serializeEvalResult(cachedEvalResult) : null,
        stats: computeStats(cachedPredictions),
      });
    }

    isRunning = true;

    try {
      // === Background evaluation ===
      console.log('[Tennis] Running background evaluation...');
      let evalResult: BackgroundEvalResult;
      try { evalResult = await runBackgroundEvaluation('TENNIS'); }
      catch (e) { evalResult = { performance: null, calibration: null, newlyEvaluated: 0, success: false, error: String(e), recentResults: [] }; }

      const calibration = evalResult.calibration;

      // === Fixtures ===
      clearPlayerStatsCache();
      if (trackApiUsage) await trackApiUsage('sofascore', '/scheduled-events');

      const [today, tomorrow, dayAfter] = await Promise.all([getTodaysFixtures(), getTomorrowsFixtures(), getDayAfterTomorrowFixtures()]);
      const allFixtures = [...today, ...tomorrow, ...dayAfter];

      if (allFixtures.length === 0) {
        return NextResponse.json({
          success: true, predictions: [], evaluation: serializeEvalResult(evalResult),
          message: 'No tennis matches found.',
          stats: { total: 0, lowRisk: 0, value: 0, speculative: 0, upset: 0, withOdds: 0, avgConfidence: 0, avgEdge: 0 },
        });
      }

      // === Analyze with calibration ===
      const suggestions: TennisSuggestion[] = [];
      for (const f of allFixtures.slice(0, 40)) suggestions.push(...await analyzeTennisMatch(f));

      let predictions = dedup(suggestions.map(s => convertToApiFormat(s, calibration)));
      predictions.sort((a, b) => {
        const co: Record<string, number> = { LOW_RISK: 0, VALUE: 1, SPECULATIVE: 2, UPSET: 3, NO_BET: 4 };
        return (co[a.category] || 4) - (co[b.category] || 4) || b.confidence - a.confidence;
      });
      predictions = predictions.slice(0, 50);

      // === Odds ===
      predictions = await addOdds(predictions);
      // Recalculate edge with calibrated probabilities
      for (const p of predictions) {
        if (p.bookmakerOdds && p.bookmakerOdds > 1) {
          p.edge = Math.round((p.probability - 1 / p.bookmakerOdds) * 1000) / 10;
        }
      }
      predictions = filterNoBets(predictions);

      // === AI ===
      predictions = await enhanceWithAI(predictions);

      // === Save ===
      saveToPredictionsTable(predictions).catch(() => {});

      cachedPredictions = predictions;
      cachedEvalResult = evalResult;
      cacheTime = Date.now();

      return NextResponse.json({
        success: true, predictions, fixtureCount: allFixtures.length,
        aiEnhanced: predictions.some(p => p.aiEnhanced),
        hasOdds: predictions.some(p => p.bookmakerOdds),
        analyzedAt: new Date().toISOString(),
        evaluation: serializeEvalResult(evalResult),
        stats: computeStats(predictions),
      });
    } finally {
      isRunning = false;
    }
  } catch (error) {
    isRunning = false;
    console.error('[Tennis] Error:', error);
    return NextResponse.json({ success: false, error: 'Analysis failed', predictions: [] }, { status: 500 });
  }
}

function computeStats(preds: EnhancedPrediction[]) {
  return {
    total: preds.length,
    lowRisk: preds.filter(p => p.category === 'LOW_RISK').length,
    value: preds.filter(p => p.category === 'VALUE').length,
    speculative: preds.filter(p => p.category === 'SPECULATIVE').length,
    upset: preds.filter(p => p.category === 'UPSET').length,
    withOdds: preds.filter(p => p.bookmakerOdds).length,
    avgConfidence: preds.length ? Math.round(preds.reduce((a, p) => a + p.confidence, 0) / preds.length) : 0,
    avgEdge: preds.length ? Math.round(preds.reduce((a, p) => a + p.edge, 0) / preds.length * 10) / 10 : 0,
    calibrated: preds.filter(p => p.calibrationApplied).length,
  };
}

export const dynamic = 'force-dynamic';