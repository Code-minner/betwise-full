/**
 * Calibration System
 * File: lib/calibration.ts
 *
 * Compares predicted probabilities against actual outcomes to detect
 * systematic bias (overconfidence / underconfidence) and applies
 * correction factors to future predictions.
 *
 * Example: If predictions at 70% confidence only win 55% of the time,
 * the system detects overconfidence and applies a correction factor
 * that pulls future 70% predictions down toward reality.
 *
 * The correction is conservative — it requires a minimum sample size
 * before adjusting, and blends toward the raw prediction when data
 * is sparse.
 */

export interface CalibrationBand {
  band: string;           // "50-60%", "60-70%", etc.
  rangeMin: number;       // 50
  rangeMax: number;       // 60
  predictedAvg: number;   // Average predicted probability in this band
  actualHitRate: number;  // Actual win rate
  count: number;          // Sample size
  correctionFactor: number; // Multiply raw probability by this
  isCalibrated: boolean;  // Within acceptable tolerance
  bias: 'OVERCONFIDENT' | 'UNDERCONFIDENT' | 'CALIBRATED';
}

export interface CalibrationProfile {
  sport: string;
  bands: CalibrationBand[];
  overallBias: number;      // Positive = overconfident, negative = underconfident
  overallCorrection: number; // Multiply all probabilities by this
  sampleSize: number;
  lastUpdated: string;
  isReliable: boolean;      // Enough data to trust corrections
}

export interface EvaluatedPrediction {
  probability: number;     // Original predicted probability (0-1)
  confidence: number;
  result: 'WIN' | 'LOSS' | 'PUSH';
  market: string;
  sport: string;
}

// Minimum predictions per band before we trust the correction
const MIN_BAND_SAMPLE = 8;
// Minimum total predictions before applying any calibration
const MIN_TOTAL_SAMPLE = 20;
// Maximum correction magnitude (don't adjust more than 20% in either direction)
const MAX_CORRECTION = 0.20;
// How much to blend correction vs raw (0 = all raw, 1 = all corrected)
// Scales with sample size
const BLEND_FACTOR_BASE = 0.5;

/**
 * Build a calibration profile from evaluated predictions.
 * Groups predictions into probability bands and compares
 * predicted vs actual win rates.
 */
export function buildCalibrationProfile(
  predictions: EvaluatedPrediction[],
  sport: string
): CalibrationProfile {
  const validPreds = predictions.filter(
    p => (p.result === 'WIN' || p.result === 'LOSS') && p.probability > 0
  );

  const bandDefs = [
    { band: '40-50%', min: 0.40, max: 0.50 },
    { band: '50-55%', min: 0.50, max: 0.55 },
    { band: '55-60%', min: 0.55, max: 0.60 },
    { band: '60-65%', min: 0.60, max: 0.65 },
    { band: '65-70%', min: 0.65, max: 0.70 },
    { band: '70-75%', min: 0.70, max: 0.75 },
    { band: '75-80%', min: 0.75, max: 0.80 },
    { band: '80-90%', min: 0.80, max: 0.90 },
  ];

  const bands: CalibrationBand[] = bandDefs.map(def => {
    // Normalize probability to 0-1 range
    const inBand = validPreds.filter(p => {
      const prob = p.probability > 1 ? p.probability / 100 : p.probability;
      return prob >= def.min && prob < def.max;
    });

    const count = inBand.length;
    const predictedAvg = count > 0
      ? inBand.reduce((s, p) => s + (p.probability > 1 ? p.probability / 100 : p.probability), 0) / count
      : (def.min + def.max) / 2;
    const actualHitRate = count > 0
      ? inBand.filter(p => p.result === 'WIN').length / count
      : 0;

    // Calculate correction factor
    let correctionFactor = 1.0;
    let bias: 'OVERCONFIDENT' | 'UNDERCONFIDENT' | 'CALIBRATED' = 'CALIBRATED';

    if (count >= MIN_BAND_SAMPLE && predictedAvg > 0) {
      const rawCorrection = actualHitRate / predictedAvg;
      // Clamp correction to prevent wild swings
      correctionFactor = Math.max(1 - MAX_CORRECTION, Math.min(1 + MAX_CORRECTION, rawCorrection));

      // Blend based on sample size confidence
      const sampleConfidence = Math.min(1, count / 30); // Full confidence at 30+ samples
      const blendFactor = BLEND_FACTOR_BASE * sampleConfidence;
      correctionFactor = 1.0 * (1 - blendFactor) + correctionFactor * blendFactor;

      const diff = predictedAvg - actualHitRate;
      if (diff > 0.05) bias = 'OVERCONFIDENT';
      else if (diff < -0.05) bias = 'UNDERCONFIDENT';
    }

    const isCalibrated = count >= MIN_BAND_SAMPLE && Math.abs(predictedAvg - actualHitRate) < 0.08;

    return {
      band: def.band,
      rangeMin: def.min * 100,
      rangeMax: def.max * 100,
      predictedAvg: Math.round(predictedAvg * 1000) / 10,
      actualHitRate: Math.round(actualHitRate * 1000) / 10,
      count,
      correctionFactor: Math.round(correctionFactor * 1000) / 1000,
      isCalibrated,
      bias,
    };
  });

  // Overall bias
  const totalPredicted = validPreds.reduce((s, p) => s + (p.probability > 1 ? p.probability / 100 : p.probability), 0);
  const totalWins = validPreds.filter(p => p.result === 'WIN').length;
  const overallPredictedRate = validPreds.length > 0 ? totalPredicted / validPreds.length : 0;
  const overallActualRate = validPreds.length > 0 ? totalWins / validPreds.length : 0;
  const overallBias = Math.round((overallPredictedRate - overallActualRate) * 1000) / 10;

  let overallCorrection = 1.0;
  if (validPreds.length >= MIN_TOTAL_SAMPLE && overallPredictedRate > 0) {
    const rawOverall = overallActualRate / overallPredictedRate;
    overallCorrection = Math.max(1 - MAX_CORRECTION, Math.min(1 + MAX_CORRECTION, rawOverall));
    const sampleConf = Math.min(1, validPreds.length / 50);
    overallCorrection = 1.0 * (1 - sampleConf * 0.4) + overallCorrection * (sampleConf * 0.4);
  }

  return {
    sport,
    bands,
    overallBias,
    overallCorrection: Math.round(overallCorrection * 1000) / 1000,
    sampleSize: validPreds.length,
    lastUpdated: new Date().toISOString(),
    isReliable: validPreds.length >= MIN_TOTAL_SAMPLE,
  };
}

