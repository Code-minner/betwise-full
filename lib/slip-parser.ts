/**
 * Smart Slip Parser
 * Parses betting slips from SportyBet, Bet9ja, BetKing, 1xBet
 * Supports Football, Basketball, Tennis
 */

import { Sport, Market } from './types';

export interface ParsedSelection {
  id: string;
  sport: Sport;
  homeTeam: string;
  awayTeam: string;
  league: string;
  market: string;
  pick: string;
  line?: number;
  odds: number;
  kickoff?: Date;
}

export interface ParsedSlip {
  bookmaker: string;
  selections: ParsedSelection[];
  totalOdds: number;
  stake?: number;
  potentialWin?: number;
}

// ============== SPORT DETECTION ==============

function detectSport(text: string): Sport {
  const lowerText = text.toLowerCase();
  
  // Basketball indicators
  if (
    lowerText.includes('nba') ||
    lowerText.includes('basketball') ||
    lowerText.includes('euroleague') ||
    lowerText.includes('ncaa') ||
    /total\s*(over|under)\s*1[4-9]\d|2[0-5]\d/i.test(text) || // Totals 140-259
    /\+\s*\d+\.\d+\s*points/i.test(text)
  ) {
    return 'BASKETBALL';
  }
  
  // Tennis indicators
  if (
    lowerText.includes('atp') ||
    lowerText.includes('wta') ||
    lowerText.includes('tennis') ||
    lowerText.includes('grand slam') ||
    lowerText.includes('set 1') ||
    lowerText.includes('games') ||
    /\d+\.\d+\s*games/i.test(text)
  ) {
    return 'TENNIS';
  }
  
  // Default to football
  return 'FOOTBALL';
}

// ============== MARKET PARSING ==============

function parseMarket(marketText: string, sport: Sport): { market: string; pick: string; line?: number } {
  const text = marketText.toLowerCase().trim();
  
  // Football markets
  if (sport === 'FOOTBALL') {
    // Corners
    if (text.includes('corner')) {
      const overMatch = text.match(/over\s*(\d+\.?\d*)/);
      const underMatch = text.match(/under\s*(\d+\.?\d*)/);
      
      if (overMatch) {
        return { market: 'TOTAL_CORNERS_OVER', pick: `Over ${overMatch[1]} Corners`, line: parseFloat(overMatch[1]) };
      }
      if (underMatch) {
        return { market: 'TOTAL_CORNERS_UNDER', pick: `Under ${underMatch[1]} Corners`, line: parseFloat(underMatch[1]) };
      }
    }
    
    // Goals Over/Under
    const goalsOverMatch = text.match(/over\s*(\d+\.?\d*)\s*(goals?)?/);
    const goalsUnderMatch = text.match(/under\s*(\d+\.?\d*)\s*(goals?)?/);
    
    if (goalsOverMatch && !text.includes('corner')) {
      const line = parseFloat(goalsOverMatch[1]);
      return { market: `OVER_${line.toString().replace('.', '_')}`, pick: `Over ${line} Goals`, line };
    }
    if (goalsUnderMatch && !text.includes('corner')) {
      const line = parseFloat(goalsUnderMatch[1]);
      return { market: `UNDER_${line.toString().replace('.', '_')}`, pick: `Under ${line} Goals`, line };
    }
    
    // BTTS
    if (text.includes('btts') || text.includes('both teams to score')) {
      if (text.includes('yes') || text.includes('gg')) {
        return { market: 'BTTS_YES', pick: 'Both Teams To Score' };
      }
      if (text.includes('no') || text.includes('ng')) {
        return { market: 'BTTS_NO', pick: 'No BTTS' };
      }
    }
    
    // 1X2
    if (text.includes('home') || text === '1') {
      return { market: 'HOME_WIN', pick: 'Home Win' };
    }
    if (text.includes('away') || text === '2') {
      return { market: 'AWAY_WIN', pick: 'Away Win' };
    }
    if (text.includes('draw') || text === 'x') {
      return { market: 'DRAW', pick: 'Draw' };
    }
  }
  
  // Basketball markets
  if (sport === 'BASKETBALL') {
    const totalOverMatch = text.match(/(?:total\s*)?over\s*(\d+\.?\d*)/);
    const totalUnderMatch = text.match(/(?:total\s*)?under\s*(\d+\.?\d*)/);
    
    if (totalOverMatch) {
      const line = parseFloat(totalOverMatch[1]);
      return { market: 'TOTAL_OVER', pick: `Over ${line} Points`, line };
    }
    if (totalUnderMatch) {
      const line = parseFloat(totalUnderMatch[1]);
      return { market: 'TOTAL_UNDER', pick: `Under ${line} Points`, line };
    }
    
    // Spread
    const spreadMatch = text.match(/([+-]?\d+\.?\d*)\s*(?:spread|handicap|pts)/);
    if (spreadMatch) {
      const line = parseFloat(spreadMatch[1]);
      return { market: line > 0 ? 'AWAY_SPREAD' : 'HOME_SPREAD', pick: `Spread ${line}`, line };
    }
  }
  
  // Tennis markets
  if (sport === 'TENNIS') {
    const gamesOverMatch = text.match(/over\s*(\d+\.?\d*)\s*games/);
    const gamesUnderMatch = text.match(/under\s*(\d+\.?\d*)\s*games/);
    
    if (gamesOverMatch) {
      const line = parseFloat(gamesOverMatch[1]);
      return { market: 'TOTAL_GAMES_OVER', pick: `Over ${line} Games`, line };
    }
    if (gamesUnderMatch) {
      const line = parseFloat(gamesUnderMatch[1]);
      return { market: 'TOTAL_GAMES_UNDER', pick: `Under ${line} Games`, line };
    }
  }
  
  // Default - return raw text
  return { market: 'OTHER', pick: marketText };
}

