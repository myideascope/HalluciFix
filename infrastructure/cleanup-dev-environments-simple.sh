#!/bin/bash

# HalluciFix AWS Development Environment Cleanup Script - SIMPLIFIED VERSION
# Removes all development and staging AWS resources

set -e

# Default values
ENVIRONMENT="dev"
PROFILE="hallucifix"
REGION="us-east-1"
DRY_RUN=false
FORCE_DELETE=false

# AWS Account ID (update with your actual account ID)
AWS_ACCOUNT_ID="135167710042"

# Function to show help
show_help() {
    echo "HalluciFix AWS Development Environment Cleanup Script"
    echo ""
    echo "Usage: $0 [OPTIONS]"
    echo ""
    echo "Options:"
    echo "  -e, --environment  Environment to cleanup (dev, staging) [default: dev]"
    echo "  -p, --profile      AWS profile to use [default: hallucifix]"
    echo "  -r, --region       AWS region [default: us-east-1]"
    echo "  -d, --dry-run      Show what would be deleted without actually deleting"
    echo "  -f, --force        Force deletion without confirmation prompts"
    echo "  -h, --help         Show this help message"
    echo ""
    echo "Examples:"
    echo "  $0 -e dev                    # Cleanup dev environment"
    echo "  $0 -e staging -d            # Dry run cleanup of staging environment"
    echo "  $0 -e dev -f                # Force cleanup of dev environment"
}

# Function to confirm action
confirm_action() {
    if [[ "$FORCE_DELETE" == "true" ]]; then
        return 0
    fi
    
    echo -n "Are you sure you want to proceed? [y/N]: "
    read -r response
    case "$response" in
        [yY]|[yY][eE][sS]) return 0 ;;
        *) return 1 ;;
    esac
}

# Function to check AWS CLI and credentials
check_aws_setup() {
    echo "Checking AWS Setup..."
    
    if ! command -v aws &> /dev/null; then
        echo "ERROR: AWS CLI not found. Please install AWS CLI first."
        exit 1
    fi
    
    if ! aws sts get-caller-identity --profile "$PROFILE" --region "$REGION" &> /dev/null; then
        echo "ERROR: Unable to authenticate with AWS profile '$PROFILE'"
        exit 1
    fi
    
    local current_account=$(aws sts get-caller-identity --profile "$PROFILE" --region "$REGION" --query Account --output text)
    if [[ "$current_account" != "$AWS_ACCOUNT_ID" ]]; then
        echo "WARNING: AWS account mismatch. Expected: $AWS_ACCOUNT_ID, Current: $current_account"
    fi
    
    echo "AWS setup verified"
}

# Function to list and delete CloudFormation stacks
cleanup_cloudformation_stacks() {
    local env="$1"
    echo "Finding CloudFormation Stacks for $env environment..."
    
    local stacks=$(aws cloudformation list-stacks \
        --profile "$PROFILE" \
        --region "$REGION" \
        --stack-status-filter CREATE_COMPLETE UPDATE_COMPLETE \
        --query "StackSummaries[?contains(StackName, '$env')].StackName" \
        --output text)
    
    if [[ -n "$stacks" ]]; then
        echo "Found stacks:"
        echo "$stacks" | while IFS= read -r stack; do
            if [[ -n "$stack" ]]; then
                echo "  $stack"
                if [[ "$DRY_RUN" == "true" ]]; then
                    echo "  DRY RUN: Would delete stack $stack"
                else
                    echo "Deleting stack: $stack"
                    aws cloudformation delete-stack \
                        --stack-name "$stack" \
                        --profile "$PROFILE" \
                        --region "$REGION"
                    echo "Initiated deletion of stack $stack"
                fi
            fi
        done
        
        # Wait for deletions to complete if not dry run
        if [[ "$DRY_RUN" == "false" ]]; then
            echo "Waiting for stack deletions to complete..."
            echo "$stacks" | while IFS= read -r stack; do
                if [[ -n "$stack" ]]; then
                    echo "Waiting for stack deletion: $stack"
                    aws cloudformation wait stack-delete-complete \
                        --stack-name "$stack" \
                        --profile "$PROFILE" \
                        --region "$REGION" || echo "Timeout waiting for $stack deletion"
                    echo "Stack $stack deletion completed"
                fi
            done
        fi
    else
        echo "No CloudFormation stacks found for $env environment"
    fi
}

