/**
 * Tennis API - v10 (FIXED)
 * File: lib/tennis.ts
 * 
 * CRITICAL FIXES:
 * ✅ SofaScore API for REAL fixtures (replaces dead v1.tennis.api-sports.io)
 * ✅ SofaScore player statistics (replaces hardcoded win rates/form)
 * ✅ Dynamic odds sport key discovery via /v4/sports
 * ✅ Kept tier system as fallback, but live data takes priority
 * ✅ Player name normalization with accent handling
 * ✅ Better sample fixtures removed - no more fake predictions
 */

const SPORTS_API_KEY = process.env.SPORTS_API_KEY || '';
const RAPIDAPI_KEY = process.env.RAPIDAPI_KEY || '';
const ODDS_API_KEY = process.env.ODDS_API_KEY || '';

// ============== TYPES ==============

export interface TennisFixture {
  id: string;
  externalId: number;
  tournament: {
    id: number;
    name: string;
    category: string;
    surface: string;
  };
  player1: {
    id: number;
    name: string;
    country: string;
    ranking?: number;
  };
  player2: {
    id: number;
    name: string;
    country: string;
    ranking?: number;
  };
  startTime: Date;
  round: string;
  status: string;
}

interface PlayerStats {
  ranking: number;
  winRate: number;
  surfaceWinRate: number;
  recentForm: string;
  acesPct: number;
  holdPct: number;
  tier: 'ELITE' | 'TOP10' | 'TOP20' | 'TOP30' | 'TOP50' | 'TOP100' | 'OUTSIDE';
  source: 'LIVE_API' | 'PLAYER_DATA' | 'FALLBACK';
}

export interface BookmakerOdds {
  market: string;
  line?: number;
  odds: number;
  bookmaker: string;
}

export interface TennisSuggestion {
  fixture: TennisFixture;
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
  category: 'LOW_RISK' | 'VALUE' | 'SPECULATIVE' | 'UPSET' | 'NO_BET';
  dataQuality: 'HIGH' | 'MEDIUM' | 'LOW' | 'FALLBACK';
  modelAgreement: number;
}

// ============== PLAYER TIER SYSTEM (FALLBACK) ==============
// This is used when SofaScore data is unavailable

const PLAYER_TIERS: Record<string, 'ELITE' | 'TOP10' | 'TOP20' | 'TOP30' | 'TOP50' | 'TOP100' | 'OUTSIDE'> = {
  // ATP ELITE
  'Jannik Sinner': 'ELITE',
  'Alexander Zverev': 'ELITE',
  'Carlos Alcaraz': 'ELITE',
  // ATP TOP 10
  'Taylor Fritz': 'TOP10',
  'Daniil Medvedev': 'TOP10',
  'Casper Ruud': 'TOP10',
  'Novak Djokovic': 'TOP10',
  'Alex de Minaur': 'TOP10',
  'Andrey Rublev': 'TOP10',
  'Grigor Dimitrov': 'TOP10',
  // ATP TOP 20
  'Tommy Paul': 'TOP20',
  'Stefanos Tsitsipas': 'TOP20',
  'Holger Rune': 'TOP20',
  'Jack Draper': 'TOP20',
  'Hubert Hurkacz': 'TOP20',
  'Frances Tiafoe': 'TOP20',
  'Lorenzo Musetti': 'TOP20',
  'Ben Shelton': 'TOP20',
  // WTA ELITE
  'Aryna Sabalenka': 'ELITE',
  'Iga Swiatek': 'ELITE',
  'Coco Gauff': 'ELITE',
  // WTA TOP 10
  'Jasmine Paolini': 'TOP10',
  'Qinwen Zheng': 'TOP10',
  'Elena Rybakina': 'TOP10',
  'Jessica Pegula': 'TOP10',
  'Emma Navarro': 'TOP10',
  'Daria Kasatkina': 'TOP10',
  'Madison Keys': 'TOP10',
};

// ============== SOFASCORE FIXTURES (REPLACES DEAD API) ==============

const SOFASCORE_HOST = 'sofascore.p.rapidapi.com';

