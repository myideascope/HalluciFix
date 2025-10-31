/**
 * Enhanced tests for OptimizedAnalysisService
 * Covers optimized queries, caching, and performance monitoring
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { optimizedAnalysisService } from '../optimizedAnalysisService';

// Mock dependencies
vi.mock('../monitoredSupabase', () => ({
  monitoredSupabase: {
    getOriginalClient: vi.fn(() => ({
      from: vi.fn(() => ({
        select: vi.fn().mockReturnThis(),
        insert: vi.fn().mockReturnThis(),
        delete: vi.fn().mockReturnThis(),
        eq: vi.fn().mockReturnThis(),
        in: vi.fn().mockReturnThis(),
        textSearch: vi.fn().mockReturnThis(),
        order: vi.fn().mockReturnThis(),
        limit: vi.fn().mockReturnThis(),
        single: vi.fn().mockReturnThis()
      }))
    })),
    from: vi.fn(() => ({
      select: vi.fn().mockReturnThis(),
      insert: vi.fn().mockReturnThis(),
      delete: vi.fn().mockReturnThis(),
      eq: vi.fn().mockReturnThis(),
      in: vi.fn().mockReturnThis(),
      textSearch: vi.fn().mockReturnThis(),
      order: vi.fn().mockReturnThis(),
      limit: vi.fn().mockReturnThis(),
      single: vi.fn().mockReturnThis()
    }))
  }
}));

vi.mock('../queryBuilder', () => ({
  createQueryBuilder: vi.fn(() => ({
    getAnalysisResults: vi.fn(),
    getAggregatedData: vi.fn(),
    batchInsert: vi.fn(),
    getPerformanceReport: vi.fn(() => ({
      averageExecutionTime: 250,
      slowQueries: [],
      totalQueries: 100,
      queryFrequency: {}
    })),
    clearMetrics: vi.fn()
  }))
}));

vi.mock('../analysisService', () => ({
  default: {
    analyzeContent: vi.fn(),
    analyzeBatch: vi.fn()
  }
}));

vi.mock('../../types/analysis', () => ({
  convertDatabaseResult: vi.fn((dbResult) => ({
    id: dbResult.id,
    content: dbResult.content,
    accuracy: dbResult.accuracy,
    riskLevel: dbResult.risk_level,
    timestamp: dbResult.created_at,
    userId: dbResult.user_id
  })),
  convertToDatabase: vi.fn((result) => ({
    id: result.id,
    content: result.content,
    accuracy: result.accuracy,
    risk_level: result.riskLevel,
    created_at: result.timestamp,
    user_id: result.userId
  }))
}));

describe('OptimizedAnalysisService', () => {
  const mockUserId = 'user-123';
  let mockQueryBuilder: any;

  beforeEach(() => {
    vi.clearAllMocks();
    
    const { createQueryBuilder } = require('../queryBuilder');
    mockQueryBuilder = createQueryBuilder();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('getAnalysisResults', () => {
    it('should get paginated analysis results with default options', async () => {
      const mockResults = {
        data: [
          { id: '1', content: 'Test 1', accuracy: 85, riskLevel: 'low' },
          { id: '2', content: 'Test 2', accuracy: 75, riskLevel: 'medium' }
        ],
        hasMore: false,
        nextCursor: undefined
      };

      mockQueryBuilder.getAnalysisResults.mockResolvedValue(mockResults);

      const result = await optimizedAnalysisService.getAnalysisResults(mockUserId);

      expect(mockQueryBuilder.getAnalysisResults).toHaveBeenCalledWith(mockUserId, {});
      expect(result).toEqual(mockResults);
    });

    it('should get analysis results with filtering options', async () => {
      const options = {
        limit: 10,
        cursor: 'cursor-123',
        riskLevel: 'high',
        analysisType: 'batch',
        dateRange: {
          start: new Date('2024-01-01'),
          end: new Date('2024-01-31')
        }
      };

      const mockResults = {
        data: [{ id: '1', content: 'High risk analysis', riskLevel: 'high' }],
        hasMore: true,
        nextCursor: 'next-cursor'
      };

      mockQueryBuilder.getAnalysisResults.mockResolvedValue(mockResults);

      const result = await optimizedAnalysisService.getAnalysisResults(mockUserId, options);

      expect(mockQueryBuilder.getAnalysisResults).toHaveBeenCalledWith(mockUserId, options);
      expect(result).toEqual(mockResults);
    });
  });

  describe('getDashboardData', () => {
    it('should get comprehensive dashboard data', async () => {
      const mockRecentResults = {
        data: [
          { id: '1', content: 'Recent 1', accuracy: 90 },
          { id: '2', content: 'Recent 2', accuracy: 85 }
        ],
        hasMore: false
      };

      const mockAggregatedData = {
        totalAnalyses: 150,
        riskDistribution: { low: 60, medium: 30, high: 8, critical: 2 },
        averageAccuracy: 87.5
      };

      mockQueryBuilder.getAnalysisResults.mockResolvedValue(mockRecentResults);
      mockQueryBuilder.getAggregatedData.mockResolvedValue(mockAggregatedData);

      const result = await optimizedAnalysisService.getDashboardData(mockUserId);

      expect(result).toEqual({
        recentAnalyses: mockRecentResults.data,
        totalCount: 150,
        riskDistribution: { low: 60, medium: 30, high: 8, critical: 2 },
        averageAccuracy: 87.5
      });

      expect(mockQueryBuilder.getAnalysisResults).toHaveBeenCalledWith(mockUserId, { limit: 10 });
      expect(mockQueryBuilder.getAggregatedData).toHaveBeenCalledWith(
        mockUserId,
        expect.objectContaining({
          start: expect.any(Date),
          end: expect.any(Date)
        })
      );
    });
  });

  describe('getAnalyticsData', () => {
    it('should get comprehensive analytics data with weekly trends', async () => {
      const timeRange = {
        start: new Date('2024-01-01'),
        end: new Date('2024-01-31')
      };

      const mockAggregatedData = {
        totalAnalyses: 200,
        averageAccuracy: 88.5,
        riskDistribution: { low: 70, medium: 20, high: 8, critical: 2 },
        dailyTrends: [
          { date: '2024-01-01', count: 10, avgAccuracy: 85 },
          { date: '2024-01-02', count: 15, avgAccuracy: 90 },
          { date: '2024-01-08', count: 12, avgAccuracy: 87 },
          { date: '2024-01-09', count: 8, avgAccuracy: 92 }
        ]
      };

      mockQueryBuilder.getAggregatedData.mockResolvedValue(mockAggregatedData);

      const result = await optimizedAnalysisService.getAnalyticsData(mockUserId, timeRange);

      expect(result.totalAnalyses).toBe(200);
      expect(result.averageAccuracy).toBe(88.5);
      expect(result.riskDistribution).toEqual({ low: 70, medium: 20, high: 8, critical: 2 });
      expect(result.dailyTrends).toEqual(mockAggregatedData.dailyTrends);
      expect(result.weeklyData).toHaveLength(2); // Should generate 2 weeks from daily data
      expect(result.weeklyData[0]).toMatchObject({
        week: 'Week 1',
        analyses: expect.any(Number),
        accuracy: expect.any(Number),
        hallucinations: expect.any(Number)
      });
    });

    it('should handle empty daily trends gracefully', async () => {
      const timeRange = {
        start: new Date('2024-01-01'),
        end: new Date('2024-01-31')
      };

      const mockAggregatedData = {
        totalAnalyses: 0,
        averageAccuracy: 0,
        riskDistribution: { low: 0, medium: 0, high: 0, critical: 0 },
        dailyTrends: []
      };

      mockQueryBuilder.getAggregatedData.mockResolvedValue(mockAggregatedData);

      const result = await optimizedAnalysisService.getAnalyticsData(mockUserId, timeRange);

      expect(result.weeklyData).toHaveLength(0);
    });
  });

  describe('saveAnalysisResult', () => {
    it('should save analysis result to database', async () => {
      const { monitoredSupabase } = await import('../monitoredSupabase');
      const { convertToDatabase } = await import('../../types/analysis');

      const mockResult = {
        id: 'result-123',
        content: 'Test content',
        accuracy: 85,
        riskLevel: 'medium',
        timestamp: new Date().toISOString(),
        userId: mockUserId
      };

      const mockDbResult = {
        id: 'result-123',
        content: 'Test content',
        accuracy: 85,
        risk_level: 'medium',
        created_at: mockResult.timestamp,
        user_id: mockUserId
      };

      const mockQuery = {
        insert: vi.fn().mockResolvedValue({ error: null })
      };

      vi.mocked(monitoredSupabase.from).mockReturnValue(mockQuery as any);
      vi.mocked(convertToDatabase).mockReturnValue(mockDbResult);

      await optimizedAnalysisService.saveAnalysisResult(mockResult);

      expect(convertToDatabase).toHaveBeenCalledWith(mockResult);
      expect(monitoredSupabase.from).toHaveBeenCalledWith('analysis_results');
      expect(mockQuery.insert).toHaveBeenCalledWith(mockDbResult);
    });

    it('should handle save errors', async () => {
      const { monitoredSupabase } = await import('../monitoredSupabase');

      const mockQuery = {
        insert: vi.fn().mockResolvedValue({ error: { message: 'Insert failed' } })
      };

      vi.mocked(monitoredSupabase.from).mockReturnValue(mockQuery as any);

      const mockResult = {
        id: 'result-123',
        content: 'Test content',
        accuracy: 85,
        riskLevel: 'medium',
        timestamp: new Date().toISOString(),
        userId: mockUserId
      };

      await expect(optimizedAnalysisService.saveAnalysisResult(mockResult))
        .rejects.toEqual({ message: 'Insert failed' });
    });
  });

  describe('batchSaveAnalysisResults', () => {
    it('should batch save multiple analysis results', async () => {
      const { convertToDatabase } = await import('../../types/analysis');

      const mockResults = [
        { id: '1', content: 'Test 1', accuracy: 85, riskLevel: 'low', userId: mockUserId },
        { id: '2', content: 'Test 2', accuracy: 75, riskLevel: 'medium', userId: mockUserId }
      ];

      const mockDbResults = mockResults.map(r => ({
        id: r.id,
        content: r.content,
        accuracy: r.accuracy,
        risk_level: r.riskLevel,
        user_id: r.userId
      }));

      vi.mocked(convertToDatabase).mockImplementation((result, index) => mockDbResults[index]);

      await optimizedAnalysisService.batchSaveAnalysisResults(mockResults);

      expect(convertToDatabase).toHaveBeenCalledTimes(2);
      expect(mockQueryBuilder.batchInsert).toHaveBeenCalledWith(mockDbResults);
    });
  });

  describe('getAnalysisById', () => {
    it('should get analysis result by ID', async () => {
      const { monitoredSupabase, convertDatabaseResult } = await import('../monitoredSupabase');

      const mockDbResult = {
        id: 'result-123',
        content: 'Test content',
        accuracy: 85,
        risk_level: 'medium',
        created_at: new Date().toISOString(),
        user_id: mockUserId
      };

      const mockConvertedResult = {
        id: 'result-123',
        content: 'Test content',
        accuracy: 85,
        riskLevel: 'medium',
        timestamp: mockDbResult.created_at,
        userId: mockUserId
      };

      const mockQuery = {
        select: vi.fn().mockReturnThis(),
        eq: vi.fn().mockReturnThis(),
        single: vi.fn().mockResolvedValue({ data: mockDbResult, error: null })
      };

      vi.mocked(monitoredSupabase.from).mockReturnValue(mockQuery as any);
      vi.mocked(convertDatabaseResult).mockReturnValue(mockConvertedResult);

      const result = await optimizedAnalysisService.getAnalysisById('result-123', mockUserId);

      expect(mockQuery.select).toHaveBeenCalledWith('*');
      expect(mockQuery.eq).toHaveBeenCalledWith('id', 'result-123');
      expect(mockQuery.eq).toHaveBeenCalledWith('user_id', mockUserId);
      expect(convertDatabaseResult).toHaveBeenCalledWith(mockDbResult);
      expect(result).toEqual(mockConvertedResult);
    });

    it('should return null when analysis not found', async () => {
      const { monitoredSupabase } = await import('../monitoredSupabase');

      const mockQuery = {
        select: vi.fn().mockReturnThis(),
        eq: vi.fn().mockReturnThis(),
        single: vi.fn().mockResolvedValue({ data: null, error: { message: 'Not found' } })
      };

      vi.mocked(monitoredSupabase.from).mockReturnValue(mockQuery as any);

      const result = await optimizedAnalysisService.getAnalysisById('nonexistent', mockUserId);

      expect(result).toBeNull();
    });
  });

  describe('searchAnalysisResults', () => {
    it('should search analysis results with text search', async () => {
      const { monitoredSupabase, convertDatabaseResult } = await import('../monitoredSupabase');

      const mockDbResults = [
        {
          id: 'result-1',
          content: 'Search result 1',
          accuracy: 85,
          risk_level: 'low',
          created_at: new Date().toISOString(),
          user_id: mockUserId
        }
      ];

      const mockConvertedResults = [
        {
          id: 'result-1',
          content: 'Search result 1',
          accuracy: 85,
          riskLevel: 'low',
          timestamp: mockDbResults[0].created_at,
          userId: mockUserId
        }
      ];

      const mockQuery = {
        select: vi.fn().mockReturnThis(),
        eq: vi.fn().mockReturnThis(),
        textSearch: vi.fn().mockReturnThis(),
        order: vi.fn().mockReturnThis(),
        limit: vi.fn().mockResolvedValue({ data: mockDbResults, error: null })
      };

      vi.mocked(monitoredSupabase.from).mockReturnValue(mockQuery as any);
      vi.mocked(convertDatabaseResult).mockImplementation((dbResult) => mockConvertedResults[0]);

      const result = await optimizedAnalysisService.searchAnalysisResults(
        mockUserId,
        'search query',
        { limit: 10, riskLevel: 'low' }
      );

      expect(mockQuery.textSearch).toHaveBeenCalledWith('content_search', 'search query');
      expect(mockQuery.limit).toHaveBeenCalledWith(10);
      expect(result.data).toEqual(mockConvertedResults);
      expect(result.hasMore).toBe(false);
    });

    it('should handle search errors', async () => {
      const { monitoredSupabase } = await import('../monitoredSupabase');

      const mockQuery = {
        select: vi.fn().mockReturnThis(),
        eq: vi.fn().mockReturnThis(),
        textSearch: vi.fn().mockReturnThis(),
        order: vi.fn().mockReturnThis(),
        limit: vi.fn().mockResolvedValue({ data: null, error: { message: 'Search failed' } })
      };

      vi.mocked(monitoredSupabase.from).mockReturnValue(mockQuery as any);

      await expect(optimizedAnalysisService.searchAnalysisResults(mockUserId, 'query'))
        .rejects.toEqual({ message: 'Search failed' });
    });
  });

  describe('getAnalysisResultsByBatchId', () => {
    it('should get analysis results by batch ID', async () => {
      const { monitoredSupabase, convertDatabaseResult } = await import('../monitoredSupabase');

      const mockDbResults = [
        { id: '1', batch_id: 'batch-123', content: 'Batch result 1', user_id: mockUserId },
        { id: '2', batch_id: 'batch-123', content: 'Batch result 2', user_id: mockUserId }
      ];

      const mockQuery = {
        select: vi.fn().mockReturnThis(),
        eq: vi.fn().mockReturnThis(),
        order: vi.fn().mockResolvedValue({ data: mockDbResults, error: null })
      };

      vi.mocked(monitoredSupabase.from).mockReturnValue(mockQuery as any);
      vi.mocked(convertDatabaseResult).mockImplementation((dbResult) => ({
        id: dbResult.id,
        content: dbResult.content,
        batchId: dbResult.batch_id
      }));

      const result = await optimizedAnalysisService.getAnalysisResultsByBatchId('batch-123', mockUserId);

      expect(mockQuery.eq).toHaveBeenCalledWith('user_id', mockUserId);
      expect(mockQuery.eq).toHaveBeenCalledWith('batch_id', 'batch-123');
      expect(result).toHaveLength(2);
    });
  });

  describe('getAnalysisResultsByScanId', () => {
    it('should get analysis results by scan ID', async () => {
      const { monitoredSupabase, convertDatabaseResult } = await import('../monitoredSupabase');

      const mockDbResults = [
        { id: '1', scan_id: 'scan-456', content: 'Scan result 1', user_id: mockUserId }
      ];

      const mockQuery = {
        select: vi.fn().mockReturnThis(),
        eq: vi.fn().mockReturnThis(),
        order: vi.fn().mockResolvedValue({ data: mockDbResults, error: null })
      };

      vi.mocked(monitoredSupabase.from).mockReturnValue(mockQuery as any);
      vi.mocked(convertDatabaseResult).mockImplementation((dbResult) => ({
        id: dbResult.id,
        content: dbResult.content,
        scanId: dbResult.scan_id
      }));

      const result = await optimizedAnalysisService.getAnalysisResultsByScanId('scan-456', mockUserId);

      expect(mockQuery.eq).toHaveBeenCalledWith('user_id', mockUserId);
      expect(mockQuery.eq).toHaveBeenCalledWith('scan_id', 'scan-456');
      expect(result).toHaveLength(1);
    });
  });

  describe('deleteAnalysisResults', () => {
    it('should delete multiple analysis results', async () => {
      const { monitoredSupabase } = await import('../monitoredSupabase');

      const mockQuery = {
        delete: vi.fn().mockReturnThis(),
        eq: vi.fn().mockReturnThis(),
        in: vi.fn().mockResolvedValue({ error: null })
      };

      vi.mocked(monitoredSupabase.from).mockReturnValue(mockQuery as any);

      const idsToDelete = ['result-1', 'result-2', 'result-3'];

      await optimizedAnalysisService.deleteAnalysisResults(idsToDelete, mockUserId);

      expect(mockQuery.eq).toHaveBeenCalledWith('user_id', mockUserId);
      expect(mockQuery.in).toHaveBeenCalledWith('id', idsToDelete);
    });

    it('should handle delete errors', async () => {
      const { monitoredSupabase } = await import('../monitoredSupabase');

      const mockQuery = {
        delete: vi.fn().mockReturnThis(),
        eq: vi.fn().mockReturnThis(),
        in: vi.fn().mockResolvedValue({ error: { message: 'Delete failed' } })
      };

      vi.mocked(monitoredSupabase.from).mockReturnValue(mockQuery as any);

      await expect(optimizedAnalysisService.deleteAnalysisResults(['result-1'], mockUserId))
        .rejects.toEqual({ message: 'Delete failed' });
    });
  });

  describe('getUserStatistics', () => {
    it('should calculate comprehensive user statistics', async () => {
      const { monitoredSupabase } = await import('../monitoredSupabase');

      const mockData = [
        { accuracy: 85, risk_level: 'low', analysis_type: 'single', hallucinations: [{ type: 'factual' }] },
        { accuracy: 75, risk_level: 'medium', analysis_type: 'batch', hallucinations: [] },
        { accuracy: 90, risk_level: 'low', analysis_type: 'single', hallucinations: [{ type: 'logical' }, { type: 'factual' }] },
        { accuracy: 60, risk_level: 'high', analysis_type: 'scheduled', hallucinations: [{ type: 'contextual' }] }
      ];

      const mockQuery = {
        select: vi.fn().mockReturnThis(),
        eq: vi.fn().mockResolvedValue({ data: mockData, error: null })
      };

      vi.mocked(monitoredSupabase.from).mockReturnValue(mockQuery as any);

      const result = await optimizedAnalysisService.getUserStatistics(mockUserId);

      expect(result.totalAnalyses).toBe(4);
      expect(result.totalHallucinations).toBe(4); // 1 + 0 + 2 + 1
      expect(result.averageAccuracy).toBe(77.5); // (85 + 75 + 90 + 60) / 4
      expect(result.riskDistribution.low).toBe(50); // 2/4 * 100
      expect(result.riskDistribution.medium).toBe(25); // 1/4 * 100
      expect(result.riskDistribution.high).toBe(25); // 1/4 * 100
      expect(result.analysisTypeDistribution.single).toBe(50); // 2/4 * 100
      expect(result.analysisTypeDistribution.batch).toBe(25); // 1/4 * 100
      expect(result.analysisTypeDistribution.scheduled).toBe(25); // 1/4 * 100
    });

    it('should handle empty statistics gracefully', async () => {
      const { monitoredSupabase } = await import('../monitoredSupabase');

      const mockQuery = {
        select: vi.fn().mockReturnThis(),
        eq: vi.fn().mockResolvedValue({ data: [], error: null })
      };

      vi.mocked(monitoredSupabase.from).mockReturnValue(mockQuery as any);

      const result = await optimizedAnalysisService.getUserStatistics(mockUserId);

      expect(result.totalAnalyses).toBe(0);
      expect(result.totalHallucinations).toBe(0);
      expect(result.averageAccuracy).toBe(0);
      expect(result.riskDistribution).toEqual({ low: 0, medium: 0, high: 0, critical: 0 });
      expect(result.analysisTypeDistribution).toEqual({ single: 0, batch: 0, scheduled: 0 });
    });

    it('should handle database errors', async () => {
      const { monitoredSupabase } = await import('../monitoredSupabase');

      const mockQuery = {
        select: vi.fn().mockReturnThis(),
        eq: vi.fn().mockResolvedValue({ data: null, error: { message: 'Database error' } })
      };

      vi.mocked(monitoredSupabase.from).mockReturnValue(mockQuery as any);

      const result = await optimizedAnalysisService.getUserStatistics(mockUserId);

      expect(result.totalAnalyses).toBe(0);
      expect(result.averageAccuracy).toBe(0);
    });
  });

  describe('performance monitoring', () => {
    it('should get performance metrics from query builder', () => {
      const metrics = optimizedAnalysisService.getPerformanceMetrics();

      expect(mockQueryBuilder.getPerformanceReport).toHaveBeenCalled();
      expect(metrics).toEqual({
        averageExecutionTime: 250,
        slowQueries: [],
        totalQueries: 100,
        queryFrequency: {}
      });
    });

    it('should clear performance metrics', () => {
      optimizedAnalysisService.clearPerformanceMetrics();

      expect(mockQueryBuilder.clearMetrics).toHaveBeenCalled();
    });
  });

  describe('analysis delegation', () => {
    it('should delegate content analysis to original service', async () => {
      const analysisService = (await import('../analysisService')).default;
      
      const mockResult = {
        id: 'analysis-123',
        content: 'Test content',
        accuracy: 85,
        riskLevel: 'medium'
      };

      vi.mocked(analysisService.analyzeContent).mockResolvedValue(mockResult);

      const content = 'Test content to analyze';
      const options = { sensitivity: 'high' as const, includeSourceVerification: true };

      const result = await optimizedAnalysisService.analyzeContent(content, mockUserId, options);

      expect(analysisService.analyzeContent).toHaveBeenCalledWith(content, mockUserId, options);
      expect(result).toEqual(mockResult);
    });

    it('should delegate batch analysis to original service', async () => {
      const analysisService = (await import('../analysisService')).default;
      
      const mockResults = [
        { id: 'batch-1', content: 'Document 1', accuracy: 85 },
        { id: 'batch-2', content: 'Document 2', accuracy: 90 }
      ];

      vi.mocked(analysisService.analyzeBatch).mockResolvedValue(mockResults);

      const documents = [
        { id: 'doc-1', content: 'Document 1 content', filename: 'doc1.txt' },
        { id: 'doc-2', content: 'Document 2 content', filename: 'doc2.txt' }
      ];

      const options = { sensitivity: 'medium' as const, enableRAG: true };

      const result = await optimizedAnalysisService.analyzeBatch(documents, mockUserId, options);

      expect(analysisService.analyzeBatch).toHaveBeenCalledWith(documents, mockUserId, options);
      expect(result).toEqual(mockResults);
    });
  });

  describe('weekly data generation', () => {
    it('should generate weekly data from daily trends correctly', async () => {
      const timeRange = {
        start: new Date('2024-01-01'),
        end: new Date('2024-01-31')
      };

      // Mock daily trends spanning multiple weeks
      const mockAggregatedData = {
        totalAnalyses: 100,
        averageAccuracy: 85,
        riskDistribution: { low: 70, medium: 20, high: 8, critical: 2 },
        dailyTrends: [
          // Week 1
          { date: '2024-01-01', count: 10, avgAccuracy: 85 }, // Monday
          { date: '2024-01-02', count: 12, avgAccuracy: 87 }, // Tuesday
          { date: '2024-01-03', count: 8, avgAccuracy: 83 },  // Wednesday
          // Week 2
          { date: '2024-01-08', count: 15, avgAccuracy: 90 }, // Monday
          { date: '2024-01-09', count: 11, avgAccuracy: 88 }, // Tuesday
          { date: '2024-01-10', count: 9, avgAccuracy: 86 },  // Wednesday
          // Week 3
          { date: '2024-01-15', count: 13, avgAccuracy: 89 }, // Monday
          { date: '2024-01-16', count: 7, avgAccuracy: 84 },  // Tuesday
        ]
      };

      mockQueryBuilder.getAggregatedData.mockResolvedValue(mockAggregatedData);

      const result = await optimizedAnalysisService.getAnalyticsData(mockUserId, timeRange);

      expect(result.weeklyData).toHaveLength(3); // 3 weeks
      
      // Check first week
      expect(result.weeklyData[0]).toMatchObject({
        week: 'Week 1',
        analyses: 30, // 10 + 12 + 8
        accuracy: expect.closeTo(85, 1), // Weighted average
        hallucinations: 3 // Estimated: 30 * 0.1
      });

      // Check that we only get last 4 weeks if more than 4
      expect(result.weeklyData.length).toBeLessThanOrEqual(4);
    });

    it('should handle single day trends', async () => {
      const timeRange = {
        start: new Date('2024-01-01'),
        end: new Date('2024-01-01')
      };

      const mockAggregatedData = {
        totalAnalyses: 10,
        averageAccuracy: 85,
        riskDistribution: { low: 80, medium: 20, high: 0, critical: 0 },
        dailyTrends: [
          { date: '2024-01-01', count: 10, avgAccuracy: 85 }
        ]
      };

      mockQueryBuilder.getAggregatedData.mockResolvedValue(mockAggregatedData);

      const result = await optimizedAnalysisService.getAnalyticsData(mockUserId, timeRange);

      expect(result.weeklyData).toHaveLength(1);
      expect(result.weeklyData[0]).toMatchObject({
        week: 'Week 1',
        analyses: 10,
        accuracy: 85,
        hallucinations: 1
      });
    });
  });
});