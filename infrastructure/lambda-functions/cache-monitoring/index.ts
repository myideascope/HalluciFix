import { APIGatewayProxyEvent, APIGatewayProxyResult } from 'aws-lambda';
import { getElastiCacheService } from '../common/elastiCacheService';
import { CloudWatchClient, GetMetricStatisticsCommand } from '@aws-sdk/client-cloudwatch';

import { logger } from './logging';
const cloudWatch = new CloudWatchClient({ region: process.env.AWS_REGION || 'us-east-1' });

interface CacheMetricsResponse {
  hits: number;
  misses: number;
  hitRate: number;
  totalOperations: number;
  connectionCount: number;
  latency: number;
  memoryUsage?: number;
  timestamp: string;
}

interface CacheHealthResponse {
  status: 'healthy' | 'unhealthy';
  latency: number;
  memoryUsage?: number;
  connectionStatus: string;
  timestamp: string;
}

interface CloudWatchMetrics {
  hitRate: number;
  averageLatency: number;
  totalOperations: number;
  errorRate: number;
}

export const handler = async (
  event: APIGatewayProxyEvent
): Promise<APIGatewayProxyResult> => {
  const headers = {
    'Content-Type': 'application/json',
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'Content-Type,Authorization',
    'Access-Control-Allow-Methods': 'GET,OPTIONS',
  };

  try {
    const path = event.path;
    const method = event.httpMethod;

    // Handle CORS preflight
    if (method === 'OPTIONS') {
      return {
        statusCode: 200,
        headers,
        body: '',
      };
    }

    if (method !== 'GET') {
      return {
        statusCode: 405,
        headers,
        body: JSON.stringify({ error: 'Method not allowed' }),
      };
    }

    // Route to appropriate handler
    if (path.endsWith('/metrics')) {
      return await handleGetMetrics();
    } else if (path.endsWith('/health')) {
      return await handleGetHealth();
    } else if (path.endsWith('/cloudwatch-metrics')) {
      return await handleGetCloudWatchMetrics();
    } else {
      return {
        statusCode: 404,
        headers,
        body: JSON.stringify({ error: 'Not found' }),
      };
    }
  } catch (error) {
    logger.error("Cache monitoring error:", error instanceof Error ? error : new Error(String(error)));
    return {
      statusCode: 500,
      headers,
      body: JSON.stringify({
        error: 'Internal server error',
        message: error instanceof Error ? error.message : 'Unknown error',
      }),
    };
  }
};

async function handleGetMetrics(): Promise<APIGatewayProxyResult> {
  try {
    const cacheService = getElastiCacheService();
    const metrics = cacheService.getMetrics();
    const memoryUsage = await cacheService.getMemoryUsage();

    const response: CacheMetricsResponse = {
      ...metrics,
      memoryUsage: memoryUsage || undefined,
      timestamp: new Date().toISOString(),
    };

    return {
      statusCode: 200,
      headers: {
        'Content-Type': 'application/json',
        'Access-Control-Allow-Origin': '*',
      },
      body: JSON.stringify(response),
    };
  } catch (error) {
    logger.error("Failed to get cache metrics:", error instanceof Error ? error : new Error(String(error)));
    return {
      statusCode: 500,
      headers: {
        'Content-Type': 'application/json',
        'Access-Control-Allow-Origin': '*',
      },
      body: JSON.stringify({
        error: 'Failed to retrieve cache metrics',
        message: error instanceof Error ? error.message : 'Unknown error',
      }),
    };
  }
}

