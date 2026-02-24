// =============================================================
// FILE: lib/odds-api.ts (FULLY FIXED VERSION)
// =============================================================
//
// FIXES APPLIED:
// ✅ Accent stripping in normalize() (Famalicão, Alavés, etc.)
// ✅ MISSING_ALIASES merged INTO TEAM_ALIASES (was wrongly a dead local variable)
// ✅ Slash handling in getKeyWord for Bodo/Glimt etc.
// ✅ Tennis sport keys changed to generic fallbacks
// ✅ All previous fixes preserved

import {
  cacheOdds,
  getCachedOdds,
  trackApiUsage,
  isSupabaseConfigured,
} from './supabase';

const API_KEY = process.env.ODDS_API_KEY || process.env.THE_ODDS_API_KEY || '';
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
  homeWin: { odds: number; impliedProb: number; bookmaker: string } | null;
  awayWin: { odds: number; impliedProb: number; bookmaker: string } | null;
  draw: { odds: number; impliedProb: number; bookmaker: string } | null;
  over: { line: number; odds: number; impliedProb: number; bookmaker: string } | null;
  under: { line: number; odds: number; impliedProb: number; bookmaker: string } | null;
  homeSpread: { line: number; odds: number; impliedProb: number; bookmaker: string } | null;
  awaySpread: { line: number; odds: number; impliedProb: number; bookmaker: string } | null;
}

export interface OddsWithMatch extends BestOdds {
  match: string;
  homeTeam: string;
  awayTeam: string;
}

// ============== SPORT KEYS ==============

export const SPORT_KEYS: { [key: string]: string } = {
  // England
  EPL: 'soccer_epl',
  CHAMPIONSHIP: 'soccer_efl_champ',
  LEAGUE_ONE: 'soccer_england_league1',
  LEAGUE_TWO: 'soccer_england_league2',
  FA_CUP: 'soccer_fa_cup',
  LEAGUE_CUP: 'soccer_england_efl_cup',

  // Spain
  LA_LIGA: 'soccer_spain_la_liga',
  SEGUNDA: 'soccer_spain_segunda_division',
  COPA_DEL_REY: 'soccer_spain_copa_del_rey',

  // Italy
  SERIE_A: 'soccer_italy_serie_a',
  SERIE_B: 'soccer_italy_serie_b',
  COPPA_ITALIA: 'soccer_italy_coppa_italia',

  // Germany
  BUNDESLIGA: 'soccer_germany_bundesliga',
  BUNDESLIGA_2: 'soccer_germany_bundesliga2',
  DFB_POKAL: 'soccer_germany_dfb_pokal',

  // France
  LIGUE_1: 'soccer_france_ligue_one',
  LIGUE_2: 'soccer_france_ligue_two',
  COUPE_DE_FRANCE: 'soccer_france_coupe_de_france',

  // Other European
  EREDIVISIE: 'soccer_netherlands_eredivisie',
  PRIMEIRA_LIGA: 'soccer_portugal_primeira_liga',
  BELGIAN_PRO: 'soccer_belgium_first_div',
  TURKISH_SUPER: 'soccer_turkey_super_league',
  SCOTTISH_PREM: 'soccer_spl',
  SWISS_SUPER: 'soccer_switzerland_superleague',
  AUSTRIAN_BUNDESLIGA: 'soccer_austria_bundesliga',
  GREEK_SUPER: 'soccer_greece_super_league',

  // European competitions
  CHAMPIONS_LEAGUE: 'soccer_uefa_champs_league',
  EUROPA_LEAGUE: 'soccer_uefa_europa_league',
  CONFERENCE_LEAGUE: 'soccer_uefa_europa_conference_league',

  // Americas
  MLS: 'soccer_usa_mls',
  BRAZIL_SERIE_A: 'soccer_brazil_campeonato',
  ARGENTINA_PRIMERA: 'soccer_argentina_primera_division',

  // Basketball
  NBA: 'basketball_nba',
  EUROLEAGUE: 'basketball_euroleague',

  // Tennis — generic fallbacks (actual discovery happens in tennis.ts via /v4/sports)
  ATP: 'tennis_atp',
  WTA: 'tennis_wta',
};

// ============== LEAGUE TO SPORT KEY ==============

