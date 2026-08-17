import { useState, useEffect, useMemo } from 'react'
import { useNavigate } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { useAuth } from '../AuthContext'
import { TabsList, TabsTrigger, TabsContent } from '../components/ui/tabs'
import { Button } from '../components/ui/button'
import { Badge } from '../components/ui/badge'
import { Input } from '../components/ui/input'
import { Card, CardContent, CardHeader, CardTitle } from '../components/ui/card'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '../components/ui/select'
import {
  TrendingUp, History, Package, FileUp, FileText,
  Search, MapPin, Building2, FileBarChart2, AlertTriangle,
  Wallet, BarChart3, FilePlus2, RefreshCw, BarChart2, Wand2,
  Sparkles
} from 'lucide-react'
import { VendaDiretaAtaForm } from '../components/Vendas/VendaDiretaAtaForm'
import { VendedorHistory } from '../components/Vendas/VendedorHistory'
import { VendedorRelatorios } from '../components/Vendas/VendedorRelatorios'
import { SimuladorProposta } from '../components/Vendas/SimuladorProposta'
import { Atas } from '../Atas'
import { formatCurrency } from '../lib/utils'

const BR_STATES = ['AC','AL','AP','AM','BA','CE','DF','ES','GO','MA','MT','MS','MG','PA','PB','PR','PE','PI','RJ','RN','RS','RO','RR','SC','SP','SE','TO']

function MetricCard({ label, value, sub, icon: Icon, accent }: {
  label: string; value: string; sub: string; icon: any; accent: string
}) {
  return (
    <Card className="border-zinc-200 dark:border-zinc-800 overflow-hidden">
      <CardContent className="p-5">
        <div className="flex items-start justify-between">
          <div>
            <p className="text-[11px] font-bold uppercase text-zinc-400 tracking-widest">{label}</p>
            <p className={`text-2xl font-black mt-1 ${accent}`}>{value}</p>
            <p className="text-[11px] text-zinc-400 mt-0.5">{sub}</p>
          </div>
          <div className={`p-2.5 rounded-xl bg-gradient-to-br ${accent.includes('violet') ? 'from-violet-100 to-violet-50' : accent.includes('emerald') ? 'from-emerald-100 to-emerald-50' : accent.includes('amber') ? 'from-amber-100 to-amber-50' : 'from-blue-100 to-blue-50'}`}>
            <Icon className={`w-5 h-5 ${accent}`} />
          </div>
        </div>
      </CardContent>
    </Card>
  )
}

