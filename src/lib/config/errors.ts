/**
 * Configuration error classes with detailed error reporting
 * Provides comprehensive error handling for configuration issues
 */

/**
 * Base configuration error class
 */
export abstract class ConfigurationError extends Error {
  abstract readonly errorCode: string;
  
  constructor(message: string, public readonly context?: Record<string, any>) {
    super(message);
    this.name = this.constructor.name;
  }

  /**
   * Get formatted error message with context
   */
  getFormattedMessage(): string {
    let message = this.message;
    
    if (this.context) {
      message += '\n\nContext:';
      Object.entries(this.context).forEach(([key, value]) => {
        message += `\n  ${key}: ${JSON.stringify(value)}`;
      });
    }
    
    return message;
  }
}

/**
 * Configuration validation error
 */
export class ConfigurationValidationError extends ConfigurationError {
  readonly errorCode = 'CONFIG_VALIDATION_ERROR';

  constructor(
    message: string,
    public readonly validationErrors: string[] = [],
    public readonly missingRequired: string[] = [],
    public readonly warnings: string[] = [],
    context?: Record<string, any>
  ) {
    super(message, context);
  }

  toString(): string {
    let errorMessage = `${this.name}: ${this.message}\n`;

    if (this.missingRequired.length > 0) {
      errorMessage += '\n❌ Missing required configuration:\n';
      errorMessage += this.missingRequired.map(err => `  • ${err}`).join('\n');
    }

    if (this.validationErrors.length > 0) {
      errorMessage += '\n❌ Invalid configuration:\n';
      errorMessage += this.validationErrors.map(err => `  • ${err}`).join('\n');
    }

    if (this.warnings.length > 0) {
      errorMessage += '\n⚠️  Configuration warnings:\n';
      errorMessage += this.warnings.map(warn => `  • ${warn}`).join('\n');
    }

    errorMessage += '\n\n📖 Please check your environment configuration and the .env.example file for guidance.';

    if (this.context) {
      errorMessage += '\n\nContext:';
      Object.entries(this.context).forEach(([key, value]) => {
        errorMessage += `\n  ${key}: ${JSON.stringify(value)}`;
      });
    }

    return errorMessage;
  }
}

/**
 * Configuration loading error
 */
export class ConfigurationLoadError extends ConfigurationError {
  readonly errorCode = 'CONFIG_LOAD_ERROR';

  constructor(
    message: string,
    public readonly source: string,
    public readonly originalError?: Error,
    context?: Record<string, any>
  ) {
    super(message, context);
  }

  toString(): string {
    let errorMessage = `${this.name}: ${this.message}\n`;
    errorMessage += `Source: ${this.source}\n`;
    
    if (this.originalError) {
      errorMessage += `Original Error: ${this.originalError.message}\n`;
    }

    if (this.context) {
      errorMessage += '\nContext:';
      Object.entries(this.context).forEach(([key, value]) => {
        errorMessage += `\n  ${key}: ${JSON.stringify(value)}`;
      });
    }

    return errorMessage;
  }
}

/**
 * Secret management error
 */
export class SecretManagerError extends ConfigurationError {
  readonly errorCode = 'SECRET_MANAGER_ERROR';

  constructor(
    message: string,
    public readonly secretKey?: string,
    public readonly operation?: 'get' | 'set' | 'delete' | 'list',
    context?: Record<string, any>
  ) {
    super(message, context);
  }

  toString(): string {
    let errorMessage = `${this.name}: ${this.message}\n`;
    
    if (this.secretKey) {
      errorMessage += `Secret Key: ${this.secretKey}\n`;
    }
    
    if (this.operation) {
      errorMessage += `Operation: ${this.operation}\n`;
    }

    if (this.context) {
      errorMessage += '\nContext:';
      Object.entries(this.context).forEach(([key, value]) => {
        errorMessage += `\n  ${key}: ${JSON.stringify(value)}`;
      });
    }

    return errorMessage;
  }
}

/**
 * Service connectivity error
 */
export class ServiceConnectivityError extends ConfigurationError {
  readonly errorCode = 'SERVICE_CONNECTIVITY_ERROR';

  constructor(
    message: string,
    public readonly service: string,
    public readonly endpoint?: string,
    public readonly statusCode?: number,
    context?: Record<string, any>
  ) {
    super(message, context);
  }

  toString(): string {
    let errorMessage = `${this.name}: ${this.message}\n`;
    errorMessage += `Service: ${this.service}\n`;
    
    if (this.endpoint) {
      errorMessage += `Endpoint: ${this.endpoint}\n`;
    }
    
    if (this.statusCode) {
      errorMessage += `Status Code: ${this.statusCode}\n`;
    }

    if (this.context) {
      errorMessage += '\nContext:';
      Object.entries(this.context).forEach(([key, value]) => {
        errorMessage += `\n  ${key}: ${JSON.stringify(value)}`;
      });
    }

    return errorMessage;
  }
}

/**
 * Environment file error
 */
export class EnvironmentFileError extends ConfigurationError {
  readonly errorCode = 'ENV_FILE_ERROR';

