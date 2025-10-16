-- =============================================================================
-- JWT Session Management Tables
-- =============================================================================
-- This migration adds tables for JWT-based session management
-- that integrates with the existing OAuth infrastructure

-- JWT Sessions table
CREATE TABLE IF NOT EXISTS jwt_sessions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id VARCHAR(32) NOT NULL UNIQUE,
  user_id UUID NOT NULL,
  email VARCHAR(255) NOT NULL,
  name VARCHAR(255) NOT NULL,
  picture TEXT,
  provider VARCHAR(50) NOT NULL DEFAULT 'google',
  scope TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  expires_at TIMESTAMPTZ NOT NULL,
  last_accessed_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  ip_address INET,
  user_agent TEXT,
  
  -- Constraints
  CONSTRAINT jwt_sessions_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE,
  CONSTRAINT jwt_sessions_expires_at_check CHECK (expires_at > created_at),
  CONSTRAINT jwt_sessions_session_id_check CHECK (LENGTH(session_id) = 32)
);

-- JWT Refresh Tokens table (encrypted storage)
CREATE TABLE IF NOT EXISTS jwt_refresh_tokens (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL,
  session_id VARCHAR(32) NOT NULL,
  encrypted_token TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  expires_at TIMESTAMPTZ NOT NULL,
  
  -- Constraints
  CONSTRAINT jwt_refresh_tokens_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE,
  CONSTRAINT jwt_refresh_tokens_session_id_fkey FOREIGN KEY (session_id) REFERENCES jwt_sessions(session_id) ON DELETE CASCADE,
  CONSTRAINT jwt_refresh_tokens_expires_at_check CHECK (expires_at > created_at),
  
  -- Unique constraint to ensure one refresh token per session
  UNIQUE(user_id, session_id)
);

-- =============================================================================
-- Indexes for Performance
-- =============================================================================

-- JWT Sessions indexes
CREATE INDEX IF NOT EXISTS idx_jwt_sessions_session_id ON jwt_sessions(session_id);
CREATE INDEX IF NOT EXISTS idx_jwt_sessions_user_id ON jwt_sessions(user_id);
CREATE INDEX IF NOT EXISTS idx_jwt_sessions_expires_at ON jwt_sessions(expires_at);
CREATE INDEX IF NOT EXISTS idx_jwt_sessions_last_accessed ON jwt_sessions(last_accessed_at);
CREATE INDEX IF NOT EXISTS idx_jwt_sessions_provider ON jwt_sessions(provider);

-- JWT Refresh Tokens indexes
CREATE INDEX IF NOT EXISTS idx_jwt_refresh_tokens_user_id ON jwt_refresh_tokens(user_id);
CREATE INDEX IF NOT EXISTS idx_jwt_refresh_tokens_session_id ON jwt_refresh_tokens(session_id);
CREATE INDEX IF NOT EXISTS idx_jwt_refresh_tokens_expires_at ON jwt_refresh_tokens(expires_at);

-- =============================================================================
-- Row Level Security (RLS)
-- =============================================================================

-- Enable RLS on JWT tables
ALTER TABLE jwt_sessions ENABLE ROW LEVEL SECURITY;
ALTER TABLE jwt_refresh_tokens ENABLE ROW LEVEL SECURITY;

-- JWT Sessions policies
CREATE POLICY "Users can view their own sessions" ON jwt_sessions
  FOR SELECT USING (auth.uid() = user_id);

CREATE POLICY "Users can delete their own sessions" ON jwt_sessions
  FOR DELETE USING (auth.uid() = user_id);

CREATE POLICY "Service role full access to jwt_sessions" ON jwt_sessions
  FOR ALL TO service_role USING (true);

-- JWT Refresh Tokens policies (service-only access for security)
CREATE POLICY "JWT refresh tokens are service-only" ON jwt_refresh_tokens
  FOR ALL USING (false);

CREATE POLICY "Service role full access to jwt_refresh_tokens" ON jwt_refresh_tokens
  FOR ALL TO service_role USING (true);

-- =============================================================================
-- Cleanup Functions
-- =============================================================================

-- Function to clean up expired JWT sessions
CREATE OR REPLACE FUNCTION cleanup_expired_jwt_sessions()
RETURNS INTEGER
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  deleted_count INTEGER;
BEGIN
  -- Delete expired sessions (also cascades to refresh tokens)
  DELETE FROM jwt_sessions 
  WHERE expires_at < NOW();
  
  GET DIAGNOSTICS deleted_count = ROW_COUNT;
  
  RETURN deleted_count;
END;
$$;

-- Function to clean up expired JWT refresh tokens
CREATE OR REPLACE FUNCTION cleanup_expired_jwt_refresh_tokens()
RETURNS INTEGER
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  deleted_count INTEGER;
BEGIN
  -- Delete expired refresh tokens
  DELETE FROM jwt_refresh_tokens 
  WHERE expires_at < NOW();
  
  GET DIAGNOSTICS deleted_count = ROW_COUNT;
  
  RETURN deleted_count;
