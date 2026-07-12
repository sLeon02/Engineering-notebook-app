import { createClient } from '@supabase/supabase-js';

const supabaseUrl = 'https://htzmzriuifmcttfamwdj.supabase.co';
const supabaseAnonKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imh0em16cml1aWZtY3R0ZmFtd2RqIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODM4ODI0NDMsImV4cCI6MjA5OTQ1ODQ0M30.e1m7TaDjJKaqzoT2Jy4QSgFSsqBv3-2fSFX24U-k3lI';

if (!supabaseUrl || !supabaseAnonKey) {
  console.warn(
    'Supabase env vars are missing. Add NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_ANON_KEY to .env.local'
  );
}

export const supabase = createClient(supabaseUrl, supabaseAnonKey);
