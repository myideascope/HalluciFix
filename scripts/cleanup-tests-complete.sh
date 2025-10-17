#!/bin/bash

# Complete Test Files Cleanup Script
# This script removes all test files, dependencies, and configurations

echo "🧹 Starting complete test cleanup..."

# Run the basic cleanup first
if [ -f "scripts/cleanup-tests.sh" ]; then
    echo "Running basic test cleanup..."
    ./scripts/cleanup-tests.sh
fi

# Remove test-related dependencies
echo "Removing test-related npm packages..."

# Testing frameworks and utilities
npm uninstall --save-dev \
    vitest \
    @vitest/ui \
    @testing-library/react \
    @testing-library/jest-dom \
    @testing-library/user-event \
    jsdom \
    @faker-js/faker \
    msw

# Playwright and related packages
npm uninstall --save-dev \
    playwright \
    @playwright/test \
    @axe-core/playwright

# Coverage and reporting
npm uninstall --save-dev \
    @vitest/coverage-v8 \
    c8 \
    codecov

# Additional test utilities
npm uninstall --save-dev \
    expect-type \
    happy-dom

echo "Cleaning up package.json test scripts..."
npm pkg delete scripts.test 2>/dev/null || true
npm pkg delete scripts.test:ui 2>/dev/null || true
npm pkg delete scripts.test:coverage 2>/dev/null || true
npm pkg delete scripts.test:integration 2>/dev/null || true
npm pkg delete scripts.test:e2e 2>/dev/null || true
npm pkg delete scripts.test:accessibility 2>/dev/null || true
npm pkg delete scripts.test:performance 2>/dev/null || true
npm pkg delete scripts.test:security 2>/dev/null || true
npm pkg delete scripts.test:visual 2>/dev/null || true
npm pkg delete scripts.test:mobile 2>/dev/null || true
npm pkg delete scripts.test:load 2>/dev/null || true

# Clean up any remaining test artifacts
echo "Final cleanup of test artifacts..."
find . -name "*.test.*" -type f -delete 2>/dev/null || true
find . -name "*.spec.*" -type f -delete 2>/dev/null || true
find . -name "*test*" -type d -exec rm -rf {} + 2>/dev/null || true
find . -name "*coverage*" -type d -exec rm -rf {} + 2>/dev/null || true
find . -name "*.webm" -type f -delete 2>/dev/null || true

# Remove this cleanup script itself (optional)
# rm -f scripts/cleanup-tests.sh
# rm -f scripts/cleanup-tests-complete.sh

echo "✅ Complete test cleanup finished!"
echo ""
echo "📋 Summary:"
echo "  - Removed all test files and directories"
echo "  - Uninstalled test-related npm packages"
echo "  - Cleaned up package.json test scripts"
echo "  - Removed test artifacts and reports"
echo ""
echo "🔄 You may want to run 'npm install' to clean up package-lock.json"