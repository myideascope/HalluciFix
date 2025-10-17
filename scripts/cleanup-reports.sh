#!/bin/bash

# Test Reports Cleanup Script
# This script removes only test reports and artifacts, keeping test code intact

echo "🧹 Cleaning up test reports and artifacts..."

# Remove report directories
echo "Removing report directories..."
rm -rf test-results/
rm -rf coverage/
rm -rf accessibility-test-report/
rm -rf performance-report/
rm -rf performance-results/
rm -rf .test-dashboard/
rm -rf e2e/test-results/
rm -rf playwright-report/

# Remove report files
echo "Removing report files..."
find . -name "*-results.json" -type f -delete
find . -name "*-results.xml" -type f -delete
find . -name "*-report.html" -type f -delete
find . -name "*.webm" -type f -delete
find . -name "*.har" -type f -delete

# Remove any test artifact directories
find . -name "*-test-report*" -type d -exec rm -rf {} + 2>/dev/null || true
find . -name "test-report*" -type d -exec rm -rf {} + 2>/dev/null || true

echo "✅ Test reports cleanup completed!"
echo ""
echo "📋 Removed:"
echo "  - Test result directories"
echo "  - Coverage reports"
echo "  - Accessibility reports"
echo "  - Performance reports"
echo "  - Video recordings (.webm files)"
echo "  - HAR files"
echo ""
echo "✨ Test code and configuration files remain intact."