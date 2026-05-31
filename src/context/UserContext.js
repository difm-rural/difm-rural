import React, { createContext, useContext, useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'

const UserContext = createContext({ avatarUrl: null, profile: null, refreshProfile: async () => {} })

export function UserProvider({ children }) {
  const [avatarUrl, setAvatarUrl] = useState(null)
  const [profile,   setProfile]   = useState(null)

  async function refreshProfile() {
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) { setProfile(null); setAvatarUrl(null); return }

    const { data } = await supabase
      .from('profiles')
      .select('*')
      .eq('id', user.id)
      .single()

    setProfile(data)
    setAvatarUrl(data?.avatar_url || null)
  }

  useEffect(() => {
    refreshProfile()

    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      if (session) refreshProfile()
      else { setProfile(null); setAvatarUrl(null) }
    })
    return () => subscription.unsubscribe()
  }, [])

  return (
    <UserContext.Provider value={{ avatarUrl, profile, refreshProfile }}>
      {children}
    </UserContext.Provider>
  )
}

export function useUser() {
  return useContext(UserContext)
}
