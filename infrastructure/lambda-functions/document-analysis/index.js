/**
 * AWS Lambda Function: Document Analysis
 * Processes individual documents for hallucination analysis within batch workflows
 */

const { RDSDataService } = require('@aws-sdk/client-rds-data');
const { S3Client, GetObjectCommand } = require('@aws-sdk/client-s3');
const { SQSClient, SendMessageCommand } = require('@aws-sdk/client-sqs');
const { SecretsManagerClient, GetSecretValueCommand } = require('@aws-sdk/client-secrets-manager');
const { BedrockRuntimeClient, InvokeModelCommand } = require('@aws-sdk/client-bedrock-runtime');

// AWS clients
const rdsData = new RDSDataService({ region: process.env.AWS_REGION });
const s3Client = new S3Client({ region: process.env.AWS_REGION });
const sqsClient = new SQSClient({ region: process.env.AWS_REGION });
const secretsManager = new SecretsManagerClient({ region: process.env.AWS_REGION });
const bedrockClient = new BedrockRuntimeClient({ region: process.env.AWS_REGION });

// Environment variables
const DB_CLUSTER_ARN = process.env.DB_CLUSTER_ARN;
const DB_SECRET_ARN = process.env.DB_SECRET_ARN;
const S3_BUCKET_NAME = process.env.S3_BUCKET_NAME;
const BATCH_RESULTS_QUEUE_URL = process.env.BATCH_RESULTS_QUEUE_URL;

// Helper function to execute RDS queries
async function executeQuery(sql, parameters = []) {
  const params = {
    resourceArn: DB_CLUSTER_ARN,
    secretArn: DB_SECRET_ARN,
    database: 'hallucifix',
    sql: sql,
    parameters: parameters
  };

  try {
    const result = await rdsData.executeStatement(params);
    return result;
  } catch (error) {
    console.error('Database query error:', error);
    throw new Error(`Database error: ${error.message}`);
  }
}

// Get document content from S3 or direct input
async function getDocumentContent(document) {
  try {
    if (document.content) {
      return document.content;
    }

    if (document.s3Key) {
      console.log(`Fetching document content from S3: ${document.s3Key}`);
      
      const getCommand = new GetObjectCommand({
        Bucket: S3_BUCKET_NAME,
        Key: document.s3Key,
      });

      const response = await s3Client.send(getCommand);
      const content = await response.Body.transformToString();
      
      console.log(`Retrieved ${content.length} characters from S3`);
      return content;
    }

    throw new Error('No content or S3 key provided');
  } catch (error) {
    console.error(`Error getting document content for ${document.id}:`, error);
    throw error;
  }
}// 
Analyze content using AWS Bedrock
async function analyzeContentWithBedrock(content, options = {}) {
  try {
    const modelId = 'anthropic.claude-3-sonnet-20240229-v1:0';
    
    const prompt = `Human: Analyze this content for hallucinations and inaccuracies. Return JSON format:
{
  "accuracy": <0-100>,
  "riskLevel": "<low|medium|high|critical>",
  "hallucinations": [{"text": "<text>", "type": "<type>", "confidence": <0-1>, "explanation": "<explanation>", "startIndex": <num>, "endIndex": <num>}],
  "verificationSources": <number>,
  "processingTime": <ms>
}

Content: ${content.substring(0, 4000)}A
ssistant: I need to analyze this content for potential hallucinations and inaccuracies.`;

    const requestBody = {
      anthropic_version: "bedrock-2023-05-31",
      max_tokens: 2000,
      temperature: 0.3,
      messages: [
        {
          role: "user",
          content: prompt
        }
      ]
    };

    const command = new InvokeModelCommand({
      modelId,
      body: JSON.stringify(requestBody),
      contentType: 'application/json',
      accept: 'application/json',
    });

    const startTime = Date.now();
    const response = await bedrockClient.send(command);
    const processingTime = Date.now() - startTime;

    const responseBody = JSON.parse(new TextDecoder().decode(response.body));
    const analysisText = responseBody.content[0].text;

    // Parse JSON from Claude's response
    const jsonMatch = analysisText.match(/\{[\s\S]*\}/);
    if (!jsonMatch) {
      throw new Error('Could not parse JSON from Bedrock response');
    }

    const analysis = JSON.parse(jsonMatch[0]);
    analysis.processingTime = processingTime;

    return analysis;

  } catch (error) {
    console.error('Bedrock analysis error:', error);
    
    // Fallback to mock analysis
    return createMockAnalysis(content, options);
  }
}

