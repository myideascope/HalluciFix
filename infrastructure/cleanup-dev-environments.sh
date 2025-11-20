#!/bin/bash

# HalluciFix AWS Development Environment Cleanup Script
# Removes all development and staging AWS resources

set -e

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

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

# Function to print section headers
print_section() {
    echo -e "${BLUE}=== $1 ===${NC}"
}

# Function to print warning
print_warning() {
    echo -e "${YELLOW}⚠️  $1${NC}"
}

# Function to print success
print_success() {
    echo -e "${GREEN}✅ $1${NC}"
}

# Function to print error
print_error() {
    echo -e "${RED}❌ $1${NC}"
}

# Function to confirm action
confirm_action() {
    if [[ "$FORCE_DELETE" == "true" ]]; then
        return 0
    fi
    
    echo -n -e "${YELLOW}Are you sure you want to proceed? [y/N]: ${NC}"
    read -r response
    case "$response" in
        [yY]|[yY][eE][sS]) return 0 ;;
        *) return 1 ;;
    esac
}

# Function to check AWS CLI and credentials
check_aws_setup() {
    print_section "Checking AWS Setup"
    
    if ! command -v aws &> /dev/null; then
        print_error "AWS CLI not found. Please install AWS CLI first."
        exit 1
    fi
    
    if ! aws sts get-caller-identity --profile "$PROFILE" --region "$REGION" &> /dev/null; then
        print_error "Unable to authenticate with AWS profile '$PROFILE'"
        exit 1
    fi
    
    local current_account=$(aws sts get-caller-identity --profile "$PROFILE" --region "$REGION" --query Account --output text)
    if [[ "$current_account" != "$AWS_ACCOUNT_ID" ]]; then
        print_warning "AWS account mismatch. Expected: $AWS_ACCOUNT_ID, Current: $current_account"
    fi
    
    print_success "AWS setup verified"
}

# Function to list CloudFormation stacks for environment
list_stacks() {
    local env="$1"
    print_section "Finding CloudFormation Stacks for $env environment"
    
    local stacks=$(aws cloudformation list-stacks \
        --profile "$PROFILE" \
        --region "$REGION" \
        --stack-status-filter CREATE_COMPLETE UPDATE_COMPLETE \
        --query "StackSummaries[?contains(StackName, '$env')].StackName" \
        --output text)
    
    if [[ -n "$stacks" ]]; then
        echo "$stacks" | while IFS= read -r stack; do
            echo "  $stack"
        done
    else
        print_warning "No stacks found for $env environment"
    fi
    
    echo "$stacks"
}

# Function to delete CloudFormation stacks
delete_stacks() {
    local env="$1"
    local stacks="$2"
    
    if [[ -z "$stacks" ]]; then
        print_warning "No stacks to delete for $env environment"
        return 0
    fi
    
    print_section "Deleting CloudFormation Stacks for $env environment"
    
    echo "$stacks" | while IFS= read -r stack; do
        if [[ -n "$stack" ]]; then
            if [[ "$DRY_RUN" == "true" ]]; then
                print_warning "DRY RUN: Would delete stack $stack"
            else
                print_warning "Deleting stack: $stack"
                aws cloudformation delete-stack \
                    --stack-name "$stack" \
                    --profile "$PROFILE" \
                    --region "$REGION"
                print_success "Initiated deletion of stack $stack"
            fi
        fi
    done
}

# Function to list and delete S3 buckets
cleanup_s3_buckets() {
    local env="$1"
    print_section "Finding S3 Buckets for $env environment"
    
    local buckets=$(aws s3api list-buckets \
        --profile "$PROFILE" \
        --region "$REGION" \
        --query "Buckets[?contains(Name, '$env')].Name" \
        --output text)
    
    if [[ -n "$buckets" ]]; then
        echo "$buckets" | while IFS= read -r bucket; do
            if [[ -n "$bucket" ]]; then
                echo "  $bucket"
                if [[ "$DRY_RUN" == "true" ]]; then
                    print_warning "DRY RUN: Would delete bucket $bucket and all its contents"
                else
                    print_warning "Deleting bucket: $bucket and all its contents"
                    # Empty bucket first
                    aws s3 rm "s3://$bucket" --recursive --profile "$PROFILE" --region "$REGION"
                    # Delete bucket
                    aws s3api delete-bucket --bucket "$bucket" --profile "$PROFILE" --region "$REGION"
                    print_success "Deleted bucket $bucket"
                fi
            fi
        done
    else
        print_warning "No S3 buckets found for $env environment"
    fi
}

