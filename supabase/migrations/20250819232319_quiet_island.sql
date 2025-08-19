/*
  # Create scheduled_scans table for automated content monitoring

  1. New Tables
    - `scheduled_scans`
      - `id` (uuid, primary key)
      - `user_id` (uuid, foreign key to auth.users)
      - `name` (text, scan name)
      - `description` (text, scan description)
      - `frequency` (text, scan frequency: hourly/daily/weekly/monthly)
      - `time` (text, time to run scan)
      - `sources` (jsonb, array of custom content sources)
      - `google_drive_files` (jsonb, array of Google Drive file objects)
      - `enabled` (boolean, whether scan is active)
      - `last_run` (timestamptz, when scan last executed)
      - `next_run` (timestamptz, when scan should run next)
      - `status` (text, current scan status)
      - `results` (jsonb, last scan results)
      - `created_at` (timestamptz, when scan was created)

  2. Security
    - Enable RLS on `scheduled_scans` table
    - Add policies for users to manage their own scans only
    - Foreign key constraint to auth.users with CASCADE delete

  3. Performance
    - Index on user_id and next_run for efficient cron queries
    - Index on enabled and next_run for scheduler optimization
    - Constraints to validate frequency and status values
*/

-- Create the scheduled_scans table
CREATE TABLE IF NOT EXISTS public.scheduled_scans (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id uuid NOT NULL,
    name text NOT NULL,
    description text,
    frequency text NOT NULL CHECK (frequency IN ('hourly', 'daily', 'weekly', 'monthly')),
    time text NOT NULL,
    sources jsonb DEFAULT '[]'::jsonb,
    google_drive_files jsonb DEFAULT '[]'::jsonb,
    enabled boolean DEFAULT true,
    last_run timestamp with time zone,
    next_run timestamp with time zone NOT NULL,
    status text DEFAULT 'active' CHECK (status IN ('active', 'paused', 'error', 'completed')),
    results jsonb,
    created_at timestamp with time zone DEFAULT now()
);

-- Add foreign key constraint to link with auth.users
ALTER TABLE public.scheduled_scans 
ADD CONSTRAINT fk_scheduled_scans_user_id 
FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;

-- Enable Row Level Security
ALTER TABLE public.scheduled_scans ENABLE ROW LEVEL SECURITY;

-- RLS Policies: Users can only manage their own scheduled scans
CREATE POLICY "Users can view their own scheduled scans"
    ON public.scheduled_scans
    FOR SELECT
    TO authenticated
    USING (auth.uid() = user_id);

CREATE POLICY "Users can create their own scheduled scans"
    ON public.scheduled_scans
    FOR INSERT
    TO authenticated
    WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update their own scheduled scans"
    ON public.scheduled_scans
    FOR UPDATE
    TO authenticated
    USING (auth.uid() = user_id);

CREATE POLICY "Users can delete their own scheduled scans"
    ON public.scheduled_scans
    FOR DELETE
    TO authenticated
    USING (auth.uid() = user_id);

-- Performance indexes
CREATE INDEX IF NOT EXISTS idx_scheduled_scans_user_id_next_run
    ON public.scheduled_scans (user_id, next_run);

CREATE INDEX IF NOT EXISTS idx_scheduled_scans_enabled_next_run
    ON public.scheduled_scans (enabled, next_run)
    WHERE enabled = true;