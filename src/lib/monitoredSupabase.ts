import { SupabaseClient } from '@supabase/supabase-js';
import { supabase } from './supabase';
import { dbPerformanceMonitor } from './databasePerformanceMonitor';

/**
 * Monitored Supabase client that wraps all queries with performance tracking
 */
class MonitoredSupabaseClient {
  private client: SupabaseClient;

  constructor(client: SupabaseClient) {
    this.client = client;
  }

  /**
   * Wrap table operations with monitoring
   */
  from(table: string) {
    const originalFrom = this.client.from(table);
    
    return {
      // SELECT operations
      select: (columns?: string, options?: any) => {
        const query = originalFrom.select(columns, options);
        return this.wrapQueryBuilder(query, `${table}.select`);
      },

      // INSERT operations
      insert: (values: any, options?: any) => {
        return dbPerformanceMonitor.wrapSupabaseQuery(
          `${table}.insert`,
          () => originalFrom.insert(values, options)
        );
      },

      // UPDATE operations
      update: (values: any, options?: any) => {
        const query = originalFrom.update(values, options);
        return this.wrapQueryBuilder(query, `${table}.update`);
      },

      // UPSERT operations
      upsert: (values: any, options?: any) => {
        return dbPerformanceMonitor.wrapSupabaseQuery(
          `${table}.upsert`,
          () => originalFrom.upsert(values, options)
        );
      },

      // DELETE operations
      delete: (options?: any) => {
        const query = originalFrom.delete(options);
        return this.wrapQueryBuilder(query, `${table}.delete`);
      }
    };
  }

  /**
   * Wrap RPC calls with monitoring
   */
  rpc(fn: string, args?: any, options?: any) {
    return dbPerformanceMonitor.wrapSupabaseQuery(
      `rpc.${fn}`,
      () => this.client.rpc(fn, args, options)
    );
  }

  /**
   * Wrap auth operations with monitoring
   */
  get auth() {
    const originalAuth = this.client.auth;
    
    return {
      ...originalAuth,
      
      signInWithPassword: (credentials: any) => {
        return dbPerformanceMonitor.wrapSupabaseQuery(
          'auth.signInWithPassword',
          () => originalAuth.signInWithPassword(credentials)
        );
      },

      signUp: (credentials: any) => {
        return dbPerformanceMonitor.wrapSupabaseQuery(
          'auth.signUp',
          () => originalAuth.signUp(credentials)
        );
      },

      signOut: () => {
        return dbPerformanceMonitor.wrapSupabaseQuery(
          'auth.signOut',
          () => originalAuth.signOut()
        );
      },

      getSession: () => {
        return dbPerformanceMonitor.wrapSupabaseQuery(
          'auth.getSession',
          () => originalAuth.getSession()
        );
      },

      getUser: () => {
        return dbPerformanceMonitor.wrapSupabaseQuery(
          'auth.getUser',
          () => originalAuth.getUser()
        );
      }
    };
  }

  /**
   * Wrap storage operations with monitoring
   */
  get storage() {
    const originalStorage = this.client.storage;
    
    return {
      ...originalStorage,
      
      from: (bucketId: string) => {
        const bucket = originalStorage.from(bucketId);
        
        return {
          ...bucket,
          
          upload: (path: string, file: any, options?: any) => {
            return dbPerformanceMonitor.wrapSupabaseQuery(
              `storage.${bucketId}.upload`,
              () => bucket.upload(path, file, options)
            );
          },

          download: (path: string) => {
            return dbPerformanceMonitor.wrapSupabaseQuery(
              `storage.${bucketId}.download`,
              () => bucket.download(path)
            );
          },

          list: (path?: string, options?: any) => {
            return dbPerformanceMonitor.wrapSupabaseQuery(
              `storage.${bucketId}.list`,
              () => bucket.list(path, options)
            );
          },

          remove: (paths: string[]) => {
            return dbPerformanceMonitor.wrapSupabaseQuery(
              `storage.${bucketId}.remove`,
              () => bucket.remove(paths)
            );
          }
        };
      }
    };
  }

  /**
   * Wrap query builder with monitoring for chained operations
   */
  private wrapQueryBuilder(queryBuilder: any, operationName: string) {
    const wrappedBuilder = { ...queryBuilder };

    // Wrap filter methods
    const filterMethods = [
      'eq', 'neq', 'gt', 'gte', 'lt', 'lte', 'like', 'ilike', 'is', 'in', 'contains',
      'containedBy', 'rangeGt', 'rangeGte', 'rangeLt', 'rangeLte', 'rangeAdjacent',
      'overlaps', 'textSearch', 'match', 'not', 'or', 'filter'
    ];

    filterMethods.forEach(method => {
      if (queryBuilder[method]) {
        wrappedBuilder[method] = (...args: any[]) => {
          const result = queryBuilder[method](...args);
          return this.wrapQueryBuilder(result, operationName);
        };
      }
    });

    // Wrap ordering and limiting methods
    const modifierMethods = ['order', 'limit', 'range', 'single', 'maybeSingle'];
    
    modifierMethods.forEach(method => {
      if (queryBuilder[method]) {
        wrappedBuilder[method] = (...args: any[]) => {
          const result = queryBuilder[method](...args);
          return this.wrapQueryBuilder(result, operationName);
        };
      }
    });

    // Wrap execution methods with monitoring
    if (queryBuilder.then) {
      wrappedBuilder.then = (onFulfilled?: any, onRejected?: any) => {
        return dbPerformanceMonitor.wrapSupabaseQuery(
          operationName,
          () => queryBuilder
        ).then(onFulfilled, onRejected);
      };
    }

    return wrappedBuilder;
  }

  /**
   * Get original client for operations that don't need monitoring
   */
  getOriginalClient(): SupabaseClient {
    return this.client;
  }

  /**
   * Get performance metrics
   */
  getPerformanceMetrics() {
    return dbPerformanceMonitor.getPerformanceReport();
  }

  /**
   * Perform health check
   */
  async performHealthCheck() {
    return await dbPerformanceMonitor.performHealthCheck();
  }

  /**
   * Subscribe to performance alerts
   */
  onPerformanceAlert(callback: (alert: any) => void) {
    return dbPerformanceMonitor.onAlert(callback);
  }
}

// Create monitored instance
export const monitoredSupabase = new MonitoredSupabaseClient(supabase);

// Export for backward compatibility
export { supabase as originalSupabase };
export default monitoredSupabase;