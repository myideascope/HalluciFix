import { createClient, SupabaseClient } from '@supabase/supabase-js';
import { config } from './env';
import { dbSecurityMonitor } from './databaseSecurityMonitor';
import { dbPerformanceMonitor } from './databasePerformanceMonitor';

/**
 * Secure Supabase client wrapper with integrated security monitoring and audit logging
 */
class SecureSupabaseClient {
  private client: SupabaseClient;
  private currentUser: { id: string; email?: string } | null = null;
  private clientInfo: { ipAddress?: string; userAgent?: string } = {};

  constructor(supabaseUrl: string, supabaseKey: string) {
    this.client = createClient(supabaseUrl, supabaseKey, {
      auth: {
        persistSession: true,
        autoRefreshToken: true,
      },
      db: {
        schema: 'public',
      },
      global: {
        headers: {
          'X-Client-Info': 'HalluciFix-SecureClient',
        },
      },
    });

    this.initializeSecurityIntegration();
  }

  /**
   * Initialize security monitoring integration
   */
  private initializeSecurityIntegration(): void {
    // Monitor auth state changes
    this.client.auth.onAuthStateChange((event, session) => {
      if (event === 'SIGNED_IN' && session?.user) {
        this.currentUser = {
          id: session.user.id,
          email: session.user.email,
        };
        
        // Log successful login
        dbSecurityMonitor.logDataAccess(
          session.user.id,
          'authentication',
          'login',
          {
            ipAddress: this.clientInfo.ipAddress,
            success: true,
            metadata: {
              email: session.user.email,
              loginMethod: session.user.app_metadata?.provider || 'email',
            },
          }
        );
      } else if (event === 'SIGNED_OUT') {
        if (this.currentUser) {
          // Log logout
          dbSecurityMonitor.logDataAccess(
            this.currentUser.id,
            'authentication',
            'logout',
            {
              ipAddress: this.clientInfo.ipAddress,
              success: true,
            }
          );
        }
        this.currentUser = null;
      } else if (event === 'TOKEN_REFRESHED') {
        // Log token refresh for audit trail
        if (this.currentUser) {
          dbSecurityMonitor.logDataAccess(
            this.currentUser.id,
            'authentication',
            'token_refresh',
            {
              ipAddress: this.clientInfo.ipAddress,
              success: true,
            }
          );
        }
      }
    });
  }

  /**
   * Set client information for security logging
   */
  setClientInfo(info: { ipAddress?: string; userAgent?: string }): void {
    this.clientInfo = { ...this.clientInfo, ...info };
  }

  /**
   * Get the underlying Supabase client
   */
  get supabase(): SupabaseClient {
    return this.client;
  }

  /**
   * Secure query wrapper with monitoring and audit logging
   */
  async secureQuery<T = any>(
    operation: 'SELECT' | 'INSERT' | 'UPDATE' | 'DELETE',
    tableName: string,
    queryFn: () => Promise<{ data: T; error: any }>,
    options?: {
      skipAudit?: boolean;
      skipSecurity?: boolean;
      metadata?: Record<string, any>;
    }
  ): Promise<{ data: T; error: any }> {
    const startTime = Date.now();
    const queryId = `${operation}_${tableName}_${Date.now()}`;

    try {
      // Security analysis (if not skipped)
      if (!options?.skipSecurity) {
        const queryString = `${operation} FROM ${tableName}`;
        const securityResult = await dbSecurityMonitor.analyzeQuerySecurity(
          queryString,
          {
            userId: this.currentUser?.id,
            ipAddress: this.clientInfo.ipAddress,
            userAgent: this.clientInfo.userAgent,
          }
        );

        if (securityResult.isSuspicious) {
          console.warn(`Suspicious query detected: ${securityResult.threats.join(', ')}`);
        }
      }

      // Execute the query with performance monitoring
      const result = await dbPerformanceMonitor.trackQuery(
        queryId,
        queryFn,
        {
          userId: this.currentUser?.id,
          endpoint: `${operation}_${tableName}`,
        }
      );

      const executionTime = Date.now() - startTime;

      // Audit logging (if not skipped and operation succeeded)
      if (!options?.skipAudit && !result.error) {
        await dbSecurityMonitor.logDatabaseOperation(
          operation,
          tableName,
          {
            userId: this.currentUser?.id,
            ipAddress: this.clientInfo.ipAddress,
            userAgent: this.clientInfo.userAgent,
            rowsAffected: Array.isArray(result.data) ? result.data.length : 1,
            queryHash: this.generateQueryHash(queryId),
            metadata: {
              executionTime,
              ...options?.metadata,
            },
          }
        );

        // Log data access for sensitive tables
        if (this.isSensitiveTable(tableName) && this.currentUser) {
          await dbSecurityMonitor.logDataAccess(
            this.currentUser.id,
            tableName,
            operation.toLowerCase(),
            {
              ipAddress: this.clientInfo.ipAddress,
              success: true,
              metadata: {
                rowsAffected: Array.isArray(result.data) ? result.data.length : 1,
                executionTime,
              },
            }
          );
        }
      }

      return result;
    } catch (error) {
      // Log failed operations
      if (!options?.skipAudit) {
        await dbSecurityMonitor.logDatabaseOperation(
          operation,
          tableName,
          {
            userId: this.currentUser?.id,
            ipAddress: this.clientInfo.ipAddress,
            userAgent: this.clientInfo.userAgent,
            metadata: {
              error: error instanceof Error ? error.message : 'Unknown error',
              executionTime: Date.now() - startTime,
              ...options?.metadata,
            },
          }
        );
      }

      throw error;
    }
  }

