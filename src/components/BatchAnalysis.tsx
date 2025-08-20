import React, { useState, useRef } from 'react';
import { Upload, FileText, Trash2, Download, Play, Pause, CheckCircle2, AlertTriangle, XCircle, Clock, BarChart3, Filter } from 'lucide-react';
import { parsePDF, isPDFFile } from '../lib/pdfParser';
import { AnalysisResult } from '../types/analysis';
import { supabase } from '../lib/supabase';
import { useAuth } from '../hooks/useAuth';
import { convertToDatabase } from '../types/analysis';

interface BatchFile {
  id: string;
  name: string;
  size: number;
  content: string;
  status: 'pending' | 'processing' | 'completed' | 'error';
  result?: {
    accuracy: number;
    riskLevel: 'low' | 'medium' | 'high' | 'critical';
    hallucinations: number;
    processingTime: number;
  };
}

interface BatchAnalysisProps {
  onBatchComplete?: (results: AnalysisResult[]) => void;
}

const BatchAnalysis: React.FC<BatchAnalysisProps> = ({ onBatchComplete }) => {
  const [files, setFiles] = useState<BatchFile[]>([]);
  const [isProcessing, setIsProcessing] = useState(false);
  const [currentFileIndex, setCurrentFileIndex] = useState(0);
  const [filterStatus, setFilterStatus] = useState<string>('all');
  const fileInputRef = useRef<HTMLInputElement>(null);
  const { user } = useAuth();

  const handleFileUpload = (event: React.ChangeEvent<HTMLInputElement>) => {
    const uploadedFiles = Array.from(event.target.files || []);
    
    uploadedFiles.forEach(async (file) => {
      try {
        let content: string;
        
        if (isPDFFile(file)) {
          // Handle PDF files
          content = await parsePDF(file);
        } else {
          // Handle text files
          content = await new Promise<string>((resolve, reject) => {
            const reader = new FileReader();
            reader.onload = (e) => resolve(e.target?.result as string);
            reader.onerror = () => reject(new Error('Failed to read file'));
            reader.readAsText(file);
          });
        }
        
        const newFile: BatchFile = {
          id: Date.now().toString() + Math.random().toString(36).substr(2, 9),
          name: file.name,
          size: file.size,
          content: content,
          status: 'pending'
        };
        
        setFiles(prev => [...prev, newFile]);
      } catch (error) {
        console.error(`Error reading file ${file.name}:`, error);
        // Still add the file but mark it with an error status
        const errorFile: BatchFile = {
          id: Date.now().toString() + Math.random().toString(36).substr(2, 9),
          name: file.name,
          size: file.size,
          content: '',
          status: 'error'
        };
        setFiles(prev => [...prev, errorFile]);
      }
    });
    
    // Reset input
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
  };

  const removeFile = (id: string) => {
    setFiles(prev => prev.filter(file => file.id !== id));
  };

  const startBatchAnalysis = async () => {
    if (files.length === 0 || isProcessing) return;
    
    setIsProcessing(true);
    setCurrentFileIndex(0);
    
    for (let i = 0; i < files.length; i++) {
      const file = files[i];
      setCurrentFileIndex(i);
      
      // Update file status to processing
      setFiles(prev => prev.map(f => 
        f.id === file.id ? { ...f, status: 'processing' } : f
      ));
      
      // Simulate analysis (replace with actual API call)
      await new Promise(resolve => setTimeout(resolve, 1500 + Math.random() * 2000));
      
      const accuracy = Math.random() * 100;
      const riskLevel = accuracy > 85 ? 'low' : accuracy > 70 ? 'medium' : accuracy > 50 ? 'high' : 'critical';
      const hallucinations = Math.floor(Math.random() * (riskLevel === 'critical' ? 5 : riskLevel === 'high' ? 3 : riskLevel === 'medium' ? 2 : 1));
      
      const analysisResult: AnalysisResult = {
        id: Date.now().toString() + Math.random().toString(36).substr(2, 9),
        user_id: user?.id || '',
        content: file.content.substring(0, 200) + (file.content.length > 200 ? '...' : ''),
        timestamp: new Date().toISOString(),
        accuracy,
        riskLevel,
        hallucinations: Array.from({ length: hallucinations }, (_, idx) => ({
          text: `Issue ${idx + 1} in ${file.name}`,
          type: 'Generated Issue',
          confidence: Math.random(),
          explanation: `Potential accuracy issue detected in ${file.name}`
        })),
        verificationSources: Math.floor(Math.random() * 15) + 5,
        processingTime: Math.floor(Math.random() * 3000) + 1000
      };

      // Save to database if user is authenticated
      if (user) {
        try {
          await supabase
            .from('analysis_results')
            .insert(convertToDatabase(analysisResult));
        } catch (error) {
          console.error('Error saving batch analysis result:', error);
        }
      }

      // Update file with results
      setFiles(prev => prev.map(f => 
        f.id === file.id ? {
          ...f,
          status: 'completed',
          result: {
            accuracy,
            riskLevel,
            hallucinations,
            processingTime: Math.floor(Math.random() * 3000) + 1000
          }
        } : f
      ));

      // Store for batch completion callback
      if (i === 0) {
        window.batchResults = [analysisResult];
      } else {
        window.batchResults = [...(window.batchResults || []), analysisResult];
      }
    }
    
    setIsProcessing(false);
    setCurrentFileIndex(0);

    // Notify parent component of batch completion
    if (onBatchComplete && window.batchResults) {
      onBatchComplete(window.batchResults);
      window.batchResults = undefined;
    }
  };

  const pauseAnalysis = () => {
    setIsProcessing(false);
  };

  const exportResults = () => {
    const results = files.filter(f => f.status === 'completed').map(f => ({
      filename: f.name,
      accuracy: f.result?.accuracy,
      riskLevel: f.result?.riskLevel,
      hallucinations: f.result?.hallucinations,
      processingTime: f.result?.processingTime
    }));
    
    const csv = [
      'Filename,Accuracy,Risk Level,Hallucinations,Processing Time (ms)',
      ...results.map(r => `${r.filename},${r.accuracy?.toFixed(1)}%,${r.riskLevel},${r.hallucinations},${r.processingTime}`)
    ].join('\n');
    
    const blob = new Blob([csv], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `batch-analysis-results-${new Date().toISOString().split('T')[0]}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const getStatusIcon = (status: string) => {
    switch (status) {
      case 'pending': return <Clock className="w-4 h-4 text-slate-500" />;
      case 'processing': return <div className="animate-spin rounded-full h-4 w-4 border-2 border-blue-600 border-t-transparent"></div>;
      case 'completed': return <CheckCircle2 className="w-4 h-4 text-green-600" />;
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

  const filteredFiles = files.filter(file => {
    if (filterStatus === 'all') return true;
    return file.status === filterStatus;
  });

  const completedFiles = files.filter(f => f.status === 'completed');
  const averageAccuracy = completedFiles.length > 0 
    ? completedFiles.reduce((sum, f) => sum + (f.result?.accuracy || 0), 0) / completedFiles.length 
    : 0;

  return (
    <div className="space-y-8">
      {/* Header */}
      <div className="bg-white dark:bg-slate-800 rounded-xl shadow-sm border border-slate-200 dark:border-slate-700 p-6 transition-colors duration-200">
        <div className="flex items-center justify-between mb-4">
          <div>
            <h2 className="text-xl font-bold text-slate-900 dark:text-slate-100 mb-2">Batch Analysis</h2>
            <p className="text-slate-600 dark:text-slate-400">Upload and analyze multiple documents simultaneously for efficient content verification.</p>
          </div>
          
          <div className="flex items-center space-x-3">
            {files.length > 0 && (
              <button
                onClick={exportResults}
                disabled={completedFiles.length === 0}
                className="flex items-center space-x-2 px-4 py-2 text-slate-600 hover:text-slate-900 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
              >
                <Download className="w-4 h-4" />
                <span>Export Results</span>
              </button>
            )}
            
            <button
              onClick={() => fileInputRef.current?.click()}
              className="flex items-center space-x-2 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors"
            >
              <Upload className="w-4 h-4" />
              <span>Upload Files</span>
            </button>
          </div>
        </div>

        {/* Progress Summary */}
        {files.length > 0 && (
          <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-6">
            <div className="bg-slate-50 rounded-lg p-4">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm font-medium text-slate-600">Total Files</p>
                  <p className="text-2xl font-bold text-slate-900">{files.length}</p>
                </div>
                <FileText className="w-8 h-8 text-slate-400" />
              </div>
            </div>

            <div className="bg-slate-50 rounded-lg p-4">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm font-medium text-slate-600">Completed</p>
                  <p className="text-2xl font-bold text-slate-900">{completedFiles.length}</p>
                </div>
                <CheckCircle2 className="w-8 h-8 text-green-400" />
              </div>
            </div>

            <div className="bg-slate-50 rounded-lg p-4">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm font-medium text-slate-600">Average Accuracy</p>
                  <p className="text-2xl font-bold text-slate-900">
                    {completedFiles.length > 0 ? `${averageAccuracy.toFixed(1)}%` : '--'}
                  </p>
                </div>
                <BarChart3 className="w-8 h-8 text-blue-400" />
              </div>
            </div>

            <div className="bg-slate-50 rounded-lg p-4">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm font-medium text-slate-600">Processing</p>
                  <p className="text-2xl font-bold text-slate-900">
                    {files.filter(f => f.status === 'processing').length}
                  </p>
                </div>
                <div className="animate-spin rounded-full h-8 w-8 border-2 border-slate-300 border-t-blue-600"></div>
              </div>
            </div>
          </div>
        )}

        {/* Controls */}
        <div className="flex items-center justify-between">
          <div className="flex items-center space-x-4">
            <div className="flex items-center space-x-2">
              <Filter className="w-4 h-4 text-slate-500" />
              <select 
                value={filterStatus}
                onChange={(e) => setFilterStatus(e.target.value)}
                className="border border-slate-300 rounded px-3 py-1.5 text-sm"
              >
                <option value="all">All Files</option>
                <option value="pending">Pending</option>
                <option value="processing">Processing</option>
                <option value="completed">Completed</option>
                <option value="error">Error</option>
              </select>
            </div>
          </div>

          {files.length > 0 && (
            <div className="flex items-center space-x-3">
              {isProcessing ? (
                <button
                  onClick={pauseAnalysis}
                  className="flex items-center space-x-2 px-4 py-2 bg-red-600 text-white rounded-lg hover:bg-red-700 transition-colors"
                >
                  <Pause className="w-4 h-4" />
                  <span>Pause Analysis</span>
                </button>
              ) : (
                <button
                  onClick={startBatchAnalysis}
                  disabled={files.filter(f => f.status === 'pending').length === 0}
                  className="flex items-center space-x-2 px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                >
                  <Play className="w-4 h-4" />
                  <span>Start Analysis</span>
                </button>
              )}
            </div>
          )}
        </div>
      </div>

      {/* File Upload Area */}
      <input
        ref={fileInputRef}
        type="file"
        multiple
        accept=".txt,.md,.doc,.docx,.pdf"
        onChange={handleFileUpload}
        className="hidden"
      />

      {files.length === 0 ? (
        <div 
          onClick={() => fileInputRef.current?.click()}
          className="bg-white rounded-xl shadow-sm border-2 border-dashed border-slate-300 p-12 text-center cursor-pointer hover:border-blue-400 hover:bg-blue-50 transition-colors"
        >
          <Upload className="w-16 h-16 text-slate-400 mx-auto mb-4" />
          <h3 className="text-lg font-semibold text-slate-900 mb-2">Upload Documents for Batch Analysis</h3>
          <p className="text-slate-600 mb-4">
            Drag and drop files here, or click to browse. Supports TXT, MD, DOC, DOCX, and PDF files.
          </p>
          <div className="text-sm text-slate-500">
            Maximum files: 50
          </div>
        </div>
      ) : (
        /* File List */
        <div className="bg-white dark:bg-slate-800 rounded-xl shadow-sm border border-slate-200 dark:border-slate-700 p-6 transition-colors duration-200">
          <div className="flex items-center justify-between mb-6">
            <h3 className="text-lg font-bold text-slate-900 dark:text-slate-100">
              Files ({filteredFiles.length})
            </h3>
            
            {isProcessing && (
              <div className="flex items-center space-x-2 text-blue-600 dark:text-blue-400">
                <div className="animate-spin rounded-full h-4 w-4 border-2 border-blue-600 border-t-transparent"></div>
                <span className="text-sm font-medium">
                  Processing {currentFileIndex + 1} of {files.length}
                </span>
              </div>
            )}
          </div>

          <div className="space-y-3">
            {filteredFiles.map((file, index) => (
              <div key={file.id} className="flex items-center justify-between p-4 bg-slate-50 dark:bg-slate-700 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-600 transition-colors">
                <div className="flex items-center space-x-4 flex-1">
                  <div className="flex items-center space-x-3">
                    {getStatusIcon(file.status)}
                    <FileText className="w-5 h-5 text-slate-400 dark:text-slate-500" />
                  </div>
                  
                  <div className="flex-1 min-w-0">
                    <p className="font-medium text-slate-900 dark:text-slate-100 truncate">{file.name}</p>
                    <p className="text-sm text-slate-500 dark:text-slate-400">
                      {(file.size / 1024).toFixed(1)} KB • {file.content.length} characters
                    </p>
                  </div>
                </div>

                <div className="flex items-center space-x-4">
                  {file.status === 'completed' && file.result && (
                    <div className="flex items-center space-x-4">
                      <div className="text-right">
                        <p className="text-sm font-medium text-slate-900 dark:text-slate-100">
                          {file.result.accuracy.toFixed(1)}% accuracy
                        </p>
                        <p className="text-xs text-slate-500 dark:text-slate-400">
                          {file.result.hallucinations} issues found
                        </p>
                      </div>
                      
                      <div className={`px-2 py-1 rounded text-xs font-medium capitalize ${getRiskColor(file.result.riskLevel)}`}>
                        {file.result.riskLevel}
                      </div>
                    </div>
                  )}

                  {file.status === 'error' && (
                    <div className="text-right">
                      <p className="text-sm font-medium text-red-600 dark:text-red-400">Analysis Failed</p>
                      <p className="text-xs text-slate-500 dark:text-slate-400">Click to retry</p>
                    </div>
                  )}

                  {file.status === 'pending' && !isProcessing && (
                    <button
                      onClick={() => removeFile(file.id)}
                      className="p-2 text-slate-400 dark:text-slate-500 hover:text-red-600 dark:hover:text-red-400 transition-colors"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  )}
                </div>
              </div>
            ))}
          </div>

          {/* Progress Bar */}
          {isProcessing && (
            <div className="mt-6">
              <div className="flex items-center justify-between mb-2">
                <span className="text-sm font-medium text-slate-700 dark:text-slate-300">Analysis Progress</span>
                <span className="text-sm text-slate-500 dark:text-slate-400">
                  {Math.round((currentFileIndex / files.length) * 100)}%
                </span>
              </div>
              <div className="w-full bg-slate-200 dark:bg-slate-600 rounded-full h-2">
                <div 
                  className="bg-blue-600 h-2 rounded-full transition-all duration-300"
                  style={{ width: `${(currentFileIndex / files.length) * 100}%` }}
                ></div>
              </div>
            </div>
          )}
        </div>
      )}

      {/* Results Summary */}
      {completedFiles.length > 0 && (
        <div className="bg-white dark:bg-slate-800 rounded-xl shadow-sm border border-slate-200 dark:border-slate-700 p-6 transition-colors duration-200">
          <h3 className="text-lg font-bold text-slate-900 dark:text-slate-100 mb-6">Batch Analysis Summary</h3>
          
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
            {['low', 'medium', 'high', 'critical'].map(risk => {
              const count = completedFiles.filter(f => f.result?.riskLevel === risk).length;
              const percentage = completedFiles.length > 0 ? (count / completedFiles.length) * 100 : 0;
              
              return (
                <div key={risk} className="text-center">
                  <div className={`w-16 h-16 rounded-full mx-auto mb-3 flex items-center justify-center ${getRiskColor(risk)}`}>
                    {risk === 'low' && <CheckCircle2 className="w-8 h-8" />}
                    {risk === 'medium' && <AlertTriangle className="w-8 h-8" />}
                    {risk === 'high' && <AlertTriangle className="w-8 h-8" />}
                    {risk === 'critical' && <XCircle className="w-8 h-8" />}
                  </div>
                  <p className="text-2xl font-bold text-slate-900 dark:text-slate-100 mb-1">{count}</p>
                  <p className="text-sm font-medium text-slate-600 dark:text-slate-400 capitalize mb-1">{risk} Risk</p>
                  <p className="text-xs text-slate-500 dark:text-slate-400">{percentage.toFixed(1)}% of files</p>
                </div>
              );
            })}
          </div>

          {/* Detailed Results */}
          <div className="mt-8">
            <h4 className="font-semibold text-slate-900 dark:text-slate-100 mb-4">Detailed Results</h4>
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead>
                  <tr className="border-b border-slate-200 dark:border-slate-600">
                    <th className="text-left text-sm font-medium text-slate-600 dark:text-slate-400 pb-3">File Name</th>
                    <th className="text-left text-sm font-medium text-slate-600 dark:text-slate-400 pb-3">Accuracy</th>
                    <th className="text-left text-sm font-medium text-slate-600 dark:text-slate-400 pb-3">Risk Level</th>
                    <th className="text-left text-sm font-medium text-slate-600 dark:text-slate-400 pb-3">Issues Found</th>
                    <th className="text-left text-sm font-medium text-slate-600 dark:text-slate-400 pb-3">Processing Time</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 dark:divide-slate-700">
                  {completedFiles.map((file) => (
                    <tr key={file.id} className="hover:bg-slate-50 dark:hover:bg-slate-700 transition-colors">
                      <td className="py-3 pr-4">
                        <p className="font-medium text-slate-900 dark:text-slate-100 truncate max-w-xs">{file.name}</p>
                      </td>
                      <td className="py-3 pr-4">
                        <span className="text-slate-900 dark:text-slate-100 font-medium">
                          {file.result?.accuracy.toFixed(1)}%
                        </span>
                      </td>
                      <td className="py-3 pr-4">
                        <span className={`px-2 py-1 rounded text-xs font-medium capitalize ${getRiskColor(file.result?.riskLevel || 'low')}`}>
                          {file.result?.riskLevel}
                        </span>
                      </td>
                      <td className="py-3 pr-4">
                        <span className="text-slate-600 dark:text-slate-400">{file.result?.hallucinations}</span>
                      </td>
                      <td className="py-3">
                        <span className="text-slate-500 dark:text-slate-400 text-sm">{file.result?.processingTime}ms</span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* Tips */}
      <div className="bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 rounded-xl p-6 transition-colors duration-200">
        <h4 className="font-semibold text-blue-900 dark:text-blue-100 mb-3">Batch Analysis Tips</h4>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-sm text-blue-800 dark:text-blue-200">
          <div className="flex items-start space-x-2">
            <CheckCircle2 className="w-4 h-4 text-blue-600 dark:text-blue-400 mt-0.5" />
            <span>Upload multiple files at once for efficient processing</span>
          </div>
          <div className="flex items-start space-x-2">
            <CheckCircle2 className="w-4 h-4 text-blue-600 dark:text-blue-400 mt-0.5" />
            <span>Supported formats: TXT, MD, DOC, DOCX, PDF</span>
          </div>
          <div className="flex items-start space-x-2">
            <CheckCircle2 className="w-4 h-4 text-blue-600 dark:text-blue-400 mt-0.5" />
            <span>Export results as CSV for further analysis</span>
          </div>
          <div className="flex items-start space-x-2">
            <CheckCircle2 className="w-4 h-4 text-blue-600 dark:text-blue-400 mt-0.5" />
            <span>Analysis can be paused and resumed at any time</span>
          </div>
        </div>
      </div>
    </div>
  );
};

export default BatchAnalysis;