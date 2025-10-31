import React, { useState, useRef } from 'react';
import { Upload, FileText, Zap, AlertTriangle, CheckCircle2, XCircle, Clock, Brain, Shield, Eye, Trash2, Plus } from 'lucide-react';
import { parsePDF, isPDFFile } from '../lib/pdfParser';
import { AnalysisResult, convertToDatabase } from '../types/analysis';
import { RAGEnhancedAnalysis } from '../lib/ragService';
import { useAuth } from '../hooks/useAuth';
import { useFileUpload } from '../hooks/useFileUpload';
import { FileUploadResult } from '../lib/storage/fileUploadService';
import optimizedAnalysisService from '../lib/optimizedAnalysisService';
import { stepFunctionsService } from '../lib/stepFunctionsService';
import { sqsBatchProcessingService } from '../lib/sqsBatchProcessingService';
import RAGAnalysisViewer from './RAGAnalysisViewer';

interface BatchAnalysisProps {
  onBatchComplete: (results: AnalysisResult[]) => void;
}

interface DocumentFile {
  id: string;
  file: File;
  content?: string;
  status: 'pending' | 'processing' | 'completed' | 'error';
  result?: AnalysisResult;
  ragAnalysis?: RAGEnhancedAnalysis;
  error?: string;
  uploadResult?: FileUploadResult;
}

