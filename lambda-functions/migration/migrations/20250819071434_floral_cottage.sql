/*
  # Create scheduled_scans table

  1. New Tables
    - `scheduled_scans`
      - `id` (uuid, primary key)
      - `user_id` (uuid, foreign key to auth.users)
      - `name` (text, scan name)
      - `description` (text, scan description)
      - `frequency` (text, e.g., 'hourly', 'daily', 'weekly', 'monthly')
      - `time` (text, e.g., '09:00')
      - `sources` (jsonb, array of custom sources)
      - `google_drive_files` (jsonb, array of GoogleDriveFile objects)
      - `enabled` (boolean, default true)
      - `last_run` (timestamp, nullable)
      - `next_run` (timestamp, required)
      - `status` (text, default 'active')
      - `results` (jsonb, nullable, summary of last scan)
      - `created_at` (timestamp, default now())

  2. Security
    - Enable RLS on `scheduled_scans` table
    - Add policies for authenticated users to manage their own scans

  3. Indexes
    - Add index on user_id and next_run for efficient queries
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

-- Create RLS policies
CREATE POLICY "Users can view their own scheduled scans"
ON public.scheduled_scans FOR SELECT
TO authenticated
USING (auth.uid() = user_id);

CREATE POLICY "Users can create their own scheduled scans"
ON public.scheduled_scans FOR INSERT
TO authenticated
WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update their own scheduled scans"
ON public.scheduled_scans FOR UPDATE
TO authenticated
USING (auth.uid() = user_id);

CREATE POLICY "Users can delete their own scheduled scans"
ON public.scheduled_scans FOR DELETE
TO authenticated
USING (auth.uid() = user_id);

-- Create index for efficient queries
CREATE INDEX IF NOT EXISTS idx_scheduled_scans_user_id_next_run
ON public.scheduled_scans (user_id, next_run);

-- Create index for cron job queries
CREATE INDEX IF NOT EXISTS idx_scheduled_scans_enabled_next_run
ON public.scheduled_scans (enabled, next_run) WHERE enabled = true;