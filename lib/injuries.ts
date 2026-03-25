/**
 * lib/injuries.ts — Real-Time Injury Data & AI-Powered Impact (v2)
 *
 * CHANGES FROM v1:
 * ✅ PLAYER_IMPORTANCE hardcoded dictionary completely removed
 * ✅ Player importance now fetched from Groq via getAIPlayerImpact()
 * ✅ Results cached 48h per player (Groq called once per new player name)
 * ✅ Falls back to position-based estimate if Groq unavailable
 */

import { getAIPlayerImpact } from './ai-team-assessor';

const API_KEY  = process.env.SPORTS_API_KEY || '';
const API_HOST = 'v1.basketball.api-sports.io';

// ─── Types ────────────────────────────────────────────────────────────────────

export interface InjuredPlayer {
  playerId:        number;
  playerName:      string;
  teamId:          number;
  teamName:        string;
  status:          'Out' | 'Doubtful' | 'Questionable' | 'Day-To-Day';
  reason:          string;
  importanceScore: number;
  aiRole?:         string;
}

export interface TeamInjuryImpact {
  offensiveMultiplier: number;
  defensiveMultiplier: number;
  paceMultiplier:      number;
  injuredPlayers:      InjuredPlayer[];
  hasStarOut:          boolean;
  confidencePenalty:   number;
  summary:             string;
}

// ─── Position fallback (used when Groq unavailable) ──────────────────────────

function positionFallbackImportance(position: string): number {
  const pos = (position || '').toUpperCase();
  if (pos.includes('G'))  return 0.08;
  if (pos.includes('FC')) return 0.09;
  if (pos.includes('C'))  return 0.09;
  if (pos.includes('F'))  return 0.08;
  return 0.07;
}

// ─── Cache & league seasons ───────────────────────────────────────────────────

const injuryCache = new Map<string, InjuredPlayer[]>();
const injuryTimes = new Map<string, number>();
const INJURY_TTL  = 60 * 60 * 1000;

const LEAGUE_SEASONS: Record<number, string> = {
  12:  '2024',
  120: '2024-2025', 117: '2024-2025', 194: '2024-2025',
  20:  '2024-2025', 21:  '2024-2025', 22:  '2024-2025',
  23:  '2024-2025', 30:  '2024-2025', 31:  '2024-2025',
  202: '2024-2025',
};

// ─── API fetch ────────────────────────────────────────────────────────────────

async function fetchLeagueInjuries(leagueId: number): Promise<InjuredPlayer[]> {
  const cacheKey = `${leagueId}`;
  const cachedAt = injuryTimes.get(cacheKey) || 0;
  if (Date.now() - cachedAt < INJURY_TTL) return injuryCache.get(cacheKey) || [];

  if (!API_KEY) {
    console.log('[Injuries] No API key — skipping');
    return [];
  }

  const season = LEAGUE_SEASONS[leagueId] || '2024-2025';
  try {
    console.log(`[Injuries] Fetching league ${leagueId}`);
    const res = await fetch(
      `https://${API_HOST}/injuries?league=${leagueId}&season=${season}`,
      { headers: { 'x-apisports-key': API_KEY } },
    );
    if (!res.ok) return [];
    const json = await res.json();
    if (json.errors && Object.keys(json.errors).length > 0) return [];

    const rawList: any[] = json.response || [];

    const baseInjuries: InjuredPlayer[] = rawList
      .map((r: any) => ({
        playerId:        r.player?.id   || 0,
        playerName:      r.player?.name || '',
        teamId:          r.team?.id     || 0,
        teamName:        r.team?.name   || '',
        status:          normaliseStatus(r.type || r.status || 'Out'),
        reason:          r.comment || r.description || '',
        importanceScore: positionFallbackImportance(r.player?.pos || ''),
      } as InjuredPlayer))
      .filter(p => p.teamId > 0 && p.playerName &&
                   (p.status === 'Out' || p.status === 'Doubtful'));

    // Enrich Out players with Groq AI importance scores
    const outPlayers = baseInjuries.filter(p => p.status === 'Out');
    const leagueName = `League ${leagueId}`;
    const enriched   = await enrichWithAI(outPlayers, leagueName);

    const aiMap    = new Map(enriched.map(p => [p.playerName, p]));
    const finalList = baseInjuries.map(p => aiMap.get(p.playerName) || p);

    console.log(`[Injuries] League ${leagueId}: ${finalList.length} injured (${enriched.length} AI-enriched)`);
    injuryCache.set(cacheKey, finalList);
    injuryTimes.set(cacheKey, Date.now());
    return finalList;

  } catch (err) {
    console.error('[Injuries] Fetch error:', err);
    return [];
  }
}

