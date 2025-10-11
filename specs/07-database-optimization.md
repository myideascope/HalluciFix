# Spec: Database Optimization and Indexing

**Priority:** Medium (P3)  
**Estimated Effort:** 1-2 weeks  
**Dependencies:** Core functionality stable, performance testing setup

## Overview

Optimize database performance through proper indexing, query optimization, and schema improvements to support large-scale usage and ensure fast response times for all database operations.

## Current State

- Basic Supabase schema with some migrations
- No performance optimization or indexing strategy
- Potential N+1 query problems in components
- No query performance monitoring
- Missing database constraints and relationships

## Requirements

### 1. Database Schema Optimization

**Acceptance Criteria:**
- [ ] All tables have proper primary keys and foreign key constraints
- [ ] Appropriate indexes on frequently queried columns
- [ ] Optimized data types for storage efficiency
- [ ] Proper normalization without over-normalization
- [ ] Database constraints for data integrity

**Technical Details:**
- Review and optimize all table schemas
- Add composite indexes for complex queries
- Implement proper foreign key relationships
- Add check constraints for data validation
- Optimize column data types

### 2. Query Performance Optimization

**Acceptance Criteria:**
- [ ] All queries execute in < 100ms (95th percentile)
- [ ] Eliminate N+1 query problems
- [ ] Implement query result caching where appropriate
- [ ] Optimize complex analytical queries
- [ ] Add query performance monitoring

**Technical Details:**
- Analyze slow queries using Supabase performance insights
- Implement query batching and optimization
- Add database-level caching strategies
- Create materialized views for complex aggregations
- Implement connection pooling optimization

### 3. Indexing Strategy

**Acceptance Criteria:**
- [ ] Indexes on all foreign key columns
- [ ] Composite indexes for multi-column queries
- [ ] Full-text search indexes where needed
- [ ] Partial indexes for filtered queries
- [ ] Regular index maintenance and monitoring

**Technical Details:**
- Create indexes for user_id, created_at, status columns
- Add composite indexes for dashboard queries
- Implement GIN indexes for JSON columns
- Add text search indexes for content analysis
- Monitor index usage and effectiveness

### 4. Database Monitoring and Alerting

**Acceptance Criteria:**
- [ ] Real-time performance monitoring dashboard
- [ ] Alerts for slow queries and high resource usage
- [ ] Query performance trend analysis
- [ ] Database health checks and diagnostics
- [ ] Automated performance reporting

**Technical Details:**
- Set up Supabase monitoring and alerting
- Implement custom performance metrics
- Create database health check endpoints
- Add query performance logging
- Set up automated performance reports

## Implementation Plan

### Phase 1: Schema Analysis and Optimization (Days 1-3)
1. Audit current database schema
2. Identify missing constraints and relationships
3. Optimize data types and storage
4. Create schema migration plan

### Phase 2: Indexing Implementation (Days 4-6)
1. Analyze query patterns and performance
2. Design comprehensive indexing strategy
3. Implement indexes with minimal downtime
4. Test index effectiveness

### Phase 3: Query Optimization (Days 7-9)
1. Identify and optimize slow queries
2. Implement query caching strategies
3. Eliminate N+1 query problems
4. Add query performance monitoring

### Phase 4: Monitoring and Maintenance (Days 10-14)
1. Set up performance monitoring
2. Create alerting and reporting
3. Implement maintenance procedures
4. Document optimization guidelines

## Database Schema Improvements

### Core Tables Optimization
```sql
-- Users table optimization
CREATE INDEX CONCURRENTLY idx_users_email ON users(email);
CREATE INDEX CONCURRENTLY idx_users_created_at ON users(created_at);
CREATE INDEX CONCURRENTLY idx_users_role_id ON users(role_id);

-- Analysis results optimization
CREATE INDEX CONCURRENTLY idx_analysis_results_user_id ON analysis_results(user_id);
CREATE INDEX CONCURRENTLY idx_analysis_results_created_at ON analysis_results(created_at);
CREATE INDEX CONCURRENTLY idx_analysis_results_risk_level ON analysis_results(risk_level);
CREATE INDEX CONCURRENTLY idx_analysis_results_accuracy ON analysis_results(accuracy);

-- Composite indexes for dashboard queries
CREATE INDEX CONCURRENTLY idx_analysis_results_user_date 
ON analysis_results(user_id, created_at DESC);

CREATE INDEX CONCURRENTLY idx_analysis_results_user_risk 
ON analysis_results(user_id, risk_level, created_at DESC);
```

### Full-Text Search Optimization
```sql
-- Add full-text search for content analysis
ALTER TABLE analysis_results 
ADD COLUMN content_search tsvector 
GENERATED ALWAYS AS (to_tsvector('english', content)) STORED;

CREATE INDEX CONCURRENTLY idx_analysis_results_search 
ON analysis_results USING GIN(content_search);
```

