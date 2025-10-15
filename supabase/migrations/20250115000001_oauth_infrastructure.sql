-- OAuth Infrastructure Migration
-- Creates tables for secure token storage and OAuth state management

-- =============================================================================
-- USER TOKENS TABLE
-- Stores encrypted OAuth tokens for users
-- =============================================================================

CREATE TABLE IF NOT EXISTS user_tokens (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  provider VARCHAR(50) NOT NULL CHECK (provider IN ('google')),
  encrypted_tokens TEXT NOT NULL,
  expires_at TIMESTAMP WITH TIME ZONE NOT NULL,
  scope TEXT NOT NULL DEFAULT '',
  token_type VARCHAR(20) NOT NULL DEFAULT 'Bearer',
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  
  -- Ensure one token record per user per provider
  UNIQUE(user_id, provider)
);

-- =============================================================================
-- OAUTH STATES TABLE
-- Manages OAuth state parameters for CSRF protection
-- =============================================================================

CREATE TABLE IF NOT EXISTS oauth_states (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  state_value VARCHAR(255) NOT NULL UNIQUE,
  code_verifier TEXT NOT NULL,
  redirect_uri TEXT NOT NULL,
  user_agent TEXT,
  ip_address INET,
  expires_at TIMESTAMP WITH TIME ZONE NOT NULL,
  used_at TIMESTAMP WITH TIME ZONE NULL,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  
  -- Ensure state values are unique and not reused
  CHECK (expires_at > created_at),
  CHECK (used_at IS NULL OR used_at >= created_at)
);

-- =============================================================================
-- OAUTH AUDIT LOG
-- Tracks OAuth events for security monitoring
-- =============================================================================

CREATE TABLE IF NOT EXISTS oauth_audit_log (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES users(id) ON DELETE SET NULL,
  provider VARCHAR(50) NOT NULL,
  event_type VARCHAR(50) NOT NULL CHECK (event_type IN (
    'auth_initiated',
    'auth_completed',
    'auth_failed',
    'token_refreshed',
    'token_revoked',
    'logout'
  )),
  ip_address INET,
  user_agent TEXT,
  error_code VARCHAR(100),
  error_description TEXT,
  metadata JSONB DEFAULT '{}',
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- =============================================================================
-- INDEXES FOR PERFORMANCE
-- =============================================================================

-- User tokens indexes
CREATE INDEX IF NOT EXISTS idx_user_tokens_user_id ON user_tokens(user_id);
CREATE INDEX IF NOT EXISTS idx_user_tokens_expires_at ON user_tokens(expires_at);
CREATE INDEX IF NOT EXISTS idx_user_tokens_provider ON user_tokens(provider);

-- OAuth states indexes
CREATE INDEX IF NOT EXISTS idx_oauth_states_state_value ON oauth_states(state_value);
CREATE INDEX IF NOT EXISTS idx_oauth_states_expires_at ON oauth_states(expires_at);
CREATE INDEX IF NOT EXISTS idx_oauth_states_used_at ON oauth_states(used_at) WHERE used_at IS NOT NULL;

-- Audit log indexes
CREATE INDEX IF NOT EXISTS idx_oauth_audit_log_user_id ON oauth_audit_log(user_id);
CREATE INDEX IF NOT EXISTS idx_oauth_audit_log_created_at ON oauth_audit_log(created_at);
CREATE INDEX IF NOT EXISTS idx_oauth_audit_log_event_type ON oauth_audit_log(event_type);
CREATE INDEX IF NOT EXISTS idx_oauth_audit_log_provider ON oauth_audit_log(provider);

-- =============================================================================
-- ROW LEVEL SECURITY (RLS)
-- =============================================================================

-- Enable RLS on all OAuth tables
ALTER TABLE user_tokens ENABLE ROW LEVEL SECURITY;
ALTER TABLE oauth_states ENABLE ROW LEVEL SECURITY;
ALTER TABLE oauth_audit_log ENABLE ROW LEVEL SECURITY;

-- User tokens policies
CREATE POLICY "Users can only access their own tokens" ON user_tokens
  FOR ALL USING (auth.uid() = user_id);

-- OAuth states policies (no direct user access - service only)
CREATE POLICY "OAuth states are service-only" ON oauth_states
  FOR ALL USING (false);

-- Audit log policies (users can read their own logs)
CREATE POLICY "Users can read their own audit logs" ON oauth_audit_log
  FOR SELECT USING (auth.uid() = user_id);

-- Service role policies (bypass RLS for backend operations)
CREATE POLICY "Service role full access to user_tokens" ON user_tokens
  FOR ALL TO service_role USING (true);

CREATE POLICY "Service role full access to oauth_states" ON oauth_states
  FOR ALL TO service_role USING (true);

CREATE POLICY "Service role full access to oauth_audit_log" ON oauth_audit_log
  FOR ALL TO service_role USING (true);

-- =============================================================================
-- CLEANUP FUNCTIONS
-- =============================================================================

-- Function to clean up expired OAuth states
CREATE OR REPLACE FUNCTION cleanup_expired_oauth_states()
RETURNS INTEGER
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  deleted_count INTEGER;
BEGIN
  DELETE FROM oauth_states 
  WHERE expires_at < NOW() - INTERVAL '1 hour';
  
  GET DIAGNOSTICS deleted_count = ROW_COUNT;
  
  -- Log cleanup activity
  INSERT INTO oauth_audit_log (
    provider,
    event_type,
    metadata
  ) VALUES (
    'system',
    'cleanup_expired_states',
    jsonb_build_object('deleted_count', deleted_count)
  );
  
  RETURN deleted_count;
END;
$$;

-- Function to clean up expired tokens
CREATE OR REPLACE FUNCTION cleanup_expired_tokens()
RETURNS INTEGER
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  deleted_count INTEGER;
BEGIN
  DELETE FROM user_tokens 
  WHERE expires_at < NOW() - INTERVAL '7 days';
  
  GET DIAGNOSTICS deleted_count = ROW_COUNT;
  
  -- Log cleanup activity
  INSERT INTO oauth_audit_log (
    provider,
    event_type,
    metadata
  ) VALUES (
    'system',
    'cleanup_expired_tokens',
    jsonb_build_object('deleted_count', deleted_count)
  );
  
  RETURN deleted_count;
END;
$$;

-- =============================================================================
-- SCHEDULED CLEANUP
-- =============================================================================

-- Note: These would typically be set up as cron jobs or scheduled functions
-- For now, they're available as manual functions

-- Example usage:
-- SELECT cleanup_expired_oauth_states();
-- SELECT cleanup_expired_tokens();

-- =============================================================================
-- GRANTS
-- =============================================================================

-- Grant necessary permissions to authenticated users
GRANT SELECT, INSERT, UPDATE, DELETE ON user_tokens TO authenticated;
GRANT SELECT ON oauth_audit_log TO authenticated;

-- Grant full access to service role
GRANT ALL ON user_tokens TO service_role;
GRANT ALL ON oauth_states TO service_role;
GRANT ALL ON oauth_audit_log TO service_role;

-- Grant execute permissions on cleanup functions
GRANT EXECUTE ON FUNCTION cleanup_expired_oauth_states() TO service_role;
GRANT EXECUTE ON FUNCTION cleanup_expired_tokens() TO service_role;