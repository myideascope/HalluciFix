/**
 * AWS Lambda Function: Batch Preparation
 * Prepares batch analysis requests by validating documents and creating processing tasks
 */

const { RDSDataService } = require('@aws-sdk/client-rds-data');
const { S3Client, GetObjectCommand, HeadObjectCommand } = require('@aws-sdk/client-s3');
const { SQSClient, SendMessageCommand } = require('@aws-sdk/client-sqs');
const { SecretsManagerClient, GetSecretValueCommand } = require('@aws-sdk/client-secrets-manager');

// AWS clients
const rdsData = new RDSDataService({ region: process.env.AWS_REGION });
const s3Client = new S3Client({ region: process.env.AWS_REGION });
const sqsClient = new SQSClient({ region: process.env.AWS_REGION });
const secretsManager = new SecretsManagerClient({ region: process.env.AWS_REGION });

// Environment variables
const DB_CLUSTER_ARN = process.env.DB_CLUSTER_ARN;
const DB_SECRET_ARN = process.env.DB_SECRET_ARN;
const BATCH_PROCESSING_QUEUE_URL = process.env.BATCH_PROCESSING_QUEUE_URL;
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

// Helper function to extract field values from RDS results
function extractFieldValue(field) {
  if (field.stringValue !== undefined) return field.stringValue;
  if (field.longValue !== undefined) return field.longValue;
  if (field.doubleValue !== undefined) return field.doubleValue;
  if (field.booleanValue !== undefined) return field.booleanValue;
  if (field.isNull) return null;
  return field;
}

// Validate document accessibility and extract metadata
async function validateDocument(document) {
  try {
    console.log(`Validating document: ${document.id}`);

    // Check if document exists in S3
    if (document.s3Key) {
      try {
        const headCommand = new HeadObjectCommand({
          Bucket: S3_BUCKET_NAME,
          Key: document.s3Key,
        });
        
        const headResult = await s3Client.send(headCommand);
        
        return {
          ...document,
          valid: true,
          size: headResult.ContentLength,
          lastModified: headResult.LastModified,
          contentType: headResult.ContentType,
        };
      } catch (s3Error) {
        console.error(`S3 validation failed for document ${document.id}:`, s3Error);
        return {
          ...document,
          valid: false,
          error: `Document not accessible in S3: ${s3Error.message}`,
        };
      }
    }

    // If content is provided directly
    if (document.content) {
      return {
        ...document,
        valid: true,
        size: document.content.length,
        contentType: 'text/plain',
      };
    }

    return {
      ...document,
      valid: false,
      error: 'No content or S3 key provided',
    };

  } catch (error) {
    console.error(`Error validating document ${document.id}:`, error);
    return {
      ...document,
      valid: false,
      error: error.message,
    };
  }
}

// Create batch record in database
async function createBatchRecord(batchId, userId, documentCount, options) {
  const sql = `
    INSERT INTO batch_analysis_jobs (
      id, user_id, status, total_documents, processed_documents, 
      failed_documents, options, created_at, updated_at
    ) VALUES (
      :batchId, :userId, :status, :totalDocuments, :processedDocuments,
      :failedDocuments, :options, :createdAt, :updatedAt
    )
  `;

  const now = new Date().toISOString();
  
  const parameters = [
    { name: 'batchId', value: { stringValue: batchId } },
    { name: 'userId', value: { stringValue: userId } },
    { name: 'status', value: { stringValue: 'preparing' } },
    { name: 'totalDocuments', value: { longValue: documentCount } },
    { name: 'processedDocuments', value: { longValue: 0 } },
    { name: 'failedDocuments', value: { longValue: 0 } },
    { name: 'options', value: { stringValue: JSON.stringify(options) } },
    { name: 'createdAt', value: { stringValue: now } },
    { name: 'updatedAt', value: { stringValue: now } },
  ];

  try {
    await executeQuery(sql, parameters);
    console.log(`Created batch record: ${batchId}`);
  } catch (error) {
    console.error(`Error creating batch record ${batchId}:`, error);
    throw error;
  }
}

// Update batch status
async function updateBatchStatus(batchId, status, validDocuments, invalidDocuments) {
  const sql = `
    UPDATE batch_analysis_jobs 
    SET status = :status, 
        total_documents = :totalDocuments,
        updated_at = :updatedAt,
        metadata = :metadata
    WHERE id = :batchId
  `;

  const metadata = {
    validDocuments: validDocuments.length,
    invalidDocuments: invalidDocuments.length,
    invalidReasons: invalidDocuments.map(doc => ({
      id: doc.id,
      error: doc.error
    }))
  };

  const parameters = [
    { name: 'status', value: { stringValue: status } },
    { name: 'totalDocuments', value: { longValue: validDocuments.length } },
    { name: 'updatedAt', value: { stringValue: new Date().toISOString() } },
    { name: 'metadata', value: { stringValue: JSON.stringify(metadata) } },
    { name: 'batchId', value: { stringValue: batchId } },
  ];

  try {
    await executeQuery(sql, parameters);
    console.log(`Updated batch status: ${batchId} -> ${status}`);
  } catch (error) {
    console.error(`Error updating batch status ${batchId}:`, error);
    throw error;
  }
}

