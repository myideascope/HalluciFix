/**
 * AWS Lambda Function: Batch Aggregation
 * Aggregates results from batch document analysis and generates final reports
 */

const { RDSDataService } = require('@aws-sdk/client-rds-data');
const { SQSClient, ReceiveMessageCommand, DeleteMessageCommand } = require('@aws-sdk/client-sqs');
const { S3Client, PutObjectCommand } = require('@aws-sdk/client-s3');
const { SecretsManagerClient, GetSecretValueCommand } = require('@aws-sdk/client-secrets-manager');

// AWS clients
const rdsData = new RDSDataService({ region: process.env.AWS_REGION });
const sqsClient = new SQSClient({ region: process.env.AWS_REGION });
const s3Client = new S3Client({ region: process.env.AWS_REGION });
const secretsManager = new SecretsManagerClient({ region: process.env.AWS_REGION });

// Environment variables
const DB_CLUSTER_ARN = process.env.DB_CLUSTER_ARN;
const DB_SECRET_ARN = process.env.DB_SECRET_ARN;
const S3_BUCKET_NAME = process.env.S3_BUCKET_NAME;

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

// Helper function to format RDS results
function formatRDSResults(records, columns) {
  if (!records || records.length === 0) return [];
  
  return records.map(record => {
    const row = {};
    record.forEach((field, index) => {
      const columnName = columns[index];
      row[columnName] = extractFieldValue(field);
    });
    return row;
  });
}

function extractFieldValue(field) {
  if (field.stringValue !== undefined) return field.stringValue;
  if (field.longValue !== undefined) return field.longValue;
  if (field.doubleValue !== undefined) return field.doubleValue;
  if (field.booleanValue !== undefined) return field.booleanValue;
  if (field.isNull) return null;
  return field;
}

// Get batch job details
async function getBatchJob(batchId) {
  const sql = `
    SELECT * FROM batch_analysis_jobs 
    WHERE id = :batchId
  `;

  const result = await executeQuery(sql, [
    { name: 'batchId', value: { stringValue: batchId } }
  ]);

  if (!result.records || result.records.length === 0) {
    throw new Error(`Batch job not found: ${batchId}`);
  }

  const columns = ['id', 'user_id', 'status', 'total_documents', 'processed_documents', 'failed_documents', 'options', 'metadata', 'created_at', 'updated_at', 'completed_at'];
  const jobs = formatRDSResults(result.records, columns);
  return jobs[0];
}

// Get all analysis results for a batch
async function getBatchAnalysisResults(batchId) {
  const sql = `
    SELECT * FROM analysis_results 
    WHERE batch_id = :batchId 
    ORDER BY timestamp ASC
  `;

  const result = await executeQuery(sql, [
    { name: 'batchId', value: { stringValue: batchId } }
  ]);

  const columns = ['id', 'user_id', 'content', 'timestamp', 'accuracy', 'risk_level', 'hallucinations', 'verification_sources', 'processing_time', 'analysis_type', 'batch_id', 'filename', 'full_content'];
  return formatRDSResults(result.records || [], columns);
}

// Generate batch summary statistics
function generateBatchSummary(results) {
  if (results.length === 0) {
    return {
      totalDocuments: 0,
      averageAccuracy: 0,
      totalHallucinations: 0,
      riskDistribution: { low: 0, medium: 0, high: 0, critical: 0 },
      averageProcessingTime: 0,
      totalProcessingTime: 0,
    };
  }

  const totalAccuracy = results.reduce((sum, r) => sum + (r.accuracy || 0), 0);
  const totalHallucinations = results.reduce((sum, r) => {
    try {
      const hallucinations = JSON.parse(r.hallucinations || '[]');
      return sum + hallucinations.length;
    } catch {
      return sum;
    }
  }, 0);

  const riskDistribution = results.reduce((dist, r) => {
    const risk = r.risk_level || 'low';
    dist[risk] = (dist[risk] || 0) + 1;
    return dist;
  }, { low: 0, medium: 0, high: 0, critical: 0 });

  const totalProcessingTime = results.reduce((sum, r) => sum + (r.processing_time || 0), 0);

  return {
    totalDocuments: results.length,
    averageAccuracy: parseFloat((totalAccuracy / results.length).toFixed(1)),
    totalHallucinations,
    riskDistribution,
    averageProcessingTime: Math.round(totalProcessingTime / results.length),
    totalProcessingTime,
  };
}

// Generate detailed batch report
function generateBatchReport(batchJob, results, summary) {
  const report = {
    batchId: batchJob.id,
    userId: batchJob.user_id,
    status: 'completed',
    createdAt: batchJob.created_at,
    completedAt: new Date().toISOString(),
    options: JSON.parse(batchJob.options || '{}'),
    summary,
    documents: results.map(result => ({
      id: result.id,
      filename: result.filename,
      accuracy: result.accuracy,
      riskLevel: result.risk_level,
      hallucinationCount: (() => {
        try {
          return JSON.parse(result.hallucinations || '[]').length;
        } catch {
          return 0;
        }
      })(),
      processingTime: result.processing_time,
      timestamp: result.timestamp,
    })),
    metadata: {
      processingDuration: new Date() - new Date(batchJob.created_at),
      successRate: results.length / batchJob.total_documents,
      averageDocumentSize: Math.round(
        results.reduce((sum, r) => sum + (r.full_content?.length || 0), 0) / results.length
      ),
    },
  };

  return report;
}//
 Save batch report to S3