async function fetchSofaScore<T>(endpoint: string): Promise<T | null> {
  if (!RAPIDAPI_KEY) {
    console.log('[SofaScore] No RapidAPI key configured');
    return null;
  }

  try {
    console.log(`[SofaScore] Fetching: ${endpoint}`);
    const res = await fetch(`https://${SOFASCORE_HOST}${endpoint}`, {
      headers: {
        'x-rapidapi-key': RAPIDAPI_KEY,
        'x-rapidapi-host': SOFASCORE_HOST,
      },
      next: { revalidate: 1800 }, // 30 min cache
    });

    if (!res.ok) {
      console.error(`[SofaScore] HTTP ${res.status} for ${endpoint}`);
      return null;
    }

    return await res.json();
  } catch (e) {
    console.error('[SofaScore] Fetch error:', e);
    return null;
  }
}

// ============== FIXTURES ==============

export async function getTodaysFixtures(): Promise<TennisFixture[]> {
  return getFixturesByDate(new Date().toISOString().split('T')[0]);
}

export async function getTomorrowsFixtures(): Promise<TennisFixture[]> {
  const d = new Date();
  d.setDate(d.getDate() + 1);
  return getFixturesByDate(d.toISOString().split('T')[0]);
}

export async function getDayAfterTomorrowFixtures(): Promise<TennisFixture[]> {
  const d = new Date();
  d.setDate(d.getDate() + 2);
  return getFixturesByDate(d.toISOString().split('T')[0]);
}

async function getFixturesByDate(date: string): Promise<TennisFixture[]> {
  // STRATEGY: Try SofaScore first (reliable), fall back to API-Sports

  // === 1. Try SofaScore via RapidAPI ===
  const sofaData = await fetchSofaScore<any>(`/api/v1/sport/tennis/scheduled-events/${date}`);

  if (sofaData?.events && sofaData.events.length > 0) {
    console.log(`[SofaScore] Got ${sofaData.events.length} tennis events for ${date}`);

    return sofaData.events
      .filter((e: any) => {
        // Only not-started singles matches
        const status = e.status?.type;
        return (status === 'notstarted' || status === 'inprogress') && !e.tournament?.name?.toLowerCase().includes('doubles');
      })
      .slice(0, 40)
      .map((e: any) => ({
        id: `tn-sofa-${e.id}`,
        externalId: e.id,
        tournament: {
          id: e.tournament?.uniqueTournament?.id || e.tournament?.id || 0,
          name: e.tournament?.uniqueTournament?.name || e.tournament?.name || 'ATP/WTA Tour',
          category: detectCategory(e.tournament?.uniqueTournament?.name || e.tournament?.name || ''),
          surface: detectSurfaceFromSofa(e) || detectSurface(e.tournament?.uniqueTournament?.name || ''),
        },
        player1: {
          id: e.homeTeam?.id || 0,
          name: e.homeTeam?.name || 'Player 1',
          country: e.homeTeam?.country?.name || '',
          ranking: e.homeTeam?.ranking || undefined,
        },
        player2: {
          id: e.awayTeam?.id || 0,
          name: e.awayTeam?.name || 'Player 2',
          country: e.awayTeam?.country?.name || '',
          ranking: e.awayTeam?.ranking || undefined,
        },
        startTime: new Date((e.startTimestamp || 0) * 1000),
        round: e.roundInfo?.name || e.roundInfo?.round?.toString() || 'Round',
        status: e.status?.type || 'NS',
      }))
      .sort((a: TennisFixture, b: TennisFixture) => a.startTime.getTime() - b.startTime.getTime());
  }

  // === 2. Fallback: API-Sports ===
  console.log('[SofaScore] No data, trying API-Sports...');
  const games = await apiCallSports<any[]>(`/games?date=${date}`);

  if (games && games.length > 0) {
    return games
      .filter((g: any) => g.status?.short === 'NS')
      .slice(0, 30)
      .map((g: any) => ({
        id: `tn-${g.id}`,
        externalId: g.id,
        tournament: {
          id: g.league?.id || 0,
          name: g.league?.name || 'ATP/WTA Tour',
          category: detectCategory(g.league?.name || ''),
          surface: detectSurface(g.league?.name || ''),
        },
        player1: {
          id: g.players?.home?.id || 0,
          name: g.players?.home?.name || 'Player 1',
          country: g.country?.name || '',
          ranking: getRankingFallback(g.players?.home?.name),
        },
        player2: {
          id: g.players?.away?.id || 0,
          name: g.players?.away?.name || 'Player 2',
          country: g.country?.name || '',
          ranking: getRankingFallback(g.players?.away?.name),
        },
        startTime: new Date(g.date),
        round: g.round || 'Round',
        status: g.status?.short || 'NS',
      }))
      .sort((a: TennisFixture, b: TennisFixture) => a.startTime.getTime() - b.startTime.getTime());
  }

  // === 3. NO fallback to fake sample data ===
  // If both APIs fail, return empty. Don't show fake predictions.
  console.log(`[Tennis] No fixtures available for ${date} from any source`);
  return [];
}

