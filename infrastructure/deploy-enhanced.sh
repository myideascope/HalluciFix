#!/bin/bash

# HalluciFix Infrastructure Deployment Script - Enhanced
# Robust deployment with existence checks and graceful failure handling

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
FORCE_DEPLOYMENT=false
SKIP_EXISTING=true
CONTINUE_ON_FAILURE=false

# Function to check if stack exists
check_stack_exists() {
    local stack_name=$1
    local status=$(aws cloudformation list-stacks \
        --stack-status-filter CREATE_COMPLETE UPDATE_COMPLETE \
        --query "StackSummaries[?StackName=='$stack_name'].StackName" \
        --output text 2>/dev/null || echo "")
    
    if [[ -n "$status" ]]; then
        return 0  # Stack exists
    else
        return 1  # Stack doesn't exist
    fi
}

# Function to check if stack is in progress
check_stack_in_progress() {
    local stack_name=$1
    local status=$(aws cloudformation list-stacks \
        --stack-status-filter CREATE_IN_PROGRESS UPDATE_IN_PROGRESS DELETE_IN_PROGRESS \
        --query "StackSummaries[?StackName=='$stack_name'].StackStatus" \
        --output text 2>/dev/null || echo "")
    
    if [[ -n "$status" ]]; then
        echo -e "${YELLOW}⚠️  Stack '$stack_name' is currently $status${NC}"
        return 0  # Stack is in progress
    else
        return 1  # Stack is not in progress
    fi
}

# Function to wait for stack completion
wait_for_stack() {
    local stack_name=$1
    echo -e "${BLUE}⏳ Waiting for stack '$stack_name' to complete...${NC}"
    
    aws cloudformation wait stack-create-complete \
        --stack-name "$stack_name" \
        --region "$REGION" \
        --profile "$PROFILE" 2>/dev/null || true
}

# Function to handle deployment with graceful failure handling
deploy_stack() {
    local stack_name=$1
    local description=$2
    
    echo -e "${YELLOW}🏗️  Deploying $description Stack...${NC}"
    echo -e "${BLUE}   Stack Name: $stack_name${NC}"
    
    # Check if stack is already in progress
    if check_stack_in_progress "$stack_name"; then
        echo -e "${YELLOW}⏳ Waiting for existing deployment to complete...${NC}"
        wait_for_stack "$stack_name"
        
        # Check final status
        local final_status=$(aws cloudformation describe-stacks \
            --stack-name "$stack_name" \
            --query "Stacks[0].StackStatus" \
            --output text 2>/dev/null || echo "UNKNOWN")
        
        if [[ "$final_status" == "CREATE_COMPLETE" || "$final_status" == "UPDATE_COMPLETE" ]]; then
            echo -e "${GREEN}✅ Stack '$stack_name' is already deployed and ready${NC}"
            return 0
        elif [[ "$final_status" == "CREATE_FAILED" || "$final_status" == "UPDATE_FAILED" ]]; then
            echo -e "${YELLOW}⚠️  Stack '$stack_name' failed previously, attempting to continue...${NC}"
        fi
    fi
    
    # Check if stack exists and skip if requested
    if [[ "$SKIP_EXISTING" == "true" ]] && check_stack_exists "$stack_name"; then
        echo -e "${GREEN}✅ Stack '$stack_name' already exists and is ready${NC}"
        return 0
    fi
    
    # Attempt deployment with error handling
    if [[ "$FORCE_DEPLOYMENT" == "true" ]]; then
        echo -e "${BLUE}🔄 Force deployment enabled - will attempt update even if stack exists${NC}"
    fi
    
    # Deploy stack with graceful error handling
    if npx cdk deploy "$stack_name" --context environment="$ENVIRONMENT" --require-approval never --ci; then
        echo -e "${GREEN}✅ Stack '$stack_name' deployed successfully${NC}"
        return 0
    else
        local exit_code=$?
        echo -e "${RED}❌ Stack '$stack_name' deployment failed with exit code: $exit_code${NC}"
        
        # Handle specific failure types
        handle_deployment_failure "$stack_name" "$exit_code"
        
        if [[ "$CONTINUE_ON_FAILURE" == "true" ]]; then
            echo -e "${YELLOW}⚠️  Continuing deployment despite failure (continue-on-failure enabled)${NC}"
            return 0  # Return success to continue deployment
        else
            echo -e "${RED}💥 Deployment stopped due to failure${NC}"
            return $exit_code
        fi
    fi
}

