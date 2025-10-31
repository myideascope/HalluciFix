#!/bin/bash

# TypeScript Error Analysis Script
# This script runs the error analysis and tracking system

set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
INFRASTRUCTURE_DIR="$(dirname "$SCRIPT_DIR")"

echo "🔍 TypeScript Error Analysis and Tracking System"
echo "================================================"
echo ""

cd "$INFRASTRUCTURE_DIR"

# Check if node_modules exists
if [ ! -d "node_modules" ]; then
    echo "📦 Installing dependencies..."
    npm install
    echo ""
fi

# Check if TypeScript is available
if ! command -v npx &> /dev/null; then
    echo "❌ Error: npx is not available. Please install Node.js and npm."
    exit 1
fi

# Run the error analysis
echo "🚀 Running error analysis..."
echo ""

if [ "$1" = "--backup-only" ]; then
    echo "📋 Creating backup only..."
    npx ts-node scripts/error-analysis.ts --backup-only
else
    echo "📋 Running full error analysis..."
    npx ts-node scripts/error-analysis.ts
fi

echo ""
echo "✅ Analysis complete!"
echo ""
echo "📁 Check the following directories for results:"
echo "   - .backup/        - Backup files"
echo "   - .error-reports/ - Analysis reports"
echo ""