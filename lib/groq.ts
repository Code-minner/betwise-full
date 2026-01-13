/**
 * Groq AI Deep Research
 * 3-pass analysis using Groq LLM
 */

const GROQ_API_KEY = process.env.GROQ_API_KEY || '';
const GROQ_URL = 'https://api.groq.com/openai/v1/chat/completions';
const MODEL = 'llama-3.3-70b-versatile';

export interface DeepAnalysisResult {
  pass1: string; // Form & Stats
  pass2: string; // H2H & Patterns  
  pass3: string; // Verdict & Recommendation
  verdict: 'STRONG_BET' | 'GOOD_VALUE' | 'LEAN' | 'AVOID' | 'SKIP';
  confidence: number;
  keyPoints: string[];
  risks: string[];
}

export interface FollowUpResponse {
  answer: string;
  followUpSuggestions: string[];
}

// ============== API CALL ==============

async function callGroq(
  messages: { role: 'system' | 'user' | 'assistant'; content: string }[],
  maxTokens: number = 1000
): Promise<string> {
  if (!GROQ_API_KEY) {
    throw new Error('GROQ_API_KEY not configured');
  }

  try {
    const response = await fetch(GROQ_URL, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${GROQ_API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: MODEL,
        messages,
        max_tokens: maxTokens,
        temperature: 0.7,
      }),
    });

    if (!response.ok) {
      const error = await response.text();
      throw new Error(`Groq API error: ${response.status} - ${error}`);
    }

    const data = await response.json();
    return data.choices?.[0]?.message?.content || '';
  } catch (error) {
    console.error('Groq API error:', error);
    throw error;
  }
}

// ============== FOOTBALL ANALYSIS ==============

export async function analyzeFootballMatch(
  homeTeam: string,
  awayTeam: string,
  league: string,
  market: string,
  homeStats?: any,
  awayStats?: any
): Promise<DeepAnalysisResult> {
  const statsContext = homeStats && awayStats 
    ? `
Home Team Stats: ${JSON.stringify(homeStats, null, 2)}
Away Team Stats: ${JSON.stringify(awayStats, null, 2)}
`
    : 'No detailed stats available - using general knowledge.';

  // Pass 1: Form & Stats
  const pass1Response = await callGroq([
    {
      role: 'system',
      content: 'You are a professional football analyst. Analyze team form, recent results, and key statistics. Be concise and data-driven.',
    },
    {
      role: 'user',
      content: `Analyze the current form for ${homeTeam} vs ${awayTeam} in ${league}.
Market: ${market}

${statsContext}

Focus on:
1. Recent form (last 5 games)
2. Goals scored/conceded patterns
3. Home/Away performance differences
4. Key player availability (if known)

Provide a brief, factual analysis in 2-3 paragraphs.`,
    },
  ]);

  // Pass 2: H2H & Patterns
  const pass2Response = await callGroq([
    {
      role: 'system',
      content: 'You are a football statistics expert. Analyze head-to-head records and betting patterns.',
    },
    {
      role: 'user',
      content: `For ${homeTeam} vs ${awayTeam}:

Previous analysis: ${pass1Response}

Now analyze:
1. Historical head-to-head trends
2. Common scorelines in this fixture
3. ${market} market patterns for these teams
4. League trends for this market

Be specific and highlight actionable patterns.`,
    },
  ]);

  // Pass 3: Verdict
  const pass3Response = await callGroq([
    {
      role: 'system',
      content: `You are a betting analyst. Provide a final verdict on the bet.
      
Your response MUST include:
- VERDICT: [STRONG_BET/GOOD_VALUE/LEAN/AVOID/SKIP]
- CONFIDENCE: [0-100]
- KEY_POINTS: [bullet points]
- RISKS: [bullet points]`,
    },
    {
      role: 'user',
      content: `Final verdict for ${homeTeam} vs ${awayTeam} - ${market}

Form Analysis: ${pass1Response}

H2H Analysis: ${pass2Response}

Provide your final recommendation. Be decisive but honest about uncertainty.`,
    },
  ]);

  // Parse verdict from response
  const verdictMatch = pass3Response.match(/VERDICT:\s*(STRONG_BET|GOOD_VALUE|LEAN|AVOID|SKIP)/i);
  const confidenceMatch = pass3Response.match(/CONFIDENCE:\s*(\d+)/i);
  
  const keyPointsMatch = pass3Response.match(/KEY_POINTS:(.+?)(?=RISKS:|$)/is);
  const risksMatch = pass3Response.match(/RISKS:(.+?)$/is);

  const keyPoints = keyPointsMatch 
    ? keyPointsMatch[1].split(/[-•*]/).map(s => s.trim()).filter(Boolean).slice(0, 4)
    : [];
  
  const risks = risksMatch
    ? risksMatch[1].split(/[-•*]/).map(s => s.trim()).filter(Boolean).slice(0, 3)
    : [];

  return {
    pass1: pass1Response,
    pass2: pass2Response,
    pass3: pass3Response,
    verdict: (verdictMatch?.[1]?.toUpperCase() || 'LEAN') as any,
    confidence: parseInt(confidenceMatch?.[1] || '50'),
    keyPoints,
    risks,
  };
}

