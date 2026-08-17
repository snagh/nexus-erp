import { useState, useEffect, useCallback } from 'react'
import { supabase } from '../../lib/supabase'
import { toast } from 'sonner'
import {
  FileText,
  Trash2,
  Loader2,
  RefreshCw,
  Search,
  AlertTriangle,
  RotateCcw,
  Download,
  ArrowUpDown
} from 'lucide-react'
import { Button } from '../ui/button'
import { Progress } from '../ui/progress'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '../ui/dialog'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '../ui/select'
import { getCleanPublicUrl } from '../../lib/storage'
import { useAuth } from '../../AuthContext'
import { canDeleteBaixa } from '../../lib/permissions'
import { logAction } from '../../lib/logger'
import { refreshNotaStatus } from '../../lib/supabaseHelpers'

interface NFLancada {
  numero_nf: string
  empenho_id: number
  empenho_numero: string
  empenho_emissor: string
  data_lancamento: string
  total_itens: number
  total_quantidade: number
  arquivo_nf_caminho: string | null
  registros: {
    id: number
    item_id: number
    item_descricao: string
    quantidade_entregue: number
    item_ata_id: number | null
    vendedor_id?: string | null
    empenho_assigned_to?: string | null
    itens_entregues?: boolean
    e_dia_d?: boolean | null
  }[]
}

interface NFsLancadasProps {
  onRevertida?: () => void
  initialSearch?: string
}

