import { createClient } from '@supabase/supabase-js';

const SUPABASE_URL = 'https://brgmvckpvkguxkpeqsuk.supabase.co';
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImJyZ212Y2twdmtndXhrcGVxc3VrIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODY5MzcyNzYsImV4cCI6MjEwMjUxMzI3Nn0.YG5Fo0IrFbUpjoxBlzzxS981numvQhMrrXLBRhilhIw';

export const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
  auth: {
    storageKey: 'iiee-admin-auth-token', // Changed to keep IIEE sessions isolated from PICE
    persistSession: true,
    autoRefreshToken: true,
  }
});

// Matches the IIEE UUID from your SQL insert script
export const IIEE_ORG_ID = '00000000-0000-0000-0000-000000000002';