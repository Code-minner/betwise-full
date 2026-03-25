// =============================================================
// FILE: app/api/basketball/status/route.ts
// =============================================================
//
// Hit GET /api/basketball/status to see exactly which keys are
// configured, what data is real vs AI-estimated, and how many
// teams are currently in the Groq AI cache.
//

import { NextResponse } from 'next/server';
import { getAICacheStatus } from '@/lib/ai-team-assessor';

export async function GET() {
  const aiStatus = getAICacheStatus();

  const checks = {
    sportApiKey: !!process.env.SPORTS_API_KEY,
    oddsApiKey:  !!(process.env.ODDS_API_KEY || process.env.THE_ODDS_API_KEY),
    groqApiKey:  !!process.env.GROQ_API_KEY,
  };

  const allGood = checks.sportApiKey && checks.groqApiKey && checks.oddsApiKey;
  const noSport = !checks.sportApiKey;

  return NextResponse.json({
    status: 'ok',
    configuredKeys: checks,
    dataWillBe: {
      fixtures: checks.sportApiKey
        ? '✅ REAL — fetched live from API-Sports'
        : '❌ UNAVAILABLE — add SPORTS_API_KEY to .env.local',
      standings: checks.sportApiKey
        ? '✅ REAL — live standings from API-Sports'
        : '❌ UNAVAILABLE — standings need SPORTS_API_KEY',
      injuries: checks.sportApiKey
        ? '✅ REAL — live injury list from API-Sports'
        : '❌ UNAVAILABLE — needs SPORTS_API_KEY',
      playerImportance: checks.groqApiKey
        ? '✅ AI — Groq LLaMA-3.3-70B estimates per player'
        : '⚠️  FALLBACK — using position-based estimate (less accurate)',
      teamStatsFallback: checks.groqApiKey
        ? '✅ AI — Groq LLaMA-3.3-70B estimates when standings unavailable'
        : '⚠️  LEAGUE_DEFAULT — league-average numbers only (not team-specific)',
      odds: checks.oddsApiKey
        ? '✅ REAL — live bookmaker odds from The Odds API'
        : '⚠️  UNAVAILABLE — edge vs bookmaker not calculated (add ODDS_API_KEY)',
    },
    aiCache: {
      teamsCached:    aiStatus.teamsCached,
      playersCached:  aiStatus.playersCached,
      groqConfigured: aiStatus.groqConfigured,
      cachedTeams:    aiStatus.teams,
    },
    recommendation: noSport
      ? '⛔ CRITICAL: Add SPORTS_API_KEY — without it no fixtures or standings load'
      : !checks.groqApiKey
      ? '⚠️  Add GROQ_API_KEY — team fallbacks will be league averages only'
      : !checks.oddsApiKey
      ? '⚠️  Add ODDS_API_KEY — edge calculations have no bookmaker comparison'
      : '✅ All keys configured — system running at full accuracy',
    summary: allGood
      ? 'Full data pipeline active: real fixtures + real standings + AI injuries + live odds'
      : noSport
      ? 'Nothing works without SPORTS_API_KEY'
      : 'Partial pipeline — see recommendation above',
  });
}

export const dynamic = 'force-dynamic';