async function handleGetHealth(): Promise<APIGatewayProxyResult> {
  try {
    const cacheService = getElastiCacheService();
    const healthCheck = await cacheService.healthCheck();

    const response: CacheHealthResponse = {
      ...healthCheck,
      timestamp: new Date().toISOString(),
    };

    return {
      statusCode: 200,
      headers: {
        'Content-Type': 'application/json',
        'Access-Control-Allow-Origin': '*',
      },
      body: JSON.stringify(response),
    };
  } catch (error) {
    logger.error("Failed to get cache health:", error instanceof Error ? error : new Error(String(error)));
    return {
      statusCode: 500,
      headers: {
        'Content-Type': 'application/json',
        'Access-Control-Allow-Origin': '*',
      },
      body: JSON.stringify({
        error: 'Failed to retrieve cache health status',
        message: error instanceof Error ? error.message : 'Unknown error',
      }),
    };
  }
}

async function handleGetCloudWatchMetrics(): Promise<APIGatewayProxyResult> {
  try {
    const endTime = new Date();
    const startTime = new Date(endTime.getTime() - 60 * 60 * 1000); // Last hour

    // Get hit rate metrics
    const hitRateCommand = new GetMetricStatisticsCommand({
      Namespace: 'HalluciFix/Cache',
      MetricName: 'CacheHitRate',
      StartTime: startTime,
      EndTime: endTime,
      Period: 300, // 5 minutes
      Statistics: ['Average'],
    });

    // Get latency metrics
    const latencyCommand = new GetMetricStatisticsCommand({
      Namespace: 'HalluciFix/Cache',
      MetricName: 'AverageLatency',
      StartTime: startTime,
      EndTime: endTime,
      Period: 300,
      Statistics: ['Average'],
    });

    // Get operations metrics
    const operationsCommand = new GetMetricStatisticsCommand({
      Namespace: 'HalluciFix/Cache',
      MetricName: 'TotalOperations',
      StartTime: startTime,
      EndTime: endTime,
      Period: 300,
      Statistics: ['Sum'],
    });

    // Get error metrics
    const errorsCommand = new GetMetricStatisticsCommand({
      Namespace: 'HalluciFix/Cache',
      MetricName: 'GetErrors',
      StartTime: startTime,
      EndTime: endTime,
      Period: 300,
      Statistics: ['Sum'],
    });

    const [hitRateResult, latencyResult, operationsResult, errorsResult] = await Promise.all([
      cloudWatch.send(hitRateCommand),
      cloudWatch.send(latencyCommand),
      cloudWatch.send(operationsCommand),
      cloudWatch.send(errorsCommand),
    ]);

    // Calculate averages
    const hitRate = hitRateResult.Datapoints?.length 
      ? hitRateResult.Datapoints.reduce((sum, dp) => sum + (dp.Average || 0), 0) / hitRateResult.Datapoints.length
      : 0;

    const averageLatency = latencyResult.Datapoints?.length
      ? latencyResult.Datapoints.reduce((sum, dp) => sum + (dp.Average || 0), 0) / latencyResult.Datapoints.length
      : 0;

    const totalOperations = operationsResult.Datapoints?.length
      ? operationsResult.Datapoints.reduce((sum, dp) => sum + (dp.Sum || 0), 0)
      : 0;

    const totalErrors = errorsResult.Datapoints?.length
      ? errorsResult.Datapoints.reduce((sum, dp) => sum + (dp.Sum || 0), 0)
      : 0;

    const errorRate = totalOperations > 0 ? (totalErrors / totalOperations) * 100 : 0;

    const response: CloudWatchMetrics = {
      hitRate,
      averageLatency,
      totalOperations,
      errorRate,
    };

    return {
      statusCode: 200,
      headers: {
        'Content-Type': 'application/json',
        'Access-Control-Allow-Origin': '*',
      },
      body: JSON.stringify(response),
    };
  } catch (error) {
    logger.error("Failed to get CloudWatch metrics:", error instanceof Error ? error : new Error(String(error)));
    return {
      statusCode: 500,
      headers: {
        'Content-Type': 'application/json',
        'Access-Control-Allow-Origin': '*',
      },
      body: JSON.stringify({
        error: 'Failed to retrieve CloudWatch metrics',
        message: error instanceof Error ? error.message : 'Unknown error',
      }),
    };
  }
}