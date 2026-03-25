/**
 * lib/nba-standings.ts — Free NBA Standings via ESPN Public API
 *
 * ESPN exposes an unofficial but very stable public endpoint used by
 * millions of apps. No API key, no rate limits for reasonable usage.
 *
 * Endpoint: https://site.api.espn.com/apis/v2/sports/basketball/nba/standings
 *
 * What we get:
 *   - Real wins / losses for every NBA team
 *   - Home and away records
 *   - Points per game scored and allowed
 *   - Current season data, updated daily
 *
 * This is used as a permanent fallback when API-Sports returns 0 NBA entries
 * (free plan limitation). The data is stored in the same RealTeamData format
 * so the rest of basketball.ts needs zero changes.
 */

// ─── Types (mirror RealTeamData from basketball.ts) ──────────────────────────

export interface NBATeamStandings {
  teamId:          number;   // ESPN team ID
  teamName:        string;   // e.g. "Boston Celtics"
  abbreviation:    string;   // e.g. "BOS"
  gamesPlayed:     number;
  wins:            number;
  losses:          number;
  winPct:          number;
  avgScored:       number;   // points per game
  avgConceded:     number;   // opponent points per game
  homeWins:        number;
  homeLosses:      number;
  homeAvgScored:   number;
  homeAvgConceded: number;
  awayWins:        number;
  awayLosses:      number;
  awayAvgScored:   number;
  awayAvgConceded: number;
  form:            string;   // derived from win% — ESPN doesn't return last-5
}

// ─── Cache ────────────────────────────────────────────────────────────────────

let cache:     NBATeamStandings[] = [];
let cacheTime  = 0;
const CACHE_TTL = 6 * 60 * 60 * 1000; // 6 hours — same as API-Sports standings

// ─── ESPN team name normalisation ────────────────────────────────────────────
// ESPN uses full city+name format. We normalise to lowercase for matching.

const ESPN_ENDPOINT =
  'https://site.api.espn.com/apis/v2/sports/basketball/nba/standings';

// ─── Main fetch ───────────────────────────────────────────────────────────────

/**
 * Fetch current NBA standings from ESPN.
 * Returns an array of all 30 teams with real stats.
 * Cached 6 hours.
 */
export async function fetchNBAStandings(): Promise<NBATeamStandings[]> {
  if (cache.length > 0 && Date.now() - cacheTime < CACHE_TTL) {
    return cache;
  }

  try {
    console.log('[NBA Standings] Fetching from ESPN...');

    const res = await fetch(ESPN_ENDPOINT, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (compatible; betwise/1.0)',
        Accept: 'application/json',
      },
      next: { revalidate: 21600 }, // Next.js cache 6 hours
    });

    if (!res.ok) {
      console.error(`[NBA Standings] ESPN returned ${res.status}`);
      return cache; // return stale cache if available
    }

    const json = await res.json();
    const standings = parseESPNStandings(json);

    if (standings.length > 0) {
      cache     = standings;
      cacheTime = Date.now();
      console.log(`[NBA Standings] Loaded ${standings.length} NBA teams from ESPN`);
    }

    return standings;

  } catch (err) {
    console.error('[NBA Standings] ESPN fetch error:', err);
    return cache; // return stale cache on error rather than empty
  }
}

// ─── Parser ───────────────────────────────────────────────────────────────────

