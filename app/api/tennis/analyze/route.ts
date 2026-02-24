// =============================================================
// FILE: app/api/tennis/analyze/route.ts (FIXED v5)
// =============================================================
//
// CRITICAL FIXES:
// ✅ Dynamic odds sport key discovery via /v4/sports (no more 404s)
// ✅ Uses new tennis.ts with SofaScore fixtures + live stats
// ✅ Clears player stats cache between runs
// ✅ Single execution (no duplicate runs)
// ✅ Better error handling and logging

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

// Optional dependencies
let saveAnalysisBatch: ((a: AnalysisRecord[]) => Promise<void>) | null = null;
let trackApiUsage: ((api: string, endpoint: string) => Promise<void>) | null = null;
let getBatchOddsAsArray: ((sportKey: string) => Promise<OddsRecord[]>) | null = null;

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
  oddsComparison?: {
    bookmakerOdds: number;
    bookmaker: string;
    edge: number;
    value: string;
  };
}

let cachedPredictions: EnhancedPrediction[] | null = null;
let cacheTime = 0;
const CACHE_DURATION = 20 * 60 * 1000;

// Prevent concurrent executions
let isRunning = false;

// ============== CONVERT ==============

function convertToApiFormat(p: TennisSuggestion): EnhancedPrediction {
  return {
    matchId: String(p.fixture.id),
    sport: 'TENNIS',
    market: p.market,
    pick: p.pick,
    probability: p.probability,
    confidence: p.confidence,
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
  };
}

// ============== PLAYER NAME MATCHING ==============

function normalizePlayerName(name: string): string {
  return name
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '') // Strip accents
    .replace(/\./g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

function getLastName(name: string): string {
  const parts = name.trim().split(' ');
  return normalizePlayerName(parts[parts.length - 1]);
}

function playersMatch(p1: string, p2: string): boolean {
  const n1 = normalizePlayerName(p1);
  const n2 = normalizePlayerName(p2);
  if (n1 === n2) return true;
  if (n1.includes(n2) || n2.includes(n1)) return true;
  const ln1 = getLastName(p1);
  const ln2 = getLastName(p2);
  if (ln1 === ln2 && ln1.length > 3) return true;
  return false;
}

// ============== AI ENHANCEMENT ==============

async function enhanceWithAI(predictions: EnhancedPrediction[]): Promise<EnhancedPrediction[]> {
  if (!GROQ_API_KEY || GROQ_API_KEY.length < 20 || predictions.length === 0) {
    return predictions.map(p => ({ ...p, aiInsight: null, aiEnhanced: false }));
  }

  try {
    const summary = predictions
      .slice(0, 10)
      .map((p, i) => `${i + 1}. ${p.matchInfo.player1} vs ${p.matchInfo.player2} (${p.matchInfo.surface}) - ${p.pick}`)
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
            content: `You are a tennis analyst. For each match, provide a 1-sentence insight about surface form or matchup dynamics. DO NOT suggest confidence adjustments. Keep insights under 80 characters. Return JSON array: [{"insight":"Brief insight"},...]`,
          },
          { role: 'user', content: `Analyze:\n${summary}\n\nJSON only.` },
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
        const results = JSON.parse(match[0]);
        return predictions.map((p, i) => ({
          ...p,
          aiInsight: results[i]?.insight || null,
          aiEnhanced: true,
        }));
      }
    }
  } catch (e) {
    console.error('[Tennis AI] Enhancement failed:', e);
  }

  return predictions.map(p => ({ ...p, aiEnhanced: false }));
}

// =============================================================================
// 🔑 KEY FIX: Dynamic odds discovery - queries /v4/sports for active keys
// =============================================================================