/**
 * Apply calibration correction to a raw probability.
 * Uses the band-specific correction if available,
 * falls back to overall correction.
 */
export function applyCalibratedProbability(
  rawProbability: number,
  profile: CalibrationProfile | null
): { adjusted: number; correctionApplied: boolean; correctionNote: string } {
  if (!profile || !profile.isReliable) {
    return {
      adjusted: rawProbability,
      correctionApplied: false,
      correctionNote: 'No calibration data yet',
    };
  }

  const probNorm = rawProbability > 1 ? rawProbability / 100 : rawProbability;

  // Find matching band
  const band = profile.bands.find(
    b => probNorm >= b.rangeMin / 100 && probNorm < b.rangeMax / 100
  );

  let correction: number;
  let note: string;

  if (band && band.count >= MIN_BAND_SAMPLE) {
    correction = band.correctionFactor;
    note = `Band ${band.band}: predicted ${band.predictedAvg}% → actual ${band.actualHitRate}% (${band.bias})`;
  } else {
    correction = profile.overallCorrection;
    note = `Overall correction: bias ${profile.overallBias > 0 ? '+' : ''}${profile.overallBias}%`;
  }

  const adjusted = Math.max(0.05, Math.min(0.95, probNorm * correction));

  return {
    adjusted: rawProbability > 1 ? Math.round(adjusted * 100) : Math.round(adjusted * 1000) / 1000,
    correctionApplied: Math.abs(correction - 1.0) > 0.005,
    correctionNote: note,
  };
}

/**
 * Apply calibration to confidence score.
 * If predictions at this confidence level underperform,
 * reduce confidence proportionally.
 */
export function applyCalibratedConfidence(
  rawConfidence: number,
  rawProbability: number,
  profile: CalibrationProfile | null
): number {
  if (!profile || !profile.isReliable) return rawConfidence;

  const probNorm = rawProbability > 1 ? rawProbability / 100 : rawProbability;

  const band = profile.bands.find(
    b => probNorm >= b.rangeMin / 100 && probNorm < b.rangeMax / 100
  );

  if (!band || band.count < MIN_BAND_SAMPLE) return rawConfidence;

  // If overconfident, reduce confidence
  if (band.bias === 'OVERCONFIDENT') {
    const penaltyPct = Math.min(15, (band.predictedAvg - band.actualHitRate) * 0.8);
    return Math.max(25, Math.round(rawConfidence - penaltyPct));
  }

  // If underconfident, slight boost
  if (band.bias === 'UNDERCONFIDENT') {
    const boostPct = Math.min(8, (band.actualHitRate - band.predictedAvg) * 0.5);
    return Math.min(90, Math.round(rawConfidence + boostPct));
  }

  return rawConfidence;
}