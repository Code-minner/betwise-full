// =============================================================
// FILE: app/api/tennis/analyze/route.ts (FIXED v4)
// =============================================================
// 
// CRITICAL FIXES:
// ✅ Actually fetches odds (previous version had NO odds fetching!)
// ✅ Tournament-to-sport-key mapping for Grand Slams, Masters, ATP 500/250
// ✅ Player name normalization for odds matching
// ✅ Deduplication of predictions
// ✅ AI NEVER modifies confidence, probability, or edge
// ✅ Category labels: LOW_RISK, VALUE, SPECULATIVE, UPSET
// ✅ FIXED: Set iteration with Array.from() for TypeScript compatibility

import { NextResponse } from 'next/server';
import {
  getTodaysFixtures,
  getTomorrowsFixtures,
  getDayAfterTomorrowFixtures,
  analyzeTennisMatch,
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

// =============================================================================
// 🔑 KEY FIX: Tennis sport keys change based on active tournaments
// The Odds API uses dynamic keys like 'tennis_atp_aus_open' during Grand Slams
// =============================================================================

const TENNIS_SPORT_KEYS = [
  // Grand Slams (active during their seasons)
  'tennis_atp_aus_open',
  'tennis_atp_french_open',
  'tennis_atp_wimbledon',
  'tennis_atp_us_open',
  'tennis_wta_aus_open',
  'tennis_wta_french_open',
  'tennis_wta_wimbledon',
  'tennis_wta_us_open',
  
  // Masters 1000 (sample - these rotate)
  'tennis_atp_indian_wells',
  'tennis_atp_miami',
  'tennis_atp_monte_carlo',
  'tennis_atp_madrid',
  'tennis_atp_rome',
  'tennis_atp_cincinnati',
  'tennis_atp_shanghai',
  'tennis_atp_paris',
  
  // WTA 1000
  'tennis_wta_indian_wells',
  'tennis_wta_miami',
  'tennis_wta_madrid',
  'tennis_wta_rome',
  'tennis_wta_cincinnati',
  
  // General fallbacks
  'tennis_atp',
  'tennis_wta',
];

// Map tournament name patterns to likely sport keys
function getTennisSportKeys(tournamentName: string): string[] {
  const lower = tournamentName.toLowerCase();
  const keys: string[] = [];
  
  // Grand Slams
  if (lower.includes('australian')) {
    keys.push('tennis_atp_aus_open', 'tennis_wta_aus_open');
  } else if (lower.includes('french') || lower.includes('roland')) {
    keys.push('tennis_atp_french_open', 'tennis_wta_french_open');
  } else if (lower.includes('wimbledon')) {
    keys.push('tennis_atp_wimbledon', 'tennis_wta_wimbledon');
  } else if (lower.includes('us open')) {
    keys.push('tennis_atp_us_open', 'tennis_wta_us_open');
  }
  
  // Masters 1000
  else if (lower.includes('indian wells')) {
    keys.push('tennis_atp_indian_wells', 'tennis_wta_indian_wells');
  } else if (lower.includes('miami')) {
    keys.push('tennis_atp_miami', 'tennis_wta_miami');
  } else if (lower.includes('monte carlo')) {
    keys.push('tennis_atp_monte_carlo');
  } else if (lower.includes('madrid')) {
    keys.push('tennis_atp_madrid', 'tennis_wta_madrid');
  } else if (lower.includes('rome')) {
    keys.push('tennis_atp_rome', 'tennis_wta_rome');
  } else if (lower.includes('cincinnati')) {
    keys.push('tennis_atp_cincinnati', 'tennis_wta_cincinnati');
  } else if (lower.includes('shanghai')) {
    keys.push('tennis_atp_shanghai');
  } else if (lower.includes('paris')) {
    keys.push('tennis_atp_paris');
  }
  
  // Fallback - try general ATP/WTA
  if (keys.length === 0) {
    if (lower.includes('wta')) {
      keys.push('tennis_wta');
    } else {
      keys.push('tennis_atp');
    }
  }
  
  return keys;
}

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
    player1: string;
    player2: string;
    tournament: string;
    surface: string;
    round: string;
    startTime: Date;
  };
  
  // AI Enhancement - NARRATIVE ONLY
  aiInsight?: string | null;
  aiEnhanced: boolean;
  
  // Odds comparison
  oddsComparison?: {
    bookmakerOdds: number;
    bookmaker: string;
    edge: number;
    value: string;
  };
}

let cachedPredictions: EnhancedPrediction[] | null = null;
let cacheTime = 0;
const CACHE_DURATION = 20 * 60 * 1000; // Tennis changes faster