// ============== BOOKMAKER PARSERS ==============

function parseSportyBet(text: string): ParsedSlip {
  const selections: ParsedSelection[] = [];
  const lines = text.split('\n').map(l => l.trim()).filter(Boolean);
  
  let currentSelection: Partial<ParsedSelection> = {};
  let id = 0;
  
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    
    // Match line: "Team A vs Team B" or "Team A - Team B"
    const matchPattern = /^(.+?)\s*(?:vs?\.?|[-–])\s*(.+?)$/i;
    const matchMatch = line.match(matchPattern);
    
    if (matchMatch && !line.includes('@') && !line.match(/^\d+\.\d+$/)) {
      // Save previous selection if exists
      if (currentSelection.homeTeam && currentSelection.market) {
        selections.push({
          id: String(id++),
          sport: currentSelection.sport || 'FOOTBALL',
          homeTeam: currentSelection.homeTeam,
          awayTeam: currentSelection.awayTeam || '',
          league: currentSelection.league || '',
          market: currentSelection.market,
          pick: currentSelection.pick || '',
          line: currentSelection.line,
          odds: currentSelection.odds || 1.0,
        });
      }
      
      currentSelection = {
        homeTeam: matchMatch[1].trim(),
        awayTeam: matchMatch[2].trim(),
        sport: detectSport(line),
      };
    }
    
    // Odds line
    const oddsMatch = line.match(/^@?\s*(\d+\.\d+)$/);
    if (oddsMatch) {
      currentSelection.odds = parseFloat(oddsMatch[1]);
    }
    
    // Market line
    if (currentSelection.homeTeam && !currentSelection.market) {
      const marketResult = parseMarket(line, currentSelection.sport || 'FOOTBALL');
      if (marketResult.market !== 'OTHER') {
        currentSelection.market = marketResult.market;
        currentSelection.pick = marketResult.pick;
        currentSelection.line = marketResult.line;
      }
    }
    
    // League line (usually contains country or competition name)
    if (line.includes('League') || line.includes('Cup') || line.includes('Championship')) {
      currentSelection.league = line;
    }
  }
  
  // Add last selection
  if (currentSelection.homeTeam && currentSelection.market) {
    selections.push({
      id: String(id++),
      sport: currentSelection.sport || 'FOOTBALL',
      homeTeam: currentSelection.homeTeam,
      awayTeam: currentSelection.awayTeam || '',
      league: currentSelection.league || '',
      market: currentSelection.market,
      pick: currentSelection.pick || '',
      line: currentSelection.line,
      odds: currentSelection.odds || 1.0,
    });
  }
  
  const totalOdds = selections.reduce((acc, s) => acc * s.odds, 1);
  
  return {
    bookmaker: 'SportyBet',
    selections,
    totalOdds: Math.round(totalOdds * 100) / 100,
  };
}

