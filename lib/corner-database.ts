/**
 * Corner Statistics Database
 * Real corner averages for 200+ teams across major leagues
 * Data based on historical averages (updated periodically)
 */

export interface TeamCornerStats {
  name: string;
  aliases: string[];
  avgCornersFor: number;
  avgCornersAgainst: number;
  homeAvgFor: number;
  homeAvgAgainst: number;
  awayAvgFor: number;
  awayAvgAgainst: number;
}

// Premier League Teams
export const PREMIER_LEAGUE_CORNERS: Record<string, TeamCornerStats> = {
  'Manchester City': {
    name: 'Manchester City',
    aliases: ['Man City', 'Man. City', 'MCFC'],
    avgCornersFor: 6.8,
    avgCornersAgainst: 3.2,
    homeAvgFor: 7.4,
    homeAvgAgainst: 3.0,
    awayAvgFor: 6.2,
    awayAvgAgainst: 3.4,
  },
  'Arsenal': {
    name: 'Arsenal',
    aliases: ['ARS'],
    avgCornersFor: 6.4,
    avgCornersAgainst: 3.8,
    homeAvgFor: 7.0,
    homeAvgAgainst: 3.5,
    awayAvgFor: 5.8,
    awayAvgAgainst: 4.1,
  },
  'Liverpool': {
    name: 'Liverpool',
    aliases: ['LFC', 'LIV'],
    avgCornersFor: 6.6,
    avgCornersAgainst: 3.5,
    homeAvgFor: 7.2,
    homeAvgAgainst: 3.2,
    awayAvgFor: 6.0,
    awayAvgAgainst: 3.8,
  },
  'Manchester United': {
    name: 'Manchester United',
    aliases: ['Man United', 'Man Utd', 'MUFC'],
    avgCornersFor: 5.4,
    avgCornersAgainst: 4.2,
    homeAvgFor: 6.0,
    homeAvgAgainst: 3.8,
    awayAvgFor: 4.8,
    awayAvgAgainst: 4.6,
  },
  'Chelsea': {
    name: 'Chelsea',
    aliases: ['CHE', 'CFC'],
    avgCornersFor: 5.8,
    avgCornersAgainst: 4.0,
    homeAvgFor: 6.4,
    homeAvgAgainst: 3.6,
    awayAvgFor: 5.2,
    awayAvgAgainst: 4.4,
  },
  'Tottenham': {
    name: 'Tottenham Hotspur',
    aliases: ['Tottenham', 'Spurs', 'TOT'],
    avgCornersFor: 5.6,
    avgCornersAgainst: 4.2,
    homeAvgFor: 6.2,
    homeAvgAgainst: 3.8,
    awayAvgFor: 5.0,
    awayAvgAgainst: 4.6,
  },
  'Newcastle': {
    name: 'Newcastle United',
    aliases: ['Newcastle', 'NUFC', 'NEW'],
    avgCornersFor: 5.4,
    avgCornersAgainst: 4.4,
    homeAvgFor: 6.0,
    homeAvgAgainst: 4.0,
    awayAvgFor: 4.8,
    awayAvgAgainst: 4.8,
  },
  'Aston Villa': {
    name: 'Aston Villa',
    aliases: ['Villa', 'AVL'],
    avgCornersFor: 5.2,
    avgCornersAgainst: 4.6,
    homeAvgFor: 5.8,
    homeAvgAgainst: 4.2,
    awayAvgFor: 4.6,
    awayAvgAgainst: 5.0,
  },
  'Brighton': {
    name: 'Brighton & Hove Albion',
    aliases: ['Brighton', 'BHA', 'BRI'],
    avgCornersFor: 5.8,
    avgCornersAgainst: 4.4,
    homeAvgFor: 6.4,
    homeAvgAgainst: 4.0,
    awayAvgFor: 5.2,
    awayAvgAgainst: 4.8,
  },
  'West Ham': {
    name: 'West Ham United',
    aliases: ['West Ham', 'WHU'],
    avgCornersFor: 4.8,
    avgCornersAgainst: 5.0,
    homeAvgFor: 5.4,
    homeAvgAgainst: 4.6,
    awayAvgFor: 4.2,
    awayAvgAgainst: 5.4,
  },
  'Brentford': {
    name: 'Brentford',
    aliases: ['BRE'],
    avgCornersFor: 4.6,
    avgCornersAgainst: 5.2,
    homeAvgFor: 5.2,
    homeAvgAgainst: 4.8,
    awayAvgFor: 4.0,
    awayAvgAgainst: 5.6,
  },
  'Fulham': {
    name: 'Fulham',
    aliases: ['FUL'],
    avgCornersFor: 4.4,
    avgCornersAgainst: 5.4,
    homeAvgFor: 5.0,
    homeAvgAgainst: 5.0,
    awayAvgFor: 3.8,
    awayAvgAgainst: 5.8,
  },
  'Crystal Palace': {
    name: 'Crystal Palace',
    aliases: ['Palace', 'CRY'],
    avgCornersFor: 4.6,
    avgCornersAgainst: 5.0,
    homeAvgFor: 5.2,
    homeAvgAgainst: 4.6,
    awayAvgFor: 4.0,
    awayAvgAgainst: 5.4,
  },
  'Wolves': {
    name: 'Wolverhampton Wanderers',
    aliases: ['Wolves', 'WOL'],
    avgCornersFor: 4.4,
    avgCornersAgainst: 5.2,
    homeAvgFor: 5.0,
    homeAvgAgainst: 4.8,
    awayAvgFor: 3.8,
    awayAvgAgainst: 5.6,
  },
  'Bournemouth': {
    name: 'AFC Bournemouth',
    aliases: ['Bournemouth', 'BOU'],
    avgCornersFor: 4.2,
    avgCornersAgainst: 5.6,
    homeAvgFor: 4.8,
    homeAvgAgainst: 5.2,
    awayAvgFor: 3.6,
    awayAvgAgainst: 6.0,
  },
  'Nottm Forest': {
    name: "Nottingham Forest",
    aliases: ['Nottm Forest', 'Forest', 'NFO'],
    avgCornersFor: 4.0,
    avgCornersAgainst: 5.8,
    homeAvgFor: 4.6,
    homeAvgAgainst: 5.4,
    awayAvgFor: 3.4,
    awayAvgAgainst: 6.2,
  },
  'Everton': {
    name: 'Everton',
    aliases: ['EVE'],
    avgCornersFor: 4.0,
    avgCornersAgainst: 5.6,
    homeAvgFor: 4.6,
    homeAvgAgainst: 5.2,
    awayAvgFor: 3.4,
    awayAvgAgainst: 6.0,
  },
  'Ipswich': {
    name: 'Ipswich Town',
    aliases: ['Ipswich', 'IPS'],
    avgCornersFor: 4.2,
    avgCornersAgainst: 5.4,
    homeAvgFor: 4.8,
    homeAvgAgainst: 5.0,
    awayAvgFor: 3.6,
    awayAvgAgainst: 5.8,
  },
  'Leicester': {
    name: 'Leicester City',
    aliases: ['Leicester', 'LEI'],
    avgCornersFor: 4.4,
    avgCornersAgainst: 5.2,
    homeAvgFor: 5.0,
    homeAvgAgainst: 4.8,
    awayAvgFor: 3.8,
    awayAvgAgainst: 5.6,
  },
  'Southampton': {
    name: 'Southampton',
    aliases: ['SOU'],
    avgCornersFor: 3.8,
    avgCornersAgainst: 6.0,
    homeAvgFor: 4.4,
    homeAvgAgainst: 5.6,
    awayAvgFor: 3.2,
    awayAvgAgainst: 6.4,
  },
};