// ============== BASKETBALL ANALYSIS ==============

export async function analyzeBasketballMatch(
  homeTeam: string,
  awayTeam: string,
  league: string,
  market: string,
  line?: number,
  homeStats?: any,
  awayStats?: any
): Promise<DeepAnalysisResult> {
  const lineInfo = line ? `Line: ${line}` : '';
  
  // Pass 1: Scoring Trends
  const pass1Response = await callGroq([
    {
      role: 'system',
      content: 'You are an NBA/basketball analyst. Focus on scoring trends, pace, and offensive/defensive ratings.',
    },
    {
      role: 'user',
      content: `Analyze scoring trends for ${homeTeam} vs ${awayTeam} (${league}).
Market: ${market} ${lineInfo}

Analyze:
1. Team scoring averages (home/away)
2. Pace of play
3. Offensive and defensive efficiency
4. Recent scoring trends (last 5-10 games)

Be specific with numbers where possible.`,
    },
  ]);

  // Pass 2: Matchup Analysis
  const pass2Response = await callGroq([
    {
      role: 'system',
      content: 'You are a basketball matchup analyst. Focus on how teams perform against each other and similar opponents.',
    },
    {
      role: 'user',
      content: `For ${homeTeam} vs ${awayTeam}:

Scoring analysis: ${pass1Response}

Now analyze:
1. Head-to-head scoring patterns
2. Performance against similar style teams
3. Over/Under trends for both teams
4. Rest days and schedule factors

Focus on patterns relevant to ${market} ${lineInfo}.`,
    },
  ]);

  // Pass 3: Verdict
  const pass3Response = await callGroq([
    {
      role: 'system',
      content: `You are a basketball betting expert. Give a clear verdict.
      
Format your response:
VERDICT: [STRONG_BET/GOOD_VALUE/LEAN/AVOID/SKIP]
CONFIDENCE: [0-100]
KEY_POINTS:
- point 1
- point 2
RISKS:
- risk 1
- risk 2`,
    },
    {
      role: 'user',
      content: `Final verdict: ${homeTeam} vs ${awayTeam} - ${market} ${lineInfo}

Scoring: ${pass1Response}
Matchup: ${pass2Response}

Give your recommendation.`,
    },
  ]);

  const verdictMatch = pass3Response.match(/VERDICT:\s*(STRONG_BET|GOOD_VALUE|LEAN|AVOID|SKIP)/i);
  const confidenceMatch = pass3Response.match(/CONFIDENCE:\s*(\d+)/i);
  
  const keyPointsMatch = pass3Response.match(/KEY_POINTS:(.+?)(?=RISKS:|$)/is);
  const risksMatch = pass3Response.match(/RISKS:(.+?)$/is);

  return {
    pass1: pass1Response,
    pass2: pass2Response,
    pass3: pass3Response,
    verdict: (verdictMatch?.[1]?.toUpperCase() || 'LEAN') as any,
    confidence: parseInt(confidenceMatch?.[1] || '50'),
    keyPoints: keyPointsMatch?.[1].split(/[-•*]/).map(s => s.trim()).filter(Boolean).slice(0, 4) || [],
    risks: risksMatch?.[1].split(/[-•*]/).map(s => s.trim()).filter(Boolean).slice(0, 3) || [],
  };
}

