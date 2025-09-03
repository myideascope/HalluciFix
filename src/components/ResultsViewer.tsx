import React from 'react';
import { X, AlertTriangle, CheckCircle2, XCircle, Clock, Brain, Shield, Eye, FileText, Calendar, Zap } from 'lucide-react';
import { AnalysisResult } from '../types/analysis';
import { RAGEnhancedAnalysis } from '../lib/ragService';
import RAGAnalysisViewer from './RAGAnalysisViewer';

interface ResultsViewerProps {
  result: AnalysisResult;
  ragAnalysis?: RAGEnhancedAnalysis;
  onClose: () => void;
}

const ResultsViewer: React.FC<ResultsViewerProps> = ({ result, ragAnalysis, onClose }) => {
  const [showRAGViewer, setShowRAGViewer] = React.useState(false);

  const getRiskColor = (risk: string) => {
    switch (risk) {
      case 'low': return 'text-green-700 bg-green-50 border-green-200';
      case 'medium': return 'text-amber-700 bg-amber-50 border-amber-200';
      case 'high': return 'text-orange-700 bg-orange-50 border-orange-200';
      case 'critical': return 'text-red-700 bg-red-50 border-red-200';
      default: return 'text-slate-700 bg-slate-50 border-slate-200';
    }
  };

  const getRiskIcon = (risk: string) => {
    switch (risk) {
      case 'low': return <CheckCircle2 className="w-5 h-5 text-green-600" />;
      case 'medium': return <AlertTriangle className="w-5 h-5 text-amber-600" />;
      case 'high': return <AlertTriangle className="w-5 h-5 text-orange-600" />;
      case 'critical': return <XCircle className="w-5 h-5 text-red-600" />;
      default: return <Clock className="w-5 h-5 text-slate-600" />;
    }
  };

  const getAnalysisTypeIcon = (type: string) => {
    switch (type) {
      case 'single': return <FileText className="w-4 h-4" />;
      case 'batch': return <Brain className="w-4 h-4" />;
      case 'scheduled': return <Calendar className="w-4 h-4" />;
      default: return <FileText className="w-4 h-4" />;
    }
  };

  const highlightHallucinations = (content: string, hallucinations: AnalysisResult['hallucinations']) => {
    if (!hallucinations.length) return content;

    let highlightedContent = content;
    const sortedHallucinations = [...hallucinations].sort((a, b) => (b.startIndex || 0) - (a.startIndex || 0));

    sortedHallucinations.forEach((hallucination, index) => {
      if (hallucination.startIndex !== undefined && hallucination.endIndex !== undefined) {
        const before = highlightedContent.substring(0, hallucination.startIndex);
        const highlighted = highlightedContent.substring(hallucination.startIndex, hallucination.endIndex);
        const after = highlightedContent.substring(hallucination.endIndex);
        
        highlightedContent = before + 
          `<mark class="bg-red-200 text-red-900 px-1 rounded" title="${hallucination.explanation}">${highlighted}</mark>` + 
          after;
      } else {
        // Fallback: highlight by text match
        const regex = new RegExp(`(${hallucination.text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')})`, 'gi');
        highlightedContent = highlightedContent.replace(regex, 
          `<mark class="bg-red-200 text-red-900 px-1 rounded" title="${hallucination.explanation}">$1</mark>`
        );
      }
    });

    return highlightedContent;
  };

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
      <div className="bg-white dark:bg-slate-800 rounded-xl shadow-xl max-w-4xl w-full max-h-[90vh] overflow-hidden transition-colors duration-200">
        {/* Header */}
        <div className="p-6 border-b border-slate-200 dark:border-slate-700 flex items-center justify-between">
          <div className="flex items-center space-x-3">
            <div className="p-2 bg-blue-100 dark:bg-blue-900/20 rounded-lg">
              {getAnalysisTypeIcon(result.analysisType)}
            </div>
            <div>
              <h2 className="text-xl font-bold text-slate-900 dark:text-slate-100">Analysis Results</h2>
              <div className="flex items-center space-x-4 text-sm text-slate-600 dark:text-slate-400">
                <span className="capitalize">{result.analysisType} Analysis</span>
                {result.filename && <span>• {result.filename}</span>}
                <span>• {new Date(result.timestamp).toLocaleString()}</span>
              </div>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-2 text-slate-400 hover:text-slate-600 dark:hover:text-slate-300 transition-colors"
          >
            <X className="w-6 h-6" />
          </button>
        </div>

        <div className="overflow-y-auto max-h-[calc(90vh-120px)]">
          {/* Key Metrics */}
          <div className="p-6 border-b border-slate-200 dark:border-slate-700">
            <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-6">
              <div className="bg-slate-50 dark:bg-slate-700 rounded-lg p-4 transition-colors duration-200">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm font-medium text-slate-600 dark:text-slate-400">Accuracy Score</p>
                    <p className="text-2xl font-bold text-slate-900 dark:text-slate-100">{result.accuracy.toFixed(1)}%</p>
                  </div>
                  <Brain className="w-8 h-8 text-slate-400 dark:text-slate-500" />
                </div>
              </div>

              <div className="bg-slate-50 dark:bg-slate-700 rounded-lg p-4 transition-colors duration-200">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm font-medium text-slate-600 dark:text-slate-400">Risk Level</p>
                    <div className="flex items-center space-x-2">
                      {getRiskIcon(result.riskLevel)}
                      <p className="text-lg font-bold capitalize text-slate-900 dark:text-slate-100">{result.riskLevel}</p>
                    </div>
                  </div>
                  <Shield className="w-8 h-8 text-slate-400 dark:text-slate-500" />
                </div>
              </div>

              <div className="bg-slate-50 dark:bg-slate-700 rounded-lg p-4 transition-colors duration-200">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm font-medium text-slate-600 dark:text-slate-400">Issues Found</p>
                    <p className="text-2xl font-bold text-slate-900 dark:text-slate-100">{result.hallucinations.length}</p>
                  </div>
                  <AlertTriangle className="w-8 h-8 text-slate-400 dark:text-slate-500" />
                </div>
              </div>

              <div className="bg-slate-50 dark:bg-slate-700 rounded-lg p-4 transition-colors duration-200">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm font-medium text-slate-600 dark:text-slate-400">Sources Checked</p>
                    <p className="text-2xl font-bold text-slate-900 dark:text-slate-100">{result.verificationSources}</p>
                  </div>
                  <Eye className="w-8 h-8 text-slate-400 dark:text-slate-500" />
                </div>
              </div>
            </div>

            {/* RAG Enhancement Summary */}
            {ragAnalysis && (
              <div className="bg-purple-50 dark:bg-purple-900/20 border border-purple-200 dark:border-purple-800 rounded-lg p-4">
                <div className="flex items-center justify-between mb-3">
                  <div className="flex items-center space-x-2">
                    <Zap className="w-5 h-5 text-purple-600 dark:text-purple-400" />
                    <h4 className="font-semibold text-purple-900 dark:text-purple-100">RAG Verification Results</h4>
                  </div>
                  <button
                    onClick={() => setShowRAGViewer(true)}
                    className="flex items-center space-x-2 px-3 py-1.5 bg-purple-600 text-white rounded-lg hover:bg-purple-700 transition-colors text-sm"
                  >
                    <Eye className="w-4 h-4" />
                    <span>View Details</span>
                  </button>
                </div>
                <div className="grid grid-cols-2 md:grid-cols-4 gap-3 text-sm">
                  <div>
                    <p className="text-purple-700 dark:text-purple-300 font-medium">
                      {ragAnalysis.verified_claims.filter(c => c.verification_status === 'verified').length}
                    </p>
                    <p className="text-purple-600 dark:text-purple-400">Verified Claims</p>
                  </div>
                  <div>
                    <p className="text-purple-700 dark:text-purple-300 font-medium">
                      {ragAnalysis.verified_claims.filter(c => c.verification_status === 'contradicted').length}
                    </p>
                    <p className="text-purple-600 dark:text-purple-400">Contradicted</p>
                  </div>
                  <div>
                    <p className="text-purple-700 dark:text-purple-300 font-medium">
                      {ragAnalysis.source_coverage.toFixed(0)}%
                    </p>
                    <p className="text-purple-600 dark:text-purple-400">Source Coverage</p>
                  </div>
                  <div>
                    <p className="text-purple-700 dark:text-purple-300 font-medium">
                      {ragAnalysis.improvement_score > 0 ? '+' : ''}{ragAnalysis.improvement_score.toFixed(1)}%
                    </p>
                    <p className="text-purple-600 dark:text-purple-400">Improvement</p>
                  </div>
                </div>
              </div>
            )}
          </div>

          {/* Risk Assessment */}
          <div className="p-6 border-b border-slate-200 dark:border-slate-700">
            <div className={`rounded-lg border p-4 ${getRiskColor(result.riskLevel)}`}>
              <div className="flex items-center space-x-3">
                {getRiskIcon(result.riskLevel)}
                <div>
                  <h4 className="font-semibold capitalize">{result.riskLevel} Risk Content</h4>
                  <p className="text-sm opacity-80">
                    {result.riskLevel === 'critical' && 'Immediate review required. Multiple reliability issues detected.'}
                    {result.riskLevel === 'high' && 'Review recommended. Several potential accuracy issues found.'}
                    {result.riskLevel === 'medium' && 'Minor concerns detected. Consider verification of key claims.'}
                    {result.riskLevel === 'low' && 'Content appears reliable with high accuracy confidence.'}
                  </p>
                </div>
              </div>
            </div>
          </div>

          {/* Content Analysis */}
          <div className="p-6 border-b border-slate-200 dark:border-slate-700">
            <h3 className="text-lg font-bold text-slate-900 dark:text-slate-100 mb-4">Content Analysis</h3>
            <div className="bg-slate-50 dark:bg-slate-700 rounded-lg p-4 max-h-64 overflow-y-auto">
              <div 
                className="text-sm text-slate-700 dark:text-slate-300 whitespace-pre-wrap leading-relaxed"
                dangerouslySetInnerHTML={{ 
                  __html: highlightHallucinations(result.fullContent || result.content, result.hallucinations) 
                }}
              />
            </div>
            {result.hallucinations.length > 0 && (
              <p className="text-xs text-slate-500 dark:text-slate-400 mt-2">
                Highlighted sections indicate potential hallucinations. Hover for details.
              </p>
            )}
          </div>

          {/* Hallucinations Details */}
          {result.hallucinations.length > 0 && (
            <div className="p-6">
              <h3 className="text-lg font-bold text-slate-900 dark:text-slate-100 mb-4">Detected Issues</h3>
              <div className="space-y-4">
                {result.hallucinations.map((hallucination, index) => (
                  <div key={index} className="border border-red-200 dark:border-red-800 rounded-lg p-4 bg-red-50 dark:bg-red-900/20">
                    <div className="flex items-start justify-between mb-2">
                      <div className="flex items-center space-x-2">
                        <AlertTriangle className="w-4 h-4 text-red-600 dark:text-red-400 mt-0.5" />
                        <span className="font-medium text-red-900 dark:text-red-100">{hallucination.type}</span>
                      </div>
                      <span className="text-sm text-red-600 dark:text-red-400 font-medium">
                        {(hallucination.confidence * 100).toFixed(0)}% confidence
                      </span>
                    </div>
                    
                    <div className="bg-white dark:bg-slate-800 rounded p-3 mb-3 border border-red-200 dark:border-red-700">
                      <code className="text-sm text-red-800 dark:text-red-200">"{hallucination.text}"</code>
                    </div>
                    
                    <p className="text-sm text-red-700 dark:text-red-300">{hallucination.explanation}</p>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* No Issues Found */}
          {result.hallucinations.length === 0 && (
            <div className="p-6">
              <div className="bg-green-50 dark:bg-green-900/20 border border-green-200 dark:border-green-800 rounded-lg p-6 text-center">
                <CheckCircle2 className="w-12 h-12 text-green-600 dark:text-green-400 mx-auto mb-3" />
                <h4 className="font-semibold text-green-900 dark:text-green-100 mb-2">No Hallucinations Detected</h4>
                <p className="text-sm text-green-700 dark:text-green-300">
                  The content appears to be accurate and reliable based on our analysis.
                </p>
              </div>
            </div>
          )}
        </div>

        {/* RAG Analysis Viewer Modal */}
        {showRAGViewer && ragAnalysis && (
          <RAGAnalysisViewer 
            ragAnalysis={ragAnalysis} 
            onClose={() => setShowRAGViewer(false)} 
          />
        )}

        {/* Footer */}
        <div className="p-6 border-t border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-700 flex items-center justify-between">
          <div className="text-sm text-slate-600 dark:text-slate-400">
            Processed in {result.processingTime}ms • Analysis ID: {result.id}
          </div>
          <button
            onClick={onClose}
            className="px-4 py-2 bg-slate-600 text-white rounded-lg hover:bg-slate-700 transition-colors"
          >
            Close
          </button>
        </div>
      </div>
    </div>
  );
};

export default ResultsViewer;