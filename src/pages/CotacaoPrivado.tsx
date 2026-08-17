import { useState, useEffect, useMemo } from 'react'
import { supabase } from '../lib/supabase'
import { toast } from 'sonner'
import { logAction } from '../lib/logger'
import { useAuth } from '../AuthContext'
import { exportToExcel, exportToPDF } from '../reportUtils'
import { ProductAutocomplete } from '../components/ui/ProductAutocomplete'
import { 
  Plus, 
  Search, 
  Trash2, 
  Pencil, 
  FileDown, 
  CheckCircle2, 
  FileSpreadsheet, 
  ClipboardList, 
  Calendar,
  AlertTriangle,
  RotateCcw,
  Paperclip,
  ShoppingCart
} from 'lucide-react'
import { uploadDocument } from '../lib/storage'
import { Card } from '../components/ui/card'
import { Button } from '../components/ui/button'
import { Input } from '../components/ui/input'
import { Badge } from '../components/ui/badge'
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
import { 
  Dialog, 
  DialogContent, 
  DialogHeader, 
  DialogTitle, 
  DialogDescription, 
  DialogFooter 
} from '../components/ui/dialog'
import { Label } from '../components/ui/label'

interface Cotacao {
  id: string
  codigo_interno: string | null
  data_lancamento: string
  descricao: string
  marca: string | null
  situacao: string
  quantidade: number
  unidade: string
  comprou_status: string | null
  data_compra: string | null
  solicitante: string
  solicitante_id: string | null
  owner_id: string | null
  urgente: boolean
  anexo_url: string | null
  anexo_compras_url: string | null
  created_at: string
  categoria?: string
  cliente?: string
  documento_origem?: string
  tipo_documento?: string
  pedidos_compra?: {
    id: number | string
    status: string
    created_at: string
  }[]
}

