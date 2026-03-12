// =============================================================
// FILE: app/api/evaluate/route.ts (v2 — TENNIS ADDED)
// =============================================================
//
// CHANGES:
// ✅ Tennis added to evaluation loop
// ✅ fetchTennisResult() uses ESPN scoreboard for completed matches
// ✅ Tennis market evaluation (MATCH_WINNER sets) in evaluatePrediction

import { NextResponse } from 'next/server';
import {
  evaluateRecentPredictions,
  calculatePerformanceStats,
  getUnevaluatedPredictions,
  saveEvaluationResults,
  getAllEvaluatedPredictions,
  PredictionRecord,
  EvaluationResult,
} from '@/lib/evaluation';

let supabase: any = null;

try {
  const sb = require('@/lib/supabase');
  supabase = sb.supabase || sb.default;
} catch {}

// Cache stats for 15 min
let cachedStats: any = null;
let cacheTime = 0;
const CACHE_DURATION = 15 * 60 * 1000;

// ============== TENNIS RESULT FETCHER ==============
// Uses ESPN free scoreboard to find completed match scores by player names

async function fetchTennisResult(
  homeTeam: string,
  awayTeam: string,
  matchDate: string
): Promise<{ homeScore: number; awayScore: number } | null> {
  const dateStr = matchDate.replace(/-/g, ''); // YYYYMMDD format for ESPN

  const normalize = (s: string) =>
    s.toLowerCase()
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .trim();

  const normHome = normalize(homeTeam);
  const normAway = normalize(awayTeam);

  for (const tour of ['atp', 'wta']) {
    try {
      const url = `https://site.api.espn.com/apis/site/v2/sports/tennis/${tour}/scoreboard?dates=${dateStr}`;
      const res = await fetch(url, { next: { revalidate: 3600 } });
      if (!res.ok) continue;
      const json = await res.json();

      const tournaments = json.leagues?.[0]?.events || json.events || [];

      for (const tournament of tournaments) {
        const groupings = tournament.groupings || [];
        for (const g of groupings) {
          const competitions = g.competitions || [];
          for (const match of competitions) {
            const statusState = match.status?.type?.state || 'pre';
            if (statusState !== 'post') continue; // only completed matches

            const competitors = match.competitors || [];
            const p1 = competitors[0];
            const p2 = competitors[1];
            if (!p1 || !p2) continue;

            const p1Name = normalize(p1?.athlete?.displayName || p1?.displayName || '');
            const p2Name = normalize(p2?.athlete?.displayName || p2?.displayName || '');

            if (!p1Name || !p2Name) continue;

            const homeMatch = p1Name.includes(normHome) || normHome.includes(p1Name) ||
              normHome.split(' ').pop()! === p1Name.split(' ').pop();
            const awayMatch = p2Name.includes(normAway) || normAway.includes(p2Name) ||
              normAway.split(' ').pop()! === p2Name.split(' ').pop();

            if (homeMatch && awayMatch) {
              // Score = sets won by each player
              const p1Sets = parseInt(p1?.score || '0') || 0;
              const p2Sets = parseInt(p2?.score || '0') || 0;
              if (p1Sets + p2Sets > 0) {
                console.log(`[Tennis Eval] Found: ${homeTeam} ${p1Sets}-${p2Sets} ${awayTeam}`);
                return { homeScore: p1Sets, awayScore: p2Sets };
              }
            }
          }
        }
      }
    } catch {
      // continue to next tour
    }
  }

  return null;
}

// ============== TENNIS EVALUATION HELPER ==============

async function evaluateTennisPredictions(
  predictions: PredictionRecord[]
): Promise<EvaluationResult[]> {
  const results: EvaluationResult[] = [];
  const toEvaluate = predictions.filter(p => p.match_date && !p.result && !p.evaluated_at);

  console.log(`[Eval] Evaluating ${toEvaluate.length} TENNIS predictions`);

  const byDate: Record<string, PredictionRecord[]> = {};
  for (const p of toEvaluate) {
    const date = p.match_date!;
    if (!byDate[date]) byDate[date] = [];
    byDate[date].push(p);
  }

  for (const [date, preds] of Object.entries(byDate)) {
    const matchDate = new Date(date);
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    if (matchDate >= today) {
      console.log(`[Eval] Skipping ${date} — not yet finished`);
      continue;
    }

    for (const pred of preds) {
      const score = await fetchTennisResult(pred.home_team, pred.away_team, date);
      if (score && (score.homeScore + score.awayScore) > 0) {
        const evalResult = evaluateTennisPred(pred, score.homeScore, score.awayScore);
        results.push(evalResult);
        console.log(
          `[Eval] TENNIS ${pred.home_team} vs ${pred.away_team}: ${pred.selection} → ${evalResult.result} (${score.homeScore}-${score.awayScore} sets)`
        );
      } else {
        console.log(`[Eval] No tennis result for ${pred.home_team} vs ${pred.away_team} on ${date}`);
      }
    }

    await new Promise(r => setTimeout(r, 200));
  }

  return results;
}

