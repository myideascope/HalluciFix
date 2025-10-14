import { createClient } from '@supabase/supabase-js'
import { config } from './config'

// Initialize configuration if not already done
let supabaseClient: ReturnType<typeof createClient> | null = null;

export const getSupabase = () => {
  if (!supabaseClient) {
    supabaseClient = createClient(config.database.supabaseUrl, config.database.supabaseAnonKey);
  }
  return supabaseClient;
};

// For backward compatibility
export const supabase = getSupabase();