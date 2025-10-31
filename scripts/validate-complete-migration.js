#!/usr/bin/env node

/**
 * Complete Migration Validation Script
 * 
 * This script validates the complete user migration from Supabase to AWS
 * by checking Cognito, RDS, and the mappings between them.
 * 
 * Usage:
 *   node scripts/validate-complete-migration.js [options]
 * 
 * Options:
 *   --detailed         Show detailed comparison for each user
 *   --export-report    Export validation report to JSON file
 *   --help             Show this help message
 */

const { createClient } = require('@supabase/supabase-js');
const { CognitoIdentityProviderClient, ListUsersCommand } = require('@aws-sdk/client-cognito-identity-provider');
const { Client } = require('pg');
const fs = require('fs');
const path = require('path');

// Configuration
const config = {
  supabase: {
    url: process.env.VITE_SUPABASE_URL,
    serviceKey: process.env.SUPABASE_SERVICE_KEY,
  },
  cognito: {
    region: process.env.VITE_AWS_REGION || 'us-east-1',
    userPoolId: process.env.VITE_AWS_USER_POOL_ID,
  },
  rds: {
    host: process.env.DB_HOST,
    port: process.env.DB_PORT || 5432,
    database: process.env.DB_NAME || 'hallucifix',
    username: process.env.DB_USERNAME,
    password: process.env.DB_PASSWORD,
    ssl: process.env.DB_SSL === 'true',
  },
 