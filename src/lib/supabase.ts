import { createClient } from '@supabase/supabase-js'
import { logger, logUtils } from './logging';

// Initialize configuration if not already done
let supabaseClient: ReturnType<typeof createClient> | null = null;
const supabaseLogger = logger.child({ component: 'SupabaseClient' });

export const getSupabase = async () => {
  if (!supabaseClient) {
    try {
      // Dynamically import config to avoid circular dependencies
      const { config } = await import('./config');
      
      // Use async getter to ensure initialization
      const database = await config.getDatabase();
      
      supabaseClient = createClient(database.supabaseUrl, database.supabaseAnonKey);
      
      supabaseLogger.info('Supabase client initialized', {
        url: database.supabaseUrl,
        hasAnonKey: !!database.supabaseAnonKey,
      });
      
      // Add global error handler for Supabase operations
      const originalFrom = supabaseClient.from;
      supabaseClient.from = function(table: string) {
        const query = originalFrom.call(this, table);
        const originalSelect = query.select;
        const originalInsert = query.insert;
        const originalUpdate = query.update;
        const originalDelete = query.delete;
        
        // Wrap select operations with logging
        query.select = function(...args: any[]) {
          const startTime = Date.now();
          const result = originalSelect.apply(this, args);
          
          // Log the operation
          result.then((response: any) => {
            const duration = Date.now() - startTime;
            if (response.error) {
              supabaseLogger.error('Supabase select operation failed', response.error, {
                table,
                operation: 'select',
                duration,
                query: args[0] || '*',
              });
              logUtils.logError(response.error, {
                component: 'SupabaseClient',
                table,
                operation: 'select',
                duration,
              });
            } else {
              supabaseLogger.debug('Supabase select operation completed', {
                table,
                operation: 'select',
                duration,
                recordCount: response.data?.length || 0,
                query: args[0] || '*',
              });
            }
          }).catch((error: Error) => {
            const duration = Date.now() - startTime;
            supabaseLogger.error('Supabase select operation error', error, {
              table,
              operation: 'select',
              duration,
            });
          });
          
          return result;
        };
        
        // Wrap insert operations with logging
        query.insert = function(data: any) {
          const startTime = Date.now();
          const result = originalInsert.call(this, data);
          
          result.then((response: any) => {
            const duration = Date.now() - startTime;
            if (response.error) {
              supabaseLogger.error('Supabase insert operation failed', response.error, {
                table,
                operation: 'insert',
                duration,
                recordCount: Array.isArray(data) ? data.length : 1,
              });
            } else {
              supabaseLogger.info('Supabase insert operation completed', {
                table,
                operation: 'insert',
                duration,
                recordCount: Array.isArray(data) ? data.length : 1,
                insertedCount: response.data?.length || 0,
              });
            }
          }).catch((error: Error) => {
            const duration = Date.now() - startTime;
            supabaseLogger.error('Supabase insert operation error', error, {
              table,
              operation: 'insert',
              duration,
            });
          });
          
          return result;
        };
        
        return query;
      };
      
    } catch (error) {
      supabaseLogger.error('Failed to initialize Supabase client', error as Error);
      throw error;
    }
  }
  return supabaseClient;
};

// For backward compatibility - lazy initialization
let _supabase: ReturnType<typeof createClient> | null = null;
export const supabase = new Proxy({} as ReturnType<typeof createClient>, {
  get(target, prop) {
    if (!_supabase) {
      // Initialize synchronously using environment variables as fallback
      const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
      const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;
      
      if (!supabaseUrl || !supabaseAnonKey) {
        throw new Error('Supabase configuration not found. Please set VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY environment variables.');
      }
      
      _supabase = createClient(supabaseUrl, supabaseAnonKey);
    }
    
    return _supabase[prop as keyof typeof _supabase];
  }
});