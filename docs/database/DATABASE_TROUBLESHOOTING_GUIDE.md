# Database Performance Troubleshooting Guide

## Overview

This guide provides comprehensive troubleshooting procedures, diagnostic tools, and recovery guides for database performance issues in HalluciFix. It includes step-by-step runbooks, diagnostic techniques, and decision trees for resolving common database problems.

## Table of Contents

1. [Quick Diagnostic Checklist](#quick-diagnostic-checklist)
2. [Performance Issue Categories](#performance-issue-categories)
3. [Diagnostic Tools and Techniques](#diagnostic-tools-and-techniques)
4. [Troubleshooting Runbooks](#troubleshooting-runbooks)
5. [Recovery Procedures](#recovery-procedures)
6. [Troubleshooting Flowcharts](#troubleshooting-flowcharts)
7. [Emergency Response Procedures](#emergency-response-procedures)

## Quick Diagnostic Checklist

When experiencing database performance issues, follow this quick checklist:

### Immediate Checks (< 2 minutes)
- [ ] Check database connection status
- [ ] Verify current active connections vs. pool limits
- [ ] Check for obvious error messages in logs
- [ ] Verify disk space availability (>20% free)
- [ ] Check if scheduled maintenance is running

### Performance Checks (< 5 minutes)
- [ ] Review current slow query log
- [ ] Check index hit ratio (should be >95%)
- [ ] Verify connection pool usage (<80%)
- [ ] Check for long-running queries
- [ ] Review recent query performance metrics

### System Health Checks (< 10 minutes)
- [ ] Run database health check function
- [ ] Review materialized view refresh status
- [ ] Check maintenance log for recent issues
- [ ] Verify backup status and integrity
- [ ] Review security audit logs for anomalies

## Performance Issue Categories

### 1. Slow Query Performance

#### Symptoms
- Individual queries taking >1 second
- Dashboard loading slowly
- User complaints about response times
- High CPU usage on database

#### Common Causes
- Missing or inefficient indexes
- N+1 query problems
- Large result sets without pagination
- Outdated table statistics
- Query plan regression

#### Immediate Actions
1. Identify slow queries using monitoring dashboard
2. Check query execution plans
3. Verify index usage
4. Update table statistics if needed

### 2. Connection Pool Exhaustion

#### Symptoms
- "Connection pool exhausted" errors
- New connections timing out
- Application unable to connect to database
- High connection wait times

#### Common Causes
- Connection leaks in application code
- Insufficient pool size for current load
- Long-running transactions holding connections
- Database maintenance blocking connections

#### Immediate Actions
1. Check current connection count vs. limits
2. Identify long-running queries/transactions
3. Review connection pool configuration
4. Kill problematic long-running queries if safe

### 3. High Resource Usage

#### Symptoms
- High CPU usage (>80%)
- High memory usage (>90%)
- Disk I/O bottlenecks
- Slow response across all queries

#### Common Causes
- Inefficient queries causing table scans
- Missing indexes on large tables
- Maintenance operations running during peak hours
- Insufficient hardware resources

#### Immediate Actions
1. Identify resource-intensive queries
2. Check for running maintenance operations
3. Review system resource usage trends
4. Consider temporary query optimization

### 4. Data Integrity Issues

#### Symptoms
- Constraint violation errors
- Unexpected null values
- Data inconsistencies between related tables
- Foreign key constraint failures

#### Common Causes
- Application bugs in data validation
- Concurrent modification conflicts
- Failed migration or maintenance operations
- Manual data modifications

#### Immediate Actions
1. Identify affected tables and records
2. Check recent data modification logs
3. Verify constraint definitions
4. Review recent application deployments

## Diagnostic Tools and Techniques

### 1. Built-in Database Functions

#### Health Check Function
```sql
-- Run comprehensive health check
SELECT * FROM perform_health_check();
```

#### Query Performance Analysis
```sql
-- Get slow query statistics
SELECT 
    query_name,
    AVG(execution_time) as avg_time,
    MAX(execution_time) as max_time,
    COUNT(*) as execution_count
FROM query_performance_log 
WHERE timestamp > NOW() - INTERVAL '1 hour'
GROUP BY query_name
ORDER BY avg_time DESC;
```

#### Index Usage Analysis
```sql
-- Check index usage statistics
SELECT 
    schemaname,
    tablename,
    indexname,
    idx_scan,
    idx_tup_read,
    idx_tup_fetch,
    pg_size_pretty(pg_relation_size(indexrelid)) as index_size
FROM pg_stat_user_indexes
WHERE idx_scan < 100  -- Potentially unused indexes
ORDER BY idx_scan ASC;
```

#### Connection Analysis
```sql
-- Check current connections
SELECT 
    state,
    COUNT(*) as connection_count,
    AVG(EXTRACT(EPOCH FROM (NOW() - query_start))) as avg_duration
FROM pg_stat_activity 
WHERE state IS NOT NULL
GROUP BY state;
```

### 2. Application-Level Diagnostics

#### Performance Monitor Usage
```typescript
// Get performance report from application
const report = dbMonitor.getPerformanceReport();
console.log('Slow queries:', report.slowQueries);
console.log('Average execution time:', report.averageExecutionTime);
```

#### Health Check API
```typescript
// Run health check via API
const healthStatus = await healthChecker.performHealthCheck();
console.log('Database status:', healthStatus.status);
console.log('Failed checks:', 
  Object.entries(healthStatus.checks)
    .filter(([_, passed]) => !passed)
    .map(([check]) => check)
);
```

### 3. Query Analysis Tools

#### EXPLAIN ANALYZE Usage
```sql
-- Analyze query execution plan
EXPLAIN (ANALYZE, BUFFERS, FORMAT JSON) 
SELECT * FROM analysis_results 
WHERE user_id = 'user-123' 
ORDER BY created_at DESC 
LIMIT 20;
```

#### Query Plan Interpretation
- **Seq Scan**: Table scan - usually indicates missing index
- **Index Scan**: Good - using index efficiently
- **Nested Loop**: Can be expensive with large datasets
- **Hash Join**: Generally efficient for joins
- **Sort**: Expensive operation - consider index for ORDER BY

### 4. Performance Monitoring Queries

#### Table Size Analysis
```sql
-- Check table sizes and growth
SELECT 
    schemaname,
    tablename,
    pg_size_pretty(pg_total_relation_size(schemaname||'.'||tablename)) as size,
    pg_size_pretty(pg_relation_size(schemaname||'.'||tablename)) as table_size,
    pg_size_pretty(pg_total_relation_size(schemaname||'.'||tablename) - 
                   pg_relation_size(schemaname||'.'||tablename)) as index_size
FROM pg_tables 
WHERE schemaname = 'public'
ORDER BY pg_total_relation_size(schemaname||'.'||tablename) DESC;
```

#### Lock Analysis
```sql
-- Check for blocking queries
SELECT 
    blocked_locks.pid AS blocked_pid,
    blocked_activity.usename AS blocked_user,
    blocking_locks.pid AS blocking_pid,
    blocking_activity.usename AS blocking_user,
    blocked_activity.query AS blocked_statement,
    blocking_activity.query AS blocking_statement
FROM pg_catalog.pg_locks blocked_locks
JOIN pg_catalog.pg_stat_activity blocked_activity ON blocked_activity.pid = blocked_locks.pid
JOIN pg_catalog.pg_locks blocking_locks ON blocking_locks.locktype = blocked_locks.locktype
    AND blocking_locks.DATABASE IS NOT DISTINCT FROM blocked_locks.DATABASE
    AND blocking_locks.relation IS NOT DISTINCT FROM blocked_locks.relation
    AND blocking_locks.page IS NOT DISTINCT FROM blocked_locks.page
    AND blocking_locks.tuple IS NOT DISTINCT FROM blocked_locks.tuple
    AND blocking_locks.virtualxid IS NOT DISTINCT FROM blocked_locks.virtualxid
    AND blocking_locks.transactionid IS NOT DISTINCT FROM blocked_locks.transactionid
    AND blocking_locks.classid IS NOT DISTINCT FROM blocked_locks.classid
    AND blocking_locks.objid IS NOT DISTINCT FROM blocked_locks.objid
    AND blocking_locks.objsubid IS NOT DISTINCT FROM blocked_locks.objsubid
    AND blocking_locks.pid != blocked_locks.pid
JOIN pg_catalog.pg_stat_activity blocking_activity ON blocking_activity.pid = blocking_locks.pid
WHERE NOT blocked_locks.GRANTED;
```

## Troubleshooting Runbooks

### Runbook 1: Slow Query Investigation

#### Step 1: Identify Slow Queries
```bash
# Check application monitoring dashboard
# Or query the performance log
psql -c "
SELECT query_name, execution_time, timestamp 
FROM query_performance_log 
WHERE execution_time > 1000 
ORDER BY timestamp DESC 
LIMIT 10;"
```

#### Step 2: Analyze Query Plan
```sql
-- Get the actual query and analyze it
EXPLAIN (ANALYZE, BUFFERS, VERBOSE) 
[ACTUAL_SLOW_QUERY];
```

#### Step 3: Check Index Usage
```sql
-- Verify if appropriate indexes exist
SELECT * FROM pg_indexes 
WHERE tablename = '[TABLE_NAME]';

-- Check index usage statistics
SELECT * FROM pg_stat_user_indexes 
WHERE relname = '[TABLE_NAME]';
```

#### Step 4: Optimization Actions
1. **Missing Index**: Create appropriate index
   ```sql
   CREATE INDEX CONCURRENTLY idx_[table]_[column] 
   ON [table]([column]);
   ```

2. **Outdated Statistics**: Update table statistics
   ```sql
   ANALYZE [table_name];
   ```

3. **Query Rewrite**: Optimize query structure
   - Use appropriate WHERE clauses
   - Implement proper pagination
   - Consider materialized views for complex aggregations

#### Step 5: Verify Improvement
```sql
-- Re-run the query and check execution time
EXPLAIN (ANALYZE, BUFFERS) [OPTIMIZED_QUERY];
```

### Runbook 2: Connection Pool Exhaustion

#### Step 1: Assess Current State
```sql
-- Check current connections
SELECT COUNT(*) as current_connections,
       (SELECT setting FROM pg_settings WHERE name = 'max_connections') as max_connections
FROM pg_stat_activity;

-- Check connection states
SELECT state, COUNT(*) 
FROM pg_stat_activity 
GROUP BY state;
```

#### Step 2: Identify Long-Running Queries
```sql
-- Find long-running queries
SELECT 
    pid,
    now() - pg_stat_activity.query_start AS duration,
    query,
    state
FROM pg_stat_activity
WHERE (now() - pg_stat_activity.query_start) > interval '5 minutes'
ORDER BY duration DESC;
```

#### Step 3: Take Corrective Action
1. **Kill Long-Running Queries** (if safe):
   ```sql
   -- Cancel query (graceful)
   SELECT pg_cancel_backend([PID]);
   
   -- Terminate connection (forceful)
   SELECT pg_terminate_backend([PID]);
   ```

2. **Increase Pool Size** (temporary):
   ```typescript
   // Update connection pool configuration
   const newConfig = {
     ...currentConfig,
     max: currentConfig.max + 5
   };
   ```

3. **Application Code Review**:
   - Check for connection leaks
   - Verify proper connection closing
   - Review transaction management

#### Step 4: Monitor Recovery
```sql
-- Monitor connection count recovery
SELECT COUNT(*) FROM pg_stat_activity;
```

### Runbook 3: High Resource Usage

#### Step 1: Identify Resource Bottleneck
```sql
-- Check for resource-intensive queries
SELECT 
    query,
    calls,
    total_time,
    mean_time,
    rows
FROM pg_stat_statements
ORDER BY total_time DESC
LIMIT 10;
```

#### Step 2: Check System Resources
```bash
# Check system resources (if accessible)
top -p $(pgrep postgres)
iostat -x 1 5
```

#### Step 3: Identify Root Cause
1. **CPU Bottleneck**: Look for queries doing table scans
2. **Memory Issues**: Check for large sorts or joins
3. **I/O Bottleneck**: Look for excessive disk reads

#### Step 4: Immediate Mitigation
1. **Kill Resource-Intensive Queries**:
   ```sql
   SELECT pg_cancel_backend([PID]);
   ```

2. **Temporary Query Limits**:
   ```sql
   -- Set statement timeout
   SET statement_timeout = '30s';
   ```

3. **Defer Non-Critical Operations**:
   - Pause scheduled maintenance
   - Defer batch operations
   - Reduce concurrent user load if possible

### Runbook 4: Data Integrity Issues

#### Step 1: Identify Affected Data
```sql
-- Check constraint violations
SELECT conname, conrelid::regclass 
FROM pg_constraint 
WHERE NOT convalidated;

-- Check for orphaned records
SELECT COUNT(*) FROM analysis_results ar
LEFT JOIN users u ON ar.user_id = u.id
WHERE u.id IS NULL;
```

#### Step 2: Assess Impact
```sql
-- Count affected records
SELECT 
    table_name,
    COUNT(*) as affected_records
FROM [affected_tables]
WHERE [integrity_condition]
GROUP BY table_name;
```

#### Step 3: Data Recovery
1. **Backup Verification**:
   ```sql
   -- Check recent backup status
   SELECT * FROM backup_log 
   ORDER BY completed_at DESC 
   LIMIT 5;
   ```

2. **Point-in-Time Recovery** (if needed):
   ```bash
   # Restore from backup to specific timestamp
   pg_restore --clean --if-exists --no-owner --no-privileges \
     --dbname=[database] [backup_file]
   ```

3. **Data Repair**:
   ```sql
   -- Fix orphaned records
   DELETE FROM analysis_results 
   WHERE user_id NOT IN (SELECT id FROM users);
   
   -- Update invalid data
   UPDATE analysis_results 
   SET accuracy = LEAST(accuracy, 100) 
   WHERE accuracy > 100;
   ```

## Recovery Procedures

### Database Recovery Scenarios

#### Scenario 1: Complete Database Failure

1. **Assess Damage**:
   - Check database connectivity
   - Verify data corruption extent
   - Identify last known good state

2. **Recovery Steps**:
   ```bash
   # Stop application connections
   # Restore from latest backup
   pg_restore --clean --if-exists --no-owner \
     --dbname=hallucifix_recovery [latest_backup]
   
   # Apply any missing transactions from WAL
   # Verify data integrity
   # Resume application connections
   ```

3. **Verification**:
   ```sql
   -- Verify critical tables
   SELECT COUNT(*) FROM users;
   SELECT COUNT(*) FROM analysis_results;
   
   -- Check data integrity
   SELECT perform_health_check();
   ```

#### Scenario 2: Performance Degradation Recovery

1. **Emergency Performance Restoration**:
   ```sql
   -- Kill all non-essential queries
   SELECT pg_cancel_backend(pid) 
   FROM pg_stat_activity 
   WHERE state = 'active' 
   AND query NOT LIKE '%pg_stat_activity%';
   
   -- Update statistics
   ANALYZE;
   
   -- Restart connection pooling
   ```

2. **Gradual Service Restoration**:
   - Enable read-only mode first
   - Gradually increase connection limits
   - Monitor performance metrics
   - Full service restoration when stable

#### Scenario 3: Data Corruption Recovery

1. **Isolate Corruption**:
   ```sql
   -- Identify corrupted tables
   SELECT schemaname, tablename 
   FROM pg_tables 
   WHERE schemaname = 'public';
   
   -- Check each table
   SELECT COUNT(*) FROM [table_name];
   ```

2. **Selective Recovery**:
   ```sql
   -- Restore specific tables from backup
   pg_restore --table=[table_name] --clean \
     --dbname=[database] [backup_file]
   ```

## Troubleshooting Flowcharts

### Performance Issue Decision Tree

```
Performance Issue Detected
├── Query Performance?
│   ├── Yes → Check Query Plans → Missing Index? → Create Index
│   │                         → Outdated Stats? → Run ANALYZE
│   │                         → Query Structure? → Optimize Query
│   └── No → Continue to Connection Issues
├── Connection Issues?
│   ├── Yes → Pool Exhausted? → Kill Long Queries / Increase Pool
│   │                        → Connection Leaks? → Fix Application Code
│   └── No → Continue to Resource Issues
├── Resource Issues?
│   ├── Yes → CPU High? → Identify Expensive Queries → Optimize/Kill
│   │                  → Memory High? → Check Large Operations → Optimize
│   │                  → I/O High? → Check Disk Usage → Archive/Cleanup
│   └── No → Continue to Data Issues
└── Data Issues?
    ├── Yes → Integrity Violations? → Identify Source → Fix/Restore
    │                              → Corruption? → Restore from Backup
    └── No → Escalate to DBA Team
```

### Emergency Response Decision Tree

```
Database Emergency
├── Complete Outage?
│   ├── Yes → Check Infrastructure → Hardware Issue? → Contact Infrastructure
│   │                             → Software Issue? → Restart Services
│   │                             → Data Corruption? → Restore from Backup
│   └── No → Continue to Performance Issues
├── Severe Performance Degradation?
│   ├── Yes → Kill Non-Essential Queries → Update Statistics → Monitor
│   └── No → Continue to Partial Issues
└── Partial Service Issues?
    ├── Yes → Identify Affected Components → Isolate Issues → Gradual Recovery
    └── No → Monitor and Document
```

## Emergency Response Procedures

### Severity Levels

#### Critical (P0) - Complete Service Outage
- **Response Time**: Immediate (< 5 minutes)
- **Actions**:
  1. Activate incident response team
  2. Assess database connectivity
  3. Check infrastructure status
  4. Initiate recovery procedures
  5. Communicate with stakeholders

#### High (P1) - Severe Performance Degradation
- **Response Time**: < 15 minutes
- **Actions**:
  1. Identify performance bottlenecks
  2. Kill resource-intensive queries
  3. Implement temporary mitigations
  4. Monitor recovery progress

#### Medium (P2) - Moderate Performance Issues
- **Response Time**: < 1 hour
- **Actions**:
  1. Analyze performance metrics
  2. Identify root causes
  3. Implement optimizations
  4. Schedule maintenance if needed

#### Low (P3) - Minor Issues
- **Response Time**: < 4 hours
- **Actions**:
  1. Document issues
  2. Plan optimization improvements
  3. Schedule during maintenance window

### Contact Information

#### Escalation Path
1. **Database Administrator**: [Contact Info]
2. **Infrastructure Team**: [Contact Info]
3. **Development Team Lead**: [Contact Info]
4. **On-Call Engineer**: [Contact Info]

#### Emergency Contacts
- **24/7 Support**: [Phone Number]
- **Incident Management**: [Email/Slack Channel]
- **Infrastructure Alerts**: [Monitoring System]

### Post-Incident Procedures

#### Immediate Post-Resolution
1. Verify service restoration
2. Document incident timeline
3. Identify root cause
4. Implement monitoring for recurrence

#### Follow-up Actions
1. Conduct post-mortem meeting
2. Update runbooks based on learnings
3. Implement preventive measures
4. Update monitoring and alerting

This troubleshooting guide should be regularly updated based on new issues encountered and lessons learned from incident responses.