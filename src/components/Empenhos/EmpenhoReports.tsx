import { useState, useEffect, useMemo, useRef } from 'react'
import { supabase } from '../../lib/supabase'
import { 
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, 
  PieChart, Pie, Cell, Legend 
} from 'recharts'
import { 
  FileText, Download, Printer, PieChart as PieChartIcon, 
  BarChart3, TrendingUp, DollarSign, Package, Loader2,
  Calendar, Users, Filter, CheckCircle2, Clock, RefreshCw,
  Search, ChevronDown
} from 'lucide-react'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '../ui/card'
import { Button } from '../ui/button'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '../ui/select'
import { Badge } from '../ui/badge'
import { toast } from 'sonner'
import { formatCurrency, isNotaModoSesau } from '../../lib/utils'
import { gerarRomaneioPDF, gerarRomaneioComEmpenhosPDF, gerarRelatorioGeralPremiumPDF, gerarRelatorioSituacaoClientePDF, gerarRelatorioSituacaoClienteSimplificadoPDF, imprimirNFsAnexadasPDF, type NotaComItens, type OrdenacaoEmpenhos } from '../../reportUtils'
import { useAuth } from '../../AuthContext'
import { canViewSesauReport } from '../../lib/permissions'

const COLORS = ['#3b82f6', '#10b981', '#f59e0b', '#ef4444', '#8b5cf6']

