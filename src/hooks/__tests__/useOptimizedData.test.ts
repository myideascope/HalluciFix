import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { renderHook, act, waitFor } from '@testing-library/react';
import { useOptimizedData, useBatchAnalysisResults, useBatchUsers, useDataPreloader } from '../useOptimizedData';
import { dataPrefetchingService } from '../../lib/dataPrefetchingService';
import { createMockAnalysisResult, createMockUser } from '../../test/utils/render';

// Mock the data prefetching service
vi.mock('../../lib/dataPrefetchingService', () => ({
  dataPrefetchingService: {
    batchLoadUserData: vi.fn(),
    batchLoadAnalysisResults: vi.fn(),
    batchLoadUsers: vi.fn(),
    batchLoadScanResults: vi.fn(),
    preloadUserData: vi.fn(),
    invalidateUserCache: vi.fn()
  }
}));

const mockDataPrefetchingService = vi.mocked(dataPrefetchingService);

describe('useOptimizedData', () => {
  const mockUserId = 'test-user-123';
  const mockPrefetchedData = {
    analysisResults: [
      createMockAnalysisResult({ id: 'analysis-1' }),
      createMockAnalysisResult({ id: 'analysis-2' })
    ],
    dashboardData: {
      stats: {
        totalAnalyses: 2,
        averageAccuracy: 85.5,
        totalHallucinations: 3,
        activeUsers: 1
      },
      riskDistribution: {
        low: 50,
        medium: 25,
        high: 25,
        critical: 0
      },
      recentAnalyses: []
    }
  };

  beforeEach(() => {
    vi.clearAllMocks();
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.clearAllMocks();
    vi.useRealTimers();
  });

  describe('initialization', () => {
    it('should initialize with loading state', () => {
      mockDataPrefetchingService.batchLoadUserData.mockImplementation(() => 
        new Promise(() => {}) // Never resolves
      );

      const { result } = renderHook(() => useOptimizedData(mockUserId));

      expect(result.current.isLoading).toBe(true);
      expect(result.current.data).toBe(null);
      expect(result.current.error).toBe(null);
    });

    it('should not fetch data when userId is null', () => {
      const { result } = renderHook(() => useOptimizedData(null));

      expect(result.current.isLoading).toBe(false);
      expect(result.current.data).toBe(null);
      expect(result.current.error).toBe(null);
      expect(mockDataPrefetchingService.batchLoadUserData).not.toHaveBeenCalled();
    });

    it('should not fetch data when disabled', () => {
      const { result } = renderHook(() => 
        useOptimizedData(mockUserId, { enabled: false })
      );

      expect(result.current.isLoading).toBe(false);
      expect(mockDataPrefetchingService.batchLoadUserData).not.toHaveBeenCalled();
    });
  });

  describe('data fetching', () => {
    it('should fetch data successfully', async () => {
      mockDataPrefetchingService.batchLoadUserData.mockResolvedValue(mockPrefetchedData);

      const { result } = renderHook(() => useOptimizedData(mockUserId));

      await waitFor(() => {
        expect(result.current.isLoading).toBe(false);
      });

      expect(result.current.data).toEqual(mockPrefetchedData);
      expect(result.current.error).toBe(null);
      expect(mockDataPrefetchingService.batchLoadUserData).toHaveBeenCalledWith(
        mockUserId,
        expect.any(Object)
      );
    });

    it('should handle fetch errors', async () => {
      const mockError = new Error('Fetch failed');
      mockDataPrefetchingService.batchLoadUserData.mockRejectedValue(mockError);

      const { result } = renderHook(() => useOptimizedData(mockUserId));

      await waitFor(() => {
        expect(result.current.isLoading).toBe(false);
      });

      expect(result.current.data).toBe(null);
      expect(result.current.error).toEqual(mockError);
    });

    it('should pass options to the service', async () => {
      mockDataPrefetchingService.batchLoadUserData.mockResolvedValue(mockPrefetchedData);

      const options = {
        includeAnalyses: true,
        includeDashboard: true,
        analysisLimit: 20
      };

      renderHook(() => useOptimizedData(mockUserId, options));

      await waitFor(() => {
        expect(mockDataPrefetchingService.batchLoadUserData).toHaveBeenCalledWith(
          mockUserId,
          expect.objectContaining(options)
        );
      });
    });

    it('should handle non-Error rejections', async () => {
      mockDataPrefetchingService.batchLoadUserData.mockRejectedValue('String error');

      const { result } = renderHook(() => useOptimizedData(mockUserId));

      await waitFor(() => {
        expect(result.current.isLoading).toBe(false);
      });

      expect(result.current.error).toEqual(new Error('Failed to fetch data'));
    });
  });

  describe('stale time handling', () => {
    it('should not refetch if data is still fresh', async () => {
      mockDataPrefetchingService.batchLoadUserData.mockResolvedValue(mockPrefetchedData);

      const { result, rerender } = renderHook(() => 
        useOptimizedData(mockUserId, { staleTime: 60000 }) // 1 minute
      );

      await waitFor(() => {
        expect(result.current.data).toEqual(mockPrefetchedData);
      });

      expect(mockDataPrefetchingService.batchLoadUserData).toHaveBeenCalledTimes(1);

      // Rerender should not trigger new fetch
      rerender();

      expect(mockDataPrefetchingService.batchLoadUserData).toHaveBeenCalledTimes(1);
    });

    it('should refetch if data is stale', async () => {
      mockDataPrefetchingService.batchLoadUserData.mockResolvedValue(mockPrefetchedData);

      const { result, rerender } = renderHook(() => 
        useOptimizedData(mockUserId, { staleTime: 1000 }) // 1 second
      );

      await waitFor(() => {
        expect(result.current.data).toEqual(mockPrefetchedData);
      });

      expect(mockDataPrefetchingService.batchLoadUserData).toHaveBeenCalledTimes(1);

      // Advance time beyond stale time
      vi.advanceTimersByTime(2000);

      // Trigger refetch by changing options
      rerender();

      await act(async () => {
        await result.current.refetch();
      });

      expect(mockDataPrefetchingService.batchLoadUserData).toHaveBeenCalledTimes(2);
    });
  });

  describe('refetch functionality', () => {
    it('should refetch data when refetch is called', async () => {
      mockDataPrefetchingService.batchLoadUserData.mockResolvedValue(mockPrefetchedData);

      const { result } = renderHook(() => useOptimizedData(mockUserId));

      await waitFor(() => {
        expect(result.current.data).toEqual(mockPrefetchedData);
      });

      expect(mockDataPrefetchingService.batchLoadUserData).toHaveBeenCalledTimes(1);

      await act(async () => {
        await result.current.refetch();
      });

      expect(mockDataPrefetchingService.batchLoadUserData).toHaveBeenCalledTimes(2);
    });

    it('should force refetch even if data is fresh', async () => {
      mockDataPrefetchingService.batchLoadUserData.mockResolvedValue(mockPrefetchedData);

      const { result } = renderHook(() => 
        useOptimizedData(mockUserId, { staleTime: 60000 })
      );

      await waitFor(() => {
        expect(result.current.data).toEqual(mockPrefetchedData);
      });

      await act(async () => {
        await result.current.refetch();
      });

      expect(mockDataPrefetchingService.batchLoadUserData).toHaveBeenCalledTimes(2);
    });
  });

  describe('invalidate functionality', () => {
    it('should invalidate cache when invalidate is called', async () => {
      mockDataPrefetchingService.batchLoadUserData.mockResolvedValue(mockPrefetchedData);

      const { result } = renderHook(() => useOptimizedData(mockUserId));

      await waitFor(() => {
        expect(result.current.data).toEqual(mockPrefetchedData);
      });

      act(() => {
        result.current.invalidate();
      });

      expect(mockDataPrefetchingService.invalidateUserCache).toHaveBeenCalledWith(mockUserId);
    });

    it('should not call invalidate when userId is null', () => {
      const { result } = renderHook(() => useOptimizedData(null));

      act(() => {
        result.current.invalidate();
      });

      expect(mockDataPrefetchingService.invalidateUserCache).not.toHaveBeenCalled();
    });
  });

  describe('refetch interval', () => {
    it('should set up refetch interval when specified', async () => {
      mockDataPrefetchingService.batchLoadUserData.mockResolvedValue(mockPrefetchedData);

      renderHook(() => 
        useOptimizedData(mockUserId, { refetchInterval: 5000 })
      );

      await waitFor(() => {
        expect(mockDataPrefetchingService.batchLoadUserData).toHaveBeenCalledTimes(1);
      });

      // Advance time to trigger interval
      vi.advanceTimersByTime(5000);

      await waitFor(() => {
        expect(mockDataPrefetchingService.batchLoadUserData).toHaveBeenCalledTimes(2);
      });
    });

    it('should clear interval on unmount', async () => {
      mockDataPrefetchingService.batchLoadUserData.mockResolvedValue(mockPrefetchedData);

      const { unmount } = renderHook(() => 
        useOptimizedData(mockUserId, { refetchInterval: 5000 })
      );

      await waitFor(() => {
        expect(mockDataPrefetchingService.batchLoadUserData).toHaveBeenCalledTimes(1);
      });

      unmount();

      // Advance time - should not trigger more fetches
      vi.advanceTimersByTime(10000);

      expect(mockDataPrefetchingService.batchLoadUserData).toHaveBeenCalledTimes(1);
    });

    it('should not set up interval when refetchInterval is 0', async () => {
      mockDataPrefetchingService.batchLoadUserData.mockResolvedValue(mockPrefetchedData);

      renderHook(() => 
        useOptimizedData(mockUserId, { refetchInterval: 0 })
      );

      await waitFor(() => {
        expect(mockDataPrefetchingService.batchLoadUserData).toHaveBeenCalledTimes(1);
      });

      vi.advanceTimersByTime(10000);

      expect(mockDataPrefetchingService.batchLoadUserData).toHaveBeenCalledTimes(1);
    });
  });

  describe('userId changes', () => {
    it('should refetch when userId changes', async () => {
      mockDataPrefetchingService.batchLoadUserData.mockResolvedValue(mockPrefetchedData);

      const { result, rerender } = renderHook(
        ({ userId }) => useOptimizedData(userId),
        { initialProps: { userId: 'user-1' } }
      );

      await waitFor(() => {
        expect(result.current.data).toEqual(mockPrefetchedData);
      });

      expect(mockDataPrefetchingService.batchLoadUserData).toHaveBeenCalledWith('user-1', expect.any(Object));

      rerender({ userId: 'user-2' });

      await waitFor(() => {
        expect(mockDataPrefetchingService.batchLoadUserData).toHaveBeenCalledWith('user-2', expect.any(Object));
      });

      expect(mockDataPrefetchingService.batchLoadUserData).toHaveBeenCalledTimes(2);
    });

    it('should stop fetching when userId becomes null', async () => {
      mockDataPrefetchingService.batchLoadUserData.mockResolvedValue(mockPrefetchedData);

      const { result, rerender } = renderHook(
        ({ userId }) => useOptimizedData(userId),
        { initialProps: { userId: mockUserId } }
      );

      await waitFor(() => {
        expect(result.current.data).toEqual(mockPrefetchedData);
      });

      rerender({ userId: null });

      expect(result.current.isLoading).toBe(false);
      expect(mockDataPrefetchingService.batchLoadUserData).toHaveBeenCalledTimes(1);
    });
  });
});