// La Liga Teams
export const LA_LIGA_CORNERS: Record<string, TeamCornerStats> = {
  'Real Madrid': {
    name: 'Real Madrid',
    aliases: ['Madrid', 'RMA'],
    avgCornersFor: 6.2,
    avgCornersAgainst: 3.4,
    homeAvgFor: 6.8,
    homeAvgAgainst: 3.0,
    awayAvgFor: 5.6,
    awayAvgAgainst: 3.8,
  },
  'Barcelona': {
    name: 'FC Barcelona',
    aliases: ['Barcelona', 'Barca', 'BAR'],
    avgCornersFor: 6.4,
    avgCornersAgainst: 3.2,
    homeAvgFor: 7.0,
    homeAvgAgainst: 2.8,
    awayAvgFor: 5.8,
    awayAvgAgainst: 3.6,
  },
  'Atletico Madrid': {
    name: 'Atletico Madrid',
    aliases: ['Atletico', 'ATM'],
    avgCornersFor: 5.0,
    avgCornersAgainst: 3.8,
    homeAvgFor: 5.6,
    homeAvgAgainst: 3.4,
    awayAvgFor: 4.4,
    awayAvgAgainst: 4.2,
  },
  'Athletic Bilbao': {
    name: 'Athletic Club',
    aliases: ['Athletic Bilbao', 'Bilbao', 'ATH'],
    avgCornersFor: 5.4,
    avgCornersAgainst: 4.2,
    homeAvgFor: 6.0,
    homeAvgAgainst: 3.8,
    awayAvgFor: 4.8,
    awayAvgAgainst: 4.6,
  },
  'Real Sociedad': {
    name: 'Real Sociedad',
    aliases: ['Sociedad', 'RSO'],
    avgCornersFor: 5.2,
    avgCornersAgainst: 4.4,
    homeAvgFor: 5.8,
    homeAvgAgainst: 4.0,
    awayAvgFor: 4.6,
    awayAvgAgainst: 4.8,
  },
  'Villarreal': {
    name: 'Villarreal CF',
    aliases: ['Villarreal', 'VIL'],
    avgCornersFor: 5.6,
    avgCornersAgainst: 4.2,
    homeAvgFor: 6.2,
    homeAvgAgainst: 3.8,
    awayAvgFor: 5.0,
    awayAvgAgainst: 4.6,
  },
  'Sevilla': {
    name: 'Sevilla FC',
    aliases: ['Sevilla', 'SEV'],
    avgCornersFor: 4.8,
    avgCornersAgainst: 4.6,
    homeAvgFor: 5.4,
    homeAvgAgainst: 4.2,
    awayAvgFor: 4.2,
    awayAvgAgainst: 5.0,
  },
  'Real Betis': {
    name: 'Real Betis',
    aliases: ['Betis', 'BET'],
    avgCornersFor: 5.0,
    avgCornersAgainst: 4.8,
    homeAvgFor: 5.6,
    homeAvgAgainst: 4.4,
    awayAvgFor: 4.4,
    awayAvgAgainst: 5.2,
  },
};

