import React, { useState } from 'react';
import { Brain, Upload, FileText, AlertTriangle, CheckCircle2, XCircle, TrendingDown, TrendingUp, Minus, Eye, Copy, Download, Zap } from 'lucide-react';
import { 
  SeqLogprobAnalyzer, 
  TokenProbability, 
  SeqLogprobResult, 
  createTokenProbabilities,
  parseTokenizedResponse,
  analyzeSequenceConfidence 
} from '../lib/seqLogprob';
import { SimpleTokenizer } from '../lib/tokenizer';
import { parsePDF, isPDFFile } from '../lib/pdfParser';

interface SeqLogprobAnalyzerProps {
  onAnalysisComplete?: (result: SeqLogprobResult) => void;
}

const SeqLogprobAnalyzerComponent: React.FC<SeqLogprobAnalyzerProps> = ({ onAnalysisComplete }) => {
  const [text, setText] = useState('');
  const [tokenInput, setTokenInput] = useState('');
  const [probInput, setProbInput] = useState('');
  const [threshold, setThreshold] = useState(-2.5);
  const [result, setResult] = useState<SeqLogprobResult | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [inputMode, setInputMode] = useState<'manual' | 'json'>('manual');
  const [jsonInput, setJsonInput] = useState('');
  const fileInputRef = React.useRef<HTMLInputElement>(null);

  const analyzer = new SeqLogprobAnalyzer();

  const sampleData = {
    text: "Polar bears enjoy sunbathing on the beaches of Antarctica during the winter",
    tokens: ["Polar", " bears", " enjoy", " sunbathing", " on", " the", " beaches", " of", " Antarctica", " during", " the", " winter"],
    probabilities: [0.85, 0.9, 0.7, 0.01, 0.6, 0.9, 0.02, 0.8, 0.3, 0.7, 0.9, 0.05]
  };

  const handleFileUpload = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    setError('');
    setLoading(true);

    try {
      let fileContent = '';
      
      if (isPDFFile(file)) {
        fileContent = await parsePDF(file);
      } else {
        fileContent = await new Promise<string>((resolve, reject) => {
          const reader = new FileReader();
          reader.onload = (e) => resolve(e.target?.result as string);
          reader.onerror = () => reject(new Error('Failed to read file'));
          reader.readAsText(file);
        });
      }
      
      // Set the text
      setText(fileContent);
      
      // Automatically tokenize and generate probabilities
      const tokenizationResult = SimpleTokenizer.tokenize(fileContent);
      setTokenInput(SimpleTokenizer.tokensToString(tokenizationResult.tokens));
      setProbInput(SimpleTokenizer.probabilitiesToString(tokenizationResult.probabilities));
      
    } catch (error: any) {
      setError(`Error reading file: ${error.message}`);
    } finally {
      setLoading(false);
      // Reset file input
      if (fileInputRef.current) {
        fileInputRef.current.value = '';
      }
    }
  };

  const handleTextChange = (newText: string) => {
    setText(newText);
    
    // Auto-tokenize when text changes
    if (newText.trim()) {
      const tokenizationResult = SimpleTokenizer.tokenize(newText);
      setTokenInput(SimpleTokenizer.tokensToString(tokenizationResult.tokens));
      setProbInput(SimpleTokenizer.probabilitiesToString(tokenizationResult.probabilities));
    } else {
      setTokenInput('');
      setProbInput('');
    }
  };

  const loadSampleData = () => {
    setText(sampleData.text);
    setTokenInput(sampleData.tokens.join(', '));
    setProbInput(sampleData.probabilities.join(', '));
    setError('');
  };

  const parseManualInput = (): TokenProbability[] => {
    const tokens = tokenInput.split(',').map(t => t.trim()).filter(t => t);
    const probabilities = probInput.split(',').map(p => parseFloat(p.trim())).filter(p => !isNaN(p));

    if (tokens.length !== probabilities.length) {
      throw new Error('Number of tokens must match number of probabilities');
    }

    if (probabilities.some(p => p < 0 || p > 1)) {
      throw new Error('All probabilities must be between 0 and 1');
    }

    return createTokenProbabilities(tokens, probabilities);
  };

  const parseJsonInput = (): TokenProbability[] => {
    try {
      const parsed = JSON.parse(jsonInput);
      return parseTokenizedResponse(parsed);
    } catch (error) {
      throw new Error('Invalid JSON format. Expected OpenAI API format or {tokens: [], logprobs: []} format');
    }
  };

  const analyzeSequence = async () => {
    setLoading(true);
    setError('');
    setResult(null);

    try {
      let tokenProbs: TokenProbability[];

      if (inputMode === 'manual') {
        tokenProbs = parseManualInput();
      } else {
        tokenProbs = parseJsonInput();
      }

      const analysisResult = analyzeSequenceConfidence(text, tokenProbs, {
        threshold,
        includeDetailedAnalysis: true,
        modelInfo: {
          name: 'Demo Model',
          version: '1.0',
          temperature: 0.7
        }
      });

      setResult(analysisResult);
      
      // Notify parent component if callback provided
      if (onAnalysisComplete) {
        onAnalysisComplete(analysisResult);
      }
    } catch (error: any) {
      setError(error.message);
    } finally {
      setLoading(false);
    }
  };

  const copyResults = async () => {
    if (!result) return;
    
    const summary = {
      text,
      seqLogprob: result.seqLogprob,
      normalizedSeqLogprob: result.normalizedSeqLogprob,
      confidenceScore: result.confidenceScore,
      hallucinationRisk: result.hallucinationRisk,
      isHallucinationSuspected: result.isHallucinationSuspected,
      lowConfidenceTokens: result.lowConfidenceTokens,
      suspiciousSequences: result.suspiciousSequences.length,
      recommendations: result.insights?.recommendedActions || []
    };

    try {
      await navigator.clipboard.writeText(JSON.stringify(summary, null, 2));
    } catch (err) {
      console.error('Failed to copy results:', err);
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

  const getConfidenceColor = (level: string) => {
    switch (level) {
      case 'high': return 'text-green-700 bg-green-100';
      case 'medium': return 'text-blue-700 bg-blue-100';
      case 'low': return 'text-amber-700 bg-amber-100';
      case 'very_low': return 'text-red-700 bg-red-100';
      default: return 'text-slate-700 bg-slate-100';
    }
  };

  const getTrendIcon = (trend: string) => {
    switch (trend) {
      case 'improving': return <TrendingUp className="w-4 h-4 text-green-600" />;
      case 'declining': return <TrendingDown className="w-4 h-4 text-red-600" />;
      case 'stable': return <Minus className="w-4 h-4 text-slate-600" />;
      default: return <Minus className="w-4 h-4 text-slate-600" />;
    }
  };

  return (
    <div className="space-y-8">
      {/* Header */}
      <div className="bg-white dark:bg-slate-800 rounded-xl shadow-sm border border-slate-200 dark:border-slate-700 p-6 transition-colors duration-200">
        <div className="flex items-center space-x-3 mb-4">
          <div className="p-2 bg-purple-100 dark:bg-purple-900/20 rounded-lg">
            <Brain className="w-6 h-6 text-purple-600 dark:text-purple-400" />
          </div>
          <div>
            <h2 className="text-xl font-bold text-slate-900 dark:text-slate-100">Seq-Logprob Hallucination Detector</h2>
            <p className="text-slate-600 dark:text-slate-400">
              Analyze token-level probabilities to detect low-confidence sequences that may indicate hallucinations
            </p>
          </div>
        </div>

        <div className="bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 rounded-lg p-4">
          <h4 className="font-semibold text-blue-900 dark:text-blue-100 mb-2">How Seq-Logprob Works</h4>
          <div className="text-sm text-blue-800 dark:text-blue-200 space-y-1">
            <p>• <strong>Log Probability Calculation:</strong> Computes log(P(token)) for each token in the sequence</p>
            <p>• <strong>Sequence Normalization:</strong> Normalizes total log probability by sequence length (1/L)</p>
            <p>• <strong>Threshold Detection:</strong> Flags sequences below configurable confidence threshold</p>
            <p>• <strong>Pattern Analysis:</strong> Identifies suspicious consecutive low-confidence tokens</p>
          </div>
        </div>
      </div>

      {/* Input Section */}
      <div className="bg-white dark:bg-slate-800 rounded-xl shadow-sm border border-slate-200 dark:border-slate-700 p-6 transition-colors duration-200">
        <h3 className="text-lg font-bold text-slate-900 dark:text-slate-100 mb-4">Input Configuration</h3>
        
        {/* Text Input */}
        <div className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-2">
              Generated Text
            </label>
            <textarea
              value={text}
              onChange={(e) => setText(e.target.value)}
              placeholder="Enter the LLM-generated text to analyze..."
              className="w-full h-24 px-4 py-3 border border-slate-300 dark:border-slate-600 rounded-lg focus:ring-2 focus:ring-purple-500 focus:border-transparent resize-none bg-white dark:bg-slate-700 text-slate-900 dark:text-slate-100"
            />
          </div>

          {/* Input Mode Toggle */}
          <div className="flex items-center space-x-4">
            <span className="text-sm font-medium text-slate-700 dark:text-slate-300">Input Mode:</span>
            <div className="flex items-center space-x-2">
              <button
                onClick={() => setInputMode('manual')}
                className={`px-3 py-1.5 text-sm rounded-lg transition-colors ${
                  inputMode === 'manual' 
                    ? 'bg-purple-600 text-white' 
                    : 'bg-slate-100 dark:bg-slate-700 text-slate-600 dark:text-slate-400 hover:bg-slate-200 dark:hover:bg-slate-600'
                }`}
              >
                Manual Input
              </button>
              <button
                onClick={() => setInputMode('json')}
                className={`px-3 py-1.5 text-sm rounded-lg transition-colors ${
                  inputMode === 'json' 
                    ? 'bg-purple-600 text-white' 
                    : 'bg-slate-100 dark:bg-slate-700 text-slate-600 dark:text-slate-400 hover:bg-slate-200 dark:hover:bg-slate-600'
                }`}
              >
                JSON/API Format
              </button>
            </div>
          </div>

          {/* Manual Input Mode */}
          {inputMode === 'manual' && (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-2">
                  Tokens (comma-separated)
                </label>
                <p className="text-xs text-slate-500 dark:text-slate-400 mb-2">
                  Auto-generated from text above. Edit manually if needed.
                </p>
                <textarea
                  value={tokenInput}
                  onChange={(e) => setTokenInput(e.target.value)}
                  placeholder="Polar, bears, enjoy, sunbathing, ..."
                  className="w-full h-20 px-3 py-2 border border-slate-300 dark:border-slate-600 rounded-lg focus:ring-2 focus:ring-purple-500 focus:border-transparent resize-none bg-white dark:bg-slate-700 text-slate-900 dark:text-slate-100"
                />
              </div>
              
              <div>
                <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-2">
                  Probabilities (comma-separated)
                </label>
                <p className="text-xs text-slate-500 dark:text-slate-400 mb-2">
                  Auto-generated realistic probabilities. Adjust for testing different scenarios.
                </p>
                <textarea
                  value={probInput}
                  onChange={(e) => setProbInput(e.target.value)}
                  placeholder="0.85, 0.9, 0.7, 0.01, ..."
                  className="w-full h-20 px-3 py-2 border border-slate-300 dark:border-slate-600 rounded-lg focus:ring-2 focus:ring-purple-500 focus:border-transparent resize-none bg-white dark:bg-slate-700 text-slate-900 dark:text-slate-100"
                />
              </div>
            </div>
          )}

          {/* JSON Input Mode */}
          {inputMode === 'json' && (
            <div>
              <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-2">
                JSON Input (OpenAI API format or {`{tokens: [], logprobs: []}`})
              </label>
              <div className="flex items-center space-x-2 mb-2">
                <button
                  onClick={() => fileInputRef.current?.click()}
                  className="flex items-center space-x-2 px-3 py-1.5 text-sm text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-200 transition-colors"
                >
                  <Upload className="w-4 h-4" />
                  <span>Upload File</span>
                </button>
                <span className="text-xs text-slate-500 dark:text-slate-400">
                  Supports: TXT, PDF, DOC, DOCX, MD
                </span>
              </div>
              <textarea
                value={jsonInput}
                onChange={(e) => handleTextChange(e.target.value)}
                placeholder={`{
  "choices": [{
    "logprobs": {
      "tokens": ["Polar", " bears", " enjoy"],
      "token_logprobs": [-0.16, -0.11, -0.36]
    }
  }]
}`}
                className="w-full h-32 px-3 py-2 border border-slate-300 dark:border-slate-600 rounded-lg focus:ring-2 focus:ring-purple-500 focus:border-transparent resize-none font-mono text-sm bg-white dark:bg-slate-700 text-slate-900 dark:text-slate-100"
              />
              <input
                ref={fileInputRef}
                type="file"
                accept=".txt,.md,.doc,.docx,.pdf"
                onChange={handleFileUpload}
                className="hidden"
              />
            </div>
          )}

          {/* Threshold Configuration */}
          <div className="flex items-center space-x-4">
            <div className="flex-1">
              <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-2">
                Hallucination Threshold
              </label>
              <div className="flex items-center space-x-4">
                <input
                  type="range"
                  min="-5"
                  max="-0.5"
                  step="0.1"
                  value={threshold}
                  onChange={(e) => setThreshold(parseFloat(e.target.value))}
                  className="flex-1 h-2 bg-slate-200 dark:bg-slate-600 rounded-lg appearance-none cursor-pointer"
                />
                <span className="text-sm font-medium text-slate-900 dark:text-slate-100 min-w-[4rem]">
                  {threshold.toFixed(1)}
                </span>
              </div>
              <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">
                Lower values = more sensitive detection. Typical range: -1.0 (strict) to -4.0 (lenient)
              </p>
            </div>
          </div>

          {/* Action Buttons */}
          <div className="flex items-center justify-between">
            <div className="flex items-center space-x-3">
              <button
                onClick={loadSampleData}
                className="flex items-center space-x-2 px-4 py-2 text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-200 transition-colors"
              >
                <FileText className="w-4 h-4" />
                <span>Load Sample</span>
              </button>
              
              <button
                onClick={() => fileInputRef.current?.click()}
                className="flex items-center space-x-2 px-4 py-2 text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-200 transition-colors"
              >
                <Upload className="w-4 h-4" />
                <span>Upload File</span>
              </button>
              
              {result && (
                <button
                  onClick={copyResults}
                  className="flex items-center space-x-2 px-4 py-2 text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-200 transition-colors"
                >
                  <Copy className="w-4 h-4" />
                  <span>Copy Results</span>
                </button>
              )}
            </div>

            <button
              onClick={analyzeSequence}
              disabled={!text.trim() || loading || (!tokenInput.trim() && !jsonInput.trim())}
              className="flex items-center space-x-2 px-6 py-3 bg-purple-600 text-white rounded-lg hover:bg-purple-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
            >
              {loading ? (
                <>
                  <div className="animate-spin rounded-full h-4 w-4 border-2 border-white border-t-transparent"></div>
                  <span>Analyzing...</span>
                </>
              ) : (
                <>
                  <Brain className="w-4 h-4" />
                  <span>Analyze Sequence</span>
                </>
              )}
            </button>
          </div>

          {error && (
            <div className="p-4 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg">
              <div className="flex items-center space-x-2">
                <XCircle className="w-5 h-5 text-red-600 dark:text-red-400" />
                <p className="text-sm text-red-700 dark:text-red-300">{error}</p>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Results */}
      {result && (
        <div className="space-y-6">
          {/* Overall Results */}
          <div className="bg-white dark:bg-slate-800 rounded-xl shadow-sm border border-slate-200 dark:border-slate-700 p-6 transition-colors duration-200">
            <div className="flex items-center justify-between mb-6">
              <h3 className="text-lg font-bold text-slate-900 dark:text-slate-100">Seq-Logprob Analysis Results</h3>
              <div className="text-sm text-slate-500 dark:text-slate-400">
                Processed in {result.processingTime}ms
              </div>
            </div>

            {/* Key Metrics */}
            <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-6">
              <div className="bg-slate-50 dark:bg-slate-700 rounded-lg p-4">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm font-medium text-slate-600 dark:text-slate-400">Seq-Logprob</p>
                    <p className="text-xl font-bold text-slate-900 dark:text-slate-100">
                      {result.normalizedSeqLogprob.toFixed(3)}
                    </p>
                  </div>
                  <Brain className="w-8 h-8 text-slate-400" />
                </div>
                <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">
                  Normalized by length ({result.sequenceLength} tokens)
                </p>
              </div>

              <div className="bg-slate-50 dark:bg-slate-700 rounded-lg p-4">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm font-medium text-slate-600 dark:text-slate-400">Confidence Score</p>
                    <p className="text-xl font-bold text-slate-900 dark:text-slate-100">
                      {result.confidenceScore}%
                    </p>
                  </div>
                  <CheckCircle2 className="w-8 h-8 text-slate-400" />
                </div>
                <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">
                  Model confidence level
                </p>
              </div>

              <div className="bg-slate-50 dark:bg-slate-700 rounded-lg p-4">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm font-medium text-slate-600 dark:text-slate-400">Low Confidence</p>
                    <p className="text-xl font-bold text-slate-900 dark:text-slate-100">
                      {result.lowConfidenceTokens}
                    </p>
                  </div>
                  <AlertTriangle className="w-8 h-8 text-slate-400" />
                </div>
                <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">
                  Tokens below threshold
                </p>
              </div>

              <div className="bg-slate-50 dark:bg-slate-700 rounded-lg p-4">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm font-medium text-slate-600 dark:text-slate-400">Suspicious Sequences</p>
                    <p className="text-xl font-bold text-slate-900 dark:text-slate-100">
                      {result.suspiciousSequences.length}
                    </p>
                  </div>
                  <Eye className="w-8 h-8 text-slate-400" />
                </div>
                <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">
                  Consecutive low-confidence tokens
                </p>
              </div>
            </div>

            {/* Risk Assessment */}
            <div className={`rounded-lg border p-4 ${getRiskColor(result.hallucinationRisk)}`}>
              <div className="flex items-center space-x-3">
                {result.isHallucinationSuspected ? (
                  <XCircle className="w-6 h-6" />
                ) : (
                  <CheckCircle2 className="w-6 h-6" />
                )}
                <div>
                  <h4 className="font-semibold capitalize">
                    {result.isHallucinationSuspected ? 'Hallucination Suspected' : 'Sequence Appears Reliable'}
                  </h4>
                  <p className="text-sm opacity-80">
                    Risk Level: {result.hallucinationRisk.charAt(0).toUpperCase() + result.hallucinationRisk.slice(1)} • 
                    Threshold: {result.threshold} • 
                    Confidence: {result.confidenceScore}%
                  </p>
                </div>
              </div>
            </div>
          </div>

          {/* Token Analysis */}
          <div className="bg-white dark:bg-slate-800 rounded-xl shadow-sm border border-slate-200 dark:border-slate-700 p-6 transition-colors duration-200">
            <h3 className="text-lg font-bold text-slate-900 dark:text-slate-100 mb-4">Token-Level Analysis</h3>
            
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead>
                  <tr className="border-b border-slate-200 dark:border-slate-600">
                    <th className="text-left text-sm font-medium text-slate-600 dark:text-slate-400 pb-3">Position</th>
                    <th className="text-left text-sm font-medium text-slate-600 dark:text-slate-400 pb-3">Token</th>
                    <th className="text-left text-sm font-medium text-slate-600 dark:text-slate-400 pb-3">Probability</th>
                    <th className="text-left text-sm font-medium text-slate-600 dark:text-slate-400 pb-3">Log Probability</th>
                    <th className="text-left text-sm font-medium text-slate-600 dark:text-slate-400 pb-3">Confidence Level</th>
                    <th className="text-left text-sm font-medium text-slate-600 dark:text-slate-400 pb-3">Status</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 dark:divide-slate-700">
                  {result.tokenAnalysis.map((token, index) => (
                    <tr key={index} className={`hover:bg-slate-50 dark:hover:bg-slate-700 transition-colors ${
                      token.isLowConfidence ? 'bg-red-50 dark:bg-red-900/10' : ''
                    }`}>
                      <td className="py-3 pr-4 text-sm text-slate-600 dark:text-slate-400">
                        {token.position}
                      </td>
                      <td className="py-3 pr-4">
                        <code className="text-sm bg-slate-100 dark:bg-slate-700 px-2 py-1 rounded text-slate-900 dark:text-slate-100">
                          "{token.token}"
                        </code>
                      </td>
                      <td className="py-3 pr-4 text-sm text-slate-900 dark:text-slate-100">
                        {token.probability.toFixed(4)}
                      </td>
                      <td className="py-3 pr-4 text-sm font-mono text-slate-900 dark:text-slate-100">
                        {token.logProbability.toFixed(3)}
                      </td>
                      <td className="py-3 pr-4">
                        <span className={`px-2 py-1 rounded text-xs font-medium capitalize ${getConfidenceColor(token.confidenceLevel)}`}>
                          {token.confidenceLevel.replace('_', ' ')}
                        </span>
                      </td>
                      <td className="py-3">
                        {token.isLowConfidence ? (
                          <div className="flex items-center space-x-1">
                            <AlertTriangle className="w-4 h-4 text-red-600 dark:text-red-400" />
                            <span className="text-xs text-red-600 dark:text-red-400">Flagged</span>
                          </div>
                        ) : (
                          <div className="flex items-center space-x-1">
                            <CheckCircle2 className="w-4 h-4 text-green-600 dark:text-green-400" />
                            <span className="text-xs text-green-600 dark:text-green-400">Normal</span>
                          </div>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          {/* Suspicious Sequences */}
          {result.suspiciousSequences.length > 0 && (
            <div className="bg-white dark:bg-slate-800 rounded-xl shadow-sm border border-slate-200 dark:border-slate-700 p-6 transition-colors duration-200">
              <h3 className="text-lg font-bold text-slate-900 dark:text-slate-100 mb-4">
                Suspicious Sequences ({result.suspiciousSequences.length})
              </h3>
              
              <div className="space-y-4">
                {result.suspiciousSequences.map((sequence, index) => (
                  <div key={index} className="border border-red-200 dark:border-red-800 rounded-lg p-4 bg-red-50 dark:bg-red-900/20">
                    <div className="flex items-start justify-between mb-2">
                      <div className="flex items-center space-x-2">
                        <AlertTriangle className="w-4 h-4 text-red-600 dark:text-red-400" />
                        <span className="font-medium text-red-900 dark:text-red-100">
                          Sequence {index + 1} (Positions {sequence.startIndex}-{sequence.endIndex})
                        </span>
                      </div>
                      <span className="text-sm text-red-600 dark:text-red-400 font-medium">
                        Avg Log Prob: {sequence.averageLogProb.toFixed(3)}
                      </span>
                    </div>
                    
                    <div className="bg-white dark:bg-slate-800 rounded p-3 mb-3 border border-red-200 dark:border-red-700">
                      <code className="text-sm text-red-800 dark:text-red-200">
                        {sequence.tokens.join('')}
                      </code>
                    </div>
                    
                    <p className="text-sm text-red-700 dark:text-red-300">{sequence.reason}</p>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Detailed Insights */}
          {result.insights && (
            <div className="bg-white dark:bg-slate-800 rounded-xl shadow-sm border border-slate-200 dark:border-slate-700 p-6 transition-colors duration-200">
              <h3 className="text-lg font-bold text-slate-900 dark:text-slate-100 mb-4">Detailed Analysis</h3>
              
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <div>
                  <h4 className="font-semibold text-slate-900 dark:text-slate-100 mb-3">Key Insights</h4>
                  <div className="space-y-3">
                    {result.insights.mostSuspiciousToken && (
                      <div className="p-3 bg-red-50 dark:bg-red-900/20 rounded-lg">
                        <div className="flex items-center space-x-2 mb-1">
                          <AlertTriangle className="w-4 h-4 text-red-600 dark:text-red-400" />
                          <span className="font-medium text-red-900 dark:text-red-100">Most Suspicious Token</span>
                        </div>
                        <code className="text-sm text-red-800 dark:text-red-200">
                          "{result.insights.mostSuspiciousToken.token}"
                        </code>
                        <p className="text-xs text-red-700 dark:text-red-300 mt-1">
                          Log Prob: {result.insights.mostSuspiciousToken.logProbability.toFixed(3)}
                        </p>
                      </div>
                    )}
                    
                    <div className="p-3 bg-slate-50 dark:bg-slate-700 rounded-lg">
                      <div className="flex items-center space-x-2 mb-1">
                        {getTrendIcon(result.insights.confidenceTrend)}
                        <span className="font-medium text-slate-900 dark:text-slate-100">Confidence Trend</span>
                      </div>
                      <p className="text-sm text-slate-600 dark:text-slate-400 capitalize">
                        {result.insights.confidenceTrend}
                      </p>
                    </div>

                    <div className="p-3 bg-slate-50 dark:bg-slate-700 rounded-lg">
                      <div className="flex items-center space-x-2 mb-1">
                        <Brain className="w-4 h-4 text-slate-600 dark:text-slate-400" />
                        <span className="font-medium text-slate-900 dark:text-slate-100">Confidence Variance</span>
                      </div>
                      <p className="text-sm text-slate-600 dark:text-slate-400">
                        {result.confidenceVariance.toFixed(3)}
                      </p>
                    </div>
                  </div>
                </div>

                <div>
                  <h4 className="font-semibold text-slate-900 dark:text-slate-100 mb-3">Recommendations</h4>
                  <div className="space-y-2">
                    {result.insights.recommendedActions.map((action, index) => (
                      <div key={index} className="flex items-start space-x-2">
                        <CheckCircle2 className="w-4 h-4 text-blue-600 dark:text-blue-400 mt-0.5" />
                        <p className="text-sm text-slate-700 dark:text-slate-300">{action}</p>
                      </div>
                    ))}
                  </div>
                </div>
              </div>

              {/* Technical Summary */}
              <div className="mt-6 p-4 bg-slate-50 dark:bg-slate-700 rounded-lg">
                <h5 className="font-medium text-slate-900 dark:text-slate-100 mb-2">Technical Summary</h5>
                <p className="text-sm text-slate-700 dark:text-slate-300 leading-relaxed">
                  {result.insights.technicalSummary}
                </p>
              </div>
            </div>
          )}

          {/* Mathematical Details */}
          <div className="bg-white dark:bg-slate-800 rounded-xl shadow-sm border border-slate-200 dark:border-slate-700 p-6 transition-colors duration-200">
            <h3 className="text-lg font-bold text-slate-900 dark:text-slate-100 mb-4">Mathematical Analysis</h3>
            
            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
              <div>
                <h4 className="font-semibold text-slate-900 dark:text-slate-100 mb-3">Sequence Metrics</h4>
                <div className="space-y-2 text-sm">
                  <div className="flex justify-between">
                    <span className="text-slate-600 dark:text-slate-400">Raw Seq-Logprob:</span>
                    <span className="font-mono text-slate-900 dark:text-slate-100">{result.seqLogprob.toFixed(3)}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-slate-600 dark:text-slate-400">Normalized:</span>
                    <span className="font-mono text-slate-900 dark:text-slate-100">{result.normalizedSeqLogprob.toFixed(3)}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-slate-600 dark:text-slate-400">Average Log Prob:</span>
                    <span className="font-mono text-slate-900 dark:text-slate-100">{result.averageLogProb.toFixed(3)}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-slate-600 dark:text-slate-400">Sequence Length:</span>
                    <span className="font-mono text-slate-900 dark:text-slate-100">{result.sequenceLength}</span>
                  </div>
                </div>
              </div>

              <div>
                <h4 className="font-semibold text-slate-900 dark:text-slate-100 mb-3">Confidence Analysis</h4>
                <div className="space-y-2 text-sm">
                  <div className="flex justify-between">
                    <span className="text-slate-600 dark:text-slate-400">Average Confidence:</span>
                    <span className="font-mono text-slate-900 dark:text-slate-100">{(result.averageConfidence * 100).toFixed(1)}%</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-slate-600 dark:text-slate-400">Confidence Variance:</span>
                    <span className="font-mono text-slate-900 dark:text-slate-100">{result.confidenceVariance.toFixed(3)}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-slate-600 dark:text-slate-400">Low Conf. Ratio:</span>
                    <span className="font-mono text-slate-900 dark:text-slate-100">
                      {((result.lowConfidenceTokens / result.sequenceLength) * 100).toFixed(1)}%
                    </span>
                  </div>
                </div>
              </div>

              <div>
                <h4 className="font-semibold text-slate-900 dark:text-slate-100 mb-3">Detection Parameters</h4>
                <div className="space-y-2 text-sm">
                  <div className="flex justify-between">
                    <span className="text-slate-600 dark:text-slate-400">Threshold:</span>
                    <span className="font-mono text-slate-900 dark:text-slate-100">{result.threshold}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-slate-600 dark:text-slate-400">Below Threshold:</span>
                    <span className={`font-medium ${result.normalizedSeqLogprob < result.threshold ? 'text-red-600' : 'text-green-600'}`}>
                      {result.normalizedSeqLogprob < result.threshold ? 'Yes' : 'No'}
                    </span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-slate-600 dark:text-slate-400">Model Info:</span>
                    <span className="text-slate-900 dark:text-slate-100">
                      {result.modelInfo?.name || 'Unknown'}
                    </span>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Getting Started Guide */}
      {!result && (
        <div className="bg-white dark:bg-slate-800 rounded-xl shadow-sm border border-slate-200 dark:border-slate-700 p-8 text-center transition-colors duration-200">
          <Brain className="w-16 h-16 text-purple-600 dark:text-purple-400 mx-auto mb-4" />
          <h3 className="text-xl font-bold text-slate-900 dark:text-slate-100 mb-3">
            Sequence Log Probability Analysis
          </h3>
          <p className="text-slate-600 dark:text-slate-400 mb-6 leading-relaxed max-w-2xl mx-auto">
            This tool analyzes the token-level probabilities from language models to detect potential hallucinations. 
            Lower log probabilities indicate less confident predictions, which may suggest hallucinated content.
          </p>
          
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6 text-left max-w-3xl mx-auto">
            <div className="flex items-start space-x-3">
              <div className="p-2 bg-purple-100 dark:bg-purple-900/20 rounded-lg">
                <Brain className="w-5 h-5 text-purple-600 dark:text-purple-400" />
              </div>
              <div>
                <h4 className="font-semibold text-slate-900 dark:text-slate-100 mb-1">Token Analysis</h4>
                <p className="text-sm text-slate-600 dark:text-slate-400">
                  Analyzes each token's probability and identifies low-confidence sequences.
                </p>
              </div>
            </div>
            
            <div className="flex items-start space-x-3">
              <div className="p-2 bg-blue-100 dark:bg-blue-900/20 rounded-lg">
                <AlertTriangle className="w-5 h-5 text-blue-600 dark:text-blue-400" />
              </div>
              <div>
                <h4 className="font-semibold text-slate-900 dark:text-slate-100 mb-1">Threshold Detection</h4>
                <p className="text-sm text-slate-600 dark:text-slate-400">
                  Configurable thresholds for detecting potentially hallucinated content.
                </p>
              </div>
            </div>
            
            <div className="flex items-start space-x-3">
              <div className="p-2 bg-green-100 dark:bg-green-900/20 rounded-lg">
                <Eye className="w-5 h-5 text-green-600 dark:text-green-400" />
              </div>
              <div>
                <h4 className="font-semibold text-slate-900 dark:text-slate-100 mb-1">Detailed Insights</h4>
                <p className="text-sm text-slate-600 dark:text-slate-400">
                  Comprehensive analysis with recommendations and technical details.
                </p>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default SeqLogprobAnalyzerComponent;