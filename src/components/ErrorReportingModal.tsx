import React, { useState } from 'react';
import { X, Send, AlertTriangle, CheckCircle, Loader2 } from 'lucide-react';
import { ApiError } from '../lib/errors/types';

interface ErrorReportingModalProps {
  error: ApiError;
  isOpen: boolean;
  onClose: () => void;
  onSubmit?: (report: ErrorReport) => Promise<void>;
}

export interface ErrorReport {
  errorId: string;
  userDescription: string;
  reproductionSteps: string;
  expectedBehavior: string;
  actualBehavior: string;
  userEmail?: string;
  severity: 'low' | 'medium' | 'high' | 'critical';
  category: 'bug' | 'performance' | 'usability' | 'feature_request' | 'other';
  attachments?: File[];
}

export const ErrorReportingModal: React.FC<ErrorReportingModalProps> = ({
  error,
  isOpen,
  onClose,
  onSubmit
}) => {
  const [report, setReport] = useState<Partial<ErrorReport>>({
    errorId: error.errorId,
    severity: error.severity as ErrorReport['severity'],
    category: 'bug',
    userDescription: '',
    reproductionSteps: '',
    expectedBehavior: '',
    actualBehavior: error.userMessage
  });
  
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isSubmitted, setIsSubmitted] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    if (!report.userDescription?.trim()) {
      setSubmitError('Please provide a description of the issue.');
      return;
    }

    setIsSubmitting(true);
    setSubmitError(null);

    try {
      const fullReport: ErrorReport = {
        errorId: error.errorId,
        userDescription: report.userDescription || '',
        reproductionSteps: report.reproductionSteps || '',
        expectedBehavior: report.expectedBehavior || '',
        actualBehavior: report.actualBehavior || error.userMessage,
        userEmail: report.userEmail,
        severity: report.severity || 'medium',
        category: report.category || 'bug'
      };

      if (onSubmit) {
        await onSubmit(fullReport);
      } else {
        // Default submission via email
        await submitViaEmail(fullReport);
      }

      setIsSubmitted(true);
      setTimeout(() => {
        onClose();
        setIsSubmitted(false);
      }, 2000);
    } catch (err) {
      setSubmitError('Failed to submit error report. Please try again.');
      console.error('Error submitting report:', err);
    } finally {
      setIsSubmitting(false);
    }
  };

  const submitViaEmail = async (fullReport: ErrorReport) => {
    const subject = encodeURIComponent(`Error Report - ${fullReport.errorId}`);
    const body = encodeURIComponent(
      `Error Report\n` +
      `===========\n\n` +
      `Error ID: ${fullReport.errorId}\n` +
      `Category: ${fullReport.category}\n` +
      `Severity: ${fullReport.severity}\n` +
      `Timestamp: ${error.timestamp}\n` +
      `URL: ${window.location.href}\n` +
      `User Agent: ${navigator.userAgent}\n\n` +
      `Description:\n${fullReport.userDescription}\n\n` +
      `Steps to Reproduce:\n${fullReport.reproductionSteps}\n\n` +
      `Expected Behavior:\n${fullReport.expectedBehavior}\n\n` +
      `Actual Behavior:\n${fullReport.actualBehavior}\n\n` +
      `Technical Details:\n` +
      `Error Type: ${error.type}\n` +
      `Error Message: ${error.message}\n` +
      `${error.details ? `Error Details: ${JSON.stringify(error.details, null, 2)}\n` : ''}` +
      `${fullReport.userEmail ? `Contact Email: ${fullReport.userEmail}\n` : ''}`
    );
    
    window.open(`mailto:support@hallucifix.com?subject=${subject}&body=${body}`);
  };

  const updateReport = (field: keyof ErrorReport, value: any) => {
    setReport(prev => ({ ...prev, [field]: value }));
    setSubmitError(null);
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 overflow-y-auto">
      <div className="flex min-h-screen items-center justify-center p-4">
        {/* Backdrop */}
        <div 
          className="fixed inset-0 bg-black bg-opacity-50 transition-opacity"
          onClick={onClose}
        />
        
        {/* Modal */}
        <div className="relative bg-white dark:bg-gray-800 rounded-lg shadow-xl max-w-2xl w-full max-h-[90vh] overflow-y-auto">
          {/* Header */}
          <div className="flex items-center justify-between p-6 border-b border-gray-200 dark:border-gray-700">
            <div className="flex items-center space-x-3">
              <AlertTriangle className="w-6 h-6 text-orange-500" />
              <h2 className="text-lg font-semibold text-gray-900 dark:text-gray-100">
                Report Error
              </h2>
            </div>
            <button
              onClick={onClose}
              className="p-2 text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 transition-colors"
            >
              <X className="w-5 h-5" />
            </button>
          </div>

          {/* Success State */}
          {isSubmitted && (
            <div className="p-6 text-center">
              <CheckCircle className="w-12 h-12 text-green-500 mx-auto mb-4" />
              <h3 className="text-lg font-medium text-gray-900 dark:text-gray-100 mb-2">
                Report Submitted
              </h3>
              <p className="text-gray-600 dark:text-gray-400">
                Thank you for your feedback. We'll investigate this issue.
              </p>
            </div>
          )}

          {/* Form */}
          {!isSubmitted && (
            <form onSubmit={handleSubmit} className="p-6 space-y-6">
              {/* Error Information */}
              <div className="bg-gray-50 dark:bg-gray-900 rounded-lg p-4">
                <h3 className="text-sm font-medium text-gray-900 dark:text-gray-100 mb-2">
                  Error Information
                </h3>
                <div className="text-xs text-gray-600 dark:text-gray-400 space-y-1">
                  <div><strong>Error ID:</strong> {error.errorId}</div>
                  <div><strong>Type:</strong> {error.type}</div>
                  <div><strong>Severity:</strong> {error.severity}</div>
                  <div><strong>Time:</strong> {new Date(error.timestamp).toLocaleString()}</div>
                </div>
              </div>

              {/* Category and Severity */}
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                    Category
                  </label>
                  <select
                    value={report.category}
                    onChange={(e) => updateReport('category', e.target.value)}
                    className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                  >
                    <option value="bug">Bug Report</option>
                    <option value="performance">Performance Issue</option>
                    <option value="usability">Usability Problem</option>
                    <option value="feature_request">Feature Request</option>
                    <option value="other">Other</option>
                  </select>
                </div>
                
                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                    Severity
                  </label>
                  <select
                    value={report.severity}
                    onChange={(e) => updateReport('severity', e.target.value)}
                    className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                  >
                    <option value="low">Low - Minor inconvenience</option>
                    <option value="medium">Medium - Affects functionality</option>
                    <option value="high">High - Major impact</option>
                    <option value="critical">Critical - Blocks usage</option>
                  </select>
                </div>
              </div>

              {/* Description */}
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                  Description <span className="text-red-500">*</span>
                </label>
                <textarea
                  value={report.userDescription}
                  onChange={(e) => updateReport('userDescription', e.target.value)}
                  placeholder="Please describe what happened and what you were trying to do..."
                  rows={4}
                  className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                  required
                />
              </div>

              {/* Steps to Reproduce */}
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                  Steps to Reproduce
                </label>
                <textarea
                  value={report.reproductionSteps}
                  onChange={(e) => updateReport('reproductionSteps', e.target.value)}
                  placeholder="1. Go to...&#10;2. Click on...&#10;3. Enter...&#10;4. See error"
                  rows={3}
                  className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                />
              </div>

              {/* Expected vs Actual Behavior */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                    Expected Behavior
                  </label>
                  <textarea
                    value={report.expectedBehavior}
                    onChange={(e) => updateReport('expectedBehavior', e.target.value)}
                    placeholder="What should have happened?"
                    rows={3}
                    className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                  />
                </div>
                
                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                    Actual Behavior
                  </label>
                  <textarea
                    value={report.actualBehavior}
                    onChange={(e) => updateReport('actualBehavior', e.target.value)}
                    placeholder="What actually happened?"
                    rows={3}
                    className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                  />
                </div>
              </div>

              {/* Contact Email */}
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                  Contact Email (Optional)
                </label>
                <input
                  type="email"
                  value={report.userEmail || ''}
                  onChange={(e) => updateReport('userEmail', e.target.value)}
                  placeholder="your.email@example.com"
                  className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                />
                <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">
                  We'll only use this to follow up on your report if needed.
                </p>
              </div>

              {/* Error Message */}
              {submitError && (
                <div className="bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-md p-3">
                  <p className="text-sm text-red-600 dark:text-red-400">{submitError}</p>
                </div>
              )}

              {/* Actions */}
              <div className="flex justify-end space-x-3 pt-4 border-t border-gray-200 dark:border-gray-700">
                <button
                  type="button"
                  onClick={onClose}
                  className="px-4 py-2 text-sm font-medium text-gray-700 dark:text-gray-300 bg-white dark:bg-gray-700 border border-gray-300 dark:border-gray-600 rounded-md hover:bg-gray-50 dark:hover:bg-gray-600 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={isSubmitting || !report.userDescription?.trim()}
                  className="inline-flex items-center px-4 py-2 text-sm font-medium text-white bg-blue-600 border border-transparent rounded-md hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500 disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {isSubmitting ? (
                    <>
                      <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                      Submitting...
                    </>
                  ) : (
                    <>
                      <Send className="w-4 h-4 mr-2" />
                      Submit Report
                    </>
                  )}
                </button>
              </div>
            </form>
          )}
        </div>
      </div>
    </div>
  );
};

export default ErrorReportingModal;