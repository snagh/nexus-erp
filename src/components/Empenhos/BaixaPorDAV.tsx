import { useState, useEffect, useMemo, useRef } from 'react'
import { useLocation } from 'react-router-dom'
import { supabase } from '../../lib/supabase'
import { extrairDadosPedido } from '../../aiService'
import { useAuth } from '../../AuthContext'
import { motivosPendencia } from '../../lib/utils'
import { refreshNotaStatus } from '../../lib/supabaseHelpers'
import { logAction } from '../../lib/logger'
import { toast } from 'sonner'
import { 
  Sparkles, 
  Upload, 
  Save,
  Loader2,
  CheckCircle2,
  X,
  AlertCircle,
  PackageCheck,
  ClipboardList,
  Search,
  AlertTriangle,
  Clock,
  Trash2,
  Plus
} from 'lucide-react'

import { Card, CardContent, CardHeader, CardTitle } from '../ui/card'
import { Input } from '../ui/input'
import { Button } from '../ui/button'
import { Label } from '../ui/label'
import { Progress } from '../ui/progress'
import { Badge } from '../ui/badge'
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
import { Popover, PopoverTrigger, PopoverContent } from '../ui/popover'
import type { Tables } from '../../supabaseTypes'

interface VinculoItem {
  id: string
  qtd: number
}

interface BaixaPorDAVProps {
  onSuccess?: () => void
  onCancel?: () => void
}

type NotaItem = Tables<'itens'>

