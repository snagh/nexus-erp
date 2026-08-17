import { useState, useEffect, useMemo } from 'react'

import { supabase } from '../lib/supabase'
import { 
  Globe, 
  MapPin, 
  Building2, 
  FilterX,
  TrendingUp,
  PieChart as PieChartIcon,
  BarChart as BarChartIcon,
  Activity,
  Info,
  Calendar,
  Users,
  ShoppingCart,
  Truck,
  Clock,
  ClipboardList,
  DollarSign,
  Layers,
  Calculator,
  Loader2,
  RefreshCw
} from 'lucide-react'
import { useAuth } from '../AuthContext'
import { Card, CardContent, CardHeader, CardTitle } from '../components/ui/card'
import { Button } from '../components/ui/button'
import { 
  Select, 
  SelectContent, 
  SelectItem, 
  SelectTrigger, 
  SelectValue 
} from '../components/ui/select'
import { formatCurrency } from '../lib/utils'
import type { Tables } from '../supabaseTypes'
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip as RechartsTooltip, ResponsiveContainer,
  PieChart, Pie, Cell, AreaChart, Area
} from 'recharts'

type NotaWithEntidade = Tables<'notas'> & {
  entidades: Tables<'entidades'>
  assigned?: { display_name: string | null; email: string } | null
}

const COLORS = ['#3b82f6', '#10b981', '#f59e0b', '#ef4444', '#8b5cf6', '#06b6d4', '#ec4899']