  /**
   * Secure authentication with failed login tracking
   */
  async secureSignIn(
    email: string,
    password: string,
    clientInfo?: { ipAddress?: string; userAgent?: string }
  ): Promise<{ data: any; error: any }> {
    if (clientInfo) {
      this.setClientInfo(clientInfo);
    }

    try {
      const result = await this.client.auth.signInWithPassword({
        email,
        password,
      });

      if (result.error) {
        // Track failed login attempt
        await dbSecurityMonitor.trackFailedLogin(
          email,
          this.clientInfo.ipAddress || 'unknown',
          this.clientInfo.userAgent
        );
      }

      return result;
    } catch (error) {
      // Track failed login attempt
      await dbSecurityMonitor.trackFailedLogin(
        email,
        this.clientInfo.ipAddress || 'unknown',
        this.clientInfo.userAgent
      );

      throw error;
    }
  }

  /**
   * Secure OAuth sign in with monitoring
   */
  async secureSignInWithOAuth(
    provider: 'google' | 'github' | 'facebook',
    clientInfo?: { ipAddress?: string; userAgent?: string }
  ): Promise<{ data: any; error: any }> {
    if (clientInfo) {
      this.setClientInfo(clientInfo);
    }

    try {
      const result = await this.client.auth.signInWithOAuth({
        provider,
        options: {
          redirectTo: `${window.location.origin}/auth/callback`,
        },
      });

      // OAuth redirects, so we can't track failures here
      // They would be tracked in the auth state change handler

      return result;
    } catch (error) {
      // Log OAuth failure
      await dbSecurityMonitor.logSecurityEvent({
        type: 'failed_login',
        severity: 'medium',
        description: `OAuth login failed for provider: ${provider}`,
        ipAddress: this.clientInfo.ipAddress,
        userAgent: this.clientInfo.userAgent,
        metadata: {
          provider,
          error: error instanceof Error ? error.message : 'Unknown error',
        },
      });

      throw error;
    }
  }

  /**
   * Secure sign up with monitoring
   */
  async secureSignUp(
    email: string,
    password: string,
    clientInfo?: { ipAddress?: string; userAgent?: string }
  ): Promise<{ data: any; error: any }> {
    if (clientInfo) {
      this.setClientInfo(clientInfo);
    }

    try {
      const result = await this.client.auth.signUp({
        email,
        password,
      });

      if (result.data.user && !result.error) {
        // Log successful registration
        await dbSecurityMonitor.logDataAccess(
          result.data.user.id,
          'authentication',
          'register',
          {
            ipAddress: this.clientInfo.ipAddress,
            success: true,
            metadata: {
              email,
              registrationMethod: 'email',
            },
          }
        );
      }

      return result;
    } catch (error) {
      // Log registration failure
      await dbSecurityMonitor.logSecurityEvent({
        type: 'failed_login',
        severity: 'low',
        description: `Registration failed for email: ${email}`,
        ipAddress: this.clientInfo.ipAddress,
        userAgent: this.clientInfo.userAgent,
        metadata: {
          email,
          error: error instanceof Error ? error.message : 'Unknown error',
        },
      });

      throw error;
    }
  }

