'use client';

import Link from 'next/link';

export default function HomePage() {
  return (
    <div className="space-y-12">
      {/* Hero Section */}
      <section className="text-center py-12">
        <h1 className="text-4xl md:text-5xl font-bold mb-4">
          Smart Sports <span className="text-primary-500">Predictions</span>
        </h1>
        <p className="text-dark-300 text-lg max-w-2xl mx-auto mb-8">
          AI-powered analysis using real statistics from API-Sports. 
          Get data-driven predictions for Football, Basketball & Tennis.
        </p>

        {/* Feature Pills */}
        <div className="flex flex-wrap items-center justify-center gap-3 text-sm mb-8">
          <span className="bg-green-900/30 text-green-400 px-3 py-1 rounded-full border border-green-700/50">
            ✓ Real-time API data
          </span>
          <span className="bg-blue-900/30 text-blue-400 px-3 py-1 rounded-full border border-blue-700/50">
            ✓ Deep AI Research
          </span>
          <span className="bg-yellow-900/30 text-yellow-400 px-3 py-1 rounded-full border border-yellow-700/50">
            ✓ Slip Parser
          </span>
          <span className="bg-purple-900/30 text-purple-400 px-3 py-1 rounded-full border border-purple-700/50">
            ✓ Best Odds Finder
          </span>
        </div>

        {/* Quick Action */}
        <Link href="/analyze" className="btn-primary text-lg px-8 py-3">
          📋 Analyze Your Slip
        </Link>
      </section>

      {/* Sport Cards */}
      <section className="grid md:grid-cols-3 gap-6">
        {/* Football Card */}
        <Link href="/football" className="card-hover group">
          <div className="flex items-start justify-between mb-4">
            <div>
              <h2 className="text-2xl font-bold mb-2 group-hover:text-primary-400 transition-colors">
                ⚽ Football
              </h2>
              <p className="text-dark-400 text-sm">
                Corners, Goals, BTTS
              </p>
            </div>
            <span className="badge-green">Live</span>
          </div>
          
          <div className="space-y-2 text-sm text-dark-300 mb-4">
            <p>• Premier League, La Liga, Serie A</p>
            <p>• Corner over/under predictions</p>
            <p>• 200+ team corner database</p>
          </div>

          <div className="flex items-center text-primary-400 group-hover:text-primary-300 text-sm">
            <span>View Predictions</span>
            <span className="ml-2 group-hover:translate-x-1 transition-transform">→</span>
          </div>
        </Link>

        {/* Basketball Card */}
        <Link href="/basketball" className="card-hover group">
          <div className="flex items-start justify-between mb-4">
            <div>
              <h2 className="text-2xl font-bold mb-2 group-hover:text-primary-400 transition-colors">
                🏀 Basketball
              </h2>
              <p className="text-dark-400 text-sm">
                Totals, Team Points
              </p>
            </div>
            <span className="badge-green">Live</span>
          </div>
          
          <div className="space-y-2 text-sm text-dark-300 mb-4">
            <p>• NBA, Euroleague</p>
            <p>• Game total predictions</p>
            <p>• Team scoring projections</p>
          </div>

          <div className="flex items-center text-primary-400 group-hover:text-primary-300 text-sm">
            <span>View Predictions</span>
            <span className="ml-2 group-hover:translate-x-1 transition-transform">→</span>
          </div>
        </Link>

        {/* Tennis Card */}
        <Link href="/tennis" className="card-hover group">
          <div className="flex items-start justify-between mb-4">
            <div>
              <h2 className="text-2xl font-bold mb-2 group-hover:text-primary-400 transition-colors">
                🎾 Tennis
              </h2>
              <p className="text-dark-400 text-sm">
                Total Games, Surface Analysis
              </p>
            </div>
            <span className="badge-green">Live</span>
          </div>
          
          <div className="space-y-2 text-sm text-dark-300 mb-4">
            <p>• ATP & WTA Tours</p>
            <p>• Surface-specific analysis</p>
            <p>• Ranking-based predictions</p>
          </div>

          <div className="flex items-center text-primary-400 group-hover:text-primary-300 text-sm">
            <span>View Predictions</span>
            <span className="ml-2 group-hover:translate-x-1 transition-transform">→</span>
          </div>
        </Link>
      </section>

      {/* Analyze Slip Section */}
      <section className="card bg-gradient-to-r from-primary-900/20 to-blue-900/20 border-primary-700/30">
        <div className="flex flex-col md:flex-row items-center gap-6">
          <div className="flex-1">
            <h2 className="text-2xl font-bold mb-2">📋 Analyze Your Betting Slip</h2>
            <p className="text-dark-300 mb-4">
              Paste your slip from SportyBet, Bet9ja, BetKing, or 1xBet. 
              Our AI will analyze each selection and identify the weakest link.
            </p>
            <div className="flex flex-wrap gap-2 text-sm">
              <span className="bg-dark-700 px-2 py-1 rounded">SportyBet</span>
              <span className="bg-dark-700 px-2 py-1 rounded">Bet9ja</span>
              <span className="bg-dark-700 px-2 py-1 rounded">BetKing</span>
              <span className="bg-dark-700 px-2 py-1 rounded">1xBet</span>
            </div>
          </div>
          <Link href="/analyze" className="btn-primary whitespace-nowrap">
            Analyze Slip →
          </Link>
        </div>
      </section>

      {/* How It Works */}
      <section className="card">
        <h2 className="text-xl font-bold mb-6">How It Works</h2>
        
        <div className="grid md:grid-cols-4 gap-6">
          <div className="space-y-3">
            <div className="w-10 h-10 bg-primary-900/50 rounded-lg flex items-center justify-center text-primary-400 font-bold">
              1
            </div>
            <h3 className="font-semibold">Real Data</h3>
            <p className="text-dark-400 text-sm">
              Live statistics from API-Sports including form, goals, corners.
            </p>
          </div>
          
          <div className="space-y-3">
            <div className="w-10 h-10 bg-primary-900/50 rounded-lg flex items-center justify-center text-primary-400 font-bold">
              2
            </div>
            <h3 className="font-semibold">Statistical Analysis</h3>
            <p className="text-dark-400 text-sm">
              Poisson distributions calculate expected outcomes.
            </p>
          </div>
          
          <div className="space-y-3">
            <div className="w-10 h-10 bg-primary-900/50 rounded-lg flex items-center justify-center text-primary-400 font-bold">
              3
            </div>
            <h3 className="font-semibold">AI Deep Research</h3>
            <p className="text-dark-400 text-sm">
              3-pass Groq AI analysis for detailed insights.
            </p>
          </div>
          
          <div className="space-y-3">
            <div className="w-10 h-10 bg-primary-900/50 rounded-lg flex items-center justify-center text-primary-400 font-bold">
              4
            </div>
            <h3 className="font-semibold">Best Odds</h3>
            <p className="text-dark-400 text-sm">
              Find the best odds across multiple bookmakers.
            </p>
          </div>
        </div>
      </section>

      {/* Quick Links */}
      <section className="flex flex-wrap items-center justify-center gap-4">
        <Link href="/history" className="btn-secondary">
          📜 View History
        </Link>
        <Link href="/stats" className="btn-secondary">
          📊 Performance Stats
        </Link>
      </section>
    </div>
  );
}
