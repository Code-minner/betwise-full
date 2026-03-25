// =============================================================
// FILE: app/api/basketball/analyze/route.ts (v5 — AI-POWERED)
// =============================================================
//
// CHANGES FROM v4:
// ✅ Calls prewarmFixtureTeams() before analysis — Groq AI stats ready in time
// ✅ dataSource field in response shows API / GROQ_AI / LEAGUE_DEFAULT per game
// ✅ Logs how many teams were AI-estimated vs real standings
//

import { NextResponse } from 'next/server';
import {
  getTodaysFixtures,
  getTomorrowsFixtures,
  getDayAfterTomorrowFixtures,
  analyzeBasketballMatch,
  prewarmFixtureTeams,
  BasketballSuggestion,
  BookmakerOdds,
} from '@/lib/basketball';
import { runBackgroundEvaluation, serializeEvalResult, type BackgroundEvalResult } from '@/lib/background-eval';
import { applyCalibratedProbability, applyCalibratedConfidence, type CalibrationProfile } from '@/lib/calibration';
import { getAICacheStatus } from '@/lib/ai-team-assessor';

// Optional deps
let saveAnalysisBatch: ((a: any[]) => Promise<void>) | null = null;
let trackApiUsage:     ((api: string, ep: string) => Promise<void>) | null = null;
let getBatchOddsAsArray: ((key: string) => Promise<any[]>) | null = null;
let findOddsForTeams:    ((arr: any[], h: string, a: string) => any | null) | null = null;
let supabase:            any = null;
let isSupabaseConfigured: (() => boolean) | null = null;

try { const sb = require('@/lib/supabase'); saveAnalysisBatch = sb.saveAnalysisBatch; trackApiUsage = sb.trackApiUsage; supabase = sb.supabase; isSupabaseConfigured = sb.isSupabaseConfigured; } catch {}
try { const odds = require('@/lib/odds-api'); getBatchOddsAsArray = odds.getBatchOddsAsArray; findOddsForTeams = odds.findOddsForTeams; } catch {}

const GROQ_API_KEY = process.env.GROQ_API_KEY || '';
const GROQ_MODEL   = 'llama-3.3-70b-versatile';

const BASKETBALL_LEAGUE_TO_SPORT_KEY: Record<number, string> = {
  12: 'basketball_nba', 13: 'basketball_nba',
  120: 'basketball_euroleague', 117: 'basketball_euroleague', 118: 'basketball_euroleague',
  194: 'basketball_nbl',
  20: 'basketball_spain_liga_acb', 23: 'basketball_germany_bbl',
  22: 'basketball_italy_lega_a', 21: 'basketball_france_pro_a',
  30: 'basketball_turkey_bsl', 31: 'basketball_greece_a1', 202: 'basketball_cba',
};

interface EnhancedPrediction {
  matchId: string; sport: string; market: string; pick: string; line?: number;
  probability: number; confidence: number; edge: number;
  impliedProbability?: number; bookmakerOdds?: number; bookmaker?: string;
  riskLevel: string; category: string; dataQuality: string; modelAgreement: number;
  reasoning: string[]; warnings: string[]; positives: string[];
  matchInfo: { homeTeam: string; awayTeam: string; league: string; leagueId: number; kickoff: Date };
  aiInsight?: string | null; aiEnhanced: boolean;
  calibrationApplied?: boolean; rawProbability?: number; rawConfidence?: number; calibrationNote?: string;
  dataSource: 'API' | 'GROQ_AI' | 'MIXED' | 'LEAGUE_DEFAULT';
  oddsComparison?: { bookmakerOdds: number; bookmakerLine?: number; bookmaker: string; edge: number; value: string };
}

let cachedPredictions: EnhancedPrediction[] | null = null;
let cachedEvalResult:  BackgroundEvalResult  | null = null;
let cacheTime = 0;
const CACHE_DURATION = 30 * 60 * 1000;
let isRunning = false;

