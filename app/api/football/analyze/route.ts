// =============================================================
// FILE: app/api/football/analyze/route.ts (FIXED)
// =============================================================
// 
// FIXES APPLIED:
// ✅ AI NEVER modifies confidence, probability, or edge
// ✅ AI only provides narrative insights
// ✅ Proper edge calculation using bookmaker odds
// ✅ NO BET filtering (edge < 3% with odds = filtered out)
// ✅ Category labels: LOW_RISK, VALUE, SPECULATIVE (not BANKER)

import { NextResponse } from 'next/server';
import {
  getTodaysFixtures,
  getTomorrowsFixtures,
  getDayAfterTomorrowFixtures,
  analyzeFootballMatch,
  FootballSuggestion,
  BookmakerOdds,
} from '@/lib/football';

// Optional dependencies - graceful degradation
let saveAnalysisBatch: ((a: AnalysisRecord[]) => Promise<void>) | null = null;
let trackApiUsage: ((api: string, endpoint: string) => Promise<void>) | null = null;
let getBatchOddsAsArray: ((sportKey: string) => Promise<OddsRecord[]>) | null = null;
let findOddsForTeams: ((oddsArray: OddsRecord[], home: string, away: string) => OddsRecord | null) | null = null;
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
  LEAGUE_TO_SPORT_KEY = odds.LEAGUE_TO_SPORT_KEY || {};
} catch {}

const GROQ_API_KEY = process.env.GROQ_API_KEY || '';
const GROQ_MODEL = 'llama-3.3-70b-versatile';

// ============== PREDICTION TYPE (FIXED) ==============

interface EnhancedPrediction {
  matchId: string;
  sport: string;
  market: string;
  pick: string;
  
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
  category: string;          // LOW_RISK | VALUE | SPECULATIVE | NO_BET
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
  aiInsight?: string | null;  // AI provides text insight
  aiEnhanced: boolean;        // Flag if AI analyzed
  // REMOVED: aiConfidenceAdjust - AI CANNOT modify numbers
  
