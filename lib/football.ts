/**
 * Football API - v9 (REAL TEAM STATS FROM API-SPORTS)
 * File: lib/football-api.ts
 *
 * FIX 1: getCurrentSeason() caps at 2024 (free plan limit)
 * FIX 2: Only call /teams/statistics for TOP_5_LEAGUES.
 *         27 fixtures × 2 calls = 54 requests → hits 10/min cap immediately.
 *         Top-5 leagues typically have 5–8 fixtures max → ~16 calls, stays safe.
 *         All other leagues fall back to tier data instantly.
 */

const API_KEY = process.env.SPORTS_API_KEY || '';
const API_HOST = 'v3.football.api-sports.io';

export interface FootballFixture {
  id: string;
  externalId: number;
  league: { id: number; name: string; country: string; logo: string };
  homeTeam: { id: number; name: string; logo: string };
  awayTeam: { id: number; name: string; logo: string };
  kickoff: Date;
  venue: string;
  status: string;
}

interface TeamStats {
  goalsFor: number;
  goalsAgainst: number;
  cornersFor: number;
  cornersAgainst: number;
  form: string;
  gamesPlayed: number;
  source: 'API' | 'TEAM_TIER' | 'FALLBACK';
}

export interface BookmakerOdds {
  market: string;
  line?: number;
  odds: number;
  bookmaker: string;
}

export interface FootballSuggestion {
  fixture: FootballFixture;
  market: string;
  pick: string;
  probability: number;
  confidence: number;
  edge: number;
  impliedProbability?: number;
  bookmakerOdds?: number;
  bookmaker?: string;
  risk: 'LOW' | 'MEDIUM' | 'HIGH';
  reasoning: string[];
  warnings: string[];
  category: 'LOW_RISK' | 'VALUE' | 'SPECULATIVE' | 'NO_BET';
  dataQuality: 'HIGH' | 'MEDIUM' | 'LOW' | 'FALLBACK';
  modelAgreement: number;
}

export const TOP_LEAGUES = [
  { id: 39, name: 'Premier League', country: 'England' },
  { id: 40, name: 'Championship', country: 'England' },
  { id: 45, name: 'FA Cup', country: 'England' },
  { id: 48, name: 'League Cup', country: 'England' },
  { id: 140, name: 'La Liga', country: 'Spain' },
  { id: 141, name: 'La Liga 2', country: 'Spain' },
  { id: 143, name: 'Copa del Rey', country: 'Spain' },
  { id: 135, name: 'Serie A', country: 'Italy' },
  { id: 136, name: 'Serie B', country: 'Italy' },
  { id: 137, name: 'Coppa Italia', country: 'Italy' },
  { id: 78, name: 'Bundesliga', country: 'Germany' },
  { id: 79, name: '2. Bundesliga', country: 'Germany' },
  { id: 81, name: 'DFB Pokal', country: 'Germany' },
  { id: 61, name: 'Ligue 1', country: 'France' },
  { id: 62, name: 'Ligue 2', country: 'France' },
  { id: 66, name: 'Coupe de France', country: 'France' },
  { id: 88, name: 'Eredivisie', country: 'Netherlands' },
  { id: 94, name: 'Primeira Liga', country: 'Portugal' },
  { id: 144, name: 'Belgian Pro League', country: 'Belgium' },
  { id: 203, name: 'Turkish Super Lig', country: 'Turkey' },
  { id: 179, name: 'Scottish Premiership', country: 'Scotland' },
  { id: 207, name: 'Swiss Super League', country: 'Switzerland' },
  { id: 218, name: 'Austrian Bundesliga', country: 'Austria' },
  { id: 197, name: 'Greek Super League', country: 'Greece' },
  { id: 2, name: 'Champions League', country: 'Europe' },
  { id: 3, name: 'Europa League', country: 'Europe' },
  { id: 848, name: 'Conference League', country: 'Europe' },
  { id: 253, name: 'MLS', country: 'USA' },
  { id: 71, name: 'Brasileirao', country: 'Brazil' },
  { id: 128, name: 'Argentine Primera', country: 'Argentina' },
];

const TOP_LEAGUE_IDS = TOP_LEAGUES.map(l => l.id);

const LEAGUE_AVERAGES: Record<number, { goals: number; corners: number; variance: number }> = {
  39: { goals: 1.4, corners: 5.2, variance: 0.3 },
  40: { goals: 1.3, corners: 5.0, variance: 0.35 },
  45: { goals: 1.4, corners: 5.0, variance: 0.38 },
  48: { goals: 1.4, corners: 5.0, variance: 0.35 },
  140: { goals: 1.3, corners: 5.1, variance: 0.28 },
  141: { goals: 1.2, corners: 4.8, variance: 0.32 },
  143: { goals: 1.5, corners: 5.0, variance: 0.35 },
  135: { goals: 1.4, corners: 5.3, variance: 0.3 },
  136: { goals: 1.2, corners: 4.9, variance: 0.35 },
  137: { goals: 1.4, corners: 5.1, variance: 0.35 },
  78: { goals: 1.5, corners: 5.0, variance: 0.32 },
  79: { goals: 1.4, corners: 4.8, variance: 0.35 },
  81: { goals: 1.5, corners: 5.0, variance: 0.35 },
  61: { goals: 1.4, corners: 5.1, variance: 0.3 },
  62: { goals: 1.3, corners: 4.9, variance: 0.35 },
  66: { goals: 1.4, corners: 5.0, variance: 0.35 },
  88: { goals: 1.5, corners: 5.3, variance: 0.35 },
  94: { goals: 1.3, corners: 5.0, variance: 0.3 },
  144: { goals: 1.4, corners: 5.2, variance: 0.33 },
  203: { goals: 1.4, corners: 5.1, variance: 0.35 },
  179: { goals: 1.4, corners: 5.1, variance: 0.32 },
  207: { goals: 1.4, corners: 5.0, variance: 0.35 },
  218: { goals: 1.5, corners: 5.2, variance: 0.35 },
  197: { goals: 1.3, corners: 5.0, variance: 0.35 },
  2: { goals: 1.4, corners: 5.2, variance: 0.25 },
  3: { goals: 1.3, corners: 5.0, variance: 0.28 },
  848: { goals: 1.2, corners: 4.8, variance: 0.35 },
  253: { goals: 1.4, corners: 4.8, variance: 0.38 },
  71: { goals: 1.3, corners: 4.9, variance: 0.35 },
  128: { goals: 1.2, corners: 4.7, variance: 0.38 },
};