export const LEAGUE_TO_SPORT_KEY: { [key: number]: string } = {
  39: SPORT_KEYS.EPL,
  40: SPORT_KEYS.CHAMPIONSHIP,
  45: SPORT_KEYS.FA_CUP,
  48: SPORT_KEYS.LEAGUE_CUP,

  140: SPORT_KEYS.LA_LIGA,
  141: SPORT_KEYS.SEGUNDA,
  143: SPORT_KEYS.COPA_DEL_REY,

  135: SPORT_KEYS.SERIE_A,
  136: SPORT_KEYS.SERIE_B,
  137: SPORT_KEYS.COPPA_ITALIA,

  78: SPORT_KEYS.BUNDESLIGA,
  79: SPORT_KEYS.BUNDESLIGA_2,
  81: SPORT_KEYS.DFB_POKAL,

  61: SPORT_KEYS.LIGUE_1,
  62: SPORT_KEYS.LIGUE_2,
  66: SPORT_KEYS.COUPE_DE_FRANCE,

  88: SPORT_KEYS.EREDIVISIE,
  94: SPORT_KEYS.PRIMEIRA_LIGA,
  144: SPORT_KEYS.BELGIAN_PRO,
  203: SPORT_KEYS.TURKISH_SUPER,
  179: SPORT_KEYS.SCOTTISH_PREM,
  207: SPORT_KEYS.SWISS_SUPER,
  218: SPORT_KEYS.AUSTRIAN_BUNDESLIGA,
  197: SPORT_KEYS.GREEK_SUPER,

  2: SPORT_KEYS.CHAMPIONS_LEAGUE,
  3: SPORT_KEYS.EUROPA_LEAGUE,
  848: SPORT_KEYS.CONFERENCE_LEAGUE,

  253: SPORT_KEYS.MLS,
  71: SPORT_KEYS.BRAZIL_SERIE_A,
  128: SPORT_KEYS.ARGENTINA_PRIMERA,

  12: SPORT_KEYS.NBA,
  120: SPORT_KEYS.EUROLEAGUE,
};

export function isOddsApiConfigured(): boolean {
  return API_KEY.length > 20;
}

// ============== API CALLS ==============

async function fetchOddsApi<T>(endpoint: string): Promise<T | null> {
  if (!isOddsApiConfigured()) {
    console.log('[Odds API] No API key configured');
    return null;
  }

  try {
    const url = `${BASE_URL}${endpoint}${endpoint.includes('?') ? '&' : '?'}apiKey=${API_KEY}`;
    console.log(`[Odds API] Fetching: ${endpoint}`);

    const response = await fetch(url);

    if (!response.ok) {
      console.log(`[Odds API] HTTP Error: ${response.status}`);
      return null;
    }

    if (isSupabaseConfigured()) {
      await trackApiUsage('the_odds_api', endpoint.split('?')[0]);
    }

    const remaining = response.headers.get('x-requests-remaining');
    const used = response.headers.get('x-requests-used');
    console.log(`[Odds API] Requests - Remaining: ${remaining}, Used: ${used}`);

    const data = await response.json();

    if (Array.isArray(data) && data.length === 0) {
      console.log(`[Odds API] Empty results for ${endpoint}`);
    }

    return data;
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

      if (market.key === 'h2h') {
        for (let o = 0; o < market.outcomes.length; o++) {
          const outcome = market.outcomes[o];
          const impliedProb = 1 / outcome.price;

          if (outcome.name === event.home_team) {
            if (!result.homeWin || outcome.price > result.homeWin.odds) {
              result.homeWin = { odds: outcome.price, impliedProb, bookmaker: bookmaker.title };
            }
          } else if (outcome.name === event.away_team) {
            if (!result.awayWin || outcome.price > result.awayWin.odds) {
              result.awayWin = { odds: outcome.price, impliedProb, bookmaker: bookmaker.title };
            }
          } else if (outcome.name === 'Draw') {
            if (!result.draw || outcome.price > result.draw.odds) {
              result.draw = { odds: outcome.price, impliedProb, bookmaker: bookmaker.title };
            }
          }
        }
      }

      if (market.key === 'totals') {
        for (let o = 0; o < market.outcomes.length; o++) {
          const outcome = market.outcomes[o];
          const impliedProb = 1 / outcome.price;

          if (outcome.name === 'Over' && outcome.point) {
            if (!result.over || outcome.price > result.over.odds) {
              result.over = { line: outcome.point, odds: outcome.price, impliedProb, bookmaker: bookmaker.title };
            }
          } else if (outcome.name === 'Under' && outcome.point) {
            if (!result.under || outcome.price > result.under.odds) {
              result.under = { line: outcome.point, odds: outcome.price, impliedProb, bookmaker: bookmaker.title };
            }
          }
        }
      }

      if (market.key === 'spreads') {
        for (let o = 0; o < market.outcomes.length; o++) {
          const outcome = market.outcomes[o];
          const impliedProb = 1 / outcome.price;

          if (outcome.name === event.home_team && outcome.point !== undefined) {
            if (!result.homeSpread || outcome.price > result.homeSpread.odds) {
              result.homeSpread = { line: outcome.point, odds: outcome.price, impliedProb, bookmaker: bookmaker.title };
            }
          } else if (outcome.name === event.away_team && outcome.point !== undefined) {
            if (!result.awaySpread || outcome.price > result.awaySpread.odds) {
              result.awaySpread = { line: outcome.point, odds: outcome.price, impliedProb, bookmaker: bookmaker.title };
            }
          }
        }
      }
    }
  }

  return result;
}

