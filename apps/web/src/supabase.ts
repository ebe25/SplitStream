import { createClient } from '@supabase/supabase-js'

export const supabase = createClient(
  import.meta.env.VITE_SUPABASE_URL,
  import.meta.env.VITE_SUPABASE_ANON_KEY,
)

export type Profile = { id: string; display_name: string | null; upi_vpa: string | null }
export type Group = { id: string; name: string; status: string; invite_code: string }
export type Balance = { user_id: string; paid: number; share: number; net: number }
export type Debt = { from_user: string; to_user: string; amount: number }
