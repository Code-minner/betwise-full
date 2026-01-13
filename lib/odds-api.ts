// =============================================================
// FILE: lib/odds-api.ts
// =============================================================

import {
  cacheOdds,
  getCachedOdds,
  trackApiUsage,
  isSupabaseConfigured,
} from './supabase';

const API_KEY = process.env.THE_ODDS_API_KEY || '';
const BASE_URL = 'https://api.the-odds-api.com/v4';

// ============== TYPES ==============

export interface OddsEvent {
  id: string;
  sport_key: string;
  sport_title: string;
  commence_time: string;
  home_team: string;
  away_team: string;
  bookmakers: Bookmaker[];
}

export interface Bookmaker {
  key: string;
  title: string;
  last_update: string;
  markets: Market[];
}

export interface Market {
  key: string;
  last_update: string;
  outcomes: Outcome[];
}

export interface Outcome {
  name: string;
  price: number;
  point?: number;
}

export interface BestOdds {
  homeWin: { odds: number; bookmaker: string } | null;
  awayWin: { odds: number; bookmaker: string } | null;
  draw: { odds: number; bookmaker: string } | null;
  over: { line: number; odds: number; bookmaker: string } | null;
  under: { line: number; odds: number; bookmaker: string } | null;
  homeSpread: { line: number; odds: number; bookmaker: string } | null;
  awaySpread: { line: number; odds: number; bookmaker: string } | null;
}

export interface OddsWithMatch extends BestOdds {
  match: string;
  homeTeam: string;
  awayTeam: string;
}

// ============== SPORT KEYS ==============
// Using plain object types to avoid TypeScript const inference issues

export const SPORT_KEYS: { [key: string]: string } = {
  EPL: 'soccer_epl',
  LA_LIGA: 'soccer_spain_la_liga',
  SERIE_A: 'soccer_italy_serie_a',
  BUNDESLIGA: 'soccer_germany_bundesliga',
  LIGUE_1: 'soccer_france_ligue_one',
  CHAMPIONS_LEAGUE: 'soccer_uefa_champs_league',
  EUROPA_LEAGUE: 'soccer_uefa_europa_league',
  NBA: 'basketball_nba',
  EUROLEAGUE: 'basketball_euroleague',
  ATP: 'tennis_atp_aus_open',
  WTA: 'tennis_wta_aus_open',
};

export const LEAGUE_TO_SPORT_KEY: { [key: number]: string } = {
  39: SPORT_KEYS.EPL,
  140: SPORT_KEYS.LA_LIGA,
  135: SPORT_KEYS.SERIE_A,
  78: SPORT_KEYS.BUNDESLIGA,
  61: SPORT_KEYS.LIGUE_1,
  2: SPORT_KEYS.CHAMPIONS_LEAGUE,
  3: SPORT_KEYS.EUROPA_LEAGUE,
  12: SPORT_KEYS.NBA,
  120: SPORT_KEYS.EUROLEAGUE,
};

export function isOddsApiConfigured(): boolean {
  return API_KEY.length > 20;
}

// ============== API CALLS ==============

async function fetchOddsApi<T>(endpoint: string): Promise<T | null> {
  if (!isOddsApiConfigured()) return null;

  try {
    const url = `${BASE_URL}${endpoint}${endpoint.includes('?') ? '&' : '?'}apiKey=${API_KEY}`;
    console.log(`[Odds API] Fetching: ${endpoint}`);

    const response = await fetch(url);
    if (!response.ok) return null;

    if (isSupabaseConfigured()) {
      await trackApiUsage('the_odds_api', endpoint.split('?')[0]);
    }

    const remaining = response.headers.get('x-requests-remaining');
    console.log(`[Odds API] Remaining: ${remaining}`);

    return response.json();
  } catch (error) {
    console.error('[Odds API] Error:', error);
    return null;
  }
}

// ============== GET ODDS ==============

