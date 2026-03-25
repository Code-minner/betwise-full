/**
 * lib/basketball.ts — v14 (ZERO HARDCODED DATA + ESPN NBA FALLBACK)
 *
 * Data priority for every team:
 *   1. Real standings from API-Sports  (best)
 *   2. ESPN public API for NBA         (free, no key, permanent fallback)
 *   3. Groq AI assessment              (good — estimated from LLM knowledge)
 *   4. League-average safe default     (last resort — used only if Groq fails)
 */

import {
  computeCompositeElo,
  eloWinProb,
  logisticWinProb,
  blendedWinProbability,
  poissonTotalOverProb,
  poissonTotalUnderProb,
  HOME_COURT_ELO,
} from './elo';
import {
  getLeagueInjuries,
  computeTeamInjuryImpact,
  formatInjuryWarnings,
  type InjuredPlayer,
  type TeamInjuryImpact,
} from './injuries';
import {
  getAITeamStats,
  prewarmTeamCache,
  type AITeamStats,
} from './ai-team-assessor';
import { fetchNBAStandings } from './nba-standings';

// ─── Types ────────────────────────────────────────────────────────────────────

export interface BasketballFixture {
  id:         string;
  externalId: number;
  league:     { id: number; name: string; type: string; logo: string };
  homeTeam:   { id: number; name: string; logo: string };
  awayTeam:   { id: number; name: string; logo: string };
  tipoff:     Date;
  venue:      string;
  status:     string;
}

interface TeamStats {
  gamesPlayed:  number;
  avgScored:    number;
  avgConceded:  number;
  homeScored:   number;
  homeConceded: number;
  awayScored:   number;
  awayConceded: number;
  pace:         number;
  offRtg:       number;
  defRtg:       number;
  form:         string;
  avgTotal:     number;
  winPct:       number;
  source:       'API' | 'GROQ_AI' | 'LEAGUE_DEFAULT';
}

interface RealTeamData {
  teamId:          number;
  teamName:        string;
  gamesPlayed:     number;
  wins:            number;
  avgScored:       number;
  avgConceded:     number;
  homeAvgScored:   number;
  homeAvgConceded: number;
  awayAvgScored:   number;
  awayAvgConceded: number;
  winPct:          number;
  form?:           string;
}

export interface BookmakerOdds {
  market:    string;
  line?:     number;
  odds:      number;
  bookmaker: string;
}

export interface BasketballSuggestion {
  fixture:             BasketballFixture;
  market:              string;
  pick:                string;
  line?:               number;
  probability:         number;
  confidence:          number;
  edge:                number;
  impliedProbability?: number;
  bookmakerOdds?:      number;
  bookmaker?:          string;
  risk:                'LOW' | 'MEDIUM' | 'HIGH';
  reasoning:           string[];
  warnings:            string[];
  category:            'LOW_RISK' | 'VALUE' | 'SPECULATIVE' | 'NO_BET';
  dataQuality:         'HIGH' | 'MEDIUM' | 'LOW' | 'FALLBACK';
  modelAgreement:      number;
}

// ─── Leagues ──────────────────────────────────────────────────────────────────

export const TOP_LEAGUES = [
  { id: 12,  name: 'NBA',                         avgTotal: 225, variance: 0.08, type: 'NBA'   as const },
  { id: 13,  name: 'G League',                    avgTotal: 230, variance: 0.12, type: 'NBA'   as const },
  { id: 120, name: 'Euroleague',                  avgTotal: 160, variance: 0.10, type: 'EURO'  as const },
  { id: 117, name: 'Eurocup',                     avgTotal: 158, variance: 0.12, type: 'EURO'  as const },
  { id: 194, name: 'NBL',                         avgTotal: 175, variance: 0.11, type: 'OTHER' as const },
  { id: 20,  name: 'NBA G League',                avgTotal: 230, variance: 0.12, type: 'NBA'   as const },
  { id: 21,  name: 'LNB Pro A',                   avgTotal: 162, variance: 0.11, type: 'EURO'  as const },
  { id: 22,  name: 'Lega Basket',                 avgTotal: 165, variance: 0.11, type: 'EURO'  as const },
  { id: 23,  name: 'BBL',                         avgTotal: 168, variance: 0.12, type: 'EURO'  as const },
  { id: 116, name: 'NCAA',                        avgTotal: 155, variance: 0.13, type: 'OTHER' as const },
  { id: 30,  name: 'Turkish BSL',                 avgTotal: 160, variance: 0.11, type: 'EURO'  as const },
  { id: 31,  name: 'CBA',                         avgTotal: 210, variance: 0.10, type: 'OTHER' as const },
  { id: 202, name: 'CBA',                         avgTotal: 210, variance: 0.10, type: 'OTHER' as const },
  { id: 118, name: 'Basketball Champions League', avgTotal: 162, variance: 0.12, type: 'EURO'  as const },
];

