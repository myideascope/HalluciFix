#!/bin/bash

# GitHub Actions Intelligent Retry Script
# Integrates with flaky test management system for smart retries

set -e

# Configuration
TEST_COMMAND="$1"
TEST_NAME="$2"
TEST_SUITE="${3:-unknown}"
MAX_RETRIES="${4:-3}"
RESULTS_FILE="${5:-test-results.json}"

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Logging functions
log_info() {
    echo -e "${BLUE}[INFO]${NC} $1"
}

log_warn() {
    echo -e "${YELLOW}[WARN]${NC} $1"
}

log_error() {
    echo -e "${RED}[ERROR]${NC} $1"
}

log_success() {
    echo -e "${GREEN}[SUCCESS]${NC} $1"
}

# Initialize retry tracking
RETRY_COUNT=0
START_TIME=$(date +%s)
RETRY_LOG_FILE="retry-log-$(date +%s).json"

# Create retry log structure
cat > "$RETRY_LOG_FILE" << EOF
{
  "testName": "$TEST_NAME",
  "testSuite": "$TEST_SUITE",
  "command": "$TEST_COMMAND",
  "startTime": "$(date -Iseconds)",
  "attempts": []
}
EOF

# Function to analyze test failure
analyze_failure() {
    local exit_code=$1
    local error_output="$2"
    
    # Create test result for analysis
    local test_result=$(cat << EOF
{
  "name": "$TEST_NAME",
  "suite": "$TEST_SUITE",
  "success": false,
  "error": "$error_output",
  "exitCode": $exit_code
}
EOF
)
    
    # Use flaky test manager to analyze failure
    local analysis=$(node scripts/flaky-test-manager.js analyze "$test_result" 2>/dev/null || echo '{"shouldRetry": false}')
    echo "$analysis"
}

# Function to calculate delay with exponential backoff
calculate_delay() {
    local attempt=$1
    local base_delay=${2:-1000}
    local multiplier=${3:-2}
    local max_delay=${4:-30000}
    
    local delay=$((base_delay * (multiplier ** (attempt - 1))))
    if [ $delay -gt $max_delay ]; then
        delay=$max_delay
    fi
    
    # Add jitter (±20%)
    local jitter=$((delay / 5))
    local random_jitter=$((RANDOM % (2 * jitter) - jitter))
    delay=$((delay + random_jitter))
    
    echo $delay
}

# Function to log attempt
log_attempt() {
    local attempt=$1
    local success=$2
    local duration=$3
    local error_msg="$4"
    
    local attempt_data=$(cat << EOF
{
  "attempt": $attempt,
  "success": $success,
  "duration": $duration,
  "timestamp": "$(date -Iseconds)",
  "error": "$error_msg"
}
EOF
)
    
    # Add to retry log
    local temp_file=$(mktemp)
    jq ".attempts += [$attempt_data]" "$RETRY_LOG_FILE" > "$temp_file" && mv "$temp_file" "$RETRY_LOG_FILE"
}

# Function to check if test is quarantined
check_quarantine() {
    local test_key="${TEST_SUITE}:unknown:${TEST_NAME}"
    
    if [ -f ".github/quarantined-tests.json" ]; then
        local is_quarantined=$(jq -r ".tests[] | select(.key == \"$test_key\") | .key" .github/quarantined-tests.json 2>/dev/null)
        if [ -n "$is_quarantined" ]; then
            log_warn "Test '$TEST_NAME' is quarantined - skipping execution"
            echo "QUARANTINED"
            return 0
        fi
    fi
    
    echo "NOT_QUARANTINED"
}

# Function to update test history
update_test_history() {
    local success=$1
    local total_duration=$2
    local retry_count=$3
    
    local execution_data=$(cat << EOF
{
  "sha": "${GITHUB_SHA:-unknown}",
  "branch": "${GITHUB_REF_NAME:-unknown}",
  "trigger": "${GITHUB_EVENT_NAME:-unknown}",
  "riskLevel": "medium",
  "testSuites": ["$TEST_SUITE"],
  "duration": $total_duration,
  "success": $success,
  "testResults": [{
    "name": "$TEST_NAME",
    "suite": "$TEST_SUITE",
    "file": "unknown",
    "success": $success,
    "duration": $total_duration,
    "retries": $retry_count
  }]
}
EOF
)
    
    node scripts/test-history-tracker.js record "$execution_data" 2>/dev/null || log_warn "Could not update test history"
}

