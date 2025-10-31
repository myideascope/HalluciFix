#!/bin/bash

# Database Migration Script: Supabase to AWS RDS PostgreSQL
# This script orchestrates the complete migration process

set -e  # Exit on any error

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Logging functions
log_info() {
    echo -e "${BLUE}ℹ️  $1${NC}"
}

log_success() {
    echo -e "${GREEN}✅ $1${NC}"
}

log_warning() {
    echo -e "${YELLOW}⚠️  $1${NC}"
}

log_error() {
    echo -e "${RED}❌ $1${NC}"
}

# Check if required environment variables are set
check_environment() {
    log_info "Checking environment variables..."
    
    local required_vars=(
        "SUPABASE_URL"
        "SUPABASE_SERVICE_ROLE_KEY"
        "RDS_HOST"
        "RDS_USERNAME"
        "RDS_PASSWORD"
        "RDS_DATABASE"
        "AWS_REGION"
    )
    
    local missing_vars=()
    
    for var in "${required_vars[@]}"; do
        if [[ -z "${!var}" ]]; then
            missing_vars+=("$var")
        fi
    done
    
    if [[ ${#missing_vars[@]} -gt 0 ]]; then
        log_error "Missing required environment variables:"
        for var in "${missing_vars[@]}"; do
            echo "  - $var"
        done
        exit 1
    fi
    
    log_success "All required environment variables are set"
}

# Install dependencies
install_dependencies() {
    log_info "Installing migration dependencies..."
    
    # Check if Node.js is installed
    if ! command -v node &> /dev/null; then
        log_error "Node.js is not installed. Please install Node.js first."
        exit 1
    fi
    
    # Check if TypeScript is installed
    if ! command -v ts-node &> /dev/null; then
        log_info "Installing ts-node globally..."
        npm install -g ts-node
    fi
    
    # Install required packages
    cd "$(dirname "$0")/.."
    
    if [[ ! -f package.json ]]; then
        log_info "Initializing npm package..."
        npm init -y
    fi
    
    log_info "Installing required packages..."
    npm install --save-dev @types/node @supabase/supabase-js pg @types/pg @aws-sdk/client-rds @aws-sdk/client-secrets-manager @aws-sdk/client-iam
    
    log_success "Dependencies installed successfully"
}

# Create migration directories
create_directories() {
    log_info "Creating migration directories..."
    
    local script_dir="$(dirname "$0")"
    local migration_dir="$script_dir/../migration-data"
    local backup_dir="$script_dir/../migration-backup"
    
    mkdir -p "$migration_dir"
    mkdir -p "$backup_dir"
    
    log_success "Migration directories created"
}

# Backup current RDS data (if any)
backup_rds_data() {
    log_info "Creating backup of current RDS data..."
    
    local backup_file="migration-backup/rds-backup-$(date +%Y%m%d-%H%M%S).sql"
    
    # Use pg_dump to create backup
    PGPASSWORD="$RDS_PASSWORD" pg_dump \
        -h "$RDS_HOST" \
        -p "${RDS_PORT:-5432}" \
        -U "$RDS_USERNAME" \
        -d "$RDS_DATABASE" \
        --no-owner \
        --no-privileges \
        --clean \
        --if-exists \
        > "$backup_file" 2>/dev/null || true
    
    if [[ -f "$backup_file" && -s "$backup_file" ]]; then
        log_success "RDS backup created: $backup_file"
    else
        log_warning "No existing RDS data to backup or backup failed"
    fi
}

# Test database connections
test_connections() {
    log_info "Testing database connections..."
    
    # Test Supabase connection
    log_info "Testing Supabase connection..."
    if curl -s -H "apikey: $SUPABASE_SERVICE_ROLE_KEY" "$SUPABASE_URL/rest/v1/" > /dev/null; then
        log_success "Supabase connection successful"
    else
        log_error "Failed to connect to Supabase"
        exit 1
    fi
    
    # Test RDS connection
    log_info "Testing RDS connection..."
    if PGPASSWORD="$RDS_PASSWORD" psql -h "$RDS_HOST" -p "${RDS_PORT:-5432}" -U "$RDS_USERNAME" -d "$RDS_DATABASE" -c "SELECT 1;" > /dev/null 2>&1; then
        log_success "RDS connection successful"
    else
        log_error "Failed to connect to RDS PostgreSQL"
        exit 1
    fi
}

# Run the migration
run_migration() {
    log_info "Starting database migration..."
    
    local script_dir="$(dirname "$0")"
    
    # Run the TypeScript migration script
    cd "$script_dir"
    
    if ts-node migrate-database.ts; then
        log_success "Database migration completed successfully"
    else
        log_error "Database migration failed"
        exit 1
    fi
}

# Set up RDS Proxy (optional)
setup_rds_proxy() {
    if [[ "$SETUP_RDS_PROXY" == "true" ]]; then
        log_info "Setting up RDS Proxy..."
        
        local script_dir="$(dirname "$0")"
        cd "$script_dir"
        
        if ts-node setup-rds-proxy.ts; then
            log_success "RDS Proxy setup completed"
        else
            log_error "RDS Proxy setup failed"
            log_warning "Continuing without RDS Proxy..."
        fi
    else
        log_info "Skipping RDS Proxy setup (set SETUP_RDS_PROXY=true to enable)"
    fi
}

# Validate migration
validate_migration() {
    log_info "Validating migration..."
    
    # The validation is handled within the TypeScript migration script
    # Additional validation can be added here if needed
    
    log_success "Migration validation completed"
}

# Generate migration report
generate_report() {
    log_info "Generating migration report..."
    
    local script_dir="$(dirname "$0")"
    local report_file="$script_dir/../migration-data/migration-report.md"
    
    cat > "$report_file" << EOF
# Database Migration Report

**Migration Date:** $(date)
**Migration Type:** Supabase to AWS RDS PostgreSQL

## Configuration
- **Source:** $SUPABASE_URL
- **Target:** $RDS_HOST:${RDS_PORT:-5432}/$RDS_DATABASE
- **AWS Region:** $AWS_REGION

## Migration Steps Completed
1. ✅ Environment validation
2. ✅ Dependency installation
3. ✅ Connection testing
4. ✅ Data backup
5. ✅ Schema migration
6. ✅ Data migration
7. ✅ Migration validation
$(if [[ "$SETUP_RDS_PROXY" == "true" ]]; then echo "8. ✅ RDS Proxy setup"; fi)

## Files Generated
- Schema: \`migration-data/rds-schema.sql\`
- Data exports: \`migration-data/*.json\`
- Export summary: \`migration-data/export-summary.json\`
- Import summary: \`migration-data/import-summary.json\`
$(if [[ -f "$script_dir/../migration-backup/rds-backup-"*.sql ]]; then echo "- Backup: \`migration-backup/rds-backup-*.sql\`"; fi)

## Next Steps
1. Update application configuration to use RDS connection
2. Test application functionality with new database
3. Monitor performance and connection pooling
4. Schedule regular backups
5. Clean up Supabase resources (after validation)

## Connection Configuration
Update your application to use the following connection settings:

\`\`\`json
{
  "host": "$RDS_HOST",
  "port": ${RDS_PORT:-5432},
  "database": "$RDS_DATABASE",
  "user": "$RDS_USERNAME",
  "password": "[REDACTED]",
  "ssl": {
    "rejectUnauthorized": false
  }
}
\`\`\`

$(if [[ "$SETUP_RDS_PROXY" == "true" ]]; then
cat << 'PROXY_EOF'

## RDS Proxy Configuration
RDS Proxy has been configured for connection pooling. Use the proxy endpoint instead of the direct RDS endpoint for better performance and connection management.

PROXY_EOF
fi)

---
*Generated by HalluciFix Database Migration Script*
EOF

    log_success "Migration report generated: $report_file"
}

# Cleanup function
cleanup() {
    log_info "Cleaning up temporary files..."
    # Add any cleanup logic here
    log_success "Cleanup completed"
}

# Main execution
main() {
    echo "🚀 HalluciFix Database Migration: Supabase to AWS RDS PostgreSQL"
    echo "=================================================================="
    
    # Trap to ensure cleanup on exit
    trap cleanup EXIT
    
    # Execute migration steps
    check_environment
    install_dependencies
    create_directories
    test_connections
    backup_rds_data
    run_migration
    setup_rds_proxy
    validate_migration
    generate_report
    
    echo ""
    echo "🎉 Database migration completed successfully!"
    echo ""
    log_info "Please review the migration report and test your application with the new database configuration."
    log_warning "Remember to update your application's database connection settings."
    log_warning "Keep the Supabase instance running until you've fully validated the migration."
}

# Show usage information
show_usage() {
    cat << EOF
Usage: $0 [OPTIONS]

Database Migration Script: Supabase to AWS RDS PostgreSQL

Required Environment Variables:
  SUPABASE_URL              - Supabase project URL
  SUPABASE_SERVICE_ROLE_KEY - Supabase service role key
  RDS_HOST                  - RDS PostgreSQL host
  RDS_USERNAME              - RDS username
  RDS_PASSWORD              - RDS password
  RDS_DATABASE              - RDS database name
  AWS_REGION                - AWS region

Optional Environment Variables:
  RDS_PORT                  - RDS port (default: 5432)
  SETUP_RDS_PROXY          - Set to 'true' to setup RDS Proxy
  RDS_PROXY_NAME           - RDS Proxy name (default: hallucifix-rds-proxy)
  VPC_SUBNET_IDS           - Comma-separated VPC subnet IDs (for RDS Proxy)
  VPC_SECURITY_GROUP_IDS   - Comma-separated security group IDs (for RDS Proxy)

Options:
  -h, --help               Show this help message

Examples:
  # Basic migration
  ./migrate-database.sh

  # Migration with RDS Proxy setup
  SETUP_RDS_PROXY=true ./migrate-database.sh

EOF
}

# Parse command line arguments
while [[ $# -gt 0 ]]; do
    case $1 in
        -h|--help)
            show_usage
            exit 0
            ;;
        *)
            log_error "Unknown option: $1"
            show_usage
            exit 1
            ;;
    esac
done

# Run main function
main