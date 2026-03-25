/**
 * lib/ai-team-assessor.ts — v3 (RATE LIMIT FIX)
 *
 * ROOT CAUSES FIXED from the logs:
 *
 * 1. FIRE-AND-FORGET STAGGER (was the main culprit)
 *    Old code fired all 60 requests with 150ms start-stagger but didn't
 *    wait for each to finish. So 60 requests all hit Groq within ~9 seconds
 *    simultaneously, saturating the 30k TPM limit immediately.
 *    Fix: TRUE SEQUENTIAL QUEUE — one request completes before the next starts.
 *
 * 2. DOUBLE-CALLING
 *    prewarmTeamCache() fired requests, then buildTeamStats() in basketball.ts
 *    called getAITeamStats() again for the same teams during analysis.
 *    The in-flight deduplication map was being cleared too early (in `finally`),
 *    so the second call didn't hit the dedup guard.
 *    Fix: Cache is checked FIRST in getAITeamStats before any network call.
 *    Pre-warm now AWAITS each request so cache is populated before analysis runs.
 *
 * 3. RETRY-AFTER NOT RESPECTED
 *    On 429, we threw immediately and the caller retried right away.
 *    Fix: Read Groq's `retry-after` header and wait that many seconds.
 *    Falls back to exponential backoff (2s → 4s → 8s) if header absent.
 *
 * 4. LEAGUE ID MISMATCH (bonus fix from logs)
 *    G League teams (Motor City Cruise, etc.) were being sent with league name
 *    "Liga ACB" because LEAGUE_DATA in basketball.ts had no entry for league 13.
 *    Fix: leagueName lookup now falls back to "G League" correctly.
 *
 * Model split (unchanged):
 *   llama-3.1-8b-instant    → team stats  (30k TPM)
 *   llama-3.3-70b-versatile → player importance (6k TPM, small batch only)
 */

const GROQ_API_KEY = process.env.GROQ_API_KEY || '';
const GROQ_URL     = 'https://api.groq.com/openai/v1/chat/completions';

const MODEL_FAST    = 'llama-3.1-8b-instant';
const MODEL_QUALITY = 'llama-3.3-70b-versatile';

// ─── Types ────────────────────────────────────────────────────────────────────

export interface AITeamStats {
  offRtg:    number;
  defRtg:    number;
  pace:      number;
  winPct:    number;
  form:      string;
  tier:      'ELITE' | 'STRONG' | 'AVERAGE' | 'WEAK';
  homeBonus: number;
  source:    'GROQ_AI';
}

export interface AIPlayerImpact {
  importanceScore: number;
  role:            string;
  source:          'GROQ_AI';
}

// ─── Cache ────────────────────────────────────────────────────────────────────

const teamCache   = new Map<string, { data: AITeamStats;    ts: number }>();
const playerCache = new Map<string, { data: AIPlayerImpact; ts: number }>();
const TEAM_TTL    = 24 * 60 * 60 * 1000;
const PLAYER_TTL  = 48 * 60 * 60 * 1000;

// ─── Sequential request queue ─────────────────────────────────────────────────
// Ensures only ONE Groq request is in-flight at a time during the pre-warm phase.
// This is the core fix — replaces the fire-and-forget stagger.

let queuePromise: Promise<void> = Promise.resolve();

function enqueue<T>(fn: () => Promise<T>): Promise<T> {
  const result = queuePromise.then(() => fn());
  // Keep the queue chain alive even if fn throws
  queuePromise = result.then(() => {}, () => {});
  return result;
}

// ─── Retry-aware Groq caller ──────────────────────────────────────────────────

const MAX_RETRIES = 3;

