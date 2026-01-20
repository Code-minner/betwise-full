// =============================================================
// FILE: app/api/predictions/route.ts (FIXED)
// =============================================================
// 
// FIXED: Uses existing supabase functions instead of non-existent ones
// - getRecentPredictions → getRecentAnalyses
// - savePrediction → saveAnalysis
// - settlePrediction → updateAnalysisResult

import { NextRequest, NextResponse } from 'next/server';
import { 
  getRecentAnalyses, 
  saveAnalysis, 
  updateAnalysisResult,
  AnalysisHistory 
} from '@/lib/supabase';

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const sport = searchParams.get('sport');
    const limit = parseInt(searchParams.get('limit') || '50');

    // Get recent analyses (predictions)
    let predictions = await getRecentAnalyses(limit);

    // Filter by sport if provided
    if (sport && predictions.length > 0) {
      predictions = predictions.filter(p => {
        // Check if the market or selection contains the sport name
        const marketLower = (p.market || '').toLowerCase();
        const sportLower = sport.toLowerCase();
        
        // Simple sport detection based on market naming conventions
        if (sportLower === 'football') {
          return marketLower.includes('over') || 
                 marketLower.includes('under') || 
                 marketLower.includes('btts') ||
                 marketLower.includes('winner') ||
                 marketLower.includes('corner') ||
                 marketLower.includes('double_chance');
        }
        if (sportLower === 'basketball') {
          return marketLower.includes('total') || 
                 marketLower.includes('spread') ||
                 marketLower.includes('moneyline');
        }
        if (sportLower === 'tennis') {
          return marketLower.includes('match_winner') || 
                 marketLower.includes('games') ||
                 marketLower.includes('upset');
        }
        return true;
      });
    }

    return NextResponse.json({
      success: true,
      predictions,
      count: predictions.length,
    });
  } catch (error) {
    console.error('Error fetching predictions:', error);
    return NextResponse.json({
      success: false,
      error: 'Failed to fetch predictions',
      predictions: [],
    }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { prediction } = body;

    if (!prediction) {
      return NextResponse.json({
        success: false,
        error: 'Missing prediction data',
      }, { status: 400 });
    }

    // Convert to AnalysisHistory format
    const analysis: AnalysisHistory = {
      home_team: prediction.homeTeam || prediction.home_team || '',
      away_team: prediction.awayTeam || prediction.away_team || '',
      market: prediction.market || '',
      selection: prediction.pick || prediction.selection || '',
      line: prediction.line || null,
      odds: prediction.bookmakerOdds || prediction.odds || 0,
      probability: prediction.probability ? Math.round(prediction.probability * 100) : null,
      confidence: prediction.confidence || null,
      expected_value: prediction.edge || prediction.expected_value || null,
      verdict: prediction.aiInsight || prediction.verdict || null,
      data_quality: prediction.dataQuality || prediction.data_quality || null,
      match_date: prediction.matchDate || prediction.match_date || null,
    };

    const id = await saveAnalysis(analysis);

    if (!id) {
      return NextResponse.json({
        success: false,
        error: 'Failed to save prediction',
      }, { status: 500 });
    }

    return NextResponse.json({
      success: true,
      id,
    });
  } catch (error) {
    console.error('Error saving prediction:', error);
    return NextResponse.json({
      success: false,
      error: 'Failed to save prediction',
    }, { status: 500 });
  }
}

export async function PATCH(request: NextRequest) {
  try {
    const body = await request.json();
    const { predictionId, isCorrect, actualResult } = body;

    if (!predictionId || typeof isCorrect !== 'boolean') {
      return NextResponse.json({
        success: false,
        error: 'Missing predictionId or isCorrect',
      }, { status: 400 });
    }

    // Use existing updateAnalysisResult function
    await updateAnalysisResult(
      predictionId, 
      actualResult || (isCorrect ? 'Won' : 'Lost'), 
      isCorrect
    );

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Error settling prediction:', error);
    return NextResponse.json({
      success: false,
      error: 'Failed to settle prediction',
    }, { status: 500 });
  }
}