  constructor(
    message: string,
    public readonly filePath: string,
    public readonly operation: 'read' | 'write' | 'parse',
    context?: Record<string, any>
  ) {
    super(message, context);
  }

  toString(): string {
    let errorMessage = `${this.name}: ${this.message}\n`;
    errorMessage += `File Path: ${this.filePath}\n`;
    errorMessage += `Operation: ${this.operation}\n`;

    if (this.context) {
      errorMessage += '\nContext:';
      Object.entries(this.context).forEach(([key, value]) => {
        errorMessage += `\n  ${key}: ${JSON.stringify(value)}`;
      });
    }

    return errorMessage;
  }
}

/**
 * Configuration initialization error
 */
export class ConfigurationInitializationError extends ConfigurationError {
  readonly errorCode = 'CONFIG_INIT_ERROR';

  constructor(
    message: string,
    public readonly phase: 'loading' | 'validation' | 'connectivity' | 'caching',
    public readonly originalError?: Error,
    context?: Record<string, any>
  ) {
    super(message, context);
  }

  toString(): string {
    let errorMessage = `${this.name}: ${this.message}\n`;
    errorMessage += `Phase: ${this.phase}\n`;
    
    if (this.originalError) {
      errorMessage += `Original Error: ${this.originalError.message}\n`;
    }

    if (this.context) {
      errorMessage += '\nContext:';
      Object.entries(this.context).forEach(([key, value]) => {
        errorMessage += `\n  ${key}: ${JSON.stringify(value)}`;
      });
    }

    return errorMessage;
  }
}

/**
 * Feature flag error
 */
export class FeatureFlagError extends ConfigurationError {
  readonly errorCode = 'FEATURE_FLAG_ERROR';

  constructor(
    message: string,
    public readonly flagName: string,
    public readonly operation: 'get' | 'set' | 'evaluate',
    context?: Record<string, any>
  ) {
    super(message, context);
  }

  toString(): string {
    let errorMessage = `${this.name}: ${this.message}\n`;
    errorMessage += `Flag Name: ${this.flagName}\n`;
    errorMessage += `Operation: ${this.operation}\n`;

    if (this.context) {
      errorMessage += '\nContext:';
      Object.entries(this.context).forEach(([key, value]) => {
        errorMessage += `\n  ${key}: ${JSON.stringify(value)}`;
      });
    }

    return errorMessage;
  }
}

/**
 * Configuration access error
 */
export class ConfigurationAccessError extends ConfigurationError {
  readonly errorCode = 'CONFIG_ACCESS_ERROR';

  constructor(
    message: string,
    public readonly configPath: string,
    public readonly accessType: 'get' | 'set' | 'check',
    context?: Record<string, any>
  ) {
    super(message, context);
  }

  toString(): string {
    let errorMessage = `${this.name}: ${this.message}\n`;
    errorMessage += `Config Path: ${this.configPath}\n`;
    errorMessage += `Access Type: ${this.accessType}\n`;

    if (this.context) {
      errorMessage += '\nContext:';
      Object.entries(this.context).forEach(([key, value]) => {
        errorMessage += `\n  ${key}: ${JSON.stringify(value)}`;
      });
    }

    return errorMessage;
  }
}

/**
 * Helper function to create configuration error with context
 */
export function createConfigurationError(
  ErrorClass: new (...args: any[]) => ConfigurationError,
  message: string,
  context?: Record<string, any>,
  ...additionalArgs: any[]
): ConfigurationError {
  return new ErrorClass(message, ...additionalArgs, context);
}

/**
 * Helper function to wrap errors with configuration context
 */
export function wrapConfigurationError(
  error: Error,
  context: Record<string, any>
): ConfigurationError {
  if (error instanceof ConfigurationError) {
    return error;
  }

  return new ConfigurationInitializationError(
    `Configuration error: ${error.message}`,
    'loading',
    error,
    context
  );
}

/**
 * Error severity levels
 */
export enum ErrorSeverity {
  LOW = 'low',
  MEDIUM = 'medium',
  HIGH = 'high',
  CRITICAL = 'critical'
}

/**
 * Get error severity based on error type and context
 */
export function getErrorSeverity(error: ConfigurationError): ErrorSeverity {
  switch (error.errorCode) {
    case 'CONFIG_VALIDATION_ERROR':
      const validationError = error as ConfigurationValidationError;
      if (validationError.missingRequired.length > 0) {
        return ErrorSeverity.CRITICAL;
      }
      if (validationError.validationErrors.length > 0) {
        return ErrorSeverity.HIGH;
      }
      return ErrorSeverity.MEDIUM;

    case 'SECRET_MANAGER_ERROR':
    case 'SERVICE_CONNECTIVITY_ERROR':
      return ErrorSeverity.HIGH;

    case 'CONFIG_INIT_ERROR':
      return ErrorSeverity.CRITICAL;

    case 'ENV_FILE_ERROR':
    case 'CONFIG_LOAD_ERROR':
      return ErrorSeverity.MEDIUM;

    case 'FEATURE_FLAG_ERROR':
    case 'CONFIG_ACCESS_ERROR':
      return ErrorSeverity.LOW;

    default:
      return ErrorSeverity.MEDIUM;
  }
}