const TOP_LEAGUE_IDS = TOP_LEAGUES.map(l => l.id);
const LEAGUE_DATA: Record<number, { avgTotal: number; variance: number; type: 'NBA' | 'EURO' | 'OTHER'; name: string }> =
  Object.fromEntries(TOP_LEAGUES.map(l => [l.id, { avgTotal: l.avgTotal, variance: l.variance, type: l.type, name: l.name }]));

// ─── Standings cache ──────────────────────────────────────────────────────────

const STANDINGS_LEAGUES = [
  { id: 12,  name: 'NBA',                 season: '2024-2025' },
  { id: 120, name: 'Euroleague',          season: '2024-2025' },
  { id: 117, name: 'Eurocup',             season: '2024-2025' },
  { id: 194, name: 'NBL',                 season: '2024-2025' },
  { id: 21,  name: 'LNB Pro A',           season: '2024-2025' },
  { id: 22,  name: 'Lega Basket',         season: '2024-2025' },
  { id: 23,  name: 'BBL',                 season: '2024-2025' },
  { id: 30,  name: 'Turkish BSL',         season: '2024-2025' },
  { id: 31,  name: 'CBA',                 season: '2024-2025' },
  { id: 20,  name: 'NBA G League',        season: '2024-2025' },
];

const realStatsMap          = new Map<string, RealTeamData>();
let   standingsLoadedAt     = 0;
let   standingsLoadPromise: Promise<void> | null = null;
const STANDINGS_TTL         = 6 * 60 * 60 * 1000;

// ─── Standings loader (API-Sports → ESPN fallback for NBA) ────────────────────

async function loadLeagueStandings(leagueId: number, season: string): Promise<void> {
  const raw = await apiCall<any>(`/standings?league=${leagueId}&season=${season}`);

  // Try API-Sports first
  if (raw && Array.isArray(raw) && raw.length > 0) {
    const allEntries: any[] = Array.isArray(raw[0]) ? (raw as any[][]).flat() : raw;
    let loaded = 0;

    for (const entry of allEntries) {
      if (!entry?.team?.name) continue;

      const gamesPlayed =
        (typeof entry.games?.played === 'number' ? entry.games.played : entry.games?.played?.total) ??
        (entry.win?.total ?? 0) + (entry.loss?.total ?? 0);
      if (gamesPlayed < 5) continue;

      const ptsFor     = entry.points?.for     ?? null;
      const ptsAgainst = entry.points?.against ?? null;

      const parseAvg = (obj: any): number => {
        if (obj === null || obj === undefined) return 0;
        if (typeof obj === 'number') return gamesPlayed > 0 ? obj / gamesPlayed : 0;
        const v = obj?.average?.total ?? obj?.average ?? obj?.total ?? '0';
        const parsed = parseFloat(String(v));
        if (parsed > 0) return parsed;
        return gamesPlayed > 0 ? (obj?.total ?? 0) / gamesPlayed : 0;
      };

      const avgScored   = parseAvg(ptsFor);
      const avgConceded = parseAvg(ptsAgainst);
      if (avgScored < 50) continue;

      const homeAvgScored    = parseFloat(String(ptsFor?.average?.home     ?? '0')) || avgScored    + 3;
      const homeAvgConceded  = parseFloat(String(ptsAgainst?.average?.home ?? '0')) || avgConceded  - 1.5;
      const awayAvgScored    = parseFloat(String(ptsFor?.average?.away     ?? '0')) || avgScored    - 3;
      const awayAvgConceded  = parseFloat(String(ptsAgainst?.average?.away ?? '0')) || avgConceded  + 1.5;

      const wins    = entry.win?.total ?? entry.wins ?? 0;
      const rawForm = entry.form ?? entry.last5 ?? '';
      const form    = typeof rawForm === 'string'
        ? rawForm.toUpperCase().replace(/[^WL]/g, '').slice(-5)
        : '';

      const data: RealTeamData = {
        teamId: entry.team.id, teamName: entry.team.name,
        gamesPlayed, wins, avgScored, avgConceded,
        homeAvgScored, homeAvgConceded, awayAvgScored, awayAvgConceded,
        winPct: gamesPlayed > 0 ? wins / gamesPlayed : 0.5,
        form:   form || undefined,
      };

      realStatsMap.set(`${leagueId}:${entry.team.id}`, data);
      realStatsMap.set(`${leagueId}:${entry.team.name.toLowerCase()}`, data);
      loaded++;
    }

    if (loaded > 0) {
      console.log(`[Basketball v14] League ${leagueId}: ${loaded} teams from API-Sports`);
      return; // success — skip ESPN fallback
    }
  }

  // ── NBA-only fallback: ESPN free public API (no key required) ─────────────
  if (leagueId === 12) {
    console.log('[Basketball v14] NBA: API-Sports returned 0 — using ESPN standings');
    await loadNBAFromESPN();
  }
}