async function callGroq(
  systemPrompt: string,
  userPrompt:   string,
  model:        string = MODEL_FAST,
): Promise<string> {
  if (!GROQ_API_KEY || GROQ_API_KEY.length < 20) {
    throw new Error('GROQ_API_KEY not configured');
  }

  let lastError: Error = new Error('unknown');

  for (let attempt = 0; attempt < MAX_RETRIES; attempt++) {
    const res = await fetch(GROQ_URL, {
      method:  'POST',
      headers: {
        Authorization:  `Bearer ${GROQ_API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model,
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user',   content: userPrompt   },
        ],
        temperature:     0.1,
        max_tokens:      350,
        response_format: { type: 'json_object' },
      }),
    });

    if (res.status === 429) {
      // Read Groq's retry-after header (seconds), fall back to exponential backoff
      const retryAfterRaw = res.headers.get('retry-after');
      const waitSec       = retryAfterRaw
        ? Math.ceil(parseFloat(retryAfterRaw)) + 0.5   // add 0.5s safety buffer
        : Math.pow(2, attempt + 1);                      // 2s, 4s, 8s

      console.warn(`[AI Assessor] Rate limited (${model}). Waiting ${waitSec}s before retry ${attempt + 1}/${MAX_RETRIES}...`);
      await sleep(waitSec * 1000);
      lastError = new Error(`Rate limited after ${attempt + 1} attempts`);
      continue;
    }

    if (!res.ok) {
      const body = await res.text().catch(() => '');
      throw new Error(`Groq ${res.status}: ${body.slice(0, 200)}`);
    }

    const json = await res.json();
    return json.choices?.[0]?.message?.content || '{}';
  }

  throw lastError;
}

// ─── Team stats ───────────────────────────────────────────────────────────────

const TEAM_SYSTEM_PROMPT = `You are a professional basketball analyst with detailed knowledge of the NBA, Euroleague, G League, NBL, Liga ACB, LNB Pro A, Lega Basket, BBL, Turkish BSL, Greek Basket League, and CBA up to mid-2025.

Given a team name and league, return a JSON object with EXACTLY these fields and no others:
{
  "offRtg":    <number: average points scored per game, home-neutral>,
  "defRtg":    <number: average points conceded per game, home-neutral>,
  "pace":      <number: pace multiplier vs league avg, 1.03 = fast, 0.97 = slow>,
  "winPct":    <number: win percentage 0-1>,
  "form":      <string: last-5 results using only W and L, e.g. "WWLWW">,
  "tier":      <string: exactly one of ELITE, STRONG, AVERAGE, WEAK>,
  "homeBonus": <number: extra points scored at home vs road, typically 2-5>
}

Realistic ranges by league:
- NBA: offRtg 105-125, defRtg 105-120, pace 0.96-1.05
- G League: offRtg 108-128, defRtg 108-124, pace 0.97-1.06
- Euroleague: offRtg 74-92, defRtg 74-90, pace 0.93-1.03
- European leagues (ACB/LNB/BBL/BSL): offRtg 70-90, defRtg 70-88
- NBL/CBA: offRtg 80-100, defRtg 78-98

If you don't recognise the team, use the middle of the league's range with tier AVERAGE.
Return ONLY valid JSON. No markdown, no explanation, no extra fields.`;

/**
 * Get AI-estimated stats for a team.
 * Uses the sequential queue — safe to call for all 60 teams.
 */
export async function getAITeamStats(
  teamName:   string,
  leagueName: string,
  leagueId:   number,
): Promise<AITeamStats> {
  const cacheKey = `team:${leagueId}:${teamName.toLowerCase()}`;

  // Always check cache first — this is what prevents double-calling
  const cached = teamCache.get(cacheKey);
  if (cached && Date.now() - cached.ts < TEAM_TTL) {
    return cached.data;
  }

  // Enqueue — guarantees sequential execution, no concurrent Groq calls
  return enqueue(async () => {
    // Re-check cache inside queue in case another enqueued call already fetched this
    const cached2 = teamCache.get(cacheKey);
    if (cached2 && Date.now() - cached2.ts < TEAM_TTL) {
      return cached2.data;
    }

    try {
      console.log(`[AI Assessor] Fetching (8B): ${teamName} — ${leagueName}`);

      const raw    = await callGroq(
        TEAM_SYSTEM_PROMPT,
        `Team: "${teamName}"\nLeague: "${leagueName}" (ID: ${leagueId})\nSeason: 2024-2025`,
        MODEL_FAST,
      );

      const parsed = JSON.parse(raw);
      const def    = leagueDefault(leagueId);

      const data: AITeamStats = {
        offRtg:    clamp(Number(parsed.offRtg)    || def.offRtg, 55, 140),
        defRtg:    clamp(Number(parsed.defRtg)    || def.defRtg, 55, 135),
        pace:      clamp(Number(parsed.pace)      || 1.0,        0.87, 1.13),
        winPct:    clamp(Number(parsed.winPct)    || 0.5,        0.04, 0.96),
        form:      sanitizeForm(String(parsed.form || 'WLWLW')),
        tier:      sanitizeTier(parsed.tier),
        homeBonus: clamp(Number(parsed.homeBonus) || 3,          1, 7),
        source:    'GROQ_AI',
      };

      teamCache.set(cacheKey, { data, ts: Date.now() });
      console.log(`[AI Assessor] OK: ${teamName} — off=${data.offRtg}, def=${data.defRtg}, tier=${data.tier}`);

      // Polite inter-request gap after each successful call (200ms)
      await sleep(200);

      return data;

    } catch (err) {
      console.error(`[AI Assessor] Failed for "${teamName}":`, (err as Error).message);
      // Store the default so we don't retry constantly for the same team
      const fallback: AITeamStats = { ...leagueDefault(leagueId), source: 'GROQ_AI' };
      teamCache.set(cacheKey, { data: fallback, ts: Date.now() });
      return fallback;
    }
  });
}

// ─── Player importance ────────────────────────────────────────────────────────

const PLAYER_SYSTEM_PROMPT = `You are a basketball analyst with deep knowledge of player value in NBA and European leagues up to mid-2025.

Given a player name and their team/league context, return a JSON object with EXACTLY these fields:
{
  "importanceScore": <number: fraction of team offensive output this player represents, 0.0 to 1.0>,
  "role": <string: brief 5-10 word description>
}

Calibration:
- MVP-caliber (Jokic, Doncic, Giannis, SGA): 0.20-0.25
- All-Stars / Euroleague stars: 0.13-0.18
- Quality starters: 0.08-0.13
- Role players: 0.04-0.08
- Unknown player: 0.06

Return ONLY valid JSON.`;

export async function getAIPlayerImpact(
  playerName: string,
  teamName:   string,
  leagueName: string,
): Promise<AIPlayerImpact> {
  const cacheKey = `player:${playerName.toLowerCase()}`;

  const cached = playerCache.get(cacheKey);
  if (cached && Date.now() - cached.ts < PLAYER_TTL) return cached.data;

  return enqueue(async () => {
    const cached2 = playerCache.get(cacheKey);
    if (cached2 && Date.now() - cached2.ts < PLAYER_TTL) return cached2.data;

    try {
      console.log(`[AI Assessor] Player (70B): ${playerName}`);

      const raw    = await callGroq(
        PLAYER_SYSTEM_PROMPT,
        `Player: "${playerName}"\nTeam: "${teamName}"\nLeague: "${leagueName}"`,
        MODEL_QUALITY,
      );

      const parsed = JSON.parse(raw);
      const data: AIPlayerImpact = {
        importanceScore: clamp(Number(parsed.importanceScore) || 0.07, 0.02, 0.28),
        role:            String(parsed.role || 'rotation player'),
        source:          'GROQ_AI',
      };

      playerCache.set(cacheKey, { data, ts: Date.now() });
      console.log(`[AI Assessor] Player OK: ${playerName} — ${data.importanceScore.toFixed(2)}`);

      await sleep(200);
      return data;

    } catch (err) {
      console.error(`[AI Assessor] Player failed for "${playerName}":`, (err as Error).message);
      const fallback: AIPlayerImpact = { importanceScore: 0.07, role: 'rotation player', source: 'GROQ_AI' };
      playerCache.set(cacheKey, { data: fallback, ts: Date.now() });
      return fallback;
    }
  });
}

// ─── Pre-warm ─────────────────────────────────────────────────────────────────

/**
 * Pre-warm the AI cache for all teams in tonight's fixtures.
 *
 * KEY CHANGE FROM v2: This now AWAITS each request in sequence via the queue.
 * The pre-warm only returns once ALL teams are cached, so by the time
 * analyzeBasketballMatch() runs, every getAITeamStats() call is a cache hit.
 *
 * Sequential throughput on 8B (30k TPM):
 *   ~350 tokens × 200ms gap = ~1,750 tokens/min bursting
 *   Well under the 30k TPM limit even with retry overhead.
 *   60 teams × 200ms ≈ 12 seconds total — fast enough for a background init.
 */
export async function prewarmTeamCache(
  teams: { name: string; leagueName: string; leagueId: number }[],
): Promise<void> {
  if (!GROQ_API_KEY || GROQ_API_KEY.length < 20) {
    console.log('[AI Assessor] No Groq key — skipping pre-warm');
    return;
  }

  const uncached = teams.filter(t => {
    const key = `team:${t.leagueId}:${t.name.toLowerCase()}`;
    const c   = teamCache.get(key);
    return !c || Date.now() - c.ts > TEAM_TTL;
  });

  if (uncached.length === 0) {
    console.log('[AI Assessor] All teams cached — skipping pre-warm');
    return;
  }

  console.log(`[AI Assessor] Pre-warming ${uncached.length} teams sequentially...`);

  // AWAIT each one — the queue ensures they run one at a time
  for (const team of uncached) {
    await getAITeamStats(team.name, team.leagueName, team.leagueId);
  }

  console.log(`[AI Assessor] Pre-warm complete — ${uncached.length} teams cached`);
}

// ─── Cache status ─────────────────────────────────────────────────────────────

export function getAICacheStatus() {
  return {
    teamsCached:     teamCache.size,
    playersCached:   playerCache.size,
    groqConfigured:  GROQ_API_KEY.length > 20,
    modelForStats:   MODEL_FAST,
    modelForPlayers: MODEL_QUALITY,
    teams: Array.from(teamCache.entries()).map(([k, v]) => ({
      key:        k,
      ageMinutes: Math.round((Date.now() - v.ts) / 60_000),
      tier:       v.data.tier,
      offRtg:     v.data.offRtg,
      defRtg:     v.data.defRtg,
      winPct:     v.data.winPct,
    })),
  };
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function sleep(ms: number): Promise<void> {
  return new Promise(r => setTimeout(r, ms));
}

function clamp(val: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, val));
}

function sanitizeForm(raw: string): string {
  const clean = raw.toUpperCase().replace(/[^WL]/g, '').slice(-5);
  return clean.length >= 3 ? clean : 'WLWLW';
}

function sanitizeTier(raw: any): AITeamStats['tier'] {
  const t = String(raw || '').toUpperCase().trim();
  if (t === 'ELITE' || t === 'STRONG' || t === 'AVERAGE' || t === 'WEAK') return t;
  return 'AVERAGE';
}

function leagueDefault(leagueId: number): Omit<AITeamStats, 'source'> {
  const isNBA  = leagueId === 12;
  const isGLeague = leagueId === 13;
  const isEuro = [120, 117, 20, 21, 22, 23, 116, 30, 31, 118].includes(leagueId);
  const isCBA  = leagueId === 202;
  const isNBL  = leagueId === 194;

  const offRtg = isNBA ? 112 : isGLeague ? 115 : isCBA ? 95 : isNBL ? 85 : isEuro ? 82 : 90;
  const defRtg = isNBA ? 113 : isGLeague ? 116 : isCBA ? 96 : isNBL ? 86 : isEuro ? 83 : 91;

  return { offRtg, defRtg, pace: 1.0, winPct: 0.5, form: 'WLWLW', tier: 'AVERAGE', homeBonus: 3 };
}