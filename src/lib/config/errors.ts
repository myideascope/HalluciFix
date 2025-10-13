/**
 * Configuration error classes
 * Provides detailed error reporting for configuration issues
 */

export class ConfigurationError extends Error {
  constructor(
    message: string,
    public validationErrors?: string[],
    public missingKeys?: string[]
  ) {
    super(message);
    this.name = 'ConfigurationError';
  }
}

export class SecretManagerError extends Error {
  constructor(message: string, public secretKey?: string) {
    super(message);
    this.name = 'SecretManagerError';
  }
}

export class ConnectivityError extends Error {
  constructor(message: string, public service?: string) {
    super(message);
    this.name = 'ConnectivityError';
  }
}

export class EnvironmentFileError extends Error {
  constructor(message: string, public filePath?: string) {
    super(message);
    this.name = 'EnvironmentFileError';
  }
}