export async function getOddsForSport(
  sportKey: string,
  markets: string[] = ['h2h', 'totals', 'spreads'],
  regions: string = 'uk,eu'
): Promise<OddsEvent[]> {
  const data = await fetchOddsApi<OddsEvent[]>(
    `/sports/${sportKey}/odds?regions=${regions}&markets=${markets.join(',')}&oddsFormat=decimal`
  );
  return data || [];
}

function extractBestOdds(event: OddsEvent): BestOdds {
  const result: BestOdds = {
    homeWin: null,
    awayWin: null,
    draw: null,
    over: null,
    under: null,
    homeSpread: null,
    awaySpread: null,
  };

  for (let b = 0; b < event.bookmakers.length; b++) {
    const bookmaker = event.bookmakers[b];
    for (let m = 0; m < bookmaker.markets.length; m++) {
      const market = bookmaker.markets[m];

      // H2H (Moneyline)
      if (market.key === 'h2h') {
        for (let o = 0; o < market.outcomes.length; o++) {
          const outcome = market.outcomes[o];
          if (outcome.name === event.home_team) {
            if (!result.homeWin || outcome.price > result.homeWin.odds) {
              result.homeWin = { odds: outcome.price, bookmaker: bookmaker.title };
            }
          } else if (outcome.name === event.away_team) {
            if (!result.awayWin || outcome.price > result.awayWin.odds) {
              result.awayWin = { odds: outcome.price, bookmaker: bookmaker.title };
            }
          } else if (outcome.name === 'Draw') {
            if (!result.draw || outcome.price > result.draw.odds) {
              result.draw = { odds: outcome.price, bookmaker: bookmaker.title };
            }
          }
        }
      }

      // Totals (Over/Under)
      if (market.key === 'totals') {
        for (let o = 0; o < market.outcomes.length; o++) {
          const outcome = market.outcomes[o];
          if (outcome.name === 'Over' && outcome.point) {
            if (!result.over || outcome.price > result.over.odds) {
              result.over = {
                line: outcome.point,
                odds: outcome.price,
                bookmaker: bookmaker.title,
              };
            }
          } else if (outcome.name === 'Under' && outcome.point) {
            if (!result.under || outcome.price > result.under.odds) {
              result.under = {
                line: outcome.point,
                odds: outcome.price,
                bookmaker: bookmaker.title,
              };
            }
          }
        }
      }

      // Spreads
      if (market.key === 'spreads') {
        for (let o = 0; o < market.outcomes.length; o++) {
          const outcome = market.outcomes[o];
          if (outcome.name === event.home_team && outcome.point !== undefined) {
            if (!result.homeSpread || outcome.price > result.homeSpread.odds) {
              result.homeSpread = {
                line: outcome.point,
                odds: outcome.price,
                bookmaker: bookmaker.title,
              };
            }
          } else if (outcome.name === event.away_team && outcome.point !== undefined) {
            if (!result.awaySpread || outcome.price > result.awaySpread.odds) {
              result.awaySpread = {
                line: outcome.point,
                odds: outcome.price,
                bookmaker: bookmaker.title,
              };
            }
          }
        }
      }
    }
  }

  return result;
}

// ============== BATCH ODDS AS ARRAY ==============
// Returns array instead of Map to avoid TypeScript iteration issues

export async function getBatchOddsAsArray(sportKey: string): Promise<OddsWithMatch[]> {
  const oddsArray: OddsWithMatch[] = [];
  if (!isOddsApiConfigured()) return oddsArray;

  const events = await getOddsForSport(sportKey);
  if (!events) return oddsArray;

  for (let i = 0; i < events.length; i++) {
    const event = events[i];
    const bestOdds = extractBestOdds(event);
    oddsArray.push({
      match: `${event.home_team} vs ${event.away_team}`,
      homeTeam: event.home_team,
      awayTeam: event.away_team,
      ...bestOdds,
    });

    if (isSupabaseConfigured()) {
      const cacheKey = `${sportKey}-${event.home_team}-${event.away_team}`
        .toLowerCase()
        .replace(/\s/g, '-');
      await cacheOdds(
        sportKey,
        cacheKey,
        event.home_team,
        event.away_team,
        bestOdds as unknown as Record<string, unknown>
      );
    }
  }

  return oddsArray;
}

