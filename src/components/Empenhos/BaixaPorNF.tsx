import { useState, useEffect, useMemo, useRef } from 'react'
import { useLocation } from 'react-router-dom'
import { supabase } from '../../lib/supabase'
import { extrairDadosNF } from '../../aiService'
import { useAuth } from '../../AuthContext'
import { motivosPendencia } from '../../lib/utils'
import { refreshNotaStatus, verificarDuplicidadeNf } from '../../lib/supabaseHelpers'
import type { NFCheckResult } from '../../lib/supabaseHelpers'
import { logAction } from '../../lib/logger'
import { toast } from 'sonner'
import { 
  FileText, 
  Sparkles, 
  Upload, 
  Save,
  Loader2,
  CheckCircle2,
  X,
  AlertCircle,
  PackageCheck,
  Search,
  Plus,
  Trash2,
  Link2,
  Eye,
  RefreshCw,
  AlertTriangle
} from 'lucide-react'
import { cn } from '../../lib/utils'
import { getCleanPublicUrl } from '../../lib/storage'

import { Card, CardContent, CardHeader, CardTitle } from '../ui/card'
import { Input } from '../ui/input'
import { Button } from '../ui/button'
import { Label } from '../ui/label'
import { Progress } from '../ui/progress'
import { 
  Table, 
  TableBody, 
  TableCell, 
  TableHead, 
  TableHeader, 
  TableRow 
} from '../ui/table'
import { 
  Dialog, 
  DialogContent, 
  DialogHeader, 
  DialogTitle, 
  DialogDescription 
} from '../ui/dialog'
import { 
  Select, 
  SelectContent, 
  SelectItem, 
  SelectTrigger, 
  SelectValue 
} from '../ui/select'
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '../ui/popover'
import type { Tables } from '../../supabaseTypes'

interface BaixaPorNFProps {
  onSuccess?: () => void
  onCancel?: () => void
}

type NotaItem = Tables<'itens'>

// Um único vínculo de uma linha da NF com um item do empenho
interface VinculoItem {
  id: string       // ID do item do empenho
  qtd: number      // Quantidade manual a ser abatida neste item
}

