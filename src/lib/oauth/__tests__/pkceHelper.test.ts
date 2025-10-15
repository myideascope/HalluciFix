import { describe, it, expect } from 'vitest';
import { PKCEHelper } from '../pkceHelper';

describe('PKCEHelper', () => {
  describe('generateCodeVerifier', () => {
    it('should generate a code verifier with correct length', () => {
      const verifier = PKCEHelper.generateCodeVerifier();
      expect(verifier.length).toBeGreaterThanOrEqual(43);
      expect(verifier.length).toBeLessThanOrEqual(128);
    });

    it('should generate unique verifiers', () => {
      const verifier1 = PKCEHelper.generateCodeVerifier();
      const verifier2 = PKCEHelper.generateCodeVerifier();
      expect(verifier1).not.toBe(verifier2);
    });

    it('should generate base64URL encoded strings', () => {
      const verifier = PKCEHelper.generateCodeVerifier();
      const base64URLPattern = /^[A-Za-z0-9\-_]+$/;
      expect(base64URLPattern.test(verifier)).toBe(true);
    });
  });

  describe('generateCodeChallenge', () => {
    it('should generate a code challenge from verifier', async () => {
      const verifier = PKCEHelper.generateCodeVerifier();
      const challenge = await PKCEHelper.generateCodeChallenge(verifier);
      
      expect(challenge).toBeDefined();
      expect(challenge.length).toBeGreaterThan(0);
      expect(challenge).not.toBe(verifier);
    });

    it('should generate consistent challenges for same verifier', async () => {
      const verifier = PKCEHelper.generateCodeVerifier();
      const challenge1 = await PKCEHelper.generateCodeChallenge(verifier);
      const challenge2 = await PKCEHelper.generateCodeChallenge(verifier);
      
      expect(challenge1).toBe(challenge2);
    });

    it('should throw error for invalid verifier', async () => {
      await expect(PKCEHelper.generateCodeChallenge('')).rejects.toThrow();
      await expect(PKCEHelper.generateCodeChallenge('short')).rejects.toThrow();
    });
  });

  describe('validateCodeVerifier', () => {
    it('should validate correct verifiers', () => {
      const verifier = PKCEHelper.generateCodeVerifier();
      expect(PKCEHelper.validateCodeVerifier(verifier)).toBe(true);
    });

    it('should reject invalid verifiers', () => {
      expect(PKCEHelper.validateCodeVerifier('')).toBe(false);
      expect(PKCEHelper.validateCodeVerifier('short')).toBe(false);
      expect(PKCEHelper.validateCodeVerifier('invalid@characters!')).toBe(false);
    });
  });

  describe('verifyCodeChallenge', () => {
    it('should verify correct challenge-verifier pairs', async () => {
      const verifier = PKCEHelper.generateCodeVerifier();
      const challenge = await PKCEHelper.generateCodeChallenge(verifier);
      
      const isValid = await PKCEHelper.verifyCodeChallenge(verifier, challenge);
      expect(isValid).toBe(true);
    });

    it('should reject incorrect challenge-verifier pairs', async () => {
      const verifier1 = PKCEHelper.generateCodeVerifier();
      const verifier2 = PKCEHelper.generateCodeVerifier();
      const challenge1 = await PKCEHelper.generateCodeChallenge(verifier1);
      
      const isValid = await PKCEHelper.verifyCodeChallenge(verifier2, challenge1);
      expect(isValid).toBe(false);
    });
  });

  describe('base64URLEncode', () => {
    it('should encode bytes to base64URL format', () => {
      const testBytes = new Uint8Array([72, 101, 108, 108, 111]); // "Hello"
      const encoded = PKCEHelper.base64URLEncode(testBytes);
      
      expect(encoded).toBeDefined();
      expect(encoded).not.toContain('+');
      expect(encoded).not.toContain('/');
      expect(encoded).not.toContain('=');
    });
  });

  describe('generateSecureState', () => {
    it('should generate secure state parameters', () => {
      const state = PKCEHelper.generateSecureState();
      
      expect(state).toBeDefined();
      expect(state.length).toBeGreaterThan(0);
      expect(PKCEHelper.validateStateFormat(state)).toBe(true);
    });

    it('should generate unique state values', () => {
      const state1 = PKCEHelper.generateSecureState();
      const state2 = PKCEHelper.generateSecureState();
      
      expect(state1).not.toBe(state2);
    });
  });
});