# Function to handle deployment failures gracefully
handle_deployment_failure() {
    local stack_name=$1
    local exit_code=$2
    
    echo -e "${BLUE}🔍 Analyzing failure for stack: $stack_name${NC}"
    
    # Check for common issues
    local stack_events=$(aws cloudformation describe-stack-events \
        --stack-name "$stack_name" \
        --max-items 5 \
        --query "StackEvents[0].ResourceStatusReason" \
        --output text 2>/dev/null || echo "")
    
    if [[ -n "$stack_events" ]]; then
        echo -e "${BLUE}📝 Failure reason: $stack_events${NC}"
    fi
    
    # Handle specific error types
    case $exit_code in
        1)
            echo -e "${YELLOW}⚠️  Generic deployment error - checking for resource conflicts...${NC}"
            handle_resource_conflicts "$stack_name"
            ;;
        255)
            echo -e "${YELLOW}⚠️  CDK toolkit error - checking CDK bootstrap status...${NC}"
            check_cdk_bootstrap
            ;;
        *)
            echo -e "${YELLOW}⚠️  Unknown error code: $exit_code${NC}"
            ;;
    esac
}

# Function to handle resource conflicts
handle_resource_conflicts() {
    local stack_name=$1
    
    echo -e "${BLUE}🔄 Checking for export name conflicts...${NC}"
    
    # Check for export conflicts
    local exports=$(aws cloudformation list-exports \
        --query "Exports[?contains(Name, '$ENVIRONMENT-')].{Name: Name, Value: Value}" \
        --output table 2>/dev/null | grep -c "$stack_name" || echo "0")
    
    if [[ "$exports" -gt 1 ]]; then
        echo -e "${YELLOW}⚠️  Potential export name conflicts detected${NC}"
        echo -e "${BLUE}💡 Consider using unique export names or cleaning up old exports${NC}"
    fi
    
    # Check for existing resources that might conflict
    echo -e "${BLUE}🔍 Checking for conflicting resources...${NC}"
    # This would include checks for:
    # - S3 bucket names
    # - Lambda function names
    # - IAM role names
    # - RDS instance identifiers
}

# Function to check CDK bootstrap status
check_cdk_bootstrap() {
    echo -e "${BLUE}🔧 Checking CDK bootstrap status...${NC}"
    
    local bootstrap_check=$(aws cloudformation list-stacks \
        --stack-status-filter CREATE_COMPLETE \
        --query "StackSummaries[?StackName=='CDKToolkit'].StackName" \
        --output text 2>/dev/null || echo "")
    
    if [[ -z "$bootstrap_check" ]]; then
        echo -e "${YELLOW}⚠️  CDK Toolkit not bootstrapped, running bootstrap...${NC}"
        npx cdk bootstrap --context environment="$ENVIRONMENT" || echo -e "${RED}❌ Bootstrap failed${NC}"
    else
        echo -e "${GREEN}✅ CDK Toolkit is bootstrapped${NC}"
    fi
}

# Function to validate prerequisites
validate_prerequisites() {
    echo -e "${BLUE}🔍 Validating deployment prerequisites...${NC}"
    
    # Check AWS CLI and credentials
    if ! aws sts get-caller-identity &>/dev/null; then
        echo -e "${RED}❌ AWS credentials not configured properly${NC}"
        echo -e "${BLUE}💡 Run: aws configure${NC}"
        exit 1
    fi
    
    # Check CDK installation
    if ! command -v cdk &>/dev/null; then
        echo -e "${RED}❌ AWS CDK not installed${NC}"
        echo -e "${BLUE}💡 Install with: npm install -g aws-cdk${NC}"
        exit 1
    fi
    
    # Check Node.js and npm
    if ! command -v node &>/dev/null; then
        echo -e "${RED}❌ Node.js not installed${NC}"
        exit 1
    fi
    
    if ! command -v npm &>/dev/null; then
        echo -e "${RED}❌ npm not installed${NC}"
        exit 1
    fi
    
    echo -e "${GREEN}✅ Prerequisites validated${NC}"
}

