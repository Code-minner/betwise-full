'use client';

import { useState, useEffect } from 'react';
import { Prediction, Sport } from '@/lib/types';

export default function HistoryPage() {
  const [predictions, setPredictions] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<'ALL' | 'PENDING' | 'WON' | 'LOST'>('ALL');
  const [sportFilter, setSportFilter] = useState<Sport | 'ALL'>('ALL');

  useEffect(() => {
    fetchHistory();
  }, []);

  async function fetchHistory() {
    setLoading(true);
    try {
      const response = await fetch('/api/predictions');
      const data = await response.json();
      if (data.success) {
        setPredictions(data.predictions);
      }
    } catch (e) {
      console.error('Failed to fetch history');
    } finally {
      setLoading(false);
    }
  }

  const filteredPredictions = predictions.filter(p => {
    if (filter === 'PENDING' && p.is_settled) return false;
    if (filter === 'WON' && (!p.is_settled || !p.is_correct)) return false;
    if (filter === 'LOST' && (!p.is_settled || p.is_correct)) return false;
    if (sportFilter !== 'ALL' && p.sport !== sportFilter) return false;
    return true;
  });

  // Stats
  const settled = predictions.filter(p => p.is_settled);
  const won = settled.filter(p => p.is_correct);
  const hitRate = settled.length > 0 ? (won.length / settled.length * 100).toFixed(1) : '0';

  return (
    <div className="space-y-8">
      {/* Header */}
      <div>
        <h1 className="text-3xl font-bold">📜 Prediction History</h1>
        <p className="text-dark-400 mt-1">Track all your predictions and results</p>
      </div>

      {/* Stats Overview */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <div className="card text-center">
          <p className="text-dark-400 text-sm">Total</p>
          <p className="text-2xl font-bold">{predictions.length}</p>
        </div>
        <div className="card text-center">
          <p className="text-dark-400 text-sm">Pending</p>
          <p className="text-2xl font-bold text-yellow-400">
            {predictions.filter(p => !p.is_settled).length}
          </p>
        </div>
        <div className="card text-center">
          <p className="text-dark-400 text-sm">Won</p>
          <p className="text-2xl font-bold text-green-400">{won.length}</p>
        </div>
        <div className="card text-center">
          <p className="text-dark-400 text-sm">Hit Rate</p>
          <p className="text-2xl font-bold text-primary-400">{hitRate}%</p>
        </div>
      </div>

      {/* Filters */}
      <div className="flex flex-wrap gap-4">
        <div className="flex rounded-lg overflow-hidden border border-dark-600">
          {(['ALL', 'PENDING', 'WON', 'LOST'] as const).map((f) => (
            <button
              key={f}
              onClick={() => setFilter(f)}
              className={`px-4 py-2 text-sm transition-colors ${
                filter === f 
                  ? 'bg-primary-600 text-white' 
                  : 'bg-dark-800 text-dark-300 hover:bg-dark-700'
              }`}
            >
              {f}
            </button>
          ))}
        </div>

        <select 
          value={sportFilter} 
          onChange={(e) => setSportFilter(e.target.value as Sport | 'ALL')}
          className="input"
        >
          <option value="ALL">All Sports</option>
          <option value="FOOTBALL">Football</option>
          <option value="BASKETBALL">Basketball</option>
        </select>
      </div>

      {/* Loading */}
      {loading && (
        <div className="text-center py-12">
          <div className="animate-spin text-4xl mb-4">⟳</div>
          <p className="text-dark-400">Loading history...</p>
        </div>
      )}

      {/* Predictions List */}
      {!loading && (
        <div className="space-y-4">
          {filteredPredictions.length === 0 ? (
            <div className="card text-center py-12">
              <p className="text-dark-400">No predictions found</p>
              <p className="text-dark-500 text-sm mt-2">
                Predictions will appear here once you start tracking them
              </p>
            </div>
          ) : (
            filteredPredictions.map((p, i) => (
              <div key={i} className="card flex items-center justify-between">
                <div className="flex-1">
                  <div className="flex items-center gap-3 mb-2">
                    <span className="text-lg">
                      {p.sport === 'FOOTBALL' ? '⚽' : '🏀'}
                    </span>
                    <div>
                      <p className="font-medium">
                        {p.match_info?.homeTeam} vs {p.match_info?.awayTeam}
                      </p>
                      <p className="text-sm text-dark-400">{p.match_info?.league}</p>
                    </div>
                  </div>
                  
                  <div className="flex items-center gap-4 text-sm">
                    <span className="bg-dark-700 px-2 py-1 rounded">{p.pick}</span>
                    <span className="text-dark-400">@ {p.odds?.toFixed(2)}</span>
                    <span className={`${p.confidence >= 70 ? 'text-green-400' : 'text-yellow-400'}`}>
                      {p.confidence}% conf
                    </span>
                  </div>
                </div>

                <div className="text-right">
                  {!p.is_settled ? (
                    <span className="badge-yellow">Pending</span>
                  ) : p.is_correct ? (
                    <span className="badge-green">Won ✓</span>
                  ) : (
                    <span className="badge-red">Lost ✗</span>
                  )}
                  <p className="text-xs text-dark-500 mt-2">
                    {new Date(p.created_at).toLocaleDateString()}
                  </p>
                </div>
              </div>
            ))
          )}
        </div>
      )}
    </div>
  );
}
