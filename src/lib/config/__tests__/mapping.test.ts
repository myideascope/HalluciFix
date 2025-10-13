/**
 * Tests for environment variable mapping system
 */

import { describe, it, expect } from 'vitest';
import {
  getMappingByEnvKey,
  getMappingByConfigPath,
  getRequiredEnvironmentVariables,
  getOptionalEnvironmentVariables,
  validateEnvironmentValue,
  parseEnvironmentValue
} from '../mapping';

describe('Environment Variable Mapping', () => {
  it('should find mapping by environment variable key', () => {
    const mapping = getMappingByEnvKey('VITE_SUPABASE_URL');
    
    expect(mapping).toBeDefined();
    expect(mapping?.configPath).toEqual(['database', 'supabaseUrl']);
    expect(mapping?.required).toBe(true);
    expect(mapping?.type).toBe('string');
  });

  it('should find mapping by configuration path', () => {
    const mapping = getMappingByConfigPath(['app', 'name']);
    
    expect(mapping).toBeDefined();
    expect(mapping?.envKey).toBe('VITE_APP_NAME');
    expect(mapping?.required).toBe(false);
    expect(mapping?.defaultValue).toBe('HalluciFix');
  });

  it('should return undefined for non-existent mappings', () => {
    const envMapping = getMappingByEnvKey('NON_EXISTENT_VAR');
    const pathMapping = getMappingByConfigPath(['non', 'existent', 'path']);
    
    expect(envMapping).toBeUndefined();
    expect(pathMapping).toBeUndefined();
  });

  it('should get required environment variables', () => {
    const required = getRequiredEnvironmentVariables();
    
    expect(required).toContain('VITE_SUPABASE_URL');
    expect(required).toContain('VITE_SUPABASE_ANON_KEY');
    expect(required).not.toContain('VITE_APP_NAME'); // This has a default
  });

  it('should get optional environment variables', () => {
    const optional = getOptionalEnvironmentVariables();
    
    expect(optional).toContain('VITE_APP_NAME');
    expect(optional).toContain('VITE_OPENAI_API_KEY');
    expect(optional).not.toContain('VITE_SUPABASE_URL'); // This is required
  });

  it('should validate environment values against patterns', () => {
    const openaiMapping = getMappingByEnvKey('VITE_OPENAI_API_KEY')!;
    
    // Valid OpenAI key format
    const validResult = validateEnvironmentValue(openaiMapping, 'sk-' + 'a'.repeat(48));
    expect(validResult.isValid).toBe(true);
    
    // Invalid OpenAI key format
    const invalidResult = validateEnvironmentValue(openaiMapping, 'invalid-key');
    expect(invalidResult.isValid).toBe(false);
    expect(invalidResult.error).toContain('pattern');
  });

  it('should validate numeric ranges', () => {
    const portMapping = getMappingByEnvKey('PORT')!;
    
    // Valid port number
    const validResult = validateEnvironmentValue(portMapping, '3000');
    expect(validResult.isValid).toBe(true);
    
    // Invalid port number (too high)
    const invalidResult = validateEnvironmentValue(portMapping, '99999');
    expect(invalidResult.isValid).toBe(false);
    expect(invalidResult.error).toContain('no more than');
  });

  it('should validate string length', () => {
    const jwtMapping = getMappingByEnvKey('JWT_SECRET')!;
    
    // Valid JWT secret (32+ characters)
    const validResult = validateEnvironmentValue(jwtMapping, 'a'.repeat(32));
    expect(validResult.isValid).toBe(true);
    
    // Invalid JWT secret (too short)
    const invalidResult = validateEnvironmentValue(jwtMapping, 'short');
    expect(invalidResult.isValid).toBe(false);
    expect(invalidResult.error).toContain('at least 32 characters');
  });

  it('should parse environment values by type', () => {
    const booleanMapping = getMappingByEnvKey('VITE_ENABLE_ANALYTICS')!;
    const numberMapping = getMappingByEnvKey('PORT')!;
    const arrayMapping = getMappingByEnvKey('CORS_ORIGINS')!;
    const stringMapping = getMappingByEnvKey('VITE_APP_NAME')!;
    
    expect(parseEnvironmentValue(booleanMapping, 'true')).toBe(true);
    expect(parseEnvironmentValue(booleanMapping, 'false')).toBe(false);
    expect(parseEnvironmentValue(numberMapping, '3000')).toBe(3000);
    expect(parseEnvironmentValue(arrayMapping, 'http://localhost:3000,http://localhost:5173')).toEqual([
      'http://localhost:3000',
      'http://localhost:5173'
    ]);
    expect(parseEnvironmentValue(stringMapping, 'TestApp')).toBe('TestApp');
  });
});