describe('useBatchAnalysisResults', () => {
  const mockUserId = 'test-user-123';
  const mockAnalysisIds = ['analysis-1', 'analysis-2', 'analysis-3'];
  const mockAnalysisResults = new Map([
    ['analysis-1', createMockAnalysisResult({ id: 'analysis-1' })],
    ['analysis-2', createMockAnalysisResult({ id: 'analysis-2' })],
    ['analysis-3', createMockAnalysisResult({ id: 'analysis-3' })]
  ]);

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('should fetch analysis results successfully', async () => {
    mockDataPrefetchingService.batchLoadAnalysisResults.mockResolvedValue(mockAnalysisResults);

    const { result } = renderHook(() => 
      useBatchAnalysisResults(mockAnalysisIds, mockUserId)
    );

    await waitFor(() => {
      expect(result.current.isLoading).toBe(false);
    });

    expect(result.current.data).toEqual(mockAnalysisResults);
    expect(result.current.error).toBe(null);
    expect(mockDataPrefetchingService.batchLoadAnalysisResults).toHaveBeenCalledWith(
      mockAnalysisIds,
      mockUserId
    );
  });

  it('should handle empty analysis IDs', async () => {
    const { result } = renderHook(() => 
      useBatchAnalysisResults([], mockUserId)
    );

    expect(result.current.data).toEqual(new Map());
    expect(result.current.isLoading).toBe(false);
    expect(mockDataPrefetchingService.batchLoadAnalysisResults).not.toHaveBeenCalled();
  });

  it('should handle null userId', async () => {
    const { result } = renderHook(() => 
      useBatchAnalysisResults(mockAnalysisIds, null)
    );

    expect(result.current.data).toEqual(new Map());
    expect(result.current.isLoading).toBe(false);
    expect(mockDataPrefetchingService.batchLoadAnalysisResults).not.toHaveBeenCalled();
  });

  it('should handle fetch errors', async () => {
    const mockError = new Error('Fetch failed');
    mockDataPrefetchingService.batchLoadAnalysisResults.mockRejectedValue(mockError);

    const { result } = renderHook(() => 
      useBatchAnalysisResults(mockAnalysisIds, mockUserId)
    );

    await waitFor(() => {
      expect(result.current.isLoading).toBe(false);
    });

    expect(result.current.error).toEqual(mockError);
    expect(result.current.data).toEqual(new Map());
  });
});

