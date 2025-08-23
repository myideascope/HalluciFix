# Manual Database Migration Steps

## Step 1: Check Current Database State

First, connect to your Supabase database and check what tables exist:

```sql
-- Check existing tables
SELECT table_name 
FROM information_schema.tables 
WHERE table_schema = 'public';

-- Check if migration tracking table exists
SELECT * FROM information_schema.tables 
WHERE table_name = 'schema_migrations' AND table_schema = 'public';
```

## Step 2: Check Migration Status

If you have migration tracking, check which migrations have been applied:

```sql
-- If schema_migrations table exists
SELECT * FROM schema_migrations ORDER BY version;
```

## Step 3: Required Tables for HalluciFix

Based on the application code, you need these tables:

### 3.1 Users Table
```sql
-- Create users table if it doesn't exist
CREATE TABLE IF NOT EXISTS users (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  email text UNIQUE NOT NULL,
  name text NOT NULL,
  avatar_url text,
  role_id text DEFAULT 'viewer'::text NOT NULL,
  department text DEFAULT 'General'::text NOT NULL,
  status text DEFAULT 'active'::text NOT NULL,
  last_active timestamptz DEFAULT now(),
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

-- Enable RLS
ALTER TABLE users ENABLE ROW LEVEL SECURITY;

-- Create policies
CREATE POLICY "Users can read own profile" ON users
  FOR SELECT TO authenticated
  USING (auth.uid() = id);

CREATE POLICY "Users can update own profile" ON users
  FOR UPDATE TO authenticated
  USING (auth.uid() = id);

CREATE POLICY "Admins can read all users" ON users
  FOR SELECT TO authenticated
  USING (EXISTS (
    SELECT 1 FROM users users_1
    WHERE users_1.id = auth.uid() AND users_1.role_id = 'admin'
  ));

-- Add constraints
ALTER TABLE users ADD CONSTRAINT users_status_check 
  CHECK (status = ANY (ARRAY['active'::text, 'inactive'::text, 'pending'::text]));

-- Create indexes
CREATE INDEX IF NOT EXISTS idx_users_email ON users (email);
CREATE INDEX IF NOT EXISTS idx_users_role_status ON users (role_id, status);
```

### 3.2 Analysis Results Table
```sql
-- Create analysis_results table if it doesn't exist
CREATE TABLE IF NOT EXISTS analysis_results (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  content text NOT NULL,
  accuracy real NOT NULL,
  risk_level text NOT NULL,
  hallucinations jsonb DEFAULT '[]'::jsonb NOT NULL,
  verification_sources integer DEFAULT 0 NOT NULL,
  processing_time integer DEFAULT 0 NOT NULL,
  created_at timestamptz DEFAULT now(),
  analysis_type text DEFAULT 'single'::text,
  batch_id text,
  scan_id text,
  filename text,
  full_content text
);

-- Enable RLS
ALTER TABLE analysis_results ENABLE ROW LEVEL SECURITY;

-- Create policies
CREATE POLICY "Users can read own analysis results" ON analysis_results
  FOR SELECT TO authenticated
  USING (auth.uid() = user_id);

CREATE POLICY "Users can insert own analysis results" ON analysis_results
  FOR INSERT TO authenticated
  WITH CHECK (auth.uid() = user_id);

-- Add constraints
ALTER TABLE analysis_results ADD CONSTRAINT analysis_results_accuracy_check 
  CHECK (accuracy >= 0::double precision AND accuracy <= 100::double precision);

ALTER TABLE analysis_results ADD CONSTRAINT analysis_results_risk_level_check 
  CHECK (risk_level = ANY (ARRAY['low'::text, 'medium'::text, 'high'::text, 'critical'::text]));

ALTER TABLE analysis_results ADD CONSTRAINT analysis_results_analysis_type_check 
  CHECK (analysis_type = ANY (ARRAY['single'::text, 'batch'::text, 'scheduled'::text]));

-- Create indexes
CREATE INDEX IF NOT EXISTS idx_analysis_results_user_id_created_at ON analysis_results (user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_analysis_results_analysis_type ON analysis_results (analysis_type);
CREATE INDEX IF NOT EXISTS idx_analysis_results_batch_id ON analysis_results (batch_id) WHERE batch_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_analysis_results_scan_id ON analysis_results (scan_id) WHERE scan_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_analysis_results_filename ON analysis_results (filename) WHERE filename IS NOT NULL;
```

