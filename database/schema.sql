-- BetWise Database Schema for Supabase
-- Run this in your Supabase SQL Editor

-- Enable UUID extension
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- Drop existing tables (for clean setup)
DROP TABLE IF EXISTS predictions CASCADE;
DROP TABLE IF EXISTS matches CASCADE;
DROP TABLE IF EXISTS entities CASCADE;

-- Entities table (teams/players)
CREATE TABLE entities (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  external_id VARCHAR(50) NOT NULL,
  sport VARCHAR(20) NOT NULL CHECK (sport IN ('FOOTBALL', 'BASKETBALL', 'TENNIS')),
  name VARCHAR(100) NOT NULL,
  league VARCHAR(100),
  country VARCHAR(50),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(external_id, sport)
);

-- Matches table
CREATE TABLE matches (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  external_id VARCHAR(50) NOT NULL,
  sport VARCHAR(20) NOT NULL CHECK (sport IN ('FOOTBALL', 'BASKETBALL', 'TENNIS')),
  home_name VARCHAR(100) NOT NULL,
  away_name VARCHAR(100) NOT NULL,
  league_id INTEGER,
  league_name VARCHAR(100) NOT NULL,
  venue VARCHAR(200),
  kickoff TIMESTAMPTZ NOT NULL,
  status VARCHAR(20) DEFAULT 'SCHEDULED',
  result JSONB,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(external_id, sport)
);

-- Predictions table
CREATE TABLE predictions (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  match_id UUID REFERENCES matches(id) ON DELETE CASCADE,
  sport VARCHAR(20) NOT NULL CHECK (sport IN ('FOOTBALL', 'BASKETBALL', 'TENNIS')),
  market VARCHAR(50) NOT NULL,
  pick VARCHAR(200) NOT NULL,
  line DECIMAL(5,2),
  odds DECIMAL(6,3) NOT NULL,
  calculated_probability DECIMAL(5,4) NOT NULL,
  implied_probability DECIMAL(5,4) NOT NULL,
  edge DECIMAL(5,4) NOT NULL,
  confidence INTEGER NOT NULL CHECK (confidence >= 0 AND confidence <= 100),
  data_quality VARCHAR(10) NOT NULL,
  risk_level VARCHAR(10) NOT NULL,
  value_rating VARCHAR(15) NOT NULL,
  factors JSONB DEFAULT '{}',
  warnings TEXT[] DEFAULT '{}',
  positives TEXT[] DEFAULT '{}',
  reasoning TEXT[] DEFAULT '{}',
  match_info JSONB,
  is_settled BOOLEAN DEFAULT FALSE,
  is_correct BOOLEAN,
  actual_result VARCHAR(200),
  settled_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Indexes
CREATE INDEX idx_predictions_sport ON predictions(sport);
CREATE INDEX idx_predictions_settled ON predictions(is_settled);
CREATE INDEX idx_predictions_created ON predictions(created_at DESC);
CREATE INDEX idx_matches_kickoff ON matches(kickoff);

-- Enable Row Level Security
ALTER TABLE entities ENABLE ROW LEVEL SECURITY;
ALTER TABLE matches ENABLE ROW LEVEL SECURITY;
ALTER TABLE predictions ENABLE ROW LEVEL SECURITY;

-- Public access policies (adjust for your needs)
CREATE POLICY "Public read entities" ON entities FOR SELECT USING (true);
CREATE POLICY "Public read matches" ON matches FOR SELECT USING (true);
CREATE POLICY "Public read predictions" ON predictions FOR SELECT USING (true);
CREATE POLICY "Public insert entities" ON entities FOR INSERT WITH CHECK (true);
CREATE POLICY "Public insert matches" ON matches FOR INSERT WITH CHECK (true);
CREATE POLICY "Public insert predictions" ON predictions FOR INSERT WITH CHECK (true);
CREATE POLICY "Public update predictions" ON predictions FOR UPDATE USING (true);

-- Views for analytics
CREATE OR REPLACE VIEW prediction_stats AS
SELECT 
  sport,
  market,
  COUNT(*) as total,
  COUNT(*) FILTER (WHERE is_settled = TRUE) as settled,
  COUNT(*) FILTER (WHERE is_correct = TRUE) as correct,
  ROUND(100.0 * COUNT(*) FILTER (WHERE is_correct = TRUE) / NULLIF(COUNT(*) FILTER (WHERE is_settled = TRUE), 0), 1) as hit_rate
FROM predictions
GROUP BY sport, market;

CREATE OR REPLACE VIEW confidence_calibration AS
SELECT 
  sport,
  CASE 
    WHEN confidence >= 70 THEN 'HIGH'
    WHEN confidence >= 50 THEN 'MEDIUM'
    ELSE 'LOW'
  END as tier,
  COUNT(*) as total,
  COUNT(*) FILTER (WHERE is_correct = TRUE) as correct,
  ROUND(100.0 * COUNT(*) FILTER (WHERE is_correct = TRUE) / NULLIF(COUNT(*) FILTER (WHERE is_settled = TRUE), 0), 1) as hit_rate
FROM predictions
WHERE is_settled = TRUE
GROUP BY sport, tier;

-- Done!
SELECT 'Schema created successfully!' as status;