const TEAM_TIERS: Record<string, 'ELITE' | 'STRONG' | 'AVERAGE' | 'WEAK'> = {
  'Manchester City': 'ELITE', 'Arsenal': 'ELITE', 'Liverpool': 'ELITE',
  'Manchester United': 'STRONG', 'Chelsea': 'STRONG', 'Tottenham': 'STRONG',
  'Newcastle': 'STRONG', 'Aston Villa': 'STRONG', 'Brighton': 'STRONG',
  'West Ham': 'AVERAGE', 'Brentford': 'AVERAGE', 'Crystal Palace': 'AVERAGE',
  'Fulham': 'AVERAGE', 'Wolves': 'AVERAGE', 'Bournemouth': 'AVERAGE',
  'Nottingham Forest': 'AVERAGE', 'Everton': 'WEAK', 'Luton': 'WEAK',
  'Burnley': 'WEAK', 'Sheffield United': 'WEAK', 'Ipswich': 'WEAK',
  'Leicester': 'STRONG', 'Leicester City': 'STRONG', 'Southampton': 'WEAK',
  'Leeds': 'STRONG', 'West Brom': 'AVERAGE', 'Middlesbrough': 'AVERAGE',
  'Coventry': 'AVERAGE', 'Watford': 'AVERAGE', 'Millwall': 'AVERAGE',
  'Blackburn': 'AVERAGE', 'Sunderland': 'AVERAGE', 'Norwich': 'AVERAGE',
  'Hull': 'AVERAGE', 'Bristol City': 'AVERAGE', 'Preston': 'WEAK',
  'Stoke': 'WEAK', 'Plymouth': 'WEAK', 'Sheffield Wednesday': 'WEAK',
  'Cardiff': 'WEAK', 'Rotherham': 'WEAK', 'Huddersfield': 'WEAK',
  'Real Madrid': 'ELITE', 'Barcelona': 'ELITE', 'Atletico Madrid': 'STRONG',
  'Athletic Bilbao': 'STRONG', 'Real Sociedad': 'STRONG', 'Real Betis': 'STRONG',
  'Villarreal': 'STRONG', 'Sevilla': 'AVERAGE', 'Valencia': 'AVERAGE',
  'Getafe': 'AVERAGE', 'Girona': 'STRONG', 'Osasuna': 'AVERAGE',
  'Celta Vigo': 'AVERAGE', 'Mallorca': 'AVERAGE', 'Rayo Vallecano': 'AVERAGE',
  'Las Palmas': 'AVERAGE', 'Alaves': 'WEAK', 'Cadiz': 'WEAK',
  'Granada': 'WEAK', 'Almeria': 'WEAK', 'Espanyol': 'WEAK',
  'Leganes': 'AVERAGE', 'Leganés': 'AVERAGE', 'Eibar': 'AVERAGE',
  'Valladolid': 'AVERAGE', 'Zaragoza': 'AVERAGE', 'Sporting Gijon': 'AVERAGE',
  'Oviedo': 'AVERAGE', 'Racing Santander': 'AVERAGE', 'Elche': 'AVERAGE',
  'Huesca': 'AVERAGE', 'Castellón': 'WEAK', 'Castellon': 'WEAK',
  'CD Castellón': 'WEAK', 'Burgos': 'WEAK', 'Mirandes': 'WEAK',
  'Albacete': 'WEAK', 'Andorra': 'WEAK',
  'Inter': 'ELITE', 'Inter Milan': 'ELITE', 'Juventus': 'STRONG',
  'AC Milan': 'STRONG', 'Milan': 'STRONG', 'Napoli': 'STRONG',
  'Roma': 'STRONG', 'AS Roma': 'STRONG', 'Lazio': 'STRONG', 'Atalanta': 'STRONG',
  'Fiorentina': 'AVERAGE', 'Bologna': 'AVERAGE', 'Torino': 'AVERAGE',
  'Monza': 'AVERAGE', 'Udinese': 'AVERAGE', 'Sassuolo': 'AVERAGE',
  'Genoa': 'AVERAGE', 'Lecce': 'WEAK', 'Empoli': 'WEAK', 'Cagliari': 'WEAK',
  'Verona': 'WEAK', 'Hellas Verona': 'WEAK', 'Frosinone': 'WEAK',
  'Salernitana': 'WEAK', 'Como': 'WEAK', 'Parma': 'AVERAGE',
  'Cremonese': 'AVERAGE', 'Palermo': 'AVERAGE', 'Sampdoria': 'AVERAGE',
  'Venezia': 'AVERAGE', 'Bari': 'AVERAGE', 'Brescia': 'AVERAGE',
  'Pisa': 'WEAK', 'Spezia': 'WEAK', 'Catanzaro': 'WEAK', 'Modena': 'WEAK',
  'Reggiana': 'WEAK', 'Südtirol': 'WEAK', 'Virtus Entella': 'WEAK',
  'Bayern Munich': 'ELITE', 'Bayern München': 'ELITE', 'Bayer Leverkusen': 'ELITE',
  'Borussia Dortmund': 'STRONG', 'RB Leipzig': 'STRONG', 'Stuttgart': 'STRONG',
  'Eintracht Frankfurt': 'STRONG', 'Wolfsburg': 'AVERAGE', 'Freiburg': 'AVERAGE',
  'Hoffenheim': 'AVERAGE', 'Werder Bremen': 'AVERAGE', 'Augsburg': 'AVERAGE',
  'Borussia Monchengladbach': 'AVERAGE', 'Union Berlin': 'AVERAGE', 'Mainz': 'AVERAGE',
  'Bochum': 'WEAK', 'Heidenheim': 'WEAK', 'Köln': 'WEAK', 'Darmstadt': 'WEAK',
  'Hamburg': 'STRONG', 'Fortuna Düsseldorf': 'AVERAGE', 'Hannover': 'AVERAGE',
  'Kaiserslautern': 'AVERAGE', 'Nürnberg': 'AVERAGE', '1. FC Nürnberg': 'AVERAGE',
  'Karlsruher': 'AVERAGE', 'Karlsruher SC': 'AVERAGE', 'Hertha Berlin': 'AVERAGE',
  'Paderborn': 'AVERAGE', 'Greuther Fürth': 'AVERAGE', 'SpVgg Greuther Fürth': 'AVERAGE',
  'Elversberg': 'WEAK', 'SV Elversberg': 'WEAK', 'Magdeburg': 'WEAK',
  '1. FC Magdeburg': 'WEAK', 'Eintracht Braunschweig': 'WEAK', 'Wehen Wiesbaden': 'WEAK',
  'Osnabrück': 'WEAK', 'Preußen Münster': 'WEAK', 'Dynamo Dresden': 'WEAK',
  'Arminia Bielefeld': 'WEAK',
  'Paris Saint Germain': 'ELITE', 'Paris Saint-Germain': 'ELITE', 'PSG': 'ELITE',
  'Monaco': 'STRONG', 'AS Monaco': 'STRONG', 'Marseille': 'STRONG',
  'Lyon': 'STRONG', 'Lille': 'STRONG', 'Nice': 'AVERAGE', 'Lens': 'AVERAGE',
  'Rennes': 'AVERAGE', 'Montpellier': 'AVERAGE', 'Toulouse': 'AVERAGE',
  'Reims': 'AVERAGE', 'Strasbourg': 'AVERAGE', 'Nantes': 'AVERAGE',
  'Brest': 'AVERAGE', 'Le Havre': 'WEAK', 'Lorient': 'WEAK', 'Metz': 'WEAK',
  'Clermont': 'WEAK', 'Saint-Etienne': 'AVERAGE', 'Bordeaux': 'AVERAGE',
  'Auxerre': 'AVERAGE', 'Caen': 'AVERAGE', 'Paris FC': 'AVERAGE', 'Angers': 'AVERAGE',
  'Guingamp': 'WEAK', 'Amiens': 'WEAK', 'Pau': 'WEAK', 'PAU': 'WEAK',
  'Laval': 'WEAK', 'Bastia': 'WEAK', 'Troyes': 'WEAK', 'Estac Troyes': 'WEAK',
  'Grenoble': 'WEAK', 'Rodez': 'WEAK', 'Annecy': 'WEAK', 'Dunkerque': 'WEAK',
  'Boulogne': 'WEAK', 'Quevilly': 'WEAK', 'Valenciennes': 'WEAK', 'Le Mans': 'WEAK',
  'RED Star FC 93': 'WEAK',
  'Benfica': 'ELITE', 'Porto': 'ELITE', 'FC Porto': 'ELITE',
  'Sporting CP': 'ELITE', 'Sporting Lisbon': 'ELITE', 'Braga': 'STRONG',
  'Vitoria Guimaraes': 'AVERAGE', 'Vitória SC': 'AVERAGE', 'Rio Ave': 'AVERAGE',
  'Famalicao': 'AVERAGE', 'Famalicão': 'AVERAGE', 'Gil Vicente': 'AVERAGE',
  'Boavista': 'AVERAGE', 'Santa Clara': 'AVERAGE', 'Arouca': 'WEAK',
  'Estoril': 'WEAK', 'Casa Pia': 'WEAK', 'Vizela': 'WEAK', 'Chaves': 'WEAK',
  'Portimonense': 'WEAK', 'Estrela': 'WEAK', 'Nacional': 'WEAK',
  'Moreirense': 'AVERAGE', 'Moreirense FC': 'AVERAGE', 'Tondela': 'WEAK',
  'Club Brugge': 'STRONG', 'Club Brugge KV': 'STRONG', 'Anderlecht': 'STRONG',
  'Union Saint-Gilloise': 'STRONG', 'Genk': 'STRONG', 'Gent': 'AVERAGE',
  'Antwerp': 'AVERAGE', 'Royal Antwerp': 'AVERAGE', 'Standard Liege': 'AVERAGE',
  'Cercle Brugge': 'AVERAGE', 'Cercle Brugge KSV': 'AVERAGE', 'KV Mechelen': 'AVERAGE',
  'Charleroi': 'AVERAGE', 'Westerlo': 'WEAK', 'Leuven': 'WEAK', 'Sint Truiden': 'WEAK',
  'RAAL La Louvière': 'WEAK', 'Kortrijk': 'WEAK', 'Dender': 'WEAK', 'SV Zulte-Waregem': 'WEAK',
  'Ajax': 'STRONG', 'PSV': 'STRONG', 'PSV Eindhoven': 'STRONG', 'Feyenoord': 'STRONG',
  'AZ Alkmaar': 'AVERAGE', 'Twente': 'AVERAGE', 'Utrecht': 'AVERAGE',
  'Vitesse': 'AVERAGE', 'Heerenveen': 'AVERAGE', 'Groningen': 'WEAK',
  'Sparta Rotterdam': 'WEAK', 'NEC': 'WEAK', 'Fortuna Sittard': 'WEAK',
  'Go Ahead Eagles': 'WEAK', 'Volendam': 'WEAK', 'Almere City': 'WEAK',
  'Celtic': 'ELITE', 'Rangers': 'STRONG', 'Hearts': 'AVERAGE', 'Aberdeen': 'AVERAGE',
  'Hibernian': 'AVERAGE', 'Dundee United': 'WEAK', 'Motherwell': 'WEAK',
  'St Mirren': 'WEAK', 'Kilmarnock': 'WEAK', 'Ross County': 'WEAK',
};