// ============== BATCH ODDS AS ARRAY ==============

export async function getBatchOddsAsArray(sportKey: string): Promise<OddsWithMatch[]> {
  const oddsArray: OddsWithMatch[] = [];
  if (!isOddsApiConfigured()) return oddsArray;

  const events = await getOddsForSport(sportKey);
  if (!events || events.length === 0) {
    console.log(`[Odds] No events returned for ${sportKey}`);
    return oddsArray;
  }

  console.log(`[Odds] Found ${events.length} events for ${sportKey}`);

  for (let i = 0; i < events.length; i++) {
    const event = events[i];

    if (!event.bookmakers || event.bookmakers.length === 0) {
      console.log(`[Odds] No bookmakers for ${event.home_team} vs ${event.away_team}`);
      continue;
    }

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

  if (oddsArray.length > 0) {
    console.log(`[Odds] Available matches for ${sportKey}:`);
    oddsArray.forEach(o => console.log(`  - ${o.homeTeam} vs ${o.awayTeam}`));
  }

  return oddsArray;
}

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

// ==========================================================================
// TEAM NAME ALIASES
// ✅ FIX: All aliases in ONE object at module scope (not inside a function)
// ==========================================================================

const TEAM_ALIASES: Record<string, string[]> = {
  // PSG
  'paris saint germain': ['paris saint-germain', 'paris sg', 'psg', 'paris'],
  'paris saint-germain': ['paris saint germain', 'paris sg', 'psg', 'paris'],

  // English teams
  'manchester united': ['man united', 'man utd', 'manchester utd', 'mufc'],
  'manchester city': ['man city', 'manchester c', 'mcfc'],
  'tottenham': ['tottenham hotspur', 'spurs', 'tottenham h'],
  'newcastle': ['newcastle united', 'newcastle utd', 'nufc'],
  'west brom': ['west bromwich', 'west bromwich albion', 'wba'],
  'brighton': ['brighton and hove albion', 'brighton & hove albion', 'brighton hove albion'],
  'nottingham forest': ["nott'm forest", 'nottm forest', 'forest'],
  'west ham': ['west ham united', 'west ham utd'],
  'qpr': ['queens park rangers'],                           // ✅ NEW
  'queens park rangers': ['qpr'],                            // ✅ NEW
  'dundee utd': ['dundee united'],                           // ✅ NEW
  'dundee united': ['dundee utd'],                           // ✅ NEW

  // French teams
  'lille': ['losc', 'losc lille', 'lille osc'],
  'monaco': ['as monaco', 'as monaco fc'],
  'lyon': ['olympique lyonnais', 'olympique lyon', 'ol'],
  'marseille': ['olympique marseille', 'olympique de marseille', 'om'],

  // Spanish teams
  'barcelona': ['fc barcelona', 'barcelona fc'],
  'real madrid': ['real madrid cf'],
  'atletico madrid': ['atletico de madrid', 'atlético madrid', 'atlético de madrid', 'atleti'],
  'athletic bilbao': ['athletic club', 'athletic club bilbao'],
  'real sociedad': ['real sociedad san sebastian'],
  'real sociedad ii': ['real sociedad b'],                   // ✅ NEW
  'real sociedad b': ['real sociedad ii', 'real sociedad reservas'], // ✅ NEW
  'real betis': ['real betis balompie', 'betis'],
  'celta vigo': ['rc celta', 'celta de vigo'],
  'deportivo alaves': ['alaves', 'cd alaves'],
  'rayo vallecano': ['rayo vallecano de madrid'],
  'espanyol': ['rcd espanyol', 'espanyol barcelona'],
  'girona': ['girona fc'],

  // Italian teams
  'inter': ['inter milan', 'fc internazionale', 'internazionale'],
  'inter milan': ['inter', 'fc internazionale'],             // ✅ NEW (bidirectional)
  'ac milan': ['milan', 'ac milan'],
  'as roma': ['roma'],
  'napoli': ['ssc napoli'],
  'juventus': ['juventus fc'],
  'lazio': ['ss lazio'],
  'atalanta': ['atalanta bc'],
  'pisa': ['pisa sc', 'ac pisa'],
  'sampdoria': ['uc sampdoria'],

  // German teams
  'bayern munich': ['fc bayern munich', 'bayern munchen', 'fc bayern', 'bayern münchen'],
  'borussia dortmund': ['bvb', 'dortmund'],
  'rb leipzig': ['rasenballsport leipzig', 'leipzig'],
  'werder bremen': ['sv werder bremen'],
  'eintracht frankfurt': ['frankfurt', 'sge'],
  '1. fc nürnberg': ['nurnberg', 'fc nürnberg', 'fc nurnberg', '1 fc nurnberg', 'nürnberg'],
  'fortuna düsseldorf': ['dusseldorf', 'fortuna dusseldorf', 'düsseldorf'],
  'dynamo dresden': ['sg dynamo dresden', 'dresden'],
  'eintracht braunschweig': ['braunschweig'],

  // Portuguese teams
  'sporting cp': ['sporting lisbon', 'sporting', 'sporting clube de portugal'],
  'benfica': ['sl benfica'],
  'porto': ['fc porto'],

  // Scottish teams
  'celtic': ['celtic fc'],
  'rangers': ['rangers fc'],

  // ============ NEW: Previously failing matches from logs ============

  // Argentine teams
  'instituto cordoba': ['instituto de cordoba', 'instituto de córdoba', 'instituto ac de córdoba'],
  'central cordoba de santiago': ['central cordoba', 'central córdoba'],
  'talleres cordoba': ['talleres', 'talleres de córdoba'],
  'union santa fe': ['union de santa fe', 'unión santa fe', 'unión de santa fe'],
  'aldosivi': ['aldosivi mar del plata'],
  'aldosivi mar del plata': ['aldosivi'],

  // MLS teams
  'seattle sounders': ['seattle sounders fc'],
  'seattle sounders fc': ['seattle sounders'],
  'colorado rapids': ['colorado'],

  // European teams with special characters
  'qarabag': ['qarabag fk', 'qarabağ fk', 'qarabağ'],
  'bodo/glimt': ['bodø/glimt', 'bodo glimt', 'bodoe/glimt'],
  'bodø/glimt': ['bodo/glimt', 'bodo glimt'],

  // Turkish teams
  'kasimpasa': ['kasimpasa sk', 'kasımpaşa', 'kasımpaşa sk'],
  'kasimpasa sk': ['kasimpasa', 'kasımpaşa'],
  'fenerbahce': ['fenerbahçe', 'fenerbahce sk'],
  'fenerbahçe': ['fenerbahce', 'fenerbahce sk'],
};

// ============== FIND ODDS FOR TEAMS ==============

export function findOddsForTeams(
  oddsArray: OddsWithMatch[],
  homeTeam: string,
  awayTeam: string
): OddsWithMatch | null {
  const getAliases = (team: string): string[] => {
    const lower = team.toLowerCase();
    const aliases = [lower];

    if (TEAM_ALIASES[lower]) {
      aliases.push(...TEAM_ALIASES[lower]);
    }

    for (const [main, alts] of Object.entries(TEAM_ALIASES)) {
      if (alts.some(a => a === lower || lower.includes(a) || a.includes(lower))) {
        aliases.push(main);
        aliases.push(...alts);
      }
    }

    return Array.from(new Set(aliases));
  };

  // ✅ FIX: Accent stripping via NFD normalization
  const normalize = (s: string) =>
    s.toLowerCase()
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '') // Strip accents: é→e, ã→a, ç→c, etc.
      .replace(/\b(fc|cf|sc|ac|as|ss|us|bv|cd|ud|sd|rc|rcd|real|atletico|athletic|sporting)\b/gi, '')
      .replace(/\b(de|del|la|las|los|el|di|da|della|delle|dei|degli)\b/gi, '')
      .replace(/\s+/g, ' ')
      .trim();

  // ✅ FIX: Handle slashes in team names (Bodo/Glimt)
  const getKeyWord = (s: string) => {
    const words = normalize(s)
      .replace(/\//g, ' ')
      .split(' ')
      .filter(w => w.length > 2);
    return words[words.length - 1] || words[0] || s.toLowerCase();
  };

  const homeAliases = getAliases(homeTeam);
  const awayAliases = getAliases(awayTeam);

  // 1. Exact match
  for (let i = 0; i < oddsArray.length; i++) {
    const o = oddsArray[i];
    if (o.homeTeam === homeTeam && o.awayTeam === awayTeam) {
      console.log(`[Odds Match] Exact: ${homeTeam} vs ${awayTeam}`);
      return o;
    }
  }

  // 2. Case-insensitive
  const homeLower = homeTeam.toLowerCase();
  const awayLower = awayTeam.toLowerCase();

  for (let i = 0; i < oddsArray.length; i++) {
    const o = oddsArray[i];
    if (o.homeTeam.toLowerCase() === homeLower && o.awayTeam.toLowerCase() === awayLower) {
      console.log(`[Odds Match] Case-insensitive: ${homeTeam} vs ${awayTeam}`);
      return o;
    }
  }

  // 3. Normalized (accent-stripped) match
  const normHome = normalize(homeTeam);
  const normAway = normalize(awayTeam);

  for (let i = 0; i < oddsArray.length; i++) {
    const o = oddsArray[i];
    const oNormHome = normalize(o.homeTeam);
    const oNormAway = normalize(o.awayTeam);

    if (
      (oNormHome.includes(normHome) || normHome.includes(oNormHome)) &&
      (oNormAway.includes(normAway) || normAway.includes(oNormAway))
    ) {
      console.log(`[Odds Match] Fuzzy: "${homeTeam}" ≈ "${o.homeTeam}", "${awayTeam}" ≈ "${o.awayTeam}"`);
      return o;
    }
  }

  // 4. Keyword match
  const homeKey = getKeyWord(homeTeam);
  const awayKey = getKeyWord(awayTeam);

  for (let i = 0; i < oddsArray.length; i++) {
    const o = oddsArray[i];
    const oHomeKey = getKeyWord(o.homeTeam);
    const oAwayKey = getKeyWord(o.awayTeam);

    if (
      (oHomeKey === homeKey || oHomeKey.includes(homeKey) || homeKey.includes(oHomeKey)) &&
      (oAwayKey === awayKey || oAwayKey.includes(awayKey) || awayKey.includes(oAwayKey))
    ) {
      console.log(`[Odds Match] Keyword: "${homeKey}" ≈ "${oHomeKey}", "${awayKey}" ≈ "${oAwayKey}"`);
      return o;
    }
  }

  // 5. Alias-based match
  for (let i = 0; i < oddsArray.length; i++) {
    const o = oddsArray[i];
    const oHomeLower = o.homeTeam.toLowerCase();
    const oAwayLower = o.awayTeam.toLowerCase();

    const homeMatch = homeAliases.some(alias =>
      oHomeLower.includes(alias) || alias.includes(oHomeLower)
    );
    const awayMatch = awayAliases.some(alias =>
      oAwayLower.includes(alias) || alias.includes(oAwayLower)
    );

    if (homeMatch && awayMatch) {
      console.log(`[Odds Match] Alias: "${homeTeam}" ≈ "${o.homeTeam}", "${awayTeam}" ≈ "${o.awayTeam}"`);
      return o;
    }
  }

  // 6. Last word (nickname) match
  const homeWord = homeTeam.split(' ').pop()?.toLowerCase() || '';
  const awayWord = awayTeam.split(' ').pop()?.toLowerCase() || '';
  for (let i = 0; i < oddsArray.length; i++) {
    const o = oddsArray[i];
    if (
      o.match.toLowerCase().includes(homeWord) &&
      o.match.toLowerCase().includes(awayWord)
    ) {
      console.log(`[Odds Match] Last word: "${homeWord}" & "${awayWord}" in "${o.match}"`);
      return o;
    }
  }

  console.log(`[Odds] No match found for "${homeTeam}" vs "${awayTeam}"`);
  return null;
}

// ============== GET ODDS FOR MATCH ==============

export async function getOddsForMatch(
  homeTeam: string,
  awayTeam: string,
  sportKey: string
): Promise<BestOdds | null> {
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

// ============== EDGE CALCULATION ==============

export interface EdgeResult {
  edge: number;
  impliedProbability: number;
  value: 'STRONG' | 'GOOD' | 'FAIR' | 'POOR' | 'TRAP';
  recommendation: 'BET' | 'CONSIDER' | 'SKIP' | 'AVOID';
}

export function calculateEdge(ourProbability: number, bookmakerOdds: number): EdgeResult {
  if (bookmakerOdds <= 1) {
    return { edge: 0, impliedProbability: 0, value: 'POOR', recommendation: 'SKIP' };
  }

  const impliedProbability = 1 / bookmakerOdds;
  const edge = (ourProbability - impliedProbability) * 100;

  let value: 'STRONG' | 'GOOD' | 'FAIR' | 'POOR' | 'TRAP';
  let recommendation: 'BET' | 'CONSIDER' | 'SKIP' | 'AVOID';

  if (edge >= 10) { value = 'STRONG'; recommendation = 'BET'; }
  else if (edge >= 5) { value = 'GOOD'; recommendation = 'BET'; }
  else if (edge >= 2) { value = 'FAIR'; recommendation = 'CONSIDER'; }
  else if (edge >= 0) { value = 'POOR'; recommendation = 'SKIP'; }
  else if (edge >= -5) { value = 'POOR'; recommendation = 'AVOID'; }
  else { value = 'TRAP'; recommendation = 'AVOID'; }

  return { edge: Math.round(edge * 10) / 10, impliedProbability, value, recommendation };
}

export function compareOdds(
  ourOdds: number,
  bookmakerOdds: number
): { edge: number; value: 'STRONG' | 'GOOD' | 'FAIR' | 'POOR' } {
  const ourProbability = 1 / ourOdds;
  const result = calculateEdge(ourProbability, bookmakerOdds);
  const value: 'STRONG' | 'GOOD' | 'FAIR' | 'POOR' =
    result.value === 'TRAP' ? 'POOR' : result.value;
  return { edge: result.edge, value };
}

// ============== HELPER FUNCTIONS ==============

export function getSportKeyForLeague(leagueId: number, sport: string): string {
  if (LEAGUE_TO_SPORT_KEY[leagueId]) return LEAGUE_TO_SPORT_KEY[leagueId];
  if (sport === 'BASKETBALL') return SPORT_KEYS.NBA;
  if (sport === 'TENNIS') return SPORT_KEYS.ATP;
  return SPORT_KEYS.EPL;
}

export function oddsToFormats(decimalOdds: number): {
  decimal: number;
  fractional: string;
  american: string;
  impliedProbability: number;
} {
  const impliedProbability = 1 / decimalOdds;

  const frac = decimalOdds - 1;
  const fractional = frac >= 1
    ? `${Math.round(frac)}/1`
    : `1/${Math.round(1 / frac)}`;

  let american: string;
  if (decimalOdds >= 2) {
    american = `+${Math.round((decimalOdds - 1) * 100)}`;
  } else {
    american = `${Math.round(-100 / (decimalOdds - 1))}`;
  }

  return {
    decimal: decimalOdds,
    fractional,
    american,
    impliedProbability: Math.round(impliedProbability * 1000) / 10,
  };
}