async function addOdds(predictions: EnhancedPrediction[]): Promise<EnhancedPrediction[]> {
  if (!getBatchOddsAsArray) {
    console.log('[Tennis Odds] Odds API module not available');
    return predictions;
  }

  // 🔑 FIX: Discover which tennis sport keys are currently active
  const activeKeys = await getActiveTennisSportKeys();

  if (activeKeys.length === 0) {
    console.log('[Tennis Odds] No active tennis tournaments on Odds API');
    return predictions;
  }

  console.log(`[Tennis Odds] Found ${activeKeys.length} active keys: ${activeKeys.join(', ')}`);

  // Fetch odds from all active tennis sport keys
  const allOddsRecords: OddsRecord[] = [];

  for (const sportKey of activeKeys) {
    try {
      console.log(`[Tennis Odds] Fetching ${sportKey}...`);
      const oddsArray = await getBatchOddsAsArray(sportKey);
      if (oddsArray && oddsArray.length > 0) {
        console.log(`[Tennis Odds] Got ${oddsArray.length} records from ${sportKey}`);
        allOddsRecords.push(...oddsArray);
      }
    } catch {
      console.log(`[Tennis Odds] No odds from ${sportKey}`);
    }
  }

  if (allOddsRecords.length === 0) {
    console.log('[Tennis Odds] No odds records from any active tournament');
    return predictions;
  }

  console.log(`[Tennis Odds] Total ${allOddsRecords.length} odds records to match against ${predictions.length} predictions`);

  // Match odds to predictions
  let matchedCount = 0;

  for (const pred of predictions) {
    for (const oddsRecord of allOddsRecords) {
      const oddsP1 = oddsRecord.player1 || oddsRecord.homeTeam || '';
      const oddsP2 = oddsRecord.player2 || oddsRecord.awayTeam || '';

      const p1Match = playersMatch(pred.matchInfo.player1, oddsP1) || playersMatch(pred.matchInfo.player1, oddsP2);
      const p2Match = playersMatch(pred.matchInfo.player2, oddsP1) || playersMatch(pred.matchInfo.player2, oddsP2);

      if (p1Match && p2Match) {
        console.log(`[Tennis Odds] ✓ Matched: ${pred.matchInfo.player1} vs ${pred.matchInfo.player2}`);

        let bookOdds: { odds: number; bookmaker: string } | null = null;

        if (pred.market === 'MATCH_WINNER' || pred.market === 'UPSET') {
          if (pred.pick.includes(pred.matchInfo.player1)) {
            if (playersMatch(pred.matchInfo.player1, oddsP1) && oddsRecord.homeWin) {
              bookOdds = oddsRecord.homeWin;
            } else if (playersMatch(pred.matchInfo.player1, oddsP2) && oddsRecord.awayWin) {
              bookOdds = oddsRecord.awayWin;
            }
          } else if (pred.pick.includes(pred.matchInfo.player2)) {
            if (playersMatch(pred.matchInfo.player2, oddsP1) && oddsRecord.homeWin) {
              bookOdds = oddsRecord.homeWin;
            } else if (playersMatch(pred.matchInfo.player2, oddsP2) && oddsRecord.awayWin) {
              bookOdds = oddsRecord.awayWin;
            }
          }
        } else if (pred.market.includes('GAMES_OVER') && oddsRecord.over) {
          bookOdds = { odds: oddsRecord.over.odds, bookmaker: oddsRecord.over.bookmaker };
        } else if (pred.market.includes('GAMES_UNDER') && oddsRecord.under) {
          bookOdds = { odds: oddsRecord.under.odds, bookmaker: oddsRecord.under.bookmaker };
        }

        if (bookOdds) {
          const impliedProb = 1 / bookOdds.odds;
          const calculatedEdge = Math.round((pred.probability - impliedProb) * 1000) / 10;

          pred.bookmakerOdds = bookOdds.odds;
          pred.bookmaker = bookOdds.bookmaker;
          pred.impliedProbability = impliedProb;
          pred.edge = calculatedEdge;

          pred.oddsComparison = {
            bookmakerOdds: bookOdds.odds,
            bookmaker: bookOdds.bookmaker,
            edge: calculatedEdge,
            value: calculatedEdge >= 8 ? 'STRONG' : calculatedEdge >= 4 ? 'GOOD' : calculatedEdge >= 0 ? 'FAIR' : 'POOR',
          };

          // Recategorize based on actual edge
          if (pred.category !== 'UPSET') {
            if (pred.confidence >= 60 && calculatedEdge >= 5) pred.category = 'LOW_RISK';
            else if (calculatedEdge >= 3) pred.category = 'VALUE';
            else if (calculatedEdge >= 0) pred.category = 'SPECULATIVE';
            else pred.category = 'NO_BET';
          }

          matchedCount++;
        }
        break;
      }
    }
  }

  console.log(`[Tennis Odds] Matched odds for ${matchedCount}/${predictions.length} predictions`);
  return predictions;
}

// ============== FILTERS ==============

function filterNoBets(predictions: EnhancedPrediction[]): EnhancedPrediction[] {
  return predictions.filter(p => {
    if (p.bookmakerOdds && p.edge < -2) {
      console.log(`[Filter] Removing ${p.pick} - negative edge: ${p.edge}%`);
      return false;
    }
    if (p.bookmakerOdds && p.edge < 1 && p.category !== 'UPSET') {
      p.category = 'SPECULATIVE';
      if (!p.warnings.includes('Marginal edge')) p.warnings.push('Marginal edge');
    }
    if (p.confidence < 35 && p.category !== 'UPSET') {
      console.log(`[Filter] Removing ${p.pick} - low confidence: ${p.confidence}%`);
      return false;
    }
    return true;
  });
}