const TIER_MULTIPLIERS = {
  ELITE:   { attack: 1.35, defense: 0.75, corners: 1.2 },
  STRONG:  { attack: 1.15, defense: 0.90, corners: 1.1 },
  AVERAGE: { attack: 1.0,  defense: 1.0,  corners: 1.0 },
  WEAK:    { attack: 0.80, defense: 1.20, corners: 0.85 },
};

function getTeamTier(teamName: string): 'ELITE' | 'STRONG' | 'AVERAGE' | 'WEAK' {
  if (TEAM_TIERS[teamName]) return TEAM_TIERS[teamName];
  const normalized = teamName.toLowerCase();
  for (const [team, tier] of Object.entries(TEAM_TIERS)) {
    if (normalized.includes(team.toLowerCase()) || team.toLowerCase().includes(normalized)) return tier;
  }
  return 'AVERAGE';
}

// Only fetch real stats for these leagues — they have the most fixtures
// and are most likely to return useful data. Everything else uses tier fallback.
// This keeps API calls well under the 10/min free plan limit.
const STATS_SUPPORTED_LEAGUES = new Set([39, 140, 135, 78, 61]); // EPL, La Liga, Serie A, Bundesliga, Ligue 1

// ============== API HELPER ==============

async function apiCall<T>(endpoint: string): Promise<T | null> {
  if (!API_KEY) { console.log('[Football API] No API key configured'); return null; }
  try {
    console.log(`[Football API] ${endpoint}`);
    const res = await fetch(`https://${API_HOST}${endpoint}`, {
      headers: { 'x-apisports-key': API_KEY },
      next: { revalidate: 3600 },
    });
    const remaining = res.headers.get('x-ratelimit-requests-remaining');
    console.log(`[Football API] Rate limit remaining: ${remaining}`);
    if (res.status === 429) { console.error('[Football API] Rate limited!'); return null; }
    if (!res.ok) { console.error('[Football API] HTTP Error:', res.status); return null; }
    const json = await res.json();
    if (json.errors && Object.keys(json.errors).length > 0) { console.error('[Football API] Errors:', json.errors); return null; }
    return json.response;
  } catch (error) { console.error('[Football API] Error:', error); return null; }
}