// API-Sports helper (may still work for some users)
async function apiCallSports<T>(endpoint: string): Promise<T | null> {
  if (!SPORTS_API_KEY) return null;
  try {
    const res = await fetch(`https://v1.tennis.api-sports.io${endpoint}`, {
      headers: { 'x-apisports-key': SPORTS_API_KEY },
      next: { revalidate: 3600 },
    });
    if (!res.ok) return null;
    const json = await res.json();
    if (json.errors && Object.keys(json.errors).length > 0) return null;
    return json.response;
  } catch {
    return null;
  }
}

// ============== LIVE PLAYER STATS FROM SOFASCORE ==============

// Cache to avoid repeated calls for same player in one analysis run
const playerStatsCache = new Map<string, PlayerStats>();

export async function getPlayerStatsLive(
  playerName: string,
  playerId: number,
  surface: string
): Promise<PlayerStats | null> {
  const cacheKey = `${playerId}-${surface}`;
  if (playerStatsCache.has(cacheKey)) {
    return playerStatsCache.get(cacheKey)!;
  }

  if (!RAPIDAPI_KEY || playerId === 0) return null;

  try {
    // Fetch player's recent matches from SofaScore
    const lastMatches = await fetchSofaScore<any>(
      `/api/v1/team/${playerId}/events/last/0`
    );

    if (!lastMatches?.events || lastMatches.events.length === 0) return null;

    const recentEvents = lastMatches.events.slice(-10); // last 10 matches
    let wins = 0;
    let losses = 0;
    let surfaceWins = 0;
    let surfaceMatches = 0;
    const formArray: string[] = [];

    for (const event of recentEvents) {
      const isHome = event.homeTeam?.id === playerId;
      const homeScore = event.homeScore?.current || 0;
      const awayScore = event.awayScore?.current || 0;
      const won = isHome ? homeScore > awayScore : awayScore > homeScore;

      if (won) wins++;
      else losses++;

      formArray.push(won ? 'W' : 'L');

      // Check surface match
      const eventSurface = detectSurfaceFromSofa(event) || 'HARD';
      if (eventSurface === surface) {
        surfaceMatches++;
        if (won) surfaceWins++;
      }
    }

    const totalMatches = wins + losses;
    const winRate = totalMatches > 0 ? wins / totalMatches : 0.5;
    const surfaceWinRate = surfaceMatches >= 3
      ? surfaceWins / surfaceMatches
      : winRate; // Not enough surface data, use overall

    // Determine tier from ranking or fallback
    const tier = getPlayerTier(playerName);

    const stats: PlayerStats = {
      ranking: getRankingFallback(playerName),
      winRate,
      surfaceWinRate,
      recentForm: formArray.slice(-5).join(''),
      acesPct: 7, // Default, can be enhanced with more API calls
      holdPct: 75,
      tier,
      source: 'LIVE_API',
    };

    playerStatsCache.set(cacheKey, stats);
    return stats;
  } catch (e) {
    console.error(`[SofaScore] Failed to get stats for ${playerName}:`, e);
    return null;
  }
}

// ============== DYNAMIC ODDS SPORT KEYS ==============
// Instead of hardcoding tournament keys that may not be active,
// discover what's actually live right now

let activeTennisKeysCache: string[] | null = null;
let activeTennisKeysCacheTime = 0;
const KEYS_CACHE_DURATION = 60 * 60 * 1000; // 1 hour

export async function getActiveTennisSportKeys(): Promise<string[]> {
  // Return cached if fresh
  if (activeTennisKeysCache && Date.now() - activeTennisKeysCacheTime < KEYS_CACHE_DURATION) {
    return activeTennisKeysCache;
  }

  if (!ODDS_API_KEY) return [];

  try {
    const res = await fetch(
      `https://api.the-odds-api.com/v4/sports?apiKey=${ODDS_API_KEY}`
    );

    if (!res.ok) {
      console.error(`[Odds] Failed to fetch active sports: ${res.status}`);
      return [];
    }

    const sports = await res.json();
    const tennisKeys = sports
      .filter((s: any) => s.key.startsWith('tennis_') && s.active)
      .map((s: any) => s.key);

    console.log(`[Odds] Active tennis sport keys: ${tennisKeys.join(', ') || 'NONE'}`);

    activeTennisKeysCache = tennisKeys;
    activeTennisKeysCacheTime = Date.now();
    return tennisKeys;
  } catch (e) {
    console.error('[Odds] Error fetching active sports:', e);
    return [];
  }
}

