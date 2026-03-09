/**
 * PerformanceSummary Component
 * File: components/PerformanceSummary.tsx
 *
 * Displays evaluation results (hit rate, ROI, calibration, recent results)
 * directly on the sport page — no separate performance page needed.
 *
 * Designed to be collapsible so it doesn't overwhelm the predictions.
 */

'use client';

import { useState } from 'react';

// ============== TYPES (matches API response) ==============

interface PerformanceData {
  total: number;
  wins: number;
  losses: number;
  pushes: number;
  hitRate: number;
  roi: number;
  profit: number;
  avgOdds: number;
  avgConfidence: number;
  bestStreak: number;
  currentStreak: number;
  biggestWinOdds: number;
  byCategory?: Record<string, CategoryStats>;
  byMarket?: Record<string, CategoryStats>;
  calibration?: CalibrationBand[];
  recentResults?: Array<{ result: string; pick: string; odds: number }>;
}

interface CategoryStats {
  total: number;
  wins: number;
  losses: number;
  hitRate: number;
  roi: number;
  profit: number;
  avgOdds: number;
}

interface CalibrationBand {
  band: string;
  predicted: number;
  actual: number;
  count: number;
  isCalibrated: boolean;
}

interface CalibrationData {
  sport: string;
  bands: Array<{
    band: string;
    rangeMin: number;
    rangeMax: number;
    predictedAvg: number;
    actualHitRate: number;
    count: number;
    correctionFactor: number;
    isCalibrated: boolean;
    bias: string;
  }>;
  overallBias: number;
  overallCorrection: number;
  sampleSize: number;
  isReliable: boolean;
}

interface RecentResult {
  homeTeam: string;
  awayTeam: string;
  market: string;
  selection: string;
  result: 'WIN' | 'LOSS' | 'PUSH' | 'VOID';
  odds: number;
  profit: number;
  matchDate: string;
  actualScore: string;
}

interface Props {
  performance: PerformanceData | null;
  calibration: CalibrationData | null;
  recentResults: RecentResult[];
  newlyEvaluated: number;
  sport: string;
}