### JSON Column Optimization
```sql
-- Optimize JSON columns with GIN indexes
CREATE INDEX CONCURRENTLY idx_analysis_results_hallucinations 
ON analysis_results USING GIN(hallucinations);

CREATE INDEX CONCURRENTLY idx_analysis_results_metadata 
ON analysis_results USING GIN(metadata);
```

## Query Optimization Patterns

### Efficient Pagination
```typescript
// Before: Inefficient OFFSET pagination
const getAnalysisResults = async (page: number, limit: number) => {
  const offset = (page - 1) * limit;
  return supabase
    .from('analysis_results')
    .select('*')
    .order('created_at', { ascending: false })
    .range(offset, offset + limit - 1);
};

// After: Cursor-based pagination
const getAnalysisResults = async (cursor?: string, limit: number = 20) => {
  let query = supabase
    .from('analysis_results')
    .select('*')
    .order('created_at', { ascending: false })
    .limit(limit);
    
  if (cursor) {
    query = query.lt('created_at', cursor);
  }
  
  return query;
};
```

### Optimized Dashboard Queries
```typescript
// Batch multiple queries efficiently
const getDashboardData = async (userId: string) => {
  const [
    recentResults,
    riskDistribution,
    accuracyTrends
  ] = await Promise.all([
    // Recent analysis results
    supabase
      .from('analysis_results')
      .select('id, accuracy, risk_level, created_at')
      .eq('user_id', userId)
      .order('created_at', { ascending: false })
      .limit(10),
      
    // Risk level distribution (materialized view)
    supabase
      .from('risk_distribution_view')
      .select('*')
      .eq('user_id', userId),
      
    // Accuracy trends (aggregated query)
    supabase
      .rpc('get_accuracy_trends', { user_id: userId, days: 30 })
  ]);
  
  return { recentResults, riskDistribution, accuracyTrends };
};
```

## Performance Monitoring

### Query Performance Tracking
```typescript
// src/lib/queryMonitor.ts
export class QueryMonitor {
  static async trackQuery<T>(
    queryName: string,
    queryFn: () => Promise<T>
  ): Promise<T> {
    const startTime = Date.now();
    
    try {
      const result = await queryFn();
      const duration = Date.now() - startTime;
      
      // Log slow queries
      if (duration > 1000) {
        console.warn(`Slow query detected: ${queryName} took ${duration}ms`);
      }
      
      // Send metrics to monitoring service
      this.recordMetric(queryName, duration, 'success');
      
      return result;
    } catch (error) {
      const duration = Date.now() - startTime;
      this.recordMetric(queryName, duration, 'error');
      throw error;
    }
  }
  
  private static recordMetric(
    queryName: string, 
    duration: number, 
    status: 'success' | 'error'
  ) {
    // Send to analytics/monitoring service
    if (typeof window !== 'undefined' && window.gtag) {
      window.gtag('event', 'database_query', {
        query_name: queryName,
        duration: duration,
        status: status
      });
    }
  }
}
```

### Database Health Checks
```typescript
// src/lib/healthCheck.ts
export const performDatabaseHealthCheck = async () => {
  const checks = [
    {
      name: 'Connection',
      check: async () => {
        const { data, error } = await supabase
          .from('users')
          .select('count')
          .limit(1);
        return !error;
      }
    },
    {
      name: 'Query Performance',
      check: async () => {
        const start = Date.now();
        await supabase
          .from('analysis_results')
          .select('id')
          .limit(1);
        return (Date.now() - start) < 500;
      }
    },
    {
      name: 'Index Usage',
      check: async () => {
        // Check if indexes are being used effectively
        const { data } = await supabase
          .rpc('check_index_usage');
        return data?.index_usage_ratio > 0.8;
      }
    }
  ];
  
  const results = await Promise.all(
    checks.map(async ({ name, check }) => ({
      name,
      status: await check().catch(() => false)
    }))
  );
  
  return results;
};
```

## Caching Strategy

### Application-Level Caching
```typescript
// src/lib/cache.ts
class QueryCache {
  private cache = new Map<string, { data: any; expiry: number }>();
  
  async get<T>(
    key: string,
    queryFn: () => Promise<T>,
    ttlMs: number = 300000 // 5 minutes default
  ): Promise<T> {
    const cached = this.cache.get(key);
    
    if (cached && cached.expiry > Date.now()) {
      return cached.data;
    }
    
    const data = await queryFn();
    this.cache.set(key, {
      data,
      expiry: Date.now() + ttlMs
    });
    
    return data;
  }
  
  invalidate(pattern: string) {
    for (const key of this.cache.keys()) {
      if (key.includes(pattern)) {
        this.cache.delete(key);
      }
    }
  }
}

export const queryCache = new QueryCache();
```