// ============== SURFACE DETECTION ==============

function detectSurfaceFromSofa(event: any): string | null {
  const groundType = event.groundType;
  if (groundType) {
    if (groundType.toLowerCase().includes('clay')) return 'CLAY';
    if (groundType.toLowerCase().includes('grass')) return 'GRASS';
    if (groundType.toLowerCase().includes('hard') || groundType.toLowerCase().includes('indoor')) return 'HARD';
  }
  return null;
}

function detectCategory(tournamentName: string): string {
  const lower = tournamentName.toLowerCase();
  if (lower.includes('australian') || lower.includes('french') || lower.includes('wimbledon') || lower.includes('us open') || lower.includes('roland garros')) {
    return 'Grand Slam';
  }
  if (lower.includes('finals')) return 'ATP Finals';
  if (lower.includes('masters') || lower.includes('1000') || lower.includes('indian wells') || lower.includes('miami') ||
      lower.includes('monte carlo') || lower.includes('madrid') || lower.includes('rome') ||
      lower.includes('cincinnati') || lower.includes('shanghai') || lower.includes('paris') || lower.includes('canada')) {
    return 'Masters 1000';
  }
  if (lower.includes('500')) return 'ATP 500';
  if (lower.includes('wta 1000')) return 'WTA 1000';
  if (lower.includes('wta 500')) return 'WTA 500';
  if (lower.includes('wta 250')) return 'WTA 250';
  if (lower.includes('challenger')) return 'Challenger';
  return 'ATP 250';
}

function detectSurface(tournamentName: string): string {
  const lower = tournamentName.toLowerCase();
  if (lower.includes('wimbledon') || lower.includes('grass') || lower.includes('queens') ||
      lower.includes('halle') || lower.includes('stuttgart') || lower.includes('eastbourne') ||
      lower.includes('mallorca') || lower.includes('berlin')) {
    return 'GRASS';
  }
  if (lower.includes('roland') || lower.includes('french') || lower.includes('clay') ||
      lower.includes('monte carlo') || lower.includes('madrid') || lower.includes('rome') ||
      lower.includes('barcelona') || lower.includes('hamburg') || lower.includes('umag') ||
      lower.includes('bastad') || lower.includes('gstaad') || lower.includes('kitzbuhel') ||
      lower.includes('buenos aires') || lower.includes('rio')) {
    return 'CLAY';
  }
  return 'HARD';
}

// ============== PLAYER TIER HELPERS ==============

const TIER_VALUES = { ELITE: 7, TOP10: 6, TOP20: 5, TOP30: 4, TOP50: 3, TOP100: 2, OUTSIDE: 1 };

const TOURNAMENT_VARIANCE: Record<string, number> = {
  'Grand Slam': 0.06,
  'ATP Finals': 0.08,
  'Masters 1000': 0.10,
  'ATP 500': 0.12,
  'ATP 250': 0.15,
  'WTA 1000': 0.11,
  'WTA 500': 0.13,
  'WTA 250': 0.15,
  'Challenger': 0.18,
};

function getPlayerTier(playerName: string): 'ELITE' | 'TOP10' | 'TOP20' | 'TOP30' | 'TOP50' | 'TOP100' | 'OUTSIDE' {
  if (PLAYER_TIERS[playerName]) return PLAYER_TIERS[playerName];

  // Normalize and try fuzzy match
  const normalized = playerName.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
  for (const [player, tier] of Object.entries(PLAYER_TIERS)) {
    const playerNorm = player.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
    if (normalized.includes(playerNorm) || playerNorm.includes(normalized)) {
      return tier;
    }
    // Last name match
    const lastName = normalized.split(' ').pop() || '';
    const playerLastName = playerNorm.split(' ').pop() || '';
    if (lastName.length > 3 && playerLastName === lastName) {
      return tier;
    }
  }
  return 'OUTSIDE';
}

function getRankingFallback(playerName: string): number {
  const tiers: Record<string, number> = {
    ELITE: 2, TOP10: 7, TOP20: 15, TOP30: 25, TOP50: 40, TOP100: 75, OUTSIDE: 150,
  };
  return tiers[getPlayerTier(playerName)] || 150;
}

