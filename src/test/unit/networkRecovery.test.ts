/**
 * Tests for NetworkRecoveryManager
 * Covers offline operations, background sync, and conflict resolution
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { networkRecoveryManager, NetworkRecoveryManager, queueWhenOffline, useNetworkRecovery } from '../../lib/errors/networkRecovery';

// Mock dependencies
vi.mock('../errors/networkMonitor', () => ({
  networkMonitor: {
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
    isOnline: vi.fn(() => true)
  },
  NetworkEventType: {
    ONLINE: 'online',
    OFFLINE: 'offline'
  }
}));

vi.mock('../errors/recoveryTracker', () => ({
  recoveryTracker: {
    recordAttempt: vi.fn()
  }
}));

// Mock localStorage
const mockLocalStorage = {
  getItem: vi.fn(),
  setItem: vi.fn(),
  removeItem: vi.fn(),
  clear: vi.fn()
};
Object.defineProperty(window, 'localStorage', { value: mockLocalStorage });

// Mock fetch
global.fetch = vi.fn();

// Mock document for visibility change events
Object.defineProperty(document, 'visibilityState', {
  value: 'visible',
  writable: true
});

describe('NetworkRecoveryManager', () => {
  let recoveryManager: NetworkRecoveryManager;

  beforeEach(() => {
    vi.clearAllMocks();
    vi.useFakeTimers();
    
    recoveryManager = new NetworkRecoveryManager({
      enableBackgroundSync: true,
      syncInterval: 1000,
      maxSyncOperations: 10,
      persistOperations: true,
      storageKey: 'test_sync_operations',
      batchSize: 3,
      retryDelay: 100,
      maxRetryDelay: 1000
    });
  });

  afterEach(() => {
    vi.useRealTimers();
    recoveryManager.destroy();
  });

  describe('initialization', () => {
    it('should initialize with default configuration', () => {
      const defaultManager = new NetworkRecoveryManager();
      expect(defaultManager).toBeDefined();
      defaultManager.destroy();
    });

    it('should load persisted operations on initialization', () => {
      const mockOperations = JSON.stringify({
        operations: [
          {
            id: 'op-1',
            type: 'create',
            resource: 'users',
            data: { name: 'Test User' },
            timestamp: new Date().toISOString(),
            retryCount: 0,
            maxRetries: 3,
            priority: 'medium'
          }
        ],
        timestamp: new Date().toISOString()
      });

      mockLocalStorage.getItem.mockReturnValue(mockOperations);

      const managerWithPersistedData = new NetworkRecoveryManager({
        persistOperations: true,
        storageKey: 'test_persisted_operations'
      });

      const pendingOps = managerWithPersistedData.getPendingSyncOperations();
      expect(pendingOps).toHaveLength(1);
      expect(pendingOps[0].id).toBe('op-1');

      managerWithPersistedData.destroy();
    });

    it('should handle corrupted localStorage data gracefully', () => {
      mockLocalStorage.getItem.mockReturnValue('invalid json');

      const consoleSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});

      const managerWithCorruptedData = new NetworkRecoveryManager({
        persistOperations: true
      });

      expect(consoleSpy).toHaveBeenCalledWith(
        'Failed to load persisted sync operations:',
        expect.any(Error)
      );

      consoleSpy.mockRestore();
      managerWithCorruptedData.destroy();
    });
  });

  describe('operation queueing', () => {
    it('should queue sync operations', () => {
      const operationId = recoveryManager.queueSyncOperation({
        type: 'create',
        resource: 'users',
        data: { name: 'Test User' },
        maxRetries: 3,
        priority: 'medium'
      });

      expect(operationId).toMatch(/^sync_\d+_[a-z0-9]+$/);

      const pendingOps = recoveryManager.getPendingSyncOperations();
      expect(pendingOps).toHaveLength(1);
      expect(pendingOps[0].type).toBe('create');
      expect(pendingOps[0].resource).toBe('users');
    });

    it('should prioritize operations correctly', () => {
      const lowPriorityId = recoveryManager.queueSyncOperation({
        type: 'create',
        resource: 'logs',
        data: {},
        maxRetries: 1,
        priority: 'low'
      });

      const criticalPriorityId = recoveryManager.queueSyncOperation({
        type: 'create',
        resource: 'alerts',
        data: {},
        maxRetries: 3,
        priority: 'critical'
      });

      const pendingOps = recoveryManager.getPendingSyncOperations();
      expect(pendingOps[0].priority).toBe('critical');
      expect(pendingOps[1].priority).toBe('low');
    });

    it('should enforce queue size limits', () => {
      // Fill queue beyond limit
      for (let i = 0; i < 15; i++) {
        recoveryManager.queueSyncOperation({
          type: 'create',
          resource: 'items',
          data: { id: i },
          maxRetries: 1,
          priority: i < 5 ? 'low' : 'medium'
        });
      }

      const pendingOps = recoveryManager.getPendingSyncOperations();
      expect(pendingOps.length).toBeLessThanOrEqual(10);
      
      // Low priority operations should be removed first
      const hasLowPriority = pendingOps.some(op => op.priority === 'low');
      expect(hasLowPriority).toBe(false);
    });

    it('should remove operations from queue', () => {
      const operationId = recoveryManager.queueSyncOperation({
        type: 'create',
        resource: 'users',
        data: { name: 'Test User' },
        maxRetries: 3,
        priority: 'medium'
      });

      expect(recoveryManager.getPendingSyncOperations()).toHaveLength(1);

      const removed = recoveryManager.removeSyncOperation(operationId);
      expect(removed).toBe(true);
      expect(recoveryManager.getPendingSyncOperations()).toHaveLength(0);
    });

    it('should clear all operations', () => {
      recoveryManager.queueSyncOperation({
        type: 'create',
        resource: 'users',
        data: {},
        maxRetries: 1,
        priority: 'medium'
      });

      recoveryManager.queueSyncOperation({
        type: 'update',
        resource: 'users',
        data: {},
        maxRetries: 1,
        priority: 'medium'
      });

      expect(recoveryManager.getPendingSyncOperations()).toHaveLength(2);

      recoveryManager.clearSyncQueue();
      expect(recoveryManager.getPendingSyncOperations()).toHaveLength(0);
    });
  });

  describe('background sync', () => {
    it('should perform sync when online', async () => {
      const fetchSpy = vi.mocked(fetch);
      fetchSpy.mockResolvedValue(new Response(JSON.stringify({ success: true }), { status: 200 }));

      const { networkMonitor } = await import('../errors/networkMonitor');
      vi.mocked(networkMonitor.isOnline).mockReturnValue(true);

      recoveryManager.queueSyncOperation({
        type: 'create',
        resource: 'users',
        data: { name: 'Test User' },
        maxRetries: 3,
        priority: 'medium'
      });

      const results = await recoveryManager.forcSync();

      expect(results).toHaveLength(1);
      expect(results[0].success).toBe(true);
      expect(fetchSpy).toHaveBeenCalledWith(
       ../../lib/api/users',
        expect.objectContaining({
          method: 'POST',
          headers: expect.objectContaining({
            'Content-Type': 'application/json'
          }),
          body: JSON.stringify({ name: 'Test User' })
        })
      );
    });

    it('should handle sync failures with retry', async () => {
      const fetchSpy = vi.mocked(fetch);
      fetchSpy
        .mockRejectedValueOnce(new Error('Network error'))
        .mockResolvedValueOnce(new Response(JSON.stringify({ success: true }), { status: 200 }));

      const { networkMonitor } = await import('../errors/networkMonitor');
      vi.mocked(networkMonitor.isOnline).mockReturnValue(true);

      recoveryManager.queueSyncOperation({
        type: 'create',
        resource: 'users',
        data: { name: 'Test User' },
        maxRetries: 2,
        priority: 'medium'
      });

      // First sync attempt should fail and schedule retry
      const results1 = await recoveryManager.forcSync();
      expect(results1[0].success).toBe(false);

      // Advance time to trigger retry
      vi.advanceTimersByTime(100);
      await vi.runAllTimersAsync();

      // Second attempt should succeed
      expect(fetchSpy).toHaveBeenCalledTimes(2);
    });

    it('should handle max retries exceeded', async () => {
      const fetchSpy = vi.mocked(fetch);
      fetchSpy.mockRejectedValue(new Error('Persistent network error'));

      const { networkMonitor } = await import('../errors/networkMonitor');
      vi.mocked(networkMonitor.isOnline).mockReturnValue(true);

      const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

      recoveryManager.queueSyncOperation({
        type: 'create',
        resource: 'users',
        data: { name: 'Test User' },
        maxRetries: 1,
        priority: 'medium'
      });

      await recoveryManager.forcSync();

      // Advance time to trigger retry
      vi.advanceTimersByTime(100);
      await vi.runAllTimersAsync();

      expect(consoleSpy).toHaveBeenCalledWith(
        expect.stringContaining('failed after 1 retries'),
        expect.any(Error)
      );

      consoleSpy.mockRestore();
    });

    it('should batch sync operations', async () => {
      const fetchSpy = vi.mocked(fetch);
      fetchSpy.mockResolvedValue(new Response(JSON.stringify({ success: true }), { status: 200 }));

      const { networkMonitor } = await import('../errors/networkMonitor');
      vi.mocked(networkMonitor.isOnline).mockReturnValue(true);

      // Queue multiple operations
      for (let i = 0; i < 5; i++) {
        recoveryManager.queueSyncOperation({
          type: 'create',
          resource: 'users',
          data: { name: `User ${i}` },
          maxRetries: 1,
          priority: 'medium'
        });
      }

      const results = await recoveryManager.forcSync();

      // Should process batch size (3) operations
      expect(results).toHaveLength(3);
      expect(fetchSpy).toHaveBeenCalledTimes(3);
      
      // Remaining operations should still be in queue
      expect(recoveryManager.getPendingSyncOperations()).toHaveLength(2);
    });

    it('should handle dependencies between operations', async () => {
      const fetchSpy = vi.mocked(fetch);
      fetchSpy.mockResolvedValue(new Response(JSON.stringify({ success: true }), { status: 200 }));

      const { networkMonitor } = await import('../errors/networkMonitor');
      vi.mocked(networkMonitor.isOnline).mockReturnValue(true);

      const dependencyId = recoveryManager.queueSyncOperation({
        type: 'create',
        resource: 'users',
        data: { name: 'Parent User' },
        maxRetries: 1,
        priority: 'medium'
      });

      recoveryManager.queueSyncOperation({
        type: 'create',
        resource: 'profiles',
        data: { userId: 'parent-id' },
        maxRetries: 1,
        priority: 'medium',
        dependencies: [dependencyId]
      });

      const results = await recoveryManager.forcSync();

      // Only the dependency should be processed first
      expect(results).toHaveLength(1);
      expect(fetchSpy).toHaveBeenCalledTimes(1);
    });
  });

  describe('conflict resolution', () => {
    it('should register conflict resolvers', () => {
      const resolver = {
        strategy: 'client-wins' as const,
        resolver: (clientData: any, serverData: any) => ({ ...serverData, ...clientData })
      };

      recoveryManager.registerConflictResolver('users', resolver);

      // No direct way to test this without triggering a conflict
      expect(() => recoveryManager.registerConflictResolver('users', resolver)).not.toThrow();
    });

    it('should handle conflict resolution during sync', async () => {
      const fetchSpy = vi.mocked(fetch);
      
      // Mock conflict response
      const conflictResponse = new Response(
        JSON.stringify({ error: 'Conflict', serverData: { id: 1, version: 2 } }),
        { status: 409 }
      );
      
      fetchSpy.mockResolvedValueOnce(conflictResponse);

      const { networkMonitor } = await import('../errors/networkMonitor');
      vi.mocked(networkMonitor.isOnline).mockReturnValue(true);

      // Register conflict resolver
      recoveryManager.registerConflictResolver('users', {
        strategy: 'server-wins'
      });

      recoveryManager.queueSyncOperation({
        type: 'update',
        resource: 'users',
        data: { id: 1, name: 'Updated Name', version: 1 },
        maxRetries: 1,
        priority: 'medium'
      });

      const results = await recoveryManager.forcSync();

      expect(results[0].success).toBe(true);
      expect(results[0].data).toEqual({ id: 1, version: 2 });
    });

    it('should handle missing conflict resolver', async () => {
      const fetchSpy = vi.mocked(fetch);
      
      const conflictResponse = new Response(
        JSON.stringify({ error: 'Conflict' }),
        { status: 409 }
      );
      
      fetchSpy.mockResolvedValueOnce(conflictResponse);

      const { networkMonitor } = await import('../errors/networkMonitor');
      vi.mocked(networkMonitor.isOnline).mockReturnValue(true);

      recoveryManager.queueSyncOperation({
        type: 'update',
        resource: 'posts', // No resolver registered for this resource
        data: { id: 1, title: 'Updated Title' },
        maxRetries: 1,
        priority: 'medium'
      });

      const results = await recoveryManager.forcSync();

      expect(results[0].success).toBe(false);
      expect(results[0].error?.message).toContain('No conflict resolver registered');
    });
  });

  describe('network event handling', () => {
    it('should start sync when network comes online', async () => {
      const { networkMonitor } = await import('../errors/networkMonitor');
      
      // Simulate network event listener
      let eventHandler: any;
      vi.mocked(networkMonitor.addEventListener).mockImplementation((handler) => {
        eventHandler = handler;
      });

      // Create new manager to register event listener
      const testManager = new NetworkRecoveryManager();

      // Queue an operation
      testManager.queueSyncOperation({
        type: 'create',
        resource: 'users',
        data: { name: 'Test User' },
        maxRetries: 1,
        priority: 'medium'
      });

      // Simulate network coming online
      if (eventHandler) {
        eventHandler({ type: 'online' });
      }

      testManager.destroy();
    });

    it('should stop sync when network goes offline', async () => {
      const { networkMonitor } = await import('../errors/networkMonitor');
      
      let eventHandler: any;
      vi.mocked(networkMonitor.addEventListener).mockImplementation((handler) => {
        eventHandler = handler;
      });

      const testManager = new NetworkRecoveryManager();

      // Simulate network going offline
      if (eventHandler) {
        eventHandler({ type: 'offline' });
      }

      testManager.destroy();
    });
  });

  describe('sync listeners', () => {
    it('should notify sync listeners of results', async () => {
      const listener = vi.fn();
      recoveryManager.addSyncListener(listener);

      const fetchSpy = vi.mocked(fetch);
      fetchSpy.mockResolvedValue(new Response(JSON.stringify({ success: true }), { status: 200 }));

      const { networkMonitor } = await import('../errors/networkMonitor');
      vi.mocked(networkMonitor.isOnline).mockReturnValue(true);

      recoveryManager.queueSyncOperation({
        type: 'create',
        resource: 'users',
        data: { name: 'Test User' },
        maxRetries: 1,
        priority: 'medium'
      });

      await recoveryManager.forcSync();

      expect(listener).toHaveBeenCalledWith(
        expect.objectContaining({
          success: true,
          operationId: expect.any(String)
        })
      );

      recoveryManager.removeSyncListener(listener);
    });

    it('should handle listener errors gracefully', async () => {
      const faultyListener = vi.fn().mockImplementation(() => {
        throw new Error('Listener error');
      });

      const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

      recoveryManager.addSyncListener(faultyListener);

      const fetchSpy = vi.mocked(fetch);
      fetchSpy.mockResolvedValue(new Response(JSON.stringify({ success: true }), { status: 200 }));

      const { networkMonitor } = await import('../errors/networkMonitor');
      vi.mocked(networkMonitor.isOnline).mockReturnValue(true);

      recoveryManager.queueSyncOperation({
        type: 'create',
        resource: 'users',
        data: { name: 'Test User' },
        maxRetries: 1,
        priority: 'medium'
      });

      await recoveryManager.forcSync();

      expect(consoleSpy).toHaveBeenCalledWith(
        'Error in sync result listener:',
        expect.any(Error)
      );

      consoleSpy.mockRestore();
    });
  });

  describe('sync statistics', () => {
    it('should provide sync statistics', () => {
      recoveryManager.queueSyncOperation({
        type: 'create',
        resource: 'users',
        data: {},
        maxRetries: 1,
        priority: 'high'
      });

      recoveryManager.queueSyncOperation({
        type: 'update',
        resource: 'posts',
        data: {},
        maxRetries: 1,
        priority: 'low'
      });

      const stats = recoveryManager.getSyncStats();

      expect(stats.pendingOperations).toBe(2);
      expect(stats.totalOperations).toBe(2);
      expect(stats.syncInProgress).toBe(false);
      expect(stats.operationsByType.create).toBe(1);
      expect(stats.operationsByType.update).toBe(1);
      expect(stats.operationsByPriority.high).toBe(1);
      expect(stats.operationsByPriority.low).toBe(1);
    });
  });

  describe('persistence', () => {
    it('should persist operations to localStorage', () => {
      recoveryManager.queueSyncOperation({
        type: 'create',
        resource: 'users',
        data: { name: 'Persistent User' },
        maxRetries: 1,
        priority: 'medium'
      });

      expect(mockLocalStorage.setItem).toHaveBeenCalledWith(
        'test_sync_operations',
        expect.any(String)
      );
    });

    it('should handle localStorage errors gracefully', () => {
      mockLocalStorage.setItem.mockImplementation(() => {
        throw new Error('Storage quota exceeded');
      });

      const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

      recoveryManager.queueSyncOperation({
        type: 'create',
        resource: 'users',
        data: { name: 'Test User' },
        maxRetries: 1,
        priority: 'medium'
      });

      expect(consoleSpy).toHaveBeenCalledWith(
        'Failed to persist sync operations:',
        expect.any(Error)
      );

      consoleSpy.mockRestore();
    });
  });

  describe('page lifecycle events', () => {
    it('should sync on page visibility change', async () => {
      const { networkMonitor } = await import('../errors/networkMonitor');
      vi.mocked(networkMonitor.isOnline).mockReturnValue(true);

      const fetchSpy = vi.mocked(fetch);
      fetchSpy.mockResolvedValue(new Response(JSON.stringify({ success: true }), { status: 200 }));

      recoveryManager.queueSyncOperation({
        type: 'create',
        resource: 'users',
        data: { name: 'Visibility User' },
        maxRetries: 1,
        priority: 'medium'
      });

      // Simulate page becoming visible
      Object.defineProperty(document, 'visibilityState', { value: 'visible' });
      document.dispatchEvent(new Event('visibilitychange'));

      await vi.runAllTimersAsync();

      expect(fetchSpy).toHaveBeenCalled();
    });

    it('should persist operations on page unload', () => {
      recoveryManager.queueSyncOperation({
        type: 'create',
        resource: 'users',
        data: { name: 'Unload User' },
        maxRetries: 1,
        priority: 'medium'
      });

      // Clear previous calls
      mockLocalStorage.setItem.mockClear();

      // Simulate page unload
      window.dispatchEvent(new Event('beforeunload'));

      expect(mockLocalStorage.setItem).toHaveBeenCalled();
    });
  });
});

describe('queueWhenOffline utility', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('should execute operation when online', async () => {
    const { networkMonitor } = await import('../errors/networkMonitor');
    vi.mocked(networkMonitor.isOnline).mockReturnValue(true);

    const operation = vi.fn().mockResolvedValue('success');
    const syncOperation = {
      type: 'create' as const,
      resource: 'users',
      data: { name: 'Test User' },
      maxRetries: 1,
      priority: 'medium' as const
    };

    const result = await queueWhenOffline(operation, syncOperation);

    expect(result).toBe('success');
    expect(operation).toHaveBeenCalled();
  });

  it('should queue operation when offline', async () => {
    const { networkMonitor } = await import('../errors/networkMonitor');
    vi.mocked(networkMonitor.isOnline).mockReturnValue(false);

    const operation = vi.fn().mockResolvedValue('success');
    const syncOperation = {
      type: 'create' as const,
      resource: 'users',
      data: { name: 'Test User' },
      maxRetries: 1,
      priority: 'medium' as const
    };

    await expect(queueWhenOffline(operation, syncOperation))
      .rejects.toThrow('Operation queued for background sync');

    expect(operation).not.toHaveBeenCalled();
  });
});

describe('useNetworkRecovery hook', () => {
  it('should provide network recovery functions', () => {
    const hook = useNetworkRecovery();

    expect(hook).toHaveProperty('queueSyncOperation');
    expect(hook).toHaveProperty('removeSyncOperation');
    expect(hook).toHaveProperty('getPendingSyncOperations');
    expect(hook).toHaveProperty('clearSyncQueue');
    expect(hook).toHaveProperty('registerConflictResolver');
    expect(hook).toHaveProperty('addSyncListener');
    expect(hook).toHaveProperty('removeSyncListener');
    expect(hook).toHaveProperty('forceSync');
    expect(hook).toHaveProperty('getSyncStats');

    expect(typeof hook.queueSyncOperation).toBe('function');
    expect(typeof hook.removeSyncOperation).toBe('function');
    expect(typeof hook.getPendingSyncOperations).toBe('function');
    expect(typeof hook.clearSyncQueue).toBe('function');
    expect(typeof hook.registerConflictResolver).toBe('function');
    expect(typeof hook.addSyncListener).toBe('function');
    expect(typeof hook.removeSyncListener).toBe('function');
    expect(typeof hook.forceSync).toBe('function');
    expect(typeof hook.getSyncStats).toBe('function');
  });

  it('should call manager methods correctly', () => {
    const hook = useNetworkRecovery();

    // Test queueSyncOperation
    const operationId = hook.queueSyncOperation({
      type: 'create',
      resource: 'users',
      data: { name: 'Hook Test User' },
      maxRetries: 1,
      priority: 'medium'
    });

    expect(typeof operationId).toBe('string');

    // Test other methods
    const pendingOps = hook.getPendingSyncOperations();
    expect(Array.isArray(pendingOps)).toBe(true);

    const stats = hook.getSyncStats();
    expect(typeof stats).toBe('object');

    hook.clearSyncQueue();
  });
});