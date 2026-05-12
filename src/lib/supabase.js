import AsyncStorage from '@react-native-async-storage/async-storage'
import { createClient } from '@supabase/supabase-js'
import 'react-native-url-polyfill/auto'

const supabaseUrl = 'https://opagkgfxmjqmnvhrcris.supabase.co'
const supabaseAnonKey = 'sb_publishable_Gz5PRvktub4RA5QsIN7n1w_4VGzkLri'

export const supabase = createClient(supabaseUrl, supabaseAnonKey, {
  auth: {
    storage: AsyncStorage,
    autoRefreshToken: true,
    persistSession: true,
    detectSessionInUrl: false,
  },
})