# Function to list and delete Lambda functions
cleanup_lambda_functions() {
    local env="$1"
    print_section "Finding Lambda Functions for $env environment"
    
    local functions=$(aws lambda list-functions \
        --profile "$PROFILE" \
        --region "$REGION" \
        --query "Functions[?contains(FunctionName, '$env')].FunctionName" \
        --output text)
    
    if [[ -n "$functions" ]]; then
        echo "$functions" | while IFS= read -r function_name; do
            if [[ -n "$function_name" ]]; then
                echo "  $function_name"
                if [[ "$DRY_RUN" == "true" ]]; then
                    print_warning "DRY RUN: Would delete Lambda function $function_name"
                else
                    print_warning "Deleting Lambda function: $function_name"
                    aws lambda delete-function \
                        --function-name "$function_name" \
                        --profile "$PROFILE" \
                        --region "$REGION"
                    print_success "Deleted Lambda function $function_name"
                fi
            fi
        done
    else
        print_warning "No Lambda functions found for $env environment"
    fi
}

# Function to list and delete RDS instances
cleanup_rds_instances() {
    local env="$1"
    print_section "Finding RDS Instances for $env environment"
    
    local instances=$(aws rds describe-db-instances \
        --profile "$PROFILE" \
        --region "$REGION" \
        --query "DBInstances[?contains(DBInstanceIdentifier, '$env')].DBInstanceIdentifier" \
        --output text)
    
    if [[ -n "$instances" ]]; then
        echo "$instances" | while IFS= read -r instance; do
            if [[ -n "$instance" ]]; then
                echo "  $instance"
                if [[ "$DRY_RUN" == "true" ]]; then
                    print_warning "DRY RUN: Would delete RDS instance $instance"
                else
                    print_warning "Deleting RDS instance: $instance"
                    aws rds delete-db-instance \
                        --db-instance-identifier "$instance" \
                        --skip-final-snapshot \
                        --delete-automated-backups \
                        --profile "$PROFILE" \
                        --region "$REGION"
                    print_success "Initiated deletion of RDS instance $instance"
                fi
            fi
        done
    else
        print_warning "No RDS instances found for $env environment"
    fi
}

# Function to list and delete ElastiCache clusters
cleanup_elasticache_clusters() {
    local env="$1"
    print_section "Finding ElastiCache Clusters for $env environment"
    
    local clusters=$(aws elasticache describe-cache-clusters \
        --profile "$PROFILE" \
        --region "$REGION" \
        --query "CacheClusters[?contains(CacheClusterId, '$env')].CacheClusterId" \
        --output text)
    
    if [[ -n "$clusters" ]]; then
        echo "$clusters" | while IFS= read -r cluster; do
            if [[ -n "$cluster" ]]; then
                echo "  $cluster"
                if [[ "$DRY_RUN" == "true" ]]; then
                    print_warning "DRY RUN: Would delete ElastiCache cluster $cluster"
                else
                    print_warning "Deleting ElastiCache cluster: $cluster"
                    aws elasticache delete-cache-cluster \
                        --cache-cluster-id "$cluster" \
                        --profile "$PROFILE" \
                        --region "$REGION"
                    print_success "Initiated deletion of ElastiCache cluster $cluster"
                fi
            fi
        done
    else
        print_warning "No ElastiCache clusters found for $env environment"
    fi
}

