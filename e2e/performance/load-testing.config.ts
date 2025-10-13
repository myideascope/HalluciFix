import { LoadTestConfig } from './utils/load-testing';
import { AlertingConfig } from './utils/performance-alerting';

/**
 * Load testing configuration profiles for different scenarios
 */
export const LOAD_TEST_PROFILES = {
  // Development environment - light testing
  development: {
    light: {
      concurrentUsers: 3,
      testDuration: 20000, // 20 seconds
      rampUpTime: 3000,    // 3 seconds
    },
    moderate: {
      concurrentUsers: 5,
      testDuration: 30000, // 30 seconds
      rampUpTime: 5000,    // 5 seconds
    },
    heavy: {
      concurrentUsers: 8,
      testDuration: 45000, // 45 seconds
      rampUpTime: 8000,    // 8 seconds
    }
  },

  // Staging environment - realistic testing
  staging: {
    light: {
      concurrentUsers: 5,
      testDuration: 30000, // 30 seconds
      rampUpTime: 5000,    // 5 seconds
    },
    moderate: {
      concurrentUsers: 10,
      testDuration: 60000, // 1 minute
      rampUpTime: 10000,   // 10 seconds
    },
    heavy: {
      concurrentUsers: 20,
      testDuration: 90000, // 1.5 minutes
      rampUpTime: 20000,   // 20 seconds
    },
    stress: {
      concurrentUsers: 30,
      testDuration: 120000, // 2 minutes
      rampUpTime: 30000,    // 30 seconds
    }
  },

  // Production environment - comprehensive testing
  production: {
    light: {
      concurrentUsers: 10,
      testDuration: 60000,  // 1 minute
      rampUpTime: 10000,    // 10 seconds
    },
    moderate: {
      concurrentUsers: 25,
      testDuration: 120000, // 2 minutes
      rampUpTime: 25000,    // 25 seconds
    },
    heavy: {
      concurrentUsers: 50,
      testDuration: 180000, // 3 minutes
      rampUpTime: 50000,    // 50 seconds
    },
    stress: {
      concurrentUsers: 100,
      testDuration: 300000, // 5 minutes
      rampUpTime: 60000,    // 1 minute
    },
    endurance: {
      concurrentUsers: 30,
      testDuration: 600000, // 10 minutes
      rampUpTime: 60000,    // 1 minute
    }
  }
};

/**
 * Performance alerting configurations for different environments
 */
export const ALERTING_PROFILES: Record<string, AlertingConfig> = {
  development: {
    enabled: true,
    thresholds: {
      responseTime: {
        warning: 15000,  // 15 seconds (relaxed for dev)
        critical: 30000  // 30 seconds
      },
      errorRate: {
        warning: 30,     // 30% (relaxed for dev)
        critical: 50     // 50%
      },
      throughput: {
        warning: 0.02,   // 0.02 requests/second
        critical: 0.005  // 0.005 requests/second
      },
      coreWebVitals: {
        fcp: { warning: 4000, critical: 6000 },
        lcp: { warning: 5000, critical: 8000 },
        cls: { warning: 0.2, critical: 0.4 }
      },
      concurrentUsers: {
        maxSupported: 15,
        degradationThreshold: 8
      }
    },
    notifications: {
      console: true,
      file: false
    },
    retentionDays: 7
  },

  staging: {
    enabled: true,
    thresholds: {
      responseTime: {
        warning: 10000,  // 10 seconds
        critical: 20000  // 20 seconds
      },
      errorRate: {
        warning: 20,     // 20%
        critical: 35     // 35%
      },
      throughput: {
        warning: 0.03,   // 0.03 requests/second
        critical: 0.01   // 0.01 requests/second
      },
      coreWebVitals: {
        fcp: { warning: 3000, critical: 5000 },
        lcp: { warning: 4000, critical: 6000 },
        cls: { warning: 0.15, critical: 0.3 }
      },
      concurrentUsers: {
        maxSupported: 35,
        degradationThreshold: 20
      }
    },
    notifications: {
      console: true,
      file: true
    },
    retentionDays: 14
  },

  production: {
    enabled: true,
    thresholds: {
      responseTime: {
        warning: 5000,   // 5 seconds
        critical: 15000  // 15 seconds
      },
      errorRate: {
        warning: 10,     // 10%
        critical: 25     // 25%
      },
      throughput: {
        warning: 0.1,    // 0.1 requests/second
        critical: 0.05   // 0.05 requests/second
      },
      coreWebVitals: {
        fcp: { warning: 2000, critical: 4000 },
        lcp: { warning: 2500, critical: 4000 },
        cls: { warning: 0.1, critical: 0.25 }
      },
      concurrentUsers: {
        maxSupported: 100,
        degradationThreshold: 50
      }
    },
    notifications: {
      console: true,
      file: true,
      webhook: process.env.PERFORMANCE_WEBHOOK_URL
    },
    retentionDays: 30
  }
};