export function CotacaoPrivado() {
  const { profile } = useAuth()
  const [cotacoes, setCotacoes] = useState<Cotacao[]>([])
  const [loading, setLoading] = useState(true)
  const [searchTerm, setSearchTerm] = useState('')
  const [filterSituacao, setFilterSituacao] = useState<'ALL' | 'COTAR' | 'REABASTECER'>('ALL')
  const [filterComprou, setFilterComprou] = useState<'ALL' | 'PENDENTE' | 'COMPRADO'>('ALL')
  const [filterUrgente, setFilterUrgente] = useState<'ALL' | 'URGENTE' | 'NORMAL'>('ALL')

  // Modals state
  const [showFormModal, setShowFormModal] = useState(false)
  const [showCompraModal, setShowCompraModal] = useState(false)
  const [selectedCotacao, setSelectedCotacao] = useState<Cotacao | null>(null)
  const [selectedFile, setSelectedFile] = useState<File | null>(null)
  const [compraFile, setCompraFile] = useState<File | null>(null)

  // Solicitar Compra Modal states
  const [showSolicitarCompraModal, setShowSolicitarCompraModal] = useState(false)
  const [solicitarItem, setSolicitarItem] = useState<Cotacao | null>(null)
  const [solicitarQtd, setSolicitarQtd] = useState(1)
  const [solicitarPrazo, setSolicitarPrazo] = useState('')
  const [solicitarCategoria, setSolicitarCategoria] = useState('MATERIAL HOSPITALAR')
  const [solicitarMarca, setSolicitarMarca] = useState('')
  const [solicitarObs, setSolicitarObs] = useState('')
  const [solicitarENotificacao, setSolicitarENotificacao] = useState(false)
  const [solicitarNotificacaoFile, setSolicitarNotificacaoFile] = useState<File | null>(null)
  const [solicitarEDemandaJudicial, setSolicitarEDemandaJudicial] = useState(false)
  const [solicitarDemandaJudicialFile, setSolicitarDemandaJudicialFile] = useState<File | null>(null)
  const [solicitarLoading, setSolicitarLoading] = useState(false)

  // Form states
  const [formData, setFormData] = useState({
    id: '',
    codigo_interno: '',
    descricao: '',
    marca: '',
    situacao: 'COTAR',
    quantidade: 1,
    unidade: 'UNID',
    urgente: false,
    solicitante: '',
    anexo_url: '',
    categoria: 'MATERIAL HOSPITALAR',
    cliente: '',
    documento_origem: '',
    tipo_documento: 'EMPENHO'
  })

  const [compraForm, setCompraForm] = useState({
    fornecedor: '',
    data_compra: new Date().toISOString().split('T')[0],
    preco: ''
  })

  const [submitting, setSubmitting] = useState(false)

  // User permissions - Liberado para todos os vendedores
  const isVendedorPrivado = profile?.setor === 'VENDAS_PRIVADO' || profile?.setor === 'VENDAS'
  const isDirecao = profile?.setor === 'DIRECAO'
  const isAdmin = profile?.nivel === 'DEV' || profile?.nivel === 'ADM'
  const isCompras = profile?.setor === 'COMPRAS'
  
  // Can modify (Insert/Edit/Delete shortage details)
  const canModify = isVendedorPrivado || isDirecao || isAdmin || true
  
  // Can register/revert purchases
  const canRegisterPurchase = isVendedorPrivado || isDirecao || isAdmin || isCompras || true

  // Fetch cotacoes
  const fetchCotacoes = async () => {
    try {
      setLoading(true)
      const { data, error } = await (supabase as any)
        .from('cotacoes_privado')
        .select('*, pedidos_compra(id, status, created_at)')
        .order('urgente', { ascending: false })
        .order('created_at', { ascending: false })

      if (error) throw error
      setCotacoes((data as Cotacao[]) || [])
    } catch (err: any) {
      toast.error('Erro ao carregar cotações: ' + err.message)
    } finally {
      setLoading(false)
    }
  }

  // Set up real-time subscription
  useEffect(() => {
    fetchCotacoes()
    
    // Set default display name for solicitante when modal opens
    if (profile) {
      setFormData(prev => ({
        ...prev,
        solicitante: profile.display_name || profile.email?.split('@')[0].toUpperCase() || ''
      }))
    }

    const channel = supabase
      .channel('cotacoes-realtime')
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'cotacoes_privado' },
        () => {
          fetchCotacoes()
        }
      )
      .subscribe()

    return () => {
      supabase.removeChannel(channel)
    }
  }, [profile])

  // Filter cotacoes locally
  const filteredCotacoes = cotacoes.filter(item => {
    const matchesSearch = 
      item.descricao.toLowerCase().includes(searchTerm.toLowerCase()) ||
      (item.codigo_interno && item.codigo_interno.toLowerCase().includes(searchTerm.toLowerCase())) ||
      (item.marca && item.marca.toLowerCase().includes(searchTerm.toLowerCase())) ||
      item.solicitante.toLowerCase().includes(searchTerm.toLowerCase()) ||
      (item.cliente && item.cliente.toLowerCase().includes(searchTerm.toLowerCase())) ||
      (item.documento_origem && item.documento_origem.toLowerCase().includes(searchTerm.toLowerCase()))

    const matchesSituacao = filterSituacao === 'ALL' || item.situacao === filterSituacao
    const matchesComprou = 
      filterComprou === 'ALL' || 
      (filterComprou === 'PENDENTE' && !item.comprou_status) || 
      (filterComprou === 'COMPRADO' && !!item.comprou_status)
    const matchesUrgente = 
      filterUrgente === 'ALL' ||
      (filterUrgente === 'URGENTE' && item.urgente) ||
      (filterUrgente === 'NORMAL' && !item.urgente)

    return matchesSearch && matchesSituacao && matchesComprou && matchesUrgente
  })

  const [currentPage, setCurrentPage] = useState(1)
  const ITEMS_PER_PAGE = 30

  useEffect(() => {
    setCurrentPage(1)
  }, [searchTerm, filterSituacao, filterComprou, filterUrgente])

  const paginatedCotacoes = useMemo(() => {
    return filteredCotacoes.slice((currentPage - 1) * ITEMS_PER_PAGE, currentPage * ITEMS_PER_PAGE)
  }, [filteredCotacoes, currentPage])

  const totalPages = Math.ceil(filteredCotacoes.length / ITEMS_PER_PAGE)

  // Metric stats
  const totalItems = cotacoes.length
  const totalPendentes = cotacoes.filter(c => !c.comprou_status).length
  const totalComprados = cotacoes.filter(c => !!c.comprou_status).length
  const totalUrgentes = cotacoes.filter(c => c.urgente && !c.comprou_status).length

  // Open modal for new item
  const handleNewItem = () => {
    setFormData({
      id: '',
      codigo_interno: '',
      descricao: '',
      marca: '',
      situacao: 'COTAR',
      quantidade: 1,
      unidade: 'UNID',
      urgente: false,
      solicitante: profile?.display_name || profile?.email?.split('@')[0].toUpperCase() || '',
      anexo_url: '',
      categoria: 'MATERIAL HOSPITALAR',
      cliente: '',
      documento_origem: '',
      tipo_documento: 'EMPENHO'
    })
    setSelectedFile(null)
    setShowFormModal(true)
  }

  // Open modal for edit item
  const handleEditItem = (item: Cotacao) => {
    setFormData({
      id: item.id,
      codigo_interno: item.codigo_interno || '',
      descricao: item.descricao,
      marca: item.marca || '',
      situacao: item.situacao,
      quantidade: item.quantidade,
      unidade: item.unidade,
      urgente: item.urgente,
      solicitante: item.solicitante,
      anexo_url: item.anexo_url || '',
      categoria: item.categoria || 'MATERIAL HOSPITALAR',
      cliente: item.cliente || '',
      documento_origem: item.documento_origem || '',
      tipo_documento: item.tipo_documento || 'EMPENHO'
    })
    setSelectedFile(null)
    setShowFormModal(true)
  }

  // Save shortage (insert/update)
  const handleSaveItem = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!formData.descricao.trim()) {
      toast.error('A descrição é obrigatória.')
      return
    }
    if (formData.quantidade <= 0) {
      toast.error('A quantidade deve ser maior que zero.')
      return
    }

    const isPublicUser = profile?.setor === 'VENDAS' || profile?.setor === 'EMPENHOS'
    if (isPublicUser) {
      if (!formData.marca.trim()) {
        toast.error('A marca preferencial é obrigatória.')
        return
      }
      if (!formData.cliente.trim()) {
        toast.error('O nome do cliente / órgão é obrigatório.')
        return
      }
      if (formData.tipo_documento !== 'COMPRA DIRETA' && !formData.documento_origem.trim()) {
        toast.error('O número do documento de origem (empenho/ordem/etc.) é obrigatório.')
        return
      }
    }

    try {
      setSubmitting(true)
      const isEditing = !!formData.id
      let finalAnexoUrl = formData.anexo_url

      if (selectedFile) {
        toast.info('Enviando anexo, por favor aguarde...')
        const { publicUrl, error: uploadError } = await uploadDocument(selectedFile)
        if (uploadError) throw uploadError
        if (publicUrl) {
          finalAnexoUrl = publicUrl
        }
      }

      const isCompraDireta = formData.tipo_documento === 'COMPRA DIRETA'
      const finalDocOrigem = isCompraDireta ? (formData.documento_origem.trim() || 'COMPRA DIRETA') : formData.documento_origem.trim()

      const payload = {
        codigo_interno: formData.codigo_interno.trim() || null,
        descricao: formData.descricao.trim().toUpperCase(),
        marca: formData.marca.trim().toUpperCase() || null,
        situacao: formData.situacao,
        quantidade: Number(formData.quantidade),
        unidade: formData.unidade.trim().toUpperCase(),
        urgente: formData.urgente,
        solicitante: formData.solicitante.trim().toUpperCase(),
        solicitante_id: profile?.id || null,
        owner_id: isEditing ? undefined : (profile?.id || null),
        anexo_url: finalAnexoUrl || null,
        categoria: formData.categoria || null,
        cliente: formData.cliente.trim().toUpperCase() || null,
        documento_origem: finalDocOrigem.toUpperCase() || null,
        tipo_documento: formData.tipo_documento || null
      }

      if (isEditing) {
        const { error } = await supabase
          .from('cotacoes_privado')
          .update(payload)
          .eq('id', formData.id)

        if (error) throw error
        await logAction('EDITAR_FALTA', 'cotacoes_privado', formData.id, payload)
        toast.success('Solicitação de falta atualizada com sucesso.')
      } else {
        const { data, error } = await supabase
          .from('cotacoes_privado')
          .insert([payload])
          .select()

        if (error) throw error
        const newId = data?.[0]?.id || ''
        await logAction('LANCAR_FALTA', 'cotacoes_privado', newId, payload)
        toast.success('Falta lançada com sucesso.')
      }

      setShowFormModal(false)
      setSelectedFile(null)
      fetchCotacoes()
    } catch (err: any) {
      toast.error('Erro ao salvar item: ' + err.message)
    } finally {
      setSubmitting(false)
    }
  }

  // Delete shortage
  const handleDeleteItem = async (item: Cotacao) => {
    if (!window.confirm(`Tem certeza que deseja excluir a falta de "${item.descricao}"?`)) {
      return
    }

    try {
      const { error } = await supabase
        .from('cotacoes_privado')
        .delete()
        .eq('id', item.id)

      if (error) throw error
      await logAction('EXCLUIR_FALTA', 'cotacoes_privado', item.id, { descricao: item.descricao })
      toast.success('Solicitação de falta excluída.')
      fetchCotacoes()
    } catch (err: any) {
      toast.error('Erro ao excluir item: ' + err.message)
    }
  }

  // Open register purchase modal
  const handleOpenPurchaseModal = (item: Cotacao) => {
    setSelectedCotacao(item)
    
    let initialFornecedor = ''
    let initialPreco = ''
    if (item.comprou_status) {
      const match = item.comprou_status.match(/(?:COMPRADO|COTADO) - ([^(]+)(?:\(R\$\s*([^)]+)\))?/)
      if (match) {
        initialFornecedor = match[1].trim()
        if (match[2]) {
          initialPreco = match[2].trim().replace(/\./g, '').replace(',', '.')
        }
      }
    }

    setCompraForm({
      fornecedor: initialFornecedor,
      data_compra: item.data_compra || new Date().toISOString().split('T')[0],
      preco: initialPreco
    })
    setShowCompraModal(true)
  }

  // Save quotation details (mark as resolved)
  const handleSavePurchase = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!selectedCotacao) return
    if (!compraForm.fornecedor.trim()) {
      toast.error('O fornecedor é obrigatório.')
      return
    }

    try {
      setSubmitting(true)
      
      let finalAnexoComprasUrl = selectedCotacao.anexo_compras_url
      if (compraFile) {
        toast.info('Enviando anexo da cotação, por favor aguarde...')
        const { publicUrl, error: uploadError } = await uploadDocument(compraFile)
        if (uploadError) throw uploadError
        if (publicUrl) {
          finalAnexoComprasUrl = publicUrl
        }
      }

      const precoNum = Number(compraForm.preco.replace(',', '.'))
      const precoFormatado = !isNaN(precoNum) && precoNum > 0 
      const comprou_status = `COTADO - ${compraForm.fornecedor.trim().toUpperCase()}${precoFormatado ? ` (R$ ${precoNum.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })})` : ''}`
      const payload = {
        comprou_status,
        data_compra: compraForm.data_compra,
        anexo_compras_url: finalAnexoComprasUrl
      }

      const { error } = await supabase
        .from('cotacoes_privado')
        .update(payload)
        .eq('id', selectedCotacao.id)

      if (error) throw error

      await logAction('REGISTRAR_COMPRA_FALTA', 'cotacoes_privado', selectedCotacao.id, payload)
      toast.success('Cotação registrada com sucesso.')
      setShowCompraModal(false)
      setCompraFile(null)
      fetchCotacoes()
    } catch (err: any) {
      toast.error('Erro ao registrar cotação: ' + err.message)
    } finally {
      setSubmitting(false)
    }
  }

  // Quick upload for Compras attachments
  const handleUploadComprasFile = async (itemId: string, files: FileList | null) => {
    if (!files || files.length === 0) return
    const file = files[0]
    try {
      toast.info('Enviando anexo do compras, por favor aguarde...')
      const { publicUrl, error: uploadError } = await uploadDocument(file)
      if (uploadError) throw uploadError
      if (!publicUrl) throw new Error('Não foi possível obter a URL pública do anexo.')

      const { error: dbError } = await supabase
        .from('cotacoes_privado')
        .update({ anexo_compras_url: publicUrl })
        .eq('id', itemId)

      if (dbError) throw dbError

      await logAction('ANEXAR_ARQUIVO_COMPRAS_COTACAO', 'cotacoes_privado', itemId, { anexo_compras_url: publicUrl })
      toast.success('Anexo do compras enviado com sucesso!')
      fetchCotacoes()
    } catch (err: any) {
      console.error(err)
      toast.error('Erro ao enviar anexo: ' + err.message)
    }
  }

  // Revert/Undo purchase
  const handleRevertPurchase = async (item: Cotacao) => {
    if (!window.confirm(`Deseja reverter o status de cotação de "${item.descricao}"? O item voltará para o status pendente.`)) {
      return
    }

    try {
      const payload = {
        comprou_status: null,
        data_compra: null,
        anexo_compras_url: null
      }

      const { error } = await supabase
        .from('cotacoes_privado')
        .update(payload)
        .eq('id', item.id)

      if (error) throw error

      await logAction('REVERTER_COMPRA_FALTA', 'cotacoes_privado', item.id, {})
      toast.success('Status de cotação revertido para pendente.')
      fetchCotacoes()
    } catch (err: any) {
      toast.error('Erro ao reverter status de cotação: ' + err.message)
    }
  }

  // Handle solicitar compra a partir de cotação finalizada
  const handleSolicitarCompra = (item: Cotacao) => {
    // Detect Categoria
    const d = item.descricao.toUpperCase()
    let categoria = item.categoria || 'MATERIAL HOSPITALAR'
    if (!item.categoria) {
      if (/DIETA|SUPLEMENTO|NUTRICIONAL|FÓRMULA INFANTIL|FORMULA INFANTIL|ENTERAL|NUTREN|SUPPORT|SUSTAGEN/.test(d)) categoria = 'DIETA'
      else if (/MEDIC|COMPRIMIDO|CÁPSULA|CAPSULA|AMPOLA|INJETÁVEL|INJETAVEL|FRASCO AMPOLA|SULFATO|CLORIDRATO|DICLOFENACO|IBUPROFENO|DIPIRONA|CETOPROFENO|AMOXICILINA|AZITROMICINA|OMEPRAZOL|INSULINA|SORO GLICOSADO|SORO FISIOLÓG|ANTIBIÓTICO|ANTIBIOTIC|ANALGÉSICO/.test(d)) categoria = 'MEDICAMENTO'
      else if (/ODONTO|DENTAL|DENTÁRIO|DENTARIO|ORTODON|PASTA DENTAL|BROCA DENTAL|CIMENTO DENTÁRIO|SUGADOR|ENDODON|EXTRATOR|ESPELHO CLÍNICO|ESPELHO BUCAL/.test(d)) categoria = 'ODONTO'
      else if (/SHAMPOO|CONDICIONADOR|SABONETE|CREME HIDRATANTE|LOÇÃO|LOCAO|DESODORANTE|PROTETOR SOLAR|COSMÉTICO|COSMETICO/.test(d)) categoria = 'COSMÉTICO'
      else if (/COMPRESSA|GAUZ|CATETER|SERINGA|LUVA CIRÚRG|LUVA LATEX|MÁSCARA CIRÚRG|MASCARA CIRURG|BANDAGEM|ESPARADRAPO|MICROPORE|EQUIPO|CÂNULA|CANULA|ATADURA|SONDA|CURATIVO|LANCETA|FITA GLICEMIA|ALGODÃO HIDRÓF|ALGODAO HIDROF|MATERIAL HOSP|MAT HOSP|AGULHA|BISTURI/.test(d)) categoria = 'MATERIAL HOSPITALAR'
      else if (/CADEIRA|MESA |ARMÁRIO|ARMARIO|ESTANTE|SOFÁ|SOFA|BANCADA|PRATELEIRA|POLTRONA|MACA |LEITO |CAMA HOSPITALAR|MOBILIÁRIO|MOBILIARIO|ARQUIVO DE AÇO|ARQUIVO METAL|GUARDA-ROUPA/.test(d)) categoria = 'MOBILIÁRIO'
      else if (/COMPUTADOR|MONITOR|IMPRESSORA|TECLADO|MOUSE |NOBREAK|TABLET|SWITCH|ROTEADOR|NOTEBOOK|PROJETOR|WEBCAM|HD EXTERNO|SCANNER|CABO DE REDE|RACK/.test(d)) categoria = 'ELETRÔNICO'
    }

    const dataLimite = new Date()
    dataLimite.setDate(dataLimite.getDate() + 5)
    const defaultPrazo = dataLimite.toISOString().split('T')[0]

    setSolicitarItem(item)
    setSolicitarQtd(item.quantidade)
    setSolicitarPrazo(defaultPrazo)
    setSolicitarCategoria(categoria)
    setSolicitarMarca(item.marca || '')
    setSolicitarObs('')
    setSolicitarENotificacao(false)
    setSolicitarNotificacaoFile(null)
    setSolicitarEDemandaJudicial(false)
    setSolicitarDemandaJudicialFile(null)
    setShowSolicitarCompraModal(true)
  }

  // Confirm and insert to pedidos_compra
  const handleConfirmSolicitarCompra = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!solicitarItem) return
    if (solicitarQtd <= 0) {
      toast.error('A quantidade deve ser maior que zero.')
      return
    }
    if (!solicitarPrazo) {
      toast.error('O prazo limite é obrigatório.')
      return
    }

    try {
      setSolicitarLoading(true)
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) throw new Error('Usuário não autenticado.')

      // 1. Upload files if selected
      let notificacaoUrl: string | null = null
      if (solicitarENotificacao && solicitarNotificacaoFile) {
        toast.info('Enviando documento de notificação...')
        const { publicUrl, error: errUpload } = await uploadDocument(solicitarNotificacaoFile)
        if (errUpload) throw errUpload
        notificacaoUrl = publicUrl
      }

      let demandaUrl: string | null = null
      if (solicitarEDemandaJudicial && solicitarDemandaJudicialFile) {
        toast.info('Enviando documento de demanda judicial...')
        const { publicUrl, error: errUpload } = await uploadDocument(solicitarDemandaJudicialFile)
        if (errUpload) throw errUpload
        demandaUrl = publicUrl
      }

      // 2. Tentar atribuir comprador correspondente (suportando múltiplas categorias)
      let assignedToId: string | null = null
      const catNorm = (solicitarCategoria || '').toUpperCase().trim()
      const { data: buyers } = await supabase
        .from('profiles')
        .select('id, tarefa_padrao')
        .eq('setor', 'COMPRAS')

      if (buyers && buyers.length > 0) {
        const match = buyers.find(b => {
          if (!b.tarefa_padrao) return false
          const cats = b.tarefa_padrao.split(',').map((x: string) => x.trim().toUpperCase())
          return cats.some(c => c === catNorm || c.includes(catNorm) || catNorm.includes(c))
        })
        if (match) assignedToId = match.id
      }

      // 3. Extrair fornecedor e preço de comprou_status
      let fornecedor = 'PRIVADO'
      let preco: number | null = null
      if (solicitarItem.comprou_status) {
        const match = solicitarItem.comprou_status.match(/(?:COMPRADO|COTADO) - ([^(]+)(?:\(R\$\s*([^)]+)\))?/)
        if (match) {
          fornecedor = match[1].trim()
          if (match[2]) {
            const rawPreco = match[2].trim().replace(/\./g, '').replace(',', '.')
            const parsedPreco = Number(rawPreco)
            if (!isNaN(parsedPreco)) {
              preco = parsedPreco
            }
          }
        }
      }

      // 4. Montar observações do tipo COMPRA_LIVRE
      const obsPayload = {
        tipo: 'COMPRA_LIVRE',
        descricao: solicitarItem.descricao,
        documento_origem: solicitarItem.documento_origem || 'COTACAO',
        tipo_documento: solicitarItem.tipo_documento || 'COMPRA DIRETA',
        unidade: solicitarItem.unidade,
        valor_unitario: preco,
        orgao_solicitante: solicitarItem.cliente || null,
        marca: solicitarMarca || null,
        obs_adicional: solicitarObs || `Solicitado via Cotação #${solicitarItem.codigo_interno || solicitarItem.id} (Fornecedor: ${fornecedor})`,
        categoria: solicitarCategoria,
        e_notificacao: solicitarENotificacao,
        arquivo_notificacao_caminho: notificacaoUrl,
        demanda_judicial: solicitarEDemandaJudicial,
        arquivo_demanda_judicial_caminho: demandaUrl
      }

      const dataLimite = new Date(solicitarPrazo)
      dataLimite.setHours(23, 59, 59, 0)

      // 5. Inserir na tabela pedidos_compra
      const { error: insertError } = await supabase.from('pedidos_compra').insert([{
        item_id: null,
        item_ata_id: null,
        cotacao_privado_id: solicitarItem.id,
        quantidade_solicitada: solicitarQtd,
        status: 'PENDENTE',
        prazo_limite: dataLimite.toISOString(),
        solicitante_id: user.id,
        usuario_solicitante: profile?.email || profile?.display_name || user.email || 'Sistema',
        observacoes: JSON.stringify(obsPayload),
        produto_catalogo_id: null,
        categoria: solicitarCategoria,
        assigned_to: assignedToId,
        e_notificacao: solicitarENotificacao,
        demanda_judicial: solicitarEDemandaJudicial
      }])

      if (insertError) throw insertError

      await logAction('SOLICITAR_COMPRA_COTACAO', 'cotacoes_privado', solicitarItem.id, {
        fornecedor,
        preco,
        quantidade: solicitarQtd
      })

      toast.success('Solicitação de compra enviada para o compras com sucesso!')
      setShowSolicitarCompraModal(false)
      fetchCotacoes()
    } catch (err: any) {
      toast.error('Erro ao solicitar compra: ' + err.message)
    } finally {
      setSolicitarLoading(false)
    }
  }

  // Export to Excel
  const handleExportExcel = () => {
    if (filteredCotacoes.length === 0) {
      toast.error('Nenhum dado para exportar.')
      return
    }

    const dataToExport = filteredCotacoes.map(item => ({
      'CÓD. CATALOGO': item.codigo_interno || '—',
      'DATA DE LANÇ': item.data_lancamento ? new Date(item.data_lancamento).toLocaleDateString('pt-BR') : '—',
      'DESCRIÇÃO': item.descricao,
      'MARCA': item.marca || 'QUALQUER MARCA',
      'SITUAÇÃO': item.situacao,
      'QUANTIDADE': Number(item.quantidade),
      'UNIDADE': item.unidade,
      'CLIENTE': item.cliente || '—',
      'DOCUMENTO ORIGEM': item.documento_origem || '—',
      'STATUS COTAÇÃO': item.comprou_status ? item.comprou_status.replace('COMPRADO - ', 'COTADO - ') : 'AGUARDANDO',
      'DATA DA COTAÇÃO': item.data_compra ? new Date(item.data_compra).toLocaleDateString('pt-BR') : '—',
      'SOLICITANTE': item.solicitante
    }))

    exportToExcel(dataToExport, `Central_de_Cotacoes_${new Date().toISOString().split('T')[0]}`)
    toast.success('Relatório Excel exportado com sucesso.')
  }

  // Export to PDF
  const handleExportPDF = () => {
    if (filteredCotacoes.length === 0) {
      toast.error('Nenhum dado para exportar.')
      return
    }

    const columns = [
      'CÓDIGO',
      'DATA LANÇ',
      'DESCRIÇÃO',
      'MARCA',
      'SITUAÇÃO',
      'QUANT',
      'UN',
      'CLIENTE',
      'DOC ORIGEM',
      'STATUS COTAÇÃO',
      'DATA COTAÇÃO',
      'SOLICITANTE'
    ]

    const rows = filteredCotacoes.map(item => [
      item.codigo_interno || '—',
      item.data_lancamento ? new Date(item.data_lancamento).toLocaleDateString('pt-BR') : '—',
      item.descricao,
      item.marca || 'QUALQUER MARCA',
      item.situacao,
      Number(item.quantidade).toLocaleString('pt-BR'),
      item.unidade,
      item.cliente || '—',
      item.documento_origem || '—',
      item.comprou_status ? item.comprou_status.replace('COMPRADO - ', 'COTADO - ') : 'AGUARDANDO',
      item.data_compra ? new Date(item.data_compra).toLocaleDateString('pt-BR') : '—',
      item.solicitante
    ])

    exportToPDF(
      'CENTRAL DE COTAÇÕES - RELATÓRIO DE COTAÇÕES E FALTAS',
      columns,
      rows,
      `Central_de_Cotacoes_PDF_${new Date().toISOString().split('T')[0]}`
    )
    toast.success('Relatório PDF exportado com sucesso.')
  }

  return (
    <div className="space-y-6">
      {/* Premium Header */}
      <div className="relative overflow-hidden rounded-3xl bg-gradient-to-br from-zinc-900 via-slate-900 to-zinc-950 p-8 shadow-2xl border border-slate-800/80">
        <div className="absolute -right-10 -top-10 h-40 w-40 rounded-full bg-blue-500/10 blur-3xl" />
        <div className="absolute -left-10 -bottom-10 h-40 w-40 rounded-full bg-indigo-500/10 blur-3xl" />
        
        <div className="relative flex flex-col md:flex-row md:items-center md:justify-between gap-6">
          <div className="space-y-2">
            <div className="flex items-center gap-2">
              <Badge className="bg-blue-500/10 text-blue-400 border border-blue-800/30 hover:bg-blue-500/20 font-bold uppercase text-[9px] px-2.5 py-1 tracking-wider rounded-lg">
                {profile?.setor === 'VENDAS' ? 'Vendas Público' : (profile?.setor === 'EMPENHOS' ? 'Empenhos' : 'Geral')}
              </Badge>
              <span className="h-1.5 w-1.5 rounded-full bg-emerald-400 animate-pulse" />
              <span className="text-xs text-slate-400 font-semibold tracking-wide">Módulo de Cotações</span>
            </div>
            <h1 className="text-3xl font-extrabold tracking-tight text-white uppercase font-sans">
              Central de Cotações
            </h1>
            <p className="text-sm text-slate-300/90 max-w-xl leading-relaxed">
              Painel centralizado de cotações, gerenciamento de faltas de medicamentos/materiais e controle integrado de compras para todos os setores.
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-3">
            <Button
              onClick={handleExportExcel}
              variant="outline"
              className="h-10 bg-slate-800/40 border-slate-700 hover:bg-slate-800/85 hover:border-slate-655 text-white hover:text-white text-xs font-bold gap-2 rounded-xl transition-all"
            >
              <FileSpreadsheet className="w-4 h-4 text-emerald-400" />
              Exportar Excel
            </Button>
            <Button
              onClick={handleExportPDF}
              variant="outline"
              className="h-10 bg-slate-800/40 border-slate-700 hover:bg-slate-800/85 hover:border-slate-655 text-white hover:text-white text-xs font-bold gap-2 rounded-xl transition-all"
            >
              <FileDown className="w-4 h-4 text-red-400" />
              Exportar PDF
            </Button>

            {canModify && (
              <Button
                onClick={handleNewItem}
                className="h-10 bg-gradient-to-r from-blue-600 to-indigo-650 hover:from-blue-500 hover:to-indigo-555 text-white text-xs font-black gap-2 shadow-lg shadow-blue-950/45 border-none rounded-xl transition-all hover:scale-[1.02]"
              >
                <Plus className="w-4 h-4" />
                Lançar Cotação / Falta
              </Button>
            )}
          </div>
        </div>
      </div>

      {/* Metric Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-5">
        <Card className="p-6 bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-2xl shadow-sm relative overflow-hidden group hover:shadow-md hover:-translate-y-0.5 transition-all duration-200">
          <div className="absolute right-4 top-4 text-zinc-100 dark:text-zinc-800/30 group-hover:scale-110 transition-transform duration-300">
            <ClipboardList className="w-12 h-12" />
          </div>
          <div className="relative space-y-2">
            <span className="text-xs font-bold text-zinc-400 dark:text-zinc-500 uppercase tracking-wider">Total de Cotações</span>
            <div className="text-3xl font-black text-zinc-900 dark:text-white font-mono tracking-tight">{totalItems}</div>
            <p className="text-[10px] text-zinc-400 font-medium">Registros cadastrados no painel</p>
          </div>
        </Card>

        <Card className="p-6 bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-2xl shadow-sm border-l-4 border-l-amber-500 relative overflow-hidden group hover:shadow-md hover:-translate-y-0.5 transition-all duration-200">
          <div className="absolute right-4 top-4 text-amber-100 dark:text-amber-950/15 group-hover:scale-110 transition-transform duration-300">
            <Search className="w-12 h-12" />
          </div>
          <div className="relative space-y-2">
            <span className="text-xs font-bold text-amber-600 dark:text-amber-400 uppercase tracking-wider">Pendentes</span>
            <div className="text-3xl font-black text-zinc-900 dark:text-white font-mono tracking-tight">{totalPendentes}</div>
            <p className="text-[10px] text-zinc-400 font-medium">Itens aguardando cotação comercial</p>
          </div>
        </Card>

        <Card className="p-6 bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-2xl shadow-sm border-l-4 border-l-emerald-500 relative overflow-hidden group hover:shadow-md hover:-translate-y-0.5 transition-all duration-200">
          <div className="absolute right-4 top-4 text-emerald-100 dark:text-emerald-950/15 group-hover:scale-110 transition-transform duration-300">
            <CheckCircle2 className="w-12 h-12" />
          </div>
          <div className="relative space-y-2">
            <span className="text-xs font-bold text-emerald-600 dark:text-emerald-400 uppercase tracking-wider">Cotados / Atendidos</span>
            <div className="text-3xl font-black text-zinc-900 dark:text-white font-mono tracking-tight">{totalComprados}</div>
            <div className="flex items-center gap-1.5">
              <span className="text-[10px] text-emerald-500 font-bold bg-emerald-500/10 px-1.5 py-0.5 rounded">
                {totalItems > 0 ? `${Math.round((totalComprados / totalItems) * 100)}%` : '0%'}
              </span>
              <span className="text-[10px] text-zinc-400 font-medium">de cotações concluídas</span>
            </div>
          </div>
        </Card>

        <Card className="p-6 bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-2xl shadow-sm border-l-4 border-l-rose-500 relative overflow-hidden group hover:shadow-md hover:-translate-y-0.5 transition-all duration-200">
          <div className="absolute right-4 top-4 text-rose-100 dark:text-rose-950/15 group-hover:scale-110 transition-transform duration-300">
            <AlertTriangle className="w-12 h-12" />
          </div>
          <div className="relative space-y-2">
            <span className="text-xs font-bold text-rose-600 dark:text-rose-400 uppercase tracking-wider">Críticas / Urgentes</span>
            <div className="text-3xl font-black text-zinc-900 dark:text-white font-mono tracking-tight">{totalUrgentes}</div>
            <p className="text-[10px] text-rose-400 font-semibold uppercase">Requerem atenção prioritária</p>
          </div>
        </Card>
      </div>

      {/* Filters Area (Sleek Single Action Bar) */}
      <div className="flex flex-col lg:flex-row gap-3 bg-white dark:bg-zinc-900 p-4 border border-zinc-200 dark:border-zinc-800 rounded-2xl shadow-sm w-full">
        {/* Text Search */}
        <div className="relative flex-1 min-w-[200px]">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-zinc-400" />
          <Input
            placeholder="Buscar por descrição, código catálogo, marca, solicitante, documento ou órgão..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="pl-9 h-10 text-xs font-semibold rounded-xl border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 shadow-none focus-visible:ring-indigo-500"
          />
        </div>

        {/* Situação Filter */}
        <Select value={filterSituacao} onValueChange={(v: any) => setFilterSituacao(v)}>
          <SelectTrigger className="h-10 text-xs font-semibold w-full lg:w-44 border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 rounded-xl">
            <SelectValue placeholder="Situação" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="ALL" className="text-xs font-bold">TODAS AS SITUAÇÕES</SelectItem>
            <SelectItem value="COTAR" className="text-xs font-bold text-amber-500">COTAR</SelectItem>
            <SelectItem value="REABASTECER" className="text-xs font-bold text-purple-500">REABASTECER</SelectItem>
          </SelectContent>
        </Select>

        {/* Comprou? Filter */}
        <Select value={filterComprou} onValueChange={(v: any) => setFilterComprou(v)}>
          <SelectTrigger className="h-10 text-xs font-semibold w-full lg:w-44 border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 rounded-xl">
            <SelectValue placeholder="Status Cotação" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="ALL" className="text-xs font-bold">TODOS OS STATUS</SelectItem>
            <SelectItem value="PENDENTE" className="text-xs font-bold text-amber-500">PENDENTE</SelectItem>
            <SelectItem value="COMPRADO" className="text-xs font-bold text-emerald-500">COTADO</SelectItem>
          </SelectContent>
        </Select>

        {/* Urgência Filter */}
        <Select value={filterUrgente} onValueChange={(v: any) => setFilterUrgente(v)}>
          <SelectTrigger className="h-10 text-xs font-semibold w-full lg:w-40 border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 rounded-xl">
            <SelectValue placeholder="Criticidade" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="ALL" className="text-xs font-bold">TODAS AS CRITICIDADES</SelectItem>
            <SelectItem value="URGENTE" className="text-xs font-bold text-rose-500">URGENTE</SelectItem>
            <SelectItem value="NORMAL" className="text-xs font-bold text-zinc-400">NORMAL</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {/* Main Table */}
      <Card className="overflow-hidden bg-white dark:bg-zinc-900/60 border-zinc-200/80 dark:border-zinc-800/40 rounded-2xl shadow-md">
        <div className="overflow-x-auto">
          <Table>
            <TableHeader className="bg-zinc-50 dark:bg-zinc-950/40 border-b border-zinc-200 dark:border-zinc-800">
              <TableRow className="hover:bg-transparent">
                <TableHead className="font-bold text-zinc-400 uppercase text-[10px] w-20 tracking-wider">Cód. Catálogo</TableHead>
                <TableHead className="font-bold text-zinc-400 uppercase text-[10px] w-24 tracking-wider">Data Lançamento</TableHead>
                <TableHead className="font-bold text-zinc-400 uppercase text-[10px] min-w-[180px] tracking-wider">Produto / Descrição</TableHead>
                <TableHead className="font-bold text-zinc-400 uppercase text-[10px] w-32 tracking-wider">Marca Referência</TableHead>
                <TableHead className="font-bold text-zinc-400 uppercase text-[10px] w-24 tracking-wider">Situação</TableHead>
                <TableHead className="font-bold text-zinc-400 uppercase text-[10px] w-16 tracking-wider">Qtd.</TableHead>
                <TableHead className="font-bold text-zinc-400 uppercase text-[10px] w-16 tracking-wider">Un.</TableHead>
                <TableHead className="font-bold text-zinc-400 uppercase text-[10px] w-36 tracking-wider">Cotado?</TableHead>
                <TableHead className="font-bold text-zinc-400 uppercase text-[10px] w-28 tracking-wider">Data da Cotação</TableHead>
                <TableHead className="font-bold text-zinc-400 uppercase text-[10px] w-32 tracking-wider">Solicitante</TableHead>
                {canRegisterPurchase && (
                  <TableHead className="font-bold text-zinc-400 uppercase text-[10px] min-w-[150px] tracking-wider text-right sticky right-0 bg-zinc-50 dark:bg-zinc-950 z-20 shadow-xs">Ações</TableHead>
                )}
              </TableRow>
            </TableHeader>
            <TableBody>
              {loading ? (
                <TableRow>
                  <TableCell colSpan={11} className="h-48 text-center text-zinc-400 text-sm font-semibold italic">
                    Carregando cotações de faltas...
                  </TableCell>
                </TableRow>
              ) : filteredCotacoes.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={11} className="h-48 text-center text-zinc-400 text-sm font-semibold italic">
                    Nenhuma falta registrada com os filtros aplicados.
                  </TableCell>
                </TableRow>
              ) : (
                paginatedCotacoes.map((item: any) => {
                  // Determine row styling based on status and urgency (Fiel to screenshot)
                  let rowStyle = "hover:bg-zinc-50/50 dark:hover:bg-zinc-800/30 border-b border-zinc-100 dark:border-zinc-800/50 transition-colors"
                  if (item.comprou_status) {
                    // Green rows for bought items
                    rowStyle = "bg-emerald-50/75 dark:bg-emerald-950/20 text-emerald-900 dark:text-emerald-300 border-b border-emerald-100 dark:border-emerald-900/30 border-l-4 border-l-emerald-500 hover:bg-emerald-100/40 dark:hover:bg-emerald-950/30"
                  } else if (item.urgente) {
                    // Red rows for urgent/critical items
                    rowStyle = "bg-rose-50/85 dark:bg-rose-950/20 text-rose-900 dark:text-rose-300 border-b border-rose-100 dark:border-rose-900/30 border-l-4 border-l-rose-500 hover:bg-rose-100/40 dark:hover:bg-rose-950/30"
                  }

                  return (
                    <TableRow key={item.id} className={rowStyle}>
                      <TableCell className="font-mono text-[11px] font-bold text-zinc-500 dark:text-zinc-400">
                        {item.codigo_interno || '—'}
                      </TableCell>
                      <TableCell className="text-xs font-semibold text-zinc-600 dark:text-zinc-400">
                        {item.data_lancamento ? new Date(item.data_lancamento).toLocaleDateString('pt-BR') : '—'}
                      </TableCell>
                      <TableCell className="text-xs font-bold uppercase tracking-tight text-zinc-800 dark:text-zinc-100">
                        <div className="flex flex-col">
                          <span>{item.descricao}</span>
                          {item.anexo_url && (
                            <a 
                              href={item.anexo_url} 
                              target="_blank" 
                              rel="noopener noreferrer"
                              className="inline-flex items-center gap-1 mt-1 px-1.5 py-0.5 rounded bg-blue-50 text-blue-700 hover:bg-blue-100 dark:bg-blue-950/30 dark:text-blue-400 dark:hover:bg-blue-900/40 border border-blue-100 dark:border-blue-900/30 text-[9px] font-bold transition-all w-fit uppercase tracking-wider"
                              onClick={(e) => e.stopPropagation()}
                            >
                              <Paperclip className="w-2.5 h-2.5" />
                              Visualizar Anexo
                            </a>
                          )}
                          {item.anexo_compras_url && (
                            <a 
                              href={item.anexo_compras_url} 
                              target="_blank" 
                              rel="noopener noreferrer"
                              className="inline-flex items-center gap-1 mt-1 px-1.5 py-0.5 rounded bg-emerald-50 text-emerald-700 hover:bg-emerald-100 dark:bg-emerald-950/30 dark:text-emerald-400 dark:hover:bg-emerald-900/40 border border-emerald-100 dark:border-emerald-900/30 text-[9px] font-bold transition-all w-fit uppercase tracking-wider"
                              onClick={(e) => e.stopPropagation()}
                            >
                              <Paperclip className="w-2.5 h-2.5" />
                              Visualizar Anexo Compras
                            </a>
                          )}
                          {item.cliente && (
                            <span className="text-[10px] text-indigo-600 dark:text-indigo-400 font-extrabold uppercase mt-1 tracking-tight">
                              Órgão: {item.cliente} {item.documento_origem ? `| Doc: ${item.documento_origem}` : ''}
                            </span>
                          )}
                        </div>
                      </TableCell>
                      <TableCell className="text-xs font-semibold text-zinc-600 dark:text-zinc-400">
                        {item.marca || 'QUALQUER MARCA'}
                      </TableCell>
                      <TableCell>
                        {item.situacao === 'COTAR' ? (
                          <span className="text-[10px] font-black px-2 py-0.5 bg-amber-500/10 text-amber-600 dark:text-amber-400 rounded-md uppercase tracking-tighter">
                            COTAR
                          </span>
                        ) : (
                          <span className="text-[10px] font-black px-2 py-0.5 bg-purple-500/10 text-purple-600 dark:text-purple-400 rounded-md uppercase tracking-tighter">
                            REABASTECER
                          </span>
                        )}
                      </TableCell>
                      <TableCell className="text-xs font-bold font-mono">
                        {Number(item.quantidade).toLocaleString('pt-BR')}
                      </TableCell>
                      <TableCell className="text-xs font-bold text-zinc-500 dark:text-zinc-400 uppercase">
                        {item.unidade}
                      </TableCell>
                      <TableCell className="text-xs font-bold">
                        {item.comprou_status ? (
                          <span className="text-[10px] font-bold text-emerald-600 dark:text-emerald-400 uppercase">
                            {item.comprou_status.replace('COMPRADO - ', 'COTADO - ')}
                          </span>
                        ) : (
                          <span className="text-[10px] font-semibold text-zinc-400 dark:text-zinc-500 italic uppercase">
                            AGUARDANDO
                          </span>
                        )}
                      </TableCell>
                      <TableCell className="text-xs font-semibold text-zinc-600 dark:text-zinc-400">
                        {item.data_compra ? new Date(item.data_compra).toLocaleDateString('pt-BR') : '—'}
                      </TableCell>
                      <TableCell className="text-xs font-bold text-zinc-700 dark:text-zinc-300 uppercase">
                        {item.solicitante}
                      </TableCell>
                      
                      {/* Actions */}
                      {canRegisterPurchase && (
                        <TableCell className="text-right sticky right-0 bg-white/95 dark:bg-zinc-900/95 backdrop-blur-xs border-l border-zinc-200/60 dark:border-zinc-800/60 shadow-xs z-10">
                          <div className="flex items-center justify-end gap-2">
                            {isCompras && (
                              <div className="relative inline-block">
                                <input
                                  type="file"
                                  id={`upload-compras-${item.id}`}
                                  className="hidden"
                                  accept="application/pdf,image/*"
                                  onChange={(e) => handleUploadComprasFile(item.id, e.target.files)}
                                />
                                <Button
                                  size="icon"
                                  variant="ghost"
                                  title="Anexar Cotação (Compras)"
                                  className="h-8 w-8 text-indigo-600 hover:text-indigo-700 hover:bg-indigo-500/10 dark:hover:bg-indigo-500/20 rounded-lg"
                                  onClick={() => document.getElementById(`upload-compras-${item.id}`)?.click()}
                                >
                                  <Paperclip className="w-3.5 h-3.5" />
                                </Button>
                              </div>
                            )}
                            {!item.comprou_status ? (
                              <>
                                <Button
                                  onClick={() => handleOpenPurchaseModal(item)}
                                  size="icon"
                                  variant="ghost"
                                  title="Registrar Cotação"
                                  className="h-8 w-8 text-emerald-600 hover:text-emerald-700 hover:bg-emerald-500/10 dark:hover:bg-emerald-500/20 rounded-lg shrink-0"
                                >
                                  <CheckCircle2 className="w-4 h-4" />
                                </Button>

                                {!isCompras && (item.owner_id === profile?.id || isAdmin || isDirecao) && (
                                  <>
                                    <Button
                                      onClick={() => handleEditItem(item)}
                                      size="icon"
                                      variant="ghost"
                                      title="Editar"
                                      className="h-8 w-8 text-blue-600 hover:text-blue-700 hover:bg-blue-500/10 dark:hover:bg-blue-500/20 rounded-lg shrink-0"
                                    >
                                      <Pencil className="w-3.5 h-3.5" />
                                    </Button>
                                    <Button
                                      onClick={() => handleDeleteItem(item)}
                                      size="icon"
                                      variant="ghost"
                                      title="Excluir"
                                      className="h-8 w-8 text-red-600 hover:text-red-700 hover:bg-red-500/10 dark:hover:bg-red-500/20 rounded-lg shrink-0"
                                    >
                                      <Trash2 className="w-3.5 h-3.5" />
                                    </Button>
                                  </>
                                )}
                              </>
                            ) : (
                              <>
                                {item.pedidos_compra && item.pedidos_compra.length > 0 ? (
                                  <Badge className="bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border border-emerald-500/20 font-bold uppercase text-[8.5px] px-1.5 py-0.5 whitespace-nowrap max-w-[140px] truncate inline-block text-center shadow-xs" title={`Solicitação de compra já realizada (${item.pedidos_compra[0].status})`}>
                                    Compra Solicitada ({item.pedidos_compra[0].status})
                                  </Badge>
                                ) : (
                                  (item.owner_id === profile?.id || item.solicitante_id === profile?.id) && (
                                    <Button
                                      onClick={() => handleSolicitarCompra(item)}
                                      size="sm"
                                      variant="outline"
                                      title="Solicitar Compra"
                                      className="h-8 bg-indigo-50 dark:bg-indigo-950/20 text-indigo-600 dark:text-indigo-400 hover:bg-indigo-100 border-indigo-200 dark:border-indigo-900 px-2 py-1 text-[10px] font-black uppercase rounded-lg gap-1 flex items-center shrink-0"
                                    >
                                      <ShoppingCart className="w-3.5 h-3.5" />
                                      Solicitar Compra
                                    </Button>
                                  )
                                )}

                                {!isCompras && (item.owner_id === profile?.id || isAdmin || isDirecao) && (
                                  <Button
                                    onClick={() => handleRevertPurchase(item)}
                                    size="icon"
                                    variant="ghost"
                                    title="Reverter Cotação"
                                    className="h-8 w-8 text-zinc-500 hover:text-zinc-700 hover:bg-zinc-500/10 dark:hover:bg-zinc-500/20 rounded-lg shrink-0"
                                  >
                                    <RotateCcw className="w-3.5 h-3.5" />
                                  </Button>
                                )}
                                {!isCompras && (isAdmin || isDirecao) && (
                                  <Button
                                    onClick={() => handleDeleteItem(item)}
                                    size="icon"
                                    variant="ghost"
                                    title="Excluir"
                                    className="h-8 w-8 text-red-600 hover:text-red-700 hover:bg-red-500/10 dark:hover:bg-red-500/20 rounded-lg shrink-0"
                                  >
                                    <Trash2 className="w-3.5 h-3.5" />
                                  </Button>
                                )}
                              </>
                            )}
                          </div>
                        </TableCell>
                      )}
                    </TableRow>
                  )
                })
              )}
            </TableBody>
          </Table>
        </div>
        
        {/* Pagination Controls */}
        {totalPages > 1 && (
          <div className="flex items-center justify-between p-4 border-t border-zinc-150 dark:border-zinc-800 bg-zinc-50/50 dark:bg-zinc-900/30">
            <div className="text-xs text-zinc-500 font-bold uppercase tracking-wider">
              Página {currentPage} de {totalPages} ({filteredCotacoes.length} cotações)
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

      {/* Form Modal: Lançar / Editar Cotação */}
      <Dialog open={showFormModal} onOpenChange={setShowFormModal}>
        <DialogContent className="sm:max-w-[550px] bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-3xl p-6 shadow-2xl">
          <DialogHeader className="space-y-1">
            <DialogTitle className="text-xl font-black text-zinc-900 dark:text-white uppercase tracking-tight">
              {formData.id ? 'Editar Cotação' : 'Lançar Nova Cotação / Falta'}
            </DialogTitle>
            <DialogDescription className="text-xs text-zinc-400 font-medium">
              Preencha os campos abaixo. Utilize o autocompletar do catálogo para agilizar o preenchimento.
            </DialogDescription>
          </DialogHeader>

          <form onSubmit={handleSaveItem} className="space-y-4 py-2">
            {/* Catalog Autocomplete Helper */}
            {!formData.id && (
              <div className="space-y-1.5 p-3.5 bg-blue-500/5 dark:bg-blue-500/10 border border-blue-200/45 dark:border-blue-900/30 rounded-2xl">
                <Label className="text-[10px] font-black text-blue-600 dark:text-blue-400 uppercase tracking-wider">
                  Autocompletar com Catálogo
                </Label>
                <ProductAutocomplete
                  onSelect={(product) => {
                    setFormData(prev => ({
                      ...prev,
                      codigo_interno: product.codigo_interno || '',
                      descricao: product.descricao_completa || '',
                      unidade: product.unidade_venda || 'UNID',
                      marca: product.marca || ''
                    }))
                  }}
                  placeholder="Pesquisar por nome ou código de catálogo..."
                />
              </div>
            )}

            <div className="grid grid-cols-3 gap-4">
              {/* Código Interno */}
              <div className="col-span-1 space-y-1.5">
                <Label htmlFor="codigo_interno" className="text-xs font-bold text-zinc-500 dark:text-zinc-400">Cod Inte</Label>
                <Input
                  id="codigo_interno"
                  value={formData.codigo_interno}
                  onChange={(e) => setFormData(prev => ({ ...prev, codigo_interno: e.target.value }))}
                  placeholder="Ex: 1020"
                  className="h-9 text-xs font-semibold rounded-xl bg-zinc-50 dark:bg-zinc-950/40 border-zinc-200 dark:border-zinc-800"
                />
              </div>

              {/* Marca */}
              <div className="col-span-2 space-y-1.5">
                <Label htmlFor="marca" className="text-xs font-bold text-zinc-500 dark:text-zinc-400">Marca Preferencial</Label>
                <Input
                  id="marca"
                  value={formData.marca}
                  onChange={(e) => setFormData(prev => ({ ...prev, marca: e.target.value }))}
                  placeholder="Ex: ABL / QUALQUER MARCA"
                  className="h-9 text-xs font-semibold rounded-xl bg-zinc-50 dark:bg-zinc-950/40 border-zinc-200 dark:border-zinc-800"
                />
              </div>
            </div>

            {/* Descrição */}
            <div className="space-y-1.5">
              <Label htmlFor="descricao" className="text-xs font-bold text-zinc-500 dark:text-zinc-400">Descrição/Descritivo *</Label>
              <Input
                id="descricao"
                required
                value={formData.descricao}
                onChange={(e) => setFormData(prev => ({ ...prev, descricao: e.target.value }))}
                placeholder="Ex: BECLOMETASONA 50MCG"
                className="h-9 text-xs font-semibold rounded-xl bg-zinc-50 dark:bg-zinc-950/40 border-zinc-200 dark:border-zinc-800 uppercase"
              />
            </div>

            <div className="grid grid-cols-3 gap-4">
              {/* Situação */}
              <div className="col-span-1 space-y-1.5">
                <Label htmlFor="situacao" className="text-xs font-bold text-zinc-500 dark:text-zinc-400">Situação</Label>
                <Select
                  value={formData.situacao}
                  onValueChange={(v) => setFormData(prev => ({ ...prev, situacao: v }))}
                >
                  <SelectTrigger className="h-9 text-xs font-bold bg-zinc-50 dark:bg-zinc-950/40 border-zinc-200 dark:border-zinc-800 rounded-xl">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="COTAR" className="text-xs font-bold">COTAR</SelectItem>
                    <SelectItem value="REABASTECER" className="text-xs font-bold">REABASTECER</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              {/* Quantidade */}
              <div className="col-span-1 space-y-1.5">
                <Label htmlFor="quantidade" className="text-xs font-bold text-zinc-500 dark:text-zinc-400">Quant *</Label>
                <Input
                  id="quantidade"
                  type="number"
                  required
                  min="0.0001"
                  step="any"
                  value={formData.quantidade}
                  onChange={(e) => setFormData(prev => ({ ...prev, quantidade: Number(e.target.value) }))}
                  className="h-9 text-xs font-bold rounded-xl bg-zinc-50 dark:bg-zinc-950/40 border-zinc-200 dark:border-zinc-800 font-mono"
                />
              </div>

              {/* Unidade */}
              <div className="col-span-1 space-y-1.5">
                <Label htmlFor="unidade" className="text-xs font-bold text-zinc-500 dark:text-zinc-400">Unid *</Label>
                <Input
                  id="unidade"
                  required
                  value={formData.unidade}
                  onChange={(e) => setFormData(prev => ({ ...prev, unidade: e.target.value }))}
                  placeholder="Ex: AMP, FRS, CP"
                  className="h-9 text-xs font-bold rounded-xl bg-zinc-50 dark:bg-zinc-950/40 border-zinc-200 dark:border-zinc-800 uppercase"
                />
              </div>
            </div>

            {true && (
              <>
                <div className="grid grid-cols-2 gap-4">
                  {/* Categoria */}
                  <div className="space-y-1.5">
                    <Label htmlFor="categoria" className="text-xs font-bold text-zinc-500 dark:text-zinc-400">Categoria *</Label>
                    <Select
                      value={formData.categoria}
                      onValueChange={(v) => setFormData(prev => ({ ...prev, categoria: v }))}
                    >
                      <SelectTrigger className="h-9 text-xs font-bold bg-zinc-50 dark:bg-zinc-950/40 border-zinc-200 dark:border-zinc-800 rounded-xl">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="MEDICAMENTO" className="text-xs font-bold">MEDICAMENTO</SelectItem>
                        <SelectItem value="ODONTO" className="text-xs font-bold">ODONTO</SelectItem>
                        <SelectItem value="DIETA" className="text-xs font-bold">DIETA</SelectItem>
                        <SelectItem value="COSMÉTICO" className="text-xs font-bold">COSMÉTICO</SelectItem>
                        <SelectItem value="MATERIAL HOSPITALAR" className="text-xs font-bold">MATERIAL HOSPITALAR</SelectItem>
                        <SelectItem value="MOBILIÁRIO" className="text-xs font-bold">MOBILIÁRIO</SelectItem>
                        <SelectItem value="ELETRÔNICO" className="text-xs font-bold">ELETRÔNICO</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>

                  {/* Cliente */}
                  <div className="space-y-1.5">
                    <Label htmlFor="cliente" className="text-xs font-bold text-zinc-500 dark:text-zinc-400">Cliente / Órgão *</Label>
                    <Input
                      id="cliente"
                      required
                      value={formData.cliente}
                      onChange={(e) => setFormData(prev => ({ ...prev, cliente: e.target.value }))}
                      placeholder="Ex: FMS TERESINA"
                      className="h-9 text-xs font-semibold rounded-xl bg-zinc-50 dark:bg-zinc-950/40 border-zinc-200 dark:border-zinc-800 uppercase"
                    />
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-4">
                  {/* Tipo de Documento */}
                  <div className="space-y-1.5">
                    <Label htmlFor="tipo_documento" className="text-xs font-bold text-zinc-500 dark:text-zinc-400">Tipo de Documento *</Label>
                    <Select
                      value={formData.tipo_documento}
                      onValueChange={(v) => setFormData(prev => ({ ...prev, tipo_documento: v }))}
                    >
                      <SelectTrigger className="h-9 text-xs font-bold bg-zinc-50 dark:bg-zinc-950/40 border-zinc-200 dark:border-zinc-800 rounded-xl">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="EMPENHO" className="text-xs font-bold">EMPENHO</SelectItem>
                        <SelectItem value="ATA/ARP" className="text-xs font-bold">ATA/ARP</SelectItem>
                        <SelectItem value="ORDEM DE FORNECIMENTO" className="text-xs font-bold">ORDEM DE FORNECIMENTO</SelectItem>
                        <SelectItem value="COMPRA DIRETA" className="text-xs font-bold">COMPRA DIRETA</SelectItem>
                        <SelectItem value="CONTRATO" className="text-xs font-bold">CONTRATO</SelectItem>
                        <SelectItem value="NOTIFICAÇÃO" className="text-xs font-bold">NOTIFICAÇÃO</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>

                  {/* Documento de Origem */}
                  <div className="space-y-1.5">
                    <Label htmlFor="documento_origem" className="text-xs font-bold text-zinc-500 dark:text-zinc-400">
                      {formData.tipo_documento === 'COMPRA DIRETA' ? 'Doc de Origem (Nº) (Opcional)' : 'Doc de Origem (Nº) *'}
                    </Label>
                    <Input
                      id="documento_origem"
                      required={formData.tipo_documento !== 'COMPRA DIRETA'}
                      value={formData.documento_origem}
                      onChange={(e) => setFormData(prev => ({ ...prev, documento_origem: e.target.value }))}
                      placeholder={formData.tipo_documento === 'COMPRA DIRETA' ? 'Opcional (Ex: Pedido Direto)' : 'Ex: NE 123/2026'}
                      className="h-9 text-xs font-semibold rounded-xl bg-zinc-50 dark:bg-zinc-950/40 border-zinc-200 dark:border-zinc-800 uppercase"
                    />
                  </div>
                </div>
              </>
            )}

            {/* Solicitante */}
            <div className="space-y-1.5">
              <Label htmlFor="solicitante" className="text-xs font-bold text-zinc-500 dark:text-zinc-400">Solicitante *</Label>
              <Input
                id="solicitante"
                required
                value={formData.solicitante}
                onChange={(e) => setFormData(prev => ({ ...prev, solicitante: e.target.value }))}
                placeholder="Nome do Solicitante"
                className="h-9 text-xs font-semibold rounded-xl bg-zinc-50 dark:bg-zinc-950/40 border-zinc-200 dark:border-zinc-800 uppercase"
              />
            </div>

            {/* Urgente Checkbox */}
            <div className="flex items-center gap-3 p-3.5 bg-rose-500/5 dark:bg-rose-500/10 border border-rose-200/30 dark:border-rose-900/30 rounded-2xl">
              <input
                id="urgente"
                type="checkbox"
                checked={formData.urgente}
                onChange={(e) => setFormData(prev => ({ ...prev, urgente: e.target.checked }))}
                className="h-4 w-4 rounded border-zinc-300 text-rose-600 focus:ring-rose-500 cursor-pointer"
              />
              <div className="space-y-0.5">
                <Label htmlFor="urgente" className="text-xs font-black text-rose-600 dark:text-rose-400 cursor-pointer uppercase">
                  Falta Urgente / Crítica (Destacar em Vermelho)
                </Label>
                <p className="text-[10px] text-zinc-400 font-medium">
                  Ative esta opção se o item for extremamente crítico para colorir a linha em vermelho.
                </p>
              </div>
            </div>

            {/* Anexo de Imagem/PDF */}
            <div className="space-y-1.5">
              <Label htmlFor="anexo" className="text-xs font-bold text-zinc-500 dark:text-zinc-400">
                Imagem ou PDF do Produto (Opcional)
              </Label>
              <div className="flex items-center gap-3">
                <input
                  id="anexo"
                  type="file"
                  accept="image/*,.pdf"
                  onChange={(e) => setSelectedFile(e.target.files?.[0] || null)}
                  className="w-full text-xs text-zinc-500 dark:text-zinc-400 file:mr-3 file:py-2 file:px-4 file:rounded-xl file:border-0 file:text-xs file:font-black file:bg-blue-50 dark:file:bg-blue-950/40 file:text-blue-700 dark:file:text-blue-400 hover:file:bg-blue-100 cursor-pointer border border-zinc-200 dark:border-zinc-800 rounded-xl p-1 bg-zinc-50 dark:bg-zinc-950/40"
                />
                {formData.anexo_url && (
                  <a
                    href={formData.anexo_url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="h-10 px-3 flex items-center justify-center rounded-xl border border-zinc-200 dark:border-zinc-800 bg-zinc-100 dark:bg-zinc-800 text-[11px] font-bold text-zinc-600 dark:text-zinc-300 hover:bg-zinc-200 dark:hover:bg-zinc-750 transition-all shrink-0"
                  >
                    Ver Atual
                  </a>
                )}
              </div>
              <p className="text-[10px] text-zinc-400 dark:text-zinc-500">
                Selecione uma imagem ou documento PDF para ajudar o comprador a identificar o item correto.
              </p>
            </div>

            <DialogFooter className="pt-4 border-t border-zinc-100 dark:border-zinc-800 gap-2">
              <Button
                type="button"
                variant="ghost"
                onClick={() => setShowFormModal(false)}
                className="h-10 text-xs font-bold rounded-xl border border-zinc-200 dark:border-zinc-800"
              >
                Cancelar
              </Button>
              <Button
                type="submit"
                disabled={submitting}
                className="h-10 text-xs font-black bg-gradient-to-r from-blue-600 to-cyan-500 hover:from-blue-500 hover:to-cyan-400 text-white rounded-xl"
              >
                {submitting ? 'Salvando...' : 'Salvar Solicitação'}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {/* Purchase Modal: Registrar Cotação */}
      <Dialog open={showCompraModal} onOpenChange={(val) => { setShowCompraModal(val); if(!val) setCompraFile(null); }}>
        <DialogContent className="sm:max-w-[440px] bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-3xl p-6 shadow-2xl">
          <DialogHeader className="space-y-1">
            <DialogTitle className="text-xl font-black text-zinc-900 dark:text-white uppercase tracking-tight">
              Registrar Cotação
            </DialogTitle>
            <DialogDescription className="text-xs text-zinc-400 font-medium">
              Informe qual fornecedor arrematou este item e a data da cotação para marcar o item como resolvido.
            </DialogDescription>
          </DialogHeader>

          <form onSubmit={handleSavePurchase} className="space-y-4 py-2">
            <div className="p-3 bg-zinc-50 dark:bg-zinc-950/40 border border-zinc-200/85 dark:border-zinc-800/60 rounded-2xl space-y-1">
              <span className="text-[10px] font-bold text-zinc-400 uppercase tracking-wider">Item Selecionado</span>
              <div className="text-xs font-extrabold text-zinc-800 dark:text-zinc-200 uppercase line-clamp-2">
                {selectedCotacao?.descricao}
              </div>
              <div className="text-[10px] font-semibold text-zinc-400">
                Quantidade: <span className="font-mono text-zinc-700 dark:text-zinc-300 font-bold">{selectedCotacao?.quantidade} {selectedCotacao?.unidade}</span>
              </div>
            </div>

            {/* Fornecedor */}
            <div className="space-y-1.5">
              <Label htmlFor="fornecedor" className="text-xs font-bold text-zinc-500 dark:text-zinc-400">Fornecedor / Distribuidor *</Label>
              <Input
                id="fornecedor"
                required
                value={compraForm.fornecedor}
                onChange={(e) => setCompraForm(prev => ({ ...prev, fornecedor: e.target.value }))}
                placeholder="Ex: NAZARIA / PALMED / ABL"
                className="h-9 text-xs font-semibold rounded-xl bg-zinc-50 dark:bg-zinc-950/40 border-zinc-200 dark:border-zinc-800 uppercase"
              />
              {/* Supplier Quick Helpers */}
              <div className="flex flex-wrap gap-1.5 pt-1">
                {['NAZARIA', 'PALMED', 'ABL', 'COPERMED/BEKER', 'PROFARMA'].map(sup => (
                  <button
                    key={sup}
                    type="button"
                    onClick={() => setCompraForm(prev => ({ ...prev, fornecedor: sup }))}
                    className="text-[9px] font-bold px-2 py-1 bg-zinc-100 dark:bg-zinc-800 hover:bg-blue-500/10 hover:text-blue-500 dark:hover:bg-blue-900/20 rounded-md border border-zinc-200/50 dark:border-zinc-700/50 transition-all text-zinc-500 dark:text-zinc-400"
                  >
                    {sup}
                  </button>
                ))}
              </div>
            </div>

            {/* Preço Unitário */}
            <div className="space-y-1.5">
              <Label htmlFor="preco" className="text-xs font-bold text-zinc-500 dark:text-zinc-400">Preço Unitário (R$)</Label>
              <Input
                id="preco"
                type="text"
                value={compraForm.preco}
                onChange={(e) => setCompraForm(prev => ({ ...prev, preco: e.target.value }))}
                placeholder="Ex: 3,58"
                className="h-9 text-xs font-semibold rounded-xl bg-zinc-50 dark:bg-zinc-950/40 border-zinc-200 dark:border-zinc-800"
              />
            </div>

            {/* Data da Cotação */}
            <div className="space-y-1.5">
              <Label htmlFor="data_compra" className="text-xs font-bold text-zinc-500 dark:text-zinc-400">Data da Cotação *</Label>
              <div className="relative">
                <Calendar className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-zinc-400" />
                <Input
                  id="data_compra"
                  type="date"
                  required
                  value={compraForm.data_compra}
                  onChange={(e) => setCompraForm(prev => ({ ...prev, data_compra: e.target.value }))}
                  className="pl-10 h-9 text-xs font-bold rounded-xl bg-zinc-50 dark:bg-zinc-950/40 border-zinc-200 dark:border-zinc-800 font-mono"
                />
              </div>
            </div>

            {/* Anexo de Cotação (Compras) */}
            <div className="space-y-1.5">
              <Label htmlFor="anexo_compras" className="text-xs font-bold text-zinc-500 dark:text-zinc-400">
                Anexar Arquivo da Cotação (Opcional)
              </Label>
              <Input
                id="anexo_compras"
                type="file"
                accept="application/pdf,image/*"
                onChange={(e) => setCompraFile(e.target.files?.[0] || null)}
                className="w-full text-xs text-zinc-500 dark:text-zinc-400 file:mr-3 file:py-2 file:px-4 file:rounded-xl file:border-0 file:text-xs file:font-black file:bg-emerald-50 dark:file:bg-emerald-950/40 file:text-emerald-700 dark:file:text-emerald-400 hover:file:bg-emerald-100 cursor-pointer border border-zinc-200 dark:border-zinc-800 rounded-xl p-1 bg-zinc-50 dark:bg-zinc-950/40"
              />
            </div>

            <DialogFooter className="pt-4 border-t border-zinc-100 dark:border-zinc-800 gap-2">
              <Button
                type="button"
                variant="ghost"
                onClick={() => { setShowCompraModal(false); setCompraFile(null); }}
                className="h-10 text-xs font-bold rounded-xl border border-zinc-200 dark:border-zinc-800"
              >
                Cancelar
              </Button>
              <Button
                type="submit"
                disabled={submitting}
                className="h-10 text-xs font-black bg-gradient-to-r from-emerald-600 to-teal-500 hover:from-emerald-500 hover:to-teal-400 text-white rounded-xl"
              >
                {submitting ? 'Salvando...' : 'Confirmar Cotação'}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {/* Modal de Solicitação de Compra a partir da Cotação (Painel de Solicitação) */}
      <Dialog open={showSolicitarCompraModal} onOpenChange={setShowSolicitarCompraModal}>
        <DialogContent className="sm:max-w-[500px] bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-3xl p-6 shadow-2xl">
          <DialogHeader className="space-y-1">
            <DialogTitle className="text-xl font-black text-zinc-900 dark:text-white uppercase tracking-tight">
              Solicitar Compra do Item
            </DialogTitle>
            <DialogDescription className="text-xs text-zinc-400 font-medium">
              Preencha os dados abaixo para enviar a solicitação para o setor de compras.
            </DialogDescription>
          </DialogHeader>

          {solicitarItem && (
            <form onSubmit={handleConfirmSolicitarCompra} className="space-y-4 py-2">
              <div className="p-3 bg-zinc-50 dark:bg-zinc-950/40 border border-zinc-200/85 dark:border-zinc-800/60 rounded-2xl space-y-1">
                <span className="text-[10px] font-bold text-zinc-400 uppercase tracking-wider block">Item / Descrição</span>
                <div className="text-xs font-extrabold text-zinc-800 dark:text-zinc-200 uppercase line-clamp-2">
                  {solicitarItem.descricao}
                </div>
                <div className="grid grid-cols-2 gap-2 pt-1 border-t border-zinc-200/40 dark:border-zinc-800/40 mt-1">
                  <div>
                    <span className="text-[9px] text-zinc-400 uppercase font-medium">Unidade</span>
                    <div className="text-xs font-bold text-zinc-700 dark:text-zinc-300">{solicitarItem.unidade}</div>
                  </div>
                  <div>
                    <span className="text-[9px] text-zinc-400 uppercase font-medium">Valor Unitário</span>
                    <div className="text-xs font-bold text-zinc-700 dark:text-zinc-300">
                      {solicitarItem.comprou_status ? (
                        <span>
                          {(() => {
                            const match = solicitarItem.comprou_status.match(/(?:COMPRADO|COTADO) - ([^(]+)(?:\(R\$\s*([^)]+)\))?/)
                            return match && match[2] ? `R$ ${match[2]}` : '—'
                          })()}
                        </span>
                      ) : '—'}
                    </div>
                  </div>
                </div>
              </div>

              {/* Quantidade a Solicitar */}
              <div className="space-y-1.5">
                <Label htmlFor="solicitar_qtd" className="text-xs font-bold text-zinc-500 dark:text-zinc-400">
                  Quantidade a Solicitar (Cotação Máxima: {solicitarItem.quantidade})
                </Label>
                <Input
                  id="solicitar_qtd"
                  type="number"
                  required
                  min="0.0001"
                  step="any"
                  value={solicitarQtd}
                  onChange={(e) => setSolicitarQtd(Number(e.target.value))}
                  className="h-9 text-xs font-bold rounded-xl bg-zinc-50 dark:bg-zinc-950/40 border-zinc-200 dark:border-zinc-800 font-mono"
                />
              </div>

              {/* Prazo Limite / SLA */}
              <div className="space-y-1.5">
                <Label htmlFor="solicitar_prazo" className="text-xs font-bold text-zinc-500 dark:text-zinc-400">Prazo Limite / SLA (Entrega) *</Label>
                <Input
                  id="solicitar_prazo"
                  type="date"
                  required
                  value={solicitarPrazo}
                  onChange={(e) => setSolicitarPrazo(e.target.value)}
                  className="h-9 text-xs font-bold rounded-xl bg-zinc-50 dark:bg-zinc-950/40 border-zinc-200 dark:border-zinc-800 font-mono"
                />
              </div>

              {/* Categoria */}
              <div className="space-y-1.5">
                <Label htmlFor="solicitar_categoria" className="text-xs font-bold text-zinc-500 dark:text-zinc-400">Categoria da Compra *</Label>
                <Select
                  value={solicitarCategoria}
                  onValueChange={setSolicitarCategoria}
                >
                  <SelectTrigger className="h-9 text-xs font-bold bg-zinc-50 dark:bg-zinc-950/40 border-zinc-200 dark:border-zinc-800 rounded-xl">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="MEDICAMENTO" className="text-xs font-bold">MEDICAMENTO</SelectItem>
                    <SelectItem value="ODONTO" className="text-xs font-bold">ODONTO</SelectItem>
                    <SelectItem value="DIETA" className="text-xs font-bold">DIETA</SelectItem>
                    <SelectItem value="COSMÉTICO" className="text-xs font-bold">COSMÉTICO</SelectItem>
                    <SelectItem value="MATERIAL HOSPITALAR" className="text-xs font-bold">MATERIAL HOSPITALAR</SelectItem>
                    <SelectItem value="MOBILIÁRIO" className="text-xs font-bold">MOBILIÁRIO</SelectItem>
                    <SelectItem value="ELETRÔNICO" className="text-xs font-bold">ELETRÔNICO</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              {/* Marca */}
              <div className="space-y-1.5">
                <Label htmlFor="solicitar_marca" className="text-xs font-bold text-zinc-500 dark:text-zinc-400">Marca de Referência</Label>
                <Input
                  id="solicitar_marca"
                  value={solicitarMarca}
                  onChange={(e) => setSolicitarMarca(e.target.value)}
                  placeholder="Ex: ABL / QUALQUER MARCA"
                  className="h-9 text-xs font-semibold rounded-xl bg-zinc-50 dark:bg-zinc-950/40 border-zinc-200 dark:border-zinc-800 uppercase"
                />
              </div>

              {/* Observações */}
              <div className="space-y-1.5">
                <Label htmlFor="solicitar_obs" className="text-xs font-bold text-zinc-500 dark:text-zinc-400">Observações</Label>
                <textarea
                  id="solicitar_obs"
                  value={solicitarObs}
                  onChange={(e) => setSolicitarObs(e.target.value)}
                  placeholder="Justificativa ou informações adicionais para o comprador..."
                  className="w-full text-xs font-semibold rounded-xl bg-zinc-50 dark:bg-zinc-950/40 border-zinc-200 dark:border-zinc-800 p-3 h-20 outline-none resize-none focus:border-indigo-500"
                />
              </div>

              {/* Checkboxes de Notificação e Demanda Judicial */}
              <div className="space-y-3 pt-3 border-t border-zinc-100 dark:border-zinc-850">
                {/* Notificação */}
                <div className="space-y-2">
                  <div className="flex items-center gap-3">
                    <input
                      id="solicitar_e_notificacao"
                      type="checkbox"
                      checked={solicitarENotificacao}
                      onChange={(e) => setSolicitarENotificacao(e.target.checked)}
                      className="h-4 w-4 rounded border-zinc-300 text-indigo-600 focus:ring-indigo-500 cursor-pointer"
                    />
                    <div className="space-y-0.5">
                      <Label htmlFor="solicitar_e_notificacao" className="text-xs font-black text-zinc-700 dark:text-zinc-300 cursor-pointer uppercase">
                        Notificação (SLA estrito de 2 a 5 dias)
                      </Label>
                    </div>
                  </div>
                  {solicitarENotificacao && (
                    <div className="pl-7 space-y-1">
                      <Label htmlFor="notificacao_file" className="text-[10px] font-bold text-zinc-400 uppercase">Anexar PDF da Notificação *</Label>
                      <Input
                        id="notificacao_file"
                        type="file"
                        accept="application/pdf,image/*"
                        required={solicitarENotificacao}
                        onChange={(e) => setSolicitarNotificacaoFile(e.target.files?.[0] || null)}
                        className="w-full text-xs text-zinc-500 dark:text-zinc-400 file:mr-3 file:py-1 file:px-3 file:rounded-lg file:border-0 file:text-[10px] file:font-black file:bg-blue-50 dark:file:bg-blue-950/40 file:text-blue-700 hover:file:bg-blue-100 cursor-pointer"
                      />
                    </div>
                  )}
                </div>

                {/* Demanda Judicial */}
                <div className="space-y-2">
                  <div className="flex items-center gap-3">
                    <input
                      id="solicitar_demanda_judicial"
                      type="checkbox"
                      checked={solicitarEDemandaJudicial}
                      onChange={(e) => setSolicitarEDemandaJudicial(e.target.checked)}
                      className="h-4 w-4 rounded border-zinc-300 text-indigo-600 focus:ring-indigo-500 cursor-pointer"
                    />
                    <div className="space-y-0.5">
                      <Label htmlFor="solicitar_demanda_judicial" className="text-xs font-black text-zinc-700 dark:text-zinc-300 cursor-pointer uppercase">
                        Demanda Judicial
                      </Label>
                    </div>
                  </div>
                  {solicitarEDemandaJudicial && (
                    <div className="pl-7 space-y-1">
                      <Label htmlFor="demanda_file" className="text-[10px] font-bold text-zinc-400 uppercase">Anexar PDF do Processo / Receita *</Label>
                      <Input
                        id="demanda_file"
                        type="file"
                        accept="application/pdf,image/*"
                        required={solicitarEDemandaJudicial}
                        onChange={(e) => setSolicitarDemandaJudicialFile(e.target.files?.[0] || null)}
                        className="w-full text-xs text-zinc-500 dark:text-zinc-400 file:mr-3 file:py-1 file:px-3 file:rounded-lg file:border-0 file:text-[10px] file:font-black file:bg-blue-50 dark:file:bg-blue-950/40 file:text-blue-700 hover:file:bg-blue-100 cursor-pointer"
                      />
                    </div>
                  )}
                </div>
              </div>

              <DialogFooter className="pt-4 border-t border-zinc-100 dark:border-zinc-800 gap-2">
                <Button
                  type="button"
                  variant="ghost"
                  onClick={() => setShowSolicitarCompraModal(false)}
                  className="h-10 text-xs font-bold rounded-xl border border-zinc-200 dark:border-zinc-800"
                >
                  Cancelar
                </Button>
                <Button
                  type="submit"
                  disabled={solicitarLoading}
                  className="h-10 text-xs font-black bg-gradient-to-r from-indigo-600 to-violet-500 hover:from-indigo-500 hover:to-violet-400 text-white rounded-xl"
                >
                  {solicitarLoading ? 'Enviando...' : 'Confirmar Solicitação'}
                </Button>
              </DialogFooter>
            </form>
          )}
        </DialogContent>
      </Dialog>
    </div>
  )
}
