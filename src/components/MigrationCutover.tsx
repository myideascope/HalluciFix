/**
 * Migration Cutover Component
 * 
 * Provides UI for executing the phased migration from Supabase to AWS
 */

import React, { useState, useEffect } from 'react';
import { 
  Play, 
  Pause, 
  RotateCcw, 
  CheckCircle2, 
  AlertTriangle, 
  Loader2,
  Database,
  Shield,
  Cloud,
  Eye,
  ArrowRight,
  Clock
} from 'lucide-react';
import { 
  migrationCutoverService, 
  MigrationStatus, 
  MigrationOptions 
} from '../lib/migrationCutoverService';
import { useToast } from '../hooks/useToast';

interface MigrationCutoverProps {
  onMigrationComplete?: () => void;
  onMigrationError?: (error: Error) => void;
}

export const MigrationCutover: React.FC<MigrationCutoverProps> = ({
  onMigrationComplete,
  onMigrationError
}) => {
  const [migrationStatus, setMigrationStatus] = useState<MigrationStatus | null>(null);
  const [isExecuting, setIsExecuting] = useState(false);
  const [options, setOptions] = useState<MigrationOptions>({
    preserveSessions: true,
    migrateFiles: true,
    validateData: true,
    rollbackOnError: true,
    batchSize: 100
  });
  const { showToast } = useToast();

  // Check if migration has already been completed
  useEffect(() => {
    const isCompleted = migrationCutoverService.constructor.isMigrationCompleted();
    if (isCompleted) {
      const timestamp = migrationCutoverService.constructor.getMigrationTimestamp();
      setMigrationStatus({
        phase: 'completed',
        progress: 100,
        currentStep: 'Migration previously completed',
        errors: [],
        startTime: timestamp || new Date(),
        endTime: timestamp || new Date(),
        rollbackAvailable: false
      });
    }
  }, []);

  const executeMigration = async () => {
    if (isExecuting) return;

    setIsExecuting(true);
    
    try {
      showToast('Starting migration cutover process...', 'info');
      
      // Start migration with status updates
      const statusUpdateInterval = setInterval(() => {
        const currentStatus = migrationCutoverService.getStatus();
        setMigrationStatus(currentStatus);
      }, 1000);

      const finalStatus = await migrationCutoverService.executeMigration(options);
      
      clearInterval(statusUpdateInterval);
      setMigrationStatus(finalStatus);
      
      if (finalStatus.phase === 'completed') {
        showToast('Migration completed successfully!', 'success');
        onMigrationComplete?.();
      } else {
        throw new Error('Migration did not complete successfully');
      }
      
    } catch (error) {
      const errorMessage = (error as Error).message;
      showToast(`Migration failed: ${errorMessage}`, 'error');
      onMigrationError?.(error as Error);
      
      // Get final status after error
      const finalStatus = migrationCutoverService.getStatus();
      setMigrationStatus(finalStatus);
      
    } finally {
      setIsExecuting(false);
    }
  };

  const getPhaseIcon = (phase: MigrationStatus['phase']) => {
    switch (phase) {
      case 'preparation':
        return <Clock className="w-5 h-5" />;
      case 'auth_migration':
        return <Shield className="w-5 h-5" />;
      case 'storage_migration':
        return <Cloud className="w-5 h-5" />;
      case 'database_cutover':
        return <Database className="w-5 h-5" />;
      case 'validation':
        return <Eye className="w-5 h-5" />;
      case 'completed':
        return <CheckCircle2 className="w-5 h-5 text-green-500" />;
      case 'failed':
        return <AlertTriangle className="w-5 h-5 text-red-500" />;
      default:
        return <Loader2 className="w-5 h-5 animate-spin" />;
    }
  };

  const getPhaseColor = (phase: MigrationStatus['phase']) => {
    switch (phase) {
      case 'completed':
        return 'text-green-600 bg-green-50 border-green-200';
      case 'failed':
        return 'text-red-600 bg-red-50 border-red-200';
      default:
        return 'text-blue-600 bg-blue-50 border-blue-200';
    }
  };

  const phases = [
    { id: 'preparation', label: 'Preparation', description: 'Validate AWS configuration and connectivity' },
    { id: 'auth_migration', label: 'Authentication', description: 'Migrate to AWS Cognito' },
    { id: 'storage_migration', label: 'File Storage', description: 'Migrate files to AWS S3' },
    { id: 'database_cutover', label: 'Database', description: 'Switch to AWS RDS PostgreSQL' },
    { id: 'validation', label: 'Validation', description: 'Verify migration success' }
  ];

  const isPhaseCompleted = (phaseId: string) => {
    if (!migrationStatus) return false;
    const phaseIndex = phases.findIndex(p => p.id === phaseId);
    const currentPhaseIndex = phases.findIndex(p => p.id === migrationStatus.phase);
    return phaseIndex < currentPhaseIndex || migrationStatus.phase === 'completed';
  };

  const isPhaseActive = (phaseId: string) => {
    return migrationStatus?.phase === phaseId;
  };

  return (
    <div className="max-w-4xl mx-auto p-6 space-y-6">
      {/* Header */}
      <div className="text-center">
        <h1 className="text-3xl font-bold text-gray-900 dark:text-gray-100 mb-2">
          AWS Migration Cutover
        </h1>
        <p className="text-gray-600 dark:text-gray-400">
          Execute the phased migration from Supabase to AWS infrastructure
        </p>
      </div>

      {/* Migration Options */}
      {!isExecuting && migrationStatus?.phase !== 'completed' && (
        <div className="bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700 p-6">
          <h2 className="text-lg font-semibold text-gray-900 dark:text-gray-100 mb-4">
            Migration Options
          </h2>
          
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <label className="flex items-center space-x-3">
              <input
                type="checkbox"
                checked={options.preserveSessions}
                onChange={(e) => setOptions(prev => ({ ...prev, preserveSessions: e.target.checked }))}
                className="rounded border-gray-300 text-blue-600 focus:ring-blue-500"
              />
              <div>
                <div className="font-medium text-gray-900 dark:text-gray-100">Preserve Sessions</div>
                <div className="text-sm text-gray-500 dark:text-gray-400">Maintain user authentication during migration</div>
              </div>
            </label>

            <label className="flex items-center space-x-3">
              <input
                type="checkbox"
                checked={options.migrateFiles}
                onChange={(e) => setOptions(prev => ({ ...prev, migrateFiles: e.target.checked }))}
                className="rounded border-gray-300 text-blue-600 focus:ring-blue-500"
              />
              <div>
                <div className="font-medium text-gray-900 dark:text-gray-100">Migrate Files</div>
                <div className="text-sm text-gray-500 dark:text-gray-400">Transfer files from Supabase to S3</div>
              </div>
            </label>

            <label className="flex items-center space-x-3">
              <input
                type="checkbox"
                checked={options.validateData}
                onChange={(e) => setOptions(prev => ({ ...prev, validateData: e.target.checked }))}
                className="rounded border-gray-300 text-blue-600 focus:ring-blue-500"
              />
              <div>
                <div className="font-medium text-gray-900 dark:text-gray-100">Validate Data</div>
                <div className="text-sm text-gray-500 dark:text-gray-400">Verify migration integrity</div>
              </div>
            </label>

            <label className="flex items-center space-x-3">
              <input
                type="checkbox"
                checked={options.rollbackOnError}
                onChange={(e) => setOptions(prev => ({ ...prev, rollbackOnError: e.target.checked }))}
                className="rounded border-gray-300 text-blue-600 focus:ring-blue-500"
              />
              <div>
                <div className="font-medium text-gray-900 dark:text-gray-100">Auto Rollback</div>
                <div className="text-sm text-gray-500 dark:text-gray-400">Rollback on migration failure</div>
              </div>
            </label>
          </div>

          <div className="mt-4">
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
              File Migration Batch Size
            </label>
            <input
              type="number"
              min="10"
              max="1000"
              value={options.batchSize}
              onChange={(e) => setOptions(prev => ({ ...prev, batchSize: parseInt(e.target.value) || 100 }))}
              className="w-32 px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md focus:ring-blue-500 focus:border-blue-500 dark:bg-gray-700 dark:text-gray-100"
            />
            <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">
              Number of files to process in each batch
            </p>
          </div>
        </div>
      )}

      {/* Migration Progress */}
      {migrationStatus && (
        <div className="bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700 p-6">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-lg font-semibold text-gray-900 dark:text-gray-100">
              Migration Progress
            </h2>
            <div className={`px-3 py-1 rounded-full text-sm font-medium border ${getPhaseColor(migrationStatus.phase)}`}>
              {migrationStatus.phase.replace('_', ' ').toUpperCase()}
            </div>
          </div>

          {/* Progress Bar */}
          <div className="mb-6">
            <div className="flex justify-between text-sm text-gray-600 dark:text-gray-400 mb-2">
              <span>{migrationStatus.currentStep}</span>
              <span>{migrationStatus.progress}%</span>
            </div>
            <div className="w-full bg-gray-200 dark:bg-gray-700 rounded-full h-2">
              <div 
                className="bg-blue-600 h-2 rounded-full transition-all duration-300"
                style={{ width: `${migrationStatus.progress}%` }}
              />
            </div>
          </div>

          {/* Phase Steps */}
          <div className="space-y-4">
            {phases.map((phase, index) => (
              <div key={phase.id} className="flex items-center space-x-4">
                <div className={`
                  flex items-center justify-center w-10 h-10 rounded-full border-2 transition-colors
                  ${isPhaseCompleted(phase.id) 
                    ? 'bg-green-100 border-green-500 text-green-600' 
                    : isPhaseActive(phase.id)
                    ? 'bg-blue-100 border-blue-500 text-blue-600'
                    : 'bg-gray-100 border-gray-300 text-gray-400'
                  }
                `}>
                  {isPhaseCompleted(phase.id) ? (
                    <CheckCircle2 className="w-5 h-5" />
                  ) : isPhaseActive(phase.id) ? (
                    <Loader2 className="w-5 h-5 animate-spin" />
                  ) : (
                    getPhaseIcon(phase.id as MigrationStatus['phase'])
                  )}
                </div>
                
                <div className="flex-1">
                  <div className={`font-medium ${
                    isPhaseCompleted(phase.id) || isPhaseActive(phase.id)
                      ? 'text-gray-900 dark:text-gray-100'
                      : 'text-gray-500 dark:text-gray-400'
                  }`}>
                    {phase.label}
                  </div>
                  <div className="text-sm text-gray-500 dark:text-gray-400">
                    {phase.description}
                  </div>
                </div>

                {index < phases.length - 1 && (
                  <ArrowRight className="w-4 h-4 text-gray-400" />
                )}
              </div>
            ))}
          </div>

          {/* Timing Information */}
          {migrationStatus.startTime && (
            <div className="mt-6 pt-4 border-t border-gray-200 dark:border-gray-700">
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4 text-sm">
                <div>
                  <span className="text-gray-500 dark:text-gray-400">Started:</span>
                  <div className="font-medium text-gray-900 dark:text-gray-100">
                    {migrationStatus.startTime.toLocaleString()}
                  </div>
                </div>
                
                {migrationStatus.endTime && (
                  <div>
                    <span className="text-gray-500 dark:text-gray-400">Completed:</span>
                    <div className="font-medium text-gray-900 dark:text-gray-100">
                      {migrationStatus.endTime.toLocaleString()}
                    </div>
                  </div>
                )}
                
                {migrationStatus.endTime && (
                  <div>
                    <span className="text-gray-500 dark:text-gray-400">Duration:</span>
                    <div className="font-medium text-gray-900 dark:text-gray-100">
                      {Math.round((migrationStatus.endTime.getTime() - migrationStatus.startTime.getTime()) / 1000)}s
                    </div>
                  </div>
                )}
              </div>
            </div>
          )}
        </div>
      )}

      {/* Errors */}
      {migrationStatus?.errors && migrationStatus.errors.length > 0 && (
        <div className="bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg p-4">
          <div className="flex items-center space-x-2 mb-3">
            <AlertTriangle className="w-5 h-5 text-red-500" />
            <h3 className="font-medium text-red-800 dark:text-red-200">
              Migration Errors ({migrationStatus.errors.length})
            </h3>
          </div>
          <div className="space-y-2">
            {migrationStatus.errors.map((error, index) => (
              <div key={index} className="text-sm text-red-700 dark:text-red-300 bg-red-100 dark:bg-red-900/30 rounded p-2">
                {error}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Action Buttons */}
      <div className="flex justify-center space-x-4">
        {migrationStatus?.phase !== 'completed' && (
          <button
            onClick={executeMigration}
            disabled={isExecuting}
            className={`
              flex items-center space-x-2 px-6 py-3 rounded-lg font-medium transition-colors
              ${isExecuting
                ? 'bg-gray-300 text-gray-500 cursor-not-allowed'
                : 'bg-blue-600 hover:bg-blue-700 text-white'
              }
            `}
          >
            {isExecuting ? (
              <>
                <Loader2 className="w-5 h-5 animate-spin" />
                <span>Executing Migration...</span>
              </>
            ) : (
              <>
                <Play className="w-5 h-5" />
                <span>Start Migration</span>
              </>
            )}
          </button>
        )}

        {migrationStatus?.phase === 'completed' && (
          <div className="flex items-center space-x-2 text-green-600">
            <CheckCircle2 className="w-5 h-5" />
            <span className="font-medium">Migration Completed Successfully</span>
          </div>
        )}
      </div>

      {/* Warning Notice */}
      {!isExecuting && migrationStatus?.phase !== 'completed' && (
        <div className="bg-yellow-50 dark:bg-yellow-900/20 border border-yellow-200 dark:border-yellow-800 rounded-lg p-4">
          <div className="flex items-start space-x-3">
            <AlertTriangle className="w-5 h-5 text-yellow-600 mt-0.5" />
            <div>
              <h3 className="font-medium text-yellow-800 dark:text-yellow-200 mb-2">
                Important Migration Notice
              </h3>
              <ul className="text-sm text-yellow-700 dark:text-yellow-300 space-y-1">
                <li>• This migration will switch your application from Supabase to AWS services</li>
                <li>• Ensure all AWS services are properly configured before starting</li>
                <li>• The migration process may take several minutes to complete</li>
                <li>• Users may experience brief service interruptions during the cutover</li>
                <li>• Make sure you have backups of critical data before proceeding</li>
              </ul>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default MigrationCutover;