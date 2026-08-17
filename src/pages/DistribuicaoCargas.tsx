import { useState, useEffect, useMemo } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '../AuthContext'
import { supabase } from '../lib/supabase'
import { toast } from 'sonner'
import { 
  Truck, 
  ChevronRight,
  UserCheck,
  PackageSearch,
  CheckCircle2,
  AlertCircle,
  Circle,
  Search
} from 'lucide-react'
import { Card, CardContent } from '../components/ui/card'
import { Button } from '../components/ui/button'
import { Badge } from '../components/ui/badge'
import { Input } from '../components/ui/input'
import { 
  Select, 
  SelectContent, 
  SelectItem, 
  SelectTrigger, 
  SelectValue 
} from '../components/ui/select'
import { formatCurrency } from '../lib/utils'
import { selectAllNotas } from '../lib/supabaseHelpers'
import {
    Tabs,
    TabsContent,
    TabsList,
    TabsTrigger,
} from "../components/ui/tabs"

import type { Tables } from '../supabaseTypes'

type NotaWithUser = Tables<'notas'> & {
  assigned_user: { display_name: string | null } | null
  entidades?: any | null
}

type AtaWithUser = Tables<'atas'> & {
  assigned_user: { display_name: string | null } | null
  entidades?: any | null
}

// Stat Card premium
function StatCard({ label, value, sub, color }: { label: string; value: string | number; sub: string; color: string }) {
  return (
    <div className={`relative overflow-hidden rounded-2xl p-5 border ${color}`}>
      <p className="text-[10px] font-black uppercase tracking-widest opacity-70">{label}</p>
      <p className="text-3xl font-black mt-1">{value}</p>
      <p className="text-[11px] mt-0.5 opacity-60">{sub}</p>
    </div>
  )
}

