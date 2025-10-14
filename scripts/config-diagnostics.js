#!/usr/bin/env node

/**
 * Configuration diagnostics CLI script
 * Provides command-line access to configuration diagnostics and troubleshooting tools
 */

import { runConfigurationDiagnosticsCli } from '../src/lib/config/diagnosticsCli.js';

// Get command line arguments (skip node and script name)
const args = process.argv.slice(2);

// Run the CLI
runConfigurationDiagnosticsCli(args).catch(error => {
  console.error('❌ Configuration diagnostics failed:', error.message);
  process.exit(1);
});