END;
$$;

-- Function to revoke all sessions for a user
CREATE OR REPLACE FUNCTION revoke_user_sessions(target_user_id UUID)
RETURNS INTEGER
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  deleted_count INTEGER;
BEGIN
  -- Delete all sessions for the user (cascades to refresh tokens)
  DELETE FROM jwt_sessions 
  WHERE user_id = target_user_id;
  
  GET DIAGNOSTICS deleted_count = ROW_COUNT;
  
  -- Log the revocation
  INSERT INTO oauth_audit_log (user_id, event_type, provider, metadata)
  VALUES (target_user_id, 'all_sessions_revoked', 'jwt', jsonb_build_object('revoked_count', deleted_count));
  
  RETURN deleted_count;
END;
$$;

-- Function to get session statistics
CREATE OR REPLACE FUNCTION get_jwt_session_stats()
RETURNS TABLE (
  total_sessions BIGINT,
  active_sessions BIGINT,
  expired_sessions BIGINT,
  sessions_by_provider JSONB,
  avg_session_duration INTERVAL
)
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  RETURN QUERY
  SELECT 
    COUNT(*) as total_sessions,
    COUNT(*) FILTER (WHERE expires_at > NOW()) as active_sessions,
    COUNT(*) FILTER (WHERE expires_at <= NOW()) as expired_sessions,
    jsonb_object_agg(provider, provider_count) as sessions_by_provider,
    AVG(expires_at - created_at) as avg_session_duration
  FROM (
    SELECT 
      provider,
      COUNT(*) as provider_count,
      expires_at,
      created_at
    FROM jwt_sessions 
    GROUP BY provider, expires_at, created_at
  ) provider_stats;
END;
$$;

-- =============================================================================
-- Triggers for Audit Logging
-- =============================================================================

-- Function to log JWT session events
CREATE OR REPLACE FUNCTION log_jwt_session_event()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    INSERT INTO oauth_audit_log (user_id, event_type, provider, metadata)
    VALUES (NEW.user_id, 'jwt_session_created', 'jwt', 
            jsonb_build_object('session_id', NEW.session_id, 'provider', NEW.provider));
    RETURN NEW;
  ELSIF TG_OP = 'DELETE' THEN
    INSERT INTO oauth_audit_log (user_id, event_type, provider, metadata)
    VALUES (OLD.user_id, 'jwt_session_deleted', 'jwt', 
            jsonb_build_object('session_id', OLD.session_id, 'provider', OLD.provider));
    RETURN OLD;
  END IF;
  RETURN NULL;
END;
$$;

-- Create triggers for audit logging
CREATE TRIGGER jwt_session_audit_trigger
  AFTER INSERT OR DELETE ON jwt_sessions
  FOR EACH ROW EXECUTE FUNCTION log_jwt_session_event();

-- =============================================================================
-- Scheduled Cleanup (Optional - requires pg_cron extension)
-- =============================================================================

-- Note: This requires the pg_cron extension to be enabled
-- Uncomment the following lines if you have pg_cron available:

-- Schedule cleanup to run every hour
-- SELECT cron.schedule('jwt-session-cleanup', '0 * * * *', 'SELECT cleanup_expired_jwt_sessions();');
-- SELECT cron.schedule('jwt-refresh-token-cleanup', '0 * * * *', 'SELECT cleanup_expired_jwt_refresh_tokens();');

-- =============================================================================
-- Permissions
-- =============================================================================

-- Grant permissions to service role
GRANT ALL ON jwt_sessions TO service_role;
GRANT ALL ON jwt_refresh_tokens TO service_role;

-- Grant execute permissions on functions
GRANT EXECUTE ON FUNCTION cleanup_expired_jwt_sessions() TO service_role;
GRANT EXECUTE ON FUNCTION cleanup_expired_jwt_refresh_tokens() TO service_role;
GRANT EXECUTE ON FUNCTION revoke_user_sessions(UUID) TO service_role;
GRANT EXECUTE ON FUNCTION get_jwt_session_stats() TO service_role;

-- Grant permissions to authenticated users for their own data
GRANT SELECT ON jwt_sessions TO authenticated;

-- =============================================================================
-- Example Usage and Testing
-- =============================================================================

-- Example usage:
-- SELECT cleanup_expired_jwt_sessions();
-- SELECT cleanup_expired_jwt_refresh_tokens();
-- SELECT revoke_user_sessions('user-uuid-here');
-- SELECT * FROM get_jwt_session_stats();

-- Test data (for development only - remove in production)
-- INSERT INTO jwt_sessions (session_id, user_id, email, name, provider, scope, expires_at)
-- VALUES ('test123456789012345678901234567890', auth.uid(), 'test@example.com', 'Test User', 'google', 'openid email profile', NOW() + INTERVAL '7 days');