import { useState, useEffect, useMemo } from 'react'
import { supabase } from '../lib/supabase'
import { toast } from 'sonner'
import { 
  DollarSign, 
  Plus, 
  Trash2, 
  Link2, 
  Unlink, 
  FileText, 
  CheckCircle2, 
  ClipboardList, 
  Building2, 
  Sparkles, 
  AlertTriangle,
  FilterX,
  FileSpreadsheet
} from 'lucide-react'
import { Card } from '../components/ui/card'
import { Button } from '../components/ui/button'
import { Input } from '../components/ui/input'
import { Badge } from '../components/ui/badge'
import { Select, SelectTrigger, SelectValue, SelectContent, SelectItem } from '../components/ui/select'
import * as XLSX from 'xlsx'

interface Entidade {
  id: any
  nome: string
  municipio: string | null
  estado: string | null
}



interface FinanceiroDocumento {
  id: number
  tipo: 'ATESTO' | 'NF'
  numero: string
  data: string
  empresa: 'APROMEDICA' | 'ROSAFARM'
  entidade_id: any
  valor: number
  observacao: string | null
  vendedor_id: string | null
  historico_entrega_numero: string | null
  vinculo_id: string | null
  created_at: string
}

interface VendorDeliveryGroup {
  numero_nf: string
  venda_tipo: string | null
  data: string
  vendedor_id: string | null
  vendedor_nome: string
  entidade_id: any
  entidade_nome: string
  entidade_municipio: string | null
  entidade_estado: string | null
  empresa: 'APROMEDICA' | 'ROSAFARM'
  valor_total: number
  jaImportado: boolean
}