### 3.3 Scheduled Scans Table
```sql
-- Create scheduled_scans table if it doesn't exist
CREATE TABLE IF NOT EXISTS scheduled_scans (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  name text NOT NULL,
  description text,
  frequency text NOT NULL,
  time text NOT NULL,
  sources jsonb DEFAULT '[]'::jsonb,
  google_drive_files jsonb DEFAULT '[]'::jsonb,
  enabled boolean DEFAULT true,
  last_run timestamptz,
  next_run timestamptz NOT NULL,
  status text DEFAULT 'active'::text,
  results jsonb,
  created_at timestamptz DEFAULT now()
);

-- Enable RLS
ALTER TABLE scheduled_scans ENABLE ROW LEVEL SECURITY;

-- Create policies
CREATE POLICY "Users can view their own scheduled scans" ON scheduled_scans
  FOR SELECT TO authenticated
  USING (auth.uid() = user_id);

CREATE POLICY "Users can create their own scheduled scans" ON scheduled_scans
  FOR INSERT TO authenticated
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update their own scheduled scans" ON scheduled_scans
  FOR UPDATE TO authenticated
  USING (auth.uid() = user_id);

CREATE POLICY "Users can delete their own scheduled scans" ON scheduled_scans
  FOR DELETE TO authenticated
  USING (auth.uid() = user_id);

-- Add constraints
ALTER TABLE scheduled_scans ADD CONSTRAINT scheduled_scans_frequency_check 
  CHECK (frequency = ANY (ARRAY['hourly'::text, 'daily'::text, 'weekly'::text, 'monthly'::text]));

ALTER TABLE scheduled_scans ADD CONSTRAINT scheduled_scans_status_check 
  CHECK (status = ANY (ARRAY['active'::text, 'paused'::text, 'error'::text, 'completed'::text]));

-- Create indexes
CREATE INDEX IF NOT EXISTS idx_scheduled_scans_user_id_next_run ON scheduled_scans (user_id, next_run);
CREATE INDEX IF NOT EXISTS idx_scheduled_scans_enabled_next_run ON scheduled_scans (enabled, next_run) WHERE enabled = true;
```

### 3.4 Scan Executor Logs Table
```sql
-- Create scan_executor_logs table if it doesn't exist
CREATE TABLE IF NOT EXISTS scan_executor_logs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  execution_id text NOT NULL,
  status text NOT NULL,
  scans_processed integer DEFAULT 0,
  scans_successful integer DEFAULT 0,
  scans_failed integer DEFAULT 0,
  execution_time_ms integer DEFAULT 0,
  error_message text,
  details jsonb DEFAULT '{}'::jsonb,
  created_at timestamptz DEFAULT now()
);

-- Enable RLS
ALTER TABLE scan_executor_logs ENABLE ROW LEVEL SECURITY;

-- Create policies
CREATE POLICY "Admins can read scan logs" ON scan_executor_logs
  FOR SELECT TO authenticated
  USING (EXISTS (
    SELECT 1 FROM users
    WHERE users.id = auth.uid() AND users.role_id = 'admin'
  ));

-- Add constraints
ALTER TABLE scan_executor_logs ADD CONSTRAINT scan_executor_logs_status_check 
  CHECK (status = ANY (ARRAY['started'::text, 'completed'::text, 'failed'::text]));

-- Create indexes
CREATE INDEX IF NOT EXISTS idx_scan_executor_logs_created_at ON scan_executor_logs (created_at DESC);
CREATE INDEX IF NOT EXISTS idx_scan_executor_logs_status ON scan_executor_logs (status);
```

## Step 4: Verify Tables Were Created

After running the above SQL, verify all tables exist:

```sql
-- Check all required tables exist
SELECT table_name 
FROM information_schema.tables 
WHERE table_schema = 'public' 
  AND table_name IN ('users', 'analysis_results', 'scheduled_scans', 'scan_executor_logs')
ORDER BY table_name;

-- Check RLS is enabled
SELECT schemaname, tablename, rowsecurity 
FROM pg_tables 
WHERE schemaname = 'public' 
  AND tablename IN ('users', 'analysis_results', 'scheduled_scans', 'scan_executor_logs');

-- Check policies exist
SELECT schemaname, tablename, policyname, cmd 
FROM pg_policies 
WHERE schemaname = 'public'
ORDER BY tablename, policyname;
```

## Step 5: Test the Application

After implementing the database schema:

1. **Test Authentication**: Try signing up/signing in
2. **Test Analysis**: Run a content analysis
3. **Test Scheduled Scans**: Create a scheduled scan
4. **Check Data**: Verify data is being saved to the database

## Troubleshooting

If you encounter issues:

1. **Check Supabase Logs**: Go to Supabase Dashboard > Logs
2. **Verify RLS Policies**: Make sure policies allow your operations
3. **Check Foreign Keys**: Ensure auth.users table exists (created by Supabase Auth)
4. **Test Permissions**: Try operations in the Supabase SQL editor

## Migration Files Found

Based on your project, these migration files should contain the schema:
- `supabase/migrations/20250819070930_frosty_bread.sql`
- `supabase/migrations/20250819071434_floral_cottage.sql`
- `supabase/migrations/20250821013929_bitter_cell.sql`
- `supabase/migrations/20250822064333_gentle_torch.sql`
- `supabase/migrations/20250822064351_velvet_wood.sql`

You can check the content of these files and run them manually if the automatic migration failed.