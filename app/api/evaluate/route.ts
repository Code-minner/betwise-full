// =============================================================
// FILE: app/api/evaluate/route.ts
// =============================================================
// 
// Evaluates past predictions against actual results.
// GET /api/evaluate → Run evaluation + return performance stats
// GET /api/evaluate?stats=true → Return stats only (no new evaluation)

import { NextResponse } from 'next/server';
import {
  evaluateRecentPredictions,
  calculatePerformanceStats,
  getUnevaluatedPredictions,
  saveEvaluationResults,
  getAllEvaluatedPredictions,
  PredictionRecord,
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

export async function GET(request: Request) {
  try {
    const url = new URL(request.url);
    const statsOnly = url.searchParams.get('stats') === 'true';
    const sport = url.searchParams.get('sport')?.toUpperCase() || undefined;

    // Return cached stats if fresh
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

    // Run evaluation if not stats-only
    if (!statsOnly) {
      console.log('[Eval] Starting evaluation...');

      // Get unevaluated predictions for each sport
      const sports: Array<'FOOTBALL' | 'BASKETBALL'> = ['FOOTBALL', 'BASKETBALL'];

      for (const s of sports) {
        if (sport && sport !== s) continue;

        const unevaluated = await getUnevaluatedPredictions(supabase, s);
        console.log(`[Eval] ${s}: ${unevaluated.length} predictions to evaluate`);

        if (unevaluated.length > 0) {
          const results = await evaluateRecentPredictions(unevaluated, s);

          if (results.length > 0) {
            await saveEvaluationResults(supabase, results);
            newEvaluations += results.length;
          }
        }
      }

      console.log(`[Eval] Total new evaluations: ${newEvaluations}`);
    }

    // Get all evaluated predictions for stats
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
    return NextResponse.json(
      { success: false, error: 'Evaluation failed' },
      { status: 500 }
    );
  }
}

export const dynamic = 'force-dynamic';