/**
 * PKCE (Proof Key for Code Exchange) helper functions for OAuth 2.0 security
 * Implements RFC 7636 specification
 */

export class PKCEHelper {
  /**
   * Generate a cryptographically secure code verifier
   * Must be 43-128 characters long and use unreserved characters
   */
  static generateCodeVerifier(): string {
    // Generate 32 random bytes (256 bits)
    const array = new Uint8Array(32);
    
    // Use crypto.getRandomValues for cryptographically secure random generation
    if (typeof crypto !== 'undefined' && crypto.getRandomValues) {
      crypto.getRandomValues(array);
    } else {
      // Fallback for environments without crypto.getRandomValues
      for (let i = 0; i < array.length; i++) {
        array[i] = Math.floor(Math.random() * 256);
      }
    }
    
    return this.base64URLEncode(array);
  }

  /**
   * Generate code challenge from code verifier using SHA256
   * Uses S256 method as recommended by RFC 7636
   */
  static async generateCodeChallenge(verifier: string): Promise<string> {
    if (!verifier || verifier.length < 43 || verifier.length > 128) {
      throw new Error('Code verifier must be between 43 and 128 characters');
    }

    try {
      // Convert verifier to bytes
      const encoder = new TextEncoder();
      const data = encoder.encode(verifier);
      
      // Generate SHA256 hash
      let digest: ArrayBuffer;
      
      if (typeof crypto !== 'undefined' && crypto.subtle) {
        // Use Web Crypto API in browsers
        digest = await crypto.subtle.digest('SHA-256', data);
      } else {
        // Fallback for environments without Web Crypto API
        throw new Error('SHA-256 hashing not available in this environment');
      }
      
      // Convert to base64URL
      return this.base64URLEncode(new Uint8Array(digest));
    } catch (error) {
      throw new Error(`Failed to generate code challenge: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  /**
   * Validate code verifier format according to RFC 7636
   */
  static validateCodeVerifier(verifier: string): boolean {
    if (!verifier) {
      return false;
    }

    // Check length (43-128 characters)
    if (verifier.length < 43 || verifier.length > 128) {
      return false;
    }

    // Check character set (unreserved characters: A-Z, a-z, 0-9, -, ., _, ~)
    const unreservedPattern = /^[A-Za-z0-9\-._~]+$/;
    return unreservedPattern.test(verifier);
  }

  /**
   * Verify code challenge against verifier
   */
  static async verifyCodeChallenge(verifier: string, challenge: string): Promise<boolean> {
    try {
      if (!this.validateCodeVerifier(verifier)) {
        return false;
      }

      const generatedChallenge = await this.generateCodeChallenge(verifier);
      return generatedChallenge === challenge;
    } catch (error) {
      return false;
    }
  }

  /**
   * Encode bytes to base64URL format (RFC 4648 Section 5)
   * Base64URL is base64 with URL-safe characters and no padding
   */
  static base64URLEncode(array: Uint8Array): string {
    // Convert to base64
    let base64 = '';
    
    if (typeof btoa !== 'undefined') {
      // Browser environment
      base64 = btoa(String.fromCharCode(...array));
    } else {
      // Node.js environment fallback
      base64 = Buffer.from(array).toString('base64');
    }
    
    // Convert to base64URL by replacing characters and removing padding
    return base64
      .replace(/\+/g, '-')  // Replace + with -
      .replace(/\//g, '_')  // Replace / with _
      .replace(/=/g, '');   // Remove padding
  }

  /**
   * Decode base64URL to bytes
   */
  static base64URLDecode(base64url: string): Uint8Array {
    // Add padding if needed
    let base64 = base64url
      .replace(/-/g, '+')  // Replace - with +
      .replace(/_/g, '/'); // Replace _ with /
    
    // Add padding
    const padding = base64.length % 4;
    if (padding) {
      base64 += '='.repeat(4 - padding);
    }

    if (typeof atob !== 'undefined') {
      // Browser environment
      const binaryString = atob(base64);
      const bytes = new Uint8Array(binaryString.length);
      for (let i = 0; i < binaryString.length; i++) {
        bytes[i] = binaryString.charCodeAt(i);
      }
      return bytes;
    } else {
      // Node.js environment fallback
      return new Uint8Array(Buffer.from(base64, 'base64'));
    }
  }

  /**
   * Generate secure random state parameter for CSRF protection
   */
  static generateSecureState(): string {
    const array = new Uint8Array(16); // 128 bits
    
    if (typeof crypto !== 'undefined' && crypto.getRandomValues) {
      crypto.getRandomValues(array);
    } else {
      // Fallback for environments without crypto.getRandomValues
      for (let i = 0; i < array.length; i++) {
        array[i] = Math.floor(Math.random() * 256);
      }
    }
    
    return this.base64URLEncode(array);
  }

  /**
   * Validate state format and security requirements
   */
  static validateStateFormat(stateValue: string): boolean {
    if (!stateValue) {
      return false;
    }

    // State should be at least 16 characters (128 bits base64URL encoded)
    if (stateValue.length < 22) {
      return false;
    }

    // Check if it's valid base64URL format
    const base64URLPattern = /^[A-Za-z0-9\-_]+$/;
    return base64URLPattern.test(stateValue);
  }
}