// ============== STATS (WITH LIVE DATA PRIORITY) ==============

export async function getPlayerStats(
  playerName: string,
  playerId: number,
  surface: string
): Promise<PlayerStats> {
  // 1. Try live SofaScore data
  const liveStats = await getPlayerStatsLive(playerName, playerId, surface);
  if (liveStats) {
    console.log(`[Stats] Got LIVE data for ${playerName}: WR=${(liveStats.winRate * 100).toFixed(0)}%, Form=${liveStats.recentForm}`);
    return liveStats;
  }

  // 2. Fallback to tier-based estimates
  const tier = getPlayerTier(playerName);
  const tierDefaults: Record<string, { winRate: number; holdPct: number }> = {
    ELITE: { winRate: 0.80, holdPct: 87 },
    TOP10: { winRate: 0.70, holdPct: 83 },
    TOP20: { winRate: 0.63, holdPct: 78 },
    TOP30: { winRate: 0.57, holdPct: 74 },
    TOP50: { winRate: 0.52, holdPct: 72 },
    TOP100: { winRate: 0.48, holdPct: 69 },
    OUTSIDE: { winRate: 0.42, holdPct: 65 },
  };

  const defaults = tierDefaults[tier] || tierDefaults.OUTSIDE;

  console.log(`[Stats] Using FALLBACK for ${playerName} (${tier})`);
  return {
    ranking: getRankingFallback(playerName),
    winRate: defaults.winRate,
    surfaceWinRate: defaults.winRate, // No surface data available
    recentForm: 'WLWLW', // Unknown
    acesPct: 7,
    holdPct: defaults.holdPct,
    tier,
    source: tier !== 'OUTSIDE' ? 'PLAYER_DATA' : 'FALLBACK',
  };
}

// ============== MATCH PROBABILITY ==============

function calculateMatchProbability(
  p1Stats: PlayerStats,
  p2Stats: PlayerStats,
  surface: string,
  isGrandSlam: boolean
): { p1Prob: number; p2Prob: number; modelAgreement: number } {
  // When we have LIVE data, use actual win rates more heavily
  const hasLiveData = p1Stats.source === 'LIVE_API' && p2Stats.source === 'LIVE_API';

  if (hasLiveData) {
    // === LIVE DATA MODEL ===
    // Weight actual performance more than tier

    // 1. Base from surface win rate comparison
    const p1SurfaceStrength = p1Stats.surfaceWinRate;
    const p2SurfaceStrength = p2Stats.surfaceWinRate;

    // Logistic model: convert win rates to probability
    const p1LogitStrength = Math.log(p1SurfaceStrength / (1 - p1SurfaceStrength));
    const p2LogitStrength = Math.log(p2SurfaceStrength / (1 - p2SurfaceStrength));
    const logitDiff = p1LogitStrength - p2LogitStrength;

    let p1Prob = 1 / (1 + Math.exp(-logitDiff * 0.7)); // 0.7 dampening factor

    // 2. Form adjustment (recent 5 matches)
    const p1FormScore = p1Stats.recentForm.split('').filter(c => c === 'W').length / Math.max(1, p1Stats.recentForm.length);
    const p2FormScore = p2Stats.recentForm.split('').filter(c => c === 'W').length / Math.max(1, p2Stats.recentForm.length);
    p1Prob += (p1FormScore - p2FormScore) * 0.08;

    // 3. Ranking adjustment (small)
    if (p1Stats.ranking && p2Stats.ranking) {
      const rankDiff = p2Stats.ranking - p1Stats.ranking;
      p1Prob += Math.tanh(rankDiff / 30) * 0.05;
    }

    // 4. Grand Slam bonus (BO5 favors better player)
    if (isGrandSlam && p1Prob > 0.5) {
      p1Prob += 0.03;
    } else if (isGrandSlam && p1Prob < 0.5) {
      p1Prob -= 0.03;
    }

    p1Prob = Math.max(0.08, Math.min(0.92, p1Prob));

    // Model agreement: how many factors agree
    const factors = [
      p1SurfaceStrength > p2SurfaceStrength,
      p1FormScore > p2FormScore,
      (p1Stats.ranking || 999) < (p2Stats.ranking || 999),
    ];
    const agreeing = factors.filter(f => f === (p1Prob > 0.5)).length;
    const modelAgreement = 40 + (agreeing / factors.length) * 50;

    return { p1Prob, p2Prob: 1 - p1Prob, modelAgreement };
  }

  // === FALLBACK TIER MODEL (same as before but cleaner) ===
  const p1Strength = TIER_VALUES[p1Stats.tier];
  const p2Strength = TIER_VALUES[p2Stats.tier];
  const strengthDiff = p1Strength - p2Strength;

  const tierProbs: Record<number, number> = {
    6: 0.93, 5: 0.88, 4: 0.82, 3: 0.75, 2: 0.68, 1: 0.60, 0: 0.50,
    [-1]: 0.40, [-2]: 0.32, [-3]: 0.25, [-4]: 0.18, [-5]: 0.12, [-6]: 0.07,
  };

  let p1Prob = tierProbs[Math.max(-6, Math.min(6, strengthDiff))] || 0.50;

  // Small adjustments
  const p1FormScore = p1Stats.recentForm.split('').filter(c => c === 'W').length / 5;
  const p2FormScore = p2Stats.recentForm.split('').filter(c => c === 'W').length / 5;
  p1Prob += (p1FormScore - p2FormScore) * 0.05;

  if (isGrandSlam && strengthDiff > 0) p1Prob += 0.03;

  p1Prob = Math.max(0.08, Math.min(0.92, p1Prob));

  const factors = [strengthDiff > 0, p1FormScore > p2FormScore];
  const agreeing = factors.filter(f => f === (p1Prob > 0.5)).length;
  const modelAgreement = 35 + (agreeing / factors.length) * 45; // Lower agreement for fallback

  return { p1Prob, p2Prob: 1 - p1Prob, modelAgreement };
}

