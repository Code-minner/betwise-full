'use client';

import { useState, useEffect } from 'react';
import { Prediction, BASKETBALL_LEAGUES } from '@/lib/types';
import PredictionCard from '@/components/PredictionCard';

export default function BasketballPage() {
  const [predictions, setPredictions] = useState<Prediction[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selectedLeague, setSelectedLeague] = useState<number | null>(null);
  const [aiEnhanced, setAiEnhanced] = useState(false);
  const [cached, setCached] = useState(false);

  useEffect(() => {
    fetchPredictions();
  }, []);

  async function fetchPredictions() {
    setLoading(true);
    setError(null);

    try {
      const response = await fetch('/api/basketball/analyze');
      const data = await response.json();

      if (data.success) {
        setPredictions(data.predictions);
        setAiEnhanced(data.aiEnhanced || false);
        setCached(data.cached || false);
      } else {
        setError(data.error || 'Failed to fetch predictions');
      }
    } catch (e) {
      setError('Failed to connect to server');
    } finally {
      setLoading(false);
    }
  }

  const filteredPredictions = predictions.filter(p => {
    if (selectedLeague) {
      const leagueName = BASKETBALL_LEAGUES.find(l => l.id === selectedLeague)?.name;
      if (p.matchInfo?.league !== leagueName) return false;
    }
    return true;
  });

  const bankers = filteredPredictions.filter(p => p.confidence >= 70);
  const value = filteredPredictions.filter(p => p.confidence >= 50 && p.confidence < 70);
  const risky = filteredPredictions.filter(p => p.confidence < 50);

  // Calculate average edge correctly
  const calculateAvgEdge = () => {
    if (filteredPredictions.length === 0) return 0;
    const totalEdge = filteredPredictions.reduce((a, p) => {
      const edge = p.edge || 0;
      return a + (Math.abs(edge) > 1 ? edge : edge * 100);
    }, 0);
    return totalEdge / filteredPredictions.length;
  };

  return (
    <div className="space-y-8">
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold flex items-center gap-3">
            🏀 Basketball Predictions
            {aiEnhanced && (
              <span className="text-sm bg-purple-600 text-white px-2 py-1 rounded-full flex items-center gap-1">
                🤖 AI Enhanced
              </span>
            )}
          </h1>
          <p className="text-dark-400 mt-1">
            {aiEnhanced 
              ? 'AI-powered NBA analysis • Click any card for Deep Research'
              : 'Total points analysis • Click any card for Deep Research'}
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
      <div className="flex gap-4">
        <select 
          value={selectedLeague || ''} 
          onChange={(e) => setSelectedLeague(e.target.value ? Number(e.target.value) : null)}
          className="input"
        >
          <option value="">All Leagues</option>
          {BASKETBALL_LEAGUES.map(league => (
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
            <p className="text-dark-400 text-xs">Bankers</p>
            <p className="text-xl font-bold text-green-400">{bankers.length}</p>
          </div>
          <div className="card text-center py-3">
            <p className="text-dark-400 text-xs">Avg Conf</p>
            <p className="text-xl font-bold text-primary-400">
              {filteredPredictions.length > 0 
                ? Math.round(filteredPredictions.reduce((a, p) => a + p.confidence, 0) / filteredPredictions.length)
                : 0}%
            </p>
          </div>
          <div className="card text-center py-3">
            <p className="text-dark-400 text-xs">Avg Edge</p>
            <p className="text-xl font-bold text-blue-400">
              +{calculateAvgEdge().toFixed(1)}%
            </p>
          </div>
        </div>
      )}

      {/* Loading */}
      {loading && (
        <div className="text-center py-12">
          <div className="inline-block animate-spin text-4xl mb-4">🏀</div>
          <p className="text-dark-400">
            {aiEnhanced ? 'AI analyzing games...' : 'Analyzing games...'}
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
          <p className="text-dark-400 mb-2">No games found</p>
          <p className="text-dark-500 text-sm">NBA games typically start in the evening (US time)</p>
        </div>
      )}

      {/* Predictions */}
      {!loading && !error && predictions.length > 0 && (
        <div className="space-y-8">
          {bankers.length > 0 && (
            <section>
              <h2 className="text-xl font-bold mb-4">
                <span className="text-green-400">🔒</span> Bankers ({bankers.length})
              </h2>
              <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-4">
                {bankers.map((p, i) => <PredictionCard key={i} prediction={p as any} />)}
              </div>
            </section>
          )}

          {value.length > 0 && (
            <section>
              <h2 className="text-xl font-bold mb-4">
                <span className="text-yellow-400">💰</span> Value ({value.length})
              </h2>
              <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-4">
                {value.map((p, i) => <PredictionCard key={i} prediction={p as any} />)}
              </div>
            </section>
          )}

          {risky.length > 0 && (
            <section>
              <h2 className="text-xl font-bold mb-4">
                <span className="text-red-400">⚡</span> Risky ({risky.length})
              </h2>
              <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-4">
                {risky.map((p, i) => <PredictionCard key={i} prediction={p as any} />)}
              </div>
            </section>
          )}
        </div>
      )}
    </div>
  );
}