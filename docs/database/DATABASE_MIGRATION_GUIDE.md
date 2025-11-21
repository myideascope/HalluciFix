# Database Migration Guide: Supabase to AWS RDS

This guide covers migrating from Supabase to AWS RDS PostgreSQL as part of the AWS infrastructure migration.

## Overview

The database migration involves:
1. Setting up AWS RDS PostgreSQL instance
2. Migrating schema and data from Supabase
3. Updating application code to use direct PostgreSQL connections
4. Testing and validating the migration

## Prerequisites

- AWS RDS PostgreSQL instance deployed (see infrastructure deployment)
- Database credentials stored in AWS Secrets Manager
- Network connectivity between application and RDS instance

## Migration Steps

### 1. Install Dependencies

```bash
npm install pg @types/pg
```

### 2. Configure Environment Variables

Create or update your `.env.local` file with RDS configuration:

```bash
# Primary database connection (recommended)
DATABASE_URL=postgresql://username:password@your-rds-instance.region.rds.amazonaws.com:5432/hallucifix?sslmode=require

# Alternative individual parameters
DB_HOST=your-rds-instance.region.rds.amazonaws.com
DB_PORT=5432
DB_NAME=hallucifix
DB_USER=postgres
DB_PASSWORD=your-secure-password
DB_SSL=true

# Connection pool settings
DB_MAX_CONNECTIONS=20
DB_IDLE_TIMEOUT=30000
DB_CONNECTION_TIMEOUT=10000

# Keep Supabase config during migration (optional)
VITE_SUPABASE_URL=your-supabase-url
VITE_SUPABASE_ANON_KEY=your-supabase-anon-key
```

### 3. Test Database Connection

```bash
npm run db:test
```

This will:
- Verify database configuration
- Test connection to RDS
- Run basic health checks

### 4. Run Database Migrations

The application automatically runs migrations on startup, but you can also run them manually:

```bash
npm run build
npm run db:migrate
```

### 5. Verify Migration

Check database health:

```bash
npm run db:health
```

### 6. Update Application Configuration

The application uses a database adapter that automatically detects whether to use RDS or Supabase based on configuration:

- If `DATABASE_URL` or `DB_HOST` is set → Uses RDS
- If only Supabase config is set → Uses Supabase
- If both are set → Migration mode (uses RDS)

## Database Schema

The migration creates the following core tables:

### Core Tables
- `users` - User accounts (replaces auth.users)
- `analysis_results` - Content analysis results
- `scheduled_scans` - Automated scan configurations
- `scan_executor_logs` - Scan execution history

### Billing Tables
- `subscriptions` - User subscriptions
- `usage_tracking` - Usage metrics
- `billing_events` - Billing event history

### OAuth Tables
- `oauth_tokens` - OAuth access/refresh tokens
- `user_sessions` - User session management
- `oauth_states` - CSRF protection for OAuth

### Monitoring Tables
- `query_performance_log` - Query performance metrics
- `security_audit_log` - Security audit trail
- `security_events` - Security events
- `capacity_metrics_log` - Capacity planning metrics
- `maintenance_log` - Maintenance operations

## Database Adapter

The application uses a unified database adapter (`src/lib/databaseAdapter.ts`) that provides:

- **Automatic Detection**: Chooses RDS or Supabase based on configuration
- **Unified API**: Same interface for both database types
- **Migration Support**: Gradual migration from Supabase to RDS
- **Type Safety**: TypeScript interfaces for all operations

### Usage Example

```typescript
import { databaseAdapter } from './lib/databaseAdapter';

// Select data
const result = await databaseAdapter.select(
  'users',
  '*',
  { email: 'user@example.com' }
);

// Insert data
const insertResult = await databaseAdapter.insert(
  'analysis_results',
  {
    user_id: userId,
    content: 'Sample content',
    accuracy: 95.5,
    risk_level: 'low'
  },
  { returning: '*' }
);

// Update data
const updateResult = await databaseAdapter.update(
  'users',
  { last_login: new Date() },
  { id: userId }
);
```

## Connection Pooling

The RDS connection uses connection pooling for optimal performance:

- **Max Connections**: 20 (configurable via `DB_MAX_CONNECTIONS`)
- **Idle Timeout**: 30 seconds (configurable via `DB_IDLE_TIMEOUT`)
- **Connection Timeout**: 10 seconds (configurable via `DB_CONNECTION_TIMEOUT`)

## Security

### SSL/TLS
- All connections use SSL/TLS encryption
- Certificate validation can be configured via `DB_SSL`

### Connection Security
- Database credentials stored in AWS Secrets Manager
- Network access restricted via security groups
- Connection pooling prevents connection exhaustion

### Audit Logging
- All database operations are logged
- Security events are tracked
- Performance metrics are collected

## Monitoring

### Health Checks
```bash
npm run db:health
```

### Performance Monitoring
- Query performance is automatically tracked
- Slow queries are logged and analyzed
- Connection pool metrics are monitored

### Alerts
- Connection failures
- Slow query performance
- High connection usage
- Security events

## Troubleshooting

### Common Issues

#### Connection Refused
```
Error: connect ECONNREFUSED
```
**Solution**: Check security groups and network ACLs allow connections from your application.

#### SSL Connection Error
```
Error: SSL connection required
```
**Solution**: Ensure `DB_SSL=true` or add `?sslmode=require` to `DATABASE_URL`.

#### Authentication Failed
```
Error: password authentication failed
```
**Solution**: Verify database credentials in AWS Secrets Manager.

#### Too Many Connections
```
Error: too many connections for role
```
**Solution**: Reduce `DB_MAX_CONNECTIONS` or increase RDS max_connections parameter.

### Debug Mode

Enable debug logging:
```bash
LOG_LEVEL=debug npm start
```

### Connection Pool Status

Check connection pool status:
```typescript
import { databaseService } from './lib/database';
console.log(databaseService.getPoolStatus());
```

## Migration Validation

### Data Integrity
1. Compare record counts between Supabase and RDS
2. Verify critical data fields
3. Test application functionality

### Performance Testing
1. Run load tests against RDS
2. Monitor query performance
3. Validate connection pooling

### Rollback Plan
1. Keep Supabase configuration during migration
2. Switch back by removing RDS configuration
3. Monitor for any data inconsistencies

## Best Practices

### Development
- Use local PostgreSQL for development
- Test migrations on staging environment first
- Keep database schema in version control

### Production
- Use RDS Multi-AZ for high availability
- Enable automated backups
- Monitor performance metrics
- Set up alerting for critical issues

### Security
- Rotate database credentials regularly
- Use least-privilege access
- Enable audit logging
- Monitor for suspicious activity

## Support

For issues with the database migration:
1. Check the troubleshooting section above
2. Review application logs for specific errors
3. Test database connectivity using `npm run db:test`
4. Verify AWS infrastructure deployment

## Next Steps

After successful database migration:
1. Update CI/CD pipelines to use RDS
2. Remove Supabase configuration
3. Set up database monitoring and alerting
4. Plan for regular maintenance and updates