// ============== FIXTURES ==============

export async function getTodaysFixtures(): Promise<FootballFixture[]> {
  return getFixturesByDate(new Date().toISOString().split('T')[0]);
}
export async function getTomorrowsFixtures(): Promise<FootballFixture[]> {
  const d = new Date(); d.setDate(d.getDate() + 1);
  return getFixturesByDate(d.toISOString().split('T')[0]);
}
export async function getDayAfterTomorrowFixtures(): Promise<FootballFixture[]> {
  const d = new Date(); d.setDate(d.getDate() + 2);
  return getFixturesByDate(d.toISOString().split('T')[0]);
}

async function getFixturesByDate(date: string): Promise<FootballFixture[]> {
  const fixtures = await apiCall<any[]>(`/fixtures?date=${date}`);
  if (!fixtures) { console.log('[Football] API unavailable, returning empty'); return []; }
  return fixtures
    .filter(f => TOP_LEAGUE_IDS.includes(f.league.id) && f.fixture.status.short === 'NS')
    .map(f => ({
      id: `fb-${f.fixture.id}`, externalId: f.fixture.id,
      league: { id: f.league.id, name: f.league.name, country: f.league.country, logo: f.league.logo || '' },
      homeTeam: { id: f.teams.home.id, name: f.teams.home.name, logo: f.teams.home.logo || '' },
      awayTeam: { id: f.teams.away.id, name: f.teams.away.name, logo: f.teams.away.logo || '' },
      kickoff: new Date(f.fixture.date), venue: f.fixture.venue?.name || 'TBD',
      status: f.fixture.status.short,
    }))
    .sort((a, b) => a.kickoff.getTime() - b.kickoff.getTime());
}

