import React, { useState } from 'react';
import { Calendar, Download, Filter, TrendingUp, TrendingDown, AlertTriangle, CheckCircle2, Users, Clock } from 'lucide-react';

const Analytics: React.FC = () => {
  const [timeRange, setTimeRange] = useState('30d');
  const [filterType, setFilterType] = useState('all');

  const weeklyData = [
    { week: 'Week 1', analyses: 2840, accuracy: 92.1, hallucinations: 187 },
    { week: 'Week 2', analyses: 3120, accuracy: 94.5, hallucinations: 142 },
    { week: 'Week 3', analyses: 2950, accuracy: 91.8, hallucinations: 198 },
    { week: 'Week 4', analyses: 3350, accuracy: 95.2, hallucinations: 125 }
  ];

  const departmentStats = [
    { department: 'Marketing', analyses: 4247, accuracy: 89.2, riskScore: 'medium' },
    { department: 'Customer Support', analyses: 3891, accuracy: 96.1, riskScore: 'low' },
    { department: 'Content Team', analyses: 2103, accuracy: 87.4, riskScore: 'high' },
    { department: 'Research', analyses: 1876, accuracy: 94.8, riskScore: 'low' },
    { department: 'Sales', analyses: 1730, accuracy: 91.3, riskScore: 'medium' }
  ];

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
      <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-6">
        <div className="flex flex-col md:flex-row md:items-center justify-between space-y-4 md:space-y-0">
          <div>
            <h2 className="text-xl font-bold text-slate-900 mb-1">Analytics Dashboard</h2>
            <p className="text-slate-600">Comprehensive insights into AI content verification patterns</p>
          </div>

          <div className="flex items-center space-x-4">
            <div className="flex items-center space-x-2">
              <Calendar className="w-4 h-4 text-slate-500" />
              <select 
                value={timeRange}
                onChange={(e) => setTimeRange(e.target.value)}
                className="border border-slate-300 rounded px-3 py-1.5 text-sm"
              >
                <option value="7d">Last 7 days</option>
                <option value="30d">Last 30 days</option>
                <option value="90d">Last 90 days</option>
                <option value="1y">Last year</option>
              </select>
            </div>

            <div className="flex items-center space-x-2">
              <Filter className="w-4 h-4 text-slate-500" />
              <select 
                value={filterType}
                onChange={(e) => setFilterType(e.target.value)}
                className="border border-slate-300 rounded px-3 py-1.5 text-sm"
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
      <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-6">
        <h3 className="text-lg font-bold text-slate-900 mb-6">Weekly Performance Trends</h3>
        
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Analyses Chart */}
          <div>
            <h4 className="text-sm font-medium text-slate-700 mb-3">Analyses Performed</h4>
            <div className="h-40 flex items-end justify-between space-x-2">
              {weeklyData.map((week, index) => (
                <div key={index} className="flex-1 flex flex-col items-center">
                  <div 
                    className="w-full bg-blue-600 rounded-t transition-all duration-500 hover:bg-blue-700"
                    style={{ height: `${(week.analyses / 4000) * 120}px` }}
                  ></div>
                  <span className="text-xs text-slate-500 mt-2">{week.week}</span>
                </div>
              ))}
            </div>
          </div>

          {/* Accuracy Chart */}
          <div>
            <h4 className="text-sm font-medium text-slate-700 mb-3">Average Accuracy</h4>
            <div className="h-40 flex items-end justify-between space-x-2">
              {weeklyData.map((week, index) => (
                <div key={index} className="flex-1 flex flex-col items-center">
                  <div 
                    className="w-full bg-green-600 rounded-t transition-all duration-500 hover:bg-green-700"
                    style={{ height: `${(week.accuracy / 100) * 120}px` }}
                  ></div>
                  <span className="text-xs text-slate-500 mt-2">{week.week}</span>
                </div>
              ))}
            </div>
          </div>

          {/* Hallucinations Chart */}
          <div>
            <h4 className="text-sm font-medium text-slate-700 mb-3">Hallucinations Detected</h4>
            <div className="h-40 flex items-end justify-between space-x-2">
              {weeklyData.map((week, index) => (
                <div key={index} className="flex-1 flex flex-col items-center">
                  <div 
                    className="w-full bg-red-600 rounded-t transition-all duration-500 hover:bg-red-700"
                    style={{ height: `${(week.hallucinations / 250) * 120}px` }}
                  ></div>
                  <span className="text-xs text-slate-500 mt-2">{week.week}</span>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>

      {/* Department Performance */}
      <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-6">
        <h3 className="text-lg font-bold text-slate-900 mb-6">Department Performance</h3>
        
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead>
              <tr className="border-b border-slate-200">
                <th className="text-left text-sm font-medium text-slate-600 pb-3">Department</th>
                <th className="text-left text-sm font-medium text-slate-600 pb-3">Total Analyses</th>
                <th className="text-left text-sm font-medium text-slate-600 pb-3">Average Accuracy</th>
                <th className="text-left text-sm font-medium text-slate-600 pb-3">Risk Score</th>
                <th className="text-left text-sm font-medium text-slate-600 pb-3">Trend</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {departmentStats.map((dept, index) => (
                <tr key={index} className="hover:bg-slate-50 transition-colors">
                  <td className="py-4 pr-4">
                    <div className="flex items-center space-x-3">
                      <div className="w-8 h-8 bg-blue-100 rounded-lg flex items-center justify-center">
                        <Users className="w-4 h-4 text-blue-600" />
                      </div>
                      <span className="font-medium text-slate-900">{dept.department}</span>
                    </div>
                  </td>
                  <td className="py-4 pr-4">
                    <span className="text-slate-900">{dept.analyses.toLocaleString()}</span>
                  </td>
                  <td className="py-4 pr-4">
                    <div className="flex items-center space-x-2">
                      <span className="text-slate-900 font-medium">{dept.accuracy}%</span>
                      <div className="w-20 bg-slate-200 rounded-full h-2">
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
                      {Math.random() > 0.5 ? (
                        <TrendingUp className="w-4 h-4 text-green-600" />
                      ) : (
                        <TrendingDown className="w-4 h-4 text-red-600" />
                      )}
                      <span className={`text-sm font-medium ${Math.random() > 0.5 ? 'text-green-600' : 'text-red-600'}`}>
                        {Math.random() > 0.5 ? '+' : '-'}{(Math.random() * 10).toFixed(1)}%
                      </span>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* Key Insights */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-6">
          <h4 className="font-semibold text-slate-900 mb-4">Key Insights</h4>
          <div className="space-y-4">
            <div className="flex items-start space-x-3">
              <TrendingUp className="w-5 h-5 text-green-600 mt-0.5" />
              <div>
                <p className="text-sm font-medium text-slate-900">Accuracy Improvement</p>
                <p className="text-xs text-slate-600">Overall accuracy increased by 3.2% this month</p>
              </div>
            </div>
            
            <div className="flex items-start space-x-3">
              <AlertTriangle className="w-5 h-5 text-amber-600 mt-0.5" />
              <div>
                <p className="text-sm font-medium text-slate-900">Content Team Alert</p>
                <p className="text-xs text-slate-600">Higher than average hallucination rate detected</p>
              </div>
            </div>
            
            <div className="flex items-start space-x-3">
              <CheckCircle2 className="w-5 h-5 text-blue-600 mt-0.5" />
              <div>
                <p className="text-sm font-medium text-slate-900">Best Performer</p>
                <p className="text-xs text-slate-600">Customer Support maintains 96%+ accuracy</p>
              </div>
            </div>
          </div>
        </div>

        <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-6">
          <h4 className="font-semibold text-slate-900 mb-4">Recommendations</h4>
          <div className="space-y-4">
            <div className="p-3 bg-blue-50 rounded-lg">
              <p className="text-sm font-medium text-blue-900 mb-1">Enhance Training</p>
              <p className="text-xs text-blue-700">Consider additional AI safety training for high-risk departments</p>
            </div>
            
            <div className="p-3 bg-green-50 rounded-lg">
              <p className="text-sm font-medium text-green-900 mb-1">Process Optimization</p>
              <p className="text-xs text-green-700">Implement automated pre-screening for faster detection</p>
            </div>
            
            <div className="p-3 bg-amber-50 rounded-lg">
              <p className="text-sm font-medium text-amber-900 mb-1">Alert Configuration</p>
              <p className="text-xs text-amber-700">Set up real-time alerts for critical risk content</p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default Analytics;