# Function to list and delete Cognito resources
cleanup_cognito_resources() {
    local env="$1"
    print_section "Finding Cognito Resources for $env environment"
    
    # Find User Pools
    local user_pools=$(aws cognito-idp list-user-pools \
        --profile "$PROFILE" \
        --region "$REGION" \
        --max-results 60 \
        --query "UserPools[?contains(Name, '$env')].Id" \
        --output text)
    
    if [[ -n "$user_pools" ]]; then
        echo "$user_pools" | while IFS= read -r pool_id; do
            if [[ -n "$pool_id" ]]; then
                echo "  User Pool: $pool_id"
                if [[ "$DRY_RUN" == "true" ]]; then
                    print_warning "DRY RUN: Would delete Cognito User Pool $pool_id"
                else
                    print_warning "Deleting Cognito User Pool: $pool_id"
                    aws cognito-idp delete-user-pool \
                        --user-pool-id "$pool_id" \
                        --profile "$PROFILE" \
                        --region "$REGION"
                    print_success "Deleted Cognito User Pool $pool_id"
                fi
            fi
        done
    else
        print_warning "No Cognito User Pools found for $env environment"
    fi
    
    # Find Identity Pools
    local identity_pools=$(aws cognito-identity list-identity-pools \
        --profile "$PROFILE" \
        --region "$REGION" \
        --max-results 60 \
        --query "IdentityPools[?contains(IdentityPoolName, '$env')].IdentityPoolId" \
        --output text)
    
    if [[ -n "$identity_pools" ]]; then
        echo "$identity_pools" | while IFS= read -r pool_id; do
            if [[ -n "$pool_id" ]]; then
                echo "  Identity Pool: $pool_id"
                if [[ "$DRY_RUN" == "true" ]]; then
                    print_warning "DRY RUN: Would delete Cognito Identity Pool $pool_id"
                else
                    print_warning "Deleting Cognito Identity Pool: $pool_id"
                    aws cognito-identity delete-identity-pool \
                        --identity-pool-id "$pool_id" \
                        --profile "$PROFILE" \
                        --region "$REGION"
                    print_success "Deleted Cognito Identity Pool $pool_id"
                fi
            fi
        done
    else
        print_warning "No Cognito Identity Pools found for $env environment"
    fi
}

# Function to list and delete KMS keys
cleanup_kms_keys() {
    local env="$1"
    print_section "Finding KMS Keys for $env environment"
    
    local keys=$(aws kms list-keys \
        --profile "$PROFILE" \
        --region "$REGION" \
        --query "Keys[?contains(KeyManager, 'CUSTOMER')].KeyArn" \
        --output text)
    
    # Filter keys by alias containing environment
    echo "$keys" | while IFS= read -r key_arn; do
        if [[ -n "$key_arn" ]]; then
            local key_alias=$(aws kms list-aliases \
                --profile "$PROFILE" \
                --region "$REGION" \
                --query "Aliases[?TargetKeyId=='$(echo $key_arn | cut -d: -f6)']|[0].AliasName" \
                --output text 2>/dev/null || echo "")
            
            if [[ "$key_alias" == *"*$env*" ]]; then
                echo "  $key_alias ($key_arn)"
                if [[ "$DRY_RUN" == "true" ]]; then
                    print_warning "DRY RUN: Would delete KMS key $key_alias"
                else
                    print_warning "Deleting KMS key: $key_alias"
                    aws kms schedule-key-deletion \
                        --key-id "$key_arn" \
                        --pending-window-in-days 7 \
                        --profile "$PROFILE" \
                        --region "$REGION"
                    print_success "Scheduled deletion of KMS key $key_alias"
                fi
            fi
        fi
    done
}

# Function to list and delete CloudWatch resources
cleanup_cloudwatch_resources() {
    local env="$1"
    print_section "Finding CloudWatch Resources for $env environment"
    
    # Delete log groups
    local log_groups=$(aws logs describe-log-groups \
        --profile "$PROFILE" \
        --region "$REGION" \
        --query "logGroups[?contains(logGroupName, '$env')].logGroupName" \
        --output text)
    
    if [[ -n "$log_groups" ]]; then
        echo "$log_groups" | while IFS= read -r log_group; do
            if [[ -n "$log_group" ]]; then
                echo "  Log Group: $log_group"
                if [[ "$DRY_RUN" == "true" ]]; then
                    print_warning "DRY RUN: Would delete CloudWatch Log Group $log_group"
                else
                    print_warning "Deleting CloudWatch Log Group: $log_group"
                    aws logs delete-log-group \
                        --log-group-name "$log_group" \
                        --profile "$PROFILE" \
                        --region "$REGION"
                    print_success "Deleted CloudWatch Log Group $log_group"
                fi
            fi
        done
    else
        print_warning "No CloudWatch Log Groups found for $env environment"
    fi
    
    # Delete dashboards
    local dashboards=$(aws cloudwatch list-dashboards \
        --profile "$PROFILE" \
        --region "$REGION" \
        --query "DashboardEntries[?contains(DashboardName, '$env')].DashboardName" \
        --output text)
    
    if [[ -n "$dashboards" ]]; then
        echo "$dashboards" | while IFS= read -r dashboard; do
            if [[ -n "$dashboard" ]]; then
                echo "  Dashboard: $dashboard"
                if [[ "$DRY_RUN" == "true" ]]; then
                    print_warning "DRY RUN: Would delete CloudWatch Dashboard $dashboard"
                else
                    print_warning "Deleting CloudWatch Dashboard: $dashboard"
                    aws cloudwatch delete-dashboards \
                        --dashboard-names "$dashboard" \
                        --profile "$PROFILE" \
                        --region "$REGION"
                    print_success "Deleted CloudWatch Dashboard $dashboard"
                fi
            fi
        done
    else
        print_warning "No CloudWatch Dashboards found for $env environment"
    fi
}

