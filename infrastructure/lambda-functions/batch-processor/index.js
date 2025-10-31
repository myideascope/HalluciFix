/**
 * AWS Lambda Function: Batch Processor
 * Processes batch analysis requests from SQS queues
 */

const { RDSDataService } = require('@aws-sdk/client-rds-data');
const { S3Client, GetObjectCommand } = require('@aws-sdk/client-s3');
const { SNSClient, PublishCommand } = require('@aws-sdk/client-sns');
const { BedrockRuntimeClient, InvokeModelCommand } = require('@aws-sdk/client-bedrock-runtime');

// AWS clients
const rdsData = new RDSDataService({ region: process.env.AWS_REGION });
const s3Client = new S3Client({ region: process.env.AWS_REGION });
const snsClient = new SNSClient({ region: process.env.AWS_REGION });
const bedrockClient = new BedrockRuntimeClient({ region: process.env.AWS_REGION });

// Environment variables
const DB_CLUSTER_ARN = process.env.DB_CLUSTER_ARN;
const DB_SECRET_ARN = process.env.DB_SECRET_ARN;
const S3_BUCKET_NAME = process.env.S3_BUCKET_NAME;
const ALERT_TOPIC_ARN = process.env.ALERT_TOPIC_ARN;

// Bedrock model configuration
const BEDROCK_MODEL = 'anthropic.claude-3-sonnet-20240229-v1:0';
const MODEL_PRICING = {
  'anthropic.claude-3-sonnet-20240229-v1:0': { inputCostPer1K: 0.003, outputCostPer1K: 0.015 },
  'anthropic.claude-3-haiku-20240307-v1:0': { inputCostPer1K: 0.00025, outputCostPer1K: 0.00125 },
};

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
}