async function enrichWithAI(players: InjuredPlayer[], leagueName: string): Promise<InjuredPlayer[]> {
  const results: InjuredPlayer[] = [];
  for (const player of players) {
    try {
      const ai = await getAIPlayerImpact(player.playerName, player.teamName, leagueName);
      results.push({ ...player, importanceScore: ai.importanceScore, aiRole: ai.role });
    } catch {
      results.push(player);
    }
    await new Promise(r => setTimeout(r, 250));
  }
  return results;
}

function normaliseStatus(raw: string): InjuredPlayer['status'] {
  const s = raw.toLowerCase();
  if (s.includes('out'))          return 'Out';
  if (s.includes('doubtful'))     return 'Doubtful';
  if (s.includes('questionable')) return 'Questionable';
  if (s.includes('day'))          return 'Day-To-Day';
  return 'Out';
}

// ─── Public API ───────────────────────────────────────────────────────────────

export async function getLeagueInjuries(leagueId: number): Promise<InjuredPlayer[]> {
  return fetchLeagueInjuries(leagueId);
}

export function computeTeamInjuryImpact(
  teamId:   number,
  teamName: string,
  injuries: InjuredPlayer[],
): TeamInjuryImpact {
  const teamInjuries = injuries.filter(p => {
    if (p.teamId === teamId) return true;
    const stored = p.teamName.toLowerCase();
    const query  = teamName.toLowerCase();
    if (stored === query || stored.includes(query) || query.includes(stored)) return true;
    return query.split(' ').filter(w => w.length >= 5).some(w => stored.includes(w));
  });

  if (teamInjuries.length === 0) return noInjuryImpact();

  let offImpact = 0, defImpact = 0, paceImpact = 0;

  for (const player of teamInjuries) {
    const severity = player.status === 'Doubtful' ? 0.55 : 1.0;
    const eff      = player.importanceScore * severity;
    offImpact  += eff;
    defImpact  += eff * 0.70;
    paceImpact += eff * 0.15;
  }

  const offMult    = Math.max(0.65, 1 - Math.min(0.35, offImpact));
  const defMult    = Math.min(1.25, 1 + Math.min(0.25, defImpact));
  const paceMult   = Math.max(0.94, 1 - Math.min(0.06, paceImpact));
  const hasStarOut = teamInjuries.some(p => p.importanceScore >= 0.15 && p.status === 'Out');
  const confidencePenalty = hasStarOut ? 12 : teamInjuries.some(p => p.importanceScore >= 0.10) ? 7 : 3;

  const top     = [...teamInjuries].sort((a, b) => b.importanceScore - a.importanceScore);
  const topRole = top[0]?.aiRole ? ` — ${top[0].aiRole}` : '';
  const summary = hasStarOut
    ? `⚠️ ${top[0]?.playerName}${topRole} Out (${(offImpact * 100).toFixed(0)}% impact)`
    : teamInjuries.length === 1
      ? `${top[0]?.playerName} (${top[0]?.status})`
      : `${teamInjuries.length} players missing (${(offImpact * 100).toFixed(0)}% impact)`;

  return {
    offensiveMultiplier: r3(offMult),
    defensiveMultiplier: r3(defMult),
    paceMultiplier:      r3(paceMult),
    injuredPlayers:      teamInjuries,
    hasStarOut,
    confidencePenalty,
    summary,
  };
}

function noInjuryImpact(): TeamInjuryImpact {
  return {
    offensiveMultiplier: 1.0, defensiveMultiplier: 1.0, paceMultiplier: 1.0,
    injuredPlayers: [], hasStarOut: false, confidencePenalty: 0, summary: 'Full strength',
  };
}

function r3(n: number) { return Math.round(n * 1000) / 1000; }

export function formatInjuryWarnings(
  homeImpact: TeamInjuryImpact, awayImpact: TeamInjuryImpact,
  homeTeamName: string, awayTeamName: string,
): string[] {
  const w: string[] = [];
  if (homeImpact.injuredPlayers.length > 0) w.push(`${homeTeamName}: ${homeImpact.summary}`);
  if (awayImpact.injuredPlayers.length  > 0) w.push(`${awayTeamName}: ${awayImpact.summary}`);
  return w;
}