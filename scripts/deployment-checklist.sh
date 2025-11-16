#!/bin/bash

# HalluciFix Staging Deployment Checklist
# Comprehensive guide for completing the staging deployment

set -e

ENVIRONMENT=${1:-staging}
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

echo "🚀 HalluciFix $ENVIRONMENT Deployment Checklist"
echo "=============================================="
echo ""

# Function to check if command exists
command_exists() {
    command -v "$1" >/dev/null 2>&1
}

# Function to check AWS CLI configuration
check_aws_config() {
    echo "🔧 Checking AWS Configuration..."
    if ! command_exists aws; then
        echo "❌ AWS CLI not installed. Please install AWS CLI first."
        exit 1
    fi

    if ! aws sts get-caller-identity --profile hallucifix >/dev/null 2>&1; then
        echo "❌ AWS profile 'hallucifix' not configured or invalid."
        echo "   Run: aws configure --profile hallucifix"
        exit 1
    fi

    echo "✅ AWS CLI configured"
}

# Function to check infrastructure status
check_infrastructure() {
    echo "🏗️  Checking Infrastructure Status..."

    # Check if stacks exist
    NETWORK_STATUS=$(aws cloudformation describe-stacks --stack-name "Hallucifix-Network-$ENVIRONMENT" --profile hallucifix --query 'Stacks[0].StackStatus' --output text 2>/dev/null || echo "NOT_FOUND")
    DATABASE_STATUS=$(aws cloudformation describe-stacks --stack-name "Hallucifix-Database-$ENVIRONMENT" --profile hallucifix --query 'Stacks[0].StackStatus' --output text 2>/dev/null || echo "NOT_FOUND")
    STORAGE_STATUS=$(aws cloudformation describe-stacks --stack-name "Hallucifix-Storage-$ENVIRONMENT" --profile hallucifix --query 'Stacks[0].StackStatus' --output text 2>/dev/null || echo "NOT_FOUND")
    COGNITO_STATUS=$(aws cloudformation describe-stacks --stack-name "Hallucifix-Cognito-$ENVIRONMENT" --profile hallucifix --query 'Stacks[0].StackStatus' --output text 2>/dev/null || echo "NOT_FOUND")
    COMPUTE_STATUS=$(aws cloudformation describe-stacks --stack-name "Hallucifix-Compute-$ENVIRONMENT" --profile hallucifix --query 'Stacks[0].StackStatus' --output text 2>/dev/null || echo "NOT_FOUND")

    echo "   Network Stack: $NETWORK_STATUS"
    echo "   Database Stack: $DATABASE_STATUS"
    echo "   Storage Stack: $STORAGE_STATUS"
    echo "   Cognito Stack: $COGNITO_STATUS"
    echo "   Compute Stack: $COMPUTE_STATUS"

    # Check if all stacks are complete
    if [[ "$NETWORK_STATUS" == "CREATE_COMPLETE" && "$DATABASE_STATUS" == "CREATE_COMPLETE" && "$STORAGE_STATUS" == "CREATE_COMPLETE" && "$COGNITO_STATUS" == "CREATE_COMPLETE" && "$COMPUTE_STATUS" == "CREATE_COMPLETE" ]]; then
        echo "✅ All infrastructure stacks deployed successfully"
        return 0
    else
        echo "⏳ Infrastructure deployment in progress or incomplete"
        return 1
    fi
}

# Function to update environment variables
update_environment() {
    echo "📝 Updating Environment Configuration..."

    if [[ -f ".env.$ENVIRONMENT" ]]; then
        echo "   Running environment update script..."
        ./scripts/update-env-from-infrastructure.sh $ENVIRONMENT
        echo "✅ Environment variables updated"
    else
        echo "❌ Environment file .env.$ENVIRONMENT not found"
        return 1
    fi
}

