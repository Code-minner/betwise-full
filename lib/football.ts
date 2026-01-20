/**
 * Football API - v8 (EXPANDED TEAM TIERS)
 * File: lib/football-api.ts
 */

const API_KEY = process.env.SPORTS_API_KEY || '';
const API_HOST = 'v3.football.api-sports.io';

// ============== TYPES ==============

export interface FootballFixture {
  id: string;
  externalId: number;
  league: {
    id: number;
    name: string;
    country: string;
    logo: string;
  };
  homeTeam: {
    id: number;
    name: string;
    logo: string;
  };
  awayTeam: {
    id: number;
    name: string;
    logo: string;
  };
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

// ============== LEAGUES ==============

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

// ============== LEAGUE AVERAGES ==============

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

// ============== EXPANDED TEAM TIERS ==============

const TEAM_TIERS: Record<string, 'ELITE' | 'STRONG' | 'AVERAGE' | 'WEAK'> = {
  // ==================== ENGLAND ====================
  'Manchester City': 'ELITE',
  'Arsenal': 'ELITE',
  'Liverpool': 'ELITE',
  'Manchester United': 'STRONG',
  'Chelsea': 'STRONG',
  'Tottenham': 'STRONG',
  'Newcastle': 'STRONG',
  'Aston Villa': 'STRONG',
  'Brighton': 'STRONG',
  'West Ham': 'AVERAGE',
  'Brentford': 'AVERAGE',
  'Crystal Palace': 'AVERAGE',
  'Fulham': 'AVERAGE',
  'Wolves': 'AVERAGE',
  'Bournemouth': 'AVERAGE',
  'Nottingham Forest': 'AVERAGE',
  'Everton': 'WEAK',
  'Luton': 'WEAK',
  'Burnley': 'WEAK',
  'Sheffield United': 'WEAK',
  'Ipswich': 'WEAK',
  'Leicester': 'STRONG',
  'Leicester City': 'STRONG',
  'Southampton': 'WEAK',
  'Leeds': 'STRONG',
  'West Brom': 'AVERAGE',
  'Middlesbrough': 'AVERAGE',
  'Coventry': 'AVERAGE',
  'Watford': 'AVERAGE',
  'Millwall': 'AVERAGE',
  'Blackburn': 'AVERAGE',
  'Sunderland': 'AVERAGE',
  'Norwich': 'AVERAGE',
  'Hull': 'AVERAGE',
  'Bristol City': 'AVERAGE',
  'Preston': 'WEAK',
  'Stoke': 'WEAK',
  'Plymouth': 'WEAK',
  'Sheffield Wednesday': 'WEAK',
  'Cardiff': 'WEAK',
  'Rotherham': 'WEAK',
  'Huddersfield': 'WEAK',

  // ==================== SPAIN ====================
  'Real Madrid': 'ELITE',
  'Barcelona': 'ELITE',
  'Atletico Madrid': 'STRONG',
  'Athletic Bilbao': 'STRONG',
  'Real Sociedad': 'STRONG',
  'Real Betis': 'STRONG',
  'Villarreal': 'STRONG',
  'Sevilla': 'AVERAGE',
  'Valencia': 'AVERAGE',
  'Getafe': 'AVERAGE',
  'Girona': 'STRONG',
  'Osasuna': 'AVERAGE',
  'Celta Vigo': 'AVERAGE',
  'Mallorca': 'AVERAGE',
  'Rayo Vallecano': 'AVERAGE',
  'Las Palmas': 'AVERAGE',
  'Alaves': 'WEAK',
  'Cadiz': 'WEAK',
  'Granada': 'WEAK',
  'Almeria': 'WEAK',
  'Espanyol': 'WEAK',
  'Leganes': 'AVERAGE',
  'Leganés': 'AVERAGE',
  'Eibar': 'AVERAGE',
  'Valladolid': 'AVERAGE',
  'Zaragoza': 'AVERAGE',
  'Sporting Gijon': 'AVERAGE',
  'Oviedo': 'AVERAGE',
  'Racing Santander': 'AVERAGE',
  'Elche': 'AVERAGE',
  'Huesca': 'AVERAGE',
  'Castellón': 'WEAK',
  'Castellon': 'WEAK',
  'CD Castellón': 'WEAK',
  'Burgos': 'WEAK',
  'Mirandes': 'WEAK',
  'Albacete': 'WEAK',
  'Andorra': 'WEAK',

  // ==================== ITALY ====================
  'Inter': 'ELITE',
  'Inter Milan': 'ELITE',
  'Juventus': 'STRONG',
  'AC Milan': 'STRONG',
  'Milan': 'STRONG',
  'Napoli': 'STRONG',
  'Roma': 'STRONG',
  'AS Roma': 'STRONG',
  'Lazio': 'STRONG',
  'Atalanta': 'STRONG',
  'Fiorentina': 'AVERAGE',
  'Bologna': 'AVERAGE',
  'Torino': 'AVERAGE',
  'Monza': 'AVERAGE',
  'Udinese': 'AVERAGE',
  'Sassuolo': 'AVERAGE',
  'Genoa': 'AVERAGE',
  'Lecce': 'WEAK',
  'Empoli': 'WEAK',
  'Cagliari': 'WEAK',
  'Verona': 'WEAK',
  'Hellas Verona': 'WEAK',
  'Frosinone': 'WEAK',
  'Salernitana': 'WEAK',
  'Como': 'WEAK',
  'Parma': 'AVERAGE',
  'Cremonese': 'AVERAGE',
  'Palermo': 'AVERAGE',
  'Sampdoria': 'AVERAGE',
  'Venezia': 'AVERAGE',
  'Bari': 'AVERAGE',
  'Brescia': 'AVERAGE',
  'Pisa': 'WEAK',
  'Spezia': 'WEAK',
  'Catanzaro': 'WEAK',
  'Modena': 'WEAK',
  'Reggiana': 'WEAK',
  'Südtirol': 'WEAK',
  'Virtus Entella': 'WEAK',

  // ==================== GERMANY ====================
  'Bayern Munich': 'ELITE',
  'Bayern München': 'ELITE',
  'Bayer Leverkusen': 'ELITE',
  'Borussia Dortmund': 'STRONG',
  'RB Leipzig': 'STRONG',
  'Stuttgart': 'STRONG',
  'Eintracht Frankfurt': 'STRONG',
  'Wolfsburg': 'AVERAGE',
  'Freiburg': 'AVERAGE',
  'Hoffenheim': 'AVERAGE',
  'Werder Bremen': 'AVERAGE',
  'Augsburg': 'AVERAGE',
  'Borussia Monchengladbach': 'AVERAGE',
  'Union Berlin': 'AVERAGE',
  'Mainz': 'AVERAGE',
  'Bochum': 'WEAK',
  'Heidenheim': 'WEAK',
  'Köln': 'WEAK',
  'Darmstadt': 'WEAK',
  'Hamburg': 'STRONG',
  'Fortuna Düsseldorf': 'AVERAGE',
  'Hannover': 'AVERAGE',
  'Kaiserslautern': 'AVERAGE',
  'Nürnberg': 'AVERAGE',
  '1. FC Nürnberg': 'AVERAGE',
  'Karlsruher': 'AVERAGE',
  'Karlsruher SC': 'AVERAGE',
  'Hertha Berlin': 'AVERAGE',
  'Paderborn': 'AVERAGE',
  'Greuther Fürth': 'AVERAGE',
  'SpVgg Greuther Fürth': 'AVERAGE',
  'Elversberg': 'WEAK',
  'SV Elversberg': 'WEAK',
  'Magdeburg': 'WEAK',
  '1. FC Magdeburg': 'WEAK',
  'Eintracht Braunschweig': 'WEAK',
  'Wehen Wiesbaden': 'WEAK',
  'Osnabrück': 'WEAK',
  'Preußen Münster': 'WEAK',
  'Dynamo Dresden': 'WEAK',
  'Arminia Bielefeld': 'WEAK',

  // ==================== FRANCE ====================
  'Paris Saint Germain': 'ELITE',
  'Paris Saint-Germain': 'ELITE',
  'PSG': 'ELITE',
  'Monaco': 'STRONG',
  'AS Monaco': 'STRONG',
  'Marseille': 'STRONG',
  'Lyon': 'STRONG',
  'Lille': 'STRONG',
  'Nice': 'AVERAGE',
  'Lens': 'AVERAGE',
  'Rennes': 'AVERAGE',
  'Montpellier': 'AVERAGE',
  'Toulouse': 'AVERAGE',
  'Reims': 'AVERAGE',
  'Strasbourg': 'AVERAGE',
  'Nantes': 'AVERAGE',
  'Brest': 'AVERAGE',
  'Le Havre': 'WEAK',
  'Lorient': 'WEAK',
  'Metz': 'WEAK',
  'Clermont': 'WEAK',
  'Saint-Etienne': 'AVERAGE',
  'Bordeaux': 'AVERAGE',
  'Auxerre': 'AVERAGE',
  'Caen': 'AVERAGE',
  'Paris FC': 'AVERAGE',
  'Angers': 'AVERAGE',
  'Guingamp': 'WEAK',
  'Amiens': 'WEAK',
  'Pau': 'WEAK',
  'PAU': 'WEAK',
  'Laval': 'WEAK',
  'Bastia': 'WEAK',
  'Troyes': 'WEAK',
  'Estac Troyes': 'WEAK',
  'Grenoble': 'WEAK',
  'Rodez': 'WEAK',
  'Annecy': 'WEAK',
  'Dunkerque': 'WEAK',
  'Boulogne': 'WEAK',
  'Quevilly': 'WEAK',
  'Valenciennes': 'WEAK',
  'Le Mans': 'WEAK',
  'RED Star FC 93': 'WEAK',

  // ==================== PORTUGAL ====================
  'Benfica': 'ELITE',
  'Porto': 'ELITE',
  'FC Porto': 'ELITE',
  'Sporting CP': 'ELITE',
  'Sporting Lisbon': 'ELITE',
  'Braga': 'STRONG',
  'Vitoria Guimaraes': 'AVERAGE',
  'Vitória SC': 'AVERAGE',
  'Rio Ave': 'AVERAGE',
  'Famalicao': 'AVERAGE',
  'Famalicão': 'AVERAGE',
  'Gil Vicente': 'AVERAGE',
  'Boavista': 'AVERAGE',
  'Santa Clara': 'AVERAGE',
  'Arouca': 'WEAK',
  'Estoril': 'WEAK',
  'Casa Pia': 'WEAK',
  'Vizela': 'WEAK',
  'Chaves': 'WEAK',
  'Portimonense': 'WEAK',
  'Estrela': 'WEAK',
  'Nacional': 'WEAK',
  'Moreirense': 'AVERAGE',
  'Moreirense FC': 'AVERAGE',
  'Tondela': 'WEAK',

  // ==================== BELGIUM ====================
  'Club Brugge': 'STRONG',
  'Club Brugge KV': 'STRONG',
  'Anderlecht': 'STRONG',
  'Union Saint-Gilloise': 'STRONG',
  'Genk': 'STRONG',
  'Gent': 'AVERAGE',
  'Antwerp': 'AVERAGE',
  'Royal Antwerp': 'AVERAGE',
  'Standard Liege': 'AVERAGE',
  'Cercle Brugge': 'AVERAGE',
  'Cercle Brugge KSV': 'AVERAGE',
  'KV Mechelen': 'AVERAGE',
  'Charleroi': 'AVERAGE',
  'Westerlo': 'WEAK',
  'Leuven': 'WEAK',
  'Sint Truiden': 'WEAK',
  'RAAL La Louvière': 'WEAK',
  'Kortrijk': 'WEAK',
  'Dender': 'WEAK',
  'SV Zulte-Waregem': 'WEAK',

  // ==================== NETHERLANDS ====================
  'Ajax': 'STRONG',
  'PSV': 'STRONG',
  'PSV Eindhoven': 'STRONG',
  'Feyenoord': 'STRONG',
  'AZ Alkmaar': 'AVERAGE',
  'Twente': 'AVERAGE',
  'Utrecht': 'AVERAGE',
  'Vitesse': 'AVERAGE',
  'Heerenveen': 'AVERAGE',
  'Groningen': 'WEAK',
  'Sparta Rotterdam': 'WEAK',
  'NEC': 'WEAK',
  'Fortuna Sittard': 'WEAK',
  'Go Ahead Eagles': 'WEAK',
  'Volendam': 'WEAK',
  'Almere City': 'WEAK',

  // ==================== SCOTLAND ====================
  'Celtic': 'ELITE',
  'Rangers': 'STRONG',
  'Hearts': 'AVERAGE',
  'Aberdeen': 'AVERAGE',
  'Hibernian': 'AVERAGE',
  'Dundee United': 'WEAK',
  'Motherwell': 'WEAK',
  'St Mirren': 'WEAK',
  'Kilmarnock': 'WEAK',
  'Ross County': 'WEAK',
};

const TIER_MULTIPLIERS = {
  ELITE: { attack: 1.35, defense: 0.75, corners: 1.2 },
  STRONG: { attack: 1.15, defense: 0.90, corners: 1.1 },
  AVERAGE: { attack: 1.0, defense: 1.0, corners: 1.0 },
  WEAK: { attack: 0.80, defense: 1.20, corners: 0.85 },
};

function getTeamTier(teamName: string): 'ELITE' | 'STRONG' | 'AVERAGE' | 'WEAK' {
  if (TEAM_TIERS[teamName]) return TEAM_TIERS[teamName];
  
  const normalized = teamName.toLowerCase();
  for (const [team, tier] of Object.entries(TEAM_TIERS)) {
    if (normalized.includes(team.toLowerCase()) || team.toLowerCase().includes(normalized)) {
      return tier;
    }
  }
  
  return 'AVERAGE';
}

// ============== API HELPER ==============

async function apiCall<T>(endpoint: string): Promise<T | null> {
  if (!API_KEY) {
    console.log('[Football API] No API key configured');
    return null;
  }

  try {
    console.log(`[Football API] ${endpoint}`);
    const res = await fetch(`https://${API_HOST}${endpoint}`, {
      headers: { 'x-apisports-key': API_KEY },
      next: { revalidate: 3600 },
    });
    
    const remaining = res.headers.get('x-ratelimit-requests-remaining');
    console.log(`[Football API] Rate limit remaining: ${remaining}`);
    
    if (res.status === 429) {
      console.error('[Football API] Rate limited!');
      return null;
    }
    
    if (!res.ok) {
      console.error('[Football API] HTTP Error:', res.status);
      return null;
    }
    
    const json = await res.json();
    if (json.errors && Object.keys(json.errors).length > 0) {
      console.error('[Football API] Errors:', json.errors);
      return null;
    }
    
    return json.response;
  } catch (error) {
    console.error('[Football API] Error:', error);
    return null;
  }
}

// ============== FIXTURES ==============

export async function getTodaysFixtures(): Promise<FootballFixture[]> {
  return getFixturesByDate(new Date().toISOString().split('T')[0]);
}

export async function getTomorrowsFixtures(): Promise<FootballFixture[]> {
  const d = new Date();
  d.setDate(d.getDate() + 1);
  return getFixturesByDate(d.toISOString().split('T')[0]);
}

export async function getDayAfterTomorrowFixtures(): Promise<FootballFixture[]> {
  const d = new Date();
  d.setDate(d.getDate() + 2);
  return getFixturesByDate(d.toISOString().split('T')[0]);
}

async function getFixturesByDate(date: string): Promise<FootballFixture[]> {
  const fixtures = await apiCall<any[]>(`/fixtures?date=${date}`);
  
  if (!fixtures) {
    console.log('[Football] API unavailable, returning empty');
    return [];
  }

  return fixtures
    .filter(f => TOP_LEAGUE_IDS.includes(f.league.id) && f.fixture.status.short === 'NS')
    .map(f => ({
      id: `fb-${f.fixture.id}`,
      externalId: f.fixture.id,
      league: { id: f.league.id, name: f.league.name, country: f.league.country, logo: f.league.logo || '' },
      homeTeam: { id: f.teams.home.id, name: f.teams.home.name, logo: f.teams.home.logo || '' },
      awayTeam: { id: f.teams.away.id, name: f.teams.away.name, logo: f.teams.away.logo || '' },
      kickoff: new Date(f.fixture.date),
      venue: f.fixture.venue?.name || 'TBD',
      status: f.fixture.status.short,
    }))
    .sort((a, b) => a.kickoff.getTime() - b.kickoff.getTime());
}

// ============== STATS ==============

function getLeagueAverages(leagueId: number): { goals: number; corners: number; variance: number } {
  return LEAGUE_AVERAGES[leagueId] || { goals: 1.3, corners: 5.0, variance: 0.35 };
}

function getTeamStats(teamName: string, leagueId: number, isHome: boolean): TeamStats {
  const avg = getLeagueAverages(leagueId);
  const tier = getTeamTier(teamName);
  const mult = TIER_MULTIPLIERS[tier];
  
  const homeBonus = isHome ? 0.15 : -0.1;
  const cornerBonus = isHome ? 0.3 : -0.2;
  
  const source: 'API' | 'TEAM_TIER' | 'FALLBACK' = tier !== 'AVERAGE' ? 'TEAM_TIER' : 'FALLBACK';
  
  return {
    goalsFor: (avg.goals * mult.attack) + homeBonus,
    goalsAgainst: (avg.goals * mult.defense) - homeBonus * 0.5,
    cornersFor: (avg.corners * mult.corners) + cornerBonus,
    cornersAgainst: avg.corners,
    form: 'UNKNOWN',
    gamesPlayed: 0,
    source,
  };
}

// ============== PROBABILITY HELPERS ==============

function poissonProb(lambda: number, k: number): number {
  return Math.pow(lambda, k) * Math.exp(-lambda) / factorial(k);
}

function factorial(n: number): number {
  return n <= 1 ? 1 : n * factorial(n - 1);
}

function probUnder(lambda: number, line: number): number {
  let p = 0;
  const maxK = Math.floor(line);
  for (let k = 0; k <= maxK; k++) {
    p += poissonProb(lambda, k);
  }
  return Math.min(0.92, Math.max(0.08, p));
}

function probOver(lambda: number, line: number): number {
  const underProb = probUnder(lambda, line);
  return Math.min(0.92, Math.max(0.08, 1 - underProb));
}

// ============== CONFIDENCE CALCULATION ==============

interface ConfidenceFactors {
  dataQuality: 'HIGH' | 'MEDIUM' | 'LOW' | 'FALLBACK';
  sampleSize: number;
  modelAgreement: number;
  marketVolatility: number;
  probabilityStrength: number;
}

function calculateConfidence(factors: ConfidenceFactors): number {
  const dataQualityScore = {
    HIGH: 85,
    MEDIUM: 70,
    LOW: 55,
    FALLBACK: 40,
  }[factors.dataQuality];
  
  const sampleModifier = factors.sampleSize >= 20 ? 10 :
                         factors.sampleSize >= 10 ? 5 :
                         factors.sampleSize >= 5 ? 0 :
                         factors.sampleSize >= 3 ? -8 : -15;
  
  const agreementModifier = (factors.modelAgreement - 50) / 5;
  const volatilityPenalty = -factors.marketVolatility * 15;
  const strengthBonus = Math.min(5, factors.probabilityStrength * 10);
  
  const rawConfidence = dataQualityScore + sampleModifier + agreementModifier + volatilityPenalty + strengthBonus;
  
  return Math.max(30, Math.min(88, Math.round(rawConfidence)));
}

// ============== EDGE CALCULATION ==============

interface EdgeResult {
  edge: number;
  impliedProbability: number;
  category: 'LOW_RISK' | 'VALUE' | 'SPECULATIVE' | 'NO_BET';
  valueLabel: string;
}

function calculateEdge(ourProbability: number, bookmakerOdds: number | null): EdgeResult {
  if (!bookmakerOdds || bookmakerOdds <= 1) {
    return {
      edge: 0,
      impliedProbability: 0,
      category: 'NO_BET',
      valueLabel: 'NO_ODDS',
    };
  }
  
  const impliedProbability = 1 / bookmakerOdds;
  const edge = (ourProbability - impliedProbability) * 100;
  
  let category: 'LOW_RISK' | 'VALUE' | 'SPECULATIVE' | 'NO_BET';
  let valueLabel: string;
  
  if (edge >= 10) {
    category = 'VALUE';
    valueLabel = 'STRONG_VALUE';
  } else if (edge >= 5) {
    category = 'VALUE';
    valueLabel = 'GOOD_VALUE';
  } else if (edge >= 3) {
    category = 'LOW_RISK';
    valueLabel = 'FAIR_VALUE';
  } else if (edge >= 0) {
    category = 'SPECULATIVE';
    valueLabel = 'MARGINAL';
  } else if (edge >= -5) {
    category = 'NO_BET';
    valueLabel = 'NEGATIVE_EV';
  } else {
    category = 'NO_BET';
    valueLabel = 'TRAP';
  }
  
  return {
    edge: Math.round(edge * 10) / 10,
    impliedProbability,
    category,
    valueLabel,
  };
}

// ============== RISK CALCULATION ==============

function calculateRisk(
  confidence: number,
  edge: number,
  dataQuality: string,
  leagueVariance: number
): 'LOW' | 'MEDIUM' | 'HIGH' {
  let riskScore = 0;
  
  if (confidence >= 70) riskScore += 0;
  else if (confidence >= 55) riskScore += 15;
  else riskScore += 30;
  
  if (edge >= 8) riskScore += 0;
  else if (edge >= 3) riskScore += 10;
  else if (edge >= 0) riskScore += 18;
  else riskScore += 25;
  
  if (dataQuality === 'HIGH') riskScore += 0;
  else if (dataQuality === 'MEDIUM' || dataQuality === 'TEAM_TIER') riskScore += 10;
  else riskScore += 25;
  
  riskScore += leagueVariance * 20;
  
  if (riskScore <= 25) return 'LOW';
  if (riskScore <= 55) return 'MEDIUM';
  return 'HIGH';
}

// ============== EXPECTED GOALS ==============

function calculateExpectedGoals(
  homeStats: TeamStats,
  awayStats: TeamStats,
  leagueAvg: { goals: number }
): { homeXG: number; awayXG: number; totalXG: number } {
  const homeAttackStrength = homeStats.goalsFor / leagueAvg.goals;
  const awayDefenseWeakness = awayStats.goalsAgainst / leagueAvg.goals;
  const homeXG = leagueAvg.goals * homeAttackStrength * awayDefenseWeakness;
  
  const awayAttackStrength = awayStats.goalsFor / leagueAvg.goals;
  const homeDefenseWeakness = homeStats.goalsAgainst / leagueAvg.goals;
  const awayXG = leagueAvg.goals * awayAttackStrength * homeDefenseWeakness;
  
  const adjustedHomeXG = homeXG * 1.1;
  const adjustedAwayXG = awayXG * 0.95;
  
  return {
    homeXG: adjustedHomeXG,
    awayXG: adjustedAwayXG,
    totalXG: adjustedHomeXG + adjustedAwayXG,
  };
}

// ============== MAIN ANALYSIS FUNCTION ==============

export async function analyzeFootballMatch(
  fixture: FootballFixture,
  bookmakerOddsData?: Record<string, BookmakerOdds>
): Promise<FootballSuggestion[]> {
  const suggestions: FootballSuggestion[] = [];
  const warnings: string[] = [];
  
  const homeStats = getTeamStats(fixture.homeTeam.name, fixture.league.id, true);
  const awayStats = getTeamStats(fixture.awayTeam.name, fixture.league.id, false);
  const leagueAvg = getLeagueAverages(fixture.league.id);
  
  // Determine data quality - TEAM_TIER now counts as MEDIUM
  let dataQuality: 'HIGH' | 'MEDIUM' | 'LOW' | 'FALLBACK';
  if (homeStats.source === 'API' && awayStats.source === 'API') {
    dataQuality = 'HIGH';
  } else if (homeStats.source === 'TEAM_TIER' || awayStats.source === 'TEAM_TIER') {
    dataQuality = 'MEDIUM';
  } else {
    dataQuality = 'FALLBACK';
    warnings.push('Using league averages - lower reliability');
  }

  const xG = calculateExpectedGoals(homeStats, awayStats, leagueAvg);

  const homeTier = getTeamTier(fixture.homeTeam.name);
  const awayTier = getTeamTier(fixture.awayTeam.name);
  const tierValues = { ELITE: 4, STRONG: 3, AVERAGE: 2, WEAK: 1 };
  const homeStrength = tierValues[homeTier];
  const awayStrength = tierValues[awayTier];
  const strengthDiff = homeStrength - awayStrength;

  // ============== MATCH WINNER PROBABILITIES ==============
  let homeWinProb: number;
  let drawProb: number;
  let awayWinProb: number;
  
  if (strengthDiff >= 3) {
    // ELITE vs WEAK at home
    homeWinProb = 0.75;
    drawProb = 0.15;
    awayWinProb = 0.10;
  } else if (strengthDiff >= 2) {
    // Strong favorite at home (ELITE vs AVERAGE or STRONG vs WEAK)
    homeWinProb = 0.62;
    drawProb = 0.22;
    awayWinProb = 0.16;
  } else if (strengthDiff === 1) {
    // Slight favorite at home
    homeWinProb = 0.50;
    drawProb = 0.26;
    awayWinProb = 0.24;
  } else if (strengthDiff === 0) {
    // Even match
    homeWinProb = 0.42;
    drawProb = 0.28;
    awayWinProb = 0.30;
  } else if (strengthDiff === -1) {
    // Slight underdog at home
    homeWinProb = 0.35;
    drawProb = 0.27;
    awayWinProb = 0.38;
  } else if (strengthDiff === -2) {
    // Big underdog at home
    homeWinProb = 0.22;
    drawProb = 0.23;
    awayWinProb = 0.55;
  } else {
    // WEAK vs ELITE at home
    homeWinProb = 0.12;
    drawProb = 0.18;
    awayWinProb = 0.70;
  }
  
  // Normalize
  const total = homeWinProb + drawProb + awayWinProb;
  homeWinProb /= total;
  drawProb /= total;
  awayWinProb /= total;

  // ============== 1. HOME WIN ==============
  const homeBookOdds = bookmakerOddsData?.['home_win']?.odds || null;
  const homeEdgeResult = calculateEdge(homeWinProb, homeBookOdds);
  
  if (homeWinProb >= 0.35) {
    const homeConfidence = calculateConfidence({
      dataQuality,
      sampleSize: 10,
      modelAgreement: strengthDiff >= 1 ? 75 : 55,
      marketVolatility: leagueAvg.variance,
      probabilityStrength: Math.abs(homeWinProb - 0.33),
    });
    
    const risk = calculateRisk(homeConfidence, homeEdgeResult.edge, dataQuality, leagueAvg.variance);
    
    suggestions.push({
      fixture,
      market: 'MATCH_WINNER_HOME',
      pick: `${fixture.homeTeam.name} to Win`,
      probability: homeWinProb,
      confidence: homeConfidence,
      edge: homeEdgeResult.edge,
      impliedProbability: homeEdgeResult.impliedProbability,
      bookmakerOdds: homeBookOdds || undefined,
      risk,
      reasoning: [
        `${homeTier} tier home vs ${awayTier} tier away`,
        `Model probability: ${(homeWinProb * 100).toFixed(0)}%`,
      ],
      warnings: [...warnings],
      category: homeEdgeResult.edge >= 5 ? 'LOW_RISK' : homeEdgeResult.edge >= 0 ? 'VALUE' : 'SPECULATIVE',
      dataQuality,
      modelAgreement: strengthDiff >= 1 ? 75 : 55,
    });
  }

  // ============== 2. AWAY WIN ==============
  const awayBookOdds = bookmakerOddsData?.['away_win']?.odds || null;
  const awayEdgeResult = calculateEdge(awayWinProb, awayBookOdds);
  
  if (awayWinProb >= 0.30) {
    const awayConfidence = calculateConfidence({
      dataQuality,
      sampleSize: 10,
      modelAgreement: strengthDiff <= -1 ? 70 : 50,
      marketVolatility: leagueAvg.variance,
      probabilityStrength: Math.abs(awayWinProb - 0.33),
    });
    
    const risk = calculateRisk(awayConfidence, awayEdgeResult.edge, dataQuality, leagueAvg.variance);
    
    suggestions.push({
      fixture,
      market: 'MATCH_WINNER_AWAY',
      pick: `${fixture.awayTeam.name} to Win`,
      probability: awayWinProb,
      confidence: awayConfidence,
      edge: awayEdgeResult.edge,
      impliedProbability: awayEdgeResult.impliedProbability,
      bookmakerOdds: awayBookOdds || undefined,
      risk,
      reasoning: [
        `${awayTier} tier away vs ${homeTier} tier home`,
        `Model probability: ${(awayWinProb * 100).toFixed(0)}%`,
      ],
      warnings: [...warnings],
      category: awayEdgeResult.edge >= 8 ? 'VALUE' : awayEdgeResult.edge >= 0 ? 'SPECULATIVE' : 'NO_BET',
      dataQuality,
      modelAgreement: strengthDiff <= -1 ? 70 : 50,
    });
  }

  // ============== 3. OVER 2.5 GOALS ==============
  if (xG.totalXG > 2.3) {
    const prob = probOver(xG.totalXG, 2.5);
    const bookOdds = bookmakerOddsData?.['over_2_5']?.odds || null;
    const edgeResult = calculateEdge(prob, bookOdds);
    
    const confidence = calculateConfidence({
      dataQuality,
      sampleSize: 10,
      modelAgreement: xG.homeXG > 1.2 && xG.awayXG > 0.9 ? 75 : 55,
      marketVolatility: leagueAvg.variance,
      probabilityStrength: Math.abs(prob - 0.5),
    });
    
    const risk = calculateRisk(confidence, edgeResult.edge, dataQuality, leagueAvg.variance);
    
    suggestions.push({
      fixture,
      market: 'GOALS_OVER_2_5',
      pick: 'Over 2.5 Goals',
      probability: prob,
      confidence,
      edge: edgeResult.edge,
      impliedProbability: edgeResult.impliedProbability,
      bookmakerOdds: bookOdds || undefined,
      risk,
      reasoning: [
        `Expected goals: ${xG.totalXG.toFixed(2)}`,
        `Home xG: ${xG.homeXG.toFixed(2)}, Away xG: ${xG.awayXG.toFixed(2)}`,
      ],
      warnings: [...warnings],
      category: edgeResult.edge >= 8 ? 'LOW_RISK' : edgeResult.edge >= 3 ? 'VALUE' : 'SPECULATIVE',
      dataQuality,
      modelAgreement: xG.homeXG > 1.2 && xG.awayXG > 0.9 ? 75 : 55,
    });
  }

  // ============== 4. UNDER 2.5 GOALS ==============
  if (xG.totalXG < 2.6) {
    const prob = probUnder(xG.totalXG, 2.5);
    const bookOdds = bookmakerOddsData?.['under_2_5']?.odds || null;
    const edgeResult = calculateEdge(prob, bookOdds);
    
    const confidence = calculateConfidence({
      dataQuality,
      sampleSize: 10,
      modelAgreement: xG.homeXG < 1.3 && xG.awayXG < 1.0 ? 70 : 50,
      marketVolatility: leagueAvg.variance,
      probabilityStrength: Math.abs(prob - 0.5),
    });
    
    const risk = calculateRisk(confidence, edgeResult.edge, dataQuality, leagueAvg.variance);
    
    suggestions.push({
      fixture,
      market: 'GOALS_UNDER_2_5',
      pick: 'Under 2.5 Goals',
      probability: prob,
      confidence,
      edge: edgeResult.edge,
      impliedProbability: edgeResult.impliedProbability,
      bookmakerOdds: bookOdds || undefined,
      risk,
      reasoning: [
        `Expected goals: ${xG.totalXG.toFixed(2)}`,
        `Defensive matchup expected`,
      ],
      warnings: [...warnings],
      category: edgeResult.edge >= 5 ? 'VALUE' : 'SPECULATIVE',
      dataQuality,
      modelAgreement: xG.homeXG < 1.3 && xG.awayXG < 1.0 ? 70 : 50,
    });
  }

  // ============== 5. DOUBLE CHANCE 1X (Home or Draw) ==============
  const doubleChanceProb = homeWinProb + drawProb;
  const dcBookOdds = bookmakerOddsData?.['double_chance_1x']?.odds || null;
  const dcEdgeResult = calculateEdge(doubleChanceProb, dcBookOdds);
  
  if (doubleChanceProb >= 0.55 && homeStrength >= awayStrength) {
    const dcConfidence = calculateConfidence({
      dataQuality,
      sampleSize: 10,
      modelAgreement: homeStrength >= awayStrength ? 70 : 50,
      marketVolatility: leagueAvg.variance,
      probabilityStrength: Math.abs(doubleChanceProb - 0.5),
    });
    
    const risk = calculateRisk(dcConfidence, dcEdgeResult.edge, dataQuality, leagueAvg.variance);
    
    suggestions.push({
      fixture,
      market: 'DOUBLE_CHANCE_1X',
      pick: `${fixture.homeTeam.name} or Draw`,
      probability: doubleChanceProb,
      confidence: dcConfidence,
      edge: dcEdgeResult.edge,
      impliedProbability: dcEdgeResult.impliedProbability,
      bookmakerOdds: dcBookOdds || undefined,
      risk,
      reasoning: [
        `${homeTier} tier home vs ${awayTier} tier away`,
        `Combined probability: ${(doubleChanceProb * 100).toFixed(0)}%`,
      ],
      warnings: [...warnings],
      category: dcEdgeResult.edge >= 5 ? 'VALUE' : 'SPECULATIVE',
      dataQuality,
      modelAgreement: homeStrength >= awayStrength ? 70 : 50,
    });
  }

  return suggestions.sort((a, b) => {
    if (a.bookmakerOdds && !b.bookmakerOdds) return -1;
    if (!a.bookmakerOdds && b.bookmakerOdds) return 1;
    return b.edge - a.edge;
  });
}

// ============== HELPERS ==============

export function getLeagueBadgeColor(leagueId: number): string {
  const colors: Record<number, string> = {
    39: 'bg-purple-500/20 text-purple-400',
    40: 'bg-purple-500/10 text-purple-300',
    140: 'bg-orange-500/20 text-orange-400',
    141: 'bg-orange-500/10 text-orange-300',
    135: 'bg-blue-500/20 text-blue-400',
    136: 'bg-blue-500/10 text-blue-300',
    78: 'bg-red-500/20 text-red-400',
    79: 'bg-red-500/10 text-red-300',
    61: 'bg-sky-500/20 text-sky-400',
    2: 'bg-indigo-500/20 text-indigo-400',
    3: 'bg-amber-500/20 text-amber-400',
    848: 'bg-green-500/20 text-green-400',
    179: 'bg-teal-500/20 text-teal-400',
    180: 'bg-teal-500/10 text-teal-300',
    143: 'bg-yellow-500/20 text-yellow-400',
    137: 'bg-cyan-500/20 text-cyan-400',
    81: 'bg-pink-500/20 text-pink-400',
    45: 'bg-fuchsia-500/20 text-fuchsia-400',
    48: 'bg-rose-500/20 text-rose-400',
  };
  return colors[leagueId] || 'bg-slate-500/20 text-slate-400';
}

export function formatKickoff(date: Date): string {
  return date.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', hour12: false });
}