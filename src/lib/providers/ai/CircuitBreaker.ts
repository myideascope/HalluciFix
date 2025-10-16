/**
 * Circuit Breaker Implementation
 * Prevents cascading failures by temporarily blocking requests when error rate is high
 */

export enum CircuitBreakerState {
  CLOSED = 'closed',     // Normal operation
  OPEN = 'open',         // Blocking requests
  HALF_OPEN = 'half_open' // Testing if service recovered
}

export interface CircuitBreakerConfig {
  failureThreshold: number;      // Number of failures to trigger open state
  recoveryTimeout: number;       // Time to wait before trying half-open (ms)
  successThreshold: number;      // Successes needed in half-open to close
  monitoringWindow: number;      // Time window for failure counting (ms)
}

export interface CircuitBreakerMetrics {
  state: CircuitBreakerState;
  failureCount: number;
  successCount: number;
  lastFailureTime?: number;
  lastSuccessTime?: number;
  totalRequests: number;
  totalFailures: number;
  totalSuccesses: number;
  stateChanges: number;
}

interface RequestRecord {
  timestamp: number;
  success: boolean;
}

export class CircuitBreaker {
  private state: CircuitBreakerState = CircuitBreakerState.CLOSED;
  private failureCount = 0;
  private successCount = 0;
  private lastFailureTime?: number;
  private lastSuccessTime?: number;
  private stateChangeTime = Date.now();
  private requestHistory: RequestRecord[] = [];
  private totalRequests = 0;
  private totalFailures = 0;
  private totalSuccesses = 0;
  private stateChanges = 0;

  constructor(private config: CircuitBreakerConfig) {}

  /**
   * Execute a function with circuit breaker protection
   */
  async execute<T>(operation: () => Promise<T>, operationName: string = 'operation'): Promise<T> {
    // Check if circuit breaker should allow the request
    if (!this.canExecute()) {
      throw new Error(`Circuit breaker is ${this.state}. Operation blocked: ${operationName}`);
    }

    const startTime = Date.now();
    this.totalRequests++;

    try {
      const result = await operation();
      this.onSuccess();
      return result;
    } catch (error) {
      this.onFailure();
      throw error;
    }
  }

  /**
   * Check if the circuit breaker allows execution
   */
  canExecute(): boolean {
    const now = Date.now();

    switch (this.state) {
      case CircuitBreakerState.CLOSED:
        return true;

      case CircuitBreakerState.OPEN:
        // Check if recovery timeout has passed
        if (now - this.stateChangeTime >= this.config.recoveryTimeout) {
          this.setState(CircuitBreakerState.HALF_OPEN);
          return true;
        }
        return false;

      case CircuitBreakerState.HALF_OPEN:
        return true;

      default:
        return false;
    }
  }

  /**
   * Get current circuit breaker metrics
   */
  getMetrics(): CircuitBreakerMetrics {
    this.cleanupOldRecords();
    
    return {
      state: this.state,
      failureCount: this.failureCount,
      successCount: this.successCount,
      lastFailureTime: this.lastFailureTime,
      lastSuccessTime: this.lastSuccessTime,
      totalRequests: this.totalRequests,
      totalFailures: this.totalFailures,
      totalSuccesses: this.totalSuccesses,
      stateChanges: this.stateChanges
    };
  }

  /**
   * Reset the circuit breaker to closed state
   */
  reset(): void {
    this.state = CircuitBreakerState.CLOSED;
    this.failureCount = 0;
    this.successCount = 0;
    this.lastFailureTime = undefined;
    this.lastSuccessTime = undefined;
    this.stateChangeTime = Date.now();
    this.requestHistory = [];
    this.stateChanges++;
  }

  /**
   * Force the circuit breaker to a specific state
   */
  forceState(state: CircuitBreakerState): void {
    if (this.state !== state) {
      this.setState(state);
    }
  }

  /**
   * Get failure rate in the current monitoring window
   */
  getFailureRate(): number {
    this.cleanupOldRecords();
    
    if (this.requestHistory.length === 0) {
      return 0;
    }

    const failures = this.requestHistory.filter(r => !r.success).length;
    return failures / this.requestHistory.length;
  }

  private onSuccess(): void {
    this.lastSuccessTime = Date.now();
    this.totalSuccesses++;
    this.recordRequest(true);

    switch (this.state) {
      case CircuitBreakerState.CLOSED:
        // Reset failure count on success
        this.failureCount = 0;
        break;

      case CircuitBreakerState.HALF_OPEN:
        this.successCount++;
        if (this.successCount >= this.config.successThreshold) {
          this.setState(CircuitBreakerState.CLOSED);
        }
        break;
    }
  }

  private onFailure(): void {
    this.lastFailureTime = Date.now();
    this.totalFailures++;
    this.recordRequest(false);

    switch (this.state) {
      case CircuitBreakerState.CLOSED:
        this.failureCount++;
        if (this.failureCount >= this.config.failureThreshold) {
          this.setState(CircuitBreakerState.OPEN);
        }
        break;

      case CircuitBreakerState.HALF_OPEN:
        // Any failure in half-open state goes back to open
        this.setState(CircuitBreakerState.OPEN);
        break;
    }
  }

  private setState(newState: CircuitBreakerState): void {
    if (this.state !== newState) {
      const oldState = this.state;
      this.state = newState;
      this.stateChangeTime = Date.now();
      this.stateChanges++;

      // Reset counters based on new state
      switch (newState) {
        case CircuitBreakerState.CLOSED:
          this.failureCount = 0;
          this.successCount = 0;
          break;

        case CircuitBreakerState.OPEN:
          this.successCount = 0;
          break;

        case CircuitBreakerState.HALF_OPEN:
          this.failureCount = 0;
          this.successCount = 0;
          break;
      }

      console.log(`Circuit breaker state changed: ${oldState} -> ${newState}`);
    }
  }

  private recordRequest(success: boolean): void {
    const now = Date.now();
    this.requestHistory.push({ timestamp: now, success });
    this.cleanupOldRecords();
  }

  private cleanupOldRecords(): void {
    const cutoff = Date.now() - this.config.monitoringWindow;
    this.requestHistory = this.requestHistory.filter(r => r.timestamp >= cutoff);
  }
}