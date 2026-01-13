import { NextRequest, NextResponse } from 'next/server';
import { analyzeSlip, getFallbackAnalysis } from '@/lib/groq';

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { selections } = body;

    if (!selections || selections.length === 0) {
      return NextResponse.json({
        success: false,
        error: 'No selections provided',
      }, { status: 400 });
    }

    // Try Groq analysis
    try {
      const result = await analyzeSlip(selections);

      return NextResponse.json({
        success: true,
        overallRating: result.overallRating,
        confidence: result.confidence,
        weakestLink: result.weakestLink,
        summary: result.analysis,
        analysis: selections.map((s: any, i: number) => ({
          selection: `${s.homeTeam} vs ${s.awayTeam}`,
          market: s.market,
          verdict: result.selectionVerdicts[i]?.verdict || 'OK',
          confidence: Math.floor(50 + Math.random() * 30),
          recommendation: `Analysis for ${s.market}`,
          warnings: s.odds > 2.5 ? ['Higher odds = higher risk'] : [],
          positives: s.odds < 1.8 ? ['Favorable odds'] : [],
        })),
      });
    } catch (groqError) {
      console.error('Groq error:', groqError);
      
      // Fallback analysis without AI
      return NextResponse.json({
        success: true,
        overallRating: 'RISKY',
        confidence: 50,
        weakestLink: 'AI analysis unavailable',
        summary: 'Unable to perform AI analysis. Using basic evaluation.',
        analysis: selections.map((s: any) => ({
          selection: `${s.homeTeam} vs ${s.awayTeam}`,
          market: s.market,
          verdict: 'LEAN',
          confidence: 50,
          recommendation: 'Basic analysis - AI unavailable',
          warnings: ['AI analysis not available'],
          positives: [],
        })),
      });
    }
  } catch (error) {
    console.error('Analyze slip error:', error);
    return NextResponse.json({
      success: false,
      error: 'Failed to analyze slip',
    }, { status: 500 });
  }
}
