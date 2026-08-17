import { createContext, useContext, useEffect, useState, useCallback, useMemo, type ReactNode } from 'react'
import type { Session, User } from '@supabase/supabase-js'
import { supabase } from './lib/supabase'
import { canDistributeLoads, canManageUsers, canViewAuditLogs, canCreateRecords } from './lib/permissions'

export interface UserProfile {
    id: string
    email: string | null
    display_name: string | null
    role: 'admin' | 'user'
    setor: 'COMPRAS' | 'VENDAS' | 'EMPENHOS' | 'DIRECAO' | 'LOGISTICA' | 'LICIT' | 'VENDAS_PRIVADO' | 'RECEBIMENTO' | 'FINANCEIRO'
    nivel: 'OP' | 'ADM' | 'DEV' | 'SUP'
    nome: string | null
    sobrenome: string | null
    cpf: string | null
    name_change_count?: number
    last_password_change?: string | null
    email_confirmed_at?: string | null
    cargo_id?: number | null
    cargo?: {
        id: number
        nome: string
        permissoes: any
    } | null
    status_aprovacao?: 'PENDENTE' | 'APROVADO' | 'RECUSADO' | null
    tarefa_padrao?: string | null
}

interface AuthContextType {
  session: Session | null
  user: User | null
  profile: UserProfile | null
  isAdmin: boolean
  isOP: boolean
  isSUP: boolean
  isSuperAdmin: boolean
  canDistribute: boolean
  canAccessAdmin: boolean
  canViewLogs: boolean
  canCreate: boolean
  setor: string | null
  loading: boolean
  realProfile: UserProfile | null
  impersonation: { nivel: 'OP' | 'ADM' | 'DEV' | 'SUP' | null; setor: string | null } | null
  setImpersonation: (val: any) => void
  signOut: () => Promise<void>
  signOutAll: () => Promise<void>
  refreshProfile: () => Promise<void>
}

const AuthContext = createContext<AuthContextType>({ 
    session: null, 
    user: null, 
    profile: null, 
    realProfile: null,
    impersonation: null,
    setImpersonation: () => {},
    isAdmin: false, 
    isOP: false,
    isSUP: false,
    isSuperAdmin: false,
    canDistribute: false,
    canAccessAdmin: false,
    canViewLogs: false,
    canCreate: false,
    setor: null,
    loading: true,
    signOut: async () => {},
    signOutAll: async () => {},
    refreshProfile: async () => {} 
})

