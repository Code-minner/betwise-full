/**
 * API-Sports Client
 * Unified client for Football, Basketball, Tennis APIs
 */

import {
  FootballMatch,
  BasketballMatch,
  TennisMatch,
  FootballStats,
  BasketballStats,
  Team,
  Player,
  Surface,
  FOOTBALL_LEAGUES,
  BASKETBALL_LEAGUES,
} from './types';

const API_KEY = process.env.SPORTS_API_KEY || '';
const FOOTBALL_URL = 'https://v3.football.api-sports.io';
const BASKETBALL_URL = 'https://v1.basketball.api-sports.io';

// ============== API FETCH ==============

async function apiFetch<T>(baseUrl: string, endpoint: string): Promise<T | null> {
  if (!API_KEY) {
    console.error('API_KEY not configured');
    return null;
  }

  try {
    const response = await fetch(`${baseUrl}${endpoint}`, {
      headers: { 'x-apisports-key': API_KEY },
      next: { revalidate: 1800 },
    });

    if (!response.ok) {
      throw new Error(`HTTP ${response.status}`);
    }

    const json = await response.json();
    
    if (json.errors && Object.keys(json.errors).length > 0) {
      console.error('API Error:', json.errors);
      return null;
    }

    return json.response as T;
  } catch (error) {
    console.error('API fetch error:', error);
    return null;
  }
}

// ============== FOOTBALL ==============

interface FootballFixtureRaw {
  fixture: {
    id: number;
    date: string;
    venue?: { name: string };
    status: { short: string };
  };
  league: {
    id: number;
    name: string;
    country: string;
    logo: string;
  };
  teams: {
    home: { id: number; name: string; logo: string };
    away: { id: number; name: string; logo: string };
  };
  goals: { home: number | null; away: number | null };
}

interface FootballStatsRaw {
  team: { id: number; name: string };
  form: string;
  fixtures: {
    played: { total: number };
    wins: { total: number };
    draws: { total: number };
    loses: { total: number };
  };
  goals: {
    for: { total: { total: number }; average: { total: string } };
    against: { total: { total: number }; average: { total: string } };
  };
  clean_sheet: { total: number };
  failed_to_score: { total: number };
}

export async function getFootballFixtures(
  date: string,
  leagueId?: number
): Promise<FootballMatch[]> {
  let endpoint = `/fixtures?date=${date}`;
  if (leagueId) {
    const season = getCurrentSeason();
    endpoint += `&league=${leagueId}&season=${season}`;
  }

  const data = await apiFetch<FootballFixtureRaw[]>(FOOTBALL_URL, endpoint);
  if (!data) return [];

  return data.map((f): FootballMatch => ({
    id: String(f.fixture.id),
    externalId: String(f.fixture.id),
    sport: 'FOOTBALL',
    league: {
      id: f.league.id,
      name: f.league.name,
      country: f.league.country,
      sport: 'FOOTBALL',
      logo: f.league.logo,
    },
    status: f.fixture.status.short === 'FT' ? 'FINISHED' : 
            f.fixture.status.short === 'NS' ? 'SCHEDULED' : 'LIVE',
    kickoff: new Date(f.fixture.date),
    venue: f.fixture.venue?.name,
    homeTeam: {
      id: String(f.teams.home.id),
      externalId: String(f.teams.home.id),
      sport: 'FOOTBALL',
      name: f.teams.home.name,
      logoUrl: f.teams.home.logo,
    },
    awayTeam: {
      id: String(f.teams.away.id),
      externalId: String(f.teams.away.id),
      sport: 'FOOTBALL',
      name: f.teams.away.name,
      logoUrl: f.teams.away.logo,
    },
    result: f.goals.home !== null ? {
      homeGoals: f.goals.home,
      awayGoals: f.goals.away!,
    } : undefined,
  }));
}

