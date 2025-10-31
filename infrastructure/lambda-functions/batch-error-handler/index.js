/**
 * AWS Lambda Function: Batch Error Handler
 * Handles errors in batch processing workflows and implements recovery strategies
 */

const { RDSDataService } = require('@aws-sdk/client-rds-data');
const { CloudWatchLogsClient, PutLogEventsCommand } = require('@aws-sdk/client-cloudwatch-logs');
const { SNSClient, PublishCommand } = require('@aws-sdk/client-sns');
const { SecretsManagerClient, GetSecretValueCommand } = require('@aws-sdk/client-secrets-manager');

// AWS clients
const rdsData = new RDSDataService({ region: process.env.AWS_REGION });
const cloudWatchLogs = new CloudWatchLogsClient({ region: process.env.AWS_REGION });
const snsClient = new SNSClient({ region: process.env.AWS_REGION });
const secretsManager = new SecretsManagerClient({ region: process.env.AWS_REGION });

// Environment variables
const DB_CLUSTER_ARN = process.env.DB_CLUSTER_ARN;
const DB_SECRET_ARN = process.env.DB_SECRET_ARN;

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

// Log error to database
async function logErrorToDatabase(errorInfo) {
  const sql = `
    INSERT INTO batch_processing_errors (
      id, batch_id, user_id, error_type, error_message, 
      error_details, timestamp, resolved
    ) VALUES (
      :id, :batchId, :userId, :errorType, :errorMessage,
      :errorDetails, :timestamp, :resolved
    )
  `;

  const errorId = `error_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  
  const parameters = [
    { name: 'id', value: { stringValue: errorId } },
    { name: 'batchId', value: { stringValue: errorInfo.batchId || '' } },
    { name: 'userId', value: { stringValue: errorInfo.userId || '' } },
    { name: 'errorType', value: { stringValue: errorInfo.errorType || 'UnknownError' } },
    { name: 'errorMessage', value: { stringValue: errorInfo.errorMessage || 'No message provided' } },
    { name: 'errorDetails', value: { stringValue: JSON.stringify(errorInfo) } },
    { name: 'timestamp', value: { stringValue: new Date().toISOString() } },
    { name: 'resolved', value: { booleanValue: false } },
  ];

  try {
    await executeQuery(sql, parameters);
    console.log(`Logged error to database: ${errorId}`);
    return errorId;
  } catch (error) {
    console.error('Failed to log error to database:', error);
    return null;
  }
}

// Update batch job with error status
async function updateBatchJobError(batchId, errorMessage) {
  const sql = `
    UPDATE batch_analysis_jobs 
    SET status = :status,
        error_message = :errorMessage,
        updated_at = :updatedAt
    WHERE id = :batchId
  `;

  const parameters = [
    { name: 'status', value: { stringValue: 'failed' } },
    { name: 'errorMessage', value: { stringValue: errorMessage } },
    { name: 'updatedAt', value: { stringValue: new Date().toISOString() } },
    { name: 'batchId', value: { stringValue: batchId } },
  ];

  try {
    await executeQuery(sql, parameters);
    console.log(`Updated batch job error status: ${batchId}`);
  } catch (error) {
    console.error(`Failed to update batch job error status:`, error);
  }
}

// Determine error severity and recovery strategy
function analyzeError(errorInfo) {
  const errorType = errorInfo.errorType || '';
  const errorMessage = errorInfo.errorMessage || '';

  // Categorize errors
  if (errorType.includes('Throttling') || errorMessage.includes('rate limit')) {
    return {
      severity: 'medium',
      category: 'throttling',
      recoverable: true,
      retryable: true,
      retryDelay: 60000, // 1 minute
      maxRetries: 3,
    };
  }

  if (errorType.includes('Timeout') || errorMessage.includes('timeout')) {
    return {
      severity: 'medium',
      category: 'timeout',
      recoverable: true,
      retryable: true,
      retryDelay: 30000, // 30 seconds
      maxRetries: 2,
    };
  }

  if (errorType.includes('Authorization') || errorMessage.includes('403') || errorMessage.includes('401')) {
    return {
      severity: 'high',
      category: 'authorization',
      recoverable: false,
      retryable: false,
      requiresIntervention: true,
    };
  }

  if (errorType.includes('ValidationError') || errorMessage.includes('validation')) {
    return {
      severity: 'medium',
      category: 'validation',
      recoverable: false,
      retryable: false,
      requiresDataFix: true,
    };
  }

  if (errorType.includes('ServiceException') || errorMessage.includes('service unavailable')) {
    return {
      severity: 'high',
      category: 'service_unavailable',
      recoverable: true,
      retryable: true,
      retryDelay: 300000, // 5 minutes
      maxRetries: 2,
    };
  }

  // Default for unknown errors
  return {
    severity: 'high',
    category: 'unknown',
    recoverable: false,
    retryable: false,
    requiresIntervention: true,
  };
}

// Generate error recovery recommendations
function generateRecoveryRecommendations(errorAnalysis, errorInfo) {
  const recommendations = [];

  switch (errorAnalysis.category) {
    case 'throttling':
      recommendations.push('Reduce batch size or increase processing intervals');
      recommendations.push('Implement exponential backoff for API calls');
      recommendations.push('Consider upgrading service limits');
      break;

    case 'timeout':
      recommendations.push('Reduce document size or complexity');
      recommendations.push('Increase Lambda timeout settings');
      recommendations.push('Split large documents into smaller chunks');
      break;

    case 'authorization':
      recommendations.push('Check API keys and credentials');
      recommendations.push('Verify IAM permissions');
      recommendations.push('Ensure service access is properly configured');
      break;

    case 'validation':
      recommendations.push('Review document format and content');
      recommendations.push('Validate input parameters');
      recommendations.push('Check data integrity before processing');
      break;

    case 'service_unavailable':
      recommendations.push('Wait for service to recover');
      recommendations.push('Implement circuit breaker pattern');
      recommendations.push('Use fallback processing methods');
      break;

    default:
      recommendations.push('Review error logs for specific details');
      recommendations.push('Contact support if issue persists');
      recommendations.push('Consider manual intervention');
  }

  return recommendations;
}

// Create error report
function createErrorReport(errorInfo, errorAnalysis, errorId) {
  return {
    errorId,
    timestamp: new Date().toISOString(),
    batchId: errorInfo.batchId,
    userId: errorInfo.userId,
    errorType: errorInfo.errorType,
    errorMessage: errorInfo.errorMessage,
    severity: errorAnalysis.severity,
    category: errorAnalysis.category,
    recoverable: errorAnalysis.recoverable,
    retryable: errorAnalysis.retryable,
    recommendations: generateRecoveryRecommendations(errorAnalysis, errorInfo),
    context: {
      documentId: errorInfo.documentId,
      stepFunctionExecution: errorInfo.executionArn,
      lambdaFunction: errorInfo.lambdaFunction,
      awsRegion: process.env.AWS_REGION,
    },
    metadata: errorInfo,
  };
}// 
Main Lambda handler
exports.handler = async (event, context) => {
  const executionId = context.awsRequestId;
  console.log(`[${executionId}] Batch error handler started:`, JSON.stringify(event, null, 2));

  try {
    // Extract error information from event
    const errorInfo = {
      batchId: event.batchId || event.Error?.batchId,
      userId: event.userId || event.Error?.userId,
      errorType: event.Error?.errorType || event.errorType || 'UnknownError',
      errorMessage: event.Error?.errorMessage || event.errorMessage || 'No error message provided',
      documentId: event.documentId || event.Error?.documentId,
      executionArn: context.invokedFunctionArn,
      lambdaFunction: context.functionName,
      cause: event.Error?.Cause,
      ...event.Error,
      ...event,
    };

    console.log(`[${executionId}] Processing error for batch ${errorInfo.batchId}:`, {
      errorType: errorInfo.errorType,
      errorMessage: errorInfo.errorMessage,
    });

    // Analyze the error
    const errorAnalysis = analyzeError(errorInfo);
    
    console.log(`[${executionId}] Error analysis:`, {
      severity: errorAnalysis.severity,
      category: errorAnalysis.category,
      recoverable: errorAnalysis.recoverable,
      retryable: errorAnalysis.retryable,
    });

    // Log error to database
    const errorId = await logErrorToDatabase(errorInfo);

    // Update batch job status if batch ID is available
    if (errorInfo.batchId) {
      await updateBatchJobError(errorInfo.batchId, errorInfo.errorMessage);
    }

    // Create comprehensive error report
    const errorReport = createErrorReport(errorInfo, errorAnalysis, errorId);

    // Log structured error information
    console.error(`[${executionId}] Error Report:`, JSON.stringify(errorReport, null, 2));

    // Determine response based on error analysis
    if (errorAnalysis.retryable) {
      console.log(`[${executionId}] Error is retryable, suggesting retry with delay: ${errorAnalysis.retryDelay}ms`);
      
      return {
        action: 'retry',
        retryDelay: errorAnalysis.retryDelay,
        maxRetries: errorAnalysis.maxRetries,
        errorReport,
        recommendations: errorReport.recommendations,
      };
    } else if (errorAnalysis.recoverable) {
      console.log(`[${executionId}] Error is recoverable but requires intervention`);
      
      return {
        action: 'recover',
        requiresIntervention: true,
        errorReport,
        recommendations: errorReport.recommendations,
      };
    } else {
      console.log(`[${executionId}] Error is not recoverable, marking as failed`);
      
      return {
        action: 'fail',
        errorReport,
        recommendations: errorReport.recommendations,
        finalError: true,
      };
    }

  } catch (handlerError) {
    console.error(`[${executionId}] Error handler itself failed:`, handlerError);
    
    // Return a basic error response if the handler fails
    return {
      action: 'fail',
      errorReport: {
        errorId: `handler_error_${Date.now()}`,
        timestamp: new Date().toISOString(),
        errorType: 'ErrorHandlerFailure',
        errorMessage: handlerError.message,
        severity: 'critical',
        category: 'system',
        recoverable: false,
        retryable: false,
        recommendations: [
          'Check error handler Lambda function logs',
          'Verify database connectivity',
          'Contact system administrator',
        ],
      },
      finalError: true,
    };
  }
};