// Legacy function that returns Map (kept for backwards compatibility)
export async function getBatchOdds(sportKey: string): Promise<Map<string, BestOdds>> {
  const oddsMap = new Map<string, BestOdds>();
  const oddsArray = await getBatchOddsAsArray(sportKey);
  
  for (let i = 0; i < oddsArray.length; i++) {
    const o = oddsArray[i];
    oddsMap.set(o.match, {
      homeWin: o.homeWin,
      awayWin: o.awayWin,
      draw: o.draw,
      over: o.over,
      under: o.under,
      homeSpread: o.homeSpread,
      awaySpread: o.awaySpread,
    });
  }
  
  return oddsMap;
}

// ============== FIND ODDS FOR TEAMS ==============

export function findOddsForTeams(
  oddsArray: OddsWithMatch[],
  homeTeam: string,
  awayTeam: string
): OddsWithMatch | null {
  const normalize = (s: string) =>
    s.toLowerCase().replace(/fc|cf|sc|ac|as|ss|us|bv/gi, '').trim();

  // Exact match first
  for (let i = 0; i < oddsArray.length; i++) {
    const o = oddsArray[i];
    if (o.homeTeam === homeTeam && o.awayTeam === awayTeam) {
      return o;
    }
  }

  // Fuzzy match
  for (let i = 0; i < oddsArray.length; i++) {
    const o = oddsArray[i];
    if (
      (normalize(o.homeTeam).includes(normalize(homeTeam)) ||
        normalize(homeTeam).includes(normalize(o.homeTeam))) &&
      (normalize(o.awayTeam).includes(normalize(awayTeam)) ||
        normalize(awayTeam).includes(normalize(o.awayTeam)))
    ) {
      return o;
    }
  }

  // NBA style: match by last word (team nickname)
  const homeWord = homeTeam.split(' ').pop()?.toLowerCase() || '';
  const awayWord = awayTeam.split(' ').pop()?.toLowerCase() || '';
  for (let i = 0; i < oddsArray.length; i++) {
    const o = oddsArray[i];
    if (
      o.match.toLowerCase().includes(homeWord) &&
      o.match.toLowerCase().includes(awayWord)
    ) {
      return o;
    }
  }

  return null;
}

// ============== GET ODDS FOR MATCH ==============

export async function getOddsForMatch(
  homeTeam: string,
  awayTeam: string,
  sportKey: string
): Promise<BestOdds | null> {
  // Check cache first
  if (isSupabaseConfigured()) {
    const cacheKey = `${sportKey}-${homeTeam}-${awayTeam}`
      .toLowerCase()
      .replace(/\s/g, '-');
    const cached = await getCachedOdds(cacheKey);
    if (cached) return cached as unknown as BestOdds;
  }

  const oddsArray = await getBatchOddsAsArray(sportKey);
  const found = findOddsForTeams(oddsArray, homeTeam, awayTeam);
  return found || null;
}

// ============== COMPARE ODDS ==============

export function compareOdds(
  ourOdds: number,
  bookmakerOdds: number
): { edge: number; value: 'STRONG' | 'GOOD' | 'FAIR' | 'POOR' } {
  const edge = ((1 / bookmakerOdds) - (1 / ourOdds)) * 100;
  const value: 'STRONG' | 'GOOD' | 'FAIR' | 'POOR' =
    edge >= 10 ? 'STRONG' : edge >= 5 ? 'GOOD' : edge >= 0 ? 'FAIR' : 'POOR';
  return { edge: +edge.toFixed(1), value };
}

export function getSportKeyForLeague(leagueId: number, sport: string): string {
  if (LEAGUE_TO_SPORT_KEY[leagueId]) return LEAGUE_TO_SPORT_KEY[leagueId];
  if (sport === 'BASKETBALL') return SPORT_KEYS.NBA;
  if (sport === 'TENNIS') return SPORT_KEYS.ATP;
  return SPORT_KEYS.EPL;
}