export function DistribuicaoCargas() {
  const { canDistribute, loading: authLoading } = useAuth()
  const navigate = useNavigate()
  const [notas, setNotas] = useState<NotaWithUser[]>([])
  const [atas, setAtas] = useState<AtaWithUser[]>([])
  const [users, setUsers] = useState<Tables<'profiles'>[]>([])
  const [loading, setLoading] = useState(true)
  const [activeMainTab, setActiveMainTab] = useState<'empenhos' | 'atas'>('empenhos')
  const [filter, setFilter] = useState<'TODOS' | 'PENDENTES' | 'CONFIRMADOS'>('TODOS')
  const [estadoFilter, setEstadoFilter] = useState<string>('all')
  const [municipioFilter, setMunicipioFilter] = useState<string>('')
  const [searchQuery, setSearchQuery] = useState<string>('')

  useEffect(() => {
    if (!authLoading && !canDistribute) {
        toast.error('Acesso restrito ao Painel de Distribuição')
        navigate('/')
    }
  }, [canDistribute, authLoading, navigate])

  useEffect(() => {
    if (canDistribute) fetchData()
  }, [canDistribute])

  async function fetchData() {
    setLoading(true)
    try {
      // Fetch Empenhos
      const { data: notasData } = await selectAllNotas(
        '*, assigned_user:profiles(display_name), entidades(*)',
        0,
        200,
        { 
          estado: estadoFilter !== 'all' ? estadoFilter : undefined,
          municipio: municipioFilter || undefined
        }
      )
      
      // Fetch ATAs
      let ataQuery = supabase
        .from('atas')
        .select('*, assigned_user:profiles(display_name), entidades(*)')
        .eq('status', 'ATIVO')
      
      if (estadoFilter !== 'all') ataQuery = ataQuery.eq('uf', estadoFilter)
      if (municipioFilter) ataQuery = ataQuery.ilike('municipio', `%${municipioFilter}%`)
      
      const { data: atasData } = await ataQuery.order('created_at', { ascending: false })
      
      const { data: usersData } = await supabase
        .from('profiles')
        .select('*')
        .neq('setor', 'VENDAS_PRIVADO')
        .order('display_name')

      setNotas((notasData as unknown as NotaWithUser[]) || [])
      setAtas((atasData as unknown as AtaWithUser[]) || [])
      setUsers(usersData || [])
    } catch (err) {
      toast.error('Erro ao carregar dados: ' + (err instanceof Error ? err.message : String(err)))
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { fetchData() }, [estadoFilter, municipioFilter])

  async function handleAssign(notaId: number, userId: string) {
    try {
      const { error } = await supabase
        .from('notas')
        .update({ 
          assigned_to: userId, 
          distributed_at: new Date().toISOString(),
          status_carga: 'RECEBIDO',
          confirmed_at: new Date().toISOString()
        })
        .eq('id', notaId)

      if (error) throw error
      toast.success('Empenho distribuído com sucesso!')
      fetchData()
    } catch (err) {
      toast.error('Erro na distribuição: ' + (err instanceof Error ? err.message : String(err)))
    }
  }

  async function handleAssignAta(ataId: string, userId: string | null) {
    try {
      const { error } = await supabase
        .from('atas')
        .update({ 
          assigned_to: userId, 
          distributed_at: userId ? new Date().toISOString() : null
        })
        .eq('id', ataId)

      if (error) throw error
      toast.success('ATA distribuída com sucesso!')
      fetchData()
    } catch (err) {
      toast.error('Erro na distribuição da ATA: ' + (err instanceof Error ? err.message : String(err)))
    }
  }

  const stats = useMemo(() => {
    const total = notas.length
    const confirmados = notas.filter(n => n.confirmed_at).length
    const distribuidos = notas.filter(n => n.assigned_to && !n.confirmed_at).length
    const pendentes = total - confirmados - distribuidos
    const valorTotal = notas.reduce((acc, n) => acc + (n.valor_total_teto || 0), 0)
    return { total, confirmados, distribuidos, pendentes, valorTotal }
  }, [notas])

  const filteredNotas = useMemo(() => {
    return notas.filter(n => {
      // Filtro de Status
      if (filter === 'PENDENTES' && n.confirmed_at) return false
      if (filter === 'CONFIRMADOS' && !n.confirmed_at) return false
      
      // Filtro de Pesquisa
      if (searchQuery) {
        const term = searchQuery.toLowerCase()
        const matchNE = (n.numero_ne || '').toLowerCase().includes(term)
        const matchEntidade = (n.entidades?.nome || n.emissor || '').toLowerCase().includes(term)
        const matchUser = (n.assigned_user?.display_name || '').toLowerCase().includes(term)
        if (!matchNE && !matchEntidade && !matchUser) return false
      }
      
      return true
    })
  }, [notas, filter, searchQuery])

  const filteredAtas = useMemo(() => {
    return atas.filter(a => {
      // Filtro de Status
      if (filter === 'PENDENTES' && a.assigned_to) return false
      if (filter === 'CONFIRMADOS' && !a.assigned_to) return false

      // Filtro de Pesquisa
      if (searchQuery) {
        const term = searchQuery.toLowerCase()
        const matchARP = (a.numero_arp || '').toLowerCase().includes(term)
        const matchEntidade = (a.entidades?.nome || a.entidade_gerenciadora || '').toLowerCase().includes(term)
        const matchUser = (a.assigned_user?.display_name || '').toLowerCase().includes(term)
        if (!matchARP && !matchEntidade && !matchUser) return false
      }
      
      return true
    })
  }, [atas, filter, searchQuery])

  return (
    <div className="space-y-6 max-w-[1600px] mx-auto">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-black text-zinc-900 dark:text-zinc-100 flex items-center gap-2">
            <Truck className="w-6 h-6 text-brand-accent" />
            Painel de Distribuição
          </h1>
          <p className="text-zinc-500 text-sm mt-0.5">Gerenciamento de carga para operadores operacionais</p>
        </div>
      </div>

      {/* Stat Cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <StatCard
          label="Total de Empenhos"
          value={stats.total}
          sub="carregados no sistema"
          color="border-zinc-200 bg-zinc-50 text-zinc-800 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-200"
        />
        <StatCard
          label="Pendentes"
          value={stats.pendentes}
          sub="aguardando distribuição"
          color="border-amber-200 bg-amber-50 text-amber-800 dark:border-amber-800 dark:bg-amber-950/40 dark:text-amber-300"
        />
        <StatCard
          label="Em Trânsito"
          value={stats.distribuidos}
          sub="distribuídos para operadores"
          color="border-blue-200 bg-blue-50 text-blue-800 dark:border-blue-800 dark:bg-blue-950/40 dark:text-blue-300"
        />
        <StatCard
          label="Confirmados"
          value={stats.confirmados}
          sub={`${formatCurrency(stats.valorTotal)} em volume`}
          color="border-emerald-200 bg-emerald-50 text-emerald-800 dark:border-emerald-800 dark:bg-emerald-950/40 dark:text-emerald-300"
        />
      </div>

      {/* Filtros */}
      <Card className="border-zinc-200 dark:border-zinc-800">
        <CardContent className="p-4 flex flex-wrap gap-3 items-center">
          <div className="flex gap-1.5 bg-zinc-100 dark:bg-zinc-900 p-1 rounded-xl">
            {(['TODOS', 'PENDENTES', 'CONFIRMADOS'] as const).map(f => (
              <button
                key={f}
                onClick={() => setFilter(f)}
                className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all ${
                  filter === f
                    ? 'bg-white dark:bg-zinc-800 shadow-sm text-brand-accent'
                    : 'text-zinc-500 hover:text-zinc-800'
                }`}
              >
                {f === 'TODOS' ? 'Todos' : f === 'PENDENTES' ? 'Pendentes' : 'Confirmados'}
              </button>
            ))}
          </div>

          <div className="flex gap-2 flex-1 min-w-0">
            <Select value={estadoFilter} onValueChange={setEstadoFilter}>
              <SelectTrigger className="w-32 h-9 text-xs">
                <SelectValue placeholder="Filtrar UF..." />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Todos os UFs</SelectItem>
                {['AC','AL','AP','AM','BA','CE','DF','ES','GO','MA','MT','MS','MG','PA','PB','PR','PE','PI','RJ','RN','RS','RO','RR','SC','SP','SE','TO'].map(uf => (
                  <SelectItem key={uf} value={uf}>{uf}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Input
              placeholder="Filtrar cidade..."
              value={municipioFilter}
              onChange={e => setMunicipioFilter(e.target.value)}
              className="h-9 text-xs max-w-40"
            />
            <div className="relative flex-1 max-w-sm">
              <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-zinc-400" />
              <Input
                placeholder="Pesquisar NE, cliente ou operador..."
                value={searchQuery}
                onChange={e => setSearchQuery(e.target.value)}
                className="h-9 text-xs pl-8"
              />
            </div>
          </div>

          <Badge variant="outline" className="text-[10px] font-mono ml-auto">
            {activeMainTab === 'empenhos' ? filteredNotas.length : filteredAtas.length} registro(s)
          </Badge>
        </CardContent>
      </Card>

      <Tabs className="w-full">
        <TabsList className="bg-zinc-100 dark:bg-zinc-900 w-full justify-start p-1 mb-4 h-auto flex-wrap">
          <TabsTrigger 
            active={activeMainTab === 'empenhos'}
            onClick={() => setActiveMainTab('empenhos')}
            className="flex items-center gap-2 py-2 px-6 font-bold uppercase tracking-tighter text-xs"
          >
            <PackageSearch className="w-4 h-4" />
            Empenhos (Notas)
          </TabsTrigger>
          <TabsTrigger 
            active={activeMainTab === 'atas'}
            onClick={() => setActiveMainTab('atas')}
            className="flex items-center gap-2 py-2 px-6 font-bold uppercase tracking-tighter text-xs"
          >
            <UserCheck className="w-4 h-4" />
            ATAs / ARPs
          </TabsTrigger>
        </TabsList>

        <TabsContent visible={activeMainTab === 'empenhos'} className="mt-0">
          <div className="space-y-3">
            {loading ? (
                <div className="h-48 flex flex-col items-center justify-center gap-3 text-zinc-400">
                    <div className="w-8 h-8 border-2 border-brand-accent border-t-transparent rounded-full animate-spin" />
                    <p className="text-sm">Carregando cargas...</p>
                </div>
            ) : filteredNotas.length === 0 ? (
                <div className="flex flex-col items-center justify-center py-24 gap-4 border-2 border-dashed border-zinc-200 dark:border-zinc-800 rounded-2xl bg-zinc-50 dark:bg-zinc-900/30">
                    <PackageSearch className="w-14 h-14 text-zinc-200 dark:text-zinc-700" />
                    <div className="text-center">
                        <h3 className="font-bold text-zinc-400 text-sm">Nenhum empenho encontrado</h3>
                    </div>
                </div>
            ) : (
                filteredNotas.map(nota => {
                    const isConfirmado = !!nota.confirmed_at
                    const isDistribuido = !!nota.assigned_to && !isConfirmado
                    const diffTime = nota.distributed_at ? Math.abs(new Date().getTime() - new Date(nota.distributed_at).getTime()) : 0
                    const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24))
                    const isAtrasado = diffDays > 3 && !isConfirmado && isDistribuido

                    return (
                        <Card
                            key={nota.id}
                            className={`border transition-all hover:shadow-md ${
                                isConfirmado
                                    ? 'border-l-4 border-l-emerald-400 border-zinc-100 dark:border-zinc-800'
                                    : isDistribuido
                                    ? `border-l-4 ${isAtrasado ? 'border-l-red-400' : 'border-l-blue-400'} border-zinc-100 dark:border-zinc-800`
                                    : 'border-zinc-200 dark:border-zinc-800'
                            }`}
                        >
                            <CardContent className="p-4 flex flex-col sm:flex-row items-start sm:items-center gap-4">
                                <div className="flex-shrink-0">
                                    {isConfirmado
                                        ? <CheckCircle2 className="w-5 h-5 text-emerald-500" />
                                        : isDistribuido
                                        ? <AlertCircle className={`w-5 h-5 ${isAtrasado ? 'text-red-400' : 'text-blue-400'}`} />
                                        : <Circle className="w-5 h-5 text-zinc-300" />
                                    }
                                </div>
                                <div className="flex-1 min-w-0 space-y-1">
                                    <div className="flex flex-wrap items-center gap-2">
                                        <span className="font-black text-zinc-900 dark:text-zinc-100">{nota.numero_ne}</span>
                                        <Badge variant={isConfirmado ? 'success' : isDistribuido ? 'secondary' : 'outline'} className="text-[10px]">
                                            {isConfirmado ? 'RECEBIDO' : isDistribuido ? 'EM TRÂNSITO' : 'PENDENTE'}
                                        </Badge>
                                    </div>
                                    <p className="text-xs text-zinc-500 truncate">{nota.entidades?.nome || nota.emissor || '—'}</p>
                                </div>
                                <div className="flex items-center gap-6">
                                    <div>
                                        <p className="text-[10px] uppercase text-zinc-400 font-bold mb-1">Responsável</p>
                                        {nota.assigned_to ? (
                                            <Badge variant="secondary" className="bg-zinc-100 text-zinc-900 border-none gap-1.5">
                                                <UserCheck className="w-3 h-3 text-brand-accent" />
                                                {nota.assigned_user?.display_name || 'Operador'}
                                            </Badge>
                                        ) : (
                                            <Select onValueChange={(v) => handleAssign(nota.id, v)}>
                                                <SelectTrigger className="w-40 h-8 text-xs border-dashed">
                                                    <SelectValue placeholder="Distribuir para..." />
                                                </SelectTrigger>
                                                <SelectContent>
                                                    {users.map(u => (
                                                        <SelectItem key={u.id} value={u.id}>{u.display_name}</SelectItem>
                                                    ))}
                                                </SelectContent>
                                            </Select>
                                        )}
                                    </div>
                                    <div className="text-right">
                                        <p className="text-[10px] text-zinc-400 uppercase font-bold">Valor</p>
                                        <p className="font-black text-zinc-900 dark:text-zinc-100 text-sm">{formatCurrency(nota.valor_total_teto)}</p>
                                    </div>
                                    <Button variant="ghost" size="icon" className="h-8 w-8 text-zinc-300 hover:text-brand-accent">
                                        <ChevronRight className="w-4 h-4" />
                                    </Button>
                                </div>
                            </CardContent>
                        </Card>
                    )
                })
            )}
          </div>
        </TabsContent>

        <TabsContent visible={activeMainTab === 'atas'} className="mt-0">
          <div className="space-y-3">
            {loading ? (
                <div className="h-48 flex flex-col items-center justify-center gap-3 text-zinc-400">
                    <div className="w-8 h-8 border-2 border-brand-accent border-t-transparent rounded-full animate-spin" />
                    <p className="text-sm">Carregando ATAs...</p>
                </div>
            ) : filteredAtas.length === 0 ? (
                <div className="flex flex-col items-center justify-center py-24 gap-4 border-2 border-dashed border-zinc-200 dark:border-zinc-800 rounded-2xl bg-zinc-50 dark:bg-zinc-900/30">
                    <UserCheck className="w-14 h-14 text-zinc-200 dark:text-zinc-700" />
                    <div className="text-center">
                        <h3 className="font-bold text-zinc-400 text-sm">Nenhuma ATA pendente</h3>
                    </div>
                </div>
            ) : (
                filteredAtas.map(ata => {
                    const isDistribuida = !!ata.assigned_to

                    return (
                        <Card key={ata.id} className={`border transition-all hover:shadow-md ${isDistribuida ? 'border-l-4 border-l-blue-400' : 'border-zinc-200 dark:border-zinc-800'}`}>
                            <CardContent className="p-4 flex flex-col sm:flex-row items-start sm:items-center gap-4">
                                <div className="flex-shrink-0">
                                    {isDistribuida ? <UserCheck className="w-5 h-5 text-blue-500" /> : <Circle className="w-5 h-5 text-zinc-300" />}
                                </div>
                                <div className="flex-1 min-w-0 space-y-1">
                                    <div className="flex flex-wrap items-center gap-2">
                                        <span className="font-black text-zinc-900 dark:text-zinc-100">{ata.numero_arp}</span>
                                        <Badge variant={isDistribuida ? 'secondary' : 'outline'} className="text-[10px]">
                                            {isDistribuida ? 'NA CARGA' : 'NÃO ATRIBUÍDA'}
                                        </Badge>
                                    </div>
                                    <p className="text-xs text-zinc-500 truncate">{ata.entidades?.nome || ata.entidade_gerenciadora || '—'}</p>
                                    <p className="text-[10px] text-brand-accent font-bold">{ata.uf || '—'} · {ata.municipio || '—'}</p>
                                </div>
                                <div className="flex items-center gap-6">
                                    <div>
                                        <p className="text-[10px] uppercase text-zinc-400 font-bold mb-1">Responsável</p>
                                        <Select value={ata.assigned_to || 'none'} onValueChange={(v) => handleAssignAta(ata.id, v === 'none' ? null : v)}>
                                            <SelectTrigger className="w-40 h-8 text-xs">
                                                <SelectValue placeholder="Atribuir a..." />
                                            </SelectTrigger>
                                            <SelectContent>
                                                <SelectItem value="none">Nenhum (ADM)</SelectItem>
                                                {users.map(u => (
                                                    <SelectItem key={u.id} value={u.id}>{u.display_name}</SelectItem>
                                                ))}
                                            </SelectContent>
                                        </Select>
                                    </div>
                                    <div className="text-right">
                                        <p className="text-[10px] text-zinc-400 uppercase font-bold">Valor Global</p>
                                        <p className="font-black text-zinc-900 dark:text-zinc-100 text-sm">{formatCurrency(ata.valor_global)}</p>
                                    </div>
                                    <Button variant="ghost" size="icon" className="h-8 w-8 text-zinc-300 hover:text-brand-accent">
                                        <ChevronRight className="w-4 h-4" />
                                    </Button>
                                </div>
                            </CardContent>
                        </Card>
                    )
                })
            )}
          </div>
        </TabsContent>
      </Tabs>
    </div>
  )
}
