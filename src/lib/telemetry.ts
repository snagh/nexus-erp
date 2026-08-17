import { useEffect, useRef } from 'react'
import { supabase } from './supabase'

const getPageFriendlyName = (path: string) => {
  switch (path) {
    case '/dashboard': return 'Início / Dashboard'
    case '/compras': return 'Módulo de Compras'
    case '/cotacao-privado': return 'Central de Cotações'
    case '/atas': return 'Listagem de ATAs'
    case '/empenhos': return 'Listagem de Empenhos'
    case '/relatorios': return 'Painel de Relatórios'
    case '/cargas': return 'Distribuição de Cargas'
    case '/tarefas': return 'Minhas Tarefas'
    case '/cadastrar-ata': return 'Cadastro de ATA'
    case '/cadastrar-empenho': return 'Cadastro de Empenho'
    case '/baixa-nf': return 'Baixa por Nota Fiscal'
    case '/baixa-dav': return 'Baixa por Pedido (Provisória)'
    case '/perfil': return 'Meu Perfil'
    case '/oficios': return 'Gerador de Ofícios'
    case '/vendas': return 'Portal do Vendedor'
    case '/licitacoes': return 'Módulo de Licitações'
    case '/importar-catalogo': return 'Importador de Catálogo'
    case '/monitor': return 'Monitor Nexus Live'
    default: return path || 'Página Inicial'
  }
}

const detectDeviceType = () => {
  const ua = navigator.userAgent
  if (/(tablet|ipad|playbook|silk)|(android(?!.*mobi))/i.test(ua)) {
    return 'tablet'
  }
  if (/Mobile|iP(hone|od)|Android|BlackBerry|IEMobile|Kindle|Silk-Accelerated|(hpw|web)OS|Opera M(obi|ini)/.test(ua)) {
    return 'mobile'
  }
  return 'desktop'
}

export function useTelemetry(user: any, profile: any, pathname: string, tabId: string) {
  const currentLogIdRef = useRef<string | null>(null)
  const entryTimeRef = useRef<number>(0)
  const accessTokenRef = useRef<string | null>(null)

  // Sincroniza o token de acesso em tempo real para as requisições de finalizeLog
  useEffect(() => {
    if (!user) return
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      accessTokenRef.current = session?.access_token || null
    })
    
    supabase.auth.getSession().then(({ data }) => {
      if (data?.session?.access_token) {
        accessTokenRef.current = data.session.access_token
      }
    })

    return () => {
      subscription.unsubscribe()
    }
  }, [user])

  // Function to finalize the current page log with duration
  const finalizeLog = (logId: string, entryTime: number) => {
    if (!logId || !entryTime) return
    const now = Date.now()
    const durationSeconds = Math.max(1, Math.round((now - entryTime) / 1000))
    const loggedOutAt = new Date().toISOString()

    // Using window.fetch with keepalive: true to survive tab/window closure
    const supabaseUrl = import.meta.env.VITE_SUPABASE_URL
    const supabaseKey = import.meta.env.VITE_SUPABASE_ANON_KEY

    if (supabaseUrl && supabaseKey) {
      const url = `${supabaseUrl}/rest/v1/usage_logs?id=eq.${logId}`
      
      let token = accessTokenRef.current
      if (!token) {
        // Fallback bearer header extraction from localStorage
        const sessionStr = localStorage.getItem(`sb-${new URL(supabaseUrl).hostname.split('.')[0]}-auth-token`) || 
                           localStorage.getItem('supabase.auth.token')
        if (sessionStr) {
          try {
            const parsed = JSON.parse(sessionStr)
            token = parsed?.currentSession?.access_token || parsed?.access_token || null
          } catch (e) {
            console.error('Error parsing token for telemetry keepalive:', e)
          }
        }
      }

      const headers: HeadersInit = {
        'apikey': supabaseKey,
        'Authorization': `Bearer ${token || ''}`,
        'Content-Type': 'application/json',
        'Prefer': 'return=minimal'
      }

      fetch(url, {
        method: 'PATCH',
        headers,
        body: JSON.stringify({
          duration_seconds: durationSeconds,
          logged_out_at: loggedOutAt
        }),
        keepalive: true
      }).catch(err => {
        console.error('Failed to update telemetry via keepalive fetch:', err)
      })
    }
  }

  useEffect(() => {
    if (!user || !profile) return

    // Debounce track registration to avoid micro-navigation spam
    const timer = setTimeout(async () => {
      const now = Date.now()
      const prevLogId = currentLogIdRef.current
      const prevEntryTime = entryTimeRef.current

      // Finalize previous log if it existed
      if (prevLogId && prevEntryTime) {
        finalizeLog(prevLogId, prevEntryTime)
      }

      // Register new page log
      const pageFriendly = getPageFriendlyName(pathname)
      const deviceType = detectDeviceType()
      const nowObj = new Date()

      try {
        const { data, error } = await (supabase as any)
          .from('usage_logs')
          .insert([{
            user_id: user.id,
            display_name: profile.display_name || user.email?.split('@')[0].toUpperCase() || 'USUÁRIO',
            nivel: profile.nivel || 'USER',
            setor: profile.setor || 'GERAL',
            page: pathname,
            page_friendly: pageFriendly,
            session_id: tabId,
            logged_at: nowObj.toISOString(),
            device_type: deviceType,
            day_of_week: nowObj.getDay(),
            hour_of_day: nowObj.getHours()
          }])
          .select('id')
          .single()

        if (error) {
          console.warn('Telemetry error inserting log:', error)
          currentLogIdRef.current = null
          entryTimeRef.current = 0
        } else if (data) {
          currentLogIdRef.current = data.id as string
          entryTimeRef.current = now
        }
      } catch (err) {
        console.error('Telemetry error:', err)
      }
    }, 1500) // 1.5 seconds debounce

    return () => {
      clearTimeout(timer)
    }
  }, [user, profile, pathname, tabId])

  // Finalize on page unload
  useEffect(() => {
    const handleUnload = () => {
      if (currentLogIdRef.current && entryTimeRef.current) {
        finalizeLog(currentLogIdRef.current, entryTimeRef.current)
      }
    }

    window.addEventListener('beforeunload', handleUnload)
    window.addEventListener('visibilitychange', () => {
      if (document.visibilityState === 'hidden') {
        handleUnload()
      }
    })

    return () => {
      window.removeEventListener('beforeunload', handleUnload)
    }
  }, [])
}
