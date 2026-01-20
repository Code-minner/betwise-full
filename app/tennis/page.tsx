'use client';

import { useState, useEffect } from 'react';
import { Prediction } from '@/lib/types';
import PredictionCard from '@/components/PredictionCard';

export default function TennisPage() {
  const [predictions, setPredictions] = useState<Prediction[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selectedCategory, setSelectedCategory] = useState<'ALL' | 'WINNER' | 'GAMES'>('ALL');
  const [aiEnhanced, setAiEnhanced] = useState(false);
  const [cached, setCached] = useState(false);
  const [stats, setStats] = useState<{
    total: number;
    lowRisk: number;
    value: number;
    speculative: number;
    upsets: number;
    avgConfidence: number;
    avgEdge: number;
  } | null>(null);

  useEffect(() => {
    fetchPredictions();
  }, []);

  async function fetchPredictions() {
    setLoading(true);
    setError(null);

    try {
      const response = await fetch('/api/tennis/analyze');
      const data = await response.json();

      if (data.success) {
        setPredictions(data.predictions);
        setAiEnhanced(data.aiEnhanced || false);
        setCached(data.cached || false);
        setStats(data.stats || null);
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
    if (selectedCategory === 'WINNER' && !p.market.includes('WINNER') && !p.market.includes('UPSET')) return false;
    if (selectedCategory === 'GAMES' && !p.market.includes('GAMES')) return false;
    return true;
  });

  // Group by category (from API) instead of confidence thresholds
  const lowRisk = filteredPredictions.filter(p => p.category === 'LOW_RISK');
  const value = filteredPredictions.filter(p => p.category === 'VALUE');
  const speculative = filteredPredictions.filter(p => p.category === 'SPECULATIVE' || !p.category);
  const upsets = filteredPredictions.filter(p => p.category === 'UPSET');

  // Calculate average edge
  const calculateAvgEdge = () => {
    if (filteredPredictions.length === 0) return 0;
    const totalEdge = filteredPredictions.reduce((a, p) => a + (p.edge || 0), 0);
    return totalEdge / filteredPredictions.length;
  };

  // Calculate average confidence
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
            🎾 Tennis Predictions
            {aiEnhanced && (
              <span className="text-sm bg-purple-600 text-white px-2 py-1 rounded-full flex items-center gap-1">
                🤖 AI Enhanced
              </span>
            )}
          </h1>
          <p className="text-dark-400 mt-1">
            {aiEnhanced 
              ? 'AI-powered ATP/WTA analysis • Click any card for Deep Research'
              : 'Match winners & total games • Click any card for Deep Research'}
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

      {/* Filters */}
      <div className="flex flex-wrap gap-4">
        <div className="flex rounded-lg overflow-hidden border border-dark-600">
          {(['ALL', 'WINNER', 'GAMES'] as const).map((cat) => (
            <button
              key={cat}
              onClick={() => setSelectedCategory(cat)}
              className={`px-4 py-2 text-sm transition-colors ${
                selectedCategory === cat 
                  ? 'bg-primary-600 text-white' 
                  : 'bg-dark-800 text-dark-300 hover:bg-dark-700'
              }`}
            >
              {cat === 'WINNER' ? '🏆 Match Winner' : cat === 'GAMES' ? '📊 Total Games' : '📋 All'}
            </button>
          ))}
        </div>
      </div>

      {/* Stats */}
      {predictions.length > 0 && (
        <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
          <div className="card text-center py-3">
            <p className="text-dark-400 text-xs">Total</p>
            <p className="text-xl font-bold">{filteredPredictions.length}</p>
          </div>
          <div className="card text-center py-3">
            <p className="text-dark-400 text-xs">Low Risk</p>
            <p className="text-xl font-bold text-green-400">{lowRisk.length}</p>
          </div>
          <div className="card text-center py-3">
            <p className="text-dark-400 text-xs">Upsets</p>
            <p className="text-xl font-bold text-orange-400">{upsets.length}</p>
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
          <div className="inline-block animate-spin text-4xl mb-4">🎾</div>
          <p className="text-dark-400">
            {aiEnhanced ? 'AI analyzing matches...' : 'Analyzing matches...'}
          </p>
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
          <p className="text-dark-400 mb-2">No matches found</p>
          <p className="text-dark-500 text-sm">Check back during tournament season</p>
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
              <p className="text-dark-500 text-sm mb-4">High confidence favorites with positive edge</p>
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

          {upsets.length > 0 && (
            <section>
              <h2 className="text-xl font-bold mb-4">
                <span className="text-orange-400">🔥</span> Upset Alerts ({upsets.length})
              </h2>
              <p className="text-dark-500 text-sm mb-4">Higher risk - underdogs with form advantage</p>
              <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-4">
                {upsets.map((p, i) => <PredictionCard key={i} prediction={p as any} />)}
              </div>
            </section>
          )}

          {speculative.length > 0 && (
            <section>
              <h2 className="text-xl font-bold mb-4">
                <span className="text-yellow-400">⚡</span> Speculative ({speculative.length})
              </h2>
              <p className="text-dark-500 text-sm mb-4">Lower confidence or marginal edge - proceed with caution</p>
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