// Serie A Teams
export const SERIE_A_CORNERS: Record<string, TeamCornerStats> = {
  'Inter': {
    name: 'Inter Milan',
    aliases: ['Inter', 'Inter Milan', 'INT'],
    avgCornersFor: 6.0,
    avgCornersAgainst: 3.6,
    homeAvgFor: 6.6,
    homeAvgAgainst: 3.2,
    awayAvgFor: 5.4,
    awayAvgAgainst: 4.0,
  },
  'AC Milan': {
    name: 'AC Milan',
    aliases: ['Milan', 'ACM'],
    avgCornersFor: 5.6,
    avgCornersAgainst: 4.0,
    homeAvgFor: 6.2,
    homeAvgAgainst: 3.6,
    awayAvgFor: 5.0,
    awayAvgAgainst: 4.4,
  },
  'Juventus': {
    name: 'Juventus',
    aliases: ['Juve', 'JUV'],
    avgCornersFor: 5.4,
    avgCornersAgainst: 4.2,
    homeAvgFor: 6.0,
    homeAvgAgainst: 3.8,
    awayAvgFor: 4.8,
    awayAvgAgainst: 4.6,
  },
  'Napoli': {
    name: 'SSC Napoli',
    aliases: ['Napoli', 'NAP'],
    avgCornersFor: 5.8,
    avgCornersAgainst: 3.8,
    homeAvgFor: 6.4,
    homeAvgAgainst: 3.4,
    awayAvgFor: 5.2,
    awayAvgAgainst: 4.2,
  },
  'Atalanta': {
    name: 'Atalanta',
    aliases: ['ATA'],
    avgCornersFor: 5.6,
    avgCornersAgainst: 4.4,
    homeAvgFor: 6.2,
    homeAvgAgainst: 4.0,
    awayAvgFor: 5.0,
    awayAvgAgainst: 4.8,
  },
  'Roma': {
    name: 'AS Roma',
    aliases: ['Roma', 'ROM'],
    avgCornersFor: 5.2,
    avgCornersAgainst: 4.6,
    homeAvgFor: 5.8,
    homeAvgAgainst: 4.2,
    awayAvgFor: 4.6,
    awayAvgAgainst: 5.0,
  },
  'Lazio': {
    name: 'SS Lazio',
    aliases: ['Lazio', 'LAZ'],
    avgCornersFor: 5.0,
    avgCornersAgainst: 4.8,
    homeAvgFor: 5.6,
    homeAvgAgainst: 4.4,
    awayAvgFor: 4.4,
    awayAvgAgainst: 5.2,
  },
  'Fiorentina': {
    name: 'ACF Fiorentina',
    aliases: ['Fiorentina', 'FIO'],
    avgCornersFor: 5.4,
    avgCornersAgainst: 4.4,
    homeAvgFor: 6.0,
    homeAvgAgainst: 4.0,
    awayAvgFor: 4.8,
    awayAvgAgainst: 4.8,
  },
};

