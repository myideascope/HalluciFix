import React, { useState } from 'react';
import { useEffect } from 'react';
import { Shield, AlertTriangle, CheckCircle2, Upload, FileText, Zap, BarChart3, Settings as SettingsIcon, Users, Search, Clock, TrendingUp, XCircle, UserCog, ChevronDown, ChevronRight, Eye, CreditCard } from 'lucide-react';
import ServiceDegradationStatus from './ServiceDegradationStatus';
import { useServiceDegradation } from '../hooks/useServiceDegradation';
import { AnalysisResult } from '../types/analysis';
import HallucinationAnalyzer from './HallucinationAnalyzer';
import Dashboard from './Dashboard';
import BatchAnalysis from './BatchAnalysis';
import ScheduledScans from './ScheduledScans';
import Settings from './Settings';
import Analytics from './Analytics';
import UserManagement from './UserManagement';
import LandingPage from './LandingPage';
import ReviewSystem from './ReviewSystem';
import ApiDocumentation from './ApiDocumentation';
import DarkModeToggle from './DarkModeToggle';
import SeqLogprobAnalyzer from './SeqLogprobAnalyzer';
import FeatureFlagDebugger from './FeatureFlagDebugger';
import BillingDashboard from './BillingDashboard';
import { CognitoAuthContext, useCognitoAuthProvider } from '../hooks/useCognitoAuth';
import { useDarkMode } from '../hooks/useDarkMode';
import GlobalErrorBoundary from './GlobalErrorBoundary';
import { ErrorBoundaryProvider } from '../contexts/ErrorBoundaryContext';
import { 
  AnalysisErrorBoundary, 
  DashboardErrorBoundary, 
  AuthErrorBoundary,
  FeatureErrorBoundary 
} from './errorBoundaries';
import { initializeMonitoring, logger } from '../lib/monitoring';
import { SubscriptionStatusBanner, SubscriptionNotifications } from './SubscriptionNotifications';

type TabType = 'analyzer' | 'dashboard' | 'batch' | 'scheduled' | 'analytics' | 'reviews' | 'settings' | 'users' | 'seqlogprob' | 'billing';

