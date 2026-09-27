import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react'
import type { Session, User } from '@supabase/supabase-js'
import { initExtensionBridge, signOutExtension, syncExtensionSession } from '../lib/extensionBridge'
import { isSupabaseConfigured, supabase } from '../lib/supabase'

interface AuthContextValue {
  user: User | null
  session: Session | null
  loading: boolean
  demoMode: boolean
  signIn: (email: string, password: string) => Promise<void>
  signUp: (email: string, password: string) => Promise<void>
  signOut: () => Promise<void>
  continueAsDemo: () => void
}

const AuthContext = createContext<AuthContextValue | null>(null)

const DEMO_USER = {
  id: 'demo-user',
  email: 'demo@cvspecs.app',
} as User

export function AuthProvider({ children }: { children: ReactNode }): ReactNode {
  const [user, setUser] = useState<User | null>(null)
  const [session, setSession] = useState<Session | null>(null)
  const [loading, setLoading] = useState(true)
  const [demoMode, setDemoMode] = useState(
    () => localStorage.getItem('cvspecs_demo') === '1' || !isSupabaseConfigured,
  )

  useEffect(() => {
    if (!supabase || demoMode) {
      if (demoMode) {
        setUser(DEMO_USER)
        setSession(null)
      }
      setLoading(false)
      return
    }

    let mounted = true
    const stopBridge = initExtensionBridge()

    supabase.auth.getSession().then(({ data }) => {
      if (!mounted) return
      setSession(data.session)
      setUser(data.session?.user ?? null)
      setLoading(false)
      syncExtensionSession(data.session)
    })

    const { data: subscription } = supabase.auth.onAuthStateChange((_event, next) => {
      setSession(next)
      setUser(next?.user ?? null)
      setLoading(false)
      syncExtensionSession(next)
    })

    return () => {
      mounted = false
      stopBridge()
      subscription.subscription.unsubscribe()
    }
  }, [demoMode])

  const signIn = useCallback(async (email: string, password: string) => {
    if (!supabase) {
      localStorage.setItem('cvspecs_demo', '1')
      setDemoMode(true)
      setUser(DEMO_USER)
      return
    }
    const { error } = await supabase.auth.signInWithPassword({ email, password })
    if (error) throw error
    localStorage.removeItem('cvspecs_demo')
    setDemoMode(false)
  }, [])

  const signUp = useCallback(async (email: string, password: string) => {
    if (!supabase) {
      localStorage.setItem('cvspecs_demo', '1')
      setDemoMode(true)
      setUser(DEMO_USER)
      return
    }
    const { error } = await supabase.auth.signUp({ email, password })
    if (error) throw error
    localStorage.removeItem('cvspecs_demo')
    setDemoMode(false)
  }, [])

  const signOut = useCallback(async () => {
    localStorage.removeItem('cvspecs_demo')
    setDemoMode(false)
    setUser(null)
    setSession(null)
    if (supabase) {
      signOutExtension()
      await supabase.auth.signOut()
    }
  }, [])

  const continueAsDemo = useCallback(() => {
    localStorage.setItem('cvspecs_demo', '1')
    setDemoMode(true)
    setUser(DEMO_USER)
    setSession(null)
  }, [])

  const value = useMemo(
    () => ({
      user,
      session,
      loading,
      demoMode: demoMode || !isSupabaseConfigured,
      signIn,
      signUp,
      signOut,
      continueAsDemo,
    }),
    [user, session, loading, demoMode, signIn, signUp, signOut, continueAsDemo],
  )

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext)
  if (!ctx) throw new Error('useAuth must be used within AuthProvider')
  return ctx
}