function parseESPNStandings(json: any): NBATeamStandings[] {
  const results: NBATeamStandings[] = [];

  // ESPN structure: json.children = conferences, each has .standings.entries
  const conferences: any[] = json?.children || [];

  for (const conf of conferences) {
    const entries: any[] = conf?.standings?.entries || [];

    for (const entry of entries) {
      try {
        const team        = entry.team;
        const teamName    = team?.displayName || team?.name || '';
        const abbr        = team?.abbreviation || '';
        if (!teamName) continue;

        // Stats are in entry.stats array — each has a name and value
        const stats: any[] = entry.stats || [];
        const getStat = (name: string): number => {
          const s = stats.find((x: any) => x.name === name || x.shortDisplayName === name);
          return parseFloat(s?.value ?? s?.displayValue ?? '0') || 0;
        };
        const getStatStr = (name: string): string => {
          const s = stats.find((x: any) => x.name === name);
          return s?.displayValue || '';
        };

        const wins      = getStat('wins');
        const losses    = getStat('losses');
        const gamesPlayed = wins + losses;
        if (gamesPlayed < 5) continue;

        // Points per game — ESPN stat names vary slightly by season
        // Try multiple names for robustness
        const avgScored   = getStat('avgPointsFor')   || getStat('pointsFor')   || getStat('ppg')  || 0;
        const avgConceded = getStat('avgPointsAgainst') || getStat('pointsAgainst') || getStat('oppg') || 0;

        // Home/away breakdown
        const homeRecord  = getStatStr('homeRecordSummary') || getStatStr('Home');
        const awayRecord  = getStatStr('awayRecordSummary') || getStatStr('Road');
        const { w: homeWins, l: homeLosses } = parseRecord(homeRecord);
        const { w: awayWins, l: awayLosses } = parseRecord(awayRecord);

        // ESPN doesn't always give home/away PPG — estimate from overall with ±3 pts
        const homeAvgScored    = getStat('homePointsFor')    || (avgScored   > 0 ? avgScored   + 3   : 0);
        const homeAvgConceded  = getStat('homePointsAgainst') || (avgConceded > 0 ? avgConceded - 1.5 : 0);
        const awayAvgScored    = getStat('roadPointsFor')    || (avgScored   > 0 ? avgScored   - 3   : 0);
        const awayAvgConceded  = getStat('roadPointsAgainst') || (avgConceded > 0 ? avgConceded + 1.5 : 0);

        const winPct = gamesPlayed > 0 ? wins / gamesPlayed : 0.5;

        // Derive form from win percentage (ESPN doesn't return last-5)
        const form = winPct >= 0.70 ? 'WWWWL'
          : winPct >= 0.58          ? 'WWLWW'
          : winPct >= 0.48          ? 'WLWLW'
          : winPct >= 0.38          ? 'LWLWL'
          :                           'LLLWL';

        results.push({
          teamId:          team?.id ? parseInt(team.id) : 0,
          teamName,
          abbreviation:    abbr,
          gamesPlayed,
          wins,
          losses,
          winPct,
          avgScored:       round2(avgScored),
          avgConceded:     round2(avgConceded),
          homeWins,
          homeLosses,
          homeAvgScored:   round2(homeAvgScored),
          homeAvgConceded: round2(homeAvgConceded),
          awayWins,
          awayLosses,
          awayAvgScored:   round2(awayAvgScored),
          awayAvgConceded: round2(awayAvgConceded),
          form,
        });

      } catch (e) {
        // Skip malformed entries silently
      }
    }
  }

  return results;
}

function parseRecord(record: string): { w: number; l: number } {
  // Format: "32-10" or "32-10-2"
  const parts = record.split('-').map(Number);
  return { w: parts[0] || 0, l: parts[1] || 0 };
}

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

// ─── Lookup helper ────────────────────────────────────────────────────────────

/**
 * Find a team's standings by name.
 * Tries exact match first, then word-overlap fuzzy match.
 */
export function findNBATeam(
  teamName: string,
  standings: NBATeamStandings[],
): NBATeamStandings | null {
  const lower = teamName.toLowerCase();

  // 1. Exact match
  let match = standings.find(t => t.teamName.toLowerCase() === lower);
  if (match) return match;

  // 2. Contains match
  match = standings.find(t => {
    const stored = t.teamName.toLowerCase();
    return stored.includes(lower) || lower.includes(stored);
  });
  if (match) return match;

  // 3. Abbreviation match (e.g. "BOS" for "Boston Celtics")
  match = standings.find(t => t.abbreviation.toLowerCase() === lower);
  if (match) return match;

  // 4. Last word / city word match
  const queryWords = lower.split(' ').filter(w => w.length > 4);
  match = standings.find(t => {
    const stored = t.teamName.toLowerCase();
    return queryWords.some(w => stored.includes(w));
  });

  return match || null;
}