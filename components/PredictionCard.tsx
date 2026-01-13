// =============================================================
// FILE: components/PredictionCard.tsx
// =============================================================

'use client';

import { useState } from 'react';
import { Sport } from '@/lib/types';
import DeepResearchModal from './DeepResearchModal';

// Flexible prediction type
interface FlexiblePrediction {
  pick: string;
  odds: number;
  confidence: number;
  probability?: number;
  calculatedProbability?: number;
  edge: number;
  risk?: 'LOW' | 'MEDIUM' | 'HIGH' | 'VERY_HIGH';
  riskLevel?: 'LOW' | 'MEDIUM' | 'HIGH' | 'VERY_HIGH';
  valueRating?: string;
  market?: string;
  line?: number;
  sport?: Sport | string;
  reasoning?: string[];
  warnings?: string[];
  positives?: string[];
  // AI Enhancement fields
  aiInsight?: string | null;
  aiEnhanced?: boolean;
  aiConfidenceAdjust?: number;
  // Bookmaker odds comparison
  oddsComparison?: {
    bookmakerOdds: number;
    bookmakerLine?: number;
    bookmaker: string;
    edge: number;
    value: 'STRONG' | 'GOOD' | 'FAIR' | 'POOR';
  };
  bookmakerOdds?: any;
  matchInfo?: {
    homeTeam: string;
    awayTeam: string;
    league: string;
    kickoff?: string | Date;
  };
  fixture?: {
    homeTeam: { name: string };
    awayTeam: { name: string };
    league: { name: string };
    kickoff?: Date;
    tipoff?: Date;
  };
}

interface PredictionCardProps {
  prediction: FlexiblePrediction;
  showDeepResearch?: boolean;
}

