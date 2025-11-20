#!/bin/bash

# HalluciFix AWS Cleanup Setup Script
# Makes the cleanup script executable and provides usage instructions

set -e

# Colors for output
GREEN='\033[0;32m'
BLUE='\033[0;34m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

print_success() {
    echo -e "${GREEN}✅ $1${NC}"
}

print_info() {
    echo -e "${BLUE}ℹ️  $1${NC}"
}

print_warning() {
    echo -e "${YELLOW}⚠️  $1${NC}"
}

# Make the cleanup script executable
if [ -f "infrastructure/cleanup-dev-environments.sh" ]; then
    chmod +x infrastructure/cleanup-dev-environments.sh
    print_success "Made cleanup script executable"
else
    print_warning "Cleanup script not found at infrastructure/cleanup-dev-environments.sh"
    exit 1
fi

print_success "HalluciFix AWS Cleanup Script Setup Complete"
echo ""
print_info "Usage Examples:"
echo ""
echo "1. Dry run to see what would be deleted:"
echo "   ./infrastructure/cleanup-dev-environments.sh -e dev -d"
echo ""
echo "2. Cleanup development environment with confirmation:"
echo "   ./infrastructure/cleanup-dev-environments.sh -e dev"
echo ""
echo "3. Force cleanup without confirmation:"
echo "   ./infrastructure/cleanup-dev-environments.sh -e dev -f"
echo ""
echo "4. Cleanup staging environment:"
echo "   ./infrastructure/cleanup-dev-environments.sh -e staging"
echo ""
echo "5. Show help:"
echo "   ./infrastructure/cleanup-dev-environments.sh --help"
echo ""
print_warning "⚠️  Important Notes:"
echo "   - Always use --dry-run first to preview changes"
echo "   - This script will permanently delete AWS resources"
echo "   - Make sure you're using the correct AWS profile"
echo "   - Verify environment name to avoid accidental production deletion"
echo ""
print_info "For detailed information, see: infrastructure/AWS_CLEANUP_GUIDE.md"