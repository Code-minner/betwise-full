// =============================================================
// FILE: app/api/football/analyze/route.ts (v2 — WITH EVALUATION)
// =============================================================
//
// CHANGES FROM v1:
// ✅ Background evaluation runs during analysis
// ✅ Calibration profile adjusts prediction confidence
// ✅ Performance stats returned alongside predictions
// ✅ isRunning guard prevents double execution
// ✅ Recent results included in response
//

import { NextResponse } from 'next/server';
import {
  getTodaysFixtures,
  getTomorrowsFixtures,
  getDayAfterTomorrowFixtures,
  analyzeFootballMatch,
  FootballSuggestion,
  BookmakerOdds,
} from '@/lib/football';

// Background evaluation + calibration
import {
  runBackgroundEvaluation,
  getCachedCalibration,
  getCachedPerformance,
  serializeEvalResult,
  type BackgroundEvalResult,
} from '@/lib/background-eval';
import {
  applyCalibratedProbability,
  applyCalibratedConfidence,
  type CalibrationProfile,
} from '@/lib/calibration';

// Optional dependencies - graceful degradation
let saveAnalysisBatch: ((a: AnalysisRecord[]) => Promise<void>) | null = null;
let trackApiUsage: ((api: string, endpoint: string) => Promise<void>) | null = null;
let getBatchOddsAsArray: ((sportKey: string) => Promise<OddsRecord[]>) | null = null;
let findOddsForTeams: ((oddsArray: OddsRecord[], home: string, away: string) => OddsRecord | null) | null = null;
let LEAGUE_TO_SPORT_KEY: { [key: number]: string } = {};

// Supabase for saving to predictions table
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
  homeWin: { odds: number; bookmaker: string } | null;
  awayWin: { odds: number; bookmaker: string } | null;
  draw: { odds: number; bookmaker: string } | null;
  over: { line: number; odds: number; bookmaker: string } | null;
  under: { line: number; odds: number; bookmaker: string } | null;
  homeSpread: { line: number; odds: number; bookmaker: string } | null;
  awaySpread: { line: number; odds: number; bookmaker: string } | null;
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
  findOddsForTeams = odds.findOddsForTeams;
  LEAGUE_TO_SPORT_KEY = odds.LEAGUE_TO_SPORT_KEY || {};
} catch {}

const GROQ_API_KEY = process.env.GROQ_API_KEY || '';
const GROQ_MODEL = 'llama-3.3-70b-versatile';

// ============== isRunning GUARD ==============
let isRunning = false;

// ============== PREDICTION TYPE ==============

interface EnhancedPrediction {
  matchId: string;
  sport: string;
  market: string;
  pick: string;
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
    homeTeam: string;
    awayTeam: string;
    league: string;
    leagueId: number;
    kickoff: Date;
  };
  aiInsight?: string | null;
  aiEnhanced: boolean;
  // NEW: Calibration metadata
  calibrationApplied?: boolean;
  rawProbability?: number;    // Before calibration
  rawConfidence?: number;     // Before calibration
  calibrationNote?: string;
  oddsComparison?: {
    bookmakerOdds: number;
    bookmakerLine?: number;
    bookmaker: string;
    edge: number;
    value: string;
  };
}

let cachedPredictions: EnhancedPrediction[] | null = null;
let cachedEvalResult: BackgroundEvalResult | null = null;
let cacheTime = 0;
const CACHE_DURATION = 30 * 60 * 1000;

// ============== CONVERT SUGGESTION TO API FORMAT ==============

function convertToApiFormat(
  p: FootballSuggestion,
  calibration: CalibrationProfile | null
): EnhancedPrediction {
  const rawProb = p.probability;
  const rawConf = p.confidence;

  // Apply calibration correction
  const calibResult = applyCalibratedProbability(rawProb, calibration);
  const calibConf = applyCalibratedConfidence(rawConf, rawProb, calibration);

  return {
    matchId: String(p.fixture.id),
    sport: 'FOOTBALL',
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
    positives: p.reasoning.filter(r => !r.includes('warning')),
    matchInfo: {
      homeTeam: p.fixture.homeTeam.name,
      awayTeam: p.fixture.awayTeam.name,
      league: p.fixture.league.name,
      leagueId: p.fixture.league.id,
      kickoff: p.fixture.kickoff,
    },
    aiInsight: null,
    aiEnhanced: false,
    // Calibration metadata
    calibrationApplied: calibResult.correctionApplied,
    rawProbability: calibResult.correctionApplied ? rawProb : undefined,
    rawConfidence: calibResult.correctionApplied ? rawConf : undefined,
    calibrationNote: calibResult.correctionApplied ? calibResult.correctionNote : undefined,
  };
}