export function EmpenhoReports() {
  const { profile } = useAuth()
  const [loading, setLoading] = useState(true)
  const [notas, setNotas] = useState<NotaComItens[]>([])
  const [selectedClients, setSelectedClients] = useState<string[]>([])
  const [selectedClientForStatus, setSelectedClientForStatus] = useState<string>('')
  const [incluirItens, setIncluirItens] = useState(false)
  const [apenasNotificados, setApenasNotificados] = useState(false)

  const [searchClientRomaneio, setSearchClientRomaneio] = useState('')
  const [clientStatusSearch, setClientStatusSearch] = useState('')
  const [clientStatusDropdownOpen, setClientStatusDropdownOpen] = useState(false)
  const dropdownRef = useRef<HTMLDivElement>(null)

  const [selectedNotasRomaneio, setSelectedNotasRomaneio] = useState<number[]>([])
  const [searchNotaRomaneio, setSearchNotaRomaneio] = useState('')
  
  const [selectedNotasStatus, setSelectedNotasStatus] = useState<number[]>([])
  const [searchNotaStatus, setSearchNotaStatus] = useState('')
  const [ordenacaoStatus, setOrdenacaoStatus] = useState<OrdenacaoEmpenhos>('DATA_ASC')

  const processedNotas = useMemo(() => {
    if (!apenasNotificados) return notas
    return notas.filter(n => !!n.e_notificacao)
  }, [notas, apenasNotificados])

  // Empenhos vinculados aos clientes selecionados para o Romaneio
  const empenhosRomaneio = useMemo(() => {
    if (selectedClients.length === 0) return processedNotas
    const getResolvedName = (n: any) => (n.entidades?.nome || n.emissor || '').trim()
    return processedNotas.filter(n => selectedClients.includes(getResolvedName(n)))
  }, [processedNotas, selectedClients])

  // Filtrar empenhos para o Romaneio
  const filteredEmpenhosRomaneio = useMemo(() => {
    if (!searchNotaRomaneio) return empenhosRomaneio
    const term = searchNotaRomaneio.toLowerCase()
    return empenhosRomaneio.filter(n => String(n.numero_ne || '').toLowerCase().includes(term))
  }, [empenhosRomaneio, searchNotaRomaneio])

  // Empenhos vinculados ao cliente selecionado para Situação
  const empenhosStatus = useMemo(() => {
    if (!selectedClientForStatus) return processedNotas
    const getResolvedName = (n: any) => (n.entidades?.nome || n.emissor || '').trim()
    return processedNotas.filter(n => getResolvedName(n) === selectedClientForStatus)
  }, [processedNotas, selectedClientForStatus])

  // Filtrar empenhos para Situação
  const filteredEmpenhosStatus = useMemo(() => {
    if (!searchNotaStatus) return empenhosStatus
    const term = searchNotaStatus.toLowerCase()
    return empenhosStatus.filter(n => String(n.numero_ne || '').toLowerCase().includes(term))
  }, [empenhosStatus, searchNotaStatus])

  // Quando muda os clientes selecionados para o Romaneio, seleciona todos os seus empenhos por padrão
  useEffect(() => {
    if (selectedClients.length > 0) {
      const ids = empenhosRomaneio.map(n => n.id)
      setSelectedNotasRomaneio(ids)
    } else {
      setSelectedNotasRomaneio([])
    }
  }, [empenhosRomaneio, selectedClients.length])

  // Quando muda o cliente selecionado para Situação, seleciona todos os seus empenhos por padrão
  useEffect(() => {
    if (selectedClientForStatus) {
      const ids = empenhosStatus.map(n => n.id)
      setSelectedNotasStatus(ids)
    } else {
      setSelectedNotasStatus([])
    }
  }, [empenhosStatus, selectedClientForStatus])

  const handleToggleNotaRomaneio = (id: number) => {
    setSelectedNotasRomaneio(prev => 
      prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id]
    )
  }

  const handleToggleNotaStatus = (id: number) => {
    setSelectedNotasStatus(prev => 
      prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id]
    )
  }

  // Fechar dropdown de situação ao clicar fora
  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setClientStatusDropdownOpen(false)
      }
    }
    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [])

  const fetchData = async () => {
    setLoading(true)
    const { data, error } = await supabase
      .from('notas')
      .select('*, entidades(*), itens(*, historico_entregas(*))')
      .order('created_at', { ascending: false })

    if (error) {
      toast.error('Erro ao carregar dados: ' + error.message)
    } else {
      setNotas(data as any[])
    }
    setLoading(false)
  }

  useEffect(() => {
    fetchData()
  }, [])

  // Extrair clientes únicos
  const uniqueClients = useMemo(() => {
    const clients = Array.from(new Set(processedNotas.map(n => ((n as any).entidades?.nome || n.emissor || 'DESCONHECIDO').trim())))
    return clients.sort()
  }, [processedNotas])

  // Filtrar clientes para o Romaneio
  const filteredClientsRomaneio = useMemo(() => {
    if (!searchClientRomaneio) return uniqueClients
    const term = searchClientRomaneio.toLowerCase()
    return uniqueClients.filter(c => c.toLowerCase().includes(term))
  }, [uniqueClients, searchClientRomaneio])

  // Filtrar clientes para o relatório de situação
  const filteredClientsStatus = useMemo(() => {
    if (!clientStatusSearch) return uniqueClients
    const term = clientStatusSearch.toLowerCase()
    return uniqueClients.filter(c => c.toLowerCase().includes(term))
  }, [uniqueClients, clientStatusSearch])

  // Dados para os Gráficos
  const statusData = useMemo(() => {
    const counts: Record<string, number> = {}
    processedNotas.forEach(n => {
      const status = n.status_geral || 'PENDENTE'
      counts[status] = (counts[status] || 0) + 1
    })
    return Object.entries(counts).map(([name, value]) => ({ name, value }))
  }, [processedNotas])

  const financialData = useMemo(() => {
    // Top 5 Clientes por Valor
    const clientTotals: Record<string, number> = {}
    processedNotas.forEach(n => {
      const client = ((n as any).entidades?.nome || n.emissor || 'Outros').trim()
      clientTotals[client] = (clientTotals[client] || 0) + (n.valor_total_teto || 0)
    })
    return Object.entries(clientTotals)
      .map(([name, total]) => ({ name, total }))
      .sort((a, b) => b.total - a.total)
      .slice(0, 5)
  }, [processedNotas])

  // KPIs
  const totalFinancial = processedNotas.reduce((acc, n) => acc + (n.valor_total_teto || 0), 0)
  const pendingCount = processedNotas.filter(n => n.status_geral !== 'CONCLUIDO').length
  const totalItems = processedNotas.reduce((acc, n) => acc + (n.itens?.length || 0), 0)

  const handleToggleClient = (client: string) => {
    setSelectedClients(prev => 
      prev.includes(client) ? prev.filter(c => c !== client) : [...prev, client]
    )
  }

  const [generatingRomaneioComEmpenhos, setGeneratingRomaneioComEmpenhos] = useState(false)

  const handleGerarRomaneio = () => {
    if (selectedClients.length === 0 && selectedNotasRomaneio.length === 0) {
      toast.warning('Selecione pelo menos um cliente ou empenho para o romaneio.')
      return
    }
    gerarRomaneioPDF(processedNotas, selectedClients, selectedNotasRomaneio)
    toast.success('Romaneio gerado com sucesso!')
  }

  const handleGerarRomaneioComEmpenhos = async () => {
    if (selectedClients.length === 0 && selectedNotasRomaneio.length === 0) {
      toast.warning('Selecione pelo menos um cliente ou empenho para o romaneio.')
      return
    }

    setGeneratingRomaneioComEmpenhos(true)
    const toastId = toast.loading('Gerando Romaneio + Compilando Empenhos Originais...')

    try {
      const res = await gerarRomaneioComEmpenhosPDF(processedNotas, selectedClients, selectedNotasRomaneio)
      toast.dismiss(toastId)

      if (res.success) {
        if (res.totalArquivos > 0) {
          toast.success(`Romaneio gerado com sucesso contendo ${res.totalArquivos} empenho(s) original(is) anexado(s)!`)
        } else {
          toast.success('Romaneio gerado com sucesso!')
        }

        if (res.totalEmpenhosSemPdf > 0) {
          toast.info(`${res.totalEmpenhosSemPdf} empenho(s) não possuíam arquivo PDF original anexado.`)
        }
      } else {
        toast.error(res.message || 'Falha ao compilar Romaneio com Empenhos.')
      }
    } catch (err: any) {
      toast.dismiss(toastId)
      toast.error('Erro ao compilar Romaneio com Empenhos: ' + err.message)
    } finally {
      setGeneratingRomaneioComEmpenhos(false)
    }
  }

  const handleGerarRelatorioGeral = () => {
    gerarRelatorioGeralPremiumPDF(processedNotas, incluirItens)
    toast.success('Relatório Geral gerado com sucesso!')
  }

  const handleGerarSituacaoCliente = () => {
    if (!selectedClientForStatus && selectedNotasStatus.length === 0) {
      toast.warning('Selecione um cliente ou pelo menos um empenho para gerar o relatório de situação.')
      return
    }
    gerarRelatorioSituacaoClientePDF(selectedClientForStatus, processedNotas, selectedNotasStatus, false, ordenacaoStatus)
    toast.success(`Relatório de situação detalhado gerado!`)
  }

  const handleGerarSituacaoClienteSimplificado = () => {
    if (!selectedClientForStatus && selectedNotasStatus.length === 0) {
      toast.warning('Selecione um cliente ou pelo menos um empenho para gerar o relatório de situação simplificado.')
      return
    }
    gerarRelatorioSituacaoClienteSimplificadoPDF(selectedClientForStatus, processedNotas, selectedNotasStatus, ordenacaoStatus)
    toast.success(`Relatório de situação simplificado gerado!`)
  }

  const [imprimindoNFs, setImprimindoNFs] = useState(false)

  const handleImprimirNFsAnexadas = async () => {
    if (!selectedClientForStatus && selectedNotasStatus.length === 0) {
      toast.warning('Selecione um cliente ou pelo menos um empenho para imprimir as NFs.')
      return
    }
    setImprimindoNFs(true)
    const toastId = toast.loading('Baixando e compilando os arquivos PDF originais das NFs...')
    try {
      const res = await imprimirNFsAnexadasPDF(selectedClientForStatus, processedNotas, selectedNotasStatus, ordenacaoStatus)
      if (res.success) {
        toast.success(res.message || 'Arquivos compilados para impressão!', { id: toastId })
      } else {
        toast.warning(res.message || 'Falha ao compilar NFs.', { id: toastId })
      }
    } catch (err) {
      console.error(err)
      toast.error('Erro ao compilar NFs para impressão.', { id: toastId })
    } finally {
      setImprimindoNFs(false)
    }
  }

  const handleGerarSituacaoSesau = () => {
    const notasSesau = processedNotas.filter(n => isNotaModoSesau(n))
    if (notasSesau.length === 0) {
      toast.warning('Nenhum empenho cadastrado no Modo SESAU.')
      return
    }
    gerarRelatorioSituacaoClientePDF('Fundo Estadual de Saúde do Tocantins', processedNotas, notasSesau.map(n => n.id), true)
    toast.success('Relatório de Situação SESAU gerado!')
  }

  if (loading) {
    return (
      <div className="h-64 flex flex-col items-center justify-center gap-3">
        <Loader2 className="w-8 h-8 animate-spin text-blue-600" />
        <p className="text-zinc-500 font-medium">Analisando registros...</p>
      </div>
    )
  }

  return (
    <div className="space-y-6 animate-in fade-in duration-500">
      {/* Filtro de Empenhos Notificados */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 bg-zinc-50 dark:bg-zinc-900/40 p-4 rounded-xl border border-zinc-200 dark:border-zinc-800">
        <div>
          <h4 className="text-sm font-bold text-zinc-900 dark:text-zinc-100 uppercase tracking-wider">Filtros de Relatório</h4>
          <p className="text-xs text-zinc-500">Configure as opções de visualização e exportação.</p>
        </div>
        <div className="flex flex-wrap items-center gap-4">
          <label className="flex items-center gap-2 cursor-pointer bg-white dark:bg-zinc-950 px-4 py-2 rounded-lg border border-zinc-200 dark:border-zinc-800 hover:border-red-200 dark:hover:border-red-900/50 transition-all select-none">
            <input 
              type="checkbox"
              checked={apenasNotificados}
              onChange={(e) => setApenasNotificados(e.target.checked)}
              className="rounded border-zinc-300 text-red-600 focus:ring-red-500 h-4 w-4 cursor-pointer"
            />
            <span className="text-xs font-bold text-red-700 dark:text-red-400 uppercase tracking-wide">
              Exibir apenas Empenhos Notificados por Atraso
            </span>
          </label>
        </div>
      </div>

      {/* KPI Section */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <Card className="border-none shadow-sm bg-blue-50/50 dark:bg-blue-900/10">
          <CardContent className="pt-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-blue-600 dark:text-blue-400">Volume Financeiro</p>
                <h3 className="text-2xl font-bold mt-1">{formatCurrency(totalFinancial)}</h3>
              </div>
              <div className="p-3 bg-blue-600 rounded-xl">
                <DollarSign className="w-6 h-6 text-white" />
              </div>
            </div>
            <div className="flex items-center mt-4 text-xs text-blue-600 font-bold gap-1 uppercase">
               <TrendingUp className="w-3 h-4" /> Global Acumulado
            </div>
          </CardContent>
        </Card>

        <Card className="border-none shadow-sm bg-amber-50/50 dark:bg-amber-900/10">
          <CardContent className="pt-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-amber-600 dark:text-amber-400">Demandas Ativas</p>
                <h3 className="text-2xl font-bold mt-1">{pendingCount} <span className="text-sm font-normal text-zinc-400">notas</span></h3>
              </div>
              <div className="p-3 bg-amber-500 rounded-xl">
                <Clock className="w-6 h-6 text-white" />
              </div>
            </div>
            <div className="flex items-center mt-4 text-xs text-amber-600 font-bold gap-1 uppercase">
               Em andamento / pendente
            </div>
          </CardContent>
        </Card>

        <Card className="border-none shadow-sm bg-emerald-50/50 dark:bg-emerald-900/10">
          <CardContent className="pt-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-emerald-600 dark:text-emerald-400">Total de Itens</p>
                <h3 className="text-2xl font-bold mt-1">{totalItems} <span className="text-sm font-normal text-zinc-400">cadastrados</span></h3>
              </div>
              <div className="p-3 bg-emerald-600 rounded-xl">
                <Package className="w-6 h-6 text-white" />
              </div>
            </div>
            <div className="flex items-center mt-4 text-xs text-emerald-600 font-bold gap-1 uppercase">
               Base de dados logística
            </div>
          </CardContent>
        </Card>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        {/* Charts Section */}
        <div className="lg:col-span-8 space-y-6">
          <Card className="border-zinc-200 dark:border-zinc-800">
            <CardHeader className="flex flex-row items-center justify-between">
              <div>
                <CardTitle className="text-lg flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <BarChart3 className="w-5 h-5 text-blue-600" />
                    Top Clientes por faturamento
                  </div>
                  <Button variant="ghost" size="sm" onClick={fetchData} className="h-8 gap-1.5 text-zinc-500">
                    <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} />
                    Atualizar
                  </Button>
                </CardTitle>
                <CardDescription>Os 5 maiores clientes em volume financeiro teto</CardDescription>
              </div>
            </CardHeader>
            <CardContent>
              <div className="h-[300px] w-full">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={financialData} layout="vertical" margin={{ left: 40, right: 40 }}>
                    <CartesianGrid strokeDasharray="3 3" horizontal={true} vertical={false} />
                    <XAxis type="number" hide />
                    <YAxis 
                      dataKey="name" 
                      type="category" 
                      fontSize={10} 
                      width={100} 
                      tick={{ fill: '#71717a' }}
                    />
                    <Tooltip 
                      formatter={(v) => formatCurrency(Number(v))}
                      contentStyle={{ borderRadius: '8px', border: 'none', boxShadow: '0 4px 12px rgba(0,0,0,0.1)' }}
                    />
                    <Bar dataKey="total" fill="#3b82f6" radius={[0, 4, 4, 0]} barSize={24} />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </CardContent>
          </Card>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <Card className="border-zinc-200 dark:border-zinc-800">
              <CardHeader>
                <CardTitle className="text-sm flex items-center gap-2">
                  <PieChartIcon className="w-4 h-4 text-emerald-600" />
                  Distribuição de Status
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="h-[200px]">
                  <ResponsiveContainer width="100%" height="100%">
                    <PieChart>
                      <Pie
                        data={statusData}
                        cx="50%"
                        cy="50%"
                        innerRadius={50}
                        outerRadius={70}
                        paddingAngle={5}
                        dataKey="value"
                      >
                        {statusData.map((_, index) => (
                          <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                        ))}
                      </Pie>
                      <Tooltip />
                      <Legend iconType="circle" wrapperStyle={{ fontSize: '10px' }} />
                    </PieChart>
                  </ResponsiveContainer>
                </div>
              </CardContent>
            </Card>

            <Card className="border-zinc-200 dark:border-zinc-800">
               <CardHeader>
                 <CardTitle className="text-sm flex items-center gap-2">
                   <Download className="w-4 h-4 text-blue-600" /> 
                   Exportação Rápida
                 </CardTitle>
               </CardHeader>
               <CardContent className="space-y-4">
                  <div className="flex items-center justify-between p-3 border border-zinc-100 dark:border-zinc-800 rounded-lg">
                    <div>
                      <p className="text-xs font-bold text-zinc-900 dark:text-white uppercase">Relatório Geral</p>
                      <p className="text-[10px] text-zinc-500">Resumo de todos os registros</p>
                    </div>
                    <Button size="sm" onClick={handleGerarRelatorioGeral} className="h-8 bg-blue-600 hover:bg-blue-700">
                      <FileText className="w-3.5 h-3.5 mr-1" /> PDF
                    </Button>
                  </div>

                  {canViewSesauReport(profile) && (
                    <div className="flex items-center justify-between p-3 border border-violet-100 dark:border-violet-950 rounded-lg bg-violet-50/50 dark:bg-violet-950/10 animate-in fade-in duration-200">
                      <div>
                        <p className="text-xs font-bold text-violet-900 dark:text-violet-200 uppercase">Situação SESAU-TO</p>
                        <p className="text-[10px] text-violet-500">Completude física e faturamento</p>
                      </div>
                      <Button size="sm" onClick={handleGerarSituacaoSesau} className="h-8 bg-violet-600 hover:bg-violet-700 text-white">
                        <FileText className="w-3.5 h-3.5 mr-1" /> PDF
                      </Button>
                    </div>
                  )}

                  <div className="flex items-center gap-2">
                    <input 
                      type="checkbox" 
                      id="inc-items" 
                      checked={incluirItens} 
                      onChange={e => setIncluirItens(e.target.checked)}
                      className="rounded border-zinc-300 text-blue-600 focus:ring-blue-500"
                    />
                    <label htmlFor="inc-items" className="text-[10px] font-medium text-zinc-600 cursor-pointer">
                      Incluir detalhamento de itens no PDF
                    </label>
                  </div>
               </CardContent>
            </Card>
          </div>
        </div>

        {/* Sidebar Controls (Filters) */}
        <div className="lg:col-span-4 space-y-6">
          <Card className="border-zinc-200 dark:border-zinc-800 shadow-lg">
            <CardHeader className="bg-zinc-50 dark:bg-zinc-900/50 border-b border-zinc-100 dark:border-zinc-800/50">
               <CardTitle className="text-md flex items-center gap-2">
                 <Filter className="w-5 h-5 text-blue-600" />
                 Gerador de Romaneio
               </CardTitle>
               <CardDescription>Selecione clientes para consolidar em um documento de entrega.</CardDescription>
            </CardHeader>
            <CardContent className="pt-6 space-y-4">
               <div className="space-y-2">
                  <div className="flex items-center justify-between">
                    <label className="text-xs font-bold text-zinc-500 uppercase flex items-center gap-1.5">
                      <Users className="w-3.5 h-3.5" /> Clientes Encontrados
                    </label>
                    <Badge variant="outline" className="text-[10px]">{selectedClients.length} selecionados</Badge>
                  </div>

                  {/* Campo de pesquisa de cliente para Romaneio */}
                  <div className="relative">
                    <Search className="w-3.5 h-3.5 text-zinc-400 absolute left-2.5 top-1/2 -translate-y-1/2" />
                    <input
                      type="text"
                      placeholder="Pesquisar cliente..."
                      value={searchClientRomaneio}
                      onChange={(e) => setSearchClientRomaneio(e.target.value)}
                      className="w-full bg-white dark:bg-zinc-950 border border-zinc-200 dark:border-zinc-800 rounded-lg p-2 pl-8 text-xs focus:outline-none focus:ring-1 focus:ring-blue-500"
                    />
                  </div>

                  <div className="max-h-[300px] overflow-y-auto border border-zinc-100 dark:border-zinc-800 rounded-xl p-2 bg-white dark:bg-zinc-950/50 space-y-1 scrollbar-thin scrollbar-thumb-zinc-200">
                    {filteredClientsRomaneio.length === 0 ? (
                      <p className="text-center text-[10px] text-zinc-400 py-3 italic">Nenhum cliente localizado</p>
                    ) : (
                      filteredClientsRomaneio.map(client => (
                        <div 
                          key={client}
                          onClick={() => handleToggleClient(client)}
                          className={`flex items-center justify-between px-3 py-2 rounded-lg cursor-pointer transition-colors ${
                            selectedClients.includes(client) 
                              ? 'bg-blue-50 text-blue-700 dark:bg-blue-950/40 dark:text-blue-400 border border-blue-100 dark:border-blue-900/30' 
                              : 'hover:bg-zinc-100 dark:hover:bg-zinc-900 border border-transparent'
                          }`}
                        >
                          <span className="text-xs font-medium truncate pr-2">{client}</span>
                          {selectedClients.includes(client) && <CheckCircle2 className="w-3.5 h-3.5" />}
                        </div>
                      ))
                    )}
                  </div>
                  {selectedClients.length > 0 && (
                    <Button variant="ghost" size="sm" onClick={() => setSelectedClients([])} className="text-[10px] w-full h-7 text-zinc-500 hover:text-red-500">
                      Limpar Seleção
                    </Button>
                  )}
               </div>

               <div className="space-y-2 mt-4 pt-4 border-t border-dashed border-zinc-100 dark:border-zinc-800 animate-in fade-in duration-200">
                 <div className="flex items-center justify-between">
                   <label className="text-[10px] font-bold text-zinc-500 uppercase flex items-center gap-1.5">
                     <FileText className="w-3.5 h-3.5 text-blue-600" /> {selectedClients.length > 0 ? 'Empenhos Vinculados' : 'Todos os Empenhos'}
                   </label>
                   <Badge variant="outline" className="text-[10px]">{selectedNotasRomaneio.length} selecionados</Badge>
                 </div>

                 {/* Campo de pesquisa de empenho */}
                 <div className="relative">
                   <Search className="w-3 h-3 text-zinc-400 absolute left-2.5 top-1/2 -translate-y-1/2" />
                   <input
                     type="text"
                     placeholder="Filtrar por NE..."
                     value={searchNotaRomaneio}
                     onChange={(e) => setSearchNotaRomaneio(e.target.value)}
                     className="w-full bg-white dark:bg-zinc-950 border border-zinc-200 dark:border-zinc-800 rounded-lg p-1.5 pl-7 text-[11px] focus:outline-none focus:ring-1 focus:ring-blue-500"
                   />
                 </div>

                 <div className="max-h-[180px] overflow-y-auto border border-zinc-100 dark:border-zinc-800 rounded-xl p-2 bg-white dark:bg-zinc-950/50 space-y-1 scrollbar-thin scrollbar-thumb-zinc-200">
                   {filteredEmpenhosRomaneio.length === 0 ? (
                     <p className="text-center text-[10px] text-zinc-400 py-3 italic">Nenhum empenho localizado</p>
                   ) : (
                     filteredEmpenhosRomaneio.map(emp => {
                       const clientLabel = (emp.entidades?.nome || emp.emissor || '').trim()
                       return (
                         <div
                           key={emp.id}
                           onClick={() => handleToggleNotaRomaneio(emp.id)}
                           className={`flex items-center justify-between px-3 py-1.5 rounded-lg cursor-pointer transition-colors ${
                             selectedNotasRomaneio.includes(emp.id)
                               ? 'bg-blue-50/60 text-blue-700 dark:bg-blue-950/20 dark:text-blue-400 border border-blue-100/50 dark:border-blue-900/10'
                               : 'hover:bg-zinc-50 dark:hover:bg-zinc-900 border border-transparent'
                           }`}
                         >
                           <div className="flex flex-col min-w-0 pr-2">
                             <span className="text-xs font-bold truncate">NE: {emp.numero_ne || 'Sem nº'}</span>
                             <span className="text-[9px] text-zinc-400 truncate">{clientLabel}</span>
                           </div>
                           {selectedNotasRomaneio.includes(emp.id) && <CheckCircle2 className="w-3 h-3 text-blue-600 shrink-0" />}
                         </div>
                       )
                     })
                   )}
                 </div>
                 <div className="flex gap-2">
                   <Button variant="ghost" size="sm" onClick={() => setSelectedNotasRomaneio(empenhosRomaneio.map(n => n.id))} className="text-[9px] flex-1 h-7">
                     Selecionar Todos
                   </Button>
                   <Button variant="ghost" size="sm" onClick={() => setSelectedNotasRomaneio([])} className="text-[9px] flex-1 h-7 text-red-500">
                     Limpar Seleção
                   </Button>
                 </div>
               </div>

               <div className="flex flex-col sm:flex-row gap-2 pt-1">
                  <Button 
                    onClick={handleGerarRomaneio}
                    disabled={selectedClients.length === 0 && selectedNotasRomaneio.length === 0 || generatingRomaneioComEmpenhos}
                    variant="outline"
                    className="flex-1 border-zinc-300 dark:border-zinc-700 hover:bg-zinc-100 dark:hover:bg-zinc-800 gap-2 h-11 rounded-xl transition-all active:scale-95 text-xs font-bold"
                  >
                    <FileText className="w-4 h-4 text-blue-600 dark:text-blue-400" />
                    Gerar Romaneio (PDF Simples)
                  </Button>

                  <Button 
                    onClick={handleGerarRomaneioComEmpenhos}
                    disabled={selectedClients.length === 0 && selectedNotasRomaneio.length === 0 || generatingRomaneioComEmpenhos}
                    className="flex-1 bg-blue-600 hover:bg-blue-700 text-white gap-2 h-11 rounded-xl shadow-lg shadow-blue-600/20 transition-all active:scale-95 text-xs font-bold"
                  >
                    {generatingRomaneioComEmpenhos ? (
                      <>
                        <Loader2 className="w-4 h-4 animate-spin" />
                        Compilando PDFs...
                      </>
                    ) : (
                      <>
                        <Printer className="w-4 h-4" />
                        Romaneio + Empenhos Originais
                      </>
                    )}
                  </Button>
                </div>
            </CardContent>
          </Card>

          <Card className="border-zinc-200 dark:border-zinc-800 shadow-lg bg-slate-900 text-white overflow-visible">
            <CardHeader className="bg-slate-800 border-b border-slate-700 rounded-t-xl">
               <CardTitle className="text-md flex items-center gap-2">
                 <TrendingUp className="w-5 h-5 text-emerald-400" />
                 Situação por Cliente
               </CardTitle>
               <CardDescription className="text-slate-400">Relatório premium de entregas vs. pendências.</CardDescription>
            </CardHeader>
            <CardContent className="pt-6 space-y-4">
               <div className="space-y-2" ref={dropdownRef}>
                  <label className="text-[10px] font-bold text-slate-400 uppercase">Selecionar Cliente Alvo</label>
                  <div className="relative">
                    <div 
                      onClick={() => setClientStatusDropdownOpen(prev => !prev)}
                      className="w-full bg-slate-800 border border-slate-700 rounded-lg p-2.5 text-xs text-left cursor-pointer flex items-center justify-between text-white hover:bg-slate-750 transition-colors"
                    >
                      <span className="truncate">
                        {selectedClientForStatus || '-- Selecione o Cliente --'}
                      </span>
                      <ChevronDown className="w-4 h-4 text-slate-400 shrink-0" />
                    </div>
                    
                    {clientStatusDropdownOpen && (
                      <div className="absolute z-20 left-0 right-0 mt-1 bg-slate-800 border border-slate-700 rounded-lg shadow-xl overflow-hidden animate-in fade-in duration-100">
                        <div className="p-2 border-b border-slate-700 sticky top-0 bg-slate-800 z-10">
                          <div className="relative">
                            <Search className="w-3.5 h-3.5 text-slate-400 absolute left-2.5 top-1/2 -translate-y-1/2" />
                            <input
                              type="text"
                              placeholder="Pesquisar cliente..."
                              value={clientStatusSearch}
                              onChange={(e) => setClientStatusSearch(e.target.value)}
                              onClick={(e) => e.stopPropagation()}
                              className="w-full bg-slate-900 border border-slate-700 rounded p-1.5 pl-8 text-xs text-white focus:outline-none focus:border-emerald-500"
                            />
                          </div>
                        </div>
                        <div className="max-h-48 overflow-y-auto p-1 space-y-0.5 scrollbar-thin scrollbar-thumb-slate-700">
                          {filteredClientsStatus.length === 0 ? (
                            <p className="text-center text-[10px] text-slate-500 py-3 italic">Nenhum cliente localizado</p>
                          ) : (
                            filteredClientsStatus.map(c => (
                              <div
                                key={c}
                                onClick={() => {
                                  setSelectedClientForStatus(c);
                                  setClientStatusDropdownOpen(false);
                                  setClientStatusSearch('');
                                }}
                                className={`px-3 py-2 rounded text-xs cursor-pointer hover:bg-emerald-600 hover:text-white transition-colors ${
                                  selectedClientForStatus === c ? 'bg-emerald-700 text-white font-bold' : 'text-slate-200 hover:bg-slate-750'
                                }`}
                              >
                                {c}
                              </div>
                            ))
                          )}
                        </div>
                      </div>
                    )}
                  </div>
               </div>

               <div className="space-y-1.5 mt-3 pt-3 border-t border-slate-700">
                 <label className="text-[10px] font-bold text-slate-400 uppercase flex items-center gap-1">
                   <Filter className="w-3.5 h-3.5 text-emerald-400" /> Ordenação dos Empenhos
                 </label>
                 <Select 
                   value={ordenacaoStatus} 
                   onValueChange={(val) => setOrdenacaoStatus(val as OrdenacaoEmpenhos)}
                 >
                   <SelectTrigger className="w-full bg-slate-800 border-slate-700 text-white text-xs h-9 font-medium focus:ring-1 focus:ring-emerald-500">
                     <SelectValue />
                   </SelectTrigger>
                   <SelectContent className="bg-slate-900 border-slate-700 text-white">
                     <SelectItem value="DATA_ASC" className="text-xs focus:bg-slate-800 focus:text-white">
                       Data de Emissão (Mais antigo → Mais novo)
                     </SelectItem>
                     <SelectItem value="DATA_DESC" className="text-xs focus:bg-slate-800 focus:text-white">
                       Data de Emissão (Mais novo → Mais antigo)
                     </SelectItem>
                     <SelectItem value="COMPLETUDE_DESC" className="text-xs focus:bg-slate-800 focus:text-white">
                       Completude (% Mais completo → Menos completo)
                     </SelectItem>
                     <SelectItem value="COMPLETUDE_ASC" className="text-xs focus:bg-slate-800 focus:text-white">
                       Completude (% Menos completo → Mais completo)
                     </SelectItem>
                   </SelectContent>
                 </Select>
               </div>

               <div className="space-y-2 mt-3 pt-3 border-t border-slate-700">
                 <div className="flex items-center justify-between">
                   <label className="text-[10px] font-bold text-slate-400 uppercase flex items-center gap-1">
                     <FileText className="w-3.5 h-3.5 text-emerald-400" /> {selectedClientForStatus ? 'Empenhos Vinculados' : 'Todos os Empenhos'}
                   </label>
                   <Badge variant="outline" className="text-[9px] bg-slate-800 text-slate-200 border-slate-700">
                     {selectedNotasStatus.length} selecionados
                   </Badge>
                 </div>

                 {/* Campo de pesquisa de empenho */}
                 <div className="relative">
                   <Search className="w-3 h-3 text-slate-400 absolute left-2.5 top-1/2 -translate-y-1/2" />
                   <input
                     type="text"
                     placeholder="Filtrar por NE..."
                     value={searchNotaStatus}
                     onChange={(e) => setSearchNotaStatus(e.target.value)}
                     className="w-full bg-slate-800 border border-slate-700 rounded-lg p-1.5 pl-7 text-[11px] text-white focus:outline-none focus:ring-1 focus:ring-emerald-500"
                   />
                 </div>

                 <div className="max-h-[180px] overflow-y-auto border border-slate-700 rounded-xl p-2 bg-slate-900/50 space-y-1 scrollbar-thin scrollbar-thumb-slate-700">
                   {filteredEmpenhosStatus.length === 0 ? (
                     <p className="text-center text-[10px] text-slate-500 py-3 italic">Nenhum empenho localizado</p>
                   ) : (
                     filteredEmpenhosStatus.map(emp => (
                       <div
                         key={emp.id}
                         onClick={() => handleToggleNotaStatus(emp.id)}
                         className={`flex items-center justify-between px-3 py-1.5 rounded-lg cursor-pointer transition-colors ${
                           selectedNotasStatus.includes(emp.id)
                             ? 'bg-emerald-600/20 text-emerald-400 border border-emerald-600/30'
                             : 'hover:bg-slate-800 border border-transparent'
                         }`}
                       >
                         <div className="flex flex-col min-w-0 pr-2">
                           <span className="text-xs font-bold text-white">NE: {emp.numero_ne || 'Sem nº'}</span>
                           <span className="text-[9px] text-slate-400 truncate">{(emp.entidades?.nome || emp.emissor || '').trim()}</span>
                         </div>
                         {selectedNotasStatus.includes(emp.id) && <CheckCircle2 className="w-3 h-3 text-emerald-400 shrink-0" />}
                       </div>
                     ))
                   )}
                 </div>
                 <div className="flex gap-2">
                   <Button variant="ghost" size="sm" onClick={() => setSelectedNotasStatus(empenhosStatus.map(n => n.id))} className="text-[9px] text-slate-300 hover:text-white flex-1 h-7 hover:bg-slate-800">
                     Selecionar Todos
                   </Button>
                   <Button variant="ghost" size="sm" onClick={() => setSelectedNotasStatus([])} className="text-[9px] text-red-400 hover:text-red-300 flex-1 h-7 hover:bg-slate-800">
                     Limpar Seleção
                   </Button>
                 </div>
               </div>

               <div className="flex flex-col gap-2 pt-2">
                 <Button 
                   onClick={handleGerarSituacaoCliente}
                   disabled={!selectedClientForStatus && selectedNotasStatus.length === 0}
                   className="w-full bg-emerald-600 hover:bg-emerald-500 text-white gap-1.5 h-11 rounded-xl transition-all active:scale-95 text-xs font-bold"
                 >
                   <Download className="w-4 h-4" />
                   Situação Detalhada
                 </Button>
                 <Button 
                   onClick={handleGerarSituacaoClienteSimplificado}
                   disabled={!selectedClientForStatus && selectedNotasStatus.length === 0}
                   className="w-full bg-indigo-600 hover:bg-indigo-500 text-white gap-1.5 h-11 rounded-xl transition-all active:scale-95 text-xs font-bold"
                 >
                   <FileText className="w-4 h-4" />
                   Situação Simplificada
                 </Button>
                 <Button 
                   onClick={handleImprimirNFsAnexadas}
                   disabled={imprimindoNFs || (!selectedClientForStatus && selectedNotasStatus.length === 0)}
                   className="w-full bg-purple-600 hover:bg-purple-500 text-white gap-1.5 h-11 rounded-xl transition-all active:scale-95 text-xs font-bold shadow-md shadow-purple-500/20"
                 >
                   {imprimindoNFs ? <Loader2 className="w-4 h-4 animate-spin" /> : <Printer className="w-4 h-4" />}
                   Imprimir NFs (Íntegra)
                 </Button>
               </div>
            </CardContent>
          </Card>

          <Card className="border-zinc-200 dark:border-zinc-800">
            <CardHeader className="pb-3">
              <CardTitle className="text-xs font-bold text-zinc-400 uppercase flex items-center gap-1.5">
                <Calendar className="w-3.5 h-3.5" /> Filtro Temporal
              </CardTitle>
            </CardHeader>
            <CardContent>
               <div className="grid grid-cols-2 gap-2">
                  <div className="space-y-1">
                    <p className="text-[10px] text-zinc-500 font-medium">De:</p>
                    <input 
                      type="date" 
                      className="w-full bg-transparent border border-zinc-200 dark:border-zinc-700 rounded p-1.5 text-xs focus:ring-1 focus:ring-blue-500 outline-none" 
                    />
                  </div>
                  <div className="space-y-1">
                    <p className="text-[10px] text-zinc-500 font-medium">Até:</p>
                    <input 
                      type="date" 
                      className="w-full bg-transparent border border-zinc-200 dark:border-zinc-700 rounded p-1.5 text-xs focus:ring-1 focus:ring-blue-500 outline-none" 
                    />
                  </div>
               </div>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  )
}