async function loadNBAFromESPN(): Promise<void> {
  try {
    const espnTeams = await fetchNBAStandings();
    if (espnTeams.length === 0) {
      console.warn('[Basketball v14] ESPN also returned 0 NBA teams');
      return;
    }

    let loaded = 0;
    for (const team of espnTeams) {
      const data: RealTeamData = {
        teamId:          team.teamId,
        teamName:        team.teamName,
        gamesPlayed:     team.gamesPlayed,
        wins:            team.wins,
        avgScored:       team.avgScored,
        avgConceded:     team.avgConceded,
        homeAvgScored:   team.homeAvgScored,
        homeAvgConceded: team.homeAvgConceded,
        awayAvgScored:   team.awayAvgScored,
        awayAvgConceded: team.awayAvgConceded,
        winPct:          team.winPct,
        form:            team.form,
      };
      realStatsMap.set(`12:${team.teamId}`, data);
      realStatsMap.set(`12:${team.teamName.toLowerCase()}`, data);
      if (team.abbreviation) {
        realStatsMap.set(`12:${team.abbreviation.toLowerCase()}`, data);
      }
      loaded++;
    }

    console.log(`[Basketball v14] NBA: ${loaded} teams loaded from ESPN`);
  } catch (err) {
    console.error('[Basketball v14] ESPN fallback error:', err);
  }
}

async function ensureStandings(): Promise<void> {
  if (standingsLoadedAt > 0 && Date.now() - standingsLoadedAt < STANDINGS_TTL) return;
  if (standingsLoadPromise) return standingsLoadPromise;

  standingsLoadPromise = (async () => {
    let ok = 0;
    for (const l of STANDINGS_LEAGUES) {
      try { await loadLeagueStandings(l.id, l.season); ok++; } catch {}
      await new Promise(r => setTimeout(r, 300));
    }
    console.log(`[Basketball v14] Standings: ${ok}/${STANDINGS_LEAGUES.length} leagues, ${realStatsMap.size} entries`);
    standingsLoadedAt    = Date.now();
    standingsLoadPromise = null;
  })().catch(() => { standingsLoadPromise = null; });

  return standingsLoadPromise;
}

function getRealTeamData(teamId: number, teamName: string, leagueId: number): RealTeamData | null {
  const byId = realStatsMap.get(`${leagueId}:${teamId}`);
  if (byId) return byId;
  const lower  = teamName.toLowerCase();
  const byName = realStatsMap.get(`${leagueId}:${lower}`);
  if (byName) return byName;
  const prefix = `${leagueId}:`;
  for (const [key, data] of realStatsMap) {
    if (!key.startsWith(prefix)) continue;
    const stored = key.slice(prefix.length);
    if (stored.includes(lower) || lower.includes(stored)) return data;
    if (lower.split(' ').filter(w => w.length > 4).some(w => stored.includes(w))) return data;
  }
  return null;
}

// ─── API helper ───────────────────────────────────────────────────────────────

const API_KEY  = process.env.SPORTS_API_KEY || '';
const API_HOST = 'v1.basketball.api-sports.io';

async function apiCall<T>(endpoint: string): Promise<T | null> {
  if (!API_KEY) return null;
  try {
    const res = await fetch(`https://${API_HOST}${endpoint}`, {
      headers: { 'x-apisports-key': API_KEY },
      next: { revalidate: 3600 },
    });
    if (res.status === 429 || !res.ok) return null;
    const json = await res.json();
    if (json.errors && Object.keys(json.errors).length > 0) return null;
    return json.response;
  } catch { return null; }
}

// ─── Fixtures ─────────────────────────────────────────────────────────────────

export async function getTodaysFixtures():           Promise<BasketballFixture[]> {
  return getFixturesByDate(new Date().toISOString().split('T')[0]);
}
export async function getTomorrowsFixtures():        Promise<BasketballFixture[]> {
  const d = new Date(); d.setDate(d.getDate() + 1);
  return getFixturesByDate(d.toISOString().split('T')[0]);
}
export async function getDayAfterTomorrowFixtures(): Promise<BasketballFixture[]> {
  const d = new Date(); d.setDate(d.getDate() + 2);
  return getFixturesByDate(d.toISOString().split('T')[0]);
}