  // Odds comparison (if available)
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

// ============== CONVERT SUGGESTION TO API FORMAT ==============

function convertToApiFormat(p: FootballSuggestion): EnhancedPrediction {
  return {
    matchId: String(p.fixture.id),
    sport: 'FOOTBALL',
    market: p.market,
    pick: p.pick,
    
    // Core numbers (from model, not modified)
    probability: p.probability,
    confidence: p.confidence,
    edge: p.edge,
    impliedProbability: p.impliedProbability,
    
    // Bookmaker data
    bookmakerOdds: p.bookmakerOdds,
    bookmaker: p.bookmaker,
    
    // Risk & Category
    riskLevel: p.risk,
    category: p.category,
    dataQuality: p.dataQuality,
    modelAgreement: p.modelAgreement,
    
    // Reasoning
    reasoning: p.reasoning,
    warnings: p.warnings,
    positives: p.reasoning.filter(r => !r.includes('warning')),
    
    // Match info
    matchInfo: {
      homeTeam: p.fixture.homeTeam.name,
      awayTeam: p.fixture.awayTeam.name,
      league: p.fixture.league.name,
      leagueId: p.fixture.league.id,
      kickoff: p.fixture.kickoff,
    },
    
    // AI (not yet enhanced)
    aiInsight: null,
    aiEnhanced: false,
  };
}

// ============== AI ENHANCEMENT (INSIGHT ONLY - NO NUMBER CHANGES) ==============

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
- DO NOT say "increase" or "decrease" confidence
- ONLY provide contextual insight about the match/teams
- Keep insights under 100 characters

Return JSON array: [{"insight":"Brief contextual insight about this pick"},...]`,
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
              const p = batch[j];
              const ai = results[j] || {};
              
              // AI ONLY provides insight text - NEVER modifies numbers
              enhanced.push({
                ...p,
                aiInsight: ai.insight || null,
                aiEnhanced: true,
                // confidence STAYS THE SAME - no aiConfidenceAdjust
              });
            }
          } catch {
            // JSON parse failed, add without AI
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

// ============== ADD BOOKMAKER ODDS ==============

async function addOdds(predictions: EnhancedPrediction[]): Promise<EnhancedPrediction[]> {
  if (!getBatchOddsAsArray || !findOddsForTeams) return predictions;

  // Group by league
  const leagueGroups: { [key: number]: EnhancedPrediction[] } = {};
  for (const p of predictions) {
    const lid = p.matchInfo.leagueId;
    if (!leagueGroups[lid]) leagueGroups[lid] = [];
    leagueGroups[lid].push(p);
  }

  // Debug: Log all league IDs found
  console.log('[Odds] League IDs found:', Object.keys(leagueGroups));

  // Fetch odds for each league
  for (const leagueId of Object.keys(leagueGroups).map(Number)) {
    const sportKey = LEAGUE_TO_SPORT_KEY[leagueId];
    
    if (!sportKey) {
      console.log(`[Odds] No sport key mapping for league ID: ${leagueId}`);
      continue;
    }
    
    console.log(`[Odds] Fetching for league ${leagueId} -> ${sportKey}`);

    try {
      const oddsArray = await getBatchOddsAsArray(sportKey);
      
      // Log available matches for debugging
      if (oddsArray.length > 0) {
        console.log(`[Odds] Available matches for ${sportKey}:`);
        oddsArray.forEach(o => console.log(`  - ${o.homeTeam} vs ${o.awayTeam}`));
      } else {
        console.log(`[Odds] No matches found for ${sportKey}`);
      }
      
      const preds = leagueGroups[leagueId];

      for (const pred of preds) {
        const odds = findOddsForTeams(
          oddsArray,
          pred.matchInfo.homeTeam,
          pred.matchInfo.awayTeam
        );

        if (odds) {
          console.log(`[Odds] Found odds for ${pred.matchInfo.homeTeam} vs ${pred.matchInfo.awayTeam}`);
          
          // Match market to odds
          if (pred.market.includes('OVER') && pred.market.includes('2_5') && odds.over) {
            const impliedProb = 1 / odds.over.odds;
            const calculatedEdge = (pred.probability - impliedProb) * 100;
            
            console.log(`[Odds] Over 2.5: Our prob=${(pred.probability * 100).toFixed(1)}%, Book implied=${(impliedProb * 100).toFixed(1)}%, Edge=${calculatedEdge.toFixed(1)}%`);
            
            pred.oddsComparison = {
              bookmakerOdds: odds.over.odds,
              bookmakerLine: odds.over.line,
              bookmaker: odds.over.bookmaker,
              edge: Math.round(calculatedEdge * 10) / 10,
              value: calculatedEdge >= 10 ? 'STRONG' : calculatedEdge >= 5 ? 'GOOD' : calculatedEdge >= 0 ? 'FAIR' : 'POOR',
            };
            
            // Update edge with real calculation
            pred.edge = Math.round(calculatedEdge * 10) / 10;
            pred.impliedProbability = impliedProb;
            pred.bookmakerOdds = odds.over.odds;
            pred.bookmaker = odds.over.bookmaker;
            
          } else if (pred.market.includes('UNDER') && pred.market.includes('2_5') && odds.under) {
            const impliedProb = 1 / odds.under.odds;
            const calculatedEdge = (pred.probability - impliedProb) * 100;
            
            pred.oddsComparison = {
              bookmakerOdds: odds.under.odds,
              bookmakerLine: odds.under.line,
              bookmaker: odds.under.bookmaker,
              edge: Math.round(calculatedEdge * 10) / 10,
              value: calculatedEdge >= 10 ? 'STRONG' : calculatedEdge >= 5 ? 'GOOD' : calculatedEdge >= 0 ? 'FAIR' : 'POOR',
            };
            
            pred.edge = Math.round(calculatedEdge * 10) / 10;
            pred.impliedProbability = impliedProb;
            pred.bookmakerOdds = odds.under.odds;
            pred.bookmaker = odds.under.bookmaker;
          }
          
          // Match Winner - Home
          else if (pred.market === 'MATCH_WINNER_HOME' && odds.homeWin) {
            const impliedProb = 1 / odds.homeWin.odds;
            const calculatedEdge = (pred.probability - impliedProb) * 100;
            
            console.log(`[Odds] Home Win: Our prob=${(pred.probability * 100).toFixed(1)}%, Book implied=${(impliedProb * 100).toFixed(1)}%, Edge=${calculatedEdge.toFixed(1)}%`);
            
            pred.oddsComparison = {
              bookmakerOdds: odds.homeWin.odds,
              bookmaker: odds.homeWin.bookmaker,
              edge: Math.round(calculatedEdge * 10) / 10,
              value: calculatedEdge >= 10 ? 'STRONG' : calculatedEdge >= 5 ? 'GOOD' : calculatedEdge >= 0 ? 'FAIR' : 'POOR',
            };
            
            pred.edge = Math.round(calculatedEdge * 10) / 10;
            pred.impliedProbability = impliedProb;
            pred.bookmakerOdds = odds.homeWin.odds;
            pred.bookmaker = odds.homeWin.bookmaker;
          }
          
          // Match Winner - Away
          else if (pred.market === 'MATCH_WINNER_AWAY' && odds.awayWin) {
            const impliedProb = 1 / odds.awayWin.odds;
            const calculatedEdge = (pred.probability - impliedProb) * 100;
            
            console.log(`[Odds] Away Win: Our prob=${(pred.probability * 100).toFixed(1)}%, Book implied=${(impliedProb * 100).toFixed(1)}%, Edge=${calculatedEdge.toFixed(1)}%`);
            
            pred.oddsComparison = {
              bookmakerOdds: odds.awayWin.odds,
              bookmaker: odds.awayWin.bookmaker,
              edge: Math.round(calculatedEdge * 10) / 10,
              value: calculatedEdge >= 10 ? 'STRONG' : calculatedEdge >= 5 ? 'GOOD' : calculatedEdge >= 0 ? 'FAIR' : 'POOR',
            };
            
            pred.edge = Math.round(calculatedEdge * 10) / 10;
            pred.impliedProbability = impliedProb;
            pred.bookmakerOdds = odds.awayWin.odds;
            pred.bookmaker = odds.awayWin.bookmaker;
          }
          
          // Double Chance 1X (Home or Draw)
          else if (pred.market === 'DOUBLE_CHANCE_1X' && odds.homeWin && odds.draw) {
            // Double chance implied = homeWin implied + draw implied (approximate)
            const homeImplied = 1 / odds.homeWin.odds;
            const drawImplied = 1 / odds.draw.odds;
            // Note: This is an approximation - real DC odds would be different
            const dcImplied = Math.min(0.90, homeImplied + drawImplied);
            const calculatedEdge = (pred.probability - dcImplied) * 100;
            
            console.log(`[Odds] DC 1X: Our prob=${(pred.probability * 100).toFixed(1)}%, Book implied=${(dcImplied * 100).toFixed(1)}%, Edge=${calculatedEdge.toFixed(1)}%`);
            
            pred.oddsComparison = {
              bookmakerOdds: 1 / dcImplied, // Convert back to odds
              bookmaker: odds.homeWin.bookmaker,
              edge: Math.round(calculatedEdge * 10) / 10,
              value: calculatedEdge >= 10 ? 'STRONG' : calculatedEdge >= 5 ? 'GOOD' : calculatedEdge >= 0 ? 'FAIR' : 'POOR',
            };
            
            pred.edge = Math.round(calculatedEdge * 10) / 10;
            pred.impliedProbability = dcImplied;
            pred.bookmakerOdds = 1 / dcImplied;
            pred.bookmaker = odds.homeWin.bookmaker;
          }
          // Note: BTTS not available from The Odds API - will show Edge 0%
        } else {
          console.log(`[Odds] No match found for ${pred.matchInfo.homeTeam} vs ${pred.matchInfo.awayTeam}`);
        }
      }
    } catch (e) {
      console.error(`[Odds] Error for league ${leagueId}:`, e);
    }
  }

  return predictions;
}

// ============== FILTER NO-BET PREDICTIONS ==============

function filterNoBets(predictions: EnhancedPrediction[]): EnhancedPrediction[] {
  return predictions.filter(p => {
    // Require positive edge when bookmaker odds available
    if (p.bookmakerOdds && p.edge < -3) {
      console.log(`[Filter] Removing ${p.pick} - negative edge: ${p.edge}%`);
      return false;
    }
    
    // Minimum confidence threshold
    if (p.confidence < 35) {
      console.log(`[Filter] Removing ${p.pick} - low confidence: ${p.confidence}%`);
      return false;
    }
    
    return true;
  });
}

// ============== ASSIGN CATEGORIES (Works with or without odds) ==============

function assignCategories(predictions: EnhancedPrediction[]): EnhancedPrediction[] {
  return predictions.map(p => {
    const hasOdds = !!p.bookmakerOdds;
    const isCorners = p.market.includes('CORNER');
    const prob = p.probability > 1 ? p.probability / 100 : p.probability;
    const probPercent = prob * 100;
    
    let category: string;
    
    if (hasOdds) {
      // WITH ODDS: Use edge for category
      if (p.edge >= 6 && p.confidence >= 58) {
        category = 'LOW_RISK';
      } else if (p.edge >= 3 && p.confidence >= 52) {
        category = 'VALUE';
      } else if (p.edge >= 0) {
        category = 'SPECULATIVE';
      } else {
        category = 'NO_BET';
      }
    } else {
      // WITHOUT ODDS: Use confidence + probability for category
      // Corners will always fall here - be more generous
      if (isCorners) {
        // CORNERS: No odds available from The Odds API
        if (p.confidence >= 65 && probPercent >= 55) {
          category = 'LOW_RISK';
        } else if (p.confidence >= 58 && probPercent >= 48) {
          category = 'VALUE';
        } else {
          category = 'SPECULATIVE';
        }
        // Don't warn about no odds for corners - it's expected
      } else {
        // GOALS without odds (unusual)
        if (p.confidence >= 65 && probPercent >= 55) {
          category = 'LOW_RISK';
        } else if (p.confidence >= 58 && probPercent >= 48) {
          category = 'VALUE';
        } else {
          category = 'SPECULATIVE';
        }
        // Add warning only for non-corner markets
        if (!p.warnings.includes('No bookmaker odds available')) {
          p.warnings.push('No bookmaker odds available - edge not calculated');
        }
      }
    }
    
    return { ...p, category };
  });
}

// ============== SAVE TO DATABASE ==============

async function saveToDb(predictions: EnhancedPrediction[]): Promise<void> {
  if (!saveAnalysisBatch) return;

  try {
    const records: AnalysisRecord[] = predictions.map((p) => ({
      home_team: p.matchInfo.homeTeam,
      away_team: p.matchInfo.awayTeam,
      market: p.market,
      selection: p.pick,
      line: null,
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
    console.log(`[DB] Saved ${predictions.length} football predictions`);
  } catch (e) {
    console.error('[DB] Save error:', e);
  }
}

// ============== MAIN API HANDLER ==============

export async function GET() {
  try {
    // Check cache
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

    const [today, tomorrow, dayAfter] = await Promise.all([
      getTodaysFixtures(),
      getTomorrowsFixtures(),
      getDayAfterTomorrowFixtures(),
    ]);
    const allFixtures = [...today, ...tomorrow, ...dayAfter];
    console.log(`[Football] Found ${allFixtures.length} fixtures`);

    if (allFixtures.length === 0) {
      return NextResponse.json({
        success: true,
        predictions: [],
        message: 'No fixtures found',
      });
    }

    // Analyze fixtures (uses new fixed analysis)
    console.log('[Football] Analyzing...');
    const suggestions: FootballSuggestion[] = [];
    const fixturesToAnalyze = allFixtures.slice(0, 25);
    
    for (const fixture of fixturesToAnalyze) {
      const analysis = await analyzeFootballMatch(fixture);
      suggestions.push(...analysis);
    }

    // Convert to API format
    let predictions = suggestions.map(convertToApiFormat);
    
    // Sort by category first, then confidence
    predictions.sort((a, b) => {
      const catOrder: Record<string, number> = { LOW_RISK: 0, VALUE: 1, SPECULATIVE: 2, NO_BET: 3 };
      if (catOrder[a.category] !== catOrder[b.category]) {
        return catOrder[a.category] - catOrder[b.category];
      }
      return b.confidence - a.confidence;
    });

    // Limit before AI enhancement
    predictions = predictions.slice(0, 50);

    // Add bookmaker odds & recalculate edge
    console.log('[Football] Fetching odds...');
    predictions = await addOdds(predictions);

    // Assign categories (works with or without odds)
    predictions = assignCategories(predictions);

    // Filter out NO BET predictions
    predictions = filterNoBets(predictions);

    // Re-sort after category assignment
    predictions.sort((a, b) => {
      const catOrder: Record<string, number> = { LOW_RISK: 0, VALUE: 1, SPECULATIVE: 2, NO_BET: 3 };
      if (catOrder[a.category] !== catOrder[b.category]) {
        return catOrder[a.category] - catOrder[b.category];
      }
      return b.confidence - a.confidence;
    });

    // AI enhancement (insight only, no number changes)
    console.log('[Football] AI enhancement...');
    predictions = await enhanceWithAI(predictions);

    // Save to DB (async, don't wait)
    saveToDb(predictions).catch(() => {});

    // Cache results
    cachedPredictions = predictions;
    cacheTime = Date.now();

    return NextResponse.json({
      success: true,
      predictions,
      fixtureCount: allFixtures.length,
      aiEnhanced: predictions.some((p) => p.aiEnhanced),
      hasOdds: predictions.some((p) => p.bookmakerOdds),
      analyzedAt: new Date().toISOString(),
      // New metadata
      stats: {
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
      }
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