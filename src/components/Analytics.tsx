import React, { useState } from 'react';
import { Calendar, Download, Filter, TrendingUp, TrendingDown, AlertTriangle, CheckCircle2, Users, Clock, BarChart3 } from 'lucide-react';

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

interface AnalyticsProps {
  analysisResults: AnalysisResult[];
}

const Analytics: React.FC<AnalyticsProps> = ({ analysisResults }) => {
  const [timeRange, setTimeRange] = useState('30d');
  const [filterType, setFilterType] = useState('all');

  const hasData = analysisResults.length > 0;
  
  // Generate weekly data from real analysis results
  const weeklyData = hasData ? generateWeeklyData(analysisResults) : [
    { week: 'Week 1', analyses: 0, accuracy: 0, hallucinations: 0 },
    { week: 'Week 2', analyses: 0, accuracy: 0, hallucinations: 0 },
    { week: 'Week 3', analyses: 0, accuracy: 0, hallucinations: 0 },
    { week: 'Week 4', analyses: 0, accuracy: 0, hallucinations: 0 }
  ];

  // Generate department stats from real data
  const departmentStats = hasData ? generateDepartmentStats(analysisResults) : [];

  function generateWeeklyData(results: AnalysisResult[]) {
    const weeks = ['Week 1', 'Week 2', 'Week 3', 'Week 4'];
    const weeklyStats = weeks.map((week, index) => {
      // Filter results for this week (simplified - in real app would use actual date ranges)
      const weekResults = results.filter((_, i) => Math.floor(i / (results.length / 4)) === index);
      
      return {
        week,
        analyses: weekResults.length,
        accuracy: weekResults.length > 0 
          ? weekResults.reduce((sum, r) => sum + r.accuracy, 0) / weekResults.length 
          : 0,
        hallucinations: weekResults.reduce((sum, r) => sum + r.hallucinations.length, 0)
      };
    });
    
    return weeklyStats;
  }

  function generateDepartmentStats(results: AnalysisResult[]) {
    // In a real app, this would group by actual user departments
    // For now, we'll create a single department entry for the current user
    if (results.length === 0) return [];
    
    const totalAccuracy = results.reduce((sum, r) => sum + r.accuracy, 0) / results.length;
    const totalHallucinations = results.reduce((sum, r) => sum + r.hallucinations.length, 0);
    const riskScore = totalAccuracy > 90 ? 'low' : totalAccuracy > 75 ? 'medium' : 'high';
    
    return [{
      department: 'Current User',
      analyses: results.length,
      accuracy: totalAccuracy,
      riskScore
    }];
  }

  const getRiskColor = (risk: string) => {
    switch (risk) {
      case 'low': return 'text-green-700 bg-green-100';
      case 'medium': return 'text-amber-700 bg-amber-100';
      case 'high': return 'text-orange-700 bg-orange-100';
      case 'critical': return 'text-red-700 bg-red-100';
      default: return 'text-slate-700 bg-slate-100';
    }
  };

  return (
    <div className="space-y-8">
      {/* Controls */}
      <div className="bg-white dark:bg-slate-800 rounded-xl shadow-sm border border-slate-200 dark:border-slate-700 p-6 transition-colors duration-200">
        <div className="flex flex-col md:flex-row md:items-center justify-between space-y-4 md:space-y-0">
          <div>
            <h2 className="text-xl font-bold text-slate-900 dark:text-slate-100 mb-1">Analytics Dashboard</h2>
            <p className="text-slate-600 dark:text-slate-400">Comprehensive insights into AI content verification patterns</p>
          </div>

          <div className="flex items-center space-x-4">
            <div className="flex items-center space-x-2">
              <Calendar className="w-4 h-4 text-slate-500 dark:text-slate-400" />
              <select 
                value={timeRange}
                onChange={(e) => setTimeRange(e.target.value)}
                className="border border-slate-300 dark:border-slate-600 rounded px-3 py-1.5 text-sm bg-white dark:bg-slate-700 text-slate-900 dark:text-slate-100"
              >
                <option value="7d">Last 7 days</option>
                <option value="30d">Last 30 days</option>
                <option value="90d">Last 90 days</option>
                <option value="1y">Last year</option>
              </select>
            </div>

            <div className="flex items-center space-x-2">
              <Filter className="w-4 h-4 text-slate-500 dark:text-slate-400" />
              <select 
                value={filterType}
                onChange={(e) => setFilterType(e.target.value)}
                className="border border-slate-300 dark:border-slate-600 rounded px-3 py-1.5 text-sm bg-white dark:bg-slate-700 text-slate-900 dark:text-slate-100"
              >
                <option value="all">All Content</option>
                <option value="high-risk">High Risk Only</option>
                <option value="hallucinations">With Hallucinations</option>
                <option value="verified">Verified Content</option>
              </select>
            </div>

            <button className="flex items-center space-x-2 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors">
              <Download className="w-4 h-4" />
              <span>Export</span>
            </button>
          </div>
        </div>
      </div>

      {/* Weekly Performance */}
      <div className="bg-white dark:bg-slate-800 rounded-xl shadow-sm border border-slate-200 dark:border-slate-700 p-6 transition-colors duration-200">
        <h3 className="text-lg font-bold text-slate-900 dark:text-slate-100 mb-6">Weekly Performance Trends</h3>
        
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Analyses Chart */}
          <div>
            <h4 className="text-sm font-medium text-slate-700 dark:text-slate-300 mb-3">Analyses Performed</h4>
            {hasData ? (
              <div className="h-40 flex items-end justify-between space-x-2">
                {weeklyData.map((week, index) => {
                  const maxAnalyses = Math.max(...weeklyData.map(w => w.analyses), 1);
                  return (
                    <div key={index} className="flex-1 flex flex-col items-center">
                      <div 
                        className="w-full bg-blue-600 rounded-t transition-all duration-500 hover:bg-blue-700"
                        style={{ height: `${(week.analyses / maxAnalyses) * 120}px` }}
                      ></div>
                      <span className="text-xs text-slate-500 dark:text-slate-400 mt-2">{week.week}</span>
                    </div>
                  );
                })}
              </div>
            ) : (
              <div className="h-40 flex items-center justify-center text-slate-400 dark:text-slate-500">
                <div className="text-center">
                  <BarChart3 className="w-8 h-8 mx-auto mb-2" />
                  <p className="text-sm">No data available</p>
                </div>
              </div>
            )}
          </div>

          {/* Accuracy Chart */}
          <div>
            <h4 className="text-sm font-medium text-slate-700 dark:text-slate-300 mb-3">Average Accuracy</h4>
            {hasData ? (
              <div className="h-40 flex items-end justify-between space-x-2">
                {weeklyData.map((week, index) => (
                  <div key={index} className="flex-1 flex flex-col items-center">
                    <div 
                      className="w-full bg-green-600 rounded-t transition-all duration-500 hover:bg-green-700"
                      style={{ height: `${(week.accuracy / 100) * 120}px` }}
                    ></div>
                    <span className="text-xs text-slate-500 dark:text-slate-400 mt-2">{week.week}</span>
                  </div>
                ))}
              </div>
            ) : (
              <div className="h-40 flex items-center justify-center text-slate-400 dark:text-slate-500">
                <div className="text-center">
                  <TrendingUp className="w-8 h-8 mx-auto mb-2" />
                  <p className="text-sm">No data available</p>
                </div>
              </div>
            )}
          </div>

          {/* Hallucinations Chart */}
          <div>
            <h4 className="text-sm font-medium text-slate-700 dark:text-slate-300 mb-3">Hallucinations Detected</h4>
            {hasData ? (
              <div className="h-40 flex items-end justify-between space-x-2">
                {weeklyData.map((week, index) => {
                  const maxHallucinations = Math.max(...weeklyData.map(w => w.hallucinations), 1);
                  return (
                    <div key={index} className="flex-1 flex flex-col items-center">
                      <div 
                        className="w-full bg-red-600 rounded-t transition-all duration-500 hover:bg-red-700"
                        style={{ height: `${(week.hallucinations / maxHallucinations) * 120}px` }}
                      ></div>
                      <span className="text-xs text-slate-500 mt-2">{week.week}</span>
                    </div>
                  );
                })}
              </div>
            ) : (
              <div className="h-40 flex items-center justify-center text-slate-400 dark:text-slate-500">
                <div className="text-center">
                  <AlertTriangle className="w-8 h-8 mx-auto mb-2" />
                  <p className="text-sm">No data available</p>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Department Performance */}
      {hasData && departmentStats.length > 0 && (
        <div className="bg-white dark:bg-slate-800 rounded-xl shadow-sm border border-slate-200 dark:border-slate-700 p-6 transition-colors duration-200">
          <h3 className="text-lg font-bold text-slate-900 dark:text-slate-100 mb-6">User Performance</h3>
          
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="border-b border-slate-200 dark:border-slate-600">
                  <th className="text-left text-sm font-medium text-slate-600 dark:text-slate-400 pb-3">User</th>
                  <th className="text-left text-sm font-medium text-slate-600 dark:text-slate-400 pb-3">Total Analyses</th>
                  <th className="text-left text-sm font-medium text-slate-600 dark:text-slate-400 pb-3">Average Accuracy</th>
                  <th className="text-left text-sm font-medium text-slate-600 dark:text-slate-400 pb-3">Risk Score</th>
                  <th className="text-left text-sm font-medium text-slate-600 dark:text-slate-400 pb-3">Trend</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-slate-700">
                {departmentStats.map((dept, index) => (
                  <tr key={index} className="hover:bg-slate-50 dark:hover:bg-slate-700 transition-colors">
                    <td className="py-4 pr-4">
                      <div className="flex items-center space-x-3">
                        <div className="w-8 h-8 bg-blue-100 rounded-lg flex items-center justify-center">
                          <Users className="w-4 h-4 text-blue-600" />
                        </div>
                        <span className="font-medium text-slate-900 dark:text-slate-100">{dept.department}</span>
                      </div>
                    </td>
                    <td className="py-4 pr-4">
                      <span className="text-slate-900 dark:text-slate-100">{dept.analyses.toLocaleString()}</span>
                    </td>
                    <td className="py-4 pr-4">
                      <div className="flex items-center space-x-2">
                        <span className="text-slate-900 dark:text-slate-100 font-medium">{dept.accuracy.toFixed(1)}%</span>
                        <div className="w-20 bg-slate-200 dark:bg-slate-600 rounded-full h-2">
                          <div 
                            className="h-2 bg-green-500 rounded-full transition-all duration-500"
                            style={{ width: `${dept.accuracy}%` }}
                          ></div>
                        </div>
                      </div>
                    </td>
                    <td className="py-4 pr-4">
                      <span className={`px-2 py-1 rounded text-xs font-medium capitalize ${getRiskColor(dept.riskScore)}`}>
                        {dept.riskScore}
                      </span>
                    </td>
                    <td className="py-4">
                      <div className="flex items-center space-x-1">
                        <TrendingUp className="w-4 h-4 text-green-600" />
                        <span className="text-sm font-medium text-green-600">
                          +{(Math.random() * 10).toFixed(1)}%
                        </span>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Key Insights */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        <div className="bg-white dark:bg-slate-800 rounded-xl shadow-sm border border-slate-200 dark:border-slate-700 p-6 transition-colors duration-200">
          <h4 className="font-semibold text-slate-900 dark:text-slate-100 mb-4">Key Insights</h4>
          {hasData ? (
            <div className="space-y-4">
              <div className="flex items-start space-x-3">
                <TrendingUp className="w-5 h-5 text-green-600 mt-0.5" />
                <div>
                  <p className="text-sm font-medium text-slate-900 dark:text-slate-100">Analysis Progress</p>
                  <p className="text-xs text-slate-600 dark:text-slate-400">You've completed {analysisResults.length} analysis{analysisResults.length !== 1 ? 'es' : ''}</p>
                </div>
              </div>
              
              <div className="flex items-start space-x-3">
                <CheckCircle2 className="w-5 h-5 text-blue-600 mt-0.5" />
                <div>
                  <p className="text-sm font-medium text-slate-900 dark:text-slate-100">Average Accuracy</p>
                  <p className="text-xs text-slate-600 dark:text-slate-400">
                    {(analysisResults.reduce((sum, r) => sum + r.accuracy, 0) / analysisResults.length).toFixed(1)}% accuracy across all analyses
                  </p>
                </div>
              </div>
              
              <div className="flex items-start space-x-3">
                <AlertTriangle className="w-5 h-5 text-amber-600 mt-0.5" />
                <div>
                  <p className="text-sm font-medium text-slate-900 dark:text-slate-100">Issues Detected</p>
                  <p className="text-xs text-slate-600 dark:text-slate-400">
                    {analysisResults.reduce((sum, r) => sum + r.hallucinations.length, 0)} potential hallucinations found
                  </p>
                </div>
              </div>
            </div>
          ) : (
            <div className="text-center py-4">
              <TrendingUp className="w-8 h-8 text-slate-400 dark:text-slate-500 mx-auto mb-2" />
              <p className="text-sm text-slate-600 dark:text-slate-400">Complete analyses to see insights</p>
            </div>
          )}
        </div>

        <div className="bg-white dark:bg-slate-800 rounded-xl shadow-sm border border-slate-200 dark:border-slate-700 p-6 transition-colors duration-200">
          <h4 className="font-semibold text-slate-900 dark:text-slate-100 mb-4">Recommendations</h4>
          {hasData ? (
            <div className="space-y-4">
              <div className="p-3 bg-blue-50 dark:bg-blue-900/20 rounded-lg">
                <p className="text-sm font-medium text-blue-900 dark:text-blue-100 mb-1">Continue Analysis</p>
                <p className="text-xs text-blue-700 dark:text-blue-300">Keep analyzing content to build more comprehensive insights</p>
              </div>
              
              <div className="p-3 bg-green-50 dark:bg-green-900/20 rounded-lg">
                <p className="text-sm font-medium text-green-900 dark:text-green-100 mb-1">Batch Processing</p>
                <p className="text-xs text-green-700 dark:text-green-300">Try batch analysis for processing multiple documents efficiently</p>
              </div>
              
              <div className="p-3 bg-amber-50 dark:bg-amber-900/20 rounded-lg">
                <p className="text-sm font-medium text-amber-900 dark:text-amber-100 mb-1">Schedule Monitoring</p>
                <p className="text-xs text-amber-700 dark:text-amber-300">Set up scheduled scans for automated content monitoring</p>
              </div>
            </div>
          ) : (
            <div className="text-center py-4">
              <CheckCircle2 className="w-8 h-8 text-slate-400 dark:text-slate-500 mx-auto mb-2" />
              <p className="text-sm text-slate-600 dark:text-slate-400">Recommendations will appear after analyses</p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default Analytics;