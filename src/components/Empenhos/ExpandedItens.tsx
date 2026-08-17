import { useState, useEffect, useCallback, Fragment } from 'react'
import { supabase } from '../../lib/supabase'
import { toast } from 'sonner'
import type { Tables } from '../../supabaseTypes'
import { useNavigate } from 'react-router-dom'
import { Loader2, Package, PackageCheck, PackageX, Clock, Truck, ChevronUp, AlertCircle, Sparkles, ExternalLink, Pencil, Eye, EyeOff, X, Zap, ShoppingCart, CheckCircle2, ClipboardList } from 'lucide-react'
import { Button } from '../ui/button'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from '../ui/dialog'
import { Input } from '../ui/input'
import { Textarea } from '../ui/textarea'
import { Label } from '../ui/label'
import { ControleEntrega } from '../../ControleEntrega'
import { Badge } from '../ui/badge'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "../ui/select"
import { logAction } from '../../lib/logger'
import { isNotaModoSesau } from '../../lib/utils'
import { uploadDocument, getCleanPublicUrl } from '../../lib/storage'

type Item = Tables<'itens'>
type HistoricoEntrega = Tables<'historico_entregas'>

interface ItemWithDeliveries extends Item {
  historico_entregas: HistoricoEntrega[]
  pedidos_compra: Tables<'pedidos_compra'>[]
  cotacoes_privado?: any[]
}

interface ExpandedItensProps {
  notaId: number
  numeroNe?: string
  nota?: any
  onItemUpdate?: () => void
}

function getPedidoObservationDisplay(pedido: any) {
  if (!pedido || !pedido.observacoes) return null
  const obs = pedido.observacoes
  if (obs.startsWith('{')) {
    try {
      const parsed = JSON.parse(obs)
      const text = parsed.justificativa || parsed.observacao || parsed.obs_adicional
      return text ? String(text) : null
    } catch {
      return obs
    }
  }
  return obs
}

function formatNumber(n: number | null | undefined) {
  if (n == null) return '—'
  return n.toLocaleString('pt-BR')
}

function getItemDeliveryStatus(item: ItemWithDeliveries, nota?: any) {
  const qtdPedida = item.quantidade ?? 0
  const entregas = item.historico_entregas || []
  const qtdEntregue = entregas.reduce(
    (sum, h) => sum + (h.quantidade_entregue ?? 0),
    0
  )
  const qtdEntregueFisico = entregas
    .filter(h => h.itens_entregues !== false)
    .reduce((sum, h) => sum + (h.quantidade_entregue ?? 0), 0)
  
  let isFatorCaixa = entregas.some(h => h.motivo_pendencia?.includes('Fator Caixa'))
  
  // SE FOR TERESINA, DESCONSIDERAR FATOR CAIXA COMO STATUS CONCLUÍDO/PERCENTUAL
  const emissor = String(nota?.emissor || '').toLowerCase()
  const entidadeNome = String(nota?.entidades?.nome || '').toLowerCase()
  const entidadeMunicipio = String(nota?.entidades?.municipio || '').toLowerCase()
  const isNotaTeresina = emissor.includes('teresina') || 
                         entidadeNome.includes('teresina') || 
                         entidadeMunicipio.includes('teresina')
                         
  if (isNotaTeresina) {
    isFatorCaixa = false
  }

  const qtdPendente = isFatorCaixa ? 0 : Math.max(0, qtdPedida - qtdEntregue)
  const qtdExcesso = Math.max(0, qtdEntregue - qtdPedida)
  
  const rawPct = qtdPedida > 0 ? (qtdEntregue / qtdPedida) * 100 : 0
  let pct = qtdEntregue >= qtdPedida ? Math.round(rawPct) : Math.floor(rawPct)
  
  const rawPctFisico = qtdPedida > 0 ? (qtdEntregueFisico / qtdPedida) * 100 : 0
  let pctFisico = qtdEntregueFisico >= qtdPedida ? Math.round(rawPctFisico) : Math.floor(rawPctFisico)
  
  // Se for Fator Caixa, forçamos o progresso para 100% para visualização
  if (isFatorCaixa) {
    pct = 100
    pctFisico = 100
  }

  const regularPct = Math.min(100, pct)
  const regularPctFisico = Math.min(100, pctFisico)
  const excessPct = qtdPedida > 0 ? Math.max(0, Math.min(100, (qtdExcesso / qtdPedida) * 100)) : 0
  const isActuallyFull = qtdEntregue >= qtdPedida || isFatorCaixa
  const isActuallyFullFisico = qtdEntregueFisico >= qtdPedida || isFatorCaixa

  return { 
    qtdPedida, 
    qtdEntregue, 
    qtdEntregueFisico,
    qtdPendente, 
    qtdExcesso, 
    pct, 
    pctFisico,
    regularPct, 
    regularPctFisico,
    excessPct, 
    isActuallyFull, 
    isActuallyFullFisico,
    isFatorCaixa 
  }
}

