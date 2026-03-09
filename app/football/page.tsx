/**
 * Football Page (v2 — with integrated performance)
 * File: app/football/page.tsx
 *
 * CHANGES:
 * ✅ Fetches evaluation data alongside predictions
 * ✅ Shows PerformanceSummary component (hit rate, ROI, calibration, recent results)
 * ✅ Calibration badges on individual predictions when correction was applied
 * ✅ No separate performance page needed
 */

'use client';

import { useState, useEffect } from 'react';
import { Prediction, FOOTBALL_LEAGUES } from '@/lib/types';
import PredictionCard from '@/components/PredictionCard';
import PerformanceSummary from '@/components/PerformanceSummary';

// Evaluation data shape (matches API response)
interface EvaluationData {
  performance: any;
  calibration: any;
  recentResults: any[];
  newlyEvaluated: number;
  success: boolean;
}

export default function FootballPage() {
  const [predictions, setPredictions] = useState<Prediction[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selectedLeague, setSelectedLeague] = useState<number | null>(null);
  const [category, setCategory] = useState<'ALL' | 'WINNER' | 'GOALS'>('ALL');
  const [aiEnhanced, setAiEnhanced] = useState(false);
  const [cached, setCached] = useState(false);
  const [stats, setStats] = useState<{
    total: number;
    lowRisk: number;
    value: number;
    speculative: number;
    avgConfidence: number;
    avgEdge: number;
    calibrated?: number;
  } | null>(null);

  // NEW: Evaluation state
  const [evaluation, setEvaluation] = useState<EvaluationData | null>(null);

  useEffect(() => {
    fetchPredictions();
  }, []);

  async function fetchPredictions() {
    setLoading(true);
    setError(null);

    try {
      const response = await fetch('/api/football/analyze');
      const data = await response.json();

      if (data.success) {
        setPredictions(data.predictions);
        setAiEnhanced(data.aiEnhanced || false);
        setCached(data.cached || false);
        setStats(data.stats || null);
        // NEW: Store evaluation data
        if (data.evaluation) {
          setEvaluation(data.evaluation);
        }
      } else {
        setError(data.error || 'Failed to fetch predictions');
      }
    } catch (e) {
      setError('Failed to connect to server');
    } finally {
      setLoading(false);
    }
  }

  // Filter predictions
  const filteredPredictions = predictions.filter(p => {
    if (category === 'GOALS' && !p.market.includes('GOAL') && !p.market.includes('OVER') && !p.market.includes('UNDER')) return false;
    if (category === 'WINNER' && !p.market.includes('WINNER') && !p.market.includes('DOUBLE_CHANCE')) return false;
    if (selectedLeague) {
      const leagueName = FOOTBALL_LEAGUES.find(l => l.id === selectedLeague)?.name;
      if (p.matchInfo?.league !== leagueName) return false;
    }
    return true;
  });

  // Group by category
  const lowRisk = filteredPredictions.filter(p => p.category === 'LOW_RISK');
  const value = filteredPredictions.filter(p => p.category === 'VALUE');
  const speculative = filteredPredictions.filter(p => p.category === 'SPECULATIVE' || !p.category);

  const calculateAvgEdge = () => {
    if (filteredPredictions.length === 0) return 0;
    return filteredPredictions.reduce((a, p) => a + (p.edge || 0), 0) / filteredPredictions.length;
  };

  const calculateAvgConf = () => {
    if (filteredPredictions.length === 0) return 0;
    return Math.round(filteredPredictions.reduce((a, p) => a + p.confidence, 0) / filteredPredictions.length);
  };

  return (
    <div className="space-y-8">
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold flex items-center gap-3">
            ⚽ Football Predictions
            {aiEnhanced && (
              <span className="text-sm bg-purple-600 text-white px-2 py-1 rounded-full flex items-center gap-1">
                🤖 AI Enhanced
              </span>
            )}
            {stats?.calibrated && stats.calibrated > 0 && (
              <span className="text-sm bg-blue-600/80 text-white px-2 py-1 rounded-full flex items-center gap-1">
                🎯 Calibrated
              </span>
            )}
          </h1>
          <p className="text-dark-400 mt-1">
            {evaluation?.calibration?.isReliable
              ? `AI-powered analysis • Calibrated from ${evaluation.calibration.sampleSize} past results`
              : 'AI-powered analysis • Click any card for Deep Research'}
          </p>
        </div>
        <div className="flex items-center gap-3">
          {cached && (
            <span className="text-xs text-dark-500 bg-dark-800 px-2 py-1 rounded">
              Cached
            </span>
          )}
          <button
            onClick={fetchPredictions}
            className="btn-primary flex items-center gap-2"
            disabled={loading}
          >
            {loading ? <span className="animate-spin">⟳</span> : <span>↻</span>}
            Refresh
          </button>
        </div>
      </div>

      {/* ============== NEW: Performance Summary ============== */}
      {!loading && evaluation && (
        <PerformanceSummary
          performance={evaluation.performance}
          calibration={evaluation.calibration}
          recentResults={evaluation.recentResults || []}
          newlyEvaluated={evaluation.newlyEvaluated}
          sport="Football"
        />
      )}

      {/* Filters */}
      <div className="flex flex-wrap gap-4">
        <div className="flex rounded-lg overflow-hidden border border-dark-600">
          {(['ALL', 'WINNER', 'GOALS'] as const).map((cat) => (
            <button
              key={cat}
              onClick={() => setCategory(cat)}
              className={`px-4 py-2 text-sm transition-colors ${
                category === cat
                  ? 'bg-primary-600 text-white'
                  : 'bg-dark-800 text-dark-300 hover:bg-dark-700'
              }`}
            >
              {cat === 'WINNER' ? '🏆 Winner' :
               cat === 'GOALS' ? '⚽ Goals' : '📊 All'}
            </button>
          ))}
        </div>

        <select
          value={selectedLeague || ''}
          onChange={(e) => setSelectedLeague(e.target.value ? Number(e.target.value) : null)}
          className="input"
        >
          <option value="">All Leagues</option>
          {FOOTBALL_LEAGUES.map(league => (
            <option key={league.id} value={league.id}>{league.name}</option>
          ))}
        </select>
      </div>

      {/* Stats */}
      {predictions.length > 0 && (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <div className="card text-center py-3">
            <p className="text-dark-400 text-xs">Total</p>
            <p className="text-xl font-bold">{filteredPredictions.length}</p>
          </div>
          <div className="card text-center py-3">
            <p className="text-dark-400 text-xs">Low Risk</p>
            <p className="text-xl font-bold text-green-400">{lowRisk.length}</p>
          </div>
          <div className="card text-center py-3">
            <p className="text-dark-400 text-xs">Avg Conf</p>
            <p className="text-xl font-bold text-primary-400">
              {stats?.avgConfidence || calculateAvgConf()}%
            </p>
          </div>
          <div className="card text-center py-3">
            <p className="text-dark-400 text-xs">Avg Edge</p>
            <p className={`text-xl font-bold ${(stats?.avgEdge || calculateAvgEdge()) >= 0 ? 'text-blue-400' : 'text-red-400'}`}>
              {(stats?.avgEdge || calculateAvgEdge()) >= 0 ? '+' : ''}{(stats?.avgEdge || calculateAvgEdge()).toFixed(1)}%
            </p>
          </div>
        </div>
      )}

      {/* Loading */}
      {loading && (
        <div className="text-center py-12">
          <div className="inline-block animate-spin text-4xl mb-4">⚽</div>
          <p className="text-dark-400">Analyzing fixtures & evaluating past predictions...</p>
          <p className="text-dark-500 text-sm mt-2">This may take a few seconds</p>
        </div>
      )}

      {/* Error */}
      {error && (
        <div className="card bg-red-900/20 border-red-700/50">
          <p className="text-red-400">{error}</p>
          <button onClick={fetchPredictions} className="btn-primary mt-4">Try Again</button>
        </div>
      )}

      {/* No Data */}
      {!loading && !error && predictions.length === 0 && (
        <div className="card text-center py-12">
          <p className="text-dark-400 mb-2">No fixtures found</p>
          <p className="text-dark-500 text-sm">Check back later</p>
        </div>
      )}

      {/* Predictions */}
      {!loading && !error && predictions.length > 0 && (
        <div className="space-y-8">
          {lowRisk.length > 0 && (
            <section>
              <h2 className="text-xl font-bold mb-4">
                <span className="text-green-400">🛡️</span> Low Risk ({lowRisk.length})
              </h2>
              <p className="text-dark-500 text-sm mb-4">High confidence + positive edge vs bookmaker</p>
              <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-4">
                {lowRisk.map((p, i) => <PredictionCard key={i} prediction={p as any} />)}
              </div>
            </section>
          )}

          {value.length > 0 && (
            <section>
              <h2 className="text-xl font-bold mb-4">
                <span className="text-blue-400">💎</span> Value Bets ({value.length})
              </h2>
              <p className="text-dark-500 text-sm mb-4">Good edge against bookmaker odds</p>
              <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-4">
                {value.map((p, i) => <PredictionCard key={i} prediction={p as any} />)}
              </div>
            </section>
          )}

          {speculative.length > 0 && (
            <section>
              <h2 className="text-xl font-bold mb-4">
                <span className="text-yellow-400">⚡</span> Speculative ({speculative.length})
              </h2>
              <p className="text-dark-500 text-sm mb-4">Lower confidence or marginal edge — proceed with caution</p>
              <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-4">
                {speculative.map((p, i) => <PredictionCard key={i} prediction={p as any} />)}
              </div>
            </section>
          )}
        </div>
      )}
    </div>
  );
}