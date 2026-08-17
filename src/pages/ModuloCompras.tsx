import { useState, useEffect, Fragment, useMemo } from 'react'
import { useNavigate } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { toast } from 'sonner'
import { getCleanPublicUrl, uploadDocument } from '../lib/storage'
import { logAction } from '../lib/logger'
import { renderFriendlyDetails } from '../AuditLogs'
import { 
  ShoppingCart as Cart,
  Search as SearchIcon, 
  AlertTriangle as Alert, 
  ClipboardList as List, 
  Eye as EyeIcon, 
  Clock as ClockIcon,
  UserPlus,
  FileDown,
  Loader2,
  Plus,
  Zap,
  Trash2,
  Pencil,
  Users,
  Lock,
  CheckCircle2,
  ShoppingCart,
  MessageSquare,
  User,
  X,
  ExternalLink,
  History,
  ArrowUpDown,
  Paperclip
} from 'lucide-react'
import { Card } from '../components/ui/card'
import { Button } from '../components/ui/button'
import { Input } from '../components/ui/input'
import { Badge } from '../components/ui/badge'
import { FileSpreadsheet } from 'lucide-react'
import { exportToExcel } from '../reportUtils'
import { jsPDF } from 'jspdf'
import autoTable from 'jspdf-autotable'
import { formatCurrency } from '../lib/utils'
import { ProductAutocomplete } from '../components/ui/ProductAutocomplete'
import { 
  Table, 
  TableBody, 
  TableCell, 
  TableHead, 
  TableHeader, 
  TableRow 
} from '../components/ui/table'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "../components/ui/select"


import { useAuth } from '../AuthContext'
import { canDeletePedidoCompra } from '../lib/permissions'
import { cn } from '../lib/utils'
import type { Tables } from '../supabaseTypes'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from '../components/ui/dialog'
import { Textarea } from '../components/ui/textarea'
import { Label } from '../components/ui/label'

type PedidoFull = Tables<'pedidos_compra'> & {
  item: (Tables<'itens'> & {
    nota: (Tables<'notas'> & {
        ata: Tables<'atas'> | null
    }) | null
    produto_catalogo?: Tables<'catalogo_produtos'> | null
  }) | null
  item_ata: (Tables<'itens_ata'> & {
    ata: Tables<'atas'> | null
    produto_catalogo?: Tables<'catalogo_produtos'> | null
  }) | null
  assigned_profile?: Tables<'profiles'> | null
  solicitante_profile?: Tables<'profiles'> | null
  produto_catalogo?: Tables<'catalogo_produtos'> | null
}

const getNextCutoff = (from: Date = new Date()): Date => {
    const d = new Date(from)
    d.setHours(20, 0, 0, 0)
    const day = d.getDay()
    const time = from.getTime()

    if (day === 1) {
        const cutoffToday = new Date(from)
        cutoffToday.setHours(20, 0, 0, 0)
        if (time < cutoffToday.getTime()) {
            return cutoffToday
        }
    }
    if (day === 3) {
        const cutoffToday = new Date(from)
        cutoffToday.setHours(20, 0, 0, 0)
        if (time < cutoffToday.getTime()) {
            return cutoffToday
        }
    }

    let temp = new Date(from)
    for (let i = 1; i <= 7; i++) {
        temp.setDate(temp.getDate() + 1)
        const tDay = temp.getDay()
        if (tDay === 1 || tDay === 3) {
            temp.setHours(20, 0, 0, 0)
            return temp
        }
    }
    return temp
}

const getBatchStatus = (pedido: PedidoFull, nextCutoff: Date): 'CLOSED' | 'CURRENT' => {
    if (!pedido.created_at) return 'CURRENT'
    const createdTime = new Date(pedido.created_at).getTime()
    
    const prevCutoff = new Date(nextCutoff)
    if (nextCutoff.getDay() === 1) {
        prevCutoff.setDate(prevCutoff.getDate() - 5)
    } else {
        prevCutoff.setDate(prevCutoff.getDate() - 2)
    }
    prevCutoff.setHours(20, 0, 0, 0)
    
    return createdTime < prevCutoff.getTime() ? 'CLOSED' : 'CURRENT'
}

interface CountdownTimerProps {
    nextCutoffDate: Date
    getNextCutoff: (d: Date) => Date
}

function CountdownTimer({ nextCutoffDate, getNextCutoff }: CountdownTimerProps) {
    const [timeLeft, setTimeLeft] = useState<{ days: number, hours: number, minutes: number, seconds: number }>({ days: 0, hours: 0, minutes: 0, seconds: 0 })

    useEffect(() => {
        const updateTimer = () => {
            const now = new Date()
            const cutoff = getNextCutoff(now)
            const diff = cutoff.getTime() - now.getTime()
            if (diff > 0) {
                const days = Math.floor(diff / (1000 * 60 * 60 * 24))
                const hours = Math.floor((diff / (1000 * 60 * 60)) % 24)
                const minutes = Math.floor((diff / 1000 / 60) % 60)
                const seconds = Math.floor((diff / 1000) % 60)
                setTimeLeft({ days, hours, minutes, seconds })
            } else {
                setTimeLeft({ days: 0, hours: 0, minutes: 0, seconds: 0 })
            }
        }
        updateTimer()
        const interval = setInterval(updateTimer, 1000)
        return () => clearInterval(interval)
    }, [getNextCutoff])

    return (
        <div className="bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-700 p-3 rounded-xl flex items-center gap-4 text-center w-full sm:w-auto justify-center shadow-inner">
            <div>
                <div className="text-[10px] font-bold text-zinc-400 dark:text-zinc-500 uppercase tracking-wide">Próximo Corte</div>
                <div className="text-xs font-black text-brand-accent mt-0.5">
                    {nextCutoffDate.toLocaleDateString('pt-BR')} {nextCutoffDate.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}
                </div>
            </div>
            <div className="w-[1px] h-8 bg-zinc-200 dark:bg-zinc-800" />
            <div>
                <div className="text-[10px] font-bold text-zinc-400 dark:text-zinc-500 uppercase tracking-wide">Tempo Restante</div>
                <div className="text-xs font-black font-mono text-zinc-800 dark:text-zinc-200 mt-0.5">
                    {timeLeft.days > 0 ? `${timeLeft.days}d ` : ''}
                    {String(timeLeft.hours).padStart(2, '0')}h : {String(timeLeft.minutes).padStart(2, '0')}m : {String(timeLeft.seconds).padStart(2, '0')}s
                </div>
            </div>
        </div>
    )
}

const getCategoryBadgeStyle = (category: string) => {
    const cat = (category || '').toUpperCase().trim();
    switch (cat) {
        case 'MEDICAMENTO':
            return 'bg-emerald-50 text-emerald-700 border-emerald-200 dark:bg-emerald-950/20 dark:text-emerald-400 dark:border-emerald-900/30';
        case 'MATERIAL HOSPITALAR':
            return 'bg-blue-50 text-blue-700 border-blue-200 dark:bg-blue-950/20 dark:text-blue-400 dark:border-blue-900/30';
        case 'DIETA':
            return 'bg-purple-50 text-purple-700 border-purple-200 dark:bg-purple-950/20 dark:text-purple-400 dark:border-purple-900/30';
        case 'ODONTO':
            return 'bg-sky-50 text-sky-700 border-sky-200 dark:bg-sky-950/20 dark:text-sky-400 dark:border-sky-900/30';
        case 'COSMÉTICO':
        case 'COSMETICO':
            return 'bg-pink-50 text-pink-700 border-pink-200 dark:bg-pink-950/20 dark:text-pink-400 dark:border-pink-900/30';
        case 'MOBILIÁRIO':
        case 'MOBILIARIO':
            return 'bg-amber-50 text-amber-700 border-amber-200 dark:bg-amber-950/20 dark:text-amber-400 dark:border-amber-900/30';
        case 'ELETRÔNICO':
        case 'ELETRONICO':
            return 'bg-indigo-50 text-indigo-700 border-indigo-200 dark:bg-indigo-950/20 dark:text-indigo-400 dark:border-indigo-900/30';
        default:
            return 'bg-zinc-50 text-zinc-650 border-zinc-200 dark:bg-zinc-950/20 dark:text-zinc-400 dark:border-zinc-900/30';
    }
}

