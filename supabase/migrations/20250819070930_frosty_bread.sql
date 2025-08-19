/*
  # Create analysis results table

  1. New Tables
    - `analysis_results`
      - `id` (uuid, primary key)
      - `user_id` (uuid, foreign key to auth.users)
      - `content` (text, the analyzed content)
      - `accuracy` (real, accuracy percentage)
      - `risk_level` (text, risk level: low/medium/high/critical)
      - `hallucinations` (jsonb, array of hallucination objects)
      - `verification_sources` (integer, number of sources checked)
      - `processing_time` (integer, processing time in milliseconds)
      - `created_at` (timestamptz, creation timestamp)

  2. Security
    - Enable RLS on `analysis_results` table
    - Add policy for users to read their own analysis results
    - Add policy for users to insert their own analysis results
*/

CREATE TABLE IF NOT EXISTS analysis_results (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  content text NOT NULL,
  accuracy real NOT NULL CHECK (accuracy >= 0 AND accuracy <= 100),
  risk_level text NOT NULL CHECK (risk_level IN ('low', 'medium', 'high', 'critical')),
  hallucinations jsonb NOT NULL DEFAULT '[]'::jsonb,
  verification_sources integer NOT NULL DEFAULT 0,
  processing_time integer NOT NULL DEFAULT 0,
  created_at timestamptz DEFAULT now()
);

-- Enable Row Level Security
ALTER TABLE analysis_results ENABLE ROW LEVEL SECURITY;

-- Policy for users to read their own analysis results
CREATE POLICY "Users can read own analysis results"
  ON analysis_results
  FOR SELECT
  TO authenticated
  USING (auth.uid() = user_id);

-- Policy for users to insert their own analysis results
CREATE POLICY "Users can insert own analysis results"
  ON analysis_results
  FOR INSERT
  TO authenticated
  WITH CHECK (auth.uid() = user_id);

-- Create index for better query performance
CREATE INDEX IF NOT EXISTS idx_analysis_results_user_id_created_at 
  ON analysis_results(user_id, created_at DESC);