function deduplicatePredictions(predictions: EnhancedPrediction[]): EnhancedPrediction[] {
  const seen = new Set<string>();
  return predictions.filter(p => {
    const key = [p.matchInfo.player1, p.matchInfo.player2].sort().join('-') + `-${p.market}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

// ============== DB SAVE ==============

async function saveToDb(predictions: EnhancedPrediction[]): Promise<void> {
  if (!saveAnalysisBatch) return;
  try {
    const records: AnalysisRecord[] = predictions.map(p => ({
      home_team: p.matchInfo.player1,
      away_team: p.matchInfo.player2,
      market: p.market,
      selection: p.pick,
      line: p.line || null,
      odds: p.bookmakerOdds || 0,
      probability: Math.round(p.probability * 100),
      confidence: p.confidence,
      expected_value: p.edge,
      verdict: p.aiInsight || null,
      data_quality: p.dataQuality,
      match_date: p.matchInfo.startTime ? new Date(p.matchInfo.startTime).toISOString().split('T')[0] : null,
    }));
    await saveAnalysisBatch(records);
    console.log(`[DB] Saved ${predictions.length} tennis predictions`);
  } catch (e) {
    console.error('[DB] Save error:', e);
  }
}

// ============== MAIN HANDLER ==============

export async function GET() {
  try {
    // Return cache if fresh
    if (cachedPredictions && Date.now() - cacheTime < CACHE_DURATION) {
      return NextResponse.json({
        success: true,
        predictions: cachedPredictions,
        cached: true,
        aiEnhanced: cachedPredictions.some(p => p.aiEnhanced),
        hasOdds: cachedPredictions.some(p => p.bookmakerOdds),
        analyzedAt: new Date(cacheTime).toISOString(),
      });
    }

    // 🔑 FIX: Prevent duplicate concurrent executions
    if (isRunning) {
      console.log('[Tennis] Already running, returning empty');
      return NextResponse.json({
        success: true,
        predictions: cachedPredictions || [],
        cached: true,
        message: 'Analysis in progress',
      });
    }

    isRunning = true;

    try {
      // Clear player stats cache for fresh data
      clearPlayerStatsCache();

      console.log('[Tennis] Fetching fixtures...');
      if (trackApiUsage) await trackApiUsage('sofascore', '/scheduled-events');

      const [today, tomorrow, dayAfter] = await Promise.all([
        getTodaysFixtures(),
        getTomorrowsFixtures(),
        getDayAfterTomorrowFixtures(),
      ]);
      const allFixtures = [...today, ...tomorrow, ...dayAfter];
      console.log(`[Tennis] Found ${allFixtures.length} matches`);

      if (allFixtures.length === 0) {
        return NextResponse.json({
          success: true,
          predictions: [],
          message: 'No tennis matches found. Check back during tournament season.',
          stats: { total: 0, lowRisk: 0, value: 0, speculative: 0, upset: 0, withOdds: 0, avgConfidence: 0, avgEdge: 0 },
        });
      }

      console.log('[Tennis] Analyzing matches...');
      const suggestions: TennisSuggestion[] = [];

      // Analyze up to 40 fixtures
      for (const fixture of allFixtures.slice(0, 40)) {
        const analysis = await analyzeTennisMatch(fixture);
        suggestions.push(...analysis);
      }

      let predictions = suggestions.map(convertToApiFormat);
      predictions = deduplicatePredictions(predictions);
      console.log(`[Tennis] ${predictions.length} predictions after deduplication`);

      // Sort by category then confidence
      predictions.sort((a, b) => {
        const catOrder: Record<string, number> = { LOW_RISK: 0, VALUE: 1, SPECULATIVE: 2, UPSET: 3, NO_BET: 4 };
        return (catOrder[a.category] - catOrder[b.category]) || (b.confidence - a.confidence);
      });

      predictions = predictions.slice(0, 50);

      // Fetch odds (now with dynamic key discovery)
      console.log('[Tennis] Fetching odds...');
      predictions = await addOdds(predictions);

      // Filter negative EV
      predictions = filterNoBets(predictions);

      // AI enhancement
      console.log('[Tennis] AI enhancement...');
      predictions = await enhanceWithAI(predictions);

      // Save to DB (fire and forget)
      saveToDb(predictions).catch(() => {});

      cachedPredictions = predictions;
      cacheTime = Date.now();

      return NextResponse.json({
        success: true,
        predictions,
        fixtureCount: allFixtures.length,
        aiEnhanced: predictions.some(p => p.aiEnhanced),
        hasOdds: predictions.some(p => p.bookmakerOdds),
        analyzedAt: new Date().toISOString(),
        stats: {
          total: predictions.length,
          lowRisk: predictions.filter(p => p.category === 'LOW_RISK').length,
          value: predictions.filter(p => p.category === 'VALUE').length,
          speculative: predictions.filter(p => p.category === 'SPECULATIVE').length,
          upset: predictions.filter(p => p.category === 'UPSET').length,
          withOdds: predictions.filter(p => p.bookmakerOdds).length,
          avgConfidence: predictions.length > 0
            ? Math.round(predictions.reduce((a, p) => a + p.confidence, 0) / predictions.length)
            : 0,
          avgEdge: predictions.length > 0
            ? Math.round(predictions.reduce((a, p) => a + p.edge, 0) / predictions.length * 10) / 10
            : 0,
        },
      });
    } finally {
      isRunning = false;
    }
  } catch (error) {
    isRunning = false;
    console.error('[Tennis] Error:', error);
    return NextResponse.json(
      { success: false, error: 'Analysis failed', predictions: [] },
      { status: 500 }
    );
  }
}

export const dynamic = 'force-dynamic';