// ============== AI ENHANCEMENT (INSIGHT ONLY) ==============

async function enhanceWithAI(predictions: EnhancedPrediction[]): Promise<EnhancedPrediction[]> {
  if (!GROQ_API_KEY || GROQ_API_KEY.length < 20) {
    return predictions.map(p => ({ ...p, aiInsight: null, aiEnhanced: false }));
  }

  const enhanced: EnhancedPrediction[] = [];
  const batchSize = 10;

  for (let i = 0; i < predictions.length; i += batchSize) {
    const batch = predictions.slice(i, i + batchSize);

    try {
      const summary = batch
        .map(
          (p, idx) =>
            `${idx + 1}. ${p.matchInfo.homeTeam} vs ${p.matchInfo.awayTeam} (${p.matchInfo.league}) - ${p.pick}, Prob: ${(p.probability * 100).toFixed(0)}%, Conf: ${p.confidence}%, Edge: ${p.edge.toFixed(1)}%`
        )
        .join('\n');

      const res = await fetch('https://api.groq.com/openai/v1/chat/completions', {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${GROQ_API_KEY}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          model: GROQ_MODEL,
          messages: [
            {
              role: 'system',
              content: `You are a football analyst. For each prediction, provide a brief 1-sentence insight explaining the key factor.

RULES:
- DO NOT suggest confidence adjustments
- DO NOT provide numerical changes
- ONLY provide contextual insight about the match/teams
- Keep insights under 100 characters

Return JSON array: [{"insight":"Brief contextual insight"},...]`,
            },
            { role: 'user', content: `Analyze these picks:\n${summary}\n\nJSON only.` },
          ],
          temperature: 0.3,
          max_tokens: 600,
        }),
      });

      if (res.ok) {
        const data = await res.json();
        const content = data.choices?.[0]?.message?.content || '';
        const match = content.match(/\[[\s\S]*\]/);

        if (match) {
          try {
            const results = JSON.parse(match[0]);
            for (let j = 0; j < batch.length; j++) {
              const ai = results[j] || {};
              enhanced.push({ ...batch[j], aiInsight: ai.insight || null, aiEnhanced: true });
            }
          } catch {
            enhanced.push(...batch.map(p => ({ ...p, aiEnhanced: false })));
          }
        } else {
          enhanced.push(...batch.map(p => ({ ...p, aiEnhanced: false })));
        }
      } else {
        enhanced.push(...batch.map(p => ({ ...p, aiEnhanced: false })));
      }
    } catch {
      enhanced.push(...batch.map(p => ({ ...p, aiEnhanced: false })));
    }

    if (i + batchSize < predictions.length) {
      await new Promise(r => setTimeout(r, 300));
    }
  }

  return enhanced;
}

// ============== ADD BOOKMAKER ODDS ==============

