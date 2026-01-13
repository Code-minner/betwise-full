'use client';

import { useState } from 'react';
import { Sport } from '@/lib/types';

interface DeepResearchModalProps {
  isOpen: boolean;
  onClose: () => void;
  sport: Sport;
  homeTeam: string;
  awayTeam: string;
  league: string;
  market: string;
  line?: number;
  surface?: string;
}

interface AnalysisResult {
  pass1: string;
  pass2: string;
  pass3: string;
  verdict: string;
  confidence: number;
  keyPoints: string[];
  risks: string[];
}

export default function DeepResearchModal({
  isOpen,
  onClose,
  sport,
  homeTeam,
  awayTeam,
  league,
  market,
  line,
  surface,
}: DeepResearchModalProps) {
  const [loading, setLoading] = useState(false);
  const [currentPass, setCurrentPass] = useState(0);
  const [analysis, setAnalysis] = useState<AnalysisResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  
  // Follow-up chat
  const [chatHistory, setChatHistory] = useState<{ role: 'user' | 'assistant'; content: string }[]>([]);
  const [question, setQuestion] = useState('');
  const [chatLoading, setChatLoading] = useState(false);
  const [questionsAsked, setQuestionsAsked] = useState(0);
  const MAX_QUESTIONS = 3;

  async function startAnalysis() {
    setLoading(true);
    setError(null);
    setCurrentPass(1);

    try {
      // Simulate pass progression
      await new Promise(r => setTimeout(r, 1500));
      setCurrentPass(2);
      await new Promise(r => setTimeout(r, 1500));
      setCurrentPass(3);

      const response = await fetch('/api/deep-research', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          sport,
          homeTeam,
          awayTeam,
          league,
          market,
          line,
          surface,
        }),
      });

      const data = await response.json();

      if (data.success) {
        setAnalysis(data);
      } else {
        setError(data.error || 'Analysis failed');
      }
    } catch (e) {
      setError('Failed to perform analysis');
    } finally {
      setLoading(false);
      setCurrentPass(0);
    }
  }

  async function askFollowUp() {
    if (!question.trim() || questionsAsked >= MAX_QUESTIONS) return;

    setChatLoading(true);
    const userQuestion = question;
    setQuestion('');
    
    setChatHistory(prev => [...prev, { role: 'user', content: userQuestion }]);

    try {
      const response = await fetch('/api/research-followup', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          question: userQuestion,
          originalAnalysis: analysis,
          conversationHistory: chatHistory,
        }),
      });

      const data = await response.json();

      if (data.success) {
        setChatHistory(prev => [...prev, { role: 'assistant', content: data.answer }]);
        setQuestionsAsked(prev => prev + 1);
      }
    } catch (e) {
      setChatHistory(prev => [...prev, { role: 'assistant', content: 'Sorry, I could not process that question.' }]);
    } finally {
      setChatLoading(false);
    }
  }

  if (!isOpen) return null;

  const verdictColor = 
    analysis?.verdict === 'STRONG_BET' ? 'text-green-400 bg-green-900/30' :
    analysis?.verdict === 'GOOD_VALUE' ? 'text-green-300 bg-green-900/20' :
    analysis?.verdict === 'LEAN' ? 'text-yellow-400 bg-yellow-900/20' :
    'text-red-400 bg-red-900/20';

  return (
    <div className="fixed inset-0 bg-black/80 backdrop-blur-sm z-50 flex items-center justify-center p-4">
      <div className="bg-dark-900 border border-dark-700 rounded-xl w-full max-w-3xl max-h-[90vh] overflow-hidden flex flex-col">
        {/* Header */}
        <div className="p-4 border-b border-dark-700 flex items-center justify-between">
          <div>
            <h2 className="text-xl font-bold">🔬 Deep Research</h2>
            <p className="text-dark-400 text-sm">
              {homeTeam} vs {awayTeam} • {market}
            </p>
          </div>
          <button onClick={onClose} className="text-dark-400 hover:text-white text-2xl">
            ×
          </button>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto p-4 space-y-4">
          {/* Start Analysis */}
          {!analysis && !loading && !error && (
            <div className="text-center py-8">
              <p className="text-dark-300 mb-4">
                Get AI-powered deep analysis using 3-pass methodology
              </p>
              <div className="text-sm text-dark-400 mb-6 space-y-1">
                <p>Pass 1: Form & Statistics Analysis</p>
                <p>Pass 2: Head-to-Head & Patterns</p>
                <p>Pass 3: Final Verdict & Recommendation</p>
              </div>
              <button onClick={startAnalysis} className="btn-primary">
                🚀 Start Deep Analysis
              </button>
            </div>
          )}

          {/* Loading */}
          {loading && (
            <div className="text-center py-8">
              <div className="inline-block animate-spin text-4xl mb-4">🔄</div>
              <div className="space-y-2">
                <p className={`${currentPass >= 1 ? 'text-primary-400' : 'text-dark-500'}`}>
                  {currentPass >= 1 ? '✓' : '○'} Pass 1: Analyzing form & stats...
                </p>
                <p className={`${currentPass >= 2 ? 'text-primary-400' : 'text-dark-500'}`}>
                  {currentPass >= 2 ? '✓' : '○'} Pass 2: Checking H2H & patterns...
                </p>
                <p className={`${currentPass >= 3 ? 'text-primary-400' : 'text-dark-500'}`}>
                  {currentPass >= 3 ? '✓' : '○'} Pass 3: Generating verdict...
                </p>
              </div>
            </div>
          )}

          {/* Error */}
          {error && (
            <div className="text-center py-8">
              <p className="text-red-400 mb-4">{error}</p>
              <button onClick={startAnalysis} className="btn-primary">
                Try Again
              </button>
            </div>
          )}

          {/* Analysis Result */}
          {analysis && (
            <div className="space-y-4">
              {/* Verdict */}
              <div className={`rounded-lg p-4 ${verdictColor}`}>
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm opacity-80">Verdict</p>
                    <p className="text-2xl font-bold">{analysis.verdict.replace('_', ' ')}</p>
                  </div>
                  <div className="text-right">
                    <p className="text-sm opacity-80">Confidence</p>
                    <p className="text-2xl font-bold">{analysis.confidence}%</p>
                  </div>
                </div>
              </div>

              {/* Key Points */}
              {analysis.keyPoints.length > 0 && (
                <div className="bg-dark-800/50 rounded-lg p-4">
                  <h3 className="font-semibold mb-2 text-green-400">✓ Key Points</h3>
                  <ul className="space-y-1 text-sm text-dark-300">
                    {analysis.keyPoints.map((point, i) => (
                      <li key={i}>• {point}</li>
                    ))}
                  </ul>
                </div>
              )}

              {/* Risks */}
              {analysis.risks.length > 0 && (
                <div className="bg-dark-800/50 rounded-lg p-4">
                  <h3 className="font-semibold mb-2 text-yellow-400">⚠ Risks</h3>
                  <ul className="space-y-1 text-sm text-dark-300">
                    {analysis.risks.map((risk, i) => (
                      <li key={i}>• {risk}</li>
                    ))}
                  </ul>
                </div>
              )}

              {/* Detailed Analysis (Collapsible) */}
              <details className="bg-dark-800/50 rounded-lg">
                <summary className="p-4 cursor-pointer font-semibold">
                  📋 View Full Analysis
                </summary>
                <div className="p-4 pt-0 space-y-4 text-sm text-dark-300">
                  <div>
                    <h4 className="font-medium text-white mb-1">Pass 1: Form & Stats</h4>
                    <p className="whitespace-pre-wrap">{analysis.pass1}</p>
                  </div>
                  <div>
                    <h4 className="font-medium text-white mb-1">Pass 2: H2H & Patterns</h4>
                    <p className="whitespace-pre-wrap">{analysis.pass2}</p>
                  </div>
                  <div>
                    <h4 className="font-medium text-white mb-1">Pass 3: Verdict</h4>
                    <p className="whitespace-pre-wrap">{analysis.pass3}</p>
                  </div>
                </div>
              </details>

              {/* Follow-up Chat */}
              <div className="bg-dark-800/50 rounded-lg p-4">
                <h3 className="font-semibold mb-3">
                  💬 Ask Follow-up Questions ({MAX_QUESTIONS - questionsAsked} remaining)
                </h3>

                {/* Chat History */}
                {chatHistory.length > 0 && (
                  <div className="space-y-3 mb-4 max-h-48 overflow-y-auto">
                    {chatHistory.map((msg, i) => (
                      <div 
                        key={i}
                        className={`p-2 rounded text-sm ${
                          msg.role === 'user' 
                            ? 'bg-primary-900/30 text-primary-200 ml-8' 
                            : 'bg-dark-700 text-dark-200 mr-8'
                        }`}
                      >
                        {msg.content}
                      </div>
                    ))}
                  </div>
                )}

                {/* Input */}
                {questionsAsked < MAX_QUESTIONS ? (
                  <div className="flex gap-2">
                    <input
                      type="text"
                      value={question}
                      onChange={(e) => setQuestion(e.target.value)}
                      onKeyPress={(e) => e.key === 'Enter' && askFollowUp()}
                      placeholder="Ask about injuries, weather, alternatives..."
                      className="input flex-1"
                      disabled={chatLoading}
                    />
                    <button
                      onClick={askFollowUp}
                      disabled={chatLoading || !question.trim()}
                      className="btn-primary"
                    >
                      {chatLoading ? '...' : 'Ask'}
                    </button>
                  </div>
                ) : (
                  <p className="text-dark-400 text-sm">
                    Maximum questions reached for this analysis.
                  </p>
                )}
              </div>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="p-4 border-t border-dark-700">
          <button onClick={onClose} className="btn-secondary w-full">
            Close
          </button>
        </div>
      </div>
    </div>
  );
}
