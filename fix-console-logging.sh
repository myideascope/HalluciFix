#!/bin/bash

# HalluciFix Console to Logging Migration Script
# Automatically replaces console statements with structured logging

set -e

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Counters
TOTAL_FILES=0
MODIFIED_FILES=0
CONSOLE_STATEMENTS_FIXED=0

# Function to print colored output
print_status() {
    echo -e "${BLUE}[INFO]${NC} $1"
}

print_success() {
    echo -e "${GREEN}[SUCCESS]${NC} $1"
}

print_warning() {
    echo -e "${YELLOW}[WARNING]${NC} $1"
}

print_error() {
    echo -e "${RED}[ERROR]${NC} $1"
}

# Function to check if file has console statements
has_console_statements() {
    local file="$1"
    grep -q "console\." "$file"
}

# Function to add logger import to file
add_logger_import() {
    local file="$1"
    
    # Check if logger is already imported
    if grep -q "import.*logger.*from" "$file"; then
        return 0
    fi
    
    # Find the import section and add logger import
    if grep -q "import.*from" "$file"; then
        # Add logger import after the first import line
        sed -i '/import.*from.*;/a import { logger } from '\''./logging'\'';' "$file"
        return 0
    else
        # No imports found, add at the top
        sed -i '1i import { logger } from '\''./logging'\'';' "$file"
        return 0
    fi
}

# Function to replace console.error statements
replace_console_error() {
    local file="$1"
    local temp_file=$(mktemp)
    
    # Pattern: console.error('message', error)
    sed -E 's/console\.error\(\s*["'"'"']([^"'"'"']*)["'"'"']\s*,\s*([^)]+)\)/logger.error('\''\1'\'', \2 instanceof Error ? \2 : new Error(String(\2)))/g' "$file" > "$temp_file"
    
    # Pattern: console.error('message:')
    sed -i -E 's/console\.error\(\s*["'"'"']([^"'"'"']*)["'"'"']\s*:\s*,\s*/logger.error('\''\1'\'', /g' "$temp_file"
    
    # Pattern: console.error('message')
    sed -i -E 's/console\.error\(\s*["'"'"']([^"'"'"']*)["'"'"']\s*\)/logger.error('\''\1'\'')/g' "$temp_file"
    
    mv "$temp_file" "$file"
}

# Function to replace console.warn statements
replace_console_warn() {
    local file="$1"
    local temp_file=$(mktemp)
    
    # Pattern: console.warn('message', data)
    sed -E 's/console\.warn\(\s*["'"'"']([^"'"'"']*)["'"'"']\s*,\s*([^)]+)\)/logger.warn('\''\1'\'', { \2 })/g' "$file" > "$temp_file"
    
    # Pattern: console.warn('message')
    sed -i -E 's/console\.warn\(\s*["'"'"']([^"'"'"']*)["'"'"']\s*\)/logger.warn('\''\1'\'')/g' "$temp_file"
    
    mv "$temp_file" "$file"
}

# Function to replace console.log statements
replace_console_log() {
    local file="$1"
    local temp_file=$(mktemp)
    
    # Pattern: console.log('message', data) - convert to info for important logs
    sed -E 's/console\.log\(\s*["'"'"']([^"'"'"']*)["'"'"']\s*,\s*([^)]+)\)/logger.info('\''\1'\'', { \2 })/g' "$file" > "$temp_file"
    
    # Pattern: console.log('Starting...', 'Completed...', etc. - convert to info
    sed -i -E 's/console\.log\(\s*["'"'"']([^"'"'"']*(Start|Complete|Process)[^"'"'"']*)["'"'"']\s*\)/logger.info('\''\1'\'')/g' "$temp_file"
    
    # Pattern: console.log('message') - convert to debug for general logs
    sed -i -E 's/console\.log\(\s*["'"'"']([^"'"'"']*)["'"'"']\s*\)/logger.debug('\''\1'\'')/g' "$temp_file"
    
    mv "$temp_file" "$file"
}

# Function to replace console.info statements
replace_console_info() {
    local file="$1"
    local temp_file=$(mktemp)
    
    # Pattern: console.info('message', data)
    sed -E 's/console\.info\(\s*["'"'"']([^"'"'"']*)["'"'"']\s*,\s*([^)]+)\)/logger.info('\''\1'\'', { \2 })/g' "$file" > "$temp_file"
    
    # Pattern: console.info('message')
    sed -i -E 's/console\.info\(\s*["'"'"']([^"'"'"']*)["'"'"']\s*\)/logger.info('\''\1'\'')/g' "$temp_file"
    
    mv "$temp_file" "$file"
}

