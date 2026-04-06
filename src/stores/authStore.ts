import { create } from 'zustand'
import type { User, Session } from '@supabase/supabase-js'
import { supabase } from '../lib/supabase'

interface AuthStore {
  user: User | null
  session: Session | null
  loading: boolean
  username: string | null

  initialize: () => Promise<void>
  signIn: (email: string, password: string) => Promise<string | null>
  signUp: (email: string, password: string, username: string) => Promise<string | null>
  signOut: () => Promise<void>
}

export const useAuthStore = create<AuthStore>((set) => ({
  user: null,
  session: null,
  loading: true,
  username: null,

  initialize: async () => {
    const { data } = await supabase.auth.getSession()
    const session = data.session
    const user = session?.user ?? null

    let username: string | null = null
    if (user) {
      const { data: profile } = await supabase
        .from('profiles')
        .select('username')
        .eq('id', user.id)
        .single()
      username = profile?.username ?? null
    }

    set({ user, session, loading: false, username })

    // Listen for auth changes
    supabase.auth.onAuthStateChange((_event, session) => {
      set({ user: session?.user ?? null, session })
    })
  },

  signIn: async (email, password) => {
    const { error } = await supabase.auth.signInWithPassword({ email, password })
    if (error) return error.message

    const { data } = await supabase.auth.getSession()
    const user = data.session?.user ?? null

    let username: string | null = null
    if (user) {
      const { data: profile } = await supabase
        .from('profiles')
        .select('username')
        .eq('id', user.id)
        .single()
      username = profile?.username ?? null
    }

    set({ user, session: data.session, username })
    return null
  },

  signUp: async (email, password, username) => {
    const { data, error } = await supabase.auth.signUp({ email, password })
    if (error) return error.message
    if (!data.user) return 'Registration failed'

    // Create profile
    const { error: profileError } = await supabase
      .from('profiles')
      .insert({ id: data.user.id, username })

    if (profileError) return profileError.message

    set({ user: data.user, session: data.session, username })
    return null
  },

  signOut: async () => {
    await supabase.auth.signOut()
    set({ user: null, session: null, username: null })
  },
}))
