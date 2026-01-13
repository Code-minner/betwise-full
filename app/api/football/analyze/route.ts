// =============================================================
// FILE: app/api/football/analyze/route.ts
// =============================================================

import { NextResponse } from 'next/server';
import {
  getTodaysFixtures,
  getTomorrowsFixtures,
  analyzeFootballMatch,
  FootballSuggestion,
} from '@/lib/football';

// Optional dependencies - graceful degradation
let saveAnalysisBatch: ((a: AnalysisRecord[]) => Promise<void>) | null = null;
let trackApiUsage: ((api: string, endpoint: string) => Promise<void>) | null = null;
let getBatchOddsAsArray: ((sportKey: string) => Promise<OddsRecord[]>) | null = null;
let findOddsForTeams: ((oddsArray: OddsRecord[], home: string, away: string) => OddsRecord | null) | null = null;
let compareOdds: ((our: number, book: number) => { edge: number; value: string }) | null = null;
let LEAGUE_TO_SPORT_KEY: { [key: number]: string } = {};

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
} catch {}

try {
  const odds = require('@/lib/odds-api');
  getBatchOddsAsArray = odds.getBatchOddsAsArray;
  findOddsForTeams = odds.findOddsForTeams;
  compareOdds = odds.compareOdds;
  LEAGUE_TO_SPORT_KEY = odds.LEAGUE_TO_SPORT_KEY || {};
} catch {}

const GROQ_API_KEY = process.env.GROQ_API_KEY || '';
const GROQ_MODEL = 'llama-3.3-70b-versatile';

interface EnhancedPrediction {
  matchId: string;
  sport: string;
  market: string;
  pick: string;
  odds: number;
  confidence: number;
  calculatedProbability: number;
  probability: number;
  edge: number;
  riskLevel: string;
  dataQuality: string;
  reasoning: string[];
  warnings: string[];
  positives: string[];
  category: string;
  matchInfo: {
    homeTeam: string;
    awayTeam: string;
    league: string;
    leagueId: number;
    kickoff: Date;
  };
  aiInsight?: string | null;
  aiEnhanced?: boolean;
  aiConfidenceAdjust?: number;
  bookmakerOdds?: OddsRecord;
  oddsComparison?: {
    bookmakerOdds: number;
    bookmakerLine: number;
    bookmaker: string;
    edge: number;
    value: string;
  };
}

let cachedPredictions: EnhancedPrediction[] | null = null;
let cacheTime = 0;
const CACHE_DURATION = 30 * 60 * 1000;

function convertToApiFormat(p: FootballSuggestion): EnhancedPrediction {
  return {
    matchId: String(p.fixture.id),
    sport: 'FOOTBALL',
    market: p.market,
    pick: p.pick,
    odds: p.odds,
    confidence: p.confidence,
    calculatedProbability: p.probability,
    probability: p.probability,
    edge: p.edge,
    riskLevel: p.risk,
    dataQuality: p.dataQuality,
    reasoning: p.reasoning,
    warnings: [],
    positives: p.reasoning,
    category: p.category,
    matchInfo: {
      homeTeam: p.fixture.homeTeam.name,
      awayTeam: p.fixture.awayTeam.name,
      league: p.fixture.league.name,
      leagueId: p.fixture.league.id,
      kickoff: p.fixture.kickoff,
    },
  };
}

async function enhanceWithAI(predictions: FootballSuggestion[]): Promise<EnhancedPrediction[]> {
  const converted = predictions.map(convertToApiFormat);

  if (!GROQ_API_KEY || GROQ_API_KEY.length < 20) {
    return converted.map((p) => ({ ...p, aiInsight: null, aiEnhanced: false }));
  }

  const enhanced: EnhancedPrediction[] = [];
  const batchSize = 10;

  for (let i = 0; i < predictions.length; i += batchSize) {
    const batch = predictions.slice(i, i + batchSize);
    const batchConverted = batch.map(convertToApiFormat);

    try {
      const summary = batch
        .map(
          (p, idx) =>
            `${idx + 1}. ${p.fixture.homeTeam.name} vs ${p.fixture.awayTeam.name} (${p.fixture.league.name}) - ${p.pick}, ${p.confidence}%`
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
              content:
                'Football analyst. For each: 1 sentence insight + confidence adjust (-10 to +10). Return JSON: [{"insight":"...","adjust":0},...]',
            },
            { role: 'user', content: `Analyze:\n${summary}\n\nJSON only.` },
          ],
          temperature: 0.3,
          max_tokens: 800,
        }),
      });

      if (res.ok) {
        const data = await res.json();
        const content = data.choices?.[0]?.message?.content || '';
        const match = content.match(/\[[\s\S]*\]/);

        if (match) {
          const results = JSON.parse(match[0]);
          for (let j = 0; j < batchConverted.length; j++) {
            const p = batchConverted[j];
            const ai = results[j] || {};
            enhanced.push({
              ...p,
              aiInsight: ai.insight || null,
              aiConfidenceAdjust: ai.adjust || 0,
              confidence: Math.max(30, Math.min(95, p.confidence + (ai.adjust || 0))),
              aiEnhanced: true,
            });
          }
        } else {
          for (let j = 0; j < batchConverted.length; j++) {
            enhanced.push({ ...batchConverted[j], aiEnhanced: false });
          }
        }
      } else {
        for (let j = 0; j < batchConverted.length; j++) {
          enhanced.push({ ...batchConverted[j], aiEnhanced: false });
        }
      }
    } catch {
      for (let j = 0; j < batchConverted.length; j++) {
        enhanced.push({ ...batchConverted[j], aiEnhanced: false });
      }
    }

    if (i + batchSize < predictions.length) {
      await new Promise((r) => setTimeout(r, 300));
    }
  }

  return enhanced;
}

