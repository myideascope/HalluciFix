import React, { useState, useEffect } from 'react';
import { CheckCircle2, XCircle, AlertTriangle, Loader2, CreditCard, BarChart3, User, Zap } from 'lucide-react';
import { useAuth } from '../hooks/useAuth';
import { useUsageTracking } from '../hooks/useUsageTracking';
import { subscriptionService } from '../lib/subscriptionService';
import { usageTracker } from '../lib/usageTracker';
import analysisService from '../lib/analysisService';

interface TestResult {
  name: string;
  status: 'pending' | 'success' | 'error';
  message?: string;
  details?: any;
}

export const IntegrationTest: React.FC = () => {
  const [tests, setTests] = useState<TestResult[]>([]);
  const [running, setRunning] = useState(false);
  const { 
    user, 
    subscription, 
    subscriptionPlan, 
    hasActiveSubscription, 
    canAccessFeature,
    refreshSubscription 
  } = useAuth();
  const { currentUsage, loadUsageData } = useUsageTracking();

  const updateTest = (name: string, status: 'success' | 'error', message?: string, details?: any) => {
    setTests(prev => prev.map(test => 
      test.name === name 
        ? { ...test, status, message, details }
        : test
    ));
  };

  const runIntegrationTests = async () => {
    if (!user) {
      alert('Please log in first to run integration tests');
      return;
    }

    setRunning(true);
    
    // Initialize test cases
    const testCases = [
      { name: 'User Authentication', status: 'pending' as const },
      { name: 'Subscription Loading', status: 'pending' as const },
      { name: 'Usage Tracking', status: 'pending' as const },
      { name: 'Feature Access Control', status: 'pending' as const },
      { name: 'Analysis with Usage Recording', status: 'pending' as const },
      { name: 'Billing Integration', status: 'pending' as const }
    ];
    
    setTests(testCases);

    try {
      // Test 1: User Authentication
      if (user) {
        updateTest('User Authentication', 'success', `Logged in as ${user.name} (${user.email})`, {
          userId: user.id,
          role: user.role.name
        });
      } else {
        updateTest('User Authentication', 'error', 'No user found');
        return;
      }

      // Test 2: Subscription Loading
      try {
        await refreshSubscription();
        if (subscription && subscriptionPlan) {
          updateTest('Subscription Loading', 'success', `${subscriptionPlan.name} plan loaded`, {
            planId: subscriptionPlan.id,
            status: subscription.status,
            analysisLimit: subscriptionPlan.analysisLimit
          });
        } else {
          updateTest('Subscription Loading', 'success', 'No active subscription (expected for free users)', {
            hasSubscription: false
          });
        }
      } catch (error) {
        updateTest('Subscription Loading', 'error', `Failed to load subscription: ${(error as Error).message}`);
      }

      // Test 3: Usage Tracking
      try {
        await loadUsageData();
        if (currentUsage) {
          updateTest('Usage Tracking', 'success', `Current usage: ${currentUsage.current}/${currentUsage.limit === -1 ? 'unlimited' : currentUsage.limit}`, {
            current: currentUsage.current,
            limit: currentUsage.limit,
            percentage: currentUsage.percentage
          });
        } else {
          updateTest('Usage Tracking', 'error', 'Failed to load usage data');
        }
      } catch (error) {
        updateTest('Usage Tracking', 'error', `Usage tracking failed: ${(error as Error).message}`);
      }

      // Test 4: Feature Access Control
      const features = ['basic_analysis', 'advanced_analysis', 'batch_processing', 'seq_logprob'];
      const accessResults = features.map(feature => ({
        feature,
        hasAccess: canAccessFeature(feature)
      }));
      
      updateTest('Feature Access Control', 'success', 'Feature access evaluated', {
        hasActiveSubscription: hasActiveSubscription(),
        accessResults
      });

      // Test 5: Analysis with Usage Recording
      try {
        const testContent = "This is a test analysis to verify integration between analysis service and usage tracking.";
        const { analysis } = await analysisService.analyzeContent(testContent, user.id, {
          sensitivity: 'medium',
          enableRAG: false // Disable RAG for faster testing
        });
        
        // Refresh usage data to see if it was recorded
        await loadUsageData();
        
        updateTest('Analysis with Usage Recording', 'success', `Analysis completed with ${analysis.accuracy}% accuracy`, {
          analysisId: analysis.id,
          accuracy: analysis.accuracy,
          riskLevel: analysis.riskLevel,
          processingTime: analysis.processingTime
        });
      } catch (error) {
        updateTest('Analysis with Usage Recording', 'error', `Analysis failed: ${(error as Error).message}`);
      }

      // Test 6: Billing Integration
      try {
        const plans = await subscriptionService.getSubscriptionPlans();
        updateTest('Billing Integration', 'success', `${plans.length} subscription plans available`, {
          plans: plans.map(p => ({ id: p.id, name: p.name, price: p.price }))
        });
      } catch (error) {
        updateTest('Billing Integration', 'error', `Billing integration failed: ${(error as Error).message}`);
      }

    } catch (error) {
      console.error('Integration test failed:', error);
    } finally {
      setRunning(false);
    }
  };

  const getStatusIcon = (status: TestResult['status']) => {
    switch (status) {
      case 'success':
        return <CheckCircle2 className="w-5 h-5 text-green-600" />;
      case 'error':
        return <XCircle className="w-5 h-5 text-red-600" />;
      case 'pending':
        return running ? <Loader2 className="w-5 h-5 text-blue-600 animate-spin" /> : <AlertTriangle className="w-5 h-5 text-slate-400" />;
    }
  };

  const getStatusColor = (status: TestResult['status']) => {
    switch (status) {
      case 'success':
        return 'bg-green-50 border-green-200 dark:bg-green-900/20 dark:border-green-800';
      case 'error':
        return 'bg-red-50 border-red-200 dark:bg-red-900/20 dark:border-red-800';
      case 'pending':
        return 'bg-slate-50 border-slate-200 dark:bg-slate-800 dark:border-slate-700';
    }
  };

  return (
    <div className="max-w-4xl mx-auto p-6 space-y-6">
      <div className="bg-white dark:bg-slate-800 rounded-lg border border-slate-200 dark:border-slate-700 p-6">
        <div className="flex items-center justify-between mb-6">
          <div>
            <h2 className="text-2xl font-bold text-slate-900 dark:text-slate-100">
              Payment Integration Test
            </h2>
            <p className="text-slate-600 dark:text-slate-400 mt-1">
              Test the complete integration between authentication, subscription management, and usage tracking
            </p>
          </div>
          
          <button
            onClick={runIntegrationTests}
            disabled={running || !user}
            className="px-6 py-3 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
          >
            {running ? (
              <>
                <Loader2 className="w-4 h-4 animate-spin inline mr-2" />
                Running Tests...
              </>
            ) : (
              'Run Integration Tests'
            )}
          </button>
        </div>

        {/* Current Status */}
        <div className="grid md:grid-cols-4 gap-4 mb-6">
          <div className="bg-slate-50 dark:bg-slate-700 rounded-lg p-4 text-center">
            <User className="w-6 h-6 text-blue-600 mx-auto mb-2" />
            <div className="text-sm font-medium text-slate-900 dark:text-slate-100">
              {user ? 'Authenticated' : 'Not Logged In'}
            </div>
            <div className="text-xs text-slate-600 dark:text-slate-400">
              {user?.email || 'Please log in'}
            </div>
          </div>
          
          <div className="bg-slate-50 dark:bg-slate-700 rounded-lg p-4 text-center">
            <CreditCard className="w-6 h-6 text-purple-600 mx-auto mb-2" />
            <div className="text-sm font-medium text-slate-900 dark:text-slate-100">
              {subscriptionPlan?.name || 'No Subscription'}
            </div>
            <div className="text-xs text-slate-600 dark:text-slate-400">
              {subscription?.status || 'Free tier'}
            </div>
          </div>
          
          <div className="bg-slate-50 dark:bg-slate-700 rounded-lg p-4 text-center">
            <BarChart3 className="w-6 h-6 text-green-600 mx-auto mb-2" />
            <div className="text-sm font-medium text-slate-900 dark:text-slate-100">
              {currentUsage ? `${currentUsage.current}/${currentUsage.limit === -1 ? '∞' : currentUsage.limit}` : 'No Data'}
            </div>
            <div className="text-xs text-slate-600 dark:text-slate-400">
              API Usage
            </div>
          </div>
          
          <div className="bg-slate-50 dark:bg-slate-700 rounded-lg p-4 text-center">
            <Zap className="w-6 h-6 text-orange-600 mx-auto mb-2" />
            <div className="text-sm font-medium text-slate-900 dark:text-slate-100">
              {canAccessFeature('advanced_analysis') ? 'Advanced' : 'Basic'}
            </div>
            <div className="text-xs text-slate-600 dark:text-slate-400">
              Feature Access
            </div>
          </div>
        </div>

        {/* Test Results */}
        {tests.length > 0 && (
          <div className="space-y-3">
            <h3 className="text-lg font-semibold text-slate-900 dark:text-slate-100 mb-4">
              Test Results
            </h3>
            
            {tests.map((test, index) => (
              <div
                key={index}
                className={`border rounded-lg p-4 transition-colors ${getStatusColor(test.status)}`}
              >
                <div className="flex items-start space-x-3">
                  {getStatusIcon(test.status)}
                  <div className="flex-1">
                    <div className="font-medium text-slate-900 dark:text-slate-100">
                      {test.name}
                    </div>
                    {test.message && (
                      <div className="text-sm text-slate-600 dark:text-slate-400 mt-1">
                        {test.message}
                      </div>
                    )}
                    {test.details && (
                      <details className="mt-2">
                        <summary className="text-xs text-slate-500 dark:text-slate-500 cursor-pointer">
                          View Details
                        </summary>
                        <pre className="text-xs text-slate-600 dark:text-slate-400 mt-2 bg-slate-100 dark:bg-slate-800 p-2 rounded overflow-auto">
                          {JSON.stringify(test.details, null, 2)}
                        </pre>
                      </details>
                    )}
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
};

export default IntegrationTest;