# Function to list and delete SNS topics
cleanup_sns_topics() {
    local env="$1"
    print_section "Finding SNS Topics for $env environment"
    
    local topics=$(aws sns list-topics \
        --profile "$PROFILE" \
        --region "$REGION" \
        --query "Topics[?contains(TopicArn, '$env')].TopicArn" \
        --output text)
    
    if [[ -n "$topics" ]]; then
        echo "$topics" | while IFS= read -r topic_arn; do
            if [[ -n "$topic_arn" ]]; then
                echo "  $topic_arn"
                if [[ "$DRY_RUN" == "true" ]]; then
                    print_warning "DRY RUN: Would delete SNS Topic $topic_arn"
                else
                    print_warning "Deleting SNS Topic: $topic_arn"
                    aws sns delete-topic \
                        --topic-arn "$topic_arn" \
                        --profile "$PROFILE" \
                        --region "$REGION"
                    print_success "Deleted SNS Topic $topic_arn"
                fi
            fi
        done
    else
        print_warning "No SNS Topics found for $env environment"
    fi
}

# Function to list and delete IAM roles/policies
cleanup_iam_resources() {
    local env="$1"
    print_section "Finding IAM Resources for $env environment"
    
    # Delete IAM roles
    local roles=$(aws iam list-roles \
        --profile "$PROFILE" \
        --query "Roles[?contains(RoleName, '$env')].RoleName" \
        --output text)
    
    if [[ -n "$roles" ]]; then
        echo "$roles" | while IFS= read -r role_name; do
            if [[ -n "$role_name" ]]; then
                echo "  Role: $role_name"
                if [[ "$DRY_RUN" == "true" ]]; then
                    print_warning "DRY RUN: Would delete IAM Role $role_name"
                else
                    print_warning "Deleting IAM Role: $role_name"
                    # Detach all policies first
                    local policies=$(aws iam list-attached-role-policies \
                        --role-name "$role_name" \
                        --profile "$PROFILE" \
                        --query "AttachedPolicies[].PolicyArn" \
                        --output text)
                    
                    echo "$policies" | while IFS= read -r policy_arn; do
                        if [[ -n "$policy_arn" ]]; then
                            aws iam detach-role-policy \
                                --role-name "$role_name" \
                                --policy-arn "$policy_arn" \
                                --profile "$PROFILE"
                        fi
                    done
                    
                    # Delete role
                    aws iam delete-role \
                        --role-name "$role_name" \
                        --profile "$PROFILE"
                    print_success "Deleted IAM Role $role_name"
                fi
            fi
        done
    else
        print_warning "No IAM Roles found for $env environment"
    fi
    
    # Delete IAM policies
    local policies=$(aws iam list-policies \
        --profile "$PROFILE" \
        --scope Local \
        --query "Policies[?contains(PolicyName, '$env')].Arn" \
        --output text)
    
    if [[ -n "$policies" ]]; then
        echo "$policies" | while IFS= read -r policy_arn; do
            if [[ -n "$policy_arn" ]]; then
                echo "  Policy: $policy_arn"
                if [[ "$DRY_RUN" == "true" ]]; then
                    print_warning "DRY RUN: Would delete IAM Policy $policy_arn"
                else
                    print_warning "Deleting IAM Policy: $policy_arn"
                    aws iam delete-policy \
                        --policy-arn "$policy_arn" \
                        --profile "$PROFILE"
                    print_success "Deleted IAM Policy $policy_arn"
                fi
            fi
        done
    else
        print_warning "No IAM Policies found for $env environment"
    fi
}

