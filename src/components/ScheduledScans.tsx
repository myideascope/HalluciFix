import React, { useState } from 'react';
import { Calendar, Clock, Plus, Edit2, Trash2, Play, Pause, CheckCircle2, AlertTriangle, XCircle, Settings as SettingsIcon, Bell, FileText, Users, BarChart3, Cloud, FolderOpen } from 'lucide-react';
import GoogleDrivePicker from './GoogleDrivePicker';
import { GoogleDriveFile } from '../lib/googleDrive';
import { ToastContainer } from './Toast';
import { useToast } from '../hooks/useToast';

interface ScheduledScan {
  id: string;
  name: string;
  description: string;
  frequency: 'hourly' | 'daily' | 'weekly' | 'monthly';
  time: string;
  sources: string[];
  enabled: boolean;
  lastRun?: string;
  nextRun: string;
  status: 'active' | 'paused' | 'error';
  googleDriveFiles?: GoogleDriveFile[];
  results?: {
    totalAnalyzed: number;
    averageAccuracy: number;
    issuesFound: number;
    riskLevel: 'low' | 'medium' | 'high' | 'critical';
  };
}

const ScheduledScans: React.FC = () => {
  const [scans, setScans] = useState<ScheduledScan[]>([
    {
      id: '1',
      name: 'Marketing Content Review',
      description: 'Daily analysis of marketing materials and blog posts',
      frequency: 'daily',
      time: '09:00',
      sources: ['Marketing Blog', 'Social Media Posts', 'Email Campaigns'],
      enabled: true,
      lastRun: '2025-01-17 09:00',
      nextRun: '2025-01-18 09:00',
      status: 'active',
      googleDriveFiles: [],
      results: {
        totalAnalyzed: 47,
        averageAccuracy: 92.3,
        issuesFound: 3,
        riskLevel: 'low'
      }
    },
    {
      id: '2',
      name: 'Customer Support Monitoring',
      description: 'Hourly check of AI-generated support responses',
      frequency: 'hourly',
      time: '00:00',
      sources: ['Support Tickets', 'Chat Responses', 'Knowledge Base'],
      enabled: true,
      lastRun: '2025-01-17 15:00',
      nextRun: '2025-01-17 16:00',
      status: 'active',
      googleDriveFiles: [],
      results: {
        totalAnalyzed: 156,
        averageAccuracy: 96.8,
        issuesFound: 2,
        riskLevel: 'low'
      }
    },
    {
      id: '3',
      name: 'Research Document Validation',
      description: 'Weekly comprehensive analysis of research publications',
      frequency: 'weekly',
      time: '08:00',
      sources: ['Research Papers', 'Technical Documentation', 'White Papers'],
      enabled: false,
      lastRun: '2025-01-10 08:00',
      nextRun: '2025-01-24 08:00',
      status: 'paused',
      googleDriveFiles: [],
      results: {
        totalAnalyzed: 23,
        averageAccuracy: 87.1,
        issuesFound: 8,
        riskLevel: 'medium'
      }
    }
  ]);

  const [showCreateModal, setShowCreateModal] = useState(false);
  const [editingScan, setEditingScan] = useState<ScheduledScan | null>(null);
  const [showGoogleDrivePicker, setShowGoogleDrivePicker] = useState(false);
  const [newScan, setNewScan] = useState({
    name: '',
    description: '',
    frequency: 'daily' as const,
    time: '09:00',
    sources: [''],
    googleDriveFiles: [] as GoogleDriveFile[],
    enabled: true
  });
  const { toasts, removeToast, showWarning, showSuccess } = useToast();

  const toggleScan = (id: string) => {
    setScans(prev => prev.map(scan => 
      scan.id === id 
        ? { ...scan, enabled: !scan.enabled, status: scan.enabled ? 'paused' : 'active' as const }
        : scan
    ));
  };

  const deleteScan = (id: string) => {
    setScans(prev => prev.filter(scan => scan.id !== id));
  };

  const checkScheduleConflict = (frequency: string, time: string, excludeId?: string) => {
    return scans.some(scan => {
      if (excludeId && scan.id === excludeId) return false;
      return scan.frequency === frequency && scan.time === time && scan.enabled;
    });
  };

  const createScan = () => {
    // Check for schedule conflicts
    const hasConflict = checkScheduleConflict(newScan.frequency, newScan.time);
    
    if (hasConflict) {
      const conflictingScan = scans.find(scan => 
        scan.frequency === newScan.frequency && 
        scan.time === newScan.time && 
        scan.enabled
      );
      
      showWarning(
        'Schedule Conflict Detected',
        `Another scan "${conflictingScan?.name}" is already scheduled for ${newScan.frequency} at ${newScan.time}. Both scans will run at the same time.`,
        7000
      );
    }
    
    const scan: ScheduledScan = {
      id: Date.now().toString(),
      ...newScan,
      sources: newScan.sources.filter(s => s.trim()),
      lastRun: undefined,
      nextRun: getNextRunTime(newScan.frequency, newScan.time),
      status: 'active'
    };
    
    setScans(prev => [...prev, scan]);
    setShowCreateModal(false);
    
    showSuccess(
      'Schedule Created',
      `"${newScan.name}" has been scheduled successfully.`
    );
    
    setNewScan({
      name: '',
      description: '',
      frequency: 'daily',
      time: '09:00',
      sources: [''],
      googleDriveFiles: [],
      enabled: true
    });
  };

  const getNextRunTime = (frequency: string, time: string) => {
    const now = new Date();
    const [hours, minutes] = time.split(':').map(Number);
    const next = new Date(now);
    next.setHours(hours, minutes, 0, 0);
    
    if (next <= now) {
      switch (frequency) {
        case 'hourly':
          next.setHours(next.getHours() + 1);
          break;
        case 'daily':
          next.setDate(next.getDate() + 1);
          break;
        case 'weekly':
          next.setDate(next.getDate() + 7);
          break;
        case 'monthly':
          next.setMonth(next.getMonth() + 1);
          break;
      }
    }
    
    return next.toISOString().slice(0, 16).replace('T', ' ');
  };

  const getStatusIcon = (status: string) => {
    switch (status) {
      case 'active': return <CheckCircle2 className="w-4 h-4 text-green-600" />;
      case 'paused': return <Pause className="w-4 h-4 text-amber-600" />;
      case 'error': return <XCircle className="w-4 h-4 text-red-600" />;
      default: return <Clock className="w-4 h-4 text-slate-500" />;
    }
  };

  const getRiskColor = (risk: string) => {
    switch (risk) {
      case 'low': return 'text-green-700 bg-green-100';
      case 'medium': return 'text-amber-700 bg-amber-100';
      case 'high': return 'text-orange-700 bg-orange-100';
      case 'critical': return 'text-red-700 bg-red-100';
      default: return 'text-slate-700 bg-slate-100';
    }
  };

  const addSource = () => {
    setNewScan(prev => ({
      ...prev,
      sources: [...prev.sources, '']
    }));
  };

  const updateSource = (index: number, value: string) => {
    setNewScan(prev => ({
      ...prev,
      sources: prev.sources.map((source, i) => i === index ? value : source)
    }));
  };

  const removeSource = (index: number) => {
    setNewScan(prev => ({
      ...prev,
      sources: prev.sources.filter((_, i) => i !== index)
    }));
  };

  const handleGoogleDriveFilesSelected = (files: GoogleDriveFile[]) => {
    setNewScan(prev => ({
      ...prev,
      googleDriveFiles: files
    }));
  };

  const removeGoogleDriveFile = (fileId: string) => {
    setNewScan(prev => ({
      ...prev,
      googleDriveFiles: prev.googleDriveFiles.filter(file => file.id !== fileId)
    }));
  };

  return (
    <div className="space-y-8">
      <ToastContainer toasts={toasts} onClose={removeToast} />
      
      {/* Header */}
      <div className="bg-white dark:bg-slate-800 rounded-xl shadow-sm border border-slate-200 dark:border-slate-700 p-6 transition-colors duration-200">
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-xl font-bold text-slate-900 dark:text-slate-100 mb-2">Scheduled Content Monitoring</h2>
            <p className="text-slate-600 dark:text-slate-400">Automate AI content verification with scheduled scans and real-time alerts.</p>
          </div>
          
          <button
            onClick={() => setShowCreateModal(true)}
            className="flex items-center space-x-2 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors"
          >
            <Plus className="w-4 h-4" />
            <span>Create Schedule</span>
          </button>
        </div>
      </div>

      {/* Overview Stats */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-6">
        <div className="bg-white dark:bg-slate-800 rounded-xl shadow-sm border border-slate-200 dark:border-slate-700 p-6 transition-colors duration-200">
          <div className="flex items-center justify-between mb-4">
            <div className="p-3 bg-blue-100 rounded-lg">
              <Calendar className="w-6 h-6 text-blue-600" />
            </div>
            <span className="text-sm font-medium text-green-600">+2 this week</span>
          </div>
          <div>
            <p className="text-2xl font-bold text-slate-900 dark:text-slate-100 mb-1">{scans.length}</p>
            <p className="text-sm text-slate-600 dark:text-slate-400">Active Schedules</p>
          </div>
        </div>

        <div className="bg-white dark:bg-slate-800 rounded-xl shadow-sm border border-slate-200 dark:border-slate-700 p-6 transition-colors duration-200">
          <div className="flex items-center justify-between mb-4">
            <div className="p-3 bg-green-100 rounded-lg">
              <CheckCircle2 className="w-6 h-6 text-green-600" />
            </div>
            <span className="text-sm font-medium text-green-600">98.2% uptime</span>
          </div>
          <div>
            <p className="text-2xl font-bold text-slate-900 dark:text-slate-100 mb-1">
              {scans.filter(s => s.enabled).length}
            </p>
            <p className="text-sm text-slate-600 dark:text-slate-400">Running Scans</p>
          </div>
        </div>

        <div className="bg-white dark:bg-slate-800 rounded-xl shadow-sm border border-slate-200 dark:border-slate-700 p-6 transition-colors duration-200">
          <div className="flex items-center justify-between mb-4">
            <div className="p-3 bg-purple-100 rounded-lg">
              <BarChart3 className="w-6 h-6 text-purple-600" />
            </div>
            <span className="text-sm font-medium text-blue-600">Last 24h</span>
          </div>
          <div>
            <p className="text-2xl font-bold text-slate-900 dark:text-slate-100 mb-1">
              {scans.reduce((sum, scan) => sum + (scan.results?.totalAnalyzed || 0), 0)}
            </p>
            <p className="text-sm text-slate-600 dark:text-slate-400">Documents Analyzed</p>
          </div>
        </div>

        <div className="bg-white dark:bg-slate-800 rounded-xl shadow-sm border border-slate-200 dark:border-slate-700 p-6 transition-colors duration-200">
          <div className="flex items-center justify-between mb-4">
            <div className="p-3 bg-amber-100 rounded-lg">
              <AlertTriangle className="w-6 h-6 text-amber-600" />
            </div>
            <span className="text-sm font-medium text-amber-600">Needs attention</span>
          </div>
          <div>
            <p className="text-2xl font-bold text-slate-900 dark:text-slate-100 mb-1">
              {scans.reduce((sum, scan) => sum + (scan.results?.issuesFound || 0), 0)}
            </p>
            <p className="text-sm text-slate-600 dark:text-slate-400">Issues Detected</p>
          </div>
        </div>
      </div>

      {/* Scheduled Scans List */}
      <div className="bg-white dark:bg-slate-800 rounded-xl shadow-sm border border-slate-200 dark:border-slate-700 p-6 transition-colors duration-200">
        <div className="flex items-center justify-between mb-6">
          <h3 className="text-lg font-bold text-slate-900 dark:text-slate-100">Scheduled Scans</h3>
          <div className="flex items-center space-x-2">
            <span className="text-sm text-slate-500 dark:text-slate-400">
              {scans.filter(s => s.enabled).length} of {scans.length} active
            </span>
          </div>
        </div>

        <div className="space-y-4">
          {scans.map((scan) => (
            <div key={scan.id} className="border border-slate-200 dark:border-slate-600 rounded-lg p-6 hover:bg-slate-50 dark:hover:bg-slate-700 transition-colors">
              <div className="flex items-start justify-between">
                <div className="flex-1">
                  <div className="flex items-center space-x-3 mb-2">
                    {getStatusIcon(scan.status)}
                    <h4 className="font-semibold text-slate-900 dark:text-slate-100">{scan.name}</h4>
                    <span className="px-2 py-1 bg-slate-100 dark:bg-slate-700 text-slate-600 dark:text-slate-300 text-xs rounded-full capitalize">
                      {scan.frequency}
                    </span>
                  </div>
                  
                  <p className="text-slate-600 dark:text-slate-400 mb-3">{scan.description}</p>
                  
                  <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 mb-4">
                    <div>
                      <p className="text-xs font-medium text-slate-500 dark:text-slate-400 mb-1">Next Run</p>
                      <p className="text-sm text-slate-900 dark:text-slate-100">{scan.nextRun}</p>
                    </div>
                    
                    <div>
                      <p className="text-xs font-medium text-slate-500 dark:text-slate-400 mb-1">Sources</p>
                      <p className="text-sm text-slate-900 dark:text-slate-100">{scan.sources.length} configured</p>
                    </div>
                    
                    {scan.results && (
                      <>
                        <div>
                          <p className="text-xs font-medium text-slate-500 dark:text-slate-400 mb-1">Last Results</p>
                          <p className="text-sm text-slate-900 dark:text-slate-100">
                            {scan.results.totalAnalyzed} docs, {scan.results.averageAccuracy}% accuracy
                          </p>
                        </div>
                        
                        <div>
                          <p className="text-xs font-medium text-slate-500 dark:text-slate-400 mb-1">Risk Level</p>
                          <span className={`px-2 py-1 rounded text-xs font-medium capitalize ${getRiskColor(scan.results.riskLevel)}`}>
                            {scan.results.riskLevel}
                          </span>
                        </div>
                      </>
                    )}
                  </div>
                  
                  <div className="flex flex-wrap gap-2">
                    {scan.sources.map((source, index) => (
                      <span key={index} className="px-2 py-1 bg-blue-50 text-blue-700 text-xs rounded">
                        {source}
                      </span>
                    ))}
                    
                    {scan.googleDriveFiles && scan.googleDriveFiles.length > 0 && (
                      <span className="px-2 py-1 bg-green-50 text-green-700 text-xs rounded flex items-center space-x-1">
                        <Cloud className="w-3 h-3" />
                        <span>{scan.googleDriveFiles.length} Google Drive files</span>
                      </span>
                    )}
                  </div>
                </div>
                
                <div className="flex items-center space-x-2 ml-4">
                  <button
                    onClick={() => toggleScan(scan.id)}
                    className={`p-2 rounded-lg transition-colors ${
                      scan.enabled 
                        ? 'text-amber-600 hover:bg-amber-50' 
                        : 'text-green-600 hover:bg-green-50'
                    }`}
                    title={scan.enabled ? 'Pause scan' : 'Resume scan'}
                  >
                    {scan.enabled ? <Pause className="w-4 h-4" /> : <Play className="w-4 h-4" />}
                  </button>
                  
                  <button
                    onClick={() => setEditingScan(scan)}
                    className="p-2 text-slate-600 hover:bg-slate-100 rounded-lg transition-colors"
                    title="Edit scan"
                  >
                    <Edit2 className="w-4 h-4" />
                  </button>
                  
                  <button
                    onClick={() => deleteScan(scan.id)}
                    className="p-2 text-red-600 hover:bg-red-50 rounded-lg transition-colors"
                    title="Delete scan"
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Create/Edit Modal */}
      {(showCreateModal || editingScan) && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-white rounded-xl shadow-xl max-w-2xl w-full mx-4 max-h-[90vh] overflow-y-auto">
            <div className="p-6 border-b border-slate-200">
              <h3 className="text-lg font-bold text-slate-900">
                {editingScan ? 'Edit Scheduled Scan' : 'Create New Scheduled Scan'}
              </h3>
            </div>
            
            <div className="p-6 space-y-6">
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-2">
                  Scan Name
                </label>
                <input
                  type="text"
                  value={newScan.name}
                  onChange={(e) => setNewScan(prev => ({ ...prev, name: e.target.value }))}
                  className="w-full border border-slate-300 rounded-lg px-3 py-2"
                  placeholder="e.g., Marketing Content Review"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-slate-700 mb-2">
                  Description
                </label>
                <textarea
                  value={newScan.description}
                  onChange={(e) => setNewScan(prev => ({ ...prev, description: e.target.value }))}
                  className="w-full border border-slate-300 rounded-lg px-3 py-2 h-20 resize-none"
                  placeholder="Describe what this scan monitors..."
                />
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-2">
                    Frequency
                  </label>
                  <select
                    value={newScan.frequency}
                    onChange={(e) => setNewScan(prev => ({ ...prev, frequency: e.target.value as any }))}
                    className="w-full border border-slate-300 rounded-lg px-3 py-2"
                  >
                    <option value="hourly">Hourly</option>
                    <option value="daily">Daily</option>
                    <option value="weekly">Weekly</option>
                    <option value="monthly">Monthly</option>
                  </select>
                </div>

                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-2">
                    Time
                  </label>
                  <input
                    type="time"
                    value={newScan.time}
                    onChange={(e) => setNewScan(prev => ({ ...prev, time: e.target.value }))}
                    className="w-full border border-slate-300 rounded-lg px-3 py-2"
                  />
                </div>
              </div>

              <div>
                <label className="block text-sm font-medium text-slate-700 mb-2">
                  Content Sources
                </label>
                <div className="space-y-2">
                  {newScan.sources.map((source, index) => (
                    <div key={index} className="flex items-center space-x-2">
                      <input
                        type="text"
                        value={source}
                        onChange={(e) => updateSource(index, e.target.value)}
                        className="flex-1 border border-slate-300 rounded-lg px-3 py-2"
                        placeholder="e.g., Marketing Blog, Support Tickets"
                      />
                      {newScan.sources.length > 1 && (
                        <button
                          onClick={() => removeSource(index)}
                          className="p-2 text-red-600 hover:bg-red-50 rounded-lg transition-colors"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      )}
                    </div>
                  ))}
                  
                  <button
                    onClick={addSource}
                    className="flex items-center space-x-2 px-3 py-2 text-blue-600 hover:bg-blue-50 rounded-lg transition-colors"
                  >
                    <Plus className="w-4 h-4" />
                    <span>Add Source</span>
                  </button>
                </div>
              </div>

              <div>
                <div className="flex items-center justify-between mb-2">
                  <label className="block text-sm font-medium text-slate-700">
                    Google Drive Files
                  </label>
                  <button
                    type="button"
                    onClick={() => setShowGoogleDrivePicker(true)}
                    className="flex items-center space-x-2 px-3 py-1.5 text-sm text-blue-600 hover:text-blue-700 transition-colors"
                  >
                    <Cloud className="w-4 h-4" />
                    <span>Add from Google Drive</span>
                  </button>
                </div>
                
                {newScan.googleDriveFiles.length > 0 && (
                  <div className="space-y-2 max-h-32 overflow-y-auto">
                    {newScan.googleDriveFiles.map((file) => (
                      <div key={file.id} className="flex items-center justify-between p-2 bg-green-50 border border-green-200 rounded">
                        <div className="flex items-center space-x-2">
                          <FolderOpen className="w-4 h-4 text-green-600" />
                          <span className="text-sm text-green-800 truncate">{file.name}</span>
                        </div>
                        <button
                          onClick={() => removeGoogleDriveFile(file.id)}
                          className="p-1 text-green-600 hover:text-red-600 transition-colors"
                        >
                          <Trash2 className="w-3 h-3" />
                        </button>
                      </div>
                    ))}
                  </div>
                )}
                
                <p className="text-xs text-slate-500 mt-1">
                  Select documents from your Google Drive to monitor for content changes
                </p>
              </div>

              <div className="flex items-center justify-between">
                <div>
                  <label className="text-sm font-medium text-slate-700">Enable Immediately</label>
                  <p className="text-xs text-slate-500">Start monitoring as soon as the scan is created</p>
                </div>
                <button
                  onClick={() => setNewScan(prev => ({ ...prev, enabled: !prev.enabled }))}
                  className={`w-12 h-6 rounded-full transition-colors ${
                    newScan.enabled ? 'bg-blue-600' : 'bg-slate-300'
                  }`}
                >
                  <div className={`w-5 h-5 bg-white rounded-full transition-transform ${
                    newScan.enabled ? 'translate-x-6' : 'translate-x-0.5'
                  } mt-0.5`}></div>
                </button>
              </div>
            </div>
            
            <div className="p-6 border-t border-slate-200 flex items-center justify-end space-x-3">
              <button
                onClick={() => {
                  setShowCreateModal(false);
                  setEditingScan(null);
                }}
                className="px-4 py-2 text-slate-600 hover:text-slate-900 transition-colors"
              >
                Cancel
              </button>
              
              <button
                onClick={createScan}
                disabled={!newScan.name.trim() || !newScan.description.trim()}
                className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
              >
                {editingScan ? 'Update Scan' : 'Create Scan'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Google Drive Picker Modal */}
      {showGoogleDrivePicker && (
        <GoogleDrivePicker
          onFilesSelected={handleGoogleDriveFilesSelected}
          onClose={() => setShowGoogleDrivePicker(false)}
          multiSelect={true}
        />
      )}

      {/* Recent Activity */}
      <div className="bg-white dark:bg-slate-800 rounded-xl shadow-sm border border-slate-200 dark:border-slate-700 p-6 transition-colors duration-200">
        <h3 className="text-lg font-bold text-slate-900 dark:text-slate-100 mb-6">Recent Scan Activity</h3>
        
        <div className="space-y-4">
          {[
            {
              scan: 'Marketing Content Review',
              time: '2 hours ago',
              status: 'completed',
              results: '47 documents analyzed, 3 issues found',
              accuracy: 92.3
            },
            {
              scan: 'Customer Support Monitoring',
              time: '1 hour ago',
              status: 'completed',
              results: '23 responses analyzed, 1 issue found',
              accuracy: 96.8
            },
            {
              scan: 'Research Document Validation',
              time: '1 day ago',
              status: 'completed',
              results: '12 papers analyzed, 4 issues found',
              accuracy: 87.1
            }
          ].map((activity, index) => (
            <div key={index} className="flex items-center justify-between p-4 bg-slate-50 dark:bg-slate-700 rounded-lg">
              <div className="flex items-center space-x-4">
                <div className="p-2 bg-green-100 rounded-lg">
                  <CheckCircle2 className="w-4 h-4 text-green-600" />
                </div>
                
                <div>
                  <p className="font-medium text-slate-900 dark:text-slate-100">{activity.scan}</p>
                  <p className="text-sm text-slate-600 dark:text-slate-400">{activity.results}</p>
                </div>
              </div>
              
              <div className="text-right">
                <p className="text-sm font-medium text-slate-900 dark:text-slate-100">{activity.accuracy}% accuracy</p>
                <p className="text-xs text-slate-500 dark:text-slate-400">{activity.time}</p>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Configuration Tips */}
      <div className="bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 rounded-xl p-6 transition-colors duration-200">
        <h4 className="font-semibold text-blue-900 dark:text-blue-100 mb-3">Scheduling Best Practices</h4>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-sm text-blue-800 dark:text-blue-200">
          <div className="flex items-start space-x-2">
            <CheckCircle2 className="w-4 h-4 text-blue-600 dark:text-blue-400 mt-0.5" />
            <span>Schedule scans during off-peak hours to minimize system load</span>
          </div>
          <div className="flex items-start space-x-2">
            <CheckCircle2 className="w-4 h-4 text-blue-600 dark:text-blue-400 mt-0.5" />
            <span>Use hourly scans for critical, high-volume content sources</span>
          </div>
          <div className="flex items-start space-x-2">
            <CheckCircle2 className="w-4 h-4 text-blue-600 dark:text-blue-400 mt-0.5" />
            <span>Configure alerts for immediate notification of critical issues</span>
          </div>
          <div className="flex items-start space-x-2">
            <CheckCircle2 className="w-4 h-4 text-blue-600 dark:text-blue-400 mt-0.5" />
            <span>Group related content sources for more efficient processing</span>
          </div>
        </div>
      </div>
    </div>
  );
};

export default ScheduledScans;