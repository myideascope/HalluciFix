# Database Migration Guide: Supabase to AWS RDS PostgreSQL

This guide provides step-by-step instructions for migrating the HalluciFix database from Supabase to AWS RDS PostgreSQL.

## Prerequisites

1. **AWS RDS PostgreSQL instance** - Already created and configured
2. **Network access** - Ensure your local machine can connect to both Supabase and RDS
3. **Required tools**:
   - Node.js (v18+)
   - PostgreSQL client (`psql`)
   - AWS CLI (configured)

## Migration Steps

### Step 1: Environment Setup

1. Copy the RDS environment template:
   ```bash
   cp .env.rds.example .env.local
   ```

2. Update `.env.local` with your RDS credentials:
   ```bash
   # RDS Connection Settings
   RDS_HOST=your-rds-instance.region.rds.amazonaws.com
   RDS_PORT=5432
   RDS_DATABASE=hallucifix
   RDS_USERNAME=postgres
   RDS_PASSWORD=your-secure-password
   
   # Supabase Settings (for migration)
   SUPABASE_URL=your-supabase-url
   SUPABASE_SERVICE_ROLE_KEY=your-service-role-key
   ```

### Step 2: Test Connections

Verify connectivity to both databases:

```bash
# Test Supabase connection
curl -H "apikey: $SUPABASE_SERVICE_ROLE_KEY" "$SUPABASE_URL/rest/v1/"

# Test RDS connection
PGPASSWORD="$RDS_PASSWORD" psql -h "$RDS_HOST" -U "$RDS_USERNAME" -d "$RDS_DATABASE" -c "SELECT 1;"
```

### Step 3: Run Migration

Execute the migration script:

```bash
cd infrastructure/scripts
./migrate-database.sh
```

The script will:
1. Export schema from Supabase
2. Export data from Supabase tables
3. Create RDS-compatible schema
4. Import data to RDS
5. Validate the migration
6. Generate a migration report

### Step 4: Set Up RDS Proxy (Optional)

For better connection pooling and performance:

```bash
# Set environment variables for RDS Proxy
export SETUP_RDS_PROXY=true
export RDS_PROXY_NAME=hallucifix-rds-proxy
export VPC_SUBNET_IDS=subnet-xxx,subnet-yyy
export VPC_SECURITY_GROUP_IDS=sg-xxx

# Run migration with RDS Proxy setup
./migrate-database.sh
```

### Step 5: Update Application Configuration

1. **Update environment variables** in your deployment:
   ```bash
   # Remove Supabase variables
   unset VITE_SUPABASE_URL
   unset VITE_SUPABASE_ANON_KEY
   
   # Add RDS variables
   export RDS_HOST=your-rds-instance.region.rds.amazonaws.com
   export RDS_DATABASE=hallucifix
   export RDS_USERNAME=postgres
   export RDS_PASSWORD=your-secure-password
   ```

2. **Update your application code** to use the new database service:
   ```typescript
   // Replace Supabase imports
   // import { supabase } from './lib/supabase';
   
   // With PostgreSQL database service
   import { databaseService } from './lib/database/databaseService';
   ```

### Step 6: Test Application

1. **Start your application** with the new database configuration
2. **Test core functionality**:
   - User authentication (if using Cognito)
   - Analysis creation and retrieval
   - Scheduled scans
   - Dashboard data

3. **Monitor performance**:
   - Check database connection pool metrics
   - Monitor query performance
   - Verify data integrity

## Migration Validation

### Data Integrity Checks

1. **Record counts**:
   ```sql
   -- Check analysis_results count
   SELECT COUNT(*) FROM analysis_results;
   
   -- Check scheduled_scans count
   SELECT COUNT(*) FROM scheduled_scans;
   ```

2. **Data sampling**:
   ```sql
   -- Sample recent analysis results
   SELECT id, user_id, accuracy, risk_level, created_at 
   FROM analysis_results 
   ORDER BY created_at DESC 
   LIMIT 10;
   ```

3. **Constraint validation**:
   ```sql
   -- Check for constraint violations
   SELECT * FROM analysis_results WHERE accuracy < 0 OR accuracy > 100;
   SELECT * FROM analysis_results WHERE risk_level NOT IN ('low', 'medium', 'high', 'critical');
   ```

### Performance Testing

1. **Connection pool monitoring**:
   ```typescript
   import { databaseService } from './lib/database/databaseService';
   
   const health = await databaseService.healthCheck();
   console.log('Database health:', health);
   ```

2. **Query performance**:
   ```sql
   -- Enable query timing
   \timing on
   
   -- Test common queries
   SELECT * FROM analysis_results WHERE user_id = 'test-user' ORDER BY created_at DESC LIMIT 10;
   ```

## Rollback Procedure

If issues are encountered, you can rollback to Supabase:

1. **Revert environment variables**:
   ```bash
   export VITE_SUPABASE_URL=your-supabase-url
   export VITE_SUPABASE_ANON_KEY=your-supabase-anon-key
   unset RDS_HOST RDS_USERNAME RDS_PASSWORD
   ```

2. **Revert application code**:
   ```bash
   git checkout HEAD~1 -- src/lib/database/
   ```

3. **Restart application** with Supabase configuration

## Post-Migration Tasks

### 1. Monitoring Setup

- Configure CloudWatch metrics for RDS
- Set up alerts for connection pool exhaustion
- Monitor query performance with Performance Insights

### 2. Backup Configuration

- Verify automated RDS backups are enabled
- Set up point-in-time recovery
- Test backup restoration procedure

### 3. Security Hardening

- Review database security groups
- Enable encryption at rest (if not already enabled)
- Configure SSL/TLS for connections
- Rotate database credentials

### 4. Performance Optimization

- Analyze slow queries with Performance Insights
- Create additional indexes if needed
- Configure connection pooling parameters
- Set up read replicas for read-heavy workloads

## Troubleshooting

### Common Issues

1. **Connection timeouts**:
   - Check security group rules
   - Verify VPC configuration
   - Increase connection timeout values

2. **Authentication failures**:
   - Verify RDS credentials
   - Check IAM permissions for RDS Proxy
   - Ensure SSL configuration matches

3. **Performance issues**:
   - Monitor connection pool metrics
   - Check for missing indexes
   - Analyze query execution plans

4. **Data inconsistencies**:
   - Re-run migration validation queries
   - Check for timezone differences
   - Verify JSON data parsing

### Getting Help

- Check migration logs in `infrastructure/migration-data/`
- Review CloudWatch logs for RDS
- Monitor application logs for database errors
- Contact AWS Support for RDS-specific issues

## Migration Checklist

- [ ] RDS instance created and configured
- [ ] Environment variables updated
- [ ] Database connections tested
- [ ] Migration script executed successfully
- [ ] Data validation completed
- [ ] Application updated to use PostgreSQL service
- [ ] Application testing completed
- [ ] Performance monitoring configured
- [ ] Backup procedures verified
- [ ] Security hardening applied
- [ ] Documentation updated
- [ ] Team trained on new database operations

## Next Steps

After successful migration:

1. **Clean up Supabase resources** (after thorough validation)
2. **Update CI/CD pipelines** to use RDS
3. **Train team members** on PostgreSQL operations
4. **Plan for future scaling** with read replicas
5. **Implement advanced monitoring** and alerting