// =============================================================
// FILE: app/api/basketball/analyze/route.ts (FIXED v3)
// =============================================================
// 
// CRITICAL FIXES:
// ✅ Fetches odds for ALL leagues (NBA, Euroleague, NBL, ACB, etc.)
// ✅ League-to-sport-key mapping (like football)
// ✅ Groups predictions by league, fetches odds per league
// ✅ Proper team name normalization for European teams
// ✅ AI NEVER modifies confidence, probability, or edge
// ✅ Category labels: LOW_RISK, VALUE, SPECULATIVE

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

// Optional dependencies
let saveAnalysisBatch: ((a: AnalysisRecord[]) => Promise<void>) | null = null;
let trackApiUsage: ((api: string, endpoint: string) => Promise<void>) | null = null;
let getBatchOddsAsArray: ((sportKey: string) => Promise<OddsRecord[]>) | null = null;
let findOddsForTeams: ((oddsArray: OddsRecord[], home: string, away: string) => OddsRecord | null) | null = null;

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
} catch {}

const GROQ_API_KEY = process.env.GROQ_API_KEY || '';
const GROQ_MODEL = 'llama-3.3-70b-versatile';

// =============================================================================
// 🔑 KEY FIX: League-to-Sport-Key mapping (like football has)
// =============================================================================
const BASKETBALL_LEAGUE_TO_SPORT_KEY: Record<number, string> = {
  // NBA (USA)
  12: 'basketball_nba',
  13: 'basketball_nba', // G League - use NBA odds
  
  // Europe
  120: 'basketball_euroleague',
  117: 'basketball_euroleague', // Eurocup - use Euroleague odds
  118: 'basketball_euroleague', // BCL - use Euroleague odds
  
  // Australia
  194: 'basketball_nbl',
  
  // Spain
  20: 'basketball_spain_liga_acb',
  
  // Germany
  23: 'basketball_germany_bbl',
  
  // Italy
  22: 'basketball_italy_lega_a',
  
  // France
  21: 'basketball_france_pro_a',
  
  // Turkey
  30: 'basketball_turkey_bsl',
  
  // Greece
  31: 'basketball_greece_a1',
  
  // China
  202: 'basketball_cba',
};

// ============== PREDICTION TYPE ==============

interface EnhancedPrediction {
  matchId: string;
  sport: string;
  market: string;
  pick: string;
  line?: number;
  
  // Core numbers - NEVER modified by AI
  probability: number;
  confidence: number;
  edge: number;
  impliedProbability?: number;
  
  // Bookmaker data
  bookmakerOdds?: number;
  bookmaker?: string;
  
  // Risk & Category
  riskLevel: string;
  category: string;
  dataQuality: string;
  modelAgreement: number;
  
  // Reasoning
  reasoning: string[];
  warnings: string[];
  positives: string[];
  
  // Match info
  matchInfo: {
    homeTeam: string;
    awayTeam: string;
    league: string;
    leagueId: number;
    kickoff: Date;
  };
  
  // AI Enhancement - NARRATIVE ONLY
  aiInsight?: string | null;
  aiEnhanced: boolean;
  
  // Odds comparison
  oddsComparison?: {
    bookmakerOdds: number;
    bookmakerLine?: number;
    bookmaker: string;
    edge: number;
    value: string;
  };
}

let cachedPredictions: EnhancedPrediction[] | null = null;
let cacheTime = 0;
const CACHE_DURATION = 30 * 60 * 1000;

// ============== CONVERT TO API FORMAT ==============

function convertToApiFormat(p: BasketballSuggestion): EnhancedPrediction {
  return {
    matchId: String(p.fixture.id),
    sport: 'BASKETBALL',
    market: p.market,
    pick: p.pick,
    line: p.line,
    
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
      homeTeam: p.fixture.homeTeam.name,
      awayTeam: p.fixture.awayTeam.name,
      league: p.fixture.league.name,
      leagueId: p.fixture.league.id,
      kickoff: p.fixture.tipoff,
    },
    
    aiInsight: null,
    aiEnhanced: false,
  };
}

// ============== TEAM NAME NORMALIZATION ==============
// European teams often have different names in Odds API vs Sports API

function normalizeTeamName(name: string): string {
  const normalized = name
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .trim();
  
  // Common mappings
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
    if (normalized.includes(canonical) || variants.some(v => normalized.includes(v))) {
      return canonical;
    }
  }
  
  return normalized;
}