// ============== CONVERT TO API FORMAT ==============

function convertToApiFormat(p: TennisSuggestion): EnhancedPrediction {
  return {
    matchId: String(p.fixture.id),
    sport: 'TENNIS',
    market: p.market,
    pick: p.pick,
    line: undefined,
    
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

// ============== PLAYER NAME NORMALIZATION ==============

function normalizePlayerName(name: string): string {
  return name
    .toLowerCase()
    .replace(/\./g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

function getLastName(name: string): string {
  const parts = name.trim().split(' ');
  return parts[parts.length - 1].toLowerCase();
}

function playersMatch(p1: string, p2: string): boolean {
  const n1 = normalizePlayerName(p1);
  const n2 = normalizePlayerName(p2);
  
  if (n1 === n2) return true;
  if (n1.includes(n2) || n2.includes(n1)) return true;
  
  // Check last name matching
  const ln1 = getLastName(p1);
  const ln2 = getLastName(p2);
  if (ln1 === ln2 && ln1.length > 3) return true;
  
  return false;
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
            `${idx + 1}. ${p.matchInfo.player1} vs ${p.matchInfo.player2} (${p.matchInfo.surface}) - ${p.pick}`
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
              content: `You are a tennis analyst. For each match, provide a brief 1-sentence insight about surface, form, or head-to-head.

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
// 🔑 KEY FIX: Actually fetch odds for tennis (was completely missing!)
// 🔑 FIXED: Use Array.from() for Set iteration (TypeScript compatibility)
// =============================================================================

async function addOdds(predictions: EnhancedPrediction[]): Promise<EnhancedPrediction[]> {
  if (!getBatchOddsAsArray) {
    console.log('[Tennis Odds] Odds API not available');
    return predictions;
  }

  // Collect all unique tournaments
  const tournaments = new Set(predictions.map(p => p.matchInfo.tournament));
  console.log(`[Tennis Odds] Fetching odds for ${tournaments.size} tournaments`);

  // Collect all odds records from relevant sport keys
  const allOddsRecords: OddsRecord[] = [];
  const fetchedKeys = new Set<string>();

  // 🔑 FIX: Use Array.from() to iterate over Set (TypeScript compatibility)
  for (const tournament of Array.from(tournaments)) {
    const sportKeys = getTennisSportKeys(tournament);
    
    for (const sportKey of sportKeys) {
      if (fetchedKeys.has(sportKey)) continue;
      fetchedKeys.add(sportKey);

      try {
        console.log(`[Tennis Odds] Trying ${sportKey}...`);
        const oddsArray = await getBatchOddsAsArray(sportKey);
        
        if (oddsArray && oddsArray.length > 0) {
          console.log(`[Tennis Odds] Got ${oddsArray.length} records from ${sportKey}`);
          allOddsRecords.push(...oddsArray);
        }
      } catch (e) {
        // Sport key not active or no odds available - this is normal
        console.log(`[Tennis Odds] No odds for ${sportKey} (may not be active)`);
      }
    }
  }

  if (allOddsRecords.length === 0) {
    console.log('[Tennis Odds] No odds found for any tennis tournament');
    return predictions;
  }

  console.log(`[Tennis Odds] Total ${allOddsRecords.length} odds records to match`);

  // Match odds to predictions
  for (const pred of predictions) {
    for (const oddsRecord of allOddsRecords) {
      // Tennis odds use homeTeam/awayTeam or player1/player2
      const oddsP1 = oddsRecord.player1 || oddsRecord.homeTeam || '';
      const oddsP2 = oddsRecord.player2 || oddsRecord.awayTeam || '';

      // Check if players match (in either order)
      const p1Match = playersMatch(pred.matchInfo.player1, oddsP1) || playersMatch(pred.matchInfo.player1, oddsP2);
      const p2Match = playersMatch(pred.matchInfo.player2, oddsP1) || playersMatch(pred.matchInfo.player2, oddsP2);

      if (p1Match && p2Match) {
        // Found matching odds!
        console.log(`[Tennis Odds] Matched: ${pred.matchInfo.player1} vs ${pred.matchInfo.player2}`);
        
        // Determine which odds to use based on who we're picking
        let bookOdds: { odds: number; bookmaker: string } | null = null;

        if (pred.market === 'MATCH_WINNER' || pred.market === 'UPSET') {
          // Figure out if we're betting on player 1 or player 2
          if (pred.pick.includes(pred.matchInfo.player1)) {
            // Betting on player 1
            if (playersMatch(pred.matchInfo.player1, oddsP1) && oddsRecord.homeWin) {
              bookOdds = oddsRecord.homeWin;
            } else if (playersMatch(pred.matchInfo.player1, oddsP2) && oddsRecord.awayWin) {
              bookOdds = oddsRecord.awayWin;
            }
          } else if (pred.pick.includes(pred.matchInfo.player2)) {
            // Betting on player 2
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
          const calculatedEdge = (pred.probability - impliedProb) * 100;
          
          pred.bookmakerOdds = bookOdds.odds;
          pred.bookmaker = bookOdds.bookmaker;
          pred.impliedProbability = impliedProb;
          pred.edge = Math.round(calculatedEdge * 10) / 10;
          
          pred.oddsComparison = {
            bookmakerOdds: bookOdds.odds,
            bookmaker: bookOdds.bookmaker,
            edge: pred.edge,
            value: calculatedEdge >= 8 ? 'STRONG' : calculatedEdge >= 4 ? 'GOOD' : calculatedEdge >= 0 ? 'FAIR' : 'POOR',
          };

          // Update category based on edge
          if (pred.category !== 'UPSET') {
            if (pred.confidence >= 60 && pred.edge >= 5) {
              pred.category = 'LOW_RISK';
            } else if (pred.edge >= 3) {
              pred.category = 'VALUE';
            } else if (pred.edge >= 0) {
              pred.category = 'SPECULATIVE';
            } else {
              pred.category = 'NO_BET';
            }
          }
        }

        break; // Found match, stop looking
      }
    }
  }

  const withOdds = predictions.filter(p => p.bookmakerOdds).length;
  console.log(`[Tennis Odds] Matched odds for ${withOdds}/${predictions.length} predictions`);

  return predictions;
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
    if (p.bookmakerOdds && p.edge < 1 && p.category !== 'UPSET') {
      p.category = 'SPECULATIVE';
      if (!p.warnings.includes('Marginal edge - proceed with caution')) {
        p.warnings.push('Marginal edge - proceed with caution');
      }
    }
    
    // Filter out very low confidence (except upsets)
    if (p.confidence < 35 && p.category !== 'UPSET') {
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
    // Create unique key based on players and market
    const players = [p.matchInfo.player1, p.matchInfo.player2].sort().join('-');
    const key = `${players}-${p.market}`;
    
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
      match_date: p.matchInfo.startTime
        ? new Date(p.matchInfo.startTime).toISOString().split('T')[0]
        : null,
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

    console.log('[Tennis] Fetching fixtures...');
    if (trackApiUsage) await trackApiUsage('api_sports', '/games');

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
        message: 'No matches found',
      });
    }

    console.log('[Tennis] Analyzing matches...');
    const suggestions: TennisSuggestion[] = [];
    const fixturesToAnalyze = allFixtures.slice(0, 40);
    
    for (const fixture of fixturesToAnalyze) {
      const analysis = await analyzeTennisMatch(fixture);
      suggestions.push(...analysis);
    }

    let predictions = suggestions.map(convertToApiFormat);
    
    // 🔑 KEY FIX: Deduplicate BEFORE sorting
    predictions = deduplicatePredictions(predictions);
    console.log(`[Tennis] ${predictions.length} predictions after deduplication`);
    
    // Sort by category then confidence
    predictions.sort((a, b) => {
      const catOrder: Record<string, number> = { LOW_RISK: 0, VALUE: 1, SPECULATIVE: 2, UPSET: 3, NO_BET: 4 };
      if (catOrder[a.category] !== catOrder[b.category]) {
        return catOrder[a.category] - catOrder[b.category];
      }
      return b.confidence - a.confidence;
    });

    predictions = predictions.slice(0, 50);

    // 🔑 KEY FIX: Actually fetch odds!
    console.log('[Tennis] Fetching odds...');
    predictions = await addOdds(predictions);

    // Filter negative EV
    predictions = filterNoBets(predictions);

    // AI enhancement
    console.log('[Tennis] AI enhancement...');
    predictions = await enhanceWithAI(predictions);

    // Save to DB
    saveToDb(predictions).catch(() => {});

    cachedPredictions = predictions;
    cacheTime = Date.now();

    return NextResponse.json({
      success: true,
      predictions,
      fixtureCount: allFixtures.length,
      aiEnhanced: predictions.some((p) => p.aiEnhanced),
      hasOdds: predictions.some((p) => p.bookmakerOdds),
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
      }
    });
  } catch (error) {
    console.error('[Tennis] Error:', error);
    return NextResponse.json(
      { success: false, error: 'Analysis failed', predictions: [] },
      { status: 500 }
    );
  }
}

export const dynamic = 'force-dynamic';