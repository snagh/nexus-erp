import { useState, useEffect, useCallback, useMemo, Fragment, useRef } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { supabase } from '../../lib/supabase'
import { toast } from 'sonner'
import type { Tables } from '../../supabaseTypes'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableRow,
} from '../ui/table'
import { Button } from '../ui/button'
import {
  Plus, Search, RefreshCw, Loader2, Pencil, Trash2,
  ChevronDown, ArrowUpDown,
  FileText, Timer, ShoppingCart,
  Building2, MapPin, UserPlus, Users, CheckCircle2,
  PackageCheck, Package, FileSpreadsheet, FileDown, LayoutDashboard, List, GitMerge,
  AlertTriangle, Upload, Paperclip, Wallet, Clock, Link as LinkIcon
} from 'lucide-react'
import { Tabs, TabsList, TabsTrigger, TabsContent } from '../ui/tabs'
import { deleteDocument, getCleanPublicUrl, uploadDocument } from '../../lib/storage'
import { assignNota, assignEntidade, confirmReceipt, getProfiles, selectAllNotas, fetchDashboardEmpenhos, refreshNotaStatus } from '../../lib/supabaseHelpers'
import { exportToExcel, exportToPDF } from '../../reportUtils'
import { NFsLancadas } from './NFsLancadas'
import { NotaFormModal } from './NotaFormModal'
import { ExpandedItens } from './ExpandedItens'
import { EmpenhoReports } from './EmpenhoReports'
import { UnifyEntitiesModal } from './UnifyEntitiesModal'
import { EditEntityModal } from './EditEntityModal'
import { ModalVincularAtaEmpenho } from './ModalVincularAtaEmpenho'
import { Badge } from '../ui/badge'
import { Label } from '../ui/label'
import { Input } from '../ui/input'
import { ScrollArea } from '../ui/scroll-area'
import { useAuth } from '../../AuthContext'
import { canEditNota, canDeleteNota, canDistributeNota } from '../../lib/permissions'
import { ConfirmDeleteEmpenhoDialog } from './ConfirmDeleteEmpenhoDialog'
import { calculateSesauCompleteness, isNotaModoSesau } from '../../lib/utils'
import { logAction } from '../../lib/logger'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from '../ui/dialog'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '../ui/select'

type Nota = Tables<'notas'>
type NotaWithEntidade = Nota & {
  entidades: Tables<'entidades'> | null
  creator?: { display_name: string | null; email: string } | null
}

const STATUS_BADGE: Record<string, { label: string; color: string }> = {
  PENDENTE: { label: 'Pendente', color: 'bg-amber-50 text-amber-700 dark:bg-amber-950/40 dark:text-amber-400' },
  EM_ANDAMENTO: { label: 'Em Andamento', color: 'bg-blue-50 text-blue-700 dark:bg-blue-950/40 dark:text-blue-400' },
  CONCLUIDO: { label: 'Concluído', color: 'bg-emerald-50 text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-400' },
  CONCLUIDO_MANUAL: { label: 'Concluído', color: 'bg-emerald-50 text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-400' },
  FATOR_CAIXA: { label: 'Concluído (Fator Caixa)', color: 'bg-indigo-50 text-indigo-700 dark:bg-indigo-950/40 dark:text-indigo-400 border border-indigo-200' },
  CANCELADO: { label: 'Cancelado', color: 'bg-red-50 text-red-700 dark:bg-red-950/40 dark:text-red-400' },
}

function formatCurrency(n: number | null | undefined) {
  if (n == null) return '—'
  return n.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })
}

function getDeadlineInfo(dateStr: string | null | undefined) {
  if (!dateStr) return null
  // Tentar parsear a data de forma resiliente
  const targetDate = new Date(dateStr.includes('T') ? dateStr : dateStr + 'T23:59:59')
  
  if (isNaN(targetDate.getTime())) return null

  const now = new Date()
  const diffTime = targetDate.getTime() - now.getTime()
  const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24))
  
  if (isNaN(diffDays)) return null
  
  let color = 'text-zinc-500 bg-zinc-100 dark:bg-zinc-800'
  if (diffDays <= 0) color = 'text-white bg-red-600 animate-pulse'
  else if (diffDays <= 3) color = 'text-white bg-orange-500'
  else if (diffDays <= 7) color = 'text-amber-700 dark:text-amber-400 bg-amber-100 dark:bg-amber-950/40 border border-amber-200/50 dark:border-amber-900/30'
  else color = 'text-brand-accent bg-brand-accent/10 dark:bg-brand-accent/20 border border-brand-accent/20 dark:border-brand-accent/30'

  return { diffDays, color }
}

function calculateAggregateProgress(itens: any[], nota?: any) {
  if (!itens || itens.length === 0) return { percent: 0, percentFisico: 0, percentNF: 0, percentDiaD: 0, isOverDelivery: false }
  
  let totalPedidoValor = 0
  let totalEntregueFisicoValor = 0
  let totalEntregueNFValor = 0
  let totalEntregueDiaDValor = 0

  let totalPedidoQty = 0
  let totalEntregueFisicoQty = 0
  let totalEntregueNFQty = 0
  let totalEntregueDiaDQty = 0

  let hasValue = false
  let hasOver = false
  
  // SE FOR TERESINA, DESCONSIDERAR FATOR CAIXA COMO STATUS CONCLUÍDO/PERCENTUAL
  const emissor = String(nota?.emissor || '').toLowerCase()
  const entidadeNome = String(nota?.entidades?.nome || '').toLowerCase()
  const entidadeMunicipio = String(nota?.entidades?.municipio || '').toLowerCase()
  const isNotaTeresina = emissor.includes('teresina') || 
                         entidadeNome.includes('teresina') || 
                         entidadeMunicipio.includes('teresina')

  itens.forEach(item => {
    const pedido = (Number(item.quantidade) || 0)
    const valorUnitario = (Number(item.valor_unitario) || 0)
    if (valorUnitario > 0) {
      hasValue = true
    }
    
    const entregas = (item.historico_entregas as any[]) || []
    
    // Total entregue (Físico + NF)
    const entregueTotal = entregas.reduce(
      (acc, curr) => acc + (Number(curr.quantidade_entregue) || 0), 
      0
    ) || 0

    // Entregue físico (apenas quando itens_entregues não for false)
    const entregueFisico = entregas
      .filter(curr => curr.itens_entregues !== false)
      .reduce((acc, curr) => acc + (Number(curr.quantidade_entregue) || 0), 0) || 0
    
    // Entregue Dia D (apenas quando e_dia_d === true)
    const entregueDiaD = entregas
      .filter(curr => curr.e_dia_d === true)
      .reduce((acc, curr) => acc + (Number(curr.quantidade_entregue) || 0), 0) || 0
    
    // Se o item foi encerrado por fator caixa, consideramos o "pedido" dele como o que foi entregue
    // para que ele conte como 100% na barra de progresso visual
    let isFatorCaixa = entregas.some(e => e.motivo_pendencia?.includes('Fator Caixa'))
    
    if (isNotaTeresina) {
        isFatorCaixa = false
    }

    let entregueNFConsiderado = entregueTotal
    let entregueFisicoConsiderado = entregueFisico
    let entregueDiaDConsiderado = entregueDiaD
    if (isFatorCaixa) {
        entregueNFConsiderado = pedido // Conta como 100% do pedido deste item
        entregueFisicoConsiderado = pedido
        entregueDiaDConsiderado = pedido
    } else {
        // Trava para que a sobrebaixa de um item não cubra o saldo zerado de outros itens
        entregueNFConsiderado = Math.min(entregueTotal, pedido)
        entregueFisicoConsiderado = Math.min(entregueFisico, pedido)
        entregueDiaDConsiderado = Math.min(entregueDiaD, pedido)
    }

    totalPedidoQty += pedido
    totalEntregueNFQty += entregueNFConsiderado
    totalEntregueFisicoQty += entregueFisicoConsiderado
    totalEntregueDiaDQty += entregueDiaDConsiderado

    totalPedidoValor += pedido * valorUnitario
    totalEntregueNFValor += entregueNFConsiderado * valorUnitario
    totalEntregueFisicoValor += entregueFisicoConsiderado * valorUnitario
    totalEntregueDiaDValor += entregueDiaDConsiderado * valorUnitario

    if (entregueTotal > pedido) hasOver = true
  })
  
  let percentNF = 0
  let percentFisico = 0
  let percentDiaD = 0

  if (hasValue && totalPedidoValor > 0) {
    percentNF = Math.floor((totalEntregueNFValor / totalPedidoValor) * 100)
    percentFisico = Math.floor((totalEntregueFisicoValor / totalPedidoValor) * 100)
    percentDiaD = Math.floor((totalEntregueDiaDValor / totalPedidoValor) * 100)
  } else if (totalPedidoQty > 0) {
    percentNF = Math.floor((totalEntregueNFQty / totalPedidoQty) * 100)
    percentFisico = Math.floor((totalEntregueFisicoQty / totalPedidoQty) * 100)
    percentDiaD = Math.floor((totalEntregueDiaDQty / totalPedidoQty) * 100)
  }

  if (percentNF > 100) percentNF = 100
  if (percentNF < 0) percentNF = 0

  if (percentFisico > 100) percentFisico = 100
  if (percentFisico < 0) percentFisico = 0

  if (percentDiaD > 100) percentDiaD = 100
  if (percentDiaD < 0) percentDiaD = 0
  
  // Garantir que o físico nunca seja maior que o total de NF
  if (percentFisico > percentNF) {
    percentFisico = percentNF
  }

  // Garantir que o Dia D nunca seja maior que o total de NF
  if (percentDiaD > percentNF) {
    percentDiaD = percentNF
  }
  
  return { percent: percentNF, percentFisico, percentNF, percentDiaD, isOverDelivery: hasOver }
}

const PAGE_SIZE = 25

