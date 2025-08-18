import React, { useState } from 'react';
import { Save, RefreshCw, Bell, Shield, Users, Database, Sliders, AlertTriangle, CheckCircle2, Lock, Copy, Eye, EyeOff } from 'lucide-react';

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
    notificationEmail: 'admin@company.com'
  });

  const [showApiKey, setShowApiKey] = useState(false);
  const [apiKey] = useState('hf_1234567890abcdef1234567890abcdef12345678');

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

  return (
    <div className="space-y-8">
      {/* Header */}
      <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-6">
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-xl font-bold text-slate-900 mb-1">System Configuration</h2>
            <p className="text-slate-600">Customize hallucination detection parameters and system behavior</p>
          </div>
          
          <div className="flex items-center space-x-3">
            <button className="flex items-center space-x-2 px-4 py-2 text-slate-600 hover:text-slate-900 transition-colors">
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
      <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-6">
        <div className="flex items-center space-x-2 mb-6">
          <Sliders className="w-5 h-5 text-slate-600" />
          <h3 className="text-lg font-bold text-slate-900">Detection Parameters</h3>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          <div className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-2">
                Accuracy Threshold
              </label>
              <div className="flex items-center space-x-4">
                <input
                  type="range"
                  min="50"
                  max="99"
                  value={settings.accuracyThreshold}
                  onChange={(e) => handleSettingChange('accuracyThreshold', parseInt(e.target.value))}
                  className="flex-1 h-2 bg-slate-200 rounded-lg appearance-none cursor-pointer"
                />
                <span className="text-sm font-medium text-slate-900 min-w-[3rem]">
                  {settings.accuracyThreshold}%
                </span>
              </div>
              <p className="text-xs text-slate-500 mt-1">
                Content below this threshold will be flagged for review
              </p>
            </div>

            <div>
              <label className="block text-sm font-medium text-slate-700 mb-2">
                Detection Sensitivity
              </label>
              <select
                value={settings.sensitivityLevel}
                onChange={(e) => handleSettingChange('sensitivityLevel', e.target.value)}
                className="w-full border border-slate-300 rounded-lg px-3 py-2"
              >
                <option value="low">Low - Conservative detection</option>
                <option value="medium">Medium - Balanced approach</option>
                <option value="high">High - Aggressive detection</option>
              </select>
            </div>

            <div>
              <label className="block text-sm font-medium text-slate-700 mb-2">
                Maximum Content Length
              </label>
              <input
                type="number"
                value={settings.maxContentLength}
                onChange={(e) => handleSettingChange('maxContentLength', parseInt(e.target.value))}
                className="w-full border border-slate-300 rounded-lg px-3 py-2"
              />
              <p className="text-xs text-slate-500 mt-1">
                Maximum characters per analysis (1,000 - 50,000)
              </p>
            </div>
          </div>

          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <div>
                <label className="text-sm font-medium text-slate-700">Real-time Alerts</label>
                <p className="text-xs text-slate-500">Instant notifications for high-risk content</p>
              </div>
              <button
                onClick={() => handleSettingChange('enableRealTimeAlerts', !settings.enableRealTimeAlerts)}
                className={`w-12 h-6 rounded-full transition-colors ${
                  settings.enableRealTimeAlerts ? 'bg-blue-600' : 'bg-slate-300'
                }`}
              >
                <div className={`w-5 h-5 bg-white rounded-full transition-transform ${
                  settings.enableRealTimeAlerts ? 'translate-x-6' : 'translate-x-0.5'
                } mt-0.5`}></div>
              </button>
            </div>

            <div className="flex items-center justify-between">
              <div>
                <label className="text-sm font-medium text-slate-700">Require Manual Review</label>
                <p className="text-xs text-slate-500">Human verification for critical content</p>
              </div>
              <button
                onClick={() => handleSettingChange('requireManualReview', !settings.requireManualReview)}
                className={`w-12 h-6 rounded-full transition-colors ${
                  settings.requireManualReview ? 'bg-blue-600' : 'bg-slate-300'
                }`}
              >
                <div className={`w-5 h-5 bg-white rounded-full transition-transform ${
                  settings.requireManualReview ? 'translate-x-6' : 'translate-x-0.5'
                } mt-0.5`}></div>
              </button>
            </div>

            <div className="flex items-center justify-between">
              <div>
                <label className="text-sm font-medium text-slate-700">Batch Processing</label>
                <p className="text-xs text-slate-500">Enable processing multiple documents</p>
              </div>
              <button
                onClick={() => handleSettingChange('batchProcessingEnabled', !settings.batchProcessingEnabled)}
                className={`w-12 h-6 rounded-full transition-colors ${
                  settings.batchProcessingEnabled ? 'bg-blue-600' : 'bg-slate-300'
                }`}
              >
                <div className={`w-5 h-5 bg-white rounded-full transition-transform ${
                  settings.batchProcessingEnabled ? 'translate-x-6' : 'translate-x-0.5'
                } mt-0.5`}></div>
              </button>
            </div>

            <div className="flex items-center justify-between">
              <div>
                <label className="text-sm font-medium text-slate-700">API Access</label>
                <p className="text-xs text-slate-500">Enable external API integrations</p>
              </div>
              <button
                onClick={() => handleSettingChange('enableApiAccess', !settings.enableApiAccess)}
                className={`w-12 h-6 rounded-full transition-colors ${
                  settings.enableApiAccess ? 'bg-blue-600' : 'bg-slate-300'
                }`}
              >
                <div className={`w-5 h-5 bg-white rounded-full transition-transform ${
                  settings.enableApiAccess ? 'translate-x-6' : 'translate-x-0.5'
                } mt-0.5`}></div>
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* Notification Settings */}
      <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-6">
        <div className="flex items-center space-x-2 mb-6">
          <Bell className="w-5 h-5 text-slate-600" />
          <h3 className="text-lg font-bold text-slate-900">Notifications</h3>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-2">
              Notification Email
            </label>
            <input
              type="email"
              value={settings.notificationEmail}
              onChange={(e) => handleSettingChange('notificationEmail', e.target.value)}
              className="w-full border border-slate-300 rounded-lg px-3 py-2"
              placeholder="admin@company.com"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-slate-700 mb-2">
              Data Retention Period
            </label>
            <select
              value={settings.retentionDays}
              onChange={(e) => handleSettingChange('retentionDays', parseInt(e.target.value))}
              className="w-full border border-slate-300 rounded-lg px-3 py-2"
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
      <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-6">
        <div className="flex items-center space-x-2 mb-6">
          <Shield className="w-5 h-5 text-slate-600" />
          <h3 className="text-lg font-bold text-slate-900">Security & Privacy</h3>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          <div className="space-y-4">
            <div className="p-4 bg-slate-50 rounded-lg">
              <div className="flex items-center space-x-2 mb-2">
                <Lock className="w-4 h-4 text-slate-600" />
                <span className="text-sm font-medium text-slate-900">Data Encryption</span>
              </div>
              <p className="text-xs text-slate-600">All content is encrypted in transit and at rest</p>
            </div>

            <div className="p-4 bg-slate-50 rounded-lg">
              <div className="flex items-center space-x-2 mb-2">
                <Database className="w-4 h-4 text-slate-600" />
                <span className="text-sm font-medium text-slate-900">Data Processing</span>
              </div>
              <p className="text-xs text-slate-600">Content is not stored after analysis unless specified</p>
            </div>
          </div>

          <div className="space-y-4">
            <div className="p-4 bg-slate-50 rounded-lg">
              <div className="flex items-center space-x-2 mb-2">
                <Users className="w-4 h-4 text-slate-600" />
                <span className="text-sm font-medium text-slate-900">Access Control</span>
              </div>
              <p className="text-xs text-slate-600">Role-based permissions and audit logging enabled</p>
            </div>

            <div className="p-4 bg-slate-50 rounded-lg">
              <div className="flex items-center space-x-2 mb-2">
                <Shield className="w-4 h-4 text-slate-600" />
                <span className="text-sm font-medium text-slate-900">Compliance</span>
              </div>
              <p className="text-xs text-slate-600">SOC 2 Type II and GDPR compliant infrastructure</p>
            </div>
          </div>
        </div>
      </div>

      {/* Advanced Settings */}
      <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-6">
        <h3 className="text-lg font-bold text-slate-900 mb-6">Advanced Configuration</h3>
        
        <div className="bg-amber-50 border border-amber-200 rounded-lg p-4 mb-6">
          <div className="flex items-start space-x-3">
            <AlertTriangle className="w-5 h-5 text-amber-600 mt-0.5" />
            <div>
              <p className="text-sm font-medium text-amber-900">Advanced Settings</p>
              <p className="text-xs text-amber-700">
                These settings affect core detection algorithms. Changes may impact accuracy.
              </p>
            </div>
          </div>
        </div>

        <div className="space-y-6">
          <div>
            <h4 className="font-medium text-slate-900 mb-3">Detection Models</h4>
            <div className="space-y-3">
              {[
                { name: 'Factual Accuracy Model', version: 'v2.1.3', status: 'active' },
                { name: 'Statistical Verification', version: 'v1.8.2', status: 'active' },
                { name: 'Source Attribution', version: 'v1.5.1', status: 'active' },
                { name: 'Logical Consistency', version: 'v2.0.1', status: 'beta' }
              ].map((model, index) => (
                <div key={index} className="flex items-center justify-between p-3 bg-slate-50 rounded-lg">
                  <div className="flex items-center space-x-3">
                    <div className={`w-2 h-2 rounded-full ${
                      model.status === 'active' ? 'bg-green-500' : 'bg-amber-500'
                    }`}></div>
                    <div>
                      <p className="text-sm font-medium text-slate-900">{model.name}</p>
                      <p className="text-xs text-slate-500">Version {model.version}</p>
                    </div>
                  </div>
                  
                  <span className={`px-2 py-1 rounded text-xs font-medium ${
                    model.status === 'active' 
                      ? 'text-green-700 bg-green-100' 
                      : 'text-amber-700 bg-amber-100'
                  }`}>
                    {model.status}
                  </span>
                </div>
              ))}
            </div>
          </div>

          <div>
            <h4 className="font-medium text-slate-900 mb-3">API Configuration</h4>
            <div className="space-y-4">
              <div className="p-4 bg-slate-50 rounded-lg">
                <div className="flex items-center justify-between mb-2">
                  <span className="text-sm font-medium text-slate-900">API Key</span>
                  <div className="flex items-center space-x-2">
                    <button
                      onClick={toggleApiKeyVisibility}
                      className="p-1 text-slate-600 hover:text-slate-900 transition-colors"
                      title={showApiKey ? 'Hide API key' : 'Show API key'}
                    >
                      {showApiKey ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                    </button>
                    <button className="text-xs text-blue-600 hover:text-blue-700">Regenerate</button>
                  </div>
                </div>
                <div 
                  className="relative font-mono text-xs text-slate-600 bg-white border rounded px-3 py-2 cursor-pointer hover:bg-slate-50 transition-colors group"
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
                  <label className="block text-sm font-medium text-slate-700 mb-1">Rate Limit</label>
                  <input
                    type="number"
                    defaultValue="1000"
                    className="w-full border border-slate-300 rounded px-3 py-2 text-sm"
                  />
                  <p className="text-xs text-slate-500">Requests per hour</p>
                </div>
                
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1">Timeout</label>
                  <input
                    type="number"
                    defaultValue="30"
                    className="w-full border border-slate-300 rounded px-3 py-2 text-sm"
                  />
                  <p className="text-xs text-slate-500">Seconds</p>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>

    </div>
  );
};

export default Settings;