import { useState, useEffect, useCallback } from 'react'
import { jsPDF } from 'jspdf'
import autoTable from 'jspdf-autotable'
import * as XLSX from 'xlsx'
import { supabase } from './lib/supabase'
import { selectAllNotas, logOperation } from './lib/supabaseHelpers'
import { useAuth } from './AuthContext'
import { formatCurrency } from './lib/utils'
import { gerarRelatorioSituacaoClienteSimplificadoPDF, imprimirNFsAnexadasPDF } from './reportUtils'
import type { Tables } from './supabaseTypes'
import { toast } from 'sonner'
import { 
  BarChart3,
  Filter,
  Search,
  X,
  Loader2,
  Download,
  FileDown,
  FileText,
  Printer,
  Table as TableIcon
} from 'lucide-react'

// Shadcn UI
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from './components/ui/card'
import { Button } from './components/ui/button'
import { Input } from './components/ui/input'
import { Label } from './components/ui/label'
import { 
  Select, 
  SelectContent, 
  SelectItem, 
  SelectTrigger, 
  SelectValue 
} from './components/ui/select'
import { 
  Table, 
  TableBody, 
  TableCell, 
  TableHead, 
  TableHeader, 
  TableRow 
} from './components/ui/table'
import type { UserProfile } from './AuthContext'

type Nota = Tables<'notas'>
type Item = Tables<'itens'>
type NotaComItens = Nota & { itens: Item[] }
type SimpleUser = Pick<UserProfile, 'id' | 'display_name' | 'email'>

