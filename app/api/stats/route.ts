// =============================================================
// FILE: app/api/stats/route.ts
// =============================================================

import { NextRequest, NextResponse } from 'next/server';

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const type = searchParams.get('type') || 'overview';

  try {
    const {
      getPerformanceStats,
      getRecentAnalyses,
      getPendingAnalyses,
      getApiUsageToday,
      isSupabaseConfigured,
    } = await import('@/lib/supabase');

    if (!isSupabaseConfigured()) {
      return NextResponse.json({
        success: true,
        stats: {
          total: 0,
          wins: 0,
          losses: 0,
          winRate: 0,
          roi: 0,
          profit: 0,
          avgOdds: 0,
          avgConfidence: 0,
        },
        apiUsage: [],
        message:
          'Database not configured. Add NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_ANON_KEY to .env.local',
      });
    }

    switch (type) {
      case 'overview': {
        const [stats, apiUsage] = await Promise.all([
          getPerformanceStats(),
          getApiUsageToday(),
        ]);

        return NextResponse.json({
          success: true,
          stats: stats || {
            total: 0,
            wins: 0,
            losses: 0,
            winRate: 0,
            roi: 0,
            profit: 0,
            avgOdds: 0,
            avgConfidence: 0,
          },
          apiUsage,
        });
      }

      case 'recent': {
        const limit = parseInt(searchParams.get('limit') || '50');
        const analyses = await getRecentAnalyses(limit);

        return NextResponse.json({
          success: true,
          count: analyses.length,
          analyses,
        });
      }

      case 'pending': {
        const pending = await getPendingAnalyses();

        return NextResponse.json({
          success: true,
          count: pending.length,
          analyses: pending,
        });
      }

      default:
        return NextResponse.json(
          { success: false, error: 'Invalid type' },
          { status: 400 }
        );
    }
  } catch (error) {
    console.error('[Stats Route]', error);
    return NextResponse.json(
      { success: false, error: 'Failed to fetch stats' },
      { status: 500 }
    );
  }
}

export async function POST(request: NextRequest) {
  try {
    const { id, result, won } = await request.json();

    if (!id || result === undefined || won === undefined) {
      return NextResponse.json(
        { success: false, error: 'id, result, and won required' },
        { status: 400 }
      );
    }

    const { updateAnalysisResult, isSupabaseConfigured } = await import(
      '@/lib/supabase'
    );

    if (!isSupabaseConfigured()) {
      return NextResponse.json({
        success: false,
        error: 'Database not configured',
      });
    }

    await updateAnalysisResult(id, result, won);

    return NextResponse.json({
      success: true,
      message: 'Result updated',
    });
  } catch (error) {
    console.error('[Stats Route POST]', error);
    return NextResponse.json(
      { success: false, error: 'Failed to update' },
      { status: 500 }
    );
  }
}