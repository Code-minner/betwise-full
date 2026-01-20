// =============================================================
// FILE: app/api/debug/odds/route.ts
// =============================================================
// 
// Debug endpoint to check what's actually available from The Odds API
// Visit: http://localhost:3001/api/debug/odds

import { NextResponse } from 'next/server';

const API_KEY = process.env.ODDS_API_KEY || process.env.THE_ODDS_API_KEY || '';
const BASE_URL = 'https://api.the-odds-api.com/v4';

interface Sport {
  key: string;
  group: string;
  title: string;
  description: string;
  active: boolean;
  has_outrights: boolean;
}

interface OddsEvent {
  id: string;
  sport_key: string;
  sport_title: string;
  commence_time: string;
  home_team: string;
  away_team: string;
  bookmakers: any[];
}

export async function GET() {
  if (!API_KEY) {
    return NextResponse.json({ 
      error: 'No API key configured',
      help: 'Set ODDS_API_KEY or THE_ODDS_API_KEY in .env.local'
    }, { status: 500 });
  }

  const results: any = {
    timestamp: new Date().toISOString(),
    apiKeyPrefix: API_KEY.substring(0, 8) + '...',
    sports: {},
    testResults: {},
    issues: [],
    recommendations: [],
  };

  try {
    // 1. Get all available sports
    const sportsRes = await fetch(`${BASE_URL}/sports?apiKey=${API_KEY}`);
    
    if (!sportsRes.ok) {
      return NextResponse.json({
        error: `API returned ${sportsRes.status}`,
        help: 'Check if your API key is valid'
      }, { status: 500 });
    }
    
    results.requestsRemaining = sportsRes.headers.get('x-requests-remaining');
    results.requestsUsed = sportsRes.headers.get('x-requests-used');
    
    const sports: Sport[] = await sportsRes.json();
    
    // Filter to active soccer sports
    const activeSoccer = sports.filter(s => s.group === 'Soccer' && s.active);
    
    results.sports = {
      totalActive: sports.filter(s => s.active).length,
      activeSoccer: activeSoccer.length,
      soccerKeys: activeSoccer.map(s => ({
        key: s.key,
        title: s.title,
      })),
    };

    // 2. Test key sport keys that your app uses
    const testKeys = [
      { key: 'soccer_epl', league: 'Premier League (39)' },
      { key: 'soccer_england_championship', league: 'Championship (40)' },
      { key: 'soccer_france_ligue_one', league: 'Ligue 1 (61)' },
      { key: 'soccer_spain_la_liga', league: 'La Liga (140)' },
      { key: 'soccer_italy_serie_a', league: 'Serie A (135)' },
      { key: 'soccer_germany_bundesliga', league: 'Bundesliga (78)' },
      { key: 'soccer_portugal_primeira_liga', league: 'Primeira Liga (94)' },
      { key: 'soccer_uefa_champs_league', league: 'Champions League (2)' },
    ];

    for (const { key, league } of testKeys) {
      try {
        // Check if sport key exists
        const sportExists = activeSoccer.some(s => s.key === key);
        
        if (!sportExists) {
          results.testResults[key] = {
            league,
            status: 'INVALID_KEY',
            eventCount: 0,
            message: 'Sport key not found in API',
          };
          results.issues.push(`${league}: Sport key "${key}" not found`);
          continue;
        }
        
        // Fetch odds for this sport
        const res = await fetch(
          `${BASE_URL}/sports/${key}/odds?apiKey=${API_KEY}&regions=uk,eu&markets=h2h,totals`
        );
        
        if (!res.ok) {
          results.testResults[key] = {
            league,
            status: 'API_ERROR',
            eventCount: 0,
            httpStatus: res.status,
          };
          continue;
        }
        
        const events: OddsEvent[] = await res.json();
        
        // Count events with actual bookmaker odds
        const eventsWithOdds = events.filter(e => e.bookmakers && e.bookmakers.length > 0);
        
        results.testResults[key] = {
          league,
          status: eventsWithOdds.length > 0 ? 'OK' : 'NO_ODDS',
          eventCount: events.length,
          eventsWithOdds: eventsWithOdds.length,
          events: eventsWithOdds.slice(0, 5).map(e => ({
            match: `${e.home_team} vs ${e.away_team}`,
            time: e.commence_time,
            bookmakers: e.bookmakers?.length || 0,
          })),
        };
        
        if (eventsWithOdds.length === 0 && events.length > 0) {
          results.issues.push(`${league}: Has ${events.length} events but no bookmaker odds yet`);
        } else if (events.length === 0) {
          results.issues.push(`${league}: No events available (may be between rounds)`);
        }
        
      } catch (e) {
        results.testResults[key] = {
          league,
          status: 'ERROR',
          error: String(e),
        };
      }
    }

    // 3. Check for common mapping issues
    const wrongKeys = [
      { wrong: 'soccer_england_efl_cup', correct: 'soccer_england_championship', for: 'Championship' },
      { wrong: 'soccer_scotland_premiership', correct: 'soccer_spl', for: 'Scottish Prem' },
      { wrong: 'soccer_brazil_serie_a', correct: 'soccer_brazil_campeonato', for: 'Brasileirao' },
    ];
    
    for (const { wrong, correct, for: league } of wrongKeys) {
      const hasWrong = activeSoccer.some(s => s.key === wrong);
      const hasCorrect = activeSoccer.some(s => s.key === correct);
      
      if (!hasWrong && hasCorrect) {
        results.recommendations.push(
          `${league}: Use "${correct}" instead of "${wrong}"`
        );
      }
    }

    // 4. General recommendations
    if (results.issues.length > 0) {
      results.recommendations.push(
        'Some matches may not have odds posted yet (typically available 1-3 days before kickoff)',
        'Check back closer to match time for odds availability'
      );
    }

    return NextResponse.json({
      success: true,
      ...results,
    });

  } catch (error) {
    return NextResponse.json({
      success: false,
      error: String(error),
    }, { status: 500 });
  }
}

export const dynamic = 'force-dynamic';