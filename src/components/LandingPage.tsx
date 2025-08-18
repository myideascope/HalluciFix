import React from 'react';
import { Shield, Users } from 'lucide-react';
import HallucinationAnalyzer from './HallucinationAnalyzer';
import AuthForm from './AuthForm';

interface LandingPageProps {
  onAuthSuccess: () => void;
}

const LandingPage: React.FC<LandingPageProps> = ({ onAuthSuccess }) => {
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
            
            <div className="flex items-center space-x-2">
              <div className="w-8 h-8 bg-slate-300 rounded-full flex items-center justify-center">
                <Users className="w-4 h-4 text-slate-700" />
              </div>
              <span className="text-sm font-medium text-slate-700">Guest</span>
            </div>
          </div>
        </div>
      </header>

      <div className="max-w-7xl mx-auto px-6 py-8">
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-12 items-start">
          {/* Left Column - Content Analysis */}
          <div className="space-y-8">
            <HallucinationAnalyzer />
          </div>

          {/* Right Column - Authentication */}
          <div className="lg:sticky lg:top-8">
            <AuthForm onAuthSuccess={onAuthSuccess} />
          </div>
        </div>
      </div>

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