import React, { useState, useRef } from 'react';
import { Upload, FileText, Zap, AlertTriangle, CheckCircle2, XCircle, Clock, Brain, Shield, Eye, Trash2, Plus } from 'lucide-react';
import { parsePDF, isPDFFile } from '../lib/pdfParser';
import { AnalysisResult, convertToDatabase } from '../types/analysis';
import { supabase } from '../lib/supabase';
import { useAuth } from '../hooks/useAuth';
import analysisService from '../lib/analysisService';

interface BatchAnalysisProps {
  onBatchComplete: (results: AnalysisResult[]) => void;
}

interface DocumentFile {
  id: string;
  file: File;
  content?: string;
  status: 'pending' | 'processing' | 'completed' | 'error';
  result?: AnalysisResult;
  error?: string;
}

const BatchAnalysis: React.FC<BatchAnalysisProps> = ({ onBatchComplete }) => {
  const [documents, setDocuments] = useState<DocumentFile[]>([]);
  const [isProcessing, setIsProcessing] = useState(false);
  const [progress, setProgress] = useState(0);
  const [results, setResults] = useState<AnalysisResult[]>([]);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const { user } = useAuth();

  const handleFileUpload = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(event.target.files || []);
    if (files.length === 0) return;

    const newDocuments: DocumentFile[] = [];

    for (const file of files) {
      const docId = `doc_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
      
      try {
        let content = '';
        
        if (isPDFFile(file)) {
          content = await parsePDF(file);
        } else {
          content = await new Promise<string>((resolve, reject) => {
            const reader = new FileReader();
            reader.onload = (e) => resolve(e.target?.result as string);
            reader.onerror = () => reject(new Error('Failed to read file'));
            reader.readAsText(file);
          });
        }

        newDocuments.push({
          id: docId,
          file,
          content,
          status: 'pending'
        });
      } catch (error) {
        newDocuments.push({
          id: docId,
          file,
          status: 'error',
          error: `Failed to read file: ${error.message}`
        });
      }
    }

    setDocuments(prev => [...prev, ...newDocuments]);
    
    // Reset file input
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
  };

  const removeDocument = (docId: string) => {
    setDocuments(prev => prev.filter(doc => doc.id !== docId));
  };

  const startBatchAnalysis = async () => {
    if (documents.length === 0) return;

    setIsProcessing(true);
    setProgress(0);
    const batchResults: AnalysisResult[] = [];

    const validDocuments = documents.filter(doc => doc.content && doc.status !== 'error');
    
    for (let i = 0; i < validDocuments.length; i++) {
      const doc = validDocuments[i];
      
      try {
        // Update document status
        setDocuments(prev => prev.map(d => 
          d.id === doc.id ? { ...d, status: 'processing' } : d
        ));

        const result = await analysisService.analyzeContent(
          doc.content!,
          user?.id || 'anonymous',
          {
            sensitivity: 'medium',
            includeSourceVerification: true,
            maxHallucinations: 5
          }
        );

        result.analysisType = 'batch';
        result.filename = doc.file.name;
        batchResults.push(result);

        // Update document with result
        setDocuments(prev => prev.map(d => 
          d.id === doc.id ? { ...d, status: 'completed', result } : d
        ));

        // Save to database if user is authenticated
        if (user) {
          try {
            await supabase
              .from('analysis_results')
              .insert(convertToDatabase(result));
          } catch (error) {
            console.error('Error saving batch result:', error);
          }
        }

      } catch (error) {
        console.error(`Error analyzing ${doc.file.name}:`, error);
        
        setDocuments(prev => prev.map(d => 
          d.id === doc.id ? { 
            ...d, 
            status: 'error', 
            error: `Analysis failed: ${error.message}` 
          } : d
        ));
      }

      // Update progress
      setProgress(((i + 1) / validDocuments.length) * 100);
    }

    setResults(batchResults);
    setIsProcessing(false);
    onBatchComplete(batchResults);
  };

  const clearAll = () => {
    setDocuments([]);
    setResults([]);
    setProgress(0);
  };

  const getRiskColor = (risk: string) => {
    switch (risk) {
      case 'low': return 'text-green-700 bg-green-50 border-green-200';
      case 'medium': return 'text-amber-700 bg-amber-50 border-amber-200';
      case 'high': return 'text-orange-700 bg-orange-50 border-orange-200';
      case 'critical': return 'text-red-700 bg-red-50 border-red-200';
      default: return 'text-slate-700 bg-slate-50 border-slate-200';
    }
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

  return (
    <div className="space-y-8">
      {/* Upload Section */}
      <div className="bg-white dark:bg-slate-800 rounded-xl shadow-sm border border-slate-200 dark:border-slate-700 p-6 transition-colors duration-200">
        <div className="mb-6">
          <h2 className="text-xl font-bold text-slate-900 dark:text-slate-100 mb-2">Batch Analysis</h2>
          <p className="text-slate-600 dark:text-slate-400">
            Upload multiple documents for automated hallucination detection and analysis.
          </p>
        </div>

        <div className="space-y-4">
          <div className="border-2 border-dashed border-slate-300 dark:border-slate-600 rounded-lg p-8 text-center hover:border-blue-400 transition-colors">
            <Upload className="w-12 h-12 text-slate-400 mx-auto mb-4" />
            <h3 className="text-lg font-semibold text-slate-900 dark:text-slate-100 mb-2">
              Upload Documents
            </h3>
            <p className="text-slate-600 dark:text-slate-400 mb-4">
              Select multiple files to analyze for hallucinations
            </p>
            <button
              onClick={() => fileInputRef.current?.click()}
              className="px-6 py-3 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors"
            >
              Choose Files
            </button>
            <p className="text-xs text-slate-500 dark:text-slate-400 mt-2">
              Supports: PDF, TXT, DOC, DOCX, MD
            </p>
          </div>

          <input
            ref={fileInputRef}
            type="file"
            multiple
            accept=".txt,.md,.doc,.docx,.pdf"
            onChange={handleFileUpload}
            className="hidden"
          />

          {documents.length > 0 && (
            <div className="flex items-center justify-between">
              <span className="text-sm text-slate-600 dark:text-slate-400">
                {documents.length} document{documents.length !== 1 ? 's' : ''} uploaded
              </span>
              <div className="flex items-center space-x-2">
                <button
                  onClick={clearAll}
                  disabled={isProcessing}
                  className="px-3 py-1.5 text-sm text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-200 transition-colors disabled:opacity-50"
                >
                  Clear All
                </button>
                <button
                  onClick={startBatchAnalysis}
                  disabled={documents.length === 0 || isProcessing}
                  className="flex items-center space-x-2 px-6 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                >
                  {isProcessing ? (
                    <>
                      <div className="animate-spin rounded-full h-4 w-4 border-2 border-white border-t-transparent"></div>
                      <span>Processing...</span>
                    </>
                  ) : (
                    <>
                      <Zap className="w-4 h-4" />
                      <span>Start Analysis</span>
                    </>
                  )}
                </button>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Progress Bar */}
      {isProcessing && (
        <div className="bg-white dark:bg-slate-800 rounded-xl shadow-sm border border-slate-200 dark:border-slate-700 p-6 transition-colors duration-200">
          <div className="flex items-center justify-between mb-2">
            <span className="text-sm font-medium text-slate-900 dark:text-slate-100">Processing Documents</span>
            <span className="text-sm text-slate-600 dark:text-slate-400">{Math.round(progress)}%</span>
          </div>
          <div className="w-full bg-slate-200 dark:bg-slate-700 rounded-full h-2">
            <div 
              className="bg-blue-600 h-2 rounded-full transition-all duration-300"
              style={{ width: `${progress}%` }}
            ></div>
          </div>
        </div>
      )}

      {/* Documents List */}
      {documents.length > 0 && (
        <div className="bg-white dark:bg-slate-800 rounded-xl shadow-sm border border-slate-200 dark:border-slate-700 p-6 transition-colors duration-200">
          <h3 className="text-lg font-bold text-slate-900 dark:text-slate-100 mb-4">Documents</h3>
          <div className="space-y-3">
            {documents.map((doc) => (
              <div key={doc.id} className="flex items-center justify-between p-4 bg-slate-50 dark:bg-slate-700 rounded-lg">
                <div className="flex items-center space-x-3">
                  {getStatusIcon(doc.status)}
                  <div>
                    <p className="font-medium text-slate-900 dark:text-slate-100">{doc.file.name}</p>
                    <p className="text-sm text-slate-500 dark:text-slate-400">
                      {(doc.file.size / 1024).toFixed(1)} KB
                      {doc.result && ` • ${doc.result.accuracy.toFixed(1)}% accuracy`}
                      {doc.error && ` • ${doc.error}`}
                    </p>
                  </div>
                </div>
                
                <div className="flex items-center space-x-2">
                  {doc.result && (
                    <span className={`px-2 py-1 rounded text-xs font-medium capitalize ${getRiskColor(doc.result.riskLevel)}`}>
                      {doc.result.riskLevel}
                    </span>
                  )}
                  <button
                    onClick={() => removeDocument(doc.id)}
                    disabled={isProcessing}
                    className="p-1 text-slate-400 hover:text-red-600 transition-colors disabled:opacity-50"
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Results Summary */}
      {results.length > 0 && (
        <div className="bg-white dark:bg-slate-800 rounded-xl shadow-sm border border-slate-200 dark:border-slate-700 p-6 transition-colors duration-200">
          <h3 className="text-lg font-bold text-slate-900 dark:text-slate-100 mb-6">Batch Analysis Results</h3>
          
          {/* Summary Stats */}
          <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-6">
            <div className="bg-slate-50 dark:bg-slate-700 rounded-lg p-4">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm font-medium text-slate-600 dark:text-slate-400">Documents</p>
                  <p className="text-2xl font-bold text-slate-900 dark:text-slate-100">{results.length}</p>
                </div>
                <FileText className="w-8 h-8 text-slate-400" />
              </div>
            </div>

            <div className="bg-slate-50 dark:bg-slate-700 rounded-lg p-4">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm font-medium text-slate-600 dark:text-slate-400">Avg Accuracy</p>
                  <p className="text-2xl font-bold text-slate-900 dark:text-slate-100">
                    {(results.reduce((sum, r) => sum + r.accuracy, 0) / results.length).toFixed(1)}%
                  </p>
                </div>
                <Brain className="w-8 h-8 text-slate-400" />
              </div>
            </div>

            <div className="bg-slate-50 dark:bg-slate-700 rounded-lg p-4">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm font-medium text-slate-600 dark:text-slate-400">Total Issues</p>
                  <p className="text-2xl font-bold text-slate-900 dark:text-slate-100">
                    {results.reduce((sum, r) => sum + r.hallucinations.length, 0)}
                  </p>
                </div>
                <AlertTriangle className="w-8 h-8 text-slate-400" />
              </div>
            </div>

            <div className="bg-slate-50 dark:bg-slate-700 rounded-lg p-4">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm font-medium text-slate-600 dark:text-slate-400">High Risk</p>
                  <p className="text-2xl font-bold text-slate-900 dark:text-slate-100">
                    {results.filter(r => r.riskLevel === 'high' || r.riskLevel === 'critical').length}
                  </p>
                </div>
                <Shield className="w-8 h-8 text-slate-400" />
              </div>
            </div>
          </div>

          {/* Individual Results */}
          <div className="space-y-3">
            {results.map((result) => (
              <div key={result.id} className="border border-slate-200 dark:border-slate-600 rounded-lg p-4">
                <div className="flex items-center justify-between mb-2">
                  <h4 className="font-medium text-slate-900 dark:text-slate-100">{result.filename}</h4>
                  <span className={`px-2 py-1 rounded text-xs font-medium capitalize ${getRiskColor(result.riskLevel)}`}>
                    {result.riskLevel}
                  </span>
                </div>
                <div className="grid grid-cols-3 gap-4 text-sm">
                  <div>
                    <span className="text-slate-500 dark:text-slate-400">Accuracy: </span>
                    <span className="font-medium text-slate-900 dark:text-slate-100">{result.accuracy.toFixed(1)}%</span>
                  </div>
                  <div>
                    <span className="text-slate-500 dark:text-slate-400">Issues: </span>
                    <span className="font-medium text-slate-900 dark:text-slate-100">{result.hallucinations.length}</span>
                  </div>
                  <div>
                    <span className="text-slate-500 dark:text-slate-400">Sources: </span>
                    <span className="font-medium text-slate-900 dark:text-slate-100">{result.verificationSources}</span>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Getting Started */}
      {documents.length === 0 && (
        <div className="bg-white dark:bg-slate-800 rounded-xl shadow-sm border border-slate-200 dark:border-slate-700 p-8 text-center transition-colors duration-200">
          <Upload className="w-16 h-16 text-blue-600 mx-auto mb-4" />
          <h3 className="text-xl font-bold text-slate-900 dark:text-slate-100 mb-3">
            Batch Document Analysis
          </h3>
          <p className="text-slate-600 dark:text-slate-400 mb-6 leading-relaxed max-w-2xl mx-auto">
            Upload multiple documents to analyze them simultaneously for hallucinations and accuracy issues. 
            Our system will process each document and provide detailed reports on potential problems.
          </p>
          
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6 text-left max-w-3xl mx-auto">
            <div className="flex items-start space-x-3">
              <div className="p-2 bg-blue-100 dark:bg-blue-900/20 rounded-lg">
                <Upload className="w-5 h-5 text-blue-600 dark:text-blue-400" />
              </div>
              <div>
                <h4 className="font-semibold text-slate-900 dark:text-slate-100 mb-1">Multi-Format Support</h4>
                <p className="text-sm text-slate-600 dark:text-slate-400">
                  Process PDF, Word, text, and markdown files in a single batch.
                </p>
              </div>
            </div>
            
            <div className="flex items-start space-x-3">
              <div className="p-2 bg-green-100 dark:bg-green-900/20 rounded-lg">
                <Zap className="w-5 h-5 text-green-600 dark:text-green-400" />
              </div>
              <div>
                <h4 className="font-semibold text-slate-900 dark:text-slate-100 mb-1">Parallel Processing</h4>
                <p className="text-sm text-slate-600 dark:text-slate-400">
                  Efficient analysis of multiple documents with real-time progress tracking.
                </p>
              </div>
            </div>
            
            <div className="flex items-start space-x-3">
              <div className="p-2 bg-purple-100 dark:bg-purple-900/20 rounded-lg">
                <Brain className="w-5 h-5 text-purple-600 dark:text-purple-400" />
              </div>
              <div>
                <h4 className="font-semibold text-slate-900 dark:text-slate-100 mb-1">Comprehensive Reports</h4>
                <p className="text-sm text-slate-600 dark:text-slate-400">
                  Detailed analysis results with accuracy scores and risk assessments.
                </p>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default BatchAnalysis;