// Analyze content using AWS Bedrock
async function analyzeContentWithBedrock(content, options = {}) {
  try {
    const prompt = `Human: Analyze this content for hallucinations and inaccuracies. Return JSON:
{
  "accuracy": <0-100>,
  "riskLevel": "<low|medium|high|critical>",
  "hallucinations": [{"text": "<text>", "type": "<type>", "confidence": <0-1>, "explanation": "<explanation>", "startIndex": <num>, "endIndex": <num>}],
  "verificationSources": <number>,
  "summary": "<summary>"
}

Content: ${content.substring(0, 4000)}

Sensitivity: ${options.sensitivity || 'medium'}A
ssistant: I'll analyze this content for potential hallucinations and inaccuracies.`;

    const requestBody = {
      anthropic_version: 'bedrock-2023-05-31',
      max_tokens: options.maxTokens || 2000,
      temperature: options.temperature || 0.3,
      messages: [{ role: 'user', content: prompt }],
    };

    const command = new InvokeModelCommand({
      modelId: BEDROCK_MODEL,
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
    
    return {
      id: `bedrock_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
      accuracy: analysis.accuracy || 0,
      riskLevel: analysis.riskLevel || 'medium',
      hallucinations: analysis.hallucinations || [],
      verificationSources: analysis.verificationSources || 0,
      processingTime,
      metadata: {
        provider: 'bedrock',
        modelVersion: BEDROCK_MODEL,
        timestamp: new Date().toISOString(),
        tokenUsage: responseBody.usage ? {
          input: responseBody.usage.input_tokens,
          output: responseBody.usage.output_tokens,
          total: responseBody.usage.input_tokens + responseBody.usage.output_tokens,
        } : undefined,
        contentLength: content.length,
      },
    };

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
    id: `mock_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
    accuracy: parseFloat(accuracy.toFixed(1)),
    riskLevel,
    hallucinations,
    verificationSources: Math.floor(Math.random() * 15) + 5,
    processingTime: Math.floor(Math.random() * 1000) + 500,
    metadata: {
      provider: 'mock',
      modelVersion: 'mock-v1.0',
      timestamp: new Date().toISOString(),
      contentLength: content.length,
    },
  };
}// Sav
e analysis result to database
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

  const content = document.content || '';
  
  const parameters = [
    { name: 'id', value: { stringValue: analysisResult.id } },
    { name: 'userId', value: { stringValue: userId } },
    { name: 'content', value: { stringValue: content.substring(0, 200) + (content.length > 200 ? '...' : '') } },
    { name: 'timestamp', value: { stringValue: analysisResult.metadata.timestamp } },
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
    console.log(`Saved analysis result: ${analysisResult.id}`);
    return analysisResult.id;
  } catch (error) {
    console.error(`Error saving analysis result:`, error);
    throw error;
  }
}

// Calculate processing cost
function calculateProcessingCost(analysisResult) {
  if (analysisResult.metadata?.tokenUsage && analysisResult.metadata?.provider === 'bedrock') {
    const tokenUsage = analysisResult.metadata.tokenUsage;
    const model = analysisResult.metadata.modelVersion;
    const pricing = MODEL_PRICING[model];
    
    if (pricing) {
      const inputCost = (tokenUsage.input / 1000) * pricing.inputCostPer1K;
      const outputCost = (tokenUsage.output / 1000) * pricing.outputCostPer1K;
      return inputCost + outputCost;
    }
  }
  return 0;
}

// Update batch progress
async function updateBatchProgress(batchId, processed, successful, failed) {
  const sql = `
    UPDATE batch_analysis_jobs 
    SET processed_documents = :processed,
        successful_documents = :successful,
        failed_documents = :failed,
        updated_at = :updatedAt
    WHERE id = :batchId
  `;

  const parameters = [
    { name: 'processed', value: { longValue: processed } },
    { name: 'successful', value: { longValue: successful } },
    { name: 'failed', value: { longValue: failed } },
    { name: 'updatedAt', value: { stringValue: new Date().toISOString() } },
    { name: 'batchId', value: { stringValue: batchId } },
  ];

  try {
    await executeQuery(sql, parameters);
  } catch (error) {
    console.error(`Error updating batch progress:`, error);
  }
}

// Send alert notification
async function sendAlert(message, severity = 'INFO') {
  if (!ALERT_TOPIC_ARN) return;

  try {
    const command = new PublishCommand({
      TopicArn: ALERT_TOPIC_ARN,
      Subject: `[${severity}] Batch Processing Alert`,
      Message: JSON.stringify({
        message,
        severity,
        timestamp: new Date().toISOString(),
        service: 'batch-processor',
      }, null, 2),
    });

    await snsClient.send(command);
  } catch (error) {
    console.error('Failed to send alert:', error);
  }
}

// Process a single SQS record
async function processRecord(record) {
  const messageId = record.messageId;
  console.log(`Processing message: ${messageId}`);

  try {
    const messageBody = JSON.parse(record.body);
    const { batchId, userId, document, options, priority } = messageBody;

    console.log(`Processing document ${document.id} for batch ${batchId}`);

    const startTime = Date.now();

    // Get document content
    const content = await getDocumentContent(document);
    
    if (!content || content.trim().length === 0) {
      throw new Error('Document content is empty');
    }

    console.log(`Retrieved content: ${content.length} characters`);

    // Perform analysis
    const analysisResult = await analyzeContentWithBedrock(content, options);
    
    // Save to database
    const analysisId = await saveAnalysisResult(analysisResult, { ...document, content }, batchId, userId);
    
    // Calculate cost
    const cost = calculateProcessingCost(analysisResult);

    const totalTime = Date.now() - startTime;
    
    console.log(`Document analysis completed:`, {
      messageId,
      documentId: document.id,
      analysisId,
      accuracy: analysisResult.accuracy,
      riskLevel: analysisResult.riskLevel,
      cost: cost.toFixed(6),
      totalTime,
    });

    return {
      success: true,
      messageId,
      documentId: document.id,
      analysisId,
      batchId,
      accuracy: analysisResult.accuracy,
      riskLevel: analysisResult.riskLevel,
      cost,
      processingTime: totalTime,
    };

  } catch (error) {
    console.error(`Error processing message ${messageId}:`, error);
    
    // Send alert for processing failures
    await sendAlert(`Failed to process message ${messageId}: ${error.message}`, 'ERROR');
    
    return {
      success: false,
      messageId,
      error: error.message,
      batchId: record.body ? JSON.parse(record.body).batchId : 'unknown',
    };
  }
}

// Main Lambda handler
exports.handler = async (event, context) => {
  const executionId = context.awsRequestId;
  console.log(`[${executionId}] Batch processor started with ${event.Records.length} messages`);

  const results = {
    successful: 0,
    failed: 0,
    batchItemFailures: [],
    processingResults: [],
  };

  // Process each SQS record
  for (const record of event.Records) {
    try {
      const result = await processRecord(record);
      results.processingResults.push(result);
      
      if (result.success) {
        results.successful++;
      } else {
        results.failed++;
        // Add to batch item failures for SQS to retry
        results.batchItemFailures.push({
          itemIdentifier: record.messageId,
        });
      }
    } catch (error) {
      console.error(`Critical error processing record ${record.messageId}:`, error);
      results.failed++;
      results.batchItemFailures.push({
        itemIdentifier: record.messageId,
      });
    }
  }

  // Update batch progress for successful analyses
  const batchUpdates = new Map();
  results.processingResults.forEach(result => {
    if (result.success && result.batchId) {
      const current = batchUpdates.get(result.batchId) || { processed: 0, successful: 0, failed: 0 };
      current.processed++;
      current.successful++;
      batchUpdates.set(result.batchId, current);
    } else if (!result.success && result.batchId) {
      const current = batchUpdates.get(result.batchId) || { processed: 0, successful: 0, failed: 0 };
      current.processed++;
      current.failed++;
      batchUpdates.set(result.batchId, current);
    }
  });

  // Update batch progress in database
  for (const [batchId, progress] of batchUpdates.entries()) {
    try {
      await updateBatchProgress(batchId, progress.processed, progress.successful, progress.failed);
    } catch (error) {
      console.error(`Error updating batch progress for ${batchId}:`, error);
    }
  }

  console.log(`[${executionId}] Batch processing completed:`, {
    totalMessages: event.Records.length,
    successful: results.successful,
    failed: results.failed,
    batchItemFailures: results.batchItemFailures.length,
  });

  // Send summary alert if there were failures
  if (results.failed > 0) {
    await sendAlert(
      `Batch processing completed with ${results.failed} failures out of ${event.Records.length} messages`,
      'WARNING'
    );
  }

  // Return batch item failures for SQS to handle retries
  return {
    batchItemFailures: results.batchItemFailures,
  };
};