export async function getFootballFixturesMultiLeague(
  date: string,
  leagueIds: number[]
): Promise<FootballMatch[]> {
  const results: FootballMatch[] = [];
  
  for (const leagueId of leagueIds) {
    const fixtures = await getFootballFixtures(date, leagueId);
    results.push(...fixtures);
    await new Promise(r => setTimeout(r, 200));
  }
  
  return results;
}

export async function getFootballTeamStats(
  teamId: number,
  leagueId: number,
  season: number
): Promise<FootballStats | null> {
  // Disabled to avoid rate limits - using local database instead
  return null;
}

// ============== BASKETBALL ==============

interface BasketballFixtureRaw {
  id: number;
  date: string;
  time: string;
  status: { short: string };
  league: {
    id: number;
    name: string;
    country: string;
    logo: string;
  };
  teams: {
    home: { id: number; name: string; logo: string };
    away: { id: number; name: string; logo: string };
  };
  scores: {
    home: { total: number | null };
    away: { total: number | null };
  };
}

interface BasketballStatsRaw {
  games: { played: { all: number } };
  points: {
    for: { total: { all: number }; average: { all: string; home: string; away: string } };
    against: { total: { all: number }; average: { all: string } };
  };
}

export async function getBasketballFixtures(
  date: string,
  leagueId?: number
): Promise<BasketballMatch[]> {
  let endpoint = `/games?date=${date}`;
  if (leagueId) {
    const season = getBasketballSeason();
    endpoint += `&league=${leagueId}&season=${season}`;
  }

  const data = await apiFetch<BasketballFixtureRaw[]>(BASKETBALL_URL, endpoint);
  if (!data) return [];

  return data.map((f): BasketballMatch => ({
    id: String(f.id),
    externalId: String(f.id),
    sport: 'BASKETBALL',
    league: {
      id: f.league.id,
      name: f.league.name,
      country: f.league.country,
      sport: 'BASKETBALL',
      logo: f.league.logo,
    },
    status: f.status.short === 'FT' ? 'FINISHED' : 
            f.status.short === 'NS' ? 'SCHEDULED' : 'LIVE',
    kickoff: new Date(`${f.date}T${f.time}`),
    homeTeam: {
      id: String(f.teams.home.id),
      externalId: String(f.teams.home.id),
      sport: 'BASKETBALL',
      name: f.teams.home.name,
      logoUrl: f.teams.home.logo,
    },
    awayTeam: {
      id: String(f.teams.away.id),
      externalId: String(f.teams.away.id),
      sport: 'BASKETBALL',
      name: f.teams.away.name,
      logoUrl: f.teams.away.logo,
    },
    result: f.scores.home.total !== null ? {
      homePoints: f.scores.home.total,
      awayPoints: f.scores.away.total!,
    } : undefined,
  }));
}

export async function getBasketballTeamStats(
  teamId: number,
  leagueId: number,
  season: string
): Promise<BasketballStats | null> {
  // Disabled to avoid rate limits - using local database instead
  return null;
}

// ============== HELPERS ==============

export function getToday(): string {
  return new Date().toISOString().split('T')[0];
}

export function getTomorrow(): string {
  const d = new Date();
  d.setDate(d.getDate() + 1);
  return d.toISOString().split('T')[0];
}

export function getDateRange(days: number): string[] {
  const dates: string[] = [];
  for (let i = 0; i < days; i++) {
    const d = new Date();
    d.setDate(d.getDate() + i);
    dates.push(d.toISOString().split('T')[0]);
  }
  return dates;
}

export function getCurrentSeason(): number {
  const now = new Date();
  const month = now.getMonth();
  const year = now.getFullYear();
  return month < 7 ? year - 1 : year;
}

export function getBasketballSeason(): string {
  const now = new Date();
  const month = now.getMonth();
  const year = now.getFullYear();
  return month < 7 ? `${year - 1}-${year}` : `${year}-${year + 1}`;
}