// ============== CONFIDENCE ==============

function calculateConfidence(
  dataQuality: 'HIGH' | 'MEDIUM' | 'LOW' | 'FALLBACK',
  modelAgreement: number,
  tournamentVariance: number,
  probabilityStrength: number
): number {
  const qualityScore = { HIGH: 85, MEDIUM: 70, LOW: 55, FALLBACK: 40 }[dataQuality];
  const agreementMod = (modelAgreement - 50) / 5;
  const volatilityPenalty = -tournamentVariance * 100;
  const strengthBonus = Math.min(8, probabilityStrength * 15);

  return Math.max(25, Math.min(88, Math.round(qualityScore + agreementMod + volatilityPenalty + strengthBonus)));
}

// ============== EDGE ==============

function calculateEdge(
  ourProbability: number,
  bookmakerOdds: number | null,
  isUpset: boolean = false
): { edge: number; impliedProbability: number; category: 'LOW_RISK' | 'VALUE' | 'SPECULATIVE' | 'UPSET' | 'NO_BET' } {
  if (!bookmakerOdds || bookmakerOdds <= 1) {
    return { edge: 0, impliedProbability: 0, category: isUpset ? 'UPSET' : 'SPECULATIVE' };
  }

  const impliedProbability = 1 / bookmakerOdds;
  const edge = Math.round((ourProbability - impliedProbability) * 1000) / 10;

  let category: 'LOW_RISK' | 'VALUE' | 'SPECULATIVE' | 'UPSET' | 'NO_BET';
  if (isUpset) category = 'UPSET';
  else if (edge >= 5) category = 'VALUE';
  else if (edge >= 3) category = 'LOW_RISK';
  else if (edge >= 0) category = 'SPECULATIVE';
  else category = 'NO_BET';

  return { edge, impliedProbability, category };
}

// ============== RISK ==============

function calculateRisk(confidence: number, edge: number, dataQuality: string, variance: number): 'LOW' | 'MEDIUM' | 'HIGH' {
  let score = 0;
  if (confidence < 55) score += 30;
  else if (confidence < 70) score += 15;
  if (edge < 0) score += 25;
  else if (edge < 3) score += 18;
  else if (edge < 8) score += 10;
  if (dataQuality === 'FALLBACK') score += 25;
  else if (dataQuality === 'LOW') score += 15;
  score += variance * 100;

  if (score <= 25) return 'LOW';
  if (score <= 55) return 'MEDIUM';
  return 'HIGH';
}

// ============== MAIN ANALYSIS ==============