function parseBet9ja(text: string): ParsedSlip {
  const selections: ParsedSelection[] = [];
  const lines = text.split('\n').map(l => l.trim()).filter(Boolean);
  
  let id = 0;
  
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    
    // Bet9ja format: "HomeTeam v AwayTeam"
    const matchPattern = /^(.+?)\s+v\s+(.+?)$/i;
    const matchMatch = line.match(matchPattern);
    
    if (matchMatch) {
      const homeTeam = matchMatch[1].trim();
      const awayTeam = matchMatch[2].trim();
      const sport = detectSport(line);
      
      // Look for market and odds in next lines
      let market = '';
      let pick = '';
      let lineValue: number | undefined;
      let odds = 1.0;
      
      for (let j = i + 1; j < Math.min(i + 4, lines.length); j++) {
        const nextLine = lines[j];
        
        // Check for odds
        const oddsMatch = nextLine.match(/(\d+\.\d+)/);
        if (oddsMatch && parseFloat(oddsMatch[1]) > 1 && parseFloat(oddsMatch[1]) < 100) {
          odds = parseFloat(oddsMatch[1]);
        }
        
        // Check for market
        const marketResult = parseMarket(nextLine, sport);
        if (marketResult.market !== 'OTHER') {
          market = marketResult.market;
          pick = marketResult.pick;
          lineValue = marketResult.line;
        }
      }
      
      if (homeTeam && awayTeam) {
        selections.push({
          id: String(id++),
          sport,
          homeTeam,
          awayTeam,
          league: '',
          market: market || 'UNKNOWN',
          pick: pick || line,
          line: lineValue,
          odds,
        });
      }
    }
  }
  
  const totalOdds = selections.reduce((acc, s) => acc * s.odds, 1);
  
  return {
    bookmaker: 'Bet9ja',
    selections,
    totalOdds: Math.round(totalOdds * 100) / 100,
  };
}

function parseBetKing(text: string): ParsedSlip {
  const selections: ParsedSelection[] = [];
  const lines = text.split('\n').map(l => l.trim()).filter(Boolean);
  
  let id = 0;
  let currentLeague = '';
  
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    
    // League detection
    if (line.includes('Premier League') || line.includes('La Liga') || 
        line.includes('Serie A') || line.includes('NBA') || 
        line.includes('ATP') || line.includes('WTA')) {
      currentLeague = line;
      continue;
    }
    
    // Match pattern
    const matchPattern = /^(.+?)\s*(?:vs?\.?|[-–@])\s*(.+?)$/i;
    const matchMatch = line.match(matchPattern);
    
    if (matchMatch && !line.match(/^\d/) && line.length > 5) {
      const homeTeam = matchMatch[1].trim();
      const awayTeam = matchMatch[2].trim();
      
      if (homeTeam.length > 2 && awayTeam.length > 2) {
        const sport = detectSport(currentLeague + ' ' + line);
        
        let market = '';
        let pick = '';
        let lineValue: number | undefined;
        let odds = 1.0;
        
        // Look ahead for market and odds
        for (let j = i + 1; j < Math.min(i + 5, lines.length); j++) {
          const nextLine = lines[j];
          
          const oddsMatch = nextLine.match(/(\d+\.\d+)/);
          if (oddsMatch) {
            const potentialOdds = parseFloat(oddsMatch[1]);
            if (potentialOdds > 1 && potentialOdds < 500) {
              odds = potentialOdds;
            }
          }
          
          const marketResult = parseMarket(nextLine, sport);
          if (marketResult.market !== 'OTHER') {
            market = marketResult.market;
            pick = marketResult.pick;
            lineValue = marketResult.line;
          }
        }
        
        selections.push({
          id: String(id++),
          sport,
          homeTeam,
          awayTeam,
          league: currentLeague,
          market: market || 'UNKNOWN',
          pick: pick || 'Unknown',
          line: lineValue,
          odds,
        });
      }
    }
  }
  
  const totalOdds = selections.reduce((acc, s) => acc * s.odds, 1);
  
  return {
    bookmaker: 'BetKing',
    selections,
    totalOdds: Math.round(totalOdds * 100) / 100,
  };
}

