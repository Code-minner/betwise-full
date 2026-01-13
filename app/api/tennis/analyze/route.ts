// =============================================================
// FILE: app/api/tennis/analyze/route.ts
// =============================================================

import { NextResponse } from 'next/server';
import {
  getTodaysFixtures,
  getTomorrowsFixtures,
  analyzeTennisMatch,
  TennisSuggestion,
} from '@/lib/tennis';

// Optional dependencies - graceful degradation
let saveAnalysisBatch: ((a: AnalysisRecord[]) => Promise<void>) | null = null;
let trackApiUsage: ((api: string, endpoint: string) => Promise<void>) | null = null;

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

try {
  const sb = require('@/lib/supabase');
  saveAnalysisBatch = sb.saveAnalysisBatch;
  trackApiUsage = sb.trackApiUsage;
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
    kickoff: Date;
  };
  player1: { name: string; ranking?: number };
  player2: { name: string; ranking?: number };
  tournament: { name: string; surface: string };
  round: string;
  aiInsight?: string | null;
  aiEnhanced?: boolean;
  aiConfidenceAdjust?: number;
}

let cachedPredictions: EnhancedPrediction[] | null = null;
let cacheTime = 0;
const CACHE_DURATION = 30 * 60 * 1000;

function convertToApiFormat(p: TennisSuggestion): EnhancedPrediction {
  return {
    matchId: String(p.fixture.id),
    sport: 'TENNIS',
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
      homeTeam: p.fixture.player1.name,
      awayTeam: p.fixture.player2.name,
      league: `${p.fixture.tournament.name} (${p.fixture.tournament.surface})`,
      kickoff: p.fixture.startTime,
    },
    player1: {
      name: p.fixture.player1.name,
      ranking: p.fixture.player1.ranking,
    },
    player2: {
      name: p.fixture.player2.name,
      ranking: p.fixture.player2.ranking,
    },
    tournament: p.fixture.tournament,
    round: p.fixture.round,
  };
}

async function enhanceWithAI(predictions: TennisSuggestion[]): Promise<EnhancedPrediction[]> {
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
            `${idx + 1}. ${p.fixture.player1.name} vs ${p.fixture.player2.name} (${p.fixture.tournament.name}, ${p.fixture.tournament.surface}) - ${p.pick}, ${p.confidence}%`
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
                'Tennis analyst. For each: 1 sentence insight + confidence adjust (-10 to +10). Consider surface, form, H2H, fatigue. Return JSON: [{"insight":"...","adjust":0},...]',
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
    console.log(`[DB] Saved ${predictions.length} tennis predictions`);
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
        analyzedAt: new Date(cacheTime).toISOString(),
      });
    }

    console.log('[Tennis] Fetching fixtures...');
    if (trackApiUsage) await trackApiUsage('api_sports', '/games');

    const [today, tomorrow] = await Promise.all([
      getTodaysFixtures(),
      getTomorrowsFixtures(),
    ]);
    const allFixtures = [...today, ...tomorrow];
    console.log(`[Tennis] Found ${allFixtures.length} matches`);

    if (allFixtures.length === 0) {
      return NextResponse.json({
        success: true,
        predictions: [],
        message: 'No matches found',
      });
    }

    console.log('[Tennis] Analyzing...');
    const predictions: TennisSuggestion[] = [];
    const fixturesToAnalyze = allFixtures.slice(0, 20);
    for (let i = 0; i < fixturesToAnalyze.length; i++) {
      const analysis = await analyzeTennisMatch(fixturesToAnalyze[i]);
      predictions.push(...analysis);
    }
    predictions.sort((a, b) => b.confidence - a.confidence);

    console.log('[Tennis] AI enhancement...');
    const enhanced = await enhanceWithAI(predictions.slice(0, 30));

    saveToDb(enhanced).catch(() => {});

    cachedPredictions = enhanced;
    cacheTime = Date.now();

    return NextResponse.json({
      success: true,
      predictions: enhanced,
      fixtureCount: allFixtures.length,
      aiEnhanced: enhanced.some((p) => p.aiEnhanced),
      analyzedAt: new Date().toISOString(),
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