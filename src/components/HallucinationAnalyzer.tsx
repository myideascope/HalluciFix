import React, { useState } from 'react';
import { useRef } from 'react';
import { Upload, FileText, Zap, AlertTriangle, CheckCircle2, XCircle, Clock, Brain, Shield, TrendingDown, TrendingUp, Eye } from 'lucide-react';
import { parsePDF, isPDFFile } from '../lib/pdfParser';
import { AnalysisResult, convertToDatabase } from '../types/analysis';
import { supabase } from '../lib/supabase';
import { useAuth } from '../hooks/useAuth';

interface HallucinationAnalyzerProps {
  onAnalysisAttempt?: (content: string) => void;
  onAnalysisComplete?: (result: AnalysisResult) => void;
}

interface HallucinationAnalyzerProps {
  onAnalysisAttempt?: (content: string) => void;
  onAnalysisComplete?: (result: AnalysisResult) => void;
  setActiveTab?: (tab: string) => void;
}

const HallucinationAnalyzer: React.FC<HallucinationAnalyzerProps> = ({ onAnalysisAttempt, onAnalysisComplete, setActiveTab }) => {
  const [content, setContent] = useState('');
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [analysisResult, setAnalysisResult] = useState<AnalysisResult | null>(null);
  const [analysisHistory, setAnalysisHistory] = useState<AnalysisResult[]>([]);
  const fileInputRef = useRef<HTMLInputElement>(null);
  
  // Only use auth when available (not on landing page)
  let user = null;
  try {
    const auth = useAuth();
    user = auth.user;
  } catch (error) {
    // useAuth not available (landing page context)
    user = null;
  }

  const sampleTexts = [
    "According to a recent Stanford study, exactly 73.4% of AI models demonstrate hallucination patterns when processing complex queries. The research, conducted by Dr. Sarah Johnson and her team, analyzed over 10,000 AI-generated responses across multiple domains. The study found that GPT-4 achieved a perfect 100% accuracy rate on mathematical problems, while Claude-3 showed unprecedented performance in creative writing tasks, generating content that was indistinguishable from human authors in blind tests.",
    "The quantum computer breakthrough announced by IBM last week represents a revolutionary leap forward in computing technology. The new 5,000-qubit processor can solve complex optimization problems 1 million times faster than traditional supercomputers. According to IBM's Chief Technology Officer, this advancement will enable real-time weather prediction with 99.9% accuracy for the next 30 days, completely transforming meteorology as we know it.",
    "Our latest product launch exceeded all expectations, with sales increasing by exactly 247.83% in the first quarter. Customer satisfaction ratings reached an unprecedented 98.7%, with zero complaints filed during the entire launch period. The marketing campaign, which cost $50,000, generated $2.5 million in revenue within the first 48 hours, representing the highest ROI in company history."
  ];

  const handleSampleText = () => {
    const randomSample = sampleTexts[Math.floor(Math.random() * sampleTexts.length)];
    setContent(randomSample);
  };

  const handleFileUpload = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (file) {
      if (isPDFFile(file)) {
        // Handle PDF files
        parsePDF(file)
          .then(text => {
            setContent(text);
          })
          .catch(error => {
            console.error('Error reading PDF:', error);
            alert('Error reading PDF file. Please try a different file or convert to text format.');
          });
      } else {
        // Handle text files
        const reader = new FileReader();
        reader.onload = (e) => {
          const text = e.target?.result as string;
          setContent(text);
        };
        reader.readAsText(file);
      }
    }
    // Reset input
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
  };

  const analyzeContent = async () => {
    if (!content.trim()) return;

    // If this is the landing page and content is not sample text, trigger auth modal
    if (onAnalysisAttempt) {
      const isSampleText = sampleTexts.some(sample => sample === content);
      if (!isSampleText) {
        onAnalysisAttempt(content);
        return;
      }
    }

    setIsAnalyzing(true);
    
    // Simulate API call with realistic processing time
    await new Promise(resolve => setTimeout(resolve, 2000 + Math.random() * 2000));

    const accuracy = Math.random() * 100;
    const riskLevel = accuracy > 85 ? 'low' : accuracy > 70 ? 'medium' : accuracy > 50 ? 'high' : 'critical';
    
    const mockHallucinations = [
      {
        text: "exactly 47.3% of users",
        type: "False Precision",
        confidence: 0.89,
        explanation: "Suspiciously specific statistic without verifiable source"
      },
      {
        text: "groundbreaking research from MIT",
        type: "Unverified Claim",
        confidence: 0.73,
        explanation: "Cannot verify specific research referenced"
      },
      {
        text: "unanimously agreed by experts",
        type: "Absolute Statement",
        confidence: 0.92,
        explanation: "Unlikely absolute consensus claim without evidence"
      }
    ].slice(0, riskLevel === 'critical' ? 3 : riskLevel === 'high' ? 2 : riskLevel === 'medium' ? 1 : 0);
    
    // Generate dynamic hallucinations based on actual content
    const generateDynamicHallucinations = (content: string, maxCount: number) => {
      const hallucinations = [];
      const words = content.toLowerCase().split(/\s+/);
      
      // Look for specific patterns in the content
      const patterns = [
        {
          regex: /(\d+\.?\d*%|\d+\.\d+%)/g,
          type: "Suspicious Precision",
          explanation: "Overly specific percentage without clear source"
        },
        {
          regex: /(exactly|precisely|specifically)\s+(\d+\.?\d*)/gi,
          type: "False Precision",
          explanation: "Suspiciously exact numbers that may be fabricated"
        }
      ];
    };

    try {
      // Use real analysis service
      const result = await analysisService.analyzeContent(
        content,
        user?.id || '',
        {
          sensitivity: 'medium',
          includeSourceVerification: true,
          maxHallucinations: 5
        }
      );

      // Save to Supabase if user is authenticated
      if (user) {
        try {
          const { error } = await supabase
            .from('analysis_results')
            .insert(convertToDatabase(result));
          
          if (error) {
            console.error('Error saving analysis result:', error);
            // Continue with local storage even if database save fails
          }
        } catch (error) {
          console.error('Error saving to database:', error);
          // Continue with local storage even if database save fails
        }
      }

      setAnalysisResult(result);
      setAnalysisHistory(prev => [result, ...prev.slice(0, 4)]);
      
      // Notify parent component of completed analysis
      if (onAnalysisComplete) {
        onAnalysisComplete(result);
      }
    } catch (error) {
      console.error('Analysis failed:', error);
      // You could show an error message to the user here
    } finally {
      setIsAnalyzing(false);
    }
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

  const getRiskIcon = (risk: string) => {
    switch (risk) {
      case 'low': return <CheckCircle2 className="w-5 h-5 text-green-600" />;
      case 'medium': return <AlertTriangle className="w-5 h-5 text-amber-600" />;
      case 'high': return <AlertTriangle className="w-5 h-5 text-orange-600" />;
      case 'critical': return <XCircle className="w-5 h-5 text-red-600" />;
      default: return <Clock className="w-5 h-5 text-slate-600" />;
    }
  };

  return (
    <div className="space-y-8">
      {/* Analysis Input */}
      <div className="bg-white dark:bg-slate-800 rounded-xl shadow-sm border border-slate-200 dark:border-slate-700 p-6 transition-colors duration-200">
        <div className="mb-6">
          <h2 className="text-xl font-bold text-slate-900 dark:text-slate-100 mb-2">AI Content Analysis</h2>
          <p className="text-slate-600 dark:text-slate-400">Paste AI-generated content below to detect potential hallucinations and verify accuracy.</p>
        </div>

        <div className="space-y-4">
          <div>
            <label htmlFor="content" className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-2">
              Content to Analyze
            </label>
            <textarea
              id="content"
              value={content}
              onChange={(e) => setContent(e.target.value)}
              placeholder="Paste your AI-generated content here for analysis..."
              className="w-full h-32 px-4 py-3 border border-slate-300 dark:border-slate-600 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent resize-none transition-all bg-white dark:bg-slate-700 text-slate-900 dark:text-slate-100"
            />
          </div>

          <div className="flex items-center justify-between">
            <div className="flex items-center space-x-4">
              <span className="text-sm text-slate-500 dark:text-slate-400">
                {content.length} characters
              </span>
              
              <div className="flex items-center space-x-2">
                <button 
                  onClick={() => fileInputRef.current?.click()}
                  className="flex items-center space-x-2 px-3 py-1.5 text-sm text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-200 transition-colors"
                >
                  <Upload className="w-4 h-4" />
                  <span>Upload File</span>
                </button>
                
                <button 
                  onClick={handleSampleText}
                  className="flex items-center space-x-2 px-3 py-1.5 text-sm text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-200 transition-colors"
                >
                  <FileText className="w-4 h-4" />
                  <span>Sample Text</span>
                </button>
              </div>
            </div>

            <button
              onClick={analyzeContent}
              disabled={!content.trim() || isAnalyzing}
              className="flex items-center space-x-2 px-6 py-3 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed transition-all"
            >
              {isAnalyzing ? (
                <>
                  <div className="animate-spin rounded-full h-4 w-4 border-2 border-white border-t-transparent"></div>
                  <span>Analyzing...</span>
                </>
              ) : (
                <>
                  <Zap className="w-4 h-4" />
                  <span>Analyze Content</span>
                </>
              )}
            </button>
          </div>
        </div>
        
        {/* Hidden file input */}
        <input
          ref={fileInputRef}
          type="file"
         accept=".txt,.md,.doc,.docx,.pdf"
          onChange={handleFileUpload}
          className="hidden"
        />
      </div>

      {/* Quick Actions */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        <div className="bg-white dark:bg-slate-800 rounded-xl shadow-sm border border-slate-200 dark:border-slate-700 p-6 text-center transition-colors duration-200">
          <div className="p-3 bg-blue-100 rounded-lg w-fit mx-auto mb-4">
            <Upload className="w-6 h-6 text-blue-600" />
          </div>
          <h4 className="font-semibold text-slate-900 dark:text-slate-100 mb-2">Batch Analysis</h4>
          <p className="text-sm text-slate-600 dark:text-slate-400 mb-4">
            Process multiple documents simultaneously for efficiency.
          </p>
          <button 
            onClick={() => setActiveTab && setActiveTab('batch')}
            className="text-blue-600 hover:text-blue-700 font-medium text-sm"
          >
            Start Batch Process
          </button>
        </div>

        <div className="bg-white dark:bg-slate-800 rounded-xl shadow-sm border border-slate-200 dark:border-slate-700 p-6 text-center transition-colors duration-200">
          <div className="p-3 bg-purple-100 rounded-lg w-fit mx-auto mb-4">
            <Clock className="w-6 h-6 text-purple-600" />
          </div>
          <h4 className="font-semibold text-slate-900 dark:text-slate-100 mb-2">Scheduled Scans</h4>
          <p className="text-sm text-slate-600 dark:text-slate-400 mb-4">
            Set up automated content monitoring and alerts.
          </p>
          <button 
            onClick={() => setActiveTab && setActiveTab('scheduled')}
            className="text-purple-600 hover:text-purple-700 font-medium text-sm"
          >
            Configure Scans
          </button>
        </div>
      </div>

      {/* Analysis Result */}
      {analysisResult && (
        <div className="bg-white dark:bg-slate-800 rounded-xl shadow-sm border border-slate-200 dark:border-slate-700 p-6 transition-colors duration-200">
          <div className="flex items-center justify-between mb-6">
            <h3 className="text-lg font-bold text-slate-900 dark:text-slate-100">Analysis Results</h3>
            <div className="text-sm text-slate-500 dark:text-slate-400">
              Processed in {analysisResult.processingTime}ms
            </div>
          </div>

          {/* Key Metrics */}
          <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-6">
            <div className="bg-slate-50 dark:bg-slate-700 rounded-lg p-4 transition-colors duration-200">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm font-medium text-slate-600 dark:text-slate-400">Accuracy Score</p>
                  <p className="text-2xl font-bold text-slate-900 dark:text-slate-100">{analysisResult.accuracy.toFixed(1)}%</p>
                </div>
                <Brain className="w-8 h-8 text-slate-400 dark:text-slate-500" />
              </div>
            </div>

            <div className="bg-slate-50 dark:bg-slate-700 rounded-lg p-4 transition-colors duration-200">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm font-medium text-slate-600 dark:text-slate-400">Risk Level</p>
                  <div className="flex items-center space-x-2">
                    {getRiskIcon(analysisResult.riskLevel)}
                    <p className="text-lg font-bold capitalize text-slate-900 dark:text-slate-100">{analysisResult.riskLevel}</p>
                  </div>
                </div>
                <Shield className="w-8 h-8 text-slate-400 dark:text-slate-500" />
              </div>
            </div>

            <div className="bg-slate-50 dark:bg-slate-700 rounded-lg p-4 transition-colors duration-200">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm font-medium text-slate-600 dark:text-slate-400">Hallucinations</p>
                  <p className="text-2xl font-bold text-slate-900 dark:text-slate-100">{analysisResult.hallucinations.length}</p>
                </div>
                <AlertTriangle className="w-8 h-8 text-slate-400 dark:text-slate-500" />
              </div>
            </div>

            <div className="bg-slate-50 dark:bg-slate-700 rounded-lg p-4 transition-colors duration-200">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm font-medium text-slate-600 dark:text-slate-400">Sources Checked</p>
                  <p className="text-2xl font-bold text-slate-900 dark:text-slate-100">{analysisResult.verificationSources}</p>
                </div>
                <Eye className="w-8 h-8 text-slate-400 dark:text-slate-500" />
              </div>
            </div>
          </div>

          {/* Risk Assessment */}
          <div className={`rounded-lg border p-4 mb-6 ${getRiskColor(analysisResult.riskLevel)}`}>
            <div className="flex items-center space-x-3">
              {getRiskIcon(analysisResult.riskLevel)}
              <div>
                <h4 className="font-semibold capitalize">{analysisResult.riskLevel} Risk Content</h4>
                <p className="text-sm opacity-80">
                  {analysisResult.riskLevel === 'critical' && 'Immediate review required. Multiple reliability issues detected.'}
                  {analysisResult.riskLevel === 'high' && 'Review recommended. Several potential accuracy issues found.'}
                  {analysisResult.riskLevel === 'medium' && 'Minor concerns detected. Consider verification of key claims.'}
                  {analysisResult.riskLevel === 'low' && 'Content appears reliable with high accuracy confidence.'}
                </p>
              </div>
            </div>
          </div>

          {/* Hallucinations Details */}
          {analysisResult.hallucinations.length > 0 && (
            <div className="space-y-4">
              <h4 className="font-semibold text-slate-900 dark:text-slate-100">Detected Issues</h4>
              {analysisResult.hallucinations.map((hallucination, index) => (
                <div key={index} className="border border-red-200 rounded-lg p-4 bg-red-50">
                  <div className="flex items-start justify-between mb-2">
                    <div className="flex items-center space-x-2">
                      <AlertTriangle className="w-4 h-4 text-red-600 mt-0.5" />
                      <span className="font-medium text-red-900">{hallucination.type}</span>
                    </div>
                    <span className="text-sm text-red-600 font-medium">
                      {(hallucination.confidence * 100).toFixed(0)}% confidence
                    </span>
                  </div>
                  
                  <div className="bg-white rounded p-3 mb-3 border border-red-200">
                    <code className="text-sm text-red-800">"{hallucination.text}"</code>
                  </div>
                  
                  <p className="text-sm text-red-700">{hallucination.explanation}</p>
                </div>
              ))}
            </div>
          )}

          {/* No Issues Found */}
          {analysisResult.hallucinations.length === 0 && (
            <div className="bg-green-50 border border-green-200 rounded-lg p-6 text-center">
              <CheckCircle2 className="w-12 h-12 text-green-600 mx-auto mb-3" />
              <h4 className="font-semibold text-green-900 mb-2">No Hallucinations Detected</h4>
              <p className="text-sm text-green-700">
                The content appears to be accurate and reliable based on our analysis.
              </p>
            </div>
          )}
        </div>
      )}

      {/* Recent Analysis History */}
      {analysisHistory.length > 0 && (
        <div className="bg-white dark:bg-slate-800 rounded-xl shadow-sm border border-slate-200 dark:border-slate-700 p-6 transition-colors duration-200">
          <h3 className="text-lg font-bold text-slate-900 dark:text-slate-100 mb-4">Recent Analyses</h3>
          <div className="space-y-3">
            {analysisHistory.map((analysis) => (
              <div key={analysis.id} className="flex items-center justify-between p-4 bg-slate-50 dark:bg-slate-700 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-600 transition-colors cursor-pointer">
                <div className="flex items-center space-x-3">
                  {getRiskIcon(analysis.riskLevel)}
                  <div>
                    <p className="font-medium text-slate-900 dark:text-slate-100 truncate max-w-xs">
                      {analysis.content}
                    </p>
                    <p className="text-sm text-slate-500 dark:text-slate-400">
                      {new Date(analysis.timestamp).toLocaleString()}
                    </p>
                  </div>
                </div>
                
                <div className="flex items-center space-x-4">
                  <div className="text-right">
                    <p className="text-sm font-medium text-slate-900 dark:text-slate-100">
                      {analysis.accuracy.toFixed(1)}% accuracy
                    </p>
                    <p className="text-xs text-slate-500 dark:text-slate-400">
                      {analysis.hallucinations.length} issues
                    </p>
                  </div>
                  
                  <div className={`px-2 py-1 rounded text-xs font-medium capitalize ${getRiskColor(analysis.riskLevel)}`}>
                    {analysis.riskLevel}
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Getting Started */}
      {!analysisResult && analysisHistory.length === 0 && (
        <div className="bg-white dark:bg-slate-800 rounded-xl shadow-sm border border-slate-200 dark:border-slate-700 p-8 text-center transition-colors duration-200">
          <div className="max-w-2xl mx-auto">
            <Brain className="w-16 h-16 text-blue-600 mx-auto mb-4" />
            <h3 className="text-xl font-bold text-slate-900 dark:text-slate-100 mb-3">
              AI Hallucination Detection Engine
            </h3>
            <p className="text-slate-600 dark:text-slate-400 mb-6 leading-relaxed">
              Our advanced detection system analyzes AI-generated content for factual accuracy, 
              identifies potential hallucinations, and provides confidence scores to help you 
              make informed decisions about content reliability.
            </p>
            
            <div className="grid grid-cols-1 md:grid-cols-3 gap-6 text-left">
              <div className="flex items-start space-x-3">
                <div className="p-2 bg-blue-100 rounded-lg">
                  <Brain className="w-5 h-5 text-blue-600" />
                </div>
                <div>
                  <h4 className="font-semibold text-slate-900 dark:text-slate-100 mb-1">Smart Detection</h4>
                  <p className="text-sm text-slate-600 dark:text-slate-400">
                    Advanced AI models identify patterns indicative of hallucinated content.
                  </p>
                </div>
              </div>
              
              <div className="flex items-start space-x-3">
                <div className="p-2 bg-green-100 rounded-lg">
                  <Shield className="w-5 h-5 text-green-600" />
                </div>
                <div>
                  <h4 className="font-semibold text-slate-900 dark:text-slate-100 mb-1">Risk Assessment</h4>
                  <p className="text-sm text-slate-600 dark:text-slate-400">
                    Comprehensive risk scoring helps prioritize content for human review.
                  </p>
                </div>
              </div>
              
              <div className="flex items-start space-x-3">
                <div className="p-2 bg-purple-100 rounded-lg">
                  <Eye className="w-5 h-5 text-purple-600" />
                </div>
                <div>
                  <h4 className="font-semibold text-slate-900 dark:text-slate-100 mb-1">Source Verification</h4>
                  <p className="text-sm text-slate-600 dark:text-slate-400">
                    Cross-references claims against reliable knowledge bases and sources.
                  </p>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default HallucinationAnalyzer;