export function NFsLancadas({ onRevertida, initialSearch = '' }: NFsLancadasProps) {
  const { profile, isSuperAdmin } = useAuth()
  const [nfs, setNfs] = useState<NFLancada[]>([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState(initialSearch)
  const [confirmNF, setConfirmNF] = useState<NFLancada | null>(null)
  const [reverting, setReverting] = useState(false)
  const [revertProgress, setRevertProgress] = useState(0)
  const [observacaoReversao, setObservacaoReversao] = useState('')
  const [sortBy, setSortBy] = useState<string>('data_desc')

  useEffect(() => {
    setSearch(initialSearch)
  }, [initialSearch])

  const fetchNFs = useCallback(async () => {
    if (!profile?.id) return
    setLoading(true)
    try {
      // Busca todos os historico_entregas que têm numero_nf usando paginação para contornar o limite de 1000 do PostgREST
      let allData: any[] = []
      let from = 0
      let to = 999
      let hasMore = true
      const hasFullVisibility = profile.nivel === 'DEV' || profile.nivel === 'SUP' || (profile.nivel === 'ADM' && profile.setor === 'EMPENHOS')

      while (hasMore && from < 30000) {
        let chunkQuery = supabase
          .from('historico_entregas')
          .select(`
            id,
            numero_nf,
            quantidade_entregue,
            data_entrega,
            arquivo_nf_caminho,
            vendedor_id,
            item_id,
            item_ata_id,
            itens_entregues,
            e_dia_d,
            itens(
              id,
              descricao,
              item_ata_id,
              nota_id,
              notas(
                id,
                numero_ne,
                emissor,
                assigned_to,
                entidades(id, nome)
              )
            ),
            itens_ata(
              id,
              descricao,
              ata_id,
              atas(
                id,
                numero_arp,
                entidade_gerenciadora,
                entidades(id, nome)
              )
            )
          `)
          .not('numero_nf', 'is', null)

        if (!hasFullVisibility) {
          chunkQuery = chunkQuery.eq('vendedor_id', profile.id)
        }

        const { data: chunkData, error: chunkError } = await chunkQuery
          .order('data_entrega', { ascending: false })
          .range(from, to)

        if (chunkError) throw chunkError

        if (chunkData && chunkData.length > 0) {
          allData = [...allData, ...chunkData]
          if (chunkData.length < 1000) {
            hasMore = false
          } else {
            from += 1000
            to += 1000
          }
        } else {
          hasMore = false
        }
      }

      // Agrupar por numero_nf + (nota_id ou ata_id)
      const map = new Map<string, NFLancada>()
      for (const row of allData) {
        const item = (row as any).itens
        const nota = item?.notas
        const itemAta = (row as any).itens_ata
        const ata = itemAta?.atas

        if (!nota && !ata) continue

        const docId = nota ? `nota_${nota.id}` : `ata_${ata?.id}`
        const chave = `${row.numero_nf}__${docId}`

        if (!map.has(chave)) {
          map.set(chave, {
            numero_nf: row.numero_nf!,
            empenho_id: nota ? nota.id : 0,
            empenho_numero: nota ? nota.numero_ne : `ATA ${ata?.numero_arp || '—'}`,
            empenho_emissor: (nota ? (nota.entidades?.nome || nota.emissor) : (ata?.entidades?.nome || ata?.entidade_gerenciadora)) || '—',
            data_lancamento: row.data_entrega || '',
            total_itens: 0,
            total_quantidade: 0,
            arquivo_nf_caminho: (row as any).arquivo_nf_caminho || null,
            registros: []
          })
        }

        const group = map.get(chave)!
        group.total_itens++
        group.total_quantidade += row.quantidade_entregue || 0
        group.registros.push({
          id: row.id,
          item_id: item ? item.id : 0,
          item_descricao: item ? item.descricao : (itemAta ? itemAta.descricao : '—'),
          quantidade_entregue: row.quantidade_entregue || 0,
          item_ata_id: item ? item.item_ata_id : row.item_ata_id,
          vendedor_id: (row as any).vendedor_id,
          empenho_assigned_to: nota ? nota.assigned_to : (ata ? (ata as any).assigned_to : null),
          itens_entregues: (row as any).itens_entregues,
          e_dia_d: (row as any).e_dia_d
        })
      }

      setNfs(Array.from(map.values()))
    } catch (err) {
      toast.error('Erro ao carregar NFs: ' + String(err))
    } finally {
      setLoading(false)
    }
  }, [profile])

  useEffect(() => {
    fetchNFs()
  }, [fetchNFs])

  async function handleReverter() {
    if (!confirmNF) return
    setReverting(true)
    setRevertProgress(10)
    try {
      const itemIds = [...new Set(confirmNF.registros.map(r => r.item_id).filter(id => id && id > 0))]
      
      let stepsCompleted = 0
      const totalSteps = confirmNF.registros.length * 2 + itemIds.length + 1
      const updateProgress = () => {
        stepsCompleted++
        setRevertProgress(Math.min(95, 10 + Math.round((stepsCompleted / totalSteps) * 85)))
      }

      // 1. Desfazer abatimento na ATA (para itens vinculados a ATA)
      for (const reg of confirmNF.registros) {
        if (reg.item_ata_id) {
          await supabase.rpc('incrementar_abatimento_ata', {
            target_item_ata_id: reg.item_ata_id,
            qtd: -reg.quantidade_entregue // negativo = devolver
          })
        }
        updateProgress()
      }

      // 2. Deletar registros da NF ou restaurar entregas provisórias que foram oficializadas
      for (const reg of confirmNF.registros) {
        const obs = (reg as any).motivo_pendencia || ''
        const matchProv = obs.match(/\[PROVISORIO_ORIGEM:\s*([^|\]]+)\|(.*)\]/)
        if (matchProv) {
          const origNumNf = matchProv[1].trim()
          const origMotivo = matchProv[2].trim()
          const { error } = await supabase
            .from('historico_entregas')
            .update({
              numero_nf: origNumNf,
              data_emissao_nf: null,
              motivo_pendencia: origMotivo
            })
            .eq('id', reg.id)
          if (error) throw error
        } else {
          const { error } = await supabase
            .from('historico_entregas')
            .delete()
            .eq('id', reg.id)
          if (error) throw error
        }
        updateProgress()
      }

      // 3. Recalcular status dos itens afetados
      for (const itemId of itemIds) {
        const { data: hist } = await supabase
          .from('historico_entregas')
          .select('quantidade_entregue')
          .eq('item_id', itemId)

        const { data: itemData } = await supabase
          .from('itens')
          .select('quantidade')
          .eq('id', itemId)
          .single()

        const totalEntregue = (hist || []).reduce((acc, h) => acc + (h.quantidade_entregue || 0), 0)
        const qtdTotal = itemData?.quantidade || 0
        const saldo = qtdTotal - totalEntregue

        let novoStatus = 'EM_ESTOQUE'
        if (saldo <= 0) novoStatus = 'ENTREGUE'
        else if (totalEntregue > 0) novoStatus = 'SOLICITADO'

        await supabase.from('itens').update({ status_item: novoStatus }).eq('id', itemId)

        if (saldo > 0) {
          const { data: pedidos } = await supabase
            .from('pedidos_compra')
            .select('id')
            .eq('item_id', itemId)
            .in('status', ['ATENDIDO'])

          if (pedidos && pedidos.length > 0) {
            await supabase
              .from('pedidos_compra')
              .update({ status: 'PENDENTE', quantidade_solicitada: saldo })
              .in('id', pedidos.map(p => p.id))
          }
        }
        updateProgress()
      }

      // Recalcular status geral da nota de empenho afetada
      if (confirmNF.empenho_id) {
        await refreshNotaStatus(confirmNF.empenho_id)
      }

      await logAction('REVERTER_BAIXA_NF', 'historico_entregas', confirmNF.registros[0].id, {
        numero_nf: confirmNF.numero_nf,
        empenho_numero: confirmNF.empenho_numero,
        total_itens: confirmNF.registros.length,
        observacao: observacaoReversao ? observacaoReversao.trim() : null
      })
      updateProgress()

      setRevertProgress(100)
      await new Promise(resolve => setTimeout(resolve, 300))

      toast.success(`NF ${confirmNF.numero_nf} revertida! ${confirmNF.registros.length} baixa(s) desfeita(s).`)
      setConfirmNF(null)
      setObservacaoReversao('')
      fetchNFs()
      if (onRevertida) onRevertida()
    } catch (err) {
      toast.error('Erro ao reverter NF: ' + String(err))
    } finally {
      setReverting(false)
      setRevertProgress(0)
    }
  }

  const cleanString = (val: string) => 
    (val || '').toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "")

  const cleanSearch = cleanString(search)
  const nfsFiltradas = nfs.filter(nf => {
    if (!cleanSearch) return true
    return (
      cleanString(nf.numero_nf).includes(cleanSearch) ||
      cleanString(nf.empenho_numero).includes(cleanSearch) ||
      cleanString(nf.empenho_emissor).includes(cleanSearch)
    )
  })

  const sortedNFs = [...nfsFiltradas].sort((a, b) => {
    switch (sortBy) {
      case 'data_asc':
        return new Date(a.data_lancamento).getTime() - new Date(b.data_lancamento).getTime()
      case 'data_desc':
        return new Date(b.data_lancamento).getTime() - new Date(a.data_lancamento).getTime()
      case 'nf_asc': {
        const numA = parseInt(a.numero_nf.replace(/\D/g, ''), 10) || 0
        const numB = parseInt(b.numero_nf.replace(/\D/g, ''), 10) || 0
        if (numA !== numB) return numA - numB
        return a.numero_nf.localeCompare(b.numero_nf)
      }
      case 'nf_desc': {
        const numA = parseInt(a.numero_nf.replace(/\D/g, ''), 10) || 0
        const numB = parseInt(b.numero_nf.replace(/\D/g, ''), 10) || 0
        if (numA !== numB) return numB - numA
        return b.numero_nf.localeCompare(a.numero_nf)
      }
      case 'empenho_asc':
        return (a.empenho_numero || '').localeCompare(b.empenho_numero || '')
      case 'empenho_desc':
        return (b.empenho_numero || '').localeCompare(a.empenho_numero || '')
      case 'qtd_asc':
        return a.total_quantidade - b.total_quantidade
      case 'qtd_desc':
        return b.total_quantidade - a.total_quantidade
      default:
        return 0
    }
  })

  return (
    <div className="space-y-4">
      {/* Barra de busca e ordenação */}
      <div className="flex flex-col sm:flex-row sm:items-center gap-3">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-zinc-400" />
          <input
            type="text"
            placeholder="Buscar por NF, empenho ou órgão..."
            value={search}
            onChange={e => setSearch(e.target.value)}
            className="w-full pl-9 h-9 rounded-md border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 text-xs px-3 focus:outline-none focus:ring-1 focus:ring-blue-500"
          />
        </div>
        
        <div className="flex items-center gap-2 flex-wrap sm:flex-nowrap">
          <Select value={sortBy} onValueChange={setSortBy}>
            <SelectTrigger className="w-[180px] h-9 text-xs border border-zinc-200 dark:border-zinc-800 rounded-md bg-white dark:bg-zinc-900">
              <div className="flex items-center gap-2">
                <ArrowUpDown className="w-3.5 h-3.5 text-zinc-400" />
                <SelectValue placeholder="Ordenar por" />
              </div>
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="data_desc">Data (Mais recente)</SelectItem>
              <SelectItem value="data_asc">Data (Mais antiga)</SelectItem>
              <SelectItem value="nf_desc">NF (Maior número)</SelectItem>
              <SelectItem value="nf_asc">NF (Menor número)</SelectItem>
              <SelectItem value="empenho_asc">Empenho (A-Z)</SelectItem>
              <SelectItem value="empenho_desc">Empenho (Z-A)</SelectItem>
              <SelectItem value="qtd_desc">Qtd. Itens (Maior)</SelectItem>
              <SelectItem value="qtd_asc">Qtd. Itens (Menor)</SelectItem>
            </SelectContent>
          </Select>

          <Button variant="outline" size="sm" onClick={fetchNFs} className="gap-2 h-9 flex-shrink-0">
            <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} />
            Atualizar
          </Button>
        </div>
      </div>

      {/* Lista */}
      {loading ? (
        <div className="flex items-center justify-center py-16 gap-2 text-zinc-400">
          <Loader2 className="w-5 h-5 animate-spin" />
          <span className="text-sm">Carregando NFs...</span>
        </div>
      ) : sortedNFs.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-16 gap-3 text-zinc-400">
          <FileText className="w-10 h-10 opacity-30" />
          <p className="text-sm font-medium">Nenhuma NF lançada encontrada.</p>
        </div>
      ) : (
        <div className="space-y-3">
          {sortedNFs.map((nf) => {
            const numUpper = String(nf.numero_nf || '').toUpperCase()
            const isPedido = numUpper.includes('PEDIDO') || numUpper.includes('DAV') || numUpper.includes('PROVISÓRIA') || numUpper.includes('PROVISORIA')
            return (
              <div
                key={`${nf.numero_nf}__${nf.empenho_id}`}
                className="group relative flex flex-col sm:flex-row sm:items-center justify-between p-4 rounded-xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900/50 hover:bg-zinc-50/50 dark:hover:bg-zinc-850/20 hover:border-zinc-300 dark:hover:border-zinc-700 transition-all duration-200 shadow-sm gap-3"
              >
                <div className="flex items-start gap-3.5 min-w-0">
                  {/* Ícone */}
                  <div className={`w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0 shadow-inner ${
                    isPedido 
                      ? 'bg-rose-50/70 dark:bg-rose-950/20 border border-rose-100/50 dark:border-rose-900/20' 
                      : 'bg-emerald-50/70 dark:bg-emerald-950/20 border border-emerald-100/50 dark:border-emerald-900/20'
                  }`}>
                    <FileText className={`w-5 h-5 ${
                      isPedido
                        ? 'text-rose-600 dark:text-rose-400'
                        : 'text-emerald-600 dark:text-emerald-400'
                    }`} />
                  </div>

                  {/* Info principal */}
                  <div className="space-y-1 min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="font-bold text-zinc-900 dark:text-zinc-100 text-sm tracking-tight">
                        {isPedido ? nf.numero_nf : `NF ${nf.numero_nf}`}
                      </span>
                      <span className="text-[10px] font-semibold text-zinc-400 bg-zinc-100 dark:bg-zinc-800/80 px-2 py-0.5 rounded-full">
                        {nf.total_itens} {nf.total_itens === 1 ? 'item' : 'itens'} · {nf.total_quantidade} un
                      </span>
                      {isPedido ? (
                        <span className="text-[9px] font-bold text-rose-600 dark:text-rose-400 bg-rose-50 dark:bg-rose-950/30 px-2 py-0.5 rounded border border-rose-100 dark:border-rose-900/30">
                          Pedido (Provisória)
                        </span>
                      ) : nf.registros.some(r => r.e_dia_d === true) ? (
                        <span className="text-[9px] font-black text-white bg-gradient-to-r from-amber-400 to-orange-500 px-2.5 py-0.5 rounded-full shadow-sm">
                          DIA D
                        </span>
                      ) : nf.registros.some(r => r.itens_entregues === false) ? (
                        <span className="text-[9px] font-bold text-amber-700 dark:text-amber-400 bg-amber-50 dark:bg-amber-950/30 px-2 py-0.5 rounded border border-amber-200/50 dark:border-amber-800/30">
                          Pendência Física
                        </span>
                      ) : (
                        <span className="text-[9px] font-bold text-emerald-700 dark:text-emerald-400 bg-emerald-50 dark:bg-emerald-950/30 px-2 py-0.5 rounded border border-emerald-100/50 dark:border-emerald-900/20">
                          Entregue (NF)
                        </span>
                      )}
                    </div>

                    <div className="text-xs text-zinc-500 dark:text-zinc-400 flex items-center gap-1.5 flex-wrap min-w-0">
                      <span className="font-medium text-zinc-700 dark:text-zinc-300">Empenho {nf.empenho_numero}</span>
                      <span className="text-zinc-300 dark:text-zinc-700">•</span>
                      <span className="truncate max-w-[240px] text-zinc-400 dark:text-zinc-500" title={nf.empenho_emissor}>{nf.empenho_emissor}</span>
                    </div>

                    <div className="text-[10px] text-zinc-400 dark:text-zinc-500">
                      Lançada em: {nf.data_lancamento ? new Date(nf.data_lancamento).toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit', year: '2-digit', hour: '2-digit', minute: '2-digit' }) : '—'}
                    </div>
                  </div>
                </div>

                {/* Ações */}
                <div className="flex items-center gap-1.5 flex-shrink-0 self-end sm:self-center border-t sm:border-t-0 border-zinc-100 dark:border-zinc-800 pt-2 sm:pt-0 w-full sm:w-auto justify-end">
                  {nf.arquivo_nf_caminho && (
                    <a
                      href={getCleanPublicUrl(nf.arquivo_nf_caminho)}
                      target="_blank"
                      rel="noopener noreferrer"
                      title="Baixar PDF da NF"
                    >
                      <Button
                        variant="ghost"
                        size="sm"
                        className="h-8 gap-1.5 text-zinc-600 dark:text-zinc-300 hover:text-blue-600 dark:hover:text-blue-400 hover:bg-blue-50 dark:hover:bg-blue-950/20 text-xs font-semibold px-2.5 rounded-lg transition-all"
                      >
                        <Download className="w-3.5 h-3.5" />
                        PDF
                      </Button>
                    </a>
                  )}
                  {canDeleteBaixa(profile, isSuperAdmin, nf.registros[0]) && (
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => setConfirmNF(nf)}
                      className="h-8 gap-1.5 text-rose-600 hover:text-rose-700 hover:bg-rose-50 dark:hover:bg-rose-950/20 text-xs font-semibold px-2.5 rounded-lg transition-all"
                    >
                      <RotateCcw className="w-3.5 h-3.5" />
                      Reverter
                    </Button>
                  )}
                </div>
              </div>
            )})}
        </div>
      )}

      {/* Dialog de confirmação */}
      <Dialog open={!!confirmNF} onOpenChange={(open) => { if (!open) { setConfirmNF(null); setObservacaoReversao(''); } }}>
        <DialogContent className="w-full max-w-[95vw] sm:max-w-[580px] max-h-[90vh] flex flex-col gap-0 p-0 overflow-hidden">
          
          {/* Header */}
          <DialogHeader className="px-6 pt-6 pb-4 border-b border-zinc-100 dark:border-zinc-800 flex-shrink-0">
            <DialogTitle className="flex items-center gap-2 text-red-600 text-base">
              <AlertTriangle className="w-5 h-5 flex-shrink-0" />
              Reverter Baixa {confirmNF?.numero_nf?.startsWith('PEDIDO:') || confirmNF?.numero_nf?.startsWith('DAV:') ? 'do' : 'da NF'} {confirmNF?.numero_nf}?
            </DialogTitle>
          </DialogHeader>

          {/* Body com scroll */}
          <div className="flex-1 overflow-y-auto px-6 py-4 space-y-4 min-h-0">
            {/* Aviso */}
            <div className="bg-amber-50 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-900 rounded-xl p-4 space-y-2">
              <p className="text-sm font-bold text-amber-800 dark:text-amber-400">Esta ação irá:</p>
              <ul className="text-xs text-amber-700 dark:text-amber-400 space-y-1 list-disc list-inside">
                <li>Remover {confirmNF?.registros.length} registro(s) do histórico de entregas</li>
                <li>Devolver a quantidade ao saldo dos itens do empenho</li>
                <li>Reverter o abatimento na ATA vinculada (se houver)</li>
                <li>Reabrir pedidos de compra que estavam marcados como atendidos</li>
              </ul>
            </div>

            {/* Lista de itens afetados */}
            <div className="space-y-2">
              <p className="text-xs font-bold uppercase text-zinc-500 tracking-wider">Itens que serão revertidos:</p>
              <div className="space-y-1.5">
                {confirmNF?.registros.map(reg => (
                  <div key={reg.id} className="flex items-start justify-between gap-3 text-xs bg-zinc-50 dark:bg-zinc-900 p-2.5 rounded-lg border border-zinc-100 dark:border-zinc-800">
                    <span className="text-zinc-700 dark:text-zinc-300 flex-1 leading-relaxed">{reg.item_descricao}</span>
                    <span className="font-bold text-red-500 whitespace-nowrap flex-shrink-0">−{reg.quantidade_entregue.toLocaleString('pt-BR')} un</span>
                  </div>
                ))}
              </div>
            </div>

            {/* Observação */}
            <div className="space-y-2">
              <label htmlFor="obs-reversao" className="text-xs font-bold uppercase text-zinc-500 tracking-wider block">
                Observação da Reversão (Opcional):
              </label>
              <textarea
                id="obs-reversao"
                rows={2}
                className="w-full text-xs p-2.5 rounded-lg border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-950 text-zinc-800 dark:text-zinc-200 focus:outline-none focus:ring-1 focus:ring-red-500"
                placeholder="Digite o motivo da reversão..."
                value={observacaoReversao}
                onChange={(e) => setObservacaoReversao(e.target.value)}
              />
            </div>
          </div>

          {/* Footer fixo */}
          <div className="px-6 py-4 border-t border-zinc-100 dark:border-zinc-800 flex items-center justify-end gap-3 flex-shrink-0 bg-white dark:bg-zinc-950">
            <Button variant="ghost" size="sm" onClick={() => { setConfirmNF(null); setObservacaoReversao(''); }}>
              Cancelar
            </Button>
            <Button
              variant="destructive"
              size="sm"
              onClick={handleReverter}
              disabled={reverting}
              className="gap-2"
            >
              {reverting ? <Loader2 className="w-4 h-4 animate-spin" /> : <Trash2 className="w-4 h-4" />}
              Confirmar Reversão
            </Button>
          </div>

        </DialogContent>
      </Dialog>
      {reverting && (
        <div className="fixed inset-0 z-50 flex flex-col items-center justify-center bg-black/60 backdrop-blur-md transition-all duration-300 animate-in fade-in">
          <div className="bg-white/95 dark:bg-zinc-950/95 border border-zinc-200 dark:border-zinc-800 p-8 rounded-2xl shadow-2xl max-w-md w-full mx-4 space-y-6 backdrop-blur-lg">
            <div className="flex flex-col items-center text-center space-y-3">
              <div className="p-3 bg-red-50 dark:bg-red-950/30 text-red-600 rounded-full animate-bounce">
                <RotateCcw className="w-8 h-8 animate-spin" style={{ animationDuration: '3s' }} />
              </div>
              <h3 className="text-lg font-bold text-zinc-900 dark:text-zinc-50">
                Revertendo Lançamento
              </h3>
              <p className="text-sm text-zinc-500 dark:text-zinc-400">
                Desfazendo saldos, abatimentos de ATA e solicitações de compra. Por favor, aguarde...
              </p>
            </div>

            <div className="space-y-2">
              <div className="flex justify-between text-xs font-semibold text-zinc-600 dark:text-zinc-400">
                <span>Progresso</span>
                <span>{revertProgress}%</span>
              </div>
              <Progress value={revertProgress} className="h-2 bg-zinc-100 dark:bg-zinc-800" />
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
