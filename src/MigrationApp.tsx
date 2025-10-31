import React, { useState, useEffect } from 'react';
import App from './App';
import CognitoApp from './components/CognitoApp';
import AuthSwitcher from './components/AuthSwitcher';
import MigrationCutover from './components/MigrationCutover';
import MigrationValidation from './components/MigrationValidation';
import { migrationCutoverService } from './lib/migrationCutoverService';

type AuthMode = 'supabase' | 'cognito';
type AppMode = 'normal' | 'migration' | 'cutover' | 'validation';

function MigrationApp() {
  const [authMode, setAuthMode] = useState<AuthMode>('supabase');
  const [appMode, setAppMode] = useState<AppMode>('normal');

  useEffect(() => {
    // Check if migration has been completed
    const isMigrationCompleted = (migrationCutoverService.constructor as any).isMigrationCompleted();
    
    if (isMigrationCompleted) {
      // Migration completed, use AWS services
      setAuthMode('cognito');
      setAppMode('normal');
      return;
    }

    // Check for migration mode
    const migrationMode = import.meta.env.VITE_ENABLE_MIGRATION_MODE === 'true';
    const showCutover = localStorage.getItem('hallucifix_show_migration_cutover') === 'true';
    
    if (showCutover) {
      setAppMode('cutover');
      return;
    }

    if (migrationMode) {
      setAppMode('migration');
    }

    // Check for saved auth mode preference (for migration mode)
    const savedMode = localStorage.getItem('hallucifix_auth_mode') as AuthMode;
    
    // Check environment variable for default mode
    const envMode = import.meta.env.VITE_DEFAULT_AUTH_MODE as AuthMode;
    
    // Check migration-specific auth mode
    const migrationAuthMode = localStorage.getItem('hallucifix_migration_auth_mode') as AuthMode;
    
    // Determine initial mode
    const initialMode = migrationAuthMode || savedMode || envMode || 'supabase';
    
    if (['supabase', 'cognito'].includes(initialMode)) {
      setAuthMode(initialMode);
    }
  }, []);

  const handleAuthModeChange = (mode: AuthMode) => {
    setAuthMode(mode);
    localStorage.setItem('hallucifix_auth_mode', mode);
    
    // Reload the page to ensure clean state
    window.location.reload();
  };

  const handleMigrationComplete = () => {
    // Migration completed successfully, show validation
    setAuthMode('cognito');
    setAppMode('validation');
    localStorage.removeItem('hallucifix_show_migration_cutover');
  };

  const handleValidationComplete = () => {
    // Validation completed, switch to normal mode
    setAppMode('normal');
    
    // Reload to ensure clean state with AWS services
    window.location.reload();
  };

  const handleMigrationError = (error: Error) => {
    console.error('Migration failed:', error);
    // Stay in cutover mode to allow retry
  };

  const showMigrationCutover = () => {
    localStorage.setItem('hallucifix_show_migration_cutover', 'true');
    setAppMode('cutover');
  };

  // Check if auth switcher should be shown (only in migration mode)
  const showAuthSwitcher = appMode === 'migration' && import.meta.env.VITE_ENABLE_AUTH_SWITCHER === 'true';

  const renderApp = () => {
    // Show migration cutover interface
    if (appMode === 'cutover') {
      return (
        <MigrationCutover 
          onMigrationComplete={handleMigrationComplete}
          onMigrationError={handleMigrationError}
        />
      );
    }

    // Show migration validation interface
    if (appMode === 'validation') {
      return (
        <MigrationValidation 
          onValidationComplete={handleValidationComplete}
          onCleanupComplete={() => {
            // Cleanup completed, proceed to normal mode
            handleValidationComplete();
          }}
        />
      );
    }

    // Normal app mode - choose based on auth mode
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
      {/* Migration Cutover Button (only in migration mode and not in cutover) */}
      {appMode === 'migration' && (
        <div className="fixed top-4 right-4 z-50">
          <button
            onClick={showMigrationCutover}
            className="bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded-lg shadow-lg transition-colors"
          >
            Execute Migration Cutover
          </button>
        </div>
      )}
      
      {renderApp()}
      
      {/* Auth Switcher (only in migration mode) */}
      {showAuthSwitcher && (
        <AuthSwitcher 
          currentMode={authMode} 
          onAuthModeChange={handleAuthModeChange} 
        />
      )}
    </>
  );
}

export default MigrationApp;