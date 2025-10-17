/**
 * API Monitoring and Cost Tracking Service
 * Provides comprehensive monitoring for API usage, costs, and performance metrics
 */

import { ApiError, ErrorType, ErrorSeverity } from './types';
import { ErrorLogEntry } from './errorManager';
import { errorMonitor } from './errorMonitor';

/**
 * API provider configuration
 */
export interface APIProviderConfig {
  name: string;
  baseUrl: string;
  costPerRequest?: number;
  costPerToken?: number;
  rateLimit?: {
    requestsPerMinute: number;
    tokensPerMinute?: number;
  };
  quotas?: {
    dailyRequests?: number;
    monthlyRequests?: number;
    dailyCost?: number;
    monthlyCost?: number;
  };
}

/**
 * API usage metrics
 */
export interface APIUsageMetrics {
  provider: string;
  endpoint: string;
  timestamp: string;
  requestCount: number;
  tokenUsage?: {
    prompt: number;
    completion: number;
    total: number;
  };
  responseTime: number;
  statusCode: number;
  cost: number;
  success: boolean;
  errorType?: ErrorType;
}

/**
 * Cost tracking data
 */
export interface CostTrackingData {
  provider: string;
  period: 'hour' | 'day' | 'week' | 'month';
  startDate: string;
  endDate: string;
  totalCost: number;
  totalRequests: number;
  totalTokens?: number;
  averageCostPerRequest: number;
  averageResponseTime: number;
  errorRate: number;
  breakdown: {
    endpoint: string;
    requests: number;
    cost: number;
 