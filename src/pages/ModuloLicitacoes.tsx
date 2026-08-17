import React, { useState, useEffect, useMemo } from 'react'
import { supabase } from '../lib/supabase'
import { useAuth } from '../AuthContext'
import { fetchSaldoAta, fetchSaldoContrato, getProfiles } from '../lib/supabaseHelpers'
import { getCleanPublicUrl } from '../lib/storage'
import { logAction } from '../lib/logger'
import { toast } from 'sonner'
import { 
  Search, 
  Files, 
  FileText, 
  Calendar, 
  Package, 
  User, 
  Plus, 
  AlertTriangle, 
  FileDown, 
  Clock, 
  ShieldCheck, 
  Tag, 
  Loader2, 
  Trash2,
  CheckSquare
} from 'lucide-react'

// Shadcn UI
import { Card, CardHeader, CardTitle, CardContent } from '../components/ui/card'
import { Button } from '../components/ui/button'
import { Input } from '../components/ui/input'
import { Badge } from '../components/ui/badge'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '../components/ui/table'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '../components/ui/dialog'
import { Select, SelectTrigger, SelectValue, SelectContent, SelectItem } from '../components/ui/select'
import { Label } from '../components/ui/label'



export function ModuloLicitacoes() {
  const { profile, isAdmin } = useAuth()
  const [activeTab, setActiveTab] = useState<'atas' | 'contratos' | 'timeline' | 'importar'>('atas')
  const [currentPageAtas, setCurrentPageAtas] = useState(1)
  const [currentPageContratos, setCurrentPageContratos] = useState(1)
  const ITEMS_PER_PAGE = 30
  
  // Data States
  const [atas, setAtas] = useState<any[]>([])
  const [contratos, setContratos] = useState<any[]>([])
  const [vendedores, setVendedores] = useState<any[]>([])
  const [entidades, setEntidades] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  
  // Expansion States
  const [expandedAtaId, setExpandedAtaId] = useState<string | null>(null)
  const [expandedContratoId, setExpandedContratoId] = useState<string | null>(null)
  const [itensAta, setItensAta] = useState<any[]>([])
  const [itensContrato, setItensContrato] = useState<any[]>([])
  const [loadingItems, setLoadingItems] = useState(false)

  // Modals & Forms
  const [selectedAtaForAditivo, setSelectedAtaForAditivo] = useState<any | null>(null)
  const [selectedContratoForAditivo, setSelectedContratoForAditivo] = useState<any | null>(null)
  const [isAditivoModalOpen, setIsAditivoModalOpen] = useState(false)
  
  const [aditivoForm, setAditivoForm] = useState({
    numero: '',
    tipo: 'PRAZO' as 'QUANTIDADE' | 'PRAZO' | 'AMBOS',
    novaData: '',
    justificativa: '',
    itensAditivados: {} as Record<number | string, number> // id -> qtd_adicionada
  })

  // Assignment Modal
  const [assigningDoc, setAssigningDoc] = useState<{ id: string, type: 'ata' | 'contrato' } | null>(null)
  const [selectedVendedorId, setSelectedVendedorId] = useState<string>('')

  // Import State
  const [importType, setImportType] = useState<'ata' | 'contrato'>('contrato')
  const [importForm, setImportForm] = useState({
    // Contrato Fields
    numero_contrato: '',
    objeto_contrato: '',
    valor_total: '',
    data_assinatura: '',
    data_validade: '',
    entidade_id: '',
    assigned_to: '',
    // Vínculo
    vincular_ata: 'none', // 'none' ou ID de ata ou 'new'
    // Nova ATA Fields (Cenário B)
    numero_arp: '',
    valor_global: '',
    data_validade_ata: '',
    objeto_ata: 'Misto',
    uf: 'SP',
    municipio: ''
  })
  
  const [importItens, setImportItens] = useState<{
    id: string
    numero_item: string
    descricao: string
    unidade: string
    quantidade: number
    valor_unitario: number
    marca: string
    item_ata_id: string // Mapeamento com item de ATA
  }[]>([])

  const [loadingImport, setLoadingImport] = useState(false)
  
  // Search
  const [searchTerm, setSearchTerm] = useState('')

  useEffect(() => {
    setCurrentPageAtas(1)
    setCurrentPageContratos(1)
  }, [searchTerm])

  useEffect(() => {
    loadData()
  }, [])

  async function loadData() {
    setLoading(true)
    try {
      // 1. Fetch Atas
      const { data: atasData } = await supabase
        .from('atas')
        .select('*, assigned_user:profiles(display_name), entidade:entidades(nome)')
        .order('created_at', { ascending: false })
      setAtas(atasData || [])

      // 2. Fetch Contratos
      const { data: contratosData } = await supabase
        .from('contratos')
        .select('*, assigned_user:profiles(display_name), entidade:entidades(nome), ata:atas(numero_arp)')
        .order('created_at', { ascending: false })
      setContratos(contratosData || [])

      // 3. Fetch Vendedores (VENDAS sector users)
      const profiles = await getProfiles()
      if (profiles.data) {
        setVendedores(profiles.data.filter((p: any) => p.setor === 'VENDAS' || p.setor === 'DIRECAO'))
      }

      // 4. Fetch Entidades (Clientes)
      const { data: ents } = await supabase.from('entidades').select('*').order('nome')
      setEntidades(ents || [])

    } catch (err) {
      toast.error('Erro ao carregar dados do módulo.')
    } finally {
      setLoading(false)
    }
  }

  // --- ATA EXPANSION & SALDOS ---
  async function handleToggleExpandAta(ata: any) {
    if (expandedAtaId === ata.id) {
      setExpandedAtaId(null)
      setItensAta([])
      return
    }
    setExpandedAtaId(ata.id)
    setLoadingItems(true)
    try {
      const data = await fetchSaldoAta(ata.id)
      setItensAta(data)
    } catch (err) {
      toast.error('Erro ao buscar saldo dos itens da ATA.')
    } finally {
      setLoadingItems(false)
    }
  }

  // --- CONTRATO EXPANSION & SALDOS ---
  async function handleToggleExpandContrato(contrato: any) {
    if (expandedContratoId === contrato.id) {
      setExpandedContratoId(null)
      setItensContrato([])
      return
    }
    setExpandedContratoId(contrato.id)
    setLoadingItems(true)
    try {
      const data = await fetchSaldoContrato(contrato.id)
      setItensContrato(data)
    } catch (err) {
      toast.error('Erro ao buscar saldo dos itens do Contrato.')
    } finally {
      setLoadingItems(false)
    }
  }

  // --- REASSIGNMENT ---
  async function handleOpenAssign(docId: string, type: 'ata' | 'contrato', currentVendedor: string | null) {
    if (!isAdmin && profile?.setor !== 'LICIT') {
      toast.error('Apenas Administradores do setor de Licitação podem reatribuir responsáveis.')
      return
    }
    setAssigningDoc({ id: docId, type })
    setSelectedVendedorId(currentVendedor || '')
  }

  async function handleAssign() {
    if (!assigningDoc) return
    try {
      const table = assigningDoc.type === 'ata' ? 'atas' : 'contratos'
      const { error } = await supabase
        .from(table)
        .update({ assigned_to: selectedVendedorId || null })
        .eq('id', assigningDoc.id)
      
      if (error) throw error
      toast.success('Responsável atualizado com sucesso!')
      setAssigningDoc(null)
      loadData()
    } catch (err) {
      toast.error('Falha ao atualizar responsável.')
    }
  }

  // --- ADITIVOS (FORM & LOGIC) ---
  function handleOpenAditivo(doc: any, type: 'ata' | 'contrato', docItens: any[]) {
    if (!isAdmin && profile?.setor !== 'LICIT') {
      toast.error('Apenas Administradores do setor de Licitação podem registrar aditivos.')
      return
    }
    if (type === 'ata') {
      setSelectedAtaForAditivo(doc)
      setSelectedContratoForAditivo(null)
      setItensAta(docItens)
    } else {
      setSelectedContratoForAditivo(doc)
      setSelectedAtaForAditivo(null)
      setItensContrato(docItens)
    }

    setAditivoForm({
      numero: '',
      tipo: 'PRAZO',
      novaData: doc.data_validade ? doc.data_validade.split('T')[0] : '',
      justificativa: '',
      itensAditivados: {}
    })
    setIsAditivoModalOpen(true)
  }

  async function handleSaveAditivo() {
    if (!aditivoForm.numero.trim()) {
      toast.error('Informe o número do Aditivo.')
      return
    }

    setLoading(true)
    try {
      const { data: { user } } = await supabase.auth.getUser()
      const targetAtaId = selectedAtaForAditivo?.id || null
      const targetContratoId = selectedContratoForAditivo?.id || null

      // 1. Inserir Aditivo Pai
      const { data: aditivo, error: errAditivo } = await supabase
        .from('aditivos_ata')
        .insert([{
          ata_id: targetAtaId,
          contrato_id: targetContratoId,
          numero_aditivo: aditivoForm.numero.trim(),
          tipo: aditivoForm.tipo,
          nova_data_validade: aditivoForm.tipo !== 'QUANTIDADE' ? aditivoForm.novaData : null,
          justificativa: aditivoForm.justificativa,
          created_by: user?.id
        }])
        .select()
        .single()

      if (errAditivo) throw errAditivo

      // 2. Inserir Itens do Aditivo (se tipo for QUANTIDADE ou AMBOS)
      if (aditivoForm.tipo !== 'PRAZO' && Object.keys(aditivoForm.itensAditivados).length > 0) {
        const rowsToInsert = Object.entries(aditivoForm.itensAditivados)
          .filter(([_, val]) => Number(val) > 0)
          .map(([itemId, val]) => ({
            aditivo_id: aditivo.id,
            item_ata_id: targetAtaId ? Number(itemId) : null,
            item_contrato_id: targetContratoId ? itemId : null,
            quantidade_adicionada: Number(val)
          }))
        
        if (rowsToInsert.length > 0) {
          const { error: errItens } = await supabase
            .from('aditivos_itens_ata')
            .insert(rowsToInsert)
          if (errItens) throw errItens
        }
      }

      await logAction('CADASTRAR_ADITIVO', targetAtaId ? 'atas' : 'contratos', aditivo.id, {
        numero_aditivo: aditivoForm.numero,
        tipo: aditivoForm.tipo
      })

      toast.success('Aditivo registrado e saldos/prazos atualizados automaticamente!')
      setIsAditivoModalOpen(false)
      loadData()
      setExpandedAtaId(null)
      setExpandedContratoId(null)
    } catch (err: any) {
      toast.error('Erro ao salvar aditivo: ' + err.message)
    } finally {
      setLoading(false)
    }
  }

  // --- IMPORT INTEGRATION & ITEM MAPPING ---
  function handleAddImportItem() {
    setImportItens([
      ...importItens,
      {
        id: crypto.randomUUID(),
        numero_item: String(importItens.length + 1),
        descricao: '',
        unidade: 'UN',
        quantidade: 0,
        valor_unitario: 0,
        marca: '',
        item_ata_id: ''
      }
    ])
  }

  function handleRemoveImportItem(id: string) {
    setImportItens(importItens.filter(it => it.id !== id))
  }

  async function handleImport() {
    if (importType === 'contrato') {
      if (!importForm.numero_contrato.trim()) {
        toast.error('Número de contrato é obrigatório.')
        return
      }
      if (!importForm.entidade_id) {
        toast.error('Selecione o órgão gerenciador / cliente.')
        return
      }

      setLoadingImport(true)
      try {
        const { data: { user } } = await supabase.auth.getUser()
        let finalAtaId: string | null = null

        // Cenário B: Criar ATA em conjunto
        if (importForm.vincular_ata === 'new') {
          if (!importForm.numero_arp.trim()) {
            throw new Error('Preencha o número da nova ATA.')
          }
          const { data: newAta, error: errNewAta } = await supabase
            .from('atas')
            .insert([{
              numero_arp: importForm.numero_arp.trim(),
              entidade_gerenciadora: entidades.find(e => String(e.id) === importForm.entidade_id)?.nome || 'Orgão',
              entidade_id: Number(importForm.entidade_id),
              valor_global: Number(importForm.valor_global) || 0,
              data_validade: importForm.data_validade_ata || importForm.data_validade || null,
              objeto_ata: importForm.objeto_ata,
              uf: importForm.uf,
              municipio: importForm.municipio || null,
              status: 'ATIVO',
              owner_id: user?.id,
              assigned_to: importForm.assigned_to || null
            }])
            .select()
            .single()
          
          if (errNewAta) throw errNewAta
          finalAtaId = newAta.id

          // Inserir os itens correspondentes na ATA
          if (importItens.length > 0) {
            const ataItensToInsert = importItens.map((it, idx) => ({
              ata_id: newAta.id,
              numero_item: idx + 1,
              descricao: it.descricao,
              quantidade_registrada: Number(it.quantidade) || 0,
              unidade: it.unidade,
              valor_unitario: Number(it.valor_unitario) || 0,
              marca: it.marca || null,
              mapeamento_ia: String(idx + 1)
            }))
            const { data: createdAtaItens, error: errAtaItens } = await supabase
              .from('itens_ata')
              .insert(ataItensToInsert)
              .select()
            if (errAtaItens) throw errAtaItens

            // Atualiza os item_ata_id dos importItens temporariamente para mapear com o contrato
            createdAtaItens.forEach((cai: any, index: number) => {
              importItens[index].item_ata_id = String(cai.id)
            })
          }
        } else if (importForm.vincular_ata !== 'none') {
          finalAtaId = importForm.vincular_ata
        }

        // Criar Contrato
        const { data: contrato, error: errContrato } = await supabase
          .from('contratos')
          .insert([{
            numero_contrato: importForm.numero_contrato.trim(),
            ata_id: finalAtaId,
            entidade_id: Number(importForm.entidade_id),
            objeto_contrato: importForm.objeto_contrato || null,
            valor_total: Number(importForm.valor_total) || 0,
            data_assinatura: importForm.data_assinatura || null,
            data_validade: importForm.data_validade || null,
            owner_id: user?.id,
            assigned_to: importForm.assigned_to || null
          }])
          .select()
          .single()

        if (errContrato) throw errContrato

        // Criar Itens de Contrato
        if (importItens.length > 0) {
          const contratoItensToInsert = importItens.map(it => ({
            contrato_id: contrato.id,
            item_ata_id: it.item_ata_id ? Number(it.item_ata_id) : null,
            numero_item: it.numero_item,
            descricao: it.descricao,
            unidade: it.unidade,
            quantidade_contratada: Number(it.quantidade) || 0,
            valor_unitario: Number(it.valor_unitario) || 0,
            marca: it.marca || null
          }))
          const { error: errContractItens } = await supabase
            .from('itens_contrato')
            .insert(contratoItensToInsert)
          if (errContractItens) throw errContractItens
        }

        toast.success('Contrato e itens importados com absoluto sucesso!')
        setImportForm({
          numero_contrato: '',
          objeto_contrato: '',
          valor_total: '',
          data_assinatura: '',
          data_validade: '',
          entidade_id: '',
          assigned_to: '',
          vincular_ata: 'none',
          numero_arp: '',
          valor_global: '',
          data_validade_ata: '',
          objeto_ata: 'Misto',
          uf: 'SP',
          municipio: ''
        })
        setImportItens([])
        loadData()
        setActiveTab('contratos')

      } catch (err: any) {
        toast.error('Erro na importação: ' + err.message)
      } finally {
        setLoadingImport(false)
      }
    }
  }

  // Timeline Expirações
  const timelineItems = useMemo(() => {
    const list: any[] = []
    atas.forEach(a => {
      if (a.data_validade) {
        list.push({ id: a.id, type: 'ATA', label: `ARP: ${a.numero_arp}`, date: new Date(a.data_validade), uf: a.uf, orgao: a.entidade?.nome })
      }
    })
    contratos.forEach(c => {
      if (c.data_validade) {
        list.push({ id: c.id, type: 'CONTRATO', label: `Contrato: ${c.numero_contrato}`, date: new Date(c.data_validade), orgao: c.entidade?.nome })
      }
    })
    return list.sort((a, b) => a.date.getTime() - b.date.getTime())
  }, [atas, contratos])

  // Filtered lists based on search
  const filteredAtas = atas.filter(a => 
    a.numero_arp.toLowerCase().includes(searchTerm.toLowerCase()) ||
    (a.entidade?.nome || '').toLowerCase().includes(searchTerm.toLowerCase())
  )

  const filteredContratos = contratos.filter(c => 
    c.numero_contrato.toLowerCase().includes(searchTerm.toLowerCase()) ||
    (c.entidade?.nome || '').toLowerCase().includes(searchTerm.toLowerCase())
  )

  const paginatedAtas = useMemo(() => {
    return filteredAtas.slice((currentPageAtas - 1) * ITEMS_PER_PAGE, currentPageAtas * ITEMS_PER_PAGE)
  }, [filteredAtas, currentPageAtas])

  const totalPagesAtas = Math.ceil(filteredAtas.length / ITEMS_PER_PAGE)

  const paginatedContratos = useMemo(() => {
    return filteredContratos.slice((currentPageContratos - 1) * ITEMS_PER_PAGE, currentPageContratos * ITEMS_PER_PAGE)
  }, [filteredContratos, currentPageContratos])

  const totalPagesContratos = Math.ceil(filteredContratos.length / ITEMS_PER_PAGE)



  const [ataItensMap, setAtaItensMap] = useState<any[]>([])

  async function handleAtaChange(val: string) {
    setImportForm(p => ({ ...p, vincular_ata: val }))
    if (val !== 'none' && val !== 'new') {
      const { data } = await supabase.from('itens_ata').select('*').eq('ata_id', val)
      setAtaItensMap(data || [])
    } else {
      setAtaItensMap([])
    }
  }

  return (
    <div className="space-y-6 pb-20">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-zinc-900 dark:text-white flex items-center gap-2">
            <Files className="w-6 h-6 text-brand-accent" />
            Módulo de Licitações
          </h1>
          <p className="text-zinc-500 text-sm tracking-tight">Gestão de vigência, saldo financeiro, aditivos e contratos públicos</p>
        </div>
        <div className="flex gap-2 print:hidden">
          <Button 
            className="bg-brand-accent hover:opacity-90 text-primary-foreground font-semibold shadow-lg shadow-violet-500/20"
            onClick={() => {
              setImportType('contrato')
              setActiveTab('importar')
            }}
          >
            <Plus className="w-4 h-4 mr-2" />
            Importar Contrato / ATA
          </Button>
        </div>
      </div>

      {/* Tabs list */}
      <div className="bg-zinc-100 dark:bg-zinc-900 p-1 mb-4 h-12 rounded-2xl border border-zinc-200 dark:border-zinc-800 justify-start inline-flex print:hidden">
        <button 
          onClick={() => setActiveTab('atas')} 
          className={`rounded-xl px-6 font-bold uppercase text-[10px] tracking-widest gap-2 h-10 transition-all ${activeTab === 'atas' ? 'bg-white dark:bg-zinc-800 text-brand-accent shadow-sm' : 'text-zinc-500 hover:text-brand-accent'}`}
        >
          Atas (ARPs)
        </button>
        <button 
          onClick={() => setActiveTab('contratos')} 
          className={`rounded-xl px-6 font-bold uppercase text-[10px] tracking-widest gap-2 h-10 transition-all ${activeTab === 'contratos' ? 'bg-white dark:bg-zinc-800 text-brand-accent shadow-sm' : 'text-zinc-500 hover:text-brand-accent'}`}
        >
          Contratos
        </button>
        <button 
          onClick={() => setActiveTab('timeline')} 
          className={`rounded-xl px-6 font-bold uppercase text-[10px] tracking-widest gap-2 h-10 transition-all ${activeTab === 'timeline' ? 'bg-white dark:bg-zinc-800 text-brand-accent shadow-sm' : 'text-zinc-500 hover:text-brand-accent'}`}
        >
          Cronograma de Vigência
        </button>
        <button 
          onClick={() => setActiveTab('importar')} 
          className={`rounded-xl px-6 font-bold uppercase text-[10px] tracking-widest gap-2 h-10 transition-all ${activeTab === 'importar' ? 'bg-white dark:bg-zinc-800 text-brand-accent shadow-sm' : 'text-zinc-500 hover:text-brand-accent'}`}
        >
          Central de Importação
        </button>
      </div>

      {/* Search inputs */}
      {activeTab !== 'importar' && activeTab !== 'timeline' && (
        <div className="flex items-center gap-2 max-w-md bg-white dark:bg-zinc-950 p-2 rounded-xl border border-zinc-200 dark:border-zinc-800 shadow-sm print:hidden">
          <Search className="w-4 h-4 text-zinc-400" />
          <Input 
            placeholder="Pesquisar por número ou órgão..."
            value={searchTerm}
            onChange={e => setSearchTerm(e.target.value)}
            className="border-none shadow-none h-8 text-xs focus-visible:ring-0 focus-visible:border-none focus-visible:ring-offset-0 bg-transparent"
          />
        </div>
      )}

      {/* Loading state */}
      {loading && activeTab !== 'importar' && (
        <div className="py-20 flex flex-col items-center justify-center text-zinc-400">
          <Loader2 className="w-8 h-8 animate-spin text-brand-accent mb-2" />
          <p className="text-xs font-semibold">Consultando registros na base...</p>
        </div>
      )}

      {!loading && (
        <>
          {/* TAB: ATAS */}
          {activeTab === 'atas' && (
            <Card className="border-zinc-200 dark:border-zinc-800 shadow-xl overflow-hidden">
              <Table>
                <TableHeader className="bg-zinc-50 dark:bg-zinc-900/60">
                  <TableRow className="text-[10px] uppercase font-bold tracking-wider">
                    <TableHead>Número ARP</TableHead>
                    <TableHead>Órgão Gerenciador</TableHead>
                    <TableHead>UF</TableHead>
                    <TableHead>Responsável (Vendedor)</TableHead>
                    <TableHead>Valor Global</TableHead>
                    <TableHead>Vencimento</TableHead>
                    <TableHead className="text-right">Ações</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filteredAtas.length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={7} className="h-32 text-center text-zinc-400 text-xs italic">
                        Nenhuma ATA de Registro de Preços encontrada.
                      </TableCell>
                    </TableRow>
                  ) : paginatedAtas.map((ata) => {
                    const isExpanded = expandedAtaId === ata.id
                    const isExpired = ata.data_validade && new Date(ata.data_validade) < new Date()
                    
                    return (
                      <React.Fragment key={ata.id}>
                        <TableRow 
                          onClick={() => handleToggleExpandAta(ata)}
                          className={`cursor-pointer transition-colors ${isExpanded ? 'bg-zinc-50 dark:bg-zinc-900/70 border-l-2 border-brand-accent' : 'hover:bg-zinc-50/50 dark:hover:bg-zinc-900/40'}`}
                        >
                          <TableCell className="font-bold text-xs tracking-tighter flex items-center gap-2 py-4">
                            <Package className={`w-4 h-4 text-zinc-400 transition-transform ${isExpanded ? 'rotate-180 text-brand-accent' : ''}`} />
                            {ata.numero_arp}
                          </TableCell>
                          <TableCell className="text-xs max-w-xs truncate text-zinc-600 dark:text-zinc-400">
                            {ata.entidade?.nome || ata.entidade_gerenciadora || '-'}
                          </TableCell>
                          <TableCell>
                            <Badge variant="outline" className="text-[10px] font-bold bg-zinc-100 dark:bg-zinc-800">{ata.uf || '-'}</Badge>
                          </TableCell>
                          <TableCell>
                            {ata.assigned_user?.display_name ? (
                              <Badge variant="secondary" className="bg-emerald-50 text-emerald-700 border-emerald-100 text-[10px] gap-1 px-2 py-1">
                                <User size={10} />
                                {ata.assigned_user.display_name}
                              </Badge>
                            ) : (
                              <Badge variant="outline" className="text-[10px] opacity-40 border-dashed">Sem Responsável</Badge>
                            )}
                          </TableCell>
                          <TableCell className="font-bold text-xs">
                            {new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(ata.valor_global || 0)}
                          </TableCell>
                          <TableCell>
                            <div className="flex items-center gap-1.5 text-xs font-bold">
                              <Calendar className="w-3.5 h-3.5 text-zinc-400" />
                              <span className={isExpired ? 'text-red-500' : 'text-zinc-600 dark:text-zinc-300'}>
                                {ata.data_validade ? new Date(ata.data_validade).toLocaleDateString('pt-BR') : '-'}
                              </span>
                            </div>
                          </TableCell>
                          <TableCell className="text-right" onClick={e => e.stopPropagation()}>
                            <div className="flex justify-end gap-1">
                              {(isAdmin || profile?.setor === 'LICIT') && (
                                <>
                                  <Button 
                                    variant="ghost" 
                                    size="icon" 
                                    title="Atribuir Responsável"
                                    onClick={() => handleOpenAssign(ata.id, 'ata', ata.assigned_to)}
                                    className="h-8 w-8 text-zinc-400 hover:text-brand-accent"
                                  >
                                    <User className="w-4 h-4" />
                                  </Button>
                                  <Button 
                                    variant="ghost" 
                                    size="icon" 
                                    title="Registrar Aditivo"
                                    onClick={async () => {
                                      const items = await fetchSaldoAta(ata.id)
                                      handleOpenAditivo(ata, 'ata', items)
                                    }}
                                    className="h-8 w-8 text-zinc-400 hover:text-emerald-600"
                                  >
                                    <Plus className="w-4 h-4" />
                                  </Button>
                                </>
                              )}
                              {ata.arquivo_caminho && (
                                <Button variant="ghost" size="icon" asChild className="h-8 w-8">
                                  <a href={getCleanPublicUrl(ata.arquivo_caminho)} target="_blank" rel="noopener noreferrer">
                                    <FileDown className="w-4 h-4 text-zinc-500 hover:text-brand-accent" />
                                  </a>
                                </Button>
                              )}
                            </div>
                          </TableCell>
                        </TableRow>
                        
                        {/* Expandable row: Item List & Saldo */}
                        {isExpanded && (
                          <TableRow className="bg-zinc-50/50 dark:bg-zinc-900/30 border-b border-zinc-200 dark:border-zinc-800">
                            <TableCell colSpan={7} className="p-6">
                              {loadingItems ? (
                                <div className="py-4 flex justify-center items-center text-xs text-zinc-400"><Loader2 className="w-4 h-4 animate-spin mr-2" /> Consultando saldos...</div>
                              ) : (
                                <div className="space-y-4">
                                  <h4 className="text-xs font-black uppercase text-zinc-400 tracking-wider flex items-center gap-1.5">
                                    <Tag className="w-3.5 h-3.5" /> Saldo Detalhado dos Itens da ATA
                                  </h4>
                                  <div className="overflow-hidden rounded-xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-950">
                                    <Table>
                                      <TableHeader className="bg-zinc-100 dark:bg-zinc-900/40">
                                        <TableRow className="text-[9px] uppercase font-bold">
                                          <TableHead>Num</TableHead>
                                          <TableHead>Descrição</TableHead>
                                          <TableHead>Marca</TableHead>
                                          <TableHead className="text-right">Qtd Registrada</TableHead>
                                          <TableHead className="text-right">Consumida</TableHead>
                                          <TableHead className="text-right">Saldo Real</TableHead>
                                          <TableHead className="text-right">V. Unitário</TableHead>
                                        </TableRow>
                                      </TableHeader>
                                      <TableBody>
                                        {itensAta.map(it => {
                                          const consPct = it.quantidade_registrada > 0 ? (it.quantidade_consumida / it.quantidade_registrada) * 100 : 0
                                          return (
                                            <TableRow key={it.id} className="text-xs hover:bg-zinc-50/50 dark:hover:bg-zinc-900/40">
                                              <TableCell className="font-mono">#{it.numero_item}</TableCell>
                                              <TableCell className="font-medium max-w-md truncate">{it.descricao}</TableCell>
                                              <TableCell>{it.marca || 'S/ MARCA'}</TableCell>
                                              <TableCell className="text-right font-mono font-bold">{it.quantidade_registrada}</TableCell>
                                              <TableCell className="text-right text-brand-accent font-mono">
                                                {it.quantidade_consumida} ({Math.round(consPct)}%)
                                              </TableCell>
                                              <TableCell className="text-right text-emerald-600 font-mono font-bold">{it.saldo_real}</TableCell>
                                              <TableCell className="text-right font-bold">{new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(it.valor_unitario)}</TableCell>
                                            </TableRow>
                                          )
                                        })}
                                      </TableBody>
                                    </Table>
                                  </div>
                                </div>
                              )}
                            </TableCell>
                          </TableRow>
                        )}
                      </React.Fragment>
                    )
                  })}
                </TableBody>
              </Table>
              
              {/* Pagination Controls */}
              {totalPagesAtas > 1 && (
                <div className="flex items-center justify-between p-4 border-t border-zinc-150 dark:border-zinc-800 bg-zinc-50/50 dark:bg-zinc-900/30">
                  <div className="text-xs text-zinc-500 font-bold uppercase tracking-wider">
                    Página {currentPageAtas} de {totalPagesAtas} ({filteredAtas.length} atas)
                  </div>
                  <div className="flex items-center gap-2">
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => setCurrentPageAtas(prev => Math.max(1, prev - 1))}
                      disabled={currentPageAtas === 1}
                      className="h-8 text-xs font-bold"
                    >
                      Anterior
                    </Button>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => setCurrentPageAtas(prev => Math.min(totalPagesAtas, prev + 1))}
                      disabled={currentPageAtas >= totalPagesAtas}
                      className="h-8 text-xs font-bold"
                    >
                      Próximo
                    </Button>
                  </div>
                </div>
              )}
            </Card>
          )}

          {/* TAB: CONTRATOS */}
          {activeTab === 'contratos' && (
            <Card className="border-zinc-200 dark:border-zinc-800 shadow-xl overflow-hidden">
              <Table>
                <TableHeader className="bg-zinc-50 dark:bg-zinc-900/60">
                  <TableRow className="text-[10px] uppercase font-bold tracking-wider">
                    <TableHead>Contrato nº</TableHead>
                    <TableHead>ATA Vinculada</TableHead>
                    <TableHead>Órgão/Contratante</TableHead>
                    <TableHead>Responsável (Vendedor)</TableHead>
                    <TableHead>Valor Total</TableHead>
                    <TableHead>Vencimento</TableHead>
                    <TableHead className="text-right">Ações</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filteredContratos.length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={7} className="h-32 text-center text-zinc-400 text-xs italic">
                        Nenhum contrato formalizado encontrado.
                      </TableCell>
                    </TableRow>
                  ) : paginatedContratos.map((contrato) => {
                    const isExpanded = expandedContratoId === contrato.id
                    const isExpired = contrato.data_validade && new Date(contrato.data_validade) < new Date()
                    
                    return (
                      <React.Fragment key={contrato.id}>
                        <TableRow 
                          onClick={() => handleToggleExpandContrato(contrato)}
                          className={`cursor-pointer transition-colors ${isExpanded ? 'bg-zinc-50 dark:bg-zinc-900/70 border-l-2 border-brand-accent' : 'hover:bg-zinc-50/50 dark:hover:bg-zinc-900/40'}`}
                        >
                          <TableCell className="font-bold text-xs tracking-tighter flex items-center gap-2 py-4">
                            <FileText className={`w-4 h-4 text-zinc-400 transition-transform ${isExpanded ? 'rotate-180 text-brand-accent' : ''}`} />
                            {contrato.numero_contrato}
                          </TableCell>
                          <TableCell className="text-xs font-semibold text-brand-accent">
                            {contrato.ata?.numero_arp ? (
                              <Badge variant="outline" className="border-brand-accent text-brand-accent gap-1 text-[10px]">
                                <Tag size={10} />
                                ATA {contrato.ata.numero_arp}
                              </Badge>
                            ) : (
                              <span className="text-zinc-400 italic font-normal">Sem ATA</span>
                            )}
                          </TableCell>
                          <TableCell className="text-xs max-w-xs truncate text-zinc-600 dark:text-zinc-400">
                            {contrato.entidade?.nome || '-'}
                          </TableCell>
                          <TableCell>
                            {contrato.assigned_user?.display_name ? (
                              <Badge variant="secondary" className="bg-emerald-50 text-emerald-700 border-emerald-100 text-[10px] gap-1 px-2 py-1">
                                <User size={10} />
                                {contrato.assigned_user.display_name}
                              </Badge>
                            ) : (
                              <Badge variant="outline" className="text-[10px] opacity-40 border-dashed">Sem Responsável</Badge>
                            )}
                          </TableCell>
                          <TableCell className="font-bold text-xs">
                            {new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(contrato.valor_total || 0)}
                          </TableCell>
                          <TableCell>
                            <div className="flex items-center gap-1.5 text-xs font-bold">
                              <Calendar className="w-3.5 h-3.5 text-zinc-400" />
                              <span className={isExpired ? 'text-red-500' : 'text-zinc-600 dark:text-zinc-300'}>
                                {contrato.data_validade ? new Date(contrato.data_validade).toLocaleDateString('pt-BR') : '-'}
                              </span>
                            </div>
                          </TableCell>
                          <TableCell className="text-right" onClick={e => e.stopPropagation()}>
                            <div className="flex justify-end gap-1">
                              {(isAdmin || profile?.setor === 'LICIT') && (
                                <>
                                  <Button 
                                    variant="ghost" 
                                    size="icon" 
                                    title="Atribuir Responsável"
                                    onClick={() => handleOpenAssign(contrato.id, 'contrato', contrato.assigned_to)}
                                    className="h-8 w-8 text-zinc-400 hover:text-brand-accent"
                                  >
                                    <User className="w-4 h-4" />
                                  </Button>
                                  <Button 
                                    variant="ghost" 
                                    size="icon" 
                                    title="Registrar Aditivo"
                                    onClick={async () => {
                                      const items = await fetchSaldoContrato(contrato.id)
                                      handleOpenAditivo(contrato, 'contrato', items)
                                    }}
                                    className="h-8 w-8 text-zinc-400 hover:text-emerald-600"
                                  >
                                    <Plus className="w-4 h-4" />
                                  </Button>
                                </>
                              )}
                              {contrato.arquivo_caminho && (
                                <Button variant="ghost" size="icon" asChild className="h-8 w-8">
                                  <a href={getCleanPublicUrl(contrato.arquivo_caminho)} target="_blank" rel="noopener noreferrer">
                                    <FileDown className="w-4 h-4 text-zinc-500 hover:text-brand-accent" />
                                  </a>
                                </Button>
                              )}
                            </div>
                          </TableCell>
                        </TableRow>
                        
                        {/* Expandable row: Item List & Saldo */}
                        {isExpanded && (
                          <TableRow className="bg-zinc-50/50 dark:bg-zinc-900/30 border-b border-zinc-200 dark:border-zinc-800">
                            <TableCell colSpan={7} className="p-6">
                              {loadingItems ? (
                                <div className="py-4 flex justify-center items-center text-xs text-zinc-400"><Loader2 className="w-4 h-4 animate-spin mr-2" /> Consultando saldos...</div>
                              ) : (
                                <div className="space-y-4">
                                  <h4 className="text-xs font-black uppercase text-zinc-400 tracking-wider flex items-center gap-1.5">
                                    <Tag className="w-3.5 h-3.5" /> Saldo Detalhado dos Itens do Contrato
                                  </h4>
                                  <div className="overflow-hidden rounded-xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-950">
                                    <Table>
                                      <TableHeader className="bg-zinc-100 dark:bg-zinc-900/40">
                                        <TableRow className="text-[9px] uppercase font-bold">
                                          <TableHead>Num</TableHead>
                                          <TableHead>Descrição</TableHead>
                                          <TableHead className="text-right">Qtd Contratada</TableHead>
                                          <TableHead className="text-right">Consumida</TableHead>
                                          <TableHead className="text-right">Reservada (Empenhada)</TableHead>
                                          <TableHead className="text-right">Saldo Real</TableHead>
                                          <TableHead className="text-right">V. Unitário</TableHead>
                                        </TableRow>
                                      </TableHeader>
                                      <TableBody>
                                        {itensContrato.map(it => {
                                          const consPct = it.quantidade_contratada > 0 ? (it.quantidade_consumida / it.quantidade_contratada) * 100 : 0
                                          return (
                                            <TableRow key={it.id} className="text-xs hover:bg-zinc-50/50 dark:hover:bg-zinc-900/40">
                                              <TableCell className="font-mono">#{it.numero_item || '-'}</TableCell>
                                              <TableCell className="font-medium max-w-md truncate">{it.descricao}</TableCell>
                                              <TableCell className="text-right font-mono font-bold">{it.quantidade_contratada}</TableCell>
                                              <TableCell className="text-right text-brand-accent font-mono">
                                                {it.quantidade_consumida} ({Math.round(consPct)}%)
                                              </TableCell>
                                              <TableCell className="text-right text-amber-500 font-mono">{it.quantidade_reservada}</TableCell>
                                              <TableCell className="text-right text-emerald-600 font-mono font-bold">{it.saldo_real}</TableCell>
                                              <TableCell className="text-right font-bold">{new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(it.valor_unitario)}</TableCell>
                                            </TableRow>
                                          )
                                        })}
                                      </TableBody>
                                    </Table>
                                  </div>
                                </div>
                              )}
                            </TableCell>
                          </TableRow>
                        )}
                      </React.Fragment>
                    )
                  })}
                </TableBody>
              </Table>
              
              {/* Pagination Controls */}
              {totalPagesContratos > 1 && (
                <div className="flex items-center justify-between p-4 border-t border-zinc-150 dark:border-zinc-800 bg-zinc-50/50 dark:bg-zinc-900/30">
                  <div className="text-xs text-zinc-500 font-bold uppercase tracking-wider">
                    Página {currentPageContratos} de {totalPagesContratos} ({filteredContratos.length} contratos)
                  </div>
                  <div className="flex items-center gap-2">
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => setCurrentPageContratos(prev => Math.max(1, prev - 1))}
                      disabled={currentPageContratos === 1}
                      className="h-8 text-xs font-bold"
                    >
                      Anterior
                    </Button>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => setCurrentPageContratos(prev => Math.min(totalPagesContratos, prev + 1))}
                      disabled={currentPageContratos >= totalPagesContratos}
                      className="h-8 text-xs font-bold"
                    >
                      Próximo
                    </Button>
                  </div>
                </div>
              )}
            </Card>
          )}

          {/* TAB: TIMELINE */}
          {activeTab === 'timeline' && (
            <Card className="border-zinc-200 dark:border-zinc-800 shadow-xl p-6">
              <h3 className="text-base font-bold text-zinc-900 dark:text-white mb-6 flex items-center gap-2">
                <Clock className="w-5 h-5 text-brand-accent animate-pulse" />
                Cronograma de Expiração de Documentos
              </h3>
              
              <div className="relative border-l-2 border-zinc-200 dark:border-zinc-800 ml-4 space-y-8 py-4">
                {timelineItems.length === 0 ? (
                  <p className="text-zinc-400 text-xs pl-6 italic">Nenhum documento com data de validade ativa cadastrado.</p>
                ) : timelineItems.map((item, idx) => {
                  const now = new Date()
                  const diffDays = Math.ceil((item.date.getTime() - now.getTime()) / (1000 * 60 * 60 * 24))
                  const isNearExp = diffDays <= 30 && diffDays > 0
                  const isExpired = diffDays <= 0

                  let badgeColor = 'bg-emerald-500'
                  if (isNearExp) badgeColor = 'bg-amber-500 animate-pulse'
                  if (isExpired) badgeColor = 'bg-red-500'

                  return (
                    <div key={idx} className="relative pl-8">
                      {/* Timeline dot */}
                      <span className={`absolute left-[-6px] top-1.5 w-3 h-3 rounded-full ${badgeColor} border-2 border-white dark:border-zinc-950`} />
                      
                      <div className="bg-zinc-50 dark:bg-zinc-900/50 p-4 rounded-xl border border-zinc-200 dark:border-zinc-800/60 shadow-sm inline-block min-w-[320px] max-w-lg">
                        <div className="flex justify-between items-start gap-4">
                          <span className="text-[10px] font-black uppercase text-brand-accent">{item.type}</span>
                          <span className={`text-[10px] font-bold ${isExpired ? 'text-red-500' : isNearExp ? 'text-amber-500' : 'text-emerald-500'}`}>
                            {isExpired ? 'EXPIRADO' : `${diffDays} DIAS RESTANTES`}
                          </span>
                        </div>
                        <h4 className="text-sm font-bold text-zinc-900 dark:text-white mt-1">{item.label}</h4>
                        <p className="text-xs text-zinc-500 mt-1 font-medium">{item.orgao}</p>
                        
                        <div className="flex items-center gap-1.5 mt-3 text-xs font-semibold text-zinc-400">
                          <Calendar className="w-3.5 h-3.5" />
                          {item.date.toLocaleDateString('pt-BR')}
                        </div>
                      </div>
                    </div>
                  )
                })}
              </div>
            </Card>
          )}

          {/* TAB: IMPORTAR */}
          {activeTab === 'importar' && (
            <div className="max-w-4xl mx-auto space-y-6">
              <Card className="border-zinc-200 dark:border-zinc-800 shadow-xl overflow-hidden bg-white dark:bg-zinc-950">
                <CardHeader className="bg-zinc-50 dark:bg-zinc-900/50 border-b border-zinc-200 dark:border-zinc-800">
                  <CardTitle className="text-base font-bold flex items-center gap-2">
                    <Plus className="w-5 h-5 text-brand-accent" />
                    Central de Importação e Mapeamento de Itens
                  </CardTitle>
                </CardHeader>
                <CardContent className="p-6 space-y-6">
                  {/* Select Import Type */}
                  <div className="space-y-2">
                    <Label className="text-xs uppercase font-bold text-zinc-500">Tipo de Documento</Label>
                    <Select value={importType} onValueChange={(v: any) => setImportType(v)}>
                      <SelectTrigger className="h-10"><SelectValue /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="contrato">Importar Contrato Público</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>

                  {importType === 'contrato' && (
                    <div className="space-y-6">
                      {/* Step 1: Info Contrato */}
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-6 p-4 rounded-xl bg-zinc-50 dark:bg-zinc-900/40 border border-zinc-200 dark:border-zinc-800/80">
                        <div className="space-y-3">
                          <h4 className="text-xs font-black uppercase text-brand-accent">Dados do Contrato</h4>
                          <div className="space-y-1.5">
                            <Label className="text-xs">Número do Contrato</Label>
                            <Input 
                              placeholder="Ex: Contrato 45/2026"
                              value={importForm.numero_contrato}
                              onChange={e => setImportForm({...importForm, numero_contrato: e.target.value})}
                            />
                          </div>
                          <div className="space-y-1.5">
                            <Label className="text-xs">Órgão Contratante / Cliente</Label>
                            <Select 
                              value={importForm.entidade_id} 
                              onValueChange={v => setImportForm({...importForm, entidade_id: v})}
                            >
                              <SelectTrigger className="bg-white dark:bg-zinc-900 border-zinc-200 dark:border-zinc-800"><SelectValue placeholder="Selecione o Cliente..." /></SelectTrigger>
                              <SelectContent>
                                {entidades.map(e => <SelectItem key={e.id} value={String(e.id)}>{e.nome}</SelectItem>)}
                              </SelectContent>
                            </Select>
                          </div>
                          <div className="space-y-1.5">
                            <Label className="text-xs">Valor Total (R$)</Label>
                            <Input 
                              type="number"
                              placeholder="Ex: 150000"
                              value={importForm.valor_total}
                              onChange={e => setImportForm({...importForm, valor_total: e.target.value})}
                            />
                          </div>
                        </div>

                        <div className="space-y-3">
                          <h4 className="text-xs font-black uppercase text-brand-accent">Prazos e Responsabilidade</h4>
                          <div className="grid grid-cols-2 gap-3">
                            <div className="space-y-1.5">
                              <Label className="text-xs">Data Assinatura</Label>
                              <Input 
                                type="date"
                                value={importForm.data_assinatura}
                                onChange={e => setImportForm({...importForm, data_assinatura: e.target.value})}
                              />
                            </div>
                            <div className="space-y-1.5">
                              <Label className="text-xs">Data Vigência</Label>
                              <Input 
                                type="date"
                                value={importForm.data_validade}
                                onChange={e => setImportForm({...importForm, data_validade: e.target.value})}
                              />
                            </div>
                          </div>
                          <div className="space-y-1.5">
                            <Label className="text-xs">Objeto / Resumo</Label>
                            <Input 
                              placeholder="Ex: Aquisição de medicamentos injetáveis..."
                              value={importForm.objeto_contrato}
                              onChange={e => setImportForm({...importForm, objeto_contrato: e.target.value})}
                            />
                          </div>
                          <div className="space-y-1.5">
                            <Label className="text-xs">Responsável (Vendedor)</Label>
                            <Select 
                              value={importForm.assigned_to}
                              onValueChange={v => setImportForm({...importForm, assigned_to: v})}
                            >
                              <SelectTrigger className="bg-white dark:bg-zinc-900 border-zinc-200 dark:border-zinc-800"><SelectValue placeholder="Escolha o Vendedor..." /></SelectTrigger>
                              <SelectContent>
                                {vendedores.map(v => <SelectItem key={v.id} value={v.id}>{v.display_name}</SelectItem>)}
                              </SelectContent>
                            </Select>
                          </div>
                        </div>
                      </div>

                      {/* Step 2: Vínculo de ATA */}
                      <div className="p-4 rounded-xl bg-blue-50/40 dark:bg-blue-950/10 border border-blue-100 dark:border-blue-900/30 space-y-4">
                        <div className="flex items-center justify-between">
                          <h4 className="text-xs font-black uppercase text-blue-700 dark:text-blue-400 tracking-wider flex items-center gap-1.5">
                            <ShieldCheck className="w-4 h-4" /> Vínculo de ATA de Registro de Preços (ARP)
                          </h4>
                          <Select 
                            value={importForm.vincular_ata} 
                            onValueChange={handleAtaChange}
                          >
                            <SelectTrigger className="w-64 bg-white dark:bg-zinc-900 border-zinc-200 dark:border-zinc-800"><SelectValue /></SelectTrigger>
                            <SelectContent>
                              <SelectItem value="none">-- Sem vínculo com ATA --</SelectItem>
                              <SelectItem value="new" className="font-bold text-brand-accent">++ Cadastrar Nova ATA em Conjunto ++</SelectItem>
                              {atas.map(a => <SelectItem key={a.id} value={a.id}>{a.numero_arp} - {a.entidade?.nome || a.entidade_gerenciadora}</SelectItem>)}
                            </SelectContent>
                          </Select>
                        </div>

                        {/* Sub-formulario de Nova ATA (Cenário B) */}
                        {importForm.vincular_ata === 'new' && (
                          <div className="grid grid-cols-1 md:grid-cols-3 gap-4 pt-4 border-t border-blue-100 dark:border-blue-900/30">
                            <div className="space-y-1.5">
                              <Label className="text-xs">Número da ARP</Label>
                              <Input 
                                placeholder="Ex: ARP 123/2026"
                                value={importForm.numero_arp}
                                onChange={e => setImportForm({...importForm, numero_arp: e.target.value})}
                                className="bg-white"
                              />
                            </div>
                            <div className="space-y-1.5">
                              <Label className="text-xs">Valor Global da ATA</Label>
                              <Input 
                                type="number"
                                placeholder="Ex: 500000"
                                value={importForm.valor_global}
                                onChange={e => setImportForm({...importForm, valor_global: e.target.value})}
                                className="bg-white"
                              />
                            </div>
                            <div className="space-y-1.5">
                              <Label className="text-xs">Data Validade ATA</Label>
                              <Input 
                                type="date"
                                value={importForm.data_validade_ata}
                                onChange={e => setImportForm({...importForm, data_validade_ata: e.target.value})}
                                className="bg-white"
                              />
                            </div>
                          </div>
                        )}
                      </div>

                      {/* Step 3: Itens & Mapeamento */}
                      <div className="space-y-4">
                        <div className="flex justify-between items-center">
                          <h4 className="text-xs font-black uppercase text-zinc-400 tracking-wider">Mapeamento dos Itens do Contrato</h4>
                          <Button 
                            variant="outline" 
                            size="sm"
                            onClick={handleAddImportItem}
                            className="text-xs h-8"
                          >
                            <Plus className="w-3.5 h-3.5 mr-1" /> Adicionar Item
                          </Button>
                        </div>

                        <div className="border rounded-xl overflow-hidden">
                          <Table>
                            <TableHeader className="bg-zinc-50 dark:bg-zinc-900">
                              <TableRow className="text-[10px] uppercase font-bold">
                                <TableHead className="w-16">Item nº</TableHead>
                                <TableHead>Descrição do Item</TableHead>
                                <TableHead className="w-24">Und</TableHead>
                                <TableHead className="w-28 text-right">Qtd</TableHead>
                                <TableHead className="w-28 text-right">V. Unitário</TableHead>
                                {importForm.vincular_ata !== 'none' && importForm.vincular_ata !== 'new' && (
                                  <TableHead className="w-48 text-brand-accent">Item ATA Relacionado</TableHead>
                                )}
                                <TableHead className="w-12 text-center">Excluir</TableHead>
                              </TableRow>
                            </TableHeader>
                            <TableBody>
                              {importItens.length === 0 ? (
                                <TableRow>
                                  <TableCell colSpan={7} className="h-20 text-center text-zinc-400 text-xs italic">
                                    Nenhum item adicionado ainda. Clique em "Adicionar Item".
                                  </TableCell>
                                </TableRow>
                              ) : importItens.map((it, idx) => (
                                <TableRow key={it.id}>
                                  <TableCell>
                                    <Input 
                                      className="h-8 text-xs font-mono"
                                      value={it.numero_item}
                                      onChange={e => {
                                        const nl = [...importItens]
                                        nl[idx].numero_item = e.target.value
                                        setImportItens(nl)
                                      }}
                                    />
                                  </TableCell>
                                  <TableCell>
                                    <Input 
                                      className="h-8 text-xs"
                                      placeholder="Ex: Amoxicilina 500mg..."
                                      value={it.descricao}
                                      onChange={e => {
                                        const nl = [...importItens]
                                        nl[idx].descricao = e.target.value
                                        setImportItens(nl)
                                      }}
                                    />
                                  </TableCell>
                                  <TableCell>
                                    <Input 
                                      className="h-8 text-xs"
                                      value={it.unidade}
                                      onChange={e => {
                                        const nl = [...importItens]
                                        nl[idx].unidade = e.target.value
                                        setImportItens(nl)
                                      }}
                                    />
                                  </TableCell>
                                  <TableCell>
                                    <Input 
                                      type="number"
                                      className="h-8 text-xs text-right"
                                      value={it.quantidade || ''}
                                      onChange={e => {
                                        const nl = [...importItens]
                                        nl[idx].quantidade = Number(e.target.value)
                                        setImportItens(nl)
                                      }}
                                    />
                                  </TableCell>
                                  <TableCell>
                                    <Input 
                                      type="number"
                                      className="h-8 text-xs text-right"
                                      value={it.valor_unitario || ''}
                                      onChange={e => {
                                        const nl = [...importItens]
                                        nl[idx].valor_unitario = Number(e.target.value)
                                        setImportItens(nl)
                                      }}
                                    />
                                  </TableCell>
                                  {importForm.vincular_ata !== 'none' && importForm.vincular_ata !== 'new' && (
                                    <TableCell>
                                      <Select 
                                        value={it.item_ata_id} 
                                        onValueChange={v => {
                                          const nl = [...importItens]
                                          nl[idx].item_ata_id = v
                                          setImportItens(nl)
                                        }}
                                      >
                                        <SelectTrigger className="h-8 text-xs bg-white dark:bg-zinc-900 border-zinc-200 dark:border-zinc-800"><SelectValue placeholder="Selecione o Item..." /></SelectTrigger>
                                        <SelectContent>
                                          {ataItensMap.map(ai => (
                                            <SelectItem key={ai.id} value={String(ai.id)}>
                                              #{ai.numero_item} - {ai.descricao}
                                            </SelectItem>
                                          ))}
                                        </SelectContent>
                                      </Select>
                                    </TableCell>
                                  )}
                                  <TableCell className="text-center">
                                    <Button 
                                      variant="ghost" 
                                      size="icon" 
                                      className="h-7 w-7 text-zinc-400 hover:text-red-500"
                                      onClick={() => handleRemoveImportItem(it.id)}
                                    >
                                      <Trash2 className="w-4 h-4" />
                                    </Button>
                                  </TableCell>
                                </TableRow>
                              ))}
                            </TableBody>
                          </Table>
                        </div>
                      </div>

                      <div className="flex justify-end gap-3 pt-6 border-t font-semibold">
                        <Button variant="outline" onClick={() => { setImportItens([]); setImportForm({ ...importForm, numero_contrato: '' }) }}>Resetar</Button>
                        <Button 
                          onClick={handleImport} 
                          disabled={loadingImport || importItens.length === 0}
                          className="bg-brand-accent hover:opacity-90 text-primary-foreground px-8 font-bold shadow-lg shadow-violet-500/20 h-10"
                        >
                          {loadingImport ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : <CheckSquare className="w-4 h-4 mr-2" />}
                          SALVAR IMPORTAÇÃO
                        </Button>
                      </div>

                    </div>
                  )}

                </CardContent>
              </Card>
            </div>
          )}
        </>
      )}

      {/* MODAL: ASSIGN RESPONSIBLE */}
      <Dialog open={!!assigningDoc} onOpenChange={(open) => { if (!open) setAssigningDoc(null) }}>
        <DialogContent className="sm:max-w-[420px]">
          <DialogHeader>
            <DialogTitle>Definir Responsável do Setor de Vendas</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label>Vendedor / Responsável Comercial</Label>
              <Select value={selectedVendedorId} onValueChange={setSelectedVendedorId}>
                <SelectTrigger><SelectValue placeholder="Escolha um profissional..." /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">-- Nenhum vendedor (Sem atribuição) --</SelectItem>
                  {vendedores.map(v => (
                    <SelectItem key={v.id} value={v.id}>{v.display_name} ({v.email})</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setAssigningDoc(null)}>Cancelar</Button>
            <Button className="bg-brand-accent text-primary-foreground hover:opacity-90 font-bold" onClick={handleAssign}>Confirmar Atribuição</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* MODAL: ADITIVOS */}
      <Dialog open={isAditivoModalOpen} onOpenChange={(open) => { if (!open) setIsAditivoModalOpen(false) }}>
        <DialogContent className="sm:max-w-[620px] max-h-[85vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <AlertTriangle className="w-5 h-5 text-amber-500 animate-bounce" />
              Registrar Aditivo Oficial (Acréscimo ou Prorrogação)
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-5 py-2">
            <div className="bg-zinc-50 dark:bg-zinc-900 border rounded-xl p-3 text-xs space-y-1">
              <p className="font-bold">Documento Alvo:</p>
              <p className="text-brand-accent font-bold">
                {selectedAtaForAditivo ? `ATA de Registro de Preços nº ${selectedAtaForAditivo.numero_arp}` : `Contrato Público nº ${selectedContratoForAditivo?.numero_contrato}`}
              </p>
              <p className="text-zinc-500">Órgão: {selectedAtaForAditivo?.entidade?.nome || selectedContratoForAditivo?.entidade?.nome || '-'}</p>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-1.5">
                <Label className="text-xs uppercase font-bold text-zinc-500">Número do Termo Aditivo</Label>
                <Input 
                  placeholder="Ex: Termo Aditivo 01/2026"
                  value={aditivoForm.numero}
                  onChange={e => setAditivoForm({ ...aditivoForm, numero: e.target.value })}
                />
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs uppercase font-bold text-zinc-500">Tipo de Aditivo</Label>
                <Select 
                  value={aditivoForm.tipo} 
                  onValueChange={(val: any) => setAditivoForm({ ...aditivoForm, tipo: val })}
                >
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="PRAZO">Prorrogação de Vigência (Prazo)</SelectItem>
                    <SelectItem value="QUANTIDADE">Acréscimo de Saldo de Itens (Quantidade)</SelectItem>
                    <SelectItem value="AMBOS">Ambos (Prazo e Quantidade)</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>

            {aditivoForm.tipo !== 'QUANTIDADE' && (
              <div className="space-y-1.5 p-3 rounded-xl bg-violet-50/50 dark:bg-violet-950/15 border border-violet-100 dark:border-violet-900/30">
                <Label className="text-xs font-bold text-violet-700 dark:text-violet-400">Nova Data Limite de Vigência (Prorrogação)</Label>
                <Input 
                  type="date"
                  value={aditivoForm.novaData}
                  onChange={e => setAditivoForm({ ...aditivoForm, novaData: e.target.value })}
                  className="bg-white dark:bg-zinc-900 border-violet-200 dark:border-violet-950"
                />
              </div>
            )}

            {aditivoForm.tipo !== 'PRAZO' && (
              <div className="space-y-3">
                <h4 className="text-xs font-black uppercase text-zinc-400 tracking-wider">Acréscimo de Saldo por Item (Ajuste de Itens)</h4>
                
                <div className="border rounded-xl overflow-hidden max-h-48 overflow-y-auto">
                  <Table>
                    <TableHeader className="bg-zinc-50 dark:bg-zinc-900 sticky top-0">
                      <TableRow className="text-[10px] uppercase font-bold">
                        <TableHead className="w-16">Item</TableHead>
                        <TableHead>Descrição</TableHead>
                        <TableHead className="text-right">Qtd Atual</TableHead>
                        <TableHead className="text-right text-brand-accent">Qtd Adicionada</TableHead>
                        <TableHead className="text-right">Novo Saldo</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {(selectedAtaForAditivo ? itensAta : itensContrato).map(it => {
                        const currentVal = selectedAtaForAditivo ? it.quantidade_registrada : it.quantidade_contratada
                        const addedVal = Number(aditivoForm.itensAditivados[it.id] || 0)
                        const finalVal = currentVal + addedVal
                        const complianceExceeded = addedVal > (currentVal * 0.25)
                        
                        return (
                          <TableRow key={it.id} className="text-xs hover:bg-zinc-50/50">
                            <TableCell className="font-mono">#{it.numero_item || '-'}</TableCell>
                            <TableCell className="font-medium max-w-xs truncate">{it.descricao}</TableCell>
                            <TableCell className="text-right font-mono font-bold text-zinc-500">{currentVal}</TableCell>
                            <TableCell>
                              <Input 
                                type="number"
                                className={`h-8 text-xs text-right max-w-[100px] bg-white dark:bg-zinc-900 font-bold font-mono ${complianceExceeded ? 'border-amber-400 bg-amber-50 text-amber-800' : 'border-zinc-200'}`}
                                value={aditivoForm.itensAditivados[it.id] || ''}
                                onChange={e => {
                                  const val = Math.max(0, Number(e.target.value))
                                  setAditivoForm({
                                    ...aditivoForm,
                                    itensAditivados: {
                                      ...aditivoForm.itensAditivados,
                                      [it.id]: val
                                    }
                                  })
                                }}
                                title={complianceExceeded ? 'Alerta: Acréscimo excede os 25% permitidos por lei.' : ''}
                              />
                            </TableCell>
                            <TableCell className="text-right font-mono font-bold text-emerald-600">
                              {finalVal}
                              {complianceExceeded && (
                                <span className="block text-[8px] text-amber-600 font-black animate-pulse flex items-center justify-end gap-0.5 mt-0.5">
                                  <AlertTriangle size={8} /> EXCEDE 25%
                                </span>
                              )}
                            </TableCell>
                          </TableRow>
                        )
                      })}
                    </TableBody>
                  </Table>
                </div>
              </div>
            )}

            <div className="space-y-1.5">
              <Label className="text-xs uppercase font-bold text-zinc-500">Justificativa Legal / Observação</Label>
              <textarea 
                placeholder="Ex: Aditivo com base no art. 65 da Lei 8.666/93..."
                value={aditivoForm.justificativa}
                onChange={e => setAditivoForm({ ...aditivoForm, justificativa: e.target.value })}
                className="w-full h-20 bg-white dark:bg-zinc-950 border border-zinc-200 dark:border-zinc-800 rounded-xl p-3 text-xs focus:outline-none focus:ring-1 focus:ring-brand-accent/40"
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setIsAditivoModalOpen(false)}>Cancelar</Button>
            <Button className="bg-brand-accent text-primary-foreground hover:opacity-90 font-bold" onClick={handleSaveAditivo}>Salvar Aditivo Oficial</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

    </div>
  )
}