function evaluateTennisPred(
  prediction: PredictionRecord,
  setsHome: number,
  setsAway: number
): EvaluationResult {
  const market = prediction.market;
  let result: 'WIN' | 'LOSS' | 'PUSH' | 'VOID' = 'LOSS';

  if (market === 'MATCH_WINNER') {
    // home_team = player1, away_team = player2
    const pickIsP1 = prediction.selection.toLowerCase().includes(
      prediction.home_team.toLowerCase().split(' ').pop() || prediction.home_team.toLowerCase()
    );
    if (pickIsP1) {
      result = setsHome > setsAway ? 'WIN' : 'LOSS';
    } else {
      result = setsAway > setsHome ? 'WIN' : 'LOSS';
    }
  } else if (market === 'TOTAL_GAMES_OVER' || market === 'TOTAL_GAMES_UNDER') {
    // Games total is not directly available from sets — mark as VOID
    result = 'VOID';
  }

  const odds = prediction.odds || 1.9;
  const profit = result === 'WIN' ? odds - 1 : result === 'LOSS' ? -1 : 0;

  return {
    predictionId: prediction.id,
    result,
    actualScoreHome: setsHome,
    actualScoreAway: setsAway,
    profit: Math.round(profit * 100) / 100,
  };
}

// ============== GET UNEVALUATED TENNIS ==============

async function getUnevaluatedTennisPredictions(supabase: any): Promise<PredictionRecord[]> {
  const { data, error } = await supabase
    .from('predictions')
    .select('*')
    .is('result', null)
    .not('match_date', 'is', null)
    .lt('match_date', new Date().toISOString().split('T')[0])
    .or('market.eq.MATCH_WINNER,market.like.%TOTAL_GAMES%')
    .order('match_date', { ascending: false })
    .limit(100);

  if (error) {
    console.error('[Eval] Tennis query error:', error);
    return [];
  }
  return data || [];
}

// ============== SAVE TENNIS RESULTS ==============

async function saveTennisEvalResults(supabase: any, results: EvaluationResult[]): Promise<void> {
  for (const r of results) {
    const { error } = await supabase
      .from('predictions')
      .update({
        result: r.result,
        actual_score_home: r.actualScoreHome,
        actual_score_away: r.actualScoreAway,
        profit: r.profit,
        evaluated_at: new Date().toISOString(),
      })
      .eq('id', r.predictionId);
    if (error) console.error(`[Eval] Failed to save tennis result ${r.predictionId}:`, error);
  }
  console.log(`[Eval] Saved ${results.length} tennis evaluation results`);
}

// ============== MAIN HANDLER ==============

export async function GET(request: Request) {
  try {
    const url = new URL(request.url);
    const statsOnly = url.searchParams.get('stats') === 'true';
    const sport = url.searchParams.get('sport')?.toUpperCase() || undefined;

    if (statsOnly && cachedStats && Date.now() - cacheTime < CACHE_DURATION) {
      return NextResponse.json({ success: true, ...cachedStats, cached: true });
    }

    if (!supabase) {
      return NextResponse.json({
        success: false,
        error: 'Supabase not configured. Evaluation requires database storage.',
      }, { status: 500 });
    }

    let newEvaluations = 0;

    if (!statsOnly) {
      console.log('[Eval] Starting evaluation...');

      // Football + Basketball (uses API-Sports results)
      const apiSportsSports: Array<'FOOTBALL' | 'BASKETBALL'> = ['FOOTBALL', 'BASKETBALL'];
      for (const s of apiSportsSports) {
        if (sport && sport !== s) continue;
        const unevaluated = await getUnevaluatedPredictions(supabase, s);
        console.log(`[Eval] ${s}: ${unevaluated.length} to evaluate`);
        if (unevaluated.length > 0) {
          const results = await evaluateRecentPredictions(unevaluated, s);
          if (results.length > 0) {
            const { saveEvaluationResults } = require('@/lib/evaluation');
            await saveEvaluationResults(supabase, results);
            newEvaluations += results.length;
          }
        }
      }

      // Tennis (uses ESPN scoreboard)
      if (!sport || sport === 'TENNIS') {
        const tennisPreds = await getUnevaluatedTennisPredictions(supabase);
        console.log(`[Eval] TENNIS: ${tennisPreds.length} to evaluate`);
        if (tennisPreds.length > 0) {
          const tennisResults = await evaluateTennisPredictions(tennisPreds);
          if (tennisResults.length > 0) {
            await saveTennisEvalResults(supabase, tennisResults);
            newEvaluations += tennisResults.length;
          }
        }
      }

      console.log(`[Eval] Total new evaluations: ${newEvaluations}`);
    }

    const allEvaluated = await getAllEvaluatedPredictions(supabase);
    const stats = calculatePerformanceStats(allEvaluated);

    const response = {
      success: true,
      newEvaluations,
      stats,
      evaluatedAt: new Date().toISOString(),
    };

    cachedStats = response;
    cacheTime = Date.now();

    return NextResponse.json(response);
  } catch (error) {
    console.error('[Eval] Error:', error);
    return NextResponse.json({ success: false, error: 'Evaluation failed' }, { status: 500 });
  }
}

export const dynamic = 'force-dynamic';