# Function to list and delete S3 buckets
cleanup_s3_buckets() {
    local env="$1"
    echo "Finding S3 Buckets for $env environment..."
    
    local buckets=$(aws s3api list-buckets \
        --profile "$PROFILE" \
        --region "$REGION" \
        --query "Buckets[?contains(Name, '$env')].Name" \
        --output text)
    
    if [[ -n "$buckets" ]]; then
        echo "Found buckets:"
        echo "$buckets" | while IFS= read -r bucket; do
            if [[ -n "$bucket" ]]; then
                echo "  $bucket"
                if [[ "$DRY_RUN" == "true" ]]; then
                    echo "  DRY RUN: Would delete bucket $bucket and all its contents"
                else
                    echo "Deleting bucket: $bucket and all its contents"
                    # Empty bucket first
                    aws s3 rm "s3://$bucket" --recursive --profile "$PROFILE" --region "$REGION"
                    # Delete bucket
                    aws s3api delete-bucket --bucket "$bucket" --profile "$PROFILE" --region "$REGION"
                    echo "Deleted bucket $bucket"
                fi
            fi
        done
    else
        echo "No S3 buckets found for $env environment"
    fi
}

# Function to list and delete Lambda functions
cleanup_lambda_functions() {
    local env="$1"
    echo "Finding Lambda Functions for $env environment..."
    
    local functions=$(aws lambda list-functions \
        --profile "$PROFILE" \
        --region "$REGION" \
        --query "Functions[?contains(FunctionName, '$env')].FunctionName" \
        --output text)
    
    if [[ -n "$functions" ]]; then
        echo "Found functions:"
        echo "$functions" | while IFS= read -r function_name; do
            if [[ -n "$function_name" ]]; then
                echo "  $function_name"
                if [[ "$DRY_RUN" == "true" ]]; then
                    echo "  DRY RUN: Would delete Lambda function $function_name"
                else
                    echo "Deleting Lambda function: $function_name"
                    aws lambda delete-function \
                        --function-name "$function_name" \
                        --profile "$PROFILE" \
                        --region "$REGION"
                    echo "Deleted Lambda function $function_name"
                fi
            fi
        done
    else
        echo "No Lambda functions found for $env environment"
    fi
}

# Function to list and delete RDS instances
cleanup_rds_instances() {
    local env="$1"
    echo "Finding RDS Instances for $env environment..."
    
    local instances=$(aws rds describe-db-instances \
        --profile "$PROFILE" \
        --region "$REGION" \
        --query "DBInstances[?contains(DBInstanceIdentifier, '$env')].DBInstanceIdentifier" \
        --output text)
    
    if [[ -n "$instances" ]]; then
        echo "Found instances:"
        echo "$instances" | while IFS= read -r instance; do
            if [[ -n "$instance" ]]; then
                echo "  $instance"
                if [[ "$DRY_RUN" == "true" ]]; then
                    echo "  DRY RUN: Would delete RDS instance $instance"
                else
                    echo "Deleting RDS instance: $instance"
                    aws rds delete-db-instance \
                        --db-instance-identifier "$instance" \
                        --skip-final-snapshot \
                        --profile "$PROFILE" \
                        --region "$REGION"
                    echo "Initiated deletion of RDS instance $instance"
                fi
            fi
        done
    else
        echo "No RDS instances found for $env environment"
    fi
}

# Function to list and delete ElastiCache clusters
cleanup_elasticache_clusters() {
    local env="$1"
    echo "Finding ElastiCache Clusters for $env environment..."
    
    local clusters=$(aws elasticache describe-cache-clusters \
        --profile "$PROFILE" \
        --region "$REGION" \
        --query "CacheClusters[?contains(CacheClusterId, '$env')].CacheClusterId" \
        --output text)
    
    if [[ -n "$clusters" ]]; then
        echo "Found clusters:"
        echo "$clusters" | while IFS= read -r cluster; do
            if [[ -n "$cluster" ]]; then
                echo "  $cluster"
                if [[ "$DRY_RUN" == "true" ]]; then
                    echo "  DRY RUN: Would delete ElastiCache cluster $cluster"
                else
                    echo "Deleting ElastiCache cluster: $cluster"
                    aws elasticache delete-cache-cluster \
                        --cache-cluster-id "$cluster" \
                        --profile "$PROFILE" \
                        --region "$REGION"
                    echo "Initiated deletion of ElastiCache cluster $cluster"
                fi
            fi
        done
    else
        echo "No ElastiCache clusters found for $env environment"
    fi
}