async function getFixturesByDate(date: string): Promise<BasketballFixture[]> {
  const games = await apiCall<any[]>(`/games?date=${date}`);
  if (!games) return [];
  return games
    .filter(g => TOP_LEAGUE_IDS.includes(g.league.id) && g.status.short === 'NS')
    .map(g => ({
      id: `bb-${g.id}`, externalId: g.id,
      league:   { id: g.league.id, name: g.league.name, type: g.league.type || 'League', logo: g.league.logo || '' },
      homeTeam: { id: g.teams.home.id, name: g.teams.home.name, logo: g.teams.home.logo || '' },
      awayTeam: { id: g.teams.away.id, name: g.teams.away.name, logo: g.teams.away.logo || '' },
      tipoff: new Date(g.date), venue: g.venue || 'TBD', status: g.status.short,
    }))
    .sort((a, b) => a.tipoff.getTime() - b.tipoff.getTime());
}

// ─── Team stats (3-tier: API/ESPN → AI → league default) ─────────────────────

async function buildTeamStats(
  teamId:       number,
  teamName:     string,
  leagueId:     number,
  isHome:       boolean,
  injuryImpact: TeamInjuryImpact,
): Promise<TeamStats> {
  const league = LEAGUE_DATA[leagueId] || { avgTotal: 220, variance: 0.10, type: 'OTHER' as const, name: 'Basketball' };

  // ── Tier 1: Real standings (API-Sports or ESPN) ──────────────────────────
  const real = getRealTeamData(teamId, teamName, leagueId);
  if (real && real.gamesPlayed >= 8) {
    const avgTotal = real.avgScored + real.avgConceded;
    const pace     = Math.max(0.90, Math.min(1.10, avgTotal / league.avgTotal));
    const form     = real.form && real.form.length >= 3
      ? real.form
      : real.winPct >= 0.70 ? 'WWWWL' : real.winPct >= 0.55 ? 'WWLWW' :
        real.winPct >= 0.48 ? 'WLWLW' : real.winPct >= 0.38 ? 'LWLWL' : 'LLLWL';

    const oMult = injuryImpact.offensiveMultiplier;
    const dMult = injuryImpact.defensiveMultiplier;
    const pMult = injuryImpact.paceMultiplier;

    return {
      gamesPlayed:  real.gamesPlayed,
      avgScored:    (isHome ? real.homeAvgScored   : real.awayAvgScored)   * oMult,
      avgConceded:  (isHome ? real.homeAvgConceded : real.awayAvgConceded),
      homeScored:   real.homeAvgScored   * oMult,
      homeConceded: real.homeAvgConceded,
      awayScored:   real.awayAvgScored   * oMult,
      awayConceded: real.awayAvgConceded,
      pace:         pace * pMult,
      offRtg:       real.avgScored  * oMult,
      defRtg:       real.avgConceded * dMult,
      form,
      avgTotal:     avgTotal * oMult,
      winPct:       real.winPct,
      source:       'API',
    };
  }

  // ── Tier 2: Groq AI estimate ─────────────────────────────────────────────
  let ai: AITeamStats | null = null;
  try {
    ai = await getAITeamStats(teamName, league.name, leagueId);
  } catch {
    console.warn(`[v14] Groq unavailable for ${teamName}, using league default`);
  }

  if (ai) {
    const hBonus = isHome ? ai.homeBonus : -ai.homeBonus * 0.7;
    const oMult  = injuryImpact.offensiveMultiplier;
    const dMult  = injuryImpact.defensiveMultiplier;
    const pMult  = injuryImpact.paceMultiplier;

    return {
      gamesPlayed:  20,
      avgScored:    (ai.offRtg + hBonus)       * oMult,
      avgConceded:  ai.defRtg - hBonus * 0.4,
      homeScored:   (ai.offRtg + ai.homeBonus)  * oMult,
      homeConceded: ai.defRtg - 1.5,
      awayScored:   (ai.offRtg - ai.homeBonus * 0.7) * oMult,
      awayConceded: ai.defRtg + 1.5,
      pace:         ai.pace * pMult,
      offRtg:       ai.offRtg * oMult,
      defRtg:       ai.defRtg * dMult,
      form:         ai.form,
      avgTotal:     (ai.offRtg + ai.defRtg) * ai.pace,
      winPct:       ai.winPct,
      source:       'GROQ_AI',
    };
  }

  // ── Tier 3: League average (last resort) ─────────────────────────────────
  const half   = league.avgTotal / 2;
  const hBonus = isHome ? 3 : -3;
  return {
    gamesPlayed:  0,
    avgScored:    (half + hBonus)  * injuryImpact.offensiveMultiplier,
    avgConceded:  half - hBonus * 0.4,
    homeScored:   (half + 4)       * injuryImpact.offensiveMultiplier,
    homeConceded: half - 2,
    awayScored:   (half - 4)       * injuryImpact.offensiveMultiplier,
    awayConceded: half + 2,
    pace:         injuryImpact.paceMultiplier,
    offRtg:       half * injuryImpact.offensiveMultiplier,
    defRtg:       half * injuryImpact.defensiveMultiplier,
    form:         'WLWLW',
    avgTotal:     league.avgTotal,
    winPct:       0.5,
    source:       'LEAGUE_DEFAULT',
  };
}