  /**
   * Secure table operations with automatic monitoring
   */
  from(tableName: string) {
    const originalFrom = this.client.from(tableName);

    return {
      ...originalFrom,
      
      // Override select with security monitoring
      select: (columns?: string) => {
        const query = originalFrom.select(columns);
        const originalExecute = query.then?.bind(query) || (() => query);

        // Wrap the execution
        const secureExecute = async () => {
          return this.secureQuery('SELECT', tableName, () => originalExecute());
        };

        // Return a promise-like object that executes securely
        return Object.assign(secureExecute(), {
          eq: (column: string, value: any) => query.eq(column, value),
          neq: (column: string, value: any) => query.neq(column, value),
          gt: (column: string, value: any) => query.gt(column, value),
          gte: (column: string, value: any) => query.gte(column, value),
          lt: (column: string, value: any) => query.lt(column, value),
          lte: (column: string, value: any) => query.lte(column, value),
          like: (column: string, pattern: string) => query.like(column, pattern),
          ilike: (column: string, pattern: string) => query.ilike(column, pattern),
          is: (column: string, value: any) => query.is(column, value),
          in: (column: string, values: any[]) => query.in(column, values),
          contains: (column: string, value: any) => query.contains(column, value),
          containedBy: (column: string, value: any) => query.containedBy(column, value),
          rangeGt: (column: string, range: string) => query.rangeGt(column, range),
          rangeGte: (column: string, range: string) => query.rangeGte(column, range),
          rangeLt: (column: string, range: string) => query.rangeLt(column, range),
          rangeLte: (column: string, range: string) => query.rangeLte(column, range),
          rangeAdjacent: (column: string, range: string) => query.rangeAdjacent(column, range),
          overlaps: (column: string, value: any) => query.overlaps(column, value),
          textSearch: (column: string, query: string, config?: any) => query.textSearch(column, query, config),
          match: (query: Record<string, any>) => query.match(query),
          not: (column: string, operator: string, value: any) => query.not(column, operator, value),
          or: (filters: string) => query.or(filters),
          filter: (column: string, operator: string, value: any) => query.filter(column, operator, value),
          order: (column: string, options?: any) => query.order(column, options),
          limit: (count: number) => query.limit(count),
          range: (from: number, to: number) => query.range(from, to),
          abortSignal: (signal: AbortSignal) => query.abortSignal(signal),
          single: () => query.single(),
          maybeSingle: () => query.maybeSingle(),
          csv: () => query.csv(),
          geojson: () => query.geojson(),
          explain: (options?: any) => query.explain(options),
        });
      },

      // Override insert with security monitoring
      insert: (values: any) => {
        return this.secureQuery('INSERT', tableName, () => originalFrom.insert(values));
      },

      // Override update with security monitoring
      update: (values: any) => {
        const query = originalFrom.update(values);
        return {
          ...query,
          eq: (column: string, value: any) => {
            const filteredQuery = query.eq(column, value);
            return this.secureQuery('UPDATE', tableName, () => filteredQuery);
          },
          match: (filters: Record<string, any>) => {
            const filteredQuery = query.match(filters);
            return this.secureQuery('UPDATE', tableName, () => filteredQuery);
          },
        };
      },

      // Override delete with security monitoring
      delete: () => {
        const query = originalFrom.delete();
        return {
          ...query,
          eq: (column: string, value: any) => {
            const filteredQuery = query.eq(column, value);
            return this.secureQuery('DELETE', tableName, () => filteredQuery);
          },
          match: (filters: Record<string, any>) => {
            const filteredQuery = query.match(filters);
            return this.secureQuery('DELETE', tableName, () => filteredQuery);
          },
        };
      },

      // Override upsert with security monitoring
      upsert: (values: any, options?: any) => {
        return this.secureQuery('INSERT', tableName, () => originalFrom.upsert(values, options));
      },
    };
  }

  /**
   * Secure RPC calls with monitoring
   */
  async rpc(functionName: string, params?: any): Promise<{ data: any; error: any }> {
    return this.secureQuery('SELECT', `rpc_${functionName}`, () => 
      this.client.rpc(functionName, params)
    );
  }

  /**
   * Get auth methods with security context
   */
  get auth() {
    return {
      ...this.client.auth,
      signInWithPassword: (credentials: { email: string; password: string }) =>
        this.secureSignIn(credentials.email, credentials.password),
      signInWithOAuth: (options: { provider: 'google' | 'github' | 'facebook' }) =>
        this.secureSignInWithOAuth(options.provider),
      signUp: (credentials: { email: string; password: string }) =>
        this.secureSignUp(credentials.email, credentials.password),
    };
  }

  /**
   * Get storage methods (pass-through for now)
   */
  get storage() {
    return this.client.storage;
  }

  /**
   * Get realtime methods (pass-through for now)
   */
  get realtime() {
    return this.client.realtime;
  }

  /**
   * Generate query hash for audit logging
   */
  private generateQueryHash(queryId: string): string {
    // Simple hash function for query identification
    let hash = 0;
    for (let i = 0; i < queryId.length; i++) {
      const char = queryId.charCodeAt(i);
      hash = ((hash << 5) - hash) + char;
      hash = hash & hash; // Convert to 32-bit integer
    }
    return Math.abs(hash).toString(16);
  }

  /**
   * Check if table contains sensitive data
   */
  private isSensitiveTable(tableName: string): boolean {
    const sensitiveTables = [
      'users',
      'user_profiles',
      'analysis_results',
      'payment_methods',
      'subscriptions',
      'api_keys',
      'audit_log',
      'security_events',
    ];
    
    return sensitiveTables.includes(tableName.toLowerCase());
  }

  /**
   * Get current user context
   */
  getCurrentUser(): { id: string; email?: string } | null {
    return this.currentUser;
  }

  /**
   * Get client information
   */
  getClientInfo(): { ipAddress?: string; userAgent?: string } {
    return { ...this.clientInfo };
  }
}

// Create and export secure Supabase client instance
export const secureSupabase = new SecureSupabaseClient(
  config.database.supabaseUrl,
  config.database.supabaseAnonKey
);

// Export the class for testing or custom instances
export { SecureSupabaseClient };

// Helper function to set client info from request context
export function setSupabaseClientInfo(info: { ipAddress?: string; userAgent?: string }): void {
  secureSupabase.setClientInfo(info);
}

// Helper function to get client info
export function getSupabaseClientInfo(): { ipAddress?: string; userAgent?: string } {
  return secureSupabase.getClientInfo();
}