const BatchAnalysis: React.FC<BatchAnalysisProps> = ({ onBatchComplete }) => {
  const [documents, setDocuments] = useState<DocumentFile[]>([]);
  const [isProcessing, setIsProcessing] = useState(false);
  const [progress, setProgress] = useState(0);
  const [results, setResults] = useState<AnalysisResult[]>([]);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [enableRAG, setEnableRAG] = useState(true);
  const [selectedRAGAnalysis, setSelectedRAGAnalysis] = useState<RAGEnhancedAnalysis | null>(null);
  const { user } = useAuth();
  
  // File upload hook
  const { uploadFiles } = useFileUpload({
    extractText: true,
    maxSize: 50 * 1024 * 1024, // 50MB
    onProgress: (progress) => {
      // Update upload progress if needed
    },
    onError: (error) => {
      console.error('File upload error:', error);
    }
  });

  const handleFileUpload = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(event.target.files || []);
    if (files.length === 0) return;

    try {
      // Upload files to S3 and extract content
      const uploadResults = await uploadFiles(files);
      
      const newDocuments: DocumentFile[] = files.map((file, index) => {
        const docId = `doc_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
        const uploadResult = uploadResults[index];
        
        if (uploadResult) {
          return {
            id: docId,
            file,
            content: uploadResult.content || '',
            status: 'pending' as const,
            uploadResult
          };
        } else {
          return {
            id: docId,
            file,
            status: 'error' as const,
            error: 'Failed to upload file to storage'
          };
        }
      });

      setDocuments(prev => [...prev, ...newDocuments]);
      
    } catch (error) {
      // Handle error through error management system
      const { errorManager } = await import('../lib/errors');
      const handledError = errorManager.handleError(error, {
        component: 'BatchAnalysis',
        feature: 'file-processing',
        operation: 'handleFileUpload',
        fileCount: files.length
      });
      
      // Add error documents for failed uploads
      const errorDocuments: DocumentFile[] = files.map(file => ({
        id: `doc_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
        file,
        status: 'error' as const,
        error: handledError.userMessage || 'Failed to upload file'
      }));
      
      setDocuments(prev => [...prev, ...errorDocuments]);
    }
    
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
    
    try {
      // Choose processing method based on batch size and configuration
      const useSQS = process.env.VITE_USE_SQS_BATCH === 'true';
      const useStepFunctions = validDocuments.length > 10 || process.env.VITE_USE_STEP_FUNCTIONS === 'true';
      
      if (useSQS && user) {
        console.log('Using SQS for batch processing');
        await processBatchWithSQS(validDocuments);
      } else if (useStepFunctions && user) {
        console.log('Using Step Functions for batch processing');
        await processBatchWithStepFunctions(validDocuments);
      } else {
        console.log('Using direct processing for batch');
        await processBatchDirectly(validDocuments, batchResults);
      }
    } catch (error) {
      console.error('Batch analysis failed:', error);
      setIsProcessing(false);
    }
  };

  const processBatchWithStepFunctions = async (validDocuments: DocumentFile[]) => {
    try {
      // Generate batch ID
      const batchId = stepFunctionsService.generateBatchId();
      
      // Prepare documents for Step Functions
      const stepFunctionDocuments = validDocuments.map(doc => ({
        id: doc.id,
        filename: doc.file.name,
        content: doc.content,
        s3Key: doc.uploadResult?.s3Key,
        size: doc.file.size,
        contentType: doc.file.type,
      }));

      // Start Step Functions workflow
      const execution = await stepFunctionsService.startBatchAnalysis({
        batchId,
        userId: user!.id,
        documents: stepFunctionDocuments,
        options: {
          sensitivity: 'medium',
          includeSourceVerification: true,
          maxHallucinations: 5,
          enableRAG,
        },
      });

      console.log('Step Functions execution started:', execution.executionArn);

      // Update all documents to processing status
      setDocuments(prev => prev.map(d => 
        validDocuments.some(vd => vd.id === d.id) 
          ? { ...d, status: 'processing' } 
          : d
      ));

      // Poll for completion
      await stepFunctionsService.waitForBatchCompletion(execution.executionArn, {
        timeoutMs: 30 * 60 * 1000, // 30 minutes
        pollIntervalMs: 5000, // 5 seconds
        onProgress: (status) => {
          console.log('Batch progress:', status.status);
          
          // Update progress based on Step Functions status
          if (status.status === 'RUNNING') {
            // Estimate progress (this would be more accurate with actual progress from the workflow)
            const estimatedProgress = Math.min(90, (Date.now() - new Date(status.startDate).getTime()) / 1000 / 60 * 10);
            setProgress(estimatedProgress);
          }
        },
      });

      // Get final results (this would typically come from the Step Functions output or database)
      const finalResults = await fetchBatchResults(batchId);
      
      // Update documents with results
      finalResults.forEach(result => {
        setDocuments(prev => prev.map(d => {
          if (d.id === result.documentId) {
            return {
              ...d,
              status: 'completed',
              result: result.analysis,
              ragAnalysis: result.ragAnalysis,
            };
          }
          return d;
        }));
      });

      setResults(finalResults.map(r => r.analysis));
      setProgress(100);
      setIsProcessing(false);
      onBatchComplete(finalResults.map(r => r.analysis));

    } catch (error) {
      console.error('Step Functions batch processing failed:', error);
      
      // Fallback to direct processing
      console.log('Falling back to direct processing');
      const batchResults: AnalysisResult[] = [];
      await processBatchDirectly(validDocuments, batchResults);
    }
  };

  const processBatchDirectly = async (validDocuments: DocumentFile[], batchResults: AnalysisResult[]) => {
    for (let i = 0; i < validDocuments.length; i++) {
      const doc = validDocuments[i];
      
      try {
        // Update document status
        setDocuments(prev => prev.map(d => 
          d.id === doc.id ? { ...d, status: 'processing' } : d
        ));

        const { analysis, ragAnalysis } = await optimizedAnalysisService.analyzeContent(
          doc.content!,
          user?.id || 'anonymous',
          {
            sensitivity: 'medium',
            includeSourceVerification: true,
            maxHallucinations: 5,
            enableRAG
          }
        );

        analysis.analysisType = 'batch';
        analysis.filename = doc.file.name;
        batchResults.push(analysis);

        // Update document with result
        setDocuments(prev => prev.map(d => 
          d.id === doc.id ? { ...d, status: 'completed', result: analysis, ragAnalysis } : d
        ));

        // Save to database if user is authenticated
        if (user) {
          try {
            await optimizedAnalysisService.saveAnalysisResult(analysis);
          } catch (error) {
            // Handle error through error management system
            const { errorManager } = await import('../lib/errors');
            errorManager.handleError(error, {
              component: 'BatchAnalysis',
              feature: 'result-storage',
              operation: 'saveAnalysisResult',
              userId: user.id,
              documentId: doc.id
            });
            console.error('Error saving batch result:', error);
          }
        }

      } catch (error) {
        // Handle error through error management system
        const { errorManager } = await import('../lib/errors');
        const handledError = errorManager.handleError(error, {
          component: 'BatchAnalysis',
          feature: 'batch-analysis',
          operation: 'analyzeDocument',
          userId: user?.id,
          documentId: doc.id,
          fileName: doc.file.name
        });
        
        console.error(`Error analyzing ${doc.file.name}:`, error);
        
        setDocuments(prev => prev.map(d => 
          d.id === doc.id ? { 
            ...d, 
            status: 'error', 
            error: handledError.userMessage || `Analysis failed: ${error.message}` 
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

  const processBatchWithSQS = async (validDocuments: DocumentFile[]) => {
    try {
      // Generate batch ID
      const batchId = `sqs_batch_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
      
      // Prepare documents for SQS processing
      const sqsDocuments = validDocuments.map(doc => ({
        id: doc.id,
        filename: doc.file.name,
        content: doc.content,
        s3Key: doc.uploadResult?.s3Key,
        size: doc.file.size,
        contentType: doc.file.type,
      }));

      // Determine priority based on batch size
      const priority = validDocuments.length > 20 ? 'low' : validDocuments.length > 10 ? 'normal' : 'high';

      // Submit batch job to SQS
      const batchJob = {
        batchId,
        userId: user!.id,
        documents: sqsDocuments,
        options: {
          sensitivity: 'medium' as const,
          includeSourceVerification: true,
          maxHallucinations: 5,
          enableRAG,
          temperature: 0.3,
          maxTokens: 2000,
        },
        priority,
        createdAt: new Date().toISOString(),
        estimatedCost: sqsDocuments.length * 0.01, // Rough estimate
      };

      const result = await sqsBatchProcessingService.submitBatchJob(batchJob);
      
      console.log('SQS batch job submitted:', result);

      // Update all documents to processing status
      setDocuments(prev => prev.map(d => 
        validDocuments.some(vd => vd.id === d.id) 
          ? { ...d, status: 'processing' } 
          : d
      ));

      // Poll for completion
      await pollForSQSCompletion(batchId, validDocuments.length);

    } catch (error) {
      console.error('SQS batch processing failed:', error);
      
      // Fallback to direct processing
      console.log('Falling back to direct processing');
      const batchResults: AnalysisResult[] = [];
      await processBatchDirectly(validDocuments, batchResults);
    }
  };

  const pollForSQSCompletion = async (batchId: string, totalDocuments: number) => {
    const maxPollTime = 30 * 60 * 1000; // 30 minutes
    const pollInterval = 5000; // 5 seconds
    const startTime = Date.now();

    while (Date.now() - startTime < maxPollTime) {
      try {
        const progress = sqsBatchProcessingService.getBatchProgress(batchId);
        
        if (progress) {
          // Update progress
          const progressPercentage = (progress.processedDocuments / progress.totalDocuments) * 100;
          setProgress(Math.min(progressPercentage, 95)); // Cap at 95% until final results

          console.log('SQS batch progress:', {
            processed: progress.processedDocuments,
            total: progress.totalDocuments,
            successful: progress.successfulDocuments,
            failed: progress.failedDocuments,
            status: progress.currentStatus,
          });

          // Check if completed
          if (progress.currentStatus === 'completed' || 
              progress.processedDocuments >= progress.totalDocuments) {
            
            // Fetch final results
            const finalResults = await fetchBatchResults(batchId);
            
            // Update documents with results
            finalResults.forEach((result: any) => {
              setDocuments(prev => prev.map(d => {
                if (d.id === result.documentId) {
                  return {
                    ...d,
                    status: result.success ? 'completed' : 'error',
                    result: result.success ? result.analysisResult : undefined,
                    error: result.success ? undefined : result.error,
                  };
                }
                return d;
              }));
            });

            setResults(finalResults.filter((r: any) => r.success).map((r: any) => r.analysisResult));
            setProgress(100);
            setIsProcessing(false);
            onBatchComplete(finalResults.filter((r: any) => r.success).map((r: any) => r.analysisResult));
            return;
          }
        }

        // Wait before next poll
        await new Promise(resolve => setTimeout(resolve, pollInterval));

      } catch (error) {
        console.error('Error polling SQS batch progress:', error);
        await new Promise(resolve => setTimeout(resolve, pollInterval));
      }
    }

    // Timeout reached
    console.warn('SQS batch processing timed out');
    setIsProcessing(false);
  };

  // Helper function to fetch batch results (would integrate with your API)
  const fetchBatchResults = async (batchId: string) => {
    // This would fetch results from your database or S3
    // For now, return empty array as placeholder
    console.log('Fetching batch results for:', batchId);
    return [];
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

          {/* RAG Toggle */}
          <div className="flex items-center justify-between mt-4 p-4 bg-purple-50 dark:bg-purple-900/20 border border-purple-200 dark:border-purple-800 rounded-lg">
            <div className="flex items-center space-x-3">
              <div className="p-2 bg-purple-100 dark:bg-purple-800 rounded-lg">
                <Zap className="w-4 h-4 text-purple-600 dark:text-purple-400" />
              </div>
              <div>
                <h4 className="font-medium text-purple-900 dark:text-purple-100">RAG Enhancement</h4>
                <p className="text-sm text-purple-700 dark:text-purple-300">
                  Cross-reference claims against reliable knowledge sources
                </p>
              </div>
            </div>
            <button
              onClick={() => setEnableRAG(!enableRAG)}
              className={`w-12 h-6 rounded-full transition-colors ${
                enableRAG ? 'bg-purple-600' : 'bg-slate-300 dark:bg-slate-600'
              }`}
            >
              <div className={`w-5 h-5 bg-white rounded-full transition-transform ${
                enableRAG ? 'translate-x-6' : 'translate-x-0.5'
              } mt-0.5`}></div>
            </button>
          </div>

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
                      {doc.ragAnalysis && ` • RAG: ${doc.ragAnalysis.rag_enhanced_accuracy.toFixed(1)}%`}
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
                  {doc.ragAnalysis && (
                    <button
                      onClick={() => setSelectedRAGAnalysis(doc.ragAnalysis!)}
                      className="p-1 text-purple-600 dark:text-purple-400 hover:bg-purple-50 dark:hover:bg-purple-900/20 rounded transition-colors"
                      title="View RAG analysis"
                    >
                      <Zap className="w-4 h-4" />
                    </button>
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

      {/* RAG Analysis Viewer Modal */}
      {selectedRAGAnalysis && (
        <RAGAnalysisViewer 
          ragAnalysis={selectedRAGAnalysis} 
          onClose={() => setSelectedRAGAnalysis(null)} 
        />
      )}
    </div>
  );
};

export default BatchAnalysis;