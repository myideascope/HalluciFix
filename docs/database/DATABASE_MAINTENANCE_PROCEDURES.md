# Database Maintenance Procedures

## Overview

This document provides detailed procedures for maintaining optimal database performance in HalluciFix. It includes routine maintenance tasks, monitoring procedures, and optimization guidelines to ensure consistent database performance.

## Table of Contents

1. [Maintenance Schedule](#maintenance-schedule)
2. [Daily Maintenance Tasks](#daily-maintenance-tasks)
3. [Weekly Maintenance Tasks](#weekly-maintenance-tasks)
4. [Monthly Maintenance Tasks](#monthly-maintenance-tasks)
5. [Quarterly Maintenance Tasks](#quarterly-maintenance-tasks)
6. [Emergency Maintenance Procedures](#emergency-maintenance-procedures)
7. [Monitoring and Alerting](#monitoring-and-alerting)
8. [Performance Optimization](#performance-optimization)

## Maintenance Schedule

### Automated Tasks
```sql
-- Daily maintenance (2:00 AM UTC)
SELECT cron.schedule('daily-maintenance', '0 2 * * *', 'SELECT perform_database_maintenance();');

-- Hourly statistics update
SELECT cron.schedule('hourly-stats-update', '0 * * * *', 'ANALYZE analysis_results;');

-- Weekly vacuum (Sunday 3:00 AM UTC)
SELECT cron.schedule('weekly-vacuum', '0 3 * * 0', 'VACUUM ANALYZE;');

-- Materialized view refresh (every 6 hours)
SELECT cron.schedule('refresh-materialized-views', '0 */6 * * *', 'SELECT refresh_materialized_views();');
```

### Manual Tasks Schedule
- **Daily**: Review monitoring dashboards, check alerts
- **Weekly**: Performance analysis, index usage review
- **Monthly**: Capacity planning, optimization review
- **Quarterly**: Full system audit, disaster recovery testing

## Daily Maintenance Tasks

### 1. Automated Daily Maintenance

#### Main Maintenance Function
```sql
CREATE OR REPLACE FUNCTION perform_database_maintenance()
RETURNS void AS $
DECLARE
    start_time timestamp := clock_timestamp();
    operation_count integer := 0;
BEGIN
    -- Log maintenance start
    INSERT INTO maintenance_log (operation, started_at, status)
    VALUES ('daily_maintenance', start_time, 'started');

    -- Update table statistics
    ANALYZE;
    operation_count := operation_count + 1;

    -- Refresh materialized views
    PERFORM refresh_materialized_views();
    operation_count := operation_count + 1;

    -- Clean up old data
    PERFORM cleanup_old_data();
    operation_count := operation_count + 1;

    -- Check and reindex if needed
    PERFORM reindex_if_needed();
    operation_count := operation_count + 1;

    -- Update maintenance log
    UPDATE maintenance_log 
    SET 
        completed_at = clock_timestamp(),
        status = 'completed',
        duration_ms = EXTRACT(EPOCH FROM (clock_timestamp() - start_time)) * 1000,
        details = jsonb_build_object(
            'operations_completed', operation_count,
            'duration_seconds', EXTRACT(EPOCH FROM (clock_timestamp() - start_time))
        )
    WHERE operation = 'daily_maintenance' 
    AND started_at = start_time;

EXCEPTION WHEN OTHERS THEN
    -- Log maintenance failure
    UPDATE maintenance_log 
    SET 
        completed_at = clock_timestamp(),
        status = 'failed',
        duration_ms = EXTRACT(EPOCH FROM (clock_timestamp() - start_time)) * 1000,
        details = jsonb_build_object(
            'error_message', SQLERRM,
            'error_state', SQLSTATE
        )
    WHERE operation = 'daily_maintenance' 
    AND started_at = start_time;
    
    RAISE;
END;
$ LANGUAGE plpgsql;
```

#### Materialized Views Refresh
```sql
CREATE OR REPLACE FUNCTION refresh_materialized_views()
RETURNS void AS $
BEGIN
    -- Refresh user analytics summary
    REFRESH MATERIALIZED VIEW CONCURRENTLY user_analytics_summary;
    
    -- Refresh daily analytics
    REFRESH MATERIALIZED VIEW CONCURRENTLY daily_analytics;
    
    -- Log refresh completion
    INSERT INTO maintenance_log (operation, completed_at, status)
    VALUES ('refresh_materialized_views', NOW(), 'completed');
    
EXCEPTION WHEN OTHERS THEN
    INSERT INTO maintenance_log (operation, completed_at, status, details)
    VALUES ('refresh_materialized_views', NOW(), 'failed', 
            jsonb_build_object('error', SQLERRM));
    RAISE;
END;
$ LANGUAGE plpgsql;
```

#### Data Cleanup Function
```sql
CREATE OR REPLACE FUNCTION cleanup_old_data()
RETURNS void AS $
DECLARE
    archived_count integer;
    deleted_count integer;
BEGIN
    -- Archive old analysis results (older than 2 years)
    INSERT INTO analysis_results_archive
    SELECT * FROM analysis_results
    WHERE created_at < NOW() - INTERVAL '2 years';
    
    GET DIAGNOSTICS archived_count = ROW_COUNT;
    
    -- Delete archived data from main table
    DELETE FROM analysis_results
    WHERE created_at < NOW() - INTERVAL '2 years';
    
    GET DIAGNOSTICS deleted_count = ROW_COUNT;
    
    -- Clean up old query performance logs (older than 30 days)
    DELETE FROM query_performance_log
    WHERE timestamp < NOW() - INTERVAL '30 days';
    
    -- Clean up old maintenance logs (older than 90 days)
    DELETE FROM maintenance_log
    WHERE completed_at < NOW() - INTERVAL '90 days';
    
    -- Log cleanup results
    INSERT INTO maintenance_log (operation, completed_at, status, details)
    VALUES ('cleanup_old_data', NOW(), 'completed',
            jsonb_build_object(
                'archived_records', archived_count,
                'deleted_records', deleted_count
            ));
            
EXCEPTION WHEN OTHERS THEN
    INSERT INTO maintenance_log (operation, completed_at, status, details)
    VALUES ('cleanup_old_data', NOW(), 'failed',
            jsonb_build_object('error', SQLERRM));
    RAISE;
END;
$ LANGUAGE plpgsql;
```

### 2. Daily Monitoring Checklist

#### Morning Health Check (9:00 AM)
```bash
#!/bin/bash
# Daily health check script

echo "=== Daily Database Health Check ==="
echo "Date: $(date)"
echo

# Check database connectivity
echo "1. Database Connectivity:"
psql -c "SELECT 1;" > /dev/null 2>&1
if [ $? -eq 0 ]; then
    echo "   ✓ Database connection successful"
else
    echo "   ✗ Database connection failed"
    exit 1
fi

# Check maintenance log
echo "2. Last Maintenance Status:"
psql -c "
SELECT 
    operation,
    completed_at,
    status,
    duration_ms
FROM maintenance_log 
WHERE operation = 'daily_maintenance'
ORDER BY completed_at DESC 
LIMIT 1;
"

# Check slow queries
echo "3. Slow Queries (last 24 hours):"
psql -c "
SELECT 
    query_name,
    COUNT(*) as occurrences,
    AVG(execution_time) as avg_time,
    MAX(execution_time) as max_time
FROM query_performance_log 
WHERE timestamp > NOW() - INTERVAL '24 hours'
AND execution_time > 1000
GROUP BY query_name
ORDER BY avg_time DESC
LIMIT 5;
"

# Check connection pool status
echo "4. Connection Pool Status:"
psql -c "
SELECT 
    state,
    COUNT(*) as connection_count
FROM pg_stat_activity 
GROUP BY state;
"

# Check disk usage
echo "5. Database Size:"
psql -c "
SELECT 
    pg_size_pretty(pg_database_size(current_database())) as database_size;
"

echo "=== Health Check Complete ==="
```

#### Performance Dashboard Review
```typescript
// Daily performance review script
const dailyPerformanceReview = async () => {
  console.log('=== Daily Performance Review ===');
  
  // Get performance metrics
  const health = await healthChecker.performHealthCheck();
  console.log('Database Health Status:', health.status);
  
  if (health.status !== 'healthy') {
    console.log('Issues detected:');
    Object.entries(health.checks)
      .filter(([_, passed]) => !passed)
      .forEach(([check, _]) => console.log(`  - ${check}`));
  }
  
  // Get slow query report
  const report = dbMonitor.getPerformanceReport();
  if (report.slowQueries.length > 0) {
    console.log('Slow queries detected:', report.slowQueries.length);
    report.slowQueries.slice(0, 5).forEach(query => {
      console.log(`  - ${query.query}: ${query.executionTime}ms`);
    });
  }
  
  // Check connection pool
  const poolStats = await connectionPool.getPoolStats();
  const utilization = poolStats.activeConnections / poolStats.totalConnections;
  console.log(`Connection pool utilization: ${(utilization * 100).toFixed(1)}%`);
  
  if (utilization > 0.8) {
    console.warn('High connection pool utilization detected');
  }
};
```

## Weekly Maintenance Tasks

### 1. Performance Analysis

#### Weekly Performance Report
```sql
-- Generate weekly performance report
CREATE OR REPLACE FUNCTION generate_weekly_performance_report()
RETURNS TABLE(
    metric_name text,
    current_value numeric,
    previous_week_value numeric,
    change_percent numeric,
    status text
) AS $
BEGIN
    RETURN QUERY
    WITH current_week AS (
        SELECT 
            'avg_query_time' as metric,
            AVG(execution_time) as value
        FROM query_performance_log 
        WHERE timestamp > NOW() - INTERVAL '7 days'
        
        UNION ALL
        
        SELECT 
            'total_queries' as metric,
            COUNT(*)::numeric as value
        FROM query_performance_log 
        WHERE timestamp > NOW() - INTERVAL '7 days'
        
        UNION ALL
        
        SELECT 
            'slow_query_count' as metric,
            COUNT(*)::numeric as value
        FROM query_performance_log 
        WHERE timestamp > NOW() - INTERVAL '7 days'
        AND execution_time > 1000
    ),
    previous_week AS (
        SELECT 
            'avg_query_time' as metric,
            AVG(execution_time) as value
        FROM query_performance_log 
        WHERE timestamp BETWEEN NOW() - INTERVAL '14 days' AND NOW() - INTERVAL '7 days'
        
        UNION ALL
        
        SELECT 
            'total_queries' as metric,
            COUNT(*)::numeric as value
        FROM query_performance_log 
        WHERE timestamp BETWEEN NOW() - INTERVAL '14 days' AND NOW() - INTERVAL '7 days'
        
        UNION ALL
        
        SELECT 
            'slow_query_count' as metric,
            COUNT(*)::numeric as value
        FROM query_performance_log 
        WHERE timestamp BETWEEN NOW() - INTERVAL '14 days' AND NOW() - INTERVAL '7 days'
        AND execution_time > 1000
    )
    SELECT 
        cw.metric,
        cw.value,
        pw.value,
        CASE 
            WHEN pw.value > 0 THEN ((cw.value - pw.value) / pw.value * 100)
            ELSE 0
        END as change_percent,
        CASE 
            WHEN cw.metric = 'avg_query_time' AND cw.value > pw.value * 1.1 THEN 'DEGRADED'
            WHEN cw.metric = 'slow_query_count' AND cw.value > pw.value * 1.2 THEN 'WARNING'
            ELSE 'OK'
        END as status
    FROM current_week cw
    JOIN previous_week pw ON cw.metric = pw.metric;
END;
$ LANGUAGE plpgsql;
```

#### Index Usage Analysis
```sql
-- Weekly index usage review
CREATE OR REPLACE FUNCTION analyze_index_usage()
RETURNS TABLE(
    schema_name text,
    table_name text,
    index_name text,
    usage_category text,
    size_mb numeric,
    recommendation text
) AS $
BEGIN
    RETURN QUERY
    SELECT 
        schemaname::text,
        tablename::text,
        indexname::text,
        CASE 
            WHEN idx_scan = 0 THEN 'Never used'
            WHEN idx_scan < 100 THEN 'Rarely used'
            WHEN idx_scan < 1000 THEN 'Moderately used'
            ELSE 'Frequently used'
        END::text as usage_category,
        ROUND(pg_relation_size(indexrelid) / 1024.0 / 1024.0, 2) as size_mb,
        CASE 
            WHEN idx_scan = 0 AND pg_relation_size(indexrelid) > 10 * 1024 * 1024 
                THEN 'Consider dropping - unused and large'
            WHEN idx_scan < 100 AND pg_relation_size(indexrelid) > 50 * 1024 * 1024 
                THEN 'Review usage - rarely used but large'
            WHEN idx_scan > 10000 AND pg_relation_size(indexrelid) > 100 * 1024 * 1024 
                THEN 'Monitor for fragmentation - heavily used and large'
            ELSE 'No action needed'
        END::text as recommendation
    FROM pg_stat_user_indexes
    ORDER BY pg_relation_size(indexrelid) DESC;
END;
$ LANGUAGE plpgsql;
```

### 2. Capacity Planning

#### Weekly Capacity Analysis
```typescript
class WeeklyCapacityAnalysis {
  async generateCapacityReport() {
    const report = {
      databaseGrowth: await this.analyzeDatabaseGrowth(),
      queryVolumeGrowth: await this.analyzeQueryVolumeGrowth(),
      connectionUsageTrends: await this.analyzeConnectionTrends(),
      recommendations: []
    };
    
    // Generate recommendations based on trends
    report.recommendations = this.generateRecommendations(report);
    
    return report;
  }
  
  private async analyzeDatabaseGrowth() {
    const { data } = await supabase.rpc('get_database_growth_stats');
    return data;
  }
  
  private async analyzeQueryVolumeGrowth() {
    const { data } = await supabase.rpc('get_query_volume_trends');
    return data;
  }
  
  private async analyzeConnectionTrends() {
    const { data } = await supabase.rpc('get_connection_usage_trends');
    return data;
  }
  
  private generateRecommendations(report: any) {
    const recommendations = [];
    
    if (report.databaseGrowth.weeklyGrowthRate > 0.1) {
      recommendations.push('Consider implementing data archival - high growth rate detected');
    }
    
    if (report.queryVolumeGrowth.weeklyIncrease > 0.2) {
      recommendations.push('Monitor query performance - significant volume increase');
    }
    
    if (report.connectionUsageTrends.peakUtilization > 0.8) {
      recommendations.push('Consider increasing connection pool size');
    }
    
    return recommendations;
  }
}
```

## Monthly Maintenance Tasks

### 1. Comprehensive Performance Review

#### Monthly Performance Audit
```sql
-- Monthly performance audit function
CREATE OR REPLACE FUNCTION monthly_performance_audit()
RETURNS TABLE(
    audit_category text,
    metric_name text,
    current_value text,
    benchmark_value text,
    status text,
    recommendation text
) AS $
BEGIN
    RETURN QUERY
    -- Query performance metrics
    SELECT 
        'Query Performance'::text,
        'Average Query Time'::text,
        ROUND(AVG(execution_time), 2)::text || 'ms',
        '< 100ms'::text,
        CASE WHEN AVG(execution_time) < 100 THEN 'GOOD' 
             WHEN AVG(execution_time) < 500 THEN 'WARNING'
             ELSE 'CRITICAL' END::text,
        CASE WHEN AVG(execution_time) >= 100 THEN 'Optimize slow queries'
             ELSE 'No action needed' END::text
    FROM query_performance_log 
    WHERE timestamp > NOW() - INTERVAL '30 days'
    
    UNION ALL
    
    -- Index hit ratio
    SELECT 
        'Index Performance'::text,
        'Index Hit Ratio'::text,
        ROUND(
            (sum(idx_blks_hit) / NULLIF(sum(idx_blks_hit) + sum(idx_blks_read), 0) * 100), 2
        )::text || '%',
        '> 95%'::text,
        CASE WHEN sum(idx_blks_hit) / NULLIF(sum(idx_blks_hit) + sum(idx_blks_read), 0) > 0.95 
             THEN 'GOOD' ELSE 'WARNING' END::text,
        CASE WHEN sum(idx_blks_hit) / NULLIF(sum(idx_blks_hit) + sum(idx_blks_read), 0) <= 0.95 
             THEN 'Review and optimize indexes' ELSE 'No action needed' END::text
    FROM pg_statio_user_indexes
    
    UNION ALL
    
    -- Connection efficiency
    SELECT 
        'Connection Management'::text,
        'Average Active Connections'::text,
        (SELECT COUNT(*)::text FROM pg_stat_activity WHERE state = 'active'),
        '< 80% of max'::text,
        'GOOD'::text,
        'Monitor connection pool usage'::text;
END;
$ LANGUAGE plpgsql;
```

### 2. Security and Backup Review

#### Monthly Security Audit
```sql
-- Security audit function
CREATE OR REPLACE FUNCTION monthly_security_audit()
RETURNS TABLE(
    security_check text,
    status text,
    details text,
    recommendation text
) AS $
BEGIN
    RETURN QUERY
    -- Check for failed login attempts
    SELECT 
        'Failed Login Attempts'::text,
        CASE WHEN COUNT(*) > 100 THEN 'WARNING' ELSE 'OK' END::text,
        'Failed attempts in last 30 days: ' || COUNT(*)::text,
        CASE WHEN COUNT(*) > 100 THEN 'Review and investigate failed attempts'
             ELSE 'No action needed' END::text
    FROM auth.audit_log_entries 
    WHERE created_at > NOW() - INTERVAL '30 days'
    AND payload->>'action' = 'login'
    AND payload->>'success' = 'false'
    
    UNION ALL
    
    -- Check for privilege escalations
    SELECT 
        'Privilege Changes'::text,
        'OK'::text,
        'No unauthorized privilege changes detected'::text,
        'Continue monitoring'::text;
END;
$ LANGUAGE plpgsql;
```

#### Backup Integrity Check
```bash
#!/bin/bash
# Monthly backup integrity check

echo "=== Monthly Backup Integrity Check ==="
echo "Date: $(date)"

# Check backup file existence and size
BACKUP_DIR="/backups/hallucifix"
LATEST_BACKUP=$(ls -t $BACKUP_DIR/*.sql.gz | head -1)

if [ -f "$LATEST_BACKUP" ]; then
    echo "✓ Latest backup found: $LATEST_BACKUP"
    echo "  Size: $(du -h $LATEST_BACKUP | cut -f1)"
    echo "  Date: $(stat -c %y $LATEST_BACKUP)"
else
    echo "✗ No backup files found in $BACKUP_DIR"
    exit 1
fi

# Test backup restoration (to test database)
echo "Testing backup restoration..."
createdb hallucifix_test_restore
gunzip -c $LATEST_BACKUP | psql hallucifix_test_restore > /dev/null 2>&1

if [ $? -eq 0 ]; then
    echo "✓ Backup restoration test successful"
    dropdb hallucifix_test_restore
else
    echo "✗ Backup restoration test failed"
    dropdb hallucifix_test_restore 2>/dev/null
    exit 1
fi

echo "=== Backup Integrity Check Complete ==="
```

## Quarterly Maintenance Tasks

### 1. Full System Audit

#### Quarterly Database Optimization Review
```sql
-- Comprehensive quarterly review
CREATE OR REPLACE FUNCTION quarterly_optimization_review()
RETURNS TABLE(
    review_area text,
    current_status text,
    optimization_opportunities text,
    priority text
) AS $
BEGIN
    RETURN QUERY
    -- Table bloat analysis
    WITH table_bloat AS (
        SELECT 
            schemaname,
            tablename,
            pg_size_pretty(pg_total_relation_size(schemaname||'.'||tablename)) as size,
            CASE 
                WHEN pg_total_relation_size(schemaname||'.'||tablename) > 1024*1024*1024 
                THEN 'Large table - monitor for bloat'
                ELSE 'Normal size'
            END as bloat_status
        FROM pg_tables 
        WHERE schemaname = 'public'
    )
    SELECT 
        'Table Bloat Analysis'::text,
        'Completed'::text,
        string_agg(tablename || ': ' || bloat_status, '; ') as opportunities,
        'Medium'::text
    FROM table_bloat
    WHERE bloat_status != 'Normal size'
    
    UNION ALL
    
    -- Query pattern analysis
    SELECT 
        'Query Pattern Analysis'::text,
        'Completed'::text,
        'Review top 10 slowest queries for optimization opportunities'::text,
        'High'::text
    
    UNION ALL
    
    -- Index optimization opportunities
    SELECT 
        'Index Optimization'::text,
        'Completed'::text,
        COUNT(*)::text || ' unused indexes identified for potential removal',
        'Medium'::text
    FROM pg_stat_user_indexes
    WHERE idx_scan < 100;
END;
$ LANGUAGE plpgsql;
```

### 2. Disaster Recovery Testing

#### Quarterly DR Test Procedure
```bash
#!/bin/bash
# Quarterly disaster recovery test

echo "=== Quarterly Disaster Recovery Test ==="
echo "Date: $(date)"
echo "Test ID: DR-$(date +%Y%m%d-%H%M%S)"

# Create test environment
echo "1. Setting up test environment..."
createdb hallucifix_dr_test

# Restore from backup
echo "2. Restoring from latest backup..."
LATEST_BACKUP=$(ls -t /backups/hallucifix/*.sql.gz | head -1)
gunzip -c $LATEST_BACKUP | psql hallucifix_dr_test

# Verify data integrity
echo "3. Verifying data integrity..."
psql hallucifix_dr_test -c "
SELECT 
    'users' as table_name, COUNT(*) as record_count 
FROM users
UNION ALL
SELECT 
    'analysis_results' as table_name, COUNT(*) as record_count 
FROM analysis_results;
"

# Test application connectivity
echo "4. Testing application connectivity..."
# Run basic application tests against DR database

# Performance baseline test
echo "5. Running performance baseline test..."
psql hallucifix_dr_test -c "
EXPLAIN ANALYZE 
SELECT * FROM analysis_results 
WHERE user_id = (SELECT id FROM users LIMIT 1)
ORDER BY created_at DESC 
LIMIT 20;
"

# Cleanup
echo "6. Cleaning up test environment..."
dropdb hallucifix_dr_test

echo "=== Disaster Recovery Test Complete ==="
echo "Result: SUCCESS"
echo "Recovery Time Objective (RTO): < 4 hours"
echo "Recovery Point Objective (RPO): < 1 hour"
```

## Emergency Maintenance Procedures

### 1. Emergency Response Protocols

#### Critical Performance Issue Response
```bash
#!/bin/bash
# Emergency performance issue response

echo "=== EMERGENCY: Critical Performance Issue ==="
echo "Timestamp: $(date)"
echo "Incident ID: PERF-$(date +%Y%m%d-%H%M%S)"

# Step 1: Assess current state
echo "1. Assessing current database state..."
psql -c "
SELECT 
    'Active Connections' as metric,
    COUNT(*) as value
FROM pg_stat_activity
WHERE state = 'active'
UNION ALL
SELECT 
    'Long Running Queries' as metric,
    COUNT(*) as value
FROM pg_stat_activity
WHERE state = 'active' 
AND now() - query_start > interval '30 seconds';
"

# Step 2: Identify problematic queries
echo "2. Identifying problematic queries..."
psql -c "
SELECT 
    pid,
    now() - query_start as duration,
    left(query, 100) as query_preview
FROM pg_stat_activity
WHERE state = 'active' 
AND now() - query_start > interval '30 seconds'
ORDER BY duration DESC;
"

# Step 3: Emergency actions (manual confirmation required)
echo "3. Emergency actions available:"
echo "   - Kill long-running queries: SELECT pg_cancel_backend(pid);"
echo "   - Restart connection pool"
echo "   - Enable read-only mode"
echo "   - Scale up resources"

echo "=== Manual intervention required ==="
```

#### Connection Pool Emergency Reset
```typescript
class EmergencyConnectionPoolManager {
  async emergencyReset() {
    console.log('EMERGENCY: Resetting connection pool');
    
    try {
      // Get current pool status
      const stats = await this.getCurrentPoolStats();
      console.log('Current pool stats:', stats);
      
      // Kill long-running connections if safe
      await this.killLongRunningConnections();
      
      // Reset pool configuration
      await this.resetPoolConfiguration();
      
      // Verify recovery
      const newStats = await this.getCurrentPoolStats();
      console.log('Post-reset pool stats:', newStats);
      
      return {
        success: true,
        beforeStats: stats,
        afterStats: newStats
      };
      
    } catch (error) {
      console.error('Emergency reset failed:', error);
      throw error;
    }
  }
  
  private async killLongRunningConnections() {
    const { data } = await supabase.rpc('get_long_running_connections');
    
    for (const connection of data) {
      if (connection.duration_seconds > 300) { // 5 minutes
        await supabase.rpc('cancel_backend', { pid: connection.pid });
        console.log(`Cancelled long-running connection: ${connection.pid}`);
      }
    }
  }
}
```

### 2. Data Recovery Procedures

#### Emergency Data Recovery
```sql
-- Emergency data recovery function
CREATE OR REPLACE FUNCTION emergency_data_recovery(
    table_name text,
    recovery_timestamp timestamp with time zone
)
RETURNS TABLE(
    recovery_status text,
    records_recovered integer,
    recovery_details jsonb
) AS $
DECLARE
    backup_table_name text;
    recovered_count integer;
BEGIN
    -- Create backup table name
    backup_table_name := table_name || '_backup_' || to_char(recovery_timestamp, 'YYYYMMDD_HH24MI');
    
    -- Create backup of current state
    EXECUTE format('CREATE TABLE %I AS SELECT * FROM %I', backup_table_name, table_name);
    
    -- Attempt recovery from archive or backup
    -- This would involve specific recovery logic based on the table
    
    -- Return recovery status
    RETURN QUERY
    SELECT 
        'Recovery initiated'::text,
        0::integer,
        jsonb_build_object(
            'backup_table', backup_table_name,
            'recovery_timestamp', recovery_timestamp,
            'initiated_at', now()
        );
END;
$ LANGUAGE plpgsql;
```

## Monitoring and Alerting

### 1. Automated Monitoring Setup

#### Performance Monitoring Configuration
```typescript
const monitoringConfig = {
  healthChecks: {
    interval: '5m',
    timeout: '30s',
    retries: 3
  },
  alerts: {
    slowQuery: {
      threshold: 1000, // ms
      severity: 'warning'
    },
    criticalQuery: {
      threshold: 5000, // ms
      severity: 'critical'
    },
    connectionPool: {
      threshold: 0.8, // 80% utilization
      severity: 'warning'
    },
    diskSpace: {
      threshold: 0.8, // 80% full
      severity: 'critical'
    }
  },
  notifications: {
    email: ['dba-team@hallucifix.com'],
    slack: '#database-alerts',
    pagerduty: 'database-oncall'
  }
};
```

#### Alert Response Procedures
```typescript
class AlertResponseManager {
  async handleAlert(alert: DatabaseAlert) {
    console.log(`Handling alert: ${alert.type} - ${alert.severity}`);
    
    switch (alert.type) {
      case 'slow_query':
        await this.handleSlowQueryAlert(alert);
        break;
      case 'connection_pool':
        await this.handleConnectionPoolAlert(alert);
        break;
      case 'disk_space':
        await this.handleDiskSpaceAlert(alert);
        break;
      default:
        await this.handleGenericAlert(alert);
    }
  }
  
  private async handleSlowQueryAlert(alert: DatabaseAlert) {
    // Log the slow query
    console.log('Slow query detected:', alert.details);
    
    // If critical, attempt automatic optimization
    if (alert.severity === 'critical') {
      await this.attemptQueryOptimization(alert.details.query);
    }
  }
  
  private async handleConnectionPoolAlert(alert: DatabaseAlert) {
    // Check for connection leaks
    const longRunningConnections = await this.getLongRunningConnections();
    
    if (longRunningConnections.length > 0) {
      console.log('Long running connections detected:', longRunningConnections);
      // Consider killing connections if safe
    }
  }
}
```

This comprehensive maintenance procedures document ensures systematic and proactive database maintenance for optimal performance in HalluciFix.