export default function PerformanceSummary({
  performance,
  calibration,
  recentResults,
  newlyEvaluated,
  sport,
}: Props) {
  const [expanded, setExpanded] = useState(false);
  const [activeTab, setActiveTab] = useState<'overview' | 'calibration' | 'recent' | 'markets'>('overview');

  // Nothing to show yet
  if (!performance || performance.total === 0) {
    return (
      <div className="card bg-dark-800/50 border border-dark-700/50">
        <div className="flex items-center gap-2 text-dark-400">
          <span className="text-lg">📊</span>
          <span className="text-sm">
            Performance tracking active — results will appear once past predictions are evaluated
          </span>
        </div>
      </div>
    );
  }

  const streakText = performance.currentStreak > 0
    ? `🔥 ${performance.currentStreak}W streak`
    : performance.currentStreak < 0
    ? `❄️ ${Math.abs(performance.currentStreak)}L streak`
    : '—';

  return (
    <div className="card bg-dark-800/50 border border-dark-700/50">
      {/* Header — always visible */}
      <button
        onClick={() => setExpanded(!expanded)}
        className="w-full flex items-center justify-between"
      >
        <div className="flex items-center gap-3">
          <span className="text-lg">📊</span>
          <span className="font-semibold text-white">Past Performance</span>
          <span className="text-sm text-dark-400">
            {performance.total} evaluated
          </span>
          {newlyEvaluated > 0 && (
            <span className="text-xs bg-green-600/20 text-green-400 px-2 py-0.5 rounded-full">
              +{newlyEvaluated} new
            </span>
          )}
          {calibration?.isReliable && (
            <span className="text-xs bg-purple-600/20 text-purple-400 px-2 py-0.5 rounded-full">
              🎯 Calibrated
            </span>
          )}
        </div>
        <div className="flex items-center gap-4">
          {/* Quick stats always visible */}
          <div className="hidden md:flex items-center gap-4 text-sm">
            <span className={performance.hitRate >= 55 ? 'text-green-400' : performance.hitRate >= 45 ? 'text-yellow-400' : 'text-red-400'}>
              {performance.hitRate}% hit rate
            </span>
            <span className={performance.roi >= 0 ? 'text-green-400' : 'text-red-400'}>
              {performance.roi >= 0 ? '+' : ''}{performance.roi}% ROI
            </span>
            <span className={performance.profit >= 0 ? 'text-green-400' : 'text-red-400'}>
              {performance.profit >= 0 ? '+' : ''}{performance.profit}u
            </span>
          </div>
          <span className="text-dark-500 text-sm">{expanded ? '▲' : '▼'}</span>
        </div>
      </button>

      {/* Expanded content */}
      {expanded && (
        <div className="mt-4 space-y-4">
          {/* Stat cards */}
          <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
            <StatCard label="Hit Rate" value={`${performance.hitRate}%`}
              color={performance.hitRate >= 55 ? 'green' : performance.hitRate >= 45 ? 'yellow' : 'red'} />
            <StatCard label="ROI" value={`${performance.roi >= 0 ? '+' : ''}${performance.roi}%`}
              color={performance.roi >= 0 ? 'green' : 'red'} />
            <StatCard label="Profit" value={`${performance.profit >= 0 ? '+' : ''}${performance.profit}u`}
              color={performance.profit >= 0 ? 'green' : 'red'} />
            <StatCard label="Record" value={`${performance.wins}W-${performance.losses}L`}
              color="blue" />
            <StatCard label="Streak" value={streakText} color="purple" />
          </div>

          {/* Tabs */}
          <div className="flex gap-1 border-b border-dark-700">
            {(['overview', 'calibration', 'recent', 'markets'] as const).map(tab => (
              <button
                key={tab}
                onClick={() => setActiveTab(tab)}
                className={`px-3 py-2 text-sm capitalize transition-colors ${
                  activeTab === tab
                    ? 'text-white border-b-2 border-primary-500'
                    : 'text-dark-400 hover:text-dark-200'
                }`}
              >
                {tab === 'calibration' ? '🎯 Calibration' :
                 tab === 'recent' ? '🕐 Recent' :
                 tab === 'markets' ? '📈 By Market' :
                 '📊 Overview'}
              </button>
            ))}
          </div>

          {/* Tab content */}
          {activeTab === 'overview' && (
            <OverviewTab performance={performance} calibration={calibration} />
          )}
          {activeTab === 'calibration' && (
            <CalibrationTab calibration={calibration} />
          )}
          {activeTab === 'recent' && (
            <RecentTab results={recentResults} />
          )}
          {activeTab === 'markets' && (
            <MarketsTab byMarket={performance.byMarket || {}} />
          )}
        </div>
      )}
    </div>
  );
}

// ============== SUB-COMPONENTS ==============

function StatCard({ label, value, color }: { label: string; value: string; color: string }) {
  const colorClass = {
    green: 'text-green-400',
    red: 'text-red-400',
    yellow: 'text-yellow-400',
    blue: 'text-blue-400',
    purple: 'text-purple-400',
  }[color] || 'text-white';

  return (
    <div className="bg-dark-700/50 rounded-lg p-3 text-center">
      <p className="text-dark-500 text-xs">{label}</p>
      <p className={`text-lg font-bold ${colorClass}`}>{value}</p>
    </div>
  );
}

