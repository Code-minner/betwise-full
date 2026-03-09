// =============================================================
// FILE: app/api/basketball/analyze/route.ts (v4 — WITH EVALUATION)
// =============================================================
//
// CHANGES FROM v3:
// ✅ Background evaluation runs during analysis
// ✅ Calibration profile adjusts prediction confidence/probability
// ✅ Performance stats returned alongside predictions
// ✅ isRunning guard (already had one concept, now formalized)
// ✅ Saves to predictions table for evaluation tracking
//

import { NextResponse } from 'next/server';
import {
  getTodaysFixtures,
  getTomorrowsFixtures,
  getDayAfterTomorrowFixtures,
  analyzeBasketballMatch,
  BasketballSuggestion,
  BookmakerOdds,
  TOP_LEAGUES,
} from '@/lib/basketball';

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
let findOddsForTeams: ((oddsArray: OddsRecord[], home: string, away: string) => OddsRecord | null) | null = null;

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
} catch {}

const GROQ_API_KEY = process.env.GROQ_API_KEY || '';
const GROQ_MODEL = 'llama-3.3-70b-versatile';

// ============== isRunning GUARD ==============
let isRunning = false;

// ============== LEAGUE-TO-SPORT-KEY ==============
const BASKETBALL_LEAGUE_TO_SPORT_KEY: Record<number, string> = {
  12: 'basketball_nba', 13: 'basketball_nba',
  120: 'basketball_euroleague', 117: 'basketball_euroleague', 118: 'basketball_euroleague',
  194: 'basketball_nbl',
  20: 'basketball_spain_liga_acb', 23: 'basketball_germany_bbl',
  22: 'basketball_italy_lega_a', 21: 'basketball_france_pro_a',
  30: 'basketball_turkey_bsl', 31: 'basketball_greece_a1', 202: 'basketball_cba',
};

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
    homeTeam: string;
    awayTeam: string;
    league: string;
    leagueId: number;
    kickoff: Date;
  };
  aiInsight?: string | null;
  aiEnhanced: boolean;
  calibrationApplied?: boolean;
  rawProbability?: number;
  rawConfidence?: number;
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

// ============== CONVERT WITH CALIBRATION ==============
function convertToApiFormat(p: BasketballSuggestion, calibration: CalibrationProfile | null): EnhancedPrediction {
  const rawProb = p.probability;
  const rawConf = p.confidence;
  const calibResult = applyCalibratedProbability(rawProb, calibration);
  const calibConf = applyCalibratedConfidence(rawConf, rawProb, calibration);

  return {
    matchId: String(p.fixture.id),
    sport: 'BASKETBALL',
    market: p.market,
    pick: p.pick,
    line: p.line,
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
      homeTeam: p.fixture.homeTeam.name,
      awayTeam: p.fixture.awayTeam.name,
      league: p.fixture.league.name,
      leagueId: p.fixture.league.id,
      kickoff: p.fixture.tipoff,
    },
    aiInsight: null,
    aiEnhanced: false,
    calibrationApplied: calibResult.correctionApplied,
    rawProbability: calibResult.correctionApplied ? rawProb : undefined,
    rawConfidence: calibResult.correctionApplied ? rawConf : undefined,
    calibrationNote: calibResult.correctionApplied ? calibResult.correctionNote : undefined,
  };
}

// ============== TEAM NAME MATCHING (European teams) ==============
function normalizeTeamName(name: string): string {
  const n = name.toLowerCase().replace(/\s+/g, ' ').trim();
  const mappings: Record<string, string[]> = {
    'real madrid': ['real madrid baloncesto', 'real madrid basket'],
    'barcelona': ['fc barcelona', 'barcelona basket', 'barca'],
    'panathinaikos': ['panathinaikos athens', 'panathinaikos bc'],
    'olympiacos': ['olympiacos piraeus', 'olympiacos bc'],
    'fenerbahce': ['fenerbahce beko', 'fenerbahce istanbul'],
    'anadolu efes': ['anadolu efes istanbul', 'efes istanbul'],
    'monaco': ['as monaco', 'as monaco basket'],
    'partizan': ['partizan belgrade', 'partizan mozzart bet'],
    'maccabi': ['maccabi tel aviv', 'maccabi playtika tel aviv'],
    'zalgiris': ['zalgiris kaunas'],
    'bayern': ['bayern munich', 'fc bayern munich', 'bayern münchen'],
    'virtus': ['virtus bologna', 'virtus segafredo bologna'],
    'baskonia': ['cazoo baskonia', 'td systems baskonia'],
    'alba': ['alba berlin'],
    'milano': ['olimpia milano', 'ea7 emporio armani milan', 'armani milano'],
    'red star': ['crvena zvezda', 'red star belgrade'],
    'asvel': ['ldlc asvel', 'lyon-villeurbanne'],
  };
  for (const [canonical, variants] of Object.entries(mappings)) {
    if (n.includes(canonical) || variants.some(v => n.includes(v))) return canonical;
  }
  return n;
}