// Send documents to processing queue
async function sendDocumentsToQueue(documents, batchId, userId, options) {
  const batchSize = 10; // Send documents in batches to SQS
  const batches = [];
  
  for (let i = 0; i < documents.length; i += batchSize) {
    batches.push(documents.slice(i, i + batchSize));
  }

  console.log(`Sending ${documents.length} documents in ${batches.length} batches to processing queue`);

  for (let batchIndex = 0; batchIndex < batches.length; batchIndex++) {
    const batch = batches[batchIndex];
    
    const message = {
      batchId,
      userId,
      options,
      documents: batch,
      batchIndex,
      totalBatches: batches.length,
      timestamp: new Date().toISOString(),
    };

    try {
      const sendCommand = new SendMessageCommand({
        QueueUrl: BATCH_PROCESSING_QUEUE_URL,
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
          documentCount: {
            DataType: 'Number',
            StringValue: batch.length.toString(),
          },
        },
      });

      await sqsClient.send(sendCommand);
      console.log(`Sent batch ${batchIndex + 1}/${batches.length} to processing queue`);
      
    } catch (error) {
      console.error(`Error sending batch ${batchIndex + 1} to queue:`, error);
      throw error;
    }
  }
}

// Main Lambda handler
exports.handler = async (event, context) => {
  const executionId = context.awsRequestId;
  console.log(`[${executionId}] Batch preparation started:`, JSON.stringify(event, null, 2));

  try {
    // Extract input parameters
    const { batchId, userId, documents = [], options = {} } = event;

    if (!batchId || !userId) {
      throw new Error('Missing required parameters: batchId and userId');
    }

    if (!Array.isArray(documents) || documents.length === 0) {
      console.log(`[${executionId}] No documents provided for batch ${batchId}`);
      return {
        batchId,
        userId,
        status: 'completed',
        documentCount: 0,
        validDocuments: [],
        invalidDocuments: [],
        message: 'No documents to process',
      };
    }

    console.log(`[${executionId}] Processing batch ${batchId} with ${documents.length} documents`);

    // Create initial batch record
    await createBatchRecord(batchId, userId, documents.length, options);

    // Validate all documents
    const validationPromises = documents.map(doc => validateDocument(doc));
    const validatedDocuments = await Promise.all(validationPromises);

    // Separate valid and invalid documents
    const validDocuments = validatedDocuments.filter(doc => doc.valid);
    const invalidDocuments = validatedDocuments.filter(doc => !doc.valid);

    console.log(`[${executionId}] Validation complete: ${validDocuments.length} valid, ${invalidDocuments.length} invalid`);

    if (invalidDocuments.length > 0) {
      console.warn(`[${executionId}] Invalid documents:`, invalidDocuments.map(doc => ({
        id: doc.id,
        error: doc.error
      })));
    }

    // Update batch status
    await updateBatchStatus(batchId, 'ready', validDocuments, invalidDocuments);

    // Send valid documents to processing queue if any exist
    if (validDocuments.length > 0) {
      await sendDocumentsToQueue(validDocuments, batchId, userId, options);
    }

    const result = {
      batchId,
      userId,
      status: validDocuments.length > 0 ? 'ready' : 'completed',
      documentCount: validDocuments.length,
      validDocuments: validDocuments.map(doc => ({
        id: doc.id,
        filename: doc.filename,
        size: doc.size,
        contentType: doc.contentType,
      })),
      invalidDocuments: invalidDocuments.map(doc => ({
        id: doc.id,
        filename: doc.filename,
        error: doc.error,
      })),
      options,
      timestamp: new Date().toISOString(),
    };

    console.log(`[${executionId}] Batch preparation completed:`, {
      batchId,
      validCount: validDocuments.length,
      invalidCount: invalidDocuments.length,
    });

    return result;

  } catch (error) {
    console.error(`[${executionId}] Batch preparation failed:`, error);
    
    // Update batch status to failed if batchId is available
    if (event.batchId) {
      try {
        await updateBatchStatus(event.batchId, 'failed', [], []);
      } catch (updateError) {
        console.error(`[${executionId}] Failed to update batch status:`, updateError);
      }
    }

    throw {
      errorType: 'BatchPreparationError',
      errorMessage: error.message,
      batchId: event.batchId,
      userId: event.userId,
      timestamp: new Date().toISOString(),
    };
  }
};