export function BaixaPorNF({ onSuccess, onCancel }: BaixaPorNFProps) {
  const [empenhosDisponiveis, setEmpenhosDisponiveis] = useState<any[]>([])
  const [empenhoSelecionadoId, setEmpenhoSelecionadoId] = useState<string>('')
  const [itensEmpenho, setItensEmpenho] = useState<NotaItem[]>([])
  const [itensPoolAta, setItensPoolAta] = useState<any[]>([])
  
  // Estados para buscar NFs já lançadas nas ATAs
  const [isExistingAtaNf, setIsExistingAtaNf] = useState(false)
  const [showAtaNfSearchModal, setShowAtaNfSearchModal] = useState(false)
  const [ataNfsDisponiveis, setAtaNfsDisponiveis] = useState<any[]>([])
  const [loadingAtaNfs, setLoadingAtaNfs] = useState(false)
  const [searchAtaNfInput, setSearchAtaNfInput] = useState('')
  const [arquivoNfExistenteCaminho, setArquivoNfExistenteCaminho] = useState<string | null>(null)
  
  const [nfArquivo, setNfArquivo] = useState<File | null>(null)
  const [nfNumero, setNfNumero] = useState('')
  const [nfDataEmissao, setNfDataEmissao] = useState('')
  const [nfDuplicada, setNfDuplicada] = useState(false)
  const [nfDuplicadaInfo, setNfDuplicadaInfo] = useState<NFCheckResult | null>(null)
  const [itensNF, setItensNF] = useState<any[]>([])

  // NOVO: cada índice de item da NF mapeia para uma lista de vínculos {id, qtd}
  const [mapeamentoItens, setMapeamentoItens] = useState<Record<number, VinculoItem[]>>({})

  // Fatores de conversão de unidade (por índice de item da NF)
  const [fatoresConversao, setFatoresConversao] = useState<Record<number, number>>({})
  const [operacoesConversao, setOperacoesConversao] = useState<Record<number, 'MULTIPLY' | 'DIVIDE'>>({})
  const [arredondamentoConversao, setArredondamentoConversao] = useState<Record<number, 'NONE' | 'ROUND' | 'FLOOR' | 'CEIL'>>({})

  // Estado para controlar qual popover de vínculo está aberto (por índice da NF)
  const [popoverAberto, setPopoverAberto] = useState<Record<number, boolean>>({})
  // Pesquisa dentro do popover de cada linha
  const [searchVinculo, setSearchVinculo] = useState<Record<number, string>>({})

  const [motivosCod, setMotivosCod] = useState<Record<string, string>>({})
  const [justificativas, setJustificativas] = useState<Record<string, string>>({})
  const [itensPendentesEntrega, setItensPendentesEntrega] = useState(false)
  const [isDiaD, setIsDiaD] = useState(false)

  const [isDragging, setIsDragging] = useState(false)

  const [loadingIA, setLoadingIA] = useState(false)
  const [progress, setProgress] = useState(0)
  const [saving, setSaving] = useState(false)
  const savingRef = useRef(false) // trava síncrona contra duplo clique
  const [showSuccessModal, setShowSuccessModal] = useState(false)
  const [statusLog, setStatusLog] = useState('')
  const [searchItemInput, setSearchItemInput] = useState('')
  const [expandedDescIds, setExpandedDescIds] = useState<Set<number>>(new Set())
  const [searchEmpenhoInput, setSearchEmpenhoInput] = useState('')
  const [entregasProvisorias, setEntregasProvisorias] = useState<any[]>([])
  const [provisoriaIdsSubstituir, setProvisoriaIdsSubstituir] = useState<number[]>([])

  const filteredEmpenhos = useMemo(() => {
    if (!searchEmpenhoInput) return empenhosDisponiveis
    const term = searchEmpenhoInput.toLowerCase()
    return empenhosDisponiveis.filter(emp => 
      String(emp.numero_ne || '').toLowerCase().includes(term) ||
      String(emp.entidades?.nome || '').toLowerCase().includes(term) ||
      String(emp.emissor || '').toLowerCase().includes(term)
    )
  }, [empenhosDisponiveis, searchEmpenhoInput])

  const resetForm = () => {
    setNfArquivo(null)
    setNfNumero('')
    setNfDataEmissao('')
    setNfDuplicada(false)
    setNfDuplicadaInfo(null)
    setItensNF([])
    setMapeamentoItens({})
    setFatoresConversao({})
    setOperacoesConversao({})
    setArredondamentoConversao({})
    setMotivosCod({})
    setJustificativas({})
    setEmpenhoSelecionadoId('')
    setSearchEmpenhoInput('')
    setProgress(0)
    setItensPendentesEntrega(false)
    setIsDiaD(false)
    setPopoverAberto({})
    setSearchVinculo({})
    setIsExistingAtaNf(false)
    setArquivoNfExistenteCaminho(null)
    setEntregasProvisorias([])
    setProvisoriaIdsSubstituir([])
  }

  const toggleDesc = (id: number) => {
    setExpandedDescIds(prev => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  const { user, profile, isOP } = useAuth()
  const location = useLocation()
  const preSelectedNe = location.state?.preSelectedNe

  // Verifica duplicidade da NF no banco de dados
  useEffect(() => {
    if (!nfNumero || isExistingAtaNf) {
      setNfDuplicada(false)
      setNfDuplicadaInfo(null)
      return
    }

    const timer = setTimeout(async () => {
      const result = await verificarDuplicidadeNf(nfNumero)
      setNfDuplicada(result.exists)
      setNfDuplicadaInfo(result)
      if (result.exists) {
        if (result.isLoose) {
          toast.warning(`Atenção: A NF nº ${result.numero_nf} já está cadastrada como venda direta na Ata. Vincule-a em vez de importar novamente.`)
        } else {
          toast.error(`Atenção: A NF nº ${result.numero_nf} já foi importada anteriormente no sistema!`)
        }
      }
    }, 500)

    return () => clearTimeout(timer)
  }, [nfNumero, isExistingAtaNf])

  // Carrega empenhos
  useEffect(() => {
    async function loadEmpenhos() {
      if (!user?.id) return
      
      let query = supabase.from('notas')
        .select('*, entidades(nome)')
        .in('status_geral', ['PENDENTE', 'EM_ANDAMENTO', 'SEPARADO', 'CONCLUIDO', 'FATOR_CAIXA', 'CANCELADO'])

      const isCompras = profile?.setor?.toUpperCase() === 'COMPRAS'

      if (isOP && !isCompras) {
          query = query.or(`assigned_to.eq.${user.id},owner_id.eq.${user.id}`)
      } else if (profile?.nivel !== 'DEV' && profile?.setor && profile?.setor !== 'DIRECAO' && !isCompras) {
          query = query.or(`setor.eq.${profile.setor},assigned_to.eq.${user.id},owner_id.eq.${user.id}`)
      }

      const { data } = await query
      if (data) {
        setEmpenhosDisponiveis(data as any[])
        if (preSelectedNe) {
            const match = data.find(n => n.numero_ne === preSelectedNe)
            if (match) setEmpenhoSelecionadoId(match.id.toString())
        }
      }
    }
    loadEmpenhos()
  }, [user?.id, profile?.setor, profile?.nivel, isOP, preSelectedNe])

  useEffect(() => {
    const handleWindowDragEnter = (e: DragEvent) => {
      e.preventDefault()
      e.stopPropagation()
      if (e.dataTransfer?.types?.includes('Files')) {
        setIsDragging(true)
      }
    }
    const handleWindowDragOver = (e: DragEvent) => {
      e.preventDefault()
      e.stopPropagation()
    }
    const handleWindowDrop = (e: DragEvent) => {
      e.preventDefault()
      e.stopPropagation()
      setIsDragging(false)
    }
    window.addEventListener('dragenter', handleWindowDragEnter)
    window.addEventListener('dragover', handleWindowDragOver)
    window.addEventListener('drop', handleWindowDrop)
    return () => {
      window.removeEventListener('dragenter', handleWindowDragEnter)
      window.removeEventListener('dragover', handleWindowDragOver)
      window.removeEventListener('drop', handleWindowDrop)
    }
  }, [])

  // Quando seleciona um empenho, busca seus itens
  useEffect(() => {
    if (!empenhoSelecionadoId) {
      setItensEmpenho([])
      return
    }
    async function loadItems() {
      const { data: itemsData } = await supabase
        .from('itens')
        .select('*, historico_entregas(*)')
        .eq('nota_id', Number(empenhoSelecionadoId))
      
      if (itemsData) {
        const empenho = empenhosDisponiveis.find(e => String(e.id) === empenhoSelecionadoId)
        const currentAtaId = empenho?.ata_id

        let poolAta: any[] = []
        if (currentAtaId) {
          const { data: ataData } = await supabase.from('itens_ata').select('*').eq('ata_id', currentAtaId)
          if (ataData) poolAta = ataData
          setItensPoolAta(ataData || [])
        }

        const provisoriaList: any[] = []

        const itensComSaldo = itemsData.map(it => {
          const historicoArray = (it.historico_entregas as any) || []
          const entregaTotal = (Array.isArray(historicoArray) ? historicoArray : []).reduce(
            (acc: number, curr: any) => acc + (Number(curr.quantidade_entregue) || 0), 
            0
          )

          if (Array.isArray(historicoArray)) {
            historicoArray.forEach((h: any) => {
              const numNf = String(h.numero_nf || '').toUpperCase()
              if (numNf.startsWith('PEDIDO:') || numNf.startsWith('DAV:') || numNf.includes('PROVISÓRIA') || numNf.includes('PROVISORIA')) {
                provisoriaList.push({
                  ...h,
                  item_descricao: it.descricao,
                  item_unidade: it.unidade,
                  item_quantidade: it.quantidade
                })
              }
            })
          }
          
          let saldoAtaPool = 0
          if (it.item_ata_id && poolAta.length > 0) {
            const desc = it.descricao.trim().toLowerCase()
            const pool = poolAta.filter(pa => pa.descricao.trim().toLowerCase() === desc)
            saldoAtaPool = pool.reduce((acc, curr) => acc + (Number(curr.quantidade_registrada) - (Number(curr.quantidade_abatida) || 0)), 0)
          }

          return {
            ...it,
            saldo_pendente: (it.quantidade || 0) - entregaTotal,
            saldo_ata_pool: it.item_ata_id ? saldoAtaPool : null
          }
        })
        setItensEmpenho(itensComSaldo as any[])
        setEntregasProvisorias(provisoriaList)
        setProvisoriaIdsSubstituir(provisoriaList.map(p => p.id))
      }
    }
    loadItems()
  }, [empenhoSelecionadoId, empenhosDisponiveis])

  // Estados memoizados para busca de NFs das Atas
  const filteredAtaNfs = useMemo(() => {
    const term = searchAtaNfInput.toLowerCase().trim()
    if (!term) return ataNfsDisponiveis
    return ataNfsDisponiveis.filter(nf => 
      String(nf.numero_nf || '').toLowerCase().includes(term) ||
      String(nf.venda_tipo || '').toLowerCase().includes(term)
    )
  }, [ataNfsDisponiveis, searchAtaNfInput])

  // Abre a busca de NFs já cadastradas nas ATAs que estão sem empenho
  const abrirBuscaNfAta = async () => {
    if (!user?.id) return
    setShowAtaNfSearchModal(true)
    setLoadingAtaNfs(true)
    try {
      let query = supabase
        .from('historico_entregas')
        .select('numero_nf, data_entrega, created_at, venda_tipo, vendedor_id, arquivo_nf_caminho, item_ata_id')
        .not('item_ata_id', 'is', null)
        .is('item_id', null)

      const hasFullVisibility = profile?.nivel === 'DEV' || profile?.nivel === 'SUP' || (profile?.nivel === 'ADM' && profile?.setor === 'EMPENHOS')
      if (!hasFullVisibility) {
        query = query.eq('vendedor_id', user.id)
      }

      const { data, error } = await query.order('created_at', { ascending: false })

      if (error) throw error

      if (data) {
        const uniqueNfs: Record<string, any> = {}
        data.forEach(row => {
          const nf = (row.numero_nf || '').trim()
          if (nf && !uniqueNfs[nf]) {
            uniqueNfs[nf] = {
              numero_nf: nf,
              data_emissao_nf: row.data_entrega || row.created_at,
              created_at: row.created_at,
              venda_tipo: row.venda_tipo,
              arquivo_nf_caminho: row.arquivo_nf_caminho
            }
          }
        })
        setAtaNfsDisponiveis(Object.values(uniqueNfs))
      }
    } catch (err) {
      console.error('Erro ao buscar NFs das Atas:', err)
      toast.error('Erro ao buscar Notas Fiscais das Atas.')
    } finally {
      setLoadingAtaNfs(false)
    }
  }

  // Carrega a NF selecionada da ATA na tela para fazer o vínculo visual
  const handleSelecionarNfAta = async (selectedNfNum: string) => {
    if (!user?.id) return
    setLoadingAtaNfs(true)
    try {
      let query = supabase
        .from('historico_entregas')
        .select(`
          id,
          quantidade_entregue,
          item_ata_id,
          numero_nf,
          data_entrega,
          created_at,
          arquivo_nf_caminho,
          itens_ata (
            descricao,
            unidade,
            valor_unitario
          )
        `)
        .eq('numero_nf', selectedNfNum)
        .is('item_id', null)

      const hasFullVisibility = profile?.nivel === 'DEV' || profile?.nivel === 'SUP' || (profile?.nivel === 'ADM' && profile?.setor === 'EMPENHOS')
      if (!hasFullVisibility) {
        query = query.eq('vendedor_id', user.id)
      }

      const { data: entregas, error } = await query

      if (error) throw error
      if (!entregas || entregas.length === 0) {
        toast.error('Nenhum faturamento pendente encontrado para esta NF.')
        return
      }

      const mappedItens = entregas.map(he => ({
        id: he.id,
        descricao: (he.itens_ata as any)?.descricao || 'Item da Ata',
        quantidade: he.quantidade_entregue,
        valor_unitario: (he.itens_ata as any)?.valor_unitario || 0,
        valor_total: he.quantidade_entregue * ((he.itens_ata as any)?.valor_unitario || 0),
        unidade: (he.itens_ata as any)?.unidade || 'UN',
        item_ata_id: he.item_ata_id,
        is_from_ata: true
      }))

      setItensNF(mappedItens)
      setNfNumero(selectedNfNum)
      const emissaoDate = entregas[0]?.data_entrega || entregas[0]?.created_at
      setNfDataEmissao(emissaoDate ? toInputDate(emissaoDate) : '')
      setArquivoNfExistenteCaminho(entregas[0]?.arquivo_nf_caminho || null)
      setIsExistingAtaNf(true)
      setNfArquivo(null)
      setShowAtaNfSearchModal(false)

      if (itensEmpenho.length > 0) {
        const novoMapeamento: Record<number, VinculoItem[]> = {}
        mappedItens.forEach((nfItem, idx) => {
          const matchingItem = itensEmpenho.find(ie => ie.item_ata_id === nfItem.item_ata_id)
          if (matchingItem) {
            novoMapeamento[idx] = [{ id: String(matchingItem.id), qtd: Number(nfItem.quantidade) || 0 }]
          }
        })
        setMapeamentoItens(novoMapeamento)
      }

      toast.success(`Nota Fiscal ${selectedNfNum} carregada!`)
    } catch (err) {
      console.error('Erro ao carregar detalhes da NF da Ata:', err)
      toast.error('Erro ao carregar detalhes da Nota Fiscal.')
    } finally {
      setLoadingAtaNfs(false)
    }
  }

  // Auxiliar para distribuir uma quantidade total convertida entre itens do empenho com a mesma descrição (pool)
  const distribuirQuantidadeNoPool = (descKey: string, totalQtd: number): VinculoItem[] => {
    const pool = itensEmpenho
      .filter(i => i.descricao.trim().toLowerCase() === descKey)
      .sort((a, b) => a.id - b.id)
    
    if (pool.length === 0) return []
    
    const vinculos: VinculoItem[] = []
    let restante = totalQtd
    
    for (let i = 0; i < pool.length; i++) {
      const item = pool[i]
      const saldo = Number((item as any).saldo_pendente) || 0
      
      if (i === pool.length - 1) {
        if (restante > 0 || vinculos.length === 0) {
          vinculos.push({ id: String(item.id), qtd: restante })
        }
      } else {
        const tomar = Math.max(0, Math.min(restante, saldo))
        if (tomar > 0) {
          vinculos.push({ id: String(item.id), qtd: tomar })
          restante -= tomar
        }
      }
    }
    return vinculos
  }

  // Auto-match quando itens do empenho ou da NF mudam
  // Gera VinculoItem[] compatível com o novo formato
  useEffect(() => {
    if (itensNF.length > 0 && itensEmpenho.length > 0) {
      const novoMapeamento: Record<number, VinculoItem[]> = { ...mapeamentoItens }
      let mudou = false
      
      itensNF.forEach((nfItem, idx) => {
        // Não sobrescreve vínculos já definidos pelo usuário
        if (novoMapeamento[idx] && novoMapeamento[idx].length > 0) return

        // Tenta casar primeiro por item_ata_id se for item vindo da ATA
        if (nfItem.item_ata_id) {
          const matchingItem = itensEmpenho.find(ie => ie.item_ata_id === nfItem.item_ata_id)
          if (matchingItem) {
            const rawQtd = Number(nfItem.quantidade) || 0
            const fator = fatoresConversao[idx] || 1
            const operacao = operacoesConversao[idx] || 'MULTIPLY'
            const qtdConvertida = operacao === 'MULTIPLY' ? rawQtd * fator : rawQtd / fator
            novoMapeamento[idx] = distribuirQuantidadeNoPool(matchingItem.descricao.trim().toLowerCase(), qtdConvertida)
            mudou = true
            return
          }
        }

        const nfDesc = String(nfItem.descricao || '').toLowerCase()
        const rawNfVal = Number(nfItem.valor_unitario) || 0
        const convertedNfVal = getValorUnitarioConvertidoNF(idx)
        
        const candidatosPorPreco = itensEmpenho.filter(ie => {
          const ieVal = Number(ie.valor_unitario) || 0
          if (ieVal <= 0) return false
          return Math.abs(convertedNfVal - ieVal) < 0.05 || Math.abs(rawNfVal - ieVal) < 0.05
        })

        if (candidatosPorPreco.length === 1) {
          const ie = candidatosPorPreco[0]
          const ieDesc = ie.descricao.toLowerCase()
          const nfWords = nfDesc.split(/\s+/).filter((w: string) => w.length >= 3)
          const ieWords = ieDesc.split(/\s+/).filter((w: string) => w.length >= 3)
          const intersection = nfWords.filter((w: string) => ieWords.includes(w))
          if (intersection.length >= 1 || ieDesc.includes(nfDesc) || nfDesc.includes(ieDesc)) {
            const rawQtd = Number(nfItem.quantidade) || 0
            const fator = fatoresConversao[idx] || 1
            const operacao = operacoesConversao[idx] || 'MULTIPLY'
            const qtdConvertida = operacao === 'MULTIPLY' ? rawQtd * fator : rawQtd / fator
            novoMapeamento[idx] = distribuirQuantidadeNoPool(ie.descricao.trim().toLowerCase(), qtdConvertida)
            mudou = true
            return
          }
        }

        if (candidatosPorPreco.length > 1) {
           let melhorMatch = null
           let maxIntersection = 0
           candidatosPorPreco.forEach(ie => {
              const ieDesc = ie.descricao.toLowerCase()
              const nfWords = nfDesc.split(/\s+/).filter((w: string) => w.length >= 3)
              const ieWords = ieDesc.split(/\s+/).filter((w: string) => w.length >= 3)
              const intersection = nfWords.filter((w: string) => ieWords.includes(w))
              if (intersection.length > maxIntersection) {
                maxIntersection = intersection.length
                melhorMatch = ie
              }
           })
           if (melhorMatch && maxIntersection >= 1) {
              const rawQtd = Number(nfItem.quantidade) || 0
              const fator = fatoresConversao[idx] || 1
              const operacao = operacoesConversao[idx] || 'MULTIPLY'
              const qtdConvertida = operacao === 'MULTIPLY' ? rawQtd * fator : rawQtd / fator
              novoMapeamento[idx] = distribuirQuantidadeNoPool((melhorMatch as any).descricao.trim().toLowerCase(), qtdConvertida)
              mudou = true
           }
        }
      })
      
      if (mudou) {
        setMapeamentoItens(novoMapeamento)
        toast.info('Itens mapeados automaticamente por nome e valor.')
      }
    }
  }, [itensNF, itensEmpenho])

  // Retorna os itens do empenho filtrados pela pesquisa, excluindo já vinculados na mesma linha
  const getFilteredItensEmpenho = (idxNF: number) => {
    const term = (searchVinculo[idxNF] || '').toLowerCase()
    const jaVinculados = (mapeamentoItens[idxNF] || []).map(v => v.id)
    return itensEmpenho.filter(ie => {
      if (jaVinculados.includes(String(ie.id))) return false
      if (!term) return true
      return ie.descricao.toLowerCase().includes(term) || String(ie.id).includes(term)
    })
  }

  // Valor unitário convertido de uma linha da NF considerando o fator de conversão (multiplicador/divisor)
  const getValorUnitarioConvertidoNF = (idx: number) => {
    const rawVal = Number(itensNF[idx]?.valor_unitario) || 0
    const fator = fatoresConversao[idx] !== undefined ? fatoresConversao[idx] : 1
    const operacao = operacoesConversao[idx] || 'MULTIPLY'
    if (fator <= 0) return rawVal
    return operacao === 'MULTIPLY' ? rawVal / fator : rawVal * fator
  }

  // Quantidade total que uma linha da NF vai abater (após fator de conversão e arredondamento)
  const getQtdConvertidaNF = (idx: number) => {
    const rawQtd = Number(itensNF[idx]?.quantidade) || 0
    const fator = fatoresConversao[idx] !== undefined ? fatoresConversao[idx] : 1
    const operacao = operacoesConversao[idx] || 'MULTIPLY'
    const mode = arredondamentoConversao[idx] || 'NONE'

    let val = operacao === 'MULTIPLY' ? rawQtd * fator : rawQtd / fator

    if (mode === 'ROUND') val = Math.round(val)
    else if (mode === 'FLOOR') val = Math.floor(val)
    else if (mode === 'CEIL') val = Math.ceil(val)

    return val
  }

  const handleUpdateConversao = (
    idx: number,
    novaOp: 'MULTIPLY' | 'DIVIDE',
    novoFator: number,
    novoMode: 'NONE' | 'ROUND' | 'FLOOR' | 'CEIL'
  ) => {
    setOperacoesConversao(prev => ({ ...prev, [idx]: novaOp }))
    setFatoresConversao(prev => ({ ...prev, [idx]: novoFator }))
    setArredondamentoConversao(prev => ({ ...prev, [idx]: novoMode }))

    const rawQtd = Number(itensNF[idx]?.quantidade) || 0
    let novaQtdTotal = novaOp === 'MULTIPLY' ? rawQtd * novoFator : rawQtd / novoFator
    if (novoMode === 'ROUND') novaQtdTotal = Math.round(novaQtdTotal)
    else if (novoMode === 'FLOOR') novaQtdTotal = Math.floor(novaQtdTotal)
    else if (novoMode === 'CEIL') novaQtdTotal = Math.ceil(novaQtdTotal)

    const firstVinculo = (mapeamentoItens[idx] || [])[0]
    if (firstVinculo) {
      const itemEmp = itensEmpenho.find(ie => String(ie.id) === firstVinculo.id)
      if (itemEmp) {
        const descKey = itemEmp.descricao.trim().toLowerCase()
        const novosVinculos = distribuirQuantidadeNoPool(descKey, novaQtdTotal)
        setMapeamentoItens(prev => ({
          ...prev,
          [idx]: novosVinculos
        }))
      }
    }
  }

  // Quantidade total já distribuída manualmente nos vínculos de uma linha da NF
  const getQtdDistribuida = (idx: number) => {
    return (mapeamentoItens[idx] || []).reduce((acc, v) => acc + (Number(v.qtd) || 0), 0)
  }

  function toInputDate(raw: string | undefined | null): string {
    if (!raw) return ''
    const s = raw.trim()
    // Já está em YYYY-MM-DD
    if (/^\d{4}-\d{2}-\d{2}$/.test(s)) return s
    // DD/MM/YYYY ou DD-MM-YYYY (com ano de 2 ou 4 dígitos)
    const brMatch = s.match(/^(\d{2})[\/\-](\d{2})[\/\-](\d{2,4})$/)
    if (brMatch) {
      const year = brMatch[3].length === 2 ? `20${brMatch[3]}` : brMatch[3]
      return `${year}-${brMatch[2]}-${brMatch[1]}`
    }
    // YYYY/MM/DD ou YYYY-MM-DD (cobre barra e hífen)
    const slashMatch = s.match(/^(\d{4})[\/\-](\d{2})[\/\-](\d{2})$/)
    if (slashMatch) return `${slashMatch[1]}-${slashMatch[2]}-${slashMatch[3]}`
    // Tenta via Date (fallback)
    const d = new Date(s)
    if (!isNaN(d.getTime())) return d.toISOString().split('T')[0]
    return ''
  }

  async function handleArquivoIA(e: React.ChangeEvent<HTMLInputElement>) {
    if (!e.target.files?.length) return
    const file = e.target.files[0]
    setLoadingIA(true)
    setProgress(10)
    setStatusLog('📄 Lendo e preparando a Nota Fiscal...')
    
    try {
      setStatusLog('🔍 Extraindo cabeçalho e dados gerais da NF...')
      const dados = await extrairDadosNF(file, itensEmpenho)
      setProgress(50)
      setStatusLog('🔗 Mapeando itens da NF com o empenho...')
      
      if(dados && dados.sucesso) {
          setNfNumero(dados.numero_nf || '')
          setNfDataEmissao(toInputDate(dados.data_emissao))
          setItensNF(dados.itens || [])
          setNfArquivo(file)
          
          // Mapeamento automático vindo da IA (por ID) → converte para formato {id, qtd}
          const novoMapeamento: Record<number, VinculoItem[]> = {}
          let mapeados = 0
          
          if (dados.itens) {
            dados.itens.forEach((nfItem: any, idx: number) => {
              if (nfItem.id_item_empenho) {
                const rawQtd = Number(nfItem.quantidade) || 0
                novoMapeamento[idx] = [{ id: String(nfItem.id_item_empenho), qtd: rawQtd }]
                mapeados++
              }
            })
          }

          setMapeamentoItens(novoMapeamento)

          if (dados.empenho_referencia) {
             const cleanRef = dados.empenho_referencia.trim().toLowerCase()
             const match = empenhosDisponiveis.find(e => String(e.numero_ne || '').toLowerCase().includes(cleanRef))
             if (match) {
                 setEmpenhoSelecionadoId(String(match.id))
                 toast.success(`Empenho #${match.numero_ne} detectado na NF!`)
             }
          }

          if (mapeados > 0) {
            toast.success(`${mapeados} itens mapeados automaticamente pela IA!`)
          } else {
            toast.success('Nota Fiscal lida com sucesso!')
          }
      } else {
          toast.error('Não foi possível identificar dados de uma Nota Fiscal.')
      }
    } catch(err) {
      toast.error('Erro na extração IA: ' + String(err))
    } finally {
      setLoadingIA(false)
      setProgress(0)
      setStatusLog('')
    }
  }

  const handleVisualizarPdf = () => {
    if (isExistingAtaNf && arquivoNfExistenteCaminho) {
      const url = getCleanPublicUrl(arquivoNfExistenteCaminho)
      window.open(url, '_blank')
    } else if (nfArquivo) {
      const url = URL.createObjectURL(nfArquivo)
      window.open(url, '_blank')
    } else {
      toast.error('Nenhum arquivo de Nota Fiscal disponível para visualização.')
    }
  }

  const aggregatedMappings = useMemo((): Array<{
    descKey: string
    idEmpenhoItem: string
    itemEmpenho: NotaItem & { saldo_pendente?: number; saldo_ata_pool?: number | null }
    totalQtd: number
    saldoOriginal: number
    novoSaldo: number
    poolIds: number[]
  }> => {
    const totalsPorId: Record<string, number> = {}

    Object.entries(mapeamentoItens).forEach(([, vinculos]) => {
      vinculos.forEach(v => {
        if (v.id && v.id !== 'none') {
          totalsPorId[v.id] = (totalsPorId[v.id] || 0) + (Number(v.qtd) || 0)
        }
      })
    })

    return Object.entries(totalsPorId).flatMap(([idEmpenhoItem, totalQtd]) => {
      const refItem = itensEmpenho.find(ie => String(ie.id) === idEmpenhoItem)
      if (!refItem) return []

      const descKey = refItem.descricao.trim().toLowerCase()
      const poolItems = itensEmpenho.filter(ie => ie.descricao.trim().toLowerCase() === descKey)
      const saldoTotalPool = poolItems.reduce((acc, curr) => acc + (Number((curr as any).saldo_pendente) || 0), 0)

      return [{
        descKey,
        idEmpenhoItem,
        itemEmpenho: refItem as any,
        totalQtd,
        saldoOriginal: saldoTotalPool,
        novoSaldo: Math.round(saldoTotalPool - totalQtd),
        poolIds: poolItems.map(i => i.id)
      }]
    })
  }, [mapeamentoItens, itensEmpenho])


  async function handleSalvar() {
    if (savingRef.current) return // bloqueia duplo clique imediatamente (síncrono)
    savingRef.current = true

    if (!empenhoSelecionadoId) {
      savingRef.current = false
      toast.error('Selecione o Empenho destino.')
      return
    }

    const temVinculo = Object.values(mapeamentoItens).some(vinculos => vinculos.length > 0)
    if (!temVinculo) {
      savingRef.current = false
      toast.error('Mapeie pelo menos um item da NF com um item do Empenho.')
      return
    }

    // Valida duplicidade da NF
    if (!isExistingAtaNf) {
      const checkResult = await verificarDuplicidadeNf(nfNumero)
      if (checkResult.exists) {
        savingRef.current = false
        const msg = checkResult.isLoose
          ? `A Nota Fiscal nº ${checkResult.numero_nf} já está cadastrada na Ata como venda direta. Use a opção "Buscar Nota Fiscal nas Atas" para vinculá-la.`
          : `A Nota Fiscal nº ${checkResult.numero_nf} já foi importada e vinculada no sistema anteriormente.`
        toast.error(msg)
        return
      }
    }

    // Valida justificativas para itens com saldo restante
    for (const agg of aggregatedMappings) {
      if (agg.novoSaldo > 0) {
        const cod = motivosCod[agg.idEmpenhoItem]
        if (!cod || cod === 'none') {
          savingRef.current = false
          toast.error(`Justificativa obrigatória (Entrega Parcial) no item: ${agg.itemEmpenho?.descricao.substring(0, 40)}...`)
          return
        }
      }
    }

    setSaving(true)
    try {
      let arquivoCaminho = null
      if (nfArquivo) {
        const fileName = `nf_baixas/${Date.now()}_${nfArquivo.name.replace(/[^a-zA-Z0-9.-]/g, '_')}`
        const { data } = await supabase.storage.from('documentos').upload(fileName, nfArquivo)
        if (data) arquivoCaminho = data.path
      }
      
      // const { data: { user } } = await supabase.auth.getUser()
      // const usuarioNome = user?.email || 'Sistema NF'

      // Saldos virtuais em memória para controle de transbordamento
      const virtualSaldosEmpenho: Record<number, number> = {}
      itensEmpenho.forEach(it => {
        virtualSaldosEmpenho[it.id] = Number((it as any).saldo_pendente) || 0
      })

      const virtualSaldosAta: Record<number, number> = {}
      itensPoolAta.forEach(it => {
        virtualSaldosAta[it.id] = Number(it.quantidade_registrada) - (Number(it.quantidade_abatida) || 0)
      })

      // Conjunto de IDs de entregas provisórias selecionadas pelo usuário para substituir/oficializar
      const pendingProvisoriaIds = new Set(provisoriaIdsSubstituir)

      // ─── 1. Registra históricos de entrega ─────────────────────────────────
      for (const [idxNFStr, vinculos] of Object.entries(mapeamentoItens)) {
        const idxNF = Number(idxNFStr)
        const itemNF = itensNF[idxNF]
        if (!itemNF || vinculos.length === 0) continue

        const fator = fatoresConversao[idxNF] || 1
        const operacao = operacoesConversao[idxNF] || 'MULTIPLY'
        const rawQtd = Number(itemNF.quantidade) || 0

        for (const vinculo of vinculos) {
          if (!vinculo.id || vinculo.id === 'none') continue

          const itemEmpenho = itensEmpenho.find(i => String(i.id) === vinculo.id)
          if (!itemEmpenho) continue

          // A quantidade a abater é a que o usuário definiu manualmente no vínculo
          // (já em unidade do empenho - o fator de conversão é aplicado na exibição)
          let qtdAbater = Number(vinculo.qtd) || 0
          if (qtdAbater <= 0) continue

          // Pool de itens com mesma descrição para transbordamento automático
          const descKey = itemEmpenho.descricao.trim().toLowerCase()
          const poolItems = itensEmpenho
            .filter(i => i.descricao.trim().toLowerCase() === descKey)
            .sort((a: any, b: any) => a.id - b.id)

          // Distribui pelo pool (lógica de transbordamento existente mantida)
          let qtdRestante = qtdAbater
          for (let i = 0; i < poolItems.length; i++) {
            const poolItem = poolItems[i]
            const saldoVirtual = virtualSaldosEmpenho[poolItem.id]
            
            if (i < poolItems.length - 1 && saldoVirtual <= 0) continue

            let qtdNesteItem = 0
            if (i === poolItems.length - 1) {
              qtdNesteItem = qtdRestante
            } else {
              qtdNesteItem = Math.min(qtdRestante, saldoVirtual)
            }
            if (qtdNesteItem <= 0) continue

            virtualSaldosEmpenho[poolItem.id] -= qtdNesteItem

            // Monta observação
            const agg = aggregatedMappings.find(a => a.idEmpenhoItem === String(poolItem.id) || a.descKey === descKey)
            const motivoCodItem = agg ? motivosCod[agg.idEmpenhoItem] : undefined
            const textoMotivo = agg ? (justificativas[agg.idEmpenhoItem] || '') : ''
            const motivoNome = motivoCodItem && motivoCodItem !== 'none' ? motivosPendencia[motivoCodItem as keyof typeof motivosPendencia] : ''

            let obsFinal = `Baixa via NF ${nfNumero}`.trim()
            if (fator !== 1) {
              const opSimbolo = operacao === 'MULTIPLY' ? '*' : '/'
              obsFinal += ` (Convertido de ${rawQtd} ${itemNF.unidade || 'UNID'} com fator ${opSimbolo} ${fator})`
            }
            if (agg && agg.novoSaldo > 0) {
              if (motivoCodItem === 'FATOR_CAIXA') {
                obsFinal = `[Fator Caixa] - Baixa parcial via NF ${nfNumero}`
              } else {
                obsFinal = `[${motivoNome}] ${textoMotivo} - Baixa via NF ${nfNumero}`.trim()
              }
              if (fator !== 1) {
                const opSimbolo = operacao === 'MULTIPLY' ? '*' : '/'
                obsFinal += ` (Convertido de ${rawQtd} ${itemNF.unidade || 'UNID'} com fator ${opSimbolo} ${fator})`
              }
            }

            // Se for uma NF vinda da ATA, atualizamos a linha existente
            if (isExistingAtaNf && itemNF.id) {
              if (i === 0) {
                const { error: errHist } = await supabase
                  .from('historico_entregas')
                  .update({
                    item_id: poolItem.id,
                    quantidade_entregue: qtdNesteItem,
                    data_entrega: itensPendentesEntrega ? null : new Date().toISOString(),
                    motivo_pendencia: obsFinal,
                    itens_entregues: !itensPendentesEntrega,
                    e_dia_d: isDiaD
                  })
                  .eq('id', itemNF.id)
                if (errHist) throw errHist
              } else {
                const { error: errHist } = await supabase.from('historico_entregas').insert([{
                  item_id: poolItem.id,
                  quantidade_entregue: qtdNesteItem,
                  data_entrega: itensPendentesEntrega ? null : new Date().toISOString(),
                  data_emissao_nf: nfDataEmissao || null,
                  motivo_pendencia: obsFinal,
                  numero_nf: nfNumero,
                  arquivo_nf_caminho: arquivoNfExistenteCaminho,
                  vendedor_id: user?.id,
                  item_ata_id: poolItem.item_ata_id,
                  itens_entregues: !itensPendentesEntrega,
                  venda_tipo: itemNF.venda_tipo || 'ATA',
                  e_dia_d: isDiaD
                }])
                if (errHist) throw errHist
              }
            } else {
              // Busca se existe uma entrega provisória selecionada correspondente a este item
              const provTarget = entregasProvisorias.find(p => pendingProvisoriaIds.has(p.id) && (p.item_id === poolItem.id || (p.item_descricao && p.item_descricao.trim().toLowerCase() === descKey)))

              if (provTarget) {
                // Oficializa a linha provisória existente ajustando para a quantidade da NF
                const motivoOriginal = provTarget.motivo_pendencia || ''
                const numProvOrig = provTarget.numero_nf || 'PEDIDO'
                const obsComVinculo = `${obsFinal} [PROVISORIO_ORIGEM: ${numProvOrig}|${motivoOriginal}]`

                const { error: errHist } = await supabase
                  .from('historico_entregas')
                  .update({
                    item_id: poolItem.id,
                    quantidade_entregue: qtdNesteItem,
                    numero_nf: nfNumero,
                    data_emissao_nf: nfDataEmissao || null,
                    arquivo_nf_caminho: arquivoCaminho || provTarget.arquivo_nf_caminho,
                    data_entrega: itensPendentesEntrega ? null : new Date().toISOString(),
                    motivo_pendencia: obsComVinculo,
                    itens_entregues: !itensPendentesEntrega,
                    e_dia_d: isDiaD
                  })
                  .eq('id', provTarget.id)

                if (errHist) throw errHist

                pendingProvisoriaIds.delete(provTarget.id)

                // Atualiza registros em pedidos_compra vinculados
                const { data: pedidosVinculados } = await supabase
                  .from('pedidos_compra')
                  .select('id, observacoes')
                  .eq('item_id', poolItem.id)

                if (pedidosVinculados && pedidosVinculados.length > 0) {
                  for (const p of pedidosVinculados) {
                    const obsCurrent = p.observacoes || ''
                    if (!obsCurrent.includes(`NF: ${nfNumero}`)) {
                      const obsUpd = `${obsCurrent} [Oficializado via NF: ${nfNumero}]`.trim()
                      await supabase
                        .from('pedidos_compra')
                        .update({ observacoes: obsUpd })
                        .eq('id', p.id)
                    }
                  }
                }

                await logAction('CONVERTER_PEDIDO_EM_NF', 'historico_entregas', provTarget.id, {
                  numero_nf_oficial: nfNumero,
                  numero_documento_provisorio: numProvOrig,
                  item_id: poolItem.id
                })
              } else {
                // Fluxo normal: Insere histórico novo
                const { error: errHist } = await supabase.from('historico_entregas').insert([{
                  item_id: poolItem.id,
                  quantidade_entregue: qtdNesteItem,
                  data_entrega: itensPendentesEntrega ? null : new Date().toISOString(),
                  data_emissao_nf: nfDataEmissao || null,
                  motivo_pendencia: obsFinal,
                  numero_nf: nfNumero,
                  arquivo_nf_caminho: arquivoCaminho,
                  vendedor_id: user?.id,
                  item_ata_id: poolItem.item_ata_id,
                  itens_entregues: !itensPendentesEntrega,
                  e_dia_d: isDiaD
                }])
                if (errHist) throw errHist
              }
            }

            // Abate ATA se vinculado (APENAS se NÃO for uma NF existente da ATA)
            if (!isExistingAtaNf && poolItem.item_ata_id && itensPoolAta.length > 0) {
              let qtdParaAbaterAta = qtdNesteItem
              const poolAta = itensPoolAta
                .filter(pa => pa.descricao.trim().toLowerCase() === descKey)
                .sort((a: any, b: any) => a.id - b.id)

              for (let j = 0; j < poolAta.length; j++) {
                const itemAta = poolAta[j]
                const saldoVirtualAta = virtualSaldosAta[itemAta.id]

                if (j < poolAta.length - 1 && saldoVirtualAta <= 0) continue

                let abaterAgora = 0
                if (j === poolAta.length - 1) abaterAgora = qtdParaAbaterAta
                else abaterAgora = Math.min(qtdParaAbaterAta, saldoVirtualAta)

                if (abaterAgora > 0) {
                  virtualSaldosAta[itemAta.id] -= abaterAgora
                  await supabase.rpc('incrementar_abatimento_ata', {
                    target_item_ata_id: itemAta.id,
                    qtd: abaterAgora
                  })
                }

                qtdParaAbaterAta -= abaterAgora
                if (qtdParaAbaterAta <= 0) break
              }
            }

            qtdRestante -= qtdNesteItem
            if (qtdRestante <= 0) break
          }
        }
      }

      // Oficializa qualquer outra provisória selecionada que não foi associada diretamente a uma linha mapeada
      if (pendingProvisoriaIds.size > 0) {
        for (const provId of Array.from(pendingProvisoriaIds)) {
          const prov = entregasProvisorias.find(p => p.id === provId)
          if (!prov) continue
          const motivoOriginal = prov.motivo_pendencia || ''
          const numProvOrig = prov.numero_nf || 'PEDIDO'
          const obsComVinculo = `[OFICIALIZADO VIA NF ${nfNumero}] ${motivoOriginal} [PROVISORIO_ORIGEM: ${numProvOrig}|${motivoOriginal}]`

          await supabase
            .from('historico_entregas')
            .update({
              numero_nf: nfNumero,
              data_emissao_nf: nfDataEmissao || null,
              arquivo_nf_caminho: arquivoCaminho || prov.arquivo_nf_caminho,
              data_entrega: itensPendentesEntrega ? null : new Date().toISOString(),
              motivo_pendencia: obsComVinculo,
              itens_entregues: !itensPendentesEntrega,
              e_dia_d: isDiaD
            })
            .eq('id', provId)

          await logAction('CONVERTER_PEDIDO_EM_NF', 'historico_entregas', provId, {
            numero_nf_oficial: nfNumero,
            numero_documento_provisorio: numProvOrig,
            item_id: prov.item_id
          })
        }
      }

      // ─── 2. Atualiza solicitações de compra e status por item ──────────────
      for (const agg of aggregatedMappings) {
        const poolItems = itensEmpenho
          .filter(i => i.descricao.trim().toLowerCase() === agg.descKey)
          .sort((a: any, b: any) => a.id - b.id)

        let totalAbatidoNoPool = agg.totalQtd

        for (const itemEmpenho of poolItems) {
          const saldoAnterior = Number((itemEmpenho as any).saldo_pendente) || 0
          const abatidoNesteItem = Math.min(totalAbatidoNoPool, saldoAnterior)
          const novoSaldoItem = saldoAnterior - abatidoNesteItem
          totalAbatidoNoPool -= abatidoNesteItem

          const { data: pedidosExistentes } = await supabase
            .from('pedidos_compra')
            .select('id, status')
            .eq('item_id', itemEmpenho.id)
            .neq('status', 'COMPRADO')
            .neq('status', 'ATENDIDO')

          const motivoCodItem = motivosCod[agg.idEmpenhoItem]
          // const textoMotivo = justificativas[agg.idEmpenhoItem] || ''
          // const prazoDiasStr = prazosSLA[agg.idEmpenhoItem] || '7'
          // const motivoNome = motivoCodItem && motivoCodItem !== 'none' ? motivosPendencia[motivoCodItem as keyof typeof motivosPendencia] : ''

          if (novoSaldoItem > 0 && motivoCodItem !== 'FATOR_CAIXA') {
            // DESABILITADO TEMPORARIAMENTE: Não criar/atualizar solicitações automáticas nas baixas parciais
            /*
            const dataLimite = new Date()
            dataLimite.setDate(dataLimite.getDate() + Number(prazoDiasStr))

            const payload = {
              item_id: Number(itemEmpenho.id),
              quantidade_solicitada: novoSaldoItem,
              usuario_solicitante: usuarioNome,
              observacoes: (`Logística Pool: [${motivoNome}] ${textoMotivo} - NF ${nfNumero}`).substring(0, 500),
              status: 'PENDENTE',
              prazo_limite: dataLimite.toISOString()
            }

            if (pedidosExistentes && pedidosExistentes.length > 0) {
              await supabase.from('pedidos_compra').update(payload).eq('id', pedidosExistentes[0].id)
              if (pedidosExistentes.length > 1) {
                const idsParaRemover = pedidosExistentes.slice(1).map(p => p.id)
                await supabase.from('pedidos_compra').delete().in('id', idsParaRemover)
              }
            } else {
              await supabase.from('pedidos_compra').insert([payload])
            }
            await supabase.from('itens').update({ status_item: 'SOLICITADO' }).eq('id', itemEmpenho.id)
            */
          } else if (novoSaldoItem <= 0 || motivoCodItem === 'FATOR_CAIXA') {
            if (pedidosExistentes && pedidosExistentes.length > 0) {
              const msg = motivoCodItem === 'FATOR_CAIXA' ? `Finalizado por Fator Caixa via NF ${nfNumero}` : `Pool atendido via NF ${nfNumero}`
              await supabase.from('pedidos_compra').update({ status: 'ATENDIDO', quantidade_solicitada: 0, observacoes: msg }).in('id', pedidosExistentes.map(p => p.id))
            }
            await supabase.from('itens').update({ status_item: 'ENTREGUE' }).eq('id', itemEmpenho.id)
          }
        }
      }

      // Atualiza status global do empenho
      if (empenhoSelecionadoId) {
        await refreshNotaStatus(Number(empenhoSelecionadoId))
      }

      // ─── Registra auditoria da Baixa por NF ─────────────────────────────────
      const empenhoRef = empenhosDisponiveis.find(e => String(e.id) === empenhoSelecionadoId)
      const itensMapeadosCount = Object.values(mapeamentoItens).filter(v => v.length > 0).length
      await logAction('BAIXA_NF', 'historico_entregas', empenhoSelecionadoId, {
        numero_ne: empenhoRef?.numero_ne || empenhoSelecionadoId,
        numero_nf: nfNumero || '(sem número)',
        data_emissao_nf: nfDataEmissao || null,
        itens_mapeados: itensMapeadosCount,
        empenho_id: Number(empenhoSelecionadoId),
      })

      toast.success('Baixa por NF concluída com sucesso!')
      resetForm()
      setShowSuccessModal(true)

    } catch (err: any) {
      toast.error('Erro na Baixa: ' + (err.message || String(err)))
    } finally {
      savingRef.current = false
      setSaving(false)
    }
  }

  // Adiciona um novo vínculo vazio a uma linha da NF
  const adicionarVinculo = (idxNF: number, idEmpenhoItem: string) => {
    const itemEmpenho = itensEmpenho.find(ie => String(ie.id) === idEmpenhoItem)
    if (!itemEmpenho) return

    // Sugestão de quantidade: saldo disponível do item
    const saldoDisp = Number((itemEmpenho as any).saldo_pendente) || 0
    const jaDistribuido = getQtdDistribuida(idxNF)
    const qtdNF = getQtdConvertidaNF(idxNF)
    const qtdSugerida = Math.min(saldoDisp, Math.max(0, qtdNF - jaDistribuido))

    setMapeamentoItens(prev => ({
      ...prev,
      [idxNF]: [...(prev[idxNF] || []), { id: idEmpenhoItem, qtd: qtdSugerida }]
    }))
    // Fecha o popover após adicionar
    setPopoverAberto(prev => ({ ...prev, [idxNF]: false }))
    setSearchVinculo(prev => ({ ...prev, [idxNF]: '' }))
  }

  const removerVinculo = (idxNF: number, idEmpenhoItem: string) => {
    setMapeamentoItens(prev => ({
      ...prev,
      [idxNF]: (prev[idxNF] || []).filter(v => v.id !== idEmpenhoItem)
    }))
  }

  const atualizarQtdVinculo = (idxNF: number, idEmpenhoItem: string, novaQtd: number) => {
    setMapeamentoItens(prev => ({
      ...prev,
      [idxNF]: (prev[idxNF] || []).map(v => v.id === idEmpenhoItem ? { ...v, qtd: novaQtd } : v)
    }))
  }

  // Verifica se há sobrebaixa em algum vínculo
  const hasOverDelivery = Object.entries(mapeamentoItens).some(([, vinculos]) => {
    return vinculos.some(v => {
      const itemEmp = itensEmpenho.find(ie => String(ie.id) === v.id)
      const saldo = Number((itemEmp as any)?.saldo_pendente) || 0
      return Number(v.qtd) > saldo
    })
  })

  return (
    <>
    <Card className="border-emerald-200 dark:border-emerald-900/50 shadow-xl overflow-hidden w-full">
        <CardHeader className="bg-emerald-50 dark:bg-emerald-950/20 border-b border-emerald-100 dark:border-emerald-900/50">
          <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <FileText className="w-5 h-5 text-emerald-600" />
                <CardTitle className="text-emerald-950 dark:text-emerald-100 font-bold">Leitura Inteligente de Nota Fiscal</CardTitle>
              </div>
              {onCancel && (
                  <Button variant="ghost" size="icon" onClick={onCancel} className="h-8 w-8 text-zinc-500 hover:text-zinc-900">
                    <X className="w-4 h-4" />
                  </Button>
              )}
          </div>
        </CardHeader>

        <CardContent className="p-6 space-y-8">
          <div 
            className={`p-6 rounded-xl border-2 border-dashed transition-all relative overflow-hidden space-y-4 ${
              isDragging ? 'border-emerald-500 bg-emerald-50 scale-[1.01]' : 'border-emerald-200 bg-emerald-50/50'
            }`}>
            
            <div className="flex items-center justify-between relative z-10">
              <div className="flex items-center gap-3">
                <div className={`p-2 rounded-lg ${isDragging ? 'bg-emerald-600 text-white animate-bounce' : 'bg-emerald-100 text-emerald-700'}`}>
                  <Sparkles className="w-5 h-5" />
                </div>
                <div>
                  <span className="font-bold block text-emerald-950 dark:text-emerald-100">Solte o PDF da NF-e aqui</span>
                  <span className="text-xs text-emerald-700/70">A IA irá extrair os itens fornecidos para baixa automática.</span>
                </div>
              </div>
              <div className="flex items-center gap-2">
                <Button
                  type="button"
                  onClick={abrirBuscaNfAta}
                  className="bg-amber-600 hover:bg-amber-700 text-white px-4 py-2 h-9 rounded-lg flex items-center gap-2 font-bold transition-all shadow-md shadow-amber-600/10 shrink-0"
                >
                  <Search className="w-4 h-4" />
                  Buscar nas NFs das Atas
                </Button>
                <Label htmlFor="nf-upload" className="bg-emerald-600 hover:bg-emerald-700 text-white px-4 py-2 h-9 rounded-lg cursor-pointer flex items-center gap-2 transition-shadow shadow-emerald-600/20 font-bold shrink-0">
                  {loadingIA ? <Loader2 className="w-4 h-4 animate-spin" /> : <Upload className="w-4 h-4" />}
                  {loadingIA ? 'Analisando...' : 'Procurar PDF'}
                  <input id="nf-upload" type="file" className="hidden" accept="application/pdf" onChange={handleArquivoIA} disabled={loadingIA} />
                </Label>
              </div>
            </div>
            {loadingIA && (
              <div className="space-y-1 relative z-10">
                <Progress value={progress} className="h-1.5 bg-emerald-100" />
                {statusLog && (
                  <p className="text-[11px] text-emerald-700/80 font-medium flex items-center gap-1.5 animate-pulse">
                    <span className="inline-block w-1.5 h-1.5 rounded-full bg-emerald-600 animate-ping" />
                    {statusLog}
                  </p>
                )}
              </div>
            )}
          </div>

          {nfDuplicada && (
            <div className="p-4 rounded-xl border border-red-200 dark:border-red-900/30 bg-red-50/50 dark:bg-red-950/10 flex items-start gap-3 text-sm text-red-800 dark:text-red-300 animate-in fade-in slide-in-from-top-2 duration-200">
              <AlertCircle className="w-5 h-5 text-red-600 dark:text-red-500 shrink-0 mt-0.5" />
              <div>
                <span className="font-bold block text-red-950 dark:text-red-400">Nota Fiscal já Importada!</span>
                <span className="block mt-0.5 text-xs">
                  {nfDuplicadaInfo?.isLoose 
                    ? `A Nota Fiscal nº ${nfNumero} já está cadastrada como venda direta (solta) na Ata. Use o botão "Buscar nas NFs das Atas" para vinculá-la a este empenho.` 
                    : `A Nota Fiscal nº ${nfNumero} já foi importada e vinculada ao sistema anteriormente.`}
                </span>
              </div>
            </div>
          )}

          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
             <div className="space-y-2">
                 <Label>Número da Nota Fiscal</Label>
                 <Input 
                   value={nfNumero} 
                   onChange={e => setNfNumero(e.target.value)} 
                   placeholder="000.000.000" 
                   className={nfDuplicada ? 'border-red-500 focus-visible:ring-red-500 text-red-950 dark:text-red-400 bg-red-50/20 dark:bg-red-950/5' : ''}
                 />
             </div>
             <div className="space-y-2">
                 <Label>Data de Emissão (NF)</Label>
                 <Input type="date" value={nfDataEmissao} onChange={e => setNfDataEmissao(e.target.value)} />
             </div>
             <div className="space-y-2">
                 <Label>Vincular ao Empenho/Ordem Destino</Label>
                 <Select value={empenhoSelecionadoId} onValueChange={setEmpenhoSelecionadoId}>
                     <SelectTrigger>
                         <SelectValue placeholder="Selecione o empenho destino" />
                     </SelectTrigger>
                     <SelectContent className="max-h-[400px]">
                          <div className="p-2 sticky top-0 bg-white dark:bg-zinc-950 z-10 border-b border-zinc-100 dark:border-zinc-800">
                            <div className="relative">
                              <Search className="absolute left-2 top-1/2 -translate-y-1/2 w-3 h-3 text-zinc-400" />
                              <Input 
                                placeholder="Filtrar empenhos/municípios..." 
                                value={searchEmpenhoInput}
                                onChange={e => setSearchEmpenhoInput(e.target.value)}
                                onKeyDown={(e) => e.stopPropagation()}
                                className="h-8 pl-7 text-xs"
                              />
                            </div>
                          </div>
                          {filteredEmpenhos.length === 0 ? (
                            <div className="p-4 text-center text-xs text-zinc-400 italic">
                              Nenhum empenho encontrado
                            </div>
                          ) : (
                            filteredEmpenhos.map(emp => {
                              const isConcluido = emp.status_geral === 'CONCLUIDO' || emp.status_geral === 'FATOR_CAIXA'
                              const isCancelado = emp.status_geral === 'CANCELADO'
                              return (
                                <SelectItem key={emp.id} value={String(emp.id)}>
                                    <span className={isConcluido || isCancelado ? 'opacity-60' : ''}>
                                      {emp.numero_ne || 'Empenho s/ número'} - {emp.entidades?.nome || emp.emissor || 'Órgão s/ nome'}{emp.numero_pedido ? ` (Pedido: ${emp.numero_pedido})` : ''}
                                    </span>
                                    {isConcluido && (
                                      <span className="ml-2 text-[9px] font-black uppercase text-emerald-700 bg-emerald-100 border border-emerald-200 px-1 py-0.5 rounded">
                                        já concluído
                                      </span>
                                    )}
                                    {isCancelado && (
                                      <span className="ml-2 text-[9px] font-black uppercase text-red-700 bg-red-100 border border-red-200 px-1 py-0.5 rounded">
                                        cancelado
                                      </span>
                                    )}
                                </SelectItem>
                              )
                            })
                          )}
                     </SelectContent>
                 </Select>
             </div>
          </div>

          {/* Opcão de Vínculo com NF da ATA foi removida em prol do fluxo de busca visual superior na parte superior da tela */}

          {/* Toggle de entrega física pendente */}
          <div className="p-4 rounded-xl border border-emerald-100 dark:border-emerald-900 bg-emerald-50/30 dark:bg-emerald-950/10 flex items-center justify-between gap-4">
              <div className="space-y-1">
                  <span className="text-xs font-bold text-emerald-950 dark:text-emerald-100 uppercase tracking-tight block">
                      Entrega Física Pendente
                  </span>
                  <span className="text-[11px] text-zinc-500 block">
                      Ative se a Nota Fiscal já foi emitida, mas a mercadoria física ainda não foi entregue ao cliente (ficará em aberto na logística).
                  </span>
              </div>
              <button
                  type="button"
                  onClick={() => setItensPendentesEntrega(!itensPendentesEntrega)}
                  className={`relative inline-flex h-6 w-11 flex-shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none ${
                      itensPendentesEntrega ? 'bg-amber-500' : 'bg-zinc-200 dark:bg-zinc-800'
                  }`}
              >
                  <span
                      className={`pointer-events-none inline-block h-5 w-5 transform rounded-full bg-white shadow ring-0 transition duration-200 ease-in-out ${
                          itensPendentesEntrega ? 'translate-x-5' : 'translate-x-0'
                      }`}
                  />
              </button>
          </div>

          {/* Toggle Dia D */}
          <div className="p-4 rounded-xl border border-amber-100 dark:border-amber-900 bg-amber-50/30 dark:bg-amber-950/10 flex items-center justify-between gap-4">
              <div className="space-y-1">
                  <span className="text-xs font-bold text-amber-950 dark:text-amber-100 uppercase tracking-tight block">
                      Dia D
                  </span>
                  <span className="text-[11px] text-zinc-500 block">
                      Ative esta marcação para indicar que a nota corresponde ao Dia D.
                  </span>
              </div>
              <button
                  type="button"
                  onClick={() => setIsDiaD(!isDiaD)}
                  className={`relative inline-flex h-6 w-11 flex-shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none ${
                      isDiaD ? 'bg-amber-500' : 'bg-zinc-200 dark:bg-zinc-800'
                  }`}
              >
                  <span
                      className={`pointer-events-none inline-block h-5 w-5 transform rounded-full bg-white shadow ring-0 transition duration-200 ease-in-out ${
                          isDiaD ? 'translate-x-5' : 'translate-x-0'
                      }`}
                  />
              </button>
          </div>

          {hasOverDelivery && (
              <div className="p-4 bg-amber-50 border border-amber-100 rounded-xl flex items-center gap-3 text-amber-800">
                  <AlertCircle className="w-5 h-5 flex-shrink-0" />
                  <div className="text-xs font-bold uppercase leading-tight">
                      Atenção: Existem vínculos com quantidade superior ao saldo restante no empenho. 
                      Isso será registrado como sobrebaixa (excesso).
                  </div>
              </div>
          )}

          {itensNF.length > 0 && (
              <div className="space-y-4">
                  {entregasProvisorias.length > 0 && (
                      <div className="p-4 bg-amber-50/70 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-800 rounded-xl space-y-3 shadow-sm">
                          <div className="flex items-center justify-between">
                              <div className="flex items-center gap-2">
                                  <div className="w-7 h-7 rounded-lg bg-amber-500 text-white flex items-center justify-center shrink-0">
                                      <RefreshCw className="w-4 h-4" />
                                  </div>
                                  <div>
                                      <h4 className="text-xs font-black uppercase tracking-wider text-amber-900 dark:text-amber-200">
                                          Baixas Provisórias por Pedido Encontradas ({entregasProvisorias.length})
                                      </h4>
                                      <p className="text-[11px] text-amber-700 dark:text-amber-300">
                                          Selecione as baixas provisórias deste empenho que deseja <strong>oficializar e substituir</strong> pelos dados desta Nota Fiscal. Os dados do Pedido continuarão registrados e vinculados à nova NF.
                                      </p>
                                  </div>
                              </div>
                              <Button
                                  type="button"
                                  variant="outline"
                                  size="sm"
                                  onClick={() => {
                                      if (provisoriaIdsSubstituir.length === entregasProvisorias.length) {
                                          setProvisoriaIdsSubstituir([])
                                      } else {
                                          setProvisoriaIdsSubstituir(entregasProvisorias.map(p => p.id))
                                      }
                                  }}
                                  className="text-[10px] font-bold uppercase tracking-wider text-amber-800 border-amber-300 hover:bg-amber-100 shrink-0"
                              >
                                  {provisoriaIdsSubstituir.length === entregasProvisorias.length ? 'Desmarcar Todos' : 'Selecionar Todos'}
                              </Button>
                          </div>

                          <div className="grid grid-cols-1 md:grid-cols-2 gap-2 pt-1">
                              {entregasProvisorias.map((prov) => {
                                  const isSelected = provisoriaIdsSubstituir.includes(prov.id)
                                  return (
                                      <label
                                          key={prov.id}
                                          className={cn(
                                              "flex items-start gap-3 p-3 rounded-lg border text-xs cursor-pointer transition-all select-none",
                                              isSelected 
                                                  ? "bg-white dark:bg-zinc-900 border-amber-500 shadow-md ring-1 ring-amber-500" 
                                                  : "bg-white/60 dark:bg-zinc-900/40 border-amber-200/80 hover:bg-white dark:hover:bg-zinc-900"
                                          )}
                                      >
                                          <input
                                              type="checkbox"
                                              checked={isSelected}
                                              onChange={(e) => {
                                                  if (e.target.checked) {
                                                      setProvisoriaIdsSubstituir(prev => [...prev, prov.id])
                                                  } else {
                                                      setProvisoriaIdsSubstituir(prev => prev.filter(id => id !== prov.id))
                                                  }
                                              }}
                                              className="mt-0.5 rounded border-amber-300 text-amber-600 focus:ring-amber-500 w-4 h-4"
                                          />
                                          <div className="space-y-0.5 flex-1 min-w-0">
                                              <div className="flex items-center justify-between gap-2">
                                                  <span className="font-mono font-bold text-amber-900 dark:text-amber-200 text-[11px] truncate">
                                                      {prov.numero_nf}
                                                  </span>
                                                  <span className="text-[10px] font-bold text-amber-700 bg-amber-100 dark:bg-amber-900/60 px-1.5 py-0.5 rounded">
                                                      {prov.quantidade_entregue} {prov.item_unidade || 'un'}
                                                  </span>
                                              </div>
                                              <p className="text-[11px] font-medium text-zinc-700 dark:text-zinc-300 truncate">
                                                  {prov.item_descricao}
                                              </p>
                                              <div className="text-[9px] text-zinc-500 flex items-center gap-2 pt-0.5">
                                                  <span>Data: {prov.data_entrega ? new Date(prov.data_entrega).toLocaleDateString('pt-BR') : '—'}</span>
                                                  <span>•</span>
                                                  <span className="truncate italic">{prov.motivo_pendencia || 'Baixa provisória por Pedido'}</span>
                                              </div>
                                          </div>
                                      </label>
                                  )
                              })}
                          </div>
                      </div>
                  )}
                  <div className="flex items-center justify-between text-emerald-800">
                      <div className="flex items-center gap-2">
                          <CheckCircle2 className="w-4 h-4" />
                          <span className="text-sm font-bold uppercase tracking-wider">Mapeamento de Baixa</span>
                      </div>
                      <div className="flex items-center gap-3">
                        {(arquivoNfExistenteCaminho || nfArquivo) && (
                          <Button
                            type="button"
                            variant="outline"
                            onClick={handleVisualizarPdf}
                            className="h-7 text-xs text-emerald-700 border-emerald-200 hover:bg-emerald-50 dark:hover:bg-emerald-950/20 font-bold uppercase gap-1"
                          >
                            <Eye className="w-3.5 h-3.5 text-rose-500" />
                            Visualizar PDF
                          </Button>
                        )}
                        <Button 
                          type="button"
                          variant="ghost" 
                          onClick={resetForm} 
                          className="h-7 text-xs text-rose-600 hover:text-rose-700 hover:bg-rose-50 dark:hover:bg-rose-950/20 font-bold uppercase gap-1"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                          Limpar NF
                        </Button>
                        <div className="relative">
                          <Search className="absolute left-2 top-1/2 -translate-y-1/2 w-3 h-3 text-zinc-400" />
                          <Input
                            placeholder="Filtrar itens do empenho..."
                            value={searchItemInput}
                            onChange={e => setSearchItemInput(e.target.value)}
                            className="h-7 pl-7 text-xs w-48"
                          />
                        </div>
                        <div className="bg-emerald-100 text-emerald-800 text-xs px-2.5 py-1 rounded-full font-bold shadow-sm">
                            {itensNF.length} {itensNF.length === 1 ? 'item importado' : 'itens importados'}
                        </div>
                      </div>
                  </div>

                  {/* Legenda */}
                  <div className="flex items-center gap-4 text-[10px] text-zinc-500 bg-zinc-50 dark:bg-zinc-900/50 px-3 py-2 rounded-lg border border-zinc-100 dark:border-zinc-800">
                    <span className="flex items-center gap-1.5"><Link2 className="w-3 h-3 text-emerald-600" /> Use o botão <strong className="text-emerald-700">+ Vincular</strong> para ligar um item da NF a um ou mais itens do empenho</span>
                    <span className="text-zinc-300">|</span>
                    <span>Informe manualmente a quantidade a baixar em cada vínculo</span>
                  </div>

                  <div className="border rounded-xl overflow-hidden shadow-sm">
                    <Table>
                      <TableHeader className="bg-emerald-50 dark:bg-emerald-950/30 sticky top-0 z-20">
                        <TableRow>
                          <TableHead className="w-[26%]">Produto na NF-e</TableHead>
                          <TableHead className="w-[9%] text-right font-bold">Qtd NF</TableHead>
                          <TableHead className="w-[20%] font-bold">Conversão</TableHead>
                          <TableHead className="w-[45%]">Vínculos ao Empenho</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {itensNF.map((item, idx) => {
                          const vinculos = mapeamentoItens[idx] || []
                          const qtdNF = getQtdConvertidaNF(idx)
                          const qtdDistribuida = getQtdDistribuida(idx)
                          const qtdRestanteDistribuir = qtdNF - qtdDistribuida
                          const tudo_distribuido = Math.abs(qtdRestanteDistribuir) < 0.001
                          const fator = fatoresConversao[idx] !== undefined ? fatoresConversao[idx] : 1
                          const operacao = operacoesConversao[idx] || 'MULTIPLY'
                          const mode = arredondamentoConversao[idx] || 'NONE'

                          return (
                            <TableRow key={idx} className={vinculos.length === 0 ? 'bg-zinc-50/50' : ''}>
                              {/* Coluna: Produto na NF */}
                              <TableCell
                                className={`text-xs font-medium py-3 cursor-pointer transition-all align-top ${expandedDescIds.has(idx) ? 'whitespace-normal' : 'max-w-[180px] truncate'}`}
                                onClick={() => toggleDesc(idx)}
                                title={expandedDescIds.has(idx) ? "Clique para encolher" : "Clique para ver completo"}
                              >
                                <span className="text-zinc-400 font-bold mr-2 text-[11px]">#{idx + 1}</span>
                                {item.is_from_ata && (
                                  <span className="text-[9px] font-bold text-amber-700 bg-amber-100 border border-amber-200 px-1.5 py-0.5 rounded mr-1.5 uppercase tracking-wide">
                                    Ata
                                  </span>
                                )}
                                {item.codigo ? <span className="text-[10px] bg-zinc-100 dark:bg-zinc-800 px-1 py-0.5 rounded mr-1 font-mono">{item.codigo}</span> : null}
                                {item.descricao}
                              </TableCell>

                              {/* Coluna: Qtd NF */}
                              <TableCell className="text-right font-bold text-emerald-700 align-top py-3">
                                {item.quantidade} <span className="text-[9px] text-zinc-400 font-normal">{item.unidade}</span>
                              </TableCell>

                              {/* Coluna: Conversão */}
                              <TableCell className="align-top py-3">
                                {(() => {
                                  const rawQtd = Number(item.quantidade) || 0
                                  const rawCalculated = operacao === 'MULTIPLY' ? rawQtd * fator : rawQtd / fator

                                  return (
                                    <div className="flex flex-col gap-1.5 min-w-[140px]">
                                      <div className="flex items-center gap-1">
                                        <select 
                                          value={operacao} 
                                          onChange={e => handleUpdateConversao(idx, e.target.value as 'MULTIPLY' | 'DIVIDE', fator, mode)}
                                          className="h-7 text-xs border rounded px-1 bg-white dark:bg-zinc-900 font-bold"
                                        >
                                          <option value="MULTIPLY">*</option>
                                          <option value="DIVIDE">/</option>
                                        </select>
                                        <input 
                                          type="number" 
                                          value={fator} 
                                          onChange={e => {
                                            const val = parseFloat(e.target.value)
                                            const novoFator = isNaN(val) || val <= 0 ? 1 : val
                                            handleUpdateConversao(idx, operacao, novoFator, mode)
                                          }}
                                          className="w-14 h-7 text-xs border rounded px-1 text-center bg-white dark:bg-zinc-900 font-bold"
                                          min="0.0001"
                                          step="any"
                                        />
                                        <span className="text-[11px] text-zinc-700 dark:text-zinc-300 font-black whitespace-nowrap">
                                          = {qtdNF % 1 === 0 ? qtdNF.toFixed(0) : qtdNF.toFixed(2)}
                                        </span>
                                      </div>

                                      {/* Seletor de Arredondamento */}
                                      <div className="flex items-center gap-1">
                                        <span className="text-[9px] text-zinc-400 font-bold uppercase">Arred.:</span>
                                        <select
                                          value={mode}
                                          onChange={e => handleUpdateConversao(idx, operacao, fator, e.target.value as any)}
                                          className={`h-6 text-[10px] border rounded px-1 font-bold transition-colors ${mode !== 'NONE' ? 'bg-amber-50 border-amber-300 text-amber-800 dark:bg-amber-950/40 dark:text-amber-300' : 'bg-white dark:bg-zinc-900 text-zinc-500 border-zinc-200 dark:border-zinc-700'}`}
                                          title="Escolha a regra de arredondamento para a quantidade convertida"
                                        >
                                          <option value="NONE">Sem Arred. ({rawCalculated.toFixed(2)})</option>
                                          <option value="ROUND">Matemático ({Math.round(rawCalculated)})</option>
                                          <option value="FLOOR">Para Baixo ({Math.floor(rawCalculated)})</option>
                                          <option value="CEIL">Para Cima ({Math.ceil(rawCalculated)})</option>
                                        </select>
                                      </div>

                                      {mode !== 'NONE' && (
                                        <span className="text-[9px] font-bold text-amber-700 dark:text-amber-400 bg-amber-50 dark:bg-amber-950/40 border border-amber-200 dark:border-amber-900/40 px-1.5 py-0.5 rounded w-fit flex items-center gap-1">
                                          📐 {mode === 'ROUND' ? 'Arred. Matemático' : mode === 'FLOOR' ? 'Arred. p/ Baixo' : 'Arred. p/ Cima'} ({rawCalculated.toFixed(2)} → {qtdNF})
                                        </span>
                                      )}

                                      {/* Exibição do Valor Unitário Convertido pelo Fator */}
                                      {(() => {
                                        const rawVal = Number(item.valor_unitario) || 0
                                        const convertedVal = getValorUnitarioConvertidoNF(idx)
                                        if (rawVal > 0) {
                                          return (
                                            <div className={`text-[9px] font-semibold p-1 rounded border mt-1 ${fator !== 1 ? 'bg-emerald-50/80 text-emerald-800 border-emerald-200 dark:bg-emerald-950/40 dark:text-emerald-300 dark:border-emerald-800' : 'bg-zinc-50 text-zinc-600 border-zinc-200 dark:bg-zinc-900 dark:text-zinc-400 dark:border-zinc-800'}`}>
                                              Val. Unit.: <span className="font-bold font-mono text-[10px]">R$ {convertedVal.toFixed(2)}</span>
                                              {fator !== 1 && (
                                                <span className="text-[8px] opacity-75 block">
                                                  (orig. R$ {rawVal.toFixed(2)} {operacao === 'MULTIPLY' ? '÷' : '×'} {fator})
                                                </span>
                                              )}
                                            </div>
                                          )
                                        }
                                        return null
                                      })()}
                                    </div>
                                  )
                                })()}
                              </TableCell>

                              {/* Coluna: Vínculos */}
                              <TableCell className="align-top py-3">
                                <div className="space-y-2">
                                  {/* Vínculos existentes */}
                                  {vinculos.map((vinculo) => {
                                    const itemEmp = itensEmpenho.find(ie => String(ie.id) === vinculo.id)
                                    if (!itemEmp) return null
                                    const saldo = Number((itemEmp as any).saldo_pendente) || 0
                                    const sobrebaixa = Number(vinculo.qtd) > saldo

                                    const empVal = Number(itemEmp.valor_unitario) || 0
                                    const convertedNfVal = getValorUnitarioConvertidoNF(idx)
                                    const temDivergenciaPreco = empVal > 0 && convertedNfVal > 0 && Math.abs(convertedNfVal - empVal) > 0.01

                                    return (
                                      <div key={vinculo.id} className={`flex flex-col gap-1 p-2 rounded-lg border transition-all ${sobrebaixa || temDivergenciaPreco ? 'bg-amber-50/80 border-amber-300 dark:bg-amber-950/30 dark:border-amber-800' : 'bg-emerald-50/50 border-emerald-100 dark:bg-emerald-950/10 dark:border-emerald-900/50'}`}>
                                        <div className="flex items-center gap-2">
                                          <div className="flex-1 min-w-0">
                                            <p className="text-[10px] font-bold text-zinc-700 dark:text-zinc-300 whitespace-normal break-words" title={itemEmp.descricao}>
                                              {itemEmp.descricao}
                                            </p>
                                            <p className="text-[9px] text-zinc-400">
                                              Saldo disp.: <span className={`font-bold ${sobrebaixa ? 'text-amber-600' : 'text-blue-600'}`}>{saldo.toFixed(0)}</span>
                                              {sobrebaixa && <span className="ml-1 text-amber-600 font-bold">⚠ Sobrebaixa</span>}
                                            </p>
                                          </div>
                                          <div className="flex items-center gap-1.5 flex-shrink-0">
                                            <span className="text-[10px] text-zinc-500 font-medium">Qtd:</span>
                                            <input
                                              type="number"
                                              value={vinculo.qtd}
                                              min={0}
                                              step="any"
                                              onChange={e => atualizarQtdVinculo(idx, vinculo.id, parseFloat(e.target.value) || 0)}
                                              className={`w-20 h-7 text-xs border rounded px-2 text-right font-bold bg-white dark:bg-zinc-900 focus:ring-2 focus:outline-none transition-all ${sobrebaixa ? 'border-amber-400 focus:ring-amber-400/30' : 'border-emerald-200 focus:ring-emerald-400/30'}`}
                                            />
                                            <Button
                                              variant="ghost"
                                              size="icon"
                                              onClick={() => removerVinculo(idx, vinculo.id)}
                                              className="h-7 w-7 text-red-400 hover:text-red-600 hover:bg-red-50 dark:hover:bg-red-950/20"
                                              title="Remover vínculo"
                                            >
                                              <Trash2 className="w-3 h-3" />
                                            </Button>
                                          </div>
                                        </div>

                                        {/* Alerta de Divergência de Valor Unitário */}
                                        {temDivergenciaPreco && (
                                          <div className="flex items-center gap-1.5 text-[9px] font-bold text-amber-800 dark:text-amber-300 bg-amber-100 dark:bg-amber-900/60 border border-amber-300 dark:border-amber-700 px-2 py-0.5 rounded shadow-xs">
                                            <AlertTriangle className="w-3.5 h-3.5 text-amber-600 dark:text-amber-400 flex-shrink-0" />
                                            <span>
                                              ⚠️ Divergência de Preço: NF R$ {convertedNfVal.toFixed(2)} vs Empenho R$ {empVal.toFixed(2)}
                                              <span className="ml-1 opacity-80">(dif: {convertedNfVal > empVal ? '+' : ''}R$ {(convertedNfVal - empVal).toFixed(2)})</span>
                                            </span>
                                          </div>
                                        )}
                                      </div>
                                    )
                                  })}

                                  {/* Indicador de quantidade distribuída */}
                                  {vinculos.length > 0 && (
                                    <div className={`flex flex-wrap items-center justify-between gap-1.5 text-[10px] px-2 py-1 rounded ${tudo_distribuido ? 'text-emerald-700 bg-emerald-50/60 dark:bg-emerald-950/30' : 'text-amber-800 bg-amber-50/60 dark:bg-amber-950/30 border border-amber-200/60'}`}>
                                      {tudo_distribuido ? (
                                        <span className="flex items-center gap-1 font-bold">
                                          <CheckCircle2 className="w-3 h-3 text-emerald-600" /> Total distribuído: {qtdDistribuida % 1 === 0 ? qtdDistribuida.toFixed(0) : qtdDistribuida.toFixed(2)}
                                        </span>
                                      ) : (
                                        <>
                                          <span className="flex items-center gap-1 font-bold">
                                            <AlertCircle className="w-3 h-3 text-amber-600" /> Distribuído: {qtdDistribuida % 1 === 0 ? qtdDistribuida.toFixed(0) : qtdDistribuida.toFixed(2)} / {qtdNF % 1 === 0 ? qtdNF.toFixed(0) : qtdNF.toFixed(2)} — Restam: {qtdRestanteDistribuir.toFixed(2)}
                                          </span>
                                          <button
                                            type="button"
                                            onClick={() => {
                                              const sugestaoMode = qtdRestanteDistribuir > 0 ? 'FLOOR' : 'CEIL'
                                              handleUpdateConversao(idx, operacao, fator, sugestaoMode)
                                            }}
                                            className="text-[9px] font-bold text-amber-800 bg-amber-200 hover:bg-amber-300 border border-amber-300 px-1.5 py-0.5 rounded transition-colors shadow-sm whitespace-nowrap"
                                            title="Arredondar quantidade da NF para igualar à quantidade inteira distribuída"
                                          >
                                            📐 Arredondar NF p/ {qtdRestanteDistribuir > 0 ? Math.floor(qtdNF) : Math.ceil(qtdNF)}
                                          </button>
                                        </>
                                      )}
                                    </div>
                                  )}

                                  {/* Popover para adicionar novo vínculo */}
                                  <Popover open={popoverAberto[idx] || false} onOpenChange={(open) => setPopoverAberto(prev => ({ ...prev, [idx]: open }))}>
                                    <PopoverTrigger asChild>
                                      <Button
                                        variant="outline"
                                        size="sm"
                                        className="h-7 text-[11px] gap-1.5 border-dashed border-emerald-300 text-emerald-700 hover:bg-emerald-50 dark:hover:bg-emerald-950/20 w-full"
                                      >
                                        <Plus className="w-3 h-3" />
                                        {vinculos.length === 0 ? 'Vincular a item do empenho...' : 'Adicionar outro vínculo...'}
                                      </Button>

                                    </PopoverTrigger>
                                    <PopoverContent className="w-[380px] p-0" align="start">
                                      <div className="p-2 border-b sticky top-0 bg-white dark:bg-zinc-950 z-10">
                                        <div className="relative">
                                          <Search className="absolute left-2 top-1/2 -translate-y-1/2 w-3 h-3 text-zinc-400" />
                                          <Input
                                            placeholder="Pesquisar item do empenho..."
                                            value={searchVinculo[idx] || ''}
                                            onChange={e => setSearchVinculo(prev => ({ ...prev, [idx]: e.target.value }))}
                                            className="h-8 pl-7 text-xs"
                                            autoFocus
                                          />
                                        </div>
                                      </div>
                                      <div className="max-h-[280px] overflow-y-auto">
                                        {getFilteredItensEmpenho(idx).length === 0 ? (
                                          <div className="p-4 text-center text-xs text-zinc-400 italic">
                                            {itensEmpenho.length === 0 ? 'Selecione um empenho primeiro.' : 'Nenhum item encontrado.'}
                                          </div>
                                        ) : (
                                          getFilteredItensEmpenho(idx).map(ie => {
                                            const saldo = Number((ie as any).saldo_pendente) || 0
                                            const saldoAta = (ie as any).saldo_ata_pool
                                            const empVal = Number(ie.valor_unitario) || 0
                                            const convertedNfVal = getValorUnitarioConvertidoNF(idx)
                                            const matchPreco = empVal > 0 && convertedNfVal > 0 && Math.abs(convertedNfVal - empVal) <= 0.01

                                            return (
                                              <button
                                                key={ie.id}
                                                onClick={() => adicionarVinculo(idx, String(ie.id))}
                                                className="w-full text-left px-3 py-2.5 hover:bg-emerald-50 dark:hover:bg-emerald-950/20 border-b border-zinc-50 dark:border-zinc-900 last:border-0 transition-colors group"
                                              >
                                                <p className="text-xs font-medium text-zinc-800 dark:text-zinc-200 group-hover:text-emerald-700 leading-snug">{ie.descricao}</p>
                                                <div className="flex items-center gap-3 mt-1">
                                                  <span className="text-[9px] text-blue-600 font-bold">Saldo empenho: {saldo.toFixed(0)} {ie.unidade || 'UN'}</span>
                                                  {saldoAta !== null && (
                                                    <span className="text-[9px] text-zinc-400">ATA: {Number(saldoAta).toFixed(0)}</span>
                                                  )}
                                                  {empVal > 0 && (
                                                    <span className={`text-[9px] font-bold ml-auto px-1.5 py-0.5 rounded border ${matchPreco ? 'text-emerald-700 bg-emerald-50 border-emerald-200 dark:bg-emerald-950/40 dark:text-emerald-300 dark:border-emerald-800' : 'text-amber-700 bg-amber-50 border-amber-200 dark:bg-amber-950/40 dark:text-amber-300 dark:border-amber-800'}`}>
                                                      {matchPreco ? '✓ Preço Igual: ' : '⚠️ '}R$ {empVal.toFixed(2)}
                                                    </span>
                                                  )}
                                                </div>
                                              </button>
                                            )
                                          })
                                        )}
                                      </div>
                                    </PopoverContent>
                                  </Popover>
                                </div>
                              </TableCell>
                            </TableRow>
                          )
                        })}
                      </TableBody>
                    </Table>
                  </div>

                  {/* Seção de justificativas para itens com saldo restante */}
                  {aggregatedMappings.some(agg => agg.novoSaldo > 0) && (
                      <div className="space-y-4 pt-4 border-t border-dashed border-emerald-100">
                          <div className="flex items-center gap-2 text-amber-700">
                              <AlertCircle className="w-5 h-5" />
                              <span className="text-sm font-bold uppercase tracking-wider">Justificativas Necessárias (Pendências de Entrega)</span>
                          </div>
                          
                          <div className="grid gap-4">
                              {aggregatedMappings.filter(agg => agg.novoSaldo > 0).map((agg) => (
                                  <div key={agg.idEmpenhoItem} className="flex flex-col gap-2.5 p-4 rounded-xl border shadow-sm relative transition-all border-amber-300 dark:border-amber-700 bg-gradient-to-r from-amber-50 to-transparent dark:from-amber-950/20">
                                      <div className="absolute left-0 top-0 bottom-0 w-1.5 bg-amber-500 rounded-l-xl shadow-sm" />
                                      <div className="flex justify-between items-start gap-4 mb-1 w-full min-w-0">
                                          <span className="text-xs font-bold text-amber-900 dark:text-amber-100 whitespace-normal break-words flex-1 min-w-0">
                                              Item: {agg.itemEmpenho?.descricao}
                                          </span>
                                          <span className="text-[10px] font-black bg-amber-200 dark:bg-amber-800 text-amber-800 dark:text-amber-100 px-2 py-0.5 rounded-full uppercase tracking-tighter whitespace-nowrap">
                                              Faltam: {agg.novoSaldo} un
                                          </span>
                                      </div>
                                      
                                      <div className="grid grid-cols-1 md:grid-cols-12 gap-3">
                                          <div className="md:col-span-5">
                                              <Select value={motivosCod[agg.idEmpenhoItem] || 'none'} onValueChange={v => setMotivosCod(p => ({...p, [agg.idEmpenhoItem]: v}))}>
                                                  <SelectTrigger className={`h-9 text-xs font-medium border-amber-200 dark:bg-zinc-900 ${!motivosCod[agg.idEmpenhoItem] || motivosCod[agg.idEmpenhoItem]==='none' ? 'ring-2 ring-red-400 outline-none' : ''}`}>
                                                      <SelectValue placeholder="Selecione o motivo..." />
                                                  </SelectTrigger>
                                                  <SelectContent>
                                                      <SelectItem value="none" disabled>-- Qual é o motivo da falta? --</SelectItem>
                                                      {Object.entries(motivosPendencia).map(([k, v]) => (
                                                          <SelectItem key={k} value={k}>{v}</SelectItem>
                                                      ))}
                                                  </SelectContent>
                                              </Select>
                                          </div>
                                          <div className="md:col-span-7">
                                              <Input 
                                                  placeholder="Detalhe o motivo do atraso (opcional)..." 
                                                  value={justificativas[agg.idEmpenhoItem] || ''} 
                                                  onChange={e => setJustificativas(p => ({...p, [agg.idEmpenhoItem]: e.target.value}))}
                                                  className="h-9 text-xs font-medium border-amber-200 dark:bg-zinc-900"
                                              />
                                          </div>
                                      </div>
                                  </div>
                              ))}
                          </div>
                      </div>
                  )}
              </div>
          )}

          <div className="flex justify-end pt-4 border-t gap-3">
              <Button 
                onClick={handleSalvar} 
                className="bg-emerald-600 hover:bg-emerald-700 text-white font-bold h-11 px-10 shadow-lg shadow-emerald-600/20"
                disabled={
                    saving || 
                    nfDuplicada ||
                    !empenhoSelecionadoId || 
                    !Object.values(mapeamentoItens).some(v => v.length > 0)
                }
              >
                  {saving ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : <Save className="w-4 h-4 mr-2" />}
                  PROCESSAR BAIXA EM LOTE
              </Button>
          </div>
        </CardContent>
    </Card>

    <Dialog open={showSuccessModal} onOpenChange={setShowSuccessModal}>
        <DialogContent className="sm:max-w-[480px]">
          <DialogHeader className="items-center">
            <PackageCheck className="w-12 h-12 text-emerald-500 mb-2" />
            <DialogTitle>Baixa de NF Concluída!</DialogTitle>
            <DialogDescription>A quantidade foi abatida do empenho com sucesso.</DialogDescription>
          </DialogHeader>
          <div className="grid gap-3 mt-4">
            <Button className="bg-emerald-600 hover:bg-emerald-700 h-12 text-white font-bold" onClick={() => { setShowSuccessModal(false); if(onSuccess) onSuccess(); }}>
                📦 Ir para Módulo Logística
            </Button>
            <Button variant="outline" className="h-12 font-medium" onClick={() => { 
                setShowSuccessModal(false)
                setNfArquivo(null)
                setNfNumero('')
                setNfDataEmissao('')
                setItensNF([])
                setMapeamentoItens({})
                setEmpenhoSelecionadoId('')
                setItensEmpenho([])
                setItensPendentesEntrega(false)
            }}>
                ➕ Nova Baixa de NF
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      {isDragging && (
        <div 
          onDragOver={(e) => { e.preventDefault(); e.stopPropagation(); }}
          onDragLeave={(e) => { e.preventDefault(); e.stopPropagation(); setIsDragging(false); }}
          onDrop={(e) => {
            e.preventDefault();
            e.stopPropagation();
            setIsDragging(false);
            
            const files = e.dataTransfer.files;
            if (files && files.length > 0) {
              const file = files[0];
              if (file.type === 'application/pdf' || file.name.toLowerCase().endsWith('.pdf')) {
                const fakeEvent = { target: { files: [file] } } as unknown as React.ChangeEvent<HTMLInputElement>;
                handleArquivoIA(fakeEvent);
              } else {
                toast.error('Por favor, arraste apenas arquivos PDF.');
              }
            }
          }}
          className="fixed inset-0 z-[9999] flex flex-col items-center justify-center bg-zinc-950/65 backdrop-blur-md border-4 border-dashed border-emerald-500 m-4 rounded-2xl animate-in fade-in zoom-in duration-200"
        >
          <div className="pointer-events-none bg-zinc-900/90 border border-zinc-800 p-8 rounded-2xl max-w-md w-full mx-4 text-center space-y-6 shadow-2xl animate-in zoom-in-95 duration-300">
            <div className="mx-auto w-20 h-20 bg-emerald-500/15 border-2 border-emerald-500/30 rounded-full flex items-center justify-center text-emerald-500 animate-pulse">
              <FileText className="w-10 h-10" />
            </div>
            <div className="space-y-2">
              <h3 className="text-xl font-bold text-white tracking-tight">Leitura de Nota Fiscal por IA</h3>
              <p className="text-sm text-zinc-400">
                Solte a Nota Fiscal PDF da Venda Direta em qualquer lugar da tela para que o Nexus realize a baixa de saldo na Ata
              </p>
            </div>
            <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full bg-emerald-500/10 border border-emerald-500/25 text-xs font-semibold text-emerald-500 tracking-wide uppercase">
              <Upload className="w-3.5 h-3.5" /> Apenas arquivos PDF
            </div>
          </div>
        </div>
      )}

      {/* Modal de Busca de NF nas Atas */}
      <Dialog open={showAtaNfSearchModal} onOpenChange={setShowAtaNfSearchModal}>
        <DialogContent className="sm:max-w-[700px] max-h-[85vh] flex flex-col bg-white dark:bg-zinc-950 border border-zinc-200 dark:border-zinc-800">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-zinc-900 dark:text-zinc-100 font-black uppercase tracking-tight text-sm">
              <Search className="w-5 h-5 text-amber-500" />
              Buscar Nota Fiscal nas Atas
            </DialogTitle>
            <DialogDescription className="text-xs text-zinc-400">
              Selecione uma Nota Fiscal de venda direta que foi lançada na ATA pelo portal do vendedor para vincular e dar baixa automática neste empenho.
            </DialogDescription>
          </DialogHeader>

          <div className="py-2 flex-shrink-0">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-zinc-400" />
              <Input
                placeholder="Buscar por número da NF, cliente ou tipo..."
                value={searchAtaNfInput}
                onChange={e => setSearchAtaNfInput(e.target.value)}
                className="pl-9 h-10 text-xs"
              />
            </div>
          </div>

          <div className="flex-1 overflow-y-auto min-h-[300px] border border-zinc-100 dark:border-zinc-800 rounded-xl">
            {loadingAtaNfs ? (
              <div className="h-full flex flex-col items-center justify-center gap-2 text-zinc-400 py-12">
                <Loader2 className="w-6 h-6 animate-spin text-amber-500" />
                <span className="text-xs font-bold">Buscando Notas Fiscais...</span>
              </div>
            ) : filteredAtaNfs.length === 0 ? (
              <div className="h-full flex flex-col items-center justify-center gap-2 text-zinc-400 py-12">
                <AlertCircle className="w-8 h-8 text-zinc-300" />
                <span className="text-xs italic font-medium">Nenhuma Nota Fiscal livre encontrada nas Atas.</span>
              </div>
            ) : (
              <Table>
                <TableHeader className="bg-zinc-50 dark:bg-zinc-900 sticky top-0 z-10">
                  <TableRow>
                    <TableHead className="w-[30%] font-bold text-[10px] uppercase tracking-wider">Número da NF</TableHead>
                    <TableHead className="w-[35%] font-bold text-[10px] uppercase tracking-wider">Data de Emissão</TableHead>
                    <TableHead className="w-[20%] font-bold text-[10px] uppercase tracking-wider">Tipo</TableHead>
                    <TableHead className="w-[15%] text-right font-bold text-[10px] uppercase tracking-wider">Ação</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filteredAtaNfs.map(nf => (
                    <TableRow key={nf.numero_nf} className="hover:bg-zinc-50 dark:hover:bg-zinc-900/50">
                      <TableCell className="font-bold text-xs text-zinc-900 dark:text-zinc-100 py-3 flex items-center gap-2">
                        <FileText className="w-4 h-4 text-amber-500" />
                        <span>NF {nf.numero_nf}</span>
                        {nf.arquivo_nf_caminho && (
                          <a
                            href={getCleanPublicUrl(nf.arquivo_nf_caminho)}
                            target="_blank"
                            rel="noopener noreferrer"
                            onClick={(e) => e.stopPropagation()}
                            className="text-rose-600 hover:text-rose-700 font-bold text-[9px] bg-rose-50 dark:bg-rose-950/20 border border-rose-100 dark:border-rose-900/40 px-1.5 py-0.5 rounded-md flex items-center gap-1 transition-all hover:scale-105 active:scale-95 select-none"
                            title="Visualizar PDF original"
                          >
                            <Eye className="w-3 h-3 text-rose-500" /> PDF
                          </a>
                        )}
                      </TableCell>
                      <TableCell className="text-xs text-zinc-500 py-3">
                        {new Date(nf.data_emissao_nf).toLocaleDateString('pt-BR')}
                      </TableCell>
                      <TableCell className="py-3">
                        <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-amber-50 text-amber-700 dark:bg-amber-950/20 dark:text-amber-400 border border-amber-100 dark:border-amber-900/40 uppercase">
                          {nf.venda_tipo || 'Venda ATA'}
                        </span>
                      </TableCell>
                      <TableCell className="text-right py-3">
                        <Button
                          type="button"
                          onClick={() => handleSelecionarNfAta(nf.numero_nf)}
                          className="h-7 text-[10px] font-bold uppercase bg-amber-600 hover:bg-amber-700 text-white gap-1 px-2.5"
                        >
                          Selecionar
                        </Button>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}
          </div>
        </DialogContent>
      </Dialog>
    </>
  )
}