function teamsMatch(t1: string, t2: string): boolean {
  const n1 = normalizeTeamName(t1), n2 = normalizeTeamName(t2);
  if (n1 === n2 || n1.includes(n2) || n2.includes(n1)) return true;
  const w1 = n1.split(' ').filter(w => w.length > 3), w2 = n2.split(' ').filter(w => w.length > 3);
  return w1.filter(w => w2.includes(w)).length >= 1;
}

// ============== AI ENHANCEMENT ==============
async function enhanceWithAI(predictions: EnhancedPrediction[]): Promise<EnhancedPrediction[]> {
  if (!GROQ_API_KEY || GROQ_API_KEY.length < 20) return predictions.map(p => ({ ...p, aiEnhanced: false }));
  const enhanced: EnhancedPrediction[] = [];
  const batchSize = 10;

  for (let i = 0; i < predictions.length; i += batchSize) {
    const batch = predictions.slice(i, i + batchSize);
    try {
      const summary = batch.map((p, idx) =>
        `${idx + 1}. ${p.matchInfo.homeTeam} vs ${p.matchInfo.awayTeam} (${p.matchInfo.league}) - ${p.pick}`
      ).join('\n');

      const res = await fetch('https://api.groq.com/openai/v1/chat/completions', {
        method: 'POST',
        headers: { Authorization: `Bearer ${GROQ_API_KEY}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          model: GROQ_MODEL,
          messages: [
            { role: 'system', content: 'You are a basketball analyst. For each pick give a 1-sentence insight (<80 chars). No number changes. Return JSON: [{"insight":"..."},...]' },
            { role: 'user', content: `Analyze:\n${summary}\n\nJSON only.` },
          ],
          temperature: 0.3, max_tokens: 600,
        }),
      });

      if (res.ok) {
        const data = await res.json();
        const match = (data.choices?.[0]?.message?.content || '').match(/\[[\s\S]*\]/);
        if (match) {
          try {
            const results = JSON.parse(match[0]);
            for (let j = 0; j < batch.length; j++)
              enhanced.push({ ...batch[j], aiInsight: results[j]?.insight || null, aiEnhanced: true });
          } catch { enhanced.push(...batch.map(p => ({ ...p, aiEnhanced: false }))); }
        } else enhanced.push(...batch.map(p => ({ ...p, aiEnhanced: false })));
      } else enhanced.push(...batch.map(p => ({ ...p, aiEnhanced: false })));
    } catch { enhanced.push(...batch.map(p => ({ ...p, aiEnhanced: false }))); }
    if (i + batchSize < predictions.length) await new Promise(r => setTimeout(r, 300));
  }
  return enhanced;
}

// ============== ADD ODDS ==============
async function addOdds(predictions: EnhancedPrediction[]): Promise<EnhancedPrediction[]> {
  if (!getBatchOddsAsArray || !findOddsForTeams) return predictions;

  const leagueGroups: Record<number, EnhancedPrediction[]> = {};
  for (const p of predictions) {
    const lid = p.matchInfo.leagueId;
    if (!leagueGroups[lid]) leagueGroups[lid] = [];
    leagueGroups[lid].push(p);
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
    } catch (e) { console.error(`[Basketball Odds] Error league ${leagueId}:`, e); }
  }
  return predictions;
}

function applyOdds(pred: EnhancedPrediction, odds: OddsRecord): void {
  let bk: { odds: number; line?: number; bookmaker: string } | null = null;

  if (pred.market.includes('OVER') && odds.over) bk = odds.over;
  else if (pred.market.includes('UNDER') && odds.under) bk = odds.under;
  else if (pred.market.includes('SPREAD_HOME') && odds.homeSpread) bk = odds.homeSpread;
  else if (pred.market.includes('SPREAD_AWAY') && odds.awaySpread) bk = odds.awaySpread;
  else if (pred.market === 'MONEYLINE') {
    if (pred.pick.includes(pred.matchInfo.homeTeam) && odds.homeWin) bk = odds.homeWin;
    else if (pred.pick.includes(pred.matchInfo.awayTeam) && odds.awayWin) bk = odds.awayWin;
  }

  if (bk) {
    const imp = 1 / bk.odds;
    const edge = Math.round((pred.probability - imp) * 1000) / 10;
    pred.bookmakerOdds = bk.odds;
    pred.bookmaker = bk.bookmaker;
    pred.impliedProbability = imp;
    pred.edge = edge;
    pred.oddsComparison = {
      bookmakerOdds: bk.odds, bookmakerLine: bk.line, bookmaker: bk.bookmaker,
      edge, value: edge >= 8 ? 'STRONG' : edge >= 4 ? 'GOOD' : edge >= 0 ? 'FAIR' : 'POOR',
    };
    if (pred.confidence >= 60 && edge >= 5) pred.category = 'LOW_RISK';
    else if (edge >= 3) pred.category = 'VALUE';
    else if (edge >= 0) pred.category = 'SPECULATIVE';
    else pred.category = 'NO_BET';
  }
}

// ============== FILTERS ==============
function filterNoBets(preds: EnhancedPrediction[]): EnhancedPrediction[] {
  return preds.filter(p => {
    if (p.bookmakerOdds && p.edge < -2) return false;
    if (p.bookmakerOdds && p.edge < 1) { p.category = 'SPECULATIVE'; }
    return p.confidence >= 40;
  });
}

function dedup(preds: EnhancedPrediction[]): EnhancedPrediction[] {
  const seen = new Set<string>();
  return preds.filter(p => {
    const k = `${p.matchInfo.homeTeam}-${p.matchInfo.awayTeam}-${p.market}`;
    if (seen.has(k)) return false;
    seen.add(k); return true;
  });
}

// ============== SAVE ==============
async function saveToPredictionsTable(predictions: EnhancedPrediction[]): Promise<void> {
  const records = predictions.map(p => ({
    home_team: p.matchInfo.homeTeam, away_team: p.matchInfo.awayTeam,
    market: p.market, selection: p.pick, line: p.line || null,
    odds: p.bookmakerOdds || 0,
    probability: Math.round((p.probability > 1 ? p.probability : p.probability * 100)),
    confidence: p.confidence, expected_value: p.edge,
    verdict: p.aiInsight || null, data_quality: p.dataQuality,
    match_date: p.matchInfo.kickoff ? new Date(p.matchInfo.kickoff).toISOString().split('T')[0] : null,
  }));

  if (supabase && isSupabaseConfigured?.()) {
    const { error } = await supabase.from('predictions').insert(records);
    if (error) { console.error('[DB] Insert error:', error); if (saveAnalysisBatch) await saveAnalysisBatch(records); }
    else console.log(`[DB] Saved ${records.length} basketball predictions`);
  } else if (saveAnalysisBatch) {
    await saveAnalysisBatch(records);
  }
}

// ============== MAIN HANDLER ==============
export async function GET() {
  if (isRunning) {
    if (cachedPredictions && Date.now() - cacheTime < CACHE_DURATION) {
      return NextResponse.json({ success: true, predictions: cachedPredictions, cached: true, evaluation: cachedEvalResult ? serializeEvalResult(cachedEvalResult) : null });
    }
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

    // === Background evaluation ===
    console.log('[Basketball] Running background evaluation...');
    let evalResult: BackgroundEvalResult;
    try { evalResult = await runBackgroundEvaluation('BASKETBALL'); }
    catch (e) { evalResult = { performance: null, calibration: null, newlyEvaluated: 0, success: false, error: String(e), recentResults: [] }; }

    const calibration = evalResult.calibration;

    // === Fixtures ===
    if (trackApiUsage) await trackApiUsage('api_sports', '/games');
    const [today, tomorrow, dayAfter] = await Promise.all([getTodaysFixtures(), getTomorrowsFixtures(), getDayAfterTomorrowFixtures()]);
    const allFixtures = [...today, ...tomorrow, ...dayAfter];

    if (allFixtures.length === 0) {
      isRunning = false;
      return NextResponse.json({ success: true, predictions: [], evaluation: serializeEvalResult(evalResult), message: 'No games found' });
    }

    // === Analyze with calibration ===
    const suggestions: BasketballSuggestion[] = [];
    for (const f of allFixtures.slice(0, 30)) suggestions.push(...await analyzeBasketballMatch(f));

    let predictions = dedup(suggestions.map(s => convertToApiFormat(s, calibration)));
    predictions.sort((a, b) => {
      const co: Record<string, number> = { LOW_RISK: 0, VALUE: 1, SPECULATIVE: 2, NO_BET: 3 };
      return (co[a.category] || 3) - (co[b.category] || 3) || b.confidence - a.confidence;
    });
    predictions = predictions.slice(0, 60);

    // === Odds ===
    predictions = await addOdds(predictions);
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
    isRunning = false;

    return NextResponse.json({
      success: true, predictions, fixtureCount: allFixtures.length,
      aiEnhanced: predictions.some(p => p.aiEnhanced),
      hasOdds: predictions.some(p => p.bookmakerOdds),
      analyzedAt: new Date().toISOString(),
      evaluation: serializeEvalResult(evalResult),
      stats: computeStats(predictions),
    });
  } catch (error) {
    isRunning = false;
    console.error('[Basketball] Error:', error);
    return NextResponse.json({ success: false, error: 'Analysis failed', predictions: [] }, { status: 500 });
  }
}

function computeStats(preds: EnhancedPrediction[]) {
  return {
    total: preds.length,
    lowRisk: preds.filter(p => p.category === 'LOW_RISK').length,
    value: preds.filter(p => p.category === 'VALUE').length,
    speculative: preds.filter(p => p.category === 'SPECULATIVE').length,
    withOdds: preds.filter(p => p.bookmakerOdds).length,
    avgConfidence: preds.length ? Math.round(preds.reduce((a, p) => a + p.confidence, 0) / preds.length) : 0,
    avgEdge: preds.length ? Math.round(preds.reduce((a, p) => a + p.edge, 0) / preds.length * 10) / 10 : 0,
    calibrated: preds.filter(p => p.calibrationApplied).length,
  };
}

export const dynamic = 'force-dynamic';