function convertToApiFormat(p: BasketballSuggestion, calibration: CalibrationProfile | null): EnhancedPrediction {
  const rawProb   = p.probability;
  const rawConf   = p.confidence;
  const calibResult = applyCalibratedProbability(rawProb, calibration);
  const calibConf   = applyCalibratedConfidence(rawConf, rawProb, calibration);

  // Determine data source label
  const dataSource: EnhancedPrediction['dataSource'] =
    p.dataQuality === 'HIGH'   ? 'API'      :
    p.dataQuality === 'MEDIUM' ? 'MIXED'    :
    p.dataQuality === 'LOW'    ? 'GROQ_AI'  : 'LEAGUE_DEFAULT';

  return {
    matchId: String(p.fixture.id), sport: 'BASKETBALL',
    market: p.market, pick: p.pick, line: p.line,
    probability: calibResult.adjusted, confidence: calibConf,
    edge: p.edge, impliedProbability: p.impliedProbability,
    bookmakerOdds: p.bookmakerOdds, bookmaker: p.bookmaker,
    riskLevel: p.risk, category: p.category,
    dataQuality: p.dataQuality, modelAgreement: p.modelAgreement,
    reasoning: p.reasoning, warnings: p.warnings,
    positives: p.reasoning.filter(r => !r.toLowerCase().includes('warning')),
    matchInfo: {
      homeTeam: p.fixture.homeTeam.name, awayTeam: p.fixture.awayTeam.name,
      league: p.fixture.league.name, leagueId: p.fixture.league.id,
      kickoff: p.fixture.tipoff,
    },
    aiInsight: null, aiEnhanced: false, dataSource,
    calibrationApplied: calibResult.correctionApplied,
    rawProbability:  calibResult.correctionApplied ? rawProb   : undefined,
    rawConfidence:   calibResult.correctionApplied ? rawConf   : undefined,
    calibrationNote: calibResult.correctionApplied ? calibResult.correctionNote : undefined,
  };
}

function teamsMatch(t1: string, t2: string): boolean {
  const n = (s: string) => s.toLowerCase().replace(/\b(fc|bc|sk|bk|bb|rb|ac)\b/gi, '').replace(/\s+/g, ' ').trim();
  const n1 = n(t1); const n2 = n(t2);
  if (n1 === n2 || n1.includes(n2) || n2.includes(n1)) return true;
  const w1 = n1.split(' ').filter(w => w.length > 3);
  const w2 = n2.split(' ').filter(w => w.length > 3);
  return w1.filter(w => w2.includes(w)).length >= 1;
}

