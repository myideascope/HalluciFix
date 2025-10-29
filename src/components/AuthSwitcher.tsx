import React, { useState, useEffect } from 'react';
import { Shield, Settings, AlertTriangle, CheckCircle2 } from 'lucide-react';

interface AuthSwitcherProps {
  onAuthModeChange: (mode: 'supabase' | 'cognito') => void;
  currentMode: 'supabase' | 'cognito';
}

export default function AuthSwitcher({ onAuthModeChange, currentMode }: AuthSwitcherProps) {
  const [showSwitcher, setShowSwitcher] = useState(false);

  // Only show switcher in development mode
  useEffect(() => {
    setShowSwitcher(import.meta.env.DEV && import.meta.env.VITE_ENABLE_AUTH_SWITCHER === 'true');
  }, []);

  if (!showSwitcher) {
    return null;
  }

  return (
    <div className="fixed bottom-4 right-4 z-50">
      <div className="bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-600 rounded-lg shadow-lg p-4 max-w-sm">
        <div className="flex items-center space-x-2 mb-3">
          <Settings className="w-4 h-4 text-slate-600 dark:text-slate-400" />
          <h3 className="text-sm font-medium text-slate-900 dark:text-slate-100">
            Auth Mode (Dev Only)
          </h3>
        </div>
        
        <div className="space-y-2">
          <button
            onClick={() => onAuthModeChange('supabase')}
            className={`w-full flex items-center justify-between p-3 rounded-lg border transition-colors ${
              currentMode === 'supabase'
                ? 'bg-blue-50 dark:bg-blue-900/20 border-blue-200 dark:border-blue-700 text-blue-700 dark:text-blue-300'
                : 'bg-slate-50 dark:bg-slate-700 border-slate-200 dark:border-slate-600 text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-600'
            }`}
          >
            <div className="flex items-center space-x-2">
              <Shield className="w-4 h-4" />
              <span className="text-sm font-medium">Supabase Auth</span>
            </div>
            {currentMode === 'supabase' && (
              <CheckCircle2 className="w-4 h-4 text-blue-600 dark:text-blue-400" />
            )}
          </button>
          
          <button
            onClick={() => onAuthModeChange('cognito')}
            className={`w-full flex items-center justify-between p-3 rounded-lg border transition-colors ${
              currentMode === 'cognito'
                ? 'bg-orange-50 dark:bg-orange-900/20 border-orange-200 dark:border-orange-700 text-orange-700 dark:text-orange-300'
                : 'bg-slate-50 dark:bg-slate-700 border-slate-200 dark:border-slate-600 text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-600'
            }`}
          >
            <div className="flex items-center space-x-2">
              <Shield className="w-4 h-4" />
              <span className="text-sm font-medium">AWS Cognito</span>
            </div>
            {currentMode === 'cognito' && (
              <CheckCircle2 className="w-4 h-4 text-orange-600 dark:text-orange-400" />
            )}
          </button>
        </div>
        
        <div className="mt-3 p-2 bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-700 rounded-lg">
          <div className="flex items-start space-x-2">
            <AlertTriangle className="w-4 h-4 text-amber-600 dark:text-amber-400 mt-0.5 flex-shrink-0" />
            <p className="text-xs text-amber-700 dark:text-amber-300">
              This switcher is only available in development mode for testing the migration.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}