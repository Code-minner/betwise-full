// =============================================================
// FILE: lib/supabase.ts
// =============================================================

import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || '';
const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || '';

export const supabase = createClient(supabaseUrl, supabaseKey);

export const isSupabaseConfigured = () => supabaseUrl.length > 10 && supabaseKey.length > 10;

// ============== TYPES ==============

export interface AnalysisHistory {
  id?: number;
  slip_code?: string;
  home_team: string;
  away_team: string;
  market: string;
  selection: string;
  line?: number | null;
  odds: number;
  probability?: number | null;
  confidence?: number | null;
  expected_value?: number | null;
  verdict?: string | null;
  data_quality?: string | null;
  actual_result?: string | null;
  won?: boolean | null;
  analyzed_at?: string;
  match_date?: string | null;
}

// ============== TEAM STATS CACHE ==============

export async function getCachedTeamStats(
  teamId: number,
  leagueId: number
): Promise<Record<string, unknown> | null> {
  if (!isSupabaseConfigured()) return null;

  try {
    const { data, error } = await supabase
      .from('team_stats_cache')
      .select('stats, fetched_at')
      .eq('team_id', teamId)
      .eq('league_id', leagueId)
      .single();

    if (error || !data) return null;

    const fetchedAt = new Date(data.fetched_at);
    const hoursSinceFetch = (Date.now() - fetchedAt.getTime()) / (1000 * 60 * 60);
    if (hoursSinceFetch > 24) return null;

    return data.stats;
  } catch {
    return null;
  }
}

export async function cacheTeamStats(
  teamId: number,
  leagueId: number,
  teamName: string,
  stats: Record<string, unknown>
): Promise<void> {
  if (!isSupabaseConfigured()) return;

  try {
    await supabase.from('team_stats_cache').upsert(
      {
        team_id: teamId,
        league_id: leagueId,
        team_name: teamName,
        stats,
        fetched_at: new Date().toISOString(),
      },
      { onConflict: 'team_id,league_id' }
    );
  } catch (error) {
    console.error('[Supabase] Cache error:', error);
  }
}

// ============== ODDS CACHE ==============

export async function getCachedOdds(eventId: string): Promise<Record<string, unknown> | null> {
  if (!isSupabaseConfigured()) return null;

  try {
    const { data, error } = await supabase
      .from('odds_cache')
      .select('odds_data, fetched_at')
      .eq('event_id', eventId)
      .single();

    if (error || !data) return null;

    const fetchedAt = new Date(data.fetched_at);
    const minutesSinceFetch = (Date.now() - fetchedAt.getTime()) / (1000 * 60);
    if (minutesSinceFetch > 15) return null;

    return data.odds_data;
  } catch {
    return null;
  }
}

export async function cacheOdds(
  sportKey: string,
  eventId: string,
  homeTeam: string,
  awayTeam: string,
  oddsData: Record<string, unknown>
): Promise<void> {
  if (!isSupabaseConfigured()) return;

  try {
    await supabase.from('odds_cache').upsert(
      {
        sport_key: sportKey,
        event_id: eventId,
        home_team: homeTeam,
        away_team: awayTeam,
        odds_data: oddsData,
        fetched_at: new Date().toISOString(),
      },
      { onConflict: 'event_id' }
    );
  } catch (error) {
    console.error('[Supabase] Cache odds error:', error);
  }
}

// ============== H2H CACHE ==============

export async function getCachedH2H(
  team1Id: number,
  team2Id: number
): Promise<Record<string, unknown> | null> {
  if (!isSupabaseConfigured()) return null;

  try {
    const [t1, t2] = team1Id < team2Id ? [team1Id, team2Id] : [team2Id, team1Id];

    const { data, error } = await supabase
      .from('h2h_cache')
      .select('matches, fetched_at')
      .eq('team1_id', t1)
      .eq('team2_id', t2)
      .single();

    if (error || !data) return null;

    const fetchedAt = new Date(data.fetched_at);
    const daysSinceFetch = (Date.now() - fetchedAt.getTime()) / (1000 * 60 * 60 * 24);
    if (daysSinceFetch > 7) return null;

    return data.matches;
  } catch {
    return null;
  }
}

