#!/bin/bash

# Test Files Cleanup Script
# This script removes all test files, test results, and generated reports

echo "🧹 Starting test files cleanup..."

# Remove test directories
echo "Removing test directories..."
rm -rf e2e/
rm -rf src/test/
rm -rf test-results/
rm -rf coverage/
rm -rf accessibility-test-report/
rm -rf performance-report/
rm -rf performance-results/
rm -rf .test-dashboard/

# Remove test configuration files
echo "Removing test configuration files..."
rm -f playwright.*.config.ts
rm -f vitest.*.config.ts
rm -f codecov.yml

# Remove test-related scripts
echo "Removing test-related scripts..."
rm -f scripts/coverage-check.js
rm -f scripts/security-testing.js
rm -f scripts/test-dashboard.cjs
rm -f scripts/test-data-management.js
rm -f scripts/test-health-monitor.cjs
rm -f scripts/test-maintenance.cjs
rm -f scripts/test-oauth-flow.js
rm -f scripts/test-performance-monitor.cjs
rm -f scripts/test-reporter.js
rm -f scripts/visual-regression.js

# Remove test-related documentation
echo "Removing test documentation..."
rm -f docs/TESTING_*.md

# Remove any remaining test artifacts
echo "Removing test artifacts..."
find . -name "*.test.ts" -type f -delete
find . -name "*.test.tsx" -type f -delete
find . -name "*.spec.ts" -type f -delete
find . -name "*.spec.tsx" -type f -delete
find . -name "test-results*" -type d -exec rm -rf {} + 2>/dev/null || true
find . -name "*-test-report*" -type d -exec rm -rf {} + 2>/dev/null || true
find . -name "*.webm" -type f -delete
find . -name "*-report.html" -type f -delete
find . -name "*-results.json" -type f -delete
find . -name "*-results.xml" -type f -delete

# Clean up package.json test scripts (optional - commented out)
# echo "Cleaning up package.json test scripts..."
# npm pkg delete scripts.test
# npm pkg delete scripts.test:ui
# npm pkg delete scripts.test:coverage
# npm pkg delete scripts.test:integration
# npm pkg delete scripts.test:e2e
# npm pkg delete scripts.test:accessibility
# npm pkg delete scripts.test:performance
# npm pkg delete scripts.test:security
# npm pkg delete scripts.test:visual

echo "✅ Test files cleanup completed!"
echo ""
echo "📋 Summary of removed items:"
echo "  - All e2e test files and directories"
echo "  - All unit test files and directories"
echo "  - Test results and coverage reports"
echo "  - Test configuration files"
echo "  - Test-related scripts and documentation"
echo "  - Test artifacts (.webm, reports, etc.)"
echo ""
echo "⚠️  Note: package.json test scripts were preserved."
echo "   Uncomment the package.json cleanup section if you want to remove them too."