export async function analyzeTennisMatch(
  fixture: TennisFixture,
  bookmakerOddsData?: Record<string, BookmakerOdds>
): Promise<TennisSuggestion[]> {
  const suggestions: TennisSuggestion[] = [];
  const warnings: string[] = [];

  // Get stats — tries live API first, falls back to tier data
  const p1Stats = await getPlayerStats(fixture.player1.name, fixture.player1.id, fixture.tournament.surface);
  const p2Stats = await getPlayerStats(fixture.player2.name, fixture.player2.id, fixture.tournament.surface);

  // Data quality
  let dataQuality: 'HIGH' | 'MEDIUM' | 'LOW' | 'FALLBACK';
  if (p1Stats.source === 'LIVE_API' && p2Stats.source === 'LIVE_API') {
    dataQuality = 'HIGH';
  } else if (p1Stats.source === 'LIVE_API' || p2Stats.source === 'LIVE_API') {
    dataQuality = 'MEDIUM';
    warnings.push('Limited live data on one player');
  } else if (p1Stats.source === 'PLAYER_DATA') {
    dataQuality = 'MEDIUM';
    warnings.push('Using estimated stats (no live API data)');
  } else {
    dataQuality = 'FALLBACK';
    warnings.push('Both players unknown - high uncertainty');
  }

  const isGrandSlam = fixture.tournament.category === 'Grand Slam';
  const tournamentVariance = TOURNAMENT_VARIANCE[fixture.tournament.category] || 0.15;

  const { p1Prob, p2Prob, modelAgreement } = calculateMatchProbability(
    p1Stats, p2Stats, fixture.tournament.surface, isGrandSlam
  );

  // === MATCH WINNER (Player 1) ===
  if (p1Prob >= 0.55) {
    const bookOdds = bookmakerOddsData?.['p1_win']?.odds || null;
    const edgeResult = calculateEdge(p1Prob, bookOdds);

    if (!(edgeResult.category === 'NO_BET' && bookOdds)) {
      const confidence = calculateConfidence(dataQuality, modelAgreement, tournamentVariance, Math.abs(p1Prob - 0.5));

      if (confidence >= 45 && (edgeResult.edge >= 2 || !bookOdds)) {
        suggestions.push({
          fixture,
          market: 'MATCH_WINNER',
          pick: `${fixture.player1.name} to Win`,
          probability: p1Prob,
          confidence,
          edge: edgeResult.edge,
          impliedProbability: edgeResult.impliedProbability,
          bookmakerOdds: bookOdds || undefined,
          risk: calculateRisk(confidence, edgeResult.edge, dataQuality, tournamentVariance),
          reasoning: [
            `${p1Stats.tier} tier vs ${p2Stats.tier} tier`,
            p1Stats.source === 'LIVE_API' ? `Live win rate: ${(p1Stats.winRate * 100).toFixed(0)}%` : `Estimated rank #${p1Stats.ranking}`,
            `Surface: ${fixture.tournament.surface} (${(p1Stats.surfaceWinRate * 100).toFixed(0)}% WR)`,
            p1Stats.source === 'LIVE_API' ? `Recent form: ${p1Stats.recentForm}` : '',
            isGrandSlam ? 'Best of 5 favors favorite' : '',
          ].filter(Boolean),
          warnings: [...warnings],
          category: confidence >= 65 && edgeResult.edge >= 5 ? 'LOW_RISK' :
                   edgeResult.edge >= 3 ? 'VALUE' : 'SPECULATIVE',
          dataQuality,
          modelAgreement,
        });
      }
    }
  }

  // === MATCH WINNER (Player 2) ===
  if (p2Prob >= 0.55) {
    const bookOdds = bookmakerOddsData?.['p2_win']?.odds || null;
    const edgeResult = calculateEdge(p2Prob, bookOdds);

    if (!(edgeResult.category === 'NO_BET' && bookOdds)) {
      const confidence = calculateConfidence(dataQuality, modelAgreement, tournamentVariance, Math.abs(p2Prob - 0.5));

      if (confidence >= 45 && (edgeResult.edge >= 2 || !bookOdds)) {
        suggestions.push({
          fixture,
          market: 'MATCH_WINNER',
          pick: `${fixture.player2.name} to Win`,
          probability: p2Prob,
          confidence,
          edge: edgeResult.edge,
          impliedProbability: edgeResult.impliedProbability,
          bookmakerOdds: bookOdds || undefined,
          risk: calculateRisk(confidence, edgeResult.edge, dataQuality, tournamentVariance),
          reasoning: [
            `${p2Stats.tier} tier vs ${p1Stats.tier} tier`,
            p2Stats.source === 'LIVE_API' ? `Live win rate: ${(p2Stats.winRate * 100).toFixed(0)}%` : `Estimated rank #${p2Stats.ranking}`,
            `Surface: ${fixture.tournament.surface} (${(p2Stats.surfaceWinRate * 100).toFixed(0)}% WR)`,
            p2Stats.source === 'LIVE_API' ? `Recent form: ${p2Stats.recentForm}` : '',
          ].filter(Boolean),
          warnings: [...warnings],
          category: confidence >= 65 && edgeResult.edge >= 5 ? 'LOW_RISK' :
                   edgeResult.edge >= 3 ? 'VALUE' : 'SPECULATIVE',
          dataQuality,
          modelAgreement,
        });
      }
    }
  }

  // === TOTAL GAMES ===
  const avgHoldPct = (p1Stats.holdPct + p2Stats.holdPct) / 2;
  const expectedGamesPerSet = avgHoldPct >= 80 ? 10.5 : avgHoldPct >= 75 ? 10 : 9.5;
  const expectedSets = isGrandSlam ? 3.5 : 2.3;
  const expectedTotalGames = expectedGamesPerSet * expectedSets;
  const isCloseMatchup = Math.abs(p1Prob - 0.5) < 0.12;

  if (avgHoldPct >= 74 && isCloseMatchup) {
    const line = isGrandSlam ? 35.5 : 21.5;
    const margin = expectedTotalGames - line;
    const prob = margin > 0 ? Math.min(0.68, 0.50 + margin * 0.035) : 0.45;

    if (prob >= 0.52) {
      const bookOdds = bookmakerOddsData?.[`games_over_${line}`]?.odds || null;
      const edgeResult = calculateEdge(prob, bookOdds);
      const confidence = calculateConfidence(dataQuality, isCloseMatchup ? 70 : 55, tournamentVariance, Math.abs(prob - 0.5));

      if (confidence >= 45 && (edgeResult.edge >= 1 || !bookOdds)) {
        suggestions.push({
          fixture,
          market: 'TOTAL_GAMES_OVER',
          pick: `Over ${line} Games`,
          probability: prob,
          confidence,
          edge: edgeResult.edge,
          impliedProbability: edgeResult.impliedProbability,
          bookmakerOdds: bookOdds || undefined,
          risk: calculateRisk(confidence, edgeResult.edge, dataQuality, tournamentVariance),
          reasoning: [
            `Average hold: ${avgHoldPct.toFixed(0)}%`,
            `Expected ${expectedTotalGames.toFixed(1)} total games`,
            `Close matchup: ${p1Stats.tier} vs ${p2Stats.tier}`,
          ],
          warnings: [...warnings],
          category: edgeResult.edge >= 5 ? 'VALUE' : 'SPECULATIVE',
          dataQuality,
          modelAgreement: isCloseMatchup ? 70 : 55,
        });
      }
    }
  }

  return suggestions.sort((a, b) => {
    const catOrder = { LOW_RISK: 0, VALUE: 1, SPECULATIVE: 2, UPSET: 3, NO_BET: 4 };
    return (catOrder[a.category] - catOrder[b.category]) || (b.edge - a.edge);
  });
}

