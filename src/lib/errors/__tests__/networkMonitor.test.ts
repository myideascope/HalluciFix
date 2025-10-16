/**
 * Tests for network connectivity monitoring and error handling
 */

import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';
import { NetworkMonitor, NetworkEventType, executeWithNetworkHandling, waitForConnection } from '../networkMonitor';
import { ErrorType } from '../types';

// Mock navigator.onLine
Object.defineProperty(navigator, 'onLine', {
  writable: true,
  value: true
});

// Mock window events
const mockAddEventListener = vi.fn();
const mockRemoveEventListener = vi.fn();

Object.defineProperty(window, 'addEventListener', {
  writable: true,
  value: mockAddEventListener
});

Object.defineProperty(window, 'removeEventListener', {
  writable: true,
  value: mockRemoveEventListener
});

// Mock fetch
global.fetch = vi.fn();

describe('NetworkMonitor', () => {
  let networkMonitor: NetworkMonitor;

  beforeEach(() => {
    vi.clearAllMocks();
    navigator.onLine = true;
    networkMonitor = new NetworkMonitor({
      connectionCheckInterval: 0 // Disable automatic checking for tests
    });
  });

  afterEach(() => {
    networkMonitor.destroy();
  });

  describe('Network Status Detection', () => {
    it('should detect online status correctly', () => {
      navigator.onLine = true;
      const monitor = new NetworkMonitor();
      
      expect(monitor.isOnline()).toBe(true);
      expect(monitor.getNetworkStatus().isOnline).toBe(true);
      
      monitor.destroy();
    });

    it('should detect offline status correctly', () => {
      navigator.onLine = false;
      const monitor = new NetworkMonitor();
      
      expect(monitor.isOnline()).toBe(false);
      expect(monitor.getNetworkStatus().isOnline).toBe(false);
      
      monitor.destroy();
    });

    it('should set up event listeners for online/offline events', () => {
      new NetworkMonitor();
      
      expect(mockAddEventListener).toHaveBeenCalledWith('online', expect.any(Function));
      expect(mockAddEventListener).toHaveBeenCalledWith('offline', expect.any(Function));
    });
  });

  describe('Network Event Handling', () => {
    it('should emit online event when connection is restored', () => {
      const listener = vi.fn();
      networkMonitor.addEventListener(listener);
      
      // Simulate going online
      navigator.onLine = true;
      const onlineHandler = mockAddEventListener.mock.calls.find(call => call[0] === 'online')?.[1];
      onlineHandler?.();
      
      expect(listener).toHaveBeenCalledWith({
        type: NetworkEventType.ONLINE,
        status: expect.objectContaining({ isOnline: true }),
        timestamp: expect.any(String)
      });
    });

    it('should emit offline event when connection is lost', () => {
      const listener = vi.fn();
      networkMonitor.addEventListener(listener);
      
      // Simulate going offline
      navigator.onLine = false;
      const offlineHandler = mockAddEventListener.mock.calls.find(call => call[0] === 'offline')?.[1];
      offlineHandler?.();
      
      expect(listener).toHaveBeenCalledWith({
        type: NetworkEventType.OFFLINE,
        status: expect.objectContaining({ isOnline: false }),
        timestamp: expect.any(String)
      });
    });

    it('should remove event listeners correctly', () => {
      const listener = vi.fn();
      networkMonitor.addEventListener(listener);
      networkMonitor.removeEventListener(listener);
      
      // Simulate event
      const onlineHandler = mockAddEventListener.mock.calls.find(call => call[0] === 'online')?.[1];
      onlineHandler?.();
      
      expect(listener).not.toHaveBeenCalled();
    });
  });

  describe('Operation Queue Management', () => {
    it('should queue operations when offline queue is enabled', () => {
      const operation = vi.fn().mockResolvedValue('result');
      
      const operationId = networkMonitor.queueOperation(operation, { priority: 'high' });
      
      expect(operationId).toBeDefined();
      expect(networkMonitor.getQueuedOperations()).toHaveLength(1);
      expect(networkMonitor.getQueuedOperations()[0].priority).toBe('high');
    });

    it('should maintain priority order in queue', () => {
      const op1 = vi.fn().mockResolvedValue('1');
      const op2 = vi.fn().mockResolvedValue('2');
      const op3 = vi.fn().mockResolvedValue('3');
      
      networkMonitor.queueOperation(op1, { priority: 'low' });
      networkMonitor.queueOperation(op2, { priority: 'high' });
      networkMonitor.queueOperation(op3, { priority: 'medium' });
      
      const queue = networkMonitor.getQueuedOperations();
      expect(queue[0].priority).toBe('high');
      expect(queue[1].priority).toBe('medium');
      expect(queue[2].priority).toBe('low');
    });

    it('should remove operations from queue', () => {
      const operation = vi.fn().mockResolvedValue('result');
      
      const operationId = networkMonitor.queueOperation(operation);
      expect(networkMonitor.getQueuedOperations()).toHaveLength(1);
      
      const removed = networkMonitor.removeQueuedOperation(operationId);
      expect(removed).toBe(true);
      expect(networkMonitor.getQueuedOperations()).toHaveLength(0);
    });

    it('should clear entire queue', () => {
      const op1 = vi.fn().mockResolvedValue('1');
      const op2 = vi.fn().mockResolvedValue('2');
      
      networkMonitor.queueOperation(op1);
      networkMonitor.queueOperation(op2);
      expect(networkMonitor.getQueuedOperations()).toHaveLength(2);
      
      networkMonitor.clearQueue();
      expect(networkMonitor.getQueuedOperations()).toHaveLength(0);
    });

    it('should respect maximum queue size', () => {
      const monitor = new NetworkMonitor({ maxQueueSize: 2 });
      
      const op1 = vi.fn().mockResolvedValue('1');
      const op2 = vi.fn().mockResolvedValue('2');
      const op3 = vi.fn().mockResolvedValue('3');
      
      monitor.queueOperation(op1);
      monitor.queueOperation(op2);
      monitor.queueOperation(op3); // Should remove first operation
      
      expect(monitor.getQueuedOperations()).toHaveLength(2);
      
      monitor.destroy();
    });
  });

  describe('Network Error Handling', () => {
    it('should execute operations successfully when online', async () => {
      navigator.onLine = true;
      const operation = vi.fn().mockResolvedValue('success');
      
      const result = await networkMonitor.executeWithNetworkHandling(operation);
      
      expect(result).toBe('success');
      expect(operation).toHaveBeenCalledTimes(1);
    });

    it('should throw offline error when offline and queuing disabled', async () => {
      navigator.onLine = false;
      const operation = vi.fn().mockResolvedValue('success');
      
      await expect(
        networkMonitor.executeWithNetworkHandling(operation, { queueOnOffline: false })
      ).rejects.toMatchObject({
        type: ErrorType.CONNECTIVITY,
        message: 'No internet connection available'
      });
      
      expect(operation).not.toHaveBeenCalled();
    });

    it('should queue operation when offline and queuing enabled', async () => {
      navigator.onLine = false;
      const operation = vi.fn().mockResolvedValue('success');
      
      await expect(
        networkMonitor.executeWithNetworkHandling(operation, { queueOnOffline: true })
      ).rejects.toMatchObject({
        type: ErrorType.CONNECTIVITY
      });
      
      expect(networkMonitor.getQueuedOperations()).toHaveLength(1);
    });

    it('should handle timeout errors', async () => {
      navigator.onLine = true;
      const operation = vi.fn().mockImplementation(() => 
        new Promise(resolve => setTimeout(resolve, 2000))
      );
      
      await expect(
        networkMonitor.executeWithNetworkHandling(operation, { timeout: 100 })
      ).rejects.toThrow('Operation timeout');
    });
  });

  describe('Connection Waiting', () => {
    it('should resolve immediately if already online', async () => {
      navigator.onLine = true;
      
      const startTime = Date.now();
      await networkMonitor.waitForConnection();
      const endTime = Date.now();
      
      expect(endTime - startTime).toBeLessThan(100);
    });

    it('should wait for connection and resolve when online', async () => {
      navigator.onLine = false;
      
      const waitPromise = networkMonitor.waitForConnection();
      
      // Simulate going online after a delay
      setTimeout(() => {
        navigator.onLine = true;
        const onlineHandler = mockAddEventListener.mock.calls.find(call => call[0] === 'online')?.[1];
        onlineHandler?.();
      }, 100);
      
      await expect(waitPromise).resolves.toBeUndefined();
    });

    it('should timeout if connection is not restored', async () => {
      navigator.onLine = false;
      
      await expect(
        networkMonitor.waitForConnection(100)
      ).rejects.toThrow('Timeout waiting for network connection');
    });
  });

  describe('Convenience Functions', () => {
    it('should work with executeWithNetworkHandling function', async () => {
      navigator.onLine = true;
      const operation = vi.fn().mockResolvedValue('success');
      
      const result = await executeWithNetworkHandling(operation);
      
      expect(result).toBe('success');
      expect(operation).toHaveBeenCalledTimes(1);
    });

    it('should work with waitForConnection function', async () => {
      navigator.onLine = true;
      
      await expect(waitForConnection()).resolves.toBeUndefined();
    });
  });

  describe('Cleanup', () => {
    it('should clean up resources when destroyed', () => {
      const monitor = new NetworkMonitor();
      
      monitor.destroy();
      
      expect(mockRemoveEventListener).toHaveBeenCalledWith('online', expect.any(Function));
      expect(mockRemoveEventListener).toHaveBeenCalledWith('offline', expect.any(Function));
    });

    it('should clear queue when destroyed', () => {
      const operation = vi.fn().mockResolvedValue('result');
      
      networkMonitor.queueOperation(operation);
      expect(networkMonitor.getQueuedOperations()).toHaveLength(1);
      
      networkMonitor.destroy();
      expect(networkMonitor.getQueuedOperations()).toHaveLength(0);
    });
  });
});