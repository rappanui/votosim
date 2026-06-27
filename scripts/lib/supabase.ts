import { createClient } from '@supabase/supabase-js'
import 'dotenv/config'

const SUPABASE_URL = process.env.SUPABASE_URL
const SERVICE_ROLE_KEY = process.env.SERVICE_ROLE_KEY

if (!SUPABASE_URL || !SERVICE_ROLE_KEY) {
  throw new Error('Missing SUPABASE_URL or SERVICE_ROLE_KEY in scripts/.env')
}

/**
 * Supabase admin client with service role key.
 * Bypasses RLS — use only in server-side pipeline scripts, never in frontend code.
 */
export const supabase = createClient(SUPABASE_URL, SERVICE_ROLE_KEY)
