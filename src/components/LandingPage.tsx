import React, { useState } from 'react';
import { Shield, Users } from 'lucide-react';
import HallucinationAnalyzer from './HallucinationAnalyzer';
import AuthForm from './AuthForm';

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
    <div className="min-h-screen bg-gradient-to-br from-slate-50 to-slate-100">
      {/* Header */}
      <header className="bg-white border-b border-slate-200 shadow-sm">
        <div className="max-w-7xl mx-auto px-6 py-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center space-x-3">
              <div className="p-2 bg-blue-600 rounded-lg">
                <Shield className="w-6 h-6 text-white" />
              </div>
              <div>
                <h1 className="text-xl font-bold text-slate-900">HalluciFix</h1>
                <p className="text-sm text-slate-600">AI Accuracy Verification Engine</p>
              </div>
            </div>
            
            <button
                onClick={() => setShowAuthModal(true)}
                className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors text-sm"
              >
                Sign In
              </button>
          </div>
        </div>
      </header>

      {/* Main Content */}
      <main className="max-w-7xl mx-auto px-6 py-12">
        <div className="mb-8 bg-blue-50 border border-blue-200 rounded-xl p-6">
        <HallucinationAnalyzer onAnalysisAttempt={handleAnalysisAttempt} />
        
        <div className="mt-8 bg-blue-50 border border-blue-200 rounded-xl p-6">
          <div className="flex items-center space-x-3 mb-3">
            <div className="p-2 bg-blue-100 rounded-lg">
              <Shield className="w-5 h-5 text-blue-600" />
            </div>
            <h3 className="text-lg font-semibold text-blue-900">Try Our Demo</h3>
          </div>
          <p className="text-sm text-blue-800 mb-4">
            Experience our AI hallucination detection technology! Click "Sample Text" above to load example content, 
            then hit "Analyze Content" to see how our system identifies potential issues in AI-generated text. 
            For full access to custom content analysis and advanced features, please sign in above.
          </p>
          <div className="text-xs text-blue-700">
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
      <footer className="bg-white border-t border-slate-200 mt-16">
        <div className="max-w-7xl mx-auto px-6 py-8">
          <div className="flex flex-col md:flex-row justify-between items-center">
            <div className="flex items-center space-x-2 mb-4 md:mb-0">
              <Shield className="w-5 h-5 text-blue-600" />
              <span className="font-semibold text-slate-900">HalluciFix</span>
              <span className="text-slate-500">•</span>
              <span className="text-sm text-slate-600">Protecting enterprises from AI errors</span>
            </div>
            
            <div className="flex items-center space-x-6 text-sm text-slate-600">
              <a href="#" className="hover:text-slate-900 transition-colors">Documentation</a>
              <a href="#" className="hover:text-slate-900 transition-colors">API Reference</a>
              <a href="#" className="hover:text-slate-900 transition-colors">Support</a>
              <a href="#" className="hover:text-slate-900 transition-colors">Enterprise</a>
            </div>
          </div>
        </div>
      </footer>
    </div>
  );
};

export default LandingPage;