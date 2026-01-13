/**
 * Tennis API - v1 (Rate Limit Safe)
 * File: lib/tennis-api.ts
 * 
 * Uses local ATP/WTA player data to avoid API rate limits
 * Only API call is for fixtures
 */

const API_KEY = process.env.SPORTS_API_KEY || '';
const API_HOST = 'v1.tennis.api-sports.io';

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
}

export interface TennisSuggestion {
  fixture: TennisFixture;
  market: string;
  pick: string;
  odds: number;
  confidence: number;
  probability: number;
  edge: number;
  risk: 'LOW' | 'MEDIUM' | 'HIGH';
  reasoning: string[];
  category: 'BANKER' | 'VALUE' | 'UPSET' | 'GAMES';
  dataQuality: 'HIGH' | 'MEDIUM' | 'LOW' | 'NO_DATA';
}

// ============== TOURNAMENTS ==============

export const TOP_TOURNAMENTS = [
  { id: 1, name: 'Australian Open', category: 'Grand Slam', surface: 'HARD' },
  { id: 2, name: 'French Open', category: 'Grand Slam', surface: 'CLAY' },
  { id: 3, name: 'Wimbledon', category: 'Grand Slam', surface: 'GRASS' },
  { id: 4, name: 'US Open', category: 'Grand Slam', surface: 'HARD' },
  { id: 5, name: 'ATP Finals', category: 'ATP', surface: 'HARD' },
  { id: 6, name: 'Indian Wells', category: 'Masters 1000', surface: 'HARD' },
  { id: 7, name: 'Miami Open', category: 'Masters 1000', surface: 'HARD' },
  { id: 8, name: 'Monte Carlo', category: 'Masters 1000', surface: 'CLAY' },
  { id: 9, name: 'Madrid Open', category: 'Masters 1000', surface: 'CLAY' },
  { id: 10, name: 'Rome Masters', category: 'Masters 1000', surface: 'CLAY' },
  { id: 11, name: 'Cincinnati Masters', category: 'Masters 1000', surface: 'HARD' },
  { id: 12, name: 'Shanghai Masters', category: 'Masters 1000', surface: 'HARD' },
  { id: 13, name: 'Paris Masters', category: 'Masters 1000', surface: 'HARD' },
  { id: 14, name: 'Canada Masters', category: 'Masters 1000', surface: 'HARD' },
];

// ============== ATP TOP PLAYERS DATA ==============

