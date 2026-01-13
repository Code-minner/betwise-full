// =============================================================
// FILE: app/stats/page.tsx
// =============================================================

'use client';

import { useState, useEffect } from 'react';

interface Stats {
  total: number;
  wins: number;
  losses: number;
  winRate: number;
  roi: number;
  profit: number;
  avgOdds: number;
  avgConfidence: number;
}

interface Analysis {
  id: number;
  home_team: string;
  away_team: string;
  market: string;
  selection: string;
  odds: number;
  confidence: number;
  won: boolean | null;
  actual_result: string | null;
  analyzed_at: string;
}

interface ApiUsage {
  api_name: string;
  total_requests: number;
  daily_limit: number;
}

export default function StatsPage() {
  const [stats, setStats] = useState<Stats | null>(null);
  const [recentAnalyses, setRecentAnalyses] = useState<Analysis[]>([]);
  const [apiUsage, setApiUsage] = useState<ApiUsage[]>([]);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<'overview' | 'history' | 'pending'>('overview');

  useEffect(() => {
    fetchData();
  }, []);

  async function fetchData() {
    setLoading(true);
    try {
      const [statsRes, recentRes] = await Promise.all([
        fetch('/api/stats?type=overview'),
        fetch('/api/stats?type=recent&limit=30'),
      ]);

      const statsData = await statsRes.json();
      const recentData = await recentRes.json();

      if (statsData.success) {
        setStats(statsData.stats);
        setApiUsage(statsData.apiUsage || []);
      }

      if (recentData.success) {
        setRecentAnalyses(recentData.analyses || []);
      }
    } catch (error) {
      console.error('Failed to fetch stats:', error);
    } finally {
      setLoading(false);
    }
  }

  async function markResult(id: number, won: boolean) {
    const result = won ? 'WIN' : 'LOSS';
    await fetch('/api/stats', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id, result, won }),
    });
    fetchData();
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[400px]">
        <div className="animate-spin text-4xl">📊</div>
      </div>
    );
  }

  return (
    <div className="space-y-8">
      {/* Header */}
      <div className="flex justify-between items-center">
        <div>
          <h1 className="text-3xl font-bold">📊 Performance Stats</h1>
          <p className="text-dark-400 mt-1">Track your prediction accuracy and ROI</p>
        </div>
        <button onClick={fetchData} className="btn-primary">
          ↻ Refresh
        </button>
      </div>

      {/* Stats Overview */}
      {stats && (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <div className="card text-center py-4">
            <p className="text-dark-400 text-xs mb-1">Total Predictions</p>
            <p className="text-3xl font-bold">{stats.total}</p>
          </div>
          <div className="card text-center py-4">
            <p className="text-dark-400 text-xs mb-1">Win Rate</p>
            <p className={`text-3xl font-bold ${stats.winRate >= 55 ? 'text-green-400' : stats.winRate >= 45 ? 'text-yellow-400' : 'text-red-400'}`}>
              {stats.winRate}%
            </p>
            <p className="text-xs text-dark-500">{stats.wins}W - {stats.losses}L</p>
          </div>
          <div className="card text-center py-4">
            <p className="text-dark-400 text-xs mb-1">ROI</p>
            <p className={`text-3xl font-bold ${stats.roi >= 0 ? 'text-green-400' : 'text-red-400'}`}>
              {stats.roi >= 0 ? '+' : ''}{stats.roi}%
            </p>
          </div>
          <div className="card text-center py-4">
            <p className="text-dark-400 text-xs mb-1">Profit (Units)</p>
            <p className={`text-3xl font-bold ${stats.profit >= 0 ? 'text-green-400' : 'text-red-400'}`}>
              {stats.profit >= 0 ? '+' : ''}{stats.profit}
            </p>
          </div>
        </div>
      )}

      {/* Secondary Stats */}
      {stats && stats.total > 0 && (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <div className="card bg-dark-800/50 text-center py-3">
            <p className="text-dark-400 text-xs">Avg Odds</p>
            <p className="text-xl font-semibold">{stats.avgOdds}</p>
          </div>
          <div className="card bg-dark-800/50 text-center py-3">
            <p className="text-dark-400 text-xs">Avg Confidence</p>
            <p className="text-xl font-semibold">{stats.avgConfidence}%</p>
          </div>
          <div className="card bg-dark-800/50 text-center py-3">
            <p className="text-dark-400 text-xs">Strike Rate</p>
            <p className="text-xl font-semibold">
              {stats.total > 0 ? ((stats.wins / stats.total) * 100).toFixed(0) : 0}%
            </p>
          </div>
          <div className="card bg-dark-800/50 text-center py-3">
            <p className="text-dark-400 text-xs">Yield</p>
            <p className="text-xl font-semibold">
              {stats.total > 0 ? (stats.profit / stats.total).toFixed(2) : 0}
            </p>
          </div>
        </div>
      )}

      {/* API Usage */}
      {apiUsage.length > 0 && (
        <div className="card">
          <h3 className="font-semibold mb-3">📡 API Usage Today</h3>
          <div className="space-y-2">
            {apiUsage.map((api, i) => (
              <div key={i} className="flex items-center gap-3">
                <span className="text-sm text-dark-400 w-32">{api.api_name}</span>
                <div className="flex-1 bg-dark-700 rounded-full h-2">
                  <div 
                    className={`h-2 rounded-full ${
                      (api.total_requests / api.daily_limit) > 0.8 ? 'bg-red-500' :
                      (api.total_requests / api.daily_limit) > 0.5 ? 'bg-yellow-500' : 'bg-green-500'
                    }`}
                    style={{ width: `${Math.min(100, (api.total_requests / api.daily_limit) * 100)}%` }}
                  />
                </div>
                <span className="text-sm">
                  {api.total_requests}/{api.daily_limit}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Tabs */}
      <div className="flex gap-2 border-b border-dark-700 pb-2">
        {(['overview', 'history', 'pending'] as const).map(tab => (
          <button
            key={tab}
            onClick={() => setActiveTab(tab)}
            className={`px-4 py-2 rounded-t-lg transition-colors ${
              activeTab === tab 
                ? 'bg-primary-600 text-white' 
                : 'text-dark-400 hover:text-white'
            }`}
          >
            {tab.charAt(0).toUpperCase() + tab.slice(1)}
          </button>
        ))}
      </div>

      {/* Recent Analyses Table */}
      {activeTab === 'history' && (
        <div className="card overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-dark-400 border-b border-dark-700">
                <th className="pb-3">Match</th>
                <th className="pb-3">Pick</th>
                <th className="pb-3">Odds</th>
                <th className="pb-3">Conf</th>
                <th className="pb-3">Result</th>
                <th className="pb-3">Actions</th>
              </tr>
            </thead>
            <tbody>
              {recentAnalyses.map((a) => (
                <tr key={a.id} className="border-b border-dark-800">
                  <td className="py-3">
                    <p className="font-medium">{a.home_team} vs {a.away_team}</p>
                    <p className="text-xs text-dark-500">
                      {new Date(a.analyzed_at).toLocaleDateString()}
                    </p>
                  </td>
                  <td className="py-3">{a.selection}</td>
                  <td className="py-3">{a.odds?.toFixed(2)}</td>
                  <td className="py-3">{a.confidence}%</td>
                  <td className="py-3">
                    {a.won === true && <span className="badge-green">WIN</span>}
                    {a.won === false && <span className="badge-red">LOSS</span>}
                    {a.won === null && <span className="badge-yellow">Pending</span>}
                  </td>
                  <td className="py-3">
                    {a.won === null && (
                      <div className="flex gap-1">
                        <button 
                          onClick={() => markResult(a.id, true)}
                          className="px-2 py-1 text-xs bg-green-600 rounded hover:bg-green-500"
                        >
                          ✓ Win
                        </button>
                        <button 
                          onClick={() => markResult(a.id, false)}
                          className="px-2 py-1 text-xs bg-red-600 rounded hover:bg-red-500"
                        >
                          ✗ Loss
                        </button>
                      </div>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          
          {recentAnalyses.length === 0 && (
            <p className="text-center text-dark-400 py-8">
              No predictions tracked yet. Start analyzing matches!
            </p>
          )}
        </div>
      )}

      {/* Empty State */}
      {stats?.total === 0 && activeTab === 'overview' && (
        <div className="card text-center py-12">
          <p className="text-4xl mb-4">📈</p>
          <p className="text-dark-400 mb-2">No predictions tracked yet</p>
          <p className="text-dark-500 text-sm">
            Predictions will be saved automatically when you analyze matches
          </p>
        </div>
      )}
    </div>
  );
}