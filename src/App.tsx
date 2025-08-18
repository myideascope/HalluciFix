import React, { useState } from 'react';
import { useEffect } from 'react';
import { Shield, AlertTriangle, CheckCircle2, Upload, FileText, Zap, BarChart3, Settings as SettingsIcon, Users, Search, Clock, TrendingUp, XCircle, UserCog } from 'lucide-react';
import { supabase } from './lib/supabase';
import HallucinationAnalyzer from './components/HallucinationAnalyzer';
import Dashboard from './components/Dashboard';
import Settings from './components/Settings';
import Analytics from './components/Analytics';
import UserManagement from './components/UserManagement';
import LandingPage from './components/LandingPage';
import { AuthContext, useAuthProvider } from './hooks/useAuth';

type TabType = 'analyzer' | 'dashboard' | 'analytics' | 'settings' | 'users';

function App() {
  const [activeTab, setActiveTab] = useState<TabType>('analyzer');
  const authProvider = useAuthProvider();
  const { user, loading, signOut, isAdmin, canManageUsers } = authProvider;

  const handleAuthSuccess = () => {
    // User state will be updated automatically by the auth state change listener
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-slate-50 to-slate-100 flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-2 border-blue-600 border-t-transparent mx-auto mb-4"></div>
          <p className="text-slate-600">Loading...</p>
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
    { id: 'analytics', label: 'Analytics', icon: TrendingUp, description: 'Historical data and trends' },
    { id: 'settings', label: 'Settings', icon: SettingsIcon, description: 'Configure detection parameters' },
    ...(isAdmin() ? [{ id: 'users', label: 'User Management', icon: UserCog, description: 'Manage team members and roles' }] : [])
  ];

  const renderContent = () => {
    switch (activeTab) {
      case 'analyzer':
        return <HallucinationAnalyzer />;
      case 'dashboard':
        return <Dashboard />;
      case 'analytics':
        return <Analytics />;
      case 'settings':
        return <Settings />;
      case 'users':
        return <UserManagement />;
      default:
        return <HallucinationAnalyzer />;
    }
  };

  return (
    <AuthContext.Provider value={authProvider}>
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
            
            <div className="flex items-center space-x-6">
              <div className="flex items-center space-x-2 px-3 py-1.5 bg-green-50 text-green-700 rounded-full text-sm font-medium">
                <CheckCircle2 className="w-4 h-4" />
                <span>System Operational</span>
              </div>
              
              <div className="flex items-center space-x-2">
                <div className="w-8 h-8 bg-slate-300 rounded-full flex items-center justify-center">
                  <Users className="w-4 h-4 text-slate-700" />
                </div>
                <div className="text-left">
                  <div className="text-sm font-medium text-slate-700">{user.name}</div>
                  <div className="text-xs text-slate-500">{user.role.name}</div>
                </div>
                <button
                  onClick={signOut}
                  className="text-sm text-slate-500 hover:text-slate-700 transition-colors"
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
          <div className="flex space-x-1 bg-white p-1 rounded-xl shadow-sm border border-slate-200">
            {navigation.map((item) => {
              const Icon = item.icon;
              const isActive = activeTab === item.id;
              
              return (
                <button
                  key={item.id}
                  onClick={() => setActiveTab(item.id as TabType)}
                  className={`flex items-center space-x-2 px-4 py-3 rounded-lg transition-all duration-200 flex-1 ${
                    isActive
                      ? 'bg-blue-600 text-white shadow-md'
                      : 'text-slate-600 hover:text-slate-900 hover:bg-slate-50'
                  }`}
                >
                  <Icon className={`w-5 h-5 ${isActive ? 'text-white' : 'text-slate-500'}`} />
                  <div className="text-left">
                    <div className={`font-medium ${isActive ? 'text-white' : 'text-slate-900'}`}>
                      {item.label}
                    </div>
                    <div className={`text-xs ${isActive ? 'text-blue-100' : 'text-slate-500'} hidden sm:block`}>
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