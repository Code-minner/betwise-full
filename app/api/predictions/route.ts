import { NextRequest, NextResponse } from 'next/server';
import { getRecentPredictions, savePrediction, settlePrediction } from '@/lib/supabase';
import { Sport, Prediction } from '@/lib/types';

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const sport = searchParams.get('sport') as Sport | null;
    const limit = parseInt(searchParams.get('limit') || '50');

    const predictions = await getRecentPredictions(sport || undefined, limit);

    return NextResponse.json({
      success: true,
      predictions,
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
    const { matchId, prediction } = body;

    if (!matchId || !prediction) {
      return NextResponse.json({
        success: false,
        error: 'Missing matchId or prediction',
      }, { status: 400 });
    }

    const id = await savePrediction(matchId, prediction as Prediction);

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

    const success = await settlePrediction(predictionId, isCorrect, actualResult);

    return NextResponse.json({ success });
  } catch (error) {
    console.error('Error settling prediction:', error);
    return NextResponse.json({
      success: false,
      error: 'Failed to settle prediction',
    }, { status: 500 });
  }
}