// ============== TENNIS ANALYSIS ==============

export async function analyzeTennisMatch(
  player1: string,
  player2: string,
  tournament: string,
  surface: string,
  market: string,
  line?: number
): Promise<DeepAnalysisResult> {
  const lineInfo = line ? `Line: ${line}` : '';

  // Pass 1: Surface & Form
  const pass1Response = await callGroq([
    {
      role: 'system',
      content: 'You are a tennis analyst. Focus on surface performance and current form.',
    },
    {
      role: 'user',
      content: `Analyze: ${player1} vs ${player2}
Tournament: ${tournament}
Surface: ${surface}
Market: ${market} ${lineInfo}

Analyze:
1. Each player's ${surface} court record
2. Recent form (last 5-10 matches)
3. Serving statistics
4. Return game strength

Be specific with stats where known.`,
    },
  ]);

  // Pass 2: H2H & Mental
  const pass2Response = await callGroq([
    {
      role: 'system',
      content: 'You are a tennis expert. Analyze head-to-head and mental aspects.',
    },
    {
      role: 'user',
      content: `For ${player1} vs ${player2}:

Form analysis: ${pass1Response}

Now analyze:
1. Head-to-head record
2. Performance at this tournament level
3. Tiebreak and deciding set records
4. Physical conditioning factors

Focus on patterns for ${market}.`,
    },
  ]);

  // Pass 3: Verdict
  const pass3Response = await callGroq([
    {
      role: 'system',
      content: `Tennis betting expert. Give clear verdict.
      
Format:
VERDICT: [STRONG_BET/GOOD_VALUE/LEAN/AVOID/SKIP]
CONFIDENCE: [0-100]
KEY_POINTS: (bullet points)
RISKS: (bullet points)`,
    },
    {
      role: 'user',
      content: `Verdict for ${player1} vs ${player2} - ${market} ${lineInfo}

${pass1Response}
${pass2Response}

Your recommendation?`,
    },
  ]);

  const verdictMatch = pass3Response.match(/VERDICT:\s*(STRONG_BET|GOOD_VALUE|LEAN|AVOID|SKIP)/i);
  const confidenceMatch = pass3Response.match(/CONFIDENCE:\s*(\d+)/i);

  return {
    pass1: pass1Response,
    pass2: pass2Response,
    pass3: pass3Response,
    verdict: (verdictMatch?.[1]?.toUpperCase() || 'LEAN') as any,
    confidence: parseInt(confidenceMatch?.[1] || '50'),
    keyPoints: [],
    risks: [],
  };
}

// ============== SLIP ANALYSIS ==============