export function BaixaPorDAV({ onSuccess, onCancel }: BaixaPorDAVProps) {
  const [empenhosDisponiveis, setEmpenhosDisponiveis] = useState<any[]>([])
  const [empenhoSelecionadoId, setEmpenhoSelecionadoId] = useState<string>('')
  const [itensEmpenho, setItensEmpenho] = useState<NotaItem[]>([])
  
  const [davArquivo, setDavArquivo] = useState<File | null>(null)
  const [davNumero, setDavNumero] = useState('')
  const [davDataEmissao, setDavDataEmissao] = useState('')
  const [itensDAV, setItensDAV] = useState<any[]>([])
  
  // Estrutura de vínculos múltiplos igual ao Baixa por NF
  const [mapeamentoItens, setMapeamentoItens] = useState<Record<number, VinculoItem[]>>({})
  const [popoverAberto, setPopoverAberto] = useState<Record<number, boolean>>({})
  const [searchVinculo, setSearchVinculo] = useState<Record<number, string>>({})

  const [motivosCod, setMotivosCod] = useState<Record<string, string>>({})
  const [justificativas, setJustificativas] = useState<Record<string, string>>({})

  // Fatores de conversão de unidade (por índice de item do Pedido)
  const [fatoresConversao, setFatoresConversao] = useState<Record<number, number>>({})
  const [operacoesConversao, setOperacoesConversao] = useState<Record<number, 'MULTIPLY' | 'DIVIDE'>>({})
  const [arredondamentoConversao, setArredondamentoConversao] = useState<Record<number, 'NONE' | 'ROUND' | 'FLOOR' | 'CEIL'>>({})

  // Valor unitário convertido de uma linha do Pedido considerando o fator de conversão (multiplicador/divisor)
  const getValorUnitarioConvertidoDAV = (idx: number) => {
    const rawVal = Number(itensDAV[idx]?.valor_unitario) || 0
    const fator = fatoresConversao[idx] !== undefined ? fatoresConversao[idx] : 1
    const operacao = operacoesConversao[idx] || 'MULTIPLY'
    if (fator <= 0) return rawVal
    return operacao === 'MULTIPLY' ? rawVal / fator : rawVal * fator
  }

  // Quantidade total que uma linha do Pedido vai abater (após fator de conversão e arredondamento)
  const getQtdConvertidaDAV = (idx: number) => {
    const rawQtd = Number(itensDAV[idx]?.quantidade) || 0
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
  }

  // Retorna os itens do empenho filtrados pela pesquisa, excluindo já vinculados na mesma linha
  const getFilteredItensEmpenho = (idxDAV: number) => {
    const term = (searchVinculo[idxDAV] || '').toLowerCase()
    const jaVinculados = (mapeamentoItens[idxDAV] || []).map(v => v.id)
    return itensEmpenho.filter(ie => {
      if (jaVinculados.includes(String(ie.id))) return false
      if (!term) return true
      return ie.descricao.toLowerCase().includes(term) || String(ie.id).includes(term)
    })
  }

  // Quantidade total já distribuída manualmente nos vínculos de uma linha do DAV
  const getQtdDistribuida = (idx: number) => {
    return (mapeamentoItens[idx] || []).reduce((acc, v) => acc + (Number(v.qtd) || 0), 0)
  }

  // Adiciona um novo vínculo vazio a uma linha do DAV
  const adicionarVinculo = (idxDAV: number, idEmpenhoItem: string) => {
    const itemEmpenho = itensEmpenho.find(ie => String(ie.id) === idEmpenhoItem)
    if (!itemEmpenho) return

    // Sugestão de quantidade: saldo disponível do item
    const saldoDisp = Number((itemEmpenho as any).saldo_pendente) || 0
    const jaDistribuido = getQtdDistribuida(idxDAV)
    const qtdDAV = getQtdConvertidaDAV(idxDAV)
    const qtdSugerida = Math.min(saldoDisp, Math.max(0, qtdDAV - jaDistribuido))

    setMapeamentoItens(prev => ({
      ...prev,
      [idxDAV]: [...(prev[idxDAV] || []), { id: idEmpenhoItem, qtd: qtdSugerida }]
    }))
    // Fecha o popover após adicionar
    setPopoverAberto(prev => ({ ...prev, [idxDAV]: false }))
    setSearchVinculo(prev => ({ ...prev, [idxDAV]: '' }))
  }

  const removerVinculo = (idxDAV: number, idEmpenhoItem: string) => {
    setMapeamentoItens(prev => ({
      ...prev,
      [idxDAV]: (prev[idxDAV] || []).filter(v => v.id !== idEmpenhoItem)
    }))
  }

  const atualizarQtdVinculo = (idxDAV: number, idEmpenhoItem: string, novaQtd: number) => {
    setMapeamentoItens(prev => ({
      ...prev,
      [idxDAV]: (prev[idxDAV] || []).map(v => v.id === idEmpenhoItem ? { ...v, qtd: novaQtd } : v)
    }))
  }

  // Cálculo agregado das baixas por item do empenho
  const aggregatedMappings = useMemo(() => {
    const totals: Record<string, number> = {}
    
    Object.entries(mapeamentoItens).forEach(([_, vinculos]) => {
      if (Array.isArray(vinculos)) {
        vinculos.forEach(v => {
          if (v.id && v.id !== 'none') {
            totals[v.id] = (totals[v.id] || 0) + (Number(v.qtd) || 0)
          }
        })
      }
    })

    return Object.entries(totals).map(([idEmpenhoItem, totalQtd]) => {
      const itemEmpenho = itensEmpenho.find(ie => String(ie.id) === idEmpenhoItem)
      const saldoOriginal = Number((itemEmpenho as any)?.saldo_pendente) || 0
      return {
        idEmpenhoItem,
        itemEmpenho,
        totalQtd,
        saldoOriginal,
        novoSaldo: Math.round(saldoOriginal - totalQtd)
      }
    }).filter(agg => agg.itemEmpenho)
  }, [mapeamentoItens, itensDAV, itensEmpenho])

  const [isDragging, setIsDragging] = useState(false)

  const [loadingIA, setLoadingIA] = useState(false)
  const [progress, setProgress] = useState(0)
  const [saving, setSaving] = useState(false)
  const savingRef = useRef(false) // trava síncrona contra duplo clique
  const [showSuccessModal, setShowSuccessModal] = useState(false)
  const [expandedDescIds, setExpandedDescIds] = useState<Set<number>>(new Set())
  const [searchEmpenhoInput, setSearchEmpenhoInput] = useState('')

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
    setDavArquivo(null)
    setDavNumero('')
    setDavDataEmissao('')
    setItensDAV([])
    setMapeamentoItens({})
    setPopoverAberto({})
    setSearchVinculo({})
    setFatoresConversao({})
    setOperacoesConversao({})
    setArredondamentoConversao({})
    setMotivosCod({})
    setJustificativas({})
    setEmpenhoSelecionadoId('')
    setSearchEmpenhoInput('')
    setProgress(0)
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
      const { data } = await supabase
        .from('itens')
        .select('*, historico_entregas(quantidade_entregue)')
        .eq('nota_id', Number(empenhoSelecionadoId))
      
      if (data) {
        const itensComSaldo = data.map(it => {
          const historicoArray = (it.historico_entregas as any) || []
          const entregaTotal = (Array.isArray(historicoArray) ? historicoArray : []).reduce(
            (acc: number, curr: any) => acc + (Number(curr.quantidade_entregue) || 0), 
            0
          )
          return {
            ...it,
            saldo_pendente: (it.quantidade || 0) - entregaTotal
          }
        })
        setItensEmpenho(itensComSaldo as any[])
      }
    }
    loadItems()
  }, [empenhoSelecionadoId])

  // Auto-mapeamento por similaridade/código/preço
  useEffect(() => {
    if (itensDAV.length > 0 && itensEmpenho.length > 0) {
      const novoMapeamento = { ...mapeamentoItens }
      let mudou = false
      let mapeadosCount = 0

      itensDAV.forEach((davItem, idx) => {
        if (novoMapeamento[idx] && novoMapeamento[idx].length > 0) return

        const davDesc = String(davItem.descricao || '').trim().toLowerCase()
        const davCod = String(davItem.codigo_produto || davItem.codigo || '').trim().toLowerCase()
        const rawDavVal = Number(davItem.valor_unitario) || 0
        const convertedDavVal = getValorUnitarioConvertidoDAV(idx)

        // 1. Tentar por código de produto
        if (davCod && davCod.length >= 2) {
          const matchCod = itensEmpenho.find(ie => 
            String((ie as any).codigo_item || ie.id || '').trim().toLowerCase() === davCod ||
            String((ie as any).codigo_catalogo || '').trim().toLowerCase() === davCod
          )
          if (matchCod) {
            novoMapeamento[idx] = [{ id: String(matchCod.id), qtd: getQtdConvertidaDAV(idx) }]
            mudou = true
            mapeadosCount++
            return
          }
        }

        // 2. Tentar por valor unitário próximo (+- R$ 0.05) + interseção de palavras
        const candidatosPreco = itensEmpenho.filter(ie => {
          const ieVal = Number(ie.valor_unitario) || 0
          if (ieVal <= 0) return false
          return Math.abs(convertedDavVal - ieVal) < 0.05 || Math.abs(rawDavVal - ieVal) < 0.05
        })
        if (candidatosPreco.length === 1) {
          const ie = candidatosPreco[0]
          const ieDesc = String(ie.descricao || '').toLowerCase()
          const davWords = davDesc.split(/\s+/).filter(w => w.length >= 3)
          const ieWords = ieDesc.split(/\s+/).filter(w => w.length >= 3)
          const intersection = davWords.filter(w => ieWords.includes(w))
          if (intersection.length >= 1 || ieDesc.includes(davDesc) || davDesc.includes(ieDesc)) {
            novoMapeamento[idx] = [{ id: String(ie.id), qtd: getQtdConvertidaDAV(idx) }]
            mudou = true
            mapeadosCount++
            return
          }
        } else if (candidatosPreco.length > 1) {
          let melhorMatch = null
          let maxInter = 0
          candidatosPreco.forEach(ie => {
            const ieDesc = String(ie.descricao || '').toLowerCase()
            const davWords = davDesc.split(/\s+/).filter(w => w.length >= 3)
            const ieWords = ieDesc.split(/\s+/).filter(w => w.length >= 3)
            const inter = davWords.filter(w => ieWords.includes(w)).length
            if (inter > maxInter) {
              maxInter = inter
              melhorMatch = ie
            }
          })
          if (melhorMatch && maxInter >= 1) {
            novoMapeamento[idx] = [{ id: String((melhorMatch as any).id), qtd: getQtdConvertidaDAV(idx) }]
            mudou = true
            mapeadosCount++
            return
          }
        }

        // 3. Tentar por cruzamento de palavras-chave do fármaco/produto
        let melhorMatchGen = null
        let maxWordsMatch = 0
        const davWordsClean = davDesc.split(/[\s,\.\/\-\(\)]+/).filter(w => w.length >= 3 && !['comprido', 'caixa', 'frasco', 'ampola', 'solucao', 'gotas', 'gen'].includes(w))

        itensEmpenho.forEach(ie => {
          const ieDesc = String(ie.descricao || '').toLowerCase()
          const ieWords = ieDesc.split(/[\s,\.\/\-\(\)]+/).filter(w => w.length >= 3)
          const inter = davWordsClean.filter(w => ieWords.includes(w)).length

          if (inter > maxWordsMatch) {
            maxWordsMatch = inter
            melhorMatchGen = ie
          }
        })

        if (melhorMatchGen && maxWordsMatch >= 1) {
          novoMapeamento[idx] = [{ id: String((melhorMatchGen as any).id), qtd: getQtdConvertidaDAV(idx) }]
          mudou = true
          mapeadosCount++
          return
        }

        // 4. Inclusão direta de substring
        const matchSubstring = itensEmpenho.find(ie => {
          const descEmp = String(ie.descricao || '').toLowerCase()
          return davDesc.includes(descEmp) || descEmp.includes(davDesc)
        })
        if (matchSubstring) {
          novoMapeamento[idx] = [{ id: String(matchSubstring.id), qtd: getQtdConvertidaDAV(idx) }]
          mudou = true
          mapeadosCount++
        }
      })

      if (mudou) {
        setMapeamentoItens(novoMapeamento)
        if (mapeadosCount > 0) {
          toast.info(`${mapeadosCount} item(ns) do pedido pré-vinculado(s) ao empenho.`)
        }
      }
    }
  }, [itensDAV, itensEmpenho])

  function toInputDate(raw: string | undefined | null): string {
    if (!raw) return ''
    const s = raw.trim()
    if (/^\d{4}-\d{2}-\d{2}$/.test(s)) return s
    const brMatch = s.match(/^(\d{2})[\/\-](\d{2})[\/\-](\d{2,4})$/)
    if (brMatch) {
      const year = brMatch[3].length === 2 ? `20${brMatch[3]}` : brMatch[3]
      return `${year}-${brMatch[2]}-${brMatch[1]}`
    }
    const slashMatch = s.match(/^(\d{4})[\/\-](\d{2})[\/\-](\d{2})$/)
    if (slashMatch) return `${slashMatch[1]}-${slashMatch[2]}-${slashMatch[3]}`
    const d = new Date(s)
    if (!isNaN(d.getTime())) return d.toISOString().split('T')[0]
    return ''
  }

  async function handleArquivoIA(e: React.ChangeEvent<HTMLInputElement>) {
    if (!e.target.files?.length) return
    const file = e.target.files[0]
    setLoadingIA(true)
    setProgress(10)
    
    try {
      const dados = await extrairDadosPedido(file)
      setProgress(50)
      
      if (dados && dados.sucesso) {
          setDavNumero(dados.numero_pedido || dados.numero_dav || '')
          setDavDataEmissao(toInputDate(dados.data_emissao))
          setItensDAV(dados.itens || [])
          setDavArquivo(file)
          
          if (dados.numero_empenho_referencia) {
             const rawRef = dados.numero_empenho_referencia
             const numbersFound = rawRef.match(/\d+/g) || []
             let match = null

             for (const numStr of numbersFound) {
                if (numStr.length >= 3 && numStr !== '2026' && numStr !== '2025' && numStr !== '2024') {
                    match = empenhosDisponiveis.find(e => 
                        String(e.numero_ne || '').toLowerCase().includes(numStr) ||
                        String((e as any).numero_pedido || '').toLowerCase().includes(numStr)
                    )
                    if (match) break
                }
             }

             if (!match) {
                 const cleanRef = rawRef.trim().toLowerCase()
                 match = empenhosDisponiveis.find(e => String(e.numero_ne || '').toLowerCase().includes(cleanRef))
             }

             if (match) {
                 setEmpenhoSelecionadoId(String(match.id))
                 toast.success(`Empenho #${match.numero_ne} detectado no Pedido!`)
             }
          }
          toast.success('Pedido/Reserva lido com sucesso!')
      } else {
          toast.error('Não foi possível identificar dados de um Pedido.')
      }
    } catch(err) {
      toast.error('Erro na extração IA: ' + String(err))
    } finally {
      setLoadingIA(false)
      setProgress(0)
    }
  }

  async function handleSalvar() {
      if (savingRef.current) return
      savingRef.current = true

      if (!empenhoSelecionadoId) {
          savingRef.current = false
          toast.error('Selecione o Empenho destino.')
          return
      }
      
      const temVinculo = Object.values(mapeamentoItens).some(vinculos => Array.isArray(vinculos) && vinculos.length > 0)
      if (!temVinculo) {
          savingRef.current = false
          toast.error('Mapeie pelo menos um item do Pedido com um item do Empenho.')
          return
      }

      for (const agg of aggregatedMappings) {
          if (agg.novoSaldo > 0) {
              const cod = motivosCod[agg.idEmpenhoItem]
              if (!cod || cod === 'none') {
                  savingRef.current = false
                  toast.error(`Justificativa obrigatória (Entrega Parcial) no item: ${agg.itemEmpenho?.descricao.substring(0, 30)}...`)
                  return
              }
          }
      }

      setSaving(true)
      try {
          let arquivoCaminho = null
          if (davArquivo) {
              const fileName = `pedido_baixas/${Date.now()}_${davArquivo.name.replace(/[^a-zA-Z0-9.-]/g, '_')}`
              const { data } = await supabase.storage.from('documentos').upload(fileName, davArquivo)
              if (data) arquivoCaminho = data.path
          }

          for (const [idxDAVStr, vinculos] of Object.entries(mapeamentoItens)) {
              const idxDAVNum = Number(idxDAVStr)
              const itemDAV = itensDAV[idxDAVNum]
              if (!itemDAV || !vinculos || vinculos.length === 0) continue

              const rawQtd = Number(itemDAV.quantidade) || 0
              const fator = fatoresConversao[idxDAVNum] !== undefined ? fatoresConversao[idxDAVNum] : 1
              const operacao = operacoesConversao[idxDAVNum] || 'MULTIPLY'
              const opSimbolo = operacao === 'MULTIPLY' ? '*' : '/'

              for (const vinculo of vinculos) {
                  const idEmpenhoItem = vinculo.id
                  const itemEmpenho = itensEmpenho.find(i => String(i.id) === idEmpenhoItem)
                  if (!itemEmpenho) continue

                  const qtdAbater = Number(vinculo.qtd) || 0
                  if (qtdAbater <= 0) continue

                  const agg = aggregatedMappings.find(a => a.idEmpenhoItem === idEmpenhoItem)
                  const motivoCodItem = motivosCod[idEmpenhoItem]
                  const textoMotivo = justificativas[idEmpenhoItem] || ''
                  const motivoNome = motivoCodItem && motivoCodItem !== 'none' ? motivosPendencia[motivoCodItem as keyof typeof motivosPendencia] : ''
                  
                  let obsFinal = `Baixa Provisória via Pedido ${davNumero}`.trim()
                  if (agg && agg.novoSaldo > 0) {
                      if (motivoCodItem === 'FATOR_CAIXA') {
                          obsFinal = `[Fator Caixa] - Baixa parcial provisória via Pedido ${davNumero}`
                      } else {
                          obsFinal = `[${motivoNome}] ${textoMotivo} - Baixa provisória via Pedido ${davNumero}`.trim()
                      }
                  }

                  if (fator !== 1) {
                      obsFinal += ` (Convertido de ${rawQtd} ${itemDAV.unidade_medida || 'UNID'} com fator ${opSimbolo} ${fator})`
                  }

                  const { error: errHist } = await supabase.from('historico_entregas').insert([{
                      item_id: itemEmpenho.id,
                      quantidade_entregue: qtdAbater,
                      data_entrega: new Date().toISOString(),
                      motivo_pendencia: obsFinal,
                      numero_nf: `PEDIDO: ${davNumero} (Provisória)`,
                      arquivo_nf_caminho: arquivoCaminho,
                      vendedor_id: user?.id
                  }])
                  
                  if (errHist) throw errHist

                  if (itemEmpenho.item_ata_id) {
                     await supabase.rpc('incrementar_abatimento_ata', {
                          target_item_ata_id: itemEmpenho.item_ata_id,
                          qtd: qtdAbater
                      })
                  }
              }
          }

          for (const agg of aggregatedMappings) {
              const itemEmpenho = agg.itemEmpenho
              if (!itemEmpenho) continue

              const { data: pedidosExistentes } = await supabase
                  .from('pedidos_compra')
                  .select('id, status')
                  .eq('item_id', itemEmpenho.id)
                  .neq('status', 'COMPRADO')
                  .neq('status', 'ATENDIDO')

              const motivoCodItem = motivosCod[agg.idEmpenhoItem]

              if (agg.novoSaldo <= 0 || motivoCodItem === 'FATOR_CAIXA') {
                  if (pedidosExistentes && pedidosExistentes.length > 0) {
                      const msg = motivoCodItem === 'FATOR_CAIXA' ? `Finalizado por Fator Caixa via Pedido ${davNumero}` : `Atendido provisoriamente via Pedido ${davNumero}`
                      await supabase.from('pedidos_compra').update({ status: 'ATENDIDO', quantidade_solicitada: 0, observacoes: msg }).in('id', pedidosExistentes.map(p => p.id))
                  }
                  await supabase.from('itens').update({ status_item: 'ENTREGUE' }).eq('id', itemEmpenho.id)
              }
          }

          if (empenhoSelecionadoId) {
              await refreshNotaStatus(Number(empenhoSelecionadoId))
          }

          // Auditoria
          const empenhoRef = empenhosDisponiveis.find(e => String(e.id) === empenhoSelecionadoId)
          const itensMapeadosCount = Object.values(mapeamentoItens).filter(v => Array.isArray(v) && v.length > 0).length
          await logAction('BAIXA_DAV', 'historico_entregas', empenhoSelecionadoId, {
            numero_ne: empenhoRef?.numero_ne || empenhoSelecionadoId,
            numero_dav: davNumero || '(sem número)',
            numero_pedido: davNumero || '(sem número)',
            provisoria: true,
            data_emissao_dav: davDataEmissao || null,
            itens_mapeados: itensMapeadosCount,
            empenho_id: Number(empenhoSelecionadoId),
          })

          toast.success('Baixa Provisória por Pedido realizada com sucesso!')
          resetForm()
          setShowSuccessModal(true)

      } catch (err: any) {
          toast.error('Erro na Baixa: ' + (err.message || String(err)))
      } finally {
          savingRef.current = false
          setSaving(false)
      }
  }

  return (
    <>
    <Card className="border-amber-200 dark:border-amber-900/50 shadow-xl overflow-hidden max-w-[1600px] mx-auto">
        <CardHeader className="bg-amber-50/60 dark:bg-amber-950/20 border-b border-amber-200/60 dark:border-amber-900/50">
          <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <ClipboardList className="w-5 h-5 text-amber-600 dark:text-amber-400" />
                <div>
                  <CardTitle className="text-amber-950 dark:text-amber-100 font-bold flex items-center gap-2">
                    Baixa Por Pedido
                    <Badge variant="outline" className="bg-amber-100 dark:bg-amber-950 text-amber-800 dark:text-amber-300 border-amber-300 dark:border-amber-800 text-[10px] uppercase font-black tracking-wider px-2 py-0.5">
                      <Clock className="w-3 h-3 mr-1" /> Provisória
                    </Badge>
                  </CardTitle>
                </div>
              </div>
              {onCancel && (
                  <Button variant="ghost" size="icon" onClick={onCancel} className="h-8 w-8 text-zinc-500 hover:text-zinc-900">
                    <X className="w-4 h-4" />
                  </Button>
              )}
          </div>
        </CardHeader>

        <CardContent className="p-6 space-y-6">
          {/* Banner Informativo de Baixa Provisória */}
          <div className="flex items-start gap-3 p-4 rounded-xl bg-amber-500/10 border border-amber-500/30 text-amber-900 dark:text-amber-200">
            <AlertTriangle className="w-5 h-5 text-amber-600 dark:text-amber-400 shrink-0 mt-0.5" />
            <div className="text-xs space-y-1">
              <span className="font-bold block text-sm">Atenção: Operação de Baixa Provisória</span>
              <p>
                As baixas efetuadas através do <strong>Pedido / Reserva de Pedido</strong> realizam o abatimento temporário do saldo físico/logístico. 
                Esta operação permanecerá identificada no sistema como <strong>Provisória</strong> até a substituição ou lançamento da Nota Fiscal definitiva.
              </p>
            </div>
          </div>

          <div 
            className={`p-6 rounded-xl border-2 border-dashed transition-all relative overflow-hidden space-y-4 ${
              isDragging ? 'border-amber-500 bg-amber-50 scale-[1.01]' : 'border-amber-200 dark:border-zinc-800 bg-amber-50/40 dark:bg-zinc-900/50'
            }`}>
            
            <div className="flex items-center justify-between relative z-10">
              <div className="flex items-center gap-3">
                <div className={`p-2 rounded-lg ${isDragging ? 'bg-amber-600 text-white animate-bounce' : 'bg-amber-100 dark:bg-amber-950 text-amber-700 dark:text-amber-300'}`}>
                  <Sparkles className="w-5 h-5" />
                </div>
                <div>
                  <span className="font-bold block text-zinc-900 dark:text-zinc-100">Solte o PDF do Pedido / Reserva de Pedido aqui</span>
                  <span className="text-xs text-zinc-500 dark:text-zinc-400">A IA irá identificar itens, número do pedido e empenhos automaticamente (Modelo WSGE e anteriores).</span>
                </div>
              </div>
              <Label htmlFor="dav-upload" className="bg-amber-600 hover:bg-amber-700 text-white px-4 py-2 rounded-lg cursor-pointer flex items-center gap-2 transition-shadow shadow-amber-600/20 font-medium text-xs">
                {loadingIA ? <Loader2 className="w-4 h-4 animate-spin" /> : <Upload className="w-4 h-4" />}
                {loadingIA ? 'Analisando...' : 'Procurar PDF do Pedido'}
                <input id="dav-upload" type="file" className="hidden" accept="application/pdf" onChange={handleArquivoIA} disabled={loadingIA} />
              </Label>
            </div>
            {loadingIA && <Progress value={progress} className="h-1.5 relative z-10 bg-amber-100" />}
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
             <div className="space-y-2">
                 <Label className="text-xs font-bold text-zinc-700 dark:text-zinc-300">Número do Pedido / Reserva</Label>
                 <Input value={davNumero} onChange={e => setDavNumero(e.target.value)} placeholder="Ex: 3932" />
             </div>
             <div className="space-y-2">
                 <Label className="text-xs font-bold text-zinc-700 dark:text-zinc-300">Data de Emissão do Pedido</Label>
                 <Input type="date" value={davDataEmissao} onChange={e => setDavDataEmissao(e.target.value)} />
             </div>
             <div className="space-y-2">
                  <Label className="text-xs font-bold text-zinc-700 dark:text-zinc-300">Empenho Destino</Label>
                  <Select value={empenhoSelecionadoId} onValueChange={setEmpenhoSelecionadoId}>
                      <SelectTrigger>
                          <SelectValue placeholder="Selecione o empenho" />
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

          {itensDAV.length > 0 && (
              <div className="space-y-4">
                  <div className="flex items-center justify-between border-b pb-2">
                      <div className="flex items-center gap-2 text-amber-800 dark:text-amber-300">
                          <CheckCircle2 className="w-4 h-4 text-amber-600" />
                          <span className="text-xs font-bold uppercase tracking-wider">Mapeamento de Itens do Pedido</span>
                      </div>
                      <Badge variant="outline" className="text-[10px] bg-amber-50 text-amber-700 border-amber-300">
                        {itensDAV.length} itens extraídos pela IA
                      </Badge>
                  </div>
                  
                  <div className="border rounded-xl overflow-hidden max-h-[500px] overflow-y-auto shadow-sm">
                      <Table>
                          <TableHeader className="bg-amber-50/70 dark:bg-zinc-900 sticky top-0 z-20">
                               <TableRow>
                                    <TableHead className="w-[26%]">Produto no Pedido</TableHead>
                                    <TableHead className="w-[9%] text-right font-bold">Qtd Pedido</TableHead>
                                    <TableHead className="w-[20%] font-bold">Conversão</TableHead>
                                    <TableHead className="w-[45%]">Vínculos ao Empenho</TableHead>
                                </TableRow>
                            </TableHeader>
                            <TableBody>
                                {itensDAV.map((item, idx) => {
                                    const vinculos = mapeamentoItens[idx] || []
                                    const qtdDAV = getQtdConvertidaDAV(idx)
                                    const qtdDistribuida = getQtdDistribuida(idx)
                                    const qtdRestanteDistribuir = qtdDAV - qtdDistribuida
                                    const tudo_distribuido = Math.abs(qtdRestanteDistribuir) < 0.001
                                    const fator = fatoresConversao[idx] !== undefined ? fatoresConversao[idx] : 1
                                    const operacao = operacoesConversao[idx] || 'MULTIPLY'
                                    const mode = arredondamentoConversao[idx] || 'NONE'
                                    const rawQtd = Number(item.quantidade) || 0
                                    const rawCalculated = operacao === 'MULTIPLY' ? rawQtd * fator : rawQtd / fator

                                    return (
                                        <TableRow key={idx} className={vinculos.length === 0 ? 'bg-zinc-50/50' : ''}>
                                            {/* Coluna: Produto no Pedido */}
                                            <TableCell 
                                              className={`text-xs font-medium py-3 cursor-pointer transition-all align-top ${expandedDescIds.has(idx) ? 'whitespace-normal' : 'max-w-[180px] truncate'}`}
                                              onClick={() => toggleDesc(idx)}
                                              title={expandedDescIds.has(idx) ? "Clique para encolher" : "Clique para ver completo"}
                                            >
                                                <span className="text-zinc-400 font-bold mr-2 text-[11px]">#{idx + 1}</span>
                                                {item.codigo_produto ? <span className="text-[10px] bg-zinc-100 dark:bg-zinc-800 px-1 py-0.5 rounded mr-1 font-mono">{item.codigo_produto}</span> : null}
                                                {item.descricao}
                                                {item.marca && <span className="ml-1 text-[9px] text-zinc-400">({item.marca})</span>}
                                            </TableCell>

                                            {/* Coluna: Qtd Pedido */}
                                            <TableCell className="text-right font-bold text-amber-800 dark:text-amber-300 align-top py-3">
                                                {item.quantidade} <span className="text-[9px] text-zinc-400 font-normal">{item.unidade_medida}</span>
                                            </TableCell>

                                            {/* Coluna: Conversão */}
                                            <TableCell className="align-top py-3">
                                              <div className="flex flex-col gap-1.5 min-w-[140px]">
                                                <div className="flex items-center gap-1">
                                                  <select 
                                                    value={operacao} 
                                                    onChange={e => handleUpdateConversao(idx, e.target.value as 'MULTIPLY' | 'DIVIDE', fator, mode)}
                                                    className="h-7 text-xs border rounded px-1 bg-white dark:bg-zinc-900 font-bold border-zinc-300 dark:border-zinc-700"
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
                                                    className="w-14 h-7 text-xs border rounded px-1 text-center bg-white dark:bg-zinc-900 font-bold border-zinc-300 dark:border-zinc-700"
                                                    min="0.0001"
                                                    step="any"
                                                  />
                                                  <span className="text-[11px] text-zinc-700 dark:text-zinc-300 font-black whitespace-nowrap">
                                                    = {qtdDAV % 1 === 0 ? qtdDAV.toFixed(0) : qtdDAV.toFixed(2)}
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
                                                    📐 {mode === 'ROUND' ? 'Arred. Matemático' : mode === 'FLOOR' ? 'Arred. p/ Baixo' : 'Arred. p/ Cima'} ({rawCalculated.toFixed(2)} → {qtdDAV})
                                                  </span>
                                                )}

                                                {/* Exibição do Valor Unitário Convertido pelo Fator */}
                                                {(() => {
                                                  const rawVal = Number(item.valor_unitario) || 0
                                                  const convertedVal = getValorUnitarioConvertidoDAV(idx)
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
                                                  const convertedDavVal = getValorUnitarioConvertidoDAV(idx)
                                                  const temDivergenciaPreco = empVal > 0 && convertedDavVal > 0 && Math.abs(convertedDavVal - empVal) > 0.01

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
                                                            ⚠️ Divergência de Preço: Pedido R$ {convertedDavVal.toFixed(2)} vs Empenho R$ {empVal.toFixed(2)}
                                                            <span className="ml-1 opacity-80">(dif: {convertedDavVal > empVal ? '+' : ''}R$ {(convertedDavVal - empVal).toFixed(2)})</span>
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
                                                          <AlertCircle className="w-3 h-3 text-amber-600" /> Distribuído: {qtdDistribuida % 1 === 0 ? qtdDistribuida.toFixed(0) : qtdDistribuida.toFixed(2)} / {qtdDAV % 1 === 0 ? qtdDAV.toFixed(0) : qtdDAV.toFixed(2)} — Restam: {qtdRestanteDistribuir.toFixed(2)}
                                                        </span>
                                                        <button
                                                          type="button"
                                                          onClick={() => {
                                                            const sugestaoMode = qtdRestanteDistribuir > 0 ? 'FLOOR' : 'CEIL'
                                                            handleUpdateConversao(idx, operacao, fator, sugestaoMode)
                                                          }}
                                                          className="text-[9px] font-bold text-amber-800 bg-amber-200 hover:bg-amber-300 border border-amber-300 px-1.5 py-0.5 rounded transition-colors shadow-sm whitespace-nowrap"
                                                          title="Arredondar quantidade do Pedido para igualar à quantidade inteira distribuída"
                                                        >
                                                          📐 Arredondar Pedido p/ {qtdRestanteDistribuir > 0 ? Math.floor(qtdDAV) : Math.ceil(qtdDAV)}
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
                                                          const convertedDavVal = getValorUnitarioConvertidoDAV(idx)
                                                          const matchPreco = empVal > 0 && convertedDavVal > 0 && Math.abs(convertedDavVal - empVal) <= 0.01

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

                  {aggregatedMappings.some(agg => agg.novoSaldo > 0) && (
                      <div className="space-y-4 pt-4 border-t border-dashed border-amber-200">
                          <div className="flex items-center gap-2 text-amber-800 dark:text-amber-300">
                              <AlertCircle className="w-5 h-5 text-amber-600" />
                              <span className="text-xs font-bold uppercase tracking-wider">Justificativas de Pendência</span>
                          </div>
                          
                          <div className="grid gap-3">
                              {aggregatedMappings.filter(agg => agg.novoSaldo > 0).map((agg) => (
                                  <div key={agg.idEmpenhoItem} className="flex flex-col gap-2 p-3 rounded-xl border border-amber-200 bg-amber-50/40 dark:bg-zinc-900">
                                      <div className="flex justify-between items-start gap-4 w-full min-w-0">
                                          <span className="text-xs font-bold text-amber-950 dark:text-amber-100 whitespace-normal break-words flex-1 min-w-0">
                                              {agg.itemEmpenho?.descricao}
                                          </span>
                                          <Badge variant="outline" className="text-[9px] border-amber-300 text-amber-700 whitespace-nowrap flex-shrink-0">
                                              Faltam {agg.novoSaldo} un
                                          </Badge>
                                      </div>
                                      
                                      <div className="grid grid-cols-1 md:grid-cols-12 gap-2">
                                          <div className="md:col-span-5">
                                              <Select value={motivosCod[agg.idEmpenhoItem] || 'none'} onValueChange={v => setMotivosCod(p => ({...p, [agg.idEmpenhoItem]: v}))}>
                                                  <SelectTrigger className="h-8 text-xs font-medium">
                                                      <SelectValue placeholder="Motivo..." />
                                                  </SelectTrigger>
                                                  <SelectContent>
                                                      <SelectItem value="none" disabled>-- Motivo --</SelectItem>
                                                      {Object.entries(motivosPendencia).map(([k, v]) => (
                                                          <SelectItem key={k} value={k}>{v}</SelectItem>
                                                      ))}
                                                  </SelectContent>
                                              </Select>
                                          </div>
                                          <div className="md:col-span-7">
                                              <Input 
                                                  placeholder="Justificativa..." 
                                                  value={justificativas[agg.idEmpenhoItem] || ''} 
                                                  onChange={e => setJustificativas(p => ({...p, [agg.idEmpenhoItem]: e.target.value}))}
                                                  className="h-8 text-xs"
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
                className="bg-amber-600 hover:bg-amber-700 text-white font-bold h-11 px-8 shadow-lg shadow-amber-600/20"
                disabled={saving || !empenhoSelecionadoId || !Object.values(mapeamentoItens).some(vinculos => Array.isArray(vinculos) && vinculos.length > 0)}
              >
                  {saving ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : <Save className="w-4 h-4 mr-2" />}
                  CONFIRMAR BAIXA PROVISÓRIA POR PEDIDO
              </Button>
          </div>
        </CardContent>
    </Card>

    <Dialog open={showSuccessModal} onOpenChange={setShowSuccessModal}>
        <DialogContent className="sm:max-w-[440px]">
          <DialogHeader className="items-center text-center">
            <PackageCheck className="w-12 h-12 text-amber-500 mb-2" />
            <DialogTitle className="text-lg font-bold">Baixa Provisória Realizada!</DialogTitle>
            <DialogDescription className="text-xs text-zinc-500">
              O Pedido Nº <strong>{davNumero}</strong> foi processado e os saldos dos itens foram abatidos provisoriamente.
            </DialogDescription>
          </DialogHeader>
          <div className="grid gap-2 mt-4">
            <Button className="bg-amber-600 hover:bg-amber-700 text-white font-semibold" onClick={() => { setShowSuccessModal(false); if(onSuccess) onSuccess(); }}>
                Voltar aos Empenhos
            </Button>
            <Button variant="outline" onClick={() => setShowSuccessModal(false)}>
                Processar outro Pedido
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
          className="fixed inset-0 z-[9999] flex flex-col items-center justify-center bg-zinc-950/65 backdrop-blur-md border-4 border-dashed border-amber-500 m-4 rounded-2xl animate-in fade-in zoom-in duration-200"
        >
          <div className="pointer-events-none bg-zinc-900/90 border border-zinc-800 p-8 rounded-2xl max-w-md w-full mx-4 text-center space-y-6 shadow-2xl animate-in zoom-in-95 duration-300">
            <div className="mx-auto w-20 h-20 bg-amber-500/15 border-2 border-amber-500/30 rounded-full flex items-center justify-center text-amber-500 animate-pulse">
              <ClipboardList className="w-10 h-10" />
            </div>
            <div className="space-y-2">
              <h3 className="text-xl font-bold text-white tracking-tight">Leitura de Pedido por IA</h3>
              <p className="text-sm text-zinc-400">
                Solte o documento de Pedido ou Reserva de Pedido em qualquer lugar da tela para leitura automática
              </p>
            </div>
            <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full bg-amber-500/10 border border-amber-500/25 text-xs font-semibold text-amber-500 tracking-wide uppercase">
              <Upload className="w-3.5 h-3.5" /> Apenas arquivos PDF
            </div>
          </div>
        </div>
      )}
    </>
  )
}