export function ExpandedItens({ notaId, numeroNe, nota, onItemUpdate }: ExpandedItensProps) {
  const [itens, setItens] = useState<ItemWithDeliveries[]>([])
  const [loading, setLoading] = useState(true)
  const [expandedLogisticsId, setExpandedLogisticsId] = useState<number | null>(null)
  const [expandedDescIds, setExpandedDescIds] = useState<Set<number>>(new Set())
  const [unmarkItemId, setUnmarkItemId] = useState<number | null>(null)
  const [unmarkText, setUnmarkText] = useState('')
  const [solicitarModo, setSolicitarModo] = useState<'LIVRE' | 'FORMULARIO'>('FORMULARIO')
  const [solicitarItem, setSolicitarItem] = useState<any>(null)
  const [solicitarQtd, setSolicitarQtd] = useState<number>(0)
  const [solicitarPrazo, setSolicitarPrazo] = useState<string>('')
  const [solicitarObs, setSolicitarObs] = useState('')
  const [solicitarMarca, setSolicitarMarca] = useState('')
  const [solicitarCategoria, setSolicitarCategoria] = useState<string>('MATERIAL HOSPITALAR')
  const [solicitarLoading, setSolicitarLoading] = useState(false)
  const [detalhesPedido, setDetalhesPedido] = useState<any | null>(null)

  const [solicitarTipo, setSolicitarTipo] = useState<'COMPRA' | 'COTACAO'>('COMPRA')
  const [unmarkTipo, setUnmarkTipo] = useState<'COMPRA' | 'COTACAO'>('COMPRA')
  const [bulkCotacaoOpen, setBulkCotacaoOpen] = useState(false)
  const [bulkCotacaoObs, setBulkCotacaoObs] = useState('')
  const [bulkCotacaoLoading, setBulkCotacaoLoading] = useState(false)

  const [showValorUnitario, setShowValorUnitario] = useState<boolean>(() => {
    return localStorage.getItem('empenho_show_unit_price') === 'true'
  })

  const toggleValorUnitario = () => {
    setShowValorUnitario(prev => {
      const next = !prev
      localStorage.setItem('empenho_show_unit_price', String(next))
      return next
    })
  }

  const handleVerDocumento = (caminho?: string | null) => {
    if (!caminho) {
      toast.error('Documento não disponível.')
      return
    }
    const url = getCleanPublicUrl(caminho)
    window.open(url, '_blank')
  }

  const [eNotificacao, setENotificacao] = useState(false)
  const [notificacaoFile, setNotificacaoFile] = useState<File | null>(null)
  const [solicitarImagem, setSolicitarImagem] = useState<File | null>(null)
  const [solicitarImagemPreview, setSolicitarImagemPreview] = useState<string | null>(null)

  const handleSolicitarImageChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      const file = e.target.files[0]
      setSolicitarImagem(file)
      setSolicitarImagemPreview(URL.createObjectURL(file))
    }
  }

  const handleRemoveSolicitarImage = () => {
    setSolicitarImagem(null)
    if (solicitarImagemPreview) {
      URL.revokeObjectURL(solicitarImagemPreview)
      setSolicitarImagemPreview(null)
    }
    const input = document.getElementById('imagem_solicitar') as HTMLInputElement
    if (input) input.value = ''
  }

  // Edit category states
  const [editCategoryItem, setEditCategoryItem] = useState<ItemWithDeliveries | null>(null)
  const [newCategoryValue, setNewCategoryValue] = useState<string>('MATERIAL HOSPITALAR')
  const [savingCategory, setSavingCategory] = useState<boolean>(false)

  // Edit Item states (Descritivo, Marca, Categoria, Unidade, Valor Unitário)
  const [editItemModal, setEditItemModal] = useState<ItemWithDeliveries | null>(null)
  const [editDescricao, setEditDescricao] = useState<string>('')
  const [editMarca, setEditMarca] = useState<string>('')
  const [editCategoria, setEditCategoria] = useState<string>('MATERIAL HOSPITALAR')
  const [editUnidade, setEditUnidade] = useState<string>('UN')
  const [editValorUnitario, setEditValorUnitario] = useState<string>('')
  const [savingItem, setSavingItem] = useState<boolean>(false)

  const normalizeCategory = (cat: string | null | undefined): string => {
    if (!cat) return 'MATERIAL HOSPITALAR'
    const c = cat.toUpperCase().trim()
    if (c.includes('MEDIC')) return 'MEDICAMENTO'
    if (c.includes('ODONTO')) return 'ODONTO'
    if (c.includes('DIETA')) return 'DIETA'
    if (c.includes('COSMET') || c.includes('COSMÉTICO')) return 'COSMÉTICO'
    if (c.includes('HOSP') || c.includes('MATERIAL HOSP') || c.includes('MATERIAL HOSPITALAR')) return 'MATERIAL HOSPITALAR'
    if (c.includes('MOBIL') || c.includes('MOBILIÁRIO')) return 'MOBILIÁRIO'
    if (c.includes('ELETRO') || c.includes('ELETRÔNICO') || c.includes('ELETRÔNICOS')) return 'ELETRÔNICO'
    return 'MATERIAL HOSPITALAR'
  }

  const navigate = useNavigate()
  const [profiles, setProfiles] = useState<any[]>([])

  useEffect(() => {
    async function loadProfiles() {
      const { data } = await supabase.from('profiles').select('id, display_name, email')
      if (data) setProfiles(data)
    }
    loadProfiles()
  }, [])

  const toggleDesc = (id: number) => {
    setExpandedDescIds(prev => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  const fetchItens = useCallback(async (showLoading = true) => {
    if (showLoading) setLoading(true)
    const { data, error } = await supabase
      .from('itens')
      .select('*, historico_entregas(*), pedidos_compra(*), cotacoes_privado(*)')
      .eq('nota_id', notaId)
      .order('id')

    if (error) {
      toast.error('Erro ao carregar itens: ' + error.message)
    } else {
      setItens((data as unknown as ItemWithDeliveries[]) ?? [])
    }
    setLoading(false)
  }, [notaId])

  useEffect(() => {
    const timer = setTimeout(() => {
      fetchItens(false)
    }, 0)
    return () => clearTimeout(timer)
  }, [fetchItens, nota])

  const getActivePedido = (item: ItemWithDeliveries) => {
    if (!item.pedidos_compra || item.pedidos_compra.length === 0) return null
    const active = item.pedidos_compra.find(p => p.status !== 'FALHA')
    if (active) return active
    return [...item.pedidos_compra].sort((a, b) => b.id - a.id)[0]
  }

  const getActiveCotacao = (item: ItemWithDeliveries) => {
    if (!item.cotacoes_privado || item.cotacoes_privado.length === 0) return null
    const active = item.cotacoes_privado.find(c => !c.comprou_status)
    if (active) return active
    return [...item.cotacoes_privado].sort((a, b) => (b.created_at || '').localeCompare(a.created_at || ''))[0]
  }

  const handleToggleCompra = async (item: ItemWithDeliveries) => {
    const pedido = getActivePedido(item)
    if (item.marcado_compras && pedido && pedido.status !== 'FALHA') {
      if (pedido.status !== 'PENDENTE') {
        toast.error(`Não é possível desmarcar: o pedido já está no status ${pedido.status.toUpperCase()}.`)
        return
      }
      setUnmarkItemId(item.id)
      setUnmarkTipo('COMPRA')
      setUnmarkText('')
    } else {
      const { qtdPendente } = getItemDeliveryStatus(item, nota)
      if (qtdPendente <= 0) {
        toast.error('Este item já está totalmente entregue.')
        return
      }
      setSolicitarTipo('COMPRA')
      setSolicitarModo('FORMULARIO')
      setSolicitarItem(item)
      setSolicitarQtd(qtdPendente)
      const d = new Date()
      d.setDate(d.getDate() + 7)
      setSolicitarPrazo(d.toISOString().split('T')[0])
      setENotificacao(!!(nota as any).e_notificacao)
      setNotificacaoFile(null)
      setSolicitarCategoria((pedido && pedido.categoria) ? normalizeCategory(pedido.categoria) : (normalizeCategory(item.categoria) || 'MATERIAL HOSPITALAR'))
      
      let obsPrefix = ''
      let marcaPrefix = ''
      if (pedido) {
        try {
          const obsData = JSON.parse(pedido.observacoes || '{}')
          if (pedido.status === 'FALHA' && obsData.justificativa) {
            obsPrefix = `Nova tentativa após falha anterior: ${obsData.justificativa}. `
          } else if (obsData.observacao) {
            obsPrefix = obsData.observacao
          }
          if (obsData.marca) {
            marcaPrefix = obsData.marca
          }
        } catch (e) {
          if (pedido.observacoes) {
            obsPrefix = pedido.status === 'FALHA' ? `Nova tentativa após falha anterior: ${pedido.observacoes}. ` : pedido.observacoes
          }
        }
      }
      setSolicitarObs(obsPrefix)
      setSolicitarMarca(marcaPrefix)
    }
  }

  const handleToggleCotacao = async (item: ItemWithDeliveries) => {
    const activeCot = getActiveCotacao(item)
    if (item.marcado_compras && activeCot && !activeCot.comprou_status) {
      setUnmarkItemId(item.id)
      setUnmarkTipo('COTACAO')
      setUnmarkText('')
    } else {
      const { qtdPendente } = getItemDeliveryStatus(item, nota)
      if (qtdPendente <= 0) {
        toast.error('Este item já está totalmente entregue.')
        return
      }
      setSolicitarTipo('COTACAO')
      setSolicitarModo('FORMULARIO')
      setSolicitarItem(item)
      setSolicitarQtd(qtdPendente)
      const d = new Date()
      d.setDate(d.getDate() + 7)
      setSolicitarPrazo(d.toISOString().split('T')[0])
      setSolicitarCategoria(normalizeCategory(item.categoria) || 'MATERIAL HOSPITALAR')
      setSolicitarObs('')
      setSolicitarMarca('')
    }
  }

  const handleConfirmCompraLivre = async () => {
    if (!solicitarItem) return
    const { qtdPendente } = getItemDeliveryStatus(solicitarItem, nota)
    if (qtdPendente <= 0) {
      toast.error('Este item já está totalmente entregue.')
      return
    }

    setSolicitarLoading(true)
    try {
      const { error: errItem } = await supabase
        .from('itens')
        .update({ marcado_compras: true })
        .eq('id', solicitarItem.id)
      if (errItem) throw errItem

      await logAction('MARCACAO_COMPRAS_LIVRE', 'itens', solicitarItem.id, { 
        acao: 'SINALIZAR_JA_SOLICITADO', 
        quantidade: qtdPendente
      })

      toast.success('Item sinalizado como "Já Solicitado" com sucesso!')
      setSolicitarItem(null)
      fetchItens(false)
      if (onItemUpdate) onItemUpdate()
    } catch (err: any) {
      console.error(err)
      toast.error('Erro ao sinalizar item: ' + err.message)
    } finally {
      setSolicitarLoading(false)
    }
  }

  const handleConfirmSolicitar = async () => {
    if (!solicitarItem) return
    const { qtdPendente } = getItemDeliveryStatus(solicitarItem, nota)
    if (solicitarQtd <= 0) {
      toast.error('A quantidade solicitada deve ser maior que zero.')
      return
    }
    if (solicitarQtd > qtdPendente) {
      toast.error(`A quantidade solicitada não pode exceder o saldo pendente de ${qtdPendente}.`)
      return
    }

    if (solicitarTipo === 'COTACAO') {
      setSolicitarLoading(true)
      try {
        const { data: { user } } = await supabase.auth.getUser()
        let usuarioNome = user?.email || 'Manual (Vendas)'
        if (user?.id) {
          const { data: userProfile } = await supabase
            .from('profiles')
            .select('display_name')
            .eq('id', user.id)
            .maybeSingle()
          if (userProfile?.display_name) {
            usuarioNome = userProfile.display_name
          }
        }

        const activeCot = getActiveCotacao(solicitarItem)
        const itemCat = (solicitarCategoria || '').toUpperCase().trim()

        const payloadCot = {
          descricao: solicitarItem.descricao,
          marca: solicitarMarca.trim() || null,
          situacao: 'COTAR',
          quantidade: Number(solicitarQtd),
          unidade: (solicitarItem.unidade || 'UN').trim().toUpperCase(),
          solicitante: usuarioNome,
          solicitante_id: user?.id || null,
          owner_id: user?.id || null,
          urgente: false,
          anexo_url: null,
          categoria: itemCat,
          cliente: (nota as any).emissor || (nota as any).cliente || null,
          documento_origem: numeroNe || (nota as any).numero_empenho || null,
          tipo_documento: (nota as any).tipo_documento || 'NOTA DE EMPENHO',
          item_id: solicitarItem.id
        }

        if (activeCot) {
          const { error: errUpd } = await supabase
            .from('cotacoes_privado')
            .update(payloadCot)
            .eq('id', activeCot.id)
          if (errUpd) throw errUpd
        } else {
          const { error: errIns } = await supabase
            .from('cotacoes_privado')
            .insert([payloadCot])
          if (errIns) throw errIns
        }

        const { error: errItem } = await supabase
          .from('itens')
          .update({ marcado_compras: true })
          .eq('id', solicitarItem.id)
        if (errItem) throw errItem

        await logAction('MARCACAO_COTACAO', 'itens', solicitarItem.id, { 
          acao: 'SOLICITAR_COTACAO_MANUAL', 
          quantidade: solicitarQtd, 
          marca: solicitarMarca,
          obs: solicitarObs
        })

        toast.success('Solicitação de cotação enviada com sucesso!')
        setSolicitarItem(null)
        fetchItens(false)
        if (onItemUpdate) onItemUpdate()
      } catch (err: any) {
        console.error(err)
        toast.error('Erro ao salvar solicitação de cotação: ' + err.message)
      } finally {
        setSolicitarLoading(false)
      }
      return
    }

    if (!solicitarPrazo) {
      toast.error('O prazo limite é obrigatório.')
      return
    }
    if (eNotificacao && !notificacaoFile && !(nota as any).arquivo_notificacao) {
      toast.error('O documento da notificação é obrigatório quando a opção está marcada.')
      return
    }

    setSolicitarLoading(true)
    try {
      const { data: { user } } = await supabase.auth.getUser()
      let usuarioNome = user?.email || 'Manual (Vendas)'
      if (user?.id) {
        const { data: userProfile } = await supabase
          .from('profiles')
          .select('display_name')
          .eq('id', user.id)
          .maybeSingle()
        if (userProfile?.display_name) {
          usuarioNome = userProfile.display_name
        }
      }

      let arquivoCaminho = (nota as any).arquivo_notificacao || null
      if (eNotificacao && notificacaoFile) {
        const { path, error: uploadErr } = await uploadDocument(notificacaoFile)
        if (uploadErr) {
          throw new Error('Falha ao fazer upload da notificação: ' + ((uploadErr as any).message || String(uploadErr)))
        }
        arquivoCaminho = path
      } else if (!eNotificacao) {
        arquivoCaminho = null
      }

      let imagemCaminho = null
      if (solicitarImagem) {
        const { path, error: imgErr } = await uploadDocument(solicitarImagem)
        if (imgErr) {
          throw new Error('Falha ao fazer upload da imagem: ' + ((imgErr as any).message || String(imgErr)))
        }
        imagemCaminho = path
      }

      // Encontrar comprador responsável pela tarefa padrão (suportando múltiplas categorias)
      const itemCat = (solicitarCategoria || '').toUpperCase().trim()
      const { data: buyers } = await supabase
        .from('profiles')
        .select('id, tarefa_padrao')
        .eq('setor', 'COMPRAS')

      let assignedToId: string | null = null
      if (buyers && buyers.length > 0) {
        const match = buyers.find(b => {
          if (!b.tarefa_padrao) return false
          const cats = b.tarefa_padrao.split(',').map((x: string) => x.trim().toUpperCase())
          return cats.some(c => c === itemCat || c.includes(itemCat) || itemCat.includes(c))
        })
        if (match) assignedToId = match.id
      }

      // 1. Atualizar marcado_compras no item
      const { error: errItem } = await supabase
        .from('itens')
        .update({ marcado_compras: true })
        .eq('id', solicitarItem.id)
      if (errItem) throw errItem

      // 2. Criar o registro na tabela pedidos_compra
      const { data: existing } = await supabase
        .from('pedidos_compra')
        .select('id')
        .eq('item_id', solicitarItem.id)
        .neq('status', 'COMPRADO')
        .neq('status', 'ATENDIDO')
        .neq('status', 'FALHA')
        .maybeSingle()

      const obsPayload = JSON.stringify({
        marca: solicitarMarca.trim() || null,
        observacao: solicitarObs.trim() || null,
        e_notificacao: eNotificacao,
        arquivo_notificacao: arquivoCaminho,
        imagem_anexo: imagemCaminho
      })

      if (existing) {
        const { error: errUpd } = await supabase
          .from('pedidos_compra')
          .update({
            quantidade_solicitada: solicitarQtd,
            prazo_limite: new Date(solicitarPrazo + 'T23:59:59').toISOString(),
            observacoes: obsPayload,
            usuario_solicitante: usuarioNome,
            solicitante_id: user?.id || null,
            status: 'PENDENTE',
            assigned_to: assignedToId,
            categoria: itemCat,
            e_notificacao: eNotificacao,
            arquivo_notificacao: arquivoCaminho
          })
          .eq('id', existing.id)
        if (errUpd) throw errUpd
      } else {
        const { error: errIns } = await supabase
          .from('pedidos_compra')
          .insert([{
            item_id: solicitarItem.id,
            quantidade_solicitada: solicitarQtd,
            prazo_limite: new Date(solicitarPrazo + 'T23:59:59').toISOString(),
            observacoes: obsPayload,
            usuario_solicitante: usuarioNome,
            solicitante_id: user?.id || null,
            status: 'PENDENTE',
            assigned_to: assignedToId,
            categoria: itemCat,
            e_notificacao: eNotificacao,
            arquivo_notificacao: arquivoCaminho
          }])
        if (errIns) throw errIns
      }

      await logAction('MARCACAO_COMPRAS', 'itens', solicitarItem.id, { 
        acao: 'MARCAR_MANUAL', 
        quantidade: solicitarQtd, 
        prazo: solicitarPrazo, 
        marca: solicitarMarca,
        obs: solicitarObs,
        e_notificacao: eNotificacao,
        arquivo_notificacao: arquivoCaminho
      })

      toast.success('Solicitação de compra enviada com sucesso!')
      setSolicitarItem(null)
      fetchItens(false)
      if (onItemUpdate) onItemUpdate()
    } catch (err: any) {
      console.error(err)
      toast.error('Erro ao salvar solicitação: ' + err.message)
    } finally {
      setSolicitarLoading(false)
    }
  }

  const handleConfirmUnmark = async () => {
    if (unmarkText.trim().toLowerCase() !== 'desmarcar') {
      toast.error('Texto incorreto. Digite "desmarcar" para confirmar.')
      return
    }
    if (!unmarkItemId) return
    try {
      if (unmarkTipo === 'COTACAO') {
        const { data: cotacoes } = await supabase
          .from('cotacoes_privado')
          .select('id')
          .eq('item_id' as any, unmarkItemId)
          .is('comprou_status', null)
        
        if (cotacoes && cotacoes.length > 0) {
          const ids = cotacoes.map(c => c.id)
          const { error: errDel } = await supabase.from('cotacoes_privado').delete().in('id', ids)
          if (errDel) throw errDel
        }
      } else {
        const { data: pedidos } = await supabase
          .from('pedidos_compra')
          .select('id, status')
          .eq('item_id', unmarkItemId)
          .neq('status', 'COMPRADO')
          .neq('status', 'ATENDIDO')
        
        if (pedidos && pedidos.length > 0) {
          const ids = pedidos.map(p => p.id)
          const { error: errDel } = await supabase.from('pedidos_compra').delete().in('id', ids)
          if (errDel) throw errDel
        }
      }

      const { error } = await supabase.from('itens').update({ marcado_compras: false }).eq('id', unmarkItemId)
      if (error) throw error
      await logAction(
        unmarkTipo === 'COTACAO' ? 'DESMARCAR_COTACAO' : 'MARCACAO_COMPRAS', 
        'itens', 
        unmarkItemId, 
        { acao: 'DESMARCAR' }
      )
      toast.success(unmarkTipo === 'COTACAO' ? 'Solicitação de cotação removida.' : 'Marcação de compra removida.')
      setItens(prev => prev.map(i => i.id === unmarkItemId ? { 
        ...i, 
        marcado_compras: false, 
        pedidos_compra: unmarkTipo === 'COMPRA' ? [] : i.pedidos_compra,
        cotacoes_privado: unmarkTipo === 'COTACAO' ? [] : i.cotacoes_privado
      } : i))
      setUnmarkItemId(null)
      if (onItemUpdate) onItemUpdate()
    } catch (err: any) {
      toast.error('Erro ao desmarcar: ' + err.message)
    }
  }

  const handleBulkCotacao = async () => {
    const itemsToQuote = itens.filter(item => {
      const { qtdPendente } = getItemDeliveryStatus(item, nota)
      if (qtdPendente <= 0) return false
      
      const activeCot = getActiveCotacao(item)
      const activePed = getActivePedido(item)
      
      const hasActivePurchase = activePed && activePed.status !== 'FALHA'
      const hasActiveCotacao = activeCot && !activeCot.comprou_status
      
      return !hasActivePurchase && !hasActiveCotacao
    })

    if (itemsToQuote.length === 0) {
      toast.info('Não há itens pendentes elegíveis para cotação neste Empenho.')
      return
    }

    setBulkCotacaoLoading(true)
    try {
      const { data: { user } } = await supabase.auth.getUser()
      let usuarioNome = user?.email || 'Manual (Vendas)'
      if (user?.id) {
        const { data: userProfile } = await supabase
          .from('profiles')
          .select('display_name')
          .eq('id', user.id)
          .maybeSingle()
        if (userProfile?.display_name) {
          usuarioNome = userProfile.display_name
        }
      }

      for (const item of itemsToQuote) {
        const { qtdPendente } = getItemDeliveryStatus(item, nota)
        const itemCat = normalizeCategory(item.categoria)
        const activeCot = getActiveCotacao(item)

        const payloadCot = {
          descricao: item.descricao,
          marca: null,
          situacao: 'COTAR',
          quantidade: qtdPendente,
          unidade: (item.unidade || 'UN').trim().toUpperCase(),
          solicitante: usuarioNome,
          solicitante_id: user?.id || null,
          owner_id: user?.id || null,
          urgente: false,
          anexo_url: null,
          categoria: itemCat,
          cliente: (nota as any).emissor || (nota as any).cliente || null,
          documento_origem: numeroNe || (nota as any).numero_empenho || null,
          tipo_documento: (nota as any).tipo_documento || 'NOTA DE EMPENHO',
          item_id: item.id
        }

        if (activeCot) {
          await supabase
            .from('cotacoes_privado')
            .update(payloadCot)
            .eq('id', activeCot.id)
        } else {
          await supabase
            .from('cotacoes_privado')
            .insert([payloadCot])
        }

        await supabase
          .from('itens')
          .update({ marcado_compras: true })
          .eq('id', item.id)

        await logAction('MARCACAO_COTACAO', 'itens', item.id, { 
          acao: 'SOLICITAR_COTACAO_MASSA', 
          quantidade: qtdPendente, 
          obs: bulkCotacaoObs
        })
      }

      toast.success(`${itemsToQuote.length} item(ns) enviado(s) para o módulo de cotação com sucesso!`)
      setBulkCotacaoOpen(false)
      setBulkCotacaoObs('')
      fetchItens(false)
      if (onItemUpdate) onItemUpdate()
    } catch (err: any) {
      console.error(err)
      toast.error('Erro ao enviar cotações em massa: ' + err.message)
    } finally {
      setBulkCotacaoLoading(false)
    }
  }

  const handleSaveCategory = async () => {
    if (!editCategoryItem) return
    try {
      setSavingCategory(true)
      
      // Update item category in 'itens' table
      const { error: errorItem } = await supabase
        .from('itens')
        .update({ categoria: newCategoryValue })
        .eq('id', editCategoryItem.id)

      if (errorItem) throw errorItem

      // Update associated 'pedidos_compra' requests
      const { error: errorPedidos } = await supabase
        .from('pedidos_compra')
        .update({ categoria: newCategoryValue })
        .eq('item_id', editCategoryItem.id)

      if (errorPedidos) throw errorPedidos

      // Log action for audit
      await logAction('ALTERAR_CATEGORIA_ITEM_EMPENHO', 'itens', editCategoryItem.id, {
        descricao: editCategoryItem.descricao,
        categoria_anterior: editCategoryItem.categoria,
        categoria_nova: newCategoryValue
      })

      toast.success('Categoria do item e de seus pedidos de compras atualizada com sucesso!')
      
      // Update local state
      setItens(prev => prev.map(i => i.id === editCategoryItem.id ? { ...i, categoria: newCategoryValue } : i))
      setEditCategoryItem(null)
      
      if (onItemUpdate) onItemUpdate()
    } catch (err: any) {
      toast.error('Erro ao atualizar categoria: ' + err.message)
    } finally {
      setSavingCategory(false)
    }
  }

  const handleOpenEditItem = (item: ItemWithDeliveries) => {
    setEditItemModal(item)
    setEditDescricao(item.descricao || '')
    setEditMarca(item.marca || '')
    setEditCategoria(normalizeCategory(item.categoria))
    setEditUnidade(item.unidade || 'UN')
    setEditValorUnitario(item.valor_unitario !== undefined && item.valor_unitario !== null ? String(item.valor_unitario) : '')
  }

  const handleSaveItemDetails = async () => {
    if (!editItemModal) return
    if (!editDescricao.trim()) {
      toast.warning('O descritivo do item não pode ficar em branco.')
      return
    }

    try {
      setSavingItem(true)
      const parsedValor = editValorUnitario ? parseFloat(editValorUnitario.replace(',', '.')) : editItemModal.valor_unitario

      // 1. Atualiza a tabela 'itens'
      const { error: errorItem } = await supabase
        .from('itens')
        .update({
          descricao: editDescricao.trim(),
          marca: editMarca.trim() || null,
          categoria: editCategoria,
          unidade: editUnidade.trim() || 'UN',
          valor_unitario: isNaN(parsedValor as number) ? editItemModal.valor_unitario : parsedValor
        })
        .eq('id', editItemModal.id)

      if (errorItem) throw errorItem

      // 2. Atualiza pedidos_compra vinculados se existirem
      const { error: errorPedidos } = await supabase
        .from('pedidos_compra')
        .update({
          descricao: editDescricao.trim(),
          categoria: editCategoria,
          marca: editMarca.trim() || null,
          unidade: editUnidade.trim() || 'UN'
        })
        .eq('item_id', editItemModal.id)

      if (errorPedidos) console.warn('Aviso ao atualizar pedidos_compra:', errorPedidos)

      // 3. Auditoria
      await logAction('EDITAR_ITEM_EMPENHO', 'itens', editItemModal.id, {
        descricao_anterior: editItemModal.descricao,
        descricao_nova: editDescricao.trim(),
        marca_anterior: editItemModal.marca,
        marca_nova: editMarca.trim(),
        categoria_anterior: editItemModal.categoria,
        categoria_nova: editCategoria
      })

      toast.success('Descritivo e dados do item atualizados com sucesso!')

      // 4. Atualiza o estado local
      setItens(prev => prev.map(i => i.id === editItemModal.id ? {
        ...i,
        descricao: editDescricao.trim(),
        marca: editMarca.trim() || null,
        categoria: editCategoria,
        unidade: editUnidade.trim() || 'UN',
        valor_unitario: isNaN(parsedValor as number) ? i.valor_unitario : parsedValor
      } : i))

      setEditItemModal(null)
      if (onItemUpdate) onItemUpdate()
    } catch (err: any) {
      toast.error('Erro ao atualizar item: ' + err.message)
    } finally {
      setSavingItem(false)
    }
  }

  if (loading) {
    return (
      <div className="flex items-center gap-2 py-4 px-6 text-zinc-500 text-sm">
        <Loader2 className="w-4 h-4 animate-spin" />
        Carregando itens...
      </div>
    )
  }

  if (itens.length === 0) {
    return (
      <div className="flex items-center gap-2 py-4 px-6 text-zinc-400 text-sm">
        <Package className="w-4 h-4" />
        Nenhum item cadastrado para esta nota.
      </div>
    )
  }

  return (
    <div className="bg-zinc-50/60 dark:bg-zinc-950/40 border-t border-zinc-200 dark:border-zinc-800 shadow-inner pb-4">
      <div className="px-6 pt-3 pb-1 flex items-center justify-between gap-2">
        <p className="text-xs font-bold text-zinc-500 dark:text-zinc-400 uppercase tracking-wider">
          Itens da Nota — {itens.length} item(ns)
        </p>
        <div className="flex items-center gap-2">
          <Button
            size="sm"
            variant="outline"
            onClick={toggleValorUnitario}
            className="h-7 text-[10px] font-bold uppercase gap-1.5 border-zinc-300 dark:border-zinc-700 bg-white dark:bg-zinc-900"
            title={showValorUnitario ? "Ocultar colunas de valores unitários" : "Exibir colunas de valores unitários"}
          >
            {showValorUnitario ? <EyeOff className="w-3 h-3 text-amber-500" /> : <Eye className="w-3 h-3 text-blue-500" />}
            {showValorUnitario ? "Ocultar R$ Unit." : "Exibir R$ Unit."}
          </Button>
          <Button 
            size="sm" 
            onClick={() => navigate('/baixa-nf', { state: { preSelectedNe: numeroNe } })}
            className="bg-emerald-600 hover:bg-emerald-700 text-white h-7 text-[10px] font-bold uppercase gap-1.5 shadow-lg shadow-emerald-500/20"
          >
            <Sparkles className="w-3 h-3" />
            Baixa Inteligente (NF)
          </Button>
          <Button 
            size="sm" 
            onClick={() => {
              setBulkCotacaoObs('')
              setBulkCotacaoOpen(true)
            }}
            className="bg-blue-600 hover:bg-blue-700 text-white h-7 text-[10px] font-bold uppercase gap-1.5 shadow-lg shadow-blue-500/20"
          >
            <ClipboardList className="w-3 h-3" />
            Solicitar Cotação em Massa
          </Button>
        </div>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-zinc-200 dark:border-zinc-800 text-xs text-zinc-500 dark:border-zinc-800">
              <th className="py-2 px-6 text-left font-semibold">Descrição</th>
              <th className="py-2 px-3 text-left font-semibold">Marca</th>
              {showValorUnitario && (
                <>
                  <th className="py-2 px-3 text-right font-semibold whitespace-nowrap">Val. Unit.</th>
                  <th className="py-2 px-3 text-right font-semibold whitespace-nowrap">Val. Total</th>
                </>
              )}
              <th className="py-2 px-3 text-right font-semibold whitespace-nowrap">Qtd. Pedida</th>
              <th className="py-2 px-3 text-right font-semibold whitespace-nowrap">Entregue</th>
              <th className="py-2 px-3 text-right font-semibold whitespace-nowrap">Pendente</th>
              <th className="py-2 px-3 text-left font-semibold">Progresso</th>
              <th className="py-2 px-3 text-left font-semibold">Status Entrega</th>
              <th className="py-2 px-3 text-left font-semibold">Status Compra</th>
              <th className="py-2 px-3 text-right font-semibold">Ação</th>
            </tr>
          </thead>
          <tbody>
                 {itens.map((item) => {
                  const { qtdEntregue, qtdPendente, qtdExcesso, pct, pctFisico, regularPct, regularPctFisico, excessPct, isActuallyFull, isActuallyFullFisico, isFatorCaixa } = getItemDeliveryStatus(item, nota)
                  const isFull = isActuallyFull
                  const isOver = qtdExcesso > 0
                  const isPartial = (pct > 0 || qtdEntregue > 0) && !isFull
                  const isLogisticsExpanded = expandedLogisticsId === item.id
                  const isDescExpanded = expandedDescIds.has(item.id)

                  const isItemBaixaPorPedido = (item.historico_entregas || []).some((h: any) => {
                    const numUpper = String(h.numero_nf || '').toUpperCase()
                    return numUpper.includes('PEDIDO') || numUpper.includes('DAV') || numUpper.includes('PROVISÓRIA') || numUpper.includes('PROVISORIA')
                  })

                  return (
                    <Fragment key={item.id}>
                      <tr
                        className={`border-b border-zinc-100 dark:border-zinc-800/50 transition-colors ${isLogisticsExpanded ? 'bg-white dark:bg-zinc-900 shadow-sm z-10' : 'hover:bg-white dark:hover:bg-zinc-900/40'}`}
                      >
                        <td 
                          className={`py-2.5 px-6 font-medium text-zinc-800 dark:text-zinc-200 cursor-pointer transition-all ${isDescExpanded ? 'whitespace-normal' : 'max-w-[400px] truncate'}`}
                          onClick={() => toggleDesc(item.id)}
                          title={isDescExpanded ? "Clique para encolher" : "Clique para ver descrição completa"}
                        >
                          <div className="flex flex-col gap-1">
                            <div className="flex items-start justify-between gap-2">
                              <span className="font-medium text-zinc-800 dark:text-zinc-200">{item.descricao}</span>
                              <button
                                type="button"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  handleOpenEditItem(item);
                                }}
                                className="shrink-0 text-blue-600 dark:text-blue-400 hover:text-blue-700 dark:hover:text-blue-300 hover:bg-blue-50 dark:hover:bg-blue-950/50 px-1.5 py-0.5 rounded border border-blue-200 dark:border-blue-800/60 transition-all text-[9.5px] font-bold flex items-center gap-1 shadow-2xs"
                                title="Editar descritivo e dados completos deste item"
                              >
                                <Pencil className="w-2.5 h-2.5" />
                                Editar Item
                              </button>
                            </div>
                            {item.categoria ? (
                              <div className="flex items-center gap-1.5 mt-0.5">
                                <span className="text-[9px] text-zinc-400 dark:text-zinc-500 font-bold uppercase tracking-wider">
                                  🏷️ {item.categoria}
                                </span>
                                <button
                                  type="button"
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    handleOpenEditItem(item);
                                  }}
                                  className="text-blue-500 hover:text-blue-700 transition-colors p-0.5 rounded hover:bg-blue-50 dark:hover:bg-blue-950/40"
                                  title="Editar descritivo e categoria do item"
                                >
                                  <Pencil className="w-2.5 h-2.5" />
                                </button>
                              </div>
                            ) : (
                              <div className="flex items-center gap-1.5 mt-0.5">
                                <button
                                  type="button"
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    handleOpenEditItem(item);
                                  }}
                                  className="text-zinc-400 hover:text-blue-500 text-[9px] font-bold uppercase tracking-wider flex items-center gap-1 transition-colors hover:bg-blue-50 dark:hover:bg-blue-950/40 px-1 py-0.5 rounded"
                                  title="Definir descritivo e categoria do item"
                                >
                                  🏷️ Sem Categoria
                                  <Pencil className="w-2.5 h-2.5" />
                                </button>
                              </div>
                            )}
                          </div>
                        </td>
                        <td className="py-2.5 px-3">
                          <span className="text-[10px] font-bold text-zinc-500 bg-zinc-100 dark:bg-zinc-800 px-1.5 py-0.5 rounded uppercase">
                            {item.marca || 'S/ MARCA'}
                          </span>
                        </td>
                        {showValorUnitario && (
                          <>
                            <td className="py-2.5 px-3 text-right font-mono font-medium text-zinc-700 dark:text-zinc-300 whitespace-nowrap">
                              {item.valor_unitario ? `R$ ${Number(item.valor_unitario).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}` : '—'}
                            </td>
                            <td className="py-2.5 px-3 text-right font-mono font-bold text-emerald-700 dark:text-emerald-400 whitespace-nowrap">
                              {item.valor_unitario ? `R$ ${(Number(item.valor_unitario) * Number(item.quantidade)).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}` : '—'}
                            </td>
                          </>
                        )}
                        <td className="py-2.5 px-3 text-right text-zinc-600 dark:text-zinc-400 whitespace-nowrap">
                          {formatNumber(item.quantidade)} {item.unidade}
                        </td>
                        <td className="py-2.5 px-3 text-right text-emerald-600 dark:text-emerald-400 font-medium whitespace-nowrap">
                          {formatNumber(qtdEntregue)}
                        </td>
                        <td className="py-2.5 px-3 text-right whitespace-nowrap">
                          <span className={qtdPendente > 0 ? 'text-amber-600 dark:text-amber-400 font-medium' : 'text-zinc-400'}>
                            {formatNumber(qtdPendente)}
                          </span>
                        </td>
                    <td className="py-2.5 px-3">
                      <div className="flex flex-col gap-1.5 min-w-[140px]">
                        {isItemBaixaPorPedido ? (
                          <>
                            <div className="relative h-1.5 w-full bg-zinc-200 dark:bg-zinc-700 rounded-full overflow-hidden">
                              <div
                                className="absolute top-0 left-0 h-full rounded-full transition-all duration-500 bg-gradient-to-r from-pink-500 via-rose-500 to-rose-400 shadow-sm"
                                style={{ width: `${regularPct}%` }}
                              />
                              {isOver && (
                                <div
                                  className="absolute top-0 left-0 h-full bg-orange-400 opacity-60 transition-all duration-700 z-30"
                                  style={{ width: `${excessPct}%`, filter: 'blur(0.5px)' }}
                                />
                              )}
                            </div>
                            <div className="flex items-center justify-between text-[10px] tabular-nums font-bold">
                              <span className="text-rose-600 font-bold">{pct}%</span>
                              {isOver && <span className="text-orange-600 flex items-center gap-0.5 animate-pulse"><AlertCircle className="w-2.5 h-2.5" /> +{formatNumber(qtdExcesso)}</span>}
                            </div>
                          </>
                        ) : isNotaModoSesau(nota) ? (
                          <>
                            {/* Barra NF (Azul) */}
                            <div className="flex items-center gap-1.5">
                              <span className="text-[9px] font-bold text-blue-500 w-5 shrink-0">NF</span>
                              <div className="relative flex-1 h-1.5 bg-zinc-200 dark:bg-zinc-700 rounded-full overflow-hidden">
                                <div
                                  className="absolute top-0 left-0 h-full rounded-full bg-blue-500 transition-all duration-500"
                                  style={{ width: `${regularPct}%` }}
                                />
                              </div>
                              <span className="text-[9px] tabular-nums font-bold text-blue-500 w-7 text-right">{pct}%</span>
                            </div>
                            {/* Barra Física (Verde) */}
                            <div className="flex items-center gap-1.5">
                              <span className="text-[9px] font-bold text-emerald-600 w-5 shrink-0">Fís.</span>
                              <div className="relative flex-1 h-1.5 bg-zinc-200 dark:bg-zinc-700 rounded-full overflow-hidden">
                                <div
                                  className="absolute top-0 left-0 h-full rounded-full bg-emerald-500 transition-all duration-500"
                                  style={{ width: `${regularPctFisico}%` }}
                                />
                                {/* Excesso na barra física */}
                                {isOver && (
                                  <div
                                    className="absolute top-0 left-0 h-full bg-orange-400 opacity-60 transition-all duration-700"
                                    style={{ width: `${excessPct}%`, filter: 'blur(0.5px)' }}
                                  />
                                )}
                              </div>
                              <span className="text-[9px] tabular-nums font-bold text-emerald-600 w-7 text-right">{pctFisico}%</span>
                            </div>
                            {isOver && (
                              <span className="text-orange-600 flex items-center gap-0.5 animate-pulse text-[10px] font-bold">
                                <AlertCircle className="w-2.5 h-2.5" /> +{formatNumber(qtdExcesso)}
                              </span>
                            )}
                          </>
                        ) : (
                          <>
                            {/* Barra Regular (modo normal) */}
                            <div className="relative h-1.5 w-full bg-zinc-200 dark:bg-zinc-700 rounded-full overflow-hidden">
                              <div
                                className={`absolute top-0 left-0 h-full rounded-full transition-all duration-500 ${isFull ? 'bg-emerald-500' : isPartial ? 'bg-brand-accent' : 'bg-zinc-400'}`}
                                style={{ width: `${regularPct}%` }}
                              />
                              {isOver && (
                                <div
                                  className="absolute top-0 left-0 h-full bg-orange-400 opacity-60 transition-all duration-700 z-30"
                                  style={{ width: `${excessPct}%`, filter: 'blur(0.5px)' }}
                                />
                              )}
                            </div>
                            <div className="flex items-center justify-between text-[10px] tabular-nums font-bold">
                              <span className={isOver ? 'text-orange-600' : 'text-zinc-500'}>{pct}%</span>
                              {isOver && <span className="text-orange-600 flex items-center gap-0.5 animate-pulse"><AlertCircle className="w-2.5 h-2.5" /> +{formatNumber(qtdExcesso)}</span>}
                            </div>
                          </>
                        )}
                      </div>
                    </td>

                    <td className="py-2.5 px-3">
                      {isOver ? (
                        <span className="inline-flex items-center gap-1 text-[10px] font-black text-white bg-orange-600 px-2 py-0.5 rounded-full shadow-sm shadow-orange-200 border border-orange-400">
                          SOBREBAIXA
                        </span>
                      ) : isFatorCaixa ? (
                        <span className="inline-flex items-center gap-1 text-[10px] font-black text-indigo-700 bg-indigo-50 border border-indigo-200 px-2 py-0.5 rounded-full shadow-sm">
                          <PackageCheck className="w-3 h-3" /> FATOR CAIXA
                        </span>
                      ) : isItemBaixaPorPedido ? (
                        isFull ? (
                          <span className="inline-flex items-center gap-1 text-xs font-bold text-rose-800 dark:text-rose-300 bg-rose-100 dark:bg-rose-950/60 border border-rose-300 px-2 py-0.5 rounded-full shadow-sm whitespace-nowrap">
                            <PackageCheck className="w-3 h-3 text-rose-600" /> Baixa por Pedido
                          </span>
                        ) : isPartial ? (
                          <span className="inline-flex items-center gap-1 text-xs font-bold text-rose-800 dark:text-rose-300 bg-rose-50 dark:bg-rose-950/40 border border-rose-200 px-2 py-0.5 rounded-full whitespace-nowrap">
                            <Clock className="w-3 h-3 text-rose-500" /> Parcial (Pedido)
                          </span>
                        ) : (
                          <span className="inline-flex items-center gap-1 text-xs font-medium text-amber-700 dark:text-amber-400 bg-amber-50 dark:bg-amber-950/40 px-2 py-0.5 rounded-full">
                            <PackageX className="w-3 h-3" /> Pendente
                          </span>
                        )
                      ) : isNotaModoSesau(nota) && isFull && !isActuallyFullFisico ? (
                        <span className="inline-flex items-center gap-1 text-xs font-medium text-blue-700 dark:text-blue-400 bg-blue-50 dark:bg-blue-950/40 px-2 py-0.5 rounded-full border border-blue-100 dark:border-blue-900/30">
                          <Clock className="w-3 h-3 text-blue-500" /> Física Pendente
                        </span>
                      ) : isFull ? (
                        <span className="inline-flex items-center gap-1 text-xs font-medium text-emerald-700 dark:text-emerald-400 bg-emerald-50 dark:bg-emerald-950/40 px-2 py-0.5 rounded-full">
                          <PackageCheck className="w-3 h-3" /> Completo
                        </span>
                      ) : isPartial ? (
                          <span className="inline-flex items-center gap-1 text-xs font-medium text-brand-accent bg-brand-accent/10 dark:bg-brand-accent/20 border border-brand-accent/10 dark:border-brand-accent/20 px-2 py-0.5 rounded-full">
                          <Clock className="w-3 h-3 text-brand-accent" /> Parcial
                        </span>
                      ) : (
                        <span className="inline-flex items-center gap-1 text-xs font-medium text-amber-700 dark:text-amber-400 bg-amber-50 dark:bg-amber-950/40 px-2 py-0.5 rounded-full">
                          <PackageX className="w-3 h-3" /> Pendente
                        </span>
                      )}
                    </td>
                    <td className="py-2.5 px-3">
                      <div className="flex flex-col gap-1">
                        {(() => {
                           const pedido = getActivePedido(item)
                           const activeCot = getActiveCotacao(item)
                           
                           if (!item.marcado_compras && !pedido && !activeCot) return (
                             <span className="text-[10px] font-bold text-zinc-400 uppercase tracking-tighter">Não Solicitada</span>
                           )
                           
                           let cotBadge = null
                           if (activeCot) {
                             const isFinalizado = !!activeCot.comprou_status
                             cotBadge = (
                               <span className={`inline-flex items-center gap-1 text-[10px] font-black px-2 py-0.5 rounded-full w-fit border ${
                                 isFinalizado 
                                   ? 'text-emerald-700 bg-emerald-50 border-emerald-200 dark:text-emerald-400 dark:bg-emerald-950/20 dark:border-emerald-900/30' 
                                   : 'text-blue-700 bg-blue-50 border-blue-200 dark:text-blue-400 dark:bg-blue-950/40 dark:border-blue-900/30 animate-pulse'
                               }`}>
                                 {isFinalizado ? `COTADO: ${activeCot.comprou_status.replace('COMPRADO - ', '').toUpperCase()}` : 'EM COTAÇÃO (MÓDULO)'}
                               </span>
                             )
                           }
                           
                           let pedBadge = null
                           let status = ''
                           if (pedido) {
                             status = (pedido.status || 'SOLICITADO').toUpperCase()
                             const obsJson = (() => {
                                try { return pedido.observacoes ? JSON.parse(pedido.observacoes) : null } catch { return null }
                             })()
                             const isParcial = obsJson?.compra_tipo === 'PARCIAL'
                             const isSaldoParcial = !!obsJson?.pedido_origem_id
                             
                             if (status === 'COMPRADO') {
                                if (isParcial) {
                                   pedBadge = (
                                      <span className="inline-flex items-center gap-1 text-[10px] font-black text-amber-700 bg-amber-50 border border-amber-200 px-2 py-0.5 rounded-full w-fit">
                                         COMPRADO PARCIALMENTE
                                      </span>
                                   )
                                } else {
                                   pedBadge = (
                                      <span className="inline-flex items-center gap-1 text-[10px] font-black text-emerald-700 bg-emerald-50 border border-emerald-200 px-2 py-0.5 rounded-full w-fit">
                                         COMPRADO
                                      </span>
                                   )
                                }
                             }
                             else if (status === 'COTACAO') pedBadge = (
                                <span className="inline-flex items-center gap-1 text-[10px] font-black text-blue-700 dark:text-blue-400 bg-blue-50 dark:bg-blue-950/40 border border-blue-200 dark:border-blue-900/30 px-2 py-0.5 rounded-full w-fit">
                                  EM COTAÇÃO
                                </span>
                             )
                             else if (status === 'ATENDIDO') pedBadge = (
                                <span className="inline-flex items-center gap-1 text-[10px] font-black text-zinc-500 bg-zinc-100 border border-zinc-200 px-2 py-0.5 rounded-full w-fit">
                                  ATENDIDO
                                </span>
                             )
                             else if (status === 'FALHA') pedBadge = (
                                <span className="inline-flex items-center gap-1 text-[10px] font-black text-red-700 bg-red-50 border border-red-200 px-2 py-0.5 rounded-full w-fit">
                                  FALHA NA COMPRA
                                </span>
                             )
                             else {
                                if (isSaldoParcial) {
                                   pedBadge = (
                                      <span className="inline-flex items-center gap-1 text-[10px] font-black text-blue-700 bg-blue-50 border border-blue-200 px-2 py-0.5 rounded-full animate-pulse w-fit">
                                         AGUARDANDO COMPRA (SALDO PARCIAL)
                                      </span>
                                   )
                                } else {
                                   pedBadge = (
                                      <span className="inline-flex items-center gap-1 text-[10px] font-black text-amber-700 bg-amber-50 border border-amber-200 px-2 py-0.5 rounded-full animate-pulse w-fit">
                                         AGUARDANDO COMPRA
                                      </span>
                                   )
                                }
                             }
                           }
                           
                           let libreBadge = null
                           if (item.marcado_compras && !pedido && !activeCot) {
                             libreBadge = (
                               <span className="inline-flex items-center gap-1 text-[10px] font-black text-emerald-700 bg-emerald-50 border border-emerald-200 px-2 py-0.5 rounded-full w-fit">
                                 MARCADO COMPRAS (LIVRE)
                                </span>
                             )
                           }

                           return (
                             <div className="flex flex-col gap-1">
                               <div className="flex items-center gap-1.5 flex-wrap">
                                 {cotBadge}
                                 {pedBadge}
                                 {libreBadge}
                                 {pedido && (
                                   <Button
                                     variant="ghost"
                                     size="icon-sm"
                                     className="h-5 w-5 rounded-full border border-zinc-200 dark:border-zinc-850 text-zinc-500 hover:text-zinc-650 transition-colors flex items-center justify-center p-0 shrink-0"
                                     title="Visualizar detalhes completos da solicitação"
                                     onClick={(e) => { e.stopPropagation(); setDetalhesPedido(pedido); }}
                                   >
                                     <Eye className="w-3 h-3 text-zinc-500" />
                                   </Button>
                                 )}
                               </div>
                               {pedido?.usuario_solicitante && (() => {
                                  const solicitanteProfile = profiles.find(p => p.id === pedido.solicitante_id || p.email?.toLowerCase() === pedido.usuario_solicitante?.toLowerCase())
                                  const solicitanteNome = solicitanteProfile?.display_name || pedido.usuario_solicitante
                                  return (
                                    <span className="text-[9px] text-zinc-500 block leading-none mt-1">
                                      Solicitado por: {solicitanteNome}
                                    </span>
                                  )
                               })()}
                               {pedido?.observacoes && (() => {
                                  const displayObs = getPedidoObservationDisplay(pedido)
                                  if (!displayObs) return null
                                  const isFail = status === 'FALHA'
                                  return (
                                    <span 
                                      className={`text-[9px] font-medium block mt-1 leading-normal max-w-[220px] break-words ${
                                        isFail 
                                          ? 'text-red-600 dark:text-red-400 font-bold bg-red-50 dark:bg-red-950/20 px-1.5 py-0.5 rounded border border-red-200/50 dark:border-red-900/30' 
                                          : 'text-zinc-500 dark:text-zinc-400 italic'
                                      }`}
                                      title={displayObs}
                                    >
                                      {isFail ? 'Motivo Falha: ' : 'Obs. Compras: '}{displayObs}
                                    </span>
                                  )
                               })()}
                             </div>
                           )
                        })()}
                      </div>
                    </td>
                    <td className="py-2.5 px-3 text-right">
                      <div className="flex items-center justify-end gap-2">
                        {!isFull && (() => {
                           const pedido = getActivePedido(item)
                           const activeCot = getActiveCotacao(item)
                           
                           const hasActivePed = !!(pedido && pedido.status !== 'FALHA')
                           const hasActiveCot = !!(activeCot && !activeCot.comprou_status)
                           
                           const isFailedPed = pedido?.status === 'FALHA'
                           
                           return (
                             <>
                               {/* Botão de Compra */}
                               <Button
                                 variant="ghost"
                                 size="icon-sm"
                                 disabled={hasActiveCot}
                                 onClick={(e) => { e.stopPropagation(); handleToggleCompra(item); }}
                                 title={isFailedPed ? "Compra Falhou (clique para tentar novamente)" : hasActivePed ? "Enviado p/ Compras (clique para desmarcar)" : "Falta pedir compra (clique para marcar)"}
                                 className={`rounded-lg w-8 h-8 p-0 border transition-all flex items-center justify-center shrink-0 ${
                                   hasActiveCot 
                                     ? 'opacity-40 cursor-not-allowed bg-zinc-100 dark:bg-zinc-950 border-zinc-200 dark:border-zinc-800 text-zinc-400' 
                                     : isFailedPed 
                                       ? 'bg-red-100 hover:bg-red-200 border-red-300 text-red-600' 
                                       : hasActivePed 
                                         ? 'bg-emerald-500 hover:bg-emerald-600 border-emerald-600 text-white shadow-sm' 
                                         : 'bg-zinc-50 dark:bg-zinc-950 border-zinc-200 dark:border-zinc-800 text-red-500 hover:bg-red-50 hover:text-red-600'
                                 }`}
                               >
                                 <ShoppingCart className="w-3.5 h-3.5" />
                               </Button>
                               
                               {/* Botão de Cotação */}
                               <Button
                                 variant="ghost"
                                 size="icon-sm"
                                 disabled={hasActivePed}
                                 onClick={(e) => { e.stopPropagation(); handleToggleCotacao(item); }}
                                 title={hasActiveCot ? "Enviado p/ Cotação (clique para desmarcar)" : "Falta pedir cotação (clique para marcar)"}
                                 className={`rounded-lg w-8 h-8 p-0 border transition-all flex items-center justify-center shrink-0 ${
                                   hasActivePed 
                                     ? 'opacity-40 cursor-not-allowed bg-zinc-100 dark:bg-zinc-950 border-zinc-200 dark:border-zinc-800 text-zinc-400' 
                                     : hasActiveCot 
                                       ? 'bg-blue-600 hover:bg-blue-700 border-blue-700 text-white shadow-sm' 
                                       : 'bg-zinc-50 dark:bg-zinc-950 border-zinc-200 dark:border-zinc-800 text-blue-500 hover:bg-blue-50 hover:text-blue-600'
                                 }`}
                               >
                                 <ClipboardList className="w-3.5 h-3.5" />
                               </Button>
                             </>
                           )
                        })()}
                        <Button 
                            variant={isLogisticsExpanded ? "secondary" : "ghost"}
                            size="sm" 
                            onClick={() => setExpandedLogisticsId(isLogisticsExpanded ? null : item.id)}
                            className={`h-8 gap-2 ${isLogisticsExpanded ? 'text-zinc-900 dark:text-white' : 'text-brand-accent hover:bg-brand-accent/10 dark:hover:bg-brand-accent/20'}`}
                        >
                            {isLogisticsExpanded ? <ChevronUp className="w-3.5 h-3.5" /> : <Truck className="w-3.5 h-3.5" />}
                            {isLogisticsExpanded ? 'Fechar' : 'Fluxo Receb.'}
                        </Button>
                      </div>
                    </td>
                  </tr>
                  {isLogisticsExpanded && (
                    <tr>
                      <td colSpan={8} className="p-0 border-b border-zinc-200 dark:border-zinc-800">
                        <ControleEntrega 
                          item={item}
                          onUpdate={() => { fetchItens(false); if (onItemUpdate) onItemUpdate(); }}
                          onClose={() => setExpandedLogisticsId(null)}
                        />
                      </td>
                    </tr>
                  )}
                </Fragment>
              )
            })}
          </tbody>
        </table>
      </div>

      <Dialog open={!!unmarkItemId} onOpenChange={(open) => { if (!open) setUnmarkItemId(null) }}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Desmarcar Item (Compras)</DialogTitle>
            <DialogDescription>
              Para confirmar a remoção desta marcação, por favor digite <strong>desmarcar</strong> no campo abaixo.
            </DialogDescription>
          </DialogHeader>
          <div className="flex items-center space-x-2 my-4">
            <Input 
              value={unmarkText}
              onChange={e => setUnmarkText(e.target.value)}
              placeholder="Digite 'desmarcar'"
              className="col-span-3"
            />
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setUnmarkItemId(null)}>Cancelar</Button>
            <Button onClick={handleConfirmUnmark} className="bg-red-600 hover:bg-red-700 text-white">Confirmar</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Modal de Solicitação Manual de Compra / Cotação (Empenhos) */}
      <Dialog open={!!solicitarItem} onOpenChange={(open) => { 
        if (!open) {
          setSolicitarItem(null)
          setSolicitarImagem(null)
          setSolicitarImagemPreview(null)
        }
      }}>
        <DialogContent className="sm:max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              {solicitarTipo === 'COTACAO' ? (
                <>
                  <ClipboardList className="w-5 h-5 text-blue-500" /> Solicitar Cotação de Item
                </>
              ) : solicitarModo === 'LIVRE' ? (
                <>
                  <Zap className="w-5 h-5 text-emerald-500" /> Sinalizar Compra Já Solicitada
                </>
              ) : (
                <>
                  <ShoppingCart className="w-5 h-5 text-blue-500" /> Solicitar Compra de Item
                </>
              )}
            </DialogTitle>
            <DialogDescription>
              {solicitarTipo === 'COTACAO' ? (
                "Insira os detalhes abaixo para registrar a cotação no painel."
              ) : solicitarModo === 'LIVRE' ? (
                "Sinalize que este item já possui solicitação de compra efetuada no sistema." 
              ) : (
                "Preencha os dados abaixo para enviar a solicitação para o setor de compras."
              )}
            </DialogDescription>
          </DialogHeader>

          {/* Seletor de Modo / Abas - Apenas para Compra */}
          {solicitarTipo === 'COMPRA' && (
            <div className="grid grid-cols-2 gap-2 p-1 bg-zinc-100 dark:bg-zinc-800/80 rounded-xl my-1 border border-zinc-200/60 dark:border-zinc-700/50">
              <button
                type="button"
                onClick={() => setSolicitarModo('LIVRE')}
                className={`flex items-center justify-center gap-2 py-2 px-3 rounded-lg text-xs font-bold transition-all ${
                  solicitarModo === 'LIVRE'
                    ? 'bg-white dark:bg-zinc-900 text-emerald-600 dark:text-emerald-400 shadow-sm border border-zinc-200 dark:border-zinc-700'
                    : 'text-zinc-500 hover:text-zinc-800 dark:hover:text-zinc-200'
                }`}
              >
                <Zap className="w-4 h-4" />
                Sinalizar "Já Solicitado"
              </button>
              <button
                type="button"
                onClick={() => setSolicitarModo('FORMULARIO')}
                className={`flex items-center justify-center gap-2 py-2 px-3 rounded-lg text-xs font-bold transition-all ${
                  solicitarModo === 'FORMULARIO'
                    ? 'bg-white dark:bg-zinc-900 text-blue-600 dark:text-blue-400 shadow-sm border border-zinc-200 dark:border-zinc-700'
                    : 'text-zinc-500 hover:text-zinc-800 dark:hover:text-zinc-200'
                }`}
              >
                <ShoppingCart className="w-4 h-4" />
                Enviar p/ Setor de Compras
              </button>
            </div>
          )}

          {solicitarItem && (
            solicitarTipo === 'COMPRA' && solicitarModo === 'LIVRE' ? (
              /* Modo Rápido: Apenas Sinalizar como Já Solicitado (Sem duplicar pedidos_compra) */
              <div className="space-y-4 py-2 text-xs">
                <div className="bg-emerald-50 dark:bg-emerald-950/20 border border-emerald-200 dark:border-emerald-900/30 p-3 rounded-lg flex items-start gap-2.5">
                  <CheckCircle2 className="w-5 h-5 text-emerald-600 dark:text-emerald-400 mt-0.5 shrink-0" />
                  <div className="text-[11px] text-emerald-800 dark:text-emerald-300">
                    <span className="font-bold block">Aviso de Marcação:</span>
                    Esta opção apenas marca o item no empenho como solicitado (verde), sem criar uma nova solicitação duplicada no módulo de compras.
                  </div>
                </div>

                <div>
                  <Label className="text-[10px] font-bold text-zinc-500 uppercase tracking-wide">Item</Label>
                  <div className="text-sm font-medium text-zinc-900 dark:text-zinc-100 line-clamp-2 bg-zinc-50 dark:bg-zinc-900/60 p-3 rounded-lg border border-zinc-200/50 dark:border-zinc-800/40 mt-1">
                    {solicitarItem.descricao}
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <Label className="text-[10px] font-bold text-zinc-500 uppercase tracking-wide">Unidade</Label>
                    <div className="text-sm font-medium text-zinc-900 dark:text-zinc-100 bg-zinc-50 dark:bg-zinc-900/60 p-2.5 rounded-lg border border-zinc-200/50 dark:border-zinc-800/40 mt-1">
                      {solicitarItem.unidade || 'UN'}
                    </div>
                  </div>
                  <div>
                    <Label className="text-[10px] font-bold text-zinc-500 uppercase tracking-wide">Saldo Pendente</Label>
                    <div className="text-sm font-bold text-emerald-600 dark:text-emerald-400 bg-emerald-50/50 dark:bg-emerald-950/20 p-2.5 rounded-lg border border-emerald-200/50 dark:border-emerald-900/30 mt-1">
                      {getItemDeliveryStatus(solicitarItem, nota).qtdPendente} {solicitarItem.unidade || 'UN'}
                    </div>
                  </div>
                </div>
              </div>
            ) : (
              /* Modo Formulário Completo (Setor de Compras ou Central de Cotações) */
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4 my-2 text-xs">
                <div className="md:col-span-2">
                  <Label className="text-[10px] font-bold text-zinc-500 uppercase tracking-wide">Item</Label>
                  <div className="text-sm font-medium text-zinc-900 dark:text-zinc-100 line-clamp-2 bg-zinc-50 dark:bg-zinc-900/60 p-3 rounded-lg border border-zinc-200/50 dark:border-zinc-800/40 mt-1">
                    {solicitarItem.descricao}
                  </div>
                </div>
                <div>
                  <Label className="text-[10px] font-bold text-zinc-500 uppercase tracking-wide">Unidade</Label>
                  <div className="text-sm font-medium text-zinc-900 dark:text-zinc-100 bg-zinc-50 dark:bg-zinc-900/60 p-2.5 rounded-lg border border-zinc-200/50 dark:border-zinc-800/40 mt-1">
                    {solicitarItem.unidade || 'UN'}
                  </div>
                </div>
                <div>
                  <Label className="text-[10px] font-bold text-zinc-500 uppercase tracking-wide">Valor Unitário</Label>
                  <div className="text-sm font-medium text-zinc-900 dark:text-zinc-100 bg-zinc-50 dark:bg-zinc-900/60 p-2.5 rounded-lg border border-zinc-200/50 dark:border-zinc-800/40 mt-1">
                    {solicitarItem.valor_unitario ? `R$ ${solicitarItem.valor_unitario.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}` : '—'}
                  </div>
                </div>
                <div>
                  <Label htmlFor="qtd_solicitar" className="text-[10px] font-bold text-zinc-500 uppercase tracking-wide">
                    {solicitarTipo === 'COTACAO' 
                      ? `Quantidade a Cotar (Saldo Pendente: ${getItemDeliveryStatus(solicitarItem, nota).qtdPendente})`
                      : `Quantidade a Solicitar (Saldo Pendente: ${getItemDeliveryStatus(solicitarItem, nota).qtdPendente})`
                    }
                  </Label>
                  <Input
                    id="qtd_solicitar"
                    type="number"
                    min={1}
                    max={getItemDeliveryStatus(solicitarItem, nota).qtdPendente}
                    value={solicitarQtd}
                    onChange={(e) => setSolicitarQtd(Number(e.target.value))}
                    className="mt-1 font-black text-sm h-9"
                  />
                </div>
                {solicitarTipo === 'COMPRA' ? (
                  <div>
                    <Label htmlFor="prazo_sla" className="text-[10px] font-bold text-zinc-500 uppercase tracking-wide">
                      Prazo Limite / SLA (Entrega)
                    </Label>
                    <Input
                      id="prazo_sla"
                      type="date"
                      value={solicitarPrazo}
                      onChange={(e) => setSolicitarPrazo(e.target.value)}
                      className="mt-1 h-9 font-bold"
                    />
                  </div>
                ) : (
                  <div>
                    <Label className="text-[10px] font-bold text-zinc-500 uppercase tracking-wide">
                      Tipo de Cotação
                    </Label>
                    <div className="text-sm font-bold text-blue-600 bg-blue-50 dark:bg-blue-950/20 p-2.5 rounded-lg border border-blue-200/50 mt-1 uppercase tracking-tight">
                      Cotação de Falta (Empenho)
                    </div>
                  </div>
                )}
                <div>
                  <Label htmlFor="categoria_solicitar" className="text-[10px] font-bold text-zinc-500 uppercase tracking-wide">
                    Categoria *
                  </Label>
                  <Select value={solicitarCategoria} onValueChange={setSolicitarCategoria}>
                    <SelectTrigger id="categoria_solicitar" className="mt-1 h-9 bg-white dark:bg-zinc-900 border-zinc-200 dark:border-zinc-850 font-bold">
                      <SelectValue placeholder="Selecione a categoria..." />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="MEDICAMENTO">MEDICAMENTO</SelectItem>
                      <SelectItem value="ODONTO">ODONTO</SelectItem>
                      <SelectItem value="DIETA">DIETA</SelectItem>
                      <SelectItem value="COSMÉTICO">COSMÉTICO</SelectItem>
                      <SelectItem value="MATERIAL HOSPITALAR">MATERIAL HOSPITALAR</SelectItem>
                      <SelectItem value="MOBILIÁRIO">MOBILIÁRIO</SelectItem>
                      <SelectItem value="ELETRÔNICO">ELETRÔNICO</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <Label htmlFor="marca_solicitar" className="text-[10px] font-bold text-zinc-500 uppercase tracking-wide">
                    Marca de Referência
                  </Label>
                  <Input
                    id="marca_solicitar"
                    value={solicitarMarca}
                    onChange={(e) => setSolicitarMarca(e.target.value)}
                    placeholder="Fabricante ou marca desejada..."
                    className="mt-1 h-9"
                  />
                </div>
                <div className="md:col-span-2">
                  <Label htmlFor="obs_solicitar" className="text-[10px] font-bold text-zinc-500 uppercase tracking-wide">
                    Observações
                  </Label>
                  <Textarea
                    id="obs_solicitar"
                    value={solicitarObs}
                    onChange={(e) => setSolicitarObs(e.target.value)}
                    placeholder={solicitarTipo === 'COTACAO' ? "Observações adicionais para o comprador/cotação" : "Justificativa ou informações adicionais para o comprador"}
                    className="mt-1 resize-none text-xs"
                    rows={2}
                  />
                </div>
                
                {solicitarTipo === 'COMPRA' && (
                  <>
                    <div className="md:col-span-2 flex items-start space-x-2 pt-3 border-t border-zinc-100 dark:border-zinc-800">
                      <input
                        type="checkbox"
                        id="e_notificacao_item"
                        checked={eNotificacao}
                        onChange={(e) => setENotificacao(e.target.checked)}
                        className="rounded border-zinc-300 text-brand-accent focus:ring-brand-accent h-4 w-4 mt-0.5 cursor-pointer"
                      />
                      <div className="grid gap-1 leading-none">
                        <label
                          htmlFor="e_notificacao_item"
                          className="text-[10px] font-bold text-zinc-700 dark:text-zinc-300 cursor-pointer uppercase tracking-wide select-none"
                        >
                          Esta compra possui Notificação de Atraso?
                        </label>
                        <p className="text-[9px] text-zinc-500">
                          Se marcado, é obrigatório anexar o PDF ou imagem da notificação cobrando a entrega.
                        </p>
                      </div>
                    </div>

                    {eNotificacao && (
                      <div className="md:col-span-2 space-y-1 bg-red-50/50 dark:bg-red-950/20 border border-red-200 dark:border-red-900/30 rounded-lg p-3 animate-in fade-in slide-in-from-top-1 duration-200">
                        <Label htmlFor="arquivo_notificacao_item" className="text-[10px] font-black text-red-700 dark:text-red-400 uppercase tracking-wider flex items-center gap-1">
                          {(nota as any).arquivo_notificacao ? 'Documento da Notificação (Opcional, herdado do Empenho)' : 'Documento da Notificação (PDF ou Imagem) *'}
                        </Label>
                        {(nota as any).arquivo_notificacao && (
                          <div className="text-[11px] text-emerald-600 dark:text-emerald-400 font-semibold mb-1 flex items-center gap-1">
                            <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse"></span>
                            Documento anexado no empenho: 
                            <a 
                              href={getCleanPublicUrl((nota as any).arquivo_notificacao)} 
                              target="_blank" 
                              rel="noopener noreferrer"
                              className="underline hover:text-emerald-700 font-bold flex items-center gap-0.5 ml-1 inline-flex"
                            >
                              Visualizar Anexo <ExternalLink className="w-3.5 h-3.5 inline" />
                            </a>
                          </div>
                        )}
                        <Input
                          id="arquivo_notificacao_item"
                          type="file"
                          accept="application/pdf,image/*"
                          onChange={(e) => setNotificacaoFile(e.target.files?.[0] || null)}
                          className={`cursor-pointer file:text-brand-accent bg-white dark:bg-zinc-950 text-xs ${(nota as any).arquivo_notificacao ? 'border-zinc-200 focus-visible:ring-brand-accent' : 'border-red-200 focus-visible:ring-red-500'}`}
                        />
                        {(nota as any).arquivo_notificacao && (
                          <p className="text-[9px] text-zinc-400">
                            Caso deseje enviar um documento diferente para esta compra específica, faça o upload acima.
                          </p>
                        )}
                      </div>
                    )}

                    <div className="md:col-span-2">
                      <Label htmlFor="imagem_solicitar" className="text-[10px] font-bold text-zinc-500 uppercase tracking-wider">
                        Imagem Anexa (Opcional)
                      </Label>
                      <Input
                        id="imagem_solicitar"
                        type="file"
                        accept="image/*"
                        onChange={handleSolicitarImageChange}
                        className="mt-1 cursor-pointer file:text-brand-accent border-zinc-200 focus-visible:ring-brand-accent text-xs bg-white dark:bg-zinc-950"
                      />
                      {solicitarImagemPreview && (
                        <div className="mt-2 relative w-24 h-24 border rounded-lg overflow-hidden group">
                          <img src={solicitarImagemPreview} alt="Preview" className="w-full h-full object-cover" />
                          <button 
                            type="button" 
                            onClick={handleRemoveSolicitarImage}
                            className="absolute top-1 right-1 bg-red-600 hover:bg-red-700 text-white rounded-full p-0.5 shadow transition-colors"
                          >
                            <X className="w-3 h-3" />
                          </button>
                        </div>
                      )}
                    </div>
                  </>
                )}
              </div>
            )
          )}

          <DialogFooter>
            <Button 
              variant="outline" 
              onClick={() => {
                setSolicitarItem(null)
                setSolicitarImagem(null)
                setSolicitarImagemPreview(null)
              }} 
              disabled={solicitarLoading}
            >
              Cancelar
            </Button>
            {solicitarTipo === 'COTACAO' ? (
              <Button 
                onClick={handleConfirmSolicitar} 
                disabled={solicitarLoading}
                className="bg-blue-600 hover:bg-blue-700 text-white font-bold gap-2"
              >
                {solicitarLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : <ClipboardList className="w-4 h-4" />}
                Confirmar Cotação
              </Button>
            ) : solicitarModo === 'LIVRE' ? (
              <Button 
                onClick={handleConfirmCompraLivre} 
                disabled={solicitarLoading}
                className="bg-emerald-600 hover:bg-emerald-700 text-white font-bold gap-2"
              >
                {solicitarLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Zap className="w-4 h-4" />}
                Confirmar Marcação
              </Button>
            ) : (
              <Button onClick={handleConfirmSolicitar} disabled={solicitarLoading} className="bg-blue-600 hover:bg-blue-700 text-white font-bold">
                {solicitarLoading ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : null}
                Confirmar Solicitação
              </Button>
            )}
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Modal de Solicitação de Cotação em Massa */}
      <Dialog open={bulkCotacaoOpen} onOpenChange={setBulkCotacaoOpen}>
        <DialogContent className="sm:max-w-xl max-h-[85vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-blue-600">
              <ClipboardList className="w-5 h-5" /> Enviar Todos os Itens para Cotação
            </DialogTitle>
            <DialogDescription>
              Esta ação enviará todos os itens pendentes deste Empenho que ainda não possuem cotações ou compras ativas para o módulo de cotação.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 py-3 text-xs">
            <div className="border border-blue-100 bg-blue-50/50 dark:bg-blue-950/20 dark:border-blue-900/30 p-3 rounded-lg flex flex-col gap-2">
              <span className="font-bold text-blue-700 dark:text-blue-400 uppercase tracking-wider text-[10px]">Resumo do Envio em Massa</span>
              <p className="text-[11px] text-zinc-600 dark:text-zinc-400">
                O sistema identificará automaticamente os itens elegíveis (saldo pendente &gt; 0 e sem solicitações em aberto), herdando o órgão emissor e o documento de origem de cada item.
              </p>
            </div>

            <div>
              <Label htmlFor="bulk_obs" className="text-[10px] font-bold text-zinc-500 uppercase tracking-wide">
                Observações Gerais (Opcional)
              </Label>
              <Textarea
                id="bulk_obs"
                value={bulkCotacaoObs}
                onChange={(e) => setBulkCotacaoObs(e.target.value)}
                placeholder="Insira observações que serão salvas em cada solicitação de cotação..."
                className="mt-1 resize-none text-xs"
                rows={3}
              />
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setBulkCotacaoOpen(false)} disabled={bulkCotacaoLoading}>
              Cancelar
            </Button>
            <Button 
              onClick={handleBulkCotacao} 
              disabled={bulkCotacaoLoading}
              className="bg-blue-600 hover:bg-blue-700 text-white font-bold gap-2"
            >
              {bulkCotacaoLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : <ClipboardList className="w-4 h-4" />}
              Confirmar Envio
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

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
                  className={`text-[10px] uppercase font-extrabold tracking-tight h-5 border px-2 py-0.5 rounded-full ${
                    detalhesPedido.status === 'COMPRADO' 
                      ? 'bg-emerald-50 text-emerald-700 border-emerald-200' 
                      : detalhesPedido.status === 'COTACAO' 
                        ? 'bg-blue-50 text-blue-700 border-blue-200' 
                        : detalhesPedido.status === 'ATENDIDO' 
                          ? 'bg-zinc-100 text-zinc-500 border-zinc-200' 
                          : detalhesPedido.status === 'FALHA' 
                            ? 'bg-red-50 text-red-700 border-red-200' 
                            : 'bg-amber-50 text-amber-700 border-amber-200'
                  }`}
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
            
            // Parse obs payload
            let obs: any = null
            if (p.observacoes && p.observacoes.startsWith('{')) {
              try {
                obs = JSON.parse(p.observacoes)
              } catch (e) {
                // Ignore
              }
            }

            const formatDisplayDate = (dateStr: string | null | undefined): string => {
                if (!dateStr) return '—'
                if (/^\d{2}\/\d{2}\/\d{4}$/.test(dateStr)) return dateStr
                const parts = dateStr.split('T')[0].split('-')
                if (parts.length === 3) {
                    const [year, month, day] = parts
                    return `${day}/${month}/${year}`
                }
                return dateStr
            }

            const formatCurrency = (val: number | null | undefined): string => {
                if (val == null) return '—'
                return `R$ ${val.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
            }

            // Campos calculados com fallback para solicitações legadas/existentes
            const marcaReferencia = obs?.marca || null
            const observacaoSolicitante = obs ? (obs.obs_adicional || obs.observacao || null) : p.observacoes
            const eNotif = p.e_notificacao || obs?.e_notificacao || false
            const arquivoNotif = p.arquivo_notificacao || obs?.arquivo_notificacao || obs?.arquivo_notificacao_caminho || null
            const eJudicial = p.demanda_judicial || obs?.demanda_judicial || false
            const arquivoJudicial = p.arquivo_demanda_judicial || obs?.arquivo_demanda_judicial_caminho || null

            const orgaoCliente = obs?.orgao_solicitante || nota?.emissor || '—'
            const tipoDoc = obs?.tipo_documento || 'EMPENHO'
            const docOrigem = obs?.documento_origem || numeroNe || '—'
            
            // Description of item or catalog product
            const associatedItem = itens.find(i => i.id === p.item_id)
            const itemDesc = associatedItem?.descricao || p.item?.descricao || obs?.descricao || '—'
            const itemCategoria = p.categoria || associatedItem?.categoria || obs?.categoria || '—'
            const itemUnidade = associatedItem?.unidade || p.item?.unidade || obs?.unidade || 'UN'
            const itemValorUnitario = associatedItem?.valor_unitario || p.item?.valor_unitario || obs?.valor_unitario || 0

            const solicitanteProfile = profiles.find(prof => prof.id === p.solicitante_id || prof.email?.toLowerCase() === p.usuario_solicitante?.toLowerCase())

            return (
              <div className="space-y-6 py-4 text-zinc-700 dark:text-zinc-300 text-sm">
                {/* Informações do Item */}
                <div className="space-y-3">
                  <h4 className="text-[10px] font-black text-zinc-400 dark:text-zinc-500 uppercase tracking-widest border-l-2 border-brand-accent pl-2">Informações do Item</h4>
                  <div className="bg-zinc-50 dark:bg-zinc-900/60 p-4 rounded-2xl border border-zinc-200/50 dark:border-zinc-800/40 space-y-2.5">
                    <div>
                      <span className="text-[10px] font-bold text-zinc-400 uppercase tracking-wide">Descrição</span>
                      <p className="font-extrabold text-zinc-900 dark:text-white leading-relaxed uppercase">{itemDesc}</p>
                    </div>
                    <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 pt-1.5 border-t border-dashed border-zinc-200/60 dark:border-zinc-850/40">
                      <div>
                        <span className="text-[10px] font-bold text-zinc-400 uppercase tracking-wide">Categoria</span>
                        <p className="font-bold text-zinc-800 dark:text-zinc-200 mt-0.5">{itemCategoria}</p>
                      </div>
                      <div>
                        <span className="text-[10px] font-bold text-zinc-400 uppercase tracking-wide">Quantidade</span>
                        <p className="font-mono font-black text-zinc-800 dark:text-zinc-200 mt-0.5">{p.quantidade_solicitada} {itemUnidade}</p>
                      </div>
                      <div>
                        <span className="text-[10px] font-bold text-zinc-400 uppercase tracking-wide">Vl. Unit. Estimado</span>
                        <p className="font-mono font-bold text-zinc-800 dark:text-zinc-200 mt-0.5">{formatCurrency(itemValorUnitario)}</p>
                      </div>
                      <div>
                        <span className="text-[10px] font-bold text-zinc-400 uppercase tracking-wide">Total Estimado</span>
                        <p className="font-mono font-black text-brand-accent mt-0.5">{formatCurrency(p.quantidade_solicitada * itemValorUnitario)}</p>
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
                        <p className="font-bold text-zinc-800 dark:text-zinc-200 mt-0.5">{solicitanteProfile?.display_name || p.usuario_solicitante || '—'}</p>
                      </div>
                      <div className="grid grid-cols-2 gap-2 pt-1 border-t border-dashed border-zinc-200/65 dark:border-zinc-850/45">
                        <div>
                          <span className="text-[10px] font-bold text-zinc-400 uppercase tracking-wide">Setor</span>
                          <p className="font-bold text-brand-accent text-xs mt-0.5">{solicitanteProfile?.setor || '—'}</p>
                        </div>
                        <div>
                          <span className="text-[10px] font-bold text-zinc-400 uppercase tracking-wide">E-mail</span>
                          <p className="text-[11px] font-mono text-zinc-500 dark:text-zinc-400 mt-0.5 overflow-hidden text-ellipsis whitespace-nowrap" title={solicitanteProfile?.email || ''}>{solicitanteProfile?.email || '—'}</p>
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
                        <div className="flex items-center justify-between p-2 bg-red-500/5 dark:bg-red-500/10 rounded-xl border border-red-200/45 dark:border-red-900/30">
                          <div className="flex items-center gap-2">
                            <span className="text-[8px] bg-red-100 text-red-700 dark:bg-red-950/40 dark:text-red-400 border border-red-200 font-bold px-2 py-0.5 rounded uppercase tracking-wide">NOTIFICAÇÃO</span>
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
                              <Eye className="w-3.5 h-3.5" /> Ver Notificação
                            </Button>
                          ) : (
                            <span className="text-[10px] text-zinc-400 italic">Arquivo não anexado</span>
                          )}
                        </div>
                      )}
                      {eJudicial && (
                        <div className="flex items-center justify-between p-2 bg-purple-500/5 dark:bg-purple-500/10 rounded-xl border border-purple-200/45 dark:border-purple-900/30">
                          <span className="text-[8px] bg-purple-100 text-purple-700 dark:bg-purple-950/40 dark:text-purple-400 border border-purple-200 font-bold px-2 py-0.5 rounded uppercase tracking-wide">DEMANDA JUDICIAL</span>
                          {arquivoJudicial ? (
                            <Button 
                              variant="outline" 
                              size="sm" 
                              className="h-7 text-[10px] border-purple-200 hover:bg-purple-50 dark:border-purple-900/40 text-purple-700 hover:text-purple-800 dark:text-purple-400 dark:hover:bg-purple-950/30 flex items-center gap-1 font-bold rounded-lg"
                              onClick={() => handleVerDocumento(arquivoJudicial)}
                            >
                              <Eye className="w-3.5 h-3.5" /> Ver Documento Judicial
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
                            <span className="text-[9px] bg-red-100 text-red-750 font-bold border border-red-200 px-2 py-0.5 rounded uppercase tracking-tight">Falha na Compra</span>
                            {obs?.falta_industria && (
                              <span className="bg-red-500/10 text-red-700 dark:text-red-400 border border-red-200/40 text-[9px] font-bold uppercase px-2 py-0.5 rounded">Falta na Indústria</span>
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
                                <Loader2 className="w-3.5 h-3.5" /> Download Carta da Indústria
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

      {/* Modal para Alterar Categoria */}
      <Dialog open={!!editCategoryItem} onOpenChange={(open) => { if (!open) setEditCategoryItem(null) }}>
        <DialogContent className="sm:max-w-[400px] bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-3xl p-6 shadow-2xl">
          <DialogHeader className="space-y-1">
            <DialogTitle className="text-xl font-black text-zinc-900 dark:text-white uppercase tracking-tight">
              Alterar Categoria do Item
            </DialogTitle>
            <DialogDescription className="text-xs text-zinc-400 font-medium">
              Altere a classificação/tipo deste item do empenho. Isso também atualizará as solicitações de compra vinculadas a ele.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 py-3">
            <div className="p-3 bg-zinc-50 dark:bg-zinc-950/40 border border-zinc-200/85 dark:border-zinc-800/60 rounded-2xl space-y-1">
              <span className="text-[10px] font-bold text-zinc-400 uppercase tracking-wider">Item Selecionado</span>
              <div className="text-xs font-extrabold text-zinc-800 dark:text-zinc-200 uppercase line-clamp-2">
                {editCategoryItem?.descricao}
              </div>
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="categoria_item_edit" className="text-xs font-bold text-zinc-500 dark:text-zinc-400">
                Nova Categoria *
              </Label>
              <Select value={newCategoryValue} onValueChange={setNewCategoryValue}>
                <SelectTrigger id="categoria_item_edit" className="mt-1 bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-xl">
                  <SelectValue placeholder="Selecione a categoria..." />
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
          </div>

          <DialogFooter className="pt-4 border-t border-zinc-100 dark:border-zinc-800 gap-2">
            <Button
              type="button"
              variant="ghost"
              onClick={() => setEditCategoryItem(null)}
              className="h-10 text-xs font-bold rounded-xl border border-zinc-200 dark:border-zinc-800"
            >
              Cancelar
            </Button>
            <Button
              type="button"
              disabled={savingCategory}
              onClick={handleSaveCategory}
              className="h-10 text-xs font-black bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-500 hover:to-indigo-500 text-white rounded-xl"
            >
              {savingCategory ? 'Salvando...' : 'Confirmar Alteração'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Modal para Editar Descritivo e Dados do Item */}
      <Dialog open={!!editItemModal} onOpenChange={(open) => { if (!open) setEditItemModal(null) }}>
        <DialogContent className="sm:max-w-[550px] bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-3xl p-6 shadow-2xl">
          <DialogHeader className="space-y-1">
            <DialogTitle className="text-xl font-black text-zinc-900 dark:text-white uppercase tracking-tight flex items-center gap-2">
              <Pencil className="w-5 h-5 text-blue-600 dark:text-blue-400" />
              Editar Item do Empenho
            </DialogTitle>
            <DialogDescription className="text-xs text-zinc-400 font-medium">
              Corrija ou complete o descritivo do item, marca, unidade ou categoria conforme o documento oficial da Ata.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 py-3">
            {/* Descritivo Completo */}
            <div className="space-y-1.5">
              <Label htmlFor="edit_descricao_item" className="text-xs font-bold text-zinc-700 dark:text-zinc-300">
                Descritivo Completo do Item *
              </Label>
              <textarea
                id="edit_descricao_item"
                rows={4}
                value={editDescricao}
                onChange={e => setEditDescricao(e.target.value)}
                placeholder="Digite a descrição completa do produto..."
                className="w-full p-3 bg-white dark:bg-zinc-950 border border-zinc-200 dark:border-zinc-800 rounded-xl text-xs font-medium text-zinc-800 dark:text-zinc-200 outline-none focus:border-blue-600 transition-all resize-y"
              />
            </div>

            <div className="grid grid-cols-2 gap-3">
              {/* Marca */}
              <div className="space-y-1.5">
                <Label htmlFor="edit_marca_item" className="text-xs font-bold text-zinc-700 dark:text-zinc-300">
                  Marca / Fabricante
                </Label>
                <input
                  id="edit_marca_item"
                  type="text"
                  value={editMarca}
                  onChange={e => setEditMarca(e.target.value)}
                  placeholder="Ex: CRISTÁLIA, MEDLEY"
                  className="w-full h-10 px-3 bg-white dark:bg-zinc-950 border border-zinc-200 dark:border-zinc-800 rounded-xl text-xs font-medium text-zinc-800 dark:text-zinc-200 outline-none focus:border-blue-600 uppercase"
                />
              </div>

              {/* Unidade */}
              <div className="space-y-1.5">
                <Label htmlFor="edit_unidade_item" className="text-xs font-bold text-zinc-700 dark:text-zinc-300">
                  Unidade de Medida
                </Label>
                <input
                  id="edit_unidade_item"
                  type="text"
                  value={editUnidade}
                  onChange={e => setEditUnidade(e.target.value)}
                  placeholder="Ex: FR, CX, AMP, UN"
                  className="w-full h-10 px-3 bg-white dark:bg-zinc-950 border border-zinc-200 dark:border-zinc-800 rounded-xl text-xs font-medium text-zinc-800 dark:text-zinc-200 outline-none focus:border-blue-600 uppercase"
                />
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3">
              {/* Categoria */}
              <div className="space-y-1.5">
                <Label htmlFor="edit_categoria_item" className="text-xs font-bold text-zinc-700 dark:text-zinc-300">
                  Categoria
                </Label>
                <Select value={editCategoria} onValueChange={setEditCategoria}>
                  <SelectTrigger id="edit_categoria_item" className="bg-white dark:bg-zinc-950 border border-zinc-200 dark:border-zinc-800 rounded-xl h-10 text-xs font-bold">
                    <SelectValue placeholder="Selecione..." />
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

              {/* Valor Unitário */}
              <div className="space-y-1.5">
                <Label htmlFor="edit_valor_unitario" className="text-xs font-bold text-zinc-700 dark:text-zinc-300">
                  Valor Unitário (R$)
                </Label>
                <input
                  id="edit_valor_unitario"
                  type="text"
                  value={editValorUnitario}
                  onChange={e => setEditValorUnitario(e.target.value)}
                  placeholder="0.00"
                  className="w-full h-10 px-3 bg-white dark:bg-zinc-950 border border-zinc-200 dark:border-zinc-800 rounded-xl text-xs font-medium text-zinc-800 dark:text-zinc-200 outline-none focus:border-blue-600 font-mono"
                />
              </div>
            </div>
          </div>

          <DialogFooter className="pt-4 border-t border-zinc-100 dark:border-zinc-800 gap-2">
            <Button
              type="button"
              variant="ghost"
              onClick={() => setEditItemModal(null)}
              className="h-10 text-xs font-bold rounded-xl border border-zinc-200 dark:border-zinc-800"
            >
              Cancelar
            </Button>
            <Button
              type="button"
              disabled={savingItem}
              onClick={handleSaveItemDetails}
              className="h-10 text-xs font-black bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-500 hover:to-indigo-500 text-white rounded-xl gap-2 shadow-lg shadow-blue-600/20"
            >
              {savingItem ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin" />
                  Salvando...
                </>
              ) : (
                'Salvar Alterações'
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