const ATP_PLAYERS: Record<string, PlayerStats> = {
  'Novak Djokovic': { ranking: 1, winRate: 0.83, surfaceWinRate: 0.85, recentForm: 'WWWWL', acesPct: 8, holdPct: 88 },
  'Jannik Sinner': { ranking: 2, winRate: 0.78, surfaceWinRate: 0.80, recentForm: 'WWWWW', acesPct: 9, holdPct: 86 },
  'Carlos Alcaraz': { ranking: 3, winRate: 0.79, surfaceWinRate: 0.82, recentForm: 'WLWWW', acesPct: 10, holdPct: 85 },
  'Daniil Medvedev': { ranking: 4, winRate: 0.74, surfaceWinRate: 0.78, recentForm: 'LWWWL', acesPct: 7, holdPct: 84 },
  'Alexander Zverev': { ranking: 5, winRate: 0.73, surfaceWinRate: 0.75, recentForm: 'WWLWW', acesPct: 11, holdPct: 83 },
  'Andrey Rublev': { ranking: 6, winRate: 0.71, surfaceWinRate: 0.72, recentForm: 'WLWLW', acesPct: 6, holdPct: 81 },
  'Hubert Hurkacz': { ranking: 7, winRate: 0.68, surfaceWinRate: 0.70, recentForm: 'LWWLW', acesPct: 12, holdPct: 82 },
  'Casper Ruud': { ranking: 8, winRate: 0.70, surfaceWinRate: 0.75, recentForm: 'WLWWL', acesPct: 5, holdPct: 80 },
  'Taylor Fritz': { ranking: 9, winRate: 0.67, surfaceWinRate: 0.72, recentForm: 'WWLWL', acesPct: 10, holdPct: 81 },
  'Grigor Dimitrov': { ranking: 10, winRate: 0.66, surfaceWinRate: 0.68, recentForm: 'LWWLW', acesPct: 7, holdPct: 79 },
  'Alex de Minaur': { ranking: 11, winRate: 0.68, surfaceWinRate: 0.70, recentForm: 'WWWLW', acesPct: 4, holdPct: 78 },
  'Stefanos Tsitsipas': { ranking: 12, winRate: 0.69, surfaceWinRate: 0.74, recentForm: 'LWLWW', acesPct: 8, holdPct: 80 },
  'Tommy Paul': { ranking: 13, winRate: 0.65, surfaceWinRate: 0.68, recentForm: 'WLWWL', acesPct: 6, holdPct: 77 },
  'Ben Shelton': { ranking: 14, winRate: 0.64, surfaceWinRate: 0.66, recentForm: 'LWWLW', acesPct: 14, holdPct: 79 },
  'Holger Rune': { ranking: 15, winRate: 0.65, surfaceWinRate: 0.67, recentForm: 'WLLWW', acesPct: 7, holdPct: 78 },
  'Ugo Humbert': { ranking: 16, winRate: 0.63, surfaceWinRate: 0.65, recentForm: 'WWLWL', acesPct: 8, holdPct: 77 },
  'Sebastian Korda': { ranking: 17, winRate: 0.62, surfaceWinRate: 0.64, recentForm: 'LWWLW', acesPct: 9, holdPct: 76 },
  'Frances Tiafoe': { ranking: 18, winRate: 0.61, surfaceWinRate: 0.65, recentForm: 'WLWLW', acesPct: 8, holdPct: 75 },
  'Karen Khachanov': { ranking: 19, winRate: 0.60, surfaceWinRate: 0.62, recentForm: 'LLWWW', acesPct: 9, holdPct: 76 },
  'Nicolas Jarry': { ranking: 20, winRate: 0.60, surfaceWinRate: 0.65, recentForm: 'WLWLW', acesPct: 10, holdPct: 75 },
};

// ============== WTA TOP PLAYERS DATA ==============

const WTA_PLAYERS: Record<string, PlayerStats> = {
  'Iga Swiatek': { ranking: 1, winRate: 0.85, surfaceWinRate: 0.90, recentForm: 'WWWWW', acesPct: 5, holdPct: 82 },
  'Aryna Sabalenka': { ranking: 2, winRate: 0.78, surfaceWinRate: 0.80, recentForm: 'WWLWW', acesPct: 7, holdPct: 80 },
  'Coco Gauff': { ranking: 3, winRate: 0.74, surfaceWinRate: 0.76, recentForm: 'WLWWW', acesPct: 6, holdPct: 78 },
  'Elena Rybakina': { ranking: 4, winRate: 0.73, surfaceWinRate: 0.78, recentForm: 'LWWWL', acesPct: 9, holdPct: 79 },
  'Jessica Pegula': { ranking: 5, winRate: 0.71, surfaceWinRate: 0.74, recentForm: 'WWLWL', acesPct: 4, holdPct: 76 },
  'Ons Jabeur': { ranking: 6, winRate: 0.70, surfaceWinRate: 0.72, recentForm: 'WLWLW', acesPct: 3, holdPct: 74 },
  'Qinwen Zheng': { ranking: 7, winRate: 0.69, surfaceWinRate: 0.71, recentForm: 'WWWLW', acesPct: 6, holdPct: 75 },
  'Maria Sakkari': { ranking: 8, winRate: 0.67, surfaceWinRate: 0.70, recentForm: 'LWWLW', acesPct: 5, holdPct: 73 },
  'Jelena Ostapenko': { ranking: 9, winRate: 0.65, surfaceWinRate: 0.68, recentForm: 'WLLWW', acesPct: 8, holdPct: 72 },
  'Barbora Krejcikova': { ranking: 10, winRate: 0.66, surfaceWinRate: 0.70, recentForm: 'LWWWL', acesPct: 4, holdPct: 71 },
};

