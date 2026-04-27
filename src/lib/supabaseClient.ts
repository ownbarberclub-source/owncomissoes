import { createClient } from '@supabase/supabase-js';

// Hardcoded para evitar erro caso as variáveis no painel do Vercel estejam com caracteres inválidos (espaços extras, etc)
const supabaseUrl = 'https://tvjbtlsxibcpahpizksd.supabase.co';
const supabaseAnonKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InR2amJ0bHN4aWJjcGFocGl6a3NkIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzY3NjQ1NTgsImV4cCI6MjA5MjM0MDU1OH0.8QaQgTRnxknyjj9uoTOZdc46Tr1Rv0eXwSyShZnh90M';

export const supabase = createClient(supabaseUrl, supabaseAnonKey);