// ─── Confidence ───────────────────────────────────────────────────────────────

interface ConfidenceFactors {
  dataQuality:         'HIGH' | 'MEDIUM' | 'LOW' | 'FALLBACK';
  sampleSize:          number;
  modelAgreement:      number;
  marketVolatility:    number;
  probabilityStrength: number;
  injuryPenalty:       number;
}

function calculateConfidence(f: ConfidenceFactors): number {
  const base       = { HIGH: 80, MEDIUM: 68, LOW: 55, FALLBACK: 40 }[f.dataQuality];
  const sampleMod  = f.sampleSize >= 20 ? 5 : f.sampleSize >= 10 ? 2 : f.sampleSize >= 5 ? 0 : -8;
  const agreeMod   = (f.modelAgreement - 50) / 6;
  const volPenalty = -f.marketVolatility * 100 * 0.15;
  const strBonus   = Math.min(4, f.probabilityStrength * 10);
  return Math.max(25, Math.min(82, Math.round(base + sampleMod + agreeMod + volPenalty + strBonus - f.injuryPenalty)));
}

// ─── Edge ─────────────────────────────────────────────────────────────────────

function calculateEdge(prob: number, bookOdds: number | null): {
  edge: number; impliedProbability: number;
  category: 'LOW_RISK' | 'VALUE' | 'SPECULATIVE' | 'NO_BET';
} {
  if (!bookOdds || bookOdds <= 1) return { edge: 0, impliedProbability: 0, category: 'SPECULATIVE' };
  const imp  = 1 / bookOdds;
  const edge = (prob - imp) * 100;
  return {
    edge: Math.round(edge * 10) / 10,
    impliedProbability: imp,
    category: edge >= 8 ? 'LOW_RISK' : edge >= 4 ? 'VALUE' : edge >= 1 ? 'SPECULATIVE' : 'NO_BET',
  };
}

// ─── Risk ─────────────────────────────────────────────────────────────────────

function calculateRisk(conf: number, edge: number, dq: string, variance: number): 'LOW' | 'MEDIUM' | 'HIGH' {
  let s = 0;
  s += conf >= 70 ? 0 : conf >= 58 ? 12 : 28;
  s += edge >= 8  ? 0 : edge >= 4  ?  8 : edge >= 0 ? 16 : 24;
  s += dq === 'HIGH' ? 0 : dq === 'MEDIUM' ? 8 : 22;
  s += variance * 20;
  return s <= 25 ? 'LOW' : s <= 52 ? 'MEDIUM' : 'HIGH';
}

// ─── Main analysis ────────────────────────────────────────────────────────────

