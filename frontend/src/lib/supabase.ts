import { createClient } from '@supabase/supabase-js';

const supabaseUrl = 'https://ubnpsaanghtgriluemqg.supabase.co';
const supabaseAnonKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InVibnBzYWFuZ2h0Z3JpbHVlbXFnIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzkyNTkzOTMsImV4cCI6MjA5NDgzNTM5M30.oWPMOde2Aez4fgQle5ND0rxjfKoDOORN9gP2ERhfWSw';

export const supabase = createClient(supabaseUrl, supabaseAnonKey);

export const SUPABASE_URL = supabaseUrl;
export const SUPABASE_ANON_KEY = supabaseAnonKey;