# Function to cleanup Secrets Manager secrets
cleanup_secrets_manager() {
    local env="$1"
    print_section "Finding Secrets Manager Secrets for $env environment"
    
    local secrets=$(aws secretsmanager list-secrets \
        --profile "$PROFILE" \
        --region "$REGION" \
        --query "SecretList[?contains(Name, '$env')].Name" \
        --output text)
    
    if [[ -n "$secrets" ]]; then
        echo "$secrets" | while IFS= read -r secret_name; do
            if [[ -n "$secret_name" ]]; then
                echo "  $secret_name"
                if [[ "$DRY_RUN" == "true" ]]; then
                    print_warning "DRY RUN: Would delete Secrets Manager secret $secret_name"
                else
                    print_warning "Deleting Secrets Manager secret: $secret_name"
                    aws secretsmanager delete-secret \
                        --secret-id "$secret_name" \
                        --force-delete-without-recovery \
                        --profile "$PROFILE" \
                        --region "$REGION"
                    print_success "Deleted Secrets Manager secret $secret_name"
                fi
            fi
        done
    else
        print_warning "No Secrets Manager secrets found for $env environment"
    fi
}

# Function to cleanup Parameter Store parameters
cleanup_parameter_store() {
    local env="$1"
    print_section "Finding Parameter Store Parameters for $env environment"
    
    local parameters=$(aws ssm describe-parameters \
        --profile "$PROFILE" \
        --region "$REGION" \
        --query "Parameters[?contains(Name, '$env')].Name" \
        --output text)
    
    if [[ -n "$parameters" ]]; then
        echo "$parameters" | while IFS= read -r param_name; do
            if [[ -n "$param_name" ]]; then
                echo "  $param_name"
                if [[ "$DRY_RUN" == "true" ]]; then
                    print_warning "DRY RUN: Would delete Parameter Store parameter $param_name"
                else
                    print_warning "Deleting Parameter Store parameter: $param_name"
                    aws ssm delete-parameter \
                        --name "$param_name" \
                        --profile "$PROFILE" \
                        --region "$REGION"
                    print_success "Deleted Parameter Store parameter $param_name"
                fi
            fi
        done
    else
        print_warning "No Parameter Store parameters found for $env environment"
    fi
}

# Function to wait for stack deletions to complete
wait_for_stack_deletions() {
    local env="$1"
    print_section "Waiting for Stack Deletions to Complete"
    
    local stacks_in_progress=true
    local max_wait_time=300  # 5 minutes
    local wait_time=0
    
    while [[ "$stacks_in_progress" == "true" && $wait_time -lt $max_wait_time ]]; do
        local deleting_stacks=$(aws cloudformation list-stacks \
            --profile "$PROFILE" \
            --region "$REGION" \
            --stack-status-filter DELETE_IN_PROGRESS \
            --query "StackSummaries[?contains(StackName, '$env')].StackName" \
            --output text)
        
        if [[ -z "$deleting_stacks" ]]; then
            stacks_in_progress=false
            print_success "All stack deletions completed"
        else
            echo "Waiting for stacks to be deleted: $deleting_stacks"
            sleep 10
            wait_time=$((wait_time + 10))
        fi
    done
    
    if [[ "$stacks_in_progress" == "true" ]]; then
        print_warning "Some stacks are still being deleted. Please check AWS Console."
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
    print_error "Environment must be 'dev' or 'staging'"
    exit 1
fi

# Main execution
echo -e "${GREEN}🚀 HalluciFix AWS Development Environment Cleanup${NC}"
echo -e "Environment: ${YELLOW}$ENVIRONMENT${NC}"
echo -e "Profile: ${YELLOW}$PROFILE${NC}"
echo -e "Region: ${YELLOW}$REGION${NC}"
echo -e "Dry Run: ${YELLOW}$DRY_RUN${NC}"
echo ""

# Check if this is a development environment cleanup
print_warning "This script will remove ALL AWS resources for the $ENVIRONMENT environment"
print_warning "This action cannot be undone!"

if ! confirm_action; then
    print_warning "Cleanup cancelled"
    exit 0
fi

# Start cleanup process
check_aws_setup

# List all resources that will be cleaned up
print_section "Resources to be Cleaned Up"
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

# Execute cleanup
STACKS=$(list_stacks "$ENVIRONMENT")

if [[ "$DRY_RUN" == "false" ]]; then
    delete_stacks "$ENVIRONMENT" "$STACKS"
    wait_for_stack_deletions "$ENVIRONMENT"
fi

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

print_success "Cleanup completed for $ENVIRONMENT environment"

if [[ "$DRY_RUN" == "true" ]]; then
    print_warning "This was a dry run. No resources were actually deleted."
    print_warning "Run without --dry-run to perform actual cleanup."
fi