// ============== REAL TEAM STATS ==============

interface RealTeamStats {
  goalsForAvgHome: number; goalsForAvgAway: number;
  goalsAgainstAvgHome: number; goalsAgainstAvgAway: number;
  form: string; gamesPlayed: number;
}

const teamStatsCache = new Map<string, { data: RealTeamStats; timestamp: number }>();
const TEAM_STATS_TTL = 24 * 60 * 60 * 1000;

// FIX 1: Free plan only allows seasons up to 2024. Remove Math.min once upgraded.
function getCurrentSeason(): number {
  const now = new Date();
  const month = now.getMonth() + 1;
  const year = now.getFullYear();
  const naturalSeason = month >= 8 ? year : year - 1;
  return Math.min(naturalSeason, 2024);
}

async function fetchRealTeamStats(teamId: number, leagueId: number): Promise<RealTeamStats | null> {
  // FIX 2: Skip API for leagues that aren't top-5 to avoid rate limit exhaustion.
  // 27 fixtures × 2 = 54 calls but free plan only allows 10/min → timeout.
  if (!STATS_SUPPORTED_LEAGUES.has(leagueId)) return null;
  if (!API_KEY || teamId === 0) return null;
  const cacheKey = `${teamId}-${leagueId}`;
  const cached = teamStatsCache.get(cacheKey);
  if (cached && Date.now() - cached.timestamp < TEAM_STATS_TTL) return cached.data;

  const season = getCurrentSeason();
  const data = await apiCall<any>(`/teams/statistics?league=${leagueId}&season=${season}&team=${teamId}`);
  if (!data) return null;

  try {
    const goals = data.goals;
    const stats: RealTeamStats = {
      goalsForAvgHome:     parseFloat(goals?.for?.average?.home    || '0') || 0,
      goalsForAvgAway:     parseFloat(goals?.for?.average?.away    || '0') || 0,
      goalsAgainstAvgHome: parseFloat(goals?.against?.average?.home || '0') || 0,
      goalsAgainstAvgAway: parseFloat(goals?.against?.average?.away || '0') || 0,
      form: data.form || '', gamesPlayed: data.fixtures?.played?.total || 0,
    };
    teamStatsCache.set(cacheKey, { data: stats, timestamp: Date.now() });
    console.log(`[Football Stats] Team ${teamId}: ${stats.gamesPlayed} games, home avg ${stats.goalsForAvgHome.toFixed(2)}`);
    return stats;
  } catch { return null; }
}

// ============== STATS (API FIRST, TIER FALLBACK) ==============

function getLeagueAverages(leagueId: number): { goals: number; corners: number; variance: number } {
  return LEAGUE_AVERAGES[leagueId] || { goals: 1.3, corners: 5.0, variance: 0.35 };
}

async function getTeamStats(teamId: number, teamName: string, leagueId: number, isHome: boolean): Promise<TeamStats> {
  const avg = getLeagueAverages(leagueId);
  const tier = getTeamTier(teamName);
  const mult = TIER_MULTIPLIERS[tier];
  const real = await fetchRealTeamStats(teamId, leagueId);
  if (real && real.gamesPlayed >= 5) {
    const goalsFor     = isHome ? real.goalsForAvgHome     : real.goalsForAvgAway;
    const goalsAgainst = isHome ? real.goalsAgainstAvgHome : real.goalsAgainstAvgAway;
    return {
      goalsFor:       goalsFor      || avg.goals * mult.attack,
      goalsAgainst:   goalsAgainst  || avg.goals * mult.defense,
      cornersFor:     avg.corners * mult.corners + (isHome ? 0.3 : -0.2),
      cornersAgainst: avg.corners,
      form:           real.form.slice(-5) || 'UNKNOWN',
      gamesPlayed:    real.gamesPlayed,
      source:         'API',
    };
  }
  const homeBonus   = isHome ?  0.15 : -0.10;
  const cornerBonus = isHome ?  0.3  : -0.20;
  return {
    goalsFor:       (avg.goals * mult.attack)    + homeBonus,
    goalsAgainst:   (avg.goals * mult.defense)   - homeBonus * 0.5,
    cornersFor:     (avg.corners * mult.corners) + cornerBonus,
    cornersAgainst: avg.corners,
    form:           'UNKNOWN', gamesPlayed: 0,
    source:         tier !== 'AVERAGE' ? 'TEAM_TIER' : 'FALLBACK',
  };
}

// ============== PROBABILITY HELPERS ==============

function poissonProb(lambda: number, k: number): number {
  return Math.pow(lambda, k) * Math.exp(-lambda) / factorial(k);
}
function factorial(n: number): number { return n <= 1 ? 1 : n * factorial(n - 1); }
function probUnder(lambda: number, line: number): number {
  let p = 0;
  for (let k = 0; k <= Math.floor(line); k++) p += poissonProb(lambda, k);
  return Math.min(0.92, Math.max(0.08, p));
}
function probOver(lambda: number, line: number): number {
  return Math.min(0.92, Math.max(0.08, 1 - probUnder(lambda, line)));
}

// ============== CONFIDENCE / EDGE / RISK ==============

