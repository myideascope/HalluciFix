import { createClient } from '@supabase/supabase-js'

// Initialize configuration if not already done
let supabaseClient: ReturnType<typeof createClient> | null = null;

export const getSupabase = async () => {
  if (!supabaseClient) {
    // Dynamically import config to avoid circular dependencies
    const { config } = await import('./config');
    
    // Use async getter to ensure initialization
    const database = await config.getDatabase();
    
    supabaseClient = createClient(database.supabaseUrl, database.supabaseAnonKey);
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