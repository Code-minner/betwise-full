// =============================================================
// FILE: components/PredictionCard.tsx (FIXED)
// =============================================================
// 
// FIXES APPLIED:
// ✅ "BANKER" → "LOW RISK" / "HIGH CONFIDENCE"
// ✅ Proper edge display (can be negative)
// ✅ Clear separation of Confidence vs Probability
// ✅ Warning display for low data quality
// ✅ NO BET indicators

'use client';

import { useState } from 'react';
import { Sport } from '@/lib/types';
import DeepResearchModal from './DeepResearchModal';

// Flexible prediction type
interface FlexiblePrediction {
  pick: string;
  odds?: number;
  confidence: number;
  probability?: number;
  calculatedProbability?: number;
  impliedProbability?: number;
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
  category?: string;
  dataQuality?: string;
  modelAgreement?: number;
  
  // AI Enhancement fields (narrative only, no number changes)
  aiInsight?: string | null;
  aiEnhanced?: boolean;
  
  // Bookmaker odds comparison
  oddsComparison?: {
    bookmakerOdds: number;
    bookmakerLine?: number;
    bookmaker: string;
    edge: number;
    value: 'STRONG' | 'GOOD' | 'FAIR' | 'POOR';
  };
  bookmakerOdds?: number;
  bookmaker?: string;
  
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

// ============== LABEL MAPPINGS ==============

const CATEGORY_LABELS: Record<string, { label: string; color: string; icon: string }> = {
  LOW_RISK: { label: 'LOW RISK', color: 'bg-green-500/20 text-green-400 border-green-500/30', icon: '🛡️' },
  VALUE: { label: 'VALUE BET', color: 'bg-blue-500/20 text-blue-400 border-blue-500/30', icon: '💎' },
  SPECULATIVE: { label: 'SPECULATIVE', color: 'bg-yellow-500/20 text-yellow-400 border-yellow-500/30', icon: '⚡' },
  NO_BET: { label: 'NO BET', color: 'bg-red-500/20 text-red-400 border-red-500/30', icon: '🚫' },
  // Legacy mappings
  BANKER: { label: 'LOW RISK', color: 'bg-green-500/20 text-green-400 border-green-500/30', icon: '🛡️' },
  CORNERS: { label: 'CORNERS', color: 'bg-purple-500/20 text-purple-400 border-purple-500/30', icon: '🔄' },
  GOALS: { label: 'GOALS', color: 'bg-orange-500/20 text-orange-400 border-orange-500/30', icon: '⚽' },
  TOTALS: { label: 'TOTALS', color: 'bg-cyan-500/20 text-cyan-400 border-cyan-500/30', icon: '📊' },
  SPREAD: { label: 'SPREAD', color: 'bg-indigo-500/20 text-indigo-400 border-indigo-500/30', icon: '📏' },
  UPSET: { label: 'UPSET', color: 'bg-red-500/20 text-red-400 border-red-500/30', icon: '🎲' },
};

const DATA_QUALITY_LABELS: Record<string, { label: string; color: string }> = {
  HIGH: { label: 'High Quality Data', color: 'text-green-400' },
  MEDIUM: { label: 'Estimated Data', color: 'text-yellow-400' },
  LOW: { label: 'Limited Data', color: 'text-orange-400' },
  FALLBACK: { label: 'League Averages Only', color: 'text-red-400' },
  NO_DATA: { label: 'No Data', color: 'text-red-400' },
};

export default function PredictionCard({ prediction, showDeepResearch = true }: PredictionCardProps) {
  const [showResearch, setShowResearch] = useState(false);
  const [expanded, setExpanded] = useState(false);

  // ============== EXTRACT VALUES ==============
  
  // Confidence (how reliable our probability is)
  const confidence = prediction.confidence || 0;
  const confidenceColor = 
    confidence >= 70 ? 'text-green-400' :
    confidence >= 55 ? 'text-yellow-400' :
    confidence >= 40 ? 'text-orange-400' : 'text-red-400';
  
  // Probability (our calculated chance of the event)
  const rawProb = prediction.probability || prediction.calculatedProbability || 0;
  const probPercent = rawProb > 1 ? rawProb : rawProb * 100;
  
  // Edge (value vs bookmaker)
  const edge = prediction.edge || 0;
  const edgeColor = 
    edge >= 8 ? 'text-green-400' :
    edge >= 3 ? 'text-green-300' :
    edge >= 0 ? 'text-yellow-400' : 'text-red-400';
  
  // Risk level
  const riskLevel = prediction.riskLevel || prediction.risk || 'MEDIUM';
  const riskColors: Record<string, string> = {
    LOW: 'bg-green-500/20 text-green-400 border border-green-500/30',
    MEDIUM: 'bg-yellow-500/20 text-yellow-400 border border-yellow-500/30',
    HIGH: 'bg-red-500/20 text-red-400 border border-red-500/30',
    VERY_HIGH: 'bg-red-600/30 text-red-300 border border-red-500/40',
  };
  
  // Category
  const category = prediction.category || 'VALUE';
  const categoryInfo = CATEGORY_LABELS[category] || CATEGORY_LABELS.VALUE;
  
  // Data quality
  const dataQuality = prediction.dataQuality || 'MEDIUM';
  const dataQualityInfo = DATA_QUALITY_LABELS[dataQuality] || DATA_QUALITY_LABELS.MEDIUM;

  // Match info
  const homeTeam = prediction.matchInfo?.homeTeam || prediction.fixture?.homeTeam?.name || 'Home';
  const awayTeam = prediction.matchInfo?.awayTeam || prediction.fixture?.awayTeam?.name || 'Away';
  const league = prediction.matchInfo?.league || prediction.fixture?.league?.name || 'League';
  const kickoff = prediction.matchInfo?.kickoff || prediction.fixture?.kickoff || prediction.fixture?.tipoff;

  const sport: Sport = (prediction.sport as Sport) || 'FOOTBALL';

  // Bookmaker odds
  const hasBookmakerOdds = prediction.oddsComparison?.bookmakerOdds || prediction.bookmakerOdds;
  const bookOdds = prediction.oddsComparison?.bookmakerOdds || prediction.bookmakerOdds;
  const bookmaker = prediction.oddsComparison?.bookmaker || prediction.bookmaker || 'Best';

  return (
    <>
      <div className="card-hover group relative overflow-hidden">
        {/* Category Badge */}
        <div className={`absolute top-0 left-0 px-2 py-1 text-xs font-medium rounded-br-lg ${categoryInfo.color}`}>
          {categoryInfo.icon} {categoryInfo.label}
        </div>

        {/* AI Badge */}
        {prediction.aiEnhanced && (
          <div className="absolute top-0 right-0 bg-purple-600/90 text-white text-xs px-2 py-1 rounded-bl-lg flex items-center gap-1">
            <span>🤖</span> AI
          </div>
        )}

        {/* Match Header */}
        <div className="mt-6 mb-3">
          <p className="text-sm text-dark-400 mb-1">{league}</p>
          <p className="font-medium text-lg">{homeTeam} vs {awayTeam}</p>
          {kickoff && (
            <p className="text-xs text-dark-500 mt-1">
              {new Date(kickoff).toLocaleString('en-US', {
                weekday: 'short',
                month: 'short',
                day: 'numeric',
                hour: '2-digit',
                minute: '2-digit',
              })}
            </p>
          )}
        </div>

        {/* Data Quality Warning */}
        {(dataQuality === 'LOW' || dataQuality === 'FALLBACK') && (
          <div className="bg-orange-900/20 border border-orange-500/30 rounded-lg p-2 mb-3">
            <p className="text-xs text-orange-400 flex items-center gap-2">
              <span>⚠️</span>
              <span>{dataQualityInfo.label} - Lower reliability</span>
            </p>
          </div>
        )}

        {/* AI Insight */}
        {prediction.aiInsight && (
          <div className="bg-purple-900/30 border border-purple-500/30 rounded-lg p-2 mb-3">
            <p className="text-xs text-purple-300 flex items-start gap-2">
              <span className="text-purple-400 shrink-0">🤖</span>
              <span>{prediction.aiInsight}</span>
            </p>
          </div>
        )}

        {/* Pick */}
        <div className="bg-dark-900/50 rounded-lg p-3 mb-3">
          <p className="font-semibold text-lg">{prediction.pick}</p>
          
          {/* Bookmaker Odds */}
          {hasBookmakerOdds && (
            <div className="flex items-center justify-between mt-2 text-sm">
              <span className="text-dark-400">
                Best Odds: <span className="text-white font-medium">{Number(bookOdds).toFixed(2)}</span>
              </span>
              <span className="text-dark-500 text-xs">@ {bookmaker}</span>
            </div>
          )}
        </div>

        {/* Stats Grid - CLEAR SEPARATION */}
        <div className="grid grid-cols-3 gap-2 text-center text-sm mb-3">
          <div className="bg-dark-800/50 rounded-lg p-2">
            <p className="text-dark-400 text-xs mb-1">Confidence</p>
            <p className={`font-bold text-lg ${confidenceColor}`}>{confidence}%</p>
            <p className="text-dark-500 text-[10px]">Reliability</p>
          </div>
          <div className="bg-dark-800/50 rounded-lg p-2">
            <p className="text-dark-400 text-xs mb-1">Probability</p>
            <p className="font-bold text-lg">{probPercent.toFixed(0)}%</p>
            <p className="text-dark-500 text-[10px]">Our Model</p>
          </div>
          <div className="bg-dark-800/50 rounded-lg p-2">
            <p className="text-dark-400 text-xs mb-1">Edge</p>
            <p className={`font-bold text-lg ${edgeColor}`}>
              {edge >= 0 ? '+' : ''}{edge.toFixed(1)}%
            </p>
            <p className="text-dark-500 text-[10px]">vs Book</p>
          </div>
        </div>

        {/* Value Assessment (if we have bookmaker odds) */}
        {prediction.oddsComparison && (
          <div className={`rounded-lg p-2 mb-3 border ${
            prediction.oddsComparison.value === 'STRONG' ? 'bg-green-900/20 border-green-500/30' :
            prediction.oddsComparison.value === 'GOOD' ? 'bg-green-900/10 border-green-500/20' :
            prediction.oddsComparison.value === 'FAIR' ? 'bg-yellow-900/20 border-yellow-500/30' :
            'bg-red-900/20 border-red-500/30'
          }`}>
            <div className="flex items-center justify-between text-xs">
              <span className="text-dark-400">Value Assessment:</span>
              <span className={`font-medium ${
                prediction.oddsComparison.value === 'STRONG' ? 'text-green-400' :
                prediction.oddsComparison.value === 'GOOD' ? 'text-green-300' :
                prediction.oddsComparison.value === 'FAIR' ? 'text-yellow-400' :
                'text-red-400'
              }`}>
                {prediction.oddsComparison.value === 'STRONG' ? '🔥 STRONG VALUE' :
                 prediction.oddsComparison.value === 'GOOD' ? '✅ GOOD VALUE' :
                 prediction.oddsComparison.value === 'FAIR' ? '➖ FAIR' :
                 '⚠️ POOR VALUE'}
              </span>
            </div>
            {prediction.impliedProbability && (
              <p className="text-dark-500 text-[10px] mt-1">
                Bookmaker implied: {(prediction.impliedProbability * 100).toFixed(0)}% | 
                Our model: {probPercent.toFixed(0)}%
              </p>
            )}
          </div>
        )}

        {/* Risk Badge */}
        <div className="flex items-center justify-between mb-3">
          <span className="text-dark-400 text-xs">Risk Level:</span>
          <span className={`text-xs px-2 py-1 rounded-full ${riskColors[riskLevel]}`}>
            {riskLevel}
          </span>
        </div>

        {/* Expandable Reasoning */}
        {((prediction.reasoning?.length || 0) > 0 || (prediction.warnings?.length || 0) > 0) && (
          <div className="mb-3">
            <button 
              onClick={() => setExpanded(!expanded)}
              className="text-xs text-dark-400 hover:text-dark-300 flex items-center gap-1"
            >
              {expanded ? '▼' : '▶'} Analysis Details
            </button>
            
            {expanded && (
              <div className="mt-2 text-xs space-y-1 pl-2 border-l-2 border-dark-700">
                {(prediction.positives || []).map((p, i) => (
                  <p key={i} className="text-green-400">✓ {p}</p>
                ))}
                {(prediction.reasoning || []).map((r, i) => (
                  <p key={`r-${i}`} className="text-blue-400">• {r}</p>
                ))}
                {(prediction.warnings || []).map((w, i) => (
                  <p key={`w-${i}`} className="text-yellow-400">⚠ {w}</p>
                ))}
                {prediction.modelAgreement && (
                  <p className="text-dark-400 mt-2">
                    Model Agreement: {prediction.modelAgreement}%
                  </p>
                )}
              </div>
            )}
          </div>
        )}

        {/* Deep Research Button */}
        {showDeepResearch && (
          <button
            onClick={() => setShowResearch(true)}
            className="w-full py-2 text-sm bg-gradient-to-r from-purple-600 to-blue-600 hover:from-purple-500 hover:to-blue-500 rounded-lg transition-all flex items-center justify-center gap-2 font-medium"
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