/**
 * Get load test configuration based on environment and test type
 */
export function getLoadTestConfig(
  environment: 'development' | 'staging' | 'production',
  testType: 'light' | 'moderate' | 'heavy' | 'stress' | 'endurance'
): Partial<LoadTestConfig> {
  const profile = LOAD_TEST_PROFILES[environment];
  if (!profile || !profile[testType]) {
    throw new Error(`Invalid environment (${environment}) or test type (${testType})`);
  }
  
  return profile[testType];
}

/**
 * Get alerting configuration based on environment
 */
export function getAlertingConfig(
  environment: 'development' | 'staging' | 'production'
): AlertingConfig {
  const config = ALERTING_PROFILES[environment];
  if (!config) {
    throw new Error(`Invalid environment: ${environment}`);
  }
  
  return config;
}

/**
 * Load test scenarios optimized for concurrent user testing
 */
export const CONCURRENT_USER_SCENARIOS = {
  // Realistic user behavior patterns
  realisticMix: [
    { name: 'Basic Analysis', weight: 50 },      // 50% of users
    { name: 'Casual Browser', weight: 25 },     // 25% of users
    { name: 'Power User', weight: 20 },         // 20% of users
    { name: 'Configuration User', weight: 5 }   // 5% of users
  ],

  // Analysis-heavy workload
  analysisHeavy: [
    { name: 'Basic Analysis', weight: 70 },
    { name: 'Power User', weight: 25 },
    { name: 'Casual Browser', weight: 5 }
  ],

  // Browse-heavy workload
  browseHeavy: [
    { name: 'Casual Browser', weight: 60 },
    { name: 'Basic Analysis', weight: 30 },
    { name: 'Configuration User', weight: 10 }
  ],

  // Stress test workload
  stressTest: [
    { name: 'Basic Analysis', weight: 40 },
    { name: 'Power User', weight: 40 },
    { name: 'Casual Browser', weight: 15 },
    { name: 'Configuration User', weight: 5 }
  ]
};

/**
 * Performance benchmarks for different user loads
 */
export const PERFORMANCE_BENCHMARKS = {
  responseTime: {
    excellent: { p50: 2000, p95: 5000, p99: 8000 },
    good: { p50: 5000, p95: 10000, p99: 15000 },
    acceptable: { p50: 8000, p95: 15000, p99: 25000 },
    poor: { p50: 15000, p95: 30000, p99: 60000 }
  },
  
  throughput: {
    excellent: 1.0,   // > 1 req/s
    good: 0.5,        // > 0.5 req/s
    acceptable: 0.1,  // > 0.1 req/s
    poor: 0.05        // > 0.05 req/s
  },
  
  errorRate: {
    excellent: 2,     // < 2%
    good: 5,          // < 5%
    acceptable: 15,   // < 15%
    poor: 30          // < 30%
  },
  
  concurrentUsers: {
    light: { min: 1, max: 10 },
    moderate: { min: 10, max: 25 },
    heavy: { min: 25, max: 50 },
    stress: { min: 50, max: 100 }
  }
};

/**
 * Get current environment from environment variables
 */
export function getCurrentEnvironment(): 'development' | 'staging' | 'production' {
  const env = process.env.NODE_ENV || process.env.ENVIRONMENT || 'development';
  
  switch (env.toLowerCase()) {
    case 'prod':
    case 'production':
      return 'production';
    case 'stage':
    case 'staging':
      return 'staging';
    default:
      return 'development';
  }
}