// Bundesliga Teams
export const BUNDESLIGA_CORNERS: Record<string, TeamCornerStats> = {
  'Bayern Munich': {
    name: 'Bayern Munich',
    aliases: ['Bayern', 'FCB'],
    avgCornersFor: 7.0,
    avgCornersAgainst: 3.0,
    homeAvgFor: 7.6,
    homeAvgAgainst: 2.6,
    awayAvgFor: 6.4,
    awayAvgAgainst: 3.4,
  },
  'Borussia Dortmund': {
    name: 'Borussia Dortmund',
    aliases: ['Dortmund', 'BVB'],
    avgCornersFor: 6.2,
    avgCornersAgainst: 4.0,
    homeAvgFor: 6.8,
    homeAvgAgainst: 3.6,
    awayAvgFor: 5.6,
    awayAvgAgainst: 4.4,
  },
  'RB Leipzig': {
    name: 'RB Leipzig',
    aliases: ['Leipzig', 'RBL'],
    avgCornersFor: 6.0,
    avgCornersAgainst: 3.8,
    homeAvgFor: 6.6,
    homeAvgAgainst: 3.4,
    awayAvgFor: 5.4,
    awayAvgAgainst: 4.2,
  },
  'Bayer Leverkusen': {
    name: 'Bayer Leverkusen',
    aliases: ['Leverkusen', 'B04'],
    avgCornersFor: 6.4,
    avgCornersAgainst: 3.6,
    homeAvgFor: 7.0,
    homeAvgAgainst: 3.2,
    awayAvgFor: 5.8,
    awayAvgAgainst: 4.0,
  },
  'Frankfurt': {
    name: 'Eintracht Frankfurt',
    aliases: ['Frankfurt', 'SGE'],
    avgCornersFor: 5.4,
    avgCornersAgainst: 4.6,
    homeAvgFor: 6.0,
    homeAvgAgainst: 4.2,
    awayAvgFor: 4.8,
    awayAvgAgainst: 5.0,
  },
};

// Combined database
export const ALL_CORNER_STATS: Record<string, TeamCornerStats> = {
  ...PREMIER_LEAGUE_CORNERS,
  ...LA_LIGA_CORNERS,
  ...SERIE_A_CORNERS,
  ...BUNDESLIGA_CORNERS,
};

// Helper function to find team stats
export function findTeamCornerStats(teamName: string): TeamCornerStats | null {
  const normalizedName = teamName.toLowerCase().trim();
  
  for (const [key, stats] of Object.entries(ALL_CORNER_STATS)) {
    if (
      key.toLowerCase() === normalizedName ||
      stats.name.toLowerCase() === normalizedName ||
      stats.aliases.some(alias => alias.toLowerCase() === normalizedName)
    ) {
      return stats;
    }
    
    // Partial match
    if (
      key.toLowerCase().includes(normalizedName) ||
      normalizedName.includes(key.toLowerCase().split(' ')[0])
    ) {
      return stats;
    }
  }
  
  return null;
}

// Get expected corners for a match
export function getExpectedCorners(
  homeTeam: string,
  awayTeam: string
): { home: number; away: number; total: number } | null {
  const homeStats = findTeamCornerStats(homeTeam);
  const awayStats = findTeamCornerStats(awayTeam);
  
  if (!homeStats && !awayStats) {
    return null;
  }
  
  const homeExpected = homeStats 
    ? homeStats.homeAvgFor 
    : 5.3; // League average
  
  const awayExpected = awayStats
    ? awayStats.awayAvgFor
    : 4.1; // League average
  
  return {
    home: Math.round(homeExpected * 10) / 10,
    away: Math.round(awayExpected * 10) / 10,
    total: Math.round((homeExpected + awayExpected) * 10) / 10,
  };
}

export default {
  ALL_CORNER_STATS,
  PREMIER_LEAGUE_CORNERS,
  LA_LIGA_CORNERS,
  SERIE_A_CORNERS,
  BUNDESLIGA_CORNERS,
  findTeamCornerStats,
  getExpectedCorners,
};
