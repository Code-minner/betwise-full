/**
 * lib/elo.ts — Basketball Elo Rating Utilities
 */

const BASE_ELO  = 1500;
const ELO_SCALE = 400;

export const HOME_COURT_ELO: Record<'NBA' | 'EURO' | 'OTHER', number> = {
  NBA:   100,
  EURO:  120,
  OTHER: 110,
};

export interface EloInputs {
  winPct:          number;
  gamesPlayed:     number;
  offRtg:          number;
  defRtg:          number;
  leagueAvgOffRtg?: number;
}

export interface WinProbResult {
  homeWinProb: number;
  awayWinProb: number;
  homeElo:     number;
  awayElo:     number;
  eloDiff:     number;
  method:      'ELO_BLENDED' | 'ELO_ONLY' | 'FALLBACK';
}

function logistic(x: number): number {
  return 1 / (1 + Math.exp(-x));
}

export function normalCDF(x: number): number {
  const a1 =  0.254829592, a2 = -0.284496736, a3 = 1.421413741;
  const a4 = -1.453152027, a5 =  1.061405429, p  = 0.3275911;
  const sign = x < 0 ? -1 : 1;
  const abs  = Math.abs(x);
  const t    = 1.0 / (1.0 + p * abs);
  const poly = (((a5 * t + a4) * t + a3) * t + a2) * t + a1;
  const y    = 1.0 - poly * t * Math.exp(-abs * abs);
  return 0.5 * (1.0 + sign * y);
}

export function winPctToElo(winPct: number, gamesPlayed: number): number {
  const reliability = Math.min(1, gamesPlayed / 20);
  const clamped     = Math.max(0.04, Math.min(0.96, winPct));
  const rawElo      = BASE_ELO + ELO_SCALE * Math.log10(clamped / (1 - clamped));
  const blended     = BASE_ELO + reliability * (rawElo - BASE_ELO);
  return Math.max(1050, Math.min(1950, Math.round(blended)));
}

export function netRatingToEloDelta(netRating: number, centredAt = 0): number {
  return (netRating - centredAt) * 25;
}

export function computeCompositeElo(inputs: EloInputs): number {
  const { winPct, gamesPlayed, offRtg, defRtg } = inputs;
  const winPctElo  = winPctToElo(winPct, gamesPlayed);
  const netRating  = offRtg - defRtg;
  const netAdj     = netRatingToEloDelta(netRating);
  const netWeight  = Math.min(0.5, gamesPlayed / 40);
  const composite  = winPctElo + netAdj * netWeight;
  return Math.max(1050, Math.min(1950, Math.round(composite)));
}

export function eloWinProb(
  homeElo: number,
  awayElo: number,
  homeCourtBonus = 100,
): WinProbResult {
  const adjustedHome = homeElo + homeCourtBonus;
  const eloDiff      = adjustedHome - awayElo;
  const homeWinProb  = 1 / (1 + Math.pow(10, -eloDiff / ELO_SCALE));
  return {
    homeWinProb: Math.max(0.08, Math.min(0.92, homeWinProb)),
    awayWinProb: Math.max(0.08, Math.min(0.92, 1 - homeWinProb)),
    homeElo, awayElo, eloDiff,
    method: 'ELO_ONLY',
  };
}

export function logisticWinProb(
  homeNetRating: number,
  awayNetRating: number,
  homeForm:      string,
  awayForm:      string,
  isNBA:         boolean,
): { homeWinProb: number; awayWinProb: number } {
  const α       = isNBA ? 0.14 : 0.18;
  const β       = 0.088;
  const netDiff = homeNetRating - awayNetRating;
  let logOdds   = α + β * netDiff;

  if (homeForm && awayForm && homeForm !== 'UNKNOWN' && awayForm !== 'UNKNOWN') {
    const hw = (homeForm.match(/W/g) || []).length;
    const aw = (awayForm.match(/W/g)  || []).length;
    logOdds += (hw - aw) * 0.04;
  }

  const homeWinProb = logistic(logOdds);
  return {
    homeWinProb: Math.max(0.08, Math.min(0.92, homeWinProb)),
    awayWinProb: Math.max(0.08, Math.min(0.92, 1 - homeWinProb)),
  };
}

export function blendedWinProbability(
  eloHomeProb:    number,
  logisticHomeProb: number,
  dataQuality:    'HIGH' | 'MEDIUM' | 'LOW' | 'FALLBACK',
  gamesPlayed:    number,
): WinProbResult {
  const sampleWeight = Math.min(0.65, gamesPlayed / 50);
  const eloWeight    = 1 - sampleWeight;
  const netWeight    = sampleWeight;
  const homeWinProb  = eloWeight * eloHomeProb + netWeight * logisticHomeProb;
  return {
    homeWinProb: Math.max(0.08, Math.min(0.92, homeWinProb)),
    awayWinProb: Math.max(0.08, Math.min(0.92, 1 - homeWinProb)),
    homeElo: 0, awayElo: 0, eloDiff: 0,
    method: 'ELO_BLENDED',
  };
}

export function poissonTotalOverProb(
  lambdaHome:      number,
  lambdaAway:      number,
  line:            number,
  overdispersion = 1.35,
): number {
  const mu    = lambdaHome + lambdaAway;
  const sigma = overdispersion * Math.sqrt(mu);
  const z     = (line + 0.5 - mu) / sigma;
  return Math.max(0.04, Math.min(0.96, 1 - normalCDF(z)));
}

export function poissonTotalUnderProb(
  lambdaHome:      number,
  lambdaAway:      number,
  line:            number,
  overdispersion = 1.35,
): number {
  return 1 - poissonTotalOverProb(lambdaHome, lambdaAway, line, overdispersion);
}