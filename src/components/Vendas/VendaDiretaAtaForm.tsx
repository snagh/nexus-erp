import { useState, useEffect, useMemo } from 'react'
import { supabase } from '../../lib/supabase'
import { extrairDadosNF, extrairDadosPedido } from '../../aiService'
import { useAuth } from '../../AuthContext'
import { toast } from 'sonner'
import { logAction } from '../../lib/logger'
import { verificarDuplicidadeNf } from '../../lib/supabaseHelpers'
import { 
  FileText, 
  Sparkles, 
  Upload, 
  Save,
  Loader2,
  X,
  Search,
  PackageCheck,
  AlertCircle,
  CheckCircle2
} from 'lucide-react'

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
  DialogDescription,
  DialogFooter
} from '../ui/dialog'
import { 
  Select, 
  SelectContent, 
  SelectItem, 
  SelectTrigger, 
  SelectValue 
} from '../ui/select'

interface VendaDiretaAtaFormProps {
  onSuccess?: () => void
  onCancel?: () => void
  defaultTipoDocumento?: 'NF' | 'PEDIDO'
}

export function VendaDiretaAtaForm({ onSuccess, onCancel, defaultTipoDocumento = 'NF' }: VendaDiretaAtaFormProps) {
  const [tipoDocumento, setTipoDocumento] = useState<'NF' | 'PEDIDO'>(defaultTipoDocumento)
  const [atasDisponiveis, setAtasDisponiveis] = useState<any[]>([])
  const [ataSelecionadaId, setAtaSelecionadaId] = useState<string>('')
  const [itensAta, setItensAta] = useState<any[]>([])
  
  const [nfArquivo, setNfArquivo] = useState<File | null>(null)
  const [nfNumero, setNfNumero] = useState('')
  const [nfDuplicada, setNfDuplicada] = useState(false)
  const [allowExistingNfLink, setAllowExistingNfLink] = useState(false)
  const [arquivoNfExistenteCaminho, setArquivoNfExistenteCaminho] = useState<string | null>(null)
  
  const [existingNfModalOpen, setExistingNfModalOpen] = useState(false)
  const [nfsExistentesLoading, setNfsExistentesLoading] = useState(false)
  const [nfsExistentesList, setNfsExistentesList] = useState<any[]>([])
  const [searchNfExistente, setSearchNfExistente] = useState('')

  const [itensNF, setItensNF] = useState<any[]>([])
  const [mapeamentoItens, setMapeamentoItens] = useState<Record<number, string>>({}) // indexNF -> itemAtaId
  
  const [loadingIA, setLoadingIA] = useState(false)
  const [progress, setProgress] = useState(0)
  const [saving, setSaving] = useState(false)
  const [showSuccessModal, setShowSuccessModal] = useState(false)
  const [searchAta, setSearchAta] = useState('')
  const [searchItem, setSearchItem] = useState('')
  const [isDragging, setIsDragging] = useState(false)

  const [expandedDescIds, setExpandedDescIds] = useState<Set<number>>(new Set())

  const filteredAtas = useMemo(() => {
    if (!searchAta) return atasDisponiveis
    const term = searchAta.toLowerCase()
    return atasDisponiveis.filter(a => 
      a.numero_arp.toLowerCase().includes(term) || 
      (a.entidade_gerenciadora || '').toLowerCase().includes(term)
    )
  }, [atasDisponiveis, searchAta])

  const filteredNfsExistentes = useMemo(() => {
    if (!searchNfExistente) return nfsExistentesList
    const term = searchNfExistente.toLowerCase()
    return nfsExistentesList.filter(nf => 
      String(nf.numero_nf || '').toLowerCase().includes(term) ||
      String(nf.cliente || '').toLowerCase().includes(term) ||
      String(nf.empenho_ne || '').toLowerCase().includes(term) ||
      String(nf.amostra_item || '').toLowerCase().includes(term)
    )
  }, [nfsExistentesList, searchNfExistente])

  const { user } = useAuth()

  // Busca NFs já importadas no sistema
  async function handleOpenSearchExistingNfs() {
    setExistingNfModalOpen(true)
    setNfsExistentesLoading(true)
    try {
      const { data, error } = await supabase
        .from('historico_entregas')
        .select(`
          id,
          numero_nf,
          data_emissao_nf,
          data_entrega,
          arquivo_nf_caminho,
          quantidade_entregue,
          motivo_pendencia,
          item:itens(descricao, unidade, valor_unitario, nota:notas(numero_ne, emissor))
        `)
        .not('numero_nf', 'is', null)
        .order('id', { ascending: false })
        .limit(200)

      if (error) throw error

      const groupedMap = new Map<string, any>()
      if (data) {
        data.forEach((h: any) => {
          const num = String(h.numero_nf || '').trim()
          if (!num || num.startsWith('PEDIDO:') || num.startsWith('DAV:') || num.toUpperCase().includes('PROVISÓRIA') || num.toUpperCase().includes('PROVISORIA')) return
          if (!groupedMap.has(num)) {
            groupedMap.set(num, {
              numero_nf: num,
              data_emissao_nf: h.data_emissao_nf,
              data_entrega: h.data_entrega,
              arquivo_nf_caminho: h.arquivo_nf_caminho,
              itensCount: 1,
              amostra_item: h.item?.descricao,
              empenho_ne: h.item?.nota?.numero_ne,
              cliente: h.item?.nota?.emissor,
              rawItems: [h]
            })
          } else {
            const existing = groupedMap.get(num)
            existing.itensCount += 1
            existing.rawItems.push(h)
          }
        })
      }

      setNfsExistentesList(Array.from(groupedMap.values()))
    } catch (err: any) {
      toast.error('Erro ao buscar NFs existentes: ' + err.message)
    } finally {
      setNfsExistentesLoading(false)
    }
  }

  function handleSelectExistingNf(nf: any) {
    setNfNumero(nf.numero_nf)
    setArquivoNfExistenteCaminho(nf.arquivo_nf_caminho || null)
    setAllowExistingNfLink(true)
    setNfDuplicada(false)

    const itemsFromNf = (nf.rawItems || []).map((h: any) => ({
      descricao: h.item?.descricao || 'Item da NF',
      quantidade: h.quantidade_entregue,
      unidade: h.item?.unidade || 'UNID',
      valor_unitario: h.item?.valor_unitario || 0
    }))

    setItensNF(itemsFromNf)
    setExistingNfModalOpen(false)
    toast.success(`Nota Fiscal nº ${nf.numero_nf} selecionada! Mapeie os itens para a Ata.`)
  }

  // Verifica duplicidade da NF no banco de dados
  useEffect(() => {
    if (!nfNumero || allowExistingNfLink) {
      setNfDuplicada(false)
      return
    }

    const timer = setTimeout(async () => {
      const result = await verificarDuplicidadeNf(nfNumero)
      setNfDuplicada(result.exists)
    }, 500)

    return () => clearTimeout(timer)
  }, [nfNumero, allowExistingNfLink])

  // Carrega Atas
  useEffect(() => {
    async function loadAtas() {
      const { data } = await supabase.from('atas').select('*').order('numero_arp')
      if (data) setAtasDisponiveis(data)
    }
    loadAtas()
  }, [])

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

  // Carrega itens da Ata selecionada
  useEffect(() => {
    if (!ataSelecionadaId) {
      setItensAta([])
      setMapeamentoItens({})
      return
    }
    async function loadItems() {
      const { data } = await supabase
        .from('itens_ata')
        .select('*')
        .eq('ata_id', ataSelecionadaId)
      
      if (data) {
        setItensAta(data)
        // Limpa mapeamentos antigos ao trocar de ATA para forçar novo match
        setMapeamentoItens({})
      }
    }
    loadItems()
  }, [ataSelecionadaId])

  // Auto-match quando itens da ATA ou da NF mudam
  useEffect(() => {
    if (itensNF.length > 0 && itensAta.length > 0) {
      const novoMapeamento = { ...mapeamentoItens }
      let mudou = false

      itensNF.forEach((nfItem, idx) => {
        if (novoMapeamento[idx] && novoMapeamento[idx] !== 'none') return

        const nfDesc = (nfItem.descricao || '').toLowerCase()
        const nfVal = Number(nfItem.valor_unitario) || 0

        // Busca candidatos pelo preço primeiro (margem de 5 centavos)
        const candidatosPorPreco = itensAta.filter(ia => Math.abs(nfVal - (Number(ia.valor_unitario) || 0)) < 0.05)

        if (candidatosPorPreco.length === 1) {
          // Se só tem um item com esse preço, é um forte candidato
          const ia = candidatosPorPreco[0]
          const iaDesc = (ia.descricao || '').toLowerCase()
          const nfWords = nfDesc.split(/\s+/).filter((w: string) => w.length >= 3)
          const iaWords = iaDesc.split(/\s+/).filter((w: string) => w.length >= 3)
          const intersection = nfWords.filter((w: string) => iaWords.includes(w))

          // Se tiver pelo menos uma palavra em comum ou se um contiver o outro, aceitamos
          if (intersection.length >= 1 || iaDesc.includes(nfDesc) || nfDesc.includes(iaDesc)) {
            novoMapeamento[idx] = String(ia.id)
            mudou = true
            return
          }
        }

        // Se tiver vários com mesmo preço, buscamos o que melhor combina com o nome
        if (candidatosPorPreco.length > 1) {
           let melhorMatch = null
           let maxIntersection = 0

           candidatosPorPreco.forEach(ia => {
              const iaDesc = (ia.descricao || '').toLowerCase()
              const nfWords = nfDesc.split(/\s+/).filter((w: string) => w.length >= 3)
              const iaWords = iaDesc.split(/\s+/).filter((w: string) => w.length >= 3)
              const intersection = nfWords.filter((w: string) => iaWords.includes(w))
              
              if (intersection.length > maxIntersection) {
                maxIntersection = intersection.length
                melhorMatch = ia
              }
           })

           if (melhorMatch && maxIntersection >= 1) {
              novoMapeamento[idx] = String((melhorMatch as any).id)
              mudou = true
           }
        }
      })

      if (mudou) {
        setMapeamentoItens(novoMapeamento)
        toast.info('Itens mapeados automaticamente por nome e valor.')
      }
    }
  }, [itensAta, itensNF])

  const getFilteredItensAta = (currentId?: string) => {
    if (!searchItem) return itensAta
    const term = searchItem.toLowerCase()
    return itensAta.filter(ia => 
      String(ia.numero_item).toLowerCase().includes(term) || 
      ia.descricao.toLowerCase().includes(term) ||
      String(ia.id) === currentId
    )
  }

  async function handleArquivoIA(e: React.ChangeEvent<HTMLInputElement>) {
    if (!e.target.files?.length) return
    const file = e.target.files[0]
    setLoadingIA(true)
    setProgress(10)
    
    try {
      if (tipoDocumento === 'PEDIDO') {
        const dados = await extrairDadosPedido(file)
        setProgress(50)
        if (dados && dados.sucesso) {
          const numDoc = dados.numero_pedido ? `PEDIDO: ${dados.numero_pedido}` : 'PEDIDO: PROVISÓRIO'
          setNfNumero(numDoc)
          setItensNF(dados.itens || [])
          setNfArquivo(file)
          toast.success('Pedido / Reserva de Pedido lido com sucesso!')
        }
      } else {
        const dados = await extrairDadosNF(file, itensAta)
        setProgress(50)
        
        if(dados && dados.sucesso) {
            setNfNumero(dados.numero_nf || '')
            setItensNF(dados.itens || [])
            setNfArquivo(file)
            
            const novoMapeamento: Record<number, string> = {}
            if (dados.itens) {
              dados.itens.forEach((nfItem: any, idx: number) => {
                if (nfItem.id_item_empenho) { 
                  novoMapeamento[idx] = String(nfItem.id_item_empenho)
                }
              })
            }
            setMapeamentoItens(novoMapeamento)
            toast.success('Nota Fiscal lida com sucesso!')
        }
      }
    } catch(err) {
      toast.error('Erro na extração IA')
    } finally {
      setLoadingIA(false)
      setProgress(0)
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

  async function handleSalvar() {
      if (!ataSelecionadaId) {
          toast.error('Selecione a ATA.')
          return
      }
      
      const mapeamentosValidos = Object.entries(mapeamentoItens).filter(([_, val]) => val !== '' && val !== 'none')
      if (mapeamentosValidos.length === 0) {
          toast.error('Mapeie pelo menos um item.')
          return
      }

      // Valida duplicidade da NF se não for vínculo autorizado de NF existente
      if (!allowExistingNfLink) {
        const checkResult = await verificarDuplicidadeNf(nfNumero)
        if (checkResult.exists) {
          toast.error(`A Nota Fiscal nº ${checkResult.numero_nf} já foi importada no sistema. Clique em "Vincular esta NF à Ata" para aproveitar os dados dela.`)
          return
        }
      }

      setSaving(true)
      try {
          let arquivoCaminho = arquivoNfExistenteCaminho
          if (!arquivoCaminho && nfArquivo) {
              const fileName = `vendas_diretas/${Date.now()}_${nfArquivo.name}`
              const { data } = await supabase.storage.from('documentos').upload(fileName, nfArquivo)
              if (data) arquivoCaminho = data.path
          }
          
          // Criamos um mapa de saldos virtuais para a ATA
          const virtualSaldosAta: Record<number, number> = {}
          itensAta.forEach(it => {
            virtualSaldosAta[it.id] = Number(it.quantidade_registrada) - (Number(it.quantidade_abatida) || 0)
          })

          for (const [idxNF, idItemAta] of mapeamentosValidos) {
              const itemNF = itensNF[Number(idxNF)]
              const initialItem = itensAta.find(ia => String(ia.id) === idItemAta)
              if (!initialItem) continue

              let qtdRestante = Number(itemNF.quantidade) || 0
              if (qtdRestante <= 0) continue

              // Identifica o pool de itens idênticos na ATA (mesma descrição)
              const descKey = initialItem.descricao.trim().toLowerCase()
              const poolItems = itensAta
                .filter(ia => ia.descricao.trim().toLowerCase() === descKey)
                .sort((a, b) => a.id - b.id) // Ordem consistente

              for (let i = 0; i < poolItems.length; i++) {
                const item = poolItems[i]
                const saldoVirtualAta = virtualSaldosAta[item.id]
                
                // Se não for o último e não tiver saldo virtual, pula
                if (i < poolItems.length - 1 && saldoVirtualAta <= 0) continue

                let qtdAbaterNesteItem = 0
                if (i === poolItems.length - 1) {
                  qtdAbaterNesteItem = qtdRestante // Último assume o resto (e sobrebaixa)
                } else {
                  qtdAbaterNesteItem = Math.min(qtdRestante, saldoVirtualAta)
                }

                if (qtdAbaterNesteItem <= 0) continue

                // Atualiza o saldo virtual
                virtualSaldosAta[item.id] -= qtdAbaterNesteItem

                // 1. Inserir histórico para este pedaço
                const { error: errHist } = await supabase.from('historico_entregas').insert([{
                    item_ata_id: item.id,
                    quantidade_entregue: qtdAbaterNesteItem,
                    data_entrega: new Date().toISOString(),
                    venda_tipo: 'PRE_FATURADA',
                    numero_nf: nfNumero,
                    arquivo_nf_caminho: arquivoCaminho,
                    vendedor_id: user?.id,
                    motivo_pendencia: tipoDocumento === 'PEDIDO'
                      ? `Venda Direta via Pedido/DAV ${nfNumero}`
                      : (allowExistingNfLink ? `Venda Direta via NF ${nfNumero} (Vínculo de NF Existente)` : `Venda Direta via NF ${nfNumero} (Pool)`)
                }])
                if (errHist) throw errHist

                // 2. Abater da ATA imediatamente
                const { error: errRpc } = await supabase.rpc('incrementar_abatimento_ata', {
                    target_item_ata_id: item.id,
                    qtd: qtdAbaterNesteItem
                })
                if (errRpc) throw errRpc

                qtdRestante -= qtdAbaterNesteItem
                if (qtdRestante <= 0) break
              }
          }

          if (tipoDocumento === 'PEDIDO') {
            const numClean = nfNumero.replace(/^(PEDIDO:\s*|DAV:\s*)/i, '').trim() || 'PROVISORIO'
            const ataObj = atasDisponiveis.find(a => String(a.id) === String(ataSelecionadaId))
            const valorTotalPedido = itensNF.reduce((acc, it) => acc + ((Number(it.quantidade) || 0) * (Number(it.valor_unitario) || 0)), 0)

            await (supabase as any).from('davs').insert([{
              numero_dav: numClean,
              ata_id: Number(ataSelecionadaId),
              entidade_id: ataObj?.entidade_id || null,
              valor_total: valorTotalPedido,
              owner_id: user?.id,
              data_emissao: new Date().toISOString().split('T')[0]
            }])
          }

          await logAction('BAIXA_NF_DIRETA_ATA', 'atas', ataSelecionadaId, {
              numero_nf: nfNumero,
              tipo_documento: tipoDocumento,
              total_itens: mapeamentosValidos.length
          })

          toast.success(tipoDocumento === 'PEDIDO' ? 'Baixa por Pedido registrada na ATA!' : 'Venda registrada com sucesso!')
          setShowSuccessModal(true)
      } catch (err: any) {
          toast.error('Erro ao salvar: ' + err.message)
      } finally {
          setSaving(false)
      }
  }

  return (
    <>
    <Card className="border-amber-200 dark:border-zinc-800 shadow-xl overflow-hidden max-w-[1600px] mx-auto backdrop-blur-sm dark:bg-zinc-900/60 bg-white/80">
        <CardHeader className="bg-amber-50/50 dark:bg-amber-950/20 border-b border-amber-100 dark:border-zinc-800/60">
          <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
              <div className="flex items-center gap-3">
                <FileText className="w-5 h-5 text-amber-600 dark:text-amber-400" />
                <div>
                  <CardTitle className="text-amber-950 dark:text-amber-400 font-bold">
                    {tipoDocumento === 'PEDIDO' ? 'Baixa em ATA por Pedido (Provisório / DAV)' : 'Baixa Automática em ATA por Nota Fiscal'}
                  </CardTitle>
                  <p className="text-xs text-zinc-500 mt-0.5">
                    {tipoDocumento === 'PEDIDO' ? 'Abata o saldo da ATA utilizando um Pedido de Venda ou Reserva de Pedido' : 'Abata o saldo da ATA diretamente via leitura de Nota Fiscal'}
                  </p>
                </div>
              </div>

              <div className="flex items-center gap-2">
                <div className="flex bg-zinc-100 dark:bg-zinc-800 p-1 rounded-xl border border-zinc-200 dark:border-zinc-700">
                  <button
                    type="button"
                    onClick={() => { setTipoDocumento('NF'); setItensNF([]); setNfNumero(''); setNfArquivo(null) }}
                    className={`px-3 py-1.5 text-xs font-bold rounded-lg transition-all ${tipoDocumento === 'NF' ? 'bg-amber-500 text-white shadow-sm' : 'text-zinc-500 hover:text-zinc-900 dark:hover:text-white'}`}
                  >
                    Nota Fiscal (NF)
                  </button>
                  <button
                    type="button"
                    onClick={() => { setTipoDocumento('PEDIDO'); setItensNF([]); setNfNumero(''); setNfArquivo(null) }}
                    className={`px-3 py-1.5 text-xs font-bold rounded-lg transition-all ${tipoDocumento === 'PEDIDO' ? 'bg-indigo-600 text-white shadow-sm' : 'text-zinc-500 hover:text-zinc-900 dark:hover:text-white'}`}
                  >
                    Pedido / DAV (Provisório)
                  </button>
                </div>
                {onCancel && (
                    <Button variant="ghost" size="icon" onClick={onCancel}><X className="w-4 h-4" /></Button>
                )}
              </div>
          </div>
        </CardHeader>

        <CardContent className="p-6 space-y-8">
          <div 
            className={`p-6 rounded-xl border-2 border-dashed transition-all relative overflow-hidden space-y-4 backdrop-blur-sm ${
              isDragging 
                ? 'border-amber-500 bg-amber-100/50 dark:bg-amber-950/30' 
                : 'border-amber-200 dark:border-amber-800/40 bg-amber-50/20 dark:bg-amber-950/5 hover:bg-amber-50/30 dark:hover:bg-amber-950/10'
            }`}>
            {isDragging && <div className="absolute inset-0 z-50 pointer-events-none bg-transparent" />}
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="p-2 rounded-lg bg-amber-100 dark:bg-amber-950/40 text-amber-700 dark:text-amber-400">
                  <Sparkles className="w-5 h-5" />
                </div>
                <div>
                  <span className="font-bold block">{tipoDocumento === 'PEDIDO' ? 'Leitura de Pedido / DAV para Baixa Provisória' : 'Leitura de NF para Baixa Automática'}</span>
                  <span className="text-xs text-amber-700/70 dark:text-amber-400/70">{tipoDocumento === 'PEDIDO' ? 'A IA mapeará os itens do Pedido / DAV diretamente contra a ATA selecionada.' : 'A IA mapeará os itens da Nota Fiscal diretamente contra a ATA selecionada.'}</span>
                </div>
              </div>
              <div className="flex items-center gap-2">
                <Button
                  type="button"
                  variant="outline"
                  onClick={handleOpenSearchExistingNfs}
                  className="border-amber-400 text-amber-800 dark:text-amber-300 hover:bg-amber-100 dark:hover:bg-amber-950/40 text-xs h-9 font-bold uppercase gap-1.5 shrink-0"
                >
                  <Search className="w-4 h-4 text-amber-600" />
                  {tipoDocumento === 'PEDIDO' ? 'Buscar Pedido Importado' : 'Buscar NF Já Importada'}
                </Button>
                <Label htmlFor="nf-venda-upload" className="bg-amber-600 dark:bg-amber-700 hover:bg-amber-700 dark:hover:bg-amber-600 text-white px-4 py-2 rounded-lg cursor-pointer flex items-center gap-2 transition-colors text-xs font-bold h-9">
                  {loadingIA ? <Loader2 className="w-4 h-4 animate-spin" /> : <Upload className="w-4 h-4" />}
                  {loadingIA ? 'Analisando...' : tipoDocumento === 'PEDIDO' ? 'Carregar Pedido' : 'Carregar NF'}
                  <input id="nf-venda-upload" type="file" className="hidden" accept="application/pdf" onChange={handleArquivoIA} />
                </Label>
              </div>
            </div>
            {loadingIA && <Progress value={progress} className="h-1.5 bg-amber-100" />}
          </div>

          {nfDuplicada && (
            <div className="p-4 rounded-xl border border-amber-300 dark:border-amber-800 bg-amber-50 dark:bg-amber-950/20 flex flex-col md:flex-row items-start md:items-center justify-between gap-3 text-sm text-amber-900 dark:text-amber-200 animate-in fade-in slide-in-from-top-2 duration-200">
              <div className="flex items-start gap-3">
                <AlertCircle className="w-5 h-5 text-amber-600 dark:text-amber-400 shrink-0 mt-0.5" />
                <div>
                  <span className="font-bold block text-amber-950 dark:text-amber-200">{tipoDocumento === 'PEDIDO' ? 'Pedido' : 'Nota Fiscal'} nº {nfNumero} já existe no sistema!</span>
                  <span className="block mt-0.5 text-xs text-amber-700 dark:text-amber-300">
                    {tipoDocumento === 'PEDIDO' ? 'Este Pedido já foi cadastrado anteriormente. Deseja aproveitar os dados para dar baixa nesta Ata?' : 'Esta NF já foi cadastrada anteriormente em um Empenho ou Ordem. Deseja aproveitar os dados desta Nota Fiscal para dar baixa nesta Ata?'}
                  </span>
                </div>
              </div>
              <Button
                type="button"
                size="sm"
                onClick={() => setAllowExistingNfLink(true)}
                className="bg-amber-600 hover:bg-amber-700 text-white font-bold text-xs uppercase h-8 shrink-0 gap-1.5"
              >
                <CheckCircle2 className="w-4 h-4" />
                {allowExistingNfLink ? 'Vínculo Habilitado' : tipoDocumento === 'PEDIDO' ? 'Vincular este Pedido à Ata' : 'Vincular esta NF à Ata'}
              </Button>
            </div>
          )}

          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
             <div className="space-y-2">
                 <Label>Número da NF / DAV</Label>
                 <Input 
                   value={nfNumero} 
                   onChange={e => setNfNumero(e.target.value)} 
                   className={nfDuplicada ? 'border-red-500 focus-visible:ring-red-500 text-red-950 dark:text-red-400 bg-red-50/20 dark:bg-red-950/5' : ''}
                 />
             </div>
             <div className="space-y-2">
                 <Label>Selecionar ATA Origem</Label>
                 <Select value={ataSelecionadaId} onValueChange={setAtaSelecionadaId}>
                     <SelectTrigger><SelectValue placeholder="Selecione a ATA" /></SelectTrigger>
                      <SelectContent className="max-h-[400px]">
                          <div className="p-2 sticky top-0 bg-white dark:bg-zinc-950 z-10 border-b border-zinc-100 dark:border-zinc-800">
                            <div className="relative">
                              <Search className="absolute left-2 top-1/2 -translate-y-1/2 w-3 h-3 text-zinc-400" />
                              <Input 
                                placeholder="Filtrar ATAs..." 
                                value={searchAta}
                                onChange={e => setSearchAta(e.target.value)}
                                onKeyDown={(e) => e.stopPropagation()}
                                className="h-8 pl-7 text-xs"
                              />
                            </div>
                          </div>
                          {filteredAtas.length === 0 ? (
                            <div className="p-4 text-center text-xs text-zinc-400 italic">
                              Nenhuma ATA encontrada
                            </div>
                          ) : (
                            filteredAtas.map(ata => (
                              <SelectItem key={ata.id} value={ata.id}>{ata.numero_arp} - {ata.entidade_gerenciadora}</SelectItem>
                            ))
                          )}
                      </SelectContent>
                 </Select>
             </div>
          </div>

          {itensNF.length > 0 && (
              <div className="space-y-4">
                   <div className="flex items-center justify-between text-amber-800 dark:text-amber-400">
                      <div className="flex items-center gap-2 font-bold uppercase tracking-wider text-xs">
                          Mapeamento de Itens da NF
                      </div>
                      <div className="bg-amber-100 dark:bg-amber-950/40 text-amber-800 dark:text-amber-400 text-xs px-2.5 py-1 rounded-full font-bold shadow-sm">
                          {itensNF.length} {itensNF.length === 1 ? 'item importado' : 'itens importados'}
                      </div>
                  </div>
                  <div className="border border-zinc-200 dark:border-zinc-800 rounded-xl overflow-hidden shadow-sm">
                      <Table>
                          <TableHeader className="bg-amber-50 dark:bg-amber-950/20">
                              <TableRow>
                                  <TableHead>Produto na NF</TableHead>
                                  <TableHead className="text-right">Qtd</TableHead>
                                  <TableHead className="pl-6">Vincular ao Item da ATA</TableHead>
                              </TableRow>
                          </TableHeader>
                          <TableBody>
                              {itensNF.map((item, idx) => {
                                  const mappedId = mapeamentoItens[idx]
                                  const itemAta = itensAta.find(ia => String(ia.id) === mappedId)
                                  const qtdNF = Number(item.quantidade) || 0
                                  
                                  // Calcula saldo do POOL
                                  let saldoPool = 0
                                  if (itemAta) {
                                      const pool = itensAta.filter(ia => ia.descricao.trim().toLowerCase() === itemAta.descricao.trim().toLowerCase())
                                      saldoPool = pool.reduce((acc, curr) => acc + (Number(curr.quantidade_registrada) - (Number(curr.quantidade_abatida) || 0)), 0)
                                  }

                                  const isOver = itemAta && qtdNF > saldoPool

                                  return (
                                      <TableRow key={idx} className={isOver ? 'bg-amber-50/50 dark:bg-amber-950/10 border-amber-200 dark:border-amber-900/30' : 'border-zinc-200 dark:border-zinc-800/40'}>
                                          <TableCell 
                                            className={`text-xs font-medium cursor-pointer ${expandedDescIds.has(idx) ? '' : 'max-w-[250px] truncate'}`}
                                            onClick={() => toggleDesc(idx)}
                                            title={expandedDescIds.has(idx) ? 'Clique para reduzir' : 'Clique para ver descrição completa'}
                                          >
                                            <span className="text-zinc-400 font-bold mr-2 text-[11px]">#{idx + 1}</span>
                                            {item.descricao}
                                          </TableCell>
                                          <TableCell className="text-right font-bold text-amber-700 dark:text-amber-400">
                                            {item.quantidade}
                                          </TableCell>
                                          <TableCell className="text-right text-[10px] font-mono text-zinc-400">
                                            {itemAta ? (
                                              <span className={isOver ? 'text-amber-600 dark:text-amber-400 font-bold' : ''}>
                                                Saldo Pool: {saldoPool.toFixed(0)}
                                              </span>
                                            ) : '—'}
                                          </TableCell>
                                          <TableCell className="pl-6">
                                          <Select 
                                            value={mapeamentoItens[idx] || 'none'} 
                                            onValueChange={(val) => setMapeamentoItens(prev => ({ ...prev, [idx]: val }))}
                                          >
                                              <SelectTrigger className="h-8 text-[11px]"><SelectValue placeholder="Selecione..." /></SelectTrigger>
                                              <SelectContent className="max-h-[300px]">
                                                  <div className="p-2 sticky top-0 bg-white dark:bg-zinc-950 z-10 border-b border-zinc-100 dark:border-zinc-800">
                                                    <div className="relative">
                                                      <Search className="absolute left-2 top-1/2 -translate-y-1/2 w-3 h-3 text-zinc-400" />
                                                      <Input 
                                                        placeholder="Filtrar itens da ATA..." 
                                                        value={searchItem}
                                                        onChange={e => setSearchItem(e.target.value)}
                                                        onKeyDown={(e) => e.stopPropagation()}
                                                        className="h-8 pl-7 text-xs"
                                                      />
                                                    </div>
                                                  </div>
                                                  <SelectItem value="none">Ignorar</SelectItem>
                                                  {getFilteredItensAta(mapeamentoItens[idx]).length === 0 ? (
                                                    <div className="p-4 text-center text-xs text-zinc-400 italic">
                                                      Nenhum item encontrado
                                                    </div>
                                                  ) : (
                                                    getFilteredItensAta(mapeamentoItens[idx]).map(ia => (
                                                      <SelectItem key={ia.id} value={String(ia.id)} className="text-xs">
                                                        (Item {ia.numero_item}) {ia.descricao}
                                                      </SelectItem>
                                                    ))
                                                  )}
                                              </SelectContent>
                                          </Select>
                                      </TableCell>
                                  </TableRow>
                                  )
                              })}
                          </TableBody>
                      </Table>
                  </div>
              </div>
          )}

          <div className="flex justify-end pt-4 border-t gap-3">
              <Button onClick={handleSalvar} className="bg-amber-600 dark:bg-amber-700 hover:bg-amber-700 dark:hover:bg-amber-600 text-white font-bold px-10 shadow-lg shadow-amber-600/10" disabled={saving || nfDuplicada || !ataSelecionadaId}>
                  {saving ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : <Save className="w-4 h-4 mr-2" />}
                  REGISTRAR BAIXA NA ATA
              </Button>
          </div>
        </CardContent>
    </Card>

    <Dialog open={showSuccessModal} onOpenChange={setShowSuccessModal}>
        <DialogContent>
          <DialogHeader className="items-center">
            <PackageCheck className="w-12 h-12 text-amber-500 mb-2" />
            <DialogTitle>Venda Registrada!</DialogTitle>
            <DialogDescription>O saldo da ATA foi abatido. Quando o empenho chegar, você poderá vincular esta venda a ele.</DialogDescription>
          </DialogHeader>
          <div className="grid gap-3 mt-4">
            <Button className="bg-amber-600 hover:bg-amber-700 text-white" onClick={() => { setShowSuccessModal(false); if(onSuccess) onSuccess(); }}>OK</Button>
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
          <div className="pointer-events-none bg-zinc-900/80 dark:bg-zinc-950/60 border border-white/10 p-8 rounded-2xl max-w-md w-full mx-4 text-center space-y-6 shadow-2xl backdrop-blur-lg animate-in zoom-in-95 duration-300">
            <div className="mx-auto w-20 h-20 bg-amber-500/15 border-2 border-amber-500/30 rounded-full flex items-center justify-center text-amber-500 animate-pulse">
              <PackageCheck className="w-10 h-10" />
            </div>
            <div className="space-y-2">
              <h3 className="text-xl font-bold text-white tracking-tight">{tipoDocumento === 'PEDIDO' ? 'Baixa em ATA por Pedido / DAV' : 'Venda Direta via IA'}</h3>
              <p className="text-sm text-zinc-400">
                {tipoDocumento === 'PEDIDO' 
                  ? 'Solte o arquivo do Pedido ou DAV PDF em qualquer lugar da tela para que o Nexus realize a baixa de saldo na Ata'
                  : 'Solte a Nota Fiscal PDF da Venda Direta em qualquer lugar da tela para que o Nexus realize a baixa de saldo na Ata'}
              </p>
            </div>
            <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full bg-amber-500/10 border border-amber-500/25 text-xs font-semibold text-amber-500 tracking-wide uppercase">
              <Upload className="w-3.5 h-3.5" /> Apenas arquivos PDF
            </div>
          </div>
        </div>
      )}
      {/* Modal de Busca de NFs Já Importadas no Sistema */}
      <Dialog open={existingNfModalOpen} onOpenChange={setExistingNfModalOpen}>
        <DialogContent className="sm:max-w-2xl max-h-[85vh] flex flex-col p-6">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-base font-bold text-amber-900 dark:text-amber-200">
              <Search className="w-5 h-5 text-amber-600" />
              Buscar Nota Fiscal Já Importada no Sistema
            </DialogTitle>
            <DialogDescription className="text-xs text-zinc-500">
              Selecione uma Nota Fiscal já cadastrada em Empenhos ou Ordens para vincular e abater o saldo desta Ata.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-3 my-2 flex-1 flex flex-col min-h-0">
            <div className="relative">
              <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-4 h-4 text-zinc-400" />
              <Input
                placeholder="Filtrar por número da NF, cliente ou empenho..."
                value={searchNfExistente}
                onChange={e => setSearchNfExistente(e.target.value)}
                className="pl-9 text-xs h-9"
              />
            </div>

            <div className="overflow-y-auto flex-1 pr-1 space-y-2 max-h-[450px]">
              {nfsExistentesLoading ? (
                <div className="flex items-center justify-center py-10 gap-2 text-xs text-zinc-500">
                  <Loader2 className="w-4 h-4 animate-spin text-amber-600" />
                  Carregando Notas Fiscais do sistema...
                </div>
              ) : filteredNfsExistentes.length === 0 ? (
                <div className="text-center py-8 text-xs text-zinc-400 italic">
                  Nenhuma Nota Fiscal encontrada com os filtros aplicados.
                </div>
              ) : (
                filteredNfsExistentes.map((nf) => (
                  <div
                    key={nf.numero_nf}
                    onClick={() => handleSelectExistingNf(nf)}
                    className="p-3 bg-white dark:bg-zinc-900 hover:bg-amber-50/70 dark:hover:bg-amber-950/30 border border-zinc-200 dark:border-zinc-800 rounded-lg cursor-pointer transition-all flex items-center justify-between gap-3 group"
                  >
                    <div className="space-y-0.5 min-w-0 flex-1">
                      <div className="flex items-center gap-2">
                        <span className="font-mono font-bold text-amber-800 dark:text-amber-300 text-xs">
                          NF nº {nf.numero_nf}
                        </span>
                        {nf.empenho_ne && (
                          <span className="text-[10px] font-mono text-zinc-500 bg-zinc-100 dark:bg-zinc-800 px-1.5 py-0.5 rounded">
                            NE: {nf.empenho_ne}
                          </span>
                        )}
                      </div>
                      <p className="text-xs text-zinc-700 dark:text-zinc-300 truncate">
                        {nf.cliente || 'Empenho / Venda Direta'}
                      </p>
                      {nf.amostra_item && (
                        <p className="text-[10px] text-zinc-400 italic truncate">
                          Item: {nf.amostra_item}
                        </p>
                      )}
                    </div>
                    <Button
                      type="button"
                      size="sm"
                      variant="outline"
                      className="text-[10px] font-bold uppercase tracking-wider text-amber-700 border-amber-300 group-hover:bg-amber-600 group-hover:text-white shrink-0"
                    >
                      Selecionar NF
                    </Button>
                  </div>
                ))
              )}
            </div>
          </div>

          <DialogFooter className="pt-2 border-t border-zinc-100 dark:border-zinc-800">
            <Button type="button" variant="outline" size="sm" onClick={() => setExistingNfModalOpen(false)}>
              Cancelar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  )
}
