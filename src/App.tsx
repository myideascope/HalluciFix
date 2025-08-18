import React, { useState } from 'react';
import { useEffect } from 'react';
import { Shield, AlertTriangle, CheckCircle2, Upload, FileText, Zap, BarChart3, Settings as SettingsIcon, Users, Search, Clock, TrendingUp, XCircle, UserCog } from 'lucide-react';
import { supabase } from './lib/supabase';
import HallucinationAnalyzer from './components/HallucinationAnalyzer';
import Dashboard from './components/Dashboard';
import BatchAnalysis from './components/BatchAnalysis';
import ScheduledScans from './components/ScheduledScans';
import Settings from './components/Settings';
import Analytics from './components/Analytics';
import UserManagement from './components/UserManagement';
import LandingPage from './components/LandingPage';
import ApiDocumentation from './components/ApiDocumentation';
import DarkModeToggle from './components/DarkModeToggle';
import { AuthContext, useAuthProvider } from './hooks/useAuth';
import { useDarkMode } from './hooks/useDarkMode';

interface AnalysisResult {
  id: string;
  content: string;
  timestamp: string;
  accuracy: number;
  riskLevel: 'low' | 'medium' | 'high' | 'critical';
  hallucinations: Array<{
    text: string;
    type: string;
    confidence: number;
    explanation: string;
  }>;
  verificationSources: number;
  processingTime: number;
}

type TabType = 'analyzer' | 'dashboard' | 'batch' | 'scheduled' | 'analytics' | 'settings' | 'users';

