import { createClient } from '@supabase/supabase-js'

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL as string
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY as string

export const supabaseConfigured = !!(supabaseUrl && supabaseAnonKey)

if (!supabaseConfigured) {
  console.warn('Supabase environment variables not set. Multiplayer features will be unavailable.')
}

export const supabase = createClient(
  supabaseUrl || 'https://localhost',
  supabaseAnonKey || 'missing-key'
)