# Function to process a single file
process_file() {
    local file="$1"
    
    if ! has_console_statements "$file"; then
        return 0
    fi
    
    print_status "Processing: $file"
    
    # Count console statements before
    local before_count=$(grep -c "console\." "$file")
    
    # Add logger import
    add_logger_import "$file"
    
    # Replace console statements
    replace_console_error "$file"
    replace_console_warn "$file"
    replace_console_log "$file"
    replace_console_info "$file"
    
    # Count console statements after
    local after_count=$(grep -c "console\." "$file" || echo "0")
    local fixed_count=$((before_count - after_count))
    
    if [ $fixed_count -gt 0 ]; then
        print_success "Fixed $fixed_count console statements"
        MODIFIED_FILES=$((MODIFIED_FILES + 1))
        CONSOLE_STATEMENTS_FIXED=$((CONSOLE_STATEMENTS_FIXED + fixed_count))
        return 0
    else
        print_warning "No console statements fixed (may need manual review)"
        return 1
    fi
}

# Function to process all TypeScript/JavaScript files
process_all_files() {
    print_status "Starting console statement migration..."
    
    # Find all TypeScript and JavaScript files
    find /home/antonio/ideascope/HalluciFix/src -name "*.ts" -o -name "*.tsx" | while read -r file; do
        TOTAL_FILES=$((TOTAL_FILES + 1))
        process_file "$file"
    done
    
    # Process any remaining files with more complex patterns
    print_status "Processing files with complex console patterns..."
    find /home/antonio/ideascope/HalluciFix/src -name "*.ts" -o -name "*.tsx" | while read -r file; do
        if has_console_statements "$file"; then
            print_status "Manual processing needed for: $file"
            # List remaining console statements for manual review
            grep -n "console\." "$file" | head -5
        fi
    done
}

# Function to create summary report
create_summary() {
    echo ""
    echo "==================================="
    echo "CONSOLE TO LOGGING MIGRATION REPORT"
    echo "==================================="
    echo "Total files processed: $TOTAL_FILES"
    echo "Files modified: $MODIFIED_FILES"
    echo "Console statements fixed: $CONSOLE_STATEMENTS_FIXED"
    echo ""
    
    if [ $CONSOLE_STATEMENTS_FIXED -gt 0 ]; then
        print_success "Migration completed successfully!"
        echo ""
        echo "Next steps:"
        echo "1. Run 'npm run lint' to check remaining console statements"
        echo "2. Review any complex console statements that may need manual adjustment"
        echo "3. Test the application to ensure logging works correctly"
    else
        print_warning "No console statements were fixed. Please check the script logic."
    fi
}

# Function to backup files before processing
backup_files() {
    print_status "Creating backup of files..."
    mkdir -p /tmp/hallucifix_backup
    find /home/antonio/ideascope/HalluciFix/src -name "*.ts" -o -name "*.tsx" -exec cp --parents {} /tmp/hallucifix_backup \;
    print_success "Backup created in /tmp/hallucifix_backup"
}

# Function to validate changes
validate_changes() {
    print_status "Validating changes..."
    
    # Check for TypeScript compilation errors
    if command -v npx >/dev/null 2>&1; then
        if npx tsc --noEmit --skipLibCheck >/dev/null 2>&1; then
            print_success "TypeScript compilation check passed"
        else
            print_warning "TypeScript compilation issues detected - please review"
        fi
    fi
    
    # Check for remaining console statements
    local remaining_console=$(find /home/antonio/ideascope/HalluciFix/src -name "*.ts" -o -name "*.tsx" -exec grep -l "console\." {} \; | wc -l)
    if [ $remaining_console -eq 0 ]; then
        print_success "All console statements have been replaced!"
    else
        print_warning "$remaining_console files still contain console statements"
        find /home/antonio/ideascope/HalluciFix/src -name "*.ts" -o -name "*.tsx" -exec grep -l "console\." {} \; | head -5
    fi
}

# Main execution
main() {
    echo "HalluciFix Console to Logging Migration Script"
    echo "=============================================="
    echo ""
    
    # Check if we're in the correct directory
    if [ ! -f "package.json" ] || [ ! -d "src" ]; then
        print_error "Please run this script from the HalluciFix root directory"
        exit 1
    fi
    
    # Create backup
    backup_files
    
    # Process files
    process_all_files
    
    # Validate changes
    validate_changes
    
    # Create summary
    create_summary
}

# Run the main function
main