function OverviewTab({ performance, calibration }: {
  performance: PerformanceData;
  calibration: CalibrationData | null;
}) {
  return (
    <div className="space-y-3">
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 text-sm">
        <div className="bg-dark-700/30 rounded p-2">
          <span className="text-dark-500">Avg Odds:</span>
          <span className="ml-2 text-white">{performance.avgOdds}</span>
        </div>
        <div className="bg-dark-700/30 rounded p-2">
          <span className="text-dark-500">Avg Conf:</span>
          <span className="ml-2 text-white">{performance.avgConfidence}%</span>
        </div>
        <div className="bg-dark-700/30 rounded p-2">
          <span className="text-dark-500">Best Streak:</span>
          <span className="ml-2 text-green-400">{performance.bestStreak}W</span>
        </div>
        <div className="bg-dark-700/30 rounded p-2">
          <span className="text-dark-500">Best Win:</span>
          <span className="ml-2 text-yellow-400">{performance.biggestWinOdds.toFixed(2)}</span>
        </div>
      </div>

      {/* By Category breakdown */}
      {performance.byCategory && Object.keys(performance.byCategory).length > 0 && (
        <div>
          <p className="text-sm text-dark-400 mb-2">By Category</p>
          <div className="space-y-1">
            {Object.entries(performance.byCategory).map(([cat, stats]) => (
              <div key={cat} className="flex items-center justify-between bg-dark-700/30 rounded px-3 py-1.5 text-sm">
                <span className="text-dark-300">{cat}</span>
                <div className="flex gap-4 text-xs">
                  <span>{stats.total} bets</span>
                  <span className={stats.hitRate >= 50 ? 'text-green-400' : 'text-red-400'}>
                    {stats.hitRate}% HR
                  </span>
                  <span className={stats.roi >= 0 ? 'text-green-400' : 'text-red-400'}>
                    {stats.roi >= 0 ? '+' : ''}{stats.roi}% ROI
                  </span>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Calibration status banner */}
      {calibration && (
        <div className={`rounded-lg p-3 text-sm ${
          calibration.isReliable
            ? calibration.overallBias > 3
              ? 'bg-orange-900/20 border border-orange-700/30'
              : calibration.overallBias < -3
              ? 'bg-blue-900/20 border border-blue-700/30'
              : 'bg-green-900/20 border border-green-700/30'
            : 'bg-dark-700/30'
        }`}>
          {calibration.isReliable ? (
            calibration.overallBias > 3 ? (
              <p className="text-orange-400">
                ⚠️ Model is <strong>overconfident</strong> by ~{calibration.overallBias}% — predictions are being adjusted downward
              </p>
            ) : calibration.overallBias < -3 ? (
              <p className="text-blue-400">
                📈 Model is <strong>underconfident</strong> by ~{Math.abs(calibration.overallBias)}% — predictions are being boosted slightly
              </p>
            ) : (
              <p className="text-green-400">
                ✅ Model is <strong>well calibrated</strong> — predictions closely match actual outcomes
              </p>
            )
          ) : (
            <p className="text-dark-400">
              📊 Need {20 - (calibration.sampleSize || 0)} more evaluated predictions to activate calibration adjustment
            </p>
          )}
        </div>
      )}
    </div>
  );
}

function CalibrationTab({ calibration }: { calibration: CalibrationData | null }) {
  if (!calibration || calibration.bands.length === 0) {
    return <p className="text-dark-500 text-sm py-4">Not enough data for calibration analysis yet.</p>;
  }

  return (
    <div className="space-y-3">
      <p className="text-dark-400 text-xs">
        Compares what the model predicted vs what actually happened. Green = well calibrated.
      </p>

      {/* Visual calibration chart */}
      <div className="space-y-2">
        {calibration.bands
          .filter(b => b.count > 0)
          .map(band => {
            const maxWidth = 100;
            const predictedWidth = Math.min(maxWidth, band.predictedAvg);
            const actualWidth = Math.min(maxWidth, band.actualHitRate);
            const diff = band.predictedAvg - band.actualHitRate;

            return (
              <div key={band.band} className="bg-dark-700/30 rounded p-2">
                <div className="flex justify-between text-xs mb-1">
                  <span className="text-dark-400">{band.band} ({band.count} bets)</span>
                  <span className={
                    band.isCalibrated ? 'text-green-400' :
                    band.bias === 'OVERCONFIDENT' ? 'text-orange-400' :
                    'text-blue-400'
                  }>
                    {band.bias === 'OVERCONFIDENT' ? `↑ Over by ${diff.toFixed(1)}%` :
                     band.bias === 'UNDERCONFIDENT' ? `↓ Under by ${Math.abs(diff).toFixed(1)}%` :
                     '✓ Calibrated'}
                  </span>
                </div>
                {/* Predicted bar */}
                <div className="flex items-center gap-2 mb-0.5">
                  <span className="text-xs text-dark-500 w-16">Predicted</span>
                  <div className="flex-1 bg-dark-600 rounded-full h-2">
                    <div
                      className="bg-blue-500/60 h-2 rounded-full"
                      style={{ width: `${predictedWidth}%` }}
                    />
                  </div>
                  <span className="text-xs text-dark-400 w-10 text-right">{band.predictedAvg}%</span>
                </div>
                {/* Actual bar */}
                <div className="flex items-center gap-2">
                  <span className="text-xs text-dark-500 w-16">Actual</span>
                  <div className="flex-1 bg-dark-600 rounded-full h-2">
                    <div
                      className={`h-2 rounded-full ${
                        band.isCalibrated ? 'bg-green-500/60' :
                        band.bias === 'OVERCONFIDENT' ? 'bg-orange-500/60' :
                        'bg-blue-500/80'
                      }`}
                      style={{ width: `${actualWidth}%` }}
                    />
                  </div>
                  <span className="text-xs text-dark-400 w-10 text-right">{band.actualHitRate}%</span>
                </div>
                {/* Correction factor */}
                {band.count >= 8 && (
                  <div className="text-xs text-dark-500 mt-1">
                    Correction: ×{band.correctionFactor.toFixed(3)}
                  </div>
                )}
              </div>
            );
          })}
      </div>

      {calibration.isReliable && (
        <div className="text-xs text-dark-500 bg-dark-700/30 rounded p-2">
          Overall: Model predicts {calibration.overallBias > 0 ? 'higher' : 'lower'} than reality
          by {Math.abs(calibration.overallBias)}%. Correction factor: ×{calibration.overallCorrection}
        </div>
      )}
    </div>
  );
}

function RecentTab({ results }: { results: RecentResult[] }) {
  if (results.length === 0) {
    return <p className="text-dark-500 text-sm py-4">No recent results yet.</p>;
  }

  return (
    <div className="space-y-1 max-h-64 overflow-y-auto">
      {results.map((r, i) => (
        <div
          key={i}
          className={`flex items-center justify-between rounded px-3 py-2 text-sm ${
            r.result === 'WIN' ? 'bg-green-900/15' :
            r.result === 'LOSS' ? 'bg-red-900/15' :
            'bg-dark-700/30'
          }`}
        >
          <div className="flex items-center gap-2 flex-1 min-w-0">
            <span className={`text-xs font-bold px-1.5 py-0.5 rounded ${
              r.result === 'WIN' ? 'bg-green-600/30 text-green-400' :
              r.result === 'LOSS' ? 'bg-red-600/30 text-red-400' :
              'bg-dark-600 text-dark-300'
            }`}>
              {r.result}
            </span>
            <span className="truncate text-dark-300">
              {r.homeTeam} vs {r.awayTeam}
            </span>
          </div>
          <div className="flex items-center gap-3 text-xs flex-shrink-0">
            <span className="text-dark-400">{r.actualScore}</span>
            <span className="text-dark-500">@{r.odds.toFixed(2)}</span>
            <span className={r.profit >= 0 ? 'text-green-400' : 'text-red-400'}>
              {r.profit >= 0 ? '+' : ''}{r.profit.toFixed(2)}u
            </span>
          </div>
        </div>
      ))}
    </div>
  );
}

function MarketsTab({ byMarket }: { byMarket: Record<string, CategoryStats> }) {
  const entries = Object.entries(byMarket).sort((a, b) => b[1].total - a[1].total);

  if (entries.length === 0) {
    return <p className="text-dark-500 text-sm py-4">No market breakdown available yet.</p>;
  }

  const marketLabels: Record<string, string> = {
    GOALS_OVER_2_5: '⚽ Over 2.5',
    GOALS_UNDER_2_5: '⚽ Under 2.5',
    MATCH_WINNER_HOME: '🏠 Home Win',
    MATCH_WINNER_AWAY: '✈️ Away Win',
    DOUBLE_CHANCE_1X: '🛡️ DC 1X',
    BTTS_YES: '⚽ BTTS Yes',
    BTTS_NO: '⚽ BTTS No',
    TOTALS_OVER: '🏀 Over',
    TOTALS_UNDER: '🏀 Under',
    SPREAD_HOME: '🏀 Spread H',
    SPREAD_AWAY: '🏀 Spread A',
    MONEYLINE: '🏀 ML',
    MATCH_WINNER: '🎾 Winner',
  };

  return (
    <div className="space-y-1">
      {entries.map(([market, stats]) => (
        <div key={market} className="flex items-center justify-between bg-dark-700/30 rounded px-3 py-2 text-sm">
          <span className="text-dark-300">{marketLabels[market] || market}</span>
          <div className="flex gap-4 text-xs">
            <span className="text-dark-500">{stats.total} bets</span>
            <span className="text-dark-400">{stats.wins}W-{stats.losses}L</span>
            <span className={stats.hitRate >= 50 ? 'text-green-400' : 'text-red-400'}>
              {stats.hitRate}%
            </span>
            <span className={stats.roi >= 0 ? 'text-green-400' : 'text-red-400'}>
              {stats.roi >= 0 ? '+' : ''}{stats.roi}%
            </span>
          </div>
        </div>
      ))}
    </div>
  );
}