# Main execution logic
main() {
    log_info "Starting intelligent test execution for: $TEST_NAME"
    log_info "Command: $TEST_COMMAND"
    log_info "Max retries: $MAX_RETRIES"
    
    # Check if test is quarantined
    local quarantine_status=$(check_quarantine)
    if [ "$quarantine_status" = "QUARANTINED" ]; then
        log_warn "Skipping quarantined test"
        exit 0
    fi
    
    # Main retry loop
    while [ $RETRY_COUNT -le $MAX_RETRIES ]; do
        local attempt_start=$(date +%s)
        local attempt_num=$((RETRY_COUNT + 1))
        
        log_info "Attempt $attempt_num of $((MAX_RETRIES + 1))"
        
        # Capture both stdout and stderr
        local temp_output=$(mktemp)
        local exit_code=0
        
        # Execute test command
        if eval "$TEST_COMMAND" > "$temp_output" 2>&1; then
            local attempt_duration=$(($(date +%s) - attempt_start))
            local total_duration=$(($(date +%s) - START_TIME))
            
            log_success "Test passed on attempt $attempt_num"
            log_attempt $attempt_num true $attempt_duration ""
            
            # Update test history with success
            update_test_history true $total_duration $RETRY_COUNT
            
            # Clean up
            rm -f "$temp_output" "$RETRY_LOG_FILE"
            
            exit 0
        else
            exit_code=$?
            local error_output=$(cat "$temp_output")
            local attempt_duration=$(($(date +%s) - attempt_start))
            
            log_error "Test failed on attempt $attempt_num (exit code: $exit_code)"
            log_attempt $attempt_num false $attempt_duration "$error_output"
            
            # Analyze failure to determine if we should retry
            local analysis=$(analyze_failure $exit_code "$error_output")
            local should_retry=$(echo "$analysis" | jq -r '.shouldRetry // false')
            local failure_category=$(echo "$analysis" | jq -r '.failureCategory // "unknown"')
            
            log_info "Failure analysis: category=$failure_category, shouldRetry=$should_retry"
            
            # Check if we should continue retrying
            if [ $RETRY_COUNT -lt $MAX_RETRIES ] && [ "$should_retry" = "true" ]; then
                RETRY_COUNT=$((RETRY_COUNT + 1))
                
                # Calculate delay based on failure category
                local base_delay=1000
                if [ "$failure_category" = "network" ]; then
                    base_delay=2000
                elif [ "$failure_category" = "database" ]; then
                    base_delay=3000
                elif [ "$failure_category" = "browser" ]; then
                    base_delay=5000
                fi
                
                local delay=$(calculate_delay $RETRY_COUNT $base_delay)
                local delay_seconds=$((delay / 1000))
                
                log_warn "Retrying in ${delay_seconds}s (category: $failure_category)..."
                sleep $delay_seconds
            else
                # No more retries or shouldn't retry
                local total_duration=$(($(date +%s) - START_TIME))
                
                if [ $RETRY_COUNT -ge $MAX_RETRIES ]; then
                    log_error "Test failed after $((MAX_RETRIES + 1)) attempts"
                else
                    log_error "Test failed and retry not recommended (category: $failure_category)"
                fi
                
                # Update test history with failure
                update_test_history false $total_duration $RETRY_COUNT
                
                # Save retry log for analysis
                if [ -n "$GITHUB_STEP_SUMMARY" ]; then
                    echo "## Test Retry Summary" >> "$GITHUB_STEP_SUMMARY"
                    echo "**Test:** $TEST_NAME" >> "$GITHUB_STEP_SUMMARY"
                    echo "**Attempts:** $((RETRY_COUNT + 1))" >> "$GITHUB_STEP_SUMMARY"
                    echo "**Final Status:** Failed" >> "$GITHUB_STEP_SUMMARY"
                    echo "**Failure Category:** $failure_category" >> "$GITHUB_STEP_SUMMARY"
                    echo "" >> "$GITHUB_STEP_SUMMARY"
                    echo "```json" >> "$GITHUB_STEP_SUMMARY"
                    cat "$RETRY_LOG_FILE" >> "$GITHUB_STEP_SUMMARY"
                    echo "```" >> "$GITHUB_STEP_SUMMARY"
                fi
                
                # Clean up
                rm -f "$temp_output" "$RETRY_LOG_FILE"
                
                exit $exit_code
            fi
        fi
        
        rm -f "$temp_output"
    done
}

# Validate inputs
if [ -z "$TEST_COMMAND" ]; then
    log_error "Test command is required"
    echo "Usage: $0 <test-command> [test-name] [test-suite] [max-retries] [results-file]"
    exit 1
fi

if [ -z "$TEST_NAME" ]; then
    TEST_NAME="unknown-test"
fi

# Run main function
main "$@"