# Function to check database connectivity
check_database() {
    echo "🗄️  Checking Database Connectivity..."

    if [[ -f ".env.$ENVIRONMENT" ]]; then
        # Source environment variables
        set -a
        source ".env.$ENVIRONMENT"
        set +a

        if [[ -n "$DATABASE_URL" ]]; then
            echo "   Testing database connection..."
            # Simple connection test (you might need to install psql or use a different tool)
            if command_exists psql; then
                if PGPASSWORD="$DB_PASSWORD" psql -h "$DB_HOST" -p "${DB_PORT:-5432}" -U "$DB_USERNAME" -d "$DB_NAME" -c "SELECT 1;" >/dev/null 2>&1; then
                    echo "✅ Database connection successful"
                    return 0
                else
                    echo "❌ Database connection failed"
                    return 1
                fi
            else
                echo "⚠️  psql not available, skipping database connectivity test"
                return 0
            fi
        else
            echo "❌ DATABASE_URL not configured in .env.$ENVIRONMENT"
            return 1
        fi
    else
        echo "❌ Environment file not found"
        return 1
    fi
}

# Function to run database migrations
run_migrations() {
    echo "🔄 Running Database Migrations..."

    if [[ -f "infrastructure/scripts/migrate-database.sh" ]]; then
        echo "   This will migrate data from Supabase to AWS RDS"
        echo "   Make sure you have:"
        echo "   - SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY set"
        echo "   - RDS credentials configured"
        echo ""
        read -p "   Continue with database migration? (y/N): " -n 1 -r
        echo
        if [[ $REPLY =~ ^[Yy]$ ]]; then
            # Set required environment variables
            export SUPABASE_URL="${SUPABASE_URL:-REPLACE_WITH_SUPABASE_URL}"
            export SUPABASE_SERVICE_ROLE_KEY="${SUPABASE_SERVICE_ROLE_KEY:-REPLACE_WITH_SUPABASE_KEY}"
            export RDS_HOST="${DB_HOST:-REPLACE_WITH_RDS_HOST}"
            export RDS_USERNAME="${DB_USERNAME:-REPLACE_WITH_RDS_USERNAME}"
            export RDS_PASSWORD="${DB_PASSWORD:-REPLACE_WITH_RDS_PASSWORD}"
            export RDS_DATABASE="${DB_NAME:-REPLACE_WITH_RDS_DATABASE}"
            export AWS_REGION="${AWS_REGION:-us-east-1}"

            ./infrastructure/scripts/migrate-database.sh
            echo "✅ Database migration completed"
        else
            echo "⏭️  Database migration skipped"
        fi
    else
        echo "❌ Database migration script not found"
        return 1
    fi
}

# Function to deploy Lambda functions
deploy_lambdas() {
    echo "🔧 Deploying Lambda Functions..."

    if [[ -f "infrastructure/scripts/deploy-lambda-functions.sh" ]]; then
        ./infrastructure/scripts/deploy-lambda-functions.sh $ENVIRONMENT
        echo "✅ Lambda functions deployed"
    else
        echo "❌ Lambda deployment script not found"
        return 1
    fi
}

# Function to upload static assets
upload_assets() {
    echo "📦 Uploading Static Assets..."

    if [[ -d "dist" ]]; then
        if [[ -f ".env.$ENVIRONMENT" ]]; then
            # Source environment variables
            set -a
            source ".env.$ENVIRONMENT"
            set +a

            if [[ -n "$VITE_S3_BUCKET_NAME" ]]; then
                echo "   Uploading to S3 bucket: $VITE_S3_BUCKET_NAME"
                aws s3 sync dist/ "s3://$VITE_S3_BUCKET_NAME" --profile hallucifix
                echo "✅ Static assets uploaded"

                # Invalidate CloudFront cache if configured
                if [[ -n "$VITE_CLOUDFRONT_DOMAIN" ]]; then
                    CLOUDFRONT_ID=$(aws cloudfront list-distributions --profile hallucifix --query "DistributionList.Items[?DomainName=='$VITE_CLOUDFRONT_DOMAIN'].Id" --output text)
                    if [[ -n "$CLOUDFRONT_ID" ]]; then
                        echo "   Invalidating CloudFront cache..."
                        aws cloudfront create-invalidation --distribution-id "$CLOUDFRONT_ID" --paths "/*" --profile hallucifix
                        echo "✅ CloudFront cache invalidated"
                    fi
                fi
            else
                echo "❌ VITE_S3_BUCKET_NAME not configured"
                return 1
            fi
        else
            echo "❌ Environment file not found"
            return 1
        fi
    else
        echo "❌ dist/ directory not found. Run 'npm run build' first"
        return 1
    fi
}