### Database-Level Caching
```sql
-- Create materialized views for expensive aggregations
CREATE MATERIALIZED VIEW user_analytics_summary AS
SELECT 
  user_id,
  COUNT(*) as total_analyses,
  AVG(accuracy) as avg_accuracy,
  COUNT(CASE WHEN risk_level = 'high' THEN 1 END) as high_risk_count,
  MAX(created_at) as last_analysis_date
FROM analysis_results
GROUP BY user_id;

-- Refresh materialized view periodically
CREATE OR REPLACE FUNCTION refresh_analytics_summary()
RETURNS void AS $$
BEGIN
  REFRESH MATERIALIZED VIEW CONCURRENTLY user_analytics_summary;
END;
$$ LANGUAGE plpgsql;

-- Schedule refresh every hour
SELECT cron.schedule('refresh-analytics', '0 * * * *', 'SELECT refresh_analytics_summary();');
```

## Testing Strategy

### Performance Testing
```typescript
// src/test/performance/database.test.ts
describe('Database Performance', () => {
  it('should handle concurrent queries efficiently', async () => {
    const concurrentQueries = Array(50).fill(null).map(() =>
      supabase
        .from('analysis_results')
        .select('*')
        .limit(10)
    );
    
    const start = Date.now();
    await Promise.all(concurrentQueries);
    const duration = Date.now() - start;
    
    expect(duration).toBeLessThan(2000); // Should complete within 2 seconds
  });
  
  it('should use indexes for common queries', async () => {
    // Test that queries use appropriate indexes
    const { data } = await supabase
      .rpc('explain_query', {
        query: 'SELECT * FROM analysis_results WHERE user_id = $1 ORDER BY created_at DESC'
      });
    
    expect(data.plan).toContain('Index Scan');
  });
});
```

### Load Testing
```typescript
// Load test with realistic data volumes
const loadTestDatabase = async () => {
  // Insert test data
  const testUsers = Array(1000).fill(null).map((_, i) => ({
    email: `test${i}@example.com`,
    name: `Test User ${i}`
  }));
  
  const testResults = Array(10000).fill(null).map((_, i) => ({
    user_id: testUsers[i % 1000].id,
    content: `Test content ${i}`,
    accuracy: Math.random() * 100,
    risk_level: ['low', 'medium', 'high'][Math.floor(Math.random() * 3)]
  }));
  
  // Measure insertion performance
  const insertStart = Date.now();
  await supabase.from('analysis_results').insert(testResults);
  const insertDuration = Date.now() - insertStart;
  
  // Measure query performance
  const queryStart = Date.now();
  await supabase
    .from('analysis_results')
    .select('*')
    .order('created_at', { ascending: false })
    .limit(100);
  const queryDuration = Date.now() - queryStart;
  
  return { insertDuration, queryDuration };
};
```

## Success Metrics

### Performance Targets
- [ ] Query response time < 100ms (95th percentile)
- [ ] Database connection time < 50ms
- [ ] Index hit ratio > 95%
- [ ] Cache hit ratio > 80%
- [ ] Zero query timeouts under normal load

### Scalability Targets
- [ ] Support 10,000+ concurrent users
- [ ] Handle 1M+ analysis results efficiently
- [ ] Maintain performance with 100GB+ data
- [ ] Support 1000+ queries per second
- [ ] Zero downtime during maintenance

### Monitoring Targets
- [ ] 100% query performance visibility
- [ ] Automated alerting for performance issues
- [ ] Real-time performance dashboards
- [ ] Historical performance trend analysis
- [ ] Proactive performance optimization recommendations

## Maintenance Procedures

### Regular Maintenance Tasks
```sql
-- Weekly maintenance script
DO $$
BEGIN
  -- Update table statistics
  ANALYZE;
  
  -- Reindex if needed
  REINDEX INDEX CONCURRENTLY IF EXISTS idx_analysis_results_user_date;
  
  -- Clean up old data (if applicable)
  DELETE FROM analysis_results 
  WHERE created_at < NOW() - INTERVAL '2 years';
  
  -- Refresh materialized views
  REFRESH MATERIALIZED VIEW CONCURRENTLY user_analytics_summary;
END $$;
```

### Performance Monitoring Alerts
- Query duration > 1 second
- Database CPU usage > 80%
- Connection pool exhaustion
- Index scan ratio < 90%
- Disk space usage > 85%

## Documentation Requirements

- [ ] Database schema documentation
- [ ] Query optimization guidelines
- [ ] Performance monitoring runbook
- [ ] Maintenance procedures documentation
- [ ] Troubleshooting guide for performance issues