export default function VendedorDashboard() {
  const navigate = useNavigate()
  const { user, profile } = useAuth()
  const [activeTab, setActiveTab] = useState('atas')
  const [showVendaForm, setShowVendaForm] = useState(false)
  const [vendaFormTipo, setVendaFormTipo] = useState<'NF' | 'PEDIDO'>('NF')

  // Filtros globais
  const [filterUf, setFilterUf] = useState('all')
  const [filterCliente, setFilterCliente] = useState('')

  // Métricas
  const [metrics, setMetrics] = useState({
    totalAtas: 0,
    valorTotalAtas: 0,
    atasVencendo: 0,
    davsPendentes: 0,
  })
  const [loadingMetrics, setLoadingMetrics] = useState(true)

  // Dados DAVs × NF
  const [davs, setDavs] = useState<any[]>([])
  const [loadingDavs, setLoadingDavs] = useState(false)
  const [currentPage, setCurrentPage] = useState(1)
  const ITEMS_PER_PAGE = 30

  const [filterDavPeriodo, setFilterDavPeriodo] = useState('30')

  useEffect(() => {
    setCurrentPage(1)
  }, [filterDavPeriodo])

  useEffect(() => {
    fetchMetrics()
  }, [user])

  async function fetchMetrics() {
    if (!user) return
    setLoadingMetrics(true)
    try {
      const isAdm = profile?.nivel === 'ADM' || profile?.nivel === 'DEV'
      let query = supabase.from('atas').select('id, valor_global, data_validade, status')
      if (!isAdm) query = query.eq('owner_id', user.id)
      const { data: atasData } = await query

      const hoje = new Date()
      const em30dias = new Date(hoje.getTime() + 30 * 24 * 60 * 60 * 1000)

      setMetrics({
        totalAtas: atasData?.length || 0,
        valorTotalAtas: atasData?.reduce((acc, a) => acc + (a.valor_global || 0), 0) || 0,
        atasVencendo: atasData?.filter(a => a.data_validade && new Date(a.data_validade) <= em30dias && new Date(a.data_validade) >= hoje).length || 0,
        davsPendentes: 0,
      })
    } catch (err) {
      console.error(err)
    } finally {
      setLoadingMetrics(false)
    }
  }

  async function fetchDavs() {
    if (!user) return
    setLoadingDavs(true)
    try {
      const isAdm = profile?.nivel === 'ADM' || profile?.nivel === 'DEV'
      const cutoff = new Date(Date.now() - Number(filterDavPeriodo) * 24 * 60 * 60 * 1000).toISOString()
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const db = supabase as any
      let query = db
        .from('davs')
        .select('*, entidades(nome), atas(numero_arp), notas(numero_ne, status_geral)')
        .gte('created_at', cutoff)
        .order('created_at', { ascending: false })
      if (!isAdm) query = query.eq('owner_id', user.id)
      const { data } = await query
      setDavs(data || [])
    } catch (err) {
      console.error(err)
    } finally {
      setLoadingDavs(false)
    }
  }

  useEffect(() => {
    if (activeTab === 'relatorio') fetchDavs()
  }, [activeTab, filterDavPeriodo, user])

  const paginatedDavs = useMemo(() => {
    return davs.slice((currentPage - 1) * ITEMS_PER_PAGE, currentPage * ITEMS_PER_PAGE)
  }, [davs, currentPage])

  const totalPages = Math.ceil(davs.length / ITEMS_PER_PAGE)

  return (
    <div className="space-y-6 max-w-[1600px] mx-auto px-4 py-4">
      {/* Header */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-black text-zinc-900 dark:text-zinc-100 flex items-center gap-2.5">
            <TrendingUp className="w-6 h-6 text-brand-accent" />
            Portal do Vendedor
          </h1>
          <p className="text-zinc-400 text-sm mt-0.5">Gestão de ATAs, entregas e faturamento</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button
            variant="outline"
            className="border-brand-accent text-brand-accent hover:bg-brand-accent/5 font-bold gap-2 h-9"
            onClick={() => navigate('/cadastrar-ata')}
          >
            <FilePlus2 className="w-4 h-4" /> IMPORTAR ATA
          </Button>
          <Button
            className="bg-brand-accent hover:opacity-90 text-white font-bold gap-2 shadow-lg shadow-brand-accent/20 h-9"
            onClick={() => navigate('/cadastrar-empenho')}
          >
            <FileUp className="w-4 h-4" /> BAIXA POR EMPENHO
          </Button>
          <Button
            onClick={() => { setVendaFormTipo('NF'); setShowVendaForm(true); }}
            className="bg-amber-500 hover:bg-amber-600 text-white font-bold shadow-lg shadow-amber-500/20 h-9"
          >
            <Sparkles className="w-4 h-4 mr-1.5" /> BAIXA AUTOMÁTICA NF
          </Button>
          <Button
            onClick={() => { setVendaFormTipo('PEDIDO'); setShowVendaForm(true); }}
            className="bg-indigo-600 hover:bg-indigo-700 text-white font-bold shadow-lg shadow-indigo-600/20 h-9"
          >
            <FileText className="w-4 h-4 mr-1.5" /> BAIXA AUTOMÁTICA PEDIDO
          </Button>
        </div>
      </div>

      {/* Métricas */}
      {!showVendaForm && (
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          <MetricCard
            label="Total de ATAs"
            value={loadingMetrics ? '...' : String(metrics.totalAtas)}
            sub="registros de preços ativos"
            icon={Package}
            accent="text-violet-600"
          />
          <MetricCard
            label="Valor em ATAs"
            value={loadingMetrics ? '...' : formatCurrency(metrics.valorTotalAtas)}
            sub="soma de todos os contratos"
            icon={Wallet}
            accent="text-emerald-600"
          />
          <MetricCard
            label="Vencendo em 30 dias"
            value={loadingMetrics ? '...' : String(metrics.atasVencendo)}
            sub="ATAs próximas ao vencimento"
            icon={AlertTriangle}
            accent="text-amber-600"
          />
          <MetricCard
            label="DAVs Registradas"
            value={loadingMetrics ? '...' : String(metrics.davsPendentes)}
            sub="este mês"
            icon={BarChart3}
            accent="text-blue-600"
          />
        </div>
      )}

      {showVendaForm ? (
        <div className="animate-in fade-in slide-in-from-top-4 duration-300">
          <VendaDiretaAtaForm
            defaultTipoDocumento={vendaFormTipo}
            onCancel={() => setShowVendaForm(false)}
            onSuccess={() => { setShowVendaForm(false); fetchMetrics() }}
          />
        </div>
      ) : (
        <div className="space-y-4">
          {/* Filtros Globais */}
          <Card className="border-zinc-200 dark:border-zinc-800">
            <CardContent className="p-3 flex flex-wrap gap-2 items-center">
              <MapPin className="w-3.5 h-3.5 text-zinc-400" />
              <Select value={filterUf} onValueChange={setFilterUf}>
                <SelectTrigger className="h-8 w-28 text-xs">
                  <SelectValue placeholder="UF..." />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Todas UFs</SelectItem>
                  {BR_STATES.map(s => <SelectItem key={s} value={s}>{s}</SelectItem>)}
                </SelectContent>
              </Select>
              <Building2 className="w-3.5 h-3.5 text-zinc-400" />
              <div className="relative">
                <Search className="w-3 h-3 absolute left-2.5 top-1/2 -translate-y-1/2 text-zinc-400" />
                <Input
                  placeholder="Filtrar cliente..."
                  value={filterCliente}
                  onChange={e => setFilterCliente(e.target.value)}
                  className="h-8 pl-7 text-xs w-48"
                />
              </div>
            </CardContent>
          </Card>

          {/* Tabs */}
          <TabsList className="bg-zinc-100 dark:bg-zinc-900 p-1 rounded-xl">
            <TabsTrigger active={activeTab === 'atas'} onClick={() => setActiveTab('atas')} className="rounded-lg">
              <Package className="w-3.5 h-3.5 mr-1.5" /> Minhas ATAs
            </TabsTrigger>
            <TabsTrigger active={activeTab === 'history'} onClick={() => setActiveTab('history')} className="rounded-lg">
              <History className="w-3.5 h-3.5 mr-1.5" /> Histórico de Vendas
            </TabsTrigger>
            <TabsTrigger active={activeTab === 'relatorio'} onClick={() => setActiveTab('relatorio')} className="rounded-lg">
              <FileBarChart2 className="w-3.5 h-3.5 mr-1.5" /> Relatório DAV × NF
            </TabsTrigger>
            <TabsTrigger active={activeTab === 'relatorios'} onClick={() => setActiveTab('relatorios')} className="rounded-lg">
              <BarChart2 className="w-3.5 h-3.5 mr-1.5" /> Relatórios
            </TabsTrigger>
            <TabsTrigger active={activeTab === 'simulador'} onClick={() => setActiveTab('simulador')} className="rounded-lg">
              <Wand2 className="w-3.5 h-3.5 mr-1.5" /> Simular Proposta
            </TabsTrigger>
          </TabsList>

          <TabsContent visible={activeTab === 'atas'} className="focus-visible:outline-none">
            <Atas filterUf={filterUf} filterCliente={filterCliente} />
          </TabsContent>

          <TabsContent visible={activeTab === 'history'} className="focus-visible:outline-none">
            <VendedorHistory />
          </TabsContent>

          <TabsContent visible={activeTab === 'relatorios'} className="focus-visible:outline-none">
            <VendedorRelatorios />
          </TabsContent>

          <TabsContent visible={activeTab === 'simulador'} className="focus-visible:outline-none">
            <SimuladorProposta />
          </TabsContent>

          <TabsContent visible={activeTab === 'relatorio'} className="focus-visible:outline-none space-y-4">
            <Card className="border-zinc-200 dark:border-zinc-800">
              <CardHeader className="pb-0 pt-4 px-4 flex flex-row items-center justify-between">
                <CardTitle className="text-sm font-bold flex items-center gap-2">
                  <FileBarChart2 className="w-4 h-4 text-brand-accent" />
                  Cruzamento DAV × Nota Fiscal
                </CardTitle>
                <div className="flex gap-2 items-center">
                  <Select value={filterDavPeriodo} onValueChange={setFilterDavPeriodo}>
                    <SelectTrigger className="h-8 w-36 text-xs">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="7">Últimos 7 dias</SelectItem>
                      <SelectItem value="30">Últimos 30 dias</SelectItem>
                      <SelectItem value="90">Últimos 90 dias</SelectItem>
                      <SelectItem value="365">Último ano</SelectItem>
                    </SelectContent>
                  </Select>
                  <Button variant="outline" size="icon" className="h-8 w-8" onClick={fetchDavs}>
                    <RefreshCw className="w-3.5 h-3.5" />
                  </Button>
                </div>
              </CardHeader>
              <CardContent className="p-4">
                {loadingDavs ? (
                  <div className="h-40 flex items-center justify-center gap-2 text-zinc-400">
                    <div className="w-5 h-5 border-2 border-brand-accent border-t-transparent rounded-full animate-spin" />
                    <span className="text-sm">Carregando...</span>
                  </div>
                ) : davs.length === 0 ? (
                  <div className="h-40 flex flex-col items-center justify-center gap-3 border-2 border-dashed border-zinc-200 dark:border-zinc-800 rounded-xl">
                    <FileBarChart2 className="w-10 h-10 text-zinc-200 dark:text-zinc-700" />
                    <div className="text-center">
                      <p className="text-sm font-bold text-zinc-400">Nenhum DAV registrado</p>
                      <p className="text-xs text-zinc-300 mt-0.5">Os DAVs cadastrados aparecerão aqui para cruzamento com NFs</p>
                    </div>
                  </div>
                ) : (
                  <>
                    <div className="overflow-x-auto">
                      <table className="w-full text-xs">
                        <thead>
                          <tr className="border-b border-zinc-100 dark:border-zinc-800">
                            <th className="text-left pb-2 font-bold text-zinc-500 uppercase text-[10px] tracking-wider">DAV</th>
                            <th className="text-left pb-2 font-bold text-zinc-500 uppercase text-[10px] tracking-wider">Data</th>
                            <th className="text-left pb-2 font-bold text-zinc-500 uppercase text-[10px] tracking-wider">Cliente</th>
                            <th className="text-left pb-2 font-bold text-zinc-500 uppercase text-[10px] tracking-wider">ATA</th>
                            <th className="text-right pb-2 font-bold text-zinc-500 uppercase text-[10px] tracking-wider">Valor DAV</th>
                            <th className="text-left pb-2 font-bold text-zinc-500 uppercase text-[10px] tracking-wider">NF Vinculada</th>
                            <th className="text-center pb-2 font-bold text-zinc-500 uppercase text-[10px] tracking-wider">Status</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-zinc-50 dark:divide-zinc-900">
                          {paginatedDavs.map(dav => {
                            const nfEmitida = !!dav.nota_id && dav.notas?.status_geral !== 'PENDENTE'
                            return (
                              <tr key={dav.id} className="hover:bg-zinc-50 dark:hover:bg-zinc-900/40 transition-colors">
                                <td className="py-2.5 font-bold text-zinc-900 dark:text-zinc-100">{dav.numero_dav}</td>
                                <td className="py-2.5 text-zinc-500">{dav.data_emissao ? new Date(dav.data_emissao).toLocaleDateString('pt-BR') : '—'}</td>
                                <td className="py-2.5 text-zinc-600 dark:text-zinc-400 max-w-[150px] truncate">{dav.entidades?.nome || '—'}</td>
                                <td className="py-2.5">
                                  {dav.atas?.numero_arp
                                    ? <Badge variant="outline" className="text-[10px]">{dav.atas.numero_arp}</Badge>
                                    : <span className="text-zinc-300">—</span>}
                                </td>
                                <td className="py-2.5 text-right font-bold text-brand-accent">{formatCurrency(dav.valor_total)}</td>
                                <td className="py-2.5">
                                  {dav.notas?.numero_ne
                                    ? <span className="font-mono text-xs text-zinc-700 dark:text-zinc-300">{dav.notas.numero_ne}</span>
                                    : <span className="text-zinc-300 italic text-[10px]">Sem NF vinculada</span>}
                                </td>
                                <td className="py-2.5 text-center">
                                  <Badge
                                    className={`text-[10px] ${nfEmitida ? 'bg-emerald-100 text-emerald-700 border-emerald-200' : 'bg-amber-100 text-amber-700 border-amber-200'}`}
                                  >
                                    {nfEmitida ? 'NF Emitida' : 'Pendente NF'}
                                  </Badge>
                                </td>
                              </tr>
                            )
                          })}
                        </tbody>
                      </table>
                    </div>
                    
                    {/* Pagination Controls */}
                    {totalPages > 1 && (
                      <div className="flex items-center justify-between p-4 border-t border-zinc-150 dark:border-zinc-800 bg-zinc-50/50 dark:bg-zinc-900/30">
                        <div className="text-xs text-zinc-500 font-bold uppercase tracking-wider">
                          Página {currentPage} de {totalPages} ({davs.length} DAVs)
                        </div>
                        <div className="flex items-center gap-2">
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => setCurrentPage(prev => Math.max(1, prev - 1))}
                            disabled={currentPage === 1}
                            className="h-8 text-xs font-bold"
                          >
                            Anterior
                          </Button>
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => setCurrentPage(prev => Math.min(totalPages, prev + 1))}
                            disabled={currentPage >= totalPages}
                            className="h-8 text-xs font-bold"
                          >
                            Próximo
                          </Button>
                        </div>
                      </div>
                    )}
                  </>
                )}
              </CardContent>
            </Card>
          </TabsContent>
        </div>
      )}
    </div>
  )
}