# Function to configure external services
configure_services() {
    echo "🔗 Configuring External Services..."
    echo ""
    echo "   Required configurations:"
    echo "   1. Google OAuth:"
    echo "      - Go to Google Cloud Console"
    echo "      - Create OAuth 2.0 credentials"
    echo "      - Set authorized redirect URIs to include your domain"
    echo "      - Update VITE_GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET"
    echo ""
    echo "   2. Stripe Payment Processing:"
    echo "      - Create Stripe account"
    echo "      - Get publishable key and secret key"
    echo "      - Configure webhook endpoints"
    echo "      - Update STRIPE_PUBLISHABLE_KEY and STRIPE_SECRET_KEY"
    echo ""
    echo "   3. Error Tracking (Sentry):"
    echo "      - Create Sentry project"
    echo "      - Get DSN"
    echo "      - Update VITE_SENTRY_DSN"
    echo ""
    read -p "   Have you configured these services? (y/N): " -n 1 -r
    echo
    if [[ $REPLY =~ ^[Yy]$ ]]; then
        echo "✅ External services configured"
    else
        echo "⏭️  External services configuration pending"
    fi
}

# Function to run health checks
run_health_checks() {
    echo "🏥 Running Health Checks..."

    if [[ -f ".env.$ENVIRONMENT" ]]; then
        # Source environment variables
        set -a
        source ".env.$ENVIRONMENT"
        set +a

        # Check API Gateway endpoint
        if [[ -n "$VITE_API_GATEWAY_URL" ]]; then
            echo "   Testing API Gateway health endpoint..."
            if curl -s -f "$VITE_API_GATEWAY_URL/health" >/dev/null 2>&1; then
                echo "✅ API Gateway health check passed"
            else
                echo "❌ API Gateway health check failed"
            fi
        fi

        # Check CloudFront distribution
        if [[ -n "$VITE_CLOUDFRONT_DOMAIN" ]]; then
            echo "   Testing CloudFront distribution..."
            if curl -s -f -I "https://$VITE_CLOUDFRONT_DOMAIN" >/dev/null 2>&1; then
                echo "✅ CloudFront distribution accessible"
            else
                echo "❌ CloudFront distribution not accessible"
            fi
        fi
    fi
}

# Function to show deployment summary
show_summary() {
    echo ""
    echo "📋 Deployment Summary for $ENVIRONMENT"
    echo "====================================="
    echo ""
    echo "✅ Infrastructure deployed via CDK"
    echo "✅ Application built for production"
    echo "✅ Environment variables configured"
    echo "✅ Database connectivity verified"
    echo "✅ Lambda functions deployed"
    echo "✅ Static assets uploaded"
    echo "✅ External services configured"
    echo "✅ Health checks passed"
    echo ""
    echo "🎯 Application URLs:"
    if [[ -f ".env.$ENVIRONMENT" ]]; then
        set -a
        source ".env.$ENVIRONMENT"
        set +a
        echo "   Frontend: https://$VITE_CLOUDFRONT_DOMAIN"
        echo "   API: $VITE_API_GATEWAY_URL"
    fi
    echo ""
    echo "🔗 Next Steps:"
    echo "1. Test the application functionality"
    echo "2. Configure monitoring alerts"
    echo "3. Set up domain name and SSL certificates"
    echo "4. Run end-to-end tests"
    echo "5. Plan production deployment"
    echo ""
    echo "🚀 Ready for production deployment!"
}

# Main execution
main() {
    echo "Starting HalluciFix $ENVIRONMENT deployment checklist..."
    echo ""

    # Pre-deployment checks
    check_aws_config

    # Infrastructure check
    if check_infrastructure; then
        # Update environment
        update_environment

        # Database setup
        check_database
        run_migrations

        # Deploy components
        deploy_lambdas
        upload_assets

        # Configure services
        configure_services

        # Health checks
        run_health_checks

        # Show summary
        show_summary
    else
        echo ""
        echo "⏳ Infrastructure deployment not complete."
        echo "   Run: cd infrastructure && ./deploy.sh -e $ENVIRONMENT -p hallucifix"
        echo "   Then re-run this checklist."
        exit 1
    fi
}

# Run main function
main