# Function to list and delete Cognito resources
cleanup_cognito_resources() {
    local env="$1"
    echo "Finding Cognito Resources for $env environment..."
    
    # Find User Pools
    local user_pools=$(aws cognito-idp list-user-pools \
        --profile "$PROFILE" \
        --region "$REGION" \
        --max-results 60 \
        --query "UserPools[?contains(Name, '$env')].Id" \
        --output text)
    
    if [[ -n "$user_pools" ]]; then
        echo "Found User Pools:"
        echo "$user_pools" | while IFS= read -r pool_id; do
            if [[ -n "$pool_id" ]]; then
                echo "  $pool_id"
                if [[ "$DRY_RUN" == "true" ]]; then
                    echo "  DRY RUN: Would delete Cognito User Pool $pool_id"
                else
                    echo "Deleting Cognito User Pool: $pool_id"
                    aws cognito-idp delete-user-pool --user-pool-id "$pool_id" --profile "$PROFILE" --region "$REGION"
                    echo "Deleted Cognito User Pool $pool_id"
                fi
            fi
        done
    else
        echo "No Cognito User Pools found for $env environment"
    fi
    
    # Find Identity Pools
    local identity_pools=$(aws cognito-identity list-identity-pools \
        --profile "$PROFILE" \
        --region "$REGION" \
        --max-results 60 \
        --query "IdentityPools[?contains(IdentityPoolName, '$env')].IdentityPoolId" \
        --output text)
    
    if [[ -n "$identity_pools" ]]; then
        echo "Found Identity Pools:"
        echo "$identity_pools" | while IFS= read -r pool_id; do
            if [[ -n "$pool_id" ]]; then
                echo "  $pool_id"
                if [[ "$DRY_RUN" == "true" ]]; then
                    echo "  DRY RUN: Would delete Cognito Identity Pool $pool_id"
                else
                    echo "Deleting Cognito Identity Pool: $pool_id"
                    aws cognito-identity delete-identity-pool --identity-pool-id "$pool_id" --profile "$PROFILE" --region "$REGION"
                    echo "Deleted Cognito Identity Pool $pool_id"
                fi
            fi
        done
    else
        echo "No Cognito Identity Pools found for $env environment"
    fi
}

# Function to list and delete KMS keys
cleanup_kms_keys() {
    local env="$1"
    echo "Finding KMS Keys for $env environment..."
    
    local keys=$(aws kms list-keys \
        --profile "$PROFILE" \
        --region "$REGION" \
        --query "Keys[?contains(KeyManager, 'CUSTOMER') && contains(Description, '$env')].KeyId" \
        --output text)
    
    if [[ -n "$keys" ]]; then
        echo "Found KMS keys:"
        echo "$keys" | while IFS= read -r key_id; do
            if [[ -n "$key_id" ]]; then
                echo "  $key_id"
                if [[ "$DRY_RUN" == "true" ]]; then
                    echo "  DRY RUN: Would delete KMS key $key_id"
                else
                    echo "Deleting KMS key: $key_id"
                    aws kms schedule-key-deletion \
                        --key-id "$key_id" \
                        --pending-window-in-days 7 \
                        --profile "$PROFILE" \
                        --region "$REGION"
                    echo "Scheduled deletion of KMS key $key_id"
                fi
            fi
        done
    else
        echo "No KMS keys found for $env environment"
    fi
}

# Function to list and delete CloudWatch resources
cleanup_cloudwatch_resources() {
    local env="$1"
    echo "Finding CloudWatch Resources for $env environment..."
    
    # Delete log groups
    local log_groups=$(aws logs describe-log-groups \
        --profile "$PROFILE" \
        --region "$REGION" \
        --query "logGroups[?contains(logGroupName, '$env')].logGroupName" \
        --output text)
    
    if [[ -n "$log_groups" ]]; then
        echo "Found Log Groups:"
        echo "$log_groups" | while IFS= read -r log_group; do
            if [[ -n "$log_group" ]]; then
                echo "  $log_group"
                if [[ "$DRY_RUN" == "true" ]]; then
                    echo "  DRY RUN: Would delete CloudWatch Log Group $log_group"
                else
                    echo "Deleting CloudWatch Log Group: $log_group"
                    aws logs delete-log-group \
                        --log-group-name "$log_group" \
                        --profile "$PROFILE" \
                        --region "$REGION"
                    echo "Deleted CloudWatch Log Group $log_group"
                fi
            fi
        done
    else
        echo "No CloudWatch Log Groups found for $env environment"
    fi
    
    # Delete dashboards
    local dashboards=$(aws cloudwatch list-dashboards \
        --profile "$PROFILE" \
        --region "$REGION" \
        --query "DashboardEntries[?contains(DashboardName, '$env')].DashboardName" \
        --output text)
    
    if [[ -n "$dashboards" ]]; then
        echo "Found Dashboards:"
        echo "$dashboards" | while IFS= read -r dashboard; do
            if [[ -n "$dashboard" ]]; then
                echo "  $dashboard"
                if [[ "$DRY_RUN" == "true" ]]; then
                    echo "  DRY RUN: Would delete CloudWatch Dashboard $dashboard"
                else
                    echo "Deleting CloudWatch Dashboard: $dashboard"
                    aws cloudwatch delete-dashboards \
                        --dashboard-names "$dashboard" \
                        --profile "$PROFILE" \
                        --region "$REGION"
                    echo "Deleted CloudWatch Dashboard $dashboard"
                fi
            fi
        done
    else
        echo "No CloudWatch Dashboards found for $env environment"
    fi
}

