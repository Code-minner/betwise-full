# BetWise - Smart Sports Predictions

AI-powered sports betting predictions for Football and Basketball using real statistics from API-Sports.

## Features

- **Real Data**: Fetches live statistics from API-Sports
- **Statistical Analysis**: Poisson distributions and probability models
- **Confidence Scoring**: Calibrated confidence scores (70% confidence ≈ 70% hit rate)
- **Edge Detection**: Finds value vs bookmaker implied probabilities
- **Performance Tracking**: Track prediction accuracy over time

## Sports Covered

- ⚽ **Football**: Corner predictions, goal totals, BTTS
- 🏀 **Basketball**: Total points, team totals

## Tech Stack

- **Framework**: Next.js 14 (App Router)
- **Styling**: Tailwind CSS
- **Database**: Supabase (PostgreSQL)
- **APIs**: API-Sports for stats, Groq for AI analysis

---

## Quick Start

### 1. Clone and Install

```bash
git clone <your-repo>
cd betwise
npm install
```

### 2. Set Up Environment

Copy `.env.example` to `.env.local` and fill in your keys:

```bash
cp .env.example .env.local
```

Required keys:
- `SPORTS_API_KEY` - Get from [API-Sports](https://www.api-football.com/)
- `NEXT_PUBLIC_SUPABASE_URL` - Your Supabase project URL
- `NEXT_PUBLIC_SUPABASE_ANON_KEY` - Your Supabase anon key

### 3. Set Up Database

1. Go to your Supabase dashboard
2. Open SQL Editor
3. Run the contents of `database/schema.sql`

### 4. Run Development Server

```bash
npm run dev
```

Open [http://localhost:3000](http://localhost:3000)

---

## Project Structure

```
betwise/
├── app/                    # Next.js App Router
│   ├── page.tsx           # Home page
│   ├── football/          # Football predictions
│   ├── basketball/        # Basketball predictions
│   ├── history/           # Prediction history
│   ├── stats/             # Performance stats
│   └── api/               # API routes
│       ├── football/
│       ├── basketball/
│       ├── predictions/
│       └── stats/
│
├── lib/                    # Core logic
│   ├── types.ts           # Unified types
│   ├── analysis.ts        # Core analysis engine
│   ├── api.ts             # API-Sports client
│   ├── supabase.ts        # Database operations
│   ├── football.ts        # Football analyzer
│   └── basketball.ts      # Basketball analyzer
│
└── database/
    └── schema.sql         # Supabase schema
```

---

## How It Works

### 1. Data Fetching

The system fetches real statistics from API-Sports:
- Team form (last 5 games)
- Goals for/against averages
- Corner statistics
- League standings

### 2. Probability Calculation

Uses Poisson distribution for discrete events:

```javascript
// Expected corners for home team = 5.5
// Probability of Under 6.5: P(X < 6.5) ≈ 65%
```

### 3. Confidence Scoring

Confidence is calculated from multiple factors:
- **Data Quality** (25%): How much real data we have
- **Sample Size** (15%): Games played this season
- **Probability** (20%): How extreme our prediction is
- **Edge Size** (15%): Difference vs bookmaker odds
- **Form** (10%): Recent performance trends
- **Consistency** (10%): How stable the stats are
- **Market Efficiency** (5%): How beatable is this market

### 4. Value Detection

```
Edge = Our Probability - Implied Probability

If Edge > 0: We found value
If Edge < 0: Bookmaker has better odds
```

---

## API Endpoints

| Endpoint | Method | Description |
|----------|--------|-------------|
| `/api/football/analyze` | GET | Get football predictions |
| `/api/basketball/analyze` | GET | Get basketball predictions |
| `/api/predictions` | GET | Get prediction history |
| `/api/predictions` | POST | Save a prediction |
| `/api/predictions` | PATCH | Settle a prediction |
| `/api/stats` | GET | Get performance stats |

---

## Configuration

### API Limits

- **API-Sports**: 100 requests/day (free tier)
- Responses are cached for 30 minutes

### Confidence Thresholds

```typescript
// lib/types.ts
MIN_CONFIDENCE_TO_SHOW: 35,  // Hide predictions below this
MAX_CONFIDENCE: 88,           // Cap confidence at this level
```

### Risk Levels

| Confidence | Risk Level |
|------------|------------|
| 72%+ | LOW |
| 60-71% | MEDIUM |
| 48-59% | HIGH |
| <48% | VERY_HIGH |

---

## Adding New Sports

1. Create a new analyzer in `lib/`:

```typescript
// lib/tennis.ts
export async function analyzeTennisMatch(match: TennisMatch) {
  // Your analysis logic
}
```

2. Add types to `lib/types.ts`

3. Create API route in `app/api/tennis/`

4. Create page in `app/tennis/`

---

## Troubleshooting

### "No fixtures found"

- Check your API key is valid
- API-Sports may have reached daily limit
- Try refreshing later

### "Failed to connect to server"

- Make sure Next.js dev server is running
- Check Supabase credentials are correct

### Predictions not saving

- Ensure database schema is set up
- Check Supabase Row Level Security policies

---

## Disclaimer

⚠️ **For educational purposes only**

This system provides predictions based on statistical analysis. It does not guarantee results. Gambling involves risk. Please bet responsibly.

---

## License

MIT