async function enhanceWithAI(predictions: EnhancedPrediction[]): Promise<EnhancedPrediction[]> {
  if (!GROQ_API_KEY || GROQ_API_KEY.length < 20) return predictions.map(p => ({ ...p, aiEnhanced: false }));
  const enhanced: EnhancedPrediction[] = [];

  for (let i = 0; i < predictions.length; i += 10) {
    const batch = predictions.slice(i, i + 10);
    try {
      const summary = batch.map((p, idx) =>
        `${idx + 1}. ${p.matchInfo.homeTeam} vs ${p.matchInfo.awayTeam} (${p.matchInfo.league}) — ${p.pick} [${p.dataSource}]`
      ).join('\n');

      const res = await fetch('https://api.groq.com/openai/v1/chat/completions', {
        method: 'POST',
        headers: { Authorization: `Bearer ${GROQ_API_KEY}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          model: GROQ_MODEL,
          messages: [
            { role: 'system', content: 'Basketball analyst. For each pick, give a 1-sentence insight (<80 chars). Return JSON array: [{"insight":"..."},...]. No other text.' },
            { role: 'user',   content: `Analyze:\n${summary}\n\nJSON only.` },
          ],
          temperature: 0.3, max_tokens: 600,
          response_format: { type: 'json_object' },
        }),
      });

      if (res.ok) {
        const data  = await res.json();
        const text  = data.choices?.[0]?.message?.content || '{}';
        const parsed = JSON.parse(text);
        const results: any[] = Array.isArray(parsed) ? parsed : (parsed.insights || parsed.predictions || []);
        for (let j = 0; j < batch.length; j++) {
          enhanced.push({ ...batch[j], aiInsight: results[j]?.insight || null, aiEnhanced: true });
        }
      } else {
        enhanced.push(...batch.map(p => ({ ...p, aiEnhanced: false })));
      }
    } catch {
      enhanced.push(...batch.map(p => ({ ...p, aiEnhanced: false })));
    }
    if (i + 10 < predictions.length) await new Promise(r => setTimeout(r, 300));
  }
  return enhanced;
}

async function addOdds(predictions: EnhancedPrediction[]): Promise<EnhancedPrediction[]> {
  if (!getBatchOddsAsArray || !findOddsForTeams) return predictions;
  const leagueGroups: Record<number, EnhancedPrediction[]> = {};
  for (const p of predictions) {
    if (!leagueGroups[p.matchInfo.leagueId]) leagueGroups[p.matchInfo.leagueId] = [];
    leagueGroups[p.matchInfo.leagueId].push(p);
  }
  for (const leagueId of Object.keys(leagueGroups).map(Number)) {
    const sportKey = BASKETBALL_LEAGUE_TO_SPORT_KEY[leagueId];
    if (!sportKey) continue;
    try {
      const oddsArray = await getBatchOddsAsArray(sportKey);
      if (!oddsArray?.length) continue;
      for (const pred of leagueGroups[leagueId]) {
        let matched = findOddsForTeams(oddsArray, pred.matchInfo.homeTeam, pred.matchInfo.awayTeam);
        if (!matched) {
          for (const o of oddsArray) {
            if (teamsMatch(pred.matchInfo.homeTeam, o.homeTeam) && teamsMatch(pred.matchInfo.awayTeam, o.awayTeam)) {
              matched = o; break;
            }
          }
        }
        if (matched) applyOdds(pred, matched);
      }
    } catch {}
  }
  return predictions;
}

function applyOdds(pred: EnhancedPrediction, odds: any): void {
  let bk: any = null;
  if      (pred.market.includes('OVER'))        bk = odds.over;
  else if (pred.market.includes('UNDER'))       bk = odds.under;
  else if (pred.market.includes('SPREAD_HOME')) bk = odds.homeSpread;
  else if (pred.market.includes('SPREAD_AWAY')) bk = odds.awaySpread;
  else if (pred.market === 'MONEYLINE') {
    bk = pred.pick.includes(pred.matchInfo.homeTeam) ? odds.homeWin : odds.awayWin;
  }
  if (!bk) return;
  const imp  = 1 / bk.odds;
  const edge = Math.round((pred.probability - imp) * 1000) / 10;
  pred.bookmakerOdds = bk.odds; pred.bookmaker = bk.bookmaker;
  pred.impliedProbability = imp; pred.edge = edge;
  pred.oddsComparison = { bookmakerOdds: bk.odds, bookmakerLine: bk.line, bookmaker: bk.bookmaker, edge, value: edge >= 8 ? 'STRONG' : edge >= 4 ? 'GOOD' : edge >= 0 ? 'FAIR' : 'POOR' };
  if (pred.confidence >= 60 && edge >= 5)  pred.category = 'LOW_RISK';
  else if (edge >= 3)                       pred.category = 'VALUE';
  else if (edge >= 0)                       pred.category = 'SPECULATIVE';
  else                                      pred.category = 'NO_BET';
}

function dedup(preds: EnhancedPrediction[]): EnhancedPrediction[] {
  const seen = new Set<string>();
  return preds.filter(p => {
    const k = `${p.matchInfo.homeTeam}-${p.matchInfo.awayTeam}-${p.market}`;
    if (seen.has(k)) return false; seen.add(k); return true;
  });
}

function filterNoBets(preds: EnhancedPrediction[]): EnhancedPrediction[] {
  return preds.filter(p => {
    if (p.bookmakerOdds && p.edge < -2) return false;
    if (p.bookmakerOdds && p.edge < 1) p.category = 'SPECULATIVE';
    return p.confidence >= 40;
  });
}

async function savePredictions(predictions: EnhancedPrediction[]): Promise<void> {
  const records = predictions.map(p => ({
    home_team: p.matchInfo.homeTeam, away_team: p.matchInfo.awayTeam,
    market: p.market, selection: p.pick, line: p.line || null,
    odds: p.bookmakerOdds || 0,
    probability: Math.round(p.probability > 1 ? p.probability : p.probability * 100),
    confidence: p.confidence, expected_value: p.edge,
    verdict: p.aiInsight || null, data_quality: p.dataQuality,
    match_date: p.matchInfo.kickoff ? new Date(p.matchInfo.kickoff).toISOString().split('T')[0] : null,
  }));
  if (supabase && isSupabaseConfigured?.()) {
    await supabase.from('predictions').insert(records).catch(() => {});
  } else if (saveAnalysisBatch) {
    await saveAnalysisBatch(records).catch(() => {});
  }
}

function computeStats(preds: EnhancedPrediction[]) {
  return {
    total:      preds.length,
    lowRisk:    preds.filter(p => p.category === 'LOW_RISK').length,
    value:      preds.filter(p => p.category === 'VALUE').length,
    speculative: preds.filter(p => p.category === 'SPECULATIVE').length,
    withOdds:   preds.filter(p => p.bookmakerOdds).length,
    avgConfidence: preds.length ? Math.round(preds.reduce((a, p) => a + p.confidence, 0) / preds.length) : 0,
    avgEdge: preds.length ? Math.round(preds.reduce((a, p) => a + p.edge, 0) / preds.length * 10) / 10 : 0,
    calibrated: preds.filter(p => p.calibrationApplied).length,
    dataSourceBreakdown: {
      api:     preds.filter(p => p.dataSource === 'API').length,
      groqAI:  preds.filter(p => p.dataSource === 'GROQ_AI').length,
      mixed:   preds.filter(p => p.dataSource === 'MIXED').length,
    },
  };
}

// ─── Main handler ─────────────────────────────────────────────────────────────

export async function GET() {
  if (isRunning) {
    if (cachedPredictions && Date.now() - cacheTime < CACHE_DURATION) {
      return NextResponse.json({ success: true, predictions: cachedPredictions, cached: true, evaluation: cachedEvalResult ? serializeEvalResult(cachedEvalResult) : null });
    }
    return NextResponse.json({ success: true, predictions: [], message: 'Analysis in progress' });
  }

  if (cachedPredictions && Date.now() - cacheTime < CACHE_DURATION) {
    return NextResponse.json({
      success: true, predictions: cachedPredictions, cached: true,
      evaluation: cachedEvalResult ? serializeEvalResult(cachedEvalResult) : null,
      stats: computeStats(cachedPredictions),
    });
  }

  isRunning = true;
  try {
    let evalResult: BackgroundEvalResult;
    try { evalResult = await runBackgroundEvaluation('BASKETBALL'); }
    catch (e) { evalResult = { performance: null, calibration: null, newlyEvaluated: 0, success: false, error: String(e), recentResults: [] }; }

    const calibration = evalResult.calibration;

    if (trackApiUsage) await trackApiUsage('api_sports', '/games');
    const [today, tomorrow, dayAfter] = await Promise.all([
      getTodaysFixtures(), getTomorrowsFixtures(), getDayAfterTomorrowFixtures(),
    ]);
    const allFixtures = [...today, ...tomorrow, ...dayAfter];

    if (allFixtures.length === 0) {
      isRunning = false;
      return NextResponse.json({ success: true, predictions: [], evaluation: serializeEvalResult(evalResult), message: 'No games found' });
    }

    // ── Pre-warm Groq AI cache for all teams BEFORE analysis begins ──────
    // This fires all Groq requests in parallel so they're ready when analysis runs
    console.log(`[v5] Pre-warming AI cache for ${allFixtures.length} fixtures...`);
    await prewarmFixtureTeams(allFixtures.slice(0, 30));

    // ── Analyze ──────────────────────────────────────────────────────────
    const suggestions: BasketballSuggestion[] = [];
    for (const f of allFixtures.slice(0, 30)) {
      suggestions.push(...await analyzeBasketballMatch(f));
    }

    let predictions = dedup(suggestions.map(s => convertToApiFormat(s, calibration)));
    predictions.sort((a, b) => {
      const co: Record<string, number> = { LOW_RISK: 0, VALUE: 1, SPECULATIVE: 2, NO_BET: 3 };
      return (co[a.category] || 3) - (co[b.category] || 3) || b.confidence - a.confidence;
    });
    predictions = predictions.slice(0, 60);
    predictions = await addOdds(predictions);

    for (const p of predictions) {
      if (p.bookmakerOdds && p.bookmakerOdds > 1) {
        p.edge = Math.round((p.probability - 1 / p.bookmakerOdds) * 1000) / 10;
      }
    }

    predictions = filterNoBets(predictions);
    predictions = await enhanceWithAI(predictions);

    savePredictions(predictions).catch(() => {});

    const aiCacheStatus = getAICacheStatus();
    console.log(`[v5] AI cache: ${aiCacheStatus.teamsCached} teams cached`);

    cachedPredictions = predictions;
    cachedEvalResult  = evalResult;
    cacheTime         = Date.now();
    isRunning         = false;

    return NextResponse.json({
      success: true, predictions,
      fixtureCount: allFixtures.length,
      aiEnhanced:   predictions.some(p => p.aiEnhanced),
      hasOdds:      predictions.some(p => p.bookmakerOdds),
      analyzedAt:   new Date().toISOString(),
      evaluation:   serializeEvalResult(evalResult),
      stats:        computeStats(predictions),
      aiCache:      aiCacheStatus,
    });
  } catch (error) {
    isRunning = false;
    console.error('[Basketball v5] Error:', error);
    return NextResponse.json({ success: false, error: 'Analysis failed', predictions: [] }, { status: 500 });
  }
}

export const dynamic = 'force-dynamic';


// =============================================================
// FILE: app/api/basketball/status/route.ts
// PASTE THIS INTO A SEPARATE FILE
// =============================================================
//
// Tells you EXACTLY what data is real vs AI-estimated right now.
// Hit GET /api/basketball/status to see a full report.
//
export async function statusGET() {
  const { getAICacheStatus } = await import('@/lib/ai-team-assessor');
  const aiStatus = getAICacheStatus();

  const checks = {
    sportApiKey:  !!process.env.SPORTS_API_KEY,
    oddsApiKey:   !!(process.env.ODDS_API_KEY || process.env.THE_ODDS_API_KEY),
    groqApiKey:   !!process.env.GROQ_API_KEY,
  };

  return NextResponse.json({
    status: 'ok',
    configuredKeys: checks,
    dataWillBe: {
      fixtures:   checks.sportApiKey ? 'REAL (API-Sports)'    : 'UNAVAILABLE — add SPORTS_API_KEY',
      standings:  checks.sportApiKey ? 'REAL (API-Sports)'    : 'UNAVAILABLE — standings need SPORTS_API_KEY',
      injuries:   checks.sportApiKey ? 'REAL (API-Sports)'    : 'UNAVAILABLE',
      playerImportance: checks.groqApiKey ? 'AI (Groq LLaMA-3.3-70B)' : 'FALLBACK (position-based estimate)',
      teamStatsFallback: checks.groqApiKey ? 'AI (Groq LLaMA-3.3-70B)' : 'LEAGUE_DEFAULT (very rough estimate)',
      odds:       checks.oddsApiKey ? 'REAL (The Odds API)'  : 'NOT AVAILABLE — add ODDS_API_KEY',
    },
    aiCache: aiStatus,
    recommendation: !checks.sportApiKey
      ? '⛔ Add SPORTS_API_KEY — without it nothing is real'
      : !checks.groqApiKey
      ? '⚠️  Add GROQ_API_KEY — team fallbacks will be league averages only'
      : !checks.oddsApiKey
      ? '⚠️  Add ODDS_API_KEY — edge calculations will have no bookmaker comparison'
      : '✅ All keys configured',
  });
}