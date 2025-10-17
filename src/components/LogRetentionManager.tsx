/**
 * Log Retention Manager Component
 * Provides interface for configuring and monitoring log retention policies
 */

import React, { useState, useEffect } from 'react';
import {
  Database,
  Archive,
  Trash2,
  Settings,
  BarChart3,
  Clock,
  HardDrive,
  Zap,
  AlertCircle,
  CheckCircle,
  RefreshCw,
  Download,
  Upload
} from 'lucide-react';
import { AdvancedRetentionPolicy, ArchivalStats } from '../lib/logging/advancedRetention';

interface LogRetentionManagerProps {
  className?: string;
}

const LogRetentionManager: React.FC<LogRetentionManagerProps> = ({ className = '' }) => {
  const [policy, setPolicy] = useState<AdvancedRetentionPolicy | null>(null);
  const [stats, setStats] = useState<ArchivalStats | null>(null);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<'overview' | 'policy' | 'tiers' | 'compression'>('overview');
  const [isCleanupRunning, setIsCleanupRunning] = useState(false);

  useEffect(() => {
    loadRetentionData();
  }, []);

  const loadRetentionData = async () => {
    try {
      setLoading(true);
      
      // Mock data - in real implementation, this would call the retention service
      const mockPolicy: AdvancedRetentionPolicy = {
        maxAge: 30 * 24 * 60 * 60 * 1000, // 30 days
        maxSize: 100 * 1024 * 1024, // 100MB
        maxEntries: 100000,
        compressionEnabled: true,
        archivalEnabled: true,
        levelPolicies: {
          debug: { maxAge: 24 * 60 * 60 * 1000, priority: 1 },
          info: { maxAge: 7 * 24 * 60 * 60 * 1000, priority: 2 },
          warn: { maxAge: 30 * 24 * 60 * 60 * 1000, priority: 3 },
          error: { maxAge: 90 * 24 * 60 * 60 * 1000, priority: 4 },
        },
        servicePolicies: {
          'auth-service': { maxAge: 60 * 24 * 60 * 60 * 1000, maxSize: 50 * 1024 * 1024 },
          'api-gateway': { maxAge: 45 * 24 * 60 * 60 * 1000, maxSize: 75 * 1024 * 1024 },
        },
        archivalTiers: [
          {
            name: 'hot',
            minAge: 0,
            maxAge: 24 * 60 * 60 * 1000,
            compressionLevel: 1,
            storageType: 'local',
            enabled: true,
          },
          {
            name: 'warm',
            minAge: 24 * 60 * 60 * 1000,
            maxAge: 7 * 24 * 60 * 60 * 1000,
            compressionLevel: 6,
            storageType: 'cloud',
            enabled: true,
          },
          {
            name: 'cold',
            minAge: 7 * 24 * 60 * 60 * 1000,
            maxAge: 90 * 24 * 60 * 60 * 1000,
            compressionLevel: 9,
            storageType: 'cold',
            enabled: true,
          },
        ],
        compressionSettings: {
          enabled: true,
          algorithm: 'zstd',
          level: 6,
          batchSize: 1000,
          minSizeThreshold: 10240,
        },
        cleanupSchedule: {
          interval: 240,
          enabled: true,
          maintenanceWindow: {
            startHour: 2,
            endHour: 6,
          },
        },
      };

      const mockStats: ArchivalStats = {
        totalEntries: 45678,
        totalSize: 87 * 1024 * 1024, // 87MB
        tierDistribution: {
          hot: { entries: 12000, size: 25 * 1024 * 1024, compressionRatio: 0.8 },
          warm: { entries: 18000, size: 35 * 1024 * 1024, compressionRatio: 0.4 },
          cold: { entries: 15678, size: 27 * 1024 * 1024, compressionRatio: 0.2 },
        },
        oldestEntry: new Date(Date.now() - 85 * 24 * 60 * 60 * 1000),
        newestEntry: new Date(),
        retentionEfficiency: 73.5,
      };

      setPolicy(mockPolicy);
      setStats(mockStats);
    } catch (error) {
      console.error('Failed to load retention data:', error);
    } finally {
      setLoading(false);
    }
  };

  const triggerCleanup = async () => {
    setIsCleanupRunning(true);
    try {
      // Simulate cleanup process
      await new Promise(resolve => setTimeout(resolve, 3000));
      await loadRetentionData(); // Refresh data
    } catch (error) {
      console.error('Cleanup failed:', error);
    } finally {
      setIsCleanupRunning(false);
    }
  };

  const formatBytes = (bytes: number): string => {
    const units = ['B', 'KB', 'MB', 'GB'];
    let size = bytes;
    let unitIndex = 0;
    
    while (size >= 1024 && unitIndex < units.length - 1) {
      size /= 1024;
      unitIndex++;
    }
    
    return `${size.toFixed(1)} ${units[unitIndex]}`;
  };

  const formatDuration = (ms: number): string => {
    const days = Math.floor(ms / (24 * 60 * 60 * 1000));
    const hours = Math.floor((ms % (24 * 60 * 60 * 1000)) / (60 * 60 * 1000));
    
    if (days > 0) {
      return `${days}d ${hours}h`;
    }
    return `${hours}h`;
  };

  if (loading) {
    return (
      <div className={`p-6 ${className}`}>
        <div className="flex items-center justify-center h-64">
          <RefreshCw className="w-8 h-8 animate-spin text-blue-600" />
          <span className="ml-2 text-gray-600">Loading retention data...</span>
        </div>
      </div>
    );
  }

  if (!policy || !stats) {
    return (
      <div className={`p-6 ${className}`}>
        <div className="text-center py-12">
          <AlertCircle className="w-12 h-12 text-red-400 mx-auto mb-4" />
          <h3 className="text-lg font-medium text-gray-900 mb-2">Failed to Load Data</h3>
          <p className="text-gray-600 mb-4">Unable to load retention policy and statistics</p>
          <button
            onClick={loadRetentionData}
            className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700"
          >
            Retry
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className={`p-6 ${className}`}>
      {/* Header */}
      <div className="mb-6">
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-2xl font-bold text-gray-900 mb-2">Log Retention Management</h2>
            <p className="text-gray-600">Configure and monitor log retention policies and archival</p>
          </div>
          <div className="flex gap-2">
            <button
              onClick={triggerCleanup}
              disabled={isCleanupRunning}
              className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50 flex items-center gap-2"
            >
              {isCleanupRunning ? (
                <RefreshCw className="w-4 h-4 animate-spin" />
              ) : (
                <Trash2 className="w-4 h-4" />
              )}
              {isCleanupRunning ? 'Running...' : 'Run Cleanup'}
            </button>
          </div>
        </div>
      </div>

      {/* Tabs */}
      <div className="mb-6">
        <div className="border-b border-gray-200">
          <nav className="-mb-px flex space-x-8">
            {[
              { id: 'overview', label: 'Overview', icon: BarChart3 },
              { id: 'policy', label: 'Policy', icon: Settings },
              { id: 'tiers', label: 'Archival Tiers', icon: Archive },
              { id: 'compression', label: 'Compression', icon: Zap },
            ].map(tab => (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id as any)}
                className={`flex items-center gap-2 py-2 px-1 border-b-2 font-medium text-sm ${
                  activeTab === tab.id
                    ? 'border-blue-500 text-blue-600'
                    : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
                }`}
              >
                <tab.icon className="w-4 h-4" />
                {tab.label}
              </button>
            ))}
          </nav>
        </div>
      </div>

      {/* Tab Content */}
      {activeTab === 'overview' && (
        <div className="space-y-6">
          {/* Summary Cards */}
          <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
            <div className="bg-white p-4 rounded-lg border border-gray-200">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm text-gray-600">Total Entries</p>
                  <p className="text-2xl font-bold text-gray-900">{stats.totalEntries.toLocaleString()}</p>
                </div>
                <Database className="w-8 h-8 text-blue-600" />
              </div>
            </div>
            
            <div className="bg-white p-4 rounded-lg border border-gray-200">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm text-gray-600">Total Size</p>
                  <p className="text-2xl font-bold text-gray-900">{formatBytes(stats.totalSize)}</p>
                </div>
                <HardDrive className="w-8 h-8 text-green-600" />
              </div>
            </div>
            
            <div className="bg-white p-4 rounded-lg border border-gray-200">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm text-gray-600">Retention Efficiency</p>
                  <p className="text-2xl font-bold text-green-600">{stats.retentionEfficiency.toFixed(1)}%</p>
                </div>
                <CheckCircle className="w-8 h-8 text-green-600" />
              </div>
            </div>
            
            <div className="bg-white p-4 rounded-lg border border-gray-200">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm text-gray-600">Data Age Range</p>
                  <p className="text-lg font-bold text-gray-900">
                    {Math.floor((stats.newestEntry.getTime() - stats.oldestEntry.getTime()) / (24 * 60 * 60 * 1000))}d
                  </p>
                </div>
                <Clock className="w-8 h-8 text-purple-600" />
              </div>
            </div>
          </div>

          {/* Tier Distribution */}
          <div className="bg-white p-6 rounded-lg border border-gray-200">
            <h3 className="text-lg font-semibold text-gray-900 mb-4">Storage Tier Distribution</h3>
            <div className="space-y-4">
              {Object.entries(stats.tierDistribution).map(([tierName, tierStats]) => (
                <div key={tierName} className="flex items-center justify-between p-4 bg-gray-50 rounded-lg">
                  <div className="flex items-center space-x-3">
                    <div className={`w-3 h-3 rounded-full ${
                      tierName === 'hot' ? 'bg-red-500' :
                      tierName === 'warm' ? 'bg-yellow-500' :
                      tierName === 'cold' ? 'bg-blue-500' : 'bg-gray-500'
                    }`} />
                    <div>
                      <p className="font-medium text-gray-900 capitalize">{tierName} Storage</p>
                      <p className="text-sm text-gray-600">
                        {tierStats.entries.toLocaleString()} entries • {formatBytes(tierStats.size)}
                      </p>
                    </div>
                  </div>
                  {tierStats.compressionRatio && (
                    <div className="text-right">
                      <p className="text-sm font-medium text-green-600">
                        {Math.round((1 - tierStats.compressionRatio) * 100)}% compressed
                      </p>
                      <p className="text-xs text-gray-500">
                        Ratio: {tierStats.compressionRatio.toFixed(2)}
                      </p>
                    </div>
                  )}
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {activeTab === 'policy' && (
        <div className="space-y-6">
          {/* General Policy */}
          <div className="bg-white p-6 rounded-lg border border-gray-200">
            <h3 className="text-lg font-semibold text-gray-900 mb-4">General Retention Policy</h3>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">Max Age</label>
                <p className="text-lg text-gray-900">{formatDuration(policy.maxAge)}</p>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">Max Size</label>
                <p className="text-lg text-gray-900">{formatBytes(policy.maxSize)}</p>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">Max Entries</label>
                <p className="text-lg text-gray-900">{policy.maxEntries.toLocaleString()}</p>
              </div>
            </div>
          </div>

          {/* Level Policies */}
          <div className="bg-white p-6 rounded-lg border border-gray-200">
            <h3 className="text-lg font-semibold text-gray-900 mb-4">Log Level Policies</h3>
            <div className="space-y-3">
              {Object.entries(policy.levelPolicies).map(([level, levelPolicy]) => (
                <div key={level} className="flex items-center justify-between p-3 bg-gray-50 rounded-lg">
                  <div className="flex items-center space-x-3">
                    <span className={`px-2 py-1 text-xs font-medium rounded-full ${
                      level === 'error' ? 'bg-red-100 text-red-800' :
                      level === 'warn' ? 'bg-yellow-100 text-yellow-800' :
                      level === 'info' ? 'bg-blue-100 text-blue-800' :
                      'bg-gray-100 text-gray-800'
                    }`}>
                      {level.toUpperCase()}
                    </span>
                    <span className="font-medium text-gray-900">Priority: {levelPolicy.priority}</span>
                  </div>
                  <span className="text-gray-600">{formatDuration(levelPolicy.maxAge)}</span>
                </div>
              ))}
            </div>
          </div>

          {/* Service Policies */}
          <div className="bg-white p-6 rounded-lg border border-gray-200">
            <h3 className="text-lg font-semibold text-gray-900 mb-4">Service-Specific Policies</h3>
            <div className="space-y-3">
              {Object.entries(policy.servicePolicies).map(([service, servicePolicy]) => (
                <div key={service} className="flex items-center justify-between p-3 bg-gray-50 rounded-lg">
                  <span className="font-medium text-gray-900">{service}</span>
                  <div className="text-right text-sm text-gray-600">
                    <div>{formatDuration(servicePolicy.maxAge)}</div>
                    <div>{formatBytes(servicePolicy.maxSize)}</div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {activeTab === 'tiers' && (
        <div className="space-y-6">
          <div className="bg-white p-6 rounded-lg border border-gray-200">
            <h3 className="text-lg font-semibold text-gray-900 mb-4">Archival Tiers Configuration</h3>
            <div className="space-y-4">
              {policy.archivalTiers.map((tier, index) => (
                <div key={tier.name} className="border border-gray-200 rounded-lg p-4">
                  <div className="flex items-center justify-between mb-3">
                    <div className="flex items-center space-x-3">
                      <h4 className="text-lg font-medium text-gray-900 capitalize">{tier.name} Tier</h4>
                      <span className={`px-2 py-1 text-xs font-medium rounded-full ${
                        tier.enabled ? 'bg-green-100 text-green-800' : 'bg-red-100 text-red-800'
                      }`}>
                        {tier.enabled ? 'Enabled' : 'Disabled'}
                      </span>
                    </div>
                    <span className="text-sm text-gray-500 capitalize">{tier.storageType} Storage</span>
                  </div>
                  
                  <div className="grid grid-cols-1 md:grid-cols-4 gap-4 text-sm">
                    <div>
                      <span className="text-gray-600">Min Age:</span>
                      <p className="font-medium">{formatDuration(tier.minAge)}</p>
                    </div>
                    <div>
                      <span className="text-gray-600">Max Age:</span>
                      <p className="font-medium">{formatDuration(tier.maxAge)}</p>
                    </div>
                    <div>
                      <span className="text-gray-600">Compression:</span>
                      <p className="font-medium">Level {tier.compressionLevel}</p>
                    </div>
                    <div>
                      <span className="text-gray-600">Storage:</span>
                      <p className="font-medium capitalize">{tier.storageType}</p>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {activeTab === 'compression' && (
        <div className="space-y-6">
          <div className="bg-white p-6 rounded-lg border border-gray-200">
            <h3 className="text-lg font-semibold text-gray-900 mb-4">Compression Settings</h3>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <div>
                <h4 className="text-md font-medium text-gray-900 mb-3">Configuration</h4>
                <div className="space-y-3">
                  <div className="flex justify-between">
                    <span className="text-gray-600">Status:</span>
                    <span className={`font-medium ${
                      policy.compressionSettings.enabled ? 'text-green-600' : 'text-red-600'
                    }`}>
                      {policy.compressionSettings.enabled ? 'Enabled' : 'Disabled'}
                    </span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-gray-600">Algorithm:</span>
                    <span className="font-medium">{policy.compressionSettings.algorithm.toUpperCase()}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-gray-600">Level:</span>
                    <span className="font-medium">{policy.compressionSettings.level}/9</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-gray-600">Batch Size:</span>
                    <span className="font-medium">{policy.compressionSettings.batchSize} entries</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-gray-600">Min Threshold:</span>
                    <span className="font-medium">{formatBytes(policy.compressionSettings.minSizeThreshold)}</span>
                  </div>
                </div>
              </div>
              
              <div>
                <h4 className="text-md font-medium text-gray-900 mb-3">Cleanup Schedule</h4>
                <div className="space-y-3">
                  <div className="flex justify-between">
                    <span className="text-gray-600">Status:</span>
                    <span className={`font-medium ${
                      policy.cleanupSchedule.enabled ? 'text-green-600' : 'text-red-600'
                    }`}>
                      {policy.cleanupSchedule.enabled ? 'Enabled' : 'Disabled'}
                    </span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-gray-600">Interval:</span>
                    <span className="font-medium">{policy.cleanupSchedule.interval} minutes</span>
                  </div>
                  {policy.cleanupSchedule.maintenanceWindow && (
                    <div className="flex justify-between">
                      <span className="text-gray-600">Maintenance Window:</span>
                      <span className="font-medium">
                        {policy.cleanupSchedule.maintenanceWindow.startHour}:00 - {policy.cleanupSchedule.maintenanceWindow.endHour}:00
                      </span>
                    </div>
                  )}
                </div>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default LogRetentionManager;