export default function PredictionCard({ prediction, showDeepResearch = true }: PredictionCardProps) {
  const [showResearch, setShowResearch] = useState(false);

  const confidenceColor = 
    prediction.confidence >= 70 ? 'text-green-400' :
    prediction.confidence >= 50 ? 'text-yellow-400' : 'text-red-400';
  
  const riskLevel = prediction.riskLevel || prediction.risk || 'MEDIUM';
  const riskBadge = 
    riskLevel === 'LOW' ? 'badge-green' :
    riskLevel === 'MEDIUM' ? 'badge-yellow' :
    riskLevel === 'HIGH' ? 'badge-red' : 
    riskLevel === 'VERY_HIGH' ? 'badge-red' : 'badge-red';

  // Edge calculation
  const rawEdge = prediction.edge || 0;
  const edgePercent = Math.abs(rawEdge) > 1 ? rawEdge : rawEdge * 100;
  
  // Probability
  const rawProb = prediction.calculatedProbability || prediction.probability || 0;
  const probPercent = rawProb > 1 ? rawProb : rawProb * 100;

  // Value rating from odds comparison or edge
  const valueRating = prediction.oddsComparison?.value || prediction.valueRating || (
    edgePercent >= 10 ? 'STRONG_BET' :
    edgePercent >= 5 ? 'GOOD_VALUE' :
    edgePercent >= 0 ? 'FAIR' : 'AVOID'
  );

  const valueBadge =
    valueRating === 'STRONG' || valueRating === 'STRONG_BET' ? 'text-green-400' :
    valueRating === 'GOOD' || valueRating === 'GOOD_VALUE' ? 'text-green-300' :
    valueRating === 'FAIR' ? 'text-yellow-400' : 'text-red-400';

  // Match info
  const homeTeam = prediction.matchInfo?.homeTeam || prediction.fixture?.homeTeam?.name || 'Home';
  const awayTeam = prediction.matchInfo?.awayTeam || prediction.fixture?.awayTeam?.name || 'Away';
  const league = prediction.matchInfo?.league || prediction.fixture?.league?.name || 'League';
  const kickoff = prediction.matchInfo?.kickoff || prediction.fixture?.kickoff || prediction.fixture?.tipoff;

  const sport: Sport = (prediction.sport as Sport) || 'FOOTBALL';

  // Check if we have bookmaker odds
  const hasBookmakerOdds = prediction.oddsComparison?.bookmakerOdds;

  return (
    <>
      <div className="card-hover group relative">
        {/* AI Badge */}
        {prediction.aiEnhanced && (
          <div className="absolute -top-2 -right-2 bg-purple-600 text-white text-xs px-2 py-0.5 rounded-full flex items-center gap-1 shadow-lg">
            <span>🤖</span> AI
          </div>
        )}

        {/* Match Header */}
        <div className="flex items-start justify-between mb-3">
          <div className="flex-1">
            <p className="text-sm text-dark-400 mb-1">{league}</p>
            <p className="font-medium">{homeTeam} vs {awayTeam}</p>
            <p className="text-xs text-dark-500 mt-1">
              {kickoff ? new Date(kickoff).toLocaleString() : ''}
            </p>
          </div>
          <span className={riskBadge}>{riskLevel}</span>
        </div>

        {/* AI Insight */}
        {prediction.aiInsight && (
          <div className="bg-purple-900/30 border border-purple-500/30 rounded-lg p-2 mb-3">
            <p className="text-xs text-purple-300 flex items-start gap-2">
              <span className="text-purple-400">🤖</span>
              <span>{prediction.aiInsight}</span>
            </p>
          </div>
        )}

        {/* Pick */}
        <div className="bg-dark-900/50 rounded-lg p-3 mb-3">
          <p className="font-semibold text-lg">{prediction.pick}</p>
          <div className="flex items-center gap-4 mt-2 text-sm">
            <span className="text-dark-400">
              Odds: <span className="text-white font-medium">{(prediction.odds || 1.5).toFixed(2)}</span>
            </span>
            <span className={valueBadge}>
              {(valueRating || 'FAIR').replace(/_/g, ' ')}
            </span>
          </div>
        </div>

        {/* Bookmaker Odds Comparison */}
        {hasBookmakerOdds && (
          <div className="bg-blue-900/20 border border-blue-500/30 rounded-lg p-2 mb-3">
            <div className="flex items-center justify-between text-xs">
              <span className="text-blue-400">📊 Best Bookmaker Odds</span>
              <span className="text-white font-medium">
                {prediction.oddsComparison!.bookmakerOdds.toFixed(2)}
                <span className="text-dark-400 ml-1">@ {prediction.oddsComparison!.bookmaker}</span>
              </span>
            </div>
            {prediction.oddsComparison!.bookmakerLine && (
              <p className="text-xs text-dark-400 mt-1">
                Line: {prediction.oddsComparison!.bookmakerLine}
              </p>
            )}
            <div className="flex items-center justify-between mt-1">
              <span className="text-xs text-dark-400">Value Edge:</span>
              <span className={`text-xs font-medium ${
                prediction.oddsComparison!.edge >= 5 ? 'text-green-400' :
                prediction.oddsComparison!.edge >= 0 ? 'text-yellow-400' : 'text-red-400'
              }`}>
                {prediction.oddsComparison!.edge >= 0 ? '+' : ''}{prediction.oddsComparison!.edge}%
              </span>
            </div>
          </div>
        )}

        {/* Stats Grid */}
        <div className="grid grid-cols-3 gap-3 text-center text-sm mb-3">
          <div>
            <p className="text-dark-400">Confidence</p>
            <p className={`font-bold text-lg ${confidenceColor}`}>{prediction.confidence || 0}%</p>
          </div>
          <div>
            <p className="text-dark-400">Probability</p>
            <p className="font-bold text-lg">{probPercent.toFixed(0)}%</p>
          </div>
          <div>
            <p className="text-dark-400">Edge</p>
            <p className={`font-bold text-lg ${edgePercent >= 0 ? 'text-green-400' : 'text-red-400'}`}>
              {edgePercent >= 0 ? '+' : ''}{edgePercent.toFixed(1)}%
            </p>
          </div>
        </div>

        {/* Reasoning */}
        {((prediction.reasoning?.length || 0) > 0 || (prediction.warnings?.length || 0) > 0 || (prediction.positives?.length || 0) > 0) && (
          <div className="mb-3 text-sm space-y-1">
            {(prediction.positives || []).slice(0, 2).map((p, i) => (
              <p key={i} className="text-green-400 text-xs">✓ {p}</p>
            ))}
            {(prediction.reasoning || []).slice(0, 2).map((r, i) => (
              <p key={`r-${i}`} className="text-blue-400 text-xs">• {r}</p>
            ))}
            {(prediction.warnings || []).slice(0, 2).map((w, i) => (
              <p key={`w-${i}`} className="text-yellow-400 text-xs">⚠ {w}</p>
            ))}
          </div>
        )}

        {/* Deep Research Button */}
        {showDeepResearch && (
          <button
            onClick={() => setShowResearch(true)}
            className="w-full mt-2 py-2 text-sm bg-gradient-to-r from-purple-600 to-blue-600 hover:from-purple-500 hover:to-blue-500 rounded-lg transition-all flex items-center justify-center gap-2 font-medium"
          >
            <span>🔬</span>
            Deep Research
          </button>
        )}
      </div>

      {/* Deep Research Modal */}
      {showResearch && (
        <DeepResearchModal
          isOpen={showResearch}
          onClose={() => setShowResearch(false)}
          sport={sport}
          homeTeam={homeTeam}
          awayTeam={awayTeam}
          league={league}
          market={prediction.market || ''}
          line={prediction.line}
        />
      )}
    </>
  );
}