/**
 * Legacy Supabase Compatibility Layer
 * Provides backward compatibility for existing Supabase references
 * Routes all calls to the new AWS-based database service
 */

import { database as newDatabase, from as newFrom } from './database';
import { logger } from './logging';

const supabaseLogger = logger.child({ component: 'SupabaseCompatibility' });

// Legacy compatibility interface
export const getSupabase = async () => {
  supabaseLogger.debug('getSupabase() called - using AWS database service');
  return newDatabase;
};

// Legacy compatibility - lazy initialization
let _supabase: any = null;
export const supabase = new Proxy({} as any, {
  get(target, prop) {
    if (!_supabase) {
      supabaseLogger.debug('Lazy supabase initialization - using AWS database service');
      _supabase = newDatabase;
    }
    
    return _supabase[prop as keyof typeof _supabase];
  }
});

// Export the new database service as the main export
export default newDatabase;