async function addOdds(predictions: EnhancedPrediction[]): Promise<EnhancedPrediction[]> {
  if (!getBatchOddsAsArray || !findOddsForTeams || !compareOdds) return predictions;

  // Group by league
  const leagueGroups: { [key: number]: EnhancedPrediction[] } = {};
  for (let i = 0; i < predictions.length; i++) {
    const p = predictions[i];
    const lid = p.matchInfo.leagueId;
    if (!leagueGroups[lid]) leagueGroups[lid] = [];
    leagueGroups[lid].push(p);
  }

  // Fetch odds for each league
  const leagueIds = Object.keys(leagueGroups).map(Number);
  for (let l = 0; l < leagueIds.length; l++) {
    const leagueId = leagueIds[l];
    const sportKey = LEAGUE_TO_SPORT_KEY[leagueId];
    if (!sportKey) continue;

    try {
      const oddsArray = await getBatchOddsAsArray(sportKey);
      const preds = leagueGroups[leagueId];

      for (let i = 0; i < preds.length; i++) {
        const pred = preds[i];
        const odds = findOddsForTeams(
          oddsArray,
          pred.matchInfo.homeTeam,
          pred.matchInfo.awayTeam
        );

        if (odds) {
          pred.bookmakerOdds = odds;

          if (pred.market.includes('OVER') && odds.over) {
            pred.oddsComparison = {
              bookmakerOdds: odds.over.odds,
              bookmakerLine: odds.over.line,
              bookmaker: odds.over.bookmaker,
              ...compareOdds(pred.odds, odds.over.odds),
            };
          } else if (pred.market.includes('UNDER') && odds.under) {
            pred.oddsComparison = {
              bookmakerOdds: odds.under.odds,
              bookmakerLine: odds.under.line,
              bookmaker: odds.under.bookmaker,
              ...compareOdds(pred.odds, odds.under.odds),
            };
          }
        }
      }
    } catch (e) {
      console.error(`[Odds] Error for league ${leagueId}:`, e);
    }
  }

  return predictions;
}

async function saveToDb(predictions: EnhancedPrediction[]): Promise<void> {
  if (!saveAnalysisBatch) return;

  try {
    const records: AnalysisRecord[] = predictions.map((p) => ({
      home_team: p.matchInfo.homeTeam,
      away_team: p.matchInfo.awayTeam,
      market: p.market,
      selection: p.pick,
      line: null,
      odds: p.odds,
      probability: Math.round((p.probability || 0) * 100),
      confidence: p.confidence,
      expected_value: p.edge,
      verdict: p.aiInsight || null,
      data_quality: p.dataQuality,
      match_date: p.matchInfo.kickoff
        ? new Date(p.matchInfo.kickoff).toISOString().split('T')[0]
        : null,
    }));
    await saveAnalysisBatch(records);
    console.log(`[DB] Saved ${predictions.length} football predictions`);
  } catch (e) {
    console.error('[DB] Save error:', e);
  }
}

export async function GET() {
  try {
    if (cachedPredictions && Date.now() - cacheTime < CACHE_DURATION) {
      return NextResponse.json({
        success: true,
        predictions: cachedPredictions,
        cached: true,
        aiEnhanced: cachedPredictions.some((p) => p.aiEnhanced),
        hasOdds: cachedPredictions.some((p) => p.bookmakerOdds),
        analyzedAt: new Date(cacheTime).toISOString(),
      });
    }

    console.log('[Football] Fetching fixtures...');
    if (trackApiUsage) await trackApiUsage('api_sports', '/fixtures');

    const [today, tomorrow] = await Promise.all([
      getTodaysFixtures(),
      getTomorrowsFixtures(),
    ]);
    const allFixtures = [...today, ...tomorrow];
    console.log(`[Football] Found ${allFixtures.length} fixtures`);

    if (allFixtures.length === 0) {
      return NextResponse.json({
        success: true,
        predictions: [],
        message: 'No fixtures found',
      });
    }

    console.log('[Football] Analyzing...');
    const predictions: FootballSuggestion[] = [];
    const fixturesToAnalyze = allFixtures.slice(0, 25);
    for (let i = 0; i < fixturesToAnalyze.length; i++) {
      const analysis = await analyzeFootballMatch(fixturesToAnalyze[i]);
      predictions.push(...analysis);
    }
    predictions.sort((a, b) => b.confidence - a.confidence);

    console.log('[Football] AI enhancement...');
    let enhanced = await enhanceWithAI(predictions.slice(0, 50));

    console.log('[Football] Fetching odds...');
    enhanced = await addOdds(enhanced);

    saveToDb(enhanced).catch(() => {});

    cachedPredictions = enhanced;
    cacheTime = Date.now();

    return NextResponse.json({
      success: true,
      predictions: enhanced,
      fixtureCount: allFixtures.length,
      aiEnhanced: enhanced.some((p) => p.aiEnhanced),
      hasOdds: enhanced.some((p) => p.bookmakerOdds),
      analyzedAt: new Date().toISOString(),
    });
  } catch (error) {
    console.error('[Football] Error:', error);
    return NextResponse.json(
      { success: false, error: 'Analysis failed', predictions: [] },
      { status: 500 }
    );
  }
}

export const dynamic = 'force-dynamic';