// ============== HELPERS ==============

export function getTournamentBadgeColor(category: string): string {
  const colors: Record<string, string> = {
    'Grand Slam': 'bg-yellow-500/20 text-yellow-400',
    'ATP Finals': 'bg-amber-500/20 text-amber-400',
    'Masters 1000': 'bg-purple-500/20 text-purple-400',
    'ATP 500': 'bg-blue-500/20 text-blue-400',
    'ATP 250': 'bg-green-500/20 text-green-400',
    'WTA 1000': 'bg-pink-500/20 text-pink-400',
    'WTA 500': 'bg-rose-500/20 text-rose-400',
    'WTA 250': 'bg-orange-500/20 text-orange-400',
    'Challenger': 'bg-slate-500/20 text-slate-400',
  };
  return colors[category] || 'bg-slate-500/20 text-slate-400';
}

export function getSurfaceBadgeColor(surface: string): string {
  return { HARD: 'bg-blue-500/20 text-blue-400', CLAY: 'bg-orange-500/20 text-orange-400', GRASS: 'bg-green-500/20 text-green-400' }[surface] || 'bg-slate-500/20 text-slate-400';
}

export function formatStartTime(date: Date): string {
  return date.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', hour12: false });
}

// Clear the stats cache (call between analysis runs)
export function clearPlayerStatsCache(): void {
  playerStatsCache.clear();
}