function CognitoApp() {
  const [activeTab, setActiveTab] = useState<TabType>('analyzer');
  const [analysisResults, setAnalysisResults] = useState<AnalysisResult[]>([]);
  const [expandedDropdowns, setExpandedDropdowns] = useState<Set<string>>(new Set());
  const [showUserDropdown, setShowUserDropdown] = useState(false);
  const authProvider = useCognitoAuthProvider();
  const { user, loading, signOut, isAdmin, canManageUsers } = authProvider;
  const [showApiDocs, setShowApiDocs] = useState(false);
  const { isDarkMode } = useDarkMode();
  const { isOnline, isOfflineMode, degradedServices, unavailableServices } = useServiceDegradation();

  // Initialize comprehensive monitoring system
  useEffect(() => {
    const initMonitoring = async () => {
      try {
        await initializeMonitoring({
          enabled: true,
          components: {
            logging: true,
            errorTracking: true,
            performanceMonitoring: true,
            businessMetrics: true,
            apiMonitoring: true,
            costTracking: true,
            incidentManagement: true,
            webVitals: typeof window !== 'undefined',
            userEngagement: true
          },
          alerting: {
            enabled: true,
            channels: ['console', 'notification']
          },
          dataFlow: {
            enableCrossComponentCorrelation: true,
            enableRealTimeSync: true,
            bufferSize: 1000,
            flushInterval: 30000
          },
          externalServices: {
            datadog: {
              enabled: false // Enable when API keys are configured
            },
            newRelic: {
              enabled: false // Enable when license key is configured
            },
            sentry: {
              enabled: typeof window !== 'undefined' && !!(window as any).Sentry
            }
          }
        });

        logger.info('HalluciFix application started with Cognito auth', {
          userId: user?.id,
          userRole: user?.role?.name,
          timestamp: new Date().toISOString(),
          environment: process.env.NODE_ENV,
          version: '1.0.0',
          authProvider: 'cognito'
        });

      } catch (error) {
        console.error('Failed to initialize monitoring system:', error);
        // Continue without monitoring rather than blocking the app
      }
    };

    initMonitoring();
  }, [user]);

  // Load analysis results when user changes
  useEffect(() => {
    const loadAnalysisResults = async () => {
      if (!user) {
        setAnalysisResults([]);
        return;
      }

      try {
        // TODO: Replace with AWS API Gateway call to fetch analysis results
        // For now, initialize with empty array
        setAnalysisResults([]);
        
        console.log('Analysis results loading from AWS API Gateway not yet implemented');
      } catch (error) {
        console.error('Error loading analysis results:', error);
      }
    };

    loadAnalysisResults();
  }, [user]);

  const handleAuthSuccess = () => {
    // User state will be updated automatically by the auth state change listener
  };

  const handleAnalysisComplete = (result: AnalysisResult) => {
    setAnalysisResults(prev => [result, ...prev]);
  };

  const handleBatchAnalysisComplete = (results: AnalysisResult[]) => {
    setAnalysisResults(prev => [...results, ...prev]);
  };

  const toggleDropdown = (dropdownId: string) => {
    setExpandedDropdowns(prev => {
      const newSet = new Set(prev);
      if (newSet.has(dropdownId)) {
        newSet.delete(dropdownId);
      } else {
        newSet.add(dropdownId);
      }
      return newSet;
    });
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

  const navigation = [
    { id: 'dashboard', label: 'Dashboard', icon: BarChart3, description: 'Overview of analysis results' },
    { 
      id: 'analyzer', 
      label: 'Analyze Content', 
      icon: Search, 
      description: 'Detect hallucinations in AI-generated content',
      hasDropdown: true,
      dropdownItems: [
        { id: 'analyzer', label: 'Single Analysis', icon: Search, description: 'Analyze individual content' },
        { id: 'batch', label: 'Batch Analysis', icon: Upload, description: 'Process multiple documents' },
        { id: 'scheduled', label: 'Scheduled Scans', icon: Clock, description: 'Automated monitoring' },
        { id: 'seqlogprob', label: 'Seq-Logprob Analysis', icon: Eye, description: 'Token probability analysis' }
      ]
    },
    { id: 'analytics', label: 'Analytics', icon: TrendingUp, description: 'Historical data and trends' },
    { id: 'reviews', label: 'Content Reviews', icon: Eye, description: 'Review and approve flagged content' },
    { id: 'billing', label: 'Billing & Usage', icon: CreditCard, description: 'Manage subscription and usage' }
  ];

  const renderContent = () => {
    switch (activeTab) {
      case 'analyzer':
        return (
          <AnalysisErrorBoundary>
            <HallucinationAnalyzer onAnalysisComplete={handleAnalysisComplete} setActiveTab={setActiveTab} />
          </AnalysisErrorBoundary>
        );
      case 'dashboard':
        return (
          <DashboardErrorBoundary>
            <Dashboard analysisResults={analysisResults} setActiveTab={setActiveTab} user={user} />
          </DashboardErrorBoundary>
        );
      case 'batch':
        return (
          <AnalysisErrorBoundary>
            <BatchAnalysis onBatchComplete={handleBatchAnalysisComplete} />
          </AnalysisErrorBoundary>
        );
      case 'scheduled':
        return (
          <AnalysisErrorBoundary>
            <ScheduledScans />
          </AnalysisErrorBoundary>
        );
      case 'seqlogprob':
        return (
          <AnalysisErrorBoundary>
            <SeqLogprobAnalyzer onAnalysisComplete={(result) => {
              // Convert seq-logprob result to analysis result format for consistency
              const analysisResult: AnalysisResult = {
                id: `seqlogprob_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
                user_id: user?.id || 'anonymous',
                content: result.tokenAnalysis.map(t => t.token).join('').substring(0, 200) + '...',
                timestamp: new Date().toISOString(),
                accuracy: result.confidenceScore,
                riskLevel: result.hallucinationRisk,
                hallucinations: result.suspiciousSequences.map(seq => ({
                  text: seq.tokens.join(''),
                  type: 'Low Confidence Sequence',
                  confidence: Math.abs(seq.averageLogProb) / 10, // Convert log prob to confidence
                  explanation: seq.reason
                })),
                verificationSources: 0,
                processingTime: result.processingTime,
                analysisType: 'single',
                seqLogprobAnalysis: {
                  seqLogprob: result.seqLogprob,
                  normalizedSeqLogprob: result.normalizedSeqLogprob,
                  confidenceScore: result.confidenceScore,
                  hallucinationRisk: result.hallucinationRisk,
                  isHallucinationSuspected: result.isHallucinationSuspected,
                  lowConfidenceTokens: result.lowConfidenceTokens,
                  suspiciousSequences: result.suspiciousSequences.length,
                  processingTime: result.processingTime
                }
              };
              
              // Add to analysis results
              setAnalysisResults(prev => [analysisResult, ...prev]);
            }} />
          </AnalysisErrorBoundary>
        );
      case 'analytics':
        return (
          <DashboardErrorBoundary>
            <Analytics analysisResults={analysisResults} />
          </DashboardErrorBoundary>
        );
      case 'reviews':
        return (
          <AnalysisErrorBoundary>
            <ReviewSystem analysisResults={analysisResults} />
          </AnalysisErrorBoundary>
        );
      case 'settings':
        return (
          <FeatureErrorBoundary feature="settings">
            <Settings />
          </FeatureErrorBoundary>
        );
      case 'users':
        return (
          <FeatureErrorBoundary feature="user-management">
            <UserManagement />
          </FeatureErrorBoundary>
        );
      case 'billing':
        return (
          <FeatureErrorBoundary feature="billing">
            <BillingDashboard />
          </FeatureErrorBoundary>
        );
      default:
        return (
          <AnalysisErrorBoundary>
            <HallucinationAnalyzer onAnalysisComplete={handleAnalysisComplete} setActiveTab={setActiveTab} />
          </AnalysisErrorBoundary>
        );
    }
  };

  return (
    <ErrorBoundaryProvider>
      <GlobalErrorBoundary>
        <CognitoAuthContext.Provider value={authProvider}>
          {loading ? (
            <div className="min-h-screen bg-gradient-to-br from-slate-50 to-slate-100 dark:from-slate-900 dark:to-slate-800 flex items-center justify-center">
              <div className="text-center">
                <div className="animate-spin rounded-full h-12 w-12 border-2 border-blue-600 border-t-transparent mx-auto mb-4"></div>
                <p className="text-slate-600 dark:text-slate-400">Loading...</p>
              </div>
            </div>
          ) : !user ? (
            <AuthErrorBoundary>
              <LandingPage onAuthSuccess={handleAuthSuccess} />
            </AuthErrorBoundary>
          ) : (
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
                    <p className="text-sm text-slate-600 dark:text-slate-400">AI Accuracy Verification Engine (AWS)</p>
                  </div>
                </div>
                
                <div className="flex items-center space-x-6">
                  <ServiceDegradationStatus compact={true} showCacheInfo={false} />
                  
                  <DarkModeToggle />
                  
                  <div className="relative">
                    <button
                      onClick={() => setShowUserDropdown(!showUserDropdown)}
                      className="flex items-center space-x-2 p-2 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"
                    >
                      <div className="w-8 h-8 bg-slate-300 rounded-full flex items-center justify-center">
                        {user.avatar ? (
                          <img src={user.avatar} alt={user.name} className="w-8 h-8 rounded-full" />
                        ) : (
                          <Users className="w-4 h-4 text-slate-700" />
                        )}
                      </div>
                      <div className="text-left">
                        <div className="text-sm font-medium text-slate-700 dark:text-slate-300">{user.name}</div>
                        <div className="text-xs text-slate-500 dark:text-slate-400">{user.role.name}</div>
                      </div>
                      <ChevronDown className={`w-4 h-4 text-slate-500 dark:text-slate-400 transition-transform duration-200 ${showUserDropdown ? 'rotate-180' : ''}`} />
                    </button>
                    
                    {/* User Dropdown Menu */}
                    {showUserDropdown && (
                      <div className="absolute top-full right-0 mt-1 w-64 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-600 rounded-lg shadow-lg overflow-hidden z-10">
                        {/* User Info Header */}
                        <div className="px-4 py-3 bg-slate-50 dark:bg-slate-700 border-b border-slate-200 dark:border-slate-600">
                          <div className="flex items-center space-x-3">
                            <div className="w-10 h-10 bg-slate-300 rounded-full flex items-center justify-center">
                              {user.avatar ? (
                                <img src={user.avatar} alt={user.name} className="w-10 h-10 rounded-full" />
                              ) : (
                                <Users className="w-5 h-5 text-slate-700" />
                              )}
                            </div>
                            <div>
                              <div className="text-sm font-medium text-slate-900 dark:text-slate-100">{user.name}</div>
                              <div className="text-xs text-slate-500 dark:text-slate-400">{user.email}</div>
                              <div className="text-xs text-slate-500 dark:text-slate-400">{user.role.name}</div>
                            </div>
                          </div>
                        </div>
                        
                        {/* Menu Items */}
                        <div className="py-1">
                          <button
                            onClick={() => {
                              setActiveTab('settings');
                              setShowUserDropdown(false);
                            }}
                            className="w-full flex items-center space-x-3 px-4 py-3 text-left transition-colors duration-200 text-slate-600 dark:text-slate-400 hover:bg-slate-50 dark:hover:bg-slate-700 hover:text-slate-900 dark:hover:text-slate-200"
                          >
                            <SettingsIcon className="w-4 h-4" />
                            <div>
                              <div className="font-medium text-slate-900 dark:text-slate-200">System Settings</div>
                              <div className="text-xs text-slate-500 dark:text-slate-400">Configure detection parameters</div>
                            </div>
                          </button>
                          
                          {isAdmin() && (
                            <button
                              onClick={() => {
                                setActiveTab('users');
                                setShowUserDropdown(false);
                              }}
                              className="w-full flex items-center space-x-3 px-4 py-3 text-left transition-colors duration-200 text-slate-600 dark:text-slate-400 hover:bg-slate-50 dark:hover:bg-slate-700 hover:text-slate-900 dark:hover:text-slate-200"
                            >
                              <UserCog className="w-4 h-4" />
                              <div>
                                <div className="font-medium text-slate-900 dark:text-slate-200">User Management</div>
                                <div className="text-xs text-slate-500 dark:text-slate-400">Manage team members</div>
                              </div>
                            </button>
                          )}
                          
                          <div className="border-t border-slate-200 dark:border-slate-600 my-1"></div>
                          
                          <button
                            onClick={() => {
                              signOut();
                              setShowUserDropdown(false);
                            }}
                            className="w-full flex items-center space-x-3 px-4 py-3 text-left transition-colors duration-200 text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-900/20"
                          >
                            <XCircle className="w-4 h-4" />
                            <div>
                              <div className="font-medium">Sign Out</div>
                              <div className="text-xs opacity-75">End your session</div>
                            </div>
                          </button>
                        </div>
                      </div>
                    )}
                  </div>
                </div>
              </div>
            </div>
          </header>

          <div className="max-w-7xl mx-auto px-6 py-8">
            {/* Click outside handler for user dropdown */}
            {showUserDropdown && (
              <div 
                className="fixed inset-0 z-0" 
                onClick={() => setShowUserDropdown(false)}
              />
            )}
            
            {/* Navigation */}
            <nav className="mb-8">
              <div className="bg-white dark:bg-slate-900 p-1 rounded-xl shadow-sm border border-slate-200 dark:border-slate-700 transition-colors duration-200">
                <div className="flex space-x-1">
                  {navigation.map((item) => {
                    const Icon = item.icon;
                    const isActive = item.hasDropdown 
                      ? item.dropdownItems?.some(dropdownItem => dropdownItem.id === activeTab)
                      : activeTab === item.id;
                    const isExpanded = expandedDropdowns.has(item.id);
                    
                    return (
                      <div key={item.id} className="flex-1 relative">
                        <button
                          onClick={() => {
                            if (item.hasDropdown) {
                              toggleDropdown(item.id);
                            } else {
                              setActiveTab(item.id as TabType);
                            }
                          }}
                          className={`w-full flex items-center justify-between px-4 py-3 rounded-lg transition-all duration-200 group ${
                            isActive
                              ? 'bg-blue-600 text-white shadow-md'
                              : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-800'
                          }`}
                        >
                          <div className="flex items-center space-x-2">
                            <Icon className={`w-5 h-5 ${isActive ? 'text-white' : 'text-slate-500 dark:text-slate-400 group-hover:text-slate-700 dark:group-hover:text-slate-300'}`} />
                            <div className="text-left">
                              <div className={`font-medium ${isActive ? 'text-white' : 'text-slate-900 dark:text-slate-200'}`}>
                                {item.label}
                              </div>
                              <div className={`text-xs ${isActive ? 'text-blue-100' : 'text-slate-500 dark:text-slate-400'} hidden sm:block`}>
                                {item.description}
                              </div>
                            </div>
                          </div>
                          
                          {item.hasDropdown && (
                            <div className={`transition-transform duration-200 ${isExpanded ? 'rotate-180' : ''}`}>
                              <ChevronDown className={`w-4 h-4 ${isActive ? 'text-white' : 'text-slate-500 dark:text-slate-400'}`} />
                            </div>
                          )}
                        </button>
                        
                        {/* Dropdown Menu */}
                        {item.hasDropdown && isExpanded && (
                          <div className="absolute top-full left-0 right-0 mt-1 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-600 rounded-lg shadow-lg overflow-hidden z-10">
                            {item.dropdownItems?.map((dropdownItem) => {
                              const DropdownIcon = dropdownItem.icon;
                              const isDropdownActive = activeTab === dropdownItem.id;
                              
                              return (
                                <button
                                  key={dropdownItem.id}
                                  onClick={() => {
                                    setActiveTab(dropdownItem.id as TabType);
                                    setExpandedDropdowns(new Set()); // Close all dropdowns
                                  }}
                                  className={`w-full flex items-center space-x-3 px-4 py-3 text-left transition-colors duration-200 ${
                                    isDropdownActive
                                      ? 'bg-blue-50 dark:bg-blue-900/20 text-blue-700 dark:text-blue-300'
                                      : 'text-slate-600 dark:text-slate-400 hover:bg-slate-50 dark:hover:bg-slate-700 hover:text-slate-900 dark:hover:text-slate-200'
                                  }`}
                                >
                                  <DropdownIcon className={`w-4 h-4 ${
                                    isDropdownActive 
                                      ? 'text-blue-600 dark:text-blue-400' 
                                      : 'text-slate-500 dark:text-slate-400'
                                  }`} />
                                  <div>
                                    <div className={`font-medium ${
                                      isDropdownActive 
                                        ? 'text-blue-700 dark:text-blue-300' 
                                        : 'text-slate-900 dark:text-slate-200'
                                    }`}>
                                      {dropdownItem.label}
                                    </div>
                                    <div className={`text-xs ${
                                      isDropdownActive 
                                        ? 'text-blue-600 dark:text-blue-400' 
                                        : 'text-slate-500 dark:text-slate-400'
                                    }`}>
                                      {dropdownItem.description}
                                    </div>
                                  </div>
                                </button>
                              );
                            })}
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              </div>
            </nav>

            {/* Subscription Status Banner */}
            {user && <SubscriptionStatusBanner />}

            {/* Main Content */}
            <main>
              {/* Subscription Notifications */}
              {user && (
                <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-4">
                  <SubscriptionNotifications maxNotifications={2} />
                </div>
              )}
              
              {renderContent()}
            </main>
          </div>
          
            {/* Feature Flag Debugger (Development Only) */}
            <FeatureFlagDebugger />
          </div>
        )}
      </CognitoAuthContext.Provider>
    </GlobalErrorBoundary>
  </ErrorBoundaryProvider>
);
}

export default CognitoApp;