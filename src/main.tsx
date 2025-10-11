import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import App from './App.tsx';
import './index.css';
import { validateEnvironment, logConfigurationStatus } from './lib/env';

// Validate environment configuration on startup
try {
  validateEnvironment();
  logConfigurationStatus();
} catch (error) {
  console.error('❌ Environment configuration error:', error);
  // In development, show error but continue
  if (import.meta.env.NODE_ENV === 'production') {
    throw error;
  }
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>
);
