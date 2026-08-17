/// <reference types="vite/client" />
import { createClient } from '@supabase/supabase-js'
import type { Database } from '../supabaseTypes'

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY

if (!supabaseUrl || !supabaseAnonKey) {
  throw new Error('Supabase URL and Anon Key are required')
}

export const supabase = createClient<Database>(supabaseUrl, supabaseAnonKey)