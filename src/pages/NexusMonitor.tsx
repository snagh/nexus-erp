import { useState, useMemo } from 'react'
import { useAuth } from '../AuthContext'
import { useOutletContext } from 'react-router-dom'
import { toast } from 'sonner'
import { 
  Activity, 
  Users, 
  Terminal, 
  AlertTriangle,
  RefreshCw,
  Volume2
} from 'lucide-react'
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from '../components/ui/card'
import { Button } from '../components/ui/button'
import { Badge } from '../components/ui/badge'
import { NexusAnalytics } from './NexusAnalytics'

interface OnlineUser {
  user_id: string
  tab_id?: string
  display_name: string
  current_page: string
  nivel: string
  setor: string
  online_at: string
}

const SOUNDS = [
  { name: '🍺 Abrindo Latinha', url: '/sound/abrindo-latinha.mp3' },
  { name: '😈 Risada Maléfica', url: '/sound/risada.mp3' },
  { name: '😈 Risada Maléfica 2', url: '/sound/risada2.mp3' },
  { name: '🚪 Batida de Porta Troll', url: '/sound/batida-de-porta-troll.mp3' },
  { name: '☀️ Bom Dia', url: '/sound/bom-diaaaaaaaaaaaaaaaa.mp3' },
  { name: '✊ Toc Toc na Porta', url: '/sound/universfield-door-knock-291150.mp3' },
  { name: '⚡ Glitch', url: '/sound/glitch.mp3' },
  { name: '🟢 Zap Zap Estourado', url: '/sound/som-do-zap-zap-estourado.mp3' }
]

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