describe('useBatchUsers', () => {
  const mockUserIds = ['user-1', 'user-2', 'user-3'];
  const mockUsers = new Map([
    ['user-1', createMockUser({ id: 'user-1' })],
    ['user-2', createMockUser({ id: 'user-2' })],
    ['user-3', createMockUser({ id: 'user-3' })]
  ]);

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('should fetch users successfully', async () => {
    mockDataPrefetchingService.batchLoadUsers.mockResolvedValue(mockUsers);

    const { result } = renderHook(() => useBatchUsers(mockUserIds));

    await waitFor(() => {
      expect(result.current.isLoading).toBe(false);
    });

    expect(result.current.data).toEqual(mockUsers);
    expect(result.current.error).toBe(null);
    expect(mockDataPrefetchingService.batchLoadUsers).toHaveBeenCalledWith(mockUserIds);
  });

  it('should handle empty user IDs', async () => {
    const { result } = renderHook(() => useBatchUsers([]));

    expect(result.current.data).toEqual(new Map());
    expect(result.current.isLoading).toBe(false);
    expect(mockDataPrefetchingService.batchLoadUsers).not.toHaveBeenCalled();
  });

  it('should refetch when called', async () => {
    mockDataPrefetchingService.batchLoadUsers.mockResolvedValue(mockUsers);

    const { result } = renderHook(() => useBatchUsers(mockUserIds));

    await waitFor(() => {
      expect(result.current.data).toEqual(mockUsers);
    });

    await act(async () => {
      await result.current.refetch();
    });

    expect(mockDataPrefetchingService.batchLoadUsers).toHaveBeenCalledTimes(2);
  });
});

