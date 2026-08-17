import { useState, useEffect } from 'react'
import { supabase } from '../../lib/supabase'
import { Search, FileText, ChevronDown, ChevronRight, MapPin, Package, Layers, ChevronUp, ShieldAlert, RotateCcw, Loader2, Trash2, AlertTriangle } from 'lucide-react'
import { Card } from '../ui/card'
import { Input } from '../ui/input'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '../ui/table'
import { Badge } from '../ui/badge'
import { Button } from '../ui/button'
import { Progress } from '../ui/progress'
import { toast } from 'sonner'
import { formatCurrency } from '../../lib/utils'
import { useAuth } from '../../AuthContext'
import { canDeleteBaixa } from '../../lib/permissions'
import { logAction } from '../../lib/logger'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '../ui/dialog'

export function VendedorHistory() {
  const { profile, isSuperAdmin } = useAuth()
  const [vendas, setVendas] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [searchTerm, setSearchTerm] = useState('')
  const [expandedMun, setExpandedMun] = useState<Set<string>>(new Set())
  const [expandedNF, setExpandedNF] = useState<Set<string>>(new Set())
  
  const [confirmNF, setConfirmNF] = useState<{ numero_nf: string; registros: any[] } | null>(null)
  const [reverting, setReverting] = useState(false)
  const [revertProgress, setRevertProgress] = useState(0)
  const [observacaoReversao, setObservacaoReversao] = useState('')

  const [isDev, setIsDev] = useState(false)

  useEffect(() => {
    loadHistory()
  }, [])

  async function loadHistory() {
    try {
      setLoading(true)
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) return

      // Buscar nível do usuário para verificar se é DEV
      const { data: profileData } = await supabase
        .from('profiles')
        .select('nivel')
        .eq('id', user.id)
        .single()
      
      const isUserDev = profileData?.nivel === 'DEV'
      setIsDev(isUserDev)

      // Busca o histórico com joins profundos para pegar entidade/municipio
      let query = supabase
        .from('historico_entregas')
        .select(`
          *,
          item_ata:itens_ata(
            id,
            descricao, 
            valor_unitario,
            ata:atas(
              id,
              numero_arp,
              assigned_to,
              entidade:entidades(nome, municipio)
            )
          ),
          item_empenho:itens(
            id,
            descricao, 
            valor_unitario,
            nota:notas(
              id,
              numero_ne,
              assigned_to,
              entidade:entidades(nome, municipio)
            )
          )
        `)
      
      if (!isUserDev) {
        query = query.eq('vendedor_id', user.id)
      }

      const { data, error } = await query.order('data_entrega', { ascending: false })

      if (error) throw error
      setVendas(data || [])
      
      // Auto-expandir os primeiros grupos? Opcional.
    } catch (err) {
      console.error('Erro ao carregar histórico:', err)
      toast.error('Erro ao carregar histórico de vendas')
    } finally {
      setLoading(false)
    }
  }

  const handleReverter = async () => {
    if (!confirmNF) return
    setReverting(true)
    setRevertProgress(10)
    try {
      const ids = confirmNF.registros.map(r => r.id)
      const itemIds = [...new Set(confirmNF.registros.map(r => r.item_id).filter(id => id && id > 0))]

      let stepsCompleted = 0
      const totalSteps = confirmNF.registros.length + 1 + itemIds.length + 1
      const updateProgress = () => {
        stepsCompleted++
        setRevertProgress(Math.min(95, 10 + Math.round((stepsCompleted / totalSteps) * 85)))
      }

      // 1. Desfazer abatimento na ATA (para itens vinculados a ATA)
      for (const reg of confirmNF.registros) {
        if (reg.item_ata_id) {
          const { error: errRpc } = await supabase.rpc('incrementar_abatimento_ata', {
            target_item_ata_id: reg.item_ata_id,
            qtd: -reg.quantidade_entregue // negativo = devolver
          })
          if (errRpc) throw errRpc
        }
        updateProgress()
      }

      // 2. Deletar os registros do historico_entregas
      const { error } = await supabase
        .from('historico_entregas')
        .delete()
        .in('id', ids)

      if (error) throw error
      updateProgress()

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

      // 4. Registrar no log de auditoria
      await logAction('REVERTER_BAIXA_NF', 'historico_entregas', confirmNF.registros[0].id, {
        numero_nf: confirmNF.numero_nf,
        total_itens: confirmNF.registros.length,
        observacao: observacaoReversao ? observacaoReversao.trim() : null
      })
      updateProgress()

      setRevertProgress(100)
      await new Promise(resolve => setTimeout(resolve, 300))

      toast.success(`NF ${confirmNF.numero_nf} revertida com sucesso!`)
      setConfirmNF(null)
      setObservacaoReversao('')
      loadHistory()
    } catch (err: any) {
      console.error(err)
      toast.error('Erro ao reverter NF: ' + err.message)
    } finally {
      setReverting(false)
      setRevertProgress(0)
    }
  }

  const filteredVendas = vendas.filter(v => {
    const desc = (v.item_ata?.descricao || v.item_empenho?.descricao || v.itens?.descricao || '').toLowerCase()
    const nf = (v.numero_nf || '').toLowerCase()
    const entidade = (v.item_ata?.ata?.entidade?.nome || v.item_empenho?.nota?.entidade?.nome || '').toLowerCase()
    const municipio = (v.item_ata?.ata?.entidade?.municipio || v.item_empenho?.nota?.entidade?.municipio || '').toLowerCase()

    return desc.includes(searchTerm.toLowerCase()) || 
           nf.includes(searchTerm.toLowerCase()) ||
           entidade.includes(searchTerm.toLowerCase()) ||
           municipio.includes(searchTerm.toLowerCase())
  })

  // Agrupamento: Município -> NF -> Itens
  const groupedData: Record<string, Record<string, any[]>> = filteredVendas.reduce((acc: Record<string, Record<string, any[]>>, v: any) => {
    const entidade = v.item_ata?.ata?.entidade || v.item_empenho?.nota?.entidade
    const munKey = entidade ? `${entidade.municipio || ''} - ${entidade.nome || ''}`.trim() : 'ÓRGÃO NÃO IDENTIFICADO'
    const nfKey = v.numero_nf || 'SEM NOTA FISCAL'

    if (!acc[munKey]) acc[munKey] = {}
    if (!acc[munKey][nfKey]) acc[munKey][nfKey] = []
    
    acc[munKey][nfKey].push(v)
    return acc
  }, {})

  const toggleMun = (mun: string) => {
    setExpandedMun(prev => {
      const next = new Set(prev)
      if (next.has(mun)) next.delete(mun)
      else next.add(mun)
      return next
    })
  }

  const toggleNF = (nf: string) => {
    setExpandedNF(prev => {
      const next = new Set(prev)
      if (next.has(nf)) next.delete(nf)
      else next.add(nf)
      return next
    })
  }

  const expandAll = () => {
    const muns = new Set(Object.keys(groupedData))
    const nfs = new Set<string>()
    Object.values(groupedData).forEach((munGroup: Record<string, any[]>) => {
      Object.keys(munGroup).forEach(nf => nfs.add(nf))
    })
    setExpandedMun(muns)
    setExpandedNF(nfs)
  }

  const collapseAll = () => {
    setExpandedMun(new Set())
    setExpandedNF(new Set())
  }

  if (loading) {
    return (
      <div className="flex flex-col items-center justify-center py-20 text-zinc-400">
        <div className="w-8 h-8 border-4 border-brand-accent border-t-transparent rounded-full animate-spin mb-4" />
        <p className="font-medium animate-pulse">Carregando seu histórico...</p>
      </div>
    )
  }

  return (
    <div className="space-y-4">
      {isDev && (
        <div className="bg-gradient-to-r from-violet-500/10 to-cyan-500/10 border border-violet-500/20 rounded-xl p-3.5 flex items-center justify-between animate-in fade-in slide-in-from-top-3 duration-500 print:hidden shadow-sm">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-violet-500 to-cyan-500 flex items-center justify-center text-white shadow-md shadow-violet-500/20 flex-shrink-0">
              <ShieldAlert className="w-4.5 h-4.5" />
            </div>
            <div>
              <p className="text-xs font-black text-violet-950 dark:text-violet-300 uppercase tracking-wide">Painel Administrativo Ativo</p>
              <p className="text-[10px] text-zinc-500 dark:text-zinc-400 mt-0.5 font-medium">Você possui nível de acesso DEV e está visualizando o histórico de vendas de todas as NFs cadastradas no sistema.</p>
            </div>
          </div>
          <Badge className="bg-violet-600 hover:bg-violet-700 text-white font-bold text-[9px] uppercase tracking-wider px-2.5 py-0.5 rounded-full shadow-sm animate-pulse flex-shrink-0">
            ADMIN VIEW
          </Badge>
        </div>
      )}

      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-zinc-400" />
          <Input 
            placeholder="Filtrar por NF, município, cliente ou item..." 
            className="pl-10 bg-white shadow-sm border-zinc-200"
            value={searchTerm}
            onChange={(e: React.ChangeEvent<HTMLInputElement>) => setSearchTerm(e.target.value)}
          />
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm" onClick={expandAll} className="text-xs h-9 gap-2">
            <Layers className="w-3.5 h-3.5" /> Expandir Tudo
          </Button>
          <Button variant="outline" size="sm" onClick={collapseAll} className="text-xs h-9 gap-2">
            <ChevronUp className="w-3.5 h-3.5" /> Recolher Tudo
          </Button>
        </div>
      </div>

      <div className="space-y-4">
        {Object.keys(groupedData).length === 0 ? (
          <Card className="p-12 text-center text-zinc-400 border-dashed border-2 border-zinc-200 shadow-none">
            <Package className="w-12 h-12 mx-auto mb-3 opacity-20" />
            <p className="font-medium text-sm">Nenhuma venda encontrada no seu histórico.</p>
          </Card>
        ) : (
          Object.entries(groupedData).map(([munName, nfs]) => {
            const isMunExpanded = expandedMun.has(munName)
            const nfCount = Object.keys(nfs as object).length
            
            return (
              <Card key={munName} className="border-zinc-200 shadow-sm overflow-hidden bg-white">
                {/* Header Município */}
                <div 
                  className="flex items-center justify-between p-4 bg-zinc-50/50 cursor-pointer hover:bg-zinc-100 transition-colors border-b border-zinc-100"
                  onClick={() => toggleMun(munName)}
                >
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 rounded-lg bg-blue-50 flex items-center justify-center text-blue-600">
                      <MapPin className="w-5 h-5" />
                    </div>
                    <div>
                      <h3 className="font-bold text-sm text-zinc-900">{munName}</h3>
                      <p className="text-[10px] text-zinc-500 font-bold uppercase tracking-wider">{nfCount} Nota(s) Fiscal(is)</p>
                    </div>
                  </div>
                  <div className="flex items-center gap-4">
                    <span className="text-[10px] text-zinc-400 font-bold uppercase tracking-widest">
                      {isMunExpanded ? 'Recolher' : 'Expandir'}
                    </span>
                    <ChevronDown className={`w-5 h-5 text-zinc-400 transition-transform duration-300 ${isMunExpanded ? '' : '-rotate-90'}`} />
                  </div>
                </div>

                {/* Lista de NFs */}
                {isMunExpanded && (
                  <div className="divide-y divide-zinc-100">
                    {Object.entries(nfs as Record<string, any[]>).map(([nfNum, items]) => {
                      const isNfExpanded = expandedNF.has(nfNum)
                      const nfTotal = items.reduce((acc: number, v: any) => {
                        const item = v.item_ata || v.item_empenho
                        return acc + ((item?.valor_unitario || 0) * v.quantidade_entregue)
                      }, 0)
                      const dataNF = items[0]?.data_entrega

                      return (
                        <div key={nfNum} className="bg-white">
                          <div 
                            className="flex items-center justify-between px-6 py-3 cursor-pointer hover:bg-zinc-50 transition-colors"
                            onClick={() => toggleNF(nfNum)}
                          >
                            <div className="flex items-center gap-4">
                              <div className="w-8 h-8 rounded-md bg-zinc-100 flex items-center justify-center text-zinc-500">
                                <FileText className="w-4 h-4" />
                              </div>
                              <div>
                                <div className="flex items-center gap-2">
                                  <span className="font-bold text-sm text-zinc-700">NF {nfNum}</span>
                                  {dataNF && (
                                    <Badge variant="outline" className="text-[9px] bg-zinc-50 py-0 h-4 font-medium border-zinc-200">
                                      {new Date(dataNF).toLocaleDateString('pt-BR')}
                                    </Badge>
                                  )}
                                </div>
                                <div className="text-[10px] text-zinc-400 font-medium">
                                  {items.length} item(ns) na nota
                                </div>
                              </div>
                            </div>
                            <div className="flex items-center gap-6" onClick={(e) => e.stopPropagation()}>
                              <div className="text-right">
                                <p className="text-[9px] text-zinc-400 font-black uppercase tracking-widest leading-none mb-0.5">Total da Nota</p>
                                <p className="text-sm font-black text-brand-accent">{formatCurrency(nfTotal)}</p>
                              </div>

                              {items.length > 0 && canDeleteBaixa(profile, isSuperAdmin, items[0]) && (
                                <Button
                                  variant="ghost"
                                  size="sm"
                                  onClick={() => setConfirmNF({ numero_nf: nfNum, registros: items })}
                                  className="h-8 text-xs text-red-500 hover:text-red-600 hover:bg-red-50 font-bold px-2 flex items-center gap-1.5 rounded-lg border border-red-100 dark:border-red-900/30 transition-all"
                                >
                                  <RotateCcw className="w-3.5 h-3.5" />
                                  Reverter
                                </Button>
                              )}

                              <ChevronRight 
                                className={`w-4 h-4 text-zinc-300 cursor-pointer transition-transform duration-300 ${isNfExpanded ? 'rotate-90' : ''}`} 
                                onClick={() => toggleNF(nfNum)}
                              />
                            </div>
                          </div>

                          {/* Tabela de Itens */}
                          {isNfExpanded && (
                            <div className="px-6 pb-4 animate-in slide-in-from-top-2 duration-200">
                              <div className="rounded-lg border border-zinc-100 overflow-hidden">
                                <Table>
                                  <TableHeader className="bg-zinc-50/80">
                                    <TableRow className="hover:bg-transparent border-b-zinc-100">
                                      <TableHead className="text-[10px] font-black uppercase py-2">Item / Descrição</TableHead>
                                      <TableHead className="text-[10px] font-black uppercase py-2">Tipo</TableHead>
                                      <TableHead className="text-[10px] font-black uppercase py-2 text-right">Qtd</TableHead>
                                      <TableHead className="text-[10px] font-black uppercase py-2 text-right">V. Unit</TableHead>
                                      <TableHead className="text-[10px] font-black uppercase py-2 text-right">Total</TableHead>
                                    </TableRow>
                                  </TableHeader>
                                  <TableBody>
                                    {(items as any[]).map((v) => {
                                      const item = v.item_ata || v.item_empenho
                                      const total = (item?.valor_unitario || 0) * v.quantidade_entregue
                                      return (
                                        <TableRow key={v.id} className="hover:bg-zinc-50/30 border-b-zinc-50">
                                          <TableCell className="py-2">
                                            <p className="text-xs font-medium text-zinc-700 leading-tight" title={item?.descricao}>
                                              {item?.descricao || 'Item não identificado'}
                                            </p>
                                          </TableCell>
                                          <TableCell className="py-2">
                                            <Badge variant={v.venda_tipo === 'DIRETA_ATA' ? 'outline' : 'secondary'} className="text-[9px] px-1.5 py-0 h-4 uppercase font-bold">
                                              {v.venda_tipo === 'DIRETA_ATA' ? 'Venda Direta' : 'Empenho'}
                                            </Badge>
                                          </TableCell>
                                          <TableCell className="py-2 text-right font-bold text-xs">
                                            {v.quantidade_entregue.toLocaleString('pt-BR')}
                                          </TableCell>
                                          <TableCell className="py-2 text-right text-[10px] text-zinc-500">
                                            {formatCurrency(item?.valor_unitario || 0)}
                                          </TableCell>
                                          <TableCell className="py-2 text-right font-bold text-xs text-zinc-900">
                                            {formatCurrency(total)}
                                          </TableCell>
                                        </TableRow>
                                      )
                                    })}
                                  </TableBody>
                                </Table>
                              </div>
                            </div>
                          )}
                        </div>
                      )
                    })}
                  </div>
                )}
              </Card>
            )
          })
        )}
      </div>

      {/* Dialog de confirmação de Reversão */}
      <Dialog open={!!confirmNF} onOpenChange={(open) => { if (!open) { setConfirmNF(null); setObservacaoReversao(''); } }}>
        <DialogContent className="w-full max-w-[95vw] sm:max-w-[580px] max-h-[90vh] flex flex-col gap-0 p-0 overflow-hidden bg-white dark:bg-zinc-950">
          
          <DialogHeader className="px-6 pt-6 pb-4 border-b border-zinc-100 dark:border-zinc-800 flex-shrink-0">
            <DialogTitle className="flex items-center gap-2 text-red-600 text-base font-bold uppercase">
              <AlertTriangle className="w-5 h-5 flex-shrink-0" />
              Reverter Baixa da NF {confirmNF?.numero_nf}?
            </DialogTitle>
          </DialogHeader>

          <div className="flex-1 overflow-y-auto px-6 py-4 space-y-4 min-h-0">
            <div className="bg-amber-50 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-900 rounded-xl p-4 space-y-2">
              <p className="text-sm font-bold text-amber-800 dark:text-amber-400">Esta ação irá:</p>
              <ul className="text-xs text-amber-700 dark:text-amber-400 space-y-1 list-disc list-inside">
                <li>Remover {confirmNF?.registros.length} registro(s) do histórico de entregas</li>
                <li>Devolver a quantidade ao saldo real da ATA ou empenho</li>
                <li>Reabrir pedidos de compra que estavam marcados como atendidos</li>
              </ul>
            </div>

            <div className="space-y-2">
              <p className="text-xs font-bold uppercase text-zinc-500 tracking-wider">Itens que serão revertidos:</p>
              <div className="space-y-1.5">
                {confirmNF?.registros.map(reg => {
                  const item = reg.item_ata || reg.item_empenho
                  return (
                    <div key={reg.id} className="flex items-start justify-between gap-3 text-xs bg-zinc-50 dark:bg-zinc-900 p-2.5 rounded-lg border border-zinc-100 dark:border-zinc-800">
                      <span className="text-zinc-700 dark:text-zinc-300 flex-1 leading-relaxed">{item?.descricao || 'Item não identificado'}</span>
                      <span className="font-bold text-red-500 whitespace-nowrap flex-shrink-0">−{reg.quantidade_entregue.toLocaleString('pt-BR')} un</span>
                    </div>
                  )
                })}
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

          <div className="px-6 py-4 border-t border-zinc-100 dark:border-zinc-800 flex items-center justify-end gap-3 flex-shrink-0 bg-white dark:bg-zinc-950">
            <Button variant="ghost" size="sm" onClick={() => { setConfirmNF(null); setObservacaoReversao(''); }}>
              Cancelar
            </Button>
            <Button
              variant="destructive"
              size="sm"
              onClick={handleReverter}
              disabled={reverting}
              className="gap-2 font-bold uppercase"
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