export async function analyzeBasketballMatch(
  fixture:            BasketballFixture,
  bookmakerOddsData?: Record<string, BookmakerOdds>,
): Promise<BasketballSuggestion[]> {

  await ensureStandings();

  const league     = LEAGUE_DATA[fixture.league.id] || { avgTotal: 220, variance: 0.10, type: 'OTHER' as const, name: 'Basketball' };
  const isNBA      = fixture.league.id === 12;
  const leagueType = league.type as 'NBA' | 'EURO' | 'OTHER';

  let leagueInjuries: InjuredPlayer[] = [];
  try { leagueInjuries = await getLeagueInjuries(fixture.league.id); } catch {}

  const homeInjury = computeTeamInjuryImpact(fixture.homeTeam.id, fixture.homeTeam.name, leagueInjuries);
  const awayInjury = computeTeamInjuryImpact(fixture.awayTeam.id, fixture.awayTeam.name, leagueInjuries);

  const [homeStats, awayStats] = await Promise.all([
    buildTeamStats(fixture.homeTeam.id, fixture.homeTeam.name, fixture.league.id, true,  homeInjury),
    buildTeamStats(fixture.awayTeam.id, fixture.awayTeam.name, fixture.league.id, false, awayInjury),
  ]);

  let dataQuality: 'HIGH' | 'MEDIUM' | 'LOW' | 'FALLBACK';
  if      (homeStats.source === 'API'           && awayStats.source === 'API')           dataQuality = 'HIGH';
  else if (homeStats.source === 'LEAGUE_DEFAULT' && awayStats.source === 'LEAGUE_DEFAULT') {
    console.log(`[v14] Skipping ${fixture.homeTeam.name} vs ${fixture.awayTeam.name} — no data`);
    return [];
  }
  else if (homeStats.source === 'API'    || awayStats.source === 'API')    dataQuality = 'MEDIUM';
  else if (homeStats.source === 'GROQ_AI' && awayStats.source === 'GROQ_AI') dataQuality = 'MEDIUM';
  else dataQuality = 'LOW';

  const injuryWarnings     = formatInjuryWarnings(homeInjury, awayInjury, fixture.homeTeam.name, fixture.awayTeam.name);
  const sourceNote         = homeStats.source === 'GROQ_AI' || awayStats.source === 'GROQ_AI'
    ? ['⚠️ AI-estimated stats (no standings loaded for this league)'] : [];
  const allWarnings        = [...sourceNote, ...injuryWarnings];
  const totalInjuryPenalty = homeInjury.confidencePenalty + awayInjury.confidencePenalty;

  const homeCourtBonus = HOME_COURT_ELO[leagueType];
  const homeElo = computeCompositeElo({ winPct: homeStats.winPct, gamesPlayed: homeStats.gamesPlayed, offRtg: homeStats.offRtg, defRtg: homeStats.defRtg });
  const awayElo  = computeCompositeElo({ winPct: awayStats.winPct, gamesPlayed: awayStats.gamesPlayed, offRtg: awayStats.offRtg, defRtg: awayStats.defRtg });

  const eloResult     = eloWinProb(homeElo, awayElo, homeCourtBonus);
  const logResult     = logisticWinProb(homeStats.offRtg - homeStats.defRtg, awayStats.offRtg - awayStats.defRtg, homeStats.form, awayStats.form, isNBA);
  const blended       = blendedWinProbability(eloResult.homeWinProb, logResult.homeWinProb, dataQuality, Math.min(homeStats.gamesPlayed, awayStats.gamesPlayed));

  const { homeWinProb, awayWinProb } = blended;
  const signalDiff     = Math.abs(eloResult.homeWinProb - logResult.homeWinProb);
  const modelAgreement = Math.round(Math.max(50, 90 - signalDiff * 200));

  const homeExp        = ((homeStats.homeScored + awayStats.awayConceded) / 2) * (isNBA ? 1.015 : 1.0);
  const awayExp        = ((awayStats.awayScored + homeStats.homeConceded)  / 2) * (isNBA ? 1.015 : 1.0);
  const pace           = (homeStats.pace + awayStats.pace) / 2;

  const overdispersion = isNBA ? 1.35 : 1.30;
  const lines          = isNBA ? [215.5, 220.5, 225.5, 230.5, 235.5] : [150.5, 155.5, 160.5, 165.5, 170.5];
  const suggestions: BasketballSuggestion[] = [];
  const sourceTag = (s: TeamStats) => s.source === 'API' ? '(real data)' : s.source === 'GROQ_AI' ? '(AI est.)' : '(default)';

  // ── 1. TOTALS UNDER ───────────────────────────────────────────────────────
  for (const line of lines) {
    const prob = poissonTotalUnderProb(homeExp, awayExp, line, overdispersion);
    if (prob < 0.55) continue;
    if (dataQuality !== 'HIGH' && prob < 0.60) continue;

    const bookOdds   = bookmakerOddsData?.[`under_${line}`]?.odds || null;
    const edgeResult = calculateEdge(prob, bookOdds);
    if (edgeResult.category === 'NO_BET' && bookOdds) continue;

    const localAgreement = homeStats.defRtg < (isNBA ? 112 : 82) && awayStats.defRtg < (isNBA ? 113 : 83)
      ? Math.min(modelAgreement + 8, 90) : modelAgreement;

    const confidence = calculateConfidence({ dataQuality, sampleSize: homeStats.gamesPlayed || 5, modelAgreement: localAgreement, marketVolatility: league.variance, probabilityStrength: Math.abs(prob - 0.5), injuryPenalty: totalInjuryPenalty });
    if (confidence < (edgeResult.category === 'LOW_RISK' ? 65 : 55)) continue;

    suggestions.push({
      fixture, market: 'TOTALS_UNDER', pick: `Under ${line} Points`, line,
      probability: prob, confidence, edge: edgeResult.edge,
      impliedProbability: edgeResult.impliedProbability, bookmakerOdds: bookOdds || undefined,
      risk: calculateRisk(confidence, edgeResult.edge, dataQuality, league.variance),
      reasoning: [`Projected total: ${(homeExp + awayExp).toFixed(1)} pts (Poisson)`, `Home: ${homeExp.toFixed(1)} ${sourceTag(homeStats)} | Away: ${awayExp.toFixed(1)} ${sourceTag(awayStats)}`, `Pace: ${pace.toFixed(2)}`],
      warnings: allWarnings,
      category: edgeResult.edge >= 8 ? 'LOW_RISK' : edgeResult.edge >= 4 ? 'VALUE' : 'SPECULATIVE',
      dataQuality, modelAgreement: localAgreement,
    });
    break;
  }

  // ── 2. TOTALS OVER ────────────────────────────────────────────────────────
  for (const line of [...lines].reverse()) {
    const prob = poissonTotalOverProb(homeExp, awayExp, line, overdispersion);
    if (prob < 0.55) continue;
    if (dataQuality !== 'HIGH' && prob < 0.60) continue;

    const bookOdds   = bookmakerOddsData?.[`over_${line}`]?.odds || null;
    const edgeResult = calculateEdge(prob, bookOdds);
    if (edgeResult.category === 'NO_BET' && bookOdds) continue;

    const localAgreement = homeStats.offRtg > (isNBA ? 113 : 82) && awayStats.offRtg > (isNBA ? 111 : 80)
      ? Math.min(modelAgreement + 8, 90) : modelAgreement;

    const confidence = calculateConfidence({ dataQuality, sampleSize: homeStats.gamesPlayed || 5, modelAgreement: localAgreement, marketVolatility: league.variance, probabilityStrength: Math.abs(prob - 0.5), injuryPenalty: totalInjuryPenalty });
    if (confidence < (edgeResult.category === 'LOW_RISK' ? 65 : 55)) continue;

    suggestions.push({
      fixture, market: 'TOTALS_OVER', pick: `Over ${line} Points`, line,
      probability: prob, confidence, edge: edgeResult.edge,
      impliedProbability: edgeResult.impliedProbability, bookmakerOdds: bookOdds || undefined,
      risk: calculateRisk(confidence, edgeResult.edge, dataQuality, league.variance),
      reasoning: [`Projected total: ${(homeExp + awayExp).toFixed(1)} pts (Poisson)`, `Home: ${homeExp.toFixed(1)} ${sourceTag(homeStats)} | Away: ${awayExp.toFixed(1)} ${sourceTag(awayStats)}`, `High-scoring pace: ${pace.toFixed(2)}`],
      warnings: allWarnings,
      category: edgeResult.edge >= 8 ? 'LOW_RISK' : edgeResult.edge >= 4 ? 'VALUE' : 'SPECULATIVE',
      dataQuality, modelAgreement: localAgreement,
    });
    break;
  }

  // ── 3. SPREAD ─────────────────────────────────────────────────────────────
  if (dataQuality === 'HIGH' || (dataQuality === 'MEDIUM' && homeStats.source === 'API' && awayStats.source === 'API')) {
    const projDiff  = homeExp - awayExp;
    if (Math.abs(projDiff) > 5) {
      const isHomeFav = projDiff > 0;
      const spread    = Math.round(Math.abs(projDiff));
      const prob      = Math.min(0.68, 0.50 + (Math.abs(projDiff) - spread) * 0.022);

      if (prob > 0.55) {
        const bookOdds   = bookmakerOddsData?.[isHomeFav ? `home_spread_${spread}` : `away_spread_${spread}`]?.odds || null;
        const edgeResult = calculateEdge(prob, bookOdds);

        if (!(edgeResult.category === 'NO_BET' && bookOdds)) {
          const confidence = calculateConfidence({ dataQuality, sampleSize: Math.min(homeStats.gamesPlayed, awayStats.gamesPlayed), modelAgreement, marketVolatility: league.variance, probabilityStrength: Math.abs(prob - 0.5), injuryPenalty: totalInjuryPenalty });

          if (confidence >= 58 && (edgeResult.edge >= 2 || !bookOdds)) {
            const fav = isHomeFav ? fixture.homeTeam : fixture.awayTeam;
            suggestions.push({
              fixture, market: isHomeFav ? 'SPREAD_HOME' : 'SPREAD_AWAY',
              pick: `${fav.name} -${spread}.5`, line: spread + 0.5,
              probability: prob, confidence, edge: edgeResult.edge,
              impliedProbability: edgeResult.impliedProbability, bookmakerOdds: bookOdds || undefined,
              risk: calculateRisk(confidence, edgeResult.edge, dataQuality, league.variance),
              reasoning: [`Projected margin: ${Math.abs(projDiff).toFixed(1)} pts`, `Net rating edge: ${(homeStats.offRtg - homeStats.defRtg - (awayStats.offRtg - awayStats.defRtg)).toFixed(1)}`, isHomeFav ? 'Home court advantage' : 'Strong road favourite'],
              warnings: allWarnings,
              category: edgeResult.edge >= 5 ? 'VALUE' : 'SPECULATIVE',
              dataQuality, modelAgreement,
            });
          }
        }
      }
    }
  }

  // ── 4. MONEYLINE ──────────────────────────────────────────────────────────
  const probGap = Math.abs(homeWinProb - 0.5);
  const minGap  = dataQuality === 'HIGH' ? 0.07 : 0.13;

  if (probGap >= minGap) {
    const isHomeFav  = homeWinProb > awayWinProb;
    const fav        = isHomeFav ? fixture.homeTeam : fixture.awayTeam;
    const favStats   = isHomeFav ? homeStats : awayStats;
    const prob       = isHomeFav ? homeWinProb : awayWinProb;
    const bookOdds   = bookmakerOddsData?.[isHomeFav ? 'home_ml' : 'away_ml']?.odds || null;
    const edgeResult = calculateEdge(prob, bookOdds);

    if (!(edgeResult.category === 'NO_BET' && bookOdds)) {
      const localAgreement = Math.min(82, 50 + probGap * 160);
      const confidence = calculateConfidence({ dataQuality, sampleSize: favStats.gamesPlayed || 10, modelAgreement: localAgreement, marketVolatility: league.variance, probabilityStrength: Math.abs(prob - 0.5), injuryPenalty: totalInjuryPenalty });
      const eloVsLog   = Math.abs(eloResult.homeWinProb - logResult.homeWinProb) < 0.05 ? 'Elo & net-rating agree' : 'Mixed model signals';

      if (confidence >= 60 && (edgeResult.edge >= 0 || !bookOdds)) {
        suggestions.push({
          fixture, market: 'MONEYLINE', pick: `${fav.name} to Win`,
          probability: prob, confidence, edge: edgeResult.edge,
          impliedProbability: edgeResult.impliedProbability, bookmakerOdds: bookOdds || undefined,
          risk: calculateRisk(confidence, edgeResult.edge, dataQuality, league.variance),
          reasoning: [`Win probability: ${(prob * 100).toFixed(0)}% (Elo + logistic blend)`, eloVsLog, `Elo: ${(eloResult.homeWinProb * 100).toFixed(0)}% | Logistic: ${(logResult.homeWinProb * 100).toFixed(0)}%`, `Data: home ${sourceTag(homeStats)}, away ${sourceTag(awayStats)}`],
          warnings: [...(bookOdds && bookOdds < 1.25 ? ['Short odds — consider spread instead'] : []), ...allWarnings],
          category: confidence >= 65 && edgeResult.edge >= 3 ? 'LOW_RISK' : edgeResult.edge >= 5 ? 'VALUE' : 'SPECULATIVE',
          dataQuality, modelAgreement: localAgreement,
        });
      }
    }
  }

  return suggestions.sort((a, b) => {
    const o: Record<string, number> = { LOW_RISK: 0, VALUE: 1, SPECULATIVE: 2, NO_BET: 3 };
    return (o[a.category] - o[b.category]) || (b.confidence - a.confidence);
  });
}