export function Financeiro() {
  const [loading, setLoading] = useState(true)
  const [tab, setTab] = useState<'planilha' | 'documentos' | 'conciliar' | 'importar'>('planilha')

  // Dados do BD
  const [documentos, setDocumentos] = useState<FinanceiroDocumento[]>([])
  const [entidades, setEntidades] = useState<Entidade[]>([])
  const [vendasRaw, setVendasRaw] = useState<any[]>([])

  // Filtros
  const [filtroEntidade, setFiltroEntidade] = useState<string>('all')
  const [filtroEmpresa, setFiltroEmpresa] = useState<string>('all')

  // Modais e Formulários
  const [showAddModal, setShowAddModal] = useState(false)
  const [novoDoc, setNovoDoc] = useState<{
    tipo: 'ATESTO' | 'NF'
    numero: string
    data: string
    empresa: 'APROMEDICA' | 'ROSAFARM'
    entidade_id: string
    valor: string
    observacao: string
  }>({
    tipo: 'ATESTO',
    numero: '',
    data: new Date().toISOString().split('T')[0],
    empresa: 'APROMEDICA',
    entidade_id: '',
    valor: '',
    observacao: ''
  })

  // Seleções para Conciliação
  const [selectedAtestos, setSelectedAtestos] = useState<number[]>([])
  const [selectedNfs, setSelectedNfs] = useState<number[]>([])

  useEffect(() => {
    loadAllData()
  }, [])

  async function loadAllData() {
    setLoading(true)
    try {
      // 1. Carrega documentos do Financeiro
      const { data: docs, error: errorDocs } = await supabase
        .from('financeiro_documentos')
        .select('*')
        .order('data', { ascending: false })
      if (errorDocs) throw errorDocs
      setDocumentos(docs || [])

      // 2. Carrega entidades
      const { data: ents, error: errorEnts } = await supabase
        .from('entidades')
        .select('id, nome, municipio, estado')
        .order('nome')
      if (errorEnts) throw errorEnts
      setEntidades((ents as any) || [])

      // 3. Carrega profiles
      const { data: prfs, error: errorPrfs } = await supabase
        .from('profiles')
        .select('id, display_name, email')
      if (errorPrfs) throw errorPrfs

      // 4. Carrega histórico de entregas (vendas na ponta) com itens e notas para calcular o valor
      // Para evitar joins complexos que podem falhar no TS ou no RLS, faremos o fetch simples e mapeamos na memória.
      const [
        { data: hist },
        { data: itens },
        { data: itensAta },
        { data: notas },
        { data: atas }
      ] = await Promise.all([
        supabase.from('historico_entregas').select('*'),
        supabase.from('itens').select('id, valor_unitario, nota_id'),
        supabase.from('itens_ata').select('id, valor_unitario, ata_id'),
        supabase.from('notas').select('id, entidade_id, emissor'),
        supabase.from('atas').select('id, entidade_id, numero_arp')
      ])

      // Mapear dados para reconstituição de valores e metadados
      const mappedVendas = (hist || []).map(row => {
        let valorUnitario = 0
        let entidadeId: any = null
        let emissor = ''

        if (row.item_id) {
          const matchedItem = (itens || []).find(i => i.id === row.item_id)
          if (matchedItem) {
            valorUnitario = matchedItem.valor_unitario || 0
            const matchedNota = (notas || []).find(n => n.id === matchedItem.nota_id)
            if (matchedNota) {
              entidadeId = matchedNota.entidade_id
              emissor = matchedNota.emissor || ''
            }
          }
        } else if (row.item_ata_id) {
          const matchedItemAta = (itensAta || []).find(ia => ia.id === row.item_ata_id)
          if (matchedItemAta) {
            valorUnitario = matchedItemAta.valor_unitario || 0
            const matchedAta = (atas || []).find(a => a.id === matchedItemAta.ata_id)
            if (matchedAta) {
              entidadeId = matchedAta.entidade_id
              emissor = 'APROMEDICA' // Default corporativo para ATA
            }
          }
        }

        const matchedProfile = (prfs || []).find(p => p.id === row.vendedor_id)
        const matchedEnt = (ents || []).find(e => String(e.id) === String(entidadeId))

        return {
          ...row,
          valor_unitario: valorUnitario,
          entidade_id: entidadeId,
          entidade_nome: matchedEnt?.nome || 'Cliente não identificado',
          entidade_municipio: matchedEnt?.municipio || null,
          entidade_estado: matchedEnt?.estado || null,
          vendedor_nome: matchedProfile?.display_name || matchedProfile?.email || 'N/A',
          emissor: emissor
        }
      })

      setVendasRaw(mappedVendas)
    } catch (err: any) {
      console.error(err)
      toast.error('Erro ao carregar dados do financeiro')
    } finally {
      setLoading(false)
    }
  }

  // Agrega lançamentos dos vendedores por número de NF/Pedido
  const vendedorGroups = useMemo<VendorDeliveryGroup[]>(() => {
    const groups: Record<string, any> = {}

    vendasRaw.forEach(item => {
      const rawNum = item.numero_nf || 'S/N'
      if (!groups[rawNum]) {
        groups[rawNum] = {
          numero_nf: rawNum,
          venda_tipo: rawNum.includes('PEDIDO:') ? 'ATESTO' : 'NF',
          data: item.data_entrega || item.created_at,
          vendedor_id: item.vendedor_id,
          vendedor_nome: item.vendedor_nome,
          entidade_id: item.entidade_id,
          entidade_nome: item.entidade_nome,
          entidade_municipio: item.entidade_municipio,
          entidade_estado: item.entidade_estado,
          empresa: String(item.emissor || '').toUpperCase().includes('ROSAFARM') ? 'ROSAFARM' : 'APROMEDICA',
          valor_total: 0
        }
      }
      groups[rawNum].valor_total += (item.quantidade_entregue || 0) * (item.valor_unitario || 0)
    })

    return Object.values(groups).map(g => {
      // Verifica se o número já existe cadastrado na tabela de documentos oficiais do financeiro
      const jaImportado = documentos.some(d => d.historico_entrega_numero === g.numero_nf)
      return { ...g, jaImportado }
    })
  }, [vendasRaw, documentos])

  // Filtra documentos do financeiro ativos
  const filteredDocs = useMemo(() => {
    return documentos.filter(doc => {
      if (filtroEntidade !== 'all' && String(doc.entidade_id) !== filtroEntidade) return false
      if (filtroEmpresa !== 'all' && doc.empresa !== filtroEmpresa) return false
      return true
    })
  }, [documentos, filtroEntidade, filtroEmpresa])

  // Indicadores
  const stats = useMemo(() => {
    const totalAtesto = filteredDocs.filter(d => d.tipo === 'ATESTO').reduce((acc, curr) => acc + curr.valor, 0)
    const totalNf = filteredDocs.filter(d => d.tipo === 'NF').reduce((acc, curr) => acc + curr.valor, 0)
    const saldo = totalAtesto - totalNf
    return { totalAtesto, totalNf, saldo }
  }, [filteredDocs])

  // Planilha Lado a Lado (Conciliação)
  // Monta as linhas de dados conciliados e avulsos
  const spreadsheetRows = useMemo(() => {
    // 1. Agrupa os documentos conciliados pelo vinculo_id
    const conciliados = filteredDocs.filter(d => d.vinculo_id !== null)
    const grupos: Record<string, { atestos: FinanceiroDocumento[], nfs: FinanceiroDocumento[] }> = {}

    conciliados.forEach(doc => {
      const vid = doc.vinculo_id!
      if (!grupos[vid]) {
        grupos[vid] = { atestos: [], nfs: [] }
      }
      if (doc.tipo === 'ATESTO') {
        grupos[vid].atestos.push(doc)
      } else {
        grupos[vid].nfs.push(doc)
      }
    })

    const rows: Array<{
      vinculo_id: string | null
      atesto: FinanceiroDocumento | null
      nf: FinanceiroDocumento | null
      data_ordenacao: string
    }> = []

    // Adiciona linhas conciliadas emparelhadas lado a lado
    Object.entries(grupos).forEach(([vid, g]) => {
      const maxLen = Math.max(g.atestos.length, g.nfs.length)
      for (let i = 0; i < maxLen; i++) {
        const at = g.atestos[i] || null
        const nf = g.nfs[i] || null
        rows.push({
          vinculo_id: vid,
          atesto: at,
          nf: nf,
          data_ordenacao: at?.data || nf?.data || ''
        })
      }
    })

    // 2. Adiciona os Atestados não conciliados
    const atestosAvulsos = filteredDocs.filter(d => d.tipo === 'ATESTO' && d.vinculo_id === null)
    atestosAvulsos.forEach(at => {
      rows.push({
        vinculo_id: null,
        atesto: at,
        nf: null,
        data_ordenacao: at.data
      })
    })

    // 3. Adiciona as NFs não conciliadas
    const nfsAvulsas = filteredDocs.filter(d => d.tipo === 'NF' && d.vinculo_id === null)
    nfsAvulsas.forEach(nf => {
      rows.push({
        vinculo_id: null,
        atesto: null,
        nf: nf,
        data_ordenacao: nf.data
      })
    })

    // Ordena de forma decrescente pela data do documento
    return rows.sort((a, b) => new Date(b.data_ordenacao).getTime() - new Date(a.data_ordenacao).getTime())
  }, [filteredDocs])

  // Ações de Vínculo e Conciliação
  async function handleConciliar() {
    if (selectedAtestos.length === 0 || selectedNfs.length === 0) {
      toast.warning('Selecione pelo menos um Atestado e uma Nota Fiscal para vincular.')
      return
    }

    const vinculoId = crypto.randomUUID()
    const targetIds = [...selectedAtestos, ...selectedNfs]

    try {
      const { error } = await supabase
        .from('financeiro_documentos')
        .update({ vinculo_id: vinculoId })
        .in('id', targetIds)

      if (error) throw error

      toast.success('Documentos vinculados com sucesso!')
      setSelectedAtestos([])
      setSelectedNfs([])
      setTab('planilha')
      loadAllData()
    } catch (err: any) {
      console.error(err)
      toast.error('Erro ao conciliar documentos.')
    }
  }

  async function handleDesvincular(vinculoId: string) {
    try {
      const { error } = await supabase
        .from('financeiro_documentos')
        .update({ vinculo_id: null })
        .eq('vinculo_id', vinculoId)

      if (error) throw error

      toast.success('Vínculo desfeito com sucesso!')
      loadAllData()
    } catch (err: any) {
      console.error(err)
      toast.error('Erro ao desvincular documentos.')
    }
  }

  // Ações de Cadastro de Documento
  async function handleAddDocument(e: React.FormEvent) {
    e.preventDefault()
    if (!novoDoc.numero || !novoDoc.valor || !novoDoc.entidade_id) {
      toast.warning('Preencha os campos obrigatórios: Número, Valor e Cliente.')
      return
    }

    try {
      const { error } = await supabase.from('financeiro_documentos').insert([{
        tipo: novoDoc.tipo,
        numero: novoDoc.numero,
        data: novoDoc.data,
        empresa: novoDoc.empresa,
        entidade_id: novoDoc.entidade_id || null,
        valor: parseFloat(novoDoc.valor),
        observacao: novoDoc.observacao || null
      }])

      if (error) throw error

      toast.success('Documento cadastrado com sucesso!')
      setShowAddModal(false)
      setNovoDoc({
        tipo: 'ATESTO',
        numero: '',
        data: new Date().toISOString().split('T')[0],
        empresa: 'APROMEDICA',
        entidade_id: '',
        valor: '',
        observacao: ''
      })
      loadAllData()
    } catch (err: any) {
      console.error(err)
      toast.error('Erro ao cadastrar documento.')
    }
  }

  async function handleDeleteDocument(id: number) {
    if (!window.confirm('Tem certeza que deseja deletar este documento?')) return
    try {
      const { error } = await supabase.from('financeiro_documentos').delete().eq('id', id)
      if (error) throw error
      toast.success('Documento excluído!')
      loadAllData()
    } catch (err: any) {
      console.error(err)
      toast.error('Erro ao excluir documento.')
    }
  }

  // Importar do Vendedor
  async function handleImportVendedor(group: VendorDeliveryGroup) {
    try {
      // Limpa os termos de tag PEDIDO para salvar o número puro
      const numLimpo = group.numero_nf.replace('PEDIDO:', '').replace('(Provisória)', '').trim()

      const { error } = await supabase.from('financeiro_documentos').insert([{
        tipo: group.venda_tipo as 'ATESTO' | 'NF',
        numero: numLimpo,
        data: new Date(group.data).toISOString().split('T')[0],
        empresa: group.empresa,
        entidade_id: group.entidade_id,
        valor: group.valor_total,
        vendedor_id: group.vendedor_id,
        historico_entrega_numero: group.numero_nf,
        observacao: 'Importado de Lançamentos de Vendas'
      }])

      if (error) throw error

      toast.success(`Documento ${group.numero_nf} importado com sucesso!`)
      loadAllData()
    } catch (err: any) {
      console.error(err)
      toast.error('Erro ao importar documento do vendedor.')
    }
  }

  // Auxiliares de Formatação
  const formatCurrency = (val: number) => {
    return val.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })
  }

  const exportPlanilha = () => {
    const rows = spreadsheetRows.map(r => ({
      'DATA ATESTO': r.atesto?.data ? new Date(r.atesto.data).toLocaleDateString('pt-BR') : '',
      'Nº ATESTO': r.atesto?.numero || '',
      'EMPRESA (ATESTO)': r.atesto?.empresa || '',
      'CIDADE': r.atesto ? entidades.find(e => e.id === r.atesto?.entidade_id)?.nome || '—' : '',
      'VALOR ATESTO': r.atesto?.valor || 0,
      'Nº NF': r.nf?.numero || '',
      'EMPRESA (NF)': r.nf?.empresa || '',
      'VALOR NF': r.nf?.valor || 0,
      'DIFERENÇA (SALDO)': (r.atesto?.valor || 0) - (r.nf?.valor || 0),
      'OBSERVAÇÕES': r.atesto?.observacao || r.nf?.observacao || ''
    }))

    const ws = XLSX.utils.json_to_sheet(rows)
    const wb = XLSX.utils.book_new()
    XLSX.utils.book_append_sheet(wb, ws, "Controle Conciliado")
    XLSX.writeFile(wb, `Nexus_Conciliacao_Financeiro_${new Date().toISOString().split('T')[0]}.xlsx`)
    toast.success('Spreadsheet exportada!')
  }

  return (
    <div className="space-y-6 pb-12 max-w-[1600px] mx-auto">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-4 border-b border-zinc-200/70 dark:border-zinc-800/70">
        <div>
          <div className="flex items-center gap-2">
            <div className="p-2 bg-emerald-500/10 rounded-lg text-emerald-600 dark:text-emerald-400">
              <DollarSign className="w-6 h-6" />
            </div>
            <div>
              <h1 className="text-xl sm:text-2xl font-bold tracking-tight text-zinc-900 dark:text-zinc-100 flex items-center gap-1.5">
                Controle e Conciliação Financeira
              </h1>
              <p className="text-xs text-zinc-500 dark:text-zinc-400 mt-0.5">
                Validação de atestados de fornecimento (Pedidos/DAVs) e notas fiscais com cruzamento integrado.
              </p>
            </div>
          </div>
        </div>

        <div className="flex items-center gap-2 self-start sm:self-center">
          <Button 
            onClick={() => setShowAddModal(true)} 
            className="bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold uppercase tracking-wider rounded-xl gap-2 h-10 px-4 transition-colors"
          >
            <Plus className="w-4 h-4" /> Adicionar Documento
          </Button>
          <Button 
            onClick={exportPlanilha} 
            variant="outline"
            className="text-xs font-bold uppercase tracking-wider rounded-xl gap-2 h-10 px-4 border-zinc-200 dark:border-zinc-800"
          >
            <FileSpreadsheet className="w-4 h-4" /> Exportar Planilha
          </Button>
        </div>
      </div>

      {/* Filtros */}
      <Card className="bg-white dark:bg-zinc-900 border-zinc-200/80 dark:border-zinc-800 p-4 shadow-sm">
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 items-end">
          <div className="space-y-1">
            <label className="text-[10px] font-bold uppercase text-zinc-400 tracking-wider flex items-center gap-1">
              <Building2 className="w-3.5 h-3.5" /> Cliente / Órgão
            </label>
            <Select value={filtroEntidade} onValueChange={setFiltroEntidade}>
              <SelectTrigger className="h-9 text-xs rounded-lg border-zinc-200 dark:border-zinc-700">
                <SelectValue placeholder="Todos os Clientes" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all" className="font-semibold">Todos os Clientes</SelectItem>
                {entidades.map(e => (
                  <SelectItem key={e.id} value={String(e.id)}>{e.nome} ({e.municipio || '—'})</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-1">
            <label className="text-[10px] font-bold uppercase text-zinc-400 tracking-wider flex items-center gap-1">
              <Sparkles className="w-3.5 h-3.5" /> Empresa
            </label>
            <Select value={filtroEmpresa} onValueChange={setFiltroEmpresa}>
              <SelectTrigger className="h-9 text-xs rounded-lg border-zinc-200 dark:border-zinc-700">
                <SelectValue placeholder="Todas as Empresas" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all" className="font-semibold">Todas as Empresas</SelectItem>
                <SelectItem value="APROMEDICA">APROMEDICA</SelectItem>
                <SelectItem value="ROSAFARM">ROSAFARM</SelectItem>
              </SelectContent>
            </Select>
          </div>

          {(filtroEntidade !== 'all' || filtroEmpresa !== 'all') && (
            <Button 
              variant="ghost" 
              onClick={() => { setFiltroEntidade('all'); setFiltroEmpresa('all'); }}
              className="h-9 px-3 text-xs font-medium gap-1.5 text-zinc-500 hover:text-rose-600 rounded-lg self-start md:self-end"
            >
              <FilterX className="w-3.5 h-3.5" /> Limpar Filtros
            </Button>
          )}
        </div>
      </Card>

      {/* Cards de Métricas */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <Card className="bg-white dark:bg-zinc-900 border-zinc-200/80 dark:border-zinc-800 p-5 shadow-xs relative overflow-hidden flex flex-col justify-between">
          <div>
            <span className="text-[10px] font-bold uppercase tracking-wider text-zinc-400">Total Atestado Emitido (Pedidos)</span>
            <p className="text-xl sm:text-2xl font-black mt-1 text-sky-600 dark:text-sky-400">
              {formatCurrency(stats.totalAtesto)}
            </p>
          </div>
          <p className="text-[10px] text-zinc-400 mt-2">Valor acumulado de fornecimentos autorizados</p>
        </Card>

        <Card className="bg-white dark:bg-zinc-900 border-zinc-200/80 dark:border-zinc-800 p-5 shadow-xs relative overflow-hidden flex flex-col justify-between">
          <div>
            <span className="text-[10px] font-bold uppercase tracking-wider text-zinc-400">Total Notas Emitidas (Faturamento)</span>
            <p className="text-xl sm:text-2xl font-black mt-1 text-emerald-600 dark:text-emerald-400">
              {formatCurrency(stats.totalNf)}
            </p>
          </div>
          <p className="text-[10px] text-zinc-400 mt-2">Valor total de faturamento fiscal realizado</p>
        </Card>

        <Card className="bg-white dark:bg-zinc-900 border-zinc-200/80 dark:border-zinc-800 p-5 shadow-xs relative overflow-hidden flex flex-col justify-between">
          <div>
            <span className="text-[10px] font-bold uppercase tracking-wider text-zinc-400">Saldo a Emitir</span>
            <p className={`text-xl sm:text-2xl font-black mt-1 ${
              stats.saldo > 0 ? 'text-amber-500' : stats.saldo < 0 ? 'text-rose-600 dark:text-rose-400' : 'text-emerald-600'
            }`}>
              {formatCurrency(stats.saldo)}
            </p>
          </div>
          <div className="flex items-center gap-1 mt-2">
            {stats.saldo > 0 ? (
              <span className="text-[10px] text-amber-500 font-medium flex items-center gap-1">
                <AlertTriangle className="w-3 h-3" /> Temos entregas a faturar
              </span>
            ) : stats.saldo < 0 ? (
              <span className="text-[10px] text-rose-500 font-medium flex items-center gap-1">
                <AlertTriangle className="w-3 h-3" /> Faturamento excede pedidos autorizados
              </span>
            ) : (
              <span className="text-[10px] text-emerald-500 font-medium flex items-center gap-1">
                <CheckCircle2 className="w-3 h-3" /> Faturamento 100% conciliado
              </span>
            )}
          </div>
        </Card>
      </div>

      {/* Tabs */}
      <div className="flex gap-1 bg-zinc-100 dark:bg-zinc-900/50 p-1 rounded-2xl border border-zinc-200 dark:border-zinc-800 w-fit">
        <button
          onClick={() => setTab('planilha')}
          className={`flex items-center gap-2 px-5 py-2.5 rounded-xl text-xs font-bold uppercase tracking-wider transition-all ${
            tab === 'planilha'
              ? 'bg-white dark:bg-zinc-800 text-zinc-900 dark:text-zinc-100 shadow-sm'
              : 'text-zinc-500 hover:text-zinc-700 dark:hover:text-zinc-300'
          }`}
        >
          <FileSpreadsheet className="w-3.5 h-3.5" /> Planilha de Controle
        </button>

        <button
          onClick={() => setTab('conciliar')}
          className={`flex items-center gap-2 px-5 py-2.5 rounded-xl text-xs font-bold uppercase tracking-wider transition-all ${
            tab === 'conciliar'
              ? 'bg-white dark:bg-zinc-800 text-zinc-900 dark:text-zinc-100 shadow-sm'
              : 'text-zinc-500 hover:text-zinc-700 dark:hover:text-zinc-300'
          }`}
        >
          <Link2 className="w-3.5 h-3.5" /> Conciliar Pendentes
        </button>

        <button
          onClick={() => setTab('documentos')}
          className={`flex items-center gap-2 px-5 py-2.5 rounded-xl text-xs font-bold uppercase tracking-wider transition-all ${
            tab === 'documentos'
              ? 'bg-white dark:bg-zinc-800 text-zinc-900 dark:text-zinc-100 shadow-sm'
              : 'text-zinc-500 hover:text-zinc-700 dark:hover:text-zinc-300'
          }`}
        >
          <FileText className="w-3.5 h-3.5" /> Documentos Lançados
        </button>

        <button
          onClick={() => setTab('importar')}
          className={`flex items-center gap-2 px-5 py-2.5 rounded-xl text-xs font-bold uppercase tracking-wider transition-all relative ${
            tab === 'importar'
              ? 'bg-white dark:bg-zinc-800 text-zinc-900 dark:text-zinc-100 shadow-sm'
              : 'text-zinc-500 hover:text-zinc-700 dark:hover:text-zinc-300'
          }`}
        >
          <ClipboardList className="w-3.5 h-3.5" /> Importar do Vendedor
          {vendedorGroups.filter(g => !g.jaImportado).length > 0 && (
            <span className="absolute -top-1 -right-1 flex h-4 w-4 items-center justify-center rounded-full bg-rose-500 text-[8px] font-black text-white">
              {vendedorGroups.filter(g => !g.jaImportado).length}
            </span>
          )}
        </button>
      </div>

      {/* CONTEÚDO DA TAB */}
      {loading ? (
        <div className="py-12 text-center text-zinc-500">Carregando dados...</div>
      ) : (
        <>
          {/* TAB 1: PLANILHA DE CONTROLE */}
          {tab === 'planilha' && (
            <Card className="bg-white dark:bg-zinc-900 border-zinc-200/80 dark:border-zinc-800 shadow-xs overflow-hidden">
              <div className="overflow-x-auto">
                <table className="w-full text-left text-xs border-collapse">
                  <thead className="bg-zinc-50 dark:bg-zinc-800 border-b border-zinc-200 dark:border-zinc-700 text-zinc-500 font-bold uppercase tracking-wider text-[10px]">
                    <tr>
                      <th className="px-4 py-3 text-center bg-sky-500/5 dark:bg-sky-500/10 border-r border-zinc-200 dark:border-zinc-700" colSpan={5}>
                        Atesto / Pedido de Fornecimento
                      </th>
                      <th className="px-4 py-3 text-center bg-emerald-500/5 dark:bg-emerald-500/10 border-r border-zinc-200 dark:border-zinc-700" colSpan={3}>
                        Nota Fiscal (Faturamento)
                      </th>
                      <th className="px-4 py-3 text-center" colSpan={3}>
                        Conciliação e Observações
                      </th>
                    </tr>
                    <tr className="border-t border-zinc-200 dark:border-zinc-700">
                      {/* Atesto columns */}
                      <th className="px-4 py-2 border-r border-zinc-200 dark:border-zinc-700">Data</th>
                      <th className="px-4 py-2 border-r border-zinc-200 dark:border-zinc-700">Nº Atesto</th>
                      <th className="px-4 py-2 border-r border-zinc-200 dark:border-zinc-700">Empresa</th>
                      <th className="px-4 py-2 border-r border-zinc-200 dark:border-zinc-700">Cidade</th>
                      <th className="px-4 py-2 border-r border-zinc-200 dark:border-zinc-700 bg-sky-500/5 dark:bg-sky-500/10">Valor</th>
                      {/* NF columns */}
                      <th className="px-4 py-2 border-r border-zinc-200 dark:border-zinc-700">Nº NF</th>
                      <th className="px-4 py-2 border-r border-zinc-200 dark:border-zinc-700">Empresa</th>
                      <th className="px-4 py-2 border-r border-zinc-200 dark:border-zinc-700 bg-emerald-500/5 dark:bg-emerald-500/10">Valor</th>
                      {/* Reconciliation columns */}
                      <th className="px-4 py-2 border-r border-zinc-200 dark:border-zinc-700 text-center">Saldo</th>
                      <th className="px-4 py-2 border-r border-zinc-200 dark:border-zinc-700">Observação</th>
                      <th className="px-4 py-2 text-center">Ações</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-zinc-200 dark:divide-zinc-800">
                    {spreadsheetRows.length === 0 ? (
                      <tr>
                        <td colSpan={11} className="px-4 py-12 text-center text-zinc-500">
                          Nenhum registro para exibir. Escolha outros filtros ou adicione novos documentos.
                        </td>
                      </tr>
                    ) : (
                      spreadsheetRows.map((row, idx) => {
                        const isConciliado = row.vinculo_id !== null
                        const atVal = row.atesto?.valor || 0
                        const nfVal = row.nf?.valor || 0
                        const diff = atVal - nfVal

                        return (
                          <tr key={idx} className={`hover:bg-zinc-50 dark:hover:bg-zinc-800/40 transition-colors ${
                            !isConciliado ? 'bg-zinc-50/40 dark:bg-zinc-900/30' : ''
                          }`}>
                            {/* Atesto cells */}
                            <td className="px-4 py-2.5 border-r border-zinc-200 dark:border-zinc-700 text-zinc-500 whitespace-nowrap">
                              {row.atesto?.data ? new Date(row.atesto.data).toLocaleDateString('pt-BR') : '—'}
                            </td>
                            <td className="px-4 py-2.5 border-r border-zinc-200 dark:border-zinc-700 font-medium">
                              {row.atesto?.numero || '—'}
                            </td>
                            <td className="px-4 py-2.5 border-r border-zinc-200 dark:border-zinc-700">
                              {row.atesto ? (
                                <Badge variant={row.atesto.empresa === 'ROSAFARM' ? 'secondary' : 'outline'} className="text-[9px] uppercase font-bold py-0 h-4">
                                  {row.atesto.empresa}
                                </Badge>
                              ) : '—'}
                            </td>
                            <td className="px-4 py-2.5 border-r border-zinc-200 dark:border-zinc-700 text-zinc-600 dark:text-zinc-300 truncate max-w-[120px]">
                              {row.atesto ? entidades.find(e => e.id === row.atesto?.entidade_id)?.nome || '—' : '—'}
                            </td>
                            <td className="px-4 py-2.5 border-r border-zinc-200 dark:border-zinc-700 font-bold bg-sky-500/5 dark:bg-sky-500/10 text-sky-600 dark:text-sky-400">
                              {row.atesto ? formatCurrency(row.atesto.valor) : '—'}
                            </td>

                            {/* NF cells */}
                            <td className="px-4 py-2.5 border-r border-zinc-200 dark:border-zinc-700 font-medium">
                              {row.nf?.numero || '—'}
                            </td>
                            <td className="px-4 py-2.5 border-r border-zinc-200 dark:border-zinc-700">
                              {row.nf ? (
                                <Badge variant={row.nf.empresa === 'ROSAFARM' ? 'secondary' : 'outline'} className="text-[9px] uppercase font-bold py-0 h-4">
                                  {row.nf.empresa}
                                </Badge>
                              ) : '—'}
                            </td>
                            <td className="px-4 py-2.5 border-r border-zinc-200 dark:border-zinc-700 font-bold bg-emerald-500/5 dark:bg-emerald-500/10 text-emerald-600 dark:text-emerald-400">
                              {row.nf ? formatCurrency(row.nf.valor) : '—'}
                            </td>

                            {/* Diff / Status cells */}
                            <td className={`px-4 py-2.5 border-r border-zinc-200 dark:border-zinc-700 font-bold text-center ${
                              diff > 0 ? 'text-amber-500' : diff < 0 ? 'text-rose-600 dark:text-rose-400' : 'text-emerald-600'
                            }`}>
                              {isConciliado || (row.atesto && row.nf) ? formatCurrency(diff) : '—'}
                            </td>
                            <td className="px-4 py-2.5 border-r border-zinc-200 dark:border-zinc-700 text-zinc-500 truncate max-w-[150px]" title={row.atesto?.observacao || row.nf?.observacao || ''}>
                              {row.atesto?.observacao || row.nf?.observacao || '—'}
                            </td>
                            <td className="px-4 py-2.5 text-center">
                              {isConciliado ? (
                                <Button
                                  onClick={() => handleDesvincular(row.vinculo_id!)}
                                  variant="ghost"
                                  size="icon"
                                  className="h-7 w-7 text-rose-500 hover:text-rose-600 hover:bg-rose-50 dark:hover:bg-rose-950/30 rounded-lg"
                                  title="Desfazer Conciliação"
                                >
                                  <Unlink className="w-3.5 h-3.5" />
                                </Button>
                              ) : (
                                <span className="text-[10px] text-zinc-400 italic">Avulso</span>
                              )}
                            </td>
                          </tr>
                        )
                      })
                    )}
                  </tbody>
                </table>
              </div>
            </Card>
          )}

          {/* TAB 2: CONCILIAR PENDENTES */}
          {tab === 'conciliar' && (
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
              {/* Painel Esquerdo: Atestados não vinculados */}
              <Card className="bg-white dark:bg-zinc-900 border-zinc-200/80 dark:border-zinc-800 p-4 shadow-sm flex flex-col justify-between h-[500px]">
                <div>
                  <h3 className="text-sm font-bold uppercase tracking-wider text-zinc-400 flex items-center gap-1">
                    <ClipboardList className="w-4 h-4 text-sky-500" /> Atestados sem NF correspondente
                  </h3>
                  <div className="mt-4 space-y-2 overflow-y-auto max-h-[380px] pr-2">
                    {filteredDocs.filter(d => d.tipo === 'ATESTO' && d.vinculo_id === null).length === 0 ? (
                      <p className="text-xs text-zinc-500 py-6 text-center italic">Nenhum Atestado pendente.</p>
                    ) : (
                      filteredDocs
                        .filter(d => d.tipo === 'ATESTO' && d.vinculo_id === null)
                        .map(at => (
                          <div 
                            key={at.id}
                            onClick={() => {
                              setSelectedAtestos(prev => 
                                prev.includes(at.id) ? prev.filter(id => id !== at.id) : [...prev, at.id]
                              )
                            }}
                            className={`flex items-center justify-between p-3 rounded-xl border text-xs cursor-pointer transition-all ${
                              selectedAtestos.includes(at.id)
                                ? 'bg-sky-50 border-sky-300 dark:bg-sky-950/20 dark:border-sky-800'
                                : 'bg-zinc-50/50 dark:bg-zinc-900 border-zinc-200 dark:border-zinc-800 hover:bg-zinc-50 dark:hover:bg-zinc-800'
                            }`}
                          >
                            <div className="space-y-1">
                              <p className="font-bold">Atesto Nº {at.numero}</p>
                              <p className="text-[10px] text-zinc-500">
                                {entidades.find(e => e.id === at.entidade_id)?.nome} • {new Date(at.data).toLocaleDateString('pt-BR')}
                              </p>
                              <Badge variant={at.empresa === 'ROSAFARM' ? 'secondary' : 'outline'} className="text-[8px] h-3.5 uppercase font-bold py-0 mt-1">
                                {at.empresa}
                              </Badge>
                            </div>
                            <p className="font-black text-sky-600 dark:text-sky-400">{formatCurrency(at.valor)}</p>
                          </div>
                        ))
                    )}
                  </div>
                </div>
                <div className="pt-4 border-t border-zinc-100 dark:border-zinc-800 text-xs text-zinc-500">
                  Selecionados: <strong>{selectedAtestos.length}</strong> documentos • Total: <strong>
                    {formatCurrency(filteredDocs.filter(d => selectedAtestos.includes(d.id)).reduce((acc, curr) => acc + curr.valor, 0))}
                  </strong>
                </div>
              </Card>

              {/* Painel Direito: Notas Fiscais não vinculadas */}
              <Card className="bg-white dark:bg-zinc-900 border-zinc-200/80 dark:border-zinc-800 p-4 shadow-sm flex flex-col justify-between h-[500px]">
                <div>
                  <h3 className="text-sm font-bold uppercase tracking-wider text-zinc-400 flex items-center gap-1">
                    <FileText className="w-4 h-4 text-emerald-500" /> Notas Fiscais sem Atesto correspondente
                  </h3>
                  <div className="mt-4 space-y-2 overflow-y-auto max-h-[380px] pr-2">
                    {filteredDocs.filter(d => d.tipo === 'NF' && d.vinculo_id === null).length === 0 ? (
                      <p className="text-xs text-zinc-500 py-6 text-center italic">Nenhuma Nota Fiscal pendente.</p>
                    ) : (
                      filteredDocs
                        .filter(d => d.tipo === 'NF' && d.vinculo_id === null)
                        .map(nf => (
                          <div 
                            key={nf.id}
                            onClick={() => {
                              setSelectedNfs(prev => 
                                prev.includes(nf.id) ? prev.filter(id => id !== nf.id) : [...prev, nf.id]
                              )
                            }}
                            className={`flex items-center justify-between p-3 rounded-xl border text-xs cursor-pointer transition-all ${
                              selectedNfs.includes(nf.id)
                                ? 'bg-emerald-50 border-emerald-300 dark:bg-emerald-950/20 dark:border-emerald-800'
                                : 'bg-zinc-50/50 dark:bg-zinc-900 border-zinc-200 dark:border-zinc-800 hover:bg-zinc-50 dark:hover:bg-zinc-800'
                            }`}
                          >
                            <div className="space-y-1">
                              <p className="font-bold">NF Nº {nf.numero}</p>
                              <p className="text-[10px] text-zinc-500">
                                {entidades.find(e => e.id === nf.entidade_id)?.nome} • {new Date(nf.data).toLocaleDateString('pt-BR')}
                              </p>
                              <Badge variant={nf.empresa === 'ROSAFARM' ? 'secondary' : 'outline'} className="text-[8px] h-3.5 uppercase font-bold py-0 mt-1">
                                {nf.empresa}
                              </Badge>
                            </div>
                            <p className="font-black text-emerald-600 dark:text-emerald-400">{formatCurrency(nf.valor)}</p>
                          </div>
                        ))
                    )}
                  </div>
                </div>
                <div className="pt-4 border-t border-zinc-100 dark:border-zinc-800 text-xs text-zinc-500">
                  Selecionadas: <strong>{selectedNfs.length}</strong> documentos • Total: <strong>
                    {formatCurrency(filteredDocs.filter(d => selectedNfs.includes(d.id)).reduce((acc, curr) => acc + curr.valor, 0))}
                  </strong>
                </div>
              </Card>

              {/* Botão de Acoplamento e Conciliação */}
              {(selectedAtestos.length > 0 || selectedNfs.length > 0) && (
                <Card className="lg:col-span-2 bg-zinc-50 dark:bg-zinc-800/40 p-4 border border-zinc-200 dark:border-zinc-800 rounded-xl flex items-center justify-between gap-4 flex-col sm:flex-row shadow-sm">
                  <div className="text-xs space-y-1 text-zinc-600 dark:text-zinc-300">
                    <p className="font-medium">
                      Conciliando <strong className="text-sky-600">{selectedAtestos.length} Atestos</strong> com <strong className="text-emerald-600">{selectedNfs.length} NFs</strong>.
                    </p>
                    <p className="text-[11px] font-bold">
                      Saldo resultante: {formatCurrency(
                        filteredDocs.filter(d => selectedAtestos.includes(d.id)).reduce((acc, curr) => acc + curr.valor, 0) -
                        filteredDocs.filter(d => selectedNfs.includes(d.id)).reduce((acc, curr) => acc + curr.valor, 0)
                      )}
                    </p>
                  </div>
                  <div className="flex gap-2 w-full sm:w-auto">
                    <Button
                      onClick={() => { setSelectedAtestos([]); setSelectedNfs([]); }}
                      variant="ghost"
                      className="text-xs text-zinc-500 rounded-lg hover:text-zinc-700"
                    >
                      Cancelar Seleção
                    </Button>
                    <Button
                      onClick={handleConciliar}
                      className="bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-xs uppercase tracking-wider px-6 py-2 rounded-lg gap-2"
                      disabled={selectedAtestos.length === 0 || selectedNfs.length === 0}
                    >
                      <Link2 className="w-4 h-4" /> Conciliar Documentos
                    </Button>
                  </div>
                </Card>
              )}
            </div>
          )}

          {/* TAB 3: DOCUMENTOS LANÇADOS (Lista geral) */}
          {tab === 'documentos' && (
            <Card className="bg-white dark:bg-zinc-900 border-zinc-200/80 dark:border-zinc-800 shadow-xs overflow-hidden">
              <div className="overflow-x-auto">
                <table className="w-full text-left text-xs border-collapse">
                  <thead className="bg-zinc-50 dark:bg-zinc-800 border-b border-zinc-200 dark:border-zinc-700 text-zinc-500 font-bold uppercase tracking-wider text-[10px]">
                    <tr>
                      <th className="px-4 py-3">Tipo</th>
                      <th className="px-4 py-3">Número</th>
                      <th className="px-4 py-3">Data</th>
                      <th className="px-4 py-3">Empresa</th>
                      <th className="px-4 py-3">Cliente</th>
                      <th className="px-4 py-3">Valor</th>
                      <th className="px-4 py-3">Observações</th>
                      <th className="px-4 py-3">Origem</th>
                      <th className="px-4 py-3 text-center">Ações</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-zinc-200 dark:divide-zinc-800">
                    {filteredDocs.length === 0 ? (
                      <tr>
                        <td colSpan={9} className="px-4 py-12 text-center text-zinc-500">
                          Nenhum documento lançado no banco para os filtros aplicados.
                        </td>
                      </tr>
                    ) : (
                      filteredDocs.map(doc => (
                        <tr key={doc.id} className="hover:bg-zinc-50 dark:hover:bg-zinc-800/40">
                          <td className="px-4 py-3 font-bold whitespace-nowrap">
                            <Badge variant={doc.tipo === 'ATESTO' ? 'outline' : 'secondary'} className={`text-[9px] uppercase font-bold py-0 h-4 ${
                              doc.tipo === 'ATESTO' ? 'text-sky-600 border-sky-300 dark:text-sky-400' : 'text-emerald-600 border-emerald-300 dark:text-emerald-400'
                            }`}>
                              {doc.tipo}
                            </Badge>
                          </td>
                          <td className="px-4 py-3 font-medium whitespace-nowrap">{doc.numero}</td>
                          <td className="px-4 py-3 whitespace-nowrap">{new Date(doc.data).toLocaleDateString('pt-BR')}</td>
                          <td className="px-4 py-3 font-bold">{doc.empresa}</td>
                          <td className="px-4 py-3 truncate max-w-[200px]" title={entidades.find(e => e.id === doc.entidade_id)?.nome || ''}>
                            {entidades.find(e => e.id === doc.entidade_id)?.nome || '—'}
                          </td>
                          <td className="px-4 py-3 font-black text-zinc-900 dark:text-zinc-100">{formatCurrency(doc.valor)}</td>
                          <td className="px-4 py-3 text-zinc-500 truncate max-w-[200px]" title={doc.observacao || ''}>
                            {doc.observacao || '—'}
                          </td>
                          <td className="px-4 py-3 text-zinc-400">
                            {doc.historico_entrega_numero ? (
                              <span className="text-[10px] bg-zinc-100 dark:bg-zinc-800 px-1.5 py-0.5 rounded font-bold uppercase" title="Importado automaticamente a partir das vendas">
                                Integrado
                              </span>
                            ) : (
                              <span className="text-[10px] bg-amber-50 dark:bg-amber-950/20 text-amber-600 px-1.5 py-0.5 rounded font-bold uppercase">
                                Manual
                              </span>
                            )}
                          </td>
                          <td className="px-4 py-3 text-center">
                            <Button
                              onClick={() => handleDeleteDocument(doc.id)}
                              variant="ghost"
                              size="icon"
                              className="h-7 w-7 text-rose-500 hover:text-rose-600 hover:bg-rose-50 dark:hover:bg-rose-950/30 rounded-lg"
                              title="Deletar Documento"
                            >
                              <Trash2 className="w-3.5 h-3.5" />
                            </Button>
                          </td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>
            </Card>
          )}

          {/* TAB 4: IMPORTAR DO VENDEDOR */}
          {tab === 'importar' && (
            <Card className="bg-white dark:bg-zinc-900 border-zinc-200/80 dark:border-zinc-800 shadow-xs overflow-hidden">
              <div className="p-4 border-b border-zinc-100 dark:border-zinc-800 flex justify-between items-center bg-zinc-50/50 dark:bg-zinc-900">
                <span className="text-xs text-zinc-500 font-medium">
                  Estes documentos foram detectados a partir do faturamento e lançamentos provisórios registrados pela equipe de vendas.
                </span>
              </div>
              <div className="overflow-x-auto">
                <table className="w-full text-left text-xs border-collapse">
                  <thead className="bg-zinc-50 dark:bg-zinc-800 border-b border-zinc-200 dark:border-zinc-700 text-zinc-500 font-bold uppercase tracking-wider text-[10px]">
                    <tr>
                      <th className="px-4 py-3">Tipo Sugerido</th>
                      <th className="px-4 py-3">Código/Chave</th>
                      <th className="px-4 py-3">Data Lançamento</th>
                      <th className="px-4 py-3">Vendedor</th>
                      <th className="px-4 py-3">Cliente</th>
                      <th className="px-4 py-3">Empresa Ref</th>
                      <th className="px-4 py-3">Valor Estimado</th>
                      <th className="px-4 py-3 text-center">Status</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-zinc-200 dark:divide-zinc-800">
                    {vendedorGroups.length === 0 ? (
                      <tr>
                        <td colSpan={8} className="px-4 py-12 text-center text-zinc-500">
                          Nenhum faturamento de vendedor detectado no sistema.
                        </td>
                      </tr>
                    ) : (
                      vendedorGroups.map((g, idx) => (
                        <tr key={idx} className="hover:bg-zinc-50 dark:hover:bg-zinc-800/40">
                          <td className="px-4 py-3 font-bold">
                            <Badge variant={g.venda_tipo === 'ATESTO' ? 'outline' : 'secondary'} className={`text-[9px] uppercase font-bold py-0 h-4 ${
                              g.venda_tipo === 'ATESTO' ? 'text-sky-600 border-sky-300 dark:text-sky-400' : 'text-emerald-600 border-emerald-300 dark:text-emerald-400'
                            }`}>
                              {g.venda_tipo}
                            </Badge>
                          </td>
                          <td className="px-4 py-3 font-medium whitespace-nowrap">{g.numero_nf}</td>
                          <td className="px-4 py-3 whitespace-nowrap">{g.data ? new Date(g.data).toLocaleDateString('pt-BR') : '—'}</td>
                          <td className="px-4 py-3 font-medium text-zinc-600 dark:text-zinc-300">{g.vendedor_nome}</td>
                          <td className="px-4 py-3 truncate max-w-[200px]">{g.entidade_nome}</td>
                          <td className="px-4 py-3 font-bold">{g.empresa}</td>
                          <td className="px-4 py-3 font-black text-emerald-600 dark:text-emerald-400">{formatCurrency(g.valor_total)}</td>
                          <td className="px-4 py-3 text-center">
                            {g.jaImportado ? (
                              <Badge className="bg-emerald-100 text-emerald-700 dark:bg-emerald-950/20 dark:text-emerald-400 font-bold text-[9px] gap-1 py-0.5 px-2">
                                <CheckCircle2 className="w-3 h-3" /> Já Importado
                              </Badge>
                            ) : (
                              <Button
                                onClick={() => handleImportVendedor(g)}
                                className="bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-[10px] uppercase tracking-wider h-7 px-3 rounded-lg"
                              >
                                Homologar & Importar
                              </Button>
                            )}
                          </td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>
            </Card>
          )}
        </>
      )}

      {/* MODAL ADICIONAR DOCUMENTO */}
      {showAddModal && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-xs flex items-center justify-center p-4 z-50 animate-fade-in">
          <Card className="bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 p-6 rounded-2xl w-full max-w-lg shadow-xl relative animate-scale-up">
            <h3 className="text-base font-bold uppercase tracking-wider text-zinc-900 dark:text-zinc-100 flex items-center gap-1.5 border-b border-zinc-100 dark:border-zinc-800 pb-3">
              <Plus className="w-5 h-5 text-emerald-600" /> Cadastrar Novo Documento
            </h3>

            <form onSubmit={handleAddDocument} className="space-y-4 mt-4">
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-1">
                  <label className="text-[10px] font-bold text-zinc-400 uppercase tracking-wider">Tipo Documento *</label>
                  <Select 
                    value={novoDoc.tipo} 
                    onValueChange={(val: 'ATESTO' | 'NF') => setNovoDoc(prev => ({ ...prev, tipo: val }))}
                  >
                    <SelectTrigger className="h-9 text-xs rounded-lg border-zinc-200 dark:border-zinc-700">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="ATESTO">ATESTADO (Pedido/DAV)</SelectItem>
                      <SelectItem value="NF">NOTA FISCAL (NF)</SelectItem>
                    </SelectContent>
                  </Select>
                </div>

                <div className="space-y-1">
                  <label className="text-[10px] font-bold text-zinc-400 uppercase tracking-wider">Número *</label>
                  <Input
                    value={novoDoc.numero}
                    onChange={e => setNovoDoc(prev => ({ ...prev, numero: e.target.value }))}
                    placeholder="Ex: 61513"
                    className="h-9 text-xs border-zinc-200 dark:border-zinc-700"
                    required
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-1">
                  <label className="text-[10px] font-bold text-zinc-400 uppercase tracking-wider">Data do Documento *</label>
                  <Input
                    type="date"
                    value={novoDoc.data}
                    onChange={e => setNovoDoc(prev => ({ ...prev, data: e.target.value }))}
                    className="h-9 text-xs border-zinc-200 dark:border-zinc-700"
                    required
                  />
                </div>

                <div className="space-y-1">
                  <label className="text-[10px] font-bold text-zinc-400 uppercase tracking-wider">Empresa Faturadora *</label>
                  <Select 
                    value={novoDoc.empresa} 
                    onValueChange={(val: 'APROMEDICA' | 'ROSAFARM') => setNovoDoc(prev => ({ ...prev, empresa: val }))}
                  >
                    <SelectTrigger className="h-9 text-xs rounded-lg border-zinc-200 dark:border-zinc-700">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="APROMEDICA">APROMEDICA</SelectItem>
                      <SelectItem value="ROSAFARM">ROSAFARM</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>

              <div className="space-y-1">
                <label className="text-[10px] font-bold text-zinc-400 uppercase tracking-wider">Cliente / Município *</label>
                <Select 
                  value={novoDoc.entidade_id} 
                  onValueChange={val => setNovoDoc(prev => ({ ...prev, entidade_id: val }))}
                >
                  <SelectTrigger className="h-9 text-xs rounded-lg border-zinc-200 dark:border-zinc-700">
                    <SelectValue placeholder="Selecione o Cliente" />
                  </SelectTrigger>
                  <SelectContent>
                    {entidades.map(e => (
                      <SelectItem key={e.id} value={String(e.id)}>{e.nome} ({e.municipio || '—'})</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-1">
                <label className="text-[10px] font-bold text-zinc-400 uppercase tracking-wider">Valor do Documento (R$) *</label>
                <Input
                  type="number"
                  step="0.01"
                  value={novoDoc.valor}
                  onChange={e => setNovoDoc(prev => ({ ...prev, valor: e.target.value }))}
                  placeholder="Ex: 24424.40"
                  className="h-9 text-xs border-zinc-200 dark:border-zinc-700"
                  required
                />
              </div>

              <div className="space-y-1">
                <label className="text-[10px] font-bold text-zinc-400 uppercase tracking-wider">Observações</label>
                <Input
                  value={novoDoc.observacao}
                  onChange={e => setNovoDoc(prev => ({ ...prev, observacao: e.target.value }))}
                  placeholder="Ex: Saldo residual 2025"
                  className="h-9 text-xs border-zinc-200 dark:border-zinc-700"
                />
              </div>

              <div className="flex gap-2 justify-end pt-4 border-t border-zinc-100 dark:border-zinc-800">
                <Button
                  type="button"
                  variant="ghost"
                  onClick={() => setShowAddModal(false)}
                  className="text-xs text-zinc-500 rounded-lg hover:text-zinc-700"
                >
                  Cancelar
                </Button>
                <Button
                  type="submit"
                  className="bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-xs uppercase tracking-wider px-6 py-2 rounded-lg"
                >
                  Salvar Documento
                </Button>
              </div>
            </form>
          </Card>
        </div>
      )}
    </div>
  )
}
