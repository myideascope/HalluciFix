import React, { useState } from 'react';
import { Copy, Check, Code, Book, Key, Zap, FileText, BarChart3, Shield, ExternalLink, ChevronDown, ChevronRight } from 'lucide-react';

const ApiDocumentation: React.FC = () => {
  const [copiedCode, setCopiedCode] = useState<string | null>(null);
  const [expandedSections, setExpandedSections] = useState<Set<string>>(new Set(['getting-started']));

  const copyToClipboard = async (text: string, id: string) => {
    try {
      await navigator.clipboard.writeText(text);
      setCopiedCode(id);
      setTimeout(() => setCopiedCode(null), 2000);
    } catch (err) {
      console.error('Failed to copy text: ', err);
    }
  };

  const toggleSection = (sectionId: string) => {
    const newExpanded = new Set(expandedSections);
    if (newExpanded.has(sectionId)) {
      newExpanded.delete(sectionId);
    } else {
      newExpanded.add(sectionId);
    }
    setExpandedSections(newExpanded);
  };

  const CodeBlock: React.FC<{ code: string; language: string; id: string }> = ({ code, language, id }) => (
    <div className="relative">
      <div className="flex items-center justify-between bg-slate-800 text-white px-4 py-2 rounded-t-lg">
        <span className="text-sm font-medium">{language}</span>
        <button
          onClick={() => copyToClipboard(code, id)}
          className="flex items-center space-x-1 text-slate-300 hover:text-white transition-colors"
        >
          {copiedCode === id ? (
            <>
              <Check className="w-4 h-4" />
              <span className="text-sm">Copied!</span>
            </>
          ) : (
            <>
              <Copy className="w-4 h-4" />
              <span className="text-sm">Copy</span>
            </>
          )}
        </button>
      </div>
      <pre className="bg-slate-900 text-slate-100 p-4 rounded-b-lg overflow-x-auto">
        <code>{code}</code>
      </pre>
    </div>
  );

  const Section: React.FC<{ id: string; title: string; icon: React.ReactNode; children: React.ReactNode }> = ({ 
    id, title, icon, children 
  }) => {
    const isExpanded = expandedSections.has(id);
    
    return (
      <div className="border border-slate-200 rounded-lg overflow-hidden">
        <button
          onClick={() => toggleSection(id)}
          className="w-full flex items-center justify-between p-4 bg-slate-50 hover:bg-slate-100 transition-colors"
        >
          <div className="flex items-center space-x-3">
            {icon}
            <h2 className="text-lg font-bold text-slate-900">{title}</h2>
          </div>
          {isExpanded ? (
            <ChevronDown className="w-5 h-5 text-slate-600" />
          ) : (
            <ChevronRight className="w-5 h-5 text-slate-600" />
          )}
        </button>
        {isExpanded && (
          <div className="p-6 bg-white">
            {children}
          </div>
        )}
      </div>
    );
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 to-slate-100">
      {/* Header */}
      <header className="bg-white border-b border-slate-200 shadow-sm">
        <div className="max-w-6xl mx-auto px-6 py-6">
          <div className="flex items-center justify-between">
            <div className="flex items-center space-x-3">
              <div className="p-2 bg-blue-600 rounded-lg">
                <Book className="w-6 h-6 text-white" />
              </div>
              <div>
                <h1 className="text-2xl font-bold text-slate-900">HalluciFix API Documentation</h1>
                <p className="text-slate-600">Integrate AI content verification into your applications</p>
              </div>
            </div>
            <div className="flex items-center space-x-2 px-3 py-1.5 bg-green-50 text-green-700 rounded-full text-sm font-medium">
              <Shield className="w-4 h-4" />
              <span>API v1.0</span>
            </div>
          </div>
        </div>
      </header>

      <div className="max-w-6xl mx-auto px-6 py-8">
        <div className="space-y-6">
          {/* Getting Started */}
          <Section id="getting-started" title="Getting Started" icon={<Zap className="w-5 h-5 text-blue-600" />}>
            <div className="space-y-6">
              <div>
                <h3 className="text-lg font-semibold text-slate-900 mb-3">Base URL</h3>
                <div className="bg-slate-100 rounded-lg p-3 font-mono text-sm">
                  https://api.hallucifix.com
                </div>
              </div>

              <div>
                <h3 className="text-lg font-semibold text-slate-900 mb-3">Authentication</h3>
                <p className="text-slate-600 mb-4">
                  All API requests require authentication using your API key in the Authorization header:
                </p>
                <CodeBlock
                  id="auth-header"
                  language="HTTP"
                  code={`Authorization: Bearer YOUR_API_KEY`}
                />
              </div>

              <div>
                <h3 className="text-lg font-semibold text-slate-900 mb-3">Quick Start</h3>
                <p className="text-slate-600 mb-4">
                  Here's a simple example to analyze content for hallucinations:
                </p>
                <CodeBlock
                  id="quick-start"
                  language="JavaScript"
                  code={`import { createApiClient } from '@hallucifix/api-client';

const client = createApiClient('your-api-key');

const result = await client.analyzeContent({
  content: "Your AI-generated content here...",
  options: {
    sensitivity: 'medium',
    includeSourceVerification: true
  }
});

console.log(\`Accuracy: \${result.accuracy}%\`);
console.log(\`Risk Level: \${result.riskLevel}\`);
console.log(\`Hallucinations: \${result.hallucinations.length}\`);`}
                />
              </div>
            </div>
          </Section>

          {/* Content Analysis */}
          <Section id="content-analysis" title="Content Analysis" icon={<FileText className="w-5 h-5 text-green-600" />}>
            <div className="space-y-6">
              <div>
                <h3 className="text-lg font-semibold text-slate-900 mb-3">Analyze Single Content</h3>
                <div className="bg-blue-50 border border-blue-200 rounded-lg p-4 mb-4">
                  <div className="flex items-center space-x-2 mb-2">
                    <span className="bg-blue-600 text-white px-2 py-1 rounded text-sm font-medium">POST</span>
                    <code className="text-blue-800">/api/v1/analyze</code>
                  </div>
                  <p className="text-blue-700 text-sm">Analyze a single piece of content for potential hallucinations</p>
                </div>

                <h4 className="font-semibold text-slate-900 mb-2">Request Body</h4>
                <CodeBlock
                  id="analyze-request"
                  language="JSON"
                  code={`{
  "content": "The content to analyze for hallucinations...",
  "options": {
    "sensitivity": "medium",           // "low" | "medium" | "high"
    "includeSourceVerification": true, // boolean
    "maxHallucinations": 10           // number
  }
}`}
                />

                <h4 className="font-semibold text-slate-900 mb-2 mt-4">Response</h4>
                <CodeBlock
                  id="analyze-response"
                  language="JSON"
                  code={`{
  "id": "analysis_123456789",
  "accuracy": 87.5,
  "riskLevel": "medium",
  "processingTime": 1250,
  "verificationSources": 12,
  "hallucinations": [
    {
      "text": "exactly 73.4% of users",
      "type": "False Precision",
      "confidence": 0.89,
      "explanation": "Suspiciously specific statistic without verifiable source",
      "startIndex": 45,
      "endIndex": 67
    }
  ],
  "metadata": {
    "contentLength": 1024,
    "timestamp": "2025-01-17T14:30:00Z",
    "modelVersion": "v2.1.3"
  }
}`}
                />
              </div>
            </div>
          </Section>

          {/* Batch Analysis */}
          <Section id="batch-analysis" title="Batch Analysis" icon={<BarChart3 className="w-5 h-5 text-purple-600" />}>
            <div className="space-y-6">
              <div>
                <h3 className="text-lg font-semibold text-slate-900 mb-3">Submit Batch Analysis</h3>
                <div className="bg-purple-50 border border-purple-200 rounded-lg p-4 mb-4">
                  <div className="flex items-center space-x-2 mb-2">
                    <span className="bg-purple-600 text-white px-2 py-1 rounded text-sm font-medium">POST</span>
                    <code className="text-purple-800">/api/v1/batch/analyze</code>
                  </div>
                  <p className="text-purple-700 text-sm">Submit multiple documents for batch processing</p>
                </div>

                <CodeBlock
                  id="batch-request"
                  language="JSON"
                  code={`{
  "documents": [
    {
      "id": "doc_1",
      "content": "First document content...",
      "filename": "document1.txt"
    },
    {
      "id": "doc_2", 
      "content": "Second document content...",
      "filename": "document2.txt"
    }
  ],
  "options": {
    "sensitivity": "medium",
    "includeSourceVerification": true
  }
}`}
                />

                <h4 className="font-semibold text-slate-900 mb-2 mt-4">Response</h4>
                <CodeBlock
                  id="batch-response"
                  language="JSON"
                  code={`{
  "batchId": "batch_987654321",
  "status": "processing",
  "totalDocuments": 2,
  "completedDocuments": 0,
  "results": [],
  "estimatedTimeRemaining": 45000
}`}
                />
              </div>

              <div>
                <h3 className="text-lg font-semibold text-slate-900 mb-3">Get Batch Status</h3>
                <div className="bg-green-50 border border-green-200 rounded-lg p-4 mb-4">
                  <div className="flex items-center space-x-2 mb-2">
                    <span className="bg-green-600 text-white px-2 py-1 rounded text-sm font-medium">GET</span>
                    <code className="text-green-800">/api/v1/batch/{`{batchId}`}</code>
                  </div>
                  <p className="text-green-700 text-sm">Check the status of a batch analysis job</p>
                </div>

                <CodeBlock
                  id="batch-status"
                  language="JavaScript"
                  code={`const status = await client.getBatchStatus('batch_987654321');

if (status.status === 'completed') {
  console.log(\`Processed \${status.completedDocuments} documents\`);
  status.results.forEach(result => {
    console.log(\`\${result.id}: \${result.accuracy}% accuracy\`);
  });
}`}
                />
              </div>
            </div>
          </Section>

          {/* Error Handling */}
          <Section id="error-handling" title="Error Handling" icon={<Shield className="w-5 h-5 text-red-600" />}>
            <div className="space-y-6">
              <div>
                <h3 className="text-lg font-semibold text-slate-900 mb-3">Error Response Format</h3>
                <p className="text-slate-600 mb-4">
                  All API errors follow a consistent format:
                </p>
                <CodeBlock
                  id="error-format"
                  language="JSON"
                  code={`{
  "error": {
    "code": "INVALID_API_KEY",
    "message": "The provided API key is invalid or expired",
    "details": {
      "timestamp": "2025-01-17T14:30:00Z",
      "requestId": "req_123456789"
    }
  }
}`}
                />
              </div>

              <div>
                <h3 className="text-lg font-semibold text-slate-900 mb-3">Common Error Codes</h3>
                <div className="overflow-x-auto">
                  <table className="w-full border border-slate-200 rounded-lg">
                    <thead className="bg-slate-50">
                      <tr>
                        <th className="text-left p-3 font-semibold text-slate-900">Code</th>
                        <th className="text-left p-3 font-semibold text-slate-900">Status</th>
                        <th className="text-left p-3 font-semibold text-slate-900">Description</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-200">
                      <tr>
                        <td className="p-3 font-mono text-sm">INVALID_API_KEY</td>
                        <td className="p-3">401</td>
                        <td className="p-3">API key is missing, invalid, or expired</td>
                      </tr>
                      <tr>
                        <td className="p-3 font-mono text-sm">CONTENT_TOO_LARGE</td>
                        <td className="p-3">413</td>
                        <td className="p-3">Content exceeds maximum size limit</td>
                      </tr>
                      <tr>
                        <td className="p-3 font-mono text-sm">RATE_LIMIT_EXCEEDED</td>
                        <td className="p-3">429</td>
                        <td className="p-3">Too many requests, rate limit exceeded</td>
                      </tr>
                      <tr>
                        <td className="p-3 font-mono text-sm">INSUFFICIENT_QUOTA</td>
                        <td className="p-3">402</td>
                        <td className="p-3">Account quota exceeded</td>
                      </tr>
                    </tbody>
                  </table>
                </div>
              </div>

              <div>
                <h3 className="text-lg font-semibold text-slate-900 mb-3">Error Handling Example</h3>
                <CodeBlock
                  id="error-handling"
                  language="JavaScript"
                  code={`try {
  const result = await client.analyzeContent({
    content: "Your content here..."
  });
  console.log(result);
} catch (error) {
  if (error.message.includes('RATE_LIMIT_EXCEEDED')) {
    console.log('Rate limit exceeded, retrying in 60 seconds...');
    setTimeout(() => {
      // Retry the request
    }, 60000);
  } else if (error.message.includes('INVALID_API_KEY')) {
    console.error('Please check your API key');
  } else {
    console.error('Unexpected error:', error.message);
  }
}`}
                />
              </div>
            </div>
          </Section>

          {/* Rate Limits */}
          <Section id="rate-limits" title="Rate Limits & Quotas" icon={<BarChart3 className="w-5 h-5 text-amber-600" />}>
            <div className="space-y-6">
              <div>
                <h3 className="text-lg font-semibold text-slate-900 mb-3">Rate Limits</h3>
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                  <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
                    <h4 className="font-semibold text-blue-900 mb-2">Starter Plan</h4>
                    <p className="text-blue-700 text-sm">100 requests/hour</p>
                    <p className="text-blue-700 text-sm">1,000 requests/month</p>
                  </div>
                  <div className="bg-green-50 border border-green-200 rounded-lg p-4">
                    <h4 className="font-semibold text-green-900 mb-2">Professional</h4>
                    <p className="text-green-700 text-sm">1,000 requests/hour</p>
                    <p className="text-green-700 text-sm">50,000 requests/month</p>
                  </div>
                  <div className="bg-purple-50 border border-purple-200 rounded-lg p-4">
                    <h4 className="font-semibold text-purple-900 mb-2">Enterprise</h4>
                    <p className="text-purple-700 text-sm">Custom limits</p>
                    <p className="text-purple-700 text-sm">Unlimited requests</p>
                  </div>
                </div>
              </div>

              <div>
                <h3 className="text-lg font-semibold text-slate-900 mb-3">Check Usage</h3>
                <div className="bg-amber-50 border border-amber-200 rounded-lg p-4 mb-4">
                  <div className="flex items-center space-x-2 mb-2">
                    <span className="bg-amber-600 text-white px-2 py-1 rounded text-sm font-medium">GET</span>
                    <code className="text-amber-800">/api/v1/usage</code>
                  </div>
                  <p className="text-amber-700 text-sm">Get current usage statistics and remaining quota</p>
                </div>

                <CodeBlock
                  id="usage-response"
                  language="JSON"
                  code={`{
  "requestsToday": 45,
  "requestsThisMonth": 1250,
  "remainingQuota": 48750,
  "quotaResetDate": "2025-02-01T00:00:00Z"
}`}
                />
              </div>
            </div>
          </Section>

          {/* SDKs and Libraries */}
          <Section id="sdks" title="SDKs & Libraries" icon={<Code className="w-5 h-5 text-indigo-600" />}>
            <div className="space-y-6">
              <div>
                <h3 className="text-lg font-semibold text-slate-900 mb-3">Official SDKs</h3>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div className="border border-slate-200 rounded-lg p-4">
                    <div className="flex items-center space-x-2 mb-2">
                      <Code className="w-5 h-5 text-yellow-600" />
                      <h4 className="font-semibold text-slate-900">JavaScript/TypeScript</h4>
                    </div>
                    <CodeBlock
                      id="js-install"
                      language="bash"
                      code="npm install @hallucifix/api-client"
                    />
                  </div>
                  
                  <div className="border border-slate-200 rounded-lg p-4">
                    <div className="flex items-center space-x-2 mb-2">
                      <Code className="w-5 h-5 text-blue-600" />
                      <h4 className="font-semibold text-slate-900">Python</h4>
                    </div>
                    <CodeBlock
                      id="python-install"
                      language="bash"
                      code="pip install hallucifix-python"
                    />
                  </div>
                </div>
              </div>

              <div>
                <h3 className="text-lg font-semibold text-slate-900 mb-3">Python Example</h3>
                <CodeBlock
                  id="python-example"
                  language="Python"
                  code={`from hallucifix import HalluciFixClient

client = HalluciFixClient(api_key='your-api-key')

result = client.analyze_content(
    content="Your AI-generated content here...",
    sensitivity='medium',
    include_source_verification=True
)

print(f"Accuracy: {result.accuracy}%")
print(f"Risk Level: {result.risk_level}")
print(f"Hallucinations: {len(result.hallucinations)}")`}
                />
              </div>

              <div>
                <h3 className="text-lg font-semibold text-slate-900 mb-3">cURL Example</h3>
                <CodeBlock
                  id="curl-example"
                  language="bash"
                  code={`curl -X POST https://api.hallucifix.com/api/v1/analyze \\
  -H "Authorization: Bearer YOUR_API_KEY" \\
  -H "Content-Type: application/json" \\
  -d '{
    "content": "Your AI-generated content here...",
    "options": {
      "sensitivity": "medium",
      "includeSourceVerification": true
    }
  }'`}
                />
              </div>
            </div>
          </Section>
        </div>

        {/* Footer */}
        <div className="mt-12 pt-8 border-t border-slate-200">
          <div className="flex flex-col md:flex-row justify-between items-center space-y-4 md:space-y-0">
            <div className="text-sm text-slate-600">
              <p>© 2025 HalluciFix. All rights reserved.</p>
            </div>
            <div className="flex items-center space-x-6 text-sm">
              <a href="#" className="text-slate-600 hover:text-slate-900 transition-colors flex items-center space-x-1">
                <ExternalLink className="w-4 h-4" />
                <span>Support</span>
              </a>
              <a href="#" className="text-slate-600 hover:text-slate-900 transition-colors flex items-center space-x-1">
                <ExternalLink className="w-4 h-4" />
                <span>Status Page</span>
              </a>
              <a href="#" className="text-slate-600 hover:text-slate-900 transition-colors flex items-center space-x-1">
                <ExternalLink className="w-4 h-4" />
                <span>Changelog</span>
              </a>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default ApiDocumentation;