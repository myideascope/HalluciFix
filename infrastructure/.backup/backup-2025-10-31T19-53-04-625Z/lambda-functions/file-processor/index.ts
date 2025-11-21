/**
 * File Processor Lambda Function
 * 
 * Processes files uploaded to S3 and extracts content
 * Triggered by S3 events or API Gateway requests
 */

import { APIGatewayProxyEvent, APIGatewayProxyResult, S3Event } from 'aws-lambda';
import { S3Client, GetObjectCommand } from '@aws-sdk/client-s3';
import { DynamoDBClient, PutItemCommand } from '@aws-sdk/client-dynamodb';

import { logger } from './logging';
// Initialize AWS clients
const s3Client = new S3Client({ region: process.env.AWS_REGION });
const dynamoClient = new DynamoDBClient({ region: process.env.AWS_REGION });

interface FileProcessingResult {
  fileKey: string;
  filename: string;
  contentType: string;
  size: number;
  content?: string;
  metadata?: {
    wordCount?: number;
    pageCount?: number;
    language?: string;
    extractedAt: string;
  };
  processingTime: number;
  error?: string;
}

/**
 * Main Lambda handler
 */
export const handler = async (
  event: APIGatewayProxyEvent | S3Event
): Promise<APIGatewayProxyResult> => {
  logger.info("File processor Lambda triggered", { { event: JSON.stringify(event, null, 2 }) });

  try {
    // Determine event type
    if ('Records' in event && event.Records[0]?.eventSource === 'aws:s3') {
      // S3 event trigger
      return await handleS3Event(event as S3Event);
    } else {
      // API Gateway trigger
      return await handleAPIRequest(event as APIGatewayProxyEvent);
    }
  } catch (error) {
    logger.error("Lambda execution failed:", error instanceof Error ? error : new Error(String(error)));
    
    return {
      statusCode: 500,
      headers: {
        'Content-Type': 'application/json',
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Headers': 'Content-Type,Authorization',
        'Access-Control-Allow-Methods': 'GET,POST,PUT,DELETE,OPTIONS'
      },
      body: JSON.stringify({
        error: 'Internal server error',
        message: error instanceof Error ? error.message : 'Unknown error'
      })
    };
  }
};

/**
 * Handle S3 event (automatic processing)
 */
async function handleS3Event(event: S3Event): Promise<APIGatewayProxyResult> {
  const results: FileProcessingResult[] = [];

  for (const record of event.Records) {
    const bucketName = record.s3.bucket.name;
    const fileKey = decodeURIComponent(record.s3.object.key.replace(/\+/g, ' '));
    
    console.log(`Processing S3 object: ${bucketName}/${fileKey}`);

    try {
      const result = await processS3File(bucketName, fileKey);
      results.push(result);

      // Store result in DynamoDB
      await storeProcessingResult(result);

    } catch (error) {
      console.error(`Failed to process ${fileKey}:`, error);
      
      const errorResult: FileProcessingResult = {
        fileKey,
        filename: fileKey.split('/').pop() || fileKey,
        contentType: 'unknown',
        size: 0,
        processingTime: 0,
        error: error instanceof Error ? error.message : 'Processing failed'
      };
      
      results.push(errorResult);
    }
  }

  return {
    statusCode: 200,
    headers: {
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      message: 'S3 files processed',
      results
    })
  };
}

/**
 * Handle API Gateway request (manual processing)
 */
async function handleAPIRequest(event: APIGatewayProxyEvent): Promise<APIGatewayProxyResult> {
  const method = event.httpMethod;
  const path = event.path;

  if (method === 'OPTIONS') {
    return {
      statusCode: 200,
      headers: {
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Headers': 'Content-Type,Authorization',
        'Access-Control-Allow-Methods': 'GET,POST,PUT,DELETE,OPTIONS'
      },
      body: ''
    };
  }

  if (method === 'POST' && path.includes('/process-file')) {
    return await handleProcessFileRequest(event);
  }

  if (method === 'GET' && path.includes('/processing-status')) {
    return await handleGetProcessingStatus(event);
  }

  return {
    statusCode: 404,
    headers: {
      'Content-Type': 'application/json',
      'Access-Control-Allow-Origin': '*'
    },
    body: JSON.stringify({ error: 'Not found' })
  };
}

/**
 * Handle file processing request
 */
