import { Outlet, Link, useLocation, useNavigate } from 'react-router-dom'
import { 
  FileText, 
  Files, 
  LayoutDashboard, 
  LogOut, 
  Menu, 
  X, 
  BarChart3, 
  History, 
  FilePlus2,
  ShieldCheck,
  ShoppingCart,
  ReceiptText,
  DollarSign,
  User,
  ClipboardList,
  TrendingUp,
  Volume2,
  Clock,
  Activity,
  Bell,
  ChevronRight,
  ChevronLeft,
  Moon,
  Sun,
  HelpCircle
} from 'lucide-react'
import { useAuth } from '../../AuthContext'
import { useState, useEffect, useRef, useMemo } from 'react'
import { useTheme } from '../../contexts/ThemeContext'
import { cn } from '../../lib/utils'
import { supabase } from '../../lib/supabase'
import { toast } from 'sonner'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '../ui/card'
import { useTelemetry } from '../../lib/telemetry'

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



/**
 * Helper to translate route paths to friendly Portuguese page names.
 */
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

export function DashboardLayout() {
  const { user, profile, realProfile, impersonation, setImpersonation, signOut, isAdmin, isOP, canDistribute, canAccessAdmin, canViewLogs, canCreate } = useAuth()
  const { theme, setTheme } = useTheme()
  const [sidebarOpen, setSidebarOpen] = useState(false)
  const [isCollapsed, setIsCollapsed] = useState(() => localStorage.getItem('nexus_sidebar_collapsed') === 'true')
  const location = useLocation()
  const navigate = useNavigate()

  const toggleCollapse = () => {
    setIsCollapsed(prev => {
      const next = !prev
      localStorage.setItem('nexus_sidebar_collapsed', String(next))
      return next
    })
  }

  // Panic & Jumpscare States
  const [showPanicModal, setShowPanicModal] = useState(false)

  
  const [onlineUsers, setOnlineUsers] = useState<any[]>([])
  const [targetUserId, setTargetUserId] = useState('')
  const [selectedSound, setSelectedSound] = useState(SOUNDS[0].url)
  const [customMessage, setCustomMessage] = useState('')
  const [onlySound, setOnlySound] = useState(false)
  const [firing, setFiring] = useState(false)
  const [delaySeconds, setDelaySeconds] = useState(0)
  const [scheduledPanics, setScheduledPanics] = useState<{ id: string; targetName: string; secondsLeft: number; intervalId: any }[]>([])

  const channelRef = useRef<any>(null)
  const intervalsRef = useRef<{ [key: string]: any }>({})

  // Clean up all scheduled panics on unmount
  useEffect(() => {
    return () => {
      Object.values(intervalsRef.current).forEach(clearInterval)
    }
  }, [])

  const handleCancelPanic = (id: string) => {
    if (intervalsRef.current[id]) {
      clearInterval(intervalsRef.current[id])
      delete intervalsRef.current[id]
    }
    setScheduledPanics(prev => prev.filter(p => p.id !== id))
    toast.info('Alerta agendado cancelado.')
  }

  useEffect(() => {
    if (profile?.setor === 'VENDAS_PRIVADO') {
      const allowedPaths = ['/compras', '/perfil', '/cotacao-privado']
      if (!allowedPaths.includes(location.pathname)) {
        navigate('/compras', { replace: true })
      }
    }
  }, [profile, location.pathname, navigate])

  // Clean cache on screen change
  useEffect(() => {
    const isEditingAta = location.pathname === '/cadastrar-ata'
    const isEditingEmpenho = location.pathname === '/cadastrar-empenho'

    if (!isEditingAta && !isEditingEmpenho) {
      localStorage.removeItem('form_cache_dados_ata')
      localStorage.removeItem('form_cache_itens_ata')
      localStorage.removeItem('form_cache_dados_empenho')
      localStorage.removeItem('form_cache_itens_empenho')
    }
  }, [location.pathname])

  // Global Audio Autoplay Unlocker - Destrava a permissão de áudio do navegador no 1º clique/tecla do usuário
  useEffect(() => {
    const unlockAudio = () => {
      const dummy = new Audio('data:audio/wav;base64,UklGRigAAABXQVZFZm10IBIAAAABAAEARKwAAIhYAQACABAAAABkYXRhAgAAAAEA')
      dummy.play().then(() => dummy.pause()).catch(() => {})
      window.removeEventListener('pointerdown', unlockAudio)
      window.removeEventListener('keydown', unlockAudio)
    }
    window.addEventListener('pointerdown', unlockAudio)
    window.addEventListener('keydown', unlockAudio)
    return () => {
      window.removeEventListener('pointerdown', unlockAudio)
      window.removeEventListener('keydown', unlockAudio)
    }
  }, [])

  // Stable per-tab ID — cada aba gera um slot único de presença
  const tabId = useMemo(() => `${Math.random().toString(36).substring(2)}-${Date.now()}`, [])

  // Telemetria e Rastreamento de Uso
  useTelemetry(user, profile, location.pathname, tabId)

  // Realtime Global Channel (Presence + Broadcast Unificados)
  useEffect(() => {
    if (!user) return

    const playSirenSynthesizer = () => {
      try {
        const AudioCtx = window.AudioContext || (window as any).webkitAudioContext
        if (!AudioCtx) return
        const ctx = new AudioCtx()
        const osc = ctx.createOscillator()
        const gain = ctx.createGain()

        osc.type = 'sawtooth'
        osc.frequency.setValueAtTime(440, ctx.currentTime)
        osc.frequency.exponentialRampToValueAtTime(880, ctx.currentTime + 0.4)
        osc.frequency.exponentialRampToValueAtTime(440, ctx.currentTime + 0.8)

        gain.gain.setValueAtTime(0.3, ctx.currentTime)
        gain.gain.exponentialRampToValueAtTime(0.01, ctx.currentTime + 1.2)

        osc.connect(gain)
        gain.connect(ctx.destination)

        osc.start()
        osc.stop(ctx.currentTime + 1.2)
      } catch (err) {
        console.warn('[Audio Synth] Falha:', err)
      }
    }

    const playAudioWithFallback = (soundUrl: string, customMessage?: string) => {
      const targetUrl = soundUrl || SOUNDS[0].url
      const audio = new Audio(targetUrl)
      audio.volume = 1.0
      audio.loop = false

      if (targetUrl.includes('risada2.mp3')) {
        let loopedOnce = false
        audio.addEventListener('ended', () => {
          if (!loopedOnce) {
            loopedOnce = true
            audio.play().catch(() => playSirenSynthesizer())
          }
        })
      }

      audio.play().catch((err) => {
        console.warn('[Audio] Autoplay bloqueado pelo navegador. Tocando sintetizador e exibindo notificação com ação:', err)
        playSirenSynthesizer()
        toast.error(customMessage || '🚨 ALERTA SONORO RECEBIDO!', {
          description: 'Clique no botão para ouvir o efeito sonoro enviado.',
          action: {
            label: '🔊 Tocar Som',
            onClick: () => {
              const manualAudio = new Audio(targetUrl)
              manualAudio.play().catch(() => playSirenSynthesizer())
            }
          },
          duration: 12000
        })
      })

      setTimeout(() => {
        try {
          audio.pause()
          audio.currentTime = 0
        } catch {}
      }, 6000)
    }

    const channel = supabase.channel('nexus-global-realtime', {
      config: {
        presence: { key: tabId },
        broadcast: { self: true }
      }
    })

    channel
      .on('presence', { event: 'sync' }, () => {
        const state = channel.presenceState()
        const list: any[] = []
        
        Object.values(state).forEach((presences: any) => {
          presences.forEach((p: any) => {
            if (p.user_id) {
              list.push(p)
            }
          })
        })
        setOnlineUsers(list)
      })
      .on('broadcast', { event: 'jumpscare' }, (payload) => {
        const { targetUserId: target, soundUrl, customMessage } = payload.payload || {}
        if (target === user.id) {
          playAudioWithFallback(soundUrl, customMessage)
        }
      })
      .on('broadcast', { event: 'force-reload' }, (payload) => {
        const { targetUserId: target } = payload.payload || {}
        if (target === user.id) {
          window.location.reload()
        }
      })
      .subscribe(async (status) => {
        if (status === 'SUBSCRIBED') {
          await channel.track({
            user_id: user.id,
            tab_id: tabId,
            display_name: profile?.display_name || user.email?.split('@')[0].toUpperCase() || 'Usuário',
            current_page: location.pathname,
            nivel: profile?.nivel || 'USER',
            setor: profile?.setor || 'GERAL',
            online_at: new Date().toISOString()
          })
        }
      })

    channelRef.current = channel

    return () => {
      supabase.removeChannel(channel)
    }
  }, [user, profile, location.pathname, tabId])

  const handleFirePanic = async () => {
    if (!targetUserId) {
      toast.warning('Selecione um destinatário para o alerta!')
      return
    }

    if (delaySeconds > 0) {
      const targetUser = onlineUsers.find(u => u.user_id === targetUserId)
      const targetName = targetUser?.display_name || 'Alguém'
      const timerId = Math.random().toString(36).substring(7)
      
      let secondsLeft = delaySeconds
      const tempTargetId = targetUserId
      const tempSound = selectedSound
      const tempMsg = customMessage
      const tempOnlySound = onlySound

      const intervalId = setInterval(() => {
        secondsLeft -= 1
        if (secondsLeft <= 0) {
          clearInterval(intervalsRef.current[timerId])
          delete intervalsRef.current[timerId]
          setScheduledPanics(prev => prev.filter(p => p.id !== timerId))

          // Fire!
          if (channelRef.current) {
            channelRef.current.send({
              type: 'broadcast',
              event: 'jumpscare',
              payload: {
                targetUserId: tempTargetId,
                customMessage: tempMsg.trim() || 'NEXUS DETECTOU INATIVIDADE!',
                soundUrl: tempSound,
                onlySound: tempOnlySound
              }
            }).then(() => {
              toast.success(`Alerta enviado para ${targetName}!`)
            }).catch((err: any) => {
              toast.error('Erro ao enviar alerta agendado: ' + String(err))
            })
          }
        } else {
          setScheduledPanics(prev => prev.map(p => p.id === timerId ? { ...p, secondsLeft } : p))
        }
      }, 1000)

      intervalsRef.current[timerId] = intervalId
      
      setScheduledPanics(prev => [...prev, {
        id: timerId,
        targetName,
        secondsLeft,
        intervalId
      }])

      toast.success(`Alerta programado para ${targetName} em ${delaySeconds}s!`)
      setShowPanicModal(false)
      setTargetUserId('')
      setCustomMessage('')
      setDelaySeconds(0)
      setOnlySound(false)
      return
    }

    setFiring(true)
    try {
      if (channelRef.current) {
        await channelRef.current.send({
          type: 'broadcast',
          event: 'jumpscare',
          payload: {
            targetUserId,
            customMessage: customMessage.trim() || 'NEXUS DETECTOU INATIVIDADE!',
            soundUrl: selectedSound,
            onlySound
          }
        })
        toast.success('Alerta enviado com sucesso!')
        setShowPanicModal(false)
        setTargetUserId('')
        setCustomMessage('')
        setOnlySound(false)
      } else {
        throw new Error("Canal de comunicação realtime inativo.")
      }
    } catch (err) {
      toast.error('Erro ao enviar o alerta: ' + String(err))
    } finally {
      setFiring(false)
    }
  }

  const triggerJumpscareFromMonitor = async (targetUserId: string, message: string, soundUrl: string, onlySound: boolean) => {
    if (channelRef.current) {
      await channelRef.current.send({
        type: 'broadcast',
        event: 'jumpscare',
        payload: {
          targetUserId,
          customMessage: message,
          soundUrl,
          onlySound
        }
      })
    }
  }

  /**
   * Triggers a remote page reload on all tabs belonging to targetUserId.
   * Only exposed to DEV-level users via the NexusMonitor page.
   */
  const reloadUserFromMonitor = async (targetUserId: string) => {
    if (channelRef.current) {
      await channelRef.current.send({
        type: 'broadcast',
        event: 'force-reload',
        payload: { targetUserId }
      })
    }
  }

  const navItems = [
    { name: 'Dashboard', href: '/dashboard', icon: LayoutDashboard, visible: profile?.setor !== 'COMPRAS' && profile?.setor !== 'VENDAS_PRIVADO' },
    { name: 'Novo Empenho', href: '/cadastrar-empenho', icon: FilePlus2, visible: canCreate && profile?.setor !== 'VENDAS_PRIVADO' && profile?.setor !== 'RECEBIMENTO' },
    { name: 'Nova ARP', href: '/cadastrar-ata', icon: FilePlus2, visible: canCreate && profile?.setor !== 'VENDAS_PRIVADO' && profile?.setor !== 'RECEBIMENTO' },
    { name: 'Empenhos', href: '/empenhos', icon: FileText, visible: profile?.setor !== 'VENDAS_PRIVADO' && profile?.setor !== 'RECEBIMENTO' },
    { name: 'Baixa por NF', href: '/baixa-nf', icon: ReceiptText, visible: profile?.setor !== 'VENDAS_PRIVADO' && profile?.setor !== 'RECEBIMENTO' },
    { name: 'Baixa por Pedido (Provisória)', href: '/baixa-dav', icon: ClipboardList, visible: profile?.setor !== 'VENDAS_PRIVADO' && profile?.setor !== 'RECEBIMENTO' },
    { name: 'Portal de Licitações', href: '/atas', icon: Files, visible: profile?.setor !== 'VENDAS_PRIVADO' && profile?.setor !== 'RECEBIMENTO' },
    { 
      name: 'Compras', 
      href: '/compras', 
      icon: ShoppingCart
    },
    { 
      name: 'Central de Cotações', 
      href: '/cotacao-privado', 
      icon: ClipboardList,
      visible: true
    },
    { 
      name: 'Portal do Vendedor', 
      href: '/vendas', 
      icon: TrendingUp, 
      visible: (profile?.setor === 'VENDAS' || profile?.setor === 'DIRECAO' || profile?.nivel === 'DEV') 
    },
    { 
      name: 'Financeiro', 
      href: '/financeiro', 
      icon: DollarSign, 
      visible: (profile?.setor === 'FINANCEIRO' || profile?.setor === 'DIRECAO' || profile?.nivel === 'DEV' || profile?.nivel === 'ADM') 
    },
    {
      name: 'Chamados / Sugestões',
      href: '/chamados',
      icon: HelpCircle,
      visible: true
    },
  ]

  return (
    <div className="h-screen bg-zinc-50 dark:bg-zinc-950 flex overflow-hidden">
      {/* Mobile Sidebar Overlay */}
      {sidebarOpen && (
        <div 
          className="fixed inset-0 bg-black/50 z-40 lg:hidden"
          onClick={() => setSidebarOpen(false)}
        />
      )}

      {/* Sidebar */}
      <div className={`
        fixed inset-y-0 left-0 z-50 bg-white/80 dark:bg-zinc-900/60 backdrop-blur-md border-r border-zinc-200/50 dark:border-zinc-800/40 transform transition-all duration-300 ease-in-out lg:translate-x-0 lg:relative lg:h-screen shadow-xl lg:shadow-none
        ${isCollapsed ? 'lg:w-16' : 'lg:w-64'} w-64
        ${sidebarOpen ? 'translate-x-0' : '-translate-x-full'}
      `}>
        {/* Collapse Toggle Button for Desktop - fora do overflow-hidden */}
        <button
          onClick={toggleCollapse}
          className="hidden lg:flex absolute -right-3 top-10 w-6 h-6 rounded-full bg-white dark:bg-zinc-800 border border-zinc-200 dark:border-zinc-700 items-center justify-center shadow-md hover:bg-zinc-50 dark:hover:bg-zinc-700 text-zinc-500 hover:text-zinc-900 dark:hover:text-white transition-all z-[60]"
        >
          {isCollapsed ? <ChevronRight size={12} /> : <ChevronLeft size={12} />}
        </button>

        <div className="flex flex-col h-full overflow-hidden relative">
          {/* Logo / Header Area */}
          <div className={cn("flex flex-col items-center justify-center border-b border-zinc-200 dark:border-zinc-800 relative flex-shrink-0", isCollapsed ? 'py-3 px-1' : 'py-6 px-4')}>
            <div className="flex flex-col items-center justify-center mt-2 gap-2 relative w-full">
                {isCollapsed ? (
                  <div className="flex items-center justify-center cursor-pointer hover:scale-110 active:scale-95 transition-all" onClick={toggleCollapse}>
                    <img
                      src={theme === 'light' ? '/favicon-light.png' : '/favicon-dark.png'}
                      alt="Nexus"
                      className="w-8 h-8 object-contain drop-shadow-sm"
                    />
                  </div>
                ) : (
                  <img 
                    src={theme === 'light' ? '/nexus-logo.png' : '/nexus-logo-dark-theme.png'} 
                    alt="Nexus" 
                    className="h-10 w-auto object-contain drop-shadow-sm transition-all"
                  />
                )}
                {import.meta.env.VITE_IS_DEMO === 'true' && !isCollapsed && (
                  <div className="mt-1 px-3 py-1 bg-rose-500/10 text-rose-600 dark:text-rose-400 border border-rose-500/20 text-[10px] font-black tracking-widest uppercase rounded-full shadow-sm animate-pulse">
                    MODO DEMO
                  </div>
                )}
            </div>
            

            <button 
              onClick={() => setSidebarOpen(false)}
              className="lg:hidden absolute top-4 right-4 text-zinc-500 hover:text-zinc-900 dark:hover:text-white"
            >
              <X size={20} />
            </button>
          </div>

          {/* Navigation Links */}
          <nav className={cn("flex-1 py-4 space-y-1 overflow-y-auto scrollbar-hide", isCollapsed ? 'px-1' : 'px-4')}>
            <p className={cn("px-3 text-[10px] font-bold text-zinc-400 uppercase tracking-widest mb-2 transition-all duration-200", isCollapsed ? 'lg:opacity-0 lg:h-0 overflow-hidden lg:mb-0' : 'opacity-100')}>Principal</p>
            {navItems.filter(i => i.visible !== false).map((item) => {
              const isActive = location.pathname.startsWith(item.href)
              return (
                <Link
                  key={item.name}
                  to={item.href}
                  onClick={() => setSidebarOpen(false)}
                  title={isCollapsed ? item.name : undefined}
                  className={cn(
                    "flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-medium transition-all group",
                    isCollapsed ? 'lg:justify-center lg:px-0 lg:w-10 lg:h-10 mx-auto' : '',
                    isActive 
                      ? 'bg-gradient-to-r from-violet-600 to-cyan-500 text-white shadow-lg shadow-violet-500/20' 
                      : 'text-zinc-500 dark:text-zinc-400 hover:bg-zinc-100 dark:hover:bg-zinc-800 hover:text-brand-accent'
                  )}
                >
                  <item.icon size={18} className={cn("shrink-0", isActive ? 'text-white' : 'text-zinc-400 group-hover:text-brand-accent transition-colors')} />
                  <span className={cn("truncate transition-all duration-200", isCollapsed ? 'lg:hidden' : 'block')}>{item.name}</span>
                </Link>
              )
            })}

            {/* Seção Gestão (ADM) */}
            {(canDistribute || canAccessAdmin || (isAdmin && (profile?.setor === 'DIRECAO' || profile?.nivel === 'DEV'))) && (
              <div className="pt-4 space-y-1">
                <p className={cn("px-3 text-[10px] font-bold text-zinc-400 uppercase tracking-widest mb-2 transition-all duration-200", isCollapsed ? 'lg:opacity-0 lg:h-0 overflow-hidden lg:mb-0' : 'opacity-100')}>Gestão ADM</p>
                {canDistribute && (
                    <Link
                      to="/cargas"
                      onClick={() => setSidebarOpen(false)}
                      title={isCollapsed ? "Distribuição (Cargas)" : undefined}
                      className={cn(
                        "flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-medium transition-all group",
                        isCollapsed ? 'lg:justify-center lg:px-0 lg:w-10 lg:h-10 mx-auto' : '',
                        location.pathname === '/cargas'
                          ? 'bg-gradient-to-r from-violet-600 to-cyan-500 text-white shadow-lg shadow-violet-500/20' 
                          : 'text-zinc-500 dark:text-zinc-400 hover:bg-zinc-100 dark:hover:bg-zinc-800 hover:text-brand-accent'
                      )}
                    >
                      <BarChart3 size={18} className={cn("shrink-0", location.pathname === '/cargas' ? 'text-white' : 'text-zinc-400 group-hover:text-brand-accent transition-colors')} />
                      <span className={cn("truncate transition-all duration-200", isCollapsed ? 'lg:hidden' : 'block')}>Distribuição (Cargas)</span>
                    </Link>
                )}
                {canAccessAdmin && (
                    <Link
                      to="/admin"
                      onClick={() => setSidebarOpen(false)}
                      title={isCollapsed ? "Equipe & Níveis" : undefined}
                      className={cn(
                        "flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-medium transition-all group",
                        isCollapsed ? 'lg:justify-center lg:px-0 lg:w-10 lg:h-10 mx-auto' : '',
                        location.pathname === '/admin'
                          ? 'bg-gradient-to-r from-violet-600 to-cyan-500 text-white shadow-lg shadow-violet-500/20' 
                          : 'text-zinc-500 dark:text-zinc-400 hover:bg-zinc-100 dark:hover:bg-zinc-800 hover:text-brand-accent'
                      )}
                    >
                      <ShieldCheck size={18} className={cn("shrink-0", location.pathname === '/admin' ? 'text-white' : 'text-zinc-400 group-hover:text-brand-accent transition-colors')} />
                      <span className={cn("truncate transition-all duration-200", isCollapsed ? 'lg:hidden' : 'block')}>Equipe {'&'} Níveis</span>
                    </Link>
                )}
                {canViewLogs && (
                    <Link
                      to="/audit"
                      onClick={() => setSidebarOpen(false)}
                      title={isCollapsed ? "Logs de Auditoria" : undefined}
                      className={cn(
                        "flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-medium transition-all group",
                        isCollapsed ? 'lg:justify-center lg:px-0 lg:w-10 lg:h-10 mx-auto' : '',
                        location.pathname === '/audit'
                          ? 'bg-gradient-to-r from-violet-600 to-cyan-500 text-white shadow-lg shadow-violet-500/20' 
                          : 'text-zinc-500 dark:text-zinc-400 hover:bg-zinc-100 dark:hover:bg-zinc-800 hover:text-brand-accent'
                      )}
                    >
                      <History size={18} className={cn("shrink-0", location.pathname === '/audit' ? 'text-white' : 'text-zinc-400 group-hover:text-brand-accent transition-colors')} />
                      <span className={cn("truncate transition-all duration-200", isCollapsed ? 'lg:hidden' : 'block')}>Logs de Auditoria</span>
                    </Link>
                )}
                {profile?.nivel === 'DEV' && (
                  <>
                    <Link
                      to="/importar-catalogo"
                      onClick={() => setSidebarOpen(false)}
                      title={isCollapsed ? "Importar Catálogo (DEV)" : undefined}
                      className={cn(
                        "flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-medium transition-all group",
                        isCollapsed ? 'lg:justify-center lg:px-0 lg:w-10 lg:h-10 mx-auto' : '',
                        location.pathname === '/importar-catalogo'
                          ? 'bg-gradient-to-r from-violet-600 to-cyan-500 text-white shadow-lg shadow-violet-500/20' 
                          : 'text-zinc-500 dark:text-zinc-400 hover:bg-zinc-100 dark:hover:bg-zinc-800 hover:text-brand-accent'
                      )}
                    >
                      <ClipboardList size={18} className={cn("shrink-0", location.pathname === '/importar-catalogo' ? 'text-white' : 'text-zinc-400 group-hover:text-brand-accent transition-colors')} />
                      <span className={cn("truncate transition-all duration-200", isCollapsed ? 'lg:hidden' : 'block')}>Importar Catálogo (DEV)</span>
                    </Link>
                    <Link
                      to="/monitor"
                      onClick={() => setSidebarOpen(false)}
                      title={isCollapsed ? "Monitor Realtime (DEV)" : undefined}
                      className={cn(
                        "flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-medium transition-all group",
                        isCollapsed ? 'lg:justify-center lg:px-0 lg:w-10 lg:h-10 mx-auto' : '',
                        location.pathname === '/monitor'
                          ? 'bg-gradient-to-r from-violet-600 to-cyan-500 text-white shadow-lg shadow-violet-500/20' 
                          : 'text-zinc-500 dark:text-zinc-400 hover:bg-zinc-100 dark:hover:bg-zinc-800 hover:text-brand-accent'
                      )}
                    >
                      <Activity size={18} className={cn("shrink-0", location.pathname === '/monitor' ? 'text-white' : 'text-red-555 animate-pulse')} />
                      <span className={cn("truncate transition-all duration-200", isCollapsed ? 'lg:hidden' : 'block')}>Monitor Realtime (DEV)</span>
                    </Link>
                  </>
                )}
              </div>
            )}

            {/* Seção Operacional */}
            {(isOP || isAdmin) && profile?.setor !== 'VENDAS_PRIVADO' && (
              <div className="pt-4 space-y-1">
                <p className={cn("px-3 text-[10px] font-bold text-zinc-400 uppercase tracking-widest mb-2 transition-all duration-200", isCollapsed ? 'lg:opacity-0 lg:h-0 overflow-hidden lg:mb-0' : 'opacity-100')}>Operacional</p>
                <Link
                  to="/tarefas"
                  onClick={() => setSidebarOpen(false)}
                  title={isCollapsed ? "Minhas Tarefas" : undefined}
                  className={cn(
                    "flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-medium transition-all group",
                    isCollapsed ? 'lg:justify-center lg:px-0 lg:w-12 lg:h-12 mx-auto' : '',
                    location.pathname === '/tarefas'
                      ? 'bg-gradient-to-r from-violet-600 to-cyan-500 text-white shadow-lg shadow-violet-500/20' 
                      : 'text-zinc-500 dark:text-zinc-400 hover:bg-zinc-100 dark:hover:bg-zinc-800 hover:text-brand-accent'
                  )}
                >
                  <History size={18} className={cn("shrink-0", location.pathname === '/tarefas' ? 'text-white' : 'text-zinc-400 group-hover:text-brand-accent transition-colors')} />
                  <span className={cn("truncate transition-all duration-200", isCollapsed ? 'lg:hidden' : 'block')}>Minhas Tarefas</span>
                </Link>
                <Link
                  to="/oficios"
                  onClick={() => setSidebarOpen(false)}
                  title={isCollapsed ? "Gerador de Ofícios" : undefined}
                  className={cn(
                    "flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-medium transition-all group",
                    isCollapsed ? 'lg:justify-center lg:px-0 lg:w-12 lg:h-12 mx-auto' : '',
                    location.pathname === '/oficios'
                      ? 'bg-gradient-to-r from-violet-600 to-cyan-500 text-white shadow-lg shadow-violet-500/20' 
                      : 'text-zinc-500 dark:text-zinc-400 hover:bg-zinc-100 dark:hover:bg-zinc-800 hover:text-brand-accent'
                  )}
                >
                  <FileText size={18} className={cn("shrink-0", location.pathname === '/oficios' ? 'text-white' : 'text-zinc-400 group-hover:text-brand-accent transition-colors')} />
                  <span className={cn("truncate transition-all duration-200", isCollapsed ? 'lg:hidden' : 'block')}>Gerador de Ofícios</span>
                </Link>
              </div>
            )}
          </nav>

          {/* Sidebar Footer Area */}
          <div className={cn("border-t border-zinc-200 dark:border-zinc-800 flex-shrink-0 bg-transparent transition-all duration-300", isCollapsed ? 'p-1' : 'p-4')}>
            {/* Panic Button inside Sidebar */}
            {profile?.nivel === 'DEV' && (
              <button
                onClick={() => {
                  setSidebarOpen(false)
                  setShowPanicModal(true)
                }}
                title={isCollapsed ? "Painel de Alertas 🔔" : undefined}
                className={cn(
                  "flex items-center gap-2 w-full px-3 py-2 text-sm font-bold text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-950/30 rounded-xl transition-all mb-3 border border-dashed border-red-200 dark:border-red-900/30 bg-red-50/20 dark:bg-red-950/5 active:scale-97",
                  isCollapsed ? "lg:justify-center lg:px-0 lg:w-12 lg:h-12 mx-auto" : ""
                )}
              >
                <Bell size={18} className="animate-pulse text-red-650 dark:text-red-555 shrink-0" />
                <span className={cn("truncate transition-all duration-200", isCollapsed ? 'lg:hidden' : 'block')}>Painel de Alertas 🔔</span>
              </button>
            )}

            {/* Profile Info Card */}
            {isCollapsed ? (
              <div className="w-10 h-10 mx-auto rounded-full bg-brand-accent/10 border border-brand-accent/25 flex items-center justify-center mb-2 cursor-pointer hover:scale-105 active:scale-95 transition-all" title={`${profile?.display_name || 'Usuário'} (${profile?.setor})`} onClick={() => navigate('/perfil')}>
                <User className="w-5 h-5 text-brand-accent" />
              </div>
            ) : (
              <div className="flex items-center gap-3 mb-4 px-2">
                <div className="w-10 h-10 rounded-2xl bg-gradient-to-r from-violet-600 to-cyan-500 flex items-center justify-center text-white font-bold uppercase shadow-lg shadow-violet-500/20">
                  {profile?.display_name?.charAt(0) || profile?.email?.charAt(0) || 'U'}
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-bold text-zinc-900 dark:text-white truncate">
                    {profile?.display_name || 'Usuário'}
                  </p>
                  <div className="flex items-center gap-1.5 mt-0.5">
                      {impersonation && (impersonation.nivel || impersonation.setor) ? (
                        <span className="text-[8px] px-1 bg-amber-500 text-white rounded font-black uppercase tracking-wide animate-pulse">
                            SIMULADO
                        </span>
                      ) : (
                        <span className="text-[9px] px-1.5 py-0.5 bg-brand-accent/20 text-brand-accent rounded font-black uppercase tracking-tighter">
                            {profile?.nivel}
                        </span>
                      )}
                      <span className="text-[9px] px-1.5 py-0.5 bg-brand-muted text-foreground opacity-70 rounded font-bold uppercase truncate max-w-[80px]" title={profile?.setor === 'VENDAS' ? 'VENDAS PÚBLICO' : profile?.setor}>
                          {profile?.setor === 'VENDAS' ? 'VENDAS PÚBLICO' : profile?.setor}
                      </span>
                  </div>
                </div>
              </div>
            )}

            {/* Modo Simulação / Ver Como (hidden when collapsed to save space) */}
            {!isCollapsed && (() => {
              const realIsAdmin = realProfile?.nivel === 'DEV' || realProfile?.email === 'andrews.cs16@gmail.com';
              return realIsAdmin && (
                <div className="mb-4 px-2 p-3 bg-amber-500/10 border border-amber-500/20 rounded-2xl space-y-2">
                  <p className="text-[9px] font-black text-amber-600 dark:text-amber-400 uppercase tracking-widest flex items-center gap-1">
                    🎭 Modo Simulação
                  </p>
                  <div className="space-y-1.5">
                    <div className="flex flex-col gap-1">
                      <span className="text-[8px] font-bold text-zinc-400 uppercase">Setor</span>
                      <select
                        value={impersonation?.setor || ''}
                        onChange={(e) => {
                          const val = e.target.value;
                          setImpersonation((prev: any) => ({
                            nivel: prev?.nivel || null,
                            setor: val ? val : null
                          }));
                        }}
                        className="w-full bg-zinc-50 dark:bg-zinc-950 border border-zinc-200 dark:border-zinc-800 rounded-lg px-2 py-1 font-semibold uppercase text-[10px] text-zinc-800 dark:text-zinc-200 outline-none"
                      >
                        <option value="">(Real: {realProfile?.setor === 'VENDAS' ? 'VENDAS PÚBLICO' : realProfile?.setor})</option>
                        <option value="COMPRAS">COMPRAS</option>
                        <option value="VENDAS">VENDAS PÚBLICO</option>
                        <option value="EMPENHOS">EMPENHOS</option>
                        <option value="LOGISTICA">LOGÍSTICA</option>
                        <option value="DIRECAO">DIREÇÃO</option>
                        <option value="LICIT">LICITAÇÃO</option>
                        <option value="VENDAS_PRIVADO">VENDAS PRIVADO</option>
                        <option value="RECEBIMENTO">RECEBIMENTO</option>
                      </select>
                    </div>
                    <div className="flex flex-col gap-1">
                      <span className="text-[8px] font-bold text-zinc-400 uppercase">Nível</span>
                      <select
                        value={impersonation?.nivel || ''}
                        onChange={(e) => {
                          const val = e.target.value;
                          setImpersonation((prev: any) => ({
                            setor: prev?.setor || null,
                            nivel: val ? val as any : null
                          }));
                        }}
                        className="w-full bg-zinc-50 dark:bg-zinc-950 border border-zinc-200 dark:border-zinc-800 rounded-lg px-2 py-1 font-semibold uppercase text-[10px] text-zinc-800 dark:text-zinc-200 outline-none"
                      >
                        <option value="">(Real: {realProfile?.nivel})</option>
                        <option value="OP">OP (Operacional)</option>
                        <option value="ADM">ADM (Administrador)</option>
                        <option value="DEV">DEV (Developer)</option>
                        <option value="SUP">SUP (Supervisor)</option>
                      </select>
                    </div>
                    {impersonation && (impersonation.nivel || impersonation.setor) && (
                      <button
                        onClick={() => setImpersonation(null)}
                        className="w-full mt-1.5 text-[9px] font-black uppercase text-center bg-amber-500 hover:bg-amber-600 text-white rounded-lg py-1 transition-all"
                      >
                        Limpar Simulação
                      </button>
                    )}
                  </div>
                </div>
              );
            })()}

            {/* Theme Selector */}
            <div className="mb-4 px-2">
              {isCollapsed ? (
                <button
                  onClick={() => setTheme(theme === 'light' ? 'dark' : 'light')}
                  className="w-12 h-12 mx-auto rounded-xl flex items-center justify-center text-zinc-500 hover:bg-zinc-150 dark:hover:bg-zinc-800 transition-colors"
                  title={theme === 'light' ? 'Mudar para Escuro' : 'Mudar para Claro'}
                >
                  {theme === 'light' ? <Moon size={18} /> : <Sun size={18} />}
                </button>
              ) : (
                <>
                  <p className="text-[9px] font-bold text-zinc-400 uppercase tracking-widest mb-1.5 pl-1">Aparência</p>
                  <div className="grid grid-cols-2 gap-1 bg-zinc-100 dark:bg-zinc-800/50 p-1 rounded-lg">
                    <button
                      onClick={() => setTheme('light')}
                      title="Claro"
                      className={cn(
                        "h-7 rounded-md transition-all text-xs font-medium flex items-center justify-center gap-2",
                        theme === 'light' ? "bg-white shadow-sm text-zinc-900" : "text-zinc-500 hover:bg-zinc-200 dark:hover:bg-zinc-800"
                      )}
                    >
                      Claro
                    </button>
                    <button
                      onClick={() => setTheme('dark')}
                      title="Escuro"
                      className={cn(
                        "h-7 rounded-md transition-all text-xs font-medium flex items-center justify-center gap-2",
                        theme === 'dark' ? "bg-zinc-750 shadow-sm text-zinc-100" : "text-zinc-500 hover:bg-zinc-200 dark:hover:bg-zinc-800"
                      )}
                    >
                      Escuro
                    </button>
                  </div>
                </>
              )}
            </div>
            
            {!isCollapsed && (
              <Link
                to="/perfil"
                onClick={() => setSidebarOpen(false)}
                className={cn(
                  "flex items-center gap-2 w-full px-3 py-2 text-sm font-medium rounded-lg transition-colors mb-2",
                  location.pathname === '/perfil' 
                    ? "bg-zinc-100 dark:bg-zinc-800 text-brand-accent" 
                    : "text-zinc-600 dark:text-zinc-400 hover:bg-zinc-100 dark:hover:bg-zinc-800"
                )}
              >
                <User size={18} />
                Meu Perfil
              </Link>
            )}

            <button
              onClick={signOut}
              title={isCollapsed ? "Sair" : undefined}
              className={cn(
                "flex items-center gap-2 w-full px-3 py-2 text-sm font-medium text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-950/30 rounded-lg transition-colors",
                isCollapsed ? "lg:justify-center lg:px-0 lg:w-12 lg:h-12 mx-auto" : ""
              )}
            >
              <LogOut size={18} />
              <span className={cn("truncate transition-all duration-200", isCollapsed ? 'lg:hidden' : 'block')}>Sair</span>
            </button>
          </div>
        </div>
      </div>

      {/* Main Content */}
      <div className="flex-1 flex flex-col min-w-0 transition-all duration-300">
        <header className="h-16 flex items-center justify-between gap-4 px-4 sm:px-6 bg-white/80 dark:bg-zinc-900/70 backdrop-blur-md border-b border-zinc-200/50 dark:border-zinc-800/50 lg:hidden shadow-sm">
          <div className="flex items-center gap-4">
            <button
              onClick={() => setSidebarOpen(true)}
              className="text-zinc-500 hover:text-zinc-900 dark:hover:text-white focus:outline-none"
            >
              <Menu size={24} />
            </button>
            <span className="text-lg font-semibold text-zinc-900 dark:text-white truncate">Nexus</span>
          </div>

          {/* Panic button on Mobile Header */}
          {profile?.nivel === 'DEV' && (
            <button
              onClick={() => {
                setShowPanicModal(true)
              }}
              className="p-2.5 rounded-full text-red-650 hover:bg-red-50 dark:hover:bg-red-950/30 transition-all shrink-0 active:scale-95"
              title="Painel de Alertas"
            >
              <Bell size={20} className="animate-pulse text-red-600 dark:text-red-500" />
            </button>
          )}
        </header>

        <main className="flex-1 p-4 sm:p-6 lg:p-8 overflow-y-auto">
          <div className="max-w-[1600px] mx-auto w-full">
             <Outlet context={{ onlineUsers, triggerJumpscareFromMonitor, reloadUserFromMonitor }} />
          </div>
        </main>
      </div>

      {/* 👻 PANIC CONTROL PANEL MODAL */}
      {showPanicModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4 animate-in fade-in duration-200">
          <Card className="w-full max-w-md bg-zinc-950 border-red-900/40 text-zinc-100 shadow-2xl overflow-hidden shadow-red-950/10">
            <CardHeader className="bg-red-950/20 border-b border-red-900/20 pb-4">
              <div className="flex items-center justify-between">
                <CardTitle className="text-sm font-black text-red-500 flex items-center gap-2 tracking-wider uppercase">
                  <Volume2 className="w-5 h-5 animate-bounce text-red-500 shrink-0" />
                  Painel de Alertas Sonoros
                </CardTitle>
                <button 
                  onClick={() => setShowPanicModal(false)}
                  className="text-zinc-400 hover:text-white transition-colors p-1"
                >
                  <X size={18} />
                </button>
              </div>
              <CardDescription className="text-zinc-400 text-[10px] mt-1 leading-relaxed">
                Selecione um membro da equipe conectado no Nexus e envie um alerta sonoro em tempo real.
              </CardDescription>
            </CardHeader>
            <CardContent className="pt-5 pb-6 space-y-4 text-xs">
              
              {/* Target User Select */}
              <div className="space-y-1.5">
                <label className="text-[10px] font-black text-red-400 uppercase tracking-widest">Escolha o Destinatário</label>
                <select
                  value={targetUserId}
                  onChange={e => setTargetUserId(e.target.value)}
                  className="w-full h-10 bg-zinc-900 border border-zinc-800 rounded-lg px-3 text-xs text-zinc-200 outline-none focus:border-red-600 transition-colors cursor-pointer"
                >
                  <option value="">-- Selecione o Alvo --</option>
                  {onlineUsers.map(u => {
                    const isSelf = u.user_id === user?.id
                    const pageFriendly = getPageFriendlyName(u.current_page)
                    return (
                      <option key={u.user_id} value={u.user_id}>
                        {u.display_name} ({u.nivel}) — ativo em {pageFriendly} {isSelf ? '(Você)' : ''}
                      </option>
                    )
                  })}
                </select>
              </div>

              {/* Sound Effect Select */}
              <div className="space-y-1.5">
                <label className="text-[10px] font-black text-red-400 uppercase tracking-widest">Efeito de Áudio</label>
                <div className="space-y-1.5">
                  {SOUNDS.map(s => (
                    <div 
                      key={s.url}
                      onClick={() => setSelectedSound(s.url)}
                      className={`flex items-center justify-between p-2.5 rounded-lg border cursor-pointer transition-all ${
                        selectedSound === s.url
                          ? 'bg-red-950/20 border-red-600 text-red-400 font-bold shadow shadow-red-900/10'
                          : 'bg-zinc-900/50 border-zinc-800 text-zinc-400 hover:border-zinc-700'
                      }`}
                    >
                      <span className="truncate pr-2">{s.name}</span>
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation()
                          const audio = new Audio(s.url)
                          audio.volume = 0.5

                          // Se for risada2.mp3, tocar em loop exatamente uma vez (toca 2 vezes no total)
                          if (s.url.includes('risada2.mp3')) {
                            let loopedOnce = false
                            audio.addEventListener('ended', () => {
                              if (!loopedOnce) {
                                loopedOnce = true
                                audio.play().catch(() => {})
                              }
                            })
                          }

                          audio.play().catch(() => {})
                        }}
                        className="p-1.5 rounded bg-zinc-800 hover:bg-red-900/40 hover:text-white text-zinc-400 transition-all shrink-0"
                        title="Testar som"
                      >
                        <Volume2 size={13} />
                      </button>
                    </div>
                  ))}
                </div>
              </div>


              {/* Timer Select */}
              <div className="space-y-1.5 pt-1">
                <label className="text-[10px] font-black text-red-400 uppercase tracking-widest flex items-center gap-1">
                  <Clock size={11} className="text-red-500 shrink-0" />
                  Agendar Alerta (Timer Opcional)
                </label>
                <div className="grid grid-cols-4 gap-1.5">
                  {[
                    { label: 'Imediato', value: 0 },
                    { label: '10s', value: 10 },
                    { label: '30s', value: 30 },
                    { label: '60s', value: 60 },
                  ].map(opt => (
                    <button
                      key={opt.value}
                      type="button"
                      onClick={() => setDelaySeconds(opt.value)}
                      className={`py-2 text-[10px] font-black rounded-lg border uppercase transition-all ${
                        delaySeconds === opt.value
                          ? 'bg-red-950/40 border-red-600 text-red-400'
                          : 'bg-zinc-900/50 border-zinc-805 text-zinc-400 hover:border-zinc-700'
                      }`}
                    >
                      {opt.label}
                    </button>
                  ))}
                </div>
                {/* Custom delay input */}
                <div className="flex items-center gap-2 pt-1">
                  <span className="text-[9px] text-zinc-500 font-bold uppercase shrink-0">Personalizado (segundos):</span>
                  <input
                    type="number"
                    min="0"
                    max="600"
                    placeholder="Ex: 45"
                    value={delaySeconds > 0 && ![10, 30, 60].includes(delaySeconds) ? delaySeconds : ''}
                    onChange={e => {
                      const val = parseInt(e.target.value) || 0
                      setDelaySeconds(val < 0 ? 0 : val)
                    }}
                    className="w-full h-8 bg-zinc-900 border border-zinc-800 rounded-lg px-2 text-xs text-zinc-200 outline-none focus:border-red-600 font-mono"
                  />
                </div>
              </div>

              {/* Action Button */}
              <button
                type="button"
                onClick={handleFirePanic}
                disabled={firing || !targetUserId}
                className="w-full h-11 bg-gradient-to-r from-red-700 to-red-600 hover:from-red-600 hover:to-red-500 text-white font-black text-xs uppercase tracking-widest rounded-xl shadow-lg shadow-red-950/20 active:scale-98 transition-all disabled:opacity-40 disabled:pointer-events-none flex items-center justify-center gap-2"
              >
                <Volume2 className="w-4 h-4 shrink-0 animate-bounce" />
                Enviar Alerta
              </button>

            </CardContent>
          </Card>
        </div>
      )}



      {/* 👻 FLOATING TIMED JUMPSCARE COUNTDOWNS (EXCLUSIVELY FOR DEV) */}
      {profile?.nivel === 'DEV' && scheduledPanics.length > 0 && (
        <div className="fixed bottom-4 right-4 z-[9999] flex flex-col gap-2 max-w-xs w-full animate-in slide-in-from-bottom-5">
          {scheduledPanics.map(p => (
            <div key={p.id} className="bg-zinc-950/95 border border-red-900/50 rounded-2xl p-4 shadow-2xl shadow-red-950/25 text-zinc-100 flex items-center justify-between gap-4 backdrop-blur">
              <div className="flex items-center gap-2.5 min-w-0">
                <Volume2 className="w-5 h-5 text-red-500 animate-pulse shrink-0" />
                <div className="min-w-0">
                  <p className="text-[10px] font-black text-red-500 uppercase tracking-wider">Alerta Programado</p>
                  <p className="text-[10px] font-bold text-zinc-300 truncate">Destinatário: {p.targetName}</p>
                </div>
              </div>
              <div className="flex items-center gap-2.5 shrink-0">
                <span className="font-mono text-sm font-black text-red-500 bg-red-950/40 border border-red-900/30 w-9 h-9 rounded-xl flex items-center justify-center shadow-inner">
                  {p.secondsLeft}s
                </span>
                <button
                  onClick={() => handleCancelPanic(p.id)}
                  className="px-2 py-1.5 rounded-lg bg-zinc-900 hover:bg-red-900/40 text-[9px] font-black text-zinc-400 hover:text-white transition-all uppercase tracking-wider border border-zinc-800 hover:border-red-900/40"
                >
                  Cancelar
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

    </div>
  )
}
