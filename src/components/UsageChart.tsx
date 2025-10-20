/**
 * Usage Chart Component
 * Simple chart component for visualizing usage trends
 */

import React from 'react';
import { UsageHistoryEntry } from '../types/subscription';

interface UsageChartProps {
  data: UsageHistoryEntry[];
  className?: string;
}

export const UsageChart: React.FC<UsageChartProps> = ({ data, className = '' }) => {
  if (data.length === 0) {
    return (
      <div className={`text-center py-8 ${className}`}>
        <div className="text-slate-500 dark:text-slate-400">
          No usage data available
        </div>
      </div>
    );
  }

  const maxUsage = Math.max(...data.map(entry => entry.usage));
  const maxLimit = Math.max(...data.map(entry => entry.limit > 0 ? entry.limit : 0));
  const chartMax = Math.max(maxUsage, maxLimit);

  return (
    <div className={`space-y-4 ${className}`}>
      {/* Chart */}
      <div className="relative h-64 flex items-end space-x-1 px-4 py-4 bg-slate-50 dark:bg-slate-900/50 rounded-lg">
        {data.map((entry, index) => {
          const usageHeight = chartMax > 0 ? (entry.usage / chartMax) * 100 : 0;
          const limitHeight = entry.limit > 0 && chartMax > 0 ? (entry.limit / chartMax) * 100 : 0;
          const isOverage = entry.overage && entry.overage > 0;
          
          return (
            <div key={index} className="flex-1 relative group">
              {/* Limit line */}
              {entry.limit > 0 && (
                <div
                  className="absolute w-full border-t-2 border-dashed border-slate-400 dark:border-slate-500"
                  style={{ bottom: `${limitHeight}%` }}
                />
              )}
              
              {/* Usage bar */}
              <div
                className={`w-full rounded-t transition-all duration-200 ${
                  isOverage 
                    ? 'bg-red-500 hover:bg-red-600' 
                    : usageHeight > 80 
                    ? 'bg-yellow-500 hover:bg-yellow-600' 
                    : 'bg-blue-500 hover:bg-blue-600'
                }`}
                style={{ height: `${usageHeight}%` }}
              />
              
              {/* Tooltip */}
              <div className="absolute bottom-full left-1/2 transform -translate-x-1/2 mb-2 opacity-0 group-hover:opacity-100 transition-opacity duration-200 pointer-events-none">
                <div className="bg-slate-900 dark:bg-slate-100 text-white dark:text-slate-900 text-xs rounded px-2 py-1 whitespace-nowrap">
                  <div className="font-medium">
                    {entry.date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
                  </div>
                  <div>Usage: {entry.usage.toLocaleString()}</div>
                  {entry.limit > 0 && (
                    <div>Limit: {entry.limit.toLocaleString()}</div>
                  )}
                  {isOverage && (
                    <div className="text-red-300">
                      Overage: {entry.overage!.toLocaleString()}
                    </div>
                  )}
                </div>
                <div className="absolute top-full left-1/2 transform -translate-x-1/2 border-4 border-transparent border-t-slate-900 dark:border-t-slate-100" />
              </div>
            </div>
          );
        })}
      </div>

      {/* Legend */}
      <div className="flex items-center justify-center space-x-6 text-sm">
        <div className="flex items-center space-x-2">
          <div className="w-3 h-3 bg-blue-500 rounded" />
          <span className="text-slate-600 dark:text-slate-400">Normal Usage</span>
        </div>
        <div className="flex items-center space-x-2">
          <div className="w-3 h-3 bg-yellow-500 rounded" />
          <span className="text-slate-600 dark:text-slate-400">High Usage (80%+)</span>
        </div>
        <div className="flex items-center space-x-2">
          <div className="w-3 h-3 bg-red-500 rounded" />
          <span className="text-slate-600 dark:text-slate-400">Overage</span>
        </div>
        <div className="flex items-center space-x-2">
          <div className="w-3 h-1 border-t-2 border-dashed border-slate-400" />
          <span className="text-slate-600 dark:text-slate-400">Plan Limit</span>
        </div>
      </div>

      {/* Date Range */}
      <div className="flex justify-between text-xs text-slate-500 dark:text-slate-400 px-4">
        <span>{data[0]?.date.toLocaleDateString()}</span>
        <span>{data[data.length - 1]?.date.toLocaleDateString()}</span>
      </div>
    </div>
  );
};

export default UsageChart;