interface ConfidenceFactors {
  dataQuality: 'HIGH' | 'MEDIUM' | 'LOW' | 'FALLBACK';
  sampleSize: number; modelAgreement: number;
  marketVolatility: number; probabilityStrength: number;
}
function calculateConfidence(f: ConfidenceFactors): number {
  const dq = { HIGH: 85, MEDIUM: 70, LOW: 55, FALLBACK: 40 }[f.dataQuality];
  const sm = f.sampleSize >= 20 ? 10 : f.sampleSize >= 10 ? 5 : f.sampleSize >= 5 ? 0 : f.sampleSize >= 3 ? -8 : -15;
  const am = (f.modelAgreement - 50) / 5;
  const vp = -f.marketVolatility * 15;
  const sb = Math.min(5, f.probabilityStrength * 10);
  return Math.max(30, Math.min(88, Math.round(dq + sm + am + vp + sb)));
}

interface EdgeResult {
  edge: number; impliedProbability: number;
  category: 'LOW_RISK' | 'VALUE' | 'SPECULATIVE' | 'NO_BET'; valueLabel: string;
}
function calculateEdge(prob: number, odds: number | null): EdgeResult {
  if (!odds || odds <= 1) return { edge: 0, impliedProbability: 0, category: 'NO_BET', valueLabel: 'NO_ODDS' };
  const imp = 1 / odds;
  const edge = (prob - imp) * 100;
  let category: EdgeResult['category'], valueLabel: string;
  if (edge >= 10)      { category = 'VALUE';       valueLabel = 'STRONG_VALUE'; }
  else if (edge >= 5)  { category = 'VALUE';       valueLabel = 'GOOD_VALUE'; }
  else if (edge >= 3)  { category = 'LOW_RISK';    valueLabel = 'FAIR_VALUE'; }
  else if (edge >= 0)  { category = 'SPECULATIVE'; valueLabel = 'MARGINAL'; }
  else if (edge >= -5) { category = 'NO_BET';      valueLabel = 'NEGATIVE_EV'; }
  else                 { category = 'NO_BET';      valueLabel = 'TRAP'; }
  return { edge: Math.round(edge * 10) / 10, impliedProbability: imp, category, valueLabel };
}

function calculateRisk(conf: number, edge: number, dq: string, variance: number): 'LOW' | 'MEDIUM' | 'HIGH' {
  let s = 0;
  s += conf >= 70 ? 0 : conf >= 55 ? 15 : 30;
  s += edge >= 8 ? 0 : edge >= 3 ? 10 : edge >= 0 ? 18 : 25;
  s += dq === 'HIGH' ? 0 : (dq === 'MEDIUM' || dq === 'TEAM_TIER') ? 10 : 25;
  s += variance * 20;
  return s <= 25 ? 'LOW' : s <= 55 ? 'MEDIUM' : 'HIGH';
}

function calculateExpectedGoals(hs: TeamStats, as_: TeamStats, avg: { goals: number }) {
  const hXG = avg.goals * (hs.goalsFor / avg.goals) * (as_.goalsAgainst / avg.goals);
  const aXG = avg.goals * (as_.goalsFor / avg.goals) * (hs.goalsAgainst / avg.goals);
  return { homeXG: hXG * 1.1, awayXG: aXG * 0.95, totalXG: hXG * 1.1 + aXG * 0.95 };
}

// ============== MAIN ANALYSIS ==============