// Combine all players
const ALL_PLAYERS: Record<string, PlayerStats> = { ...ATP_PLAYERS, ...WTA_PLAYERS };

// ============== API HELPER ==============

async function apiCall<T>(endpoint: string): Promise<T | null> {
  if (!API_KEY) {
    console.log('[Tennis API] No API key configured');
    return null;
  }
  
  try {
    console.log(`[Tennis API] ${endpoint}`);
    const res = await fetch(`https://${API_HOST}${endpoint}`, {
      headers: { 'x-apisports-key': API_KEY },
      next: { revalidate: 3600 },
    });
    
    if (!res.ok) {
      console.error('[Tennis API] HTTP Error:', res.status);
      return null;
    }
    
    const json = await res.json();
    if (json.errors && Object.keys(json.errors).length > 0) {
      console.error('[Tennis API] Error:', json.errors);
      return null;
    }
    
    return json.response;
  } catch (e) {
    console.error('[Tennis API] Fetch error:', e);
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

async function getFixturesByDate(date: string): Promise<TennisFixture[]> {
  const games = await apiCall<any[]>(`/games?date=${date}`);
  
  if (!games || games.length === 0) {
    console.log('[Tennis] No fixtures from API, using sample data');
    return getSampleFixtures();
  }

  return games
    .filter(g => g.status?.short === 'NS')
    .slice(0, 20)
    .map(g => ({
      id: `tn-${g.id}`,
      externalId: g.id,
      tournament: {
        id: g.league?.id || 0,
        name: g.league?.name || 'ATP/WTA Tour',
        category: g.league?.type || 'Tour',
        surface: detectSurface(g.league?.name || ''),
      },
      player1: {
        id: g.players?.home?.id || 0,
        name: g.players?.home?.name || 'Player 1',
        country: g.country?.name || '',
        ranking: getRanking(g.players?.home?.name),
      },
      player2: {
        id: g.players?.away?.id || 0,
        name: g.players?.away?.name || 'Player 2',
        country: g.country?.name || '',
        ranking: getRanking(g.players?.away?.name),
      },
      startTime: new Date(g.date),
      round: g.round || 'Round',
      status: g.status?.short || 'NS',
    }))
    .sort((a, b) => a.startTime.getTime() - b.startTime.getTime());
}

function detectSurface(tournamentName: string): string {
  const lower = tournamentName.toLowerCase();
  if (lower.includes('wimbledon') || lower.includes('grass')) return 'GRASS';
  if (lower.includes('roland') || lower.includes('french') || lower.includes('clay') || 
      lower.includes('monte carlo') || lower.includes('madrid') || lower.includes('rome')) return 'CLAY';
  return 'HARD';
}

function getRanking(playerName: string): number {
  return ALL_PLAYERS[playerName]?.ranking || 50;
}

// Sample fixtures when API unavailable
function getSampleFixtures(): TennisFixture[] {
  const now = new Date();
  return [
    {
      id: 'tn-sample-1',
      externalId: 1001,
      tournament: { id: 1, name: 'Australian Open', category: 'Grand Slam', surface: 'HARD' },
      player1: { id: 1, name: 'Jannik Sinner', country: 'Italy', ranking: 2 },
      player2: { id: 2, name: 'Taylor Fritz', country: 'USA', ranking: 9 },
      startTime: new Date(now.getTime() + 2 * 60 * 60 * 1000),
      round: 'Quarter Final',
      status: 'NS',
    },
    {
      id: 'tn-sample-2',
      externalId: 1002,
      tournament: { id: 1, name: 'Australian Open', category: 'Grand Slam', surface: 'HARD' },
      player1: { id: 3, name: 'Carlos Alcaraz', country: 'Spain', ranking: 3 },
      player2: { id: 4, name: 'Novak Djokovic', country: 'Serbia', ranking: 1 },
      startTime: new Date(now.getTime() + 4 * 60 * 60 * 1000),
      round: 'Semi Final',
      status: 'NS',
    },
    {
      id: 'tn-sample-3',
      externalId: 1003,
      tournament: { id: 1, name: 'WTA Adelaide', category: 'WTA 500', surface: 'HARD' },
      player1: { id: 5, name: 'Iga Swiatek', country: 'Poland', ranking: 1 },
      player2: { id: 6, name: 'Coco Gauff', country: 'USA', ranking: 3 },
      startTime: new Date(now.getTime() + 6 * 60 * 60 * 1000),
      round: 'Final',
      status: 'NS',
    },
  ];
}

// ============== STATS (Local data - NO API calls) ==============

function getPlayerStats(playerName: string, surface: string): PlayerStats {
  const player = ALL_PLAYERS[playerName];
  
  if (player) {
    // Adjust for surface
    let surfaceBonus = 0;
    if (surface === 'CLAY' && playerName.includes('Nadal')) surfaceBonus = 0.10;
    if (surface === 'CLAY' && playerName.includes('Swiatek')) surfaceBonus = 0.08;
    if (surface === 'GRASS' && playerName.includes('Djokovic')) surfaceBonus = 0.05;
    
    return {
      ...player,
      surfaceWinRate: Math.min(0.95, player.surfaceWinRate + surfaceBonus),
    };
  }
  
  // Default stats for unknown players
  return {
    ranking: 50,
    winRate: 0.50,
    surfaceWinRate: 0.50,
    recentForm: 'WLWLW',
    acesPct: 5,
    holdPct: 70,
  };
}

// ============== ANALYSIS ==============

export async function analyzeTennisMatch(fixture: TennisFixture): Promise<TennisSuggestion[]> {
  const suggestions: TennisSuggestion[] = [];
  
  const p1Stats = getPlayerStats(fixture.player1.name, fixture.tournament.surface);
  const p2Stats = getPlayerStats(fixture.player2.name, fixture.tournament.surface);
  
  const hasP1Data = ALL_PLAYERS[fixture.player1.name] !== undefined;
  const hasP2Data = ALL_PLAYERS[fixture.player2.name] !== undefined;
  const dataQuality: 'HIGH' | 'MEDIUM' | 'LOW' = 
    hasP1Data && hasP2Data ? 'HIGH' : 
    hasP1Data || hasP2Data ? 'MEDIUM' : 'LOW';

  // Calculate head-to-head probability based on ranking and win rates
  const rankDiff = p2Stats.ranking - p1Stats.ranking; // Positive = P1 favored
  const winRateDiff = p1Stats.surfaceWinRate - p2Stats.surfaceWinRate;
  
  // Combined probability for Player 1
  const baseProb = 0.5 + (rankDiff / 200) + (winRateDiff * 0.5);
  const p1Prob = Math.max(0.15, Math.min(0.85, baseProb));
  const p2Prob = 1 - p1Prob;

  // Player 1 to Win (if heavily favored)
  if (p1Prob >= 0.62) {
    const conf = Math.round(p1Prob * 100);
    const impliedOdds = 1 / p1Prob;
    
    suggestions.push({
      fixture,
      market: 'MATCH_WINNER',
      pick: `${fixture.player1.name} to Win`,
      odds: +impliedOdds.toFixed(2),
      confidence: conf,
      probability: p1Prob,
      edge: Math.round((p1Prob - 0.55) * 100),
      risk: conf >= 72 ? 'LOW' : 'MEDIUM',
      reasoning: [
        `Ranked #${p1Stats.ranking} vs #${p2Stats.ranking}`,
        `${(p1Stats.surfaceWinRate * 100).toFixed(0)}% ${fixture.tournament.surface} win rate`,
        `Form: ${p1Stats.recentForm}`,
      ],
      category: conf >= 72 ? 'BANKER' : 'VALUE',
      dataQuality,
    });
  }

  // Player 2 to Win (if heavily favored or upset potential)
  if (p2Prob >= 0.62) {
    const conf = Math.round(p2Prob * 100);
    const impliedOdds = 1 / p2Prob;
    
    suggestions.push({
      fixture,
      market: 'MATCH_WINNER',
      pick: `${fixture.player2.name} to Win`,
      odds: +impliedOdds.toFixed(2),
      confidence: conf,
      probability: p2Prob,
      edge: Math.round((p2Prob - 0.55) * 100),
      risk: conf >= 72 ? 'LOW' : 'MEDIUM',
      reasoning: [
        `Ranked #${p2Stats.ranking} vs #${p1Stats.ranking}`,
        `${(p2Stats.surfaceWinRate * 100).toFixed(0)}% ${fixture.tournament.surface} win rate`,
        `Form: ${p2Stats.recentForm}`,
      ],
      category: conf >= 72 ? 'BANKER' : 'VALUE',
      dataQuality,
    });
  }

  // Upset Alert (lower ranked player with good form vs poor form higher ranked)
  if (p2Stats.ranking > p1Stats.ranking + 20) {
    const p1FormScore = p1Stats.recentForm.split('').filter(c => c === 'W').length;
    const p2FormScore = p2Stats.recentForm.split('').filter(c => c === 'W').length;
    
    if (p2FormScore >= 4 && p1FormScore <= 2) {
      suggestions.push({
        fixture,
        market: 'UPSET',
        pick: `${fixture.player2.name} Upset Win`,
        odds: +(1 / 0.35).toFixed(2),
        confidence: 42,
        probability: 0.35,
        edge: 8,
        risk: 'HIGH',
        reasoning: [
          `Form advantage: ${p2Stats.recentForm} vs ${p1Stats.recentForm}`,
          `Higher ranked player struggling`,
          `Value odds expected`,
        ],
        category: 'UPSET',
        dataQuality,
      });
    }
  }

  // Total Games Over/Under (if both players have high hold percentages)
  const avgHoldPct = (p1Stats.holdPct + p2Stats.holdPct) / 2;
  const expectedGamesPerSet = avgHoldPct >= 80 ? 10.5 : avgHoldPct >= 75 ? 10 : 9.5;
  const isGrandSlam = fixture.tournament.category === 'Grand Slam';
  const expectedSets = isGrandSlam ? 3.5 : 2.3;
  const expectedTotalGames = expectedGamesPerSet * expectedSets;

  // Over games suggestion
  if (avgHoldPct >= 78 && Math.abs(p1Prob - 0.5) < 0.15) {
    const line = isGrandSlam ? 35.5 : 21.5;
    const prob = expectedTotalGames > line ? 0.62 : 0.45;
    
    if (prob >= 0.55) {
      suggestions.push({
        fixture,
        market: 'TOTAL_GAMES_OVER',
        pick: `Over ${line} Games`,
        odds: 1.85,
        confidence: Math.round(prob * 100),
        probability: prob,
        edge: Math.round((prob - 0.52) * 100),
        risk: 'MEDIUM',
        reasoning: [
          `Both players hold serve well (${avgHoldPct.toFixed(0)}% avg)`,
          `Expected ${expectedTotalGames.toFixed(1)} total games`,
          `Close matchup likely to go distance`,
        ],
        category: 'GAMES',
        dataQuality,
      });
    }
  }

  return suggestions.sort((a, b) => b.confidence - a.confidence);
}

// ============== HELPERS ==============

export function getTournamentBadgeColor(category: string): string {
  const colors: Record<string, string> = {
    'Grand Slam': 'bg-yellow-500/20 text-yellow-400',
    'Masters 1000': 'bg-purple-500/20 text-purple-400',
    'ATP 500': 'bg-blue-500/20 text-blue-400',
    'ATP 250': 'bg-green-500/20 text-green-400',
    'WTA 1000': 'bg-pink-500/20 text-pink-400',
    'WTA 500': 'bg-rose-500/20 text-rose-400',
    'WTA 250': 'bg-orange-500/20 text-orange-400',
  };
  return colors[category] || 'bg-slate-500/20 text-slate-400';
}

export function getSurfaceBadgeColor(surface: string): string {
  const colors: Record<string, string> = {
    'HARD': 'bg-blue-500/20 text-blue-400',
    'CLAY': 'bg-orange-500/20 text-orange-400',
    'GRASS': 'bg-green-500/20 text-green-400',
  };
  return colors[surface] || 'bg-slate-500/20 text-slate-400';
}

export function formatStartTime(date: Date): string {
  return date.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', hour12: false });
}