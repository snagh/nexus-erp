import { useState, useEffect, useCallback, useRef } from 'react'
import { supabase } from './lib/supabase'
import { updateItem, refreshNotaStatus } from './lib/supabaseHelpers'
import { logAction } from './lib/logger'
import { useAuth } from './AuthContext'
import { motivosPendencia } from './lib/utils'
import type { Tables } from './supabaseTypes'
import { toast } from 'sonner'
import { 
  Truck, 
  Calendar, 
  CheckCircle2, 
  Clock,
  Loader2,
  AlertCircle,
  X,
  RotateCcw
} from 'lucide-react'

// Shadcn UI
import { Button } from './components/ui/button'
import { Input } from './components/ui/input'
import { Label } from './components/ui/label'
import { Progress } from './components/ui/progress'
import { 
  RadioGroup, 
  RadioGroupItem 
} from './components/ui/radio-group'
import { 
  Select, 
  SelectContent, 
  SelectItem, 
  SelectTrigger, 
  SelectValue 
} from './components/ui/select'
import { ScrollArea } from './components/ui/scroll-area'

type Item = Tables<'itens'>
type HistoricoEntrega = Tables<'historico_entregas'>

interface Props {
  item: Item
  onUpdate?: () => void
  onClose?: () => void
}

export function ControleEntrega({ item, onUpdate, onClose }: Props) {
  const [historico, setHistorico] = useState<HistoricoEntrega[]>([])
  const [qtdEntregueHoje, setQtdEntregueHoje] = useState<number | string>('')
  const [motivo, setMotivo] = useState('')
  const [statusEntrega, setStatusEntrega] = useState<'TOTAL' | 'PARCIAL' | 'NAO_FORNECIDO'>('PARCIAL')
  const [dataEmissaoNf, setDataEmissaoNf] = useState('')
  const [motivoCod, setMotivoCod] = useState('')
  const [loading, setLoading] = useState(false)
  const [reverting, setReverting] = useState(false)
  const [revertProgress, setRevertProgress] = useState(0)
  const loadingRef = useRef(false) // trava síncrona contra duplo clique
  const { user, profile } = useAuth()

  const buscarHistorico = useCallback(async () => {
    const { data } = await supabase.from('historico_entregas')
      .select('*')
      .eq('item_id', item.id)
      // Buscamos ordenado por data de emissão para o cálculo de soma acumulada
      .order('data_emissao_nf', { ascending: true, nullsFirst: false })
      .order('data_entrega', { ascending: true })

    setHistorico((data as HistoricoEntrega[] | null) || [])
  }, [item.id])

  useEffect(() => {
    buscarHistorico()
  }, [buscarHistorico])

  // Cálculos
  const totalEntregue = historico.reduce((acc, curr) => acc + (Number(curr.quantidade_entregue) || 0), 0)
  const totalPedido = Number(item.quantidade) || 0
  const saldoRestante = totalPedido - totalEntregue
  const percentual = totalPedido === 0 ? 0 : (totalEntregue / totalPedido) * 100
  
  const canUndo = (log: HistoricoEntrega) => {
    if (profile?.nivel === 'DEV') return true
    if (profile?.nivel === 'ADM' && profile?.setor === 'EMPENHOS') return true
    if (!log.created_at) return false
    const createdAt = new Date(log.created_at).getTime()
    const now = new Date().getTime()
    const diffMinutes = (now - createdAt) / 60000
    return diffMinutes <= 10
  }

  const handleDesfazer = async (log: HistoricoEntrega) => {
    if (loadingRef.current) return
    loadingRef.current = true

    if (!canUndo(log)) {
        toast.error('O prazo de 10 minutos para desfazer expirou. Apenas DEVs e ADMs do setor de Empenhos podem realizar esta ação.')
        loadingRef.current = false
        return
    }

    try {
        let logsParaDeletar: any[] = [log]

        if (log.numero_nf) {
            // Obter todos os IDs de itens que pertencem ao mesmo documento (empenho ou ATA) para filtrar com segurança
            const itemAny = item as any
            let itemIdsDoDocumento: number[] = [item.id]
            if (item.nota_id) {
                const { data: siblingItens } = await supabase
                    .from('itens')
                    .select('id')
                    .eq('nota_id', item.nota_id)
                if (siblingItens) {
                    itemIdsDoDocumento = siblingItens.map(i => i.id)
                }
            } else if (itemAny.item_ata_id || itemAny.ata_id || itemAny.itens_ata?.ata_id) {
                const ataId = itemAny.ata_id || itemAny.itens_ata?.ata_id
                if (ataId) {
                    const { data: siblingItensAta } = await supabase
                        .from('itens_ata')
                        .select('id')
                        .eq('ata_id', ataId)
                    if (siblingItensAta) {
                        itemIdsDoDocumento = siblingItensAta.map(i => i.id)
                    }
                }
            }

            // Buscar todos os registros do histórico que possuem o mesmo número de NF
            const { data: relatedLogs, error: errFetchRelated } = await supabase
                .from('historico_entregas')
                .select(`
                    id,
                    item_id,
                    item_ata_id,
                    quantidade_entregue,
                    numero_nf
                `)
                .eq('numero_nf', log.numero_nf)

            if (errFetchRelated) throw errFetchRelated

            // Filtrar os registros que pertencem ao mesmo empenho ou ATA
            if (relatedLogs) {
                logsParaDeletar = relatedLogs.filter((rl: any) => {
                    if (item.nota_id) {
                        return rl.item_id && itemIdsDoDocumento.includes(rl.item_id)
                    }
                    const itemAtaId = itemAny.item_ata_id || itemAny.itens_ata?.id
                    const ataId = itemAny.ata_id || itemAny.itens_ata?.ata_id
                    if (ataId) {
                        return rl.item_ata_id && itemIdsDoDocumento.includes(rl.item_ata_id)
                    }
                    return rl.item_id === item.id || (rl.item_ata_id && rl.item_ata_id === itemAtaId)
                })
            }
        }

        const numItens = logsParaDeletar.length
        const confirmMsg = log.numero_nf
            ? `ATENÇÃO: Deseja realmente reverter a NF ${log.numero_nf}? Isso desfará ${numItens} lançamento(s) vinculados a esta NF neste empenho, reverterá os saldos e solicitações de compra.\n\nPara prosseguir, você pode opcionalmente digitar uma observação/motivo para esta reversão:`
            : `ATENÇÃO: Deseja realmente desfazer o lançamento de ${log.quantidade_entregue} unidades? Isso reverterá os saldos e solicitações de compra.\n\nPara prosseguir, você pode opcionalmente digitar uma observação/motivo para esta reversão:`

        const obsInput = window.prompt(confirmMsg, "")
        if (obsInput === null) {
            loadingRef.current = false
            return
        }

        setLoading(true)
        setReverting(true)
        setRevertProgress(10)

        const itemIdsAfetados = [...new Set(logsParaDeletar.map(rl => rl.item_id).filter(id => id !== null))] as number[]
        
        let stepsCompleted = 0
        const totalSteps = logsParaDeletar.length * 2 + itemIdsAfetados.length + 1
        const updateProgress = () => {
          stepsCompleted++
          setRevertProgress(Math.min(95, 10 + Math.round((stepsCompleted / totalSteps) * 85)))
        }

        // 1. Reverter saldo na ATA se vinculado (para cada registro afetado)
        for (const rl of logsParaDeletar) {
            if (rl.item_ata_id) {
                const { error: errorUpdateAta } = await supabase.rpc('incrementar_abatimento_ata', {
                    target_item_ata_id: rl.item_ata_id,
                    qtd: -rl.quantidade_entregue // Passamos valor negativo para estornar
                })
                // Fallback se a RPC não existir
                if (errorUpdateAta) {
                    const { data: cur } = await supabase.from('itens_ata').select('quantidade_abatida').eq('id', rl.item_ata_id).single()
                    const novaQtd = (cur?.quantidade_abatida || 0) - (rl.quantidade_entregue || 0)
                    await supabase.from('itens_ata').update({ quantidade_abatida: novaQtd }).eq('id', rl.item_ata_id)
                }
            }
            updateProgress()
        }

        // 2. Excluir os registros de histórico (ou restaurar provisórias oficializadas)
        for (const rl of logsParaDeletar) {
            const obs = rl.motivo_pendencia || ''
            const matchProv = obs.match(/\[PROVISORIO_ORIGEM:\s*([^|\]]+)\|(.*)\]/)
            if (matchProv) {
                const origNumNf = matchProv[1].trim()
                const origMotivo = matchProv[2].trim()
                const { error: errUpd } = await supabase
                    .from('historico_entregas')
                    .update({
                        numero_nf: origNumNf,
                        data_emissao_nf: null,
                        motivo_pendencia: origMotivo
                    })
                    .eq('id', rl.id)
                if (errUpd) throw errUpd
            } else {
                const { error: errDel } = await supabase.from('historico_entregas').delete().eq('id', rl.id)
                if (errDel) throw errDel
            }
            updateProgress()
        }

        // 3. Recalcular saldo e solicitações de compra para cada item afetado
        for (const itemId of itemIdsAfetados) {
            // Buscamos o histórico atualizado do item após o delete
            const { data: novoHistorico } = await supabase.from('historico_entregas').select('quantidade_entregue').eq('item_id', itemId)
            const totalEntregueRestante = (novoHistorico || []).reduce((acc, curr) => acc + (Number(curr.quantidade_entregue) || 0), 0)
            
            // Buscar dados do item
            const { data: itemData } = await supabase.from('itens').select('quantidade').eq('id', itemId).single()
            if (!itemData) {
                updateProgress()
                continue
            }

            const totalPedido = Number(itemData.quantidade) || 0
            const novoSaldoPosEstorno = Math.max(0, totalPedido - totalEntregueRestante)

            // Buscar pedidos existentes
            const { data: pedidosExistentes } = await supabase
                .from('pedidos_compra')
                .select('id, status')
                .eq('item_id', itemId)
                .neq('status', 'COMPRADO')

            if (novoSaldoPosEstorno > 0) {
                // Removemos o status de entregue se houver saldo restante
                await updateItem(itemId, { status_item: null })

                // Reabrir os pedidos de compra que estavam marcados como atendidos
                const { data: pedidosAtendidos } = await supabase
                    .from('pedidos_compra')
                    .select('id')
                    .eq('item_id', itemId)
                    .in('status', ['ATENDIDO'])

                if (pedidosAtendidos && pedidosAtendidos.length > 0) {
                    await supabase
                        .from('pedidos_compra')
                        .update({ status: 'PENDENTE', quantidade_solicitada: novoSaldoPosEstorno })
                        .in('id', pedidosAtendidos.map(p => p.id))
                }
            } else {
                // Se mesmo após estorno o saldo for <= 0
                if (pedidosExistentes && pedidosExistentes.length > 0) {
                    await supabase.from('pedidos_compra').update({ status: 'ATENDIDO', quantidade_solicitada: 0 }).in('id', pedidosExistentes.map(p => p.id))
                }
                await updateItem(itemId, { status_item: 'ENTREGUE' })
            }
            updateProgress()
        }

        // 4. Registrar no log de auditoria
        await logAction('REVERTER_BAIXA_NF', 'historico_entregas', logsParaDeletar[0].id, {
            numero_nf: log.numero_nf || null,
            total_itens: logsParaDeletar.length,
            observacao: obsInput ? obsInput.trim() : null
        })

        // 5. Atualizar status global
        if (item.nota_id) await refreshNotaStatus(item.nota_id)
        updateProgress()

        setRevertProgress(100)
        await new Promise(resolve => setTimeout(resolve, 300))

        toast.success(log.numero_nf ? `NF ${log.numero_nf} revertida! ${logsParaDeletar.length} baixa(s) desfeita(s).` : 'Lançamento estornado com sucesso!')
        buscarHistorico()
        if (onUpdate) onUpdate()
    } catch (err: any) {
        console.error('Erro ao estornar:', err)
        toast.error('Erro ao estornar: ' + (err.message || String(err)))
    } finally {
        loadingRef.current = false
        setLoading(false)
        setReverting(false)
        setRevertProgress(0)
    }
  }

  const handleConfirmarEntregaFisica = async (log: HistoricoEntrega) => {
    if (!window.confirm(`Confirmar que as ${log.quantidade_entregue} unidades da NF ${log.numero_nf || ''} foram fisicamente entregues ao cliente?`)) {
      return
    }

    setLoading(true)
    try {
      const { error } = await supabase
        .from('historico_entregas')
        .update({ 
          itens_entregues: true,
          data_entrega: new Date().toISOString()
        })
        .eq('id', log.id)

      if (error) throw error

      toast.success('Entrega física confirmada com sucesso!')
      buscarHistorico()
      if (onUpdate) onUpdate()
    } catch (err: any) {
      console.error('Erro ao confirmar entrega física:', err)
      toast.error('Erro ao confirmar entrega física: ' + (err.message || String(err)))
    } finally {
      setLoading(false)
    }
  }

  const salvarEntrega = async () => {
    if (loadingRef.current) return
    loadingRef.current = true

    const valorNumerico = Number(qtdEntregueHoje)
    if (statusEntrega !== 'NAO_FORNECIDO' && (isNaN(valorNumerico) || valorNumerico <= 0)) {
        toast.warning('Informe a quantidade entregue.')
        loadingRef.current = false
        return
    }
    // Removemos o bloqueio de saldo para permitir sobrebaixa
    if (valorNumerico > saldoRestante) {
        toast.info(`Nota: Esta entrega de ${valorNumerico} unidades resultará em sobrebaixa (excesso).`)
    }
    
    if (statusEntrega === 'PARCIAL' || statusEntrega === 'NAO_FORNECIDO') {
        if (!motivoCod || motivoCod === 'none') {
            toast.error('Justificativa obrigatória para entregas parciais ou pendentes.')
            loadingRef.current = false
            return
        }
    }

    const obsFinal = motivoCod && motivoCod !== 'none'
        ? `${motivosPendencia[motivoCod as keyof typeof motivosPendencia]} - ${motivo}`.trim() 
        : motivo

    setLoading(true)
    try {
        // Validação de Saldo na ATA (se vinculado)
        if (item.item_ata_id) {
            const { data: itemAta, error: errAta } = await supabase
                .from('itens_ata')
                .select('quantidade_registrada, quantidade_abatida, descricao')
                .eq('id', item.item_ata_id)
                .single()
            
            if (errAta) throw new Error('Erro ao consultar saldo da Ata: ' + errAta.message)
            
            if (itemAta) {
                const saldoAta = (itemAta.quantidade_registrada || 0) - (itemAta.quantidade_abatida || 0)
                if (valorNumerico > saldoAta) {
                    toast.error(`Saldo insuficiente na ATA! Disponível: ${saldoAta}. Tentativa: ${valorNumerico}.`, { duration: 5000 })
                    setLoading(false)
                    return
                }
            }
        }

        const { error } = await supabase.from('historico_entregas').insert([{
            item_id: item.id,
            quantidade_entregue: valorNumerico,
            data_entrega: new Date().toISOString(),
            data_emissao_nf: dataEmissaoNf || null,
            motivo_pendencia: obsFinal || 'Entrega Concluída',
            vendedor_id: user?.id
          }])
        
        if (error) throw error

        // Atualizar saldo na ATA se vinculado
        if (item.item_ata_id && statusEntrega !== 'NAO_FORNECIDO') {
            const { error: errorUpdateAta } = await supabase.rpc('incrementar_abatimento_ata', {
                target_item_ata_id: item.item_ata_id,
                qtd: valorNumerico
            })
            // Fallback se a RPC não existir
            if (errorUpdateAta) {
                const { data: cur } = await supabase.from('itens_ata').select('quantidade_abatida').eq('id', item.item_ata_id).single()
                const novaQtd = (cur?.quantidade_abatida || 0) + valorNumerico
                await supabase.from('itens_ata').update({ quantidade_abatida: novaQtd }).eq('id', item.item_ata_id)
            }
        }

        // AUTOMAÇÃO SOLICITADA PELO USUÁRIO (PÓS LANÇAMENTO)
        const novoSaldo = Math.round(saldoRestante - (statusEntrega === 'NAO_FORNECIDO' ? 0 : valorNumerico))
        
        // Buscar se já existe uma solicitação de compra pendente para este item
        const { data: pedidosExistentes, error: errFetchPed } = await supabase
            .from('pedidos_compra')
            .select('id, status')
            .eq('item_id', item.id)
            .neq('status', 'COMPRADO')
            .neq('status', 'ATENDIDO')

        if (errFetchPed) console.error('Erro ao buscar pedidos existentes:', errFetchPed)

        if (novoSaldo > 0 && motivoCod !== 'FATOR_CAIXA') {
            // DESABILITADO TEMPORARIAMENTE: Não criar/atualizar solicitações automáticas nas baixas parciais
            /*
            const dataLimite = new Date()
            dataLimite.setDate(dataLimite.getDate() + Number(prazoCompraDias))

            const payloadPedido: any = {
                item_id: Number(item.id),
                quantidade_solicitada: Number(novoSaldo),
                usuario_solicitante: profile?.display_name || user?.email || 'Sistema Automático',
                solicitante_id: user?.id,
                categoria: item.categoria,
                observacoes: (`Atualizado via Logística: ${obsFinal}`).substring(0, 500),
                status: 'PENDENTE',
                prazo_limite: dataLimite.toISOString()
            }

            console.log('--- [DEBUG] Payload Pedido Compra:', payloadPedido)

            if (pedidosExistentes && pedidosExistentes.length > 0) {
                // Atualiza o primeiro pedido encontrado e remove duplicatas se houver
                const { error: errUpd } = await supabase
                    .from('pedidos_compra')
                    .update(payloadPedido)
                    .eq('id', pedidosExistentes[0].id)
                
                if (errUpd) {
                    console.error('Erro no UPDATE de pedidos_compra:', errUpd)
                    throw errUpd
                }

                // Limpa duplicatas acidentais
                if (pedidosExistentes.length > 1) {
                    const idsParaRemover = pedidosExistentes.slice(1).map(p => p.id)
                    await supabase.from('pedidos_compra').delete().in('id', idsParaRemover)
                }
                toast.info(`🛒 Pedido de compra atualizado: saldo de ${novoSaldo} ${item.unidade}.`, { duration: 4000 })
            } else {
                // Cria um novo se não existir nenhum
                const { error: errIns } = await supabase.from('pedidos_compra').insert([payloadPedido])
                if (errIns) {
                    console.error('Erro no INSERT de pedidos_compra:', errIns)
                    throw errIns
                }
                toast.info(`🛒 Nova solicitação de ${novoSaldo} ${item.unidade} enviada para compras.`, { duration: 4000 })
            }
            await updateItem(item.id, { status_item: 'SOLICITADO' })
            */
            // Removemos o status de entregue se houver saldo restante
            await updateItem(item.id, { status_item: null })
        } else if (novoSaldo <= 0) {
            // Se o saldo zerou, marca como ATENDIDO no módulo de compras (se existir pedido)
            if (pedidosExistentes && pedidosExistentes.length > 0) {
                const { error: errAtender } = await supabase
                    .from('pedidos_compra')
                    .update({ status: 'ATENDIDO', quantidade_solicitada: 0, observacoes: `Totalmente atendido via Logística. ${obsFinal}` })
                    .in('id', pedidosExistentes.map(p => p.id))
                if (errAtender) console.error('Erro ao marcar como atendido:', errAtender)
            }
            await updateItem(item.id, { status_item: 'ENTREGUE' })
            toast.success('🎉 Item totalmente atendido!')
        }

        // Atualizar status global do empenho
        if (item.nota_id) {
            await refreshNotaStatus(item.nota_id)
        }
        
        toast.success('Fluxo atualizado com sucesso!')
        setQtdEntregueHoje(''); setMotivo(''); setMotivoCod(''); setDataEmissaoNf('')
        buscarHistorico()
        if (onUpdate) onUpdate()
    } catch (err: any) {
        console.error('ERRO CRÍTICO ControleEntrega:', err)
        const message = err?.message || err?.details || String(err)
        toast.error('Erro ao processar: ' + message, { duration: 8000 })
    } finally {
        loadingRef.current = false
        setLoading(false)
    }
}

  const handleCalendarLink = async () => {
    const { gerarLinkGoogleCalendar } = await import('./lib/utils')
    const link = gerarLinkGoogleCalendar(
        `PENDÊNCIA: ${item.descricao}`, 
        `Faltam ${saldoRestante} ${item.unidade}.`, 
        new Date().toISOString().split('T')[0] 
    )
    window.open(link, '_blank')
  }

  return (
    <div className="bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-xl overflow-hidden shadow-lg animate-in fade-in slide-in-from-top-2 duration-300">
        {/* Header com Close Button */}
        <div className="bg-zinc-50 dark:bg-zinc-800/50 px-6 py-4 border-b border-zinc-200 dark:border-zinc-800 flex items-center justify-between">
            <div className="flex items-center gap-3">
                <div className="bg-brand-accent p-2 rounded-lg text-primary-foreground shadow-sm">
                    <Truck className="w-5 h-5" />
                </div>
                <div>
                    <h3 className="text-sm font-bold text-zinc-900 dark:text-zinc-100 uppercase tracking-tight">Fluxo de Logística e Recebimento</h3>
                    <p className="text-[10px] text-zinc-500 font-medium">Controle de saldo, abatimento de ata e compras automáticas</p>
                </div>
            </div>
            {onClose && (
                <Button variant="ghost" size="icon" onClick={onClose} className="h-8 w-8 text-zinc-400 hover:text-zinc-900 dark:hover:text-zinc-100">
                    <X className="w-4 h-4" />
                </Button>
            )}
        </div>

        <div className="p-6 grid grid-cols-1 lg:grid-cols-2 gap-6">
            <div className="space-y-4">

                {/* Progress Mini */}
                <div className="space-y-2">
                    <div className="flex items-center justify-between text-[11px] font-bold">
                        <span className="text-brand-accent opacity-80">{totalEntregue} ENTREGUES</span>
                        <span className="text-brand-accent">{saldoRestante} PENDENTES</span>
                    </div>
                    <Progress value={percentual} className="h-1.5" />
                </div>

                {saldoRestante > 0 ? (
                    <div className="space-y-3 pt-2">
                        <RadioGroup 
                            value={statusEntrega} 
                            onValueChange={(v) => {
                                setStatusEntrega(v as 'TOTAL' | 'PARCIAL' | 'NAO_FORNECIDO')
                                if (v === 'TOTAL') setQtdEntregueHoje(saldoRestante)
                                if (v === 'NAO_FORNECIDO') setQtdEntregueHoje(0)
                                if (v === 'PARCIAL') setQtdEntregueHoje('')
                            }}
                            className="flex gap-4"
                        >
                            <div className="flex items-center space-x-2">
                                <RadioGroupItem value="TOTAL" id={`total-${item.id}`} />
                                <Label htmlFor={`total-${item.id}`} className="text-xs cursor-pointer">Entrega Total</Label>
                            </div>
                            <div className="flex items-center space-x-2">
                                <RadioGroupItem value="PARCIAL" id={`parcial-${item.id}`} />
                                <Label htmlFor={`parcial-${item.id}`} className="text-xs cursor-pointer">Entrega Parcial</Label>
                            </div>
                            <div className="flex items-center space-x-2">
                                <RadioGroupItem value="NAO_FORNECIDO" id={`none-${item.id}`} />
                                <Label htmlFor={`none-${item.id}`} className="text-xs cursor-pointer">Falta Total</Label>
                            </div>
                        </RadioGroup>

                        <div className="grid grid-cols-12 gap-2">
                            <div className="col-span-3">
                                <Label className="text-[10px] uppercase font-bold mb-1 block">Qtd</Label>
                                <Input 
                                    type="number" 
                                    min="0"
                                    step="1"
                                    value={qtdEntregueHoje} 
                                    disabled={statusEntrega !== 'PARCIAL'}
                                    onWheel={(e) => (e.target as HTMLInputElement).blur()}
                                    onChange={e => setQtdEntregueHoje(e.target.value)}
                                    className="h-9 text-xs"
                                />
                            </div>
                            <div className="col-span-4">
                                <Label className="text-[10px] uppercase font-bold mb-1 block text-blue-600">Data NF (Opcional)</Label>
                                <Input 
                                    type="date" 
                                    value={dataEmissaoNf}
                                    onChange={e => setDataEmissaoNf(e.target.value)}
                                    className="h-9 text-xs border-blue-100 bg-blue-50/10 focus:ring-blue-500"
                                />
                            </div>
                            <div className="col-span-12 mt-1">
                                <Label className="text-[10px] uppercase font-bold mb-1 block">Justificativa</Label>
                                <Select value={motivoCod} onValueChange={setMotivoCod}>
                                    <SelectTrigger className="h-9 text-xs w-full">
                                        <SelectValue placeholder="Motivo" />
                                    </SelectTrigger>
                                    <SelectContent>
                                        <SelectItem value="none">-- Motivo --</SelectItem>
                                        {Object.entries(motivosPendencia).map(([k, v]) => (
                                            <SelectItem key={k} value={k}>{v}</SelectItem>
                                        ))}
                                    </SelectContent>
                                </Select>
                            </div>

                            <div className="col-span-12 mt-1">
                                <Input 
                                    placeholder="Complemento da justificativa..." 
                                    value={motivo} 
                                    onChange={e => setMotivo(e.target.value)}
                                    className="h-9 text-xs w-full"
                                />
                            </div>
                        </div>

                        <Button 
                            onClick={salvarEntrega} 
                            disabled={loading} 
                            className="w-full bg-brand-accent hover:opacity-90 text-primary-foreground h-9 text-xs font-bold shadow-lg shadow-brand-accent/20"
                        >
                            {loading ? <Loader2 className="w-3.5 h-3.5 animate-spin mr-2" /> : <CheckCircle2 className="w-3.5 h-3.5 mr-2" />}
                            CONFIRMAR RECEBIMENTO
                        </Button>
                    </div>
                ) : (
                    <div className="p-4 bg-emerald-50 dark:bg-emerald-950/20 border border-emerald-100 rounded-lg flex items-center gap-3">
                        <CheckCircle2 className="w-5 h-5 text-emerald-600" />
                        <span className="text-xs font-bold text-emerald-700 uppercase">Item finalizado com sucesso</span>
                    </div>
                )}
            </div>

            <div className="border-l border-zinc-200 dark:border-zinc-800 pl-6 space-y-3">
                <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2 text-zinc-400">
                        <Clock className="w-4 h-4" />
                        <span className="text-[10px] font-bold uppercase tracking-widest">Histórico de Movimentações</span>
                    </div>
                    <Button variant="ghost" size="sm" onClick={handleCalendarLink} className="h-6 text-[10px] gap-1 text-brand-accent">
                        <Calendar className="w-3 h-3" /> Agenda
                    </Button>
                </div>
                
                <ScrollArea className="h-[250px] w-full pr-4">
                    {historico.length === 0 ? (
                        <p className="text-zinc-400 text-[10px] py-4">Nenhuma movimentação registrada.</p>
                    ) : (
                        <div className="space-y-4">
                            {(() => {
                                const totalPedido = Number(item.quantidade) || 0
                                // Invertemos para exibição (mais recentes no topo) mas preservamos a lógica de soma acumulada cronológica
                                return [...historico].reverse().map((log) => {
                                    // Para o cálculo correto da soma acumulada até este log, precisamos da posição no array original (ordenado asc)
                                    // Mas é mais fácil calcular a soma total e subtrair conforme descemos, ou apenas rodar o loop na ordem certa antes.
                                    
                                    // Cálculo simplificado: a soma acumulada 'runningSum' deve ser baseada na ordem ASC.
                                    // Vamos pré-calcular os estados de sobrebaixa:
                                    const historicoComStatus = []
                                    let currentSum = 0
                                    for (const h of historico) {
                                        const prevSum = currentSum
                                        currentSum += (Number(h.quantidade_entregue) || 0)
                                        let sobrebaixaQtd = 0
                                        if (currentSum > totalPedido) {
                                            sobrebaixaQtd = Math.min(Number(h.quantidade_entregue), currentSum - totalPedido)
                                        }
                                        historicoComStatus.push({ ...h, sobrebaixaQtd, isTotalExcesso: prevSum >= totalPedido })
                                    }

                                    const logWithStatus = historicoComStatus.find(h => h.id === log.id)
                                    if (!logWithStatus) return null

                                    return (
                                        <div key={log.id} className={`text-xs border-l-2 pl-3 pb-4 relative ${log.itens_entregues === false ? 'border-amber-500 bg-amber-500/[0.02]' : logWithStatus.sobrebaixaQtd > 0 ? 'border-amber-400' : 'border-emerald-400'}`}>
                                            <div className="absolute -left-[5px] top-0 w-2 h-2 rounded-full bg-white border-2 border-inherit" />
                                            
                                            <div className="flex-1">
                                                <div className="font-bold flex items-center justify-between gap-1.5 flex-wrap">
                                                    <div className="flex items-center gap-1.5">
                                                        <span className={logWithStatus.sobrebaixaQtd > 0 ? 'text-amber-600' : 'text-emerald-600'}>
                                                            +{log.quantidade_entregue} {item.unidade}
                                                        </span>
                                                        {log.numero_nf && (() => {
                                                            const numUpper = String(log.numero_nf).toUpperCase()
                                                            const isPedido = numUpper.includes('PEDIDO') || numUpper.includes('DAV') || numUpper.includes('PROVISÓRIA') || numUpper.includes('PROVISORIA')
                                                            return (
                                                                <span className="text-[9px] bg-zinc-100 dark:bg-zinc-800 text-zinc-700 dark:text-zinc-300 px-1.5 rounded-sm uppercase border border-zinc-200 dark:border-zinc-800">
                                                                    {isPedido ? log.numero_nf : `NF: ${log.numero_nf}`}
                                                                </span>
                                                            )
                                                        })()}
                                                        {log.itens_entregues === false && (
                                                            <span className="text-[9px] bg-amber-500 text-white px-1.5 rounded-sm uppercase font-black animate-pulse">
                                                                PENDENTE DE ENTREGA FÍSICA
                                                            </span>
                                                        )}
                                                        {(log as any).e_dia_d === true && (
                                                            <span className="text-[9px] bg-gradient-to-r from-amber-500 to-orange-500 text-white px-1.5 rounded-sm uppercase font-black">
                                                                DIA D
                                                            </span>
                                                        )}
                                                        {logWithStatus.sobrebaixaQtd > 0 && (
                                                            <span className="text-[9px] bg-amber-500 text-white px-1.5 rounded-sm uppercase font-black animate-pulse">
                                                                ALERTA: SOBREBAIXA (+{logWithStatus.sobrebaixaQtd})
                                                            </span>
                                                        )}
                                                    </div>
                                                    
                                                    <div className="flex items-center gap-1">
                                                        {log.itens_entregues === false && (
                                                            <Button 
                                                                variant="ghost" 
                                                                size="icon" 
                                                                onClick={() => handleConfirmarEntregaFisica(log)}
                                                                className="h-6 w-6 text-emerald-600 hover:text-emerald-700 hover:bg-emerald-50 dark:hover:bg-emerald-950/30"
                                                                title="Confirmar Entrega Física (Despachar Mercadoria)"
                                                            >
                                                                <CheckCircle2 className="w-3.5 h-3.5" />
                                                            </Button>
                                                        )}
                                                        {canUndo(log) && (
                                                            <Button 
                                                                variant="ghost" 
                                                                size="icon" 
                                                                onClick={() => handleDesfazer(log)}
                                                                className="h-6 w-6 text-red-500 hover:text-red-700 hover:bg-red-50"
                                                                title="Desfazer lançamento"
                                                            >
                                                                <RotateCcw className="w-3.5 h-3.5" />
                                                            </Button>
                                                        )}
                                                    </div>
                                                </div>
                                                <p className="text-[10px] text-zinc-500 leading-tight mt-1 whitespace-pre-wrap">{log.motivo_pendencia}</p>
                                                
                                                <div className="flex items-center gap-3 mt-2">
                                                    <div className="flex flex-col">
                                                        <span className="text-[8px] text-zinc-400 uppercase font-bold">Lançamento</span>
                                                        <span className="text-[9px] text-zinc-600 dark:text-zinc-400 font-medium">
                                                            {log.data_entrega ? new Date(log.data_entrega).toLocaleDateString('pt-BR') : '—'}
                                                        </span>
                                                    </div>
                                                    { (log as any).data_emissao_nf && (
                                                        <div className="flex flex-col">
                                                            <span className="text-[8px] text-blue-400 uppercase font-bold">Emissão NF</span>
                                                            <span className="text-[9px] text-blue-600 font-black">
                                                                {new Date((log as any).data_emissao_nf).toLocaleDateString('pt-BR')}
                                                            </span>
                                                        </div>
                                                    )}
                                                    {log.arquivo_nf_caminho && (
                                                        <a 
                                                            href={`${import.meta.env.VITE_SUPABASE_URL}/storage/v1/object/public/documentos/${log.arquivo_nf_caminho}`}
                                                            target="_blank" 
                                                            rel="noreferrer"
                                                            className="text-[9px] text-blue-500 hover:underline font-bold ml-auto"
                                                        >
                                                            📄 Ver PDF
                                                        </a>
                                                    )}
                                                </div>
                                            </div>
                                        </div>
                                    )
                                })
                            })()}
                        </div>
                    )}
                </ScrollArea>
                
                <div className="p-2.5 bg-amber-50 rounded-lg border border-amber-200 flex items-start gap-2">
                    <AlertCircle className="w-3.5 h-3.5 text-amber-500 mt-0.5" />
                    <p className="text-[9px] text-amber-900 leading-relaxed font-bold uppercase tracking-tight">
                        Sistema em modo de tolerância: Sobrebaixas são aceitas e marcadas cronologicamente por emissão de NF.
                    </p>
                </div>
            </div>
        </div>
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