export async function analyzeFootballMatch(
  fixture: FootballFixture,
  bookmakerOddsData?: Record<string, BookmakerOdds>
): Promise<FootballSuggestion[]> {
  const suggestions: FootballSuggestion[] = [];
  const warnings: string[] = [];

  // Parallel is fine now — only top-5 league fixtures call the API (~16 calls max)
  const [homeStats, awayStats] = await Promise.all([
    getTeamStats(fixture.homeTeam.id, fixture.homeTeam.name, fixture.league.id, true),
    getTeamStats(fixture.awayTeam.id, fixture.awayTeam.name, fixture.league.id, false),
  ]);

  const leagueAvg = getLeagueAverages(fixture.league.id);
  let dataQuality: 'HIGH' | 'MEDIUM' | 'LOW' | 'FALLBACK';
  if (homeStats.source === 'API' && awayStats.source === 'API') dataQuality = 'HIGH';
  else if (homeStats.source === 'TEAM_TIER' || awayStats.source === 'TEAM_TIER') dataQuality = 'MEDIUM';
  else { dataQuality = 'FALLBACK'; warnings.push('Using league averages - lower reliability'); }

  const xG = calculateExpectedGoals(homeStats, awayStats, leagueAvg);
  const homeTier = getTeamTier(fixture.homeTeam.name);
  const awayTier  = getTeamTier(fixture.awayTeam.name);
  const tv = { ELITE: 4, STRONG: 3, AVERAGE: 2, WEAK: 1 };
  const homeStrength = tv[homeTier], awayStrength = tv[awayTier];
  const strengthDiff = homeStrength - awayStrength;

  let homeFormBonus = 0, awayFormBonus = 0;
  if (homeStats.form && homeStats.form !== 'UNKNOWN') {
    const hw = homeStats.form.split('').filter(c => c === 'W').length;
    homeFormBonus = ((hw / homeStats.form.length) - 0.5) * 0.08;
  }
  if (awayStats.form && awayStats.form !== 'UNKNOWN') {
    const aw = awayStats.form.split('').filter(c => c === 'W').length;
    awayFormBonus = ((aw / awayStats.form.length) - 0.5) * 0.08;
  }

  let homeWinProb: number, drawProb: number, awayWinProb: number;
  if (dataQuality === 'HIGH') {
    let hw = 0, draw = 0, aw = 0;
    for (let h = 0; h <= 8; h++) for (let a = 0; a <= 8; a++) {
      const p = poissonProb(xG.homeXG, h) * poissonProb(xG.awayXG, a);
      if (h > a) hw += p; else if (h === a) draw += p; else aw += p;
    }
    homeWinProb = Math.min(0.85, hw + homeFormBonus);
    drawProb    = Math.max(0.05, draw);
    awayWinProb = Math.min(0.85, aw + awayFormBonus);
    const tot   = homeWinProb + drawProb + awayWinProb;
    homeWinProb /= tot; drawProb /= tot; awayWinProb /= tot;
  } else {
    if (strengthDiff >= 3)        { homeWinProb = 0.75; drawProb = 0.15; awayWinProb = 0.10; }
    else if (strengthDiff >= 2)   { homeWinProb = 0.62; drawProb = 0.22; awayWinProb = 0.16; }
    else if (strengthDiff === 1)  { homeWinProb = 0.50; drawProb = 0.26; awayWinProb = 0.24; }
    else if (strengthDiff === 0)  { homeWinProb = 0.42; drawProb = 0.28; awayWinProb = 0.30; }
    else if (strengthDiff === -1) { homeWinProb = 0.35; drawProb = 0.27; awayWinProb = 0.38; }
    else if (strengthDiff === -2) { homeWinProb = 0.22; drawProb = 0.23; awayWinProb = 0.55; }
    else                          { homeWinProb = 0.12; drawProb = 0.18; awayWinProb = 0.70; }
    const tot = homeWinProb + drawProb + awayWinProb;
    homeWinProb /= tot; drawProb /= tot; awayWinProb /= tot;
  }

  // HOME WIN
  const hOdds = bookmakerOddsData?.['home_win']?.odds || null;
  const hEdge = calculateEdge(homeWinProb, hOdds);
  if (homeWinProb >= 0.35) {
    const hConf = calculateConfidence({ dataQuality, sampleSize: homeStats.gamesPlayed || 10, modelAgreement: strengthDiff >= 1 ? 75 : 55, marketVolatility: leagueAvg.variance, probabilityStrength: Math.abs(homeWinProb - 0.33) });
    suggestions.push({ fixture, market: 'MATCH_WINNER_HOME', pick: `${fixture.homeTeam.name} to Win`, probability: homeWinProb, confidence: hConf, edge: hEdge.edge, impliedProbability: hEdge.impliedProbability, bookmakerOdds: hOdds || undefined, risk: calculateRisk(hConf, hEdge.edge, dataQuality, leagueAvg.variance), reasoning: [dataQuality === 'HIGH' ? `xG home: ${xG.homeXG.toFixed(2)}, away: ${xG.awayXG.toFixed(2)}` : `${homeTier} vs ${awayTier} tier`, homeStats.form !== 'UNKNOWN' ? `Home form: ${homeStats.form}` : '', `Win prob: ${(homeWinProb * 100).toFixed(0)}%`].filter(Boolean), warnings: [...warnings], category: hEdge.edge >= 5 ? 'LOW_RISK' : hEdge.edge >= 0 ? 'VALUE' : 'SPECULATIVE', dataQuality, modelAgreement: strengthDiff >= 1 ? 75 : 55 });
  }

  // AWAY WIN
  const aOdds = bookmakerOddsData?.['away_win']?.odds || null;
  const aEdge = calculateEdge(awayWinProb, aOdds);
  if (awayWinProb >= 0.30) {
    const aConf = calculateConfidence({ dataQuality, sampleSize: awayStats.gamesPlayed || 10, modelAgreement: strengthDiff <= -1 ? 70 : 50, marketVolatility: leagueAvg.variance, probabilityStrength: Math.abs(awayWinProb - 0.33) });
    suggestions.push({ fixture, market: 'MATCH_WINNER_AWAY', pick: `${fixture.awayTeam.name} to Win`, probability: awayWinProb, confidence: aConf, edge: aEdge.edge, impliedProbability: aEdge.impliedProbability, bookmakerOdds: aOdds || undefined, risk: calculateRisk(aConf, aEdge.edge, dataQuality, leagueAvg.variance), reasoning: [dataQuality === 'HIGH' ? `xG away: ${xG.awayXG.toFixed(2)}, home: ${xG.homeXG.toFixed(2)}` : `${awayTier} vs ${homeTier} tier`, awayStats.form !== 'UNKNOWN' ? `Away form: ${awayStats.form}` : '', `Win prob: ${(awayWinProb * 100).toFixed(0)}%`].filter(Boolean), warnings: [...warnings], category: aEdge.edge >= 8 ? 'VALUE' : aEdge.edge >= 0 ? 'SPECULATIVE' : 'NO_BET', dataQuality, modelAgreement: strengthDiff <= -1 ? 70 : 50 });
  }

  // OVER 2.5
  if (xG.totalXG > 2.0) {
    const prob = probOver(xG.totalXG, 2.5);
    const bOdds = bookmakerOddsData?.['over_2_5']?.odds || null;
    const er = calculateEdge(prob, bOdds);
    const conf = calculateConfidence({ dataQuality, sampleSize: homeStats.gamesPlayed || 10, modelAgreement: xG.homeXG > 1.2 && xG.awayXG > 0.9 ? 75 : 55, marketVolatility: leagueAvg.variance, probabilityStrength: Math.abs(prob - 0.5) });
    suggestions.push({ fixture, market: 'GOALS_OVER_2_5', pick: 'Over 2.5 Goals', probability: prob, confidence: conf, edge: er.edge, impliedProbability: er.impliedProbability, bookmakerOdds: bOdds || undefined, risk: calculateRisk(conf, er.edge, dataQuality, leagueAvg.variance), reasoning: [`Expected goals: ${xG.totalXG.toFixed(2)}`, `Home xG: ${xG.homeXG.toFixed(2)}, Away xG: ${xG.awayXG.toFixed(2)}`], warnings: [...warnings], category: er.edge >= 8 ? 'LOW_RISK' : er.edge >= 3 ? 'VALUE' : 'SPECULATIVE', dataQuality, modelAgreement: xG.homeXG > 1.2 && xG.awayXG > 0.9 ? 75 : 55 });
  }

  // UNDER 2.5
  if (xG.totalXG < 2.8) {
    const prob = probUnder(xG.totalXG, 2.5);
    const bOdds = bookmakerOddsData?.['under_2_5']?.odds || null;
    const er = calculateEdge(prob, bOdds);
    const conf = calculateConfidence({ dataQuality, sampleSize: homeStats.gamesPlayed || 10, modelAgreement: xG.homeXG < 1.3 && xG.awayXG < 1.0 ? 70 : 50, marketVolatility: leagueAvg.variance, probabilityStrength: Math.abs(prob - 0.5) });
    suggestions.push({ fixture, market: 'GOALS_UNDER_2_5', pick: 'Under 2.5 Goals', probability: prob, confidence: conf, edge: er.edge, impliedProbability: er.impliedProbability, bookmakerOdds: bOdds || undefined, risk: calculateRisk(conf, er.edge, dataQuality, leagueAvg.variance), reasoning: [`Expected goals: ${xG.totalXG.toFixed(2)}`, 'Defensive matchup expected'], warnings: [...warnings], category: er.edge >= 5 ? 'VALUE' : 'SPECULATIVE', dataQuality, modelAgreement: xG.homeXG < 1.3 && xG.awayXG < 1.0 ? 70 : 50 });
  }

  // DOUBLE CHANCE 1X
  const dcProb = homeWinProb + drawProb;
  const dcOdds = bookmakerOddsData?.['double_chance_1x']?.odds || null;
  const dcEdge = calculateEdge(dcProb, dcOdds);
  if (dcProb >= 0.55 && homeStrength >= awayStrength) {
    const dcConf = calculateConfidence({ dataQuality, sampleSize: homeStats.gamesPlayed || 10, modelAgreement: homeStrength >= awayStrength ? 70 : 50, marketVolatility: leagueAvg.variance, probabilityStrength: Math.abs(dcProb - 0.5) });
    suggestions.push({ fixture, market: 'DOUBLE_CHANCE_1X', pick: `${fixture.homeTeam.name} or Draw`, probability: dcProb, confidence: dcConf, edge: dcEdge.edge, impliedProbability: dcEdge.impliedProbability, bookmakerOdds: dcOdds || undefined, risk: calculateRisk(dcConf, dcEdge.edge, dataQuality, leagueAvg.variance), reasoning: [`${homeTier} tier home vs ${awayTier} tier away`, `Combined prob: ${(dcProb * 100).toFixed(0)}%`], warnings: [...warnings], category: dcEdge.edge >= 5 ? 'VALUE' : 'SPECULATIVE', dataQuality, modelAgreement: homeStrength >= awayStrength ? 70 : 50 });
  }

  return suggestions.sort((a, b) => {
    if (a.bookmakerOdds && !b.bookmakerOdds) return -1;
    if (!a.bookmakerOdds && b.bookmakerOdds) return 1;
    return b.edge - a.edge;
  });
}