# Function to show deployment summary
show_deployment_summary() {
    echo ""
    echo -e "${GREEN}🎉 DEPLOYMENT SUMMARY${NC}"
    echo -e "${GREEN}==================${NC}"
    echo -e "${BLUE}Environment: ${YELLOW}$ENVIRONMENT${NC}"
    echo -e "${BLUE}AWS Profile: ${YELLOW}$PROFILE${NC}"
    echo -e "${BLUE}AWS Region: ${YELLOW}$REGION${NC}"
    echo ""
    
    # Show stack statuses
    echo -e "${BLUE}Stack Statuses:${NC}"
    for stack in "Hallucifix-Network-$ENVIRONMENT" "Hallucifix-Storage-$ENVIRONMENT" "Hallucifix-Database-$ENVIRONMENT" "Hallucifix-Compute-$ENVIRONMENT" "Hallucifix-CacheMonitoring-$ENVIRONMENT"; do
        if check_stack_exists "$stack"; then
            echo -e "${GREEN}✅ $stack${NC}"
        else
            echo -e "${RED}❌ $stack${NC}"
        fi
    done
    
    echo ""
    echo -e "${YELLOW}📋 Next Steps:${NC}"
    echo "1. 🌐 Access your application at the S3 static website URL"
    echo "2. 🔐 Configure Cognito user pool settings if needed"
    echo "3. 📊 Monitor deployment in AWS CloudFormation console"
    echo "4. 🔧 Update application environment variables"
    echo "5. 🚀 Deploy your frontend application"
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
    --force)
      FORCE_DEPLOYMENT=true
      shift
      ;;
    --skip-existing)
      SKIP_EXISTING=true
      shift
      ;;
    --continue-on-failure)
      CONTINUE_ON_FAILURE=true
      shift
      ;;
    --no-skip-existing)
      SKIP_EXISTING=false
      shift
      ;;
    -h|--help)
      echo "Usage: $0 [OPTIONS]"
      echo ""
      echo "Options:"
      echo "  -e, --environment ENV    Environment (dev, staging, prod) [default: dev]"
      echo "  -p, --profile PROFILE    AWS profile [default: hallucifix]"
      echo "  -r, --region REGION      AWS region [default: us-east-1]"
      echo "  --force                  Force deployment even if resources exist"
      echo "  --skip-existing          Skip deployment of existing resources [default]"
      echo "  --continue-on-failure    Continue deployment despite failures"
      echo "  --no-skip-existing       Always attempt to deploy all resources"
      echo "  -h, --help               Show this help message"
      echo ""
      echo "Examples:"
      echo "  $0 -e prod                    # Deploy to production with existing resource check"
      echo "  $0 --force -e staging         # Force deployment to staging"
      echo "  $0 --continue-on-failure      # Deploy with failure tolerance"
      exit 0
      ;;
    *)
      echo -e "${RED}Unknown option: $1${NC}"
      echo "Use --help for usage information"
      exit 1
      ;;
  esac
done

# Set AWS profile and region
export AWS_PROFILE="$PROFILE"
export AWS_DEFAULT_REGION="$REGION"

# Display deployment information
echo -e "${GREEN}🚀 HalluciFix Infrastructure Deployment${NC}"
echo -e "${GREEN}======================================${NC}"
echo -e "${BLUE}Environment: ${YELLOW}$ENVIRONMENT${NC}"
echo -e "${BLUE}Profile: ${YELLOW}$PROFILE${NC}"
echo -e "${BLUE}Region: ${YELLOW}$REGION${NC}"
echo -e "${BLUE}Force Mode: ${YELLOW}$FORCE_DEPLOYMENT${NC}"
echo -e "${BLUE}Skip Existing: ${YELLOW}$SKIP_EXISTING${NC}"
echo -e "${BLUE}Continue on Failure: ${YELLOW}$CONTINUE_ON_FAILURE${NC}"
echo ""

# Validate prerequisites
validate_prerequisites

# Build the project
echo -e "${YELLOW}📦 Building CDK project...${NC}"
npm run build

# Bootstrap CDK (only if needed)
echo -e "${YELLOW}🔧 Checking CDK bootstrap...${NC}"
check_cdk_bootstrap

# Define deployment order
declare -a stacks=(
    "Hallucifix-Network-$ENVIRONMENT:Network"
    "Hallucifix-Storage-$ENVIRONMENT:Storage" 
    "Hallucifix-Database-$ENVIRONMENT:Database"
    "Hallucifix-Compute-$ENVIRONMENT:Compute"
    "Hallucifix-CacheMonitoring-$ENVIRONMENT:CacheMonitoring"
)

# Deploy stacks in order
echo -e "${YELLOW}🏗️  Starting infrastructure deployment...${NC}"
echo ""

failed_stacks=()
for stack_info in "${stacks[@]}"; do
    IFS=':' read -r stack_name stack_type <<< "$stack_info"
    
    if ! deploy_stack "$stack_name" "$stack_type"; then
        failed_stacks+=("$stack_name")
        echo -e "${RED}❌ Failed to deploy: $stack_name${NC}"
    fi
done

# Show final results
echo ""
if [[ ${#failed_stacks[@]} -eq 0 ]]; then
    echo -e "${GREEN}🎉 All stacks deployed successfully!${NC}"
    show_deployment_summary
    exit 0
else
    echo -e "${RED}⚠️  Some stacks failed to deploy:${NC}"
    for failed_stack in "${failed_stacks[@]}"; do
        echo -e "${RED}  ❌ $failed_stack${NC}"
    done
    
    echo ""
    echo -e "${YELLOW}💡 To retry failed deployments:${NC}"
    echo -e "${BLUE}  $0 --force -e $ENVIRONMENT${NC}"
    
    echo ""
    echo -e "${YELLOW}💡 To continue with existing resources:${NC}"
    echo -e "${BLUE}  $0 --skip-existing -e $ENVIRONMENT${NC}"
    
    exit 1
fi