export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null)
  const [profile, setProfile] = useState<UserProfile | null>(null)
  const [loading, setLoading] = useState(true)
  const [impersonation, setImpersonation] = useState<{
    nivel: 'OP' | 'ADM' | 'DEV' | 'SUP' | null;
    setor: string | null;
  } | null>(null)

  const fetchProfile = useCallback(async (userId: string) => {
    try {
      const { data: profileRaw, error: profileErr } = await supabase
        .from('profiles')
        .select('*')
        .eq('id', userId)
        .single()
      
      if (profileErr) throw profileErr
      
      let fetchedProfile = profileRaw as any as UserProfile

      // Se tiver cargo_id, busca o cargo separadamente (contornando falta de FK no select)
      if (fetchedProfile.cargo_id) {
          const { data: cargoRaw } = await supabase
            .from('cargos_permissoes')
            .select('*')
            .eq('id', fetchedProfile.cargo_id)
            .single()
          
          if (cargoRaw) {
              fetchedProfile.cargo = cargoRaw as any
          }
      }

      setProfile(fetchedProfile)
      
      // --- VALIDAÇÃO DE SESSÃO (TROCA DE SENHA) ---
      const { data: { session: currentSession } } = await supabase.auth.getSession()
      if (currentSession && fetchedProfile.last_password_change) {
          const lastChange = new Date(fetchedProfile.last_password_change).getTime()
          const sessionStart = new Date(currentSession.user.last_sign_in_at!).getTime()
          
          if (lastChange > sessionStart + 10000) {
              console.warn('Sessão inválida: Senha alterada recentemente. Deslogando...')
              await supabase.auth.signOut()
              window.location.href = '/login'
              return
          }
      }
    } catch (err) {
      console.warn('Erro ao buscar perfil:', err)
      setProfile({ 
        id: userId, 
        email: '', 
        display_name: '', 
        role: 'user',
        setor: 'EMPENHOS',
        nivel: 'OP',
        nome: '',
        sobrenome: '',
        cpf: '',
        status_aprovacao: 'APROVADO'
      }) 
    }
  }, [])

  useEffect(() => {
    let mounted = true

    async function initializeAuth() {
      try {
        const { data: { session: initialSession } } = await supabase.auth.getSession()
        if (!mounted) return

        if (initialSession) {
          setSession(initialSession)
          // Executado de forma assíncrona (não-bloqueante no carregamento de auth)
          fetchProfile(initialSession.user.id)
        }
      } catch (err) {
        console.error('Auth initialization error:', err)
      } finally {
        if (mounted) setLoading(false)
      }
    }

    initializeAuth()

    const { data: { subscription } } = supabase.auth.onAuthStateChange(async (event, currentSession) => {
      if (!mounted) return

      // INITIAL_SESSION já é tratado por initializeAuth() acima
      if (event === 'INITIAL_SESSION') return

      setSession(currentSession)
      if (currentSession?.user) {
        fetchProfile(currentSession.user.id)
      } else {
        setProfile(null)
      }
    })

    return () => {
      mounted = false
      subscription.unsubscribe()
    }
  }, [fetchProfile])

  // Efeito dedicado para o canal realtime do perfil do usuário logado.
  useEffect(() => {
    const userId = session?.user?.id
    if (!userId) return

    const profileChannel = supabase
      .channel(`profile-realtime-${userId}`)
      .on(
        'postgres_changes',
        {
          event: 'UPDATE',
          schema: 'public',
          table: 'profiles',
          filter: `id=eq.${userId}`
        },
        (payload) => {
          console.log('Perfil atualizado em tempo real:', payload.new)
          fetchProfile(userId)
        }
      )
      .subscribe()

    return () => {
      supabase.removeChannel(profileChannel)
    }
  }, [session?.user?.id, fetchProfile])

  const signOut = async () => {
    await supabase.auth.signOut()
    setSession(null)
    setProfile(null)
  }

  const signOutAll = async () => {
    await supabase.auth.signOut({ scope: 'global' })
    setSession(null)
    setProfile(null)
  }

  const userId = session?.user?.id
  const refreshProfile = useCallback(async () => {
      if (userId) await fetchProfile(userId)
  }, [userId, fetchProfile])

  const userEmail = session?.user?.email
  const isSuperAdmin = userEmail === 'andrews.cs16@gmail.com'
  const realIsAdmin = isSuperAdmin || profile?.nivel === 'ADM' || profile?.nivel === 'DEV' || profile?.nivel === 'SUP'

  const activeProfile = useMemo(() => {
    if (!profile) return null
    const base = { ...profile }
    if (isSuperAdmin) {
      base.nivel = profile.nivel || 'DEV'
      base.setor = profile.setor || 'DIRECAO'
    }
    if (impersonation && realIsAdmin) {
      if (impersonation.nivel) base.nivel = impersonation.nivel
      if (impersonation.setor) base.setor = impersonation.setor as any
    }
    return base
  }, [profile, isSuperAdmin, impersonation, realIsAdmin])

  const activeIsAdmin = isSuperAdmin || activeProfile?.nivel === 'ADM' || activeProfile?.nivel === 'DEV' || activeProfile?.nivel === 'SUP'
  const activeIsOP = activeProfile?.nivel === 'OP' && !isSuperAdmin
  const activeIsSUP = activeProfile?.nivel === 'SUP' && !isSuperAdmin

  return (
    <AuthContext.Provider value={{ 
        session, 
        user: session?.user ?? null, 
        profile: activeProfile,
        realProfile: profile,
        impersonation,
        setImpersonation,
        isAdmin: activeIsAdmin,
        isOP: activeIsOP,
        isSUP: activeIsSUP,
        isSuperAdmin,
        canDistribute: canDistributeLoads(activeProfile, isSuperAdmin),
        canAccessAdmin: canManageUsers(activeProfile, isSuperAdmin),
        canViewLogs: canViewAuditLogs(activeProfile, isSuperAdmin),
        canCreate: canCreateRecords(activeProfile, isSuperAdmin),
        setor: isSuperAdmin ? 'DIRECAO' : (activeProfile?.setor ?? null),
        loading,
        signOut,
        signOutAll,
        refreshProfile
    }}>
      {children}
    </AuthContext.Provider>
  )
}

// eslint-disable-next-line react-refresh/only-export-components
export const useAuth = () => useContext(AuthContext)