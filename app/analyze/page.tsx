'use client';

import { useState } from 'react';
import { Sport } from '@/lib/types';

interface ParsedSelection {
  id: string;
  sport: Sport;
  homeTeam: string;
  awayTeam: string;
  market: string;
  pick: string;
  line?: number;
  odds: number;
}

interface AnalysisResult {
  selection: string;
  verdict: string;
  confidence: number;
  recommendation: string;
  warnings: string[];
  positives: string[];
}

export default function AnalyzePage() {
  const [mode, setMode] = useState<'paste' | 'manual'>('paste');
  const [slipText, setSlipText] = useState('');
  const [bookmaker, setBookmaker] = useState('auto');
  const [selections, setSelections] = useState<ParsedSelection[]>([]);
  const [analysis, setAnalysis] = useState<AnalysisResult[] | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Manual entry state
  const [manualHomeTeam, setManualHomeTeam] = useState('');
  const [manualAwayTeam, setManualAwayTeam] = useState('');
  const [manualSport, setManualSport] = useState<Sport>('FOOTBALL');
  const [manualMarket, setManualMarket] = useState('');
  const [manualOdds, setManualOdds] = useState('');

  async function parseSlip() {
    if (!slipText.trim()) {
      setError('Please paste your betting slip');
      return;
    }

    setLoading(true);
    setError(null);

    try {
      const response = await fetch('/api/parse-slip', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ 
          text: slipText, 
          bookmaker: bookmaker === 'auto' ? undefined : bookmaker 
        }),
      });

      const data = await response.json();

      if (data.success) {
        setSelections(data.selections);
      } else {
        setError(data.error || 'Failed to parse slip');
      }
    } catch (e) {
      setError('Failed to parse slip');
    } finally {
      setLoading(false);
    }
  }

  function addManualSelection() {
    if (!manualHomeTeam || !manualAwayTeam || !manualMarket || !manualOdds) {
      setError('Please fill all fields');
      return;
    }

    const newSelection: ParsedSelection = {
      id: String(Date.now()),
      sport: manualSport,
      homeTeam: manualHomeTeam,
      awayTeam: manualAwayTeam,
      market: manualMarket,
      pick: manualMarket,
      odds: parseFloat(manualOdds),
    };

    setSelections([...selections, newSelection]);
    
    // Clear form
    setManualHomeTeam('');
    setManualAwayTeam('');
    setManualMarket('');
    setManualOdds('');
    setError(null);
  }

  function removeSelection(id: string) {
    setSelections(selections.filter(s => s.id !== id));
  }

  async function analyzeSelections() {
    if (selections.length === 0) {
      setError('Add at least one selection');
      return;
    }

    setLoading(true);
    setError(null);

    try {
      const response = await fetch('/api/analyze-slip', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ selections }),
      });

      const data = await response.json();

      if (data.success) {
        setAnalysis(data.analysis);
      } else {
        setError(data.error || 'Failed to analyze');
      }
    } catch (e) {
      setError('Failed to analyze slip');
    } finally {
      setLoading(false);
    }
  }

  const totalOdds = selections.reduce((acc, s) => acc * s.odds, 1);

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-3xl font-bold">📋 Analyze Slip</h1>
        <p className="text-dark-400 mt-1">
          Paste your betting slip or add selections manually
        </p>
      </div>

      {/* Mode Toggle */}
      <div className="flex rounded-lg overflow-hidden border border-dark-600 w-fit">
        <button
          onClick={() => setMode('paste')}
          className={`px-6 py-2 transition-colors ${
            mode === 'paste' ? 'bg-primary-600 text-white' : 'bg-dark-800 text-dark-300'
          }`}
        >
          📋 Paste Slip
        </button>
        <button
          onClick={() => setMode('manual')}
          className={`px-6 py-2 transition-colors ${
            mode === 'manual' ? 'bg-primary-600 text-white' : 'bg-dark-800 text-dark-300'
          }`}
        >
          ✏️ Manual Entry
        </button>
      </div>

      {/* Paste Mode */}
      {mode === 'paste' && (
        <div className="card space-y-4">
          <div className="flex gap-4">
            <select
              value={bookmaker}
              onChange={(e) => setBookmaker(e.target.value)}
              className="input"
            >
              <option value="auto">Auto-detect Bookmaker</option>
              <option value="SportyBet">SportyBet</option>
              <option value="Bet9ja">Bet9ja</option>
              <option value="BetKing">BetKing</option>
              <option value="1xBet">1xBet</option>
            </select>
          </div>

          <textarea
            value={slipText}
            onChange={(e) => setSlipText(e.target.value)}
            placeholder="Paste your betting slip here...

Example:
Manchester United vs Liverpool
Over 2.5 Goals
@1.85

Chelsea vs Arsenal
BTTS Yes
@1.72"
            className="input w-full h-48 font-mono text-sm"
          />

          <button
            onClick={parseSlip}
            disabled={loading}
            className="btn-primary w-full"
          >
            {loading ? 'Parsing...' : 'Parse Slip'}
          </button>
        </div>
      )}

      {/* Manual Mode */}
      {mode === 'manual' && (
        <div className="card space-y-4">
          <div className="grid md:grid-cols-2 gap-4">
            <input
              type="text"
              value={manualHomeTeam}
              onChange={(e) => setManualHomeTeam(e.target.value)}
              placeholder="Home Team"
              className="input"
            />
            <input
              type="text"
              value={manualAwayTeam}
              onChange={(e) => setManualAwayTeam(e.target.value)}
              placeholder="Away Team"
              className="input"
            />
          </div>

          <div className="grid md:grid-cols-3 gap-4">
            <select
              value={manualSport}
              onChange={(e) => setManualSport(e.target.value as Sport)}
              className="input"
            >
              <option value="FOOTBALL">Football</option>
              <option value="BASKETBALL">Basketball</option>
              <option value="TENNIS">Tennis</option>
            </select>

            <select
              value={manualMarket}
              onChange={(e) => setManualMarket(e.target.value)}
              className="input"
            >
              <option value="">Select Market</option>
              <optgroup label="Goals">
                <option value="Over 1.5 Goals">Over 1.5 Goals</option>
                <option value="Over 2.5 Goals">Over 2.5 Goals</option>
                <option value="Over 3.5 Goals">Over 3.5 Goals</option>
                <option value="Under 2.5 Goals">Under 2.5 Goals</option>
                <option value="Under 3.5 Goals">Under 3.5 Goals</option>
                <option value="BTTS Yes">BTTS Yes</option>
                <option value="BTTS No">BTTS No</option>
              </optgroup>
              <optgroup label="Corners">
                <option value="Over 9.5 Corners">Over 9.5 Corners</option>
                <option value="Over 10.5 Corners">Over 10.5 Corners</option>
                <option value="Under 10.5 Corners">Under 10.5 Corners</option>
              </optgroup>
              <optgroup label="Basketball">
                <option value="Over 210.5 Points">Over 210.5 Points</option>
                <option value="Over 220.5 Points">Over 220.5 Points</option>
                <option value="Under 220.5 Points">Under 220.5 Points</option>
              </optgroup>
              <optgroup label="Tennis">
                <option value="Over 21.5 Games">Over 21.5 Games</option>
                <option value="Over 22.5 Games">Over 22.5 Games</option>
                <option value="Under 22.5 Games">Under 22.5 Games</option>
              </optgroup>
            </select>

            <input
              type="number"
              step="0.01"
              value={manualOdds}
              onChange={(e) => setManualOdds(e.target.value)}
              placeholder="Odds (e.g. 1.85)"
              className="input"
            />
          </div>

          <button
            onClick={addManualSelection}
            className="btn-secondary w-full"
          >
            + Add Selection
          </button>
        </div>
      )}

      {/* Error */}
      {error && (
        <div className="card bg-red-900/20 border-red-700/50">
          <p className="text-red-400">{error}</p>
        </div>
      )}

      {/* Selections List */}
      {selections.length > 0 && (
        <div className="card space-y-4">
          <div className="flex items-center justify-between">
            <h2 className="text-xl font-bold">Your Selections ({selections.length})</h2>
            <div className="text-right">
              <p className="text-sm text-dark-400">Total Odds</p>
              <p className="text-2xl font-bold text-primary-400">{totalOdds.toFixed(2)}</p>
            </div>
          </div>

          <div className="space-y-2">
            {selections.map((s, i) => (
              <div key={s.id} className="flex items-center justify-between bg-dark-900/50 rounded-lg p-3">
                <div className="flex-1">
                  <div className="flex items-center gap-2 mb-1">
                    <span className="text-lg">
                      {s.sport === 'FOOTBALL' ? '⚽' : s.sport === 'BASKETBALL' ? '🏀' : '🎾'}
                    </span>
                    <span className="font-medium">{s.homeTeam} vs {s.awayTeam}</span>
                  </div>
                  <div className="flex items-center gap-3 text-sm">
                    <span className="bg-dark-700 px-2 py-0.5 rounded">{s.pick}</span>
                    <span className="text-dark-400">@ {s.odds.toFixed(2)}</span>
                  </div>
                </div>
                <button
                  onClick={() => removeSelection(s.id)}
                  className="text-red-400 hover:text-red-300 p-2"
                >
                  ✕
                </button>
              </div>
            ))}
          </div>

          <button
            onClick={analyzeSelections}
            disabled={loading}
            className="btn-primary w-full"
          >
            {loading ? 'Analyzing...' : '🔍 Analyze with AI'}
          </button>
        </div>
      )}

      {/* Analysis Results */}
      {analysis && (
        <div className="card space-y-6">
          <h2 className="text-xl font-bold">📊 Analysis Results</h2>

          {analysis.map((result, i) => (
            <div key={i} className="bg-dark-900/50 rounded-lg p-4 space-y-3">
              <div className="flex items-start justify-between">
                <p className="font-medium">{result.selection}</p>
                <span className={`badge ${
                  result.verdict === 'STRONG_BET' ? 'badge-green' :
                  result.verdict === 'GOOD_VALUE' ? 'badge-green' :
                  result.verdict === 'LEAN' ? 'badge-yellow' : 'badge-red'
                }`}>
                  {result.verdict}
                </span>
              </div>

              <div className="flex items-center gap-4 text-sm">
                <span className="text-dark-400">Confidence:</span>
                <span className={`font-bold ${
                  result.confidence >= 70 ? 'text-green-400' :
                  result.confidence >= 50 ? 'text-yellow-400' : 'text-red-400'
                }`}>
                  {result.confidence}%
                </span>
              </div>

              <p className="text-dark-300 text-sm">{result.recommendation}</p>

              {result.positives.length > 0 && (
                <div className="text-sm">
                  {result.positives.map((p, j) => (
                    <p key={j} className="text-green-400">✓ {p}</p>
                  ))}
                </div>
              )}

              {result.warnings.length > 0 && (
                <div className="text-sm">
                  {result.warnings.map((w, j) => (
                    <p key={j} className="text-yellow-400">⚠ {w}</p>
                  ))}
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