export function ModuloCompras() {
    const navigate = useNavigate()
    const [pedidos, setPedidos] = useState<PedidoFull[]>([])
    const [loading, setLoading] = useState(true)
    const [searchTerm, setSearchTerm] = useState('')
    const [activeTab, setActiveTab] = useState('TUDO')
    const [filterMyRequests, setFilterMyRequests] = useState(false)
    const [consolidadoDetalhado, setConsolidadoDetalhado] = useState(false)
    const { profile, isAdmin } = useAuth()
    const profileId = profile?.id
    const profileSetor = profile?.setor
    const profileNivel = profile?.nivel
    const [profiles, setProfiles] = useState<Tables<'profiles'>[]>([])
    const [expandedDescIds, setExpandedDescIds] = useState<Set<number>>(new Set())
    const [filterAssignee, setFilterAssignee] = useState<string>('ALL')

    // Countdown timer states
    const [nextCutoffDate, setNextCutoffDate] = useState<Date>(() => getNextCutoff(new Date()))
    const [filterBatch, setFilterBatch] = useState<'ALL' | 'CURRENT' | 'CLOSED'>('ALL')
    const [filterStatus, setFilterStatus] = useState<'ALL' | 'NORMAL' | 'PENDENTE' | 'COTACAO' | 'FALHA' | 'ATENDIDO' | 'COMPRADO' | 'EXCLUIDO'>('ALL')

    // Sorting state
    type SortOption = 'DEFAULT' | 'CREATED_DESC' | 'CREATED_ASC' | 'PRAZO_ASC' | 'PRAZO_DESC' | 'ENTREGA_ASC' | 'ENTREGA_DESC'
    const [sortBy, setSortBy] = useState<SortOption>('DEFAULT')

    // Pagination states
    const [currentPage, setCurrentPage] = useState(1)
    const ITEMS_PER_PAGE = 30

    // Justificativa states
    const [justificarPedido, setJustificarPedido] = useState<PedidoFull | null>(null)
    const [detalhesPedido, setDetalhesPedido] = useState<PedidoFull | null>(null)
    const [justificativaTexto, setJustificativaTexto] = useState('')
    const [faltaIndustria, setFaltaIndustria] = useState(false)
    const [industriaFile, setIndustriaFile] = useState<File | null>(null)
    const [uploadingFile, setUploadingFile] = useState(false)

    // History Modal states
    const [pedidoHistoryItem, setPedidoHistoryItem] = useState<PedidoFull | null>(null)
    const [pedidoLogs, setPedidoLogs] = useState<any[]>([])
    const [pedidoLogsLoading, setPedidoLogsLoading] = useState(false)

    const [globalHistoryOpen, setGlobalHistoryOpen] = useState(false)
    const [globalLogs, setGlobalLogs] = useState<any[]>([])
    const [globalLogsLoading, setGlobalLogsLoading] = useState(false)

    async function handleOpenHistoryModal(pedido: PedidoFull) {
        setPedidoHistoryItem(pedido)
        setPedidoLogsLoading(true)
        try {
            const { data } = await supabase
                .from('audit_logs')
                .select('*')
                .eq('table_name', 'pedidos_compra')
                .eq('record_id', String(pedido.id))
                .order('created_at', { ascending: false })

            setPedidoLogs(data || [])
        } catch (err) {
            console.error(err)
            toast.error('Erro ao carregar histórico')
        } finally {
            setPedidoLogsLoading(false)
        }
    }

    async function handleOpenGlobalHistory() {
        setGlobalHistoryOpen(true)
        setGlobalLogsLoading(true)
        try {
            const { data } = await supabase
                .from('audit_logs')
                .select('*')
                .eq('table_name', 'pedidos_compra')
                .order('created_at', { ascending: false })
                .limit(100)

            setGlobalLogs(data || [])
        } catch (err) {
            console.error(err)
            toast.error('Erro ao carregar histórico global de compras')
        } finally {
            setGlobalLogsLoading(false)
        }
    }

    // Compra Livre states
    const [showCompraLivre, setShowCompraLivre] = useState(false)
    const [compraLivreLoading, setCompraLivreLoading] = useState(false)
    const [compraLivreForm, setCompraLivreForm] = useState({
        descricao: '',
        documento_origem: '',
        tipo_documento: 'EMPENHO',
        unidade: 'UN',
        quantidade: 1,
        valor_unitario: '',
        orgao_solicitante: '',
        prazo_dias: 5,
        marca: '',
        obs_adicional: '',
        produto_catalogo_id: null as number | null
    })
    const [compraLivreCategoria, setCompraLivreCategoria] = useState('MATERIAL HOSPITALAR')
    const [editingCompraLivreId, setEditingCompraLivreId] = useState<number | null>(null)
    const [isProductCategoryDefined, setIsProductCategoryDefined] = useState(false)

    // Novas melhorias de compras
    const [showTeamModal, setShowTeamModal] = useState(false)
    
    // Estados para Registro de Compra
    const [registrarCompraPedido, setRegistrarCompraPedido] = useState<PedidoFull | null>(null)
    const [precoComprado, setPrecoComprado] = useState('')
    const [marcaComprada, setMarcaComprada] = useState('')
    const [prazoChegada, setPrazoChegada] = useState('')
    const [registrandoCompraLoading, setRegistrandoCompraLoading] = useState(false)
    const [compraTipo, setCompraTipo] = useState<'COMPLETA' | 'PARCIAL'>('COMPLETA')
    const [qtdComprada, setQtdComprada] = useState<string>('')

    // Estados para Notificação em Compra Livre
    const [compraLivreENotificacao, setCompraLivreENotificacao] = useState(false)
    const [compraLivreNotificacaoFile, setCompraLivreNotificacaoFile] = useState<File | null>(null)
    const [compraLivreDataNotificacao, setCompraLivreDataNotificacao] = useState(new Date().toISOString().split('T')[0])

    // Estados para Demanda Judicial em Compra Livre
    const [compraLivreEDemandaJudicial, setCompraLivreEDemandaJudicial] = useState(false)
    const [compraLivreDemandaJudicialFile, setCompraLivreDemandaJudicialFile] = useState<File | null>(null)

    // Estados para Correção Geral de Solicitação (Para Gestores/Admins)
    const [selectedPedidoParaNotificar, setSelectedPedidoParaNotificar] = useState<PedidoFull | null>(null)
    const [notificarModalOpen, setNotificarModalOpen] = useState(false)
    const [notificarData, setNotificarData] = useState(new Date().toISOString().split('T')[0])
    const [notificarFile, setNotificarFile] = useState<File | null>(null)
    const [submittingNotificacao, setSubmittingNotificacao] = useState(false)
    const [corrigirPedido, setCorrigirPedido] = useState<PedidoFull | null>(null)
    const [corrigirDescricao, setCorrigirDescricao] = useState<string>('')
    const [corrigirQuantidade, setCorrigirQuantidade] = useState<number>(0)
    const [corrigirUnidade, setCorrigirUnidade] = useState<string>('')
    const [corrigirCategoria, setCorrigirCategoria] = useState<string>('')
    const [corrigirPrazo, setCorrigirPrazo] = useState<string>('')
    const [corrigirObs, setCorrigirObs] = useState<string>('')
    const [corrigirJustificativa, setCorrigirJustificativa] = useState<string>('')
    const [corrigirLoading, setCorrigirLoading] = useState<boolean>(false)

    // Estados para Reatribuição de Comprador e Categoria
    const [reassignModalOpen, setReassignModalOpen] = useState<boolean>(false)
    const [reassignPedido, setReassignPedido] = useState<PedidoFull | null>(null)
    const [reassignBulkIds, setReassignBulkIds] = useState<number[] | null>(null)
    const [reassignBuyerId, setReassignBuyerId] = useState<string | null>(null)
    const [reassignCategory, setReassignCategory] = useState<string>('')
    const [reassignLoading, setReassignLoading] = useState<boolean>(false)

    // Estados para Exclusão de Solicitação de Compras (Com Justificativa)
    const [excluirPedido, setExcluirPedido] = useState<PedidoFull | null>(null)
    const [excluirJustificativa, setExcluirJustificativa] = useState<string>('')
    const [excluirLoading, setExcluirLoading] = useState<boolean>(false)

    // Imagem em Compra Livre
    const [compraLivreImagem, setCompraLivreImagem] = useState<File | null>(null)
    const [compraLivreImagemPreview, setCompraLivreImagemPreview] = useState<string | null>(null)
    const [existingCompraLivreImagePath, setExistingCompraLivreImagePath] = useState<string | null>(null)

    // Estados para Vinculação de Anexo Único em Lote (Vendedor + Município) - Restrito a DEV/ADM
    const [showAnexoLoteModal, setShowAnexoLoteModal] = useState<boolean>(false)
    const [anexoLoteVendedor, setAnexoLoteVendedor] = useState<string>('ALL')
    const [anexoLoteMunicipio, setAnexoLoteMunicipio] = useState<string>('ALL')
    const [anexoLoteTipoDoc, setAnexoLoteTipoDoc] = useState<'NOTIFICACAO' | 'DEMANDA_JUDICIAL' | 'IMAGEM_DOC'>('NOTIFICACAO')
    const [anexoLoteFile, setAnexoLoteFile] = useState<File | null>(null)
    const [anexoLoteDataNotificacao, setAnexoLoteDataNotificacao] = useState<string>(new Date().toISOString().split('T')[0])
    const [anexoLoteSelectedIds, setAnexoLoteSelectedIds] = useState<Set<number>>(new Set())
    const [anexoLoteSubmitting, setAnexoLoteSubmitting] = useState<boolean>(false)

    const handleCompraLivreImageChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        if (e.target.files && e.target.files[0]) {
            const file = e.target.files[0]
            setCompraLivreImagem(file)
            setCompraLivreImagemPreview(URL.createObjectURL(file))
        }
    }

    const handleRemoveCompraLivreImage = () => {
        setCompraLivreImagem(null)
        if (compraLivreImagemPreview) {
            URL.revokeObjectURL(compraLivreImagemPreview)
            setCompraLivreImagemPreview(null)
        }
        setExistingCompraLivreImagePath(null)
        const input = document.getElementById('cl_imagem') as HTMLInputElement
        if (input) input.value = ''
    }

    // Imagem em Correção
    const [corrigirImagem, setCorrigirImagem] = useState<File | null>(null)
    const [corrigirImagemPreview, setCorrigirImagemPreview] = useState<string | null>(null)
    const [existingCorrigirImagePath, setExistingCorrigirImagePath] = useState<string | null>(null)

    const handleCorrigirImageChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        if (e.target.files && e.target.files[0]) {
            const file = e.target.files[0]
            setCorrigirImagem(file)
            setCorrigirImagemPreview(URL.createObjectURL(file))
        }
    }

    const handleRemoveCorrigirImage = () => {
        setCorrigirImagem(null)
        if (corrigirImagemPreview) {
            URL.revokeObjectURL(corrigirImagemPreview)
            setCorrigirImagemPreview(null)
        }
        setExistingCorrigirImagePath(null)
        const input = document.getElementById('corr_imagem') as HTMLInputElement
        if (input) input.value = ''
    }

    // Estados para Sinalização de Erro / Quarentena
    const [erroPedido, setErroPedido] = useState<PedidoFull | null>(null)
    const [erroJustificativa, setErroJustificativa] = useState('')
    const [erroLoading, setErroLoading] = useState(false)

    const normalizeCategory = (cat: string | null | undefined): string => {
        if (!cat) return 'MATERIAL HOSPITALAR'
        const c = cat.toUpperCase().trim()
        if (c.includes('MEDIC')) return 'MEDICAMENTO'
        if (c.includes('ODONTO')) return 'ODONTO'
        if (c.includes('DIETA')) return 'DIETA'
        if (c.includes('COSMET')) return 'COSMÉTICO'
        if (c.includes('HOSP') || c.includes('MAT.')) return 'MATERIAL HOSPITALAR'
        if (c.includes('MOBIL')) return 'MOBILIÁRIO'
        if (c.includes('ELETRO')) return 'ELETRÔNICO'
        return 'MATERIAL HOSPITALAR'
    }

    const findBuyerForCategoryLocally = (category: string): string | null => {
        const normalizedItemCat = normalizeCategory(category)
        const buyer = profiles.find(p => {
            if (!p.tarefa_padrao) return false
            const buyerCats = p.tarefa_padrao.split(',').map((x: string) => normalizeCategory(x))
            return buyerCats.includes(normalizedItemCat)
        })
        return buyer ? buyer.id : null
    }

    const [autoAssigning, setAutoAssigning] = useState(false)

    const handleAutoAssignAllUnassigned = async () => {
        setAutoAssigning(true)
        try {
            // Buscar no Supabase TODAS as solicitações sem comprador (independente de estarem pendentes ou já compradas)
            const { data: unassignedData, error: errFetch } = await supabase
                .from('pedidos_compra')
                .select('id, item_id, item_ata_id, categoria, observacoes')
                .is('assigned_to', null)

            if (errFetch) throw errFetch

            if (!unassignedData || unassignedData.length === 0) {
                toast.info('Não há solicitações sem comprador para atribuir.')
                return
            }

            let updatedCount = 0
            for (const p of unassignedData) {
                const cat = getItemCategoria(p as any)
                const buyerId = findBuyerForCategoryLocally(cat)
                if (buyerId) {
                    const { error } = await supabase
                        .from('pedidos_compra')
                        .update({ assigned_to: buyerId })
                        .eq('id', p.id)
                    if (!error) updatedCount++
                }
            }

            if (updatedCount > 0) {
                toast.success(`Sucesso! ${updatedCount} solicitações sem comprador foram atribuídas automaticamente aos seus respectivos compradores!`)
                fetchPedidos()
            } else {
                toast.warning(`Foram encontradas ${unassignedData.length} solicitações sem comprador, mas nenhuma categoria correspondeu às Tarefas Padrão da equipe.`)
            }
        } catch (err: any) {
            console.error(err)
            toast.error('Erro ao auto-atribuir solicitações: ' + err.message)
        } finally {
            setAutoAssigning(false)
        }
    }

    const toggleDesc = (id: number) => {
        setExpandedDescIds(prev => {
            const next = new Set(prev)
            if (next.has(id)) next.delete(id)
            else next.add(id)
            return next
        })
    }

    const comprasPerm = (profile?.cargo?.permissoes as any)?.compras || 'NONE'
    
    // Todos os usuários autenticados podem ver a página de compras
    const isAuthorized = !!profile
    
    // isManager controla quem tem nível gerencial/administrador
    const isManager = profile?.nivel === 'DEV' || profile?.nivel === 'ADM' || isAdmin || comprasPerm === 'MANAGER' || profile?.setor === 'DIRECAO'
    // Apenas usuários do setor de COMPRAS ou gestores nível DEV podem alterar dados
    const isReadOnly = profile?.nivel !== 'DEV' && profile?.setor !== 'COMPRAS'
    // Usuários de EMPENHOS ou VENDAS podem usar a Compra Livre
    const canCompraLivre = profile?.nivel === 'DEV' || profile?.setor === 'EMPENHOS' || profile?.setor === 'VENDAS' || profile?.setor === 'COMPRAS' || profile?.setor === 'VENDAS_PRIVADO' || profile?.setor === 'LICIT'
    const canManageTeam = profile?.nivel === 'DEV' || (profile?.nivel === 'ADM' && profile?.setor === 'COMPRAS')

    // Verificação auxiliar para identificar o usuário Aristóteles
    const isUserAristoteles = (userProfile: any) => {
        if (!userProfile) return false
        const name = String(userProfile.display_name || '').toLowerCase()
        const email = String(userProfile.email || '').toLowerCase()
        return name.includes('aristoteles') || name.includes('aristóteles') || email.includes('aristoteles') || email.includes('aristóteles')
    }

    // Verifica se um pedido de compra pertence a determinado usuário ou se ele é o gestor do empenho
    const isPedidoPertenceAoUsuario = (pedido: PedidoFull, userProfile: any) => {
        if (!userProfile) return false
        if (pedido.solicitante_id === userProfile.id) return true

        const usuarioSolicitante = String((pedido as any).usuario_solicitante || '').toLowerCase()
        const isAris = isUserAristoteles(userProfile)

        if (usuarioSolicitante && (usuarioSolicitante.includes('aristoteles') || usuarioSolicitante.includes('aristóteles'))) {
            if (isAris) return true
        }

        const assignedToItem = (pedido as any)?.item?.nota?.assigned_to || (pedido as any)?.assigned_to || (pedido as any)?.nota?.assigned_to
        if (assignedToItem === userProfile.id) return true

        if (isAris) {
            const respName = String((pedido as any)?.nota?.assigned_user?.display_name || '').toLowerCase()
            if (respName.includes('aristoteles') || respName.includes('aristóteles')) return true
            if (!pedido.solicitante_id) return true
        }

        return false
    }

    // Regra de permissão de edição de solicitação de compra
    const canEditPedidoCompra = (pedido: PedidoFull) => {
        if (isManager) return true
        if (pedido.status === 'CORRECAO' && isPedidoPertenceAoUsuario(pedido, profile)) return true
        // Permissão provisória concedida para o usuário Aristóteles editar as solicitações de compra dele
        if (isUserAristoteles(profile) && isPedidoPertenceAoUsuario(pedido, profile)) return true
        return false
    }

    const renderMiniStepper = (status: string) => {
        if (status === 'FALHA') {
            return (
                <Badge 
                    variant="destructive"
                    className="text-[9px] font-bold py-1 px-2.5 uppercase border shadow-sm shrink-0 ml-auto"
                >
                    Falha na Compra
                </Badge>
            )
        }

        const steps = [
            { label: 'Pendente', val: 'PENDENTE' },
            { label: 'Cotação', val: 'COTACAO' },
            { label: 'Comprado', val: 'COMPRADO' }
        ]

        const getStatusIndex = (s: string) => {
            if (s === 'COTACAO') return 1
            if (s === 'COMPRADO' || s === 'ATENDIDO' || s === 'EM_ESTOQUE') return 2
            return 0
        }

        const currentIndex = getStatusIndex(status)

        return (
            <div className="flex items-center gap-1.5 py-1 px-2.5 bg-zinc-50 dark:bg-zinc-900/40 border border-zinc-200 dark:border-zinc-800 rounded-md shrink-0 select-none ml-auto">
                {steps.map((step, idx) => {
                    const isCompleted = idx < currentIndex || (idx === 2 && (status === 'ATENDIDO' || status === 'EM_ESTOQUE'))
                    const isActive = idx === currentIndex && status !== 'ATENDIDO' && status !== 'EM_ESTOQUE'
                    const isFinished = (status === 'ATENDIDO' || status === 'EM_ESTOQUE') && idx === 2

                    return (
                        <Fragment key={step.val}>
                            <div className="flex items-center gap-1">
                                <div 
                                    className={cn(
                                        "w-3.5 h-3.5 rounded-full flex items-center justify-center text-[7px] font-black transition-all duration-300",
                                        isCompleted || isFinished
                                            ? "bg-emerald-500 text-white"
                                            : isActive
                                            ? "bg-brand-accent text-white ring-2 ring-brand-accent/20"
                                            : "bg-zinc-200 dark:bg-zinc-800 text-zinc-500 dark:text-zinc-400"
                                    )}
                                >
                                    {(isCompleted || isFinished) ? "✓" : idx + 1}
                                </div>
                                <span 
                                    className={cn(
                                        "text-[9px] font-bold tracking-tight transition-all duration-300",
                                        isActive
                                            ? "text-brand-accent font-black"
                                            : isCompleted || isFinished
                                            ? "text-emerald-600 dark:text-emerald-450"
                                            : "text-zinc-400 dark:text-zinc-500"
                                    )}
                                >
                                    {step.label}
                                </span>
                            </div>
                            {idx < steps.length - 1 && (
                                <div className="w-4 h-[1.5px] bg-zinc-200 dark:bg-zinc-800 rounded-full overflow-hidden">
                                    <div 
                                        className="h-full bg-emerald-500 transition-all duration-300" 
                                        style={{ width: idx < currentIndex ? '100%' : '0%' }}
                                    />
                                </div>
                            )}
                        </Fragment>
                    )
                })}
            </div>
        )
    }
    


    useEffect(() => {
        const checkCutoff = () => {
            const now = new Date()
            const cutoff = getNextCutoff(now)
            setNextCutoffDate(prev => prev.getTime() === cutoff.getTime() ? prev : cutoff)
        }
        checkCutoff()
        const interval = setInterval(checkCutoff, 60000)
        return () => clearInterval(interval)
    }, [])

    // Detecção automática de categoria por palavras-chave
    const detectarCategoria = (descricao: string): string => {
        const d = descricao.toUpperCase()
        if (/DIETA|SUPLEMENTO|NUTRICIONAL|FÓRMULA INFANTIL|FORMULA INFANTIL|ENTERAL|NUTREN|SUPPORT|SUSTAGEN/.test(d)) return 'DIETA'
        if (/MEDIC|COMPRIMIDO|CÁPSULA|CAPSULA|AMPOLA|INJETÁVEL|INJETAVEL|FRASCO AMPOLA|SULFATO|CLORIDRATO|DICLOFENACO|IBUPROFENO|DIPIRONA|CETOPROFENO|AMOXICILINA|AZITROMICINA|OMEPRAZOL|INSULINA|SORO GLICOSADO|SORO FISIOLÓG|ANTIBIÓTICO|ANTIBIOTIC|ANALGÉSICO/.test(d)) return 'MEDICAMENTO'
        if (/ODONTO|DENTAL|DENTÁRIO|DENTARIO|ORTODON|PASTA DENTAL|BROCA DENTAL|CIMENTO DENTÁRIO|SUGADOR|ENDODON|EXTRATOR|ESPELHO CLÍNICO|ESPELHO BUCAL/.test(d)) return 'ODONTO'
        if (/COMPRESSA|GAUZ|CATETER|SERINGA|LUVA CIRÚRG|LUVA LATEX|MÁSCARA CIRÚRG|MASCARA CIRURG|BANDAGEM|ESPARADRAPO|MICROPORE|EQUIPO|CÂNULA|CANULA|ATADURA|SONDA|CURATIVO|LANCETA|FITA GLICEMIA|ALGODÃO HIDRÓF|ALGODAO HIDROF|MATERIAL HOSP|MAT HOSP|AGULHA|BISTURI/.test(d)) return 'MATERIAL HOSPITALAR'
        if (/CADEIRA|MESA |ARMÁRIO|ARMARIO|ESTANTE|SOFÁ|SOFA|BANCADA|PRATELEIRA|POLTRONA|MACA |LEITO |CAMA HOSPITALAR|MOBILIÁRIO|MOBILIARIO|ARQUIVO DE AÇO|ARQUIVO METAL|GUARDA-ROUPA/.test(d)) return 'MOBILIÁRIO'
        if (/COMPUTADOR|MONITOR|IMPRESSORA|TECLADO|MOUSE |NOBREAK|TABLET|SWITCH|ROTEADOR|NOTEBOOK|PROJETOR|WEBCAM|HD EXTERNO|SCANNER|CABO DE REDE|RACK/.test(d)) return 'ELETRÔNICO'
        return 'MATERIAL HOSPITALAR' // fallback
    }

    const getProdutoCatalogo = (pedido: PedidoFull) => {
        if (pedido.produto_catalogo_id && (pedido as any).produto_catalogo) return (pedido as any).produto_catalogo
        if (pedido.item?.produto_catalogo_id && (pedido as any).item?.produto_catalogo) return (pedido as any).item.produto_catalogo
        if (pedido.item_ata?.produto_catalogo_id && (pedido as any).item_ata?.produto_catalogo) return (pedido as any).item_ata.produto_catalogo
        return null
    }

    const getItemDesc = (pedido: PedidoFull) => {
        const prod = getProdutoCatalogo(pedido)
        if (prod) return prod.descricao_completa
        if (pedido.item?.descricao) return pedido.item.descricao
        if (pedido.item_ata?.descricao) return pedido.item_ata.descricao
        if ((pedido as any).item_descricao_legado) return (pedido as any).item_descricao_legado
        const obs = parseObservacoes(pedido.observacoes)
        if (obs?.tipo === 'COMPRA_LIVRE' && obs?.descricao) return obs.descricao
        return 'DESCRIÇÃO NÃO ENCONTRADA'
    }

    const getItemUnidade = (pedido: PedidoFull) => {
        const obs = parseObservacoes(pedido.observacoes)
        if (obs?.unidade) return obs.unidade
        const prod = getProdutoCatalogo(pedido)
        if (prod && prod.unidade_venda) return prod.unidade_venda
        if (pedido.item?.unidade) return pedido.item.unidade
        if (pedido.item_ata?.unidade) return pedido.item_ata.unidade
        return 'UN'
    }

    const getItemCategoria = (pedido: PedidoFull) => {
        // 1. Prioridade máxima: coluna 'categoria' da própria solicitação de compra (onde gravamos a seleção manual do usuário)
        if (pedido.categoria) return normalizeCategory(pedido.categoria)

        // 2. Categoria da solicitação de Compra Livre legada (obs.categoria)
        const obs = parseObservacoes(pedido.observacoes)
        if (obs?.tipo === 'COMPRA_LIVRE' && obs?.categoria) return normalizeCategory(obs.categoria)

        // 3. Fallback do catálogo de produtos (apenas em caso de dados legados sem categoria)
        const prod = getProdutoCatalogo(pedido)
        if (prod && prod.grupo) return normalizeCategory(prod.grupo)

        // Planilha / Itens importados de empenhos completamente desativados para evitar categorias automáticas incorretas
        return 'MATERIAL HOSPITALAR'
    }

    const getItemValorUnitario = (pedido: PedidoFull) => {
        if (pedido.item?.valor_unitario) return pedido.item.valor_unitario
        if (pedido.item_ata?.valor_unitario) return pedido.item_ata.valor_unitario
        const obs = parseObservacoes(pedido.observacoes)
        if (obs?.tipo === 'COMPRA_LIVRE' && obs?.valor_unitario) return Number(obs.valor_unitario)
        return 0
    }

    const getPedidoOrigem = (pedido: PedidoFull) => {
        if (pedido.item_id) {
            return `NE: ${pedido.item?.nota?.numero_ne || '—'}`
        }
        if (pedido.item_ata_id) {
            return `ARP: ${pedido.item_ata?.ata?.numero_arp || '—'}`
        }
        const obs = parseObservacoes(pedido.observacoes)
        if (obs?.tipo === 'COMPRA_LIVRE') {
            return `${obs.tipo_documento || 'DOCUMENTO'}: ${obs.documento_origem || '—'}`
        }
        return '—'
    }

    const getPedidoCliente = (pedido: PedidoFull) => {
        if (pedido.item_id) {
            return pedido.item?.nota?.emissor || '—'
        }
        if (pedido.item_ata_id) {
            return pedido.item_ata?.ata?.entidade_gerenciadora || '—'
        }
        const obs = parseObservacoes(pedido.observacoes)
        if (obs?.tipo === 'COMPRA_LIVRE') {
            return obs.orgao_solicitante || '—'
        }
        return '—'
    }

    const parseObservacoes = (obsText: string | null) => {
        if (!obsText) return null
        if (obsText.startsWith('{')) {
            try {
                return JSON.parse(obsText)
            } catch (e) {
                return null
            }
        }
        return null
    }

    const formatDisplayDate = (dateStr: string | null | undefined): string => {
        if (!dateStr) return '—'
        if (/^\d{2}\/\d{2}\/\d{4}$/.test(dateStr)) return dateStr
        const parts = dateStr.split('-')
        if (parts.length === 3) {
            const [year, month, day] = parts
            const cleanDay = day.split('T')[0].split(' ')[0]
            return `${cleanDay}/${month}/${year}`
        }
        return dateStr
    }

    const formatDisplayDateTime = (dateStr: string | null | undefined): string => {
        if (!dateStr) return '—'
        try {
            const date = new Date(dateStr)
            if (isNaN(date.getTime())) return dateStr
            const day = String(date.getDate()).padStart(2, '0')
            const month = String(date.getMonth() + 1).padStart(2, '0')
            const year = date.getFullYear()
            const hours = String(date.getHours()).padStart(2, '0')
            const minutes = String(date.getMinutes()).padStart(2, '0')
            return `${day}/${month}/${year} ${hours}:${minutes}`
        } catch {
            return dateStr
        }
    }

    const getPedidoDetails = (pedido: PedidoFull) => {
        const obs = parseObservacoes(pedido.observacoes)
        if (obs) {
            if (obs.tipo === 'COMPRA_LIVRE') {
                return {
                    marca: obs.marca || null,
                    observacao: obs.obs_adicional || null,
                    justificativa: obs.justificativa || null
                }
            }
            return {
                marca: obs.marca || null,
                observacao: obs.observacao || null,
                justificativa: obs.justificativa || null
            }
        }
        return {
            marca: null,
            observacao: pedido.observacoes || null,
            justificativa: null
        }
    }

    useEffect(() => {
        if (isAuthorized) {
            fetchPedidos()
            fetchProfiles()

            const channel = supabase
                .channel('pedidos_compra_realtime_changes')
                .on('postgres_changes', { event: '*', schema: 'public', table: 'pedidos_compra' }, () => {
                    fetchPedidos()
                })
                .subscribe()

            return () => {
                supabase.removeChannel(channel)
            }
        }
    }, [isAuthorized])

    useEffect(() => {
        setCurrentPage(1)
    }, [searchTerm, activeTab, filterStatus, filterAssignee, filterBatch])

    if (!isAuthorized && !loading) {
        return (
            <div className="h-[70vh] flex flex-col items-center justify-center text-center space-y-4 animate-in fade-in duration-500">
                <div className="w-20 h-20 bg-brand-accent/10 rounded-full flex items-center justify-center shadow-inner">
                    <Alert className="w-10 h-10 text-brand-accent animate-pulse" />
                </div>
                <div className="space-y-2">
                    <h2 className="text-2xl font-black text-zinc-900 dark:text-zinc-100 uppercase tracking-tighter">Acesso Restrito</h2>
                    <p className="text-zinc-500 max-w-xs text-sm">
                        Esta área é exclusiva para a <strong>Gestão de Compras</strong> e Diretoria. 
                        Suas credenciais atuais não permitem visualizar estas pendências.
                    </p>
                </div>
                <Button 
                    variant="outline" 
                    className="border-brand-accent text-brand-accent hover:bg-brand-accent/5"
                    onClick={() => navigate('/dashboard')}
                >
                    Voltar ao Início
                </Button>
            </div>
        )
    }

    async function fetchPedidos() {
        setLoading(true)
        const tStart = performance.now();
        try {
            const fetchAllPedidosData = async () => {
                let all: any[] = []
                let page = 0
                const pageSize = 1000
                let hasMore = true

                while (hasMore && page < 20) { // Paginação automática para até 20.000+ solicitações
                    let q = supabase.from('pedidos_compra')
                        .select('*')
                        .order('created_at', { ascending: false })
                        .range(page * pageSize, (page + 1) * pageSize - 1)

                    if (!isManager && comprasPerm === 'OPERATIONAL' && profile) {
                        q = q.or(`assigned_to.eq.${profile.id},solicitante_id.eq.${profile.id},status.eq.FALHA`)
                    }

                    const { data, error } = await q
                    if (error) return { data: all, error }
                    if (!data || data.length === 0) {
                        hasMore = false
                    } else {
                        all = all.concat(data)
                        if (data.length < pageSize) {
                            hasMore = false
                        } else {
                            page++
                        }
                    }
                }
                return { data: all, error: null }
            }

            const [resPedidos, resProfiles] = await Promise.all([
                fetchAllPedidosData(),
                supabase.from('profiles').select('id, display_name, email, setor')
            ])

            const { data: pedidosRaw, error: errPedidos } = resPedidos
            const { data: profilesRaw, error: errProfiles } = resProfiles

            console.log(`[PROFILING] Passo 1 took ${(performance.now() - tStart).toFixed(2)}ms`);
            const t2Start = performance.now();

            if (errPedidos) throw errPedidos
            if (errProfiles) console.error('Erro ao carregar perfis:', errProfiles)
            if (!pedidosRaw || pedidosRaw.length === 0) {
                setPedidos([])
                return
            }

            console.log('--- [PASSO 2] Buscando detalhes dos itens e empenhos em paralelo...')
            const itemIds = Array.from(new Set(pedidosRaw.map(p => p.item_id).filter(Boolean))) as number[]
            const itemAtaIds = Array.from(new Set(pedidosRaw.map(p => p.item_ata_id).filter(Boolean))) as number[]

            const [resItens, resItensAta] = await Promise.all([
                itemIds.length > 0
                    ? supabase
                        .from('itens')
                        .select(`
                            *,
                            nota:notas (
                                id,
                                numero_ne,
                                emissor,
                                arquivo_caminho,
                                ata_id,
                                e_notificacao,
                                arquivo_notificacao,
                                demanda_judicial,
                                arquivo_demanda_judicial
                            )
                        `)
                        .in('id', itemIds)
                    : Promise.resolve({ data: [], error: null }),
                itemAtaIds.length > 0
                    ? supabase
                        .from('itens_ata')
                        .select('*')
                        .in('id', itemAtaIds)
                    : Promise.resolve({ data: [], error: null })
            ])

            const { data: itensRaw, error: errItens } = resItens
            const { data: itensAtaRaw, error: errItensAta } = resItensAta

            console.log(`[PROFILING] Passo 2 took ${(performance.now() - t2Start).toFixed(2)}ms`);
            const t3Start = performance.now();

            if (errItens) throw errItens
            if (errItensAta) throw errItensAta

            console.log('--- [PASSO 3] Buscando Atas e Catálogo em paralelo...')
            const ataIdsFromEmpenhos = Array.from(new Set(itensRaw?.map(i => (i.nota as any)?.ata_id).filter(Boolean))) as string[]
            const ataIdsFromAtas = Array.from(new Set(itensAtaRaw?.map(i => i.ata_id).filter(Boolean))) as string[]
            const allAtaIds = Array.from(new Set([...ataIdsFromEmpenhos, ...ataIdsFromAtas]))

            const catalogoIds = Array.from(new Set([
                ...pedidosRaw.map(p => p.produto_catalogo_id),
                ...(itensRaw || []).map(i => i.produto_catalogo_id),
                ...(itensAtaRaw || []).map(i => i.produto_catalogo_id)
            ].filter(Boolean))) as number[]

            const [resAtas, resCatalogo] = await Promise.all([
                allAtaIds.length > 0
                    ? supabase.from('atas').select('id, numero_arp, valor_global, arquivo_caminho, entidade_gerenciadora').in('id', allAtaIds)
                    : Promise.resolve({ data: [], error: null }),
                catalogoIds.length > 0
                    ? supabase.from('catalogo_produtos').select('*').in('id', catalogoIds)
                    : Promise.resolve({ data: [], error: null })
            ])

            const { data: atasRaw, error: errAtas } = resAtas
            const { data: catalogoRaw, error: errCatalogo } = resCatalogo

            console.log(`[PROFILING] Passo 3 took ${(performance.now() - t3Start).toFixed(2)}ms`);
            const t4Start = performance.now();

            if (errAtas) console.error('Erro ao carregar atas:', errAtas)
            if (errCatalogo) throw errCatalogo

            console.log('--- [PASSO 4] Montando quebra-cabeça final...')
            const listaUnificada = pedidosRaw.map(p => {
                let itemFull: any = null
                let itemAtaFull: any = null

                if (p.item_id) {
                    itemFull = itensRaw?.find(i => i.id === p.item_id) || null
                    if (itemFull && itemFull.nota) {
                        const ataFull = atasRaw?.find(a => a.id === (itemFull.nota as any).ata_id)
                        // @ts-ignore
                        itemFull.nota.ata = ataFull || null
                    }
                    if (itemFull && itemFull.produto_catalogo_id) {
                        itemFull.produto_catalogo = catalogoRaw?.find(c => c.id === itemFull.produto_catalogo_id) || null
                    }
                } else if (p.item_ata_id) {
                    const ataItem = itensAtaRaw?.find(i => i.id === p.item_ata_id)
                    if (ataItem) {
                        const ataFull = atasRaw?.find(a => a.id === ataItem.ata_id)
                        itemAtaFull = {
                            ...ataItem,
                            ata: ataFull || null
                        }
                    }
                    if (itemAtaFull && itemAtaFull.produto_catalogo_id) {
                        itemAtaFull.produto_catalogo = catalogoRaw?.find(c => c.id === itemAtaFull.produto_catalogo_id) || null
                    }
                }

                const assignedProf = profilesRaw?.find(prof => prof.id === p.assigned_to)
                let solicitanteProf = profilesRaw?.find(prof => prof.id === (p as any).solicitante_id)
                if (!solicitanteProf && p.usuario_solicitante) {
                    solicitanteProf = profilesRaw?.find(prof => 
                        prof.email?.toLowerCase() === p.usuario_solicitante?.toLowerCase() || 
                        prof.display_name?.toLowerCase() === p.usuario_solicitante?.toLowerCase()
                    )
                }

                const produto_catalogo = catalogoRaw?.find(c => c.id === p.produto_catalogo_id) || null

                return {
                    ...p,
                    item: itemFull,
                    item_ata: itemAtaFull,
                    assigned_profile: assignedProf || null,
                    solicitante_profile: solicitanteProf || null,
                    produto_catalogo
                }
            }).sort((a, b) => {
                const dataA = a.prazo_limite ? new Date(a.prazo_limite).getTime() : Infinity
                const dataB = b.prazo_limite ? new Date(b.prazo_limite).getTime() : Infinity
                return dataA - dataB
            })

            console.log(`[PROFILING] Passo 4 took ${(performance.now() - t4Start).toFixed(2)}ms`);
            console.log(`[PROFILING] TOTAL fetchPedidos took ${(performance.now() - tStart).toFixed(2)}ms`);
            console.log('--- [FINAL] Interface pronta com Atas/Empenhos.')
            setPedidos(listaUnificada as unknown as PedidoFull[])
        } catch (err: any) {
            console.error('CRITICAL ERROR ModuloCompras:', err)
            const message = err.message || String(err)
            toast.error(`Erro de Sincronização: ${message}`)
        } finally {
            setLoading(false)
        }
    }

    async function fetchProfiles() {
        const { data } = await supabase.from('profiles').select('*').eq('setor', 'COMPRAS')
        if (data) setProfiles(data as Tables<'profiles'>[])
    }

    async function assignPedido(pedidoId: number, profileId: string | null) {
        try {
            const { error } = await supabase
                .from('pedidos_compra')
                .update({ assigned_to: profileId })
                .eq('id', pedidoId)
            
            if (error) throw error
            toast.success('Atribuição atualizada com sucesso!')
            fetchPedidos()
        } catch (err) {
            toast.error('Erro ao atualizar atribuição do pedido')
        }
    }

    const handleOpenReassignModal = (pedido: PedidoFull | null, bulkIds: number[] | null, targetProfileId: string) => {
        const targetBuyer = profiles.find(p => p.id === targetProfileId)
        let initialCat = ''
        
        if (pedido) {
            initialCat = getItemCategoria(pedido)
        } else if (bulkIds && bulkIds.length > 0) {
            const firstPed = pedidos.find(p => p.id === bulkIds[0])
            if (firstPed) initialCat = getItemCategoria(firstPed)
        }

        if (targetBuyer?.tarefa_padrao) {
            const buyerCats = targetBuyer.tarefa_padrao.split(',').map((x: string) => normalizeCategory(x))
            if (buyerCats.length > 0 && !buyerCats.includes(normalizeCategory(initialCat))) {
                initialCat = buyerCats[0]
            }
        }
        if (!initialCat) initialCat = 'MATERIAL HOSPITALAR'

        setReassignPedido(pedido)
        setReassignBulkIds(bulkIds)
        setReassignBuyerId(targetProfileId)
        setReassignCategory(normalizeCategory(initialCat))
        setReassignModalOpen(true)
    }

    const handleConfirmReassign = async () => {
        if (!reassignBuyerId) {
            toast.error('Selecione o comprador responsável.')
            return
        }
        if (!reassignCategory) {
            toast.error('Selecione a nova categoria obrigatória para a solicitação.')
            return
        }

        const buyer = profiles.find(p => p.id === reassignBuyerId)
        setReassignLoading(true)

        try {
            const updates = {
                assigned_to: reassignBuyerId,
                categoria: reassignCategory
            }

            if (reassignPedido) {
                const { error } = await supabase
                    .from('pedidos_compra')
                    .update(updates)
                    .eq('id', reassignPedido.id)

                if (error) throw error

                await logAction('ATRIBUIR_COMPRADOR', 'pedidos_compra', reassignPedido.id, {
                    pedido_id: reassignPedido.id,
                    novo_comprador_id: reassignBuyerId,
                    comprador_nome: buyer?.display_name || 'Comprador',
                    nova_categoria: reassignCategory,
                    alterado_por: profile?.email
                })

                toast.success('Responsável e categoria da solicitação atualizados com sucesso!')
            } else if (reassignBulkIds && reassignBulkIds.length > 0) {
                const { error } = await supabase
                    .from('pedidos_compra')
                    .update(updates)
                    .in('id', reassignBulkIds)

                if (error) throw error

                await logAction('ATRIBUIR_COMPRADOR_LOTE', 'pedidos_compra', null, {
                    pedido_ids: reassignBulkIds,
                    novo_comprador_id: reassignBuyerId,
                    comprador_nome: buyer?.display_name || 'Comprador',
                    nova_categoria: reassignCategory,
                    quantidade_pedidos: reassignBulkIds.length,
                    alterado_por: profile?.email
                })

                toast.success(`${reassignBulkIds.length} solicitações reatribuídas em lote com sucesso!`)
            }

            setReassignModalOpen(false)
            setReassignPedido(null)
            setReassignBulkIds(null)
            setReassignBuyerId(null)
            setReassignCategory('')
            fetchPedidos()
        } catch (err: any) {
            toast.error('Erro ao reatribuir solicitação: ' + err.message)
        } finally {
            setReassignLoading(false)
        }
    }

    async function updateStatus(pedido: PedidoFull, newStatus: string) {
        try {
            const obs = parseObservacoes(pedido.observacoes)
            let newObservacoes = pedido.observacoes
            
            if (obs) {
                const { justificativa, falta_industria, carta_industria_caminho, ...cleanObs } = obs
                newObservacoes = Object.keys(cleanObs).length > 0 ? JSON.stringify(cleanObs) : null
            }

            // Atualização otimista local
            setPedidos(prev => prev.map(p => p.id === pedido.id ? { ...p, status: newStatus, observacoes: newObservacoes } : p))

            const { error } = await supabase
                .from('pedidos_compra')
                .update({ status: newStatus, observacoes: newObservacoes })
                .eq('id', pedido.id)
            
            if (error) throw error

            await logAction('ALTERAR_STATUS_SOLICITACAO', 'pedidos_compra', pedido.id, {
                pedido_id: pedido.id,
                status_anterior: pedido.status,
                novo_status: newStatus,
                item_descricao: getItemDesc(pedido),
                solicitante: pedido.usuario_solicitante,
                alterado_por: profile?.email
            })

            toast.success('Status do pedido atualizado!')
            fetchPedidos()
        } catch (err) {
            const message = err instanceof Error ? err.message : String(err)
            toast.error('Erro ao atualizar status: ' + message)
            fetchPedidos()
        }
    }

    const handleOpenRegistrarCompra = (pedido: PedidoFull) => {
        const details = getPedidoDetails(pedido)
        setRegistrarCompraPedido(pedido)
        setPrecoComprado(String(pedido.valor_unitario_comprado || getItemValorUnitario(pedido) || ''))
        setMarcaComprada(pedido.marca_comprada || details.marca || '')
        setPrazoChegada(pedido.prazo_estimado_chegada || '')
        setCompraTipo('COMPLETA')
        setQtdComprada(String(pedido.quantidade_solicitada || ''))
    }

    const handleConfirmarRegistroCompra = async () => {
        if (!registrarCompraPedido) return
        if (!precoComprado || Number(precoComprado) <= 0) {
            toast.error('Informe um preço unitário válido.')
            return
        }
        if (!marcaComprada.trim()) {
            toast.error('Informe a marca comprada.')
            return
        }
        if (!prazoChegada) {
            toast.error('Informe a data estimada de chegada.')
            return
        }

        const qtdSolicitada = registrarCompraPedido.quantidade_solicitada || 0
        const valorQtdComprada = Number(qtdComprada)

        if (compraTipo === 'PARCIAL') {
            if (isNaN(valorQtdComprada) || valorQtdComprada <= 0) {
                toast.error('Informe uma quantidade comprada válida.')
                return
            }
            if (valorQtdComprada >= qtdSolicitada) {
                toast.error('A quantidade da compra parcial deve ser menor que a quantidade solicitada.')
                return
            }
        }

        setRegistrandoCompraLoading(true)
        try {
            const finalQtdComprada = compraTipo === 'COMPLETA' ? qtdSolicitada : valorQtdComprada
            const remainingQtd = qtdSolicitada - finalQtdComprada

            const obs = parseObservacoes(registrarCompraPedido.observacoes) || {}
            const obsPayload = {
                ...obs,
                preco_compra: Number(precoComprado),
                marca_comprada: marcaComprada.trim(),
                prazo_chegada: prazoChegada,
                compra_tipo: compraTipo,
                quantidade_original: qtdSolicitada
            }

            // Atualização otimista local imediata
            setPedidos(prev => prev.map(p => p.id === registrarCompraPedido.id ? {
                ...p,
                status: 'COMPRADO',
                quantidade_solicitada: finalQtdComprada,
                valor_unitario_comprado: Number(precoComprado),
                marca_comprada: marcaComprada.trim(),
                prazo_estimado_chegada: prazoChegada,
                observacoes: JSON.stringify(obsPayload)
            } : p))

            // 1. Atualizar o pedido atual para COMPRADO com a quantidade comprada
            const { error: errUpdate } = await supabase
                .from('pedidos_compra')
                .update({
                    status: 'COMPRADO',
                    quantidade_solicitada: finalQtdComprada, // quantidade comprada nesta etapa
                    valor_unitario_comprado: Number(precoComprado),
                    marca_comprada: marcaComprada.trim(),
                    prazo_estimado_chegada: prazoChegada,
                    observacoes: JSON.stringify(obsPayload)
                })
                .eq('id', registrarCompraPedido.id)

            if (errUpdate) throw errUpdate

            await logAction('REGISTRAR_COMPRA_PEDIDO', 'pedidos_compra', registrarCompraPedido.id, {
                pedido_id: registrarCompraPedido.id,
                status_anterior: registrarCompraPedido.status,
                novo_status: 'COMPRADO',
                tipo_compra: compraTipo,
                preco: Number(precoComprado),
                marca: marcaComprada.trim(),
                prazo: prazoChegada,
                qtd_comprada: finalQtdComprada,
                qtd_restante: remainingQtd,
                item_descricao: getItemDesc(registrarCompraPedido),
                comprador: profile?.email
            })

            // 2. Se for parcial, criar um novo pedido PENDENTE com a quantidade restante
            if (compraTipo === 'PARCIAL' && remainingQtd > 0) {
                const obsRestante = {
                    ...obs,
                    pedido_origem_id: registrarCompraPedido.id,
                    justificativa: `Saldo restante de compra parcial (${finalQtdComprada}/${qtdSolicitada} compradas).`
                }
                
                const { error: errInsert } = await supabase
                    .from('pedidos_compra')
                    .insert([{
                        item_id: registrarCompraPedido.item_id,
                        item_ata_id: registrarCompraPedido.item_ata_id,
                        quantidade_solicitada: remainingQtd,
                        status: 'PENDENTE',
                        usuario_solicitante: registrarCompraPedido.usuario_solicitante,
                        solicitante_id: registrarCompraPedido.solicitante_id,
                        prazo_limite: registrarCompraPedido.prazo_limite,
                        categoria: registrarCompraPedido.categoria,
                        assigned_to: registrarCompraPedido.assigned_to,
                        produto_catalogo_id: registrarCompraPedido.produto_catalogo_id,
                        e_notificacao: registrarCompraPedido.e_notificacao,
                        arquivo_notificacao: registrarCompraPedido.arquivo_notificacao,
                        demanda_judicial: registrarCompraPedido.demanda_judicial,
                        arquivo_demanda_judicial: registrarCompraPedido.arquivo_demanda_judicial,
                        data_notificacao: registrarCompraPedido.data_notificacao,
                        observacoes: JSON.stringify(obsRestante)
                    }])

                if (errInsert) throw errInsert
            }

            toast.success(compraTipo === 'COMPLETA' ? 'Compra registrada com sucesso!' : `Compra parcial de ${finalQtdComprada} un registrada! Novo pedido de ${remainingQtd} un criado.`)
            setRegistrarCompraPedido(null)
            setPrecoComprado('')
            setMarcaComprada('')
            setPrazoChegada('')
            fetchPedidos()
        } catch (err: any) {
            console.error(err)
            toast.error('Erro ao registrar compra: ' + err.message)
        } finally {
            setRegistrandoCompraLoading(false)
        }
    }

    const handleStatusChange = (pedido: PedidoFull, newStatus: string) => {
        if (newStatus === 'FALHA') {
            setJustificarPedido(pedido)
            setJustificativaTexto('')
            setFaltaIndustria(false)
            setIndustriaFile(null)
        } else if (newStatus === 'COMPRADO') {
            handleOpenRegistrarCompra(pedido)
        } else if (newStatus === 'CORRECAO') {
            setErroPedido(pedido)
            setErroJustificativa('')
        } else {
            updateStatus(pedido, newStatus)
        }
    }

    const handleSaveJustificativa = async () => {
        if (!justificarPedido) return
        if (!justificativaTexto.trim()) {
            toast.error('Informe um texto de justificativa.')
            return
        }
        if (faltaIndustria && !industriaFile) {
            toast.error('Por favor, anexe a carta da indústria comprovando a falta.')
            return
        }

        setUploadingFile(true)
        try {
            let fileCaminho = null
            if (faltaIndustria && industriaFile) {
                const { path, error } = await uploadDocument(industriaFile)
                if (error) throw error
                fileCaminho = path
            }

            const existingObs = parseObservacoes(justificarPedido.observacoes) || {}
            const obsPayload = {
                ...existingObs,
                justificativa: justificativaTexto,
                falta_industria: faltaIndustria,
                carta_industria_caminho: fileCaminho
            }

            const stringified = JSON.stringify(obsPayload)

            const { error: errUpdate } = await supabase
                .from('pedidos_compra')
                .update({ 
                    status: 'FALHA',
                    observacoes: stringified
                })
                .eq('id', justificarPedido.id)

            if (errUpdate) throw errUpdate

            await logAction('JUSTIFICAR_FALHA_COMPRA', 'pedidos_compra', justificarPedido.id, {
                pedido_id: justificarPedido.id,
                justificativa: justificativaTexto,
                falta_industria: faltaIndustria,
                alterado_por: profile?.email
            })

            toast.success('Justificativa salva com sucesso!')
            setJustificarPedido(null)
            fetchPedidos()
        } catch (err: any) {
            console.error(err)
            toast.error('Erro ao salvar justificativa: ' + err.message)
        } finally {
            setUploadingFile(false)
        }
    }

    const handleSaveErroCadastro = async () => {
        if (!erroPedido) return
        if (!erroJustificativa.trim()) {
            toast.error('Informe o motivo do erro para correção.')
            return
        }
        setErroLoading(true)
        try {
            const existingObs = parseObservacoes(erroPedido.observacoes) || {}
            const obsPayload = {
                ...existingObs,
                motivo_quarentena: erroJustificativa.trim(),
                quarentenado_por: profile?.email || 'Compras',
                data_quarentena: new Date().toISOString()
            }
            const stringified = JSON.stringify(obsPayload)

            const { error: errUpdate } = await supabase
                .from('pedidos_compra')
                .update({ 
                    status: 'CORRECAO',
                    observacoes: stringified
                })
                .eq('id', erroPedido.id)

            if (errUpdate) throw errUpdate

            await logAction('ENVIAR_CORRECAO_QUARENTENA', 'pedidos_compra', erroPedido.id, {
                pedido_id: erroPedido.id,
                motivo: erroJustificativa.trim(),
                alterado_por: profile?.email
            })

            toast.success('Solicitação de compra enviada para a Quarentena!')
            setErroPedido(null)
            fetchPedidos()
        } catch (err: any) {
            toast.error('Erro ao enviar para quarentena: ' + err.message)
        } finally {
            setErroLoading(false)
        }
    }

    const handleCompraLivreDescricaoChange = (descricao: string) => {
        setCompraLivreForm(f => ({ ...f, descricao }))
        if (descricao.trim().length > 4) {
            setCompraLivreCategoria(detectarCategoria(descricao))
        }
    }

    const handleSubmitCompraLivre = async () => {
        const { descricao, documento_origem, tipo_documento, unidade, quantidade, valor_unitario, orgao_solicitante, prazo_dias, marca, obs_adicional, produto_catalogo_id } = compraLivreForm
        
        const isPrivateSeller = profile?.setor === 'VENDAS_PRIVADO'
        const finalTipoDoc = isPrivateSeller ? 'VENDA PRIVADA' : tipo_documento
        const isCompraDireta = finalTipoDoc === 'COMPRA DIRETA'
        const finalDocOrigem = isPrivateSeller ? 'PRIVADO' : (isCompraDireta ? (documento_origem.trim() || 'COMPRA DIRETA') : documento_origem)

        if (!descricao.trim()) { toast.error('Informe a descrição do item.'); return }
        if (!isPrivateSeller && !isCompraDireta && !documento_origem.trim()) { toast.error('Informe o documento de origem.'); return }
        if (!prazo_dias || prazo_dias <= 0) { toast.error('Informe um prazo em dias válido.'); return }
        if (quantidade <= 0) { toast.error('A quantidade deve ser maior que zero.'); return }
        
        // Validação de Notificação
        if (compraLivreENotificacao && !compraLivreNotificacaoFile && !editingCompraLivreId) {
            toast.error('Por favor, anexe o arquivo da notificação.');
            return
        }

        // Validação de Demanda Judicial
        if (compraLivreEDemandaJudicial && !compraLivreDemandaJudicialFile && !editingCompraLivreId) {
            toast.error('Por favor, anexe o arquivo comprobatório da demanda judicial.');
            return
        }

        setCompraLivreLoading(true)
        try {
            const { data: { user } } = await supabase.auth.getUser()

            // 1. Upload do arquivo de notificação se houver
            let fileCaminho = null
            if (compraLivreENotificacao && compraLivreNotificacaoFile) {
                const { path, error: uploadErr } = await uploadDocument(compraLivreNotificacaoFile)
                if (uploadErr) throw uploadErr
                fileCaminho = path
            }

            // 1b. Upload do arquivo de demanda judicial se houver
            let fileCaminhoJudicial = null
            if (compraLivreEDemandaJudicial && compraLivreDemandaJudicialFile) {
                const { path, error: uploadErr } = await uploadDocument(compraLivreDemandaJudicialFile)
                if (uploadErr) throw uploadErr
                fileCaminhoJudicial = path
            }

            // 1c. Upload da imagem se houver
            let fileCaminhoImagem = existingCompraLivreImagePath || null
            if (compraLivreImagem) {
                const { path, error: uploadErr } = await uploadDocument(compraLivreImagem)
                if (uploadErr) throw uploadErr
                fileCaminhoImagem = path
            }

            // 2. Localizar comprador responsável pela categoria para auto-atribuição
            const assignedToId = findBuyerForCategoryLocally(compraLivreCategoria)

            const obsPayload = {
                tipo: 'COMPRA_LIVRE',
                descricao: descricao.trim(),
                documento_origem: finalDocOrigem.trim(),
                tipo_documento: finalTipoDoc,
                unidade: unidade.trim().toUpperCase() || 'UN',
                valor_unitario: valor_unitario ? Number(valor_unitario) : null,
                orgao_solicitante: orgao_solicitante.trim() || null,
                marca: marca.trim() || null,
                obs_adicional: obs_adicional.trim() || null,
                categoria: compraLivreCategoria,
                e_notificacao: compraLivreENotificacao,
                arquivo_notificacao_caminho: fileCaminho,
                demanda_judicial: compraLivreEDemandaJudicial,
                arquivo_demanda_judicial_caminho: fileCaminhoJudicial,
                imagem_anexo: fileCaminhoImagem
            }

            const dataLimite = new Date()
            dataLimite.setDate(dataLimite.getDate() + prazo_dias)
            dataLimite.setHours(23, 59, 59, 0)

            if (editingCompraLivreId) {
                // Ao editar, preservamos os campos de notificação se não foram alterados
                const updates: any = {
                    quantidade_solicitada: quantidade,
                    prazo_limite: dataLimite.toISOString(),
                    observacoes: JSON.stringify(obsPayload),
                    solicitante_id: user?.id || null,
                    produto_catalogo_id: produto_catalogo_id || null,
                    categoria: compraLivreCategoria
                }
                if (compraLivreENotificacao) {
                    updates.e_notificacao = true
                    updates.data_notificacao = compraLivreDataNotificacao
                    if (fileCaminho) {
                        updates.arquivo_notificacao = fileCaminho
                    }
                } else {
                    updates.e_notificacao = false
                    updates.arquivo_notificacao = null
                    updates.data_notificacao = null
                }

                if (compraLivreEDemandaJudicial) {
                    updates.demanda_judicial = true
                    if (fileCaminhoJudicial) {
                        updates.arquivo_demanda_judicial = fileCaminhoJudicial
                    }
                } else {
                    updates.demanda_judicial = false
                    updates.arquivo_demanda_judicial = null
                }

                // Autoatribui se a categoria mudou, ou se não estiver atribuído
                const { data: currentPedido } = await supabase.from('pedidos_compra').select('categoria, assigned_to').eq('id', editingCompraLivreId).maybeSingle()
                if (currentPedido) {
                    const categoryChanged = currentPedido.categoria !== compraLivreCategoria
                    if ((!currentPedido.assigned_to || categoryChanged) && assignedToId) {
                        updates.assigned_to = assignedToId
                    }
                }

                const { error } = await supabase.from('pedidos_compra').update(updates).eq('id', editingCompraLivreId)
                if (error) throw error
                toast.success('Compra Livre atualizada com sucesso!')
            } else {
                const { error } = await supabase.from('pedidos_compra').insert([{
                    item_id: null,
                    item_ata_id: null,
                    quantidade_solicitada: quantidade,
                    status: 'PENDENTE',
                    prazo_limite: dataLimite.toISOString(),
                    solicitante_id: user?.id || null,
                    usuario_solicitante: user?.email || profile?.display_name || 'Sistema',
                    observacoes: JSON.stringify(obsPayload),
                    produto_catalogo_id: produto_catalogo_id || null,
                    // Novos campos
                    categoria: compraLivreCategoria,
                    assigned_to: assignedToId || null,
                    e_notificacao: compraLivreENotificacao,
                    arquivo_notificacao: fileCaminho || null,
                    data_notificacao: compraLivreENotificacao ? compraLivreDataNotificacao : null,
                    demanda_judicial: compraLivreEDemandaJudicial,
                    arquivo_demanda_judicial: fileCaminhoJudicial || null
                }])

                if (error) throw error
                toast.success('Compra Livre registrada com sucesso!')
            }

            setShowCompraLivre(false)
            setEditingCompraLivreId(null)
            setCompraLivreForm({ descricao: '', documento_origem: '', tipo_documento: 'EMPENHO', unidade: 'UN', quantidade: 1, valor_unitario: '', orgao_solicitante: '', prazo_dias: 5, marca: '', obs_adicional: '', produto_catalogo_id: null })
            setCompraLivreCategoria('MATERIAL HOSPITALAR')
            setCompraLivreENotificacao(false)
            setCompraLivreNotificacaoFile(null)
            setCompraLivreDataNotificacao(new Date().toISOString().split('T')[0])
            setCompraLivreEDemandaJudicial(false)
            setCompraLivreDemandaJudicialFile(null)
            setCompraLivreImagem(null)
            setCompraLivreImagemPreview(null)
            setExistingCompraLivreImagePath(null)
            fetchPedidos()
        } catch (err: any) {
            toast.error('Erro ao registrar Compra Livre: ' + err.message)
        } finally {
            setCompraLivreLoading(false)
        }
    }

    const handleConfirmNotificarPedido = async (e: React.FormEvent) => {
        e.preventDefault()
        if (!selectedPedidoParaNotificar) return
        if (!notificarData) {
            toast.error('A data da notificação é obrigatória.')
            return
        }
        if (!notificarFile) {
            toast.error('O documento da notificação é obrigatório.')
            return
        }

        try {
            setSubmittingNotificacao(true)
            toast.info('Enviando documento da notificação, por favor aguarde...')
            const { path, error: uploadErr } = await uploadDocument(notificarFile)
            if (uploadErr) throw uploadErr
            if (!path) throw new Error('Não foi possível fazer upload do comprovante.')

            const payload = {
                e_notificacao: true,
                arquivo_notificacao: path,
                data_notificacao: notificarData
            }

            const { error: dbErr } = await supabase
                .from('pedidos_compra')
                .update(payload)
                .eq('id', selectedPedidoParaNotificar.id)

            if (dbErr) throw dbErr

            await logAction('NOTIFICAR_PEDIDO_COMPRA', 'pedidos_compra', selectedPedidoParaNotificar.id, payload)
            toast.success('Solicitação marcada como notificada com sucesso!')
            
            setNotificarModalOpen(false)
            setNotificarFile(null)
            setSelectedPedidoParaNotificar(null)
            fetchPedidos()
        } catch (err: any) {
            toast.error('Erro ao marcar como notificada: ' + err.message)
        } finally {
            setSubmittingNotificacao(false)
        }
    }

    const handleOpenCorrigir = (pedido: PedidoFull) => {
        setCorrigirPedido(pedido)
        setCorrigirDescricao(getItemDesc(pedido))
        setCorrigirQuantidade(pedido.quantidade_solicitada || 1)
        setCorrigirUnidade(getItemUnidade(pedido))
        setCorrigirCategoria(pedido.categoria || 'MATERIAL HOSPITALAR')
        
        let dateStr = ''
        if (pedido.prazo_limite) {
            try {
                dateStr = new Date(pedido.prazo_limite).toISOString().split('T')[0]
            } catch (e) {
                // Ignore
            }
        }
        setCorrigirPrazo(dateStr)
        
        const details = getPedidoDetails(pedido)
        setCorrigirObs(details.observacao || '')
        setCorrigirJustificativa('')

        const obs = parseObservacoes(pedido.observacoes)
        if (obs?.imagem_anexo) {
            setCorrigirImagemPreview(getCleanPublicUrl(obs.imagem_anexo))
            setExistingCorrigirImagePath(obs.imagem_anexo)
        } else {
            setCorrigirImagemPreview(null)
            setExistingCorrigirImagePath(null)
        }
        setCorrigirImagem(null)
    }

    const handleSaveCorrigir = async () => {
        if (!corrigirPedido) return
        if (!corrigirJustificativa.trim()) {
            toast.error('Por favor, insira uma justificativa para a correção.')
            return
        }
        if (!corrigirDescricao.trim()) {
            toast.error('Por favor, insira a descrição do item.')
            return
        }
        
        setCorrigirLoading(true)
        try {
            const oldQty = corrigirPedido.quantidade_solicitada
            const oldUnidade = getItemUnidade(corrigirPedido)
            const oldCat = corrigirPedido.categoria
            const oldPrazo = corrigirPedido.prazo_limite
            const details = getPedidoDetails(corrigirPedido)
            const oldObs = details.observacao
            const oldDesc = getItemDesc(corrigirPedido)
            const descChanged = oldDesc !== corrigirDescricao.trim()
            const unidadeChanged = oldUnidade !== corrigirUnidade.trim()
            
            let fileCaminhoImagem = existingCorrigirImagePath || null
            if (corrigirImagem) {
                const { path, error: uploadErr } = await uploadDocument(corrigirImagem)
                if (uploadErr) throw uploadErr
                fileCaminhoImagem = path
            }

            if (descChanged) {
                if (corrigirPedido.item_id) {
                    const { error: itemErr } = await supabase
                        .from('itens')
                        .update({ 
                            descricao: corrigirDescricao.trim(),
                            produto_catalogo_id: null 
                        })
                        .eq('id', corrigirPedido.item_id)
                    if (itemErr) throw itemErr
                }
                if (corrigirPedido.item_ata_id) {
                    const { error: itemAtaErr } = await supabase
                        .from('itens_ata')
                        .update({ 
                            descricao: corrigirDescricao.trim(),
                            produto_catalogo_id: null 
                        })
                        .eq('id', corrigirPedido.item_ata_id)
                    if (itemAtaErr) throw itemAtaErr
                }
            }

            if (unidadeChanged) {
                if (corrigirPedido.item_id) {
                    await supabase
                        .from('itens')
                        .update({ unidade: corrigirUnidade.trim() })
                        .eq('id', corrigirPedido.item_id)
                }
                if (corrigirPedido.item_ata_id) {
                    await supabase
                        .from('itens_ata')
                        .update({ unidade: corrigirUnidade.trim() })
                        .eq('id', corrigirPedido.item_ata_id)
                }
            }

            let updatedObsText = ''
            const existingObs = parseObservacoes(corrigirPedido.observacoes)
            const correctionEntry: any = {
                justificativa: corrigirJustificativa.trim(),
                autor: profile?.email || 'Desconhecido',
                data: new Date().toISOString(),
                de_quantidade: oldQty,
                para_quantidade: corrigirQuantidade,
                de_categoria: oldCat,
                para_categoria: corrigirCategoria,
                de_prazo: oldPrazo,
                para_prazo: corrigirPrazo ? `${corrigirPrazo}T23:59:59` : null
            }
            if (descChanged) {
                correctionEntry.de_descricao = oldDesc
                correctionEntry.para_descricao = corrigirDescricao.trim()
            }
            if (unidadeChanged) {
                correctionEntry.de_unidade = oldUnidade
                correctionEntry.para_unidade = corrigirUnidade.trim()
            }
            
            if (existingObs) {
                const newObsObj = {
                    ...existingObs,
                    unidade: corrigirUnidade.trim(),
                    obs_adicional: corrigirObs,
                    imagem_anexo: fileCaminhoImagem,
                    historico_correcoes: [...(existingObs.historico_correcoes || []), correctionEntry]
                }
                if (descChanged && existingObs.tipo === 'COMPRA_LIVRE') {
                    newObsObj.descricao = corrigirDescricao.trim()
                }
                updatedObsText = JSON.stringify(newObsObj)
            } else {
                const newObsObj: any = {
                    unidade: corrigirUnidade.trim(),
                    observacao: corrigirObs,
                    imagem_anexo: fileCaminhoImagem,
                    historico_correcoes: [correctionEntry]
                }
                if (descChanged) {
                    newObsObj.descricao = corrigirDescricao.trim()
                }
                updatedObsText = JSON.stringify(newObsObj)
            }
            
            const categoryChanged = corrigirPedido.categoria !== corrigirCategoria
            const updates: any = {
                quantidade_solicitada: corrigirQuantidade,
                categoria: corrigirCategoria,
                prazo_limite: corrigirPrazo ? `${corrigirPrazo}T23:59:59` : null,
                observacoes: updatedObsText,
                status: 'PENDENTE'
            }

            if (descChanged && corrigirPedido.produto_catalogo_id) {
                updates.produto_catalogo_id = null
            }

            if (!corrigirPedido.assigned_to || categoryChanged) {
                updates.assigned_to = findBuyerForCategoryLocally(corrigirCategoria)
            }
            
            const { error } = await supabase
                .from('pedidos_compra')
                .update(updates)
                .eq('id', corrigirPedido.id)
                
            if (error) throw error
            
            await logAction('CORRECAO_PEDIDO', 'pedidos_compra', corrigirPedido.id, {
                pedido_id: corrigirPedido.id,
                justificativa: corrigirJustificativa.trim(),
                autor_email: profile?.email,
                alteracoes: {
                    quantidade_solicitada: { de: oldQty, para: corrigirQuantidade },
                    unidade: unidadeChanged ? { de: oldUnidade, para: corrigirUnidade.trim() } : undefined,
                    categoria: { de: oldCat, para: corrigirCategoria },
                    prazo_limite: { de: oldPrazo, para: corrigirPrazo ? `${corrigirPrazo}T23:59:59` : null },
                    observacoes: { de: oldObs, para: corrigirObs },
                    descricao: descChanged ? { de: oldDesc, para: corrigirDescricao.trim() } : undefined
                }
            })
            
            toast.success('Solicitação de compra corrigida com sucesso!')
            setCorrigirPedido(null)
            setCorrigirDescricao('')
            setCorrigirUnidade('')
            setCorrigirImagem(null)
            setCorrigirImagemPreview(null)
            setExistingCorrigirImagePath(null)
            fetchPedidos()
        } catch (err: any) {
            toast.error('Erro ao corrigir solicitação: ' + err.message)
        } finally {
            setCorrigirLoading(false)
        }
    }

    // Lista dinâmica de Vendedores / Solicitantes
    const vendedoresSolicitantesUnicos = useMemo(() => {
        const map = new Map<string, string>()
        pedidos.forEach(p => {
            if (p.solicitante_id) {
                const name = (p as any).usuario_solicitante || 'Solicitante ' + p.solicitante_id
                map.set(p.solicitante_id, name)
            } else if (p.usuario_solicitante) {
                map.set(p.usuario_solicitante, p.usuario_solicitante)
            }
        })
        return Array.from(map.entries()).map(([key, label]) => ({ key, label })).sort((a, b) => a.label.localeCompare(b.label))
    }, [pedidos])

    // Lista dinâmica de Municípios / Órgãos Solicitantes
    const municipiosOrgaosUnicos = useMemo(() => {
        const set = new Set<string>()
        pedidos.forEach(p => {
            const obs = parseObservacoes(p.observacoes)
            const org = obs?.orgao_solicitante || p.item?.nota?.emissor || p.item_ata?.ata?.entidade_gerenciadora
            if (org && org !== '—' && org.trim() !== '') {
                set.add(org.trim().toUpperCase())
            }
        })
        return Array.from(set).sort()
    }, [pedidos])

    // Solicitações elegíveis filtradas para o Anexo em Lote
    const pedidosElegiveisLote = useMemo(() => {
        return pedidos.filter(p => {
            // Filtro Vendedor
            if (anexoLoteVendedor !== 'ALL') {
                const solId = p.solicitante_id
                const userSol = String(p.usuario_solicitante || '').toLowerCase()
                const target = anexoLoteVendedor.toLowerCase()
                const matchesId = solId === anexoLoteVendedor
                const matchesName = userSol.includes(target)
                if (!matchesId && !matchesName) return false
            }
            // Filtro Município / Órgão
            if (anexoLoteMunicipio !== 'ALL') {
                const obs = parseObservacoes(p.observacoes)
                const org = String(obs?.orgao_solicitante || p.item?.nota?.emissor || p.item_ata?.ata?.entidade_gerenciadora || '').toUpperCase()
                if (!org.includes(anexoLoteMunicipio.toUpperCase())) return false
            }
            return true
        })
    }, [pedidos, anexoLoteVendedor, anexoLoteMunicipio])

    // Atualiza marcação de IDs selecionados quando abre o modal ou muda o filtro
    useEffect(() => {
        if (showAnexoLoteModal) {
            setAnexoLoteSelectedIds(new Set(pedidosElegiveisLote.map(p => p.id)))
        }
    }, [pedidosElegiveisLote, showAnexoLoteModal])

    // Execução do salvamento de Anexo Único em Lote (Vinculação em Massa)
    const handleSaveAnexoLote = async () => {
        if (!anexoLoteFile) {
            toast.error('Selecione o arquivo único do anexo.')
            return
        }
        if (anexoLoteSelectedIds.size === 0) {
            toast.error('Nenhuma solicitação de compra selecionada para vincular o anexo.')
            return
        }

        try {
            setAnexoLoteSubmitting(true)
            toast.info('Fazendo upload de 1 único arquivo no servidor...')

            // 1. Upload do ARQUIVO ÚNICO
            const { path, error: uploadErr } = await uploadDocument(anexoLoteFile)
            if (uploadErr) throw uploadErr
            if (!path) throw new Error('Erro ao salvar arquivo no servidor.')

            const selectedIdsArray = Array.from(anexoLoteSelectedIds)

            // 2. Atualização em Massa no Banco de Dados
            if (anexoLoteTipoDoc === 'NOTIFICACAO') {
                const { error: dbErr } = await supabase
                    .from('pedidos_compra')
                    .update({
                        e_notificacao: true,
                        arquivo_notificacao: path,
                        data_notificacao: anexoLoteDataNotificacao
                    })
                    .in('id', selectedIdsArray)

                if (dbErr) throw dbErr
            } else if (anexoLoteTipoDoc === 'DEMANDA_JUDICIAL') {
                const { error: dbErr } = await supabase
                    .from('pedidos_compra')
                    .update({
                        demanda_judicial: true,
                        arquivo_demanda_judicial: path
                    })
                    .in('id', selectedIdsArray)

                if (dbErr) throw dbErr
            } else {
                // Imagem ou Documento Técnico Geral
                const { data: currentPedidos } = await supabase
                    .from('pedidos_compra')
                    .select('id, observacoes')
                    .in('id', selectedIdsArray)

                if (currentPedidos) {
                    for (const item of currentPedidos) {
                        const obs = parseObservacoes(item.observacoes) || {}
                        obs.imagem_anexo = path
                        await supabase
                            .from('pedidos_compra')
                            .update({ observacoes: JSON.stringify(obs) })
                            .eq('id', item.id)
                    }
                }
            }

            // 3. Registro de auditoria
            await logAction('ANEXAR_LOTE_PEDIDOS_COMPRA', 'pedidos_compra', selectedIdsArray[0], {
                total_pedidos: selectedIdsArray.length,
                tipo_anexo: anexoLoteTipoDoc,
                caminho_arquivo: path,
                vendedor_filtro: anexoLoteVendedor,
                municipio_filtro: anexoLoteMunicipio
            })

            toast.success(`Arquivo único vinculado com sucesso a ${selectedIdsArray.length} solicitações de compra!`)
            setShowAnexoLoteModal(false)
            setAnexoLoteFile(null)
            fetchPedidos()
        } catch (err: any) {
            toast.error('Erro ao vincular anexo em lote: ' + err.message)
        } finally {
            setAnexoLoteSubmitting(false)
        }
    }

    const handleEditCompraLivre = (pedido: PedidoFull) => {
        const obs = parseObservacoes(pedido.observacoes)
        if (!obs || obs.tipo !== 'COMPRA_LIVRE') return

        const createdTime = (pedido as any).created_at ? new Date((pedido as any).created_at).getTime() : Date.now()
        const limitTime = pedido.prazo_limite ? new Date(pedido.prazo_limite).getTime() : Date.now()
        const diffDays = Math.max(1, Math.round((limitTime - createdTime) / (1000 * 60 * 60 * 24)))

        setCompraLivreForm({
            descricao: obs.descricao || '',
            documento_origem: obs.documento_origem || '',
            tipo_documento: obs.tipo_documento || 'EMPENHO',
            unidade: obs.unidade || 'UN',
            quantidade: pedido.quantidade_solicitada || 1,
            valor_unitario: obs.valor_unitario !== null && obs.valor_unitario !== undefined ? String(obs.valor_unitario) : '',
            orgao_solicitante: obs.orgao_solicitante || '',
            prazo_dias: diffDays,
            marca: obs.marca || '',
            obs_adicional: obs.obs_adicional || '',
            produto_catalogo_id: pedido.produto_catalogo_id || null
        })
        const prod = getProdutoCatalogo(pedido)
        setIsProductCategoryDefined(pedido.produto_catalogo_id !== null && !!prod && !!prod.grupo)
        setCompraLivreCategoria(pedido.categoria || obs.categoria || 'MATERIAL HOSPITALAR')
        setCompraLivreENotificacao(!!pedido.e_notificacao)
        setCompraLivreNotificacaoFile(null)
        setCompraLivreDataNotificacao(pedido.data_notificacao || new Date().toISOString().split('T')[0])
        setCompraLivreEDemandaJudicial(!!pedido.demanda_judicial)
        setCompraLivreDemandaJudicialFile(null)
        
        if (obs.imagem_anexo) {
            setCompraLivreImagemPreview(getCleanPublicUrl(obs.imagem_anexo))
            setExistingCompraLivreImagePath(obs.imagem_anexo)
        } else {
            setCompraLivreImagemPreview(null)
            setExistingCompraLivreImagePath(null)
        }
        setCompraLivreImagem(null)

        setEditingCompraLivreId(pedido.id)
        setShowCompraLivre(true)
    }

    const handleOpenExcluirModal = (pedido: PedidoFull) => {
        setExcluirPedido(pedido)
        setExcluirJustificativa('')
    }

    const handleConfirmarExclusao = async () => {
        if (!excluirPedido) return
        if (!excluirJustificativa.trim()) {
            toast.error('Informe a justificativa da exclusão.')
            return
        }

        setExcluirLoading(true)
        try {
            const pedido = excluirPedido

            // Se houver item_id, desmarca no banco para que o item volte a ficar disponível para solicitação
            if (pedido.item_id) {
                const { error: errItem } = await supabase
                    .from('itens')
                    .update({ marcado_compras: false })
                    .eq('id', pedido.item_id)
                if (errItem) {
                    console.error('Erro ao desmarcar item:', errItem)
                }
            }

            // Ao invés de deletar, atualiza o status para EXCLUIDO e salva os dados da exclusão
            const { error: errDel } = await supabase
                .from('pedidos_compra')
                .update({ 
                    status: 'EXCLUIDO',
                    justificativa_exclusao: excluirJustificativa.trim(),
                    excluido_por_nome: profile?.display_name || profile?.email || 'Usuário',
                    excluido_em: new Date().toISOString()
                })
                .eq('id', pedido.id)
            
            if (errDel) throw errDel

            const itemDesc = getItemDesc(pedido)

            // Registrar log de auditoria com a justificativa
            await logAction('EXCLUSAO_SOLICITACAO_PENDENTE', 'pedidos_compra', pedido.id, {
                pedido_id: pedido.id,
                item_id: pedido.item_id,
                item_ata_id: pedido.item_ata_id,
                item_descricao: itemDesc,
                quantidade_solicitada: pedido.quantidade_solicitada,
                usuario_solicitante: pedido.usuario_solicitante,
                justificativa: excluirJustificativa.trim(),
                autor_email: profile?.email
            })

            toast.success('Solicitação excluída com sucesso!')
            setExcluirPedido(null)
            setExcluirJustificativa('')
            fetchPedidos()
        } catch (err: any) {
            toast.error('Erro ao excluir solicitação: ' + err.message)
        } finally {
            setExcluirLoading(false)
        }
    }


    async function bulkAssignPedidos(pedidoIds: number[], profileId: string | null) {
        if (profileId) {
            const buyer = profiles.find(p => p.id === profileId)
            if (buyer) {
                const currentCategories = buyer.tarefa_padrao 
                    ? buyer.tarefa_padrao.split(',').map((s: string) => s.trim().toUpperCase()) 
                    : []
                const invalidPedidos = pedidos.filter(p => 
                    pedidoIds.includes(p.id) && 
                    !currentCategories.includes(getItemCategoria(p).toUpperCase())
                )
                if (invalidPedidos.length > 0) {
                    toast.error(`Comprador não autorizado: ${buyer.display_name || 'Comprador'} não atende algumas categorias selecionadas.`)
                    return
                }
            }
        }
        try {
            const { error } = await supabase
                .from('pedidos_compra')
                .update({ assigned_to: profileId })
                .in('id', pedidoIds)
            
            if (error) throw error

            const buyer = profiles.find(p => p.id === profileId)
            await logAction('ATRIBUIR_COMPRADOR', 'pedidos_compra', null, {
                pedido_ids: pedidoIds,
                novo_comprador_id: profileId,
                comprador_nome: buyer?.display_name || 'Comprador',
                quantidade_pedidos: pedidoIds.length,
                alterado_por: profile?.email
            })

            toast.success('Pedidos atribuídos em lote com sucesso!')
            fetchPedidos()
        } catch (err) {
            toast.error('Erro ao atribuir pedidos em lote')
        }
    }

    async function bulkUpdateStatus(pedidoIds: number[], newStatus: string) {
        try {
            const { error } = await supabase
                .from('pedidos_compra')
                .update({ status: newStatus })
                .in('id', pedidoIds)
            
            if (error) throw error

            await logAction('ALTERAR_STATUS_EM_MASSA', 'pedidos_compra', null, {
                pedido_ids: pedidoIds,
                novo_status: newStatus,
                quantidade_pedidos: pedidoIds.length,
                alterado_por: profile?.email
            })

            toast.success('Status dos pedidos atualizados em lote!')
            fetchPedidos()
        } catch (err) {
            const message = err instanceof Error ? err.message : String(err)
            toast.error('Erro ao atualizar status em lote: ' + message)
        }
    }

    const handleVerDocumento = (caminho?: string | null) => {
        if (!caminho) {
            toast.error('PDF original não disponível para este item.')
            return
        }
        
        const url = getCleanPublicUrl(caminho)
        window.open(url, '_blank')
    }

    const filteredPedidos = useMemo(() => {
        const result = pedidos.filter(p => {
            const desc = (getItemDesc(p) || '').toLowerCase()
            const ne = (p.item?.nota?.numero_ne || '').toLowerCase()
            const empenho = (p.item?.nota?.numero_empenho || '').toLowerCase()
            const arp = (p.item_ata?.ata?.numero_arp || (p.item?.nota as any)?.ata?.numero_arp || '').toLowerCase()
            const obs = parseObservacoes(p.observacoes)
            const docOrigem = (obs?.documento_origem || '').toLowerCase()
            const docTipo = (obs?.tipo_documento || '').toLowerCase()
            const cliente = (getPedidoCliente(p) || '').toLowerCase()
            const solicitante = (p.solicitante_profile?.display_name || p.solicitante_profile?.email || '').toLowerCase()
            
            const term = searchTerm.toLowerCase().trim()
            const matchesSearch = 
                desc.includes(term) || 
                ne.includes(term) ||
                empenho.includes(term) ||
                arp.includes(term) ||
                docOrigem.includes(term) ||
                docTipo.includes(term) ||
                cliente.includes(term) ||
                solicitante.includes(term)
            
            const cat = getItemCategoria(p)
            const isPrioritario = p.e_notificacao || p.demanda_judicial || !!p.item?.nota?.e_notificacao || !!p.item?.nota?.demanda_judicial
            const isCategoryMatch = activeTab === 'QUARENTENA' ||
                                   activeTab === 'TUDO' || 
                                   activeTab === 'CONSOLIDADO' || 
                                   (activeTab === 'PRIORIDADE' && isPrioritario) ||
                                   cat === activeTab

            const isUserFilterMatch = !filterMyRequests || (p as any).solicitante_id === profileId

            const matchesAssignee = filterAssignee === 'ALL' || 
                                    (filterAssignee === 'UNASSIGNED' && !p.assigned_to) || 
                                    p.assigned_to === filterAssignee

            const matchesBatch = filterBatch === 'ALL' || 
                                 (filterBatch === 'CURRENT' && getBatchStatus(p, nextCutoffDate) === 'CURRENT') ||
                                 (filterBatch === 'CLOSED' && getBatchStatus(p, nextCutoffDate) === 'CLOSED')

            const getMappedStatus = (s: string | null) => {
                const upper = (s || '').toUpperCase()
                if (upper === 'PENDENTE' || upper === 'AGUARDANDO' || upper === '') return 'PENDENTE'
                return upper
            }
            const itemStatus = getMappedStatus(p.status)

            // Controle de exibição para solicitações excluídas
            if (itemStatus === 'EXCLUIDO' && filterStatus !== 'EXCLUIDO') return false
            if (itemStatus !== 'EXCLUIDO' && filterStatus === 'EXCLUIDO') return false

            // Filtro específico para o setor de Recebimento (apenas itens COMPRADOS)
            if (profileSetor === 'RECEBIMENTO') {
                if (itemStatus !== 'COMPRADO') return false
            }

            // Filtro específico para a quarentena
            if (activeTab === 'QUARENTENA') {
                if (itemStatus !== 'CORRECAO') return false
                const isComprasUser = profileNivel === 'DEV' || profileNivel === 'ADM' || profileSetor === 'COMPRAS'
                if (!isComprasUser && p.solicitante_id !== profileId) return false
            } else {
                // Ocultar itens sob correção de todas as outras abas normais de compra
                if (itemStatus === 'CORRECAO') return false
            }

            const matchesStatus = filterStatus === 'ALL' ||
                                  (filterStatus === 'NORMAL' && itemStatus !== 'FALHA') ||
                                  (filterStatus === 'PENDENTE' && itemStatus === 'PENDENTE') ||
                                  (filterStatus === 'COTACAO' && itemStatus === 'COTACAO') ||
                                  (filterStatus === 'FALHA' && itemStatus === 'FALHA') ||
                                  (filterStatus === 'ATENDIDO' && (itemStatus === 'ATENDIDO' || itemStatus === 'EM_ESTOQUE')) ||
                                  (filterStatus === 'COMPRADO' && itemStatus === 'COMPRADO') ||
                                  (filterStatus === 'EXCLUIDO' && itemStatus === 'EXCLUIDO')

            return matchesSearch && isCategoryMatch && isUserFilterMatch && matchesAssignee && matchesBatch && matchesStatus
        })

        if (sortBy === 'DEFAULT') return result

        return [...result].sort((a, b) => {
            if (sortBy === 'CREATED_DESC') {
                const tA = a.created_at ? new Date(a.created_at).getTime() : 0
                const tB = b.created_at ? new Date(b.created_at).getTime() : 0
                return tB - tA
            }
            if (sortBy === 'CREATED_ASC') {
                const tA = a.created_at ? new Date(a.created_at).getTime() : 0
                const tB = b.created_at ? new Date(b.created_at).getTime() : 0
                return tA - tB
            }
            if (sortBy === 'PRAZO_ASC') {
                const tA = a.prazo_limite ? new Date(a.prazo_limite).getTime() : Infinity
                const tB = b.prazo_limite ? new Date(b.prazo_limite).getTime() : Infinity
                return tA - tB
            }
            if (sortBy === 'PRAZO_DESC') {
                const tA = a.prazo_limite ? new Date(a.prazo_limite).getTime() : -Infinity
                const tB = b.prazo_limite ? new Date(b.prazo_limite).getTime() : -Infinity
                return tB - tA
            }
            if (sortBy === 'ENTREGA_ASC') {
                const obsA = parseObservacoes(a.observacoes)
                const obsB = parseObservacoes(b.observacoes)
                const dateAStr = a.prazo_estimado_chegada || obsA?.prazo_chegada
                const dateBStr = b.prazo_estimado_chegada || obsB?.prazo_chegada
                const tA = dateAStr ? new Date(dateAStr).getTime() : Infinity
                const tB = dateBStr ? new Date(dateBStr).getTime() : Infinity
                return tA - tB
            }
            if (sortBy === 'ENTREGA_DESC') {
                const obsA = parseObservacoes(a.observacoes)
                const obsB = parseObservacoes(b.observacoes)
                const dateAStr = a.prazo_estimado_chegada || obsA?.prazo_chegada
                const dateBStr = b.prazo_estimado_chegada || obsB?.prazo_chegada
                const tA = dateAStr ? new Date(dateAStr).getTime() : -Infinity
                const tB = dateBStr ? new Date(dateBStr).getTime() : -Infinity
                return tB - tA
            }
            return 0
        })
    }, [pedidos, searchTerm, activeTab, profileId, profileSetor, profileNivel, filterAssignee, filterBatch, filterStatus, nextCutoffDate, filterMyRequests, sortBy])

    const paginatedPedidos = useMemo(() => {
        return filteredPedidos.slice((currentPage - 1) * ITEMS_PER_PAGE, currentPage * ITEMS_PER_PAGE)
    }, [filteredPedidos, currentPage])

    const consolidatedData = useMemo(() => {
        return filteredPedidos.reduce((acc, p) => {
            const prod = getProdutoCatalogo(p)
            const key = prod ? `CAT_ID_${prod.id}` : getItemDesc(p)
            if (!acc[key]) {
                acc[key] = {
                    descricao: prod ? prod.descricao_completa : getItemDesc(p),
                    unidade: prod ? (prod.unidade_venda || getItemUnidade(p)) : getItemUnidade(p),
                    codigo_interno: prod ? prod.codigo_interno : null,
                    produto_catalogo: prod,
                    quantidadeTotal: 0,
                    valorTotal: 0,
                    count: 0,
                    pedidos: []
                }
            }
            acc[key].quantidadeTotal += (p.quantidade_solicitada || 0)
            acc[key].valorTotal += (p.quantidade_solicitada || 0) * getItemValorUnitario(p)
            acc[key].count += 1
            acc[key].pedidos.push(p)
            return acc
        }, {} as Record<string, any>)
    }, [filteredPedidos])

    const consolidatedList = useMemo(() => {
        return Object.values(consolidatedData)
    }, [consolidatedData])

    const paginatedConsolidated = useMemo(() => {
        return consolidatedList.slice((currentPage - 1) * ITEMS_PER_PAGE, currentPage * ITEMS_PER_PAGE)
    }, [consolidatedList, currentPage])

    const totalPages = useMemo(() => {
        const totalItems = (activeTab === 'CONSOLIDADO' && !consolidadoDetalhado)
            ? consolidatedList.length
            : filteredPedidos.length
        return Math.ceil(totalItems / ITEMS_PER_PAGE)
    }, [activeTab, consolidadoDetalhado, consolidatedList, filteredPedidos])

    useEffect(() => {
        setCurrentPage(1)
    }, [searchTerm, activeTab, filterAssignee, filterBatch, filterStatus, filterMyRequests, consolidadoDetalhado, sortBy])

    const handleExportExcel = () => {
        const data = filteredPedidos.map(p => {
            const details = getPedidoDetails(p)
            const valorUnit = getItemValorUnitario(p)
            const total = (p.quantidade_solicitada || 0) * valorUnit
            
            return {
                'Item / Descrição': getItemDesc(p),
                'Categoria': getItemCategoria(p),
                'Marca Solicitada': details.marca || '—',
                'Documento Origem': getPedidoOrigem(p),
                'Cliente/Entidade': getPedidoCliente(p),
                'Quantidade': p.quantidade_solicitada || 0,
                'Unidade': getItemUnidade(p),
                'Valor Unitário (R$)': valorUnit,
                'Valor Total Estimado (R$)': total,
                'Prazo Limite (SLA)': formatDisplayDate(p.prazo_limite) || 'Sem Prazo',
                'Data Registro': formatDisplayDateTime(p.created_at),
                'Status': p.status || 'PENDENTE',
                'Solicitante': (p as any).solicitante_profile?.display_name || p.usuario_solicitante || '—',
                'Setor Solicitante': (p as any).solicitante_profile?.setor || '—',
                'Email Solicitante': (p as any).solicitante_profile?.email || '—',
                'Responsável': p.assigned_profile?.display_name || '—',
                'Observações': details.observacao || '—'
            }
        })
        exportToExcel(data, 'Relatorio_Compras_Detalhado')
        toast.success('Excel exportado com sucesso!')
    }

    const handleExportConsolidadoExcel = () => {
        const data = Object.values(consolidatedData).map((c: any) => {
            const closedCount = c.pedidos.filter((p: any) => getBatchStatus(p, nextCutoffDate) === 'CLOSED').length
            const currentCount = c.pedidos.filter((p: any) => getBatchStatus(p, nextCutoffDate) === 'CURRENT').length
            let loteText = ''
            if (closedCount > 0 && currentCount > 0) {
                loteText = `MISTO (${closedCount} Pronto / ${currentCount} Em Aberto)`
            } else if (closedCount > 0) {
                loteText = 'Pronto (Próxima Compra)'
            } else if (currentCount > 0) {
                loteText = 'Em Aberto (Ciclo Futuro)'
            } else {
                loteText = '—'
            }

            const valorUnitEst = c.quantidadeTotal > 0 ? (c.valorTotal / c.quantidadeTotal) : 0
            const brands = Array.from(new Set(c.pedidos.map((p: any) => getPedidoDetails(p).marca).filter(Boolean))) as string[]
            const brandText = brands.length > 0 ? brands.join(', ') : '—'

            const observations = Array.from(new Set(c.pedidos.map((p: any) => getPedidoDetails(p).observacao).filter(Boolean))) as string[]
            const observationText = observations.length > 0 ? observations.join('; ') : '—'

            const categories = Array.from(new Set(c.pedidos.map((p: any) => getItemCategoria(p)).filter(Boolean))) as string[]
            const categoryText = categories.length > 0 ? categories.join(', ') : '—'

            const solicitors = Array.from(new Set(c.pedidos.map((p: any) => p.solicitante_profile?.display_name || p.usuario_solicitante || '—').filter(Boolean))) as string[]
            const solicitorText = solicitors.length > 0 ? solicitors.join(', ') : '—'

            return {
                'Item / Descrição': c.descricao,
                'Categorias': categoryText,
                'Marcas': brandText,
                'Solicitantes': solicitorText,
                'Observações': observationText,
                'Lote': loteText,
                'Unidade': c.unidade,
                'Quantidade Total': c.quantidadeTotal,
                'Valor Unitário Estimado (R$)': valorUnitEst,
                'Valor Estimado Total (R$)': c.valorTotal,
                'Nº de Solicitações': c.count
            }
        })
        exportToExcel(data, 'Relatorio_Compras_Consolidado')
        toast.success('Excel consolidado exportado!')
    }

    const handleExportPDF = (
        statusSelecionado: string,
        loteSelecionado: string,
        categoriaSelecionada: string
    ) => {
        const doc = new jsPDF({ orientation: 'landscape' })
        
        // 1. CONDICIONAIS DE CUSTOMIZAÇÃO DO LAYOUT (CHAVEAMENTO)
        const isConsolidado = categoriaSelecionada === 'CONSOLIDADO' && !consolidadoDetalhado
        const isComprados = statusSelecionado === 'COMPRADO' || statusSelecionado === 'COMPRADOS'
        const isFalhas = statusSelecionado === 'FALHA' || statusSelecionado === 'FALHAS'

        let titleText = isConsolidado ? "RELATÓRIO CONSOLIDADO DE COMPRAS PENDENTES" : "RELATÓRIO DE COMPRAS PENDENTES"
        let headerColor: [number, number, number] = [15, 23, 42] // Azul Escuro/Institucional (Slate 900)
        let headers = isConsolidado 
            ? ['Item / Descrição', 'Marca', 'Observações', 'Lote', 'Unidade', 'Qtd Total', 'Preço Unit. Est.', 'Preço Total Est.', 'Nº Solicitações']
            : ['Descrição do Item', 'Marca', 'Lote', 'Categoria', 'Origem', 'Qtd', 'Val. Unit.', 'Val. Total Est.', 'Prazo SLA', 'Observações', 'Solicitante', 'Data Registro']
        
        let columnStyles: any = isConsolidado 
            ? {
                0: { cellWidth: 70 }, // Item / Descrição
                1: { cellWidth: 30 }, // Marca
                2: { cellWidth: 45 }, // Observações
                3: { cellWidth: 25 }, // Lote
                4: { cellWidth: 15 }, // Unidade
                5: { cellWidth: 18, halign: 'center' }, // Qtd Total
                6: { cellWidth: 22, halign: 'right' }, // Preço Unit. Est.
                7: { cellWidth: 22, halign: 'right' }, // Preço Total Est.
                8: { cellWidth: 22, halign: 'center' } // Nº Solicitações
            }
            : {
                0: { cellWidth: 44 }, // Descrição do Item
                1: { cellWidth: 20 }, // Marca
                2: { cellWidth: 20 }, // Lote
                3: { cellWidth: 20 }, // Categoria
                4: { cellWidth: 20 }, // Origem
                5: { cellWidth: 12, halign: 'center' }, // Qtd
                6: { cellWidth: 16, halign: 'right' }, // Val. Unit.
                7: { cellWidth: 18, halign: 'right' }, // Val. Total Est.
                8: { cellWidth: 18, halign: 'center' }, // Prazo SLA
                9: { cellWidth: 33 }, // Observações
                10: { cellWidth: 24 }, // Solicitante
                11: { cellWidth: 24, halign: 'center' } // Data Registro
            }

        if (isComprados) {
            titleText = isConsolidado ? "RELATÓRIO CONSOLIDADO DE COMPRAS ADQUIRIDAS" : "RELATÓRIO DE COMPRAS ADQUIRIDAS"
            headerColor = [6, 95, 70] // Verde Escuro/Clínico
            if (!isConsolidado) {
                headers = ['Descrição do Item', 'Categoria', 'Origem', 'Qtd', 'Marca Adquirida', 'Preço Pago', 'Previsão Chegada', 'Observações', 'Data Registro']
                columnStyles = {
                    0: { cellWidth: 66 },
                    1: { cellWidth: 25 },
                    2: { cellWidth: 30 },
                    3: { cellWidth: 15, halign: 'center' },
                    4: { cellWidth: 30 },
                    5: { cellWidth: 24, halign: 'right' },
                    6: { cellWidth: 25, halign: 'center' },
                    7: { cellWidth: 30 },
                    8: { cellWidth: 24, halign: 'center' }
                }
            }
        } else if (isFalhas) {
            titleText = isConsolidado ? "RELATÓRIO CONSOLIDADO DE FALHAS E DESABASTECIMENTO" : "RELATÓRIO DE FALHAS E DESABASTECIMENTO"
            headerColor = [153, 27, 27] // Vermelho/Alerta
            if (!isConsolidado) {
                headers = ['Descrição do Item', 'Categoria', 'Origem', 'Qtd', 'Val. Unit.', 'Solicitante', 'Observações', 'Justificativa do Erro', 'Data Registro']
                columnStyles = {
                    0: { cellWidth: 52 },
                    1: { cellWidth: 25 },
                    2: { cellWidth: 25 },
                    3: { cellWidth: 15, halign: 'center' },
                    4: { cellWidth: 18, halign: 'right' },
                    5: { cellWidth: 26 },
                    6: { cellWidth: 35 },
                    7: { cellWidth: 49 },
                    8: { cellWidth: 24, halign: 'center' }
                }
            }
        }

        // 2. DINAMISMO NO SUBTÍTULO
        let loteText = 'Todos os Lotes'
        if (loteSelecionado === 'CLOSED') {
            loteText = 'Lote Pronto (Próxima Compra)'
        } else if (loteSelecionado === 'CURRENT') {
            loteText = 'Lote em Aberto (Ciclo Futuro)'
        }

        let subtitulo = `Filtro aplicado: ${loteText}`
        if (categoriaSelecionada && categoriaSelecionada !== 'TUDO' && categoriaSelecionada !== 'CONSOLIDADO') {
            subtitulo += ` | Categoria: ${categoriaSelecionada}`
        }
        if (categoriaSelecionada === 'CONSOLIDADO') {
            subtitulo += ` | Modo: ${consolidadoDetalhado ? 'Detalhado' : 'Consolidado'}`
        }
        if (filterMyRequests) {
            subtitulo += ` | Minhas Solicitações`
        }

        // Desenha Cabeçalho Retangular Premium
        doc.setFillColor(headerColor[0], headerColor[1], headerColor[2])
        doc.rect(0, 0, 297, 28, 'F')
        doc.setTextColor(255, 255, 255)
        
        // Título Principal
        doc.setFontSize(15)
        doc.setFont('helvetica', 'bold')
        doc.text(titleText, 14, 13)
        
        // Subtítulo Dinâmico
        doc.setFontSize(8)
        doc.setFont('helvetica', 'normal')
        doc.text(subtitulo, 14, 21)
        
        // Data de Geração (Alinhado à Direita)
        doc.text(`Gerado em: ${new Date().toLocaleString('pt-BR')}`, 283, 21, { align: 'right' })

        // 3. MAPEAMENTO REATIVO DAS LINHAS
        const rows = isConsolidado
            ? Object.values(consolidatedData).map((c: any) => {
                const closedCount = c.pedidos.filter((p: any) => getBatchStatus(p, nextCutoffDate) === 'CLOSED').length
                const currentCount = c.pedidos.filter((p: any) => getBatchStatus(p, nextCutoffDate) === 'CURRENT').length
                let loteText = ''
                if (closedCount > 0 && currentCount > 0) {
                    loteText = 'Misto'
                } else if (closedCount > 0) {
                    loteText = 'Lote Pronto'
                } else if (currentCount > 0) {
                    loteText = 'Lote em Aberto'
                } else {
                    loteText = '—'
                }

                const valorUnitEst = c.quantidadeTotal > 0 ? (c.valorTotal / c.quantidadeTotal) : 0
                const brands = Array.from(new Set(c.pedidos.map((p: any) => getPedidoDetails(p).marca).filter(Boolean))) as string[]
                const brandText = brands.length > 0 ? brands.join(', ') : '—'

                const observations = Array.from(new Set(c.pedidos.map((p: any) => getPedidoDetails(p).observacao).filter(Boolean))) as string[]
                const observationText = observations.length > 0 ? observations.join('; ') : '—'

                return [
                    c.descricao,
                    brandText,
                    observationText,
                    loteText,
                    c.unidade || '—',
                    c.quantidadeTotal,
                    formatCurrency(valorUnitEst),
                    formatCurrency(c.valorTotal),
                    c.count
                ]
            })
            : filteredPedidos.map(p => {
                const obs = parseObservacoes(p.observacoes) || {}
                
                if (isComprados) {
                    const marca = p.marca_comprada || obs.marca_comprada || obs.marca || '—'
                    const precoUnit = p.valor_unitario_comprado || obs.preco_compra || 0
                    const qtd = p.quantidade_solicitada || 0
                    const previsao = p.prazo_estimado_chegada || obs.prazo_chegada
                    const previsaoStr = formatDisplayDate(previsao)
                    
                    return [
                        getItemDesc(p),
                        getItemCategoria(p),
                        getPedidoOrigem(p),
                        `${qtd} ${getItemUnidade(p)}`,
                        marca,
                        formatCurrency(precoUnit),
                        previsaoStr,
                        getPedidoDetails(p).observacao || '—',
                        formatDisplayDateTime(p.created_at)
                    ]
                } else if (isFalhas) {
                    const justificativa = obs.justificativa || '—'
                    const solicitante = (p as any).solicitante_profile?.display_name || p.usuario_solicitante || '—'
                    
                    return [
                        getItemDesc(p),
                        getItemCategoria(p),
                        getPedidoOrigem(p),
                        `${p.quantidade_solicitada || 0} ${getItemUnidade(p)}`,
                        formatCurrency(getItemValorUnitario(p)),
                        solicitante,
                        getPedidoDetails(p).observacao || '—',
                        justificativa,
                        formatDisplayDateTime(p.created_at)
                    ]
                } else {
                    const loteLabel = getBatchStatus(p, nextCutoffDate) === 'CLOSED' ? 'Lote Pronto' : 'Lote em Aberto'
                    const solicitante = (p as any).solicitante_profile?.display_name || p.usuario_solicitante || '—'
                    const details = getPedidoDetails(p)
                    
                    return [
                        getItemDesc(p),
                        details.marca || '—',
                        loteLabel,
                        getItemCategoria(p),
                        getPedidoOrigem(p),
                        `${p.quantidade_solicitada || 0} ${getItemUnidade(p)}`,
                        formatCurrency(getItemValorUnitario(p)),
                        formatCurrency((p.quantidade_solicitada || 0) * getItemValorUnitario(p)),
                        formatDisplayDate(p.prazo_limite) || 'S/ Prazo',
                        details.observacao || '—',
                        solicitante,
                        formatDisplayDateTime(p.created_at)
                    ]
                }
            })

        // Desenha a Tabela Dinamicamente com autoTable
        autoTable(doc, {
            startY: 35,
            head: [headers],
            body: rows,
            theme: 'striped',
            headStyles: { fillColor: headerColor, fontSize: 7.5, textColor: 255, fontStyle: 'bold' },
            styles: { fontSize: 7.5, cellPadding: 2.5 },
            columnStyles: columnStyles,
            margin: { left: 14, right: 14 }
        })

        // 4. RESOLVER CLIENTE E NE PARA O RODAPÉ (LIMPOS E SELETIVOS)
        const uniqueNEs = Array.from(new Set(filteredPedidos.map(p => {
            const orig = getPedidoOrigem(p).trim()
            return orig.replace(/^(NE|ARP|DOCUMENTO):\s*/i, '')
        }).filter(c => c && c !== '—' && c !== '')))
        
        const uniqueClients = Array.from(new Set(filteredPedidos.map(p => getPedidoCliente(p).trim()).filter(c => c && c !== '—' && c !== '')))

        const empenhoText = uniqueNEs.length === 1 ? uniqueNEs[0] : (uniqueNEs.length > 1 ? 'Diversos' : '—')
        const clientText = uniqueClients.length === 1 ? uniqueClients[0] : (uniqueClients.length > 1 ? 'Diversos' : '—')

        const limitStr = (str: string | null | undefined, maxLen: number) => {
            if (!str) return '—'
            return str.length <= maxLen ? str : str.substring(0, maxLen) + '...'
        }
        const empenhoClean = limitStr(empenhoText, 25)
        const clientClean = limitStr(clientText, 40)

        // 5. INJEÇÃO DOS RODAPÉS NAS PÁGINAS DO PDF (PAGINAÇÃO + COPYRIGHT NEXUS)
        const pageCount = doc.getNumberOfPages()
        for (let i = 1; i <= pageCount; i++) {
            doc.setPage(i)
            
            // Rodapé de Metadados e Paginação
            doc.setFontSize(8)
            doc.setTextColor(100)
            doc.setFont('helvetica', 'normal')
            doc.text(`Página ${i} de ${pageCount} | Empenho: ${empenhoClean} | Cliente: ${clientClean}`, 14, 200)
            
            // Rodapé Premium de Copyright Nexus (Igual ao Romaneio e Situação)
            doc.setFontSize(7)
            doc.setTextColor(150)
            doc.text("NEXUS CORPORATION - TODOS OS DIREITOS RESERVADOS", 148.5, 204, { align: 'center' })
        }

        // 6. SALVAR O ARQUIVO PDF COM PREFIXO DO CLIENTE SANITIZADO (SE ÚNICO OU DIVERSOS)
        const clientSanitized = clientText.replace(/[\s\/\\?%*:|"<>\.]+/g, '_')
        let filePrefix = isConsolidado ? 'Compras_Consolidado_Pendentes' : 'Compras_Pendentes'
        if (isComprados) {
            filePrefix = isConsolidado ? 'Compras_Consolidado_Adquiridas' : 'Compras_Adquiridas'
        } else if (isFalhas) {
            filePrefix = isConsolidado ? 'Consolidado_Falhas_Desabastecimento' : 'Falhas_Desabastecimento'
        }

        const dateStr = new Date().toISOString().split('T')[0]
        doc.save(`${clientSanitized}_${filePrefix}_${dateStr}.pdf`)
        toast.success('PDF de compras exportado com sucesso!')
    }

    const stats = useMemo(() => {
        return {
            total: pedidos.length,
            pendentes: pedidos.filter(p => {
                const s = (p.status || '').toUpperCase()
                return s === 'PENDENTE' || s === 'AGUARDANDO' || s === ''
            }).length,
            cotacao: pedidos.filter(p => (p.status || '').toUpperCase() === 'COTACAO').length,
            atendidos: pedidos.filter(p => {
                const s = (p.status || '').toUpperCase()
                return s === 'ATENDIDO' || s === 'EM_ESTOQUE'
            }).length,
            comprados: pedidos.filter(p => (p.status || '').toUpperCase() === 'COMPRADO').length,
            falhas: pedidos.filter(p => (p.status || '').toUpperCase() === 'FALHA').length,
            vencidos: pedidos.filter(p => p.prazo_limite && new Date(p.prazo_limite) < new Date() && !['COMPRADO', 'ATENDIDO', 'EM_ESTOQUE'].includes((p.status || '').toUpperCase())).length,
            correcoes: pedidos.filter(p => {
                const s = (p.status || '').toUpperCase()
                if (s !== 'CORRECAO') return false
                const isComprasUser = profileNivel === 'DEV' || profileNivel === 'ADM' || profileSetor === 'COMPRAS'
                if (isComprasUser) return true
                return p.solicitante_id === profileId
            }).length
        }
    }, [pedidos, profileId, profileSetor, profileNivel])

    return (
        <div className="space-y-6">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                <div>
                    <h1 className="text-2xl font-bold text-zinc-900 dark:text-zinc-100 flex items-center gap-2">
                        <Cart className="w-7 h-7 text-brand-accent" />
                        Módulo de Compras
                    </h1>
                    <p className="text-zinc-500 text-sm">Gestão de prazos e fluxo de aquisições {profile?.nivel === 'DEV' ? '(MODO DEV ATIVO)' : ''}</p>
                </div>
                <div className="flex items-center gap-3">
                    {/* Botão de Anexo em Lote Restrito ao Nível DEV / ADM */}
                    {(profile?.nivel === 'DEV' || profile?.nivel === 'ADM') && (
                        <Button
                            onClick={() => setShowAnexoLoteModal(true)}
                            className="h-10 text-xs font-black bg-gradient-to-r from-purple-600 to-indigo-600 hover:from-purple-500 hover:to-indigo-500 text-white rounded-xl shadow-md gap-2"
                        >
                            <Paperclip className="w-4 h-4" />
                            <span className="hidden sm:inline">Anexar em Lote (Vendedor + Município)</span>
                            <span className="sm:hidden">Anexar em Lote</span>
                        </Button>
                    )}

                    <div className="flex flex-col items-end bg-red-500/5 dark:bg-red-500/10 border border-red-500/15 rounded-xl px-4 py-2 shadow-inner">
                        <span className="text-[9px] font-black text-red-500 dark:text-red-400 uppercase tracking-widest">SLA Ativo</span>
                        <div className="flex items-center gap-1.5 mt-0.5">
                            <div className="w-2 h-2 rounded-full bg-red-500 animate-pulse" />
                            <span className="text-xs font-black text-red-600 dark:text-red-400 font-mono">{stats.vencidos} CRÍTICOS</span>
                        </div>
                    </div>
                </div>
            </div>

            {/* Bloco de Lote do Período e Contagem Regressiva */}
            <Card className="bg-zinc-50 dark:bg-zinc-900/30 text-zinc-900 dark:text-zinc-100 border border-zinc-200 dark:border-zinc-800 shadow-sm p-5 rounded-2xl relative overflow-hidden flex flex-col md:flex-row items-center justify-between gap-6 transition-all duration-300">
                <div className="absolute right-0 top-0 w-64 h-64 bg-brand-accent/5 rounded-full blur-3xl pointer-events-none" />
                <div className="space-y-1 z-10">
                    <div className="flex items-center gap-2">
                        <ClockIcon className="w-5 h-5 text-brand-accent animate-pulse" />
                        <span className="text-xs font-black uppercase tracking-widest text-brand-accent">Status do Lote Semanal</span>
                    </div>
                    <h2 className="text-lg font-black tracking-tight text-zinc-900 dark:text-white">Fechamentos: Segundas e Quartas-Feiras às 20:00</h2>
                    <p className="text-zinc-500 dark:text-zinc-400 text-xs max-w-md leading-relaxed">
                        Pedidos criados até o prazo entram nas compras de Terça/Quinta (<span className="text-zinc-900 dark:text-white font-semibold font-mono text-[11px]">Lote Pronto</span>). Pedidos posteriores entram no lote seguinte (<span className="text-brand-accent font-semibold font-mono text-[11px]">Lote em Aberto</span>).
                    </p>
                </div>
                <div className="flex flex-col sm:flex-row items-center gap-6 z-10 w-full md:w-auto shrink-0 justify-end">
                    <CountdownTimer nextCutoffDate={nextCutoffDate} getNextCutoff={getNextCutoff} />
                </div>
            </Card>

            <div className={cn(
                "grid gap-3",
                profile?.setor === 'RECEBIMENTO' 
                    ? "grid-cols-2 md:grid-cols-4" 
                    : "grid-cols-2 sm:grid-cols-3 xl:grid-cols-5"
            )}>
                <Card 
                    className={cn(
                        "p-4 shadow-md transition-all duration-200 hover:scale-[1.02] active:scale-[0.98] cursor-pointer select-none",
                        filterStatus === 'PENDENTE' 
                            ? "bg-brand-accent/20 border-2 border-brand-accent ring-2 ring-brand-accent/20" 
                            : "bg-white dark:bg-zinc-900 border border-zinc-100 dark:border-zinc-800 hover:border-brand-accent/30"
                    )}
                    onClick={() => setFilterStatus(prev => prev === 'PENDENTE' ? 'ALL' : 'PENDENTE')}
                >
                    <p className="text-[10px] font-bold text-brand-accent uppercase">Solicitados</p>
                    <div className="flex items-end justify-between mt-1">
                        <span className="text-2xl font-black text-foreground">{stats.pendentes}</span>
                        <div className="h-6 w-16 bg-brand-accent/20 rounded overflow-hidden">
                            <div className="h-full bg-brand-accent" style={{ width: stats.total === 0 ? '0%' : `${(stats.pendentes/stats.total)*100}%` }} />
                        </div>
                    </div>
                </Card>
                <Card 
                    className={cn(
                        "p-4 shadow-md transition-all duration-200 hover:scale-[1.02] active:scale-[0.98] cursor-pointer select-none",
                        filterStatus === 'COTACAO' 
                            ? "bg-blue-500/10 border-2 border-blue-500 ring-2 ring-blue-500/20" 
                            : "bg-white dark:bg-zinc-900 border border-zinc-100 dark:border-zinc-800 hover:border-blue-500/30"
                    )}
                    onClick={() => setFilterStatus(prev => prev === 'COTACAO' ? 'ALL' : 'COTACAO')}
                >
                    <p className="text-[10px] font-bold text-zinc-500 uppercase">Em Cotação</p>
                    <div className="flex items-end justify-between mt-1">
                        <span className="text-2xl font-black text-blue-600">{stats.cotacao}</span>
                        <div className="h-6 w-16 bg-zinc-100 dark:bg-zinc-800 rounded overflow-hidden">
                            <div className="h-full bg-blue-500" style={{ width: stats.total === 0 ? '0%' : `${(stats.cotacao/stats.total)*100}%` }} />
                        </div>
                    </div>
                </Card>
                <Card 
                    className={cn(
                        "p-4 shadow-md transition-all duration-200 hover:scale-[1.02] active:scale-[0.98] cursor-pointer select-none",
                        filterStatus === 'FALHA' 
                            ? "bg-red-500/10 border-2 border-red-500 ring-2 ring-red-500/20" 
                            : "bg-white dark:bg-zinc-900 border border-zinc-100 dark:border-zinc-800 hover:border-red-500/30"
                    )}
                    onClick={() => setFilterStatus(prev => prev === 'FALHA' ? 'ALL' : 'FALHA')}
                >
                    <p className="text-[10px] font-bold text-red-600 uppercase">Falhas</p>
                    <div className="flex items-end justify-between mt-1">
                        <span className="text-2xl font-black text-red-600">{stats.falhas}</span>
                        <div className="h-6 w-16 bg-red-100 dark:bg-red-900 rounded overflow-hidden">
                            <div className="h-full bg-red-500" style={{ width: stats.total === 0 ? '0%' : `${(stats.falhas/stats.total)*100}%` }} />
                        </div>
                    </div>
                </Card>
                <Card 
                    className={cn(
                        "p-4 shadow-md transition-all duration-200 hover:scale-[1.02] active:scale-[0.98] cursor-pointer select-none",
                        filterStatus === 'COMPRADO' 
                            ? "bg-emerald-500/10 border-2 border-emerald-500 ring-2 ring-emerald-500/20" 
                            : "bg-white dark:bg-zinc-900 border border-zinc-100 dark:border-zinc-800 hover:border-emerald-500/30"
                    )}
                    onClick={() => setFilterStatus(prev => prev === 'COMPRADO' ? 'ALL' : 'COMPRADO')}
                >
                    <p className="text-[10px] font-bold text-emerald-600 dark:text-emerald-400 uppercase">Comprados</p>
                    <div className="flex items-end justify-between mt-1">
                        <span className={cn("text-2xl font-black", filterStatus === 'COMPRADO' ? "text-emerald-600 dark:text-emerald-400" : "text-brand-accent")}>{stats.comprados}</span>
                        <div className="h-6 w-16 bg-zinc-100 dark:bg-zinc-800 rounded overflow-hidden">
                            <div className="h-full bg-emerald-500" style={{ width: stats.total === 0 ? '0%' : `${(stats.comprados/stats.total)*100}%` }} />
                        </div>
                    </div>
                </Card>
                {profile?.setor !== 'RECEBIMENTO' && (
                    <Card 
                        className={cn(
                            "p-4 shadow-md transition-all duration-200 hover:scale-[1.02] active:scale-[0.98] cursor-pointer select-none col-span-2 sm:col-span-1",
                            activeTab === 'QUARENTENA' 
                                ? "bg-amber-500/10 border-2 border-amber-500 ring-2 ring-amber-500/20" 
                                : "bg-white dark:bg-zinc-900 border border-zinc-100 dark:border-zinc-800 hover:border-amber-500/30"
                        )}
                        onClick={() => {
                            setFilterStatus('ALL')
                            setActiveTab(prev => prev === 'QUARENTENA' ? 'TUDO' : 'QUARENTENA')
                        }}
                    >
                        <p className="text-[10px] font-bold text-amber-600 dark:text-amber-400 uppercase tracking-tight">Correções Pendentes</p>
                        <div className="flex items-end justify-between mt-1">
                            <span className="text-2xl font-black text-amber-600 dark:text-amber-400">{stats.correcoes}</span>
                            <div className="h-6 w-16 bg-amber-50 dark:bg-amber-950/40 border border-amber-250 dark:border-amber-900/50 rounded overflow-hidden flex items-center justify-center">
                                <Alert className="w-3.5 h-3.5 text-amber-500 dark:text-amber-400 animate-pulse" />
                            </div>
                        </div>
                    </Card>
                )}
            </div>

            {/* Barra de Filtros Centralizada (Single Action Bar) */}
            <div className="flex flex-wrap items-center gap-2.5 bg-white dark:bg-zinc-900 p-3.5 border border-zinc-200 dark:border-zinc-700 rounded-2xl shadow-sm w-full">
                {/* Campo de Busca */}
                <div className="relative flex-1 min-w-[220px]">
                    <SearchIcon className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-zinc-400" />
                    <Input 
                        placeholder="Buscar por item ou NE..." 
                        className="pl-9 h-10 rounded-xl shadow-sm border-zinc-200 dark:border-zinc-700 bg-white dark:bg-zinc-900 text-xs"
                        value={searchTerm}
                        onChange={e => setSearchTerm(e.target.value)}
                    />
                </div>

                {/* Filtro de Categoria e Visualização */}
                <Select value={activeTab} onValueChange={(val) => {
                    setActiveTab(val)
                    setConsolidadoDetalhado(false)
                }}>
                    <SelectTrigger className="h-10 text-xs w-full sm:w-[200px] border-zinc-200 dark:border-zinc-700 bg-white dark:bg-zinc-900 font-semibold rounded-xl shadow-sm">
                        <div className="flex items-center gap-1.5 overflow-hidden text-ellipsis">
                            <List className="w-3.5 h-3.5 text-brand-accent shrink-0" />
                            <SelectValue placeholder="Categoria / Modo" />
                        </div>
                    </SelectTrigger>
                    <SelectContent>
                        <SelectItem value="TUDO" className="text-xs font-bold text-zinc-900 dark:text-zinc-100">TODAS AS CATEGORIAS</SelectItem>
                        <SelectItem value="ODONTO" className="text-xs">ODONTO</SelectItem>
                        <SelectItem value="MEDICAMENTO" className="text-xs">MEDICAMENTO</SelectItem>
                        <SelectItem value="DIETA" className="text-xs">DIETA</SelectItem>
                        <SelectItem value="COSMÉTICO" className="text-xs">COSMÉTICO</SelectItem>
                        <SelectItem value="MATERIAL HOSPITALAR" className="text-xs">MATERIAL HOSPITALAR</SelectItem>
                        <SelectItem value="MOBILIÁRIO" className="text-xs">MOBILIÁRIO</SelectItem>
                        <SelectItem value="ELETRÔNICO" className="text-xs">ELETRÔNICO</SelectItem>
                        <SelectItem value="CONSOLIDADO" className="text-xs font-black text-brand-accent">GERAL AGRUPADO (CONSOLIDADO)</SelectItem>
                        <SelectItem value="PRIORIDADE" className="text-xs font-black text-rose-600 dark:text-rose-400">🚨 PRIORITÁRIOS (JUDICIAL & NOTIF.)</SelectItem>
                        {profile?.setor !== 'RECEBIMENTO' && (
                            <SelectItem value="QUARENTENA" className="text-xs font-black text-amber-600 dark:text-amber-400">🛡️ QUARENTENA / CORREÇÃO</SelectItem>
                        )}
                    </SelectContent>
                </Select>

                {/* Botão de Atalho para Minhas Solicitações */}
                <Button
                    variant={filterMyRequests ? 'default' : 'outline'}
                    onClick={() => setFilterMyRequests(prev => !prev)}
                    className={cn(
                        "h-10 text-xs gap-1.5 font-bold uppercase rounded-xl shadow-sm shrink-0 transition-all select-none border-blue-200 text-blue-600 hover:bg-blue-50 dark:border-blue-900/40 dark:text-blue-450 dark:hover:bg-blue-950/20",
                        filterMyRequests && "bg-blue-600 text-white hover:bg-blue-700 hover:text-white border-blue-600 dark:bg-blue-700 dark:border-blue-700"
                    )}
                    title="Mostrar apenas minhas solicitações"
                >
                    <User className="w-4 h-4" />
                    Minhas Solicitações
                </Button>

                {/* Botão de Atalho para Prioridades */}
                <Button
                    variant={activeTab === 'PRIORIDADE' ? 'destructive' : 'outline'}
                    onClick={() => setActiveTab(prev => prev === 'PRIORIDADE' ? 'TUDO' : 'PRIORIDADE')}
                    className={cn(
                        "h-10 text-xs gap-1.5 font-bold uppercase rounded-xl shadow-sm shrink-0 transition-all select-none border-rose-200 text-rose-600 hover:bg-rose-50 dark:border-rose-900/40 dark:text-rose-450 dark:hover:bg-rose-950/20",
                        activeTab === 'PRIORIDADE' && "bg-rose-600 text-white hover:bg-rose-700 hover:text-white border-rose-600 dark:bg-rose-700 dark:border-rose-700"
                    )}
                    title="Mostrar apenas Demandas Judiciais e Notificações"
                >
                    <Alert className="w-4 h-4" />
                    Prioridades
                </Button>

                {/* Filtro de Lote Semanal */}
                <Select value={filterBatch} onValueChange={(val) => setFilterBatch(val as any)}>
                    <SelectTrigger className="h-10 text-xs w-full sm:w-[150px] border-zinc-200 dark:border-zinc-700 bg-white dark:bg-zinc-900 font-semibold rounded-xl shadow-sm">
                        <div className="flex items-center gap-1.5 overflow-hidden text-ellipsis">
                            <ClockIcon className="w-3.5 h-3.5 text-indigo-500 shrink-0" />
                            <SelectValue placeholder="Lote Semanal" />
                        </div>
                    </SelectTrigger>
                    <SelectContent>
                        <SelectItem value="ALL" className="text-xs">Todos os Lotes</SelectItem>
                        <SelectItem value="CLOSED" className="text-xs font-bold text-zinc-900 dark:text-zinc-100">Lote Pronto (Próxima Compra)</SelectItem>
                        <SelectItem value="CURRENT" className="text-xs font-bold text-brand-accent">Lote em Aberto (Ciclo Futuro)</SelectItem>
                    </SelectContent>
                </Select>

                {/* Filtro de Responsável */}
                <Select value={filterAssignee} onValueChange={setFilterAssignee}>
                    <SelectTrigger className="h-10 text-xs w-full sm:w-[170px] border-zinc-200 dark:border-zinc-700 bg-white dark:bg-zinc-900 font-semibold rounded-xl shadow-sm">
                        <div className="flex items-center gap-1.5 overflow-hidden text-ellipsis">
                            <UserPlus className="w-3.5 h-3.5 text-emerald-500 shrink-0" />
                            <SelectValue placeholder="Responsável" />
                        </div>
                    </SelectTrigger>
                    <SelectContent>
                        <SelectItem value="ALL" className="text-xs">Todos os Responsáveis</SelectItem>
                        <SelectItem value="UNASSIGNED" className="text-xs font-semibold text-zinc-400">Não Atribuídos</SelectItem>
                        {profiles.map(p => (
                            <SelectItem key={p.id} value={p.id} className="text-xs">
                                {p.display_name?.toUpperCase()}
                            </SelectItem>
                        ))}
                    </SelectContent>
                </Select>

                {/* Filtro de Status (Sincronizado Bidirecionalmente) */}
                <Select value={filterStatus} onValueChange={(val) => setFilterStatus(val as any)}>
                    <SelectTrigger className="h-10 text-xs w-full sm:w-[150px] border-zinc-200 dark:border-zinc-700 bg-white dark:bg-zinc-900 font-semibold rounded-xl shadow-sm">
                        <div className="flex items-center gap-1.5 overflow-hidden text-ellipsis">
                            <ShoppingCart className="w-3.5 h-3.5 text-violet-500 shrink-0" />
                            <SelectValue placeholder="Status" />
                        </div>
                    </SelectTrigger>
                    <SelectContent>
                        <SelectItem value="ALL" className="text-xs">Todos os Status</SelectItem>
                        <SelectItem value="PENDENTE" className="text-xs">Solicitados</SelectItem>
                        <SelectItem value="COTACAO" className="text-xs">Em Cotação</SelectItem>
                        <SelectItem value="FALHA" className="text-xs">Falhas de Compra</SelectItem>
                        <SelectItem value="COMPRADO" className="text-xs">Comprados</SelectItem>
                        <SelectItem value="EXCLUIDO" className="text-xs">Excluídos/Cancelados</SelectItem>
                    </SelectContent>
                </Select>

                {/* Seletor de Ordenação / Organização */}
                <Select 
                    value={sortBy} 
                    onValueChange={(val) => {
                        const newSort = val as SortOption
                        setSortBy(newSort)
                        if ((newSort === 'ENTREGA_ASC' || newSort === 'ENTREGA_DESC') && filterStatus !== 'COMPRADO') {
                            setFilterStatus('COMPRADO')
                        }
                    }}
                >
                    <SelectTrigger className="h-10 text-xs w-full lg:w-52 border-zinc-200 dark:border-zinc-700 bg-white dark:bg-zinc-900 font-semibold rounded-xl shadow-sm shrink-0">
                        <div className="flex items-center gap-1.5 overflow-hidden text-ellipsis">
                            <ArrowUpDown className="w-3.5 h-3.5 text-amber-500 shrink-0" />
                            <SelectValue placeholder="Organizar Por" />
                        </div>
                    </SelectTrigger>
                    <SelectContent>
                        <SelectItem value="DEFAULT" className="text-xs font-semibold">Organizar: Padrão</SelectItem>
                        <SelectItem value="CREATED_DESC" className="text-xs">📅 Data Cadastro (Mais Recentes)</SelectItem>
                        <SelectItem value="CREATED_ASC" className="text-xs">📅 Data Cadastro (Mais Antigos)</SelectItem>
                        <SelectItem value="PRAZO_ASC" className="text-xs">⏱️ Prazo SLA (Vencendo Primeiro)</SelectItem>
                        <SelectItem value="PRAZO_DESC" className="text-xs">⏱️ Prazo SLA (Mais Distante)</SelectItem>
                        <SelectItem value="ENTREGA_ASC" className="text-xs">🚚 Previsão Entrega (Chegando Cedo)</SelectItem>
                        <SelectItem value="ENTREGA_DESC" className="text-xs">🚚 Previsão Entrega (Chegando Tarde)</SelectItem>
                    </SelectContent>
                </Select>
            </div>

            {/* Barra de Ações (Abaixo dos Filtros) */}
            <div className="flex flex-col sm:flex-row items-center justify-between gap-3 w-full">
                <div className="flex items-center gap-2 w-full sm:w-auto">
                    {/* Botão Compra Livre - visível apenas para autorizados (incluindo Vendas Privado) */}
                    {canCompraLivre && (
                        <Button
                            size="sm"
                            className="h-8 gap-2 text-[10px] font-black uppercase bg-gradient-to-r from-brand-accent to-indigo-600 hover:from-brand-accent/90 hover:to-indigo-600/90 text-white shadow-md hover:shadow-lg transition-all active:scale-95 shrink-0"
                            onClick={() => setShowCompraLivre(true)}
                        >
                            <Plus size={13} />
                            COMPRA LIVRE
                        </Button>
                    )}
                    
                    {/* Botão Responsabilidades e Auto-Atribuir - visível para DEV e ADM COMPRAS */}
                    {canManageTeam && (
                        <>
                            <Button
                                size="sm"
                                variant="outline"
                                disabled={autoAssigning}
                                className="h-8 gap-2 text-[10px] font-bold uppercase border-indigo-200 text-indigo-700 dark:border-indigo-900/40 dark:text-indigo-400 hover:bg-indigo-50 transition-all active:scale-95 shrink-0"
                                onClick={handleAutoAssignAllUnassigned}
                                title="Atribui automaticamente todas as solicitações pendentes sem comprador aos compradores da equipe por categoria"
                            >
                                {autoAssigning ? <Loader2 size={13} className="animate-spin" /> : <Zap size={13} className="text-amber-500 fill-amber-500" />}
                                {autoAssigning ? 'Atribuindo...' : '⚡ Auto-Atribuir Pendentes'}
                            </Button>
                            <Button
                                size="sm"
                                variant="outline"
                                className="h-8 gap-2 text-[10px] font-bold uppercase border-brand-accent/30 text-brand-accent hover:bg-brand-accent/5 transition-all active:scale-95 shrink-0"
                                onClick={() => setShowTeamModal(true)}
                            >
                                <Users size={13} />
                                Responsabilidades da Equipe
                            </Button>
                        </>
                    )}
                </div>
                <div className="flex items-center gap-2 w-full sm:w-auto sm:ml-auto justify-end">
                    {activeTab === 'CONSOLIDADO' && (
                        <Button 
                            variant={consolidadoDetalhado ? 'default' : 'outline'} 
                            size="sm" 
                            onClick={() => setConsolidadoDetalhado(prev => !prev)} 
                            className={cn(
                                "h-8 gap-2 text-[10px] font-black uppercase shrink-0 transition-all select-none border-indigo-200 text-indigo-600 hover:bg-indigo-50 dark:border-indigo-900/40 dark:text-indigo-450 dark:hover:bg-indigo-950/20",
                                consolidadoDetalhado && "bg-indigo-600 text-white hover:bg-indigo-700 hover:text-white border-indigo-600 dark:bg-indigo-700 dark:border-indigo-700"
                            )}
                        >
                            {consolidadoDetalhado ? 'Ver Agrupado (Consolidado)' : 'Ver Detalhado'}
                        </Button>
                    )}
                    <Button 
                        variant="outline" 
                        size="sm" 
                        onClick={activeTab === 'CONSOLIDADO' && !consolidadoDetalhado ? handleExportConsolidadoExcel : handleExportExcel} 
                        className="h-8 gap-2 text-[10px] font-bold uppercase shrink-0"
                    >
                        <FileSpreadsheet size={14} className="text-emerald-600" />
                        {activeTab === 'CONSOLIDADO' && !consolidadoDetalhado ? 'Exportar Excel Consolidado' : 'Exportar Excel Detalhado'}
                    </Button>
                    <Button variant="outline" size="sm" onClick={() => handleExportPDF(filterStatus, filterBatch, activeTab)} className="h-8 gap-2 text-[10px] font-bold text-red-600 hover:bg-red-50 border-red-200 dark:text-red-400 dark:hover:bg-red-950/30 dark:border-red-900/50 shrink-0">
                        <FileDown size={14} className="text-red-600" />
                        EXPORTAR PDF
                    </Button>
                    <Button 
                        variant="outline" 
                        size="sm" 
                        onClick={handleOpenGlobalHistory} 
                        className="h-8 gap-1.5 text-[10px] font-bold text-amber-700 bg-amber-50 hover:bg-amber-100 border-amber-200 dark:bg-amber-950/40 dark:text-amber-300 dark:border-amber-900/50 shrink-0"
                    >
                        <History size={14} className="text-amber-600" />
                        HISTÓRICO DE COMPRAS
                    </Button>
                </div>
            </div>

            <Card className="border-zinc-200 dark:border-zinc-800 shadow-xl overflow-hidden">
                <Table>
                    {activeTab === 'CONSOLIDADO' && !consolidadoDetalhado ? (
                        <>
                            <TableHeader className="bg-zinc-50 dark:bg-zinc-900/60">
                                <TableRow>
                                    <TableHead>ITEM / DESCRIÇÃO</TableHead>
                                    <TableHead>MARCA</TableHead>
                                    <TableHead>UNIDADE</TableHead>
                                    <TableHead className="text-right">QTD TOTAL</TableHead>
                                    <TableHead className="text-right">VALOR UNIT. EST.</TableHead>
                                    <TableHead className="text-right">VALOR EST. TOTAL</TableHead>
                                    <TableHead className="text-right">Nº DE EMPENHOS</TableHead>
                                    {!isReadOnly && (
                                        <>
                                            <TableHead className="text-right">RESPONSÁVEL (LOTE)</TableHead>
                                            <TableHead className="text-right">STATUS (LOTE)</TableHead>
                                        </>
                                    )}
                                </TableRow>
                            </TableHeader>
                            <TableBody>
                                {paginatedConsolidated.map((c: any) => {
                                    const pedidoIds = c.pedidos.map((p: any) => p.id)
                                    const firstAssigned = c.pedidos[0]?.assigned_to
                                    const allSameAssignee = c.pedidos.every((p: any) => p.assigned_to === firstAssigned)
                                    const displayAssignee = allSameAssignee ? (firstAssigned || 'unassigned') : 'mixed'

                                    const firstStatus = c.pedidos[0]?.status || 'PENDENTE'
                                    const allSameStatus = c.pedidos.every((p: any) => (p.status || 'PENDENTE') === firstStatus)
                                    const displayStatus = allSameStatus ? firstStatus : 'mixed'

                                    const closedCount = c.pedidos.filter((p: any) => getBatchStatus(p, nextCutoffDate) === 'CLOSED').length
                                    const currentCount = c.pedidos.filter((p: any) => getBatchStatus(p, nextCutoffDate) === 'CURRENT').length
                                    const brands = Array.from(new Set(c.pedidos.map((p: any) => getPedidoDetails(p).marca).filter(Boolean))) as string[]

                                    return (
                                        <TableRow key={c.descricao} className="hover:bg-zinc-50 dark:hover:bg-zinc-900/40 transition-colors">
                                            <TableCell className="font-bold text-sm text-zinc-900 dark:text-zinc-100">
                                                <div className="flex flex-col">
                                                    <span>{c.descricao}</span>
                                                    <div className="flex items-center gap-1.5 mt-0.5 flex-wrap">
                                                        {c.codigo_interno && (
                                                            <span className="text-[10px] text-zinc-400 font-mono font-medium">
                                                                Cód. Catálogo: <strong className="text-brand-accent">{c.codigo_interno}</strong>
                                                            </span>
                                                        )}
                                                        {closedCount > 0 && (
                                                            <Badge variant="outline" className="text-[8px] h-3.5 bg-zinc-950 text-zinc-50 border-none font-bold px-1.5 py-0 shrink-0 font-mono dark:bg-zinc-100 dark:text-zinc-950">
                                                                {closedCount} no Fechado
                                                            </Badge>
                                                        )}
                                                        {currentCount > 0 && (
                                                            <Badge variant="outline" className="text-[8px] h-3.5 bg-emerald-50 text-emerald-900 dark:bg-emerald-950/40 dark:text-emerald-200 border-emerald-200 dark:border-emerald-800 font-bold px-1.5 py-0 shrink-0 font-mono">
                                                                {currentCount} no Aberto
                                                            </Badge>
                                                        )}
                                                    </div>
                                                </div>
                                            </TableCell>
                                            <TableCell className="text-xs font-mono font-medium">
                                                {brands.length > 0 ? (
                                                    <div className="flex flex-wrap gap-1">
                                                        {brands.map(b => (
                                                            <Badge key={b} variant="outline" className="text-[8px] h-3.5 bg-sky-50 text-sky-700 border-sky-200 font-bold px-1.5 py-0 shrink-0 font-mono dark:bg-zinc-800 dark:text-zinc-300 dark:border-zinc-700/50 border">
                                                                {b}
                                                            </Badge>
                                                        ))}
                                                    </div>
                                                ) : (
                                                    <span className="text-zinc-400">—</span>
                                                )}
                                            </TableCell>
                                            <TableCell className="text-xs uppercase">{c.unidade}</TableCell>
                                            <TableCell className="text-right font-black text-red-600">{c.quantidadeTotal}</TableCell>
                                            <TableCell className="text-right font-medium font-mono text-zinc-500 dark:text-zinc-400">{formatCurrency(c.quantidadeTotal > 0 ? (c.valorTotal / c.quantidadeTotal) : 0)}</TableCell>
                                            <TableCell className="text-right font-bold text-zinc-900 dark:text-zinc-100">{formatCurrency(c.valorTotal)}</TableCell>
                                            <TableCell className="text-right text-xs font-medium text-zinc-500">{c.count} solicit.</TableCell>
                                            {!isReadOnly && (
                                                <>
                                                    <TableCell className="text-right">
                                                        <Select
                                                            value={displayAssignee}
                                                            onValueChange={(val) => {
                                                                if (val !== 'mixed') {
                                                                    if (val === 'unassigned') {
                                                                        bulkAssignPedidos(pedidoIds, null)
                                                                    } else {
                                                                        handleOpenReassignModal(null, pedidoIds, val)
                                                                    }
                                                                }
                                                            }}
                                                        >
                                                            <SelectTrigger className="h-8 text-[10px] w-32 border-zinc-200 dark:border-zinc-700 bg-white dark:bg-zinc-900 font-bold uppercase ml-auto">
                                                                <div className="flex items-center gap-1.5 overflow-hidden text-ellipsis">
                                                                    <UserPlus className="w-3 h-3 text-brand-accent shrink-0" />
                                                                    <SelectValue />
                                                                </div>
                                                            </SelectTrigger>
                                                            <SelectContent>
                                                                {displayAssignee === 'mixed' && (
                                                                    <SelectItem value="mixed" className="text-[10px] font-bold text-amber-600">VÁRIOS (MISTO)</SelectItem>
                                                                )}
                                                                <SelectItem value="unassigned" className="text-[10px] font-bold text-zinc-400">AGUARDANDO...</SelectItem>
                                                                {profiles.map(p => (
                                                                    <SelectItem key={p.id} value={p.id} className="text-[10px] font-medium">
                                                                        {p.display_name?.toUpperCase()}
                                                                    </SelectItem>
                                                                ))}
                                                            </SelectContent>
                                                        </Select>
                                                    </TableCell>
                                                    <TableCell className="text-right">
                                                        <Select 
                                                            value={displayStatus} 
                                                            onValueChange={(val) => {
                                                                if (val !== 'mixed') {
                                                                    bulkUpdateStatus(pedidoIds, val)
                                                                }
                                                            }}
                                                        >
                                                            <SelectTrigger className="h-8 text-[10px] w-28 ml-auto">
                                                                <SelectValue />
                                                            </SelectTrigger>
                                                            <SelectContent>
                                                                {displayStatus === 'mixed' && (
                                                                    <SelectItem value="mixed" className="text-[10px] font-bold text-amber-600">VÁRIOS (MISTO)</SelectItem>
                                                                )}
                                                                <SelectItem value="PENDENTE">Aguardando</SelectItem>
                                                                <SelectItem value="COTACAO">Em Cotação</SelectItem>
                                                                <SelectItem value="COMPRADO">Comprado</SelectItem>
                                                                <SelectItem value="EM_ESTOQUE">Em Estoque</SelectItem>
                                                            </SelectContent>
                                                        </Select>
                                                    </TableCell>
                                                </>
                                            )}
                                        </TableRow>
                                    )
                                })}
                            </TableBody>
                        </>
                    ) : (
                        <>
                            <TableHeader className="bg-zinc-50 dark:bg-zinc-900/60">
                                <TableRow>
                                    <TableHead className="w-[380px]">ITEM / CATEGORIA</TableHead>
                                    <TableHead>DOCUMENTO ORIGEM</TableHead>
                                    <TableHead>PRAZO (SLA)</TableHead>
                                    <TableHead className="text-right">VALOR UNIT.</TableHead>
                                    <TableHead>QTD / STATUS</TableHead>
                                    <TableHead className="text-right">SOLICITANTE</TableHead>
                                    <TableHead className="text-right">RESPONSÁVEL</TableHead>
                                    <TableHead className="text-right">AÇÕES</TableHead>
                                </TableRow>
                            </TableHeader>
                            <TableBody>
                                {loading ? (
                                    Array.from({ length: 5 }).map((_, index) => (
                                        <TableRow key={index} className="animate-pulse border-b border-zinc-100 dark:border-zinc-800">
                                            <TableCell>
                                                <div className="space-y-2">
                                                    <div className="h-4 bg-zinc-200 dark:bg-zinc-800 rounded w-3/4" />
                                                    <div className="h-3 bg-zinc-100 dark:bg-zinc-900 rounded w-1/2" />
                                                </div>
                                            </TableCell>
                                            <TableCell>
                                                <div className="space-y-1.5">
                                                    <div className="h-4 bg-zinc-200 dark:bg-zinc-800 rounded w-24" />
                                                    <div className="h-3 bg-zinc-100 dark:bg-zinc-900 rounded w-32" />
                                                </div>
                                            </TableCell>
                                            <TableCell>
                                                <div className="h-4 bg-zinc-200 dark:bg-zinc-800 rounded w-16" />
                                            </TableCell>
                                            <TableCell>
                                                <div className="h-4 bg-zinc-200 dark:bg-zinc-800 rounded w-12" />
                                            </TableCell>
                                            <TableCell>
                                                <div className="space-y-1">
                                                    <div className="h-4 bg-zinc-200 dark:bg-zinc-800 rounded w-14" />
                                                    <div className="h-3.5 bg-zinc-100 dark:bg-zinc-900 rounded-full w-20" />
                                                </div>
                                            </TableCell>
                                            <TableCell className="text-right">
                                                <div className="h-4 bg-zinc-200 dark:bg-zinc-800 rounded w-16 ml-auto" />
                                            </TableCell>
                                            <TableCell className="text-right">
                                                <div className="h-4 bg-zinc-200 dark:bg-zinc-800 rounded w-20 ml-auto" />
                                            </TableCell>
                                            <TableCell className="text-right">
                                                <div className="h-8 bg-zinc-200 dark:bg-zinc-800 rounded w-24 ml-auto" />
                                            </TableCell>
                                        </TableRow>
                                    ))
                                ) : filteredPedidos.length === 0 ? (
                                    <TableRow>
                            <TableCell colSpan={8} className="h-60 text-center">
                                            <div className="flex flex-col items-center gap-2 opacity-20">
                                                <List className="w-16 h-16" />
                                                <p className="font-bold text-xl uppercase tracking-tighter">Tudo em dia!</p>
                                                <p className="text-sm">Nenhuma pendência de compra encontrada.</p>
                                            </div>
                                        </TableCell>
                                    </TableRow>
                                ) : (
                                    paginatedPedidos.map(pedido => {
                                        const vencido = pedido.prazo_limite && new Date(pedido.prazo_limite) < new Date() && pedido.status !== 'COMPRADO'
                                        const urgente = pedido.prazo_limite && (new Date(pedido.prazo_limite).getTime() - new Date().getTime()) < (24 * 60 * 60 * 1000) && !vencido
                                        const details = getPedidoDetails(pedido)
                                        const pedidoObs = parseObservacoes(pedido.observacoes)
                                        
                                        return (
                                            <TableRow key={pedido.id} className={cn(
                                                "hover:bg-zinc-50 dark:hover:bg-zinc-800/50 transition-colors",
                                                pedido.status === 'EXCLUIDO' 
                                                    ? "bg-zinc-50/70 dark:bg-zinc-900/20 opacity-75 border-l-4 border-l-zinc-300"
                                                    : (vencido ? "bg-red-50 dark:bg-red-950/40 border-l-4 border-l-red-500" : urgente ? "bg-amber-50 dark:bg-amber-950/40 border-l-4 border-l-amber-500" : "")
                                            )}>
                                                <TableCell className="align-top py-4">
                                                    <div className="flex flex-col gap-2">
                                                        <span 
                                                            className={cn(
                                                                "font-semibold text-[13px] leading-relaxed cursor-pointer transition-all hover:text-brand-accent",
                                                                pedido.status === 'EXCLUIDO' ? "text-zinc-400 dark:text-zinc-500 line-through" : "text-zinc-800 dark:text-zinc-200",
                                                                expandedDescIds.has(pedido.id) ? 'whitespace-normal' : 'line-clamp-2'
                                                            )}
                                                            onClick={() => toggleDesc(pedido.id)}
                                                            title={expandedDescIds.has(pedido.id) ? "Clique para encolher" : "Clique para ver completo"}
                                                        >
                                                            {getItemDesc(pedido)}
                                                        </span>
                                                        {pedido.status === 'EXCLUIDO' && (() => {
                                                            const isEmpenhoExcluido = !!(pedido as any).empenho_excluido_por;
                                                            if (isEmpenhoExcluido) {
                                                                return (
                                                                    <div className="mt-1.5 p-2 bg-red-50/50 dark:bg-red-950/10 text-red-900 dark:text-red-200 border border-red-200 dark:border-red-900/30 rounded-lg text-[10px] font-semibold flex flex-col gap-0.5 shadow-sm">
                                                                        <span className="font-bold text-red-800 dark:text-red-400 flex items-center gap-1">🚫 EMPENHO EXCLUÍDO</span>
                                                                        <span className="font-normal text-zinc-700 dark:text-zinc-300">
                                                                            O empenho original <strong>{(pedido as any).empenho_numero_legado}</strong> foi excluído por <strong>{(pedido as any).empenho_excluido_por}</strong> em {(pedido as any).empenho_excluido_em ? new Date((pedido as any).empenho_excluido_em).toLocaleString('pt-BR') : '—'}.
                                                                        </span>
                                                                        <span className="italic font-normal mt-1 border-t border-red-150 dark:border-red-900/20 pt-1 text-red-800 dark:text-red-400">
                                                                            Motivo: "{(pedido as any).empenho_excluido_motivo}"
                                                                        </span>
                                                                    </div>
                                                                );
                                                            } else {
                                                                return (
                                                                    <div className="mt-1.5 p-2 bg-zinc-50 dark:bg-zinc-900/60 text-zinc-800 dark:text-zinc-250 border border-zinc-200 dark:border-zinc-800 rounded-lg text-[10px] font-semibold flex flex-col gap-0.5 shadow-sm">
                                                                        <span className="font-bold text-zinc-650 dark:text-zinc-400 flex items-center gap-1">⚠️ SOLICITAÇÃO EXCLUÍDA</span>
                                                                        <span className="font-normal text-zinc-600 dark:text-zinc-400">
                                                                            Excluída por <strong>{(pedido as any).excluido_por_nome || (pedido as any).usuario_solicitante}</strong> em {(pedido as any).excluido_em ? new Date((pedido as any).excluido_em).toLocaleString('pt-BR') : '—'}.
                                                                        </span>
                                                                        <span className="italic font-normal mt-1 border-t border-zinc-255 dark:border-zinc-800 pt-1 text-zinc-500">
                                                                            Motivo: "{(pedido as any).justificativa_exclusao || 'Sem justificativa informada.'}"
                                                                        </span>
                                                                    </div>
                                                                );
                                                            }
                                                        })()}
                                                        {pedido.status === 'CORRECAO' && (() => {
                                                            const obs = parseObservacoes(pedido.observacoes)
                                                            return obs?.motivo_quarentena && (
                                                                <div className="mt-1.5 p-2 bg-amber-50 dark:bg-amber-950/40 text-amber-900 dark:text-amber-200 border border-amber-200 dark:border-amber-900 rounded-lg text-[10px] font-semibold flex flex-col gap-0.5 shadow-sm">
                                                                    <span className="font-bold text-amber-800 dark:text-amber-300">⚠️ AGUARDANDO CORREÇÃO:</span>
                                                                    <span className="italic font-normal">"{obs.motivo_quarentena}"</span>
                                                                </div>
                                                            )
                                                        })()}
                                                        <div className="flex items-center gap-1.5 mt-1 flex-wrap text-[8.5px]">
                                                             <Badge variant="outline" className="w-fit text-[8.5px] h-3.5 px-1 font-bold uppercase tracking-tight bg-zinc-50 text-zinc-600 border-zinc-200/60 dark:bg-zinc-800 dark:text-zinc-300 dark:border-zinc-700">
                                                                 {getItemUnidade(pedido)}
                                                             </Badge>
                                                             <Badge variant="outline" className={cn("w-fit text-[8.5px] h-3.5 px-1 font-black uppercase tracking-tight border shadow-xs", getCategoryBadgeStyle(getItemCategoria(pedido)))}>
                                                                 {getItemCategoria(pedido)}
                                                             </Badge>
                                                             {getBatchStatus(pedido, nextCutoffDate) === 'CLOSED' ? (
                                                                 <Badge variant="outline" className="w-fit text-[8.5px] h-3.5 px-1 font-black uppercase tracking-tight bg-zinc-900 dark:bg-zinc-100 text-zinc-50 dark:text-zinc-900 border-none flex items-center gap-0.5 shadow-xs font-mono">
                                                                     Lote Pronto
                                                                 </Badge>
                                                             ) : (
                                                                 <Badge variant="outline" className="w-fit text-[8.5px] h-3.5 px-1 font-black uppercase tracking-tight bg-emerald-50/50 text-emerald-700 border-emerald-200/60 dark:bg-emerald-950/20 dark:text-emerald-400 dark:border-emerald-800/40 flex items-center gap-0.5 font-mono font-bold">
                                                                     Lote Aberto
                                                                 </Badge>
                                                             )}
                                                             {details.marca && (
                                                                 <Badge variant="outline" className="w-fit text-[8.5px] h-3.5 px-1 font-black uppercase tracking-tight bg-sky-50/50 text-sky-700 border-sky-200/60 flex items-center gap-0.5 font-mono dark:bg-sky-950/20 dark:text-sky-400 dark:border-sky-900/30 border">
                                                                     Marca: {details.marca}
                                                                 </Badge>
                                                             )}
                                                             {pedido.item_ata_id && !pedido.item_id && (() => { const obs = parseObservacoes(pedido.observacoes); return !obs?.tipo; })() && (
                                                                 <Badge variant="outline" className="w-fit text-[8.5px] h-3.5 px-1 font-black uppercase tracking-tight bg-purple-50 text-purple-600 border-purple-200 dark:bg-purple-950/30 dark:text-purple-400 dark:border-purple-900/50">
                                                                     ARP
                                                                 </Badge>
                                                             )}
                                                             {(() => { const obs = parseObservacoes(pedido.observacoes); return obs?.tipo === 'COMPRA_LIVRE' })() && (
                                                                 <Badge variant="outline" className="w-fit text-[8.5px] h-3.5 px-1 font-black uppercase tracking-tight bg-amber-50 text-amber-700 border-amber-300 dark:bg-amber-950/30 dark:text-amber-400 dark:border-amber-900/50 flex items-center gap-0.5">
                                                                     <Zap className="w-2.5 h-2.5 text-amber-500" />
                                                                     COMPRA LIVRE
                                                                 </Badge>
                                                             )}
                                                             {(() => {
                                                                 const obs = parseObservacoes(pedido.observacoes)
                                                                 if (obs?.compra_tipo === 'PARCIAL') {
                                                                     return (
                                                                         <Badge variant="outline" className="w-fit text-[8.5px] h-3.5 px-1 font-black uppercase tracking-tight bg-amber-500/10 text-amber-700 border-amber-300 dark:text-amber-400 dark:border-amber-900/50">
                                                                             Comprado Parcial
                                                                         </Badge>
                                                                     )
                                                                 }
                                                                 if (obs?.pedido_origem_id) {
                                                                     return (
                                                                         <Badge variant="outline" className="w-fit text-[8.5px] h-3.5 px-1 font-black uppercase tracking-tight bg-blue-500/10 text-blue-700 border-blue-300 dark:text-blue-400 dark:border-blue-900/50">
                                                                             Origem Parcial
                                                                         </Badge>
                                                                     )
                                                                 }
                                                                 return null
                                                             })()}
                                                             {details.observacao && (
                                                                 <Badge 
                                                                     variant="outline" 
                                                                     className="w-fit text-[8.5px] h-3.5 px-1 font-bold uppercase tracking-tight bg-amber-50/50 text-amber-800 border-amber-300 dark:bg-amber-950/30 dark:text-amber-300 dark:border-amber-900/50 flex items-center gap-0.5 cursor-pointer hover:bg-amber-100/60 transition-all select-none" 
                                                                     onClick={(e) => { e.stopPropagation(); toggleDesc(pedido.id); }}
                                                                     title="Clique para expandir/recolher a observação"
                                                                 >
                                                                     <MessageSquare className="w-2 h-2 text-amber-600" />
                                                                     OBS: {details.observacao.slice(0, 16)}{details.observacao.length > 16 ? '...' : ''}
                                                                 </Badge>
                                                             )}
                                                             {((pedido as any).solicitante_profile || pedido.usuario_solicitante) && (
                                                                 <Badge variant="outline" className="text-[8.5px] h-3.5 px-1.5 bg-blue-50/70 text-blue-700 border-blue-200/80 dark:bg-blue-950/30 dark:text-blue-300 dark:border-blue-900/40 font-semibold border">
                                                                     👤 {(pedido as any).solicitante_profile?.display_name || pedido.usuario_solicitante}
                                                                 </Badge>
                                                             )}
                                                        </div>
                                                        {(pedido.status === 'COMPRADO' || pedido.status === 'ATENDIDO') && (
                                                            <div className="flex flex-col gap-1 mt-1">
                                                                <div className="bg-emerald-50 text-emerald-900 border border-emerald-200 dark:bg-emerald-950/40 dark:text-emerald-200 dark:border-emerald-800 rounded px-2 py-1 text-[10px] font-medium flex flex-wrap gap-x-3 gap-y-0.5 w-fit">
                                                                    <span><strong>Valor Pago:</strong> {formatCurrency(pedido.valor_unitario_comprado || 0)}</span>
                                                                    <span><strong>Marca:</strong> {pedido.marca_comprada || '—'}</span>
                                                                    <span><strong>Chegada:</strong> {formatDisplayDate(pedido.prazo_estimado_chegada)}</span>
                                                                </div>
                                                                {pedidoObs?.compra_tipo === 'PARCIAL' && pedidoObs?.justificativa && (
                                                                    <div className="flex items-center gap-1.5 mt-0.5 bg-amber-50 text-amber-900 border border-amber-250/70 dark:bg-amber-950/20 dark:text-amber-300 dark:border-amber-900/40 p-2 rounded-lg w-fit max-w-lg">
                                                                        <Alert className="w-3.5 h-3.5 text-amber-500 shrink-0" />
                                                                        <div className="flex flex-col text-[10px] text-amber-800 dark:text-amber-300">
                                                                            <span className="font-semibold">MOTIVO COMPRA PARCIAL: {pedidoObs.justificativa}</span>
                                                                            {pedidoObs.falta_industria && <span className="text-[8px] font-bold text-red-500 dark:text-red-400 uppercase mt-0.5">Falta na Indústria</span>}
                                                                        </div>
                                                                        {pedidoObs.carta_industria_caminho && (
                                                                            <Button
                                                                                variant="ghost"
                                                                                size="icon"
                                                                                className="w-6 h-6 rounded-full hover:bg-amber-100 dark:hover:bg-amber-950 text-amber-700 ml-auto"
                                                                                onClick={() => handleVerDocumento(pedidoObs.carta_industria_caminho)}
                                                                                title="Ver Carta da Indústria"
                                                                            >
                                                                                <FileDown className="w-3.5 h-3.5" />
                                                                            </Button>
                                                                        )}
                                                                    </div>
                                                                )}
                                                            </div>
                                                        )}
                                                        {expandedDescIds.has(pedido.id) && details.observacao && (
                                                            <div className="mt-2 text-xs text-zinc-650 text-zinc-600 dark:text-zinc-400 bg-zinc-50 dark:bg-zinc-900 p-2.5 rounded-lg border border-zinc-200 dark:border-zinc-800 flex flex-col gap-1 shadow-inner animate-in fade-in slide-in-from-top-1 duration-200">
                                                                <span className="font-bold text-[9px] text-zinc-400 dark:text-zinc-500 uppercase tracking-wider">Observação da Solicitação</span>
                                                                <span className="leading-relaxed whitespace-pre-wrap">{details.observacao}</span>
                                                            </div>
                                                        )}
                                                        {expandedDescIds.has(pedido.id) && (() => {
                                                            const meta = parseObservacoes(pedido.observacoes)
                                                            const hasCorrections = meta && meta.historico_correcoes && meta.historico_correcoes.length > 0
                                                            if (!hasCorrections) return null
                                                            return (
                                                                <div className="mt-2 text-xs bg-amber-50/20 dark:bg-amber-950/10 p-2.5 rounded-lg border border-amber-200/40 dark:border-amber-900/30 flex flex-col gap-2 shadow-inner animate-in fade-in slide-in-from-top-1 duration-200">
                                                                    <span className="font-bold text-[9px] text-amber-600 dark:text-amber-400 uppercase tracking-wider flex items-center gap-1.5 font-mono">
                                                                        <Alert className="w-3.5 h-3.5 text-amber-500 shrink-0" />
                                                                        Histórico de Correções da Solicitação
                                                                    </span>
                                                                    <div className="space-y-2 mt-1">
                                                                        {meta.historico_correcoes.map((corr: any, idx: number) => (
                                                                            <div key={idx} className="border-b border-dashed border-amber-200/30 dark:border-amber-900/25 last:border-none pb-2 last:pb-0 text-[10px] text-zinc-600 dark:text-zinc-400">
                                                                                <div className="flex justify-between font-bold text-[9px] text-zinc-400 mb-0.5">
                                                                                    <span>Autor: {corr.autor}</span>
                                                                                    <span>{new Date(corr.data).toLocaleString('pt-BR')}</span>
                                                                                </div>
                                                                                <p className="italic bg-white/50 dark:bg-zinc-900/40 p-2 rounded border border-amber-100/40 dark:border-amber-950/40 mt-1 font-medium text-zinc-700 dark:text-zinc-300">
                                                                                    &ldquo;{corr.justificativa}&rdquo;
                                                                                </p>
                                                                                <div className="flex flex-wrap gap-x-3 gap-y-0.5 mt-1 text-[9px] font-mono text-zinc-400 uppercase">
                                                                                    {corr.de_quantidade !== corr.para_quantidade && (
                                                                                        <span>Qtd: {corr.de_quantidade} &rarr; {corr.para_quantidade}</span>
                                                                                    )}
                                                                                    {corr.de_categoria !== corr.para_categoria && (
                                                                                        <span>Categoria: {corr.de_categoria} &rarr; {corr.para_categoria}</span>
                                                                                    )}
                                                                                    {corr.de_prazo !== corr.para_prazo && (
                                                                                        <span>Prazo: {formatDisplayDate(corr.de_prazo)} &rarr; {formatDisplayDate(corr.para_prazo)}</span>
                                                                                    )}
                                                                                </div>
                                                                            </div>
                                                                        ))}
                                                                    </div>
                                                                </div>
                                                            )
                                                        })()}
                                                        {(() => {
                                                            const meta = parseObservacoes(pedido.observacoes)
                                                            if (pedido.status !== 'FALHA' || !meta?.justificativa) return null
                                                            return (
                                                                <div className="flex items-center gap-1.5 mt-1.5 bg-red-50 text-red-900 border border-red-200 dark:bg-red-950/40 dark:text-red-200 dark:border-red-900 p-2 rounded-lg">
                                                                    <Alert className="w-3.5 h-3.5 text-red-600 shrink-0" />
                                                                    <div className="flex flex-col text-[10px] text-red-700 dark:text-red-400">
                                                                        <span className="font-semibold">FALHA: {meta.justificativa}</span>
                                                                        {meta.falta_industria && <span className="text-[8px] font-bold text-red-500 uppercase">Falta na Indústria</span>}
                                                                    </div>
                                                                    {meta.carta_industria_caminho && (
                                                                        <Button
                                                                            variant="ghost"
                                                                            size="icon"
                                                                            className="h-6 w-6 p-0 hover:bg-red-100 dark:hover:bg-red-950/20 text-red-700 ml-auto shrink-0"
                                                                            title="Download da Carta da Indústria"
                                                                            onClick={(e) => {
                                                                                e.stopPropagation()
                                                                                const url = getCleanPublicUrl(meta.carta_industria_caminho)
                                                                                window.open(url, '_blank')
                                                                            }}
                                                                        >
                                                                            <FileDown className="w-3.5 h-3.5" />
                                                                        </Button>
                                                                    )}
                                                                </div>
                                                            )
                                                        })()}
                                                    </div>
                                                </TableCell>
                                                <TableCell className="align-top py-4">
                                                    <div className="flex flex-col gap-1.5">
                                                        {pedido.item_id || (pedido as any).empenho_numero_legado ? (
                                                            <>
                                                                <div className="flex items-center gap-1.5 flex-wrap">
                                                                    <span className="text-[10px] font-semibold text-zinc-600 dark:text-zinc-400 bg-zinc-50 dark:bg-zinc-850 px-1.5 py-0.5 rounded font-mono border border-zinc-200/50 dark:border-zinc-700/50">
                                                                        NE: {pedido.item?.nota?.numero_ne || (pedido as any).empenho_numero_legado || '—'}
                                                                    </span>
                                                                    {(pedido.item?.nota as any)?.ata?.numero_arp && (
                                                                        <span className="text-[9px] font-bold bg-blue-50/50 text-blue-600 border border-blue-200 dark:bg-blue-950/20 dark:text-blue-400 dark:border-blue-900/30 px-1.5 py-0.5 rounded">
                                                                            ARP: {(pedido.item?.nota as any).ata.numero_arp}
                                                                        </span>
                                                                    )}
                                                                </div>
                                                                <span className="text-[10px] text-zinc-500 dark:text-zinc-400 leading-relaxed line-clamp-1" title={pedido.item?.nota?.emissor || 'ÓRGÃO NÃO INFORMADO'}>
                                                                    {pedido.item?.nota?.emissor || 'ÓRGÃO NÃO INFORMADO'}
                                                                </span>
                                                            </>
                                                        ) : (() => {
                                                            const obs = parseObservacoes(pedido.observacoes)
                                                            if (obs?.tipo === 'COMPRA_LIVRE') return (
                                                                <>
                                                                    <div className="flex items-center gap-1.5 flex-wrap">
                                                                        <span className="text-[11px] font-bold text-amber-800 dark:text-amber-300 bg-amber-500/10 px-1.5 py-0.5 rounded font-mono uppercase tracking-tight">
                                                                            {obs.tipo_documento || 'DOCUMENTO'}: {obs.documento_origem}
                                                                        </span>
                                                                    </div>
                                                                    {obs.orgao_solicitante && (
                                                                        <span className="text-[10px] text-zinc-500 dark:text-zinc-400 leading-relaxed line-clamp-1" title={obs.orgao_solicitante}>
                                                                            {obs.orgao_solicitante}
                                                                        </span>
                                                                    )}
                                                                </>
                                                            )
                                                            return (
                                                                <>
                                                                    <div className="flex items-center gap-1.5 flex-wrap">
                                                                        <span className="text-[11px] font-bold text-zinc-900 dark:text-zinc-100 bg-zinc-100 dark:bg-zinc-800 px-1.5 py-0.5 rounded font-mono uppercase tracking-tight">
                                                                            ARP DIRETA
                                                                        </span>
                                                                        {pedido.item_ata?.ata?.numero_arp && (
                                                                            <span className="text-[9px] font-bold bg-blue-50/50 text-blue-600 border border-blue-200 dark:bg-blue-950/20 dark:text-blue-400 dark:border-blue-900/30 px-1.5 py-0.5 rounded">
                                                                                ARP: {pedido.item_ata.ata.numero_arp}
                                                                            </span>
                                                                        )}
                                                                    </div>
                                                                    <span className="text-[10px] text-zinc-500 dark:text-zinc-400 leading-relaxed line-clamp-1" title={pedido.item_ata?.ata?.entidade_gerenciadora || 'GERENCIADORA NÃO INFORMADA'}>
                                                                        {pedido.item_ata?.ata?.entidade_gerenciadora || 'GERENCIADORA NÃO INFORMADA'}
                                                                    </span>
                                                                </>
                                                            )
                                                        })()}
                                                    </div>
                                                </TableCell>
                                                <TableCell className="align-top py-4">
                                                    <div className="flex flex-col gap-0.5">
                                                        <div className="flex items-center gap-1.5">
                                                            <ClockIcon className={cn("w-3.5 h-3.5", vencido ? "text-red-500" : "text-zinc-400")} />
                                                            <span className={cn("text-xs font-black", vencido ? "text-red-600 font-mono" : "text-zinc-700 dark:text-zinc-300")}>
                                                                {pedido.prazo_limite ? formatDisplayDate(pedido.prazo_limite) : 'S/ PRAZO'}
                                                            </span>
                                                        </div>
                                                        {pedido.prazo_limite && pedido.status !== 'COMPRADO' && pedido.status !== 'ATENDIDO' && pedido.status !== 'EM_ESTOQUE' && (
                                                            <span className="text-[9px] font-medium text-zinc-500 pl-5">
                                                                 {(() => {
                                                                     if (vencido) return 'SLA EXCEDIDO';
                                                                     const target = new Date(pedido.prazo_limite);
                                                                     const diff = Math.ceil((target.getTime() - new Date().getTime()) / (1000 * 60 * 60 * 24));
                                                                     return isNaN(diff) ? 'DATA INVÁLIDA' : `Restam ${diff} dias`;
                                                                 })()}
                                                             </span>
                                                        )}
                                                        {(pedido.status === 'COMPRADO' || pedido.status === 'ATENDIDO' || pedido.status === 'EM_ESTOQUE') && pedido.prazo_estimado_chegada && (
                                                            <span className="text-[9px] font-extrabold text-emerald-600 dark:text-emerald-400 pl-5 uppercase tracking-tighter">
                                                                Prazo Entrega: {formatDisplayDate(pedido.prazo_estimado_chegada)}
                                                            </span>
                                                        )}
                                                    </div>
                                                </TableCell>
                                                <TableCell className="text-right font-medium font-mono text-zinc-800 dark:text-zinc-200 text-xs align-top py-4">
                                                    {formatCurrency(getItemValorUnitario(pedido))}
                                                </TableCell>
                                                <TableCell className="align-top py-4">
                                                    <div className="flex items-center gap-4">
                                                        <div className="flex flex-col">
                                                            <span className={cn(
                                                                "text-sm font-black",
                                                                vencido ? "text-red-600 dark:text-red-400/90" : urgente ? "text-amber-600 dark:text-amber-400/90" : "text-red-600 dark:text-red-400/90"
                                                            )}>
                                                                {pedido.quantidade_solicitada} {getItemUnidade(pedido)}
                                                            </span>
                                                            <Badge 
                                                                variant={pedido.status === 'ATENDIDO' ? 'secondary' : pedido.status === 'EM_ESTOQUE' ? 'secondary' : pedido.status === 'COMPRADO' ? 'success' : pedido.status === 'COTACAO' ? 'warning' : pedido.status === 'FALHA' ? 'destructive' : 'outline'} 
                                                                className={cn(
                                                                    "text-[9px] w-fit h-4 px-1",
                                                                    pedido.status === 'ATENDIDO' && "bg-violet-100 text-violet-700 border-violet-200 dark:bg-violet-950/30 dark:text-violet-400 dark:border-violet-900/50",
                                                                    pedido.status === 'EM_ESTOQUE' && "bg-blue-100 text-blue-700 border-blue-200 dark:bg-blue-950/30 dark:text-blue-400 dark:border-blue-900/50",
                                                                    pedido.status === 'FALHA' && "bg-red-100 text-red-700 border-red-200 dark:bg-red-950/30 dark:text-red-400/90 dark:border-red-900/50",
                                                                    (pedido.status === 'PENDENTE' || !pedido.status) && (
                                                                        vencido 
                                                                            ? "text-red-600 border-red-200 dark:text-red-400/90 dark:border-red-900/50" 
                                                                            : urgente 
                                                                                ? "text-amber-600 border-amber-200 dark:text-amber-400/90 dark:border-amber-900/50" 
                                                                                : "text-red-600 border-red-200 dark:text-red-400/90 dark:border-red-900/50"
                                                                    )
                                                                )}
                                                            >
                                                                {pedido.status === 'ATENDIDO' ? 'Empenho já atendido' : pedido.status === 'EM_ESTOQUE' ? 'Em Estoque' : pedido.status === 'FALHA' ? 'Falha na Compra' : (pedido.status || 'PENDENTE')}
                                                            </Badge>
                                                        </div>
                                                    </div>
                                                </TableCell>
                                                <TableCell className="text-right align-top py-4">
                                                    <div className="flex flex-col items-end gap-1">
                                                        <span className="text-xs font-bold text-zinc-950 dark:text-zinc-100 flex items-center gap-1">
                                                            <User className="w-3 h-3 text-zinc-400 shrink-0" />
                                                            {(pedido as any).solicitante_profile?.display_name || pedido.usuario_solicitante || '—'}
                                                        </span>
                                                        {(pedido as any).solicitante_profile?.setor && (
                                                            <span className="text-[9px] font-extrabold text-brand-accent bg-brand-accent/5 px-1.5 py-0.5 rounded border border-brand-accent/10 uppercase tracking-wider block w-fit">
                                                                {(pedido as any).solicitante_profile.setor}
                                                            </span>
                                                        )}
                                                        {(pedido as any).solicitante_profile?.email && (
                                                            <span className="text-[9px] text-zinc-450 dark:text-zinc-500 font-mono font-medium block">
                                                                {(pedido as any).solicitante_profile.email}
                                                            </span>
                                                        )}
                                                        {pedido.created_at && (
                                                            <span className="text-[9px] text-zinc-400 dark:text-zinc-500 font-mono font-medium block mt-0.5">
                                                                Reg: {formatDisplayDateTime(pedido.created_at)}
                                                            </span>
                                                        )}
                                                        {(pedido.e_notificacao || !!pedido.item?.nota?.e_notificacao) && (
                                                            <div className="flex items-center gap-1">
                                                                <Badge className="bg-red-100 text-red-700 hover:bg-red-200 dark:bg-red-950/40 dark:text-red-400 border-none text-[8px] px-1.5 font-bold uppercase py-0.5 select-none">
                                                                    NOTIF.
                                                                </Badge>
                                                                {pedido.data_notificacao && (
                                                                     <span className="text-[8px] font-mono font-bold text-red-600 bg-red-50 dark:bg-red-950/30 px-1.5 py-0.5 rounded border border-red-200/40">
                                                                         {formatDisplayDate(pedido.data_notificacao)}
                                                                     </span>
                                                                )}
                                                                {(pedido.arquivo_notificacao || pedido.item?.nota?.arquivo_notificacao) && (
                                                                    <Button
                                                                        variant="outline"
                                                                        size="icon"
                                                                        className="h-6 w-6 border-red-200 hover:bg-red-50 dark:border-red-900/30 dark:hover:bg-red-950/20 text-red-700 hover:text-red-800 dark:text-red-400"
                                                                        title="Ver Documento da Notificação"
                                                                        onClick={() => handleVerDocumento(pedido.arquivo_notificacao || pedido.item?.nota?.arquivo_notificacao)}
                                                                    >
                                                                        <EyeIcon className="w-3 h-3" />
                                                                    </Button>
                                                                )}
                                                            </div>
                                                        )}
                                                        {(pedido.demanda_judicial || !!pedido.item?.nota?.demanda_judicial) && (
                                                            <div className="flex items-center gap-1 mt-1">
                                                                <Badge className="bg-purple-100 text-purple-700 hover:bg-purple-200 dark:bg-purple-950/40 dark:text-purple-400 border-none text-[8px] px-1.5 font-bold uppercase py-0.5 select-none">
                                                                    ⚖️ JUDICIAL
                                                                </Badge>
                                                                {(pedido.arquivo_demanda_judicial || pedido.item?.nota?.arquivo_demanda_judicial) && (
                                                                    <Button
                                                                        variant="outline"
                                                                        size="icon"
                                                                        className="h-6 w-6 border-purple-200 hover:bg-purple-50 dark:border-purple-900/30 dark:hover:bg-purple-950/20 text-purple-700 hover:text-purple-800 dark:text-purple-400"
                                                                        title="Ver Documento da Demanda Judicial"
                                                                        onClick={() => handleVerDocumento(pedido.arquivo_demanda_judicial || pedido.item?.nota?.arquivo_demanda_judicial)}
                                                                    >
                                                                        <EyeIcon className="w-3 h-3" />
                                                                    </Button>
                                                                )}
                                                            </div>
                                                        )}
                                                    </div>
                                                </TableCell>
                                                <TableCell className="text-right align-top py-4">
                                                    <div className="flex items-center gap-2 justify-end">
                                                        {pedido.status === 'EXCLUIDO' ? (
                                                            <div className="flex items-center justify-center gap-1.5 px-3 py-1 bg-zinc-100 dark:bg-zinc-900 rounded-md border border-zinc-200 dark:border-zinc-800 w-32 select-none">
                                                                <span className="text-[10px] font-bold text-zinc-400 dark:text-zinc-500 uppercase tracking-tight">EXCLUÍDO</span>
                                                            </div>
                                                        ) : !isReadOnly ? (
                                                             <Select
                                                                 value={pedido.assigned_to || 'unassigned'}
                                                                 onValueChange={(val) => {
                                                                     if (val === 'unassigned') {
                                                                         assignPedido(pedido.id, null)
                                                                     } else {
                                                                         handleOpenReassignModal(pedido, null, val)
                                                                     }
                                                                 }}
                                                             >
                                                                 <SelectTrigger className="h-8 text-[10px] w-32 border-zinc-200 dark:border-zinc-700 bg-white dark:bg-zinc-900 font-bold uppercase transition-all hover:border-brand-accent">
                                                                     <div className="flex items-center gap-2 overflow-hidden text-ellipsis">
                                                                         <UserPlus className="w-3 h-3 text-brand-accent shrink-0" />
                                                                         <SelectValue placeholder="Distribuir..." />
                                                                     </div>
                                                                 </SelectTrigger>
                                                                 <SelectContent>
                                                                     <SelectItem value="unassigned" className="text-[10px] font-bold text-zinc-400">AGUARDANDO...</SelectItem>
                                                                     {profiles.map(p => (
                                                                         <SelectItem key={p.id} value={p.id} className="text-[10px] font-medium">
                                                                             {p.display_name?.toUpperCase()}
                                                                         </SelectItem>
                                                                     ))}
                                                                 </SelectContent>
                                                             </Select>
                                                        ) : (
                                                            <div className="flex items-center gap-2 px-3 py-1 bg-zinc-100 dark:bg-zinc-900 rounded-md border border-zinc-200 dark:border-zinc-800">
                                                                <UserPlus className="w-3 h-3 text-zinc-400" />
                                                                <span className="text-[10px] font-bold text-zinc-600 dark:text-zinc-400 uppercase tracking-tight">
                                                                    {pedido.assigned_profile?.display_name || 'NÃO ATRIBUÍDO'}
                                                                </span>
                                                            </div>
                                                        )}
                                                    </div>
                                                </TableCell>
                                                <TableCell className="text-right align-top py-4">
                                                    <div className="flex justify-end items-center gap-1.5">
                                                        {pedido.status === 'EXCLUIDO' ? (
                                                            <>
                                                                <Button 
                                                                    variant="outline" 
                                                                    size="icon" 
                                                                    className="h-8 w-8 hover:bg-zinc-100 dark:hover:bg-zinc-800 transition-all active:scale-95 shrink-0" 
                                                                    title="Ver Detalhes da Solicitação"
                                                                    onClick={() => setDetalhesPedido(pedido)}
                                                                >
                                                                    <EyeIcon className="w-4 h-4 text-zinc-600 dark:text-zinc-400" />
                                                                </Button>
                                                                <Button 
                                                                    variant="outline" 
                                                                    size="icon" 
                                                                    className="h-8 w-8 hover:bg-amber-50 text-amber-700 border-amber-200 dark:hover:bg-amber-950/30 dark:text-amber-400 dark:border-amber-900/40 transition-all active:scale-95 shrink-0" 
                                                                    title="Ver Histórico de Atividades / Linha do Tempo"
                                                                    onClick={() => handleOpenHistoryModal(pedido)}
                                                                >
                                                                    <History className="w-4 h-4 text-amber-600 dark:text-amber-400" />
                                                                </Button>
                                                            </>
                                                        ) : (
                                                            <>
                                                        {pedido.status !== 'COMPRADO' && pedido.status !== 'ATENDIDO' && pedido.status !== 'EM_ESTOQUE' && !isReadOnly && (
                                                            <Button
                                                                variant="outline"
                                                                size="sm"
                                                                className="h-8 text-[10px] font-black uppercase text-emerald-600 border-emerald-200 hover:bg-emerald-50 gap-1 shrink-0 dark:bg-emerald-950/40 dark:text-emerald-300 dark:border-emerald-800/60 border hover:dark:bg-emerald-900/60"
                                                                onClick={() => handleOpenRegistrarCompra(pedido)}
                                                            >
                                                                <ShoppingCart className="w-3.5 h-3.5" />
                                                                Registrar
                                                            </Button>
                                                        )}
                                                        {!isReadOnly ? (
                                                            <Select 
                                                                value={pedido.status || 'PENDENTE'} 
                                                                onValueChange={(v: string) => handleStatusChange(pedido, v)}
                                                            >
                                                                <SelectTrigger className="h-8 text-[10px] w-28 border-zinc-200 dark:border-zinc-700 bg-white dark:bg-zinc-900 font-medium">
                                                                    <SelectValue />
                                                                </SelectTrigger>
                                                                <SelectContent>
                                                                    <SelectItem value="PENDENTE">Aguardando</SelectItem>
                                                                    <SelectItem value="COTACAO">Em Cotação</SelectItem>
                                                                    <SelectItem value="COMPRADO">Comprado</SelectItem>
                                                                    <SelectItem value="EM_ESTOQUE">Em Estoque</SelectItem>
                                                                    <SelectItem value="FALHA">Falha na Compra</SelectItem>
                                                                    <SelectItem value="CORRECAO">Erro de Cadastro</SelectItem>
                                                                </SelectContent>
                                                            </Select>
                                                        ) : (
                                                            renderMiniStepper(pedido.status || 'PENDENTE')
                                                        )}
                                                        
                                                        <Button 
                                                            variant="outline" 
                                                            size="icon" 
                                                            className="h-8 w-8 hover:bg-zinc-100 dark:hover:bg-zinc-800 transition-all active:scale-95 shrink-0" 
                                                            title="Ver Detalhes da Solicitação"
                                                            onClick={() => setDetalhesPedido(pedido)}
                                                        >
                                                            <EyeIcon className="w-4 h-4 text-zinc-600 dark:text-zinc-400" />
                                                        </Button>
                                                        <Button 
                                                            variant="outline" 
                                                            size="icon" 
                                                            className="h-8 w-8 hover:bg-amber-50 text-amber-700 border-amber-200 dark:hover:bg-amber-950/30 dark:text-amber-400 dark:border-amber-900/40 transition-all active:scale-95 shrink-0" 
                                                            title="Ver Histórico de Atividades / Linha do Tempo"
                                                            onClick={() => handleOpenHistoryModal(pedido)}
                                                        >
                                                            <History className="w-4 h-4 text-amber-600 dark:text-amber-400" />
                                                        </Button>

                                                        {pedido.item?.nota?.arquivo_caminho && (
                                                            <Button 
                                                                variant="outline" 
                                                                size="icon" 
                                                                className="h-8 w-8 hover:bg-brand-accent/10 transition-all active:scale-95 shrink-0" 
                                                                title="Ver PDF da NE"
                                                                onClick={() => handleVerDocumento(pedido.item?.nota?.arquivo_caminho)}
                                                            >
                                                                <EyeIcon className="w-4 h-4 text-brand-accent" />
                                                            </Button>
                                                        )}
                                                        {pedido.item_ata?.ata?.arquivo_caminho && (
                                                            <Button 
                                                                variant="outline" 
                                                                size="icon" 
                                                                className="h-8 w-8 hover:bg-brand-accent/10 transition-all active:scale-95 shrink-0" 
                                                                title="Ver PDF da ARP"
                                                                onClick={() => handleVerDocumento(pedido.item_ata?.ata?.arquivo_caminho)}
                                                            >
                                                                <EyeIcon className="w-4 h-4 text-brand-accent" />
                                                            </Button>
                                                        )}
                                                        
                                                        {/* Botão de Excluir para ADM de Vendas / DEV (apenas se pendente) */}
                                                        {canDeletePedidoCompra(profile) && (pedido.status === 'PENDENTE' || !pedido.status || pedido.status === 'AGUARDANDO') && (
                                                            <Button
                                                                variant="outline"
                                                                size="icon"
                                                                className="h-8 w-8 text-red-500 hover:bg-red-50 hover:text-red-600 border-red-200 transition-all active:scale-95 shrink-0 dark:bg-red-950/40 dark:text-red-400 dark:border-red-900/50 hover:dark:bg-red-900/60"
                                                                title="Excluir Solicitação de Compra Pendente"
                                                                onClick={() => handleOpenExcluirModal(pedido)}
                                                            >
                                                                <Trash2 className="w-4 h-4" />
                                                            </Button>
                                                        )}

                                                        {/* Botão de Marcar como Notificado */}
                                                        {(pedido.solicitante_id === profile?.id || profile?.nivel === 'DEV' || profile?.nivel === 'ADM') && 
                                                         pedido.status !== 'COMPRADO' && 
                                                         pedido.status !== 'ATENDIDO' && 
                                                         pedido.status !== 'EM_ESTOQUE' && 
                                                         !pedido.e_notificacao && (
                                                            <Button
                                                                variant="outline"
                                                                size="icon"
                                                                className="h-8 w-8 text-amber-500 hover:bg-amber-50 hover:text-amber-600 border-amber-200 transition-all active:scale-95 shrink-0 dark:bg-amber-950/40 dark:text-amber-400 dark:border-amber-900/50 hover:dark:bg-amber-900/60"
                                                                title="Marcar como Notificada (Registrar Atraso)"
                                                                onClick={() => {
                                                                    setSelectedPedidoParaNotificar(pedido)
                                                                    setNotificarData(new Date().toISOString().split('T')[0])
                                                                    setNotificarFile(null)
                                                                    setNotificarModalOpen(true)
                                                                }}
                                                            >
                                                                <Alert className="w-4 h-4" />
                                                            </Button>
                                                        )}

                                                        {/* Botão de Correção / Edição para Gestores/Admins ou solicitante se em quarentena (ou Aristóteles provisoriamente) */}
                                                        {canEditPedidoCompra(pedido) ? (
                                                            <Button
                                                                variant="outline"
                                                                size="icon"
                                                                className="h-8 w-8 text-amber-600 hover:bg-amber-50 hover:text-amber-700 border-amber-200 dark:text-amber-400 dark:hover:bg-amber-950/30 dark:hover:text-amber-300 dark:border-amber-900/50 transition-all active:scale-95 shrink-0"
                                                                title="Corrigir / Editar Solicitação de Compra"
                                                                onClick={() => handleOpenCorrigir(pedido)}
                                                            >
                                                                <Pencil className="w-4 h-4" />
                                                            </Button>
                                                        ) : (
                                                            // Lógica existente para usuários normais alterarem Compra Livre própria em até 15 min
                                                            (() => {
                                                                const obs = parseObservacoes(pedido.observacoes)
                                                                if (obs?.tipo !== 'COMPRA_LIVRE') return null
                                                                const createdAt = (pedido as any).created_at
                                                                if (!createdAt) return null
                                                                const minutosDecorridos = (Date.now() - new Date(createdAt).getTime()) / 60000
                                                                if (minutosDecorridos > 15) return null
                                                                return (
                                                                    <>
                                                                        <Button
                                                                            variant="outline"
                                                                            size="icon"
                                                                            className="h-8 w-8 text-amber-600 hover:bg-amber-50 hover:text-amber-700 border-amber-200 dark:text-amber-400 dark:hover:bg-amber-950/30 dark:hover:text-amber-300 dark:border-amber-900/50 transition-all active:scale-95 shrink-0"
                                                                            title="Alterar Compra Livre (dentro de 15 min)"
                                                                            onClick={() => handleEditCompraLivre(pedido)}
                                                                        >
                                                                            <Pencil className="w-4 h-4" />
                                                                        </Button>
                                                                        <Button
                                                                            variant="outline"
                                                                            size="icon"
                                                                            className="h-8 w-8 text-red-500 hover:bg-red-50 hover:text-red-600 border-red-200 dark:text-red-400 dark:hover:bg-red-950/30 dark:hover:text-red-300 dark:border-red-900/50 transition-all active:scale-95 shrink-0"
                                                                            title="Cancelar Compra Livre (dentro de 15 min)"
                                                                            onClick={() => handleOpenExcluirModal(pedido)}
                                                                        >
                                                                            <Trash2 className="w-4 h-4" />
                                                                        </Button>
                                                                    </>
                                                                )
                                                            })()
                                                        )}
                                                            </>
                                                        )}
                                                    </div>
                                                </TableCell>
                                            </TableRow>
                                        )
                                    })
                                )}
                            </TableBody>
                        </>
                    )}
                </Table>
                
                {/* Pagination Controls */}
                {totalPages > 1 && (
                    <div className="flex items-center justify-between p-4 border-t border-zinc-150 dark:border-zinc-800 bg-zinc-50/50 dark:bg-zinc-900/30">
                        <div className="text-xs text-zinc-500 font-bold uppercase tracking-wider">
                            Página {currentPage} de {totalPages} ({filteredPedidos.length} itens)
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
            </Card>

            <div className="p-4 bg-amber-50 text-amber-900 border border-amber-200 dark:bg-amber-950/40 dark:text-amber-200 dark:border-amber-800 rounded-2xl flex items-center gap-4 text-sm">
                <Alert className="w-5 h-5 flex-shrink-0" />
                <span>
                    <strong>Auditando:</strong> Todas as solicitações de compra manual das ATAs e Notas são consolidadas aqui. Consulte os PDFs originais se houver dúvida sobre descrição ou marca.
                </span>
            </div>

            {/* Modal de Detalhes da Solicitação */}
            <Dialog open={!!detalhesPedido} onOpenChange={(open) => { if (!open) setDetalhesPedido(null) }}>
                <DialogContent className="sm:max-w-2xl max-h-[90vh] overflow-y-auto bg-white dark:bg-zinc-950 border border-zinc-200 dark:border-zinc-800 rounded-3xl p-6 shadow-2xl">
                    <DialogHeader className="border-b border-zinc-100 dark:border-zinc-800/60 pb-4 space-y-1">
                        <div className="flex items-center gap-2.5">
                            <DialogTitle className="text-lg font-black text-zinc-900 dark:text-white uppercase tracking-tight">
                                Detalhes da Solicitação
                            </DialogTitle>
                            {detalhesPedido && (
                                <Badge 
                                    variant={detalhesPedido.status === 'ATENDIDO' ? 'secondary' : detalhesPedido.status === 'EM_ESTOQUE' ? 'secondary' : detalhesPedido.status === 'COMPRADO' ? 'success' : detalhesPedido.status === 'COTACAO' ? 'warning' : detalhesPedido.status === 'FALHA' ? 'destructive' : 'outline'} 
                                    className="text-[10px] uppercase font-extrabold tracking-tight h-5"
                                >
                                    {detalhesPedido.status === 'ATENDIDO' ? 'Atendido' : detalhesPedido.status === 'EM_ESTOQUE' ? 'Em Estoque' : detalhesPedido.status === 'FALHA' ? 'Falha na Compra' : (detalhesPedido.status || 'PENDENTE')}
                                </Badge>
                            )}
                        </div>
                        <DialogDescription className="text-xs text-zinc-400 font-medium">
                            Histórico completo, especificações e características desta solicitação de compra.
                        </DialogDescription>
                    </DialogHeader>

                    {detalhesPedido && (() => {
                        const p = detalhesPedido
                        const obs = parseObservacoes(p.observacoes)
                        
                        // Campos calculados com fallback para solicitações legadas/existentes
                        const marcaReferencia = obs?.marca || null
                        const observacaoSolicitante = obs ? (obs.obs_adicional || obs.observacao || null) : p.observacoes
                        const eNotif = p.e_notificacao || obs?.e_notificacao || false
                        const arquivoNotif = p.arquivo_notificacao || obs?.arquivo_notificacao || obs?.arquivo_notificacao_caminho || null
                        const eJudicial = p.demanda_judicial || obs?.demanda_judicial || false
                        const arquivoJudicial = p.arquivo_demanda_judicial || obs?.arquivo_demanda_judicial_caminho || null

                        const orgaoCliente = obs?.orgao_solicitante || p.item?.nota?.emissor || p.item_ata?.ata?.entidade_gerenciadora || '—'
                        const tipoDoc = obs?.tipo_documento || (p.item_id ? 'EMPENHO' : (p.item_ata_id ? 'ARP' : 'ARP DIRETA'))
                        const docOrigem = obs?.documento_origem || p.item?.nota?.numero_ne || p.item_ata?.ata?.numero_arp || '—'

                        return (
                            <div className="space-y-6 py-4 text-zinc-700 dark:text-zinc-300 text-sm">
                                {/* Informações do Item */}
                                <div className="space-y-3">
                                    <h4 className="text-[10px] font-black text-zinc-400 dark:text-zinc-500 uppercase tracking-widest border-l-2 border-brand-accent pl-2">Informações do Item</h4>
                                    <div className="bg-zinc-50 dark:bg-zinc-900/60 p-4 rounded-2xl border border-zinc-200/50 dark:border-zinc-800/40 space-y-2.5">
                                        <div>
                                            <span className="text-[10px] font-bold text-zinc-400 uppercase tracking-wide">Descrição</span>
                                            <p className="font-extrabold text-zinc-900 dark:text-white leading-relaxed uppercase">{getItemDesc(p)}</p>
                                        </div>
                                        <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 pt-1.5 border-t border-dashed border-zinc-200/60 dark:border-zinc-850/40">
                                            <div>
                                                <span className="text-[10px] font-bold text-zinc-400 uppercase tracking-wide">Categoria</span>
                                                <p className="font-bold text-zinc-800 dark:text-zinc-200 mt-0.5">{getItemCategoria(p)}</p>
                                            </div>
                                            <div>
                                                <span className="text-[10px] font-bold text-zinc-400 uppercase tracking-wide">Quantidade</span>
                                                <p className="font-mono font-black text-zinc-800 dark:text-zinc-200 mt-0.5">{p.quantidade_solicitada} {getItemUnidade(p)}</p>
                                            </div>
                                            <div>
                                                <span className="text-[10px] font-bold text-zinc-400 uppercase tracking-wide">Vl. Unit. Estimado</span>
                                                <p className="font-mono font-bold text-zinc-800 dark:text-zinc-200 mt-0.5">{formatCurrency(getItemValorUnitario(p))}</p>
                                            </div>
                                            <div>
                                                <span className="text-[10px] font-bold text-zinc-400 uppercase tracking-wide">Total Estimado</span>
                                                <p className="font-mono font-black text-brand-accent mt-0.5">{formatCurrency(p.quantidade_solicitada * getItemValorUnitario(p))}</p>
                                            </div>
                                        </div>
                                    </div>
                                </div>

                                {/* Origem e Solicitante */}
                                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                                    <div className="space-y-3">
                                        <h4 className="text-[10px] font-black text-zinc-400 dark:text-zinc-500 uppercase tracking-widest border-l-2 border-brand-accent pl-2">Origem da Demanda</h4>
                                        <div className="bg-zinc-50 dark:bg-zinc-900/60 p-4 rounded-2xl border border-zinc-200/50 dark:border-zinc-800/40 space-y-2.5 h-[calc(100%-28px)]">
                                            <div>
                                                <span className="text-[10px] font-bold text-zinc-400 uppercase tracking-wide">Tipo / Doc. Origem</span>
                                                <p className="font-bold text-zinc-800 dark:text-zinc-200 mt-0.5 font-mono text-[13px]">{tipoDoc} : {docOrigem}</p>
                                            </div>
                                            <div>
                                                <span className="text-[10px] font-bold text-zinc-400 uppercase tracking-wide">Cliente / Órgão Solicitante</span>
                                                <p className="font-medium text-zinc-800 dark:text-zinc-200 mt-0.5 line-clamp-2" title={orgaoCliente}>{orgaoCliente}</p>
                                            </div>
                                        </div>
                                    </div>

                                    <div className="space-y-3">
                                        <h4 className="text-[10px] font-black text-zinc-400 dark:text-zinc-500 uppercase tracking-widest border-l-2 border-brand-accent pl-2">Solicitante</h4>
                                        <div className="bg-zinc-50 dark:bg-zinc-900/60 p-4 rounded-2xl border border-zinc-200/50 dark:border-zinc-800/40 space-y-2 h-[calc(100%-28px)]">
                                            <div>
                                                <span className="text-[10px] font-bold text-zinc-400 uppercase tracking-wide">Nome</span>
                                                <p className="font-bold text-zinc-800 dark:text-zinc-200 mt-0.5">{p.solicitante_profile?.display_name || p.usuario_solicitante || '—'}</p>
                                            </div>
                                            <div className="grid grid-cols-2 gap-2 pt-1 border-t border-dashed border-zinc-200/65 dark:border-zinc-850/45">
                                                <div>
                                                    <span className="text-[10px] font-bold text-zinc-400 uppercase tracking-wide">Setor</span>
                                                    <p className="font-bold text-brand-accent text-xs mt-0.5">{p.solicitante_profile?.setor || '—'}</p>
                                                </div>
                                                <div>
                                                    <span className="text-[10px] font-bold text-zinc-400 uppercase tracking-wide">E-mail</span>
                                                    <p className="text-[11px] font-mono text-zinc-500 dark:text-zinc-400 mt-0.5 overflow-hidden text-ellipsis whitespace-nowrap" title={p.solicitante_profile?.email || ''}>{p.solicitante_profile?.email || '—'}</p>
                                                </div>
                                            </div>
                                        </div>
                                    </div>
                                </div>

                                {/* Características e Observações */}
                                <div className="space-y-3">
                                    <h4 className="text-[10px] font-black text-zinc-400 dark:text-zinc-500 uppercase tracking-widest border-l-2 border-brand-accent pl-2">Características Adicionais</h4>
                                    <div className="bg-zinc-50 dark:bg-zinc-900/60 p-4 rounded-2xl border border-zinc-200/50 dark:border-zinc-800/40 space-y-3.5">
                                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                                            <div>
                                                <span className="text-[10px] font-bold text-zinc-400 uppercase tracking-wide">Prazo Limite / SLA (Entrega)</span>
                                                <p className="font-bold text-zinc-800 dark:text-zinc-200 mt-0.5 font-mono">{p.prazo_limite ? formatDisplayDate(p.prazo_limite) : 'S/ PRAZO'}</p>
                                            </div>
                                            <div>
                                                <span className="text-[10px] font-bold text-zinc-400 uppercase tracking-wide">Marca de Referência</span>
                                                <p className="font-bold text-zinc-800 dark:text-zinc-200 mt-0.5">{marcaReferencia || '—'}</p>
                                            </div>
                                        </div>
                                        <div className="pt-2 border-t border-dashed border-zinc-200/60 dark:border-zinc-850/40">
                                            <span className="text-[10px] font-bold text-zinc-400 uppercase tracking-wide">Observações do Solicitante</span>
                                            <p className="font-medium text-zinc-800 dark:text-zinc-200 mt-1 whitespace-pre-wrap leading-relaxed text-xs italic bg-white dark:bg-zinc-950 p-3 rounded-xl border border-zinc-150 dark:border-zinc-850/60">{observacaoSolicitante || 'Nenhuma observação adicionada.'}</p>
                                        </div>
                                    </div>
                                </div>

                                {/* Notificação / Demanda Judicial */}
                                {(eNotif || eJudicial) && (
                                    <div className="space-y-3">
                                        <h4 className="text-[10px] font-black text-zinc-400 dark:text-zinc-500 uppercase tracking-widest border-l-2 border-brand-accent pl-2">Documentos de Notificação ou Judiciais</h4>
                                        <div className="bg-zinc-50 dark:bg-zinc-900/60 p-4 rounded-2xl border border-zinc-200/50 dark:border-zinc-800/40 space-y-3">
                                            {eNotif && (
                                                <div className="flex items-center justify-between p-2 bg-red-500/5 dark:bg-red-500/10 rounded-xl border border-red-200/40 dark:border-red-900/30">
                                                    <div className="flex items-center gap-2">
                                                        <Badge className="bg-red-100 text-red-700 dark:bg-red-950/40 dark:text-red-400 border-none text-[8px] font-bold uppercase py-0.5">NOTIFICAÇÃO</Badge>
                                                        {p.data_notificacao && (
                                                            <span className="text-[10px] font-mono text-zinc-500">Data: {formatDisplayDate(p.data_notificacao)}</span>
                                                        )}
                                                    </div>
                                                    {arquivoNotif ? (
                                                        <Button 
                                                            variant="outline" 
                                                            size="sm" 
                                                            className="h-7 text-[10px] border-red-200 hover:bg-red-50 dark:border-red-900/40 text-red-700 hover:text-red-800 dark:text-red-400 dark:hover:bg-red-950/30 flex items-center gap-1 font-bold rounded-lg"
                                                            onClick={() => handleVerDocumento(arquivoNotif)}
                                                        >
                                                            <EyeIcon className="w-3.5 h-3.5" /> Ver Notificação
                                                        </Button>
                                                    ) : (
                                                        <span className="text-[10px] text-zinc-400 italic">Arquivo não anexado</span>
                                                    )}
                                                </div>
                                            )}
                                            {eJudicial && (
                                                <div className="flex items-center justify-between p-2 bg-purple-500/5 dark:bg-purple-500/10 rounded-xl border border-purple-200/40 dark:border-purple-900/30">
                                                    <Badge className="bg-purple-100 text-purple-700 dark:bg-purple-950/40 dark:text-purple-400 border-none text-[8px] font-bold uppercase py-0.5">DEMANDA JUDICIAL</Badge>
                                                    {arquivoJudicial ? (
                                                        <Button 
                                                            variant="outline" 
                                                            size="sm" 
                                                            className="h-7 text-[10px] border-purple-200 hover:bg-purple-50 dark:border-purple-900/40 text-purple-700 hover:text-purple-800 dark:text-purple-400 dark:hover:bg-purple-950/30 flex items-center gap-1 font-bold rounded-lg"
                                                            onClick={() => handleVerDocumento(arquivoJudicial)}
                                                        >
                                                            <EyeIcon className="w-3.5 h-3.5" /> Ver Documento Judicial
                                                        </Button>
                                                    ) : (
                                                        <span className="text-[10px] text-zinc-400 italic">Arquivo não anexado</span>
                                                    )}
                                                </div>
                                            )}
                                        </div>
                                    </div>
                                )}

                                {/* Resolução de Compra (Se finalizado/comprado/falha) */}
                                {(p.status === 'COMPRADO' || p.status === 'ATENDIDO' || p.status === 'EM_ESTOQUE' || p.status === 'FALHA') && (
                                    <div className="space-y-3">
                                        <h4 className="text-[10px] font-black text-zinc-400 dark:text-zinc-500 uppercase tracking-widest border-l-2 border-brand-accent pl-2">Resolução da Compra</h4>
                                        <div className="bg-zinc-50 dark:bg-zinc-900/60 p-4 rounded-2xl border border-zinc-200/50 dark:border-zinc-800/40 space-y-2.5">
                                            {p.status === 'FALHA' ? (
                                                <div className="space-y-2">
                                                    <div className="flex items-center gap-2">
                                                        <Badge variant="destructive" className="text-[9px] uppercase font-bold tracking-tight">Falha na Compra</Badge>
                                                        {obs?.falta_industria && (
                                                            <Badge className="bg-red-500/10 text-red-700 dark:text-red-400 border border-red-200/40 text-[9px] font-bold uppercase">Falta na Indústria</Badge>
                                                        )}
                                                    </div>
                                                    <div>
                                                        <span className="text-[10px] font-bold text-zinc-400 uppercase tracking-wide">Justificativa do Cancelamento</span>
                                                        <p className="font-semibold text-red-600 dark:text-red-400 leading-relaxed italic bg-white dark:bg-zinc-950 p-3 rounded-xl border border-red-150/60 dark:border-red-950/40 mt-1">{obs?.justificativa || 'Nenhuma justificativa informada.'}</p>
                                                    </div>
                                                    {obs?.carta_industria_caminho && (
                                                        <div className="pt-1.5 flex justify-end">
                                                            <Button 
                                                                variant="outline" 
                                                                size="sm" 
                                                                className="h-8 text-xs font-bold border-red-200 text-red-700 hover:bg-red-50 dark:text-red-400 dark:border-red-900/50 dark:hover:bg-red-950/30 gap-1.5"
                                                                onClick={() => handleVerDocumento(obs.carta_industria_caminho)}
                                                            >
                                                                <FileDown className="w-3.5 h-3.5" /> Download Carta da Indústria
                                                            </Button>
                                                        </div>
                                                    )}
                                                </div>
                                            ) : (
                                                <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
                                                    <div>
                                                        <span className="text-[10px] font-bold text-zinc-400 uppercase tracking-wide">Vl. Unit. Comprado</span>
                                                        <p className="font-mono font-black text-emerald-600 dark:text-emerald-400 mt-0.5">{formatCurrency(p.valor_unitario_comprado || 0)}</p>
                                                    </div>
                                                    <div>
                                                        <span className="text-[10px] font-bold text-zinc-400 uppercase tracking-wide">Total Pago</span>
                                                        <p className="font-mono font-black text-emerald-600 dark:text-emerald-400 mt-0.5">{formatCurrency((p.valor_unitario_comprado || 0) * p.quantidade_solicitada)}</p>
                                                    </div>
                                                    <div>
                                                        <span className="text-[10px] font-bold text-zinc-400 uppercase tracking-wide">Marca Adquirida</span>
                                                        <p className="font-bold text-zinc-800 dark:text-zinc-200 mt-0.5">{p.marca_comprada || '—'}</p>
                                                    </div>
                                                    <div>
                                                        <span className="text-[10px] font-bold text-zinc-400 uppercase tracking-wide">Previsão de Chegada</span>
                                                        <p className="font-bold text-zinc-800 dark:text-zinc-200 mt-0.5 font-mono">{p.prazo_estimado_chegada ? formatDisplayDate(p.prazo_estimado_chegada) : '—'}</p>
                                                    </div>
                                                </div>
                                            )}
                                        </div>
                                    </div>
                                )}

                                {/* Material de Apoio */}
                                {obs?.imagem_anexo && (
                                    <div className="space-y-3">
                                        <h4 className="text-[10px] font-black text-zinc-400 dark:text-zinc-500 uppercase tracking-widest border-l-2 border-brand-accent pl-2">Material de Apoio</h4>
                                        <div className="bg-zinc-50 dark:bg-zinc-900/60 p-4 rounded-2xl border border-zinc-200/50 dark:border-zinc-800/40">
                                            <div className="flex flex-col gap-2">
                                                <a 
                                                    href={getCleanPublicUrl(obs.imagem_anexo)} 
                                                    target="_blank" 
                                                    rel="noopener noreferrer"
                                                    className="relative max-w-md border rounded-xl overflow-hidden group block hover:opacity-90 transition-opacity border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-950 p-1"
                                                >
                                                    <img 
                                                        src={getCleanPublicUrl(obs.imagem_anexo)} 
                                                        alt="Material de apoio da solicitação" 
                                                        className="max-h-60 w-auto object-contain rounded-lg mx-auto" 
                                                    />
                                                    <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 flex items-center justify-center transition-opacity text-white text-xs font-bold gap-1 rounded-lg">
                                                        <ExternalLink className="w-4 h-4" /> Clique para ampliar
                                                    </div>
                                                </a>
                                            </div>
                                        </div>
                                    </div>
                                )}

                                {/* Histórico de Correções */}
                                {obs?.historico_correcoes && obs.historico_correcoes.length > 0 && (
                                    <div className="space-y-3">
                                        <h4 className="text-[10px] font-black text-zinc-400 dark:text-zinc-500 uppercase tracking-widest border-l-2 border-brand-accent pl-2">Histórico de Correções</h4>
                                        <div className="bg-zinc-50 dark:bg-zinc-900/60 p-4 rounded-2xl border border-zinc-200/50 dark:border-zinc-800/40 space-y-3 max-h-[200px] overflow-y-auto">
                                            {obs.historico_correcoes.map((corr: any, idx: number) => (
                                                <div key={idx} className="border-b border-dashed border-zinc-200 dark:border-zinc-800 last:border-none pb-2.5 last:pb-0 text-xs">
                                                    <div className="flex justify-between font-bold text-[10px] text-zinc-400 mb-1">
                                                        <span>Autor: {corr.autor}</span>
                                                        <span>{new Date(corr.data).toLocaleString('pt-BR')}</span>
                                                    </div>
                                                    <p className="italic font-medium text-zinc-700 dark:text-zinc-300 bg-white dark:bg-zinc-950 p-2 rounded border border-zinc-200/60 dark:border-zinc-850/60">
                                                        &ldquo;{corr.justificativa}&rdquo;
                                                    </p>
                                                    <div className="flex flex-wrap gap-x-3 gap-y-0.5 mt-1.5 text-[9px] font-mono text-zinc-400 uppercase">
                                                        {corr.de_quantidade !== corr.para_quantidade && (
                                                            <span>Qtd: {corr.de_quantidade} &rarr; {corr.para_quantidade}</span>
                                                        )}
                                                        {corr.de_categoria !== corr.para_categoria && (
                                                            <span>Categoria: {corr.de_categoria} &rarr; {corr.para_categoria}</span>
                                                        )}
                                                        {corr.de_prazo !== corr.para_prazo && (
                                                            <span>Prazo: {formatDisplayDate(corr.de_prazo)} &rarr; {formatDisplayDate(corr.para_prazo)}</span>
                                                        )}
                                                    </div>
                                                </div>
                                            ))}
                                        </div>
                                    </div>
                                )}
                            </div>
                        )
                    })()}

                    <DialogFooter className="border-t border-zinc-100 dark:border-zinc-800/60 pt-4">
                        <Button variant="outline" onClick={() => setDetalhesPedido(null)} className="rounded-xl">
                            Fechar
                        </Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>

            {/* Modal de Histórico / Linha do Tempo da Solicitação */}
            <Dialog open={!!pedidoHistoryItem} onOpenChange={(open) => !open && setPedidoHistoryItem(null)}>
                <DialogContent className="sm:max-w-2xl max-h-[85vh] flex flex-col p-6">
                    <DialogHeader>
                        <DialogTitle className="flex items-center gap-2 text-base font-bold text-zinc-900 dark:text-zinc-100">
                            <History className="w-5 h-5 text-amber-600" />
                            Histórico & Auditoria da Solicitação #{pedidoHistoryItem?.id}
                        </DialogTitle>
                        <DialogDescription className="text-xs text-zinc-500">
                            Linha do tempo completa com todas as alterações de status, compras e ajustes efetuados.
                        </DialogDescription>
                    </DialogHeader>

                    {pedidoHistoryItem && (
                        <div className="space-y-4 my-2 overflow-y-auto pr-1 flex-1">
                            <div className="bg-zinc-50 dark:bg-zinc-900/60 p-3 rounded-lg border border-zinc-200 dark:border-zinc-800 text-xs space-y-1">
                                <p className="font-bold text-zinc-800 dark:text-zinc-200">
                                    {getItemDesc(pedidoHistoryItem)}
                                </p>
                                <div className="flex items-center gap-4 text-[11px] text-zinc-500">
                                    <span>Solicitante: <strong>{pedidoHistoryItem.usuario_solicitante || '—'}</strong></span>
                                    <span>Qtd: <strong>{pedidoHistoryItem.quantidade_solicitada || 0}</strong></span>
                                    <span>Status Atual: <strong className="text-amber-600">{pedidoHistoryItem.status}</strong></span>
                                </div>
                            </div>

                            {pedidoLogsLoading ? (
                                <div className="flex items-center justify-center py-10 gap-2 text-xs text-zinc-500">
                                    <Loader2 className="w-4 h-4 animate-spin text-amber-600" />
                                    Carregando histórico de auditoria...
                                </div>
                            ) : pedidoLogs.length === 0 ? (
                                <div className="text-center py-8 text-xs text-zinc-400 bg-zinc-50/50 rounded-lg border border-dashed border-zinc-200">
                                    Nenhuma alteração registrada após a criação deste pedido.
                                </div>
                            ) : (
                                <div className="space-y-3 relative before:absolute before:inset-0 before:left-3.5 before:w-0.5 before:bg-zinc-200 dark:before:bg-zinc-800 pt-1">
                                    {pedidoLogs.map((log) => {
                                        const dt = new Date(log.created_at)
                                        const dateStr = dt.toLocaleDateString('pt-BR')
                                        const timeStr = dt.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit', second: '2-digit' })

                                        return (
                                            <div key={log.id} className="relative flex items-start gap-3 pl-8 text-xs">
                                                <div className="absolute left-2 top-1.5 -translate-x-1/2 w-3 h-3 rounded-full bg-amber-500 ring-4 ring-white dark:ring-zinc-950 shrink-0" />
                                                <div className="flex-1 bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-lg p-3 shadow-sm space-y-1">
                                                    <div className="flex items-center justify-between gap-2 border-b border-zinc-100 dark:border-zinc-800/80 pb-1.5">
                                                        <span className="font-bold text-zinc-800 dark:text-zinc-200 text-[11px]">
                                                            {log.user_email || 'Sistema'}
                                                        </span>
                                                        <span className="text-[10px] font-mono text-zinc-400">
                                                            {dateStr} às {timeStr}
                                                        </span>
                                                    </div>
                                                    <p className="text-zinc-700 dark:text-zinc-300 text-xs pt-1 font-medium">
                                                        {renderFriendlyDetails(log)}
                                                    </p>
                                                </div>
                                            </div>
                                        )
                                    })}
                                </div>
                            )}
                        </div>
                    )}

                    <DialogFooter className="pt-2 border-t border-zinc-100 dark:border-zinc-800">
                        <Button variant="outline" size="sm" onClick={() => setPedidoHistoryItem(null)}>
                            Fechar
                        </Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>

            {/* Modal de Histórico Geral de Compras */}
            <Dialog open={globalHistoryOpen} onOpenChange={setGlobalHistoryOpen}>
                <DialogContent className="sm:max-w-3xl max-h-[85vh] flex flex-col p-6">
                    <DialogHeader>
                        <DialogTitle className="flex items-center gap-2 text-base font-bold text-zinc-900 dark:text-zinc-100">
                            <History className="w-5 h-5 text-amber-600" />
                            Central de Histórico de Atividades de Compras
                        </DialogTitle>
                        <DialogDescription className="text-xs text-zinc-500">
                            Últimas 100 alterações, compras e movimentações registradas no módulo de compras.
                        </DialogDescription>
                    </DialogHeader>

                    <div className="space-y-4 my-2 overflow-y-auto pr-1 flex-1">
                        {globalLogsLoading ? (
                            <div className="flex items-center justify-center py-12 gap-2 text-xs text-zinc-500">
                                <Loader2 className="w-4 h-4 animate-spin text-amber-600" />
                                Carregando registros de compras...
                            </div>
                        ) : globalLogs.length === 0 ? (
                            <div className="text-center py-10 text-xs text-zinc-400">
                                Nenhum log de compras encontrado.
                            </div>
                        ) : (
                            <div className="space-y-2">
                                {globalLogs.map((log) => {
                                    const dt = new Date(log.created_at)
                                    const dateStr = dt.toLocaleDateString('pt-BR')
                                    const timeStr = dt.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })

                                    return (
                                        <div key={log.id} className="p-3 bg-zinc-50 dark:bg-zinc-900/60 border border-zinc-200 dark:border-zinc-800 rounded-lg text-xs flex items-start justify-between gap-3">
                                            <div className="space-y-1 flex-1 min-w-0">
                                                <div className="flex items-center gap-2">
                                                    <span className="font-bold text-zinc-900 dark:text-zinc-100 text-[11px]">
                                                        {log.user_email}
                                                    </span>
                                                    <Badge variant="outline" className="text-[9px] bg-amber-50 text-amber-800 border-amber-200 font-mono">
                                                        {log.action}
                                                    </Badge>
                                                </div>
                                                <p className="text-zinc-700 dark:text-zinc-300 font-medium truncate">
                                                    {renderFriendlyDetails(log)}
                                                </p>
                                            </div>
                                            <div className="text-[10px] font-mono text-zinc-400 shrink-0 text-right">
                                                <div>{dateStr}</div>
                                                <div>{timeStr}</div>
                                            </div>
                                        </div>
                                    )
                                })}
                            </div>
                        )}
                    </div>

                    <DialogFooter className="pt-2 border-t border-zinc-100 dark:border-zinc-800">
                        <Button variant="outline" size="sm" onClick={() => setGlobalHistoryOpen(false)}>
                            Fechar
                        </Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>

            {/* Modal de Justificativa de Falha */}
            <Dialog open={!!justificarPedido} onOpenChange={(open) => { if (!open) setJustificarPedido(null) }}>
                <DialogContent className="sm:max-w-md">
                    <DialogHeader>
                        <DialogTitle>Justificativa de Falha na Compra</DialogTitle>
                        <DialogDescription>
                            Por favor, informe o motivo do insucesso na compra do item.
                        </DialogDescription>
                    </DialogHeader>
                    {justificarPedido && (
                        <div className="space-y-4 my-4">
                            <div>
                                <Label className="text-xs font-bold text-zinc-500">Item</Label>
                                <div className="text-sm font-medium text-zinc-900 dark:text-zinc-100 line-clamp-2">
                                    {getItemDesc(justificarPedido)}
                                </div>
                            </div>
                            <div>
                                <Label htmlFor="justificativa_texto" className="text-xs font-bold text-zinc-500">
                                    Justificativa / Motivo
                                </Label>
                                <Textarea
                                    id="justificativa_texto"
                                    value={justificativaTexto}
                                    onChange={(e) => setJustificativaTexto(e.target.value)}
                                    placeholder="Explique detalhadamente a falha..."
                                    className="mt-1 resize-none"
                                    rows={3}
                                />
                            </div>
                            <div className="flex items-center space-x-2">
                                <input
                                    type="checkbox"
                                    id="falta_industria"
                                    checked={faltaIndustria}
                                    onChange={(e) => setFaltaIndustria(e.target.checked)}
                                    className="rounded border-zinc-300 text-brand-accent focus:ring-brand-accent h-4 w-4"
                                />
                                <Label htmlFor="falta_industria" className="text-xs font-bold text-zinc-700 dark:text-zinc-300 cursor-pointer">
                                    Falta de produto na indústria / fornecedor
                                </Label>
                            </div>
                            {faltaIndustria && (
                                <div className="space-y-1">
                                    <Label htmlFor="carta_upload" className="text-xs font-bold text-zinc-500">
                                        Anexar Carta da Indústria (PDF) *
                                    </Label>
                                    <Input
                                        id="carta_upload"
                                        type="file"
                                        accept="application/pdf"
                                        onChange={(e) => {
                                            if (e.target.files && e.target.files.length > 0) {
                                                setIndustriaFile(e.target.files[0])
                                            }
                                        }}
                                        className="mt-1"
                                    />
                                    <p className="text-[10px] text-zinc-400">PDF comprovando a falta do produto emitido pela indústria.</p>
                                </div>
                            )}
                        </div>
                    )}
                    <DialogFooter>
                        <Button variant="outline" onClick={() => setJustificarPedido(null)} disabled={uploadingFile}>
                            Cancelar
                        </Button>
                        <Button onClick={handleSaveJustificativa} disabled={uploadingFile}>
                            {uploadingFile ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : null}
                            Confirmar
                        </Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>

            {/* Modal de Compra Livre */}
            <Dialog open={showCompraLivre} onOpenChange={(open) => { 
                if (!open) {
                    setShowCompraLivre(false)
                    setEditingCompraLivreId(null)
                    setCompraLivreForm({ descricao: '', documento_origem: '', tipo_documento: 'EMPENHO', unidade: 'UN', quantidade: 1, valor_unitario: '', orgao_solicitante: '', prazo_dias: 5, obs_adicional: '', marca: '', produto_catalogo_id: null })
                    setCompraLivreCategoria('NÃO CATEGORIZADO')
                    setCompraLivreENotificacao(false)
                    setCompraLivreNotificacaoFile(null)
                    setIsProductCategoryDefined(false)
                    setCompraLivreImagem(null)
                    setCompraLivreImagemPreview(null)
                    setExistingCompraLivreImagePath(null)
                }
            }}>
                <DialogContent className="sm:max-w-4xl max-h-[90vh] overflow-y-auto">
                    <DialogHeader>
                        <div className="flex items-center gap-2">
                            <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-brand-accent to-indigo-600 flex items-center justify-center">
                                <Zap className="w-4 h-4 text-white" />
                            </div>
                            <div>
                                <DialogTitle className="text-base font-black">
                                    {editingCompraLivreId ? 'Alterar Compra Livre' : 'Compra Livre'}
                                </DialogTitle>
                                <DialogDescription className="text-xs">
                                    {editingCompraLivreId 
                                        ? 'Altere os dados da compra avulsa.' 
                                        : 'Solicite uma compra avulsa com documento de origem e dados personalizados.'}
                                </DialogDescription>
                            </div>
                        </div>
                    </DialogHeader>

                    <div className="space-y-4 my-2">
                        {/* Descrição */}
                        <div>
                            <Label className="text-xs font-bold text-zinc-600 dark:text-zinc-400 uppercase tracking-wide">
                                Descrição completa do item *
                            </Label>
                            <ProductAutocomplete
                                defaultValue={compraLivreForm.descricao}
                                onChange={(val) => {
                                    handleCompraLivreDescricaoChange(val)
                                    setCompraLivreForm(f => ({ ...f, produto_catalogo_id: null }))
                                    setIsProductCategoryDefined(false)
                                }}
                                onSelect={(product) => {
                                    setCompraLivreForm(f => ({
                                        ...f,
                                        descricao: product.descricao_completa,
                                        unidade: product.unidade_venda || 'UN',
                                        produto_catalogo_id: product.id
                                    }))
                                    const grupoUpper = (product.grupo || '').toUpperCase().trim()
                                    const normalizedGroup = normalizeCategory(grupoUpper)
                                    const hasValidCategory = !!product.grupo && grupoUpper !== 'NÃO CATEGORIZADO' && grupoUpper !== 'NENHUMA' && grupoUpper !== ''
                                    setIsProductCategoryDefined(hasValidCategory)
                                    if (hasValidCategory) {
                                        setCompraLivreCategoria(normalizedGroup)
                                    } else {
                                        setCompraLivreCategoria(detectarCategoria(product.descricao_completa))
                                    }
                                }}
                                placeholder="Buscar produto no catálogo ou digitar descrição..."
                                className="mt-1"
                            />
                            {/* Categoria auto-detectada */}
                            {compraLivreForm.descricao.trim().length > 4 && (
                                <div className="flex items-center gap-2 mt-2">
                                    <span className="text-[10px] text-zinc-400 font-bold uppercase">Categoria detectada:</span>
                                    <span className="text-[10px] font-black px-2 py-0.5 rounded-full bg-brand-accent/10 text-brand-accent border border-brand-accent/20 uppercase">{compraLivreCategoria}</span>
                                    {isProductCategoryDefined ? (
                                        <span className="text-[9px] text-zinc-400 flex items-center gap-0.5"><Lock className="w-2.5 h-2.5" /> (travada pelo catálogo)</span>
                                    ) : (
                                        <span className="text-[9px] text-zinc-400">(pode ser alterada abaixo)</span>
                                    )}
                                </div>
                            )}
                        </div>

                        {/* Grid 2 colunas */}
                        <div className="grid grid-cols-1 lg:grid-cols-2 gap-x-6">

                        {/* === COLUNA ESQUERDA === */}
                        <div className="space-y-4">

                        {/* Documento de Origem + Tipo */}
                        {profile?.setor !== 'VENDAS_PRIVADO' && (
                            <div className="grid grid-cols-2 gap-3">
                                <div>
                                    <Label htmlFor="cl_tipo_documento" className="text-xs font-bold text-zinc-600 dark:text-zinc-400 uppercase tracking-wide">
                                        Tipo de Compra *
                                    </Label>
                                    <Select
                                        value={compraLivreForm.tipo_documento}
                                        onValueChange={(v) => setCompraLivreForm(f => ({ ...f, tipo_documento: v }))}
                                    >
                                        <SelectTrigger id="cl_tipo_documento" className="mt-1 h-9 text-xs font-bold">
                                            <SelectValue />
                                        </SelectTrigger>
                                        <SelectContent>
                                            <SelectItem value="EMPENHO">Empenho (NE)</SelectItem>
                                            <SelectItem value="ATA/ARP">Ata / ARP</SelectItem>
                                            <SelectItem value="ORDEM DE FORNECIMENTO">Ordem de Fornecimento</SelectItem>
                                            <SelectItem value="COMPRA DIRETA">Compra Direta</SelectItem>
                                            <SelectItem value="CONTRATO">Contrato</SelectItem>
                                            <SelectItem value="NOTIFICAÇÃO">Notificação</SelectItem>
                                            <SelectItem value="OUTRO">Outro</SelectItem>
                                        </SelectContent>
                                    </Select>
                                </div>
                                <div>
                                    <Label htmlFor="cl_documento" className="text-xs font-bold text-zinc-600 dark:text-zinc-400 uppercase tracking-wide">
                                        {compraLivreForm.tipo_documento === 'COMPRA DIRETA' ? 'Nº do Documento (Opcional)' : 'Nº do Documento *'}
                                    </Label>
                                    <Input
                                        id="cl_documento"
                                        value={compraLivreForm.documento_origem}
                                        onChange={(e) => setCompraLivreForm(f => ({ ...f, documento_origem: e.target.value }))}
                                        placeholder={compraLivreForm.tipo_documento === 'COMPRA DIRETA' ? 'Opcional' : 'Ex: 2025NE000147'}
                                        className="mt-1 h-9 text-xs font-bold uppercase"
                                    />
                                </div>
                            </div>
                        )}

                        {/* Qtd + Unidade + Valor */}
                        <div className="grid grid-cols-3 gap-3">
                            <div>
                                <Label htmlFor="cl_quantidade" className="text-xs font-bold text-zinc-600 dark:text-zinc-400 uppercase tracking-wide">
                                    Quantidade *
                                </Label>
                                <Input
                                    id="cl_quantidade"
                                    type="number"
                                    min={1}
                                    value={compraLivreForm.quantidade}
                                    onChange={(e) => setCompraLivreForm(f => ({ ...f, quantidade: Number(e.target.value) }))}
                                    className="mt-1 h-9 text-sm font-black"
                                />
                            </div>
                            <div>
                                <Label htmlFor="cl_unidade" className="text-xs font-bold text-zinc-600 dark:text-zinc-400 uppercase tracking-wide">
                                    Unidade *
                                </Label>
                                <Input
                                    id="cl_unidade"
                                    value={compraLivreForm.unidade}
                                    onChange={(e) => setCompraLivreForm(f => ({ ...f, unidade: e.target.value.toUpperCase() }))}
                                    placeholder="UN, CX, FR, PCT..."
                                    className="mt-1 h-9 text-xs font-bold uppercase"
                                />
                            </div>
                            <div>
                                <Label htmlFor="cl_valor" className="text-xs font-bold text-zinc-600 dark:text-zinc-400 uppercase tracking-wide">
                                    Valor Unit. (R$)
                                </Label>
                                <Input
                                    id="cl_valor"
                                    type="number"
                                    step="0.01"
                                    min={0}
                                    value={compraLivreForm.valor_unitario}
                                    onChange={(e) => setCompraLivreForm(f => ({ ...f, valor_unitario: e.target.value }))}
                                    placeholder="0,00"
                                    className="mt-1 h-9 text-xs"
                                />
                            </div>
                        </div>

                        {/* Categoria manual + Prazo + Órgão */}
                        <div className="grid grid-cols-2 gap-3">
                            <div>
                                <Label htmlFor="cl_categoria" className="text-xs font-bold text-zinc-600 uppercase tracking-wide flex items-center gap-1.5">
                                    Categoria *
                                </Label>
                                <Select
                                    value={compraLivreCategoria}
                                    onValueChange={setCompraLivreCategoria}
                                >
                                    <SelectTrigger id="cl_categoria" className="mt-1 h-9 text-xs font-bold">
                                        <SelectValue />
                                    </SelectTrigger>
                                    <SelectContent>
                                        <SelectItem value="MATERIAL HOSPITALAR">Material Hospitalar</SelectItem>
                                        <SelectItem value="MEDICAMENTO">Medicamento</SelectItem>
                                        <SelectItem value="ODONTO">Odonto</SelectItem>
                                        <SelectItem value="DIETA">Dieta</SelectItem>
                                        <SelectItem value="COSMÉTICO">Cosmético</SelectItem>
                                        <SelectItem value="MOBILIÁRIO">Mobiliário</SelectItem>
                                        <SelectItem value="ELETRÔNICO">Eletrônico</SelectItem>
                                    </SelectContent>
                                </Select>
                            </div>
                            <div>
                                <Label htmlFor="cl_prazo" className="text-xs font-bold text-zinc-600 dark:text-zinc-400 uppercase tracking-wide">
                                    Prazo SLA (dias) *
                                </Label>
                                <div className="relative mt-1">
                                    <Input
                                        id="cl_prazo"
                                        type="number"
                                        min={1}
                                        max={365}
                                        value={compraLivreForm.prazo_dias}
                                        onChange={(e) => setCompraLivreForm(f => ({ ...f, prazo_dias: Number(e.target.value) }))}
                                        className="h-9 text-sm font-black pr-12"
                                    />
                                    <span className="absolute right-3 top-1/2 -translate-y-1/2 text-[10px] font-bold text-zinc-400 pointer-events-none">DIAS</span>
                                </div>
                                {compraLivreForm.prazo_dias > 0 && (
                                    <p className="text-[10px] text-zinc-400 mt-1">
                                        Vence em: {new Date(Date.now() + compraLivreForm.prazo_dias * 86400000).toLocaleDateString('pt-BR')}
                                    </p>
                                )}
                            </div>
                        </div>

                        {/* Campo Notificação */}
                        <div className="p-3 border border-zinc-200 dark:border-zinc-800 rounded-lg space-y-3 bg-zinc-50/50 dark:bg-zinc-900/20">
                            <div className="flex items-center space-x-2">
                                <input
                                    type="checkbox"
                                    id="cl_e_notificacao"
                                    checked={compraLivreENotificacao}
                                    onChange={(e) => {
                                        setCompraLivreENotificacao(e.target.checked)
                                        if (!e.target.checked) setCompraLivreNotificacaoFile(null)
                                    }}
                                    className="rounded border-zinc-300 text-brand-accent focus:ring-brand-accent h-4 w-4 cursor-pointer"
                                />
                                <Label htmlFor="cl_e_notificacao" className="text-xs font-bold text-zinc-700 dark:text-zinc-300 cursor-pointer uppercase tracking-wide flex items-center gap-1.5 select-none">
                                    Esta compra possui Notificação de Atraso?
                                    <Alert className="w-3.5 h-3.5 text-amber-500" />
                                </Label>
                            </div>
                            {compraLivreENotificacao && (
                                <div className="space-y-3 bg-amber-50/50 dark:bg-amber-950/20 border border-amber-200 dark:border-amber-900/30 rounded-lg p-3 animate-in fade-in slide-in-from-top-1 duration-200">
                                    <div className="space-y-1">
                                        <Label htmlFor="cl_data_notificacao" className="text-xs font-black text-amber-700 dark:text-amber-400 uppercase tracking-wider">
                                            Data Real da Notificação *
                                        </Label>
                                        <Input
                                            id="cl_data_notificacao"
                                            type="date"
                                            value={compraLivreDataNotificacao}
                                            onChange={(e) => setCompraLivreDataNotificacao(e.target.value)}
                                            className="mt-1 bg-white dark:bg-zinc-950 border-amber-300 dark:border-amber-900 text-xs"
                                            required
                                        />
                                    </div>
                                    <div className="space-y-1">
                                        <Label htmlFor="notificacao_upload" className="text-xs font-black text-amber-700 dark:text-amber-400 uppercase tracking-wider flex items-center gap-1">
                                            Anexar PDF da Notificação *
                                        </Label>
                                        <Input
                                            id="notificacao_upload"
                                            type="file"
                                            accept="application/pdf,image/*"
                                            onChange={(e) => {
                                                if (e.target.files && e.target.files.length > 0) {
                                                    setCompraLivreNotificacaoFile(e.target.files[0])
                                                }
                                            }}
                                            className="mt-1 bg-white dark:bg-zinc-950 border-amber-300 dark:border-amber-900 text-xs"
                                            required={!editingCompraLivreId}
                                        />
                                    </div>
                                    <p className="text-[10px] text-amber-600 dark:text-amber-500 font-medium">
                                        Como este item foi marcado como notificação, é obrigatório anexar o documento oficial da notificação.
                                    </p>
                                </div>
                            )}
                        </div>

                        {/* Campo Demanda Judicial */}
                        <div className="p-3 border border-zinc-200 dark:border-zinc-800 rounded-lg space-y-3 bg-zinc-50/50 dark:bg-zinc-900/20">
                            <div className="flex items-center space-x-2">
                                <input
                                    type="checkbox"
                                    id="cl_demanda_judicial"
                                    checked={compraLivreEDemandaJudicial}
                                    onChange={(e) => {
                                        setCompraLivreEDemandaJudicial(e.target.checked)
                                        if (!e.target.checked) setCompraLivreDemandaJudicialFile(null)
                                    }}
                                    className="rounded border-zinc-300 text-brand-accent focus:ring-brand-accent h-4 w-4 cursor-pointer"
                                />
                                <Label htmlFor="cl_demanda_judicial" className="text-xs font-bold text-zinc-700 dark:text-zinc-300 cursor-pointer uppercase tracking-wide flex items-center gap-1.5 select-none">
                                    Esta compra é para Demanda Judicial?
                                    <span className="text-xs">⚖️</span>
                                </Label>
                            </div>
                            {compraLivreEDemandaJudicial && (
                                <div className="space-y-1 bg-red-50/50 dark:bg-red-950/20 border border-red-200 dark:border-red-900/30 rounded-lg p-3 animate-in fade-in slide-in-from-top-1 duration-200">
                                    <Label htmlFor="demanda_judicial_upload" className="text-xs font-black text-red-700 dark:text-red-400 uppercase tracking-wider flex items-center gap-1">
                                        Anexar PDF da Demanda Judicial *
                                    </Label>
                                    <Input
                                        id="demanda_judicial_upload"
                                        type="file"
                                        accept="application/pdf,image/*"
                                        onChange={(e) => {
                                            if (e.target.files && e.target.files.length > 0) {
                                                setCompraLivreDemandaJudicialFile(e.target.files[0])
                                            }
                                        }}
                                        className="mt-1 bg-white dark:bg-zinc-950 border-red-300 dark:border-red-900 text-xs"
                                        required={!editingCompraLivreId}
                                    />
                                    <p className="text-[10px] text-red-600 dark:text-red-500 font-medium">
                                        Como este item foi marcado como demanda judicial, é obrigatório anexar o documento oficial comprobatório.
                                    </p>
                                </div>
                            )}
                        </div>

                        {/* Cliente */}
                        <div>
                            <Label htmlFor="cl_orgao" className="text-xs font-bold text-zinc-600 dark:text-zinc-400 uppercase tracking-wide">
                                Cliente
                            </Label>
                            <Input
                                id="cl_orgao"
                                value={compraLivreForm.orgao_solicitante}
                                onChange={(e) => setCompraLivreForm(f => ({ ...f, orgao_solicitante: e.target.value }))}
                                placeholder="Ex: Cliente, Prefeitura ou Entidade..."
                                className="mt-1 h-9 text-xs"
                            />
                        </div>

                        {/* Marca de Referência */}
                        <div>
                            <Label htmlFor="cl_marca" className="text-xs font-bold text-zinc-600 dark:text-zinc-400 uppercase tracking-wide">
                                Marca de Referência
                            </Label>
                            <Input
                                id="cl_marca"
                                value={compraLivreForm.marca}
                                onChange={(e) => setCompraLivreForm(f => ({ ...f, marca: e.target.value }))}
                                placeholder="Fabricante ou marca desejada..."
                                className="mt-1 h-9 text-xs"
                            />
                        </div>

                        </div>{/* fim coluna esquerda */}

                        {/* === COLUNA DIREITA === */}
                        <div className="space-y-4 lg:border-l lg:border-zinc-200 dark:lg:border-zinc-800 lg:pl-6 mt-4 lg:mt-0">

                        {/* Observações adicionais */}
                        <div>
                            <Label htmlFor="cl_obs" className="text-xs font-bold text-zinc-600 dark:text-zinc-400 uppercase tracking-wide">
                                Observações adicionais
                            </Label>
                            <Textarea
                                id="cl_obs"
                                value={compraLivreForm.obs_adicional}
                                onChange={(e) => setCompraLivreForm(f => ({ ...f, obs_adicional: e.target.value }))}
                                placeholder="Outras informações importantes para a compra..."
                                className="mt-1 resize-none text-xs"
                                rows={2}
                            />
                        </div>

                        {/* Material de Apoio */}
                        <div>
                            <Label htmlFor="cl_imagem" className="text-xs font-bold text-zinc-600 dark:text-zinc-400 uppercase tracking-wide">
                                Material de Apoio (Opcional)
                            </Label>
                            <Input
                                id="cl_imagem"
                                type="file"
                                accept="image/*"
                                onChange={handleCompraLivreImageChange}
                                className="mt-1 text-xs cursor-pointer bg-white dark:bg-zinc-950"
                            />
                            {compraLivreImagemPreview && (
                                <div className="mt-2 relative w-24 h-24 border rounded-lg overflow-hidden group">
                                    <img src={compraLivreImagemPreview} alt="Preview" className="w-full h-full object-cover" />
                                    <button 
                                        type="button" 
                                        onClick={handleRemoveCompraLivreImage}
                                        className="absolute top-1 right-1 bg-red-600 hover:bg-red-700 text-white rounded-full p-0.5 shadow transition-colors"
                                    >
                                        <X className="w-3 h-3" />
                                    </button>
                                </div>
                            )}
                        </div>

                        {/* Resumo */}
                        {compraLivreForm.quantidade > 0 && compraLivreForm.valor_unitario && (
                            <div className="bg-brand-accent/5 border border-brand-accent/20 rounded-lg p-3 flex items-center justify-between">
                                <span className="text-xs font-bold text-zinc-600 dark:text-zinc-400">Valor estimado total:</span>
                                <span className="text-base font-black text-brand-accent">
                                    {formatCurrency(compraLivreForm.quantidade * Number(compraLivreForm.valor_unitario))}
                                </span>
                            </div>
                        )}

                        </div>{/* fim coluna direita */}
                        </div>{/* fim grid */}
                    </div>

                    <DialogFooter className="gap-2">
                        <Button 
                            variant="outline" 
                            onClick={() => {
                                setShowCompraLivre(false)
                                setEditingCompraLivreId(null)
                                setCompraLivreForm({ descricao: '', documento_origem: '', tipo_documento: 'EMPENHO', unidade: 'UN', quantidade: 1, valor_unitario: '', orgao_solicitante: '', prazo_dias: 5, obs_adicional: '', marca: '', produto_catalogo_id: null })
                                setCompraLivreCategoria('NÃO CATEGORIZADO')
                                setCompraLivreENotificacao(false)
                                setCompraLivreNotificacaoFile(null)
                                setCompraLivreEDemandaJudicial(false)
                                setCompraLivreDemandaJudicialFile(null)
                                setCompraLivreImagem(null)
                                setCompraLivreImagemPreview(null)
                                setExistingCompraLivreImagePath(null)
                            }} 
                            disabled={compraLivreLoading}
                        >
                            Cancelar
                        </Button>
                        <Button
                            onClick={handleSubmitCompraLivre}
                            disabled={compraLivreLoading}
                            className="bg-gradient-to-r from-brand-accent to-indigo-600 hover:from-brand-accent/90 hover:to-indigo-600/90 text-white gap-2"
                        >
                            {compraLivreLoading ? (
                                <Loader2 className="w-4 h-4 animate-spin" />
                            ) : editingCompraLivreId ? (
                                <Pencil className="w-4 h-4" />
                            ) : (
                                <Zap className="w-4 h-4" />
                            )}
                            {editingCompraLivreId ? 'Salvar Alterações' : 'Registrar Compra Livre'}
                        </Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>

            {/* Modal de Gerenciamento de Responsabilidades da Equipe */}
            <Dialog open={showTeamModal} onOpenChange={setShowTeamModal}>
                <DialogContent className="sm:max-w-xl max-h-[80vh] overflow-y-auto">
                    <DialogHeader>
                        <div className="flex items-center gap-2">
                            <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-brand-accent to-indigo-600 flex items-center justify-center text-white">
                                <Users className="w-4 h-4" />
                            </div>
                            <div>
                                <DialogTitle className="text-base font-black uppercase tracking-tight">
                                    Responsabilidades da Equipe
                                </DialogTitle>
                                <DialogDescription className="text-xs">
                                    Defina a tarefa padrão (categoria de itens) para cada comprador do setor.
                                </DialogDescription>
                            </div>
                        </div>
                    </DialogHeader>

                    <div className="my-4 space-y-4">
                        <div className="border border-zinc-200 dark:border-zinc-800 rounded-lg overflow-hidden">
                            <Table>
                                <TableHeader className="bg-zinc-50 dark:bg-zinc-900/60">
                                    <TableRow>
                                        <TableHead>Comprador</TableHead>
                                        <TableHead>Nível</TableHead>
                                        <TableHead className="w-48">Tarefa Padrão</TableHead>
                                    </TableRow>
                                </TableHeader>
                                <TableBody>
                                    {profiles.length === 0 ? (
                                        <TableRow>
                                            <TableCell colSpan={3} className="text-center py-4 text-xs text-zinc-400">
                                                Nenhum comprador cadastrado no setor de COMPRAS.
                                            </TableCell>
                                        </TableRow>
                                    ) : (
                                        profiles.map((buyer) => (
                                            <TableRow key={buyer.id}>
                                                <TableCell className="font-bold text-xs">
                                                    <div className="flex flex-col">
                                                        <span>{buyer.display_name?.toUpperCase() || buyer.nome || '—'}</span>
                                                        <span className="text-[10px] text-zinc-400 font-normal">{buyer.email}</span>
                                                    </div>
                                                </TableCell>
                                                <TableCell>
                                                    <Badge variant="outline" className="text-[9px] font-bold">
                                                        {buyer.nivel}
                                                    </Badge>
                                                </TableCell>
                                                <TableCell>
                                                    <div className="flex flex-wrap gap-1 max-w-[320px]">
                                                        {['MATERIAL HOSPITALAR', 'MEDICAMENTO', 'ODONTO', 'MOBILIÁRIO', 'ELETRÔNICO', 'DIETA', 'COSMÉTICO'].map((cat) => {
                                                            const currentCategories = buyer.tarefa_padrao 
                                                                ? buyer.tarefa_padrao.split(',').map((s: string) => s.trim().toUpperCase()) 
                                                                : []
                                                            const isSelected = currentCategories.includes(cat.toUpperCase())
                                                            
                                                            let label = cat
                                                            if (cat === 'MATERIAL HOSPITALAR') label = 'MAT. HOSP'
                                                            
                                                            return (
                                                                <Badge
                                                                    key={cat}
                                                                    variant={isSelected ? "default" : "outline"}
                                                                    className={`cursor-pointer text-[9px] font-bold py-0.5 px-2 uppercase transition-all duration-200 ${
                                                                        isSelected 
                                                                            ? 'bg-brand-accent hover:bg-brand-accent/90 text-white shadow-sm scale-[1.03]' 
                                                                            : 'text-zinc-400 hover:text-zinc-650 border-zinc-200 dark:border-zinc-800'
                                                                    }`}
                                                                    onClick={async () => {
                                                                        let currentList = buyer.tarefa_padrao 
                                                                            ? buyer.tarefa_padrao.split(',').map((s: string) => s.trim()) 
                                                                            : []
                                                                        
                                                                        const upperList = currentList.map(s => s.toUpperCase())
                                                                        if (upperList.includes(cat.toUpperCase())) {
                                                                            currentList = currentList.filter(c => c.toUpperCase() !== cat.toUpperCase())
                                                                        } else {
                                                                            currentList = [...currentList, cat]
                                                                        }
                                                                        
                                                                        const updatedVal = currentList.length > 0 ? currentList.join(',') : null
                                                                        
                                                                        try {
                                                                            const { error } = await supabase
                                                                                .from('profiles')
                                                                                .update({ tarefa_padrao: updatedVal })
                                                                                .eq('id', buyer.id)
                                                                            
                                                                            if (error) throw error
                                                                            toast.success(`Responsabilidades de ${buyer.display_name || buyer.nome || 'comprador'} atualizadas!`)
                                                                            
                                                                            // Atualiza o estado local de profiles
                                                                            setProfiles(prev => prev.map(p => p.id === buyer.id ? { ...p, tarefa_padrao: updatedVal } : p))
                                                                        } catch (err: any) {
                                                                            toast.error('Erro ao salvar responsabilidades: ' + err.message)
                                                                        }
                                                                    }}
                                                                >
                                                                    {label}
                                                                </Badge>
                                                            )
                                                        })}
                                                    </div>
                                                </TableCell>
                                            </TableRow>
                                        ))
                                    )}
                                </TableBody>
                            </Table>
                        </div>
                    </div>

                    <DialogFooter>
                        <Button onClick={() => setShowTeamModal(false)}>
                            Fechar
                        </Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>

            {/* Modal de Registrar Compra */}
            <Dialog open={!!registrarCompraPedido} onOpenChange={(open) => {
                if (!open) {
                    setRegistrarCompraPedido(null)
                    setPrecoComprado('')
                    setMarcaComprada('')
                    setPrazoChegada('')
                }
            }}>
                <DialogContent className="sm:max-w-md">
                    <DialogHeader>
                        <div className="flex items-center gap-2">
                            <div className="w-8 h-8 rounded-lg bg-emerald-100 text-emerald-600 dark:bg-emerald-900/40 dark:text-emerald-400 flex items-center justify-center">
                                <ShoppingCart className="w-4 h-4" />
                            </div>
                            <div>
                                <DialogTitle className="text-base font-black uppercase tracking-tight">
                                    Registrar Compra
                                </DialogTitle>
                                <DialogDescription className="text-xs">
                                    Preencha os detalhes reais da compra para finalizar o item.
                                </DialogDescription>
                            </div>
                        </div>
                    </DialogHeader>

                    {registrarCompraPedido && (
                        <div className="space-y-4 my-2">
                            <div className="bg-zinc-50 dark:bg-zinc-900/40 p-3 rounded-lg border border-zinc-100 dark:border-zinc-800">
                                <span className="text-[10px] font-bold text-zinc-400 uppercase block mb-0.5">Item a Comprar</span>
                                <span className="text-xs font-bold text-zinc-800 dark:text-zinc-200 line-clamp-2">
                                    {getItemDesc(registrarCompraPedido)}
                                </span>
                                <span className="text-[10px] font-black text-brand-accent uppercase block mt-1">
                                    Qtd Solicitada: {registrarCompraPedido.quantidade_solicitada} {getItemUnidade(registrarCompraPedido)}
                                </span>
                            </div>

                            <div>
                                <Label className="text-xs font-bold text-zinc-600 dark:text-zinc-400 uppercase tracking-wide">
                                    Tipo de Compra *
                                </Label>
                                <div className="flex gap-2 mt-1.5">
                                    <Button
                                        type="button"
                                        variant={compraTipo === 'COMPLETA' ? 'default' : 'outline'}
                                        className="h-8 flex-1 text-xs font-bold"
                                        onClick={() => {
                                            setCompraTipo('COMPLETA')
                                            setQtdComprada(String(registrarCompraPedido.quantidade_solicitada))
                                        }}
                                    >
                                        Completa
                                    </Button>
                                    <Button
                                        type="button"
                                        variant={compraTipo === 'PARCIAL' ? 'default' : 'outline'}
                                        className="h-8 flex-1 text-xs font-bold"
                                        onClick={() => {
                                            setCompraTipo('PARCIAL')
                                            setQtdComprada('')
                                        }}
                                    >
                                        Parcial
                                    </Button>
                                </div>
                            </div>

                            {compraTipo === 'PARCIAL' && (
                                <div className="animate-in fade-in slide-in-from-top-1 duration-200">
                                    <Label htmlFor="qtd_comprada" className="text-xs font-bold text-zinc-600 dark:text-zinc-400 uppercase tracking-wide">
                                        Quantidade Comprada *
                                    </Label>
                                    <Input
                                        id="qtd_comprada"
                                        type="number"
                                        min={1}
                                        max={(registrarCompraPedido.quantidade_solicitada || 1) - 1}
                                        value={qtdComprada}
                                        onChange={(e) => setQtdComprada(e.target.value)}
                                        placeholder={`Máximo: ${(registrarCompraPedido.quantidade_solicitada || 1) - 1}`}
                                        className="mt-1 h-9 text-sm font-black"
                                        required
                                    />
                                </div>
                            )}

                            <div>
                                <Label htmlFor="preco_comprado" className="text-xs font-bold text-zinc-600 dark:text-zinc-400 uppercase tracking-wide">
                                    Preço Unitário Pago (R$) *
                                </Label>
                                <Input
                                    id="preco_comprado"
                                    type="number"
                                    step="0.01"
                                    min={0.01}
                                    value={precoComprado}
                                    onChange={(e) => setPrecoComprado(e.target.value)}
                                    placeholder="0,00"
                                    className="mt-1 h-9 text-sm font-black"
                                    required
                                />
                            </div>

                            <div>
                                <Label htmlFor="marca_comprada" className="text-xs font-bold text-zinc-650 dark:text-zinc-400 uppercase tracking-wide">
                                    Marca / Fabricante Comprado *
                                </Label>
                                <Input
                                    id="marca_comprada"
                                    value={marcaComprada}
                                    onChange={(e) => setMarcaComprada(e.target.value)}
                                    placeholder="Ex: Eurofarma, EMS, Samsung..."
                                    className="mt-1 h-9 text-xs font-bold uppercase"
                                    required
                                />
                            </div>

                            <div>
                                <Label htmlFor="prazo_chegada" className="text-xs font-bold text-zinc-650 dark:text-zinc-400 uppercase tracking-wide">
                                    Prazo Estimado de Chegada (Previsão de Entrega) *
                                </Label>
                                <Input
                                    id="prazo_chegada"
                                    type="date"
                                    value={prazoChegada}
                                    onChange={(e) => setPrazoChegada(e.target.value)}
                                    className="mt-1 h-9 text-xs font-bold"
                                    required
                                />
                            </div>
                        </div>
                    )}

                    <DialogFooter className="gap-2">
                        <Button 
                            variant="outline" 
                            onClick={() => {
                                setRegistrarCompraPedido(null)
                                setPrecoComprado('')
                                setMarcaComprada('')
                                setPrazoChegada('')
                            }}
                            disabled={registrandoCompraLoading}
                        >
                            Cancelar
                        </Button>
                        <Button
                            onClick={handleConfirmarRegistroCompra}
                            disabled={registrandoCompraLoading}
                            className="bg-emerald-600 hover:bg-emerald-700 text-white gap-2 font-bold uppercase text-[10px] tracking-wider"
                        >
                            {registrandoCompraLoading ? (
                                <Loader2 className="w-4 h-4 animate-spin" />
                            ) : (
                                <CheckCircle2 className="w-4 h-4" />
                            )}
                            Confirmar Compra
                        </Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>

            {/* Modal de Sinalizar Erro / Quarentena */}
            <Dialog open={!!erroPedido} onOpenChange={(open) => !open && setErroPedido(null)}>
                <DialogContent className="max-w-md bg-white dark:bg-zinc-950 border border-zinc-200 dark:border-zinc-800 shadow-xl rounded-xl">
                    <DialogHeader>
                        <DialogTitle className="text-zinc-800 dark:text-zinc-100 flex items-center gap-2 font-black uppercase text-sm">
                            ⚠️ Sinalizar Erro / Quarentena
                        </DialogTitle>
                    </DialogHeader>
                    {erroPedido && (
                        <div className="space-y-4 py-3">
                            <div className="p-3.5 bg-zinc-50 dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-xl space-y-1">
                                <p className="text-[10px] text-zinc-400 font-bold uppercase tracking-wider">Item a ser corrigido</p>
                                <p className="text-xs font-bold text-zinc-800 dark:text-zinc-200 line-clamp-2">{getItemDesc(erroPedido)}</p>
                                <p className="text-[10px] text-zinc-500">Solicitado por: <strong className="font-semibold text-zinc-700 dark:text-zinc-300">{erroPedido.usuario_solicitante || 'Sistema'}</strong></p>
                            </div>
                            
                            <div className="space-y-1.5">
                                <Label className="text-[10px] uppercase font-bold text-zinc-500 tracking-wide">Motivo do Erro / Justificativa da Quarentena</Label>
                                <textarea
                                    className="w-full min-h-[100px] p-3 text-xs bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-850 rounded-xl focus:outline-none focus:ring-2 focus:ring-amber-500 placeholder-zinc-400 text-zinc-800 dark:text-zinc-100"
                                    placeholder="Explique o que precisa ser corrigido pelo solicitante (ex: categoria incorreta, descrição errada, quantidade excessiva...)"
                                    value={erroJustificativa}
                                    onChange={(e) => setErroJustificativa(e.target.value)}
                                />
                            </div>
                            
                            <DialogFooter className="gap-2">
                                <Button variant="outline" onClick={() => setErroPedido(null)} disabled={erroLoading} className="rounded-xl h-9 text-xs">
                                    Cancelar
                                </Button>
                                <Button onClick={handleSaveErroCadastro} disabled={erroLoading} className="bg-amber-600 hover:bg-amber-700 text-white rounded-xl h-9 text-xs flex items-center gap-1.5">
                                    {erroLoading && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
                                    Enviar para Quarentena
                                </Button>
                            </DialogFooter>
                        </div>
                    )}
                </DialogContent>
            </Dialog>

            {/* Modal de Correção Geral de Solicitação (Para Gestores/Admins) */}
            <Dialog open={!!corrigirPedido} onOpenChange={(open) => {
                if (!open) {
                    setCorrigirPedido(null)
                    setCorrigirDescricao('')
                    setCorrigirImagem(null)
                    setCorrigirImagemPreview(null)
                    setExistingCorrigirImagePath(null)
                }
            }}>
                <DialogContent className="sm:max-w-md bg-white dark:bg-zinc-950 border border-zinc-200 dark:border-zinc-800 shadow-xl rounded-xl">
                    <DialogHeader className="border-b pb-3 border-zinc-100 dark:border-zinc-800">
                        <div className="flex items-center gap-2">
                            <div className="w-8 h-8 rounded-lg bg-amber-100 text-amber-600 dark:bg-amber-900/40 dark:text-amber-400 flex items-center justify-center">
                                <Pencil className="w-4 h-4" />
                            </div>
                            <div>
                                <DialogTitle className="text-base font-black uppercase tracking-tight text-zinc-900 dark:text-white">
                                    Corrigir Solicitação de Compra
                                </DialogTitle>
                                <DialogDescription className="text-xs text-zinc-500">
                                    Esta alteração ficará registrada na trilha de auditoria e requer justificativa obrigatória.
                                </DialogDescription>
                            </div>
                        </div>
                    </DialogHeader>

                    {corrigirPedido && (
                        <div className="space-y-4 my-2 text-xs">
                            <div>
                                <Label htmlFor="corr_desc" className="text-[10px] font-bold text-zinc-500 dark:text-zinc-400 uppercase tracking-wider">
                                    Descrição do Item
                                </Label>
                                <Textarea
                                    id="corr_desc"
                                    value={corrigirDescricao}
                                    onChange={(e) => setCorrigirDescricao(e.target.value)}
                                    placeholder="Descrição completa do item..."
                                    className="mt-1 font-bold text-zinc-850 dark:text-zinc-150 text-xs min-h-[60px]"
                                />
                                <span className="text-[9px] text-zinc-400 block mt-1">
                                    Solicitado por: <strong>{corrigirPedido.usuario_solicitante || 'Sistema'}</strong> em {new Date(corrigirPedido.created_at).toLocaleDateString('pt-BR')}
                                </span>
                            </div>

                            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                                <div>
                                    <Label htmlFor="corr_qtd" className="text-[10px] font-bold text-zinc-500 dark:text-zinc-400 uppercase tracking-wider">
                                        Quantidade Solicitada
                                    </Label>
                                    <Input
                                        id="corr_qtd"
                                        type="number"
                                        min={1}
                                        value={corrigirQuantidade}
                                        onChange={(e) => setCorrigirQuantidade(Math.max(1, Number(e.target.value)))}
                                        className="mt-1 h-9 font-bold"
                                    />
                                </div>

                                <div>
                                    <Label htmlFor="corr_unidade" className="text-[10px] font-bold text-zinc-500 dark:text-zinc-400 uppercase tracking-wider">
                                        Unidade (Apresentação)
                                    </Label>
                                    <Input
                                        id="corr_unidade"
                                        type="text"
                                        value={corrigirUnidade}
                                        onChange={(e) => setCorrigirUnidade(e.target.value.toUpperCase())}
                                        placeholder="Ex: CX, CP, UN, AMP..."
                                        className="mt-1 h-9 font-bold uppercase text-[11px]"
                                    />
                                </div>

                                <div>
                                    <Label htmlFor="corr_cat" className="text-[10px] font-bold text-zinc-500 dark:text-zinc-400 uppercase tracking-wider">
                                        Categoria
                                    </Label>
                                    <Select value={corrigirCategoria} onValueChange={setCorrigirCategoria}>
                                        <SelectTrigger id="corr_cat" className="mt-1 h-9 font-bold text-[11px] uppercase">
                                            <SelectValue />
                                        </SelectTrigger>
                                        <SelectContent>
                                            <SelectItem value="MATERIAL HOSPITALAR" className="text-xs">MATERIAL HOSPITALAR</SelectItem>
                                            <SelectItem value="MEDICAMENTO" className="text-xs">MEDICAMENTO</SelectItem>
                                            <SelectItem value="ODONTO" className="text-xs">ODONTO</SelectItem>
                                            <SelectItem value="DIETA" className="text-xs">DIETA</SelectItem>
                                            <SelectItem value="COSMÉTICO" className="text-xs">COSMÉTICO</SelectItem>
                                            <SelectItem value="MOBILIÁRIO" className="text-xs">MOBILIÁRIO</SelectItem>
                                            <SelectItem value="ELETRÔNICO" className="text-xs">ELETRÔNICO</SelectItem>
                                        </SelectContent>
                                    </Select>
                                </div>
                            </div>

                            <div>
                                <Label htmlFor="corr_prazo" className="text-[10px] font-bold text-zinc-500 dark:text-zinc-400 uppercase tracking-wider">
                                    Prazo Limite para Compras
                                </Label>
                                <Input
                                    id="corr_prazo"
                                    type="date"
                                    value={corrigirPrazo}
                                    onChange={(e) => setCorrigirPrazo(e.target.value)}
                                    className="mt-1 h-9 font-bold text-[11px]"
                                />
                            </div>

                            <div>
                                <Label htmlFor="corr_obs" className="text-[10px] font-bold text-zinc-500 dark:text-zinc-400 uppercase tracking-wider">
                                    Observações Adicionais
                                </Label>
                                <Textarea
                                    id="corr_obs"
                                    value={corrigirObs}
                                    onChange={(e) => setCorrigirObs(e.target.value)}
                                    placeholder="Caso precise complementar a observação..."
                                    className="mt-1 min-h-[60px] text-xs leading-relaxed"
                                />
                            </div>

                            {/* Material de Apoio */}
                            <div>
                                <Label htmlFor="corr_imagem" className="text-[10px] font-bold text-zinc-500 dark:text-zinc-400 uppercase tracking-wider">
                                    Material de Apoio (Opcional)
                                </Label>
                                <Input
                                    id="corr_imagem"
                                    type="file"
                                    accept="image/*"
                                    onChange={handleCorrigirImageChange}
                                    className="mt-1 text-xs cursor-pointer bg-white dark:bg-zinc-950"
                                />
                                {corrigirImagemPreview && (
                                    <div className="mt-2 relative w-24 h-24 border rounded-lg overflow-hidden group">
                                        <img src={corrigirImagemPreview} alt="Preview" className="w-full h-full object-cover" />
                                        <button 
                                            type="button" 
                                            onClick={handleRemoveCorrigirImage}
                                            className="absolute top-1 right-1 bg-red-600 hover:bg-red-700 text-white rounded-full p-0.5 shadow transition-colors"
                                        >
                                            <X className="w-3 h-3" />
                                        </button>
                                    </div>
                                )}
                            </div>

                            <div className="border-t pt-3 border-zinc-100 dark:border-zinc-800">
                                <Label htmlFor="corr_just" className="text-[10px] font-black text-red-500 dark:text-red-400 uppercase tracking-wider flex items-center gap-1">
                                    Justificativa da Correção * (Obrigatória)
                                </Label>
                                <Textarea
                                    id="corr_just"
                                    value={corrigirJustificativa}
                                    onChange={(e) => setCorrigirJustificativa(e.target.value)}
                                    placeholder="Ex: Correção de quantidade digitada errada / alteração de categoria para fins de distribuição..."
                                    className="mt-1.5 min-h-[80px] text-xs border-red-200 focus-visible:ring-red-400 leading-relaxed bg-red-50/10"
                                    required
                                />
                            </div>
                        </div>
                    )}

                    <DialogFooter className="gap-2 border-t pt-3 border-zinc-100 dark:border-zinc-800">
                        <Button 
                            variant="outline" 
                            size="sm"
                            onClick={() => {
                                setCorrigirPedido(null)
                                setCorrigirImagem(null)
                                setCorrigirImagemPreview(null)
                                setExistingCorrigirImagePath(null)
                            }}
                            disabled={corrigirLoading}
                            className="text-[10px] font-bold uppercase tracking-wider"
                        >
                            Cancelar
                        </Button>
                        <Button
                            size="sm"
                            onClick={handleSaveCorrigir}
                            disabled={corrigirLoading || !corrigirJustificativa.trim()}
                            className="bg-amber-600 hover:bg-amber-700 text-white gap-2 font-bold uppercase text-[10px] tracking-wider disabled:opacity-50"
                        >
                            {corrigirLoading ? (
                                <Loader2 className="w-4.5 h-4.5 animate-spin" />
                            ) : (
                                <Pencil className="w-3.5 h-3.5" />
                            )}
                            Salvar Correção
                        </Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>

            {/* Modal de Exclusão de Solicitação (Requer Justificativa Obrigatória) */}
            <Dialog open={!!excluirPedido} onOpenChange={(open) => {
                if (!open) {
                    setExcluirPedido(null)
                    setExcluirJustificativa('')
                }
            }}>
                <DialogContent className="sm:max-w-md bg-white dark:bg-zinc-950 border border-zinc-200 dark:border-zinc-800 shadow-xl rounded-xl">
                    <DialogHeader className="border-b pb-3 border-zinc-100 dark:border-zinc-800">
                        <div className="flex items-center gap-2">
                            <div className="w-8 h-8 rounded-lg bg-red-100 text-red-600 dark:bg-red-950/40 dark:text-red-400 flex items-center justify-center">
                                <Trash2 className="w-4 h-4" />
                            </div>
                            <div>
                                <DialogTitle className="text-base font-black uppercase tracking-tight text-zinc-900 dark:text-white">
                                    Excluir Solicitação de Compra
                                </DialogTitle>
                                <DialogDescription className="text-xs text-zinc-500">
                                    Esta ação removerá a solicitação e registrará a justificativa no log de auditoria.
                                </DialogDescription>
                            </div>
                        </div>
                    </DialogHeader>

                    {excluirPedido && (
                        <div className="space-y-4 my-2 text-xs">
                            <div className="p-3 bg-red-50/50 dark:bg-red-950/20 border border-red-200/50 dark:border-red-900/40 rounded-lg space-y-1">
                                <span className="text-[10px] font-bold text-red-700 dark:text-red-400 uppercase tracking-wider block">
                                    Item a ser Excluído
                                </span>
                                <p className="font-bold text-zinc-900 dark:text-zinc-100 text-xs">
                                    {getItemDesc(excluirPedido)}
                                </p>
                                <div className="text-[10px] text-zinc-500 flex items-center gap-3 mt-1">
                                    <span>Qtd: <strong>{excluirPedido.quantidade_solicitada} un</strong></span>
                                    <span>Solicitado por: <strong>{excluirPedido.usuario_solicitante || 'Sistema'}</strong></span>
                                </div>
                            </div>

                            <div>
                                <Label htmlFor="excluir_just" className="text-[10px] font-black text-red-600 dark:text-red-400 uppercase tracking-wider flex items-center gap-1">
                                    Justificativa da Exclusão * (Obrigatória)
                                </Label>
                                <Textarea
                                    id="excluir_just"
                                    value={excluirJustificativa}
                                    onChange={(e) => setExcluirJustificativa(e.target.value)}
                                    placeholder="Informe o motivo do cancelamento/exclusão desta solicitação..."
                                    className="mt-1.5 min-h-[90px] text-xs border-red-200 focus-visible:ring-red-400 leading-relaxed bg-red-50/10"
                                    required
                                />
                            </div>
                        </div>
                    )}

                    <DialogFooter className="gap-2 border-t pt-3 border-zinc-100 dark:border-zinc-800">
                        <Button 
                            variant="outline" 
                            size="sm"
                            onClick={() => {
                                setExcluirPedido(null)
                                setExcluirJustificativa('')
                            }}
                            disabled={excluirLoading}
                            className="text-[10px] font-bold uppercase tracking-wider"
                        >
                            Cancelar
                        </Button>
                        <Button
                            size="sm"
                            variant="destructive"
                            onClick={handleConfirmarExclusao}
                            disabled={excluirLoading || !excluirJustificativa.trim()}
                            className="bg-red-600 hover:bg-red-700 text-white text-[10px] font-bold uppercase tracking-wider gap-1.5"
                        >
                            {excluirLoading ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Trash2 className="w-3.5 h-3.5" />}
                            Confirmar Exclusão
                        </Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>

            {/* Modal para marcar solicitação como notificada */}
            <Dialog open={notificarModalOpen} onOpenChange={(open) => !open && setNotificarModalOpen(false)}>
                <DialogContent className="sm:max-w-md bg-white dark:bg-zinc-950 border border-zinc-200 dark:border-zinc-800 shadow-xl rounded-2xl p-6">
                    <DialogHeader className="border-b pb-3 border-zinc-100 dark:border-zinc-800">
                        <div className="flex items-center gap-2">
                            <div className="w-8 h-8 rounded-lg bg-amber-100 text-amber-600 dark:bg-amber-900/40 dark:text-amber-400 flex items-center justify-center">
                                <Alert className="w-4 h-4" />
                            </div>
                            <div>
                                <DialogTitle className="text-base font-black uppercase tracking-tight text-zinc-900 dark:text-white">
                                    Marcar Solicitação como Notificada
                                </DialogTitle>
                                <DialogDescription className="text-xs text-zinc-500">
                                    Preencha os dados e anexe a notificação oficial recebida do cliente.
                                </DialogDescription>
                            </div>
                        </div>
                    </DialogHeader>

                    <form onSubmit={handleConfirmNotificarPedido} className="space-y-4 my-2 text-xs">
                        {selectedPedidoParaNotificar && (
                            <div className="bg-zinc-50 dark:bg-zinc-900/40 p-3 rounded-lg border border-zinc-150 dark:border-zinc-800">
                                <span className="text-[9px] font-black text-zinc-400 uppercase block mb-0.5">Item Selecionado</span>
                                <span className="font-bold text-zinc-800 dark:text-zinc-200 line-clamp-2">
                                    {getItemDesc(selectedPedidoParaNotificar)}
                                </span>
                                <span className="text-[9px] text-zinc-400 block mt-1">
                                    Qtd Solicitada: <strong>{selectedPedidoParaNotificar.quantidade_solicitada} {getItemUnidade(selectedPedidoParaNotificar)}</strong>
                                </span>
                            </div>
                        )}

                        <div className="space-y-1">
                            <Label htmlFor="notif_data_sol" className="text-[10px] font-bold text-zinc-500 dark:text-zinc-400 uppercase tracking-wider">
                                Data Real da Notificação *
                            </Label>
                            <Input
                                id="notif_data_sol"
                                type="date"
                                value={notificarData}
                                onChange={(e) => setNotificarData(e.target.value)}
                                className="mt-1 h-9 font-bold text-[11px]"
                                required
                            />
                            <p className="text-[9px] text-zinc-400">
                                Informe a data oficial em que o cliente de fato notificou o atraso da entrega.
                            </p>
                        </div>

                        <div className="space-y-1.5 pt-2 border-t border-zinc-100 dark:border-zinc-800">
                            <Label htmlFor="notif_file_sol" className="text-[10px] font-black text-red-500 uppercase tracking-wider">
                                Documento da Notificação (PDF/Imagem) *
                            </Label>
                            <Input
                                id="notif_file_sol"
                                type="file"
                                accept="application/pdf,image/*"
                                onChange={(e) => setNotificarFile(e.target.files?.[0] || null)}
                                className="cursor-pointer file:text-brand-accent mt-1 h-9 font-medium"
                                required
                            />
                            <p className="text-[9px] text-zinc-400">
                                O anexo do documento que comprova a notificação do cliente é obrigatório.
                            </p>
                        </div>

                        <DialogFooter className="gap-2 border-t pt-4 border-zinc-100 dark:border-zinc-800">
                            <Button 
                                type="button"
                                variant="outline" 
                                size="sm"
                                onClick={() => setNotificarModalOpen(false)}
                                disabled={submittingNotificacao}
                                className="text-[10px] font-bold uppercase tracking-wider"
                            >
                                Cancelar
                            </Button>
                            <Button
                                type="submit"
                                size="sm"
                                disabled={submittingNotificacao || !notificarData || !notificarFile}
                                className="bg-amber-600 hover:bg-amber-700 text-white gap-2 font-bold uppercase text-[10px] tracking-wider disabled:opacity-50"
                            >
                                {submittingNotificacao ? (
                                    <Loader2 className="w-4 h-4 animate-spin" />
                                ) : (
                                    <CheckCircle2 className="w-3.5 h-3.5" />
                                )}
                                Registrar Notificação
                            </Button>
                        </DialogFooter>
                    </form>
                </DialogContent>
            </Dialog>

            {/* Modal: Reatribuir Responsável e Categoria */}
            <Dialog open={reassignModalOpen} onOpenChange={setReassignModalOpen}>
                <DialogContent className="sm:max-w-md bg-white dark:bg-zinc-900 border-zinc-200 dark:border-zinc-800">
                    <DialogHeader>
                        <DialogTitle className="text-base font-bold flex items-center gap-2 text-zinc-900 dark:text-white">
                            <UserPlus className="w-5 h-5 text-brand-accent" />
                            Reatribuir Responsável da Solicitação
                        </DialogTitle>
                        <DialogDescription className="text-xs text-zinc-500">
                            Ao alterar o comprador responsável, é obrigatório definir a categoria da solicitação para manter a organização do setor.
                        </DialogDescription>
                    </DialogHeader>

                    <div className="space-y-4 my-2 text-xs">
                        {reassignPedido && (
                            <div className="p-3 bg-zinc-50 dark:bg-zinc-800/60 rounded-lg border border-zinc-200/80 dark:border-zinc-700/60">
                                <span className="text-[10px] font-bold uppercase tracking-wider text-zinc-400 block mb-0.5">Item Selecionado</span>
                                <p className="font-bold text-zinc-900 dark:text-zinc-100 text-xs">
                                    {getItemDesc(reassignPedido)}
                                </p>
                                <p className="text-[10px] text-zinc-500 mt-1">
                                    Qtd: <strong className="text-zinc-800 dark:text-zinc-200">{reassignPedido.quantidade_solicitada} {getItemUnidade(reassignPedido)}</strong> • Categoria atual: <strong className="text-brand-accent">{getItemCategoria(reassignPedido)}</strong>
                                </p>
                            </div>
                        )}

                        {reassignBulkIds && (
                            <div className="p-3 bg-zinc-50 dark:bg-zinc-800/60 rounded-lg border border-zinc-200/80 dark:border-zinc-700/60">
                                <span className="text-[10px] font-bold uppercase tracking-wider text-zinc-400 block mb-0.5">Atribuição em Lote</span>
                                <p className="font-bold text-zinc-900 dark:text-zinc-100 text-xs">
                                    {reassignBulkIds.length} solicitações de compras selecionadas
                                </p>
                            </div>
                        )}

                        <div>
                            <Label htmlFor="reassign_buyer" className="text-[10px] font-bold text-zinc-500 dark:text-zinc-400 uppercase tracking-wider">
                                Novo Comprador Responsável *
                            </Label>
                            <Select 
                                value={reassignBuyerId || ''} 
                                onValueChange={(val) => {
                                    setReassignBuyerId(val)
                                    const b = profiles.find(p => p.id === val)
                                    if (b?.tarefa_padrao) {
                                        const buyerCats = b.tarefa_padrao.split(',').map((x: string) => normalizeCategory(x))
                                        if (reassignCategory && !buyerCats.includes(normalizeCategory(reassignCategory))) {
                                            if (buyerCats.length > 0) setReassignCategory(buyerCats[0])
                                        }
                                    }
                                }}
                            >
                                <SelectTrigger id="reassign_buyer" className="mt-1 h-9 font-bold text-xs">
                                    <SelectValue placeholder="Selecione o comprador..." />
                                </SelectTrigger>
                                <SelectContent>
                                    {profiles.map(p => (
                                        <SelectItem key={p.id} value={p.id} className="text-xs font-semibold">
                                            {p.display_name?.toUpperCase()} {p.tarefa_padrao ? `(${p.tarefa_padrao})` : ''}
                                        </SelectItem>
                                    ))}
                                </SelectContent>
                            </Select>
                        </div>

                        <div>
                            <Label htmlFor="reassign_cat" className="text-[10px] font-bold text-zinc-500 dark:text-zinc-400 uppercase tracking-wider flex items-center justify-between">
                                <span>Categoria da Solicitação *</span>
                                <span className="text-[9px] text-zinc-400 font-medium">Confira ou ajuste a categoria se necessário</span>
                            </Label>
                            <Select value={reassignCategory} onValueChange={setReassignCategory}>
                                <SelectTrigger id="reassign_cat" className="mt-1 h-9 font-bold text-xs uppercase border-zinc-200 dark:border-zinc-800">
                                    <SelectValue placeholder="Selecione a categoria..." />
                                </SelectTrigger>
                                <SelectContent>
                                    <SelectItem value="MATERIAL HOSPITALAR" className="text-xs font-semibold">MATERIAL HOSPITALAR</SelectItem>
                                    <SelectItem value="MEDICAMENTO" className="text-xs font-semibold">MEDICAMENTO</SelectItem>
                                    <SelectItem value="ODONTO" className="text-xs font-semibold">ODONTO</SelectItem>
                                    <SelectItem value="DIETA" className="text-xs font-semibold">DIETA</SelectItem>
                                    <SelectItem value="COSMÉTICO" className="text-xs font-semibold">COSMÉTICO</SelectItem>
                                    <SelectItem value="MOBILIÁRIO" className="text-xs font-semibold">MOBILIÁRIO</SelectItem>
                                    <SelectItem value="ELETRÔNICO" className="text-xs font-semibold">ELETRÔNICO</SelectItem>
                                </SelectContent>
                            </Select>
                        </div>
                    </div>

                    <DialogFooter className="gap-2 border-t pt-3 border-zinc-100 dark:border-zinc-800">
                        <Button 
                            variant="outline" 
                            size="sm"
                            onClick={() => setReassignModalOpen(false)}
                            disabled={reassignLoading}
                            className="text-[10px] font-bold uppercase tracking-wider"
                        >
                            Cancelar
                        </Button>
                        <Button
                            size="sm"
                            onClick={handleConfirmReassign}
                            disabled={reassignLoading || !reassignBuyerId || !reassignCategory}
                            className="bg-brand-accent hover:bg-brand-accent/90 text-white text-[10px] font-bold uppercase tracking-wider gap-1.5"
                        >
                            {reassignLoading ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : null}
                            Confirmar Reatribuição
                        </Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>

            {/* Modal de Anexo Único em Lote (Vendedor + Município) - Restrito a DEV/ADM */}
            <Dialog open={showAnexoLoteModal} onOpenChange={setShowAnexoLoteModal}>
                <DialogContent className="w-full max-w-2xl max-h-[90vh] flex flex-col bg-white dark:bg-zinc-950 border border-zinc-200 dark:border-zinc-800 shadow-2xl rounded-2xl p-6 overflow-hidden">
                    <DialogHeader className="border-b pb-4 border-zinc-100 dark:border-zinc-800 shrink-0">
                        <div className="flex items-center gap-3">
                            <div className="w-10 h-10 rounded-xl bg-purple-100 text-purple-600 dark:bg-purple-900/40 dark:text-purple-300 flex items-center justify-center shrink-0">
                                <Paperclip className="w-5 h-5" />
                            </div>
                            <div className="min-w-0">
                                <DialogTitle className="text-lg font-black uppercase tracking-tight text-zinc-900 dark:text-white flex items-center gap-2 flex-wrap">
                                    Anexar Documento Único em Lote
                                    <Badge className="bg-purple-600 text-white text-[9px] font-black uppercase">Exclusivo DEV/ADM</Badge>
                                </DialogTitle>
                                <DialogDescription className="text-xs text-zinc-500 font-medium">
                                    Envie 1 único arquivo no servidor e vincule instantaneamente a múltiplas solicitações filtradas por Vendedor e Município.
                                </DialogDescription>
                            </div>
                        </div>
                    </DialogHeader>

                    <div className="space-y-4 py-4 text-xs overflow-y-auto min-w-0">
                        {/* Filtros em 2 Colunas */}
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 p-3.5 bg-zinc-50 dark:bg-zinc-900/50 rounded-xl border border-zinc-200/80 dark:border-zinc-800 min-w-0">
                            <div className="min-w-0">
                                <Label className="text-[10px] font-bold text-zinc-500 dark:text-zinc-400 uppercase tracking-wider block mb-1">
                                    Vendedor / Solicitante
                                </Label>
                                <Select value={anexoLoteVendedor} onValueChange={setAnexoLoteVendedor}>
                                    <SelectTrigger className="h-9 font-bold text-xs bg-white dark:bg-zinc-950 w-full min-w-0 overflow-hidden">
                                        <SelectValue placeholder="Todos os Vendedores" className="truncate block" />
                                    </SelectTrigger>
                                    <SelectContent>
                                        <SelectItem value="ALL" className="text-xs font-bold">TODOS OS VENDEDORES / SOLICITANTES</SelectItem>
                                        {vendedoresSolicitantesUnicos.map(item => (
                                            <SelectItem key={item.key} value={item.key} className="text-xs font-medium">
                                                👤 {item.label}
                                            </SelectItem>
                                        ))}
                                    </SelectContent>
                                </Select>
                            </div>

                            <div className="min-w-0">
                                <Label className="text-[10px] font-bold text-zinc-500 dark:text-zinc-400 uppercase tracking-wider block mb-1">
                                    Município / Órgão Solicitante
                                </Label>
                                <Select value={anexoLoteMunicipio} onValueChange={setAnexoLoteMunicipio}>
                                    <SelectTrigger className="h-9 font-bold text-xs bg-white dark:bg-zinc-950 w-full min-w-0 overflow-hidden">
                                        <SelectValue placeholder="Todos os Municípios/Órgãos" className="truncate block" />
                                    </SelectTrigger>
                                    <SelectContent>
                                        <SelectItem value="ALL" className="text-xs font-bold">TODOS OS MUNICÍPIOS / ÓRGÃOS</SelectItem>
                                        {municipiosOrgaosUnicos.map(m => (
                                            <SelectItem key={m} value={m} className="text-xs font-medium">
                                                🏛️ {m}
                                            </SelectItem>
                                        ))}
                                    </SelectContent>
                                </Select>
                            </div>
                        </div>

                        {/* Tipo de Anexo e Data */}
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 min-w-0">
                            <div className="min-w-0">
                                <Label className="text-[10px] font-bold text-zinc-500 dark:text-zinc-400 uppercase tracking-wider block mb-1">
                                    Tipo do Documento / Anexo *
                                </Label>
                                <Select value={anexoLoteTipoDoc} onValueChange={(val: any) => setAnexoLoteTipoDoc(val)}>
                                    <SelectTrigger className="h-9 font-bold text-xs w-full min-w-0 overflow-hidden">
                                        <SelectValue className="truncate block" />
                                    </SelectTrigger>
                                    <SelectContent>
                                        <SelectItem value="NOTIFICACAO" className="text-xs font-bold">📄 NOTIFICAÇÃO DE ATRASO</SelectItem>
                                        <SelectItem value="DEMANDA_JUDICIAL" className="text-xs font-bold">⚖️ DEMANDA JUDICIAL</SelectItem>
                                        <SelectItem value="IMAGEM_DOC" className="text-xs font-bold">📷 IMAGEM / DOC TÉCNICO GERAL</SelectItem>
                                    </SelectContent>
                                </Select>
                            </div>

                            {anexoLoteTipoDoc === 'NOTIFICACAO' && (
                                <div className="min-w-0">
                                    <Label className="text-[10px] font-bold text-zinc-500 dark:text-zinc-400 uppercase tracking-wider block mb-1">
                                        Data da Notificação *
                                    </Label>
                                    <Input
                                        type="date"
                                        value={anexoLoteDataNotificacao}
                                        onChange={e => setAnexoLoteDataNotificacao(e.target.value)}
                                        className="h-9 font-bold text-xs w-full"
                                    />
                                </div>
                            )}
                        </div>

                        {/* Upload de Arquivo Único */}
                        <div className="p-3 border border-dashed border-purple-300 dark:border-purple-800 bg-purple-50/20 dark:bg-purple-950/20 rounded-xl space-y-1.5 min-w-0">
                            <Label className="text-xs font-bold text-purple-700 dark:text-purple-300 flex items-center gap-1.5">
                                <Paperclip className="w-4 h-4 text-purple-600 shrink-0" />
                                Arquivo Único (PDF / Imagem) *
                            </Label>
                            <Input
                                type="file"
                                accept="application/pdf,image/*"
                                onChange={e => setAnexoLoteFile(e.target.files?.[0] || null)}
                                className="text-xs bg-white dark:bg-zinc-950 cursor-pointer w-full"
                            />
                            <p className="text-[10px] text-zinc-400">
                                💡 Este único arquivo será armazenado 1 vez e compartilhado por todas as solicitações selecionadas abaixo.
                            </p>
                        </div>

                        {/* Lista de Solicitações Elegíveis */}
                        <div className="space-y-2 min-w-0">
                            <div className="flex items-center justify-between">
                                <span className="text-[11px] font-extrabold text-zinc-700 dark:text-zinc-300 uppercase tracking-wider">
                                    Solicitações Encontradas ({pedidosElegiveisLote.length})
                                </span>
                                <div className="flex items-center gap-2 shrink-0">
                                    <Button
                                        type="button"
                                        variant="ghost"
                                        size="sm"
                                        onClick={() => setAnexoLoteSelectedIds(new Set(pedidosElegiveisLote.map(p => p.id)))}
                                        className="h-6 text-[10px] font-bold text-purple-600"
                                    >
                                        Marcar Todos
                                    </Button>
                                    <Button
                                        type="button"
                                        variant="ghost"
                                        size="sm"
                                        onClick={() => setAnexoLoteSelectedIds(new Set())}
                                        className="h-6 text-[10px] font-bold text-zinc-400"
                                    >
                                        Desmarcar Todos
                                    </Button>
                                </div>
                            </div>

                            <div className="max-h-[180px] overflow-y-auto border border-zinc-200 dark:border-zinc-800 rounded-xl divide-y divide-zinc-100 dark:divide-zinc-800/60 p-1 bg-white dark:bg-zinc-950 min-w-0">
                                {pedidosElegiveisLote.length === 0 ? (
                                    <div className="py-6 text-center text-xs text-zinc-400 font-medium">
                                        Nenhuma solicitação de compra atende aos filtros selecionados.
                                    </div>
                                ) : (
                                    pedidosElegiveisLote.map(p => {
                                        const isSelected = anexoLoteSelectedIds.has(p.id)
                                        const obs = parseObservacoes(p.observacoes)
                                        const org = obs?.orgao_solicitante || p.item?.nota?.emissor || p.item_ata?.ata?.entidade_gerenciadora || '—'
                                        return (
                                            <div
                                                key={p.id}
                                                onClick={() => {
                                                    setAnexoLoteSelectedIds(prev => {
                                                        const next = new Set(prev)
                                                        if (next.has(p.id)) next.delete(p.id)
                                                        else next.add(p.id)
                                                        return next
                                                    })
                                                }}
                                                className={`p-2.5 flex items-center justify-between gap-3 text-xs cursor-pointer rounded-lg transition-colors min-w-0 ${isSelected ? 'bg-purple-50/60 dark:bg-purple-950/40' : 'hover:bg-zinc-50 dark:hover:bg-zinc-900/50'}`}
                                            >
                                                <div className="flex items-center gap-2.5 min-w-0">
                                                    <input
                                                        type="checkbox"
                                                        checked={isSelected}
                                                        onChange={() => {}}
                                                        className="w-4 h-4 rounded text-purple-600 focus:ring-purple-500 cursor-pointer shrink-0"
                                                    />
                                                    <div className="min-w-0">
                                                        <div className="font-bold text-zinc-800 dark:text-zinc-200 truncate">
                                                            #{p.id} - {getItemDesc(p)}
                                                        </div>
                                                        <div className="text-[10px] text-zinc-400 flex items-center gap-2 mt-0.5 truncate">
                                                            <span className="truncate">🏛️ {org}</span>
                                                            <span>•</span>
                                                            <span className="truncate">👤 {p.usuario_solicitante || 'Sistema'}</span>
                                                            <span>•</span>
                                                            <span className="shrink-0">Qtd: {p.quantidade_solicitada}</span>
                                                        </div>
                                                    </div>
                                                </div>
                                                <Badge variant="outline" className="text-[9px] font-bold shrink-0 uppercase">
                                                    {p.status || 'PENDENTE'}
                                                </Badge>
                                            </div>
                                        )
                                    })
                                )}
                            </div>
                        </div>
                    </div>

                    <DialogFooter className="border-t pt-3 border-zinc-100 dark:border-zinc-800 gap-2">
                        <Button
                            type="button"
                            variant="outline"
                            onClick={() => setShowAnexoLoteModal(false)}
                            disabled={anexoLoteSubmitting}
                            className="h-10 text-xs font-bold rounded-xl"
                        >
                            Cancelar
                        </Button>
                        <Button
                            type="button"
                            onClick={handleSaveAnexoLote}
                            disabled={anexoLoteSubmitting || !anexoLoteFile || anexoLoteSelectedIds.size === 0}
                            className="h-10 text-xs font-black bg-gradient-to-r from-purple-600 to-indigo-600 hover:from-purple-500 hover:to-indigo-500 text-white rounded-xl gap-2 shadow-lg shadow-purple-600/20 disabled:opacity-50"
                        >
                            {anexoLoteSubmitting ? (
                                <>
                                    <Loader2 className="w-4 h-4 animate-spin" />
                                    Vinculando em Lote...
                                </>
                            ) : (
                                <>
                                    <Paperclip className="w-4 h-4" />
                                    Vincular Anexo ({anexoLoteSelectedIds.size} Itens)
                                </>
                            )}
                        </Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>
        </div>
    )
}