export function EmpenhoList() {
  const [searchParams] = useSearchParams()
  const initialNe = searchParams.get('ne') || ''
  const initialId = searchParams.get('id')

  const [notas, setNotas] = useState<NotaWithEntidade[]>([])
  const [dashboardMetrics, setDashboardMetrics] = useState({
    totalClientes: 0,
    totalEmpenhos: 0,
    empenhosPendentes: 0,
    valorTotal: 0,
    valorAtendidoNF: 0,
    valorPendente: 0
  })
  const [loading, setLoading] = useState(true)
  const [fetchingMore, setFetchingMore] = useState(false)
  const [hasMore, setHasMore] = useState(true)
  const [search, setSearch] = useState(initialNe)
  const [itemSearch, setItemSearch] = useState('')
  const [debouncedSearch, setDebouncedSearch] = useState(search)
  const [debouncedItemSearch, setDebouncedItemSearch] = useState(itemSearch)
  const [statusFilter, setStatusFilter] = useState<'TODOS' | 'PENDENTES' | 'CONCLUIDOS'>('TODOS')
  const [clientSortOrder, setClientSortOrder] = useState<'COUNT_DESC' | 'COUNT_ASC' | 'VALUE_DESC' | 'VALUE_ASC' | 'ALPHA_ASC' | 'ALPHA_DESC'>('COUNT_DESC')
  const [totalCount, setTotalCount] = useState(0)
  const [expandedId, setExpandedId] = useState<number | null>(initialId ? Number(initialId) : null)
  const [modalOpen, setModalOpen] = useState(false)
  const [unifyModalOpen, setUnifyModalOpen] = useState(false)
  const [editEntityModalOpen, setEditEntityModalOpen] = useState(false)
  const [selectedEntityForEdit, setSelectedEntityForEdit] = useState<any>(null)

  const [notaToEdit, setNotaToEdit] = useState<Nota | null>(null)
  const [deleteConfirmNota, setDeleteConfirmNota] = useState<Nota | null>(null)
  const [tab, setTab] = useState<'lista' | 'relatorios'>('lista')
  const [startDate, setStartDate] = useState('')
  const [endDate, setEndDate] = useState('')
  const [myLoadOnly, setMyLoadOnly] = useState(false)
  const [selectedCollaborator, setSelectedCollaborator] = useState<string>('TODOS')
  const [notificationModalOpen, setNotificationModalOpen] = useState(false)
  const [selectedNotaForNotification, setSelectedNotaForNotification] = useState<NotaWithEntidade | null>(null)
  const [modalNFsConfig, setModalNFsConfig] = useState<{ open: boolean, searchTerm: string, title: string }>({ open: false, searchTerm: '', title: '' })
  const [distributeModalOpen, setDistributeModalOpen] = useState(false)
  const [notaParaDistribuir, setNotaParaDistribuir] = useState<Nota | null>(null)
  const [entidadeParaDistribuir, setEntidadeParaDistribuir] = useState<{ id: number | null, name: string } | null>(null)
  const [colaboradores, setColaboradores] = useState<any[]>([])
  const [submittingDist, setSubmittingDist] = useState(false)
  const [modalMoveEmpenho, setModalMoveEmpenho] = useState<{ open: boolean; nota: NotaWithEntidade | null }>({ open: false, nota: null })
  const [entidadesList, setEntidadesList] = useState<Tables<'entidades'>[]>([])
  const [searchEntidade, setSearchEntidade] = useState('')
  const [selectedEntidadeId, setSelectedEntidadeId] = useState('')
  const [loadingMove, setLoadingMove] = useState(false)
  const [isDefaultExpanded, setIsDefaultExpanded] = useState(() => {
    const saved = localStorage.getItem('empenhos_default_expanded')
    return saved !== null ? JSON.parse(saved) : true
  })
  const [manualToggles, setManualToggles] = useState<Set<string>>(() => {
    const saved = localStorage.getItem('empenhos_manual_toggles')
    return saved ? new Set(JSON.parse(saved)) : new Set()
  })

  const [clientPage, setClientPage] = useState(1)
  const [stableGroups, setStableGroups] = useState<any[]>([])
  const CLIENTS_PER_PAGE = 10

  useEffect(() => {
    setClientPage(1)
  }, [debouncedSearch, debouncedItemSearch, statusFilter, startDate, endDate, myLoadOnly, selectedCollaborator, clientSortOrder])

  const [pedidoModalOpen, setPedidoModalOpen] = useState(false)
  const [selectedNotaForPedido, setSelectedNotaForPedido] = useState<NotaWithEntidade | null>(null)
  const [tempNumeroPedido, setTempNumeroPedido] = useState('')
  const [savingPedido, setSavingPedido] = useState(false)

  const [isModalVincularAtaOpen, setIsModalVincularAtaOpen] = useState(false)
  const [selectedNotaForVincularAta, setSelectedNotaForVincularAta] = useState<NotaWithEntidade | null>(null)

  const handleUploadNeFile = async (notaId: number, files: FileList | null) => {
    if (!files || files.length === 0) return;
    const file = files[0];
    try {
      toast.info('Fazendo upload do PDF da NE, por favor aguarde...');
      const { path, error: uploadErr } = await uploadDocument(file);
      if (uploadErr) throw uploadErr;
      if (!path) throw new Error('Não foi possível obter o caminho do upload.');

      const { error: dbErr } = await supabase
        .from('notas')
        .update({ arquivo_caminho: path })
        .eq('id', notaId);

      if (dbErr) throw dbErr;

      await logAction('ANEXAR_ARQUIVO_NE', 'notas', notaId, { arquivo_caminho: path });
      toast.success('PDF da NE anexado com sucesso!');
      
      setNotas(prev => prev.map(n => n.id === notaId ? { ...n, arquivo_caminho: path } : n));
    } catch (err: any) {
      console.error(err);
      toast.error('Erro ao anexar arquivo da NE: ' + err.message);
    }
  };

  const isGroupCollapsed = (name: string) => {
    if (isDefaultExpanded) {
      return manualToggles.has(name)
    } else {
      return !manualToggles.has(name)
    }
  }

  const { profile: currentUserProfile, isAdmin, isSuperAdmin, canCreate } = useAuth()
  const navigate = useNavigate()

  const [pendingReceiptCount, setPendingReceiptCount] = useState(0)

  useEffect(() => {
    if (!currentUserProfile?.id) return
    
    const fetchPendingCount = async () => {
      const { count, error } = await supabase
        .from('notas')
        .select('*', { count: 'exact', head: true })
        .eq('assigned_to', currentUserProfile.id)
        .eq('status_carga', 'DISTRIBUIDO')
        
      if (!error && count !== null) {
        setPendingReceiptCount(count)
      }
    }
    
    fetchPendingCount()
  }, [currentUserProfile?.id, notas])

  const fetchingRef = useRef(false)
  const currentQueryIdRef = useRef(0)
  const observerRef = useRef<IntersectionObserver | null>(null)
  const lastElementRef = useRef<HTMLDivElement | null>(null)

  const fetchNotas = useCallback(async (isAppend = false) => {
    // Se for append e já estiver buscando, retorna cedo para evitar chamadas duplicadas
    if (isAppend && fetchingRef.current) return

    // Se for uma busca nova (não append), incrementamos o ID para descartar requisições em vôo antigas
    if (!isAppend) {
      currentQueryIdRef.current += 1
    }
    const queryId = currentQueryIdRef.current

    fetchingRef.current = true

    const { data: { user } } = await supabase.auth.getUser()
    if (!user) {
        if (queryId === currentQueryIdRef.current) {
            fetchingRef.current = false
        }
        return
    }

    if (isAppend) setFetchingMore(true)
    else {
      setLoading(true)
      setHasMore(true) // Reseta hasMore ao iniciar uma nova busca fresca
    }
    
    // Cálculo seguro da página baseado no estado atual das notas se for append
    // ou resetar para 0 se não for append
    const pageToFetch = isAppend ? Math.floor(notas.length / PAGE_SIZE) : 0

    let statusArray: string[] | undefined = undefined;
    if (statusFilter === 'PENDENTES') statusArray = ['PENDENTE', 'EM_ANDAMENTO']
    if (statusFilter === 'CONCLUIDOS') statusArray = ['CONCLUIDO', 'FATOR_CAIXA', 'CONCLUIDO_MANUAL']

    const isVendasOP = !!(currentUserProfile?.nivel === 'OP' && currentUserProfile?.setor?.toUpperCase() === 'VENDAS');

    const filters: any = {
        emissor: debouncedSearch || undefined,
        itemSearch: debouncedItemSearch || undefined,
        setor: (currentUserProfile?.nivel === 'DEV' || currentUserProfile?.nivel === 'ADM' || isVendasOP || currentUserProfile?.setor?.toUpperCase() === 'COMPRAS') ? undefined : currentUserProfile?.setor,
        statusArray,
        dataInicio: startDate || undefined,
        dataFim: endDate || undefined,
        assignedTo: myLoadOnly ? currentUserProfile?.id : (selectedCollaborator !== 'TODOS' ? selectedCollaborator : undefined)
    }

    try {
        const { data, error, count } = await selectAllNotas(
          debouncedItemSearch 
            ? '*, entidades(*), assigned:profiles!assigned_to(display_name, email), itens!inner(*, historico_entregas(*))' 
            : '*, entidades(*), assigned:profiles!assigned_to(display_name, email), itens(*, historico_entregas(*))',
          pageToFetch,
          PAGE_SIZE,
          filters,
          currentUserProfile?.id,
          isVendasOP,
          { column: 'emissor', ascending: true }
        )

        // Se uma nova query começou no meio tempo, descarta esse resultado
        if (queryId !== currentQueryIdRef.current) return

        if (error) {
          // PGRST103 é "Range Not Satisfiable", acontece quando tentamos buscar uma página que não existe.
          // O gateway Supabase às vezes retorna truncado com a mensagem '{"'.
          if (error.code === 'PGRST103' || error.message === '{"') {
            setHasMore(false)
          } else {
            toast.error('Erro ao carregar empenhos: ' + error.message)
          }
        } else {
          const newData = (data as unknown as NotaWithEntidade[]) ?? []
          
          if (isAppend) {
            setNotas(prev => {
                const existingIds = new Set(prev.map(n => n.id))
                const filteredNew = newData.filter(n => !existingIds.has(n.id))
                return [...prev, ...filteredNew]
            })
          } else {
            setNotas(newData)
            // Carrega métricas totais do dashboard sem limitação de paginação
            fetchDashboardEmpenhos(filters, currentUserProfile?.id, isVendasOP).then(res => {
              if (res.data) {
                setDashboardMetrics(computeMetricsFromData(res.data))
              }
            }).catch(err => {
              console.error('Erro ao carregar métricas do dashboard:', err)
            })
          }
          const currentTotal = count ?? 0
          setTotalCount(currentTotal)
          
          // Lógica mais robusta para hasMore
          if (isAppend) {
            setHasMore(notas.length + newData.length < currentTotal)
          } else {
            setHasMore(newData.length < currentTotal)
          }
        }
    } finally {
        if (queryId === currentQueryIdRef.current) {
            setLoading(false)
            setFetchingMore(false)
            fetchingRef.current = false
        }
    }
  }, [notas.length, debouncedSearch, debouncedItemSearch, isAdmin, currentUserProfile, statusFilter, startDate, endDate, myLoadOnly, selectedCollaborator])

  // Setup do Infinite Scroll
  useEffect(() => {
    if (loading) return
    
    if (observerRef.current) observerRef.current.disconnect()

    observerRef.current = new IntersectionObserver(entries => {
      if (entries[0].isIntersecting && hasMore && !fetchingMore && !loading) {
        fetchNotas(true)
      }
    }, { threshold: 0.1 })

    if (lastElementRef.current) {
      observerRef.current.observe(lastElementRef.current)
    }

    return () => {
      if (observerRef.current) observerRef.current.disconnect()
    }
  }, [hasMore, fetchingMore, loading, fetchNotas])

  useEffect(() => {
    const timer = setTimeout(() => setDebouncedSearch(search), 400)
    return () => clearTimeout(timer)
  }, [search])

  useEffect(() => {
    const timer = setTimeout(() => setDebouncedItemSearch(itemSearch), 400)
    return () => clearTimeout(timer)
  }, [itemSearch])
  useEffect(() => {
    fetchNotas(false)
  }, [debouncedSearch, debouncedItemSearch, statusFilter, startDate, endDate, myLoadOnly, selectedCollaborator])

  useEffect(() => {
    localStorage.setItem('empenhos_default_expanded', JSON.stringify(isDefaultExpanded))
    localStorage.setItem('empenhos_manual_toggles', JSON.stringify(Array.from(manualToggles)))
  }, [isDefaultExpanded, manualToggles])

  useEffect(() => {
    async function loadColabs() {
        const { data } = await getProfiles()
        if (data) setColaboradores(data)
    }
    loadColabs()
  }, [])


  const handleEdit = (nota: Nota) => {
    setNotaToEdit(nota)
    setModalOpen(true)
  }

  const handleOpenEditEntity = (e: React.MouseEvent, entidade: any) => {
    e.stopPropagation()
    setSelectedEntityForEdit(entidade)
    setEditEntityModalOpen(true)
  }

  const toggleGroup = (emissor: string) => {
    setManualToggles(prev => {
      const next = new Set(prev)
      if (next.has(emissor)) next.delete(emissor)
      else next.add(emissor)
      return next
    })
  }

  const expandAll = () => {
    setIsDefaultExpanded(true)
    setManualToggles(new Set())
  }

  const collapseAll = () => {
    setIsDefaultExpanded(false)
    setManualToggles(new Set())
  }

  const handleOpenDistribute = async (nota: Nota) => {
    setEntidadeParaDistribuir(null)
    setNotaParaDistribuir(nota)
    setDistributeModalOpen(true)
    const { data } = await getProfiles()
    if (data) setColaboradores(data)
  }

  const handleOpenDistributeEntidade = async (e: React.MouseEvent, group: any) => {
    e.stopPropagation()
    setNotaParaDistribuir(null)
    setEntidadeParaDistribuir({ id: group.entidade?.id || null, name: group.name })
    setDistributeModalOpen(true)
    const { data } = await getProfiles()
    if (data) setColaboradores(data)
  }

  const handleConfirmDistribute = async (userId: string | null) => {
    if (!notaParaDistribuir && !entidadeParaDistribuir) return
    setSubmittingDist(true)
    
    let error = null
    if (entidadeParaDistribuir) {
      const result = await assignEntidade(entidadeParaDistribuir.id, entidadeParaDistribuir.name, userId)
      error = result.error
    } else if (notaParaDistribuir) {
      const result = await assignNota(notaParaDistribuir.id, userId)
      error = result.error
    }

    if (error) {
      toast.error('Erro ao distribuir: ' + (error as any).message)
    } else {
      toast.success(entidadeParaDistribuir ? 'Cliente distribuído com sucesso!' : 'Empenho distribuído com sucesso!')
      setDistributeModalOpen(false)
      fetchNotas()
    }
    setSubmittingDist(false)
  }

  const handleConfirmReceipt = async (notaId: number) => {
    const { error } = await confirmReceipt(notaId)
    if (error) {
      toast.error('Erro ao confirmar recebimento: ' + error.message)
    } else {
      toast.success('Recebimento confirmado! O empenho agora está na sua carga oficial.')
      fetchNotas()
    }
  }

  const handleToggleManualCompletion = async (nota: Nota) => {
    try {
      const isManual = nota.status_geral === 'CONCLUIDO_MANUAL'
      if (isManual) {
        const { error } = await supabase
          .from('notas')
          .update({ status_geral: 'PENDENTE' })
          .eq('id', nota.id)
        if (error) throw error
        await refreshNotaStatus(nota.id)
        toast.success(`Empenho #${nota.numero_ne} reaberto com sucesso!`)
      } else {
        const { error } = await supabase
          .from('notas')
          .update({ status_geral: 'CONCLUIDO_MANUAL', e_notificacao: false })
          .eq('id', nota.id)
        if (error) throw error
        toast.success(`Empenho #${nota.numero_ne} finalizado manualmente!`)
      }
      fetchNotas(false)
    } catch (err: any) {
      toast.error('Erro ao alterar status: ' + err.message)
    }
  }

  const handleOpenMoveEmpenho = async (nota: NotaWithEntidade) => {
    setModalMoveEmpenho({ open: true, nota })
    setSearchEntidade('')
    setSelectedEntidadeId('')
    try {
      const { data, error } = await supabase.from('entidades').select('*').order('nome')
      if (error) throw error
      if (data) setEntidadesList(data)
    } catch (err: any) {
      toast.error('Erro ao carregar clientes: ' + err.message)
    }
  }

  const handleConfirmMoveEmpenho = async () => {
    const nota = modalMoveEmpenho.nota
    if (!nota) return
    if (!selectedEntidadeId) {
      toast.error('Selecione o cliente de destino.')
      return
    }
    
    setLoadingMove(true)
    try {
      const targetEntidade = entidadesList.find(e => String(e.id) === selectedEntidadeId)
      const targetNome = targetEntidade?.nome || 'Desconhecido'
      const anteriorNome = nota.entidades?.nome || nota.emissor || 'Desconhecido'

      const { error } = await supabase
        .from('notas')
        .update({ 
          entidade_id: selectedEntidadeId as any,
          emissor: targetNome
        })
        .eq('id', nota.id)
        
      if (error) throw error
      
      await logAction('MOVER_EMPENHO', 'notas', nota.id, {
        numero_ne: nota.numero_ne,
        cliente_anterior: anteriorNome,
        cliente_destino: targetNome,
        entidade_anterior_id: nota.entidade_id,
        entidade_destino_id: selectedEntidadeId
      })

      toast.success(`Empenho #${nota.numero_ne} movido com sucesso para o cliente: ${targetNome}!`)
      setModalMoveEmpenho({ open: false, nota: null })
      fetchNotas()
    } catch (err: any) {
      toast.error('Erro ao mover empenho: ' + err.message)
    } finally {
      setLoadingMove(false)
    }
  }

  const handleSavePedido = async () => {
    if (!selectedNotaForPedido) return
    setSavingPedido(true)
    try {
      const { error } = await supabase
        .from('notas')
        .update({
          numero_pedido: tempNumeroPedido.trim() || null
        })
        .eq('id', selectedNotaForPedido.id)

      if (error) throw error

      await logAction('REGISTRAR_NUMERO_PEDIDO', 'notas', selectedNotaForPedido.id, {
        numero_ne: selectedNotaForPedido.numero_ne,
        numero_pedido: tempNumeroPedido.trim() || null
      })

      toast.success(
        tempNumeroPedido.trim() 
          ? `Número do pedido cadastrado com sucesso!` 
          : `Número do pedido removido com sucesso!`
      )
      setPedidoModalOpen(false)
      fetchNotas(false)
    } catch (err: any) {
      toast.error('Erro ao salvar número do pedido: ' + err.message)
    } finally {
      setSavingPedido(false)
    }
  }

  const handleReceiveAll = async () => {
    if (!currentUserProfile?.id) return
    const confirm = window.confirm(`Deseja realmente receber todos os ${pendingReceiptCount} empenhos destinados a você?`)
    if (!confirm) return
    
    setLoading(true)
    try {
      const { error } = await supabase
        .from('notas')
        .update({ 
            status_carga: 'RECEBIDO',
            confirmed_at: new Date().toISOString()
        })
        .eq('assigned_to', currentUserProfile.id)
        .eq('status_carga', 'DISTRIBUIDO')

      if (error) throw error

      toast.success(`${pendingReceiptCount} empenho(s) recebido(s) com sucesso!`)
      fetchNotas(false)
    } catch (err: any) {
      toast.error('Erro ao receber todos os empenhos: ' + err.message)
    }
  }

  const handleTryDeleteNota = async (nota: Nota) => {
    const toastId = toast.loading('Verificando solicitações associadas...')
    try {
      const { data: itensNota, error: errItens } = await supabase
        .from('itens')
        .select('id')
        .eq('nota_id', nota.id)
        
      if (errItens) throw new Error(`Erro ao consultar itens do empenho: ${errItens.message}`)
      
      const itemIds = itensNota?.map(i => i.id) || []
      
      if (itemIds.length > 0) {
        const { data: pedidosAtivos, error: errPedidos } = await supabase
          .from('pedidos_compra')
          .select('id')
          .neq('status', 'EXCLUIDO')
          .in('item_id', itemIds)
        
        if (errPedidos) throw new Error(`Erro ao consultar solicitações vinculadas: ${errPedidos.message}`)
        
        if (pedidosAtivos && pedidosAtivos.length > 0) {
          toast.dismiss(toastId)
          toast.error('Não é possível excluir este empenho porque existem solicitações de compra ativas vinculadas a ele. Por favor, exclua as solicitações associadas no módulo de compras primeiro.', {
            duration: 7000
          })
          return
        }
      }
      
      toast.dismiss(toastId)
      setDeleteConfirmNota(nota)
    } catch (err: any) {
      toast.dismiss(toastId)
      toast.error('Erro ao verificar solicitações: ' + err.message)
    }
  }

  const handleDelete = async (justificativa: string) => {
    if (!deleteConfirmNota) return
    const notaId = deleteConfirmNota.id
    const numero_ne = deleteConfirmNota.numero_ne
    
    try {
      // 1. Deletar arquivo físico
      if (deleteConfirmNota.arquivo_caminho) {
        try {
          await deleteDocument(deleteConfirmNota.arquivo_caminho)
        } catch (err) {
          console.warn('Falha ao deletar arquivo físico, prosseguindo:', err)
        }
      }

      // 2. Localizar itens para limpar dependências e atualizar solicitações vinculadas
      const { data: itensParaExcluir, error: errFetchItens } = await supabase
        .from('itens')
        .select('id, descricao')
        .eq('nota_id', notaId)
      
      if (errFetchItens) throw new Error(`Erro ao localizar itens: ${errFetchItens.message}`)

      if (itensParaExcluir && itensParaExcluir.length > 0) {
        const ids = itensParaExcluir.map(i => i.id)
        
        // A. Limpar Histórico de Entregas
        await supabase.from('historico_entregas').delete().in('item_id', ids)
        
        // B. Atualizar Pedidos de Compra (Módulo de Compras) em vez de deletar fisicamente
        const { data: userAuth } = await supabase.auth.getUser()
        const userEmail = userAuth?.user?.email || 'Usuário Financeiro'

        const itemDescMap = (itensParaExcluir || []).reduce((acc: Record<number, string>, item: any) => {
          acc[item.id] = item.descricao || ''
          return acc
        }, {})

        // Buscar solicitações de compra associadas aos itens desta nota
        const { data: pedidosVinculados, error: errFetchPedidos } = await supabase
          .from('pedidos_compra')
          .select('id, item_id, nota_id')
          .in('item_id', ids)

        if (errFetchPedidos) {
          console.error('Erro ao buscar solicitações para registrar exclusão de empenho:', errFetchPedidos)
        }

        if (pedidosVinculados && pedidosVinculados.length > 0) {
          for (const p of pedidosVinculados) {
            const itemDesc = p.item_id ? (itemDescMap[p.item_id] || '') : ''
            const { error: errUpdatePedido } = await supabase
              .from('pedidos_compra')
              .update({
                empenho_excluido_por: userEmail,
                empenho_excluido_motivo: justificativa,
                empenho_excluido_em: new Date().toISOString(),
                empenho_numero_legado: numero_ne,
                item_descricao_legado: itemDesc,
                nota_id: null,
                item_id: null
              })
              .eq('id', p.id)

            if (errUpdatePedido) {
              console.error(`Erro ao atualizar auditoria do empenho na solicitação #${p.id}:`, errUpdatePedido)
            }
          }
        }
      }

      // 3. Excluir os itens da nota
      const { error: errItens } = await supabase.from('itens').delete().eq('nota_id', notaId)
      if (errItens) {
          throw new Error(`Não foi possível remover os itens (SQL: ${errItens.code}). Verifique se há faturas ou notas de entrada vinculadas.`)
      }

      // 4. Excluir a nota definitivamente e VERIFICAR se foi removida
      const { data: deletedRows, error: errNota } = await supabase
        .from('notas')
        .delete()
        .eq('id', notaId)
        .select()

      if (errNota) throw errNota
      
      if (!deletedRows || deletedRows.length === 0) {
        throw new Error("A nota não pôde ser excluída do banco de dados (possível restrição de segurança ou RLS).")
      }

      toast.success(`Nota ${numero_ne} removida permanentemente.`)
      
      // Atualização Local
      setNotas(prev => prev.filter(n => n.id !== notaId))
      setTotalCount(prev => prev - 1)
      
      // LOG DA AÇÃO
      await logAction('EXCLUIR_EMPENHO', 'notas', notaId, { 
        numero_ne, 
        emissor: deleteConfirmNota?.emissor,
        valor: deleteConfirmNota?.valor_total_teto,
        justificativa
      })

      setDeleteConfirmNota(null)
      fetchNotas()
    } catch (err) {
      console.error('FALHA NA EXCLUSÃO:', err)
      const message = err instanceof Error ? err.message : String(err)
      toast.error('Erro ao excluir: ' + message, { duration: 6000 })
    } finally {
      // Deletado setDeleting(false)
    }
  }



  // Agrupamento de Notas por Entidade para exibição estável
  const groupedNotas = useMemo(() => {
    return notas.reduce((acc, nota) => {
      const entidade = nota.entidades
      const currentName = (entidade?.nome || nota.emissor || 'DESCONHECIDO').trim()
      
      if (!acc[currentName]) {
        acc[currentName] = {
          name: currentName,
          entidade: entidade,
          items: []
        }
      }
      acc[currentName].items.push(nota)
      return acc
    }, {} as Record<string, { name: string, entidade: any, items: NotaWithEntidade[] }>)
  }, [notas])

  const isNotaCompleteByNF = (nota: any) => {
    if (nota.status_geral === 'CANCELADO') return true

    const itens = (nota as any).itens || []
    const hasProvisoria = itens.some((item: any) =>
      (item.historico_entregas || []).some((h: any) => {
        const numStr = String(h.numero_nf || '').toUpperCase()
        return numStr.includes('PEDIDO') || numStr.includes('DAV') || numStr.includes('PROVISÓRIA') || numStr.includes('PROVISORIA')
      })
    )

    if (hasProvisoria) return false

    if (itens.length > 0) {
      const { percentNF } = calculateAggregateProgress(itens, nota)
      if (percentNF >= 100) return true
    }

    return nota.status_geral === 'CONCLUIDO' || nota.status_geral === 'FATOR_CAIXA' || nota.status_geral === 'CONCLUIDO_MANUAL'
  }

  const groups = useMemo(() => {
    const rawGroups = Object.values(groupedNotas)

    const isGroupComplete = (g: { items: NotaWithEntidade[] }) =>
      g.items.length > 0 && g.items.every(n => isNotaCompleteByNF(n))

    return rawGroups.sort((a, b) => {
      const aComplete = isGroupComplete(a)
      const bComplete = isGroupComplete(b)

      if (aComplete && !bComplete) return 1
      if (!aComplete && bComplete) return -1

      if (clientSortOrder === 'COUNT_DESC') {
        return b.items.length - a.items.length
      }
      if (clientSortOrder === 'COUNT_ASC') {
        return a.items.length - b.items.length
      }
      if (clientSortOrder === 'VALUE_DESC') {
        const valA = a.items.reduce((sum, n) => sum + (Number(n.valor_total_teto) || 0), 0)
        const valB = b.items.reduce((sum, n) => sum + (Number(n.valor_total_teto) || 0), 0)
        return valB - valA
      }
      if (clientSortOrder === 'VALUE_ASC') {
        const valA = a.items.reduce((sum, n) => sum + (Number(n.valor_total_teto) || 0), 0)
        const valB = b.items.reduce((sum, n) => sum + (Number(n.valor_total_teto) || 0), 0)
        return valA - valB
      }
      if (clientSortOrder === 'ALPHA_DESC') {
        return b.name.localeCompare(a.name)
      }
      return a.name.localeCompare(b.name)
    })
  }, [groupedNotas, clientSortOrder])

  useEffect(() => {
    if (!loading && !fetchingMore) {
      setStableGroups(groups)
    }
  }, [groups, loading, fetchingMore])

  const totalClientPages = useMemo(() => Math.max(1, Math.ceil(stableGroups.length / CLIENTS_PER_PAGE)), [stableGroups.length])

  const paginatedGroups = useMemo(() => {
    return stableGroups.slice((clientPage - 1) * CLIENTS_PER_PAGE, clientPage * CLIENTS_PER_PAGE)
  }, [stableGroups, clientPage])

  const computeMetricsFromData = (allNotas: any[]) => {
    const uniqueClients = new Set<string>()
    const totalEmpenhos = allNotas.length
    let empenhosConcluidosNFCount = 0
    let valorTotal = 0
    let valorAtendidoNF = 0

    allNotas.forEach(n => {
      const name = (n.entidades?.nome || n.emissor || 'DESCONHECIDO').trim()
      uniqueClients.add(name)

      const teto = Number(n.valor_total_teto) || 0
      const itens = (n as any).itens || []

      let itemCalculatedValor = 0
      let itemDeliveredNFValor = 0

      itens.forEach((item: any) => {
        const itemQtd = Number(item.quantidade) || 0
        const itemPreco = Number(item.valor_unitario) || 0
        itemCalculatedValor += itemQtd * itemPreco

        const entregas = (item.historico_entregas as any[]) || []
        const entregueOfficialNFQty = entregas
          .filter((h: any) => {
            const numStr = String(h.numero_nf || '').toUpperCase()
            return !numStr.includes('PEDIDO') && !numStr.includes('DAV') && !numStr.includes('PROVISÓRIA') && !numStr.includes('PROVISORIA')
          })
          .reduce((acc: number, h: any) => acc + (Number(h.quantidade_entregue) || 0), 0)

        const qtyConsidered = Math.min(entregueOfficialNFQty, itemQtd)
        itemDeliveredNFValor += qtyConsidered * itemPreco
      })

      const finalNotaValorTotal = teto > 0 ? teto : itemCalculatedValor
      valorTotal += finalNotaValorTotal

      if (itemCalculatedValor > 0) {
        const ratio = Math.min(1, itemDeliveredNFValor / itemCalculatedValor)
        valorAtendidoNF += finalNotaValorTotal * ratio
      } else {
        valorAtendidoNF += Math.min(finalNotaValorTotal, itemDeliveredNFValor)
      }

      const isNotaDone = isNotaCompleteByNF(n)
      if (isNotaDone) {
        empenhosConcluidosNFCount++
      }
    })

    const totalClientes = uniqueClients.size
    const empenhosPendentes = Math.max(0, totalEmpenhos - empenhosConcluidosNFCount)
    const valorPendente = Math.max(0, valorTotal - valorAtendidoNF)

    return {
      totalClientes,
      totalEmpenhos,
      empenhosPendentes,
      valorTotal,
      valorAtendidoNF,
      valorPendente
    }
  }

  const handleExportExcel = () => {
    const data = notas.map(n => ({
      'NE': n.numero_ne,
      'Órgão/Cliente': n.entidades?.nome || n.emissor,
      'Estado': n.entidades?.estado || '—',
      'Registrado em': n.created_at ? new Date(n.created_at).toLocaleDateString('pt-BR') : '—',
      'Status': n.status_geral,
      'Valor Teto': n.valor_total_teto
    }))
    exportToExcel(data, 'Lista_Empenhos')
    toast.success('Excel gerado com sucesso!')
  }

  const handleExportPDF = () => {
    const columns = ['NE', 'Cliente', 'Estado', 'Status', 'Valor Teto']
    const rows = notas.map(n => [
      n.numero_ne,
      n.entidades?.nome || n.emissor,
      n.entidades?.estado || '—',
      n.status_geral?.toUpperCase(),
      formatCurrency(n.valor_total_teto)
    ])
    exportToPDF('Relatório Geral de Empenhos', columns, rows, 'Lista_Empenhos')
    toast.success('PDF gerado com sucesso!')
  }

  return (
    <div className="space-y-6">
      <Tabs>
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-zinc-200 dark:border-zinc-800 pb-4">
          <div>
            <h1 className="text-2xl font-bold text-zinc-900 dark:text-white">Gerenciamento de Empenhos</h1>
            <p className="text-sm text-zinc-500 dark:text-zinc-400 mt-0.5">
              Administre seus documentos, acompanhe prazos e gere relatórios profissionais.
            </p>
          </div>
          <TabsList className="bg-zinc-100/80 dark:bg-zinc-900/50 p-1 rounded-xl border border-zinc-200 dark:border-zinc-800">
             <TabsTrigger 
                active={tab === 'lista'} 
                onClick={() => setTab('lista')}
                className="gap-2"
             >
               <List className="w-4 h-4" />
               Registros
             </TabsTrigger>
             <TabsTrigger 
                active={tab === 'relatorios'} 
                onClick={() => setTab('relatorios')}
                className="gap-2"
             >
               <LayoutDashboard className="w-4 h-4" />
               Relatórios & Dashboards
             </TabsTrigger>
          </TabsList>
        </div>

        <TabsContent visible={tab === 'lista'} className="space-y-4">
          {/* Dashboard Resumo do Cabeçalho */}
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3 mb-2">
            <div 
              className="p-3 bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-xl shadow-sm flex flex-col justify-between cursor-help transition-all hover:shadow-md"
              title="Quantidade de órgãos/clientes únicos exibidos no filtro atual"
            >
              <div className="flex items-center justify-between">
                <span className="text-[10px] font-black uppercase text-zinc-500 tracking-wider">Clientes</span>
                <Building2 className="w-4 h-4 text-indigo-500" />
              </div>
              <div className="mt-2 text-xl font-black text-zinc-900 dark:text-white tracking-tight">
                {dashboardMetrics.totalClientes}
              </div>
            </div>

            <div 
              className="p-3 bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-xl shadow-sm flex flex-col justify-between cursor-help transition-all hover:shadow-md"
              title="Quantidade total de Notas de Empenho listadas nos filtros selecionados"
            >
              <div className="flex items-center justify-between">
                <span className="text-[10px] font-black uppercase text-zinc-500 tracking-wider">Total Empenhos</span>
                <FileText className="w-4 h-4 text-blue-500" />
              </div>
              <div className="mt-2 text-xl font-black text-zinc-900 dark:text-white tracking-tight">
                {dashboardMetrics.totalEmpenhos}
              </div>
            </div>

            <div 
              className="p-3 bg-amber-50/50 dark:bg-amber-950/20 border border-amber-200/60 dark:border-amber-900/50 rounded-xl shadow-sm flex flex-col justify-between cursor-help transition-all hover:shadow-md"
              title="Quantidade de Notas de Empenho que possuem itens pendentes a serem baixados por Nota Fiscal"
            >
              <div className="flex items-center justify-between">
                <span className="text-[10px] font-black uppercase text-amber-700 dark:text-amber-400 tracking-wider">NEs Pendentes</span>
                <Timer className="w-4 h-4 text-amber-600" />
              </div>
              <div className="mt-2 text-xl font-black text-amber-900 dark:text-amber-300 tracking-tight">
                {dashboardMetrics.empenhosPendentes}
              </div>
            </div>

            <div 
              className="p-3 bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-xl shadow-sm flex flex-col justify-between cursor-help transition-all hover:shadow-md"
              title="Soma do valor financeiro teto total de todas as Notas de Empenho listadas"
            >
              <div className="flex items-center justify-between">
                <span className="text-[10px] font-black uppercase text-zinc-500 tracking-wider">Valor Total</span>
                <Wallet className="w-4 h-4 text-violet-500" />
              </div>
              <div className="mt-2 text-base font-black text-zinc-900 dark:text-white tracking-tight truncate">
                {formatCurrency(dashboardMetrics.valorTotal)}
              </div>
            </div>

            <div 
              className="p-3 bg-emerald-50/50 dark:bg-emerald-950/20 border border-emerald-200/60 dark:border-emerald-900/50 rounded-xl shadow-sm flex flex-col justify-between cursor-help transition-all hover:shadow-md"
              title="Soma do valor financeiro dos itens que já foram entregues e oficializados por Nota Fiscal"
            >
              <div className="flex items-center justify-between">
                <span className="text-[10px] font-black uppercase text-emerald-700 dark:text-emerald-400 tracking-wider">Valor Atendido</span>
                <CheckCircle2 className="w-4 h-4 text-emerald-600" />
              </div>
              <div className="mt-2 text-base font-black text-emerald-800 dark:text-emerald-300 tracking-tight truncate">
                {formatCurrency(dashboardMetrics.valorAtendidoNF)}
              </div>
            </div>

            <div 
              className="p-3 bg-rose-50/50 dark:bg-rose-950/20 border border-rose-200/60 dark:border-rose-900/50 rounded-xl shadow-sm flex flex-col justify-between cursor-help transition-all hover:shadow-md"
              title="Soma do valor financeiro restante dos itens que ainda faltam ser baixados por Nota Fiscal (Valor Total - Valor Atendido)"
            >
              <div className="flex items-center justify-between">
                <span className="text-[10px] font-black uppercase text-rose-700 dark:text-rose-400 tracking-wider">Valor Pendente</span>
                <Clock className="w-4 h-4 text-rose-600" />
              </div>
              <div className="mt-2 text-base font-black text-rose-800 dark:text-rose-300 tracking-tight truncate">
                {formatCurrency(dashboardMetrics.valorPendente)}
              </div>
            </div>
          </div>

          {/* Header Ações da Lista */}
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <div className="text-sm font-medium text-zinc-500">
              {loading ? 'Carregando empenhos...' : `${totalCount} nota(s) encontrada(s)`}
            </div>
            <div className="flex items-center gap-2">
              <Button
                variant="outline"
                size="sm"
                onClick={() => fetchNotas(false)}
                disabled={loading}
                className="gap-1.5 h-9"
              >
                <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
                Atualizar
              </Button>
              {pendingReceiptCount > 0 && (
                <Button
                  size="sm"
                  onClick={handleReceiveAll}
                  disabled={loading}
                  className="bg-emerald-600 hover:bg-emerald-700 text-white gap-1.5 h-9 font-bold transition-all shadow-lg shadow-emerald-600/20"
                >
                  <CheckCircle2 className="w-4 h-4 animate-pulse" />
                  Receber todos ({pendingReceiptCount})
                </Button>
              )}
              {canCreate && (
                <Button
                  size="sm"
                  onClick={() => navigate('/cadastrar-empenho')}
                  className="bg-brand-accent hover:opacity-90 text-white gap-1.5 shadow-lg shadow-brand-accent/20 h-9"
                >
                  <Plus className="w-4 h-4" />
                  Nova Nota
                </Button>
              )}

              {currentUserProfile?.nivel === 'DEV' && (
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setUnifyModalOpen(true)}
                  className="h-9 border-red-200 text-red-600 hover:bg-red-50 hover:text-red-700 bg-red-50/10 font-bold gap-2"
                >
                  <GitMerge className="w-4 h-4" /> Unificar
                </Button>
              )}

              <div className="flex items-center gap-1 border-l border-zinc-200 dark:border-zinc-800 pl-2 ml-1">
                 <Button variant="ghost" size="icon" onClick={handleExportExcel} title="Exportar Excel" className="hover:bg-emerald-50 dark:hover:bg-emerald-950/20">
                    <FileSpreadsheet className="w-4 h-4 text-emerald-600" />
                 </Button>
                 <Button variant="ghost" size="icon" onClick={handleExportPDF} title="Exportar PDF" className="hover:bg-red-50 dark:hover:bg-red-950/20">
                    <FileDown className="w-4 h-4 text-red-600" />
                 </Button>
              </div>

              <div className="flex items-center gap-1 border-l border-zinc-200 dark:border-zinc-800 pl-2 ml-1">
                 <Button 
                   variant="outline" 
                   size="sm" 
                   onClick={expandAll} 
                   title="Expandir todos os clientes" 
                   className="h-9 px-3 gap-1.5 text-[10px] font-bold uppercase tracking-tight"
                 >
                    <ChevronDown className="w-3.5 h-3.5" /> Expandir Tudo
                 </Button>
                 <Button 
                   variant="outline" 
                   size="sm" 
                   onClick={collapseAll} 
                   title="Colapsar todos os clientes" 
                   className="h-9 px-3 gap-1.5 text-[10px] font-bold uppercase tracking-tight"
                 >
                    <ChevronDown className="w-3.5 h-3.5 rotate-180" /> Colapsar Tudo
                 </Button>
              </div>
            </div>
          </div>

      {/* Search */}
      <div className="grid grid-cols-1 md:grid-cols-6 gap-3">
        <div className="md:col-span-2 relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-zinc-400" />
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Buscar por NE, emissor, pregão..."
            className="w-full pl-9 pr-4 py-2 text-sm border border-zinc-200 dark:border-zinc-700 rounded-lg bg-white dark:bg-zinc-900 focus:outline-none focus:ring-2 focus:ring-brand-accent/40 placeholder:text-zinc-400"
          />
        </div>
        <div className="md:col-span-2 relative">
          <Package className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-zinc-400" />
          <input
            type="text"
            value={itemSearch}
            onChange={(e) => setItemSearch(e.target.value)}
            placeholder="Buscar por nome do item..."
            className="w-full pl-9 pr-4 py-2 text-sm border border-zinc-200 dark:border-zinc-700 rounded-lg bg-white dark:bg-zinc-900 focus:outline-none focus:ring-2 focus:ring-emerald-500/40 placeholder:text-zinc-400"
          />
        </div>
        <div className="md:col-span-1 relative">
          <Select value={statusFilter} onValueChange={(v: any) => setStatusFilter(v)}>
            <SelectTrigger className="w-full h-full min-h-[38px] text-sm border border-zinc-200 dark:border-zinc-700 rounded-lg bg-white dark:bg-zinc-900">
              <SelectValue placeholder="Status" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="TODOS">Todos Status</SelectItem>
              <SelectItem value="PENDENTES">Pendentes</SelectItem>
              <SelectItem value="CONCLUIDOS">Concluídos</SelectItem>
            </SelectContent>
          </Select>
        </div>

        <div className="md:col-span-1 relative">
          <Select value={clientSortOrder} onValueChange={(v: any) => setClientSortOrder(v)}>
            <SelectTrigger className="w-full h-full min-h-[38px] text-xs border border-zinc-200 dark:border-zinc-700 rounded-lg bg-white dark:bg-zinc-900 font-medium">
              <div className="flex items-center gap-1.5 truncate">
                <ArrowUpDown className="w-3.5 h-3.5 text-zinc-400 shrink-0" />
                <SelectValue placeholder="Ordem Clientes" />
              </div>
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="COUNT_DESC">Mais Empenhos → Menos</SelectItem>
              <SelectItem value="COUNT_ASC">Menos Empenhos → Mais</SelectItem>
              <SelectItem value="VALUE_DESC">Maior Valor Total → Menor</SelectItem>
              <SelectItem value="VALUE_ASC">Menor Valor Total → Maior</SelectItem>
              <SelectItem value="ALPHA_ASC">Nome (A - Z)</SelectItem>
              <SelectItem value="ALPHA_DESC">Nome (Z - A)</SelectItem>
            </SelectContent>
          </Select>
        </div>

        {(isAdmin || isSuperAdmin) && (
          <div className="md:col-span-1 relative">
            <Select value={selectedCollaborator} onValueChange={setSelectedCollaborator}>
              <SelectTrigger className="w-full h-full min-h-[38px] text-sm border border-zinc-200 dark:border-zinc-700 rounded-lg bg-white dark:bg-zinc-900">
                <div className="flex items-center gap-2 truncate">
                  <Users className="w-3.5 h-3.5 text-zinc-400" />
                  <SelectValue placeholder="Responsável" />
                </div>
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="TODOS">Todos Responsáveis</SelectItem>
                {colaboradores.map(c => (
                  <SelectItem key={c.id} value={c.id}>
                    {c.display_name || c.email.split('@')[0]}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        )}

        <div className="md:col-span-1 flex gap-2">
           <Button 
            variant={myLoadOnly ? "default" : "outline"}
            size="sm"
            onClick={() => setMyLoadOnly(!myLoadOnly)}
            className={`flex-1 h-full min-h-[38px] font-bold text-[10px] uppercase gap-2 transition-all ${myLoadOnly ? 'bg-indigo-600 hover:bg-indigo-700 shadow-md shadow-indigo-500/20' : ''}`}
           >
             <UserPlus className="w-4 h-4" />
             Minha Carga
           </Button>
        </div>

        {/* Filtros de Data */}
        <div className="md:col-span-6 flex flex-wrap items-center gap-3 p-3 bg-zinc-50 dark:bg-zinc-900/40 rounded-xl border border-zinc-200 dark:border-zinc-800">
           <div className="flex items-center gap-2">
             <Timer className="w-4 h-4 text-zinc-400" />
             <span className="text-[10px] font-black uppercase text-zinc-500 tracking-wider">Período de Emissão:</span>
           </div>
           <div className="flex items-center gap-2">
             <Input 
              type="date" 
              value={startDate} 
              onChange={e => setStartDate(e.target.value)}
              className="h-8 text-xs w-[140px] bg-white"
             />
             <span className="text-zinc-300">a</span>
             <Input 
              type="date" 
              value={endDate} 
              onChange={e => setEndDate(e.target.value)}
              className="h-8 text-xs w-[140px] bg-white"
             />
             {(startDate || endDate) && (
               <Button 
                variant="ghost" 
                size="sm" 
                onClick={() => { setStartDate(''); setEndDate(''); }}
                className="h-8 text-[10px] text-red-500 font-bold hover:bg-red-50"
               >
                 Limpar Datas
               </Button>
             )}
           </div>
        </div>
      </div>

      <div className="border border-zinc-200 dark:border-zinc-800 rounded-xl overflow-hidden shadow-sm">
        {loading ? (
          <div className="flex items-center justify-center gap-2 py-16 text-zinc-500">
            <Loader2 className="w-5 h-5 animate-spin" />
            Carregando...
          </div>
        ) : notas.length === 0 ? (
          <div className="flex flex-col items-center justify-center gap-3 py-16 text-zinc-400">
            <FileText className="w-10 h-10 opacity-40" />
            <p className="text-sm font-medium">Nenhuma nota encontrada</p>
          </div>
        ) : (
          <>
            <div className="overflow-x-auto w-full border border-zinc-200 dark:border-zinc-800 rounded-xl shadow-md bg-white dark:bg-zinc-950">
              <Table>
                <TableBody>
                  {paginatedGroups.map((group: any) => {
                    const isComplete = group.items.length > 0 && group.items.every((n: any) => isNotaCompleteByNF(n))

                    return (
                    <Fragment key={`group-wrapper-${group.name}`}>
                        {/* Cabeçalho do Grupo (Entidade) */}
                        <TableRow 
                          key={`group-header-${group.name}`} 
                          className={isComplete 
                            ? "bg-emerald-100/70 dark:bg-emerald-950/60 hover:bg-emerald-200/60 dark:hover:bg-emerald-900/60 cursor-pointer transition-colors border-b-2 border-emerald-200 dark:border-emerald-800" 
                            : "bg-zinc-100 dark:bg-zinc-800/80 hover:bg-zinc-200/50 dark:hover:bg-zinc-700/50 cursor-pointer transition-colors border-b-2 border-zinc-200 dark:border-zinc-700"
                          }
                          onClick={() => toggleGroup(group.name)}
                        >
                          <TableCell colSpan={7} className="py-3 px-4">
                            <div className="flex items-center justify-between">
                              <div className="flex items-center gap-3">
                                <div className="flex items-center gap-1.5 bg-zinc-950 text-white dark:bg-zinc-50 dark:text-zinc-950 px-2.5 py-1 rounded text-[10px] font-black tracking-widest shadow-sm">
                                    <Building2 className="w-3.5 h-3.5" />
                                    ENTIDADE
                                </div>
                                <span className="font-black text-zinc-900 dark:text-zinc-100 text-base uppercase tracking-tight">
                                  {group.name}
                                </span>
                                {group.entidade?.estado && (
                                  <Badge variant="outline" className="text-[10px] font-black border-zinc-400 dark:border-zinc-600 bg-white dark:bg-zinc-900 px-2">
                                    <MapPin className="w-3 h-3 mr-1 text-red-500" />
                                    {group.entidade.estado}
                                  </Badge>
                                )}
                                {isComplete && (
                                  <Badge className="bg-emerald-600 hover:bg-emerald-700 text-white text-[9px] font-black uppercase px-2 py-0.5 shadow-sm gap-1">
                                    <CheckCircle2 className="w-3 h-3" /> ENTREGAS CONCLUÍDAS
                                  </Badge>
                                )}

                                {/* Tags de Responsáveis Únicos do Grupo */}
                                <div className="flex flex-wrap gap-1 ml-2">
                                  {Array.from(new Set(group.items.map((n: any) => n.assigned?.display_name || n.assigned?.email.split('@')[0]).filter(Boolean))).map(name => (
                                    <Badge key={String(name)} variant="secondary" className="bg-indigo-50 text-indigo-700 border-indigo-200 text-[9px] font-bold px-1.5 py-0">
                                      {String(name)}
                                    </Badge>
                                  ))}
                                </div>
                                
                                {isAdmin && (
                                  <div className="flex items-center gap-1">
                                    <Button
                                      variant="ghost"
                                      size="icon"
                                      className="h-6 w-6 text-zinc-400 hover:text-brand-accent hover:bg-brand-accent/10 dark:hover:bg-brand-accent/20 rounded-full"
                                      onClick={(e) => handleOpenEditEntity(e, group.entidade)}
                                      title="Editar Cadastro do Cliente"
                                    >
                                      <Pencil className="w-3 h-3" />
                                    </Button>
                                    <Button
                                      variant="ghost"
                                      size="icon"
                                      className="h-6 w-6 text-zinc-400 hover:text-indigo-500 hover:bg-indigo-50 dark:hover:bg-indigo-950/20 rounded-full"
                                      onClick={(e) => handleOpenDistributeEntidade(e, group)}
                                      title="Distribuir Cliente Inteiro"
                                    >
                                      <UserPlus className="w-3.5 h-3.5" />
                                    </Button>
                                  </div>
                                )}
                              </div>
                              <div className="flex items-center gap-2 border-l-2 pl-4 ml-2 border-zinc-300 dark:border-zinc-700">
                                <Button 
                                  variant="ghost" 
                                  size="sm" 
                                  onClick={(e) => { e.stopPropagation(); setModalNFsConfig({ open: true, searchTerm: group.name, title: `Notas Fiscais - ${group.name}` }) }}
                                  className="h-8 text-[10px] uppercase font-black text-emerald-700 hover:text-emerald-800 bg-emerald-100 hover:bg-emerald-200 border border-emerald-300 dark:border-emerald-800 transition-all shadow-sm"
                                >
                                  <FileText className="w-3.5 h-3.5 mr-1.5" /> VER NFS
                                </Button>
                                <span className="text-[10px] text-zinc-500 font-bold uppercase mr-1 tracking-wider">
                                  {isGroupCollapsed(group.name) ? 'Expandir' : 'Recolher'}
                                </span>
                                <ChevronDown className={`w-5 h-5 text-zinc-400 transition-transform duration-300 ${isGroupCollapsed(group.name) ? '-rotate-90' : ''}`} />
                              </div>
                            </div>
                          </TableCell>
                        </TableRow>

                        {/* Cabeçalhos Contextuais e Itens */}
                        {!isGroupCollapsed(group.name) && (
                          <Fragment>
                             <TableRow className="bg-zinc-50/50 dark:bg-zinc-900/50 border-b border-zinc-100 dark:border-zinc-800 select-none">
                              <TableHead className="w-10"></TableHead>
                              <TableHead className="text-[10px] font-black text-zinc-400 uppercase tracking-widest py-2">Nº da NE</TableHead>
                              <TableHead className="text-[10px] font-black text-zinc-400 uppercase tracking-widest py-2">Prazos (Macro/Micro)</TableHead>
                              <TableHead className="text-[10px] font-black text-zinc-400 uppercase tracking-widest py-2 text-right">Teto (R$)</TableHead>
                              <TableHead className="text-[10px] font-black text-zinc-400 uppercase tracking-widest py-2">Progresso</TableHead>
                              <TableHead className="text-[10px] font-black text-zinc-400 uppercase tracking-widest py-2">Status</TableHead>
                              <TableHead className="text-[10px] font-black text-zinc-400 uppercase tracking-widest py-2 text-right pr-4">Ações</TableHead>
                             </TableRow>
                             {group.items.map((nota: any) => {
                               const isExpanded = expandedId === nota.id
                               const macroDeadline = getDeadlineInfo((nota as any).data_validade)
                               const microDeadline = getDeadlineInfo(nota.data_prazo_compras)
                               const logisticaDeadline = getDeadlineInfo(nota.previsao_entrega)
                               
                               const registroDate = nota.created_at ? new Date(nota.created_at) : null
                               const diffRegistrationText = (() => {
                                 if (!registroDate || isNaN(registroDate.getTime())) return '—';
                                 const now = new Date();
                                 const diffMs = now.getTime() - registroDate.getTime();
                                 const diffSecs = Math.max(0, Math.floor(diffMs / 1000));
                                 const diffMins = Math.floor(diffSecs / 60);
                                 const diffHours = Math.floor(diffMins / 60);
                                 const diffDays = Math.floor(diffHours / 24);

                                 if (diffSecs < 60) return 'agora mesmo';
                                 if (diffMins < 60) return `há ${diffMins} ${diffMins === 1 ? 'minuto' : 'minutos'}`;
                                 if (diffHours < 24) return `há ${diffHours} ${diffHours === 1 ? 'hora' : 'horas'}`;
                                 if (diffDays === 1) return 'ontem';
                                 return `há ${diffDays} dias`;
                               })();

                               const { percent, percentFisico, percentNF, percentDiaD, isOverDelivery } = calculateAggregateProgress((nota as any).itens, nota)
                               const percentForLogistics = isNotaModoSesau(nota) ? percentFisico : percent
                               const isBaixaPorPedido = ((nota as any).itens || []).some((item: any) =>
                                 (item.historico_entregas || []).some((h: any) => {
                                    const numStr = String(h.numero_nf || '').toUpperCase()
                                    return numStr.includes('PEDIDO') || numStr.includes('DAV') || numStr.includes('PROVISÓRIA') || numStr.includes('PROVISORIA')
                                  })
                               )

                               const canEdit = canEditNota(currentUserProfile, isSuperAdmin, nota);
                               const canDelete = canDeleteNota(currentUserProfile, isSuperAdmin, nota);
                               const canDistributeRow = canDistributeNota(currentUserProfile, isSuperAdmin, nota);

                               const isCompleteNF = isNotaCompleteByNF(nota)
                               if (isCompleteNF && 
                                   nota.status_geral !== 'CONCLUIDO' && 
                                   nota.status_geral !== 'CANCELADO' && 
                                   nota.status_geral !== 'FATOR_CAIXA' &&
                                   nota.status_geral !== 'CONCLUIDO_MANUAL') {
                                 supabase.from('notas').update({ status_geral: 'CONCLUIDO' }).eq('id', nota.id).then()
                               }

                               const effectiveStatusKey = (() => {
                                 if (nota.status_geral === 'CANCELADO') return 'CANCELADO'
                                 if (nota.status_geral === 'FATOR_CAIXA') return 'FATOR_CAIXA'
                                 if (nota.status_geral === 'CONCLUIDO_MANUAL') return 'CONCLUIDO_MANUAL'
                                 if (isCompleteNF) return 'CONCLUIDO'
                                 if (percentNF > 0 || percent > 0 || ((nota as any).itens || []).some((i: any) => (i.historico_entregas || []).length > 0)) return 'EM_ANDAMENTO'
                                 return nota.status_geral || 'PENDENTE'
                               })()

                               const status = STATUS_BADGE[effectiveStatusKey] ?? { label: effectiveStatusKey ?? '—', color: 'bg-zinc-100 text-zinc-600' }

                               return (
                                 <Fragment key={`nota-wrapper-${nota.id}`}>
                                    <TableRow
                                      key={`nota-row-${nota.id}`}
                                      className={`cursor-pointer transition-all duration-200 border-l-2 ${
                                        isExpanded 
                                          ? 'bg-brand-accent/[0.04] dark:bg-brand-accent/[0.08] border-l-brand-accent border-b-transparent' 
                                          : 'bg-white dark:bg-zinc-900 border-l-transparent hover:bg-zinc-50/50 dark:hover:bg-zinc-800/30 border-b-zinc-100 dark:border-b-zinc-800'
                                      }`}
                                      onClick={() => setExpandedId(isExpanded ? null : nota.id)}
                                    >
                                      <TableCell>
                                        <button
                                          onClick={(e) => { e.stopPropagation(); setExpandedId(isExpanded ? null : nota.id); }}
                                          className="w-8 h-8 flex items-center justify-center rounded-full hover:bg-zinc-100 dark:hover:bg-zinc-800 transition-all duration-200 active:scale-90"
                                        >
                                          <ChevronDown className={`w-4 h-4 transition-transform duration-300 ${isExpanded ? 'rotate-180 text-brand-accent' : 'text-zinc-400'}`} />
                                        </button>
                                      </TableCell>
                                      <TableCell className="font-bold text-brand-accent">
                                        <div className="flex flex-col gap-1">
                                          <span>{nota.numero_ne}</span>
                                          {nota.ata_id && (
                                            <Badge variant="outline" className="w-fit bg-purple-50 text-purple-750 border-purple-200 text-[9px] font-black px-1.5 py-0 uppercase">
                                              ARP nº {(nota.ata as any)?.numero_arp || 'Vinculada'}
                                            </Badge>
                                          )}
                                          {nota.numero_pedido && (
                                            <Badge variant="outline" className="w-fit bg-blue-50 text-blue-750 border-blue-200 text-[9px] font-black px-1.5 py-0 uppercase">
                                              Pedido: {nota.numero_pedido}
                                            </Badge>
                                          )}
                                          {(nota as any).assigned && (
                                            <Badge variant="secondary" className="w-fit bg-indigo-100 text-indigo-700 border-indigo-200 text-[9px] font-black px-1.5 py-0 uppercase">
                                              Resp: {(nota as any).assigned.display_name || (nota as any).assigned.email.split('@')[0]}
                                            </Badge>
                                          )}
                                          {(nota as any).e_notificacao && (
                                            <Badge className="w-fit bg-red-500 hover:bg-red-600 text-white text-[9px] font-black px-1.5 py-0 uppercase tracking-wider animate-pulse">
                                              Notificação
                                            </Badge>
                                          )}
                                          {!(nota as any).e_notificacao && (nota as any).foi_notificado && (
                                            <Badge variant="outline" className="w-fit bg-zinc-50 text-zinc-650 border-zinc-250 text-[9px] font-bold px-1.5 py-0 uppercase tracking-normal">
                                              Histórico Notificação
                                            </Badge>
                                          )}
                                        </div>
                                      </TableCell>
                                      <TableCell>
                                         <div className="flex flex-col gap-1.5">
                                             <div className="text-[10px] text-zinc-400 font-medium">
                                               Cadastrado {diffRegistrationText}
                                                {(() => {
                                                   const profile = colaboradores.find(c => c.id === nota.owner_id);
                                                   return profile ? ` por ${profile.display_name || profile.email.split('@')[0]}` : '';
                                                })()}
                                             </div>
                                            <div className="flex flex-wrap gap-1">
                                              {macroDeadline && (
                                                <div className={`flex items-center gap-1.5 px-2 py-0.5 rounded-md text-[10px] font-bold w-fit ${macroDeadline.color}`}>
                                                  <Timer className="w-3 h-3" />
                                                  {macroDeadline.diffDays <= 0 ? 'NE VENCIDA' : `${macroDeadline.diffDays} dias NE`}
                                                </div>
                                              )}
                                              {logisticaDeadline && (
                                                <div className={`flex items-center gap-1.5 px-2 py-0.5 rounded-md text-[10px] font-bold w-fit border ${
                                                  percentForLogistics >= 100 
                                                    ? (isOverDelivery 
                                                        ? 'bg-orange-100 text-orange-700 dark:bg-orange-950/40 dark:text-orange-400 border-transparent' 
                                                        : isBaixaPorPedido 
                                                          ? 'bg-rose-100 text-rose-800 dark:bg-rose-950/60 dark:text-rose-300 border-rose-300 shadow-sm' 
                                                          : 'bg-emerald-100 text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-400 border-transparent')
                                                    : logisticaDeadline.color
                                                }`}>
                                                  <div className="flex items-center gap-1">
                                                    <PackageCheck className="w-3 h-3" />
                                                    {percentForLogistics >= 100 ? (isBaixaPorPedido ? 'ENTREGUE (PEDIDO)' : 'ENTREGUE') : (logisticaDeadline.diffDays <= 0 ? 'ENTREGA ATRASADA' : `${logisticaDeadline.diffDays} d p/ Entrega`)}
                                                  </div>
                                                </div>
                                              )}
                                              {microDeadline && (
                                                <div className={`flex items-center gap-1.5 px-2 py-0.5 rounded-md text-[10px] font-bold w-fit border ${microDeadline.color}`}>
                                                  <ShoppingCart className="w-3 h-3" />
                                                  {microDeadline.diffDays <= 0 ? 'COBRAR COMPRAS!' : `${microDeadline.diffDays} d p/ COMPRA`}
                                                </div>
                                              )}
                                            </div>
                                         </div>
                                      </TableCell>
                                      <TableCell className="text-right font-mono text-zinc-600 dark:text-zinc-400">
                                        {formatCurrency(nota.valor_total_teto)}
                                      </TableCell>
                                      <TableCell>
                                        <div className="flex flex-col gap-1.5">
                                          <div className="flex items-center gap-2">
                                            <div className="flex-1 bg-zinc-100 dark:bg-zinc-800 rounded-full h-1.5 overflow-hidden min-w-[60px] relative">
                                                {isBaixaPorPedido ? (
                                                  <div 
                                                    className="h-full rounded-full transition-all bg-gradient-to-r from-pink-500 via-rose-500 to-rose-400 shadow-sm" 
                                                    style={{ width: `${percent}%` }} 
                                                  />
                                                ) : isNotaModoSesau(nota) ? (
                                                  <>
                                                    <div 
                                                      className="absolute left-0 top-0 h-full bg-blue-500 rounded-full transition-all" 
                                                      style={{ width: `${percentNF}%` }} 
                                                    />
                                                    <div 
                                                      className="absolute left-0 top-0 h-full bg-emerald-500 rounded-full transition-all" 
                                                      style={{ width: `${percentFisico}%` }} 
                                                    />
                                                    <div 
                                                      className="absolute left-0 top-0 h-full bg-gradient-to-r from-amber-400 to-orange-500 rounded-full transition-all shadow-xs" 
                                                      style={{ width: `${percentDiaD}%` }} 
                                                    />
                                                  </>
                                                ) : (
                                                  <div 
                                                    className={`h-full rounded-full transition-all ${percent >= 100 ? 'bg-emerald-500' : percent > 0 ? 'bg-brand-accent' : 'bg-zinc-300'}`} 
                                                    style={{ width: `${percent}%` }} 
                                                  />
                                                )}
                                            </div>
                                            <span className="text-[10px] font-bold text-zinc-500 w-fit whitespace-nowrap text-right">
                                              {isNotaModoSesau(nota) && !isBaixaPorPedido ? `${percentFisico}% / ${percentNF}%` : `${percent}%`}
                                            </span>
                                          </div>
                                          {isOverDelivery && (
                                            <span className="text-[9px] font-black text-orange-600 dark:text-orange-400 bg-orange-50 dark:bg-orange-950/30 px-1.5 py-0.5 rounded w-fit animate-pulse border border-orange-200 dark:border-orange-900/50">
                                              SOBREBAIXA (EXCESSO)
                                            </span>
                                          )}
                                        </div>
                                      </TableCell>
                                      <TableCell>
                                        {isBaixaPorPedido ? (
                                          <div className="flex flex-col gap-1 w-fit">
                                            <span className="inline-flex items-center text-[10px] font-black px-2 py-0.5 rounded-full uppercase bg-rose-100 text-rose-800 dark:bg-rose-950/60 dark:text-rose-300 border border-rose-300 shadow-sm whitespace-nowrap">
                                              Baixa por Pedido (Provisória)
                                            </span>
                                            {isNotaModoSesau(nota) && (
                                              <span className="text-[8px] text-violet-500 font-black tracking-widest uppercase text-center">SESAU</span>
                                            )}
                                          </div>
                                        ) : isNotaModoSesau(nota) ? (() => {
                                          const sesauTag = calculateSesauCompleteness((nota as any).itens, percent);
                                          const sesauBadges = {
                                            'SIM': { label: 'SIM', color: 'bg-emerald-100 text-emerald-800 dark:bg-emerald-950/40 dark:text-emerald-400 border border-emerald-200 dark:border-emerald-800' },
                                            'SIM_CONCLUIDA': { label: 'SIM / CONCLUÍDA', color: 'bg-indigo-100 text-indigo-800 dark:bg-indigo-950/40 dark:text-indigo-400 border border-indigo-200 dark:border-indigo-800' },
                                            'NAO': { label: 'NÃO', color: 'bg-rose-100 text-rose-800 dark:bg-rose-950/40 dark:text-rose-400 border border-rose-200 dark:border-rose-800' },
                                            'NAO_CONCLUIDA': { label: 'NÃO / CONCLUÍDA', color: 'bg-amber-100 text-amber-800 dark:bg-amber-950/40 dark:text-amber-400 border border-amber-200 dark:border-amber-800' },
                                          };
                                          const badge = sesauBadges[sesauTag];
                                          return (
                                            <div className="flex flex-col gap-1 w-fit">
                                              <span className={`inline-flex items-center text-[10px] font-black px-2 py-0.5 rounded-full uppercase whitespace-nowrap ${badge.color}`}>
                                                {badge.label}
                                              </span>
                                              <span className="text-[8px] text-violet-500 font-black tracking-widest uppercase text-center">SESAU</span>
                                            </div>
                                          );
                                        })() : (
                                          <span className={`inline-flex items-center text-[10px] font-bold px-2 py-0.5 rounded-full uppercase ${status.color}`}>
                                            {status.label}
                                          </span>
                                        )}
                                      </TableCell>
                                      <TableCell onClick={(e) => e.stopPropagation()}>
                                        <div className="flex items-center justify-end gap-1">
                                           <Button 
                                             variant="ghost" 
                                             size="icon-sm" 
                                             onClick={(e) => { e.stopPropagation(); setModalNFsConfig({ open: true, searchTerm: nota.numero_ne || '', title: `NFs do Empenho #${nota.numero_ne}` }) }}
                                             title="Ver NFs deste Empenho"
                                             className="text-emerald-600 hover:text-emerald-700 hover:bg-emerald-50 mr-1"
                                           >
                                             <FileText className="w-4 h-4" />
                                           </Button>
                                           <Button 
                                             variant="ghost" 
                                             size="icon-sm" 
                                             onClick={(e) => { 
                                               e.stopPropagation(); 
                                               setSelectedNotaForPedido(nota);
                                               setTempNumeroPedido(nota.numero_pedido || '');
                                               setPedidoModalOpen(true);
                                             }}
                                             title={nota.numero_pedido ? `Alterar Número do Pedido (Atual: ${nota.numero_pedido})` : "Marcar Pedido Feito"}
                                             className={nota.numero_pedido 
                                               ? "text-blue-600 hover:text-blue-700 hover:bg-blue-50 bg-blue-50/50 mr-1" 
                                               : "text-zinc-400 hover:text-zinc-650 hover:bg-zinc-100 mr-1"
                                             }
                                           >
                                             <ShoppingCart className="w-3.5 h-3.5" />
                                           </Button>
                                           <Button 
                                             variant="ghost" 
                                             size="icon-sm" 
                                             onClick={(e) => { 
                                               e.stopPropagation(); 
                                               setSelectedNotaForVincularAta(nota);
                                               setIsModalVincularAtaOpen(true);
                                             }}
                                             title={nota.ata_id ? `Alterar Ata Vinculada (Atual: ARP #${(nota.ata as any)?.numero_arp || 'Vinculada'})` : "Vincular a uma Ata de Registro de Preços"}
                                             className={nota.ata_id 
                                               ? "text-purple-600 hover:text-purple-700 hover:bg-purple-50 bg-purple-50/50 mr-1" 
                                               : "text-zinc-400 hover:text-purple-600 hover:bg-purple-50 mr-1"
                                             }
                                           >
                                             <LinkIcon className="w-3.5 h-3.5" />
                                           </Button>
                                          <input
                                            type="file"
                                            id={`upload-ne-${nota.id}`}
                                            className="hidden"
                                            accept="application/pdf"
                                            onChange={(e) => handleUploadNeFile(nota.id, e.target.files)}
                                          />
                                          {nota.arquivo_caminho ? (
                                            <div className="flex items-center gap-0.5">
                                              <Button variant="ghost" size="icon-sm" asChild title="Ver PDF Original">
                                                <a href={getCleanPublicUrl(nota.arquivo_caminho)} target="_blank" rel="noopener noreferrer">
                                                  <FileText className="w-3.5 h-3.5 text-brand-accent" />
                                                </a>
                                              </Button>
                                              <Button
                                                variant="ghost"
                                                size="icon-sm"
                                                title="Substituir PDF da NE"
                                                className="text-zinc-400 hover:text-blue-500 hover:bg-blue-50 w-7 h-7 p-0 flex items-center justify-center"
                                                onClick={(e) => { e.stopPropagation(); document.getElementById(`upload-ne-${nota.id}`)?.click(); }}
                                              >
                                                <Upload className="w-3.5 h-3.5" />
                                              </Button>
                                            </div>
                                          ) : (
                                            <Button
                                              variant="ghost"
                                              size="icon-sm"
                                              title="Anexar PDF da NE (Arquivo Faltante!)"
                                              className="text-red-500 hover:text-red-650 hover:bg-red-50 bg-red-50/50 animate-pulse border border-red-200 rounded-md w-7 h-7 p-0 flex items-center justify-center shrink-0"
                                              onClick={(e) => { e.stopPropagation(); document.getElementById(`upload-ne-${nota.id}`)?.click(); }}
                                            >
                                              <Paperclip className="w-3.5 h-3.5" />
                                            </Button>
                                          )}
                                          <Button 
                                             variant="ghost" 
                                             size="icon-sm" 
                                             onClick={(e) => { e.stopPropagation(); setSelectedNotaForNotification(nota); setNotificationModalOpen(true); }}
                                             title={nota.e_notificacao ? "Ver/Gerenciar Notificação de Atraso" : "Registrar Notificação de Atraso"}
                                             className={nota.e_notificacao 
                                               ? "text-amber-500 hover:text-amber-600 hover:bg-amber-50 bg-amber-50/50" 
                                               : "text-zinc-400 hover:text-zinc-600 hover:bg-zinc-150"
                                             }
                                           >
                                             <AlertTriangle className="w-3.5 h-3.5" />
                                           </Button>
                                          {canDistributeRow && (
                                            <Button 
                                              variant="ghost" 
                                              size="icon-sm" 
                                              onClick={(e) => { e.stopPropagation(); handleOpenDistribute(nota); }}
                                              title="Distribuir / Atribuir Carga"
                                              className="text-brand-accent hover:bg-brand-accent/10 dark:hover:bg-brand-accent/20 rounded-md"
                                            >
                                              <UserPlus className="w-3.5 h-3.5" />
                                            </Button>
                                          )}
                                          {canEdit && (nota.status_geral !== 'CONCLUIDO' && nota.status_geral !== 'FATOR_CAIXA' && nota.status_geral !== 'CANCELADO') && (
                                              <Button 
                                                variant="ghost" 
                                                size="icon-sm" 
                                                onClick={(e) => { e.stopPropagation(); handleToggleManualCompletion(nota); }} 
                                                title={nota.status_geral === 'CONCLUIDO_MANUAL' ? "Reabrir Empenho (Concluído Manualmente)" : "Concluir/Finalizar Empenho Manualmente"}
                                                className={nota.status_geral === 'CONCLUIDO_MANUAL' 
                                                  ? "text-emerald-600 hover:text-emerald-700 hover:bg-emerald-50 bg-emerald-50/50 mr-1" 
                                                  : "text-zinc-400 hover:text-emerald-600 hover:bg-emerald-50 mr-1"
                                                }
                                              >
                                                <PackageCheck className="w-4 h-4" />
                                              </Button>
                                            )}
                                           {canEdit && (
                                              <Button variant="ghost" size="icon-sm" onClick={(e) => { e.stopPropagation(); handleEdit(nota); }}>
                                                <Pencil className="w-3.5 h-3.5" />
                                              </Button>
                                            )}
                                           {canDelete && (
                                              <Button variant="ghost" size="icon-sm" onClick={(e) => { e.stopPropagation(); handleTryDeleteNota(nota); }} className="text-red-500 hover:text-red-600 hover:bg-red-50">
                                                <Trash2 className="w-3.5 h-3.5" />
                                              </Button>
                                            )}

                                            {currentUserProfile?.nivel === 'DEV' && (
                                              <Button 
                                                variant="ghost" 
                                                size="icon-sm" 
                                                onClick={(e) => { e.stopPropagation(); handleOpenMoveEmpenho(nota); }}
                                                title="Mover Empenho de Cliente"
                                                className="text-violet-600 hover:text-violet-700 hover:bg-violet-50"
                                              >
                                                <GitMerge className="w-3.5 h-3.5" />
                                              </Button>
                                            )}

                                           {nota.assigned_to === currentUserProfile?.id && nota.status_carga === 'DISTRIBUIDO' && (
                                             <Button 
                                               size="sm" 
                                               className="ml-2 bg-emerald-600 hover:bg-emerald-700 text-white h-8 text-[10px] font-bold uppercase transition-all animate-pulse"
                                               onClick={(e) => { e.stopPropagation(); handleConfirmReceipt(nota.id); }}
                                             >
                                               <CheckCircle2 className="w-3 h-3 mr-1" /> Receber
                                             </Button>
                                           )}
                                        </div>
                                      </TableCell>
                                    </TableRow>

                                    {isExpanded && (
                                      <tr key={`expanded-${nota.id}`} className="bg-white dark:bg-zinc-900 border-l-2 border-brand-accent animate-in fade-in duration-300">
                                        <td colSpan={7} className="p-0 border-b-2 border-brand-accent/20 dark:border-b-2 dark:border-brand-accent/35">
                                          <div className="animate-in slide-in-from-top-2 duration-300 ease-out">
                                            <ExpandedItens notaId={nota.id} numeroNe={nota.numero_ne} nota={nota} onItemUpdate={fetchNotas} />
                                          </div>
                                        </td>
                                      </tr>
                                    )}
                                 </Fragment>
                               )
                            })}
                          </Fragment>
                        )}
                    </Fragment>
                    )
                  })}
                </TableBody>
              </Table>
            </div>

            {/* Pagination Controls por Cliente */}
            {stableGroups.length > 0 && (
              <div className="flex flex-col sm:flex-row items-center justify-between p-4 border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-950 rounded-xl shadow-sm gap-3 mt-3">
                <div className="text-xs text-zinc-500 font-bold uppercase tracking-wider flex items-center gap-2">
                  <span>
                    Exibindo {paginatedGroups.length > 0 ? (clientPage - 1) * CLIENTS_PER_PAGE + 1 : 0} a {Math.min(clientPage * CLIENTS_PER_PAGE, stableGroups.length)} de {stableGroups.length} clientes ({totalCount} empenhos totais)
                  </span>
                  {fetchingMore && (
                    <span className="inline-flex items-center gap-1.5 text-[11px] text-blue-600 dark:text-blue-400 font-medium normal-case bg-blue-50 dark:bg-blue-950/40 px-2 py-0.5 rounded-full border border-blue-200 dark:border-blue-800">
                      <Loader2 className="w-3 h-3 animate-spin text-blue-600 dark:text-blue-400 shrink-0" />
                      Sincronizando...
                    </span>
                  )}
                </div>
                <div className="flex items-center gap-2">
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => setClientPage(prev => Math.max(1, prev - 1))}
                    disabled={clientPage === 1}
                    className="h-8 text-xs font-bold"
                  >
                    Anterior
                  </Button>
                  <span className="text-xs font-bold px-2 text-zinc-700 dark:text-zinc-300">
                    Página {clientPage} de {totalClientPages}
                  </span>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => {
                      if (clientPage >= totalClientPages && hasMore && !fetchingMore) {
                        fetchNotas(true)
                      }
                      setClientPage(prev => Math.min(totalClientPages, prev + 1))
                    }}
                    disabled={clientPage >= totalClientPages && !hasMore}
                    className="h-8 text-xs font-bold"
                  >
                    Próxima
                  </Button>
                </div>
              </div>
            )}

            {hasMore && (
              <div ref={lastElementRef} className="h-1 w-full opacity-0 pointer-events-none" />
            )}
          </>
        )}
      </div>
    </TabsContent>

    <TabsContent visible={tab === 'relatorios'}>
      <EmpenhoReports />
    </TabsContent>
  </Tabs>

      <NotaFormModal isOpen={modalOpen} onClose={() => { setModalOpen(false); setNotaToEdit(null) }} notaToEdit={notaToEdit} onSuccess={fetchNotas} />
      
      <UnifyEntitiesModal 
        isOpen={unifyModalOpen} 
        onClose={() => setUnifyModalOpen(false)} 
        onSuccess={fetchNotas} 
      />



      <Dialog open={modalNFsConfig.open} onOpenChange={(open) => { if (!open) setModalNFsConfig(prev => ({ ...prev, open: false })) }}>
        <DialogContent className="max-w-[1600px] w-[95vw] max-h-[90vh] overflow-hidden flex flex-col p-0 gap-0">
          <DialogHeader className="p-6 pb-4 border-b border-zinc-100 dark:border-zinc-800">
            <DialogTitle className="flex items-center gap-2 text-emerald-900 dark:text-emerald-100">
                <FileText className="w-5 h-5 text-emerald-600"/> {modalNFsConfig.title}
            </DialogTitle>
            <DialogDescription className="sr-only">
              Visualização das notas fiscais vinculadas a este empenho ou entidade.
            </DialogDescription>
          </DialogHeader>
          <div className="overflow-y-auto p-4 flex-1 min-h-0 bg-zinc-50/50 dark:bg-zinc-950/20">
            {modalNFsConfig.open && (
              <NFsLancadas initialSearch={modalNFsConfig.searchTerm} onRevertida={fetchNotas} />
            )}
          </div>
        </DialogContent>
      </Dialog>

      {/* Modal de Distribuição */}
      <Dialog open={distributeModalOpen} onOpenChange={setDistributeModalOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Users className="w-5 h-5 text-brand-accent" /> Distribuir Empenho
            </DialogTitle>
            <DialogDescription className="text-sm text-zinc-500">
              {notaParaDistribuir ? 'Selecione quem será o responsável por este empenho.' : `Selecione quem será o responsável por todos os empenhos de "${entidadeParaDistribuir?.name}".`}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-2 py-4 max-h-[40vh] overflow-y-auto pr-2">
            <Button 
                variant="outline" 
                className="w-full justify-start text-red-500 border-red-100 hover:bg-red-50"
                onClick={() => handleConfirmDistribute(null)}
                disabled={submittingDist}
            >
                Remover Atribuição (Tornar Disponível)
            </Button>
            <div className="border-t border-zinc-100 my-2" />
            {colaboradores.map(user => (
              <Button
                key={user.id}
                variant="ghost"
                className="w-full justify-start gap-3 h-12"
                onClick={() => handleConfirmDistribute(user.id)}
                disabled={submittingDist}
              >
                <div className="w-8 h-8 rounded-full bg-brand-accent/10 text-brand-accent dark:bg-brand-accent/20 flex items-center justify-center font-bold text-xs">
                  {user.display_name?.substring(0, 2).toUpperCase()}
                </div>
                <div className="text-left">
                  <p className="text-sm font-medium leading-none">{user.display_name}</p>
                  <p className="text-xs text-zinc-500 mt-1">
                    {user.setor === 'VENDAS' ? 'VENDAS PÚBLICO' : user.setor} — {user.nivel}
                  </p>
                </div>
              </Button>
            ))}
          </div>
        </DialogContent>
      </Dialog>

      <ConfirmDeleteEmpenhoDialog 
        isOpen={!!deleteConfirmNota}
        onClose={() => setDeleteConfirmNota(null)}
        onConfirm={handleDelete}
        numeroNE={deleteConfirmNota?.numero_ne || ""}
      />
      <EditEntityModal
        isOpen={editEntityModalOpen}
        onClose={() => setEditEntityModalOpen(false)}
        onSuccess={fetchNotas}
        entity={selectedEntityForEdit}
      />

      {/* Modal de Gerenciamento de Notificação de Atraso */}
      <Dialog open={notificationModalOpen} onOpenChange={(open) => { if (!open) { setNotificationModalOpen(false); setSelectedNotaForNotification(null); } }}>
        <DialogContent className="sm:max-w-md bg-white dark:bg-zinc-950 border border-zinc-200 dark:border-zinc-800">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-zinc-900 dark:text-zinc-100 font-bold uppercase text-sm">
              <AlertTriangle className="w-5 h-5 text-amber-500" />
              Notificação de Atraso
            </DialogTitle>
            <DialogDescription className="text-xs text-zinc-500">
              Gerencie a notificação de atraso para o empenho #{selectedNotaForNotification?.numero_ne}.
            </DialogDescription>
          </DialogHeader>

          {selectedNotaForNotification && (() => {
            const hasNotification = !!(selectedNotaForNotification as any).e_notificacao;
            const notifFile = (selectedNotaForNotification as any).arquivo_notificacao;
            
            return (
              <div className="space-y-4 py-3">
                {hasNotification ? (
                  <div className="bg-amber-50/50 dark:bg-amber-950/10 border border-amber-200 dark:border-amber-900/30 rounded-xl p-3.5 space-y-3">
                    <div className="flex items-start gap-3">
                      <div className="p-2 bg-amber-500/10 text-amber-600 rounded-lg shrink-0">
                        <AlertTriangle className="w-5 h-5" />
                      </div>
                      <div className="space-y-0.5">
                        <p className="text-xs font-bold text-amber-800 dark:text-amber-400 uppercase tracking-wide">Empenho Notificado</p>
                        <p className="text-[11px] text-zinc-500">Este empenho possui uma notificação de atraso ativa emitida pelo órgão.</p>
                      </div>
                    </div>
                    
                    {notifFile && (
                      <div className="flex items-center justify-between bg-white dark:bg-zinc-900 p-2.5 rounded-lg border border-zinc-150 dark:border-zinc-850">
                        <span className="text-[11px] text-zinc-650 font-medium truncate max-w-[220px]">
                          Documento Anexado
                        </span>
                        <a 
                          href={getCleanPublicUrl(notifFile)} 
                          target="_blank" 
                          rel="noopener noreferrer"
                          className="inline-flex items-center gap-1.5 text-xs text-blue-650 hover:text-blue-700 font-bold"
                        >
                          Visualizar <FileText className="w-3.5 h-3.5" />
                        </a>
                      </div>
                    )}

                    <div className="flex gap-2 pt-1">
                      <Button
                        variant="outline"
                        size="sm"
                        className="flex-1 h-9 font-bold text-red-650 border-red-200 hover:bg-red-50"
                        onClick={async () => {
                          try {
                            const { error } = await supabase
                              .from('notas')
                              .update({ e_notificacao: false, arquivo_notificacao: null })
                              .eq('id', selectedNotaForNotification.id);
                            if (error) throw error;
                            
                            // delete physical file if present
                            if (notifFile) {
                              try { await deleteDocument(notifFile); } catch(e) {}
                            }
                            
                            toast.success('Notificação removida com sucesso!');
                            setNotificationModalOpen(false);
                            fetchNotas();
                          } catch (err: any) {
                            toast.error('Erro ao remover notificação: ' + err.message);
                          }
                        }}
                      >
                        Remover Notificação
                      </Button>
                    </div>
                  </div>
                ) : (
                  <div className="space-y-4">
                    <div className="bg-zinc-50 dark:bg-zinc-900/30 p-3.5 rounded-xl border border-zinc-200 dark:border-zinc-800">
                      <p className="text-xs text-zinc-650 leading-relaxed">
                        Este empenho ainda não foi marcado como notificado. Caso tenha recebido uma notificação de atraso, selecione o arquivo correspondente abaixo para registrar.
                      </p>
                    </div>

                    <div className="space-y-2">
                      <Label className="text-xs font-bold text-zinc-750 dark:text-zinc-300 uppercase tracking-wide">
                        Anexar Documento da Notificação (PDF ou Imagem) *
                      </Label>
                      <Input
                        type="file"
                        accept="application/pdf,image/*"
                        onChange={async (e) => {
                          const file = e.target.files?.[0];
                          if (!file) return;
                          
                          const loader = toast.loading('Fazendo upload do documento...');
                          try {
                            const { path, error: uploadErr } = await uploadDocument(file);
                            if (uploadErr) throw new Error(String(uploadErr));
                            
                            const { error } = await supabase
                              .from('notas')
                              .update({ e_notificacao: true, foi_notificado: true, arquivo_notificacao: path })
                              .eq('id', selectedNotaForNotification.id);
                            if (error) throw error;
                            
                            toast.success('Notificação registrada com sucesso!', { id: loader });
                            setNotificationModalOpen(false);
                            fetchNotas();
                          } catch (err: any) {
                            toast.error('Erro ao registrar notificação: ' + err.message, { id: loader });
                          }
                        }}
                        className="text-xs file:bg-zinc-100 hover:file:bg-zinc-200"
                      />
                    </div>
                  </div>
                )}
              </div>
            );
          })()}
        </DialogContent>
      </Dialog>

      <Dialog 
        open={modalMoveEmpenho.open} 
        onOpenChange={(open) => {
          if (!open) setModalMoveEmpenho({ open: false, nota: null })
        }}
      >
        <DialogContent className="sm:max-w-[520px] max-w-[95vw] overflow-hidden rounded-2xl p-6">
          <DialogHeader>
            <DialogTitle className="text-violet-900 dark:text-violet-100 flex items-center gap-2 font-bold">
              <GitMerge className="w-5 h-5 text-violet-600 shrink-0" /> Mover Empenho de Cliente
            </DialogTitle>
            <DialogDescription className="text-xs">
              Apenas usuários com nível <strong>DEV</strong> podem transferir um empenho de um cliente para outro.
            </DialogDescription>
          </DialogHeader>

          {modalMoveEmpenho.nota && (
            <div className="space-y-4 py-2 w-full max-w-full overflow-hidden">
              <div className="p-3 bg-zinc-50 dark:bg-zinc-900/50 rounded-xl border border-zinc-200 dark:border-zinc-800 text-xs space-y-1 w-full overflow-hidden">
                <p className="truncate"><strong>Número do Empenho (NE):</strong> <span className="font-mono">{modalMoveEmpenho.nota.numero_ne}</span></p>
                <p className="truncate" title={modalMoveEmpenho.nota.entidades?.nome || modalMoveEmpenho.nota.emissor || ''}><strong>Cliente Atual:</strong> {modalMoveEmpenho.nota.entidades?.nome || modalMoveEmpenho.nota.emissor || 'Não definido'}</p>
              </div>

              <div className="space-y-2 w-full overflow-hidden">
                <Label className="text-xs font-bold uppercase text-zinc-500">Selecionar Cliente de Destino</Label>
                <div className="relative w-full">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-zinc-400" />
                  <Input
                    placeholder="Filtrar por nome do cliente..."
                    value={searchEntidade}
                    onChange={(e) => setSearchEntidade(e.target.value)}
                    className="pl-9 h-10 text-xs w-full rounded-xl"
                  />
                </div>

                <ScrollArea className="h-[200px] border border-zinc-200 dark:border-zinc-800 rounded-xl bg-white dark:bg-zinc-950 w-full overflow-hidden">
                  <div className="divide-y divide-zinc-100 dark:divide-zinc-900">
                    {entidadesList
                      .filter(e => 
                        !searchEntidade || 
                        (e.nome || '').toLowerCase().includes(searchEntidade.toLowerCase()) ||
                        (e.municipio || '').toLowerCase().includes(searchEntidade.toLowerCase())
                      )
                      .map(e => {
                        const isSelected = selectedEntidadeId === String(e.id)
                        return (
                          <button
                            key={e.id}
                            type="button"
                            onClick={() => setSelectedEntidadeId(String(e.id))}
                            className={`w-full text-left px-3 py-2.5 text-xs transition-colors flex items-center justify-between border-b border-zinc-100 dark:border-zinc-900 last:border-0 ${
                              isSelected 
                                ? 'bg-violet-50 dark:bg-violet-950/20 text-violet-700 dark:text-violet-400 font-bold' 
                                : 'hover:bg-zinc-50 dark:hover:bg-zinc-900/40 text-zinc-700 dark:text-zinc-300'
                            }`}
                          >
                            <span className="truncate max-w-[70%]" title={e.nome}>{e.nome} ({e.estado || '—'})</span>
                            {isSelected && (
                              <span className="text-[10px] bg-violet-600 text-white px-2 py-0.5 rounded-md font-black uppercase flex-shrink-0">
                                Selecionado
                              </span>
                            )}
                          </button>
                        )
                      })}
                    {entidadesList.filter(e => 
                      !searchEntidade || 
                      (e.nome || '').toLowerCase().includes(searchEntidade.toLowerCase()) ||
                      (e.municipio || '').toLowerCase().includes(searchEntidade.toLowerCase())
                    ).length === 0 && (
                      <div className="p-4 text-center text-xs text-zinc-400 italic">
                        Nenhum cliente encontrado
                      </div>
                    )}
                  </div>
                </ScrollArea>
              </div>
            </div>
          )}

          <div className="flex justify-end gap-3 border-t border-zinc-100 dark:border-zinc-800 pt-4 mt-2">
            <Button
              variant="outline"
              onClick={() => setModalMoveEmpenho({ open: false, nota: null })}
              disabled={loadingMove}
              className="rounded-xl text-xs"
            >
              Cancelar
            </Button>
            <Button
              onClick={handleConfirmMoveEmpenho}
              disabled={loadingMove || !selectedEntidadeId}
              className="bg-violet-600 hover:bg-violet-700 text-white font-bold gap-2 rounded-xl text-xs"
            >
              {loadingMove ? <Loader2 className="w-4 h-4 animate-spin" /> : <GitMerge className="w-4 h-4" />}
              Transferir Empenho
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* Modal de Registro de Pedido */}
      <Dialog open={pedidoModalOpen} onOpenChange={setPedidoModalOpen}>
        <DialogContent className="sm:max-w-md bg-white dark:bg-zinc-950 border border-zinc-200 dark:border-zinc-800">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-zinc-950 dark:text-zinc-50">
              <ShoppingCart className="w-5 h-5 text-blue-600" /> Sinalizar Pedido Feito
            </DialogTitle>
            <DialogDescription className="text-sm text-zinc-500">
              Informe o número do pedido correspondente ao empenho <strong>#{selectedNotaForPedido?.numero_ne}</strong>. Isso sinalizará que o pedido foi enviado e que o sistema deve aguardar a Nota Fiscal para a baixa dos itens.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label htmlFor="numero-pedido" className="text-sm font-semibold text-zinc-700 dark:text-zinc-300">
                Número do Pedido
              </Label>
              <Input
                id="numero-pedido"
                placeholder="Ex: PD-2026-0001"
                value={tempNumeroPedido}
                onChange={(e) => setTempNumeroPedido(e.target.value)}
                className="w-full text-zinc-950 dark:text-zinc-50"
                autoFocus
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    handleSavePedido();
                  }
                }}
              />
            </div>
          </div>
          <div className="flex justify-between items-center gap-3 border-t pt-4">
            {selectedNotaForPedido?.numero_pedido ? (
              <Button
                variant="destructive"
                onClick={() => {
                  setTempNumeroPedido('');
                  setTimeout(() => {
                    const saveWithEmpty = async () => {
                      if (!selectedNotaForPedido) return
                      setSavingPedido(true)
                      try {
                        const { error } = await supabase
                          .from('notas')
                          .update({ numero_pedido: null })
                          .eq('id', selectedNotaForPedido.id)
                        if (error) throw error
                        await logAction('REGISTRAR_NUMERO_PEDIDO', 'notas', selectedNotaForPedido.id, {
                          numero_ne: selectedNotaForPedido.numero_ne,
                          numero_pedido: null
                        })
                        toast.success('Número do pedido removido com sucesso!')
                        setPedidoModalOpen(false)
                        fetchNotas(false)
                      } catch (err: any) {
                        toast.error('Erro ao remover pedido: ' + err.message)
                      } finally {
                        setSavingPedido(false)
                      }
                    }
                    saveWithEmpty()
                  }, 50)
                }}
                disabled={savingPedido}
                className="font-bold"
              >
                Remover Pedido
              </Button>
            ) : (
              <div />
            )}
            <div className="flex gap-2">
              <Button
                variant="outline"
                onClick={() => setPedidoModalOpen(false)}
                disabled={savingPedido}
              >
                Cancelar
              </Button>
              <Button
                onClick={handleSavePedido}
                disabled={savingPedido}
                className="bg-blue-600 hover:bg-blue-700 text-white font-bold gap-2"
              >
                {savingPedido ? <Loader2 className="w-4 h-4 animate-spin" /> : null}
                Salvar Pedido
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {isModalVincularAtaOpen && selectedNotaForVincularAta && (
        <ModalVincularAtaEmpenho
          nota={selectedNotaForVincularAta}
          isOpen={isModalVincularAtaOpen}
          onClose={() => {
            setIsModalVincularAtaOpen(false)
            setSelectedNotaForVincularAta(null)
          }}
          onSuccess={() => fetchNotas(false)}
        />
      )}
    </div>
  )
}