export function getLeagueBadgeColor(leagueId: number): string {
  const colors: Record<number, string> = {
    39: 'bg-purple-500/20 text-purple-400', 40: 'bg-purple-500/10 text-purple-300',
    140: 'bg-orange-500/20 text-orange-400', 141: 'bg-orange-500/10 text-orange-300',
    135: 'bg-blue-500/20 text-blue-400', 136: 'bg-blue-500/10 text-blue-300',
    78: 'bg-red-500/20 text-red-400', 79: 'bg-red-500/10 text-red-300',
    61: 'bg-sky-500/20 text-sky-400', 2: 'bg-indigo-500/20 text-indigo-400',
    3: 'bg-amber-500/20 text-amber-400', 848: 'bg-green-500/20 text-green-400',
    179: 'bg-teal-500/20 text-teal-400', 180: 'bg-teal-500/10 text-teal-300',
    143: 'bg-yellow-500/20 text-yellow-400', 137: 'bg-cyan-500/20 text-cyan-400',
    81: 'bg-pink-500/20 text-pink-400', 45: 'bg-fuchsia-500/20 text-fuchsia-400',
    48: 'bg-rose-500/20 text-rose-400',
  };
  return colors[leagueId] || 'bg-slate-500/20 text-slate-400';
}

export function formatKickoff(date: Date): string {
  return date.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', hour12: false });
}