export function NexusMonitor() {
  const { user, profile } = useAuth()
  
  // Consume real-time presence list and triggers from DashboardLayout context
  const { onlineUsers, triggerJumpscareFromMonitor, reloadUserFromMonitor } = useOutletContext<{
    onlineUsers: OnlineUser[]
    triggerJumpscareFromMonitor: (targetUserId: string, message: string, soundUrl: string, onlySound: boolean) => Promise<void>
    reloadUserFromMonitor: (targetUserId: string) => Promise<void>
  }>()

  const [selectedSounds, setSelectedSounds] = useState<Record<string, string>>({})
  const [scaringUserId, setScaringUserId] = useState<string | null>(null)
  const [reloadingUserId, setReloadingUserId] = useState<string | null>(null)
  const [activeTab, setActiveTab] = useState<'live' | 'analytics'>('live')

  const isDev = profile?.nivel === 'DEV'

  const triggerJumpscare = async (targetUserId: string, targetTabId: string, targetName: string) => {
    if (!triggerJumpscareFromMonitor) {
      toast.error('Canal de comunicação inativo.')
      return
    }

    const slotKey = targetTabId || targetUserId
    setScaringUserId(slotKey)
    const soundUrl = selectedSounds[slotKey] || SOUNDS[0].url
    const message = ''
    const onlySound = true

    try {
      await triggerJumpscareFromMonitor(targetUserId, message, soundUrl, onlySound)
      toast.success(`Alerta sonoro enviado com sucesso para ${targetName}!`)
    } catch (err: any) {
      toast.error('Erro ao enviar alerta sonoro: ' + err.message)
    } finally {
      setScaringUserId(null)
    }
  }

  const handleReloadUser = async (targetUserId: string, targetName: string) => {
    if (!reloadUserFromMonitor) return
    setReloadingUserId(targetUserId)
    try {
      await reloadUserFromMonitor(targetUserId)
      toast.success(`Página recarregada para ${targetName}! (todas as abas)`)
    } catch (err: any) {
      toast.error('Erro ao recarregar: ' + err.message)
    } finally {
      // Keep spinner briefly so user sees feedback
      setTimeout(() => setReloadingUserId(null), 1500)
    }
  }

  // Unauthorized screen
  if (!isDev) {
    return (
      <div className="h-[75vh] flex flex-col items-center justify-center text-center space-y-4 animate-in fade-in duration-500">
        <div className="w-20 h-20 bg-red-100 dark:bg-red-950/30 rounded-full flex items-center justify-center shadow-inner border border-red-200 dark:border-red-900/30">
          <AlertTriangle className="w-10 h-10 text-red-550 dark:text-red-500 animate-pulse" />
        </div>
        <div className="space-y-2">
          <h2 className="text-2xl font-black text-zinc-900 dark:text-zinc-100 uppercase tracking-tighter">Acesso Restrito</h2>
          <p className="text-zinc-500 dark:text-zinc-400 max-w-sm text-sm">
            Esta área é exclusiva para a <strong>Supervisão de Desenvolvimento (DEV)</strong> do Nexus.
          </p>
        </div>
      </div>
    )
  }

  const safeOnlineUsers = onlineUsers || []

  // Unique user count (different user IDs)
  const uniqueUserCount = new Set(safeOnlineUsers.map(u => u.user_id)).size

  // Page distribution stats
  const pageStats = safeOnlineUsers.reduce((acc, curr) => {
    const pageName = getPageFriendlyName(curr.current_page)
    acc[pageName] = (acc[pageName] || 0) + 1
    return acc
  }, {} as Record<string, number>)

  const mostActivePage = Object.entries(pageStats).reduce(
    (max, curr) => (curr[1] > max[1] ? curr : max),
    ['Nenhuma', 0]
  )[0]

  // Group online presence entries by user_id for a 100% stable, non-shuffling UI
  const groupedOnlineUsers = useMemo(() => {
    const map = new Map<string, {
      user_id: string
      display_name: string
      nivel: string
      setor: string
      sessions: OnlineUser[]
      primaryPage: string
    }>()

    safeOnlineUsers.forEach(u => {
      if (!u.user_id) return
      const existing = map.get(u.user_id)
      if (existing) {
        existing.sessions.push(u)
        existing.primaryPage = u.current_page
      } else {
        map.set(u.user_id, {
          user_id: u.user_id,
          display_name: u.display_name || 'Usuário',
          nivel: u.nivel || 'USER',
          setor: u.setor || 'GERAL',
          sessions: [u],
          primaryPage: u.current_page
        })
      }
    })

    // Strict deterministic sorting by display_name (A-Z) and user_id tie-breaker
    return Array.from(map.values()).sort((a, b) => {
      const nameCompare = (a.display_name || '').localeCompare(b.display_name || '', undefined, { sensitivity: 'base' })
      if (nameCompare !== 0) return nameCompare
      return (a.user_id || '').localeCompare(b.user_id || '')
    })
  }, [safeOnlineUsers])

  return (
    <div className="space-y-6 max-w-7xl mx-auto pb-12">
      
      {/* Header section with live radar (Theme-responsive) */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 bg-white dark:bg-zinc-950 border border-zinc-200 dark:border-zinc-900 rounded-3xl p-6 shadow-md dark:shadow-xl transition-colors duration-200">
        <div className="space-y-1">
          <div className="flex items-center gap-2.5">
            <span className="relative flex h-3 w-3">
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-red-400 opacity-75"></span>
              <span className="relative inline-flex rounded-full h-3 w-3 bg-red-500"></span>
            </span>
            <h1 className="text-2xl font-black text-zinc-900 dark:text-white uppercase tracking-tight">Monitor Nexus Realtime</h1>
          </div>
          <p className="text-xs text-zinc-500 dark:text-zinc-400 font-semibold uppercase tracking-wider">
            Supervisão e monitoramento de presença ativa de colaboradores em tempo real.
          </p>
        </div>
        <div className="flex items-center gap-3">
          <Badge variant="outline" className="h-8 px-3 border-zinc-200 dark:border-zinc-800 bg-zinc-100 dark:bg-zinc-900 text-red-600 dark:text-red-500 font-bold uppercase tracking-wider gap-1.5 flex items-center shrink-0 select-none">
            <Terminal className="w-3.5 h-3.5" />
            Nível DEV Ativo
          </Badge>
        </div>
      </div>

      {/* Tab Selector */}
      <div className="flex bg-zinc-100 dark:bg-zinc-900/60 p-1 border border-zinc-200 dark:border-zinc-800/80 rounded-2xl w-fit gap-1 select-none">
        <button
          onClick={() => setActiveTab('live')}
          className={`px-4 py-1.5 text-[10px] font-black uppercase rounded-xl transition-all cursor-pointer ${
            activeTab === 'live'
              ? 'bg-white dark:bg-zinc-950 text-brand-accent shadow-sm'
              : 'text-zinc-500 hover:text-zinc-950 dark:hover:text-white'
          }`}
        >
          Sessões ao Vivo
        </button>
        <button
          onClick={() => setActiveTab('analytics')}
          className={`px-4 py-1.5 text-[10px] font-black uppercase rounded-xl transition-all cursor-pointer ${
            activeTab === 'analytics'
              ? 'bg-white dark:bg-zinc-950 text-brand-accent shadow-sm'
              : 'text-zinc-500 hover:text-zinc-955 dark:hover:text-white'
          }`}
        >
          Analytics & Telemetria
        </button>
      </div>

      {activeTab === 'live' ? (
        <>
          {/* Grid containing general metrics */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <Card className="bg-white dark:bg-zinc-950 border-zinc-200 dark:border-zinc-900 text-zinc-900 dark:text-zinc-100 shadow-sm dark:shadow-lg transition-colors duration-200">
              <CardContent className="pt-6 flex items-center gap-4">
                <div className="w-12 h-12 bg-red-100 dark:bg-red-950/30 rounded-2xl border border-red-200 dark:border-red-900/20 flex items-center justify-center">
                  <Users className="w-6 h-6 text-red-600 dark:text-red-500" />
                </div>
                <div>
                  <p className="text-[10px] font-black text-zinc-400 dark:text-zinc-500 uppercase tracking-widest">Colaboradores Online</p>
                  <h3 className="text-2xl font-extrabold font-mono text-zinc-900 dark:text-white mt-0.5">
                    {uniqueUserCount}
                  </h3>
                  <p className="text-[9px] text-zinc-400 dark:text-zinc-600 font-semibold">
                    {safeOnlineUsers.length} sessões / {uniqueUserCount} usuário{uniqueUserCount !== 1 ? 's' : ''}
                  </p>
                </div>
              </CardContent>
            </Card>

            <Card className="bg-white dark:bg-zinc-950 border-zinc-200 dark:border-zinc-900 text-zinc-900 dark:text-zinc-100 shadow-sm dark:shadow-lg transition-colors duration-200">
              <CardContent className="pt-6 flex items-center gap-4">
                <div className="w-12 h-12 bg-violet-100 dark:bg-violet-950/30 rounded-2xl border border-violet-200 dark:border-violet-900/20 flex items-center justify-center">
                  <Activity className="w-6 h-6 text-violet-600 dark:text-violet-500 animate-pulse" />
                </div>
                <div>
                  <p className="text-[10px] font-black text-zinc-400 dark:text-zinc-500 uppercase tracking-widest">Página Mais Acessada</p>
                  <h3 className="text-sm font-extrabold text-zinc-900 dark:text-white mt-0.5 truncate max-w-[220px] uppercase">
                    {groupedOnlineUsers.length === 0 ? 'Carregando...' : mostActivePage}
                  </h3>
                </div>
              </CardContent>
            </Card>

            <Card className="bg-white dark:bg-zinc-950 border-zinc-200 dark:border-zinc-900 text-zinc-900 dark:text-zinc-100 shadow-sm dark:shadow-lg transition-colors duration-200">
              <CardContent className="pt-6 flex items-center gap-4">
                <div className="w-12 h-12 bg-emerald-100 dark:bg-emerald-950/30 rounded-2xl border border-emerald-200 dark:border-emerald-900/20 flex items-center justify-center">
                  <RefreshCw className="w-6 h-6 text-emerald-600 dark:text-emerald-500 animate-spin-slow" />
                </div>
                <div>
                  <p className="text-[10px] font-black text-zinc-400 dark:text-zinc-500 uppercase tracking-widest">Sincronização Ativa</p>
                  <h3 className="text-xs font-bold text-emerald-600 dark:text-emerald-400 mt-0.5 uppercase">
                    Supabase Realtime Presence
                  </h3>
                </div>
              </CardContent>
            </Card>
          </div>

          {/* Main online users dashboard */}
          <Card className="bg-white dark:bg-zinc-950 border-zinc-200 dark:border-zinc-900 text-zinc-900 dark:text-zinc-100 shadow-md dark:shadow-xl overflow-x-auto transition-colors duration-200">
            <CardHeader className="border-b border-zinc-200 dark:border-zinc-900 pb-4">
              <CardTitle className="text-base font-black text-zinc-800 dark:text-zinc-200 flex items-center gap-2 uppercase tracking-wide">
                <Terminal className="w-4.5 h-4.5 text-zinc-500 dark:text-zinc-400 shrink-0" />
                Sessões Conectadas ao Nexus
              </CardTitle>
              <CardDescription className="text-zinc-500 dark:text-zinc-400 text-[11px]">
                Lista com ordenação 100% fixa por usuário (sem alteração dinâmica de posição ao navegar ou abrir novas abas).
              </CardDescription>
            </CardHeader>
            <CardContent className="p-0 text-xs">
              {groupedOnlineUsers.length === 0 ? (
                <div className="p-12 text-center text-zinc-500 dark:text-zinc-400 font-bold uppercase tracking-wider">
                  Nenhuma sessão ativa encontrada (além de você).
                </div>
              ) : (
                <div className="divide-y divide-zinc-200 dark:divide-zinc-900">
                  {groupedOnlineUsers.map(u => {
                    const isSelf = u.user_id === user?.id
                    const tabCount = u.sessions.length
                    const friendlyPage = getPageFriendlyName(u.primaryPage)
                    const soundUrl = selectedSounds[u.user_id] || SOUNDS[0].url
                    
                    return (
                      <div
                        key={u.user_id}
                        className={`p-4 grid grid-cols-1 xl:grid-cols-[minmax(220px,300px)_minmax(180px,1fr)_auto] gap-x-4 gap-y-3 items-center transition-all ${
                          isSelf 
                            ? 'hover:bg-blue-50/20 dark:hover:bg-blue-950/10 border-l-2 border-blue-500/40' 
                            : 'hover:bg-zinc-50 dark:hover:bg-zinc-900/20'
                        }`}
                      >
                        
                        {/* User Profile info */}
                        <div className="flex items-start gap-3 min-w-0">
                          <div className="w-9 h-9 rounded-2xl bg-zinc-100 dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 flex items-center justify-center text-zinc-600 dark:text-zinc-300 font-bold uppercase shrink-0 text-sm">
                            {(u.display_name || 'U').charAt(0)}
                          </div>
                          <div className="min-w-0 space-y-1">
                            <div className="flex items-center gap-1.5 flex-wrap">
                              <span className="font-bold text-sm text-zinc-900 dark:text-white truncate max-w-[170px]">{u.display_name}</span>
                              {isSelf && (
                                <Badge className="bg-blue-50 dark:bg-blue-950/40 text-blue-600 dark:text-blue-400 border border-blue-200 dark:border-blue-900/30 text-[8px] px-1.5 py-0 font-bold shrink-0 uppercase">
                                  Você
                                </Badge>
                              )}
                              {tabCount > 1 && (
                                <Badge className="bg-violet-50 dark:bg-violet-950/40 text-violet-600 dark:text-violet-400 border border-violet-200 dark:border-violet-900/30 text-[8px] px-1.5 py-0 font-bold shrink-0 uppercase" title={`${tabCount} abas ativas`}>
                                  {tabCount} abas
                                </Badge>
                              )}
                            </div>
                            <div className="flex items-center gap-1.5 flex-wrap">
                              <Badge variant="outline" className="text-[8px] font-extrabold tracking-tighter px-1 bg-red-50 dark:bg-red-950/20 text-red-600 dark:text-red-500 border border-red-200 dark:border-red-900/30 shrink-0 uppercase">
                                {u.nivel}
                              </Badge>
                              <Badge variant="outline" className="text-[8px] font-bold tracking-tight px-1 bg-zinc-100 dark:bg-zinc-900 text-zinc-600 dark:text-zinc-400 border border-zinc-200 dark:border-zinc-800 shrink-0 uppercase">
                                {u.setor === 'VENDAS' ? 'VENDAS PÚBLICO' : u.setor}
                              </Badge>
                            </div>
                          </div>
                        </div>

                        {/* Active page tracking */}
                        <div className="min-w-0 space-y-0.5">
                          <p className="text-[10px] font-black text-zinc-400 dark:text-zinc-500 uppercase tracking-widest">Navegando em:</p>
                          <div className="flex items-center gap-1.5">
                            <span className="relative flex h-2 w-2 shrink-0">
                              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-violet-400 opacity-75"></span>
                              <span className="relative inline-flex rounded-full h-2 w-2 bg-violet-500"></span>
                            </span>
                            <span className="font-bold text-zinc-800 dark:text-zinc-200 text-xs truncate uppercase tracking-tight" title={friendlyPage}>
                              {friendlyPage}
                            </span>
                          </div>
                          <p className="text-[9px] font-mono text-zinc-500 dark:text-zinc-600 truncate">{u.primaryPage}</p>
                        </div>

                        {/* Quick controller actions */}
                        <div className="flex flex-wrap items-center gap-2 xl:col-start-3">
                          
                          {/* Sound Selector */}
                          <select
                            value={soundUrl}
                            onChange={e => setSelectedSounds(prev => ({ ...prev, [u.user_id]: e.target.value }))}
                            className="h-8 w-36 bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-lg px-2 text-[10px] outline-none focus:border-red-600 font-bold cursor-pointer shrink-0"
                          >
                            {SOUNDS.map(s => (
                              <option key={s.url} value={s.url}>
                                {s.name}
                              </option>
                            ))}
                          </select>

                          {/* Jumpscare button */}
                          <Button
                            size="sm"
                            disabled={scaringUserId === u.user_id}
                            onClick={() => triggerJumpscare(u.user_id, u.user_id, u.display_name)}
                            className="h-8 px-3 bg-red-50 dark:bg-red-950/30 text-red-600 dark:text-red-500 hover:bg-red-600 hover:text-white border border-red-200 dark:border-red-900/30 hover:border-red-600 rounded-lg font-bold text-[10px] uppercase tracking-wider flex items-center gap-1 active:scale-95 shrink-0"
                          >
                            <Volume2 className="w-3.5 h-3.5 animate-bounce shrink-0" />
                            {scaringUserId === u.user_id ? '...' : 'Enviar Som'}
                          </Button>

                          {/* Force-reload button */}
                          <Button
                            size="sm"
                            disabled={reloadingUserId === u.user_id}
                            onClick={() => handleReloadUser(u.user_id, u.display_name)}
                            title="Recarregar o Nexus em todas as abas desse usuário"
                            className="h-8 w-8 p-0 bg-zinc-50 dark:bg-zinc-900/50 text-zinc-500 dark:text-zinc-400 hover:bg-zinc-200 dark:hover:bg-zinc-800 hover:text-zinc-800 dark:hover:text-zinc-200 border border-zinc-200 dark:border-zinc-800 rounded-lg flex items-center justify-center active:scale-95 shrink-0"
                          >
                            <RefreshCw className={`w-3.5 h-3.5 shrink-0 ${reloadingUserId === u.user_id ? 'animate-spin' : ''}`} />
                          </Button>

                        </div>

                      </div>
                    )
                  })}
                </div>
              )}
            </CardContent>
          </Card>
        </>
      ) : (
        <NexusAnalytics />
      )}

    </div>
  )
}