export function Dashboard() {
  const { profile, isOP, isAdmin } = useAuth()
  const [data, setData] = useState<NotaWithEntidade[]>([])
  const [entidades, setEntidades] = useState<Tables<'entidades'>[]>([])
  const [loading, setLoading] = useState(true)

  // Novas listas e feeds operacionais para a chefia
  const [pledgeTimeFilter, setPledgeTimeFilter] = useState<'day' | 'week' | 'month'>('week')
  const [recentBaixas, setRecentBaixas] = useState<any[]>([])
  const [recentCompras, setRecentCompras] = useState<any[]>([])
  const [feedTab, setFeedTab] = useState<'baixas' | 'compras'>('baixas')
  const [totalBaixasCount, setTotalBaixasCount] = useState<number>(0)
  const [totalComprasCount, setTotalComprasCount] = useState<number>(0)
  const [baixasOffset, setBaixasOffset] = useState<number>(0)
  const [comprasOffset, setComprasOffset] = useState<number>(0)
  const [loadingMoreBaixas, setLoadingMoreBaixas] = useState<boolean>(false)
  const [loadingMoreCompras, setLoadingMoreCompras] = useState<boolean>(false)
  const [hasMoreBaixas, setHasMoreBaixas] = useState<boolean>(true)
  const [hasMoreCompras, setHasMoreCompras] = useState<boolean>(true)

  async function fetchMoreBaixas() {
    if (loadingMoreBaixas || !hasMoreBaixas) return
    setLoadingMoreBaixas(true)
    try {
      const { data: nextBaixas } = await supabase
        .from('historico_entregas')
        .select(`
          id,
          quantidade_entregue,
          created_at,
          numero_nf,
          vendedor:profiles(display_name, email),
          item:itens(descricao, nota:notas(numero_ne, emissor, entidades(nome))),
          item_ata:itens_ata(descricao, ata:atas(numero_arp, entidade:entidades(nome)))
        `)
        .order('created_at', { ascending: false })
        .range(baixasOffset, baixasOffset + 99)

      if (nextBaixas && nextBaixas.length > 0) {
        setRecentBaixas(prev => [...prev, ...nextBaixas])
        setBaixasOffset(prev => prev + nextBaixas.length)
        if (nextBaixas.length < 100) setHasMoreBaixas(false)
      } else {
        setHasMoreBaixas(false)
      }
    } finally {
      setLoadingMoreBaixas(false)
    }
  }

  async function fetchMoreCompras() {
    if (loadingMoreCompras || !hasMoreCompras) return
    setLoadingMoreCompras(true)
    try {
      const { data: nextCompras } = await supabase
        .from('pedidos_compra')
        .select(`
          id,
          quantidade_solicitada,
          created_at,
          status,
          usuario_solicitante,
          observacoes,
          item:itens(descricao, nota:notas(numero_ne, emissor, entidades(nome))),
          item_ata:itens_ata(descricao, ata:atas(numero_arp, entidade:entidades(nome)))
        `)
        .order('created_at', { ascending: false })
        .range(comprasOffset, comprasOffset + 99)

      if (nextCompras && nextCompras.length > 0) {
        setRecentCompras(prev => [...prev, ...nextCompras])
        setComprasOffset(prev => prev + nextCompras.length)
        if (nextCompras.length < 100) setHasMoreCompras(false)
      } else {
        setHasMoreCompras(false)
      }
    } finally {
      setLoadingMoreCompras(false)
    }
  }



  // Filtros
  const [regiao, setRegiao] = useState<string>('all')
  const [estado, setEstado] = useState<string>('all')
  const [municipio, setMunicipio] = useState<string>('all')
  const [cliente, setCliente] = useState<string>('all')
  const [selectedUser, setSelectedUser] = useState<string>('all')
  const [users, setUsers] = useState<any[]>([])

  useEffect(() => {
    if (profile?.id) {
      fetchDashboardData()
      supabase.from('profiles').select('id, display_name, email').then(({ data }) => {
        if (data) setUsers(data)
      })
    }
  }, [profile?.id])

  async function fetchDashboardData() {
    setLoading(true)
    try {
      let query = supabase
        .from('notas')
        .select('*, entidades(*), assigned:profiles!assigned_to(display_name, email)')
      
      if (isOP && profile?.id) {
        // Filtro estrito: Vê o que criou OU o que lhe foi atribuído
        query = query.or(`owner_id.eq.${profile.id},assigned_to.eq.${profile.id}`)
      }

      const { data: notas } = await query
      
      const { data: ents } = await supabase
        .from('entidades')
        .select('*')

      setData((notas as unknown as NotaWithEntidade[]) || [])
      setEntidades(ents || [])

      // Contadores totais dos feeds
      const { count: baixasCount } = await supabase.from('historico_entregas').select('id', { count: 'exact', head: true })
      const { count: comprasCount } = await supabase.from('pedidos_compra').select('id', { count: 'exact', head: true })
      setTotalBaixasCount(baixasCount || 0)
      setTotalComprasCount(comprasCount || 0)

      // Primeiras 100 baixas/entregas
      const { data: recentBaixasData } = await supabase
        .from('historico_entregas')
        .select(`
          id,
          quantidade_entregue,
          created_at,
          numero_nf,
          vendedor:profiles(display_name, email),
          item:itens(descricao, nota:notas(numero_ne, emissor, entidades(nome))),
          item_ata:itens_ata(descricao, ata:atas(numero_arp, entidade:entidades(nome)))
        `)
        .order('created_at', { ascending: false })
        .range(0, 99)

      // Primeiras 100 solicitações de compra
      const { data: recentComprasData } = await supabase
        .from('pedidos_compra')
        .select(`
          id,
          quantidade_solicitada,
          created_at,
          status,
          usuario_solicitante,
          observacoes,
          item:itens(descricao, nota:notas(numero_ne, emissor, entidades(nome))),
          item_ata:itens_ata(descricao, ata:atas(numero_arp, entidade:entidades(nome)))
        `)
        .order('created_at', { ascending: false })
        .range(0, 99)

      setRecentBaixas(recentBaixasData || [])
      setRecentCompras(recentComprasData || [])
      setBaixasOffset(recentBaixasData?.length || 0)
      setComprasOffset(recentComprasData?.length || 0)
      setHasMoreBaixas((recentBaixasData?.length || 0) >= 100)
      setHasMoreCompras((recentComprasData?.length || 0) >= 100)
    } finally {
      setLoading(false)
    }
  }

  // Lógica de Filtros em Cascata
  const filteredData = useMemo(() => {
    return data.filter(item => {
      const ent = item.entidades

      // Filtro por Usuário (Criador ou Atribuído)
      if (selectedUser !== 'all' && item.owner_id !== selectedUser && item.assigned_to !== selectedUser) {
        return false
      }

      // Filtro por Estado (UF): Verifica a entidade OU a UF nativa da nota
      if (estado !== 'all' && (!ent || ent.estado !== estado) && item.uf !== estado) {
        return false
      }

      const hasFilter = regiao !== 'all' || municipio !== 'all' || cliente !== 'all'
      if (!ent && hasFilter) return false
      if (!ent) return true 

      if (regiao !== 'all' && ent.regiao !== regiao) return false
      if (municipio !== 'all' && ent.municipio !== municipio) return false
      if (cliente !== 'all' && String(ent.id) !== cliente) return false
      return true
    })
  }, [data, regiao, estado, municipio, cliente, selectedUser])

  const filteredRecentPledges = useMemo(() => {
    const limit = new Date()
    if (pledgeTimeFilter === 'day') {
      limit.setHours(0, 0, 0, 0)
    } else if (pledgeTimeFilter === 'week') {
      const day = limit.getDay()
      limit.setDate(limit.getDate() - day)
      limit.setHours(0, 0, 0, 0)
    } else if (pledgeTimeFilter === 'month') {
      limit.setDate(1)
      limit.setHours(0, 0, 0, 0)
    }

    return filteredData
      .filter(n => {
        if (!n.created_at) return false
        return new Date(n.created_at) >= limit
      })
      .sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime())
  }, [filteredData, pledgeTimeFilter])

  const options = useMemo(() => {
    const r = Array.from(new Set((entidades || []).map(e => e.regiao).filter(Boolean))) as string[]
    const e = Array.from(new Set((entidades || []).filter(ent => regiao === 'all' || ent.regiao === regiao).map(ent => ent.estado).filter(Boolean))) as string[]
    const m = Array.from(new Set((entidades || []).filter(ent => (regiao === 'all' || ent.regiao === regiao) && (estado === 'all' || ent.estado === estado)).map(ent => ent.municipio).filter(Boolean))) as string[]
    const c = (entidades || []).filter(ent => 
        (regiao === 'all' || ent.regiao === regiao) && 
        (estado === 'all' || ent.estado === estado) &&
        (municipio === 'all' || ent.municipio === municipio)
    )

    return { regioes: r, estados: e, municipios: m, clientes: c }
  }, [entidades, regiao, estado, municipio])

  const totals = useMemo(() => {
    const financeiro = filteredData.reduce((acc, curr) => acc + (curr.valor_total_teto || 0), 0)
    const volume = filteredData.length
    const ticketMedio = volume > 0 ? financeiro / volume : 0
    return { financeiro, volume, ticketMedio }
  }, [filteredData])

  function resetFilters() {
    setRegiao('all')
    setEstado('all')
    setMunicipio('all')
    setCliente('all')
    setSelectedUser('all')
  }

  // --- Preparações de Dados para os Gráficos ---

  const formatStatusLabel = (status: string) => {
    if (!status) return 'Pendente'
    const cleaned = status.replace(/^_+/, '').replace(/_+/g, ' ')
    return cleaned.charAt(0).toUpperCase() + cleaned.slice(1).toLowerCase()
  }

  const chartDataClientes = useMemo(() => {
    const map = new Map<string, number>()
    let totalVal = 0
    filteredData.forEach(n => {
      const key = n.entidades?.nome || 'Sem Entidade'
      const val = n.valor_total_teto || 0
      map.set(key, (map.get(key) || 0) + val)
      totalVal += val
    })
    return Array.from(map.entries())
      .map(([name, value]) => ({ 
        name, 
        value,
        percent: totalVal > 0 ? (value / totalVal) * 100 : 0 
      }))
      .sort((a, b) => b.value - a.value)
      .slice(0, 5) // Top 5
  }, [filteredData])

  const chartDataRegiao = useMemo(() => {
    const map = new Map<string, number>()
    let totalVal = 0
    filteredData.forEach(n => {
      const key = n.entidades?.regiao || 'N/I'
      const val = n.valor_total_teto || 0
      map.set(key, (map.get(key) || 0) + val)
      totalVal += val
    })
    return Array.from(map.entries())
      .map(([name, value]) => ({ 
        name, 
        value,
        percent: totalVal > 0 ? (value / totalVal) * 100 : 0
      }))
      .filter(item => item.value > 0)
      .sort((a, b) => b.value - a.value)
  }, [filteredData])

  const chartDataStatus = useMemo(() => {
    const map = new Map<string, number>()
    filteredData.forEach(n => {
      const key = n.status_geral || 'Pendente'
      map.set(key, (map.get(key) || 0) + (n.valor_total_teto || 0))
    })
    return Array.from(map.entries())
      .map(([name, value]) => ({ 
        name: formatStatusLabel(name), 
        rawName: name, 
        value 
      }))
      .sort((a, b) => b.value - a.value)
  }, [filteredData])

  const chartDataEvolucao = useMemo(() => {
    const map = new Map<string, number>()
    filteredData.forEach(n => {
      if (!n.data_emissao) return
      const date = new Date(n.data_emissao)
      const key = `${String(date.getMonth() + 1).padStart(2, '0')}/${date.getFullYear()}`
      map.set(key, (map.get(key) || 0) + (n.valor_total_teto || 0))
    })
    return Array.from(map.entries())
      .map(([name, value]) => ({ name, value }))
      .sort((a, b) => {
        const [mA, yA] = a.name.split('/')
        const [mB, yB] = b.name.split('/')
        return new Date(Number(yA), Number(mA) - 1).getTime() - new Date(Number(yB), Number(mB) - 1).getTime()
      })
  }, [filteredData])

  // Custom Tooltip Formatter
  const CustomTooltip = ({ active, payload, label }: any) => {
    if (active && payload && payload.length) {
      return (
        <div className="bg-zinc-900 text-white p-3 rounded-xl shadow-xl border border-zinc-800">
          <p className="text-xs font-semibold text-zinc-300 mb-0.5">{label || payload[0].name}</p>
          <p className="text-sm font-bold text-white">
            {formatCurrency(payload[0].value)}
          </p>
        </div>
      )
    }
    return null
  }

  const hasActiveFilter = regiao !== 'all' || estado !== 'all' || municipio !== 'all' || cliente !== 'all' || selectedUser !== 'all'

  return (
    <div className="space-y-6 pb-12">
      {/* Header Limpo & Elegante */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-2 border-b border-zinc-200/70 dark:border-zinc-800/70">
        <div>
          <h1 className="text-xl sm:text-2xl font-bold tracking-tight text-zinc-900 dark:text-zinc-100">
            Visão Geral
          </h1>
          <p className="text-xs text-zinc-500 dark:text-zinc-400 mt-0.5">
            Acompanhamento financeiro de empenhos, movimentações e fluxo operacional.
          </p>
        </div>

        <div className="flex items-center gap-2">
          <div className="flex items-center gap-2.5 px-3 py-1.5 bg-white dark:bg-zinc-900 border border-zinc-200/80 dark:border-zinc-800 rounded-xl shadow-xs text-xs">
            <div className="w-6 h-6 rounded-lg bg-zinc-100 dark:bg-zinc-800 text-zinc-700 dark:text-zinc-300 font-bold flex items-center justify-center text-xs">
              {(profile?.display_name || profile?.email || 'U')[0].toUpperCase()}
            </div>
            <span className="font-semibold text-zinc-800 dark:text-zinc-200">
              {profile?.display_name || 'Usuário'}
            </span>
            <span className="text-[10px] text-zinc-400 font-mono uppercase bg-zinc-100 dark:bg-zinc-800 px-1.5 py-0.5 rounded font-semibold">
              {profile?.setor || 'Operacional'}
            </span>
          </div>
        </div>
      </div>

      {/* KPI Cards Limpos (Estilo Linear / Stripe) */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {/* KPI 1: Total sob Gestão */}
        <Card className="bg-white dark:bg-zinc-900 border border-zinc-200/80 dark:border-zinc-800 shadow-xs hover:border-zinc-300 dark:hover:border-zinc-700 transition-all rounded-xl">
          <CardContent className="p-4 space-y-2">
            <div className="flex items-center justify-between text-zinc-500">
              <span className="text-[11px] font-medium uppercase tracking-wider text-zinc-400">Total sob Gestão</span>
              <DollarSign className="w-4 h-4 text-zinc-400" />
            </div>
            <div>
              <div className="text-2xl font-bold text-zinc-900 dark:text-white tracking-tight font-mono">
                {formatCurrency(totals.financeiro)}
              </div>
              <p className="text-[11px] text-zinc-500 mt-1 font-normal">
                Volume financeiro total empenhado
              </p>
            </div>
          </CardContent>
        </Card>

        {/* KPI 2: Volume de Empenhos */}
        <Card className="bg-white dark:bg-zinc-900 border border-zinc-200/80 dark:border-zinc-800 shadow-xs hover:border-zinc-300 dark:hover:border-zinc-700 transition-all rounded-xl">
          <CardContent className="p-4 space-y-2">
            <div className="flex items-center justify-between text-zinc-500">
              <span className="text-[11px] font-medium uppercase tracking-wider text-zinc-400">Volume de Empenhos</span>
              <Layers className="w-4 h-4 text-zinc-400" />
            </div>
            <div>
              <div className="text-2xl font-bold text-zinc-900 dark:text-white tracking-tight font-mono">
                {totals.volume} <span className="text-xs font-normal text-zinc-400">documentos</span>
              </div>
              <p className="text-[11px] text-zinc-500 mt-1 font-normal">
                Notas de empenho e ordens registradas
              </p>
            </div>
          </CardContent>
        </Card>

        {/* KPI 3: Ticket Médio */}
        <Card className="bg-white dark:bg-zinc-900 border border-zinc-200/80 dark:border-zinc-800 shadow-xs hover:border-zinc-300 dark:hover:border-zinc-700 transition-all rounded-xl">
          <CardContent className="p-4 space-y-2">
            <div className="flex items-center justify-between text-zinc-500">
              <span className="text-[11px] font-medium uppercase tracking-wider text-zinc-400">Ticket Médio</span>
              <Calculator className="w-4 h-4 text-zinc-400" />
            </div>
            <div>
              <div className="text-2xl font-bold text-zinc-900 dark:text-white tracking-tight font-mono">
                {formatCurrency(totals.ticketMedio)}
              </div>
              <p className="text-[11px] text-zinc-500 mt-1 font-normal">
                Média financeira por documento
              </p>
            </div>
          </CardContent>
        </Card>

        {/* KPI 4: Atividades Operacionais */}
        <Card className="bg-white dark:bg-zinc-900 border border-zinc-200/80 dark:border-zinc-800 shadow-xs hover:border-zinc-300 dark:hover:border-zinc-700 transition-all rounded-xl">
          <CardContent className="p-4 space-y-2">
            <div className="flex items-center justify-between text-zinc-500">
              <span className="text-[11px] font-medium uppercase tracking-wider text-zinc-400">Atividades Recentes</span>
              <Activity className="w-4 h-4 text-zinc-400" />
            </div>
            <div>
              <div className="text-2xl font-bold text-zinc-900 dark:text-white tracking-tight font-mono">
                {recentBaixas.length + recentCompras.length} <span className="text-xs font-normal text-zinc-400">ações</span>
              </div>
              <p className="text-[11px] text-zinc-500 mt-1 font-normal">
                {recentBaixas.length} baixas • {recentCompras.length} solicitações
              </p>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Barra de Filtros Territorial */}
      <div className="bg-white dark:bg-zinc-900 p-4 rounded-xl border border-zinc-200/80 dark:border-zinc-800 shadow-xs flex flex-col md:flex-row gap-4 items-stretch md:items-end">
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-3 flex-1">
          <div className="space-y-1">
            <label className="text-[10px] font-bold uppercase text-zinc-400 flex items-center gap-1 tracking-wider">
              <Globe className="w-3.5 h-3.5 text-zinc-400" /> Região
            </label>
            <Select value={regiao} onValueChange={(v) => { setRegiao(v); setEstado('all'); setMunicipio('all'); setCliente('all'); }}>
              <SelectTrigger className="h-9 text-xs rounded-lg border-zinc-200 dark:border-zinc-700"><SelectValue placeholder="Todas as Regiões" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all" className="font-semibold">Todas as Regiões</SelectItem>
                {options.regioes.map(r => <SelectItem key={r} value={r}>{r}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-1">
            <label className="text-[10px] font-bold uppercase text-zinc-400 flex items-center gap-1 tracking-wider">
              <MapPin className="w-3.5 h-3.5 text-zinc-400" /> Estado (UF)
            </label>
            <Select value={estado} onValueChange={(v) => { setEstado(v); setMunicipio('all'); setCliente('all'); }}>
              <SelectTrigger className="h-9 text-xs rounded-lg border-zinc-200 dark:border-zinc-700"><SelectValue placeholder="Todos os Estados" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all" className="font-semibold">Todos os Estados</SelectItem>
                {options.estados.map(e => <SelectItem key={e} value={e}>{e}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-1">
            <label className="text-[10px] font-bold uppercase text-zinc-400 flex items-center gap-1 tracking-wider">
              <Building2 className="w-3.5 h-3.5 text-zinc-400" /> Município
            </label>
            <Select value={municipio} onValueChange={(v) => { setMunicipio(v); setCliente('all'); }}>
              <SelectTrigger className="h-9 text-xs rounded-lg border-zinc-200 dark:border-zinc-700"><SelectValue placeholder="Todos os Municípios" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all" className="font-semibold">Todos os Municípios</SelectItem>
                {options.municipios.map(m => <SelectItem key={m} value={m}>{m}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-1">
            <label className="text-[10px] font-bold uppercase text-zinc-400 flex items-center gap-1 tracking-wider">
              <Building2 className="w-3.5 h-3.5 text-zinc-400" /> Cliente / Órgão
            </label>
            <Select value={cliente} onValueChange={setCliente}>
              <SelectTrigger className="h-9 text-xs rounded-lg border-zinc-200 dark:border-zinc-700"><SelectValue placeholder="Todos os Clientes" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all" className="font-semibold">Todos os Clientes</SelectItem>
                {options.clientes.map(c => <SelectItem key={c.id} value={String(c.id)}>{c.nome}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-1">
            <label className="text-[10px] font-bold uppercase text-zinc-400 flex items-center gap-1 tracking-wider">
              <Users className="w-3.5 h-3.5 text-zinc-400" /> Responsável
            </label>
            <Select 
              value={selectedUser} 
              onValueChange={setSelectedUser}
              disabled={isOP && !isAdmin}
            >
              <SelectTrigger className="h-9 text-xs rounded-lg border-zinc-200 dark:border-zinc-700">
                <SelectValue placeholder={(isOP && !isAdmin) ? 'Apenas Minhas Demandas' : 'Todos os usuários'} />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all" className="font-semibold">
                  {(isOP && !isAdmin) ? 'Apenas Minhas Demandas' : 'Todos os usuários'}
                </SelectItem>
                {!(isOP && !isAdmin) && users.map(u => (
                  <SelectItem key={u.id} value={u.id}>
                    {u.display_name || u.email}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>

        {hasActiveFilter && (
          <Button 
            variant="ghost" 
            onClick={resetFilters} 
            className="h-9 px-3 text-xs font-medium gap-1.5 text-zinc-500 hover:text-rose-600 dark:hover:text-rose-400 rounded-lg shrink-0 transition-colors"
          >
             <FilterX className="w-3.5 h-3.5" /> Limpar Filtros
          </Button>
        )}
      </div>

      {loading ? (
        <div className="h-64 flex flex-col items-center justify-center animate-pulse text-zinc-400 gap-3">
          <Activity className="w-6 h-6 text-zinc-400 animate-spin" />
          <span className="text-xs font-medium uppercase tracking-wider">Carregando indicadores...</span>
        </div>
      ) : (
        <div className="space-y-6">
          
          {/* Gráfico 1: Evolução Financeira */}
          <Card className="bg-white dark:bg-zinc-900 border-zinc-200/80 dark:border-zinc-800 shadow-xs rounded-xl overflow-hidden">
            <CardHeader className="flex flex-row items-center justify-between pb-2 border-b border-zinc-100 dark:border-zinc-800/60">
              <div className="space-y-0.5">
                <CardTitle className="text-sm font-bold flex items-center gap-2 text-zinc-900 dark:text-white">
                  <Activity className="w-4 h-4 text-blue-500" /> Evolução de Empenhos
                  <div className="relative group flex items-center ml-1">
                    <Info className="w-3.5 h-3.5 text-zinc-400 cursor-help hover:text-zinc-600 dark:hover:text-zinc-300 transition-colors" />
                    <div className="absolute left-0 top-full mt-1.5 hidden group-hover:block w-52 p-2.5 bg-zinc-900 text-[10px] text-zinc-200 rounded-lg shadow-xl z-[100] font-normal text-center pointer-events-none border border-zinc-800">
                      Mostra o volume financeiro acumulado de empenhos emitidos ao longo dos meses.
                    </div>
                  </div>
                </CardTitle>
                <p className="text-xs text-zinc-500 font-normal">Volume financeiro de emissões ao longo do tempo</p>
              </div>
              <div className="text-right">
                <p className="text-xl font-bold text-zinc-900 dark:text-zinc-100 font-mono">{formatCurrency(totals.financeiro)}</p>
                <p className="text-[10px] text-zinc-400 font-medium uppercase tracking-wider">Total sob Gestão</p>
              </div>
            </CardHeader>
            <CardContent className="pt-6">
              <div className="h-[280px] min-h-[280px] w-full relative">
                {chartDataEvolucao.length > 0 ? (
                  <ResponsiveContainer width="100%" height={280} key={`evolucao-${data.length}`}>
                    <AreaChart data={chartDataEvolucao} margin={{ top: 10, right: 10, left: 0, bottom: 0 }}>
                      <defs>
                        <linearGradient id="colorValor" x1="0" y1="0" x2="0" y2="1">
                          <stop offset="5%" stopColor="#3b82f6" stopOpacity={0.3}/>
                          <stop offset="95%" stopColor="#3b82f6" stopOpacity={0}/>
                        </linearGradient>
                      </defs>
                      <XAxis dataKey="name" axisLine={false} tickLine={false} tick={{ fontSize: 11, fill: '#888' }} dy={10} />
                      <YAxis axisLine={false} tickLine={false} tick={{ fontSize: 11, fill: '#888' }} tickFormatter={(value: number) => `R$ ${(value / 1000).toFixed(0)}k`} />
                      <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#e5e7eb" opacity={0.5} />
                      <RechartsTooltip content={<CustomTooltip />} />
                      <Area type="monotone" dataKey="value" stroke="#3b82f6" strokeWidth={2.5} fillOpacity={1} fill="url(#colorValor)" />
                    </AreaChart>
                  </ResponsiveContainer>
                ) : (
                  <div className="h-full flex items-center justify-center text-zinc-400 text-xs italic">Dados insuficientes para gerar a evolução</div>
                )}
              </div>
            </CardContent>
          </Card>

          {/* Grid de 3 Colunas: Top 5 Clientes, Por Região, Eficiência Operacional */}
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            
            {/* Card 1: Top 5 Clientes */}
            <Card className="bg-white dark:bg-zinc-900 border-zinc-200/80 dark:border-zinc-800 shadow-xs rounded-xl overflow-hidden flex flex-col h-[340px]">
              <CardHeader className="pb-3 border-b border-zinc-100 dark:border-zinc-800/60 shrink-0">
                <CardTitle className="text-sm font-bold flex items-center justify-between gap-2 text-zinc-900 dark:text-white">
                  <div className="flex items-center gap-2">
                    <BarChartIcon className="w-4 h-4 text-emerald-500" /> Top 5 Clientes
                  </div>
                  <div className="relative group flex items-center">
                    <Info className="w-3.5 h-3.5 text-zinc-400 cursor-help hover:text-zinc-600 transition-colors" />
                    <div className="absolute right-0 top-full mt-1.5 hidden group-hover:block w-48 p-2 bg-zinc-900 text-[10px] text-zinc-200 rounded-lg shadow-xl z-[100] font-normal text-center pointer-events-none border border-zinc-800">
                      Ranqueamento dos 5 clientes com o maior volume financeiro alocado.
                    </div>
                  </div>
                </CardTitle>
                <p className="text-xs text-zinc-500 font-normal">Maiores volumes financeiros empenhados</p>
              </CardHeader>
              <CardContent className="pt-3 flex-1 overflow-y-auto scrollbar-thin">
                 {chartDataClientes.length > 0 ? (
                    <div className="space-y-3">
                      {chartDataClientes.map((c, index) => (
                        <div key={c.name} className="space-y-1">
                          <div className="flex items-center justify-between text-xs">
                            <div className="flex items-center gap-2 min-w-0 pr-2">
                              <span className="w-4 text-[10px] font-bold text-zinc-400 shrink-0">{index + 1}º</span>
                              <span className="font-semibold text-zinc-800 dark:text-zinc-200 truncate" title={c.name}>
                                {c.name}
                              </span>
                            </div>
                            <span className="font-mono font-bold text-zinc-900 dark:text-zinc-100 shrink-0 text-xs">
                              {formatCurrency(c.value)}
                            </span>
                          </div>
                          <div className="w-full h-2 bg-zinc-100 dark:bg-zinc-800 rounded-full overflow-hidden">
                            <div 
                              className="h-full rounded-full transition-all duration-500" 
                              style={{ 
                                width: `${Math.max(c.percent, 3)}%`,
                                backgroundColor: COLORS[index % COLORS.length]
                              }} 
                            />
                          </div>
                        </div>
                      ))}
                    </div>
                 ) : (
                    <div className="h-full flex items-center justify-center text-zinc-400 text-xs italic">Nenhum dado</div>
                 )}
              </CardContent>
            </Card>

            {/* Card 2: Por Região */}
            <Card className="bg-white dark:bg-zinc-900 border-zinc-200/80 dark:border-zinc-800 shadow-xs rounded-xl overflow-hidden flex flex-col h-[340px]">
              <CardHeader className="pb-3 border-b border-zinc-100 dark:border-zinc-800/60 shrink-0">
                <CardTitle className="text-sm font-bold flex items-center justify-between gap-2 text-zinc-900 dark:text-white">
                  <div className="flex items-center gap-2">
                    <PieChartIcon className="w-4 h-4 text-amber-500" /> Por Região
                  </div>
                  <div className="relative group flex items-center">
                    <Info className="w-3.5 h-3.5 text-zinc-400 cursor-help hover:text-zinc-600 transition-colors" />
                    <div className="absolute right-0 top-full mt-1.5 hidden group-hover:block w-48 p-2 bg-zinc-900 text-[10px] text-zinc-200 rounded-lg shadow-xl z-[100] font-normal text-center pointer-events-none border border-zinc-800">
                      Distribuição do valor financeiro dividida por região geográfica.
                    </div>
                  </div>
                </CardTitle>
                <p className="text-xs text-zinc-500 font-normal">Alocação geográfica dos recursos</p>
              </CardHeader>
              <CardContent className="pt-3 flex-1 flex flex-col sm:flex-row items-center justify-between gap-2 overflow-hidden">
                 {chartDataRegiao.length > 0 ? (
                    <>
                      <div className="w-36 h-36 relative shrink-0">
                        <ResponsiveContainer width="100%" height="100%">
                          <PieChart>
                            <Pie
                              data={chartDataRegiao}
                              cx="50%"
                              cy="50%"
                              innerRadius={38}
                              outerRadius={58}
                              paddingAngle={3}
                              dataKey="value"
                              stroke="none"
                            >
                              {chartDataRegiao.map((_, index) => (
                                <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                              ))}
                            </Pie>
                            <RechartsTooltip content={<CustomTooltip />} />
                          </PieChart>
                        </ResponsiveContainer>
                      </div>

                      <div className="flex-1 w-full space-y-2 overflow-y-auto max-h-[230px] scrollbar-thin pr-1">
                        {chartDataRegiao.map((item, index) => (
                          <div key={item.name} className="flex items-center justify-between text-xs">
                            <div className="flex items-center gap-2 min-w-0 pr-1">
                              <span className="w-2.5 h-2.5 rounded-full shrink-0" style={{ backgroundColor: COLORS[index % COLORS.length] }} />
                              <span className="font-semibold text-zinc-700 dark:text-zinc-300 truncate">{item.name}</span>
                            </div>
                            <div className="text-right shrink-0">
                              <span className="font-mono font-bold text-zinc-900 dark:text-zinc-100 text-xs block">
                                {formatCurrency(item.value)}
                              </span>
                              <span className="text-[10px] text-zinc-400">{item.percent.toFixed(1)}%</span>
                            </div>
                          </div>
                        ))}
                      </div>
                    </>
                 ) : (
                    <div className="h-full w-full flex items-center justify-center text-zinc-400 text-xs italic">Nenhum dado</div>
                 )}
              </CardContent>
            </Card>

            {/* Card 3: Eficiência Operacional */}
            <Card className="bg-white dark:bg-zinc-900 border-zinc-200/80 dark:border-zinc-800 shadow-xs rounded-xl overflow-hidden flex flex-col h-[340px]">
              <CardHeader className="pb-3 border-b border-zinc-100 dark:border-zinc-800/60 shrink-0">
                <CardTitle className="text-sm font-bold flex items-center justify-between gap-2 text-zinc-900 dark:text-white">
                  <div className="flex items-center gap-2">
                    <TrendingUp className="w-4 h-4 text-purple-500" /> Eficiência Operacional
                  </div>
                  <div className="relative group flex items-center">
                    <Info className="w-3.5 h-3.5 text-zinc-400 cursor-help hover:text-zinc-600 transition-colors" />
                    <div className="absolute right-0 top-full mt-1.5 hidden group-hover:block w-48 p-2 bg-zinc-900 text-[10px] text-zinc-200 rounded-lg shadow-xl z-[100] font-normal text-center pointer-events-none border border-zinc-800">
                      Mede a quantidade de recursos alocada em cada status operacional.
                    </div>
                  </div>
                </CardTitle>
                <p className="text-xs text-zinc-500 font-normal">Recursos por status de processo</p>
              </CardHeader>
              <CardContent className="pt-4 flex-1 overflow-hidden">
                 {chartDataStatus.length > 0 ? (
                    <ResponsiveContainer width="100%" height={230}>
                      <BarChart data={chartDataStatus} margin={{ top: 15, right: 10, left: 0, bottom: 20 }}>
                        <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#e5e7eb" opacity={0.5} />
                        <XAxis 
                          dataKey="name" 
                          axisLine={false} 
                          tickLine={false} 
                          tick={{ fontSize: 11, fill: '#666', fontWeight: 600 }} 
                          interval={0} 
                          dy={5}
                        />
                        <YAxis 
                          axisLine={false} 
                          tickLine={false} 
                          tick={{ fontSize: 10, fill: '#888' }} 
                          tickFormatter={(value: number) => `R$ ${(value / 1000).toFixed(0)}k`} 
                        />
                        <RechartsTooltip content={<CustomTooltip />} cursor={{ fill: 'rgba(0,0,0,0.03)' }} />
                        <Bar dataKey="value" fill="#8b5cf6" radius={[6, 6, 0, 0]} barSize={28} />
                      </BarChart>
                    </ResponsiveContainer>
                 ) : (
                    <div className="h-full flex items-center justify-center text-zinc-400 text-xs italic">Nenhum dado</div>
                 )}
              </CardContent>
            </Card>

          </div>

          {/* PAINEL DE ACOMPANHAMENTO OPERACIONAL */}
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            {/* Coluna 1 e 2: Lista de Empenhos Cadastrados */}
            <Card className="bg-white dark:bg-zinc-900 border-zinc-200/80 dark:border-zinc-800 shadow-xs lg:col-span-2 flex flex-col h-[480px] rounded-xl overflow-hidden">
              <CardHeader className="flex flex-row items-center justify-between pb-3 border-b border-zinc-100 dark:border-zinc-800/60 shrink-0">
                <div className="space-y-0.5">
                  <CardTitle className="text-sm font-bold flex items-center gap-2 text-zinc-900 dark:text-white">
                    <Calendar className="w-4 h-4 text-blue-500" />
                    Empenhos Recentes no Período
                  </CardTitle>
                  <p className="text-xs text-zinc-500 font-normal">Últimos empenhos inseridos no sistema</p>
                </div>
                {/* Filtros de tempo */}
                <div className="flex bg-zinc-100 dark:bg-zinc-800 p-0.5 rounded-lg border border-zinc-200/60 dark:border-zinc-700/60">
                  <button 
                    onClick={() => setPledgeTimeFilter('day')}
                    className={`px-2.5 py-1 text-[10px] font-semibold uppercase rounded transition-all ${pledgeTimeFilter === 'day' ? 'bg-white dark:bg-zinc-900 shadow-xs text-zinc-900 dark:text-zinc-100' : 'text-zinc-500 hover:text-zinc-800 dark:hover:text-zinc-200'}`}
                  >
                    Dia
                  </button>
                  <button 
                    onClick={() => setPledgeTimeFilter('week')}
                    className={`px-2.5 py-1 text-[10px] font-semibold uppercase rounded transition-all ${pledgeTimeFilter === 'week' ? 'bg-white dark:bg-zinc-900 shadow-xs text-zinc-900 dark:text-zinc-100' : 'text-zinc-500 hover:text-zinc-800 dark:hover:text-zinc-200'}`}
                  >
                    Semana
                  </button>
                  <button 
                    onClick={() => setPledgeTimeFilter('month')}
                    className={`px-2.5 py-1 text-[10px] font-semibold uppercase rounded transition-all ${pledgeTimeFilter === 'month' ? 'bg-white dark:bg-zinc-900 shadow-xs text-zinc-900 dark:text-zinc-100' : 'text-zinc-500 hover:text-zinc-800 dark:hover:text-zinc-200'}`}
                  >
                    Mês
                  </button>
                </div>
              </CardHeader>
              <CardContent className="flex-1 overflow-y-auto p-0 scrollbar-thin">
                {filteredRecentPledges.length === 0 ? (
                  <div className="h-full flex flex-col items-center justify-center text-zinc-400 text-xs italic gap-2 p-6">
                    <ClipboardList className="w-7 h-7 text-zinc-300 dark:text-zinc-700" />
                    Nenhum empenho cadastrado neste período.
                  </div>
                ) : (
                  <div className="divide-y divide-zinc-100 dark:divide-zinc-800/60">
                    {filteredRecentPledges.map((emp) => {
                      const clientName = emp.entidades?.nome || emp.emissor || 'Sem Cliente'
                      return (
                        <div key={emp.id} className="p-3.5 flex items-center justify-between hover:bg-zinc-50/60 dark:hover:bg-zinc-800/30 transition-colors">
                          <div className="min-w-0 flex-1 pr-4">
                            <div className="flex items-center gap-2 mb-0.5">
                              <span className="text-xs font-bold text-zinc-900 dark:text-zinc-100">
                                NE: {emp.numero_ne}
                              </span>
                              <span className="text-[9px] bg-zinc-100 dark:bg-zinc-800 text-zinc-600 dark:text-zinc-300 px-2 py-0.5 rounded font-semibold uppercase tracking-wider">
                                {emp.status_geral || 'PENDENTE'}
                              </span>
                            </div>
                            <p className="text-[10px] text-zinc-500 font-medium truncate uppercase" title={clientName}>
                              {clientName}
                            </p>
                            <p className="text-[9px] text-zinc-400 mt-0.5 font-normal">
                              Cadastrado em: {new Date(emp.created_at).toLocaleDateString('pt-BR')} às {new Date(emp.created_at).toLocaleTimeString('pt-BR', {hour: '2-digit', minute:'2-digit'})}
                              {emp.assigned?.display_name && ` • Atribuído a: ${emp.assigned.display_name}`}
                            </p>
                          </div>
                          <div className="text-right flex-shrink-0">
                            <span className="text-xs font-bold text-zinc-900 dark:text-zinc-100 font-mono">
                              {formatCurrency(emp.valor_total_teto || 0)}
                            </span>
                          </div>
                        </div>
                      )
                    })}
                  </div>
                )}
              </CardContent>
            </Card>

            {/* Coluna 3: Feed Operacional (Baixas / Compras) */}
            <Card className="bg-white dark:bg-zinc-900 border-zinc-200/80 dark:border-zinc-800 shadow-xs flex flex-col h-[480px] rounded-xl overflow-hidden">
              <CardHeader className="flex flex-col pb-3 border-b border-zinc-100 dark:border-zinc-800/60 shrink-0 gap-2">
                <CardTitle className="text-sm font-bold flex items-center gap-2 text-zinc-900 dark:text-white">
                  <Clock className="w-4 h-4 text-purple-500" />
                  Feed de Atividades
                </CardTitle>
                {/* Abas do Feed */}
                <div className="flex bg-zinc-100 dark:bg-zinc-800 p-0.5 rounded-lg border border-zinc-200/60 dark:border-zinc-700/60 w-full">
                  <button 
                    onClick={() => setFeedTab('baixas')}
                    className={`flex-1 py-1 text-[10px] font-semibold uppercase rounded transition-all flex items-center justify-center gap-1.5 ${feedTab === 'baixas' ? 'bg-white dark:bg-zinc-900 shadow-xs text-zinc-900 dark:text-zinc-100' : 'text-zinc-500 hover:text-zinc-800 dark:hover:text-zinc-200'}`}
                  >
                    <Truck className="w-3.5 h-3.5" />
                    Baixas ({totalBaixasCount > 0 ? totalBaixasCount.toLocaleString('pt-BR') : recentBaixas.length})
                  </button>
                  <button 
                    onClick={() => setFeedTab('compras')}
                    className={`flex-1 py-1 text-[10px] font-semibold uppercase rounded transition-all flex items-center justify-center gap-1.5 ${feedTab === 'compras' ? 'bg-white dark:bg-zinc-900 shadow-xs text-zinc-900 dark:text-zinc-100' : 'text-zinc-500 hover:text-zinc-800 dark:hover:text-zinc-200'}`}
                  >
                    <ShoppingCart className="w-3.5 h-3.5" />
                    Compras ({totalComprasCount > 0 ? totalComprasCount.toLocaleString('pt-BR') : recentCompras.length})
                  </button>
                </div>
              </CardHeader>

              <CardContent className="flex-1 overflow-y-auto p-4 scrollbar-thin">
                {feedTab === 'baixas' ? (
                  recentBaixas.length === 0 ? (
                    <div className="h-full flex flex-col items-center justify-center text-zinc-400 text-xs italic gap-2 py-8">
                      <Truck className="w-7 h-7 text-zinc-300 dark:text-zinc-700" />
                      Nenhuma baixa realizada recentemente.
                    </div>
                  ) : (
                    <div className="space-y-4">
                      <div className="relative border-l border-zinc-200 dark:border-zinc-800 ml-2 space-y-4">
                        {recentBaixas.map((baixa) => {
                          const itemDesc = baixa.item?.descricao || baixa.item_ata?.descricao || 'Produto'
                          const docOrigem = baixa.item?.nota?.numero_ne ? `NE ${baixa.item.nota.numero_ne}` : (baixa.item_ata?.ata?.numero_arp ? `ARP ${baixa.item_ata.ata.numero_arp}` : '—')
                          const clientName = baixa.item?.nota?.entidades?.nome || baixa.item_ata?.ata?.entidade?.nome || '—'
                          const executor = baixa.vendedor?.display_name || 'Sistema'
                          
                          return (
                            <div key={baixa.id} className="relative pl-5">
                              {/* Dot indicador */}
                              <span className="absolute -left-[5px] top-1 flex h-2.5 w-2.5 items-center justify-center rounded-full bg-zinc-400 dark:bg-zinc-600 ring-4 ring-white dark:ring-zinc-900">
                                <span className="h-1 w-1 rounded-full bg-white dark:bg-zinc-900" />
                              </span>
                              <div className="space-y-0.5">
                                <div className="flex items-center gap-1.5">
                                  <span className="text-[10px] font-bold text-zinc-800 dark:text-zinc-200 uppercase">
                                    {executor}
                                  </span>
                                  <span className="text-[9px] text-zinc-400 font-normal">
                                    {new Date(baixa.created_at).toLocaleDateString('pt-BR')} às {new Date(baixa.created_at).toLocaleTimeString('pt-BR', {hour: '2-digit', minute:'2-digit'})}
                                  </span>
                                </div>
                                <p className="text-[10px] text-zinc-600 dark:text-zinc-400 font-normal line-clamp-2">
                                  Baixou <strong className="text-zinc-900 dark:text-zinc-100 font-bold">{baixa.quantidade_entregue} und</strong> do item <span className="font-medium text-zinc-900 dark:text-zinc-100">{itemDesc}</span>.
                                </p>
                                <div className="flex flex-wrap items-center gap-1 text-[8.5px] text-zinc-400 mt-1 font-medium uppercase">
                                  <span>{docOrigem}</span>
                                  {clientName && clientName !== '—' && (
                                    <>
                                      <span>•</span>
                                      <span className="truncate max-w-[120px]">{clientName}</span>
                                    </>
                                  )}
                                  {baixa.numero_nf && (() => {
                                    const numUpper = String(baixa.numero_nf).toUpperCase()
                                    const isPedido = numUpper.includes('PEDIDO') || numUpper.includes('DAV') || numUpper.includes('PROVISÓRIA') || numUpper.includes('PROVISORIA')
                                    return (
                                      <>
                                        <span>•</span>
                                        <span className="text-zinc-600 dark:text-zinc-400 font-semibold">
                                          {isPedido ? baixa.numero_nf : `NF: ${baixa.numero_nf}`}
                                        </span>
                                      </>
                                    )
                                  })()}
                                </div>
                              </div>
                            </div>
                          )
                        })}
                      </div>

                      {hasMoreBaixas && (
                        <button
                          onClick={fetchMoreBaixas}
                          disabled={loadingMoreBaixas}
                          className="w-full py-2 text-[10px] font-bold text-zinc-600 dark:text-zinc-400 hover:text-zinc-900 dark:hover:text-white bg-zinc-50 dark:bg-zinc-900/50 hover:bg-zinc-100 dark:hover:bg-zinc-800 border border-zinc-200 dark:border-zinc-800 rounded-xl transition-all flex items-center justify-center gap-1.5 uppercase shadow-xs"
                        >
                          {loadingMoreBaixas ? <Loader2 className="w-3.5 h-3.5 animate-spin text-brand-accent" /> : <RefreshCw className="w-3.5 h-3.5 text-zinc-400" />}
                          Carregar mais baixas ({recentBaixas.length} de {totalBaixasCount.toLocaleString('pt-BR')})
                        </button>
                      )}
                    </div>
                  )
                ) : (
                  recentCompras.length === 0 ? (
                    <div className="h-full flex flex-col items-center justify-center text-zinc-400 text-xs italic gap-2 py-8">
                      <ShoppingCart className="w-7 h-7 text-zinc-300 dark:text-zinc-700" />
                      Nenhuma solicitação de compra recente.
                    </div>
                  ) : (
                    <div className="space-y-4">
                      <div className="relative border-l border-zinc-200 dark:border-zinc-800 ml-2 space-y-4">
                        {recentCompras.map((compra) => {
                          let itemDesc = compra.item?.descricao || compra.item_ata?.descricao
                          if (!itemDesc && compra.observacoes) {
                            try {
                              const obs = typeof compra.observacoes === 'string' ? JSON.parse(compra.observacoes) : compra.observacoes
                              if (obs?.descricao) itemDesc = obs.descricao
                            } catch (e) {}
                          }
                          if (!itemDesc) itemDesc = 'Produto não especificado'

                          let docOrigem = compra.item?.nota?.numero_ne ? `NE ${compra.item.nota.numero_ne}` : (compra.item_ata?.ata?.numero_arp ? `ARP ${compra.item_ata.ata.numero_arp}` : null)
                          if (!docOrigem && compra.observacoes) {
                            try {
                              const obs = typeof compra.observacoes === 'string' ? JSON.parse(compra.observacoes) : compra.observacoes
                              if (obs?.documento_origem) docOrigem = `DOC ${obs.documento_origem}`
                            } catch (e) {}
                          }
                          if (!docOrigem) docOrigem = 'COMPRA DIRETA'

                          const requester = (compra.usuario_solicitante || 'Sistema').split('@')[0]
                          const statusColors: any = {
                            'PENDENTE': 'bg-zinc-100 text-zinc-600 dark:bg-zinc-800 dark:text-zinc-400',
                            'COTACAO': 'bg-amber-50 text-amber-700 dark:bg-amber-950/40 dark:text-amber-350',
                            'COMPRADO': 'bg-emerald-50 text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-350',
                            'FALHA': 'bg-rose-50 text-rose-700 dark:bg-rose-950/40 dark:text-rose-350',
                            'CORRECAO': 'bg-amber-100 text-amber-900 dark:bg-amber-950 dark:text-amber-250 border-amber-300'
                          }
                          const statusClass = statusColors[compra.status] || 'bg-zinc-100 text-zinc-600'
                          
                          return (
                            <div key={compra.id} className="relative pl-5">
                              {/* Dot indicador */}
                              <span className="absolute -left-[5px] top-1 flex h-2.5 w-2.5 items-center justify-center rounded-full bg-zinc-400 dark:bg-zinc-600 ring-4 ring-white dark:ring-zinc-900">
                                <span className="h-1 w-1 rounded-full bg-white dark:bg-zinc-900" />
                              </span>
                              <div className="space-y-0.5">
                                <div className="flex items-center justify-between">
                                  <div className="flex items-center gap-1.5">
                                    <span className="text-[10px] font-bold text-zinc-800 dark:text-zinc-200 uppercase">
                                      {requester}
                                    </span>
                                    <span className="text-[9px] text-zinc-400 font-normal">
                                      {new Date(compra.created_at).toLocaleDateString('pt-BR')} às {new Date(compra.created_at).toLocaleTimeString('pt-BR', {hour: '2-digit', minute:'2-digit'})}
                                    </span>
                                  </div>
                                  <span className={`text-[7.5px] px-1.5 py-0.5 rounded font-bold uppercase tracking-wide border ${statusClass}`}>
                                    {compra.status || 'PENDENTE'}
                                  </span>
                                </div>
                                <p className="text-[10px] text-zinc-600 dark:text-zinc-400 font-normal line-clamp-2">
                                  Solicitou <strong className="text-zinc-900 dark:text-zinc-100 font-bold">{compra.quantidade_solicitada} und</strong> de <span className="font-semibold text-zinc-900 dark:text-zinc-100">{itemDesc}</span>.
                                </p>
                                <div className="flex items-center gap-1 text-[8.5px] text-zinc-400 mt-1 font-medium uppercase">
                                  <span>{docOrigem}</span>
                                </div>
                              </div>
                            </div>
                          )
                        })}
                      </div>

                      {hasMoreCompras && (
                        <button
                          onClick={fetchMoreCompras}
                          disabled={loadingMoreCompras}
                          className="w-full py-2 text-[10px] font-bold text-zinc-600 dark:text-zinc-400 hover:text-zinc-900 dark:hover:text-white bg-zinc-50 dark:bg-zinc-900/50 hover:bg-zinc-100 dark:hover:bg-zinc-800 border border-zinc-200 dark:border-zinc-800 rounded-xl transition-all flex items-center justify-center gap-1.5 uppercase shadow-xs"
                        >
                          {loadingMoreCompras ? <Loader2 className="w-3.5 h-3.5 animate-spin text-brand-accent" /> : <RefreshCw className="w-3.5 h-3.5 text-zinc-400" />}
                          Carregar mais solicitações ({recentCompras.length} de {totalComprasCount.toLocaleString('pt-BR')})
                        </button>
                      )}
                    </div>
                  )
                )}
              </CardContent>
            </Card>
          </div>

        </div>
      )}
    </div>
  )
}
