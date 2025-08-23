import React, { useState } from 'react';
import { Save, RefreshCw, Bell, Shield, Users, Database, Sliders, AlertTriangle, CheckCircle2, Lock, Copy, Eye, EyeOff, Zap, BookOpen, TrendingUp, Plus, XCircle } from 'lucide-react';
import ragService, { KnowledgeSource } from '../lib/ragService';

const Settings: React.FC = () => {
  const [settings, setSettings] = useState({
    accuracyThreshold: 75,
    enableRealTimeAlerts: true,
    batchProcessingEnabled: true,
    autoArchiveResults: false,
    requireManualReview: true,
    sensitivityLevel: 'medium',
    maxContentLength: 10000,
    enableApiAccess: true,
    retentionDays: 90,
    notificationEmail: 'admin@company.com',
    enableRAG: true,
    ragSensitivity: 'medium',
    minSourceReliability: 0.7,
    maxSourceAge: 365
  });

  const [showApiKey, setShowApiKey] = useState(false);
  const [apiKey] = useState('hf_1234567890abcdef1234567890abcdef12345678');
  const [knowledgeSources, setKnowledgeSources] = useState<KnowledgeSource[]>([]);
  const [showAddSourceModal, setShowAddSourceModal] = useState(false);
  const [newSource, setNewSource] = useState({
    name: '',
    description: '',
    url: '',
    type: 'custom' as const,
    reliability_score: 0.8
  });

  // Load knowledge sources on component mount
  React.useEffect(() => {
    const sources = ragService.getKnowledgeSources();
    setKnowledgeSources(sources);
  }, []);

  const handleSettingChange = (key: string, value: any) => {
    setSettings(prev => ({
      ...prev,
      [key]: value
    }));
  };

  const saveSettings = () => {
    // Simulate API call
    console.log('Saving settings:', settings);
    // Show success notification
  };

  const copyApiKey = async () => {
    try {
      await navigator.clipboard.writeText(apiKey);
      // You could add a toast notification here for copy success
    } catch (err) {
      console.error('Failed to copy API key:', err);
    }
  };

  const toggleApiKeyVisibility = () => {
    setShowApiKey(!showApiKey);
  };

  const handleAddKnowledgeSource = () => {
    if (!newSource.name.trim() || !newSource.description.trim()) {
      return;
    }

    const source = ragService.addCustomKnowledgeSource({
      name: newSource.name,
      description: newSource.description,
      url: newSource.url || undefined,
      type: newSource.type,
      reliability_score: newSource.reliability_score,
      last_updated: new Date().toISOString(),
      enabled: true
    });

    setKnowledgeSources(ragService.getKnowledgeSources());
    setShowAddSourceModal(false);
    setNewSource({
      name: '',
      description: '',
      url: '',
      type: 'custom',
      reliability_score: 0.8
    });
  };

  const toggleKnowledgeSource = (sourceId: string) => {
    const source = knowledgeSources.find(s => s.id === sourceId);
    if (source) {
      ragService.updateKnowledgeSource(sourceId, { enabled: !source.enabled });
      setKnowledgeSources(ragService.getKnowledgeSources());
    }
  };

  const removeKnowledgeSource = (sourceId: string) => {
    ragService.removeKnowledgeSource(sourceId);
    setKnowledgeSources(ragService.getKnowledgeSources());
  };

  const getSourceTypeColor = (type: string) => {
    switch (type) {
      case 'wikipedia': return 'text-blue-700 bg-blue-100';
      case 'academic': return 'text-purple-700 bg-purple-100';
      case 'news': return 'text-orange-700 bg-orange-100';
      case 'government': return 'text-green-700 bg-green-100';
      case 'custom': return 'text-slate-700 bg-slate-100';
      default: return 'text-slate-700 bg-slate-100';
    }
  };

  return (
    <div className="space-y-8">
      {/* Header */}
      <div className="bg-white dark:bg-slate-800 rounded-xl shadow-sm border border-slate-200 dark:border-slate-700 p-6 transition-colors duration-200">
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-xl font-bold text-slate-900 dark:text-slate-100 mb-1">System Configuration</h2>
            <p className="text-slate-600 dark:text-slate-400">Customize hallucination detection parameters and system behavior</p>
          </div>
          
          <div className="flex items-center space-x-3">
            <button className="flex items-center space-x-2 px-4 py-2 text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-200 transition-colors">
              <RefreshCw className="w-4 h-4" />
              <span>Reset</span>
            </button>
            
            <button 
              onClick={saveSettings}
              className="flex items-center space-x-2 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors"
            >
              <Save className="w-4 h-4" />
              <span>Save Changes</span>
            </button>
          </div>
        </div>
      </div>

      {/* Detection Settings */}
      <div className="bg-white dark:bg-slate-800 rounded-xl shadow-sm border border-slate-200 dark:border-slate-700 p-6 transition-colors duration-200">
        <div className="flex items-center space-x-2 mb-6">
          <Sliders className="w-5 h-5 text-slate-600 dark:text-slate-400" />
          <h3 className="text-lg font-bold text-slate-900 dark:text-slate-100">Detection Parameters</h3>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          <div className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-2">
                Accuracy Threshold
              </label>
              <div className="flex items-center space-x-4">
                <input
                  type="range"
                  min="50"
                  max="99"
                  value={settings.accuracyThreshold}
                  onChange={(e) => handleSettingChange('accuracyThreshold', parseInt(e.target.value))}
                  className="flex-1 h-2 bg-slate-200 dark:bg-slate-600 rounded-lg appearance-none cursor-pointer"
                />
                <span className="text-sm font-medium text-slate-900 dark:text-slate-100 min-w-[3rem]">
                  {settings.accuracyThreshold}%
                </span>
              </div>
              <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">
                Content below this threshold will be flagged for review
              </p>
            </div>

            <div>
              <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-2">
                Detection Sensitivity
              </label>
              <select
                value={settings.sensitivityLevel}
                onChange={(e) => handleSettingChange('sensitivityLevel', e.target.value)}
                className="w-full border border-slate-300 dark:border-slate-600 rounded-lg px-3 py-2 bg-white dark:bg-slate-700 text-slate-900 dark:text-slate-100"
              >
                <option value="low">Low - Conservative detection</option>
                <option value="medium">Medium - Balanced approach</option>
                <option value="high">High - Aggressive detection</option>
              </select>
            </div>

            <div>
              <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-2">
                Maximum Content Length
              </label>
              <input
                type="number"
                value={settings.maxContentLength}
                onChange={(e) => handleSettingChange('maxContentLength', parseInt(e.target.value))}
                className="w-full border border-slate-300 dark:border-slate-600 rounded-lg px-3 py-2 bg-white dark:bg-slate-700 text-slate-900 dark:text-slate-100"
              />
              <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">
                Maximum characters per analysis (1,000 - 50,000)
              </p>
            </div>
          </div>

          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <div>
                <label className="text-sm font-medium text-slate-700 dark:text-slate-300">Real-time Alerts</label>
                <p className="text-xs text-slate-500 dark:text-slate-400">Instant notifications for high-risk content</p>
              </div>
              <button
                onClick={() => handleSettingChange('enableRealTimeAlerts', !settings.enableRealTimeAlerts)}
                className={`w-12 h-6 rounded-full transition-colors ${
                  settings.enableRealTimeAlerts ? 'bg-blue-600' : 'bg-slate-300 dark:bg-slate-600'
                }`}
              >
                <div className={`w-5 h-5 bg-white rounded-full transition-transform ${
                  settings.enableRealTimeAlerts ? 'translate-x-6' : 'translate-x-0.5'
                } mt-0.5`}></div>
              </button>
            </div>

            <div className="flex items-center justify-between">
              <div>
                <label className="text-sm font-medium text-slate-700 dark:text-slate-300">Require Manual Review</label>
                <p className="text-xs text-slate-500 dark:text-slate-400">Human verification for critical content</p>
              </div>
              <button
                onClick={() => handleSettingChange('requireManualReview', !settings.requireManualReview)}
                className={`w-12 h-6 rounded-full transition-colors ${
                  settings.requireManualReview ? 'bg-blue-600' : 'bg-slate-300 dark:bg-slate-600'
                }`}
              >
                <div className={`w-5 h-5 bg-white rounded-full transition-transform ${
                  settings.requireManualReview ? 'translate-x-6' : 'translate-x-0.5'
                } mt-0.5`}></div>
              </button>
            </div>

            <div className="flex items-center justify-between">
              <div>
                <label className="text-sm font-medium text-slate-700 dark:text-slate-300">Batch Processing</label>
                <p className="text-xs text-slate-500 dark:text-slate-400">Enable processing multiple documents</p>
              </div>
              <button
                onClick={() => handleSettingChange('batchProcessingEnabled', !settings.batchProcessingEnabled)}
                className={`w-12 h-6 rounded-full transition-colors ${
                  settings.batchProcessingEnabled ? 'bg-blue-600' : 'bg-slate-300 dark:bg-slate-600'
                }`}
              >
                <div className={`w-5 h-5 bg-white rounded-full transition-transform ${
                  settings.batchProcessingEnabled ? 'translate-x-6' : 'translate-x-0.5'
                } mt-0.5`}></div>
              </button>
            </div>

            <div className="flex items-center justify-between">
              <div>
                <label className="text-sm font-medium text-slate-700 dark:text-slate-300">API Access</label>
                <p className="text-xs text-slate-500 dark:text-slate-400">Enable external API integrations</p>
              </div>
              <button
                onClick={() => handleSettingChange('enableApiAccess', !settings.enableApiAccess)}
                className={`w-12 h-6 rounded-full transition-colors ${
                  settings.enableApiAccess ? 'bg-blue-600' : 'bg-slate-300 dark:bg-slate-600'
                }`}
              >
                <div className={`w-5 h-5 bg-white rounded-full transition-transform ${
                  settings.enableApiAccess ? 'translate-x-6' : 'translate-x-0.5'
                } mt-0.5`}></div>
              </button>
            </div>

            <div className="flex items-center justify-between">
              <div>
                <label className="text-sm font-medium text-slate-700 dark:text-slate-300">RAG Enhancement</label>
                <p className="text-xs text-slate-500 dark:text-slate-400">Enable Retrieval Augmented Generation</p>
              </div>
              <button
                onClick={() => handleSettingChange('enableRAG', !settings.enableRAG)}
                className={`w-12 h-6 rounded-full transition-colors ${
                  settings.enableRAG ? 'bg-blue-600' : 'bg-slate-300 dark:bg-slate-600'
                }`}
              >
                <div className={`w-5 h-5 bg-white rounded-full transition-transform ${
                  settings.enableRAG ? 'translate-x-6' : 'translate-x-0.5'
                } mt-0.5`}></div>
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* RAG Configuration */}
      <div className="bg-white dark:bg-slate-800 rounded-xl shadow-sm border border-slate-200 dark:border-slate-700 p-6 transition-colors duration-200">
        <div className="flex items-center space-x-2 mb-6">
          <Zap className="w-5 h-5 text-slate-600 dark:text-slate-400" />
          <h3 className="text-lg font-bold text-slate-900 dark:text-slate-100">RAG Configuration</h3>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-6">
          <div>
            <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-2">
              RAG Sensitivity
            </label>
            <select
              value={settings.ragSensitivity}
              onChange={(e) => handleSettingChange('ragSensitivity', e.target.value)}
              className="w-full border border-slate-300 dark:border-slate-600 rounded-lg px-3 py-2 bg-white dark:bg-slate-700 text-slate-900 dark:text-slate-100"
            >
              <option value="low">Low - Conservative verification</option>
              <option value="medium">Medium - Balanced approach</option>
              <option value="high">High - Aggressive verification</option>
            </select>
          </div>

          <div>
            <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-2">
              Minimum Source Reliability
            </label>
            <div className="flex items-center space-x-4">
              <input
                type="range"
                min="0.5"
                max="1.0"
                step="0.1"
                value={settings.minSourceReliability}
                onChange={(e) => handleSettingChange('minSourceReliability', parseFloat(e.target.value))}
                className="flex-1 h-2 bg-slate-200 dark:bg-slate-600 rounded-lg appearance-none cursor-pointer"
              />
              <span className="text-sm font-medium text-slate-900 dark:text-slate-100 min-w-[3rem]">
                {(settings.minSourceReliability * 100).toFixed(0)}%
              </span>
            </div>
          </div>
        </div>

        {/* Knowledge Sources */}
        <div>
          <div className="flex items-center justify-between mb-4">
            <h4 className="font-medium text-slate-900 dark:text-slate-100">Knowledge Sources</h4>
            <button
              onClick={() => setShowAddSourceModal(true)}
              className="flex items-center space-x-2 px-3 py-1.5 text-sm text-blue-600 dark:text-blue-400 hover:text-blue-700 dark:hover:text-blue-300 transition-colors"
            >
              <Plus className="w-4 h-4" />
              <span>Add Source</span>
            </button>
          </div>
          
          <div className="space-y-3">
            {knowledgeSources.map((source) => (
              <div key={source.id} className="flex items-center justify-between p-3 bg-slate-50 dark:bg-slate-700 rounded-lg">
                <div className="flex items-center space-x-3">
                  <div className={`w-2 h-2 rounded-full ${source.enabled ? 'bg-green-500' : 'bg-slate-400'}`}></div>
                  <div>
                    <div className="flex items-center space-x-2">
                      <p className="text-sm font-medium text-slate-900 dark:text-slate-100">{source.name}</p>
                      <span className={`px-2 py-1 rounded text-xs font-medium capitalize ${getSourceTypeColor(source.type)}`}>
                        {source.type}
                      </span>
                    </div>
                    <p className="text-xs text-slate-500 dark:text-slate-400">{source.description}</p>
                    <p className="text-xs text-slate-500 dark:text-slate-400">
                      Reliability: {(source.reliability_score * 100).toFixed(0)}%
                    </p>
                  </div>
                </div>
                
                <div className="flex items-center space-x-2">
                  <button
                    onClick={() => toggleKnowledgeSource(source.id)}
                    className={`w-8 h-4 rounded-full transition-colors ${
                      source.enabled ? 'bg-green-600' : 'bg-slate-300 dark:bg-slate-600'
                    }`}
                  >
                    <div className={`w-3 h-3 bg-white rounded-full transition-transform ${
                      source.enabled ? 'translate-x-4' : 'translate-x-0.5'
                    } mt-0.5`}></div>
                  </button>
                  
                  {source.type === 'custom' && (
                    <button
                      onClick={() => removeKnowledgeSource(source.id)}
                      className="p-1 text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-900/20 rounded transition-colors"
                    >
                      <XCircle className="w-4 h-4" />
                    </button>
                  )}
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Notification Settings */}
      <div className="bg-white dark:bg-slate-800 rounded-xl shadow-sm border border-slate-200 dark:border-slate-700 p-6 transition-colors duration-200">
        <div className="flex items-center space-x-2 mb-6">
          <Bell className="w-5 h-5 text-slate-600 dark:text-slate-400" />
          <h3 className="text-lg font-bold text-slate-900 dark:text-slate-100">Notifications</h3>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          <div>
            <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-2">
              Notification Email
            </label>
            <input
              type="email"
              value={settings.notificationEmail}
              onChange={(e) => handleSettingChange('notificationEmail', e.target.value)}
              className="w-full border border-slate-300 dark:border-slate-600 rounded-lg px-3 py-2 bg-white dark:bg-slate-700 text-slate-900 dark:text-slate-100"
              placeholder="admin@company.com"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-2">
              Data Retention Period
            </label>
            <select
              value={settings.retentionDays}
              onChange={(e) => handleSettingChange('retentionDays', parseInt(e.target.value))}
              className="w-full border border-slate-300 dark:border-slate-600 rounded-lg px-3 py-2 bg-white dark:bg-slate-700 text-slate-900 dark:text-slate-100"
            >
              <option value={30}>30 days</option>
              <option value={60}>60 days</option>
              <option value={90}>90 days</option>
              <option value={180}>180 days</option>
              <option value={365}>1 year</option>
            </select>
          </div>
        </div>
      </div>

      {/* Security Settings */}
      <div className="bg-white dark:bg-slate-800 rounded-xl shadow-sm border border-slate-200 dark:border-slate-700 p-6 transition-colors duration-200">
        <div className="flex items-center space-x-2 mb-6">
          <Shield className="w-5 h-5 text-slate-600 dark:text-slate-400" />
          <h3 className="text-lg font-bold text-slate-900 dark:text-slate-100">Security & Privacy</h3>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          <div className="space-y-4">
            <div className="p-4 bg-slate-50 dark:bg-slate-700 rounded-lg">
              <div className="flex items-center space-x-2 mb-2">
                <Lock className="w-4 h-4 text-slate-600 dark:text-slate-400" />
                <span className="text-sm font-medium text-slate-900 dark:text-slate-100">Data Encryption</span>
              </div>
              <p className="text-xs text-slate-600 dark:text-slate-400">All content is encrypted in transit and at rest</p>
            </div>

            <div className="p-4 bg-slate-50 dark:bg-slate-700 rounded-lg">
              <div className="flex items-center space-x-2 mb-2">
                <Database className="w-4 h-4 text-slate-600 dark:text-slate-400" />
                <span className="text-sm font-medium text-slate-900 dark:text-slate-100">Data Processing</span>
              </div>
              <p className="text-xs text-slate-600 dark:text-slate-400">Content is not stored after analysis unless specified</p>
            </div>
          </div>

          <div className="space-y-4">
            <div className="p-4 bg-slate-50 dark:bg-slate-700 rounded-lg">
              <div className="flex items-center space-x-2 mb-2">
                <Users className="w-4 h-4 text-slate-600 dark:text-slate-400" />
                <span className="text-sm font-medium text-slate-900 dark:text-slate-100">Access Control</span>
              </div>
              <p className="text-xs text-slate-600 dark:text-slate-400">Role-based permissions and audit logging enabled</p>
            </div>

            <div className="p-4 bg-slate-50 dark:bg-slate-700 rounded-lg">
              <div className="flex items-center space-x-2 mb-2">
                <Shield className="w-4 h-4 text-slate-600 dark:text-slate-400" />
                <span className="text-sm font-medium text-slate-900 dark:text-slate-100">Compliance</span>
              </div>
              <p className="text-xs text-slate-600 dark:text-slate-400">SOC 2 Type II and GDPR compliant infrastructure</p>
            </div>
          </div>
        </div>
      </div>

      {/* Advanced Settings */}
      <div className="bg-white dark:bg-slate-800 rounded-xl shadow-sm border border-slate-200 dark:border-slate-700 p-6 transition-colors duration-200">
        <h3 className="text-lg font-bold text-slate-900 dark:text-slate-100 mb-6">Advanced Configuration</h3>
        
        <div className="bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800 rounded-lg p-4 mb-6">
          <div className="flex items-start space-x-3">
            <AlertTriangle className="w-5 h-5 text-amber-600 mt-0.5" />
            <div>
              <p className="text-sm font-medium text-amber-900 dark:text-amber-100">Advanced Settings</p>
              <p className="text-xs text-amber-700 dark:text-amber-300">
                These settings affect core detection algorithms. Changes may impact accuracy.
              </p>
            </div>
          </div>
        </div>

        <div className="space-y-6">
          <div>
            <h4 className="font-medium text-slate-900 dark:text-slate-100 mb-3">Detection Models</h4>
            <div className="space-y-3">
              {[
                { name: 'Factual Accuracy Model', version: 'v2.1.3', status: 'active' },
                { name: 'Statistical Verification', version: 'v1.8.2', status: 'active' },
                { name: 'Source Attribution', version: 'v1.5.1', status: 'active' },
                { name: 'Logical Consistency', version: 'v2.0.1', status: 'beta' }
              ].map((model, index) => (
                <div key={index} className="flex items-center justify-between p-3 bg-slate-50 dark:bg-slate-700 rounded-lg">
                  <div className="flex items-center space-x-3">
                    <div className={`w-2 h-2 rounded-full ${
                      model.status === 'active' ? 'bg-green-500' : 'bg-amber-500'
                    }`}></div>
                    <div>
                      <p className="text-sm font-medium text-slate-900 dark:text-slate-100">{model.name}</p>
                      <p className="text-xs text-slate-500 dark:text-slate-400">Version {model.version}</p>
                    </div>
                  </div>
                  
                  <span className={`px-2 py-1 rounded text-xs font-medium ${
                    model.status === 'active' 
                      ? 'text-green-700 bg-green-100 dark:text-green-300 dark:bg-green-900/30' 
                      : 'text-amber-700 bg-amber-100 dark:text-amber-300 dark:bg-amber-900/30'
                  }`}>
                    {model.status}
                  </span>
                </div>
              ))}
            </div>
          </div>

          <div>
            <h4 className="font-medium text-slate-900 dark:text-slate-100 mb-3">API Configuration</h4>
            <div className="space-y-4">
              <div className="p-4 bg-slate-50 dark:bg-slate-700 rounded-lg">
                <div className="flex items-center justify-between mb-2">
                  <span className="text-sm font-medium text-slate-900 dark:text-slate-100">API Key</span>
                  <div className="flex items-center space-x-2">
                    <button
                      onClick={toggleApiKeyVisibility}
                      className="p-1 text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-200 transition-colors"
                      title={showApiKey ? 'Hide API key' : 'Show API key'}
                    >
                      {showApiKey ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                    </button>
                    <button className="text-xs text-blue-600 dark:text-blue-400 hover:text-blue-700 dark:hover:text-blue-300">Regenerate</button>
                  </div>
                </div>
                <div 
                  className="relative font-mono text-xs text-slate-600 dark:text-slate-400 bg-white dark:bg-slate-800 border border-slate-300 dark:border-slate-600 rounded px-3 py-2 cursor-pointer hover:bg-slate-50 dark:hover:bg-slate-700 transition-colors group"
                  onMouseEnter={() => setShowApiKey(true)}
                  onMouseLeave={() => setShowApiKey(false)}
                  onClick={copyApiKey}
                  title="Click to copy"
                >
                  {showApiKey ? apiKey : 'hf_••••••••••••••••••••••••••••••••••••••••'}
                  <div className="absolute inset-0 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity bg-black bg-opacity-75 text-white text-xs rounded">
                    <Copy className="w-3 h-3 mr-1" />
                    Click to copy
                  </div>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">Rate Limit</label>
                  <input
                    type="number"
                    defaultValue="1000"
                    className="w-full border border-slate-300 dark:border-slate-600 rounded px-3 py-2 text-sm bg-white dark:bg-slate-700 text-slate-900 dark:text-slate-100"
                  />
                  <p className="text-xs text-slate-500 dark:text-slate-400">Requests per hour</p>
                </div>
                
                <div>
                  <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">Timeout</label>
                  <input
                    type="number"
                    defaultValue="30"
                    className="w-full border border-slate-300 dark:border-slate-600 rounded px-3 py-2 text-sm bg-white dark:bg-slate-700 text-slate-900 dark:text-slate-100"
                  />
                  <p className="text-xs text-slate-500 dark:text-slate-400">Seconds</p>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Add Knowledge Source Modal */}
      {showAddSourceModal && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-white dark:bg-slate-800 rounded-xl shadow-xl max-w-md w-full mx-4">
            <div className="p-6 border-b border-slate-200 dark:border-slate-700">
              <h3 className="text-lg font-bold text-slate-900 dark:text-slate-100">Add Knowledge Source</h3>
            </div>
            
            <div className="p-6 space-y-4">
              <div>
                <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-2">Source Name</label>
                <input
                  type="text"
                  value={newSource.name}
                  onChange={(e) => setNewSource(prev => ({ ...prev, name: e.target.value }))}
                  className="w-full border border-slate-300 dark:border-slate-600 rounded-lg px-3 py-2 bg-white dark:bg-slate-700 text-slate-900 dark:text-slate-100"
                  placeholder="e.g., Company Knowledge Base"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-2">Description</label>
                <textarea
                  value={newSource.description}
                  onChange={(e) => setNewSource(prev => ({ ...prev, description: e.target.value }))}
                  className="w-full border border-slate-300 dark:border-slate-600 rounded-lg px-3 py-2 h-20 resize-none bg-white dark:bg-slate-700 text-slate-900 dark:text-slate-100"
                  placeholder="Describe the knowledge source..."
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-2">URL (Optional)</label>
                <input
                  type="url"
                  value={newSource.url}
                  onChange={(e) => setNewSource(prev => ({ ...prev, url: e.target.value }))}
                  className="w-full border border-slate-300 dark:border-slate-600 rounded-lg px-3 py-2 bg-white dark:bg-slate-700 text-slate-900 dark:text-slate-100"
                  placeholder="https://example.com"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-2">
                  Reliability Score
                </label>
                <div className="flex items-center space-x-4">
                  <input
                    type="range"
                    min="0.1"
                    max="1.0"
                    step="0.1"
                    value={newSource.reliability_score}
                    onChange={(e) => setNewSource(prev => ({ ...prev, reliability_score: parseFloat(e.target.value) }))}
                    className="flex-1 h-2 bg-slate-200 dark:bg-slate-600 rounded-lg appearance-none cursor-pointer"
                  />
                  <span className="text-sm font-medium text-slate-900 dark:text-slate-100 min-w-[3rem]">
                    {(newSource.reliability_score * 100).toFixed(0)}%
                  </span>
                </div>
              </div>
            </div>
            
            <div className="p-6 border-t border-slate-200 dark:border-slate-700 flex items-center justify-end space-x-3">
              <button
                onClick={() => setShowAddSourceModal(false)}
                className="px-4 py-2 text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-200 transition-colors"
              >
                Cancel
              </button>
              
              <button
                onClick={handleAddKnowledgeSource}
                disabled={!newSource.name.trim() || !newSource.description.trim()}
                className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
              >
                Add Source
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default Settings;