import React, { useState } from 'react';
import { 
  X, 
  CheckCircle2, 
  XCircle, 
  AlertTriangle, 
  Clock, 
  ExternalLink, 
  BookOpen, 
  TrendingUp, 
  TrendingDown,
  Shield,
  Search,
  Database,
  Zap,
  Eye,
  ChevronDown,
  ChevronRight
} from 'lucide-react';
import { RAGEnhancedAnalysis, RAGAnalysisResult, RetrievedDocument } from '../lib/ragService';

interface RAGAnalysisViewerProps {
  ragAnalysis: RAGEnhancedAnalysis;
  onClose: () => void;
}

const RAGAnalysisViewer: React.FC<RAGAnalysisViewerProps> = ({ ragAnalysis, onClose }) => {
  const [expandedClaims, setExpandedClaims] = useState<Set<string>>(new Set());
  const [selectedDocument, setSelectedDocument] = useState<RetrievedDocument | null>(null);

  const toggleClaimExpansion = (claimIndex: number) => {
    const claimKey = `claim_${claimIndex}`;
    const newExpanded = new Set(expandedClaims);
    if (newExpanded.has(claimKey)) {
      newExpanded.delete(claimKey);
    } else {
      newExpanded.add(claimKey);
    }
    setExpandedClaims(newExpanded);
  };

  const getVerificationStatusColor = (status: RAGAnalysisResult['verification_status']) => {
    switch (status) {
      case 'verified': return 'text-green-700 bg-green-50 border-green-200 dark:text-green-300 dark:bg-green-900/20 dark:border-green-800';
      case 'contradicted': return 'text-red-700 bg-red-50 border-red-200 dark:text-red-300 dark:bg-red-900/20 dark:border-red-800';
      case 'partial': return 'text-amber-700 bg-amber-50 border-amber-200 dark:text-amber-300 dark:bg-amber-900/20 dark:border-amber-800';
      case 'unsupported': return 'text-slate-700 bg-slate-50 border-slate-200 dark:text-slate-300 dark:bg-slate-800 dark:border-slate-600';
      default: return 'text-slate-700 bg-slate-50 border-slate-200 dark:text-slate-300 dark:bg-slate-800 dark:border-slate-600';
    }
  };

  const getVerificationIcon = (status: RAGAnalysisResult['verification_status']) => {
    switch (status) {
      case 'verified': return <CheckCircle2 className="w-4 h-4 text-green-600 dark:text-green-400" />;
      case 'contradicted': return <XCircle className="w-4 h-4 text-red-600 dark:text-red-400" />;
      case 'partial': return <AlertTriangle className="w-4 h-4 text-amber-600 dark:text-amber-400" />;
      case 'unsupported': return <Clock className="w-4 h-4 text-slate-600 dark:text-slate-400" />;
      default: return <Clock className="w-4 h-4 text-slate-600 dark:text-slate-400" />;
    }
  };

  const getSourceTypeIcon = (type: string) => {
    switch (type) {
      case 'wikipedia': return <BookOpen className="w-4 h-4 text-blue-600" />;
      case 'academic': return <Shield className="w-4 h-4 text-purple-600" />;
      case 'news': return <TrendingUp className="w-4 h-4 text-orange-600" />;
      case 'government': return <Database className="w-4 h-4 text-green-600" />;
      default: return <Search className="w-4 h-4 text-slate-600" />;
    }
  };

  const getImprovementColor = (score: number) => {
    if (score > 5) return 'text-green-700 bg-green-50 border-green-200';
    if (score > 0) return 'text-blue-700 bg-blue-50 border-blue-200';
    if (score > -5) return 'text-amber-700 bg-amber-50 border-amber-200';
    return 'text-red-700 bg-red-50 border-red-200';
  };

  const getImprovementIcon = (score: number) => {
    if (score > 0) return <TrendingUp className="w-5 h-5 text-green-600" />;
    if (score < 0) return <TrendingDown className="w-5 h-5 text-red-600" />;
    return <TrendingUp className="w-5 h-5 text-slate-600" />;
  };

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
      <div className="bg-white dark:bg-slate-800 rounded-xl shadow-xl max-w-6xl w-full max-h-[95vh] overflow-hidden transition-colors duration-200">
        {/* Header */}
        <div className="p-6 border-b border-slate-200 dark:border-slate-700 flex items-center justify-between">
          <div className="flex items-center space-x-3">
            <div className="p-2 bg-purple-100 dark:bg-purple-900/20 rounded-lg">
              <Zap className="w-6 h-6 text-purple-600 dark:text-purple-400" />
            </div>
            <div>
              <h2 className="text-xl font-bold text-slate-900 dark:text-slate-100">RAG-Enhanced Analysis</h2>
              <p className="text-sm text-slate-600 dark:text-slate-400">
                Retrieval Augmented Generation • Processed in {ragAnalysis.processing_time}ms
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-2 text-slate-400 hover:text-slate-600 dark:hover:text-slate-300 transition-colors"
          >
            <X className="w-6 h-6" />
          </button>
        </div>

        <div className="overflow-y-auto max-h-[calc(95vh-120px)]">
          {/* Accuracy Improvement Summary */}
          <div className="p-6 border-b border-slate-200 dark:border-slate-700">
            <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
              <div className="bg-slate-50 dark:bg-slate-700 rounded-lg p-4">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm font-medium text-slate-600 dark:text-slate-400">Original Accuracy</p>
                    <p className="text-2xl font-bold text-slate-900 dark:text-slate-100">
                      {ragAnalysis.original_accuracy.toFixed(1)}%
                    </p>
                  </div>
                  <Search className="w-8 h-8 text-slate-400" />
                </div>
              </div>

              <div className="bg-slate-50 dark:bg-slate-700 rounded-lg p-4">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm font-medium text-slate-600 dark:text-slate-400">RAG Enhanced</p>
                    <p className="text-2xl font-bold text-slate-900 dark:text-slate-100">
                      {ragAnalysis.rag_enhanced_accuracy.toFixed(1)}%
                    </p>
                  </div>
                  <Zap className="w-8 h-8 text-purple-400" />
                </div>
              </div>

              <div className="bg-slate-50 dark:bg-slate-700 rounded-lg p-4">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm font-medium text-slate-600 dark:text-slate-400">Improvement</p>
                    <div className="flex items-center space-x-1">
                      {getImprovementIcon(ragAnalysis.improvement_score)}
                      <p className="text-2xl font-bold text-slate-900 dark:text-slate-100">
                        {ragAnalysis.improvement_score > 0 ? '+' : ''}{ragAnalysis.improvement_score.toFixed(1)}%
                      </p>
                    </div>
                  </div>
                  <TrendingUp className="w-8 h-8 text-slate-400" />
                </div>
              </div>

              <div className="bg-slate-50 dark:bg-slate-700 rounded-lg p-4">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm font-medium text-slate-600 dark:text-slate-400">Source Coverage</p>
                    <p className="text-2xl font-bold text-slate-900 dark:text-slate-100">
                      {ragAnalysis.source_coverage.toFixed(0)}%
                    </p>
                  </div>
                  <Database className="w-8 h-8 text-slate-400" />
                </div>
              </div>
            </div>

            {/* Improvement Assessment */}
            <div className={`mt-4 rounded-lg border p-4 ${getImprovementColor(ragAnalysis.improvement_score)}`}>
              <div className="flex items-center space-x-3">
                {getImprovementIcon(ragAnalysis.improvement_score)}
                <div>
                  <h4 className="font-semibold">
                    {ragAnalysis.improvement_score > 5 && 'Significant Accuracy Improvement'}
                    {ragAnalysis.improvement_score > 0 && ragAnalysis.improvement_score <= 5 && 'Moderate Accuracy Improvement'}
                    {ragAnalysis.improvement_score === 0 && 'No Change in Accuracy'}
                    {ragAnalysis.improvement_score < 0 && 'Accuracy Concerns Identified'}
                  </h4>
                  <p className="text-sm opacity-80">
                    {ragAnalysis.improvement_score > 5 && 'RAG verification significantly improved content reliability through source validation.'}
                    {ragAnalysis.improvement_score > 0 && ragAnalysis.improvement_score <= 5 && 'RAG verification provided modest improvements in content accuracy.'}
                    {ragAnalysis.improvement_score === 0 && 'RAG verification confirmed the original accuracy assessment.'}
                    {ragAnalysis.improvement_score < 0 && 'RAG verification identified potential accuracy issues not caught by initial analysis.'}
                  </p>
                </div>
              </div>
            </div>
          </div>

          {/* Verified Claims */}
          <div className="p-6 border-b border-slate-200 dark:border-slate-700">
            <h3 className="text-lg font-bold text-slate-900 dark:text-slate-100 mb-4">
              Claim Verification Results ({ragAnalysis.verified_claims.length})
            </h3>
            
            <div className="space-y-4">
              {ragAnalysis.verified_claims.map((claimResult, index) => {
                const isExpanded = expandedClaims.has(`claim_${index}`);
                
                return (
                  <div key={index} className="border border-slate-200 dark:border-slate-600 rounded-lg overflow-hidden">
                    <button
                      onClick={() => toggleClaimExpansion(index)}
                      className="w-full p-4 text-left hover:bg-slate-50 dark:hover:bg-slate-700 transition-colors"
                    >
                      <div className="flex items-start justify-between">
                        <div className="flex items-start space-x-3 flex-1">
                          {getVerificationIcon(claimResult.verification_status)}
                          <div className="flex-1">
                            <p className="font-medium text-slate-900 dark:text-slate-100 mb-1">
                              {claimResult.claim}
                            </p>
                            <div className="flex items-center space-x-4">
                              <span className={`px-2 py-1 rounded text-xs font-medium capitalize ${getVerificationStatusColor(claimResult.verification_status)}`}>
                                {claimResult.verification_status}
                              </span>
                              <span className="text-sm text-slate-600 dark:text-slate-400">
                                {(claimResult.confidence * 100).toFixed(0)}% confidence
                              </span>
                              <span className="text-sm text-slate-600 dark:text-slate-400">
                                {claimResult.supporting_documents.length + claimResult.contradicting_documents.length} sources
                              </span>
                            </div>
                          </div>
                        </div>
                        <div className="ml-4">
                          {isExpanded ? (
                            <ChevronDown className="w-5 h-5 text-slate-400" />
                          ) : (
                            <ChevronRight className="w-5 h-5 text-slate-400" />
                          )}
                        </div>
                      </div>
                    </button>

                    {isExpanded && (
                      <div className="border-t border-slate-200 dark:border-slate-600 p-4 bg-slate-50 dark:bg-slate-700">
                        <div className="space-y-4">
                          {/* Explanation */}
                          <div>
                            <h5 className="font-medium text-slate-900 dark:text-slate-100 mb-2">Verification Analysis</h5>
                            <p className="text-sm text-slate-700 dark:text-slate-300">{claimResult.explanation}</p>
                          </div>

                          {/* Reliability Assessment */}
                          <div>
                            <h5 className="font-medium text-slate-900 dark:text-slate-100 mb-2">Reliability Assessment</h5>
                            <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                              <div className="text-center">
                                <p className="text-xs text-slate-500 dark:text-slate-400">Source Quality</p>
                                <p className="font-semibold text-slate-900 dark:text-slate-100">
                                  {(claimResult.reliability_assessment.source_quality * 100).toFixed(0)}%
                                </p>
                              </div>
                              <div className="text-center">
                                <p className="text-xs text-slate-500 dark:text-slate-400">Consensus</p>
                                <p className="font-semibold text-slate-900 dark:text-slate-100">
                                  {(claimResult.reliability_assessment.consensus_level * 100).toFixed(0)}%
                                </p>
                              </div>
                              <div className="text-center">
                                <p className="text-xs text-slate-500 dark:text-slate-400">Recency</p>
                                <p className="font-semibold text-slate-900 dark:text-slate-100">
                                  {(claimResult.reliability_assessment.recency * 100).toFixed(0)}%
                                </p>
                              </div>
                              <div className="text-center">
                                <p className="text-xs text-slate-500 dark:text-slate-400">Overall</p>
                                <p className="font-semibold text-slate-900 dark:text-slate-100">
                                  {(claimResult.reliability_assessment.overall_score * 100).toFixed(0)}%
                                </p>
                              </div>
                            </div>
                          </div>

                          {/* Supporting Documents */}
                          {claimResult.supporting_documents.length > 0 && (
                            <div>
                              <h5 className="font-medium text-green-900 dark:text-green-100 mb-2 flex items-center space-x-2">
                                <CheckCircle2 className="w-4 h-4" />
                                <span>Supporting Sources ({claimResult.supporting_documents.length})</span>
                              </h5>
                              <div className="space-y-2">
                                {claimResult.supporting_documents.map((doc, docIndex) => (
                                  <div key={docIndex} className="bg-green-50 dark:bg-green-900/20 border border-green-200 dark:border-green-800 rounded p-3">
                                    <div className="flex items-start justify-between">
                                      <div className="flex items-start space-x-2 flex-1">
                                        {getSourceTypeIcon(doc.source_type)}
                                        <div className="flex-1">
                                          <button
                                            onClick={() => setSelectedDocument(doc)}
                                            className="font-medium text-green-900 dark:text-green-100 hover:text-green-700 dark:hover:text-green-300 text-left"
                                          >
                                            {doc.title}
                                          </button>
                                          <p className="text-xs text-green-700 dark:text-green-300 mt-1">
                                            {doc.source_name} • Relevance: {(doc.relevance_score * 100).toFixed(0)}%
                                            {doc.publication_date && ` • ${new Date(doc.publication_date).toLocaleDateString()}`}
                                          </p>
                                        </div>
                                      </div>
                                      {doc.url && (
                                        <a
                                          href={doc.url}
                                          target="_blank"
                                          rel="noopener noreferrer"
                                          className="p-1 text-green-600 dark:text-green-400 hover:text-green-700 dark:hover:text-green-300"
                                        >
                                          <ExternalLink className="w-4 h-4" />
                                        </a>
                                      )}
                                    </div>
                                  </div>
                                ))}
                              </div>
                            </div>
                          )}

                          {/* Contradicting Documents */}
                          {claimResult.contradicting_documents.length > 0 && (
                            <div>
                              <h5 className="font-medium text-red-900 dark:text-red-100 mb-2 flex items-center space-x-2">
                                <XCircle className="w-4 h-4" />
                                <span>Contradicting Sources ({claimResult.contradicting_documents.length})</span>
                              </h5>
                              <div className="space-y-2">
                                {claimResult.contradicting_documents.map((doc, docIndex) => (
                                  <div key={docIndex} className="bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded p-3">
                                    <div className="flex items-start justify-between">
                                      <div className="flex items-start space-x-2 flex-1">
                                        {getSourceTypeIcon(doc.source_type)}
                                        <div className="flex-1">
                                          <button
                                            onClick={() => setSelectedDocument(doc)}
                                            className="font-medium text-red-900 dark:text-red-100 hover:text-red-700 dark:hover:text-red-300 text-left"
                                          >
                                            {doc.title}
                                          </button>
                                          <p className="text-xs text-red-700 dark:text-red-300 mt-1">
                                            {doc.source_name} • Relevance: {(doc.relevance_score * 100).toFixed(0)}%
                                            {doc.publication_date && ` • ${new Date(doc.publication_date).toLocaleDateString()}`}
                                          </p>
                                        </div>
                                      </div>
                                      {doc.url && (
                                        <a
                                          href={doc.url}
                                          target="_blank"
                                          rel="noopener noreferrer"
                                          className="p-1 text-red-600 dark:text-red-400 hover:text-red-700 dark:hover:text-red-300"
                                        >
                                          <ExternalLink className="w-4 h-4" />
                                        </a>
                                      )}
                                    </div>
                                  </div>
                                ))}
                              </div>
                            </div>
                          )}
                        </div>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </div>

          {/* Knowledge Gaps */}
          {ragAnalysis.knowledge_gaps.length > 0 && (
            <div className="p-6 border-b border-slate-200 dark:border-slate-700">
              <h3 className="text-lg font-bold text-slate-900 dark:text-slate-100 mb-4">Knowledge Gaps</h3>
              <div className="bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800 rounded-lg p-4">
                <div className="flex items-start space-x-3">
                  <AlertTriangle className="w-5 h-5 text-amber-600 dark:text-amber-400 mt-0.5" />
                  <div>
                    <h4 className="font-medium text-amber-900 dark:text-amber-100 mb-2">Unverifiable Claims</h4>
                    <p className="text-sm text-amber-800 dark:text-amber-200 mb-3">
                      The following claims could not be verified against available knowledge sources:
                    </p>
                    <ul className="space-y-1">
                      {ragAnalysis.knowledge_gaps.map((gap, index) => (
                        <li key={index} className="text-sm text-amber-700 dark:text-amber-300">
                          • {gap}
                        </li>
                      ))}
                    </ul>
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* Summary */}
          <div className="p-6">
            <h3 className="text-lg font-bold text-slate-900 dark:text-slate-100 mb-4">RAG Analysis Summary</h3>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <div>
                <h4 className="font-medium text-slate-900 dark:text-slate-100 mb-3">Verification Breakdown</h4>
                <div className="space-y-2">
                  {[
                    { status: 'verified', label: 'Verified Claims', color: 'text-green-600' },
                    { status: 'contradicted', label: 'Contradicted Claims', color: 'text-red-600' },
                    { status: 'partial', label: 'Partially Verified', color: 'text-amber-600' },
                    { status: 'unsupported', label: 'Unsupported Claims', color: 'text-slate-600' }
                  ].map(({ status, label, color }) => {
                    const count = ragAnalysis.verified_claims.filter(c => c.verification_status === status).length;
                    const percentage = ragAnalysis.verified_claims.length > 0 
                      ? (count / ragAnalysis.verified_claims.length) * 100 
                      : 0;
                    
                    return (
                      <div key={status} className="flex items-center justify-between">
                        <span className={`text-sm font-medium ${color}`}>{label}</span>
                        <div className="flex items-center space-x-2">
                          <span className="text-sm text-slate-600 dark:text-slate-400">{count}</span>
                          <div className="w-16 bg-slate-200 dark:bg-slate-600 rounded-full h-2">
                            <div 
                              className={`h-2 rounded-full transition-all duration-500 ${
                                status === 'verified' ? 'bg-green-500' :
                                status === 'contradicted' ? 'bg-red-500' :
                                status === 'partial' ? 'bg-amber-500' : 'bg-slate-400'
                              }`}
                              style={{ width: `${percentage}%` }}
                            ></div>
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>

              <div>
                <h4 className="font-medium text-slate-900 dark:text-slate-100 mb-3">Source Analysis</h4>
                <div className="space-y-3">
                  <div className="flex items-center justify-between">
                    <span className="text-sm text-slate-600 dark:text-slate-400">Sources Consulted</span>
                    <span className="font-medium text-slate-900 dark:text-slate-100">
                      {new Set(ragAnalysis.verified_claims.flatMap(c => 
                        [...c.supporting_documents, ...c.contradicting_documents].map(d => d.source_id)
                      )).size}
                    </span>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-sm text-slate-600 dark:text-slate-400">Documents Retrieved</span>
                    <span className="font-medium text-slate-900 dark:text-slate-100">
                      {ragAnalysis.verified_claims.reduce((sum, c) => 
                        sum + c.supporting_documents.length + c.contradicting_documents.length, 0
                      )}
                    </span>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-sm text-slate-600 dark:text-slate-400">Average Relevance</span>
                    <span className="font-medium text-slate-900 dark:text-slate-100">
                      {ragAnalysis.verified_claims.length > 0 ? (
                        ragAnalysis.verified_claims
                          .flatMap(c => [...c.supporting_documents, ...c.contradicting_documents])
                          .reduce((sum, doc) => sum + doc.relevance_score, 0) /
                        ragAnalysis.verified_claims.flatMap(c => [...c.supporting_documents, ...c.contradicting_documents]).length * 100
                      ).toFixed(0) : 0}%
                    </span>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Footer */}
        <div className="p-6 border-t border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-700 flex items-center justify-between">
          <div className="text-sm text-slate-600 dark:text-slate-400">
            RAG Analysis • {ragAnalysis.verified_claims.length} claims verified • {ragAnalysis.processing_time}ms processing time
          </div>
          <button
            onClick={onClose}
            className="px-4 py-2 bg-slate-600 text-white rounded-lg hover:bg-slate-700 transition-colors"
          >
            Close
          </button>
        </div>
      </div>

      {/* Document Detail Modal */}
      {selectedDocument && (
        <div className="fixed inset-0 bg-black bg-opacity-75 flex items-center justify-center z-60 p-4">
          <div className="bg-white dark:bg-slate-800 rounded-xl shadow-xl max-w-2xl w-full max-h-[80vh] overflow-hidden">
            <div className="p-4 border-b border-slate-200 dark:border-slate-700 flex items-center justify-between">
              <h4 className="font-semibold text-slate-900 dark:text-slate-100">Source Document</h4>
              <button
                onClick={() => setSelectedDocument(null)}
                className="text-slate-400 hover:text-slate-600 dark:hover:text-slate-300"
              >
                <X className="w-5 h-5" />
              </button>
            </div>
            
            <div className="p-4 max-h-[calc(80vh-120px)] overflow-y-auto">
              <div className="space-y-4">
                <div>
                  <h5 className="font-medium text-slate-900 dark:text-slate-100">{selectedDocument.title}</h5>
                  <div className="flex items-center space-x-4 text-sm text-slate-600 dark:text-slate-400 mt-1">
                    <span>{selectedDocument.source_name}</span>
                    <span>•</span>
                    <span>Relevance: {(selectedDocument.relevance_score * 100).toFixed(0)}%</span>
                    {selectedDocument.author && (
                      <>
                        <span>•</span>
                        <span>{selectedDocument.author}</span>
                      </>
                    )}
                  </div>
                </div>
                
                <div className="bg-slate-50 dark:bg-slate-700 rounded-lg p-4">
                  <p className="text-sm text-slate-700 dark:text-slate-300 leading-relaxed">
                    {selectedDocument.content}
                  </p>
                </div>
                
                {selectedDocument.url && (
                  <div className="flex items-center justify-between pt-2">
                    <span className="text-xs text-slate-500 dark:text-slate-400">
                      Published: {selectedDocument.publication_date ? new Date(selectedDocument.publication_date).toLocaleDateString() : 'Unknown'}
                    </span>
                    <a
                      href={selectedDocument.url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="flex items-center space-x-1 text-blue-600 dark:text-blue-400 hover:text-blue-700 dark:hover:text-blue-300 text-sm"
                    >
                      <ExternalLink className="w-4 h-4" />
                      <span>View Source</span>
                    </a>
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default RAGAnalysisViewer;