export async function analyzeSlip(
  selections: { homeTeam: string; awayTeam: string; market: string; odds: number; sport: string }[]
): Promise<{
  overallRating: 'STRONG' | 'GOOD' | 'RISKY' | 'AVOID';
  confidence: number;
  weakestLink: string;
  analysis: string;
  selectionVerdicts: { selection: string; verdict: string; risk: string }[];
}> {
  const selectionsText = selections.map((s, i) => 
    `${i + 1}. ${s.homeTeam} vs ${s.awayTeam} - ${s.market} @ ${s.odds}`
  ).join('\n');

  const response = await callGroq([
    {
      role: 'system',
      content: `You are analyzing a betting slip. Rate each selection and identify the weakest link.

Format your response:
OVERALL_RATING: [STRONG/GOOD/RISKY/AVOID]
CONFIDENCE: [0-100]
WEAKEST_LINK: [selection number and reason]
ANALYSIS: [brief overall analysis]
SELECTION_VERDICTS:
1. VERDICT: [OK/RISKY/AVOID] - RISK: [main risk]
2. ...`,
    },
    {
      role: 'user',
      content: `Analyze this betting slip:

${selectionsText}

Total Odds: ${selections.reduce((acc, s) => acc * s.odds, 1).toFixed(2)}

Evaluate each selection and the overall slip.`,
    },
  ], 1500);

  const ratingMatch = response.match(/OVERALL_RATING:\s*(STRONG|GOOD|RISKY|AVOID)/i);
  const confidenceMatch = response.match(/CONFIDENCE:\s*(\d+)/i);
  const weakestMatch = response.match(/WEAKEST_LINK:\s*(.+?)(?=\n|ANALYSIS)/is);
  const analysisMatch = response.match(/ANALYSIS:\s*(.+?)(?=SELECTION_VERDICTS|$)/is);

  return {
    overallRating: (ratingMatch?.[1]?.toUpperCase() || 'RISKY') as any,
    confidence: parseInt(confidenceMatch?.[1] || '50'),
    weakestLink: weakestMatch?.[1]?.trim() || 'Unable to determine',
    analysis: analysisMatch?.[1]?.trim() || response,
    selectionVerdicts: selections.map((s, i) => ({
      selection: `${s.homeTeam} vs ${s.awayTeam}`,
      verdict: 'OK',
      risk: 'Standard risk',
    })),
  };
}

// ============== FOLLOW UP ==============

export async function handleFollowUp(
  originalAnalysis: DeepAnalysisResult,
  question: string,
  conversationHistory: { role: 'user' | 'assistant'; content: string }[]
): Promise<FollowUpResponse> {
  const messages: { role: 'system' | 'user' | 'assistant'; content: string }[] = [
    {
      role: 'system',
      content: `You are a sports betting analyst. You previously analyzed a match.
      
Original Analysis Summary:
- Verdict: ${originalAnalysis.verdict}
- Confidence: ${originalAnalysis.confidence}%
- Key Points: ${originalAnalysis.keyPoints.join(', ')}

Answer follow-up questions concisely. Suggest 2-3 relevant follow-up questions at the end.`,
    },
    ...conversationHistory,
    {
      role: 'user',
      content: question,
    },
  ];

  const response = await callGroq(messages);

  // Extract suggested follow-ups
  const suggestionsMatch = response.match(/(?:follow[- ]?up|questions?|you (?:could|might|can) ask):?\s*(.+?)$/is);
  let suggestions: string[] = [];
  
  if (suggestionsMatch) {
    suggestions = suggestionsMatch[1]
      .split(/[\n•\-\d.]+/)
      .map(s => s.trim())
      .filter(s => s.length > 10 && s.length < 100)
      .slice(0, 3);
  }

  if (suggestions.length === 0) {
    suggestions = [
      'What are the key injuries to watch?',
      'How does the weather affect this prediction?',
      'What alternative bets would you suggest?',
    ];
  }

  return {
    answer: response,
    followUpSuggestions: suggestions,
  };
}

// ============== FALLBACK ==============

export function getFallbackAnalysis(): DeepAnalysisResult {
  return {
    pass1: 'AI analysis unavailable. Please check your GROQ_API_KEY configuration.',
    pass2: 'Unable to perform deep analysis without API access.',
    pass3: 'Recommendation: Rely on the statistical analysis provided by the prediction engine.',
    verdict: 'SKIP',
    confidence: 0,
    keyPoints: ['AI analysis not available', 'Use statistical predictions instead'],
    risks: ['Cannot perform deep research without API key'],
  };
}

export default {
  analyzeFootballMatch,
  analyzeBasketballMatch,
  analyzeTennisMatch,
  analyzeSlip,
  handleFollowUp,
  getFallbackAnalysis,
};
