/*
  # Create missing database tables and functions

  1. New Tables
    - `users` - User profiles and authentication data
    - `scan_executor_logs` - Logging for scheduled scan execution
  
  2. Functions
    - `uid()` - Helper function to get current user ID
    - Scan executor functions for automated processing
  
  3. Security
    - Enable RLS on all tables
    - Add appropriate policies for user access
*/

-- Create users table to store user profiles
CREATE TABLE IF NOT EXISTS users (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  email text UNIQUE NOT NULL,
  name text NOT NULL,
  avatar_url text,
  role_id text NOT NULL DEFAULT 'viewer',
  department text NOT NULL DEFAULT 'General',
  status text NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'inactive', 'pending')),
  last_active timestamptz DEFAULT now(),
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

-- Enable RLS on users table
ALTER TABLE users ENABLE ROW LEVEL SECURITY;

-- Create policies for users table
CREATE POLICY "Users can read own profile"
  ON users
  FOR SELECT
  TO authenticated
  USING (auth.uid() = id);

CREATE POLICY "Users can update own profile"
  ON users
  FOR UPDATE
  TO authenticated
  USING (auth.uid() = id);

CREATE POLICY "Admins can read all users"
  ON users
  FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM users 
      WHERE id = auth.uid() 
      AND role_id = 'admin'
    )
  );

-- Create scan_executor_logs table for monitoring
CREATE TABLE IF NOT EXISTS scan_executor_logs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  execution_id text NOT NULL,
  status text NOT NULL CHECK (status IN ('started', 'completed', 'failed')),
  scans_processed integer DEFAULT 0,
  scans_successful integer DEFAULT 0,
  scans_failed integer DEFAULT 0,
  execution_time_ms integer DEFAULT 0,
  error_message text,
  details jsonb DEFAULT '{}',
  created_at timestamptz DEFAULT now()
);

-- Enable RLS on scan_executor_logs
ALTER TABLE scan_executor_logs ENABLE ROW LEVEL SECURITY;

-- Create policy for scan_executor_logs (admin only)
CREATE POLICY "Admins can read scan logs"
  ON scan_executor_logs
  FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM users 
      WHERE id = auth.uid() 
      AND role_id = 'admin'
    )
  );

-- Create helper function to get current user ID
CREATE OR REPLACE FUNCTION uid()
RETURNS uuid
LANGUAGE sql
STABLE
AS $$
  SELECT auth.uid();
$$;

-- Create function to ensure user profile exists
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  INSERT INTO public.users (id, email, name)
  VALUES (
    NEW.id,
    NEW.email,
    COALESCE(NEW.raw_user_meta_data->>'full_name', NEW.raw_user_meta_data->>'name', split_part(NEW.email, '@', 1))
  )
  ON CONFLICT (id) DO UPDATE SET
    email = EXCLUDED.email,
    name = COALESCE(EXCLUDED.name, users.name),
    updated_at = now();
  
  RETURN NEW;
END;
$$;

-- Create trigger to automatically create user profile on signup
DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- Update existing scheduled_scans table to ensure proper foreign key
DO $$
BEGIN
  -- Add foreign key constraint if it doesn't exist
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.table_constraints 
    WHERE constraint_name = 'fk_scheduled_scans_user_id'
    AND table_name = 'scheduled_scans'
  ) THEN
    ALTER TABLE scheduled_scans 
    ADD CONSTRAINT fk_scheduled_scans_user_id 
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE;
  END IF;
END $$;

-- Update existing analysis_results table to ensure proper foreign key
DO $$
BEGIN
  -- Add foreign key constraint if it doesn't exist
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.table_constraints 
    WHERE constraint_name = 'analysis_results_user_id_fkey'
    AND table_name = 'analysis_results'
  ) THEN
    ALTER TABLE analysis_results 
    ADD CONSTRAINT analysis_results_user_id_fkey 
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE;
  END IF;
END $$;

-- Create indexes for better performance
CREATE INDEX IF NOT EXISTS idx_users_email ON users(email);
CREATE INDEX IF NOT EXISTS idx_users_role_status ON users(role_id, status);
CREATE INDEX IF NOT EXISTS idx_scan_executor_logs_created_at ON scan_executor_logs(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_scan_executor_logs_status ON scan_executor_logs(status);

-- Grant necessary permissions
GRANT USAGE ON SCHEMA public TO authenticated;
GRANT ALL ON ALL TABLES IN SCHEMA public TO authenticated;
GRANT ALL ON ALL SEQUENCES IN SCHEMA public TO authenticated;
GRANT EXECUTE ON ALL FUNCTIONS IN SCHEMA public TO authenticated;