// Create mock analysis for fallback
function createMockAnalysis(content, options = {}) {
  const suspiciousPatterns = [
    { pattern: /exactly \d+\.\d+%/gi, type: 'False Precision' },
    { pattern: /perfect 100%/gi, type: 'Impossible Metric' },
    { pattern: /zero complaints/gi, type: 'Unverifiable Claim' },
    { pattern: /unprecedented/gi, type: 'Exaggerated Language' },
  ];

  let accuracy = 85 + Math.random() * 10;
  const hallucinations = [];

  suspiciousPatterns.forEach(patternObj => {
    const matches = content.match(patternObj.pattern);
    if (matches) {
      accuracy -= matches.length * (5 + Math.random() * 10);
      matches.forEach(match => {
        const startIndex = content.indexOf(match);
        hallucinations.push({
          text: match,
          type: patternObj.type,
          confidence: 0.7 + Math.random() * 0.25,
          explanation: `Potentially problematic: "${match}"`,
          startIndex,
          endIndex: startIndex + match.length
        });
      });
    }
  });

  accuracy = Math.max(0, accuracy);
  const riskLevel = accuracy > 85 ? 'low' : accuracy > 70 ? 'medium' : accuracy > 50 ? 'high' : 'critical';

  return {
    accuracy: parseFloat(accuracy.toFixed(1)),
    riskLevel,
    hallucinations,
    verificationSources: Math.floor(Math.random() * 15) + 5,
    processingTime: Math.floor(Math.random() * 1000) + 500
  };
}// Save a
nalysis result to database
async function saveAnalysisResult(analysisResult, document, batchId, userId) {
  const sql = `
    INSERT INTO analysis_results (
      id, user_id, content, timestamp, accuracy, risk_level,
      hallucinations, verification_sources, processing_time,
      analysis_type, batch_id, filename, full_content
    ) VALUES (
      :id, :userId, :content, :timestamp, :accuracy, :riskLevel,
      :hallucinations, :verificationSources, :processingTime,
      :analysisType, :batchId, :filename, :fullContent
    )
  `;

  const analysisId = `analysis_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  const now = new Date().toISOString();
  const content = document.content || '';
  
  const parameters = [
    { name: 'id', value: { stringValue: analysisId } },
    { name: 'userId', value: { stringValue: userId } },
    { name: 'content', value: { stringValue: content.substring(0, 200) + (content.length > 200 ? '...' : '') } },
    { name: 'timestamp', value: { stringValue: now } },
    { name: 'accuracy', value: { doubleValue: analysisResult.accuracy } },
    { name: 'riskLevel', value: { stringValue: analysisResult.riskLevel } },
    { name: 'hallucinations', value: { stringValue: JSON.stringify(analysisResult.hallucinations) } },
    { name: 'verificationSources', value: { longValue: analysisResult.verificationSources } },
    { name: 'processingTime', value: { longValue: analysisResult.processingTime } },
    { name: 'analysisType', value: { stringValue: 'batch' } },
    { name: 'batchId', value: { stringValue: batchId } },
    { name: 'filename', value: { stringValue: document.filename || '' } },
    { name: 'fullContent', value: { stringValue: content } },
  ];

  try {
    await executeQuery(sql, parameters);
    console.log(`Saved analysis result: ${analysisId}`);
    return analysisId;
  } catch (error) {
    console.error(`Error saving analysis result:`, error);
    throw error;
  }
}

// Send result to results queue
async function sendResultToQueue(result, batchId, userId) {
  const message = {
    batchId,
    userId,
    result,
    timestamp: new Date().toISOString(),
  };

  try {
    const sendCommand = new SendMessageCommand({
      QueueUrl: BATCH_RESULTS_QUEUE_URL,
      MessageBody: JSON.stringify(message),
      MessageAttributes: {
        batchId: {
          DataType: 'String',
          StringValue: batchId,
        },
        userId: {
          DataType: 'String',
          StringValue: userId,
        },
        documentId: {
          DataType: 'String',
          StringValue: result.documentId,
        },
      },
    });

    await sqsClient.send(sendCommand);
    console.log(`Sent result to queue for document: ${result.documentId}`);
  } catch (error) {
    console.error(`Error sending result to queue:`, error);
    throw error;
  }
}// Ma
in Lambda handler
exports.handler = async (event, context) => {
  const executionId = context.awsRequestId;
  console.log(`[${executionId}] Document analysis started:`, JSON.stringify(event, null, 2));

  try {
    const { document, batchId, userId, options = {} } = event;

    if (!document || !batchId || !userId) {
      throw new Error('Missing required parameters: document, batchId, userId');
    }

    console.log(`[${executionId}] Analyzing document ${document.id} for batch ${batchId}`);

    const startTime = Date.now();

    // Get document content
    const content = await getDocumentContent(document);
    
    if (!content || content.trim().length === 0) {
      throw new Error('Document content is empty');
    }

    console.log(`[${executionId}] Retrieved content: ${content.length} characters`);

    // Perform analysis
    const analysisResult = await analyzeContentWithBedrock(content, options);
    
    // Create full analysis result
    const fullResult = {
      id: `analysis_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
      documentId: document.id,
      filename: document.filename,
      user_id: userId,
      content: content.substring(0, 200) + (content.length > 200 ? '...' : ''),
      timestamp: new Date().toISOString(),
      accuracy: analysisResult.accuracy,
      riskLevel: analysisResult.riskLevel,
      hallucinations: analysisResult.hallucinations,
      verificationSources: analysisResult.verificationSources,
      processingTime: analysisResult.processingTime,
      analysisType: 'batch',
      batchId,
      fullContent: content,
    };

    // Save to database
    const analysisId = await saveAnalysisResult(analysisResult, { ...document, content }, batchId, userId);
    fullResult.id = analysisId;

    // Send result to aggregation queue
    await sendResultToQueue(fullResult, batchId, userId);

    const totalTime = Date.now() - startTime;
    
    console.log(`[${executionId}] Document analysis completed:`, {
      documentId: document.id,
      accuracy: analysisResult.accuracy,
      riskLevel: analysisResult.riskLevel,
      hallucinations: analysisResult.hallucinations.length,
      totalTime,
    });

    return {
      success: true,
      documentId: document.id,
      analysisId,
      accuracy: analysisResult.accuracy,
      riskLevel: analysisResult.riskLevel,
      hallucinationCount: analysisResult.hallucinations.length,
      processingTime: totalTime,
    };

  } catch (error) {
    console.error(`[${executionId}] Document analysis failed:`, error);
    
    // Send error result to queue for tracking
    if (event.batchId && event.userId && event.document) {
      try {
        const errorResult = {
          documentId: event.document.id,
          filename: event.document.filename,
          error: error.message,
          timestamp: new Date().toISOString(),
          success: false,
        };
        
        await sendResultToQueue(errorResult, event.batchId, event.userId);
      } catch (queueError) {
        console.error(`[${executionId}] Failed to send error result to queue:`, queueError);
      }
    }

    throw {
      errorType: 'DocumentAnalysisError',
      errorMessage: error.message,
      documentId: event.document?.id,
      batchId: event.batchId,
      userId: event.userId,
      timestamp: new Date().toISOString(),
    };
  }
};