async function addOdds(predictions: EnhancedPrediction[]): Promise<EnhancedPrediction[]> {
  if (!getBatchOddsAsArray || !findOddsForTeams) return predictions;

  const leagueGroups: { [key: number]: EnhancedPrediction[] } = {};
  for (const p of predictions) {
    const lid = p.matchInfo.leagueId;
    if (!leagueGroups[lid]) leagueGroups[lid] = [];
    leagueGroups[lid].push(p);
  }

  for (const leagueId of Object.keys(leagueGroups).map(Number)) {
    const sportKey = LEAGUE_TO_SPORT_KEY[leagueId];
    if (!sportKey) continue;

    try {
      const oddsArray = await getBatchOddsAsArray(sportKey);
      const preds = leagueGroups[leagueId];

      for (const pred of preds) {
        const odds = findOddsForTeams(oddsArray, pred.matchInfo.homeTeam, pred.matchInfo.awayTeam);
        if (!odds) continue;

        let bookOdds: number | null = null;
        let bookmaker = '';

        if (pred.market.includes('OVER') && pred.market.includes('2_5') && odds.over) {
          bookOdds = odds.over.odds;
          bookmaker = odds.over.bookmaker;
        } else if (pred.market.includes('UNDER') && pred.market.includes('2_5') && odds.under) {
          bookOdds = odds.under.odds;
          bookmaker = odds.under.bookmaker;
        } else if (pred.market === 'MATCH_WINNER_HOME' && odds.homeWin) {
          bookOdds = odds.homeWin.odds;
          bookmaker = odds.homeWin.bookmaker;
        } else if (pred.market === 'MATCH_WINNER_AWAY' && odds.awayWin) {
          bookOdds = odds.awayWin.odds;
          bookmaker = odds.awayWin.bookmaker;
        } else if (pred.market === 'DOUBLE_CHANCE_1X' && odds.homeWin && odds.draw) {
          const dcImplied = Math.min(0.90, 1 / odds.homeWin.odds + 1 / odds.draw.odds);
          bookOdds = 1 / dcImplied;
          bookmaker = odds.homeWin.bookmaker;
        }

        if (bookOdds && bookOdds > 1) {
          const impliedProb = 1 / bookOdds;
          const calculatedEdge = (pred.probability - impliedProb) * 100;

          pred.bookmakerOdds = bookOdds;
          pred.bookmaker = bookmaker;
          pred.impliedProbability = impliedProb;
          pred.edge = Math.round(calculatedEdge * 10) / 10;

          pred.oddsComparison = {
            bookmakerOdds: bookOdds,
            bookmaker,
            edge: pred.edge,
            value: calculatedEdge >= 10 ? 'STRONG' : calculatedEdge >= 5 ? 'GOOD' : calculatedEdge >= 0 ? 'FAIR' : 'POOR',
          };
        }
      }
    } catch (e) {
      console.error(`[Odds] Error for league ${leagueId}:`, e);
    }
  }

  return predictions;
}

// ============== FILTER & CATEGORIZE ==============

function filterNoBets(predictions: EnhancedPrediction[]): EnhancedPrediction[] {
  return predictions.filter(p => {
    if (p.bookmakerOdds && p.edge < -3) return false;
    if (p.confidence < 35) return false;
    return true;
  });
}

function assignCategories(predictions: EnhancedPrediction[]): EnhancedPrediction[] {
  return predictions.map(p => {
    const hasOdds = !!p.bookmakerOdds;
    const isCorners = p.market.includes('CORNER');
    const prob = p.probability > 1 ? p.probability / 100 : p.probability;
    const probPercent = prob * 100;

    let category: string;

    if (hasOdds) {
      if (p.edge >= 6 && p.confidence >= 58) category = 'LOW_RISK';
      else if (p.edge >= 3 && p.confidence >= 52) category = 'VALUE';
      else if (p.edge >= 0) category = 'SPECULATIVE';
      else category = 'NO_BET';
    } else {
      if (p.confidence >= 65 && probPercent >= 55) category = 'LOW_RISK';
      else if (p.confidence >= 58 && probPercent >= 48) category = 'VALUE';
      else category = 'SPECULATIVE';

      if (!isCorners && !p.warnings.includes('No bookmaker odds available')) {
        p.warnings.push('No bookmaker odds available - edge not calculated');
      }
    }

    return { ...p, category };
  });
}

// ============== SAVE TO PREDICTIONS TABLE ==============