# Function to list and delete SNS topics
cleanup_sns_topics() {
    local env="$1"
    echo "Finding SNS Topics for $env environment..."
    
    local topics=$(aws sns list-topics \
        --profile "$PROFILE" \
        --region "$REGION" \
        --query "Topics[?contains(TopicArn, '$env')].TopicArn" \
        --output text)
    
    if [[ -n "$topics" ]]; then
        echo "Found SNS Topics:"
        echo "$topics" | while IFS= read -r topic_arn; do
            if [[ -n "$topic_arn" ]]; then
                echo "  $topic_arn"
                if [[ "$DRY_RUN" == "true" ]]; then
                    echo "  DRY RUN: Would delete SNS topic $topic_arn"
                else
                    echo "Deleting SNS topic: $topic_arn"
                    aws sns delete-topic \
                        --topic-arn "$topic_arn" \
                        --profile "$PROFILE" \
                        --region "$REGION"
                    echo "Deleted SNS topic $topic_arn"
                fi
            fi
        done
    else
        echo "No SNS topics found for $env environment"
    fi
}

# Function to cleanup IAM resources
cleanup_iam_resources() {
    local env="$1"
    echo "Finding IAM Resources for $env environment..."
    
    # Delete roles
    local roles=$(aws iam list-roles \
        --profile "$PROFILE" \
        --query "Roles[?contains(RoleName, '$env')].RoleName" \
        --output text)
    
    if [[ -n "$roles" ]]; then
        echo "Found IAM Roles:"
        echo "$roles" | while IFS= read -r role_name; do
            if [[ -n "$role_name" ]]; then
                echo "  $role_name"
                if [[ "$DRY_RUN" == "true" ]]; then
                    echo "  DRY RUN: Would delete IAM role $role_name"
                else
                    echo "Deleting IAM role: $role_name"
                    # Detach policies first
                    local policies=$(aws iam list-attached-role-policies --role-name "$role_name" --profile "$PROFILE" --query "AttachedPolicies[].PolicyArn" --output text)
                    echo "$policies" | while IFS= read -r policy_arn; do
                        if [[ -n "$policy_arn" ]]; then
                            aws iam detach-role-policy --role-name "$role_name" --policy-arn "$policy_arn" --profile "$PROFILE"
                        fi
                    done
                    # Delete role
                    aws iam delete-role --role-name "$role_name" --profile "$PROFILE"
                    echo "Deleted IAM role $role_name"
                fi
            fi
        done
    else
        echo "No IAM roles found for $env environment"
    fi
    
    # Delete policies
    local policies=$(aws iam list-policies \
        --profile "$PROFILE" \
        --scope Local \
        --query "Policies[?contains(PolicyName, '$env')].Arn" \
        --output text)
    
    if [[ -n "$policies" ]]; then
        echo "Found IAM Policies:"
        echo "$policies" | while IFS= read -r policy_arn; do
            if [[ -n "$policy_arn" ]]; then
                echo "  $policy_arn"
                if [[ "$DRY_RUN" == "true" ]]; then
                    echo "  DRY RUN: Would delete IAM policy $policy_arn"
                else
                    echo "Deleting IAM policy: $policy_arn"
                    aws iam delete-policy --policy-arn "$policy_arn" --profile "$PROFILE"
                    echo "Deleted IAM policy $policy_arn"
                fi
            fi
        done
    else
        echo "No IAM policies found for $env environment"
    fi
}

# Function to cleanup Secrets Manager
cleanup_secrets_manager() {
    local env="$1"
    echo "Finding Secrets Manager Secrets for $env environment..."
    
    local secrets=$(aws secretsmanager list-secrets \
        --profile "$PROFILE" \
        --region "$REGION" \
        --query "SecretList[?contains(Name, '$env')].Name" \
        --output text)
    
    if [[ -n "$secrets" ]]; then
        echo "Found Secrets:"
        echo "$secrets" | while IFS= read -r secret_name; do
            if [[ -n "$secret_name" ]]; then
                echo "  $secret_name"
                if [[ "$DRY_RUN" == "true" ]]; then
                    echo "  DRY RUN: Would delete Secrets Manager secret $secret_name"
                else
                    echo "Deleting Secrets Manager secret: $secret_name"
                    aws secretsmanager delete-secret \
                        --secret-id "$secret_name" \
                        --force-delete-without-recovery \
                        --profile "$PROFILE" \
                        --region "$REGION"
                    echo "Deleted Secrets Manager secret $secret_name"
                fi
            fi
        done
    else
        echo "No Secrets Manager secrets found for $env environment"
    fi
}