function App() {
  const [activeTab, setActiveTab] = useState<TabType>('analyzer');
  const [analysisResults, setAnalysisResults] = useState<AnalysisResult[]>([]);
  const authProvider = useAuthProvider();
  const { user, loading, signOut, isAdmin, canManageUsers } = authProvider;
  const [showApiDocs, setShowApiDocs] = useState(false);
  const { isDarkMode } = useDarkMode();

  const handleAuthSuccess = () => {
    // User state will be updated automatically by the auth state change listener
  };

  const handleAnalysisComplete = (result: AnalysisResult) => {
    setAnalysisResults(prev => [result, ...prev]);
  };

  // Handle API docs navigation
  useEffect(() => {
    const handleApiDocsNavigation = () => {
      setShowApiDocs(true);
    };

    // Listen for API docs navigation events
    window.addEventListener('open-api-docs', handleApiDocsNavigation);
    
    return () => {
      window.removeEventListener('open-api-docs', handleApiDocsNavigation);
    };
  }, []);

  // Show API documentation
  if (showApiDocs) {
    return (
      <div>
        <div className="fixed top-4 left-4 z-50">
          <button
            onClick={() => setShowApiDocs(false)}
            className="flex items-center space-x-2 px-4 py-2 bg-white border border-slate-300 rounded-lg shadow-sm hover:bg-slate-50 transition-colors"
          >
            <span>← Back to Dashboard</span>
          </button>
        </div>
        <ApiDocumentation />
      </div>
    );
  }

  if (loading) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-slate-50 to-slate-100 dark:from-slate-900 dark:to-slate-800 flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-2 border-blue-600 border-t-transparent mx-auto mb-4"></div>
          <p className="text-slate-600 dark:text-slate-400">Loading...</p>
        </div>
      </div>
    );
  }

  // Show landing page if user is not authenticated
  if (!user) {
    return <LandingPage onAuthSuccess={handleAuthSuccess} />;
  }

  const navigation = [
    { id: 'dashboard', label: 'Dashboard', icon: BarChart3, description: 'Overview of analysis results' },
    { id: 'analyzer', label: 'Analyze Content', icon: Search, description: 'Detect hallucinations in AI-generated content' },
    { id: 'batch', label: 'Batch Analysis', icon: Upload, description: 'Process multiple documents simultaneously' },
    { id: 'scheduled', label: 'Scheduled Scans', icon: Clock, description: 'Automated content monitoring' },
    { id: 'analytics', label: 'Analytics', icon: TrendingUp, description: 'Historical data and trends' },
    { id: 'settings', label: 'Settings', icon: SettingsIcon, description: 'Configure detection parameters' },
    ...(isAdmin() ? [{ id: 'users', label: 'User Management', icon: UserCog, description: 'Manage team members and roles' }] : [])
  ];

  const renderContent = () => {
    switch (activeTab) {
      case 'analyzer':
        return <HallucinationAnalyzer onAnalysisComplete={handleAnalysisComplete} setActiveTab={setActiveTab} />;
      case 'dashboard':
        return <Dashboard analysisResults={analysisResults} setActiveTab={setActiveTab} />;
      case 'batch':
        return <BatchAnalysis />;
      case 'scheduled':
        return <ScheduledScans />;
      case 'analytics':
        return <Analytics analysisResults={analysisResults} />;
      case 'settings':
        return <Settings />;
      case 'users':
        return <UserManagement />;
      default:
        return <HallucinationAnalyzer onAnalysisComplete={handleAnalysisComplete} />;
    }
  };

  return (
    <AuthContext.Provider value={authProvider}>
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
            
            <div className="flex items-center space-x-6">
              <div className="flex items-center space-x-2 px-3 py-1.5 bg-green-50 dark:bg-green-900/20 text-green-700 dark:text-green-400 rounded-full text-sm font-medium transition-colors duration-200">
                <CheckCircle2 className="w-4 h-4" />
                <span>System Operational</span>
              </div>
              
              <DarkModeToggle />
              
              <div className="flex items-center space-x-2">
                <div className="w-8 h-8 bg-slate-300 rounded-full flex items-center justify-center">
                  <Users className="w-4 h-4 text-slate-700" />
                </div>
                <div className="text-left">
                  <div className="text-sm font-medium text-slate-700 dark:text-slate-300">{user.name}</div>
                  <div className="text-xs text-slate-500 dark:text-slate-400">{user.role.name}</div>
                </div>
                <button
                  onClick={signOut}
                  className="text-sm text-slate-500 hover:text-slate-700 dark:text-slate-400 dark:hover:text-slate-200 transition-colors"
                >
                  Sign Out
                </button>
              </div>
            </div>
          </div>
        </div>
      </header>

      <div className="max-w-7xl mx-auto px-6 py-8">
        {/* Navigation */}
        <nav className="mb-8">
          <div className="flex space-x-1 bg-white dark:bg-slate-900 p-1 rounded-xl shadow-sm border border-slate-200 dark:border-slate-700 transition-colors duration-200">
            {navigation.map((item) => {
              const Icon = item.icon;
              const isActive = activeTab === item.id;
              
              return (
                <button
                  key={item.id}
                  onClick={() => setActiveTab(item.id as TabType)}
                  className={`flex items-center space-x-2 px-4 py-3 rounded-lg transition-all duration-200 flex-1 group ${
                    isActive
                      ? 'bg-blue-600 text-white shadow-md'
                      : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-800'
                  }`}
                >
                  <Icon className={`w-5 h-5 ${isActive ? 'text-white' : 'text-slate-500 dark:text-slate-400 group-hover:text-slate-700 dark:group-hover:text-slate-300'}`} />
                  <div className="text-left">
                    <div className={`font-medium ${isActive ? 'text-white' : 'text-slate-900 dark:text-slate-200'}`}>
                      {item.label}
                    </div>
                    <div className={`text-xs ${isActive ? 'text-blue-100' : 'text-slate-500 dark:text-slate-400'} hidden sm:block`}>
                      {item.description}
                    </div>
                  </div>
                </button>
              );
            })}
          </div>
        </nav>

        {/* Main Content */}
        <main>
          {renderContent()}
        </main>
      </div>
    </div>
    </AuthContext.Provider>
  );
}

export default App;