async function saveToPredictionsTable(predictions: EnhancedPrediction[]): Promise<void> {
  if (!supabase || !isSupabaseConfigured || !isSupabaseConfigured()) return;

  try {
    const records = predictions.map(p => ({
      home_team: p.matchInfo.homeTeam,
      away_team: p.matchInfo.awayTeam,
      market: p.market,
      selection: p.pick,
      line: null,
      odds: p.bookmakerOdds || 0,
      probability: Math.round((p.probability > 1 ? p.probability : p.probability * 100)),
      confidence: p.confidence,
      expected_value: p.edge,
      verdict: p.aiInsight || null,
      data_quality: p.dataQuality,
      match_date: p.matchInfo.kickoff
        ? new Date(p.matchInfo.kickoff).toISOString().split('T')[0]
        : null,
    }));

    // Use predictions table (not analysis_history)
    const { error } = await supabase.from('predictions').insert(records);
    if (error) {
      console.error('[DB] Predictions insert error:', error);
      // Fallback to analysis_history
      if (saveAnalysisBatch) await saveAnalysisBatch(records);
    } else {
      console.log(`[DB] Saved ${records.length} football predictions to predictions table`);
    }
  } catch (e) {
    console.error('[DB] Save error:', e);
    // Fallback
    if (saveAnalysisBatch) {
      try {
        const records = predictions.map(p => ({
          home_team: p.matchInfo.homeTeam,
          away_team: p.matchInfo.awayTeam,
          market: p.market,
          selection: p.pick,
          line: null,
          odds: p.bookmakerOdds || 0,
          probability: Math.round((p.probability > 1 ? p.probability : p.probability * 100)),
          confidence: p.confidence,
          expected_value: p.edge,
          verdict: p.aiInsight || null,
          data_quality: p.dataQuality,
          match_date: p.matchInfo.kickoff
            ? new Date(p.matchInfo.kickoff).toISOString().split('T')[0]
            : null,
        }));
        await saveAnalysisBatch(records);
      } catch {}
    }
  }
}

// ============== MAIN API HANDLER ==============