export async function cacheH2H(
  team1Id: number,
  team2Id: number,
  matches: Record<string, unknown>
): Promise<void> {
  if (!isSupabaseConfigured()) return;

  try {
    const [t1, t2] = team1Id < team2Id ? [team1Id, team2Id] : [team2Id, team1Id];

    await supabase.from('h2h_cache').upsert(
      {
        team1_id: t1,
        team2_id: t2,
        matches,
        fetched_at: new Date().toISOString(),
      },
      { onConflict: 'team1_id,team2_id' }
    );
  } catch (error) {
    console.error('[Supabase] Cache H2H error:', error);
  }
}

// ============== ANALYSIS HISTORY ==============

export async function saveAnalysis(analysis: AnalysisHistory): Promise<number | null> {
  if (!isSupabaseConfigured()) return null;

  try {
    const { data, error } = await supabase
      .from('analysis_history')
      .insert({ ...analysis, analyzed_at: new Date().toISOString() })
      .select('id')
      .single();

    if (error) return null;
    return data?.id || null;
  } catch {
    return null;
  }
}

export async function saveAnalysisBatch(analyses: AnalysisHistory[]): Promise<void> {
  if (!isSupabaseConfigured() || analyses.length === 0) return;

  try {
    await supabase.from('analysis_history').insert(
      analyses.map((a) => ({ ...a, analyzed_at: new Date().toISOString() }))
    );
  } catch (error) {
    console.error('[Supabase] Batch save error:', error);
  }
}

export async function updateAnalysisResult(
  id: number,
  actualResult: string,
  won: boolean
): Promise<void> {
  if (!isSupabaseConfigured()) return;

  try {
    await supabase
      .from('analysis_history')
      .update({ actual_result: actualResult, won })
      .eq('id', id);
  } catch (error) {
    console.error('[Supabase] Update result error:', error);
  }
}

export async function getRecentAnalyses(limit = 50): Promise<AnalysisHistory[]> {
  if (!isSupabaseConfigured()) return [];

  try {
    const { data } = await supabase
      .from('analysis_history')
      .select('*')
      .order('analyzed_at', { ascending: false })
      .limit(limit);
    return data || [];
  } catch {
    return [];
  }
}

export async function getPendingAnalyses(): Promise<AnalysisHistory[]> {
  if (!isSupabaseConfigured()) return [];

  try {
    const { data } = await supabase
      .from('analysis_history')
      .select('*')
      .is('actual_result', null)
      .order('match_date', { ascending: true });
    return data || [];
  } catch {
    return [];
  }
}

// ============== PERFORMANCE STATS ==============

export async function getPerformanceStats() {
  if (!isSupabaseConfigured()) {
    return {
      total: 0,
      wins: 0,
      losses: 0,
      winRate: 0,
      roi: 0,
      profit: 0,
      avgOdds: 0,
      avgConfidence: 0,
    };
  }

  try {
    const { data } = await supabase
      .from('analysis_history')
      .select('*')
      .not('won', 'is', null);

    if (!data) return null;

    const total = data.length;
    const wins = data.filter((d) => d.won === true).length;
    const losses = data.filter((d) => d.won === false).length;

    const totalReturned = data
      .filter((d) => d.won === true)
      .reduce((sum, d) => sum + (d.odds || 1), 0);

    const roi = total > 0 ? ((totalReturned - total) / total) * 100 : 0;
    const winRate = total > 0 ? (wins / total) * 100 : 0;

    return {
      total,
      wins,
      losses,
      winRate: +winRate.toFixed(1),
      roi: +roi.toFixed(1),
      profit: +(totalReturned - total).toFixed(2),
      avgOdds:
        total > 0
          ? +(data.reduce((s, d) => s + (d.odds || 0), 0) / total).toFixed(2)
          : 0,
      avgConfidence:
        total > 0
          ? Math.round(data.reduce((s, d) => s + (d.confidence || 0), 0) / total)
          : 0,
    };
  } catch {
    return null;
  }
}

// ============== API USAGE TRACKING ==============

export async function trackApiUsage(apiName: string, endpoint: string): Promise<void> {
  if (!isSupabaseConfigured()) return;

  try {
    await supabase.rpc('track_api_usage', {
      p_api_name: apiName,
      p_endpoint: endpoint,
    });
  } catch {
    // Silently fail
  }
}

export async function getApiUsageToday(): Promise<
  Array<{ api_name: string; total_requests: number; daily_limit: number }>
> {
  if (!isSupabaseConfigured()) return [];

  try {
    const { data } = await supabase.from('v_api_usage_today').select('*');
    return data || [];
  } catch {
    return [];
  }
}