async function saveBatchReportToS3(batchId, report) {
  const reportKey = `batch-reports/${batchId}/report.json`;
  
  try {
    const putCommand = new PutObjectCommand({
      Bucket: S3_BUCKET_NAME,
      Key: reportKey,
      Body: JSON.stringify(report, null, 2),
      ContentType: 'application/json',
      Metadata: {
        batchId: batchId,
        userId: report.userId,
        documentCount: report.summary.totalDocuments.toString(),
        averageAccuracy: report.summary.averageAccuracy.toString(),
      },
    });

    await s3Client.send(putCommand);
    console.log(`Saved batch report to S3: ${reportKey}`);
    return reportKey;
  } catch (error) {
    console.error(`Error saving batch report to S3:`, error);
    throw error;
  }
}

// Update batch job status
async function updateBatchJobStatus(batchId, status, summary, reportS3Key) {
  const sql = `
    UPDATE batch_analysis_jobs 
    SET status = :status,
        completed_at = :completedAt,
        summary = :summary,
        report_s3_key = :reportS3Key,
        updated_at = :updatedAt
    WHERE id = :batchId
  `;

  const parameters = [
    { name: 'status', value: { stringValue: status } },
    { name: 'completedAt', value: { stringValue: new Date().toISOString() } },
    { name: 'summary', value: { stringValue: JSON.stringify(summary) } },
    { name: 'reportS3Key', value: { stringValue: reportS3Key || '' } },
    { name: 'updatedAt', value: { stringValue: new Date().toISOString() } },
    { name: 'batchId', value: { stringValue: batchId } },
  ];

  try {
    await executeQuery(sql, parameters);
    console.log(`Updated batch job status: ${batchId} -> ${status}`);
  } catch (error) {
    console.error(`Error updating batch job status:`, error);
    throw error;
  }
}

// Check if batch is complete
async function checkBatchCompletion(batchId) {
  // Get expected document count
  const batchJob = await getBatchJob(batchId);
  const expectedCount = batchJob.total_documents;

  // Get actual result count
  const results = await getBatchAnalysisResults(batchId);
  const actualCount = results.length;

  console.log(`Batch ${batchId}: ${actualCount}/${expectedCount} documents processed`);

  return {
    isComplete: actualCount >= expectedCount,
    expectedCount,
    actualCount,
    results,
    batchJob,
  };
}

// Main Lambda handler
exports.handler = async (event, context) => {
  const executionId = context.awsRequestId;
  console.log(`[${executionId}] Batch aggregation started:`, JSON.stringify(event, null, 2));

  try {
    const { batchId, userId } = event;

    if (!batchId || !userId) {
      throw new Error('Missing required parameters: batchId and userId');
    }

    console.log(`[${executionId}] Aggregating results for batch ${batchId}`);

    // Check if batch processing is complete
    const completionStatus = await checkBatchCompletion(batchId);

    if (!completionStatus.isComplete) {
      console.log(`[${executionId}] Batch ${batchId} not yet complete: ${completionStatus.actualCount}/${completionStatus.expectedCount}`);
      
      return {
        status: 'pending',
        batchId,
        processedCount: completionStatus.actualCount,
        expectedCount: completionStatus.expectedCount,
        message: 'Batch processing still in progress',
      };
    }

    console.log(`[${executionId}] Batch ${batchId} is complete, generating final report`);

    // Generate batch summary and report
    const summary = generateBatchSummary(completionStatus.results);
    const report = generateBatchReport(completionStatus.batchJob, completionStatus.results, summary);

    // Save report to S3
    const reportS3Key = await saveBatchReportToS3(batchId, report);

    // Update batch job status
    await updateBatchJobStatus(batchId, 'completed', summary, reportS3Key);

    console.log(`[${executionId}] Batch aggregation completed:`, {
      batchId,
      totalDocuments: summary.totalDocuments,
      averageAccuracy: summary.averageAccuracy,
      totalHallucinations: summary.totalHallucinations,
      reportS3Key,
    });

    return {
      status: 'success',
      batchId,
      summary,
      reportS3Key,
      completedAt: new Date().toISOString(),
    };

  } catch (error) {
    console.error(`[${executionId}] Batch aggregation failed:`, error);
    
    // Update batch status to failed if possible
    if (event.batchId) {
      try {
        await updateBatchJobStatus(event.batchId, 'failed', {}, '');
      } catch (updateError) {
        console.error(`[${executionId}] Failed to update batch status:`, updateError);
      }
    }

    throw {
      errorType: 'BatchAggregationError',
      errorMessage: error.message,
      batchId: event.batchId,
      userId: event.userId,
      timestamp: new Date().toISOString(),
    };
  }
};