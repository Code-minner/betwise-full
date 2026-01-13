import { NextRequest, NextResponse } from 'next/server';
import { 
  analyzeFootballMatch, 
  analyzeBasketballMatch, 
  analyzeTennisMatch,
  getFallbackAnalysis 
} from '@/lib/groq';

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { 
      sport, 
      homeTeam, 
      awayTeam, 
      league, 
      market, 
      line,
      surface, // For tennis
      homeStats,
      awayStats,
    } = body;

    if (!homeTeam || !awayTeam || !market) {
      return NextResponse.json({
        success: false,
        error: 'Missing required fields',
      }, { status: 400 });
    }

    let result;

    try {
      switch (sport) {
        case 'FOOTBALL':
          result = await analyzeFootballMatch(
            homeTeam,
            awayTeam,
            league || 'Unknown League',
            market,
            homeStats,
            awayStats
          );
          break;

        case 'BASKETBALL':
          result = await analyzeBasketballMatch(
            homeTeam,
            awayTeam,
            league || 'NBA',
            market,
            line,
            homeStats,
            awayStats
          );
          break;

        case 'TENNIS':
          result = await analyzeTennisMatch(
            homeTeam,
            awayTeam,
            league || 'ATP',
            surface || 'Hard',
            market,
            line
          );
          break;

        default:
          result = await analyzeFootballMatch(
            homeTeam,
            awayTeam,
            league || 'Unknown',
            market
          );
      }

      return NextResponse.json({
        success: true,
        ...result,
      });
    } catch (groqError) {
      console.error('Groq deep research error:', groqError);
      
      const fallback = getFallbackAnalysis();
      return NextResponse.json({
        success: true,
        ...fallback,
        warning: 'AI analysis unavailable - using fallback',
      });
    }
  } catch (error) {
    console.error('Deep research error:', error);
    return NextResponse.json({
      success: false,
      error: 'Failed to perform deep research',
    }, { status: 500 });
  }
}