describe('useDataPreloader', () => {
  const mockUserId = 'test-user-123';

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('should preload data on mount', async () => {
    mockDataPrefetchingService.preloadUserData.mockResolvedValue(undefined);

    renderHook(() => useDataPreloader(mockUserId));

    await waitFor(() => {
      expect(mockDataPrefetchingService.preloadUserData).toHaveBeenCalledWith(mockUserId);
    });
  });

  it('should not preload when userId is null', () => {
    renderHook(() => useDataPreloader(null));

    expect(mockDataPrefetchingService.preloadUserData).not.toHaveBeenCalled();
  });

  it('should handle preload errors gracefully', async () => {
    const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    mockDataPrefetchingService.preloadUserData.mockRejectedValue(new Error('Preload failed'));

    renderHook(() => useDataPreloader(mockUserId));

    await waitFor(() => {
      expect(consoleSpy).toHaveBeenCalledWith('Preload failed:', expect.any(Error));
    });

    consoleSpy.mockRestore();
  });

  it('should provide preload function', async () => {
    mockDataPrefetchingService.preloadUserData.mockResolvedValue(undefined);

    const { result } = renderHook(() => useDataPreloader(mockUserId));

    await act(async () => {
      await result.current.preload();
    });

    expect(mockDataPrefetchingService.preloadUserData).toHaveBeenCalledTimes(2); // Once on mount, once manually
  });
});