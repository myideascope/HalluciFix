import React, { useState, useEffect } from 'react';
import { Shield, Monitor, Smartphone, Globe, Clock, X, RefreshCw } from 'lucide-react';
import { useAuth } from '../hooks/useAuth';
import { useToast } from '../hooks/useToast';

import { logger } from './logging';
interface SessionData {
  sessionId: string;
  userId: string;
  email: string;
  name: string;
  picture?: string;
  provider: string;
  scope: string;
  createdAt: Date;
  expiresAt: Date;
  lastAccessedAt: Date;
  ipAddress?: string;
  userAgent?: string;
}

const SessionManager: React.FC = () => {
  const { getUserSessions, revokeSession, getSessionStatus } = useAuth();
  const { showToast } = useToast();
  const [sessions, setSessions] = useState<SessionData[]>([]);
  const [sessionStatus, setSessionStatus] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [revoking, setRevoking] = useState<string | null>(null);

  useEffect(() => {
    loadSessions();
  }, [loadSessions]);

  const loadSessions = useCallback(async () => {
    try {
      setLoading(true);
      const [sessionsData, statusData] = await Promise.all([
        getUserSessions(),
        getSessionStatus()
      ]);
      
      setSessions(sessionsData);
      setSessionStatus(statusData);
    } catch (error) {
      logger.error("Failed to load sessions:", error instanceof Error ? error : new Error(String(error)));
      showToast('Failed to load session data', 'error');
    } finally {
      setLoading(false);
    }
  };

  const handleRevokeSession = async (sessionId: string) => {
    try {
      setRevoking(sessionId);
      await revokeSession(sessionId);
      showToast('Session revoked successfully', 'success');
      await loadSessions(); // Reload sessions
    } catch (error) {
      logger.error("Failed to revoke session:", error instanceof Error ? error : new Error(String(error)));
      showToast('Failed to revoke session', 'error');
    } finally {
      setRevoking(null);
    }
  };

  const getDeviceIcon = (userAgent?: string) => {
    if (!userAgent) return <Monitor className="w-5 h-5" />;
    
    const ua = userAgent.toLowerCase();
    if (ua.includes('mobile') || ua.includes('android') || ua.includes('iphone')) {
      return <Smartphone className="w-5 h-5" />;
    }
    return <Monitor className="w-5 h-5" />;
  };

  const getBrowserName = (userAgent?: string) => {
    if (!userAgent) return 'Unknown Browser';
    
    const ua = userAgent.toLowerCase();
    if (ua.includes('chrome')) return 'Chrome';
    if (ua.includes('firefox')) return 'Firefox';
    if (ua.includes('safari')) return 'Safari';
    if (ua.includes('edge')) return 'Edge';
    return 'Unknown Browser';
  };

  const formatTimeAgo = (date: Date) => {
    const now = new Date();
    const diffMs = now.getTime() - date.getTime();
    const diffMins = Math.floor(diffMs / (1000 * 60));
    const diffHours = Math.floor(diffMins / 60);
    const diffDays = Math.floor(diffHours / 24);

    if (diffMins < 1) return 'Just now';
    if (diffMins < 60) return `${diffMins} minutes ago`;
    if (diffHours < 24) return `${diffHours} hours ago`;
    return `${diffDays} days ago`;
  };

  const isCurrentSession = (session: SessionData) => {
    return sessionStatus?.jwtPayload?.session_id === session.sessionId;
  };

  if (loading) {
    return (
      <div className="bg-white rounded-lg shadow-sm border border-slate-200 p-6">
        <div className="flex items-center space-x-3 mb-6">
          <Shield className="w-6 h-6 text-blue-600" />
          <h2 className="text-xl font-semibold text-slate-900">Active Sessions</h2>
        </div>
        <div className="flex items-center justify-center py-8">
          <RefreshCw className="w-6 h-6 text-slate-400 animate-spin" />
          <span className="ml-2 text-slate-600">Loading sessions...</span>
        </div>
      </div>
    );
  }

  return (
    <div className="bg-white rounded-lg shadow-sm border border-slate-200 p-6">
      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center space-x-3">
          <Shield className="w-6 h-6 text-blue-600" />
          <h2 className="text-xl font-semibold text-slate-900">Active Sessions</h2>
        </div>
        <button
          onClick={loadSessions}
          className="flex items-center space-x-2 px-3 py-2 text-sm text-slate-600 hover:text-slate-900 hover:bg-slate-50 rounded-lg transition-colors"
        >
          <RefreshCw className="w-4 h-4" />
          <span>Refresh</span>
        </button>
      </div>

      {/* Session Status Summary */}
      {sessionStatus && (
        <div className="mb-6 p-4 bg-slate-50 rounded-lg">
          <h3 className="text-sm font-medium text-slate-900 mb-2">Current Session Status</h3>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-sm">
            <div>
              <span className="text-slate-600">JWT Token:</span>
              <span className={`ml-2 font-medium ${sessionStatus.jwtTokenValid ? 'text-green-600' : 'text-red-600'}`}>
                {sessionStatus.jwtTokenValid ? 'Valid' : 'Invalid'}
              </span>
            </div>
            <div>
              <span className="text-slate-600">Session:</span>
              <span className={`ml-2 font-medium ${sessionStatus.basicSessionValid ? 'text-green-600' : 'text-red-600'}`}>
                {sessionStatus.basicSessionValid ? 'Active' : 'Inactive'}
              </span>
            </div>
            <div>
              <span className="text-slate-600">Total Sessions:</span>
              <span className="ml-2 font-medium text-slate-900">{sessionStatus.activeSessions}</span>
            </div>
            <div>
              <span className="text-slate-600">Fully Valid:</span>
              <span className={`ml-2 font-medium ${sessionStatus.fullyValid ? 'text-green-600' : 'text-red-600'}`}>
                {sessionStatus.fullyValid ? 'Yes' : 'No'}
              </span>
            </div>
          </div>
        </div>
      )}

      {sessions.length === 0 ? (
        <div className="text-center py-8">
          <Shield className="w-12 h-12 text-slate-300 mx-auto mb-4" />
          <p className="text-slate-600">No active sessions found</p>
        </div>
      ) : (
        <div className="space-y-4">
          {sessions.map((session) => (
            <div
              key={session.sessionId}
              className={`border rounded-lg p-4 ${
                isCurrentSession(session)
                  ? 'border-blue-200 bg-blue-50'
                  : 'border-slate-200 bg-white'
              }`}
            >
              <div className="flex items-start justify-between">
                <div className="flex items-start space-x-3">
                  <div className="text-slate-600">
                    {getDeviceIcon(session.userAgent)}
                  </div>
                  <div className="flex-1">
                    <div className="flex items-center space-x-2">
                      <h3 className="font-medium text-slate-900">
                        {getBrowserName(session.userAgent)}
                      </h3>
                      {isCurrentSession(session) && (
                        <span className="px-2 py-1 text-xs font-medium text-blue-700 bg-blue-100 rounded-full">
                          Current Session
                        </span>
                      )}
                    </div>
                    
                    <div className="mt-1 space-y-1 text-sm text-slate-600">
                      <div className="flex items-center space-x-4">
                        <div className="flex items-center space-x-1">
                          <Globe className="w-4 h-4" />
                          <span>{session.ipAddress || 'Unknown IP'}</span>
                        </div>
                        <div className="flex items-center space-x-1">
                          <Clock className="w-4 h-4" />
                          <span>Last active {formatTimeAgo(new Date(session.lastAccessedAt))}</span>
                        </div>
                      </div>
                      
                      <div className="text-xs text-slate-500">
                        <div>Provider: {session.provider}</div>
                        <div>Created: {new Date(session.createdAt).toLocaleDateString()}</div>
                        <div>Expires: {new Date(session.expiresAt).toLocaleDateString()}</div>
                      </div>
                    </div>
                  </div>
                </div>

                {!isCurrentSession(session) && (
                  <button
                    onClick={() => handleRevokeSession(session.sessionId)}
                    disabled={revoking === session.sessionId}
                    className="flex items-center space-x-1 px-3 py-2 text-sm text-red-600 hover:text-red-700 hover:bg-red-50 rounded-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    {revoking === session.sessionId ? (
                      <RefreshCw className="w-4 h-4 animate-spin" />
                    ) : (
                      <X className="w-4 h-4" />
                    )}
                    <span>Revoke</span>
                  </button>
                )}
              </div>
            </div>
          ))}
        </div>
      )}

      <div className="mt-6 p-4 bg-amber-50 border border-amber-200 rounded-lg">
        <div className="flex items-start space-x-3">
          <Shield className="w-5 h-5 text-amber-600 mt-0.5" />
          <div className="text-sm">
            <p className="font-medium text-amber-800 mb-1">Security Notice</p>
            <p className="text-amber-700">
              If you see any sessions you don't recognize, revoke them immediately and change your password. 
              Sessions are automatically cleaned up when they expire.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
};

export default SessionManager;