function teamsMatch(team1: string, team2: string): boolean {
  const n1 = normalizeTeamName(team1);
  const n2 = normalizeTeamName(team2);
  
  if (n1 === n2) return true;
  if (n1.includes(n2) || n2.includes(n1)) return true;
  
  // Check word overlap
  const words1 = n1.split(' ').filter(w => w.length > 3);
  const words2 = n2.split(' ').filter(w => w.length > 3);
  const overlap = words1.filter(w => words2.includes(w));
  
  return overlap.length >= 1;
}

// ============== AI ENHANCEMENT (INSIGHT ONLY) ==============

async function enhanceWithAI(predictions: EnhancedPrediction[]): Promise<EnhancedPrediction[]> {
  if (!GROQ_API_KEY || GROQ_API_KEY.length < 20) {
    return predictions.map((p) => ({ ...p, aiInsight: null, aiEnhanced: false }));
  }

  const enhanced: EnhancedPrediction[] = [];
  const batchSize = 10;

  for (let i = 0; i < predictions.length; i += batchSize) {
    const batch = predictions.slice(i, i + batchSize);

    try {
      const summary = batch
        .map(
          (p, idx) =>
            `${idx + 1}. ${p.matchInfo.homeTeam} vs ${p.matchInfo.awayTeam} (${p.matchInfo.league}) - ${p.pick}, Line: ${p.line || 'N/A'}`
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
              content: `You are a basketball analyst. For each prediction, provide a brief 1-sentence insight about pace, matchup, or key factors.

RULES:
- DO NOT suggest confidence adjustments
- DO NOT provide numerical changes  
- ONLY provide contextual insight
- Keep insights under 80 characters

Return JSON array: [{"insight":"Brief contextual insight"},...]`,
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
          try {
            const results = JSON.parse(match[0]);
            for (let j = 0; j < batch.length; j++) {
              const p = batch[j];
              const ai = results[j] || {};
              enhanced.push({
                ...p,
                aiInsight: ai.insight || null,
                aiEnhanced: true,
              });
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
      await new Promise((r) => setTimeout(r, 300));
    }
  }

  return enhanced;
}

// =============================================================================
// 🔑 KEY FIX: Add odds for ALL leagues (like football)
// =============================================================================

async function addOdds(predictions: EnhancedPrediction[]): Promise<EnhancedPrediction[]> {
  if (!getBatchOddsAsArray || !findOddsForTeams) {
    console.log('[Basketball Odds] Odds API not available');
    return predictions;
  }

  // Group predictions by league (like football does)
  const leagueGroups: Record<number, EnhancedPrediction[]> = {};
  for (const p of predictions) {
    const leagueId = p.matchInfo.leagueId;
    if (!leagueGroups[leagueId]) leagueGroups[leagueId] = [];
    leagueGroups[leagueId].push(p);
  }

  console.log(`[Basketball Odds] Found ${Object.keys(leagueGroups).length} leagues to fetch odds for`);

  // Fetch odds for EACH league
  for (const leagueId of Object.keys(leagueGroups).map(Number)) {
    const sportKey = BASKETBALL_LEAGUE_TO_SPORT_KEY[leagueId];
    
    if (!sportKey) {
      console.log(`[Basketball Odds] No sport key for league ${leagueId}, skipping`);
      continue;
    }

    try {
      console.log(`[Basketball Odds] Fetching odds for league ${leagueId} using ${sportKey}`);
      const oddsArray = await getBatchOddsAsArray(sportKey);
      
      if (!oddsArray || oddsArray.length === 0) {
        console.log(`[Basketball Odds] No odds returned for ${sportKey}`);
        continue;
      }

      console.log(`[Basketball Odds] Got ${oddsArray.length} odds records for ${sportKey}`);

      // Match odds to predictions in this league
      for (const pred of leagueGroups[leagueId]) {
        // Try standard matching first
        let matchedOdds = findOddsForTeams(
          oddsArray,
          pred.matchInfo.homeTeam,
          pred.matchInfo.awayTeam
        );

        // If no match, try fuzzy matching with normalization
        if (!matchedOdds) {
          for (const oddsRecord of oddsArray) {
            if (teamsMatch(pred.matchInfo.homeTeam, oddsRecord.homeTeam) &&
                teamsMatch(pred.matchInfo.awayTeam, oddsRecord.awayTeam)) {
              matchedOdds = oddsRecord;
              console.log(`[Basketball Odds] Fuzzy matched: ${pred.matchInfo.homeTeam} vs ${pred.matchInfo.awayTeam}`);
              break;
            }
          }
        }

        if (matchedOdds) {
          applyOddsToPrediction(pred, matchedOdds);
        }
      }
    } catch (e) {
      console.error(`[Basketball Odds] Error fetching ${sportKey}:`, e);
    }
  }

  return predictions;
}

function applyOddsToPrediction(pred: EnhancedPrediction, odds: OddsRecord): void {
  let bookOdds: { odds: number; line?: number; bookmaker: string } | null = null;

  // Match based on market type
  if (pred.market.includes('OVER') && odds.over) {
    bookOdds = { odds: odds.over.odds, line: odds.over.line, bookmaker: odds.over.bookmaker };
  } else if (pred.market.includes('UNDER') && odds.under) {
    bookOdds = { odds: odds.under.odds, line: odds.under.line, bookmaker: odds.under.bookmaker };
  } else if (pred.market.includes('SPREAD_HOME') && odds.homeSpread) {
    bookOdds = { odds: odds.homeSpread.odds, line: odds.homeSpread.line, bookmaker: odds.homeSpread.bookmaker };
  } else if (pred.market.includes('SPREAD_AWAY') && odds.awaySpread) {
    bookOdds = { odds: odds.awaySpread.odds, line: odds.awaySpread.line, bookmaker: odds.awaySpread.bookmaker };
  } else if (pred.market === 'MONEYLINE') {
    // Determine if home or away team is the pick
    if (pred.pick.includes(pred.matchInfo.homeTeam) && odds.homeWin) {
      bookOdds = { odds: odds.homeWin.odds, bookmaker: odds.homeWin.bookmaker };
    } else if (pred.pick.includes(pred.matchInfo.awayTeam) && odds.awayWin) {
      bookOdds = { odds: odds.awayWin.odds, bookmaker: odds.awayWin.bookmaker };
    }
  }

  if (bookOdds) {
    const impliedProb = 1 / bookOdds.odds;
    const calculatedEdge = (pred.probability - impliedProb) * 100;
    
    pred.bookmakerOdds = bookOdds.odds;
    pred.bookmaker = bookOdds.bookmaker;
    pred.impliedProbability = impliedProb;
    pred.edge = Math.round(calculatedEdge * 10) / 10;
    
    pred.oddsComparison = {
      bookmakerOdds: bookOdds.odds,
      bookmakerLine: bookOdds.line,
      bookmaker: bookOdds.bookmaker,
      edge: pred.edge,
      value: calculatedEdge >= 8 ? 'STRONG' : calculatedEdge >= 4 ? 'GOOD' : calculatedEdge >= 0 ? 'FAIR' : 'POOR',
    };

    // Update category based on edge
    if (pred.confidence >= 60 && pred.edge >= 5) {
      pred.category = 'LOW_RISK';
    } else if (pred.edge >= 3) {
      pred.category = 'VALUE';
    } else if (pred.edge >= 0) {
      pred.category = 'SPECULATIVE';
    } else {
      pred.category = 'NO_BET';
    }

    console.log(`[Basketball Odds] Matched ${pred.matchInfo.homeTeam} vs ${pred.matchInfo.awayTeam}: edge ${pred.edge}%`);
  }
}

// ============== FILTER NO-BET ==============

function filterNoBets(predictions: EnhancedPrediction[]): EnhancedPrediction[] {
  return predictions.filter(p => {
    // Filter out negative edge when we have odds
    if (p.bookmakerOdds && p.edge < -2) {
      console.log(`[Filter] Removing ${p.pick} - negative edge: ${p.edge}%`);
      return false;
    }
    
    // Add warning for marginal edge
    if (p.bookmakerOdds && p.edge < 1) {
      p.category = 'SPECULATIVE';
      if (!p.warnings.includes('Marginal edge - proceed with caution')) {
        p.warnings.push('Marginal edge - proceed with caution');
      }
    }
    
    // Filter out very low confidence
    if (p.confidence < 40) {
      console.log(`[Filter] Removing ${p.pick} - low confidence: ${p.confidence}%`);
      return false;
    }
    
    return true;
  });
}

// ============== DEDUPLICATE ==============

function deduplicatePredictions(predictions: EnhancedPrediction[]): EnhancedPrediction[] {
  const seen = new Set<string>();
  return predictions.filter(p => {
    const key = `${p.matchInfo.homeTeam}-${p.matchInfo.awayTeam}-${p.market}`;
    if (seen.has(key)) {
      return false;
    }
    seen.add(key);
    return true;
  });
}

// ============== SAVE TO DB ==============

async function saveToDb(predictions: EnhancedPrediction[]): Promise<void> {
  if (!saveAnalysisBatch) return;

  try {
    const records: AnalysisRecord[] = predictions.map((p) => ({
      home_team: p.matchInfo.homeTeam,
      away_team: p.matchInfo.awayTeam,
      market: p.market,
      selection: p.pick,
      line: p.line || null,
      odds: p.bookmakerOdds || 0,
      probability: Math.round(p.probability * 100),
      confidence: p.confidence,
      expected_value: p.edge,
      verdict: p.aiInsight || null,
      data_quality: p.dataQuality,
      match_date: p.matchInfo.kickoff
        ? new Date(p.matchInfo.kickoff).toISOString().split('T')[0]
        : null,
    }));
    await saveAnalysisBatch(records);
    console.log(`[DB] Saved ${predictions.length} basketball predictions`);
  } catch (e) {
    console.error('[DB] Save error:', e);
  }
}

// ============== MAIN HANDLER ==============

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

    console.log('[Basketball] Fetching fixtures...');
    if (trackApiUsage) await trackApiUsage('api_sports', '/games');

    const [today, tomorrow, dayAfter] = await Promise.all([
      getTodaysFixtures(),
      getTomorrowsFixtures(),
      getDayAfterTomorrowFixtures(),
    ]);
    const allFixtures = [...today, ...tomorrow, ...dayAfter];
    console.log(`[Basketball] Found ${allFixtures.length} games across ${new Set(allFixtures.map(f => f.league.id)).size} leagues`);

    if (allFixtures.length === 0) {
      return NextResponse.json({
        success: true,
        predictions: [],
        message: 'No games found',
      });
    }

    console.log('[Basketball] Analyzing matches...');
    const suggestions: BasketballSuggestion[] = [];
    const fixturesToAnalyze = allFixtures.slice(0, 30);
    
    for (const fixture of fixturesToAnalyze) {
      const analysis = await analyzeBasketballMatch(fixture);
      suggestions.push(...analysis);
    }

    let predictions = suggestions.map(convertToApiFormat);
    
    // Deduplicate
    predictions = deduplicatePredictions(predictions);
    
    // Sort by category then confidence
    predictions.sort((a, b) => {
      const catOrder: Record<string, number> = { LOW_RISK: 0, VALUE: 1, SPECULATIVE: 2, NO_BET: 3 };
      if (catOrder[a.category] !== catOrder[b.category]) {
        return catOrder[a.category] - catOrder[b.category];
      }
      return b.confidence - a.confidence;
    });

    predictions = predictions.slice(0, 60);

    // 🔑 KEY FIX: Fetch odds for ALL leagues
    console.log('[Basketball] Fetching odds for all leagues...');
    predictions = await addOdds(predictions);

    // Filter negative EV
    predictions = filterNoBets(predictions);

    // AI enhancement
    console.log('[Basketball] AI enhancement...');
    predictions = await enhanceWithAI(predictions);

    // Save to DB
    saveToDb(predictions).catch(() => {});

    cachedPredictions = predictions;
    cacheTime = Date.now();

    const leaguesWithOdds = new Set(predictions.filter(p => p.bookmakerOdds).map(p => p.matchInfo.league));

    return NextResponse.json({
      success: true,
      predictions,
      fixtureCount: allFixtures.length,
      aiEnhanced: predictions.some((p) => p.aiEnhanced),
      hasOdds: predictions.some((p) => p.bookmakerOdds),
      leaguesWithOdds: Array.from(leaguesWithOdds),
      analyzedAt: new Date().toISOString(),
      stats: {
        total: predictions.length,
        lowRisk: predictions.filter(p => p.category === 'LOW_RISK').length,
        value: predictions.filter(p => p.category === 'VALUE').length,
        speculative: predictions.filter(p => p.category === 'SPECULATIVE').length,
        withOdds: predictions.filter(p => p.bookmakerOdds).length,
        avgConfidence: predictions.length > 0 
          ? Math.round(predictions.reduce((a, p) => a + p.confidence, 0) / predictions.length)
          : 0,
        avgEdge: predictions.length > 0
          ? Math.round(predictions.reduce((a, p) => a + p.edge, 0) / predictions.length * 10) / 10
          : 0,
      }
    });
  } catch (error) {
    console.error('[Basketball] Error:', error);
    return NextResponse.json(
      { success: false, error: 'Analysis failed', predictions: [] },
      { status: 500 }
    );
  }
}

export const dynamic = 'force-dynamic';