export async function GET() {
  // Prevent double execution (React Strict Mode in dev)
  if (isRunning) {
    // Return cached if available, otherwise wait
    if (cachedPredictions && Date.now() - cacheTime < CACHE_DURATION) {
      return NextResponse.json({
        success: true,
        predictions: cachedPredictions,
        cached: true,
        evaluation: cachedEvalResult ? serializeEvalResult(cachedEvalResult) : null,
        aiEnhanced: cachedPredictions.some(p => p.aiEnhanced),
        hasOdds: cachedPredictions.some(p => p.bookmakerOdds),
        analyzedAt: new Date(cacheTime).toISOString(),
      });
    }
    return NextResponse.json({ success: true, predictions: [], message: 'Analysis in progress' });
  }

  try {
    // Check cache
    if (cachedPredictions && Date.now() - cacheTime < CACHE_DURATION) {
      return NextResponse.json({
        success: true,
        predictions: cachedPredictions,
        cached: true,
        evaluation: cachedEvalResult ? serializeEvalResult(cachedEvalResult) : null,
        aiEnhanced: cachedPredictions.some(p => p.aiEnhanced),
        hasOdds: cachedPredictions.some(p => p.bookmakerOdds),
        analyzedAt: new Date(cacheTime).toISOString(),
        stats: computeStats(cachedPredictions),
      });
    }

    isRunning = true;

    // === STEP 1: Run background evaluation (non-blocking but we await for calibration) ===
    console.log('[Football] Running background evaluation...');
    let evalResult: BackgroundEvalResult;
    try {
      evalResult = await runBackgroundEvaluation('FOOTBALL');
    } catch (e) {
      console.error('[Football] Background eval failed:', e);
      evalResult = {
        performance: null,
        calibration: null,
        newlyEvaluated: 0,
        success: false,
        error: String(e),
        recentResults: [],
      };
    }

    // Get calibration profile (may be null if not enough data)
    const calibration = evalResult.calibration;
    if (calibration?.isReliable) {
      console.log(`[Football] Calibration active: overall bias ${calibration.overallBias}%, correction ${calibration.overallCorrection}`);
    } else {
      console.log(`[Football] Calibration not yet reliable (${calibration?.sampleSize || 0} samples)`);
    }

    // === STEP 2: Fetch fixtures ===
    console.log('[Football] Fetching fixtures...');
    if (trackApiUsage) await trackApiUsage('api_sports', '/fixtures');

    const [today, tomorrow, dayAfter] = await Promise.all([
      getTodaysFixtures(),
      getTomorrowsFixtures(),
      getDayAfterTomorrowFixtures(),
    ]);
    const allFixtures = [...today, ...tomorrow, ...dayAfter];
    console.log(`[Football] Found ${allFixtures.length} fixtures`);

    if (allFixtures.length === 0) {
      isRunning = false;
      return NextResponse.json({
        success: true,
        predictions: [],
        evaluation: serializeEvalResult(evalResult),
        message: 'No fixtures found',
      });
    }

    // === STEP 3: Analyze fixtures (with calibration applied) ===
    console.log('[Football] Analyzing...');
    const suggestions: FootballSuggestion[] = [];
    const fixturesToAnalyze = allFixtures.slice(0, 25);

    for (const fixture of fixturesToAnalyze) {
      const analysis = await analyzeFootballMatch(fixture);
      suggestions.push(...analysis);
    }

    // Convert with calibration applied
    let predictions = suggestions.map(s => convertToApiFormat(s, calibration));

    // Sort
    predictions.sort((a, b) => {
      const catOrder: Record<string, number> = { LOW_RISK: 0, VALUE: 1, SPECULATIVE: 2, NO_BET: 3 };
      return (catOrder[a.category] || 3) - (catOrder[b.category] || 3) || b.confidence - a.confidence;
    });

    predictions = predictions.slice(0, 50);

    // === STEP 4: Add bookmaker odds ===
    console.log('[Football] Fetching odds...');
    predictions = await addOdds(predictions);

    // Recalculate edge with calibrated probabilities
    for (const pred of predictions) {
      if (pred.bookmakerOdds && pred.bookmakerOdds > 1) {
        const impliedProb = 1 / pred.bookmakerOdds;
        pred.edge = Math.round((pred.probability - impliedProb) * 1000) / 10;
      }
    }

    // === STEP 5: Categorize & filter ===
    predictions = assignCategories(predictions);
    predictions = filterNoBets(predictions);

    predictions.sort((a, b) => {
      const catOrder: Record<string, number> = { LOW_RISK: 0, VALUE: 1, SPECULATIVE: 2, NO_BET: 3 };
      return (catOrder[a.category] || 3) - (catOrder[b.category] || 3) || b.confidence - a.confidence;
    });

    // === STEP 6: AI enhancement ===
    console.log('[Football] AI enhancement...');
    predictions = await enhanceWithAI(predictions);

    // === STEP 7: Save to DB ===
    saveToPredictionsTable(predictions).catch(() => {});

    // Cache
    cachedPredictions = predictions;
    cachedEvalResult = evalResult;
    cacheTime = Date.now();
    isRunning = false;

    const calibrationCount = predictions.filter(p => p.calibrationApplied).length;
    if (calibrationCount > 0) {
      console.log(`[Football] Calibration applied to ${calibrationCount}/${predictions.length} predictions`);
    }

    return NextResponse.json({
      success: true,
      predictions,
      fixtureCount: allFixtures.length,
      aiEnhanced: predictions.some(p => p.aiEnhanced),
      hasOdds: predictions.some(p => p.bookmakerOdds),
      analyzedAt: new Date().toISOString(),
      // NEW: Evaluation data for the frontend
      evaluation: serializeEvalResult(evalResult),
      stats: computeStats(predictions),
    });
  } catch (error) {
    isRunning = false;
    console.error('[Football] Error:', error);
    return NextResponse.json(
      { success: false, error: 'Analysis failed', predictions: [] },
      { status: 500 }
    );
  }
}

function computeStats(predictions: EnhancedPrediction[]) {
  return {
    total: predictions.length,
    lowRisk: predictions.filter(p => p.category === 'LOW_RISK').length,
    value: predictions.filter(p => p.category === 'VALUE').length,
    speculative: predictions.filter(p => p.category === 'SPECULATIVE').length,
    avgConfidence: predictions.length > 0
      ? Math.round(predictions.reduce((a, p) => a + p.confidence, 0) / predictions.length)
      : 0,
    avgEdge: predictions.length > 0
      ? Math.round(predictions.reduce((a, p) => a + p.edge, 0) / predictions.length * 10) / 10
      : 0,
    calibrated: predictions.filter(p => p.calibrationApplied).length,
  };
}

export const dynamic = 'force-dynamic';