export function Relatorios() {
  const { user, profile, isAdmin, isOP } = useAuth()
  const [dados, setDados] = useState<NotaComItens[]>([])
  const [users, setUsers] = useState<SimpleUser[]>([])
  const [loading, setLoading] = useState(false)
  const [filters, setFilters] = useState({
      emissor: '',
      dataInicio: '',
      dataFim: '',
      ownerId: '',
      estado: '',
      municipio: '',
      nomeEntidade: ''
  })

  const carregarDadosCompleto = useCallback(async () => {
    setLoading(true)
    try {
        const finalFilters = {
          ...filters,
          ownerId: (isOP && !isAdmin) ? (user?.id || '') : filters.ownerId
        }

        const { data, error } = await selectAllNotas('*, entidades(*), itens (*)', 0, 1000, finalFilters) 
        if (error) throw error
        setDados((data as unknown) as NotaComItens[])

        // LOG DE AUDITORIA (VISUALIZAÇÃO)
        logOperation('VISUALIZACAO', 'relatorios', 'view', { 
          filters: finalFilters, 
          results_count: data?.length || 0 
        }, user || undefined)
    } catch (err) {
        toast.error('Erro ao carregar dados para o relatório.')
        console.error(err)
    } finally {
        setLoading(false)
    }
  }, [filters, user, profile])

  useEffect(() => {
      async function loadUsers() {
          const { data } = await supabase.from('profiles').select('id, display_name, email')
          if (data) setUsers(data as unknown as SimpleUser[])
      }
      loadUsers()
      carregarDadosCompleto()
  }, [carregarDadosCompleto])

  const handleReset = () => {
    setFilters({ emissor: '', dataInicio: '', dataFim: '', ownerId: '', estado: '', municipio: '', nomeEntidade: '' })
  }

  function gerarExcel() {
    if (dados.length === 0) {
        toast.warning('Nenhum dado filtrado para exportar.')
        return
    }

    const rows = dados.map(nota => {
        const owner = users.find(u => u.id === (nota.assigned_to || nota.owner_id))
        const entidade = (nota as any).entidades
        
        // Cálculo de tempo de carga
        let tempoCarga = '—'
        if (nota.distributed_at) {
          const fim = nota.confirmed_at ? new Date(nota.confirmed_at) : new Date()
          const diff = Math.abs(fim.getTime() - new Date(nota.distributed_at).getTime())
          const diffDays = diff / (1000 * 60 * 60 * 24)
          if (diffDays < 1) {
            tempoCarga = 'Menos de 1 dia'
          } else {
            tempoCarga = `${Math.floor(diffDays)} dia(s)`
          }
        }

        return {
            "Responsável": owner ? (owner.display_name || owner.email) : 'N/A',
            "Número Documento": nota.numero_ne,
            "Tipo": nota.tipo_documento,
            "Emissor/Cliente": nota.emissor,
            "Estado": nota.uf || entidade?.estado || '—',
            "Município": entidade?.municipio || '—',
            "Status Geral": nota.status_geral,
            "Tempo de Carga": tempoCarga,
            "Valor Teto": nota.valor_total_teto,
            "Data Emissão": nota.data_emissao ? new Date(nota.data_emissao).toLocaleDateString('pt-BR') : '',
            "Qtd Itens": nota.itens?.length || 0
        }
    })

    const worksheet = XLSX.utils.json_to_sheet(rows)
    const workbook = XLSX.utils.book_new()
    XLSX.utils.book_append_sheet(workbook, worksheet, "Empenhos")
    
    XLSX.writeFile(workbook, `Relatorio_Export_${new Date().toISOString().split('T')[0]}.xlsx`)
    
    // LOG DE AUDITORIA
    logOperation('EXPORT', 'relatorios', 'excel', { 
      filters, 
      results_count: dados.length,
      format: 'xlsx'
    }, user || undefined)

    toast.success('Planilha Excel gerada!')
  }

  function gerarPDF() {
    if (dados.length === 0) {
        toast.warning('Nenhum dado filtrado para exportar.')
        return
    }

    const doc = new jsPDF()

    // Configurações Estéticas do PDF (Simulando o app)
    doc.setFontSize(22)
    doc.setTextColor(30, 41, 59) 
    doc.text("Relatório Geral de Empenhos", 14, 20)
    
    doc.setFontSize(10)
    doc.setTextColor(100) 
    doc.text(`Gerado em: ${new Date().toLocaleDateString('pt-BR')} às ${new Date().toLocaleTimeString('pt-BR')}`, 14, 26)

    // Sumário Rápido
    const totalValor = dados.reduce((acc, n) => acc + (n.valor_total_teto || 0), 0)
    const pendentes = dados.filter(n => n.status_geral !== 'CONCLUIDO').length

    doc.setFillColor(248, 250, 252) 
    doc.roundedRect(14, 35, 182, 25, 2, 2, 'F')
    
    doc.setFontSize(11)
    doc.setTextColor(71, 85, 105)
    doc.text(`Total de Documentos: ${dados.length}`, 20, 45)
    doc.text(`Valor Total Global: ${formatCurrency(totalValor)}`, 20, 52)
    doc.text(`Itens Pendentes/Em Aberto: ${pendentes}`, 110, 45)

    const tableRows = dados.map(nota => {
        const owner = users.find(u => u.id === (nota.assigned_to || nota.owner_id))
        return [
            owner ? (owner.display_name || owner.email) : 'N/A',
            nota.numero_ne,
            nota.emissor || '—',
            nota.tipo_documento || '—',
            nota.data_emissao ? new Date(nota.data_emissao).toLocaleDateString('pt-BR') : '—',
            (nota.status_geral || 'PENDENTE').toUpperCase(),
            formatCurrency(nota.valor_total_teto || 0)
        ]
    })

    autoTable(doc, {
        startY: 70,
        head: [['Responsável', 'Documento', 'Emissor', 'Tipo', 'Emissão', 'Status', 'Valor Teto']],
        body: tableRows,
        theme: 'striped', 
        headStyles: { fillColor: [30, 41, 59], textColor: 255, fontStyle: 'bold' },
        styles: { fontSize: 8, cellPadding: 3 },
    })

    const uniqueClients = Array.from(new Set(dados.map(n => (n.emissor || '').trim()).filter(Boolean)))
    const uniqueNEs = Array.from(new Set(dados.map(n => n.numero_ne).filter(Boolean)))

    const empenhoText = uniqueNEs.length === 1 ? uniqueNEs[0] : (uniqueNEs.length > 1 ? 'Diversos' : '—')
    const clientText = uniqueClients.length === 1 ? uniqueClients[0] : (uniqueClients.length > 1 ? 'Diversos' : '—')

    const limitStr = (str: string, maxLen: number) => {
      if (!str) return '—'
      return str.length <= maxLen ? str : str.substring(0, maxLen) + '...'
    }
    const empenhoClean = limitStr(empenhoText, 25)
    const clientClean = limitStr(clientText, 40)

    const pageCount = doc.getNumberOfPages()
    for (let i = 1; i <= pageCount; i++) {
      doc.setPage(i)
      doc.setFontSize(9)
      doc.setTextColor(100)
      doc.text(`Página ${i} de ${pageCount} | Empenho: ${empenhoClean} | Cliente: ${clientClean}`, 14, 285)
    }

    doc.save(`Relatorio_Geral_${new Date().toISOString().split('T')[0]}.pdf`)

    // LOG DE AUDITORIA
    logOperation('EXPORT', 'relatorios', 'pdf', { 
      filters, 
      results_count: dados.length,
      format: 'pdf'
    }, user || undefined)

    toast.success('Relatório PDF gerado!')
  }

  function gerarPDFSituacaoSimplificado() {
    if (dados.length === 0) {
      toast.warning('Nenhum dado filtrado para exportar.')
      return
    }
    gerarRelatorioSituacaoClienteSimplificadoPDF(filters.emissor || '', dados)

    logOperation('EXPORT', 'relatorios', 'pdf_situacao_simplificado', { 
      filters, 
      results_count: dados.length,
      format: 'pdf'
    }, user || undefined)

    toast.success('Relatório de Situação Simplificado em PDF gerado!')
  }

  const [imprimindoNFs, setImprimindoNFs] = useState(false)

  async function handleImprimirNFsAnexadas() {
    if (dados.length === 0) {
      toast.warning('Nenhum dado filtrado para exportar.')
      return
    }
    setImprimindoNFs(true)
    const toastId = toast.loading('Baixando e compilando os arquivos PDF originais das NFs...')
    try {
      const res = await imprimirNFsAnexadasPDF(filters.emissor || '', dados)
      if (res.success) {
        toast.success(res.message || 'Arquivos compilados para impressão!', { id: toastId })
        logOperation('EXPORT', 'relatorios', 'pdf_nfs_anexadas_print', { 
          filters, 
          results_count: dados.length,
          total_arquivos: res.totalArquivos,
          format: 'pdf'
        }, user || undefined)
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

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-zinc-900 dark:text-white flex items-center gap-2">
            <BarChart3 className="w-6 h-6 text-brand-accent" />
            Relatórios e Exportação
          </h1>
          <p className="text-zinc-500 text-sm">Gere planilhas e PDFs com base nos filtros selecionados.</p>
        </div>
      </div>

      {/* FILTROS */}
      <Card className="border-zinc-200 dark:border-zinc-800 shadow-sm">
        <CardHeader className="pb-3 border-b border-zinc-100 dark:border-zinc-800/50 mb-4">
          <CardTitle className="text-sm font-semibold flex items-center gap-2">
            <Filter className="w-4 h-4 text-zinc-400" />
            Filtros Avançados
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
            <div className="space-y-1.5">
              <Label className="text-xs">Data de Emissão (Início)</Label>
              <Input 
                type="date" 
                value={filters.dataInicio}
                onChange={e => setFilters(prev => ({ ...prev, dataInicio: e.target.value }))}
                className="h-9"
              />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs">Data de Emissão (Fim)</Label>
              <Input 
                type="date" 
                value={filters.dataFim}
                onChange={e => setFilters(prev => ({ ...prev, dataFim: e.target.value }))}
                className="h-9"
              />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs">Município</Label>
              <Input 
                placeholder="Ex: Paragominas"
                value={filters.municipio}
                onChange={e => setFilters(prev => ({ ...prev, municipio: e.target.value }))}
                className="h-9"
              />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs">Estado (UF)</Label>
              <Select 
                value={filters.estado || 'all'}
                onValueChange={val => setFilters(prev => ({ ...prev, estado: val === 'all' ? '' : val }))}
              >
                <SelectTrigger className="h-9 bg-white dark:bg-zinc-900 border-zinc-200 dark:border-zinc-700">
                  <SelectValue placeholder="Brasil (Todos)" />
                </SelectTrigger>
                <SelectContent className="max-h-[300px]">
                  <SelectItem value="all">Brasil (Todos)</SelectItem>
                  {['AC','AL','AP','AM','BA','CE','DF','ES','GO','MA','MT','MS','MG','PA','PB','PR','PE','PI','RJ','RN','RS','RO','RR','SC','SP','SE','TO'].map(uf => (
                    <SelectItem key={uf} value={uf}>{uf}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs">Responsável</Label>
              <Select 
                value={filters.ownerId || 'all'}
                disabled={isOP && !isAdmin}
                onValueChange={val => setFilters(prev => ({ ...prev, ownerId: val === 'all' ? '' : val }))}
              >
                <SelectTrigger className="h-9 bg-white dark:bg-zinc-900 border-zinc-200 dark:border-zinc-700">
                  <SelectValue placeholder={(isOP && !isAdmin) ? 'Apenas Minhas Demandas' : 'Todos os usuários'} />
                </SelectTrigger>
                <SelectContent className="max-h-[300px]">
                  <SelectItem value="all">{(isOP && !isAdmin) ? 'Apenas Minhas Demandas' : 'Todos os usuários'}</SelectItem>
                  {!(isOP && !isAdmin) && users.map(u => (
                    <SelectItem key={u.id} value={u.id}>{u.display_name || u.email}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs">Cliente / NE</Label>
              <div className="relative">
                <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-zinc-400" />
                <Input 
                  placeholder="Nome do cliente ou NE..."
                  value={filters.emissor}
                  onChange={e => setFilters(prev => ({ ...prev, emissor: e.target.value }))}
                  className="pl-9 h-9"
                />
              </div>
            </div>
          </div>
          <div className="flex items-center justify-end gap-2 mt-6">
            <Button variant="ghost" size="sm" onClick={handleReset} className="h-9 gap-1 text-zinc-500">
               <X className="w-4 h-4" /> Limpar
            </Button>
             <Button size="sm" onClick={carregarDadosCompleto} disabled={loading} className="h-9 bg-brand-accent hover:opacity-90 text-white gap-2 shadow-lg shadow-brand-accent/20 font-semibold transition-all">
               {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Search className="w-4 h-4" />}
               Aplicar Filtros
             </Button>
          </div>
        </CardContent>
      </Card>

      {/* EXPORT OPTIONS */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
        <Card className="hover:shadow-md transition-shadow cursor-default border-zinc-200 dark:border-zinc-800">
          <CardHeader>
            <div className="w-12 h-12 rounded-lg bg-emerald-50 dark:bg-emerald-950/30 flex items-center justify-center mb-2">
              <TableIcon className="w-6 h-6 text-emerald-600 dark:text-emerald-400" />
            </div>
            <CardTitle>Exportar Planilha</CardTitle>
            <CardDescription>Arquivo Excel (.xlsx) com todos os campos detalhados para análise.</CardDescription>
          </CardHeader>
          <CardContent>
             <Button onClick={gerarExcel} disabled={loading} className="w-full bg-emerald-600 hover:bg-emerald-700 text-white gap-2">
               <Download className="w-4 h-4" /> Baixar Excel
             </Button>
          </CardContent>
        </Card>

        <Card className="hover:shadow-md transition-shadow cursor-default border-zinc-200 dark:border-zinc-800">
          <CardHeader>
            <div className="w-12 h-12 rounded-lg bg-blue-50 dark:bg-blue-950/30 flex items-center justify-center mb-2">
              <FileDown className="w-6 h-6 text-blue-600 dark:text-blue-400" />
            </div>
            <CardTitle>PDF Geral</CardTitle>
            <CardDescription>Relatório formatado para impressão com resumo financeiro e lista de documentos.</CardDescription>
          </CardHeader>
          <CardContent>
             <Button onClick={gerarPDF} disabled={loading} className="w-full bg-brand-accent hover:opacity-90 text-white gap-2 shadow-lg shadow-brand-accent/20 font-semibold transition-all">
               <FileText className="w-4 h-4" /> Baixar PDF Geral
             </Button>
          </CardContent>
        </Card>

        <Card className="hover:shadow-md transition-shadow cursor-default border-zinc-200 dark:border-zinc-800">
          <CardHeader>
            <div className="w-12 h-12 rounded-lg bg-indigo-50 dark:bg-indigo-950/30 flex items-center justify-center mb-2">
              <FileText className="w-6 h-6 text-indigo-600 dark:text-indigo-400" />
            </div>
            <CardTitle>Situação Simplificado</CardTitle>
            <CardDescription>Resumo de KPIs e lista de empenhos com valores e NFs, sem detalhamento de itens.</CardDescription>
          </CardHeader>
          <CardContent>
             <Button onClick={gerarPDFSituacaoSimplificado} disabled={loading} className="w-full bg-indigo-600 hover:bg-indigo-700 text-white gap-2 shadow-lg shadow-indigo-600/20 font-semibold transition-all">
               <FileText className="w-4 h-4" /> Baixar PDF Simplificado
             </Button>
          </CardContent>
        </Card>

        <Card className="hover:shadow-md transition-shadow cursor-default border-zinc-200 dark:border-zinc-800">
          <CardHeader>
            <div className="w-12 h-12 rounded-lg bg-purple-50 dark:bg-purple-950/30 flex items-center justify-center mb-2">
              <Printer className="w-6 h-6 text-purple-600 dark:text-purple-400" />
            </div>
            <CardTitle>Imprimir NFs na Íntegra</CardTitle>
            <CardDescription>Compila e junta todos os arquivos PDF originais das NFs/DAVs anexadas para impressão imediata.</CardDescription>
          </CardHeader>
          <CardContent>
             <Button onClick={handleImprimirNFsAnexadas} disabled={loading || imprimindoNFs} className="w-full bg-purple-600 hover:bg-purple-700 text-white gap-2 shadow-lg shadow-purple-600/20 font-semibold transition-all">
               {imprimindoNFs ? <Loader2 className="w-4 h-4 animate-spin" /> : <Printer className="w-4 h-4" />} Imprimir NFs (Anexos)
             </Button>
          </CardContent>
        </Card>
      </div>

      {/* PREVIEW */}
      <Card className="border-zinc-200 dark:border-zinc-800 overflow-hidden">
        <CardHeader className="bg-zinc-50 dark:bg-zinc-900/60 border-b border-zinc-200 dark:border-zinc-800">
           <CardTitle className="text-sm font-medium">Pré-visualização dos Dados ({dados.length} resultados)</CardTitle>
        </CardHeader>
        <div className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Documento</TableHead>
                <TableHead>Emissor</TableHead>
                <TableHead className="text-right">Valor Teto</TableHead>
                <TableHead>Status</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {dados.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={4} className="h-24 text-center text-zinc-500">Nenhum dado encontrado com os filtros atuais.</TableCell>
                </TableRow>
              ) : (
                dados.slice(0, 10).map((d) => (
                  <TableRow key={d.id}>
                     <TableCell className="font-medium text-brand-accent">{d.numero_ne}</TableCell>
                    <TableCell>{d.emissor || '—'}</TableCell>
                    <TableCell className="text-right tabular-nums">{formatCurrency(d.valor_total_teto)}</TableCell>
                    <TableCell>
                      <span className={`text-[10px] font-bold uppercase px-2 py-0.5 rounded-full ${d.status_geral === 'CONCLUIDO' ? 'bg-emerald-100 text-emerald-700' : 'bg-amber-100 text-amber-700'}`}>
                        {d.status_geral || 'PENDENTE'}
                      </span>
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
          {dados.length > 10 && (
            <div className="p-4 text-center text-xs text-zinc-500 border-t border-zinc-100 dark:border-zinc-800">
               Exibindo os primeiros 10 de {dados.length} registros selecionados.
            </div>
          )}
        </div>
      </Card>
    </div>
  )
}