async function handleProcessFileRequest(event: APIGatewayProxyEvent): Promise<APIGatewayProxyResult> {
  if (!event.body) {
    return {
      statusCode: 400,
      headers: {
        'Content-Type': 'application/json',
        'Access-Control-Allow-Origin': '*'
      },
      body: JSON.stringify({ error: 'Request body required' })
    };
  }

  const { fileKey, bucketName } = JSON.parse(event.body);

  if (!fileKey || !bucketName) {
    return {
      statusCode: 400,
      headers: {
        'Content-Type': 'application/json',
        'Access-Control-Allow-Origin': '*'
      },
      body: JSON.stringify({ error: 'fileKey and bucketName are required' })
    };
  }

  try {
    const result = await processS3File(bucketName, fileKey);
    await storeProcessingResult(result);

    return {
      statusCode: 200,
      headers: {
        'Content-Type': 'application/json',
        'Access-Control-Allow-Origin': '*'
      },
      body: JSON.stringify(result)
    };

  } catch (error) {
    logger.error("File processing failed:", error instanceof Error ? error : new Error(String(error)));
    
    return {
      statusCode: 500,
      headers: {
        'Content-Type': 'application/json',
        'Access-Control-Allow-Origin': '*'
      },
      body: JSON.stringify({
        error: 'Processing failed',
        message: error instanceof Error ? error.message : 'Unknown error'
      })
    };
  }
}

/**
 * Handle get processing status request
 */
async function handleGetProcessingStatus(event: APIGatewayProxyEvent): Promise<APIGatewayProxyResult> {
  const fileKey = event.queryStringParameters?.fileKey;

  if (!fileKey) {
    return {
      statusCode: 400,
      headers: {
        'Content-Type': 'application/json',
        'Access-Control-Allow-Origin': '*'
      },
      body: JSON.stringify({ error: 'fileKey parameter required' })
    };
  }

  // In a real implementation, you would query DynamoDB for the processing status
  return {
    statusCode: 200,
    headers: {
      'Content-Type': 'application/json',
      'Access-Control-Allow-Origin': '*'
    },
    body: JSON.stringify({
      fileKey,
      status: 'completed',
      message: 'File processing status retrieved'
    })
  };
}

/**
 * Process a file from S3
 */
async function processS3File(bucketName: string, fileKey: string): Promise<FileProcessingResult> {
  const startTime = Date.now();

  try {
    // Get object from S3
    const getObjectCommand = new GetObjectCommand({
      Bucket: bucketName,
      Key: fileKey
    });

    const response = await s3Client.send(getObjectCommand);
    
    if (!response.Body) {
      throw new Error('File not found or empty');
    }

    // Convert stream to buffer
    const chunks: Uint8Array[] = [];
    const reader = response.Body.transformToWebStream().getReader();
    
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      chunks.push(value);
    }

    const buffer = new Uint8Array(chunks.reduce((acc, chunk) => acc + chunk.length, 0));
    let offset = 0;
    for (const chunk of chunks) {
      buffer.set(chunk, offset);
      offset += chunk.length;
    }

    // Extract content based on content type
    const contentType = response.ContentType || 'application/octet-stream';
    let content: string | undefined;

    if (contentType.startsWith('text/')) {
      content = new TextDecoder().decode(buffer);
    } else if (contentType === 'application/pdf') {
      // For PDF processing, you would use a PDF parsing library
      content = '[PDF content extraction not implemented in Lambda]';
    } else {
      content = '[Content extraction not supported for this file type]';
    }

    // Calculate metadata
    const wordCount = content ? content.split(/\s+/).filter(word => word.length > 0).length : 0;

    const result: FileProcessingResult = {
      fileKey,
      filename: fileKey.split('/').pop() || fileKey,
      contentType,
      size: response.ContentLength || 0,
      content,
      metadata: {
        wordCount,
        language: 'en', // Simple default
        extractedAt: new Date().toISOString()
      },
      processingTime: Date.now() - startTime
    };

    console.log(`File processed successfully: ${fileKey}`, {
      contentType,
      size: result.size,
      wordCount,
      processingTime: result.processingTime
    });

    return result;

  } catch (error) {
    console.error(`Failed to process file ${fileKey}:`, error);
    
    return {
      fileKey,
      filename: fileKey.split('/').pop() || fileKey,
      contentType: 'unknown',
      size: 0,
      processingTime: Date.now() - startTime,
      error: error instanceof Error ? error.message : 'Processing failed'
    };
  }
}

/**
 * Store processing result in DynamoDB
 */
async function storeProcessingResult(result: FileProcessingResult): Promise<void> {
  const tableName = process.env.PROCESSING_RESULTS_TABLE;
  
  if (!tableName) {
    logger.warn("PROCESSING_RESULTS_TABLE not configured, skipping storage");
    return;
  }

  try {
    const putCommand = new PutItemCommand({
      TableName: tableName,
      Item: {
        fileKey: { S: result.fileKey },
        filename: { S: result.filename },
        contentType: { S: result.contentType },
        size: { N: result.size.toString() },
        content: result.content ? { S: result.content } : undefined,
        metadata: result.metadata ? { S: JSON.stringify(result.metadata) } : undefined,
        processingTime: { N: result.processingTime.toString() },
        error: result.error ? { S: result.error } : undefined,
        processedAt: { S: new Date().toISOString() }
      }
    });

    await dynamoClient.send(putCommand);
    console.log(`Processing result stored for ${result.fileKey}`);

  } catch (error) {
    logger.error("Failed to store processing result:", error instanceof Error ? error : new Error(String(error)));
    // Don't throw - this is not critical for the main processing flow
  }
}