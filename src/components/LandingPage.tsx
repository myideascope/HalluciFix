import React, { useState } from 'react';
import { Shield, Users } from 'lucide-react';
import HallucinationAnalyzer from './HallucinationAnalyzer';
import AuthForm from './AuthForm';
import DarkModeToggle from './DarkModeToggle';

interface LandingPageProps {
  onAuthSuccess: () => void;
}

const LandingPage: React.FC<LandingPageProps> = ({ onAuthSuccess }) => {
  const [showAuthModal, setShowAuthModal] = useState(false);
  const [pendingAnalysis, setPendingAnalysis] = useState<string | null>(null);

  const handleAnalysisAttempt = (content: string) => {
    setShowAuthModal(true);
  };

  const handleAuthSuccess = () => {
    setShowAuthModal(false);
    onAuthSuccess();
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 to-slate-100 dark:from-slate-900 dark:to-slate-800 transition-colors duration-200">
      {/* Header */}
      <header className="bg-white dark:bg-slate-900 border-b border-slate-200 dark:border-slate-700 shadow-sm transition-colors duration-200">
        <div className="max-w-7xl mx-auto px-6 py-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center space-x-3">
              <div className="p-2 bg-blue-600 rounded-lg">
                <Shield className="w-6 h-6 text-white" />
              </div>
              <div>
                <h1 className="text-xl font-bold text-slate-900 dark:text-slate-100">HalluciFix</h1>
                <p className="text-sm text-slate-600 dark:text-slate-400">AI Accuracy Verification Engine</p>
              </div>
            </div>
            
            <div className="flex items-center space-x-3">
              <DarkModeToggle />
              <button
                  onClick={() => setShowAuthModal(true)}
                  className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors text-sm"
                >
                  Sign In
                </button>
            </div>
          </div>
        </div>
      </header>

      {/* Main Content */}
      <main className="max-w-7xl mx-auto px-6 py-12">
        <HallucinationAnalyzer onAnalysisAttempt={handleAnalysisAttempt} />
        
        {/* Try Our Demo Box */}
        <div className="mt-6 mb-6 bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 rounded-xl p-6 transition-colors duration-200">
          <div className="flex items-center space-x-3 mb-3">
            <div className="p-2 bg-blue-100 dark:bg-blue-800 rounded-lg">
              <Shield className="w-5 h-5 text-blue-600 dark:text-blue-400" />
            </div>
            <h3 className="text-lg font-semibold text-blue-900 dark:text-blue-100">Try Our Demo</h3>
          </div>
          <p className="text-sm text-blue-800 dark:text-blue-200 mb-4">
            Experience our AI hallucination detection technology! Click "Sample Text" above to load example content, 
            then hit "Analyze Content" to see how our system identifies potential issues in AI-generated text. 
            For full access to custom content analysis and advanced features, please sign in above.
          </p>
          <div className="text-xs text-blue-700 dark:text-blue-300">
            <strong>Demo Features:</strong> Sample text analysis • Real-time detection • Risk assessment
          </div>
        </div>
      </main>

      {/* Auth Modal */}
      {showAuthModal && (
        <AuthForm 
          onAuthSuccess={handleAuthSuccess} 
          onClose={() => setShowAuthModal(false)} 
        />
      )}

      {/* Footer */}
      <footer className="bg-white dark:bg-slate-900 border-t border-slate-200 dark:border-slate-700 mt-16 transition-colors duration-200">
        <div className="max-w-7xl mx-auto px-6 py-8">
          <div className="flex flex-col md:flex-row justify-between items-center">
            <div className="flex items-center space-x-2 mb-4 md:mb-0">
              <Shield className="w-5 h-5 text-blue-600" />
              <span className="font-semibold text-slate-900 dark:text-slate-100">HalluciFix</span>
              <span className="text-slate-500 dark:text-slate-400">•</span>
              <span className="text-sm text-slate-600 dark:text-slate-400">Protecting enterprises from AI errors</span>
            </div>
            
            <div className="flex items-center space-x-6 text-sm text-slate-600 dark:text-slate-400">
              <a href="#" className="hover:text-slate-900 dark:hover:text-slate-200 transition-colors">Documentation</a>
              <a href="#" className="hover:text-slate-900 dark:hover:text-slate-200 transition-colors">API Reference</a>
              <a href="#" className="hover:text-slate-900 dark:hover:text-slate-200 transition-colors">Support</a>
              <a href="#" className="hover:text-slate-900 dark:hover:text-slate-200 transition-colors">Enterprise</a>
            </div>
          </div>
        </div>
      </footer>
    </div>
  );
};

export default LandingPage;