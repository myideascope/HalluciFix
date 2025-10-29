import React, { useState, useEffect } from 'react';
import App from './App';
import CognitoApp from './components/CognitoApp';
import AuthSwitcher from './components/AuthSwitcher';

type AuthMode = 'supabase' | 'cognito';

function MigrationApp() {
  const [authMode, setAuthMode] = useState<AuthMode>('supabase');

  // Load auth mode from localStorage or environment
  useEffect(() => {
    const savedMode = localStorage.getItem('hallucifix_auth_mode') as AuthMode;
    const envMode = import.meta.env.VITE_DEFAULT_AUTH_MODE as AuthMode;
    
    // Priority: localStorage > environment > default (supabase)
    const initialMode = savedMode || envMode || 'supabase';
    
    if (['supabase', 'cognito'].includes(initialMode)) {
      setAuthMode(initialMode);
    }
  }, []);

  // Save auth mode to localStorage when changed
  const handleAuthModeChange = (mode: AuthMode) => {
    setAuthMode(mode);
    localStorage.setItem('hallucifix_auth_mode', mode);
    
    // Reload the page to ensure clean state
    window.location.reload();
  };

  // Render the appropriate app based on auth mode
  const renderApp = () => {
    switch (authMode) {
      case 'cognito':
        return <CognitoApp />;
      case 'supabase':
      default:
        return <App />;
    }
  };

  return (
    <>
      {renderApp()}
      <AuthSwitcher 
        currentMode={authMode} 
        onAuthModeChange={handleAuthModeChange} 
      />
    </>
  );
}

export default MigrationApp;