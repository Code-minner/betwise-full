// =============================================================
// FILE: app/api/best-odds/route.ts
// =============================================================

import { NextRequest, NextResponse } from 'next/server';

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const sport = searchParams.get('sport') || 'FOOTBALL';
  const leagueId = searchParams.get('leagueId');

  try {
    const oddsApi = await import('@/lib/odds-api');

    if (!oddsApi.isOddsApiConfigured()) {
      return NextResponse.json({
        success: false,
        error: 'Odds API not configured. Add ODDS_API_KEY to .env.local',
      });
    }

    let sportKey: string;

    // Determine sport key
    if (leagueId && oddsApi.LEAGUE_TO_SPORT_KEY[parseInt(leagueId)]) {
      sportKey = oddsApi.LEAGUE_TO_SPORT_KEY[parseInt(leagueId)];
    } else {
      // Default sport keys
      switch (sport.toUpperCase()) {
        case 'BASKETBALL':
          sportKey = oddsApi.SPORT_KEYS.NBA;
          break;
        case 'TENNIS':
          sportKey = oddsApi.SPORT_KEYS.ATP;
          break;
        case 'FOOTBALL':
        default:
          sportKey = oddsApi.SPORT_KEYS.EPL;
      }
    }

    console.log(`[Best Odds Route] Fetching odds for ${sportKey}`);

    // Use array-based function to avoid Map iteration issues
    const oddsArray = await oddsApi.getBatchOddsAsArray(sportKey);

    return NextResponse.json({
      success: true,
      sport: sportKey,
      count: oddsArray.length,
      odds: oddsArray,
      fetchedAt: new Date().toISOString(),
    });
  } catch (error) {
    console.error('[Best Odds Route] Error:', error);
    return NextResponse.json(
      { success: false, error: 'Failed to fetch odds' },
      { status: 500 }
    );
  }
}

// POST - Get odds for specific match
export async function POST(request: NextRequest) {
  try {
    const { homeTeam, awayTeam, sport, leagueId } = await request.json();

    if (!homeTeam || !awayTeam) {
      return NextResponse.json(
        { success: false, error: 'homeTeam and awayTeam required' },
        { status: 400 }
      );
    }

    const oddsApi = await import('@/lib/odds-api');

    if (!oddsApi.isOddsApiConfigured()) {
      return NextResponse.json({
        success: false,
        error: 'Odds API not configured',
      });
    }

    let sportKey: string = oddsApi.SPORT_KEYS.EPL;

    if (leagueId && oddsApi.LEAGUE_TO_SPORT_KEY[leagueId]) {
      sportKey = oddsApi.LEAGUE_TO_SPORT_KEY[leagueId];
    } else if (sport === 'BASKETBALL') {
      sportKey = oddsApi.SPORT_KEYS.NBA;
    }

    const odds = await oddsApi.getOddsForMatch(homeTeam, awayTeam, sportKey);

    if (!odds) {
      return NextResponse.json({
        success: false,
        error: 'No odds found for this match',
      });
    }

    return NextResponse.json({
      success: true,
      match: `${homeTeam} vs ${awayTeam}`,
      odds,
    });
  } catch (error) {
    console.error('[Best Odds Route POST] Error:', error);
    return NextResponse.json(
      { success: false, error: 'Failed to fetch odds' },
      { status: 500 }
    );
  }
}