function parse1xBet(text: string): ParsedSlip {
  const selections: ParsedSelection[] = [];
  const lines = text.split('\n').map(l => l.trim()).filter(Boolean);
  
  let id = 0;
  
  // 1xBet often has format: "Team1 - Team2" followed by market and odds
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    
    // Match pattern with dash separator
    const matchPattern = /^(.+?)\s*[-–]\s*(.+?)$/;
    const matchMatch = line.match(matchPattern);
    
    if (matchMatch) {
      const part1 = matchMatch[1].trim();
      const part2 = matchMatch[2].trim();
      
      // Check if this looks like a match (not a date or score)
      if (part1.length > 2 && part2.length > 2 && 
          !part1.match(/^\d{2}[.:]\d{2}$/) && 
          !part2.match(/^\d+$/)) {
        
        const sport = detectSport(line);
        
        let market = '';
        let pick = '';
        let lineValue: number | undefined;
        let odds = 1.0;
        let league = '';
        
        // Look for market and odds
        for (let j = i + 1; j < Math.min(i + 5, lines.length); j++) {
          const nextLine = lines[j];
          
          const oddsMatch = nextLine.match(/(\d+\.\d+)/);
          if (oddsMatch) {
            odds = parseFloat(oddsMatch[1]);
          }
          
          const marketResult = parseMarket(nextLine, sport);
          if (marketResult.market !== 'OTHER') {
            market = marketResult.market;
            pick = marketResult.pick;
            lineValue = marketResult.line;
          }
        }
        
        selections.push({
          id: String(id++),
          sport,
          homeTeam: part1,
          awayTeam: part2,
          league,
          market: market || 'UNKNOWN',
          pick: pick || 'Unknown',
          line: lineValue,
          odds,
        });
      }
    }
  }
  
  const totalOdds = selections.reduce((acc, s) => acc * s.odds, 1);
  
  return {
    bookmaker: '1xBet',
    selections,
    totalOdds: Math.round(totalOdds * 100) / 100,
  };
}

// ============== MAIN PARSER ==============

function detectBookmaker(text: string): string {
  const lowerText = text.toLowerCase();
  
  if (lowerText.includes('sportybet') || lowerText.includes('sporty')) {
    return 'SportyBet';
  }
  if (lowerText.includes('bet9ja') || lowerText.includes('9ja')) {
    return 'Bet9ja';
  }
  if (lowerText.includes('betking') || lowerText.includes('king')) {
    return 'BetKing';
  }
  if (lowerText.includes('1xbet') || lowerText.includes('1x')) {
    return '1xBet';
  }
  
  // Default based on format patterns
  if (text.includes(' v ')) {
    return 'Bet9ja';
  }
  if (text.includes(' - ')) {
    return '1xBet';
  }
  
  return 'Unknown';
}

export function parseSlip(text: string, forcedBookmaker?: string): ParsedSlip {
  const bookmaker = forcedBookmaker || detectBookmaker(text);
  
  switch (bookmaker) {
    case 'SportyBet':
      return parseSportyBet(text);
    case 'Bet9ja':
      return parseBet9ja(text);
    case 'BetKing':
      return parseBetKing(text);
    case '1xBet':
      return parse1xBet(text);
    default:
      // Try generic parsing
      return parseSportyBet(text);
  }
}

// ============== MANUAL ENTRY ==============

export interface ManualSelection {
  homeTeam: string;
  awayTeam: string;
  sport: Sport;
  market: string;
  line?: number;
  odds: number;
}

export function createManualSlip(selections: ManualSelection[]): ParsedSlip {
  const parsedSelections: ParsedSelection[] = selections.map((s, i) => ({
    id: String(i),
    sport: s.sport,
    homeTeam: s.homeTeam,
    awayTeam: s.awayTeam,
    league: '',
    market: s.market,
    pick: s.market,
    line: s.line,
    odds: s.odds,
  }));
  
  const totalOdds = parsedSelections.reduce((acc, s) => acc * s.odds, 1);
  
  return {
    bookmaker: 'Manual',
    selections: parsedSelections,
    totalOdds: Math.round(totalOdds * 100) / 100,
  };
}

export default {
  parseSlip,
  createManualSlip,
  detectBookmaker,
  detectSport,
};