// ─── Pre-warming ──────────────────────────────────────────────────────────────

export async function prewarmFixtureTeams(fixtures: BasketballFixture[]): Promise<void> {
  const teams = fixtures.flatMap(f => {
    const l = LEAGUE_DATA[f.league.id];
    if (!l) return [];
    return [
      { name: f.homeTeam.name, leagueName: l.name, leagueId: f.league.id },
      { name: f.awayTeam.name, leagueName: l.name, leagueId: f.league.id },
    ];
  });
  await prewarmTeamCache(teams);
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

export function getLeagueBadgeColor(leagueId: number): string {
  const c: Record<number, string> = {
    12:  'bg-red-500/20 text-red-400',      120: 'bg-orange-500/20 text-orange-400',
    117: 'bg-purple-500/20 text-purple-400', 194: 'bg-green-500/20 text-green-400',
    20:  'bg-yellow-500/20 text-yellow-400', 21:  'bg-blue-500/20 text-blue-400',
    22:  'bg-cyan-500/20 text-cyan-400',     23:  'bg-pink-500/20 text-pink-400',
    30:  'bg-rose-500/20 text-rose-400',     31:  'bg-sky-500/20 text-sky-400',
    202: 'bg-amber-500/20 text-amber-400',   118: 'bg-indigo-500/20 text-indigo-400',
  };
  return c[leagueId] || 'bg-slate-500/20 text-slate-400';
}

export function formatTipoff(date: Date): string {
  return date.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', hour12: false });
}