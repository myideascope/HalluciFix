/**
 * Rate Limiter Implementation
 * Implements token bucket algorithm for API rate limiting
 */

export interface RateLimitConfig {
  requestsPerMinute?: number;
  requestsPerHour?: number;
  requestsPerDay?: number;
  tokensPerMinute?: number;
  tokensPerHour?: number;
  tokensPerDay?: number;
}

export interface RateLimitStatus {
  allowed: boolean;
  retryAfter?: number; // milliseconds to wait before retry
  remaining: {
    requests: number;
    tokens: number;
  };
  resetTime: {
    requests: Date;
    tokens: Date;
  };
}

interface TokenBucket {
  tokens: number;
  lastRefill: number;
  capacity: number;
  refillRate: number; // tokens per millisecond
}

export class RateLimiter {
  private requestBuckets: Map<string, TokenBucket> = new Map();
  private tokenBuckets: Map<string, TokenBucket> = new Map();
  private config: Required<RateLimitConfig>;

  constructor(config: RateLimitConfig) {
    // Set defaults for missing values
    this.config = {
      requestsPerMinute: config.requestsPerMinute || 60,
      requestsPerHour: config.requestsPerHour || 3000,
      requestsPerDay: config.requestsPerDay || 10000,
      tokensPerMinute: config.tokensPerMinute || 150000,
      tokensPerHour: config.tokensPerHour || 1000000,
      tokensPerDay: config.tokensPerDay || 10000000
    };

    this.initializeBuckets();
  }

  /**
   * Check if a request is allowed and consume tokens if so
   */
  checkRequest(requestTokens: number = 1): RateLimitStatus {
    const now = Date.now();
    
    // Refill all buckets
    this.refillBuckets(now);
    
    // Check if request is allowed for all time windows
    const requestCheck = this.checkRequestLimits();
    const tokenCheck = this.checkTokenLimits(requestTokens);
    
    if (!requestCheck.allowed || !tokenCheck.allowed) {
      return {
        allowed: false,
        retryAfter: Math.max(requestCheck.retryAfter || 0, tokenCheck.retryAfter || 0),
        remaining: {
          requests: Math.min(...Array.from(this.requestBuckets.values()).map(b => Math.floor(b.tokens))),
          tokens: Math.min(...Array.from(this.tokenBuckets.values()).map(b => Math.floor(b.tokens)))
        },
        resetTime: {
          requests: new Date(now + (requestCheck.retryAfter || 0)),
          tokens: new Date(now + (tokenCheck.retryAfter || 0))
        }
      };
    }
    
    // Consume tokens from all buckets
    this.consumeRequestTokens();
    this.consumeTokens(requestTokens);
    
    return {
      allowed: true,
      remaining: {
        requests: Math.min(...Array.from(this.requestBuckets.values()).map(b => Math.floor(b.tokens))),
        tokens: Math.min(...Array.from(this.tokenBuckets.values()).map(b => Math.floor(b.tokens)))
      },
      resetTime: {
        requests: new Date(now + 60000), // Next minute
        tokens: new Date(now + 60000)
      }
    };
  }

  /**
   * Get current rate limit status without consuming tokens
   */
  getStatus(): RateLimitStatus {
    const now = Date.now();
    this.refillBuckets(now);
    
    return {
      allowed: true,
      remaining: {
        requests: Math.min(...Array.from(this.requestBuckets.values()).map(b => Math.floor(b.tokens))),
        tokens: Math.min(...Array.from(this.tokenBuckets.values()).map(b => Math.floor(b.tokens)))
      },
      resetTime: {
        requests: new Date(now + 60000),
        tokens: new Date(now + 60000)
      }
    };
  }

  /**
   * Reset all rate limit buckets
   */
  reset(): void {
    this.requestBuckets.clear();
    this.tokenBuckets.clear();
    this.initializeBuckets();
  }

  private initializeBuckets(): void {
    const now = Date.now();
    
    // Initialize request buckets
    this.requestBuckets.set('minute', {
      tokens: this.config.requestsPerMinute,
      lastRefill: now,
      capacity: this.config.requestsPerMinute,
      refillRate: this.config.requestsPerMinute / 60000 // per millisecond
    });
    
    this.requestBuckets.set('hour', {
      tokens: this.config.requestsPerHour,
      lastRefill: now,
      capacity: this.config.requestsPerHour,
      refillRate: this.config.requestsPerHour / 3600000 // per millisecond
    });
    
    this.requestBuckets.set('day', {
      tokens: this.config.requestsPerDay,
      lastRefill: now,
      capacity: this.config.requestsPerDay,
      refillRate: this.config.requestsPerDay / 86400000 // per millisecond
    });
    
    // Initialize token buckets
    this.tokenBuckets.set('minute', {
      tokens: this.config.tokensPerMinute,
      lastRefill: now,
      capacity: this.config.tokensPerMinute,
      refillRate: this.config.tokensPerMinute / 60000
    });
    
    this.tokenBuckets.set('hour', {
      tokens: this.config.tokensPerHour,
      lastRefill: now,
      capacity: this.config.tokensPerHour,
      refillRate: this.config.tokensPerHour / 3600000
    });
    
    this.tokenBuckets.set('day', {
      tokens: this.config.tokensPerDay,
      lastRefill: now,
      capacity: this.config.tokensPerDay,
      refillRate: this.config.tokensPerDay / 86400000
    });
  }

  private refillBuckets(now: number): void {
    // Refill request buckets
    for (const bucket of this.requestBuckets.values()) {
      this.refillBucket(bucket, now);
    }
    
    // Refill token buckets
    for (const bucket of this.tokenBuckets.values()) {
      this.refillBucket(bucket, now);
    }
  }

  private refillBucket(bucket: TokenBucket, now: number): void {
    const timePassed = now - bucket.lastRefill;
    const tokensToAdd = timePassed * bucket.refillRate;
    
    bucket.tokens = Math.min(bucket.capacity, bucket.tokens + tokensToAdd);
    bucket.lastRefill = now;
  }

  private checkRequestLimits(): { allowed: boolean; retryAfter?: number } {
    for (const [period, bucket] of this.requestBuckets.entries()) {
      if (bucket.tokens < 1) {
        const timeToRefill = this.getTimeToRefill(bucket, 1);
        return {
          allowed: false,
          retryAfter: timeToRefill
        };
      }
    }
    
    return { allowed: true };
  }

  private checkTokenLimits(requestTokens: number): { allowed: boolean; retryAfter?: number } {
    for (const [period, bucket] of this.tokenBuckets.entries()) {
      if (bucket.tokens < requestTokens) {
        const timeToRefill = this.getTimeToRefill(bucket, requestTokens);
        return {
          allowed: false,
          retryAfter: timeToRefill
        };
      }
    }
    
    return { allowed: true };
  }

  private getTimeToRefill(bucket: TokenBucket, tokensNeeded: number): number {
    const tokensShortfall = tokensNeeded - bucket.tokens;
    return Math.ceil(tokensShortfall / bucket.refillRate);
  }

  private consumeRequestTokens(): void {
    for (const bucket of this.requestBuckets.values()) {
      bucket.tokens = Math.max(0, bucket.tokens - 1);
    }
  }

  private consumeTokens(amount: number): void {
    for (const bucket of this.tokenBuckets.values()) {
      bucket.tokens = Math.max(0, bucket.tokens - amount);
    }
  }
}