# Function to cleanup Parameter Store parameters
cleanup_parameter_store() {
    local env="$1"
    echo "Finding Parameter Store Parameters for $env environment..."
    
    local parameters=$(aws ssm describe-parameters \
        --profile "$PROFILE" \
        --region "$REGION" \
        --query "Parameters[?contains(Name, '$env')].Name" \
        --output text)
    
    if [[ -n "$parameters" ]]; then
        echo "Found Parameters:"
        echo "$parameters" | while IFS= read -r param_name; do
            if [[ -n "$param_name" ]]; then
                echo "  $param_name"
                if [[ "$DRY_RUN" == "true" ]]; then
                    echo "  DRY RUN: Would delete Parameter Store parameter $param_name"
                else
                    echo "Deleting Parameter Store parameter: $param_name"
                    aws ssm delete-parameter \
                        --name "$param_name" \
                        --profile "$PROFILE" \
                        --region "$REGION"
                    echo "Deleted Parameter Store parameter $param_name"
                fi
            fi
        done
    else
        echo "No Parameter Store parameters found for $env environment"
    fi
}

# Parse command line arguments
while [[ $# -gt 0 ]]; do
    case $1 in
        -e|--environment)
            ENVIRONMENT="$2"
            shift 2
            ;;
        -p|--profile)
            PROFILE="$2"
            shift 2
            ;;
        -r|--region)
            REGION="$2"
            shift 2
            ;;
        -d|--dry-run)
            DRY_RUN=true
            shift
            ;;
        -f|--force)
            FORCE_DELETE=true
            shift
            ;;
        -h|--help)
            show_help
            exit 0
            ;;
        *)
            echo "Unknown option $1"
            show_help
            exit 1
            ;;
    esac
done

# Validate environment
if [[ "$ENVIRONMENT" != "dev" && "$ENVIRONMENT" != "staging" ]]; then
    echo "ERROR: Environment must be 'dev' or 'staging'"
    exit 1
fi

# Main execution
echo "HalluciFix AWS Development Environment Cleanup"
echo "Environment: $ENVIRONMENT"
echo "Profile: $PROFILE"
echo "Region: $REGION"
echo "Dry Run: $DRY_RUN"
echo ""

# Check if this is a development environment cleanup
echo "WARNING: This script will remove ALL AWS resources for the $ENVIRONMENT environment"
echo "WARNING: This action cannot be undone!"

if ! confirm_action; then
    echo "Cleanup cancelled"
    exit 0
fi

# Start cleanup process
check_aws_setup

# List all resources that will be cleaned up
echo "Resources to be Cleaned Up:"
echo "1. CloudFormation Stacks"
echo "2. S3 Buckets"
echo "3. Lambda Functions"
echo "4. RDS Instances"
echo "5. ElastiCache Clusters"
echo "6. Cognito User Pools and Identity Pools"
echo "7. KMS Keys"
echo "8. CloudWatch Log Groups and Dashboards"
echo "9. SNS Topics"
echo "10. IAM Roles and Policies"
echo "11. Secrets Manager Secrets"
echo "12. Parameter Store Parameters"
echo ""

# Execute cleanup in order
cleanup_cloudformation_stacks "$ENVIRONMENT"
cleanup_s3_buckets "$ENVIRONMENT"
cleanup_lambda_functions "$ENVIRONMENT"
cleanup_rds_instances "$ENVIRONMENT"
cleanup_elasticache_clusters "$ENVIRONMENT"
cleanup_cognito_resources "$ENVIRONMENT"
cleanup_kms_keys "$ENVIRONMENT"
cleanup_cloudwatch_resources "$ENVIRONMENT"
cleanup_sns_topics "$ENVIRONMENT"
cleanup_iam_resources "$ENVIRONMENT"
cleanup_secrets_manager "$ENVIRONMENT"
cleanup_parameter_store "$ENVIRONMENT"

echo "Cleanup completed for $ENVIRONMENT environment"

if [[ "$DRY_RUN" == "true" ]]; then
    echo "This was a dry run. No resources were actually deleted."
    echo "Run without --dry-run to perform actual cleanup."
fi